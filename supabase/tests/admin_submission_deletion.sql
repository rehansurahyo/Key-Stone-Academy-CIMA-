begin;
create temporary table deletion_users(kind text primary key,id uuid default gen_random_uuid());
insert into deletion_users(kind) values('student'),('other'),('tutor'),('admin'),('suspended');
insert into auth.users(id,email) select id,id::text||'@example.invalid' from deletion_users;
update public.profiles set role='admin' where id in(select id from deletion_users where kind in('admin','suspended'));
update public.profiles set is_active=false where id=(select id from deletion_users where kind='suspended');
update public.profiles set role='tutor' where id=(select id from deletion_users where kind='tutor');
update public.profiles set access_type='enrolled',assigned_level='SCS';
update public.profiles set access_type='trial',trial_exam_id='00000000-0000-4000-8000-000000000001'
  where id=(select id from deletion_users where kind='student');
insert into public.free_trial_leads(full_name,email,phone,target_level,user_id)
  select 'Deletion trial','deletion@example.test','+923001234567','SCS',id from deletion_users where kind='student';
create temporary table deletion_records(kind text primary key,session_id uuid default gen_random_uuid(),submission_id uuid);
insert into deletion_records(kind) values('target'),('same_student'),('other_student'),('unfinished');
grant select on deletion_users,deletion_records to authenticated;
select set_config('request.jwt.claim.sub',(select id::text from deletion_users where kind='admin'),true);
insert into public.exam_sessions(id,user_id,status)
  select session_id,(select id from deletion_users where kind=case when r.kind='other_student' then 'other' else 'student' end),'in_progress' from deletion_records r;
insert into public.exam_answers(session_id,question_id,answer_text)
  select session_id,'section-1','Answers to preserve unless selected: '||kind from deletion_records;
update public.exam_sessions set status='completed',ended_at=now() where id in(select session_id from deletion_records where kind<>'unfinished');
update deletion_records r set submission_id=s.id from public.submissions s where s.session_id=r.session_id;
-- A corrupt/manual incomplete submission must not become a back door to delete
-- an in-progress attempt. Normal completion never creates this state.
insert into public.submissions(session_id,student_id,exam_id)
  select s.id,s.user_id,s.exam_id from public.exam_sessions s join deletion_records r on r.session_id=s.id where r.kind='unfinished';
update deletion_records r set submission_id=s.id from public.submissions s where s.session_id=r.session_id;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select id::text from deletion_users where kind='tutor'),true);
select public.save_tutor_evaluation((select submission_id from deletion_records where kind='target'),75,'Published feedback','published',0);
do $$
declare sid uuid := (select submission_id from deletion_records where kind='target'); path text;
begin
  path:=auth.uid()::text||'/'||sid::text||'/feedback.pdf';
  insert into storage.objects(bucket_id,name) values('graded-reports',path);
  perform public.attach_submission_report(sid,path,'feedback.pdf','application/pdf',1024);
  sid:=(select submission_id from deletion_records where kind='other_student');
  path:=auth.uid()::text||'/'||sid::text||'/keep.docx';
  insert into storage.objects(bucket_id,name) values('graded-reports',path);
  perform public.attach_submission_report(sid,path,'keep.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',1024);
end $$;
-- Direct deletes remain forbidden; neither UI visibility nor the API is the
-- sole authorization boundary. Test the actual SECURITY DEFINER entry points.
do $$ declare test_kind text; begin
  foreach test_kind in array array['student','other','tutor','suspended'] loop
    perform set_config('request.jwt.claim.sub',(select id::text from deletion_users u where u.kind=test_kind),true);
    begin perform public.delete_exam_submission((select submission_id from deletion_records where deletion_records.kind='target'),1);
      raise exception 'FAIL: non-admin deletion allowed'; exception when insufficient_privilege then null; end;
    begin perform public.ack_submission_report_cleanup((select submission_id from deletion_records where deletion_records.kind='target'),'{}');
      raise exception 'FAIL: non-admin acknowledgment allowed'; exception when insufficient_privilege then null; end;
    if exists(select 1 from public.submission_deletions) then raise exception 'FAIL: audit visible to non-admin'; end if;
  end loop;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from deletion_users where kind='admin'),true);
do $$
declare sid uuid := (select submission_id from deletion_records where kind='target'); result jsonb; paths text[];
begin
  begin delete from public.exam_sessions where id=(select session_id from deletion_records where kind='target');
    raise exception 'FAIL: unscoped direct session deletion permitted'; exception when insufficient_privilege then null; end;
  begin perform public.delete_exam_submission(sid,0); raise exception 'FAIL: stale revision deleted'; exception when serialization_failure then null; end;
  begin perform public.delete_exam_submission(sid,null); raise exception 'FAIL: null revision deleted'; exception when invalid_parameter_value then null; end;
  begin perform public.delete_exam_submission(gen_random_uuid(),0); raise exception 'FAIL: missing submission accepted'; exception when no_data_found then null; end;
  begin perform public.delete_exam_submission((select submission_id from deletion_records where kind='unfinished'),0);
    raise exception 'FAIL: in-progress attempt deleted'; exception when check_violation then null; end;
  if exists(select 1 from public.submission_deletions) then raise exception 'FAIL: rejected deletion left audit/outbox'; end if;
  result:=public.delete_exam_submission(sid,1);
  if jsonb_array_length(result->'pending_report_paths')<>1 then raise exception 'FAIL: attached file not queued'; end if;
  select pending_report_paths into paths from public.submission_deletions where submission_id=sid;
  if public.ack_submission_report_cleanup(sid,paths)<>1 then raise exception 'FAIL: live Storage object falsely acknowledged'; end if;
  if public.delete_exam_submission(sid,1)<>result then raise exception 'FAIL: retry did not return same cleanup job'; end if;
  begin perform public.delete_exam_submission(sid,0); raise exception 'FAIL: wrong-revision retry accepted'; exception when serialization_failure then null; end;
  if exists(select 1 from public.submissions where id=sid)
    or exists(select 1 from public.exam_sessions where id=(select session_id from deletion_records where kind='target'))
    or exists(select 1 from public.exam_answers where session_id=(select session_id from deletion_records where kind='target'))
    or exists(select 1 from public.tutor_evaluations where submission_id=sid)
    or exists(select 1 from public.submission_reports where submission_id=sid) then
    raise exception 'FAIL: selected attempt did not cascade completely';
  end if;
  if (select count(*) from public.exam_answers where session_id in(select session_id from deletion_records where kind in('same_student','other_student')))<>2 then
    raise exception 'FAIL: another attempt lost answers'; end if;
  if (select count(*) from public.profiles where id in(select id from deletion_users))<>5 then raise exception 'FAIL: account deleted'; end if;
  if not exists(select 1 from public.profiles where id=(select id from deletion_users where kind='student') and access_type='trial' and trial_exam_id='00000000-0000-4000-8000-000000000001') then raise exception 'FAIL: trial grant changed'; end if;
  if not exists(select 1 from public.free_trial_leads where email='deletion@example.test') then raise exception 'FAIL: lead deleted'; end if;
  if not exists(select 1 from public.exams where id='00000000-0000-4000-8000-000000000001') then raise exception 'FAIL: exam deleted'; end if;
  if (select count(*) from public.submission_reports where submission_id=(select submission_id from deletion_records where kind='other_student'))<>1 then
    raise exception 'FAIL: another submission lost its report'; end if;
end $$;
-- Simulate the Storage service removing bytes + metadata, not SQL application
-- cleanup. Production uses storage.remove(), never direct storage.objects SQL.
reset role;
do $$ begin
  if (select count(*) from public.exam_answers where session_id in(select session_id from deletion_records where kind<>'target'))<>3 then
    raise exception 'FAIL: another completed or in-progress attempt lost answers'; end if;
end $$;
insert into public.exam_materials(exam_id,name,kind,storage_path)
  values('00000000-0000-4000-8000-000000000001','Preserved shared exam PDF','preseen','delete-test/shared.pdf');
insert into storage.objects(bucket_id,name) values('exam-materials','delete-test/shared.pdf');
delete from storage.objects where bucket_id='graded-reports' and name=any(
  (select pending_report_paths from public.submission_deletions where submission_id=(select submission_id from deletion_records where kind='target'))::text[]);
set local role authenticated;
do $$ begin
  if public.ack_submission_report_cleanup((select submission_id from deletion_records where kind='target'),
    (select pending_report_paths from public.submission_deletions where submission_id=(select submission_id from deletion_records where kind='target')))<>0 then
    raise exception 'FAIL: removed report remains pending'; end if;
  if (public.delete_exam_submission((select submission_id from deletion_records where kind='target'),1)->'pending_report_paths')<>'[]'::jsonb then
    raise exception 'FAIL: completed retry is not idempotent'; end if;
  if not exists(select 1 from storage.objects where bucket_id='graded-reports' and split_part(name,'/',2)=(select submission_id::text from deletion_records where kind='other_student'))
    or not exists(select 1 from storage.objects where bucket_id='exam-materials' and name='delete-test/shared.pdf') then
    raise exception 'FAIL: cleanup removed another report or shared PDF'; end if;
end $$;
rollback;

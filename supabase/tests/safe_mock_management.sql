-- Run AFTER 20261008_safe_mock_management.sql; everything rolls back.
begin;
create temporary table management_users(role text primary key,id uuid default gen_random_uuid());
insert into management_users(role) values('student'),('other_student'),('tutor'),('admin'),('inactive');
insert into auth.users(id,email,raw_user_meta_data) select id,'management-test-'||id||'@example.invalid','{}'::jsonb from management_users;
update public.profiles set role='tutor' where id in(select id from management_users where role in('tutor','inactive'));
update public.profiles set role='admin' where id in(select id from management_users where role='admin');
update public.profiles set is_active=false where id in(select id from management_users where role='inactive');
create temporary table management_exams(kind text primary key,id uuid default gen_random_uuid());
insert into management_exams(kind) values('used'),('unused'),('copy');
create temporary table management_session(id uuid default gen_random_uuid());
insert into management_session default values;
insert into storage.objects(bucket_id,name)
select 'exam-materials',id::text||'/unattached-other/reference.pdf' from management_users where role='other_student';
grant select,update on management_exams to authenticated;
grant select on management_users,management_session to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select id::text from management_users where role='tutor'),true);
do $$
declare path text:=auth.uid()::text||'/management-test/reference.pdf'; paper jsonb;
begin
  insert into storage.objects(bucket_id,name) values('exam-materials',path);
  paper:='[{"question_id":"section-1","position":1,"duration_seconds":3600,"content":{"subject":"Original","subtasks":[{"description":"Original task","weightage":100}],"weightageUnit":"percent"}}]';
  perform public.create_mock_exam((select id from management_exams where kind='used'),'Used paper','','published',paper,
    jsonb_build_array(jsonb_build_object('name','reference.pdf','kind','reference','question_id','section-1','storage_path',path)));
  perform public.create_mock_exam((select id from management_exams where kind='unused'),'Unused paper','','published',paper,'[]');
end;
$$;
select set_config('request.jwt.claim.sub',(select id::text from management_users where role='student'),true);
insert into public.exam_sessions(id,user_id,exam_id,status)
select s.id,auth.uid(),e.id,'in_progress' from management_session s,management_exams e where e.kind='used';
insert into public.exam_answers(session_id,question_id,answer_text) select id,'section-1','Preserved answer' from management_session;

select set_config('request.jwt.claim.sub',(select id::text from management_users where role='admin'),true);
select public.manage_mock_exam((select id from management_exams where kind='used'),'unpublish',1);
do $$
declare result jsonb; revised jsonb; path text;
begin
  if (public.get_mock_attempt_counts(array[(select id from management_exams where kind='used')])->0->>'attempt_count')::integer<>1 then raise exception 'FAIL: active attempts hidden from staff count'; end if;
  revised:='[{"question_id":"section-1","position":1,"duration_seconds":1800,"content":{"subject":"Revised","subtasks":[{"description":"Revised task","weightage":25}],"weightageUnit":"marks"}}]';
  select storage_path into path from public.exam_materials where exam_id=(select id from management_exams where kind='used');
  result:=public.save_mock_exam((select id from management_exams where kind='used'),2,'Revised draft','',revised,
    jsonb_build_array(jsonb_build_object('name','reference.pdf','kind','reference','question_id','section-1','storage_path',path)));
  update management_exams set id=(result->>'id')::uuid where kind='copy';
  if result->>'action'<>'copied' or not exists(select 1 from public.exams where id=(result->>'id')::uuid and status='draft' and copied_from=(select id from management_exams where kind='used')) then raise exception 'FAIL: attempted edit did not create a draft copy'; end if;
  if (select content->>'subject' from public.exam_questions where exam_id=(select id from management_exams where kind='used'))<>'Original' then raise exception 'FAIL: original content overwritten'; end if;
  if (select count(*) from public.exam_materials where storage_path=path)<>2 then raise exception 'FAIL: shared PDF mappings not copied'; end if;
  -- An unused published mock becomes a draft; content and timers can be revised.
  result:=public.save_mock_exam((select id from management_exams where kind='unused'),1,'Updated unused','',revised,'[]');
  if result->>'action'<>'updated' or not exists(select 1 from public.exams where id=(select id from management_exams where kind='unused') and status='draft' and revision=2) then raise exception 'FAIL: unused edit not saved in place as draft'; end if;
  begin
    perform public.save_mock_exam((select id from management_exams where kind='unused'),1,'Stale','',revised,'[]');
    raise exception 'FAIL: stale edit accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.save_mock_exam((select id from management_exams where kind='unused'),2,'Invalid','',
      '[{"question_id":"q1","position":1,"duration_seconds":3600,"content":{"subtasks":[{"description":"Invalid total","weightage":99}]}}]','[]');
    raise exception 'FAIL: invalid content accepted';
  exception when check_violation then null; end;
  if not exists(select 1 from public.exams where id=(select id from management_exams where kind='unused') and name='Updated unused' and revision=2) then raise exception 'FAIL: failed edit not rolled back'; end if;
  begin
    perform public.save_mock_exam((select id from management_exams where kind='unused'),2,'Stolen PDF','',revised,
      jsonb_build_array(jsonb_build_object('name','stolen.pdf','kind','reference','question_id','section-1','storage_path',(select id::text||'/unattached-other/reference.pdf' from management_users where role='other_student'))));
    raise exception 'FAIL: unrelated PDF was accepted';
  exception when insufficient_privilege then null; end;
  -- Clone references remain intact if their unused copy is deleted.
  result:=public.manage_mock_exam((select id from management_exams where kind='copy'),'remove',0);
  if result->>'action'<>'deleted' or not exists(select 1 from storage.objects where name=path) or not exists(select 1 from public.exam_materials where storage_path=path) then raise exception 'FAIL: deleting copy broke original PDF'; end if;
  result:=public.manage_mock_exam((select id from management_exams where kind='unused'),'remove',2);
  if result->>'action'<>'deleted' or exists(select 1 from public.exams where id=(select id from management_exams where kind='unused')) then raise exception 'FAIL: unused mock not deleted'; end if;
end;
$$;

select set_config('request.jwt.claim.sub',(select id::text from management_users where role='student'),true);
do $$
begin
  if not exists(select 1 from public.exams where id=(select id from management_exams where kind='used') and status='draft') or not exists(select 1 from public.exam_questions where exam_id=(select id from management_exams where kind='used')) then raise exception 'FAIL: own unpublished attempt inaccessible'; end if;
  if not exists(select 1 from storage.objects where name in(select storage_path from public.exam_materials where exam_id=(select id from management_exams where kind='used'))) then raise exception 'FAIL: own unpublished PDF inaccessible'; end if;
  update public.exam_answers set answer_text='Continued after unpublish' where session_id=(select id from management_session);
  begin
    insert into public.exam_sessions(user_id,exam_id,status) values(auth.uid(),(select id from management_exams where kind='used'),'in_progress');
    raise exception 'FAIL: new attempt started on unpublished exam';
  exception when insufficient_privilege then null; end;
  begin
    perform public.manage_mock_exam((select id from management_exams where kind='used'),'remove',2);
    raise exception 'FAIL: student removed a mock';
  exception when insufficient_privilege then null; end;
end;
$$;
select set_config('request.jwt.claim.sub',(select id::text from management_users where role='other_student'),true);
do $$ begin
  if exists(select 1 from public.exams where id=(select id from management_exams where kind='used')) then raise exception 'FAIL: another student sees unpublished paper'; end if;
end; $$;
select set_config('request.jwt.claim.sub',(select id::text from management_users where role='inactive'),true);
do $$ begin
  begin perform public.manage_mock_exam((select id from management_exams where kind='used'),'unpublish',2); raise exception 'FAIL: inactive tutor managed paper'; exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claim.sub',(select id::text from management_users where role='tutor'),true);
select public.manage_mock_exam((select id from management_exams where kind='used'),'remove',2); -- archives, does not delete
select public.manage_mock_exam((select id from management_exams where kind='used'),'restore',3);
select public.manage_mock_exam((select id from management_exams where kind='used'),'publish',4);
select public.manage_mock_exam((select id from management_exams where kind='used'),'remove',5);
select set_config('request.jwt.claim.sub',(select id::text from management_users where role='student'),true);
do $$ begin
  if not exists(select 1 from public.exams where id=(select id from management_exams where kind='used') and status='archived') then raise exception 'FAIL: archive/resume access lost'; end if;
  if not exists(select 1 from public.exam_answers where session_id=(select id from management_session) and answer_text='Continued after unpublish') then raise exception 'FAIL: answers lost'; end if;
  update public.exam_sessions set status='completed',ended_at=now() where id=(select id from management_session);
  if not exists(select 1 from public.submissions s join public.exams e on e.id=s.exam_id where s.session_id=(select id from management_session) and e.name='Used paper') then raise exception 'FAIL: archived submission/name unavailable'; end if;
end; $$;
select set_config('request.jwt.claim.sub',(select id::text from management_users where role='tutor'),true);
select public.grade_submission((select id from public.submissions where session_id=(select id from management_session)),82,'Preserved tutor feedback',0);
select public.manage_mock_exam((select id from management_exams where kind='used'),'restore',6);
select public.manage_mock_exam((select id from management_exams where kind='used'),'remove',7);
select set_config('request.jwt.claim.sub',(select id::text from management_users where role='student'),true);
do $$ begin
  if not exists(select 1 from public.submissions s join public.exams e on e.id=s.exam_id where s.session_id=(select id from management_session) and s.score=82 and s.feedback='Preserved tutor feedback' and e.status='archived') then raise exception 'FAIL: archive changed graded feedback'; end if;
end; $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin update public.exam_questions set content=jsonb_build_object('subtasks',jsonb_build_array(jsonb_build_object('description','Tampered','weightage',100))) where exam_id=(select id from management_exams where kind='used'); raise exception 'FAIL: attempted content guard bypassed'; exception when check_violation then null; end;
end; $$;
select 'PASS: unpublish/resume, no new attempts, edit/copy/PDF protection, delete/archive/restore, rollback and stale revisions' as result;
rollback;

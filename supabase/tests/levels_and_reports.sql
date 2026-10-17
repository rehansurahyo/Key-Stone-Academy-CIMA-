-- Isolated transactional fixtures, never real student data.
begin;
create temporary table level_users(role text primary key,id uuid default gen_random_uuid());
insert into level_users(role) values('student'),('other_student'),('tutor'),('inactive');
insert into auth.users(id,email) select id,id::text||'@example.invalid' from level_users;
update public.profiles set role='tutor' where id in(select id from level_users where role in('tutor','inactive'));
update public.profiles set is_active=false where id in(select id from level_users where role='inactive');
create temporary table level_records(exam_id uuid default gen_random_uuid(),session_id uuid default gen_random_uuid(),submission_id uuid,report_id uuid);
insert into level_records default values;
grant select,update on level_records to authenticated;
grant select on level_users to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select id::text from level_users where role='tutor'),true);
do $$
declare paper jsonb:='[{"question_id":"section-1","position":1,"duration_seconds":3600,"content":{"subject":"Level test","subtasks":[{"description":"Assess","weightage":100}]}}]'; result jsonb;
begin
  perform public.create_mock_exam_with_level((select exam_id from level_records),'OCS paper','','published',paper,'[]','OCS');
  if not exists(select 1 from public.exams where id=(select exam_id from level_records) and level='OCS') then raise exception 'FAIL: OCS category missing'; end if;
  begin perform public.create_mock_exam_with_level(gen_random_uuid(),'Invalid','','draft',paper,'[]','INVALID'); raise exception 'FAIL: invalid level accepted'; exception when check_violation then null; end;
end; $$;
select set_config('request.jwt.claim.sub',(select id::text from level_users where role='student'),true);
insert into public.exam_sessions(id,user_id,exam_id,status) select session_id,auth.uid(),exam_id,'in_progress' from level_records;
insert into public.exam_answers(session_id,question_id,answer_text) select session_id,'section-1','<p>Final answer</p>' from level_records;
update public.exam_sessions set status='completed',ended_at=now() where id=(select session_id from level_records);
update level_records set submission_id=(select id from public.submissions where session_id=(select session_id from level_records));
select set_config('request.jwt.claim.sub',(select id::text from level_users where role='tutor'),true);
do $$
declare path text:=auth.uid()::text||'/'||(select submission_id::text from level_records)||'/report.pdf'; report uuid; result jsonb;
begin
  insert into storage.objects(bucket_id,name) values('graded-reports',path);
  report:=public.attach_submission_report((select submission_id from level_records),path,'marked.pdf','application/pdf',100);
  update level_records set report_id=report;
  if public.attach_submission_report((select submission_id from level_records),path,'marked.pdf','application/pdf',100)<>report then raise exception 'FAIL: duplicate report attachment'; end if;
  delete from storage.objects where bucket_id='graded-reports' and name=path;
  if not exists(select 1 from storage.objects where bucket_id='graded-reports' and name=path) then raise exception 'FAIL: attached report was deleted'; end if;
  begin perform public.attach_submission_report((select submission_id from level_records),'other/'||(select submission_id::text from level_records)||'/report.pdf','stolen.pdf','application/pdf',100); raise exception 'FAIL: stolen file attached'; exception when insufficient_privilege then null; end;
  result:=public.save_mock_exam_with_level((select exam_id from level_records),1,'MCS copy','',
    '[{"question_id":"section-1","position":1,"duration_seconds":3600,"content":{"subtasks":[{"description":"Assess","weightage":100}]}}]','[]','MCS');
  if result->>'action'<>'copied' or not exists(select 1 from public.exams where id=(result->>'id')::uuid and level='MCS') or not exists(select 1 from public.exams where id=(select exam_id from level_records) and level='OCS') then raise exception 'FAIL: level edit changed historical paper'; end if;
end; $$;
select set_config('request.jwt.claim.sub',(select id::text from level_users where role='student'),true);
do $$ begin
  if exists(select 1 from public.submission_reports) then raise exception 'FAIL: unreleased report visible'; end if;
  if exists(select 1 from storage.objects where bucket_id='graded-reports') then raise exception 'FAIL: unreleased report object visible'; end if;
  begin perform public.attach_submission_report((select submission_id from level_records),'x','x.pdf','application/pdf',10); raise exception 'FAIL: student attached report'; exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claim.sub',(select id::text from level_users where role='tutor'),true);
select public.grade_submission((select submission_id from level_records),85,'Published feedback',0);
select set_config('request.jwt.claim.sub',(select id::text from level_users where role='student'),true);
do $$ begin
  if not exists(select 1 from public.submission_reports where id=(select report_id from level_records)) or not exists(select 1 from storage.objects where bucket_id='graded-reports') then raise exception 'FAIL: own graded report inaccessible'; end if;
end; $$;
select set_config('request.jwt.claim.sub',(select id::text from level_users where role='other_student'),true);
do $$ begin
  if exists(select 1 from public.submission_reports) or exists(select 1 from storage.objects where bucket_id='graded-reports') then raise exception 'FAIL: another student reads report'; end if;
end; $$;
select set_config('request.jwt.claim.sub',(select id::text from level_users where role='inactive'),true);
do $$ begin
  if exists(select 1 from public.submission_reports) then raise exception 'FAIL: suspended tutor reads report'; end if;
  begin perform public.attach_submission_report((select submission_id from level_records),'x','x.pdf','application/pdf',10); raise exception 'FAIL: suspended tutor attached report'; exception when insufficient_privilege then null; end;
end; $$;
rollback;

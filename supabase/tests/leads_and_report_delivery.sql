-- Isolated transactional coverage for public leads and private report delivery.
begin;
create temporary table delivery_users(kind text primary key, id uuid default gen_random_uuid());
insert into delivery_users(kind) values ('student'),('other_student'),('admin');
grant select on delivery_users to authenticated;
insert into auth.users(id,email) select id,id::text||'@example.invalid' from delivery_users;
update public.profiles set role='admin' where id=(select id from delivery_users where kind='admin');

set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select set_config('request.jwt.claim.sub','',true);
insert into public.free_trial_leads(full_name,email,phone,target_level)
values('Trial Learner','trial@example.invalid','+92 300 0000000','MCS');
do $$ begin
  begin
    perform 1 from public.free_trial_leads;
    raise exception 'FAIL: anonymous requester can read leads';
  exception when insufficient_privilege then null;
  end;
end; $$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select id::text from delivery_users where kind='admin'),true);
do $$ begin
  if not exists(select 1 from public.free_trial_leads where email='trial@example.invalid') then raise exception 'FAIL: admin cannot read trial lead'; end if;
end; $$;
update public.free_trial_leads set status='contacted',admin_notes='Called learner' where email='trial@example.invalid';

-- The more restrictive replacement storage policy must not allow a random
-- authenticated student to read an already-attached report object.
create temporary table delivery_records(exam_id uuid default gen_random_uuid(),session_id uuid default gen_random_uuid(),submission_id uuid,report_path text);
insert into delivery_records default values;
grant select,update on delivery_records to authenticated;
do $$
declare paper jsonb := '[{"question_id":"section-1","position":1,"duration_seconds":3600,"content":{"subject":"Report test","subtasks":[{"description":"Assess","weightage":100}]}}]';
begin
  perform public.create_mock_exam_with_level((select exam_id from delivery_records),'Delivery mock','','published',paper,'[]','SCS');
end; $$;
select set_config('request.jwt.claim.sub',(select id::text from delivery_users where kind='student'),true);
insert into public.exam_sessions(id,user_id,exam_id,status) select session_id,auth.uid(),exam_id,'in_progress' from delivery_records;
update public.exam_sessions set status='completed',ended_at=now() where id=(select session_id from delivery_records);
update delivery_records set submission_id=(select id from public.submissions where session_id=(select session_id from delivery_records));
select set_config('request.jwt.claim.sub',(select id::text from delivery_users where kind='admin'),true);
update delivery_records set report_path=auth.uid()::text||'/'||(select submission_id::text from delivery_records)||'/feedback.pdf';
insert into storage.objects(bucket_id,name) select 'graded-reports',report_path from delivery_records;
select public.attach_submission_report((select submission_id from delivery_records),(select report_path from delivery_records),'feedback.pdf','application/pdf',100);
select public.grade_submission((select submission_id from delivery_records),80,'Ready',0);
select set_config('request.jwt.claim.sub',(select id::text from delivery_users where kind='student'),true);
do $$ begin
  if not exists(select 1 from storage.objects where name=(select report_path from delivery_records)) then raise exception 'FAIL: owner cannot read graded report'; end if;
end; $$;
select set_config('request.jwt.claim.sub',(select id::text from delivery_users where kind='other_student'),true);
do $$ begin
  if exists(select 1 from storage.objects where name=(select report_path from delivery_records)) then raise exception 'FAIL: non-owner can read graded report'; end if;
end; $$;
rollback;

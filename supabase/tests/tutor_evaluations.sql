-- Isolated transactional coverage for staff-only drafts and student publication.
begin;
create temporary table evaluation_users(kind text primary key,id uuid default gen_random_uuid());
insert into evaluation_users(kind) values ('student'),('tutor');
grant select on evaluation_users to authenticated;
insert into auth.users(id,email) select id,id::text||'@example.invalid' from evaluation_users;
update public.profiles set role='tutor' where id=(select id from evaluation_users where kind='tutor');
create temporary table evaluation_record(exam_id uuid default gen_random_uuid(),session_id uuid default gen_random_uuid(),submission_id uuid);
insert into evaluation_record default values;
grant select,update on evaluation_record to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select id::text from evaluation_users where kind='tutor'),true);
do $$
declare paper jsonb := '[{"question_id":"section-1","position":1,"duration_seconds":3600,"content":{"subject":"Evaluation","subtasks":[{"description":"Assess","weightage":100}]}}]';
begin perform public.create_mock_exam_with_level((select exam_id from evaluation_record),'Evaluation mock','','published',paper,'[]','SCS'); end;
$$;
select set_config('request.jwt.claim.sub',(select id::text from evaluation_users where kind='student'),true);
insert into public.exam_sessions(id,user_id,exam_id,status) select session_id,auth.uid(),exam_id,'in_progress' from evaluation_record;
update public.exam_sessions set status='completed',ended_at=now() where id=(select session_id from evaluation_record);
update evaluation_record set submission_id=(select id from public.submissions where session_id=(select session_id from evaluation_record));

select set_config('request.jwt.claim.sub',(select id::text from evaluation_users where kind='tutor'),true);
select public.save_tutor_evaluation((select submission_id from evaluation_record),65,'Staff-only draft','draft',0);
do $$ begin
  if (select status from public.submissions where id=(select submission_id from evaluation_record)) <> 'submitted' then raise exception 'FAIL: draft released submission'; end if;
end; $$;
select set_config('request.jwt.claim.sub',(select id::text from evaluation_users where kind='student'),true);
do $$ begin
  if exists(select 1 from public.tutor_evaluations) then raise exception 'FAIL: student can read draft evaluation'; end if;
end; $$;
select set_config('request.jwt.claim.sub',(select id::text from evaluation_users where kind='tutor'),true);
select public.save_tutor_evaluation((select submission_id from evaluation_record),71,'Published evaluation','published',0);
select set_config('request.jwt.claim.sub',(select id::text from evaluation_users where kind='student'),true);
do $$ begin
  if not exists(select 1 from public.tutor_evaluations where status='published' and score=71) then raise exception 'FAIL: student cannot read published evaluation'; end if;
  if (select status from public.submissions where id=(select submission_id from evaluation_record)) <> 'graded' then raise exception 'FAIL: published evaluation did not release submission'; end if;
end; $$;
rollback;

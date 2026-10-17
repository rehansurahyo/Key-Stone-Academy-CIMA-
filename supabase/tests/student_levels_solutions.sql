begin;
create temporary table level_access_users(kind text primary key,id uuid not null);
grant select on level_access_users to authenticated;
insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000009201','ocs@example.test'),
  ('00000000-0000-4000-8000-000000009202','mcs@example.test');
update public.profiles set full_name='OCS Student', role='student', is_active=true, assigned_level='OCS'
where id='00000000-0000-4000-8000-000000009201';
update public.profiles set full_name='MCS Student', role='student', is_active=true, assigned_level='MCS'
where id='00000000-0000-4000-8000-000000009202';
insert into level_access_users values
  ('ocs','00000000-0000-4000-8000-000000009201'),('mcs','00000000-0000-4000-8000-000000009202');
insert into public.exams(id,name,description,status,level) values
  ('00000000-0000-4000-8000-000000009211','OCS access test','', 'published','OCS'),
  ('00000000-0000-4000-8000-000000009212','MCS access test','', 'published','MCS');
insert into public.exam_questions(exam_id,question_id,position,duration_seconds,content) values
  ('00000000-0000-4000-8000-000000009211','section-1',1,3600,'{"subtasks":[{"description":"Assess","weightage":100}]}'),
  ('00000000-0000-4000-8000-000000009212','section-1',1,3600,'{"subtasks":[{"description":"Assess","weightage":100}]}');
insert into public.exam_materials(id,exam_id,name,kind,question_id,storage_path) values
  ('00000000-0000-4000-8000-000000009221','00000000-0000-4000-8000-000000009211','solution.pdf','solution',null,'staff/solution.pdf');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select id::text from level_access_users where kind='ocs'),true);
do $$ begin
  if not exists(select 1 from public.exams where id='00000000-0000-4000-8000-000000009211') then raise exception 'FAIL: OCS student cannot read assigned OCS mock'; end if;
  if exists(select 1 from public.exams where id='00000000-0000-4000-8000-000000009212') then raise exception 'FAIL: OCS student read MCS mock'; end if;
  if exists(select 1 from public.exam_materials where id='00000000-0000-4000-8000-000000009221') then raise exception 'FAIL: solution released before submission'; end if;
  begin update public.profiles set assigned_level='MCS' where id=(select auth.uid()); raise exception 'FAIL: student self-assigned level'; exception when raise_exception then if sqlerrm not like 'Only administrators%' then raise; end if; end;
end $$;
insert into public.exam_sessions(id,user_id,exam_id,status) values ('00000000-0000-4000-8000-000000009231',(select auth.uid()),'00000000-0000-4000-8000-000000009211','in_progress');
update public.exam_sessions set status='completed',ended_at=now() where id='00000000-0000-4000-8000-000000009231';
do $$ begin
  if not exists(select 1 from public.exam_materials where id='00000000-0000-4000-8000-000000009221') then raise exception 'FAIL: submitted student cannot read solution'; end if;
end $$;
reset role;
rollback;

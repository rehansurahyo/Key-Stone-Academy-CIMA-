-- Run in the Supabase SQL editor AFTER the Phase 3 migration.
-- Uses temporary fixtures; ROLLBACK removes every test account and record.
begin;

create temporary table phase3_test_users (role text primary key, id uuid default gen_random_uuid());
insert into phase3_test_users(role) values ('student'), ('other_student'), ('tutor'), ('admin');
insert into auth.users(id, email, raw_user_meta_data)
select id, 'phase3-test-' || id || '@example.invalid', '{"full_name":"Phase 3 test"}'::jsonb from phase3_test_users;
-- Literal assignments work with both text roles and existing app_role enums.
update public.profiles set role = 'tutor'
where id in (select id from phase3_test_users where role = 'tutor');
update public.profiles set role = 'admin'
where id in (select id from phase3_test_users where role = 'admin');
create temporary table phase3_test_records (exam_id uuid, session_id uuid, submission_id uuid);
insert into phase3_test_records values (gen_random_uuid(), gen_random_uuid(), null);
insert into public.exams(id, name, status, created_by)
select r.exam_id, 'Transactional RBAC test', 'published', u.id from phase3_test_records r, phase3_test_users u where u.role = 'admin';
insert into public.exam_questions(exam_id,question_id,position,content)
select exam_id,'section-1',1,'{"subject":"RBAC test","subtasks":[{"description":"Evaluate strategy","weightage":100}]}' from phase3_test_records;
insert into public.exam_sessions(id,user_id,exam_id,status)
select r.session_id,u.id,r.exam_id,'in_progress' from phase3_test_records r,phase3_test_users u where u.role='student';
insert into public.exam_answers(session_id,question_id,answer_text)
select session_id,'section-1','<p>Test answer</p>' from phase3_test_records;
update public.exam_sessions set status='completed', ended_at=now() where id in (select session_id from phase3_test_records);
update phase3_test_records r set submission_id=s.id from public.submissions s where s.session_id=r.session_id;
grant select on phase3_test_users,phase3_test_records to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select id::text from phase3_test_users where role='student'),true);
do $$
begin
  if (select submission_id from phase3_test_records) is null then raise exception 'FAIL: submission not captured'; end if;
  begin
    update public.profiles set role='admin' where id=auth.uid();
    raise exception 'FAIL: self-promotion succeeded';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform public.grade_submission((select submission_id from phase3_test_records),70,'Feedback',0);
    raise exception 'FAIL: student grading succeeded';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    update public.exam_sessions set status='in_progress' where id=(select session_id from phase3_test_records);
    raise exception 'FAIL: completed session reopened';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  if exists(select 1 from public.profiles where id=(select id from phase3_test_users where role='tutor')) then
    raise exception 'FAIL: student can read tutor directory';
  end if;
  begin
    update public.exam_answers set answer_text='Changed after submission'
    where session_id=(select session_id from phase3_test_records);
    raise exception 'FAIL: completed answer edited';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_mock_exam(gen_random_uuid(),'Forbidden student mock','','published',
      '[{"question_id":"q1","position":1,"duration_seconds":3600,"content":{}}]', '[]');
    raise exception 'FAIL: student created a mock';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub',(select id::text from phase3_test_users where role='other_student'),true);
do $$
begin
  if exists(select 1 from public.submissions where id=(select submission_id from phase3_test_records)) then
    raise exception 'FAIL: student can read another student submission';
  end if;
  if exists(select 1 from public.exam_answers where session_id=(select session_id from phase3_test_records)) then
    raise exception 'FAIL: student can read another student answers';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub',(select id::text from phase3_test_users where role='tutor'),true);
do $$
declare
  mock_id uuid := gen_random_uuid();
  timer_session uuid;
  material_path text := auth.uid()::text || '/local-rbac/reference.pdf';
begin
  if not exists(select 1 from public.exam_answers where session_id=(select session_id from phase3_test_records)) then
    raise exception 'FAIL: tutor cannot read completed answers';
  end if;
  perform public.grade_submission((select submission_id from phase3_test_records),72,'Good strategic analysis; expand the financial implications.',0);
  if not exists(select 1 from public.submissions where id=(select submission_id from phase3_test_records) and status='graded' and score=72) then
    raise exception 'FAIL: tutor grade not persisted';
  end if;
  begin
    perform public.grade_submission((select submission_id from phase3_test_records),80,'Stale overwrite',0);
    raise exception 'FAIL: concurrent grade overwrite allowed';
  exception when serialization_failure then null;
  end;
  insert into storage.objects(bucket_id,name) values ('exam-materials',material_path);
  perform public.create_mock_exam(mock_id,'Tutor uploaded mock','','published',
    '[{"question_id":"section-1","position":1,"duration_seconds":3600,"content":{"subject":"Test","subtasks":[{"description":"Evaluate funding","weightage":100}]}}]',
    jsonb_build_array(jsonb_build_object('name','reference.pdf','kind','reference','question_id','section-1','storage_path',material_path)));
  if not exists(select 1 from public.exam_materials where exam_id=mock_id and storage_path=material_path) then
    raise exception 'FAIL: material mapping not persisted';
  end if;
  delete from storage.objects where bucket_id='exam-materials' and name=material_path;
  if not exists(select 1 from storage.objects where bucket_id='exam-materials' and name=material_path) then
    raise exception 'FAIL: attached PDF was deleted';
  end if;
  begin
    perform public.create_mock_exam(gen_random_uuid(),'Missing upload','','published',
      '[{"question_id":"q1","position":1,"duration_seconds":3600,"content":{}}]',
      '[{"name":"missing.pdf","kind":"preseen","question_id":null,"storage_path":"unowned/missing.pdf"}]');
    raise exception 'FAIL: missing/unowned upload accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  insert into public.exam_sessions(user_id,exam_id,status) values(auth.uid(),mock_id,'in_progress') returning id into timer_session;
  perform public.sync_question_timer(timer_session,'section-1',3500);
  perform public.sync_question_timer(timer_session,'section-2',3600);
  if not exists(select 1 from public.exam_sessions where id=timer_session
    and active_question_id='section-2' and (question_timers->'section-1'->>'remaining_seconds')::integer=3500
    and (question_timers->'section-2'->>'remaining_seconds')::integer=3600) then
    raise exception 'FAIL: independent question timer state lost';
  end if;
  begin
    update public.profiles set role='admin' where id=auth.uid();
    raise exception 'FAIL: tutor promoted self';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub','',true);
select 'PASS: ownership, self-promotion, answer/session lock, mock creation, private PDF protection, question timers, grading and concurrency' as result;
rollback;

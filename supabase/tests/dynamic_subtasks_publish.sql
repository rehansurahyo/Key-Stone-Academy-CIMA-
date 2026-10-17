-- Run AFTER 20261007_dynamic_subtasks_publish.sql; no test data is retained.
begin;
create temporary table subtask_test_users(role text primary key, id uuid default gen_random_uuid());
insert into subtask_test_users(role) values ('student'),('tutor'),('admin'),('inactive');
insert into auth.users(id,email,raw_user_meta_data)
select id,'subtasks-test-'||id||'@example.invalid','{}'::jsonb from subtask_test_users;
update public.profiles set role='tutor' where id in (select id from subtask_test_users where role in ('tutor','inactive'));
update public.profiles set role='admin' where id in (select id from subtask_test_users where role='admin');
update public.profiles set is_active=false where id in (select id from subtask_test_users where role='inactive');
create temporary table subtask_test_exams(kind text primary key,id uuid default gen_random_uuid());
insert into subtask_test_exams(kind) values ('percent'),('marks'),('empty');
insert into public.exams(id,name,status) select id,'Empty draft','draft' from subtask_test_exams where kind='empty';
grant select on subtask_test_users,subtask_test_exams to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select id::text from subtask_test_users where role='tutor'),true);
do $$
declare invalid jsonb; invalid_id uuid; material_path text:=auth.uid()::text||'/subtask-test/reference.pdf';
begin
  insert into storage.objects(bucket_id,name) values ('exam-materials',material_path);
  perform public.create_mock_exam((select id from subtask_test_exams where kind='percent'),'Three custom tasks','','draft',
    '[{"question_id":"section-1","position":1,"duration_seconds":3600,"content":{"subtasks":[{"description":"Strategy","weightage":20},{"description":"Funding","weightage":30},{"description":"Risk","weightage":50}],"weightageUnit":"percent"}}]',
    jsonb_build_array(jsonb_build_object('name','reference.pdf','kind','reference','question_id','section-1','storage_path',material_path)));
  perform public.create_mock_exam((select id from subtask_test_exams where kind='marks'),'Custom marks','','draft',
    '[{"question_id":"section-1","position":1,"duration_seconds":3600,"content":{"subtasks":[{"description":"Strategy","weightage":10},{"description":"Funding","weightage":20},{"description":"Risk","weightage":7.5}],"weightageUnit":"marks"}}]','[]');
  if not exists(select 1 from public.exam_questions where exam_id=(select id from subtask_test_exams where kind='percent')
    and jsonb_array_length(content->'subtasks')=3 and content->'subtasks'->2->>'weightage'='50') then
    raise exception 'FAIL: custom weights not persisted';
  end if;
  -- Each invalid RPC must roll back its exam insert, not leave an orphan draft.
  for invalid in select value from jsonb_array_elements('[
    {"subtasks":[]},
    {"subtasks":[{"description":"No weight","weightage":0}]},
    {"subtasks":[{"description":"Negative","weightage":-1}],"weightageUnit":"marks"},
    {"subtasks":[{"description":"Wrong total","weightage":99}]},
    {"subtasks":[{"description":"String weight","weightage":"100"}]},
    {"subtasks":[{"description":"   ","weightage":100}]},
    {"subtasks":[{"description":"Too precise","weightage":1.001}],"weightageUnit":"marks"},
    {"subtasks":[{"description":"Unknown unit","weightage":100}],"weightageUnit":"other"}
  ]'::jsonb) loop
    invalid_id:=gen_random_uuid();
    begin
      perform public.create_mock_exam(invalid_id,'Invalid mock','','published',
        jsonb_build_array(jsonb_build_object('question_id','q1','position',1,'duration_seconds',3600,'content',invalid)),'[]');
      raise exception 'FAIL: invalid subtasks accepted';
    exception when check_violation then null;
    end;
    if exists(select 1 from public.exams where id=invalid_id) then raise exception 'FAIL: orphan draft after validation failure'; end if;
  end loop;
  begin
    perform public.publish_mock_exam((select id from subtask_test_exams where kind='empty'));
    raise exception 'FAIL: empty draft published';
  exception when check_violation then null;
  end;
  begin
    update public.exams set name='Unauthorized rename' where id=(select id from subtask_test_exams where kind='percent');
    raise exception 'FAIL: publication granted unrestricted exam edits';
  exception when insufficient_privilege then null;
  end;
  if not public.valid_question_subtasks(public.normalize_question_subtasks('{"partA":"Legacy A","partB":"Legacy B","weightA":"55%","weightB":"45%"}')) then
    raise exception 'FAIL: legacy normalization failed';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub',(select id::text from subtask_test_users where role='student'),true);
do $$
begin
  if exists(select 1 from public.exams where id in(select id from subtask_test_exams))
    or exists(select 1 from public.exam_questions where exam_id in(select id from subtask_test_exams))
    or exists(select 1 from public.exam_materials where exam_id in(select id from subtask_test_exams)) then
    raise exception 'FAIL: student accessed draft exams/questions/materials';
  end if;
  begin
    perform public.publish_mock_exam((select id from subtask_test_exams where kind='percent'));
    raise exception 'FAIL: student published a draft';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select set_config('request.jwt.claim.sub',(select id::text from subtask_test_users where role='inactive'),true);
do $$
begin
  begin
    perform public.publish_mock_exam((select id from subtask_test_exams where kind='percent'));
    raise exception 'FAIL: suspended tutor published a draft';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select set_config('request.jwt.claim.sub',(select id::text from subtask_test_users where role='tutor'),true);
select public.publish_mock_exam((select id from subtask_test_exams where kind='percent'));
select public.publish_mock_exam((select id from subtask_test_exams where kind='percent')); -- idempotent retry
do $$
begin
  begin
    update public.exams set status='draft' where id=(select id from subtask_test_exams where kind='percent');
    raise exception 'FAIL: published exam reverted to draft';
  exception when check_violation then null;
  end;
end;
$$;
select set_config('request.jwt.claim.sub',(select id::text from subtask_test_users where role='admin'),true);
select public.publish_mock_exam((select id from subtask_test_exams where kind='marks'));
select set_config('request.jwt.claim.sub',(select id::text from subtask_test_users where role='student'),true);
do $$
begin
  if (select count(*) from public.exams where id in(select id from subtask_test_exams))<>2
    or (select count(*) from public.exam_questions where exam_id in(select id from subtask_test_exams))<>2
    or (select count(*) from public.exam_materials where exam_id in(select id from subtask_test_exams))<>1 then
    raise exception 'FAIL: published mocks not visible to students';
  end if;
  if not exists(select 1 from public.exam_questions where exam_id=(select id from subtask_test_exams where kind='marks')
    and content->>'weightageUnit'='marks' and content->'subtasks'->2->>'weightage'='7.5') then
    raise exception 'FAIL: published custom marks changed';
  end if;
end;
$$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select 'PASS: custom subtasks/marks, validation, atomic publication, RBAC, draft privacy, student access and retry' as result;
rollback;

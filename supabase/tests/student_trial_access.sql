begin;
insert into auth.users(id,email,is_anonymous) values
 ('00000000-0000-4000-8000-000000009801',null,true),
 ('00000000-0000-4000-8000-000000009802','enrolled@example.test',false),
 ('00000000-0000-4000-8000-000000009803',null,true),
 ('00000000-0000-4000-8000-000000009804','admin@example.test',false),
 ('00000000-0000-4000-8000-000000009805','public-signup@example.test',false);
update public.profiles set assigned_level='OCS',access_type='enrolled' where id='00000000-0000-4000-8000-000000009802';
update public.profiles set role='admin',access_type='enrolled' where id='00000000-0000-4000-8000-000000009804';
insert into public.exams(id,name,status,level)
select ('00000000-0000-4000-8000-'||lpad((9810+n)::text,12,'0'))::uuid,'OCS Mock '||n,'published','OCS'
from generate_series(1,5) n;
insert into public.exams(id,name,status,level) values
 ('00000000-0000-4000-8000-000000009821','MCS Mock1','published','MCS'),
 ('00000000-0000-4000-8000-000000009822','SCS Mock 10','published','SCS');
insert into public.exam_questions(exam_id,question_id,position,content)
select id,'section-1',1,'{"subtasks":[{"description":"Assess","weightage":100}]}'::jsonb
from public.exams where id::text like '%00981_' or id='00000000-0000-4000-8000-000000009821';
insert into public.exam_materials(exam_id,name,kind,storage_path) values
 ('00000000-0000-4000-8000-000000009811','Trial PDF','preseen','trial/one.pdf'),
 ('00000000-0000-4000-8000-000000009812','Locked PDF','preseen','trial/two.pdf');
insert into storage.objects(bucket_id,name) values ('exam-materials','trial/one.pdf'),('exam-materials','trial/two.pdf');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009801',true);
do $$ begin
 if public.student_can_use_exam('00000000-0000-4000-8000-000000009811') then raise exception 'FAIL: unregistered guest access'; end if;
 begin update public.profiles set access_type='enrolled' where id=auth.uid(); raise exception 'FAIL: guest self enrollment'; exception when insufficient_privilege then null; end;
 begin update public.profiles set role='admin' where id=auth.uid(); raise exception 'FAIL: guest self promotion'; exception when insufficient_privilege then null; end;
end $$;
select public.register_free_trial('Trial Learner','lead@example.test','+923001234567','OCS');
-- Retrying with another level must not change the original grant or duplicate lead.
select public.register_free_trial('Changed','different@example.test','12345678','MCS');
do $$ begin
 if (select assigned_level from public.profiles where id=auth.uid())<>'OCS' then raise exception 'FAIL: retry changed level'; end if;
 if (select count(*) from public.exams where level='OCS')<>5 then raise exception 'FAIL: locked catalog missing'; end if;
 if (select count(*) from public.exam_questions where exam_id::text like '%00981_')<>1 then raise exception 'FAIL: locked questions exposed'; end if;
 if not public.student_can_use_exam('00000000-0000-4000-8000-000000009811') then raise exception 'FAIL: Mock 1 unavailable'; end if;
 if public.student_can_use_exam('00000000-0000-4000-8000-000000009812') then raise exception 'FAIL: Mock 2 unlocked'; end if;
 if public.student_can_use_exam('00000000-0000-4000-8000-000000009821') then raise exception 'FAIL: MCS unlocked'; end if;
 if exists(select 1 from public.exam_materials where storage_path='trial/two.pdf') then raise exception 'FAIL: locked PDF metadata'; end if;
 if exists(select 1 from storage.objects where name='trial/two.pdf') then raise exception 'FAIL: locked PDF object'; end if;
 if not exists(select 1 from storage.objects where name='trial/one.pdf') then raise exception 'FAIL: trial PDF hidden'; end if;
 if exists(select 1 from public.free_trial_leads) then raise exception 'FAIL: guest read leads'; end if;
 begin update public.profiles set trial_exam_id='00000000-0000-4000-8000-000000009812' where id=auth.uid(); raise exception 'FAIL: swapped trial paper'; exception when insufficient_privilege then null; end;
 begin update public.profiles set assigned_level='MCS' where id=auth.uid(); raise exception 'FAIL: swapped level'; exception when insufficient_privilege then null; end;
 begin insert into public.exam_sessions(user_id,exam_id,status) values(auth.uid(),'00000000-0000-4000-8000-000000009812','in_progress'); raise exception 'FAIL: locked attempt'; exception when insufficient_privilege then null; end;
 begin insert into public.free_trial_leads(full_name,email,phone,target_level,user_id) values('Fake','fake@example.test','123456','MCS',auth.uid()); raise exception 'FAIL: forged lead'; exception when insufficient_privilege then null; end;
end $$;
insert into public.exam_sessions(id,user_id,exam_id,status)
values('00000000-0000-4000-8000-000000009831',auth.uid(),'00000000-0000-4000-8000-000000009811','in_progress');
insert into public.exam_answers(session_id,question_id,answer_text)
values('00000000-0000-4000-8000-000000009831','section-1','Trial saved answer');
select public.sync_question_timer('00000000-0000-4000-8000-000000009831','section-1',3500);
do $$ begin
 if (select answer_text from public.exam_answers where session_id='00000000-0000-4000-8000-000000009831')<>'Trial saved answer' then raise exception 'FAIL: trial autosave'; end if;
 if (select time_remaining_seconds from public.exam_sessions where id='00000000-0000-4000-8000-000000009831')<>3500 then raise exception 'FAIL: trial timer'; end if;
end $$;
update public.exam_sessions set status='completed',ended_at=now() where id='00000000-0000-4000-8000-000000009831';

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009802',true);
do $$ begin
 if (select count(*) from public.exam_questions where exam_id::text like '%00981_')<>5 then raise exception 'FAIL: enrolled lost full access'; end if;
 begin perform public.register_free_trial('No downgrade','enrolled@example.test','123456','OCS'); raise exception 'FAIL: enrolled reused guest registration'; exception when insufficient_privilege then null; end;
end $$;
insert into public.exam_sessions(user_id,exam_id,status) values(auth.uid(),'00000000-0000-4000-8000-000000009815','in_progress');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009803',true);
do $$ begin
 if exists(select 1 from public.exam_answers where session_id='00000000-0000-4000-8000-000000009831') then raise exception 'FAIL: other trial read answers'; end if;
 begin perform public.register_free_trial('No Mock One','other@example.test','123456','SCS'); raise exception 'FAIL: Mock10 selected as Mock1'; exception when no_data_found then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009805',true);
do $$ begin
 if (select access_type from public.profiles where id=auth.uid())<>'trial' then raise exception 'FAIL: public signup enrolled'; end if;
 begin perform public.register_free_trial('No guest','public-signup@example.test','123456','OCS'); raise exception 'FAIL: permanent account claimed guest'; exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009804',true);
do $$ begin
 if (select count(*) from public.free_trial_leads where user_id='00000000-0000-4000-8000-000000009801')<>1 then raise exception 'FAIL: admin lead missing/duplicated'; end if;
 if (select full_name from public.free_trial_leads where user_id='00000000-0000-4000-8000-000000009801')<>'Trial Learner' then raise exception 'FAIL: retry replaced lead'; end if;
 if not exists(select 1 from public.submissions where session_id='00000000-0000-4000-8000-000000009831') then raise exception 'FAIL: trial submission missing'; end if;
end $$;
reset role;
rollback;

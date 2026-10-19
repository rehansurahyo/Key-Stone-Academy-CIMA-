begin;
insert into auth.users(id,email,is_anonymous) values
 ('00000000-0000-4000-8000-000000009901',null,true),
 ('00000000-0000-4000-8000-000000009902','contact-admin@example.test',false),
 ('00000000-0000-4000-8000-000000009903',null,true);
update public.profiles set role='admin',access_type='enrolled' where id='00000000-0000-4000-8000-000000009902';
insert into public.exams(id,name,status,level) values
 ('00000000-0000-4000-8000-000000009911','OCS Mock 1','published','OCS');
-- Legacy enquiries stay valid and retain their original data without invented geography.
insert into public.free_trial_leads(id,full_name,email,phone,target_level)
 values('00000000-0000-4000-8000-000000009921','Legacy enquiry','old@example.test','0300 1234567','OCS');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009901',true);
do $$ begin
 begin perform public.register_free_trial_contact('Trial','trial@example.test','+923001234567','OCS','pk','PK','+92'); raise exception 'FAIL: invalid country accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.register_free_trial_contact('Trial','trial@example.test','+923001234567','OCS','PK','PK','+44'); raise exception 'FAIL: prefix mismatch accepted'; exception when invalid_parameter_value then null; end;
end $$;
select public.register_free_trial_contact('Contact learner','contact@example.test','+447911123456','OCS','PK','GB','+44');
select public.register_free_trial_contact('Ignored duplicate','other@example.test','+12025550123','OCS','US','US','+1');
do $$ begin
 if not public.student_can_use_exam('00000000-0000-4000-8000-000000009911') then raise exception 'FAIL: contact fields broke Mock 1 access'; end if;
 if exists(select 1 from public.free_trial_leads where user_id=auth.uid()) then raise exception 'FAIL: guest can read lead contacts'; end if;
 update public.free_trial_leads set country='US' where user_id=auth.uid();
 if found then raise exception 'FAIL: guest rewrote contact metadata'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009903',true);
-- The original four-argument RPC still supports already-open legacy clients.
select public.register_free_trial('Legacy browser','legacy-browser@example.test','+923001234568','OCS');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009902',true);
do $$ declare contact public.free_trial_leads; begin
 select * into contact from public.free_trial_leads where user_id='00000000-0000-4000-8000-000000009901';
 if contact.country<>'PK' or contact.phone_country<>'GB' or contact.country_code<>'+44'
   or contact.phone<>'+447911123456' or contact.full_name<>'Contact learner' then
   raise exception 'FAIL: new contact fields missing, duplicated, or overwritten';
 end if;
 if (select count(*) from public.free_trial_leads where user_id=contact.user_id)<>1 then raise exception 'FAIL: duplicate contact leads'; end if;
 if not exists(select 1 from public.free_trial_leads where id='00000000-0000-4000-8000-000000009921'
   and phone='0300 1234567' and country is null and country_code is null) then raise exception 'FAIL: legacy contact changed'; end if;
end $$;
reset role;
rollback;

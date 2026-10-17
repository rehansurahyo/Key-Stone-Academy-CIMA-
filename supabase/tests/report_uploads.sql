begin;
create temporary table report_users(kind text primary key,id uuid default gen_random_uuid());
insert into report_users(kind) values('student'),('other'),('tutor'),('admin'),('suspended');
insert into auth.users(id,email) select id,id::text||'@example.invalid' from report_users;
update public.profiles set role='tutor' where id in(select id from report_users where kind in ('tutor','suspended'));
update public.profiles set role='admin' where id=(select id from report_users where kind='admin');
update public.profiles set is_active=false where id=(select id from report_users where kind='suspended');
create temporary table report_session(id uuid default gen_random_uuid(),submission_id uuid);
insert into report_session default values;
grant select,update on report_session to authenticated;
grant select on report_users to authenticated;
do $$ begin
  if not exists(select 1 from storage.buckets where id='graded-reports' and not public and allowed_mime_types @> array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) then
    raise exception 'FAIL: report bucket MIME configuration';
  end if;
end; $$;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select id::text from report_users where kind='student'),true);
insert into public.exam_sessions(id,user_id,status) select id,auth.uid(),'in_progress' from report_session;
update public.exam_sessions set status='completed',ended_at=now() where id=(select id from report_session);
update report_session set submission_id=(select id from public.submissions where session_id=(select id from report_session));
select set_config('request.jwt.claim.sub',(select id::text from report_users where kind='tutor'),true);
do $$
declare ext text; mime text; path text; report uuid; sid uuid := (select submission_id from report_session);
begin
  foreach ext in array array['pdf','docx','doc'] loop
    mime:=case ext when 'pdf' then 'application/pdf' when 'doc' then 'application/msword' else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' end;
    path:=auth.uid()::text||'/'||sid::text||'/feedback.'||ext;
    insert into storage.objects(bucket_id,name) values('graded-reports',path);
    report:=public.attach_submission_report(sid,path,'feedback.'||ext,mime,1024);
    if public.attach_submission_report(sid,path,'feedback.'||ext,mime,1024)<>report then raise exception 'FAIL: report retry duplicated attachment'; end if;
  end loop;
  begin insert into storage.objects(bucket_id,name) values('graded-reports',auth.uid()::text||'/'||sid::text||'/bad.exe'); raise exception 'FAIL: unsupported extension accepted'; exception when insufficient_privilege then null; end;
  begin insert into storage.objects(bucket_id,name) values('graded-reports','someone-else/'||sid::text||'/bad.doc'); raise exception 'FAIL: foreign upload folder accepted'; exception when insufficient_privilege then null; end;
  perform public.save_tutor_evaluation(sid,0,'Feedback draft','draft',0);
  if (select count(*) from public.submission_reports where submission_id=sid and evaluation_id=(select id from public.tutor_evaluations where submission_id=sid))<>3 then raise exception 'FAIL: reports not linked on evaluation creation'; end if;
end; $$;
select set_config('request.jwt.claim.sub',(select id::text from report_users where kind='admin'),true);
do $$
declare sid uuid := (select submission_id from report_session); path text; rid uuid;
begin
  path:=auth.uid()::text||'/'||sid::text||'/admin.doc';
  insert into storage.objects(bucket_id,name) values('graded-reports',path);
  rid:=public.attach_submission_report(sid,path,'admin.doc','application/msword',2048);
  if not exists(select 1 from public.submission_reports where id=rid and evaluation_id=(select id from public.tutor_evaluations where submission_id=sid)) then raise exception 'FAIL: upload not linked to existing evaluation'; end if;
end; $$;
select set_config('request.jwt.claim.sub',(select id::text from report_users where kind='student'),true);
do $$ begin
  if exists(select 1 from public.submission_reports) or exists(select 1 from storage.objects where bucket_id='graded-reports') then raise exception 'FAIL: student sees draft reports'; end if;
  begin insert into storage.objects(bucket_id,name) values('graded-reports',auth.uid()::text||'/'||(select submission_id::text from report_session)||'/student.doc'); raise exception 'FAIL: student upload allowed'; exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claim.sub',(select id::text from report_users where kind='tutor'),true);
select public.save_tutor_evaluation((select submission_id from report_session),72,'Final feedback','published',0);
select set_config('request.jwt.claim.sub',(select id::text from report_users where kind='student'),true);
do $$ begin
  if (select count(*) from public.submission_reports)<>4 or (select count(*) from storage.objects where bucket_id='graded-reports')<>4 then raise exception 'FAIL: owner cannot download published reports'; end if;
end; $$;
select set_config('request.jwt.claim.sub',(select id::text from report_users where kind='other'),true);
do $$ begin
  if exists(select 1 from public.submission_reports) or exists(select 1 from storage.objects where bucket_id='graded-reports') then raise exception 'FAIL: other student sees reports'; end if;
end; $$;
select set_config('request.jwt.claim.sub',(select id::text from report_users where kind='suspended'),true);
do $$ begin
  begin insert into storage.objects(bucket_id,name) values('graded-reports',auth.uid()::text||'/'||(select submission_id::text from report_session)||'/suspended.doc'); raise exception 'FAIL: suspended tutor upload allowed'; exception when insufficient_privilege then null; end;
end; $$;
rollback;

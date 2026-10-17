-- Run after 20261013_tutor_evaluations_and_admin_update.sql.
begin;

alter table public.submission_reports drop constraint if exists submission_reports_mime_type_check;
alter table public.submission_reports add constraint submission_reports_mime_type_check
  check (mime_type in ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
alter table public.submission_reports add column if not exists evaluation_id uuid
  references public.tutor_evaluations(id) on delete set null;
create index if not exists submission_reports_evaluation_idx on public.submission_reports(evaluation_id);
update public.submission_reports r set evaluation_id=e.id
  from public.tutor_evaluations e where e.submission_id=r.submission_id and r.evaluation_id is distinct from e.id;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('graded-reports','graded-reports',false,20971520,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists graded_report_upload on storage.objects;
create policy graded_report_upload on storage.objects for insert to authenticated with check (
  bucket_id='graded-reports' and public.has_portal_role(array['admin','tutor'])
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and cardinality(storage.foldername(name))=2 and name ~* '\.(pdf|docx|doc)$'
  and exists(select 1 from public.submissions s where s.id::text=(storage.foldername(name))[2])
);
drop policy if exists graded_report_read on storage.objects;
create policy graded_report_read on storage.objects for select to authenticated using (
  bucket_id='graded-reports' and (
    public.has_portal_role(array['admin','tutor']) or (
      public.has_portal_role(array['student']) and exists(
        select 1 from public.submission_reports r join public.submissions s on s.id=r.submission_id
        where r.storage_path=storage.objects.name and s.student_id=(select auth.uid()) and s.status='graded'
      )
    )
  )
);
drop policy if exists graded_report_cleanup on storage.objects;
create policy graded_report_cleanup on storage.objects for delete to authenticated using (
  bucket_id='graded-reports' and public.has_portal_role(array['admin','tutor'])
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and not exists(select 1 from public.submission_reports r where r.storage_path=storage.objects.name)
);

create or replace function public.attach_submission_report(
  p_submission_id uuid,p_storage_path text,p_file_name text,p_mime_type text,p_byte_size integer
) returns uuid language plpgsql security definer set search_path='' as $$
declare report_id uuid; evaluation uuid;
begin
  if not public.has_portal_role(array['admin','tutor']) then raise exception 'Active staff access required.' using errcode='42501'; end if;
  -- Serialize attachment and evaluation creation for this submission so a
  -- concurrent first evaluation cannot leave an attachment without its link.
  perform 1 from public.submissions where id=p_submission_id for update;
  if not found then raise exception 'Submission not found.' using errcode='P0002'; end if;
  if p_storage_path is null or p_storage_path like '%..%' or
    (storage.foldername(p_storage_path))[1] is distinct from auth.uid()::text or
    (storage.foldername(p_storage_path))[2] is distinct from p_submission_id::text or
    not exists(select 1 from storage.objects where bucket_id='graded-reports' and name=p_storage_path) then
    raise exception 'Use your own report upload for this submission.' using errcode='42501';
  end if;
  select id into evaluation from public.tutor_evaluations where submission_id=p_submission_id;
  insert into public.submission_reports(submission_id,evaluation_id,file_name,storage_path,mime_type,byte_size,uploaded_by)
  values(p_submission_id,evaluation,p_file_name,p_storage_path,p_mime_type,p_byte_size,auth.uid())
  on conflict(storage_path) do update set evaluation_id=coalesce(public.submission_reports.evaluation_id,excluded.evaluation_id);
  select id into report_id from public.submission_reports where storage_path=p_storage_path and submission_id=p_submission_id;
  return report_id;
end;
$$;
revoke all on function public.attach_submission_report(uuid,text,text,text,integer) from public;
grant execute on function public.attach_submission_report(uuid,text,text,text,integer) to authenticated;

-- Uploads are attached to the submission immediately, even before feedback is
-- drafted. Link them automatically when its first evaluation is saved.
create or replace function public.link_evaluation_reports()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.submissions where id=new.submission_id for update;
  update public.submission_reports set evaluation_id=new.id where submission_id=new.submission_id;
  return new;
end;
$$;
revoke all on function public.link_evaluation_reports() from public;
drop trigger if exists link_evaluation_reports on public.tutor_evaluations;
create trigger link_evaluation_reports after insert on public.tutor_evaluations
for each row execute function public.link_evaluation_reports();

commit;

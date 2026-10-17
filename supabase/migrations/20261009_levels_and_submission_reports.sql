-- Run AFTER 20261008_safe_mock_management.sql. Preserves every existing attempt.
begin;
alter table public.exams add column if not exists level text not null default 'SCS';
alter table public.exams drop constraint if exists exams_level_check;
alter table public.exams add constraint exams_level_check check(level in ('OCS','MCS','SCS'));
create index if not exists exams_level_status_idx on public.exams(level,status,created_at desc);

-- Older open browser tabs use the original save RPC. Copies inherit the source
-- category before a level-aware client optionally chooses a different category.
create or replace function public.inherit_mock_copy_level()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.copied_from is not null then
    select level into new.level from public.exams where id=new.copied_from;
  end if;
  return new;
end;
$$;
drop trigger if exists inherit_mock_copy_level on public.exams;
create trigger inherit_mock_copy_level before insert on public.exams for each row execute function public.inherit_mock_copy_level();

-- New names avoid ambiguous PostgREST overloads and keep older clients working.
create or replace function public.create_mock_exam_with_level(
  p_id uuid,p_name text,p_description text,p_status text,p_questions jsonb,p_materials jsonb,p_level text
) returns uuid language plpgsql security definer set search_path='' as $$
begin
  if p_level is null or p_level not in ('OCS','MCS','SCS') then raise exception 'Invalid case study level.' using errcode='23514'; end if;
  perform public.create_mock_exam(p_id,p_name,p_description,p_status,p_questions,p_materials);
  update public.exams set level=p_level where id=p_id;
  return p_id;
end;
$$;
create or replace function public.save_mock_exam_with_level(
  p_id uuid,p_revision integer,p_name text,p_description text,p_questions jsonb,p_materials jsonb,p_level text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if p_level is null or p_level not in ('OCS','MCS','SCS') then raise exception 'Invalid case study level.' using errcode='23514'; end if;
  result:=public.save_mock_exam(p_id,p_revision,p_name,p_description,p_questions,p_materials);
  update public.exams set level=p_level where id=(result->>'id')::uuid;
  return result;
end;
$$;
revoke all on function public.create_mock_exam_with_level(uuid,text,text,text,jsonb,jsonb,text) from public;
revoke all on function public.save_mock_exam_with_level(uuid,integer,text,text,jsonb,jsonb,text) from public;
grant execute on function public.create_mock_exam_with_level(uuid,text,text,text,jsonb,jsonb,text),
  public.save_mock_exam_with_level(uuid,integer,text,text,jsonb,jsonb,text) to authenticated;

create table if not exists public.submission_reports (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  file_name text not null check(length(file_name) between 1 and 255),
  storage_path text not null unique,
  mime_type text not null check(mime_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  byte_size integer not null check(byte_size between 1 and 20971520),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists submission_reports_submission_idx on public.submission_reports(submission_id);
alter table public.submission_reports enable row level security;
revoke all on public.submission_reports from anon,authenticated;
grant select on public.submission_reports to authenticated;
drop policy if exists submission_reports_read on public.submission_reports;
create policy submission_reports_read on public.submission_reports for select to authenticated using (
  public.has_portal_role(array['admin','tutor']) or (
    public.has_portal_role(array['student']) and exists (
      select 1 from public.submissions s where s.id=submission_id and s.student_id=(select auth.uid()) and s.status='graded'
    )
  )
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('graded-reports','graded-reports',false,20971520,
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists graded_report_upload on storage.objects;
create policy graded_report_upload on storage.objects for insert to authenticated with check (
  bucket_id='graded-reports' and public.has_portal_role(array['admin','tutor'])
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(select 1 from public.submissions s where s.id::text=(storage.foldername(name))[2])
);
drop policy if exists graded_report_read on storage.objects;
create policy graded_report_read on storage.objects for select to authenticated using (
  bucket_id='graded-reports' and (
    (public.has_portal_role(array['admin','tutor']) and (storage.foldername(name))[1]=(select auth.uid())::text)
    or exists(select 1 from public.submission_reports r where r.storage_path=storage.objects.name)
  )
);
drop policy if exists graded_report_cleanup on storage.objects;
create policy graded_report_cleanup on storage.objects for delete to authenticated using (
  bucket_id='graded-reports' and public.has_portal_role(array['admin','tutor'])
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and not exists(select 1 from public.submission_reports r where r.storage_path=storage.objects.name)
);

-- Metadata attachment is atomic and idempotent, and cannot cross submissions.
create or replace function public.attach_submission_report(
  p_submission_id uuid,p_storage_path text,p_file_name text,p_mime_type text,p_byte_size integer
) returns uuid language plpgsql security definer set search_path='' as $$
declare report_id uuid;
begin
  if not public.has_portal_role(array['admin','tutor']) then raise exception 'Active staff access required.' using errcode='42501'; end if;
  if not exists(select 1 from public.submissions where id=p_submission_id) then raise exception 'Submission not found.' using errcode='P0002'; end if;
  if p_storage_path is null or p_storage_path like '%..%' or
    (storage.foldername(p_storage_path))[1] is distinct from auth.uid()::text or
    (storage.foldername(p_storage_path))[2] is distinct from p_submission_id::text or
    not exists(select 1 from storage.objects where bucket_id='graded-reports' and name=p_storage_path) then
    raise exception 'Use your own report upload for this submission.' using errcode='42501';
  end if;
  insert into public.submission_reports(submission_id,file_name,storage_path,mime_type,byte_size,uploaded_by)
  values(p_submission_id,p_file_name,p_storage_path,p_mime_type,p_byte_size,auth.uid())
  on conflict(storage_path) do nothing;
  select id into report_id from public.submission_reports where storage_path=p_storage_path and submission_id=p_submission_id;
  return report_id;
end;
$$;
revoke all on function public.attach_submission_report(uuid,text,text,text,integer) from public;
grant execute on function public.attach_submission_report(uuid,text,text,text,integer) to authenticated;
commit;

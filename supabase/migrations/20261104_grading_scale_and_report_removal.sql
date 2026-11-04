-- Run after the existing tutor-evaluation, report-upload and deletion migrations.
-- Installs capabilities only. No existing attempt, answer, grade or file is removed.
begin;

-- Existing grades retain their original denominator. New grades default to 150.
alter table public.submissions add column if not exists score_max smallint not null default 100 check(score_max in (100,150));
alter table public.tutor_evaluations add column if not exists score_max smallint not null default 100 check(score_max in (100,150));
alter table public.submissions alter column score_max set default 150;
alter table public.tutor_evaluations alter column score_max set default 150;
alter table public.submissions drop constraint if exists submissions_score_check;
alter table public.submissions add constraint submissions_score_check check(score is null or score between 0 and score_max);
alter table public.tutor_evaluations drop constraint if exists tutor_evaluations_score_check;
alter table public.tutor_evaluations add constraint tutor_evaluations_score_check check(score between 0 and score_max);

create or replace function public.save_tutor_evaluation(
  p_submission_id uuid,p_score numeric,p_feedback text,p_status text,p_revision integer,p_score_max integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_revision integer; evaluation_id uuid; now_at timestamptz:=now();
begin
  if not public.has_portal_role(array['admin','tutor']) then raise exception 'Active staff access required.' using errcode='42501'; end if;
  if p_score_max is null or p_score_max not in (100,150) or p_score is null or p_score not between 0 and p_score_max
    or p_status is null or p_status not in ('draft','published') or p_revision is null or p_revision<0
    or p_feedback is null or length(trim(p_feedback)) not between 1 and 20000 then
    raise exception 'Invalid evaluation or grading scale.' using errcode='23514';
  end if;
  -- Serialize first-time evaluation creation, attachments and report removal.
  perform 1 from public.submissions where id=p_submission_id for update;
  if not found then raise exception 'Submission not found.' using errcode='P0002'; end if;
  select revision into current_revision from public.tutor_evaluations where submission_id=p_submission_id for update;
  if found then
    if current_revision<>p_revision then raise exception 'This evaluation changed. Reload before saving.' using errcode='40001'; end if;
    update public.tutor_evaluations set score=p_score,score_max=p_score_max,feedback=trim(p_feedback),status=p_status,
      revision=revision+1,updated_at=now_at,published_at=case when p_status='published' then now_at else null end,created_by=auth.uid()
      where submission_id=p_submission_id returning id into evaluation_id;
  else
    if p_revision<>0 then raise exception 'This evaluation changed. Reload before saving.' using errcode='40001'; end if;
    insert into public.tutor_evaluations(submission_id,score,score_max,feedback,status,created_by,published_at)
      values(p_submission_id,p_score,p_score_max,trim(p_feedback),p_status,auth.uid(),case when p_status='published' then now_at else null end)
      returning id into evaluation_id;
  end if;
  update public.submissions set score=case when p_status='published' then p_score else null end,score_max=p_score_max,
    feedback=case when p_status='published' then trim(p_feedback) else '' end,
    status=case when p_status='published' then 'graded' else 'submitted' end,
    graded_by=case when p_status='published' then auth.uid() else null end,
    graded_at=case when p_status='published' then now_at else null end,revision=revision+1 where id=p_submission_id;
  return jsonb_build_object('id',evaluation_id,'status',p_status,'score_max',p_score_max,'revision',(select revision from public.tutor_evaluations where id=evaluation_id));
end; $$;
revoke all on function public.save_tutor_evaluation(uuid,numeric,text,text,integer,integer) from public,anon;
grant execute on function public.save_tutor_evaluation(uuid,numeric,text,text,integer,integer) to authenticated;

-- Old clients explicitly keep their original /100 meaning during rollout.
create or replace function public.save_tutor_evaluation(p_submission_id uuid,p_score numeric,p_feedback text,p_status text,p_revision integer)
returns jsonb language sql security definer set search_path='' as $$
  select public.save_tutor_evaluation(p_submission_id,p_score,p_feedback,p_status,p_revision,100);
$$;
revoke all on function public.save_tutor_evaluation(uuid,numeric,text,text,integer) from public,anon;
grant execute on function public.save_tutor_evaluation(uuid,numeric,text,text,integer) to authenticated;

create or replace function public.grade_submission(p_id uuid,p_score numeric,p_feedback text,p_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare current_revision integer; evaluation_revision integer;
begin
  if not public.has_portal_role(array['admin','tutor']) then raise exception 'Staff access required.' using errcode='42501'; end if;
  select revision into current_revision from public.submissions where id=p_id for update;
  if not found or p_revision is null or current_revision<>p_revision then raise exception 'This submission changed. Reload before saving.' using errcode='40001'; end if;
  select revision into evaluation_revision from public.tutor_evaluations where submission_id=p_id;
  perform public.save_tutor_evaluation(p_id,p_score,p_feedback,'published',coalesce(evaluation_revision,0),100);
end; $$;

create table if not exists public.report_deletions (
  report_id uuid primary key,submission_id uuid not null,storage_path text not null unique,
  file_name text not null,deleted_by uuid not null,deleted_at timestamptz not null default now(),
  cleanup_pending boolean not null default true
);
alter table public.report_deletions enable row level security;
revoke all on public.report_deletions from public,anon,authenticated;
grant select on public.report_deletions to authenticated;
drop policy if exists report_deletions_staff_read on public.report_deletions;
create policy report_deletions_staff_read on public.report_deletions for select to authenticated
  using(public.has_portal_role(array['admin','tutor']));

create or replace function public.remove_submission_report(p_submission_id uuid,p_report_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare report public.submission_reports%rowtype; previous public.report_deletions%rowtype;
begin
  if not public.has_portal_role(array['admin','tutor']) then raise exception 'Active staff access required.' using errcode='42501'; end if;
  -- Retried cleanup remains possible even after the whole attempt is deleted.
  select * into previous from public.report_deletions where report_id=p_report_id;
  if found then
    if previous.submission_id<>p_submission_id then raise exception 'Report not found.' using errcode='P0002'; end if;
    return jsonb_build_object('storage_path',previous.storage_path,'cleanup_pending',previous.cleanup_pending);
  end if;
  perform 1 from public.submissions where id=p_submission_id for update nowait;
  if not found then raise exception 'Submission not found.' using errcode='P0002'; end if;
  select * into report from public.submission_reports where id=p_report_id and submission_id=p_submission_id for update nowait;
  if not found then raise exception 'Report not found.' using errcode='P0002'; end if;
  if report.storage_path like '%..%' or cardinality(string_to_array(report.storage_path,'/'))<>3
    or split_part(report.storage_path,'/',2)<>p_submission_id::text then
    raise exception 'Report path requires review before removal.' using errcode='23514';
  end if;
  insert into public.report_deletions(report_id,submission_id,storage_path,file_name,deleted_by)
    values(report.id,p_submission_id,report.storage_path,report.file_name,auth.uid());
  delete from public.submission_reports where id=report.id;
  update public.submissions set revision=revision+1 where id=p_submission_id;
  return jsonb_build_object('storage_path',report.storage_path,'cleanup_pending',true);
end; $$;
revoke all on function public.remove_submission_report(uuid,uuid) from public,anon;
grant execute on function public.remove_submission_report(uuid,uuid) to authenticated;

create or replace function public.ack_report_removal(p_report_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare pending boolean;
begin
  if not public.has_portal_role(array['admin','tutor']) then raise exception 'Active staff access required.' using errcode='42501'; end if;
  update public.report_deletions d set cleanup_pending=
    exists(select 1 from storage.objects o where o.bucket_id='graded-reports' and o.name=d.storage_path)
    or exists(select 1 from public.submission_reports r where r.storage_path=d.storage_path)
    where report_id=p_report_id returning cleanup_pending into pending;
  if not found then raise exception 'Report deletion not found.' using errcode='P0002'; end if;
  return pending;
end; $$;
revoke all on function public.ack_report_removal(uuid) from public,anon;
grant execute on function public.ack_report_removal(uuid) to authenticated;

-- Block an old, retried attachment request from restoring a deliberately
-- deleted path while physical object cleanup is pending.
create or replace function public.attach_submission_report(
  p_submission_id uuid,p_storage_path text,p_file_name text,p_mime_type text,p_byte_size integer
) returns uuid language plpgsql security definer set search_path='' as $$
declare report_id uuid; evaluation uuid;
begin
  if not public.has_portal_role(array['admin','tutor']) then raise exception 'Active staff access required.' using errcode='42501'; end if;
  perform 1 from public.submissions where id=p_submission_id for update;
  if not found then raise exception 'Submission not found.' using errcode='P0002'; end if;
  if p_storage_path is null or p_storage_path like '%..%' or
    (storage.foldername(p_storage_path))[1] is distinct from auth.uid()::text or
    (storage.foldername(p_storage_path))[2] is distinct from p_submission_id::text or
    exists(select 1 from public.report_deletions where storage_path=p_storage_path) or
    not exists(select 1 from storage.objects where bucket_id='graded-reports' and name=p_storage_path) then
    raise exception 'Use a new report upload for this submission.' using errcode='42501';
  end if;
  select id into evaluation from public.tutor_evaluations where submission_id=p_submission_id;
  insert into public.submission_reports(submission_id,evaluation_id,file_name,storage_path,mime_type,byte_size,uploaded_by)
    values(p_submission_id,evaluation,p_file_name,p_storage_path,p_mime_type,p_byte_size,auth.uid())
    on conflict(storage_path) do update set evaluation_id=coalesce(public.submission_reports.evaluation_id,excluded.evaluation_id);
  select id into report_id from public.submission_reports where storage_path=p_storage_path and submission_id=p_submission_id;
  return report_id;
end; $$;

commit;
select table_name,column_name,column_default from information_schema.columns
  where table_schema='public' and table_name in ('submissions','tutor_evaluations') and column_name='score_max';

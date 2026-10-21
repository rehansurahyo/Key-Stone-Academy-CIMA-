-- Run after 20261019_student_trial_access.sql and the report/evaluation migrations.
-- Installs deletion capability only; it does NOT delete any existing attempts.
begin;

-- A small audit/outbox record survives the attempt. Never delete Storage metadata
-- with SQL: the server drains these paths through the Supabase Storage API.
create table if not exists public.submission_deletions (
  submission_id uuid primary key,
  submission_revision integer not null,
  deleted_by uuid not null,
  deleted_at timestamptz not null default now(),
  pending_report_paths text[] not null default '{}'
);
create index if not exists submission_deletions_pending_idx
  on public.submission_deletions(deleted_at desc) where pending_report_paths <> '{}'::text[];
alter table public.submission_deletions enable row level security;
revoke all on public.submission_deletions from public, anon, authenticated;
grant select on public.submission_deletions to authenticated;
drop policy if exists submission_deletions_admin_read on public.submission_deletions;
create policy submission_deletions_admin_read on public.submission_deletions
  for select to authenticated using (public.has_portal_role(array['admin']));

create or replace function public.delete_exam_submission(p_submission_id uuid, p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  target public.submissions%rowtype;
  previous public.submission_deletions%rowtype;
  attempt public.exam_sessions%rowtype;
  paths text[];
begin
  if not public.has_portal_role(array['admin']) then
    raise exception 'Active administrator access required.' using errcode='42501';
  end if;
  if p_revision is null or p_revision < 0 then
    raise exception 'Invalid submission revision.' using errcode='22023';
  end if;

  -- NOWAIT avoids waiting in the opposite lock order to an in-flight tutor
  -- evaluation or attachment. A conflict rolls back everything for safe retry.
  select * into target from public.submissions where id=p_submission_id for update nowait;
  if not found then
    select * into previous from public.submission_deletions where submission_id=p_submission_id;
    if not found then raise exception 'Submission not found.' using errcode='P0002'; end if;
    if previous.submission_revision <> p_revision then
      raise exception 'The submission changed. Reload before deleting.' using errcode='40001';
    end if;
    return jsonb_build_object('pending_report_paths',previous.pending_report_paths);
  end if;
  if target.revision <> p_revision then
    raise exception 'The submission changed. Reload before deleting.' using errcode='40001';
  end if;
  perform 1 from public.tutor_evaluations where submission_id=target.id for update nowait;
  select * into attempt from public.exam_sessions where id=target.session_id for update nowait;
  if not found or attempt.status <> 'completed'
    or attempt.user_id <> target.student_id or attempt.exam_id <> target.exam_id then
    raise exception 'Only a matching completed attempt can be deleted.' using errcode='23514';
  end if;

  -- Attached report paths are immutable and unique. Refuse malformed/legacy
  -- paths rather than risk deleting a different submission's file.
  if exists(select 1 from public.submission_reports where submission_id=target.id and
    (storage_path like '%..%' or cardinality(string_to_array(storage_path,'/')) <> 3
      or split_part(storage_path,'/',2) <> target.id::text)) then
    raise exception 'Report paths require review before deletion.' using errcode='23514';
  end if;
  select coalesce(array_agg(storage_path order by storage_path),'{}'::text[]) into paths
    from public.submission_reports where submission_id=target.id;
  insert into public.submission_deletions(submission_id,submission_revision,deleted_by,pending_report_paths)
    values(target.id,target.revision,auth.uid(),paths);

  -- One transaction: existing FK cascades remove this attempt's answers,
  -- submission, evaluation and report links, never its account or exam files.
  delete from public.exam_sessions where id=target.session_id;
  return jsonb_build_object('pending_report_paths',paths);
end;
$$;
revoke all on function public.delete_exam_submission(uuid,integer) from public, anon;
grant execute on function public.delete_exam_submission(uuid,integer) to authenticated;

create or replace function public.ack_submission_report_cleanup(p_submission_id uuid, p_paths text[])
returns integer language plpgsql security definer set search_path='' as $$
declare remaining integer;
begin
  if not public.has_portal_role(array['admin']) then
    raise exception 'Active administrator access required.' using errcode='42501';
  end if;
  -- A client cannot falsely acknowledge a file that still exists. Concurrent
  -- retries are idempotent; this operation can only shrink the recorded queue.
  update public.submission_deletions d set pending_report_paths=array(
    select path from unnest(d.pending_report_paths) path
    where not(path=any(coalesce(p_paths,'{}'::text[])))
      or exists(select 1 from storage.objects o where o.bucket_id='graded-reports' and o.name=path)
  ) where submission_id=p_submission_id;
  if not found then raise exception 'Deletion record not found.' using errcode='P0002'; end if;
  select cardinality(pending_report_paths) into remaining from public.submission_deletions where submission_id=p_submission_id;
  return remaining;
end;
$$;
revoke all on function public.ack_submission_report_cleanup(uuid,text[]) from public, anon;
grant execute on function public.ack_submission_report_cleanup(uuid,text[]) to authenticated;

commit;

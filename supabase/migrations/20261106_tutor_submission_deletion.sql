-- Run after 20261104_grading_scale_and_report_removal.sql.
-- Enables confirmed submission deletion for active tutors as well as admins.
-- Installing this migration does not delete attempts, answers, reports or receipts.
begin;

drop policy if exists submission_deletions_admin_read on public.submission_deletions;
drop policy if exists submission_deletions_staff_read on public.submission_deletions;
create policy submission_deletions_staff_read on public.submission_deletions
  for select to authenticated using (public.has_portal_role(array['admin','tutor']));

-- The UI checks this capability before exposing delete controls during rollout.
create or replace function public.can_delete_exam_submissions()
returns boolean language sql stable security definer set search_path='' as $$
  select public.has_portal_role(array['admin','tutor']);
$$;
revoke all on function public.can_delete_exam_submissions() from public, anon;
grant execute on function public.can_delete_exam_submissions() to authenticated;

create or replace function public.delete_exam_submission(p_submission_id uuid, p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  target public.submissions%rowtype;
  previous public.submission_deletions%rowtype;
  attempt public.exam_sessions%rowtype;
  paths text[];
begin
  if not public.has_portal_role(array['admin','tutor']) then
    raise exception 'Active administrator or tutor access required.' using errcode='42501';
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
  if not public.has_portal_role(array['admin','tutor']) then
    raise exception 'Active administrator or tutor access required.' using errcode='42501';
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

select to_regprocedure('public.can_delete_exam_submissions()') is not null as tutor_deletion_ready;

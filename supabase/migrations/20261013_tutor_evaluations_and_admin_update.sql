-- Run after 20261010_leads_and_report_delivery.sql.
begin;

create table if not exists public.tutor_evaluations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions(id) on delete cascade,
  score numeric(5,2) not null check (score between 0 and 100),
  feedback text not null check (length(trim(feedback)) between 1 and 20000),
  status text not null default 'draft' check (status in ('draft','published')),
  revision integer not null default 0 check (revision >= 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists tutor_evaluations_status_idx on public.tutor_evaluations(status, updated_at desc);

-- Preserve all historical grades as published tutor evaluations.
insert into public.tutor_evaluations(submission_id,score,feedback,status,revision,created_by,created_at,updated_at,published_at)
select id,score,feedback,'published',greatest(revision - 1, 0),coalesce(graded_by, student_id),submitted_at,coalesce(graded_at, submitted_at),coalesce(graded_at, submitted_at)
from public.submissions
where status='graded' and score is not null and length(trim(feedback)) > 0
on conflict(submission_id) do nothing;

alter table public.tutor_evaluations enable row level security;
revoke all on public.tutor_evaluations from anon, authenticated;
grant select on public.tutor_evaluations to authenticated;
drop policy if exists tutor_evaluations_read on public.tutor_evaluations;
create policy tutor_evaluations_read on public.tutor_evaluations for select to authenticated using (
  public.has_portal_role(array['admin','tutor'])
  or (
    status='published' and public.has_portal_role(array['student']) and exists(
      select 1 from public.submissions s where s.id=submission_id and s.student_id=(select auth.uid())
    )
  )
);

create or replace function public.save_tutor_evaluation(
  p_submission_id uuid,p_score numeric,p_feedback text,p_status text,p_revision integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_revision integer; evaluation_id uuid; now_at timestamptz := now();
begin
  if not public.has_portal_role(array['admin','tutor']) then
    raise exception 'Active staff access required.' using errcode='42501';
  end if;
  if p_status not in ('draft','published') or p_score is null or p_score not between 0 and 100
    or p_feedback is null or length(trim(p_feedback)) not between 1 and 20000 then
    raise exception 'Invalid evaluation.' using errcode='23514';
  end if;
  if not exists(select 1 from public.submissions where id=p_submission_id) then
    raise exception 'Submission not found.' using errcode='P0002';
  end if;

  select revision into current_revision from public.tutor_evaluations where submission_id=p_submission_id for update;
  if found then
    if current_revision <> p_revision then
      raise exception 'This evaluation changed. Reload before saving.' using errcode='40001';
    end if;
    update public.tutor_evaluations
      set score=p_score,feedback=trim(p_feedback),status=p_status,revision=revision+1,
          updated_at=now_at,published_at=case when p_status='published' then now_at else null end,
          created_by=auth.uid()
      where submission_id=p_submission_id returning id into evaluation_id;
  else
    if p_revision <> 0 then raise exception 'This evaluation changed. Reload before saving.' using errcode='40001'; end if;
    insert into public.tutor_evaluations(submission_id,score,feedback,status,created_by,published_at)
      values(p_submission_id,p_score,trim(p_feedback),p_status,auth.uid(),case when p_status='published' then now_at else null end)
      returning id into evaluation_id;
  end if;

  if p_status='published' then
    update public.submissions set score=p_score,feedback=trim(p_feedback),status='graded',graded_by=auth.uid(),graded_at=now_at,revision=revision+1
      where id=p_submission_id;
  else
    update public.submissions set score=null,feedback='',status='submitted',graded_by=null,graded_at=null,revision=revision+1
      where id=p_submission_id;
  end if;
  return jsonb_build_object('id',evaluation_id,'status',p_status,'revision',(select revision from public.tutor_evaluations where id=evaluation_id));
end;
$$;
revoke all on function public.save_tutor_evaluation(uuid,numeric,text,text,integer) from public;
grant execute on function public.save_tutor_evaluation(uuid,numeric,text,text,integer) to authenticated;
commit;

-- Run after 20261009_levels_and_submission_reports.sql.
-- Adds staff-assigned student levels and submission-only official solutions.
begin;

alter table public.profiles add column if not exists assigned_level text not null default 'SCS';
alter table public.profiles drop constraint if exists profiles_assigned_level_check;
alter table public.profiles add constraint profiles_assigned_level_check check (assigned_level in ('OCS','MCS','SCS'));
create index if not exists profiles_student_level_idx on public.profiles(assigned_level) where role='student';

-- A learner cannot self-assign another level through the existing self-update policy.
create or replace function public.protect_profile_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and auth.role() <> 'service_role'
     and not public.has_portal_role(array['admin']) then
    if tg_op = 'INSERT' and (new.role <> 'student' or not new.is_active) then
      raise exception 'Only administrators can assign roles or account access.';
    elsif tg_op = 'UPDATE' and (
      new.role is distinct from old.role or new.is_active is distinct from old.is_active
      or new.assigned_level is distinct from old.assigned_level or new.id is distinct from old.id
    ) then
      raise exception 'Only administrators can change account access or assigned level.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.has_assigned_exam_level(p_level text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles
    where id=(select auth.uid()) and role='student' and is_active and assigned_level=p_level);
$$;
revoke all on function public.has_assigned_exam_level(text) from public;
grant execute on function public.has_assigned_exam_level(text) to authenticated;

-- Solution files are kept in the existing private exam-materials bucket but are
-- visible only after this student submits the matching paper.
alter table public.exam_materials drop constraint if exists exam_materials_kind_check;
alter table public.exam_materials add constraint exam_materials_kind_check check (kind in ('reference','preseen','solution'));
create index if not exists exam_materials_solution_idx on public.exam_materials(exam_id) where kind='solution';

drop policy if exists exams_read on public.exams;
create policy exams_read on public.exams for select to authenticated using (
  public.has_portal_role(array['admin','tutor']) or (
    public.has_portal_role(array['student']) and (
      public.has_own_exam_attempt(id) or (status='published' and public.has_assigned_exam_level(level))
    )
  )
);

drop policy if exists materials_read on public.exam_materials;
create policy materials_read on public.exam_materials for select to authenticated using (
  public.has_portal_role(array['admin','tutor'])
  or (kind <> 'solution' and exists(select 1 from public.exams e where e.id=exam_id))
  or (kind='solution' and exists(select 1 from public.submissions s where s.exam_id=exam_materials.exam_id and s.student_id=(select auth.uid()) and s.status in ('submitted','graded')))
);

drop policy if exists exam_pdf_read on storage.objects;
create policy exam_pdf_read on storage.objects for select to authenticated using (
  bucket_id='exam-materials' and (
    public.has_portal_role(array['admin','tutor']) or exists(
      select 1 from public.exam_materials m where m.storage_path=storage.objects.name and (
        (m.kind <> 'solution' and exists(select 1 from public.exams e where e.id=m.exam_id))
        or (m.kind='solution' and exists(select 1 from public.submissions s where s.exam_id=m.exam_id and s.student_id=(select auth.uid()) and s.status in ('submitted','graded')))
      )
    )
  )
);

drop policy if exists exam_sessions_insert_own on public.exam_sessions;
create policy exam_sessions_insert_own on public.exam_sessions for insert to authenticated with check (
  user_id=(select auth.uid()) and public.has_portal_role(array['student','admin','tutor'])
  and status in ('not_started','in_progress') and exists(
    select 1 from public.exams e where e.id=exam_id and e.status='published' and (
      public.has_portal_role(array['admin','tutor']) or public.has_assigned_exam_level(e.level)
    )
  )
);

create or replace function public.guard_exam_start()
returns trigger language plpgsql security definer set search_path = '' as $$
declare availability text; exam_level text;
begin
  select status,level into availability,exam_level from public.exams where id=new.exam_id for share;
  if availability is distinct from 'published' or not (
    public.has_portal_role(array['admin','tutor']) or public.has_assigned_exam_level(exam_level)
  ) then raise exception 'This mock is not available for your assigned level.' using errcode='42501'; end if;
  return new;
end;
$$;
commit;

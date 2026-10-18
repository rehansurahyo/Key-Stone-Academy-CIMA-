-- Run after all migrations through 20261015. Existing students retain access.
begin;

alter table public.profiles add column if not exists access_type text not null default 'enrolled'
  check (access_type in ('enrolled','trial'));
-- Public Auth signups must never grant enrollment. Staff creation sets it explicitly.
alter table public.profiles alter column access_type set default 'trial';
alter table public.profiles add column if not exists trial_exam_id uuid references public.exams(id) on delete restrict;
-- Existing guest identities must not inherit the enrolled backfill.
update public.profiles p set access_type='trial'
where access_type='enrolled' and exists(select 1 from auth.users u where u.id=p.id and u.is_anonymous=true);
alter table public.free_trial_leads add column if not exists user_id uuid unique references auth.users(id) on delete set null;

create table if not exists public.trial_exam_access (
  level text primary key check (level in ('OCS','MCS','SCS')),
  exam_id uuid not null unique references public.exams(id) on delete cascade
);
alter table public.trial_exam_access enable row level security;
revoke all on public.trial_exam_access from anon, authenticated;
grant select,insert,update,delete on public.trial_exam_access to authenticated;
drop policy if exists trial_exam_admin on public.trial_exam_access;
create policy trial_exam_admin on public.trial_exam_access for all to authenticated
using (public.has_portal_role(array['admin'])) with check (public.has_portal_role(array['admin']));

-- Only a real published Mock 1 is selected, never an arbitrary first paper.
insert into public.trial_exam_access(level,exam_id)
select distinct on (level) level,id from public.exams
where status='published' and name ~* '\mmock[[:space:]_-]*0?1\M'
order by level,created_at,id on conflict(level) do nothing;

create or replace function public.register_trial_mock_one()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='published' and new.name ~* '\mmock[[:space:]_-]*0?1\M' then
    insert into public.trial_exam_access(level,exam_id) values(new.level,new.id)
    on conflict(level) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists register_trial_mock_one on public.exams;
create trigger register_trial_mock_one after insert or update on public.exams
for each row execute function public.register_trial_mock_one();

create or replace function public.protect_profile_access()
returns trigger language plpgsql security definer set search_path='' as $$
declare initializing_trial boolean := false;
begin
  if auth.uid() is not null and auth.role()<>'service_role'
     and not public.has_portal_role(array['admin']) then
    if tg_op='INSERT' then
      if new.role::text<>'student' or not new.is_active or new.access_type<>'trial' or new.trial_exam_id is not null then
        raise exception 'Only administrators can assign account access.' using errcode='42501';
      end if;
    else
      -- Only the one-time registration RPC can create the matching lead first.
      -- No client has INSERT/UPDATE privileges for its user_id or target level.
      initializing_trial := old.access_type='trial' and old.trial_exam_id is null
        and new.access_type='trial' and exists(
          select 1 from public.free_trial_leads l join public.trial_exam_access t on t.level=l.target_level
          join public.exams e on e.id=t.exam_id and e.level=t.level and e.status='published'
          where l.user_id=auth.uid() and l.user_id=new.id
          and new.assigned_level=l.target_level and new.trial_exam_id=t.exam_id
        );
      if new.role is distinct from old.role or new.is_active is distinct from old.is_active
        or new.id is distinct from old.id or new.access_type is distinct from old.access_type
        or ((new.assigned_level is distinct from old.assigned_level or new.trial_exam_id is distinct from old.trial_exam_id)
          and not initializing_trial) then
        raise exception 'Only administrators can change account access or assigned level.' using errcode='42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- The form now writes through an atomic, authenticated RPC, not public INSERT.
drop policy if exists free_trial_lead_submit on public.free_trial_leads;
revoke insert on public.free_trial_leads from anon, authenticated;

create or replace function public.register_free_trial(p_full_name text,p_email text,p_phone text,p_level text)
returns uuid language plpgsql security definer set search_path='' as $$
declare learner public.profiles; chosen uuid;
begin
  if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and is_anonymous=true) then
    raise exception 'A guest trial session is required.' using errcode='42501';
  end if;
  if length(trim(p_full_name)) not between 1 and 150 or p_full_name is null
    or p_email is null or length(trim(p_email)) not between 3 and 254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_phone is null or length(trim(p_phone)) not between 5 and 50
    or p_level is null or p_level not in ('OCS','MCS','SCS') then
    raise exception 'Enter valid trial contact details and level.' using errcode='22023';
  end if;
  select * into learner from public.profiles where id=auth.uid() for update;
  if not found or learner.role::text<>'student' or not learner.is_active or learner.access_type<>'trial' then
    raise exception 'Trial access is unavailable for this account.' using errcode='42501';
  end if;
  -- Refreshes, duplicate submissions and concurrent requests reuse one grant.
  if learner.trial_exam_id is not null then return learner.trial_exam_id; end if;
  select t.exam_id into chosen from public.trial_exam_access t join public.exams e on e.id=t.exam_id
    where t.level=p_level and e.level=p_level and e.status='published' for share of e;
  if chosen is null then
    raise exception 'Mock 1 is not available for this level yet. Please contact Keystone Academia.' using errcode='P0002';
  end if;
  insert into public.free_trial_leads(full_name,email,phone,target_level,user_id)
    values(trim(p_full_name),lower(trim(p_email)),trim(p_phone),p_level,auth.uid());
  update public.profiles set full_name=trim(p_full_name),email=lower(trim(p_email)),
    assigned_level=p_level,trial_exam_id=chosen where id=auth.uid();
  return chosen;
end;
$$;
revoke all on function public.register_free_trial(text,text,text,text) from public,anon;
grant execute on function public.register_free_trial(text,text,text,text) to authenticated;

create or replace function public.student_can_use_exam(p_exam uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p join public.exams e on e.id=p_exam
    where p.id=auth.uid() and p.role::text='student' and p.is_active and p.assigned_level=e.level
    and (p.access_type='enrolled' or (p.access_type='trial' and p.trial_exam_id=e.id))
    and (e.status='published' or public.has_own_exam_attempt(e.id)));
$$;
revoke all on function public.student_can_use_exam(uuid) from public,anon;
grant execute on function public.student_can_use_exam(uuid) to authenticated;

-- exams_read deliberately exposes ONLY catalog rows for locked same-level papers.
-- Questions, private PDFs and session creation have independent entitlement checks.
drop policy if exists questions_read on public.exam_questions;
create policy questions_read on public.exam_questions for select to authenticated using (
  public.has_portal_role(array['admin','tutor']) or public.student_can_use_exam(exam_id)
);
drop policy if exists materials_read on public.exam_materials;
create policy materials_read on public.exam_materials for select to authenticated using (
  public.has_portal_role(array['admin','tutor']) or (public.student_can_use_exam(exam_id) and (
    kind<>'solution' or exists(select 1 from public.submissions s where s.exam_id=exam_materials.exam_id
      and s.student_id=auth.uid() and s.status in ('submitted','graded'))
  ))
);
drop policy if exists exam_pdf_read on storage.objects;
create policy exam_pdf_read on storage.objects for select to authenticated using (
  bucket_id='exam-materials' and (public.has_portal_role(array['admin','tutor']) or exists(
    select 1 from public.exam_materials m where m.storage_path=storage.objects.name
      and public.student_can_use_exam(m.exam_id)
  ))
);
drop policy if exists exam_sessions_select_own on public.exam_sessions;
create policy exam_sessions_select_own on public.exam_sessions for select to authenticated using (
  (user_id=auth.uid() and (public.has_portal_role(array['admin','tutor']) or public.student_can_use_exam(exam_id)))
  or (status='completed' and public.has_portal_role(array['admin','tutor']))
);
drop policy if exists exam_sessions_insert_own on public.exam_sessions;
create policy exam_sessions_insert_own on public.exam_sessions for insert to authenticated with check (
  user_id=auth.uid() and status in ('not_started','in_progress')
  and (public.has_portal_role(array['admin','tutor']) or public.student_can_use_exam(exam_id))
);
drop policy if exists exam_sessions_update_own on public.exam_sessions;
create policy exam_sessions_update_own on public.exam_sessions for update to authenticated
using (user_id=auth.uid() and (public.has_portal_role(array['admin','tutor']) or public.student_can_use_exam(exam_id)))
with check (user_id=auth.uid() and (public.has_portal_role(array['admin','tutor']) or public.student_can_use_exam(exam_id)));

create or replace function public.guard_exam_start()
returns trigger language plpgsql security definer set search_path='' as $$
declare availability text;
begin
  select status into availability from public.exams where id=new.exam_id for share;
  if availability is distinct from 'published' or not (
    public.has_portal_role(array['admin','tutor']) or public.student_can_use_exam(new.exam_id)
  ) then raise exception 'This mock is locked for your account.' using errcode='42501'; end if;
  return new;
end;
$$;
commit;

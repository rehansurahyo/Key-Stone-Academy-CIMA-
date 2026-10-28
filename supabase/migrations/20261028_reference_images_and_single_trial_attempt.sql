-- Run after the 20261019 trial-access and 20261021 submission-deletion migrations.
-- No existing attempts, answers, grants or published exam content are removed.
begin;

-- Keep the bucket private and retain the existing staff-only upload/read rules.
update storage.buckets
set allowed_mime_types = array['application/pdf','image/png','image/jpeg']
where id = 'exam-materials';

-- A separate receipt survives admin deletion of a submitted attempt, so cleanup
-- cannot silently grant a second free attempt. No client can modify receipts.
create table if not exists public.trial_attempt_receipts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  exam_id uuid not null,
  session_id uuid not null,
  started_at timestamptz not null default now()
);
alter table public.trial_attempt_receipts enable row level security;
revoke all on public.trial_attempt_receipts from public, anon, authenticated;
grant select on public.trial_attempt_receipts to authenticated;
drop policy if exists trial_attempt_receipts_read on public.trial_attempt_receipts;
create policy trial_attempt_receipts_read on public.trial_attempt_receipts
for select to authenticated using (
  user_id = auth.uid() or public.has_portal_role(array['admin','tutor'])
);

-- Backfill only a receipt. Historical duplicate attempts remain untouched.
lock table public.exam_sessions in share row exclusive mode;
insert into public.trial_attempt_receipts(user_id,exam_id,session_id,started_at)
select distinct on (s.user_id) s.user_id,s.exam_id,s.id,coalesce(s.started_at,s.updated_at,now())
from public.exam_sessions s join public.profiles p on p.id=s.user_id
where p.role::text='student' and p.access_type='trial'
order by s.user_id,coalesce(s.started_at,s.updated_at,now()),s.id
on conflict(user_id) do nothing;

create or replace function public.enforce_single_trial_attempt()
returns trigger language plpgsql security definer set search_path='' as $$
declare learner_access text;
begin
  if tg_op='UPDATE' then
    if new.user_id is distinct from old.user_id or new.exam_id is distinct from old.exam_id then
      raise exception 'An attempt cannot be moved to another student or mock.' using errcode='42501';
    end if;
    return new;
  end if;
  select access_type into learner_access from public.profiles
    where id=new.user_id and role::text='student' for update;
  if learner_access='trial' then
    insert into public.trial_attempt_receipts(user_id,exam_id,session_id)
      values(new.user_id,new.exam_id,new.id) on conflict(user_id) do nothing;
    if not found then
      raise exception 'Your free-trial attempt has already been used. Resume your existing attempt or view your submitted answers on the dashboard.' using errcode='23505';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_single_trial_attempt() from public,anon,authenticated;
drop trigger if exists enforce_single_trial_attempt on public.exam_sessions;
create trigger enforce_single_trial_attempt
before insert or update of user_id,exam_id on public.exam_sessions
for each row execute function public.enforce_single_trial_attempt();

commit;

-- Verification: three supported types; the bucket remains private.
select id,public,allowed_mime_types from storage.buckets where id='exam-materials';

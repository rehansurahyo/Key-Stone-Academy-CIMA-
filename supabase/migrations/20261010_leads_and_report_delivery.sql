-- Run after 20261009_student_levels_and_solutions.sql.
begin;

-- Public enquiries are intentionally separated from authenticated profiles.
create table if not exists public.free_trial_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) between 1 and 150),
  email text not null check (length(trim(email)) between 3 and 254),
  phone text not null check (length(trim(phone)) between 5 and 50),
  target_level text not null check (target_level in ('OCS','MCS','SCS')),
  status text not null default 'new' check (status in ('new','contacted','converted','closed')),
  admin_notes text not null default '' check (length(admin_notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists free_trial_leads_status_created_idx on public.free_trial_leads(status, created_at desc);
create index if not exists free_trial_leads_email_idx on public.free_trial_leads(lower(email));

alter table public.free_trial_leads enable row level security;
revoke all on public.free_trial_leads from anon, authenticated;
grant insert on public.free_trial_leads to anon, authenticated;
grant select, update on public.free_trial_leads to authenticated;

drop policy if exists free_trial_lead_submit on public.free_trial_leads;
create policy free_trial_lead_submit on public.free_trial_leads for insert to anon, authenticated with check (
  status = 'new' and admin_notes = ''
);
drop policy if exists free_trial_lead_admin_read on public.free_trial_leads;
create policy free_trial_lead_admin_read on public.free_trial_leads for select to authenticated using (
  public.has_portal_role(array['admin'])
);
drop policy if exists free_trial_lead_admin_update on public.free_trial_leads;
create policy free_trial_lead_admin_update on public.free_trial_leads for update to authenticated using (
  public.has_portal_role(array['admin'])
) with check (public.has_portal_role(array['admin']));

create or replace function public.set_free_trial_lead_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists set_free_trial_lead_updated_at on public.free_trial_leads;
create trigger set_free_trial_lead_updated_at before update on public.free_trial_leads
for each row execute function public.set_free_trial_lead_updated_at();

-- The original policy allowed any authenticated user to read a report object
-- once metadata existed. Restrict direct Storage reads to active staff or the
-- owning student after the submission is graded.
drop policy if exists graded_report_read on storage.objects;
create policy graded_report_read on storage.objects for select to authenticated using (
  bucket_id = 'graded-reports' and (
    public.has_portal_role(array['admin','tutor'])
    or exists (
      select 1 from public.submission_reports r
      join public.submissions s on s.id = r.submission_id
      where r.storage_path = storage.objects.name
        and s.student_id = (select auth.uid())
        and s.status = 'graded'
    )
  )
);
commit;

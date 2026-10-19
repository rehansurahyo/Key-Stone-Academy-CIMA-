-- Run AFTER 20261019_student_trial_access.sql. Existing lead rows are preserved.
begin;
alter table public.free_trial_leads add column if not exists country text
  check (country is null or country ~ '^[A-Z]{2}$');
alter table public.free_trial_leads add column if not exists phone_country text
  check (phone_country is null or phone_country ~ '^[A-Z]{2}$');
alter table public.free_trial_leads add column if not exists country_code text
  check (country_code is null or country_code ~ '^\+[1-9][0-9]{0,2}$');

-- Keep the original four-argument RPC for already-open/older clients. Its
-- enrollment, ownership, row locking and fixed Mock 1 checks remain authoritative.
create or replace function public.register_free_trial_contact(
  p_full_name text,p_email text,p_phone text,p_level text,
  p_country text,p_phone_country text,p_country_code text
) returns uuid language plpgsql security definer set search_path='' as $$
declare chosen uuid;
begin
  if p_country is null or p_country !~ '^[A-Z]{2}$'
    or p_phone_country is null or p_phone_country !~ '^[A-Z]{2}$'
    or p_country_code is null or p_country_code !~ '^\+[1-9][0-9]{0,2}$'
    or p_phone is null or p_phone !~ '^\+[1-9][0-9]{6,14}$'
    or left(p_phone,length(p_country_code))<>p_country_code then
    raise exception 'Enter valid country and international phone details.' using errcode='22023';
  end if;
  chosen := public.register_free_trial(p_full_name,p_email,p_phone,p_level);
  -- First submission owns its contact metadata. Duplicate requests cannot
  -- rewrite a previous lead or alter the original level/grant.
  update public.free_trial_leads set country=p_country,phone_country=p_phone_country,country_code=p_country_code
    where user_id=auth.uid() and country is null and phone=p_phone and target_level=p_level;
  return chosen;
end;
$$;
revoke all on function public.register_free_trial_contact(text,text,text,text,text,text,text) from public,anon;
grant execute on function public.register_free_trial_contact(text,text,text,text,text,text,text) to authenticated;
commit;

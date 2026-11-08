-- LOCAL DRAFT: run only when email rollout is approved, after existing migrations.
-- No backfill, existing history deletion, access changes, or email network calls.
begin;
create table if not exists public.portal_email_jobs (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  kind text not null check(kind in ('trial_welcome','trial_submission','trial_feedback','enrolled_invitation')),
  user_id uuid not null references public.profiles(id) on delete cascade,
  submission_id uuid references public.submissions(id) on delete cascade,
  recipient text not null, full_name text not null, level text not null check(level in ('OCS','MCS','SCS')),
  exam_name text,
  state text not null default 'pending' check(state in ('pending','sending','sent','failed','cancelled','needs_review')),
  generation integer not null default 1, attempts integer not null default 0,
  claim_token uuid, locked_until timestamptz, next_attempt_at timestamptz not null default now(),
  encrypted_link text, first_send_at timestamptz, provider_message_id text, error_code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), sent_at timestamptz
);
create index if not exists portal_email_due_idx on public.portal_email_jobs(state,next_attempt_at);
alter table public.portal_email_jobs enable row level security;
revoke all on public.portal_email_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.portal_email_jobs to service_role;

create or replace function public.capture_portal_trial_email()
returns trigger language plpgsql security definer set search_path='' as $$
declare learner public.profiles; contact public.free_trial_leads; attempt public.submissions;
  email_kind text; key_value text; title text; exam_level text;
begin
  if tg_table_name='free_trial_leads' then
    select * into learner from public.profiles where id=new.user_id;
    if learner.role::text='student' and learner.access_type='trial' and learner.is_active then
      insert into public.portal_email_jobs(event_key,kind,user_id,recipient,full_name,level)
      values('trial_welcome:'||new.user_id,'trial_welcome',new.user_id,new.email,new.full_name,new.target_level)
      on conflict(event_key) do nothing;
    end if;
    return new;
  end if;
  if tg_table_name='tutor_evaluations' then
    if new.status<>'published' then return new; end if;
    if tg_op='UPDATE' then if old.status='published' then return new; end if; end if;
    select * into attempt from public.submissions where id=new.submission_id;
    email_kind:='trial_feedback';
  else
    attempt:=new; email_kind:='trial_submission';
  end if;
  select * into learner from public.profiles where id=attempt.student_id;
  if learner.role::text<>'student' or learner.access_type<>'trial' or not learner.is_active then return new; end if;
  select * into contact from public.free_trial_leads where user_id=learner.id order by created_at limit 1;
  if not found then return new; end if;
  select name,level into title,exam_level from public.exams where id=attempt.exam_id;
  key_value:=email_kind||':'||attempt.id;
  insert into public.portal_email_jobs(event_key,kind,user_id,submission_id,recipient,full_name,level,exam_name)
  values(key_value,email_kind,learner.id,attempt.id,contact.email,contact.full_name,exam_level,title)
  on conflict(event_key) do update set state='pending',next_attempt_at=now(),updated_at=now()
    where portal_email_jobs.state='cancelled';
  return new;
end; $$;
revoke all on function public.capture_portal_trial_email() from public,anon,authenticated;
drop trigger if exists capture_portal_trial_welcome on public.free_trial_leads;
create trigger capture_portal_trial_welcome after insert on public.free_trial_leads for each row execute function public.capture_portal_trial_email();
drop trigger if exists capture_portal_trial_submission on public.submissions;
create trigger capture_portal_trial_submission after insert on public.submissions for each row execute function public.capture_portal_trial_email();
drop trigger if exists capture_portal_trial_feedback on public.tutor_evaluations;
create trigger capture_portal_trial_feedback after insert or update of status on public.tutor_evaluations for each row execute function public.capture_portal_trial_email();

-- Only trusted server code can request/reissue an enrolled invitation. Existing
-- profiles are not upgraded, renamed, moved to another level, or duplicated.
create or replace function public.queue_enrolled_invitation(p_user_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare learner public.profiles; job public.portal_email_jobs;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server only.' using errcode='42501'; end if;
  select * into learner from public.profiles where id=p_user_id for update;
  if not found or learner.role::text<>'student' or learner.access_type<>'enrolled' or not learner.is_active or learner.email is null then
    raise exception 'An active enrolled student is required.' using errcode='42501';
  end if;
  select * into job from public.portal_email_jobs where event_key='enrolled_invitation:'||p_user_id for update;
  if found then
    if job.state in ('pending','sending') or job.updated_at>now()-interval '2 minutes' then return job.id; end if;
    if job.state='needs_review' then raise exception 'Check provider logs before reissuing an uncertain invitation.' using errcode='55000'; end if;
    update public.portal_email_jobs set state='pending',generation=generation+1,attempts=0,claim_token=null,locked_until=null,
      encrypted_link=null,first_send_at=null,provider_message_id=null,error_code=null,sent_at=null,
      recipient=learner.email,full_name=coalesce(learner.full_name,''),level=learner.assigned_level,
      created_at=now(),updated_at=now(),next_attempt_at=now() where id=job.id;
    return job.id;
  end if;
  insert into public.portal_email_jobs(event_key,kind,user_id,recipient,full_name,level)
    values('enrolled_invitation:'||p_user_id,'enrolled_invitation',p_user_id,learner.email,coalesce(learner.full_name,''),learner.assigned_level)
    returning id into job.id;
  return job.id;
end; $$;

create or replace function public.claim_portal_email()
returns setof public.portal_email_jobs language plpgsql security definer set search_path='' as $$
declare chosen uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server only.' using errcode='42501'; end if;
  -- Brevo's dedupe window is finite. Never blindly resend an uncertain delivery
  -- after ten minutes, even if the worker was offline/restarted for hours.
  update public.portal_email_jobs set state='needs_review',error_code='delivery_uncertain',updated_at=now(),claim_token=null
    where state in ('pending','sending') and first_send_at<now()-interval '10 minutes' and (locked_until is null or locked_until<now());
  update public.portal_email_jobs set state='cancelled',error_code='event_expired',updated_at=now()
    where state='pending' and created_at<now()-interval '2 days';
  update public.portal_email_jobs set state='needs_review',error_code='retry_limit',updated_at=now(),claim_token=null
    where state in ('pending','sending') and attempts>=5 and (locked_until is null or locked_until<now());
  select id into chosen from public.portal_email_jobs where
    ((state='pending' and next_attempt_at<=now()) or (state='sending' and locked_until<now())) and attempts<5
    order by created_at for update skip locked limit 1;
  if chosen is null then return; end if;
  return query update public.portal_email_jobs set state='sending',attempts=attempts+1,claim_token=gen_random_uuid(),
    locked_until=now()+interval '90 seconds',updated_at=now() where id=chosen returning *;
end; $$;

create or replace function public.prepare_portal_email(p_id uuid,p_claim uuid,p_encrypted_link text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server only.' using errcode='42501'; end if;
  update public.portal_email_jobs set encrypted_link=coalesce(encrypted_link,p_encrypted_link),
    first_send_at=coalesce(first_send_at,now()),updated_at=now()
    where id=p_id and claim_token=p_claim and state='sending' and locked_until>now();
  return found;
end; $$;

create or replace function public.finish_portal_email(p_id uuid,p_claim uuid,p_state text,p_message_id text,p_error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server only.' using errcode='42501'; end if;
  if p_state not in ('sent','pending','failed','cancelled') or length(coalesce(p_error_code,''))>80 then
    raise exception 'Invalid delivery result.' using errcode='22023';
  end if;
  update public.portal_email_jobs set state=case when p_state='pending' and attempts>=5 then 'needs_review' else p_state end,
    provider_message_id=left(p_message_id,255),error_code=p_error_code,
    sent_at=case when p_state='sent' then now() else null end,
    encrypted_link=case when p_state in ('sent','cancelled','failed') then null else encrypted_link end,
    next_attempt_at=now()+interval '30 seconds',claim_token=null,locked_until=null,updated_at=now()
    where id=p_id and claim_token=p_claim and state='sending';
  return found;
end; $$;

revoke all on function public.queue_enrolled_invitation(uuid),public.claim_portal_email(),public.prepare_portal_email(uuid,uuid,text),public.finish_portal_email(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.queue_enrolled_invitation(uuid),public.claim_portal_email(),public.prepare_portal_email(uuid,uuid,text),public.finish_portal_email(uuid,uuid,text,text,text) to service_role;
commit;

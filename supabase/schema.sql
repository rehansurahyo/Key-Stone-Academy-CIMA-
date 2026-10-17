-- Keystone Academia CIMA Exam Portal - Phase 2
-- Run this file in the Supabase SQL editor for a new project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'student' check (role in ('student', 'tutor', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  duration_seconds integer not null default 3600 check (duration_seconds > 0),
  time_remaining_seconds integer not null default 3600
    check (time_remaining_seconds >= 0),
  question_timers jsonb not null default '{}'::jsonb,
  active_question_id text,
  started_at timestamptz,
  ended_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.exam_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.exam_sessions(id) on delete cascade,
  question_id text not null,
  answer_text text not null default '',
  last_saved_at timestamptz not null default now(),
  constraint exam_answers_session_question_key unique (session_id, question_id)
);

create index if not exists exam_sessions_user_status_idx
  on public.exam_sessions (user_id, status, updated_at desc);
create index if not exists exam_answers_session_idx
  on public.exam_answers (session_id);

-- Store each question's countdown independently. The compatibility
-- time_remaining_seconds column mirrors the currently active question.
create or replace function public.sync_question_timer(
  p_session_id uuid,
  p_question_id text,
  p_remaining_seconds integer
)
returns void
language sql
set search_path = public
as $$
  update public.exam_sessions
  set question_timers = jsonb_set(
        coalesce(question_timers, '{}'::jsonb),
        array[p_question_id],
        jsonb_build_object(
          'remaining_seconds', greatest(0, p_remaining_seconds),
          'synced_at', now()
        ),
        true
      ),
      time_remaining_seconds = greatest(0, p_remaining_seconds),
      active_question_id = p_question_id,
      updated_at = now()
  where id = p_session_id
    and user_id = (select auth.uid())
    and status = 'in_progress';
$$;

-- Automatically create the student profile required by exam_sessions.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.exam_sessions enable row level security;
alter table public.exam_answers enable row level security;

-- Profiles: students can only access their own profile.
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id and role = 'student');

-- Sessions: ownership is always tied to auth.uid().
create policy "exam_sessions_select_own"
  on public.exam_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "exam_sessions_insert_own"
  on public.exam_sessions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "exam_sessions_update_own"
  on public.exam_sessions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Answers inherit ownership through their parent exam session.
create policy "exam_answers_select_own"
  on public.exam_answers for select
  to authenticated
  using (
    exists (
      select 1 from public.exam_sessions session
      where session.id = exam_answers.session_id
        and session.user_id = (select auth.uid())
    )
  );

create policy "exam_answers_insert_own"
  on public.exam_answers for insert
  to authenticated
  with check (
    exists (
      select 1 from public.exam_sessions session
      where session.id = exam_answers.session_id
        and session.user_id = (select auth.uid())
        and session.status = 'in_progress'
    )
  );

create policy "exam_answers_update_own"
  on public.exam_answers for update
  to authenticated
  using (
    exists (
      select 1 from public.exam_sessions session
      where session.id = exam_answers.session_id
        and session.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.exam_sessions session
      where session.id = exam_answers.session_id
        and session.user_id = (select auth.uid())
        and session.status = 'in_progress'
    )
  );

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.exam_sessions to authenticated;
grant select, insert, update on public.exam_answers to authenticated;
grant execute on function public.sync_question_timer(uuid, text, integer)
  to authenticated;

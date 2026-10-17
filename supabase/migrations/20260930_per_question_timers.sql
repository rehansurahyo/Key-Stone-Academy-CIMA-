-- Apply this migration to an existing Keystone CIMA Supabase project.
-- Each exam question now owns an independent 60-minute countdown.

alter table public.exam_sessions
  add column if not exists question_timers jsonb not null default '{}'::jsonb,
  add column if not exists active_question_id text;

alter table public.exam_sessions
  alter column duration_seconds set default 3600,
  alter column time_remaining_seconds set default 3600;

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

grant execute on function public.sync_question_timer(uuid, text, integer)
  to authenticated;

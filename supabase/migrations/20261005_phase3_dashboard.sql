-- Phase 3: run AFTER supabase/schema.sql (and the per-question migration).
-- Users remain in auth.users; profiles is the authoritative role directory.
-- Do not store privileged roles in user-editable auth metadata.
begin;

alter table public.profiles add column if not exists is_active boolean not null default true;

create or replace function public.has_portal_role(p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    -- Existing projects may use public.app_role instead of a text column.
    where id = (select auth.uid()) and is_active and role::text = any(p_roles)
  );
$$;
revoke all on function public.has_portal_role(text[]) from public;
grant execute on function public.has_portal_role(text[]) to authenticated;

create or replace function public.protect_profile_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and auth.role() <> 'service_role'
     and not public.has_portal_role(array['admin']) then
    if tg_op = 'INSERT' and (new.role <> 'student' or not new.is_active) then
      raise exception 'Only administrators can assign roles or account access.';
    elsif tg_op = 'UPDATE' and (
      new.role is distinct from old.role or new.is_active is distinct from old.is_active
      or new.id is distinct from old.id
    ) then
      raise exception 'Only administrators can change account access.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists protect_profile_access on public.profiles;
create trigger protect_profile_access before insert or update on public.profiles
for each row execute function public.protect_profile_access();

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  question_id text not null,
  position integer not null check (position > 0),
  duration_seconds integer not null default 3600 check (duration_seconds between 60 and 10800),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  unique (exam_id, question_id),
  unique (exam_id, position)
);
create table if not exists public.exam_materials (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('reference', 'preseen')),
  question_id text,
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  foreign key (exam_id, question_id) references public.exam_questions(exam_id, question_id)
);

-- Associate the existing static mock with a stable id, without losing old answers.
insert into public.exams(id, name, description, status)
values ('00000000-0000-4000-8000-000000000001', 'Kwirtmak Strategic Case Study — Mock 3',
        'Original Keystone three-question strategic case study.', 'published')
on conflict (id) do nothing;
alter table public.exam_sessions add column if not exists exam_id uuid
  references public.exams(id) on delete restrict;
alter table public.exam_sessions alter column exam_id set default '00000000-0000-4000-8000-000000000001';
update public.exam_sessions set exam_id = '00000000-0000-4000-8000-000000000001' where exam_id is null;
alter table public.exam_sessions alter column exam_id set not null;

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.exam_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete restrict,
  status text not null default 'submitted' check (status in ('submitted', 'graded')),
  score numeric(5,2) check (score between 0 and 100),
  feedback text not null default '',
  submitted_at timestamptz not null default now(),
  graded_by uuid references public.profiles(id) on delete set null,
  graded_at timestamptz,
  revision integer not null default 0,
  check (status <> 'graded' or (score is not null and length(trim(feedback)) > 0 and graded_at is not null))
);
create index if not exists submissions_status_date_idx on public.submissions(status, submitted_at desc);
create index if not exists submissions_student_idx on public.submissions(student_id);
create index if not exists exam_sessions_exam_idx on public.exam_sessions(exam_id);

-- A student completion and its grading-queue record are committed atomically.
create or replace function public.capture_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' then
    insert into public.submissions(session_id, student_id, exam_id, submitted_at)
    values (new.id, new.user_id, new.exam_id, coalesce(new.ended_at, now()))
    on conflict (session_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists capture_submission on public.exam_sessions;
create trigger capture_submission after insert or update of status on public.exam_sessions
for each row execute function public.capture_submission();
insert into public.submissions(session_id, student_id, exam_id, submitted_at)
select id, user_id, exam_id, coalesce(ended_at, updated_at) from public.exam_sessions
where status = 'completed' on conflict (session_id) do nothing;

-- Prevent reopening submitted work, moving ownership, or changing its exam.
create or replace function public.protect_exam_session()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id or new.exam_id is distinct from old.exam_id then
    raise exception 'Session ownership and exam cannot be changed.';
  end if;
  if old.status = 'completed' and new is distinct from old then
    raise exception 'Completed exams are permanently locked.';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_exam_session on public.exam_sessions;
create trigger protect_exam_session before update on public.exam_sessions
for each row execute function public.protect_exam_session();

alter table public.exams enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_materials enable row level security;
alter table public.submissions enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (
  id = (select auth.uid()) or public.has_portal_role(array['admin'])
  or (role = 'student' and public.has_portal_role(array['tutor']))
);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
using (id = (select auth.uid()) or public.has_portal_role(array['admin']))
with check (id = (select auth.uid()) or public.has_portal_role(array['admin']));

drop policy if exists exam_sessions_select_own on public.exam_sessions;
create policy exam_sessions_select_own on public.exam_sessions for select to authenticated using (
  (user_id = (select auth.uid()) and public.has_portal_role(array['student','admin','tutor']))
  or (status = 'completed' and public.has_portal_role(array['admin','tutor']))
);
drop policy if exists exam_sessions_insert_own on public.exam_sessions;
create policy exam_sessions_insert_own on public.exam_sessions for insert to authenticated with check (
  user_id = (select auth.uid()) and public.has_portal_role(array['student','admin','tutor'])
  and status in ('not_started','in_progress')
  and exists (select 1 from public.exams where id = exam_id and status = 'published')
);
drop policy if exists exam_sessions_update_own on public.exam_sessions;
create policy exam_sessions_update_own on public.exam_sessions for update to authenticated
using (user_id = (select auth.uid()) and public.has_portal_role(array['student','admin','tutor']))
with check (user_id = (select auth.uid()) and public.has_portal_role(array['student','admin','tutor']));

drop policy if exists exam_answers_select_own on public.exam_answers;
create policy exam_answers_select_own on public.exam_answers for select to authenticated using (
  exists (select 1 from public.exam_sessions s where s.id = session_id
    and (s.user_id = (select auth.uid()) or (s.status = 'completed' and public.has_portal_role(array['admin','tutor']))))
);

create policy exams_read on public.exams for select to authenticated using (
  public.has_portal_role(array['admin','tutor'])
  or (status = 'published' and public.has_portal_role(array['student']))
);
create policy exams_insert on public.exams for insert to authenticated with check (
  created_by = (select auth.uid()) and public.has_portal_role(array['admin','tutor'])
);
create policy questions_read on public.exam_questions for select to authenticated using (
  exists (select 1 from public.exams e where e.id = exam_id)
);
create policy questions_insert on public.exam_questions for insert to authenticated with check (
  public.has_portal_role(array['admin','tutor'])
  and exists (select 1 from public.exams e where e.id = exam_id and e.created_by = (select auth.uid()))
);
create policy materials_read on public.exam_materials for select to authenticated using (
  exists (select 1 from public.exams e where e.id = exam_id)
);
create policy materials_insert on public.exam_materials for insert to authenticated with check (
  public.has_portal_role(array['admin','tutor'])
  and exists (select 1 from public.exams e where e.id = exam_id and e.created_by = (select auth.uid()))
  and storage_path like ((select auth.uid())::text || '/%')
);
create policy submissions_read on public.submissions for select to authenticated using (
  public.has_portal_role(array['admin','tutor'])
  or (student_id = (select auth.uid()) and public.has_portal_role(array['student']))
);
-- No direct INSERT/UPDATE grants for submissions: triggers and the verified grading RPC own writes.
revoke insert, update, delete on public.exams, public.exam_questions, public.exam_materials from authenticated;
grant select on public.exams, public.exam_questions, public.exam_materials to authenticated;
revoke insert, update, delete on public.submissions from anon, authenticated;
grant select on public.submissions to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('exam-materials', 'exam-materials', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
allowed_mime_types = excluded.allowed_mime_types;
create policy exam_pdf_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'exam-materials' and public.has_portal_role(array['admin','tutor'])
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy exam_pdf_read on storage.objects for select to authenticated using (
  bucket_id = 'exam-materials' and (
    (public.has_portal_role(array['admin','tutor']))
    or exists (select 1 from public.exam_materials m join public.exams e on e.id = m.exam_id
      where m.storage_path = storage.objects.name and e.status = 'published' and public.has_portal_role(array['student']))
  )
);
create policy exam_pdf_cleanup on storage.objects for delete to authenticated using (
  bucket_id = 'exam-materials' and public.has_portal_role(array['admin','tutor'])
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (select 1 from public.exam_materials m where m.storage_path = storage.objects.name)
);

create or replace function public.create_mock_exam(
  p_id uuid, p_name text, p_description text, p_status text, p_questions jsonb, p_materials jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare material jsonb;
begin
  if not public.has_portal_role(array['admin','tutor']) then raise exception 'Staff access required.'; end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array'
    or p_materials is null or jsonb_typeof(p_materials) <> 'array' then
    raise exception 'Questions and materials must be arrays.';
  end if;
  if jsonb_array_length(p_questions) not between 1 and 12 then raise exception 'Provide 1–12 questions.'; end if;
  for material in select value from jsonb_array_elements(p_materials) loop
    if not exists (select 1 from storage.objects where bucket_id = 'exam-materials'
      and name = material->>'storage_path' and (storage.foldername(name))[1] = auth.uid()::text) then
      raise exception 'An uploaded PDF could not be found.';
    end if;
  end loop;
  insert into public.exams(id, name, description, status, created_by)
  values (p_id, p_name, p_description, p_status, auth.uid());
  insert into public.exam_questions(exam_id, question_id, position, duration_seconds, content)
  select p_id, q->>'question_id', (q->>'position')::integer, (q->>'duration_seconds')::integer, q->'content'
  from jsonb_array_elements(p_questions) q;
  insert into public.exam_materials(exam_id, name, kind, question_id, storage_path)
  select p_id, m->>'name', m->>'kind', m->>'question_id', m->>'storage_path'
  from jsonb_array_elements(p_materials) m;
  return p_id;
end;
$$;
revoke all on function public.create_mock_exam(uuid,text,text,text,jsonb,jsonb) from public;
grant execute on function public.create_mock_exam(uuid,text,text,text,jsonb,jsonb) to authenticated;

-- The revision check prevents two tutors silently overwriting each other's feedback.
create or replace function public.grade_submission(p_id uuid, p_score numeric, p_feedback text, p_revision integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_portal_role(array['admin','tutor']) then raise exception 'Staff access required.'; end if;
  if p_score is null or p_score not between 0 and 100 or p_feedback is null
    or length(trim(p_feedback)) not between 1 and 20000 then raise exception 'Invalid grade or feedback.'; end if;
  update public.submissions set score = p_score, feedback = trim(p_feedback), status = 'graded',
    graded_by = auth.uid(), graded_at = now(), revision = revision + 1
  where id = p_id and revision = p_revision;
  if not found then raise exception 'This submission changed. Reload before saving.' using errcode = '40001'; end if;
end;
$$;
revoke all on function public.grade_submission(uuid,numeric,text,integer) from public;
grant execute on function public.grade_submission(uuid,numeric,text,integer) to authenticated;

insert into public.exam_questions(exam_id, question_id, position, duration_seconds, content)
values ('00000000-0000-4000-8000-000000000001', 'section-1', 1, 3600,
  $legacy${
  "section": 1,
  "timeMinutes": 60,
  "from": "Agata Paluch, CFO",
  "to": "Senior Finance Manager",
  "subject": "Smart-Print Programme & Funding Approach",
  "intro": "I've attached an extract from the latest capital plan outlining the proposed investment in our AI-driven Smart-Print ecosystem and the financing route being considered. As this represents a major shift in how we operate and how we position ourselves with investors, the Board wants clarity on the strategic implications and the funding signals involved.",
  "taskPrompt": "Please prepare briefing papers for the following:",
  "partA": "Consider how integrating AI into our printers may influence our long-term strategic direction and ecosystem positioning. (sub task - 60%)",
  "weightA": "60%",
  "partB": "Reflect on how we should incorporate sustainability perspective while evaluating the funding strategy. (sub task - 40%)",
  "weightB": "40%",
  "referenceDocTitle": "Green Initiative Capital Plan – Smart Print Ecosystem",
  "referenceDocColor": "text-[#2e7d32]",
  "referenceParagraphs": [
    "Kwirtmak has announced a major sustainability initiative aimed at reducing energy consumption and material waste across its global operations. Central to the plan is a proprietary AI platform designed to autonomously operate the entire fleet of printers, optimising performance, reducing downtime and minimising resource usage. The shift marks a significant evolution from selling standalone hardware to offering an integrated digital ecosystem built around software intelligence.",
    "To support this transition, the Board is proposing a substantial capital investment in the Smart-Print programme. The initiative is expected to reshape the company’s long-term business model, with a greater emphasis on recurring software revenues, data-driven services and ecosystem lock-in. Early internal projections suggest that the move could strengthen customer retention and create new revenue streams tied to predictive maintenance, automated workflows and sustainability reporting.",
    "The Board intends to finance the programme through the issuance of Corporate Green Bonds. The proposal has attracted attention from analysts, who note that the decision may signal a strong commitment to environmental performance and long-term sustainability goals. Some observers have questioned whether drawing on retained earnings might have been a simpler route, but others suggest that the use of Green Bonds could enhance credibility with investors focused on environmental impact and responsible financing."
  ]
}$legacy$::jsonb)
on conflict (exam_id, question_id) do nothing;

insert into public.exam_questions(exam_id, question_id, position, duration_seconds, content)
values ('00000000-0000-4000-8000-000000000001', 'section-2', 2, 3600,
  $legacy${
  "section": 2,
  "timeMinutes": 60,
  "from": "Agata Paluch, CFO",
  "to": "Senior Finance Manager",
  "subject": "Activist Position & Shareholder Response",
  "intro": "I've attached a recent open letter published by an activist fund outlining their concerns about our capital allocation and their intentions regarding Board leadership. With the situation gaining public attention, Investor Relations needs clarity on how these issues may influence perceptions of our performance and governance.",
  "taskPrompt": "Please prepare briefing papers for the following:",
  "partA": "Assess how the activist fund may use financial ratios to support their position and influence wider shareholder sentiment. (sub task - 60%)",
  "weightA": "60%",
  "partB": "Evaluate on the risks to the organisation if the Board chooses not to engage with the activist group. (sub task - 40%)",
  "weightB": "40%",
  "referenceDocTitle": "Ennland Telegraph – Markets & Governance Report",
  "referenceDocColor": "text-[#c62828]",
  "referenceParagraphs": [
    "Kwirtmak has come under renewed scrutiny after an activist hedge fund disclosed a 12% stake and issued a public letter criticising the company’s capital allocation approach. The fund argues that the legacy hardware division is suppressing group valuation and claims that shareholders have not been adequately rewarded despite recent strategic pivots. Their statement has sparked debate among analysts, many of whom are now revisiting the company’s recent financial performance.",
    "The activist group has demanded a substantial special dividend, stating that the company’s balance sheet can support a significant payout without compromising operational stability. They have also questioned whether the Board has been sufficiently decisive in reshaping the portfolio, suggesting that the current structure may be limiting returns. Market commentators note that the fund’s messaging appears designed to appeal to investors seeking short-term value realisation.",
    "In a more confrontational move, the activist fund has threatened to initiate a proxy campaign to replace Non-Executive Chair Madda Fedele if the Board does not respond to their demands. Governance specialists warn that such disputes can create uncertainty among institutional investors and may influence perceptions of leadership stability. Observers suggest that the Board’s handling of the situation will be closely watched in the coming weeks."
  ]
}$legacy$::jsonb)
on conflict (exam_id, question_id) do nothing;

insert into public.exam_questions(exam_id, question_id, position, duration_seconds, content)
values ('00000000-0000-4000-8000-000000000001', 'section-3', 3, 3600,
  $legacy${
  "section": 3,
  "timeMinutes": 60,
  "from": "Agata Paluch, CFO",
  "to": "Senior Finance Manager",
  "subject": "Demerger Proposal & Organisational Impact",
  "intro": "I've attached an internal analysis summarising the activist fund's latest proposal and the organisational tensions emerging as we accelerate the AI transition. With pressure building both externally and internally, the CEO wants clarity on the financial implications of the proposed demerger and the leadership approach required to stabilise the organisation.",
  "taskPrompt": "Please prepare briefing papers for the following:",
  "partA": "Consider how separating the Printing Materials division into a standalone listed entity may influence our financial position and long-term strategic coherence. (sub task - 40%)",
  "weightA": "40%",
  "partB": "Reflect on how leadership should respond to the cultural disruption arising from the shift toward an AI-driven operating model. (sub task - 60%)",
  "weightB": "60%",
  "referenceDocTitle": "Organisational Change & Demerger Analysis",
  "referenceDocColor": "text-[#d32f2f]",
  "referenceParagraphs": [
    "The activist hedge fund has intensified its campaign by calling for a full corporate spin-off of Kwirtmak’s highly profitable Printing Materials division. Their argument centres on the belief that the division’s performance is being undervalued within the wider group structure, and that a separate listing would unlock immediate shareholder value. Analysts note that the proposal comes at a time when the company is already navigating significant strategic change.",
    "Internally, the shift toward becoming an AI-driven, sustainability-focused technology company has created visible friction. Traditional mechanical engineering teams, long accustomed to hardware-centric operations, have expressed concerns about their future role and relevance. Several managers have reported rising resistance to new workflows, with some teams struggling to adapt to the software-first direction being championed by senior leadership.",
    "The combination of external pressure for structural change and internal uncertainty has raised questions about organisational cohesion. Observers warn that a demerger could weaken the integrated ecosystem that has historically linked hardware, materials and service offerings. At the same time, the cultural disruption triggered by the AI transition may require more active leadership involvement to maintain confidence and ensure alignment across the workforce."
  ]
}$legacy$::jsonb)
on conflict (exam_id, question_id) do nothing;

commit;

-- Bootstrap the FIRST administrator manually in the Supabase SQL editor:
-- update public.profiles set role = 'admin' where email = 'your-admin@example.com';
-- Never expose this operation as a public sign-up form.

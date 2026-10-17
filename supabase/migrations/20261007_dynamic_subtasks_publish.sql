-- Run after 20261005_phase3_dashboard.sql. Additive: preserves sessions/answers.
-- content.subtasks: [{"description":"Evaluate funding", "weightage":35}, ...]
-- content.weightageUnit: "percent" (total 100) or "marks" (custom total).
begin;

create or replace function public.normalize_question_subtasks(p_content jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
begin
  if p_content ? 'subtasks' then
    return p_content || jsonb_build_object('weightageUnit', coalesce(p_content->>'weightageUnit','percent'));
  end if;
  if jsonb_typeof(p_content->'partA') = 'string' and jsonb_typeof(p_content->'partB') = 'string'
    and coalesce(p_content->>'weightA','') ~ '^[0-9]+([.][0-9]+)?%?$'
    and coalesce(p_content->>'weightB','') ~ '^[0-9]+([.][0-9]+)?%?$' then
    return p_content || jsonb_build_object('weightageUnit','percent','subtasks',jsonb_build_array(
      jsonb_build_object('description',p_content->>'partA','weightage',replace(p_content->>'weightA','%','')::numeric),
      jsonb_build_object('description',p_content->>'partB','weightage',replace(p_content->>'weightB','%','')::numeric)
    ));
  end if;
  return p_content;
end;
$$;

create or replace function public.valid_question_subtasks(p_content jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare task jsonb; amount numeric; total numeric := 0; unit text;
begin
  if coalesce(jsonb_typeof(p_content),'') <> 'object'
    or coalesce(jsonb_typeof(p_content->'subtasks'),'') <> 'array' then return false; end if;
  if jsonb_array_length(p_content->'subtasks') not between 1 and 100 then return false; end if;
  unit := coalesce(p_content->>'weightageUnit','percent');
  if unit not in ('percent','marks') then return false; end if;
  for task in select value from jsonb_array_elements(p_content->'subtasks') loop
    if coalesce(jsonb_typeof(task),'') <> 'object'
      or coalesce(jsonb_typeof(task->'description'),'') <> 'string'
      or length(trim(task->>'description')) not between 1 and 20000
      or coalesce(jsonb_typeof(task->'weightage'),'') <> 'number' then return false; end if;
    amount := (task->>'weightage')::numeric;
    if amount <= 0 or amount > 100000 or amount <> round(amount,2) then return false; end if;
    total := total + amount;
  end loop;
  return unit = 'marks' or total = 100;
end;
$$;

-- Backfill valid legacy (a)/(b) content only. Retain legacy keys for old clients.
update public.exam_questions set content = public.normalize_question_subtasks(content)
where not (content ? 'subtasks')
  and public.valid_question_subtasks(public.normalize_question_subtasks(content));

alter table public.exam_questions drop constraint if exists exam_questions_subtasks_valid;
alter table public.exam_questions add constraint exam_questions_subtasks_valid
  check (not (content ? 'subtasks') or public.valid_question_subtasks(content));

-- Existing unknown legacy rows remain untouched; all new/edited rows are valid.
create or replace function public.enforce_question_subtasks()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.content := public.normalize_question_subtasks(new.content);
  if not public.valid_question_subtasks(new.content) then
    raise exception 'Provide 1–100 described subtasks with positive weightage (up to 2 decimal places); percentages must total 100.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_question_subtasks on public.exam_questions;
create trigger enforce_question_subtasks before insert or update of content on public.exam_questions
for each row execute function public.enforce_question_subtasks();

-- Existing status check already restricts exams to draft/published. Keep RLS on.
-- Phase 3 revoked table writes; restore ONLY status writes, still gated by RLS.
grant update(status) on public.exams to authenticated;
drop policy if exists exams_update_staff on public.exams;
create policy exams_update_staff on public.exams for update to authenticated
using (public.has_portal_role(array['admin','tutor']))
with check (public.has_portal_role(array['admin','tutor']));

create or replace function public.enforce_exam_publication()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'published' and new.status is distinct from old.status then
    raise exception 'Published mocks cannot be reverted to drafts.' using errcode = '23514';
  end if;
  if new.status = 'published' and old.status is distinct from new.status then
    if not exists (select 1 from public.exam_questions where exam_id = new.id)
      or exists (select 1 from public.exam_questions where exam_id = new.id
        and not public.valid_question_subtasks(content)) then
      raise exception 'A mock needs valid questions and subtask weightages before publishing.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_exam_publication on public.exams;
create trigger enforce_exam_publication before update of status on public.exams
for each row execute function public.enforce_exam_publication();

-- Invoker rights: the user's RLS permissions apply. Concurrent/repeated clicks
-- serialize on the exam row and return the same successful published state.
create or replace function public.publish_mock_exam(p_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare current_status text;
begin
  if not public.has_portal_role(array['admin','tutor']) then
    raise exception 'Active staff access required.' using errcode = '42501';
  end if;
  select status into current_status from public.exams where id = p_id for update;
  if not found then raise exception 'Mock exam not found.' using errcode = 'P0002'; end if;
  if current_status = 'published' then return p_id; end if;
  update public.exams set status = 'published' where id = p_id;
  return p_id;
end;
$$;
revoke all on function public.publish_mock_exam(uuid) from public;
grant execute on function public.publish_mock_exam(uuid) to authenticated;

-- Create as draft, write validated questions/materials, then publish atomically.
-- Legacy API content with partA/partB is normalized by the question trigger.
create or replace function public.create_mock_exam(
  p_id uuid, p_name text, p_description text, p_status text, p_questions jsonb, p_materials jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare material jsonb;
begin
  if not public.has_portal_role(array['admin','tutor']) then raise exception 'Staff access required.'; end if;
  if p_status is null or p_status not in ('draft','published') then raise exception 'Invalid mock status.'; end if;
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
  values (p_id, p_name, p_description, 'draft', auth.uid());
  insert into public.exam_questions(exam_id, question_id, position, duration_seconds, content)
  select p_id, q->>'question_id', (q->>'position')::integer, (q->>'duration_seconds')::integer, q->'content'
  from jsonb_array_elements(p_questions) q;
  insert into public.exam_materials(exam_id, name, kind, question_id, storage_path)
  select p_id, m->>'name', m->>'kind', m->>'question_id', m->>'storage_path'
  from jsonb_array_elements(p_materials) m;
  if p_status = 'published' then perform public.publish_mock_exam(p_id); end if;
  return p_id;
end;
$$;
revoke all on function public.create_mock_exam(uuid,text,text,text,jsonb,jsonb) from public;
grant execute on function public.create_mock_exam(uuid,text,text,text,jsonb,jsonb) to authenticated;

commit;

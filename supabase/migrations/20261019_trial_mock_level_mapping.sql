-- Run AFTER 20261019_trial_lead_contact_details.sql in Supabase SQL Editor.
-- Atomic and safe to re-run. No existing attempts, answers or grants are moved.
begin;

create or replace function public.register_trial_mock_one()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- A level correction must remove this paper's obsolete mapping before the
  -- new mapping is inserted. Otherwise UNIQUE(exam_id) aborts publication.
  delete from public.trial_exam_access where exam_id=new.id and level<>new.level;
  if new.status='published' and new.name ~* '\mmock[[:space:]_-]*0?1\M' then
    insert into public.trial_exam_access(level,exam_id) values(new.level,new.id)
    on conflict(level) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.create_mock_exam_with_level(
  p_id uuid,p_name text,p_description text,p_status text,p_questions jsonb,p_materials jsonb,p_level text
) returns uuid language plpgsql security definer set search_path='' as $$
begin
  if p_level is null or p_level not in ('OCS','MCS','SCS') then
    raise exception 'Invalid case study level.' using errcode='23514';
  end if;
  if p_status is null or p_status not in ('draft','published') then
    raise exception 'Invalid mock status.' using errcode='23514';
  end if;
  -- Validate/write questions as a draft, apply the selected level, THEN publish.
  -- This prevents transient default-SCS publication from granting the wrong level.
  perform public.create_mock_exam(p_id,p_name,p_description,'draft',p_questions,p_materials);
  update public.exams set level=p_level where id=p_id;
  if p_status='published' then perform public.publish_mock_exam(p_id); end if;
  return p_id;
end;
$$;
revoke all on function public.create_mock_exam_with_level(uuid,text,text,text,jsonb,jsonb,text) from public;
grant execute on function public.create_mock_exam_with_level(uuid,text,text,text,jsonb,jsonb,text) to authenticated;

-- Remove only structurally stale mappings. Do not replace valid administrator
-- choices or change any existing learner's assigned level/trial_exam_id.
delete from public.trial_exam_access t using public.exams e
where t.exam_id=e.id and t.level<>e.level;
insert into public.trial_exam_access(level,exam_id)
select distinct on (level) level,id from public.exams
where status='published' and name ~* '\mmock[[:space:]_-]*0?1\M'
order by level,created_at,id on conflict(level) do nothing;

-- Targeted repair of the verified legacy OCS Mock 1. It predates level support
-- and has completed attempts/SCS trial grants: preserve the original unchanged
-- and publish an OCS content copy, sharing immutable PDF objects.
do $$
declare source public.exams; target uuid;
begin
  select * into source from public.exams
  where id='0b36d2d4-0a2c-4f16-b5f1-b5a6e2ce6f69' for update;
  if not found then return; end if;
  -- Do not infer/correct unrelated exams or overwrite a later staff decision.
  if source.name<>'CIMA OCS Mock 1' or source.level<>'SCS' or source.status<>'published' then return; end if;
  if not exists(select 1 from public.exam_questions where exam_id=source.id)
    or exists(select 1 from public.exam_questions where exam_id=source.id
      and not public.valid_question_subtasks(content)) then
    raise exception 'Legacy Mock 1 has invalid questions; repair rolled back.' using errcode='23514';
  end if;

  -- Stop NEW SCS visitors receiving an OCS paper. Existing SCS learner grants
  -- refer directly to the untouched original, not to this discovery mapping.
  delete from public.trial_exam_access where level='SCS' and exam_id=source.id;

  -- Never replace an already valid, published OCS trial choice.
  select e.id into target from public.trial_exam_access t join public.exams e on e.id=t.exam_id
    where t.level='OCS' and e.level='OCS' and e.status='published';
  if target is not null then return; end if;
  if exists(select 1 from public.trial_exam_access where level='OCS') then
    raise exception 'An OCS trial choice already exists but is not published. Publish/review it first; no records changed.';
  end if;

  -- Reuse a previous repair copy if it was subsequently unpublished; do not
  -- create another copy or silently re-publish a staff-disabled paper.
  if exists(select 1 from public.exams where copied_from=source.id and level='OCS') then
    raise exception 'An OCS copy of Mock 1 already exists. Review/publish that copy; no records changed.';
  end if;
  target:=gen_random_uuid();
  insert into public.exams(id,name,description,status,created_by,copied_from)
    values(target,source.name,source.description,'draft',source.created_by,source.id);
  -- The backward-compatible INSERT trigger inherits the source level first.
  update public.exams set level='OCS' where id=target;
  insert into public.exam_questions(exam_id,question_id,position,duration_seconds,content)
    select target,question_id,position,duration_seconds,content
    from public.exam_questions where exam_id=source.id;
  insert into public.exam_materials(exam_id,name,kind,question_id,storage_path)
    select target,name,kind,question_id,storage_path
    from public.exam_materials where exam_id=source.id;
  update public.exams set status='published',revision=revision+1 where id=target;
  -- Normally inserted by the trigger; explicit confirmation makes failure atomic.
  if not exists(select 1 from public.trial_exam_access where level='OCS' and exam_id=target) then
    raise exception 'OCS trial mapping was not created; repair rolled back.';
  end if;
end;
$$;

commit;

-- Verification output: OCS should have a published Mock 1 after the repair.
select t.level,e.name,e.status,e.id as exam_id
from public.trial_exam_access t join public.exams e on e.id=t.exam_id
order by t.level;

-- Run AFTER 20261007_dynamic_subtasks_publish.sql. No existing answers are deleted.
begin;
alter table public.exams add column if not exists revision integer not null default 0;
alter table public.exams add column if not exists copied_from uuid references public.exams(id) on delete set null;
alter table public.exams drop constraint if exists exams_status_check;
alter table public.exams add constraint exams_status_check check(status in ('draft','published','archived'));
-- Versioned mocks share immutable PDF objects; metadata belongs to each version.
alter table public.exam_materials drop constraint if exists exam_materials_storage_path_key;
create index if not exists exam_materials_storage_path_idx on public.exam_materials(storage_path);
revoke update on public.exams from authenticated;
revoke update(status) on public.exams from authenticated;
drop policy if exists exams_update_staff on public.exams;

create or replace function public.enforce_exam_publication()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status='published' and old.status is distinct from new.status then
    if not exists(select 1 from public.exam_questions where exam_id=new.id)
      or exists(select 1 from public.exam_questions where exam_id=new.id and not public.valid_question_subtasks(content)) then
      raise exception 'A mock needs valid questions and subtask weightages before publishing.' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;

-- Staff see the library. Students retain access ONLY to their own historical
-- paper after unpublish/archive, including its questions, PDFs and feedback.
-- Definer helper avoids a sessions INSERT-policy -> exams -> sessions cycle.
create or replace function public.has_own_exam_attempt(p_exam uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_portal_role(array['student']) and exists(
    select 1 from public.exam_sessions where exam_id=p_exam and user_id=(select auth.uid())
  );
$$;
revoke all on function public.has_own_exam_attempt(uuid) from public;
grant execute on function public.has_own_exam_attempt(uuid) to authenticated;
drop policy if exists exams_read on public.exams;
create policy exams_read on public.exams for select to authenticated using (
  public.has_portal_role(array['admin','tutor']) or (
    public.has_portal_role(array['student']) and (status='published' or public.has_own_exam_attempt(id))
  )
);
drop policy if exists exam_pdf_read on storage.objects;
create policy exam_pdf_read on storage.objects for select to authenticated using (
  bucket_id='exam-materials' and (public.has_portal_role(array['admin','tutor']) or (
    public.has_portal_role(array['student']) and exists(
      select 1 from public.exam_materials m join public.exams e on e.id=m.exam_id where m.storage_path=storage.objects.name
    )
  ))
);

-- Serialize starting an attempt with edit/remove/unpublish on the same exam.
create or replace function public.guard_exam_start()
returns trigger language plpgsql security definer set search_path = '' as $$
declare availability text;
begin
  select status into availability from public.exams where id=new.exam_id for share;
  if availability is distinct from 'published' then
    raise exception 'This mock is no longer accepting new attempts.' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_exam_start on public.exam_sessions;
create trigger guard_exam_start before insert on public.exam_sessions for each row execute function public.guard_exam_start();

create or replace function public.protect_attempted_mock_content()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.exam_sessions where exam_id=old.exam_id) then
    raise exception 'Attempted mock content is immutable. Create a draft copy instead.' using errcode='23514';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists protect_attempted_mock_content on public.exam_questions;
create trigger protect_attempted_mock_content before update or delete on public.exam_questions
for each row execute function public.protect_attempted_mock_content();
drop trigger if exists protect_attempted_mock_content on public.exam_materials;
create trigger protect_attempted_mock_content before update or delete on public.exam_materials
for each row execute function public.protect_attempted_mock_content();

create or replace function public.get_mock_attempt_counts(p_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_portal_role(array['admin','tutor']) then raise exception 'Active staff access required.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('exam_id',e.id,'attempt_count',(select count(*) from public.exam_sessions s where s.exam_id=e.id)))
    from public.exams e where e.id=any(p_ids)),'[]'::jsonb);
end;
$$;

create or replace function public.manage_mock_exam(p_id uuid,p_action text,p_revision integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare exam public.exams; next_status text; outcome text;
begin
  if not public.has_portal_role(array['admin','tutor']) then raise exception 'Active staff access required.' using errcode='42501'; end if;
  select * into exam from public.exams where id=p_id for update;
  if not found then raise exception 'Mock exam not found.' using errcode='P0002'; end if;
  if p_revision is not null and p_revision<>exam.revision then
    raise exception 'This mock changed. Reload before saving.' using errcode='40001';
  end if;
  case p_action
    when 'publish' then
      if exam.status='archived' then raise exception 'Restore this mock to draft before publishing.' using errcode='23514'; end if;
      next_status:='published'; outcome:='published';
    when 'unpublish' then
      if exam.status='archived' then raise exception 'Restore this archived mock first.' using errcode='23514'; end if;
      next_status:='draft'; outcome:='unpublished';
    when 'restore' then
      if exam.status<>'archived' then raise exception 'Only archived mocks can be restored.' using errcode='23514'; end if;
      next_status:='draft'; outcome:='restored';
    when 'remove' then
      if exists(select 1 from public.exam_sessions where exam_id=p_id) then
        next_status:='archived'; outcome:='archived';
      else
        delete from public.exams where id=p_id;
        return jsonb_build_object('id',p_id,'action','deleted','status','deleted');
      end if;
    else raise exception 'Invalid mock action.' using errcode='22023';
  end case;
  if exam.status is distinct from next_status then
    update public.exams set status=next_status,revision=revision+1 where id=p_id returning * into exam;
  end if;
  return jsonb_build_object('id',p_id,'status',exam.status,'revision',exam.revision,'action',outcome);
end;
$$;

-- Keep the older create/publish clients working while management is rolled out.
create or replace function public.publish_mock_exam(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin perform public.manage_mock_exam(p_id,'publish'); return p_id; end;
$$;

create or replace function public.save_mock_exam(p_id uuid,p_revision integer,p_name text,p_description text,p_questions jsonb,p_materials jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare exam public.exams; target_id uuid; material jsonb; copied boolean;
begin
  if not public.has_portal_role(array['admin','tutor']) then raise exception 'Active staff access required.' using errcode='42501'; end if;
  select * into exam from public.exams where id=p_id for update;
  if not found then raise exception 'Mock exam not found.' using errcode='P0002'; end if;
  if p_revision is null or p_revision<>exam.revision then
    raise exception 'This mock changed. Reload before saving.' using errcode='40001';
  end if;
  if p_questions is null or jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions) not between 1 and 12
    or p_materials is null or jsonb_typeof(p_materials)<>'array' or jsonb_array_length(p_materials)>30 then
    raise exception 'Provide valid questions and materials arrays.' using errcode='23514';
  end if;
  for material in select value from jsonb_array_elements(p_materials) loop
    if not exists(select 1 from storage.objects where bucket_id='exam-materials' and name=material->>'storage_path')
      or not (
        exists(select 1 from public.exam_materials where exam_id=p_id and storage_path=material->>'storage_path')
        or (storage.foldername(material->>'storage_path'))[1]=auth.uid()::text
      ) then
      raise exception 'Use a PDF attached to this mock or your own upload.' using errcode='42501';
    end if;
  end loop;
  copied:=exam.status='archived' or exists(select 1 from public.exam_sessions where exam_id=p_id);
  if copied then
    target_id:=gen_random_uuid();
    insert into public.exams(id,name,description,status,created_by,copied_from)
    values(target_id,p_name,p_description,'draft',auth.uid(),p_id);
  else
    target_id:=p_id;
    update public.exams set name=p_name,description=p_description,status='draft',revision=revision+1 where id=p_id;
    delete from public.exam_materials where exam_id=p_id;
    delete from public.exam_questions where exam_id=p_id;
  end if;
  insert into public.exam_questions(exam_id,question_id,position,duration_seconds,content)
  select target_id,q->>'question_id',(q->>'position')::integer,(q->>'duration_seconds')::integer,q->'content' from jsonb_array_elements(p_questions) q;
  insert into public.exam_materials(exam_id,name,kind,question_id,storage_path)
  select target_id,m->>'name',m->>'kind',m->>'question_id',m->>'storage_path' from jsonb_array_elements(p_materials) m;
  return jsonb_build_object('id',target_id,'status','draft','action',case when copied then 'copied' else 'updated' end);
end;
$$;

revoke all on function public.get_mock_attempt_counts(uuid[]) from public;
revoke all on function public.manage_mock_exam(uuid,text,integer) from public;
revoke all on function public.save_mock_exam(uuid,integer,text,text,jsonb,jsonb) from public;
revoke all on function public.publish_mock_exam(uuid) from public;
grant execute on function public.get_mock_attempt_counts(uuid[]), public.manage_mock_exam(uuid,text,integer),
  public.save_mock_exam(uuid,integer,text,text,jsonb,jsonb), public.publish_mock_exam(uuid) to authenticated;
commit;

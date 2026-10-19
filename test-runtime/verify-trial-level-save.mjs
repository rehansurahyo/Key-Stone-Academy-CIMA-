import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Execute the same isolated infrastructure setup as the broader RLS suite.
const harness = await readFile(new URL('./verify-database.mjs', import.meta.url), 'utf8');
const offset = harness.indexOf('await db.exec(`') + 'await db.exec(`'.length;
const db = new PGlite();
const migration = await readFile(new URL('../supabase/migrations/20261019_trial_mock_level_mapping.sql', import.meta.url), 'utf8');
const source = '0b36d2d4-0a2c-4f16-b5f1-b5a6e2ce6f69';
const admin = '00000000-0000-4000-8000-000000008801';
const guest = '00000000-0000-4000-8000-000000008802';
const fresh = '00000000-0000-4000-8000-000000008803';
const paper = JSON.stringify([{ question_id:'section-1',position:1,duration_seconds:3600,content:{subject:'Level regression',subtasks:[{description:'Assess',weightage:100}]}}]);
const asUser = async id => db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)", [id]);
const create = (id,name,status,level) => db.query("select public.create_mock_exam_with_level($1,$2,'',$3,$4::jsonb,'[]',$5)",[id,name,status,paper,level]);
try {
  await db.exec(harness.slice(offset, harness.indexOf('`);', offset)));
  for (const file of ['schema.sql','20260930_per_question_timers.sql','20261005_phase3_dashboard.sql','20261007_dynamic_subtasks_publish.sql','20261008_safe_mock_management.sql','20261009_levels_and_submission_reports.sql','20261009_student_levels_and_solutions.sql','20261010_leads_and_report_delivery.sql','20261013_tutor_evaluations_and_admin_update.sql','20261015_report_uploads_and_evaluation_links.sql']) {
    await db.exec((await readFile(new URL(`../supabase/${file==='schema.sql'?'':'migrations/'}${file}`,import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;',''));
  }
  await db.exec('alter table auth.users add column is_anonymous boolean not null default false');
  await db.exec(await readFile(new URL('../supabase/migrations/20261019_student_trial_access.sql',import.meta.url),'utf8'));
  await db.query('insert into auth.users(id,email,is_anonymous) values($1,\'staff@example.test\',false),($2,null,true),($3,null,true)',[admin,guest,fresh]);
  await db.query("update public.profiles set role='admin',access_type='enrolled' where id=$1",[admin]);
  await asUser(admin);
  await create(source,'CIMA OCS Mock 1','published','SCS');
  await db.query("insert into storage.objects(bucket_id,name) values('exam-materials','fixture/preseen.pdf')");
  await db.query("insert into public.exam_materials(exam_id,name,kind,storage_path) values($1,'Original preseen','preseen','fixture/preseen.pdf')",[source]);
  await asUser(guest);
  await db.query("select public.register_free_trial('Historical learner','old@example.test','12345678','SCS')");
  await db.query("insert into public.exam_sessions(user_id,exam_id,status) values($1,$2,'in_progress')",[guest,source]);
  await db.query("insert into public.exam_answers(session_id,question_id,answer_text) select id,'section-1','Historical answer' from public.exam_sessions where exam_id=$1",[source]);
  await db.query("update public.exam_sessions set status='completed',ended_at=now() where exam_id=$1",[source]);
  await asUser('');
  const before = (await db.query('select to_jsonb(e) as exam from public.exams e where id=$1',[source])).rows[0].exam;
  await db.exec(migration);
  await db.exec(migration); // Includes targeted repair: no duplicate copies.
  const original = (await db.query('select to_jsonb(e) as exam from public.exams e where id=$1',[source])).rows[0].exam;
  assert.deepEqual(original,before,'Historical paper remains byte-for-byte unchanged');
  const copies = (await db.query("select id,status,level from public.exams where copied_from=$1 and level='OCS'",[source])).rows;
  assert.equal(copies.length,1); assert.equal(copies[0].status,'published');
  assert.equal((await db.query("select exam_id from public.trial_exam_access where level='OCS'")).rows[0].exam_id,copies[0].id);
  assert.equal((await db.query('select trial_exam_id from public.profiles where id=$1',[guest])).rows[0].trial_exam_id,source);
  assert.equal((await db.query("select * from public.trial_exam_access where level='SCS' and exam_id=$1",[source])).rows.length,0,'New SCS visitors must not receive the legacy OCS paper');
  assert.equal((await db.query("select answer_text from public.exam_answers where answer_text='Historical answer'")).rows.length,1);
  assert.equal((await db.query('select storage_path from public.exam_materials where exam_id=$1',[copies[0].id])).rows[0].storage_path,'fixture/preseen.pdf');
  console.log('PASS: repair publishes exactly one OCS copy; original completed attempt, answer, SCS grant and shared PDF remain unchanged; rerun is idempotent');
  await asUser(guest);
  assert.equal((await db.query('select public.student_can_use_exam($1) as allowed',[source])).rows[0].allowed,true,'Historical learner keeps access');
  await asUser(fresh);
  const trial = (await db.query("select public.register_free_trial('New OCS learner','new@example.test','12345678','OCS') as id")).rows[0].id;
  assert.equal(trial,copies[0].id);
  console.log('PASS: a new OCS trial registers successfully against the repaired OCS Mock 1');
  await asUser(admin);
  // Fresh levels must work even without any SCS mapping/default safety net.
  await db.exec('delete from public.trial_exam_access');
  for (const [index,level] of ['OCS','MCS','SCS'].entries()) {
    const id=`00000000-0000-4000-8000-00000000881${index}`;
    await create(id,`${level} Mock 1`,'published',level);
    assert.equal((await db.query('select level from public.exams where id=$1',[id])).rows[0].level,level);
    assert.equal((await db.query('select exam_id from public.trial_exam_access where level=$1',[level])).rows[0].exam_id,id);
  }
  console.log('PASS: directly publishing OCS/MCS/SCS Mock 1 saves the selected level and correct mapping without default-SCS collisions');
  await db.exec('delete from public.trial_exam_access');
  const edit='00000000-0000-4000-8000-000000008820';
  await create(edit,'Editable Mock 1','published','SCS');
  const revision=(await db.query('select revision from public.exams where id=$1',[edit])).rows[0].revision;
  await db.query("select public.save_mock_exam_with_level($1,$2,'Editable Mock 1','',$3::jsonb,'[]','OCS')",[edit,revision,paper]);
  assert.equal((await db.query('select level from public.exams where id=$1',[edit])).rows[0].level,'OCS');
  assert.equal((await db.query('select * from public.trial_exam_access where exam_id=$1',[edit])).rows.length,0,'Stale SCS mapping is removed');
  const next=(await db.query('select revision from public.exams where id=$1',[edit])).rows[0].revision;
  await db.query("select public.manage_mock_exam($1,'publish',$2)",[edit,next]);
  assert.equal((await db.query("select exam_id from public.trial_exam_access where level='OCS'")).rows[0].exam_id,edit);
  await assert.rejects(create('00000000-0000-4000-8000-000000008899','Bad','invalid','OCS'),error=>error.code==='23514');
  await asUser(fresh);
  await assert.rejects(create('00000000-0000-4000-8000-000000008898','Student','draft','OCS'),/Staff access required/);
  console.log('PASS: changing SCS to OCS saves/re-publishes without unique-key errors; invalid status and student writes remain rejected');
  // Exercise the actual RLS-backed table operations used by the admin API.
  const newcomer='00000000-0000-4000-8000-000000008804';
  const manualFree='00000000-0000-4000-8000-000000008830';
  await asUser(admin);
  await create(manualFree,'OCS Mock 2','published','OCS');
  await asUser('');
  await db.query('insert into auth.users(id,is_anonymous) values($1,true)',[newcomer]);
  await asUser(admin);await db.exec('set role authenticated');
  await db.query("update public.trial_exam_access set exam_id=$1 where level='OCS' returning exam_id",[copies[0].id]);
  await asUser(newcomer);
  assert.equal((await db.query("select public.register_free_trial('Newest learner','newest@example.test','12345678','OCS') as id")).rows[0].id,copies[0].id);
  await asUser(admin);
  await db.query("update public.trial_exam_access set exam_id=$1 where level='OCS' and exam_id=$2 returning exam_id",[manualFree,copies[0].id]);
  await asUser(newcomer);
  assert.equal((await db.query("select public.register_free_trial('Retry','retry@example.test','12345678','OCS') as id")).rows[0].id,copies[0].id,'Existing guest keeps the original paper after the admin switches');
  assert.equal((await db.query("update public.trial_exam_access set exam_id=$1 where level='OCS' returning exam_id",[copies[0].id])).rows.length,0,'Student cannot change the mapping');
  assert.equal((await db.query('select public.student_can_use_exam($1) as allowed',[copies[0].id])).rows[0].allowed,true);
  assert.equal((await db.query('select public.student_can_use_exam($1) as allowed',[manualFree])).rows[0].allowed,false,'A changed selection does not grant another free mock to an existing guest');
  await db.exec('reset role');await asUser('');
  const latest='00000000-0000-4000-8000-000000008805';
  await db.query('insert into auth.users(id,is_anonymous) values($1,true)',[latest]);
  await asUser(latest);await db.exec('set role authenticated');
  assert.equal((await db.query("select public.register_free_trial('Latest learner','latest@example.test','12345678','OCS') as id")).rows[0].id,manualFree,'New registration receives Mock 2 as the new free selection');
  await db.exec('reset role');await asUser('');
  await db.query('update public.exams set description=description where id=$1',[edit]);
  assert.equal((await db.query("select exam_id from public.trial_exam_access where level='OCS'")).rows[0].exam_id,manualFree,'Updating Mock 1 never replaces the manual Mock 2 selection');
  await db.query("update public.profiles set role='tutor' where id=$1",[admin]);
  await asUser(admin);await db.exec('set role authenticated');
  assert.equal((await db.query("update public.trial_exam_access set exam_id=$1 where level='OCS' returning exam_id",[copies[0].id])).rows.length,0,'Tutor cannot change the mapping');
  await db.exec('reset role');await asUser('');
  assert.equal((await db.query("select exam_id from public.trial_exam_access where level='OCS'")).rows[0].exam_id,manualFree);
  assert.equal((await db.query("select answer_text from public.exam_answers where answer_text='Historical answer'")).rows.length,1);
  console.log('PASS: real RLS permits admin selection, denies tutors/students, preserves existing trial grants and historical answers, and keeps other papers locked');
} finally { await db.close(); }

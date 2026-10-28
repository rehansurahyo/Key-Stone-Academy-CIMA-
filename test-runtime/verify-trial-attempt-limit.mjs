import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const harness = await readFile(new URL('./verify-database.mjs', import.meta.url), 'utf8');
const offset = harness.indexOf('await db.exec(`') + 'await db.exec(`'.length;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [legacy,trial,enrolled,admin,other,exam,locked] = [9940,9941,9942,9943,9944,9950,9951].map(id);
const imagePath=`${admin}/qa/reference.png`;
const migration = await readFile(new URL('../supabase/migrations/20261028_reference_images_and_single_trial_attempt.sql', import.meta.url), 'utf8');
async function as(user) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)", [user]);
  if(user)await db.exec('set role authenticated');
}
const start = (user,paper=exam) => db.query("insert into public.exam_sessions(user_id,exam_id,status) values($1,$2,'in_progress') returning id",[user,paper]);
async function denied(run,code) { await assert.rejects(run,error=>error.code===code); }
try {
  await db.exec(harness.slice(offset,harness.indexOf('`);',offset)));
  for(const file of ['schema.sql','20260930_per_question_timers.sql','20261005_phase3_dashboard.sql','20261007_dynamic_subtasks_publish.sql','20261008_safe_mock_management.sql','20261009_levels_and_submission_reports.sql','20261009_student_levels_and_solutions.sql','20261010_leads_and_report_delivery.sql','20261013_tutor_evaluations_and_admin_update.sql','20261015_report_uploads_and_evaluation_links.sql']) {
    await db.exec((await readFile(new URL(`../supabase/${file==='schema.sql'?'':'migrations/'}${file}`,import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;',''));
  }
  await db.exec('alter table auth.users add column is_anonymous boolean not null default false');
  await db.exec(await readFile(new URL('../supabase/migrations/20261019_student_trial_access.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261021_admin_submission_deletion.sql',import.meta.url),'utf8'));
  for(const user of [legacy,trial,enrolled,admin,other])await db.query('insert into auth.users(id) values($1)',[user]);
  await db.query("update public.profiles set assigned_level='OCS',access_type='trial' where id=any($1::uuid[])",[[legacy,trial,enrolled,admin,other]]);
  await db.query("update public.profiles set access_type='enrolled' where id=$1",[enrolled]);
  await db.query("update public.profiles set role='admin',access_type='enrolled' where id=$1",[admin]);
  for(const paper of [exam,locked]) {
    await db.query("insert into public.exams(id,name,level,status) values($1,$2,'OCS','published')",[paper,`Trial QA ${paper}`]);
    await db.query(`insert into public.exam_questions(exam_id,question_id,position,content) values($1,'section-1',1,'{"subtasks":[{"description":"Assess","weightage":100}]}')`,[paper]);
  }
  await db.query("insert into public.exam_materials(exam_id,name,kind,storage_path,question_id) values($1,'Reference image','reference',$2,'section-1')",[exam,imagePath]);
  await db.query('update public.profiles set trial_exam_id=$1 where id=any($2::uuid[])',[exam,[legacy,trial,other]]);
  await as(legacy);
  const old=[];
  for(let i=0;i<2;i++) {
    const row=(await start(legacy)).rows[0];old.push(row.id);
    await db.query("insert into public.exam_answers(session_id,question_id,answer_text) values($1,'section-1','Historical answer')",[row.id]);
    await db.query("update public.exam_sessions set status='completed',ended_at=now() where id=$1",[row.id]);
  }
  await as('');
  await db.exec(migration);await db.exec(migration);
  assert.equal((await db.query('select count(*)::int n from public.exam_sessions where user_id=$1',[legacy])).rows[0].n,2);
  assert.equal((await db.query("select count(*)::int n from public.exam_answers where answer_text='Historical answer'")).rows[0].n,2);
  assert.equal((await db.query('select count(*)::int n from public.trial_attempt_receipts where user_id=$1',[legacy])).rows[0].n,1);
  const bucket=(await db.query("select * from storage.buckets where id='exam-materials'")).rows[0];
  assert.equal(bucket.public,false);assert.deepEqual(bucket.allowed_mime_types,['application/pdf','image/png','image/jpeg']);
  console.log('PASS: migration reruns safely, preserves historical attempts/answers and keeps PDF/PNG/JPEG Storage private');

  await as(legacy);await denied(()=>start(legacy),'23505');
  await as(trial);
  await denied(()=>start(trial,locked),'42501');
  assert.equal((await db.query('select * from public.trial_attempt_receipts')).rows.length,0,'Rejected starts do not spend a trial');
  const first=(await start(trial)).rows[0].id;
  await denied(()=>start(trial),'23505');
  await db.query('update public.exam_sessions set updated_at=now() where id=$1',[first]);
  await db.query("insert into public.exam_answers(session_id,question_id,answer_text) values($1,'section-1','Trial answer')",[first]);
  await db.query("update public.exam_sessions set status='completed',ended_at=now() where id=$1",[first]);
  await denied(()=>start(trial),'23505');
  await denied(()=>db.query("update public.exam_sessions set status='in_progress' where id=$1",[first]),'P0001');
  await denied(()=>db.query('delete from public.trial_attempt_receipts where user_id=$1',[trial]),'42501');
  await denied(()=>db.query('update public.trial_attempt_receipts set user_id=$1',[other]),'42501');
  await denied(()=>db.query('insert into public.trial_attempt_receipts(user_id,exam_id,session_id) values($1,$2,$3)',[other,exam,id(9999)]),'42501');
  assert.equal((await db.query('select * from public.trial_attempt_receipts')).rows.length,1,'Guests can read only their own receipt');
  console.log('PASS: first trial start works, retries/retakes are denied, resume and submission work, receipts cannot be forged or erased');

  await as(enrolled);await start(enrolled);await start(enrolled);
  await as(other);assert.equal((await db.query('select * from public.trial_attempt_receipts')).rows.length,0);
  const starts=await Promise.allSettled([start(other),start(other)]);
  assert.equal(starts.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(starts.find(result=>result.status==='rejected').reason.code,'23505');
  await denied(()=>db.query('update public.exam_sessions set exam_id=$1 where user_id=$2',[locked,other]),'42501');
  console.log('PASS: enrolled behavior and other trial accounts remain independent; attempt ownership and exam cannot be changed');

  await as(admin);
  const submission=(await db.query('select id,revision from public.submissions where session_id=$1',[first])).rows[0];
  await db.query('select public.delete_exam_submission($1,$2)',[submission.id,submission.revision]);
  assert.equal((await db.query('select * from public.trial_attempt_receipts where user_id=$1',[trial])).rows.length,1);
  await as(trial);await denied(()=>start(trial),'23505');
  console.log('PASS: admin cleanup removes the selected submission but cannot unlock a second free attempt');

  await as(admin);
  await db.query("insert into storage.objects(bucket_id,name) values('exam-materials',$1)",[imagePath]);
  await as(other);
  assert.equal((await db.query('select name from storage.objects where name=$1',[imagePath])).rows.length,1);
  await denied(()=>db.query("insert into storage.objects(bucket_id,name) values('exam-materials',$1)",[`${other}/forged.png`]),'42501');
  console.log('PASS: staff can attach reference images; entitled trial students can read but cannot upload them');
} finally { await db.close(); }

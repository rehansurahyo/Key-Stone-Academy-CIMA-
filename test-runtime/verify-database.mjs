import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Execute the actual migrations against an isolated PostgreSQL engine.
// Only Supabase-owned auth/storage infrastructure is stubbed, not portal SQL.
for (const roleType of ['text', 'enum']) {
const db = new PGlite();
await db.exec(`
  create role authenticated; create role anon; create role service_role;
  create schema auth; create schema storage;
  create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function auth.role() returns text language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
  grant usage on schema auth, storage to authenticated, anon;
  create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
  alter table storage.objects enable row level security;
  grant select,insert,delete on storage.objects to authenticated;
  create function storage.foldername(text) returns text[] language sql immutable as
    $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
`);
if (roleType === 'enum') {
  // Existing Supabase projects may already use an enum, unlike schema.sql.
  await db.exec(`
    create type public.app_role as enum ('student','tutor','admin');
    create table public.profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      full_name text, email text, role public.app_role not null default 'student',
      created_at timestamptz not null default now()
    );
  `);
}
for (const file of ['schema.sql','migrations/20260930_per_question_timers.sql','migrations/20261005_phase3_dashboard.sql','migrations/20261007_dynamic_subtasks_publish.sql','migrations/20261007_dynamic_subtasks_publish.sql']) {
  const sql = (await readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8'))
    .replace('create extension if not exists pgcrypto;','-- gen_random_uuid is built into this PostgreSQL runtime.');
  try { await db.exec(sql); }
  catch(error) { console.error(`FAIL: ${roleType} role migration ${file}:`,error.message,error.code);await db.close();process.exit(1); }
  console.log(`PASS: ${roleType} role — actual SQL migration ${file}`);
}
try {
  await db.exec(await readFile(new URL('../supabase/tests/phase3_rbac.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/tests/dynamic_subtasks_publish.sql',import.meta.url),'utf8'));
  const lifecycle = await readFile(new URL('../supabase/migrations/20261008_safe_mock_management.sql',import.meta.url),'utf8');
  await db.exec(lifecycle);await db.exec(lifecycle);
  await db.exec(await readFile(new URL('../supabase/tests/safe_mock_management.sql',import.meta.url),'utf8'));
  const levels = await readFile(new URL('../supabase/migrations/20261009_levels_and_submission_reports.sql',import.meta.url),'utf8');
  await db.exec(levels); await db.exec(levels);
  await db.exec(await readFile(new URL('../supabase/tests/levels_and_reports.sql',import.meta.url),'utf8'));
  const studentLevels = await readFile(new URL('../supabase/migrations/20261009_student_levels_and_solutions.sql',import.meta.url),'utf8');
  await db.exec(studentLevels); await db.exec(studentLevels);
  await db.exec(await readFile(new URL('../supabase/tests/student_levels_solutions.sql',import.meta.url),'utf8'));
  const leads = await readFile(new URL('../supabase/migrations/20261010_leads_and_report_delivery.sql',import.meta.url),'utf8');
  await db.exec(leads); await db.exec(leads);
  await db.exec(await readFile(new URL('../supabase/tests/leads_and_report_delivery.sql',import.meta.url),'utf8'));
  const evaluations = await readFile(new URL('../supabase/migrations/20261013_tutor_evaluations_and_admin_update.sql',import.meta.url),'utf8');
  await db.exec(evaluations); await db.exec(evaluations);
  await db.exec(await readFile(new URL('../supabase/tests/tutor_evaluations.sql',import.meta.url),'utf8'));
  const reportUploads = await readFile(new URL('../supabase/migrations/20261015_report_uploads_and_evaluation_links.sql',import.meta.url),'utf8');
  await db.exec(reportUploads); await db.exec(reportUploads);
  await db.exec(await readFile(new URL('../supabase/tests/report_uploads.sql',import.meta.url),'utf8'));
  await db.exec('alter table auth.users add column is_anonymous boolean not null default false');
  await db.exec(`insert into auth.users(id,email,is_anonymous) values
    ('00000000-0000-4000-8000-000000009870',null,true),
    ('00000000-0000-4000-8000-000000009871','existing-enrolled@example.test',false)`);
  const trialAccess = await readFile(new URL('../supabase/migrations/20261019_student_trial_access.sql',import.meta.url),'utf8');
  await db.exec(trialAccess); await db.exec(trialAccess);
  assert.equal((await db.query("select access_type from public.profiles where id='00000000-0000-4000-8000-000000009870'")).rows[0].access_type,'trial','Pre-existing guests never inherit full enrollment');
  assert.equal((await db.query("select access_type from public.profiles where id='00000000-0000-4000-8000-000000009871'")).rows[0].access_type,'enrolled','Existing enrolled students retain full access');
  await db.exec("delete from auth.users where id in ('00000000-0000-4000-8000-000000009870','00000000-0000-4000-8000-000000009871')");
  await db.exec(await readFile(new URL('../supabase/tests/student_trial_access.sql',import.meta.url),'utf8'));
  const contactDetails = await readFile(new URL('../supabase/migrations/20261019_trial_lead_contact_details.sql',import.meta.url),'utf8');
  await db.exec(contactDetails); await db.exec(contactDetails);
  await db.exec(await readFile(new URL('../supabase/tests/trial_lead_contact_details.sql',import.meta.url),'utf8'));
  console.log('PASS: contact SQL: country and phone prefix persist atomically, duplicates preserve original details, guest reads/updates are denied, and legacy leads/RPC remain valid');
  const deletion = await readFile(new URL('../supabase/migrations/20261021_admin_submission_deletion.sql',import.meta.url),'utf8');
  await db.exec(deletion); await db.exec(deletion);
  await db.exec(await readFile(new URL('../supabase/tests/admin_submission_deletion.sql',import.meta.url),'utf8'));
  console.log('PASS: admin deletion SQL: scoped cascades, stale revision/unfinished attempt denial, persistent file cleanup, verified acknowledgment, idempotent retries and other students/accounts/leads/grants preserved');
  console.log('PASS: trial RLS: one fixed Mock 1, five visible catalog cards, locked content/storage/attempts, lead idempotency, no self-enrollment, enrolled access and autosave/timer/submission persistence');
} catch(error) {
  console.error('FAIL: SQL/RLS test',error.message,error.code,error.where);
  await db.close();process.exit(1);
}
console.log('PASS: actual RLS ownership, self-promotion denial, completed-session lock, tutor grading and stale-grade denial');
console.log('PASS: dynamic subtasks, marks/percent validation, atomic create/publish, draft visibility and active-staff-only idempotent publication');
console.log('PASS: actual safe-management SQL: unpublish/resume, edit/copy, shared PDFs, delete/archive/restore and stale revision protection');
console.log('PASS: levels/report SQL: OCS create, MCS copy, invalid category denial, idempotent attachment, graded-only release, private objects, other-student/suspended-staff denial');
console.log('PASS: assigned-level SQL: cross-level mocks are denied, student level self-escalation is denied, and official solutions release after submission');
console.log('PASS: lead SQL: public requests are write-only, admin follow-up is protected, and only the graded-report owner can download the attachment');
console.log('PASS: tutor evaluation SQL: drafts remain staff-only and published feedback is the only evaluation released to the student');
console.log('PASS: report upload SQL: active tutors/admins upload PDF/DOCX/DOC; evaluation links, idempotent attachment, draft privacy and owner-only publication hold');
const count = await db.query('select count(*)::integer n from auth.users');
assert.equal(count.rows[0].n,0,'All RBAC fixtures rolled back');
assert.equal((await db.query('select count(*)::integer n from public.exam_questions')).rows[0].n,3);
assert.equal((await db.query("select count(*)::integer n from public.exam_questions where jsonb_array_length(content->'subtasks')=2 and public.valid_question_subtasks(content)")).rows[0].n,3,'Legacy questions backfilled without losing data');
console.log('PASS: rollback leaves no test users; original three questions preserved');
await db.close();
}

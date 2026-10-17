# Phase 3 — Admin & Tutor Dashboard

## Database setup

For a new Supabase project, run `schema.sql`, then
`migrations/20260930_per_question_timers.sql`, then
`migrations/20261005_phase3_dashboard.sql`, then
`migrations/20261007_dynamic_subtasks_publish.sql`, then
`migrations/20261008_safe_mock_management.sql`, in that order.
For the existing Phase 2 project, run only missing migrations. The Phase 3
migration is transactional and should be applied once.

Before running SQL, confirm the selected Supabase project's reference matches
`NEXT_PUBLIC_SUPABASE_URL` in this portal's local environment. Do not apply portal
RLS/profile triggers to another application's database.

Existing `profiles.role` columns can be `text` or the `public.app_role` enum;
the Phase 3 role helper casts to text when comparing against a text array.
If an older copy fails with `42883: operator does not exist: public.app_role = text`,
replace it with the complete corrected migration and rerun it in the intended
project. The failed full migration uses a transaction; it is not necessary to
delete tables or convert the existing role column.

`auth.users` owns sign-in credentials. `profiles.role` (`student`, `tutor`,
`admin`) and `profiles.is_active` own authorization. There is no duplicate
users/password table. Roles are not derived from editable user metadata.

The migration adds:

- `exams`: name, description, publication status and creator.
- `exam_questions`: ordered requirements and independent question durations.
- `exam_materials`: private PDF metadata and optional per-question association.
- `exam_sessions.exam_id`: exam identity for each student attempt.
- `submissions`: one completed session, score, feedback, grading tutor,
  submission/grading timestamps and revision for concurrent edits.

Completed historical sessions are linked to the original mock and imported
into the grading queue; their existing answers are preserved. The original
questions are seeded for reviewing those submissions. New completions create
submissions automatically in the same database transaction.

## Environment

Configure the existing public URL and anon key, plus the **server-only**
`SUPABASE_SERVICE_ROLE_KEY` from `.env.example`. Never prefix this key with
`NEXT_PUBLIC_`. Restart the server after configuring it. Uploading and grading
use the signed-in user's RLS-protected client; the privileged client is used
only for administrator account creation/deletion.

## First administrator

Create the first account in Supabase Authentication. In the Supabase SQL editor,
promote that account explicitly:

```sql
update public.profiles
set role = 'admin', is_active = true
where email = 'your-admin@example.com';
```

Open `/staff/login` and sign in. Administrators can create student/tutor logins
with an initial password, edit names/roles, suspend access, and permanently
remove accounts after confirmation. Administrator accounts are protected from
these management endpoints. Share initial passwords privately.

## Routes and workflow

1. `/dashboard`: live counts and recent submissions.
2. `/dashboard/users`: administrator-only account management.
3. `/dashboard/exams/new`: configure one or more questions (60 minutes by
   default), sub-task weights, a pre-seen PDF and question reference PDFs.
4. `/dashboard/exams`: view saved drafts and published mocks, open uploaded
   materials, obtain published student exam links.
5. `/exam/[id]`: student simulator for a published mock. Sessions, timers and
   recovery drafts are isolated by student and exam. Private PDF links renew
   while the floating windows are open.
6. `/dashboard/submissions`: paginated queue, with awaiting-review/graded filters.
7. `/dashboard/submissions/[id]`: view requirements beside each answer, assign
   an overall score from 0–100 and written feedback. Saving marks it graded.
8. `/student/dashboard`: published mocks and the signed-in student's own
   submission status, grades and feedback. The submission screen returns here.

Drafts and archived mocks are hidden from new students. Papers with any student
attempts are immutable; edits create a new draft version so grading history stays intact.

## Custom subtasks and draft publication — 7 October update

For an existing Phase 3 database, run only
`migrations/20261007_dynamic_subtasks_publish.sql`. This migration is transactional
and safe to rerun. It preserves answers, sessions, timers and legacy question
fields while backfilling valid two-subtask questions into the flexible structure.
The migration has been verified in isolated PostgreSQL, not applied to live Supabase.

`exam_questions.content` now includes:

```json
{
  "weightageUnit": "percent",
  "subtasks": [
    { "description": "Assess strategy", "weightage": 20 },
    { "description": "Evaluate funding", "weightage": 30 },
    { "description": "Discuss risks", "weightage": 50 }
  ]
}
```

The form supports 1–100 subtasks per question. Add/remove rows and assign each
weight independently; editing a weight never recalculates its siblings. Use
`percent` for a required total of 100%, or `marks` for a custom total. Values must
be positive numbers with at most two decimal places. Client, API and database
validation reject invalid structures. The student prompt, answer requirements,
exam structure and tutor review render the entire array with its selected unit.

In `/dashboard/exams`, **Publish** appears beside each draft. The authenticated
PATCH route invokes `publish_mock_exam`, waits for the transaction to succeed,
then updates the badge, enables **Open exam** and refreshes the list. Errors keep
the mock as a draft with a retryable message. Repeated calls are idempotent.
Only active Admin/Tutor profiles may publish. Publication requires valid
questions. The safe-management migration below supersedes the initial one-way
publication rule and status-column grant with guarded lifecycle RPCs.

Run `supabase/tests/dynamic_subtasks_publish.sql` after this migration for the
transactional SQL checks; all fixtures are rolled back. Apply the migration
before using Publish on the live database. If the RPC is missing, the table
shows an explicit migration-required error instead of activating the link.

## Safe mock management

Apply `migrations/20261008_safe_mock_management.sql` after the custom-subtask
migration. Both the form and management table now support the following:

- **Unpublish:** return a published mock to draft. New attempts stop, but existing
  students can resume their paper, timers and answers, and access its PDFs.
- **Edit:** prefilled questions, subtasks, durations and retained PDFs. Saving an
  unused mock updates it in place as a draft. Any existing attempt, including a
  not-started or completed session, forces a separate draft with `copied_from`.
  If an attempt starts while the form is open, SQL still chooses a copy on save.
- **Delete:** requires confirmation. Unused mocks and their question/material
  metadata are deleted. Used mocks are archived instead; no session, answer or
  grade is deleted. A racing attempt also forces archive instead of deletion.
- **Archived mocks:** separate library view with **Restore draft**, then Publish
  when ready. Archived paper history and existing attempts remain accessible.

Active Admin/Tutor profiles manage mocks through checked RPCs; students and
suspended staff cannot. Direct status/content writes are not granted to browser
clients. Row locks serialize new-session creation with lifecycle operations;
revision checks reject stale form/list writes with HTTP 409. Failed edits roll
back atomically. Existing attempted question/material content has trigger protection.

Versions share immutable PDF storage objects. Replacing/removing a retained PDF
changes only the edited version's metadata. Delete never removes shared binary
PDFs; unreferenced private objects are intentionally retained for separate storage
cleanup, not removed with an unsafe cross-version cascade.

The student dashboard shows **Continue your attempts** even after unpublish or
archive and still resolves historical exam names and graded feedback. Attempt
counts come from a staff-only RPC (including active sessions), not filtered tutor
RLS results. Missing migration produces a clear notice and disabled management
controls. Verify with `supabase/tests/safe_mock_management.sql` (rollback fixtures)
or `node test-runtime/run-all.mjs`. No live SQL execution is implied by local tests.

## Security and verification

Every protected page and mutation verifies the current authenticated user,
active profile and role. RLS independently enforces access. Profile triggers
prevent self-promotion, and completed sessions cannot be reopened or reassigned.
The PDF bucket is private with a 20 MB PDF-only limit. Upload failures clean up
only unattached files. Student HTML is parsed through a read-only Tiptap schema
instead of inserted directly into the grading page.

Run `node scripts/verify-phase3.mjs http://localhost:3001` against a locally running
production build to check unauthenticated routes, CSRF and input validation.
After applying the migration, run the transactional database checks in
`supabase/tests/phase3_rbac.sql` in the SQL editor (all test data is rolled back).
Then use separate administrator, tutor and student accounts for an end-to-end
upload → answer/autosave → submit → grade check. Source/build validation alone
does not verify a live Supabase migration or its configured credentials.

## Repeatable local regression tests

Install the isolated test dependencies with `pnpm --dir test-runtime install`.
The application dependency lockfile is not changed by this test workspace.

```text
node test-runtime/verify-database.mjs
node test-runtime/verify-hooks.mjs
node test-runtime/verify-components.mjs
node test-runtime/verify-student-ui.mjs
node test-runtime/verify-server.mjs
node test-runtime/run-all.mjs http://localhost:3001
```

The database suite executes the real migrations and RLS tests in in-memory
PostgreSQL (PGlite) with minimal Supabase auth/storage infrastructure stubs.
React suites mount the real hooks/components in Happy DOM with mocked transport,
so they verify local behavior, not actual Supabase login/PDF delivery.
The bundled pre-seen fallback has four sample pages. Supply the real full PDF
via mock upload or `NEXT_PUBLIC_PRESEEN_PDF_URL`; no real 25-page PDF is included.

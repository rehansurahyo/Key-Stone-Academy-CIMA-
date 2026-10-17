# Keystone exam portal — verification report

## 9 October — levels, Word downloads and graded reports

Implemented OCS/MCS/SCS categorization, level-aware atomic create/edit RPCs,
staff/student level filters, real student mock status cards, submitted-answer
Word downloads and private PDF/DOCX graded-report uploads. Introductory exam
screens now use the actual exam name and configured total minutes. Reports are
released only after grading; uploading to a graded submission releases the file
immediately. No live migration, student record mutation or deployment was done.

Verification completed:

- All 54 local regression groups passed, including timers, autosave, authentication,
  safe mock lifecycle, editor interactions and simultaneous draggable windows.
- Actual SQL/RLS tests passed in isolated PostgreSQL with both text and enum roles.
  The new migration was executed twice per schema. Tests cover category validation,
  immutable historical papers, copied levels, idempotent report attachment,
  attached-object cleanup denial, graded-only release, other-student denial and
  suspended-staff denial. Fixtures rolled back.
- Actual DOCX ZIP/OOXML tested for text formatting, entities, lists, tables,
  candidate identification and retained legacy answers. Uploaded DOCX parts use
  bounded decompression; invalid files, renamed ZIPs and macro/binary packages
  are rejected. This is not an antivirus scan or a visual Word rendering test.
- Authenticated export/report handler tests passed with mocked Supabase transport:
  owner/staff checks, anonymous/suspended denial, request origins, upload paths,
  retryable validation/migration errors and short-lived private links.
- Real React report-upload UI tests passed for private uploads, metadata attachment,
  feedback, retry, input reset and protected failed-upload cleanup. Six-paper
  status calculations and MCS form payloads were tested without creating fake papers.
- TypeScript and the webpack production build passed. Turbopack failed in its
  Windows CSS child-process startup inside and outside the sandbox. The build
  script now selects Next's supported webpack builder.
- Read-only HTTP smoke tests passed against the built local server at
  `http://localhost:3002`: login pages, protected redirects, anonymous export/report
  denial and cross-origin report mutation denial. The initial sandbox localhost
  connection denial was resolved by approved execution; using `127.0.0.1` as the
  request origin failed the strict canonical localhost-origin check, so tests
  were rerun with the actual canonical origin.
- New feature modules and dashboard/API components pass targeted ESLint. A broader
  check including the existing exam runtime reports React hook/ref lint errors
  in its untouched drag callback, hydration and ref logic, plus unused-import/dependency warnings.
  They are not claimed as resolved by these feature changes.

LearnWorlds review: no integration, school configuration, external identity mapping
or enrollment checks exist in this repository. Current published-level access is
for all active Supabase students, not LearnWorlds-paid enrollments. Official SSO
and webhook guidance was reviewed and next checks documented in
`docs/LEARNWORLDS_ACCESS_REVIEW.md`. Live school integration cannot be certified
without the school URL, chosen connection and course mappings. Live authenticated
upload/download QA is still needed after the Supabase migration is applied.

Setup and API contracts: `docs/LEVELS_REPORTS_SETUP.md`.

## 7 October — safe-management production deployment

Published the latest Unpublish/Edit/Delete/Archive/Restore code to the existing
Vercel production project with `vercel --prod --yes`. Vercel's build and TypeScript
checks passed; CLI exit 0 confirmed the alias:
https://key-stone-academy-cima.vercel.app

Deployment: `key-stone-academy-cima-335e1atew-rehans-projects-d5de1e5b.vercel.app`.
Existing hosting and environment configuration were preserved. `.vercelignore`
excluded local credentials and QA artifacts. No live migration/data writes occurred.

After user confirmation, checked the configured Supabase project without changing
exam records. Reading `exams.revision,copied_from` returned HTTP 200. Anonymous
requests to `get_mock_attempt_counts`, `manage_mock_exam` and `save_mock_exam`
returned HTTP 401 with SQLSTATE `42501`, confirming those functions exist and
anonymous access is denied. Invalid/nonexistent diagnostic targets were used;
no account/session/exam was created, edited or deleted. Keys were not printed.
The initial sandbox connection denial was resolved by approved network execution.

This verifies deployment and schema/function availability, not authenticated
production mutation end-to-end QA. The local safety suites are recorded below.

## 7 October — safe Unpublish / Edit / Delete / Archive

Implemented confirmed Unpublish, prefilled Edit, confirmed Delete/Archive and an
Archived mocks view with Restore draft. Unused edits save in place as draft;
attempted or archived papers produce a new draft copy with provenance. Retained
PDFs are shared safely across versions; removal/replacement affects only the new
metadata. No storage binary is deleted by exam removal. Used papers are archived,
not deleted, so sessions, answers, grades, question content and feedback survive.

The new `20261008_safe_mock_management.sql` migration adds revision protection,
guarded staff RPCs, content-immutability triggers and a new-session availability
guard. Exam-row locks serialize starting attempts with lifecycle operations.
Student RLS permits access to their own historical paper after unpublish/archive,
without permitting new attempts or revealing another student's hidden paper.
The student dashboard and exam route retain resume links and graded feedback.
Management controls are disabled with a migration notice if its RPC is absent.

All 48 local scenario groups passed (10 hook, 15 dashboard component, 7 server,
4 auth, 9 student-runtime, 3 management-page groups), plus schema validation.
Actual SQL/RLS tests pass for both text and enum profile roles, including rerunning
the lifecycle migration. Verified in-place editing, versioned copying, PDF mapping
preservation, delete/archive/restore, active-session counts, continued answers and
submission after archive, preserved grades, stale-revision rejection, invalid-edit
rollback, unrelated-PDF rejection and attempted-content protection. Fixtures roll back.

The first SQL test revealed a sessions/exams RLS recursion; an explicitly scoped
security-definer `has_own_exam_attempt` helper resolves it. Tests also use the
correct revision increment from initial publication. The final suites all pass.

Next.js production build, TypeScript and targeted lint pass. The updated build
is running locally at `http://localhost:3001`. Real HTTP smoke checks passed for
protected edit-page redirects, anonymous PUT/DELETE/PATCH denial and other
existing student/staff routes. Existing timer/autosave/Tiptap regressions pass.

At the end of implementation, these changes were not yet deployed; the subsequent
authorized deployment and migration-availability checks are recorded above.
No live Supabase schema/data changes were made by this agent. Local PGlite and
mocked-transport React tests do not certify the full live Supabase workflow.

## 7 October — dynamic subtasks and draft publication

Implemented flexible `subtasks: [{ description, weightage }]` and `weightageUnit`
(`percent` / `marks`) in the upload form, create API, student task displays and
tutor review. Add/remove controls keep sibling weights independent. Percentage
totals require 100%; custom marks allow another total. Both modes validate
positive weights with up to two decimal places.

The Mock Exams table now has a per-draft Publish action. It waits for the
authenticated, staff-only RPC result before enabling the student link, prevents
repeat clicks while pending, and keeps errors retryable without claiming success.
The additive migration backfills valid legacy questions, validates new content,
grants only RLS-gated status updates and prevents reverting published mocks.

All four actual migrations (including rerunning the new one for idempotence)
and both transactional SQL test files passed in PGlite for text and enum role
columns. Verified invalid content/percentage totals, custom marks, atomic rollback,
legacy preservation, student draft privacy, active Admin/Tutor publication,
suspended/student denial and idempotent retry. Test fixtures leave no accounts.

41 React/component/server/auth scenario groups passed: 10 hook, 12 dashboard
component, 6 server route, 4 auth and 9 student-runtime groups. New checks cover
three custom subtasks, marks/percent save payloads, invalid-total rejection,
stable removal, pending/success/error/retry publication, role/origin/API validation,
and all three tasks rendering in the actual Tiptap response screen.

Next.js production build (including TypeScript) and targeted lint for the changed
form/table/helpers/dashboard routes passed. Started the production build locally
at `http://localhost:3001`; the real HTTP smoke checks passed, including anonymous
denial on the new Publish PATCH endpoint. The first HTTP attempt ran before a
local server existed and returned connection refused; rerunning after startup
resolved that test-environment issue.

These are local tests: React uses mocked transport; PGlite stubs Supabase-owned
Auth/Storage infrastructure. The new SQL has **not** been applied to live
Supabase. The code was subsequently deployed as recorded below. Live Publish
verification requires applying the supplied migration to the intended project first.

## 7 October — Vercel deployment of custom-subtask updates

Published the linked `key-stone-academy-cima` project using `vercel --prod --yes`.
The production build and TypeScript checks passed; the CLI exited successfully
and confirmed the production alias:
https://key-stone-academy-cima.vercel.app

Deployment: `key-stone-academy-cima-j57a4b2hm-rehans-projects-d5de1e5b.vercel.app`.
Local credentials and QA artifacts were excluded by `.vercelignore`; no
environment values were printed or changed. No live SQL migration was executed.
Production Publish/RPC behavior remains dependent on applying
`supabase/migrations/20261007_dynamic_subtasks_publish.sql` to the intended project.

Date: 6 October 2026. Local source verified; no live database data/schema writes performed. Staff authentication was tested locally against the configured live Supabase project. Production was subsequently published as described below.

## 6 October — Vercel production deployment

Published the linked `key-stone-academy-cima` project successfully using
`vercel --prod`. Live URL: https://key-stone-academy-cima.vercel.app

The linked production environment initially contained no variables. Added the
configured Supabase URL/anon key and a sensitive server-only service-role key;
values were not printed. `.vercelignore` excludes local environment files,
test artifacts, screenshots, caches and tool state from source uploads.

Vercel's Next.js 16.3.4 build and TypeScript checks succeeded. Ten live smoke
checks passed: homepage, staff/student login pages, raw/optimized logo images,
protected dashboard/submission redirects, anonymous session API denial,
malformed login payload rejection and cross-origin login rejection.
Authenticated production login and the full upload-to-grading workflow have not
been tested; local staff login success is documented separately below.

## 6 October follow-up — staff login redirect loop

Correct credentials previously returned to the login screen. Staff sign-in now
runs in a same-origin Route Handler, sets SSR cookies in its HTTP response,
checks active staff access, then verifies that a separate request can read the
session cookie. Only then does the form perform a fresh dashboard document
navigation. A missing cookie, invalid password, denied role, profile lookup
failure or network timeout produces a visible error instead of silent navigation.
The Next.js `proxy.ts` refreshes staff session cookies for dashboard pages/APIs
and forwards refreshed cookies to both the page request and browser response.
Authorization still runs in the existing server guards.

Live server log: POST `/api/auth/staff` 200 → GET `/api/auth/staff` 200 →
GET `/dashboard` 200. The user confirmed **“abhi dashboard khul gaya.”**
No password was provided in chat. Full upload/exam/grading live QA remains separate.

## 6 October follow-up — enum migration failure

The screenshot's `42883: public.app_role = text` failure was reproduced against
an existing enum-backed profiles table. The migration now compares
`role::text = any(p_roles)` without changing the column's type. The database
runner tests both fresh text-backed and existing enum-backed roles. All actual
migrations and the full SQL/RLS suite pass for both. Test fixture role assignments
also use literals so they work with either type.

The screenshot's selected Supabase project differs from the portal's configured
project reference (`fypxswmjygqjmfercrih`). Verify the intended project before
rerunning SQL; no live migration was executed by this agent.
See [PostgreSQL enum type safety](https://www.postgresql.org/docs/current/datatype-enum.html#DATATYPE-ENUM-TYPE-SAFETY)
for explicit casts between different comparison types.

## Result

35 local React/component/server/auth scenario groups are covered, plus actual SQL migration/RLS
execution, input-validation checks and the production build. This is **not** a
claim that live Supabase end-to-end testing or Pearson pixel fidelity is complete.

## Executed checks

| Suite | Verified scope |
| --- | --- |
| `verify-database.mjs` | All three real SQL files execute in isolated PostgreSQL. Ownership, student/tutor self-promotion denial, completed-session/answer locks, tutor grading, stale revision denial, tutor mock creation, uploaded-material mapping, protection of attached PDFs and independent question timer JSON. Fixtures roll back. |
| `verify-hooks.mjs` — 10 groups | Restored initial draft, unload keepalive attempt, question-2 debounce, explicit flush, session isolation, offline error/reconnect, expired-token refresh, write ordering, countdown/30-second sync, paused question resume, stale query rejection, failed time-up retry, missing-server-timer reconnect, PDF URL error handling. |
| `verify-components.mjs` — 8 groups | Dashboard branding/active-route/sidebar toggle/admin-only navigation, mock add/remove/default duration, successful and failed save, PDF signature validation/cleanup, grading payload/error recovery, submission table/links, staff login role/access states, account create/edit and deletion confirmation/cancel. |
| `verify-server.mjs` — 5 groups | Actual authorization helpers and route handlers: anonymous/student/suspended denial, active staff allowance, admin-only account operations, failed creation rollback, self/admin protection, mock timer/weight mapping, unowned PDF path denial, grading bounds. |
| `verify-auth.mjs` — 4 groups | Real Supabase SSR client with mocked HTTP: login cookie persistence, next-request authentication, wrong password, anonymous/malformed/cross-origin denial, active admin/tutor allowance, student/suspended denial, failed profile cleanup, no token disclosure, proxy cookie propagation. |
| `verify-student-ui.mjs` — 8 groups | Real Tiptap typing/draft recovery, table insertion, profile-name display, task requirements, independent draggable reference/preseen windows, selectable text containers, arithmetic/square root, scratchpad undo/redo, three table tabs, two-step transition, same-screen refresh, confirmed submission, zero-time typing/formatting lock on failure. |
| `scripts/verify-phase3.mjs` | Real validation schemas. Local HTTP staff login rendering, protected dashboard redirects, anonymous mutation denial, cross-origin denial, student exam/dashboard redirects. |
| Build/type checking | `next build` completes successfully, including TypeScript and all routes. Targeted lint covers the changed hooks, upload form and student dashboard. |

The React suites use Happy DOM and mocked network/navigation. The SQL suite runs
the portal's actual SQL in PGlite, with minimal Supabase-owned auth/storage schema
stubs. Neither substitutes for real Supabase Auth/Storage integration testing.

## Bugs fixed during testing

- Autosave cache now includes session identity; identical answers in different
  sessions cannot be incorrectly treated as saved.
- Restored initial drafts must be persisted, not assumed saved.
- Network failures produce a retryable save error; reconnect retries the draft.
- Writes are serialized so a slow old answer cannot overwrite a newer one.
- Late reads from a previous question cannot overwrite the current countdown.
- Missing timer state after an unsuccessful first sync cannot reset elapsed time
  on reconnect; reconciliation cannot increase the locally elapsed countdown.
- Failed time-up submission remains locked and retries on reconnect/after a
  bounded delay instead of claiming success or becoming permanently stuck.
- Zero-time formatting controls are disabled along with typing.
- PDF URL and offline upload-cleanup failures are handled.
- Final submission screen now uses the requested success message and returns to
  a protected student dashboard showing published mocks and own tutor feedback.

## 6 October follow-up — dashboard color/contrast refinement

- Added missing Tailwind sidebar color-token mappings. Applied a dashboard-scoped
  navy panel style to the actual desktop panel and mobile Sheet portal.
- Reused the provided Keystone logo; replaced neon navigation accents with
  restrained blue, high-contrast text, a route indicator and consistent header.
- Refined stat cards, table dividers, status pills, button focus states and spacing.
- Live Chrome computed styles confirm sidebar `rgb(11, 37, 69)`, active text white,
  and table dividers `rgb(226, 232, 240)`. Logo loads; no page-level horizontal overflow.
- Checked mobile at 390 × 844: menu opens with the same navy background. Restored
  normal desktop viewport afterward. Preview saved as `dashboard-refined.jpg`.
- Dashboard component suite (8 groups), student UI suite (8 groups), targeted
  dashboard lint and production build pass. No backend, timers, autosave or database
  logic changed in this visual refinement; no deployment performed.

## Live Supabase setup — rechecked 6 October

The previous 5 October missing-schema/key blockers are no longer current:

- Read-only queries for `profiles.role/is_active`, `exams` and `submissions` return HTTP 200.
- An active Admin profile exists.
- The local service-role key is configured; no value was printed or sent to the browser.
- Live staff sign-in, returned session verification and dashboard rendering now succeed.

An active Tutor and Student test login are still needed to verify the full real
upload → exam → save/reload → submit → grade workflow. Live storage delivery,
account-management mutations and grade persistence have not been verified.

## Remaining fidelity/coverage limits

- No real 25-page pre-seen PDF exists in this checkout. The fallback is a
  **four-page sample**, not the complete exam document. Upload the real PDF or set
  `NEXT_PUBLIC_PRESEEN_PDF_URL`; full PDF scrolling/copying still needs browser QA.
- Calculator arithmetic and supported scientific operations are tested; `2nd`,
  `mode` and directional-pad keys remain decorative. It is not a complete TI-30XS
  emulator and must not be described as one.
- Section confirmation is two-step, but its current labels/copy differ from the
  earlier requested exact Pearson wording. Exact video/screenshot fidelity has
  not been certified.
- Clipboard permission denial, actual OS copying, genuine abrupt browser/process
  crash and mobile/real-browser visual rendering remain unverified. Unload
  network flush is best effort: the browser cannot guarantee a completed database
  write while offline or shutting down. Local recovery drafts provide fallback.
- The per-question clock is client-driven, synced to Supabase. RLS protects
  ownership, but a tamper-resistant, server-authoritative timer/section lock is
  outside what these tests establish.
- No full browser recording or desktop screenshot-based visual certification
  is claimed. Live staff login success is supported by HTTP logs and user confirmation.

Method references: [PGlite PostgreSQL runtime](https://pglite.dev/docs/) and
[Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Repeat locally

```text
pnpm --dir test-runtime install
node test-runtime/run-all.mjs
node scripts/verify-phase3.mjs http://localhost:3002
```

Run the HTTP checks only after building and starting the server. Rebuilding
`.next` while a production server is serving it invalidates its artifacts; an
initial HTTP rerun during a concurrent build failed for that reason and was
repeated against a fresh server after the build.

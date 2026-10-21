# Admin submission deletion

## Enable

1. Run `supabase/migrations/20261021_admin_submission_deletion.sql` in the production Supabase SQL Editor after the existing trial/report migrations. Installing it deletes no existing data. It can be rerun safely.
2. Deploy the corresponding application code. No new environment variables are needed. Report file removal uses the existing server-only `SUPABASE_SERVICE_ROLE_KEY` and Supabase URL, including Cloudflare runtime bindings.
3. Sign in as an active admin and open **Answer grading**. Tutors and students have no delete permission, including when calling the API or SQL RPC directly.

## Use

- Select **Delete** on one submission, verify the student and exam, download anything important, then type **DELETE** and confirm.
- This permanently deletes **that completed attempt**, its answers, submission, evaluation and linked report files. It is not an archive or an undoable action. The student's account, enrollment/trial grant, lead entry, other attempts and all shared mock/reference/solution PDFs remain unchanged.
- Removing an attempt does not revoke exam access; the student can start again if their current access permits. Existing copies downloaded by users cannot be recalled.
- Concurrent grading/attachments or a changed submission revision can return a conflict. Reload, review the current record and confirm again rather than silently discarding newer work.

## File cleanup and recovery

PostgreSQL changes are atomic, but object storage is a separate service. A durable `submission_deletions` audit/outbox row records the exact attached report paths before the session cascade commits. The server removes only those paths from `graded-reports` through the Storage API; it never directly deletes Storage metadata using SQL.

If storage is unavailable, the UI explicitly says the attempt was deleted but file cleanup is pending. **Answer grading → Report file cleanup pending → Retry file cleanup** resumes after a reload or Worker restart. No additional student attempts are deleted on retry. Completed cleanup is acknowledged only after Storage metadata confirms the object is absent. A small audit row remains intentionally; it contains no answer text, contact details or reports. This feature reclaims the selected attempt's application data and attached report files, not unrelated/unattached uploads, provider backups or existing downloaded copies.

## Verification

- `node test-runtime/verify-submission-deletion-api.mjs`
- `node test-runtime/verify-database.mjs` (real SQL and RLS in isolated PGlite, text and enum profile roles)
- `node test-runtime/verify-components.mjs` (real React confirmation, cancel, failures, double-click guard, selected-row removal and durable cleanup retry)
- `node test-runtime/run-all.mjs`, TypeScript, ESLint and production build

No production student submission is deleted as part of these tests. For a live acceptance test, create and explicitly identify a disposable completed test attempt; do not use real student work.

# Case study levels and submission documents

## Database migration

Apply `supabase/migrations/20261009_levels_and_submission_reports.sql`, then `supabase/migrations/20261009_student_levels_and_solutions.sql`, then `supabase/migrations/20261010_leads_and_report_delivery.sql`, and finally `supabase/migrations/20261013_tutor_evaluations_and_admin_update.sql`, in that order. The final migration adds staff-only tutor-feedback drafts and publishes them to students only on final submission.

Existing mocks and profiles default to SCS. In People & access, set each student's assigned level to OCS, MCS or SCS before inviting them to start a paper. Use Edit to categorize unused mocks; editing a paper with attempts creates a new draft version and preserves the original. The new level-aware RPCs retain the previous safe edit and publish workflow. No example mocks or real student records are created by this migration.

The migration also creates the private `graded-reports` bucket and `submission_reports` metadata. After the migrations above, apply `supabase/migrations/20261015_report_uploads_and_evaluation_links.sql` to enable PDF/DOCX/DOC files (20 MB), restore active-tutor/admin upload/read/cleanup policies, and link reports to tutor evaluations. It is safe to run again. Reports uploaded before feedback is saved are linked to their submission immediately and to the evaluation automatically on its first save. No public bucket or service-role browser key is needed.

## Interfaces

- Upload/edit form: choose OCS, MCS or SCS; all existing custom subtasks and timers remain available.
- Staff mock library and answer-grading queue: level tabs preserve availability/status filters and pagination.
- Student dashboard: only the student's assigned OCS/MCS/SCS papers, status cards, resume links and instant in-browser tabs. The review view has separate Submitted Answers, Suggested Solutions and Graded Report cards.
- Submission review: Download answers and a Graded reports upload area. Upload as many reports as needed, then publish the score and feedback with the existing grading form. Reports become visible to their owner when the submission is graded. Uploading to an already-graded submission releases the new report immediately.
- Mock upload/edit: attach an optional Suggested solution guide PDF. It is private and is released only after that student submits the relevant mock.
- Student notification: the dashboard shows a dismissible notification once for a newly graded mock or a newly released tutor report. This is browser-local; it does not send email or WhatsApp notifications.
- Public login: “Get 1 Free Trial” collects name, email, phone/WhatsApp and target level. Admins manage requests under Dashboard → Leads.

## APIs

- `GET /api/submissions/:id/answers`: active owner or staff, persisted completed-submission answers as a real `.docx` ZIP/OOXML document, no-store attachment. Its filename is `StudentName_MockNumber_YYYY-MM-DD_HHmm.docx` in Asia/Karachi time. Preserves paragraphs, rich-text emphasis, headings, lists and ordinary tables; does not fetch remote resources. Maximum total answer text is 2 million characters; excessive formatting depth is rejected rather than truncated.
- Add `?format=pdf` for a server-generated PDF or `?format=docx` for Word. The default remains Word for existing links. Both formats share one sanitized content model and typography/layout constants, including explicit line breaks, metadata, tasks, lists, merged table cells and question page breaks. The staff review header offers separate Word/PDF actions to both admins and tutors. Roboto fonts ship with the PDF utility; the regular font is also embedded in Word. No database migration or external conversion service is required for dual exports.
- `GET /api/solutions/:id`: active permitted owner, RLS-checked one-minute private download redirect for a released official solution guide.
- `POST /api/dashboard/submissions/:id/reports`: active staff only, same-origin JSON `{storage_path,file_name}` after a direct private Storage upload. Server downloads and checks the document before attaching metadata. The path must be `staff-user-id/submission-id/random-id.pdf`, `.docx`, or `.doc`. Attached objects cannot be removed by failed-upload cleanup. If the acknowledgement is lost, the UI reuses the uploaded object and idempotent attachment instead of uploading a duplicate.
- `GET /api/reports/:id`: active permitted user, RLS-checked report metadata and a one-minute private download URL.
- `POST /api/free-trial`: same-origin public lead submission with strict input validation. The client receives no lead data.
- `PATCH /api/dashboard/leads/:id`: admin-only same-origin lead status/notes update.

Direct Storage upload avoids sending 20 MB multipart bodies through a host's small serverless request limit. Document checks reject incorrect PDF signatures, renamed ZIPs and macro/embedded binary DOCX packages. This is not an antivirus service; scan uploaded documents separately if required by institutional policy. The portal only downloads documents, never renders arbitrary uploaded HTML.

## Verification

Run `node test-runtime/run-all.mjs`, `node test-runtime/verify-levels-reports.mjs`, TypeScript, ESLint and the Next production build. The database tests execute actual SQL and RLS in isolated PostgreSQL, rerun the migration and roll back fixtures. Authenticated live upload/download QA remains necessary after the migration is applied. No deployment is performed by these changes.

`pnpm build` uses Next's supported webpack builder. The default Turbopack build on this Windows machine failed while starting its CSS subprocess, both inside and outside the sandbox; webpack compiled successfully. This does not change the exam runtime or deploy anything. For a local development preview on an affected Windows machine, use `pnpm dev --webpack`.

See `LEARNWORLDS_ACCESS_REVIEW.md` for the integration findings and required school-owner details.

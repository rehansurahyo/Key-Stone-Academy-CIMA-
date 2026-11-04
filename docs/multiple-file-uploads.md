# Multiple-file uploads

No new SQL migration is required. Existing exam-material rows and report attachment
RPCs already allow multiple files. Keep the existing storage policies and the
20261104 grading/report-removal migration applied.

Staff can select several reports in Answer Grading, add another selection, remove
an unuploaded file, and upload the queue. Uploads run sequentially, with per-file
confirmation. Completed attachments appear immediately without a page refresh.
If a file fails, confirmed reports remain attached and only unconfirmed files stay
in the queue. An uncertain attachment response reuses the same storage path when
retried, preventing duplicate uploads. That pending file cannot be removed from
the queue until its attachment is confirmed. Attached reports retain the existing
individual, confirmed deletion flow and durable storage-cleanup retry.

Mock creation/editing accepts several pre-seen PDFs, solution PDFs and question
references (PDF/PNG/JPG). Each file remains limited to 20 MB; the existing limit of
30 materials per mock is checked before uploading. New selections append to
retained files. Remove a retained file explicitly with Remove from draft. Saving
an attempted mock still creates a new draft version, preserving historical
attempts, answers and original material files. Students can switch between every
pre-seen/reference document; submitted review lists every released solution/report.

Checks: `node test-runtime/verify-components.mjs`,
`node test-runtime/verify-student-ui.mjs`,
`node test-runtime/verify-multiple-uploads-browser.mjs`, `npm run build`.
The browser test uses synthetic uploads in a local fixture and checks desktop,
390px and 320px layouts; it does not change production records.

# Reference images and one free-trial attempt

Run `supabase/migrations/20261028_reference_images_and_single_trial_attempt.sql`
in the production Supabase SQL Editor. It is safe to rerun and does not delete or
rewrite existing attempts, answers, feedback, exam content or trial grants.

## Reference uploads

Question reference files accept PDF, PNG, JPG and JPEG, up to 20 MB. Their extension
and signature are checked before any upload. Images use the matching Storage MIME
type and display inside the existing private reference-material window, with an
original-image link. Pre-seen and solution guides continue to accept PDFs only.
The bucket remains private with its existing staff upload and student entitlement
policies. The migration adds PNG/JPEG to its allowed MIME types.

## Trial attempts

Before starting the timed exam, a new trial student sees a one-attempt warning and
chooses **Go ahead** or **Go back**. Canceling does not create an attempt or start
the timer. An existing active attempt resumes without spending another attempt.
Completed trials cannot be restarted by opening the exam URL again.

The database trigger, not the browser UI, prevents an additional trial session.
One receipt per trial account makes simultaneous starts conflict safely. A losing
tab reloads the original attempt. Receipts survive admin deletion of a submission;
cleanup does not grant another free attempt. Older attempts are backfilled without
deleting historical duplicates. Enrolled students retain their existing behavior.

This restriction applies to the Supabase trial account. Anonymous guests can create
another identity in a new browser. A person-wide restriction would require a
verified identity and is not claimed by this change. Trials deleted before this
migration cannot be reconstructed from the existing deletion audit.

Before the SQL migration is applied, UI checks prevent ordinary retakes but database
enforcement and PNG/JPEG Storage uploads are not enabled. Do not announce those
capabilities as fully active until the migration has succeeded.

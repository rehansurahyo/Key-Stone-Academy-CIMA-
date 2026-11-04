# Grading scales and report removal

Apply `supabase/migrations/20261104_grading_scale_and_report_removal.sql` before
deploying this release. The migration was tested twice against both text and enum
role schemas. It installs capabilities without deleting attempts, answers, grades
or uploaded files. Existing grades receive denominator 100; their scores are not
rescaled. New grading forms default to 150. The marking-scale selector allows an
explicit regrade on another supported scale. Student notifications, completed
review and staff tables display each grade's recorded denominator.

The six-argument evaluation RPC validates the selected scale and serializes saves
against the submission. Its old five-argument overload retains /100 semantics for
clients during rollout. Revisions still protect against stale feedback.

Staff can delete an attached graded report after confirming its filename. SQL
unlinks only that report and records its immutable path in `report_deletions`.
The API removes only that recorded object from the private graded-reports bucket.
Storage failures leave a durable cleanup task visible in Answer Grading, including
after the full attempt is deleted. A stale attachment retry cannot restore a
removed path. Student answers, grades and other reports remain intact.

The mock upload form can clear an accidentally selected pre-seen, solution or
reference file before saving. Existing retained files continue to use Remove
from draft; used mock versions keep their historical material objects.

Verification covers actual PostgreSQL constraints/RLS/RPCs, historical scores,
new /150 scores, invalid and stale grades, legacy RPCs, report removal/retry,
cross-submission denial, path scoping and protection against reattachment. React
and real Chromium tests cover confirmation, cancel, errors, duplicate clicks,
native file clearing, browser score validation and mobile layouts.

Commands: `node test-runtime/verify-database.mjs`,
`node test-runtime/verify-components.mjs`,
`node test-runtime/verify-report-removal-api.mjs`,
`node test-runtime/verify-submission-search.mjs`,
`node test-runtime/verify-server.mjs`,
`node test-runtime/verify-grading-tools-browser.mjs`, `npm run build`.

The browser suite accepts `PLAYWRIGHT_MODULE` and `BROWSER_EXECUTABLE` for bundled
Chromium installations. Its files under `outputs/` contain synthetic data only.

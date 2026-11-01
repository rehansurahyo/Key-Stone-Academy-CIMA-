# Answer export runtime

PDF downloads in student review and staff Answer Grading fetch an authenticated
`/api/submissions/:id/answers?format=data` payload, then lazily load the PDF engine
in the browser. The response uses the same owner/staff authorization as Word and
is private and non-cacheable. No privileged key or public storage URL is returned.
Duplicate clicks are ignored while preparing a PDF. Failures stay on the current
page with an inline warning and a toast; retry does not reset the form.

Word exports and direct PDF URLs remain supported. Both render from the existing
shared answer model. PDF uses pdfmake's self-contained build and embedded virtual
fonts rather than its Node printer and filesystem-backed layout dependencies.
This also makes the direct PDF fallback compatible with workerd. Routine browser
PDF downloads keep document layout/compression off the production Worker.

The verified portal user is memoized only during a Server Component render using
React `cache`. Separate requests and users still perform fresh authentication and
profile checks. Proxy/API authorization remains in place.

## Verification

- `npm run build`
- `node test-runtime/verify-answer-exports.mjs`
- `node test-runtime/verify-levels-reports.mjs`
- `node test-runtime/verify-components.mjs`
- `node test-runtime/verify-management-pages.mjs`
- `node test-runtime/verify-auth.mjs`
- `node test-runtime/verify-server.mjs`
- `node --conditions=react-server test-runtime/verify-request-auth-cache.mjs`
- `node test-runtime/verify-worker-answer-exports.mjs`
- `node test-runtime/verify-answer-download-browser.mjs`

The browser suite needs Playwright/Chromium; set `PLAYWRIGHT_MODULE` and
`BROWSER_EXECUTABLE` when using a bundled runtime. Both browser and workerd tests
use synthetic answers. PDF files under `outputs/` are QA fixtures, not student
data. Multi-page output, Unicode symbols, lists, line breaks and merged tables
are checked, alongside ownership, staff access, expired/suspended access,
duplicate clicks, visible failures and successful retry.

No SQL migration or hosting plan change is required. Local tests do not establish
the cause of a past production 1102: Cloudflare CPU/memory outcome logs and an
authenticated production retest are still needed for that incident.

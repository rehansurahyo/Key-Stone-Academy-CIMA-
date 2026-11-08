# Email automation

Code rollout and email activation are separate stages. The checked-in Worker
configuration keeps automation off while SQL and server secrets are configured.
Local verification uses synthetic accounts, an isolated PostgreSQL engine and
mocked Brevo/Auth transports. Production activation requires a verified rollout.

## Agreed scope

Four email types, each with OCS/MCS/SCS wording:

- Trial welcome after a successful trial registration. Dashboard access remains
  immediate and does not depend on email delivery.
- Trial submission confirmation after the completed session and its submission
  are committed.
- Trial feedback notification after feedback is published, never for drafts.
- Enrolled student invitation containing a secure set-password link.

Enrolled submission/feedback notifications are excluded. Existing enrolled access
to published mocks for the assigned level remains unchanged; the document's
three-mock entitlement is not introduced. No historical events are backfilled.
Routine edits to published feedback do not send repeated notifications.

The sender and reply address are both `info@keystoneacademia.com`, as confirmed by
the owner. Trial dashboards and welcome emails use the latest supplied group and
mini-course links in `lib/student-resources.ts`; the older MCS document link is
superseded. Resource links are external navigation, not course enrolment or SSO.

## Invitation flow

People & Access has a separate Invite enrolled student action. The existing
manual-password tutor/student creation flow is retained. Enter the name, email
and level. The API is active-admin-only, same-origin and accepts no role/password
field. A new account is initially banned while its authoritative profile/level
are saved, then activated. Its random bootstrap password is never shown or sent.

An existing enrolled email is reused, preserving its name, level and history.
Suspended accounts, another level or an unverifiable Auth email require admin
review. It does not silently upgrade guest sessions, tutors or administrators.
Failed profile setup rolls back only the newly created account. A queue failure
after account setup reports that partial result; retrying the same email reuses
the account. A pending invitation is reused; reissues have a two-minute cooldown.

The worker generates a native Supabase recovery link for this verified Auth ID.
The link's token hash is in the URL fragment, not server query logs. The branded
set-password page verifies it only when the student submits their password, so a
mail scanner's GET cannot consume it. Supabase controls expiry and single use.
No admin-browser PKCE verifier is required. The password operation uses a private
in-memory Auth client; it cannot change another account signed into the browser.
After success the student signs in normally. Existing forgot-password behavior is
not replaced.

Invitations are reported as queued, not delivered. Check invitation delivery shows
pending, accepted by Brevo, failed, cancelled or needs-review states. A provider
acceptance is not a guarantee of inbox placement.

## Durable delivery

The SQL migration installs an RLS-protected, service-only outbox and transactional
trial-event triggers. No network call happens in a database trigger. The existing
session capture and grading functions remain authoritative and unchanged.

A Cloudflare scheduled handler runs once a minute and processes up to three jobs.
The internal HTTP handler requires an independent server secret. Each job is leased
with a fencing token; simultaneous runs cannot claim the same active lease.
Retries keep the same provider idempotency key and encrypted invitation URL, so a
lost response does not generate a new password link that invalidates the first.
Links are AES-GCM encrypted at rest with a job/generation binding and cleared after
acceptance. Preserve the encryption key while pending invitations exist.

Transient/uncertain responses retry within a conservative ten-minute provider
deduplication window, with a maximum of five attempts. Older uncertainty stops in
needs_review; check Brevo logs before any manual reissue. Do not promise unlimited
exactly-once email delivery across third-party outages. Invalid recipients and
permanent provider errors stop. Unpublished feedback and unavailable/changed
accounts cancel their queued notification. Jobs older than two days expire.

Trial feedback emails link to the dashboard and contain no grades or private file
attachments. Trial accounts remain guest sessions: the same browser/device is
required to recover the existing dashboard. Email does not create portable trial
authentication or transfer trial history to a registered account.

## Rollout

1. Review and run `supabase/migrations/20261108_portal_email_automation.sql` after
   the existing migrations. Do not run it as part of local tests against production.
2. Configure server-only Worker secrets/variables from `.env.example`:
   `BREVO_API_KEY`, verified `EMAIL_SENDER` and `EMAIL_REPLY_TO`,
   `EMAIL_STUDENT_ORIGIN`, independent random `EMAIL_DISPATCH_SECRET` (32+ chars),
   `EMAIL_LINK_ENCRYPTION_KEY` (32 random bytes as 64 hex characters).
   Keep `EMAIL_AUTOMATION_ENABLED=false` until approved. The Brevo SMTP key in
   Supabase is not a substitute for a Brevo transactional API key.
3. Allow `https://mocks.keystoneacademia.com/set-password` in Supabase Auth redirect
   URLs and verify the Auth recovery expiry. Disable Brevo link tracking for secure
   password links if it alters fragments. Never email a plaintext password.
4. Deploy only after explicit approval. Before enabling, call authenticated GET
   `/api/internal/email-dispatch` with the dispatch bearer secret. It reports only
   configuration/migration readiness and enabled state, without sending email.
   Do not activate until both readiness checks pass.
5. Enable automation in `wrangler.json` only after setup, then deploy that explicit
   activation change and verify the cron trigger. The checked-in value is
   authoritative on future deployments. Run an approved email test to a controlled
   inbox and check Brevo transactional logs and outbox state.

This change does not configure automatic record deletion or Drive backups.

## Local checks

`verify-email-database.mjs`, `verify-email-flows.mjs`,
`verify-invitation-api.mjs`, `verify-email-config-worker.mjs`,
`verify-enrolled-sdk.mjs`, `verify-email-browser.mjs`, existing password recovery security/component
regressions, TypeScript, scoped ESLint and the production build.

The production Next.js build passed. The initial OpenNext Windows packaging run
hit its known directory-symlink issue in generated `.open-next` output. Correcting
only those generated directory links and resuming the adapter's server-bundling
step produced the local Worker. This is a local tooling workaround; source
dependencies and production configuration were not repaired or modified remotely.
An approved future release should still run the normal Linux build/CI checks.
The exact email Worker was then compiled successfully with
`wrangler deploy --config wrangler.json --dry-run` (no upload/deployment). The
explicit config avoids a stale local Vite-generated Wrangler redirect. The
`verify-email-worker-runtime.mjs` check ran that exact archive in local workerd:
the password page returned 200, unauthorized dispatch returned 401, authorized
disabled dispatch remained inert, and intercepted external request count was zero.

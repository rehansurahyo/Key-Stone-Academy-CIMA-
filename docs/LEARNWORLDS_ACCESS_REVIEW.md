# LearnWorlds access review

Reviewed 9 October 2026. Repository review only; no school settings or external account changes were made.

## Finding

The school navigation link is configured as `https://learn.keystoneacademia.com` in the student and admin/tutor dashboard headers. It opens in a separate tab. Set `NEXT_PUBLIC_LEARNWORLDS_SCHOOL_URL` in the environment to configure the destination; restart development or rebuild production after changing this public variable. Blank or invalid/non-HTTPS URLs fall back to the supplied Keystone school URL. No database migration or secret is required for this link.

This is navigation only, not LearnWorlds SSO or enrollment synchronization. No SSO callback, enrollment mapping, webhook endpoint or LearnWorlds API client is present. The unused `app/chatgpt-auth.ts` helper is a legacy ChatGPT hosting helper, not LearnWorlds authentication; portal pages and APIs do not use it. School login and availability have not been verified by configuring this link.

The current portal authenticates through Supabase. Active profiles with a student role can access published mocks in all three levels. OCS/MCS/SCS tabs organize content; they are not paid-course access restrictions. A LearnWorlds link or iframe would not change these permissions. Accordingly, LearnWorlds SSO and enrollment-based authorization cannot currently be described as implemented or verified.

## Existing controls reviewed and locally tested

- Server routes validate the Supabase user and authoritative profile, not browser-provided roles or identity headers.
- Staff mutation endpoints require active admin/tutor roles and same-origin requests. Account management is admin-only.
- Database RLS restricts sessions, answers and submissions to their owner; active staff can grade completed submissions.
- Completed answers cannot be edited. Published mocks can be started; hidden mocks only retain existing owners' attempt history.
- Word downloads use the authenticated user's Supabase client, explicit submission ownership and RLS, with private no-store responses.
- Graded report objects are private. Students only see their own reports after grading; suspended accounts and other students cannot read them.

The isolated database tests exercise actual migration SQL for both text and enum profile roles. HTTP/component tests use mocked transport; they do not establish that a LearnWorlds school or production database is configured correctly.

## Details needed from the school owner

1. The school URL has been supplied and external navigation configured. For a future authenticated integration, confirm whether embedded access or SSO is required.
2. Available LearnWorlds API/SSO capabilities for the school's subscription.
3. Stable LearnWorlds user IDs and the approved mapping to Supabase profiles.
4. Course/product IDs mapped to levels or individual mocks, if enrollment should restrict access.
5. Rules for cancellations, expiry, refunds and an already-started exam when entitlement is revoked.
6. A school sandbox and test learner accounts. Configure secrets privately in server environment settings, never in browser variables or chat.

## Integration acceptance checks once configured

Verify identity on the server, link stable external IDs rather than trusting an email query parameter, and keep the existing Supabase role restrictions. Validate enrollment separately from login. Do not grant tutor/admin roles from external user metadata. Authenticate incoming events according to the school's supported webhook mechanism, record event IDs, reject replayed or unauthenticated requests, and reconcile enrollment state through the authenticated API when events are missed. Test a paid student, a non-enrolled student, expiry/refund, account suspension, refresh, sign-out and cross-student access. Do not deploy entitlement enforcement until the existing student mapping and migration plan are approved.

Official sources reviewed:

- [LearnWorlds custom SSO](https://support.learnworlds.com/support/solutions/articles/12000080804) describes an external authentication flow and LearnWorlds SSO API.
- [LearnWorlds webhooks](https://support.learnworlds.com/support/solutions/articles/12000025878) describes user and enrollment events and API access configuration.

These sources describe supported integration mechanisms, not evidence of any connection in this portal.

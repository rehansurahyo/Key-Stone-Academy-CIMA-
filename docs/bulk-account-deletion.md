# Bulk account deletion

People & Access is still admin-only. Check individual eligible accounts or select
all eligible accounts on the current filtered page (up to 30). Admin accounts and
the signed-in account cannot be selected. Changing the name/level filter or page
starts a new selection.

Delete selected accounts lists the exact names/emails and warns that logins and
their related exam history will be permanently removed. Type DELETE before
confirming. Suspend accounts instead when records need to be kept.

The client calls the existing account DELETE API sequentially, with an explicit
confirmation body for each selected ID. Each call rechecks active-admin access,
same-origin requests and the target role/self protection. The same confirmation
payload is now sent by individual account deletion. Older open tabs should be
refreshed before deleting accounts.

Confirmed removals disappear immediately. A failed or uncertain response stops
the batch and displays the number of confirmed deletions; remaining accounts stay
selected. The account list is refreshed to reconcile a response lost after an Auth
deletion. No automatic retry skips a failed account. Double-clicks are guarded,
and other management controls are disabled while deletion is pending. A removal
blocked by existing file ownership or other database constraints stays a visible
error; the client does not delete those files to bypass the restriction.

No new SQL migration or environment variable is required. No production accounts
are removed by the verification suites. Checks:
`node test-runtime/verify-account-deletion-api.mjs`,
`node test-runtime/verify-components.mjs`, `node test-runtime/verify-server.mjs`,
`node test-runtime/verify-people-search.mjs`,
`node test-runtime/verify-bulk-accounts-browser.mjs`,
`node test-runtime/verify-people-search-browser.mjs`, `npm run build`.

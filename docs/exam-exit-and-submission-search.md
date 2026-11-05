# Exam exit and submission tools

The active exam's dashboard button opens a confirmation explaining that Submit
& Exit saves and submits the current answers, closes the attempt and prevents
resuming/editing it. Stay in Exam keeps the attempt open. Confirmed exit waits for
answer persistence, timer sync and verified session completion before navigating
to the dashboard. Failed saves/submissions keep the confirmation open for retry.
The question timer runs while the student considers the confirmation; time-up
transitions are blocked during a confirmed exit to prevent racing completion.

Closing/reloading the tab requests the browser's native leave warning. Native
warnings use browser-controlled wording and do not themselves submit an attempt;
the explicit Submit & Exit action performs final submission. No unload handler
finalizes an attempt after a cancelled browser warning or an interrupted request.

Session completion now checks the returned database row. A zero-row update must
be followed by confirmation that the attempt was already completed by another
tab. Otherwise a recoverable error replaces the success screen.

Answer Grading searches student names in the database before paginating. Status,
level and search persist in filter and pagination links; a new search starts at
page one. Literal `%`/`_` characters do not broaden the search.

Admins can select individual submissions or the current page and delete those
selected after typing DELETE. The existing revision-checked staff endpoint (admins and tutors after the 20261106 migration)
is reused sequentially. A failed request stops the batch, shows the partial
outcome and retains failed selections. Storage cleanup keeps its existing durable
retry queue. Tutors have search/review access without deletion controls.

Tests: `verify-student-ui.mjs`, `verify-trial-session.mjs`,
`verify-submission-search.mjs`, `verify-components.mjs`,
`verify-submission-deletion-api.mjs` and `npm run build`.
No SQL migration is required for these updates. No real student attempt was
deleted, reset or changed during testing.

`verify-exam-exit-browser.mjs` also exercises the real runtime in desktop/mobile
Chromium: custom exit confirmation, cancel preserving the draft and dismissing
the browser's native reload warning. Set `PLAYWRIGHT_MODULE` and
`BROWSER_EXECUTABLE` when using the bundled browser runtime.

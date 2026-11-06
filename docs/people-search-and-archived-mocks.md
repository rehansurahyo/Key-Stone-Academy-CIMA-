# People search and archived mock history

People & Access remains admin-only. Name search is case-insensitive and treats
typed SQL wildcard characters literally. A selected OCS/MCS/SCS level restricts
results to students assigned that level; tutors' stored profile levels are not
student assignments. Filters run before the 30-account pagination query and remain
in Previous/Next links. Submitting a new search resets to page one; Clear filters
returns to all levels and roles. No account is modified by searching.

The existing Active mocks and Archived mocks views remain separate. Archived
papers show an explicit note that existing attempts, answers and grades are kept,
and can be restored as drafts. Only unused mocks are permanently deleted; a paper
with attempts is archived by the existing atomic lifecycle RPC. No destructive
mock deletion is added. Bulk account removal is documented separately in
[Bulk account deletion](bulk-account-deletion.md).

No SQL migration or new environment variable is required. Verification:
`node test-runtime/verify-people-search.mjs`, `node test-runtime/verify-components.mjs`,
`node test-runtime/verify-people-search-browser.mjs`, `npm run build`.
Browser checks use synthetic local records and do not access production accounts.

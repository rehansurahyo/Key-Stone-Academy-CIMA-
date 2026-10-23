# Lead Excel export

Active admins can use **Leads → Export to Excel** to download saved trial registrations. No SQL migration or additional runtime credentials are required. The existing cookie-authenticated Supabase client and admin role checks protect the read-only export endpoint.

The download includes all saved leads at export start, including records beyond the list's latest 1,000 entries. The search box only filters the on-screen list; the export button explicitly describes this. Cursor pagination handles smaller Supabase response limits without dropping rows. Records saved after export starts are excluded. The export is a point-in-time read, not a transactional database backup; follow-up edits during download may be reflected in later pages.

Columns: full name, email, Phone / WhatsApp number, phone code, phone country, case-study level, registration timestamp in Asia/Karachi, follow-up status and internal notes. Phone country is the selected phone-code region, not confirmed residence. Phone numbers, country codes and user-entered fields remain explicit text, including leading zeros and formula-looking input. Dates are native sortable Excel dates. The sheet has a frozen header, filters, wrapped notes and navy headers.

Exports are limited to 10,000 leads and a bounded text size to protect the production Worker. Larger requests fail visibly with HTTP 413; they never download a silently truncated file. The filename includes the export date. Responses are private/no-store. No lead, account, attempt, grade or report is modified.

Verification:

- `node test-runtime/verify-lead-export.mjs`: actual route and generated XLSX, authorization, pagination beyond 1,000 records, lower project response caps, empty/error/oversize cases and safe text cells.
- `test-runtime/verify-lead-workbook.py`: read-only independent OpenPyXL parsing of the generated fake-data workbook, including date values, phone text, styles, filters and frozen headers. Run with the bundled Python interpreter.
- `node test-runtime/verify-components.mjs`: actual button download, error/retry, double-click guard, preserved search/edit flow and no navigation or refresh.
- `test-runtime/verify-lead-export-layout.mjs`: actual rendered toolbar/table markup with production CSS at desktop/tablet/mobile sizes.

The QA workbook and screenshots in `outputs/lead-export/` contain synthetic data only and are ignored by Git.

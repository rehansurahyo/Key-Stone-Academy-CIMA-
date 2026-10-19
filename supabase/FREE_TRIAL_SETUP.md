# One-mock guest trial setup

1. Run `migrations/20261019_student_trial_access.sql` after all earlier migrations.
   Then run `migrations/20261019_trial_lead_contact_details.sql` for phone contact
   metadata. The compact form update needs no additional migration.
2. In Supabase Authentication settings, enable **Anonymous Sign-ins**. No email or
   password is created for a lead. Do not disable existing email/password login.
3. Recommended before exposing the public form: enable Cloudflare Turnstile in
   Supabase Auth CAPTCHA settings. Add the matching public site key as
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in the deployment environment and rebuild.
   Supabase verifies tokens; no CAPTCHA secret belongs in browser code. Configure
   Auth signup rate limits and, where available, Cloudflare endpoint rate limiting.
4. Publish a genuine **Mock 1** for each offered level. The migration discovers
   published names such as `OCS Mock 1` or `MCS Mock1` (not `Mock 10`). Future
   publications are discovered by a database trigger. If there are duplicates,
   the oldest published Mock 1 is chosen; inspect the mapping before launch:

   ```sql
   select t.level, e.id, e.name, e.status
   from public.trial_exam_access t join public.exams e on e.id=t.exam_id;
   ```

   An administrator can explicitly choose the intended existing Mock 1:

   ```sql
   insert into public.trial_exam_access(level, exam_id)
   values ('OCS', 'REPLACE_WITH_REAL_OCS_MOCK_1_UUID')
   on conflict(level) do update set exam_id=excluded.exam_id;
   ```

   A mismatched level or unpublished paper cannot be granted by registration.
   An unavailable Mock 1 produces a visible error, never access to another paper.
   Changing the mapping affects new trials only; existing trials keep their ID.
   Keep papers already granted to trial learners; unpublish rather than hard
   delete them. The profile foreign key protects an existing trial grant.
5. Share `/free-trial` for visitors and `/student/login` for enrolled students.
   The existing login CTA opens the same form. Successful submission atomically
   creates the lead and binds the guest profile, then loads `/dashboard` with the
   server-issued Supabase session cookie. Other same-level catalog cards remain
   visible but questions/PDFs/attempts are independently protected by RLS.

## Operational notes

- Existing profiles are backfilled as enrolled. Accounts created through the
  protected Admin account endpoint explicitly get enrolled access. New public
  Auth users default to trial; role/access fields cannot be self-promoted.
- Lead email/phone are **unverified contact details**, not login credentials.
  Entering an existing student's email never logs in as or modifies that student.
- The form asks only for a phone calling prefix and number, not residence.
  `phone_country` stores the selected phone region, `country_code` its calling
  prefix, and `phone` the validated E.164 number. The legacy RPC's required
  `country` argument is populated from the phone region for compatibility; it
  must not be interpreted as residence. Old clients can still supply it, and
  historical records are not rewritten. Admin Leads labels/search use **Phone
  country** (`phone_country`). Phone parsing uses pinned libphonenumber metadata,
  not string concatenation. Older leads retain null metadata and original phone
  text; missing phone regions display as “Not provided”.
- A guest can resume in the same browser while its cookies remain. Signing out,
  clearing cookies or using another device loses that guest identity. A contact
  form alone cannot securely guarantee one trial per human/email; that would
  require an additional verification flow. No cross-device recovery is promised.
- Repeated/concurrent submissions from the same guest reuse their original
  grant and lead, without changing their level or opening another mock.
- No production SQL, Auth settings or deployment is applied by the source change.

References: [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous).

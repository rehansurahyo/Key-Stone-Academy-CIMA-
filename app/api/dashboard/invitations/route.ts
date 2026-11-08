import { z } from "zod";
import { apiError, checkOrigin, DashboardError, requireStaff } from "@/lib/dashboard/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailConfig } from "@/lib/email/config";

const schema = z.object({ email: z.string().trim().email().max(254).transform(value => value.toLowerCase()), full_name: z.string().trim().min(1).max(150), assigned_level: z.enum(["OCS", "MCS", "SCS"]) }).strict();
export async function POST(request: Request) {
  let createdId: string | undefined, profileReady = false;
  let admin: Awaited<ReturnType<typeof createAdminClient>> | undefined;
  try {
    checkOrigin(request); await requireStaff("admin");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new DashboardError("Enter a valid student name, email and case-study level.");
    try { await emailConfig(); } catch (reason) { throw new DashboardError(reason instanceof Error ? reason.message : "Email configuration unavailable.", 503); }
    admin = await createAdminClient();
    const ready = await admin.from("portal_email_jobs").select("id").limit(0);
    if (ready.error) throw new DashboardError("Apply the email automation migration before inviting students.", 503);
    const input = parsed.data;
    const existing = await admin.from("profiles").select("id,email,full_name,is_active,assigned_level").ilike("email", input.email.replace(/[\\%_]/g, "\\$&")).eq("role", "student").eq("access_type", "enrolled").limit(2);
    if (existing.error) throw new DashboardError("Unable to verify existing students. Please retry.", 503);
    if ((existing.data?.length ?? 0) > 1) throw new DashboardError("Multiple matching accounts require administrator review.", 409);
    let id: string;
    if (existing.data?.[0]) {
      const account = existing.data[0];
      if (!account.is_active || account.assigned_level !== input.assigned_level) throw new DashboardError("This student already exists. Check their access and assigned level in People & Access before resending.", 409);
      const identity = await admin.auth.admin.getUserById(account.id);
      if (identity.error || identity.data.user?.email?.toLowerCase() !== input.email) throw new DashboardError("The existing login email could not be verified. Correct it in People & Access first.", 409);
      id = account.id;
    } else {
      // The random password is never stored in the app or emailed. Provision
      // while banned so no login can precede authoritative level assignment.
      const created = await admin.auth.admin.createUser({ email: input.email, password: `${crypto.randomUUID()}${crypto.randomUUID()}`, email_confirm: true, ban_duration: "876000h", user_metadata: { full_name: input.full_name } });
      if (created.error || !created.data.user) throw new DashboardError("This email could not be invited. It may already belong to another account; check People & Access before retrying.", 409);
      createdId = id = created.data.user.id;
      const profile = await admin.from("profiles").update({ full_name: input.full_name, role: "student", access_type: "enrolled", is_active: true, assigned_level: input.assigned_level }).eq("id", id).select("id").single();
      if (profile.error || profile.data?.id !== id) throw new DashboardError("The invited student's profile could not be saved.", 503);
      const unblocked = await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
      if (unblocked.error) throw new DashboardError("The invited student could not be activated.", 503);
      profileReady = true;
    }
    const queued = await admin.rpc("queue_enrolled_invitation", { p_user_id: id });
    if (queued.error || typeof queued.data !== "string") throw new DashboardError("The student account is ready, but its invitation could not be queued. Retry this form to send the existing account's invitation.", 503);
    return Response.json({ queued: true, job_id: queued.data, message: "Password invitation queued. Delivery is pending; the student sets their own password after receiving it." }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
  } catch (reason) {
    if (createdId && admin && !profileReady) {
      try { const cleanup = await admin.auth.admin.deleteUser(createdId); if (cleanup.error) throw cleanup.error; }
      catch { return Response.json({ error: "Account setup needs administrator review. Do not create another account; check the invited email in People & Access." }, { status: 503 }); }
    }
    return apiError(reason);
  }
}

export async function GET(request: Request) {
  try {
    await requireStaff("admin");
    const job = new URL(request.url).searchParams.get("job");
    if (!z.string().uuid().safeParse(job).success) throw new DashboardError("Invalid invitation reference.");
    const admin = await createAdminClient();
    const result = await admin.from("portal_email_jobs").select("state,error_code,updated_at,sent_at").eq("id", job).eq("kind", "enrolled_invitation").maybeSingle();
    if (result.error) throw new DashboardError("Invitation delivery status unavailable.", 503);
    if (!result.data) throw new DashboardError("Invitation not found.", 404);
    return Response.json(result.data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (reason) { return apiError(reason); }
}

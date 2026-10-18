import { z } from "zod";
import { apiError, checkOrigin, DashboardError, requireStaff } from "@/lib/dashboard/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

const updateUserSchema = z.object({
  user_id: z.string().uuid(),
  email: z.string().trim().email().max(254).optional(),
  password: z.string()
    .min(PASSWORD_MIN_LENGTH, `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`)
    .max(PASSWORD_MAX_LENGTH, `Password must contain no more than ${PASSWORD_MAX_LENGTH} characters.`)
    .optional(),
}).strict().refine(value => Boolean(value.email || value.password), "Enter a new email address or password.");

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const { user } = await requireStaff("admin");
    const parsed = updateUserSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new DashboardError(parsed.error.issues[0]?.message || "Enter a valid email address or password.");
    if (parsed.data.user_id === user.id) throw new DashboardError("Use your own account settings to change this administrator login.", 403);

    const admin = await createAdminClient();
    const attributes: { email?: string; password?: string; email_confirm?: boolean } = {};
    if (parsed.data.email) { attributes.email = parsed.data.email; attributes.email_confirm = true; }
    if (parsed.data.password) attributes.password = parsed.data.password;
    const { error } = await admin.auth.admin.updateUserById(parsed.data.user_id, attributes);
    if (error) throw new DashboardError(error.message);
    if (parsed.data.email) {
      const { error: profileError } = await admin.from("profiles").update({ email: parsed.data.email }).eq("id", parsed.data.user_id);
      if (profileError) throw new DashboardError("Login updated, but the profile email could not be synchronized.", 503);
    }
    return Response.json({ updated: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

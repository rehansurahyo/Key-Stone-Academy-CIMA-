import { apiError, checkOrigin, DashboardError, requireStaff } from "@/lib/dashboard/auth";
import { newUserSchema } from "@/lib/dashboard/validation";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await requireStaff("admin");
    const parsed = newUserSchema.safeParse(await request.json());
    if (!parsed.success) throw new DashboardError(parsed.error.issues[0].message);
    const admin = createAdminClient();
    const { email, password, full_name, role, assigned_level } = parsed.data;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
    if (error || !data.user) throw new DashboardError(error?.message ?? "Unable to create account.");
    const { error: profileError } = await admin.from("profiles").update({ role, full_name, is_active: true, assigned_level }).eq("id", data.user.id);
    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw new DashboardError("Unable to create the user profile.");
    }
    return Response.json({ id: data.user.id }, { status: 201 });
  } catch (error) { return apiError(error); }
}

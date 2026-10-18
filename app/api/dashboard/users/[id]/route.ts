import { apiError, checkOrigin, DashboardError, requireStaff } from "@/lib/dashboard/auth";
import { updateUserSchema } from "@/lib/dashboard/validation";
import { createAdminClient } from "@/lib/supabase/admin";

async function editableUser(request: Request, id: string) {
  checkOrigin(request);
  const auth = await requireStaff("admin");
  if (id === auth.user.id) throw new DashboardError("You cannot change your own access.", 403);
  const { data } = await auth.supabase.from("profiles").select("role").eq("id", id).single();
  if (!data) throw new DashboardError("Account not found.", 404);
  if (data.role === "admin") throw new DashboardError("Administrator accounts cannot be changed here.", 403);
  return auth;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase } = await editableUser(request, id);
    const parsed = updateUserSchema.safeParse(await request.json());
    if (!parsed.success) throw new DashboardError("Invalid account details.");
    const { error } = await supabase.from("profiles").update(parsed.data).eq("id", id).neq("role", "admin");
    if (error) throw new DashboardError(error.message);
    return Response.json({ updated: true });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await editableUser(request, id);
    const admin = await createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new DashboardError(error.message);
    return Response.json({ deleted: true });
  } catch (error) { return apiError(error); }
}

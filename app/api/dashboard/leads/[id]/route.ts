import { z } from "zod";
import { apiError, checkOrigin, DashboardError, requireStaff } from "@/lib/dashboard/auth";

const updateSchema = z.object({
  status: z.enum(["new", "contacted", "converted", "closed"]),
  admin_notes: z.string().trim().max(5000),
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const { supabase } = await requireStaff("admin");
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) throw new DashboardError("Invalid lead ID.");
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new DashboardError("Enter a valid lead status and notes.");
    const { error } = await supabase.from("free_trial_leads").update(parsed.data).eq("id", id);
    if (error) throw new DashboardError(error.message);
    return Response.json({ updated: true });
  } catch (error) { return apiError(error); }
}

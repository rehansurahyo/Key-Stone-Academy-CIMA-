import { apiError, checkOrigin, DashboardError, requireStaff } from "@/lib/dashboard/auth";
import { gradeSchema } from "@/lib/dashboard/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const { supabase } = await requireStaff();
    const { id } = await params;
    const parsed = gradeSchema.safeParse(await request.json());
    if (!parsed.success) throw new DashboardError("Enter a score from 0–100 and written feedback.");
    const { data, error } = await supabase.rpc("save_tutor_evaluation", {
      p_submission_id: id, p_score: parsed.data.score, p_feedback: parsed.data.feedback,
      p_status: parsed.data.status, p_revision: parsed.data.revision,
    });
    if (error) throw new DashboardError(error.code === "PGRST202" ? "Apply the tutor evaluations migration first." : error.message, error.code === "40001" ? 409 : error.code === "PGRST202" ? 503 : 400);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

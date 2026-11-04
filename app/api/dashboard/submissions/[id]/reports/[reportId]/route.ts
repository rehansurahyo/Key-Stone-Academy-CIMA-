import { z } from "zod";
import { apiError, checkOrigin, DashboardError, requireStaff } from "@/lib/dashboard/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  try {
    checkOrigin(request);
    const { supabase } = await requireStaff();
    const { id, reportId } = await params;
    const body = z.object({ confirmation: z.literal("DELETE") }).strict().safeParse(await request.json().catch(() => null));
    if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(reportId).success || !body.success) throw new DashboardError("Confirm deletion for a valid attached report.");
    const { data, error } = await supabase.rpc("remove_submission_report", { p_submission_id: id, p_report_id: reportId });
    if (error) {
      if (error.code === "PGRST202") throw new DashboardError("Apply the report-removal migration first.", 503);
      if (error.code === "42501") throw new DashboardError("Active staff access required.", 403);
      if (error.code === "P0002") throw new DashboardError("Report not found.", 404);
      if (["40001", "55P03", "40P01"].includes(error.code)) throw new DashboardError("The submission is being updated. Please retry.", 409);
      throw new DashboardError("Unable to remove this report safely. Please contact support.", 503);
    }
    if (!data || typeof data.storage_path !== "string" || typeof data.cleanup_pending !== "boolean") throw new DashboardError("Unable to confirm report removal. Please reload.", 503);
    const path: string = data.storage_path;
    if (path.includes("..") || path.split("/").length !== 3 || path.split("/")[1] !== id) throw new DashboardError("The report cleanup path requires review.", 503);
    let pending: boolean = data.cleanup_pending;
    if (pending) {
      try {
        const admin = await createAdminClient();
        const removed = await admin.storage.from("graded-reports").remove([path]);
        if (!removed.error) {
          const ack = await supabase.rpc("ack_report_removal", { p_report_id: reportId });
          if (!ack.error && typeof ack.data === "boolean") pending = ack.data;
        }
      } catch { /* The database outbox retains cleanup after an interrupted request. */ }
    }
    return Response.json({ deleted: true, cleanup_pending: pending }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

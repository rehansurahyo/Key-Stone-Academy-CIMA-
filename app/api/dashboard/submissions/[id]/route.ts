import { apiError, checkOrigin, DashboardError, requireStaff } from "@/lib/dashboard/auth";
import { gradeSchema } from "@/lib/dashboard/validation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const deleteSchema = z.object({ revision: z.number().int().min(0).max(2147483647), confirmation: z.literal("DELETE") }).strict();

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const { supabase } = await requireStaff("admin");
    const { id } = await params;
    const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
    if (!z.string().uuid().safeParse(id).success || !parsed.success) {
      throw new DashboardError("Confirm DELETE for a valid submission and revision.");
    }
    const { data, error } = await supabase.rpc("delete_exam_submission", {
      p_submission_id: id, p_revision: parsed.data.revision,
    });
    if (error) {
      if (error.code === "PGRST202") throw new DashboardError("Apply the admin submission deletion SQL migration first.", 503);
      if (error.code === "42501") throw new DashboardError("Active administrator access required.", 403);
      if (error.code === "P0002") throw new DashboardError("Submission not found.", 404);
      if (["40001", "55P03", "40P01"].includes(error.code)) throw new DashboardError("This submission changed or is being updated. Reload and try again.", 409);
      throw new DashboardError("Unable to delete this attempt safely. No changes were saved. Please contact support.", 503);
    }
    if (!data || !Array.isArray(data.pending_report_paths)) throw new DashboardError("Unable to verify deletion. Reload before trying again.", 503);
    const paths: string[] = data.pending_report_paths;
    let pending = paths.length;
    // DB deletion and object storage cannot share a transaction. The SQL outbox
    // preserves retryable cleanup even after a timeout or Worker restart.
    if (pending) {
      try {
        if (!paths.every(path => typeof path === "string" && !path.includes("..") && path.split("/").length === 3 && path.split("/")[1] === id)) {
          throw new Error("Invalid cleanup paths");
        }
        const admin = await createAdminClient();
        // Only server-recorded paths in this private report bucket are accepted;
        // request bodies cannot name files, buckets, accounts or other attempts.
        for (let start = 0; start < paths.length; start += 100) {
          const batch = paths.slice(start, start + 100);
          const { error: storageError } = await admin.storage.from("graded-reports").remove(batch);
          if (storageError) break;
          const { data: remaining, error: ackError } = await supabase.rpc("ack_submission_report_cleanup", { p_submission_id: id, p_paths: batch });
          if (ackError || typeof remaining !== "number") break;
          pending = remaining;
        }
      } catch {
        // The attempt is already deleted. Report the partial outcome explicitly;
        // the admin cleanup queue remains available after a full page reload.
      }
    }
    return Response.json({ deleted: true, cleanup_pending: pending > 0, pending_files: pending }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

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

import { z } from "zod";
import { apiError, checkOrigin, DashboardError } from "@/lib/dashboard/auth";
import { requireSubmission } from "@/lib/submission-access";
import { MAX_REPORT_BYTES, REPORT_BUCKET, safeFileName } from "@/lib/report-files";
import { validateReport } from "@/lib/report-validation";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const { id } = await params;
    const { supabase, user, staff } = await requireSubmission(id);
    if (!staff) throw new DashboardError("Only active staff can upload reports.", 403);
    const parsed = z.object({ storage_path: z.string().max(600), file_name: z.string().min(1).max(255) }).strict().safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new DashboardError("Provide a report filename and upload path.");
    const { storage_path, file_name } = parsed.data;
    if (!storage_path.startsWith(`${user.id}/${id}/`) || storage_path.includes("..")) throw new DashboardError("Use your own upload for this submission.", 403);
    const { data: blob, error: downloadError } = await supabase.storage.from(REPORT_BUCKET).download(storage_path);
    if (downloadError || !blob) throw new DashboardError("The report upload could not be found. Please retry.");
    if (blob.size > MAX_REPORT_BYTES) throw new DashboardError("Reports cannot exceed 20 MB.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let mime: string;
    try { mime = await validateReport(bytes, file_name); } catch (error) { throw new DashboardError(error instanceof Error ? error.message : "Invalid report."); }
    const { data, error } = await supabase.rpc("attach_submission_report", { p_submission_id: id, p_storage_path: storage_path,
      p_file_name: safeFileName(file_name), p_mime_type: mime, p_byte_size: bytes.length });
    if (error) {
      const missingMigration = ["PGRST202", "42703", "42P01"].includes(error.code)
        || (error.code === "23514" && error.message.includes("submission_reports_mime_type_check"));
      throw new DashboardError(missingMigration ? "Report storage is not ready. Ask an administrator to apply the latest report-upload migration." : error.message, missingMigration ? 503 : 400);
    }
    if (!data) throw new DashboardError("The report attachment was not confirmed. Please retry.", 503);
    return Response.json({ id: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

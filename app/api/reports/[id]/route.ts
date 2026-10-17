import { z } from "zod";
import { apiError, DashboardError } from "@/lib/dashboard/auth";
import { requirePortalUser } from "@/lib/submission-access";
import { REPORT_BUCKET } from "@/lib/report-files";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) throw new DashboardError("Invalid report ID.");
    const { supabase } = await requirePortalUser();
    const { data: report, error } = await supabase.from("submission_reports").select("storage_path,file_name").eq("id", id).maybeSingle();
    if (error) throw new DashboardError("Unable to load reports. Apply the reports migration first.", 503);
    if (!report) throw new DashboardError("Report not found.", 404);
    // RLS protects both metadata and the private object. Links expire in one minute.
    const { data, error: storageError } = await supabase.storage.from(REPORT_BUCKET).createSignedUrl(report.storage_path, 60, { download: report.file_name });
    if (storageError || !data) throw new DashboardError("Unable to download this report.", 503);
    return new Response(null, { status: 302, headers: { Location: data.signedUrl, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return apiError(error); }
}

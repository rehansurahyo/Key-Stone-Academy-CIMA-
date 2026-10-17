import { z } from "zod";
import { apiError, DashboardError } from "@/lib/dashboard/auth";
import { requirePortalUser } from "@/lib/submission-access";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) throw new DashboardError("Invalid solution guide ID.");
    const { supabase } = await requirePortalUser();
    // RLS only returns this row to staff or a student with a submitted/graded matching mock.
    const { data: solution, error } = await supabase.from("exam_materials").select("storage_path,name,kind").eq("id", id).eq("kind", "solution").maybeSingle();
    if (error) throw new DashboardError("Unable to load the suggested solution.", 503);
    if (!solution) throw new DashboardError("Suggested solution not found.", 404);
    const { data, error: storageError } = await supabase.storage.from("exam-materials").createSignedUrl(solution.storage_path, 60, { download: solution.name });
    if (storageError || !data) throw new DashboardError("Unable to download the suggested solution.", 503);
    return new Response(null, { status: 302, headers: { Location: data.signedUrl, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return apiError(error); }
}

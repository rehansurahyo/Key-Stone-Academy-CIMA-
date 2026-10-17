import { apiError, DashboardError, requireStaff } from "@/lib/dashboard/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireStaff();
    const { id } = await params;
    const { data: material } = await supabase.from("exam_materials").select("storage_path").eq("id", id).single();
    if (!material) throw new DashboardError("Document not found.", 404);
    const { data, error } = await supabase.storage.from("exam-materials").createSignedUrl(material.storage_path, 300);
    if (error) throw new DashboardError("Unable to open the document.");
    return Response.redirect(data.signedUrl, 302);
  } catch (error) { return apiError(error); }
}

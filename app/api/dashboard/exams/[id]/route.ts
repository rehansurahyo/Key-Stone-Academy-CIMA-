import { z } from "zod";
import { apiError, checkOrigin, DashboardError, requireStaff } from "@/lib/dashboard/auth";
import { editMockSchema, mockStatusSchema, removeMockSchema } from "@/lib/dashboard/validation";
import { mockQuestionRows } from "@/lib/dashboard/mock-payload";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const { supabase } = await requireStaff();
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) throw new DashboardError("Invalid mock exam ID.");
    const payload = mockStatusSchema.safeParse(await request.json().catch(() => null));
    if (!payload.success) throw new DashboardError("Provide a valid publication action and revision.");
    const action = "status" in payload.data ? payload.data.status === "published" ? "publish" : "unpublish" : "restore";
    const { data, error } = await supabase.rpc("manage_mock_exam", { p_id: id, p_action: action, p_revision: payload.data.revision });
    if (error) throw databaseError(error);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

function databaseError(error: { code?: string; message: string }) {
  if (error.code === "PGRST202" || error.code === "42703") return new DashboardError("Apply the safe mock-management migration before using this action.", 503);
  return new DashboardError(error.message, error.code === "P0002" ? 404 : error.code === "42501" ? 403 : error.code === "40001" ? 409 : 400);
}
type Context = { params: Promise<{ id: string }> };
async function mutationContext(request: Request, params: Context["params"]) {
  checkOrigin(request);
  const auth = await requireStaff();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) throw new DashboardError("Invalid mock exam ID.");
  return { ...auth, id };
}
export async function DELETE(request: Request, { params }: Context) {
  try {
    const { supabase, id } = await mutationContext(request, params);
    const payload = removeMockSchema.safeParse(await request.json().catch(() => null));
    if (!payload.success) throw new DashboardError("Provide the current mock revision.");
    // SQL decides delete vs archive from actual attempts, not the browser count.
    // Shared PDF objects are retained; only unused exam metadata is deleted.
    const { data, error } = await supabase.rpc("manage_mock_exam", { p_id: id, p_action: "remove", p_revision: payload.data.revision });
    if (error) throw databaseError(error);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
export async function PUT(request: Request, { params }: Context) {
  try {
    const { supabase, id } = await mutationContext(request, params);
    const payload = editMockSchema.safeParse(await request.json().catch(() => null));
    if (!payload.success) throw new DashboardError(payload.error.issues[0].message);
    const exam = payload.data;
    if (exam.materials.some(material => material.storage_path.includes(".."))) throw new DashboardError("Invalid material path.");
    // SQL verifies retained PDFs belong to the source and uploads to the caller.
    const { data, error } = await supabase.rpc("save_mock_exam_with_level", { p_id: id, p_revision: exam.revision, p_level: exam.level,
      p_name: exam.name, p_description: exam.description, p_questions: mockQuestionRows(exam.questions), p_materials: exam.materials });
    if (error) throw databaseError(error);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

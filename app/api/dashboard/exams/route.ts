import { randomUUID } from "node:crypto";
import { apiError, checkOrigin, DashboardError, requireStaff } from "@/lib/dashboard/auth";
import { mockSchema } from "@/lib/dashboard/validation";
import { mockQuestionRows } from "@/lib/dashboard/mock-payload";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { supabase, user } = await requireStaff();
    const parsed = mockSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new DashboardError(parsed.error.issues[0].message);
    const exam = parsed.data;
    if (exam.materials.some(m => !m.storage_path.startsWith(`${user.id}/`) || m.storage_path.includes(".."))) {
      throw new DashboardError("Material files must belong to your upload folder.", 403);
    }
    const questions = mockQuestionRows(exam.questions);
    const { data, error } = await supabase.rpc("create_mock_exam_with_level", {
      p_id: randomUUID(), p_name: exam.name, p_description: exam.description,
      p_status: exam.status, p_questions: questions, p_materials: exam.materials,
      p_level: exam.level,
    });
    if (error) throw new DashboardError(error.message, 400);
    return Response.json({ id: data }, { status: 201 });
  } catch (error) { return apiError(error); }
}

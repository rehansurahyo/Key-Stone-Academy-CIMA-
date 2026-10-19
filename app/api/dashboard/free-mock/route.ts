import { z } from "zod";
import { apiError, checkOrigin, DashboardError, requireStaff } from "@/lib/dashboard/auth";

const selectionSchema = z.object({
  exam_id: z.string().uuid(),
  level: z.enum(["OCS", "MCS", "SCS"]),
  revision: z.number().int().min(0),
  previous_exam_id: z.string().uuid().nullable(),
}).strict();

function databaseError(error: { code?: string }) {
  if (error.code === "23505") return new DashboardError("The free mock changed. Reload this page and try again.", 409);
  if (error.code === "42501") return new DashboardError("Only an active administrator can change the free mock.", 403);
  return new DashboardError("Unable to save the free mock. Reload and try again.", 503);
}

export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    // Use the signed-in administrator's RLS-protected client, not a service key.
    const { supabase } = await requireStaff("admin");
    const payload = selectionSchema.safeParse(await request.json().catch(() => null));
    if (!payload.success) throw new DashboardError("Provide a valid mock, level and current selection.");
    const selection = payload.data;
    const { data: exam, error: examError } = await supabase.from("exams")
      .select("id,level,status,revision").eq("id", selection.exam_id).maybeSingle();
    if (examError) throw databaseError(examError);
    if (!exam) throw new DashboardError("This mock no longer exists.", 404);
    if (exam.status !== "published") throw new DashboardError("Publish this mock before making it free.", 409);
    if (exam.level !== selection.level || exam.revision !== selection.revision) {
      throw new DashboardError("This mock changed. Reload before setting it as free.", 409);
    }
    const { data: current, error: readError } = await supabase.from("trial_exam_access")
      .select("exam_id").eq("level", selection.level).maybeSingle();
    if (readError) throw databaseError(readError);
    if (current?.exam_id === exam.id) {
      return Response.json({ id: exam.id }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if ((current?.exam_id ?? null) !== selection.previous_exam_id) {
      throw new DashboardError("Another administrator changed the free mock. Reload and review the current selection.", 409);
    }
    // Compare-and-set prevents an old confirmation from overwriting a newer
    // admin choice. The level primary key enforces one selection per level.
    // Never update profiles, sessions, answers or existing trial grants here.
    const write = current
      ? supabase.from("trial_exam_access").update({ exam_id: exam.id })
        .eq("level", selection.level).eq("exam_id", current.exam_id)
      : supabase.from("trial_exam_access").insert({ level: selection.level, exam_id: exam.id });
    const { data: saved, error: saveError } = await write.select("level,exam_id").maybeSingle();
    if (saveError) throw databaseError(saveError);
    if (!saved) throw new DashboardError("The free mock changed. Reload this page and try again.", 409);
    return Response.json({ id: saved.exam_id }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

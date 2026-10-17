import { apiError, DashboardError } from "@/lib/dashboard/auth";
import { requireSubmission } from "@/lib/submission-access";
import { buildAnswerDocx } from "@/lib/answer-docx";
import { AnswerExportValidationError } from "@/lib/answer-export-model";
import { DOCX_MIME } from "@/lib/report-files";
import { answerDownloadFilename } from "@/lib/answer-download-filename";
import type { ExamQuestion } from "@/lib/dashboard/types";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, submission } = await requireSubmission(id);
    const format = new URL(request.url).searchParams.get("format") ?? "docx";
    if (format !== "docx" && format !== "pdf") throw new DashboardError("Choose a Word (.docx) or PDF (.pdf) export.");
    const [exam, student, questions, answers] = await Promise.all([
      supabase.from("exams").select("name,level").eq("id", submission.exam_id).single(),
      supabase.from("profiles").select("full_name,email").eq("id", submission.student_id).single(),
      supabase.from("exam_questions").select("*").eq("exam_id", submission.exam_id).order("position"),
      supabase.from("exam_answers").select("question_id,answer_text").eq("session_id", submission.session_id),
    ]);
    if ([exam, student, questions, answers].some(result => result.error)) throw new DashboardError("Unable to load the submitted answers.", 503);
    let buffer: Buffer;
    try {
      const build = format === "pdf" ? (await import("@/lib/answer-pdf")).buildAnswerPdf : buildAnswerDocx;
      buffer = await build({ examName: exam.data!.name, level: exam.data!.level, candidate: student.data!.full_name || student.data!.email || "Student", submittedAt: submission.submitted_at,
      questions: (questions.data ?? []) as ExamQuestion[], answers: Object.fromEntries((answers.data ?? []).map(answer => [answer.question_id, String(answer.answer_text ?? "")])) }); }
    catch (error) {
      if (error instanceof AnswerExportValidationError) throw new DashboardError(error.message, 422);
      console.error("Answer export failed", { submissionId: id, format, error });
      throw new DashboardError("Unable to generate the answer document. Please try again.", 500);
    }
    const filename = answerDownloadFilename(student.data!.full_name || student.data!.email || "Student", exam.data!.name, submission.submitted_at, format);
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": format === "pdf" ? "application/pdf" : DOCX_MIME, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return apiError(error); }
}

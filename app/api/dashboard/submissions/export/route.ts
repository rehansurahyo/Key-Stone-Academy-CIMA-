import { apiError, DashboardError, requireStaff } from "@/lib/dashboard/auth";
import { buildSubmissionXlsx, submissionExportFilename, MAX_EXPORT_CHARACTERS, MAX_EXPORT_SUBMISSIONS, XLSX_MIME, type SubmissionExportItem } from "@/lib/submission-xlsx";
import { parseExamLevel } from "@/lib/exam-levels";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireStaff();
    const url = new URL(request.url);
    const access = url.searchParams.get("access");
    const trialOnly = access === "trial";
    const level = parseExamLevel(url.searchParams.get("level") ?? undefined);
    const rawStatus = url.searchParams.get("status");
    const status = ["submitted", "graded"].includes(rawStatus ?? "") ? rawStatus! : undefined;
    const search = url.searchParams.get("q")?.trim().slice(0, 100) || "";

    const startedAt = new Date();
    const submissions: SubmissionExportItem[] = [];
    let cursor: string | null = null;
    let characters = 0;

    const relation = search || trialOnly ? "profiles!submissions_student_id_fkey!inner" : "profiles!submissions_student_id_fkey";

    while (true) {
      let query = supabase.from("submissions")
        .select(`id, submitted_at, status, score, score_max, feedback, student:${relation}(full_name,email,access_type), exam:exams!inner(name,level)`)
        .lte("submitted_at", startedAt.toISOString())
        .order("id", { ascending: true })
        .limit(500);

      if (level) query = query.eq("exam.level", level);
      if (trialOnly) query = query.eq("student.access_type", "trial");
      if (status) query = query.eq("status", status);
      if (search) query = query.ilike("student.full_name", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
      if (cursor) query = query.gt("id", cursor);

      const { data, error } = await query;
      if (error || !data) throw new DashboardError("Unable to load the submissions for export. Please try again.", 503);
      if (!data.length) break;

      for (const row of data as unknown as SubmissionExportItem[]) {
        const student = row.student;
        const exam = row.exam;
        characters += (row.feedback?.length ?? 0) + (student?.full_name?.length ?? 0) + (student?.email?.length ?? 0) + (exam?.name?.length ?? 0);
        submissions.push(row);
      }

      if (submissions.length > MAX_EXPORT_SUBMISSIONS || characters > MAX_EXPORT_CHARACTERS) {
        throw new DashboardError("This submission export is too large. Please narrow your filters and try again.", 413);
      }

      const next = String(data[data.length - 1].id);
      if (cursor !== null && next <= cursor) throw new DashboardError("Unable to finish the export safely. Please retry.", 503);
      cursor = next;
    }

    submissions.sort((a, b) => b.submitted_at.localeCompare(a.submitted_at) || a.id.localeCompare(b.id));

    let bytes: Uint8Array;
    try { bytes = await buildSubmissionXlsx(submissions); }
    catch { throw new DashboardError("Unable to generate the Excel file. Please try again.", 503); }

    const tag = trialOnly ? "trials" : level ? level.toLowerCase() : "";

    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${submissionExportFilename(startedAt, tag)}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "X-Export-Row-Count": String(submissions.length),
    } });
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}

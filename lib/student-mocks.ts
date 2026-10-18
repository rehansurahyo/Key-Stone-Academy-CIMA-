import type { ExamLevel } from "./exam-levels";
import { canUseExam, type StudentAccess } from "./exam-access";
export type StudentMock = { id: string; name: string; description: string; level: ExamLevel; status?: string };
export type MockAttempt = { id: string; exam_id: string; status: "not_started" | "in_progress" | "completed"; exam: StudentMock | null };
export type MockSubmission = { id: string; exam_id: string; status: string; score: number | null; feedback: string; exam: StudentMock | null };

// Prefer unfinished work over historical completions. Never invent papers.
export function studentMockCards(exams: StudentMock[], attempts: MockAttempt[], submissions: MockSubmission[], access?: StudentAccess) {
  const catalog = new Map(exams.map(exam => [exam.id, exam]));
  for (const attempt of attempts) if (attempt.exam) catalog.set(attempt.exam_id, { ...attempt.exam, id: attempt.exam_id });
  for (const submission of submissions) if (submission.exam && !catalog.has(submission.exam_id)) catalog.set(submission.exam_id, { ...submission.exam, id: submission.exam_id });
  return [...catalog.values()].map(exam => {
    const own = attempts.filter(attempt => attempt.exam_id === exam.id);
    const active = own.find(attempt => attempt.status === "in_progress") ?? own.find(attempt => attempt.status === "not_started");
    const submission = submissions.find(item => item.exam_id === exam.id);
    const status = active?.status ?? (own.some(attempt => attempt.status === "completed") || submission ? "completed" : "not_started");
    const locked = access ? !canUseExam(access, exam) : false;
    return { exam, status, submission, locked, canOpen: !locked && (Boolean(active) || (status !== "completed" && exam.status === "published")) };
  });
}

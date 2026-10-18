import { requireStudentPage } from "@/lib/dashboard/auth";
import { RoleGuard } from "@/components/role-guard";
import { PageHeading } from "@/components/dashboard/shared";
import { LearnWorldsLink } from "@/components/learnworlds-link";
import { parseExamLevel } from "@/lib/exam-levels";
import { studentMockCards, type StudentMock, type MockAttempt, type MockSubmission } from "@/lib/student-mocks";
import { StudentMockDashboard } from "@/components/student-mock-dashboard";
import type { ExamMaterial, SubmissionReport } from "@/lib/dashboard/types";

export default async function StudentDashboard({ searchParams }: { searchParams: Promise<{ level?: string; notice?: string }> }) {
  const { supabase, user, profile } = await requireStudentPage();
  const assignedLevel = parseExamLevel(profile.assigned_level);
  if (!assignedLevel) throw new Error("Your account needs a valid assigned case-study level. Ask an administrator to update it.");
  const query = await searchParams;
  const level = parseExamLevel(query.level);
  const [exams, submissions, attempts, reports, solutions] = await Promise.all([
    supabase.from("exams").select("id,name,description,level,status").eq("status", "published").eq("level", assignedLevel).order("created_at", { ascending: false }).limit(1000),
    supabase.from("submissions").select("id,exam_id,status,score,feedback,submitted_at,exam:exams(id,name,description,level,status)").eq("student_id", user.id).order("submitted_at", { ascending: false }).limit(1000),
    supabase.from("exam_sessions").select("id,exam_id,status,exam:exams(id,name,description,level,status)").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1000),
    supabase.from("submission_reports").select("id,submission_id,file_name,created_at").order("created_at", { ascending: false }).limit(1000),
    // RLS releases solution rows only after this student has submitted that exam.
    supabase.from("exam_materials").select("id,exam_id,name,kind,question_id,storage_path,created_at").eq("kind", "solution").limit(1000),
  ]);
  for (const result of [exams, submissions, attempts, reports, solutions]) if (result.error) throw result.error;
  const papers = studentMockCards((exams.data ?? []) as StudentMock[], (attempts.data ?? []) as unknown as MockAttempt[], (submissions.data ?? []) as unknown as MockSubmission[], profile)
    .filter(card => card.exam.level === assignedLevel);
  const feedback = ((submissions.data ?? []) as unknown as MockSubmission[]).filter(item => item.exam?.level === assignedLevel);
  const attachments = (reports.data ?? []) as SubmissionReport[];
  // The exam shell intentionally locks document scrolling. This dashboard must
  // own a viewport-bounded scroll area so long submission lists stay reachable.
  return <RoleGuard role={profile.role} userId={user.id} allowedRoles={["student"]}><main aria-label="Student dashboard" tabIndex={0} className="h-dvh overflow-x-hidden overflow-y-auto overscroll-y-contain bg-slate-50 px-6 py-10" style={{ scrollbarGutter: "stable" }}><div className="mx-auto max-w-6xl">
    <header><PageHeading title="Student Dashboard" description={`Welcome, ${profile.full_name || user.email || "Student"}. Choose a mock, resume your work or review completed papers.`} action={<nav aria-label="Student portal navigation"><LearnWorldsLink /></nav>} /></header>
    {query.notice === "exam-level" && <div role="alert" className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">This mock is unavailable for your assigned level ({assignedLevel}). Please choose a mock from your dashboard.</div>}
    {query.notice === "trial-locked" && <div role="alert" className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Your free trial includes Mock 1 only. Enrol with Keystone Academia to unlock the remaining papers.</div>}
    <StudentMockDashboard papers={papers} submissions={feedback} reports={attachments} solutions={(solutions.data ?? []) as ExamMaterial[]} assignedLevel={assignedLevel} initialLevel={level} isTrial={profile.access_type === "trial"} />
    {[exams, submissions, attempts, reports, solutions].some(result => result.data?.length === 1000) && <p className="mt-5 text-sm text-slate-500">Showing the latest 1,000 records. Contact support for older history.</p>}
  </div></main></RoleGuard>;
}

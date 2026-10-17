import { notFound, redirect } from "next/navigation";
import { requireStudentPage } from "@/lib/dashboard/auth";
import { RoleGuard } from "@/components/role-guard";
import ExamRuntime from "@/components/exam-runtime";
import type { ExamMaterial, ExamQuestion } from "@/lib/dashboard/types";
import Link from "next/link";
import { Notice } from "@/components/dashboard/shared";
import { parseExamLevel } from "@/lib/exam-levels";

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, profile } = await requireStudentPage();
  const { data: exam, error: examError } = await supabase.from("exams").select("id,name,status,level").eq("id", id).maybeSingle();
  if (examError) throw examError;
  // RLS can hide a cross-level exam entirely, including historical attempts.
  if (!exam) redirect("/dashboard?notice=exam-level");
  if (profile.role === "student" && (!parseExamLevel(profile.assigned_level) || profile.assigned_level !== exam.level)) {
    redirect("/dashboard?notice=exam-level");
  }
  if (exam.status !== "published") {
    const { data: existing, error } = await supabase.from("exam_sessions").select("id")
      .eq("exam_id", id).eq("user_id", user.id).in("status", ["not_started", "in_progress"]).limit(1).maybeSingle();
    if (error) throw error;
    if (!existing) return <main className="mx-auto max-w-xl space-y-5 p-8"><Notice message="This mock is no longer accepting new attempts. Your previous submissions and feedback are preserved." /><Link href="/student/dashboard" className="text-blue-700 underline">Return to Student Dashboard</Link></main>;
  }
  const [questions, materials] = await Promise.all([
    supabase.from("exam_questions").select("*").eq("exam_id", id).order("position"),
    supabase.from("exam_materials").select("*").eq("exam_id", id),
  ]);
  if (questions.error) throw questions.error;
  if (materials.error) throw materials.error;
  if (!questions.data?.length) notFound();
  return <RoleGuard role={profile.role} userId={user.id} allowedRoles={["student"]}><ExamRuntime key={`${user.id}-${id}`} examId={id} examName={exam.name} examLevel={parseExamLevel(exam.level)}
    initialQuestions={(questions.data as ExamQuestion[]).map(q => ({ ...q.content, section: q.position, timeMinutes: q.duration_seconds / 60 }))}
    materials={(materials.data ?? []) as ExamMaterial[]} /></RoleGuard>;
}

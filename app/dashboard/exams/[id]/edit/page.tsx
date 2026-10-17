import { notFound } from "next/navigation";
import Link from "next/link";
import { requireStaffPage } from "@/lib/dashboard/auth";
import { PageHeading, Notice } from "@/components/dashboard/shared";
import { MockUploadForm } from "@/components/dashboard/mock-upload-form";
import type { ExamMaterial, ExamQuestion, MockExam } from "@/lib/dashboard/types";

export default async function EditMock({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireStaffPage();
  const { id } = await params;
  const { data: exam, error } = await supabase.from("exams").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!exam) notFound();
  const [questions, materials, counts] = await Promise.all([
    supabase.from("exam_questions").select("*").eq("exam_id", id).order("position"),
    supabase.from("exam_materials").select("*").eq("exam_id", id),
    supabase.rpc("get_mock_attempt_counts", { p_ids: [id] }),
  ]);
  if (counts.error) return <Notice error message="Apply the safe mock-management migration before editing exams." />;
  if (questions.error) throw questions.error;
  if (materials.error) throw materials.error;
  const attemptCount = (counts.data as { exam_id: string; attempt_count: number }[]).find(row => row.exam_id === id)?.attempt_count ?? 0;
  return <><Link href="/dashboard/exams" className="mb-5 inline-block text-sm font-medium text-blue-700">Back to mock exams</Link>
    <PageHeading title={attemptCount > 0 ? "Edit as a new draft copy" : "Edit mock exam"} description="Update questions, custom weightages, timers and PDFs without changing historical answers." />
    <MockUploadForm key={`${id}-${exam.revision}`} initialExam={{ exam: exam as MockExam, attemptCount, questions: (questions.data ?? []) as ExamQuestion[], materials: (materials.data ?? []) as ExamMaterial[] }} /></>;
}

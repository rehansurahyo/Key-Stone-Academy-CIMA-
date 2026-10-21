import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/dashboard/auth";
import { PageHeading, StatusBadge } from "@/components/dashboard/shared";
import { ExamTaskList } from "@/components/exam-task-list";
import { AnswerPreview } from "@/components/dashboard/answer-preview";
import { SubmissionReports } from "@/components/dashboard/submission-reports";
import { GradingForm } from "@/components/dashboard/grading-form";
import { AnswerDownloads } from "@/components/dashboard/answer-downloads";
import { DeleteSubmissionButton } from "@/components/dashboard/delete-submission-button";
import { TrialBadge } from "@/components/dashboard/trial-badge";
import type { ExamQuestion, Submission, SubmissionReport } from "@/lib/dashboard/types";

export default async function ReviewSubmission({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, profile } = await requireStaffPage();
  const { id } = await params;
  const { data, error } = await supabase.from("submissions").select("*, student:profiles!submissions_student_id_fkey(full_name,email,access_type), exam:exams(name)").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  const submission = data as unknown as Submission;
  const [questionResult, answerResult, reportResult, evaluationResult] = await Promise.all([
    supabase.from("exam_questions").select("*").eq("exam_id", submission.exam_id).order("position"),
    supabase.from("exam_answers").select("question_id,answer_text").eq("session_id", submission.session_id),
    supabase.from("submission_reports").select("*").eq("submission_id", id).order("created_at", { ascending: false }),
    supabase.from("tutor_evaluations").select("score,feedback,status,revision").eq("submission_id", id).maybeSingle(),
  ]);
  if (questionResult.error) throw questionResult.error;
  if (answerResult.error) throw answerResult.error;
  if (reportResult.error) throw reportResult.error;
  if (evaluationResult.error) throw evaluationResult.error;
  const answers: Record<string, string> = Object.fromEntries((answerResult.data ?? []).map(a => [a.question_id, String(a.answer_text ?? "")]));
  const questions = (questionResult.data ?? []) as ExamQuestion[];
  return <><Link href="/dashboard/submissions" className="mb-5 inline-block text-sm font-medium text-cyan-700">Back to submissions</Link><PageHeading title={submission.student?.full_name || submission.student?.email || "Student submission"} description={submission.exam?.name || "Mock exam"} action={<div className="flex flex-wrap items-center gap-3"><TrialBadge accessType={submission.student?.access_type} /><StatusBadge status={submission.status} /><AnswerDownloads submissionId={id} />{profile.role === "admin" && <DeleteSubmissionButton submission={submission} redirectAfterDelete />}</div>} /><div className="mb-7 flex flex-wrap gap-5 text-sm text-slate-500"><span>{submission.student?.email}</span><span>Submitted {new Date(submission.submitted_at).toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}</span></div><div className="mb-7 space-y-6">{questions.map(q => <section key={q.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3"><h2 className="text-base font-semibold text-[#0B2545]">Question {q.position} · {q.content.subject}</h2><span className="ml-3 shrink-0 text-xs text-slate-500">{q.duration_seconds / 60} min</span></div><div className="grid lg:grid-cols-2"><div className="border-b border-slate-200 bg-[#F8FAFC] p-5 text-sm leading-7 lg:border-b-0 lg:border-r"><p className="mb-3 font-semibold text-slate-500">Task requirements</p><p className="mb-4 whitespace-pre-wrap">{q.content.intro}</p><p className="mb-3 font-medium">{q.content.taskPrompt}</p><ExamTaskList question={q.content} /></div><div className="min-w-0 overflow-x-auto"><h3 className="px-5 pt-5 text-sm font-semibold text-slate-500">Student response</h3><AnswerPreview html={answers[q.question_id] ?? ""} /></div></div></section>)}{questions.length === 0 && Object.entries(answers).map(([key, html]) => <section key={key} className="rounded-xl border bg-white"><h2 className="px-5 pt-5 font-semibold">{key}</h2><AnswerPreview html={html} /></section>)}</div><SubmissionReports submissionId={id} reports={(reportResult.data ?? []) as SubmissionReport[]} /><GradingForm key={`${submission.id}-${evaluationResult.data?.revision ?? 0}`} submission={submission} evaluation={evaluationResult.data as { score: number; feedback: string; status: "draft" | "published"; revision: number } | null} /></>;
}

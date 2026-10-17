import Link from "next/link";
import { requireStaffPage } from "@/lib/dashboard/auth";
import { PageHeading, secondaryClass } from "@/components/dashboard/shared";
import { SubmissionTable } from "@/components/dashboard/submission-table";
import type { Submission } from "@/lib/dashboard/types";
import { LevelTabs } from "@/components/dashboard/level-tabs";
import { parseExamLevel } from "@/lib/exam-levels";

export default async function Submissions({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; level?: string }> }) {
  const { supabase } = await requireStaffPage();
  const filters = await searchParams;
  const level = parseExamLevel(filters.level);
  const status = ["submitted", "graded"].includes(filters.status ?? "") ? filters.status! : "all";
  const page = Math.min(10_000, Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1));
  let query = supabase.from("submissions").select("*, student:profiles!submissions_student_id_fkey(full_name,email), exam:exams!inner(name,level)", { count: "exact" });
  if (level) query = query.eq("exam.level", level);
  if (status !== "all") query = query.eq("status", status);
  const { data, count, error } = await query.order("submitted_at", { ascending: false }).range((page - 1) * 20, page * 20 - 1);
  if (error) throw error;
  return <><PageHeading title="Answer grading" description="Review completed case study papers and provide written feedback." /><LevelTabs path="/dashboard/submissions" level={level} query={status === "all" ? {} : { status }} /><div className="mb-5 flex flex-wrap gap-2">{[["all", "All submissions"], ["submitted", "Awaiting review"], ["graded", "Graded"]].map(([value, label]) => <Link key={value} href={`/dashboard/submissions?status=${value}${level ? `&level=${level}` : ""}`} className={`${secondaryClass} ${status === value ? "border-cyan-600 bg-cyan-50 text-cyan-800" : ""}`}>{label}</Link>)}</div><SubmissionTable submissions={(data ?? []) as unknown as Submission[]} /><div className="mt-5 flex items-center justify-between text-sm text-slate-500"><span>{count ?? 0} submissions · Page {page}</span><div className="flex gap-2">{page > 1 && <Link className={secondaryClass} href={`?status=${status}${level ? `&level=${level}` : ""}&page=${page - 1}`}>Previous</Link>}{page * 20 < (count ?? 0) && <Link className={secondaryClass} href={`?status=${status}${level ? `&level=${level}` : ""}&page=${page + 1}`}>Next</Link>}</div></div></>;
}

import Link from "next/link";
import { requireStaffPage } from "@/lib/dashboard/auth";
import { Notice, PageHeading, secondaryClass, inputClass, primaryClass } from "@/components/dashboard/shared";
import { SubmissionCleanupQueue } from "@/components/dashboard/delete-submission-button";
import { SubmissionTable } from "@/components/dashboard/submission-table";
import type { Submission } from "@/lib/dashboard/types";
import { LevelTabs } from "@/components/dashboard/level-tabs";
import { parseExamLevel } from "@/lib/exam-levels";
import { ReportRemovalCleanup } from "@/components/dashboard/delete-report-button";

export default async function Submissions({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; level?: string; q?: string }> }) {
  const { supabase, profile } = await requireStaffPage();
  const capability = await supabase.rpc("can_delete_exam_submissions");
  const canDelete = (!capability.error && capability.data === true)
    || (profile.role === "admin" && capability.error?.code === "PGRST202");
  const cleanup = canDelete ? await supabase.from("submission_deletions")
    .select("submission_id,submission_revision,pending_report_paths").neq("pending_report_paths", "{}")
    .order("deleted_at", { ascending: false }).limit(100) : null;
  const deletionReady = canDelete && !cleanup?.error;
  const cleanupJobs = (cleanup?.data ?? []).map(job => ({
    submission_id: String(job.submission_id), submission_revision: Number(job.submission_revision),
    pending_files: Array.isArray(job.pending_report_paths) ? job.pending_report_paths.length : 0,
  }));
  const filters = await searchParams;
  const reportCleanup = await supabase.from("report_deletions").select("report_id,submission_id,file_name").eq("cleanup_pending", true).order("deleted_at", { ascending: false }).limit(100);
  const reportJobs = (reportCleanup.data ?? []).map(job => ({ report_id: String(job.report_id), submission_id: String(job.submission_id), file_name: String(job.file_name) }));
  const level = parseExamLevel(filters.level);
  const status = ["submitted", "graded"].includes(filters.status ?? "") ? filters.status! : "all";
  const search = typeof filters.q === "string" ? filters.q.trim().slice(0, 100) : "";
  const page = Math.min(10_000, Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1));
  const link = (nextStatus = status, nextPage = 1, nextSearch = search) => {
    const query = new URLSearchParams({ status: nextStatus });
    if (level) query.set("level", level);
    if (nextSearch) query.set("q", nextSearch);
    if (nextPage > 1) query.set("page", String(nextPage));
    return `/dashboard/submissions?${query}`;
  };
  // An inner embedded relation ensures name filtering applies to the complete
  // submission result, before pagination, rather than only the current 20 rows.
  const relation = search ? "profiles!submissions_student_id_fkey!inner" : "profiles!submissions_student_id_fkey";
  let query = supabase.from("submissions").select(`*, student:${relation}(full_name,email,access_type), exam:exams!inner(name,level)`, { count: "exact" });
  if (level) query = query.eq("exam.level", level);
  if (status !== "all") query = query.eq("status", status);
  if (search) query = query.ilike("student.full_name", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
  const { data, count, error } = await query.order("submitted_at", { ascending: false }).range((page - 1) * 20, page * 20 - 1);
  if (error) throw error;
  return <>
    <PageHeading title="Answer grading" description="Review completed case study papers and provide written feedback." />
    <LevelTabs path="/dashboard/submissions" level={level} query={{ ...(status === "all" ? {} : { status }), ...(search ? { q: search } : {}) }} />
    <form method="get" action="/dashboard/submissions" className="mb-5 flex flex-wrap items-end gap-3">
      <input type="hidden" name="status" value={status} />{level && <input type="hidden" name="level" value={level} />}
      <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">Search by student name<input name="q" type="search" maxLength={100} defaultValue={search} placeholder="Enter student name" className={`${inputClass} mt-2`} /></label>
      <button type="submit" className={primaryClass}>Search</button>{search && <Link href={link(status, 1, "")} className={secondaryClass}>Clear search</Link>}
    </form>
    <div className="mb-5 flex flex-wrap gap-2">{[["all", "All submissions"], ["submitted", "Awaiting review"], ["graded", "Graded"]].map(([value, label]) => <Link key={value} href={link(value)} className={`${secondaryClass} ${status === value ? "border-cyan-600 bg-cyan-50 text-cyan-800" : ""}`}>{label}</Link>)}</div>
    {!deletionReady && <Notice error message="Submission deletion is unavailable. Ask an administrator to apply the latest tutor submission deletion migration, then reload; contact support if it is already applied." />}
    {deletionReady && <SubmissionCleanupQueue jobs={cleanupJobs} />}
    {reportCleanup.error ? <Notice error message="Removed report cleanup is unavailable. Please contact support." /> : <ReportRemovalCleanup jobs={reportJobs} />}
    <SubmissionTable key={`${status}:${level}:${search}:${page}`} submissions={(data ?? []) as unknown as Submission[]} canDelete={deletionReady} />
    <div className="mt-5 flex items-center justify-between text-sm text-slate-500"><span>{count ?? 0} submissions · Page {page}</span><div className="flex gap-2">{page > 1 && <Link className={secondaryClass} href={link(status, page - 1)}>Previous</Link>}{page * 20 < (count ?? 0) && <Link className={secondaryClass} href={link(status, page + 1)}>Next</Link>}</div></div>
  </>;
}

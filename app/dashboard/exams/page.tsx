import Link from "next/link";
import { Upload } from "lucide-react";
import { requireStaffPage } from "@/lib/dashboard/auth";
import { PageHeading, primaryClass, Notice } from "@/components/dashboard/shared";
import type { MockExamListItem } from "@/components/dashboard/mock-exams-table";
import { MockExamLibrary } from "@/components/dashboard/mock-exam-library";
import { parseExamLevel } from "@/lib/exam-levels";

export default async function Exams({ searchParams }: { searchParams: Promise<{ created?: string; saved?: string; page?: string; view?: string; level?: string }> }) {
  const { supabase } = await requireStaffPage();
  const params = await searchParams;
  const archived = params.view === "archived";
  const level = parseExamLevel(params.level);
  const page = Math.min(10_000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  let query = supabase.from("exams").select("*, questions:exam_questions(id,duration_seconds), materials:exam_materials(id,name)", { count: "exact" });
  query = archived ? query.eq("status", "archived") : query.neq("status", "archived");
  // Fetch the current view once. Level filtering and pagination then happen in the browser.
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(0, 999);
  if (error) throw error;
  const exams = (data ?? []) as MockExamListItem[];
  const counts = await supabase.rpc("get_mock_attempt_counts", { p_ids: exams.map(exam => exam.id) });
  const totals = new Map(((counts.data ?? []) as { exam_id: string; attempt_count: number }[]).map(row => [row.exam_id, row.attempt_count]));
  return <><PageHeading title="Mock exams" description="Manage availability, safe revisions and archived exam history." action={<Link href="/dashboard/exams/new" className={primaryClass}><Upload className="size-4" />Upload mock exam</Link>} />
    {params.created && <div className="mb-5"><Notice message="Mock exam saved successfully." /></div>}
    {params.saved && <div className="mb-5"><Notice message={params.saved === "copy" ? "A new draft copy was created. Original attempts and answers are unchanged." : "Mock updated and saved as draft. Publish when ready."} /></div>}
    {counts.error && <div className="mb-5"><Notice error message="Apply the safe mock-management migration to enable management controls and accurate attempt counts." /></div>}
    <MockExamLibrary exams={exams.map(exam => ({ ...exam, attemptCount: totals.get(exam.id) ?? 0 }))} managementReady={!counts.error} initialLevel={level} initialPage={page} archived={archived} />
    {(count ?? 0) > 1000 && <div className="mt-5"><Notice message="Showing the latest 1,000 mocks in this view. Refine or archive older mocks to manage them here." /></div>}
  </>;
}

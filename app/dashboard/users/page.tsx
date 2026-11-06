import Link from "next/link";
import { requireStaffPage } from "@/lib/dashboard/auth";
import { PageHeading, secondaryClass, primaryClass, inputClass } from "@/components/dashboard/shared";
import { UserManagement } from "@/components/dashboard/user-management";
import type { Profile } from "@/lib/dashboard/types";
import { EXAM_LEVELS, LEVEL_NAMES, parseExamLevel } from "@/lib/exam-levels";

export default async function Users({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; level?: string }> }) {
  const { supabase, user } = await requireStaffPage("admin");
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const level = parseExamLevel(params.level);
  const page = Math.min(10_000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const link = (nextPage = 1) => {
    const query = new URLSearchParams();
    if (search) query.set("q", search);
    if (level) query.set("level", level);
    if (nextPage > 1) query.set("page", String(nextPage));
    return `/dashboard/users${query.size ? `?${query}` : ""}`;
  };
  let query = supabase.from("profiles").select("*", { count: "exact" });
  if (search) query = query.ilike("full_name", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
  // Tutors' stored level is not a student assignment and is shown as a dash.
  if (level) query = query.eq("role", "student").eq("assigned_level", level);
  const { data, count, error } = await query.order("created_at", { ascending: false }).range((page - 1) * 30, page * 30 - 1);
  if (error) throw error;
  return <><PageHeading title="People & access" description="Manage tutor and student accounts. Administrator access is protected." />
    <form method="get" action="/dashboard/users" className="mb-5 flex flex-wrap items-end gap-3">
      <label className="min-w-0 flex-1 basis-56 text-sm font-medium text-slate-700">Search by name<input name="q" type="search" maxLength={100} defaultValue={search} placeholder="Enter candidate or tutor name" className={`${inputClass} mt-2`} /></label>
      <label className="min-w-0 flex-1 basis-56 text-sm font-medium text-slate-700">Student level<select name="level" aria-label="Student level" defaultValue={level ?? ""} className={`${inputClass} mt-2`}><option value="">All levels and roles</option>{EXAM_LEVELS.map(value => <option key={value} value={value}>{value} — {LEVEL_NAMES[value]}</option>)}</select></label>
      <button type="submit" className={primaryClass}>Search</button>{(search || level) && <Link href="/dashboard/users" className={secondaryClass}>Clear filters</Link>}
    </form>
    <UserManagement key={`${page}:${search}:${level ?? "all"}`} users={(data ?? []) as Profile[]} currentUserId={user.id} />
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500"><span>{count ?? 0} accounts · Page {page}</span><div className="flex gap-2">{page > 1 && <Link href={link(page - 1)} className={secondaryClass}>Previous</Link>}{page * 30 < (count ?? 0) && <Link href={link(page + 1)} className={secondaryClass}>Next</Link>}</div></div>
  </>;
}

import Link from "next/link";
import { ArrowRight, BookOpen, CheckCheck, ClipboardCheck, Users, Upload } from "lucide-react";
import { requirePortalPage } from "@/lib/dashboard/auth";
import { PageHeading, primaryClass } from "@/components/dashboard/shared";
import { SubmissionTable } from "@/components/dashboard/submission-table";
import type { Submission } from "@/lib/dashboard/types";
import StudentDashboard from "@/app/student/dashboard/page";

export default async function Overview({ searchParams }: { searchParams: Promise<{ level?: string; notice?: string }> }) {
  const { supabase, profile } = await requirePortalPage();
  if (profile.role === "student") return <StudentDashboard searchParams={searchParams} />;
  const results = await Promise.all([
    supabase.from("exams").select("id", { count: "exact", head: true }),
    supabase.from("submissions").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("submissions").select("id", { count: "exact", head: true }).eq("status", "graded"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student"),
    supabase.from("submissions").select("*, student:profiles!submissions_student_id_fkey(full_name,email), exam:exams(name)").order("submitted_at", { ascending: false }).limit(5),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const cards = [
    { label: "Mock exams", count: results[0].count, icon: BookOpen, detail: "Case study library" },
    { label: "Awaiting review", count: results[1].count, icon: ClipboardCheck, detail: "Ready for tutor feedback" },
    { label: "Graded submissions", count: results[2].count, icon: CheckCheck, detail: "Feedback completed" },
    { label: "Students", count: results[3].count, icon: Users, detail: "Registered student accounts" },
  ];
  return <><PageHeading title={`Welcome, ${profile.full_name?.split(" ")[0] || "colleague"}`} description="Manage your mock exams, review student work and deliver meaningful feedback." action={<Link href="/dashboard/exams/new" className={primaryClass}><Upload className="size-4" />Upload mock exam</Link>} /><div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(c => <div key={c.label} className="rounded-[12px] border border-slate-200 bg-white p-5 shadow-[0_2px_6px_rgba(15,23,42,0.025)]"><div className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-slate-600">{c.label}</span><div className="grid size-9 shrink-0 place-items-center rounded-lg border border-blue-100 bg-blue-50/70"><c.icon className="size-4 text-blue-700" /></div></div><p className="mt-3 text-[32px] font-semibold leading-none tracking-tight text-[#0B2545]">{c.count ?? 0}</p><p className="mt-3 text-[11px] text-slate-500">{c.detail}</p></div>)}</div><div className="mb-4 flex items-center justify-between gap-4"><div><h2 className="text-base font-semibold text-[#0B2545]">Recent submissions</h2><p className="mt-1 text-xs text-slate-500">Latest papers submitted for tutor review.</p></div><Link href="/dashboard/submissions" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900">View all<ArrowRight className="size-3.5" /></Link></div><SubmissionTable submissions={(results[4].data ?? []) as unknown as Submission[]} /></>;
}

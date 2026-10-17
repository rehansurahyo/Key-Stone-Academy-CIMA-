"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

type GradedSubmission = { id: string; exam?: { name?: string } | null; score: number | null };
type Report = { id: string; submission_id: string };

export function StudentGradeNotification({ submissions, reports }: { submissions: GradedSubmission[]; reports: Report[] }) {
  const [notice, setNotice] = useState<GradedSubmission | null>(null);

  useEffect(() => {
    const key = "keystone-cima-seen-graded-submissions-v1";
    let stored: unknown = [];
    try { stored = JSON.parse(window.localStorage.getItem(key) || "[]"); } catch { /* Ignore a corrupt browser-only notification cache. */ }
    const seen = new Set<string>(Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : []);
    const newlyGraded = submissions.find(submission => !seen.has(`grade:${submission.id}`));
    const newlyReported = reports.find(report => !seen.has(`report:${report.id}`));
    const newlyPublished = newlyGraded ?? submissions.find(submission => submission.id === newlyReported?.submission_id);
    for (const submission of submissions) seen.add(`grade:${submission.id}`);
    for (const report of reports) seen.add(`report:${report.id}`);
    window.localStorage.setItem(key, JSON.stringify([...seen].slice(-500)));
    const timer = newlyPublished ? window.setTimeout(() => setNotice(newlyPublished), 0) : undefined;
    return () => { if (timer) window.clearTimeout(timer); };
  }, [submissions, reports]);

  if (!notice) return null;
  return <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-50 w-[min(24rem,calc(100vw-2.5rem))] rounded-xl border border-emerald-200 bg-white p-4 shadow-xl">
    <div className="flex gap-3"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" /><div className="min-w-0 flex-1"><p className="font-semibold text-[#0B2545]">Your graded mock is ready</p><p className="mt-1 text-sm leading-5 text-slate-600"><strong>{notice.exam?.name || "Your mock exam"}</strong>{notice.score === null ? " has been reviewed." : ` has been graded: ${notice.score}/100.`} Open Completed mock review to download tutor feedback.</p></div><button type="button" aria-label="Dismiss grade notification" onClick={() => setNotice(null)} className="shrink-0 text-slate-400 hover:text-slate-700"><X className="size-4" /></button></div>
  </div>;
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Save } from "lucide-react";
import type { Submission } from "@/lib/dashboard/types";
import { inputClass, Notice, primaryClass, sendJson } from "./shared";
import { gradingScale } from "@/lib/grading-scale";

type Evaluation = { score: number; score_max?: number; feedback: string; status: "draft" | "published"; revision: number } | null;

export function GradingForm({ submission, evaluation }: { submission: Submission; evaluation: Evaluation }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [action, setAction] = useState<"draft" | "published">("published");
  const [scale, setScale] = useState<100 | 150>(() => evaluation ? gradingScale(evaluation) : submission.score !== null ? gradingScale(submission) : 150);
  const router = useRouter();
  return <form className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError(""); setSaved(false);
    const form = new FormData(e.currentTarget);
    const submittedAction = (e.nativeEvent.submitter as HTMLButtonElement | null)?.dataset.evaluationAction;
    const saveStatus = submittedAction === "draft" ? "draft" : action;
    try {
      await sendJson(`/api/dashboard/submissions/${submission.id}`, "PATCH", { score: Number(form.get("score")), score_max: scale, feedback: form.get("feedback"), status: saveStatus, revision: evaluation?.revision ?? 0 });
      setSaved(true); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save grade."); }
    finally { setBusy(false); }
  }}><h2 className="mb-2 text-lg font-semibold text-[#0B2545]">Grade & feedback</h2><p className="mb-5 text-sm text-slate-500">Draft feedback is visible only to staff. Publish to release the score, feedback and attached reports to the student.</p><label className="mb-5 block max-w-xs text-sm font-medium text-slate-700">Marking scale<select aria-label="Marking scale" value={scale} disabled={busy} onChange={event => setScale(Number(event.target.value) === 150 ? 150 : 100)} className={`${inputClass} mt-2`}><option value={150}>Out of 150</option><option value={100}>Out of 100 (original scale)</option></select></label><fieldset disabled={busy} className="grid gap-5 md:grid-cols-[160px_1fr]"><label className="text-sm font-medium text-slate-700">Overall score / {scale}<input name="score" type="number" required min={0} max={scale} step="0.01" defaultValue={evaluation?.score ?? submission.score ?? ""} className={`${inputClass} mt-2`} /></label><label className="text-sm font-medium text-slate-700">Tutor feedback<textarea name="feedback" required minLength={1} maxLength={20000} rows={5} defaultValue={evaluation?.feedback ?? submission.feedback} className={`${inputClass} mt-2`} placeholder="Explain strengths, gaps and how the student can improve." /></label></fieldset><div className="mt-5 flex flex-wrap items-center justify-between gap-4"><p className="text-xs text-slate-500">{evaluation?.status === "draft" ? "A staff-only draft is saved." : "No student sees feedback until it is published."}</p><div className="flex flex-wrap gap-3"><button type="submit" data-evaluation-action="draft" onClick={() => setAction("draft")} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Save className="size-4" />{busy ? "Saving…" : "Save as Draft"}</button><button type="submit" data-evaluation-action="published" onClick={() => setAction("published")} disabled={busy} className={primaryClass}><CheckCheck className="size-4" />{busy ? "Publishing…" : evaluation?.status === "published" ? "Update & Publish" : "Publish / Final Submit"}</button></div></div>{error && <div className="mt-4"><Notice error message={error} /></div>}{saved && <div className="mt-4"><Notice message="Evaluation saved." /></div>}</form>;
}

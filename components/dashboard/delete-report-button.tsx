"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

export async function removeReport(submissionId: string, reportId: string) {
  const response = await fetch(`/api/dashboard/submissions/${submissionId}/reports/${reportId}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "DELETE" }) });
  const result = await response.json().catch(() => null) as { error?: unknown; deleted?: unknown; cleanup_pending?: unknown } | null;
  if (!response.ok || result?.deleted !== true || typeof result.cleanup_pending !== "boolean") throw new Error(typeof result?.error === "string" ? result.error : "Unable to confirm report removal. Reload before retrying.");
  return result.cleanup_pending;
}

export function DeleteReportButton({ submissionId, reportId, name, onDeleted, disabled = false }: { submissionId: string; reportId: string; name: string; onDeleted: () => void; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef(false);
  return <>
    <button type="button" disabled={disabled} aria-label={`Delete report ${name}`} className="rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50" onClick={() => { setError(""); setOpen(true); }}>Delete report</button>
    <AlertDialog open={open} onOpenChange={next => { if (!pending.current) setOpen(next); }}><AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto [overflow-wrap:anywhere]">
      <AlertDialogHeader><AlertDialogTitle>Delete attached report?</AlertDialogTitle><AlertDialogDescription>Remove “{name}” from this submission? The student’s answers, grade and other reports are kept. This file removal cannot be undone.</AlertDialogDescription></AlertDialogHeader>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} className="bg-red-700 text-white hover:bg-red-800" onClick={async event => {
        event.preventDefault(); if (pending.current) return;
        pending.current = true; setBusy(true); setError("");
        try {
          const cleanupPending = await removeReport(submissionId, reportId);
          setOpen(false); onDeleted(); router.refresh();
          if (cleanupPending) toast.warning("Report detached. File cleanup is pending in Answer Grading.");
          else toast.success("Report removed.");
        } catch (reason) { const message = reason instanceof Error ? reason.message : "Unable to remove the report."; setError(message); toast.error(message); }
        finally { pending.current = false; setBusy(false); }
      }}>{busy ? "Removing…" : "Delete report permanently"}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </>;
}

export type PendingReportRemoval = { report_id: string; submission_id: string; file_name: string };
export function ReportRemovalCleanup({ jobs }: { jobs: PendingReportRemoval[] }) {
  const router = useRouter();
  const [finished, setFinished] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef(false);
  const visible = jobs.filter(job => !finished.includes(job.report_id));
  if (!visible.length) return null;
  return <section aria-label="Removed report cleanup" className="mb-5 space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
    <h2 className="font-semibold">Removed report file cleanup</h2><p>These reports are detached. Retry physical file removal to reclaim storage.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {visible.map(job => <div key={job.report_id} className="flex flex-wrap items-center justify-between gap-2"><span>{job.file_name}</span><button type="button" disabled={busy} className="rounded-md border bg-white px-3 py-2" onClick={async () => {
      if (pending.current) return; pending.current = true; setBusy(true); setError("");
      try { if (await removeReport(job.submission_id, job.report_id)) throw new Error("File cleanup is still pending. Please retry."); setFinished(current => [...current, job.report_id]); toast.success("Report file removed."); router.refresh(); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to remove the file."); }
      finally { pending.current = false; setBusy(false); }
    }}>Retry removed report cleanup</button></div>)}
  </section>;
}

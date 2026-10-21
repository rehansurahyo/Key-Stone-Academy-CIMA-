"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { AnswerDownloads } from "./answer-downloads";
import { Notice, secondaryClass } from "./shared";
import type { Submission } from "@/lib/dashboard/types";

export async function deleteSubmission(id: string, revision: number) {
  const response = await fetch(`/api/dashboard/submissions/${id}`, {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision, confirmation: "DELETE" }),
  });
  const result = await response.json().catch(() => null) as { deleted?: unknown; error?: unknown; cleanup_pending?: unknown; pending_files?: unknown } | null;
  if (!response.ok || result?.deleted !== true) throw new Error(typeof result?.error === "string" ? result.error : "Unable to confirm deletion. Reload and try again.");
  if (typeof result.cleanup_pending !== "boolean" || typeof result.pending_files !== "number") throw new Error("Unable to confirm file cleanup. Reload before trying again.");
  return { deleted: true as const, cleanup_pending: result.cleanup_pending, pending_files: result.pending_files };
}

export function DeleteSubmissionButton({ submission, onDeleted, redirectAfterDelete = false }: {
  submission: Pick<Submission, "id" | "revision" | "student" | "exam">;
  onDeleted?: () => void;
  redirectAfterDelete?: boolean;
}) {
  const router = useRouter();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const name = submission.student?.full_name || submission.student?.email || "Student";
  return <>
    <button type="button" aria-label={`Delete submission by ${name} for ${submission.exam?.name || "Mock exam"}`} className={`${secondaryClass} border-red-200 px-2 py-1.5 text-xs text-red-700 hover:bg-red-50`} onClick={() => { setConfirmation(""); setError(""); setOpen(true); }}>
      <Trash2 className="size-3.5" />Delete
    </button>
    <AlertDialog open={open} onOpenChange={next => { if (!inFlight.current) setOpen(next); }}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto [overflow-wrap:anywhere]" onEscapeKeyDown={event => { if (inFlight.current) event.preventDefault(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this submission permanently?</AlertDialogTitle>
          <AlertDialogDescription>This removes the completed attempt, answers, grade, tutor feedback and uploaded reports for {name} — {submission.exam?.name || "Mock exam"}. It cannot be undone. Other attempts, accounts and mock exam files are not affected.</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm text-slate-600">Download important answers or reports before deleting. The student may start a new attempt if their access permits.</p>
        <AnswerDownloads submissionId={submission.id} />
        <div><label htmlFor={inputId} className="mb-2 block text-sm font-medium">Type DELETE to confirm</label>
          <input id={inputId} value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} className="w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-red-600" />
        </div>
        {error && <div role="alert"><Notice error message={error} /></div>}
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={busy || confirmation !== "DELETE"} className="bg-red-700 text-white hover:bg-red-800" onClick={async event => {
            event.preventDefault();
            if (inFlight.current || confirmation !== "DELETE") return;
            inFlight.current = true; setBusy(true); setError("");
            try {
              const result = await deleteSubmission(submission.id, submission.revision);
              setOpen(false);
              if (result.cleanup_pending) toast.warning("Attempt deleted. Report file cleanup is pending; retry under Answer Grading.");
              else toast.success("Submission, answers and attached reports deleted.");
              onDeleted?.();
              if (redirectAfterDelete) router.replace("/dashboard/submissions");
              router.refresh();
            } catch (reason) {
              const message = reason instanceof Error ? reason.message : "Unable to delete this submission.";
              setError(message); toast.error(message);
            } finally { inFlight.current = false; setBusy(false); }
          }}>{busy ? "Deleting…" : "Delete permanently"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}

export type PendingSubmissionCleanup = { submission_id: string; submission_revision: number; pending_files: number };

export function SubmissionCleanupQueue({ jobs }: { jobs: PendingSubmissionCleanup[] }) {
  const router = useRouter();
  const [finished, setFinished] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const pending = jobs.filter(job => !finished.includes(job.submission_id));
  if (!pending.length) return null;
  return <section aria-label="Pending report file cleanup" className="mb-5 space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
    <h2 className="font-semibold">Report file cleanup pending</h2>
    <p>These attempts have been deleted. Retry removal of their remaining report files to reclaim storage.</p>
    {error && <p role="alert">{error}</p>}
    {pending.map(job => <div key={job.submission_id} className="flex flex-wrap items-center justify-between gap-2">
      <span className="min-w-0 break-all">Submission {job.submission_id} · {job.pending_files} file(s)</span>
      <button type="button" disabled={busy !== null} className={secondaryClass} onClick={async () => {
        if (inFlight.current) return;
        inFlight.current = true; setBusy(job.submission_id); setError("");
        try {
          const result = await deleteSubmission(job.submission_id, job.submission_revision);
          if (result.cleanup_pending) throw new Error("File cleanup is still pending. Please retry or contact support.");
          setFinished(previous => [...previous, job.submission_id]); toast.success("Report files removed."); router.refresh();
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : "Unable to clean up report files.";
          setError(message); toast.error(message);
        } finally { inFlight.current = false; setBusy(null); }
      }}>{busy === job.submission_id ? "Cleaning…" : "Retry file cleanup"}</button>
    </div>)}
  </section>;
}

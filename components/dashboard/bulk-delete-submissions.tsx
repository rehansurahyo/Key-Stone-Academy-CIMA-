"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { deleteSubmission } from "./delete-submission-button";
import type { Submission } from "@/lib/dashboard/types";

export function BulkDeleteSubmissions({ submissions, onDeleted, onBusyChange }: { submissions: Submission[]; onDeleted: (ids: string[]) => void; onBusyChange: (busy: boolean) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const pending = useRef(false);
  return <>
    <button type="button" disabled={!submissions.length || busy} className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50" onClick={() => { setConfirmation(""); setError(""); setOpen(true); }}>Delete selected ({submissions.length})</button>
    <AlertDialog open={open} onOpenChange={next => { if (!pending.current) setOpen(next); }}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <AlertDialogHeader><AlertDialogTitle>Delete {submissions.length} selected submissions?</AlertDialogTitle><AlertDialogDescription>This permanently removes the selected completed attempts, answers, grades and attached reports. Download anything you need before continuing.</AlertDialogDescription></AlertDialogHeader>
        <ul className="max-h-40 list-inside list-disc overflow-y-auto text-sm text-slate-600">{submissions.map(submission => <li key={submission.id}>{submission.student?.full_name || submission.student?.email || "Student"} — {submission.exam?.name || "Mock exam"}</li>)}</ul>
        <label className="text-sm font-medium">Type DELETE to confirm<input value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base" /></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy || confirmation !== "DELETE" || !submissions.length} className="bg-red-700 text-white hover:bg-red-800" onClick={async event => {
          event.preventDefault();
          if (pending.current || confirmation !== "DELETE" || !submissions.length) return;
          pending.current = true; setBusy(true); onBusyChange(true); setProgress(0); setError("");
          const snapshot = [...submissions], deleted: string[] = [];
          let cleanupPending = false;
          try {
            // Reuse the admin-only, revision-checked API. Stop on an uncertain or
            // stale result, and report the exact partial outcome for safe retry.
            for (const submission of snapshot) {
              const result = await deleteSubmission(submission.id, submission.revision);
              deleted.push(submission.id); cleanupPending ||= result.cleanup_pending; setProgress(deleted.length);
            }
            setOpen(false); toast.success(`${deleted.length} submission(s) deleted.`);
          } catch (reason) {
            const message = `${deleted.length} of ${snapshot.length} deleted. ${reason instanceof Error ? reason.message : "Deletion stopped. Reload before retrying."}`;
            setError(message); toast.error(message);
          } finally {
            onDeleted(deleted);
            if (cleanupPending) toast.warning("Some report files need cleanup. Use the pending cleanup panel in Answer Grading.");
            if (deleted.length) router.refresh();
            pending.current = false; setBusy(false); onBusyChange(false);
          }
        }}>{busy ? `Deleting ${progress}/${submissions.length}…` : "Delete selected permanently"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}

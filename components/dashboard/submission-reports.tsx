"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MAX_REPORT_BYTES, REPORT_ACCEPT, REPORT_BUCKET, reportMime } from "@/lib/report-files";
import type { SubmissionReport } from "@/lib/dashboard/types";
import { Notice, primaryClass, secondaryClass } from "./shared";
import { DeleteReportButton } from "./delete-report-button";
import { MaterialFilesInput } from "./material-file-input";

export function SubmissionReports({ submissionId, reports }: { submissionId: string; reports: SubmissionReport[] }) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const [progress, setProgress] = useState("");
  const uploading = useRef(false);
  const pendingUpload = useRef<{ file: File; path: string; userId: string } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [addedReports, setAddedReports] = useState<SubmissionReport[]>([]);
  const [removedReports, setRemovedReports] = useState<string[]>([]);
  const visibleReports = [...new Map([...reports, ...addedReports].map(report => [report.id, report])).values()].filter(report => !removedReports.includes(report.id));
  return <section className="my-7 min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-[#0B2545]"><FileText className="size-5 text-blue-600" />Graded reports</h2><p className="mb-5 text-sm text-slate-500">Select one or more marked papers or feedback documents. You can remove each file separately. Students can download attached reports after you publish their grade. PDF or Word (.docx, .doc), up to 20 MB each.</p>
    <div className="mb-5 space-y-2">{visibleReports.map(report => <div key={report.id} className="flex min-w-0 flex-wrap items-center gap-2"><a className={`${secondaryClass} min-w-0 max-w-full [overflow-wrap:anywhere]`} href={`/api/reports/${report.id}`}>{report.file_name}</a><DeleteReportButton disabled={busy} submissionId={submissionId} reportId={report.id} name={report.file_name} onDeleted={() => setRemovedReports(current => [...current, report.id])} /></div>)}</div>
    <form onSubmit={async event => {
      event.preventDefault(); if (!files.length || uploading.current) return;
      uploading.current = true; setBusy(true); setError(""); setSavedCount(0);
      const batch = [...files];
      let rejected = false, completed = 0;
      let currentFile: File | null = null;
      try {
        // Validate the whole selection before creating any objects in Storage.
        const formats = batch.map(file => {
          currentFile = file;
          if (!file.size || file.size > MAX_REPORT_BYTES) throw new Error("Reports must be between 1 byte and 20 MB.");
          return reportMime(file.name);
        });
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("Your session could not be verified. Please sign in again.");
        for (const [index, file] of batch.entries()) {
          currentFile = file; rejected = false;
          setProgress(`Uploading report ${index + 1} of ${batch.length}…`);
          if (pendingUpload.current && (pendingUpload.current.file !== file || pendingUpload.current.userId !== user.id)) throw new Error("Retry the incomplete upload using its original staff session before adding another report.");
          if (!pendingUpload.current) {
            const path = `${user.id}/${submissionId}/${crypto.randomUUID()}.${file.name.split(".").at(-1)?.toLowerCase()}`;
            const { error: uploadError } = await supabase.storage.from(REPORT_BUCKET).upload(path, file, { contentType: formats[index], upsert: false });
            if (uploadError) throw new Error(`Report upload failed: ${uploadError.message}${/bucket|mime|row.level|permission/i.test(uploadError.message) ? " Ask an administrator to check the report bucket and apply the latest report-upload migration." : ""}`);
            pendingUpload.current = { file, path, userId: user.id };
            setPendingFile(file);
          }
          const path = pendingUpload.current.path;
          const response = await fetch(`/api/dashboard/submissions/${submissionId}/reports`, {
            method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storage_path: path, file_name: file.name }), signal: AbortSignal.timeout(60_000),
          });
          const result = await response.json().catch(() => null) as { id?: string; error?: string } | null;
          if (!response.ok) { rejected = response.status >= 400 && response.status < 500; throw new Error(result?.error || "Unable to link the uploaded report. Please retry."); }
          if (!result?.id || typeof result.id !== "string") throw new Error("The report attachment was not confirmed. Please retry.");
          const report: SubmissionReport = { id: result.id, submission_id: submissionId, file_name: file.name, mime_type: formats[index],
            byte_size: file.size, storage_path: path, uploaded_by: user.id, created_at: new Date().toISOString() };
          setAddedReports(current => [...current.filter(item => item.id !== report.id), report]);
          pendingUpload.current = null; setPendingFile(null);
          setFiles(current => current.filter(item => item !== file));
          completed++; setSavedCount(completed);
        }
        toast.success(completed === 1 ? "Report attached successfully" : `${completed} reports attached successfully`, { description: "The student can download them once you publish the evaluation." });
      } catch (error) {
        // Preserve uncertain attachments for an idempotent retry. Previously
        // confirmed reports stay attached and are removed from the retry queue.
        if (rejected && pendingUpload.current) {
          try {
            const { error: cleanupError } = await createClient().storage.from(REPORT_BUCKET).remove([pendingUpload.current.path]);
            if (!cleanupError) { pendingUpload.current = null; setPendingFile(null); }
            else toast.warning("Incomplete upload retained for retry", { description: cleanupError.message });
          } catch { toast.warning("Incomplete upload retained for retry"); }
        }
        const detail = error instanceof Error ? error.message : "Unable to attach this report.";
        const message = `${completed ? `${completed} of ${batch.length} reports attached. ` : ""}${currentFile ? `${currentFile.name}: ` : ""}${detail}`;
        setError(message); toast.error("Report upload failed", { description: message });
      } finally { uploading.current = false; setBusy(false); setProgress(""); }
    }} className="space-y-3">
      <MaterialFilesInput label="Graded report document" accept={REPORT_ACCEPT} disabled={busy} files={files} lockedFiles={pendingFile ? [pendingFile] : []} onChange={next => { setFiles(next); setSavedCount(0); setError(""); }} />
      {pendingFile && !busy && <p role="status" className="text-sm text-amber-800">An uploaded file is awaiting confirmation. Retry the upload before removing that selected file.</p>}
      <button disabled={busy || !files.length} className={primaryClass}><Upload className="size-4" />{busy ? progress || "Preparing reports…" : "Upload reports"}</button>
    </form>
    {error && <div className="mt-4"><Notice error message={error} /></div>}{savedCount > 0 && <div className="mt-4"><Notice message={`${savedCount === 1 ? "Report attached." : `${savedCount} reports attached.`} Attached reports are released to the student when you publish the evaluation.`} /></div>}
  </section>;
}

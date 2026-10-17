"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MAX_REPORT_BYTES, REPORT_ACCEPT, REPORT_BUCKET, reportMime } from "@/lib/report-files";
import type { SubmissionReport } from "@/lib/dashboard/types";
import { inputClass, Notice, primaryClass, secondaryClass } from "./shared";

export function SubmissionReports({ submissionId, reports }: { submissionId: string; reports: SubmissionReport[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pendingUpload = useRef<{ file: File; path: string; userId: string } | null>(null);
  const [addedReports, setAddedReports] = useState<SubmissionReport[]>([]);
  const visibleReports = [...new Map([...reports, ...addedReports].map(report => [report.id, report])).values()];
  return <section className="my-7 rounded-xl border border-slate-200 bg-white p-6"><h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-[#0B2545]"><FileText className="size-5 text-blue-600" />Graded reports</h2><p className="mb-5 text-sm text-slate-500">Attach marked papers or feedback documents. Students can download them after you publish their grade. PDF or Word (.docx, .doc), up to 20 MB each.</p>
    <div className="mb-5 flex flex-wrap gap-2">{visibleReports.map(report => <a className={secondaryClass} key={report.id} href={`/api/reports/${report.id}`}>{report.file_name}</a>)}</div>
    <form onSubmit={async event => {
      event.preventDefault(); if (!file || busy) return;
      setBusy(true); setError(""); setSaved(false);
      let rejected = false;
      try {
        const mime = reportMime(file.name);
        if (!file.size || file.size > MAX_REPORT_BYTES) throw new Error("Reports must be between 1 byte and 20 MB.");
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("Your session could not be verified. Please sign in again.");
        if (pendingUpload.current && (pendingUpload.current.file !== file || pendingUpload.current.userId !== user.id)) {
          const { error: cleanupError } = await supabase.storage.from(REPORT_BUCKET).remove([pendingUpload.current.path]);
          if (cleanupError) throw new Error("Unable to clear the previous incomplete upload. Reconnect and retry.");
          pendingUpload.current = null;
        }
        if (!pendingUpload.current) {
          const path = `${user.id}/${submissionId}/${crypto.randomUUID()}.${file.name.split(".").at(-1)?.toLowerCase()}`;
          const { error: uploadError } = await supabase.storage.from(REPORT_BUCKET).upload(path, file, { contentType: mime, upsert: false });
          if (uploadError) throw new Error(`Report upload failed: ${uploadError.message}${/bucket|mime|row.level|permission/i.test(uploadError.message) ? " Ask an administrator to check the report bucket and apply the latest report-upload migration." : ""}`);
          pendingUpload.current = { file, path, userId: user.id };
        }
        const path = pendingUpload.current.path;
        const response = await fetch(`/api/dashboard/submissions/${submissionId}/reports`, {
          method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storage_path: path, file_name: file.name }), signal: AbortSignal.timeout(60_000),
        });
        const result = await response.json().catch(() => null) as { id?: string; error?: string } | null;
        if (!response.ok) { rejected = response.status >= 400 && response.status < 500; throw new Error(result?.error || "Unable to link the uploaded report. Please retry."); }
        if (!result?.id || typeof result.id !== "string") throw new Error("The report attachment was not confirmed. Please retry.");
        const report: SubmissionReport = { id: result.id, submission_id: submissionId, file_name: file.name, mime_type: mime,
          byte_size: file.size, storage_path: path, uploaded_by: user.id, created_at: new Date().toISOString() };
        setAddedReports(current => [...current.filter(item => item.id !== report.id), report]);
        pendingUpload.current = null;
        setSaved(true); setFile(null); if (input.current) input.current.value = "";
        toast.success("Report attached successfully", { description: "The student can download it once you publish the evaluation." });
      } catch (error) {
        // An uncertain network response may have committed the attachment. Keep
        // its path and retry the idempotent attachment RPC, not another upload.
        if (rejected && pendingUpload.current) {
          try {
            const { error: cleanupError } = await createClient().storage.from(REPORT_BUCKET).remove([pendingUpload.current.path]);
            if (!cleanupError) pendingUpload.current = null;
            else toast.warning("Incomplete upload retained for retry", { description: cleanupError.message });
          } catch { toast.warning("Incomplete upload retained for retry"); }
        }
        const message = error instanceof Error ? error.message : "Unable to attach this report.";
        setError(message);
        toast.error("Report upload failed", { description: message });
      } finally { setBusy(false); }
    }} className="flex flex-wrap items-center gap-3"><input ref={input} aria-label="Graded report document" disabled={busy} type="file" accept={REPORT_ACCEPT} className={`${inputClass} max-w-lg`} onChange={event => { setFile(event.target.files?.[0] ?? null); setSaved(false); setError(""); }} /><button disabled={busy || !file} className={primaryClass}><Upload className="size-4" />{busy ? "Uploading report…" : "Upload report"}</button></form>
    {error && <div className="mt-4"><Notice error message={error} /></div>}{saved && <div className="mt-4"><Notice message="Report attached. It is released to the student when you publish the evaluation." /></div>}
  </section>;
}

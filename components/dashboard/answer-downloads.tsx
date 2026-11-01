"use client";

import { useRef, useState } from "react";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import type { AnswerExportInput } from "@/lib/answer-export-model";
import { secondaryClass } from "./shared";

export function AnswerDownloads({ submissionId }: { submissionId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function downloadPdf() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/submissions/${submissionId}/answers?format=data`, { credentials: "same-origin", cache: "no-store" });
      const body: unknown = await response.json().catch(() => null);
      const result = body && typeof body === "object" ? body as { error?: unknown; input?: Partial<AnswerExportInput>; filename?: unknown } : null;
      if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "Unable to load your submitted answers. Please try again.");
      if (!result?.input || !Array.isArray(result.input.questions) || !result.input.answers || typeof result.input.answers !== "object" || Array.isArray(result.input.answers)
        || Object.values(result.input.answers).some(answer => typeof answer !== "string") || typeof result.input.examName !== "string" || typeof result.input.candidate !== "string"
        || typeof result.input.level !== "string" || typeof result.input.submittedAt !== "string" || typeof result.filename !== "string") throw new Error("The server did not return the answer sheet. Please sign in again and retry.");
      // Lazy loading keeps PDF layout and fonts out of dashboard rendering and
      // does the expensive work on the user's device rather than the Worker.
      const { buildAnswerPdfBytes } = await import("@/lib/answer-pdf-bytes");
      const bytes = await buildAnswerPdfBytes(result.input as AnswerExportInput);
      if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("Unable to generate the PDF. Please try again.");
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" }));
      const link = document.createElement("a"); link.href = url; link.download = result.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      document.body.appendChild(link);
      try { link.click(); } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
      toast.success("PDF download started.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to generate the PDF. Please try again.";
      setError(message); toast.error("PDF download failed", { description: message });
    } finally { pending.current = false; setBusy(false); }
  }
  return <div aria-label="Download answer sheet" className="flex flex-wrap items-center gap-2">
    <a className={secondaryClass} href={`/api/submissions/${submissionId}/answers?format=docx`}><FileDown className="size-4" />Download as Word (.docx)</a>
    <a className={secondaryClass} aria-busy={busy} aria-disabled={busy} href={`/api/submissions/${submissionId}/answers?format=pdf`} onClick={event => { event.preventDefault(); void downloadPdf(); }}><FileDown className="size-4" />{busy ? "Preparing PDF…" : "Download as PDF (.pdf)"}</a>
    {error && <p role="alert" className="w-full text-sm text-red-700">{error}</p>}
  </div>;
}

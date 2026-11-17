"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Notice, primaryClass } from "./shared";

export function ExportSubmissionsButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const searchParams = useSearchParams();

  return <div className="min-w-0">
    <button type="button" disabled={busy} className={`${primaryClass} w-full sm:w-auto`} onClick={async () => {
      if (inFlight.current) return;
      inFlight.current = true; setBusy(true); setError("");
      try {
        const query = searchParams ? searchParams.toString() : "";
        const endpoint = query ? `/api/dashboard/submissions/export?${query}` : "/api/dashboard/submissions/export";
        const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) {
          const result = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(result?.error || "Unable to export submissions. Please try again.");
        }
        if (response.headers.get("Content-Type")?.split(";")[0] !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
          throw new Error("The server did not return an Excel file. Please sign in again and retry.");
        }
        const blob = await response.blob();
        if (!blob.size) throw new Error("The export file is empty. Please try again.");
        const candidate = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1];
        const filename = candidate && /^[a-z0-9_.-]+\.xlsx$/i.test(candidate) ? candidate : "keystone-submissions.xlsx";
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        try {
          link.href = url; link.download = filename; document.body.appendChild(link); link.click();
        } finally {
          link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        toast.success("Excel download started.");
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "Unable to export submissions. Please try again.";
        setError(message); toast.error(message);
      } finally { inFlight.current = false; setBusy(false); }
    }}><Download className="size-4" />{busy ? "Preparing Excel…" : "Export to Excel"}</button>
    {error && <div className="mt-2 max-w-md"><Notice error message={error} /></div>}
  </div>;
}

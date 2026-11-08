"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MailPlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EXAM_LEVELS, LEVEL_NAMES } from "@/lib/exam-levels";
import { inputClass, Notice, primaryClass, secondaryClass } from "./shared";

export function InviteStudent({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter(), pending = useRef(false);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [message, setMessage] = useState(""), [job, setJob] = useState<string | null>(null);
  return <>
    <button type="button" disabled={disabled} className={secondaryClass} onClick={() => { setError(""); setMessage(""); setJob(null); setOpen(true); }}><MailPlus className="size-4" />Invite enrolled student</button>
    <Dialog open={open} onOpenChange={next => { if (!pending.current) setOpen(next); }}><DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white"><DialogHeader><DialogTitle>Invite an enrolled student</DialogTitle><DialogDescription>The student receives a secure email to choose their own password. For an existing enrolled email, this resends a password link without changing their level or history.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={async event => {
        event.preventDefault(); if (pending.current) return;
        const data = new FormData(event.currentTarget);
        pending.current = true; setBusy(true); setError(""); setMessage(""); setJob(null);
        try {
          const response = await fetch("/api/dashboard/invitations", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30_000), body: JSON.stringify({ full_name: String(data.get("full_name")), email: String(data.get("email")), assigned_level: String(data.get("assigned_level")) }) });
          const result = await response.json().catch(() => null) as { queued?: unknown; job_id?: unknown; message?: unknown; error?: unknown } | null;
          if (!response.ok || result?.queued !== true || typeof result.job_id !== "string") throw new Error(typeof result?.error === "string" ? result.error : "Invitation was not confirmed. Retry with the same email; an existing account will be reused.");
          setMessage(typeof result.message === "string" ? result.message : "Invitation queued. Email delivery is pending."); setJob(result.job_id); router.refresh();
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Invitation could not be confirmed. Retry with the same email."); }
        finally { pending.current = false; setBusy(false); }
      }}><fieldset disabled={busy} className="space-y-4"><label className="block text-sm font-medium">Full name<input name="full_name" required maxLength={150} className={`${inputClass} mt-2`} /></label><label className="block text-sm font-medium">Email address<input name="email" type="email" required maxLength={254} className={`${inputClass} mt-2`} /></label><label className="block text-sm font-medium">Case-study level<select name="assigned_level" aria-label="Case-study level" className={`${inputClass} mt-2`}>{EXAM_LEVELS.map(level => <option key={level} value={level}>{level} — {LEVEL_NAMES[level]}</option>)}</select></label></fieldset>
        {error && <Notice error message={error} />}{message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
        <button disabled={busy} className={`${primaryClass} w-full`}>{busy ? "Queuing invitation…" : "Send password invitation"}</button>
      </form>
      {job && <button type="button" disabled={busy} className={secondaryClass} onClick={async () => {
        setBusy(true); setError("");
        try {
          const response = await fetch(`/api/dashboard/invitations?job=${encodeURIComponent(job)}`, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(15_000) });
          const data = await response.json() as { state?: string; error?: string };
          if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Delivery status unavailable.");
          const status: Record<string, string> = { pending: "Invitation is queued for delivery.", sending: "Invitation delivery is in progress.", sent: "Brevo accepted the invitation. Ask the student to check their inbox and spam folder.", failed: "Invitation delivery failed. Ask an administrator to check Brevo configuration, then resend.", cancelled: "Invitation was cancelled because the account or email changed. Check People & Access.", needs_review: "Delivery could not be confirmed. Check Brevo logs before resending to avoid duplicates." };
          setMessage(status[data.state ?? ""] ?? "Delivery status could not be confirmed.");
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Delivery status unavailable."); }
        finally { setBusy(false); }
      }}>Check invitation delivery</button>}
    </DialogContent></Dialog>
  </>;
}

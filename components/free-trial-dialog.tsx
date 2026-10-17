"use client";

import { FormEvent, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";

export function FreeTrialDialog() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/free-trial", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: form.get("full_name"), email: form.get("email"), phone: form.get("phone"), target_level: form.get("target_level") }),
    });
    const data = await response.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    if (!response.ok) { setError(data.error || "Unable to send your request."); return; }
    setSent(true);
  }

  return <>
    <button type="button" onClick={() => { setOpen(true); setError(""); }} className="inline-flex h-10 w-full items-center justify-center gap-2 border border-[#7c4d00] bg-amber-400 text-[13px] font-bold text-slate-900 hover:bg-amber-300">
      <Sparkles className="size-4" />Get 1 Free Trial
    </button>
    {open && <div role="dialog" aria-modal="true" aria-labelledby="free-trial-title" className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/50 p-4">
      <section className="w-full max-w-md border border-slate-300 bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-[#0B2545] px-5 py-4 text-white"><div><h2 id="free-trial-title" className="font-bold">Claim your free trial</h2><p className="mt-0.5 text-xs text-blue-100">Tell us which CIMA case-study level you are preparing for.</p></div><button type="button" aria-label="Close free trial form" onClick={() => setOpen(false)} className="p-1 hover:bg-white/15"><X className="size-5" /></button></header>
        {sent ? <div className="p-6"><h3 className="font-semibold text-[#0B2545]">Request received</h3><p className="mt-2 text-sm leading-6 text-slate-600">Thank you. Keystone Academia will contact you with your free trial access.</p><button type="button" onClick={() => setOpen(false)} className="mt-5 w-full border border-[#0B2545] bg-[#0B2545] px-4 py-2.5 text-sm font-semibold text-white">Close</button></div> : <form onSubmit={submit} className="space-y-4 p-5">
          <label className="block text-sm font-semibold text-slate-700">Full Name<input required name="full_name" maxLength={150} className="mt-1.5 h-10 w-full border border-slate-300 px-3 font-normal outline-none focus:border-[#0067A3] focus:ring-1 focus:ring-[#0067A3]" /></label>
          <label className="block text-sm font-semibold text-slate-700">Email Address<input required name="email" type="email" maxLength={254} className="mt-1.5 h-10 w-full border border-slate-300 px-3 font-normal outline-none focus:border-[#0067A3] focus:ring-1 focus:ring-[#0067A3]" /></label>
          <label className="block text-sm font-semibold text-slate-700">Phone / WhatsApp Number<input required name="phone" type="tel" maxLength={50} className="mt-1.5 h-10 w-full border border-slate-300 px-3 font-normal outline-none focus:border-[#0067A3] focus:ring-1 focus:ring-[#0067A3]" /></label>
          <label className="block text-sm font-semibold text-slate-700">Target Level<select required name="target_level" defaultValue="" className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 font-normal outline-none focus:border-[#0067A3] focus:ring-1 focus:ring-[#0067A3]"><option value="" disabled>Select level</option><option value="OCS">OCS — Operational</option><option value="MCS">MCS — Management</option><option value="SCS">SCS — Strategic</option></select></label>
          {error && <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
          <button disabled={busy} className="inline-flex h-10 w-full items-center justify-center gap-2 border border-[#005587] bg-[#0067A3] text-sm font-bold text-white hover:bg-[#005587] disabled:opacity-50">{busy && <Loader2 className="size-4 animate-spin" />}{busy ? "Sending…" : "Request Free Trial"}</button>
        </form>}
      </section>
    </div>}
  </>;
}

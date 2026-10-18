"use client";

import { FormEvent, useRef, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { TrialCaptcha } from "@/components/trial-captcha";

export function FreeTrialDialog({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/free-trial", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({ full_name: form.get("full_name"), email: form.get("email"), phone: form.get("phone"), target_level: form.get("target_level"), ...(captchaToken ? { captcha_token: captchaToken } : {}) }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; redirect?: string };
      if (!response.ok || data.redirect !== "/dashboard") throw new Error(data.error || "Unable to start your trial. Please try again.");
      // A fresh document loads the cookie established by the server. Do not rely
      // on a pre-existing browser Auth singleton or a prefetched dashboard.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- reset the browser Auth singleton after server-issued guest cookies
      window.location.assign("/dashboard");
    } catch (err) {
      setError(err instanceof Error && err.name !== "TimeoutError" ? err.message : "Connection interrupted. Please try again; duplicate requests reuse your trial.");
      setCaptchaToken(""); setCaptchaKey(key => key + 1);
      setBusy(false); submitting.current = false;
    }
  }

  return <>
    <button type="button" onClick={() => { setOpen(true); setError(""); }} className="inline-flex h-10 w-full items-center justify-center gap-2 border border-[#7c4d00] bg-amber-400 text-[13px] font-bold text-slate-900 hover:bg-amber-300">
      <Sparkles className="size-4" />Get 1 Free Trial
    </button>
    {open && <div role="dialog" aria-modal="true" aria-labelledby="free-trial-title" className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/50 p-4">
      <section className="max-h-[90dvh] w-full max-w-md overflow-y-auto border border-slate-300 bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-[#0B2545] px-5 py-4 text-white"><div><h2 id="free-trial-title" className="font-bold">Claim your free trial</h2><p className="mt-0.5 text-xs text-blue-100">Tell us which CIMA case-study level you are preparing for.</p></div><button type="button" disabled={busy} aria-label="Close free trial form" onClick={() => setOpen(false)} className="p-1 hover:bg-white/15"><X className="size-5" /></button></header>
        <form onSubmit={submit} className="space-y-4 p-5"><fieldset disabled={busy} className="space-y-4">
          <label className="block text-sm font-semibold text-slate-700">Full Name<input required name="full_name" maxLength={150} className="mt-1.5 h-10 w-full border border-slate-300 px-3 font-normal outline-none focus:border-[#0067A3] focus:ring-1 focus:ring-[#0067A3]" /></label>
          <label className="block text-sm font-semibold text-slate-700">Email Address<input required name="email" type="email" maxLength={254} className="mt-1.5 h-10 w-full border border-slate-300 px-3 font-normal outline-none focus:border-[#0067A3] focus:ring-1 focus:ring-[#0067A3]" /></label>
          <label className="block text-sm font-semibold text-slate-700">Phone / WhatsApp Number<input required name="phone" type="tel" maxLength={50} className="mt-1.5 h-10 w-full border border-slate-300 px-3 font-normal outline-none focus:border-[#0067A3] focus:ring-1 focus:ring-[#0067A3]" /></label>
          <label className="block text-sm font-semibold text-slate-700">Target Level<select required name="target_level" defaultValue="" className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 font-normal outline-none focus:border-[#0067A3] focus:ring-1 focus:ring-[#0067A3]"><option value="" disabled>Select level</option><option value="OCS">OCS — Operational</option><option value="MCS">MCS — Management</option><option value="SCS">SCS — Strategic</option></select></label>
          <p className="text-xs leading-5 text-slate-500">Your dashboard opens immediately. Try Mock 1 free; remaining mocks require enrolment. Keep your browser data to resume your trial.</p>
          <TrialCaptcha key={captchaKey} onToken={setCaptchaToken} />
          {error && <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
          <button disabled={busy || Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !captchaToken)} className="inline-flex h-10 w-full items-center justify-center gap-2 border border-[#005587] bg-[#0067A3] text-sm font-bold text-white hover:bg-[#005587] disabled:opacity-50">{busy && <Loader2 className="size-4 animate-spin" />}{busy ? "Opening your dashboard…" : "Start Free Trial"}</button>
        </fieldset></form>
      </section>
    </div>}
  </>;
}

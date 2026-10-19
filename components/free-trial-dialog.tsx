"use client";

import { FormEvent, useId, useRef, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { TrialCaptcha } from "@/components/trial-captcha";
import { type CountryCode } from "@/lib/countries";
import { PhoneCodeSelect } from "@/components/phone-code-select";
import { normalizeTrialContact } from "@/lib/trial-contact";

const fieldClass = "free-mock-input mt-1.5 h-11 rounded-lg border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-none transition focus:border-[#133E68] focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50";
const labelClass = "block text-[13px] font-semibold text-slate-700";

export function FreeTrialDialog({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);
  const [phoneCountry, setPhoneCountry] = useState<CountryCode | "">("");
  const id = useId();
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const contact = normalizeTrialContact(undefined, phoneCountry, form.get("phone"));
      const response = await fetch("/api/free-trial", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({ full_name: form.get("full_name"), email: form.get("email"), phone: contact.phone, phone_country: contact.phone_country, target_level: form.get("target_level"), ...(captchaToken ? { captcha_token: captchaToken } : {}) }),
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
    <button type="button" onClick={() => { setOpen(true); setError(""); }} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-amber-500 bg-amber-400 text-[13px] font-bold text-[#0B2545] shadow-sm transition hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B2545] active:translate-y-px">
      <Sparkles className="size-4" />Access Free Mock
    </button>
    {open && <div role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} className="free-mock-overlay fixed inset-0 z-[100] grid place-items-center bg-[#07182c]/65 backdrop-blur-[3px]">
      <section className="free-mock-panel rounded-2xl border border-white/20 bg-white text-left shadow-[0_24px_80px_rgba(0,0,0,.3)]">
        <header className="relative border-t-[3px] border-amber-400 bg-[#0B2545] px-6 py-5 pr-14 text-white"><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300"><Sparkles className="size-3.5" />Keystone Academia</div><h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">Claim your free trial</h2><p id={`${id}-description`} className="mt-1.5 text-[13px] leading-5 text-blue-100">Tell us which CIMA case-study level you are preparing for.</p><button type="button" disabled={busy} aria-label="Close free trial form" onClick={() => setOpen(false)} className="absolute right-4 top-4 rounded-md p-1.5 text-blue-100 transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40"><X className="size-5" /></button></header>
        <form onSubmit={submit} className="free-mock-form"><fieldset disabled={busy} className="free-mock-fields">
          <div className="free-mock-name-email">
          <label className={labelClass}>Full Name<input required name="full_name" autoComplete="name" maxLength={150} placeholder="Enter your full name" className={fieldClass} /></label>
          <label className={labelClass}>Email Address<input required name="email" type="email" autoComplete="email" maxLength={254} placeholder="you@example.com" className={fieldClass} /></label>
          </div>
          <div><label htmlFor={`${id}-phone`} className={labelClass}>Phone / WhatsApp Number</label><div className="free-mock-phone-row"><PhoneCodeSelect value={phoneCountry} onChange={setPhoneCountry} disabled={busy} /><input type="hidden" name="phone_country" value={phoneCountry} /><input id={`${id}-phone`} required name="phone" type="tel" autoComplete="tel-national" maxLength={50} placeholder="Your phone number" className={fieldClass} /></div></div>
          <label className={labelClass}>Case Study<select required name="target_level" defaultValue="" className={fieldClass}><option value="" disabled>Select your case study</option><option value="OCS">Operational</option><option value="MCS">Management</option><option value="SCS">Strategic</option></select></label>
          <TrialCaptcha key={captchaKey} onToken={setCaptchaToken} />
          {error && <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
          <button disabled={busy || Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !captchaToken)} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-amber-500 bg-amber-400 text-sm font-bold text-[#0B2545] shadow-sm transition hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B2545] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50">{busy && <Loader2 className="size-4 animate-spin" />}{busy ? "Opening your dashboard…" : "Access Free Mock"}</button>
          <p className="text-center text-xs leading-5 text-slate-500">Your dashboard opens immediately. Try Mock 1 free; remaining mocks require enrolment.</p>
          <p className="text-center text-[11px] leading-4 text-slate-400">Keep your browser data to resume your trial.</p>
        </fieldset></form>
      </section>
    </div>}
  </>;
}

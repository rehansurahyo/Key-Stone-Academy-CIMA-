"use client";
import Link from "next/link";
import { useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { inputClass, primaryClass, Notice } from "@/components/dashboard/shared";

async function responseError(response: Response, fallback: string) {
  const data: unknown = await response.json().catch(() => null);
  return data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : fallback;
}

export default function StaffLogin() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <main className="flex h-dvh items-center justify-center overflow-y-auto bg-[#0B2545] p-6"><div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl"><div className="mb-7 flex items-center gap-3"><div className="rounded-xl bg-cyan-50 p-3 text-cyan-700"><ShieldCheck className="size-6" /></div><div><p className="text-lg font-bold text-[#0B2545]">Keystone Academia</p><p className="text-sm text-slate-500">Admin & Tutor Portal</p></div></div><h1 className="text-2xl font-semibold text-[#0B2545]">Sign in to your workspace</h1><p className="mt-2 text-sm text-slate-500">Use your administrator or tutor account.</p><form className="mt-7 space-y-5" onSubmit={async event => {
    event.preventDefault(); setError(""); setBusy(true);
    let navigating = false;
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/auth/staff", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email")), password: String(form.get("password")) }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(await responseError(response, "Unable to sign in."));

      // Read identity from the shared authoritative session endpoint, rather
      // than relying on the older staff-login acknowledgement response shape.
      const session = await fetch("/api/auth/session", {
        credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20_000),
      });
      if (!session.ok) {
        if (session.status === 401) throw new Error("Your sign-in succeeded, but the session cookie was not saved. Allow cookies for this site and try again.");
        throw new Error(await responseError(session, "Unable to verify your sign-in. Please try again."));
      }
      const identity: unknown = await session.json();
      if (!identity || typeof identity !== "object" || !("role" in identity) || !["admin", "tutor"].includes(String(identity.role))) {
        throw new Error("Unable to verify your staff role. Please sign in again.");
      }
      // Avoid reusing an anonymous prefetched RSC redirect or racing a refresh
      // of the login route with navigation to the protected layout.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Auth cookie handoff requires an uncached document navigation.
      window.location.assign("/dashboard");
      navigating = true;
    } catch (err) {
      setError(err instanceof Error && err.name !== "TimeoutError" ? err.message : "Sign-in timed out. Check your connection and try again.");
    }
    finally { if (!navigating) setBusy(false); }
  }}><label className="block text-sm font-medium text-slate-700">Email address<input name="email" type="email" required autoComplete="username" className={`${inputClass} mt-2`} /></label><label className="block text-sm font-medium text-slate-700"><div className="flex items-center justify-between"><span>Password</span><Link href="/forgot-password" className="text-xs font-normal text-cyan-700 hover:underline">Forgot password?</Link></div><input name="password" type="password" required autoComplete="current-password" className={`${inputClass} mt-2`} /></label>{error && <Notice error message={error} />}<button disabled={busy} className={`${primaryClass} w-full`}><LockKeyhole className="size-4" />{busy ? "Signing in…" : "Sign in"}</button></form><Link href="/" className="mt-6 block text-center text-sm text-slate-500 hover:text-cyan-700">Go to student exam portal</Link></div></main>;
}

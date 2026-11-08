"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { invitationPasswordSetter, invitationProof, isolatedInvitationClient } from "@/lib/enrolled-password";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

export function EnrolledPasswordForm() {
  const [ready, setReady] = useState(false), [invalid, setInvalid] = useState("");
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [success, setSuccess] = useState(false);
  const setter = useRef<ReturnType<typeof invitationPasswordSetter> | null>(null), pending = useRef(false), initialized = useRef(false);
  useEffect(() => {
    let cancelled = false;
    // A second invitation opened in this same tab must not reuse the first
    // student's in-memory proof or already-completed password form.
    const changedLink = () => { window.location.reload(); };
    window.addEventListener("hashchange", changedLink);
    void Promise.resolve().then(() => {
      if (cancelled || initialized.current) return;
      initialized.current = true;
      try {
        const proof = invitationProof(window.location.hash);
        window.history.replaceState(null, "", "/set-password");
        setter.current = invitationPasswordSetter(isolatedInvitationClient(), proof);
      } catch (reason) { setInvalid(reason instanceof Error ? reason.message : "Invalid invitation."); }
      setReady(true);
    });
    return () => { cancelled = true; window.removeEventListener("hashchange", changedLink); };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current || !setter.current) return;
    setError("");
    if (password !== confirmation) { setError("Passwords do not match."); return; }
    pending.current = true; setBusy(true);
    try { await setter.current(password); setPassword(""); setConfirmation(""); setSuccess(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to set password. Please retry."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <main className="grid min-h-dvh place-items-center bg-slate-100 px-4 py-8"><section className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <header className="border-t-4 border-amber-400 bg-[#0B2545] p-6 text-white"><p className="text-xs font-semibold tracking-widest text-amber-300">KEYSTONE ACADEMIA</p><h1 className="mt-2 text-xl font-semibold">Set your student password</h1></header>
    <div className="p-6">
      {!ready ? <p>Preparing your invitation…</p> : invalid ? <div><p role="alert" className="text-sm text-red-700">{invalid}</p><p className="mt-4 text-sm text-slate-600">Please contact the Keystone team for a fresh invitation. Existing students can also request a password reset from the sign-in page.</p></div>
        : success ? <div><p role="status" className="text-emerald-800">Your password is ready. Sign in with your enrolled email address and new password.</p><Link href="/student/login" prefetch={false} className="mt-5 inline-flex rounded-lg bg-[#0B2545] px-4 py-3 font-semibold text-white">Sign in to student portal</Link></div>
          : <form onSubmit={submit} className="space-y-4"><p className="text-sm text-slate-600">Choose your own password to access your enrolled mock exams. Your invitation is verified when you submit this form.</p>
            <label className="block text-sm font-medium">New password<input type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} disabled={busy} value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full min-w-0 rounded-lg border px-3 py-2 text-base" /><span className="mt-1 block text-xs text-slate-500">At least {PASSWORD_MIN_LENGTH} characters.</span></label>
            <label className="block text-sm font-medium">Confirm password<input type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} disabled={busy} value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 w-full min-w-0 rounded-lg border px-3 py-2 text-base" /></label>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button disabled={busy || !password || !confirmation} className="w-full rounded-lg bg-[#0B2545] px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Setting password…" : "Set password"}</button>
          </form>}
    </div>
  </section></main>;
}

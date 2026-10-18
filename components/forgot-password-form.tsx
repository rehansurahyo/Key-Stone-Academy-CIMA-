"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || loading) return;

    if (!isSupabaseConfigured) {
      setError("Supabase is not configured. Please check your environment variables.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      // Keep recovery on the host that owns the PKCE verifier cookie.
      // This handler only runs in the browser; never fall back to another host.
      const redirectTo = window.location.origin + "/reset-password";

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo,
        },
      );

      if (resetError) {
        setError(resetError.message || "Failed to send reset email. Please try again.");
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#eef2f6] px-4 font-[Arial,'Segoe_UI',sans-serif]">
      <section className="w-full max-w-[430px] border border-[#aeb9c4] bg-white shadow-[0_8px_28px_rgba(15,38,67,.18)]">
        <header className="flex items-center gap-3 bg-[#0067A3] px-5 py-4 text-white">
          <span className="grid size-9 place-items-center border border-white/40 bg-white/10">
            <KeyRound className="size-5" />
          </span>
          <div>
            <h1 className="text-[16px] font-bold">Reset Password</h1>
            <p className="mt-0.5 text-[12px] text-blue-100">
              Keystone Academia CIMA Mock Portal
            </p>
          </div>
        </header>

        <div className="p-6">
          {success ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 border border-emerald-300 bg-emerald-50 p-4 text-[13px] text-emerald-900">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-semibold text-emerald-800">
                    Reset Link Sent!
                  </p>
                  <p className="mt-1 text-slate-700 leading-relaxed">
                    We have sent a password reset link to{" "}
                    <strong className="text-slate-900">{email}</strong>. Please
                    check your inbox and spam folder, then follow the link to
                    choose a new password. Open the latest link in the same
                    browser and device where you requested it.
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 text-center">
                <p className="text-[12px] text-slate-500">
                  Did not receive an email? Check your spam folder or try again in
                  a few minutes.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSuccess(false);
                    setEmail("");
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0067A3] hover:underline"
                >
                  <ArrowLeft className="size-3.5" /> Request another link
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-[13px] leading-5 text-slate-600">
                Enter your registered email address below. We will send you a
                secure link to reset your account password.
              </p>

              <label className="block text-[13px] font-semibold text-slate-700">
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={loading}
                  placeholder="e.g. student@keystoneacademia.com"
                  className="mt-1.5 h-10 w-full border border-[#9daab7] px-3 text-[14px] font-normal outline-none focus:border-[#0067A3] focus:ring-1 focus:ring-[#0067A3] disabled:bg-slate-100"
                  required
                />
              </label>

              {error && (
                <p
                  role="alert"
                  className="border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="inline-flex h-10 w-full items-center justify-center gap-2 border border-[#005587] bg-[#0067A3] text-[13px] font-bold text-white hover:bg-[#005587] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {loading && <Loader2 className="size-4 animate-spin" />}
                {loading ? "Sending link..." : "Send Reset Link"}
              </button>

              <div className="border-t border-slate-200 pt-4 flex flex-col items-center gap-2 text-[12px] text-slate-500">
                <Link
                  href="/student/login"
                  className="inline-flex items-center gap-1.5 font-medium text-[#0067A3] hover:underline"
                >
                  <ArrowLeft className="size-3.5" /> Back to Student Sign In
                </Link>
                <Link
                  href="/staff/login"
                  className="text-slate-500 hover:text-slate-700 hover:underline"
                >
                  Staff & Tutor Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
} from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [verifying, setVerifying] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    let isMounted = true;
    const verifyRecovery = async () => {
      if (!isSupabaseConfigured) throw new Error("Supabase environment variables are missing.");
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      if (searchParams.get("error") || hashParams.get("error")) {
        throw new Error(searchParams.get("error_description") || hashParams.get("error_description") || "The password reset link is invalid or has expired.");
      }
      // The SSR browser client exchanges the code during initialization.
      // Await it rather than consuming the one-use verifier a second time.
      const { data, error } = await createClient().auth.getSession();
      if (error) throw error;
      if (!data.session) {
        throw new Error("No active password reset session found. Please request a new link and open it in the same browser and device.");
      }
    };
    void verifyRecovery().then(() => {
      if (!isMounted) return;
      setInitError(null);
      setVerifying(false);
    }).catch(err => {
      if (!isMounted) return;
      setInitError(err instanceof Error ? err.message : "Unable to verify the password reset session.");
      setVerifying(false);
    });

    return () => {
      isMounted = false;
    };
  }, [searchParams]);

  // Handle countdown redirect on success
  useEffect(() => {
    if (!success) return;
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push("/student/login");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [success, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (password.length < 6) {
      setFormError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setFormError(updateError.message || "Unable to update password. Please try again.");
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "An unexpected error occurred. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#eef2f6] px-4 font-[Arial,'Segoe_UI',sans-serif]">
      <section className="w-full max-w-[430px] border border-[#aeb9c4] bg-white shadow-[0_8px_28px_rgba(15,38,67,.18)]">
        <header className="flex items-center gap-3 bg-[#0067A3] px-5 py-4 text-white">
          <span className="grid size-9 place-items-center border border-white/40 bg-white/10">
            <LockKeyhole className="size-5" />
          </span>
          <div>
            <h1 className="text-[16px] font-bold">Choose New Password</h1>
            <p className="mt-0.5 text-[12px] text-blue-100">Keystone Academia CIMA Mock Portal</p>
          </div>
        </header>

        <div className="p-6">
          {verifying ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-slate-600">
              <Loader2 className="size-8 animate-spin text-[#0067A3]" />
              <p className="mt-3 text-[14px] font-medium">Verifying reset authorization...</p>
              <p className="mt-1 text-[12px] text-slate-400">Please wait a moment.</p>
            </div>
          ) : initError ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 border border-red-300 bg-red-50 p-4 text-[13px] text-red-900">
                <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600" />
                <div>
                  <p className="font-semibold text-red-800">Invalid or Expired Link</p>
                  <p className="mt-1 text-slate-700 leading-relaxed">{initError}</p>
                </div>
              </div>

              <p className="text-[12px] text-slate-500">
                Security links expire after a short time or once they are clicked. You can easily
                request a new one.
              </p>

              <div className="pt-2">
                <Link
                  href="/forgot-password"
                  className="inline-flex h-10 w-full items-center justify-center gap-2 border border-[#005587] bg-[#0067A3] text-[13px] font-bold text-white hover:bg-[#005587]"
                >
                  <KeyRound className="size-4" /> Request New Reset Link
                </Link>
              </div>

              <div className="border-t border-slate-200 pt-4 text-center">
                <Link
                  href="/student/login"
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#0067A3] hover:underline"
                >
                  <ArrowLeft className="size-3.5" /> Return to Sign In
                </Link>
              </div>
            </div>
          ) : success ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 border border-emerald-300 bg-emerald-50 p-4 text-[13px] text-emerald-900">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-semibold text-emerald-800">Password Updated Successfully!</p>
                  <p className="mt-1 text-slate-700 leading-relaxed">
                    Your password has been changed. You will be automatically redirected to sign in
                    within <strong className="text-emerald-700">{countdown}s</strong>.
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Link
                  href="/student/login"
                  className="inline-flex h-10 w-full items-center justify-center gap-2 border border-[#005587] bg-[#0067A3] text-[13px] font-bold text-white hover:bg-[#005587]"
                >
                  Sign In to Student Portal
                </Link>
                <Link
                  href="/staff/login"
                  className="inline-flex h-10 w-full items-center justify-center gap-2 border border-slate-300 bg-slate-50 text-[13px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Sign In to Staff / Admin Portal
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-[13px] leading-5 text-slate-600">
                Please enter and confirm your new password below.
              </p>

              <label className="block text-[13px] font-semibold text-slate-700">
                New Password
                <div className="relative mt-1.5">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={submitting}
                    placeholder="Minimum 6 characters"
                    className="h-10 w-full border border-[#9daab7] px-3 pr-10 text-[14px] font-normal outline-none focus:border-[#0067A3] focus:ring-1 focus:ring-[#0067A3] disabled:bg-slate-100"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </label>

              <label className="block text-[13px] font-semibold text-slate-700">
                Confirm New Password
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  disabled={submitting}
                  placeholder="Re-enter your new password"
                  className="mt-1.5 h-10 w-full border border-[#9daab7] px-3 text-[14px] font-normal outline-none focus:border-[#0067A3] focus:ring-1 focus:ring-[#0067A3] disabled:bg-slate-100"
                  required
                />
              </label>

              {formError && (
                <p role="alert" className="border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !password || !confirmPassword}
                className="inline-flex h-10 w-full items-center justify-center gap-2 border border-[#005587] bg-[#0067A3] text-[13px] font-bold text-white hover:bg-[#005587] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {submitting && <Loader2 className="size-4 animate-spin" />}
                {submitting ? "Updating password..." : "Update Password"}
              </button>

              <div className="border-t border-slate-200 pt-4 text-center">
                <Link
                  href="/student/login"
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#0067A3] hover:underline"
                >
                  <ArrowLeft className="size-3.5" /> Cancel and Return to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Loader2, LockKeyhole } from "lucide-react";
import { FreeTrialDialog } from "@/components/free-trial-dialog";

type StudentSignInProps = {
  loading: boolean;
  error: string | null;
  configured: boolean;
  onSignIn: (email: string, password: string) => Promise<boolean>;
};

export function StudentSignIn({
  loading,
  error,
  configured,
  onSignIn,
}: StudentSignInProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password || loading) return;
    await onSignIn(email.trim(), password);
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#eef2f6] px-4 font-[Arial,'Segoe_UI',sans-serif]">
      <section className="w-full max-w-[430px] border border-[#aeb9c4] bg-white shadow-[0_8px_28px_rgba(15,38,67,.18)]">
        <header className="flex items-center gap-3 bg-[#0067A3] px-5 py-4 text-white">
          <span className="grid size-9 place-items-center border border-white/40 bg-white/10">
            <LockKeyhole className="size-5" />
          </span>
          <div>
            <h1 className="text-[16px] font-bold">Student Exam Sign In</h1>
            <p className="mt-0.5 text-[12px] text-blue-100">Keystone Academia CIMA Mock Portal</p>
          </div>
        </header>

        <form onSubmit={submit} className="space-y-4 p-6">
          <p className="text-[13px] leading-5 text-slate-600">
            Sign in with your registered student account. Your exam timer and answers will be restored automatically.
          </p>

          <label className="block text-[13px] font-semibold text-slate-700">
            Email address
            <input
              data-testid="student-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={loading || !configured}
              className="mt-1.5 h-10 w-full border border-[#9daab7] px-3 text-[14px] font-normal outline-none focus:border-[#0067A3] focus:ring-1 focus:ring-[#0067A3] disabled:bg-slate-100"
              required
            />
          </label>

          <label className="block text-[13px] font-semibold text-slate-700">
            <div className="flex items-center justify-between">
              <span>Password</span>
              <Link
                href="/forgot-password"
                className="text-[12px] font-medium text-[#0067A3] hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <input
              data-testid="student-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading || !configured}
              className="mt-1.5 h-10 w-full border border-[#9daab7] px-3 text-[14px] font-normal outline-none focus:border-[#0067A3] focus:ring-1 focus:ring-[#0067A3] disabled:bg-slate-100"
              required
            />
          </label>

          {!configured && (
            <p role="alert" className="border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              Supabase is not configured. Add the required values to <code>.env</code> and restart the development server.
            </p>
          )}
          {error && (
            <p role="alert" className="border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">
              {error}
            </p>
          )}

          <button
            data-testid="student-sign-in"
            type="submit"
            disabled={loading || !configured || !email.trim() || !password}
            className="inline-flex h-10 w-full items-center justify-center gap-2 border border-[#005587] bg-[#0067A3] text-[13px] font-bold text-white hover:bg-[#005587] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <div className="mx-6 mb-6 border-t border-slate-200 pt-4">
          <p className="mb-2 text-center text-[12px] text-slate-500">New to Keystone Academia?</p>
          <FreeTrialDialog />
        </div>
      </section>
    </main>
  );
}

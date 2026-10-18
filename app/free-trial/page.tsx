import Link from "next/link";
import { FreeTrialDialog } from "@/components/free-trial-dialog";

export default function FreeTrialPage() {
  return <main className="grid h-dvh place-items-center overflow-y-auto bg-slate-50 p-6">
    <section className="w-full max-w-md space-y-5 rounded-xl border border-slate-200 bg-white p-6 text-center">
      <h1 className="text-2xl font-bold text-[#0B2545]">Try a CIMA mock exam free</h1>
      <p className="text-sm text-slate-600">Choose your case-study level and try Mock 1. No password required.</p>
      <FreeTrialDialog initiallyOpen />
      <Link href="/student/login" className="block text-sm text-blue-700 underline">Already enrolled? Sign in</Link>
    </section>
  </main>;
}

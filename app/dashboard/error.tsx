"use client";
export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return <div className="rounded-xl border border-red-200 bg-white p-8"><h1 className="text-lg font-semibold text-[#0B2545]">Unable to load this workspace</h1><p className="mt-2 text-sm text-slate-600">Check your connection and ensure the Phase 3 database migration has been applied.</p><button onClick={reset} className="mt-5 rounded-lg bg-[#0B2545] px-4 py-2 text-sm font-semibold text-white">Try again</button></div>;
}

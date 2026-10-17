import type { ReactNode } from "react";

export const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100";
export const primaryClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-[#0B2545] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#133E68] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50";

export function PageHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight text-[#0B2545] sm:text-[28px]">{title}</h1><p className="mt-2 text-[13px] leading-relaxed text-slate-500">{description}</p></div>{action}</div>;
}
export function Notice({ error, message }: { error?: boolean; message: string }) {
  return <p role={error ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-cyan-200 bg-cyan-50 text-cyan-900"}`}>{message}</p>;
}
export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = { archived: "border-slate-300 bg-slate-100 text-slate-700", graded: "border-emerald-200 bg-emerald-50 text-emerald-800", submitted: "border-amber-200 bg-amber-50 text-amber-800", published: "border-blue-200 bg-blue-50 text-blue-800", draft: "border-slate-200 bg-slate-50 text-slate-600" };
  const labels: Record<string, string> = { not_started: "Not started", in_progress: "In progress", completed: "Completed", submitted: "Awaiting review" };
  const runtimeStyles: Record<string, string> = { in_progress: styles.published, completed: styles.graded, not_started: styles.draft };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${runtimeStyles[status] ?? styles[status] ?? styles.draft}`}><span aria-hidden="true" className="size-1.5 rounded-full bg-current opacity-70" />{labels[status] ?? status}</span>;
}

export async function sendJson(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({ error: "The server returned an unexpected response." })) as { error?: string; id?: string; status?: string; action?: string; revision?: number };
  if (!response.ok) throw new Error(data.error ?? "Unable to complete the request.");
  return data;
}

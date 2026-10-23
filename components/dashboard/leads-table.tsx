"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { inputClass, Notice, primaryClass, sendJson } from "./shared";
import { countryName } from "@/lib/countries";
import { ExportLeadsButton } from "./export-leads-button";
import type { TrialLead } from "@/lib/trial-leads";

export type { TrialLead } from "@/lib/trial-leads";

export function LeadsTable({ leads }: { leads: TrialLead[] }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<TrialLead | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const visible = useMemo(() => { const term = query.trim().toLowerCase(); return term ? leads.filter(lead => `${lead.full_name} ${lead.email} ${lead.phone} ${lead.phone_country || ""} ${countryName(lead.phone_country)} ${lead.country_code || ""} ${lead.target_level} ${lead.status}`.toLowerCase().includes(term)) : leads; }, [leads, query]);
  return <><div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="w-full max-w-md"><label className="relative block"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" /><span className="sr-only">Search trial requests</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, email, phone, country or case study" className={`${inputClass} pl-9`} /></label></div><ExportLeadsButton /></div>
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b bg-slate-50 text-xs text-slate-500"><tr>
          <th className="px-5 py-3">Prospect</th><th className="px-4 py-3">Phone country</th>
          <th className="px-4 py-3">Case Study</th><th className="px-4 py-3">Requested</th>
          <th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Manage</th>
        </tr></thead>
        <tbody>{visible.map(lead => <tr key={lead.id} className="border-b last:border-0">
          <td className="px-5 py-4"><p className="font-semibold text-[#0B2545]">{lead.full_name}</p>
            <p className="mt-1 text-xs text-slate-500">{lead.email}</p><p className="mt-1 text-xs text-slate-500">{lead.phone}</p>
            {lead.country_code && <p className="mt-1 text-[11px] text-slate-400">Phone code: {lead.country_code}{lead.phone_country ? ` (${countryName(lead.phone_country)})` : ""}</p>}
          </td>
          <td className="px-4 py-4 text-slate-600">{countryName(lead.phone_country)}</td>
          <td className="px-4 py-4 font-semibold text-blue-700">{lead.target_level}</td>
          <td className="px-4 py-4 text-xs text-slate-500">{new Date(lead.created_at).toLocaleString("en-GB", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" })}</td>
          <td className="px-4 py-4 capitalize text-slate-700">{lead.status}</td>
          <td className="px-5 py-4 text-right"><button type="button" onClick={() => { setEditing(lead); setError(""); }} className="text-sm font-semibold text-blue-700 hover:text-blue-900">Manage</button></td>
        </tr>)}{!visible.length && <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">No trial requests found.</td></tr>}</tbody>
      </table>
    </div>
    {editing && <div role="dialog" aria-modal="true" aria-labelledby="lead-title" className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/50 p-4"><form onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); setError(""); const form = new FormData(event.currentTarget); try { await sendJson(`/api/dashboard/leads/${editing.id}`, "PATCH", { status: form.get("status"), admin_notes: form.get("admin_notes") }); setEditing(null); router.refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update lead."); } finally { setBusy(false); } }} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl"><h2 id="lead-title" className="text-lg font-semibold text-[#0B2545]">Manage free trial request</h2><p className="mt-1 text-sm text-slate-500">{editing.full_name} · {editing.email}</p><label className="mt-5 block text-sm font-medium text-slate-700">Status<select name="status" defaultValue={editing.status} className={`${inputClass} mt-2`}><option value="new">New</option><option value="contacted">Contacted</option><option value="converted">Converted</option><option value="closed">Closed</option></select></label><label className="mt-4 block text-sm font-medium text-slate-700">Internal notes<textarea name="admin_notes" defaultValue={editing.admin_notes} rows={5} maxLength={5000} className={`${inputClass} mt-2`} placeholder="Contact outcome, follow-up date or enrolment details" /></label>{error && <div className="mt-4"><Notice error message={error} /></div>}<div className="mt-5 flex justify-end gap-3"><button type="button" disabled={busy} onClick={() => setEditing(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Cancel</button><button disabled={busy} className={primaryClass}>{busy ? "Saving…" : "Save changes"}</button></div></form></div>}
  </>;
}

import { apiError, DashboardError, requireStaff } from "@/lib/dashboard/auth";
import { buildLeadXlsx, leadExportFilename, MAX_EXPORT_CHARACTERS, MAX_EXPORT_LEADS, XLSX_MIME } from "@/lib/lead-xlsx";
import type { TrialLead } from "@/lib/trial-leads";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { supabase } = await requireStaff("admin");
    const startedAt = new Date();
    const leads: TrialLead[] = [];
    let cursor: string | null = null;
    let characters = 0;
    // Cursor pagination is independent of the UI's 1,000-row cap and also works
    // when a project sets a lower PostgREST response-row limit.
    while (true) {
      let query = supabase.from("free_trial_leads")
        .select("id,full_name,email,phone,country,phone_country,country_code,target_level,status,admin_notes,created_at")
        .lte("created_at", startedAt.toISOString()).order("id", { ascending: true }).limit(500);
      if (cursor) query = query.gt("id", cursor);
      const { data, error } = await query;
      if (error || !data) throw new DashboardError("Unable to load the leads for export. Please try again.", 503);
      if (!data.length) break;
      for (const lead of data as TrialLead[]) {
        characters += Object.values(lead).reduce<number>((sum, value) => sum + (typeof value === "string" ? value.length : 0), 0);
        leads.push(lead);
      }
      if (leads.length > MAX_EXPORT_LEADS || characters > MAX_EXPORT_CHARACTERS) {
        throw new DashboardError("This lead export is too large. Please contact support to export the full list.", 413);
      }
      const next = String(data[data.length - 1].id);
      if (cursor !== null && next <= cursor) throw new DashboardError("Unable to finish the export safely. Please retry.", 503);
      cursor = next;
    }
    leads.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
    let bytes: Uint8Array;
    try { bytes = await buildLeadXlsx(leads); }
    catch { throw new DashboardError("Unable to generate the Excel file. Please try again.", 503); }
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${leadExportFilename(startedAt)}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "X-Export-Row-Count": String(leads.length),
    } });
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}

import { requireStaffPage } from "@/lib/dashboard/auth";
import { PageHeading } from "@/components/dashboard/shared";
import { LeadsTable, type TrialLead } from "@/components/dashboard/leads-table";

export default async function LeadsPage() {
  const { supabase } = await requireStaffPage("admin");
  const { data, error } = await supabase.from("free_trial_leads").select("id,full_name,email,phone,target_level,status,admin_notes,created_at").order("created_at", { ascending: false }).limit(1000);
  if (error) throw error;
  return <><PageHeading title="Free trial leads" description="Review incoming free-trial requests and record your follow-up progress." /><LeadsTable leads={(data ?? []) as TrialLead[]} /></>;
}

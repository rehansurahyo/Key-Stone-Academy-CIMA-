export type TrialLead = {
  id: string; full_name: string; email: string; phone: string;
  country: string | null; phone_country: string | null; country_code: string | null;
  target_level: "OCS" | "MCS" | "SCS";
  status: "new" | "contacted" | "converted" | "closed";
  admin_notes: string; created_at: string;
};

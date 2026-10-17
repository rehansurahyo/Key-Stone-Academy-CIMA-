import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { DashboardError } from "@/lib/dashboard/auth";

export async function requirePortalUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new DashboardError("Please sign in to continue.", 401);
  const { data: profile, error: profileError } = await supabase.from("profiles").select("id,full_name,email,role,is_active,assigned_level").eq("id", user.id).single();
  if (profileError) throw new DashboardError("Unable to verify your account.", 503);
  if (!profile.is_active || !["student", "tutor", "admin"].includes(profile.role)) throw new DashboardError("Your account cannot access this resource.", 403);
  return { supabase, user, profile, staff: ["admin", "tutor"].includes(profile.role) };
}
export async function requireSubmission(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new DashboardError("Invalid submission ID.");
  const auth = await requirePortalUser();
  const { data, error } = await auth.supabase.from("submissions").select("id,session_id,student_id,exam_id,status,submitted_at").eq("id", id).maybeSingle();
  if (error) throw new DashboardError("Unable to load this submission.", 503);
  // Explicit ownership as well as RLS, without revealing whether another ID exists.
  if (!data || (!auth.staff && data.student_id !== auth.user.id)) throw new DashboardError("Submission not found.", 404);
  return { ...auth, submission: data };
}

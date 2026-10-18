import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, StaffRole } from "./types";
import { isPortalRole } from "@/lib/auth/roles";

export class DashboardError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function requirePortalUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new DashboardError("Please sign in to continue.", 401);
  const { data, error: profileError } = await supabase.from("profiles")
    .select("id, full_name, email, role, is_active, assigned_level, access_type, trial_exam_id, created_at")
    .eq("id", user.id).single();
  if (profileError || !data) throw new DashboardError("Unable to verify your profile. Please contact support.", 503);
  const profile = data as Profile;
  if (profile.is_active !== true || !isPortalRole(profile.role)) {
    throw new DashboardError("You do not have access to this area.", 403);
  }
  return { supabase, user, profile };
}

export async function requireStaff(role?: StaffRole) {
  const context = await requirePortalUser();
  if (!["admin", "tutor"].includes(context.profile.role) || (role && context.profile.role !== role)) {
    throw new DashboardError("You do not have access to this area.", 403);
  }
  return context;
}

export async function requirePortalPage() {
  try { return await requirePortalUser(); }
  catch (error) {
    if (error instanceof DashboardError) redirect(`/student/login?denied=${error.status}`);
    throw error;
  }
}

export async function requireStudentPage() {
  const context = await requirePortalPage();
  if (context.profile.role !== "student") redirect("/dashboard");
  return context;
}

export async function requireStaffPage(role?: StaffRole) {
  try { return await requireStaff(role); }
  catch (error) {
    if (error instanceof DashboardError && error.status === 401) redirect("/staff/login");
    if (error instanceof DashboardError && error.status === 403) redirect("/dashboard?notice=access-denied");
    throw error;
  }
}

// Cookie-authenticated mutation endpoints accept only requests from their own origin.
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new DashboardError("Invalid request origin.", 403);
  }
}

export function apiError(error: unknown) {
  const status = error instanceof DashboardError ? error.status : 500;
  const message = error instanceof DashboardError ? error.message : "Something went wrong. Please try again.";
  return Response.json({ error: message }, { status });
}

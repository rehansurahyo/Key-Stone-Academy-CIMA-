import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiError, checkOrigin, DashboardError, requireStaff } from "@/lib/dashboard/auth";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(4096),
});
const privateHeaders = { "Cache-Control": "private, no-store" };

// Sign in in a Route Handler so the HTTP response persists the SSR session
// cookies before the browser requests a protected dashboard page.
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const credentials = credentialsSchema.safeParse(await request.json().catch(() => null));
    if (!credentials.success) throw new DashboardError("Enter a valid email address and password.");

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword(credentials.data);
    if (error || !data.user || !data.session) {
      throw new DashboardError(error?.message ?? "Unable to sign in.", error?.status === 429 ? 429 : 401);
    }

    const { data: profile, error: profileError } = await supabase.from("profiles")
      .select("role, is_active").eq("id", data.user.id).single();
    if (profileError || !profile) {
      await supabase.auth.signOut();
      throw new DashboardError("Unable to verify your profile. Please check the Phase 3 database migration.", 503);
    }
    if (profile.is_active !== true || !["admin", "tutor"].includes(profile.role)) {
      await supabase.auth.signOut();
      throw new DashboardError("This workspace is available to active administrators and tutors only.", 403);
    }

    return Response.json({ authenticated: true, role: profile.role }, { headers: privateHeaders });
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", privateHeaders["Cache-Control"]);
    return response;
  }
}

// A separate request proves that the browser returned the session cookie.
// Never return tokens, credentials or service-role data to the login form.
export async function GET() {
  try {
    const { profile } = await requireStaff();
    return Response.json({ authenticated: true, role: profile.role }, { headers: privateHeaders });
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", privateHeaders["Cache-Control"]);
    return response;
  }
}

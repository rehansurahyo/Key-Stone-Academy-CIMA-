import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPortalRole } from "@/lib/auth/roles";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const host = (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    request.nextUrl.hostname
  ).toLowerCase().split(":")[0];
  const isAdmin = host.startsWith("mocksadmin.") || host.includes("mocksadmin");

  // Automatically redirect root path based on subdomain
  if (path === "/") {
    const destination = isAdmin ? "/staff/login" : "/student/login";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: cookiesToSet => {
        // Forward fresh cookies both to the Server Components in this request
        // and back to the browser. A Server Component cannot persist them alone.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  const login = path === "/student/login" || path === "/staff/login";
  if (!login) {
    const finish = (next: NextResponse) => {
      response.cookies.getAll().forEach(cookie => next.cookies.set(cookie));
      next.headers.set("Cache-Control", "private, no-store");
      return next;
    };
    const go = (destination: string) => finish(NextResponse.redirect(new URL(destination, request.url)));
    const api = path.startsWith("/api/");
    const loginDestination = isAdmin ? "/staff/login" : "/student/login";
    if (authError || !user) return api
      ? finish(NextResponse.json({ error: "Please sign in to continue." }, { status: 401 }))
      : go(loginDestination);
    const { data: profile, error: profileError } = await supabase.from("profiles").select("role,is_active").eq("id", user.id).single();
    if (profileError || !profile || profile.is_active !== true || !isPortalRole(profile.role)) return api
      ? finish(NextResponse.json({ error: "Unable to verify account access." }, { status: 403 }))
      : go(`${loginDestination}?denied=1`);
    const adminOnly = path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/admin/")
      || /^\/dashboard\/(users|leads)(\/|$)/.test(path) || /^\/api\/dashboard\/(users|leads)(\/|$)/.test(path);
    const staffOnly = (path.startsWith("/dashboard/") || path.startsWith("/api/dashboard/") || path === "/tutor" || path.startsWith("/tutor/"));
    const studentOnly = path.startsWith("/exam/") || path === "/student/dashboard";
    if ((adminOnly && profile.role !== "admin") || (staffOnly && profile.role === "student") || (studentOnly && profile.role !== "student")) return api
      ? finish(NextResponse.json({ error: "You do not have access to this area." }, { status: 403 }))
      : go("/dashboard?notice=access-denied");
    if (path === "/admin" || path.startsWith("/admin/") || path === "/tutor" || path.startsWith("/tutor/")) return go("/dashboard");
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

// Database roles are checked here and again in page/API guards.
// Static files and the sign-in POST must not be intercepted by refresh logic.
export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/student/:path*",
    "/exam/:path*",
    "/admin/:path*",
    "/tutor/:path*",
    "/api/admin/:path*",
    "/api/auth/session",
    "/api/dashboard/:path*",
  ],
};

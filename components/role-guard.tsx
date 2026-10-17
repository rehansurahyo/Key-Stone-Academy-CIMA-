"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isPortalRole, type PortalRole } from "@/lib/auth/roles";

export function RoleGuard({ role, userId, allowedRoles, children }: {
  role: PortalRole; userId: string; allowedRoles: PortalRole[]; children: React.ReactNode;
}) {
  // Initial identity has already been verified by the server page guard.
  const [verified, setVerified] = useState(true);
  const [error, setError] = useState("");
  const allowed = allowedRoles.join(",");
  useEffect(() => {
    let mounted = true;
    let generation = 0;
    let lastCheck = 0;
    let inFlight = false;
    const verify = async (force = false) => {
      if (inFlight || (!force && Date.now() - lastCheck < 60_000)) return;
      lastCheck = Date.now();
      inFlight = true;
      const current = ++generation;
      try {
        const response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15_000) });
        const session: unknown = await response.json().catch(() => null);
        const sessionRole = session && typeof session === "object" && "role" in session ? session.role : null;
        const sessionUserId = session && typeof session === "object" && "userId" in session ? session.userId : null;
        if (!mounted || current !== generation) return;
        if (response.status === 401 || response.status === 403 || (response.ok && !isPortalRole(sessionRole))) {
          setVerified(false);
          if (response.status === 401) window.location.replace("/student/login");
          else setError("Unable to verify account access. Please sign in again.");
          return;
        }
        if (!response.ok) throw new Error("Session verification is temporarily unavailable.");
        if (!isPortalRole(sessionRole) || sessionUserId !== userId || sessionRole !== role || !allowed.split(",").includes(sessionRole)) {
          setVerified(false);
          window.location.replace("/dashboard");
          return;
        }
        setError("");
        setVerified(true);
      } catch {
        if (mounted && current === generation) {
          // A network failure must not unmount unsaved forms. Each mutation
          // still verifies the current database role on the server.
          setError("Connection interrupted. Your work remains open; reconnect to verify access again.");
        }
      } finally { inFlight = false; }
    };
    void verify();
    const onFocus = () => { void verify(); };
    const onOnline = () => { void verify(true); };
    const { data } = createClient().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        generation++;
        setVerified(false);
        window.location.replace("/student/login");
      } else if (event === "SIGNED_IN" && session?.user.id !== userId) {
        generation++;
        setVerified(false);
        window.location.replace("/dashboard");
      } else if (event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
        // Same-user SIGNED_IN events on focus do not require another check.
        window.setTimeout(() => { if (mounted) void verify(event === "USER_UPDATED"); }, 0);
      }
    });
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    return () => { mounted = false; generation++; data.subscription.unsubscribe(); window.removeEventListener("focus", onFocus); window.removeEventListener("online", onOnline); };
  }, [allowed, role, userId]);
  if (!allowedRoles.includes(role) || !verified) return <main className="grid h-dvh place-items-center bg-slate-50 p-6"><p role="alert" className="text-sm text-slate-700">{error || "Your account access has changed. Redirecting…"}</p></main>;
  return <>{children}{error && <div role="status" className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 shadow-sm">{error}</div>}</>;
}

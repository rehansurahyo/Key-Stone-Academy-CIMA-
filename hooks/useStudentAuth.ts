"use client";

import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { isPortalRole, type PortalRole } from "@/lib/auth/roles";

export function useStudentAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [candidateName, setCandidateName] = useState("Student");
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<PortalRole | null>(null);

  const loadCandidateName = useCallback(async (currentUser: User | null) => {
    if (!currentUser || !isSupabaseConfigured) {
      setCandidateName("Student");
      setRole(null);
      return true;
    }
    const { data, error: profileError } = await createClient()
      .from("profiles")
      .select("full_name, email, is_active, role")
      .eq("id", currentUser.id)
      .maybeSingle();
    if (profileError || !data || !isPortalRole(data.role)) {
      setRole(null);
      setError("Unable to verify your account role. Please contact Keystone Academia.");
      return false;
    }
    if (data.is_active !== true) {
      setRole(null);
      setCandidateName("Student");
      setError("Your account is suspended. Contact Keystone Academia for access.");
      return false;
    }
    setRole(data.role);
    setCandidateName(
      data?.full_name?.trim() || data?.email || currentUser.email || "Student",
    );
    return true;
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const supabase = createClient();
    let mounted = true;
    void supabase.auth.getSession().then(async ({ data, error: authError }) => {
      if (!mounted) return;
      const currentUser = data.session?.user ?? null;
      const allowed = await loadCandidateName(currentUser);
      if (!mounted) return;
      setUser(allowed ? currentUser : null);
      if (allowed) setError(authError?.message ?? null);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const currentUser = session?.user ?? null;
      // Defer the profile query outside Supabase's auth-event callback lock.
      window.setTimeout(() => {
        void loadCandidateName(currentUser).then(allowed => {
          if (!mounted) return;
          setUser(allowed ? currentUser : null);
          setLoading(false);
        });
      }, 0);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [loadCandidateName]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      setError("Supabase environment variables are missing.");
      return false;
    }
    setLoading(true);
    setError(null);
    const { data, error: signInError } = await createClient().auth.signInWithPassword({
      email,
      password,
    });
    if (signInError || !data.user) {
      setLoading(false);
      setError(signInError?.message ?? "Unable to sign in.");
      return false;
    }
    const allowed = await loadCandidateName(data.user);
    setUser(allowed ? data.user : null);
    setLoading(false);
    if (!allowed) return false;
    return true;
  }, [loadCandidateName]);

  return {
    user,
    candidateName,
    role,
    loading,
    error,
    configured: isSupabaseConfigured,
    signIn,
  };
}

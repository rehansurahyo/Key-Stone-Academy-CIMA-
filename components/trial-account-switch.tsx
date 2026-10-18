"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function TrialAccountSwitch() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="mt-3">
    <button type="button" disabled={busy} className="text-sm font-semibold underline disabled:opacity-50" onClick={async () => {
      if (busy || !window.confirm("Leave this guest trial and sign in to an enrolled account? Guest access cannot be recovered after signing out.")) return;
      setBusy(true); setError("");
      try {
        const { error: signOutError } = await createClient().auth.signOut({ scope: "local" });
        if (signOutError) throw signOutError;
        window.location.replace("/student/login");
      } catch {
        setBusy(false); setError("Unable to leave your trial. Please reconnect and try again.");
      }
    }}>{busy ? "Opening sign in…" : "Already enrolled? Sign in"}</button>
    {error && <p role="alert" className="mt-2 text-xs text-red-800">{error}</p>}
  </div>;
}

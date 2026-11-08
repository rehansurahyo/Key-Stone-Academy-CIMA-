"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { passwordLengthError } from "./password-policy";

export function invitationProof(fragment: string) {
  const values = new URLSearchParams(fragment.replace(/^#/, ""));
  const token = values.get("token_hash"), userId = values.get("user_id");
  if (!token || !/^[a-zA-Z0-9_-]{32,256}$/.test(token) || !z.string().uuid().safeParse(userId).success) throw new Error("This invitation is invalid. Ask the Keystone team to send a fresh password invitation.");
  return { token, userId: userId! };
}

export function isolatedInvitationClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("The password service is unavailable. Please try again later.");
  // No shared cookies, localStorage, implicit callback exchange or admin session.
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export function invitationPasswordSetter(client: SupabaseClient, proof: ReturnType<typeof invitationProof>) {
  let verified = false, pending = false, finished = false;
  return async (password: string) => {
    const invalid = passwordLengthError(password);
    if (invalid) throw new Error(invalid);
    if (pending || finished) throw new Error("A password update is already in progress or complete.");
    pending = true;
    try {
      if (!verified) {
        const result = await client.auth.verifyOtp({ type: "recovery", token_hash: proof.token });
        if (result.error || result.data.user?.id !== proof.userId || result.data.session?.user.id !== proof.userId) throw new Error("This invitation is invalid, expired or already used. Ask the Keystone team to send a fresh password invitation.");
        verified = true;
      }
      const result = await client.auth.updateUser({ password });
      if (result.error) throw new Error("The password update could not be confirmed. Check your connection and retry here, or try signing in with your new password.");
      if (result.data.user?.id !== proof.userId) throw new Error("The password update could not be confirmed for this student.");
      finished = true;
      // This private in-memory session never replaced the browser's other login.
      await client.auth.signOut({ scope: "local" }).catch(() => {});
    } finally { pending = false; }
  };
}

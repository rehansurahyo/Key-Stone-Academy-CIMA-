import "server-only";
import { createClient } from "@supabase/supabase-js";

// Never import this module into client components or use a NEXT_PUBLIC_ key.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for account management.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

import "server-only";
import { createClient } from "@supabase/supabase-js";
import { AdminClientConfigurationError } from "./admin-errors";

// Never import this module into client components or use a NEXT_PUBLIC_ key.
export async function createAdminClient() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    // OpenNext can expose bindings even when its process.env shim does not.
    // Keep this request-scoped and server-only; never cache or expose the key.
    try {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const { env } = getCloudflareContext();
      const runtimeUrl = env.NEXT_PUBLIC_SUPABASE_URL;
      const runtimeKey = env.SUPABASE_SERVICE_ROLE_KEY;
      url = typeof runtimeUrl === "string" && runtimeUrl.trim() ? runtimeUrl.trim() : url;
      key = typeof runtimeKey === "string" && runtimeKey.trim() ? runtimeKey.trim() : key;
    } catch {
      // Local Next.js and Vercel do not have a Cloudflare request context.
    }
  }
  if (!url || !key) throw new AdminClientConfigurationError("ACCOUNT_CONFIG_MISSING");
  try {
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  } catch {
    // SDK constructor errors must not echo credentials or internal URLs.
    throw new AdminClientConfigurationError("ACCOUNT_CONFIG_INVALID");
  }
}

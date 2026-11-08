import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailConfig, emailEnvironment } from "@/lib/email/config";
import { dispatchEmails } from "@/lib/email/dispatch";

async function authorizedEnvironment(request: Request) {
  const env = await emailEnvironment(), expected = env.EMAIL_DISPATCH_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const credential = `Bearer ${expected ?? ""}`;
  const actualBytes = Buffer.from(supplied), expectedBytes = Buffer.from(credential);
  if (!expected || expected.length < 32 || actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
  return env;
}

// Rollout preflight: check actual runtime bindings and the committed migration
// without claiming a job, generating a password token, or contacting Brevo.
export async function GET(request: Request) {
  const env = await authorizedEnvironment(request);
  if (!env) return Response.json({ error: "Unauthorized." }, { status: 401 });
  let configurationReady = false, migrationReady = false;
  try {
    await emailConfig({ allowDisabled: true }); configurationReady = true;
    const admin = await createAdminClient();
    const result = await admin.from("portal_email_jobs").select("id").limit(0);
    migrationReady = !result.error;
  } catch { /* Return booleans only, never server keys or provider details. */ }
  return Response.json({ enabled: env.EMAIL_AUTOMATION_ENABLED === "true", configuration_ready: configurationReady, migration_ready: migrationReady }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const env = await authorizedEnvironment(request);
  if (!env) return Response.json({ error: "Unauthorized." }, { status: 401 });
  if (env.EMAIL_AUTOMATION_ENABLED !== "true") return Response.json({ enabled: false }, { headers: { "Cache-Control": "no-store" } });
  try {
    const config = await emailConfig();
    return Response.json(await dispatchEmails(await createAdminClient(), config), { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Email processing unavailable. Check server email configuration and migration." }, { status: 503 }); }
}

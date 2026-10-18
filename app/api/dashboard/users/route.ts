import { checkOrigin, DashboardError, requireStaff } from "@/lib/dashboard/auth";
import { newUserSchema } from "@/lib/dashboard/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminClientConfigurationError } from "@/lib/supabase/admin-errors";

export const runtime = "nodejs";
const ACCOUNT_API_VERSION = "2026-10-18.2";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let stage = "authorization";
  let admin: Awaited<ReturnType<typeof createAdminClient>> | undefined;
  let createdId: string | undefined;
  let providerFailure: unknown;
  const finish = (response: Response) => {
    response.headers.set("X-Account-API-Version", ACCOUNT_API_VERSION);
    response.headers.set("X-Request-ID", requestId);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  try {
    checkOrigin(request);
    await requireStaff("admin");
    stage = "validation";
    const parsed = newUserSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new DashboardError(parsed.error.issues[0].message);
    stage = "configuration";
    admin = await createAdminClient();
    const { email, password, full_name, role, assigned_level } = parsed.data;
    stage = "auth-create";
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
    if (error || !data.user) {
      providerFailure = error;
      throw new DashboardError(error?.message ?? "Unable to create account.");
    }
    createdId = data.user.id;
    stage = "profile-write";
    const { data: profile, error: profileError } = await admin.from("profiles").update({ role, full_name, is_active: true, assigned_level }).eq("id", createdId).select("id").single();
    if (profileError || !profile) {
      providerFailure = profileError;
      throw new DashboardError("Unable to create the user profile.");
    }
    return finish(Response.json({ id: createdId }, { status: 201 }));
  } catch (error) {
    let rollbackFailed = false;
    if (createdId && admin) {
      try { const result = await admin.auth.admin.deleteUser(createdId); rollbackFailed = Boolean(result.error); }
      catch { rollbackFailed = true; }
    }
    // Deliberately exclude request bodies, email, passwords, keys, provider
    // messages and raw stacks. These structured fields locate the failing step.
    const diagnostic = providerFailure ?? error;
    const details = diagnostic && typeof diagnostic === "object" ? diagnostic as { name?: unknown; code?: unknown; status?: unknown } : {};
    const safeToken = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(value) ? value : undefined;
    console.error("Account creation failed", { requestId, stage, rollbackFailed,
      errorName: safeToken(details.name), errorCode: safeToken(details.code),
      errorStatus: typeof details.status === "number" ? details.status : undefined });
    const code = rollbackFailed ? "ACCOUNT_ROLLBACK_FAILED" : error instanceof AdminClientConfigurationError ? error.code
      : error instanceof DashboardError ? "ACCOUNT_REQUEST_REJECTED" : "ACCOUNT_CREATE_FAILED";
    const message = rollbackFailed
      ? "The account profile could not be saved and login cleanup failed. Contact support with this reference before retrying."
      : error instanceof AdminClientConfigurationError || error instanceof DashboardError ? error.message
      : "Account creation failed unexpectedly. Contact support with the reference below.";
    const status = rollbackFailed ? 503 : error instanceof AdminClientConfigurationError ? error.status
      : error instanceof DashboardError ? error.status : 500;
    // The code + reference lets admins report failures without sharing secrets.
    return finish(Response.json({ error: `${message} [${code}; reference ${requestId}]`, code, requestId, stage }, { status }));
  }
}

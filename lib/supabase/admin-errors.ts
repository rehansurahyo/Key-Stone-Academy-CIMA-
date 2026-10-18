import "server-only";

export class AdminClientConfigurationError extends Error {
  readonly status = 503;
  constructor(public readonly code: "ACCOUNT_CONFIG_MISSING" | "ACCOUNT_CONFIG_INVALID") {
    super(code === "ACCOUNT_CONFIG_MISSING"
      ? "Account management cannot access its server configuration. Check the production Worker runtime Supabase URL and service-role secret."
      : "Account management has invalid server configuration. Check the production Supabase URL and service-role secret.");
    this.name = "AdminClientConfigurationError";
  }
}

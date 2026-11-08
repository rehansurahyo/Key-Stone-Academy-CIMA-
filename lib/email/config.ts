import "server-only";
import { z } from "zod";

const names = ["EMAIL_AUTOMATION_ENABLED", "BREVO_API_KEY", "EMAIL_SENDER", "EMAIL_REPLY_TO", "EMAIL_STUDENT_ORIGIN", "EMAIL_DISPATCH_SECRET", "EMAIL_LINK_ENCRYPTION_KEY"] as const;
export async function emailEnvironment() {
  const values: Record<string, string | undefined> = Object.fromEntries(names.map(name => [name, process.env[name]?.trim()]));
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = getCloudflareContext();
    for (const name of names) if (!values[name] && typeof env[name] === "string") values[name] = env[name].trim();
  } catch { /* Local Next.js has no Cloudflare request context. */ }
  return values;
}

export async function emailConfig(options: { allowDisabled?: boolean } = {}) {
  const env = await emailEnvironment();
  if (!options.allowDisabled && env.EMAIL_AUTOMATION_ENABLED !== "true") throw new Error("Email automation is disabled. Ask an administrator to configure it before sending invitations.");
  const origin = z.string().url().safeParse(env.EMAIL_STUDENT_ORIGIN);
  let validOrigin = false;
  if (origin.success) { const url = new URL(origin.data); validOrigin = url.protocol === "https:" && url.origin === origin.data && !url.username && !url.password; }
  if (!env.BREVO_API_KEY || !z.string().email().safeParse(env.EMAIL_SENDER).success || !z.string().email().safeParse(env.EMAIL_REPLY_TO).success
    || !validOrigin || !env.EMAIL_DISPATCH_SECRET || env.EMAIL_DISPATCH_SECRET.length < 32 || !/^[0-9a-f]{64}$/i.test(env.EMAIL_LINK_ENCRYPTION_KEY ?? "")) {
    throw new Error("Email configuration is incomplete. Check the server-only Brevo, sender, portal and encryption settings.");
  }
  return { apiKey: env.BREVO_API_KEY, sender: env.EMAIL_SENDER!, replyTo: env.EMAIL_REPLY_TO!, origin: origin.data!, encryptionKey: env.EMAIL_LINK_ENCRYPTION_KEY! };
}

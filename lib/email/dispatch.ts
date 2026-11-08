import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseExamLevel } from "@/lib/exam-levels";
import { openLink, sealLink } from "./crypto";
import { emailConfig } from "./config";
import { renderEmail, type EmailKind } from "./templates";

type Job = { id: string; kind: EmailKind; user_id: string; submission_id: string | null; recipient: string; full_name: string; level: string; exam_name: string | null; generation: number; claim_token: string; encrypted_link: string | null };
async function dedupeId(id: string, generation: number) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${id}:${generation}`)));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes.slice(0, 16), byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function dispatchEmails(admin: SupabaseClient, config: Awaited<ReturnType<typeof emailConfig>>, send: typeof fetch = fetch) {
  const totals = { accepted: 0, deferred: 0, cancelled: 0, failed: 0 };
  for (let index = 0; index < 3; index++) {
    const claimed = await admin.rpc("claim_portal_email");
    if (claimed.error) throw new Error("Email queue could not be claimed.");
    const job = claimed.data?.[0] as Job | undefined;
    if (!job) break;
    async function finish(state: "sent" | "pending" | "cancelled" | "failed", code: string | null, providerId: string | null = null) {
      const result = await admin.rpc("finish_portal_email", { p_id: job!.id, p_claim: job!.claim_token, p_state: state, p_message_id: providerId, p_error_code: code });
      if (result.error || result.data !== true) throw new Error("Email result could not be acknowledged.");
      totals[state === "sent" ? "accepted" : state === "pending" ? "deferred" : state]++;
    }
    try {
      const level = parseExamLevel(job.level);
      const profile = await admin.from("profiles").select("id,role,is_active,access_type,email").eq("id", job.user_id).maybeSingle();
      if (profile.error) { await finish("pending", "profile_unavailable"); continue; }
      if (!level || !z.string().email().max(254).safeParse(job.recipient).success || !profile.data?.is_active || profile.data.role !== "student"
        || profile.data.access_type !== (job.kind === "enrolled_invitation" ? "enrolled" : "trial")) { await finish("cancelled", "recipient_unavailable"); continue; }
      if (job.kind === "trial_feedback") {
        const evaluation = await admin.from("tutor_evaluations").select("status").eq("submission_id", job.submission_id).maybeSingle();
        if (evaluation.error) { await finish("pending", "feedback_unavailable"); continue; }
        if (evaluation.data?.status !== "published") { await finish("cancelled", "feedback_not_published"); continue; }
      }
      let passwordLink: string | undefined, encryptedLink = job.encrypted_link;
      if (job.kind === "enrolled_invitation") {
        const identity = await admin.auth.admin.getUserById(job.user_id);
        if (identity.error) { await finish("pending", "identity_unavailable"); continue; }
        if (identity.data.user?.email?.toLowerCase() !== job.recipient.toLowerCase() || profile.data.email?.toLowerCase() !== job.recipient.toLowerCase()) { await finish("cancelled", "recipient_changed"); continue; }
        const binding = `${job.id}:${job.generation}`;
        if (encryptedLink) passwordLink = await openLink(encryptedLink, config.encryptionKey, binding);
        else {
          const link = await admin.auth.admin.generateLink({ type: "recovery", email: job.recipient, options: { redirectTo: `${config.origin}/set-password` } });
          if (link.error || link.data.user?.id !== job.user_id || !link.data.properties?.hashed_token) { await finish("pending", "password_link_unavailable"); continue; }
          passwordLink = `${config.origin}/set-password#${new URLSearchParams({ token_hash: link.data.properties.hashed_token, user_id: job.user_id }).toString()}`;
          encryptedLink = await sealLink(passwordLink, config.encryptionKey, binding);
        }
      }
      const content = renderEmail({ kind: job.kind, level, fullName: job.full_name, examName: job.exam_name ?? undefined, passwordLink, portalOrigin: config.origin });
      // Persist the same encrypted link before sending; retrying a response lost
      // after acceptance must not invalidate the link in the first email.
      const prepared = await admin.rpc("prepare_portal_email", { p_id: job.id, p_claim: job.claim_token, p_encrypted_link: encryptedLink });
      if (prepared.error || prepared.data !== true) throw new Error("Email lease was lost before delivery.");
      const idempotencyKey = await dedupeId(job.id, job.generation);
      let response: Response;
      try {
        response = await send("https://api.brevo.com/v3/smtp/email", { method: "POST", redirect: "error", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(12_000),
          headers: { "api-key": config.apiKey, "Content-Type": "application/json", idempotencyKey },
          body: JSON.stringify({ sender: { name: "Keystone Academia", email: config.sender }, replyTo: { email: config.replyTo, name: "Keystone Academia" },
            to: [{ email: job.recipient, name: job.full_name }], subject: content.subject, textContent: content.text, htmlContent: content.html, headers: { idempotencyKey }, tags: [job.kind] }),
        });
      } catch { await finish("pending", "network_uncertain"); continue; }
      const body = await response.json().catch(() => null) as { code?: unknown; messageId?: unknown } | null;
      if (response.status === 400 && body?.code === "duplicate_parameter") { await finish("sent", null, `deduplicated:${idempotencyKey}`); continue; }
      if (response.ok && typeof body?.messageId === "string" && body.messageId.length <= 255) { await finish("sent", null, body.messageId); continue; }
      if (response.status === 429 || response.status >= 500 || response.ok) { await finish("pending", response.ok ? "response_uncertain" : `provider_${response.status}`); continue; }
      await finish("failed", `provider_${response.status}`);
    } catch {
      // No token, recipient, provider body, email content or credential in logs.
      // If acknowledging an accepted request failed, its unchanged dedupe key
      // protects the next leased attempt within the bounded retry window.
      await finish("pending", "processing_uncertain").catch(() => { totals.deferred++; });
    }
  }
  return totals;
}

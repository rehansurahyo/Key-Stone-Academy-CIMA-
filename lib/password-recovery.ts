"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { passwordLengthError } from "@/lib/password-policy";

const PROOF_KEY = "keystone:password-recovery:v1";
const RECOVERY_WINDOW_MS = 15 * 60 * 1000;
type RecoveryProof = { userId: string; fingerprint: string; expiresAt: number };
const initializations = new WeakMap<SupabaseClient, Promise<void>>();
let memoryProof: RecoveryProof | null = null;

export class PasswordRecoveryError extends Error {
  constructor(message = "This password reset link is invalid or expired. Request a new link and open it in the same browser and device.") {
    super(message);
    this.name = "PasswordRecoveryError";
  }
}
const recoveryError = () => new PasswordRecoveryError();

export function clearPasswordRecovery(): void {
  memoryProof = null;
  try { window.sessionStorage.removeItem(PROOF_KEY); } catch { /* Storage can be disabled. */ }
}

function readProof(): RecoveryProof | null {
  let proof: unknown = memoryProof;
  try {
    const stored = window.sessionStorage.getItem(PROOF_KEY);
    if (stored) proof = JSON.parse(stored);
  } catch { /* Keep an in-memory proof for the current page only. */ }
  if (!proof || typeof proof !== "object") return null;
  const value = proof as Partial<RecoveryProof>;
  if (typeof value.userId !== "string" || typeof value.fingerprint !== "string" || typeof value.expiresAt !== "number"
    || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()
    || value.expiresAt > Date.now() + RECOVERY_WINDOW_MS + 5000) return null;
  return value as RecoveryProof;
}

async function fingerprint(session: Session): Promise<string> {
  // The session_id is stable across refresh-token rotation. The hash fallback
  // safely requires a new recovery link if a legacy token changes.
  let identity = `token:${session.access_token}`;
  try {
    const encoded = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), char => char.charCodeAt(0))));
    if (typeof payload.session_id === "string" && payload.session_id) identity = `session:${payload.session_id}`;
  } catch { /* Not all token formats contain a session_id claim. */ }
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

function assertCleanCallback(): void {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  // Automatic exchange removes ?code on success. A remaining code must never
  // fall through to a previously signed-in user's ordinary session.
  if (url.searchParams.has("code") || ["error", "error_code", "error_description"].some(key => url.searchParams.has(key) || hash.has(key))) throw recoveryError();
}

async function initializeRecovery(client: SupabaseClient): Promise<void> {
  const entry = new URL(window.location.href);
  const hash = new URLSearchParams(entry.hash.slice(1));
  if (["error", "error_code", "error_description"].some(key => entry.searchParams.has(key) || hash.has(key))) { clearPasswordRecovery(); throw recoveryError(); }
  const hasCallback = entry.searchParams.has("code");
  let observed: Session | null = null;
  // Subscribe synchronously, and never call async auth APIs inside this callback
  // (Supabase invokes listeners while holding its auth lock).
  const { data: listener } = client.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" && session) observed = session;
  });
  try {
    const initialized = await client.auth.initialize();
    if (initialized.error) throw recoveryError();
    assertCleanCallback();
    // Some SDK versions schedule the recovery event just after initialization.
    if (hasCallback && !observed) await new Promise(resolve => window.setTimeout(resolve, 0));
    const { data, error } = await client.auth.getSession();
    const session = data.session;
    if (error || !session) throw recoveryError();
    if (hasCallback && observed) {
      const recovered = observed as Session;
      if (recovered.user.id !== session.user.id || await fingerprint(recovered) !== await fingerprint(session)) throw recoveryError();
      memoryProof = { userId: session.user.id, fingerprint: await fingerprint(session), expiresAt: Date.now() + RECOVERY_WINDOW_MS };
      try { window.sessionStorage.setItem(PROOF_KEY, JSON.stringify(memoryProof)); } catch { /* Valid for this page only. */ }
    }
    // No callback/event means a normal login is not sufficient. A prior,
    // verified recovery proof is required to resume a refreshed reset page.
  } catch (error) {
    clearPasswordRecovery();
    throw error;
  } finally { listener.subscription.unsubscribe(); }
}

export async function verifyPasswordRecovery(client: SupabaseClient): Promise<Session> {
  let initialization = initializations.get(client);
  if (!initialization) {
    initialization = initializeRecovery(client);
    initializations.set(client, initialization);
  }
  try {
    await initialization;
    assertCleanCallback();
    const { data, error } = await client.auth.getSession();
    const session = data.session;
    const proof = readProof();
    if (error || !session || !proof || proof.userId !== session.user.id || proof.fingerprint !== await fingerprint(session)) throw recoveryError();
    // Validate the captured token with Supabase, not only local cookie data.
    const verified = await client.auth.getUser(session.access_token);
    if (verified.error || verified.data.user?.id !== proof.userId) throw recoveryError();
    return session;
  } catch (error) {
    clearPasswordRecovery();
    throw error;
  }
}

export async function getPasswordResetLoginPath(client: SupabaseClient, userId: string): Promise<"/staff/login" | "/student/login"> {
  try {
    const { data, error } = await client.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (!error && (data?.role === "admin" || data?.role === "tutor")) return "/staff/login";
    if (!error && data?.role === "student") return "/student/login";
  } catch { /* Safe navigation fallback; this never grants workspace access. */ }
  return window.location.hostname.startsWith("mocksadmin.") ? "/staff/login" : "/student/login";
}

export async function updateRecoveryPassword(client: SupabaseClient, password: string, expectedUserId: string): Promise<void> {
  const lengthError = passwordLengthError(password);
  if (lengthError) throw new Error(lengthError);
  const session = await verifyPasswordRecovery(client);
  const current = await client.auth.getSession();
  if (session.user.id !== expectedUserId || current.error || !current.data.session
    || current.data.session.user.id !== expectedUserId || await fingerprint(current.data.session) !== await fingerprint(session)) {
    clearPasswordRecovery();
    throw new PasswordRecoveryError("Your sign-in session changed. Request a new password reset link for the correct account.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured for password updates.");

  // Do not use the shared client's updateUser(): it reads cookie storage again
  // after async verification, so another tab could substitute a different user.
  // This mutation is bound to the exact recovery token we just verified.
  let response: Response;
  try {
    response = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/user`, {
      method: "PUT", credentials: "omit", redirect: "error", cache: "no-store",
      headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password }), signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("The password update could not be confirmed. Check your connection; try signing in with the new password or request a new reset link.");
  }
  const body: unknown = await response.json().catch(() => null);
  const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (!response.ok) {
    const message = [data.msg, data.message, data.error_description].find(value => typeof value === "string" && value.length > 0);
    throw new Error(typeof message === "string" ? message : "Unable to update password. Please try again.");
  }
  const user = data.user && typeof data.user === "object" ? data.user as Record<string, unknown> : data;
  if (user.id !== expectedUserId) throw new Error("The password update could not be confirmed for this account. Request a new reset link.");
}

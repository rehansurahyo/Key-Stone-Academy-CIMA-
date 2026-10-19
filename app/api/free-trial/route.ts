import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { normalizeTrialContact } from "@/lib/trial-contact";

const leadSchema = z.object({
  full_name: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(5).max(50),
  country: z.string().length(2).optional(),
  phone_country: z.string().length(2),
  target_level: z.enum(["OCS", "MCS", "SCS"]),
  captcha_token: z.string().max(4096).optional(),
}).strict();

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = leadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Enter your name, email, phone country code, phone number and case study." }, { status: 400 });
  }
  let contact: ReturnType<typeof normalizeTrialContact>;
  try { contact = normalizeTrialContact(parsed.data.country, parsed.data.phone_country, parsed.data.phone); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid contact details." }, { status: 400 }); }
  try {
    const supabase = await createClient();
    const { data: identity, error: identityError } = await supabase.auth.getUser();
    // Never replace an enrolled/staff session or grant access by an entered email.
    if (identity.user && !identityError && !identity.user.is_anonymous) {
      return Response.json({ redirect: "/dashboard" }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (identityError && identityError.name !== "AuthSessionMissingError") {
      return Response.json({ error: "Your session could not be verified. Reload and try again." }, { status: 401 });
    }
    if (!identity.user) {
      const { error: signInError } = await supabase.auth.signInAnonymously({
        options: { captchaToken: parsed.data.captcha_token },
      });
      if (signInError) {
        const disabled = signInError.code === "anonymous_provider_disabled";
        return Response.json({ error: disabled
          ? "Free trials are not enabled yet. Please contact Keystone Academia."
          : "Unable to start your trial. Please retry the security check or try again later." },
        { status: disabled ? 503 : 429, headers: { "Cache-Control": "private, no-store" } });
      }
    }
    const { full_name, email, target_level } = parsed.data;
    const { error } = await supabase.rpc("register_free_trial_contact", {
      p_full_name: full_name, p_email: email, p_phone: contact.phone, p_level: target_level,
      p_country: contact.country, p_phone_country: contact.phone_country, p_country_code: contact.country_code,
    });
    if (error) {
      return Response.json({ error: error.code === "P0002"
        ? "Mock 1 is not available for this level yet. Please contact Keystone Academia."
        : "We could not save your trial request. Please try again or contact Keystone Academia." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } });
    }
    return Response.json({ received: true, redirect: "/dashboard" }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "We could not send your request. Please try again." }, { status: 503 });
  }
}

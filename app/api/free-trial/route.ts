import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const leadSchema = z.object({
  full_name: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(5).max(50),
  target_level: z.enum(["OCS", "MCS", "SCS"]),
}).strict();

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = leadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Enter your name, email, phone number and target level." }, { status: 400 });
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("free_trial_leads").insert(parsed.data);
    if (error) throw error;
    return Response.json({ received: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "We could not send your request. Please try again." }, { status: 503 });
  }
}

import assert from "node:assert/strict";
import { loader } from "./component-loader.mjs";

const inserted = [];
const updated = [];
const client = { from(table) { return {
  insert: async data => { inserted.push({ table, data }); return { error: null }; },
  update: data => ({ eq: async (column, value) => { updated.push({ table, data, column, value }); return { error: null }; } }),
}; } };
const load = loader({
  "@/lib/supabase/server": { createClient: async () => client },
  "@/lib/dashboard/auth": {
    DashboardError: class DashboardError extends Error { constructor(message, status = 400) { super(message); this.status = status; } },
    checkOrigin(request) { if (request.headers.get("origin") !== new URL(request.url).origin) throw Object.assign(new Error("Invalid request origin."), { status: 403 }); },
    requireStaff: async role => { assert.equal(role, "admin"); return { supabase: client }; },
    apiError(error) { return Response.json({ error: error.message }, { status: error.status || 500 }); },
  },
});
const trial = load("app/api/free-trial/route.ts");
const lead = load("app/api/dashboard/leads/[id]/route.ts");
const request = (url, body, origin = "http://localhost:3001") => new Request(url, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
let response = await trial.POST(request("http://localhost:3001/api/free-trial", { full_name: "Trial Student", email: "trial@example.com", phone: "+92 300 1234567", target_level: "MCS" }));
assert.equal(response.status, 201); assert.deepEqual(inserted, [{ table: "free_trial_leads", data: { full_name: "Trial Student", email: "trial@example.com", phone: "+92 300 1234567", target_level: "MCS" } }]);
assert.equal((await trial.POST(request("http://localhost:3001/api/free-trial", { full_name: "", email: "wrong", phone: "1", target_level: "BAD" }))).status, 400);
assert.equal((await trial.POST(request("http://localhost:3001/api/free-trial", { full_name: "A", email: "a@example.com", phone: "12345", target_level: "OCS" }, "https://invalid.example"))).status, 403);
const id = "00000000-0000-4000-8000-000000000081";
response = await lead.PATCH(new Request(`http://localhost:3001/api/dashboard/leads/${id}`, { method: "PATCH", headers: { Origin: "http://localhost:3001", "Content-Type": "application/json" }, body: JSON.stringify({ status: "contacted", admin_notes: "Sent WhatsApp" }) }), { params: Promise.resolve({ id }) });
assert.equal(response.status, 200); assert.deepEqual(updated, [{ table: "free_trial_leads", data: { status: "contacted", admin_notes: "Sent WhatsApp" }, column: "id", value: id }]);
console.log("PASS: public free-trial requests validate and persist without exposing leads; admin lead updates require the protected route");

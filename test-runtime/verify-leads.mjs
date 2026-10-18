import assert from "node:assert/strict";
import { loader } from "./component-loader.mjs";

const updated = [];
const registered = [];
let user = null, authError = { name: "AuthSessionMissingError" }, signInError = null, rpcError = null, authCalls = 0;
const client = { auth: {
  getUser: async () => ({ data: { user }, error: authError }),
  signInAnonymously: async () => { authCalls++; return { error: signInError }; },
}, rpc: async (name, payload) => { registered.push({ name, payload }); return { data: "mock-one", error: rpcError }; }, from(table) { return {
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
assert.equal(response.status, 201); assert.equal(authCalls, 1);
assert.deepEqual(await response.json(), { received: true, redirect: "/dashboard" });
assert.deepEqual(registered, [{ name: "register_free_trial", payload: { p_full_name: "Trial Student", p_email: "trial@example.com", p_phone: "+92 300 1234567", p_level: "MCS" } }]);
assert.equal((await trial.POST(request("http://localhost:3001/api/free-trial", { full_name: "", email: "wrong", phone: "1", target_level: "BAD" }))).status, 400);
assert.equal((await trial.POST(request("http://localhost:3001/api/free-trial", { full_name: "A", email: "a@example.com", phone: "12345", target_level: "OCS" }, "https://invalid.example"))).status, 403);
const details = { full_name: "Trial", email: "trial@example.test", phone: "123456", target_level: "OCS" };
const submitTrial = body => trial.POST(request("http://localhost:3001/api/free-trial", body ?? details));
user = { id: "guest", is_anonymous: true }; authError = null;
assert.equal((await submitTrial()).status, 201); assert.equal(authCalls, 1, "Existing guest session reused");
for (const role of ["student", "tutor", "admin"]) {
  user = { id: role, is_anonymous: false };
  const before = registered.length;
  const existing = await submitTrial(); assert.equal(existing.status, 200);
  assert.equal((await existing.json()).redirect, "/dashboard");
  assert.equal(registered.length, before, "Existing permanent account must never be overwritten or downgraded");
}
user = null; authError = { name: "AuthSessionMissingError" }; signInError = { code: "anonymous_provider_disabled" };
assert.equal((await submitTrial()).status, 503);
signInError = { code: "over_request_rate_limit" }; assert.equal((await submitTrial()).status, 429);
signInError = null; authError = { name: "NetworkError" }; const before = authCalls;
assert.equal((await submitTrial()).status, 401); assert.equal(authCalls, before, "Unverifiable session must not be replaced");
authError = null; user = { id: "guest", is_anonymous: true }; rpcError = { code: "P0002" };
response = await submitTrial(); assert.equal(response.status, 503); assert.match((await response.json()).error, /Mock 1/);
rpcError = { code: "PGRST202", message: "secret database details" };
response = await submitTrial(); assert.equal(response.status, 503); assert.ok(!(await response.text()).includes("secret database"));
rpcError = null;
const id = "00000000-0000-4000-8000-000000000081";
response = await lead.PATCH(new Request(`http://localhost:3001/api/dashboard/leads/${id}`, { method: "PATCH", headers: { Origin: "http://localhost:3001", "Content-Type": "application/json" }, body: JSON.stringify({ status: "contacted", admin_notes: "Sent WhatsApp" }) }), { params: Promise.resolve({ id }) });
assert.equal(response.status, 200); assert.deepEqual(updated, [{ table: "free_trial_leads", data: { status: "contacted", admin_notes: "Sent WhatsApp" }, column: "id", value: id }]);
console.log("PASS: trial form API validates origin/body, establishes/reuses guest auth, registers lead atomically, preserves enrolled/staff sessions, and shows explicit configuration/network/database errors");
console.log("PASS: admin lead follow-up remains protected and functional");

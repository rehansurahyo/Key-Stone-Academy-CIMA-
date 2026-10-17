import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Test the real Zod schemas without requiring an additional TS test runner.
const source = await readFile(new URL("../lib/dashboard/validation.ts", import.meta.url), "utf8");
const js = ts.transpile(source.replace('from "zod"', `from ${JSON.stringify(new URL("../node_modules/zod/index.js", import.meta.url).href)}`), { module: ts.ModuleKind.ESNext });
const { mockSchema, gradeSchema, newUserSchema, updateUserSchema } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const question = { from: "Finance Director", to: "Senior Manager", subject: "Funding", intro: "Evaluate the proposed investment.", taskPrompt: "Prepare a memo.", subtasks: [{description:"Discuss strategy",weightage:20},{description:"Discuss funding",weightage:30},{description:"Discuss risk",weightage:50}] };
assert.equal(mockSchema.parse({ name: "CIMA Mock", status: "published", questions: [question] }).questions[0].timeMinutes, 60);
assert.equal(mockSchema.safeParse({ name: "CIMA Mock", status: "published", questions: [] }).success, false);
assert.equal(mockSchema.safeParse({ name: "CIMA Mock", status: "published", questions: [{ ...question, timeMinutes: 0 }] }).success, false);
for (const subtasks of [[],[{description:"Task",weightage:99}],[{description:"Task",weightage:0}],[{description:" ",weightage:100}],[{description:"Task",weightage:-1}],[{description:"Task",weightage:100.001}]]) {
  assert.equal(mockSchema.safeParse({name:"CIMA Mock",status:"draft",questions:[{...question,subtasks}]}).success,false);
}
assert.equal(mockSchema.safeParse({name:"Marks Mock",status:"published",questions:[{...question,weightageUnit:"marks",subtasks:[{description:"Task",weightage:37.5}]}]}).success,true);
assert.equal(mockSchema.parse({name:"Decimal Mock",status:"draft",questions:[{...question,subtasks:[{description:"A",weightage:33.33},{description:"B",weightage:33.33},{description:"C",weightage:33.34}]}]}).questions[0].subtasks.length,3);
assert.equal(gradeSchema.safeParse({ score: 101, feedback: "Good", revision: 0 }).success, false);
assert.equal(gradeSchema.safeParse({ score: 0, feedback: "  ", revision: 0 }).success, false);
assert.equal(gradeSchema.safeParse({ score: 0, feedback: "No credit", revision: 0 }).success, true);
assert.equal(newUserSchema.safeParse({ email: "admin@example.com", full_name: "A", password: "a-long-password", role: "admin" }).success, false);
assert.equal(updateUserSchema.safeParse({ full_name: "A", role: "admin", is_active: true }).success, false);
console.log("PASS: exam defaults, invalid timers/weights, grading bounds, role assignment validation");

if (process.argv[2]) {
  const base = new URL(process.argv[2]);
  assert.ok(["localhost", "127.0.0.1"].includes(base.hostname), "Smoke checks must target a local server.");
  async function request(path, options) { return fetch(new URL(path, base), { redirect: "manual", ...options }); }
  for (const path of ["/dashboard", "/dashboard/exams/new", "/dashboard/exams/00000000-0000-4000-8000-000000000001/edit", "/dashboard/submissions", "/dashboard/users"]) {
    const response = await request(path);
    assert.equal(response.status, 307, path);
    assert.ok(response.headers.get("location")?.includes("/staff/login"), path);
  }
  const login = await request("/staff/login");
  assert.equal(login.status, 200);
  assert.ok((await login.text()).includes("Admin &amp; Tutor Portal"));
  assert.equal((await request("/api/auth/staff")).status, 401, "Anonymous session verification");
  assert.equal((await request("/api/auth/staff", { method: "POST", headers: { Origin: base.origin, "Content-Type": "application/json" }, body: "{}" })).status, 400, "Invalid sign-in payload");
  assert.equal((await request("/api/auth/staff", { method: "POST", headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" }, body: "{}" })).status, 403, "Cross-origin sign-in");
  for (const [path, method] of [["/api/dashboard/users", "POST"], ["/api/dashboard/exams", "POST"], ["/api/dashboard/exams/00000000-0000-4000-8000-000000000001", "PATCH"], ["/api/dashboard/exams/00000000-0000-4000-8000-000000000001", "PUT"], ["/api/dashboard/exams/00000000-0000-4000-8000-000000000001", "DELETE"], ["/api/dashboard/submissions/00000000-0000-4000-8000-000000000001", "PATCH"]]) {
    const response = await request(path, { method, headers: { Origin: base.origin, "Content-Type": "application/json" }, body: "{}" });
    assert.equal(response.status, 401, `${method} ${path}`);
  }
  const forbidden = await request("/api/dashboard/users", { method: "POST", headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" }, body: "{}" });
  assert.equal(forbidden.status, 403, "Cross-origin account write");
  const exam = await request("/exam/00000000-0000-4000-8000-000000000001");
  assert.equal(exam.status, 307);
  assert.ok(exam.headers.get("location")?.includes("/student/login"));
  const studentDashboard = await request("/student/dashboard");
  assert.equal(studentDashboard.status, 307);
  assert.ok(studentDashboard.headers.get("location")?.includes("/student/login"));
  for (const path of ["/api/submissions/00000000-0000-4000-8000-000000000001/answers", "/api/reports/00000000-0000-4000-8000-000000000001"]) {
    assert.equal((await request(path)).status, 401, `Anonymous document download ${path}`);
  }
  assert.equal((await request("/api/dashboard/submissions/00000000-0000-4000-8000-000000000001/reports", { method: "POST", headers: { Origin: base.origin, "Content-Type": "application/json" }, body: "{}" })).status, 401);
  assert.equal((await request("/api/dashboard/submissions/00000000-0000-4000-8000-000000000001/reports", { method: "POST", headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" }, body: "{}" })).status, 403);
  console.log("PASS: staff login, protected page redirects, unauthenticated API denial, cross-origin denial, student exam redirect");
}

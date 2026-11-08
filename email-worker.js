import handler from "./.open-next/worker.js";

const worker = {
  fetch: handler.fetch,
  async scheduled(_event, env, context) {
    if (env.EMAIL_AUTOMATION_ENABLED !== "true") return;
    if (typeof env.EMAIL_DISPATCH_SECRET !== "string" || env.EMAIL_DISPATCH_SECRET.length < 32) throw new Error("Email dispatch configuration unavailable.");
    // Reuse OpenNext's fetch wrapper to establish its request-scoped bindings.
    const response = await handler.fetch(new Request("https://mocks.keystoneacademia.com/api/internal/email-dispatch", {
      method: "POST", headers: { Authorization: `Bearer ${env.EMAIL_DISPATCH_SECRET}` },
    }), env, context);
    if (!response.ok) throw new Error("Scheduled email processing failed.");
  },
};
export default worker;

import assert from 'node:assert/strict';
import { loader } from './component-loader.mjs';

// Exercise real configuration and request handling with dummy credentials and
// mocked transports. These tests never call Supabase or create real accounts.
const originalEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
const dummyUrl = 'https://dummy-account-test.supabase.co';
const dummyKey = 'dummy-server-only-account-key';
function setEnv(url, key) {
  if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  if (key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = key;
}

let workerEnv;
let workerUnavailable = false;
let workerReads = 0;
let clientCalls = [];
const dummyClient = { testOnly: true };
const configLoad = loader({
  'server-only': {},
  '@supabase/supabase-js': {
    createClient: (...args) => {
      clientCalls.push(args);
      const parsedUrl = new URL(args[0]);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error(`Invalid URL ${args[1]}`);
      return dummyClient;
    },
  },
  '@opennextjs/cloudflare': {
    getCloudflareContext: () => {
      workerReads++;
      if (workerUnavailable) throw new Error('No Cloudflare context exists');
      return { env: workerEnv ?? {} };
    },
  },
});
const { createAdminClient } = configLoad('lib/supabase/admin.ts');
try {
  setEnv(dummyUrl, dummyKey);
  assert.equal(await createAdminClient(), dummyClient);
  assert.equal(workerReads, 0, 'Normal Node/Vercel environment must not need a Worker context');
  assert.equal(clientCalls.at(-1)[0], dummyUrl);
  assert.equal(clientCalls.at(-1)[1], dummyKey);
  assert.equal(clientCalls.at(-1)[2].auth.persistSession, false);
  assert.equal(clientCalls.at(-1)[2].auth.autoRefreshToken, false);

  setEnv(undefined, undefined);
  workerEnv = { NEXT_PUBLIC_SUPABASE_URL: dummyUrl, SUPABASE_SERVICE_ROLE_KEY: dummyKey };
  assert.equal(await createAdminClient(), dummyClient);
  assert.ok(workerReads > 0, 'Worker bindings must be read when process.env is unavailable');
  assert.equal(clientCalls.at(-1)[1], dummyKey);

  setEnv(dummyUrl, undefined);
  workerEnv = { SUPABASE_SERVICE_ROLE_KEY: dummyKey };
  assert.equal(await createAdminClient(), dummyClient, 'A runtime secret can complement the public URL');

  workerEnv = { NEXT_PUBLIC_SUPABASE_URL: 'https://runtime-account-test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: dummyKey };
  assert.equal(await createAdminClient(), dummyClient);
  assert.equal(clientCalls.at(-1)[0], workerEnv.NEXT_PUBLIC_SUPABASE_URL,
    'When using a Worker secret, pair it with the Worker URL instead of a stale build-time project');

  workerEnv = {};
  workerUnavailable = true;
  await assert.rejects(createAdminClient(), error => {
    assert.equal(error.name, 'AdminClientConfigurationError');
    assert.equal(error.code, 'ACCOUNT_CONFIG_MISSING');
    assert.equal(error.status, 503);
    assert.ok(!error.message.includes(dummyKey));
    return true;
  });
  workerUnavailable = false;
  setEnv('not-a-valid-url', dummyKey);
  await assert.rejects(createAdminClient(), error => {
    assert.equal(error.code, 'ACCOUNT_CONFIG_INVALID');
    assert.equal(error.status, 503);
    assert.ok(!error.message.includes(dummyKey));
    return true;
  });
  console.log('PASS: real admin helper supports Node env and Cloudflare binding fallback; missing/invalid configuration is classified safely');
} finally {
  setEnv(originalEnv.url, originalEnv.key);
}

const sensitive = {
  email: 'private-account-regression@example.invalid',
  password: 'private-regression-password-DO-NOT-LOG',
  key: 'private-service-role-key-DO-NOT-LOG',
  name: 'Private Regression Candidate',
};
const createdId = '00000000-0000-4000-8000-000000000071';
const staffId = '00000000-0000-4000-8000-000000000072';
let state;
function reset(overrides = {}) {
  state = {
    role: 'admin', authenticated: true, active: true,
    clientCalls: 0, created: 0, removed: 0, writes: 0, selected: false,
    createError: null, createThrow: null, profileError: null,
    profileThrow: null, profileRow: { id: createdId },
    rollbackError: null, rollbackThrow: null, configCode: null,
    ...overrides,
  };
}
const serverClient = {
  auth: { getUser: async () => ({ data: { user: state.authenticated ? { id: staffId } : null }, error: null }) },
  from: () => ({
    select() { return this; }, eq() { return this; },
    single: async () => ({ data: {
      id: staffId, role: state.role, is_active: state.active,
      assigned_level: 'SCS', email: 'staff@example.invalid',
    }, error: null }),
  }),
};
const adminClient = {
  auth: { admin: {
    createUser: async attributes => {
      state.created++;
      state.attributes = attributes;
      if (state.createThrow) throw state.createThrow;
      return { data: { user: state.createError ? null : { id: createdId } }, error: state.createError };
    },
    deleteUser: async id => {
      state.removed++;
      assert.equal(id, createdId, 'Rollback must target only the newly created account');
      if (state.rollbackThrow) throw state.rollbackThrow;
      return { error: state.rollbackError };
    },
  } },
  from: table => {
    assert.equal(table, 'profiles');
    return {
      update(details) { state.writes++; state.details = details; return this; },
      eq(column, id) { assert.equal(column, 'id'); assert.equal(id, createdId); return this; },
      select() { state.selected = true; return this; },
      single: async () => {
        if (state.profileThrow) throw state.profileThrow;
        return { data: state.profileRow, error: state.profileError };
      },
    };
  },
};
const routeLoad = loader({
  'server-only': {},
  'next/navigation': { redirect: url => { throw new Error(`Unexpected redirect: ${url}`); } },
  '@/lib/supabase/server': { createClient: async () => serverClient },
  '@/lib/supabase/admin': {
    createAdminClient: async () => {
      state.clientCalls++;
      if (state.configCode) throw new AdminClientConfigurationError(state.configCode);
      return adminClient;
    },
  },
});
const { POST } = routeLoad('app/api/dashboard/users/route.ts');
const { AdminClientConfigurationError } = routeLoad('lib/supabase/admin-errors.ts');
const account = {
  email: sensitive.email, full_name: sensitive.name, password: sensitive.password,
  role: 'student', assigned_level: 'MCS',
};
function request(body = account, origin = 'http://localhost:3001') {
  return new Request('http://localhost:3001/api/dashboard/users', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
async function run(overrides = {}, body = account, origin) {
  reset(overrides);
  const logs = [];
  const previousError = console.error;
  const previousWarn = console.warn;
  console.error = (...args) => logs.push(args);
  console.warn = (...args) => logs.push(args);
  let response;
  try { response = await POST(request(body, origin)); }
  finally { console.error = previousError; console.warn = previousWarn; }
  assert.equal(response.headers.get('X-Account-API-Version'), '2026-10-18.2');
  const result = await response.json();
  const loggedText = JSON.stringify(logs);
  for (const value of Object.values(sensitive)) {
    assert.ok(!loggedText.includes(value), 'Server diagnostics must never log submitted PII, password, or secret');
  }
  return { response, result, logs };
}

let outcome = await run();
assert.equal(outcome.response.status, 201);
assert.equal(outcome.result.id, createdId);
assert.equal(state.created, 1);
assert.equal(state.writes, 1);
assert.equal(state.selected, true, 'Profile writes must prove a profile row was actually updated');
assert.equal(state.removed, 0);
assert.equal(state.details.assigned_level, 'MCS');
assert.equal(state.details.role, 'student');
assert.equal(state.details.access_type, 'enrolled', 'Admin-created credential accounts retain full enrolled access');

for (const role of ['student', 'tutor']) {
  outcome = await run({ role });
  assert.equal(outcome.response.status, 403);
  assert.equal(state.clientCalls + state.created + state.writes + state.removed, 0);
}
outcome = await run({ authenticated: false });
assert.equal(outcome.response.status, 401);
assert.equal(state.created + state.writes + state.removed, 0);
outcome = await run({ active: false });
assert.equal(outcome.response.status, 403);
assert.equal(state.created + state.writes + state.removed, 0);
outcome = await run({}, account, 'https://untrusted.example');
assert.equal(outcome.response.status, 403);
assert.equal(state.clientCalls + state.created + state.writes + state.removed, 0);
outcome = await run({}, { ...account, password: 'short' });
assert.equal(outcome.response.status, 400);
assert.equal(state.clientCalls + state.created + state.writes + state.removed, 0);
console.log('PASS: account creation persists the selected level and verifies the profile; anonymous/non-admin/suspended/foreign-origin/invalid requests make no mutations');

for (const configCode of ['ACCOUNT_CONFIG_MISSING', 'ACCOUNT_CONFIG_INVALID']) {
  outcome = await run({ configCode });
  assert.equal(outcome.response.status, 503);
  assert.equal(outcome.result.code, configCode);
  assert.equal(outcome.result.stage, 'configuration');
  assert.equal(typeof outcome.result.requestId, 'string');
  assert.equal(outcome.response.headers.get('X-Request-ID'), outcome.result.requestId);
  assert.equal(state.created + state.writes + state.removed, 0);
}
console.log('PASS: configuration failures are actionable 503 responses with version and request-ID correlation, not generic HTTP 500');

outcome = await run({ createError: { code: 'email_exists', status: 422, message: 'A user with this email address has already been registered' } });
assert.ok([400, 409, 422].includes(outcome.response.status));
assert.match(outcome.result.error, /registered|already|exist/i);
assert.equal(state.writes + state.removed, 0);

for (const overrides of [
  { profileError: { code: '42703', message: 'Missing assigned_level column' }, profileRow: null },
  { profileRow: null },
  { profileThrow: new Error(`profile failed ${sensitive.email} ${sensitive.password} ${sensitive.key}`) },
]) {
  outcome = await run(overrides);
  assert.ok(outcome.response.status >= 400);
  assert.equal(state.created, 1);
  assert.equal(state.removed, 1, 'Failed/missing profile must roll back the created login');
  assert.ok(outcome.result.requestId, 'Failures must include a support correlation ID');
}
outcome = await run({ profileRow: null, rollbackError: { code: 'unexpected_failure', message: 'Delete rejected' } });
assert.ok(outcome.response.status >= 500);
assert.match(JSON.stringify(outcome.result), /rollback|cleanup|incomplete|remove/i);
assert.equal(state.removed, 1);
outcome = await run({ profileRow: null, rollbackThrow: new Error(`rollback ${sensitive.key}`) });
assert.ok(outcome.response.status >= 500);
assert.equal(state.removed, 1);
console.log('PASS: duplicate account errors remain explicit; profile errors/missing rows/exceptions roll back; failed rollback is reported distinctly');

outcome = await run({ createThrow: new Error(`provider failure ${sensitive.email} ${sensitive.password} ${sensitive.key}`) });
assert.equal(outcome.response.status, 500);
assert.equal(outcome.result.code, 'ACCOUNT_CREATE_FAILED');
assert.equal(typeof outcome.result.requestId, 'string');
assert.ok(outcome.result.requestId.length > 0);
assert.equal(typeof outcome.result.stage, 'string');
assert.ok(outcome.result.stage.length > 0);
assert.equal(state.writes + state.removed, 0);
for (const value of Object.values(sensitive)) assert.ok(!JSON.stringify(outcome.result).includes(value));
assert.ok(outcome.logs.length > 0, 'Unexpected provider failures must have safe server diagnostics');
console.log('PASS: unexpected provider errors return safe structured diagnostics without PII, body data, password, or service-role key');

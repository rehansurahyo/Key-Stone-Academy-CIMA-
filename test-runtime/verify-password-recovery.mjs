import assert from 'node:assert/strict';
import React, { act } from '../node_modules/react/index.js';
import { Window } from 'happy-dom';
import { loader } from './component-loader.mjs';

// Real React components and recovery authorization helper; only navigation and
// Supabase transport are replaced. No real accounts, passwords, or email sends.
const browser = new Window({ url: 'https://mocks.keystoneacademia.com/forgot-password' });
globalThis.window = browser;
globalThis.document = browser.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('../node_modules/react-dom/client.js');
const originalFetch = globalThis.fetch;
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://recovery-component.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-public-key';
const tick = (ms = 25) => new Promise(resolve => setTimeout(resolve, ms));
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const makeSession = (userId = 'recovered-user', sessionId = 'recovery-session') => ({
  access_token: `${encode({ alg: 'HS256' })}.${encode({ sub: userId, session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 3600 })}.test`,
  refresh_token: 'synthetic-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600, token_type: 'bearer', user: { id: userId, email: 'recovery@example.invalid' },
});

function mockClient(options = {}) {
  const client = { calls: { initialize: 0, exchange: 0, verify: 0, update: 0, sharedUpdates: 0, signOut: [], reset: [], profile: [] } };
  const subscribers = new Set();
  client.session = options.session === undefined ? makeSession() : options.session;
  client.role = Object.hasOwn(options, 'role') ? options.role : 'student';
  client.updateError = options.updateError;
  client.signOutError = options.signOutError;
  client.keepSessionOnLogout = options.keepSessionOnLogout;
  client.expectedMutationToken = client.session?.access_token;
  client.expectedMutationUser = client.session?.user;
  client.auth = {
    onAuthStateChange(callback) { subscribers.add(callback); return { data: { subscription: { unsubscribe: () => subscribers.delete(callback) } } }; },
    async initialize() {
      client.calls.initialize++;
      if (options.initializeError) return { error: options.initializeError };
      if (options.recovery !== false) {
        await Promise.resolve();
        browser.history.replaceState(null, '', '/reset-password');
        for (const cb of subscribers) cb('PASSWORD_RECOVERY', client.session);
      }
      return { error: null };
    },
    async getSession() { return { data: { session: client.session }, error: null }; },
    async getUser(token) {
      client.calls.verify++; assert.equal(token, client.session?.access_token);
      const user = options.verifyUser ?? client.session?.user ?? null;
      client.verifyHook?.(); return { data: { user }, error: options.verifyError ?? null };
    },
    async updateUser() { client.calls.sharedUpdates++; throw new Error('Never let password update reread another account from shared cookies'); },
    async signOut(options) {
      client.calls.signOut.push(options);
      if (client.signOutError) return { error: client.signOutError };
      if (!client.keepSessionOnLogout) {
        client.session = null;
        for (const cb of subscribers) cb('SIGNED_OUT', null);
      }
      return { error: null };
    },
    async resetPasswordForEmail(...args) { client.calls.reset.push(args); return { error: options.resetError ?? null }; },
    async exchangeCodeForSession() { client.calls.exchange++; throw new Error('Never consume the PKCE verifier twice'); },
  };
  client.from = table => ({
    select(columns) { assert.equal(table, 'profiles'); assert.ok(columns.includes('role')); return this; },
    eq(column, id) { client.calls.profile.push([column, id]); return this; },
    async maybeSingle() { return { data: client.role ? { role: client.role } : null, error: options.profileError ?? null }; },
    async single() { return this.maybeSingle(); },
  });
  return client;
}

let client = mockClient();
globalThis.fetch = async (input, options = {}) => {
  assert.equal(String(input), 'https://recovery-component.supabase.co/auth/v1/user');
  assert.equal(options.method, 'PUT');
  assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
  const headers = new Headers(options.headers);
  assert.equal(headers.get('authorization'), `Bearer ${client.expectedMutationToken}`);
  assert.equal(headers.get('apikey'), 'synthetic-public-key');
  assert.ok(JSON.parse(options.body).password);
  client.calls.update++;
  client.mutationHook?.();
  if (client.updateError) return Response.json({ msg: client.updateError.message, message: client.updateError.message }, { status: 400 });
  return Response.json(client.expectedMutationUser);
};
const navigation = [];
const router = { push: path => navigation.push(['push', path]), replace: path => navigation.push(['replace', path]) };
function loadForms(configured = true) {
  const load = loader({
    '@/lib/supabase/client': { isSupabaseConfigured: configured, createClient: () => client },
    'next/navigation': { useRouter: () => router, useSearchParams: () => new URLSearchParams(browser.location.search) },
    'next/link': { __esModule: true, default: ({ href, children, prefetch, ...props }) => { void prefetch; return React.createElement('a', { href, ...props }, children); } },
  });
  return {
    Forgot: load('components/forgot-password-form.tsx').ForgotPasswordForm,
    Reset: load('components/reset-password-form.tsx').ResetPasswordForm,
  };
}
async function mount(Component) {
  const el = document.createElement('div'); document.body.append(el); const root = createRoot(el);
  await act(async () => { root.render(React.createElement(React.StrictMode, null, React.createElement(Component))); await tick(); });
  await waitFor(() => !el.textContent.includes('Verifying reset authorization'), 'Recovery verification did not settle');
  return { el, close: async () => { await act(async () => root.unmount()); el.remove(); } };
}
async function waitFor(condition, message, timeout = 2500) {
  const deadline = Date.now() + timeout;
  while (!condition() && Date.now() < deadline) await act(async () => { await tick(20); });
  assert.ok(condition(), message);
}
async function waitForIdle(app) {
  await waitFor(() => ![...app.el.querySelectorAll('button')].some(button => button.disabled && /Updating password|Signing out|Sending link/i.test(button.textContent)), 'Form operation did not settle');
}
async function setValue(input, value) {
  assert.ok(input, 'Expected a visible input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new browser.Event('input', { bubbles: true }));
    input.dispatchEvent(new browser.Event('change', { bubbles: true }));
    await tick();
  });
}
async function submit(app, password = 'ValidPassword123!', confirm = password) {
  const inputs = app.el.querySelectorAll('input[autocomplete="new-password"]');
  await setValue(inputs[0], password); await setValue(inputs[1], confirm);
  await act(async () => { app.el.querySelector('form').dispatchEvent(new browser.Event('submit', { bubbles: true, cancelable: true })); await tick(); });
  await waitForIdle(app);
}
function resetLocation(url = 'https://mocks.keystoneacademia.com/reset-password?code=recovery-code') {
  browser.location.href = url;
  browser.sessionStorage.clear();
  navigation.length = 0;
}

try {
  for (const origin of ['https://mocks.keystoneacademia.com', 'https://mocksadmin.keystoneacademia.com', 'http://localhost:3001']) {
    resetLocation(origin + '/forgot-password'); client = mockClient();
    const { Forgot } = loadForms(); const app = await mount(Forgot);
    await setValue(app.el.querySelector('input'), 'student@example.invalid');
    await act(async () => { app.el.querySelector('form').dispatchEvent(new browser.Event('submit', { bubbles: true, cancelable: true })); await tick(); });
    await waitForIdle(app);
    assert.equal(client.calls.reset.at(-1)?.[1].redirectTo, origin + '/reset-password');
    assert.match(app.el.textContent, /Reset Link Sent!/); await app.close();
  }
  console.log('PASS: forgot-password redirects remain on the live student/admin/local origin');

  for (const options of [
    { recovery: false },
    { recovery: false, initializeError: new Error('PKCE code verifier not found in storage') },
    { initializeError: new Error('Expired recovery code') },
    { verifyError: new Error('Session expired') },
    { verifyUser: { id: 'different-user' } },
  ]) {
    resetLocation(); client = mockClient(options); const { Reset } = loadForms(); const app = await mount(Reset);
    assert.equal(app.el.querySelector('input[autocomplete="new-password"]'), null, JSON.stringify(options));
    assert.match(app.el.textContent, /Invalid or Expired Link/); assert.equal(client.calls.update, 0); assert.equal(client.calls.exchange, 0);
    await app.close();
  }
  for (const suffix of ['?error=access_denied&error_description=Expired+link', '#error=access_denied&error_description=Expired+link']) {
    resetLocation('https://mocks.keystoneacademia.com/reset-password' + suffix); client = mockClient();
    const { Reset } = loadForms(); const app = await mount(Reset);
    assert.match(app.el.textContent, /Invalid or Expired Link/); assert.equal(client.calls.update, 0); await app.close();
  }
  resetLocation('https://mocks.keystoneacademia.com/reset-password'); client = mockClient({ recovery: false });
  let { Reset } = loadForms(); let app = await mount(Reset);
  assert.match(app.el.textContent, /Invalid or Expired Link/); await app.close();
  console.log('PASS: ordinary old sessions, expired callbacks, missing verifier, user mismatch and failed server verification never authorize password reset');

  resetLocation(); client = mockClient(); ({ Reset } = loadForms()); app = await mount(Reset);
  assert.ok(app.el.querySelector('input[autocomplete="new-password"]')); assert.equal(client.calls.exchange, 0);
  assert.equal(client.calls.initialize, 1, 'Strict Mode must share initialization');
  const inputs = app.el.querySelectorAll('input[autocomplete="new-password"]');
  for (const input of inputs) { assert.equal(input.minLength, 12); assert.equal(input.maxLength, 128); }
  await submit(app, 'short'); assert.equal(client.calls.update, 0); assert.match(app.el.textContent, /12/);
  await submit(app, 'x'.repeat(129)); assert.equal(client.calls.update, 0); assert.match(app.el.textContent, /128/);
  await submit(app, 'ValidPassword123!', 'OtherPassword123!'); assert.equal(client.calls.update, 0); assert.match(app.el.textContent, /match/i);
  client.updateError = new Error('Password rejected by server');
  await submit(app); assert.equal(client.calls.update, 1); assert.match(app.el.textContent, /Password rejected by server/); assert.equal(client.calls.signOut.length, 0);
  client.updateError = null;
  client.session = makeSession('different-user', 'different-session');
  await submit(app); assert.equal(client.calls.update, 1, 'Account switch before submit must not update either password'); await app.close();
  resetLocation(); client = mockClient(); ({ Reset } = loadForms()); app = await mount(Reset);
  client.verifyHook = () => { client.session = makeSession('different-user', 'different-session'); };
  await submit(app); assert.equal(client.calls.update, 0, 'Account switch during token verification must block mutation'); await app.close();
  resetLocation(); client = mockClient(); ({ Reset } = loadForms()); app = await mount(Reset);
  client.mutationHook = () => { client.session = makeSession('different-user', 'different-session'); };
  await submit(app); assert.equal(client.calls.update, 1); assert.equal(client.calls.sharedUpdates, 0);
  assert.equal(client.session.user.id, 'different-user', 'Cleanup must not log out the newly signed-in account');
  assert.equal(client.calls.signOut.length, 0); assert.equal(navigation.length, 0);
  assert.equal(app.el.querySelector('input[autocomplete="new-password"]'), null);
  await app.close();
  console.log('PASS: 12–128 character policy, mismatch, backend failure and account-switch revalidation all prevent unsafe updates');

  for (const [role, origin, expected] of [
    ['student', 'https://mocksadmin.keystoneacademia.com', '/student/login'],
    ['admin', 'https://mocks.keystoneacademia.com', '/staff/login'],
    ['tutor', 'https://mocks.keystoneacademia.com', '/staff/login'],
    [null, 'https://mocksadmin.keystoneacademia.com', '/staff/login'],
  ]) {
    resetLocation(origin + '/reset-password?code=recovery-code'); client = mockClient({ role });
    ({ Reset } = loadForms()); app = await mount(Reset); await submit(app);
    assert.equal(client.calls.update, 1); assert.deepEqual(client.calls.signOut, [{ scope: 'local' }]); assert.equal(client.session, null);
    assert.match(app.el.textContent, /Password Updated Successfully/i);
    assert.ok(app.el.querySelector(`a[href="${expected}"]`), `Expected ${role} login link ${expected}`);
    await waitFor(() => navigation.length > 0, 'Completed reset did not redirect to login', 4000);
    assert.deepEqual(navigation.at(-1), ['replace', expected], 'Only signed-out users should be redirected to the correct login');
    assert.ok(!browser.sessionStorage.getItem('keystone:password-recovery:v1'), 'Recovery authorization must be discarded after reset');
    await app.close();
  }
  console.log('PASS: student/admin/tutor role-based login redirect only after local recovery session is cleared');

  for (const kind of ['error', 'session-remains']) {
    resetLocation(); client = mockClient({ signOutError: kind === 'error' ? new Error('Unable to sign out') : null, keepSessionOnLogout: kind === 'session-remains' });
    ({ Reset } = loadForms()); app = await mount(Reset); await submit(app);
    assert.equal(client.calls.update, 1); assert.equal(navigation.length, 0);
    assert.equal(app.el.querySelector('input[autocomplete="new-password"]'), null, 'A completed password update must not show a second update form');
    assert.ok(!app.el.textContent.includes('Password Updated Successfully!'), 'Do not declare complete success before session cleanup');
    const retry = [...app.el.querySelectorAll('button')].find(button => /retry|sign out/i.test(button.textContent));
    assert.ok(retry, 'Failed cleanup needs a visible retry action');
    client.signOutError = null; client.keepSessionOnLogout = false;
    await act(async () => { retry.click(); await tick(); });
    await waitForIdle(app);
    assert.equal(client.calls.update, 1, 'Retry cleanup must not change the password again');
    assert.equal(client.session, null); assert.match(app.el.textContent, /Password Updated Successfully/i);
    await app.close();
  }
  console.log('PASS: failed logout and retained-session cases expose safe cleanup retry without repeating password mutation');
} finally {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  await browser.happyDOM.close();
}

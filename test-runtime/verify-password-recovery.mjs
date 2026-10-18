import assert from 'node:assert/strict';
import React, { act } from '../node_modules/react/index.js';
import { Window } from 'happy-dom';
import { createBrowserClient } from '@supabase/ssr';
import { loader } from './component-loader.mjs';

const browser = new Window({ url: 'https://mocks.keystoneacademia.com/forgot-password' });
globalThis.window = browser; globalThis.document = browser.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('../node_modules/react-dom/client.js');
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
const requests = [];
let resetError = null;
let sessionResult = { data: { session: { user: { id: 'test-user' } } }, error: null };
let explicitExchanges = 0;
const params = new URLSearchParams('code=test-recovery-code');
const load = loader({
  '@/lib/supabase/client': { isSupabaseConfigured: true, createClient: () => ({ auth: {
    resetPasswordForEmail: async (...args) => { requests.push(args); return { error: resetError }; },
    getSession: async () => sessionResult,
    exchangeCodeForSession: async () => { explicitExchanges++; throw new Error('Must not exchange twice'); },
  } }) },
  'next/navigation': { useRouter: () => ({ push() {} }), useSearchParams: () => params },
  'next/link': { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) },
});
const { ForgotPasswordForm } = load('components/forgot-password-form.tsx');
const { ResetPasswordForm } = load('components/reset-password-form.tsx');
async function mount(Component) {
  const el = document.createElement('div'); document.body.append(el); const root = createRoot(el);
  await act(async () => { root.render(React.createElement(React.StrictMode, null, React.createElement(Component))); await tick(); });
  return { el, close: async () => { await act(async () => root.unmount()); el.remove(); } };
}
for (const origin of ['https://mocks.keystoneacademia.com', 'https://mocksadmin.keystoneacademia.com', 'http://localhost:3001']) {
  browser.location.href = origin + '/forgot-password';
  const app = await mount(ForgotPasswordForm);
  const input = app.el.querySelector('input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, 'value').set.call(input, 'student@example.invalid');
    input.dispatchEvent(new browser.Event('input', { bubbles: true }));
    input.dispatchEvent(new browser.Event('change', { bubbles: true }));
    await tick();
  });
  await act(async () => { app.el.querySelector('form').dispatchEvent(new browser.Event('submit', { bubbles: true, cancelable: true })); await tick(); });
  assert.equal(requests.at(-1)?.[1].redirectTo, origin + '/reset-password');
  assert.ok(app.el.textContent.includes('Reset Link Sent!'));
  await app.close();
}
let app = await mount(ResetPasswordForm);
assert.equal(explicitExchanges, 0);
assert.ok(!app.el.textContent.includes('Verifying'));
assert.ok(app.el.querySelector('input[type="password"]'));
await app.close();
sessionResult = { data: { session: null }, error: null };
app = await mount(ResetPasswordForm);
assert.ok(app.el.textContent.includes('same browser and device'));
await app.close();
console.log('PASS: live-origin redirects on student/admin/local hosts; Strict Mode callback does not manually exchange the one-use code; missing sessions show recovery instructions');

// Exercise real @supabase/ssr browser cookies and automatic PKCE callback.
// Only auth HTTP is mocked; no real email, credentials, or network is used.
browser.location.href = 'https://mocks.keystoneacademia.com/forgot-password';
const originalFetch = globalThis.fetch;
let exchangeCount = 0;
let challenge;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const user = { id: '00000000-0000-4000-8000-000000000123', aud: 'authenticated', role: 'authenticated', email: 'student@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600 })}.test`;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const body = JSON.parse(options.body);
  if (url.pathname.endsWith('/recover')) {
    assert.equal(url.searchParams.get('redirect_to'), browser.location.origin + '/reset-password');
    assert.equal(body.code_challenge_method, 's256'); challenge = body.code_challenge;
    return Response.json({});
  }
  assert.equal(url.pathname, '/auth/v1/token');
  assert.equal(url.searchParams.get('grant_type'), 'pkce');
  assert.equal(body.auth_code, 'test-recovery-code');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.code_verifier));
  assert.equal(Buffer.from(digest).toString('base64url'), challenge);
  exchangeCount++;
  return Response.json({ access_token: token, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user });
};
const clients = [];
try {
  const requester = createBrowserClient('https://pkce-regression.supabase.co', 'test-public-key', { isSingleton: false }); clients.push(requester);
  const sent = await requester.auth.resetPasswordForEmail(user.email, { redirectTo: browser.location.origin + '/reset-password' });
  assert.equal(sent.error, null);
  assert.ok(document.cookie.includes('code-verifier'), 'verifier is persisted in cookies before navigation');
  browser.location.href = 'https://mocks.keystoneacademia.com/reset-password?code=test-recovery-code';
  const callback = createBrowserClient('https://pkce-regression.supabase.co', 'test-public-key', { isSingleton: false }); clients.push(callback);
  const { data, error } = await callback.auth.getSession();
  assert.equal(error, null); assert.equal(data.session.user.id, user.id);
  assert.equal(exchangeCount, 1);
  assert.ok(document.cookie.includes('auth-token'), 'recovered session persists in SSR cookies');
  console.log('PASS: real SSR client persists PKCE verifier cookie, automatically exchanges once after navigation, and persists recovered session');
} finally {
  for (const client of clients) await client.auth.dispose();
  globalThis.fetch = originalFetch;
  await browser.happyDOM.abort();
}

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createBrowserClient } from '@supabase/ssr';
import { loader } from './component-loader.mjs';

// Real @supabase/ssr cookies + GoTrue automatic initialization and recovery
// events. Mock only HTTP, never contact Supabase or change a real account.
const browser = new Window({ url: 'https://mocks.keystoneacademia.com/forgot-password' });
globalThis.window = browser; globalThis.document = browser.document;
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
// The suite deliberately recreates a client after dispose to simulate reloads;
// GoTrue counts historical instances even after disposal. Keep other warnings.
console.warn = (...args) => {
  if (args.some(value => String(value).includes('Multiple GoTrueClient instances detected'))) return;
  originalWarn(...args);
};
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://pkce-regression.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-public-key';
const clients = [];
const PROOF_KEY = 'keystone:password-recovery:v1';
const userId = '00000000-0000-4000-8000-000000000123';
const sessionId = '00000000-0000-4000-8000-000000000456';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'student@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = (identity = sessionId, extra = {}) => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, session_id: identity, exp: Math.floor(Date.now()/1000) + 3600, ...extra })}.test`;
let activeToken = token();
let challenge;
let exchangeError = null;
let exchanges = 0;
let serverVerifications = 0;
let verifiedUser = user;
let verifyError = false;
let passwordUpdates = 0;
let logouts = 0;
let verifyHook = null;
let mutationHook = null;
let mutationToken = null;
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const body = options.body ? JSON.parse(options.body) : {};
  if (url.pathname === '/auth/v1/recover') {
    assert.equal(url.searchParams.get('redirect_to'), browser.location.origin + '/reset-password');
    assert.equal(body.code_challenge_method, 's256'); challenge = body.code_challenge;
    return Response.json({});
  }
  if (url.pathname === '/auth/v1/token') {
    assert.equal(url.searchParams.get('grant_type'), 'pkce');
    assert.equal(body.auth_code, 'test-recovery-code');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.code_verifier));
    assert.equal(Buffer.from(digest).toString('base64url'), challenge);
    exchanges++;
    if (exchangeError) return Response.json({ error: 'invalid_grant', error_code: 'flow_state_expired', msg: exchangeError }, { status: 400 });
    return Response.json({ access_token: activeToken, refresh_token: 'synthetic-refresh-token', token_type: 'bearer', expires_in: 3600, user });
  }
  if (url.pathname === '/auth/v1/user') {
    assert.equal(new Headers(options.headers).get('authorization'), `Bearer ${activeToken}`);
    if ((options.method ?? 'GET').toUpperCase() === 'PUT') {
      assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
      assert.equal(body.password, 'SyntheticOnlyPassword123!'); passwordUpdates++;
      mutationToken = new Headers(options.headers).get('authorization');
      const hook = mutationHook; mutationHook = null; if (hook) await hook();
      return Response.json(user);
    }
    serverVerifications++;
    if (verifyError) return Response.json({ error: 'unauthorized', msg: 'Session revoked' }, { status: 401 });
    const hook = verifyHook; verifyHook = null; if (hook) await hook();
    return Response.json(verifiedUser);
  }
  if (url.pathname === '/auth/v1/logout') {
    assert.equal(url.searchParams.get('scope'), 'local'); logouts++;
    return new Response(null, { status: 204 });
  }
  throw new Error(`Unexpected mocked auth request ${url.pathname}`);
};
function sdk() {
  const client = createBrowserClient('https://pkce-regression.supabase.co', 'synthetic-public-key', {
    isSingleton: false, auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: true },
    cookieOptions: { path: '/', sameSite: 'lax' },
  });
  clients.push(client); return client;
}
const helper = () => loader()('lib/password-recovery.ts');
async function dispose() { for (const client of clients.splice(0)) await client.auth.dispose(); }
function clean() {
  browser.location.href = 'https://mocks.keystoneacademia.com/forgot-password';
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0].trim(); if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
  browser.sessionStorage.clear(); activeToken = token(); exchangeError = null; verifyError = false; verifiedUser = user;
  verifyHook = null; mutationHook = null;
}
async function seedSession(client = sdk()) {
  const { error } = await client.auth.setSession({ access_token: activeToken, refresh_token: 'synthetic-refresh-token' });
  assert.equal(error, null); return client;
}
async function sendLink(client = sdk()) {
  const result = await client.auth.resetPasswordForEmail(user.email, { redirectTo: browser.location.origin + '/reset-password' });
  assert.equal(result.error, null);
  assert.ok(document.cookie.includes('code-verifier'), 'PKCE verifier must persist in same-origin cookies');
  return client;
}
async function recover() {
  await sendLink(); await dispose();
  browser.location.href = 'https://mocks.keystoneacademia.com/reset-password?code=test-recovery-code';
  const recovery = helper(); const client = sdk();
  const [first, second] = await Promise.all([recovery.verifyPasswordRecovery(client), recovery.verifyPasswordRecovery(client)]);
  assert.equal(first.user.id, userId); assert.equal(second.user.id, userId);
  assert.equal(browser.location.search, '', 'SDK consumes the one-use callback, not the form');
  return { recovery, client };
}

try {
  clean(); const before = exchanges; let { recovery, client } = await recover();
  assert.equal(exchanges - before, 1, 'Strict Mode/concurrent callers exchange the PKCE code once');
  assert.ok(serverVerifications >= 2, 'Each verification validates the captured token with auth server');
  assert.ok(document.cookie.includes('auth-token'));
  const proof = browser.sessionStorage.getItem(PROOF_KEY);
  assert.ok(proof); assert.ok(!proof.includes(activeToken)); assert.ok(!proof.includes('synthetic-refresh-token'));
  assert.ok(JSON.parse(proof).expiresAt <= Date.now() + 15 * 60 * 1000);
  console.log('PASS: real SSR cookie PKCE exchanges once and only recovery event + server-verified identity authorize reset');

  // Fresh helper/client simulates document reload with SSR session cookies and
  // same-tab non-secret proof. Refresh-token rotation keeps the session_id.
  await dispose(); recovery = helper(); client = sdk();
  assert.equal((await recovery.verifyPasswordRecovery(client)).user.id, userId);
  activeToken = token(sessionId, { rotation: 1 }); await seedSession(client);
  assert.equal((await recovery.verifyPasswordRecovery(client)).user.id, userId);
  assert.equal(browser.sessionStorage.getItem(PROOF_KEY), proof, 'Refresh must not extend the 15-minute recovery window');
  console.log('PASS: safe refresh/rotation resumes the same recovery session without extending authorization TTL');

  activeToken = token('different-session'); await seedSession(client);
  await assert.rejects(recovery.verifyPasswordRecovery(client), /invalid|expired/i);
  assert.equal(browser.sessionStorage.getItem(PROOF_KEY), null);
  await dispose(); clean();
  await seedSession(); await dispose(); browser.location.href = 'https://mocks.keystoneacademia.com/reset-password';
  await assert.rejects(helper().verifyPasswordRecovery(sdk()), /invalid|expired/i);
  console.log('PASS: ordinary signed-in users and same-user replacement sessions cannot inherit recovery authorization');

  for (const mode of ['expired', 'future', 'malformed']) {
    await dispose(); clean(); ({ recovery, client } = await recover()); await dispose();
    const saved = JSON.parse(browser.sessionStorage.getItem(PROOF_KEY));
    saved.expiresAt = mode === 'expired' ? Date.now() - 1 : Date.now() + 60 * 60 * 1000;
    browser.sessionStorage.setItem(PROOF_KEY, mode === 'malformed' ? '{broken-json' : JSON.stringify(saved));
    await assert.rejects(helper().verifyPasswordRecovery(sdk()), /invalid|expired/i);
  }
  console.log('PASS: expired, future-dated and malformed recovery proofs are rejected after refresh');

  for (const suffix of ['?error_code=otp_expired', '#error_description=Expired+link']) {
    await dispose(); clean(); ({ recovery, client } = await recover());
    browser.history.replaceState(null, '', '/reset-password' + suffix);
    await assert.rejects(recovery.verifyPasswordRecovery(client), /invalid|expired/i);
    assert.equal(browser.sessionStorage.getItem(PROOF_KEY), null);
  }
  console.log('PASS: all callback error markers override even an existing valid recovery proof');

  for (const suffix of ['?error=access_denied&error_description=Expired+link', '#error=access_denied&error_description=Expired+link', '?error_code=otp_expired', '#error_description=Expired+link']) {
    await dispose(); clean(); await seedSession(); await dispose();
    browser.location.href = 'https://mocks.keystoneacademia.com/reset-password' + suffix;
    await assert.rejects(helper().verifyPasswordRecovery(sdk()), /invalid|expired/i);
  }
  await dispose(); clean(); await seedSession(); await dispose();
  browser.location.href = 'https://mocks.keystoneacademia.com/reset-password?code=test-recovery-code';
  const beforeMissing = exchanges;
  client = sdk(); await assert.rejects(helper().verifyPasswordRecovery(client), /invalid|expired/i);
  assert.equal(exchanges, beforeMissing, 'Missing verifier must not perform token exchange or accept the old session');
  assert.equal((await client.auth.getSession()).data.session?.user.id, userId, 'Fixture retains old session to prove it is not recovery authorization');
  console.log('PASS: expired URL and missing verifier are denied even while another valid account session remains in cookies');

  await dispose(); clean(); client = await seedSession(); await sendLink(client); await dispose();
  exchangeError = 'Recovery code expired';
  browser.location.href = 'https://mocks.keystoneacademia.com/reset-password?code=test-recovery-code';
  client = sdk(); await assert.rejects(helper().verifyPasswordRecovery(client), /invalid|expired/i);
  assert.equal((await client.auth.getSession()).data.session?.user.id, userId);
  assert.equal(browser.sessionStorage.getItem(PROOF_KEY), null);
  console.log('PASS: real SDK expired-code error does not fall through to a preserved old login');

  await dispose(); clean(); ({ recovery, client } = await recover());
  verifiedUser = { ...user, id: 'other-account' };
  await assert.rejects(recovery.verifyPasswordRecovery(client), /invalid|expired/i);
  await dispose(); clean(); ({ recovery, client } = await recover()); verifyError = true;
  await assert.rejects(recovery.verifyPasswordRecovery(client), /invalid|expired/i);
  console.log('PASS: auth server mismatch or revoked token clears the proof and blocks password change');

  await dispose(); clean(); ({ recovery, client } = await recover());
  verifyHook = async () => { activeToken = token('replacement-session'); await seedSession(client); };
  await assert.rejects(recovery.updateRecoveryPassword(client, 'SyntheticOnlyPassword123!', userId), /invalid|expired|changed/i);
  assert.equal(passwordUpdates, 0, 'Session switch during getUser must prevent password mutation');

  await dispose(); clean(); ({ recovery, client } = await recover());
  const captured = activeToken;
  const otherUserId = '00000000-0000-4000-8000-000000000789';
  mutationHook = async () => {
    activeToken = token('replacement-during-put', { sub: otherUserId });
    verifiedUser = { ...user, id: otherUserId };
    await seedSession(client);
  };
  await recovery.updateRecoveryPassword(client, 'SyntheticOnlyPassword123!', userId);
  assert.equal(passwordUpdates, 1);
  assert.equal(mutationToken, `Bearer ${captured}`, 'Mutation must keep the verified recovery token even if shared cookies change');
  assert.equal((await client.auth.getSession()).data.session.access_token, activeToken);
  assert.equal((await client.auth.getSession()).data.session.user.id, otherUserId);
  console.log('PASS: switch during server verification is rejected; switch during PUT cannot change the explicitly targeted recovery identity');

  await dispose(); clean(); ({ recovery, client } = await recover());
  const beforeUpdate = passwordUpdates;
  await recovery.updateRecoveryPassword(client, 'SyntheticOnlyPassword123!', userId);
  assert.equal(passwordUpdates, beforeUpdate + 1);
  recovery.clearPasswordRecovery();
  const signedOut = await client.auth.signOut({ scope: 'local' });
  assert.equal(signedOut.error, null); assert.equal(logouts, 1);
  assert.equal((await client.auth.getSession()).data.session, null);
  assert.ok(!document.cookie.includes('auth-token='), 'Cookie-backed recovery session must be removed');
  assert.equal(browser.sessionStorage.getItem(PROOF_KEY), null);
  console.log('PASS: real SDK password update transport and local logout remove recovery cookies and proof');
} finally {
  await dispose(); globalThis.fetch = originalFetch; console.warn = originalWarn;
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  await browser.happyDOM.close();
}

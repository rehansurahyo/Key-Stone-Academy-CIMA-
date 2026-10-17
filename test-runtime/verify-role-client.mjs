import assert from 'node:assert/strict';
import React, { act } from '../node_modules/react/index.js';
import { createRoot } from '../node_modules/react-dom/client.js';
import { Window } from 'happy-dom';
import { loader } from './component-loader.mjs';

const browser = new Window({ url: 'http://localhost:3001/dashboard' });
globalThis.window = browser; globalThis.document = browser.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const navigation = []; browser.location.replace = path => navigation.push(path);
let profile, callback, result;
const user = { id: 'student-identity', email: 'student@example.invalid', user_metadata: { role: 'admin' } };
const client = {
  from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: profile, error: null }) }),
  auth: {
    getSession: async () => ({ data: { session: { user } }, error: null }),
    signInWithPassword: async () => ({ data: { user }, error: null }),
    onAuthStateChange: cb => { callback = cb; return { data: { subscription: { unsubscribe: () => {} } } }; },
  },
};
const load = loader({ '@/lib/supabase/client': { isSupabaseConfigured: true, createClient: () => client } });
const { useStudentAuth } = load('hooks/useStudentAuth.ts');
const { RoleGuard } = load('components/role-guard.tsx');
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
async function mount(component, props) {
  const el = document.createElement('div'); document.body.append(el); const root = createRoot(el);
  await act(async () => { root.render(React.createElement(component, props)); await tick(); });
  return { el, close: async () => { await act(async () => root.unmount()); el.remove(); } };
}
function AuthHarness() { result = useStudentAuth(); return null; }
for (const role of ['student', 'admin', 'tutor']) {
  profile = { full_name: 'Verified Account', is_active: true, role };
  const app = await mount(AuthHarness);
  assert.equal(result.role, role); assert.equal(result.user.id, user.id);
  await act(async () => { assert.equal(await result.signIn(user.email, 'test-password'), true); });
  assert.equal(result.role, role, 'Role comes from profiles, never user metadata'); await app.close();
}
for (const invalid of [null, { role: 'unknown', is_active: true }, { role: 'admin', is_active: false }]) {
  profile = invalid; const app = await mount(AuthHarness);
  assert.equal(result.user, null); assert.equal(result.role, null); assert.ok(result.error); await app.close();
}
console.log('PASS: browser login resolves all three database roles and rejects missing/unknown/suspended profiles despite admin metadata');

const props = { role: 'admin', userId: user.id, allowedRoles: ['admin', 'tutor'], children: React.createElement('p', null, 'Sensitive workspace') };
globalThis.fetch = async () => Response.json({ role: 'student', userId: user.id });
let app = await mount(RoleGuard, props);
assert.equal(navigation.at(-1), '/dashboard'); assert.ok(!app.el.textContent.includes('Sensitive workspace')); await app.close();
globalThis.fetch = async () => Response.json({ error: 'Unauthorized' }, { status: 401 });
app = await mount(RoleGuard, props); assert.equal(navigation.at(-1), '/student/login'); await app.close();
globalThis.fetch = async () => { throw new TypeError('Offline'); };
app = await mount(RoleGuard, props); assert.ok(app.el.textContent.includes('Sensitive workspace'),'Offline revalidation must preserve the form');
globalThis.fetch = async () => Response.json({ role: 'admin', userId: user.id });
await act(async () => { browser.dispatchEvent(new browser.Event('online')); await tick(); });
assert.ok(app.el.textContent.includes('Sensitive workspace'));
await act(async () => { callback('SIGNED_OUT'); await tick(); });
assert.equal(navigation.at(-1), '/student/login'); assert.ok(!app.el.textContent.includes('Sensitive workspace')); await app.close();
console.log('PASS: client guard denies stale roles/anonymous access, preserves offline work, retries on reconnect, and clears access on sign-out');

let checks = 0;
globalThis.fetch = async () => { checks++; return Response.json({ role: 'admin', userId: user.id }); };
const stableProps = { ...props, children: React.createElement('div', null, React.createElement('textarea', { defaultValue: 'Initial feedback' }), React.createElement('input', { type: 'file' })) };
app = await mount(RoleGuard, stableProps);
const feedback = app.el.querySelector('textarea'); const fileInput = app.el.querySelector('input');
feedback.value = 'Unsaved tutor feedback';
Object.defineProperty(fileInput,'files',{value:[new browser.File(['%PDF-1.7'],'marked.pdf')],configurable:true});
await act(async () => {
  for (let i = 0; i < 5; i++) browser.dispatchEvent(new browser.Event('focus'));
  callback('SIGNED_IN', { user }); callback('TOKEN_REFRESHED', { user }); await tick();
});
assert.equal(checks,1,'Focus and same-user auth events must reuse the recent identity check');
assert.equal(app.el.querySelector('textarea'),feedback);assert.equal(feedback.value,'Unsaved tutor feedback');
assert.equal(app.el.querySelector('input'),fileInput);assert.equal(fileInput.files[0].name,'marked.pdf');
let resolveCheck;
globalThis.fetch = () => new Promise(resolve => { resolveCheck = resolve; });
await act(async () => { browser.dispatchEvent(new browser.Event('online')); await tick(); });
assert.equal(app.el.querySelector('textarea'),feedback,'Pending background verification must not remount the workspace');
await act(async () => { resolveCheck(Response.json({ role:'admin',userId:user.id })); await tick(); });
assert.equal(app.el.querySelector('input'),fileInput);await app.close();
console.log('PASS: file-picker focus, token refresh and pending checks preserve selected files, unsaved feedback and DOM identity without full-page loading');
await browser.happyDOM.close();

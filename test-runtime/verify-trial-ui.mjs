import assert from 'node:assert/strict';
import React, { act } from '../node_modules/react/index.js';
import { Window } from 'happy-dom';
import { loader } from './component-loader.mjs';

const browser = new Window({ url: 'http://localhost:3001/student/login' });
globalThis.window = browser;
for (const key of ['document','HTMLElement','HTMLInputElement','Event','MouseEvent','FormData','Node']) globalThis[key] = browser[key];
Object.defineProperty(globalThis, 'navigator', { value: browser.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('../node_modules/react-dom/client.js');
let signOutError = null, signOutCalls = 0;
const load = loader({
  'next/link': { __esModule: true, default: ({ children, href, ...props }) => React.createElement('a', { href, ...props }, children) },
  'next/script': { __esModule: true, default: () => null },
  '@/lib/supabase/client': { createClient: () => ({ auth: { signOut: async options => { assert.equal(options.scope, 'local'); signOutCalls++; return { error: signOutError }; } } }) },
});
const { StudentSignIn } = load('components/student-sign-in.tsx');
const { StudentMockDashboard } = load('components/student-mock-dashboard.tsx');
const { studentMockCards } = load('lib/student-mocks.ts');
const host = document.createElement('div'); document.body.append(host);
const root = createRoot(host);
const navigations = []; browser.location.assign = destination => navigations.push(destination);
const calls = []; let failure = true;
const previousFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  if (failure) throw new Error('Network interrupted');
  return Response.json({ received: true, redirect: '/dashboard' }, { status: 201 });
};
const click = async button => { assert.ok(button); await act(async () => button.click()); };
try {
  await act(async () => root.render(React.createElement(StudentSignIn, { loading: false, configured: true, error: null, onSignIn: async () => true })));
  await click([...host.querySelectorAll('button')].find(button => button.textContent === 'Get 1 Free Trial'));
  const trialForm = host.querySelector('[role="dialog"] form');
  assert.ok(trialForm); assert.equal(trialForm.parentElement.closest('form'), null, 'Trial form must not nest inside login form');
  assert.equal(trialForm.querySelector('input[type="password"]'), null, 'Trial must not request a password');
  for (const [name, value] of Object.entries({ full_name: 'Trial Candidate', email: 'trial@example.test', phone: '123456789', target_level: 'OCS' })) trialForm.elements.namedItem(name).value = value;
  await act(async () => trialForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.match(host.querySelector('[role="alert"]').textContent, /Network interrupted/);
  assert.equal(trialForm.elements.namedItem('full_name').value, 'Trial Candidate');
  assert.equal(trialForm.querySelector('fieldset').disabled, false, 'Network failure releases pending state');
  assert.equal(navigations.length, 0);
  failure = false;
  await act(async () => {
    trialForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    trialForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  assert.deepEqual(navigations, ['/dashboard']);
  assert.equal(calls.length, 2, 'Double submission sends only one request');
  assert.equal(calls[1].options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(calls[1].options.body), { full_name: 'Trial Candidate', email: 'trial@example.test', phone: '123456789', target_level: 'OCS' });
  console.log('PASS: real form opens without nested forms/password signup, preserves fields on network failure, retries safely and redirects to dashboard once');

  const exams = Array.from({ length: 5 }, (_, index) => ({ id: `mock-${index+1}`, name: `OCS Mock ${index+1}`, description: 'Published paper', status: 'published', level: 'OCS' }));
  const access = { assigned_level: 'OCS', access_type: 'trial', trial_exam_id: 'mock-1' };
  const papers = studentMockCards(exams, [], [], access);
  assert.equal(papers.length, 5); assert.equal(papers.filter(paper => paper.locked).length, 4);
  const props = { papers, submissions: [], reports: [], solutions: [], assignedLevel: 'OCS', isTrial: true };
  await act(async () => root.render(React.createElement(StudentMockDashboard, props)));
  assert.equal(host.querySelectorAll('a[href^="/exam/"]').length, 1);
  assert.equal(host.querySelector('a[href^="/exam/"]').getAttribute('href'), '/exam/mock-1');
  assert.equal(host.querySelectorAll('section').length, 5);
  const requestsBeforeTabs = calls.length;
  await click([...host.querySelectorAll('[role="tab"]')].find(button => button.textContent === 'MCS'));
  assert.equal(host.querySelectorAll('section').length, 0); assert.equal(browser.location.search, '?level=MCS');
  await click([...host.querySelectorAll('[role="tab"]')].find(button => button.textContent === 'OCS'));
  assert.equal(host.querySelectorAll('section').length, 5); assert.equal(calls.length, requestsBeforeTabs, 'Tabs make zero network calls');
  browser.confirm = () => false;
  const switchAccount = [...host.querySelectorAll('button')].find(button => button.textContent === 'Already enrolled? Sign in');
  await click(switchAccount); assert.equal(signOutCalls, 0, 'Cancelled switch preserves the guest');
  browser.confirm = () => true; signOutError = new Error('Offline');
  await click(switchAccount); assert.match(host.querySelector('[role="alert"]').textContent, /Unable to leave/);
  signOutError = null; browser.location.replace = destination => navigations.push(destination);
  await click(switchAccount); assert.equal(navigations.at(-1), '/student/login');
  const enrolled = studentMockCards(exams, [], [], { ...access, access_type: 'enrolled' });
  await act(async () => root.render(React.createElement(StudentMockDashboard, { ...props, papers: enrolled, isTrial: false })));
  assert.equal(host.querySelectorAll('a[href^="/exam/"]').length, 5);
  assert.equal(host.querySelector('[aria-label="Free trial access"]'), null);
  console.log('PASS: trial dashboard renders all five papers with exactly four locks; instant level tabs use no network; enrolled students retain all five start links');
} finally {
  await act(async () => root.unmount());
  globalThis.fetch = previousFetch; await browser.happyDOM.close();
}

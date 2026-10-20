import assert from 'node:assert/strict';
import React, { act } from '../node_modules/react/index.js';
import { Window } from 'happy-dom';
import { loader } from './component-loader.mjs';

const browser = new Window({ url: 'http://localhost:3001/student/login' });
globalThis.window = browser;
for (const key of ['document','HTMLElement','HTMLInputElement','HTMLSelectElement','Event','MouseEvent','FormData','Node','Element','MutationObserver','ResizeObserver','CustomEvent','DocumentFragment','NodeFilter']) globalThis[key] = browser[key];
globalThis.getComputedStyle = browser.getComputedStyle.bind(browser);
globalThis.requestAnimationFrame = browser.requestAnimationFrame.bind(browser);
globalThis.cancelAnimationFrame = browser.cancelAnimationFrame.bind(browser);
Object.defineProperty(globalThis, 'navigator', { value: browser.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('../node_modules/react-dom/client.js');
let signOutError = null, signOutCalls = 0;
const load = loader({
  'next/link': { __esModule: true, default: ({ children, href, ...props }) => React.createElement('a', { href, ...props }, children) },
  'next/script': { __esModule: true, default: () => null },
  'next/image': { __esModule: true, default: ({unoptimized, ...props}) => React.createElement('img', props) },
  'next/navigation': { useRouter: () => ({refresh() {}}) },
  '@/lib/supabase/client': { createClient: () => ({ auth: { signOut: async options => { assert.equal(options.scope, 'local'); signOutCalls++; return { error: signOutError }; } } }) },
});
const { StudentSignIn } = load('components/student-sign-in.tsx');
const { StudentMockDashboard } = load('components/student-mock-dashboard.tsx');
const { studentMockCards } = load('lib/student-mocks.ts');
const { LeadsTable } = load('components/dashboard/leads-table.tsx');
const { normalizeTrialContact } = load('lib/trial-contact.ts');
const { COUNTRIES, resolveCountry } = load('lib/countries.ts');
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
const change = async (input,value) => {
  const prototype=input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
};
try {
  assert.ok(COUNTRIES.length>240);assert.equal(resolveCountry('PK').name,'Pakistan');
  assert.equal(normalizeTrialContact('PK','PK','03001234567').phone,'+923001234567');
  assert.equal(normalizeTrialContact(undefined,'PK','03001234567').phone,'+923001234567');
  assert.equal(normalizeTrialContact('IT','IT','02 36618 300').phone,'+390236618300','Italian leading zero must be preserved');
  assert.equal(normalizeTrialContact('CA','US','202 555 0123').phone,'+12025550123','Shared calling codes work');
  assert.throws(()=>normalizeTrialContact('PK','PK','+447911123456'),/matching/);
  assert.throws(()=>normalizeTrialContact('ZZ','PK','03001234567'),/country/);
  await act(async () => root.render(React.createElement(StudentSignIn, { loading: false, configured: true, error: null, onSignIn: async () => true })));
  await click([...host.querySelectorAll('button')].find(button => button.textContent === 'Access Free Mock'));
  const trialForm = host.querySelector('[role="dialog"] form');
  assert.ok(trialForm); assert.equal(trialForm.parentElement.closest('form'), null, 'Trial form must not nest inside login form');
  assert.equal(host.querySelector('[role="dialog"] header img').getAttribute('src'),'/keystone-cima-logo.png');
  assert.ok(!trialForm.textContent.includes('Your dashboard opens immediately.'));
  assert.ok(!trialForm.textContent.includes('remaining mocks require enrolment.'));
  assert.ok(trialForm.textContent.includes('Keep your browser data to resume your trial.'),'Uncircled browser-session note remains');
  assert.equal(trialForm.querySelector('input[type="password"]'), null, 'Trial must not request a password');
  assert.ok(trialForm.textContent.includes('Case Study'));assert.ok(!trialForm.textContent.includes('Target Level'));
  assert.equal(trialForm.querySelector('[aria-label="Country"]'),null,'No separate Country field');
  assert.equal(trialForm.elements.namedItem('country'),null);
  await click(trialForm.querySelector('[aria-label="Choose phone country code"]'));
  const phoneSearch=document.querySelector('[aria-label="Search phone country codes"]');
  assert.ok(phoneSearch);
  await change(phoneSearch,'Pakistan');
  await click([...document.querySelectorAll('[cmdk-item]')].find(item=>item.textContent.includes('Pakistan')));
  assert.equal(trialForm.elements.namedItem('phone_country').value,'PK');
  assert.equal(document.querySelector('[aria-label="Search phone country codes"]'),null,'Selection closes the bounded popover');
  for (const [name, value] of Object.entries({ full_name: 'Trial Candidate', email: 'trial@example.test', phone: '03001234567', target_level: 'OCS' })) trialForm.elements.namedItem(name).value = value;
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
  assert.deepEqual(JSON.parse(calls[1].options.body), { full_name: 'Trial Candidate', email: 'trial@example.test', phone: '+923001234567', phone_country:'PK', target_level: 'OCS' });
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
  const lead={id:'contact-lead',full_name:'Contact Candidate',email:'contact@example.test',phone:'+447911123456',country:'PK',phone_country:'GB',country_code:'+44',target_level:'OCS',status:'new',admin_notes:'',created_at:'2026-10-19T00:00:00Z'};
  await act(async()=>root.render(React.createElement(LeadsTable,{leads:[lead,{...lead,id:'legacy-lead',full_name:'Legacy Candidate',country:null,phone_country:null,country_code:null}]})));
  assert.ok(host.textContent.includes('Phone country'));assert.ok(host.textContent.includes('United Kingdom'));assert.ok(host.textContent.includes('Phone code: +44'));assert.ok(host.textContent.includes('Not provided'));
  await change(host.querySelector('input'),'United Kingdom');assert.equal(host.querySelectorAll('tbody tr').length,1);assert.ok(host.textContent.includes('Contact Candidate'));assert.ok(!host.textContent.includes('Legacy Candidate'));
  console.log('PASS: searchable phone prefix, international parsing and admin phone-country search/display preserve legacy leads');
} finally {
  await act(async () => root.unmount());
  globalThis.fetch = previousFetch; await browser.happyDOM.close();
}

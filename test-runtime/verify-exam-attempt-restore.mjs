import assert from 'node:assert/strict';
import React, { act } from '../node_modules/react/index.js';
import { Window } from 'happy-dom';
import { loader } from './component-loader.mjs';

const browser = new Window({ url: 'http://localhost:3001/exam/local-mock' });
globalThis.window = browser;
globalThis.self = browser;
for (const key of [
  'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Event', 'MouseEvent',
  'PointerEvent', 'CustomEvent', 'Node', 'NodeFilter', 'MutationObserver', 'ResizeObserver',
  'Element', 'DocumentFragment', 'DOMParser',
]) {
  globalThis[key] = browser[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = browser.requestAnimationFrame.bind(browser);
globalThis.cancelAnimationFrame = browser.cancelAnimationFrame.bind(browser);
globalThis.getComputedStyle = browser.getComputedStyle.bind(browser);
Object.defineProperty(globalThis, 'navigator', { value: browser.navigator, configurable: true });

const { createRoot } = await import('../node_modules/react-dom/client.js');
const student = {
  user: { id: 'local-student' },
  role: 'student',
  candidateName: 'Local Test Student',
  loading: false,
  error: null,
  configured: true,
};
const examId = 'local-mock';
const legacyKey = `keystone-cima-exam-ui-v1-${examId}-${student.user.id}`;
const sessions = [];
const timerWrites = [];
const navigations = [];
let lookupError = null;
browser.location.assign = url => navigations.push(url);

function examSessionQuery() {
  const filters = [];
  let update;
  let isActiveLookup = false;
  const read = async () => {
    if (isActiveLookup && lookupError) return { data: null, error: { message: lookupError } };
    const session = sessions.find(row => filters.every(matches => matches(row)));
    if (session && update) Object.assign(session, update);
    return { data: session ? structuredClone(session) : null, error: null };
  };
  return {
    select() { return this; },
    eq(column, value) { filters.push(row => row[column] === value); return this; },
    in(column, values) {
      isActiveLookup = column === 'status' && values.includes('in_progress');
      filters.push(row => values.includes(row[column]));
      return this;
    },
    order() { return this; },
    limit() { return this; },
    insert(values) {
      const id = `new-attempt-${sessions.length + 1}`;
      sessions.push({ ...values, id, active_question_id: null });
      filters.push(row => row.id === id);
      return this;
    },
    update(values) { update = values; return this; },
    maybeSingle: read,
    single: read,
  };
}

const client = {
  auth: {
    getUser: async () => ({ data: { user: student.user }, error: null }),
    refreshSession: async () => ({ error: null }),
  },
  from(table) {
    if (table === 'exam_sessions') return examSessionQuery();
    if (table === 'profiles') {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: { id: student.user.id }, error: null }),
      };
    }
    assert.equal(table, 'exam_answers');
    return { select() { return this; }, eq: async () => ({ data: [], error: null }) };
  },
  async rpc(name, { p_session_id, p_question_id, p_remaining_seconds }) {
    assert.equal(name, 'sync_question_timer');
    const session = sessions.find(row => row.id === p_session_id);
    assert.equal(session?.status, 'in_progress');
    timerWrites.push({ sessionId: p_session_id, questionId: p_question_id });
    session.active_question_id = p_question_id;
    session.question_timers[p_question_id] = {
      remaining_seconds: p_remaining_seconds,
      synced_at: new Date().toISOString(),
    };
    return { error: null };
  },
};

globalThis.fetch = async url => {
  assert.equal(url, '/api/exam/answers');
  return new Response('{"saved":true}');
};

const load = loader({
  '@/hooks/useStudentAuth': { useStudentAuth: () => student },
  '@/lib/supabase/client': { createClient: () => client, isSupabaseConfigured: true },
});
const { default: ExamRuntime } = load('components/exam-runtime.tsx');
const { questionsData } = load('lib/exam-data.ts');
const initialQuestions = questionsData.map(question => ({ ...question, timeMinutes: 45 }));

const host = document.createElement('div');
document.body.append(host);
let root;

async function render(props = {}) {
  if (root) await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(React.createElement(ExamRuntime, {
    examId,
    examLevel: 'MCS',
    initialQuestions,
    ...props,
  })));
}

async function click(element) {
  assert.ok(element, 'Expected the control to be visible');
  await act(async () => element.click());
}

function button(scope, label) {
  return [...scope.querySelectorAll('button')].find(control => control.textContent.trim() === label);
}

function showLegacyPosition(index) {
  browser.localStorage.setItem(legacyKey, JSON.stringify({
    flow: 'exam', questionIndex: index, screen: 'prompt',
  }));
}

try {
  showLegacyPosition(1);
  browser.localStorage.setItem(`keystone-cima-exam-ui-v2-${examId}-${student.user.id}`, JSON.stringify({
    sessionId: 'previous-attempt', questionIndex: 1, screen: 'answer',
  }));
  browser.localStorage.setItem(`keystone-cima-answer-drafts-v2:${student.user.id}-${examId}`, JSON.stringify({
    sessionId: 'previous-attempt', answers: { 'section-1': 'Answer from the previous attempt' },
  }));
  await render();
  assert.equal(sessions.length, 0, 'A cached screen must not start an attempt');
  await click(host.querySelector('#welcome-next-button'));
  await click(host.querySelector('#structure-next-button'));
  assert.match(host.textContent, /Question 1 of/);
  assert.equal(sessions.length, 1);
  assert.equal(timerWrites[0]?.questionId, 'section-1');
  assert.ok(timerWrites.every(write => write.questionId === 'section-1'));
  await click([...host.querySelectorAll('footer button')].find(control => control.textContent.trim().startsWith('Next')));
  assert.doesNotMatch(host.querySelector('.tiptap').textContent, /Answer from the previous attempt/);
  console.log('PASS: a new attempt starts and syncs at Question 1 with stale Question 2 browser state');

  const [attempt] = sessions;
  attempt.active_question_id = 'section-2';
  attempt.question_timers['section-2'] = {
    remaining_seconds: 1200,
    synced_at: new Date().toISOString(),
  };
  browser.localStorage.clear();
  showLegacyPosition(0);
  timerWrites.length = 0;
  await render({ resumeAttempt: true });
  assert.match(host.textContent, /Question 2 of/);
  const timer = host.textContent.match(/TIME REMAINING\s*(\d+):(\d{2}):(\d{2})/);
  assert.ok(timer, 'Expected a visible countdown');
  const remaining = Number(timer[1]) * 3600 + Number(timer[2]) * 60 + Number(timer[3]);
  assert.ok(remaining > 1190 && remaining <= 1200, 'Resuming preserves the remaining time');
  assert.equal(sessions.length, 1);
  assert.ok(timerWrites.every(write => write.questionId === 'section-2'));
  console.log('PASS: an active attempt restores its saved question and remaining time');

  await click([...host.querySelectorAll('footer button')].find(button => button.textContent.trim().startsWith('Next')));
  assert.ok(host.querySelector('.tiptap'), 'Expected the answer editor after advancing from the question prompt');
  await render({ resumeAttempt: true });
  assert.ok(host.querySelector('.tiptap'), 'Reload restores the screen saved for this attempt');
  assert.match(host.textContent, /Question 2 of/);

  await click(button(host, 'Exit to Dashboard'));
  const dialog = document.querySelector('[role="alertdialog"]');
  assert.ok(dialog, 'Expected the exam exit confirmation');
  await click(button(dialog, 'Submit & Exit'));
  assert.equal(attempt.status, 'completed');
  assert.deepEqual(navigations, ['/dashboard']);

  showLegacyPosition(1);
  timerWrites.length = 0;
  await render({ resumeAttempt: true });
  assert.equal(sessions.length, 1, 'Reopening the submitted attempt must not create an attempt');
  assert.doesNotMatch(host.textContent, /Question \d+ of/);
  assert.equal(timerWrites.length, 0);
  console.log('PASS: Submit & Exit closes the attempt and reopening leaves it locked');

  sessions.length = 0;
  browser.localStorage.clear();
  await render();
  await click(host.querySelector('#welcome-next-button'));
  lookupError = 'Test connection error';
  await click(host.querySelector('#structure-next-button'));
  assert.match(host.querySelector('[role="alert"]').textContent, /Test connection error/);
  assert.doesNotMatch(host.textContent, /TIME REMAINING|Question \d+ of/);
  assert.equal(host.querySelector('.tiptap'), null);
  assert.equal(sessions.length, 0);
  assert.equal(timerWrites.length, 0);
  lookupError = null;
  await click(button(host, 'Retry'));
  assert.match(host.textContent, /Question 1 of/);
  assert.equal(sessions.length, 1);
  assert.equal(timerWrites[0]?.questionId, 'section-1');
  console.log('PASS: connection failure blocks the exam and the timer until the start is retried successfully');

  sessions.length = 0;
  timerWrites.length = 0;
  showLegacyPosition(1);
  await render({ isTrial: true });
  await click(host.querySelector('#welcome-next-button'));
  await click(host.querySelector('#structure-next-button'));
  assert.equal(sessions.length, 0);
  await click(button(document.querySelector('[role="alertdialog"]'), 'Go back'));
  assert.equal(sessions.length, 0);
  await click(host.querySelector('#structure-next-button'));
  await click(button(document.querySelector('[role="alertdialog"]'), 'Go ahead'));
  assert.match(host.textContent, /Question 1 of/);
  assert.equal(sessions.length, 1);
  assert.equal(timerWrites[0]?.questionId, 'section-1');
  console.log('PASS: a new free trial still requires confirmation and starts at Question 1');
} finally {
  if (root) await act(async () => root.unmount());
  await browser.happyDOM.close();
}

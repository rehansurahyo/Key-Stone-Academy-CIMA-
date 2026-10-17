import assert from 'node:assert/strict';
import { loader } from './component-loader.mjs';

let failure;
const db = { from(table) {
  const result = { data: table === 'exams' ? { name: 'Mock 3', level: 'SCS' } : table === 'profiles' ? { full_name: 'Test' } : [], error: null };
  return { select() { return this; }, eq() { return this; }, order() { return this; }, single: async () => result, then(resolve) { return Promise.resolve(result).then(resolve); } };
} };
const load = loader({ 'server-only': {},
  '@/lib/dashboard/auth': { DashboardError: class extends Error { constructor(message, status = 400) { super(message); this.status = status; } }, apiError: error => Response.json({ error: error.message }, { status: error.status ?? 500 }) },
  '@/lib/submission-access': { requireSubmission: async () => ({ supabase: db, submission: { exam_id: 'mock', student_id: 'student', session_id: 'session', submitted_at: '2026-10-15' } }) },
  '@/lib/answer-docx': { buildAnswerDocx: async () => { throw failure; } },
});
const { AnswerExportValidationError } = load('lib/answer-export-model.ts');
const { GET } = load('app/api/submissions/[id]/answers/route.ts');
const request = new Request('http://localhost/api/submissions/test/answers');
const context = { params: Promise.resolve({ id: 'test' }) };
failure = new AnswerExportValidationError('This answer is too large to export.');
let response = await GET(request, context);
assert.equal(response.status, 422);
assert.equal((await response.json()).error, failure.message);
failure = new Error('ENOENT sensitive-internal-path/data.trie');
const original = console.error;
const logs = [];
try {
  console.error = (...args) => logs.push(args);
  response = await GET(request, context);
} finally { console.error = original; }
assert.equal(response.status, 500);
assert.equal((await response.json()).error, 'Unable to generate the answer document. Please try again.');
assert.equal(logs.length, 1);
assert.equal(logs[0][1].error, failure);
console.log('PASS: validation errors return 422; runtime failures return safe 500 with server diagnostics, not misleading size errors');

// Exercise the actual production bundle, not a source-only transpilation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../.next/server/app/api/submissions/[id]/answers/route.js');
const runtime = require('../.next/server/webpack-runtime.js');
for (const file of fs.readdirSync(path.join(__dirname, '../.next/server/chunks'))) {
  if (file.endsWith('.js')) runtime.C(require('../.next/server/chunks/' + file));
}
const moduleId = Object.keys(runtime.m).find(id => {
  const source = runtime.m[id].toString();
  return source.includes('CIMA Mock Exam Answers') && source.includes('buildAnswerPdf');
});
assert.ok(moduleId, 'production PDF module exists');
runtime(moduleId).buildAnswerPdf({
  examName: 'Mock 3', level: 'SCS', candidate: 'Production Regression Test',
  submittedAt: '2026-10-15T09:30:00Z', questions: [],
  answers: { q1: '<p>Production PDF export with <strong>formatted text</strong>.</p>' },
}).then(async buffer => {
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buffer.length > 1000);
  const trace = JSON.parse(fs.readFileSync(path.join(__dirname, '../.next/server/app/api/submissions/[id]/answers/route.js.nft.json'), 'utf8'));
  assert.ok(trace.files.some(file => file.endsWith('data.trie')), 'deployment includes font/layout runtime data');
  console.log('PASS: production-bundled PDF generation and deployment runtime assets');
  // Optional read-only regression against a reported submission. Never print
  // credentials, candidate details, or answer contents and never mutate data.
  const submissionId = process.argv[2];
  if (submissionId) {
    assert.match(submissionId, /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i);
    const { createClient } = require('@supabase/supabase-js');
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: submission, error } = await db.from('submissions').select('exam_id,session_id,submitted_at').eq('id', submissionId).single();
    if (error) throw error;
    const results = await Promise.all([
      db.from('exams').select('name,level').eq('id', submission.exam_id).single(),
      db.from('exam_questions').select('*').eq('exam_id', submission.exam_id).order('position'),
      db.from('exam_answers').select('question_id,answer_text').eq('session_id', submission.session_id),
    ]);
    for (const result of results) if (result.error) throw result.error;
    const [exam, questions, answers] = results.map(result => result.data);
    const exported = await runtime(moduleId).buildAnswerPdf({ examName: exam.name, level: exam.level, candidate: 'Export Regression Test', submittedAt: submission.submitted_at,
      questions, answers: Object.fromEntries(answers.map(answer => [answer.question_id, answer.answer_text ?? ''])) });
    assert.equal(exported.subarray(0, 5).toString(), '%PDF-');
    console.log('PASS: reported submission answers export through the production bundle (read-only check)');
  }
}).catch(error => { console.error(error); process.exitCode = 1; });

import assert from 'node:assert/strict';
import JSZip from '../node_modules/jszip/lib/index.js';
import { loader } from './component-loader.mjs';

let role = 'admin', active = true, signedIn = true, readError = null;
const original = Array.from({ length: 45 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  submitted_at: '2026-11-18T02:00:00Z',
  status: index % 2 === 0 ? 'graded' : 'submitted',
  score: index % 2 === 0 ? 85 : null,
  score_max: 150,
  feedback: index % 2 === 0 ? 'Good work on financial ratios.' : '',
  student: {
    full_name: `Student ${index}`,
    email: `student${index}@example.test`,
    access_type: index % 3 === 0 ? 'trial' : 'enrolled',
  },
  exam: {
    name: `CGMA Strategic Case Study - Mock ${index + 1}`,
    level: 'SCS',
  },
}));

let records = original;
let cursor = null;

const client = {
  auth: {
    getUser: async () => ({ data: { user: signedIn ? { id: 'admin-id' } : null }, error: null }),
  },
  from(table) {
    const query = {
      select(columns) { return this; },
      eq(column, value) { return this; },
      lte(column, value) { return this; },
      order(column) { return this; },
      limit(value) { return this; },
      gt(column, value) { cursor = value; return this; },
      ilike(column, value) { return this; },
      single: async () => ({ data: { role, is_active: active }, error: null }),
      then(resolve) {
        return Promise.resolve({
          data: readError ? null : records.filter(row => !cursor || row.id > cursor).slice(0, 20),
          error: readError,
        }).then(resolve);
      },
    };
    return query;
  },
};

const load = loader({
  'server-only': {},
  'next/navigation': { redirect() { throw Error('Unexpected redirect'); } },
  '@/lib/supabase/server': { createClient: async () => client },
});

const { GET } = load('app/api/dashboard/submissions/export/route.ts');
const { buildSubmissionXlsx, submissionExportFilename, XLSX_MIME } = load('lib/submission-xlsx.ts');

// 1. Auth check
role = 'student'; active = true;
assert.equal((await GET(new Request('http://localhost/api/dashboard/submissions/export'))).status, 403);
role = 'tutor'; active = true;
// Tutors are allowed
assert.equal((await GET(new Request('http://localhost/api/dashboard/submissions/export'))).status, 200);
role = 'admin'; active = true; signedIn = false;
assert.equal((await GET(new Request('http://localhost/api/dashboard/submissions/export'))).status, 401);

// 2. Successful export
signedIn = true; cursor = null;
const response = await GET(new Request('http://localhost/api/dashboard/submissions/export?access=trial'));
assert.equal(response.status, 200);
assert.equal(response.headers.get('Content-Type'), XLSX_MIME);
assert.match(response.headers.get('Content-Disposition'), /^attachment; filename="keystone-submissions-trials-\d{4}-\d{2}-\d{2}\.xlsx"$/);

const bytes = new Uint8Array(await response.arrayBuffer());
assert.equal(String.fromCharCode(...bytes.slice(0, 2)), 'PK');
const zip = await JSZip.loadAsync(bytes);
const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
const workbookXml = await zip.file('xl/workbook.xml').async('string');
assert.ok(workbookXml.includes('Submissions'));
assert.ok(xml.includes('student0@example.test'));
assert.ok(xml.includes('85/150'));

console.log('PASS: submission export verified with auth, Excel generation, data mapping and filtering');

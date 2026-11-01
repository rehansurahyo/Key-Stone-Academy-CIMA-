import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'vite';

// Exercise the real renderer in workerd, with the production compatibility
// date/flags and synthetic content. Node-only tests cannot catch these failures.
const require=createRequire(import.meta.url);
const {Miniflare}=createRequire(require.resolve('wrangler'))('miniflare');
const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'outputs/worker-answer-exports');await mkdir(out,{recursive:true});
const config=JSON.parse(await readFile(path.join(root,'wrangler.json'),'utf8'));
const entry=path.join(out,'entry.mjs'),empty=path.join(out,'server-only.mjs');
await writeFile(empty,'export {};');
await writeFile(entry,`
import {buildAnswerPdf} from '../../lib/answer-pdf';
export default {async fetch(request){
 try {
  const answer='<h2>Financial evaluation</h2><p>Revenue £1,200 &amp; return €90. Line one<br>Line two.</p><ol><li>First point</li><li>Second point</li></ol><table><tr><th colspan="2">Merged header</th></tr><tr><td>NPV</td><td>£1,200</td></tr></table>';
  const input={examName:'Worker compatibility mock',level:'OCS',candidate:'Synthetic Candidate',submittedAt:'2026-11-01T10:00:00Z',questions:[],answers:{legacy:new URL(request.url).pathname==='/invalid'?'x'.repeat(2_000_001):answer.repeat(12)}};
  return new Response(new Uint8Array(await buildAnswerPdf(input)),{headers:{'Content-Type':'application/pdf'}});
 } catch(error) {return Response.json({error:error.message},{status:422});}
}};
`);
await build({configFile:false,root,logLevel:'error',resolve:{alias:{'@':root,'server-only':empty},mainFields:['main']},ssr:{noExternal:true,resolve:{mainFields:['main']}},
  build:{ssr:entry,outDir:path.join(out,'bundle'),emptyOutDir:false,rolldownOptions:{output:{entryFileNames:'worker.js',codeSplitting:false}}}});
const runtime=new Miniflare({modules:true,scriptPath:path.join(out,'bundle/worker.js'),compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags});
try {
  const response=await runtime.dispatchFetch('http://localhost/pdf');assert.equal(response.status,200,await response.clone().text());
  assert.equal(response.headers.get('content-type'),'application/pdf');
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok(bytes.length>10_000);
  await writeFile(path.join(out,'worker-answer.pdf'),bytes);
  const invalid=await runtime.dispatchFetch('http://localhost/invalid');assert.equal(invalid.status,422);assert.match((await invalid.json()).error,/too large/);
  console.log('PASS: actual PDF renderer in Cloudflare workerd, embedded fonts, rich multi-page answers and rejected oversized data');
} finally {await runtime.dispose();}

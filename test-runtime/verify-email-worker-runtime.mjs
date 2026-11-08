import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const require=createRequire(import.meta.url),{Miniflare}=createRequire(require.resolve('wrangler'))('miniflare');
const root=fileURLToPath(new URL('../',import.meta.url)),config=JSON.parse(await readFile(path.join(root,'wrangler.json'),'utf8'));
let outbound=0;
// Exact Wrangler dry-run bundle. Only synthetic bindings; external traffic is
// intercepted locally. This test cannot deliver email or mutate Supabase.
const runtime=new Miniflare({modules:[{type:'ESModule',path:path.join(root,'outputs/email-worker-final-validation/email-worker.js')}],compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,
  bindings:{EMAIL_AUTOMATION_ENABLED:'false',EMAIL_DISPATCH_SECRET:'s'.repeat(48)},serviceBindings:{ASSETS:async()=>new Response('Not found',{status:404})},outboundService:async()=>{outbound++;return Response.json({error:'External requests disabled for this local test'},{status:503});}});
try{
  let response=await runtime.dispatchFetch('https://student.example.test/api/internal/email-dispatch',{method:'POST'});assert.equal(response.status,401);
  response=await runtime.dispatchFetch('https://student.example.test/api/internal/email-dispatch',{method:'POST',headers:{Authorization:'Bearer '+'s'.repeat(48)}});assert.equal(response.status,200);assert.deepEqual(await response.json(),{enabled:false});
  response=await runtime.dispatchFetch('https://student.example.test/set-password');assert.equal(response.status,200);assert.match(await response.text(),/Set your student password/);assert.equal(outbound,0);
  console.log('PASS: exact packaged Worker in local workerd serves password page, rejects unauthenticated dispatch and keeps disabled automation inert with zero external requests');
}finally{await runtime.dispose();}

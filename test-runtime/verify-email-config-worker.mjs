import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loader} from './component-loader.mjs';

const names=['EMAIL_AUTOMATION_ENABLED','BREVO_API_KEY','EMAIL_SENDER','EMAIL_REPLY_TO','EMAIL_STUDENT_ORIGIN','EMAIL_DISPATCH_SECRET','EMAIL_LINK_ENCRYPTION_KEY'];
const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
try{
  for(const name of names)delete process.env[name];
  const load=loader({'server-only':{},'@opennextjs/cloudflare':{getCloudflareContext:()=>({env:{}})}});
  const {emailConfig}=load('lib/email/config.ts');
  await assert.rejects(emailConfig,/disabled/);
  Object.assign(process.env,{EMAIL_AUTOMATION_ENABLED:'true',BREVO_API_KEY:'synthetic-key',EMAIL_SENDER:'info@example.invalid',EMAIL_REPLY_TO:'reply@example.invalid',EMAIL_STUDENT_ORIGIN:'https://student.example.test',EMAIL_DISPATCH_SECRET:'s'.repeat(48),EMAIL_LINK_ENCRYPTION_KEY:'ab'.repeat(32)});
  assert.equal((await emailConfig()).sender,'info@example.invalid');
  for(const[key,value]of[['EMAIL_LINK_ENCRYPTION_KEY','short'],['EMAIL_SENDER','invalid'],['EMAIL_STUDENT_ORIGIN','http://student.example.test'],['EMAIL_STUDENT_ORIGIN','https://student.example.test/evil'],['EMAIL_DISPATCH_SECRET','short']]){const old=process.env[key];process.env[key]=value;await assert.rejects(emailConfig,/incomplete/);process.env[key]=old;}
  let adminCalls=0,dispatchCalls=0;
  let migrationReady=true;
  const routeLoad=loader({'server-only':{},'@opennextjs/cloudflare':{getCloudflareContext:()=>({env:{}})},'@/lib/supabase/admin':{createAdminClient:async()=>{adminCalls++;return{from:()=>({select:()=>({limit:async()=>({error:migrationReady?null:{code:'missing'}})})})};}},'@/lib/email/dispatch':{dispatchEmails:async()=>{dispatchCalls++;return{accepted:0};}}});
  const {POST,GET}=routeLoad('app/api/internal/email-dispatch/route.ts');
  const request=authorization=>new Request('https://student.example.test/api/internal/email-dispatch',{method:'POST',headers:authorization?{Authorization:authorization}:{}});
  for(const value of [null,'Bearer wrong','Bearer '+'é'.repeat(48)])assert.equal((await POST(request(value))).status,401);
  assert.equal(adminCalls,0);process.env.EMAIL_AUTOMATION_ENABLED='false';assert.deepEqual(await(await POST(request('Bearer '+process.env.EMAIL_DISPATCH_SECRET))).json(),{enabled:false});assert.equal(adminCalls,0);
  process.env.EMAIL_AUTOMATION_ENABLED='true';assert.equal((await POST(request('Bearer '+process.env.EMAIL_DISPATCH_SECRET))).status,200);assert.equal(adminCalls,1);assert.equal(dispatchCalls,1);
  assert.equal((await GET(request(null))).status,401);
  process.env.EMAIL_AUTOMATION_ENABLED='false';let preflight=await GET(request('Bearer '+process.env.EMAIL_DISPATCH_SECRET));assert.deepEqual(await preflight.json(),{enabled:false,configuration_ready:true,migration_ready:true});assert.equal(dispatchCalls,1);
  migrationReady=false;preflight=await GET(request('Bearer '+process.env.EMAIL_DISPATCH_SECRET));assert.deepEqual(await preflight.json(),{enabled:false,configuration_ready:true,migration_ready:false});assert.equal(dispatchCalls,1);
  delete process.env.BREVO_API_KEY;preflight=await GET(request('Bearer '+process.env.EMAIL_DISPATCH_SECRET));assert.deepEqual(await preflight.json(),{enabled:false,configuration_ready:false,migration_ready:false});process.env.BREVO_API_KEY='synthetic-key';
  const calls=[];
  globalThis.__emailWorkerFixture={fetch:async(request,env,context)=>{calls.push({request,env,context});return Response.json({accepted:0});}};
  const source=(await readFile(new URL('../email-worker.js',import.meta.url),'utf8')).replace('import handler from "./.open-next/worker.js";','const handler=globalThis.__emailWorkerFixture;');
  const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  assert.equal(worker.fetch,globalThis.__emailWorkerFixture.fetch);await worker.scheduled({}, {}, {});assert.equal(calls.length,0);
  await assert.rejects(()=>worker.scheduled({}, {EMAIL_AUTOMATION_ENABLED:'true'},{}),/configuration/);
  const env={EMAIL_AUTOMATION_ENABLED:'true',EMAIL_DISPATCH_SECRET:'x'.repeat(48)},context={};await worker.scheduled({},env,context);
  assert.equal(calls.length,1);assert.equal(calls[0].request.method,'POST');assert.equal(calls[0].request.headers.get('authorization'),'Bearer '+env.EMAIL_DISPATCH_SECRET);assert.equal(new URL(calls[0].request.url).pathname,'/api/internal/email-dispatch');assert.equal(calls[0].env,env);assert.equal(calls[0].context,context);
  const config=JSON.parse(await readFile(new URL('../wrangler.json',import.meta.url),'utf8'));assert.equal(config.main,'email-worker.js');assert.deepEqual(config.triggers.crons,['* * * * *']);
  assert.equal(config.vars.EMAIL_AUTOMATION_ENABLED,'true','Approved production rollout enables the configured email worker');
  console.log('PASS: disabled-by-default config, sender/origin/encryption validation, protected dispatch including malformed bearer values and Cloudflare scheduled dispatch without any real requests');
}finally{for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}delete globalThis.__emailWorkerFixture;}

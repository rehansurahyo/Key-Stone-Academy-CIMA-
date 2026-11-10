import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const require=createRequire(import.meta.url);
const workerRequire=createRequire(require.resolve('wrangler'));
const {build}=workerRequire('esbuild'),{Miniflare}=workerRequire('miniflare');
const root=fileURLToPath(new URL('../',import.meta.url));
const config=JSON.parse(await readFile(path.join(root,'wrangler.json'),'utf8'));
const entry=`
import {dispatchEmails} from './lib/email/dispatch.ts';
// Match OpenNext's cache-option compatibility wrapper; use actual workerd fetch.
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{if(init)delete init.cache;return originalFetch(input,init);};
export default {async fetch(){
  let claimed=false;
  const row={id:'00000000-0000-4000-8000-000000001109',kind:'trial_welcome',
    user_id:'00000000-0000-4000-8000-000000001108',recipient:'synthetic@example.invalid',
    full_name:'Synthetic Learner',level:'OCS',generation:1,claim_token:'test-lease',state:'pending'};
  const admin={rpc:async(name,args)=>{
    if(name==='claim_portal_email'){if(claimed)return{data:[],error:null};claimed=true;return{data:[row],error:null};}
    if(name==='prepare_portal_email')return{data:true,error:null};
    if(name==='finish_portal_email'){row.state=args.p_state;row.error_code=args.p_error_code;return{data:true,error:null};}
    throw new Error('Unexpected RPC');
  },from(){return{select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{role:'student',is_active:true,access_type:'trial'},error:null})};}};
  const totals=await dispatchEmails(admin,{apiKey:'synthetic-key',sender:'info@example.invalid',
    replyTo:'info@example.invalid',origin:'https://student.example.test',encryptionKey:'ab'.repeat(32)});
  return Response.json({totals,state:row.state,error_code:row.error_code});
}};`;

for(const scenario of ['unsupported-legacy-mode','accepted','redirect-rejected','provider-rejected']){
  const bundled=await build({stdin:{contents:entry,resolveDir:root,sourcefile:'email-transport-fixture.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',logLevel:'silent',
    plugins:[{name:'local-fixtures-only',setup(builder){
      builder.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'fixture'}));
      builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export {};',loader:'js'}));
      if(scenario==='unsupported-legacy-mode')builder.onLoad({filter:/lib[\\/]email[\\/]dispatch\.ts$/},async(args)=>({contents:(await readFile(args.path,'utf8')).replace('redirect: "manual"','redirect: "error"'),loader:'ts'}));
    }}]});
  let outbound=0;
  const runtime=new Miniflare({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,
    outboundService:async request=>{
      outbound++;
      assert.equal(request.url,'https://api.brevo.com/v3/smtp/email');
      assert.equal(request.method,'POST');assert.equal(request.headers.get('api-key'),'synthetic-key');
      const message=await request.json();assert.equal(message.to.length,1);assert.equal(message.to[0].email,'synthetic@example.invalid');
      if(scenario==='redirect-rejected')return new Response(null,{status:302,headers:{Location:'https://other.example.invalid/never-follow'}});
      if(scenario==='provider-rejected')return Response.json({code:'unauthorized'},{status:401});
      return Response.json({messageId:'synthetic-provider-id'},{status:201});
    }});
  try{
    const response=await runtime.dispatchFetch('https://local.example.invalid/');assert.equal(response.status,200);
    const result=await response.json();
    if(scenario==='unsupported-legacy-mode'){
      assert.equal(outbound,0,'Unsupported error redirect fails before any provider request');
      assert.equal(result.state,'pending');assert.equal(result.error_code,'network_uncertain');
    }else{
      assert.equal(outbound,1,'Manual redirects never forward the API key to another host');
      assert.equal(result.state,scenario==='accepted'?'sent':'failed');
      assert.equal(result.error_code,scenario==='accepted'?null:scenario==='redirect-rejected'?'provider_302':'provider_401');
    }
  }finally{await runtime.dispose();}
}
console.log('PASS: actual Cloudflare workerd reproduces the old zero-request failure; manual redirect mode sends once, rejects redirects without leaking the API key and records provider rejection');

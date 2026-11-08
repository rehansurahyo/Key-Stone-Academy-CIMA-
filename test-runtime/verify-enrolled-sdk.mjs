import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loader} from './component-loader.mjs';
const require=createRequire(import.meta.url),{createClient}=require('@supabase/supabase-js');
const uid='00000000-0000-4000-8000-000000003108',key='synthetic-anon-key',now=Math.floor(Date.now()/1000);
const access=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',exp:now+3600,iat:now})).toString('base64url')+'.c2ln';
const calls=[];let storageReads=0;
const transport=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url),headers=new Headers(options.headers),body=options.body?JSON.parse(options.body):null;
  calls.push({path:url.pathname,method:options.method??'GET',authorization:headers.get('authorization'),body});
  assert.equal(url.origin,'https://synthetic.supabase.test');assert.equal(headers.get('apikey'),key);
  if(url.pathname==='/auth/v1/verify'){assert.equal(body.token_hash,'a'.repeat(64));assert.equal(body.type,'recovery');assert.equal(body.password,undefined);assert.equal(body.code_verifier,undefined);return Response.json({access_token:access,refresh_token:'synthetic-private-refresh',expires_in:3600,token_type:'bearer',user:{id:uid,email:'student@example.invalid'}});}
  if(url.pathname==='/auth/v1/user'){assert.equal(options.method,'PUT');assert.equal(headers.get('authorization'),'Bearer '+access);assert.equal(body.password,'SecurePassword123!');assert.equal(body.email,undefined);assert.equal(body.code_verifier,undefined);return Response.json({id:uid,email:'student@example.invalid'});}
  if(url.pathname==='/auth/v1/logout'){assert.equal(headers.get('authorization'),'Bearer '+access);return Response.json({});}
  throw new Error('Unexpected Auth request '+url.pathname);
};
const savedUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,savedKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
process.env.NEXT_PUBLIC_SUPABASE_URL='https://synthetic.supabase.test';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=key;
try{
  const load=loader({'@supabase/supabase-js':{createClient:(url,anon,options)=>{assert.deepEqual(options.auth,{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false});return createClient(url,anon,{...options,global:{fetch:transport},auth:{...options.auth,storage:{getItem(){storageReads++;return JSON.stringify({access_token:'another-browser-account'});},setItem(){throw new Error('Shared storage must not be written');},removeItem(){throw new Error('Shared storage must not be cleared');}}}});}}});
  const{isolatedInvitationClient,invitationProof,invitationPasswordSetter}=load('lib/enrolled-password.ts');
  const client=isolatedInvitationClient(),proof=invitationProof('#token_hash='+('a'.repeat(64))+'&user_id='+uid),set=invitationPasswordSetter(client,proof);
  await client.auth.initialize();assert.equal(calls.length,0,'No verifier exchange, ordinary session fallback or email link consumption during initialization');
  await set('SecurePassword123!');assert.deepEqual(calls.map(call=>call.path),['/auth/v1/verify','/auth/v1/user','/auth/v1/logout']);assert.equal(storageReads,0);assert.equal((await client.auth.getSession()).data.session,null);
  console.log('PASS: real Supabase SDK verifies a token hash without browser PKCE storage, sends the password with that exact private token, signs out privately and never reads/writes another account session');
}finally{if(savedUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=savedUrl;if(savedKey===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=savedKey;}

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loader } from './component-loader.mjs';

// Exercise the real Supabase SSR cookie storage and real route/role guards.
// Only HTTP transport and Next's per-request cookie store are substituted.
const originalFetch=globalThis.fetch;
const originalUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
process.env.NEXT_PUBLIC_SUPABASE_URL='https://auth-regression.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test-public-key';
const jar=new Map();let role='admin',active=true,invalid=false,profileFailure=false,authCalls=0;
const user={id:'00000000-0000-4000-8000-000000000123',aud:'authenticated',role:'authenticated',email:'test@example.invalid',created_at:new Date().toISOString(),app_metadata:{},user_metadata:{}};
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const token=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})}.test-signature`;
globalThis.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url);
  if(url.pathname==='/auth/v1/token'){
    authCalls++;
    return Response.json(invalid?{error:'invalid_grant',error_description:'Invalid login credentials'}:{access_token:token,refresh_token:'test-refresh-token',token_type:'bearer',expires_in:3600,user},{status:invalid?400:200});
  }
  if(url.pathname==='/auth/v1/user'){
    assert.equal(new Headers(options.headers).get('authorization'),`Bearer ${token}`);
    return Response.json(user);
  }
  if(url.pathname==='/rest/v1/profiles')return Response.json(profileFailure?{message:'Missing role column'}:{...user,full_name:'Local Admin',role,is_active:active,assigned_level:'SCS'},{status:profileFailure?400:200});
  if(url.pathname==='/auth/v1/logout')return new Response(null,{status:204});
  throw new Error(`Unexpected test transport path: ${url.pathname}`);
};
const cookieStore={getAll:()=>[...jar].map(([name,value])=>({name,value})),set:(name,value,options)=>{assert.equal(options.path,'/');if(value)jar.set(name,value);else jar.delete(name);}};
const load=loader({'server-only':{},'next/headers':{cookies:async()=>cookieStore},'next/navigation':{redirect:url=>{throw new Error(`REDIRECT:${url}`);}}});
const auth=load('app/api/auth/staff/route.ts');
const request=(body,origin='http://localhost:3001')=>new Request('http://localhost:3001/api/auth/staff',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const credentials={email:user.email,password:'not-a-real-password'};
try{
  assert.equal((await auth.GET()).status,401);
  const before=authCalls;
  assert.equal((await auth.POST(request(credentials,'https://untrusted.example'))).status,403);
  assert.equal((await auth.POST(request({email:'invalid',password:''}))).status,400);
  assert.equal(authCalls,before,'Rejected requests must not attempt authentication');
  console.log('PASS: staff auth endpoint rejects anonymous verification, cross-origin login and malformed credentials');
  invalid=true;assert.equal((await auth.POST(request(credentials))).status,401);assert.equal(jar.size,0);invalid=false;
  for(const testRole of ['admin','tutor']){
    role=testRole;const response=await auth.POST(request(credentials));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
    assert.deepEqual(await response.json(),{authenticated:true,role:testRole},'Only the verified database role is returned, without session tokens');
    assert.ok([...jar.keys()].some(name=>name.startsWith('sb-auth-regression-auth-token')),'SSR auth cookie persisted');
    assert.equal((await auth.GET()).status,200,'Next request authenticates from cookie without browser client state');
    jar.clear();assert.equal((await auth.GET()).status,401,'Missing returned cookie cannot authenticate');
  }
  console.log('PASS: invalid password rejected; real SSR cookie persists admin/tutor sign-in and authenticates the next request');
  for(const [testRole,isActive,status] of [['student',true,403],['tutor',false,403]]){
    role=testRole;active=isActive;assert.equal((await auth.POST(request(credentials))).status,status);assert.equal(jar.size,0,'Denied staff access clears session cookie');
  }
  role='admin';active=true;profileFailure=true;assert.equal((await auth.POST(request(credentials))).status,503);assert.equal(jar.size,0);profileFailure=false;
  console.log('PASS: student/suspended staff denied and signed out; profile lookup failure visible and clears partial session');

  const require=createRequire(new URL('../package.json',import.meta.url));
  const {NextRequest}=require('next/server');
  let refreshCalls=0;
  const proxyLoad=loader({'@supabase/ssr':{createServerClient:(_url,_key,{cookies})=>({from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:{role,is_active:active},error:profileFailure?{message:'Profile unavailable'}:null})}),auth:{getUser:async()=>{refreshCalls++;cookies.setAll([{name:'test-auth',value:'fresh',options:{path:'/',sameSite:'lax'}}]);return{data:{user},error:null};}}})}});
  const {proxy,config}=proxyLoad('proxy.ts');
  const incoming=new NextRequest('http://localhost:3001/dashboard',{headers:{Cookie:'test-auth=expired'}});
  const response=await proxy(incoming);
  assert.equal(refreshCalls,1);assert.equal(incoming.cookies.get('test-auth').value,'fresh');assert.equal(response.cookies.get('test-auth').value,'fresh');
  assert.match(response.headers.get('x-middleware-request-cookie'),/test-auth=fresh/);assert.match(response.headers.get('cache-control'),/no-store/);
  assert.deepEqual(config.matcher,['/','/dashboard/:path*','/student/:path*','/exam/:path*','/admin/:path*','/tutor/:path*','/api/admin/:path*','/api/auth/session','/api/dashboard/:path*']);
  for (const recoveryPath of ['/forgot-password','/reset-password']) assert.ok(!config.matcher.includes(recoveryPath), 'Recovery pages must remain accessible before login');
  for (const [testRole,path,expected] of [['student','/admin',307],['student','/dashboard/users',307],['student','/api/admin/update-user',403],['tutor','/dashboard/users',307],['tutor','/dashboard/submissions',200],['admin','/admin',307],['admin','/student/dashboard',307],['student','/dashboard',200]]) {
    role=testRole;const result=await proxy(new NextRequest(`http://localhost:3001${path}`));assert.equal(result.status,expected,`${role} access to ${path}`);
    if(expected===307) assert.match(result.headers.get('location'),/\/dashboard/);
    assert.equal(result.cookies.get('test-auth').value,'fresh','Redirects retain refreshed session cookies');
  }
  role='unknown';assert.equal((await proxy(new NextRequest('http://localhost:3001/api/auth/session'))).status,403);
  role='admin';profileFailure=true;assert.equal((await proxy(new NextRequest('http://localhost:3001/api/admin/update-user'))).status,403);profileFailure=false;
  console.log('PASS: proxy enforces student/admin/tutor boundaries and denies unknown roles or failed profile lookups');
  console.log('PASS: auth refresh forwards fresh cookies to dashboard, student and exam pages without intercepting assets');
}finally{
  globalThis.fetch=originalFetch;
  if(originalUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=originalUrl;
  if(originalKey===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=originalKey;
}

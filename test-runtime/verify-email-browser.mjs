import assert from 'node:assert/strict';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'vite';
import {loader} from './component-loader.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'outputs/email-browser');await mkdir(out,{recursive:true});
const entry=path.join(out,'entry.jsx'),navigation=path.join(out,'navigation.mjs'),sdk=path.join(out,'sdk.mjs');
const uid='00000000-0000-4000-8000-000000001108',jobId='00000000-0000-4000-8000-000000001109',token='a'.repeat(64);
await writeFile(navigation,'export const useRouter=()=>({refresh(){}});');
await writeFile(sdk,`export function createClient(url,key,options){window.privateAuthOptions=options;window.authCalls={verify:0,update:0,logout:0};return{auth:{verifyOtp:async value=>{window.authCalls.verify++;await new Promise(resolve=>setTimeout(resolve,50));return value.token_hash==='${token}'?{data:{user:{id:'${uid}'},session:{user:{id:'${uid}'}}},error:null}:{data:{user:null,session:null},error:{message:'Expired token'}};},updateUser:async()=>{window.authCalls.update++;return{data:{user:{id:'${uid}'}},error:null};},signOut:async()=>{window.authCalls.logout++;return{error:null};}}};}`);
await writeFile(entry,`import React from'react';import{createRoot}from'react-dom/client';import{EnrolledPasswordForm}from'../../components/enrolled-password-form';import{InviteStudent}from'../../components/dashboard/invite-student';import{StudentResources}from'../../components/student-resources';createRoot(document.getElementById('root')).render(<React.StrictMode>{location.pathname==='/invite'?<main className='p-4'><InviteStudent/></main>:location.pathname==='/resources'?<main className='p-4'>{['OCS','MCS','SCS'].map(level=><StudentResources key={level} level={level}/>)}</main>:<EnrolledPasswordForm/>}</React.StrictMode>);`);
await build({configFile:false,root,logLevel:'error',define:{'process.env.NEXT_PUBLIC_SUPABASE_URL':JSON.stringify('https://synthetic.example.test'),'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY':JSON.stringify('synthetic-public-key')},resolve:{alias:{'next/navigation':navigation,'@supabase/supabase-js':sdk,'@':root},dedupe:['react','react-dom']},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(out,'bundle'),emptyOutDir:false,rolldownOptions:{input:entry,output:{format:'iife',entryFileNames:'email-ui.js',codeSplitting:false}}}});
const bundle=await readFile(path.join(out,'bundle/email-ui.js')),names=await readdir('.next/static',{recursive:true});
const css=(await Promise.all(names.filter(name=>name.endsWith('.css')).map(name=>readFile('.next/static/'+name,'utf8')))).join('\n');
const {renderEmail}=loader({'server-only':{}})('lib/email/templates.ts');
let failNext=true;const requests=[];
const server=createServer(async(request,response)=>{
  if(request.url==='/email-ui.js'){response.setHeader('Content-Type','text/javascript; charset=utf-8');response.end(bundle);return;}
  if(request.url.startsWith('/api/')){
    response.setHeader('Content-Type','application/json');
    if(request.method==='GET'){response.end('{"state":"sent"}');return;}
    let raw='';for await(const chunk of request)raw+=chunk;requests.push(JSON.parse(raw));await new Promise(resolve=>setTimeout(resolve,50));
    if(failNext){failNext=false;response.statusCode=503;response.end('{"error":"Email automation is disabled for this local test."}');}
    else{response.statusCode=202;response.end(JSON.stringify({queued:true,job_id:jobId,message:'Invitation queued. Email delivery is pending.'}));}return;
  }
  response.setHeader('Content-Type','text/html; charset=utf-8');
  if(request.url.startsWith('/preview')){const params=new URL(request.url,'http://localhost').searchParams;const content=renderEmail({kind:params.get('kind'),level:params.get('level'),fullName:'Synthetic Learner',examName:'Synthetic Mock 1',passwordLink:'https://student.example.test/set-password#synthetic',portalOrigin:'https://student.example.test'});response.end(content.html);return;}
  response.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script src="/email-ui.js"></script>');
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const{chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const overflow=page=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
try{
  for(const[width,height]of[[1440,900],[390,844],[320,568]]){
    const page=await browser.newPage({viewport:{width,height}}),errors=[],external=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{if(route.request().url().startsWith(base))return route.continue();external.push(route.request().url());return route.abort();});
    try{
      await page.goto(base+'/set-password#token_hash='+token+'&user_id='+uid);await page.getByRole('button',{name:'Set password',exact:true}).waitFor();
      assert.equal(new URL(page.url()).hash,'');assert.equal(await page.evaluate(()=>window.authCalls.verify),0,'GET and hydration cannot consume the token');
      assert.deepEqual(await page.evaluate(()=>window.privateAuthOptions.auth),{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false});
      await page.getByLabel('New password',{exact:false}).fill('SecurePassword123!');await page.getByLabel('Confirm password',{exact:true}).fill('DifferentPassword123!');await page.getByRole('button',{name:'Set password',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.authCalls.verify),0);
      await page.getByLabel('Confirm password',{exact:true}).fill('SecurePassword123!');await page.screenshot({path:path.join(out,'password-'+width+'.png')});
      await page.getByRole('button',{name:'Set password',exact:true}).click();await page.getByRole('status').waitFor();assert.deepEqual(await page.evaluate(()=>window.authCalls),{verify:1,update:1,logout:1});assert.equal(await page.getByRole('link',{name:'Sign in to student portal',exact:true}).getAttribute('href'),'/student/login');assert.equal(await overflow(page),false);
      await page.goto(base+'/set-password#token_hash='+('b'.repeat(64))+'&user_id='+uid);await page.getByLabel('New password',{exact:false}).fill('SecurePassword123!');await page.getByLabel('Confirm password',{exact:true}).fill('SecurePassword123!');await page.getByRole('button',{name:'Set password',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.authCalls.update),0);
      await page.goto(base+'/set-password');await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').textContent(),/invalid/);
      requests.length=0;failNext=true;await page.goto(base+'/invite');await page.getByRole('button',{name:'Invite enrolled student',exact:true}).click();const dialog=page.getByRole('dialog');
      await dialog.getByLabel('Full name',{exact:true}).fill('Synthetic Candidate');await dialog.getByLabel('Email address',{exact:true}).fill('candidate@example.invalid');await dialog.getByLabel('Case-study level',{exact:true}).selectOption('MCS');
      await dialog.getByRole('button',{name:'Send password invitation',exact:true}).click();await dialog.getByText('Email automation is disabled for this local test.',{exact:true}).waitFor();assert.equal(requests.length,1);
      await dialog.getByRole('button',{name:'Send password invitation',exact:true}).click();await dialog.getByRole('status').waitFor();assert.match(await dialog.getByRole('status').textContent(),/pending/);assert.deepEqual(requests[1],{full_name:'Synthetic Candidate',email:'candidate@example.invalid',assigned_level:'MCS'});
      await dialog.getByRole('button',{name:'Check invitation delivery',exact:true}).click();await dialog.getByText('Brevo accepted the invitation. Ask the student to check their inbox and spam folder.',{exact:true}).waitFor();assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);await page.screenshot({path:path.join(out,'invitation-'+width+'.png')});
      await page.goto(base+'/resources');for(const level of ['OCS','MCS','SCS']){const resources=page.getByRole('complementary',{name:level+' study resources',exact:true});assert.equal(await resources.getByRole('link').count(),2);assert.ok((await resources.getByRole('link',{name:'Join '+level+' WhatsApp group',exact:true}).getAttribute('href')).startsWith('https://chat.whatsapp.com/'));}
      assert.equal(await overflow(page),false);await page.screenshot({path:path.join(out,'resources-'+width+'.png')});assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    }finally{await page.close();}
  }
  const preview=await browser.newPage({viewport:{width:390,height:844}});
  for(const level of ['OCS','MCS','SCS'])for(const kind of ['trial_welcome','trial_submission','trial_feedback','enrolled_invitation']){await preview.goto(base+'/preview?level='+level+'&kind='+kind);assert.equal(await overflow(preview),false);assert.equal(await preview.locator('a').count()>0,true);await preview.screenshot({path:path.join(out,kind+'-'+level+'.png'),fullPage:true});}
  await preview.close();console.log('PASS: real desktop/390px/320px invitation queuing/errors/status, password mismatch/expired/no-token handling, no token consumption on GET, private Auth isolation and level resource links; all 12 email previews fit mobile');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

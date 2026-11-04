import assert from 'node:assert/strict';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'outputs/exam-exit-browser');await mkdir(out,{recursive:true});
const auth=path.join(out,'auth.mjs'),session=path.join(out,'session.mjs'),client=path.join(out,'client.mjs'),entry=path.join(out,'entry.jsx');
await writeFile(auth,`const state={user:{id:'qa-student'},role:'student',candidateName:'Synthetic Student',loading:false,error:null,configured:true};export const useStudentAuth=()=>state;`);
await writeFile(session,`export const useStudentExamSession=()=>({sessionId:'00000000-0000-4000-8000-000000009111',questionTimers:{},answers:{},loading:false,error:null,completed:false,completeSession:async()=>true,resetLocalSession(){}});`);
await writeFile(client,`export const isSupabaseConfigured=true;export const createClient=()=>({auth:{refreshSession:async()=>({error:null})},rpc:async()=>({error:null}),from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:{status:'in_progress',active_question_id:'section-1',question_timers:{'section-1':{remaining_seconds:3600,synced_at:new Date().toISOString()}}},error:null})})});`);
await writeFile(entry,`import React from 'react';import{createRoot}from'react-dom/client';import ExamRuntime from '../../components/exam-runtime';import{LEGACY_EXAM_ID}from '../../lib/exam-data';localStorage.setItem('keystone-cima-exam-ui-v1-'+LEGACY_EXAM_ID+'-qa-student',JSON.stringify({flow:'exam',questionIndex:0,screen:'answer'}));createRoot(document.getElementById('root')).render(<ExamRuntime isTrial trialAttemptStarted/>);`);
await build({configFile:false,root,logLevel:'error',resolve:{alias:{'@/hooks/useStudentAuth':auth,'@/hooks/useStudentExamSession':session,'@/lib/supabase/client':client,'@':root},dedupe:['react','react-dom']},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(out,'bundle'),emptyOutDir:false,rolldownOptions:{input:entry,output:{format:'iife',entryFileNames:'exam.js',codeSplitting:false}}}});
const bundle=await readFile(path.join(out,'bundle/exam.js')),names=await readdir('.next/static',{recursive:true});
const css=(await Promise.all(names.filter(n=>n.endsWith('.css')).map(n=>readFile('.next/static/'+n,'utf8')))).join('\n');
const server=createServer(async(request,response)=>{
 if(request.url==='/exam.js'){response.setHeader('Content-Type','text/javascript; charset=utf-8');response.end(bundle);}
 else if(request.url==='/api/exam/answers'){for await(const chunk of request){}response.setHeader('Content-Type','application/json');response.end('{"saved":true}');}
 else{response.setHeader('Content-Type','text/html; charset=utf-8');response.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script src="/exam.js"></script>');}
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const{chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try{for(const[width,height]of[[1440,900],[390,844]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/exam');
 const editor=page.locator('.tiptap');await editor.waitFor();await editor.fill('Synthetic answer before leaving.');
 await page.getByRole('button',{name:'Exit to Dashboard',exact:true}).click();const popup=page.getByRole('alertdialog');await popup.waitFor();
 assert.ok((await popup.textContent()).includes('free-trial attempt'));await popup.evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})));});
 const box=await popup.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);
 await page.screenshot({path:path.join(out,'exit-warning-'+width+'.png')});await popup.getByRole('button',{name:'Stay in exam',exact:true}).click();assert.ok((await editor.textContent()).includes('Synthetic answer'));
 const native=page.waitForEvent('dialog');const reload=page.reload({timeout:4000}).catch(()=>null);const dialog=await native;assert.equal(dialog.type(),'beforeunload');await dialog.dismiss();await reload;
 assert.ok((await editor.textContent()).includes('Synthetic answer'));assert.deepEqual(errors,[]);await page.close();
}console.log('PASS: real desktop/mobile exit confirmation, cancel preserves the draft and native browser reload warning can keep the student in the exam');}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

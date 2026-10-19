import assert from 'node:assert/strict';
import React,{act} from '../node_modules/react/index.js';
import {Window} from 'happy-dom';
import {loader} from './component-loader.mjs';
import {mkdir,writeFile} from 'node:fs/promises';

const browser=new Window({url:'http://localhost:3001'});
for(const key of ['document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Event','MouseEvent','CustomEvent','FormData','File','Blob','Node','NodeFilter','MutationObserver','ResizeObserver','Element','DocumentFragment'])globalThis[key]=browser[key];
globalThis.window=browser;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.requestAnimationFrame=browser.requestAnimationFrame.bind(browser);
globalThis.cancelAnimationFrame=browser.cancelAnimationFrame.bind(browser);
globalThis.getComputedStyle=browser.getComputedStyle.bind(browser);
Object.defineProperty(globalThis,'navigator',{value:browser.navigator,configurable:true});
const {createRoot}=await import('../node_modules/react-dom/client.js');
const navigation=[];const router={push:x=>navigation.push(x),replace:x=>navigation.push(x),refresh:()=>navigation.push('refresh')};
browser.location.assign=url=>navigation.push(url);
let client={};
const uploadToasts=[];
const load=loader({'sonner':{toast:Object.fromEntries(['success','error','warning'].map(kind=>[kind,(...args)=>uploadToasts.push({kind,args})]))},'next/navigation':{useRouter:()=>router,usePathname:()=>'/dashboard'},'next/link':{__esModule:true,default:({href,children,...props})=>React.createElement('a',{href,...props},children)},'next/image':{__esModule:true,default:({priority,...props})=>React.createElement('img',props)},'./dashboard-theme.module.css':{__esModule:true,default:{shell:'dashboard-shell-test',sidebar:'dashboard-sidebar-test',scrollArea:'dashboard-scroll-test'}},'@/lib/supabase/client':{isSupabaseConfigured:true,createClient:()=>client}});
const {MockUploadForm}=load('components/dashboard/mock-upload-form.tsx');
const {MockExamsTable}=load('components/dashboard/mock-exams-table.tsx');
const {MockExamLibrary}=load('components/dashboard/mock-exam-library.tsx');
const {ExamTaskList}=load('components/exam-task-list.tsx');
const {GradingForm}=load('components/dashboard/grading-form.tsx');
const {SubmissionTable}=load('components/dashboard/submission-table.tsx');
const {default:StaffLogin}=load('app/staff/login/page.tsx');
const {UserManagement}=load('components/dashboard/user-management.tsx');
const {DashboardShell}=load('components/dashboard/dashboard-shell.tsx');
const {SubmissionReports}=load('components/dashboard/submission-reports.tsx');
const {StudentMockDashboard}=load('components/student-mock-dashboard.tsx');
const failures=[];
async function test(name,run){try{await run();console.log('PASS:',name);}catch(e){failures.push(name);console.error('FAIL:',name,e.stack);}}
async function mount(Component,props={}){const el=document.createElement('div');document.body.append(el);const root=createRoot(el);await act(async()=>root.render(React.createElement(Component,props)));return{el,unmount:async()=>{await act(async()=>root.unmount());el.remove();}};}
async function change(el,value){const setter=Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;await act(async()=>{setter.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});}
async function click(el){await act(async()=>el.click());}
async function submit(el){await act(async()=>{el.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,10));});}
const label=(el,text)=>[...el.querySelectorAll('label')].find(l=>l.textContent.startsWith(text)).querySelector('input,textarea,select');
await test('dashboard shell renders real branding, highlights current route, toggles sidebar and keeps tutor navigation restricted',async()=>{
  for(const role of ['admin','tutor']){
    const app=await mount(DashboardShell,{profile:{role,full_name:'Test Staff',email:'staff@example.invalid'},children:React.createElement('h1',null,'Workspace content')});try{
      assert.equal(app.el.querySelector('img').getAttribute('src'),'/keystone-cima-logo.png');assert.ok(app.el.textContent.includes('Test Staff'));
      assert.equal(app.el.querySelector('a[aria-current=page]').textContent,'Overview');
      const schoolLink=app.el.querySelector('header nav a');
      assert.equal(schoolLink.getAttribute('href'),'https://learn.keystoneacademia.com/');
      assert.equal(schoolLink.target,'_blank');assert.equal(schoolLink.rel,'noopener noreferrer');
      assert.match(schoolLink.getAttribute('aria-label'),/opens in a new tab/);
      assert.equal([...app.el.querySelectorAll('a')].some(a=>a.textContent==='People & access'),role==='admin');
      assert.ok(app.el.querySelector('.dashboard-sidebar-test'));const panel=app.el.querySelector('[data-slot=sidebar]');assert.equal(panel.dataset.state,'expanded');
      await click([...app.el.querySelectorAll('button')].find(b=>b.textContent==='Toggle Sidebar'));assert.equal(panel.dataset.state,'collapsed');
      assert.ok(app.el.textContent.includes('Workspace content'));
    }finally{await app.unmount();}
  }
});
async function fillMock(el){await change(el.querySelector('[name=name]'),'Local verification mock');for(const [name,value] of Object.entries({'Subject':'Funding approach','Scenario / background':'Evaluate the financing options.','Sub-task (a)':'Evaluate strategy.','Sub-task (b)':'Evaluate sustainability.'}))await change(label(el,name),value);}

await test('mock exam level tabs filter the already-loaded list instantly and update the URL without navigation',async()=>{
  const exams=Array.from({length:21},(_,index)=>({id:`exam-${index}`,name:`OCS mock ${index + 1}`,description:'Instant filter test',level:'OCS',status:'draft',revision:0,copied_from:null,created_by:null,created_at:'2026-10-09T00:00:00Z',questions:[],materials:[],attemptCount:0}));
  exams.push({id:'mcs-exam',name:'MCS mock',description:'Management',level:'MCS',status:'published',revision:0,copied_from:null,created_by:null,created_at:'2026-10-09T00:00:00Z',questions:[],materials:[],attemptCount:0});
  const refreshCount=navigation.length;
  const app=await mount(MockExamLibrary,{exams,managementReady:true,initialLevel:undefined,initialPage:1,archived:false});try{
    assert.ok(app.el.textContent.includes('22 mocks · Page 1 of 2'));
    await click([...app.el.querySelectorAll('button')].find(button=>button.textContent==='MCS'));
    assert.ok(app.el.textContent.includes('1 mocks · Page 1 of 1'));assert.ok(app.el.textContent.includes('MCS mock'));assert.ok(!app.el.textContent.includes('OCS mock 1'));
    assert.equal(browser.location.search,'?level=MCS');assert.equal(navigation.length,refreshCount,'Tab selection must not navigate or refresh the server page');
    assert.equal([...app.el.querySelectorAll('a')].find(link=>link.textContent==='Archived mocks').getAttribute('href'),'/dashboard/exams?view=archived&level=MCS');
    await click([...app.el.querySelectorAll('button')].find(button=>button.textContent==='All levels'));
    assert.equal(browser.location.search,'');assert.ok(app.el.textContent.includes('22 mocks · Page 1 of 2'));
  }finally{await app.unmount();}
});

await test('admin free-mock confirmation cancels safely, handles errors, moves one badge and preserves instant tabs; tutors have no controls',async()=>{
  const first='00000000-0000-4000-8000-000000007701',second='00000000-0000-4000-8000-000000007702';
  const exams=[{id:first,name:'OCS Mock 1',level:'OCS',status:'published'},{id:second,name:'OCS Mock 2',level:'OCS',status:'published'},{id:'mcs',name:'MCS Mock 1',level:'MCS',status:'published'},{id:'draft',name:'OCS Draft',level:'OCS',status:'draft'}].map(exam=>({...exam,description:'',revision:2,questions:[],materials:[],attemptCount:1}));
  const calls=[];let fail=true;
  globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json(fail?{error:'Selection changed. Please reload.'}:{id:second},{status:fail?409:200});};
  const props={exams,managementReady:true,initialPage:1,archived:false,canSetFreeMock:true,freeMockIds:{OCS:first}};
  const app=await mount(MockExamLibrary,props);try{
    const row=id=>[...app.el.querySelectorAll('tbody tr')].find(item=>item.textContent.includes(id));
    assert.ok(row('OCS Mock 1').textContent.includes('Free mock'));
    assert.equal(app.el.querySelector('[aria-label="Set OCS Draft as free mock"]'),null);
    await click(app.el.querySelector('[aria-label="Set OCS Mock 2 as free mock"]'));
    const dialog=()=>document.querySelector('[role=alertdialog]');
    assert.ok(dialog().textContent.includes('Existing students keep their assigned mock'));
    await mkdir('outputs/free-mock-layout',{recursive:true});
    await writeFile('outputs/free-mock-layout/dialog.html',document.body.innerHTML);
    await click([...dialog().querySelectorAll('button')].find(item=>item.textContent==='Cancel'));assert.equal(calls.length,0);
    await click(app.el.querySelector('[aria-label="Set OCS Mock 2 as free mock"]'));
    await click([...dialog().querySelectorAll('button')].find(item=>item.textContent==='Yes, Set as Free Mock'));
    assert.match(dialog().querySelector('[role=alert]').textContent,/Selection changed/);
    assert.ok(row('OCS Mock 1').textContent.includes('Free mock'));assert.ok(!row('OCS Mock 2').textContent.includes('Free mock'));
    fail=false;
    await click([...dialog().querySelectorAll('button')].find(item=>item.textContent==='Yes, Set as Free Mock'));
    assert.equal(dialog(),null);assert.ok(row('OCS Mock 2').textContent.includes('Free mock'));assert.ok(!row('OCS Mock 1').textContent.includes('Free mock'));
    assert.deepEqual(calls.at(-1),{url:'/api/dashboard/free-mock',body:{exam_id:second,level:'OCS',revision:2,previous_exam_id:first}});
    const before=calls.length;
    await click([...app.el.querySelectorAll('[role=tab]')].find(item=>item.textContent==='MCS'));
    await click([...app.el.querySelectorAll('[role=tab]')].find(item=>item.textContent==='OCS'));
    assert.equal(calls.length,before);assert.ok(row('OCS Mock 2').textContent.includes('Free mock'));
    assert.ok(app.el.textContent.includes('Existing students and attempts are unchanged'));
    await writeFile('outputs/free-mock-layout/table.html',app.el.outerHTML);
  }finally{await app.unmount();}
  const tutor=await mount(MockExamLibrary,{...props,canSetFreeMock:false});try{assert.equal(tutor.el.querySelector('[aria-label$="as free mock"]'),null);}finally{await tutor.unmount();}
});

await test('student review uses three clear sections and switches already-loaded level data without navigation',async()=>{
  const papers=[{exam:{id:'ocs-paper',name:'Operational Mock 2',description:'Only assigned content',level:'OCS',status:'published'},status:'completed',canOpen:false}];
  const submissions=[{id:'submission-ocs',exam_id:'ocs-paper',status:'graded',score:81,feedback:'Strong structure.',exam:{id:'ocs-paper',name:'Operational Mock 2',description:'',level:'OCS',status:'published'}}];
  const app=await mount(StudentMockDashboard,{papers,submissions,reports:[{id:'report-1',submission_id:'submission-ocs',file_name:'tutor-report.pdf'}],solutions:[{id:'guide-1',exam_id:'ocs-paper',name:'model-solution.pdf',kind:'solution'}],assignedLevel:'OCS'});try{
    assert.ok(app.el.textContent.includes('1. Submitted Answers'));assert.ok(app.el.textContent.includes('2. Suggested Solutions'));assert.ok(app.el.textContent.includes('3. Graded Report'));assert.ok(app.el.textContent.includes('Final score: 81/100'));
    assert.equal(app.el.querySelector('a[href="/api/submissions/submission-ocs/answers"]')?.textContent,'Download answers (.docx)');assert.ok(app.el.querySelector('a[href="/api/solutions/guide-1"]'));assert.ok(app.el.querySelector('a[href="/api/reports/report-1"]'));
    const before=navigation.length;await click([...app.el.querySelectorAll('button')].find(button=>button.textContent==='MCS'));assert.equal(browser.location.search,'?level=MCS');assert.ok(app.el.textContent.includes('No mock exams are available in this level.'));assert.equal(navigation.length,before);
  }finally{await app.unmount();}
});

await test('mock form adds/removes questions, defaults 60 minutes and shows 100% weights',async()=>{
  const app=await mount(MockUploadForm);try{
    assert.equal(label(app.el,'Time per question').value,'60');assert.ok(app.el.textContent.includes('Total weightage: 100%'));
    await click([...app.el.querySelectorAll('button')].find(b=>b.textContent==='Add question'));
    assert.ok(app.el.textContent.includes('Question 2'));
    await click(app.el.querySelector('[aria-label="Remove question 2"]'));assert.ok(!app.el.textContent.includes('Question 2'));
  }finally{await app.unmount();}
});
await test('mock form saves exam payload and navigates; failed network presents retryable error',async()=>{
  const calls=[];client={auth:{getUser:async()=>({data:{user:{id:'test-tutor'}}})}};
  globalThis.fetch=async(url,options)=>{calls.push({url,payload:JSON.parse(options.body)});return new Response('{"id":"new-exam"}',{status:201});};
  const app=await mount(MockUploadForm);try{await fillMock(app.el);await change(app.el.querySelector('[name=level]'),'MCS');await submit(app.el.querySelector('form'));assert.equal(calls.length,1,app.el.querySelector('[role=alert]')?.textContent);assert.equal(calls[0].payload.level,'MCS');assert.equal(calls[0].payload.questions[0].timeMinutes,60);assert.ok(navigation.includes('/dashboard/exams?created=1'));}finally{await app.unmount();}
  globalThis.fetch=async()=>{throw new TypeError('Network disconnected');};
  const failed=await mount(MockUploadForm);try{await fillMock(failed.el);await submit(failed.el.querySelector('form'));assert.match(failed.el.querySelector('[role=alert]').textContent,/Network disconnected/);assert.equal(failed.el.querySelector('fieldset').disabled,false);}finally{await failed.unmount();}
});
await test('dynamic subtasks preserve independent weights, validate percentages, save custom marks and remove stable rows',async()=>{
  const calls=[];client={auth:{getUser:async()=>({data:{user:{id:'test-tutor'}}})}};
  globalThis.fetch=async(_url,options)=>{calls.push(JSON.parse(options.body));return new Response('{"id":"new-exam"}',{status:201});};
  const app=await mount(MockUploadForm);try{
    await fillMock(app.el);
    const field=(n,kind)=>app.el.querySelector(`[aria-label="Question 1 subtask ${n} ${kind}"]`);
    await change(field(1,'weightage'),'20');assert.equal(field(2,'weightage').value,'45','Editing A must not recalculate B');
    await click(app.el.querySelector('[aria-label="Add subtask to question 1"]'));
    await change(field(3,'description'),'Evaluate risk.');await change(field(2,'weightage'),'30');await change(field(3,'weightage'),'50');
    assert.ok(app.el.textContent.includes('Total weightage: 100%'));
    await submit(app.el.querySelector('form'));assert.equal(calls.length,1);
    assert.deepEqual(calls[0].questions[0].subtasks.map(t=>t.weightage),[20,30,50]);assert.equal(calls[0].questions[0].subtasks.length,3);
    assert.equal(calls[0].questions[0].subtasks[2].description,'Evaluate risk.');assert.equal(calls[0].questions[0].subtasks[0].key,undefined,'Do not persist UI keys');
    await change(field(3,'weightage'),'49');await submit(app.el.querySelector('form'));
    assert.equal(calls.length,1,'Invalid percentage total must not reach storage/API');assert.match(app.el.querySelector('[role=alert]').textContent,/total 100/);
    await change(app.el.querySelector('[aria-label="Question 1 weightage unit"]'),'marks');
    await change(field(1,'weightage'),'10');await change(field(2,'weightage'),'20');await change(field(3,'weightage'),'7.5');
    await submit(app.el.querySelector('form'));assert.equal(calls.length,2);assert.equal(calls[1].questions[0].weightageUnit,'marks');assert.deepEqual(calls[1].questions[0].subtasks.map(t=>t.weightage),[10,20,7.5]);
    await click(app.el.querySelector('[aria-label="Remove question 1 subtask 2"]'));
    assert.equal(field(2,'description').value,'Evaluate risk.');assert.equal(field(2,'weightage').value,'7.5');
    await click(app.el.querySelector('[aria-label="Remove question 1 subtask 2"]'));assert.equal(app.el.querySelector('[aria-label="Remove question 1 subtask 1"]').disabled,true);
  }finally{await app.unmount();}
});
await test('task list renders every dynamic/legacy subtask with the correct custom unit',async()=>{
  const app=await mount(ExamTaskList,{question:{subtasks:[{description:'Strategy',weightage:10},{description:'Funding',weightage:20},{description:'Risk',weightage:7.5}],weightageUnit:'marks'}});
  try{assert.equal(app.el.querySelectorAll('li').length,3);assert.ok(app.el.textContent.includes('[sub task (c) = 7.5 marks]'));}finally{await app.unmount();}
  const legacy=await mount(ExamTaskList,{question:{partA:'Legacy A',partB:'Legacy B',weightA:'55%',weightB:'45%'}});
  try{assert.equal(legacy.el.querySelectorAll('li').length,2);assert.ok(legacy.el.textContent.includes('[sub task (b) = 45%]'));}finally{await legacy.unmount();}
});
const draftExam={id:'00000000-0000-4000-8000-000000000010',name:'Draft mock',description:'Local draft',status:'draft',created_at:new Date().toISOString(),questions:[{id:'q1',duration_seconds:3600}],materials:[]};
await test('publish awaits database success, disables repeat click, updates badge and activates student link',async()=>{
  let resolveRequest;const calls=[];
  globalThis.fetch=(url,options)=>{calls.push({url,method:options.method,body:JSON.parse(options.body)});return new Promise(r=>{resolveRequest=r;});};
  const app=await mount(MockExamsTable,{exams:[draftExam]});try{
    assert.ok(app.el.textContent.includes('Staff draft'));assert.equal(app.el.querySelector(`a[href="/exam/${draftExam.id}"]`),null);
    await click(app.el.querySelector('[aria-label="Publish Draft mock"]'));
    assert.equal(app.el.querySelector('[aria-label="Publish Draft mock"]').disabled,true);assert.ok(app.el.textContent.includes('Staff draft'),'No optimistic student access');
    assert.deepEqual(calls,[{url:`/api/dashboard/exams/${draftExam.id}`,method:'PATCH',body:{status:'published',revision:0}}]);
    await act(async()=>{resolveRequest(new Response('{"status":"published"}'));await new Promise(r=>setTimeout(r,10));});
    assert.ok(app.el.textContent.includes('published'));assert.equal(app.el.querySelector(`a[href="/exam/${draftExam.id}"]`).textContent,'Open exam');assert.equal(app.el.querySelector('[aria-label="Publish Draft mock"]'),null);
  }finally{await app.unmount();}
});
await test('failed publication stays draft with visible error and allows a successful retry',async()=>{
  globalThis.fetch=async()=>new Response('{"error":"Apply the custom-subtasks migration before publishing mocks."}',{status:503});
  const app=await mount(MockExamsTable,{exams:[draftExam]});try{
    await click(app.el.querySelector('[aria-label="Publish Draft mock"]'));
    assert.match(app.el.querySelector('[role=alert]').textContent,/migration/);assert.ok(app.el.textContent.includes('Staff draft'));assert.equal(app.el.querySelector('[aria-label="Publish Draft mock"]').disabled,false);
    globalThis.fetch=async()=>new Response('{"status":"published"}');await click(app.el.querySelector('[aria-label="Publish Draft mock"]'));assert.ok(app.el.textContent.includes('Open exam'));
  }finally{await app.unmount();}
});
await test('unpublish requires confirmation, cancel writes nothing, stale errors remain retryable and success disables new student link',async()=>{
  const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,method:options.method,body:JSON.parse(options.body)});return new Response('{"error":"Reload before saving"}',{status:409});};
  const exam={...draftExam,status:'published',revision:5,attemptCount:2};const app=await mount(MockExamsTable,{exams:[exam]});try{
    assert.ok(app.el.querySelector(`[href="/dashboard/exams/${exam.id}/edit"]`).textContent.includes('Edit copy'));
    await click(app.el.querySelector('[aria-label="Unpublish Draft mock"]'));let dialog=document.querySelector('[role=alertdialog]');assert.ok(dialog.textContent.includes('Existing students can continue'));
    await click([...dialog.querySelectorAll('button')].find(b=>b.textContent==='Cancel'));assert.equal(calls.length,0);
    await click(app.el.querySelector('[aria-label="Unpublish Draft mock"]'));dialog=document.querySelector('[role=alertdialog]');await click([...dialog.querySelectorAll('button')].find(b=>b.textContent==='Yes, Unpublish'));
    assert.match(dialog.querySelector('[role=alert]').textContent,/Reload/);assert.ok(app.el.querySelector(`[href="/exam/${exam.id}"]`),'Failure must preserve published link');
    globalThis.fetch=async(_url,options)=>{calls.push({method:options.method,body:JSON.parse(options.body)});return new Response('{"status":"draft","revision":6,"action":"unpublished"}');};
    await click([...dialog.querySelectorAll('button')].find(b=>b.textContent==='Yes, Unpublish'));
    assert.deepEqual(calls.at(-1).body,{status:'draft',revision:5});assert.equal(app.el.querySelector(`[href="/exam/${exam.id}"]`),null);assert.ok(app.el.textContent.includes('Staff draft'));assert.equal(document.querySelector('[role=alertdialog]'),null);
  }finally{await app.unmount();}
});
await test('delete unused removes row; attempted mock archives instead; restore returns to draft; migration disables management',async()=>{
  const calls=[];globalThis.fetch=async(_url,options)=>{calls.push({method:options.method,body:JSON.parse(options.body)});return new Response('{"status":"deleted","action":"deleted"}');};
  const app=await mount(MockExamsTable,{exams:[draftExam]});try{
    await click(app.el.querySelector('[aria-label="Delete Draft mock"]'));const dialog=document.querySelector('[role=alertdialog]');assert.ok(dialog.textContent.includes('archived instead'));
    await click([...dialog.querySelectorAll('button')].find(b=>b.textContent==='Yes, Delete'));assert.equal(calls[0].method,'DELETE');assert.equal(app.el.querySelector('[aria-label="Edit Draft mock"]'),null);assert.ok(app.el.textContent.includes('Unused mock deleted'));
  }finally{await app.unmount();}
  globalThis.fetch=async()=>new Response('{"status":"archived","revision":1,"action":"archived"}');
  const used=await mount(MockExamsTable,{exams:[{...draftExam,attemptCount:1}]});try{
    await click(used.el.querySelector('[aria-label="Archive Draft mock"]'));const dialog=document.querySelector('[role=alertdialog]');assert.ok(dialog.textContent.includes('archived, not deleted'));
    await click([...dialog.querySelectorAll('button')].find(b=>b.textContent==='Yes, Archive'));assert.ok(used.el.textContent.includes('Draft mock'));assert.ok(used.el.textContent.includes('Archived — existing attempts only'));
    globalThis.fetch=async(_url,options)=>{assert.deepEqual(JSON.parse(options.body),{action:'restore',revision:1});return new Response('{"status":"draft","revision":2,"action":"restored"}');};
    await click(used.el.querySelector('[aria-label="Restore Draft mock"]'));assert.ok(used.el.querySelector('[aria-label="Publish Draft mock"]'));
  }finally{await used.unmount();}
  const blocked=await mount(MockExamsTable,{exams:[draftExam],managementReady:false});try{assert.ok([...blocked.el.querySelectorAll('button')].every(b=>b.disabled));assert.equal(blocked.el.querySelector('[aria-label="Edit Draft mock"]').getAttribute('aria-disabled'),'true');}finally{await blocked.unmount();}
});
await test('edit form prefills tasks, preserves PDF without reupload, remaps remaining question and saves as a new draft copy',async()=>{
  const calls=[];client={auth:{getUser:async()=>({data:{user:{id:'editor-admin'}}})}};
  globalThis.fetch=async(url,options)=>{calls.push({url,method:options.method,body:JSON.parse(options.body)});return new Response('{"id":"new-copy","status":"draft","action":"copied"}');};
  const content={from:'Director',to:'Manager',subject:'Original question',intro:'Original scenario',taskPrompt:'Evaluate all three',subtasks:[{description:'Strategy',weightage:20},{description:'Funding',weightage:30},{description:'Risk',weightage:50}],weightageUnit:'percent'};
  const initialExam={exam:{...draftExam,revision:2},attemptCount:1,questions:[{id:'q1',question_id:'section-1',duration_seconds:3600,content},{id:'q2',question_id:'section-2',duration_seconds:1800,content:{...content,subject:'Question two'}}],materials:[{id:'pdf1',name:'Original reference.pdf',kind:'reference',question_id:'section-2',storage_path:'original-tutor/source/reference.pdf'}]};
  const app=await mount(MockUploadForm,{initialExam});try{
    assert.ok(app.el.textContent.includes('Saving creates a new draft copy'));assert.equal(app.el.querySelector('[name=status]').disabled,true);assert.ok(app.el.querySelector('[name=name]').value.includes('Revised draft'));
    await click(app.el.querySelector('[aria-label="Remove question 1"]'));assert.equal(label(app.el,'Subject').value,'Question two');assert.equal(label(app.el,'Time per question').value,'30');
    await change(app.el.querySelector('[aria-label="Question 1 subtask 1 weightage"]'),'10');await change(app.el.querySelector('[aria-label="Question 1 subtask 2 weightage"]'),'40');
    await submit(app.el.querySelector('form'));assert.equal(calls.length,1,app.el.querySelector('[role=alert]')?.textContent);assert.equal(calls[0].method,'PUT');assert.equal(calls[0].url,`/api/dashboard/exams/${draftExam.id}`);assert.equal(calls[0].body.status,'draft');assert.equal(calls[0].body.revision,2);
    assert.deepEqual(calls[0].body.materials,[{name:'Original reference.pdf',storage_path:'original-tutor/source/reference.pdf',kind:'reference',question_id:'section-1'}]);assert.deepEqual(calls[0].body.questions[0].subtasks.map(t=>t.weightage),[10,40,50]);assert.ok(navigation.includes('/dashboard/exams?saved=copy'));
    await click(app.el.querySelector('[aria-label="Remove retained PDF Original reference.pdf"]'));await submit(app.el.querySelector('form'));assert.deepEqual(calls.at(-1).body.materials,[]);
  }finally{await app.unmount();}
});
await test('PDF uploads preserve material mappings; invalid PDF rejects; failed exam creation cleans uploaded files',async()=>{
  const uploads=[],removed=[],calls=[];
  client={auth:{getUser:async()=>({data:{user:{id:'test-tutor'}}})},storage:{from:()=>({upload:async(path,file)=>{uploads.push({path,name:file.name});return{error:null};},remove:async(paths)=>{removed.push(...paths);return{error:null};}})}};
  const app=await mount(MockUploadForm);try{
    await fillMock(app.el);
    const input=app.el.querySelector('[aria-label="Pre-seen PDF"]');
    await act(async()=>{Object.defineProperty(input,'files',{value:[new File(['%PDF-1.7\nLocal test'], 'preseen.pdf',{type:'application/pdf'})],configurable:true});input.dispatchEvent(new Event('change',{bubbles:true}));});
    globalThis.fetch=async(_url,options)=>{calls.push(JSON.parse(options.body));return new Response('{"error":"Unable to save mock"}',{status:400});};
    await submit(app.el.querySelector('form'));
    assert.equal(uploads.length,1);assert.equal(calls[0].materials[0].kind,'preseen');assert.equal(calls[0].materials[0].question_id,null);assert.deepEqual(removed,[uploads[0].path]);assert.match(app.el.querySelector('[role=alert]').textContent,/Unable to save mock/);
    await act(async()=>{Object.defineProperty(input,'files',{value:[new File(['not PDF'],'bad.pdf',{type:'application/pdf'})],configurable:true});input.dispatchEvent(new Event('change',{bubbles:true}));});
    await submit(app.el.querySelector('form'));assert.equal(uploads.length,1);assert.match(app.el.querySelector('[role=alert]').textContent,/not a valid PDF/);
  }finally{await app.unmount();}
});
const submission={id:'submission-test',revision:0,status:'submitted',score:null,feedback:'',submitted_at:new Date().toISOString(),student:{full_name:'Test Student',email:'test@example.invalid'},exam:{name:'Mock test'}};
await test('grading form sends score, feedback and revision; stale grade exposes server error',async()=>{
  let payload;globalThis.fetch=async(_url,options)=>{payload=JSON.parse(options.body);return new Response('{}');};
  const app=await mount(GradingForm,{submission,evaluation:null});try{await change(app.el.querySelector('[name=score]'),'72.5');await change(app.el.querySelector('[name=feedback]'),'Strong analysis.');await submit(app.el.querySelector('form'));assert.deepEqual(payload,{score:72.5,feedback:'Strong analysis.',status:'published',revision:0});assert.ok(app.el.textContent.includes('Evaluation saved.'));}finally{await app.unmount();}
  globalThis.fetch=async()=>new Response('{"error":"Reload before saving."}',{status:409});
  const failed=await mount(GradingForm,{submission,evaluation:null});try{await submit(failed.el.querySelector('form'));assert.equal(failed.el.querySelector('[role=alert]').textContent,'Reload before saving.');assert.equal(failed.el.querySelector('button').disabled,false);}finally{await failed.unmount();}
});
await test('submissions table renders student, exam, pending/graded scores and review links',async()=>{
  const app=await mount(SubmissionTable,{submissions:[submission,{...submission,id:'graded-test',status:'graded',score:0}]});try{assert.ok(app.el.textContent.includes('Test Student'));assert.ok(app.el.textContent.includes('Awaiting review'));assert.ok(app.el.textContent.includes('0/100'));assert.equal(app.el.querySelector('a').getAttribute('href'),'/dashboard/submissions/submission-test');}finally{await app.unmount();}
});
await test('staff login verifies server cookie before document navigation; auth/access/cookie/network errors remain visible',async()=>{
  for(const [postStatus,getStatus,message] of [[200,200,null],[401,200,'Invalid login credentials'],[403,200,'Active staff only'],[200,401,'session cookie was not saved'],[200,403,'You do not have access']]){
    navigation.length=0;const calls=[];
    globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(options.method==='POST'?{authenticated:true,error:message}:{error:message,role:'admin'}),{status:options.method==='POST'?postStatus:getStatus});};
    const app=await mount(StaffLogin);try{
      await change(app.el.querySelector('[name=email]'),'test@example.invalid');await change(app.el.querySelector('[name=password]'),'not-a-real-password');await submit(app.el.querySelector('form'));
      assert.equal(navigation.includes('/dashboard'),message===null);assert.equal(calls[0].url,'/api/auth/staff');assert.equal(calls[0].options.credentials,'same-origin');assert.equal(calls[0].options.cache,'no-store');
      if(postStatus===200) assert.equal(calls[1].url,'/api/auth/session','Staff login resolves its role from the authoritative session endpoint');
      assert.equal(calls.length,postStatus===200?2:1);assert.equal(JSON.parse(calls[0].options.body).email,'test@example.invalid');
      if(message){assert.ok(app.el.querySelector('[role=alert]').textContent.includes(message));assert.equal(app.el.querySelector('button').disabled,false);}else{assert.equal(app.el.querySelector('button').disabled,true);assert.ok(!navigation.includes('refresh'));}
    }finally{await app.unmount();}
  }
  globalThis.fetch=async()=>{throw new TypeError('Network disconnected');};
  const app=await mount(StaffLogin);try{await submit(app.el.querySelector('form'));assert.match(app.el.querySelector('[role=alert]').textContent,/Network disconnected/);assert.equal(app.el.querySelector('button').disabled,false);}finally{await app.unmount();}
});
await test('account management create/edit, protected admins and cancel/confirm deletion',async()=>{
  const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,method:options.method,body:options.body?JSON.parse(options.body):null});return new Response('{}');};
  const student={id:'student-test',full_name:'Test Student',email:'test@example.invalid',role:'student',is_active:true};
  const admin={...student,id:'admin-test',full_name:'Test Admin',role:'admin'};
  const app=await mount(UserManagement,{users:[student,admin]});try{
    assert.ok(app.el.textContent.includes('Protected admin'));assert.equal(app.el.querySelector('[aria-label="Remove Test Admin"]'),null);
    await click([...app.el.querySelectorAll('button')].find(b=>b.textContent==='Add tutor or student'));
    let dialog=document.querySelector('[role=dialog]');assert.ok(dialog);
    await change(dialog.querySelector('[name=full_name]'),'New Student');await change(dialog.querySelector('[name=email]'),'new@example.invalid');await change(dialog.querySelector('[name=password]'),'test-only-long-password');
    await submit(dialog.querySelector('form'));assert.equal(calls.at(-1).method,'POST');assert.equal(calls.at(-1).body.role,'student');
    await click(app.el.querySelector('[aria-label="Edit Test Student"]'));dialog=document.querySelector('[role=dialog]');await change(dialog.querySelector('[name=full_name]'),'Updated Student');await submit(dialog.querySelector('form'));assert.equal(calls.at(-1).method,'PATCH');assert.equal(calls.at(-1).body.full_name,'Updated Student');
    await click(app.el.querySelector('[aria-label="Remove Test Student"]'));let warning=document.querySelector('[role=alertdialog]');assert.ok(warning);const before=calls.length;await click([...warning.querySelectorAll('button')].find(b=>b.textContent==='Cancel'));assert.equal(calls.length,before);
    await click(app.el.querySelector('[aria-label="Remove Test Student"]'));warning=document.querySelector('[role=alertdialog]');await click([...warning.querySelectorAll('button')].find(b=>b.textContent==='Remove permanently'));assert.equal(calls.at(-1).method,'DELETE');assert.ok(app.el.textContent.includes('Account removed.'));
  }finally{await app.unmount();}
});
await test('graded report UI uploads PDF/DOCX/DOC without refresh; attaches metadata, cleans rejected uploads and retries uncertain responses without duplicate objects',async()=>{
  const uploads=[],cleanup=[],calls=[];let fail=false;
  client={auth:{getUser:async()=>({data:{user:{id:'tutor-id'}}})},storage:{from:bucket=>({upload:async(path,file,options)=>{uploads.push({bucket,path,name:file.name,options});return{error:null};},remove:async paths=>{cleanup.push(paths);return{error:null};}})}};
  globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});if(fail==='network')throw new TypeError('Connection lost after upload');return new Response(JSON.stringify(fail?{error:'Report validation failed'}:{id:'report-id'}),{status:fail?400:201});};
  const app=await mount(SubmissionReports,{submissionId:'submission-id',reports:[{id:'existing-report',file_name:'Existing marked paper.pdf'}]});
  try{
    const navigationCount=navigation.length;
    assert.equal(app.el.querySelector('a').getAttribute('href'),'/api/reports/existing-report');
    const input=app.el.querySelector('input[type=file]');
    const select=async name=>{Object.defineProperty(input,'files',{value:[new File(['%PDF-1.7'],name)],configurable:true});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));};
    await select('feedback.pdf');await submit(app.el.querySelector('form'));
    assert.equal(uploads[0].bucket,'graded-reports');assert.ok(uploads[0].path.startsWith('tutor-id/submission-id/'));assert.equal(uploads[0].options.upsert,false);assert.equal(calls[0].body.file_name,'feedback.pdf');assert.ok(app.el.textContent.includes('Report attached'));assert.equal(cleanup.length,0);assert.equal(input.value,'');
    assert.equal(uploadToasts.at(-1).kind,'success');
    fail=true;await select('second.docx');await submit(app.el.querySelector('form'));assert.equal(uploads.at(-1).options.contentType,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');assert.equal(cleanup.length,1);assert.ok(app.el.querySelector('[role=alert]').textContent.includes('validation failed'));assert.equal(app.el.querySelector('button').disabled,false);
    assert.equal(uploadToasts.at(-1).kind,'error');assert.ok(uploadToasts.at(-1).args[1].description.includes('validation failed'));
    fail=false;await submit(app.el.querySelector('form'));assert.ok(app.el.textContent.includes('Report attached'));
    assert.ok([...app.el.querySelectorAll('a')].some(link=>link.textContent==='second.docx'),'Saved attachment appears immediately');
    await select('legacy.doc');await submit(app.el.querySelector('form'));assert.equal(uploads.at(-1).options.contentType,'application/msword');
    assert.equal(navigation.length,navigationCount,'Upload must not refresh the grading page or reset the feedback form');
    fail='network';await select('retry.pdf');await submit(app.el.querySelector('form'));const uncertainPath=calls.at(-1).body.storage_path;const uploadCount=uploads.length;
    assert.ok(app.el.querySelector('[role=alert]').textContent.includes('Connection lost'));assert.equal(input.files[0].name,'retry.pdf');
    fail=false;await submit(app.el.querySelector('form'));assert.equal(uploads.length,uploadCount,'Retry reuses the already uploaded object');assert.equal(calls.at(-1).body.storage_path,uncertainPath);
    const count=uploads.length;await select('not-a-report.exe');await submit(app.el.querySelector('form'));assert.equal(uploads.length,count);assert.ok(app.el.querySelector('[role=alert]').textContent.includes('PDF or Word'));
  }finally{await app.unmount();}
});
await browser.happyDOM.close();if(failures.length)process.exitCode=1;

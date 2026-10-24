import assert from 'node:assert/strict';
import React,{act} from '../node_modules/react/index.js';
import {Window} from 'happy-dom';
import {loader} from './component-loader.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=new Window({url:'http://localhost:3001',width:1440,height:900});
const navigations=[];browser.location.assign=url=>navigations.push(url);
globalThis.window=browser;
globalThis.self=browser;
for(const key of ['document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Event','MouseEvent','PointerEvent','CustomEvent','FormData','File','Blob','Node','NodeFilter','MutationObserver','ResizeObserver','Element','DocumentFragment','DOMParser'])globalThis[key]=browser[key];
globalThis.requestAnimationFrame=browser.requestAnimationFrame.bind(browser);globalThis.cancelAnimationFrame=browser.cancelAnimationFrame.bind(browser);globalThis.getComputedStyle=browser.getComputedStyle.bind(browser);
Object.defineProperty(globalThis,'navigator',{value:browser.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('../node_modules/react-dom/client.js');
const auth={user:{id:'local-test-student'},role:'student',candidateName:'Local Test Student',loading:false,error:null,configured:true};
let completions=0;
const client={auth:{refreshSession:async()=>({error:null})},rpc:async()=>({error:null}),from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:{status:'in_progress',question_timers:{},active_question_id:null},error:null})})};
const writes=[];globalThis.fetch=async(_url,options)=>{writes.push(JSON.parse(options.body));return new Response('{"saved":true}');};
const load=loader({'@/hooks/useStudentAuth':{useStudentAuth:()=>auth},'@/hooks/useStudentExamSession':{useStudentExamSession:()=>{
  const [completed,setCompleted]=React.useState(false);
  return{sessionId:'local-test-session',answers:{},questionTimers:{},completed,loading:false,error:null,completeSession:async()=>{completions++;setCompleted(true);return true;},resetLocalSession:()=>setCompleted(false)};
}},'@/lib/supabase/client':{createClient:()=>client,isSupabaseConfigured:true}});
const {default:ExamRuntime}=load('components/exam-runtime.tsx');
const {LEGACY_EXAM_ID,questionsData}=load('lib/exam-data.ts');
const key=`keystone-cima-exam-ui-v1-${LEGACY_EXAM_ID}-${auth.user.id}`;
browser.localStorage.setItem(key,JSON.stringify({flow:'exam',questionIndex:0,screen:'prompt'}));
const el=document.createElement('div');document.body.append(el);let root=createRoot(el);
async function render(){await act(async()=>{root.render(React.createElement(ExamRuntime,{}));await new Promise(r=>setTimeout(r,10));});}
async function click(button){assert.ok(button,'Button exists');await act(async()=>{button.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));button.click();await new Promise(r=>setTimeout(r,10));});}
const button=(scope,text)=>[...scope.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
const failures=[];
async function test(name,run){try{await run();console.log('PASS:',name);}catch(error){failures.push(name);console.error('FAIL:',name,error.stack);}}
function assertQuietAutosave(){
  for(const text of ['Saving...','All changes saved','Autosave ready','Response workspace autosave'])assert.ok(!el.textContent.includes(text),`Routine status must be hidden: ${text}`);
  assert.equal(el.querySelector('svg.lucide-save'),null);
}
await render();
await test('restores prompt screen and profile name; response editor shows current task',async()=>{
  assert.ok(el.textContent.includes('Local Test Student'));assert.ok(el.textContent.includes('You receive the following email'));
  await click([...el.querySelectorAll('footer button')].find(b=>b.textContent.includes('Next')));
  assert.ok(el.querySelector('[aria-label="Section 1 task requirements"]'));assert.ok(el.querySelector('.tiptap'));assert.ok(el.querySelector('.tiptap').textContent.includes('Smart-Print Programme'));
});
await test('real Tiptap typing persists local recovery draft, toolbar formats text and saves before navigation',async()=>{
  const editor=el.querySelector('.tiptap');
  const paragraph=document.createElement('p');paragraph.textContent='Student verification answer';
  await act(async()=>{editor.append(paragraph);await new Promise(r=>setTimeout(r,40));});
  const drafts=JSON.parse(browser.localStorage.getItem(`keystone-cima-answer-drafts-v1:${auth.user.id}-${LEGACY_EXAM_ID}`));
  assert.ok(drafts['section-1'].includes('Student verification answer'));
  await click(el.querySelector('[aria-label="Bold"]'));
  await click([...el.querySelectorAll('footer button')].find(b=>b.textContent.includes('Previous')));assert.ok(el.textContent.includes('You receive the following email'));
  await click([...el.querySelectorAll('footer button')].find(b=>b.textContent.includes('Next')));assert.ok(el.querySelector('.tiptap').textContent.includes('Student verification answer'));
});
await test('routine autosave stays invisible while pending and saved, but real background writes and editable typing continue',async()=>{
  assertQuietAutosave();
  const before=writes.length;
  await act(async()=>{const p=document.createElement('p');p.textContent='Quiet background autosave proof';el.querySelector('.tiptap').append(p);await new Promise(r=>setTimeout(r,40));});
  assertQuietAutosave();assert.equal(el.querySelector('.tiptap').getAttribute('contenteditable'),'true');
  await act(async()=>new Promise(r=>setTimeout(r,1950)));
  assert.ok(writes.length>before);assert.ok(writes.at(-1).answerText.includes('Quiet background autosave proof'));
  assertQuietAutosave();assert.equal(el.querySelector('[aria-label="Progress save warning"]'),null);
  await mkdir('outputs/quiet-autosave',{recursive:true});await writeFile('outputs/quiet-autosave/healthy.html',el.outerHTML);
});
await test('failed autosave remains a visible warning without disabling typing; reconnect saves the draft and clears the warning',async()=>{
  const previousFetch=globalThis.fetch;
  try{
    globalThis.fetch=async()=>{throw new TypeError('Connection interrupted');};
    await act(async()=>{const p=document.createElement('p');p.textContent='Recovery proof after failed save';el.querySelector('.tiptap').append(p);await new Promise(r=>setTimeout(r,40));});
    await act(async()=>new Promise(r=>setTimeout(r,1950)));
    const warning=el.querySelector('[aria-label="Progress save warning"]');assert.ok(warning);assert.equal(warning.getAttribute('role'),'alert');
    assert.ok(warning.textContent.includes('Save failed: Connection interrupted'));assert.ok(warning.textContent.includes('have not synced yet'));
    assert.equal(el.querySelector('.tiptap').getAttribute('contenteditable'),'true');assertQuietAutosave();
    assert.ok(JSON.parse(browser.localStorage.getItem(`keystone-cima-answer-drafts-v1:${auth.user.id}-${LEGACY_EXAM_ID}`))['section-1'].includes('Recovery proof'));
    await writeFile('outputs/quiet-autosave/error.html',el.outerHTML);
    globalThis.fetch=previousFetch;
    await act(async()=>{window.dispatchEvent(new Event('online'));await new Promise(r=>setTimeout(r,30));});
    assert.ok(writes.at(-1).answerText.includes('Recovery proof'));assert.equal(el.querySelector('[aria-label="Progress save warning"]'),null);assertQuietAutosave();
  }finally{globalThis.fetch=previousFetch;}
});
await test('timer sync errors stay visible even on the prompt screen, then clear after recovery',async()=>{
  const previousRpc=client.rpc;
  try{
    await click([...el.querySelectorAll('footer button')].find(b=>b.textContent.includes('Previous')));
    client.rpc=async()=>({error:new Error('Timer unavailable')});
    await act(async()=>{window.dispatchEvent(new Event('online'));await new Promise(r=>setTimeout(r,30));});
    assert.ok(el.querySelector('[aria-label="Progress save warning"]').textContent.includes('Timer sync failed: Timer unavailable'));
    assertQuietAutosave();
    client.rpc=previousRpc;
    await act(async()=>{window.dispatchEvent(new Event('online'));await new Promise(r=>setTimeout(r,30));});
    assert.equal(el.querySelector('[aria-label="Progress save warning"]'),null);
  }finally{
    client.rpc=previousRpc;
    await act(async()=>{window.dispatchEvent(new Event('online'));await new Promise(r=>setTimeout(r,30));});
    if(!el.querySelector('.tiptap'))await click([...el.querySelectorAll('footer button')].find(b=>b.textContent.includes('Next')));
  }
});
await test('Tiptap table grid inserts a 2-by-2 table and includes it in the recovery draft',async()=>{
  await click(button(el,'Table'));await click(el.querySelector('[aria-label="2 columns by 2 rows"]'));
  const table=el.querySelector('.tiptap table');assert.ok(table);assert.equal(table.querySelectorAll('tr').length,2);assert.equal(table.querySelectorAll('td,th').length,4);
  const drafts=JSON.parse(browser.localStorage.getItem(`keystone-cima-answer-drafts-v1:${auth.user.id}-${LEGACY_EXAM_ID}`));assert.ok(drafts['section-1'].includes('<table'));
});
await test('reference and preseen open simultaneously, allow text selection, and drag independently',async()=>{
  await click(button(el,'Reference Material'));await click(button(el,'Pre-seen'));
  const windows=[...document.querySelectorAll('section.fixed')];assert.equal(windows.length,2);
  assert.ok(document.body.textContent.includes('Reference Material'));assert.ok(document.body.textContent.includes('Pre-seen'));
  assert.ok(document.body.textContent.includes('Strategic Case Study Examination'),'Pre-seen viewer derives the official title from the SCS mock level');
  assert.equal(document.querySelectorAll('[aria-label^="Pre-seen page "]').length,4,'Only the bundled 4-page sample exists; real PDF must be uploaded');
  assert.ok(windows.every(w=>w.querySelector('.select-text')));
  const before=windows[1].style.left;const title=windows[0].firstElementChild;
  await act(async()=>{title.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:30,clientY:130}));window.dispatchEvent(new PointerEvent('pointermove',{clientX:100,clientY:200}));window.dispatchEvent(new PointerEvent('pointerup'));});
  assert.equal(windows[1].style.left,before);assert.equal(windows[0].style.left,'94px');
  await click(windows[0].querySelector('[aria-label^="Close"]'));await click(windows[1].querySelector('[aria-label^="Close"]'));
});
await test('calculator arithmetic and scientific functions; scratchpad editing/undo/redo; financial table tabs',async()=>{
  await click(button(el,'Calculator'));let calc=document.querySelector('section.fixed');assert.ok(calc);
  for(const key of ['2','+','3','enter'])await click(button(calc,key));assert.ok(calc.textContent.includes('5'));
  await click(button(calc,'clear'));await click(button(calc,'9'));await click(button(calc,'√'));assert.ok(calc.textContent.includes('3'));
  await click(calc.querySelector('[aria-label^="Close"]'));
  await click(button(el,'Scratch Pad'));const pad=document.querySelector('section.fixed');const area=pad.querySelector('textarea');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(area,'Draft note');area.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(area.value,'Draft note');
  const toolbar=[...pad.querySelectorAll('button')];await click(toolbar.find(b=>b.querySelector('.lucide-undo-2')));assert.equal(area.value,'');await click(toolbar.find(b=>b.querySelector('.lucide-redo-2')));assert.equal(area.value,'Draft note');
  await click(pad.querySelector('[aria-label^="Close"]'));
  await click(button(el,'Tables and Formulae'));const formula=document.querySelector('[role=dialog]');assert.ok(formula);assert.equal(formula.querySelectorAll('[role=tab]').length,3);
  for(const tab of formula.querySelectorAll('[role=tab]')){await click(tab);assert.equal(tab.getAttribute('data-state'),'active');assert.ok(formula.querySelector('table'));}
  await click(formula.querySelector('[aria-label="Close tables and formulae"]'));
});
await test('two-step section confirmation advances to question 2, refresh restores same screen',async()=>{
  await click([...el.querySelectorAll('footer button')].find(b=>b.textContent.includes('Next')));
  let dialog=document.querySelector('[role=alertdialog]');assert.ok(dialog);await click(button(dialog,'Next'));
  dialog=document.querySelector('[role=alertdialog]');assert.ok(dialog.textContent.includes('Confirm Section Submission'));await click(button(dialog,'Yes, End Section'));
  await act(async()=>new Promise(r=>setTimeout(r,850)));assert.ok(el.textContent.includes('Question 2 of 3'));assert.ok(writes.some(w=>w.questionId==='section-1'));
  await click([...el.querySelectorAll('footer button')].find(b=>b.textContent.includes('Next')));
  await act(async()=>root.unmount());root=createRoot(el);await render();assert.ok(el.textContent.includes('Question 2 of 3'));assert.ok(el.querySelector('.tiptap'));
});
await test('dashboard exit saves drafts and timer without submitting; failed saves keep the attempt open',async()=>{
  const previousFetch=globalThis.fetch;
  const editor=el.querySelector('.tiptap');
  await act(async()=>{const p=document.createElement('p');p.textContent='Pending draft before exit';editor.append(p);await new Promise(r=>setTimeout(r,40));});
  globalThis.fetch=async()=>new Response('{"error":"Offline save"}',{status:503});
  await click(button(el,'Exit to Dashboard'));
  assert.equal(navigations.length,0);assert.ok(el.textContent.includes('Your latest answer could not be saved'));assert.equal(completions,0);
  let timerSynced=false;const previousRpc=client.rpc;client.rpc=async()=>{timerSynced=true;return{error:null};};
  globalThis.fetch=previousFetch;await click(button(el,'Exit to Dashboard'));
  assert.equal(navigations.at(-1),'/dashboard');assert.ok(timerSynced);assert.equal(completions,0);
  client.rpc=previousRpc;
  // Real navigation unmounts the runtime; remount to continue submission scenarios.
  await act(async()=>root.unmount());root=createRoot(el);await render();
});
await test('manual submission requires confirmation, completes session and removes editable exam',async()=>{
  await click([...el.querySelectorAll('footer button')].find(b=>b.textContent.includes('Finish')));let dialog=document.querySelector('[role=alertdialog]');assert.ok(dialog);assert.equal(completions,0);
  await click(button(dialog,'Submit Exam'));await act(async()=>new Promise(r=>setTimeout(r,850)));
  assert.equal(completions,1);assert.ok(el.textContent.includes('Mock Submitted Successfully'));assert.ok(el.textContent.includes('Your answer has been submitted for tutor review.'));assert.equal(el.querySelector('[contenteditable=true]'),null);
});
await test('zero-time failed submission locks typing AND formatting controls without claiming success',async()=>{
  await act(async()=>root.unmount());browser.localStorage.setItem(key,JSON.stringify({flow:'exam',questionIndex:2,screen:'answer'}));
  client.from=()=>({select(){return this;},eq(){return this;},single:async()=>({data:{status:'in_progress',active_question_id:'section-3',question_timers:{'section-3':{remaining_seconds:0,synced_at:new Date().toISOString()}}},error:null})});
  globalThis.fetch=async()=>{throw new TypeError('Offline at time up');};root=createRoot(el);await render();await act(async()=>new Promise(r=>setTimeout(r,1200)));
  assert.equal(el.querySelector('.tiptap').getAttribute('contenteditable'),'false');assert.equal(el.querySelector('fieldset[aria-label="Response formatting"]').disabled,true);assert.ok(el.textContent.includes('Save failed:'));
  assert.equal(completions,1,'Failed flush must not mark another completion');
});
await test('custom three-subtask marks render in both prompt and response requirements without affecting editing',async()=>{
  await act(async()=>root.unmount());
  const examId='00000000-0000-4000-8000-000000000012';
  browser.localStorage.setItem(`keystone-cima-exam-ui-v1-${examId}-${auth.user.id}`,JSON.stringify({flow:'exam',questionIndex:0,screen:'prompt'}));
  client.from=()=>({select(){return this;},eq(){return this;},single:async()=>({data:{status:'in_progress',active_question_id:null,question_timers:{}},error:null})});
  globalThis.fetch=async()=>new Response('{"saved":true}');
  const question={...questionsData[0],weightageUnit:'marks',subtasks:[{description:'Custom strategy task',weightage:10},{description:'Custom funding task',weightage:20},{description:'Custom risk task',weightage:7.5}]};
  root=createRoot(el);await act(async()=>{root.render(React.createElement(ExamRuntime,{examId,initialQuestions:[question]}));await new Promise(r=>setTimeout(r,20));});
  assert.ok(el.textContent.includes('Custom risk task'));assert.ok(el.textContent.includes('[sub task (c) = 7.5 marks]'));
  await click([...el.querySelectorAll('footer button')].find(b=>b.textContent.includes('Next')));
  const requirements=el.querySelector('[aria-label="Section 1 task requirements"]');
  assert.equal(requirements.querySelectorAll('li').length,3);assert.ok(requirements.textContent.includes('Custom funding task'));
  assert.ok(requirements.textContent.includes('[sub task (c) = 7.5 marks]'));assert.equal(el.querySelector('.tiptap').getAttribute('contenteditable'),'true');
});
await test('OCS introductory screens use the mock name and configured total minutes rather than strategic-only labels',async()=>{
  await act(async()=>root.unmount());
  const examId='00000000-0000-4000-8000-000000000013';
  const question={...questionsData[0],timeMinutes:30};
  root=createRoot(el);await act(async()=>{root.render(React.createElement(ExamRuntime,{examId,examName:'Operational Case Study — Mock 1',examLevel:'OCS',initialQuestions:[question]}));await new Promise(r=>setTimeout(r,20));});
  assert.ok(el.textContent.includes('Operational Case Study — Mock 1'));assert.ok(el.textContent.includes('30 minutes'));assert.ok(!el.textContent.includes('Strategic Case Study Exam'));
  await click(el.querySelector('#welcome-next-button'));assert.ok(el.textContent.includes('Operational Case Study — Mock 1'));assert.ok(!el.textContent.includes('Strategic Case Study Exam'));
});
await test('OCS and MCS pre-seen viewers use their current exam level',async()=>{
  await act(async()=>root.unmount());
  const examId='00000000-0000-4000-8000-000000000014';
  const question={...questionsData[0],timeMinutes:30};
  browser.localStorage.setItem(`keystone-cima-exam-ui-v1-${examId}-${auth.user.id}`,JSON.stringify({flow:'exam',questionIndex:0,screen:'prompt'}));
  root=createRoot(el);await act(async()=>{root.render(React.createElement(ExamRuntime,{examId,examName:'Operational Case Study — Mock 2',examLevel:'OCS',initialQuestions:[question]}));await new Promise(r=>setTimeout(r,20));});
  await click(button(el,'Pre-seen'));assert.ok(el.textContent.includes('Operational Case Study Examination'),'Pre-seen viewer uses the OCS title');
  await act(async()=>root.unmount());
  const mcsExamId='00000000-0000-4000-8000-000000000015';
  browser.localStorage.setItem(`keystone-cima-exam-ui-v1-${mcsExamId}-${auth.user.id}`,JSON.stringify({flow:'exam',questionIndex:0,screen:'prompt'}));
  root=createRoot(el);await act(async()=>{root.render(React.createElement(ExamRuntime,{examId:mcsExamId,examName:'Management Case Study — Mock 1',examLevel:'MCS',initialQuestions:[question]}));await new Promise(r=>setTimeout(r,20));});
  await click(button(el,'Pre-seen'));
  assert.ok(el.textContent.includes('Management Case Study Examination'),'Pre-seen viewer uses the MCS title');
});
await test('student login ignores an exam return URL and always lands on the shared dashboard',async()=>{
  await act(async()=>root.unmount());
  const destinations=[];browser.location.replace=url=>destinations.push(url);
  browser.history.replaceState({},'',`/student/login?next=/exam/${LEGACY_EXAM_ID}`);
  const {default:StudentLogin}=load('app/student/login/page.tsx');
  root=createRoot(el);await act(async()=>{root.render(React.createElement(StudentLogin));await new Promise(r=>setTimeout(r,20));});
  assert.deepEqual(destinations,['/dashboard']);
});
await act(async()=>root.unmount());await browser.happyDOM.close();if(failures.length)process.exitCode=1;

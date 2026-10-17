import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from '../node_modules/typescript/lib/typescript.js';
import React, { act } from '../node_modules/react/index.js';
import { createRoot } from '../node_modules/react-dom/client.js';
import { Window } from 'happy-dom';

const browser = new Window({url:'http://localhost:3001'});
for (const key of ['window','document','HTMLElement','Event']) globalThis[key] = key === 'window' ? browser : browser[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.testSupabase = {auth:{refreshSession:async()=>({error:null})}};
const supabaseModule = 'data:text/javascript,' + encodeURIComponent('export const isSupabaseConfigured=true; export const createClient=()=>globalThis.testSupabase;');
async function loadHook(file) {
  const source = (await readFile(new URL(`../hooks/${file}.ts`,import.meta.url),'utf8'))
    .replace('from "react"',`from ${JSON.stringify(new URL('../node_modules/react/index.js',import.meta.url).href)}`)
    .replace('from "@/lib/supabase/client"',`from ${JSON.stringify(supabaseModule)}`);
  const js = ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022});
  return (await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64')))[file];
}
const useExamAutosave = await loadHook('useExamAutosave');
const useExamTimer = await loadHook('useExamTimer');
const useExamMaterialUrl = await loadHook('useExamMaterialUrl');
const delay = ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function mount(hook,initialProps) {
  let result;
  const root = createRoot(document.createElement('div'));
  function Harness(props) { result=hook(props); return null; }
  async function render(props) { await act(async()=>root.render(React.createElement(Harness,props))); }
  await render(initialProps);
  return {get result(){return result;},render,unmount:()=>act(async()=>root.unmount())};
}
const tests=[];
async function test(name,run) { try { await run(); console.log('PASS:',name); } catch(error) { tests.push(name);console.error('FAIL:',name,error.message); } }
const ok=()=>Promise.resolve(new Response('{"saved":true}',{status:200}));
await test('restored initial draft is saved, and unload sends a best-effort keepalive request',async()=>{
  const writes=[];globalThis.fetch=async(_url,options)=>{writes.push(options);return ok();};
  const app=await mount(useExamAutosave,{sessionId:'recover-session',questionId:'section-2',answerText:'Recovered browser draft',debounceMs:10000});
  try{await act(async()=>browser.dispatchEvent(new Event('pagehide')));assert.equal(writes[0].keepalive,true);await act(async()=>assert.equal(await app.result.flush(),true));assert.equal(app.result.saveState,'saved');}finally{await app.unmount();}
});

await test('question 2 debounced save, flush before submission and session-isolated draft',async()=>{
  const writes=[];globalThis.fetch=async(_url,options)=>{writes.push(JSON.parse(options.body));return ok();};
  const props={sessionId:'session-a',questionId:'section-1',answerText:'memo',debounceMs:20};
  const app=await mount(useExamAutosave,props);
  try {
    await app.render({...props,questionId:'section-2',answerText:'Q2 draft'});
    assert.equal(app.result.saveState,'saving');
    await act(async()=>delay(50));
    assert.equal(writes.at(-1).questionId,'section-2');
    assert.equal(app.result.saveState,'saved');
    await app.render({...props,questionId:'section-2',answerText:'pending latest'});
    let saved;await act(async()=>{saved=await app.result.flush();});
    assert.equal(saved,true);assert.equal(writes.at(-1).answerText,'pending latest');
    await app.render({...props,sessionId:'session-b',questionId:'section-2',answerText:'pending latest'});
    await act(async()=>delay(50));
    assert.equal(writes.at(-1).sessionId,'session-b','Identical text must save in a different exam session');
  } finally {await app.unmount();}
});
await test('offline save reports error without throwing; reconnect retries',async()=>{
  globalThis.fetch=async()=>{throw new TypeError('Network disconnected');};
  const props={sessionId:'offline-session',questionId:'section-2',answerText:'initial',debounceMs:10000};
  const app=await mount(useExamAutosave,props);
  try {
    await app.render({...props,answerText:'unsaved draft'});
    let saved;await act(async()=>{saved=await app.result.flush();});
    assert.equal(saved,false);assert.equal(app.result.saveState,'error');
    globalThis.fetch=ok;
    await act(async()=>browser.dispatchEvent(new Event('online')));
    await act(async()=>delay(30));
    assert.equal(app.result.saveState,'saved');
  } finally {await app.unmount();}
});
await test('expired access token refreshes once and retries idempotent save',async()=>{
  let requests=0,refreshes=0;
  globalThis.fetch=async()=>++requests===1?new Response('{"error":"Expired"}',{status:401}):ok();
  globalThis.testSupabase={auth:{refreshSession:async()=>{refreshes++;return{error:null};}}};
  const props={sessionId:'session-refresh',questionId:'section-2',answerText:'initial',debounceMs:10000};
  const app=await mount(useExamAutosave,props);
  try {await app.render({...props,answerText:'new'});await act(async()=>assert.equal(await app.result.flush(),true));assert.equal(requests,2);assert.equal(refreshes,1);}finally{await app.unmount();}
});
await test('overlapping saves serialize so an old answer cannot overwrite the new answer',async()=>{
  const pending=[],writes=[];
  globalThis.fetch=async(_url,options)=>{writes.push(JSON.parse(options.body).answerText);return new Promise(resolve=>pending.push(()=>resolve(new Response('{"saved":true}'))));};
  const props={sessionId:'race-session',questionId:'section-2',answerText:'initial',debounceMs:10000};
  const app=await mount(useExamAutosave,props);
  try {
    await app.render({...props,answerText:'old'});
    let first;await act(async()=>{first=app.result.flush();});
    await app.render({...props,answerText:'new'});
    let second;await act(async()=>{second=app.result.flush();});
    assert.deepEqual(writes,['old'],'Second request waits for first');
    await act(async()=>{pending.shift()();await first;});
    await act(async()=>{await delay(0);});
    assert.deepEqual(writes,['old','new']);
    await act(async()=>{pending.shift()();assert.equal(await second,true);});
  } finally {pending.forEach(resolve=>resolve());await app.unmount();}
});

const originalNow=Date.now;
const originalInterval=browser.setInterval.bind(browser),originalClear=browser.clearInterval.bind(browser);
let now=Date.now(),intervalId=0;const intervals=new Map();
Date.now=()=>now;
browser.setInterval=(fn,ms)=>{intervals.set(++intervalId,{fn,ms});return intervalId;};
browser.clearInterval=id=>intervals.delete(id);
const tick=async ms=>{now+=ms;await act(async()=>{for(const {fn,ms:every} of [...intervals.values()])if(every<=ms)fn();await delay(0);});};
function timerSupabase(read) {return {rpc:async()=>({error:null}),from:()=>({select(){return this;},eq(){return this;},single:read})};}
await test('per-question timer resumes server elapsed time, syncs every 30s and time-up fires once',async()=>{
  const syncs=[];let timeUps=0;
  globalThis.testSupabase=timerSupabase(async()=>({data:{status:'in_progress',active_question_id:'q1',question_timers:{q1:{remaining_seconds:60,synced_at:new Date(now-10000).toISOString()},q2:{remaining_seconds:90,synced_at:new Date(now-600000).toISOString()}}},error:null}));
  globalThis.testSupabase.rpc=async(_name,payload)=>{syncs.push(payload);return{error:null};};
  const props={sessionId:'session-timer',questionId:'q1',initialTimeRemainingSeconds:3600,onTimeUp:()=>{timeUps++;}};
  const app=await mount(useExamTimer,props);
  try {
    assert.equal(app.result.timeRemainingSeconds,50);
    await tick(30000);assert.equal(app.result.timeRemainingSeconds,20);assert.equal(syncs.at(-1).p_remaining_seconds,20);
    await app.render({...props,questionId:'q2'});assert.equal(app.result.timeRemainingSeconds,90,'Inactive question is paused');
    await tick(1000);assert.equal(app.result.timeRemainingSeconds,89);
    await tick(89000);assert.equal(app.result.timeRemainingSeconds,0);assert.equal(timeUps,1);
    await tick(1000);assert.equal(timeUps,1);
  } finally {await app.unmount();}
});
await test('late server read for previous question cannot overwrite current question timer',async()=>{
  const pending=[];
  globalThis.testSupabase=timerSupabase(()=>new Promise(resolve=>pending.push(resolve)));
  const props={sessionId:'session-race',questionId:'q1',initialTimeRemainingSeconds:3600,onTimeUp:()=>{}};
  const app=await mount(useExamTimer,props);
  const data=q=>({data:{status:'in_progress',active_question_id:q,question_timers:{[q]:{remaining_seconds:q==='q1'?15:200,synced_at:new Date(now).toISOString()}}},error:null});
  try {
    await app.render({...props,questionId:'q2'});
    await act(async()=>{pending[1](data('q2'));await delay(0);});assert.equal(app.result.timeRemainingSeconds,200);
    await act(async()=>{pending[0](data('q1'));await delay(0);});assert.equal(app.result.timeRemainingSeconds,200);
  } finally {await app.unmount();}
});
await test('time-up failure stays locked and retries submission after reconnection',async()=>{
  let attempts=0;globalThis.testSupabase=timerSupabase(async()=>({data:{status:'in_progress',active_question_id:'q1',question_timers:{q1:{remaining_seconds:0,synced_at:new Date(now).toISOString()}}},error:null}));
  const app=await mount(useExamTimer,{sessionId:'timeout-offline',questionId:'q1',initialTimeRemainingSeconds:0,onTimeUp:()=>++attempts>1});
  try {assert.equal(attempts,1);assert.equal(app.result.timeRemainingSeconds,0);await tick(1000);assert.equal(attempts,1,'Do not hammer failed submissions');await act(async()=>browser.dispatchEvent(new Event('online')));await tick(1000);assert.equal(attempts,2,'Retry failed time-up on reconnect');await tick(30000);assert.equal(attempts,2,'Successful time-up is final');}finally{await app.unmount();}
});
await test('missing server timer after initial failed sync cannot reset elapsed local time',async()=>{
  globalThis.testSupabase=timerSupabase(async()=>({data:{status:'in_progress',active_question_id:null,question_timers:{}},error:null}));
  globalThis.testSupabase.rpc=async()=>({error:{message:'Offline sync'}});
  const app=await mount(useExamTimer,{sessionId:'missing-timer',questionId:'q1',initialTimeRemainingSeconds:3600,onTimeUp:()=>{}});
  try{assert.ok(app.result.syncError);await tick(30000);assert.equal(app.result.timeRemainingSeconds,3570);globalThis.testSupabase.rpc=async()=>({error:null});await act(async()=>{await app.result.reconcile();});assert.equal(app.result.timeRemainingSeconds,3570,'Reconnect must not grant another 30 seconds');}finally{await app.unmount();}
});
await test('signed PDF URL renewal reports network errors instead of an unhandled rejection',async()=>{
  globalThis.testSupabase={storage:{from:()=>({createSignedUrl:async()=>{throw new TypeError('PDF network disconnected');}})}};
  const app=await mount(()=>useExamMaterialUrl('test-owner/preseen.pdf',true),{});
  try{assert.equal(app.result.url,null);assert.match(app.result.error,/PDF network disconnected/);}finally{await app.unmount();}
});
Date.now=originalNow;browser.setInterval=originalInterval;browser.clearInterval=originalClear;
await browser.happyDOM.close();
if(tests.length){console.error(`${tests.length} failing hook scenarios`);process.exitCode=1;}

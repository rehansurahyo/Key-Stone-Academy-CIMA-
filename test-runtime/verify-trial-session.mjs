import assert from 'node:assert/strict';
import React,{act} from '../node_modules/react/index.js';
import {Window} from 'happy-dom';
import {loader} from './component-loader.mjs';
const browser=new Window({url:'http://localhost:3001'});
globalThis.window=browser;globalThis.document=browser.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('../node_modules/react-dom/client.js');
let rows=[],insertions=0,loseRace=false,denyInsert=false,networkError=false;
const row=status=>({id:'attempt-one',status,duration_seconds:3600,time_remaining_seconds:3300,question_timers:{'section-1':{remaining_seconds:3300,synced_at:'2026-10-28T00:00:00Z'}},updated_at:'2026-10-28T00:00:00Z'});
const client={auth:{getUser:async()=>({data:{user:{id:'trial-student',user_metadata:{}}},error:null})},from(table){
  const filters=[];
  const query={select(){return this;},eq(key,value){filters.push([key,[value]]);return this;},in(key,value){filters.push([key,value]);return this;},order(){return this;},limit(){return this;},
    async maybeSingle(){
      if(networkError)throw new Error('Network unavailable');
      if(table==='profiles')return{data:{id:'trial-student'},error:null};
      return{data:rows.find(item=>filters.every(([key,values])=>!(key in item)||values.includes(item[key])))??null,error:null};
    },
    insert(){insertions++;return{select(){return this;},async single(){
      if(loseRace){rows=[row('in_progress')];return{data:null,error:{code:'23505',message:'Already used'}};}
      if(denyInsert)return{data:null,error:{code:'23505',message:'Your free-trial attempt has already been used.'}};
      const data=row('in_progress');rows=[data];return{data,error:null};
    }};},
    then(resolve){resolve({data:[{question_id:'section-1',answer_text:'Recovered answer'}],error:null});},
  };return query;
}};
const load=loader({'@/lib/supabase/client':{isSupabaseConfigured:true,createClient:()=>client}});
const {useStudentExamSession}=load('hooks/useStudentExamSession.ts');
async function mount(active=true,isTrial=true){
  let state;const root=createRoot(document.createElement('div'));
  function Harness(){state=useStudentExamSession(active,'exam',3600,isTrial);return null;}
  await act(async()=>{root.render(React.createElement(Harness));await new Promise(r=>setTimeout(r,10));});
  return{get state(){return state;},unmount:()=>act(async()=>root.unmount())};
}
try{
  let app=await mount(false);assert.equal(insertions,0);await app.unmount();
  app=await mount();assert.equal(insertions,1);assert.equal(app.state.sessionId,'attempt-one');assert.equal(app.state.completed,false);await app.unmount();
  app=await mount();assert.equal(insertions,1);assert.equal(app.state.answers['section-1'],'Recovered answer');await app.unmount();
  rows=[row('completed')];app=await mount();assert.equal(insertions,1);assert.equal(app.state.completed,true);await app.unmount();
  console.log('PASS: no start before activation, one trial insert, active resume and completed history never create a retake');
  rows=[];loseRace=true;app=await mount();assert.equal(app.state.sessionId,'attempt-one');assert.equal(app.state.error,null);await app.unmount();loseRace=false;
  rows=[];denyInsert=true;app=await mount();assert.equal(app.state.sessionId,null);assert.match(app.state.error,/already been used/);await app.unmount();denyInsert=false;
  console.log('PASS: racing trial tab resumes the winning attempt; deleted/spent attempt returns a visible error');
  networkError=true;app=await mount();assert.equal(app.state.loading,false);assert.match(app.state.error,/Network unavailable/);await app.unmount();networkError=false;
  rows=[row('completed')];const before=insertions;app=await mount(true,false);assert.equal(insertions,before+1);await app.unmount();
  console.log('PASS: connection failures are visible and enrolled session behavior is preserved');
}finally{await browser.happyDOM.close();}

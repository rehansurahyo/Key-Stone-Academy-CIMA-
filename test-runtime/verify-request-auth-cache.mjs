// Run with node --conditions=react-server to exercise React's real RSC cache.
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {PassThrough} from 'node:stream';
import React from '../node_modules/react/index.js';
import {renderToPipeableStream} from '../node_modules/react-server-dom-webpack/server.node.js';
import {loader} from './component-loader.mjs';

const requests=new AsyncLocalStorage();
const load=loader({'server-only':{},'next/navigation':{redirect(){throw Error('unexpected redirect');}},'@/lib/supabase/server':{async createClient(){
  const state=requests.getStore();state.clients++;
  return{auth:{async getUser(){state.auth++;return{data:{user:state.signedIn?{id:state.id}:null},error:null};}},from(){return{select(){return this;},eq(){return this;},async single(){state.profiles++;return{data:{id:state.id,role:state.role,is_active:state.active},error:null};}};}};
}}});
const {requirePortalUser}=load('lib/dashboard/auth.ts');
async function Probe(){
  try{const [layout,page]=await Promise.all([requirePortalUser(),requirePortalUser()]);assert.equal(layout,page);return React.createElement('p',null,layout.profile.id+':'+layout.profile.role);}
  catch(error){return React.createElement('p',null,'Denied '+error.status);}
}
function render(values){const state={clients:0,auth:0,profiles:0,signedIn:true,active:true,...values};
  return requests.run(state,()=>new Promise((resolve,reject)=>{
    let text='';const output=new PassThrough();output.on('data',chunk=>text+=chunk);output.on('error',reject);output.on('end',()=>resolve({state,text}));
    renderToPipeableStream(React.createElement(Probe),{}, {onError:reject}).pipe(output);
  }));
}
const [admin,student]=await Promise.all([render({id:'admin-one',role:'admin'}),render({id:'student-two',role:'student'})]);
for(const result of [admin,student]){
  assert.equal(result.state.clients,1);assert.equal(result.state.auth,1);assert.equal(result.state.profiles,1);
  assert.ok(result.text.includes(result.state.id+':'+result.state.role));
}
assert.ok(!admin.text.includes('student-two'));assert.ok(!student.text.includes('admin-one'));
const suspended=await render({id:'admin-one',role:'admin',active:false});assert.ok(suspended.text.includes('Denied 403'));assert.equal(suspended.state.auth,1);
const anonymous=await render({id:'anonymous',signedIn:false});assert.ok(anonymous.text.includes('Denied 401'));assert.equal(anonymous.state.profiles,0);
console.log('PASS: real concurrent RSC renders verify auth once each, isolate users and recheck revoked/expired access on the next request');

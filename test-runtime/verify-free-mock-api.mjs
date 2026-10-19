import assert from 'node:assert/strict';
import { loader } from './component-loader.mjs';

const first='00000000-0000-4000-8000-000000007701',second='00000000-0000-4000-8000-000000007702',mcs='00000000-0000-4000-8000-000000007703';
let role='admin',active=true,signedIn=true,examStatus='published',examLevel='OCS',examRevision=3,examVisible=true,dbError=null,race=false;
let mappings=new Map([['OCS',first],['MCS',mcs]]),writes=0;
const touched=[];
const client={auth:{getUser:async()=>({data:{user:signedIn?{id:'current-admin'}:null},error:null})},from(table){
  touched.push(table);
  let action='read',payload,filters={};
  const query={select(){return this;},eq(key,value){filters[key]=value;return this;},update(value){action='update';payload=value;return this;},insert(value){action='insert';payload=value;return this;},single:async()=>({data:{id:'current-admin',role,is_active:active},error:null}),async maybeSingle(){
    if(dbError)return {data:null,error:dbError};
    if(table==='exams')return {data:examVisible?{id:filters.id,status:examStatus,level:examLevel,revision:examRevision}:null,error:null};
    assert.equal(table,'trial_exam_access');
    if(action==='read')return {data:mappings.has(filters.level)?{exam_id:mappings.get(filters.level)}:null,error:null};
    if(race){mappings.set(filters.level||payload.level,mcs);race=false;}
    writes++;
    if(action==='insert'){
      if(mappings.has(payload.level))return {data:null,error:{code:'23505'}};
      mappings.set(payload.level,payload.exam_id);return {data:payload,error:null};
    }
    if(mappings.get(filters.level)!==filters.exam_id)return {data:null,error:null};
    mappings.set(filters.level,payload.exam_id);return {data:{level:filters.level,exam_id:payload.exam_id},error:null};
  }};return query;
}};
const load=loader({'server-only':{},'next/navigation':{redirect(){throw Error('Unexpected redirect');}},'@/lib/supabase/server':{createClient:async()=>client}});
const {PUT}=load('app/api/dashboard/free-mock/route.ts');
const body=()=>({exam_id:second,level:'OCS',revision:3,previous_exam_id:first});
const send=(value=body(),origin='https://portal.example.test')=>PUT(new Request('https://portal.example.test/api/dashboard/free-mock',{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(value)}));
for(const [nextRole,nextActive,expected] of [['student',true,403],['tutor',true,403],['admin',false,403]]){
  role=nextRole;active=nextActive;assert.equal((await send()).status,expected);assert.equal(writes,0);
}
role='admin';active=true;signedIn=false;assert.equal((await send()).status,401);signedIn=true;
assert.equal((await send(body(),'https://attacker.example')).status,403);
assert.equal((await send({...body(),level:'BAD'})).status,400);
assert.equal((await send({...body(),existing_students:true})).status,400);
for(const status of ['draft','archived']){examStatus=status;assert.equal((await send()).status,409);}examStatus='published';
examLevel='MCS';assert.equal((await send()).status,409);examLevel='OCS';
examRevision=4;assert.equal((await send()).status,409);examRevision=3;
examVisible=false;assert.equal((await send()).status,404);examVisible=true;
assert.equal(writes,0);
let response=await send();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.deepEqual(await response.json(),{id:second});
assert.equal(mappings.get('OCS'),second);assert.equal(mappings.get('MCS'),mcs);
const once=writes;assert.equal((await send()).status,200);assert.equal(writes,once,'Retry selecting the same mock is idempotent');
assert.equal((await send({...body(),exam_id:first})).status,409,'Stale confirmation cannot replace a newer choice');
mappings.set('OCS',first);race=true;assert.equal((await send()).status,409);assert.equal(mappings.get('OCS'),mcs,'A concurrent write is not overwritten');
mappings.delete('OCS');assert.equal((await send({...body(),previous_exam_id:null})).status,200,'First selection inserts a mapping');
mappings.delete('OCS');race=true;assert.equal((await send({...body(),previous_exam_id:null})).status,409,'Concurrent first selections respect the primary key');
dbError={code:'XX000',message:'private backend details'};response=await send();assert.equal(response.status,503);assert.ok(!(await response.text()).includes('private backend'));
assert.ok(touched.every(table=>['profiles','exams','trial_exam_access'].includes(table)),'No sessions, answers, evaluations or student grants are written');
console.log('PASS: real API enforces active-admin-only auth, origin/level/status/revision checks, atomic compare-and-set, idempotency, safe errors and no historical writes');

// A fresh server-rendered dashboard must load the saved mapping, not reset to
// Mock 1 or trust a role supplied by the browser.
let mappingReadError=null;
const pageTables=[];
const pageClient={rpc:async()=>({data:[],error:null}),from(table){
  pageTables.push(table);
  return {select(){return this;},eq(){return this;},neq(){return this;},order(){return this;},range(){return this;},then(resolve){
    return Promise.resolve({data:table==='exams'?[{id:second,name:'OCS Mock 2',level:'OCS',status:'published',revision:3,questions:[],materials:[]}]:[{level:'OCS',exam_id:second}],count:1,error:table==='trial_exam_access'?mappingReadError:null}).then(resolve);
  }};
}};
const Library=()=>null;
const pageLoad=loader({'@/lib/dashboard/auth':{requireStaffPage:async()=>({supabase:pageClient,profile:{role}})},'@/components/dashboard/mock-exam-library':{MockExamLibrary:Library}});
const {default:ExamsPage}=pageLoad('app/dashboard/exams/page.tsx');
for(const testRole of ['admin','tutor']){
  role=testRole;pageTables.length=0;
  const output=await ExamsPage({searchParams:Promise.resolve({})});
  const props=output.props.children.flat(Infinity).find(child=>child?.type===Library).props;
  assert.equal(props.canSetFreeMock,testRole==='admin');
  assert.deepEqual(props.freeMockIds,testRole==='admin'?{OCS:second}:{});
  assert.equal(pageTables.includes('trial_exam_access'),testRole==='admin');
}
role='admin';mappingReadError={message:'Unavailable'};
const failedPage=await ExamsPage({searchParams:Promise.resolve({})});
assert.equal(failedPage.props.children.flat(Infinity).find(child=>child?.type===Library).props.freeMockReady,false);
console.log('PASS: fresh admin page loads the persisted free selection; tutors receive no controls; failed mapping reads disable changes');

import assert from 'node:assert/strict';
import {loader} from './component-loader.mjs';

const actor='00000000-0000-4000-8000-000000008001',student='00000000-0000-4000-8000-000000008002',tutor='00000000-0000-4000-8000-000000008003',otherAdmin='00000000-0000-4000-8000-000000008004';
let role='admin',active=true,signedIn=true,profileFailure=false,deleteFailure=false;
const targets=new Map([[student,'student'],[tutor,'tutor'],[otherAdmin,'admin']]),removed=[];
let adminClients=0;
const client={auth:{getUser:async()=>({data:{user:signedIn?{id:actor}:null},error:null})},from(table){assert.equal(table,'profiles');let id;return{select(){return this;},eq(_field,value){id=value;return this;},single:async()=>id===actor?{data:{id:actor,role,is_active:active},error:null}:profileFailure?{data:null,error:{code:'XX000'}}:targets.has(id)?{data:{role:targets.get(id)},error:null}:{data:null,error:{code:'PGRST116'}}};}};
const load=loader({'server-only':{},'@/lib/supabase/server':{createClient:async()=>client},'@/lib/supabase/admin':{createAdminClient:async()=>{adminClients++;return{auth:{admin:{deleteUser:async id=>{if(deleteFailure)return{error:{message:'Account still owns uploaded files'}};removed.push(id);targets.delete(id);return{error:null};}}}};}}});
const {DELETE}=load('app/api/dashboard/users/[id]/route.ts');
function send(id=student,body={confirmation:'DELETE'},origin='https://portal.example.test'){
  return DELETE(new Request('https://portal.example.test/api/dashboard/users/'+id,{method:'DELETE',headers:{Origin:origin,'Content-Type':'application/json'},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)}),{params:Promise.resolve({id})});
}
for(const[r,a]of[['student',true],['tutor',true],['admin',false]]){role=r;active=a;assert.equal((await send()).status,403);}
role='admin';active=true;signedIn=false;assert.equal((await send()).status,401);signedIn=true;
assert.equal((await send(student,{confirmation:'DELETE'},'https://attacker.example')).status,403);
for(const id of [actor,otherAdmin])assert.equal((await send(id)).status,403);
assert.equal((await send('missing')).status,404);
profileFailure=true;assert.equal((await send()).status,503);profileFailure=false;
for(const body of [{},'{bad',{confirmation:'delete'},{confirmation:'DELETE',ids:[otherAdmin]}])assert.equal((await send(student,body)).status,400);
assert.equal(adminClients,0);assert.equal(removed.length,0,'Denied or unconfirmed requests must never call privileged Auth deletion');
deleteFailure=true;assert.equal((await send()).status,400);assert.equal(removed.length,0);deleteFailure=false;
const response=await send();assert.equal(response.status,200);assert.deepEqual(await response.json(),{deleted:true});assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(removed,[student]);assert.equal(targets.get(otherAdmin),'admin');assert.equal(targets.get(tutor),'tutor');
assert.equal((await send(tutor)).status,200);assert.deepEqual(removed,[student,tutor]);
console.log('PASS: account deletion remains active-admin-only with same-origin and exact confirmation checks; self/admin/missing/profile-error targets never reach Auth deletion');
console.log('PASS: only explicitly selected student/tutor IDs are removed; ownership failures are visible and other accounts remain untouched');

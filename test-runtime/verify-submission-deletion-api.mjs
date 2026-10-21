import assert from 'node:assert/strict';
import { loader } from './component-loader.mjs';

const id='00000000-0000-4000-8000-000000007800';
const path=`tutor/${id}/feedback.pdf`;
let role='admin',active=true,signedIn=true,rpcError=null,paths=[],storageError=null,ackError=null,configError=false;
const calls=[],removed=[];let adminCreated=0;
const client={auth:{getUser:async()=>({data:{user:signedIn?{id:'admin'}:null},error:null})},from(table){
  assert.equal(table,'profiles');return {select(){return this;},eq(){return this;},single:async()=>({data:{role,is_active:active},error:null})};
},async rpc(name,args){
  calls.push({name,args});
  if(name==='delete_exam_submission')return {data:rpcError?null:{pending_report_paths:[...paths]},error:rpcError};
  assert.equal(name,'ack_submission_report_cleanup');assert.equal(args.p_submission_id,id);
  if(ackError)return {data:null,error:ackError};
  paths=paths.filter(path=>!args.p_paths.includes(path));return {data:paths.length,error:null};
}};
const load=loader({'server-only':{},'next/navigation':{redirect(){throw Error('Unexpected redirect');}},
  '@/lib/supabase/server':{createClient:async()=>client},
  '@/lib/supabase/admin':{createAdminClient:async()=>{
    adminCreated++;if(configError)throw Error('private service secret');
    return {storage:{from(bucket){assert.equal(bucket,'graded-reports');return {remove:async batch=>{removed.push(batch);return {data:null,error:storageError};}};}}};
  }},
});
const {DELETE}=load('app/api/dashboard/submissions/[id]/route.ts');
const payload=()=>({revision:2,confirmation:'DELETE'});
function send(body=payload(),options={}){
  return DELETE(new Request('https://portal.example.test/api/dashboard/submissions/'+(options.id||id),{
    method:'DELETE',headers:{Origin:options.origin??'https://portal.example.test','Content-Type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body),
  }),{params:Promise.resolve({id:options.id||id})});
}
for(const [r,a,expected] of [['student',true,403],['tutor',true,403],['admin',false,403]]){
  role=r;active=a;assert.equal((await send()).status,expected);
}
role='admin';active=true;signedIn=false;assert.equal((await send()).status,401);signedIn=true;
assert.equal((await send(payload(),{origin:'https://attacker.example'})).status,403);
for(const value of ['{bad',{}, {...payload(),confirmation:'delete'},{...payload(),revision:-1},{...payload(),revision:1.5},{...payload(),storage_path:'other/file.pdf'}])assert.equal((await send(value)).status,400);
assert.equal((await send(payload(),{id:'invalid'})).status,400);
assert.equal(calls.length,0);assert.equal(adminCreated,0);
for(const [code,status] of [['PGRST202',503],['42501',403],['P0002',404],['40001',409],['55P03',409],['40P01',409],['XX000',503]]){
  rpcError={code,message:'private backend details'};const response=await send();assert.equal(response.status,status);assert.ok(!(await response.text()).includes('private backend'));
}rpcError=null;
assert.equal(adminCreated,0,'No privileged Storage calls after a rejected DB mutation');
let response=await send();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
assert.deepEqual(await response.json(),{deleted:true,cleanup_pending:false,pending_files:0});assert.equal(adminCreated,0,'No Storage credentials needed for attempts without reports');
paths=[path];response=await send();assert.deepEqual(await response.json(),{deleted:true,cleanup_pending:false,pending_files:0});
assert.deepEqual(removed.at(-1),[path]);assert.deepEqual(calls.at(-2),{name:'delete_exam_submission',args:{p_submission_id:id,p_revision:2}});
paths=[path];storageError={message:'backend failure'};
response=await send();assert.deepEqual(await response.json(),{deleted:true,cleanup_pending:true,pending_files:1});assert.deepEqual(paths,[path]);
storageError=null;assert.equal((await (await send()).json()).cleanup_pending,false,'Retry drains the retained job');
paths=[path];ackError={message:'lost response'};assert.equal((await (await send()).json()).cleanup_pending,true);assert.deepEqual(paths,[path]);
ackError=null;assert.equal((await (await send()).json()).cleanup_pending,false,'Repeated Storage removal and ack safely retry');
paths=[path];configError=true;response=await send();assert.equal((await response.json()).cleanup_pending,true);configError=false;
paths=['tutor/some-other-submission/keep.pdf'];const count=removed.length;
assert.equal((await (await send()).json()).cleanup_pending,true);assert.equal(removed.length,count,'Invalid manifest cannot delete unrelated files');
paths=Array.from({length:201},(_,i)=>`tutor/${id}/${i}.pdf`);
assert.equal((await (await send()).json()).cleanup_pending,false);assert.deepEqual(removed.slice(-3).map(batch=>batch.length),[100,100,1]);
assert.ok(removed.flat().every(path=>path.split('/')[1]===id));
console.log('PASS: deletion API: active admin + same-origin only, strict confirmation/UUID/revision, safe errors, scoped Storage bucket/paths, partial cleanup and idempotent batched retries');

// A reload must recover pending file cleanup, not lose it with component state.
let cleanupReadError=null;const tables=[];
const pageClient={from(table){tables.push(table);return {
  select(){return this;},neq(){return this;},eq(){return this;},order(){return this;},limit(){return this;},range(){return this;},
  then(resolve){return Promise.resolve({data:table==='submission_deletions'?[{submission_id:id,submission_revision:2,pending_report_paths:[path]}]:[],error:table==='submission_deletions'?cleanupReadError:null,count:0}).then(resolve);},
};}};
const Table=()=>null,Queue=()=>null;
const pageLoad=loader({
  '@/lib/dashboard/auth':{requireStaffPage:async()=>({supabase:pageClient,profile:{role}})},
  '@/components/dashboard/submission-table':{SubmissionTable:Table},
  '@/components/dashboard/delete-submission-button':{SubmissionCleanupQueue:Queue},
});
const {default:Page}=pageLoad('app/dashboard/submissions/page.tsx');
for(const testRole of ['admin','tutor']){
  role=testRole;tables.length=0;
  const output=await Page({searchParams:Promise.resolve({})});
  const children=output.props.children.flat(Infinity);const table=children.find(child=>child?.type===Table);
  assert.equal(table.props.canDelete,role==='admin');assert.equal(tables.includes('submission_deletions'),role==='admin');
  const queue=children.find(child=>child?.type===Queue);
  if(role==='admin')assert.deepEqual(queue.props.jobs,[{submission_id:id,submission_revision:2,pending_files:1}]);
  else assert.equal(queue,undefined);
}
role='admin';cleanupReadError={code:'42P01'};
const unavailable=await Page({searchParams:Promise.resolve({})});
assert.equal(unavailable.props.children.flat(Infinity).find(child=>child?.type===Table).props.canDelete,false);
console.log('PASS: fresh grading page recovers durable cleanup jobs, hides all controls from tutors, and disables deletion with a visible migration error if capability is unavailable');

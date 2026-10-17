import assert from 'node:assert/strict';
import { loader } from './component-loader.mjs';
let role='student',active=true,userPresent=true,targetRole='student',profileUpdateError=null,rpcError=null,created=0,deleted=0,authUpdate=null;
const rpcCalls=[];
const user={id:'staff-test'};
const profile=()=>({id:user.id,role,is_active:active,full_name:'Local Test',email:'test@example.invalid'});
const serverClient={auth:{getUser:async()=>({data:{user:userPresent?user:null},error:null})},from:()=>({select(){return this;},eq(_column,id){this.id=id;return this;},neq(){return this;},update(){return this;},single:async function(){return{data:this.id===user.id?profile():{role:targetRole},error:null};},then(resolve){return Promise.resolve({error:profileUpdateError}).then(resolve);}}),rpc:async(name,payload)=>{rpcCalls.push({name,payload});return{data:payload.p_id??'new-exam',error:rpcError};}};
const admin={auth:{admin:{createUser:async()=>{created++;return{data:{user:{id:'created-test'}},error:null};},deleteUser:async()=>{deleted++;return{error:null};},updateUserById:async(id,attributes)=>{authUpdate={id,attributes};return{data:{user:{id}},error:null};}}},from:()=>({update(){return this;},eq:async()=>({error:profileUpdateError})})};
const load=loader({'server-only':{},'next/navigation':{redirect:url=>{throw new Error(`REDIRECT:${url}`);}},'@/lib/supabase/server':{createClient:async()=>serverClient},'@/lib/supabase/admin':{createAdminClient:()=>admin}});
const {requireStaff}=load('lib/dashboard/auth.ts');
const users=load('app/api/dashboard/users/route.ts');
const member=load('app/api/dashboard/users/[id]/route.ts');
const exams=load('app/api/dashboard/exams/route.ts');
const publication=load('app/api/dashboard/exams/[id]/route.ts');
const grading=load('app/api/dashboard/submissions/[id]/route.ts');
const adminUpdate=load('app/api/admin/update-user/route.ts');
const request=(path,method,body)=>new Request(`http://localhost:3001${path}`,{method,headers:{Origin:'http://localhost:3001','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
let response;
const question={from:'Finance Director',to:'Senior Manager',subject:'Funding',intro:'Strategic funding options',taskPrompt:'Prepare a memo',subtasks:[{description:'Assess strategy',weightage:20},{description:'Assess funding',weightage:30},{description:'Assess sustainability',weightage:50}],weightageUnit:'percent',timeMinutes:60};
for(const [testRole,isActive,status] of [['student',true,403],['tutor',false,403],['tutor',true,200],['admin',true,200]]) {
  role=testRole;active=isActive;let outcome=200;try{await requireStaff();}catch(e){outcome=e.status;}assert.equal(outcome,status);
}
userPresent=false;await assert.rejects(requireStaff(),e=>e.status===401);userPresent=true;
console.log('PASS: actual server authorization rejects anonymous/student/suspended; accepts active tutor/admin');
active=true;role='tutor';const account={email:'created@example.invalid',full_name:'Created Test',password:'test-only-long-password',role:'student'};
assert.equal((await users.POST(request('/api/dashboard/users','POST',account))).status,403);assert.equal(created,0);
role='admin';assert.equal((await users.POST(request('/api/dashboard/users','POST',account))).status,201);assert.equal(created,1);
profileUpdateError={message:'Profile write failed'};assert.equal((await users.POST(request('/api/dashboard/users','POST',account))).status,400);assert.equal(deleted,1,'Failed profile write rolls back newly created login');profileUpdateError=null;
console.log('PASS: admin account creation; tutor denial; failed profile creation rolls back test login (mock transport)');
role='admin';response=await adminUpdate.PATCH(request('/api/admin/update-user','PATCH',{user_id:'00000000-0000-4000-8000-000000000044',email:'new@example.invalid',password:'new-secure-password'}));assert.equal(response.status,200);assert.deepEqual(authUpdate,{id:'00000000-0000-4000-8000-000000000044',attributes:{email:'new@example.invalid',email_confirm:true,password:'new-secure-password'}});
assert.equal((await adminUpdate.PATCH(request('/api/admin/update-user','PATCH',{user_id:'00000000-0000-4000-8000-000000000044',password:'short'}))).status,400);
console.log('PASS: admin-only direct email/password reset calls Supabase admin update without exposing service credentials');
let params=Promise.resolve({id:user.id});assert.equal((await member.DELETE(request('/api/dashboard/users/staff-test','DELETE'),{params})).status,403);
params=Promise.resolve({id:'other-admin'});targetRole='admin';assert.equal((await member.DELETE(request('/api/dashboard/users/other-admin','DELETE'),{params})).status,403);
targetRole='student';params=Promise.resolve({id:'student-test'});assert.equal((await member.PATCH(request('/api/dashboard/users/student-test','PATCH',{full_name:'Student',role:'tutor',is_active:false,assigned_level:'SCS'}),{params})).status,200);
console.log('PASS: self/admin account deletion denied; student role/access update allowed to admin');
role='tutor';response=await exams.POST(request('/api/dashboard/exams','POST',{name:'Local mock',status:'published',questions:[question]}));assert.equal(response.status,201);
assert.equal(rpcCalls.at(-1).payload.p_questions[0].duration_seconds,3600);assert.deepEqual(rpcCalls.at(-1).payload.p_questions[0].content.subtasks,question.subtasks);assert.equal(rpcCalls.at(-1).payload.p_questions[0].content.weightageUnit,'percent');
response=await exams.POST(request('/api/dashboard/exams','POST',{name:'Local mock',status:'published',questions:[question],materials:[{name:'stolen.pdf',storage_path:'other-user/reference.pdf',kind:'reference',question_id:'section-1'}]}));assert.equal(response.status,403);
console.log('PASS: tutor mock API maps 60-minute timing/weights and denies another user upload folder');
const examId='00000000-0000-4000-8000-000000000010';
const publish=()=>publication.PATCH(request(`/api/dashboard/exams/${examId}`,'PATCH',{status:'published'}),{params:Promise.resolve({id:examId})});
for(const [testRole,isActive,status] of [['student',true,403],['tutor',false,403],['tutor',true,200],['admin',true,200]]){
  role=testRole;active=isActive;assert.equal((await publish()).status,status);
}
userPresent=false;assert.equal((await publish()).status,401);userPresent=true;active=true;role='tutor';
assert.equal(rpcCalls.at(-1).name,'manage_mock_exam');assert.deepEqual(rpcCalls.at(-1).payload,{p_id:examId,p_action:'publish',p_revision:0});
assert.equal((await publication.PATCH(request('/api/dashboard/exams/bad','PATCH',{status:'published'}),{params:Promise.resolve({id:'bad'})})).status,400);
assert.equal((await publication.PATCH(request(`/api/dashboard/exams/${examId}`,'PATCH',{status:'archived'}),{params:Promise.resolve({id:examId})})).status,400);
assert.equal((await publication.PATCH(new Request(`http://localhost:3001/api/dashboard/exams/${examId}`,{method:'PATCH',headers:{Origin:'https://untrusted.example'},body:'{}'}),{params:Promise.resolve({id:examId})})).status,403);
for(const [code,status] of [['PGRST202',503],['P0002',404],['42501',403],['23514',400],['40001',409]]){rpcError={code,message:'Database validation failure'};assert.equal((await publish()).status,status);}
rpcError=null;
console.log('PASS: publish API guards roles/origin/payload and maps missing migration, not-found, permission and validation errors');
const examContext={params:Promise.resolve({id:examId})};
for(const status of ['draft','published']){assert.equal((await publication.PATCH(request(`/api/dashboard/exams/${examId}`,'PATCH',{status,revision:2}),examContext)).status,200);assert.equal(rpcCalls.at(-1).payload.p_action,status==='draft'?'unpublish':'publish');}
assert.equal((await publication.PATCH(request(`/api/dashboard/exams/${examId}`,'PATCH',{action:'restore',revision:3}),examContext)).status,200);
assert.equal((await publication.DELETE(request(`/api/dashboard/exams/${examId}`,'DELETE',{revision:3}),examContext)).status,200);assert.equal(rpcCalls.at(-1).payload.p_action,'remove');
assert.equal((await publication.PUT(request(`/api/dashboard/exams/${examId}`,'PUT',{name:'Edited draft',status:'draft',revision:4,questions:[question],materials:[{name:'Retained PDF',kind:'reference',question_id:'section-1',storage_path:'original-owner/source/reference.pdf'}]}),examContext)).status,200);
assert.equal(rpcCalls.at(-1).name,'save_mock_exam_with_level');assert.equal(rpcCalls.at(-1).payload.p_level,'SCS');assert.equal(rpcCalls.at(-1).payload.p_revision,4);assert.deepEqual(rpcCalls.at(-1).payload.p_questions[0].content.subtasks,question.subtasks);
assert.equal((await publication.DELETE(request(`/api/dashboard/exams/${examId}`,'DELETE',{}),examContext)).status,400);
assert.equal((await publication.PUT(request(`/api/dashboard/exams/${examId}`,'PUT',{name:'Invalid',status:'published',revision:4,questions:[question]}),examContext)).status,400);
role='student';assert.equal((await publication.DELETE(request(`/api/dashboard/exams/${examId}`,'DELETE',{revision:3}),examContext)).status,403);assert.equal((await publication.PUT(request(`/api/dashboard/exams/${examId}`,'PUT',{}),examContext)).status,403);role='tutor';
console.log('PASS: unpublish/restore/edit/delete route mapping, retained material payloads, revision validation and student denial');
response=await grading.PATCH(request('/api/dashboard/submissions/test','PATCH',{score:72,feedback:'Improve financial analysis',status:'draft',revision:0}),{params:Promise.resolve({id:'00000000-0000-4000-8000-000000000002'})});assert.equal(response.status,200);
assert.equal(rpcCalls.at(-1).name,'save_tutor_evaluation');assert.equal(rpcCalls.at(-1).payload.p_status,'draft');
response=await grading.PATCH(request('/api/dashboard/submissions/test','PATCH',{score:101,feedback:'Invalid',status:'published',revision:0}),{params:Promise.resolve({id:'00000000-0000-4000-8000-000000000002'})});assert.equal(response.status,400);
console.log('PASS: tutor evaluation API persists staff-only drafts or published feedback through verified RPC; invalid score rejected');

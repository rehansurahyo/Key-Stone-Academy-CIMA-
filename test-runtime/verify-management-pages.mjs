import assert from 'node:assert/strict';
import React from '../node_modules/react/index.js';
import {renderToStaticMarkup} from '../node_modules/react-dom/server.node.js';
import {loader} from './component-loader.mjs';
let status='published',ownAttempt=true,visible=true,countsError=null,formProps,runtimeProps,assignedLevel='SCS',accountRole='student';
const examId='00000000-0000-4000-8000-000000000050';
const paper=()=>({id:examId,name:'Historical mock',description:'Preserved exam',level:'SCS',status,revision:3});
const question={id:'q1',question_id:'section-1',position:1,duration_seconds:3600,content:{subject:'Original subject',subtasks:[{description:'Original task',weightage:100}]}};
const client={auth:{getUser:async()=>({data:{user:{id:'own-student'}}})},rpc:async()=>({data:[{exam_id:examId,attempt_count:1}],error:countsError}),from(table){
  return {select(){return this;},eq(){return this;},in(){return this;},limit(){return this;},order(){return this;},single:async()=>({data:{id:'own-student',role:accountRole,is_active:true,full_name:'Student',assigned_level:assignedLevel},error:null}),maybeSingle:async()=>({data:table==='exams'?(visible?paper():null):ownAttempt?{id:'existing-session'}:null,error:null}),then(resolve){
    const data=table==='exam_questions'?[question]:table==='exam_materials'?[]:table==='exams'?status==='published'?[paper()]:[]:table==='exam_sessions'?ownAttempt?[{id:'existing-session',exam_id:examId,status:'in_progress',exam:paper()}]:[]:table==='submissions'?[{id:'submission',exam_id:examId,status:'graded',score:82,feedback:'Preserved tutor feedback',exam:paper()}]:[];
    return Promise.resolve({data,error:null}).then(resolve);
  }};
}};
const load=loader({'server-only':{},'next/navigation':{notFound:()=>{throw new Error('NOT_FOUND');},redirect:url=>{throw new Error(`REDIRECT:${url}`);}},'next/link':{__esModule:true,default:({href,children,...props})=>React.createElement('a',{href,...props},children)},'@/lib/supabase/server':{createClient:async()=>client},'@/components/exam-runtime':{__esModule:true,default:props=>{runtimeProps=props;return React.createElement('div',null,'Existing exam runtime');}},'@/components/dashboard/mock-upload-form':{MockUploadForm:props=>{formProps=props;return React.createElement('div',null,'Prefilled edit form');}}});
const {default:ExamPage}=load('app/exam/[id]/page.tsx');
const {default:StudentDashboard}=load('app/student/dashboard/page.tsx');
const {default:Overview}=load('app/dashboard/page.tsx');
const {default:EditMock}=load('app/dashboard/exams/[id]/edit/page.tsx');
const params=Promise.resolve({id:examId});
const landing=await Overview({searchParams:Promise.resolve({})});
assert.equal(landing.type,StudentDashboard,'Students can land on /dashboard without entering the staff overview');
console.log('PASS: shared /dashboard landing renders the student dashboard for student accounts');
for(const availability of ['published','draft','archived']){
  status=availability;ownAttempt=true;runtimeProps=null;
  const html=renderToStaticMarkup(await ExamPage({params}));assert.ok(html.includes('Existing exam runtime'));assert.equal(runtimeProps.examId,examId);assert.equal(runtimeProps.initialQuestions[0].subject,'Original subject');
}
status='archived';ownAttempt=false;runtimeProps=null;assert.ok(renderToStaticMarkup(await ExamPage({params})).includes('no longer accepting new attempts'));assert.equal(runtimeProps,null);
visible=false;await assert.rejects(ExamPage({params}),/REDIRECT:\/dashboard\?notice=exam-level/);visible=true;
console.log('PASS: existing unpublished/archived attempts render runtime; completed-only and hidden papers cannot start new attempts');
status='published';assignedLevel='OCS';runtimeProps=null;
await assert.rejects(ExamPage({params}),/REDIRECT:\/dashboard\?notice=exam-level/);
assert.equal(runtimeProps,null,'Cross-level content must not reach the runtime');
assignedLevel='SCS';
const denied=renderToStaticMarkup(await StudentDashboard({searchParams:Promise.resolve({notice:'exam-level'})}));
assert.ok(denied.includes('This mock is unavailable for your assigned level (SCS)'));
console.log('PASS: mismatched and RLS-hidden exams redirect to dashboard with a readable notice before the exam starts');
ownAttempt=true;status='archived';const dashboard=renderToStaticMarkup(await StudentDashboard({searchParams:Promise.resolve({})}));assert.ok(dashboard.includes('Continue attempt'));assert.ok(dashboard.includes(`/exam/${examId}`));assert.ok(dashboard.includes('Preserved tutor feedback'));assert.ok(dashboard.includes('Historical mock'));assert.ok(dashboard.includes('In progress'));assert.ok(dashboard.includes('Download answers (.docx)'));
console.log('PASS: dashboard retains resume links and graded feedback while archived papers disappear from available mocks');
assert.match(dashboard,/<nav aria-label="Student portal navigation"><a href="https:\/\/learn\.keystoneacademia\.com\/" target="_blank" rel="noopener noreferrer"/);
console.log('PASS: student dashboard header exposes safe new-tab LearnWorlds navigation');
assert.match(dashboard,/<main aria-label="Student dashboard" tabindex="0" class="h-dvh overflow-x-hidden overflow-y-auto overscroll-y-contain/);
assert.ok(dashboard.includes('scrollbar-gutter:stable'));
console.log('PASS: student dashboard owns a viewport-bounded, keyboard-focusable vertical scroll area');
await assert.rejects(EditMock({params}),/REDIRECT:\/dashboard\?notice=access-denied/);
for(const staffRole of ['admin','tutor']){accountRole=staffRole;await assert.rejects(StudentDashboard({searchParams:Promise.resolve({})}),/REDIRECT:\/dashboard/);await assert.rejects(ExamPage({params}),/REDIRECT:\/dashboard/);}
accountRole='admin';
const edit=renderToStaticMarkup(await EditMock({params}));assert.ok(edit.includes('Edit as a new draft copy'));assert.equal(formProps.initialExam.attemptCount,1);assert.equal(formProps.initialExam.exam.revision,3);assert.equal(formProps.initialExam.questions[0].id,'q1');
countsError={message:'RPC missing'};assert.ok(renderToStaticMarkup(await EditMock({params})).includes('migration'));
console.log('PASS: edit page loads original content/current revision and reports missing management migration');

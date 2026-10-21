import assert from 'node:assert/strict';
import {loader} from './component-loader.mjs';

let accessType='trial',role='admin';
const queries=[];
const fixture=columns=>({id:'submission',session_id:'session',exam_id:'exam',submitted_at:'2026-10-21T00:00:00Z',status:'submitted',revision:0,score:null,student:{full_name:'Student',email:'same-contact@example.test',...(columns.includes('access_type')?{access_type:accessType}:{})},exam:{name:'Mock 1'}});
const client={from(table){let columns='';return {
  select(value){columns=value;queries.push({table,columns});return this;},eq(){return this;},neq(){return this;},order(){return this;},limit(){return this;},range(){return this;},
  async maybeSingle(){return {data:table==='submissions'?fixture(columns):null,error:null};},
  then(resolve){return Promise.resolve({data:table==='submissions'?[fixture(columns)]:[],count:table==='submissions'?1:0,error:null}).then(resolve);},
};}};
const Table=()=>null,Badge=()=>null;
const load=loader({'server-only':{},
  'next/navigation':{notFound(){throw Error('Unexpected notFound');}},
  '@/lib/dashboard/auth':{requireStaffPage:async()=>({supabase:client,profile:{role}}),requirePortalPage:async()=>({supabase:client,profile:{role}})},
  '@/components/dashboard/submission-table':{SubmissionTable:Table},
  '@/components/dashboard/trial-badge':{TrialBadge:Badge},
});
const List=load('app/dashboard/submissions/page.tsx').default;
const Overview=load('app/dashboard/page.tsx').default;
const Review=load('app/dashboard/submissions/[id]/page.tsx').default;
function find(element,type){
  if(!element||typeof element!=='object')return;
  if(element.type===type)return element;
  for(const value of Object.values(element.props??{})){
    for(const child of (Array.isArray(value)?value.flat(Infinity):[value])){
      const match=find(child,type);if(match)return match;
    }
  }
}
for(const staffRole of ['admin','tutor'])for(const type of ['trial','enrolled']){
  role=staffRole;accessType=type;
  for(const Page of [List,Overview]){
    const output=await Page({searchParams:Promise.resolve({})});
    assert.equal(find(output,Table).props.submissions[0].student.access_type,type,'Server passes the real joined access type to each submission list');
  }
  const review=await Review({params:Promise.resolve({id:'submission'})});
  assert.equal(find(review,Badge).props.accessType,type,'Review header receives the same authoritative account status');
}
assert.ok(queries.filter(query=>query.table==='submissions'&&query.columns.includes('student:profiles')).every(query=>query.columns.includes('full_name,email,access_type')));
console.log('PASS: grading list, recent submissions and review fetch profile access_type for both admin and tutor; identical contact emails never determine trial status');

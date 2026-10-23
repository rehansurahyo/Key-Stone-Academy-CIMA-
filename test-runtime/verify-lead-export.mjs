import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import JSZip from '../node_modules/jszip/lib/index.js';
import {loader} from './component-loader.mjs';

let role='admin',active=true,signedIn=true,readError=null,stuck=false;
const original=Array.from({length:1051},(_,index)=>({
  id:`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`,full_name:`Lead ${index}`,email:`lead${index}@example.test`,
  phone:'+923001234567',country:'SG',phone_country:'PK',country_code:'+92',target_level:'OCS',status:'new',admin_notes:'',created_at:'2026-10-22T22:30:00Z',
}));
original[0]={...original[0],full_name:'=HYPERLINK("https://example.invalid")',admin_notes:'=SUM(1,2)'};
original[1]={...original[1],full_name:'Ali & Zoë <Test> 😊',phone:'00390236618300',country_code:'+39',phone_country:'IT',admin_notes:'First line\nSecond line'};
original[2]={...original[2],full_name:'Literal _x0041_ text',admin_notes:'Unsafe\u0000control'};
let records=original;let reads=0;
const client={auth:{getUser:async()=>({data:{user:signedIn?{id:'admin'}:null},error:null})},from(table){
  let cursor=null;
  const query={select(columns){if(table==='free_trial_leads'){assert.ok(!columns.includes('user_id'));reads++;}return this;},eq(){return this;},lte(column,value){assert.equal(column,'created_at');assert.ok(Number.isFinite(Date.parse(value)));return this;},order(column){assert.equal(column,'id');return this;},limit(value){assert.equal(value,500);return this;},gt(column,value){assert.equal(column,'id');cursor=value;return this;},single:async()=>({data:{role,is_active:active},error:null}),then(resolve){
    assert.equal(table,'free_trial_leads');
    // Simulate a project response limit lower than the requested batch size.
    return Promise.resolve({data:readError?null:records.filter(row=>stuck||!cursor||row.id>cursor).slice(0,37),error:readError}).then(resolve);
  }};return query;
}};
const load=loader({'server-only':{},'next/navigation':{redirect(){throw Error('Unexpected redirect');}},'@/lib/supabase/server':{createClient:async()=>client}});
const {GET}=load('app/api/dashboard/leads/export/route.ts');
const {buildLeadXlsx,leadExportFilename,XLSX_MIME}=load('lib/lead-xlsx.ts');
for(const [r,a,status] of [['student',true,403],['tutor',true,403],['admin',false,403]]){
  role=r;active=a;assert.equal((await GET()).status,status);
}role='admin';active=true;signedIn=false;assert.equal((await GET()).status,401);signedIn=true;assert.equal(reads,0);
let response=await GET();assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),XLSX_MIME);
assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('X-Export-Row-Count'),'1051');
assert.match(response.headers.get('Content-Disposition'),/^attachment; filename="keystone-trial-leads-\d{4}-\d{2}-\d{2}\.xlsx"$/);
assert.ok(reads>28,'All pages are read, including data beyond the first 1,000 records');
const bytes=new Uint8Array(await response.arrayBuffer());assert.equal(String.fromCharCode(...bytes.slice(0,2)),'PK');
const zip=await JSZip.loadAsync(bytes);const xml=await zip.file('xl/worksheets/sheet1.xml').async('string');
assert.equal((xml.match(/<row /g)||[]).length,1052);assert.ok(xml.includes('lead1050@example.test'));
assert.ok(xml.includes('t="inlineStr"'));assert.ok(xml.includes('+923001234567'));assert.ok(xml.includes('00390236618300'));
assert.ok(xml.includes('Ali &amp; Zoë &lt;Test&gt; 😊'));assert.ok(xml.includes('_x005F__x0041_'));assert.ok(!xml.includes('\u0000'));
assert.ok(!xml.includes('<f>'));assert.ok(xml.includes('=HYPERLINK'));assert.ok(xml.includes('=SUM(1,2)'));
assert.ok(xml.includes('state="frozen"'));assert.ok(xml.includes('autoFilter ref="A1:I1052"'));
assert.ok(!Object.keys(zip.files).some(name=>/vba|externalLink|macro/i.test(name)));
assert.equal(leadExportFilename(new Date('2026-10-22T22:30:00Z')),'keystone-trial-leads-2026-10-23.xlsx');
await mkdir('outputs/lead-export',{recursive:true});await writeFile('outputs/lead-export/qa.xlsx',bytes);
readError={message:'private database details'};response=await GET();assert.equal(response.status,503);assert.ok(!(await response.text()).includes('private database'));readError=null;
records=[];response=await GET();assert.equal(response.status,200);assert.equal(response.headers.get('X-Export-Row-Count'),'0');
const empty=await JSZip.loadAsync(await response.arrayBuffer());assert.ok((await empty.file('xl/worksheets/sheet1.xml').async('string')).includes('dimension ref="A1:I1"'));
records=original;stuck=true;assert.equal((await GET()).status,503);stuck=false;
records=[{...original[0],admin_notes:'x'.repeat(5_000_001)}];assert.equal((await GET()).status,413);
records=Array.from({length:10_001},(_,index)=>({...original[0],id:`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`}));
assert.equal((await GET()).status,413,'An over-limit request returns an error, never a silently truncated workbook');
await assert.rejects(buildLeadXlsx(Array(10_001).fill(original[0])),/row limit/);
console.log('PASS: real XLSX generation, active-admin authorization, all 1,051 leads despite a lower page limit, explicit text/formula safety, phone prefixes/zeros, Unicode, dates, native filters/freeze, empty/error/size cases and no mutations');

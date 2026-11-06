import assert from 'node:assert/strict';
import React from '../node_modules/react/index.js';
import {renderToStaticMarkup} from '../node_modules/react-dom/server.node.js';
import {loader} from './component-loader.mjs';

let role='admin',active=true,signedIn=true,failure=null;
const queries=[];
const client={auth:{getUser:async()=>({data:{user:signedIn?{id:'search-admin'}:null},error:null})},from(table){
  assert.equal(table,'profiles');const query={table};queries.push(query);
  return{select(columns,options){query.columns=columns;query.count=options?.count;return this;},eq(key,value){(query.equal??=[]).push([key,value]);return this;},ilike(key,value){query.search=[key,value];return this;},order(){return this;},range(first,last){query.range=[first,last];return this;},single:async()=>({data:{id:'search-admin',role,is_active:active},error:null}),then(resolve){return Promise.resolve({data:[],count:75,error:failure}).then(resolve);}};
}};
const load=loader({'server-only':{},'@/lib/supabase/server':{createClient:async()=>client},'next/navigation':{redirect:url=>{throw Error('REDIRECT:'+url);},useRouter:()=>({refresh(){}})},'next/link':{__esModule:true,default:({href,children,...props})=>React.createElement('a',{href,...props},children)}});
const Users=load('app/dashboard/users/page.tsx').default;
const listQuery=()=>queries.find(query=>query.count==='exact');
const page=searchParams=>Users({searchParams:Promise.resolve(searchParams)});
const html=renderToStaticMarkup(await page({q:'  Poonam & Team  ',level:'OCS',page:'2'}));
assert.deepEqual(listQuery().search,['full_name','%Poonam & Team%']);
assert.deepEqual(listQuery().equal,[['role','student'],['assigned_level','OCS']]);
assert.deepEqual(listQuery().range,[30,59]);
assert.ok(html.includes('Search by name'));assert.ok(html.includes('q=Poonam+%26+Team'));assert.ok(html.includes('level=OCS'));assert.ok(html.includes('page=3'));
assert.ok(html.includes('Clear filters'));assert.ok(!html.includes('name="page"'),'Submitting a new search starts at page 1');
for(const level of ['OCS','MCS','SCS']){queries.length=0;await page({level});assert.deepEqual(listQuery().equal,[['role','student'],['assigned_level',level]]);}
queries.length=0;await page({q:'_%\\'});assert.deepEqual(listQuery().search,['full_name','%\\_\\%\\\\%']);
queries.length=0;await page({q:'   ',level:'invalid',page:'invalid'});assert.equal(listQuery().search,undefined);assert.equal(listQuery().equal,undefined);assert.deepEqual(listQuery().range,[0,29]);
queries.length=0;await page({q:'x'.repeat(110),page:'999999'});assert.equal(listQuery().search[1].length,102);assert.deepEqual(listQuery().range,[299970,299999]);
queries.length=0;await page({q:['ignored'],level:['OCS'],page:'0'});assert.equal(listQuery().search,undefined);assert.equal(listQuery().equal,undefined);assert.deepEqual(listQuery().range,[0,29]);
for(const [nextRole,nextActive]of[['student',true],['tutor',true],['admin',false]]){role=nextRole;active=nextActive;queries.length=0;await assert.rejects(page({q:'Student'}),/REDIRECT:.*access-denied/);assert.equal(listQuery(),undefined,'Unauthorized callers never query the account list');}
role='admin';active=true;signedIn=false;await assert.rejects(page({}),/REDIRECT:\/staff\/login/);signedIn=true;
failure=Error('Account query unavailable');await assert.rejects(page({q:'Poonam'}),/Account query unavailable/);
console.log('PASS: admin-only People & Access search applies name and student-level filters before pagination, preserves filters in links, resets new searches and escapes literal wildcards');
console.log('PASS: invalid/oversized filters, empty results, account query errors and unauthorized callers are handled without deleting or changing accounts');

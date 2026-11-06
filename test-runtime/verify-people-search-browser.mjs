import assert from 'node:assert/strict';
import React from '../node_modules/react/index.js';
import {renderToStaticMarkup} from '../node_modules/react-dom/server.node.js';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {loader} from './component-loader.mjs';

const people=Array.from({length:65},(_,i)=>({id:'qa-'+i,full_name:'Candidate '+String(i).padStart(3,'0'),email:'qa-'+i+'@example.invalid',role:'student',assigned_level:['OCS','MCS','SCS'][i%3],is_active:true,created_at:'2026-11-06'}));
people.push({id:'first',full_name:'Poonam Operational',role:'student',assigned_level:'OCS',email:'first@example.invalid',is_active:true},{id:'last',full_name:'Poonam Management',role:'student',assigned_level:'MCS',email:'last@example.invalid',is_active:true});
const mocks=[{id:'active',name:'Active mock QA',status:'published'},{id:'archived',name:'Archived mock QA',status:'archived'}].map(exam=>({...exam,level:'OCS',revision:1,description:'Synthetic paper',questions:[{id:'q1',duration_seconds:2700}],materials:[]}));
const client={rpc:async(_name,args)=>({data:(args?.p_ids??[]).map(exam_id=>({exam_id,attempt_count:2})),error:null}),from(table){let rows=table==='profiles'?[...people]:table==='exams'?[...mocks]:[],first=0,last=999;return{
  select(){return this;},eq(key,value){rows=rows.filter(row=>row[key]===value);return this;},neq(key,value){rows=rows.filter(row=>row[key]!==value);return this;},ilike(key,value){const term=value.slice(1,-1).replace(/\\([\\%_])/g,'$1').toLowerCase();rows=rows.filter(row=>String(row[key]??'').toLowerCase().includes(term));return this;},order(){return this;},range(start,end){first=start;last=end;return this;},then(resolve){return Promise.resolve({data:rows.slice(first,last+1),count:rows.length,error:null}).then(resolve);}
};}};
const load=loader({'next/navigation':{useRouter:()=>({refresh(){}})},'next/link':{__esModule:true,default:({href,children,...props})=>React.createElement('a',{href,...props},children)},'@/lib/dashboard/auth':{requireStaffPage:async()=>({supabase:client,user:{id:'qa-admin'},profile:{role:'admin'}})}});
const Users=load('app/dashboard/users/page.tsx').default,Exams=load('app/dashboard/exams/page.tsx').default;
const names=await readdir('.next/static',{recursive:true}),css=(await Promise.all(names.filter(n=>n.endsWith('.css')).map(n=>readFile('.next/static/'+n,'utf8')))).join('\n');
const server=createServer(async(request,response)=>{try{
  const url=new URL(request.url,'http://fixture.example'),params=Object.fromEntries(url.searchParams),Page=url.pathname==='/dashboard/exams'?Exams:Users;
  const markup=renderToStaticMarkup(await Page({searchParams:Promise.resolve(params)}));
  response.setHeader('Content-Type','text/html; charset=utf-8');response.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><main class="mx-auto max-w-6xl p-4">'+markup+'</main>');
}catch(error){response.statusCode=500;response.end(error.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const{chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
await mkdir('outputs/people-search-browser',{recursive:true});
try{for(const[width,height]of[[1440,900],[390,844],[320,568]]){
  const page=await browser.newPage({viewport:{width,height}}),base='http://127.0.0.1:'+server.address().port;
  try{
    await page.goto(base+'/dashboard/users');await page.getByLabel('Search by name',{exact:true}).fill('Poonam');await page.getByRole('button',{name:'Search',exact:true}).click();await page.waitForURL(url=>url.searchParams.get('q')==='Poonam');
    assert.equal(await page.getByText('Poonam Operational',{exact:true}).count(),1);assert.equal(await page.getByText('Poonam Management',{exact:true}).count(),1,'Search includes matching accounts beyond the initial 30');
    await page.getByLabel('Student level',{exact:true}).selectOption('OCS');await page.getByRole('button',{name:'Search',exact:true}).click();await page.waitForURL(url=>url.searchParams.get('level')==='OCS');
    assert.equal(await page.getByText('Poonam Operational',{exact:true}).count(),1);assert.equal(await page.getByText('Poonam Management',{exact:true}).count(),0);
    await page.screenshot({path:'outputs/people-search-browser/search-'+width+'.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.goto(base+'/dashboard/users?q=Candidate&page=2');await page.getByRole('link',{name:'Next',exact:true}).click();await page.waitForURL(url=>url.searchParams.get('page')==='3');assert.equal(new URL(page.url()).searchParams.get('q'),'Candidate');
    await page.getByLabel('Search by name',{exact:true}).fill('Poonam');await page.getByLabel('Student level',{exact:true}).selectOption('MCS');await page.getByRole('button',{name:'Search',exact:true}).click();await page.waitForURL(url=>url.searchParams.get('q')==='Poonam'&&url.searchParams.get('level')==='MCS');assert.equal(new URL(page.url()).searchParams.get('page'),null);assert.equal(await page.getByText('Poonam Management',{exact:true}).count(),1);
    await page.getByRole('link',{name:'Clear filters',exact:true}).click();await page.waitForURL(url=>!url.search);assert.equal(await page.getByLabel('Search by name',{exact:true}).inputValue(),'');
    await page.goto(base+'/dashboard/exams?level=OCS');assert.equal(await page.getByText('Active mock QA',{exact:true}).count(),1);assert.equal(await page.getByText('Archived mock QA',{exact:true}).count(),0);
    await page.getByRole('link',{name:'Archived mocks',exact:true}).click();await page.waitForURL(url=>url.searchParams.get('view')==='archived');assert.equal(await page.getByText('Archived mock QA',{exact:true}).count(),1);assert.equal(await page.getByText('Active mock QA',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Restore Archived mock QA',exact:true}).count(),1);
    assert.equal(await page.getByRole('link',{name:'Archived mocks',exact:true}).getAttribute('aria-current'),'page');assert.equal(await page.getByRole('button',{name:'Delete Archived mock QA',exact:true}).count(),0);assert.ok((await page.getByRole('status').allTextContents()).some(text=>text.includes('answers and grades remain available')));
    await page.getByRole('link',{name:'Active mocks',exact:true}).click();await page.waitForURL(url=>url.searchParams.get('view')===null);assert.equal(new URL(page.url()).searchParams.get('level'),'OCS');
  }finally{await page.close();}
}console.log('PASS: real desktop/390px/320px account search, combined level filters, preserved pagination, clear/reset and distinct active/archived mock views with safe restore');}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

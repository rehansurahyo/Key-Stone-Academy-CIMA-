import assert from 'node:assert/strict';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'vite';

const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'outputs/bulk-accounts-browser');await mkdir(out,{recursive:true});
const entry=path.join(out,'entry.jsx'),navigation=path.join(out,'navigation.mjs');
await writeFile(navigation,'export const useRouter=()=>({refresh(){window.refreshCount=(window.refreshCount||0)+1;}});');
const longName='Long Candidate '.repeat(8).trim();
const users=[{id:'first',full_name:longName,email:'long-candidate@example.invalid',role:'student'},{id:'second',full_name:'Second Candidate',email:'second@example.invalid',role:'student'},{id:'third',full_name:'Third Candidate',email:'third@example.invalid',role:'tutor'},{id:'admin',full_name:'Protected Admin',email:'admin@example.invalid',role:'admin'},{id:'self',full_name:'Own Account',email:'own@example.invalid',role:'admin'}].map(user=>({...user,is_active:true,assigned_level:'OCS'}));
await writeFile(entry,`import React from'react';import{createRoot}from'react-dom/client';import{UserManagement}from'../../components/dashboard/user-management';createRoot(document.getElementById('root')).render(<main className='mx-auto max-w-5xl p-4'><h1>People &amp; access</h1><UserManagement users={${JSON.stringify(users)}} currentUserId='self'/></main>);`);
await build({configFile:false,root,logLevel:'error',resolve:{alias:{'next/navigation':navigation,'@':root},dedupe:['react','react-dom']},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(out,'bundle'),emptyOutDir:false,rolldownOptions:{input:entry,output:{format:'iife',entryFileNames:'accounts.js',codeSplitting:false}}}});
const bundle=await readFile(path.join(out,'bundle/accounts.js')),names=await readdir('.next/static',{recursive:true});
const css=(await Promise.all(names.filter(name=>name.endsWith('.css')).map(name=>readFile('.next/static/'+name,'utf8')))).join('\n');
const calls=[];let failed=false;
const server=createServer(async(request,response)=>{
  if(request.url==='/accounts.js'){response.setHeader('Content-Type','text/javascript; charset=utf-8');response.end(bundle);return;}
  if(request.url.startsWith('/api/')){let raw='';for await(const chunk of request)raw+=chunk;calls.push({url:request.url,method:request.method,body:JSON.parse(raw)});response.setHeader('Content-Type','application/json');if(request.url.endsWith('/second')&&!failed){failed=true;response.statusCode=409;response.end('{"error":"Account check interrupted. Please retry."}');}else response.end('{"deleted":true}');return;}
  response.setHeader('Content-Type','text/html; charset=utf-8');response.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script src="/accounts.js"></script>');
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const{chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try{for(const[width,height]of[[1440,900],[390,844],[320,568]]){
  calls.length=0;failed=false;const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto('http://127.0.0.1:'+server.address().port);
    assert.equal(await page.getByRole('checkbox',{name:'Select account Protected Admin',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('checkbox',{name:'Select account Own Account',exact:true}).isDisabled(),true);
    await page.getByRole('checkbox',{name:'Select all eligible accounts on this page',exact:true}).check();
    await page.getByRole('button',{name:'Delete selected accounts (3)',exact:true}).click();let dialog=page.getByRole('alertdialog');await dialog.waitFor();
    assert.equal(await dialog.getByRole('listitem').count(),3);assert.ok((await dialog.textContent()).includes('answers, submissions and grades'));assert.equal(await dialog.getByRole('button',{name:'Delete selected accounts permanently',exact:true}).isDisabled(),true);
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(calls.length,0);
    await page.getByRole('button',{name:'Delete selected accounts (3)',exact:true}).click();dialog=page.getByRole('alertdialog');await dialog.getByLabel('Type DELETE to confirm account deletion',{exact:true}).fill('delete');assert.equal(await dialog.getByRole('button',{name:'Delete selected accounts permanently',exact:true}).isDisabled(),true);
    await dialog.getByLabel('Type DELETE to confirm account deletion',{exact:true}).fill('DELETE');await dialog.evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});
    const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1);
    if(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1)){await page.screenshot({path:path.join(out,'overflow-'+width+'.png')});console.log(JSON.stringify(await dialog.evaluate(el=>({width:innerWidth,client:el.clientWidth,scroll:el.scrollWidth,children:[...el.querySelectorAll('*')].map(child=>({tag:child.tagName,txt:child.textContent.slice(0,35),x:child.getBoundingClientRect().x,width:child.getBoundingClientRect().width,whiteSpace:getComputedStyle(child).whiteSpace,minWidth:getComputedStyle(child).minWidth}))})),null,2));}
    assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
    await page.screenshot({path:path.join(out,'confirmation-'+width+'.png')});
    await dialog.getByRole('button',{name:'Delete selected accounts permanently',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.match(await dialog.getByRole('alert').textContent(),/1 of 3 accounts confirmed deleted/);assert.equal(calls.length,2);
    assert.equal(await page.getByRole('checkbox',{name:'Select account '+longName,exact:true,includeHidden:true}).count(),0);assert.equal(await page.getByRole('checkbox',{name:'Select account Second Candidate',exact:true,includeHidden:true}).isChecked(),true);
    await dialog.getByRole('button',{name:'Delete selected accounts permanently',exact:true}).click();await dialog.waitFor({state:'detached'});assert.equal(calls.length,4);assert.ok(calls.every(call=>call.method==='DELETE'&&call.body.confirmation==='DELETE'&&!/\/(admin|self)$/.test(call.url)));assert.equal(await page.getByRole('button',{name:'Delete selected accounts (0)',exact:true}).isDisabled(),true);
    assert.equal(await page.getByRole('checkbox',{name:'Select account Protected Admin',exact:true}).count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
  }finally{await page.close();}
}console.log('PASS: real desktop/390px/320px selection, protected accounts, bounded confirmation, cancel, exact DELETE text, partial failure and selected-only retry');}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

import assert from 'node:assert/strict';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'vite';

const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'outputs/multiple-uploads-browser');
await mkdir(out,{recursive:true});
const entry=path.join(out,'entry.jsx'),navigation=path.join(out,'navigation.mjs'),client=path.join(out,'client.mjs');
await writeFile(navigation,'export const useRouter=()=>({refresh(){},push(url){window.lastNavigation=url;}});');
await writeFile(client,`export const createClient=()=>({auth:{getUser:async()=>({data:{user:{id:'synthetic-tutor'}}})},storage:{from:bucket=>({upload:async(path,file,options)=>{const response=await fetch('/qa/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bucket,path,name:file.name,options})});return response.json();},remove:async()=>({error:null})})}});`);
await writeFile(entry,`
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{SubmissionReports}from'../../components/dashboard/submission-reports';
import{MockUploadForm}from'../../components/dashboard/mock-upload-form';
const initialExam={exam:{id:'synthetic-exam',level:'OCS',name:'Synthetic mock',description:'QA only',status:'published',revision:1},attemptCount:1,questions:[{id:'q1',question_id:'section-1',duration_seconds:2700,content:{from:'Director',to:'Manager',subject:'Test question',intro:'Synthetic scenario',taskPrompt:'Evaluate',weightageUnit:'percent',subtasks:[{description:'Strategy',weightage:100}]}}],materials:[{id:'old',name:'Existing reference.pdf',kind:'reference',question_id:'section-1',storage_path:'original/reference.pdf'}]};
function App(){const[tab,setTab]=useState('reports');return <main className='mx-auto max-w-3xl p-4'><nav className='mb-4 flex flex-wrap gap-4'><button onClick={()=>setTab('reports')}>Reports</button><button onClick={()=>setTab('mock')}>Mock materials</button></nav>{tab==='reports'?<><label>Unpublished feedback<textarea aria-label='Unpublished feedback' className='w-full border'/></label><SubmissionReports submissionId='synthetic-submission' reports={[]}/></>:<MockUploadForm initialExam={initialExam}/>}</main>};createRoot(document.getElementById('root')).render(<App/>);
`);
await build({configFile:false,root,logLevel:'error',resolve:{alias:{'next/navigation':navigation,'@/lib/supabase/client':client,'@':root},dedupe:['react','react-dom']},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(out,'bundle'),emptyOutDir:false,rolldownOptions:{input:entry,output:{format:'iife',entryFileNames:'uploads.js',codeSplitting:false}}}});
const bundle=await readFile(path.join(out,'bundle/uploads.js')),names=await readdir('.next/static',{recursive:true});
const css=(await Promise.all(names.filter(n=>n.endsWith('.css')).map(n=>readFile('.next/static/'+n,'utf8')))).join('\n');
const uploads=[],calls=[],receipts=new Map();let interrupted=false;
const server=createServer(async(request,response)=>{
  if(request.url==='/uploads.js'){response.setHeader('Content-Type','text/javascript; charset=utf-8');response.end(bundle);return;}
  if(request.url==='/qa/upload'||request.url.startsWith('/api/')){
    let raw='';for await(const chunk of request)raw+=chunk;const body=JSON.parse(raw);response.setHeader('Content-Type','application/json');
    if(request.url==='/qa/upload'){uploads.push(body);response.end('{"error":null}');return;}
    calls.push({url:request.url,method:request.method,body});
    if(request.method==='DELETE'){response.end('{"deleted":true,"cleanup_pending":false}');return;}
    if(request.url.includes('/reports')){
      if(!receipts.has(body.storage_path))receipts.set(body.storage_path,'report-'+receipts.size);
      if(body.file_name==='retry.docx'&&!interrupted){interrupted=true;response.statusCode=503;response.end('{"error":"Attachment response interrupted"}');return;}
      response.end(JSON.stringify({id:receipts.get(body.storage_path)}));return;
    }
    response.end('{"id":"synthetic-copy","action":"copied"}');return;
  }
  response.setHeader('Content-Type','text/html; charset=utf-8');response.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script src="/uploads.js"></script>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const{chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const pdf=name=>({name,mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 synthetic')});
try{for(const[width,height]of[[1440,900],[390,844],[320,568]]){
  uploads.length=0;calls.length=0;receipts.clear();interrupted=false;
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto('http://127.0.0.1:'+server.address().port);await page.getByLabel('Unpublished feedback').fill('Keep this unpublished feedback');
    const longName='marked-feedback-'.repeat(8)+'.pdf',input=page.getByLabel('Graded report document',{exact:true});
    await input.setInputFiles([pdf(longName),{name:'retry.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from('synthetic DOCX')},pdf('wrong.pdf')]);
    await page.getByRole('button',{name:'Remove Graded report document: wrong.pdf',exact:true}).click();
    await page.getByRole('button',{name:'Upload reports',exact:true}).click();await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').textContent(),/1 of 2 reports attached/);assert.equal(uploads.length,2);
    assert.equal(await page.getByRole('button',{name:'Remove Graded report document: retry.docx',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Upload reports',exact:true}).click();await page.getByRole('link',{name:'retry.docx',exact:true}).waitFor();
    assert.equal(uploads.length,2);assert.equal(calls[1].body.storage_path,calls[2].body.storage_path);assert.equal(await page.getByLabel('Unpublished feedback').inputValue(),'Keep this unpublished feedback');
    await page.screenshot({path:path.join(out,'reports-'+width+'.png'),fullPage:true});
    await page.getByRole('button',{name:'Delete report retry.docx',exact:true}).click();await page.getByRole('button',{name:'Delete report permanently',exact:true}).click();
    await page.getByRole('link',{name:'retry.docx',exact:true}).waitFor({state:'detached'});assert.equal(await page.getByRole('link',{name:longName,exact:true}).count(),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.getByRole('button',{name:'Mock materials',exact:true}).click();
    await page.getByLabel('Pre-seen PDF',{exact:true}).setInputFiles([pdf('preseen-one.pdf'),pdf('preseen-two.pdf')]);
    await page.getByLabel('Suggested solution PDF',{exact:true}).setInputFiles([pdf('solution-one.pdf'),pdf('solution-two.pdf')]);
    await page.getByLabel('Question 1 reference material',{exact:true}).setInputFiles([pdf('reference.pdf'),{name:'chart.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10,0])},pdf('wrong-reference.pdf')]);
    await page.getByRole('button',{name:'Remove Question 1 reference material: wrong-reference.pdf',exact:true}).click();
    assert.equal(await page.getByRole('link',{name:'Existing reference.pdf',exact:true}).count(),1);
    await page.screenshot({path:path.join(out,'mock-materials-'+width+'.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.getByRole('button',{name:'Save draft changes',exact:true}).click();await page.waitForFunction(()=>window.lastNavigation?.includes('saved=copy'));
    const saved=calls.at(-1);assert.equal(saved.method,'PUT');assert.equal(saved.body.materials.length,7);assert.ok(saved.body.materials.some(m=>m.storage_path==='original/reference.pdf'));
    assert.equal(uploads.filter(file=>file.bucket==='exam-materials').length,6);assert.equal(saved.body.materials.filter(m=>m.kind==='reference').length,3);assert.deepEqual(errors,[]);
  }finally{await page.close();}
}console.log('PASS: real desktop/390px/320px batch uploads, individual removal, retry without duplicates, preserved feedback and multi-file mock metadata');}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

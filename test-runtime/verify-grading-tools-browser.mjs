import assert from 'node:assert/strict';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'outputs/grading-tools-browser');await mkdir(out,{recursive:true});
const entry=path.join(out,'entry.jsx'),navigation=path.join(out,'navigation.mjs');
await writeFile(navigation,'export const useRouter=()=>({refresh(){},replace(){}});');
await writeFile(entry,`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {GradingForm} from '../../components/dashboard/grading-form';
import {DeleteReportButton} from '../../components/dashboard/delete-report-button';
import {MaterialFileInput} from '../../components/dashboard/material-file-input';
function App(){const[file,setFile]=useState(null),[removed,setRemoved]=useState(false);return <main style={{maxWidth:760,margin:'auto',padding:16}}>
<GradingForm submission={{id:'synthetic',score:null,feedback:''}} evaluation={null}/>
<section className='my-5 rounded-lg border p-4'><h2>Attached report</h2>{removed?<p>Report removed</p>:<DeleteReportButton submissionId='synthetic' reportId='synthetic-report' name={'long-reference-'.repeat(10)+'wrong.pdf'} onDeleted={()=>setRemoved(true)}/>}</section>
<section className='rounded-lg border p-4'><h2>Reference material</h2><MaterialFileInput label='Reference document' accept='.pdf' file={file} onChange={setFile}/></section>
</main>};createRoot(document.getElementById('root')).render(<App/>);
`);
await build({configFile:false,root,logLevel:'error',resolve:{alias:{'next/navigation':navigation,'@':root},dedupe:['react','react-dom']},oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(out,'bundle'),emptyOutDir:false,rolldownOptions:{input:entry,output:{format:'iife',entryFileNames:'tools.js'}}}});
const bundle=await readFile(path.join(out,'bundle/tools.js'));
const names=await readdir('.next/static',{recursive:true}),css=(await Promise.all(names.filter(n=>n.endsWith('.css')).map(n=>readFile('.next/static/'+n,'utf8')))).join('\n');
const writes=[];
const server=createServer(async(request,response)=>{
  if(request.url==='/tools.js'){response.setHeader('Content-Type','text/javascript');response.end(bundle);}
  else if(request.url.startsWith('/api/')){let body='';for await(const chunk of request)body+=chunk;writes.push({method:request.method,body:JSON.parse(body)});response.setHeader('Content-Type','application/json');response.end(JSON.stringify({deleted:true,cleanup_pending:false}));}
  else{response.setHeader('Content-Type','text/html');response.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script src="/tools.js"></script>');}
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const{chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try{for(const[width,height]of[[1440,900],[390,844],[320,568]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
  const score=page.locator('input[name=score]');await score.waitFor();assert.equal(await score.getAttribute('max'),'150');
  await page.locator('textarea[name=feedback]').fill('Synthetic tutor feedback');await score.fill('151');let before=writes.length;await page.getByRole('button',{name:'Publish / Final Submit',exact:true}).click();assert.equal(writes.length,before);assert.equal(await score.evaluate(el=>el.validity.rangeOverflow),true);
  await score.fill('140');await page.getByRole('button',{name:'Publish / Final Submit',exact:true}).click();await page.getByText('Evaluation saved.',{exact:true}).waitFor();assert.equal(writes.at(-1).body.score_max,150);assert.equal(writes.at(-1).body.score,140);
  const file=page.getByLabel('Reference document',{exact:true});await file.setInputFiles({name:'wrong.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 synthetic')});await page.getByRole('button',{name:'Clear Reference document',exact:true}).click();assert.equal(await file.inputValue(),'');assert.equal(await file.evaluate(el=>el.files.length),0);
  const remove=page.getByRole('button',{name:/^Delete report long-reference/});await remove.click();const dialog=page.getByRole('alertdialog');await dialog.waitFor();const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await page.screenshot({path:path.join(out,'confirmation-'+width+'.png')});before=writes.length;await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(writes.length,before);
  await remove.click();await page.getByRole('button',{name:'Delete report permanently',exact:true}).click();await page.getByText('Report removed',{exact:true}).waitFor();assert.equal(writes.at(-1).method,'DELETE');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await page.close();
}console.log('PASS: real desktop/mobile grading validation, 150-scale payload, native file clearing and bounded long-filename deletion confirmations');}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

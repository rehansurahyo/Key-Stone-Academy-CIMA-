import assert from 'node:assert/strict';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'vite';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'outputs/answer-download-browser');await mkdir(out,{recursive:true});
const entry=path.join(out,'entry.jsx');
await writeFile(entry,`
import React from 'react';import {createRoot} from 'react-dom/client';import {Toaster} from 'sonner';
import {AnswerDownloads} from '../../components/dashboard/answer-downloads';
createRoot(document.getElementById('root')).render(<main style={{padding:20,maxWidth:620,margin:'auto'}}><h1>Submitted answer sheet</h1><AnswerDownloads submissionId='synthetic-submission'/><Toaster/></main>);
`);
await build({configFile:false,root,logLevel:'error',resolve:{alias:{'@':root},dedupe:['react','react-dom']},oxc:{jsx:{runtime:'automatic'}},
  build:{outDir:path.join(out,'bundle'),emptyOutDir:false,rolldownOptions:{input:entry,output:{format:'es',entryFileNames:'download.js',chunkFileNames:'[name]-[hash].js'}}}});
const names=await readdir(path.join(out,'bundle'));
const scripts=new Map(await Promise.all(names.filter(name=>name.endsWith('.js')).map(async name=>['/'+name,await readFile(path.join(out,'bundle',name))])));
const files=await readdir('.next/static',{recursive:true});
const css=(await Promise.all(files.filter(file=>file.endsWith('.css')).map(file=>readFile('.next/static/'+file,'utf8')))).join('\n');
const input={examName:'OCS download QA',level:'OCS',candidate:'Synthetic Candidate',submittedAt:'2026-11-01T10:00:00Z',questions:[],answers:{legacy:'<h2>Financial evaluation</h2><p>Revenue £1,200 &amp; return €90.<br>Second line.</p><ol><li>First point</li><li>Second point</li></ol><table><tr><th colspan="2">Merged header</th></tr><tr><td>NPV</td><td>£1,200</td></tr></table>'+('<p>Long answer: examine business performance, risks and financial returns.</p>'.repeat(60))+'<img src="/must-not-fetch"><script>window.injected=true</script>'}};
let mode='ok',requests=0,unexpected=0;
const server=createServer((request,response)=>{
  if(scripts.has(request.url)){response.setHeader('Content-Type','text/javascript');response.end(scripts.get(request.url));}
  else if(request.url.startsWith('/api/submissions/')){
    requests++;response.setHeader('Cache-Control','private, no-store');
    if(!request.url.endsWith('?format=data')){response.statusCode=400;response.end('Unexpected server-side PDF rendering');return;}
    const payload=mode==='ok'?{input,filename:'SyntheticCandidate_Mock_2026-11-01_1500.pdf'}:mode==='malformed'?{}:mode==='invalid'?{input:{...input,submittedAt:'invalid-date'},filename:'test.pdf'}:{error:mode==='denied'?'Your login has expired. Please sign in again.':'Unable to load the submitted answers.'};
    response.statusCode=mode==='denied'?401:mode==='failed'?503:200;response.setHeader('Content-Type','application/json');
    setTimeout(()=>response.end(JSON.stringify(payload)),120);
  }else if(request.url==='/must-not-fetch'){unexpected++;response.statusCode=404;response.end();}
  else{response.setHeader('Content-Type','text/html');response.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script type="module" src="/download.js"></script>');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try{
  for(const [width,height] of [[1440,900],[390,844]]){
    const page=await browser.newPage({viewport:{width,height},acceptDownloads:true}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port);const pdf=page.getByRole('link',{name:'Download as PDF (.pdf)',exact:true});await pdf.waitFor();
    const word=page.getByRole('link',{name:'Download as Word (.docx)',exact:true});assert.ok((await word.getAttribute('href')).endsWith('?format=docx'));
    const before=requests,downloaded=page.waitForEvent('download');await pdf.evaluate(el=>{el.click();el.click();});
    const download=await downloaded;assert.equal(download.suggestedFilename(),'SyntheticCandidate_Mock_2026-11-01_1500.pdf');
    const target=path.join(out,'browser-answer-'+width+'.pdf');await download.saveAs(target);
    assert.equal((await readFile(target)).subarray(0,5).toString(),'%PDF-');assert.equal(requests,before+1,'double click makes only one authenticated request');
    assert.equal(page.url(),'http://127.0.0.1:'+server.address().port+'/');await pdf.waitFor();
    for(const next of ['denied','failed','malformed','invalid']){
      mode=next;await pdf.click();await page.locator('p[role="alert"]').waitFor();
      await pdf.waitFor();assert.equal(await pdf.getAttribute('aria-busy'),'false');
      assert.ok(await page.locator('p[role="alert"]').textContent());
    }
    mode='ok';const retry=page.waitForEvent('download');await pdf.click();await retry;assert.equal(await page.locator('p[role="alert"]').count(),0);
    assert.equal(await page.evaluate(()=>Boolean(window.injected)),false);assert.equal(unexpected,0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'download-'+width+'.png')});await page.close();
  }
  console.log('PASS: real desktop/mobile PDF downloads, lazy browser engine, duplicate-click guard, expired login/server/layout/payload errors and successful retry without navigation');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

import assert from 'node:assert/strict';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'vite';

// Real React components in Chromium, with synthetic private-document fixtures.
const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'outputs/reference-viewer');await mkdir(out,{recursive:true});
const entry=path.join(out,'entry.jsx');
await writeFile(entry,`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ResizableMaterialWindow} from '../../components/resizable-material-window';
import {ReferenceMaterialContent} from '../../components/reference-material-content';
const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=1000;
const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1400,1000);
ctx.fillStyle='#0B2545';ctx.font='48px sans-serif';ctx.fillText('Reference material: synthetic test data',45,90);
ctx.font='32px sans-serif';ctx.fillText('Revenue and costs by quarter',45,160);
[300,470,390,580].forEach((height,i)=>{ctx.fillStyle='#0067A3';ctx.fillRect(100+i*300,880-height,150,height);});
const image=canvas.toDataURL('image/png');
function App(){const [open,setOpen]=useState(true),[kind,setKind]=useState('image');
return <><button onClick={()=>setOpen(true)}>Open reference</button>{open&&<ResizableMaterialWindow title='Reference Material' onClose={()=>setOpen(false)}>
<div className='flex shrink-0 gap-2 border-b bg-slate-50 p-2'><button onClick={()=>setKind('image')}>Image reference</button><button onClick={()=>setKind('pdf')}>PDF reference</button></div>
<ReferenceMaterialContent key={kind} material={{id:kind,exam_id:'qa',kind:'reference',question_id:'section-1',name:kind==='pdf'?'Reference PDF':'Budget reference chart',storage_path:'qa/reference.'+(kind==='pdf'?'pdf':'png')}} url={kind==='pdf'?'/reference.pdf':image}/>
</ResizableMaterialWindow>}</>}
createRoot(document.getElementById('root')).render(<App/>);
`);
await build({configFile:false,root:out,logLevel:'error',resolve:{alias:{'@':root},dedupe:['react','react-dom']},
  oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(out,'bundle'),emptyOutDir:false,rolldownOptions:{input:entry,output:{format:'iife',entryFileNames:'viewer.js'}}}});
const files=await readdir('.next/static',{recursive:true});
const css=(await Promise.all(files.filter(file=>file.endsWith('.css')).map(file=>readFile(`.next/static/${file}`,'utf8')))).join('\n');
const bundle=await readFile(path.join(out,'bundle/viewer.js'));
function pdfFixture(){
  const stream='BT /F1 24 Tf 40 740 Td (Reference material QA) Tj 0 -45 Td /F1 16 Tf (A readable PDF must enlarge with the zoom controls.) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream'];
  let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+object+'\nendobj\n';});
  const xref=Buffer.byteLength(pdf);pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';return Buffer.from(pdf);
}
const pdf=pdfFixture();
const server=createServer((request,response)=>{
  if(request.url==='/viewer.js'){response.setHeader('Content-Type','text/javascript');response.end(bundle);}
  else if(request.url==='/reference.pdf'){response.setHeader('Content-Type','application/pdf');response.setHeader('Content-Length',pdf.length);response.end(pdf);}
  else {response.setHeader('Content-Type','text/html');response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><div id="root"></div><script src="/viewer.js"></script></body></html>');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try{
  for(const [width,height] of [[1440,900],[768,1024],[390,844],[320,568]]){
    const page=await browser.newPage({viewport:{width,height},hasTouch:width<=390});const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port);const window=page.getByRole('dialog',{name:'Reference Material window'});await window.waitFor({state:'visible'});
    const image=page.getByAltText('Budget reference chart');await image.waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('img')?.naturalWidth>0);
    const original=await image.boundingBox();
    for(let i=0;i<4;i++)await page.getByRole('button',{name:'Zoom in reference material',exact:true}).click();
    assert.equal(await page.getByLabel('Reference zoom level').textContent(),'200%');
    const enlarged=await image.boundingBox();assert.ok(enlarged.width>=original.width*1.95,'Image actually enlarges rather than only changing a label');
    const viewport=page.getByLabel('Reference document viewport');assert.equal(await viewport.evaluate(el=>el.scrollWidth>el.clientWidth),true);
    await viewport.evaluate(el=>{el.scrollLeft=100;el.scrollTop=60;});assert.ok(await viewport.evaluate(el=>el.scrollLeft>0));
    await page.getByRole('button',{name:'Fit reference material to width'}).click();assert.equal(await page.getByLabel('Reference zoom level').textContent(),'100%');
    const before=await window.boundingBox();await page.getByRole('button',{name:'Maximize reference window'}).click();
    const full=await window.boundingBox();assert.ok(full.width>=width-18&&full.height>=height-58);
    await page.getByRole('button',{name:'Restore reference window'}).click();const restored=await window.boundingBox();assert.ok(Math.abs(restored.width-before.width)<2&&Math.abs(restored.height-before.height)<2);
    const handle=page.getByRole('button',{name:'Resize reference window'});await handle.focus();await page.keyboard.press('ArrowUp');
    const smaller=await window.boundingBox();assert.ok(smaller.height<restored.height);
    // Real pointer drag must continue after leaving the handle/iframe region.
    const point=await handle.boundingBox();await page.mouse.move(point.x+point.width/2,point.y+point.height/2);await page.mouse.down();await page.mouse.move(point.x-35,point.y-35,{steps:5});await page.mouse.up();
    const resized=await window.boundingBox();assert.ok(resized.height<smaller.height);assert.ok(resized.width<=smaller.width);
    await page.screenshot({path:path.join(out,`image-${width}.png`)});
    await page.getByRole('button',{name:'PDF reference',exact:true}).click();const frame=page.locator('iframe[title="Reference PDF"]');await frame.waitFor({state:'visible'});
    // Chrome's PDF surface paints after the iframe DOM is ready.
    await page.waitForTimeout(1800);
    const src=await frame.getAttribute('src');const base=await frame.boundingBox();
    await frame.evaluate(el=>el.dataset.qaRetained='yes');
    for(let i=0;i<4;i++)await page.getByRole('button',{name:'Zoom in reference material',exact:true}).click();
    const bigger=await frame.boundingBox();assert.ok(bigger.width>=base.width*1.9,'PDF surface actually scales');assert.equal(await frame.getAttribute('src'),src);
    assert.equal(await frame.evaluate(el=>el.style.transform),'scale(2)');
    assert.equal(await frame.getAttribute('data-qa-retained'),'yes','Zoom preserves the existing PDF frame');
    const pdfHandle=await handle.boundingBox(),pdfBefore=await window.boundingBox();
    if(width<=390){
      const touch=await page.context().newCDPSession(page);const x=pdfHandle.x+pdfHandle.width/2,y=pdfHandle.y+pdfHandle.height/2;
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-25,y:y-40}]});
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await touch.detach();
    }else{
      await page.mouse.move(pdfHandle.x+pdfHandle.width/2,pdfHandle.y+pdfHandle.height/2);await page.mouse.down();await page.mouse.move(pdfHandle.x-25,pdfHandle.y-40,{steps:5});await page.mouse.up();
    }
    assert.ok((await window.boundingBox()).height<pdfBefore.height,'Pointer/touch resize keeps working across the live PDF surface');
    await page.screenshot({path:path.join(out,`pdf-${width}.png`)});
    await page.setViewportSize({width:320,height:568});
    await page.waitForFunction(()=>{const r=document.querySelector('[role=dialog]').getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;});
    const fit=await window.boundingBox();assert.ok(fit.x>=0&&fit.y>=0&&fit.x+fit.width<=321&&fit.y+fit.height<=569,'Window stays reachable after a viewport change');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.getByRole('button',{name:'Close Reference Material',exact:true}).click();assert.equal(await window.count(),0);
    await page.getByRole('button',{name:'Open reference',exact:true}).click();await window.waitFor({state:'visible'});
    assert.deepEqual(errors,[]);await page.close();
    console.log(`PASS: live image/PDF zoom, fit-width, scrolling, maximize/restore, keyboard/pointer resize and viewport recovery at ${width}x${height}`);
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

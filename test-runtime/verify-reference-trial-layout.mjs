import assert from 'node:assert/strict';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import React from '../node_modules/react/index.js';
import {renderToStaticMarkup} from '../node_modules/react-dom/server.node.js';
import {loader} from './component-loader.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const files=await readdir('.next/static',{recursive:true});
const css=(await Promise.all(files.filter(file=>file.endsWith('.css')).map(file=>readFile(`.next/static/${file}`,'utf8')))).join('\n');
const dialog=await readFile('outputs/trial-start/dialog.html','utf8');
const {ReferenceMaterialContent}=loader()('components/reference-material-content.tsx');
await mkdir('outputs/reference-trial',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try{
  for(const [width,height] of [[1440,900],[768,1024],[390,844],[320,568]]){
    const page=await browser.newPage({viewport:{width,height}});
    await page.setContent(`<style>${css}</style>${dialog}`);
    const alert=page.getByRole('alertdialog');await alert.waitFor({state:'visible'});
    const box=await alert.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);
    await page.getByRole('button',{name:'Go ahead',exact:true}).waitFor({state:'visible'});
    await page.getByRole('button',{name:'Go back',exact:true}).waitFor({state:'visible'});
    assert.ok((await alert.textContent()).includes('one free-trial attempt'));
    await page.screenshot({path:`outputs/reference-trial/confirmation-${width}.png`});
    const chart=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=700;
      const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1200,700);ctx.fillStyle='#0B2545';ctx.font='40px sans-serif';ctx.fillText('Reference chart: synthetic QA data',40,70);
      [180,300,210,400].forEach((h,i)=>{ctx.fillStyle='#0067A3';ctx.fillRect(100+i*240,600-h,120,h);});
      return canvas.toDataURL('image/png');
    });
    const material={id:'qa-image',kind:'reference',name:'Budget reference chart',storage_path:'qa/reference.png'};
    const markup=renderToStaticMarkup(React.createElement(ReferenceMaterialContent,{material,url:chart}));
    await page.setContent(`<style>${css}</style><section style="display:flex;flex-direction:column;width:100%;height:65vh">${markup}</section>`);
    const img=page.getByAltText(material.name);await img.waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('img')?.complete);
    assert.equal(await img.evaluate(el=>el.naturalWidth),1200);
    const imageBox=await img.boundingBox();assert.ok(imageBox.x>=0&&imageBox.x+imageBox.width<=width+1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.screenshot({path:`outputs/reference-trial/image-${width}.png`});await page.close();
    console.log(`PASS: visible one-attempt confirmation/buttons and private-image layout without horizontal overflow at ${width}x${height}`);
  }
}finally{await browser.close();}

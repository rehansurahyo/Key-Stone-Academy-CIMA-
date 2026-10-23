import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const files=await readdir('.next/static',{recursive:true});
const css=(await Promise.all(files.filter(file=>file.endsWith('.css')).map(file=>readFile(`.next/static/${file}`,'utf8')))).join('\n');
const table=await readFile('outputs/lead-export/table.html','utf8');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try{
  for(const [width,height] of [[1440,900],[768,1024],[390,844],[320,568]]){
    const page=await browser.newPage({viewport:{width,height}});
    await page.setContent(`<style>${css}</style><main style="height:100dvh;overflow:auto;padding:16px">${table}</main>`);
    const button=page.getByRole('button',{name:'Export to Excel',exact:true});const bounds=await button.boundingBox();
    assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y>=0&&bounds.y+bounds.height<=height);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Wide lead table scroll is contained');
    assert.ok((await button.boundingBox()).height>=40,'Usable touch target');
    await page.screenshot({path:`outputs/lead-export/${width}.png`});
    console.log(`PASS: lead search/export controls fit ${width}x${height}; download button remains visible and horizontal table scroll is contained`);
    await page.close();
  }
}finally{await browser.close();}

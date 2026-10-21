import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const files=await readdir('.next/static',{recursive:true});
const css=(await Promise.all(files.filter(file=>file.endsWith('.css')).map(file=>readFile(`.next/static/${file}`,'utf8')))).join('\n');
const table=await readFile('outputs/trial-badge-layout/table.html','utf8');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try{
  for(const [width,height] of [[1440,900],[768,1024],[390,844],[320,568]]){
    const page=await browser.newPage({viewport:{width,height}});
    await page.setContent(`<style>${css}</style><main style="height:100dvh;overflow:auto;padding:16px">${table}</main>`);
    const badges=page.getByText('Free Trial',{exact:true});assert.equal(await badges.count(),2);
    const size=await badges.first().boundingBox();assert.ok(size.height<=20&&size.width<=75,`Badge stays small: ${JSON.stringify(size)}`);
    assert.equal(await badges.first().evaluate(el=>getComputedStyle(el).fontSize),'10px');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Table scroll remains contained');
    await page.screenshot({path:`outputs/trial-badge-layout/${width}.png`});
    console.log(`PASS: tiny 10px trial badges and existing table layout fit ${width}x${height} without page overflow`);
    await page.close();
  }
}finally{await browser.close();}

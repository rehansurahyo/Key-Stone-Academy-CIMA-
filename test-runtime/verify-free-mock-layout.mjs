import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const files=await readdir('.next/static',{recursive:true});
const css=(await Promise.all(files.filter(file=>file.endsWith('.css')).map(file=>readFile(`.next/static/${file}`,'utf8')))).join('\n');
assert.ok(css.length>1000,'Run the production build first');
const modal=await readFile('outputs/free-mock-layout/dialog.html','utf8');
const table=await readFile('outputs/free-mock-layout/table.html','utf8');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try{
  for(const [width,height] of [[1440,900],[768,1024],[390,844],[320,568]]){
    const page=await browser.newPage({viewport:{width,height}});
    await page.setContent(`<style>${css}</style>${modal}`);
    await page.waitForTimeout(250);
    const dialog=page.getByRole('alertdialog');
    const bounds=await dialog.boundingBox();
    assert.ok(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1,`Modal fits ${width}x${height}: ${JSON.stringify(bounds)}`);
    assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'No horizontal overflow in confirmation');
    await page.screenshot({path:`outputs/free-mock-layout/modal-${width}.png`});
    await page.setContent(`<style>${css}</style><main style="height:100dvh;overflow:auto;padding:16px">${table}</main>`);
    assert.ok(await page.getByRole('button',{name:'Set OCS Mock 1 as free mock',exact:true}).count());
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Table scrolling stays in its container');
    await page.screenshot({path:`outputs/free-mock-layout/table-${width}.png`});
    console.log(`PASS: real admin confirmation/table markup with production CSS fits ${width}x${height}; table scroll is contained`);
    await page.close();
  }
}finally{await browser.close();}

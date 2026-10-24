import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const files=await readdir('.next/static',{recursive:true});
const css=(await Promise.all(files.filter(file=>file.endsWith('.css')).map(file=>readFile(`.next/static/${file}`,'utf8')))).join('\n');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try{
  for(const [width,height] of [[1440,900],[768,1024],[390,844],[320,568]]){
    for(const state of ['healthy','error']){
      const markup=await readFile(`outputs/quiet-autosave/${state}.html`,'utf8');
      const page=await browser.newPage({viewport:{width,height}});
      await page.setContent(`<style>${css}</style>${markup}`);
      assert.equal(await page.getByText('Saving...', {exact:true}).count(),0);
      assert.equal(await page.getByText('All changes saved',{exact:true}).count(),0);
      assert.equal(await page.locator('svg.lucide-save').count(),0);
      const warning=page.getByRole('alert',{name:'Progress save warning'});
      assert.equal(await warning.count(),state==='error'?1:0);
      if(state==='error'){
        const box=await warning.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);
        assert.equal(await warning.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'Warning text wraps without horizontal overflow');
        assert.ok((await warning.textContent()).includes('have not synced yet'));
      }
      assert.equal(await page.locator('.tiptap').getAttribute('contenteditable'),'true');
      await page.screenshot({path:`outputs/quiet-autosave/${state}-${width}.png`});
      await page.close();
    }
    console.log(`PASS: no routine autosave UI; readable failure warning and editable response at ${width}x${height}`);
  }
}finally{await browser.close();}

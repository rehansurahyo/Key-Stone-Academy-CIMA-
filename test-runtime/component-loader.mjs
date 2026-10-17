import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';

// Transpile real source modules. Only framework navigation and network clients
// are substituted; component markup, event handlers and validation stay real.
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(path.join(root,'package.json'));
const cache=new Map();
export function loader(stubs={}) {
  cache.clear();
  function load(file) {
    if(cache.has(file))return cache.get(file).exports;
    const mod={exports:{}};cache.set(file,mod);
    const output=ts.transpile(readFileSync(file,'utf8'),{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true});
    function resolve(id) {
      if(Object.hasOwn(stubs,id))return stubs[id];
      if(id.startsWith('@/')||id.startsWith('.')) {
        const base=id.startsWith('@/')?path.join(root,id.slice(2)):path.resolve(path.dirname(file),id);
        const resolved=['','.ts','.tsx','.js','/index.ts'].map(ext=>base+ext).find(p=>existsSync(p));
        if(!resolved)throw new Error(`Cannot resolve ${id}`);
        return load(resolved);
      }
      return require(id);
    }
    vm.runInThisContext(`(function(require,module,exports){${output}\n})`,{filename:file})(resolve,mod,mod.exports);
    return mod.exports;
  }
  return file=>load(path.join(root,file));
}

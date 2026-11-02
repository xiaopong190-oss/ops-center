import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import Babel from '@babel/standalone';

const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(new URL('../modules/new-product-followup/work/qa/package.json',import.meta.url));
const {JSDOM}=require('jsdom');
for(const script of ['sync-browser.mjs','deploy/build-browser-bundle.mjs']){
  const result=spawnSync(process.execPath,[script],{cwd:root,stdio:'inherit'});
  if(result.error)throw result.error;
  assert.equal(result.status,0,script+' must succeed');
}

// Execute the real app.html boot loader with local assets and no cloud writes.
// Stop at the React mount boundary so this tests startup independently of login.
for(const useBundle of [true,false]){
  const dom=new JSDOM(fs.readFileSync(path.join(root,'app.html'),'utf8'),{
    url:'https://example.test/ops-center/',runScripts:'outside-only',
  });
  const {window}=dom;
  let mounts=0;
  const requested=[];
  try{
    window.React={createContext:()=>({}),createElement:(type,props,...children)=>({type,props,children})};
    window.ReactDOM={createRoot:element=>({render(tree){
      assert.equal(element,window.document.getElementById('root'));
      assert.equal(tree.type.name,'App');
      mounts++;
    }})};
    window.Babel=Babel;
    window.fetch=async url=>{
      const asset=new URL(url,window.location.href).pathname.replace('/ops-center/','');
      requested.push(asset);
      const exists=fs.existsSync(path.join(root,asset));
      const allowed=asset==='app.version.txt'||asset==='app.bundle.js'||asset.startsWith('src/');
      const ok=allowed&&exists&&(useBundle||asset!=='app.bundle.js');
      return {ok,status:ok?200:404,text:async()=>ok?fs.readFileSync(path.join(root,asset),'utf8'):''};
    };
    const boot=[...window.document.scripts].find(script=>script.textContent.includes('async function boot'));
    assert.ok(boot,'real HTML boot loader exists');
    await window.eval(boot.textContent);
    assert.equal(window.document.getElementById('boot-error').textContent,'','startup must not show a load error');
    assert.equal(mounts,1,'application reaches React mount exactly once');
    assert.equal(requested.includes('src/LogisticsModule.browser.jsx'),!useBundle);
    assert.equal(typeof window.sharedStorage.get,'function');
    console.log('PASS browser startup: '+(useBundle?'precompiled bundle':'runtime JSX fallback'));
  }finally{window.close();}
}

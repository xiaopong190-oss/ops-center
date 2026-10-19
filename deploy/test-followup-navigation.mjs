import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Babel=require('@babel/standalone');
const source=fs.readFileSync(new URL('../src/NewProductFollowupModule.jsx',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace('export function','function');
const compiled=Babel.transform(source,{presets:['react']}).code;
let effectIndex=0,stateIndex=0,publishes=0,tree;
const effects=[],states=[],scheduled=[];
const context=vm.createContext({
  React:{createElement:(type,props,...children)=>({type,props,children})},
  useRef:()=>({current:{contentWindow:{async setOpsFollowupContext(){publishes++;}}}}),
  useState:initial=>{const index=stateIndex++;if(!states[index])states[index]=[initial,()=>{}];return states[index];},
  useEffect:(callback,deps)=>{
    const index=effectIndex++,previous=effects[index];
    if(!previous||deps.some((value,i)=>!Object.is(value,previous.deps[i])))scheduled.push(()=>{
      if(previous?.cleanup)previous.cleanup();
      const cleanup=callback();
      assert.ok(cleanup===undefined||typeof cleanup==='function','React effect must not return an initialization Promise; switching menus would call it as cleanup');
      effects[index]={deps,cleanup};
    });
  },
  useGlobalConfig:()=>({staff:[]}),useCurrentUser:()=>({id:'synthetic-user',name:'Synthetic'}),
  canCurrentUserEdit:()=>true,userWantsAutoShare:()=>false,useCloudSyncPage:()=>{},
  window:{addEventListener(){},removeEventListener(){}},
  NEW_PRODUCT_FOLLOWUP_HTML:{legacy:'legacy',tracker:'tracker'},
});
vm.runInContext(compiled+'\nthis.renderPanel=NewProductFollowupPanel;',context);
for(const active of [false,true,false,true,false,true,false,true]){
  effectIndex=0;stateIndex=0;tree=context.renderPanel({active});
  while(scheduled.length)scheduled.shift()();
  assert.equal(tree.type,'section');
}
for(const effect of effects)if(effect.cleanup)effect.cleanup();
assert.equal(publishes,8);
console.log('PASS async iframe initialization and eight active/inactive menu transitions: no Promise cleanup and no effect teardown exception');

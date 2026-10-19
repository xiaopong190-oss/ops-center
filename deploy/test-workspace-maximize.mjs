import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Babel=require('@babel/standalone');
const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const start=source.indexOf('function AppShell('),end=source.indexOf('export default function App()',start),shell=source.slice(start,end);
let stateIndex=0,entered=0,exited=0;
const states=[],cleanups=[],rootListeners={},frameListeners={};
const target=listeners=>({addEventListener:(name,fn)=>{listeners[name]=fn;},removeEventListener:name=>{delete listeners[name];}});
const frameDoc=target(frameListeners);
const document={...target(rootListeners),querySelectorAll:()=>[{contentDocument:frameDoc}],fullscreenElement:null,
  documentElement:{async requestFullscreen(){entered++;document.fullscreenElement=this;rootListeners.fullscreenchange?.();}},
  async exitFullscreen(){exited++;document.fullscreenElement=null;rootListeners.fullscreenchange?.();},
};
const mocks={
  React:{createElement:(type,props,...children)=>({type,props:props||{},children})},document,
  useCurrentUser:()=>({auth:'super'}),AUTH_ROLE_SUPER:'super',useConfirmLeave:()=>async()=>true,
  TABS:[],TAB_TITLES:{'new-product-followup':'新品跟进'},APP_BUILD:'test',
  useState:initial=>{const i=stateIndex++;if(!states[i])states[i]=[initial,value=>{states[i][0]=typeof value==='function'?value(states[i][0]):value;}];return states[i];},
  useEffect:fn=>{if(!cleanups.length)cleanups.push(fn());},
};
for(const match of shell.matchAll(/<([A-Z][A-Za-z0-9_]*)/g))mocks[match[1]]=()=>null;
const context=vm.createContext(mocks);
vm.runInContext(Babel.transform(shell,{presets:['react']}).code+'\nthis.panel=AppShell',context);
const render=()=>{stateIndex=0;return context.panel({tab:'new-product-followup',dark:false});};
const walk=node=>node&&typeof node==='object'?[node,...node.children.flat(Infinity).flatMap(walk)]:[];
let tree=render(),nodes=walk(tree);
await nodes.find(node=>node.props['aria-label']==='最大化中间工作区').props.onClick();
tree=render();nodes=walk(tree);
assert.ok(tree.props.className.includes('ops-workspace-max'));
assert.ok(nodes.some(node=>node.props.title==='恢复工作区（Esc）'));
frameListeners.keydown({key:'Escape'});
assert.ok(!render().props.className.includes('ops-workspace-max'));
let prevented=false;
rootListeners.keydown({ctrlKey:true,shiftKey:true,code:'KeyF',key:'F',preventDefault(){prevented=true;}});
assert.ok(render().props.className.includes('ops-workspace-max'));assert.ok(prevented);
rootListeners.keydown({key:'Escape'});
assert.ok(!render().props.className.includes('ops-workspace-max'));
assert.equal(entered,2);assert.equal(exited,2);
await walk(render()).find(node=>node.props['aria-label']==='最大化中间工作区').props.onClick();
document.fullscreenElement=null;rootListeners.fullscreenchange();
assert.ok(!render().props.className.includes('ops-workspace-max'),'native browser Escape must also restore the workspace');
document.documentElement.requestFullscreen=async()=>{throw Error('Denied');};
await walk(render()).find(node=>node.props['aria-label']==='最大化中间工作区').props.onClick();
assert.ok(walk(render()).some(node=>node.props.role==='status'),'blocked fullscreen keeps a visible F11 fallback');
rootListeners.keydown({key:'Escape'});
for(const cleanup of cleanups)cleanup?.();
assert.equal(rootListeners.keydown,undefined);assert.equal(frameListeners.keydown,undefined);
console.log('PASS browser fullscreen plus workspace maximize, icon restore, iframe Escape, browser Escape synchronization, shortcut, rejected-request fallback and cleanup');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {NEW_PRODUCT_FOLLOWUP_HTML} from '../src/NewProductFollowupDocument.js';
const require=createRequire(new URL('../modules/new-product-followup/work/qa/package.json',import.meta.url));
const {JSDOM,VirtualConsole}=require('jsdom');
const {IDBFactory}=require('fake-indexeddb');
const d3=fs.readFileSync(new URL('./fixtures/d3-7.9.0.min.js',import.meta.url),'utf8');
const baseLink={sku:'TEST',name:'Synthetic product',account:'Account',store:'Shop',site:'US',owner:'Tester',econ:{price:100,cogs:20,fba:10,head:5,commission:15,other:2,unsellable:50,targetMargin:20}};
const first={linkId:'test',from:'2026-10-05',to:'2026-10-11',sessions:1000,units:100,sales:10000,adSpend:1800,adSales:5000,adOrders:50,returns:5};
const second={...first,from:'2026-10-12',to:'2026-10-18',sessions:800,units:80,sales:8400,adSpend:1500,adSales:4000,adOrders:40,returns:4};
const settle=()=>new Promise(resolve=>setTimeout(resolve,35));
async function mount({link=baseLink,rows=[first,second]}={}){
  const docs={'links/test':structuredClone(link)};rows.forEach((row,index)=>{docs['perf/r'+index]=structuredClone(row);});
  const snapshot={revision:10,data:{products:[],records:[],events:[],trackerV1:{schema:1,docs}}};
  let writes=0;const errors=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.cause?.stack||error.stack||error.message));
  const dom=new JSDOM(NEW_PRODUCT_FOLLOWUP_HTML.tracker,{url:'https://example.test/ops-center/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:console,beforeParse(window){
    window.scrollTo=()=>{};window.structuredClone=structuredClone;window.indexedDB=new IDBFactory();window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});window.eval(d3);
  }});
  const window=dom.window;
  await window.setOpsFollowupContext({user:{id:'test-user',name:'Tester'},staff:[{name:'Tester'}],canEdit:true,active:true,autoShare:false,cloudRequest:async(path,payload)=>{assert.equal(path,'/ops-api/followup');if(payload)writes++;return structuredClone(snapshot);}});
  window.document.querySelector('[data-act="view"][data-v="perf"]').click();await settle();
  const all=window.document.querySelector('[data-act="range"][data-v="all"]');
  assert.ok(all,errors.join('\n')+'\n'+window.document.getElementById('app').textContent.slice(-900));
  all.click();await settle();
  return {dom,window,snapshot,errors,writes:()=>writes,root:()=>window.document.querySelector('#perf-intelligence-root')};
}
let test=await mount();
try{
  const root=test.root();assert.equal(root.querySelectorAll('.perf-stat').length,4);
  assert.ok(root.querySelector('svg.perf-chart [data-chart-frame]'));
  assert.equal(root.querySelector('text[data-axis="x"]').textContent,'周期起始日期');
  assert.equal(root.querySelectorAll('[data-pf]').length,16,'original editable period fields remain available');
  assert.ok(root.querySelector('[data-f="econ.cogs"]'),'original cost save control remains');
  assert.ok(!root.innerHTML.includes('NaN'));assert.ok(!root.innerHTML.includes('Infinity'));
  const source=JSON.stringify(test.snapshot),before=root.querySelector('[data-perf-sim-results]').textContent;
  const price=root.querySelector('[data-perf-sim="price"]');price.value='10';price.dispatchEvent(new test.window.Event('input',{bubbles:true}));
  assert.notEqual(root.querySelector('[data-perf-sim-results]').textContent,before);
  assert.equal(test.writes(),0);assert.equal(JSON.stringify(test.snapshot),source,'scenario does not write the shared library');
  root.querySelector('[data-perf-reset]').click();assert.equal(root.querySelector('[data-perf-sim="price"]').value,'0');
  const period=root.querySelector('[data-perf-period]');period.value='r0';period.dispatchEvent(new test.window.Event('change',{bubbles:true}));
  assert.ok(root.querySelector('[data-perf-period-detail]').textContent.includes('2026-10-05'));
  root.querySelector('[data-perf-jump="records"]').click();assert.equal(root.querySelector('#perf-records').open,true);
  root.querySelector('.perf-metrics [data-v="tacos"]').click();await settle();
  const updated=test.root();assert.equal(updated.querySelectorAll('path.perf-series').length,2);
  const overlay=updated.querySelector('[data-chart-hover-overlay="cross-series"]');overlay.dispatchEvent(new test.window.MouseEvent('pointermove',{clientX:180,bubbles:true}));
  assert.equal(updated.querySelector('.perf-tooltip').hidden,false);
  const legend=updated.querySelector('[data-perf-series="tacos"]');legend.click();assert.equal(legend.getAttribute('aria-pressed'),'false');
  assert.equal(updated.querySelectorAll('path.perf-series').length,1);assert.equal(updated.querySelector('.perf-tooltip').hidden,true);
  legend.click();assert.equal(updated.querySelectorAll('path.perf-series').length,2);
  assert.equal(test.errors.length,0,test.errors.join('\n'));assert.equal(test.writes(),0);
}finally{test.dom.window.close();}
test=await mount({rows:[]});
try{assert.ok(test.root().textContent.includes('先录入一个完整经营周期'));assert.equal(test.root().querySelectorAll('[data-perf-sim]:disabled').length,3);assert.equal(test.errors.length,0,test.errors.join('\n'));}finally{test.dom.window.close();}
test=await mount({link:{...baseLink,econ:{...baseLink.econ,cogs:null}}});
try{assert.ok(test.root().querySelector('.perf-stats').textContent.includes('待补齐'));assert.equal(test.root().querySelectorAll('[data-perf-sim]:disabled').length,3);assert.equal(test.errors.length,0,test.errors.join('\n'));}finally{test.dom.window.close();}
console.log('PASS real D3 + JSDOM dashboard, original editor retention, hover/legend/period interactions, empty/missing states, read-only scenario isolation and zero shared-library writes');

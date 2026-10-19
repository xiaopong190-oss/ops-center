import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {NEW_PRODUCT_FOLLOWUP_HTML} from '../src/NewProductFollowupDocument.js';
const require=createRequire(new URL('../modules/new-product-followup/work/qa/package.json',import.meta.url));
const {JSDOM,VirtualConsole}=require('jsdom');
const {IDBFactory}=require('fake-indexeddb');
const d3=fs.readFileSync(new URL('./fixtures/d3-7.9.0.min.js',import.meta.url),'utf8');
export const baseLink={sku:'TEST',name:'Synthetic product',account:'Account',store:'Shop',site:'US',owner:'Tester',econ:{price:100,cogs:20,fba:10,head:5,commission:15,other:2,unsellable:50,targetMargin:20}};
export const first={linkId:'test',from:'2026-10-05',to:'2026-10-11',sessions:1000,units:100,sales:10000,adSpend:1800,adSales:5000,adOrders:50,returns:5};
export const second={...first,from:'2026-10-12',to:'2026-10-18',sessions:800,units:80,sales:8400,adSpend:1500,adSales:4000,adOrders:40,returns:4};
export const settle=()=>new Promise(resolve=>setTimeout(resolve,35));
export async function mount({link=baseLink,rows=[first,second],canEdit=true,withD3=true,width=640}={}){
  const docs={'links/test':structuredClone(link)};rows.forEach((row,index)=>{docs['perf/r'+index]=structuredClone(row);});
  const snapshot={revision:10,data:{products:[],records:[],events:[],trackerV1:{schema:1,docs}}};
  let writes=0;const errors=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.cause?.stack||error.stack||error.message));
  const dom=new JSDOM(NEW_PRODUCT_FOLLOWUP_HTML.tracker,{url:'https://example.test/ops-center/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:console,beforeParse(window){
    window.scrollTo=()=>{};window.structuredClone=structuredClone;window.indexedDB=new IDBFactory();window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});if(withD3)window.eval(d3);
    window.HTMLElement.prototype.getBoundingClientRect=function(){return {x:0,y:0,left:0,top:0,right:width,bottom:280,width,height:280};};
  }});
  const window=dom.window;
  try{
  await window.setOpsFollowupContext({user:{id:'test-user',name:'Tester'},staff:[{name:'Tester'}],canEdit,active:true,autoShare:false,cloudRequest:async(path,payload)=>{assert.equal(path,'/ops-api/followup');if(payload)writes++;return structuredClone(snapshot);}});
  window.document.querySelector('[data-act="view"][data-v="perf"]').click();await settle();
  const all=window.document.querySelector('[data-act="range"][data-v="all"]');
  assert.ok(all,errors.join('\n')+'\n'+window.document.getElementById('app').textContent.slice(-900));
  all.click();await settle();
  return {dom,window,snapshot,errors,writes:()=>writes,root:()=>window.document.querySelector('#perf-intelligence-root')};
  }catch(error){window.close();throw error;}
}

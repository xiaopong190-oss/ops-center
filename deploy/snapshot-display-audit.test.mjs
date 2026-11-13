import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditDisplay,auditGlobalProviders} from './snapshot-display-audit.mjs';
import Q from '../tools/logistics-rating/quote-core.js';
import W from '../tools/logistics-rating/extensions/weekly-carryover.js';
test('audit separates retained, current and carried providers without changing the snapshot',()=>{
 const row=(company,date)=>({...Q.normalize([company,'英国','海运','BHX1','10','CNY','kg',10,20,date,'普货']),companyId:company});
 const db={quotes:[row('last','2026-11-06'),row('monday','2026-11-09'),row('tuesday','2026-11-10')],regionalQuotes:[],templates:[]};
 const data={storage:{'logistics-quotes-v1':W.choose(db,'2026-11-09','keep')}},before=JSON.stringify(data);
 const result=auditDisplay(data,new Date('2026-11-10T07:06:00Z'));
 const la=result.clocks.find(x=>x.timeZone==='America/Los_Angeles'),cn=result.clocks.find(x=>x.timeZone==='Asia/Shanghai');
 assert.equal(la.today,'2026-11-09');assert.equal(cn.today,'2026-11-10');
 assert.equal(la.current,1);assert.equal(cn.current,2);assert.equal(la.carried,1);
 assert.deepEqual(la.warehouse.map(x=>x.name).sort(),['last','monday']);
 assert.equal(JSON.stringify(data),before);assert(!JSON.stringify(result).includes('price'));
});

test('query audit checks regional-only choices and exact empty warehouse scope with read-only queries',async()=>{
 const calls=[],read=async query=>{calls.push(query);const q=new URLSearchParams(query),regional=q.get('kind').startsWith('regional-'),selected=q.get('provider');return {version:'v1',sourceSha:'s',providerColumn:{choices:[{value:'w'}]},options:{provider:regional?['r']:['w','r']},providerNames:{r:'合成区域物流'},selected:{provider:selected},total:selected?(regional?27:0):1,rows:selected?(regional?[{provider:'r'}]:[]):[]}};
 const result=await auditGlobalProviders(read);assert.equal(result.globalProviderCount,2);assert.deepEqual(result.regionalOnly,[{id:'r',name:'合成区域物流',warehouse:0,regional:27}]);assert.equal(calls.length,4);assert(calls.every(q=>new URLSearchParams(q).get('size')==='1'));
});

test('query audit refuses a missing global provider or silently cleared selection',async()=>{
 for(const missing of [true,false])await assert.rejects(auditGlobalProviders(async query=>{const q=new URLSearchParams(query),regional=q.get('kind').startsWith('regional-'),selected=q.get('provider');return {version:'v1',providerColumn:{choices:[{value:'w'}]},options:{provider:regional?['r']:missing?['w']:['w','r']},selected:{provider:null},total:selected&&!regional?1:27,rows:[]}}),/AUDIT_GLOBAL_PROVIDER_MISSING|AUDIT_REGIONAL_PROVIDER_SCOPE/);
});

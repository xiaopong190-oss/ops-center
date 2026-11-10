import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditDisplay} from './snapshot-display-audit.mjs';
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

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {displayData} from './logistics-workspace.mjs';
test('publication server enforces the same origin scope even for an old input client',()=>{
 const row=channel=>({companyId:'c',company:'物流',country:'美国',warehouse:'ONT8',channel,price:1000,currency:'CNY',unit:'kg',min:1,max:2,date:'2026-10-30',terms:'普货'}),data={space:'real',storage:{'logistics-company-directory-v1':[{id:'c',name:'物流',aliases:[]}],'logistics-quotes-v1':{quotes:[row('宁波起运'),row('深圳起运')],regionalQuotes:[{...row('厦门始发'),regionRaw:'美西'}],templates:[{country:'美国',warehouse:'ONT8'}],originExcludedQuotes:[{raw:'local-only'}]},'logistics-monthly-bills-v1':{rows:[],aliases:{}},'logistics-completed-ratings-v1':[]}},before=JSON.stringify(data),project=displayData(data),q=project.storage['logistics-quotes-v1'];assert.equal(q.quotes.length,1);assert.equal(q.quotes[0].channel,'深圳起运');assert.equal(q.regionalQuotes.length,0);assert.equal(q.templates.length,1);assert(!('originExcludedQuotes'in q));assert.equal(JSON.stringify(data),before);
});

test('publication projection applies unit exclusion before channel-only Shenzhen retention',()=>{
 const row=(channel,extra={})=>({companyId:'c',company:'深圳物流',country:'美国',warehouse:'ONT8',channel,price:1000,currency:'CNY',unit:'kg',min:1,max:2,date:'2026-10-30',terms:'普货',...extra});
 const keep=row('深圳海运',{sourceNotes:'上海报价'}),volume=row('深圳海运',{unit:'cbm'}),nonChannel=row('上海海运',{source:'深圳报价.xlsx'}),notes=row('海运',{originCity:'宁波',sourceNotes:'深圳交仓'}),source={space:'real',storage:{'logistics-company-directory-v1':[{id:'c',name:'深圳物流',aliases:[]}],'logistics-quotes-v1':{quotes:[keep,volume,nonChannel,notes],regionalQuotes:[{...volume,regionRaw:'美西'},{...keep,regionRaw:'美西'}],templates:[{country:'美国',warehouse:'ONT8'}]},'logistics-monthly-bills-v1':{rows:[],aliases:{}},'logistics-completed-ratings-v1':[]}},before=JSON.stringify(source),project=displayData(source);
 assert.deepEqual(project.storage['logistics-quotes-v1'].quotes,[keep]);assert.equal(project.storage['logistics-quotes-v1'].regionalQuotes.length,1);assert.equal(project.storage['logistics-quotes-v1'].regionalQuotes[0].unit,'kg');assert.equal(project.storage['logistics-quotes-v1'].templates.length,1);assert.equal(JSON.stringify(source),before);
});

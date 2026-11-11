import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {projectQuerySnapshot} from './query-projection.mjs';
const require=createRequire(import.meta.url);
const {openRuntime}=require('../tools/logistics-workspace/runtime-test-helper.cjs');

test('server projection matches normal full-page price grades and channel scores',async()=>{
 const e=await openRuntime('compare','view',false,{instant:'2026-11-11T04:00:00Z',audience:'display'}),{w,doc}=e;
 try{
  const companies=['甲物流','乙物流'].map(name=>w.Companies.ensure(name)),quotes=[];
  for(const company of companies)for(const channel of ['空运','海运'])quotes.push({...w.QuoteCore.normalize([company.name,'英国',channel,'BHX1',company===companies[0]?'10':'12','CNY','kg',10,20,'2026-11-11','普货']),companyId:company.id});
  let db=w.QuoteCore.merge({quotes:[],templates:[]},quotes,'2026-11-11').db;
  db.regionalQuotes=quotes.slice(0,2).map(row=>({...row,regionRaw:'BHX1'}));
  db=w.ChannelScore.add(db,quotes[0],0.5,'合成运营事件');
  w.ComparisonStore.commit(db);await w.LocalQuoteStore.flush();await e.wait(()=>doc.querySelectorAll('#comparison tbody tr').length===4);
  const snapshot={space:'real',storage:{'logistics-quotes-v1':JSON.parse(JSON.stringify(w.ComparisonStore.read())),'logistics-company-directory-v1':JSON.parse(JSON.stringify(w.Companies.list())),'logistics-monthly-bills-v1':{rows:[],aliases:{}},'logistics-completed-ratings-v1':[]}};
  const before=JSON.stringify(snapshot),projection=projectQuerySnapshot(snapshot,'2026-11-11');
  const rows=projection.kinds['quotes-price'].pages.flat();assert.equal(rows.length,4);
  const visible=()=>[...doc.querySelectorAll('#comparison tbody tr')].map(tr=>({company:tr.cells[0].textContent,channel:tr.cells[1].firstChild.textContent,price:Number(tr.cells[3].querySelector('b').textContent)*100,grade:tr.cells[5].querySelector('.grade')?.textContent||null,score:Number(tr.cells[8].querySelector('b').textContent.replace('分',''))}));
  for(const actual of visible()){const row=rows.find(r=>r.company===actual.company&&r.price===actual.price&&r.channelDisplay===actual.channel);assert.equal(row.base.channelScore,actual.score);assert.equal(row.base.priceGrade,actual.grade);}
  const warehouse=doc.getElementById('warehouse');warehouse.value='BHX1';warehouse.dispatchEvent(new w.Event('change',{bubbles:true}));
  doc.getElementById('n001Compare').click();await e.wait(()=>w.N001UI.confirmed);
  for(const actual of visible()){const row=rows.find(r=>r.company===actual.company&&r.price===actual.price&&r.channelDisplay===actual.channel);assert.equal(row.ranked.channelScore,actual.score);assert.equal(row.ranked.priceGrade,actual.grade);}
  assert.equal(JSON.stringify(snapshot),before);
  assert(rows.some(r=>r.transport==='空运'));assert(rows.some(r=>r.transport==='海运'));
 }finally{e.close()}
});

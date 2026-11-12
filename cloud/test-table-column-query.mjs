import {test} from 'node:test';
import assert from 'node:assert/strict';
import Columns from '../tools/logistics-workspace/table-columns.js';
import {buildTableColumns} from '../deploy/table-column-projection.mjs';
import {buildQueryIndex} from './query-index.mjs';
import {tableColumnQuery} from './table-column-query.mjs';

function fixture(count=630){
 const rows=Array.from({length:count},(_,i)=>({provider:i%3?'a':'b',company:i%3?'甲物流':'乙物流',country:i%2?'美国':'英国',warehouse:'AMZ'+i%7,channel:'渠道'+i%4,terms:'条件'+i+' · '+('证据'.repeat(70)),price:(i%19+1)*100,currency:'CNY',unit:'kg',min:i%5?i%12:null,max:i%5?i%12+8:null,date:'2026-11-'+String(i%10+1).padStart(2,'0'),base:{priceGrade:['A','B','C'][i%3],timeGrade:['B','C','D'][i%3],quoteGrade:['A','C','D'][i%3],channelScore:i%5?i%100/10:null},ranked:{priceGrade:'S',timeGrade:'A',quoteGrade:'B',channelScore:9},score:i%5?i%100/10:null,rankedScore:9}));
 const index=buildQueryIndex(rows).index,projection=buildTableColumns(rows);index.tableColumns={schema:1,fields:projection.fields};const parts=new Map(projection.parts.map(item=>[item.part,item.value]));let reads=[];
 return {rows,index,projection,reads,query:async(criteria={},filters={})=>tableColumnQuery(index,filters,new URLSearchParams({version:'fixture-version',...criteria}),async part=>{reads.push(part);return parts.get(part)},criteria.confirmed==='1')};
}
test('all twelve columns enumerate the complete subset, combine filters, exclude their own filter and sort by type',async()=>{
 const f=fixture();
 for(const definition of Columns.definitions){
  const facet=(await f.query({column:definition.id})).facet;
  assert.equal(facet.total,new Set(f.rows.map(row=>JSON.stringify(Columns.cell(row,definition.id).value))).size);
  assert(!Object.hasOwn(facet,'rows'));
  const first=facet.choices[0];
  const rules={[definition.id]:{mode:'include',values:[first.value]}};
  const selected=await f.query({columns:JSON.stringify(rules),columnMode:'base'});
  assert.equal(selected.ids.length,first.count);
  const excluded=await f.query({columns:JSON.stringify({[definition.id]:{mode:'exclude',values:[first.value]}}),columnMode:'base'});
  assert.equal(excluded.ids.length+selected.ids.length,f.rows.length);
  const own=(await f.query({column:definition.id,columns:JSON.stringify(rules),columnMode:'base'})).facet;
  assert.equal(own.total,facet.total);
  for(const direction of ['asc','desc']){
   const sorted=await f.query({columnSort:definition.id+':'+direction,size:'100'});
   assert.equal(sorted.ids.length,f.rows.length);
   for(let i=1;i<sorted.ids.length;i++)assert(Columns.compare(Columns.cell(f.rows[sorted.ids[i-1]],definition.id),Columns.cell(f.rows[sorted.ids[i]],definition.id),definition.type,direction==='asc'?1:-1)<=0,definition.id+' '+direction);
  }
 }
 const country=(await f.query({column:'country'})).facet.choices[0],warehouse=(await f.query({column:'warehouse',columns:JSON.stringify({country:{mode:'include',values:[country.value]}})})).facet.choices[0];
 const result=await f.query({columns:JSON.stringify({country:{mode:'include',values:[country.value]},warehouse:{mode:'include',values:[warehouse.value]}})});
 assert.equal(result.ids.length,warehouse.count);
 assert(result.ids.every(id=>f.rows[id].country===country.label&&f.rows[id].warehouse===warehouse.label));
 const globallyScoped=(await f.query({column:'country'},{provider:'b'})).facet;
 assert.equal(globallyScoped.choices.reduce((sum,item)=>sum+item.count,0),210);
});
test('long option dictionaries use bounded metadata pages and search reaches options beyond the first page',async()=>{
 const f=fixture(2100);let cursor=0,labels=[],calls=0;
 do{const before=f.reads.length,result=await f.query({column:'terms',cursor:String(cursor)});assert(f.reads.slice(before).filter(name=>name.includes('-values-')).length<=4);assert(result.facet.choices.length<=200);labels.push(...result.facet.choices.map(item=>item.label));cursor=result.facet.nextCursor;calls++;}while(cursor!==null);
 assert.equal(new Set(labels).size,2100);assert(calls>10);
 cursor=0;let found=[];do{const result=await f.query({column:'terms',columnSearch:'条件2099 ',cursor:String(cursor)});found.push(...result.facet.choices);cursor=result.facet.nextCursor;}while(cursor!==null);
 assert.equal(found.length,1);assert.match(found[0].label,/条件2099/);
 assert(f.projection.parts.filter(item=>item.part.includes('-values-')).every(item=>Buffer.byteLength(JSON.stringify(item.value))<=24000));
});
test('ordinal selections require a pinned version and matching scoring context; malformed rules are rejected',async()=>{
 const f=fixture(),rules=JSON.stringify({score:{mode:'include',values:[0]}});
 await assert.rejects(f.query({columns:rules,version:'',columnMode:'base'}),error=>error.status===409);
 await assert.rejects(f.query({columns:rules,columnMode:'base',confirmed:'1'}),error=>error.status===409);
 const ranked=await f.query({columns:rules,columnMode:'ranked',confirmed:'1'});assert.equal(ranked.ids.length,f.rows.length);
 for(const columns of ['[]','null','{"__proto__":{"mode":"include","values":[]}}','{"price":{"mode":"include","values":[-1]}}','{"price":{"mode":"include","values":[999999]}}'])await assert.rejects(f.query({columns}),error=>error.status===400);
 await assert.rejects(f.query({column:'unknown'}),error=>error.status===400);
 delete f.index.tableColumns;assert.equal((await f.query()).state.supported,false);await assert.rejects(f.query({column:'price'}),error=>error.status===503);
});

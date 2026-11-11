import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildQueryIndex,selectQueryIndex} from './query-index.mjs';
test('independent readers filter the same index and only request matching result pages',()=>{
 const rows=Array.from({length:20000},(_,i)=>({provider:i%2?'九方':'天盛',transport:i%3?'空运':'海运',country:'英国',warehouse:'BHX'+i%20,cargo:['普货','带电'],tax:['included'],price:i}));
 const before=JSON.stringify(rows),{index,pages}=buildQueryIndex(rows);
 for(const filters of [{transport:'空运'},{provider:'九方',transport:'空运',warehouse:'BHX1'},{cargo:['带电']},{provider:'不存在'}]){
  const result=selectQueryIndex(index,filters,0,50),oracle=rows.filter(r=>Object.entries(filters).every(([key,value])=>(Array.isArray(r[key])?r[key]:[r[key]]).some(x=>(Array.isArray(value)?value:[value]).includes(x))));
  assert.equal(result.total,oracle.length);assert.deepEqual(result.locations.map(([p,i])=>pages[p][i]),oracle.slice(0,50));
 }
 assert.equal(JSON.stringify(rows),before);
 const a=selectQueryIndex(index,{provider:'天盛'},1,50),b=selectQueryIndex(index,{provider:'九方'},0,50);
 assert.equal(a.page,1);assert.equal(b.page,0);assert.equal(selectQueryIndex(index,{provider:'天盛'},1,50).total,a.total);
 assert(new Set(a.locations.map(x=>x[0])).size<pages.length/10);
 assert.throws(()=>selectQueryIndex(index,{},0,100000));
});

test('score view handles an empty dataset and rows without a confirmed numeric score',()=>{
 for(const rows of [[],[{provider:'待确认',score:null,rankedScore:null}]]){
  const {index}=buildQueryIndex(rows);
  for(const order of ['scoreAsc','scoreDesc','rankedScoreAsc','rankedScoreDesc'])assert.equal(selectQueryIndex(index,{},0,50,order).total,rows.length);
 }
});

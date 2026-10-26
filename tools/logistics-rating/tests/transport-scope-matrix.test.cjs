const {test}=require('node:test'),assert=require('node:assert/strict'),N=require('../n001.js'),T=require('../extensions/transport-exclusion.js');
const modes=['海运','空运','卡航','铁路'];
const rows=modes.map((channel,id)=>({id,channel})).concat({id:4,channel:'渠道代码'});
test('16 exclusion combinations × four scopes preserve exact membership, partition and source data',()=>{
 const before=JSON.stringify(rows);
 for(let mask=0;mask<16;mask++){
  const states=Object.fromEntries(modes.map((m,i)=>[m,mask&(1<<i)?'exclude':'neutral']));
  const outside=rows.filter((r,i)=>i<4&&(mask&(1<<i))).map(r=>r.id);
  for(const scope of ['inside','unknown','outside','all']){
   const expected=scope==='all'?[0,1,2,3,4]:scope==='unknown'?[4]:scope==='outside'?outside:[0,1,2,3,4].filter(i=>!outside.includes(i));
   assert.deepEqual(rows.filter(r=>N.matches(r,states,scope)).map(r=>r.id),expected,`${mask}/${scope}`);
  }
  assert.equal(rows.filter(r=>N.matches(r,states,'inside')).length+outside.length,5);
 }
 assert.equal(JSON.stringify(rows),before);
});
test('classification boundaries: last-mile labels, contradictory evidence, blank and malicious names',()=>{
 for(const channel of ['',null,undefined,'卡派','快递派','<img src=x onerror=alert(1)>','未知\u0000渠道','海'.repeat(5000)])assert.equal(N.transport({channel}),'待确认');
 for(const [channel,mode] of [['海铁联运','海运'],['空派','空运'],['中欧班列','铁路'],['卡航专线','卡航'],['美森海卡','海运']])assert.equal(N.transport({channel}),mode);
 assert.equal(N.transport({channel:'未知',leadRaw:'开船后30天，起飞后8天'}),'待确认');
 assert.equal(N.transport({channel:'空运',sourceSheet:'海运',leadRaw:'开船后30天'}),'空运');
});
test('stale and hostile toggle values recover to two states during 10000 rapid toggles',()=>{
 for(const initial of ['include','bad','__proto__',null,{},'<script>']){
  let state=initial;for(let i=0;i<10000;i++){state=T.nextTransportExclusion(state);assert.ok(state==='neutral'||state==='exclude');}
 }
});
test('100k quotes: all excluded leaves unknown rows visible; no duplicates or mutations',()=>{
 const large=Array.from({length:100000},(_,i)=>({id:i,channel:rows[i%5].channel})),states=Object.fromEntries(modes.map(m=>[m,'exclude']));
 const inside=large.filter(r=>N.matches(r,states,'inside')),outside=large.filter(r=>N.matches(r,states,'outside'));
 assert.equal(inside.length,20000);assert.equal(outside.length,80000);assert.equal(new Set(inside.concat(outside).map(r=>r.id)).size,100000);
 assert.ok(inside.every(r=>r.channel==='渠道代码'));assert.equal(large[0].channel,'海运');
 assert.equal([].filter(r=>N.matches(r,states,'all')).length,0);
});

const {test}=require('node:test'),assert=require('node:assert/strict'),N=require('../n001.js'),L=require('../extensions/transport-linehaul.js');
test('last-mile card and express delivery follow explicit original trunk transport without mutating rows',()=>{
 for(const tail of ['卡派','快递派','卡车派送','快递派送'])for(const [head,mode]of [['海运','海运'],['空运','空运'],['空派','空运'],['铁路','铁路'],['欧洲卡航','卡航']]){
 const row={channel:tail,sourceSheet:'美国'+head,price:1000},before=JSON.stringify(row);assert.equal(N.transport(row),mode,head+tail);assert.equal(N.transport({...row,channel:head+'-'+tail}),mode);assert.equal(JSON.stringify(row),before)
 }
});
test('original air/sea source overrides misleading mapped last-mile service; bare last mile stays Other',()=>{
 assert.equal(N.transport({channel:'海派',comparisonProfile:{service:'快递派'}}),'海运');assert.equal(N.transport({channel:'空派-快递派',comparisonProfile:{service:'海运'}}),'空运');assert.equal(N.transport({channel:'快递派',sourceSheet:'美国空运',comparisonProfile:{service:'卡航'}}),'空运');
 for(const channel of ['卡派','快递派','卡车派送']){assert.equal(N.transport({channel}),'待确认');assert.equal(N.transport({channel,leadRaw:'起飞后5-8天'}),'空运');assert.equal(N.transport({channel,leadRaw:'开船后20天'}),'海运');assert.equal(N.transport({channel,leadRaw:'开船后20天；起飞后5天'}),'待确认')}
});
test('European truck trunk is card-air category but local card delivery does not establish truck linehaul',()=>{
 for(const row of [{channel:'欧洲卡车运输'},{channel:'公路运输专线',country:'德国'},{channel:'德国卡车运输-普货'}])assert.equal(N.transport(row),'卡航');for(const row of [{channel:'卡派',country:'德国'},{channel:'卡车派送',sourceSheet:'欧洲配送'},{channel:'美国卡车运输'}])assert.equal(N.transport(row),'待确认');assert.equal(L.resolve({channel:'海运'}),null)
});
test('air/sea exclusions never mix explicit last-mile quotations; Other hides only unresolved last mile',()=>{
 const rows=[{id:1,channel:'快递派',sourceSheet:'美国空运'},{id:2,channel:'卡派',sourceSheet:'美国海运'},{id:3,channel:'欧洲卡车运输'},{id:4,channel:'快递派'}];assert.deepEqual(rows.filter(r=>N.matches(r,{'空运':'exclude'},'inside')).map(r=>r.id),[2,3,4]);assert.deepEqual(rows.filter(r=>N.matches(r,{'海运':'exclude','卡航':'exclude','其它':'exclude'},'inside')).map(r=>r.id),[1]);
});

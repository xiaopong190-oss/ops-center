const {test}=require('node:test'),assert=require('node:assert/strict'),{IDBFactory}=require('../../modules/new-product-followup/work/qa/node_modules/fake-indexeddb'),{create}=require('./display-cache.js');
test('immutable source persists across page instances, isolates sessions and returns detached values',async()=>{
 const db=new IDBFactory(),a=create(db),data={sha:'first',data:{records:[{id:1}]}};await a.save('session-one',data);data.data.records[0].id=9;
 const b=create(db),read=await b.load('session-one');assert.equal(read.data.records[0].id,1);read.data.records[0].id=7;assert.equal((await a.load('session-one')).data.records[0].id,1);assert.equal(await b.load('session-two'),null);
 await b.save('session-one',{sha:'second'});assert.equal((await a.load('session-one')).sha,'second');
});
test('unsupported storage cannot pretend a downloaded source was saved',async()=>{await assert.rejects(create(null).save('session',{}),/不支持/)});

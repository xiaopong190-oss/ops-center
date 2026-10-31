const {test}=require('node:test'),assert=require('node:assert/strict'),{IDBFactory}=require('../../modules/new-product-followup/work/qa/node_modules/fake-indexeddb'),{create}=require('./display-cache.js');
test('immutable source persists across page instances, isolates sessions and returns detached values',async()=>{
 const db=new IDBFactory(),a=create(db),data={sha:'first',data:{records:[{id:1}]}};await a.save('session-one',data);data.data.records[0].id=9;
 const b=create(db),read=await b.load('session-one');assert.equal(read.data.records[0].id,1);read.data.records[0].id=7;assert.equal((await a.load('session-one')).data.records[0].id,1);assert.equal(await b.load('session-two'),null);
 await b.save('session-one',{sha:'second'});assert.equal((await a.load('session-one')).sha,'second');
});
test('unsupported storage cannot pretend a downloaded source was saved',async()=>{await assert.rejects(create(null).save('session',{}),/不支持/)});

test('saved batches persist across reopen, isolate accounts, cap disk usage and release only committed source batches',async()=>{
 const db=new IDBFactory(),a=create(db);await a.savePart('one','hash',new Uint8Array([1,2,3]));const b=create(db);assert.deepEqual([...await b.loadPart('one','hash')],[1,2,3]);assert.equal(await b.loadPart('two','hash'),null);
 await b.savePart('one','other',new Uint8Array([4]));await b.save('one',{sha:'complete'},['hash']);assert.equal(await a.loadPart('one','hash'),null);assert.deepEqual([...await a.loadPart('one','other')],[4]);
 for(let i=0;i<140;i++)await b.savePart('one','part-'+i,new Uint8Array([i]));
 const raw=await new Promise((resolve,reject)=>{const r=db.open('workspace-display-parts-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=reject});try{const count=await new Promise(resolve=>{const r=raw.transaction('parts').objectStore('parts').count();r.onsuccess=()=>resolve(r.result)});assert.equal(count,128)}finally{raw.close()}
});

const {test}=require('node:test'),assert=require('node:assert/strict'),B=require('../extensions/supplier-quote-batch.js');
const today='2026-11-10',key='logistics-quotes-v1',dir='logistics-company-directory-v1';
const company=(id,name=id)=>({id,name,aliases:[]});
const warehouse=(id,i)=>({companyId:id,company:id,country:'美国',warehouse:'ONT8',channel:'海运',date:today,price:1000,currency:'CNY',unit:'kg',min:10,max:20,terms:'档'+i});
const regional=(id,i)=>({companyId:id,company:id,country:'美国',regionRaw:'范围'+i,channel:'空运',date:today,price:2000,currency:'CNY',unit:'kg',terms:'档'+i});
const base=()=>({space:'real',storage:{[dir]:[company('a'),company('b')],[key]:{quotes:Array.from({length:2493},(_,i)=>warehouse(i%2?'a':'b',i)),templates:[{country:'美国',warehouse:'ONT8'}],regionalQuotes:[regional('a',0),regional('b',0)]},'logistics-monthly-bills-v1':{rows:[],aliases:{}},'logistics-completed-ratings-v1':[]}});
const batch=(id,count,price)=>B.capture({},[],Array.from({length:count},(_,i)=>({...regional(id,i),price})),[company(id)],crypto.randomUUID()).pendingQuoteBatches[0];
test('519 regional quotes from a partial machine preserve all 2493 shared warehouse quotes',async()=>{
 const shared=base(),change=batch('a',519,2200),result=B.apply(shared,change,today);
 assert.deepEqual(result.storage[key].quotes,shared.storage[key].quotes);
 assert.equal(result.storage[key].regionalQuotes.length,520);
 assert.deepEqual(result.storage[key].regionalQuotes.find(r=>r.companyId==='b'),regional('b',0));
 assert.deepEqual(result.storage[key].templates.map(x=>x.warehouse),['ONT8']);
 assert.equal(shared.storage[key].regionalQuotes.length,2);
});
test('a disjoint supplier can be rebased while a same-scope update changes the fingerprint',async()=>{
 const shared=base(),a=batch('a',2,2200),b=batch('b',2,2300),first=B.apply(shared,a,today);
 assert.equal(await B.scopeHash(first,b,today),await B.scopeHash(shared,b,today));
 assert.notEqual(await B.scopeHash(first,a,today),await B.scopeHash(shared,a,today));
 assert.equal(B.apply(first,b,today).storage[key].regionalQuotes.length,4);
});

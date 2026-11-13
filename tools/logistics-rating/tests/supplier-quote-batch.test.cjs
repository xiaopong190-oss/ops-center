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

test('last confirmed warehouse batch replaces newer-dated rows only in its supplier and type',async()=>{
 const shared=base(),before=structuredClone(shared),older='2026-11-09';
 const input=B.capture({},[{...warehouse('a',9999),date:older,price:1234}],[],[company('a')],crypto.randomUUID()).pendingQuoteBatches[0];
 const result=B.apply(shared,input,today),db=result.storage[key];
 assert.equal(B.replacementPolicy,'last-confirmed-batch-v1');assert.equal(db.quotes.filter(r=>r.companyId==='a').length,1);
 assert.equal(db.quotes.find(r=>r.companyId==='a').date,older);assert.equal(db.quotes.find(r=>r.companyId==='a').price,1234);
 assert.deepEqual(db.quotes.filter(r=>r.companyId==='b'),shared.storage[key].quotes.filter(r=>r.companyId==='b'));
 assert.deepEqual(db.regionalQuotes,shared.storage[key].regionalQuotes);assert.deepEqual(db.templates.map(r=>[r.country,r.warehouse]),shared.storage[key].templates.map(r=>[r.country,r.warehouse]));
 assert.deepEqual(shared,before);assert.equal((await B.scopeHash(shared,input,today)).length,64);
});

test('successive confirmations win by publication order while retaining source dates and resolving supplier aliases',async()=>{
 const shared=base(),first=batch('a',2,2300);first.regionalQuotes=first.regionalQuotes.map(r=>({...r,date:'2026-11-09'}));
 const afterFirst=B.apply(shared,first,today),last=batch('a',1,2400);
 last.companies=[company('local-a','a')];last.regionalQuotes=last.regionalQuotes.map(r=>({...r,companyId:'local-a',date:'2026-11-08'}));
 const afterLast=B.apply(afterFirst,last,today),a=afterLast.storage[key].regionalQuotes.filter(r=>r.companyId==='a');
 assert.equal(a.length,1);assert.equal(a[0].price,2400);assert.equal(a[0].date,'2026-11-08');
 assert.deepEqual(afterLast.storage[key].quotes,shared.storage[key].quotes);
 assert.deepEqual(afterLast.storage[key].regionalQuotes.filter(r=>r.companyId==='b'),shared.storage[key].regionalQuotes.filter(r=>r.companyId==='b'));
 assert.notEqual(await B.scopeHash(afterFirst,last,today),await B.scopeHash(afterLast,last,today));
});

test('confirmation order never permits out-of-range or future source dates or changes the original shared data',async()=>{
 for(const date of ['2026-10-20','2026-11-11']){
  const shared=base(),before=structuredClone(shared),change=batch('a',1,2500);change.regionalQuotes[0].date=date;
  assert.throws(()=>B.apply(shared,change,today),/日期已超出入库范围/);
  await assert.rejects(B.scopeHash(shared,change,today),/日期已超出入库范围/);assert.deepEqual(shared,before);
 }
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const P=require('../extensions/monthly-cooperation.js'),D=require('../domain.js');
const bill=(extra={})=>({company:'甲',date:'2026-10-01',bill:'B1',waybill:'W1',channel:'海运',warehouse:'仓1',currency:'USD',amount:10000,paid:4000,note:'',...extra});
const rating=(extra={})=>({id:'r1',companyId:'a',company:'甲',operator:'张',shipment:'W1',channel:'美国 · 海运',shipped:'2026-09-01',finished:'2026-10-01',mode:'rated',price:8,time:7,coop:9,note:'已核实履约',...extra});
test('currency isolation, offset visibility, source preservation and unchanged input',()=>{
 const rows=[bill(),bill({amount:2000,paid:3000,source:'原.csv',sourceRow:3}),bill({currency:'CNY',amount:900,paid:900}),bill({date:'2026-09-01'})],before=JSON.stringify(rows);
 D.bills({rows,aliases:{}});const out=P.projectBills(rows,{month:'2026-10'}),usd=out.groups.find(g=>g.currency==='USD');
 assert.deepEqual([usd.amount,usd.paid,usd.balance,usd.outstanding,usd.overpaid],[12000,7000,5000,6000,1000]);assert.equal(out.groups.length,2);assert.equal(out.reviewCount,2);assert.equal(out.details[1].sourceRow,3);assert.equal(out.details[1].status,'超付');assert.equal(out.details[2].status,'账面差额为零');assert.equal(JSON.stringify(rows),before);
});
test('shared bill or waybill flags split charges without dropping or combining rows',()=>{
 const out=P.projectBills([bill(),bill({bill:'B2'}),bill({bill:'B2',waybill:'W2'}),bill({company:'乙'})],{month:'2026-10'});
 assert.equal(out.details.length,4);assert.equal(out.reviewCount,3);assert.equal(out.groups[0].amount,30000);
});
test('maximum validated amounts remain exact at 10000 records, negatives remain visible',()=>{
 const rows=Array.from({length:10000},(_,i)=>bill({bill:String(i),waybill:'',amount:D.LIMITS.amountCents,paid:-D.LIMITS.amountCents}));D.bills({rows,aliases:{}});
 const out=P.projectBills(rows,{month:'2026-10'});assert.equal(out.groups[0].balance,2000000000000000);assert(Number.isSafeInteger(out.groups[0].balance));assert.equal(out.reviewCount,0);
 assert.equal(P.projectBills([bill({amount:-200,paid:0})],{month:'2026-10'}).details[0].balance,-200);
});
test('rating formula matches baseline, pending excluded, completion month used, input unchanged',()=>{
 const rows=[rating(),rating({id:'r2',shipment:'W2',mode:'pending',price:undefined,time:undefined,coop:undefined,note:''}),rating({id:'r3',shipment:'W3',finished:'2026-09-30'})],before=JSON.stringify(rows);D.ratings(rows,'2026-10-24');
 const out=P.projectRatings(rows,{month:'2026-10'});assert.equal(out.completed,2);assert.equal(out.rated,1);assert.equal(out.groups[0].score,79);assert.equal(out.groups[0].grade,'B');assert.equal(out.groups[0].pending,1);assert.deepEqual(out.details[0].contributions,{price:24,time:28,coop:27});assert.equal(out.details[1].score,null);assert.equal(JSON.stringify(rows),before);
});
test('0 and 100 boundaries, no evidence means no grade, average rounded before grading',()=>{
 assert.equal(P.ratingEvidence(rating({price:0,time:0,coop:0})).score,0);assert.equal(P.ratingEvidence(rating({price:10,time:10,coop:10})).grade,'S');
 const pending=P.projectRatings([rating({mode:'pending'})],{month:'2026-10'});assert.equal(pending.groups[0].score,null);assert.equal(pending.groups[0].grade,'待评价');
 const rows=Array.from({length:11},(_,i)=>rating({id:String(i),shipment:String(i),price:8,time:8,coop:i?8:7.5}));const out=P.projectRatings(rows,{month:'2026-10'});assert.equal(out.groups[0].score,79.9);assert.equal(out.groups[0].grade,'B');
 assert.equal(P.projectRatings([],{month:'2026-10'}).groups.length,0);
});
test('names and filters are explicit; paging covers all 10000 rows without loss',()=>{
 const rows=Array.from({length:10000},(_,i)=>({id:i})),seen=[];for(let page=1;page<=200;page++)seen.push(...P.pageRows(rows,page).rows);assert.deepEqual(seen,rows);assert.equal(P.pageRows(rows,1000).page,200);assert.equal(P.pageRows([],0).pages,1);assert.throws(()=>P.pageRows(rows,1,201));
 assert.equal(P.projectBills([bill()],{month:'2026-10',company:'新名',name:()=> '新名'}).details.length,1);assert.throws(()=>P.projectBills([],{month:'2026-13'}));
});
test('standalone preview never reads or writes storage, escapes evidence, failed loads retain view',async()=>{
 const els={},el=id=>els[id]??={value:'',innerHTML:'',textContent:'',disabled:false};el('company').value='';el('mode').value='all';
 const context={MonthlyCooperationReview:P,Domain:D,Date,Set,console,document:{getElementById:el},localStorage:new Proxy({},{get(){throw Error('Storage must not be accessed');}})};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../extensions/monthly-cooperation-ui.js'),'utf8'),context);
 const payload={space:'real',storage:{'logistics-monthly-bills-v1':{rows:[bill({note:'<img onerror=evil()>',date:el('month').value+'-01'})],aliases:{}}}};
 await el('backup').onchange({target:{files:[{name:'backup.json',size:100,text:async()=>JSON.stringify(payload)}]}});assert(el('billsDetail').innerHTML.includes('&lt;img'));const before=el('billsDetail').innerHTML;
 await el('backup').onchange({target:{files:[{name:'bad.json',size:100,text:async()=>'{bad'}]}});assert.equal(el('billsDetail').innerHTML,before);assert(el('message').textContent.includes('载入失败'));
 await el('backup').onchange({target:{files:[{name:'bad.json',size:100,text:async()=>JSON.stringify({storage:{'logistics-monthly-bills-v1':{rows:[bill({amount:NaN})],aliases:{}}}})}]}});assert.equal(el('billsDetail').innerHTML,before);
});
test('latest selected backup wins when earlier asynchronous load finishes late',async()=>{
 const els={},el=id=>els[id]??={value:'',innerHTML:'',textContent:'',disabled:false};el('mode').value='all';let finish;
 const context={MonthlyCooperationReview:P,Domain:D,Date,Set,document:{getElementById:el}};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../extensions/monthly-cooperation-ui.js'),'utf8'),context);
 const load=(name,text)=>el('backup').onchange({target:{files:[{name,size:100,text}]}});
 const old=load('old.json',()=>new Promise(resolve=>finish=resolve));await load('new.json',async()=>JSON.stringify({storage:{}}));finish(JSON.stringify({storage:{}}));await old;assert(el('source').textContent.includes('new.json'));
});

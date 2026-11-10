const {test}=require('node:test'),assert=require('node:assert/strict'),B=require('../extensions/display-business-date.js'),Q=require('../quote-core.js'),W=require('../extensions/weekly-carryover.js');
test('display uses publisher Shanghai date, independent of the reader offset',()=>{
 for(const instant of ['2026-11-10T07:30:00Z','2026-11-09T23:30:00-08:00','2026-11-10T15:30:00+08:00'])assert.equal(B.day(new Date(instant),'display'),'2026-11-10');
 assert.equal(B.day(new Date('2026-11-08T15:59:59Z'),'display'),'2026-11-08');
 assert.equal(B.day(new Date('2026-11-08T16:00:00Z'),'display'),'2026-11-09');
 assert.equal(B.day(new Date('2026-03-08T10:00:00Z'),'display'),'2026-03-08');
 assert.equal(B.day(new Date('2026-12-31T16:00:00Z'),'display'),'2027-01-01');
 assert.equal(B.day(new Date('2026-11-10T07:30:00Z'),'input'),null);
 assert.equal(B.day(new Date('2026-11-10T07:30:00Z'),undefined),null);
});
test('actual audited provider dates produce six providers while tomorrow stays excluded',()=>{
 const counts=[['11.9聚美',648],['2026 聚美',1961],['T2US',1030],['V永达',2768],['恒祥',186],['天盛',410]];
 const quotes=counts.flatMap(([company,count])=>Array.from({length:count},(_,i)=>({company,companyId:company,country:'英国',warehouse:'BHX1',channel:'海运',terms:'档'+i,price:1000,currency:'CNY',unit:'kg',date:company==='天盛'?'2026-11-09':'2026-11-10'})));
 quotes.push({...quotes[0],company:'明日报价',companyId:'tomorrow',date:'2026-11-11'});
 const db={quotes,templates:[],regionalQuotes:[]},before=JSON.stringify(db),today=B.day(new Date('2026-11-10T07:30:00Z'),'display');
 assert.equal(Q.filterCascade(W.effective(db,'2026-11-09').quotes).options.provider.length,1);
 const effective=W.effective(db,today);assert.equal(effective.quotes.length,7003);assert.equal(Q.filterCascade(effective.quotes).options.provider.length,6);assert.equal(JSON.stringify(db),before);
});

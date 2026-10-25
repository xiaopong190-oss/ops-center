const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('../extensions/rating-provider-names.js');
test('fixed initial grace expires without refresh renewal',()=>{
 const c={id:'5ef8c9d1-c14f-41e4-a9a4-f32c5c842737',name:'初始名称',imported:true};assert.equal(P.eligibleRatingNames([c],'2027-01-25').eligible.length,1);assert.equal(P.eligibleRatingNames([c],'2027-01-26').expired.length,1);
});
test('pending import is not eligibility; receipt confirms, concurrent pending event survives',()=>{
 const original=[{id:'a',name:'甲',imported:true,ratingNameLastSeenOn:'2026-06-01'}],pending=P.stageNameImports(original,['a'],'2026-10-25','event-1');assert.equal(P.eligibleRatingNames(pending,'2026-10-25').eligible.length,0);
 const confirmed=P.prepareConfirmedNames(pending,'2026-10-25');assert.equal(confirmed[0].ratingNameLastSeenOn,'2026-10-25');assert(pending[0].ratingNamePendingImport);assert(!confirmed[0].ratingNamePendingImport);
 assert(!P.acknowledgeNames(pending,pending,confirmed)[0].ratingNamePendingImport);
 const newer=P.stageNameImports(pending,['a'],'2026-10-25','event-2');assert.equal(P.acknowledgeNames(newer,pending,confirmed)[0].ratingNamePendingImport.eventId,'event-2');assert.deepEqual(original,[{id:'a',name:'甲',imported:true,ratingNameLastSeenOn:'2026-06-01'}]);
});
test('three calendar months and rolling months are explicit, month ends and leap day clamp',()=>{
 assert.equal(P.cutoffDay('2026-10-25','rolling-months'),'2026-07-25');assert.equal(P.cutoffDay('2026-10-25','calendar-months'),'2026-08-01');assert.equal(P.cutoffDay('2026-05-31','rolling-months'),'2026-02-28');assert.equal(P.cutoffDay('2024-05-31','rolling-months'),'2024-02-29');assert.throws(()=>P.cutoffDay('2026-10-25'));
});
test('name-only output, exact boundary, unknown dates not fabricated, no input changes',()=>{
 const rows=[{id:'a',name:'甲',imported:true,ratingNameLastSeenOn:'2026-07-25',price:100,channel:'海运'},{id:'b',name:'乙',imported:true,ratingNameLastSeenOn:'2026-07-24'},{id:'c',name:'丙',imported:true},{id:'d',name:'丁'}],before=JSON.stringify(rows),out=P.projectRatingProviderNames(rows,{asOf:'2026-10-25',mode:'rolling-months'});
 assert.deepEqual(out.eligible,[{id:'a',name:'甲'}]);assert.deepEqual(out.expired,[{id:'b',name:'乙'}]);assert.deepEqual(out.unknown,[{id:'c',name:'丙'}]);assert.equal(JSON.stringify(rows),before);assert.throws(()=>P.projectRatingProviderNames([{id:'a',name:'甲',imported:true,ratingNameLastSeenOn:'2026-10-26'}],{asOf:'2026-10-25',mode:'rolling-months'}));
});

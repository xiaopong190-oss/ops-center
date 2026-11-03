import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {followupHistoryCleanupSql} from '../cloud/followup-history-cleanup-sql.mjs';
import {followup} from '../cloud/followup.mjs';
import {readFollowup,FOLLOWUP_KEY} from '../cloud/followup-storage.mjs';
import {createTrackerCloudDb} from '../src/tracker-cloud-adapter.js';
import {createTrackerDraftDb} from '../src/tracker-drafts.js';
const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE records(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
const env={DB:{prepare(text){let args=[];return {bind(...a){args=a;return this;},async first(){return sql.prepare(text).get(...args)||null;},async all(){return {results:sql.prepare(text).all(...args)};},async run(){return sql.prepare(text).run(...args);}};}}};
const original={sku:'TEST',owner:'A',promo:{budget:10,phases:[{status:'doing',range:'11.3-11.14'}],actions:[{text:'original',status:'wait'}]}};
sql.prepare('INSERT INTO records VALUES(?,?)').run(FOLLOWUP_KEY,JSON.stringify({revision:1,data:{products:[],records:[],events:[],trackerV1:{schema:1,docs:{'links/test':original}}}}));
const drafts=new Map();let failRead=false,failWrite=false,failLocal=false;
const store={async load(id){return structuredClone(drafts.get(id)||[]);},async save(id,ops){if(failLocal)throw Error('disk full');drafts.set(id,structuredClone(ops));}};
function client(id){
  const user={id,name:id,canEdit:true};
  const context={user,canEdit:true,autoShare:false,async cloudRequest(path,payload){
    if(!payload&&failRead)throw Error('offline');if(payload&&failWrite)throw Error('quota full');
    const response=await followup(new Request('https://test.invalid'+path,payload?{method:'POST',body:JSON.stringify(payload)}:{}),env,user);return response.json();
  }};
  const cloud=createTrackerCloudDb({context:()=>context,backup:async()=>{},notify:()=>{}});
  return createTrackerDraftDb({context:()=>context,cloud,store});
}
const a=client('A'),b=client('B');await a.refresh();await b.refresh();
// Real UI sends an entire top-level promo object for a single control edit.
const stalePromo=structuredClone(b._dump()['links/test'].promo);
await a.doc('links/test').update({promo:{...original.promo,actions:[...original.promo.actions,{text:'A new action',status:'wait'}]}});await a.save();
stalePromo.phases[0].range='11.4-11.20';
await b.doc('links/test').update({promo:stalePromo});await b.save();
const reload=client('admin');await reload.refresh();
assert.equal(reload._dump()['links/test'].promo.actions.length,2,'stale full-section save must preserve other operator actions');
assert.equal(reload._dump()['links/test'].promo.phases[0].range,'11.4-11.20');
await a.refresh();await b.refresh();
const list=structuredClone(a._dump()['links/test'].promo.actions);
await a.doc('links/test').update({promo:{actions:[...list,{text:'A concurrent'}]}});
await b.doc('links/test').update({promo:{actions:[...list,{text:'B concurrent'}]}});await a.save();
await assert.rejects(b.save(),/列表已被其它运营修改/);assert.equal(drafts.get('B').length,1);
assert.equal(b._dump()['links/test'].promo.actions.at(-1).text,'B concurrent','conflicting draft must remain visible');
assert.equal((await readFollowup(env)).snapshot.data.trackerV1.docs['links/test'].promo.actions.at(-1).text,'A concurrent');
// Failed cloud writes retain durable edits across a fresh client and retry.
await a.doc('links/test').update({owner:'A final'});failWrite=true;
await assert.rejects(a.save(),/quota full/);assert.ok(drafts.get('A').length);
failWrite=false;const restored=client('A');failRead=true;
await assert.rejects(restored.refresh(),/offline/);failRead=false;await restored.refresh();
assert.equal(restored._dump()['links/test'].owner,'A final','retry initialization must reload existing account drafts');
await restored.save();assert.equal(drafts.get('A').length,0);
// Local storage failure must not appear as successful durable editing.
failLocal=true;await assert.rejects(restored.doc('links/test').update({owner:'unsaved'}),/disk full/);failLocal=false;
assert.equal(restored._dump()['links/test'].owner,'A final');
// Execute the exact historical cleanup SQL used for the production purge.
const before=(await readFollowup(env)).snapshot,revision=before.revision;
const cleanup=followupHistoryCleanupSql(revision);
assert.ok(sql.prepare("SELECT count(*) AS n FROM records WHERE key GLOB '_new-product-followup:history:*'").get().n>0);
sql.prepare(cleanup).run();
assert.deepEqual((await readFollowup(env)).snapshot,before,'cleanup must preserve every field, event and current pointer');
assert.equal(sql.prepare("SELECT count(*) AS n FROM records WHERE key GLOB '_new-product-followup:history:*'").get().n,0);
assert.equal(sql.prepare(cleanup).run().changes,0);
// A subsequent user save still loads correctly, and a stale cleanup is a no-op.
await restored.doc('links/test').update({owner:'after cleanup'});await restored.save();
assert.equal(sql.prepare(cleanup).run().changes,0);
const final=client('observer');await final.refresh();assert.equal(final._dump()['links/test'].owner,'after cleanup');
assert.equal(final._dump()['links/test'].promo.actions.length,3);
sql.close();console.log('PASS save integrity: stale section preservation, list conflict draft retention, cloud/local failure, failed-load recovery, exact cleanup full-data equality, repeat cleanup, post-cleanup save and reload');

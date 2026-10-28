import {DatabaseSync} from 'node:sqlite';
import {Buffer} from 'node:buffer';
import assert from 'node:assert/strict';
import {followup} from '../cloud/followup.mjs';
import {readFollowup,PART_BYTES,FOLLOWUP_KEY} from '../cloud/followup-storage.mjs';
import {uploadFollowupPayload} from '../src/followup-upload.js';
import {createTrackerCloudDb} from '../src/tracker-cloud-adapter.js';
import {createTrackerDraftDb} from '../src/tracker-drafts.js';
function database(){
  const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE records(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  return {sql,env:{DB:{prepare(text){let args=[];return {bind(...a){args=a;return this;},async first(){return sql.prepare(text).get(...args)||null;},async all(){return {results:sql.prepare(text).all(...args)};},async run(){return sql.prepare(text).run(...args);}};}}}};
}
const initial={revision:7,data:{products:[{id:'p',version:1,body:{sku:'P',name:'Synthetic'}}],records:[{id:'a',product_id:'p',kind:'operation',version:1,body:{account:'A',store:'S',site:'US'}}],events:[{id:'history',actor:'Original'}]}};
const userA={id:'A',name:'Operator A',canEdit:true},userB={id:'B',name:'Operator B',canEdit:true};
const draftDb=database();draftDb.sql.prepare('INSERT INTO records VALUES(?,?)').run(FOLLOWUP_KEY,JSON.stringify(initial));
let posts=0,loseResponse=false;
const sendFor=(user,db)=>async(path,payload)=>{
  const request=new Request('https://test.example'+path,payload?{method:'POST',body:JSON.stringify(payload)}:{});
  const response=await followup(request,db.env,user);
  if(payload)posts++;
  const value=await response.json();
  if(payload&&loseResponse){loseResponse=false;throw Error('Synthetic lost response');}
  return value;
};
const drafts=new Map(),store={async load(id){return structuredClone(drafts.get(id)||[]);},async save(id,ops){drafts.set(id,structuredClone(ops));}};
const makeClient=user=>{
  const context={user,canEdit:true,autoShare:false,cloudRequest:sendFor(user,draftDb)};
  const cloud=createTrackerCloudDb({context:()=>context,backup:async()=>{},notify:()=>{}});
  const db=createTrackerDraftDb({context:()=>context,cloud,store});return {db,context};
};
const a=makeClient(userA),b=makeClient(userB);await a.db.refresh();await b.db.refresh();
await a.db.doc('links/legacy-a').update({content:{note:'A note'}});
await b.db.doc('links/legacy-a').update({reviews:{rating:4.8}});
assert.equal(posts,0,'manual mode must not upload');
assert.equal(drafts.get('A').length,1);assert.equal(drafts.get('B').length,1);
const restored=makeClient(userA);await restored.db.refresh();assert.equal(restored.db._dump()['links/legacy-a'].content.note,'A note');
await a.db.save();await b.db.save();
let snapshot=(await readFollowup(draftDb.env)).snapshot;
assert.equal(snapshot.data.trackerV1.docs['links/legacy-a'].content.note,'A note');
assert.equal(snapshot.data.trackerV1.docs['links/legacy-a'].reviews.rating,4.8);
assert.deepEqual(snapshot.data.products,initial.data.products);assert.deepEqual(snapshot.data.records,initial.data.records);
assert.ok(snapshot.data.events.some(event=>event.actor==='Operator A'));assert.ok(snapshot.data.events.some(event=>event.actor==='Operator B'));
await a.db.doc('links/legacy-a').update({issue:'first'});await b.db.doc('links/legacy-a').update({issue:'last'});await a.db.save();await b.db.save();
snapshot=(await readFollowup(draftDb.env)).snapshot;
const change=snapshot.data.events.find(event=>event.actor==='Operator B'&&JSON.parse(event.after)['links/legacy-a']?.issue==='last');
assert.equal(JSON.parse(change.before)['links/legacy-a'].issue,'first');
a.context.autoShare=true;await a.db.doc('links/legacy-a').update({owner:'Automatic'});assert.equal(drafts.get('A').length,0);
a.context.autoShare=false;await a.db.doc('links/legacy-a').update({issue:'recover lost response'});loseResponse=true;
await a.db.save(); // Lost response is recovered by re-reading operation IDs.
const count=(await readFollowup(draftDb.env)).snapshot.data.events.length;await a.db.save();
assert.equal((await readFollowup(draftDb.env)).snapshot.data.events.length,count,'retry must not duplicate a successful operation');
assert.equal(drafts.get('A').length,0);
console.log('PASS per-account durable drafts, manual/automatic sharing, two-operator field merge, same-field before/after history, lost-response idempotency');

const largeDb=database();largeDb.sql.prepare('INSERT INTO records VALUES(?,?)').run(FOLLOWUP_KEY,JSON.stringify(initial));
let dropped=false,retries=0,progress=[];
const payload={revision:7,data:structuredClone(initial.data)};
payload.data.trackerV1={schema:1,docs:{'links/large':{sku:'LARGE',content:{note:'中文😀'.repeat(350000)}}}};
assert.ok(Buffer.byteLength(JSON.stringify(payload))>3000000);
const send=sendFor(userA,largeDb);
const result=await uploadFollowupPayload(async(path,body)=>{
  if(body?.action==='part'&&body.index===1){retries++;if(!dropped){dropped=true;throw Error('Synthetic network interruption');}}
  return send(path,body);
},payload,value=>progress.push(value));
assert.equal(retries,2);assert.equal(progress.at(-1).completed,progress.at(-1).total);
assert.equal(result.revision,8);assert.deepEqual((await readFollowup(largeDb.env)).snapshot.data,payload.data);
const lengths=largeDb.sql.prepare('SELECT length(CAST(value AS BLOB)) AS bytes FROM records').all();
assert.ok(lengths.every(row=>row.bytes<1000000),'storage must also be split below D1 row limit');
const archived=largeDb.sql.prepare('SELECT value FROM records WHERE key LIKE ?').get(FOLLOWUP_KEY+':history:7:%');
assert.deepEqual(JSON.parse(archived.value),initial);

const bytes=Buffer.from(JSON.stringify({revision:8,data:payload.data})),id=crypto.randomUUID();
const digest=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
const start={action:'start',id,bytes:bytes.length,count:Math.ceil(bytes.length/PART_BYTES),sha256:digest};
await send('/ops-api/followup/upload',start);
await assert.rejects(sendFor(userB,largeDb)('/ops-api/followup/upload',{action:'commit',id}),error=>error.status===403);
await assert.rejects(send('/ops-api/followup/upload',{action:'commit',id}),/尚未收齐/);
assert.equal((await readFollowup(largeDb.env)).snapshot.revision,8);
const wrongId=crypto.randomUUID(),tiny=Buffer.from('{}');
await send('/ops-api/followup/upload',{action:'start',id:wrongId,bytes:tiny.length,count:1,sha256:'0'.repeat(64)});
await send('/ops-api/followup/upload',{action:'part',id:wrongId,index:0,content:tiny.toString('base64')});
await assert.rejects(send('/ops-api/followup/upload',{action:'commit',id:wrongId}),/校验失败/);
assert.equal((await readFollowup(largeDb.env)).snapshot.revision,8);
await assert.rejects(uploadFollowupPayload(send,payload),/其它人员已更新/);
assert.equal((await readFollowup(largeDb.env)).snapshot.revision,8);
console.log('PASS >3MB Unicode automatic chunk upload, part retry, digest verification, missing-part isolation, cross-user denial, stale revision protection, split storage and immutable original backup');
draftDb.sql.close();largeDb.sql.close();

import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {followup} from '../cloud/followup.mjs';
import {readFollowup,FOLLOWUP_KEY,MAX_BYTES} from '../cloud/followup-storage.mjs';
import {uploadFollowupPayload} from '../src/followup-upload.js';
import {createTrackerCloudDb} from '../src/tracker-cloud-adapter.js';
import {createTrackerDraftDb} from '../src/tracker-drafts.js';
const report={cases:[],failures:[]};
async function test(name,fn){const start=performance.now();try{await fn();report.cases.push({name,ms:Math.round(performance.now()-start)});}catch(error){report.failures.push({name,error:error.stack});}}
function database(){const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE records(key TEXT PRIMARY KEY,value TEXT NOT NULL)');const env={DB:{prepare(text){let args=[];return {bind(...a){args=a;return this;},async first(){return sql.prepare(text).get(...args)||null;},async all(){return {results:sql.prepare(text).all(...args)};},async run(){return sql.prepare(text).run(...args);}};}}};return {sql,env,close:()=>sql.close()};}
const user=id=>({id,name:'运营'+id,canEdit:true});
const sender=(db,who)=>async(path,body)=>{const response=await followup(new Request('https://test.invalid'+path,body?{method:'POST',body:JSON.stringify(body)}:{}),db.env,typeof who==='function'?who():who);return response.json();};
const payload=size=>({revision:0,data:{products:[],records:[],events:[],trackerV1:{schema:1,docs:{'links/large':{sku:'SYNTHETIC',issue:'x'.repeat(size)}}}}});
for(const index of [0,2,4])for(const lostAck of [false,true])await test('pause/resume part '+index+' '+(lostAck?'lost acknowledgement':'offline before write'),async()=>{
 const db=database();try{
  const body=payload(2200000),send=sender(db,user('A')),actions=[];let interrupted=false;
  const unreliable=async(path,data)=>{actions.push({action:data.action,index:data.index});if(data.action==='part'&&data.index===index&&!interrupted){interrupted=true;if(lostAck)await send(path,data);throw Error('synthetic disconnect');}return send(path,data);};
  await assert.rejects(uploadFollowupPayload(unreliable,body,()=>{},'A'),error=>error.uploadPaused);
  assert.equal((await readFollowup(db.env)).snapshot.revision,0);const start=actions.length;
  const saved=await uploadFollowupPayload(unreliable,body,()=>{},'A'),resumed=actions.slice(start);
  assert.equal(resumed[0].action,'status');assert.deepEqual(resumed.filter(a=>a.action==='part').map(a=>a.index),Array.from({length:5-index-(lostAck?1:0)},(_,i)=>i+index+(lostAck?1:0)));
  assert.equal(saved.revision,1);assert.deepEqual((await readFollowup(db.env)).snapshot.data,body.data);
 }finally{db.close();}
});
await test('near 16MiB real 32-part upload and limit+1 rejected before network',async()=>{
 const db=database();try{
  const body=payload(MAX_BYTES-4096),states=[];let parts=0;const send=sender(db,user('MAX'));
  await uploadFollowupPayload(async(path,data)=>{if(data.action==='part')parts++;return send(path,data);},body,value=>states.push(value),'MAX');
  assert.equal(parts,32);assert.equal(states.at(-1).phase,'complete');assert.equal(states.at(-1).completed,32);assert.deepEqual((await readFollowup(db.env)).snapshot.data,body.data);
  let network=0;await assert.rejects(uploadFollowupPayload(async()=>{network++;},payload(MAX_BYTES+1)),/16MB/);assert.equal(network,0);
 }finally{db.close();}
});
await test('account change mid-upload blocks foreign chunks; original operator resumes',async()=>{
 const db=database();try{
  let who=user('A');const send=sender(db,()=>who),body=payload(1200000);let switched=false;
  await assert.rejects(uploadFollowupPayload(async(path,data)=>{const response=await send(path,data);if(data.action==='part'&&!switched){switched=true;who=user('B');}return response;},body,()=>{},'A'),e=>e.status===403);
  assert.equal((await readFollowup(db.env)).snapshot.revision,0);who=user('A');await uploadFollowupPayload(send,body,()=>{},'A');assert.equal((await readFollowup(db.env)).snapshot.revision,1);
 }finally{db.close();}
});
await test('expired upload session restarts safely with complete data equality',async()=>{
 const db=database();try{
  const body=payload(1200000),send=sender(db,user('A'));let id;
  await assert.rejects(uploadFollowupPayload(async(path,data)=>{id=data.id;if(data.action==='part')throw Error('offline');return send(path,data);},body,()=>{},'A'));
  const key=FOLLOWUP_KEY+':upload:'+id,manifest=JSON.parse(db.sql.prepare('SELECT value FROM records WHERE key=?').get(key).value);manifest.expires=0;db.sql.prepare('UPDATE records SET value=? WHERE key=?').run(JSON.stringify(manifest),key);
  await uploadFollowupPayload(send,body,()=>{},'A');assert.deepEqual((await readFollowup(db.env)).snapshot.data,body.data);
 }finally{db.close();}
});
await test('12 stale operators plus 4 simultaneous saves keep every operator record',async()=>{
 const db=database();try{
  const clients=[],stores=new Map();
  for(let i=0;i<16;i++){
   const who=user(String(i)),ctx={user:who,canEdit:true,autoShare:false,cloudRequest:sender(db,who)};
   const cloud=createTrackerCloudDb({context:()=>ctx,backup:async()=>{},notify:()=>{}}),store={async load(id){return structuredClone(stores.get(id)||[]);},async save(id,ops){stores.set(id,structuredClone(ops));}};
   const draft=createTrackerDraftDb({context:()=>ctx,cloud,store});await draft.refresh();await draft.doc('links/op'+i).set({sku:'SKU'+i,owner:who.name,note:'中文😀'+i});clients.push(draft);
  }
  for(let i=11;i>=0;i--)await clients[i].save();
  await Promise.all(clients.slice(12).map(d=>d.save()));
  const saved=(await readFollowup(db.env)).snapshot;assert.equal(saved.revision,16);assert.equal(Object.keys(saved.data.trackerV1.docs).length,16);assert.equal(saved.data.events.length,16);
  for(let i=0;i<16;i++){assert.equal(saved.data.trackerV1.docs['links/op'+i].owner,'运营'+i);assert.equal(stores.get(String(i)).length,0);assert.ok(saved.data.events.some(e=>e.actor_id===String(i)));}
  for(const draft of clients){await draft.refresh();assert.equal(Object.keys(draft._dump()).length,16);}
 }finally{db.close();}
});
fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/followup-upload-stress.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.failures.length)process.exitCode=1;

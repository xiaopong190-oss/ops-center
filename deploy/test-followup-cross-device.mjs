import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {followup} from '../cloud/followup.mjs';
import {readFollowup,FOLLOWUP_KEY} from '../cloud/followup-storage.mjs';
import {createTrackerCloudDb} from '../src/tracker-cloud-adapter.js';
import {createTrackerDraftDb} from '../src/tracker-drafts.js';
import {mount,settle} from './perf-test-harness.mjs';
let passed=0;const failures=[];
async function test(name,fn){try{await fn();passed++;}catch(error){failures.push({name,error:error.stack});}}
function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE records(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
 const env={DB:{prepare(text){let args=[];return {bind(...a){args=a;return this;},async first(){return sql.prepare(text).get(...args)||null;},async all(){return {results:sql.prepare(text).all(...args)};},async run(){return sql.prepare(text).run(...args);}};}}};
 const original={revision:1,data:{products:[],records:[],events:[],trackerV1:{docs:{'links/test':{sku:'TEST',owner:'A',content:{note:'original'}}}}}};
 sql.prepare('INSERT INTO records VALUES(?,?)').run(FOLLOWUP_KEY,JSON.stringify(original));
 let flag='',posts=0,afterPost=false,states=[],auditFailure='';const drafts=new Map();const who={id:'A',name:'A',canEdit:true};
 const send=async(path,payload)=>{
  if(!payload&&afterPost){if(flag==='read-failed')throw Object.assign(Error('synthetic offline read'),{status:503,uploadPaused:true});if(['stale-read','ack-only'].includes(flag))return structuredClone(original);}
  if(payload){posts++;afterPost=true;if(flag==='ack-only')return {revision:2,data:structuredClone(payload.data)};}
  const response=await followup(new Request('https://synthetic.invalid'+path,payload?{method:'POST',body:JSON.stringify(payload)}:{}),env,who),value=await response.json();
  if(payload&&flag==='bad-ack')value.data.trackerV1.docs['links/test'].content.note='wrong';
  if(!payload&&afterPost&&flag==='same-version-wrong-content')value.data.trackerV1.docs['links/test'].content.note='wrong';
  return value;
 };
 const audit=async stage=>{if(stage===auditFailure)throw Object.assign(Error('synthetic journal storage failure'),{uploadPaused:true});};
 const make=(name='A')=>{const ctx={user:{id:name,name},canEdit:true,autoShare:false,cloudRequest:send};const cloud=createTrackerCloudDb({context:()=>ctx,backup:async()=>{},notify:()=>{},audit});const store={async load(id){return structuredClone(drafts.get(id)||[]);},async save(id,ops){drafts.set(id,structuredClone(ops));}};return {cloud,db:createTrackerDraftDb({context:()=>ctx,cloud,store,onState:s=>states.push(s),audit}),ctx};};
 return {sql,env,make,drafts,original,setFlag:x=>{flag=x;},setAuditFailure:x=>{auditFailure=x;},posts:()=>posts,states:()=>states};
}
for(const flag of ['ack-only','stale-read','read-failed','bad-ack','same-version-wrong-content'])await test('no false success: '+flag,async()=>{
 const t=setup();try{const {db}=t.make();await db.refresh();await db.doc('links/test').update({content:{note:'operator final'}});t.setFlag(flag);await assert.rejects(db.save(),/回读|未确认|不一致|offline/);assert.equal(t.drafts.get('A').length,1);assert.equal(t.states().at(-1).isDirty,true);assert.equal(t.states().at(-1).lastReceipt,null);assert.equal(db._dump()['links/test'].content.note,'operator final');
  if(flag!=='ack-only'){t.setFlag('');await db.save();assert.equal(t.posts(),1,'confirmed operation must not be resent');assert.equal(t.drafts.get('A').length,0);}
 }finally{t.sql.close();}
});
await test('independent reader sees exact confirmed data and cloud mode excludes but preserves drafts',async()=>{
 const t=setup();try{const a=t.make(),b=t.make('B');await a.db.refresh();await b.db.refresh();await b.db.doc('links/test').update({content:{note:'B local only'}});await a.db.doc('links/test').update({content:{note:'A confirmed'}});const message=await a.db.save();assert.match(message,/回读已核验 V2/);assert.equal(t.states().at(-1).lastReceipt.savedRevision,2);
  const check=await b.db.setCloudOnly(true);assert.equal(check.revision,2);assert.equal(b.db._dump()['links/test'].content.note,'A confirmed');assert.equal(t.drafts.get('B').length,1);await assert.rejects(b.db.doc('links/test').update({sku:'NO'}),/会议/);assert.equal(b.db._dump()['links/test'].sku,'TEST');await b.db.setCloudOnly(false);assert.equal(b.db._dump()['links/test'].content.note,'B local only');assert.equal((await readFollowup(t.env)).snapshot.data.trackerV1.docs['links/test'].content.note,'A confirmed');
 }finally{t.sql.close();}
});
await test('empty save reports no upload, still requires a fresh successful read',async()=>{const t=setup();try{const a=t.make();await a.db.refresh();assert.match(await a.db.save(),/没有待上传修改/);assert.equal(t.posts(),0);}finally{t.sql.close();}});
for(const stage of ['upload_started','readback_verified','upload_success'])await test('journal storage failure cannot claim success: '+stage,async()=>{const t=setup();try{const a=t.make();await a.db.refresh();await a.db.doc('links/test').update({content:{note:'journal required'}});t.setAuditFailure(stage);await assert.rejects(a.db.save(),/journal/);assert.equal(t.drafts.get('A').length,1);assert.equal(t.states().at(-1).lastReceipt,null);t.setAuditFailure('');await a.db.save();assert.equal(t.drafts.get('A').length,0);assert.equal(t.posts(),1);}finally{t.sql.close();}});
await test('focused input uploaded before blur; meeting clears filters; minimum version mismatch visible',async()=>{
 const t=await mount();try{
  t.window.document.querySelector('nav [data-v="content"]').click();await settle();const note=t.root().querySelector('[data-f="content.note"]');note.focus();note.value='typed without blur';
  await t.window.saveOpsFollowup();assert.equal(t.snapshot.data.trackerV1.docs['links/test'].content.note,'typed without blur');
  const filter=t.root().querySelector('[data-filter="owner"]');filter.value=filter.options[1].value;filter.dispatchEvent(new t.window.Event('change',{bubbles:true}));await settle();
  const check=t.window.document.querySelector('#tracker-meeting-check'),wait=async()=>{for(let i=0;i<100&&check.disabled;i++)await settle();assert.equal(check.disabled,false);};
  t.window.document.querySelector('#tracker-expected-revision').value=String(t.snapshot.revision+1);check.click();await wait();assert.match(t.window.document.querySelector('#tracker-sync-message').textContent,/低于上传凭证/);assert.equal(t.root().querySelector('[data-filter="owner"]').value,'');
  t.window.document.querySelector('#tracker-expected-revision').value=String(t.snapshot.revision);check.click();await wait();assert.match(t.window.document.querySelector('#tracker-sync-message').textContent,/会议云端视图/);assert.equal(t.window.document.querySelector('#tracker-return-edit').hidden,false);
  assert.equal(t.errors.length,0,t.errors.join('\n'));
 }finally{t.window.close();}
});
console.log(JSON.stringify({passed,failed:failures.length,failures},null,2));if(failures.length)process.exitCode=1;

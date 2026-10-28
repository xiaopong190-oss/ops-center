import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {followup} from '../cloud/followup.mjs';
import {uploadFollowupPayload} from '../src/followup-upload.js';
const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE records(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
const env={DB:{prepare(text){let args=[];return {bind(...a){args=a;return this;},async first(){return sql.prepare(text).get(...args)||null;},async all(){return {results:sql.prepare(text).all(...args)};},async run(){return sql.prepare(text).run(...args);}};}}};
const user={id:'operator',name:'运营',canEdit:true},payload={revision:0,data:{products:[],records:[],events:[],trackerV1:{docs:{'links/a':{issue:'x'.repeat(1800000)}}}}};
const actions=[],states=[];let failIndex=2,lost=false;
const send=async(path,body)=>{
 actions.push(structuredClone(body));
 const value=await followup(new Request('https://test.example'+path,{method:'POST',body:JSON.stringify(body)}),env,user);
 if(body.action==='part'&&body.index===failIndex&&!lost){lost=true;throw Error('lost acknowledgement');}
 return value.json();
};
await assert.rejects(uploadFollowupPayload(send,payload,s=>states.push(s),'account-a'),e=>e.uploadPaused&&e.completed===2);
assert.equal(states.at(-1).phase,'paused');
assert.equal(actions.filter(a=>a.action==='commit').length,0);
const id=actions.find(a=>a.action==='start').id;
assert.equal(sql.prepare('SELECT count(*) n FROM records WHERE key LIKE ?').get('_new-product-followup:upload:'+id+':%').n,3);
// A previously acknowledged part becomes corrupted on the server.
sql.prepare('UPDATE records SET value=? WHERE key=?').run('Y29ycnVwdA==','_new-product-followup:upload:'+id+':0');
const before=actions.length;const saved=await uploadFollowupPayload(send,payload,s=>states.push(s),'account-a');
const resumed=actions.slice(before);
assert.equal(resumed[0].action,'status','server queried before resuming');
assert.deepEqual(resumed.filter(a=>a.action==='part').map(a=>a.index),[0,3],'repair corrupt part and missing part only; acknowledged and lost-ack parts skipped');
assert.equal(saved.revision,1);assert.equal(states.at(-1).phase,'complete');
assert.equal(states.at(-2).phase,'verifying');
assert.equal(sql.prepare('SELECT count(*) n FROM records WHERE key LIKE ?').get('_new-product-followup:upload:'+id+'%').n,0,'staging reclaimed only after commit');
// Sessions and receipts cannot be inspected by a different operator.
await send('/ops-api/followup/upload',{action:'start',id,bytes:2,count:1,sha256:'0'.repeat(64)});
await assert.rejects(followup(new Request('https://test.example/ops-api/followup/upload',{method:'POST',body:JSON.stringify({action:'status',id})}),env,{...user,id:'other'}),e=>e.status===403);
console.log('PASS pause immediately, server receipts survive lost response, resume queries first, only missing/corrupt chunks resent, verified commit before success, staging cleanup, account isolation');
sql.close();

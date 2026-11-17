import assert from 'node:assert/strict';
import {createTrackerCloudDb} from '../src/tracker-cloud-adapter.js';
import {createTrackerDraftDb} from '../src/tracker-drafts.js';
const original={revision:5,data:{products:[],records:[],events:[],trackerV1:{docs:{'links/test':{sku:'TEST',content:{note:'original'}}}}}};
const who={id:'A',name:'A'};
async function scenario({write=true,recoveryReadsFail=false,foreign=false,newer=false,switchUser=false}={}){
 let snapshot=structuredClone(original),posts=0,reads=0,submitted=false;
 const ctx={user:who,canEdit:true,autoShare:false},audit=[];const disk=new Map();
 ctx.cloudRequest=async(path,payload)=>{
  if(payload){posts++;submitted=true;if(write){snapshot={revision:6,data:structuredClone(payload.data)};if(foreign)snapshot.data.events[0].actor_id='B';if(newer){snapshot.revision=7;snapshot.data.trackerV1.docs['links/test'].content.note='subsequent user edit';}}
   if(switchUser)ctx.user={id:'B',name:'B'};throw Object.assign(new TypeError('Failed to fetch'),{uploadPaused:true});}
  reads++;if(submitted&&recoveryReadsFail)throw new TypeError('Failed to fetch');return structuredClone(snapshot);
 };
 const cloud=createTrackerCloudDb({context:()=>ctx,backup:async()=>{},notify:()=>{},audit:async(stage,details)=>audit.push({stage,details})});
 let status;const db=createTrackerDraftDb({context:()=>ctx,cloud,store:{load:async id=>disk.get(id)||[],save:async(id,ops)=>disk.set(id,structuredClone(ops))},onState:value=>{status=value;}});
 await db.refresh();await db.doc('links/test').update({content:{note:'last step interrupted'}});
 let error;try{await db.save();}catch(e){error=e;}
 return {posts,reads,disk,status,audit,error,snapshot};
}
for(const options of [{write:false},{foreign:true},{recoveryReadsFail:true},{switchUser:true}]){
 const t=await scenario(options);assert.ok(t.error);assert.equal(t.posts,1);assert.equal(t.disk.get('A').length,1);assert.equal(t.status.lastReceipt,null);
}
for(const newer of [false,true]){
 const t=await scenario({newer});assert.equal(t.error,undefined);assert.equal(t.posts,1);assert.equal(t.disk.get('A').length,0);assert.ok(t.audit.some(row=>row.stage==='submit_recovered'));assert.ok(t.audit.some(row=>row.stage==='readback_verified'));assert.equal(t.status.lastReceipt.savedRevision,newer?7:6);
}
console.log('PASS final-step recovery: lost commit response read twice before success, no repeated POST, newer revision with retained events accepted, missing/foreign operations and account switch rejected, 3 bounded read failures retain drafts');

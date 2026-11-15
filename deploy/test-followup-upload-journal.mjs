import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mount,settle} from './perf-test-harness.mjs';
const require=createRequire(new URL('../modules/new-product-followup/work/qa/package.json',import.meta.url)),{IDBFactory}=require('fake-indexeddb');
const factory=new IDBFactory(),user={id:'operator-journal',name:'Synthetic operator'};let snapshot;
await new Promise((resolve,reject)=>{const r=factory.open('ops-tracker-personal-drafts-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put([{id:'legacy-draft'}],'legacy-account');tx.oncomplete=()=>{db.close();resolve();};};});
const read=async()=>{const db=await new Promise((resolve,reject)=>{const r=factory.open('ops-tracker-personal-drafts-v1',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const r=db.transaction('journal').objectStore('journal').index('userId').getAll(user.id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}};
let t=await mount({user,indexedDBFactory:factory});
try{
 snapshot=t.snapshot;t.window.document.querySelector('nav [data-v="content"]').click();await settle();const note=t.root().querySelector('[data-f="content.note"]');note.value='synthetic saved note';note.dispatchEvent(new t.window.Event('change',{bubbles:true}));await settle();
 await t.window.recordOpsFollowupUploadProgress({phase:'uploading',completed:1,total:4});await t.window.saveOpsFollowup();
 const rows=await read(),stages=rows.map(row=>row.stage);
 for(const stage of ['save_clicked','upload_started','cloud_read_complete','backup_complete','submit_started','submit_acknowledged','readback_started','readback_verified','upload_success','transport_uploading'])assert.ok(stages.includes(stage),stage);
 assert.ok(stages.indexOf('upload_success')>stages.indexOf('readback_verified'));assert.ok(rows.every(row=>row.userId===user.id));assert.ok(!JSON.stringify(rows).includes('synthetic saved note'),'journal excludes form content');
 const legacy=await new Promise((resolve,reject)=>{const r=factory.open('ops-tracker-personal-drafts-v1',2);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('drafts').objectStore('drafts').get('legacy-account');q.onsuccess=()=>{resolve(q.result);db.close();};};});assert.equal(legacy[0].id,'legacy-draft','journal schema upgrade preserves existing drafts');
 t.window.document.querySelector('#tracker-upload-journal').click();for(let i=0;i<50&&!t.window.document.querySelector('#tracker-journal-dialog');i++)await settle();assert.match(t.window.document.querySelector('#tracker-journal-dialog').textContent,/交叉核验通过|云端已保存修改/);assert.equal(t.errors.length,0,t.errors.join('\n'));
}finally{t.window.close();}
t=await mount({user,indexedDBFactory:factory,cloudSnapshot:snapshot});
try{
 const before=await read();assert.ok(before.some(row=>row.stage==='upload_success'),'logs survive closing and reopening');
 const context={user,canEdit:true,autoShare:false,active:true,staff:[],cloudRequest:async(path,payload)=>{if(payload)throw Object.assign(Error('synthetic offline'),{status:503,uploadPaused:true});return structuredClone(snapshot);}};
 await t.window.setOpsFollowupContext(context);t.window.document.querySelector('nav [data-v="content"]').click();await settle();const note=t.root().querySelector('[data-f="content.note"]');note.value='failed edit';note.dispatchEvent(new t.window.Event('change',{bubbles:true}));await settle();await assert.rejects(t.window.saveOpsFollowup(),/offline/);
 const rows=(await read()).slice(before.length),stages=rows.map(row=>row.stage);assert.ok(stages.includes('attempt_failed'));assert.ok(stages.includes('upload_failed'));assert.ok(stages.includes('save_rejected'));assert.ok(!stages.includes('upload_success'));assert.equal(t.errors.length,0,t.errors.join('\n'));
}finally{t.window.close();}
console.log('PASS durable per-account upload journal: phases, failures, success only after cross-read verification, reload recovery, journal UI and no form/token payloads');

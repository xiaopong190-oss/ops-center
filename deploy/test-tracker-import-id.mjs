import assert from 'node:assert/strict';
import {mount,settle} from './perf-test-harness.mjs';
import {mergeTrackerImport} from '../src/tracker-cloud-adapter.js';
for(const row of [{promo:null},{content:{owners:null}},{reviews:{bad:[null]}},{content:{dues:{copy:'2025-02-29'}}},{promo:{actions:[{date:'aaaaa<img src=x onerror="window.attacked=1">'}]}},JSON.parse('{"content":{"__proto__":{"polluted":true}}}')])assert.throws(()=>mergeTrackerImport({}, {'links/bad':row}),/无效|格式/);
let deep={};for(let i=0;i<14;i++)deep={nested:deep};assert.throws(()=>mergeTrackerImport({}, {'links/deep':deep}),/嵌套/);
const t=await mount();
try{
 const id='evil"><img src=x onerror="window.attacked=1">',input=t.root().querySelector('[data-import]');
 Object.defineProperty(input,'files',{configurable:true,value:[new t.window.File([JSON.stringify({['links/'+id]:{sku:'ID-ATTACK',site:'US'}})],'synthetic.json',{type:'application/json'})]});
 input.dispatchEvent(new t.window.Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,100));await t.window.saveOpsFollowup();
 t.window.document.querySelector('nav [data-v="content"]').click();await settle();
 [...t.root().querySelectorAll('button[data-act="sel"]')].find(button=>button.dataset.id===id).click();await settle();
 assert.equal(t.root().querySelector('img[onerror]'),null,'import ID must not create HTML nodes');assert.equal(t.window.attacked,undefined);
 const note=t.root().querySelector('[data-f="content.note"]');assert.equal(note.id,'f-'+id+'-content-note');
 note.value='ID with special characters remains editable';note.dispatchEvent(new t.window.Event('change',{bubbles:true}));await settle();await t.window.saveOpsFollowup();
 assert.equal(t.snapshot.data.trackerV1.docs['links/'+id].content.note,note.value);assert.equal(t.errors.length,0,t.errors.join('\n'));
 console.log('PASS malicious imported record IDs are HTML-escaped, create no injected elements, preserve literal identity, and remain editable');
}finally{t.window.close();}

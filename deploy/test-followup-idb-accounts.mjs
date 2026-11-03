import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mount,settle} from './perf-test-harness.mjs';
const require=createRequire(new URL('../modules/new-product-followup/work/qa/package.json',import.meta.url));
const {IDBFactory}=require('fake-indexeddb'),indexedDBFactory=new IDBFactory();
const users=[{id:'operator-A',name:'运营A'},{id:'operator-B',name:'运营B'}];
let cloudSnapshot;
async function open(user){return mount({user,indexedDBFactory,cloudSnapshot});}
async function content(t){t.window.document.querySelector('nav [data-v="content"]').click();await settle();return t.root().querySelector('[data-f="content.note"]');}
for(const user of users){const t=await open(user);cloudSnapshot=t.snapshot;try{const note=await content(t);assert.equal(note.value,'');note.value=user.name+'独立草稿😀';note.dispatchEvent(new t.window.Event('change',{bubbles:true}));await settle();assert.equal(t.writes(),0);assert.equal(t.errors.length,0,t.errors.join('\n'));}finally{t.window.close();}}
for(const user of users){const t=await open(user);try{const note=await content(t);assert.equal(note.value,user.name+'独立草稿😀','reopening must restore only this account draft');await t.window.saveOpsFollowup();assert.equal(cloudSnapshot.data.trackerV1.docs['links/test'].content.note,user.name+'独立草稿😀');assert.equal(t.errors.length,0,t.errors.join('\n'));}finally{t.window.close();}}
const observer=await open({id:'admin',name:'管理员'});try{assert.equal((await content(observer)).value,'运营B独立草稿😀');assert.equal(cloudSnapshot.data.events.length,2);assert.deepEqual(new Set(cloudSnapshot.data.events.map(event=>event.actor_id)),new Set(users.map(user=>user.id)));}finally{observer.window.close();}
console.log('PASS DOM + IndexedDB account drafts survive closing and reopening; no cross-account draft leakage; each confirmed upload visible to observer with actor audit');

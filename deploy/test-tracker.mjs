import {DatabaseSync} from 'node:sqlite';
import {readFollowup} from '../cloud/followup-storage.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {projectTracker,mergeTrackerImport,createTrackerCloudDb} from '../src/tracker-cloud-adapter.js';
import {buildTrackerDocument} from './build-tracker-document.mjs';
import {followup} from '../cloud/followup.mjs';
const original = {products:[{id:'p',version:1,body:{name:'Existing',sku:'SKU',owner:'Owner'}}],records:[
  {id:'a',product_id:'p',kind:'operation',version:1,body:{owner:'Owner',account:'Account',store:'Shop',site:'US'}},
  {id:'s',product_id:'p',kind:'shipment',version:1,body:{operationId:'a',title:'Batch',quantity:10,method:'海运',due:'2026-11-01'}},
  {id:'cost',product_id:'p',kind:'cost',version:1,body:{actual:50,evidence:'https://example.com/receipt'}},
],events:[{id:'old-event',actor:'Historical',action:'old'}],unknownMetadata:{preserve:true}};
const fixture = structuredClone(original);
let cloud = {revision:5,data:structuredClone(original)}, backups=[],writes=0,conflict=true;
const user = {id:'user',name:'User',canEdit:true};
// Exercise the actual unchanged production API validation and CAS contract.
const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE records(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
sqlite.prepare('INSERT INTO records VALUES(?,?)').run('_new-product-followup',JSON.stringify(cloud));
const env={DB:{prepare(sql){let args=[];return {bind(...a){args=a;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return sqlite.prepare(sql).run(...args);}};}}};
const ctx={user,canEdit:true,async cloudRequest(path,payload){
  assert.equal(path,'/ops-api/followup');
  if(payload && conflict){conflict=false;cloud.revision++;cloud.data.events.push({id:'concurrent',actor:'Another'});sqlite.prepare('UPDATE records SET value=? WHERE key=?').run(JSON.stringify(cloud),'_new-product-followup');throw Error('其它人员已更新');}
  const req=new Request('https://example.com'+path,payload?{method:'POST',body:JSON.stringify(payload)}:{});
  const res=await followup(req,env,user);if(payload)writes++;cloud=(await readFollowup(env)).snapshot;return res.json();
}};
const db=createTrackerCloudDb({context:()=>ctx,backup:async value=>backups.push(structuredClone(value)),notify:()=>{}});
await db.refresh();
assert.equal(db._dump()['ships/legacy-s'].etaLatest,'2026-11-01');
await db.doc('links/legacy-a').update({content:{copy:['done']}});
assert.deepEqual(cloud.data.products,original.products);
assert.deepEqual(cloud.data.records,original.records);
assert.deepEqual(cloud.data.events.find(e=>e.id==='old-event'),original.events[0]);
assert.ok(cloud.data.events.some(e=>e.id==='concurrent'));
assert.deepEqual(cloud.data.unknownMetadata,original.unknownMetadata);
assert.equal(backups.length,2);assert.equal(writes,1);
assert.equal(projectTracker(cloud.data)['links/legacy-a'].content.copy[0],'done');
const input=Object.fromEntries([1,2,3].flatMap(i=>[[`links/test-${i}`,{sku:`NEW-${i}`,account:'Test',store:'Shop',site:'US'}],[`ships/test-${i}`,{linkId:`test-${i}`,qty:10}]]));
const imported=mergeTrackerImport(projectTracker(cloud.data),input);
assert.equal(imported.added,6);
assert.equal(mergeTrackerImport(imported.docs,input).added,0);
await db._load(input);
assert.deepEqual(cloud.data.records,original.records);
await db.doc('links/legacy-a').delete();
assert.equal(db._dump()['ships/legacy-s'],undefined);
assert.equal(cloud.data.records.length,3);
assert.equal(backups.at(-1).data.trackerV1.docs['links/legacy-a'].content.copy[0],'done');
ctx.canEdit=false;await assert.rejects(db.doc('links/test').set({sku:'denied'}),/没有编辑权限/);ctx.canEdit=true;
const blocked=createTrackerCloudDb({context:()=>ctx,backup:async()=>{throw Error('Backup failed');},notify:()=>{}});
const before=structuredClone(cloud);await assert.rejects(blocked.doc('links/x').set({sku:'x'}),/Backup failed/);assert.deepEqual(cloud,before);
assert.deepEqual(original,fixture);
const html=buildTrackerDocument(new URL('../',import.meta.url));
for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
assert.ok(!html.includes("KEY='xinpin-tracker-db'"));
assert.ok(html.includes('db._load(o).catch'));
assert.ok(html.includes('state.me=null'));
fs.writeFileSync(new URL('../tracker-preview.html',import.meta.url),html);
console.log('PASS: unchanged production API; lossless legacy preservation; conflict retry; complete backups; denied writes; import deduplication; recoverable deletion; script syntax');

// Read-only production snapshot check; never prints business records or credentials.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {followup} from './followup.mjs';
import {readFollowup} from './followup-storage.mjs';

const sql = "SELECT key,value FROM records WHERE key='_new-product-followup' OR key IN (SELECT value FROM json_each((SELECT json_extract(value,'$.parts') FROM records WHERE key='_new-product-followup')))";
const wrangler = process.env.FOLLOWUP_WRANGLER || 'D:/systemDir/Documents/skill/keyword-sop-web/node_modules/wrangler/bin/wrangler.js';
const result = spawnSync(process.execPath,[wrangler,'d1','execute','ops-center-cloud','--remote','--json','--command',sql],{
  cwd:fileURLToPath(new URL('.',import.meta.url)),encoding:'utf8',maxBuffer:20*1024*1024,windowsHide:true,
});
assert.equal(result.status,0,result.stderr);
const rows = JSON.parse(result.stdout)[0].results;
const records = new Map(rows.map(row=>[row.key,row.value]));
const env = {DB:{prepare(){return {bind(...keys){return {
  async first(){return records.has(keys[0])?{value:records.get(keys[0])}:null;},
  async all(){return {results:keys.filter(key=>records.has(key)).map(key=>({key,value:records.get(key)}))};},
};}};}}};
const user = {id:'verification',name:'verification',auth:'super',canEdit:true};
const response = await followup(new Request('https://verification.invalid/ops-api/followup'),env,user);
assert.equal(response.status,200);
const snapshot = await response.json();
assert.ok(snapshot.revision>0);
assert.ok(Array.isArray(snapshot.data.products));
const pointer = JSON.parse(records.get('_new-product-followup'));
records.delete(pointer.parts[0]);
await assert.rejects(()=>readFollowup(env),error=>error.status===409);
console.log(JSON.stringify({verified:true,revision:snapshot.revision,products:snapshot.data.products.length,
  events:snapshot.data.events.length,docs:Object.keys(snapshot.data.trackerV1?.docs||{}).length,
  missingPartRejected:true,readOnly:true}));

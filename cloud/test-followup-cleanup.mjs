import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {cleanupFollowupUploads} from './followup-cleanup.mjs';
const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE records(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
const env={DB:{prepare(text){let args=[];return {bind(...a){args=a;return this;},async all(){return {results:sql.prepare(text).all(...args)};},async run(){return sql.prepare(text).run(...args);}};}}};
const prefix='_new-product-followup:upload:';
const entries={
 [prefix+'expired']:JSON.stringify({expires:1}),[prefix+'expired:0']:'retired',
 [prefix+'active']:JSON.stringify({expires:3000}),[prefix+'active:0']:'active',
 [prefix+'unknown']:'{}',[prefix+'unknown:0']:'unknown',
 '_new-product-followup':'current','_new-product-followup:version:a:0':'current part',
 '_new-product-followup:history:1:a':'history','other':'business',
};
for(const [k,v] of Object.entries(entries))sql.prepare('INSERT INTO records VALUES(?,?)').run(k,v);
assert.deepEqual(await cleanupFollowupUploads(env,2000),{expiredUploads:1});
for(const [k,v] of Object.entries(entries)){
 const row=sql.prepare('SELECT value FROM records WHERE key=?').get(k);
 if(k.startsWith(prefix+'expired'))assert.equal(row,undefined);else assert.equal(row.value,v);
}
assert.deepEqual(await cleanupFollowupUploads(env,2000),{expiredUploads:0});
console.log('PASS expired staging only, active/unknown uploads protected, current data/history/version parts untouched, idempotent cleanup');

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicRows,invalidatePublicRows} from './shared-read-cache.mjs';
import {createSharedReadCache} from '../src/utils/shared-read-cache.mjs';
test('simultaneous readers and reopening share one DB query; writes and expiry reload',async()=>{
 let calls=0,release;const env={DB:{prepare(){return {bind(){return this},all(){calls++;return new Promise(r=>release=r)}}}}};
 const a=publicRows(env,0),b=publicRows(env,0);assert.equal(calls,1);release({results:[{key:'x',value:'{}'}]});assert.deepEqual(await a,await b);
 await publicRows(env,100);assert.equal(calls,1);
 invalidatePublicRows(env);const c=publicRows(env,200);assert.equal(calls,2);release({results:[]});await c;
 const d=publicRows(env,16000);assert.equal(calls,3);release({results:[]});await d;
});
test('failed DB reads are not cached and DB instances never share results',async()=>{
 let count=0;const env={DB:{prepare(){return {bind(){return this},async all(){if(++count===1)throw Error('offline');return {results:[]}}}}}};
 await assert.rejects(publicRows(env),/offline/);await publicRows(env);assert.equal(count,2);
});
test('page shares reads, isolates credentials, clones results and invalidates after writes',async()=>{
 let now=0,calls=0;const c=createSharedReadCache(5000,()=>now),load=async()=>{calls++;return {files:{x:{content:'original'}}}};
 const [a,b]=await Promise.all([c.read('one',load),c.read('one',load)]);assert.equal(calls,1);a.files.x.content='changed';assert.equal(b.files.x.content,'original');
 await c.read('one',load);assert.equal(calls,1);await c.read('two',load);assert.equal(calls,2);
 c.clear();await c.read('two',load);assert.equal(calls,3);now=6000;await c.read('two',load);assert.equal(calls,4);
 c.clear();await assert.rejects(c.read('two',async()=>{throw Error('offline')}));await c.read('two',load);assert.equal(calls,5);
});

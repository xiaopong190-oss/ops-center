import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {publicRecordsSql,publicRecordsBounds,dailyD1Limit} from './d1-budget.mjs';
import worker from './worker.mjs';
test('public sync preserves every non-private key and uses indexes instead of scanning private shards',()=>{
 const db=new DatabaseSync(':memory:');try{
 db.exec('CREATE TABLE records(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
 const insert=db.prepare('INSERT INTO records VALUES(?,?)');
 for(let i=0;i<3000;i++)insert.run('_private:'+i,'ciphertext');
 for(const k of ['', 'a.json','A.json','[name]','^','_','_hidden','__','`','`file','global-config.json','playbook-u-test.json','中文.json','😀'])if(!k.startsWith('_private:'))insert.run(k,'{}');
 const old=db.prepare('SELECT key,value FROM records WHERE substr(key,1,1) <> ?').all('_'),next=db.prepare(publicRecordsSql).all(...publicRecordsBounds);
 assert.deepEqual(next.sort((a,b)=>a.key.localeCompare(b.key)),old.sort((a,b)=>a.key.localeCompare(b.key)));
 const plan=db.prepare('EXPLAIN QUERY PLAN '+publicRecordsSql).all(...publicRecordsBounds).map(x=>x.detail).join('\n');
 assert(!/SCAN records/.test(plan),plan);assert.equal((plan.match(/SEARCH records USING INDEX/g)||[]).length,2,plan);
 }finally{db.close()}
});
test('daily quota errors specify reset time and do not expose raw database errors',async()=>{
 const original="D1_ERROR: Your account has exceeded D1's free tier daily row read limit. private details";
 const mapped=dailyD1Limit(Error(original),Date.parse('2026-10-30T14:00:00Z'));
 assert.equal(mapped.code,'D1_DAILY_READ_LIMIT');assert.equal(mapped.resetAt,'2026-10-31T00:00:00.000Z');assert.equal(mapped.retryAfter,36000);assert.equal(mapped.retryable,false);assert(!mapped.error.includes('private'));
 assert.equal(dailyD1Limit(Error(original.replace('read limit','write limit'))).code,'D1_DAILY_WRITE_LIMIT');
 assert.equal(dailyD1Limit(Error('database or disk is full')),null);
 const env={DB:{prepare(){return {bind(){return this},async first(){throw Error(original)}}}}};
 const response=await worker.fetch(new Request('https://worker/api/logistics-workspace?meta=1',{headers:{Authorization:'Bearer synthetic'}}),env);
 assert.equal(response.status,503);assert(Number(response.headers.get('Retry-After'))>0);assert.equal((await response.json()).code,'D1_DAILY_READ_LIMIT');
});

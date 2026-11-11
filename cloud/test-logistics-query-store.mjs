import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {buildQueryIndex} from './query-index.mjs';
import {stageQueryIndex,logisticsQuery,businessDay,cleanupQueryIndexes} from './logistics-query-store.mjs';
const now=new Date('2026-11-11T04:00:00Z');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function database(){
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE records(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
 const db={
  prepare(text){
   return {bind(...args){
    return {
     async first(){return sql.prepare(text).get(...args)||null},
     async all(){return {results:sql.prepare(text).all(...args)}},
     async run(){const result=sql.prepare(text).run(...args);return {meta:{changes:result.changes}}}
    };
   }};
  },
  async batch(statements){
   const out=[];sql.exec('BEGIN');
   try{for(const statement of statements)out.push(await statement.run());sql.exec('COMMIT');return out}
   catch(error){sql.exec('ROLLBACK');throw error}
  }
 };
 return {env:{DB:db,ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')},close:()=>sql.close(),sql};
}
function fixture(sourceSha,rows){
 const {index,pages}=buildQueryIndex(rows,4000),items=[{part:'quotes-price:index',value:index},...pages.map((value,i)=>({part:'quotes-price:page-'+i,value}))].map(item=>({...item,hash:hash(item.value)}));
 const manifest={schema:1,savedAt:now.toISOString(),counts:{quotes:rows.length},parts:Object.fromEntries(items.map(item=>[item.part,item.hash]))};
 return {sourceSha,day:businessDay(now),version:sourceSha+':'+businessDay(now)+':'+hash(manifest),manifest,items};
}
const request=body=>new Request('https://worker/query-build',{method:'POST',body:JSON.stringify(body)});
async function stage(env,view){for(let i=0;i<view.items.length;i+=8)await stageQueryIndex(request({...view,action:'stage',items:view.items.slice(i,i+8).map(item=>({part:item.part,hash:item.hash,packed:gzipSync(Buffer.from(JSON.stringify(item.value))).toString('base64')}))}),env,async()=>view.sourceSha,now)}
const activate=(env,view,current=view.sourceSha)=>stageQueryIndex(request({...view,items:undefined,action:'activate'}),env,async()=>current,now);
const read=(env,query='',user={id:'reader'})=>logisticsQuery(new Request('https://worker/query?'+query),env,user,now);
test('two authenticated users query independently, return only their page, and share an active version',async()=>{
 const db=database();try{
  const rows=Array.from({length:2000},(_,i)=>({provider:i%2?'天盛':'九方',transport:'空运',warehouse:'BHX1',price:i}));
  const view=fixture('a'.repeat(40),rows);await stage(db.env,view);await activate(db.env,view);
  const [a,b]=await Promise.all([read(db.env,'provider=天盛&page=1&size=25',{id:'one'}).then(r=>r.json()),read(db.env,'provider=九方&size=25',{id:'two'}).then(r=>r.json())]);
  assert.equal(a.version,b.version);assert.equal(a.total,1000);assert.equal(b.total,1000);assert.equal(a.rows.length,25);assert.equal(b.rows.length,25);
  assert(a.rows.every(r=>r.provider==='天盛'));assert(b.rows.every(r=>r.provider==='九方'));assert.equal(a.rows[0].price,51);
  assert(Buffer.byteLength(JSON.stringify(a))<10000);
  const stored=db.sql.prepare("SELECT value FROM records WHERE key LIKE '%page-0'").get().value;
  assert(!stored.includes('天盛'));assert(!stored.includes('price'));
  await assert.rejects(read(db.env,'',null),e=>e.status===401);
 }finally{db.close()}
});
test('incomplete builds and stale GitHub sources cannot activate, and pages cannot cross a version switch',async()=>{
 const db=database();try{
  const first=fixture('a'.repeat(40),[{provider:'天盛',transport:'空运'}]);await stage(db.env,first);await activate(db.env,first);
  const next=fixture('b'.repeat(40),[{provider:'天盛',transport:'空运'},{provider:'九方',transport:'空运'}]);
  await assert.rejects(activate(db.env,next),e=>e.status===409);
  assert.equal((await (await read(db.env)).json()).total,1);
  await stage(db.env,next);await assert.rejects(activate(db.env,next,'c'.repeat(40)),e=>e.status===409);
  await activate(db.env,next);
  await assert.rejects(read(db.env,'version='+encodeURIComponent(first.version)+'&page=1'),e=>e.status===409);
  assert.equal((await (await read(db.env)).json()).total,2);
  await assert.rejects(logisticsQuery(new Request('https://worker/query'),db.env,{id:'reader'},new Date('2026-11-12T04:00:00Z')),e=>e.status===503);
 }finally{db.close()}
});

test('expired failed projections are removed while the active version and business data remain intact',async()=>{
 const db=database();try{
  const active=fixture('a'.repeat(40),[{provider:'天盛'}]),failed=fixture('b'.repeat(40),[{provider:'九方'}]);
  await stage(db.env,active);await activate(db.env,active);await stage(db.env,failed);
  db.sql.prepare('INSERT INTO records VALUES(?,?)').run('logistics-quotes-v1','{"canonical":true}');
  assert.equal((await cleanupQueryIndexes(db.env,now)).removed,0);
  const result=await cleanupQueryIndexes(db.env,new Date(now.getTime()+3*86400000));assert.equal(result.removed,failed.items.length+1);
  assert.equal((await (await read(db.env)).json()).total,1);
  assert(db.sql.prepare('SELECT value FROM records WHERE key=?').get('logistics-quotes-v1'));
 }finally{db.close()}
});

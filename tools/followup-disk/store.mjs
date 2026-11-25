import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {followup} from './runtime/cloud/followup.mjs';
import {readFollowup,FOLLOWUP_KEY} from './runtime/cloud/followup-storage.mjs';
export function openStore(dir){
 fs.mkdirSync(dir,{recursive:true});const sql=new DatabaseSync(path.join(dir,'followup.sqlite'));
 sql.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS records(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS journal(id INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT,actor TEXT,method TEXT,path TEXT,status INTEGER,revision INTEGER,digest TEXT);');
 const env={DB:{prepare(text){let args=[];return {bind(...a){args=a;return this;},async first(){return sql.prepare(text).get(...args)||null;},async all(){return {results:sql.prepare(text).all(...args)};},async run(){const result=sql.prepare(text).run(...args);return {...result,meta:{changes:result.changes}};}};}}};
 const currentRevision=()=>{const row=sql.prepare('SELECT value FROM records WHERE key=?').get(FOLLOWUP_KEY);return row?JSON.parse(row.value).revision:0;};
 let queue=Promise.resolve();
 const serialize=task=>{const result=queue.catch(()=>{}).then(task);queue=result;return result;};
 return {sql,env,close:()=>sql.close(),
  importSnapshot:filename=>serialize(async()=>{
   if(currentRevision()>0)throw Error('Local database already has data; refusing overwrite');
   const bytes=fs.readFileSync(filename),snapshot=JSON.parse(bytes);
   if(!Number.isSafeInteger(snapshot.revision)||snapshot.revision<1||!['products','records','events'].every(k=>Array.isArray(snapshot.data?.[k])))throw Error('Invalid migration snapshot');
   sql.prepare('INSERT INTO records VALUES(?,?)').run(FOLLOWUP_KEY,bytes.toString('utf8'));
   return {revision:snapshot.revision,sha256:createHash('sha256').update(bytes).digest('hex')};
  }),
  handle:input=>serialize(async()=>{
   if(!['/ops-api/followup','/ops-api/followup/upload'].includes(input.path)||!['GET','POST'].includes(input.method)||!input.user?.id)return {status:400,body:JSON.stringify({error:'Invalid relay request'})};
   const before=currentRevision();sql.exec('BEGIN IMMEDIATE');let status=200,body;
   try{
    const response=await followup(new Request('https://disk.local'+input.path,{method:input.method,...(input.method==='POST'?{body:input.body}:{})}),env,input.user);
    status=response.status;body=await response.text();
    const revision=currentRevision();
    if(revision>before){
     // Only current immutable parts survive locally; operation history stays inside the current snapshot.
     sql.prepare("DELETE FROM records WHERE key GLOB '_new-product-followup:history:*'").run();
     sql.prepare("DELETE FROM records WHERE key GLOB '_new-product-followup:version:*' AND key NOT IN (SELECT value FROM json_each((SELECT json_extract(value,'$.parts') FROM records WHERE key=?)))").run(FOLLOWUP_KEY);
    }
    sql.prepare('DELETE FROM records WHERE key GLOB ? AND json_valid(value) AND json_extract(value,\'$.expires\')<?').run('_new-product-followup:upload:*',Date.now());
    sql.prepare('INSERT INTO journal(at,actor,method,path,status,revision,digest) VALUES(?,?,?,?,?,?,?)').run(new Date().toISOString(),input.user.id,input.method,input.path,status,revision,createHash('sha256').update(input.body||'').digest('hex'));
    sql.exec('COMMIT');
    if(revision>before){const {snapshot}=await readFollowup(env);const temporary=path.join(dir,'latest-backup.json.tmp');try{fs.writeFileSync(temporary,JSON.stringify(snapshot));fs.renameSync(temporary,path.join(dir,'latest-backup.json'));}catch(error){fs.appendFileSync(path.join(dir,'backup-errors.log'),new Date().toISOString()+' '+error.code+'\n');}}
    return {status,body};
   }catch(error){sql.exec('ROLLBACK');status=Number.isInteger(error.status)?error.status:500;return {status,body:JSON.stringify({error:status>=500?'D盘保存失败，未确认成功；草稿保留':error.message})};}
  }),
  summary:()=>serialize(async()=>{const {snapshot}=await readFollowup(env);return {revision:snapshot.revision,products:snapshot.data.products.length,events:snapshot.data.events.length,docs:Object.keys(snapshot.data.trackerV1?.docs||{}).length};})
 };
}

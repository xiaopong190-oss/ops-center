import {DatabaseSync} from 'node:sqlite';
import {stageQueryIndex} from './logistics-query-store.mjs';
import {publishQueryProjection} from '../deploy/publish-query-projection.mjs';
export function createQueryDatabase(){
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE records(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
 let reads=0;
 const DB={
  prepare(text){return {bind(...args){return {
   async first(){reads++;return sql.prepare(text).get(...args)||null},
   async all(){reads++;return {results:sql.prepare(text).all(...args)}},
   async run(){const result=sql.prepare(text).run(...args);return {meta:{changes:result.changes}}}
  }}}},
  async batch(statements){
   sql.exec('BEGIN');
   try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results}
   catch(error){sql.exec('ROLLBACK');throw error}
  }
 };
 const env={DB,ENCRYPTION_KEY:Buffer.alloc(32,17).toString('base64')};
 return {env,sql,reads:()=>reads,close:()=>sql.close()};
}
export async function installQuerySnapshot(env,snapshot,sourceSha,now){
 return publishQueryProjection(snapshot,sourceSha,now.toISOString(),options=>stageQueryIndex(new Request('https://worker/query-build',options),env,async()=>sourceSha,now),now);
}

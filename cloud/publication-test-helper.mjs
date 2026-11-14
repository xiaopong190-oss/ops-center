import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {workspaceUpload} from './workspace-upload.mjs';
import {publicationRunner as workspaceRunner} from './publication-runner.mjs';
import {runnerIdentity,RUNNER_AUDIENCE} from './workspace-runner-auth.mjs';
import {publishSnapshot,blobHash} from '../deploy/publish-logistics-snapshot.mjs';
import {buildIncremental} from '../deploy/snapshot-incremental.mjs';
import {createGitHubClient} from '../deploy/workspace-github-client.mjs';
import {publishWorkspace,decryptWorkspace,displayData} from './logistics-workspace.mjs';
import Delta from '../tools/logistics-workspace/record-delta.js';
import {assembleShards} from './workspace-shards.mjs';
import {logisticsWorkspace} from './logistics-workspace.mjs';
import {logisticsQuery} from './logistics-query-store.mjs';
import {verifyQueryRead} from '../deploy/publish-query-projection.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),root='data/logistics/workspace-snapshot.enc.json';
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE records(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
 const DB={prepare(query){let args=[];return {bind(...x){args=x;return this},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return sql.prepare(query).run(...args)}}}};
 let batches=Promise.resolve();DB.batch=statements=>{const work=batches.then(async()=>{sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}});batches=work.catch(()=>{});return work};
 sql.prepare('INSERT INTO records(key,value) VALUES(?,?)').run('global-config.json',JSON.stringify({data:{staff:[{name:'synthetic-owner',canEdit:true}]}}));
 const env={DB,PUBLICATION_RELIABLE:'1',ONLINE_QUERY_ENABLED:'1',LOGISTICS_GITHUB_TOKEN:'synthetic-only',ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64'),WORKSPACE_COMMIT_RUNNER:'github-actions'},blobs=new Map(),files=new Map(),trees=new Map(),commits=new Map();let head='a'.repeat(40),sequence=0,ticket=null,dispatches=0,rootWrites=0,largestRequest=0,largestPart=0,loseRef=false,corruptBlob=false;
 const newSha=()=>createHash('sha1').update('synthetic-'+(++sequence)).digest('hex');
 const github=async(path,options={})=>{
  const b=options.body;
  if(path==='git/blobs'){const bytes=Buffer.from(b.content,'base64'),h=blobHash(bytes);blobs.set(h,bytes);return {sha:h}}
  if(path.startsWith('git/blobs/')){const bytes=blobs.get(path.slice(10));if(corruptBlob){corruptBlob=false;return {encoding:'base64',content:Buffer.from('tampered').toString('base64')}}return {encoding:'base64',content:bytes.toString('base64')}}
  if(path==='git/ref/heads/main')return {object:{sha:head}};
  if(path.startsWith('contents/')){const name=path.slice(9).split('?')[0],h=files.get(name);return h?{sha:h,size:blobs.get(h).length,encoding:'base64',content:blobs.get(h).toString('base64')}:null}
  if(path.startsWith('git/commits/'))return {tree:{sha:commits.get(path.slice(12))?.tree||'base-tree'}};
  if(path==='git/trees'){const h=newSha();trees.set(h,b.tree);return {sha:h}}
  if(path==='git/commits'){const h=newSha();commits.set(h,b);return {sha:h}}
  if(path==='git/refs/heads/main'){
   const c=commits.get(b.sha);if(c.parents[0]!==head)throw Object.assign(Error('conflict'),{status:422});const tree=trees.get(c.tree),m=JSON.parse(blobs.get(tree.find(e=>e.path===root).sha));
   const job=JSON.parse(sql.prepare("SELECT value FROM records WHERE key LIKE '_workspace-upload:%:job:%' AND key NOT LIKE '%runner-proof%' AND json_extract(value,'$.runner.operationId')=? ORDER BY rowid DESC LIMIT 1").get(m.operationId).value);assert(job.runner.manifest);assert.equal(job.runner.manifest.hash,m.hash);assert.equal(files.get(root)||null,job.baseSha);
   for(const e of tree)files.set(e.path,e.sha);head=b.sha;rootWrites++;if(loseRef){loseRef=false;throw Error('synthetic lost ref response')}return {object:{sha:head}};
  }
  throw Error('Unexpected GitHub path '+path);
 };
 const send=async(url,options={})=>{
  const path=url.split('/repos/xiaopong190-oss/ops-center/')[1];
  if(path==='dispatches'){dispatches++;ticket=JSON.parse(options.body).client_payload.ticket;return new Response(null,{status:204})}
  if(path.startsWith('contents/')&&options.method==='PUT'){const b=JSON.parse(options.body),name=path.slice(9),bytes=Buffer.from(b.content,'base64'),h=blobHash(bytes);blobs.set(h,bytes);files.set(name,h);return Response.json({content:{sha:h},commit:{sha:head}})}
  const r=await github(path,options);return r?Response.json(r):new Response(null,{status:404});
 };
 const user={id:'synthetic-owner'},id=crypto.randomUUID(),jobKey='_workspace-upload:'+Buffer.from(user.id).toString('base64url')+':job:'+id;
 const upload=input=>workspaceUpload({...input,id},env,user,()=>{throw Error('Free path must not reconstruct the full snapshot in the Worker')},()=>{throw Error('Unexpected full verification')},send);
 const cloudFor=(boundTicket,runId='77')=>async(path,options={})=>{largestRequest=Math.max(largestRequest,Buffer.byteLength(options.body||''));const req=new Request('https://worker/api/logistics-workspace-runner/'+boundTicket+'/'+path,{...options,headers:{...options.headers,Authorization:'Bearer synthetic-oidc'}});const r=await workspaceRunner(req,env,send,async()=>({run_id:runId}));if(path.startsWith('part/'))largestPart=Math.max(largestPart,Number(r.headers.get('Content-Length'))||128*1024);return r};
 const cloud=(...args)=>cloudFor(ticket)(...args);
 const prepare=async(data,baseSha=null,baseContentHash=null)=>{const bytes=Buffer.isBuffer(data)?data:Buffer.from(JSON.stringify(data)),parts=[];for(let i=0;i<bytes.length;i+=128*1024)parts.push(sha(bytes.subarray(i,i+128*1024)));await upload({action:'start',bytes:bytes.length,sha256:sha(bytes),parts,baseSha,baseContentHash});for(let i=0;i<parts.length;i++)await upload({action:'part',index:i,encoding:'gzip',content:gzipSync(bytes.subarray(i*128*1024,(i+1)*128*1024)).toString('base64')});return {parts,bytes}};
 return {sql,env,files,blobs,send,github,cloud,cloudFor,upload,prepare,id,jobKey,ticket:()=>ticket,dispatches:()=>dispatches,rootWrites:()=>rootWrites,largestRequest:()=>largestRequest,largestPart:()=>largestPart,loseRef:()=>{loseRef=true},corruptBlob:()=>{corruptBlob=true}};
}
const row=i=>({companyId:'c',company:'合成物流',country:'美国',warehouse:'ONT8',channel:'海运',price:1000+i,currency:'CNY',unit:'kg',min:10,max:20,date:new Date().toISOString().slice(0,10),terms:'普货',source:'synthetic-'+i});
const snapshot=()=>({space:'real',storage:{'logistics-company-directory-v1':[{id:'c',name:'合成物流',aliases:[]}],'logistics-quotes-v1':{quotes:[row(0)],templates:[]},'logistics-monthly-bills-v1':{rows:[],aliases:{}},'logistics-completed-ratings-v1':[]}});


export {fixture,snapshot,row};

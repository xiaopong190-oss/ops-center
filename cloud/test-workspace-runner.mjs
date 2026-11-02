import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {workspaceUpload} from './workspace-upload.mjs';
import {workspaceRunner} from './workspace-runner.mjs';
import {runnerIdentity,RUNNER_AUDIENCE} from './workspace-runner-auth.mjs';
import {publishSnapshot,blobHash} from '../deploy/publish-logistics-snapshot.mjs';
import {createGitHubClient} from '../deploy/workspace-github-client.mjs';
import {publishWorkspace,decryptWorkspace,displayData} from './logistics-workspace.mjs';
import Delta from '../tools/logistics-workspace/record-delta.js';
import {assembleShards} from './workspace-shards.mjs';
import {logisticsWorkspace} from './logistics-workspace.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),root='data/logistics/workspace-snapshot.enc.json';
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE records(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
 const DB={prepare(query){let args=[];return {bind(...x){args=x;return this},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return sql.prepare(query).run(...args)}}}};
 const env={DB,LOGISTICS_GITHUB_TOKEN:'synthetic-only',ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64'),WORKSPACE_COMMIT_RUNNER:'github-actions'},blobs=new Map(),files=new Map(),trees=new Map(),commits=new Map();let head='a'.repeat(40),sequence=0,ticket=null,dispatches=0,rootWrites=0,largestRequest=0,largestPart=0,loseRef=false,corruptBlob=false;
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
   const job=JSON.parse(sql.prepare("SELECT value FROM records WHERE key LIKE '%job:%' AND key NOT LIKE '%runner-proof%' ORDER BY rowid DESC LIMIT 1").get().value);assert(job.runner.manifest);assert.equal(job.runner.manifest.hash,m.hash);assert.equal(files.get(root)||null,job.baseSha);
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
 const cloud=async(path,options={})=>{largestRequest=Math.max(largestRequest,Buffer.byteLength(options.body||''));const req=new Request('https://worker/api/logistics-workspace-runner/'+ticket+'/'+path,{...options,headers:{...options.headers,Authorization:'Bearer synthetic-oidc'}});const r=await workspaceRunner(req,env,send,async()=>({run_id:'77'}));if(path.startsWith('part/'))largestPart=Math.max(largestPart,Number(r.headers.get('Content-Length'))||128*1024);return r};
 const prepare=async(data,baseSha=null)=>{const bytes=Buffer.isBuffer(data)?data:Buffer.from(JSON.stringify(data)),parts=[];for(let i=0;i<bytes.length;i+=128*1024)parts.push(sha(bytes.subarray(i,i+128*1024)));await upload({action:'start',bytes:bytes.length,sha256:sha(bytes),parts,baseSha});for(let i=0;i<parts.length;i++)await upload({action:'part',index:i,encoding:'gzip',content:gzipSync(bytes.subarray(i*128*1024,(i+1)*128*1024)).toString('base64')});return {parts,bytes}};
 return {sql,env,files,blobs,send,github,cloud,upload,prepare,id,jobKey,ticket:()=>ticket,dispatches:()=>dispatches,rootWrites:()=>rootWrites,largestRequest:()=>largestRequest,largestPart:()=>largestPart,loseRef:()=>{loseRef=true},corruptBlob:()=>{corruptBlob=true}};
}
const row=i=>({companyId:'c',company:'合成物流',country:'美国',warehouse:'ONT8',channel:'海运',price:1000+i,currency:'CNY',unit:'kg',min:10,max:20,date:'2026-10-29',terms:'普货',source:'synthetic-'+i});
const snapshot=()=>({space:'real',storage:{'logistics-company-directory-v1':[{id:'c',name:'合成物流',aliases:[]}],'logistics-quotes-v1':{quotes:[row(0)],templates:[]},'logistics-monthly-bills-v1':{rows:[],aliases:{}},'logistics-completed-ratings-v1':[]}});

test('diagnostic identifies a simulated readback 404 through the complete publisher and preserves old root',async()=>{
 const f=fixture(),logs=[];try{await f.prepare(snapshot());await f.upload({action:'commit'});
 const github=createGitHubClient({token:'synthetic',report:d=>logs.push(d),send:async(url,options)=>{
  const path=url.split('/repos/xiaopong190-oss/ops-center/')[1];if(path.startsWith('git/blobs/'))return new Response(null,{status:404,headers:{'x-github-request-id':'AB12:CD34'}});
  const result=await f.github(path,{...options,...(options.body?{body:JSON.parse(options.body)}:{})});return Response.json(result);
 }});
 await assert.rejects(publishSnapshot({ticket:f.ticket(),cloud:f.cloud,github,delay:async()=>{}}),e=>e.code==='GITHUB_404');
 assert.deepEqual(logs,[{sequence:2,method:'GET',endpoint:'git/blobs/:sha',stage:'part-readback',part:0,kind:'http',status:404,requestId:'AB12:CD34'}]);assert.equal(f.rootWrites(),0);assert.equal(f.files.has(root),false);
 console.log('Synthetic injected failure, not the production cause: '+JSON.stringify(logs[0]));
 }finally{f.sql.close()}
});
test('Free commit dispatches once under concurrent clicks, never assembles whole data and atomically publishes after ciphertext verification',async()=>{
 const f=fixture();try{const d=snapshot();d.storage['logistics-quotes-v1'].quotes=Array.from({length:31113},(_,i)=>({...row(i),source:'synthetic-'+i+'x'.repeat(800)}));d.storage['logistics-quotes-v1'].regionalQuotes=Array.from({length:4091},(_,i)=>({...row(i),regionRaw:'合成区域'+i,source:'synthetic-'+i+'x'.repeat(800)}));d.storage['logistics-quotes-v1'].templates=Array.from({length:571},(_,i)=>({country:'美国',warehouse:'ONT'+i}));
 const target=39973361;d.storage['logistics-quotes-v1'].padding='';const size=Buffer.byteLength(JSON.stringify(d));assert(size<target);d.storage['logistics-quotes-v1'].padding='x'.repeat(target-size);
 const plan=await f.prepare(d);assert.equal(plan.parts.length,305);const [a,b]=await Promise.all([f.upload({action:'commit'}),f.upload({action:'commit'})]);assert(a.pending&&b.pending);assert.equal(f.dispatches(),1);assert.equal(f.rootWrites(),0);
 f.loseRef();const result=await publishSnapshot({ticket:f.ticket(),cloud:f.cloud,github:f.github,delay:async()=>{}});assert(result.receipt.verified);assert.equal(result.receipt.contentHash,sha(plan.bytes));assert.equal(f.rootWrites(),1);assert.equal((await f.upload({action:'commit'})).receipt.sha,result.receipt.sha);
 const m=JSON.parse(f.blobs.get(f.files.get(root))),actual=await decryptWorkspace(m,f.env,f.send);assert.equal(sha(Buffer.from(JSON.stringify(actual))),sha(plan.bytes));assert.equal(actual.storage['logistics-quotes-v1'].quotes.length,31113);assert.equal(actual.storage['logistics-quotes-v1'].regionalQuotes.length,4091);assert.equal(actual.storage['logistics-quotes-v1'].templates.length,571);assert(f.largestRequest()<512*1024+2048);assert(f.largestPart()<=128*1024);
 console.log(JSON.stringify({synthetic:true,transportParts:305,counts:[31113,4091,571],dispatches:f.dispatches(),atomicRootWrites:f.rootWrites(),maxCloudBody:f.largestRequest(),rawBytes:plan.bytes.length}));
 }finally{f.sql.close()}
});
test('frozen legacy delta reuses original uploaded parts and preserves the published baseline',async()=>{
 const f=fixture();try{const base=snapshot(),prior=await publishWorkspace({baseSha:null,operationId:crypto.randomUUID(),data:base},f.env,{id:'synthetic-owner'},f.send);const next=structuredClone(base);next.storage['logistics-quotes-v1'].quotes.push(row(2));const delta=await Delta.create(next,await Delta.index(base));await f.prepare(delta.payload,prior.sha);await f.upload({action:'commit'});const result=await publishSnapshot({ticket:f.ticket(),cloud:f.cloud,github:f.github,delay:async()=>{}});assert(result.receipt.verified);const actual=await decryptWorkspace(JSON.parse(f.blobs.get(f.files.get(root))),f.env,f.send);assert.deepEqual(actual,next)}finally{f.sql.close()}
});

test('publication produces a verified record delta with unchanged records omitted and modified/deleted rows reflected',async()=>{
 const f=fixture();try{
 const base=snapshot();base.storage['logistics-quotes-v1'].quotes=Array.from({length:1200},(_,i)=>({...row(i),source:'virtual-'+i+'x'.repeat(900)}));
 const prior=await publishWorkspace({baseSha:null,operationId:crypto.randomUUID(),data:base},f.env,{id:'synthetic-owner'},f.send);
 const next=structuredClone(base),rows=next.storage['logistics-quotes-v1'].quotes;rows.splice(2,1);rows[0].price=765;rows.push({...row(9000),source:'new'});rows.push({...row(9001),originCity:'宁波'});next.storage['logistics-quotes-v1'].originExcludedQuotes=[{raw:'local evidence'}];const expected=displayData(next);
 await f.prepare(next,prior.sha);await f.upload({action:'commit'});const receipt=await publishSnapshot({ticket:f.ticket(),cloud:f.cloud,github:f.github,delay:async()=>{}});assert(receipt.receipt.verified);
 const manifest=JSON.parse(f.blobs.get(f.files.get(root))),d=manifest.incremental;assert(d);assert(d.bytes<Buffer.byteLength(JSON.stringify(next))/5);assert.equal(d.baseHash,sha(Buffer.from(JSON.stringify(base))));
 const payload=await assembleShards({schemaVersion:2,storage:'encrypted-parts-v1',...d},f.env,{},f.send);assert.equal(payload.changes['logistics-quotes-v1/quotes'].added.length,2);assert.deepEqual(await Delta.apply(base,payload),expected);assert.equal(sha(Buffer.from(JSON.stringify(await Delta.apply(base,payload)))),manifest.hash);
 const result=await (await logisticsWorkspace(new Request('https://worker/api/logistics-workspace'),f.env,{id:'reader'},f.send)).json();assert.deepEqual(result.incremental,d);
 const part=await (await logisticsWorkspace(new Request('https://worker/api/logistics-workspace?page=0&sha='+result.sha+'&delta=1'),f.env,{id:'reader'},f.send)).json();assert.equal(part.hash,d.parts[0]);
 console.log(JSON.stringify({synthetic:true,baselineRows:1200,addedOrChangedValues:2,deltaBytes:d.bytes,fullBytes:Buffer.byteLength(JSON.stringify(next)),deletionApplied:true}));
 }finally{f.sql.close()}
});
test('invalid business data and corrupt GitHub ciphertext cannot replace the previous root',async()=>{
 for(const kind of ['business','ciphertext']){const f=fixture();try{const data=snapshot();if(kind==='business')data.storage['logistics-quotes-v1'].quotes[0].price=-1;await f.prepare(data);await f.upload({action:'commit'});if(kind==='ciphertext')f.corruptBlob();await assert.rejects(publishSnapshot({ticket:f.ticket(),cloud:f.cloud,github:f.github,delay:async()=>{}}));assert.equal(f.rootWrites(),0);assert.equal(f.files.has(root),false)}finally{f.sql.close()}}
});
test('runner endpoints isolate tickets and bind one GitHub run; incomplete proof never authorizes root publication',async()=>{
 const f=fixture();try{await f.prepare(snapshot());await f.upload({action:'commit'});await f.cloud('meta');const wrong=new Request('https://worker/api/logistics-workspace-runner/'+f.ticket()+'/meta');await assert.rejects(workspaceRunner(wrong,f.env,f.send,async()=>({run_id:'88'})),e=>e.status===403);await assert.rejects(f.cloud('ready',{method:'POST',body:JSON.stringify({schemaVersion:2,storage:'encrypted-parts-v1',bytes:1,hash:'a'.repeat(64),parts:['b'.repeat(64)],operationId:f.id,savedAt:new Date().toISOString()})}),e=>e.status===409);assert.equal(f.rootWrites(),0)}finally{f.sql.close()}
});
test('GitHub OIDC requires signed fixed-repository main-branch hosted workflow identity',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...publicKey.export({format:'jwk'}),kid:'synthetic-key',alg:'RS256'},now=Date.now(),claims={iss:'https://token.actions.githubusercontent.com',aud:RUNNER_AUDIENCE,repository:'xiaopong190-oss/ops-center',repository_id:'1254589960',repository_owner_id:'275407039',ref:'refs/heads/main',workflow_ref:'xiaopong190-oss/ops-center/.github/workflows/publish-logistics-snapshot.yml@refs/heads/main',event_name:'workflow_dispatch',runner_environment:'github-hosted',run_id:'77',iat:Math.floor(now/1000),exp:Math.floor(now/1000)+300};
 const token=c=>{const a=Buffer.from(JSON.stringify({alg:'RS256',kid:jwk.kid})).toString('base64url')+'.'+Buffer.from(JSON.stringify(c)).toString('base64url');return a+'.'+sign('RSA-SHA256',Buffer.from(a),privateKey).toString('base64url')},request=t=>new Request('https://worker',{headers:{Authorization:'Bearer '+t}}),send=async url=>{assert.equal(url,'https://token.actions.githubusercontent.com/.well-known/jwks');return Response.json({keys:[jwk]})};
 assert.equal((await runnerIdentity(request(token(claims)),send,now)).run_id,'77');for(const change of [{ref:'refs/heads/evil'},{repository_id:'wrong'},{aud:'wrong'},{workflow_ref:'wrong'},{runner_environment:'self-hosted'},{event_name:'pull_request'},{exp:0}])await assert.rejects(runnerIdentity(request(token({...claims,...change})),send,now),e=>e.status===403);const valid=token(claims),bad=valid.slice(0,valid.lastIndexOf('.')+1)+Buffer.alloc(256).toString('base64url');await assert.rejects(runnerIdentity(request(bad),send,now),e=>e.status===403);
});

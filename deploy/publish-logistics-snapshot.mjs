import Batch from '../tools/logistics-rating/extensions/supplier-quote-batch.js';
import {publishQueryProjection,verifyQueryRead} from './publish-query-projection.mjs';
import {auditDisplay,auditGlobalProviders} from './snapshot-display-audit.mjs';
import {buildIncremental,readPublicationBase} from './snapshot-incremental.mjs';
import {createGitHubClient} from './workspace-github-client.mjs';
import {verifyPublicationProjection,batchScopes,contentDigest,preflightPublicationQuery} from './publication-verification.mjs';
import {createHash,randomBytes} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {displayData} from '../cloud/logistics-workspace.mjs';
import Delta from '../tools/logistics-workspace/record-delta.js';
const endpoint='https://ops-center-cloud.xiaopong190-asin-radar.workers.dev/api/logistics-workspace-runner/';
const rootPath='data/logistics/workspace-snapshot.enc.json',shardPrefix='data/logistics/workspace-parts/',max=64*1024*1024,chunkSize=512*1024;
const hash=b=>createHash('sha256').update(b).digest('hex');
export const blobHash=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const failure=code=>Object.assign(Error(code),{code});
export async function publishSnapshot({ticket,cloud,github,delay=sleep}){
 if(!/^[a-f0-9-]{36}$/i.test(ticket||''))throw failure('INVALID_TICKET');
 const request=async(path,options={})=>{let error;for(let i=0;i<4;i++){try{const r=await cloud(path,options);if(r.ok)return r;const code=r.status===409&&['previous','base','ready'].some(p=>path.startsWith(p))?'PUBLICATION_CONFLICT':'CLOUD_'+r.status;const problem=Object.assign(failure(code),{status:r.status,retryAfter:r.headers.get('Retry-After')});if(r.status<500)throw problem;error=problem}catch(e){error=e;if(e.status&&e.status<500&&![408,429].includes(e.status))throw e;if(e.code==='PUBLICATION_CONFLICT')throw e;if(e.code?.startsWith('CLOUD_')&&Number(e.code.slice(6))<500)throw e}await delay(250*(i+1))}throw error};
 const progress=async n=>request('progress',{method:'POST',headers:{'X-Workspace-Progress':String(n)}});
 const meta=await (await request('meta')).json();
 if(meta.terminal)return {terminal:true,state:meta.jobState,receipt:meta.receipt||null};
 if(meta.reliable&&meta.resume){
  const base=await readPublicationBase(meta.resume.rootSha,request),relations=(await (await request('query-relations')).json()).items;
  await request('committed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rootSha:meta.resume.rootSha})});
  await publishQueryProjection(base,meta.resume.rootSha,meta.resume.manifest.savedAt,options=>request('query-index',options),new Date(),relations,{resume:true});
  const evidence=await verifyPublicationProjection(base,relations,async query=>(await request('query-read?'+query)).json(),new Date(),{known:meta.queryPages,checkpoint:page=>request('query-page',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(page)})});
  await request('verified',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(evidence)});
  return (await request('finish',{method:'POST'})).json();
 }
 if(!Number.isSafeInteger(meta.bytes)||meta.bytes<1||meta.bytes>max||!Array.isArray(meta.parts)||meta.parts.length!==Math.ceil(meta.bytes/(128*1024))||!/^[a-f0-9]{64}$/.test(meta.sha256)||!meta.parts.every(h=>/^[a-f0-9]{64}$/.test(h)))throw failure('INVALID_SOURCE_MANIFEST');
 const source=Buffer.alloc(meta.bytes);
 // At most two bounded reads overlap. Each verified part goes directly into its
 // original offset; no write or publication happens before the full hash check.
 for(let start=0;start<meta.parts.length;start+=2){await Promise.all(Array.from({length:Math.min(2,meta.parts.length-start)},async(_,offset)=>{const i=start+offset,b=Buffer.from(await (await request('part/'+i)).arrayBuffer());if(b.length!==Math.min(128*1024,meta.bytes-i*128*1024)||hash(b)!==meta.parts[i])throw failure('SOURCE_PART_MISMATCH');b.copy(source,i*128*1024)}));if(start%20===0||start+2>=meta.parts.length)await progress(Math.floor(Math.min(start+2,meta.parts.length)/meta.parts.length*35))}
 if(hash(source)!==meta.sha256)throw failure('SOURCE_HASH_MISMATCH');
 let data;try{data=JSON.parse(source.toString('utf8'))}catch{throw failure('SOURCE_JSON_INVALID')}
 if(data?.protocol==='record-delta-v1'){
  const r=await request('base'),raw=Buffer.from(await r.arrayBuffer());let base=null;
  if(r.headers.get('Content-Type')?.includes('application/json')){if(!JSON.parse(raw).empty)throw failure('BASE_INVALID')}
  else{const plain=r.headers.get('X-Workspace-Compression')==='gzip'?gunzipSync(raw,{maxOutputLength:max}):raw;base=JSON.parse(plain)}
  data=await Delta.apply(base,data);
 }
 let scopedBase,publicationScopes=[];
 if(data?.protocol===Batch.protocol){
  if(!/^[a-f0-9]{64}$/.test(data.expectedScope||''))throw failure('BATCH_SCOPE_CONFLICT');
  if(meta.reliable){const latest=await (await request('rebase',{method:'POST'})).json();meta.baseSha=latest.baseSha;meta.baseContentHash=null;}
  scopedBase=await readPublicationBase(meta.baseSha,request);
  if(!scopedBase)throw failure('BATCH_BASE_REQUIRED');
  try{
   const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
   if(!meta.reliable&&await Batch.scopeHash(scopedBase,data,today)!==data.expectedScope)throw Error('scope changed');
   if(meta.reliable){
    // Validate the complete original batch before allowing it to supersede any
    // scope; then omit only scopes already won by a later local confirmation.
    Batch.apply(scopedBase,data,today);
    const resolved=batchScopes(scopedBase,data),decision=await (await request('scopes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scopes:resolved.scopes,batchId:data.id,batchHash:contentDigest([{...data,expectedScope:undefined}])})})).json();
    if(decision.terminal)return {terminal:true,state:'SUPERSEDED'};
    publicationScopes=resolved.scopes.filter(scope=>!decision.superseded.includes(scope));
    data={...data,...Object.fromEntries(['quotes','regionalQuotes'].map(field=>[field,data[field].filter(row=>!decision.superseded.includes(resolved.scope(row,field)))]))};
   }
   data=Batch.apply(scopedBase,data,today);
  }
  catch{throw failure('BATCH_SCOPE_CONFLICT');}
 }
 // Preserve the same full server-side business validation and display projection.
 let published;try{published=displayData(data)}catch{throw failure('BUSINESS_VALIDATION_FAILED')}const plain=Buffer.from(JSON.stringify(published));if(plain.length<1||plain.length>max)throw failure('SNAPSHOT_SIZE_INVALID');
 let projectionPlan;if(meta.reliable&&meta.onlineQuery){const relations=await (await request('query-relations')).json();try{projectionPlan=preflightPublicationQuery(published,relations.items)}catch{throw failure('QUERY_VALIDATION_FAILED')}}
 if(meta.reliable&&!scopedBase){publicationScopes=['__full-master__'];await request('scopes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scopes:publicationScopes})});}
 if(meta.reliable&&projectionPlan){const q=published.storage['logistics-quotes-v1'],scopeCounts=Object.fromEntries(publicationScopes.map(scope=>[scope,scope==='__full-master__'?projectionPlan.totalVisible:projectionPlan.scopeCounts[scope]||0]));await request('projection-plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scopeCounts,hasIncomingQuotes:!!(q.quotes.length+(q.regionalQuotes||[]).length)})});}
 const incremental=await buildIncremental(published,meta.baseSha,request,meta.baseContentHash,scopedBase);
 const manifest={publicationSafety:'verified-base-v1',schemaVersion:2,storage:'encrypted-parts-v1',bytes:plain.length,hash:hash(plain),parts:[],operationId:meta.operationId,savedAt:new Date().toISOString()},entries=[];
 const fullParts=Math.ceil(plain.length/chunkSize),deltaParts=incremental?Math.ceil(incremental.bytes.length/chunkSize):0;
 if(incremental)manifest.incremental={baseHash:incremental.baseHash,bytes:incremental.bytes.length,hash:hash(incremental.bytes),parts:[]};
 for(let i=0;i<fullParts+deltaParts;i++){
  const delta=i>=fullParts,index=delta?i-fullParts:i,source=delta?incremental.bytes:plain;
  const bytes=source.subarray(index*chunkSize,Math.min((index+1)*chunkSize,source.length)),h=hash(bytes),packed=gzipSync(bytes);
  if(meta.reliable){const reused=await (await request('reuse/'+i,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hash:h,bytes:bytes.length})})).json();if(reused.reused){if(reused.hash!==h||reused.bytes!==bytes.length||!/^[a-f0-9]{40}$/.test(reused.blobSha||''))throw failure('RESTORED_PART_NOT_VERIFIED');entries.push({path:shardPrefix+h+'.enc.json',mode:'100644',type:'blob',sha:reused.blobSha});(delta?manifest.incremental.parts:manifest.parts).push(h);await progress(35+Math.floor((i+1)/(fullParts+deltaParts)*55));continue;}}
  const encrypted=Buffer.from(await (await request('seal/'+i,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Plain-Hash':h,'X-Plain-Bytes':String(bytes.length)},body:packed})).arrayBuffer());
  let envelope;try{envelope=JSON.parse(encrypted)}catch{throw failure('ENVELOPE_INVALID')}if(typeof envelope.iv!=='string'||typeof envelope.content!=='string')throw failure('ENVELOPE_INVALID');
  // GitHub blob readback happens before publishing the root. Plaintext is never
  // written to the checkout, logs, artifacts, caches or repository.
  await delay(900);
  const stored=await github('git/blobs',{method:'POST',stage:'part-write',part:i,body:{encoding:'base64',content:encrypted.toString('base64')}});
  if(stored.sha!==blobHash(encrypted))throw failure('BLOB_WRITE_MISMATCH');
  const back=await github('git/blobs/'+stored.sha,{stage:'part-readback',part:i});if(back.encoding!=='base64')throw failure('BLOB_ENCODING_INVALID');const actual=Buffer.from(back.content.replace(/\s/g,''),'base64');if(!actual.equals(encrypted)||blobHash(actual)!==stored.sha)throw failure('BLOB_READBACK_MISMATCH');
  await request('verify/'+i,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:actual});
  entries.push({path:shardPrefix+h+'.enc.json',mode:'100644',type:'blob',sha:stored.sha});(delta?manifest.incremental.parts:manifest.parts).push(h);await progress(35+Math.floor((i+1)/(fullParts+deltaParts)*55));
 }
 await request('ready',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(manifest)});
 const rootBytes=Buffer.from(JSON.stringify(manifest)+'\n'),rootBlob=await github('git/blobs',{method:'POST',stage:'root-write',body:{encoding:'base64',content:rootBytes.toString('base64')}});if(rootBlob.sha!==blobHash(rootBytes))throw failure('ROOT_BLOB_MISMATCH');
 // A compare-and-swap branch update publishes all parts and the root together.
 // A competing publication may advance main, but never gets overwritten.
 let committed=false,committedSha=null;
 if(meta.reliable)await request('commit-intent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rootSha:rootBlob.sha})});
 for(let attempt=0;attempt<3;attempt++){
  const ref=await github('git/ref/heads/main',{stage:'branch-read'}),head=ref.object.sha,prior=await github('contents/'+rootPath+'?ref='+head,{allow404:true,stage:'baseline-read'});if((prior?.sha||null)!==meta.baseSha)throw failure('PUBLICATION_CONFLICT');
  const current=await github('git/commits/'+head,{stage:'commit-read'}),tree=await github('git/trees',{method:'POST',stage:'tree-write',body:{base_tree:current.tree.sha,tree:[...new Map(entries.map(e=>[e.path,e])).values(),{path:rootPath,mode:'100644',type:'blob',sha:rootBlob.sha}]}}),commit=await github('git/commits',{method:'POST',stage:'commit-write',body:{message:'Publish verified encrypted logistics snapshot',tree:tree.sha,parents:[head]}});
  if(meta.reliable)await request('guard',{method:'POST'});
  try{await github('git/refs/heads/main',{method:'PATCH',stage:'branch-update',body:{sha:commit.sha,force:false}});committed=true;committedSha=commit.sha;break}catch(error){if(![409,422].includes(error.status)){const actual=await github('contents/'+rootPath+'?ref=main',{allow404:true,stage:'root-readback'});if(actual?.sha===rootBlob.sha){committed=true;committedSha=commit.sha;break}throw error}}
 }
 if(!committed)throw failure('BRANCH_CONFLICT');
 if(meta.reliable)await request('committed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rootSha:rootBlob.sha,commitSha:committedSha})});
 if(meta.onlineQuery){const relations=await (await request('query-relations')).json();await publishQueryProjection(published,rootBlob.sha,manifest.savedAt,options=>request('query-index',options),new Date(),relations.items,{resume:meta.reliable});if(meta.reliable){const evidence=await verifyPublicationProjection(published,relations.items,async query=>(await request('query-read?'+query)).json(),new Date(),{known:meta.queryPages,checkpoint:page=>request('query-page',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(page)})});await request('verified',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(evidence)});}}
 const receipt=await (await request('finish',{method:'POST'})).json();if(!receipt.receipt?.verified||receipt.receipt.contentHash!==meta.sha256)throw failure('RECEIPT_NOT_VERIFIED');return receipt;
}
async function main(){
 const ticket=process.env.WORKSPACE_TICKET;if(!(['self-test','audit-read','query-rebuild'].includes(ticket)||/^[a-f0-9-]{36}$/i.test(ticket||''))||!process.env.GITHUB_TOKEN||!process.env.ACTIONS_ID_TOKEN_REQUEST_URL||!process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)throw failure('WORKFLOW_ENV_MISSING');
 let token=null,tokenAt=0;
 async function identity(){if(!token||Date.now()-tokenAt>120000){const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);url.searchParams.set('audience','ops-center-logistics-publisher');const r=await fetch(url,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw failure('OIDC_REQUEST_FAILED');token=(await r.json()).value;tokenAt=Date.now();if(typeof token!=='string')throw failure('OIDC_RECEIPT_INVALID')}return token}
 const cloud=async(path,options={})=>fetch(endpoint+ticket+'/'+path,{...options,headers:{...options.headers,Authorization:'Bearer '+await identity()},redirect:'error',signal:AbortSignal.timeout(60000)});
 if(ticket==='query-rebuild'){
  const queryRequest=async(path,options={})=>fetch(endpoint+path,{...options,headers:{...options.headers,Authorization:'Bearer '+await identity()},redirect:'error',signal:AbortSignal.timeout(60000)});
  const authorized=async(path,options={})=>{const response=await queryRequest(path,options);if(!response.ok)throw failure('QUERY_REBUILD_HTTP_'+response.status);return response};
  const smoke=async()=>console.log('Verified online query reads: '+JSON.stringify(await verifyQueryRead(async query=>(await authorized('query-read?'+query)).json())));
  const status=await (await authorized('query-status')).json();if(status.ready){await smoke();console.log('Current online query index already verified.');return;}
  const result=await (await authorized('audit-read')).json();let data=result.data;
  if(result.paged){const chunks=[];for(let i=0;i<result.paged.parts.length;i++){const part=await (await authorized('audit-read?page='+i+'&sha='+result.sha)).json(),bytes=Buffer.from(part.content,'base64');if(part.sha!==result.sha||hash(bytes)!==result.paged.parts[i])throw failure('QUERY_SOURCE_PART_MISMATCH');chunks.push(bytes)}const bytes=Buffer.concat(chunks);if(bytes.length!==result.paged.bytes||hash(bytes)!==result.paged.hash)throw failure('QUERY_SOURCE_HASH_MISMATCH');data=JSON.parse(bytes);}
  const relations=await (await authorized('query-relations')).json();
  const projection=await publishQueryProjection(displayData(data),result.sha,result.savedAt||new Date().toISOString(),options=>queryRequest('query-index',options),new Date(),relations.items);
  await smoke();console.log('Online query projection verified: '+JSON.stringify({sourceSha:projection.sourceSha,days:projection.days,counts:projection.counts,parts:projection.parts}));return;
 }
 if(ticket==='audit-read'){
  async function read(query=''){let last;for(let attempt=0;attempt<3;attempt++){const r=await fetch(endpoint+'audit-read'+query,{headers:{Authorization:'Bearer '+await identity()},redirect:'error',signal:AbortSignal.timeout(60000)});if(r.ok)return r.json();last=r.status;await sleep(1000)}throw failure('DISPLAY_READ_HTTP_'+last)}
  const result=await read();let data=result.data;
  if(result.paged){const m=result.paged,chunks=[];for(let i=0;i<m.parts.length;i++){const p=await read('?page='+i+'&sha='+result.sha),b=Buffer.from(p.content,'base64');if(p.sha!==result.sha||p.hash!==m.parts[i]||hash(b)!==m.parts[i])throw failure('DISPLAY_PART_MISMATCH');chunks.push(b)}const bytes=Buffer.concat(chunks);if(bytes.length!==m.bytes||hash(bytes)!==m.hash)throw failure('DISPLAY_FULL_MISMATCH');data=JSON.parse(bytes)}
  const checked=displayData(data),s=checked.storage,q=s['logistics-quotes-v1'];console.log('Verified display read: '+JSON.stringify({sha:result.sha,counts:{quotes:q.quotes.length,regional:q.regionalQuotes?.length||0,templates:q.templates.length,bills:s['logistics-monthly-bills-v1'].rows.length,ratings:s['logistics-completed-ratings-v1'].length}}));console.log('Verified display distribution: '+JSON.stringify(auditDisplay(checked)));
  const queryRead=async query=>{const r=await fetch(endpoint+'query-read?'+query,{headers:{Authorization:'Bearer '+await identity()},redirect:'error',signal:AbortSignal.timeout(60000)});if(!r.ok)throw failure('QUERY_AUDIT_HTTP_'+r.status);return r.json()};
  console.log('Verified global provider query: '+JSON.stringify(await auditGlobalProviders(queryRead)));return;
 }
 if(ticket==='self-test'){
  const auth={Authorization:'Bearer '+await identity()};let ready;for(let i=0;i<4;i++){ready=await fetch(endpoint+'self-test',{headers:auth,redirect:'error',signal:AbortSignal.timeout(30000)});if(ready.ok)break;const text=await ready.text();console.log('Self-test transport status: '+ready.status+'; response class: '+(text.includes('RUNNER_JWKS_NETWORK')?'JWKS_NETWORK':text.includes('RUNNER_JWKS_HTTP_')?'JWKS_HTTP':text.includes('RUNNER_JWKS_JSON')?'JWKS_JSON':text.includes('后台发布身份无效')?'OIDC_REJECTED':text.includes('Worker exceeded')?'WORKER_RESOURCE':text.includes('cloudflare')?'CLOUDFLARE_GATEWAY':text.includes('服务请求失败')?'WORKER_EXCEPTION':'OTHER')+'; content type: '+(ready.headers.get('content-type')?.includes('json')?'JSON':'NON_JSON'));await sleep(1000)}if(!ready.ok)throw failure('SELF_TEST_IDENTITY_HTTP_'+ready.status);
  const packed=gzipSync(randomBytes(chunkSize));let ok=false;for(let i=0;i<4;i++){const r=await fetch(endpoint+'self-test',{method:'POST',headers:auth,body:packed,redirect:'error',signal:AbortSignal.timeout(30000)});if(r.ok){const result=await r.json();if(result.ok&&result.hash===hash(packed)&&result.bytes===packed.length){ok=true;break}}await sleep(1000)}if(!ok)throw failure('SELF_TEST_CPU_OR_CRYPTO_FAILED');console.log('Free Worker identity and 512 KiB high-entropy encryption roundtrip verified. No publication task or business data was accessed.');return;
 }
 const github=createGitHubClient({token:process.env.GITHUB_TOKEN});
 try{const result=await publishSnapshot({ticket,cloud,github});console.log(result.terminal?'Publication task ended: '+result.state:'Verified encrypted snapshot publication completed.')}catch(error){try{await cloud('failed',{method:'POST',headers:{'X-Workspace-Failure':/^[A-Z_0-9]{1,80}$/.test(error.code||'')?error.code:'RUNNER_FAILED',...(error.retryAfter?{'X-Workspace-Retry-After':String(error.retryAfter)}:{})}})}catch{}console.error('Snapshot publication failed: '+(/^[A-Z_0-9]+$/.test(error.code||'')?error.code:'VALIDATION_OR_PROCESSING'));process.exitCode=1}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error('Snapshot publisher initialization failed: '+(/^[A-Z_0-9]+$/.test(error.code||'')?error.code:'INITIALIZATION'));process.exitCode=1});

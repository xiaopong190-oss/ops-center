import {createHash,randomBytes} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {displayData} from '../cloud/logistics-workspace.mjs';
import Delta from '../tools/logistics-workspace/record-delta.js';
const endpoint='https://ops-center-cloud.xiaopong190-asin-radar.workers.dev/api/logistics-workspace-runner/';
const api='https://api.github.com/repos/xiaopong190-oss/ops-center/';
const rootPath='data/logistics/workspace-snapshot.enc.json',shardPrefix='data/logistics/workspace-parts/',max=64*1024*1024,chunkSize=512*1024;
const hash=b=>createHash('sha256').update(b).digest('hex');
export const blobHash=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const failure=code=>Object.assign(Error(code),{code});
export async function publishSnapshot({ticket,cloud,github,delay=sleep}){
 if(!/^[a-f0-9-]{36}$/i.test(ticket||''))throw failure('INVALID_TICKET');
 const request=async(path,options={})=>{let error;for(let i=0;i<4;i++){try{const r=await cloud(path,options);if(r.ok)return r;const code='CLOUD_'+r.status;if(r.status<500)throw failure(code);error=failure(code)}catch(e){error=e;if(e.code?.startsWith('CLOUD_')&&Number(e.code.slice(6))<500)throw e}await delay(250*(i+1))}throw error};
 const progress=async n=>request('progress',{method:'POST',headers:{'X-Workspace-Progress':String(n)}});
 const meta=await (await request('meta')).json();
 if(!Number.isSafeInteger(meta.bytes)||meta.bytes<1||meta.bytes>max||!Array.isArray(meta.parts)||meta.parts.length!==Math.ceil(meta.bytes/(128*1024))||!/^[a-f0-9]{64}$/.test(meta.sha256)||!meta.parts.every(h=>/^[a-f0-9]{64}$/.test(h)))throw failure('INVALID_SOURCE_MANIFEST');
 const source=Buffer.alloc(meta.bytes);
 // Sequential bounded downloads avoid retaining separate copies of every part.
 for(let i=0;i<meta.parts.length;i++){const b=Buffer.from(await (await request('part/'+i)).arrayBuffer());if(b.length!==Math.min(128*1024,meta.bytes-i*128*1024)||hash(b)!==meta.parts[i])throw failure('SOURCE_PART_MISMATCH');b.copy(source,i*128*1024);if(i%20===0)await progress(Math.floor(i/meta.parts.length*35))}
 if(hash(source)!==meta.sha256)throw failure('SOURCE_HASH_MISMATCH');
 let data;try{data=JSON.parse(source.toString('utf8'))}catch{throw failure('SOURCE_JSON_INVALID')}
 if(data?.protocol==='record-delta-v1'){
  const r=await request('base'),raw=Buffer.from(await r.arrayBuffer());let base=null;
  if(r.headers.get('Content-Type')?.includes('application/json')){if(!JSON.parse(raw).empty)throw failure('BASE_INVALID')}
  else{const plain=r.headers.get('X-Workspace-Compression')==='gzip'?gunzipSync(raw,{maxOutputLength:max}):raw;base=JSON.parse(plain)}
  data=await Delta.apply(base,data);
 }
 // Preserve the same full server-side business validation and display projection.
 const plain=Buffer.from(JSON.stringify(displayData(data)));if(plain.length<1||plain.length>max)throw failure('SNAPSHOT_SIZE_INVALID');
 const manifest={schemaVersion:2,storage:'encrypted-parts-v1',bytes:plain.length,hash:hash(plain),parts:[],operationId:meta.operationId,savedAt:new Date().toISOString()},entries=[];
 for(let i=0;i<Math.ceil(plain.length/chunkSize);i++){
  const bytes=plain.subarray(i*chunkSize,Math.min((i+1)*chunkSize,plain.length)),h=hash(bytes),packed=gzipSync(bytes);
  const encrypted=Buffer.from(await (await request('seal/'+i,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Plain-Hash':h,'X-Plain-Bytes':String(bytes.length)},body:packed})).arrayBuffer());
  let envelope;try{envelope=JSON.parse(encrypted)}catch{throw failure('ENVELOPE_INVALID')}if(typeof envelope.iv!=='string'||typeof envelope.content!=='string')throw failure('ENVELOPE_INVALID');
  // GitHub blob readback happens before publishing the root. Plaintext is never
  // written to the checkout, logs, artifacts, caches or repository.
  await delay(900);
  const stored=await github('git/blobs',{method:'POST',body:{encoding:'base64',content:encrypted.toString('base64')}});
  if(stored.sha!==blobHash(encrypted))throw failure('BLOB_WRITE_MISMATCH');
  const back=await github('git/blobs/'+stored.sha);if(back.encoding!=='base64')throw failure('BLOB_ENCODING_INVALID');const actual=Buffer.from(back.content.replace(/\s/g,''),'base64');if(!actual.equals(encrypted)||blobHash(actual)!==stored.sha)throw failure('BLOB_READBACK_MISMATCH');
  await request('verify/'+i,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:actual});
  entries.push({path:shardPrefix+h+'.enc.json',mode:'100644',type:'blob',sha:stored.sha});manifest.parts.push(h);await progress(35+Math.floor((i+1)/Math.ceil(plain.length/chunkSize)*55));
 }
 await request('ready',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(manifest)});
 const rootBytes=Buffer.from(JSON.stringify(manifest)+'\n'),rootBlob=await github('git/blobs',{method:'POST',body:{encoding:'base64',content:rootBytes.toString('base64')}});if(rootBlob.sha!==blobHash(rootBytes))throw failure('ROOT_BLOB_MISMATCH');
 // A compare-and-swap branch update publishes all parts and the root together.
 // A competing publication may advance main, but never gets overwritten.
 let committed=false;
 for(let attempt=0;attempt<3;attempt++){
  const ref=await github('git/ref/heads/main'),head=ref.object.sha,prior=await github('contents/'+rootPath+'?ref='+head,{allow404:true});if((prior?.sha||null)!==meta.baseSha)throw failure('PUBLICATION_CONFLICT');
  const current=await github('git/commits/'+head),tree=await github('git/trees',{method:'POST',body:{base_tree:current.tree.sha,tree:[...new Map(entries.map(e=>[e.path,e])).values(),{path:rootPath,mode:'100644',type:'blob',sha:rootBlob.sha}]}}),commit=await github('git/commits',{method:'POST',body:{message:'Publish verified encrypted logistics snapshot',tree:tree.sha,parents:[head]}});
  try{await github('git/refs/heads/main',{method:'PATCH',body:{sha:commit.sha,force:false}});committed=true;break}catch(error){if(![409,422].includes(error.status)){const actual=await github('contents/'+rootPath+'?ref=main',{allow404:true});if(actual?.sha===rootBlob.sha){committed=true;break}throw error}}
 }
 if(!committed)throw failure('BRANCH_CONFLICT');
 const receipt=await (await request('finish',{method:'POST'})).json();if(!receipt.receipt?.verified||receipt.receipt.contentHash!==meta.sha256)throw failure('RECEIPT_NOT_VERIFIED');return receipt;
}
async function main(){
 const ticket=process.env.WORKSPACE_TICKET;if(!(ticket==='self-test'||/^[a-f0-9-]{36}$/i.test(ticket||''))||!process.env.GITHUB_TOKEN||!process.env.ACTIONS_ID_TOKEN_REQUEST_URL||!process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)throw failure('WORKFLOW_ENV_MISSING');
 let token=null,tokenAt=0;
 async function identity(){if(!token||Date.now()-tokenAt>120000){const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);url.searchParams.set('audience','ops-center-logistics-publisher');const r=await fetch(url,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw failure('OIDC_REQUEST_FAILED');token=(await r.json()).value;tokenAt=Date.now();if(typeof token!=='string')throw failure('OIDC_RECEIPT_INVALID')}return token}
 const cloud=async(path,options={})=>fetch(endpoint+ticket+'/'+path,{...options,headers:{...options.headers,Authorization:'Bearer '+await identity()},redirect:'error',signal:AbortSignal.timeout(60000)});
 if(ticket==='self-test'){
  const auth={Authorization:'Bearer '+await identity()},ready=await fetch(endpoint+'self-test',{headers:auth,redirect:'error'});if(!ready.ok)throw failure('SELF_TEST_IDENTITY_FAILED');
  const packed=gzipSync(randomBytes(chunkSize));let ok=false;for(let i=0;i<4;i++){const r=await fetch(endpoint+'self-test',{method:'POST',headers:auth,body:packed,redirect:'error',signal:AbortSignal.timeout(30000)});if(r.ok){const result=await r.json();if(result.ok&&result.hash===hash(packed)&&result.bytes===packed.length){ok=true;break}}await sleep(1000)}if(!ok)throw failure('SELF_TEST_CPU_OR_CRYPTO_FAILED');console.log('Free Worker identity and 512 KiB high-entropy encryption roundtrip verified. No publication task or business data was accessed.');return;
 }
 const github=async(path,{method='GET',body,allow404=false}={})=>{const r=await fetch(api+path,{method,headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'ops-center-snapshot-publisher'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(60000)});if(allow404&&r.status===404)return null;if(!r.ok)throw Object.assign(failure('GITHUB_'+r.status),{status:r.status});return r.json()};
 try{await publishSnapshot({ticket,cloud,github});console.log('Verified encrypted snapshot publication completed.')}catch(error){try{await cloud('failed',{method:'POST'})}catch{}console.error('Snapshot publication failed: '+(/^[A-Z_0-9]+$/.test(error.code||'')?error.code:'VALIDATION_OR_PROCESSING'));process.exitCode=1}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Snapshot publisher initialization failed.');process.exitCode=1});

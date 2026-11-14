// Disposable, verified attempt checkpoints. Final commit/receipt evidence is
// separate and immutable; losing a checkpoint only costs recomputation.
import {Buffer} from 'node:buffer';
import {gunzipSync} from 'node:zlib';
import {RUNNER_REPO} from './workspace-runner-auth.mjs';
import {readRecord} from './publication-jobs.mjs';
const hash=async b=>Buffer.from(await crypto.subtle.digest('SHA-256',b)).toString('hex');
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
const chunkKey=(job,h)=>'_publication-v2:chunk:'+job.id+':'+h;
const pagesPrefix=(job,version)=>'_publication-v2:query-page:'+job.id+':'+version+':';
export async function knownQueryPages(env,job,view,day){
 if(!view||view.sourceSha!==job.commit?.rootSha||!(view.days||[view.day]).includes(day))return [];
 const prefix=pagesPrefix(job,view.version+'@'+day),rows=await env.DB.prepare('SELECT value FROM records WHERE key>=? AND key<? LIMIT 10000').bind(prefix,prefix+'\uffff').all();return rows.results.map(r=>JSON.parse(r.value));
}
export async function recordChunkCheckpoint(env,job,proof,put){
 if(!proof?.verified||!/^[a-f0-9]{40}$/.test(proof.blobSha||''))return;
 const keyId=await hash(Buffer.from(env.ENCRYPTION_KEY,'base64'));
 await put(chunkKey(job,proof.hash),{...proof,sourceHash:job.contentHash,keyId});
}
export async function reuseChunk(req,env,{job,index,send,put,proofKey}){
 const input=await req.json();if(!Number.isInteger(index)||index<0||index>=256||!/^[a-f0-9]{64}$/.test(input.hash||'')||!Number.isSafeInteger(input.bytes)||input.bytes<1||input.bytes>512*1024)fail(400,'恢复分片参数无效');
 const saved=await readRecord(env,chunkKey(job,input.hash));
 if(!saved||saved.sourceHash!==job.contentHash||saved.bytes!==input.bytes||saved.keyId!==await hash(Buffer.from(env.ENCRYPTION_KEY,'base64')))return {reused:false};
 const response=await send('https://api.github.com/repos/'+RUNNER_REPO+'/git/blobs/'+saved.blobSha,{headers:{Authorization:'Bearer '+env.LOGISTICS_GITHUB_TOKEN,Accept:'application/vnd.github+json','User-Agent':'hangxu-publication-recovery'},redirect:'manual',signal:AbortSignal.timeout(30000)});
 if(response.status===404)return {reused:false};if(!response.ok)fail(503,'GitHub恢复分片暂不可读，原任务保留');
 const item=await response.json();if(item.encoding!=='base64'||typeof item.content!=='string'||item.content.length>1100000)fail(502,'GitHub恢复分片格式无效');
 const raw=Buffer.from(item.content.replace(/\s/g,''),'base64');if(await hash(raw)!==saved.envelopeHash)fail(502,'GitHub恢复分片密文摘要不一致');
 let envelope,plain;try{envelope=JSON.parse(raw);const key=await crypto.subtle.importKey('raw',Buffer.from(env.ENCRYPTION_KEY,'base64'),'AES-GCM',false,['decrypt']),packed=Buffer.from(await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(envelope.iv,'base64'),additionalData:Buffer.from('logistics-workspace-shard-v1')},key,Buffer.from(envelope.content,'base64')));if(await hash(packed)!==saved.packedHash)throw Error('packed');plain=gunzipSync(packed,{maxOutputLength:512*1024});}catch{fail(502,'GitHub恢复分片解密校验失败');}
 if(plain.length!==input.bytes||await hash(plain)!==input.hash)fail(502,'GitHub恢复分片业务内容不一致');
 await put(proofKey(index),{...saved,expires:Number.MAX_SAFE_INTEGER});return {reused:true,blobSha:saved.blobSha,hash:input.hash,bytes:input.bytes};
}
export async function recordQueryPage(req,env,{job,view,day,put}){
 const proof=await req.json();
 if(proof.version!==view?.version+'@'+day||proof.sourceSha!==job.commit?.rootSha||view?.sourceSha!==job.commit.rootSha||!/^((quotes|regional)-(price|strict)|warehouses|bills|ratings)\|(?:\d{4}-\d{2})?\|\d+$/.test(proof.pageKey||'')||!/^[a-f0-9]{64}$/.test(proof.hash||'')||!Number.isSafeInteger(proof.rows)||proof.rows<0||proof.rows>100)fail(409,'分页核验证据与当前版本不一致');
 const key=pagesPrefix(job,proof.version)+proof.pageKey,prior=await readRecord(env,key);
 if(prior&&(prior.hash!==proof.hash||prior.rows!==proof.rows))fail(409,'同一查询版本的分页内容发生变化');
 if(!prior)await put(key,proof);return {ok:true};
}

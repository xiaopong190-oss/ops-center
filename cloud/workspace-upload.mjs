import Delta from '../tools/logistics-workspace/record-delta.js';
import {backgroundCommit} from './workspace-runner.mjs';
// Resumable transport only. The published GitHub snapshot remains the source of truth.
import {Buffer} from 'node:buffer';
import {gunzipSync} from 'node:zlib';
export const PART_BYTES=128*1024, MAX_BYTES=64*1024*1024;
const hash=b=>crypto.subtle.digest('SHA-256',b).then(x=>Buffer.from(x).toString('hex'));
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
async function seal(bytes,env,aad){const key=await crypto.subtle.importKey('raw',Buffer.from(env.ENCRYPTION_KEY||'','base64'),'AES-GCM',false,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12));return {iv:Buffer.from(iv).toString('base64'),content:Buffer.from(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:Buffer.from(aad)},key,bytes)).toString('base64')}}
async function open(value,env,aad){try{const key=await crypto.subtle.importKey('raw',Buffer.from(env.ENCRYPTION_KEY||'','base64'),'AES-GCM',false,['decrypt']);return Buffer.from(await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(value.iv,'base64'),additionalData:Buffer.from(aad)},key,Buffer.from(value.content,'base64')))}catch{fail(502,'暂存分片校验失败，请重新上传该分片')}}
export async function workspaceUpload(input,env,user,publish,verify,runnerSend=fetch){
 if(!user||typeof user.id!=='string'||!user.id)fail(401,'请先登录运营中心');if(user.canEdit===false&&user.auth!=='super')fail(403,'此账号只允许查看展示端');
 if(!env.DB||!env.LOGISTICS_GITHUB_TOKEN||Buffer.from(env.ENCRYPTION_KEY||'','base64').length!==32)fail(503,'分片发布服务未配置，本机数据保留');
 const {action,id}=input;if(!/^[a-f0-9-]{36}$/i.test(id||''))fail(400,'上传编号无效');
 const prefix='_workspace-upload:'+Buffer.from(String(user.id)).toString('base64url')+':',jobKey=prefix+'job:'+id;
 const get=async key=>{const row=await env.DB.prepare('SELECT value FROM records WHERE key=?').bind(key).first();return row?JSON.parse(row.value):null};
 const put=(key,value)=>env.DB.prepare('INSERT INTO records(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(value)).run();
 const readMany=async keys=>{const found=new Map();for(let i=0;i<keys.length;i+=40){const batch=keys.slice(i,i+40),rows=await env.DB.prepare('SELECT key,value FROM records WHERE key IN ('+batch.map(()=>'?').join(',')+')').bind(...batch).all();for(const row of rows.results)found.set(row.key,JSON.parse(row.value))}return keys.map(k=>found.get(k))};
 let job=await get(jobKey);
 if(action==='start'){
  if(!Number.isSafeInteger(input.bytes)||input.bytes<1||input.bytes>MAX_BYTES||!validHash(input.sha256)||!Array.isArray(input.parts)||input.parts.length!==Math.ceil(input.bytes/PART_BYTES)||input.parts.some(x=>!validHash(x))||!(input.baseSha===null||/^[a-f0-9]{40,64}$/.test(input.baseSha||'')))fail(400,'快照大小、版本或分片清单无效');
  if(job&&(job.sha256!==input.sha256||job.baseSha!==input.baseSha||job.bytes!==input.bytes||JSON.stringify(job.parts)!==JSON.stringify(input.parts)))fail(409,'上传编号与原任务不一致');
  if(!job||job.expires<Date.now()){
   await env.DB.prepare('DELETE FROM records WHERE substr(key,1,?)=? AND json_extract(value,\'$.expires\')<?').bind(prefix.length,prefix,Date.now()).run();
   job={bytes:input.bytes,sha256:input.sha256,parts:input.parts,baseSha:input.baseSha,expires:Date.now()+86400000};await put(jobKey,job);
  }
 }else if(!job)fail(404,'上传任务不存在，请重新预览');
 if(job.expires<Date.now())fail(410,'上传任务已过期，请重新预览');
 if(job.receipt)return {ok:true,receipt:job.receipt,missing:[]};
 const partKey=h=>prefix+'part:'+h;
 if(action==='part'){
  if(!Number.isInteger(input.index)||input.index<0||input.index>=job.parts.length||typeof input.content!=='string'||input.content.length>PART_BYTES*1.5||!['raw','gzip'].includes(input.encoding)||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.content))fail(400,'分片格式无效');
  const packed=Buffer.from(input.content,'base64');if(packed.toString('base64')!==input.content)fail(400,'分片编码无效');
  let bytes;try{bytes=input.encoding==='gzip'?gunzipSync(packed,{maxOutputLength:PART_BYTES}):packed}catch{fail(400,'分片解压失败或超出容量')}
  const expected=input.index===job.parts.length-1?job.bytes-input.index*PART_BYTES:PART_BYTES,h=job.parts[input.index];
  if(bytes.length!==expected||await hash(bytes)!==h)fail(400,'分片长度或校验值不匹配');
  try{await put(partKey(h),{...await seal(bytes,env,partKey(h)),expires:Date.now()+86400000})}catch(error){console.error('workspace_part_store',error?.name,error?.message);fail(503,'云端分片暂存失败（UPLOAD_PART_STORE），进度保留，请稍后继续或联系管理员')}return {ok:true,index:input.index};
 }
 if(action==='status'||action==='start'){
  if(action==='start'){for(let i=0;i<job.parts.length;i+=40){const names=job.parts.slice(i,i+40).map(partKey);await env.DB.prepare('UPDATE records SET value=json_set(value,\'$.expires\',?) WHERE key IN ('+names.map(()=>'?').join(',')+') AND json_extract(value,\'$.expires\')>=? AND json_extract(value,\'$.expires\')<?').bind(job.expires,...names,Date.now(),job.expires).run()}}
  const known=new Map();for(let i=0;i<job.parts.length;i+=40){const names=job.parts.slice(i,i+40).map(partKey),rows=await env.DB.prepare('SELECT key,json_extract(value,\'$.expires\') AS expires FROM records WHERE key IN ('+names.map(()=>'?').join(',')+')').bind(...names).all();for(const row of rows.results)known.set(row.key,row.expires)}const missing=[];for(let i=0;i<job.parts.length;i++)if(!(known.get(partKey(job.parts[i]))>=Date.now()))missing.push(i);return {ok:true,missing,expires:job.expires};
 }
 if(action!=='commit')fail(400,'上传操作无效');
 if(env.WORKSPACE_COMMIT_RUNNER==='github-actions')return backgroundCommit(env,user,id,jobKey,job,runnerSend);
 let bytes=Buffer.alloc(job.bytes),offset=0;for(let start=0;start<job.parts.length;start+=40){const hashes=job.parts.slice(start,start+40),items=await readMany(hashes.map(partKey));for(let i=0;i<items.length;i++){const h=hashes[i],item=items[i];if(!item||item.expires<Date.now())fail(409,'分片尚未收齐或已过期，请继续上传');const raw=await open(item,env,partKey(h));if(await hash(raw)!==h||raw.length!==Math.min(PART_BYTES,job.bytes-offset))fail(400,'暂存分片内容不一致');raw.copy(bytes,offset);offset+=raw.length;items[i]=null}}
 if(offset!==job.bytes||await hash(bytes)!==job.sha256)fail(400,'完整快照校验失败，未发布');
 let data;try{data=JSON.parse(bytes.toString('utf8'))}catch{fail(400,'快照JSON无效')}bytes=null;
 const metadata=await verify({metadataOnly:true});
 if(metadata.operationId===id){if(metadata.manifest&&metadata.manifest.hash!==(job.pendingReceipt?.snapshotHash||job.checkpoint?.hash))fail(502,'已发布的大快照摘要尚未核验一致，任务保留');if(job.pendingReceipt&&metadata.sha!==job.pendingReceipt.sha)fail(409,'已发布任务的云端版本不一致');job.receipt={...(job.pendingReceipt||{}),ok:true,sha:metadata.sha,savedAt:metadata.savedAt,verified:true,contentHash:job.sha256};await put(jobKey,job);return {ok:true,receipt:job.receipt,missing:[]}}
 if(metadata.sha!==job.baseSha)fail(409,'展示快照已有更新，请重新预览');
 if(data?.protocol==='record-delta-v1'){if(metadata.manifest)fail(409,'上次为大快照，请保留本机数据并重新预览当前完整数据；不需重新导入');const previous=await verify();try{data=await Delta.apply(previous.data,data)}catch(error){fail(400,error.message)}}
 const receipt=await publish({baseSha:job.baseSha,operationId:id,data},job.checkpoint);
 if(receipt.pending){job.checkpoint=receipt.checkpoint;await put(jobKey,job);return {ok:true,pending:true,confirmedParts:receipt.confirmedParts,totalParts:receipt.totalParts}}
 // Persist a root receipt before its verification; retries can finish after response loss.
 job.pendingReceipt=receipt;await put(jobKey,job);
 const actual=await verify({metadataOnly:!!receipt.snapshotHash});if(actual.sha!==receipt.sha||(receipt.snapshotHash?actual.manifest?.hash!==receipt.snapshotHash||actual.operationId!==id:JSON.stringify(actual.data)!==JSON.stringify(data)))fail(502,'GitHub已返回回执，读回核验未完成；请继续本次任务，勿重复导入');
 job.receipt={...receipt,verified:true,contentHash:job.sha256};await put(jobKey,job);return {ok:true,receipt:job.receipt,missing:[]};
}

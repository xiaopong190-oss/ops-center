import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
export const SHARD_BYTES=512*1024, SNAPSHOT_BYTES=64*1024*1024;
const base='https://api.github.com/repos/xiaopong190-oss/ops-center/',prefix='data/logistics/workspace-parts/',aad=Buffer.from('logistics-workspace-shard-v1');
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
export const digest=async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
async function key(env){const bytes=Buffer.from(env.ENCRYPTION_KEY||'','base64');if(bytes.length!==32)fail(503,'快照加密配置不可用');return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt'])}
export function checkManifest(m){if(m?.schemaVersion!==2||m.storage!=='encrypted-parts-v1'||!Number.isSafeInteger(m.bytes)||m.bytes<1||m.bytes>SNAPSHOT_BYTES||!Array.isArray(m.parts)||m.parts.length!==Math.ceil(m.bytes/SHARD_BYTES)||!m.parts.every(p=>/^[a-f0-9]{64}$/.test(p))||!/^[a-f0-9]{64}$/.test(m.hash))fail(502,'快照分批索引无效');return m}
async function itemBytes(item,headers,send){if(item.encoding==='base64'&&typeof item.content==='string')return Buffer.from(item.content.replace(/\s/g,''),'base64');if(!/^[a-f0-9]{40,64}$/.test(item.sha||''))fail(502,'快照分批版本无效');const r=await send(base+'git/blobs/'+item.sha,{headers,redirect:'manual',signal:AbortSignal.timeout(30000)});if(!r.ok)fail(502,'快照分批内容读取失败');const b=await r.json();if(b.encoding!=='base64')fail(502,'快照分批编码无效');return Buffer.from(b.content.replace(/\s/g,''),'base64')}
export async function readShard(hash,env,headers,send){if(!/^[a-f0-9]{64}$/.test(hash))fail(400,'分批摘要无效');const r=await send(base+'contents/'+prefix+hash+'.enc.json?ref=main',{headers,redirect:'manual',signal:AbortSignal.timeout(30000)});if(!r.ok)fail(502,'展示数据批次缺失，保留上次完整快照');const item=await r.json();if(item.size>SHARD_BYTES*2)fail(502,'快照分批超过上限');try{const raw=await itemBytes(item,headers,send);if(raw.length>SHARD_BYTES*2)throw Error();const e=JSON.parse(raw),packed=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(e.iv,'base64'),additionalData:aad},await key(env),Buffer.from(e.content,'base64')),plain=gunzipSync(Buffer.from(packed),{maxOutputLength:SHARD_BYTES});if(await digest(plain)!==hash)throw Error();return plain}catch(error){if(error.status===503)throw error;fail(502,'展示数据批次解密或摘要校验失败')}}
// Keep only the current publication window in memory. No giant JSON string plus
// duplicate full-snapshot Buffer is needed after reconstructing the upload.
function* jsonSegments(value){
 if(Array.isArray(value)){yield '[';for(let i=0;i<value.length;i++){if(i)yield ',';yield JSON.stringify(value[i])??'null'}yield ']';return}
 if(value&&typeof value==='object'){yield '{';let first=true;for(const key of Object.keys(value)){if(value[key]===undefined||typeof value[key]==='function'||typeof value[key]==='symbol')continue;if(!first)yield ',';first=false;yield JSON.stringify(key)+':';yield* jsonSegments(value[key])}yield '}';return}
 yield JSON.stringify(value);
}
export async function writeShards(data,env,headers,send,metadata,checkpoint){
 const start=checkpoint?.cursor||0,end=checkpoint?start+3:Infinity,full=createHash('sha256'),selected=[],hashes=[];let current=Buffer.alloc(SHARD_BYTES),used=0,bytes=0;
 const finish=async()=>{const plain=current.subarray(0,used),index=hashes.length,h=await digest(plain);hashes.push(h);if(index>=start&&index<end)selected.push({plain,hash:h});current=Buffer.alloc(SHARD_BYTES);used=0};
 for(const text of jsonSegments(data)){const block=Buffer.from(text);bytes+=block.length;if(bytes>SNAPSHOT_BYTES)fail(413,'发布快照超过64MiB容量保护，原数据保留');full.update(block);let offset=0;while(offset<block.length){const n=Math.min(SHARD_BYTES-used,block.length-offset);block.copy(current,used,offset,offset+n);used+=n;offset+=n;if(used===SHARD_BYTES)await finish()}}
 if(used)await finish();const fullHash=full.digest('hex'),total=hashes.length;
 if(checkpoint&&(checkpoint.hash&&checkpoint.hash!==fullHash||checkpoint.bytes&&checkpoint.bytes!==bytes||!Number.isInteger(checkpoint.cursor)||checkpoint.cursor<0||checkpoint.cursor>total||!Array.isArray(checkpoint.parts)||checkpoint.parts.length!==checkpoint.cursor||checkpoint.parts.some((h,i)=>h!==hashes[i])))fail(409,'固定任务的提交内容或进度不一致，原快照未改变');
 const parts=checkpoint?checkpoint.parts.slice():[];
 for(const {plain,hash} of selected){
  const url=base+'contents/'+prefix+hash+'.enc.json',prior=await send(url+'?ref=main',{headers,redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(prior.status!==404&&!prior.ok)fail(502,'检查已有发布批次失败，原快照未改变');
  if(prior.status===404){const iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},await key(env),gzipSync(plain)),envelope={iv:Buffer.from(iv).toString('base64'),content:Buffer.from(encrypted).toString('base64')};const r=await send(url,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},redirect:'manual',signal:AbortSignal.timeout(45000),body:JSON.stringify({message:'Store encrypted logistics data batch',branch:'main',content:Buffer.from(JSON.stringify(envelope)).toString('base64')})});if(!r.ok&&![409,422].includes(r.status))fail(502,'发布批次写入未确认，旧展示快照仍有效；可继续重试')}
  const verified=await readShard(hash,env,headers,send);if(!verified.equals(plain))fail(502,'发布批次读回不一致，旧展示快照未改变');parts.push(hash);
 }
 if(checkpoint&&parts.length<total)return {pending:true,checkpoint:{cursor:parts.length,parts,hash:fullHash,bytes,savedAt:metadata.savedAt},confirmedParts:parts.length,totalParts:total};
 return {schemaVersion:2,storage:'encrypted-parts-v1',bytes,hash:fullHash,parts,...metadata};
}
export async function assembleShards(manifest,env,headers,send){checkManifest(manifest);const parts=[];for(const hash of manifest.parts)parts.push(await readShard(hash,env,headers,send));const bytes=Buffer.concat(parts);if(bytes.length!==manifest.bytes||await digest(bytes)!==manifest.hash)fail(502,'完整展示快照摘要不一致');return JSON.parse(bytes.toString('utf8'))}

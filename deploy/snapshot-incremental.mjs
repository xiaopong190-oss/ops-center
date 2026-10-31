import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import Delta from '../tools/logistics-workspace/record-delta.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function buildIncremental(data,baseSha,request){
 if(!baseSha)return null;
 const previous=await (await request('previous')).json();if(previous.sha!==baseSha)throw Error('INCREMENTAL_BASE_CHANGED');
 let base=previous.data;
 if(previous.legacy){const response=await request('base'),raw=Buffer.from(await response.arrayBuffer()),bytes=response.headers.get('X-Workspace-Compression')==='gzip'?gunzipSync(raw,{maxOutputLength:64*1024*1024}):raw;if(bytes.length>64*1024*1024)throw Error('INCREMENTAL_BASE_SIZE');base=JSON.parse(bytes)}
 if(previous.paged){const m=previous.paged;if(!Number.isSafeInteger(m.bytes)||m.bytes<1||m.bytes>64*1024*1024||!Array.isArray(m.parts)||m.parts.length!==Math.ceil(m.bytes/(512*1024)))throw Error('INCREMENTAL_BASE_MANIFEST');const all=[];
  for(let i=0;i<m.parts.length;i++){const p=await (await request('previous?page='+i+'&sha='+baseSha)).json(),bytes=Buffer.from(p.content||'','base64');if(p.sha!==baseSha||p.index!==i||p.hash!==m.parts[i]||hash(bytes)!==m.parts[i]||bytes.length!==Math.min(512*1024,m.bytes-i*512*1024))throw Error('INCREMENTAL_BASE_PART');all.push(bytes)}
  const bytes=Buffer.concat(all);if(bytes.length!==m.bytes||hash(bytes)!==m.hash)throw Error('INCREMENTAL_BASE_HASH');base=JSON.parse(bytes);
 }
 if(!base)return null;
 const payload=(await Delta.create(data,await Delta.index(base))).payload,bytes=Buffer.from(JSON.stringify(payload));
 if(bytes.length>=Buffer.byteLength(JSON.stringify(data)))return null;
 return {bytes,baseHash:hash(Buffer.from(JSON.stringify(base)))};
}

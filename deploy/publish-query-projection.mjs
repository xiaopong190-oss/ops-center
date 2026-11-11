import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {projectQuerySnapshot} from './query-projection.mjs';
import {businessDay} from '../cloud/logistics-query-store.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function verifyQueryRead(read){
 const meta=await read('meta=1'),pin='version='+encodeURIComponent(meta.version);
 const [a,b,air]=await Promise.all([read('kind=quotes-price&size=50&'+pin),read('kind=quotes-price&size=50&'+pin),read('kind=quotes-price&size=50&transport='+encodeURIComponent('空运')+'&'+pin)]);
 if(!meta.sourceSha||[a,b,air].some(result=>result.version!==meta.version||result.sourceSha!==meta.sourceSha||!Array.isArray(result.rows)||result.rows.length>50)||JSON.stringify(a.rows)!==JSON.stringify(b.rows)||air.rows.some(row=>row.transport!=='空运'))throw Error('QUERY_READ_NOT_VERIFIED');
 return {sourceSha:meta.sourceSha,version:meta.version,counts:meta.counts,firstRows:a.rows.length,firstResponseBytes:Buffer.byteLength(JSON.stringify(a)),airTotal:air.total};
}
export async function publishQueryProjection(snapshot,sourceSha,savedAt,send,now=new Date(),relations=[]){
 const day=businessDay(now),tomorrow=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const items=[],manifest={schema:1,savedAt,days:[day,tomorrow],relationHash:hash(relations),counts:{},parts:{}};
 for(const date of manifest.days){
  const projection=projectQuerySnapshot(snapshot,date,relations);manifest.counts[date]=projection.counts;
  for(const [kind,view] of Object.entries(projection.kinds)){
   const parts=[{part:date+'/'+kind+':index',value:view.index},...view.pages.map((value,i)=>({part:date+'/'+kind+':page-'+i,value})),...(view.searchParts||[]).map((value,i)=>({part:date+'/'+kind+':search-'+i,value}))];
   for(const item of parts){item.hash=hash(item.value);manifest.parts[item.part]=item.hash;items.push(item);}
  }
 }
 const version=sourceSha+':'+day+':'+hash(manifest),base={version,sourceSha,day};
 async function request(body){
  const encoded=body.items?{...body,items:body.items.map(item=>({part:item.part,hash:item.hash,packed:gzipSync(Buffer.from(JSON.stringify(item.value))).toString('base64')}))}:body;
  const packed=gzipSync(Buffer.from(JSON.stringify({...base,...encoded})));
  if(packed.length>512*1024)throw Error('QUERY_UPLOAD_TOO_LARGE');
  let last;
  for(let attempt=0;attempt<3;attempt++){
   try{
    const response=await send({method:'POST',headers:{'Content-Type':'application/json','Content-Encoding':'gzip'},body:packed});
    if(response.ok)return response.json();
    last=response.status;if(last<500&&last!==409)break;
   }catch{last='NETWORK';}
   if(attempt<2)await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
  }
  throw Error('QUERY_BUILD_HTTP_'+last);
 }
 let batch=[],bytes=0;
 for(const item of items){
  const size=Buffer.byteLength(JSON.stringify(item));
  if(size>1500000)throw Error('QUERY_INDEX_TOO_LARGE');
  if(batch.length&&(batch.length>=8||bytes+size>1500000)){await request({action:'stage',items:batch});batch=[];bytes=0;}
  batch.push(item);bytes+=size;
 }
 if(batch.length)await request({action:'stage',items:batch});
 const result=await request({action:'activate',manifest});
 if(!result.ok||result.version!==version||result.sourceSha!==sourceSha)throw Error('QUERY_ACTIVATION_NOT_VERIFIED');
 return {version,sourceSha,days:manifest.days,counts:manifest.counts,parts:items.length};
}

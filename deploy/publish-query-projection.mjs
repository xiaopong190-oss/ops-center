import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {projectQuerySnapshot} from './query-projection.mjs';
import {businessDay} from '../cloud/logistics-query-store.mjs';
import Columns from '../tools/logistics-workspace/table-columns.js';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function verifyQueryRead(read){
 const meta=await read('meta=1'),pin='version='+encodeURIComponent(meta.version);
 const [a,b,air]=await Promise.all([read('kind=quotes-price&size=50&'+pin),read('kind=quotes-price&size=50&'+pin),read('kind=quotes-price&size=50&transport='+encodeURIComponent('空运')+'&'+pin)]);
 if(!meta.sourceSha||[a,b,air].some(result=>result.version!==meta.version||result.sourceSha!==meta.sourceSha||!Array.isArray(result.rows)||result.rows.length>50)||JSON.stringify(a.rows)!==JSON.stringify(b.rows)||air.rows.some(row=>row.transport!=='空运'))throw Error('QUERY_READ_NOT_VERIFIED');
 const choices=a.providerColumn?.choices;
 if(a.providerColumn?.supported!==true||!Array.isArray(choices)||choices.reduce((sum,item)=>sum+item.count,0)!==a.total)throw Error('QUERY_PROVIDER_CHOICES_NOT_VERIFIED');
 if(choices.length){
  const firstIds=new Set(a.rows.map(row=>row.provider)),choice=choices.find(item=>!firstIds.has(item.value))||choices[0],filter='columnProvider='+encodeURIComponent(choice.value);
  const selected=await read('kind=quotes-price&size=50&'+filter+'&'+pin);
  if(selected.version!==meta.version||selected.total!==choice.count||selected.rows.length>50||selected.rows.some(row=>row.provider!==choice.value))throw Error('QUERY_PROVIDER_FILTER_NOT_VERIFIED');
  if(selected.pages>1){const next=await read('kind=quotes-price&size=50&page=1&'+filter+'&'+pin);if(next.version!==meta.version||next.total!==choice.count||next.rows.some(row=>row.provider!==choice.value))throw Error('QUERY_PROVIDER_PAGE_NOT_VERIFIED');}
  if(choices.length>1){const pair=choices.slice(0,2),multi=await read('kind=quotes-price&size=50&'+pair.map(item=>'columnProvider='+encodeURIComponent(item.value)).join('&')+'&'+pin);if(multi.version!==meta.version||multi.total!==pair.reduce((sum,item)=>sum+item.count,0)||multi.rows.some(row=>!pair.some(item=>item.value===row.provider)))throw Error('QUERY_PROVIDER_MULTI_NOT_VERIFIED');}
 }
 const expected=[];for(const choice of choices)expected.push(...Array(Math.min(choice.count,100-expected.length)).fill(choice.value));
 const sorted=await read('kind=quotes-price&size=50&providerOrder=asc&'+pin);
 if(sorted.version!==meta.version||JSON.stringify(sorted.rows.map(row=>row.provider))!==JSON.stringify(expected.slice(0,50)))throw Error('QUERY_PROVIDER_SORT_NOT_VERIFIED');
 if(sorted.pages>1){const next=await read('kind=quotes-price&size=50&page=1&providerOrder=asc&'+pin);if(next.version!==meta.version||JSON.stringify(next.rows.map(row=>row.provider))!==JSON.stringify(expected.slice(50,100)))throw Error('QUERY_PROVIDER_SORT_PAGE_NOT_VERIFIED');}
 if(a.tableColumns?.supported!==true)throw Error('QUERY_TABLE_COLUMNS_NOT_READY');
 for(const definition of Columns.definitions){
  const facet=await read('kind=quotes-price&column='+definition.id+'&'+pin);
  if(facet.version!==meta.version||!facet.columnFacet||facet.rows||facet.columnFacet.allValues.length!==facet.columnFacet.total)throw Error('QUERY_COLUMN_FACET_NOT_VERIFIED');
  const choice=facet.columnFacet.choices[0];
  if(choice){
   const rules=encodeURIComponent(JSON.stringify({[definition.id]:{mode:'include',values:[choice.value]}})),selected=await read('kind=quotes-price&size=50&columnMode=base&columns='+rules+'&'+pin);
   if(selected.version!==meta.version||selected.total!==choice.count||selected.rows.some(row=>Columns.cell(row,definition.id).label!==choice.label))throw Error('QUERY_COLUMN_SELECTION_NOT_VERIFIED');
  }
  const sorted=await read('kind=quotes-price&size=100&columnSort='+definition.id+':asc&'+pin);
  if(sorted.version!==meta.version||sorted.total!==a.total)throw Error('QUERY_COLUMN_SORT_NOT_VERIFIED');
  for(let i=1;i<sorted.rows.length;i++)if(Columns.compare(Columns.cell(sorted.rows[i-1],definition.id),Columns.cell(sorted.rows[i],definition.id),definition.type)>0)throw Error('QUERY_COLUMN_SORT_NOT_VERIFIED');
 }
 return {sourceSha:meta.sourceSha,version:meta.version,counts:meta.counts,firstRows:a.rows.length,firstResponseBytes:Buffer.byteLength(JSON.stringify(a)),airTotal:air.total,providerChoices:choices.length,airProviderChoices:air.providerColumn?.choices?.length||0,providerSelectionVerified:choices.length>0,providerSortVerified:choices.length>0,tableColumnsVerified:Columns.definitions.length};
}
export async function publishQueryProjection(snapshot,sourceSha,savedAt,send,now=new Date(),relations=[]){
 const day=businessDay(now),tomorrow=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const items=[],manifest={schema:1,tableSchema:1,savedAt,days:[day,tomorrow],relationHash:hash(relations),counts:{},parts:{}};
 for(const date of manifest.days){
  const projection=projectQuerySnapshot(snapshot,date,relations);manifest.counts[date]=projection.counts;
  for(const [kind,view] of Object.entries(projection.kinds)){
   const parts=[{part:date+'/'+kind+':index',value:view.index},...view.pages.map((value,i)=>({part:date+'/'+kind+':page-'+i,value})),...(view.searchParts||[]).map((value,i)=>({part:date+'/'+kind+':search-'+i,value})),...(view.columnParts||[]).map(item=>({part:date+'/'+kind+':'+item.part,value:item.value}))];
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

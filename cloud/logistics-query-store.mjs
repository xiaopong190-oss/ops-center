import {Buffer} from 'node:buffer';
import {gunzipSync} from 'node:zlib';
import {selectQueryIndex,queryFields,queryOptions,providerFilterChoices} from './query-index.mjs';
import {tableColumnQuery} from './table-column-query.mjs';

const prefix='_logistics-online-query:v1:';
const activeKey=prefix+'active';
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
const sha=async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
export const businessDay=(instant=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(instant);
const versionPattern=/^[a-f0-9]{40}:[0-9]{4}-[0-9]{2}-[0-9]{2}:[a-f0-9]{64}$/;
const partPattern=/^(?:[0-9]{4}-[0-9]{2}-[0-9]{2}\/)?(quotes-price|quotes-strict|regional-price|regional-strict|warehouses|bills|ratings):(index|page-[0-9]+|search-[0-9]+|column-(?:provider|country|warehouse|channel|terms|price|time|date|priceGrade|timeGrade|quoteGrade|score)-(?:base|ranked)-(?:index|values-[0-9]+))$/;
const dataKey=(version,part)=>prefix+version+':'+part;
async function encryptionKey(env){
 const bytes=Buffer.from(env.ENCRYPTION_KEY||'','base64');
 if(bytes.length!==32)fail(503,'在线查询加密配置不可用');
 return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
async function sealPacked(packed,expectedHash,key,aad){
 let plain;
 try{plain=gunzipSync(packed,{maxOutputLength:2*1024*1024})}catch{fail(400,'查询索引压缩数据无效');}
 const actualHash=await sha(plain);
 if(actualHash!==expectedHash)fail(400,'索引内容摘要无效');
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:Buffer.from(aad)},key,packed);
 return {iv:Buffer.from(iv).toString('base64'),content:Buffer.from(encrypted).toString('base64'),hash:actualHash};
}
async function open(envelope,env,aad){
 try{
  const packed=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(envelope.iv,'base64'),additionalData:Buffer.from(aad)},await encryptionKey(env),Buffer.from(envelope.content,'base64'));
  const plain=gunzipSync(Buffer.from(packed),{maxOutputLength:2*1024*1024});
  if(await sha(plain)!==envelope.hash)throw Error('hash');
  return JSON.parse(plain);
 }catch(error){if(error.status===503)throw error;fail(502,'在线查询分片校验失败');}
}
const get=async(env,key)=>{
 const row=await env.DB.prepare('SELECT value FROM records WHERE key=?').bind(key).first();
 return row?JSON.parse(row.value):null;
};
export const queryState=env=>get(env,activeKey);
const put=(env,key,value)=>env.DB.prepare('INSERT INTO records(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(value));
export async function cleanupQueryIndexes(env,now=new Date()){
 const candidates=await env.DB.prepare("SELECT key,value FROM records WHERE key>=? AND key<? AND key LIKE '%:stage' AND json_extract(value,'$.expires')<? LIMIT 20").bind(prefix,prefix+'\uffff',now.getTime()).all();
 let removed=0;
 for(const row of candidates.results){
  const version=row.key.slice(prefix.length,-6);if(!versionPattern.test(version))continue;
  const start=prefix+version+':';
  // Recheck both lease and active pointer in the delete statement to avoid a build race.
  const result=await env.DB.prepare("DELETE FROM records WHERE key>=? AND key<? AND EXISTS (SELECT 1 FROM records WHERE key=? AND value=?) AND NOT EXISTS (SELECT 1 FROM records WHERE key=? AND json_extract(value,'$.version')=?)").bind(start,start+'\uffff',row.key,row.value,activeKey,version).run();
  removed+=Number(result.meta?.changes??result.changes??0);
 }
 return {removed};
}
const caches=new WeakMap();
async function readPart(env,version,part,expectedHash){
 let cache=caches.get(env.DB);
 if(!cache){cache=new Map();caches.set(env.DB,cache);}
 const key=dataKey(version,part);
 if(cache.has(key))return cache.get(key);
 const pending=(async()=>{
  const envelope=await get(env,key);
  if(!envelope||envelope.hash!==expectedHash)fail(503,'最新报价查询数据尚未就绪');
  return open(envelope,env,key);
 })();
 if(cache.size>=24)cache.delete(cache.keys().next().value);
 cache.set(key,pending);
 try{return await pending}catch(error){cache.delete(key);throw error;}
}
// Called only after the existing main-workflow OIDC verification.
export async function stageQueryIndex(req,env,currentSource,now=new Date()){
 if(req.method!=='POST')fail(405,'索引构建只接受POST');
 const chunks=[];let length=0;
 for await(const chunk of req.body||[]){length+=chunk.length;if(length>512*1024)fail(413,'索引请求过大');chunks.push(chunk);}
 const packed=Buffer.concat(chunks);
 let input;
 try{input=JSON.parse(req.headers.get('Content-Encoding')==='gzip'?gunzipSync(packed,{maxOutputLength:2*1024*1024}):packed)}catch{fail(400,'索引请求无效');}
 const {version,sourceSha,day}=input;
 const today=businessDay(now),previousDay=new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10);
 if(!versionPattern.test(version||'')||version.split(':')[0]!==sourceSha||version.split(':')[1]!==day||![today,previousDay].includes(day))fail(409,'索引版本或业务日期已变化');
 if(input.action==='stage'){
  if(!Array.isArray(input.items)||!input.items.length||input.items.length>8)fail(400,'索引分片数量无效');
  const statements=[],key=await encryptionKey(env);
  for(const item of input.items){
   if(!partPattern.test(item.part||'')||typeof item.packed!=='string'||item.packed.length>700000||!/^[a-f0-9]{64}$/.test(item.hash))fail(400,'索引分片无效');
   const recordKey=dataKey(version,item.part),envelope=await sealPacked(Buffer.from(item.packed,'base64'),item.hash,key,recordKey);
   statements.push(put(env,recordKey,envelope));
  }
  statements.push(put(env,dataKey(version,'stage'),{expires:now.getTime()+2*86400000}));
  await env.DB.batch(statements);
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }
 if(input.action!=='activate')fail(400,'索引操作无效');
 const manifest=input.manifest;
 if(!manifest||manifest.schema!==1||!manifest.parts||Object.keys(manifest.parts).length>10000||await sha(Buffer.from(JSON.stringify(manifest)))!==version.split(':')[2])fail(400,'索引清单无效');
 const entries=Object.entries(manifest.parts);
 for(let offset=0;offset<entries.length;offset+=40){
  const batch=entries.slice(offset,offset+40);
  if(batch.some(([part,hash])=>!partPattern.test(part)||!/^[a-f0-9]{64}$/.test(hash)))fail(400,'索引清单分片无效');
  const keys=batch.map(([part])=>dataKey(version,part));
  const records=await env.DB.prepare('SELECT key,json_extract(value,\'$.hash\') AS hash FROM records WHERE key IN ('+keys.map(()=>'?').join(',')+')').bind(...keys).all();
  const found=new Map(records.results.map(row=>[row.key,row.hash]));
  if(batch.some(([part,hash])=>found.get(dataKey(version,part))!==hash))fail(409,'索引分片尚未全部确认');
 }
 const previous=await get(env,activeKey);
 if(await currentSource()!==sourceSha)fail(409,'GitHub已有更新，未切换查询版本');
 const next={version,sourceSha,day,days:manifest.days||[day],tableSchema:manifest.tableSchema||0,relationHash:manifest.relationHash||null,savedAt:manifest.savedAt,parts:manifest.parts,counts:manifest.counts};
 const tomorrow=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 if(!Array.isArray(next.days)||!next.days.includes(day)||next.days.some(value=>value!==day&&value!==tomorrow))fail(400,'索引日期范围无效');
 if(!next.days.includes(today))fail(409,'索引尚未覆盖当前业务日期');
 if(previous){
  const result=await env.DB.prepare('UPDATE records SET value=? WHERE key=? AND value=?').bind(JSON.stringify(next),activeKey,JSON.stringify(previous)).run();
  if(!Number(result.meta?.changes??result.changes??0))fail(409,'查询版本正在切换，请重试');
 }else{
  const result=await env.DB.prepare('INSERT INTO records(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(activeKey,JSON.stringify(next)).run();
  if(!Number(result.meta?.changes??result.changes??0))fail(409,'查询版本正在切换，请重试');
 }
 if(previous&&previous.version!==version){
  const obsolete=prefix+previous.version+':';
  try{await env.DB.prepare('DELETE FROM records WHERE key>=? AND key<?').bind(obsolete,obsolete+'\uffff').run()}
  catch{console.warn('query_index_cleanup_deferred')}
 }
 return Response.json({ok:true,version,sourceSha},{headers:{'Cache-Control':'no-store'}});
}
export async function logisticsQuery(req,env,user,now=new Date()){
 if(!user)fail(401,'请先登录运营中心');
 if(!['GET','POST'].includes(req.method))fail(405,'线上查询只允许读取');
 const active=await get(env,activeKey),today=businessDay(now);
 if(!active||!(active.days||[active.day]).includes(today))fail(503,'最新报价索引正在更新，请稍后重试');
 let query=new URL(req.url).searchParams;
 if(req.method==='POST'){const chunks=[];let size=0;for await(const chunk of req.body||[]){size+=chunk.length;if(size>256*1024)fail(413,'筛选条件过多，请使用搜索或排除选项');chunks.push(chunk);}query=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));}
 const version=active.version+'@'+today;
 if(query.get('version')&&query.get('version')!==version)fail(409,'报价版本已更新，请重新查询后翻页');
 if(query.get('meta')==='1')return Response.json({version,sourceSha:active.sourceSha,day:today,savedAt:active.savedAt,counts:active.counts[today]||active.counts},{headers:{'Cache-Control':'private, no-store'}});
 const kind=query.get('kind')||'quotes-price';
 if(!/^(quotes-price|quotes-strict|regional-price|regional-strict|warehouses|bills|ratings)$/.test(kind))fail(400,'查询类型无效');
 const dayPrefix=active.parts[today+'/'+kind+':index']?today+'/':'';
 const read=async part=>{
  try{return await readPart(env,active.version,part,active.parts[part])}
  catch(error){if((await get(env,activeKey))?.version!==active.version)fail(409,'报价版本已更新，请重新查询');throw error;}
 };
 const indexPart=dayPrefix+kind+':index',index=await read(indexPart);
 const filters={};
 for(const field of queryFields){const values=query.getAll(field);if(values.some(value=>value.length>400))fail(400,'筛选条件过长');if(values.length)filters[field]=values.length===1?values[0]:values;}
 if(kind==='bills'&&!filters.month)filters.month=today.slice(0,7);
 if(kind==='warehouses'&&query.get('warehousePrefix')){
  const prefix=query.get('warehousePrefix').normalize('NFKC').trim().toUpperCase().replace(/[\s._-]/g,'');
  if(prefix.length>30)fail(400,'仓库编号过长');
  const codes=Object.keys(index.facets.warehouse).filter(code=>code.toUpperCase().startsWith(prefix));
  filters.warehouse=codes.length?codes:['__no_warehouse_match__'];
 }
 const regional=kind.startsWith('regional-'),confirmed=query.get('confirmed')==='1';
 if(confirmed&&!regional&&(!filters.country||!filters.warehouse))fail(400,'请先选择国家和仓库再比较');
 if(regional&&filters.warehouse){filters[query.get('coverageMode')==='unverified'?'!coverage':'coverage']=filters.warehouse;delete filters.warehouse;}
 const resolved=queryOptions(index,filters),options=resolved.options;
 if(kind.startsWith('quotes-'))for(const field of ['provider','region','country','channel','warehouse']){
  if(resolved.selected[field])filters[field]=resolved.selected[field];else delete filters[field];
 }
 const needle=String(query.get('q')||'').trim().toLowerCase();
 if(needle){
  if(!regional||needle.length>100)fail(400,'区域搜索内容无效');
  filters._ids=[];
  for(const part of index.searchParts||[]){
   const search=await read(dayPrefix+kind+':'+part.part);
   for(let i=0;i<search.texts.length;i++)if(search.texts[i].includes(needle))filters._ids.push(search.start+i);
  }
 }
 if(confirmed&&!regional&&(!filters.country||!filters.warehouse))fail(400,'筛选已变化，请重新选择国家和仓库再比较');
 if(!regional&&(query.has('minScore')||query.has('maxScore'))){
  const min=query.get('minScore')?Number(query.get('minScore')):0,max=query.get('maxScore')?Number(query.get('maxScore')):10;
  if(!Number.isFinite(min)||!Number.isFinite(max)||min<0||max>10||min>max)fail(400,'分数范围需在0至10之间');
  const field=confirmed?'rankedScore':'score';
  const selected=Object.keys(index.facets[field]).filter(value=>value!==''&&Number(value)>=min&&Number(value)<=max);
  filters[field]=selected.length?selected:['__no_score_match__'];
 }
 let providerColumn;
 if(kind.startsWith('quotes-')){
  const choices=providerFilterChoices(index,filters),values=[...new Set(query.getAll('columnProvider'))],order=query.get('providerOrder')||'';
  if(values.length>200||values.some(value=>!value||value.length>400)||!['','asc','desc'].includes(order))fail(400,'物流商列筛选无效');
  const empty=query.get('columnProviderNone')==='1';
  providerColumn={supported:true,choices,values:empty?[]:values.length?values:null,order};
  if(empty)filters._ids=[];
  else if(values.length){
   const prior=filters.provider?Array.isArray(filters.provider)?filters.provider:[filters.provider]:null;
   filters.provider=prior?values.filter(value=>prior.includes(value)):values;
   if(!filters.provider.length)filters._ids=[];
  }
 }
 const order=providerColumn?.order?'provider'+(providerColumn.order==='asc'?'Asc':'Desc'):!regional&&query.get('view')==='score'?(confirmed?'rankedScore':'score')+(query.get('order')==='asc'?'Asc':'Desc'):'original';
 const columnRead=part=>read(dayPrefix+kind+':'+part),table=kind.startsWith('quotes-')?await tableColumnQuery(index,filters,query,columnRead,confirmed):null;
 if(table?.facet){if((await get(env,activeKey))?.version!==active.version)fail(409,'报价版本已更新，请重新查询');return Response.json({version,sourceSha:active.sourceSha,day:today,savedAt:active.savedAt,counts:active.counts[today]||active.counts,tableColumns:table.state,columnFacet:table.facet},{headers:{'Cache-Control':'private, no-store'}});}
 if(table?.ids)filters._ids=table.ids;
 let selected;
 try{selected=table?.selection||selectQueryIndex(index,filters,Number(query.get('page')||0),Number(query.get('size')||50),order)}catch{fail(400,'分页参数无效');}
 const needed=[...new Set(selected.locations.map(([page])=>page))];
 const pages=new Map(await Promise.all(needed.map(async page=>{
  const part=dayPrefix+kind+':page-'+page;
  return [page,await read(part)];
 })));
 // Recheck the pointer after reading immutable pages. A response never mixes versions.
 if((await get(env,activeKey))?.version!==active.version)fail(409,'报价版本已更新，请重新查询');
 const {locations,...pagination}=selected;
 const summary=kind==='bills'?(index.summaries||[]).filter(row=>(!filters.month||row.month===filters.month)&&(!filters.provider||row.provider===filters.provider)):undefined;
 const warehouseCountries=Object.create(null);
 for(const row of index.archive||[]){const countries=warehouseCountries[row.warehouse]||=[];if(!countries.includes(row.country))countries.push(row.country);}
 if(kind==='bills')options.provider=Object.keys(index.facets.provider);
 return Response.json({version,sourceSha:active.sourceSha,day:today,savedAt:active.savedAt,counts:active.counts[today]||active.counts,...pagination,options,selected:resolved.selected,providerNames:index.providerNames||{},warehouseCountries,...(providerColumn?{providerColumn}:{}),...(table?{tableColumns:table.state}:{}),...(kind==='ratings'?{companies:index.companies||[]}:{}),...(summary?{summary}:{}),rows:locations.map(([page,row])=>pages.get(page)[row])},{headers:{'Cache-Control':'private, no-store'}});
}

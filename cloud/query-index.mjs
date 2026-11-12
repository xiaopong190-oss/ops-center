// Compact inverted indexes keep online requests independent of the full snapshot.
export const queryFields = ['provider','region','country','channel','warehouse','transport','cargo','tax','coverage','score','rankedScore','month'];
function encodeIds(ids) {
 const bytes=[];let previous=0;
 for(const id of ids){const difference=id-previous;let delta=difference>=0?difference*2:-difference*2-1;previous=id;while(delta>=128){bytes.push((delta%128)|128);delta=Math.floor(delta/128)}bytes.push(delta)}
 let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary);
}
function decodeIds(encoded) {
 const ids=[];let previous=0,delta=0,factor=1;
 for(const byte of Uint8Array.from(atob(encoded),x=>x.charCodeAt(0))){delta+=(byte&127)*factor;if(byte&128){factor*=128}else{previous+=delta%2?-(delta+1)/2:delta/2;ids.push(previous);delta=0;factor=1}}
 return ids;
}
const decodedIndexes=new WeakMap();
function decoded(index,encoded){
 let cache=decodedIndexes.get(index);if(!cache){cache=new Map();decodedIndexes.set(index,cache);}
 if(cache.has(encoded))return cache.get(encoded);
 const ids=decodeIds(encoded);if(cache.size>=32)cache.delete(cache.keys().next().value);cache.set(encoded,ids);return ids;
}
export function buildQueryIndex(rows, pageBytes = 48000) {
 const facets = Object.fromEntries(queryFields.map(field => [field, Object.create(null)]));
 const pages = [], pageStarts = [0];
 let page = [], bytes = 2;
 for (let id = 0; id < rows.length; id++) {
  const row = rows[id], size = new TextEncoder().encode(JSON.stringify(row)).length + 1;
  if (size > pageBytes) throw Error('QUERY_ROW_TOO_LARGE');
  if (bytes + size > pageBytes && page.length) { pages.push(page); pageStarts.push(id); page = []; bytes = 2; }
  page.push(row); bytes += size;
  for (const field of queryFields) {
   const values = Array.isArray(row[field]) ? row[field] : [row[field] ?? ''];
   for (const value of new Set(values)) (facets[field][value] ||= []).push(id);
  }
 }
 if (page.length) pages.push(page);
 for(const values of Object.values(facets))for(const key of Object.keys(values))values[key]=encodeIds(values[key]);
 const orders={};
 if(!rows.length||rows.some(row=>Object.hasOwn(row,'score')))for(const field of ['score','rankedScore'])for(const direction of ['Asc','Desc']){
  const ids=rows.map((_,id)=>id).sort((a,b)=>{
   const first=rows[a][field],second=rows[b][field],validA=typeof first==='number',validB=typeof second==='number';
   if(validA!==validB)return validA?-1:1;
   return (validA?(direction==='Asc'?first-second:second-first):0)||a-b;
  });
  orders[field+direction]=encodeIds(ids);
 }
 return {index: {schema:1, count:rows.length, pageStarts, facets,orders}, pages};
}
function matchingIds(index,filters){
 let candidates = null;
 for (const field of queryFields) {
  const selected = filters[field];
  if (selected===undefined||selected===null||selected===''||Array.isArray(selected)&&!selected.length) continue;
  const values = Array.isArray(selected) ? selected : [selected];
  const allowed = new Set(values.flatMap(value => Object.hasOwn(index.facets[field],value)?decoded(index,index.facets[field][value]):[]));
  candidates = candidates === null ? [...allowed].sort((a,b) => a-b) : candidates.filter(id => allowed.has(id));
 }
 if(filters['!coverage']){
  const encoded=Object.hasOwn(index.facets.coverage,filters['!coverage'])?index.facets.coverage[filters['!coverage']]:null,excluded=new Set(encoded?decoded(index,encoded):[]);
  candidates=(candidates??Array.from({length:index.count},(_,id)=>id)).filter(id=>!excluded.has(id));
 }
 if(Array.isArray(filters._ids)){
  const allowed=new Set(filters._ids);
  candidates=candidates===null?filters._ids:candidates.filter(id=>allowed.has(id));
 }
 return candidates;
}
export function queryOptions(index,filters){
 const prior={...filters};
 for(const field of ['provider','region','country','channel','warehouse','score','rankedScore'])delete prior[field];
 const options={},selected={...filters};
 const matches=new Map(),matching=scope=>{const key=JSON.stringify(scope);if(!matches.has(key))matches.set(key,matchingIds(index,scope));return matches.get(key)};
 for(const field of ['provider','region','country','channel','warehouse']){
  const ids=matching(prior),eligible=ids===null?null:new Set(ids);
  let values=Object.entries(index.facets[field]).filter(([,encoded])=>eligible===null||decoded(index,encoded).some(id=>eligible.has(id))).map(([value])=>value);
  if(index.archive){
   if(field==='country')values=Object.keys(index.facets.country).concat(index.archive.map(row=>row.country));
   if(field==='region'){
    const regionFilters={...prior};delete regionFilters.provider;if(filters.country)regionFilters.country=filters.country;
    const matched=matching(regionFilters),countryIds=matched===null?null:new Set(matched);
    values=Object.entries(index.facets.region).filter(([,encoded])=>countryIds===null||decoded(index,encoded).some(id=>countryIds.has(id))).map(([value])=>value)
     .concat(index.archive.filter(row=>!filters.country||row.country===filters.country).map(row=>row.region));
   }
   if(field==='warehouse')values=values.concat(index.archive.filter(row=>(!prior.country||row.country===prior.country)&&(!prior.region||row.region===prior.region)).map(row=>row.warehouse));
  }
  options[field]=[...new Set(values)].filter(value=>value!=='').sort();
  if(filters[field]&&options[field].includes(filters[field]))prior[field]=filters[field];
  else delete selected[field];
 }
 for(const field of ['transport','cargo','tax','month'])options[field]=Object.keys(index.facets[field]);
 return {options,selected};
}
export function providerFilterChoices(index,filters={}){
 const ids=matchingIds(index,filters),eligible=ids===null?null:new Set(ids),names=index.providerNames||{};
 return Object.entries(index.facets.provider).map(([value,encoded])=>({value,label:names[value]||value,count:decoded(index,encoded).reduce((total,id)=>total+(eligible===null||eligible.has(id)?1:0),0)}))
  .filter(item=>item.value&&item.count).sort((a,b)=>a.label.localeCompare(b.label,'zh-CN',{numeric:true})||a.value.localeCompare(b.value));
}
export function selectQueryIndex(index, filters = {}, page = 0, size = 50, order='original') {
 if (!Number.isInteger(page) || page < 0 || !Number.isInteger(size) || size < 1 || size > 100) throw Error('QUERY_PAGE_INVALID');
 let candidates=matchingIds(index,filters);
 if(order==='providerAsc'||order==='providerDesc'){
  const eligible=candidates===null?null:new Set(candidates),names=index.providerNames||{};
  const providers=Object.keys(index.facets.provider).sort((a,b)=>String(names[a]||a).localeCompare(String(names[b]||b),'zh-CN',{numeric:true})||a.localeCompare(b));
  if(order==='providerDesc')providers.reverse();
  candidates=providers.flatMap(value=>decoded(index,index.facets.provider[value]).filter(id=>eligible===null||eligible.has(id)));
 }else if(order!=='original'){
  if(!Object.hasOwn(index.orders||{},order))throw Error('QUERY_ORDER_INVALID');
  const eligible=candidates===null?null:new Set(candidates);
  candidates=decoded(index,index.orders[order]).filter(id=>eligible===null||eligible.has(id));
 }
 const total = candidates?.length ?? index.count;
 const ids = candidates === null
  ? Array.from({length:Math.max(0, Math.min(size,total-page*size))}, (_,i) => page*size+i)
  : candidates.slice(page*size, (page+1)*size);
 const locate=id=>{let low=0,high=index.pageStarts.length-1;while(low<high){const middle=Math.ceil((low+high)/2);if(index.pageStarts[middle]<=id)low=middle;else high=middle-1}return [low,id-index.pageStarts[low]]};
 return {total, page, size, pages:Math.max(1,Math.ceil(total/size)), locations:ids.map(locate)};
}

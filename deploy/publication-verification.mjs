import {createHash} from 'node:crypto';
import {projectQuerySnapshot} from './query-projection.mjs';
import {businessDay} from '../cloud/logistics-query-store.mjs';
import {gzipSync} from 'node:zlib';
const canonical=x=>JSON.stringify(normalize(x));
function normalize(x){if(Array.isArray(x))return x.map(normalize);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,normalize(x[k])]));return x;}
const multiset=rows=>rows.map(canonical).sort();
export const contentDigest=rows=>createHash('sha256').update(JSON.stringify(multiset(rows))).digest('hex');
export function preflightPublicationQuery(snapshot,relations,now=new Date()){
 const today=businessDay(now),tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const scopeCounts={};let parts=0,totalVisible=0;
 for(const day of [today,tomorrow])for(const [kind,view] of Object.entries(projectQuerySnapshot(snapshot,day,relations).kinds)){
  parts+=1+view.pages.length+(view.searchParts||[]).length+(view.columnParts||[]).length;
  if(day===today&&['quotes-price','regional-price'].includes(kind)){const field=kind==='quotes-price'?'quotes':'regionalQuotes';for(const row of view.pages.flat()){const key=row.provider+'\u0000'+field;scopeCounts[key]=(scopeCounts[key]||0)+1;totalVisible++;}}
  const items=[view.index,...view.pages,...(view.searchParts||[]),...(view.columnParts||[]).map(p=>p.value)];
  for(const item of items){const raw=Buffer.from(JSON.stringify(item));if(raw.length>1500000)throw Error('QUERY_INDEX_TOO_LARGE');const packed=gzipSync(raw);if(packed.length>500000)throw Error('QUERY_INDEX_TOO_LARGE');}
 }if(parts>10000)throw Error('QUERY_INDEX_TOO_LARGE');return {scopeCounts,totalVisible,day:today};
}
export async function verifyPublicationProjection(snapshot,relations,read,now=new Date(),options={}){
 const day=businessDay(now),expected=projectQuerySnapshot(snapshot,day,relations),meta=await read('meta=1');
 if(meta.day!==day||!meta.sourceSha||!meta.version)throw Error('PUBLICATION_QUERY_VERSION');
 const evidence={sourceSha:meta.sourceSha,version:meta.version,day,relationHash:createHash('sha256').update(JSON.stringify(relations)).digest('hex'),ruleVersion:'publication-content-v1',kinds:{}};
 const known=new Map((options.known||[]).filter(p=>p.version===meta.version&&p.sourceSha===meta.sourceSha).map(p=>[p.pageKey,p]));
 for(const [kind,view] of Object.entries(expected.kinds)){
  const rows=view.pages.flat(),months=kind==='bills'?[...new Set(rows.map(r=>r.month))]:[null],actual=[];
  for(const month of months){
   const selected=month?rows.filter(r=>r.month===month):rows,pages=Math.max(1,Math.ceil(selected.length/100));
   for(let page=0;page<pages;page++){
    const expectedPage=selected.slice(page*100,(page+1)*100),pageKey=kind+'|'+(month||'')+'|'+page,hash=contentDigest(expectedPage),prior=known.get(pageKey);
    if(prior?.hash===hash&&prior.rows===expectedPage.length){actual.push(...expectedPage);continue;}
    const query=new URLSearchParams({kind,size:'100',page:String(page),version:meta.version});if(month)query.set('month',month);
    const result=await read(query.toString());
    if(result.version!==meta.version||result.sourceSha!==meta.sourceSha||result.total!==selected.length||contentDigest(result.rows)!==hash)throw Object.assign(Error('PUBLICATION_QUERY_CONTENT_MISMATCH'),{kind,page});
    actual.push(...result.rows);
    if(options.checkpoint)await options.checkpoint({version:meta.version,sourceSha:meta.sourceSha,pageKey,hash,rows:expectedPage.length});
   }
  }
  if(contentDigest(rows)!==contentDigest(actual))throw Object.assign(Error('PUBLICATION_QUERY_CONTENT_MISMATCH'),{kind,expected:rows.length,actual:actual.length});
  evidence.kinds[kind]={rows:rows.length,hash:contentDigest(rows)};
 }
 return evidence;
}
export function batchScopes(base,batch){
 const directory=base.storage['logistics-company-directory-v1'],mapping=new Map();
 const clean=x=>String(x||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
 for(const company of batch.companies){const matches=directory.filter(c=>c.id===company.id||[c.name,...(c.aliases||[])].some(n=>[company.name,...(company.aliases||[])].some(v=>clean(n)===clean(v))));if(matches.length>1)throw Error('BATCH_SCOPE_CONFLICT');mapping.set(company.id,matches[0]?.id||company.id);}
 const scope=(row,field)=>mapping.get(row.companyId)+'\u0000'+field;
 return {scopes:[...new Set(['quotes','regionalQuotes'].flatMap(f=>batch[f].map(row=>scope(row,f))))],scope};
}

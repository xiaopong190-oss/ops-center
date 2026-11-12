(function(root){
 'use strict';
 const Q=root.QuoteCore||(typeof require==='function'?require('../quote-core.js'):null);
 const Origin=root.OriginExclusions||(typeof require==='function'?require('./origin-exclusions.js'):null);
 const D=root.Domain||(typeof require==='function'?require('../domain.js'):null);
 const key='logistics-quotes-v1',directory='logistics-company-directory-v1',fields=['quotes','regionalQuotes'];
 const protocol='supplier-quote-batch-v1',names=c=>[c.name,...c.aliases].map(n=>D.clean(n).toLowerCase());
 function capture(db,rows,regional,companies,id){
  if(!rows.length&&!regional.length)return db;
  const ids=new Set([...rows,...regional].map(r=>r.companyId));
  const batch={protocol,id,companies:companies.filter(c=>ids.has(c.id)),quotes:rows,regionalQuotes:regional};
  return {...db,pendingQuoteBatches:[...(db.pendingQuoteBatches||[]),batch]};
 }
 function prepare(base,batch,today){
  if(!base||batch?.protocol!==protocol||!/^[a-f0-9-]{36}$/i.test(batch.id)||!Array.isArray(batch.quotes)||!Array.isArray(batch.regionalQuotes)||!batch.quotes.length&&!batch.regionalQuotes.length)throw Error('报价批次无效');
  D.directory(batch.companies);
  Q.validate({quotes:batch.quotes,regionalQuotes:batch.regionalQuotes,templates:[]});
  const companyRows=[...base.storage[directory]],known=new Map(),mapped=new Map();
  for(const c of companyRows)for(const n of names(c)){const ids=known.get(n)||new Set();ids.add(c.id);known.set(n,ids);}
  for(const c of batch.companies){
   if(c.demo)throw Error('演示公司不能发布');
   const ids=new Set(names(c).flatMap(n=>[...(known.get(n)||[])]));
   if(companyRows.some(x=>x.id===c.id))ids.add(c.id);
   if(ids.size>1)throw Error('服务商档案存在冲突，请核对');
   if(ids.size)mapped.set(c.id,[...ids][0]);
   else{const company={id:c.id,name:c.name,aliases:[],imported:true};companyRows.push(company);known.set(names(company)[0],new Set([company.id]));mapped.set(c.id,company.id);}
  }
  const db=base.storage[key],scope={},incoming={};
  for(const f of fields){
   incoming[f]=batch[f].map(r=>{
    const id=mapped.get(r.companyId);
    if(!id||r.demo||Origin?.classify(r).excluded||r.date<Q.cutoff(today)||r.date>today)throw Error('批次报价缺少有效档案或日期已超出入库范围');
    return {...r,companyId:id,company:companyRows.find(c=>c.id===id).name};
   });
   scope[f]=new Set(incoming[f].map(r=>r.companyId));
   const newest=new Map();
   for(const row of incoming[f])if(!newest.has(row.companyId)||newest.get(row.companyId)<row.date)newest.set(row.companyId,row.date);
   const conflicts=(db[f]||[]).filter(r=>scope[f].has(r.companyId)&&r.date>newest.get(r.companyId));
   if(conflicts.length)throw newerQuoteError(conflicts,newest,companyRows,f);
  }
  return {companyRows,db,scope,incoming};
 }
 function newerQuoteError(rows,newest,companies,field){
  const conflicts=[...new Set(rows.map(r=>r.companyId))].map(id=>({provider:companies.find(c=>c.id===id).name,type:field==='quotes'?'仓库报价':'区域报价',batchDate:newest.get(id),cloudDate:rows.filter(r=>r.companyId===id).map(r=>r.date).sort().at(-1)}));
  return Object.assign(Error('该服务商已有更新的线上报价，请核对后重提。'+conflicts.map(c=>c.provider+' · '+c.type+'：本批 '+c.batchDate+'，线上 '+c.cloudDate).join('；')),{code:'NEWER_SUPPLIER_QUOTES',conflicts});
 }
 async function scopeHash(base,batch,today){
  const {db,scope}=prepare(base,batch,today);
  const target=fields.map(f=>[...scope[f]].sort().map(id=>[id,(db[f]||[]).filter(r=>r.companyId===id).map(r=>JSON.stringify(r)).sort()]));
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(target)));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 }
 function apply(base,batch,today){
  const {companyRows,db,scope,incoming}=prepare(base,batch,today);
  const keep=(f)=>(db[f]||[]).filter(r=>!scope[f].has(r.companyId));
  const merged=incoming.quotes.length?Q.merge({quotes:[],templates:db.templates},incoming.quotes,today).db:{quotes:[],templates:db.templates};
  const next={...db,quotes:keep('quotes').concat(merged.quotes),templates:merged.templates,regionalQuotes:keep('regionalQuotes').concat(Q.mergeRegional([],incoming.regionalQuotes))};
  if(db.weeklyCarryover?.weekStart===Q.weekWindow(today).start){
   const saved=db.weeklyCarryover;
   next.weeklyCarryover={...saved,quotes:saved.quotes.filter(r=>!scope.quotes.has(r.companyId)),regionalQuotes:saved.regionalQuotes.filter(r=>!scope.regionalQuotes.has(r.companyId))};
  }
  Q.assertImportCoverage(next,incoming.quotes,incoming.regionalQuotes);
  Q.validate(next);
  return {...base,storage:{...base.storage,[directory]:companyRows,[key]:next}};
 }
 const api={protocol,capture,apply,scopeHash};
 if(typeof module!=='undefined')module.exports=api;
 else root.SupplierQuoteBatch=api;
})(typeof window==='undefined'?globalThis:window);

(function(root){
 'use strict';const Q=root.QuoteCore||(typeof require==='function'?require('./quote-core.js'):null);
 const filename=s=>String(s||'').replace(/^.*[\\/]/,'').replace(/(?:\(\d+\)|（\d+）)(?=\.xlsx$)/i,'').trim().toLowerCase();
 const eligible=e=>e.kind==='regional'&&/同批区域报价条件相同但价格冲突/.test(e.reason)&&(!e.status||e.status==='pending'||['alternative','confirm'].includes(e.decision?.action));
 const location=(r,a)=>JSON.stringify([r.company,filename(r.source),a.sourceSheet,a.priceCell,r.date,r.country,r.currency,r.unit,r.price]);
 function reconcile(db,warehouseRows,regionalRows,today){
  Q.validate(db);const safe=Q.partitionRegional(regionalRows,today).accepted,index=new Map();
  for(const row of safe){if(!row.source||!row.sourceSheet||!row.priceCell)continue;for(const a of [row,...(row.sourceAliases||[])]){const k=location(row,a);if(!index.has(k))index.set(k,[]);index.get(k).push(row);}}
  const next={...db},removed=new Set(),at=new Date().toISOString();let recovered=0,reviewed=0;const candidates=[];
  next.importExceptions=(db.importExceptions||[]).map(item=>{if(!eligible(item))return item;let old;try{old=JSON.parse(item.raw);}catch{return item;}if(!old.source||!old.priceCell||!old.sourceSheet||old.date<Q.cutoff(today)||old.date>today)return item;
   // Company IDs are authoritative; the current file's chosen name is used only when the old raw has no ID.
   const matches=(index.get(location(old,old))||[]).filter(row=>!old.companyId||row.companyId===old.companyId);
   const unique=[...new Map(matches.map(r=>[JSON.stringify([Q.regionalScope(r),r.date,r.price]),r])).values()];if(unique.length!==1)return item;const accepted=unique[0];candidates.push(accepted);reviewed++;if(item.status!=='imported')recovered++;
   for(const row of db.regionalQuotes||[])if(row.company===old.company&&filename(row.source)===filename(old.source)&&row.sourceSheet===old.sourceSheet&&row.priceCell===old.priceCell&&row.date===old.date&&row.price===old.price&&Q.regionalScope({...row,companyId:undefined})===Q.regionalScope({...old,companyId:undefined})&&Q.regionalScope(row)!==Q.regionalScope(accepted))removed.add(row);
   return {...item,status:'imported',decision:{action:'reclean',at,reason:'使用当前原表清洗规则重算；相同公司、文件、国家、日期、源坐标、币种单位及原价逐项一致，新完整条件通过全局校验',accepted,previous:item.decision||null}};
  });
  if(!reviewed)return {db,reviewed:0,recovered:0,replaced:0};next.regionalQuotes=Q.mergeRegional((db.regionalQuotes||[]).filter(r=>!removed.has(r)),candidates);Q.validate(next);Q.assertImportCoverage(next,warehouseRows,regionalRows);return {db:next,reviewed,recovered,replaced:removed.size};
 }
 const api={reconcile,eligible};root.LegacyReclean=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

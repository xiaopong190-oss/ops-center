(function(root){
 'use strict';

 function replaceBase(db, warehouseRows, regionalRows, resolveCompany) {
  const providers = new Set([...warehouseRows, ...regionalRows].map(row => row.companyId));
  if (!providers.size) return db;

  const keep = row => !providers.has(row.companyId || resolveCompany(row.company));
  return {
   ...db,
   quotes: db.quotes.filter(keep),
   ...(db.regionalQuotes ? {regionalQuotes: db.regionalQuotes.filter(keep)} : {})
  };
 }

 function prepare(db, warehouseRows, regionalRows, resolveCompany, originPolicy, today) {
  const incoming = {quotes: warehouseRows, regionalQuotes: regionalRows};
  const allowed = originPolicy ? originPolicy.cleanDatabase(incoming, today) : incoming;
  let base = replaceBase(db, allowed.quotes, allowed.regionalQuotes, resolveCompany);
  const carry=root.WeeklyCarryover||(typeof require==='function'?require('./weekly-carryover.js'):null);
  if(carry)base=carry.replaceProviders(base,[...allowed.quotes,...allowed.regionalQuotes],resolveCompany,today);
  if(root.SupplierQuoteBatch&&root.Companies&&root.LogisticsSpace?.mode==='local'){
   const warehouseIds=new Set(allowed.quotes.map(row=>row.companyId));
   const regionalIds=new Set(allowed.regionalQuotes.map(row=>row.companyId));
   const keep=(row,ids)=>!ids.has(row.companyId||resolveCompany(row.company));
   base=root.SupplierQuoteBatch.capture({...base,quotes:db.quotes.filter(row=>keep(row,warehouseIds)),...(db.regionalQuotes?{regionalQuotes:db.regionalQuotes.filter(row=>keep(row,regionalIds))}:{})},allowed.quotes,allowed.regionalQuotes,root.Companies.list(),root.crypto.randomUUID());
  }
  const excluded = allowed.originExcludedQuotes || [];
  if (excluded.length) {
   base = {...base, originExcludedQuotes: [...(base.originExcludedQuotes || []), ...excluded]};
  }
  return {base, warehouseRows: allowed.quotes, regionalRows: allowed.regionalQuotes, excludedCount: excluded.length};
 }

 const api = {prepare};
 if (typeof module !== 'undefined') module.exports = api;
 else root.ProviderBatchReplacement = api;
})(typeof window === 'undefined' ? globalThis : window);

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

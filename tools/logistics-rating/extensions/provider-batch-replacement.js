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

 const api = {replaceBase};
 if (typeof module !== 'undefined') module.exports = api;
 else root.ProviderBatchReplacement = api;
})(typeof window === 'undefined' ? globalThis : window);

(function(root){
 'use strict';
 function quoteSummary(document,week){
  const rows=document.storage['logistics-quotes-v1'].quotes;
  return {total:rows.length,current:rows.filter(r=>r.date>=week.start&&r.date<=week.today).length};
 }
 function reviewCloudQuotes(local,remote,week){
  const localQuotes=quoteSummary(local,week),cloudQuotes=quoteSummary(remote,week);
  return {local:localQuotes,cloud:cloudQuotes,missingCurrent:localQuotes.total>0&&localQuotes.current===0&&cloudQuotes.current>0};
 }
 const api={reviewCloudQuotes};if(typeof module!=='undefined')module.exports=api;else root.CloudDataReview=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);

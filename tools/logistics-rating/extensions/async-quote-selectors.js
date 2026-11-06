(function(root){
 'use strict';
 function options(rows,warehouse){return {warehouses:[...new Set(rows.map(r=>r.warehouse))].sort(),services:[...new Set(rows.filter(r=>r.warehouse===warehouse).map(r=>r.channel))].sort()}}
 function mount(doc){
  const warehouse=doc.getElementById('scenarioWarehouse'),service=doc.getElementById('scenarioService'),anchor=doc.getElementById('warehouse');
  if(!warehouse||!service||!anchor||warehouse.dataset.asyncOptionsBound)return;
  warehouse.dataset.asyncOptionsBound='true';let last=null,lastDay='';
  function sync(){const db=root.ComparisonStore?.read();if(!db)return;const day=new Date().toLocaleDateString('sv-SE');if(last===db&&lastDay===day)return;last=db;lastDay=day;
   const rows=root.ScenarioRating.describe(root.QuoteCore.weekQuotes(db.quotes,day),db.comparisonMappings||[]),available=options(rows,warehouse.value);
   for(const [select,values] of [[warehouse,available.warehouses],[service,available.services]]){const old=select.value;select.replaceChildren();for(const value of ['',...values]){const option=doc.createElement('option');option.value=value;option.textContent=value||'请选择';select.append(option)}select.value=values.includes(old)?old:''}
   // Discard result text computed from a previous data snapshot using the existing UI invalidation.
   service.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));
   doc.getElementById('mappingSearch')?.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));
  }
  const observer=new doc.defaultView.MutationObserver(sync);observer.observe(anchor,{childList:true});doc.defaultView.addEventListener('pagehide',()=>observer.disconnect(),{once:true});sync();
 }
 const api={options,mount};if(typeof module!=='undefined')module.exports=api;else{root.AsyncQuoteSelectors=Object.freeze(api);mount(root.document)}
})(typeof window==='undefined'?globalThis:window);

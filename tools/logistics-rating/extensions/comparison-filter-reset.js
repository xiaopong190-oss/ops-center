(function(root){
 'use strict';
 function bindComparisonFilterReset(doc){
  const reset=doc.getElementById('n001Reset');if(!reset)return;
  reset.addEventListener('click',()=>{doc.getElementById('scoreClear')?.click();});
  for(const id of ['scoreMin','scoreMax']){
   const field=doc.getElementById(id);
   field?.addEventListener('input',()=>{if(field.value===''&&!field.validity?.badInput)doc.getElementById('scoreApply')?.click();});
  }
 }
 const api={bindComparisonFilterReset};if(typeof module!=='undefined')module.exports=api;else root.ComparisonFilterReset=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);

(function(root){
 'use strict';
 function bindComparisonFilterReset(doc){
  const reset=doc.getElementById('n001Reset');if(!reset||reset.dataset.comparisonResetBound)return;reset.dataset.comparisonResetBound='true';
  reset.addEventListener('click',()=>{const mode=doc.getElementById('scoreViewMode');if(mode){mode.value='grouped';mode.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));}doc.getElementById('scoreClear')?.click();});
  // Score controls may be created after a large published snapshot finishes loading.
  doc.addEventListener('input',event=>{const field=event.target;if(['scoreMin','scoreMax'].includes(field.id)&&field.value===''&&!field.validity?.badInput)doc.getElementById('scoreApply')?.click();},true);
 }
 const api={bindComparisonFilterReset};if(typeof module!=='undefined')module.exports=api;else root.ComparisonFilterReset=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);

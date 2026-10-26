(function(root){
 'use strict';
 function showCleaningBlocker({message,status,summary,supplier,manualPanel,manualInput,date,showReview,workbench}){
  status.textContent='未开始清洗：'+message;status.setAttribute?.('role','alert');summary.textContent='清洗未开始，文件仍保留：'+message;
  if(/物流商|公司/.test(message)){
   status.textContent+='。请选择这份报价所属的服务商；没有该公司时，可展开“手动核对服务商名称”并用于当前文件。';
   if(supplier.options?.length>1){showReview();workbench.scrollIntoView?.({behavior:'smooth',block:'start'});supplier.focus?.();}
   else{manualPanel.open=true;manualPanel.scrollIntoView?.({behavior:'smooth',block:'center'});manualInput.focus?.();}
  }else if(/日期/.test(message)){date.scrollIntoView?.({behavior:'smooth',block:'center'});date.focus?.();}
 }
 function placeSupplierPicker({supplier,button}){const label=supplier.closest?.('label');if(label&&button?.parentElement)button.before(label);}
 const api={showCleaningBlocker,placeSupplierPicker};if(typeof module!=='undefined')module.exports=api;else root.IntakeFeedback=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);

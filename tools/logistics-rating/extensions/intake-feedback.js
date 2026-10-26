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
 function ensureManualChoice(supplier){if(!supplier.querySelector('option[value="__manual__"]')){const option=supplier.ownerDocument.createElement('option');option.value='__manual__';option.textContent='＋ 自行填写服务商名称';supplier.appendChild(option);}}
 function mountSupplierEntry({supplier,button,manualPanel,manualInput,getFile,getCandidate}){
  placeSupplierPicker({supplier,button});ensureManualChoice(supplier);button.after(manualPanel);
  supplier.addEventListener('change',()=>{if(supplier.value==='__manual__'){manualPanel.open=true;manualInput.focus?.();}else manualPanel.open=false;});
  if(getFile&&getCandidate)mountSupplierConfirmation({supplier,button,getFile,getCandidate});
 }
 function mountSupplierConfirmation({supplier,button,getFile,getCandidate}){
  const doc=supplier.ownerDocument,panel=doc.createElement('div'),status=doc.createElement('p'),confirm=doc.createElement('button');let proof=null;
  panel.className='editor';panel.id='supplierConfirmation';status.setAttribute('role','status');confirm.type='button';confirm.textContent='确认本文件服务商';panel.append(status,confirm);button.before(panel);
  function refresh(){const candidate=getCandidate(),valid=root.SupplierConfirmation.supplierConfirmationMatches(proof,getFile(),candidate);status.textContent=valid?'已确认本文件服务商：'+candidate.name:candidate?.name?'请核对本文件归属：'+candidate.name+'。同一服务商请选已有档案，名称不同不要重复建档。未匹配档案的名称将作为新服务商，请确认确为新公司。':'请先选择已有服务商，或填写名称，再确认本文件归属。';confirm.disabled=valid||!getFile()||!candidate?.name;return valid;}
  confirm.onclick=()=>{const candidate=getCandidate(),file=getFile();if(file&&candidate?.name)proof={file,id:candidate.id,name:candidate.name};refresh();};
  supplier.addEventListener('change',()=>{proof=null;refresh();});
  new root.MutationObserver(refresh).observe(supplier,{childList:true,subtree:true});
  doc.addEventListener('click',event=>{root.queueMicrotask(refresh);if(!event.target.closest?.('#batchClean,#matrixBuild,#toStandard,#continueImport,#batchForward'))return;if(refresh())return;event.preventDefault();event.stopImmediatePropagation();panel.scrollIntoView?.({behavior:'smooth',block:'center'});confirm.focus();},true);
  refresh();
 }
 const api={showCleaningBlocker,placeSupplierPicker,ensureManualChoice,mountSupplierEntry};if(typeof module!=='undefined')module.exports=api;else root.IntakeFeedback=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);

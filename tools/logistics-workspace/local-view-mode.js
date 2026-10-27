// View mode is an accidental-edit guard, not identity authentication.
(function(){const params=new URLSearchParams(location.search),mode=params.get('access')||'operate',kind=params.get('module')||'';document.documentElement.dataset.access=mode;document.documentElement.dataset.module=kind;
 if(kind==='bill-display'){document.querySelector('#file')?.closest('section')?.setAttribute('hidden','');document.querySelector('#template')?.closest('section')?.setAttribute('hidden','')}if(mode!=='view')return;
 const denied='#commit,#save,#saveWarehouse,#saveMapping,#removeMapping,#scoreSave,#scoreUndo,#deleteQuotes,#restoreQuotes,#linkSave,#alias,#demo,#clearDemo,#demoFill,#batchClean,#matrixBuild,#toStandard,#continueImport,#localForward,#manualSupplierUse,#manualSupplierAdd,#cr-add,#cr-addSelected,[data-score-edit],[data-record],#bulkCleanOpen,#evidenceOpen,#evidenceApply,#evidencePreviewButton,#evidencePasteApply,#workbookFile,#file';
 document.addEventListener('click',e=>{if(e.target.closest(denied)){e.preventDefault();e.stopImmediatePropagation()}},true);document.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation()},true);
})();

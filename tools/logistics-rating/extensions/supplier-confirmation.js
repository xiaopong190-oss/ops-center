(function(root){
 'use strict';
 function supplierConfirmationMatches(proof,file,candidate){return !!(proof&&file&&candidate&&candidate.name&&proof.file===file&&proof.id===candidate.id&&proof.name===candidate.name);}
 const api={supplierConfirmationMatches};if(typeof module!=='undefined')module.exports=api;else root.SupplierConfirmation=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);

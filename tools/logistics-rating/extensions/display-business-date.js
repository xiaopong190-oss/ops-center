(function(root){'use strict';
 // The publisher validates quote batches in Asia/Shanghai. Readers must use
 // that same business day, without changing their clock or stored quote dates.
 function day(instant,audience){
  if(audience!=='display')return null;
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(instant);
 }
 const api=Object.freeze({day});if(typeof module!=='undefined')module.exports=api;root.DisplayBusinessDate=api;
})(typeof window==='undefined'?globalThis:window);

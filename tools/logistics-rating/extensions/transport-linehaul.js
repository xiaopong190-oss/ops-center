(function(root){'use strict';
 const text=v=>String(v||'').slice(0,4000);
 function explicit(value){const s=text(value);return /海铁/.test(s)?'海运':/空运|空派/.test(s)?'空运':/铁派|铁路|中欧班列/.test(s)?'铁路':/卡航/.test(s)?'卡航':/海运|海卡|海派|美森|普船|以星|EXX|COSCO|ZIM/i.test(s)?'海运':null}
 function resolve(row,{sourceMode=null}={}){
  const original=text(row.comparisonOriginal?.channel||row.channel),service=text(row.comparisonProfile?.service),sheet=text(row.sourceSheet);
  const lastMile=/卡派|快递派|卡车派送|快递派送/.test(original+' '+service);
  if(lastMile){
   // An explicit original linehaul wins over a generic/misleading mapped service.
   // Last-mile labels alone never establish truck linehaul (or sea/air).
   const mode=explicit(original)||explicit(sheet)||sourceMode||explicit(service);
   return mode||'待确认';
  }
  const european=/欧洲|欧盟|英国|德国|法国|意大利|西班牙|荷兰|比利时|波兰|捷克|奥地利|瑞典|丹麦|芬兰|爱尔兰|葡萄牙/.test(original+' '+sheet+' '+text(row.country));
  if(european&&/卡车运输|公路运输/.test(original)&&!explicit(original))return '卡航';
  return null;
 }
 const api={resolve};if(typeof module!=='undefined')module.exports=api;else root.TransportLinehaul=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);

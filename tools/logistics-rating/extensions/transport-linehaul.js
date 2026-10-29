(function(root){'use strict';
 const text=v=>String(v||'').slice(0,4000);
 function explicit(value){const s=text(value);return /海铁/.test(s)?'海运':/空运|空派/.test(s)?'空运':/铁派|铁路|中欧班列/.test(s)?'铁路':/卡航/.test(s)?'卡航':/海运|海卡|海派|美森|普船|以星|EXX|COSCO|ZIM/i.test(s)?'海运':null}
 function resolve(row,{sourceMode=null}={}){
  const original=text(row.comparisonOriginal?.channel||row.channel),service=text(row.comparisonProfile?.service),sheet=text(row.sourceSheet);
  const lastMile=/卡派|快递派|卡车派送|快递派送/.test(original+' '+service);
  if(lastMile){
   // An explicit original linehaul wins over a generic/misleading mapped service.
   // Last-mile labels alone never establish truck linehaul (or sea/air).
   const mode=explicit(original)||serviceMode(row)||explicit(sheet)||sourceMode||explicit(service);
   return mode||'待确认';
  }
  const european=/欧洲|欧盟|英国|德国|法国|意大利|西班牙|荷兰|比利时|波兰|捷克|奥地利|瑞典|丹麦|芬兰|爱尔兰|葡萄牙/.test(original+' '+sheet+' '+text(row.country));
  if(european&&/卡车运输|公路运输/.test(original)&&!explicit(original))return '卡航';
  return null;
 }
 function serviceField(row){return text(row.terms).match(/(?:^|[;；])\s*(?:服务|渠道)\s*=\s*([^;；]+)/)?.[1]||''}
 function serviceMode(row){const field=serviceField(row);if(!field)return null;const modes=[/空运|空派/,/海运|海派|海卡|美森|普船/,/铁路|铁派|中欧班列/,/卡航/].filter(re=>re.test(field));if(modes.length>1||/(?:非|不是|不走|不适用)\s*(?:空运|空派|海运|海派|铁路|卡航)/.test(field))return '待确认';return explicit(field)}
 function display(row,mode){
  const original=text(row.comparisonOriginal?.channel||row.channel),tail=/快递派(?:送)?/.test(original)?'快递派':/卡派|卡车派送/.test(original)?'卡派':null;
  if(!tail)return null;
  const label=(mode==='待确认'?'运输待确认':mode)+' · '+tail;
  return /^(?:快递派(?:送)?|卡派|卡车派送)$/.test(original.trim())?label:label+'（'+original+'）';
 }
 const api={resolve,display,serviceField};if(typeof module!=='undefined')module.exports=api;else root.TransportLinehaul=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);

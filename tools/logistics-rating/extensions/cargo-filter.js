(function(root){
 'use strict';
 const options=['普货','带电','带磁','液体','粉末','其他特殊货物','未注明／待确认'];
 function classifyCargo(row){
  const evidence=[row.comparisonProfile?.cargo,row.cargoType,row.channel,row.terms].filter(Boolean).join('；'),parts=evidence.split(/[;；,，。\n]|但|但是/),tags=[];
  const rules=[['普货',/普货|普通货/],['带电',/带电|含电|电池/],['带磁',/带磁|含磁|磁性/],['液体',/液体|液货/],['粉末',/粉末|粉体/],['其他特殊货物',/敏感货|敏感品|特货|特殊货/]];
  for(const [tag,pattern]of rules){const matching=parts.filter(p=>pattern.test(p));const denied=matching.some(p=>/不接|不收|不承运|不支持|禁止|禁运|禁收|不可|不能|不带|无电|无磁|非普货/.test(p));if(matching.length&&!denied)tags.push(tag);}
  return {tags:tags.length?tags:['未注明／待确认'],evidence};
 }
 function filterCargoRows(rows,selected=[]){if(!selected.length)return rows;const wanted=new Set(selected);return rows.filter(r=>classifyCargo(r).tags.some(tag=>wanted.has(tag)));}
 const api={options,classifyCargo,filterCargoRows};if(typeof module!=='undefined')module.exports=api;else root.CargoFilter=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);

(function(root){'use strict';
 const labels={included:'包税',excluded:'不包税／递延',unknown:'未明确'};
 function evidence(row){return [row.comparisonProfile?.tax,row.taxType,row.taxMode,row.taxTreatment,row.comparisonOriginal?.channel||row.channel,row.terms].filter(v=>typeof v==='string'&&v.trim()).map(v=>v.slice(0,4000));}
 function classifyTax(row){
  const sources=evidence(row),found=new Set();
  for(const source of sources){let text=source.normalize('NFKC');
   if(/(?:不是|并非|并不是)\s*(?:不包税|不含税)|是否\s*(?:包税|含税|递延)|(?:包税|含税|递延)(?:[?？]|[（(、，,;；:：\s]*(?:待确认|待定))|(?:不保证|不承诺)(?:包税|含税|递延)/.test(text))return {mode:'unknown',reason:'税务表达尚未确定',evidence:sources};
   text=text.replace(/(?:不支持|不接受|不做|不能|不可|禁止|禁用|不提供|不采用|不适用|不走|无需)\s*(?:VAT\s*)?(?:递延|包税|含税)/gi,'').replace(/(?:VAT\s*)?递延(?:不可用|不适用|不支持)/gi,'');
   // Negated capabilities and conditional offers do not establish the quote's own tax mode.
   if(/(?:可选|任选|可做|可走|可提供|支持).{0,12}(?:包税|递延)|(?:包税|递延).{0,12}(?:可选|任选)/.test(text))return {mode:'unknown',reason:'存在可选税务方案',evidence:sources};
   text=text.replace(/(?:不支持|不接受|不做|不能|不可|禁止|不是|无需|非|不采用)\s*(?:VAT\s*)?递延/gi,'');
   if(/不包税|没有包税|未包税|不含税|未含税|未税|非包税|不是包税|税费(?:自理|自付|另计)/.test(text))found.add('excluded');
   text=text.replace(/不是包税|不包税|没有包税|未包税|不含税|未含税|非包税/g,'');
   if(/(?:不支持|不接受|不做|不能|不可)\s*(?:包税|含税)/.test(text))text=text.replace(/(?:不支持|不接受|不做|不能|不可)\s*(?:包税|含税)/g,'');
   if(/递延/.test(text))found.add('excluded');
   if(/包税|含税/.test(text))found.add('included');
  }
  return {mode:found.size===1?[...found][0]:'unknown',reason:found.size>1?'税务表达冲突':found.size?'原报价明确注明':'未明确税务方式',evidence:sources};
 }
 function filterTaxRows(rows,mode=''){if(!mode)return rows;const wanted=mode==='deferred'?'excluded':mode;if(!Object.hasOwn(labels,wanted))return [];const cache=new Map();return rows.filter(row=>{const key=JSON.stringify(evidence(row));if(!cache.has(key))cache.set(key,classifyTax(row).mode);const actual=cache.get(key);return actual===wanted||(wanted!=='unknown'&&actual==='unknown');});}
 function optionsFor(){return ['included','excluded','unknown'];}

 const api={labels,classifyTax,filterTaxRows,optionsFor};if(typeof module!=='undefined')module.exports=api;else root.TaxFilter=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);

(function(root){'use strict';
 const blocked=new Set(['宁波','厦门']);
 const cityPattern='宁波|厦门|Ningbo|Xiamen|Amoy|深圳|广州|上海|青岛|天津|大连|福州|义乌|东莞|佛山|香港|南沙|盐田|蛇口|杭州|太仓|南京|武汉|重庆|成都';
 const list='(?:'+cityPattern+')(?:港)?(?:\\s*[/／、,，和或及]\\s*(?:'+cityPattern+')(?:港)?)*';
 const normalize=s=>/^(?:ningbo)$/i.test(s)?'宁波':/^(?:xiamen|amoy)$/i.test(s)?'厦门':s;
 const cities=s=>[...new Set((String(s).match(new RegExp(cityPattern,'gi'))||[]).map(normalize))];
 const negative=s=>/(?:不是从|不是|不从|不在|不经|不走|不支持|禁止|非|除)\s*$/.test(s);
 function quoteText(value,seen=new Set()){if(typeof value==='string')return value;if(!value||typeof value!=='object'||seen.has(value))return '';seen.add(value);return Object.values(value).map(v=>quoteText(v,seen)).join('；')}
 function excludedUnit(row){
  const fields=[row?.unit,row?.priceUnit,row?.pricingUnit,row?.quoteUnit,row?.['计价单位'],row?.['报价单位'],row?.values?.[6]];
  const normalized=v=>String(v??'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
  for(const raw of fields){if(/^(?:(?:cny|rmb|usd|eur|gbp|cad|¥|元)\/)?(?:cbm|m3|立方米)$/.test(normalized(raw)))return String(raw)}
  const prices=[row?.currency,row?.priceText,row?.priceRaw,row?.rateRaw,row?.quotedPrice,row?.unitRaw,row?.values?.[5]].filter(v=>typeof v==='string');
  for(const raw of prices)if(/(?:CNY|RMB|USD|EUR|GBP|CAD|¥|￥|元)\s*[/／]\s*(?:CBM|m[³3]|立方米)(?![A-Za-z])/i.test(raw))return raw;
  return null;
 }
 function explicit(text){
  const result=[];text=String(text||'');
  const rules=[new RegExp('(?:始发(?:地|港)?|起运(?:地|港|[/／]服务)?|启运(?:地|港)?|装运港|装货港|出运港|发货地|origin(?:\\s+port)?|port\\s+of\\s+loading|\\bPOL)\\s*[:：=为是在自从]?\\s*('+list+')','gi'),new RegExp('('+list+')\\s*(?:始发|起运|启运|出运|发船|装船|直发|出发|发运|发货|出货)','gi'),new RegExp('('+list+')\\s*(?:→|->|—|–|-|至|到)\\s*(?:美国|加拿大|英国|欧洲|德国|美西|美东|US\\b|UK\\b|EU\\b)','gi')];
  for(const re of rules)for(const m of text.matchAll(re)){const before=text.slice(Math.max(0,m.index-8),m.index);if(negative(before)||/^\s*(?:以外|除外|之外)/.test(text.slice(m.index+m[0].length)))continue;result.push(...cities(m[1]))}
  return [...new Set(result)];
 }
 function classify(row){
  // Pricing unit is unconditional; only the actual channel can override geography.
  const unit=excludedUnit(row);if(unit)return {excluded:true,cities:[],evidence:'计价单位='+unit,reason:'按立方米计价（cbm），按运营范围排除'};
  const channel=[row?.channel,row?.values?.[2]].filter(v=>typeof v==='string').join('；');
  if(channel.includes('深圳'))return {excluded:false,cities:['深圳'],evidence:'渠道含深圳，保留非cbm报价'};
  const text=quoteText(row);
  const regions=[...new Set(text.match(/常州|上海|金华|义乌|华东/g)||[])];
  if(regions.length)return {excluded:true,cities:regions,evidence:'报价记录含'+regions.join('、'),reason:'报价记录含'+regions.join('、')+'，按运营范围排除'};
  const fields=['originCity','originPort','originLocation','departureCity','departurePort','departureLocation','startPort','portOfLoading','shippingOrigin','origin','始发地','始发港','始发城市','起运地','起运港','起运城市','发货地','发货城市','POL'];
  for(const key of fields){const raw=row?.[key];if(typeof raw!=='string'||!raw.trim()||/^(?:未知|待确认|未注明|不详)$/.test(raw.trim()))continue;if(/不是|不从|不在|^非|除外|以外/.test(raw))return {excluded:false,cities:[],evidence:key+'='+raw};const found=cities(raw);return {excluded:found.length>0&&found.every(c=>blocked.has(c)),cities:found,evidence:key+'='+raw}}
  // Some legacy parsers use originRaw for receiving-warehouse price labels;
  // those labels alone are not proof of the linehaul origin.
  if(typeof row?.originRaw==='string'&&row.originRaw.trim()&&!/交货|交仓|收货|揽收/.test(row.originRaw)){if(/不是|不从|不在|^非|除外|以外/.test(row.originRaw))return {excluded:false,cities:[],evidence:'originRaw='+row.originRaw};const found=cities(row.originRaw);if(found.length)return {excluded:found.every(c=>blocked.has(c)),cities:found,evidence:'originRaw='+row.originRaw}}
  const values=Array.isArray(row?.values)?row.values:[];
  const direct=[row?.channel,values[2],row?.terms,values[10]].filter(v=>typeof v==='string').join('；');let found=explicit(direct),evidence=direct;
  if(!found.length){evidence=String(row?.sourceSheet||'');found=explicit(evidence)}
  if(!found.length){evidence=Array.isArray(row?.sourceNotes)?row.sourceNotes.map(n=>typeof n==='string'?n:n?.value??n?.v??n?.raw??'').join('；'):String(row?.sourceNotes||'');found=explicit(evidence)}
  return {excluded:found.length>0&&found.every(c=>blocked.has(c)),cities:found,evidence};
 }
 const reason=decision=>decision.reason||'始发地明确为'+decision.cities.join('、')+'，按运营范围排除';
 function projectDatabase(db){return {...db,quotes:(db.quotes||[]).filter(r=>!classify(r).excluded),...(db.regionalQuotes?{regionalQuotes:db.regionalQuotes.filter(r=>!classify(r).excluded)}:{})}}
 function cleanDatabase(db,today){
  const cutoff=new Date(Date.parse(today+'T00:00:00Z')-9*86400000).toISOString().slice(0,10),audit=(db.originExcludedQuotes||[]).filter(e=>e?.row?.date>=cutoff),next=projectDatabase(db);let count=0;
  for(const [field,kind]of [['quotes','warehouse'],['regionalQuotes','regional']])for(const row of db[field]||[]){const decision=classify(row);if(decision.excluded){audit.push({kind,row,reason:reason(decision),excludedOn:today});count++}}
  return count||audit.length!==(db.originExcludedQuotes||[]).length?{...next,originExcludedQuotes:audit}:db;
 }
 function projectWorkbook(result){
  const excluded=[],keep=(rows,kind)=>(rows||[]).filter(row=>{const decision=classify(row);if(!decision.excluded)return true;excluded.push({kind,row,reason:reason(decision)});return false});
  const records=keep(result.records,'warehouse'),regionalRecords=keep(result.regionalRecords,'regional');if(!excluded.length)return result;
  const reports=(result.reports||[]).map(report=>{const removed=excluded.filter(e=>e.row.sourceSheet===report.sheet);return removed.length?{...report,status:(report.status||'已清洗')+'；按运营范围排除 '+removed.length+' 条',count:records.filter(r=>r.sourceSheet===report.sheet).length,regionalCount:regionalRecords.filter(r=>r.sourceSheet===report.sheet).length,exclusions:[...(report.exclusions||[]),...removed.map(e=>({row:e.row.sourceRow,priceCell:e.row.priceCell,reason:e.reason}))],originExcluded:removed.length}:report});
  return {...result,records,regionalRecords,reports,originExclusions:[...(result.originExclusions||[]),...excluded]};
 }
 const api={classify,projectDatabase,cleanDatabase,projectWorkbook};root.OriginExclusions=Object.freeze(api);if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:typeof self!=='undefined'?self:globalThis);

(function(root){
 'use strict';
 const M=root.MatrixImport||(typeof require==='function'?require('./matrix-import.js'):null),Q=root.QuoteCore||(typeof require==='function'?require('./quote-core.js'):null),D=root.Domain||(typeof require==='function'?require('./domain.js'):null);
 const endpoint=root.location?.hostname==='127.0.0.1'?'/local-ai-cleaning':'https://ops-center-cloud.xiaopong190-asin-radar.workers.dev/api/logistics-ai/recognize';
 const Audit=root.SheetQuoteAudit||(typeof require==='function'?require('./extensions/sheet-quote-audit.js'):null);
 const Context=root.AIQuoteContext||(typeof require==='function'?require('./extensions/ai-quote-context.js'):null);
 const cache=new Map(),inflight=new Map();
 const numeric=v=>/^\d+(?:\.\d+)?$/.test(String(v))&&Number(v)>0;
 function queue(model,result){
  const items=[],seen=new Set();let held=0,referenceRows=0;
  for(const [sheetIndex,sheet] of model.sheets.entries()){const contextIndex=Context?.index(sheet);const inspection=Audit?.inspect(sheet,result);let scanned;const blocks=()=>scanned??=M.scan(sheet);
   if(result.preflight?.find(x=>x.sheet===sheet.name)?.status==='reference'||result.preflight?.find(x=>x.sheet===sheet.name)?.status==='uncertain'&&!inspection?.candidateRows.length){referenceRows+=sheet.rows.length;continue;}if((result.referenceSheets||[]).some(s=>s.name===sheet.name)||M.effectiveKind(sheet)!=='报价'&&(!inspection?.candidateRows.length||Context&&!contextIndex.hasRateSignal)){referenceRows+=sheet.rows.length;continue;}if(!sheet.rows.length&&sheet.media?.length){held+=sheet.media.length;continue;}
   const extraRows=new Set(inspection?.candidateRows||[]);const evidence=result.cellAudit?.sheets.find(s=>s.name===sheet.name),report=result.reports?.find(s=>s.sheet===sheet.name),rows=new Set();
   for(const cell of evidence?.cells||[])if((!result.scopePriceCells||result.scopePriceCells.includes(cell.cell))&&['价格待核对','源表公式错误','公式缺少缓存值'].includes(cell.status))rows.add(cell.row);
   for(const issue of report?.issues||[])if(Number.isInteger(Number(issue.row)))rows.add(Number(issue.row));
   if(report?.status?.startsWith('未识别计费表头'))for(const row of sheet.rows)if(row.cells.some(c=>numeric(c.v))&&row.cells.some(c=>/[A-Z]{2,5}\d|商业地址|邮编|国家|区域/i.test(c.v)))rows.add(row.row);
   for(const rowNumber of extraRows)rows.add(rowNumber);
   for(const rowNumber of rows){const row=sheet.rows.find(r=>r.row===rowNumber);if(!row||seen.has(sheetIndex+':'+rowNumber))continue;seen.add(sheetIndex+':'+rowNumber);if(items.length>=400){held++;continue}
    const priceCells=[...new Set([...(evidence?.cells||[]).filter(c=>c.row===rowNumber&&['价格待核对','源表公式错误','公式缺少缓存值'].includes(c.status)&&(!result.scopePriceCells||result.scopePriceCells.includes(c.cell))).map(c=>c.cell),...(report?.issues||[]).filter(x=>Number(x.row)===rowNumber&&x.priceCell).map(x=>x.priceCell),...(report?.status?.startsWith('未识别计费表头')||extraRows.has(rowNumber)?row.cells.filter(c=>numeric(c.v)&&c.valueType!=='date').map(c=>c.cell):[])])];if(!priceCells.length)continue;const cells=row.cells.filter(c=>String(c.v).trim()).map(c=>({cell:c.cell,v:String(c.v)}));
    // Known exclusions do not become new AI destinations.
    const dests=blocks().filter(b=>rowNumber>b.header&&rowNumber<=b.end).map(b=>row.cells.find(c=>c.cell.match(/^[A-Z]+/)[0]===letters(b.destColumn))?.v||'');
    if(dests.length&&dests.every(raw=>M.overseas(raw)&&!M.destinations(raw).warehouses.length)){held++;continue;}
    const headerRows=sheet.rows.filter(r=>r.row<rowNumber&&(r.row>=rowNumber-3||blocks().some(b=>[b.header,b.header-1,b.header+1].includes(r.row)&&b.header<rowNumber&&rowNumber<=b.end))).slice(-6);
    const fallbackContext=extraRows.has(rowNumber)&&Audit?Audit.context(sheet,rowNumber):headerRows.flatMap(r=>r.cells).filter(c=>String(c.v).trim()).map(c=>({cell:c.cell,v:String(c.v)}));
    const context=Context?Context.context(sheet,rowNumber,fallbackContext,result.preflight?.find(d=>d.sheet===sheet.name),70,contextIndex):fallbackContext;
    if(context.length>70||[...cells,...context].some(c=>c.v.length>1200)||items.length>=400){held++;continue;}
    const parts=[];for(let offset=0;offset<priceCells.length;offset+=8)parts.push(priceCells.slice(offset,offset+8));for(const [part,selected]of parts.entries()){if(items.length>=400){held++;continue}const needed=cells.length<=24?cells:cells.filter(c=>!priceCells.includes(c.cell)||selected.includes(c.cell));if(needed.length>24){held++;continue}const proof=new Map(context.map(c=>[c.cell,c]));for(const c of cells)if(!needed.some(x=>x.cell===c.cell)&&proof.size<70)proof.set(c.cell,c);items.push({id:sheetIndex+':'+rowNumber+(parts.length>1?':'+part:''),sheet:sheet.name,row:rowNumber,priceCells:selected,cells:needed,context:[...proof.values()]});}
   }
  }
  return {items,held,referenceRows};
 }
 function letters(n){let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
 function column(address){let n=0;for(const c of address.match(/^[A-Z]+/)[0])n=n*26+c.charCodeAt(0)-64;return n;}
 function unitOf(text){const units=[];if(/(?:^|[^A-Z])KG(?:$|[^A-Z])|公斤/i.test(text))units.push('kg');if(/CBM|立方|按方/i.test(text))units.push('cbm');if(/柜|\b\d{2}(?:HQ|GP|HC|RF)\b/i.test(text))units.push('柜');return units.length===1?units[0]:'';}
 function proposals(item,answer,meta,model){
  const sheet=model.sheets.find(s=>s.name===item.sheet),row=sheet?.rows.find(r=>r.row===item.row),cells=new Map([...item.context,...item.cells].map(c=>[c.cell,c.v]));
  if(!row||!answer||answer.id!==item.id||!['quote','reference','invalid','unresolved'].includes(answer.status)||typeof answer.reason!=='string'||answer.reason.length>200||!Array.isArray(answer.quotes)||answer.quotes.length>12)throw Error('AI复核结果不匹配');
  if(answer.status!=='quote'){if(answer.quotes.length)throw Error('非报价分类不得生成报价');return {records:[],regionalRecords:[]};}
  const records=[],regionalRecords=[];
  for(const p of answer.quotes){
   if(meta.allowedPriceCells&&!meta.allowedPriceCells.includes(p.priceCell))throw Error('AI不得增加本次未选择的计费档');if(!['warehouse','region'].includes(p.kind)||!item.priceCells?.includes(p.priceCell)||!item.cells.some(c=>c.cell===p.priceCell)||!cells.has(p.destinationCell)||!cells.has(p.unitCell)||!cells.has(p.channelCell))throw Error('AI引用了原表之外的字段');
   if([p.destinationCell,p.unitCell,p.channelCell].includes(p.priceCell))throw Error('价格不能引用目的地、单位或渠道单元格');if(Context&&!Context.applies(sheet,p.destinationCell,item.row))throw Error('AI目的地不是本行或本行真实合并区域的字段');const raw=cells.get(p.destinationCell),unit=unitOf(cells.get(p.unitCell));if(!unit||p.unit!==unit)throw Error('AI计费单位缺少唯一原文依据');
   const price=M.sourcePrice(row,column(p.priceCell)),amount=D.cents(price.value);if(amount<=0)throw Error('AI不得修造缺失或错误价格');
   const declared=M.geography(item.sheet+' '+[...item.context,...item.cells].filter(c=>c.cell===p.countryCell).map(c=>c.v).join(' ')).countries;
   const channel=D.clean(cells.get(p.channelCell)).replace(/^下单渠道[：:]\s*/,'');D.text(channel,'渠道',100);
   const tariff=Context?Context.tariff(item,p):{terms:'档='+D.clean(cells.get(p.unitCell))+';条件='+M.tax(cells.get(p.unitCell)+' '+channel)},terms=tariff.terms,currency=tariff.currency||meta.currency||'CNY';D.text(terms,'计费条件',200);
   const proof={sourceSheet:item.sheet,sourceRow:item.row,priceCell:p.priceCell,sourcePriceRaw:price.sourcePriceRaw,priceNormalization:price.priceNormalization||'',aiRecovered:true,aiReason:answer.reason,aiEvidence:{destinationCell:p.destinationCell,unitCell:p.unitCell,channelCell:p.channelCell,tierCell:tariff.tierCell||p.unitCell},timeUnverified:true,leadRaw:'',timeNote:'AI补清洗未推断时效，保留为空'};
   if(p.kind==='region'){
    if(!M.regional(raw)||declared.length!==1||declared[0]!==p.country||M.overseas(raw))throw Error('AI区域或国家缺少明确原文依据');
    regionalRecords.push({...proof,company:meta.company,country:p.country,channel,regionRaw:raw,price:amount,currency,unit,date:D.date(meta.date),terms});
   }else{
    if(M.overseas(raw)||/沃尔玛|WMT[-_]|TikTok|TK[-_]/i.test(raw)||!Array.isArray(p.warehouses)||!p.warehouses.length||p.warehouses.length>40)throw Error('AI不能把非AMZ或混合平台改成AMZ仓库');
    const compact=raw.toUpperCase().replace(/\b(?:AMZ|FBA|FC)\b/g,'').replace(/[^A-Z0-9]/g,'');if(p.warehouses.join('')!==compact||new Set(p.warehouses).size!==p.warehouses.length)throw Error('AI仓号不得增加、替换或丢失原字符');
    for(const code of p.warehouses){if(!/^(?:[A-Z]{2,5}\d{1,3}|[A-Z]{4})$/.test(code))throw Error('AI仓号格式无效');const archive=M.warehouseIndex(meta)(code);if(archive.conflict||declared.length>1&&!archive.country)throw Error('AI国家归属不唯一');const nation=archive.country||(declared.length===1?declared[0]:'');if(!nation||nation!==p.country||archive.country&&declared.length===1&&archive.country!==declared[0])throw Error('AI国家与原文或档案冲突');const values=[meta.company,nation,channel,code,price.value,currency,unit,null,null,D.date(meta.date),terms];Q.normalize(values);records.push({...proof,values,warehouseCell:p.destinationCell,warehouseRaw:raw,warehouseOriginalRaw:raw,sourceCountryBasis:archive.country?'AI拆分后按仓库档案反查':'AI映射原表明确国家'});}
   }
  }
  if(!records.length&&!regionalRecords.length)throw Error('AI报价分类没有可验证结果');return {records,regionalRecords};
 }
 function merge(result,items,answers,meta,model){
  if(!Array.isArray(answers)||answers.length!==items.length||new Set(answers.map(a=>a?.id)).size!==items.length)throw Error('AI复核返回数量或标识不匹配');
  const records=result.records.slice(),regionalRecords=result.regionalRecords.slice(),seen=new Set(records.map(r=>Q.identity(Q.normalize(r.values)))),sourceKey=r=>r.sourceSheet+'!'+r.priceCell+'!'+r.values[3],sources=new Set(records.map(sourceKey)),regionKey=r=>JSON.stringify([r.company,r.country,r.channel,r.regionRaw,r.currency,r.unit,r.terms,r.date]),regions=new Map(regionalRecords.map(r=>[regionKey(r),r]));let recovered=0,references=0,unresolved=0;const decisions=[];
  for(const item of items){const answer=answers.find(a=>a?.id===item.id);try{const added=proposals(item,answer,meta,model);let missingPrices=[];const stagedRegions=new Map(regions);for(const r of added.regionalRecords){const key=regionKey(r),prior=stagedRegions.get(key);if(prior&&prior.price!==r.price)throw Error('AI补清洗与已通过区域报价冲突');stagedRegions.set(key,r)}for(const r of added.records){const id=Q.identity(Q.normalize(r.values));if(!seen.has(id)&&!sources.has(sourceKey(r))){seen.add(id);sources.add(sourceKey(r));records.push(r);recovered++;}}for(const r of added.regionalRecords){const prior=regions.get(regionKey(r));if(prior&&prior.price!==r.price)throw Error('AI补清洗与已通过区域报价冲突');if(!prior){regions.set(regionKey(r),r);regionalRecords.push(r);recovered++;}}if(answer.status==='quote'){const mapped=new Set([...added.records,...added.regionalRecords].map(r=>r.priceCell)),missing=(item.priceCells||[]).filter(c=>!mapped.has(c));if(missing.length){unresolved+=missing.length;missingPrices=missing;}}if(answer.status==='reference')references++;if(['invalid','unresolved'].includes(answer.status))unresolved++;decisions.push({id:item.id,sheet:item.sheet,row:item.row,status:answer.status,reason:answer.reason+(missingPrices.length?'；候选价格尚未映射：'+missingPrices.join('、'):''),unmappedPriceCells:missingPrices});}catch(error){unresolved++;decisions.push({id:item.id,sheet:item.sheet,row:item.row,status:'unresolved',reason:error.message});}}
  return {records,regionalRecords,recovered,references,unresolved,decisions};
 }
 async function review(model,result,meta,onProgress=()=>{}){
  const started=Date.now(),budgetMs=45000;const planned=queue(model,result),totals={...result,records:result.records.slice(),regionalRecords:result.regionalRecords.slice()},review={status:'completed',queued:planned.items.length,held:planned.held,referenceRows:planned.referenceRows,completed:0,recovered:0,references:0,unresolved:planned.held,decisions:[]};totals.aiReview=review;
  if(!planned.items.length){review.status=planned.held?'partial':'skipped';if(planned.held)review.reason='图片或超限片段已留档，当前AI未处理';return finalize(model,totals);}
  if(root.LogisticsSpace?.isDemo){review.status='unavailable';review.reason='演示空间不调用AI';review.unresolved+=planned.items.length;return finalize(model,totals);}
  const token=root.localStorage?.getItem('ops-cloud-session-v1');if(!token){review.status='unavailable';review.reason='未登录，AI复核未运行';review.unresolved+=planned.items.length;return finalize(model,totals);}
  for(let i=0;i<planned.items.length;i+=12){if(Date.now()-started>=budgetMs){review.status='partial';review.reason='本批AI复核时间预算已到，剩余原文保留，可再次清洗继续核对';review.unresolved+=planned.items.length-i;break}const items=planned.items.slice(i,i+12),body=JSON.stringify({purpose:'quote-cleaning',exception:true,items}),key=token+'\n'+body;
   try{let data=cache.get(key);if(!data){let task=inflight.get(key);if(!task){task=(async()=>{const response=await root.fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body,signal:AbortSignal.timeout(Math.max(1,Math.min(35000,budgetMs-(Date.now()-started))))});if(!response.ok){const reasons={401:'登录已失效',403:'当前账号无AI复核权限',429:'AI复核额度已用完',503:'AI服务未配置',504:'AI复核超时'};throw Error(reasons[response.status]||'AI复核服务暂不可用');}const text=await response.text();if(text.length>150000)throw Error('AI返回内容过大');return JSON.parse(text);})().finally(()=>inflight.delete(key));inflight.set(key,task);}data=await task;}
    const applied=merge(totals,items,data.items,meta,model);if(!applied.unresolved)cache.set(key,data);else cache.delete(key);totals.records=applied.records;totals.regionalRecords=applied.regionalRecords;review.completed+=items.length;review.recovered+=applied.recovered;review.references+=applied.references;review.unresolved+=applied.unresolved;review.decisions.push(...applied.decisions);onProgress({...review});
   }catch(error){review.status='partial';review.reason=error?.name==='TimeoutError'||error?.name==='AbortError'?'AI复核超时':error.message||'AI复核暂不可用';review.unresolved+=planned.items.length-i;break;}
  }
  if(totals.records.length>10000||totals.regionalRecords.length>10000)throw Error('AI补清洗后超过导入上限，请分文件导入');
  if(result.cellAudit)totals.cellAudit=M.cellAudit(model,totals);return finalize(model,totals);
 }
 function finalize(model,result){if(!Context)return result;const recovered=new Set([...(result.records||[]),...(result.regionalRecords||[])].filter(r=>r.aiRecovered).map(r=>r.sourceSheet));if(result.preflight)result.preflight=result.preflight.map(d=>d.status==='uncertain'&&recovered.has(d.sheet)?{...d,status:'quote',ai:true,reason:'AI已定位原表字段并通过本地价格、单位、国家及档位证据校验'}:d);result.cleaningOutcomes=Context.outcomes(model,result);result.reports=(result.reports||[]).map(r=>{const out=result.cleaningOutcomes.find(o=>o.sheet===r.sheet);return {...r,count:result.records.filter(x=>x.sourceSheet===r.sheet).length,regionalCount:result.regionalRecords.filter(x=>x.sourceSheet===r.sheet).length,...(out?.stage==='extraction-blocked'?{status:'已确认有报价，但未完成提取：'+out.reason}:recovered.has(r.sheet)?{status:'AI原表字段核验通过，候选报价待入库校验'}:{})}});return result}
 const api={queue,unitOf,proposals,merge,review,finalize};root.CleaningReview=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

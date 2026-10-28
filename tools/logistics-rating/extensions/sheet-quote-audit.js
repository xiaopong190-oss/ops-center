(function(root){'use strict';
const nonempty=c=>String(c.v??'').trim(),numeric=c=>/^\d+(?:\.\d+)?$/.test(nonempty(c))&&Number(c.v)>0&&c.valueType!=='date';
const signal=v=>/报价|单价|价格|计费|运费|包税|不包税|KG|CBM|公斤|立方|USD|CNY|RMB|起重|目的地|仓库|邮编/i.test(v);
function inspect(sheet,result={}){
 const rows=(sheet.rows||[]).filter(r=>r.cells.some(nonempty)),covered=new Set();
 for(const record of [...(result.records||[]),...(result.regionalRecords||[]),...(result.rejectedRecords||[]).map(x=>x.record||{})])if(record.sourceSheet===sheet.name&&record.priceCell)covered.add(record.priceCell);
 const reference=(result.referenceSheets||[]).some(x=>x.name===sheet.name)||/^(?:入仓单|仓库操作收费标准|邮编库|船期|说明|赔付说明)$/.test(sheet.name.trim());
 let hasContext=false;const candidateRows=[];
 if(!reference)for(const row of rows){if(row.cells.some(c=>signal(nonempty(c))))hasContext=true;const prices=row.cells.filter(numeric);if(!prices.length||prices.every(c=>covered.has(c.cell)))continue;const text=row.cells.map(nonempty).join(' ');if(/^(?:合计|总计|汇率|赔偿|赔付)/.test(text.trim()))continue;
  const literal=signal(text)||hasContext;
  if(literal&&row.cells.some(c=>/[A-Za-z\u4e00-\u9fa5]/.test(nonempty(c))&&!numeric(c)))candidateRows.push(row.row);
 }
 return {sheet:sheet.name,scannedRows:rows.length,lastRow:rows.at(-1)?.row||0,reference,candidateRows,warehouse:(result.records||[]).filter(x=>x.sourceSheet===sheet.name).length,regional:(result.regionalRecords||[]).filter(x=>x.sourceSheet===sheet.name).length};
}
function context(sheet,rowNumber,limit=70){const rows=sheet.rows.filter(r=>r.row<rowNumber&&r.cells.some(nonempty)),close=rows.filter(r=>rowNumber-r.row<=12).slice(-8),headers=rows.filter(r=>r.cells.some(c=>signal(nonempty(c)))).slice(-12);const headerCells=headers.flatMap(r=>r.cells).filter(c=>nonempty(c)).slice(-Math.floor(limit*0.7)),nearCells=close.flatMap(r=>r.cells).filter(c=>nonempty(c)).slice(-Math.floor(limit*0.3));const chosen=new Map();for(const c of [...headerCells,...nearCells])chosen.set(c.cell,{cell:c.cell,v:String(c.v)});return [...chosen.values()].slice(0,limit)}
function project(model,result){const sheetAudit=model.sheets.map(s=>inspect(s,result));return {...result,sheetAudit,reports:(result.reports||[]).map(r=>{const a=sheetAudit.find(x=>x.sheet===r.sheet);return a?{...r,scanRows:a.scannedRows,suspectedRows:a.candidateRows.length,status:a.candidateRows.length?r.status+'；另有 '+a.candidateRows.length+' 行疑似报价待AI复核':r.status}:r})}}
const api={inspect,context,project};root.SheetQuoteAudit=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

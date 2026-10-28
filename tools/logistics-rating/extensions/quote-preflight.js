(function(root){'use strict';
const clean=v=>String(v??'').trim(),price=v=>/^\d+(?:\.\d+)?$/.test(clean(v))&&Number(v)>0;
const dest=/仓库|目的地|目的国|国家|区域|邮编|地址|destination|warehouse|country/i,unit=/KG|CBM|公斤|立方|每柜|柜型|20GP|40GP|40HQ|计费单位|计费重/i;
const reference=/^(?:合计|总计|汇率|赔付|赔偿|保险|附加费|操作费|注意事项|说明|备注|船期|入仓资料)/;
const column=c=>c.cell.match(/^[A-Z]+/)?.[0];
function inspect(sheet){
 const rows=(sheet.rows||[]).filter(r=>r.cells.some(c=>clean(c.v))),blocks=[];let header=null,pendingDestination=null;
 for(const row of rows){const text=row.cells.map(c=>clean(c.v)).join(' ');if(reference.test(text.trim())){header=null;pendingDestination=null;continue}
  const ownDestination=row.cells.find(c=>/收件地址|目的地|仓库代码|仓库编号|目的国|区域|邮编|destination|warehouse/i.test(clean(c.v)))||row.cells.find(c=>dest.test(clean(c.v)));if(ownDestination)pendingDestination={cell:ownDestination,row:row.row,priceHint:/单价|价格|运费|unit price|rate/i.test(text)};const destination=ownDestination||(pendingDestination&&row.row-pendingDestination.row<=6?pendingDestination.cell:null),rate=row.cells.find(c=>unit.test(clean(c.v)));
  const rateEvidence=/\d+(?:\.\d+)?\s*(?:KG|CBM)|(?:CNY|USD|RMB|¥|￥)|单价|价格|运费|unit price|rate/i.test(clean(rate?.v))||/单价|价格|运费|unit price/i.test(text)||pendingDestination?.priceHint;
  if(destination&&rate&&rateEvidence){header={start:pendingDestination?.row||row.row,end:row.row,header:row.row,destinationCell:destination.cell,unitCell:rate.cell,priceCells:[],destinationColumn:column(destination),postal:/邮编/.test(clean(destination.v))};continue}
  if(header){header.end=row.row;const destinationValue=row.cells.find(c=>column(c)===header.destinationColumn),prices=row.cells.filter(c=>column(c)!==header.destinationColumn&&c.valueType!=='date'&&price(c.v));
   if(destinationValue&&(/[A-Za-z\u4e00-\u9fa5]/.test(clean(destinationValue.v))||header.postal&&/^\d{2,}/.test(clean(destinationValue.v)))&&prices.length){if(!blocks.includes(header))blocks.push(header);header.end=row.row;header.priceCells.push(...prices.map(c=>c.cell))}}
 }
 const media=(sheet.media||[]).length>0,nonempty=rows.length>0;
 return {sheet:sheet.name,status:blocks.length?'quote':nonempty||media?'uncertain':'reference',reason:blocks.length?'原表目的地、计费单位/档位及对应数值形成报价区块':media?'含图片，未完成图片报价识别':nonempty?'未确认完整报价关系，不能判为无报价':'空表无可清洗单元格',scannedRows:rows.length,blocks:blocks.map(({destinationColumn,...b})=>b)};
}
function sample(sheet){const rows=sheet.rows.filter(r=>r.cells.some(c=>clean(c.v))),selected=new Map();const add=r=>{if(r)for(const c of r.cells.slice(0,16))if(clean(c.v))selected.set(c.cell,{cell:c.cell,v:clean(c.v).slice(0,600)})};for(const r of rows.slice(0,8))add(r);const candidates=rows.filter(r=>r.cells.some(c=>dest.test(clean(c.v))||unit.test(clean(c.v)))||r.cells.some(c=>price(c.v))&&r.cells.some(c=>/[A-Za-z\u4e00-\u9fa5]/.test(clean(c.v))));for(let i=0;i<12;i++)add(candidates[Math.floor(i*Math.max(0,candidates.length-1)/11)]);const all=[...selected.values()];if(all.length<=160)return all;const chosen=new Map();for(const c of all.slice(0,40))chosen.set(c.cell,c);for(let i=0;i<120;i++){const c=all[Math.floor(i*(all.length-1)/119)];chosen.set(c.cell,c)}return [...chosen.values()].slice(0,160)}
function applyAI(sheet,decision,answer,cells){
 if(!answer||!['quote','reference','uncertain'].includes(answer.status)||typeof answer.reason!=='string'||answer.reason.length>250||!Array.isArray(answer.blocks)||answer.blocks.length>12)throw Error('AI报价判断结构无效');
 const source=new Map(cells.map(c=>[c.cell,c])),actual=new Map(sheet.rows.flatMap(r=>r.cells).map(c=>[c.cell,c])),blocks=[];
 if(answer.status==='quote'){for(const b of answer.blocks){if(!b||!Number.isInteger(b.start)||!Number.isInteger(b.end)||b.start<1||b.end<b.start||!sheet.rows.some(r=>r.row===b.start)||!sheet.rows.some(r=>r.row===b.end)||![b.destinationCell,b.unitCell,b.priceCell].every(c=>source.has(c)&&actual.has(c))||!price(actual.get(b.priceCell).v)||!unit.test(actual.get(b.unitCell).v)||!clean(actual.get(b.destinationCell).v))throw Error('AI报价判断缺少有效原表证据');const priceRow=Number(b.priceCell.match(/\d+$/)[0]);if(priceRow<b.start||priceRow>b.end)throw Error('AI报价区块不包含源价格');blocks.push({start:b.start,end:b.end,destinationCell:b.destinationCell,unitCell:b.unitCell,priceCells:[b.priceCell]})}if(!blocks.length)throw Error('AI确认报价却没有原表区块')}
 // A bounded sample cannot establish absence throughout a longer or image-based sheet.
 const referenceEvidence=cells.some(c=>/说明|赔偿|赔付|操作费|附加费|船期|汇率|入仓|条款|注意/.test(c.v));const complete=referenceEvidence&&sheet.rows.flatMap(r=>r.cells).filter(c=>clean(c.v)).every(c=>source.has(c.cell))&&!(sheet.media||[]).length;
 return {...decision,status:answer.status==='reference'&&!complete?'uncertain':answer.status,reason:answer.reason,blocks,ai:true};
}
function plan(model){return model.sheets.map(inspect)}
function select(model,decisions){return {...model,sheets:model.sheets.map((s,i)=>{const d=decisions[i];if(d?.sheet!==s.name)throw Error('工作表判断与原表不匹配');return {...s,rows:d.status==='quote'?s.rows.filter(r=>d.blocks.some(b=>r.row>=b.start&&r.row<=b.end||r.row<Math.min(...d.blocks.map(x=>x.start))&&r.cells.every(c=>!price(c.v)))):[]}})}}
function finish(model,result,decisions){const reports=model.sheets.map((s,i)=>{const d=decisions[i],r=result.reports.find(x=>x.sheet===s.name)||{sheet:s.name,count:0,regionalCount:0,issues:[]};return {...r,preflight:d.status,scanRows:d.scannedRows,status:d.status==='quote'?(r.count||r.regionalCount?r.status:'已确认有报价，但未能提取；原表保留待适配'):d.status==='reference'?'确认无基础报价，参考原文保留':'报价性质未确认，暂未清洗；原文保留',preflightReason:d.reason}});return {...result,reports,preflight:decisions}}
const api={inspect,sample,applyAI,plan,select,finish};root.QuotePreflight=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

(function(root){'use strict';
// Pure projection: explicit source labels and merged ranges own their fields.
const M=root.MatrixImport||(typeof require==='function'?require('../matrix-import.js'):null),Q=root.QuoteCore||(typeof require==='function'?require('../quote-core.js'):null);
const clean=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' '),col=a=>[...a.match(/^[A-Z]+/)[0]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0),rowOf=c=>Number(c.cell.match(/\d+$/)[0]);
function merged(sheet,row,column){const direct=sheet.rows.find(r=>r.row===row)?.cells.find(c=>col(c.cell)===column);if(clean(direct?.v))return direct;for(const ref of sheet.merges||[]){const m=ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);if(m&&row>=+m[2]&&row<=+m[4]&&column>=col(m[1])&&column<=col(m[3]))return sheet.rows.find(r=>r.row===+m[2])?.cells.find(c=>col(c.cell)===col(m[1]))}return null}
function context(sheet,record,blocks=M.scan(sheet)){
 const block=blocks.find(b=>record.sourceRow>b.header&&record.sourceRow<=b.end&&b.columns.some(c=>col(record.priceCell)===c.column));if(!block)return null;
 const markers=sheet.rows.filter(r=>r.row<=block.header&&r.row>=block.header-4).flatMap(r=>r.cells).filter(c=>/^下单渠道\s*[:：]?$/.test(clean(c.v)));
 // Parallel channel groups already have their own adapter; do not guess their scope.
 if(markers.length!==1)return null;const marker=markers[0],n=col(marker.cell);if(n>=Math.min(...block.columns.map(c=>c.column)))return null;
 const markerRow=sheet.rows.find(r=>r.row===rowOf(marker)),adjacent=markerRow.cells.find(c=>col(c.cell)===n+1),horizontal=clean(adjacent?.v)&&!/^是否包税|包税方式|计费|区域|邮编/.test(clean(adjacent.v));
 const channel=horizontal?adjacent:merged(sheet,record.sourceRow,n);
 const valid=horizontal||channel&&rowOf(channel)!==rowOf(marker);
 return {block,marker,channel:valid?channel:null,horizontal};
}
function taxEvidence(sheet,ctx,channel){
 const sources=[channel];for(const row of sheet.rows.filter(r=>r.row<=ctx.block.header&&r.row>=ctx.block.header-4))for(const c of row.cells){
  if(/^(?:是否包税|包税方式|税务方式|税费方式)\s*[:：]?$/.test(clean(c.v))){const value=merged(sheet,row.row,col(c.cell)+1);if(value)sources.push(value);}
 }
 const proofs=sources.filter(Boolean).map(c=>({cell:c.cell,raw:String(c.v)}));
 const meaningful=proofs.filter(p=>/包税|含税|未税|税费|递延/.test(p.raw));
 const modes=meaningful.map(p=>{let value=clean(p.raw);if(/可选|任选|是否|待定|待确认|不保证|不承诺|不是|不支持|不接受|不做|不采用|不适用|不提供|禁止/.test(value))return 'unknown';const excluded=/不包税|不含税|未税|未含税|未包税|没有包税|非包税|递延|税费自理/.test(value);value=value.replace(/不包税|不含税|未含税|未包税|没有包税|非包税/g,'');const included=/包税|含税/.test(value);return excluded===included?'unknown':included?'included':'excluded'}),unique=[...new Set(modes)];
 return {value:unique.length===1&&unique[0]==='included'?'包税':unique.length===1&&unique[0]==='excluded'?'不含税':'税务待确认',proofs:meaningful};
}
function timeEvidence(sheet,ctx,record){
 const headers=sheet.rows.filter(r=>r.row<=ctx.block.header&&r.row>=ctx.block.header-4).flatMap(r=>r.cells),candidates=[];
 for(const header of headers){
  const label=clean(header.v);if(!/时效|天数/.test(label)||/赔付|理赔|延时赔偿|延时赔付/.test(label))continue;
  const cell=merged(sheet,record.sourceRow,col(header.cell));if(cell)candidates.push({cell,header});
 }
 // A compensation column can contain an explicitly labelled reference promise.
 for(const c of sheet.rows.find(r=>r.row===record.sourceRow)?.cells||[]){if(/(?:参考时效|时效参考)\s*[:：]/.test(c.v))candidates.push({cell:c,header:null});}
 // Only an explicit merged range may share that reference with adjacent regions.
 if(!candidates.length)for(const header of headers.filter(c=>/时效|赔付/.test(c.v))){const cell=merged(sheet,record.sourceRow,col(header.cell));if(cell&&/(?:参考时效|时效参考)\s*[:：]/.test(cell.v))candidates.push({cell,header:null});}
 const parsed=[];
 for(const {cell,header} of candidates){
  let raw=String(cell.v),reference=raw.match(/(?:参考时效|时效参考)\s*[:：]\s*([^，,；;\n]+)/);if(reference)raw=reference[1];
  if(!reference&&/赔付|赔偿|赔付封顶/.test(raw))continue;
  const ranges=[...raw.matchAll(/(\d{1,3})\s*[-–~～至]\s*(\d{1,3})\s*个?(自然日|工作日|天|日)/g)];if(ranges.length!==1)continue;
  const match=ranges[0],min=+match[1],max=+match[2];if(min>max||max>365)continue;
  const headerRaw=clean(header?.v),scope=raw+' '+headerRaw,start=/开船(?:后)?次日|开船.{0,4}第二天/.test(scope)?'开船次日':scope.match(/起飞|开船|发车|入仓|收货/)?.[0]||'',end=scope.match(/提取|签收|交仓|到港/)?.[0]||'',days=match[3]==='工作日'?'工作日':'自然日';
  parsed.push({min,max,leadRaw:raw,timeBasis:start&&end?start+'至'+end+'/'+days:'',timeUnverified:!start||!end,timeNote:'原表参考时效；'+(end?end+'口径':'起止口径未明确')+'，不得当作其他时效口径',sourceTimeCell:cell.cell,sourceTimeRaw:String(cell.v),sourceTimeHeaderCell:header?.cell||null,sourceTimeHeaderRaw:header?String(header.v):'',timeDays:days});
 }
 const unique=new Map(parsed.map(p=>[JSON.stringify([p.min,p.max,p.timeBasis,p.timeDays]),p]));return unique.size===1?[...unique.values()][0]:null;
}
function project(model,result){
 const sheets=new Map(model.sheets.map(s=>[s.name,s])),scans=new Map(),audit=[];
 const regionalRecords=(result.regionalRecords||[]).map(record=>{
  const sheet=sheets.get(record.sourceSheet);if(sheet&&!scans.has(sheet))scans.set(sheet,M.scan(sheet));const ctx=sheet&&context(sheet,record,scans.get(sheet));if(!ctx)return record;
  const channel=clean(ctx.channel?.v);if(!channel||channel.length>100||/^下单渠道|华南$|华东$|华北$|起运地|始发地/.test(channel)){audit.push({sheet:sheet.name,priceCell:record.priceCell,status:'待核对',reason:'渠道标签存在，但渠道值为空或无法唯一确定'});return {...record,sourceFieldIssue:'渠道标签存在，但渠道值为空或无法唯一确定'};}
  const tax=taxEvidence(sheet,ctx,ctx.channel),time=timeEvidence(sheet,ctx,record),terms=String(record.terms||'').replace(/(?:^|[;；])\s*条件=[^;；]*/g,'').replace(/^[;；]/,'')+';条件='+tax.value;
  const next={...record,channel,terms,sourceChannelCell:ctx.channel.cell,sourceChannelRaw:String(ctx.channel.v),sourceChannelHeaderCell:ctx.marker.cell,taxEvidence:tax.proofs,sourceFieldsRule:'regional-source-fields-v1',...(time||{min:null,max:null,timeBasis:'',timeUnverified:true,timeNote:'原表时效无法唯一确认，原文保留待核对'})};
  audit.push({sheet:sheet.name,priceCell:record.priceCell,status:tax.value==='税务待确认'?'税务待确认':'已按原表字段核验',channelCell:ctx.channel.cell,timeCell:time?.sourceTimeCell||null,taxCells:tax.proofs.map(p=>p.cell)});return next;
 });
 if(!audit.length)return result;
 const blocked=regionalRecords.filter(r=>r.sourceFieldIssue),accepted=regionalRecords.filter(r=>!r.sourceFieldIssue),rejectedRecords=[...(result.rejectedRecords||[]),...blocked.map(record=>({kind:'regional',record,reason:record.sourceFieldIssue}))];
 const reports=(result.reports||[]).map(report=>{const own=audit.filter(a=>a.sheet===report.sheet);if(!own.length)return report;const issues=own.filter(a=>a.status==='待核对').map(a=>({priceCell:a.priceCell,message:a.reason}));return {...report,regionalCount:accepted.filter(r=>r.sourceSheet===report.sheet).length,issues:[...(report.issues||[]),...issues],status:'原表渠道、税务与时效字段已核验；仍需统一入库校验'};});
 const next={...result,regionalRecords:accepted,rejectedRecords,reports,sourceFieldAudit:audit};
 next.cellAudit=M.cellAudit(model,next);next.omissions=M.omissionAudit(model,next);return next;
}
function admission(result,today){
 const partition=Q.partitionRegional(result.regionalRecords||[],today),reasons={};for(const item of partition.exceptions)reasons[item.reason]=(reasons[item.reason]||0)+1;
 return {generated:(result.regionalRecords||[]).length,accepted:partition.accepted.length,pending:partition.exceptions.length,reasons,bySheet:[...new Set((result.regionalRecords||[]).map(r=>r.sourceSheet))].map(sheet=>({sheet,accepted:partition.accepted.filter(r=>r.sourceSheet===sheet).length,pending:partition.exceptions.filter(e=>JSON.parse(e.raw).sourceSheet===sheet).length}))};
}
const localDay=instant=>instant.getFullYear()+'-'+String(instant.getMonth()+1).padStart(2,'0')+'-'+String(instant.getDate()).padStart(2,'0');
const api={merged,context,taxEvidence,timeEvidence,project,admission,localDay};root.RegionalSourceFields=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);

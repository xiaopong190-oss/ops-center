(function(root){'use strict';
const M=root.MatrixImport||(typeof require==='function'?require('../matrix-import.js'):null);
const text=v=>String(v??'').trim(),column=a=>[...a.match(/^[A-Z]+/)[0]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
const get=(row,n)=>row?.cells.find(c=>column(c.cell)===n);
function layouts(sheet){
 if(['hidden','veryHidden'].includes(sheet.hidden)||M.sheetKind(sheet.name)!=='报价'||!/空运|空派|air/i.test(sheet.name))return [];
 return M.scan(sheet).filter(b=>b.evidenceLayout&&b.prefix).map(b=>{
  const header=sheet.rows.find(r=>r.row===b.header),countryCell=header.cells.find(c=>/^(国家|目的国|目的国家|country)$/i.test(text(c.v)));
  const rows=[];for(const row of sheet.rows.filter(r=>r.row>b.header&&r.row<=b.end)){const raw=text(get(row,b.destColumn)?.v),label=text(get(row,1)?.v);if(/^(备注|说明|附加费|操作费|赔偿|赔付|计费方式)/.test(label)||!b.columns.some(c=>text(get(row,c.column)?.v)))break;if(!M.prefixRange(raw)&&!(/^[\d\s,，、-]+$/.test(raw)||countryCell&&M.geography(label).countries.length||/^[A-Z]{3}(?:\s*[,，]\s*[A-Z]{3})*$/.test(label)))break;rows.push(row)}
  return {...b,end:rows.at(-1)?.row||b.header,rows,countryColumn:countryCell?column(countryCell.cell):null};
 }).filter(b=>b.rows.length);
}
function countryEvidence(sheet,block,row){
 const proofs=[],own=block.countryColumn?get(row,block.countryColumn):null;
 if(block.countryColumn){const raw=text(own?.v),nations=M.geography(raw).countries;if(nations.length!==1||/除外|以外|不含|不支持/.test(raw))return {reason:'原表国家为空、冲突或无法唯一确认'};proofs.push({cell:own.cell,raw:own.v,country:nations[0]})}
 const named=M.geography(sheet.name).countries;for(const country of named)proofs.push({cell:null,raw:sheet.name,country});
 for(const r of sheet.rows.filter(r=>r.row<block.header&&r.row>=block.header-3))for(const c of r.cells){
  const raw=text(c.v);if(/不飞|不至|不支持|不含|除外|禁止/.test(raw))continue;
  for(const match of raw.matchAll(/(?:直飞|飞往|运往|送达|目的国[：:]?|目的地[：:]?)\s*(美国|加拿大|英国|德国|法国|日本|澳大利亚)/g))for(const country of M.geography(raw.slice(match.index+match[0].length-match[1].length)).countries)proofs.push({cell:c.cell,raw:c.v,country});
 }
 const nations=[...new Set(proofs.map(p=>p.country))];return nations.length===1?{country:nations[0],proofs}:{reason:nations.length?'原表国家证据冲突，保留待核对':'原表缺少明确目的国家，保留待核对',proofs};
}
function inspect(sheet){const blocks=layouts(sheet).map(b=>({start:Math.max(1,b.header-3),header:b.header,end:b.end,destinationCell:get(sheet.rows.find(r=>r.row===b.header),b.destColumn).cell,unitCell:b.columns[0].cell,priceCells:b.rows.flatMap(r=>b.columns.map(c=>get(r,c.column)).filter(c=>c&&/^\d+(?:\.\d+)?$/.test(text(c.v))&&Number(c.v)>0).map(c=>c.cell))})).filter(b=>b.priceCells.length);return blocks.length?{sheet:sheet.name,status:'quote',reason:'原表空运渠道、邮编前缀、重量档及价格形成报价区块',scannedRows:sheet.rows.length,blocks}:null}
function project(model,result,meta){
 const targets=model.sheets.map(sheet=>({sheet,blocks:layouts(sheet)})).filter(t=>t.blocks.length);if(!targets.length)return result;
 const keys=new Set(targets.flatMap(t=>t.blocks.flatMap(b=>b.rows.flatMap(r=>b.columns.map(c=>t.sheet.name+'!'+(get(r,c.column)?.cell||'')))))),handled=r=>keys.has(r?.sourceSheet+'!'+r?.priceCell);
 const next={...result,records:result.records.filter(r=>!handled(r)),regionalRecords:result.regionalRecords.filter(r=>!handled(r)),rejectedRecords:(result.rejectedRecords||[]).filter(r=>!handled(r.record)),reports:result.reports.map(r=>({...r})),postalAirAudit:[]};
 for(const {sheet,blocks}of targets){const issues=[];
  for(const b of blocks)for(const row of b.rows)for(const tier of b.columns){const cell=get(row,tier.column);if(!cell||!text(cell.v))continue;const base={sheet:sheet.name,cell:cell.cell,raw:cell.v},evidence=countryEvidence(sheet,b,row);
   if(/^(?:单询|暂停|[-—/*]|0(?:\.0+)?)$/.test(text(cell.v))){next.postalAirAudit.push({...base,status:'无有效报价'});continue}
   const reject=reason=>{issues.push({row:row.row,priceCell:cell.cell,raw:cell.v,message:reason});next.postalAirAudit.push({...base,status:'待核对',reason})};
   if(!M.prefixRange(get(row,b.destColumn)?.v)){reject('邮编前缀缺失或格式无效，保留待核对');continue}
   if(!evidence.country){reject(evidence.reason);continue}
   const scoped={...sheet,rows:sheet.rows.filter(r=>r.row<=b.header||r.row===row.row)},block={...b,countryColumn:null};
   const built=M.build(scoped,block,tier.column,{...meta,country:evidence.country,channel:tier.context,conditions:sheet.serviceTax||M.tax(sheet.name+' '+tier.context)});
   if(built.regionalRecords.length!==1){reject(built.issues[0]?.message||'未生成唯一的区域报价，保留待核对');continue}
   next.regionalRecords.push({...built.regionalRecords[0],sourceCountryRaw:evidence.proofs.map(p=>p.raw).join('；'),sourceCountryBasis:'原表目的国家证据',countryEvidence:evidence.proofs,sourceTierCell:tier.cell,sourceTierRaw:get(sheet.rows.find(r=>r.row===b.header),tier.column)?.v,sourceChannelRaw:sheet.rows.filter(r=>r.row<b.header).flatMap(r=>r.cells).find(c=>text(c.v).includes(tier.serviceName))?.v||tier.context,layoutRule:'postal-air-v1'});
   next.postalAirAudit.push({...base,status:'已提取'});
  }
  const report=next.reports.find(r=>r.sheet===sheet.name);if(report){const audit=next.postalAirAudit.filter(a=>a.sheet===sheet.name);Object.assign(report,{count:next.records.filter(r=>r.sourceSheet===sheet.name).length,regionalCount:next.regionalRecords.filter(r=>r.sourceSheet===sheet.name).length,issues,status:'邮编空运报价：提取 '+audit.filter(a=>a.status==='已提取').length+' 格，待核对 '+audit.filter(a=>a.status==='待核对').length+' 格，无有效报价 '+audit.filter(a=>a.status==='无有效报价').length+' 格'})}
 }
 if(next.regionalRecords.length>10000)throw Error('区域报价超过10000条，请分文件导入；未截断数据');
 next.cellAudit=M.cellAudit(model,next);next.omissions=M.omissionAudit(model,next);return next;
}
const api={layouts,countryEvidence,inspect,project};root.PostalAirLayout=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);

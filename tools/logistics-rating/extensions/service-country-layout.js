(function(root){
 'use strict';
 const M=root.MatrixImport||(typeof require==='function'?require('../matrix-import.js'):null);
 const D=root.Domain||(typeof require==='function'?require('../domain.js'):null);
 const clean=value=>String(value??'').trim();
 const column=cell=>cell.match(/^[A-Z]+/)[0];
 function cellAt(sheet,row,col){
  const direct=sheet.rows.find(item=>item.row===row)?.cells.find(cell=>column(cell.cell)===col);
  if(clean(direct?.v))return direct;
  for(const range of sheet.merges||[]){
   const match=range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
   if(match&&match[1]===col&&match[3]===col&&row>=+match[2]&&row<=+match[4])return sheet.rows.find(item=>item.row===+match[2])?.cells.find(cell=>column(cell.cell)===col);
  }
  return null;
 }
 function layouts(sheet){
  if(sheet.hidden==='hidden'||sheet.hidden==='veryHidden')return [];
  const headers=sheet.rows.filter(row=>['目的地','服务类型','邮编'].every((label,i)=>clean(row.cells.find(cell=>column(cell.cell)==='ABC'[i])?.v)===label)&&/时效/.test(row.cells.find(cell=>column(cell.cell)==='D')?.v||'')&&row.cells.some(cell=>column(cell.cell)==='E'&&/^\d+(?:-\d+)?KG(?:以上)?$/i.test(clean(cell.v))));
  return headers.map((row,i)=>({header:row,end:headers[i+1]?.row-1||Infinity}));
 }
 function tax(service){return /不含[税稅]|不包税|客户VAT申报/.test(service)?'不含税':/含[税稅]|包税/.test(service)?'含税':'税费待确认';}
 function inspect(sheet){
  const blocks=layouts(sheet).map(block=>{
   const rows=sheet.rows.filter(row=>row.row>block.header.row&&row.row<=block.end&&row.cells.some(cell=>['E','F'].includes(column(cell.cell))&&/^\d+(?:\.\d+)?$/.test(clean(cell.v))));
   return {start:block.header.row,header:block.header.row,end:rows.at(-1)?.row||block.header.row,destinationCell:'C'+block.header.row,unitCell:'E'+block.header.row,priceCells:rows.flatMap(row=>row.cells.filter(cell=>['E','F'].includes(column(cell.cell))&&/^\d+(?:\.\d+)?$/.test(clean(cell.v))).map(cell=>cell.cell))};
  }).filter(block=>block.priceCells.length);
  return blocks.length?{sheet:sheet.name,status:'quote',reason:'原表分段渠道、服务国家、地址范围与公斤档价格形成报价区块',scannedRows:sheet.rows.length,blocks}:null;
 }
 function project(model,result,meta){
  const targets=model.sheets.map(sheet=>({sheet,blocks:layouts(sheet)})).filter(item=>item.blocks.length);
  if(!targets.length)return result;
  const handled=new Set(targets.flatMap(({sheet,blocks})=>blocks.flatMap(block=>sheet.rows.filter(row=>row.row>block.header.row&&row.row<=block.end).flatMap(row=>row.cells.filter(cell=>['E','F'].includes(column(cell.cell))).map(cell=>sheet.name+'!'+cell.cell)))));
  const isHandled=row=>handled.has(row.sourceSheet+'!'+row.priceCell);
  const next={...result,records:result.records.filter(row=>!isHandled(row)),regionalRecords:result.regionalRecords.filter(row=>!isHandled(row)),rejectedRecords:(result.rejectedRecords||[]).filter(item=>!isHandled(item.record)),reports:result.reports.map(report=>({...report})),layoutWarnings:[...(result.layoutWarnings||[])]};
  for(const {sheet,blocks}of targets){
   const issues=[];
   for(const block of blocks){
    const tiers=block.header.cells.filter(cell=>['E','F'].includes(column(cell.cell))&&/^\d+(?:-\d+)?KG(?:以上)?$/i.test(clean(cell.v)));
    for(const row of sheet.rows.filter(row=>row.row>block.header.row&&row.row<=block.end)){
     const destination=cellAt(sheet,row.row,'A'),service=cellAt(sheet,row.row,'B'),scope=cellAt(sheet,row.row,'C');
     if(!service||!scope)continue;
     const serviceText=clean(service.v).replace(/\s+/g,' '),destinationText=clean(destination?.v),countries=M.geography(serviceText).countries.length?M.geography(serviceText).countries:M.geography(destinationText).countries;
     const channel=[destinationText,serviceText].filter(Boolean).join(' · ');
     const notes=['D','G'].map(col=>cellAt(sheet,row.row,col)).filter(Boolean).map(cell=>({cell:cell.cell,value:cell.v}));
     for(const tier of tiers){
      const price=row.cells.find(cell=>column(cell.cell)===column(tier.cell));
      if(!price||/^(?:|\/|\*|[-—]|暂停|单询)$/.test(clean(price.v)))continue;
      const terms='档='+clean(tier.v)+';条件='+tax(serviceText)+';目的范围='+clean(scope.v);
      const proof={sourceSheet:sheet.name,sourceRow:row.row,priceCell:price.cell,sourcePriceRaw:price.v,sourceTierCell:tier.cell,sourceTierRaw:tier.v,sourceChannelCell:destination?.cell||service.cell,sourceChannelRaw:destinationText,sourceServiceCell:service.cell,sourceServiceRaw:service.v,sourceCountryRaw:countries.length?serviceText+' '+destinationText:'',sourceNotes:notes,leadRaw:clean(cellAt(sheet,row.row,'D')?.v),timeUnverified:true,timeNote:'原表时效原值留档，未自动转换日期序列或补全承诺',layoutRule:'service-country-v1'};
      try{
       const amount=D.cents(price.v);
       if(amount<=0)throw Error('报价必须大于0');
       if(!countries.length)throw Error('原表未明确具体国家，保留待核对');
       if(channel.length>100)throw Error('服务描述超长，需人工核对');
       if(!/^(?:亚马逊地址|不限)$/.test(clean(scope.v)))throw Error('仓号与邮编混写，需逐项核对仓号及国家；原文保留');
       for(const country of countries)next.regionalRecords.push({...proof,company:meta.company,country,channel,regionRaw:country+' · '+clean(scope.v),price:amount,currency:meta.currency||'CNY',unit:'kg',date:D.date(meta.date),terms});
      }catch(error){
       const record={...proof,company:meta.company,country:countries.length===1?countries[0]:'',channel,regionRaw:clean(scope.v),price:price.v,currency:meta.currency||'CNY',unit:'kg',date:meta.date,terms};
       next.rejectedRecords.push({kind:'regional',record,reason:error.message});
       issues.push({row:row.row,priceCell:price.cell,message:error.message});
      }
     }
    }
   }
   const report=next.reports.find(report=>report.sheet===sheet.name);
   if(report)Object.assign(report,{count:next.records.filter(row=>row.sourceSheet===sheet.name).length,regionalCount:next.regionalRecords.filter(row=>row.sourceSheet===sheet.name).length,issues,status:'已按分段服务、逐行国家和税费清洗；未确认字段保留待核对'});
   next.layoutWarnings.push(sheet.name+'：未注明税费的行保留“税费待确认”；时效列中的日期序列保留原值。仓号与邮编混写及仅写欧洲的报价需人工核对。');
  }
  if(next.regionalRecords.length+next.records.length>10000)throw Error('整本清洗超过10000条，请分文件导入');
  next.cellAudit=M.cellAudit(model,next);
  next.omissions=M.omissionAudit(model,next);
  return next;
 }
 const api={layouts,inspect,tax,project};root.ServiceCountryLayout=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);

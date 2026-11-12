(function(root){'use strict';
const M=root.MatrixImport||(typeof require==='function'?require('../matrix-import.js'):null);
const clean=v=>String(v??'').normalize('NFKC').trim();
// Correct explicit source declarations only. Missing tax retains the existing default.
function tax(value){
 let text=clean(value);if(!/包税|含税|未税|税费自理|递延/.test(text))return null;
 if(/是否|可选|任选|待确认|待定|不(?:保证|承诺|支持|接受|提供)\s*(?:包税|含税)|不是\s*(?:包税|含税)/.test(text))return '税务待确认';
 const excluded=/不包税|不含税|未含税|未包税|没有包税|非包税|未税|递延|税费自理/.test(text);
 text=text.replace(/不包税|不含税|未含税|未包税|没有包税|非包税|未税|递延|税费自理/g,'');
 const included=/包税|含税/.test(text);return excluded&&included?'税务待确认':excluded?'不含税':included?'包税':null;
}
function defaults(sheet,block,column){
 const R=root.RegionalSourceFields||(typeof require==='function'?require('./regional-source-fields.js'):null),inferred=M.fields(sheet,column),contexts=[];
 if(block&&column)for(const row of sheet.rows.filter(r=>r.row>block.header&&r.row<=block.end)){
  const ctx=R.context(sheet,{sourceRow:row.row,priceCell:column.cell.replace(/\d+$/,String(row.row))},[block]);if(ctx?.channel)contexts.push(ctx);
 }
 if(!contexts.length)return {...inferred,conditions:tax(column?.context||sheet.name)||M.tax(column?.context||sheet.name)};
 const channels=[...new Set(contexts.map(c=>clean(c.channel.v)))],modes=[...new Set(contexts.map(c=>R.taxEvidence(sheet,c,c.channel).value))];
 return {...inferred,channel:channels.length===1?channels[0]:'按原表分段渠道',conditions:modes.length===1?modes[0]:'税务待确认'};
}
// A title containing “查询” alone cannot discard a preflight-confirmed rate matrix.
function recoverQueries(model,result,meta){
 let next=result;
 for(const sheet of model.sheets){
  if(!/查询/.test(sheet.name)||M.effectiveKind(sheet)==='报价'||!sheet.rows.length||sheet.rows.some(r=>r.cells.some(c=>/VLOOKUP|HLOOKUP|XLOOKUP|INDEX\s*\(/i.test(c.formulaEffective||c.formulaText||''))))continue;
  if([...(result.records||[]),...(result.regionalRecords||[])].some(r=>r.sourceSheet===sheet.name))continue;
  const blocks=M.scan(sheet);if(!blocks.length)continue;
  const records=[],regionalRecords=[],rejectedRecords=[],issues=[],ignored=[];
  for(const block of blocks)for(const column of block.columns){const d=defaults(sheet,block,column),built=M.build(sheet,block,column.column,{...meta,...d});records.push(...built.records);regionalRecords.push(...built.regionalRecords);rejectedRecords.push(...built.rejectedRecords);issues.push(...built.issues);ignored.push(...built.ignored);}
  if(!records.length&&!regionalRecords.length&&!rejectedRecords.length)continue;
  next={...next,records:[...(next.records||[]),...records],regionalRecords:[...(next.regionalRecords||[]),...regionalRecords],rejectedRecords:[...(next.rejectedRecords||[]),...rejectedRecords],reports:(next.reports||[]).map(r=>r.sheet===sheet.name?{...r,count:records.length,regionalCount:regionalRecords.length,issues:[...(r.issues||[]),...issues],ignored:ignored.length,status:'已按明确报价区块清洗；表名不作为无报价依据'}:r)};
 }
 return next;
}
function replacementRisk(db,batch,directory=[],local=true){
 const names=new Map();for(const company of directory)for(const name of [company.name,...(company.aliases||[])])names.set(clean(name),company.id);
 const identity=row=>row.companyId||names.get(clean(row.company||row.values?.[0]))||clean(row.company||row.values?.[0]),groups=new Map();
 for(const [kind,rows]of [['warehouse',batch.records||[]],['regional',batch.regionalRecords||[]]])for(const row of rows){const id=identity(row);if(!id)continue;if(!groups.has(id))groups.set(id,{id,company:row.company||row.values?.[0]||id,warehouse:0,regional:0});groups.get(id)[kind]++;}
 return [...groups.values()].map(g=>{const old=[...(!local||g.warehouse?(db.quotes||[]):[]),...(!local||g.regional?(db.regionalQuotes||[]):[])].filter(r=>identity(r)===g.id);return {...g,previous:old.length,channels:[...new Set(old.map(r=>r.channel).filter(Boolean))]};});
}
function project(model,result){
 const sourceSheets=new Map(model.sheets.map(s=>[s.name,s])),scans=new Map(),corrections=[];
 const correct=record=>{
  if(record.sourceFieldsRule||record.manualSourceFields)return record;
  const sheet=sourceSheets.get(record.sourceSheet);if(!sheet)return record;
  if(!scans.has(sheet))scans.set(sheet,M.scan(sheet));
  const column=record.priceCell?.match(/^[A-Z]+/)?.[0],number=column?[...column].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0):0;
  const block=scans.get(sheet).find(b=>record.sourceRow>b.header&&record.sourceRow<=b.end&&b.columns.some(c=>c.column===number));
  const tier=block?.columns.find(c=>c.column===number),channel=record.sourceChannelRaw||(record.values?record.values[2]:record.channel);
  const explicit=tax([channel,tier?.context].filter(Boolean).join(';'))??tax(sheet.name);
  if(!explicit)return record;
  const terms=record.values?record.values[10]:record.terms;
  // Do not erase cargo or other user conditions adjacent to a tax declaration.
  const nextTerms=String(terms||'').replace(/(^|[;；])\s*条件=(?:不含税|包税|税务待确认)(?=$|[;；])/g,(_,prefix)=>prefix+'条件='+explicit);
  if(nextTerms===terms)return record;
  corrections.push({sheet:record.sourceSheet,priceCell:record.priceCell,field:'税务',before:terms,after:nextTerms,evidence:[channel,tier?.context,sheet.name].filter(Boolean)});
  return record.values?{...record,values:record.values.map((v,i)=>i===10?nextTerms:v)}:{...record,terms:nextTerms};
 };
 const records=(result.records||[]).map(correct),regionalRecords=(result.regionalRecords||[]).map(correct),next={...result,records,regionalRecords};
 const full=M.cellAudit(model,{...next,reports:next.reports||[]}),diagnostics=[];
 // Report-only parse failures must remain visible beside their original price cells.
 const issueCells=new Map();for(const report of next.reports||[])for(const issue of report.issues||[])if(issue.priceCell)issueCells.set(report.sheet+'!'+issue.priceCell,issue);
 const allowed=result.scopePriceCells?new Set(result.scopePriceCells):null;
 for(const sheet of full.sheets)for(const cell of sheet.cells){
  const issue=issueCells.get(sheet.name+'!'+cell.cell);if(!issue||allowed&&!allowed.has(cell.cell)||cell.status==='报价已生成')continue;
  if(cell.status==='附注或表头'){cell.status='价格待核对';cell.detail=issue;full.counts['附注或表头']--;full.counts['价格待核对']=(full.counts['价格待核对']||0)+1;}
  diagnostics.push({sheet:sheet.name,cell:cell.cell,raw:cell.v,reason:issue.message||'价格解析未完成'});
 }
 const old=result.cellAudit,changed=corrections.length||diagnostics.length||!old||JSON.stringify(old)!==JSON.stringify(full);
 if(!changed)return result;
 const prior=result.integrityAudit,history=new Map((prior?.corrections||[]).map(c=>[JSON.stringify([c.sheet,c.priceCell,c.field]),c]));for(const correction of corrections)history.set(JSON.stringify([correction.sheet,correction.priceCell,correction.field]),correction);
 return {...next,cellAudit:full,omissions:M.omissionAudit(model,{...next,reports:next.reports||[]}),integrityAudit:{rule:'cleaning-integrity-v1',sourceCells:full.totalCells,previousEvidenceCells:prior?.previousEvidenceCells??old?.totalCells??0,corrections:[...history.values()],unresolved:diagnostics}};
}
const api={tax,defaults,recoverQueries,replacementRisk,project};root.CleaningIntegrity=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);

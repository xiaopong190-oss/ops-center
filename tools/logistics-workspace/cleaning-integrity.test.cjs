const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const M=require('../logistics-rating/matrix-import.js'),I=require('../logistics-rating/extensions/cleaning-integrity.js'),Worker=require('./worker-test-helper.cjs');
const meta={company:'合成清洗物流',date:'2026-11-12',currency:'CNY'},row=(n,values)=>({row:n,cells:Object.entries(values).map(([k,v])=>({cell:k+n,v:String(v)}))});
const book=(price='8.60',name='美国海运')=>({fileName:'合成2026.11.12.xlsx',assets:[],sheets:[{name,merges:[],rows:[row(1,{A:'仓库代码',B:'21KG+'}),row(2,{A:'ONT8',B:price})]}]});
function api(){const root={Worker};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../logistics-rating/extensions/workbook-cleaning.js'),'utf8'),{window:root,document:{currentScript:{src:'https://local/extensions/workbook-cleaning.js'}},URL,Date,Error,Promise,setTimeout,clearTimeout,setInterval,clearInterval,AbortController});return root.WorkbookCleaning;}
test('actual worker accepts equivalent plain, grouped and currency-symbol prices without changing source',async()=>{
 for(const [text,cents]of [['8.60',860],['￥8.60',860],['1,000.00',100000],['$8.60',860]]){const model=book(text),before=JSON.stringify(model),r=await api().run(model,meta);assert.equal(r.preflight[0].status,'quote');assert.equal(r.records.length,1);assert.equal(Math.round(Number(String(r.records[0].values[4]).replace(/^[￥$]/,'').replaceAll(',',''))*100),cents);assert.equal(r.records[0].priceCell,'B2');assert.equal(r.cellAudit.totalCells,4);assert.equal(JSON.stringify(model),before);}
});
test('full original evidence survives uncertain sheets, notes, missing formula caches and attached media',async()=>{
 const model=book();model.sheets.push({name:'待核对',merges:['A1:B1'],media:['xl/media/image.png'],rows:[row(1,{A:'未识别服务说明'}),{row:2,cells:[{cell:'B2',v:'',formula:true,formulaText:'SUM(4,4)'}]}]});model.assets=[{path:'xl/media/image.png',data:'synthetic'}];const before=JSON.stringify(model),r=await api().run(model,meta);
 assert.equal(r.cellAudit.totalCells,6);const sheet=r.cellAudit.sheets.find(s=>s.name==='待核对');assert.equal(sheet.cells.find(c=>c.cell==='B2').formulaText,'SUM(4,4)');assert.deepEqual(sheet.merges,['A1:B1']);assert.equal(r.cellAudit.assets.length,1);assert.equal(r.records.length,1);assert.equal(JSON.stringify(model),before);
});
test('explicit negative tax is corrected in both quote types; missing tax and manual fields retain existing behavior',async()=>{
 for(const word of ['不包税','非包税','未包税','不含税']){const r=await api().run(book('8.60','美国海运'+word),meta);assert.equal(r.records.length,1);assert.match(r.records[0].values[10],/条件=不含税/);}
 const untouched=M.workbook(book(),meta),manual=structuredClone(untouched);manual.records[0].manualSourceFields=true;manual.records[0].values[10]='档=21KG+;条件=包税';assert.equal(I.project(book('8.60','美国海运不包税'),manual).records[0].values[10],manual.records[0].values[10]);assert.match(I.project(book(),untouched).records[0].values[10],/条件=不含税/);
 const regional=book('8.60','美国海运不包税');regional.sheets[0].rows[1].cells[0].v='美西';const r=await api().run(regional,meta);assert.equal(r.regionalRecords.length,1);assert.match(r.regionalRecords[0].terms,/条件=不含税/);
});
test('contradictory or optional explicit tax is not silently classified as included',()=>{
 for(const text of ['包税/不包税任选','包税待确认','不支持包税','不包税;包税'])assert.equal(I.tax(text),'税务待确认');assert.equal(I.tax('普货海运'),null);
});
test('report-only invalid regional prices retain a visible source-cell diagnosis',async()=>{
 const model=book('8.6.5');model.sheets[0].rows[1].cells[0].v='美西';model.sheets[0].rows.push(row(3,{A:'美东',B:'8.60'}));const r=await api().run(model,meta);assert.equal(r.regionalRecords.length,1);const bad=r.cellAudit.sheets[0].cells.find(c=>c.cell==='B2');assert.equal(bad.v,'8.6.5');assert.equal(bad.status,'价格待核对');assert(r.integrityAudit.unresolved.some(x=>x.cell==='B2'));assert.equal(r.cellAudit.totalCells,6);
});
test('per-tier defaults derive explicit channels while manual override survives later source projection',()=>{
 const model={fileName:'合成.xlsx',sheets:[{name:'美国空运',merges:['B1:C1'],rows:[row(1,{A:'下单渠道',B:'美国空派普货不包税'}),row(2,{A:'邮编',B:'华南'}),row(3,{B:'12KG+'}),row(4,{A:'美西',B:'8.60'})]}]};const sheet=model.sheets[0],block=M.scan(sheet)[0],column=block.columns[0],d=I.defaults(sheet,block,column);assert.equal(d.channel,'美国空派普货不包税');assert.equal(d.conditions,'不含税');
 const R=require('../logistics-rating/extensions/regional-source-fields.js'),result=M.build(sheet,block,column.column,{...meta,...d,channel:'人工渠道',country:'美国',conditions:'包税'});result.regionalRecords=result.regionalRecords.map(r=>({...r,manualSourceFields:true}));const next=I.project(model,R.project(model,result));assert.equal(next.regionalRecords[0].channel,'人工渠道');assert.match(next.regionalRecords[0].terms,/条件=包税/);
});

test('a query word in a title does not discard a confirmed plain-price matrix; lookup formula summaries stay references',async()=>{
 const model=book('8.60','美国海运价格查询'),r=await api().run(model,meta);assert.equal(r.preflight[0].status,'quote');assert.equal(r.records.length,1);assert.equal(r.records[0].values[4],'8.60');assert.equal(r.records[0].priceCell,'B2');assert.equal(r.cellAudit.totalCells,4);
 const formula=book('8.60','美国海运价格查询');formula.sheets[0].rows[1].cells[1].formulaText='VLOOKUP(A2,源表!A:B,2,0)';const skipped=I.recoverQueries(formula,{records:[],regionalRecords:[],reports:[]},meta);assert.equal(skipped.records.length,0);
});
test('per-tier UI is source-correct before AI resolves, and manual channel/tax overrides remain intact',async()=>{
 const {openRuntime}=require('./runtime-test-helper.cjs');
 for(const manual of [false,true]){const t=await openRuntime('import','operate',false,{instant:'2026-11-12T12:00:00Z'});try{
  await t.wait(()=>t.w.CleaningIntegrity&&t.doc.getElementById('workbookFile').onchange);
  const model={fileName:'合成物流报价2026.11.12.xlsx',sheets:[{name:'美国空运',merges:['B1:C1'],rows:[row(1,{A:'下单渠道',B:'美国空派普货不包税'}),row(2,{A:'邮编',B:'华南'}),row(3,{B:'12KG+'}),row(4,{A:'美西',B:'8.60'})]}]};
  t.w.WorkbookPreview.read=async()=>model;t.w.CleaningReview.review=()=>new Promise(()=>{});
  await t.doc.getElementById('workbookFile').onchange({target:{files:[{name:model.fileName,size:1,lastModified:0,arrayBuffer:async()=>new t.w.ArrayBuffer(1)}]}});t.doc.querySelector('#supplierConfirmation button').click();
  const get=id=>t.doc.getElementById(id);assert.equal(get('draftChannel').value,'美国空派普货不包税');assert.equal(get('matrixConditions').value,'不含税');
  if(manual){get('draftChannel').value='人工渠道';get('matrixConditions').value='包税';}
  get('draftDate').value=meta.date;get('matrixConfirm').checked=true;let forwarded;t.w.addEventListener('matrix-batch-ready',e=>{forwarded=e.detail});await get('matrixBuild').onclick();assert.equal(get('toStandard').disabled,false);get('toStandard').click();assert.equal(forwarded.regionalRecords.length,1);assert.equal(forwarded.regionalRecords[0].channel,manual?'人工渠道':'美国空派普货不包税');assert.match(forwarded.regionalRecords[0].terms,manual?/条件=包税/:/条件=不含税/);await t.wait(()=>!get('commit').disabled&&!get('importReplacementRisk').hidden);assert.match(get('importReplacementRisk').textContent,/部分渠道/);assert.match(get('importReplacementRisk').textContent,/整批替换/);assert.equal(t.w.ComparisonStore.read().regionalQuotes?.length||0,0);assert.deepEqual(t.errors,[]);
 }finally{t.close()}}
});
test('whole-workbook UI exposes a report-only invalid price while valid quotes can proceed',async()=>{
 const {openRuntime}=require('./runtime-test-helper.cjs'),t=await openRuntime('import','operate',false,{instant:'2026-11-12T12:00:00Z'});try{
  await t.wait(()=>t.w.CleaningIntegrity&&t.doc.getElementById('workbookFile').onchange);const model=book('8.6.5');model.sheets[0].rows[1].cells[0].v='美西';model.sheets[0].rows.push(row(3,{A:'美东',B:'8.60'}));t.w.WorkbookPreview.read=async()=>model;t.w.CleaningReview.review=()=>new Promise(()=>{});
  await t.doc.getElementById('workbookFile').onchange({target:{files:[{name:model.fileName,size:1,lastModified:0,arrayBuffer:async()=>new t.w.ArrayBuffer(1)}]}});t.doc.querySelector('#supplierConfirmation button').click();t.doc.getElementById('batchDate').value=meta.date;await t.doc.getElementById('batchClean').onclick();const text=t.doc.querySelector('.source-unresolved').textContent;assert.match(text,/美国海运!B2/);assert.match(text,/8\.6\.5/);assert.equal(t.w.ComparisonStore.read().regionalQuotes?.length||0,0);assert.deepEqual(t.errors,[]);
 }finally{t.close()}
});
test('cargo exclusions do not negate tax, and recovering a confirmed query matrix is idempotent',()=>{
 assert.equal(I.tax('美国空派包税（不接受带电）'),'包税');assert.equal(I.tax('包税，不保证时效'),'包税');
 const model=book('8.60','美国海运价格查询'),first=I.recoverQueries(model,{records:[],regionalRecords:[],rejectedRecords:[],reports:[]},meta);assert.equal(first.records.length,1);assert.equal(I.recoverQueries(model,first,meta),first);
});
test('replacement risk previews exact provider/type scope without changing the approved replacement policy or data',()=>{
 const db={quotes:[{companyId:'a',company:'合成A',channel:'旧海运'},{companyId:'b',company:'合成B',channel:'其他服务商'}],regionalQuotes:[{companyId:'a',company:'合成A',channel:'旧空运'}]},directory=[{id:'a',name:'合成A',aliases:['A别名']}],batch={records:[],regionalRecords:[{company:'A别名'}]},before=JSON.stringify([db,batch,directory]);
 const risk=I.replacementRisk(db,batch,directory,true);assert.equal(risk.length,1);assert.equal(risk[0].previous,1);assert.deepEqual(risk[0].channels,['旧空运']);assert.equal(I.replacementRisk(db,batch,directory,false)[0].previous,2);assert.equal(JSON.stringify([db,batch,directory]),before);
});

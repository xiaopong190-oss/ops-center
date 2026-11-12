const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Fields=require('../logistics-rating/extensions/regional-source-fields.js'),M=require('../logistics-rating/matrix-import.js'),Q=require('../logistics-rating/quote-core.js'),Worker=require('./worker-test-helper.cjs');
const row=(n,cells)=>({row:n,cells:Object.entries(cells).map(([col,v])=>({cell:col+n,v:String(v)}))}),meta={company:'合成物流',date:'2026-11-12',currency:'CNY'};
function fixture(){return {fileName:'合成美线2026.11.12.xlsx',sheets:[
 {name:'美国空运',merges:['B3:E3','B4:D4','E4:E5','E6:E8'],rows:[row(1,{A:'合成物流'}),row(2,{A:'美国空派'}),row(3,{A:'下单渠道',B:'美国空派普货-五日提包税'}),row(4,{A:'邮编',B:'华南',E:'延时赔付（出仓后）自然日'}),row(5,{B:'12-70KG',C:'71-99KG',D:'100KG+'}),row(6,{A:'美国西岸（邮编8.9开头）',B:73.5,C:71.5,D:69.5,E:'时效参考：起飞3-5工作日提取，超8个工作日不提取，每超1个工作日赔偿1元/KG'}),row(7,{A:'美国中部（邮编4.5.6.7开头）',B:72.5,C:70.5,D:68.5}),row(8,{A:'美国东岸（邮编0.1.2.3开头）',B:73.5,C:71.5,D:69.5})]},
 {name:'含税海派',merges:['B3:B5','B6:B8','B9:B11','G3:G5','H3:H5','H6:H8','H9:H11'],rows:[row(1,{A:'合成物流'}),row(2,{A:'美国海派'}),row(3,{A:'渠道系列',B:'下单渠道',C:'是否包税',D:'含税',G:'提取时效（开船次日算起）',H:'理赔时效（开船次日开始算起）'}),row(4,{C:'区域',D:'华南'}),row(5,{C:'邮编/起收量',D:'12KG+',E:'45KG+',F:'100KG+'}),...Array.from({length:6},(_,i)=>row(i+6,{...(i===0?{A:'全美海派',B:'美森正班/加班'}:i===3?{B:'ZIM/合德带托'}:{}),C:['美西（邮编8-9开头，除97-99）','美中（邮编4-7开头）','美东（邮编0-3开头）'][i%3],D:[21,23,23.5,19.3,21,21.9][i],E:[19.5,21.5,22,17.8,19.5,20.4][i],F:[18,20,20.5,16.3,18,18.9][i],G:i<3?'13-15天':'15-17天',...(i%3===0?{H:'5截3开；第16日起赔偿0.5元/KG/工作日'}:{})}))]}
 ]};}
function parsed(model){return Fields.project(model,M.workbook(model,meta));}
test('source labels preserve 27 prices, distinct merged channels, tax and time basis; all pass real admission',()=>{
 const model=fixture(),before=JSON.stringify(model),old=M.workbook(model,meta),oldAudit=Fields.admission(old,meta.date);assert.equal(oldAudit.accepted,9);assert.equal(oldAudit.pending,18);
 const result=Fields.project(model,old),audit=Fields.admission(result,meta.date);assert.equal(result.regionalRecords.length,27);assert.equal(audit.accepted,27);assert.equal(audit.pending,0);assert.equal(JSON.stringify(model),before);
 assert.deepEqual([...new Set(result.regionalRecords.map(r=>r.channel))],['美国空派普货-五日提包税','美森正班/加班','ZIM/合德带托']);
 for(const r of result.regionalRecords){const original=old.regionalRecords.find(x=>x.sourceSheet===r.sourceSheet&&x.priceCell===r.priceCell);for(const field of ['price','sourcePriceRaw','regionRaw','currency','unit','date'])assert.deepEqual(r[field],original[field]);assert.match(r.terms,/条件=包税/);assert(r.sourceChannelCell);assert(r.sourceTimeCell);assert(!r.timeUnverified);assert(!r.sourceTimeCell.startsWith('H'));}
 const air=result.regionalRecords.filter(r=>r.sourceSheet==='美国空运');assert(air.every(r=>r.min===3&&r.max===5&&r.timeBasis==='起飞至提取/工作日'&&r.sourceTimeCell==='E6'));assert(result.regionalRecords.filter(r=>r.sourceSheet==='含税海派'&&r.sourceRow<9).every(r=>r.min===13&&r.max===15&&r.timeBasis==='开船次日至提取/自然日'));
 assert(result.regionalRecords.filter(r=>r.sourceSheet==='含税海派'&&r.sourceRow>=9).every(r=>r.min===15&&r.max===17&&r.sourceChannelCell==='B9'));
 assert.deepEqual(Fields.project(model,result).regionalRecords,result.regionalRecords,'idempotent');
});
test('missing, optional or contradictory tax remains unknown instead of silently becoming excluded',()=>{
 for(const value of ['普货渠道','包税/不包税任选','不是包税','包税待确认','不支持包税']){const model=fixture();model.sheets[0].rows.find(r=>r.row===3).cells[1].v=value;const rows=parsed(model).regionalRecords.filter(r=>r.sourceSheet==='美国空运');assert.equal(rows.length,9);assert(rows.every(r=>r.terms.includes('税务待确认')));}
 for(const value of ['非包税','未含税','没有包税','未包税']){const sample=fixture();sample.sheets[0].rows.find(r=>r.row===3).cells[1].v='空运'+value;assert(parsed(sample).regionalRecords.filter(r=>r.sourceSheet==='美国空运').every(r=>r.terms.includes('条件=不含税')));}
 const model=fixture();model.sheets[1].rows.find(r=>r.row===6).cells.find(c=>c.cell==='B6').v='美森不包税';assert(parsed(model).regionalRecords.filter(r=>r.sourceSheet==='含税海派'&&r.sourceRow<9).every(r=>r.terms.includes('税务待确认')));
 model.sheets[1].rows.find(r=>r.row===3).cells.find(c=>c.cell==='D3').v='不含税';assert(parsed(model).regionalRecords.filter(r=>r.sourceSheet==='含税海派').every(r=>r.terms.includes('条件=不含税')));
});
test('channels only inherit across explicit merged ranges; missing channel becomes preserved rejection',()=>{
 const model=fixture();model.sheets[1].merges=model.sheets[1].merges.filter(ref=>ref!=='B6:B8');const result=parsed(model);assert.equal(result.regionalRecords.length,21);assert.equal(result.rejectedRecords.filter(x=>x.kind==='regional').length,6);assert(result.rejectedRecords.every(x=>x.record.priceCell&&x.record.sourceSheet&&x.reason));
});
test('compensation and conflicting promises cannot become transit days or leak into unrelated rows',()=>{
 const model=fixture();model.sheets[0].merges=model.sheets[0].merges.filter(ref=>ref!=='E6:E8');const result=parsed(model);assert(result.regionalRecords.filter(r=>r.sourceSheet==='美国空运'&&r.sourceRow>6).every(r=>r.min===null&&r.max===null&&r.timeUnverified));
 const sheet=model.sheets[1];sheet.rows.find(r=>r.row===3).cells.find(c=>c.cell==='G3').v='提取时效';sheet.rows.find(r=>r.row===6).cells.find(c=>c.cell==='G6').v='13-15天或20-22天';assert(parsed(model).regionalRecords.filter(r=>r.sourceSheet==='含税海派'&&r.sourceRow===6).every(r=>r.min===null&&r.max===null));
});
test('unrelated matrices and parallel channel adapters remain unchanged',()=>{
 const sheet={name:'美国海运',merges:[],rows:[row(1,{A:'仓库代码',B:'21KG+'}),row(2,{A:'ONT8',B:8.6})]},model={sheets:[sheet]},original=M.workbook(model,meta);assert.equal(Fields.project(model,original),original);
 const multiple=fixture();multiple.sheets[1].rows.find(r=>r.row===3).cells.push({cell:'J3',v:'下单渠道'});const source=M.workbook(multiple,meta);assert.deepEqual(Fields.project(multiple,source).regionalRecords.filter(r=>r.sourceSheet==='含税海派'),source.regionalRecords.filter(r=>r.sourceSheet==='含税海派'));
});
test('actual two-stage worker integrates the source projection without changing raw workbook or saving data',async()=>{
 const root={Worker};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../logistics-rating/extensions/workbook-cleaning.js'),'utf8'),{window:root,document:{currentScript:{src:'https://local/extensions/workbook-cleaning.js'}},URL,Date,Error,Promise,setTimeout,clearTimeout,setInterval,clearInterval,AbortController});const model=fixture(),before=JSON.stringify(model),result=await root.WorkbookCleaning.run(model,meta);assert.equal(result.regionalRecords.length,27);assert.equal(Q.partitionRegional(result.regionalRecords,meta.date).exceptions.length,0);assert.equal(result.sourceFieldAudit.length,27);assert.equal(JSON.stringify(model),before);
});
test('preview and standard admission share counts and date validation; no rows are saved by preview',async()=>{
 const {openRuntime}=require('./runtime-test-helper.cjs');
 for(const [instant,accepted,pending] of [['2026-11-12T12:00:00Z',27,0],['2026-11-10T12:00:00Z',0,27]]){
  const t=await openRuntime('import','operate',false,{instant});
  try{
   await t.wait(()=>t.w.RegionalSourceFields&&t.doc.getElementById('workbookFile').onchange);const model=fixture();
   // UI-only fixture; XLSX parsing is covered by the supplied-file verification.
   t.w.WorkbookPreview.read=async()=>model;
   await t.doc.getElementById('workbookFile').onchange({target:{files:[{name:model.fileName,size:1,lastModified:0,arrayBuffer:async()=>new t.w.ArrayBuffer(1)}]}});
   t.doc.querySelector('#supplierConfirmation button').click();t.doc.getElementById('batchDate').value=meta.date;await t.doc.getElementById('batchClean').onclick();await t.wait(()=>t.doc.querySelector('.admission-audit'));
   assert.match(t.doc.querySelector('.admission-audit').textContent,new RegExp('生成 27 条区域报价，可通过 '+accepted+' 条，待处理 '+pending+' 条'));
   t.doc.getElementById('batchForward').click();await t.wait(()=>t.doc.getElementById('message').textContent.includes('可导入 0 条仓库报价、'+accepted+' 条区域报价'));
   assert.match(t.doc.getElementById('message').textContent,new RegExp(pending+' 条待处理'));assert.equal(t.w.ComparisonStore.read().regionalQuotes?.length||0,0);
   assert.deepEqual(t.errors,[]);
  }finally{t.close()}
 }
});

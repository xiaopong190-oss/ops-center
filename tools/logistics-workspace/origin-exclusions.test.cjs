const {test}=require('node:test'),assert=require('node:assert/strict'),O=require('../logistics-rating/extensions/origin-exclusions.js'),M=require('./data-management.js');
test('cbm pricing is unconditional even for Shenzhen channels and retains the original evidence',()=>{
 const priced=[{unit:'cbm'},{unit:'CBM'},{unit:'CNY / cbm'},{unit:'m³'},{priceText:'120 CNY/cbm'},{currency:'CNY/cbm'},{pricingUnit:'cbm'},{values:['深圳物流','美国','深圳海运','ONT8',120,'CNY','cbm']}];
 for(const price of priced){const row={...price,channel:'深圳海运',company:'深圳物流',source:'深圳报价.xlsx',date:'2026-10-30'};assert.equal(O.classify(row).excluded,true,JSON.stringify(row));assert.match(O.classify(row).evidence,/计价单位/);
  const projected=O.projectDatabase({quotes:[row],regionalQuotes:[row],templates:[]});assert.equal(projected.quotes.length,0);assert.equal(projected.regionalQuotes.length,0);
  const cleaned=O.cleanDatabase({quotes:[row],regionalQuotes:[row]},'2026-10-30');assert.equal(cleaned.quotes.length,0);assert.equal(cleaned.regionalQuotes.length,0);assert.equal(cleaned.originExcludedQuotes[0].row,row);assert.match(cleaned.originExcludedQuotes[0].reason,/cbm/);
  const workbook=O.projectWorkbook({records:[row],regionalRecords:[row],reports:[]});assert.equal(workbook.records.length,0);assert.equal(workbook.regionalRecords.length,0);assert.equal(workbook.originExclusions[0].row,row);
 }
});

test('only actual Shenzhen channel fields can override geographical exclusions for non-cbm pricing',()=>{
 for(const city of ['宁波','厦门','常州','上海','金华','义乌','华东'])for(const channel of [{channel:'深圳海运'},{values:['物流','美国','深圳海运']}]){
  const row={unit:'kg',originCity:city,sourceNotes:[{value:city+'报价'}],...channel},input={records:[row],regionalRecords:[row],reports:[]};assert.equal(O.classify(row).excluded,false);assert.equal(O.projectWorkbook(input),input);assert.equal(O.projectDatabase({quotes:[row],regionalQuotes:[row]}).quotes.length,1);assert.equal(O.cleanDatabase({quotes:[row]},'2026-10-30').quotes.length,1);
 }
 for(const extra of [{company:'深圳物流'},{source:'深圳报价.xlsx'},{terms:'深圳交仓'},{sourceSheet:'深圳附表'},{sourceNotes:[{value:'深圳'}]},{values:['深圳物流','美国','海运']},{custom:{nested:['深圳']}},{originCity:'深圳'}]){
  const row={unit:'kg',channel:'上海海运',originCity:'宁波',...extra};assert.equal(O.classify(row).excluded,true,JSON.stringify(row));
 }
});

test('volume conversion notes alone do not turn a kilogram-priced quotation into cbm pricing',()=>{
 for(const row of [{unit:'kg',channel:'深圳海运',terms:'体积1cbm等于167kg'},{unit:'kg',priceText:'CBM conversion only'},{channel:'青岛起运'},{unit:'kg/cbm'}])assert.equal(O.classify(row).excluded,false,JSON.stringify(row));
 for(const city of ['常州','上海','金华','义乌','华东'])assert.equal(O.classify({unit:'kg',channel:'海运',sourceNotes:[{value:city+'报价'}]}).excluded,true);
});

test('only explicit affirmative excluded origins are hidden; aliases and original source fields are supported',()=>{
 for(const row of [{originCity:'宁波'},{originPort:'XIAMEN'},{originRaw:'厦门港'},{channel:'宁波起运美国海派'},{terms:'起运港：厦门'},{sourceSheet:'宁波/厦门起运报价'},{values:['物流','美国','宁波至美国','ONT8','10','CNY','kg',1,2,'2026-10-30','普货']},{terms:'Origin: Ningbo'},{terms:'POL=Xiamen'},{channel:'宁波',terms:'档=100KG+;条件=包税;起运/服务=宁波'},{channel:'厦门',terms:'起运/服务=厦门'},{sourceNotes:'始发地：厦门'},{sourceNotes:[{cell:'B3',value:'起运港：宁波'}]}])assert(O.classify(row).excluded,JSON.stringify(row));
 for(const row of [{company:'宁波物流公司',channel:'海派'},{source:'厦门物流报价.xlsx'},{terms:'客服地址厦门，电话123'},{terms:'非宁波起运'},{terms:'不从厦门起运'},{terms:'不是从宁波起运'},{terms:'宁波起运除外'},{originCity:'非宁波'},{originCity:'深圳',sourceSheet:'宁波起运附表'},{terms:'深圳起运；目的地宁波'},{terms:'宁波/深圳起运'},{originRaw:'宁波交货价'},{channel:'厦门交仓价'},{terms:'卸货港：厦门'},{terms:'目的地：宁波'},{channel:'深圳/宁波',terms:'起运/服务=深圳/宁波'},{terms:'起运/服务=海运;备注=厦门联系地址'}])assert.equal(O.classify(row).excluded,false,JSON.stringify(row));
});
test('published projection excludes both quote kinds and local origin audit but preserves templates and other business keys',()=>{
 const keep={channel:'深圳起运',date:'2026-10-30'},drop={channel:'厦门始发',date:'2026-10-30'},q={quotes:[keep,drop],regionalQuotes:[drop,keep],templates:[{country:'美国',warehouse:'ONT8'}],originExcludedQuotes:[{row:drop}],importExceptions:[{}],channelScoreEvents:[]},data={space:'real',storage:{[M.keys[0]]:[],[M.keys[1]]:q,[M.keys[2]]:{rows:[],aliases:{}},[M.keys[3]]:[]}},before=JSON.stringify(data),project=M.projection(data);
 assert.deepEqual(project.storage[M.keys[1]].quotes,[keep]);assert.deepEqual(project.storage[M.keys[1]].regionalQuotes,[keep]);assert(!('originExcludedQuotes'in project.storage[M.keys[1]]));assert.equal(project.storage[M.keys[1]].templates,q.templates);assert.equal(project.storage[M.keys[2]],data.storage[M.keys[2]]);assert.equal(JSON.stringify(data),before);
});
test('input cleanup archives excluded original rows once without deleting templates; original ten-day retention is preserved',()=>{
 const keep={channel:'深圳起运',date:'2026-10-30'},drop={channel:'宁波始发',date:'2026-10-30',price:1234,source:'原文件'},db={quotes:[keep,drop],regionalQuotes:[drop],templates:[{country:'美国',warehouse:'ONT8'}],originExcludedQuotes:[{row:{date:'2026-10-01'}}]},before=JSON.stringify(db),clean=O.cleanDatabase(db,'2026-10-30');assert.deepEqual(clean.quotes,[keep]);assert.equal(clean.regionalQuotes.length,0);assert.equal(clean.templates,db.templates);assert.equal(clean.originExcludedQuotes.length,2);assert.equal(clean.originExcludedQuotes[0].row,drop);assert.equal(O.cleanDatabase(clean,'2026-10-30'),clean);assert.equal(JSON.stringify(db),before);
});
test('background workbook cleaning omits excluded rows and reports source coordinates without losing raw evidence',()=>{
 const drop={values:['物流','美国','厦门起运','ONT8'],sourceSheet:'报价',sourceRow:8,priceCell:'G8'},keep={values:['物流','美国','海运','ONT8'],sourceSheet:'报价',sourceRow:9},input={records:[drop,keep],regionalRecords:[],reports:[{sheet:'报价',count:2}],omissions:[]},before=JSON.stringify(input),out=O.projectWorkbook(input);assert.deepEqual(out.records,[keep]);assert.equal(out.reports[0].originExcluded,1);assert.equal(out.reports[0].exclusions[0].priceCell,'G8');assert.equal(out.originExclusions[0].row,drop);assert.equal(JSON.stringify(input),before);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openRuntime}=require('./runtime-test-helper.cjs');

for(const access of ['operate','view'])test('warehouse grouping stays directly below filters; score thresholds, warehouse selection and reset compose in '+access,async()=>{
 const e=await openRuntime('compare',access);
 try{
  const {w,doc}=e,day=new w.Date().toLocaleDateString('sv-SE');
  const company=w.Companies.ensure('合成评分物流');
  const rows=['BHX1','MAN1'].map(warehouse=>({...w.QuoteCore.normalize([company.name,'英国','海运-'+warehouse,warehouse,'10','CNY','kg',10,20,day,'普货']),companyId:company.id}));
  const db=w.QuoteCore.merge({quotes:[],templates:[]},rows,day).db;
  db.regionalQuotes=rows.map(row=>({...row,regionRaw:row.warehouse}));
  w.ComparisonStore.commit(w.ChannelScore.add(db,rows[0],1,'合成高分记录'));
  const before=JSON.stringify(w.ComparisonStore.read());
  doc.querySelector('#country').dispatchEvent(new w.Event('change',{bubbles:true}));
  const results=doc.querySelector('.comparison-results'),regional=doc.querySelector('#regional-query-panel');
  assert(results.compareDocumentPosition(regional)&w.Node.DOCUMENT_POSITION_FOLLOWING);
  assert(doc.querySelector('#n001Search').compareDocumentPosition(results)&w.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(doc.querySelector('#scoreViewMode').value,'grouped');
  assert.equal(doc.querySelectorAll('#comparison .warehouse-group').length,2);
  assert(results.contains(doc.querySelector('#scoreViewControls')));
  doc.querySelector('#scoreMin').value='5.5';
  doc.querySelector('#scoreApply').click();
  assert.equal(doc.querySelector('#scoreViewMode').value,'score');
  assert.equal(doc.querySelectorAll('#comparison tbody tr').length,1);
  assert.match(doc.querySelector('#comparison').textContent,/BHX1/);
  assert.doesNotMatch(doc.querySelector('#comparison').textContent,/MAN1/);
  const warehouse=doc.querySelector('#warehouse');
  warehouse.value='MAN1';warehouse.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(doc.querySelectorAll('#comparison tbody tr').length,0);
  assert.match(doc.querySelector('#comparison').textContent,/当前筛选范围没有报价/);
  doc.querySelector('#n001Reset').click();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(warehouse.value,'');
  assert.equal(doc.querySelector('#scoreMin').value,'');
  assert.equal(doc.querySelector('#scoreViewMode').value,'grouped');
  assert.equal(doc.querySelectorAll('#comparison .warehouse-group').length,2);
  assert.equal(JSON.stringify(w.ComparisonStore.read()),before);
  assert.equal(e.errors.length,0);
 }finally{e.close();}
});

const {test}=require('node:test'),assert=require('node:assert/strict');
const {openRuntime}=require('./runtime-test-helper.cjs');
for(const access of ['operate','view'])test('result transport dropdown composes with warehouses, score, pages, exports and reset: '+access,async()=>{
 const e=await openRuntime('compare',access),{w,doc}=e,$=id=>doc.getElementById(id);
 try{
  const day=new w.Date().toLocaleDateString('sv-SE'),company=w.Companies.ensure('模拟运输筛选'),modes=['空运','海运','卡航','铁路','未披露'],rows=[];
  for(let i=0;i<215;i++)rows.push({...w.QuoteCore.normalize([company.name,'英国',modes[i%5]+'渠道'+i,i%2?'MAN1':'BHX1','10','CNY','kg',10,20,day,'唯一证据-'+i]),companyId:company.id});
  let db=w.QuoteCore.merge({quotes:[],templates:[]},rows,day).db;db.regionalQuotes=rows.map(r=>({...r,regionRaw:r.warehouse}));db=w.ChannelScore.add(db,rows[0],1,'模拟高分');db=w.OriginExclusions.cleanDatabase(w.QuoteDataQuality.archive(db,{today:day}),day);w.ComparisonStore.commit(db);await w.LocalQuoteStore.flush();
  const before=JSON.stringify(w.ComparisonStore.read()),stored=[...Array(w.localStorage.length)].map((_,i)=>[w.localStorage.key(i),w.localStorage.getItem(w.localStorage.key(i))]);
  let csv='';w.Blob=class{constructor(parts){this.parts=parts}};w.URL.createObjectURL=blob=>{csv=blob.parts.join('');return 'blob:test'};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};
  const change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('change',{bubbles:true}))};
  const exported=()=>{$('exportQuotes').click();return Array.from(w.QuoteCore.parse(csv.replace(/^\uFEFF/,''))).slice(1).map(r=>r[10]).sort()};
  const all=rows.map(r=>r.terms).sort();assert.deepEqual(exported(),all);assert.equal($('n001Next').disabled,false);
  assert(doc.querySelector('.comparison-results').contains($('resultTransport')));
  assert.equal(w.getComputedStyle(doc.querySelector('.n001-modes')).display,'none');
  $('n001Next').click();assert.equal(w.N001UI.page,1);
  for(let round=0;round<2;round++)for(const mode of ['空运','海运','卡航','铁路','其它','']){
   change('resultTransport',mode);assert.equal(w.N001UI.page,0);
   const expected=rows.filter(r=>!mode||w.N001UI.transport(r)===(mode==='其它'?'待确认':mode)).map(r=>r.terms).sort();
   assert.deepEqual(exported(),expected,'full export '+mode);
   assert.equal(doc.querySelectorAll('#regional-query-panel tbody tr').length,Math.min(expected.length,50));
   assert.equal(doc.querySelectorAll('#comparison tbody tr').length,Math.min(expected.length,200));
  }
  change('resultTransport','空运');change('warehouse','BHX1');assert.deepEqual(exported(),rows.filter(r=>r.warehouse==='BHX1'&&w.N001UI.transport(r)==='空运').map(r=>r.terms).sort());
  $('scoreMin').value='5.5';$('scoreApply').click();assert.equal($('scoreViewMode').value,'score');assert.deepEqual(exported(),[rows[0].terms]);
  change('resultTransport','海运');assert.deepEqual(exported(),[]);assert.equal(doc.querySelectorAll('#comparison tbody tr').length,0);
  $('n001Reset').click();await new Promise(r=>setTimeout(r,30));assert.equal($('resultTransport').value,'');assert.equal($('warehouse').value,'');assert.equal($('scoreViewMode').value,'grouped');assert.deepEqual(exported(),all);
  // Reproduce the published-snapshot race: the extension loads before delayed score controls.
  const controls=$('scoreViewControls');controls.replaceChildren();await new Promise(r=>setTimeout(r,20));
  assert.equal($('resultTransport'),null,'wait for the real score toolbar, not an early orphan control');
  w.LogisticsScoreView.createScoreListController(doc,()=>w.ComparisonStore.render());await new Promise(r=>setTimeout(r,0));
  assert.equal(doc.querySelectorAll('#resultTransport').length,1,'mounted after delayed toolbar initialization');
  change('resultTransport','空运');
  for(let rebuild=0;rebuild<3;rebuild++){
   w.LogisticsScoreView.createScoreListController(doc,()=>w.ComparisonStore.render());await new Promise(r=>setTimeout(r,0));
   assert.equal(doc.querySelectorAll('#resultTransport').length,1,'exactly one control after toolbar rebuild');assert.equal($('resultTransport').value,'空运','selected transport survives rebuild');
   assert.deepEqual(exported(),rows.filter(r=>w.N001UI.transport(r)==='空运').map(r=>r.terms).sort());
  }
  $('n001Reset').click();await new Promise(r=>setTimeout(r,30));assert.equal($('resultTransport').value,'');assert.deepEqual(exported(),all);
  assert.equal(JSON.stringify(w.ComparisonStore.read()),before,'business records unchanged');for(const [key,value] of stored)assert.equal(w.localStorage.getItem(key),value,'persistent data unchanged: '+key);
  assert.equal(e.errors.length,0);
 }finally{e.close()}
});

const {test}=require('node:test'),assert=require('node:assert/strict'),{openRuntime}=require('./runtime-test-helper.cjs');
const settle=()=>new Promise(r=>setTimeout(r,25));
for(const access of ['operate','view'])test('linked filter functional matrix: '+access,async t=>{
 const e=await openRuntime('compare',access),w=e.w,d=e.doc,$=s=>d.querySelector(s);
 try{
  const day=new w.Date().toLocaleDateString('sv-SE'),providers=[w.Companies.ensure('天盛测试'),w.Companies.ensure('长河测试')],rows=[];
  for(const company of providers)for(const [country,warehouse] of [['美国','ONT8'],['美国','LGB8'],['英国','BHX1']])for(const mode of ['海运','空运'])for(const cargo of ['普货','带电'])for(const tax of ['包税','不包税']){
   const channel=mode+'-'+cargo+'-'+tax;
   rows.push({...w.QuoteCore.normalize([company.name,country,channel,warehouse,'10','CNY','kg',10,20,day,cargo+'；'+tax]),companyId:company.id,sourceSheet:mode,cargoType:cargo,taxType:tax,geographyRegion:country==='英国'?'欧洲':'美洲'});
  }
  const db=w.QuoteCore.merge({quotes:[],templates:[]},rows,day).db;db.regionalQuotes=rows.map((r,i)=>({...r,regionRaw:'邮编-'+i}));w.ComparisonStore.commit(db);await w.LocalQuoteStore.flush();await settle();
  const before=JSON.stringify(w.ComparisonStore.read()),count=()=>$('#regional-query-panel tbody').rows.length,warehouseCount=()=>$('#comparison').querySelectorAll('tbody tr').length;
  const choose=(id,value)=>{const el=d.getElementById(id);el.value=value;assert.equal(el.value,value,'option exists: '+id+'; options='+[...el.options].map(o=>o.value).join('|'));el.dispatchEvent(new w.Event('change',{bubbles:true}))};
  const radio=value=>{const input=$('#taxFilter input[value="'+value+'"]');input.checked=true;input.dispatchEvent(new w.Event('change',{bubbles:true}))};
  const cargo=value=>{const input=[...d.querySelectorAll('#cargoFilter input')].find(x=>x.value===value);input.checked=true;input.dispatchEvent(new w.Event('change',{bubbles:true}))};
  const reset=async()=>{$('#n001Reset').click();await settle()};
  await t.test('warehouse reverse country refreshes regional results immediately and clearing restores both tables',async()=>{
   await reset();
   const initial=count();
   choose('warehouse','BHX1');
   assert.equal($('#country').value,'英国');
   assert.equal(warehouseCount(),16);
   assert.equal(count(),16);
   assert.doesNotMatch($('#regional-query-panel tbody').textContent,/美国/);
   assert.equal(JSON.stringify(w.ComparisonStore.read()),before);
   await reset();
   assert.equal(count(),initial);
   assert.equal(warehouseCount(),48);
  });
  const cases=[
   ['provider',()=>choose('provider',providers[1].id),24,24],
   ['country',()=>choose('country','英国'),16,16],
   ['region',()=>choose('region','欧洲'),16,16],
   ['channel',()=>choose('channel','海运-带电-不包税'),6,6],
   ['warehouse filters exact quotes and explicit regional coverage',()=>choose('warehouse','ONT8'),16,16],
   ['transport exclusion',()=>d.querySelector('[data-transport="海运"]').click(),24,24],
   ['transport outside',()=>{d.querySelector('[data-transport="海运"]').click();choose('n001Scope','outside')},24,24],
   ['transport all',()=>{d.querySelector('[data-transport="海运"]').click();choose('n001Scope','all')},48,48],
   ['single remaining transport then outside',()=>{for(const mode of ['海运','铁路','卡航','其它'])d.querySelector('[data-transport="'+mode+'"]').click();choose('n001Scope','outside')},24,24],
   ['single remaining transport then all',()=>{for(const mode of ['海运','铁路','卡航','其它'])d.querySelector('[data-transport="'+mode+'"]').click();choose('n001Scope','all')},48,48],
   ['tax included',()=>radio('included'),24,24],
   ['tax excluded',()=>radio('excluded'),24,24],
   ['tax unknown',()=>radio('unknown'),0,0],
   ['cargo battery',()=>cargo('带电'),24,24],
   ['cargo multi-select OR',()=>{cargo('带电');cargo('普货')},48,48],
   ['combined provider/country/channel/cargo/tax',()=>{choose('provider',providers[1].id);choose('country','英国');cargo('带电');radio('excluded');choose('channel','空运')},1,1]
  ];
  await t.test('country-only rows cannot appear as warehouse matches and remain available for review',async()=>{
   await reset();
   const original=w.ComparisonStore.read();
   const sample=original.regionalQuotes.find(row=>row.warehouse==='BHX1');
   const broad={...sample,warehouse:undefined,regionRaw:'英国'};
   const other={...sample,warehouse:undefined,regionRaw:'MAN1'};
   w.ComparisonStore.commit({...original,regionalQuotes:[broad,other]});
   choose('country','英国');
   assert.equal(count(),2);
   choose('warehouse','BHX1');
   assert.equal(count(),0);
   assert.match($('[data-region-status]').textContent,/原文明确覆盖 0 条，其他 2 条覆盖待核实/);
   const coverage=$('[data-region-coverage]');
   coverage.value='unverified';coverage.dispatchEvent(new w.Event('change',{bubbles:true}));
   assert.equal(count(),2);
   assert.match($('[data-region-status]').textContent,/当前显示覆盖待核实报价/);
   w.ComparisonStore.commit(original);
   await reset();
   assert.equal(count(),48);
   assert.equal(coverage.value,'confirmed');
   assert.equal($('[data-region-coverage-label]').hidden,true);
  });
  for(const [label,action,expectedWarehouse,expectedRegional] of cases)await t.test(label,async()=>{await reset();action();await settle();assert.equal(warehouseCount(),expectedWarehouse,'warehouse count');assert.equal(count(),expectedRegional,'regional count');assert.equal(JSON.stringify(w.ComparisonStore.read()),before,'filters cannot change stored data')});
  await t.test('cargo clear button updates both tables',async()=>{await reset();cargo('带电');await settle();$('#cargoFilter button').click();await settle();assert.equal(count(),48);assert.equal(warehouseCount(),48)});
  await t.test('regional local provider/search/mode compose and reset clears them',async()=>{await reset();const local=$('[data-region-provider]');local.value=providers[1].id;local.dispatchEvent(new w.Event('change'));const mode=$('[data-region-mode]');mode.value='空运';mode.dispatchEvent(new w.Event('change'));const search=$('[data-region-query]');search.value='英国';search.dispatchEvent(new w.Event('input'));assert.equal(count(),4);assert.equal(warehouseCount(),48);await reset();assert.equal(local.value,'');assert.equal(mode.value,'');assert.equal(search.value,'');assert.equal(count(),48)});
  await t.test('empty search and combined reset remove every residual condition',async()=>{await reset();choose('provider',providers[1].id);cargo('带电');radio('excluded');const search=$('[data-region-query]');search.value='不存在';search.dispatchEvent(new w.Event('input'));assert.equal(count(),0);await reset();assert.equal(count(),48);assert.equal(warehouseCount(),48);assert.equal($('#provider').value,'');assert.equal($('#taxFilter input:checked').value,'');assert.equal(d.querySelectorAll('#cargoFilter input:checked').length,0);assert.equal(JSON.stringify(w.ComparisonStore.read()),before)});
  await t.test('comparison calculation does not detach the supplier filter',async()=>{await reset();choose('provider',providers[1].id);choose('warehouse','ONT8');$('#n001Compare').click();await settle();assert.equal(count(),8);assert(!$('#regional-query-panel tbody').textContent.includes(providers[0].name));assert.equal(JSON.stringify(w.ComparisonStore.read()),before)});
  await t.test('pagination resets after a filter change',async()=>{await reset();const source=w.ComparisonStore.read(),next={...source,regionalQuotes:[...source.regionalQuotes,...source.regionalQuotes.map(r=>({...r,regionRaw:r.regionRaw+'-duplicate'}))]};w.ComparisonStore.commit(next);await e.wait(()=>$('[data-region-status]').textContent.includes('96'));await settle();$('[data-region-next]').click();assert.match($('[data-region-page]').textContent,/2 \/ 2/);choose('provider',providers[1].id);assert.match($('[data-region-page]').textContent,/1 \/ 1/);assert.equal(count(),48)});
  assert.equal(e.errors.length,0);
 }finally{e.close()}
});

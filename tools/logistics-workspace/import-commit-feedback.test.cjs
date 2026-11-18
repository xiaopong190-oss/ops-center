const {test}=require('node:test'),assert=require('node:assert/strict'),{openRuntime}=require('./runtime-test-helper.cjs');
async function preview(e){const {w,doc}=e,day=new w.Date().toLocaleDateString('sv-SE');w.dispatchEvent(new w.CustomEvent('matrix-batch-ready',{detail:{records:[],regionalRecords:[{company:'输入反馈合成物流',country:'英国',regionRaw:'合成区域',channel:'空运',price:860,currency:'CNY',unit:'kg',date:day,terms:'普货'}],rejectedRecords:[],fileName:'SYNTHETIC_ONLY.xlsx'}}));await e.wait(()=>!doc.querySelector('#commit').disabled);}
test('actual click shows progress before async recovery, blocks duplicate commit, and clears dirty on success',async()=>{const e=await openRuntime();try{await preview(e);const {w,doc}=e,button=doc.querySelector('#commit'),feedback=doc.querySelector('#import-commit-feedback'),original=w.ImportRecovery.beforeImport;let release,calls=0;const gate=new Promise(r=>release=r);w.ImportRecovery.beforeImport=async db=>{calls++;await gate;return original(db)};doc.querySelector('#draftNotes').dispatchEvent(new w.Event('change',{bubbles:true}));button.click();assert.match(feedback.textContent,/正在核对任务/);assert.equal(button.getAttribute('aria-busy'),'true');button.click();assert.equal(calls,1);assert.equal(w.ComparisonStore.read().regionalQuotes?.length||0,0);release();await e.wait(()=>feedback.textContent.includes('本次导入已保存到本机'));assert.equal(w.ComparisonStore.read().regionalQuotes.length,1);assert.equal(button.hasAttribute('aria-busy'),false);assert.equal(doc.documentElement.hasAttribute('data-hangxu-dirty'),false);assert.equal(e.errors.length,0)}finally{e.close()}});
test('failed checkpoint gives visible error, preserves preview, and repeated failures can still retry successfully',async()=>{const e=await openRuntime();try{await preview(e);const {w,doc}=e,button=doc.querySelector('#commit'),feedback=doc.querySelector('#import-commit-feedback'),original=w.ImportRecovery.willCommit;w.ImportRecovery.willCommit=async()=>{throw Error('合成测试：恢复点存储不可用')};for(let i=0;i<2;i++){button.click();await e.wait(()=>feedback.textContent.includes('恢复点存储不可用')&&!button.hasAttribute('aria-busy'));assert.equal(button.disabled,false);assert.equal(w.ComparisonStore.read().regionalQuotes?.length||0,0);assert.equal(feedback.getAttribute('role'),'alert');}w.ImportRecovery.willCommit=original;button.click();await e.wait(()=>feedback.textContent.includes('本次导入已保存到本机'));assert.equal(w.ComparisonStore.read().regionalQuotes.length,1);assert.equal(e.errors.length,0)}finally{e.close()}});
test('failed import retains unsaved-preview state after the old timer boundary',async()=>{const e=await openRuntime();try{await preview(e);const {w,doc}=e;doc.querySelector('#draftNotes').dispatchEvent(new w.Event('change',{bubbles:true}));w.ImportRecovery.beforeImport=async()=>{throw Error('合成测试：任务读取失败')};doc.querySelector('#commit').click();await e.wait(()=>doc.querySelector('#import-commit-feedback').textContent.includes('任务读取失败'));await new Promise(r=>setTimeout(r,300));assert.equal(doc.documentElement.hasAttribute('data-hangxu-dirty'),true)}finally{e.close()}});
test('read-only runtime never installs an import commit action',async()=>{const e=await openRuntime('import','view');try{assert.equal(e.doc.querySelector('#import-commit-feedback'),null)}finally{e.close()}});

test('regional-only receipt opens the saved batch, not an earlier batch for the same supplier',async()=>{
 const e=await openRuntime(),{w,doc}=e;
 try{
  w.LogisticsSpace={mode:'local',isDemo:false};
  const sent=[];Object.defineProperty(w,'parent',{value:{postMessage:message=>sent.push(message)}});
  const historicalDate=new w.Date(w.Date.now()-86400000).toLocaleDateString('sv-SE');
  const supplier={id:'synthetic-old',name:'输入反馈合成物流',aliases:[]};
  const historical={companyId:supplier.id,company:supplier.name,country:'英国',regionRaw:'合成区域',channel:'空运',price:839,currency:'CNY',unit:'kg',date:historicalDate,terms:'普货'};
  w.ComparisonStore.commit(w.SupplierQuoteBatch.capture(w.ComparisonStore.read(),[],[historical],[supplier],w.crypto.randomUUID()));
  const earlier=w.ComparisonStore.read().pendingQuoteBatches[0].id;
  await preview(e);doc.querySelector('#commit').click();
  const publish=doc.querySelector('#publish-imported-batch'),feedback=doc.querySelector('#import-commit-feedback');
  await e.wait(()=>!publish.hidden);
  const batches=w.ComparisonStore.read().pendingQuoteBatches;
  assert.equal(batches.length,2);assert.notEqual(batches[1].id,earlier);
  assert.match(feedback.textContent,/仓库报价 0 条，区域报价 1 条。尚未发布/);
  assert(!sent.some(message=>message.type==='hangxu-preview-imported-batch'));
  publish.click();assert.equal(sent.at(-1).type,'hangxu-preview-imported-batch');assert.equal(sent.at(-1).batchId,batches[1].id);
  doc.querySelector('#draftNotes').dispatchEvent(new w.Event('change',{bubbles:true}));
  publish.click();assert.equal(sent.filter(message=>message.type==='hangxu-preview-imported-batch').length,1);
 }finally{e.close();}
});

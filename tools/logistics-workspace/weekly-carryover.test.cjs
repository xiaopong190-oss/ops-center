const {test}=require('node:test'),assert=require('node:assert/strict'),{openRuntime}=require('./runtime-test-helper.cjs');
const today='2026-11-09',pause=()=>new Promise(r=>setTimeout(r,35));
async function prepared(access='operate',name='compare',options={}){const date=options.today||today,e=await openRuntime(name,access,false,{today:date}),{w}=e;if(options.weeklyReminder)w.WorkspaceSnapshot.weeklyReminder=options.weeklyReminder;const c=w.Companies.ensure('甲上周物流'),other=w.Companies.ensure('乙上周物流'),rows=[c,other].map(company=>({...w.QuoteCore.normalize([company.name,'英国','海运','BHX1','10','CNY','kg',10,20,'2026-11-06','普货']),companyId:company.id}));let db=w.QuoteCore.merge({quotes:[],templates:[]},rows,date).db;db.regionalQuotes=rows.map(r=>({...r,regionRaw:'BHX1'}));db=w.OriginExclusions.cleanDatabase(w.QuoteDataQuality.archive(db,{today:date}),date);w.ComparisonStore.commit(db);await w.LocalQuoteStore.flush();await pause();return {...e,rows,c,other}}
test('new local week prompts once, explicit keep shows labelled original dates in both tables and export',async()=>{const e=await prepared(),{w,doc}=e,$=id=>doc.getElementById(id);try{
 assert($('weekly-carryover-dialog').open);assert.match($('weekly-carryover-dialog').textContent,/2026-11-02 至 2026-11-08/);assert.match($('weekly-carryover-dialog').textContent,/原始报价日期不改|原始日期/);assert.equal(doc.querySelectorAll('#comparison tbody tr').length,0);
 $('weekly-carryover-dialog').querySelector('[data-week-keep]').click();await e.wait(()=>w.ComparisonStore.read().weeklyCarryover?.choice==='keep'&&!$('weekly-carryover-dialog').open);await pause();assert.equal(doc.querySelectorAll('#comparison tbody tr').length,2);assert.equal(doc.querySelectorAll('#regional-query-panel tbody tr').length,2);assert.match($('comparison').textContent,/沿用上周（2026-11-06）/);assert.match($('weekly-carryover-panel').textContent,/甲上周物流/);
 let csv='';w.Blob=class{constructor(parts){this.parts=parts}};w.URL.createObjectURL=b=>{csv=b.parts.join('');return 'blob:test'};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};$('exportQuotes').click();const exported=Array.from(w.QuoteCore.parse(csv.replace(/^\uFEFF/,''))).slice(1);assert.equal(exported.length,2);assert(exported.every(row=>row[9]==='2026-11-06'),'source date stays original in CSV');
 w.ComparisonStore.render();w.dispatchEvent(new w.Event('focus'));await pause();assert.equal($('weekly-carryover-dialog').open,false,'no repeated automatic prompt');$('weekly-carryover-open').click();assert($('weekly-carryover-dialog').open);$('weekly-carryover-dialog').querySelector('[data-week-skip]').click();await e.wait(()=>w.ComparisonStore.read().weeklyCarryover.choice==='skip');await pause();assert.equal(doc.querySelectorAll('#comparison tbody tr').length,0);assert.equal(w.ComparisonStore.read().quotes.length,2);
 }finally{e.close()}});
test('decline is recorded once and quote data remains untouched; same-week manual button still works',async()=>{const e=await prepared(),{w,doc}=e;try{const before=JSON.stringify(w.ComparisonStore.read().quotes);doc.querySelector('[data-week-skip]').click();await e.wait(()=>w.ComparisonStore.read().weeklyCarryover?.choice==='skip'&&!doc.getElementById('weekly-carryover-dialog').open);w.dispatchEvent(new w.Event('focus'));await pause();assert.equal(doc.getElementById('weekly-carryover-dialog').open,false);assert.equal(JSON.stringify(w.ComparisonStore.read().quotes),before);doc.getElementById('weekly-carryover-open').click();doc.querySelector('[data-week-keep]').click();await e.wait(()=>w.ComparisonStore.read().weeklyCarryover.choice==='keep');assert.equal(w.WeeklyCarryover.effective(w.ComparisonStore.read(),today).quotes.length,2)}finally{e.close()}});
test('display-only pages do not prompt or write and can show published carry decisions',async()=>{const e=await prepared('view'),{w,doc}=e;try{assert.equal(doc.getElementById('weekly-carryover-dialog').open,false);assert.equal(doc.getElementById('weekly-carryover-open'),null);const source=w.ComparisonStore.read(),next=w.WeeklyCarryover.choose(source,today,'keep');w.ComparisonStore.commit(next);await pause();assert.equal(doc.querySelectorAll('#comparison tbody tr').length,2);assert.equal(doc.getElementById('weekly-carryover-dialog').open,false);assert.match(doc.getElementById('comparison').textContent,/沿用上周/)}finally{e.close()}});
test('stale dialog and failed local save never replace the original business master',async()=>{const e=await prepared(),{w,doc}=e;try{const base=w.ComparisonStore.read();w.ComparisonStore.commit({...base,templates:[...base.templates,{country:'英国',warehouse:'MAN1'}]});doc.querySelector('[data-week-keep]').click();await pause();assert.equal(w.ComparisonStore.read().weeklyCarryover,undefined);assert.match(doc.querySelector('[data-week-error]').textContent,/报价已变化/);doc.getElementById('weekly-carryover-dialog').dispatchEvent(new w.Event('cancel',{cancelable:true}));doc.getElementById('weekly-carryover-open').click();const stable=w.ComparisonStore.read(),flush=w.LocalQuoteStore.flush;w.LocalQuoteStore.flush=async()=>{throw Error('模拟磁盘写入失败')};doc.querySelector('[data-week-keep]').click();await pause();assert.equal(w.ComparisonStore.read().weeklyCarryover,undefined);assert.deepEqual(w.ComparisonStore.read().quotes,stable.quotes);assert.match(doc.querySelector('[data-week-error]').textContent,/模拟磁盘写入失败/);w.LocalQuoteStore.flush=flush;}finally{e.close()}});
test('only a confirmed validated provider import replaces its carried warehouse and regional rows',async()=>{const e=await prepared('operate','import'),{w,doc}=e;try{
 doc.querySelector('[data-week-keep]').click();await e.wait(()=>w.ComparisonStore.read().weeklyCarryover?.choice==='keep'&&!doc.getElementById('weekly-carryover-dialog').open);const old=w.ComparisonStore.read(),before=JSON.stringify(old);
 // Supplier selection alone is a preview step, never a commit.
 doc.getElementById('draftCompany').dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(JSON.stringify(w.ComparisonStore.read()),before);
 const data=[w.QuoteCore.HEADER,[e.c.name,'英国','空运','BHX1','12','CNY','kg',10,20,today,'普货']].map(row=>row.join(',')).join('\r\n'),bytes=new TextEncoder().encode(data);await doc.getElementById('file').onchange({target:{files:[{name:'本周模拟报价.csv',size:bytes.length,arrayBuffer:async()=>bytes.buffer}]}});
 assert.equal(JSON.stringify(w.ComparisonStore.read()),before,'CSV preview does not clear last week');
 const ack=doc.getElementById('warehouseAcknowledge');if(ack){ack.checked=true;ack.dispatchEvent(new w.Event('change'))}assert.equal(doc.getElementById('commit').disabled,false);await doc.getElementById('commit').onclick();await w.LocalQuoteStore.flush();const db=w.ComparisonStore.read(),active=w.WeeklyCarryover.effective(db,today);assert.equal(db.quotes.filter(r=>r.companyId===e.c.id).length,1);assert.equal(db.quotes.find(r=>r.companyId===e.c.id).price,1200);assert(!db.weeklyCarryover.quotes.some(r=>r.companyId===e.c.id));assert(!db.weeklyCarryover.regionalQuotes.some(r=>r.companyId===e.c.id));assert.equal(active.carriedQuotes.length,1);assert.equal(active.carriedQuotes[0].companyId,e.other.id);assert.equal(active.carriedRegions.length,1);
 }finally{e.close()}});

test('the import page blocks carry only while a file preview is pending',async()=>{const e=await prepared('operate','import'),{w,doc}=e;try{
 const dialog=doc.getElementById('weekly-carryover-dialog'),file=doc.getElementById('file'),button=doc.getElementById('weekly-carryover-open');
 dialog.dispatchEvent(new w.Event('cancel',{cancelable:true}));
 file.onchange=null;Object.defineProperty(file,'files',{value:[{name:'已录入报价.csv'}]});
 file.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert(doc.documentElement.hasAttribute('data-hangxu-dirty'));
 button.click();assert.equal(dialog.open,false);
 doc.getElementById('commit').disabled=false;
 doc.getElementById('commit').onclick=()=>{doc.getElementById('commit').disabled=true};
 doc.getElementById('commit').click();
 await e.wait(()=>!doc.documentElement.hasAttribute('data-hangxu-dirty'));
 button.click();assert(dialog.open);assert.equal(file.files.length,1);
 }finally{e.close()}});

test('Tuesday through Sunday never automatically ask; the manual action remains available',async()=>{
 for(const date of ['2026-11-10','2026-11-15']){
  const e=await prepared('operate','compare',{today:date,weeklyReminder:()=>{throw Error('unexpected lookup')}});
  try{
   const dialog=e.doc.getElementById('weekly-carryover-dialog');
   assert(!dialog.open);e.doc.getElementById('weekly-carryover-open').click();assert(dialog.open);
  }finally{e.close()}
 }
});
test('a successful Monday decision suppresses automatic prompts on another input computer before publication',async()=>{
 let confirmed=false;const calls=[];
 const weeklyReminder=async(week,confirm)=>{calls.push([week,confirm]);if(confirm)confirmed=true;return {confirmed}};
 const a=await prepared('operate','compare',{weeklyReminder});
 try{
  assert(a.doc.getElementById('weekly-carryover-dialog').open);
  a.doc.querySelector('[data-week-skip]').click();await a.wait(()=>confirmed);
  const b=await prepared('operate','compare',{weeklyReminder});
  try{
   assert(!b.doc.getElementById('weekly-carryover-dialog').open);
   assert.equal(b.w.ComparisonStore.read().weeklyCarryover,undefined);
   assert.deepEqual(calls,[[today,false],[today,true],[today,false]]);
   b.doc.getElementById('weekly-carryover-open').click();assert(b.doc.getElementById('weekly-carryover-dialog').open);
  }finally{b.close()}
 }finally{a.close()}
});
test('an unavailable team check leaves the automatic dialog closed while permitting manual offline use',async()=>{
 let online=false,confirmed=false;
 const e=await prepared('operate','compare',{weeklyReminder:async(week,confirm)=>{if(!online)throw Error('offline');assert.equal(week,today);assert(confirm);confirmed=true;return {confirmed}}});
 try{
  const dialog=e.doc.getElementById('weekly-carryover-dialog');
  assert(!dialog.open);e.doc.getElementById('weekly-carryover-open').click();assert(dialog.open);
  e.doc.querySelector('[data-week-keep]').click();
  await e.wait(()=>/待联网同步/.test(e.doc.getElementById('weekly-carryover-panel').textContent));
  assert.equal(e.w.ComparisonStore.read().weeklyCarryover.choice,'keep');
  online=true;const PriorDate=e.w.Date,tuesday='2026-11-10T12:00:00';
  e.w.Date=class extends PriorDate{constructor(...args){super(...(args.length?args:[tuesday]))}static now(){return new PriorDate(tuesday).getTime()}};
  e.w.dispatchEvent(new e.w.Event('focus'));await e.wait(()=>confirmed);
  assert(!dialog.open);
 }finally{e.close()}
});

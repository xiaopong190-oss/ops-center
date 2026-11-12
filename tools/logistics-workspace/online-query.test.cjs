const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('../../modules/new-product-followup/work/qa/node_modules/jsdom');
const Q=require('../logistics-rating/quote-core.js');
const base=__dirname,now=new Date('2026-11-11T04:00:00Z');
function fixture(){
 const companies=[{id:'a',name:'甲物流',aliases:[],imported:true},{id:'b',name:'乙物流',aliases:[],imported:true}],quotes=[];
 for(const company of companies)for(let i=0;i<200;i++){
  const country=i%4<2?'英国':'美国',warehouse=['BHX1','MAN1','ONT8','LGB8'][i%4],channel=i%2?'空运':'海运';
  quotes.push({...Q.normalize([company.name,country,channel,warehouse,company.id==='a'?'10':'12','CNY','kg',10,20,'2026-11-11',(i%3?'普货':'带电')+'；'+(i%3?'包税':'不包税')+'；条件'+i]),companyId:company.id});
 }
 const db=Q.merge({quotes:[],templates:[]},quotes,'2026-11-11').db;
 db.regionalQuotes=quotes.slice(0,12).map(row=>({...row,warehouse:'',regionRaw:'BHX1 MAN1 ONT8 LGB8'}));
 return {space:'real',storage:{'logistics-company-directory-v1':companies,'logistics-quotes-v1':db,'logistics-monthly-bills-v1':{rows:[],aliases:{}},'logistics-completed-ratings-v1':[]}};
}
async function open(env,user='one',module='compare',hooks={}){
 const {logisticsQuery}=await import('../../cloud/logistics-query-store.mjs'),calls=[],messages=[],downloads=[];
 let latestBlob;
 const dom=new JSDOM(fs.readFileSync(path.join(base,'runtime/online.html'),'utf8'),{url:'https://public.example/tools/logistics-workspace/runtime/online.html?module='+module,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.localStorage.setItem('ops-cloud-session-v1','token-'+user);
 const nativeSet=w.Storage.prototype.setItem;
 w.Storage.prototype.setItem=function(key,value){assert.equal(key,'ops-cloud-session-v1','query may not persist business records');return nativeSet.call(this,key,value)};
 Object.defineProperty(w,'indexedDB',{value:{open(){throw Error('online query must not open IndexedDB')}}});
 w.Blob=Blob;w.URL.createObjectURL=blob=>{latestBlob=blob;return 'blob:test'};w.URL.revokeObjectURL=()=>{};
 w.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,text:latestBlob.text()})};
 w.parent.postMessage=message=>messages.push(message);
 w.fetch=async(url,options)=>{
  assert(url.startsWith('https://ops-center-cloud.xiaopong190-asin-radar.workers.dev/api/logistics-query'));
  assert.equal(options.headers.Authorization,'Bearer token-'+user);assert(['GET','POST'].includes(options.method||'GET'));
  const query=options.method==='POST'?new URLSearchParams(options.body):new URL(url).searchParams;calls.push(query);
  if(hooks.beforeRequest)await hooks.beforeRequest(query);
  try{const response=await logisticsQuery(new Request(url,{method:options.method,headers:options.headers,body:options.body}),env,{id:user},now);const result=await response.json();hooks.mutateResponse?.(result,query);return {ok:response.ok,status:response.status,json:async()=>result}}
  catch(error){return {ok:false,status:error.status||500,json:async()=>({error:error.message})}}
 };
 const errors=[];w.addEventListener('error',event=>errors.push(event.message));
 w.eval(fs.readFileSync(path.join(base,'online-classic-filters.js'),'utf8'));
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.eval(fs.readFileSync(path.join(base,'../logistics-rating/extensions/score-list-columns.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(base,'table-columns.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(base,'online-column-filters.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(base,'online-query.js'),'utf8'));
 const wait=async predicate=>{for(let i=0;i<250;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10))}throw Error('online page not ready: '+w.document.body.textContent.slice(0,500)+' '+errors.join('|'))};
 await wait(()=>messages.some(message=>message.ready||hooks.expectFailure&&message.error)||errors.length);
 assert.deepEqual(errors,[]);
 return {w,doc:w.document,calls,messages,downloads,wait,close(){w.dispatchEvent(new w.Event('pagehide'));w.close()}};
}
test('cold online pages load only bounded query results; two users filter independently and pin pages',async()=>{
 const {createQueryDatabase,installQuerySnapshot}=await import('../../cloud/query-test-helper.mjs'),db=createQueryDatabase(),source=fixture();
 await installQuerySnapshot(db.env,source,'a'.repeat(40),now);
 const a=await open(db.env,'one'),b=await open(db.env,'two');
 try{
  assert.equal(a.calls.length,2);assert.equal(b.calls.length,2);
  assert.equal(a.doc.querySelectorAll('#online-results tbody tr').length,50);
  assert.match(a.doc.getElementById('online-page').textContent,/共 400 条/);
  const select=(e,id,value)=>{const element=e.doc.getElementById(id);element.value=value;element.dispatchEvent(new e.w.Event('change',{bubbles:true}))};
  select(a,'online-transport','空运');await a.wait(()=>/共 200 条/.test(a.doc.getElementById('online-page').textContent));
  select(a,'online-provider','a');await a.wait(()=>/共 100 条/.test(a.doc.getElementById('online-page').textContent));
  assert([...a.doc.querySelectorAll('#online-results tbody tr')].every(tr=>tr.cells[0].textContent==='甲物流'));
  assert.match(b.doc.getElementById('online-page').textContent,/共 400 条/);
  a.doc.getElementById('online-next').click();await a.wait(()=>/^2 \/ 2/.test(a.doc.getElementById('online-page').textContent));
  assert(a.calls.some(query=>query.get('page')==='1'&&query.get('version')));
  select(a,'online-warehouse','MAN1');await a.wait(()=>a.doc.getElementById('online-country').value==='英国'&&/共 50 条/.test(a.doc.getElementById('online-page').textContent));
  assert(a.doc.querySelector('#online-region-count').textContent.includes('3 条'));
  a.doc.getElementById('online-reset').click();await a.wait(()=>/共 400 条/.test(a.doc.getElementById('online-page').textContent));
  a.doc.getElementById('online-export').click();await a.wait(()=>a.downloads.length===1);
  assert.equal((await a.downloads[0].text).replace(/^\uFEFF/,'').split('\r\n').length,401);
  const exported=(await a.downloads[0].text).replace(/^\uFEFF/,'').split('\r\n');
  assert.equal(Q.csvKind(exported[0].split(',').map(cell=>cell.slice(1,-1))),'export-v2');
  assert.equal(Array.from({length:a.w.localStorage.length},(_,i)=>a.w.localStorage.key(i)).some(key=>key.includes('quotes')),false);
 }finally{a.close();b.close();db.close()}
});

test('regional controls follow global choices and failed refreshes clear previously visible prices',async()=>{
 const {createQueryDatabase,installQuerySnapshot}=await import('../../cloud/query-test-helper.mjs'),db=createQueryDatabase();
 const source=fixture();source.storage['logistics-quotes-v1'].regionalQuotes.push({...source.storage['logistics-quotes-v1'].regionalQuotes[0],companyId:'b',company:'乙物流',regionRaw:'BHX1'});
 await installQuerySnapshot(db.env,source,'a'.repeat(40),now);let fail=false;
 const e=await open(db.env,'one','compare',{beforeRequest:async()=>{if(fail)throw Error('网络暂时不可用')}});
 try{
  const change=(id,value)=>{const element=e.doc.getElementById(id);element.value=value;element.dispatchEvent(new e.w.Event('change',{bubbles:true}))};
  change('online-region-provider','b');await e.wait(()=>/当前匹配 1 条/.test(e.doc.getElementById('online-region-count').textContent));
  assert.match(e.doc.getElementById('online-page').textContent,/共 400 条/);
  change('online-provider','a');await e.wait(()=>e.doc.getElementById('online-region-provider').disabled);
  assert.equal(e.doc.getElementById('online-region-provider').value,'a');
  assert.match(e.doc.getElementById('online-region-count').textContent,/当前匹配 12 条/);
  fail=true;e.doc.getElementById('online-retry').click();await e.wait(()=>e.doc.getElementById('online-status').classList.contains('error'));
  assert.equal(e.doc.querySelectorAll('#online-results tbody tr').length,0);assert.equal(e.doc.querySelectorAll('#online-region-results tbody tr').length,0);
  assert.equal(e.messages.at(-1).snapshot.loaded,false);
  fail=false;e.doc.getElementById('online-retry').click();await e.wait(()=>e.doc.querySelectorAll('#online-results tbody tr').length===50);
 }finally{e.close();db.close()}
});

test('classic filter placement, searchable warehouse and explicit score apply retain server-only paging',async()=>{
 const {createQueryDatabase,installQuerySnapshot}=await import('../../cloud/query-test-helper.mjs'),db=createQueryDatabase();
 await installQuerySnapshot(db.env,fixture(),'a'.repeat(40),now);const e=await open(db.env);
 try{
  const primary=e.doc.querySelector('.classic-primary');
  assert.deepEqual([...primary.querySelectorAll(':scope > select:not([hidden])')].map(select=>select.name),['provider','country','region','channel']);
  assert(e.doc.getElementById('online-warehouse').hidden);assert(e.doc.getElementById('online-warehouse-trigger'));
  assert(e.doc.getElementById('online-rule').closest('label').hidden);assert(e.doc.getElementById('online-retry').hidden);
  assert.equal(e.doc.querySelector('#online-filters button[type=submit]'),null);
  assert(e.doc.getElementById('online-transport').closest('.score-controls'));assert.equal(e.doc.getElementById('online-transport').form.id,'online-filters');
  e.doc.getElementById('online-warehouse-trigger').click();const search=e.doc.getElementById('online-warehouse-search');search.value='man';search.dispatchEvent(new e.w.Event('input'));
  assert.deepEqual([...e.doc.querySelectorAll('#online-warehouse-choices button')].map(button=>button.textContent),['全部仓库','MAN1']);
  search.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await e.wait(()=>e.doc.getElementById('online-country').value==='英国'&&/共 100 条/.test(e.doc.getElementById('online-page').textContent));
  assert.match(e.doc.getElementById('online-warehouse-trigger').textContent,/MAN1/);
  e.doc.getElementById('online-reset').click();await e.wait(()=>/共 400 条/.test(e.doc.getElementById('online-page').textContent));
  const before=e.calls.length,min=e.doc.getElementById('online-minScore');min.value='6';min.dispatchEvent(new e.w.Event('input'));await new Promise(resolve=>setTimeout(resolve,300));assert.equal(e.calls.length,before,'typing a score does not query until apply');
  e.doc.getElementById('online-apply-score').click();await e.wait(()=>/共 0 条/.test(e.doc.getElementById('online-page').textContent));assert.equal(e.doc.getElementById('online-view').value,'score');
  assert(e.calls.some(query=>query.get('minScore')==='6'&&query.get('view')==='score'));
  min.value='';min.dispatchEvent(new e.w.Event('input'));await e.wait(()=>/共 400 条/.test(e.doc.getElementById('online-page').textContent));
  e.doc.getElementById('online-reset').click();await e.wait(()=>e.doc.getElementById('online-view').value==='grouped'&&e.doc.getElementById('online-status').textContent.startsWith('已确认'));
  assert(e.calls.every(query=>Number(query.get('size')||0)<=50));assert.equal(e.w.localStorage.length,1);
 }finally{e.close();db.close()}
});

test('Excel provider menu includes off-page suppliers and applies multi-selection, sort and export to all pages',async()=>{
 const {createQueryDatabase,installQuerySnapshot}=await import('../../cloud/query-test-helper.mjs'),db=createQueryDatabase(),source=fixture();
 source.storage['logistics-company-directory-v1'].push({id:'c',name:'丙物流',aliases:[],imported:true});
 source.storage['logistics-quotes-v1'].quotes.push(...source.storage['logistics-quotes-v1'].quotes.slice(0,200).map(row=>({...row,companyId:'c',company:'丙物流'})));
 await installQuerySnapshot(db.env,source,'a'.repeat(40),now);
 const {verifyQueryRead}=await import('../../deploy/publish-query-projection.mjs'),{logisticsQuery}=await import('../../cloud/logistics-query-store.mjs');
 const smoke=await verifyQueryRead(async query=>(await logisticsQuery(new Request('https://worker/query?'+query),db.env,{id:'signed-audit'},now)).json());assert.equal(smoke.providerChoices,3);assert.equal(smoke.airProviderChoices,3);assert.equal(smoke.providerSelectionVerified,true);
 const e=await open(db.env),other=await open(db.env,'two');
 try{
  const openMenu=async()=>{e.doc.querySelector('#online-results [data-score-column="0"]').click();await e.wait(()=>e.doc.querySelector('#column-filter-menu .excel-filter-options input'));return e.doc.getElementById('column-filter-menu')};
  const action=(menu,text)=>[...menu.querySelectorAll('button')].find(button=>button.textContent===text);
  const choose=(menu,values)=>{action(menu,'清空').click();for(const input of menu.querySelectorAll('.excel-filter-options input'))if(values.includes(input.parentElement.children[1].textContent)){input.checked=true;input.dispatchEvent(new e.w.Event('change',{bubbles:true}))}};
  assert([...e.doc.querySelectorAll('#online-results tbody tr')].every(row=>row.cells[0].textContent==='甲物流'));
  const initial=e.calls.length;let menu=await openMenu();assert.equal(e.doc.querySelector('dialog.column-filter-dialog'),null);assert.equal(e.calls.at(-1).get('column'),'provider','opening fetches only option metadata');
  assert.deepEqual([...menu.querySelectorAll('.excel-filter-options input')].map(input=>input.parentElement.children[1].textContent).sort(),['丙物流','乙物流','甲物流'].sort());
  choose(menu,['乙物流']);action(menu,'取消').click();assert.equal(e.calls.length,initial+1);assert.match(e.doc.getElementById('online-page').textContent,/共 600 条/);
  menu=await openMenu();choose(menu,['甲物流','丙物流']);action(menu,'确定').click();await e.wait(()=>/共 400 条/.test(e.doc.getElementById('online-page').textContent));
  assert(e.calls.some(query=>JSON.parse(query.get('columns')||'{}').provider?.values.length===2));assert.match(other.doc.getElementById('online-page').textContent,/共 600 条/);
  e.doc.getElementById('online-next').click();await e.wait(()=>/^2 \/ 8/.test(e.doc.getElementById('online-page').textContent));
  assert(e.calls.some(query=>query.get('page')==='1'&&query.get('version')&&JSON.parse(query.get('columns')||'{}').provider?.values.length===2));assert([...e.doc.querySelectorAll('#online-results tbody tr')].every(row=>row.cells[0].textContent!=='乙物流'));
  menu=await openMenu();assert.equal(menu.querySelector('.excel-filter-select input').indeterminate,true);action(menu,'A → Z  升序').click();await e.wait(()=>e.doc.querySelector('#online-results tbody tr')?.cells[0].textContent==='丙物流');
  assert(e.calls.some(query=>query.get('columnSort')==='provider:asc'&&query.get('page')==='0'));
  e.doc.getElementById('online-export').click();await e.wait(()=>e.downloads.length===1);const csv=await e.downloads[0].text;assert.equal(csv.split('\r\n').length,401);assert.doesNotMatch(csv,/乙物流/);
  menu=await openMenu();action(menu,'清除“物流商”的筛选').click();await e.wait(()=>/共 600 条/.test(e.doc.getElementById('online-page').textContent));
  menu=await openMenu();const search=menu.querySelector('input[type=search]');search.value='乙';search.dispatchEvent(new e.w.Event('input'));await e.wait(()=>menu.querySelectorAll('.excel-filter-options label').length===1&&!menu.querySelector('.primary').disabled);assert.equal([...menu.querySelectorAll('.excel-filter-options label')].filter(label=>!label.hidden).length,1);search.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await e.wait(()=>/共 200 条/.test(e.doc.getElementById('online-page').textContent));assert([...e.doc.querySelectorAll('#online-results tbody tr')].every(row=>row.cells[0].textContent==='乙物流'));
  const global=e.doc.getElementById('online-provider');global.value='a';global.dispatchEvent(new e.w.Event('change',{bubbles:true}));await e.wait(()=>/共 0 条/.test(e.doc.getElementById('online-page').textContent));
  menu=await openMenu();assert(menu.textContent.includes('甲物流'));assert(!menu.textContent.includes('乙物流'));action(menu,'清除“物流商”的筛选').click();await e.wait(()=>/共 200 条/.test(e.doc.getElementById('online-page').textContent));assert([...e.doc.querySelectorAll('#online-results tbody tr')].every(row=>row.cells[0].textContent==='甲物流'));
  e.doc.getElementById('online-reset').click();await e.wait(()=>/共 600 条/.test(e.doc.getElementById('online-page').textContent));assert.equal(e.doc.querySelector('#online-results .column-active'),null);
  assert.equal(e.w.localStorage.length,1);assert(e.calls.every(query=>Number(query.get('size')||0)<=100));
 }finally{e.close();other.close();db.close()}
});

test('a server without cross-page provider capability cannot silently show unfiltered quotations',async()=>{
 const {createQueryDatabase,installQuerySnapshot}=await import('../../cloud/query-test-helper.mjs'),db=createQueryDatabase();await installQuerySnapshot(db.env,fixture(),'a'.repeat(40),now);
 const e=await open(db.env,'one','compare',{expectFailure:true,mutateResponse:result=>{delete result.tableColumns}});
 try{assert.match(e.doc.getElementById('online-status').textContent,/完整列筛选服务尚未就绪/);assert.equal(e.doc.querySelectorAll('#online-results tbody tr').length,0);assert.equal(e.messages.at(-1).snapshot.loaded,false);assert.equal(e.calls.length,1);}finally{e.close();db.close()}
});

test('every header uses server facets; combined country and warehouse filters persist across pages and export',async()=>{
 const {createQueryDatabase,installQuerySnapshot}=await import('../../cloud/query-test-helper.mjs'),db=createQueryDatabase();await installQuerySnapshot(db.env,fixture(),'a'.repeat(40),now);const e=await open(db.env);
 try{
  const openColumn=async index=>{e.doc.querySelector('[data-score-column="'+index+'"]').click();await e.wait(()=>e.doc.querySelector('#column-filter-menu .excel-filter-options input'));return e.doc.getElementById('column-filter-menu')};
  const action=(menu,text)=>[...menu.querySelectorAll('button')].find(button=>button.textContent===text);
  for(let i=0;i<12;i++){const menu=await openColumn(i);assert.equal(e.calls.at(-1).get('column'),e.w.TableColumns.definitions[i].id);action(menu,'取消').click();}
  async function select(index,label){const menu=await openColumn(index);action(menu,'清空').click();const input=[...menu.querySelectorAll('.excel-filter-options input')].find(input=>input.parentElement.children[1].textContent===label);assert(input);input.checked=true;input.dispatchEvent(new e.w.Event('change'));action(menu,'确定').click();}
  await select(1,'英国');await e.wait(()=>/共 200 条/.test(e.doc.getElementById('online-page').textContent));
  const warehouseMenu=await openColumn(2);assert.equal(warehouseMenu.querySelectorAll('.excel-filter-options input').length,2);action(warehouseMenu,'取消').click();
  await select(2,'MAN1');await e.wait(()=>/共 100 条/.test(e.doc.getElementById('online-page').textContent));
  e.doc.getElementById('online-next').click();await e.wait(()=>/^2 \/ 2/.test(e.doc.getElementById('online-page').textContent));assert([...e.doc.querySelectorAll('#online-results tbody tr')].every(row=>row.cells[1].textContent==='英国'&&row.cells[2].textContent==='MAN1'));
  const priceMenu=await openColumn(5);action(priceMenu,'从大到小').click();await e.wait(()=>e.doc.querySelector('#online-results tbody tr')?.cells[5].textContent.includes('12.00'));
  assert(e.calls.some(query=>query.get('columnSort')==='price:desc'&&Object.keys(JSON.parse(query.get('columns')||'{}')).length===2));
  e.doc.getElementById('online-export').click();await e.wait(()=>e.downloads.length===1);const csv=await e.downloads[0].text;assert.equal(csv.split('\r\n').length,101);assert.doesNotMatch(csv,/ONT8|LGB8|BHX1/);
  await installQuerySnapshot(db.env,fixture(),'b'.repeat(40),now);e.doc.getElementById('online-next').click();await e.wait(()=>e.messages.at(-1)?.snapshot.sha==='b'.repeat(40));assert.match(e.doc.getElementById('online-page').textContent,/共 400 条/);assert.equal(e.doc.querySelector('#online-results .column-active'),null);
 }finally{e.close();db.close()}
});

test('search-confirm reads all option pages and long selections use a read-only POST without downloading all quote pages',async()=>{
 const {createQueryDatabase,installQuerySnapshot}=await import('../../cloud/query-test-helper.mjs'),db=createQueryDatabase(),source=fixture(),quotes=source.storage['logistics-quotes-v1'].quotes;
 const original=quotes.slice();source.storage['logistics-quotes-v1'].quotes=Array.from({length:1400},(_,i)=>({...original[i%original.length],terms:'唯一条件'+String(i).padStart(4,'0')}));
 await installQuerySnapshot(db.env,source,'a'.repeat(40),now);const e=await open(db.env);
 try{
  e.doc.querySelector('[data-score-column="4"]').click();await e.wait(()=>e.doc.querySelector('#column-filter-menu .excel-filter-options input'));const menu=e.doc.getElementById('column-filter-menu'),search=menu.querySelector('input[type=search]');
  assert.equal(menu.querySelectorAll('.excel-filter-options input').length,200);[...menu.querySelectorAll('button')].find(button=>button.textContent==='加载更多选项').click();await e.wait(()=>menu.querySelectorAll('.excel-filter-options input').length===400);search.value='唯一条件';search.dispatchEvent(new e.w.Event('input'));await e.wait(()=>menu.querySelectorAll('.excel-filter-options input').length===200&&!menu.querySelector('.primary').disabled);
  menu.querySelector('.primary').click();await e.wait(()=>!e.doc.getElementById('column-filter-menu')&&e.calls.some(query=>JSON.parse(query.get('columns')||'{}').terms?.values.length===1400)&&/共 1400 条/.test(e.doc.getElementById('online-page').textContent));
  assert(e.calls.some(query=>query.toString().length>6000));assert(e.calls.filter(query=>query.get('column')==='terms').length>=8);assert(e.calls.filter(query=>query.get('kind')==='quotes-price'&&!query.has('column')).every(query=>query.get('page')==='0'&&query.get('size')==='50'));
  e.doc.getElementById('online-reset').click();await e.wait(()=>/共 1400 条/.test(e.doc.getElementById('online-page').textContent)&&e.doc.querySelector('[data-score-column="4"]'));
  e.doc.querySelector('[data-score-column="4"]').click();await e.wait(()=>e.doc.querySelector('#column-filter-menu .excel-filter-options input'));const next=e.doc.getElementById('column-filter-menu'),q=next.querySelector('input[type=search]');q.value='1399';q.dispatchEvent(new e.w.Event('input'));await e.wait(()=>next.querySelector('.excel-filter-options label')?.textContent.includes('1399')&&!next.querySelector('.primary').disabled);next.querySelector('.primary').click();await e.wait(()=>/共 1 条/.test(e.doc.getElementById('online-page').textContent));assert.match(e.doc.querySelector('#online-results tbody tr').cells[4].textContent,/1399/);
 }finally{e.close();db.close()}
});

test('an export interrupted by a publication produces no mixed-version download',async()=>{
 const {createQueryDatabase,installQuerySnapshot}=await import('../../cloud/query-test-helper.mjs'),db=createQueryDatabase(),source=fixture();
 await installQuerySnapshot(db.env,source,'a'.repeat(40),now);let publish=false;
 const e=await open(db.env,'one','compare',{beforeRequest:async query=>{if(publish&&query.get('size')==='100'&&query.get('page')==='1'){publish=false;await installQuerySnapshot(db.env,source,'b'.repeat(40),now)}}});
 try{
  publish=true;e.doc.getElementById('online-export').click();
  await e.wait(()=>/请重新导出/.test(e.doc.getElementById('online-status').textContent));
  assert.equal(e.downloads.length,0);assert.equal(e.messages.at(-1).snapshot.sha,'b'.repeat(40));
 }finally{e.close();db.close()}
});

test('all header commands and main action buttons keep query state consistent',async()=>{
 const {createQueryDatabase,installQuerySnapshot}=await import('../../cloud/query-test-helper.mjs'),db=createQueryDatabase();await installQuerySnapshot(db.env,fixture(),'a'.repeat(40),now);const e=await open(db.env);
 try{
  const action=(menu,text)=>[...menu.querySelectorAll('button')].find(button=>button.textContent===text);
  async function menu(index){e.doc.querySelector('[data-score-column="'+index+'"]').click();await e.wait(()=>e.doc.querySelector('#column-filter-menu .excel-filter-options input'));return e.doc.getElementById('column-filter-menu');}
  async function settled(actionFn){const count=e.messages.length;actionFn();await e.wait(()=>e.messages.length>count&&e.messages.at(-1).ready);}
  for(let i=0;i<12;i++){
   let m=await menu(i);action(m,'清空').click();assert(m.querySelector('.primary').disabled);m.querySelector('.excel-filter-select input').click();assert(!m.querySelector('.primary').disabled);action(m,'取消').click();assert(!e.doc.getElementById('column-filter-menu'));
   m=await menu(i);const sort=[...m.querySelectorAll('.excel-filter-command')][1];await settled(()=>sort.click());assert(e.doc.querySelector('[data-score-column="'+i+'"]').classList.contains('column-active'));
   m=await menu(i);await settled(()=>action(m,'取消排序').click());assert(!e.doc.querySelector('[data-score-column="'+i+'"]').classList.contains('column-active'));
  }
  let m=await menu(4);assert(action(m,'加载更多选项').hidden);e.doc.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(!e.doc.getElementById('column-filter-menu'));
  m=await menu(1);e.doc.body.dispatchEvent(new e.w.Event('pointerdown',{bubbles:true}));assert(!e.doc.getElementById('column-filter-menu'));
  e.doc.getElementById('online-compare').click();assert.match(e.doc.getElementById('online-status').textContent,/请先选择国家和仓库/);
  const change=async(id,value)=>{const input=e.doc.getElementById(id);await settled(()=>{input.value=value;input.dispatchEvent(new e.w.Event('change',{bubbles:true}));});};
  await change('online-country','英国');await change('online-warehouse','MAN1');await settled(()=>e.doc.getElementById('online-compare').click());assert.equal(e.calls.filter(query=>query.get('kind')==='quotes-price').at(-1).get('confirmed'),'1');
  e.doc.getElementById('online-minScore').value='11';e.doc.getElementById('online-apply-score').click();assert.match(e.doc.getElementById('online-status').textContent,/分数范围需在0至10/);
  e.doc.getElementById('online-minScore').value='0';await settled(()=>e.doc.getElementById('online-apply-score').click());assert.equal(e.doc.getElementById('online-view').value,'score');
  await change('online-view','grouped');await settled(()=>e.doc.getElementById('online-clear-score').click());assert.equal(e.doc.getElementById('online-minScore').value,'');
  const cargo=e.doc.querySelector('#online-cargo input');await settled(()=>cargo.click());await settled(()=>e.doc.getElementById('online-all-cargo').click());assert([...e.doc.querySelectorAll('#online-cargo input')].every(input=>!input.checked));
  for(const radio of e.doc.querySelectorAll('input[name=tax]'))if(!radio.checked)await settled(()=>radio.click());
  await settled(()=>e.doc.getElementById('online-reset').click());assert.match(e.doc.getElementById('online-page').textContent,/共 400 条/);
  await settled(()=>e.doc.getElementById('online-retry').click());await settled(()=>e.doc.getElementById('online-next').click());await settled(()=>e.doc.getElementById('online-prev').click());assert.match(e.doc.getElementById('online-page').textContent,/^1 \/ 8/);
  e.doc.getElementById('online-region-export').click();await e.wait(()=>e.downloads.length===1);assert.equal((await e.downloads[0].text).split('\r\n').length,13);
 }finally{e.close();db.close()}
});

test('regional search, transport, provider, coverage, pagination and export buttons compose with global controls',async()=>{
 const {createQueryDatabase,installQuerySnapshot}=await import('../../cloud/query-test-helper.mjs'),db=createQueryDatabase(),source=fixture();
 const rows=source.storage['logistics-quotes-v1'].regionalQuotes;source.storage['logistics-quotes-v1'].regionalQuotes=Array.from({length:120},(_,i)=>({...rows[i%rows.length],terms:'区域条件'+i,regionRaw:'BHX1 MAN1 ONT8 LGB8 区域'+i}));
 await installQuerySnapshot(db.env,source,'a'.repeat(40),now);const e=await open(db.env);
 try{
  const settled=async action=>{const count=e.messages.length;action();await e.wait(()=>e.messages.length>count&&e.messages.at(-1).ready);};
  assert.match(e.doc.getElementById('online-region-page').textContent,/共 120 条/);await settled(()=>e.doc.getElementById('online-region-next').click());assert.match(e.doc.getElementById('online-region-page').textContent,/^2 \/ 3/);await settled(()=>e.doc.getElementById('online-region-prev').click());assert.match(e.doc.getElementById('online-region-page').textContent,/^1 \/ 3/);
  const change=async(id,value)=>settled(()=>{const element=e.doc.getElementById(id);element.value=value;element.dispatchEvent(new e.w.Event('change',{bubbles:true}));});
  await change('online-region-transport','空运');assert.match(e.doc.getElementById('online-region-page').textContent,/共 60 条/);await change('online-region-provider','a');
  const search=e.doc.getElementById('online-region-search');await settled(()=>{search.value='区域119';search.dispatchEvent(new e.w.Event('input'));});assert.match(e.doc.getElementById('online-region-page').textContent,/共 1 条/);
  e.doc.getElementById('online-region-export').click();await e.wait(()=>e.downloads.length===1);assert.equal((await e.downloads[0].text).split('\r\n').length,2);
  await settled(()=>e.doc.getElementById('online-reset').click());await change('online-warehouse','MAN1');assert(e.doc.getElementById('online-coverage-label').hidden);await change('online-coverage','unverified');assert.equal(e.calls.filter(query=>query.get('kind')?.startsWith('regional')).at(-1).get('coverageMode'),'unverified');assert.match(e.doc.getElementById('online-region-page').textContent,/共 0 条/);
  await change('online-coverage','confirmed');assert.match(e.doc.getElementById('online-region-page').textContent,/共 60 条/);
 }finally{e.close();db.close()}
});

test('monthly page defaults to the business month and exports the complete company summary',async()=>{
 const {createQueryDatabase,installQuerySnapshot}=await import('../../cloud/query-test-helper.mjs'),db=createQueryDatabase(),source=fixture();
 source.storage['logistics-monthly-bills-v1'].rows=[{companyId:'a',company:'甲物流',date:'2026-11-01',amount:20000,paid:5000,currency:'CNY'},{companyId:'b',company:'乙物流',date:'2026-11-02',amount:30000,paid:10000,currency:'CNY'},{companyId:'a',company:'甲物流',date:'2026-10-01',amount:99999,paid:0,currency:'CNY'}];
 await installQuerySnapshot(db.env,source,'a'.repeat(40),now);const e=await open(db.env,'one','bill-display');
 try{
  assert.equal(e.doc.querySelector('[name=month]').value,'2026-11');assert.match(e.doc.getElementById('online-page').textContent,/共 2 条/);
  assert.equal(e.doc.querySelectorAll('#online-summary tbody tr').length,2);
  e.doc.getElementById('online-export-summary').click();await e.wait(()=>e.downloads.length===1);assert.match(await e.downloads[0].text,/200.00/);assert.doesNotMatch(await e.downloads[0].text,/999.99/);
  const month=e.doc.querySelector('[name=month]');month.value='2026-10';month.dispatchEvent(new e.w.Event('change',{bubbles:true}));
  await e.wait(()=>/共 1 条/.test(e.doc.getElementById('online-page').textContent));assert.equal(e.doc.querySelectorAll('#online-summary tbody tr').length,1);
 }finally{e.close();db.close()}
});
test('a publication between pages retries on the new version, and old slow responses cannot replace new filters',async()=>{
 const {createQueryDatabase,installQuerySnapshot}=await import('../../cloud/query-test-helper.mjs'),db=createQueryDatabase(),source=fixture();
 await installQuerySnapshot(db.env,source,'a'.repeat(40),now);
 let delay=false;
 const e=await open(db.env,'one','compare',{beforeRequest:async query=>{if(delay&&query.get('provider')==='a')await new Promise(resolve=>setTimeout(resolve,70))}});
 try{
  const next=structuredClone(source);next.storage['logistics-quotes-v1'].quotes.push({...next.storage['logistics-quotes-v1'].quotes[0],terms:'新确认条件'});
  await installQuerySnapshot(db.env,next,'b'.repeat(40),now);
  e.doc.getElementById('online-next').click();await e.wait(()=>e.messages.at(-1)?.snapshot?.sha==='b'.repeat(40));
  assert.match(e.doc.getElementById('online-page').textContent,/^1 \/.*共 401 条/);
  delay=true;const provider=e.doc.getElementById('online-provider');provider.value='a';provider.dispatchEvent(new e.w.Event('change',{bubbles:true}));provider.value='b';provider.dispatchEvent(new e.w.Event('change',{bubbles:true}));
  await e.wait(()=>e.doc.querySelector('#online-results tbody tr')?.cells[0].textContent==='乙物流');
  await new Promise(resolve=>setTimeout(resolve,100));
  assert([...e.doc.querySelectorAll('#online-results tbody tr')].every(tr=>tr.cells[0].textContent==='乙物流'));
 }finally{e.close();db.close()}
});

import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {JSDOM,VirtualConsole} from './qa/node_modules/jsdom/lib/api.js';
import {IDBFactory,IDBKeyRange} from './qa/node_modules/fake-indexeddb/build/esm/index.js';
const html=fs.readFileSync(new URL('../outputs/产品跟进工作台-独立完整版.html',import.meta.url),'utf8');
const results=[],errors=[];
const factory=new IDBFactory();
function browser(idb=factory){
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  return new JSDOM(html,{url:'file:///C:/qa/workbench.html',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
    w.structuredClone=structuredClone;w.indexedDB=idb;w.IDBKeyRange=IDBKeyRange;
    Object.defineProperty(w.crypto,'randomUUID',{value:randomUUID});
    w.URL.createObjectURL=()=> 'blob:qa-backup';w.URL.revokeObjectURL=()=>{};
    w.HTMLAnchorElement.prototype.click=function(){w.lastDownload=this.download;};
  }});
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn){for(let i=0;i<100;i++){if(await fn())return;await sleep(10);}throw Error('等待页面状态超时');}
async function test(group,name,fn){try{await fn();results.push({group,name,status:'PASS'});}catch(e){results.push({group,name,status:'FAIL',error:e.stack});}}
let dom=browser(),w=dom.window,d=w.document;
await waitFor(()=>d.querySelector('#storage-label').textContent.includes('本机保存'));
const run=code=>w.eval(code),snapshot=()=>run("api('/api/workbench')");
const product={name:'输入测试产品',sku:'INPUT-001',owner:'测试主管',stage:'上架准备',operating:'待上架',health:'正常',purpose:'准备销售',issue:'页面资料待核对',next:'核对页面',due:'2026-10-15'};
const post=(kind,body,productId,extra={})=>run(`api('/api/workbench',${JSON.stringify({kind,body,productId,actor:'测试人',reason:'自动测试',...extra})})`);
async function rejectUnchanged(fn){const before=JSON.stringify(await snapshot());await assert.rejects(fn);assert.equal(JSON.stringify(await snapshot()),before);}
await test('功能','空白空间与持久化模式可正确初始化',async()=>{assert.equal((await snapshot()).products.length,0);assert.equal(d.querySelectorAll('.metric').length,4);});
await test('功能','复杂示例通过真实按钮一次完整写入',async()=>{
  d.querySelector('#actor').value='测试人';d.querySelector('#complex-demo').click();
  await waitFor(async()=> (await snapshot()).products.length===6&&!run('busy'));
  const a=await snapshot();assert.equal(a.records.length,84);assert.equal(a.events.length,90);
  assert.equal(a.records.filter(r=>r.kind==='operation').length,12);assert.equal(a.records.filter(r=>r.kind==='task').length,36);assert.equal(a.records.filter(r=>r.kind==='optimization').length,6);
  assert.equal(a.records.filter(r=>r.kind==='campaign').length,12);assert.equal(a.records.filter(r=>r.kind==='shipment').length,6);assert.equal(a.records.filter(r=>r.kind==='cost').length,12);
  assert.equal(new Set(a.records.filter(r=>r.kind==='operation').map(r=>r.body.owner)).size,5);
});
await test('边界','重复加载复杂示例不产生重复或部分数据',async()=>{const before=JSON.stringify(await snapshot());d.querySelector('#complex-demo').click();await sleep(50);assert.equal(JSON.stringify(await snapshot()),before);assert.match(d.querySelector('#notice').textContent,/已存在/);});
await test('功能','示例覆盖逾期、异常、超预算、零与未填写',async()=>{
  const a=await snapshot();assert(a.records.some(r=>r.body.status==='异常'));assert(a.records.some(r=>r.body.actual>r.body.budget));assert(a.records.some(r=>r.body.actual===0));assert(a.records.some(r=>r.body.actual===''));assert(run('data.records.some(late)'));assert(a.records.some(r=>r.body.status==='已验证'));assert(a.products.some(p=>!a.records.some(r=>r.kind==='operation'&&r.product_id===p.id)));
});
for(const name of ['总览','产品','优化方案','产品负责运营','团队工作台','待办跟进','验证中心','变更记录'])await test('路由/导航',name+'导航呈现正确页面',async()=>{d.querySelector('.sidebar [data-view="'+name+'"]').click();assert.equal(d.querySelector('#crumb').textContent,name);assert(d.querySelector('#content').children.length>0);assert.equal(d.querySelector('.sidebar .nav.active').dataset.view,name);});
await test('路由/导航','产品详情六个页签可往返',async()=>{
  run("view='产品';search='';ownerFilter='全部运营';render()");d.querySelector('.product-row').click();
  for(const tab of ['optimization','operation','task','shipment','cost','campaign','history']){d.querySelector('[data-tab="'+tab+'"]').click();assert.equal(d.querySelector('.detail-tabs .selected').dataset.tab,tab);assert(d.querySelector('.detail-content'));}
  d.querySelector('[data-close]').click();assert.equal(d.querySelector('.drawer'),null);
});
await test('功能','按运营筛选、个人工作台及返回全部',async()=>{
  const select=d.querySelector('#operator-filter');select.value='示例·小林';select.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert(run("data.records.filter(inOperatorScope).every(r=>r.body.owner==='示例·小林'||assignedOwner(r)==='示例·小林')"));
  d.querySelector('[data-view="团队工作台"]').click();d.querySelector('[data-owner="示例·小周"]').click();assert.equal(d.querySelector('#operator-filter').value,'示例·小周');
  select.value='全部运营';select.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(run('scopedProducts().length'),6);
});
await test('输入','真实新建产品表单保存及重渲染',async()=>{
  d.querySelector('[data-new]').click();const form=d.querySelector('#record-form');
  for(const [k,v]of Object.entries(product))form.elements.namedItem(k).value=v;
  form.elements.namedItem('actor').value='测试人';form.elements.namedItem('reason').value='测试新建输入';
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>!d.querySelector('#record-form'));
  assert((await snapshot()).products.some(p=>p.body.sku==='INPUT-001'));
});
const p=(await snapshot()).products.find(p=>p.body.sku==='INPUT-001');
for(const key of ['name','sku','owner','stage','operating','health','purpose','issue','next','due'])await test('输入','产品必填字段 '+key+' 拒绝空值且不落库',()=>rejectUnchanged(()=>post('product',{...product,sku:'MISSING-'+key,[key]:''})));
for(const [name,patch]of [['未知选项',{stage:'不存在'}],['非法日期',{due:'2026-02-30'}],['空白姓名',{owner:'  '}],['过长字段',{issue:'x'.repeat(4001)}]])await test('输入',name+'被拒绝',()=>rejectUnchanged(()=>post('product',{...product,sku:'BAD',...patch})));
for(const [name,value]of [['负金额',-1],['布尔金额',true],['字符串金额','100'],['过大金额',Number.MAX_SAFE_INTEGER+1]])await test('边界/对抗',name+'被拒绝',()=>rejectUnchanged(()=>post('cost',{title:'测试费用',status:'已付',actual:value},p.id)));
await test('边界','NaN与Infinity由校验拒绝',async()=>{for(const expr of ['NaN','Infinity','-Infinity'])assert.throws(()=>run(`validBody('cost',{title:'测试',status:'已付',actual:${expr}})`));});
for(const [kind,field]of [['shipment','quantity'],['campaign','orders']])await test('边界',field+'不能填写小数',()=>rejectUnchanged(()=>post(kind,kind==='shipment'?{title:'测试批次',status:'待发货',quantity:.5}:{title:'测试推广',owner:'测试人',channel:'站内广告',target:'目标',status:'未开始',orders:.5},p.id)));
await test('回归','零金额和空金额保持不同',async()=>{const r=run("validBody('cost',{title:'测试',status:'已付',actual:0})");assert.equal(r.actual,0);assert.equal(r.budget,'');});
await test('输入','SKU大小写、空白与全角重复被拒绝',async()=>{for(const sku of [' input-001 ','ＩＮＰＵＴ－００１'])await rejectUnchanged(()=>post('product',{...product,sku}));});
await test('功能','真实更新表单记录前后值、时间、操作人和原因',async()=>{
  run(`selected=${JSON.stringify(p.id)};renderDrawer()`);d.querySelector('[data-edit-product]').click();const form=d.querySelector('#record-form');form.elements.namedItem('operating').value='测款中';form.elements.namedItem('actor').value='复核人';form.elements.namedItem('reason').value='开始测款';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>!d.querySelector('#record-form'));const a=await snapshot(),e=a.events.find(e=>e.product_id===p.id&&e.reason==='开始测款');assert.equal(e.actor,'复核人');assert.equal(JSON.parse(e.before).operating,'待上架');assert.equal(JSON.parse(e.after).operating,'测款中');assert(Number.isFinite(Date.parse(e.created_at)));
});
await test('对抗','旧版本写入冲突不覆盖资料也不增加历史',()=>rejectUnchanged(()=>post('product',product,undefined,{id:p.id,version:1})));
for(const [name,extra]of [['缺少操作人',{actor:''}],['过长操作人',{actor:'a'.repeat(101)}],['缺少原因',{reason:''}],['过长原因',{reason:'a'.repeat(2001)}]])await test('输入',name+'被拒绝',()=>rejectUnchanged(()=>post('cost',{title:'测试',status:'未付'},p.id,extra)));
for(const kind of ['task','campaign'])await test('功能',kind+'完成必须有结果和证据',()=>rejectUnchanged(()=>post(kind,kind==='task'?{title:'验证',owner:'测试人',due:'2026-10-15',target:'目标',status:'已验证'}:{title:'推广',owner:'测试人',channel:'站内广告',target:'目标',status:'已完成'},p.id)));
await test('功能','签收必须有实际到货日期和凭证',()=>rejectUnchanged(()=>post('shipment',{title:'测试批次',status:'已签收'},p.id)));
for(const url of ['javascript:alert(1)','data:text/html,test','file:///C:/test','https://'])await test('对抗','危险或无效证据 '+url+' 被拒绝',()=>rejectUnchanged(()=>post('cost',{title:'测试',status:'未付',evidence:url},p.id)));
await test('边界','到货与推广结束日期不能倒置',async()=>{await rejectUnchanged(()=>post('shipment',{title:'测试',status:'运输中',shipped:'2026-10-10',arrived:'2026-10-09'},p.id));await rejectUnchanged(()=>post('campaign',{title:'推广',owner:'测试人',channel:'站内广告',target:'目标',status:'进行中',start:'2026-10-10',due:'2026-10-09'},p.id));});
const initial=await snapshot(),assignment=initial.records.find(r=>r.kind==='operation'),other=initial.records.find(r=>r.kind==='operation'&&r.product_id===assignment.product_id&&r.id!==assignment.id);
await test('回归','运营状态更新不会覆盖其他运营或产品整体状态',async()=>{const originalProduct=initial.products.find(p=>p.id===assignment.product_id);await post('operation',{...assignment.body,status:'暂停'},undefined,{id:assignment.id,version:assignment.version});const after=await snapshot();assert.equal(after.records.find(r=>r.id===other.id).body.status,other.body.status);assert.equal(after.products.find(p=>p.id===assignment.product_id).body.operating,originalProduct.body.operating);});
await test('对抗','跨产品运营关联不能保存',()=>rejectUnchanged(()=>post('task',{title:'错误关联',owner:'测试人',due:'2026-10-15',target:'目标',status:'待开始',operationId:assignment.id},p.id)));
await test('功能','分工快捷创建自动填运营和关联分工',async()=>{await run('load()');run("selected=null;view='产品负责运营';ownerFilter='全部运营';render()");d.querySelector('[data-operation-task]').click();assert(d.querySelector('#record-form [name="operationId"]').value);assert(d.querySelector('#record-form [name="owner"]').value);d.querySelector('[data-cancel]').click();});
await test('对抗','重复运营分工被拒绝',()=>rejectUnchanged(()=>post('operation',assignment.body,assignment.product_id)));
await test('边界','连续提交表单只生成一条产品和一条历史',async()=>{
  run("selected=null;renderDrawer()");d.querySelector('[data-new]').click();const form=d.querySelector('#record-form');
  for(const[k,v]of Object.entries({...product,sku:'DOUBLE-1'}))form.elements.namedItem(k).value=v;
  form.elements.namedItem('actor').value='测试人';form.elements.namedItem('reason').value='测试连续提交';
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await waitFor(()=>!d.querySelector('#record-form'));const a=await snapshot(),rows=a.products.filter(p=>p.body.sku==='DOUBLE-1');assert.equal(rows.length,1);assert.equal(a.events.filter(e=>e.product_id===rows[0].id).length,1);
});
await test('功能','备份导出按钮生成下载文件',async()=>{d.querySelector('#export-backup').click();await waitFor(()=>!!w.lastDownload);assert.match(w.lastDownload,/产品跟进备份-.*\.json/);});
await test('回归','完整备份可通过校验并保留关联和历史',async()=>{const a=await snapshot();assert.equal(run(`validateBackup(${JSON.stringify({format:'product-followup-complete-v1',data:a})}).events.length`),a.events.length);});
for(const mutation of ['bad-id','orphan','duplicate-event','bad-version'])await test('对抗','损坏备份 '+mutation+' 不可导入',async()=>{const backup={format:'product-followup-complete-v1',data:structuredClone(await snapshot())};if(mutation==='bad-id')backup.data.products[0].id='\" onclick=\"alert(1)';if(mutation==='orphan')backup.data.records[0].product_id='not-a-product';if(mutation==='duplicate-event')backup.data.events.push(backup.data.events[0]);if(mutation==='bad-version')backup.data.products[0].version=0;assert.throws(()=>run(`validateBackup(${JSON.stringify(backup)})`));});
await test('功能','真实文件导入事件在空空间恢复全部资料并新增导入历史',async()=>{
  const backup={format:'product-followup-complete-v1',data:structuredClone(await snapshot())},restored=browser(new IDBFactory()),rw=restored.window,rd=rw.document;
  await waitFor(()=>rd.querySelector('#storage-label').textContent.includes('本机保存'));rd.querySelector('#actor').value='恢复测试人';
  const input=rd.querySelector('#backup-file');Object.defineProperty(input,'files',{configurable:true,value:[{size:JSON.stringify(backup).length,text:async()=>JSON.stringify(backup)}]});input.dispatchEvent(new rw.Event('change',{bubbles:true}));
  await waitFor(()=>rd.querySelector('#notice').textContent.includes('备份已恢复'));const current=await rw.eval("api('/api/workbench')");
  assert.equal(current.products.length,backup.data.products.length);assert.equal(current.records.length,backup.data.records.length);assert.equal(current.events.length,backup.data.events.length+backup.data.products.length);
  assert(current.events.some(e=>e.actor==='恢复测试人'&&e.action==='导入备份'));restored.window.close();
});
await test('对抗','现有空间拒绝导入覆盖且保留原数据',async()=>{
  const before=JSON.stringify(await snapshot()),backup={format:'product-followup-complete-v1',data:JSON.parse(before)},input=d.querySelector('#backup-file');
  Object.defineProperty(input,'files',{configurable:true,value:[{size:JSON.stringify(backup).length,text:async()=>JSON.stringify(backup)}]});input.dispatchEvent(new w.Event('change',{bubbles:true}));await waitFor(()=>d.querySelector('#notice').textContent.includes('当前已有记录'));assert.equal(JSON.stringify(await snapshot()),before);
});
await test('对抗','超大文件和损坏JSON的文件输入事件被拒绝',async()=>{
  const before=JSON.stringify(await snapshot()),input=d.querySelector('#backup-file');
  for(const file of [{size:21*1024*1024,text:async()=>'{}'},{size:1,text:async()=>'{invalid'}]){d.querySelector('#notice').innerHTML='';Object.defineProperty(input,'files',{configurable:true,value:[file]});input.dispatchEvent(new w.Event('change',{bubbles:true}));await waitFor(()=>!!d.querySelector('#notice .error'));assert.equal(JSON.stringify(await snapshot()),before);}
});
await test('对抗','HTML载荷作为文本显示，不形成脚本或事件节点',async()=>{const payload='<img src=x onerror="window.PWNED=1"><script>window.PWNED=2</script>';await post('product',{...product,name:payload,sku:'XSS-TEST'});await run('load()');run("view='产品';search='';ownerFilter='全部运营';render()");assert.equal(w.PWNED,undefined);assert.equal(d.querySelectorAll('#content img[onerror],#content script').length,0);assert(d.querySelector('#content').textContent.includes(payload));});
await test('功能','IndexedDB串行事务避免并发丢失更新',async()=>{const before=(await snapshot()).events.length;await Promise.all(Array.from({length:10},(_,i)=>post('cost',{title:'并发费用'+i,status:'已付',actual:i},p.id)));const after=await snapshot();assert.equal(after.records.filter(r=>r.body.title.startsWith('并发费用')).length,10);assert.equal(after.events.length,before+10);});
await test('功能','批量导入失败时不留下半份示例',async()=>{const before=JSON.stringify(await snapshot());await assert.rejects(()=>run("transact(current=>applyBatch(current,[{key:'x',kind:'product',body:{name:'不完整'}}],'测试人','失败批次'))"));assert.equal(JSON.stringify(await snapshot()),before);});
await test('回归','刷新/重新打开同一存储后记录仍在',async()=>{const before=await snapshot();const second=browser(factory);await waitFor(()=>second.window.document.querySelector('#storage-label').textContent.includes('本机保存'));const after=await second.window.eval("api('/api/workbench')");assert.equal(JSON.stringify(after),JSON.stringify(before));second.window.close();});
await test('边界','存储被禁止时明确提示仅本次页面',async()=>{const blocked=browser({open(){throw Error('storage denied')}});await waitFor(()=>blocked.window.document.querySelector('#storage-label').textContent.includes('仅本次页面'));assert(blocked.window.document.querySelector('#export-backup'));blocked.window.close();});
await test('边界','空搜索结果有提示且可以恢复',async()=>{run("view='产品';search='不存在的搜索字符串';render()");assert.equal(d.querySelectorAll('.product-row').length,0);assert(d.querySelector('.empty'));run("search='';render()");assert(d.querySelectorAll('.product-row').length>0);});
await test('边界','无产品关联/不支持的接口操作被拒绝',async()=>{await rejectUnchanged(()=>post('cost',{title:'测试',status:'已付'},'missing'));await assert.rejects(()=>run("api('/api/unknown')"));});
await test('功能','异常和进行中状态可在DOM中高亮显示',async()=>{await run('load()');run("view='总览';search='';ownerFilter='全部运营';selected=null;render()");assert(d.querySelector('.product-risk'));run("view='产品负责运营';render()");assert(d.querySelector('.alert-record .record-alert'));assert(d.querySelector('.active-state'));});
await test('功能','开始执行按钮正确更新任务状态',async()=>{
  const task=(await snapshot()).records.find(r=>!r.deleted_at&&r.kind==='task'&&r.body.status==='待开始');run("view='待办跟进';selected=null;render()");d.querySelector('[data-start="'+task.id+'"]').click();const form=d.querySelector('#record-form');assert.equal(form.elements.namedItem('status').value,'进行中');form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>!d.querySelector('#record-form'));assert.equal((await snapshot()).records.find(r=>r.id===task.id).body.status,'进行中');
});
await test('功能','完成按钮要求结果与证据，填入后通过验证',async()=>{
  const task=(await snapshot()).records.find(r=>!r.deleted_at&&r.kind==='task'&&r.body.status==='进行中');run("view='待办跟进';selected=null;render()");d.querySelector('[data-complete="'+task.id+'"]').click();const form=d.querySelector('#record-form');assert.equal(form.elements.namedItem('status').value,'已验证');form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>!!d.querySelector('#form-error .error'));assert(d.querySelector('#record-form'));form.elements.namedItem('result').value='核对完成，结果达到标准';form.elements.namedItem('evidence').value='https://example.com/qa/completed';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>!d.querySelector('#record-form'));assert.equal((await snapshot()).records.find(r=>r.id===task.id).body.status,'已验证');run("view='验证中心';selected=null;render()");assert(d.querySelector('.completed-record'));
});
await test('功能','删除按钮隐藏记录并保留原数据、原因及历史',async()=>{
  const row=(await snapshot()).records.find(r=>!r.deleted_at&&r.kind==='cost');run(`selected=${JSON.stringify(row.product_id)};tab='cost';renderDrawer()`);d.querySelector('[data-delete-record="'+row.id+'"]').click();const form=d.querySelector('#delete-form');form.elements.namedItem('actor').value='删除测试人';form.elements.namedItem('reason').value='重复费用测试';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>!d.querySelector('#delete-form'));const a=await snapshot(),deleted=a.records.find(r=>r.id===row.id);assert(deleted.deleted_at);assert.equal(deleted.deleted_by,'删除测试人');assert.deepEqual(JSON.parse(JSON.stringify(deleted.body)),JSON.parse(JSON.stringify(row.body)));assert.equal(d.querySelector('[data-delete-record="'+row.id+'"]'),null);assert(a.events.some(e=>e.action==='删除成本费用'&&e.reason==='重复费用测试'));
});
await test('对抗','旧版本、空原因和已删除记录的修改被拒绝',async()=>{
  const deleted=(await snapshot()).records.find(r=>r.deleted_at);
  await rejectUnchanged(()=>post(deleted.kind,deleted.body,undefined,{id:deleted.id,version:deleted.version}));
  const active=(await snapshot()).records.find(r=>!r.deleted_at&&r.kind==='cost');
  await rejectUnchanged(()=>post(active.kind,active.body,undefined,{action:'delete',id:active.id,version:active.version-1}));
  await rejectUnchanged(()=>post(active.kind,active.body,undefined,{action:'delete',id:active.id,version:active.version,reason:''}));
});
await test('对抗','关联分工不能直接删除以免留下孤立关联',async()=>{const a=(await snapshot()).records.find(r=>!r.deleted_at&&r.kind==='operation'&&(run('data.records')).some(t=>t.body.operationId===r.id));await rejectUnchanged(()=>post('operation',{},undefined,{action:'delete',id:a.id,version:a.version}));});
await test('功能','删除产品同时归档关联记录并保留可校验备份',async()=>{
  const product=(await snapshot()).products.find(p=>p.body.sku==='TEAM-QA-BOX'),before=(await snapshot()).records.filter(r=>r.product_id===product.id&&!r.deleted_at);
  await post('product',{},undefined,{action:'delete',id:product.id,version:product.version,reason:'产品归档测试'});await run('load()');const a=await snapshot();assert(a.products.find(p=>p.id===product.id).deleted_at);assert(a.records.filter(r=>r.product_id===product.id).every(r=>r.deleted_at));assert.equal(run(`data.products.some(p=>p.id===${JSON.stringify(product.id)})`),false);assert(a.events.filter(e=>e.product_id===product.id&&e.action.startsWith('删除')).length>=before.length+1);run(`validateBackup(${JSON.stringify({format:'product-followup-complete-v1',data:a})})`);
});
await test('功能','完成运营分工不能绕过证据验证',async()=>{const a=(await snapshot()).records.find(r=>!r.deleted_at&&r.kind==='operation');await rejectUnchanged(()=>post('operation',{...a.body,status:'已完成',result:'',evidence:''},undefined,{id:a.id,version:a.version}));});
await test('功能','优化阶段选项用于已确认销售产品',async()=>{d.querySelector('[data-new]').click();const field=d.querySelector('#record-form [name="stage"]');assert(Array.from(field.options).some(o=>o.value==='上架准备'));assert(Array.from(field.options).some(o=>o.value==='推广优化'));assert(!Array.from(field.options).some(o=>o.value==='打样'));assert(d.querySelector('#record-form').textContent.includes('优化阶段'));d.querySelector('[data-cancel]').click();assert.equal(run("optimizationStage('量产')"),'待确认');});
await test('功能','优化方案包含动作、基准、目标和关联跟进进度',async()=>{await run('load()');run("selected=null;ownerFilter='全部运营';view='优化方案';render()");assert(d.querySelector('.optimization-record'));assert(d.querySelector('.optimization-values').textContent.includes('基准'));assert(d.querySelector('[data-opt-followup]'));});
await test('功能','优化方案快捷跟进自动填负责人、目标和方案关联',async()=>{d.querySelector('[data-opt-followup]').click();const form=d.querySelector('#record-form');assert(form.elements.namedItem('optimizationId').value);assert(form.elements.namedItem('owner').value);assert(form.elements.namedItem('target').value);d.querySelector('[data-cancel]').click();});
await test('功能','优化方案完成必须提交实际值、结论与证据',async()=>{const r=(await snapshot()).records.find(r=>!r.deleted_at&&r.kind==='optimization');await rejectUnchanged(()=>post('optimization',{...r.body,status:'已完成',actual:'',result:'',evidence:''},undefined,{id:r.id,version:r.version}));await post('optimization',{...r.body,status:'已完成',actual:'达到方案标准',result:'完成验证，保持方案',evidence:'https://example.com/qa/optimization'},undefined,{id:r.id,version:r.version});assert.equal((await snapshot()).records.find(p=>p.id===r.id).body.status,'已完成');});
await test('对抗','优化跨产品关联和有关联跟进的方案删除被拒绝',async()=>{const r=(await snapshot()).records.find(r=>!r.deleted_at&&r.kind==='optimization');await rejectUnchanged(()=>post('task',{title:'错误优化关联',owner:'测试人',due:'2026-10-15',target:'目标',status:'待开始',optimizationId:r.id},p.id));await rejectUnchanged(()=>post('optimization',{},undefined,{action:'delete',id:r.id,version:r.version}));});
await test('功能','按产品分配运营可省略职责店铺站点',async()=>{const b=run("validBody('operation',{owner:'产品运营',status:'待上架',purpose:'准备销售',issue:'资料核对',next:'检查上架',due:'2026-10-15',target:'可上架'})");assert.equal(b.store,'');assert.equal(b.site,'');assert.equal(b.title,'');const a=await post('operation',b,p.id);assert(a.id);assert(initial.records.some(r=>r.kind==='operation'&&!r.body.store&&!r.body.site));});
await test('功能','头程状态保存显示高亮及旧记录兼容',async()=>{const r=await post('shipment',{title:'头程测试',status:'运输中',firstLegStatus:'异常'},p.id);await run('load()');const html=run('record(data.records.find(r=>r.id==='+JSON.stringify(r.id)+'))');assert(html.includes('头程状态'));assert(html.includes('异常'));assert(html.includes('alert-record'));assert.equal(run("validBody('shipment',{title:'旧批次',status:'待发货'})").firstLegStatus,'');await rejectUnchanged(()=>post('shipment',{title:'错误状态',status:'运输中',firstLegStatus:'任意状态'},p.id));});
await test('功能','总览逐产品显示头程及正在执行动作',async()=>{await run('load()');run("view='总览';search='';filter='全部状态';ownerFilter='全部运营';selected=null;render()");assert(d.querySelector('.market-children'));assert(d.querySelector('#content').textContent.includes('头程'));assert(d.querySelector('#content').textContent.includes('正在做'));const pid=run('data.products[0].id');const expected=run('data.records.filter(r=>r.product_id==='+JSON.stringify(pid)+'&&["task","optimization","campaign"].includes(r.kind)&&r.body.status==="进行中").map(r=>r.body.title)');const markup=run('productProgress('+JSON.stringify(pid)+')');for(const title of expected)assert(markup.includes(title));assert(!markup.includes('undefined'));});
await test('功能','同产品多帐号站点动作与执行时间独立保存',async()=>{const base={title:'页面优化',owner:'运营甲',due:'2026-10-15',target:'核验页面',status:'进行中',account:'帐号A'};const us=await post('task',{...base,site:'美国',executedAt:'2026-10-10T09:00'},p.id),de=await post('task',{...base,site:'德国',executedAt:'2026-10-11T14:30'},p.id);assert.notEqual(us.id,de.id);await run('load()');const markup=run('productProgress('+JSON.stringify(p.id)+')');assert(markup.includes('帐号A / 美国'));assert(markup.includes('帐号A / 德国'));assert(markup.includes('2026-10-10 09:00'));assert(markup.includes('2026-10-11 14:30'));await rejectUnchanged(()=>post('task',{...base,executedAt:'2026-02-30T25:00'},p.id));});
await test('功能','产品父行仅一条且帐号站点子行合并并可收起',async()=>{run("view='总览';selected=null;render()");assert.equal(d.querySelectorAll('.product-family').length,run('scopedProducts().length'));const markup=run('marketChildren('+JSON.stringify(p.id)+')');assert.equal((markup.match(/↳ 帐号A \/ 美国/g)||[]).length,1);assert(markup.includes('帐号A / 德国'));const family=d.querySelector('.product-family');family.open=false;assert.equal(family.open,false);family.open=true;assert.equal(family.open,true);});
await test('回归','所有页面和页签无未捕获脚本异常',async()=>{assert.deepEqual(errors,[]);});
dom.window.close();
const pass=results.filter(r=>r.status==='PASS').length,fail=results.length-pass;
const summary={executedAt:new Date().toISOString(),environment:'Node.js + jsdom DOM + fake-indexeddb; file-origin; no real browser visual QA',pass,fail,total:results.length,results};
fs.writeFileSync(new URL('../outputs/产品工作台测试结果.json',import.meta.url),JSON.stringify(summary,null,2));
console.log(JSON.stringify({pass,fail,total:results.length}));
for(const r of results.filter(r=>r.status==='FAIL'))console.log(r.group,r.name,r.error);
if(fail)process.exitCode=1;

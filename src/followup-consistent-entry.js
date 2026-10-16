// A single scoped entry and visible, data-derived reminders for both overview tabs.
function assignmentOverviewModel(a){
 const product=data.products.find(p=>p.id===a.product_id);
 const records=data.records.filter(r=>!r.deleted_at&&r.product_id===a.product_id&&r.body.operationId===a.id);
 const actions=records.filter(r=>['task','campaign','optimization'].includes(r.kind)&&['进行中','推广中','测款中','优化中','待验证','待复盘'].includes(r.body.status));
 const issues=[a.body.issue,product?.body.issue,...records.filter(r=>r.kind==='optimization'&&!['已完成','暂停'].includes(r.body.status)).map(r=>r.body.problem)].filter(Boolean);
 return {product,records,actions,issues:[...new Set(issues)],next:a.body.next||records.find(r=>r.kind==='campaign'&&r.body.next)?.body.next||''};
}
function overviewReminders(){
 const products=overviewProducts(),reminders=[];
 for(const product of products){for(const a of overviewAssignments(product)){
 const model=assignmentOverviewModel(a),prefix=product.body.sku+' · '+marketIdentity(a);
 if(overviewMode==='operations'){
  if(model.issues.length)reminders.push({id:a.id,text:prefix+'：'+model.issues.join('；'),level:'warning'});
  for(const row of [a,...model.records.filter(r=>['task','campaign','optimization'].includes(r.kind))])if(row.body.due&&row.body.due<today()&&!['已完成','已验证','暂停'].includes(row.body.status))reminders.push({id:a.id,text:prefix+'：'+(row.body.title||'分工跟进')+'已逾期（'+row.body.due+'）',level:'danger'});
 }else{
  for(const row of model.records.filter(r=>r.kind==='shipment')){
   if(row.body.status==='异常'||row.body.firstLegStatus==='异常')reminders.push({id:a.id,text:prefix+' · '+row.body.title+'：物流异常',level:'danger'});
   else if(row.body.due&&row.body.due<today()&&row.body.status!=='已签收')reminders.push({id:a.id,text:prefix+' · '+row.body.title+'：超过预计到货时间 '+row.body.due,level:'danger'});
  }
 }
 }}return reminders;
}
function unifiedOverviewEntry(id){const a=allAssignments().find(a=>a.id===id);if(!a)return;selected=a.product_id;selectedAssignment=a.id;tab=overviewMode==='logistics'?'shipment':'operation';renderDrawer();}
const consistentDoubleOverview=doubleOverview;
doubleOverview=function(){
 let html=consistentDoubleOverview();
 // Both summaries route to exactly the same assignment-scoped record editor.
 html=html.replace(/<button class="text-button" data-market-update="([^"]+)">更新进展 ›<\/button><br><button class="text-button" data-assignment-open="[^"]+">查看动作 ›<\/button>/g,'<button class="text-button" data-overview-entry="$1">录入 / 更新 ›</button>');
 html=html.replace(/<button class="text-button" (?:data-edit|data-overview-shipment)="[^"]+">(?:更新物流|添加物流) ›<\/button><br><button class="text-button" data-market-update="([^"]+)">更新起量<\/button>/g,'<button class="text-button" data-overview-entry="$1">录入 / 更新 ›</button>');
 const reminders=overviewReminders();
 const alerts='<section id="overview-alerts" aria-live="polite" style="padding:14px 18px;background:'+(reminders.length?'#fff4e5':'#eef7f2')+';border:1px solid '+(reminders.length?'#efd09b':'#cfe5d7')+';border-radius:9px;margin:0 0 18px"><strong>'+(reminders.length?'需要关注 · '+reminders.length+' 项':'当前范围暂无已记录的异常或逾期')+'</strong>'+reminders.map(r=>'<div style="margin-top:8px;color:'+(r.level==='danger'?'#b94841':'#94661c')+'">'+esc(r.text)+' <button class="text-button" data-overview-entry="'+esc(r.id)+'">定位处理 ›</button></div>').join('')+'</section>';
 const sync='<div id="overview-sync" role="status" style="padding:10px 16px;border:1px solid #dce5f5;background:white;border-radius:8px;margin-bottom:14px">'+esc(document.getElementById('storage-label')?.textContent||'正在读取共享数据')+' <button class="text-button" id="overview-refresh">刷新共享数据</button></div>';
 return '<style>.dual-tabs{position:sticky;top:76px;z-index:4;background:#f4f6fa}.topbar{position:sticky;top:0;z-index:5}.dual-table{min-width:850px;table-layout:fixed}.dual-table th:first-child{width:26%}.dual-table th:last-child{width:100px}.dual-table td{overflow-wrap:anywhere}.dual-table td:last-child{position:sticky;right:0;background:#fff}.dual-group td:last-child{position:static;background:#f8faff}.sidebar{width:175px;padding:24px 10px}.workspace{padding:24px 20px}.dual-table td,.dual-table th{padding:15px 12px}</style>'+sync+alerts+html;
};
const consistentOpen=open;
open=function(kind,row){consistentOpen(kind,row);const form=document.getElementById('record-form');if(!form)return;
 const assignment=data.records.find(r=>r.id===(kind==='operation'?row?.id:row?.body.operationId||selectedAssignment)&&r.kind==='operation');
 const product=data.products.find(p=>p.id===(row?.product_id||selected));
 const banner=document.createElement('div');banner.className='verification-note';banner.textContent='SKU：'+(product?.body.sku||'新产品')+(assignment?' ｜ '+marketIdentity(assignment):' ｜ 产品资料');form.prepend(banner);
 if(kind==='operation'){
  const grid=form.querySelector('.form-grid');
  for(const key of ['issue','next','due']){const label=form.querySelector('[name="'+key+'"]')?.closest('label');if(label)grid.insertBefore(label,grid.querySelector('details'));}
  const state=form.querySelector('[name="status"]')?.closest('label')?.querySelector('span');if(state)state.textContent='当前分工状态（与动作状态分别记录）';
 }
};
document.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.overviewEntry)unifiedOverviewEntry(b.dataset.overviewEntry);if(b?.id==='overview-refresh')load();});
const consistentStorageLabel=updateStorageLabel;
updateStorageLabel=function(){consistentStorageLabel();const label=document.getElementById('storage-label'),banner=document.getElementById('overview-sync');if(label&&banner)banner.firstChild.textContent=label.textContent+' ';};
// Keep error visibility at the same prominent location, including failed refreshes.
new MutationObserver(()=>{const label=document.getElementById('storage-label'),banner=document.getElementById('overview-sync');if(label&&banner&&banner.firstChild.textContent!==label.textContent+' ')banner.firstChild.textContent=label.textContent+' ';}).observe(document.getElementById('storage-label'),{childList:true,subtree:true,characterData:true});

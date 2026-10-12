for(const kind of ['task','shipment','cost','campaign','optimization'])configs[kind].push(['account','执行帐号 / 店铺（选填）','text'],['site','执行站点（选填）','text'],['executedAt','本次动作执行时间（本地时间）','datetime-local']);
configs.operation.find(f=>f[0]==='status')[3]=[...operating,'已完成'];
function record(r){let markup=r.kind==='optimization'?optimizationCard(r):undecoratedRecord(r);if(r.kind!=='operation')markup=markup.replace('</article>','<p>帐号 / 站点：'+esc(recordMarket(r))+'<br>动作执行时间：'+esc(r.body.executedAt?.replace('T',' ')||'待补充')+'</p></article>');if(r.kind==='shipment')markup=markup.replace('</article>','<p>头程状态：'+badge(r.body.firstLegStatus||'待补充')+'</p></article>');if(r.body.optimizationId){const plan=data.records.find(p=>p.id===r.body.optimizationId);markup=markup.replace('</article>','<p>关联优化方案：'+esc(plan?.body.title||'方案记录')+'</p></article>');}return decorateRecord(r,markup);}
function recordSignals(r){
  const b=r.body,issues=[];
  if(b.status==='异常'||b.firstLegStatus==='异常'||b.health==='风险')issues.push('异常 / 风险');
  if(late(r))issues.push('跟进逾期');
  if(typeof b.actual==='number'&&typeof b.budget==='number'&&b.actual>b.budget)issues.push('超预算');
  return issues;
}
function rowActions(r){
  const completion={task:'已验证',optimization:'已完成',operation:'已完成',campaign:'已完成',shipment:'已签收',cost:'已付'}[r.kind];
  const active=['进行中','推广中','测款中','优化中','运输中','清关中'].includes(r.body.status);
  return '<div class="lifecycle-actions">'+(active?'<span class="active-state"><i></i>正在进行</span>':'')+(['待开始','未开始'].includes(r.body.status)?'<button class="quiet small" data-start="'+esc(r.id)+'">开始执行</button>':'')+(completion&&r.body.status!==completion?'<button class="quiet small" data-complete="'+esc(r.id)+'">'+(r.kind==='task'?'完成并验证':r.kind==='shipment'?'确认签收':r.kind==='cost'?'标记已付':'完成')+'</button>':'')+'<button class="text-button danger" data-delete-record="'+esc(r.id)+'">删除</button></div>';
}
function decorateRecord(r,markup){
  const signals=recordSignals(r),completed=['已完成','已验证','已签收','已付'].includes(r.body.status);
  return markup.replace('<article class="record','<article class="record '+(signals.length?'alert-record':completed?'completed-record':'')).replace('</article>',(signals.length?'<div class="record-alert">⚠ '+signals.map(esc).join(' · ')+'</div>':'')+rowActions(r)+'</article>');
}
function openDelete(row,kind){
  modal={kind:'delete',row,type:kind};
  const related=kind==='product'?data.records.filter(r=>r.product_id===row.id).length:0;
  $('#modal-root').innerHTML='<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="form-title"><div class="modal-heading"><h2 id="form-title">删除'+esc(kindName[kind])+'</h2><button class="icon-button" data-cancel aria-label="关闭">✕</button></div><p>将从当前工作列表移除“'+esc(row.body.name||row.body.title)+'”。'+(kind==='product'?'同时移除 '+related+' 条关联记录。':'')+'删除原因和原记录会保留在历史与备份中。</p><form id="delete-form"><div class="form-grid"><label><span>操作人</span><input name="actor" required maxlength="100" value="'+esc($('#actor').value)+'"></label><label class="wide"><span>删除原因</span><textarea name="reason" required maxlength="2000" rows="3"></textarea></label></div><div id="delete-error"></div><div class="form-footer"><button type="button" class="quiet" data-cancel>取消</button><button class="primary delete-button" id="delete-save">删除并保留历史</button></div></form></section></div>';
  $('#delete-form').onsubmit=async e=>{
    e.preventDefault();if(busy)return;busy=true;const f=new FormData(e.target);$('#delete-save').disabled=true;
    try{await api('/api/workbench',{action:'delete',kind,id:row.id,version:row.version,actor:f.get('actor'),reason:f.get('reason')});if(kind==='product')selected=null;modal=null;$('#modal-root').innerHTML='';await load();toast('已删除，原记录与原因保留在历史中');}
    catch(err){$('#delete-error').innerHTML='<div class="error">'+esc(err.message)+'</div>';$('#delete-save').disabled=false;}finally{busy=false;}
  };
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');
  if(b?.dataset.start){const r=data.records.find(r=>r.id===b.dataset.start);if(!r)return;selected=r.product_id;open(r.kind,r);$('#record-form [name="status"]').value='进行中';$('#record-form [name="reason"]').value='开始执行事项';}
  if(b?.dataset.complete){const r=data.records.find(r=>r.id===b.dataset.complete);if(!r)return;selected=r.product_id;open(r.kind,r);$('#record-form [name="status"]').value={task:'已验证',optimization:'已完成',operation:'已完成',campaign:'已完成',shipment:'已签收',cost:'已付'}[r.kind];$('#record-form [name="reason"]').value='完成事项并提交结果';}
  if(b?.dataset.deleteRecord){const r=data.records.find(r=>r.id===b.dataset.deleteRecord);if(r)openDelete(r,r.kind);}
  if(b?.hasAttribute('data-delete-product')){const p=data.products.find(p=>p.id===selected);if(p)openDelete(p,'product');}
});

// Logistics is a progress tracker: batch, quantity, location and current status.
configs.shipment = configs.shipment.filter(field=>field[0]!=='evidence');
configs.shipment.find(field=>field[0]==='title')[1]='第几批 / 批次';
configs.shipment.push(['location','货物当前位置','text']);
const logisticsOriginalOpen=open;
open=function(kind,row) {
  logisticsOriginalOpen(kind,row);
  if(kind!=='shipment')return;
  const form=document.getElementById('record-form');
  const grid=form.querySelector('.form-grid');
  let details=grid.querySelector('details');
  if(!details){details=document.createElement('details');details.className='wide';details.innerHTML='<summary>更多信息（选填）</summary><div class="form-grid"></div>';grid.append(details);}
  for(const key of ['method','tracking','planned','shipped','due','arrived','firstLegStatus','executedAt','account','site']) {
    const label=form.querySelector('[name="'+key+'"]')?.closest('label');
    if(label)details.querySelector('div').append(label);
  }
  for(const key of ['title','quantity'])form.querySelector('[name="'+key+'"]').required=true;
  form.querySelector('.form-note').textContent='填写批次、数量、当前位置和物流状态即可；保存自动记录操作人及变更历史。';
};
const logisticsOriginalRecord=record;
record=function(row) {
  if(row.kind!=='shipment')return logisticsOriginalRecord(row);
  const b=row.body;
  return decorateRecord(row,'<article class="record"><div class="record-head"><div><span class="eyebrow">'+esc(assignmentLabel(b.operationId))+'</span><h3>'+esc(b.title)+'</h3></div>'+badge(b.status)+'<button class="text-button" data-edit="'+esc(row.id)+'">更新物流</button></div><p>数量：'+esc(b.quantity??'待填写')+' 件 · 当前位置：'+esc(b.location||b.firstLegStatus||'待更新')+'</p><div class="record-meta"><span>'+esc(b.owner||'')+'</span>'+(b.due?'<span>预计到货：'+esc(b.due)+'</span>':'')+'</div><button class="text-button" data-product="'+esc(row.product_id)+'">打开产品详情 ›</button></article>');
};

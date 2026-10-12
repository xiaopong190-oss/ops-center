// Cost and promotion capture progress, rather than enforce proof or performance review.
for(const kind of ['cost','campaign'])configs[kind]=configs[kind].filter(field=>field[0]!=='evidence');
configs.cost.find(field=>field[0]==='actual')[1]='成本金额（人民币元）';
configs.campaign.find(field=>field[0]==='title')[1]='推广事项';
configs.campaign.find(field=>field[0]==='actual')[1]='已花费（人民币元，选填）';
configs.campaign.find(field=>field[0]==='result')[1]='当前进展（选填）';
configs.campaign.push(['next','下一步（选填）','text']);
const progressOriginalOpen=open;
open=function(kind,row){
  progressOriginalOpen(kind,row);
  if(!['cost','campaign'].includes(kind))return;
  const form=document.getElementById('record-form'),grid=form.querySelector('.form-grid');
  let details=grid.querySelector('details');
  if(!details){details=document.createElement('details');details.className='wide';details.innerHTML='<summary>更多信息（选填）</summary><div class="form-grid"></div>';grid.append(details);}
  const optional=kind==='cost'?['category','batch','date','budget']:['plan','start','due','target','budget','sales','orders'];
  for(const key of optional){const label=form.querySelector('[name="'+key+'"]')?.closest('label');if(label)details.querySelector('div').append(label);}
  form.querySelector('[name="title"]').required=true;
  if(kind==='cost')form.querySelector('[name="actual"]').required=true;
  form.querySelector('.form-note').textContent=kind==='cost'?'记录费用事项、金额和付款进度；不需要上传凭证。推广花费在运营推广填写，避免重复。':'记录推广事项、状态、花费和下一步；完成不要求提供报告或验证证据。';
};
const progressOriginalRecord=record;
record=function(row){
  if(!['cost','campaign'].includes(row.kind))return progressOriginalRecord(row);
  const b=row.body;
  const content=row.kind==='cost'?'<p>成本金额：<strong>'+money(b.actual||0)+'</strong>'+(b.batch?' · 批次：'+esc(b.batch):'')+'</p>':'<p>推广方式：'+esc(b.channel||'待填写')+' · 已花费：'+(typeof b.actual==='number'?money(b.actual):'待填写')+'</p>'+(b.result?'<p>当前进展：'+esc(b.result)+'</p>':'')+(b.next?'<p>下一步：'+esc(b.next)+'</p>':'');
  return decorateRecord(row,'<article class="record"><div class="record-head"><div><span class="eyebrow">'+esc(assignmentLabel(b.operationId))+'</span><h3>'+esc(b.title)+'</h3></div>'+badge(b.status)+'<button class="text-button" data-edit="'+esc(row.id)+'">更新'+(row.kind==='cost'?'成本':'推广')+'</button></div>'+content+'<button class="text-button" data-product="'+esc(row.product_id)+'">打开产品详情 ›</button></article>');
};

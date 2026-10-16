// Product-level supply planning reuses assignment-bound logistics and launch plans.
productFields.push(['stock','当前可用库存（件）','number'],['leadDays','补货 / 生产交期（天）','number'],['nextBatchQty','下一批备货数量（件）','number'],['nextBatchNote','下一批安排（选填）','text']);
configs.operation.push(['launchWindow','计划起量时间（日期或第几周）','text']);
function supplyShipments(pid,operationId){return data.records.filter(row=>!row.deleted_at&&row.product_id===pid&&row.kind==='shipment'&&(operationId===undefined||row.body.operationId===operationId));}
function supplyShipmentSummary(rows){
 if(!rows.length)return '暂无物流记录';
 return rows.map(row=>esc(row.body.title)+'：'+esc(row.body.quantity===''||row.body.quantity==null?'数量待填':row.body.quantity+'件')+' · '+esc(row.body.status||'状态待填')+' · '+esc(row.body.location||row.body.firstLegStatus||'位置待更新')+(row.body.due?' · 预计到货 '+esc(row.body.due):'')).join('<br>');
}
function supplyOverview(){
 const products=scopedProducts().filter(p=>(filter==='全部状态'||p.body.operating===filter)&&[p.body.name,p.body.sku,p.body.owner,...allAssignments().filter(r=>r.product_id===p.id).map(r=>marketIdentity(r)+' '+r.body.owner)].join(' ').toLowerCase().includes(search.toLowerCase()));
 const value=(v,unit)=>v===''||v==null?'待填写':esc(v)+unit;
 return '<section id="supply-overview" class="panel" style="margin-bottom:24px"><div class="section-title"><h2>新品备货与起量总览</h2><span class="muted">库存 → 交期 → 发货 / 到货 → 下一批 → 起量</span></div><p class="muted">库存为手工维护的可用库存，不自动扣减；交期为补货 / 生产天数。到货和起量分别记录。</p><div style="overflow-x:auto"><table style="width:100%;min-width:900px;text-align:left;border-spacing:12px"><thead><tr>'+['产品 / SKU','可用库存','补货交期','帐号 / 站点物流进度','下一批备货','计划起量'].map(label=>'<th>'+label+'</th>').join('')+'</tr></thead><tbody>'+products.map(product=>{
 const b=product.body,assignments=allAssignments().filter(row=>row.product_id===product.id&&inOperatorScope(row));
 const shipping=assignments.map(a=>'<div style="margin-bottom:12px"><strong>'+esc(marketIdentity(a))+'</strong><br>'+supplyShipmentSummary(supplyShipments(product.id,a.id))+'<br><button class="text-button" data-assignment-open="'+esc(a.id)+'">更新物流 / 推广 ›</button></div>').join('');
 const unlinked=supplyShipments(product.id).filter(row=>!allAssignments().some(a=>a.id===row.body.operationId)&&inOperatorScope(row));
 return '<tr><td style="vertical-align:top"><strong>'+esc(b.name)+'</strong><br>'+esc(b.sku)+'<br><button class="text-button" data-supply-product="'+esc(product.id)+'">更新库存 / 备货</button></td><td style="vertical-align:top">'+value(b.stock,'件')+'</td><td style="vertical-align:top">'+value(b.leadDays,'天')+'</td><td>'+shipping+(unlinked.length?'<div>待关联物流<br>'+supplyShipmentSummary(unlinked)+'</div>':'')+(!shipping&&!unlinked.length?'暂无物流，先添加帐号 / 站点分工':'')+'</td><td style="vertical-align:top">'+value(b.nextBatchQty,'件')+(b.nextBatchNote?'<br>'+esc(b.nextBatchNote):'')+'</td><td style="vertical-align:top">'+assignments.map(a=>'<div style="margin-bottom:12px">'+esc(marketIdentity(a))+'<br><strong>'+esc(a.body.launchWindow||'待安排')+'</strong><br><button class="text-button" data-market-update="'+esc(a.id)+'">更新起量计划</button></div>').join('')+'</td></tr>';
 }).join('')+'</tbody></table></div>'+(!products.length?'<p class="muted">当前范围暂无产品。</p>':'')+'</section>';
}
const supplyOriginalRender=render;
render=function(){supplyOriginalRender();if(view==='总览')document.getElementById('content').insertAdjacentHTML('afterbegin',supplyOverview());};
document.addEventListener('click',e=>{const button=e.target.closest('[data-supply-product]');if(!button)return;const row=data.products.find(p=>p.id===button.dataset.supplyProduct);if(row){selected=row.id;open('product',row);}});

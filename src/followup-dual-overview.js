// Approved SKU-first operations/logistics overview. Reads existing shared records only.
let overviewMode='operations';
const overviewStyle='<style>.dual-tabs{display:flex;gap:8px;border-bottom:1px solid #e3e9f2;margin-bottom:20px}.dual-tabs button{background:none;color:#8794a8;padding:14px 24px;font-weight:700;border-bottom:3px solid transparent}.dual-tabs .selected{color:#3159d8;border-color:#3159d8}.dual-table{width:100%;min-width:1050px;border-collapse:collapse;text-align:left}.dual-table th{background:#f8fafc;color:#8290a5;font-size:12px;font-weight:500;padding:14px 18px}.dual-table td{padding:20px 18px;border-top:1px solid #edf1f6;vertical-align:top;font-size:13px}.dual-table small{display:block;color:#8b99ad;margin-top:6px}.dual-group td{background:#f8faff;padding:14px 18px}.dual-group strong{font-size:15px;margin-right:12px}.dual-group span{margin-right:16px}.dual-panel{overflow:auto;background:white;border:1px solid #e3e9f2;border-radius:10px}.dual-action{color:#3159d8;margin-bottom:5px}.dual-issue{color:#b07b24}.dual-hidden{display:none}</style>';
function overviewProducts(){return scopedProducts().filter(p=>(filter==='全部状态'||p.body.operating===filter)&&[p.body.sku,p.body.name,p.body.owner,...allAssignments().filter(a=>a.product_id===p.id).map(a=>marketIdentity(a)+' '+a.body.owner)].join(' ').toLowerCase().includes(search.toLowerCase()));}
function overviewAssignments(p){return allAssignments().filter(a=>a.product_id===p.id&&inOperatorScope(a));}
function overviewValue(v,unit=''){return v===''||v==null?'待填写':esc(v)+unit;}
function overviewOperations(products){return products.map(p=>{
 const assignments=overviewAssignments(p);
 const group='<tr class="dual-group" data-sku="'+esc(p.body.sku)+'"><td colspan="6"><strong>'+esc(p.body.sku)+'</strong><span class="muted">'+esc(p.body.name)+'</span><button class="text-button" style="float:right" data-supply-product="'+esc(p.id)+'">更新产品</button></td></tr>';
 return group+(assignments.length?assignments.map(a=>{
 const model=assignmentOverviewModel(a),related=model.records;
 const active=model.actions;
 const next=model.next;
 return '<tr><td><strong data-site-assignment="'+esc(a.id)+'">'+esc(marketIdentity(a))+'</strong></td><td>'+badge(a.body.status||p.body.operating)+'</td><td class="dual-issue">'+esc(model.issues.join('；')||'暂无已记录的问题')+'</td><td>'+ (active.length?active.map(r=>'<div class="dual-action">'+esc(r.body.title)+' · '+esc(r.body.status)+'</div>').join(''):'<span class="muted">尚未安排进行中的动作</span>')+'<small>下一步：'+esc(next||'待安排')+'</small></td><td>'+esc(a.body.owner)+'<small>'+esc(a.body.due||'跟进时间待安排')+'</small></td><td><button class="text-button" data-market-update="'+esc(a.id)+'">更新进展 ›</button><br><button class="text-button" data-assignment-open="'+esc(a.id)+'">查看动作 ›</button></td></tr>';
 }).join(''):'<tr><td colspan="6" class="muted">尚未建立帐号 / 站点分工 <button class="text-button" data-market-add="'+esc(p.id)+'">＋ 添加分工</button></td></tr>');
 }).join('');}
function overviewLogistics(products){return products.map(p=>{
 const b=p.body,assignments=overviewAssignments(p);
 let rows=assignments.map(a=>{
 const ships=supplyShipments(p.id,a.id);
 return (ships.length?ships:[null]).map(s=>'<tr><td><strong data-site-assignment="'+esc(a.id)+'">'+esc(marketIdentity(a))+'</strong><small>'+esc(a.body.owner)+'</small></td><td>'+(s?esc(s.body.title)+'<br><strong>'+overviewValue(s.body.quantity,'件')+'</strong>':'<span class="muted">尚未发货</span>')+'</td><td>'+(s?badge(s.body.status)+'<small>'+esc(s.body.location||s.body.firstLegStatus||'位置待更新')+'</small>':'待安排')+'</td><td>'+(s?esc((s.body.status==='已签收'?s.body.arrived:s.body.due)||'待填写'):'待安排')+'</td><td>'+esc(a.body.launchWindow||'待安排')+'</td><td><button class="text-button" '+(s?'data-edit="'+esc(s.id)+'"':'data-overview-shipment="'+esc(a.id)+'"')+'>'+(s?'更新物流':'添加物流')+' ›</button><br><button class="text-button" data-market-update="'+esc(a.id)+'">更新起量</button></td></tr>').join('');
 }).join('');
 const unlinked=supplyShipments(p.id).filter(s=>!allAssignments().some(a=>a.id===s.body.operationId)&&inOperatorScope(s));
 rows+=unlinked.map(s=>'<tr><td class="dual-issue">待关联帐号 / 站点</td><td>'+esc(s.body.title)+'<br>'+overviewValue(s.body.quantity,'件')+'</td><td>'+esc(s.body.location||s.body.firstLegStatus||s.body.status)+'</td><td>'+esc(s.body.due||'待填写')+'</td><td>待关联</td><td><button class="text-button" data-edit="'+esc(s.id)+'">关联 / 更新</button></td></tr>').join('');
 return '<tr class="dual-group" data-sku="'+esc(b.sku)+'"><td colspan="6"><strong>'+esc(b.sku)+'</strong><span class="muted">'+esc(b.name)+'</span><span>库存 '+overviewValue(b.stock,'件')+'</span><span>交期 '+overviewValue(b.leadDays,'天')+'</span><span>下一批 '+overviewValue(b.nextBatchQty,'件')+(b.nextBatchNote?' · '+esc(b.nextBatchNote):'')+'</span><button class="text-button" style="float:right" data-supply-product="'+esc(p.id)+'">更新备货 ›</button></td></tr>'+ (rows||'<tr><td colspan="6">暂无分工或物流记录 <button class="text-button" data-market-add="'+esc(p.id)+'">＋ 添加帐号 / 站点</button></td></tr>');
 }).join('');}
function doubleOverview(){
 const products=overviewProducts(),assignments=products.flatMap(overviewAssignments),ids=new Set(assignments.map(a=>a.id));
 const related=data.records.filter(r=>ids.has(r.body.operationId)&&!r.deleted_at),ships=related.filter(r=>r.kind==='shipment');
 const active=related.filter(r=>['task','campaign','optimization'].includes(r.kind)&&['进行中','推广中','测款中','优化中','待验证','待复盘'].includes(r.body.status));
 const stats=overviewMode==='operations'?[['正在跟进',products.length+' 个 SKU'],['有问题待处理',assignments.filter(a=>assignmentOverviewModel(a).issues.length).length+' 项分工'],['动作进行中',active.length+' 项']]:[['运输途中',ships.filter(s=>['运输中','清关中'].includes(s.body.status)).length+' 批'],['已签收',ships.filter(s=>s.body.status==='已签收').length+' 批'],['下一批待安排',products.filter(p=>p.body.nextBatchQty===''||p.body.nextBatchQty==null).length+' 个 SKU']];
 const table=(headers,rows)=>'<div class="dual-panel"><table class="dual-table"><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table>'+(!products.length?empty('当前范围暂无产品。'):'')+'</div>';
 return overviewStyle+'<div class="dual-tabs"><button data-overview-mode="operations" class="'+(overviewMode==='operations'?'selected':'')+'">运营总览</button><button data-overview-mode="logistics" class="'+(overviewMode==='logistics'?'selected':'')+'">物流总览</button></div><div class="metrics" style="grid-template-columns:repeat(3,1fr)">'+stats.map(([label,value])=>'<div class="metric"><span>'+label+'</span><strong>'+value+'</strong></div>').join('')+'</div><div class="toolbar"><div class="search"><input id="search" aria-label="搜索SKU产品帐号" placeholder="搜索 SKU / 产品 / 帐号" value="'+esc(search)+'"></div><select id="filter">'+['全部状态',...operating].map(s=>'<option '+(s===filter?'selected':'')+'>'+esc(s)+'</option>').join('')+'</select><span class="muted">按 SKU 跟踪，帐号 / 站点分别展开</span></div><section id="operations-overview" class="'+(overviewMode==='operations'?'':'dual-hidden')+'">'+table(['帐号 / 店铺 / 站点','分工现状','当前问题点','运营动作 → 下一步','负责人 / 跟进时间',''],overviewOperations(products))+'</section><section id="supply-overview" class="'+(overviewMode==='logistics'?'':'dual-hidden')+'">'+table(['帐号 / 店铺 / 站点','批次 / 数量','货物位置 / 状态','到货时间','计划起量',''],overviewLogistics(products))+'<p class="muted" style="padding:12px">库存手工维护，不自动扣减；到货与起量分别跟进。</p></section>';
}
render=function(){supplyOriginalRender();if(view==='总览'){document.getElementById('content').innerHTML=doubleOverview();document.getElementById('subtitle').textContent='以 SKU 为主线，分别看运营问题与动作、物流批次与进度。';}};
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.overviewMode){overviewMode=b.dataset.overviewMode;render();}
 if(b.dataset.overviewShipment){const a=allAssignments().find(a=>a.id===b.dataset.overviewShipment);if(a){selected=a.product_id;selectedAssignment=a.id;open('shipment');}}
});



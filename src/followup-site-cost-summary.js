// Site totals are derived from saved records by stable assignment ID, never copied by site label.
function assignmentCostSummary(id){
 const rows=data.records.filter(r=>!r.deleted_at&&r.body.operationId===id);
 const costs=rows.filter(r=>r.kind==='cost'),promotions=rows.filter(r=>r.kind==='campaign');
 const sumRows=rs=>rs.reduce((total,r)=>total+(typeof r.body.actual==='number'?Math.round(r.body.actual*100):0),0)/100;
 return {head:sumRows(costs.filter(r=>r.body.costMode==='按单价计算'||typeof r.body.unitPrice==='number')),cost:sumRows(costs),promotion:sumRows(promotions),count:costs.length,unpriced:costs.filter(r=>typeof r.body.actual!=='number').length};
}
function siteCostMarkup(a){const summary=assignmentCostSummary(a.id);return '<div class="site-cost-summary" data-cost-assignment="'+esc(a.id)+'" style="margin-top:10px;padding:8px;background:#edf3ff;border-radius:6px;color:#365b9a">头程 '+money(summary.head)+' · 其它成本 '+money(summary.cost-summary.head)+' · 推广 '+money(summary.promotion)+(summary.unpriced?' · '+summary.unpriced+'条金额待填':'')+'<br><button class="text-button" data-site-cost="'+esc(a.id)+'">查看 / 更新本站成本 ›</button></div>';}
for(const key of ['overviewOperations','overviewLogistics']){
 const original=key==='overviewOperations'?overviewOperations:overviewLogistics;
 const wrapper=products=>{let html=original(products);for(const p of products)for(const a of overviewAssignments(p)){
  const marker='<strong>'+esc(marketIdentity(a))+'</strong>';
  html=html.split(marker).join(marker+siteCostMarkup(a));
 }return html;};
 if(key==='overviewOperations')overviewOperations=wrapper;else overviewLogistics=wrapper;
}
document.addEventListener('click',event=>{const b=event.target.closest('[data-site-cost]');if(!b)return;const a=allAssignments().find(a=>a.id===b.dataset.siteCost);if(a){selected=a.product_id;selectedAssignment=a.id;tab='cost';renderDrawer();}});


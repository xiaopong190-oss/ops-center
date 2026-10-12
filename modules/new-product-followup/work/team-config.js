configs.shipment.push(['firstLegStatus','头程状态','select',['待备货','待提货','已提货','待报关','已报关','已离港','运输中','已到港','清关中','清关完成','派送中','已入仓','异常']]);
configs.operation=[['title','具体职责（选填）','text'],['owner','负责运营（必填）','text'],['store','帐号 / 店铺（选填）','text'],['site','站点 / 市场（选填）','text'],['status','当前运营状态','select',operating],['purpose','本阶段运营目的','text'],['issue','当前问题 / 状态依据','text'],['next','下一步行动','text'],['due','下次跟进日','date'],['target','验证标准 / 目标','text'],['result','最新结果','text'],['evidence','证据链接','url']];
kindName.operation='运营分工';
for(const kind of ['task','shipment','cost','campaign'])configs[kind].push(['operationId','关联运营分工（可选）','scope']);
productFields.find(f=>f[0]==='owner')[1]='产品总负责人';
productFields.find(f=>f[0]==='operating')[1]='产品整体运营状态';
let ownerFilter='全部运营';
function allAssignments(){return data.records.filter(r=>r.kind==='operation');}
function operatorNames(){return [...new Set([...data.products.map(p=>p.body.owner),...data.records.map(r=>r.body.owner)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));}
function assignedOwner(r){return allAssignments().find(a=>a.id===r.body.operationId)?.body.owner;}
function inOperatorScope(r){return ownerFilter==='全部运营'||r.body.owner===ownerFilter||assignedOwner(r)===ownerFilter;}
function scopedProducts(){return data.products.filter(p=>ownerFilter==='全部运营'||p.body.owner===ownerFilter||data.records.some(r=>r.product_id===p.id&&inOperatorScope(r)));}
function assignmentLabel(id){const r=allAssignments().find(a=>a.id===id);return r?r.body.owner+' · '+([r.body.store,r.body.site].filter(Boolean).join(' / ')||'负责整个产品'):'产品通用';}
function eventInScope(e){const before=e.before?JSON.parse(e.before):{},after=JSON.parse(e.after);return [before,after].some(b=>b.owner===ownerFilter||allAssignments().some(a=>a.id===b.operationId&&a.body.owner===ownerFilter));}
function scopeOptions(pid,id){return '<option value="">产品通用 / 未关联分工</option>'+allAssignments().filter(r=>r.product_id===pid).map(r=>'<option value="'+esc(r.id)+'" '+(r.id===id?'selected':'')+'>'+esc(assignmentLabel(r.id))+'</option>').join('');}
function record(r){
  if(r.kind!=='operation')return baseRecord(r).replace('<div class="record-meta">','<div class="record-meta"><span>'+esc(assignmentLabel(r.body.operationId))+'</span>').replace('</article>','<button class="text-button" data-product="'+esc(r.product_id)+'">打开产品详情 ›</button></article>');
  const b=r.body,related=data.records.filter(x=>x.body.operationId===r.id),pending=related.filter(x=>x.kind==='task'&&x.body.status!=='已验证');
  return '<article class="record operation-record"><div class="record-head"><div><span class="eyebrow">'+esc(productName(r.product_id))+'</span><h3>'+esc(b.owner)+' · '+esc(b.title||'产品运营')+'</h3></div>'+badge(b.status)+'<button class="text-button" data-edit="'+esc(r.id)+'">更新状态</button></div><div class="record-meta"><span>'+esc([b.store,b.site].filter(Boolean).join(' / ')||'负责整个产品 · 不限定店铺')+'</span><span class="'+(late(r)?'risk':'')+'">跟进 '+esc(b.due)+(late(r)?' · 逾期':'')+'</span><span>'+pending.length+' 项待办</span></div><p>运营目的：'+esc(b.purpose)+'</p><p>状态依据：'+esc(b.issue)+'</p><p>下一步：'+esc(b.next)+'</p><p>验证标准：'+esc(b.target)+'</p>'+(b.result?'<p>最新结果：'+esc(b.result)+'</p>':'')+(b.evidence?'<a class="evidence" target="_blank" rel="noreferrer" href="'+esc(b.evidence)+'">查看证据 ↗</a>':'')+'<div class="record-actions"><button class="text-button" data-product="'+esc(r.product_id)+'">打开产品详情 ›</button><button class="text-button" data-operation-task="'+esc(r.id)+'">＋ 分配跟进事项</button><button class="text-button" data-operation-campaign="'+esc(r.id)+'">＋ 创建推广计划</button></div></article>';
}
function recordMarket(r){const a=allAssignments().find(x=>x.id===r.body.operationId);return [r.body.account||a?.body.store,r.body.site||a?.body.site].filter(Boolean).join(' / ')||'产品通用';}
function productProgress(pid){
  const rows=data.records.filter(r=>r.product_id===pid),shipments=rows.filter(r=>r.kind==='shipment'),active=rows.filter(r=>['task','optimization','campaign'].includes(r.kind)&&r.body.status==='进行中');
  return '<div class="product-progress"><span class="progress-label">头程</span>'+(shipments.length?shipments.map(r=>'<small class="'+(r.body.firstLegStatus==='异常'?'risk':'')+'">'+esc(recordMarket(r))+' · '+esc(r.body.title)+' · '+esc(r.body.firstLegStatus||'待补充')+'</small>').join(''):'<small>暂无头程记录</small>')+'<span class="progress-label">正在做</span>'+(active.length?active.map(r=>'<small class="current-action">'+esc(recordMarket(r))+' · '+esc(r.body.title)+' · '+esc(r.body.owner||'待分配')+' · '+esc(r.body.executedAt?.replace('T',' ')||'执行时间待补')+'</small>').join(''):'<small>暂无执行中的动作</small>')+'</div>';
}
function marketChildren(pid){
  const rows=data.records.filter(r=>r.product_id===pid),groups=new Map();
  for(const r of rows){const label=r.kind==='operation'?[r.body.store,r.body.site].filter(Boolean).join(' / ')||'产品通用':recordMarket(r);if(!groups.has(label))groups.set(label,[]);groups.get(label).push(r);}
  return '<div class="market-children"><div class="market-header"><span>帐号 / 站点</span><span>负责运营 / 状态</span><span>正在做 / 执行时间</span><span>头程 / 下次跟进</span></div>'+[...groups].map(([label,rs])=>{const ops=rs.filter(r=>r.kind==='operation'),active=rs.filter(r=>['task','optimization','campaign'].includes(r.kind)&&r.body.status==='进行中'),ships=rs.filter(r=>r.kind==='shipment'),risk=rs.some(r=>recordSignals(r).length);return '<div class="market-child '+(risk?'market-risk':'')+'"><span><strong>↳ '+esc(label)+'</strong><button class="text-button" data-market-product="'+esc(pid)+'" data-market-label="'+esc(label)+'">管理此帐号站点 ›</button></span><span>'+([...new Set(rs.map(r=>r.body.owner).filter(Boolean))].map(esc).join('、')||'待分配')+'<small>'+ops.map(r=>esc(r.body.status)).join(' / ')+'</small></span><span>'+ (active.length?active.map(r=>'<small class="current-action">'+esc(r.body.title)+'<br>'+esc(r.body.executedAt?.replace('T',' ')||'时间待补')+'</small>').join(''):'<small>暂无执行中的动作</small>')+'</span><span>'+ships.map(r=>'<small>'+esc(r.body.title)+' · '+esc(r.body.firstLegStatus||'待补充')+'</small>').join('')+ '<small>下次跟进：'+esc(rs.filter(r=>r.body.due&&!['已完成','已验证','已签收','已付'].includes(r.body.status)).map(r=>r.body.due).sort()[0]||'待安排')+'</small>'+(risk?'<small class="risk">⚠ 异常 / 逾期 / 超预算，请查看记录</small>':'')+'</span></div>';}).join('')+(groups.size?'':'<div class="muted">暂无帐号站点，打开产品添加负责运营或操作记录。</div>')+'</div>';
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-market-product]');if(b){selected=b.dataset.marketProduct;tab='operation';renderDrawer();toast('当前帐号 / 站点：'+b.dataset.marketLabel+'，在关联记录中管理');}});
function operatorCards(){return '<div class="operator-grid">'+operatorNames().map(name=>{const assignments=allAssignments().filter(r=>r.body.owner===name),records=data.records.filter(r=>r.body.owner===name||assignedOwner(r)===name),tasks=records.filter(r=>r.kind==='task'&&r.body.status!=='已验证'),ids=new Set([...assignments.map(a=>a.product_id),...records.map(r=>r.product_id),...data.products.filter(p=>p.body.owner===name).map(p=>p.id)]);return '<button class="operator-card '+(ownerFilter===name?'selected':'')+'" data-owner="'+esc(name)+'"><span class="avatar">'+esc(name.slice(0,1))+'</span><strong>'+esc(name)+'</strong><small>'+ids.size+' 款产品 · '+assignments.length+' 项运营分工</small><span>'+tasks.length+' 项待办 · '+tasks.filter(late).length+' 项逾期</span></button>';}).join('')+'</div>';}
function render(){
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const picker=$('#operator-filter');picker.innerHTML=['全部运营',...operatorNames()].map(n=>'<option '+(n===ownerFilter?'selected':'')+'>'+esc(n)+'</option>').join('');
  $('#crumb').textContent=view;$('#title').textContent=view==='总览'?'团队产品跟进总览':view;
  $('#subtitle').textContent=view==='运营分工'?'按产品分配运营，一人可负责多款产品；店铺、站点和具体职责选填。':view==='团队工作台'?'查看每位运营负责的产品和待办，点击人员切换工作范围。':view==='变更记录'?'查看谁在什么时间、因为什么修改了记录。':'当前查看：'+ownerFilter+' · 每款产品保留独立的开发、物流、成本与运营记录。';
  const rs=data.records.filter(inOperatorScope),ps=scopedProducts(),tasks=rs.filter(r=>r.kind==='task'&&r.body.status!=='已验证'),verify=rs.filter(r=>['待验证','待复盘'].includes(r.body.status)),cost=rs.filter(r=>['cost','campaign'].includes(r.kind)),operations=rs.filter(r=>r.kind==='operation');
  let html='';
  if(view==='总览')html='<div class="metrics">'+[['产品数量',ps.length,'当前运营范围'],['需要跟进',tasks.length,tasks.filter(late).length+' 项逾期'],['运营分工',operations.length,'运营 × 产品，店铺选填'],['等待验证',verify.length,'结果与证据待确认']].map(([l,v,h])=>'<div class="metric"><span>'+esc(l)+'</span><strong>'+esc(v)+'</strong><small>'+esc(h)+'</small></div>').join('')+'</div>';
  if(['总览','产品'].includes(view)){
    const shown=ps.filter(p=>(filter==='全部状态'||p.body.operating===filter)&&[p.body.name,p.body.sku,p.body.owner,...allAssignments().filter(r=>r.product_id===p.id).map(r=>r.body.owner+' '+r.body.store+' '+r.body.site)].join(' ').toLowerCase().includes(search.toLowerCase()));
    html+='<div class="section-title"><h2>产品与团队</h2><span class="muted">同款产品一条父行，帐号与站点按子行分别跟进</span></div><div class="toolbar"><div class="search"><span>⌕</span><input id="search" aria-label="搜索产品" placeholder="搜索产品、SKU、运营或店铺" value="'+esc(search)+'"></div><select id="filter" aria-label="整体状态筛选">'+['全部状态',...operating].map(s=>'<option '+(s===filter?'selected':'')+'>'+esc(s)+'</option>').join('')+'</select><span class="muted">'+shown.length+' 款产品</span></div><div class="product-table"><div class="table-head"><span>产品 / SKU</span><span>开发阶段</span><span>整体状态</span><span>负责运营 / 当前进度</span><span>总负责人 / 跟进日</span><span>产品总投入</span></div>'+shown.map((p,i)=>{const b=p.body,assignments=allAssignments().filter(r=>r.product_id===p.id),names=[...new Set(assignments.map(r=>r.body.owner))],total=data.records.filter(r=>r.product_id===p.id&&['cost','campaign'].includes(r.kind));return '<details class="product-family" open><summary><span class="family-toggle">展开 / 收起帐号站点</span><button class="product-row" data-product="'+esc(p.id)+'"><span class="product-name"><span class="product-icon color'+i%3+'">◇</span><span><strong>'+esc(b.name)+'</strong><small>'+esc(b.sku)+'</small></span></span><span>'+badge(b.stage)+'</span><span>'+badge(b.operating)+'<small>'+esc(b.health)+'</small></span><span class="next-action">'+esc(names.join('、')||'待分配运营')+'<small>'+assignments.length+' 项分工 · '+esc(b.next)+'</small>'+'</span><span>'+esc(b.owner)+'<small class="'+(late(p)?'risk':'')+'">'+esc(b.due)+(late(p)?' · 逾期':'')+'</small></span><span class="row-money">'+money(sum(total,'actual'))+' <span>›</span></span></button></summary>'+marketChildren(p.id)+'</details>';}).join('')+(shown.length?'':empty('新建产品后，在详情的“运营分工”中分配负责运营，店铺和站点可不填。'))+'</div><div class="workflow-note"><span>✓</span><span>每项跟进和推广可关联运营分工；更改状态自动留下原因与历史。</span>'+(data.products.length?'':'<button class="quiet" id="demo">加入多产品示例</button>')+'</div>';
    if(view==='总览'&&data.products.length)html+='<div class="bottom-grid"><div class="panel"><div class="section-title"><h2>运营状态与下一步</h2><button class="text-button" data-view="运营分工">查看全部</button></div>'+operations.slice(0,3).map(record).join('')+(operations.length?'':empty('点击产品，添加运营分工'))+'</div><div class="panel"><div class="section-title"><h2>近期跟进</h2><button class="text-button" data-view="待办跟进">全部待办</button></div>'+tasks.slice(0,3).map(record).join('')+(tasks.length?'':empty('暂无待办'))+'</div></div>';
  }
  if(view==='运营分工')html+='<div class="verification-note">一款产品可以分配多位运营。以产品为主要负责范围，店铺与站点可留空；各自状态和验证标准独立记录。添加分工：打开产品 → 运营分工 → 添加。</div><div class="record-grid">'+operations.map(record).join('')+(operations.length?'':empty('暂无运营分工。请先新建产品，再添加运营分工。'))+'</div>';
  if(view==='团队工作台')html+=operatorCards()+'<div class="section-title"><h2>'+esc(ownerFilter)+'的待办</h2><span>'+tasks.length+' 项</span></div><div class="record-grid">'+tasks.slice().sort((a,b)=>(a.body.due||'').localeCompare(b.body.due||'')).map(record).join('')+(tasks.length?'':empty('当前范围暂无待办'))+'</div>';
  if(view==='待办跟进')html+='<div class="record-grid">'+tasks.slice().sort((a,b)=>(a.body.due||'').localeCompare(b.body.due||'')).map(record).join('')+(tasks.length?'':empty('暂无待办。在产品详情中添加跟进事项。'))+'</div>';
  if(view==='验证中心')html+='<div class="verification-note">验证需要实际结果及证据链接；证据内容由负责人确认。</div><div class="section-title"><h2>等待验证与复盘</h2><span>'+verify.length+' 项</span></div><div class="record-grid">'+verify.map(record).join('')+(verify.length?'':empty('暂无待验证事项'))+'</div><div class="section-title"><h2>已验证记录</h2></div><div class="record-grid">'+rs.filter(r=>r.body.status==='已验证'||r.kind==='campaign'&&r.body.status==='已完成').map(record).join('')+'</div>';
  if(view==='变更记录')html+=timeline();
  $('#content').innerHTML=html;renderDrawer();
}
document.addEventListener('change',e=>{if(e.target.id==='operator-filter'){ownerFilter=e.target.value;selected=null;render();}});
document.addEventListener('click',e=>{
  const b=e.target.closest('button');
  if(b?.dataset.owner){ownerFilter=b.dataset.owner;view='团队工作台';render();}
  const id=b?.dataset.operationTask||b?.dataset.operationCampaign;
  if(id){const a=allAssignments().find(r=>r.id===id);if(!a)return;selected=a.product_id;open(b.dataset.operationTask?'task':'campaign');$('#record-form [name="operationId"]').value=id;$('#record-form [name="owner"]').value=a.body.owner;}
});
async function teamDemo(){
  if(busy)return;const actor=$('#actor').value.trim();if(!actor){toast('请先填写右上角操作人。',true);$('#actor').focus();return;}
  busy=true;try{
    const post=(kind,body,productId)=>api('/api/workbench',{kind,body,productId,actor,reason:'加入多产品、多运营示例，仅供流程体验'});
    const product=(name,sku,owner)=>({name,sku,owner,stage:'已上架',operating:'测款中',health:'待处理',purpose:'验证产品市场与转化',issue:'示例数据，等待业务数据验证',next:'分配店铺运营并检查测试结果',due:today()});
    const p1=await post('product',product('示例｜桌面收纳盒','TEAM-DEMO-BOX','示例·运营主管'));
    const p2=await post('product',product('示例｜保温杯','TEAM-DEMO-CUP','示例·运营主管'));
    const assignment=(owner,store,site,status)=>({title:'新品推广与转化验证',owner,store,site,status,purpose:'测试关键词和页面转化',issue:'已开始测款，等待验证订单增长',next:'复盘7天数据并调整推广',due:today(),target:'确认有效订单词并控制推广花费'});
    const a1=await post('operation',assignment('示例·小林','示例A店','美国','推广中'),p1.id);
    const a2=await post('operation',assignment('示例·小周','示例B店','德国','测款中'),p1.id);
    const a3=await post('operation',assignment('示例·小林','示例A店','美国','优化中'),p2.id);
    await post('task',{title:'示例｜复盘美国站关键词',owner:'示例·小林',due:today(),target:'检查7天广告数据并筛出有效订单词',status:'待验证',operationId:a1.id},p1.id);
    await post('task',{title:'示例｜检查德国站页面',owner:'示例·小周',due:today(),target:'核对图片、卖点与页面语言',status:'进行中',operationId:a2.id},p1.id);
    await post('campaign',{title:'示例｜保温杯关键词测试',owner:'示例·小林',plan:'按关键词组测试，复盘高花费无订单词',channel:'站内广告',start:today(),due:today(),target:'目标ROAS 3.0x',budget:1500,actual:1800,sales:6000,orders:40,status:'待复盘',operationId:a3.id},p2.id);
    await post('cost',{title:'示例｜收纳盒首批采购',category:'采购',date:today(),budget:10000,actual:10500,status:'已付'},p1.id);
    await post('shipment',{title:'示例批次-001',owner:'示例·物流',method:'海运',quantity:500,planned:today(),shipped:today(),due:today(),status:'运输中'},p1.id);
    toast('已加入2款产品、2位运营的3项分工。数据均为示例。');
  }catch(e){toast(e.message,true);}finally{busy=false;await load();}
}

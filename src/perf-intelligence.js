// Runs in the tracker scope; all persisted edits still use the existing fields/events.
const perfClassicView=perfView;
const perfClassicHealth=perfHealth;
perfHealth=function(link){
  const recs=rangeRecs(perfOf(link.id),'4w');if(!recs.length)return perfClassicHealth(link);
  const c=perfCalc(link,recs),analysis=analyzePerformance(link,recs,c);
  if(!analysis.profitReady)return {tone:'wait',label:'数据待补齐',sub:analysis.missingCosts.length?'待填 '+analysis.missingCosts.join('、'):'请核对周期数据与统计口径',c};
  return perfClassicHealth(link);
};
const perfPresentation=new Map();
let perfMounted=null,perfResize=null,perfD3Loading=null;
const perfComplete=(rows,keys)=>rows.length>0&&rows.every(row=>keys.every(key=>num(row[key])));
function perfPresentationFor(link,c){
  const key=link.id+'|'+state.range,signature=JSON.stringify([c.price,c.S.adSpend,c.S.units,c.retRate,link.econ,c.ue?.head]);
  let ui=perfPresentation.get(key);
  if(!ui||ui.signature!==signature){
    ui={signature,scenario:{price:0,advertising:0,returns:num(c.retRate)?Math.max(0,Math.min(100,c.retRate*100)):0},hidden:new Set(),selected:null};
    perfPresentation.set(key,ui);
    if(perfPresentation.size>50)perfPresentation.delete(perfPresentation.keys().next().value);
  }
  return ui;
}
function perfSimResult(link,c,ui,ready){
  const result=ready?simulatePerformance(link,c,ui.scenario,unitEcon):null;
  if(!result)return '<p class="perf-empty">补齐售价、订单、广告和成本后，即可比较不同方案。</p>';
  return `<div class="perf-sim-main"><span>情景净利润</span><strong>${moneyS(result.net)}</strong></div>
    <div class="perf-sim-detail">相对当前 ${result.delta>=0?'+':''}${money2(result.delta)} · 情景净利率 ${pct(result.margin)}<br>
    保本广告额 ${result.breakEvenBudget>=0?moneyS(result.breakEvenBudget):'暂无广告空间'} · 目标广告上限 ${result.targetBudget>=0?moneyS(result.targetBudget):'当前成本下无法达到目标'}<br>
    情景均价 ${money2(result.price)} · 广告花费 ${moneyS(result.adSpend)} · 退货率 ${pct(result.returnRate)}</div>`;
}
function perfBridge(link,c,ready){
  if(!ready)return '<p class="perf-empty">待补齐数据后展示利润构成；不会把空白成本当作真实零成本。</p>';
  const e=link.econ,u=c.S.units,ue=c.ue;
  const items=[['销售额',c.S.sales,true],['采购成本',-e.cogs*u],['FBA 配送费',-e.fba*u],['佣金',-ue.comm*u],['头程',-ue.head*u],['其它成本',-(num(e.other)?e.other:0)*u],['退货损耗',-ue.retCost*u],['广告花费',-c.S.adSpend],['净利润',c.net,true]];
  let running=0;
  const rows=items.map(([label,value,total],index)=>{const a=total?0:running,b=total?value:running+value;if(index===0||!total)running=b;return {label,value,a,b,total};});
  const values=rows.flatMap(row=>[row.a,row.b]),low=Math.min(0,...values),high=Math.max(0,...values),span=high-low||1;
  return `<div class="perf-bridge" role="img" aria-label="销售额减去商品、履约、退货与广告后的利润构成">${rows.map(row=>{
    const left=(Math.min(row.a,row.b)-low)/span*100,width=Math.abs(row.b-row.a)/span*100;
    return `<div class="perf-bridge-row" data-total="${Boolean(row.total)}"><span>${row.label}</span><span class="perf-bridge-track"><i style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%;background:${row.total?'var(--viz-series-1)':'var(--fg2)'};opacity:${row.total?1:.45}"></i></span><span class="amount">${moneyS(row.value)}</span></div>`;
  }).join('')}</div><p class="perf-estimate">退货损耗沿用原有模型；未填写的其它成本与不可再售比例按 0 试算，可在成本设置中调整。</p>`;
}
function perfChartData(link,recs){
  return recs.filter(row=>typeof row.from==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.from)&&Number.isFinite(Date.parse(row.from))&&new Date(row.from).toISOString().slice(0,10)===row.from).map(row=>{
    const c=perfCalc(link,[row]),ready=analyzePerformance(link,[row],c).profitReady;
    return {row,x:Date.parse(row.from+'T00:00:00Z'),c,
      net:ready?c.net:null,tacos:perfComplete([row],['adSpend','sales'])?c.tacos:null,
      cvr:perfComplete([row],['units','sessions'])?c.cvr:null,ret:perfComplete([row],['returns','units'])?c.retRate:null,
      cpa:perfComplete([row],['adSpend','adOrders'])?c.cpa:null,beTacos:ready?c.beTacos:null,beCpa:ready?c.beCpa:null};
  });
}
function perfSeries(metric){
  if(metric==='tacos')return [{key:'tacos',label:'实际 TACoS'},{key:'beTacos',label:'保本 TACoS',ref:true}];
  if(metric==='cpa')return [{key:'cpa',label:'实际 CPA'},{key:'beCpa',label:'保本 CPA',ref:true}];
  return [{key:metric,label:({net:'净利润',cvr:'CVR',ret:'退货率'})[metric]||'净利润'}];
}
const perfMetricFormat=(metric,value)=>metric==='net'||metric==='cpa'?money2(value):pct(value,2);
function perfPeriodDetail(point){
  if(!point)return '暂无可查看的周期';
  return `<span>实际周期 ${esc(point.row.from)} — ${esc(point.row.to||point.row.from)}</span><span class="perf-period-values"><span>销售额 ${point.c.has.sales?moneyS(point.c.S.sales):'—'}</span><span>广告 ${point.c.has.adSpend?moneyS(point.c.S.adSpend):'—'}</span><span>净利润 ${num(point.net)?moneyS(point.net):'数据待补齐'}</span></span>`;
}
perfView=function(link){
  const all=perfOf(link.id),recs=rangeRecs(all,state.range),c=perfCalc(link,recs),analysis=analyzePerformance(link,recs,c),ui=perfPresentationFor(link,c);
  const points=perfChartData(link,recs),metric=METRICS.some(([key])=>key===state.metric)?state.metric:'net',series=perfSeries(metric);
  if(!points.some(point=>point.row.id===ui.selected))ui.selected=points.at(-1)?.row.id||null;
  const selected=points.find(point=>point.row.id===ui.selected);
  const issue=analysis.issues[0]||{kind:'data',title:'当前周期尚无可测算订单',detail:'请确认售价、订单件数及统计日期。',target:'records',action:'核对数据'};
  const button=(key,title)=>`<button type="button" data-act="metric" data-v="${key}" aria-pressed="${metric===key}">${title}</button>`;
  const card=(label,value,detail,key)=>`<${key?'button type="button" data-act="metric" data-v="'+key+'"':'div'} class="perf-stat"><span class="perf-label">${label}</span><span class="perf-value">${value}</span><span class="perf-context">${detail}</span></${key?'button':'div'}>`;
  const classic=document.createElement('template');classic.innerHTML=perfClassicView(link);
  const costEditor=classic.content.querySelector('.two > .panel:nth-child(2)')?.outerHTML||'';
  const recordsEditor=classic.content.lastElementChild?.outerHTML||'';
  const fallback=points.length?chartSVG({labels:points.map(point=>short(point.row.from)),series:series.map(item=>({kind:metric==='net'?'bar':'line',ref:item.ref,vals:points.map(point=>point[item.key])})),axis:metric==='net'||metric==='cpa'?axMoney:axPct,aria:'经营趋势（周期数据）',tips:points.map(point=>tipFor(link,point.row))}):'<p class="perf-empty">还没有可绘制的周期。录入第一期后，趋势与保本线会在这里呈现。</p>';
  const budgetMax=Math.max(c.preAd||0,c.S.adSpend||0,1)*1.12;
  const slider=(key,label,min,max,step,value)=>`<label class="perf-slider"><span>${label}<output data-perf-output="${key}">${key==='returns'?value.toFixed(1)+'%':(value>0?'+':'')+value+'%'}</output></span><input type="range" data-perf-sim="${key}" min="${min}" max="${max}" step="${step}" value="${value}" ${analysis.profitReady?'':'disabled'} aria-label="${label}"></label>`;
  return `<div id="perf-intelligence-root" class="perf-intelligent" data-link-id="${esc(link.id)}">
    <div class="perf-heading"><div><div class="perf-eyebrow">PERFORMANCE INTELLIGENCE</div><h2>经营驾驶舱</h2><p>${recs.length} 个已录周期 · 金额按人民币 · ${analysis.complete}/${analysis.total} 期字段齐全</p></div>
      <div class="perf-actions"><div class="perf-range" role="group" aria-label="时间范围">${[['4w','近4周'],['12w','近12周'],['all','全部']].map(([key,label])=>`<button type="button" data-act="range" data-v="${key}" aria-pressed="${state.range===key}">${label}</button>`).join('')}</div><button type="button" class="btn primary" data-perf-jump="records">录入数据</button></div></div>
    <div class="perf-stats">${card('已录销售额',c.has.sales?moneyS(c.S.sales):'—',c.has.units?c.S.units+' 件 · 均价 '+money2(c.price):'订单件数待补齐')}
      ${card('净利润',analysis.profitReady?moneyS(c.net):'待补齐',analysis.profitReady?'净利率 '+pct(c.margin):'先补齐成本和周期数据','net')}
      ${card('TACoS',perfComplete(recs,['adSpend','sales'])?pct(c.tacos):'—',analysis.profitReady?'保本 '+pct(c.beTacos):'保本线待补齐成本','tacos')}
      ${card('CPA',perfComplete(recs,['adSpend','adOrders'])?money2(c.cpa):'—',c.has.adOrders?c.S.adOrders+' 个广告订单':'广告订单待录入','cpa')}</div>
    <section class="perf-brief" aria-label="经营规则诊断"><span class="perf-signal" data-kind="${issue.kind}">规则诊断</span><div class="perf-brief-main"><strong>${esc(issue.title)}</strong><p>${esc(issue.detail)}</p>
      <details class="perf-evidence"><summary>查看数据依据与口径</summary><ul>${analysis.issues.map(item=>`<li>${esc(item.title)}：${esc(item.detail)}</li>`).join('')}<li>净利润＝退货调整后的广告前利润－广告花费；空白字段不会被当作已确认的零。</li><li>数据来自当前链接与所选时间范围，不调用外部模型，不预测未来销量。</li></ul></details></div><button type="button" class="btn" data-perf-jump="${issue.target}">${issue.action}</button></section>
    <section id="perf-trend" class="perf-chart-section"><div class="perf-section-head"><h3>利润与效率趋势</h3><div class="perf-metrics" role="group" aria-label="趋势指标">${METRICS.map(([key,label])=>button(key,label)).join('')}</div></div>
      <div class="perf-legend">${series.map((item,index)=>`<button type="button" data-perf-series="${item.key}" aria-pressed="${!ui.hidden.has(item.key)}"><span class="perf-swatch ${index?'ref':''}"></span>${item.label}</button>`).join('')}</div>
      <div class="perf-chart-host" data-perf-chart>${fallback}<div class="perf-tooltip" role="tooltip" hidden></div></div>
      <div class="perf-period"><label>查看实际周期 <select data-perf-period aria-label="查看实际周期">${points.length?points.map(point=>`<option value="${esc(point.row.id)}" ${point.row.id===ui.selected?'selected':''}>${esc(point.row.from)} — ${esc(point.row.to||point.row.from)}</option>`).join(''):'<option value="">暂无周期</option>'}</select></label><div data-perf-period-detail>${perfPeriodDetail(selected)}</div></div></section>
    <div class="perf-lower"><section><div class="perf-section-head"><h3>利润从哪里来</h3><span class="perf-secondary">当前已录数据</span></div>${perfBridge(link,c,analysis.profitReady)}
      ${analysis.profitReady&&c.preAd>0?`<div class="perf-budget-labels"><span>当前广告 ${moneyS(c.S.adSpend)}</span><span>保本上限 ${moneyS(c.preAd)}</span></div><div class="perf-budget" role="img" aria-label="当前广告 ${moneyS(c.S.adSpend)}，保本上限 ${moneyS(c.preAd)}"><i style="width:${Math.min(100,c.S.adSpend/budgetMax*100)}%"></i><b style="left:${c.preAd/budgetMax*100}%"></b></div><div class="perf-secondary">${c.net>=0?'距离保本仍有 '+moneyS(c.net)+' 空间':'超过保本空间 '+moneyS(-c.net)}</div>`:''}</section>
      <section id="perf-scenario" class="perf-simulation"><div class="perf-section-head"><h3>如果这样调整</h3><button type="button" class="btn" data-perf-reset>重置假设</button></div><p class="perf-estimate">只做情景测算，不修改实际记录。假设订单件数不变，不预测调价或广告变化带来的销量变化。</p>
        ${slider('price','售价调整',-20,20,1,ui.scenario.price)}${slider('advertising','广告花费调整',-40,40,1,ui.scenario.advertising)}${slider('returns','情景退货率',0,100,.5,ui.scenario.returns)}
        <div class="perf-sim-results" data-perf-sim-results aria-live="polite">${perfSimResult(link,c,ui,analysis.profitReady)}</div></section></div>
    <details class="perf-editor" id="perf-costs"><summary>成本与利润口径设置 <span>沿用现有保存流程</span></summary>${costEditor}</details>
    <details class="perf-editor" id="perf-records" ${all.length?'':'open'}><summary>周期数据与录入 <span>${all.length} 期原始记录</span></summary>${recordsEditor}</details>
  </div>`;
};

function perfActiveContext(root){
  const link=state.links.find(item=>item.id===root?.dataset.linkId);if(!link)return null;
  const recs=rangeRecs(perfOf(link.id),state.range),c=perfCalc(link,recs);
  return {link,recs,c,analysis:analyzePerformance(link,recs,c),ui:perfPresentationFor(link,c),points:perfChartData(link,recs)};
}
function perfSelectPoint(root,id){
  const ctx=perfActiveContext(root);if(!ctx)return;
  const point=ctx.points.find(item=>item.row.id===id);if(!point)return;
  ctx.ui.selected=id;root.querySelector('[data-perf-period]').value=id;
  root.querySelector('[data-perf-period-detail]').innerHTML=perfPeriodDetail(point);
}
function perfDrawChart(root){
  if(!root?.isConnected||!window.d3)return;
  const ctx=perfActiveContext(root);if(!ctx)return;
  const host=root.querySelector('[data-perf-chart]'),d3=window.d3,metric=state.metric,allSeries=perfSeries(metric),series=allSeries.filter(item=>!ctx.ui.hidden.has(item.key));
  const points=ctx.points;if(!points.length)return;
  const values=series.flatMap(item=>points.map(point=>point[item.key])).filter(num);
  const existingTooltip=host.querySelector('.perf-tooltip');if(existingTooltip)existingTooltip.hidden=true;
  for(const node of [...host.children])if(!node.classList.contains('perf-tooltip'))node.remove();
  if(!values.length){const note=document.createElement('p');note.className='perf-empty';note.textContent=series.length?'该指标数据尚未齐全，请先检查周期与成本。':'已隐藏全部曲线，点击图例可恢复。';host.prepend(note);return;}
  const width=Math.max(240,Math.round(host.getBoundingClientRect().width||host.clientWidth||640)),height=280;
  const margin={top:24,right:18,bottom:54,left:72},right=width-margin.right,bottom=height-margin.bottom;
  let [x0,x1]=d3.extent(points,point=>point.x);if(x0===x1){x0-=3*864e5;x1+=3*864e5;}
  let [y0,y1]=d3.extent(values);if(metric==='net'){y0=Math.min(0,y0);y1=Math.max(0,y1);}const padding=(y1-y0||Math.abs(y1)||1)*.14;y0-=padding;y1+=padding;
  const inset=metric==='net'?20:12;
  const x=d3.scaleUtc().domain([new Date(x0),new Date(x1)]).range([margin.left+inset,right-inset]);
  const y=d3.scaleLinear().domain([y0,y1]).nice().range([bottom-6,margin.top+8]);
  const svg=d3.create('svg').attr('class','perf-chart').attr('viewBox',`0 0 ${width} ${height}`).attr('role','img').attr('aria-label',(METRICS.find(([key])=>key===metric)?.[1]||'经营指标')+'，按实际录入周期绘制');
  svg.append('title').text('经营趋势：点选实际周期或使用下方周期选择器查看明细');
  svg.append('rect').attr('data-chart-frame','').attr('x',margin.left).attr('y',margin.top).attr('width',right-margin.left).attr('height',bottom-margin.top);
  svg.append('g').attr('transform',`translate(0,${bottom})`).call(d3.axisBottom(x).ticks(width<420?3:6).tickFormat(d3.utcFormat('%m/%d')).tickSizeOuter(0));
  svg.append('g').attr('transform',`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(value=>metric==='net'||metric==='cpa'?d3.format('~s')(value):pct(value,0)).tickSizeOuter(0));
  svg.append('text').attr('class','axis-title').attr('data-axis','x').attr('x',(right+margin.left)/2).attr('y',height-8).attr('text-anchor','middle').text('周期起始日期');
  svg.append('text').attr('class','axis-title').attr('data-axis','y').attr('x',margin.left).attr('y',15).text(metric==='net'?'净利润（元）':metric==='cpa'?'CPA（元）':'比例（%）');
  if(y0<0&&y1>0)svg.append('line').attr('x1',margin.left).attr('x2',right).attr('y1',y(0)).attr('y2',y(0)).attr('stroke','var(--line)');
  const colors=['var(--viz-series-1)','var(--viz-series-2)'];
  for(const item of series){const color=colors[allSeries.findIndex(row=>row.key===item.key)];
    if(metric==='net'){
      const barWidth=Math.min(34,(right-margin.left)/Math.max(2,points.length*1.8));
      svg.append('g').selectAll('rect').data(points.filter(point=>num(point[item.key]))).join('rect').attr('x',point=>x(point.x)-barWidth/2).attr('y',point=>Math.min(y(0),y(point[item.key]))).attr('width',barWidth).attr('height',point=>Math.max(1,Math.abs(y(0)-y(point[item.key])))).attr('fill',point=>point[item.key]<0?'var(--bad)':color);
    }else{
      const line=d3.line().defined(point=>num(point[item.key])).x(point=>x(point.x)).y(point=>y(point[item.key]));
      svg.append('path').datum(points).attr('class','perf-series').attr('d',line).attr('stroke',color).attr('stroke-dasharray',item.ref?'5 4':null);
      svg.append('g').selectAll('circle').data(points.filter(point=>num(point[item.key]))).join('circle').attr('cx',point=>x(point.x)).attr('cy',point=>y(point[item.key])).attr('r',3.5).attr('fill',color);
    }
  }
  const tooltip=host.querySelector('.perf-tooltip'),guide=svg.append('line').attr('data-chart-hover-guide','').attr('y1',margin.top).attr('y2',bottom).attr('visibility','hidden');
  const markers=svg.append('g'),bisect=d3.bisector(point=>point.x);
  const interpolate=(key,time)=>{
    const index=bisect.left(points,time);if(index===0)return points[0][key];if(index===points.length)return points.at(-1)[key];
    const a=points[index-1],b=points[index];if(!num(a[key])||!num(b[key]))return null;return a.x===b.x?b[key]:a[key]+(b[key]-a[key])*(time-a.x)/(b.x-a.x);
  };
  const show=event=>{
    const px=Math.max(margin.left,Math.min(right,d3.pointer(event,svg.node())[0])),time=+x.invert(px),nearest=points[bisect.center(points,time)];
    guide.attr('x1',px).attr('x2',px).attr('visibility','visible');markers.selectAll('*').remove();
    const rows=series.map(item=>({item,value:metric==='net'?nearest[item.key]:interpolate(item.key,time)})).filter(row=>num(row.value));
    for(const {item,value} of rows)markers.append('circle').attr('data-chart-hover-marker','').attr('cx',metric==='net'?x(nearest.x):px).attr('cy',y(value)).attr('r',4.5).attr('fill',colors[allSeries.findIndex(row=>row.key===item.key)]);
    tooltip.hidden=false;tooltip.innerHTML=`<strong>${metric==='net'?esc(nearest.row.from):d3.utcFormat('%m/%d')(new Date(time))+' · 趋势插值'}</strong>${rows.map(({item,value})=>`<div>${item.label} ${perfMetricFormat(metric,value)}</div>`).join('')}<div>点击查看最近实际周期</div>`;
    tooltip.style.left=Math.max(0,Math.min(width-240,px+12))+'px';tooltip.style.top='30px';
    return nearest;
  };
  svg.append('rect').attr('data-chart-hit','').attr('data-chart-hover-overlay','cross-series').attr('x',margin.left).attr('y',margin.top).attr('width',right-margin.left).attr('height',bottom-margin.top)
    .on('pointermove',show).on('pointerleave',()=>{tooltip.hidden=true;guide.attr('visibility','hidden');markers.selectAll('*').remove();})
    .on('click',event=>{const point=show(event);perfSelectPoint(root,point.row.id);});
  host.prepend(svg.node());
}
function perfMount(){
  const root=document.getElementById('perf-intelligence-root');
  if(root===perfMounted)return;
  perfResize?.disconnect();perfResize=null;perfMounted=root;
  if(!root)return;
  if(typeof ResizeObserver!=='undefined'){perfResize=new ResizeObserver(()=>perfDrawChart(root));perfResize.observe(root.querySelector('[data-perf-chart]'));}
  if(window.d3){perfDrawChart(root);return;}
  if(!perfD3Loading)perfD3Loading=new Promise(resolve=>{
    const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js';
    script.onload=()=>resolve(true);script.onerror=()=>resolve(false);document.head.append(script);
  });
  perfD3Loading.then(loaded=>{if(loaded&&perfMounted)perfDrawChart(perfMounted);});
}
const perfOriginalRender=render;
render=function(force){const result=perfOriginalRender(force);queueMicrotask(perfMount);return result;};
document.addEventListener('input',event=>{
  const key=event.target.dataset.perfSim;if(!key)return;
  const root=event.target.closest('#perf-intelligence-root'),ctx=perfActiveContext(root);if(!ctx||!ctx.analysis.profitReady)return;
  ctx.ui.scenario[key]=Number(event.target.value);
  root.querySelector(`[data-perf-output="${key}"]`).textContent=key==='returns'?Number(event.target.value).toFixed(1)+'%':(Number(event.target.value)>0?'+':'')+event.target.value+'%';
  root.querySelector('[data-perf-sim-results]').innerHTML=perfSimResult(ctx.link,ctx.c,ctx.ui,true);
});
document.addEventListener('change',event=>{if(event.target.hasAttribute('data-perf-period'))perfSelectPoint(event.target.closest('#perf-intelligence-root'),event.target.value);});
document.addEventListener('click',event=>{
  const root=event.target.closest('#perf-intelligence-root');if(!root)return;
  const jump=event.target.closest('[data-perf-jump]');
  if(jump){const target=root.querySelector('#perf-'+jump.dataset.perfJump);if(target){if(target.tagName==='DETAILS')target.open=true;target.scrollIntoView?.({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}return;}
  const ctx=perfActiveContext(root);if(!ctx)return;
  const legend=event.target.closest('[data-perf-series]');
  if(legend){const key=legend.dataset.perfSeries;if(ctx.ui.hidden.has(key))ctx.ui.hidden.delete(key);else ctx.ui.hidden.add(key);legend.setAttribute('aria-pressed',String(!ctx.ui.hidden.has(key)));perfDrawChart(root);return;}
  if(event.target.closest('[data-perf-reset]')){
    ctx.ui.scenario={price:0,advertising:0,returns:num(ctx.c.retRate)?Math.max(0,Math.min(100,ctx.c.retRate*100)):0};
    for(const input of root.querySelectorAll('[data-perf-sim]')){input.value=ctx.ui.scenario[input.dataset.perfSim];input.dispatchEvent(new Event('input',{bubbles:true}));}
  }
});
window.addEventListener('resize',()=>{if(perfMounted)perfDrawChart(perfMounted);});

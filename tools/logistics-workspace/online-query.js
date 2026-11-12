(function(root){
 'use strict';
 const endpoint='https://ops-center-cloud.xiaopong190-asin-radar.workers.dev/api/logistics-query';
 const host=document.getElementById('online-root');
 if(!host)return;
 const module=new URLSearchParams(location.search).get('module')||'compare';
 const route=module==='bill-display'?'monthly':module;
 const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const ids=['provider','country','region','channel'];
 const labels={provider:'服务商',country:'国家',region:'地区',channel:'渠道'};
 let version='',snapshot=null,page=0,regionalPage=0,confirmed=false,generation=0,controller=null,warehouseCountries={},inferredCountry=null;
 let exporting=false,debounce=null,automaticMonth=true,appliedScore={minScore:'',maxScore:'',order:'desc'},columnFilters=null;
 const $=id=>document.getElementById(id);
 function signal(result,error){
  const current=result||snapshot;
  parent.postMessage({type:'hangxu-engine-status',ready:!!current&&!error,saved:true,counts:current?.counts||{},snapshot:{mode:'snapshot',sha:current?.sourceSha||null,savedAt:current?.savedAt||null,loaded:!!current&&!error,queryVersion:current?.version||null},...(error?{error}:{} )},location.origin);
 }
 function notice(text,error=false){const status=$('online-status');if(status){status.textContent=text;status.classList.toggle('error',error);}}
 async function request(query,signal){
  const token=localStorage.getItem('ops-cloud-session-v1');
  if(!token)throw Object.assign(Error('请先返回运营中心登录'),{status:401});
  const requestController=new AbortController(),abort=()=>requestController.abort();
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,20000);
  try{
   const encoded=query.toString(),post=encoded.length>6000;
   const response=await fetch(endpoint+(post?'':'?'+encoded),{method:post?'POST':'GET',headers:{Authorization:'Bearer '+token,...(post?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(post?{body:encoded}:{}),cache:'no-store',signal:requestController.signal});
   let result;try{result=await response.json()}catch(error){if(error.name==='AbortError')throw error;throw Error('在线查询暂时不可用，请重试');}
   if(!response.ok)throw Object.assign(Error(result.error||'查询未完成，请重试'),{status:response.status});
   if(typeof result.version!=='string'||!result.sourceSha||!result.counts)throw Error('查询响应未通过校验');
   if(query.get('kind')?.startsWith('quotes-')&&result.tableColumns?.supported!==true)throw Error('完整列筛选服务尚未就绪，请重新加载');
   return result;
  }catch(error){if(error.name==='AbortError'&&!signal?.aborted)throw Error('查询超时，请重试');throw error;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 function options(select,values,selected,all,names={}){
  select.replaceChildren();select.add(new Option(all,''));
  for(const value of values||[])if(value!=='')select.add(new Option(names[value]||value,value));
  select.value=selected||'';
 }
 function selectHtml(id,label){return '<label>'+label+'<select name="'+id+'" id="online-'+id+'"><option value="">全部'+label+'</option></select></label>';}
 function shell(){
  const common='<p id="online-status" class="notice" role="status">正在读取最新已确认数据…</p>';
  if(route==='ratings'){host.innerHTML=common+'<main id="cooperation-app"></main>';return;}
  if(route==='overview'){host.innerHTML=common+'<section id="online-overview" class="cards"></section>';return;}
  const compare=route==='compare';
  host.innerHTML=common+'<section><h2>'+({compare:'筛选渠道',warehouses:'国家与仓库',monthly:'月度对账'}[route]||'共享数据')+'</h2><form id="online-filters"><div class="filters">'+
   (compare?ids.map(id=>selectHtml(id,labels[id])).join('')+'<label>仓库<input name="warehouse" id="online-warehouse" list="online-warehouse-list" maxlength="30" placeholder="全部仓库"><datalist id="online-warehouse-list"></datalist></label>'+selectHtml('transport','运输方式')+selectHtml('rule','评级规则'):
    route==='warehouses'?selectHtml('country','国家')+'<label>查询仓库编号<input name="warehousePrefix" maxlength="30" placeholder="例如 ABE"></label>':'<label>对账月份<input name="month" type="month"></label>'+selectHtml('provider','服务商'))+
   '</div>'+(compare?'<div class="check-options" id="online-cargo">'+['普货','带电','带磁','液体','粉末','其他特殊货物','未注明／待确认'].map(value=>'<label><input type="checkbox" name="cargo" value="'+value+'">'+value+'</label>').join('')+'</div><div class="check-options">税务方式 '+[['','全部'],['included','包税'],['excluded','不包税／递延'],['unknown','未明确']].map(([value,label])=>'<label><input type="radio" name="tax" value="'+value+'" '+(!value?'checked':'')+'>'+label+'</label>').join('')+'</div>':'')+
   '<div class="actions"><button type="button" id="online-reset">重置筛选</button><button type="submit">查询</button>'+(compare?'<button type="button" class="primary" id="online-compare">比较价格与评分</button>':'')+'<button type="button" id="online-retry">重新查询</button></div></form></section>'+
   '<section><h2>'+ (compare?'报价结果':route==='warehouses'?'仓库列表':'公司账单明细')+'</h2>'+
   (compare?'<div class="score-controls"><label>展示方式<select id="online-view"><option value="grouped">按仓库查看</option><option value="score">按分数查看</option></select></label><label>最低分<input id="online-minScore" type="number" min="0" max="10" step="0.1"></label><label>最高分<input id="online-maxScore" type="number" min="0" max="10" step="0.1"></label><label>排序<select id="online-order"><option value="desc">高分优先</option><option value="asc">低分优先</option></select></label><button id="online-apply-score">筛选分数</button><button id="online-clear-score">清除分数</button></div>':'')+
   '<div class="actions"><button id="online-export">导出当前筛选结果</button>'+(route==='monthly'?'<button id="online-export-summary">导出月度公司汇总</button>':'')+'</div><div id="online-summary" class="scroll"></div><div id="comparison"><div id="online-results" class="scroll"></div></div><div class="pager"><button id="online-prev">上一页</button><span id="online-page"></span><button id="online-next">下一页</button></div></section>'+
   (compare?'<section id="online-regional"><h2>区域报价</h2><p class="muted">跟随上方全局筛选；选定仓库后按原文覆盖情况查询。</p><div class="filters">'+selectHtml('region-provider','区域物流商')+selectHtml('region-transport','区域运输方式')+'<label>搜索区域／邮编<input id="online-region-search" maxlength="100"></label><label id="online-coverage-label" hidden>仓库覆盖<select id="online-coverage"><option value="confirmed">原文明确覆盖</option><option value="unverified">覆盖待核实</option></select></label></div><p id="online-region-count" class="muted"></p><div id="online-region-results" class="scroll"></div><div class="pager"><button id="online-region-prev">上一页</button><span id="online-region-page"></span><button id="online-region-next">下一页</button><button id="online-region-export">导出区域结果</button></div></section>':'');
  if(compare){
   root.OnlineClassicFilters.mount(document);
   columnFilters=root.OnlineColumnFilters.bind(document,()=>{page=0;load();},async(field,search,cursor,signal)=>{const query=parameters();query.set('version',version);query.set('column',field);query.set('columnSearch',search);query.set('cursor',String(cursor));return request(query,signal);});
   options($('online-transport'),['空运','海运','卡航','铁路','待确认'],'','全部方式',{'待确认':'其它／待确认'});
   options($('online-rule'),['price','strict'],'price','评级规则',{price:'价格初评（试用）',strict:'旧版严格规则'});
   $('online-rule').value='price';
   options($('online-region-transport'),['空运','海运','卡航','铁路','待确认'],'','全部方式',{'待确认':'其它／待确认'});
  }
  const form=$('online-filters');
  form.onsubmit=event=>{event.preventDefault();page=0;regionalPage=0;load();};
  form.onchange=event=>{
   if(event.target.name==='month')automaticMonth=!event.target.value;
   if(event.target.name==='warehouse'){
    const code=event.target.value.trim().toUpperCase();event.target.value=code;
    const countries=warehouseCountries[code]||[];
    if(countries.length===1){if(!inferredCountry)inferredCountry={previous:form.elements.country.value};inferredCountry.automatic=countries[0];form.elements.country.value=countries[0];}
    else if(!code&&inferredCountry){if(form.elements.country.value===inferredCountry.automatic)form.elements.country.value=inferredCountry.previous;inferredCountry=null;}
   }else if(event.target.name==='country')inferredCountry=null;
   confirmed=false;columnFilters?.clearDynamic();page=0;regionalPage=0;load();
  };
  if(compare)$('online-transport').onchange=form.onchange;
  form.oninput=event=>{if(event.target.name==='warehousePrefix'){clearTimeout(debounce);debounce=setTimeout(()=>{page=0;load()},250);}};
  $('online-reset').onclick=()=>{form.reset();inferredCountry=null;automaticMonth=true;confirmed=false;page=0;regionalPage=0;version='';if(compare){columnFilters.reset();$('online-rule').value='price';$('online-view').value='grouped';$('online-minScore').value='';$('online-maxScore').value='';$('online-order').value='desc';appliedScore={minScore:'',maxScore:'',order:'desc'};$('online-region-search').value='';$('online-region-provider').value='';$('online-region-transport').value='';$('online-coverage').value='confirmed';}load();};
  $('online-retry').onclick=()=>{page=0;regionalPage=0;version='';columnFilters?.reset();load();};
  $('online-prev').onclick=()=>{if(page){page--;load();}};
  $('online-next').onclick=()=>{page++;load();};
  $('online-export').onclick=()=>exportRows(false);
  if(compare){
   $('online-compare').onclick=()=>{if(!form.elements.country.value||!form.elements.warehouse.value){notice('请先选择国家和仓库再比较',true);return;}confirmed=true;columnFilters.clearDynamic();page=0;load();};
   $('online-view').onchange=()=>{columnFilters.clearOrder();page=0;load();};
   $('online-apply-score').onclick=()=>{const min=$('online-minScore').value,max=$('online-maxScore').value;if(min!==''&&(!Number.isFinite(Number(min))||Number(min)<0||Number(min)>10)||max!==''&&(!Number.isFinite(Number(max))||Number(max)<0||Number(max)>10)||min!==''&&max!==''&&Number(min)>Number(max)){notice('分数范围需在0至10之间，最低分不能大于最高分',true);return;}columnFilters.clearOrder();appliedScore={minScore:min,maxScore:max,order:$('online-order').value};if(min!==''||max!=='')$('online-view').value='score';page=0;load();};
   $('online-clear-score').onclick=()=>{columnFilters.clearOrder();$('online-minScore').value='';$('online-maxScore').value='';$('online-order').value='desc';appliedScore={minScore:'',maxScore:'',order:'desc'};page=0;load();};
   for(const id of ['online-minScore','online-maxScore'])$(id).oninput=()=>{if($(id).value===''&&!$(id).validity?.badInput)$('online-apply-score').click();};
   $('online-all-cargo').onclick=()=>{for(const input of $('online-cargo').querySelectorAll('input'))input.checked=false;confirmed=false;columnFilters?.clearDynamic();page=0;regionalPage=0;load();};
   $('online-region-search').oninput=()=>{clearTimeout(debounce);debounce=setTimeout(()=>{regionalPage=0;load()},250);};
   for(const id of ['online-region-provider','online-region-transport'])$(id).onchange=()=>{regionalPage=0;load();};
   $('online-coverage').onchange=()=>{regionalPage=0;load()};
   $('online-region-prev').onclick=()=>{if(regionalPage){regionalPage--;load();}};
   $('online-region-next').onclick=()=>{regionalPage++;load();};
   $('online-region-export').onclick=()=>exportRows(true);
  }
 }
 function parameters(regional=false){
  const query=new URLSearchParams(),form=$('online-filters');
  if(form)for(const [key,value] of new FormData(form))if(value&&key!=='rule'&&!(key==='month'&&automaticMonth))query.append(key,value);
  const rule=form?.elements.rule?.value||'price';
  query.set('kind',regional?'regional-'+rule:route==='compare'?'quotes-'+rule:route==='monthly'?'bills':'warehouses');
  query.set('page',String(regional?regionalPage:page));query.set('size','50');
  if(route==='compare'){
   if(regional){if(!query.get('provider')&&!$('online-region-provider').disabled&&$('online-region-provider').value)query.set('provider',$('online-region-provider').value);if(!query.get('transport')&&!$('online-region-transport').disabled&&$('online-region-transport').value)query.set('transport',$('online-region-transport').value);if($('online-region-search').value.trim())query.set('q',$('online-region-search').value.trim());query.set('coverageMode',$('online-coverage').value);}
   else{query.set('confirmed',confirmed?'1':'0');query.set('view',$('online-view').value);if($('online-view').value==='score'){query.set('order',appliedScore.order);for(const key of ['minScore','maxScore'])if(appliedScore[key]!=='')query.set(key,appliedScore[key]);}columnFilters.write(query);}
  }
  if(version)query.set('version',version);
  return query;
 }
 function table(headers,rows,types){return '<table><thead><tr>'+headers.map((value,i)=>'<th>'+escape(value)+(types?'<button type="button" data-score-column="'+i+'" data-column-name="'+escape(value)+'" data-value-type="'+types[i]+'" aria-label="'+escape(value)+'筛选与排序">▾</button>':'')+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(value=>'<td>'+value+'</td>').join('')+'</tr>').join('')+'</tbody></table>';}
 const money=value=>(Number(value||0)/100).toFixed(2);
 function quoteCells(row,regional){
  const grade=confirmed?row.ranked:row.base;
  const evidence=[['来源文件',row.source],['工作表',row.sourceSheet],['价格单元格',row.priceCell],['时效原文',row.leadRaw],['时效口径',row.timeBasis],['时效备注',row.timeNote],['评分依据',grade?.channelScoreBasis],['说明',grade?.reason]].filter(([,value])=>value).map(([label,value])=>'<small>'+escape(label+'：'+value)+'</small>').join('');
  const cells=[escape(row.company),escape(row.country),escape(regional?row.regionRaw:row.warehouse),escape(row.channelDisplay||row.channel)+(evidence?'<details><summary>查看依据</summary>'+evidence+'</details>':''),escape(row.terms),'<span class="price">'+escape(money(row.price))+'</span><small>'+escape(row.currency+'/'+row.unit)+'</small>',escape(row.min==null?'未提供':row.min+'–'+row.max+'天'),escape(row.date)];
  if(!regional)cells.push(...['priceGrade','timeGrade','quoteGrade'].map(key=>grade?.[key]?'<span class="grade">'+escape(grade[key])+'</span>':'待评级'),'<span class="score" title="'+escape(grade?.channelScoreBasis||'')+'">'+escape(grade?.channelScore??'—')+'</span>');
  return cells;
 }
 function renderRows(result,regional=false){
  const target=$(regional?'online-region-results':'online-results');
  if(!result.rows.length&&(route!=='compare'||regional)){target.innerHTML='<p class="muted">当前条件没有匹配记录。</p>';return;}
  if(route==='compare')target.innerHTML=table(['物流商','国家',regional?'区域／邮编':'仓库','渠道','计费条件','报价','承诺时效','原始日期',...(!regional?['价格等级','时效等级','综合等级','渠道参考分']:[])],result.rows.map(row=>quoteCells(row,regional)),regional?null:['text','text','text','text','text','number','time','text','text','text','text','number'])+(result.rows.length?'':'<p class="muted">当前条件没有匹配记录。</p>');
  else if(route==='warehouses')target.innerHTML=table(['国家','标准AMZ仓库编号','原始写法'],result.rows.map(row=>[row.country,row.warehouse,(row.variants||[row.warehouse]).join(' / ')].map(escape)));
  else target.innerHTML=table(['物流商','账单日期','账单号','运单号','渠道','目的仓','币种','账单金额','已付金额','备注'],result.rows.map(row=>[row.company,row.date,row.bill,row.waybill,row.channel,row.warehouse,row.currency,money(row.amount),money(row.paid),row.note].map(escape)));
 }
 function pagination(result,regional=false){
  $(regional?'online-region-page':'online-page').textContent=(result.page+1)+' / '+result.pages+' 页 · 共 '+result.total+' 条';
  $(regional?'online-region-prev':'online-prev').disabled=result.page===0;
  $(regional?'online-region-next':'online-next').disabled=result.page+1>=result.pages;
 }
 function render(result,regional){
  const form=$('online-filters');warehouseCountries=result.warehouseCountries||{};
  for(const id of ids){const select=$('online-'+id);if(select)options(select,result.options[id],route==='compare'?result.selected[id]:form.elements[id].value,'全部'+labels[id],id==='provider'?result.providerNames:{});}
  if(route==='compare'){
   options(form.elements.warehouse,result.options.warehouse,result.selected.warehouse,'全部仓库');
   const localProvider=$('online-region-provider'),localTransport=$('online-region-transport');
   const selectedProvider=form.elements.provider.value,selectedTransport=form.elements.transport.value;
   const localSelected=selectedProvider||(localProvider.disabled?'':localProvider.value);
   const providers=(regional.options.provider||[]).slice();if(selectedProvider&&!providers.includes(selectedProvider))providers.push(selectedProvider);
   options(localProvider,providers,localSelected,'全部区域物流商',result.providerNames);localProvider.disabled=!!selectedProvider;
   if(selectedTransport){localTransport.value=selectedTransport;localTransport.disabled=true;}else if(localTransport.disabled){localTransport.disabled=false;localTransport.value='';}
   renderRows(regional,true);pagination(regional,true);$('online-region-count').textContent='当前匹配 '+regional.total+' 条区域报价';
  }
  if(route==='monthly'){$('online-filters').elements.month.value=result.selected.month||result.day.slice(0,7);$('online-summary').innerHTML=table(['公司','币种','账单行数','账单金额','已付金额','待付／超付'],(result.summary||[]).map(row=>[row.company,row.currency,row.count,money(row.amount),money(row.paid),money(row.amount-row.paid)].map(escape)));}
  renderRows(result);pagination(result);
  if(route==='compare')columnFilters.update(result);
  if($('online-export-summary'))$('online-export-summary').onclick=()=>download('月度公司汇总',[['公司','币种','账单行数','账单金额','已付金额','待付／超付'],...(result.summary||[]).map(row=>[row.company,row.currency,row.count,money(row.amount),money(row.paid),money(row.amount-row.paid)])]);
 }
 async function script(src){return new Promise((resolve,reject)=>{const element=document.createElement('script');element.src=src;element.onload=resolve;element.onerror=()=>reject(Error('评价模块加载失败'));document.body.append(element)});}
 async function loadRatings(result,signal){
  const rows=result.rows.slice();
  for(let next=1;next<result.pages;next++){const query=new URLSearchParams({kind:'ratings',page:String(next),size:'100',version:result.version});const page=await request(query,signal);rows.push(...page.rows);}
  root.OnlineQueryContext={snapshot:{mode:'snapshot',sha:result.sourceSha,savedAt:result.savedAt,loaded:true},day:result.day,counts:result.counts,companies:result.companies,ratings:rows};
  if(!root.CloudCooperation){const link=document.createElement('link');link.rel='stylesheet';link.href='../cooperation.css';document.head.append(link);await script('../cloud-cooperation.js?v=1.0.66');if(await root.CloudCooperation.ready===false)throw Error('合作评价加载未完成，请重试');}
  else if(await root.CloudCooperation.refresh()===false)throw Error('合作评价刷新未完成，请重试');
 }
 function clearResults(){
  columnFilters?.close();
  for(const id of ['online-results','online-region-results','online-summary','online-overview','online-page','online-region-page','online-region-count'])if($(id))$(id).replaceChildren();
 }
 async function load(){
  const current=++generation;controller?.abort();controller=new AbortController();
  clearResults();
  for(const id of ['online-results','online-region-results'])if($(id))$(id).innerHTML='<p role="status">正在查询…</p>';
  for(const id of ['online-prev','online-next','online-region-prev','online-region-next'])if($(id))$(id).disabled=true;
  notice('正在读取最新已确认数据…');
  for(let attempt=0;attempt<2;attempt++)try{
   let query;
   if(route==='overview')query=new URLSearchParams({meta:'1'});
   else if(route==='ratings')query=new URLSearchParams({kind:'ratings',size:'100'});
   else{query=parameters();if(page===0&&!columnFilters?.hasFilters())query.delete('version');}
   const result=await request(query,controller.signal);
   if(current!==generation)return;
   version=result.version;let regional=null;
   if(route==='compare'){
    for(const id of ['provider','country','region','channel','warehouse'])if($('online-filters').elements[id])$('online-filters').elements[id].value=result.selected[id]||'';
    const regionalQuery=parameters(true);regionalQuery.set('version',version);
    regional=await request(regionalQuery,controller.signal);
   }
   if(current!==generation)return;
   if(route==='ratings')await loadRatings(result,controller.signal);
   else if(route==='overview')$('online-overview').innerHTML=[['本周仓库报价',result.counts.quotes],['本周区域报价',result.counts.regional],['国家仓库',result.counts.templates]].map(([label,count])=>'<div>'+escape(label)+'<strong>'+escape(count)+'</strong></div>').join('');
   else render(result,regional);
   if(current!==generation)return;
   snapshot=result;notice('已确认数据 '+result.sourceSha.slice(0,10)+' · 北京时间 '+result.day);signal(result);return;
  }catch(error){
   if(error.name==='AbortError'||current!==generation)return;
   if(error.status===409&&attempt===0){version='';page=0;regionalPage=0;confirmed=false;columnFilters?.reset();continue;}
   clearResults();
   notice(error.message,true);signal(null,error.message);return;
  }
 }
 function download(label,rows,context=snapshot){
  const cell=value=>{let text=String(value??'');if(/^[\s]*[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
  const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'})),anchor=document.createElement('a');
  anchor.href=url;anchor.download=label+'_'+(context?.day||'')+'_'+(context?.sourceSha.slice(0,10)||'')+'.csv';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function exportRows(regional){
  if(exporting||!version)return;exporting=true;
  const exportConfirmed=confirmed,exportSnapshot=snapshot;
  const button=$(regional?'online-region-export':'online-export'),original=button.textContent;button.disabled=true;
  const query=parameters(regional);query.set('version',version);query.set('size','100');query.set('page','0');
  try{
   const first=await request(query),rows=first.rows.slice();
   for(let next=1;next<first.pages;next++){button.textContent='正在准备 '+next+' / '+first.pages;query.set('page',String(next));const result=await request(query);rows.push(...result.rows);}
   let output;
   if(route==='compare'&&!regional)output=[['物流商','国家','渠道','AMZ仓库编号','单价','币种','计费单位','承诺最少天数','承诺最多天数','报价日期','计费条件','价格等级','时效等级','报价综合等级','综合分','时效口径','时效未确认','时效原文','时效备注','导出格式'],...rows.map(row=>{const grade=exportConfirmed?row.ranked:row.base;return [row.company,row.originalCountry||row.country,row.originalChannel||row.channel,row.warehouse,money(row.price),row.currency,row.unit,row.min,row.max,row.date,row.terms,grade?.priceGrade||'待评级',grade?.timeGrade||'待评级',grade?.quoteGrade||'待评级',grade?.quoteScore??'',row.timeBasis,String(row.timeUnverified),row.leadRaw,row.timeNote,'lrc-quotes-v2']})];
   else if(route==='compare')output=[['物流商','国家','区域／邮编','渠道','计费条件','报价','币种','单位','原始日期'],...rows.map(row=>[row.company,row.country,row.regionRaw,row.channel,row.terms,money(row.price),row.currency,row.unit,row.date])];
   else if(route==='warehouses')output=[['国家','仓库','原始写法'],...rows.map(row=>[row.country,row.warehouse,(row.variants||[row.warehouse]).join(' / ')])];
   else output=[['公司','日期','账单号','运单号','渠道','目的仓','币种','账单金额','已付金额','备注','来源文件','源行'],...rows.map(row=>[row.company,row.date,row.bill,row.waybill,row.channel,row.warehouse,row.currency,money(row.amount),money(row.paid),row.note,row.source,row.sourceRow])];
   download(regional?'区域报价':'共享查询结果',output,exportSnapshot);
  }catch(error){
   if(error.status===409){version='';page=0;regionalPage=0;confirmed=false;columnFilters?.reset();await load();notice('数据已更新，查询已刷新，请重新导出。',true);}
   else notice(error.message,true);
  }
  finally{exporting=false;button.disabled=false;button.textContent=original;}
 }
 async function checkVersion(){
  if(document.visibilityState==='hidden'||!snapshot)return;
  try{const latest=await request(new URLSearchParams({meta:'1'}));if(latest.version!==version){if(route==='ratings'&&root.CloudCooperation?.isDirty?.()){notice('新数据已发布，请先保存或取消当前评价再刷新。',true);return;}page=0;regionalPage=0;version='';columnFilters?.reset();load();}}
  catch(error){clearResults();notice(error.message,true);signal(null,error.message);}
 }
 if(route==='compare'&&(!root.OnlineClassicFilters||!root.OnlineColumnFilters)){host.textContent='筛选组件加载失败，请使用页面上方的“重新加载”。';signal(null,'筛选组件加载失败');return;}
 shell();load();
 const timer=setInterval(checkVersion,60000);
 addEventListener('focus',checkVersion);document.addEventListener('visibilitychange',checkVersion);
 addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='hangxu-engine-command')return;if(event.data.action==='checkSnapshotVersion')checkVersion();if(event.data.action==='refreshSnapshot')load();});
 addEventListener('pagehide',()=>{clearInterval(timer);clearTimeout(debounce);controller?.abort()},{once:true});
 root.OnlineQuery={refresh:load};
})(window);

(() => {
 'use strict';
 const $=id=>document.getElementById(id),P=MonthlyCooperationReview;
 let data={bills:{rows:[],aliases:{}},ratings:[],directory:[]},billPage=1,ratingPage=1,token=0;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>(v/100).toFixed(2),date=()=>{let d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
 function table(id,head,rows){$(id).innerHTML=rows.length?'<table><thead><tr>'+head.map(v=>'<th scope="col">'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td class="wrap">'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>':'<p>当前筛选没有记录。</p>';}
 function name(r,bills=false){const fallback=bills?(data.bills.aliases[r.company]||r.company):r.company;return data.directory.find(c=>c.id===r.companyId||c.name===fallback||c.aliases.includes(fallback))?.name||fallback;}
 function pager(prefix,view){$(prefix+'Page').textContent=`第 ${view.page} / ${view.pages} 页 · 共 ${view.total} 行 · 每页50行` ;$(prefix+'Prev').disabled=view.page===1;$(prefix+'Next').disabled=view.page===view.pages;}
 function render(){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test($('month').value)){$('message').textContent='请选择有效月份，当前保留上次视图。';return;}
  $('message').textContent='';
  const options={month:$('month').value,company:$('company').value};
  const b=P.projectBills(data.bills.rows,{...options,name:r=>name(r,true)}),r=P.projectRatings(data.ratings,{...options,name:r=>name(r)});
  table('billsSummary',['公司','币种','账单行数','账单金额','已付金额','净差额','逐行待付','逐行超付'],b.groups.map(g=>[g.company,g.currency,g.count,money(g.amount),money(g.paid),money(g.balance),money(g.outstanding),money(g.overpaid)]));
  $('billNotice').textContent=`当前月份 ${b.details.length} 行；其中 ${b.reviewCount} 行存在同单多行线索。提示不改变金额或结算状态。`;
  const bp=P.pageRows(b.details,billPage);billPage=bp.page;pager('bill',bp);
  table('billsDetail',['公司 / 日期','账单号 / 运单号','渠道 / 仓库','币种','账单 / 已付','差额 / 方向','核对线索','备注','来源文件 / 源行'],bp.rows.map(x=>[x.displayCompany+' / '+x.date,(x.bill||'未提供')+' / '+(x.waybill||'未提供'),(x.channel||'未提供')+' / '+(x.warehouse||'未提供'),x.currency,money(x.amount)+' / '+money(x.paid),money(x.balance)+' / '+x.status,x.review||'—',x.note||'—',(x.source||'未提供')+' / '+(x.sourceRow??'未提供')]));
  $('ratingNotice').textContent=`本月已完成 ${r.completed} 票，已评价 ${r.rated} 票，待评价 ${r.completed-r.rated} 票。覆盖率 ${r.completed?(r.rated/r.completed*100).toFixed(1)+'%':'—'}。样本量仅供判断，没有自动升降级门槛。`;
  table('ratingsSummary',['公司','渠道范围','已完成','已评价 / 总票数','待评价','月度分','等级'],r.groups.map(g=>[g.company,g.channel,g.count,g.rated+' / '+g.count,g.pending,g.score===null?'—':g.score.toFixed(1),g.grade]));
  const rp=P.pageRows(r.details.filter(x=>$('mode').value==='all'||x.mode===$('mode').value),ratingPage);ratingPage=rp.page;pager('rating',rp);
  table('ratingsDetail',['公司 / 单号','运营 / 渠道','发货 → 完成','费用 / 时效 / 服务原分','分项贡献 → 总分','评价依据'],rp.rows.map(x=>[x.displayCompany+' / '+x.shipment,x.operator+' / '+x.channel,x.shipped+' → '+x.finished,x.score===null?'待评价':`${x.price} / ${x.time} / ${x.coop}`,x.score===null?'不计入月度分':`${x.contributions.price} + ${x.contributions.time} + ${x.contributions.coop} = ${x.score.toFixed(1)}`,x.note||'—']));
 }
 function accept(next,label){Domain.bills(next.bills);Domain.ratings(next.ratings,date());Domain.directory(next.directory);data=next;const names=[...new Set([...data.bills.rows.map(r=>name(r,true)),...data.ratings.map(r=>name(r))])].sort();$('company').innerHTML='<option value="">全部公司</option>'+names.map(n=>'<option value="'+esc(n)+'">'+esc(n)+'</option>').join('');billPage=ratingPage=1;$('source').textContent=label;$('message').textContent='';render();}
 $('backup').onchange=async e=>{const current=++token,f=e.target.files[0];if(!f)return;try{if(f.size>32*1024*1024)throw Error('审查备份上限32 MiB，请先按业务范围导出');const text=await f.text();if(current!==token)return;const x=JSON.parse(text);if(!x.storage||typeof x.storage!=='object')throw Error('请选择系统导出的全量 JSON 备份');accept({bills:x.storage['logistics-monthly-bills-v1']||{rows:[],aliases:{}},ratings:x.storage['logistics-completed-ratings-v1']||[],directory:x.storage['logistics-company-directory-v1']||[]},`备份：${f.name} · 空间：${x.space||'未标明'} · 导出时间：${x.exportedAt||'未标明'}；仅代表该备份时点。`);}catch(err){if(current===token)$('message').textContent='载入失败，保留上一份已载入视图：'+err.message;}};
 $('sample').onclick=()=>{++token;const month=$('month').value,base={company:'虚拟物流',companyId:'sample',date:month+'-01',bill:'SAMPLE-01',waybill:'W-01',channel:'美国 · 海运',warehouse:'示例仓',currency:'USD',note:'虚拟示例；两行可能是费用拆分，请查原账单',source:'虚拟账单.csv'};accept({directory:[{id:'sample',name:'虚拟物流',aliases:[]}],bills:{aliases:{},rows:[{...base,amount:10000,paid:4000,sourceRow:2},{...base,amount:2000,paid:3000,sourceRow:3}]},ratings:[{id:'sample-1',companyId:'sample',company:'虚拟物流',channel:'美国 · 海运',operator:'示例运营',shipment:'SAMPLE-01',shipped:date(),finished:date(),mode:'rated',price:8,time:7,coop:9,note:'虚拟示例：按约定核对费用、到达日期及异常沟通。'}]},'虚拟示例 · 仅在本页内存中，刷新后清除');};
 for(const id of ['month','company'])$(id).onchange=()=>{billPage=ratingPage=1;render();};$('mode').onchange=()=>{ratingPage=1;render();};
 for(const [id,delta] of [['billPrev',-1],['billNext',1],['ratingPrev',-1],['ratingNext',1]])$(id).onclick=()=>{if(id.startsWith('bill'))billPage+=delta;else ratingPage+=delta;render();};
 $('month').value=date().slice(0,7);render();
})();

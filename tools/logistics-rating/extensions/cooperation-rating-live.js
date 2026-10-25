(function(root){
 'use strict';
 const $=id=>document.getElementById('cr-'+id),V=root.CooperationRatingView;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=n=>n===null?'—':n.toFixed(1);
 let snapshot,actions,selected='',page=1,ready=false,lastMonth='';
 function resetFilters(){$('channel').value='';$('status').value='all';$('recordSearch').value='';page=1;}
 function editor(id){if(id)actions.edit(id);else actions.add(selected);document.getElementById('cooperationEditor').showModal();}
 function mount(){
  const workspace=document.getElementById('cooperationWorkspace'),legacy=document.getElementById('ratingLegacy');
  document.getElementById('cooperationFormHost').appendChild(document.getElementById('form').closest('section'));
  const demoTools=document.getElementById('demo').parentElement?.parentElement;if(demoTools)workspace.appendChild(demoTools);
  document.getElementById('cooperationClose').onclick=()=>document.getElementById('cooperationEditor').close();
  $('companyList').onclick=e=>{const button=e.target.closest('[data-company]');if(button){selected=button.dataset.company;resetFilters();paint();}};
  $('records').onclick=e=>{const button=e.target.closest('[data-record]');if(button)editor(button.dataset.record);};
  $('companySearch').oninput=paint;$('recordSearch').oninput=()=>{page=1;paint();};
  $('month').onchange=()=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test($('month').value))actions.changeMonth($('month').value);else $('month').value=snapshot.month;};
  for(const id of ['channel','status'])$(id).onchange=()=>{page=1;paint();};
  $('prev').onclick=()=>{page--;paint();};$('next').onclick=()=>{page++;paint();};$('add').onclick=$('addSelected').onclick=()=>editor();
  legacy.hidden=true;workspace.hidden=false;ready=true;
 }
 function paint(){
  const companies=new Map(snapshot.companies.map(c=>[c.id,c]));for(const r of snapshot.records)if(!companies.has(r.companyId))companies.set(r.companyId,{id:r.companyId,name:r.company,imported:false});
  const list=[...companies.values()];if(!companies.has(selected)){selected=list[0]?.id||'';resetFilters();}
  const v=V.companyRatingView(snapshot.records,{month:snapshot.month,companyId:selected,channel:$('channel').value,status:$('status').value,query:$('recordSearch').value,page});
  const s=v.selected,c=companies.get(selected);$('month').value=snapshot.month;
  $('lockNotice').hidden=!snapshot.locked;$('lockNotice').textContent=snapshot.locked?'合作数据异常，已停止保存。请保留现有数据并检查备份。':'';
  $('companyCount').textContent=v.companies.length;$('completed').textContent=v.overview.completed;$('rated').textContent=v.overview.rated;$('pending').textContent=v.overview.pending;
  const q=$('companySearch').value.trim(),visible=list.filter(c=>c.name.includes(q));$('listCount').textContent=visible.length+'家';
  $('companyList').innerHTML=visible.length?visible.map(c=>{const x=v.companies.find(x=>x.id===c.id)||V.summarize([]);return `<button class="company-choice ${c.id===selected?'selected':''}" data-company="${esc(c.id)}" aria-pressed="${c.id===selected}"><span><b>${esc(c.name)}</b><small>已评 ${x.rated} / 合作 ${x.completed} 次</small></span><span class="choice-score">${fmt(x.score)}<span class="choice-grade">${x.grade==='待评价'?'待评价':x.grade+'级'}</span></span></button>`;}).join(''):'<div class="empty">暂无公司；请先导入物流商。</div>';
  $('companyName').textContent=c?.name||'暂无合作公司';$('avatar').textContent=c?.name.slice(0,1)||'—';$('companyMeta').textContent=snapshot.month.replace('-','年')+'月 · '+v.channels.length+'个合作渠道';
  $('score').textContent=fmt(s.score);$('grade').textContent=s.grade==='待评价'?'待评价':s.grade+'级';$('scoreBasis').textContent=s.rated?'由本月 '+s.rated+' 票已评价合作等权平均':'本月暂无已评价合作';
  $('coverage').textContent=s.coverage===null?'—':s.coverage+'%';$('coverageBar').style.width=(s.coverage||0)+'%';$('coverageNote').textContent=`已评价 ${s.rated} 票 · 待评价 ${s.pending} 票 · 共 ${s.completed} 票`;
  $('dimensions').innerHTML=[['费用兑现',s.price],['时效兑现',s.time],['配合服务',s.coop]].map(([label,n])=>`<div class="dimension"><span>${label}</span><div class="bar"><i style="width:${n===null?0:n*10}%"></i></div><b>${fmt(n)}</b></div>`).join('');
  $('trend').innerHTML=v.trend.length?v.trend.map(x=>`<div class="trend-month"><b>${fmt(x.score)}</b><div class="trend-column" style="height:${x.score===null?0:x.score*.65}px"></div><span>${esc(x.month)}</span><small>${x.rated}票已评</small></div>`).join(''):'<div class="empty">暂无月度合作记录</div>';
  const channel=$('channel').value;$('channel').innerHTML='<option value="">全部渠道</option>'+v.channels.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');$('channel').value=v.channels.includes(channel)?channel:'';
  $('historyCount').textContent=v.total+' 次合作';page=v.page;$('page').textContent=`${v.page} / ${v.pages}`;$('prev').disabled=v.page===1;$('next').disabled=v.page===v.pages;
  $('records').innerHTML=v.rows.length?v.rows.map(r=>`<tr><td><strong>${esc(r.shipment)}</strong><small>${esc(r.finished)} 完成</small><small>${esc(r.shipped)} 发货</small></td><td>${esc(r.channel)}<small>${esc(r.operator)}</small></td><td>${r.mode==='rated'?`${fmt(Number(r.price))} / ${fmt(Number(r.time))} / ${fmt(Number(r.coop))}`:'<span class="muted">尚未评分</span>'}</td><td>${r.mode==='rated'?`<span class="row-score">${fmt(V.score(r))}</span>`:'<span class="status-pending">待评价</span>'}</td><td class="evidence">${esc(r.mode==='rated'?r.note:'合作已完成，等待负责运营补充评价。')}</td><td><button class="text-button" data-record="${esc(r.id)}">${r.mode==='rated'?'查看 / 编辑':'去评价 →'}</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty">当前月份没有符合筛选条件的合作记录</td></tr>';
  $('add').disabled=snapshot.locked||!snapshot.companies.length;$('addSelected').disabled=snapshot.locked||!c?.imported;
 }
 // Explicit presentation hook. This module never reads/writes storage or submits data.
 root.CooperationRatingLive={render(next,callbacks){snapshot=next;actions=callbacks;if(!ready)mount();if(lastMonth!==next.month){lastMonth=next.month;resetFilters();}paint();}};
})(window);

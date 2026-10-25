(() => {
 'use strict';
 const $=id=>document.getElementById(id),V=CooperationRatingView;
 const companies=[{id:'haiqiao',name:'海桥国际物流'},{id:'yunsu',name:'云速供应链'},{id:'yuanhang',name:'远航国际货运'},{id:'changhe',name:'长河物流'}];
 const channelNames=Domain.channels;
 const fixture=(companyId,n,finished,channel,values,note)=>({id:companyId+'-'+n,companyId,company:companies.find(c=>c.id===companyId).name,shipment:'HZ'+finished.replaceAll('-','')+String(n).padStart(3,'0'),operator:['张敏','李晨','王悦'][n%3],channel,shipped:finished.slice(0,7)+'-01',finished,mode:values?'rated':'pending',...(values?{price:values[0],time:values[1],coop:values[2]}:{}),note:note||''});
 let records=[
  fixture('haiqiao',1,'2026-10-23','美国 · 海运',[9,9,9],'费用与约定一致，按承诺时间抵达，异常沟通及时。'),
  fixture('haiqiao',2,'2026-10-20','欧洲 · 空运',null),
  fixture('haiqiao',3,'2026-10-18','美国 · 海运',[8.5,7,8.5],'到港晚于承诺，延误已说明，后续回复及时。'),
  fixture('haiqiao',4,'2026-10-14','欧洲 · 空运',[9,9.5,9],'账单与约定一致，提前到达，交接顺利。'),
  fixture('haiqiao',5,'2026-10-09','美国 · 海运',[8,8,9],'按约定送达，费用明细清楚，预约入仓配合顺畅。'),
  fixture('haiqiao',6,'2026-10-04','欧洲 · 铁路',[8,8,8],'费用及时效兑现，常规沟通正常。'),
  fixture('haiqiao',7,'2026-09-24','美国 · 海运',[8,8,8],'虚拟历史合作：按约定完成。'),
  fixture('haiqiao',8,'2026-09-19','欧洲 · 空运',[9,8,9],'虚拟历史合作：交接配合及时。'),
  fixture('haiqiao',9,'2026-08-21','美国 · 海运',[8,7,8],'虚拟历史合作：到达晚于承诺。'),
  fixture('haiqiao',10,'2026-08-12','美国 · 海运',[8,8,8],'虚拟历史合作：按约定完成。'),
  fixture('yunsu',1,'2026-10-22','美国 · 空运',[9,9.5,9.5],'到达及时，全程反馈清楚。'),
  fixture('yunsu',2,'2026-10-15','欧洲 · 空运',[9,9,9],'费用与约定一致，交接顺利。'),
  fixture('yunsu',3,'2026-10-10','美国 · 空运',null),
  fixture('yuanhang',1,'2026-10-21','美国 · 海运',[8,6,7],'到达晚于约定，异常回复有延迟。'),
  fixture('yuanhang',2,'2026-10-16','欧洲 · 铁路',[8,8,8],'本票费用及时效按约定兑现。'),
  fixture('yuanhang',3,'2026-10-07','美国 · 海运',null),
  fixture('changhe',1,'2026-10-19','美国 · 海运',[9,8,8.5],'费用准确，目的仓交接顺利。'),
  fixture('changhe',2,'2026-10-12','欧洲 · 卡航',[8,7.5,8],'到达略晚，沟通正常。'),
  fixture('changhe',3,'2026-10-06','美国 · 海运',null)
 ];
 let selected='haiqiao',page=1,toastTimer;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>n===null?'—':n.toFixed(1);
 const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
 function view(){return V.companyRatingView(records,{month:$('month').value,companyId:selected,channel:$('channel').value,status:$('status').value,query:$('recordSearch').value,page});}
 function render(){
  const v=view(),s=v.selected,c=companies.find(c=>c.id===selected);
  $('companyCount').textContent=v.companies.length;$('completed').textContent=v.overview.completed;$('rated').textContent=v.overview.rated;$('pending').textContent=v.overview.pending;
  const q=$('companySearch').value.trim(),list=companies.filter(c=>c.name.includes(q));$('listCount').textContent=list.length+'家';
  $('companyList').innerHTML=list.length?list.map(c=>{const x=v.companies.find(x=>x.id===c.id)||V.summarize([]);return `<button class="company-choice ${c.id===selected?'selected':''}" data-company="${esc(c.id)}" aria-pressed="${c.id===selected}"><span><b>${esc(c.name)}</b><small>已评 ${x.rated} / 合作 ${x.completed} 次</small></span><span class="choice-score">${fmt(x.score)}<span class="choice-grade">${x.grade==='待评价'?'待评价':x.grade+'级'}</span></span></button>`;}).join(''):'<div class="empty">未找到公司</div>';
  $('companyName').textContent=c.name;$('avatar').textContent=c.name.slice(0,1);$('companyMeta').textContent=$('month').value.replace('-','年')+'月 · '+v.channels.length+'个合作渠道';
  $('score').textContent=fmt(s.score);$('grade').textContent=s.grade==='待评价'?'待评价':s.grade+'级';$('scoreBasis').textContent=s.rated?'由本月 '+s.rated+' 票已评价合作等权平均':'本月暂无已评价合作';
  $('coverage').textContent=s.coverage===null?'—':s.coverage+'%';$('coverageBar').style.width=(s.coverage||0)+'%';$('coverageNote').textContent=`已评价 ${s.rated} 票 · 待评价 ${s.pending} 票 · 共 ${s.completed} 票`;
  $('dimensions').innerHTML=[['费用兑现',s.price],['时效兑现',s.time],['配合服务',s.coop]].map(([label,n])=>`<div class="dimension"><span>${label}</span><div class="bar"><i style="width:${n===null?0:n*10}%"></i></div><b>${fmt(n)}</b></div>`).join('');
  $('trend').innerHTML=v.trend.length?v.trend.map(x=>`<div class="trend-month"><b>${fmt(x.score)}</b><div class="trend-column" style="height:${x.score===null?0:x.score*.65}px"></div><span>${x.month.slice(5)}月</span><small>${x.rated}票已评</small></div>`).join(''):'<div class="empty">暂无月度合作记录</div>';
  const channel=$('channel').value;$('channel').innerHTML='<option value="">全部渠道</option>'+v.channels.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');$('channel').value=channel;
  $('historyCount').textContent=v.total+' 次合作';page=v.page;$('page').textContent=`${v.page} / ${v.pages}`;$('prev').disabled=v.page===1;$('next').disabled=v.page===v.pages;
  $('records').innerHTML=v.rows.length?v.rows.map(r=>`<tr><td><strong>${esc(r.shipment)}</strong><small>${esc(r.finished)} 完成</small></td><td>${esc(r.channel)}<small>${esc(r.operator)}</small></td><td>${r.mode==='rated'?`${fmt(Number(r.price))} / ${fmt(Number(r.time))} / ${fmt(Number(r.coop))}`:'<span class="muted">尚未评分</span>'}</td><td>${r.mode==='rated'?`<span class="row-score">${fmt(V.score(r))}</span>`:'<span class="status-pending">待评价</span>'}</td><td class="evidence">${esc(r.mode==='rated'?r.note:'合作已完成，等待负责运营补充评价。')}</td><td><button class="text-button" data-record="${esc(r.id)}">${r.mode==='rated'?'查看 / 编辑':'去评价 →'}</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty">没有符合筛选条件的合作记录</td></tr>';
 }
 function resetFilters(){$('channel').value='';$('status').value='all';$('recordSearch').value='';page=1;}
 function openEditor(record){
  $('ratingForm').reset();$('formError').textContent='';$('editId').value=record?.id||'';$('editorTitle').textContent=record?(record.mode==='pending'?'评价这次合作':'查看 / 编辑合作评价'):'登记一次合作';
  $('editCompany').innerHTML=companies.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');$('editCompany').value=record?.companyId||selected;
  $('editChannel').innerHTML=channelNames.map(c=>`<option>${c}</option>`).join('');
  for(const id of ['shipment','operator','shipped','finished','price','time','coop','note'])$(id).value=record?.[id]??'';
  $('finished').value=record?.finished||today();$('editChannel').value=record?.channel||channelNames[0];$('editMode').value=record?.mode==='rated'?'rated':record?'rated':'pending';
  // A rated record remains rated while editing; no implicit rating withdrawal.
  $('editMode').disabled=record?.mode==='rated';toggleScoring();$('editor').showModal();
 }
 function toggleScoring(){const rated=$('editMode').value==='rated';$('scoring').hidden=!rated;for(const id of ['price','time','coop','note'])$(id).required=rated;updateLiveScore();}
 function updateLiveScore(){const values=['price','time','coop'].map(id=>$(id).value);$('liveScore').textContent=values.every(v=>v!=='')?`本票总分：${fmt(Number(values[0])*3+Number(values[1])*4+Number(values[2])*3)} / 100　·　每项0–10分，步长0.5`:'填写三项分数后，显示本票总分（满分100）。';}
 $('companyList').onclick=e=>{const button=e.target.closest('[data-company]');if(!button)return;selected=button.dataset.company;resetFilters();render();};
 $('records').onclick=e=>{const button=e.target.closest('[data-record]');if(button)openEditor(records.find(r=>r.id===button.dataset.record));};
 $('companySearch').oninput=render;$('month').onchange=()=>{resetFilters();render();};for(const id of ['channel','status'])$(id).onchange=()=>{page=1;render();};$('recordSearch').oninput=()=>{page=1;render();};
 $('prev').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};$('add').onclick=$('addSelected').onclick=()=>openEditor();$('close').onclick=()=>$('editor').close();$('editMode').onchange=toggleScoring;
 for(const id of ['price','time','coop'])$(id).oninput=updateLiveScore;
 $('ratingForm').onsubmit=e=>{
  e.preventDefault();try{
   const company=companies.find(c=>c.id===$('editCompany').value),record={id:$('editId').value||crypto.randomUUID(),companyId:company.id,company:company.name,channel:$('editChannel').value,mode:$('editMode').value};
   for(const id of ['shipment','operator','shipped','finished','note'])record[id]=Domain.clean($(id).value);
   if(record.mode==='rated'){for(const id of ['price','time','coop'])record[id]=Domain.score($(id).value);}else record.note='';
   records=V.simulateRatingSave(records,record,next=>Domain.ratings(next,today()));selected=company.id;$('month').value=record.finished.slice(0,7);
   if(!$('month').value){const option=document.createElement('option');option.value=record.finished.slice(0,7);option.textContent=record.finished.slice(0,7);$('month').appendChild(option);$('month').value=option.value;}
   resetFilters();render();$('editor').close();$('toast').textContent='已在演示中更新：本票独立保存，公司均分按全部已评价票重新计算。';$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',4500);
  }catch(err){$('formError').textContent=err.message==='重复合作记录'?'这家公司已有相同单号，请回到原记录编辑，避免重复计分。':err.message;}
 };
 Domain.ratings(records,'2026-10-24');render();
})();

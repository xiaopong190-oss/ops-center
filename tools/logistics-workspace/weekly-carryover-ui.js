(function(){'use strict';
 const W=window.WeeklyCarryover;if(!W||!window.ComparisonStore||!document.getElementById('comparisonPanel'))return;
 const params=new URLSearchParams(location.search),editable=params.get('audience')!=='display'&&params.get('access')!=='view',publicView=params.get('presentation')==='public',day=()=>window.DisplayBusinessDate?.day(new Date(),new URLSearchParams(location.search).get('audience'))||new Date().toLocaleDateString('sv-SE');
 const ackKey='hangxu-weekly-reminder-confirmed-v1';
 const box=document.createElement('section');box.id='weekly-carryover-panel';box.className='notice';const status=document.createElement('span');status.setAttribute('role','status');box.append(status);
 const button=document.createElement('button');button.id='weekly-carryover-open';button.textContent='套用上周报价';button.type='button';if(editable)box.append(button);document.getElementById('comparisonPanel').before(box);
 const dialog=document.createElement('dialog');dialog.id='weekly-carryover-dialog';dialog.setAttribute('aria-labelledby','weekly-carryover-title');dialog.innerHTML='<h2 id="weekly-carryover-title">新的一周，是否沿用上周报价？</h2><p data-week-summary></p><p>原始报价日期不改。本周没有新报价的服务商可暂时沿用；同一服务商的新报价通过校验并确认入库后，自动替换其旧报价与沿用数据。仅选择服务商、取消或失败不会覆盖。</p><p>本次沿用仅本周有效，不会把更早的沿用数据自动滚到下一周。仅套用本机仍保留的上周报价；未自动续期已清理的数据。保存后点击「发布展示快照」，线上和其他电脑可查看本周沿用结果。</p><p data-week-error role="alert"></p><button type="button" data-week-refresh>重新核对</button> <button type="button" data-week-keep>沿用上周报价</button> <button type="button" data-week-skip>本周不沿用</button>';document.body.append(dialog);let planned=null,plannedDay='',promptedWeek='',sharedWeek='',checking=false,nextCheck=0,autoOpen=false,ask=false,busy=false,queued=false,lastDB=null,lastDay='';
 const update=(node,text)=>{if(node.textContent!==text)node.textContent=text};
 function show(automatic=false){if(!editable||busy)return;if(window.WorkspaceSnapshot?.isBusy()||document.documentElement.hasAttribute('data-hangxu-dirty')){update(status,'请先完成当前导入或上传，再套用上周报价。');return;}
  try{planned=ComparisonStore.read();plannedDay=day();const c=W.candidates(planned,plannedDay);update(dialog.querySelector('[data-week-summary]'),'上周 '+c.previousStart+' 至 '+c.previousEnd+'：仓库报价 '+c.quotes.length+' 条，区域报价 '+c.regionalQuotes.length+' 条。是否保留供本周使用？');update(dialog.querySelector('[data-week-error]'),'');dialog.querySelector('[data-week-keep]').disabled=c.quotes.length+c.regionalQuotes.length===0;if(!dialog.open){dialog.showModal();autoOpen=automatic;}promptedWeek=c.start;}catch(error){update(status,error.message)}
 }
 async function save(choice){if(!planned||busy)return;busy=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{await Domain.withWriteLock(async()=>{if(window.WorkspaceSnapshot?.isBusy()||document.documentElement.hasAttribute('data-hangxu-dirty'))throw Error('请先完成当前导入或上传，再确认沿用');const today=day();if(plannedDay!==today)throw Error('日期已变化，请重新核对沿用范围');const base=ComparisonStore.read(),comparable=value=>JSON.stringify({...value,quoteDataQuality:undefined});if(planned!==base&&comparable(planned)!==comparable(base))throw Error('报价已变化，请点“重新核对”，未覆盖原数据');const next=W.choose(base,today,choice);ComparisonStore.commit(next);try{await window.LocalQuoteStore?.flush();if(window.LocalQuoteStore?.error())throw Error('本机保存未确认')}catch(error){ComparisonStore.commit(base);try{await window.LocalQuoteStore?.flush()}catch{}throw error}});planned=null;nextCheck=0;dialog.close();document.dispatchEvent(new Event('weekly-carryover-changed'));check();}catch(error){update(dialog.querySelector('[data-week-error]'),error.message+'；原始报价保留。');}finally{busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);check()}
 }
 dialog.querySelector('[data-week-refresh]').onclick=()=>show();dialog.querySelector('[data-week-keep]').onclick=()=>save('keep');dialog.querySelector('[data-week-skip]').onclick=()=>save('skip');dialog.addEventListener('cancel',e=>{e.preventDefault();if(!busy){planned=null;dialog.close()}});button.onclick=()=>show();
 function check(){if(busy)return;try{const db=ComparisonStore.read(),today=day();if(lastDB!==db||lastDay!==today){lastDB=db;lastDay=today;const effective=W.effective(db,today),count=effective.carriedQuotes.length+effective.carriedRegions.length;box.hidden=!editable&&!count;
  update(status,count?(publicView?'含沿用上周报价，日期与原表一致。':'本周沿用上周：仓库报价 '+effective.carriedQuotes.length+' 条、区域报价 '+effective.carriedRegions.length+' 条；服务商：'+effective.providers.join('、')+'。原始日期保留；新报价确认入库后按服务商替换。'):'本周尚未沿用上周报价。');
  ask=editable&&W.shouldAsk(db,today);}
  if(editable&&document.visibilityState!=='hidden'){
   const week=W.weeks(today).start,decided=db.weeklyCarryover?.weekStart===week;
   const acknowledged=sharedWeek===week||localStorage.getItem(ackKey)===week;
   if(!acknowledged&&(ask||decided))void checkShared(today,week,decided);
   else if(acknowledged&&autoOpen&&dialog.open){planned=null;dialog.close();}
  }
 }catch(error){box.hidden=false;update(status,'沿用记录需要核对：'+error.message)}}
 async function checkShared(today,week,confirm){
  const api=window.WorkspaceSnapshot;if(checking||Date.now()<nextCheck||!api?.weeklyReminder||api.isBusy())return;
  if(!confirm&&promptedWeek!==today&&document.querySelector('dialog[open]'))return;
  checking=true;nextCheck=Date.now()+60000;
  try{
   const result=await api.weeklyReminder(week,confirm);
   if(result.confirmed){
    sharedWeek=week;localStorage.setItem(ackKey,week);
    if(autoOpen&&dialog.open&&!busy){planned=null;dialog.close();}
   }else if(day()===today&&ask&&!busy&&promptedWeek!==today&&!document.querySelector('dialog[open]')&&document.visibilityState!=='hidden'){
    show(true);
   }
  }catch{
   if(confirm)update(status,'本机选择已保存，团队确认待联网同步。');
  }finally{
   checking=false;
   if(!confirm&&nextCheck===0)check();
  }
 }
 const observer=new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;check()})}});observer.observe(document.getElementById('quoteCount'),{childList:true});
 const timer=setInterval(check,60000);addEventListener('focus',check);document.addEventListener('visibilitychange',check);addEventListener('pagehide',()=>{observer.disconnect();clearInterval(timer)},{once:true});check();
})();

(function(){
 'use strict';
 if(document.documentElement.dataset.entry==='display')return;
 const button=document.createElement('button');button.textContent='发布任务';button.id='publication-tasks-toggle';document.querySelector('.top')?.append(button);
 const panel=document.createElement('dialog');panel.id='publication-tasks';panel.setAttribute('aria-label','发布任务');panel.style.cssText='width:min(760px,94vw);max-height:80vh;overflow:auto;padding:22px;border:1px solid #dce3ed;border-radius:12px';
 const title=document.createElement('h2');title.textContent='本账号发布任务';
 const intro=document.createElement('p');intro.textContent='本机保存后可恢复；云端收齐并接管后，关闭电脑不影响后台继续。历史成功和当前是否被替代分别记录。';
 const actions=document.createElement('p'),refresh=document.createElement('button'),close=document.createElement('button'),status=document.createElement('p'),list=document.createElement('div');
 refresh.textContent='刷新状态';close.textContent='关闭';status.setAttribute('role','status');actions.append(refresh,close);panel.append(title,intro,actions,status,list);document.body.append(panel);
 const states={LOCAL_SAVED:'本机已保存',CLOUD_RECEIVED:'云端已收齐，核验排队中',CLOUD_ACCEPTED:'内容已核验',QUEUED:'后台排队',RUNNING:'后台处理中',GITHUB_COMMITTING:'正在提交，结果待核对',GITHUB_COMMITTED:'已提交，展示同步中',QUERY_VERIFYING:'正在核验展示',SUCCEEDED:'发布成功，展示已核验',ARCHIVED:'已存档，本批当前不展示',SUPERSEDED:'已被后续批次替代',CANCELLED:'已取消',AUTH_REQUIRED:'需要重新授权',BLOCKED_VALIDATION:'校验受阻，原批次保留',RETRY_WAIT:'等待自动重试'};
 const terminal=new Set(['SUCCEEDED','ARCHIVED','SUPERSEDED','CANCELLED','BLOCKED_VALIDATION']);let loading=false,timer;
 async function request(action,id,local=false){
  const token=localStorage.getItem('ops-cloud-session-v1');if(!token)throw Error('请先登录');
  const desktop=location.hostname==='127.0.0.1';
  const url=local?'/local-publication':desktop?'/local-workspace':'https://ops-center-cloud.xiaopong190-asin-radar.workers.dev/api/logistics-workspace';
  const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action,id}),signal:AbortSignal.timeout(30000)});
  let value;try{value=await r.json()}catch{throw Error('任务状态响应无效，原任务保留');}if(!r.ok)throw Error(value.error||'任务状态暂不可用');return value;
 }
 function actionButton(text,fn){const b=document.createElement('button');b.textContent=text;b.onclick=async()=>{b.disabled=true;try{await fn();await load()}catch(e){status.textContent=e.message}finally{b.disabled=false}};return b;}
 function render(job){
  const card=document.createElement('section');card.dataset.publicationId=job.id;card.style.cssText='border-top:1px solid #e3e8f0;padding:12px 0';
  const state=document.createElement('strong');state.textContent=states[job.state]||job.state;
  const text=document.createElement('p');text.textContent=(job.phase||'')+(job.reason?' · '+job.reason:'');
  const time=document.createElement('p');time.textContent='本机确认：'+new Date(job.confirmedAt).toLocaleString()+(job.nextAttemptAt?' · 下次尝试：'+new Date(job.nextAttemptAt).toLocaleString():'');card.append(state,text,time);
  if(!terminal.has(job.state)&&!job.commit&&job.state!=='GITHUB_COMMITTING')card.append(actionButton('取消任务',()=>request(job.localOnly?'cancel':'publication-cancel',job.id,job.localOnly)));
  if(job.state==='AUTH_REQUIRED')card.append(actionButton('已重新登录，恢复原任务',()=>request(job.localOnly?'continue':'publication-resume',job.id,job.localOnly)));
  if(['SUCCEEDED','ARCHIVED'].includes(job.state)&&job.receipt){
   const view=document.createElement('a');view.textContent=job.supersededBy?'查看当前报价':'查看线上报价';
   const scope=job.scopes?.find(s=>s.includes('\u0000'))?.split('\u0000');
   view.href='https://xiaopong190-oss.github.io/ops-center/tools/logistics-workspace/display.html?route=compare&publication='+encodeURIComponent(job.id)+'&publicationProvider='+encodeURIComponent(scope?.[0]||'')+'&publicationType='+encodeURIComponent(scope?.[1]||'quotes')+'&publicationSource='+encodeURIComponent(job.receipt.sha);view.target='_blank';view.rel='noopener';card.append(view);
  }
  const detail=document.createElement('details'),summary=document.createElement('summary'),proof=document.createElement('p');summary.textContent='任务与版本证据';proof.textContent='任务 '+job.id+(job.receipt?' · 根版本 '+job.receipt.sha+' · 核验业务日 '+(job.receipt.businessDay||''):'')+(job.supersededBy?' · 已有后续版本':'');detail.append(summary,proof);card.append(detail);return card;
 }
 async function load(){
  if(loading)return;loading=true;refresh.disabled=true;status.textContent='正在读取原任务，不会重新发布…';
  try{
   let jobs=[],warning='';
   if(location.hostname==='127.0.0.1'){try{const local=await request('list',undefined,true);jobs=local.jobs.map(job=>({...job,localOnly:true}));}catch(e){warning=e.message;}}
   try{const cloud=await request('publication-list'),merged=new Map(jobs.map(j=>[j.id,j]));for(const job of cloud.jobs)merged.set(job.id,job);jobs=[...merged.values()];}catch(e){if(!jobs.length)throw e;warning=e.message;}
   jobs.sort((a,b)=>b.confirmedAt-a.confirmedAt||a.id.localeCompare(b.id));list.replaceChildren(...jobs.map(render));
   status.textContent=(jobs.length?'已核对 '+jobs.length+' 个任务':'暂无接管任务；尚未传完的批次保存在本机。')+(warning?' · '+warning:'');clearTimeout(timer);if(panel.open&&jobs.some(j=>!terminal.has(j.state)))timer=setTimeout(load,30000);
  }catch(e){status.textContent=e.message;}finally{loading=false;refresh.disabled=false;}
 }
 button.onclick=()=>{panel.showModal();load()};refresh.onclick=load;close.onclick=()=>panel.close();panel.addEventListener('close',()=>clearTimeout(timer));
 // Opening the authenticated desktop resumes only already-confirmed packages.
 // No new task or new confirmation timestamp is created during startup.
 if(location.hostname==='127.0.0.1'&&localStorage.getItem('ops-cloud-session-v1'))request('continue',undefined,true).catch(()=>{});
})();

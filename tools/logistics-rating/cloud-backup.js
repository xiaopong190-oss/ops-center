(function(root){
 'use strict';if(root.LogisticsSpace?.isDemo){root.CloudBackup={queue(){}};return;}
 const box=document.createElement('div');box.className='notice';box.style.cssText='margin:12px 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap';const status=document.createElement('span'),submit=document.createElement('button'),refresh=document.createElement('button');status.setAttribute('role','status');submit.textContent='提交/重试GitHub';refresh.textContent='加载GitHub最新数据';box.append(status,submit,refresh);(document.querySelector('main')||document.body).prepend(box);let timer=null,running=false,again=false;
 function show(s){status.textContent=s;}
 async function sync(){if(running){again=true;return;}running=true;submit.disabled=true;try{show('正在提交GitHub，尚未确认入库…');const receipt=await GithubData.save(show);show('入库成功 · 已上传GitHub · '+new Date(receipt.savedAt).toLocaleString()+' · 文件版本 '+receipt.sha.slice(0,8));}catch(e){show('未确认GitHub入库：'+e.message+'。本机待提交数据保留。');}finally{running=false;submit.disabled=false;if(again){again=false;queue();}}}
 function queue(){if(GithubData.state().conflict){show(GithubData.state().error);return;}GithubData.markPending();show('本机待提交，正在准备上传GitHub…');clearTimeout(timer);timer=setTimeout(()=>navigator.locks?.request?navigator.locks.request('logistics-github-write-v1',sync):sync(),600);}
 submit.onclick=queue;refresh.onclick=async()=>{if(GithubData.hasPending()&&!confirm('当前本机有未提交数据。加载GitHub数据会暂存当前草稿并切换到GitHub版本，是否继续？'))return;show('正在读取GitHub…');const result=await GithubData.load(true);if(!result.loaded){show(result.error);return;}root.location.reload();};root.CloudBackup={queue};const current=GithubData.state();show(current.error||(current.loaded?'当前数据来自GitHub · 确认提交成功后才算入库':'未连接GitHub'));submit.hidden=!GithubData.hasPending();
 root.addEventListener?.('logistics-cache-error',e=>show(e.detail));const normalQueue=queue;root.CloudBackup.queue=()=>{submit.hidden=false;normalQueue();};
 if(current.conflict){submit.disabled=true;refresh.textContent='暂存本机草稿并加载云端报价';}
 const archived=typeof localStorage==='undefined'?null:localStorage.getItem('logistics-github-unsent-draft-v1');
 if(current.conflict||archived){
  const backup=document.createElement('button');backup.textContent='导出本机及暂存草稿';box.append(backup);
  backup.onclick=()=>{try{
   const data={...GithubData.snapshot(),exportedAt:new Date().toISOString(),...(archived?{previousDraft:JSON.parse(archived)}:{})};
   const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='报价同步前草稿备份_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){show('草稿导出失败：'+e.message);}};
  if(archived&&!current.conflict)show((current.error||'当前数据来自GitHub')+' · 切换前本机草稿已单独保留，可导出核对');
 }
})(window);

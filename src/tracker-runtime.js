let trackerContext = {user:null,canEdit:false};
let trackerAdapter;
let trackerGeneration = 0;
let trackerCloudOnly=false,trackerSyncState={},trackerReadError='';
let trackerJournalQueue=Promise.resolve(),trackerAttempt='',trackerJournalFailure=null;
const trackerBackupDb = new Promise((resolve,reject) => {
  const req = indexedDB.open('ops-tracker-safety-backups-v1',1);
  req.onupgradeneeded = () => {
    if(!req.result.objectStoreNames.contains('snapshots'))req.result.createObjectStore('snapshots');
  };
  req.onsuccess = () => {req.result.onversionchange=()=>req.result.close();resolve(req.result);};
  req.onerror = () => reject(Error('无法创建本机备份，请允许浏览器存储后重试'));
  req.onblocked = () => reject(Error('备份库被旧页面占用，请刷新旧页面后重试'));
});
trackerBackupDb.catch(() => {});
const trackerDraftStorage = new Promise((resolve,reject)=>{
  const request=indexedDB.open('ops-tracker-personal-drafts-v1',2);
  request.onupgradeneeded=()=>{
    if(!request.result.objectStoreNames.contains('drafts'))request.result.createObjectStore('drafts');
    if(!request.result.objectStoreNames.contains('journal'))request.result.createObjectStore('journal',{keyPath:'id'}).createIndex('userId','userId');
  };
  request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
  request.onerror=request.onblocked=()=>reject(Error('个人草稿库不可用，请允许浏览器存储后重试'));
});
trackerDraftStorage.catch(()=>{});
function trackerAudit(stage,details={}){
  if(stage==='save_clicked')trackerJournalFailure=null;
  if(trackerJournalFailure)return Promise.reject(trackerJournalFailure);
  const user=trackerContext.user;if(!user?.id)return Promise.resolve();
  const record={id:Date.now().toString().padStart(16,'0')+'-'+crypto.randomUUID(),userId:user.id,actor:user.name||'',at:new Date().toISOString(),attempt:trackerAttempt,stage,details};
  const task=trackerJournalQueue.catch(()=>{}).then(async()=>{
    const database=await trackerDraftStorage;
    await new Promise((resolve,reject)=>{const tx=database.transaction('journal','readwrite'),store=tx.objectStore('journal');store.put(record);const keys=store.index('userId').getAllKeys(user.id);keys.onsuccess=()=>{for(const key of keys.result.slice(0,Math.max(0,keys.result.length-5000)))store.delete(key);};tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(Error('上传日志无法保存，未确认成功，请检查浏览器存储'));});
  });const durable=task.catch(error=>{trackerJournalFailure=error;throw error;});trackerJournalQueue=durable;return durable;
}
window.recordOpsFollowupUploadProgress=detail=>{
  if(!detail||!['checking','uploading','verifying','complete','paused'].includes(detail.phase))return Promise.resolve();
  return trackerAudit('transport_'+detail.phase,{completed:detail.completed,total:detail.total});
};
async function trackerBackup(value,userId) {
  const database = await trackerBackupDb;
  await new Promise((resolve,reject) => {
    const tx = database.transaction('snapshots','readwrite');
    tx.objectStore('snapshots').put(value,userId + ':' + value.revision);
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = () => reject(Error('完整快照备份失败，未修改云端数据'));
  });
}
function localDb() {
  const draftStore={
    async load(userId){const database=await trackerDraftStorage;return new Promise((resolve,reject)=>{
      const request=database.transaction('drafts','readonly').objectStore('drafts').get(userId);
      request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(Error('个人草稿读取失败，请重试'));
    });},
    async save(userId,operations){const database=await trackerDraftStorage;return new Promise((resolve,reject)=>{
      const tx=database.transaction('drafts','readwrite');tx.objectStore('drafts').put(operations,userId);
      tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(Error('本账号草稿暂存失败，未覆盖云端数据'));
    });},
  };
  const cloud=createTrackerCloudDb({context:() => trackerContext,backup:trackerBackup,notify:toast,audit:trackerAudit});
  trackerAdapter=createTrackerDraftDb({context:()=>trackerContext,cloud,store:draftStore,
    onState:status=>{if(status.lastReceipt&&status.lastReceipt!==trackerSyncState.lastReceipt)trackerReadError='';trackerSyncState=status;trackerCloudOnly=!!status.cloudOnly;trackerContext.onSyncState?.(status);trackerStatus();},notify:toast,audit:trackerAudit});
  return trackerAdapter;
}
window.saveOpsFollowup=async()=>{
  trackerAttempt=crypto.randomUUID();
  try{
  await trackerAudit('save_clicked');
  const control=document.activeElement;
  if(control?.matches?.('#app [data-f],#app [data-sf],#app [data-pf],#app [data-front]')){
    const error=validateTrackerControl(control);if(error)throw Error(error);
    let row,path;
    if(control.dataset.sf){row=state.ships.find(row=>row.id===control.dataset.sf);path=control.dataset.sp;}
    else if(control.dataset.pf){row=state.perf.find(row=>row.id===control.dataset.pf);path=control.dataset.field;}
    else{row=state.links.find(row=>row.id===state.sel);path=control.dataset.f||'content.frontUrl';}
    const value=control.type==='checkbox'?control.checked:control.type==='number'?(control.value===''?null:Number(control.value)):control.value.trim();
    if(row&&JSON.stringify(getPath(row,path))!==JSON.stringify(value))control.dispatchEvent(new Event('change',{bubbles:true}));
    if(!control.checkValidity())throw Error(control.validationMessage);
  }
  return await trackerAdapter.save();
  }catch(error){trackerReadError='上传未确认：'+error.message;trackerStatus();try{await trackerAudit('save_rejected',{message:error.message,status:error.status||null});}catch{}throw error;}
};
window.reloadOpsFollowup=options=>trackerAdapter.refresh(options);
function trackerStatus(message) {
  if(message)trackerReadError=/失败|未同步|旧数据|请先登录/.test(message)?message:'';
  let status = document.getElementById('tracker-cloud-status');
  if (!status) {
    status = document.createElement('div');status.id='tracker-cloud-status';
    status.style.cssText='padding:10px 14px;margin-bottom:12px;border:1px solid var(--line);border-radius:8px;color:var(--fg2);display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12px';
    document.body.prepend(status);
    const text=document.createElement('span');text.id='tracker-sync-message';text.setAttribute('role','status');text.setAttribute('aria-live','polite');status.append(text);
    const revision=document.createElement('input');revision.id='tracker-expected-revision';revision.type='number';revision.min='0';revision.step='1';revision.placeholder='输入上传凭证版本';revision.setAttribute('aria-label','会议核对版本');revision.className='in';revision.style.cssText='width:150px;height:30px';status.append(revision);
    const meeting=document.createElement('button');meeting.id='tracker-meeting-check';meeting.className='btn';meeting.textContent='会议核对云端';
    meeting.onclick=async()=>{
      meeting.disabled=true;
      try{
        const minimum=revision.value===''?null:Number(revision.value);
        if(minimum!==null&&(!Number.isSafeInteger(minimum)||minimum<0))throw Error('请输入有效版本号');
        const result=await trackerAdapter.setCloudOnly(true);
        state.f={owner:'',site:''};state.me=trackerContext.user?{id:trackerContext.user.id,isOwner:false}:null;state.live=true;render();
        if(minimum!==null&&result.revision<minimum)throw Error('当前云端 V'+result.revision+' 低于上传凭证 V'+minimum+'，尚未核对成功');
        await trackerAudit('meeting_verified',{revision:result.revision,expectedRevision:minimum});
        trackerReadError='';trackerStatus();toast('已读取云端 V'+result.revision+' · 全部运营 / 全部站点');
      }catch(error){trackerReadError=error.message;try{await trackerAudit('meeting_failed',{message:error.message});}catch{}trackerStatus();toast(error.message);}finally{meeting.disabled=false;}
    };status.append(meeting);
    const edit=document.createElement('button');edit.id='tracker-return-edit';edit.className='btn';edit.textContent='返回编辑';edit.onclick=async()=>{try{await trackerAdapter.setCloudOnly(false);trackerReadError='';state.me=trackerContext.user?{id:trackerContext.user.id,isOwner:!!trackerContext.canEdit}:null;render();trackerStatus();}catch(error){trackerReadError=error.message;trackerStatus();}};status.append(edit);
    const journal=document.createElement('button');journal.id='tracker-upload-journal';journal.className='btn';journal.textContent='上传日志';journal.onclick=()=>showTrackerJournal().catch(error=>toast(error.message));status.append(journal);
  }
  const meta=trackerSyncState.meta,pending=trackerSyncState.pendingCount||0;
  status.querySelector('#tracker-sync-message').textContent=trackerReadError||trackerSyncState.error||((trackerCloudOnly?'会议云端视图':'编辑视图')+' · '+(meta?'云端 V'+meta.revision+' · '+trackerSyncState.linkCount+' 条链接 · '+(meta.updatedBy||''):'尚未读取云端')+(pending?' · 本机另有 '+pending+' 项草稿':'')+(trackerSyncState.lastReceipt?' · 最近上传已回读 V'+trackerSyncState.lastReceipt.savedRevision:''));
  status.querySelector('#tracker-return-edit').hidden=!trackerCloudOnly;
  status.querySelector('#tracker-sync-message').title=meta?.updatedAt?'云端最后修改：'+meta.updatedAt:'';
}
async function showTrackerJournal(){
  await trackerJournalQueue.catch(()=>{});
  const userId=trackerContext.user?.id;if(!userId)throw Error('请先登录');
  const database=await trackerDraftStorage,rows=await new Promise((resolve,reject)=>{const r=database.transaction('journal','readonly').objectStore('journal').index('userId').getAll(userId);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('日志读取失败'));});
  if(trackerContext.user?.id!==userId)return;
  document.getElementById('tracker-journal-dialog')?.remove();
  const panel=document.createElement('section');panel.id='tracker-journal-dialog';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','上传日志');panel.style.cssText='position:fixed;inset:5%;z-index:1000;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:10px;padding:18px;overflow:auto';
  const heading=document.createElement('h2');heading.textContent='上传日志 · '+(trackerContext.user.name||'');panel.append(heading);
  const close=document.createElement('button');close.className='btn';close.textContent='关闭';close.onclick=()=>panel.remove();panel.append(close);
  const exportButton=document.createElement('button');exportButton.className='btn';exportButton.textContent='导出本机上传日志';exportButton.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({userId,exportedAt:new Date().toISOString(),entries:rows},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='新品上传日志.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};panel.append(exportButton);
  const labels={save_clicked:'点击保存',save_rejected:'保存未成功/校验失败',upload_started:'开始上传',cloud_read_started:'读取云端基线',cloud_read_complete:'基线读取完成',backup_complete:'本机备份完成',submit_started:'提交修改',submit_acknowledged:'收到提交回执',readback_started:'独立云端回读',readback_verified:'交叉核验通过',upload_success:'已上传成功（回读通过）',upload_failed:'上传未确认/失败',attempt_failed:'本次尝试失败',no_pending_changes:'没有待上传修改',meeting_verified:'会议核对通过',meeting_failed:'会议核对失败',transport_checking:'检查断点',transport_uploading:'分片上传进度',transport_verifying:'分片提交校验',transport_complete:'提交回执已收到（等待独立回读）',transport_paused:'上传暂停'};
  const description=document.createElement('p');description.textContent='本机过程日志按账号保留最近 5000 条，显示最近 300 条；断网失败仅保存在本机。下方云端操作记录可在其他电脑读取。';panel.append(description);
  for(const row of rows.slice(-300).reverse()){const line=document.createElement('pre');line.style.cssText='white-space:pre-wrap;border-bottom:1px solid var(--line);padding:6px 0';line.textContent=row.at+' · '+(labels[row.stage]||row.stage)+'\n'+JSON.stringify(row.details);panel.append(line);}
  const headingCloud=document.createElement('h3');headingCloud.textContent='云端已保存修改 · V'+(trackerAdapter._snapshot()?.revision??'未读取');panel.append(headingCloud);
  for(const event of (trackerAdapter._snapshot()?.data.events||[]).filter(event=>event.actor_id===userId||trackerContext.user.auth==='super').slice(0,100)){const line=document.createElement('p');line.textContent=(event.created_at||'')+' · '+event.actor+' · '+event.action+' · 操作编号 '+event.id;panel.append(line);}
  document.body.append(panel);
}
window.setOpsFollowupContext = async function(context) {
  const previous = trackerContext;
  trackerContext = context;
  if(previous.user?.id!==context.user?.id)trackerAdapter?.clear();
  state.me = context.user ? {id:context.user.id,isOwner:!!context.canEdit&&!trackerCloudOnly} : null;
  if (context.user) state.names[context.user.id] = context.user.name;
  if (!context.user?.id || context.user.id === 'guest') {
    trackerGeneration++;trackerAdapter?.clear();state.live=false;state.loaded=true;render();
    trackerStatus('请先登录运营中心；原版数据仍保留。');return;
  }
  if (previous.user?.id !== context.user.id || context.active && !previous.active || previous.autoShare !== context.autoShare) {
    const generation = ++trackerGeneration;
    try {
      await trackerAdapter.refresh();
      if (generation !== trackerGeneration) return;
      state.loaded=true;state.live=true;render();
      trackerStatus('共享库已连接 · 沿用个人暂存 / 自动分享设置 · 修改历史保留 · 大数据自动分片上传');
    } catch(error) {
      if (generation !== trackerGeneration) return;
      state.live=false;state.loaded=true;render();trackerStatus('共享库连接失败：'+error.message+'；未改写数据。');
    }
  }
};
document.addEventListener('change',event=>{
  const control=event.target;
  if(!control.matches?.('#app input,#app select,#app textarea'))return;
  if(control.hasAttribute('data-import')&&control.files?.[0]?.size>16*1024*1024){event.stopImmediatePropagation();toast('导入文件超过 16MB，请拆分后重试');return;}
  if((!trackerContext.canEdit||trackerCloudOnly)&&!control.dataset.filter){
    event.stopImmediatePropagation();toast('当前帐号仅可查看，未保存');return;
  }
  const error=validateTrackerControl(control);control.setCustomValidity(error);
  if(error){event.stopImmediatePropagation();toast(error);}
},true);
document.addEventListener('submit',event => {
  if (!trackerContext.canEdit||trackerCloudOnly) {event.preventDefault();event.stopImmediatePropagation();toast('当前视图仅可查看');}
  else{
    for(const control of event.target.querySelectorAll('input,select,textarea')){
      const error=validateTrackerControl(control);control.setCustomValidity(error);
      if(error||!control.checkValidity()){event.preventDefault();event.stopImmediatePropagation();toast(error||'请检查必填项与输入格式');return;}
    }
    const from=event.target.elements.namedItem('from')?.value,to=event.target.elements.namedItem('to')?.value;
    if(from&&to&&to<from){event.preventDefault();event.stopImmediatePropagation();toast('结束日期不能早于起始日期');}
  }
},true);
setInterval(() => {
  if (trackerContext.active && trackerContext.user?.id && !document.querySelector('input:focus,textarea:focus,select:focus')) {
    trackerAdapter?.refresh().catch(error => trackerStatus('同步失败：'+error.message+'；当前显示可能是旧数据'));
  }
},30000);

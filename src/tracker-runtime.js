let trackerContext = {user:null,canEdit:false};
let trackerAdapter;
let trackerGeneration = 0;
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
  const request=indexedDB.open('ops-tracker-personal-drafts-v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
  request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
  request.onerror=request.onblocked=()=>reject(Error('个人草稿库不可用，请允许浏览器存储后重试'));
});
trackerDraftStorage.catch(()=>{});
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
  const cloud=createTrackerCloudDb({context:() => trackerContext,backup:trackerBackup,notify:toast});
  trackerAdapter=createTrackerDraftDb({context:()=>trackerContext,cloud,store:draftStore,
    onState:status=>trackerContext.onSyncState?.(status),notify:toast});
  return trackerAdapter;
}
window.saveOpsFollowup=()=>trackerAdapter.save();
window.reloadOpsFollowup=options=>trackerAdapter.refresh(options);
function trackerStatus(message) {
  let status = document.getElementById('tracker-cloud-status');
  if (!status) {
    status = document.createElement('div');status.id='tracker-cloud-status';
    status.style.cssText='padding:10px 14px;margin-bottom:12px;border:1px solid var(--line);border-radius:8px;color:var(--fg2)';
    document.body.prepend(status);
  }
  status.replaceChildren(document.createTextNode(message + ' '));
  const backup = document.createElement('button');backup.className='btn';backup.textContent='导出完整备份（含原版记录）';
  backup.onclick = async () => {
    try {
      await trackerAdapter.refresh();
      const value = trackerAdapter._snapshot();
      if (!value) throw Error('请登录后重试');
      const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
      const anchor = document.createElement('a');anchor.href=url;anchor.download='新品跟进完整备份-'+new Date().toISOString().slice(0,10)+'.json';anchor.click();
      setTimeout(() => URL.revokeObjectURL(url),1000);
    } catch(error) { toast(error.message); }
  };
  status.append(backup);
}
window.setOpsFollowupContext = async function(context) {
  const previous = trackerContext;
  trackerContext = context;
  if(previous.user?.id!==context.user?.id)trackerAdapter?.clear();
  state.me = context.user ? {id:context.user.id,isOwner:!!context.canEdit} : null;
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
document.addEventListener('submit',event => {
  if (!trackerContext.canEdit) {event.preventDefault();event.stopImmediatePropagation();toast('当前帐号仅可查看');}
},true);
setInterval(() => {
  if (trackerContext.active && trackerContext.user?.id && !document.querySelector('input:focus,textarea:focus,select:focus')) {
    trackerAdapter?.refresh().catch(error => trackerStatus('同步失败：'+error.message+'；当前显示可能是旧数据'));
  }
},30000);

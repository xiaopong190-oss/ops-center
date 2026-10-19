let trackerContext = {user:null,canEdit:false};
let trackerAdapter;
let trackerGeneration = 0;
const trackerBackupDb = new Promise((resolve,reject) => {
  const req = indexedDB.open('ops-tracker-safety-backups-v1',1);
  req.onupgradeneeded = () => req.result.createObjectStore('snapshots');
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(Error('无法创建本机备份，请允许浏览器存储后重试'));
});
trackerBackupDb.catch(() => {});
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
  trackerAdapter = createTrackerCloudDb({context:() => trackerContext,backup:trackerBackup,notify:toast});
  return trackerAdapter;
}
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
  state.me = context.user ? {id:context.user.id,isOwner:!!context.canEdit} : null;
  if (context.user) state.names[context.user.id] = context.user.name;
  if (!context.user?.id || context.user.id === 'guest') {
    trackerGeneration++;trackerAdapter?.clear();state.live=false;state.loaded=true;render();
    trackerStatus('请先登录运营中心；原版数据仍保留。');return;
  }
  if (previous.user?.id !== context.user.id || context.active && !previous.active) {
    const generation = ++trackerGeneration;
    try {
      await trackerAdapter.refresh();
      if (generation !== trackerGeneration) return;
      state.loaded=true;state.live=true;render();
      trackerStatus('共享库已连接 · 保存前自动备份 · 原版记录完整保留 · 未分配站点的多店铺货件请在原版记录中查看');
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

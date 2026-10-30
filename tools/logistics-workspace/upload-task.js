// Separate from the business master: a frozen task survives page reloads and new cleaning.
(function(root){'use strict';
 function create(indexedDB,readTimeoutMs=20000){
  async function access(mode,session,value){
   if(!indexedDB)throw Error('浏览器不能保存续传任务，请使用普通浏览模式并允许本地存储');
   const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('workspace-upload-tasks-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('tasks');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('无法打开本地续传任务库'));req.onblocked=()=>reject(Error('续传任务库被其他页面占用，请关闭旧页面后重试'))});
   try{return await new Promise((resolve,reject)=>{const tx=db.transaction('tasks',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('tasks');let result;const req=mode==='get'?store.get(session):mode==='put'?store.put(value,session):store.delete(session);req.onsuccess=()=>{result=req.result};tx.oncomplete=()=>resolve(result||null);tx.onerror=tx.onabort=()=>reject(Error('本地续传任务未保存，未开始新的上传；请检查浏览器存储空间'))})}finally{db.close()}
  }
  async function load(session){let timeout;try{return await Promise.race([access('get',session),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('读取上次上传任务超时；请关闭其他航序页面后重试。本机数据和原上传任务均保留')),readTimeoutMs)})])}finally{clearTimeout(timeout)}}
  return {load,save:(session,value)=>access('put',session,value),remove:session=>access('delete',session)};
 }
 if(typeof module!=='undefined')module.exports={create};else root.WorkspaceUploadTasks=create(root.indexedDB);
})(typeof window==='undefined'?{}:window);

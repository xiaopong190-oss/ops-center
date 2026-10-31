// Immutable downloaded source, separate from business modules' working storage.
(function(root){'use strict';
 function create(indexedDB){
  async function access(mode,session,value){
   if(!indexedDB)throw Error('浏览器不支持展示快照缓存');
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('workspace-display-source-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('snapshots');r.onsuccess=()=>resolve(r.result);r.onerror=r.onblocked=()=>reject(Error('展示快照缓存无法打开'));});
   try{return await new Promise((resolve,reject)=>{const tx=db.transaction('snapshots',mode==='get'?'readonly':'readwrite'),s=tx.objectStore('snapshots');let result;const r=mode==='get'?s.get(session):s.put(value,session);r.onsuccess=()=>{result=r.result};tx.oncomplete=()=>resolve(result||null);tx.onerror=tx.onabort=()=>reject(Error('展示原件缓存保存失败，未确认更新完成'));})}finally{db.close()}
  }
  return {load:session=>access('get',session),save:(session,value)=>access('put',session,value)};
 }
 if(typeof module!=='undefined')module.exports={create};else root.WorkspaceDisplayCache=create(root.indexedDB);
})(typeof window==='undefined'?{}:window);

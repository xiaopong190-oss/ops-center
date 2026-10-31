// Immutable downloaded source, separate from business modules' working storage.
(function(root){'use strict';
 function create(indexedDB){
  async function access(mode,session,value){
   if(!indexedDB)throw Error('浏览器不支持展示快照缓存');
   const parts=['getPart','putPart','removeParts'].includes(mode),name=parts?'parts':'snapshots';
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(parts?'workspace-display-parts-v1':'workspace-display-source-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore(name);r.onsuccess=()=>resolve(r.result);r.onerror=r.onblocked=()=>reject(Error('展示快照缓存无法打开'));});
   try{return await new Promise((resolve,reject)=>{const read=mode==='get'||mode==='getPart',tx=db.transaction(name,read?'readonly':'readwrite'),s=tx.objectStore(name);let result;
    if(mode==='removeParts'){for(const hash of value)s.delete(session+':'+hash)}else{const r=read?s.get(session):s.put(value,session);r.onsuccess=()=>{result=r.result;if(mode==='putPart'){const keys=s.getAllKeys();keys.onsuccess=()=>{let excess=keys.result.length-128;for(const key of keys.result)if(excess>0&&key!==session){s.delete(key);excess--}}}}}
    tx.oncomplete=()=>resolve(result||null);tx.onerror=tx.onabort=()=>reject(Error('展示原件或下载批次缓存保存失败，未确认更新完成'));})}finally{db.close()}
  }
  return {load:session=>access('get',session),save:async(session,value,completedParts=[])=>{await access('put',session,value);if(completedParts.length)await access('removeParts',session,completedParts).catch(()=>{});},loadPart:(session,hash)=>access('getPart',session+':'+hash),savePart:(session,hash,bytes)=>access('putPart',session+':'+hash,bytes)};
 }
 if(typeof module!=='undefined')module.exports={create};if(root.indexedDB)root.WorkspaceDisplayCache=create(root.indexedDB);
})(typeof window==='undefined'?{}:window);

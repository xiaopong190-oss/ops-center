(function(root){
 'use strict';
 const handled=k=>k==='logistics-quotes-v1'||k==='logistics-demo-space-v1:logistics-quotes-v1'||k==='logistics-github-unsent-draft-v1'||k==='logistics-before-space-split-v1';
 function database(root){return new Promise((resolve,reject)=>{const req=root.indexedDB.open('logistics-large-cache-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('values');req.onerror=()=>reject(Error('报价缓存数据库无法打开，未继续载入'));req.onsuccess=()=>{const db=req.result;resolve({read:()=>new Promise((res,rej)=>{const tx=db.transaction('values','readonly'),st=tx.objectStore('values'),keys=st.getAllKeys(),values=st.getAll();tx.oncomplete=()=>res(new Map(keys.result.map((k,i)=>[k,values.result[i]])));tx.onerror=()=>rej(Error('读取报价缓存失败'));}),write:entries=>new Promise((res,rej)=>{const tx=db.transaction('values','readwrite'),st=tx.objectStore('values');for(const [k,v] of entries)v===null?st.delete(k):st.put(v,k);tx.oncomplete=res;tx.onerror=()=>rej(Error('报价缓存空间不足或写入失败，请保留原文件'));tx.onabort=tx.onerror;})});};});}
 async function install(root,backend){
  const native=root.localStorage,stored=await backend.read(),dirty=new Map();let error=null,flushing=null;
  for(let i=0;i<native.length;i++){const k=native.key(i);if(handled(k)&&!stored.has(k)){const value=native.getItem(k);stored.set(k,value);dirty.set(k,value);}}
  async function flush(){if(flushing){await flushing;if(dirty.size)return flush();return;}if(!dirty.size){if(error)throw error;return;}const entries=[...dirty];flushing=(async()=>{try{await backend.write(entries);for(const [k,v] of entries){if(dirty.get(k)===v)dirty.delete(k);native.removeItem(k);}error=null;native.setItem('logistics-large-cache-revision-v1',String(Date.now())+'-'+Math.random());}catch(e){error=e;throw e;}finally{flushing=null;}})();return flushing;}
  await flush();
  async function refresh(){await flush();const previous=new Map(stored),current=await backend.read();stored.clear();for(const entry of current)stored.set(...entry);for(const [k,v] of dirty)v===null?stored.delete(k):stored.set(k,v);return [...new Set([...previous.keys(),...stored.keys()])].filter(k=>previous.get(k)!==stored.get(k));}
  const schedule=()=>{Promise.resolve().then(flush).catch(()=>{if(root.dispatchEvent&&root.CustomEvent)root.dispatchEvent(new root.CustomEvent('logistics-cache-error',{detail:'报价缓存写入失败；请保留原Excel并重试，未确认云端保存。'}));});};
  const facade={getItem(k){k=String(k);return handled(k)?stored.get(k)??null:native.getItem(k);},setItem(k,v){k=String(k);v=String(v);if(!handled(k))return native.setItem(k,v);stored.set(k,v);dirty.set(k,v);schedule();},removeItem(k){k=String(k);if(!handled(k))return native.removeItem(k);stored.delete(k);dirty.set(k,null);schedule();},key(i){return [...new Set([...stored.keys(),...Array.from({length:native.length},(_,n)=>native.key(n))])][i]||null;},get length(){return new Set([...stored.keys(),...Array.from({length:native.length},(_,n)=>native.key(n))]).size;},clear(){for(const k of [...stored.keys()])this.removeItem(k);native.clear();}};
  Object.defineProperty(root,'localStorage',{configurable:true,value:facade});
  root.LocalQuoteStore={flush,refresh,error:()=>error};
  root.addEventListener?.('storage',event=>{if(event.key==='logistics-large-cache-revision-v1')refresh().then(changed=>{for(const key of changed)root.dispatchEvent(new root.StorageEvent('storage',{key}));}).catch(()=>{});});
  return root.LocalQuoteStore;
 }
 if(typeof module!=='undefined')module.exports={install,handled};
 if(root.document)root.LocalQuoteStoreReady=root.indexedDB?database(root).then(db=>install(root,db)):Promise.reject(Error('浏览器不支持大容量报价缓存，请使用支持IndexedDB的浏览器'));
})(typeof window!=='undefined'?window:globalThis);

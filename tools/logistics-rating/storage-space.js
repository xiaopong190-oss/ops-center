(function(root){
 'use strict';
 const keys=['logistics-company-directory-v1','logistics-quotes-v1','logistics-monthly-bills-v1','logistics-completed-ratings-v1','lrc-prototype-state-v1'],business=keys.slice(0,4),prefix='logistics-demo-space-v1:',native=root.localStorage;
 let mode=new URLSearchParams(root.location.search).get('space');
 if(!['real','demo'].includes(mode)){try{mode=root.parent!==root&&root.parent.LogisticsSpace?root.parent.LogisticsSpace.mode:root.sessionStorage.getItem('logistics-active-space-v1');}catch(e){} }
 mode=mode==='demo'?'demo':'real';root.sessionStorage.setItem('logistics-active-space-v1',mode);
 const map=k=>mode==='demo'&&keys.includes(k)?prefix+k:k;
 let legacy=null;
 if(mode==='real'){
  try{const raw=Object.fromEntries(business.map(k=>[k,native.getItem(k)])),values=business.map(k=>JSON.parse(raw[k]||'null'));
   const rows=[...(values[0]||[]),...(values[1]?.quotes||[]),...(values[1]?.regionalQuotes||[]),...(values[2]?.rows||[]),...(values[3]||[])];
   if(rows.some(r=>r.demo===true)){
    const archive='logistics-before-space-split-v1';if(!native.getItem(archive))native.setItem(archive,JSON.stringify({createdAt:new Date().toISOString(),data:raw}));
    const regionalQuotes=(values[1]?.regionalQuotes||[]).filter(r=>r.demo!==true),quotes=(values[1]?.quotes||[]).filter(r=>r.demo!==true),bills=(values[2]?.rows||[]).filter(r=>r.demo!==true),ratings=(values[3]||[]).filter(r=>r.demo!==true),refs=new Set([...quotes,...regionalQuotes,...bills,...ratings].map(r=>r.companyId));
    legacy=new Map();if(values[0])legacy.set(business[0],JSON.stringify(values[0].filter(c=>c.demo!==true||refs.has(c.id))));
    if(values[1]){const warehouseRefs=new Set(quotes.map(r=>JSON.stringify([r.country,r.warehouse])));legacy.set(business[1],JSON.stringify({...values[1],quotes,...(values[1].regionalQuotes?{regionalQuotes}:{}),templates:values[1].templates.filter(t=>t.demo!==true||warehouseRefs.has(JSON.stringify([t.country,t.warehouse])))}));}
    if(values[2])legacy.set(business[2],JSON.stringify({...values[2],rows:bills}));if(values[3])legacy.set(business[3],JSON.stringify(ratings));
   }
  }catch(e){throw Error('数据空间初始化失败，未继续写入；请先备份并检查本地存储。');}
 }
 const facade={getItem(k){k=String(k);return legacy?.has(k)?legacy.get(k):native.getItem(map(k));},setItem(k,v){k=String(k);native.setItem(map(k),String(v));legacy?.delete(k);},removeItem(k){k=String(k);native.removeItem(map(k));legacy?.delete(k);},clear(){for(const k of keys)this.removeItem(k);},key(i){return keys.filter(k=>this.getItem(k)!==null)[i]||null;},get length(){return keys.filter(k=>this.getItem(k)!==null).length;}};
 Object.defineProperty(root,'localStorage',{configurable:true,value:facade});
 const originalAdd=root.addEventListener.bind(root);root.addEventListener=function(type,listener,options){if(type!=='storage')return originalAdd(type,listener,options);return originalAdd(type,e=>{let k=e.key;if(k===null){listener.call(root,e);return;}if(mode==='demo'){if(!k.startsWith(prefix))return;k=k.slice(prefix.length);}else if(k.startsWith(prefix))return;legacy?.delete(k);listener.call(root,{key:k,newValue:e.newValue,oldValue:e.oldValue,url:e.url,storageArea:facade});},options);};
 root.LogisticsSpace={mode,isDemo:mode==='demo',switchTo(next){root.location.href='index.html?space='+(next==='demo'?'demo':'real')+'#/import';}};
})(window);

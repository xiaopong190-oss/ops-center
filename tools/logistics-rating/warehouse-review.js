(function(root){
 'use strict';const inflight=new Map(),cache=new Map(),key=x=>JSON.stringify([x.country,x.raw]);
 async function check(items){
  items=[...new Map(items.filter(x=>x.country&&x.raw).map(x=>[key(x),{country:x.country,raw:x.raw}])).values()];
  if(root.LogisticsSpace?.isDemo)return items.map(x=>({...x,status:'valid',codes:[x.raw],reason:'演示数据'}));
  const token=root.localStorage.getItem('ops-cloud-session-v1');
  const missing=items.filter(x=>!cache.has(key(x))&&!inflight.has(key(x)));
  for(let i=0;i<missing.length;i+=100){const batch=missing.slice(i,i+100);const task=(async()=>{
   if(!token)throw Error('请登录后核验，或按原表人工确认');
   const response=await root.fetch('https://ops-center-cloud.xiaopong190-asin-radar.workers.dev/api/logistics-ai/recognize',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({purpose:'warehouse-identity',exception:true,items:batch}),signal:AbortSignal.timeout(35000)});
   if(!response.ok)throw Error('后台核验未完成，请人工核对');const data=await response.json();
   if(!Array.isArray(data.items)||data.items.length!==batch.length)throw Error('仓库核验结果无效');
   const seen=new Set();for(const r of data.items){if(!batch.some(x=>key(x)===key(r))||seen.has(key(r))||!['valid','invalid','uncertain'].includes(r.status)||!Array.isArray(r.codes)||r.codes.some(c=>typeof c!=='string'||! /^(?:[A-Z]{2,5}[0-9]{1,3}|[A-Z]{4})$/.test(c))||r.codes.length&&r.codes.join('')!==r.raw.toUpperCase().replace(/[^A-Z0-9]/g,''))throw Error('仓库核验结果不匹配');seen.add(key(r));}for(const r of data.items)cache.set(key(r),r);
  })().catch(()=>{}).finally(()=>batch.forEach(x=>inflight.delete(key(x))));batch.forEach(x=>inflight.set(key(x),task));}
  await Promise.all(items.map(x=>inflight.get(key(x))));return items.map(x=>cache.get(key(x))||{...x,status:'uncertain',codes:[],reason:token?'后台核验未完成，请按原表人工核对':'未登录，需人工核对'});
 }
 root.WarehouseReview={check,typical:raw=>/^[A-Z]{3}[0-9]$/.test(raw)};
 if(typeof module!=='undefined')module.exports=root.WarehouseReview;
})(typeof window!=='undefined'?window:globalThis);

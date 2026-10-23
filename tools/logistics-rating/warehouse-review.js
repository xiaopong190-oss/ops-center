(function(root){
 'use strict';const inflight=new Map(),cache=new Map(),failures=new Map();let queue=Promise.resolve();const key=x=>JSON.stringify([x.country,x.raw]);
 async function check(items,onProgress=()=>{}){
  items=[...new Map(items.filter(x=>x.country&&x.raw).map(x=>[key(x),{country:x.country,raw:x.raw}])).values()];
  if(root.LogisticsSpace?.isDemo)return items.map(x=>({...x,status:'valid',codes:[x.raw],reason:'演示数据'}));
  const token=root.localStorage.getItem('ops-cloud-session-v1');
  const missing=items.filter(x=>!cache.has(key(x))&&!inflight.has(key(x)));
  for(let i=0;i<missing.length;i+=20){const batch=missing.slice(i,i+20);const task=queue.then(async()=>{
   if(!token)throw Error('请登录后核验，或按原表人工确认');
   const response=await root.fetch('https://ops-center-cloud.xiaopong190-asin-radar.workers.dev/api/logistics-ai/recognize',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({purpose:'warehouse-identity',exception:true,items:batch}),signal:AbortSignal.timeout(45000)});
   if(!response.ok){const messages={401:'登录已失效，请重新登录运营中心后重试',403:'当前账号无核验权限',429:'今日核验额度已用完，请稍后重试',502:'识别服务返回异常，请重试',503:'识别服务暂不可用，请重试',504:'识别服务响应超时，请重试'};let reason=messages[response.status]||('后台请求失败（HTTP '+(response.status||'未知')+'），请重试');if([502,503,504].includes(response.status)){try{const data=await response.json();if(typeof data.error==='string'&&data.error.length<150&&!/sk-|github_pat_|Bearer/i.test(data.error))reason=data.error;}catch(ignore){}}throw Error(reason);}const data=await response.json();
   if(!Array.isArray(data.items)||data.items.length!==batch.length)throw Error('仓库核验结果无效');
   const seen=new Set();for(const r of data.items){if(!batch.some(x=>key(x)===key(r))||seen.has(key(r))||!['valid','invalid','uncertain'].includes(r.status)||!Array.isArray(r.codes)||r.codes.some(c=>typeof c!=='string'||! /^(?:[A-Z]{2,5}[0-9]{1,3}|[A-Z]{4})$/.test(c))||r.codes.length&&r.codes.join('')!==r.raw.toUpperCase().replace(/[^A-Z0-9]/g,''))throw Error('仓库核验结果不匹配');seen.add(key(r));}for(const r of data.items){cache.set(key(r),r);failures.delete(key(r));}
  }).catch(error=>{const reason=['AbortError','TimeoutError'].includes(error?.name)?'核验响应超时，请重试':error instanceof TypeError||error?.name==='TypeError'?'网络连接失败，请检查网络后重试':error.message||'后台核验失败，请重试';batch.forEach(x=>failures.set(key(x),reason));}).finally(()=>{batch.forEach(x=>inflight.delete(key(x)));try{onProgress({completed:items.filter(x=>cache.has(key(x))).length,total:items.length,failed:items.filter(x=>failures.has(key(x))).length});}catch(ignore){}});queue=task;batch.forEach(x=>inflight.set(key(x),task));}
  await Promise.all(items.map(x=>inflight.get(key(x))));return items.map(x=>cache.get(key(x))||{...x,status:'uncertain',codes:[],retryable:true,reason:failures.get(key(x))||(token?'后台核验未完成，请重试':'未登录，请登录后重试')});
 }
 root.WarehouseReview={check,typical:raw=>/^[A-Z]{3}[0-9]$/.test(raw)};
 if(typeof module!=='undefined')module.exports=root.WarehouseReview;
})(typeof window!=='undefined'?window:globalThis);

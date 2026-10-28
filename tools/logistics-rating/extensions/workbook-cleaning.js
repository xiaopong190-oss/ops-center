(function(root){'use strict';
 const workerUrl=new URL('workbook-cleaning-worker.js?v=layout-1',document.currentScript.src).href;
 function run(model,meta,{signal,onProgress=()=>{},timeoutMs=120000}={}){return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(Error('本次清洗已取消，原文件与已保存数据保留'));
  if(typeof root.Worker!=='function')return reject(Error('当前环境无法启动后台清洗，请使用支持 Worker 的浏览器；未执行主线程清洗'));
  let worker,timer,tick,done=false;const start=Date.now();
  const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);clearInterval(tick);signal?.removeEventListener('abort',cancel);worker?.terminate();error?reject(error):resolve(result)};
  const cancel=()=>finish(Error('本次清洗已取消，原文件与已保存数据保留'));
  try{worker=new root.Worker(workerUrl);worker.onmessage=e=>e.data?.ok?finish(null,e.data.result):finish(Error(e.data?.error||'后台清洗失败'));worker.onerror=e=>{e.preventDefault?.();finish(Error('后台清洗线程异常：'+(e.message||'请重新选择文件重试')))};worker.onmessageerror=()=>finish(Error('后台清洗结果传输失败，请重试'));signal?.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>finish(Error('后台清洗超过 '+Math.round(timeoutMs/1000)+' 秒，已停止；请分批核对工作表后重试，未入库也未截断数据')),timeoutMs);tick=setInterval(()=>{try{onProgress({elapsedSeconds:Math.floor((Date.now()-start)/1000),sheets:model.sheets.length})}catch{}},1000);worker.postMessage({model,meta})}catch(error){finish(error)}
 })}
 async function runWithStatus(model,meta,status){const controller=new AbortController(),text=document.createElement('span'),cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消本次清洗';text.textContent='后台正在清洗 '+model.sheets.length+' 张工作表；尚未入库。';status.replaceChildren(text,document.createTextNode(' '),cancel);cancel.onclick=()=>{cancel.disabled=true;controller.abort()};try{return await run(model,meta,{signal:controller.signal,onProgress:p=>{text.textContent='后台清洗中 · '+p.sheets+' 张工作表 · 已用 '+p.elapsedSeconds+' 秒；页面可继续响应，尚未入库。'}})}finally{cancel.remove()}}
 root.WorkbookCleaning={run,runWithStatus};
})(window);

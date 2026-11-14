const crypto=require('node:crypto'),{create,digest}=require('./publication-outbox.cjs');
const endpoint='https://ops-center-cloud.xiaopong190-asin-radar.workers.dev/api/logistics-workspace',PART=128*1024;
function createController({send=fetch,outboxOptions,interval=5000}={}){
 let box=null,timer=null,lastCleanup=0;const sessions=new Map(),running=new Set(),next=new Map(),terminal=new Set(['SUCCEEDED','ARCHIVED','CANCELLED','SUPERSEDED','BLOCKED_VALIDATION']);
 const store=()=>box||(box=create(outboxOptions));
 const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
 function observe(token,meta){if(meta?.publicationReliable&&/^[a-f0-9]{64}$/.test(meta.cacheScope||'')){sessions.set(digest(Buffer.from(token)),{token,owner:meta.cacheScope});if(!timer){timer=setInterval(()=>pump().catch(()=>{}),interval);timer.unref();}return true;}return false;}
 async function owner(token){const old=sessions.get(digest(Buffer.from(token)));if(old)return old;const r=await send(endpoint+'?meta=1',{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)fail(r.status,'请重新登录以恢复本机发布任务');const meta=await r.json();if(!observe(token,meta))fail(428,'云端尚未启用可靠发布，本机任务保留');return sessions.get(digest(Buffer.from(token)));}
 async function cloud(token,payload){const r=await send(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(120000)});let value;try{value=await r.json()}catch{fail(502,'云端回执格式无效，原任务保留')}if(!r.ok)throw Object.assign(Error(value.error||'云端暂不可用'),{status:r.status,retryAfter:r.headers?.get('Retry-After')});return value;}
 async function run(session,value){
  const task=value.task,id=task.operationId,k=session.owner+':'+id;if(running.has(k)||terminal.has(value.state)||(next.get(k)||0)>Date.now())return;running.add(k);
  try{
   let status;try{status=await cloud(session.token,{action:'publication-status',id})}catch(e){if(e.status!==404)throw e;}
   if(status?.job){store().mark(session.owner,id,status.job.state,status.receipt);next.set(k,Date.now()+30000);return;}
   const bytes=Buffer.from(task.transport||task.raw),parts=[];for(let i=0;i<bytes.length;i+=PART)parts.push(digest(bytes.subarray(i,i+PART)));
   const start=await cloud(session.token,{action:'start',id,bytes:bytes.length,sha256:digest(bytes),parts,baseSha:task.baseSha,baseContentHash:task.baseContentHash||null});
   if(start.receipt?.queryContent&&start.receipt?.queryVersion){store().mark(session.owner,id,'SUCCEEDED',start.receipt);return;}
   for(const index of start.missing){const raw=bytes.subarray(index*PART,(index+1)*PART);await cloud(session.token,{action:'part',id,index,encoding:'raw',content:raw.toString('base64')});}
   const result=await cloud(session.token,{action:'publication-accept',id,confirmedAt:task.confirmedAt,archiveAcknowledged:!!task.archiveAcknowledged});
   if(!result.cloudReceived&&!result.job?.cloudReceived&&!result.receipt)fail(502,'云端接管尚未核验');
   store().mark(session.owner,id,result.receipt?'SUCCEEDED':result.job?.state||'CLOUD_RECEIVED',result.receipt);next.set(k,Date.now()+30000);
  }catch(e){
   if([401,403].includes(e.status)){sessions.delete(digest(Buffer.from(session.token)));store().mark(session.owner,id,'AUTH_REQUIRED');}
   else if([400,413,422,428].includes(e.status))store().mark(session.owner,id,'BLOCKED_VALIDATION');
   else{const hint=Number(e.retryAfter);next.set(k,Date.now()+Math.max(10000,Number.isFinite(hint)?hint*1000:0));}
  }finally{running.delete(k)}
 }
 async function pump(){if(!box)return;for(const session of sessions.values()){for(const value of store().list(session.owner))await run(session,value);}if(Date.now()-lastCleanup>86400000){store().cleanup();lastCleanup=Date.now();}}
 async function handle(req,json){
  if(req.method!=='POST')return json(405,{error:'本地发布任务只接受POST'});
  if(!/^127\.0\.0\.1:\d+$/.test(req.headers.host||'')||req.headers.origin!=='http://'+req.headers.host)return json(403,{error:'只允许本机工作台请求'});
  const auth=req.headers.authorization||'';if(!/^Bearer [^\s]{1,512}$/.test(auth))return json(401,{error:'请先登录'});
  try{
   let raw='';for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>160*1024*1024)return json(413,{error:'本地任务超过容量保护'});}const input=JSON.parse(raw),session=await owner(auth.slice(7));
   if(input.action==='save'){
    if(input.task?.session!==digest(Buffer.from(session.token)))return json(403,{error:'任务与当前登录不一致'});
    const value=store().save(session.owner,{...input.task,ownerScope:session.owner});
    // No upload starts inside save: the client must receive durable confirmation.
    return json(200,{ok:true,contentHash:value.contentHash,state:value.state,ownerScope:session.owner});
   }
   if(input.action==='continue'){store();pump().catch(()=>{});return json(200,{ok:true});}
   if(input.action==='cancel'){
    const k=session.owner+':'+input.id;if(running.has(k))return json(409,{error:'本机正在同步此任务，请稍后再次取消；尚未确认取消'});running.add(k);
    try{await cloud(session.token,{action:'publication-cancel',id:input.id});const value=store().mark(session.owner,input.id,'CANCELLED');return json(200,{ok:true,state:value.state});}finally{running.delete(k)}
   }
   if(input.action==='load'){const values=store().list(session.owner),value=values.find(v=>!terminal.has(v.state)||(['SUCCEEDED','ARCHIVED'].includes(v.state)&&input.pendingBatchIds?.includes(v.task.batchId)));let task=value?.task;if(task){task={...task,raw:task.raw||task.transport};if(task.batchId)task.batch=JSON.parse(task.transport);}return json(200,{ok:true,task:task||null,ownerScope:session.owner});}
   if(input.action==='list')return json(200,{ok:true,jobs:store().list(session.owner).map(v=>({id:v.task.operationId,state:v.state,confirmedAt:v.task.confirmedAt,receipt:v.receipt||null,contentHash:v.contentHash}))});
   return json(400,{error:'本地发布任务操作无效'});
  }catch(e){return json(e.status||503,{error:e.status?e.message:'本地恢复包未保存或无法读取；原任务保留'});}
 }
 return {handle,observe,pump,close:()=>{clearInterval(timer);sessions.clear();},owner};
}
module.exports={createController};

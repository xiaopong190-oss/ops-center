// Recoverable control plane. Business quotation content stays in encrypted parts/GitHub.
// A job and its dispatch outbox are one CAS-updated record: receipt of a job cannot
// commit without its recovery instruction. All timestamps below are server UTC ms
// except confirmedAt, the explicitly chosen client click timestamp.
import {Buffer} from 'node:buffer';
export const JOB_PREFIX='_publication-v2:job:',LEASE_KEY='_publication-v2:lease',INTENT_KEY='_publication-v2:intent';
const terminal=new Set(['SUCCEEDED','ARCHIVED','SUPERSEDED','CANCELLED']);
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
const changed=r=>Number(r?.meta?.changes??r?.changes??0)>0;
const uuid=x=>/^[a-f0-9-]{36}$/i.test(x||'');
const digest=x=>/^[a-f0-9]{64}$/.test(x||'');
export const jobKey=(owner,id)=>JOB_PREFIX+Buffer.from(owner).toString('base64url')+':'+id;
const cancellationKey=(owner,id)=>'_publication-v2:cancel:'+Buffer.from(owner).toString('base64url')+':'+id;
const cancelledBeforeReceipt=(owner,id,at)=>({id,owner,state:'CANCELLED',confirmedAt:null,acceptedAt:null,updatedAt:at,phase:'已取消，未接管发布',dispatch:{pending:false},cloudReceived:false});
export async function readRecord(env,key){const row=await env.DB.prepare('SELECT value FROM records WHERE key=?').bind(key).first();return row?JSON.parse(row.value):null;}
const encoded=x=>JSON.stringify(x);
function eventStatement(env,key,job){const event={jobKey:key,revision:job.revision,state:job.state,at:job.updatedAt,attempts:job.attempts,reason:job.reason||null,fence:job.fence||null,rootSha:job.commit?.rootSha||job.candidate||null,queryVersion:job.queryProof?.version||null};return env.DB.prepare('INSERT INTO records(key,value) SELECT ?,? WHERE EXISTS (SELECT 1 FROM records WHERE key=? AND value=?) ON CONFLICT(key) DO NOTHING').bind('_publication-v2:event:'+Buffer.from(job.owner).toString('base64url')+':'+job.id+':'+String(job.revision).padStart(10,'0'),encoded(event),key,encoded(job));}
async function cas(env,key,before,after){
 const statement=before===null?env.DB.prepare('INSERT INTO records(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(key,encoded(after)):env.DB.prepare('UPDATE records SET value=? WHERE key=? AND value=?').bind(encoded(after),key,encoded(before));
 const audit=!before||['state','phase','reason','attempts'].some(k=>before[k]!==after[k])||encoded(before.commit)!==encoded(after.commit)||encoded(before.receipt)!==encoded(after.receipt);
 const result=key.startsWith(JOB_PREFIX)&&env.DB.batch&&audit?(await env.DB.batch([statement,eventStatement(env,key,after)]))[0]:await statement.run();
 return changed(result);
}
export async function changeJob(env,key,fn){for(let i=0;i<8;i++){const before=await readRecord(env,key);if(!before)fail(404,'发布任务不存在');const next=fn(structuredClone(before));if(!next)return before;next.revision=before.revision+1;if(await cas(env,key,before,next))return next;}fail(409,'发布任务正在更新，请重试');}
export function compareConfirmation(a,b){return a.confirmedAt-b.confirmedAt||a.id.localeCompare(b.id);}
export function publicJob(job,winners){
 const replaced=job.scopes?.length&&winners&&job.scopes.every(scope=>winners[scope]&&winners[scope].jobKey!==jobKey(job.owner,job.id));
 return {id:job.id,state:job.state,confirmedAt:job.confirmedAt,acceptedAt:job.acceptedAt,updatedAt:job.updatedAt,phase:replaced&&job.receipt?'曾展示可查，当前已被后续版本替代':job.phase,attempts:job.attempts,nextAttemptAt:job.nextAttemptAt,reason:job.reason||null,receipt:job.receipt?{...job.receipt,operationId:job.id}:null,commit:job.commit||null,scopes:job.scopes||[],supersededBy:job.supersededBy||(replaced?'later-confirmed-batch':null),cloudReceived:job.cloudReceived!==false};
}
export async function receiveJob(env,{owner,id,uploadKey,contentHash,bytes,confirmedAt,clockOffsetMs=0,archiveAcknowledged=false},now=Date.now()){
 if(!env.DB?.batch)fail(503,'可靠发布需要事务数据库，尚未接管');
 if(!owner||!uuid(id)||!digest(contentHash)||!Number.isSafeInteger(bytes)||bytes<1||bytes>64*1024*1024||!Number.isSafeInteger(confirmedAt))fail(400,'固定任务身份或确认时间无效');
 const key=jobKey(owner,id),prior=await readRecord(env,key);
 if(prior){if(prior.contentHash!==contentHash||prior.bytes!==bytes||prior.confirmedAt!==confirmedAt||prior.uploadKey!==uploadKey||!!prior.archiveAcknowledged!==!!archiveAcknowledged)fail(409,'原发布任务内容或确认时间不一致');return prior;}
 const cancelKey=cancellationKey(owner,id);if(await readRecord(env,cancelKey))fail(409,'原任务已经取消，未接管发布');
 const operationKey='_publication-v2:operation:'+id,operation=await readRecord(env,operationKey);
 if(operation&&(operation.jobKey!==key||operation.contentHash!==contentHash))fail(409,'固定发布编号已被占用，未覆盖原任务');
 const job={schema:2,id,owner,uploadKey,contentHash,bytes,confirmedAt,clockOffsetMs,archiveAcknowledged:!!archiveAcknowledged,acceptedAt:now,updatedAt:now,revision:0,state:'CLOUD_RECEIVED',phase:'云端已收齐，等待内容核验',attempts:0,nextAttemptAt:now,dispatch:{pending:true},reason:null,scopes:[],events:[{state:'CLOUD_RECEIVED',at:now}]};
 const max=Number(env.PUBLICATION_MAX_PENDING_BYTES||256*1024*1024);
 if(!Number.isSafeInteger(max)||max<1)fail(503,'发布接管配额配置无效');
 const statement=env.DB.prepare("INSERT INTO records(key,value) SELECT ?,? WHERE (SELECT COALESCE(SUM(CAST(json_extract(value,'$.bytes') AS INTEGER)),0) FROM records WHERE key>=? AND key<? AND json_extract(value,'$.state') NOT IN ('SUCCEEDED','ARCHIVED','SUPERSEDED','CANCELLED'))+?<=? AND NOT EXISTS (SELECT 1 FROM records WHERE key=?) AND NOT EXISTS (SELECT 1 FROM records WHERE key=? AND (json_extract(value,'$.jobKey')<>? OR json_extract(value,'$.contentHash')<>?)) ON CONFLICT(key) DO NOTHING").bind(key,encoded(job),JOB_PREFIX,JOB_PREFIX+'\uffff',bytes,max,cancelKey,operationKey,key,contentHash);
 const marker=env.DB.prepare('INSERT INTO records(key,value) SELECT ?,? WHERE EXISTS (SELECT 1 FROM records WHERE key=? AND value=?) ON CONFLICT(key) DO NOTHING').bind(operationKey,encoded({jobKey:key,contentHash,createdAt:now}),key,encoded(job));
 const inserted=(await env.DB.batch([statement,marker,eventStatement(env,key,job)]))[0];
 if(!changed(inserted)){if(await readRecord(env,cancelKey))fail(409,'原任务已经取消，未接管发布');const actual=await readRecord(env,operationKey);if(actual&&(actual.jobKey!==key||actual.contentHash!==contentHash))fail(409,'固定发布编号已被占用，未覆盖原任务');if(!await readRecord(env,key))fail(507,'云端未完成任务已达到接管配额；已接管任务保留，请稍后继续原任务');return receiveJob(env,{owner,id,uploadKey,contentHash,bytes,confirmedAt,clockOffsetMs,archiveAcknowledged},now);}
 return job;
}
export async function ownedJob(env,user,id){if(!user?.id)fail(401,'请重新登录');if(!uuid(id))fail(400,'任务编号无效');const job=await readRecord(env,jobKey(user.id,id));if(!job){const marker=await readRecord(env,cancellationKey(user.id,id));if(marker)return cancelledBeforeReceipt(user.id,id,marker.at);fail(404,'发布任务不存在');}return job;}
export async function listOwnedJobs(env,user){if(!user?.id)fail(401,'请重新登录');const p=JOB_PREFIX+Buffer.from(user.id).toString('base64url')+':';const rows=await env.DB.prepare("SELECT value FROM records WHERE key>=? AND key<? ORDER BY json_extract(value,'$.acceptedAt') DESC,key LIMIT 200").bind(p,p+'\uffff').all(),winners=await readRecord(env,'_publication-v2:scope-winners')||{};return rows.results.map(r=>publicJob(JSON.parse(r.value),winners));}
export async function transition(env,key,state,patch={},now=Date.now()){
 return changeJob(env,key,job=>{
  if(terminal.has(job.state))return null;
  if(job.commit&&['CANCELLED','AUTH_REQUIRED'].includes(state))fail(409,'报价已经提交，只能发布新批次替换');
  job={...job,...patch,state,updatedAt:now};job.events=[...job.events,{state,at:now,reason:patch.reason||null}].slice(-100);return job;
 });
}
// Cleanup is reference-based. Neither storage pressure nor the old 24h upload
// TTL can remove accepted unfinished content. Success evidence remains 180 days.
export async function cleanupPublicationJobs(env,now=Date.now()){
 const rows=await env.DB.prepare("SELECT key,value FROM records WHERE key>=? AND key<? AND json_extract(value,'$.state') IN ('SUCCEEDED','ARCHIVED','SUPERSEDED','CANCELLED') AND json_extract(value,'$.updatedAt')<? AND COALESCE(json_extract(value,'$.contentCleaned'),0)=0 LIMIT 10").bind(JOB_PREFIX,JOB_PREFIX+'\uffff',now-30*86400000).all();
 for(const row of rows.results){const job=JSON.parse(row.value),upload=await readRecord(env,job.uploadKey);if(upload){await env.DB.prepare('UPDATE records SET value=? WHERE key=? AND value=?').bind(encoded({...upload,expires:now-1}),job.uploadKey,encoded(upload)).run();const prefix=job.uploadKey+':runner-proof:';await env.DB.prepare("UPDATE records SET value=json_set(value,'$.expires',?) WHERE key>=? AND key<?").bind(now-1,prefix,prefix+'\uffff').run();await env.DB.prepare("UPDATE records SET value=json_set(value,'$.expires',?) WHERE key GLOB '_workspace-runner:*' AND json_extract(value,'$.jobKey')=?").bind(now-1,job.uploadKey).run();}await changeJob(env,row.key,j=>({...j,contentCleaned:true}));}
 // Parts are shared by hash only within one owner. Delete only aged parts with
 // no live upload-manifest reference; accepting/pinning a part gives it a live
 // manifest before a job is publicly acknowledged.
 const parts=await env.DB.prepare("SELECT key FROM records p WHERE key GLOB '_workspace-upload:*:part:*' AND json_extract(value,'$.storedAt')<? AND NOT EXISTS (SELECT 1 FROM records j,json_each(j.value,'$.parts') h WHERE j.key GLOB '_workspace-upload:*:job:*' AND j.key NOT GLOB '*:runner-proof:*' AND json_extract(j.value,'$.expires')>=? AND substr(j.key,1,instr(j.key,'job:')-1)||'part:'||h.value=p.key) LIMIT 20").bind(now-86400000,now).all();
 for(const part of parts.results)await env.DB.prepare("DELETE FROM records WHERE key=? AND NOT EXISTS (SELECT 1 FROM records j,json_each(j.value,'$.parts') h WHERE j.key GLOB '_workspace-upload:*:job:*' AND j.key NOT GLOB '*:runner-proof:*' AND json_extract(j.value,'$.expires')>=? AND substr(j.key,1,instr(j.key,'job:')-1)||'part:'||h.value=?)").bind(part.key,now,part.key).run();
 const removed=await env.DB.prepare("DELETE FROM records WHERE key>=? AND key<? AND json_extract(value,'$.state') IN ('SUCCEEDED','ARCHIVED','SUPERSEDED','CANCELLED') AND json_extract(value,'$.updatedAt')<? AND json_extract(value,'$.contentCleaned')=1").bind(JOB_PREFIX,JOB_PREFIX+'\uffff',now-180*86400000).run();
 return {cleaned:rows.results.length,orphanCandidates:parts.results.length,expiredReceipts:Number(removed.meta?.changes??removed.changes??0)};
}
export async function cancelJob(env,user,id,now=Date.now()){
 if(!user?.id)fail(401,'请重新登录');if(!uuid(id))fail(400,'任务编号无效');
 if(user?.canEdit===false&&user.auth!=='super')fail(403,'当前账号没有修改权限');
 const key=jobKey(user.id,id);
 if(!await readRecord(env,key)){await cas(env,cancellationKey(user.id,id),null,{owner:user.id,id,at:now});if(!await readRecord(env,key))return cancelledBeforeReceipt(user.id,id,now);}
 return changeJob(env,key,job=>{if(job.state==='CANCELLED')return null;if(job.commit||['GITHUB_COMMITTING','SUCCEEDED','ARCHIVED','SUPERSEDED'].includes(job.state))fail(409,'已进入提交阶段，不能撤回；请核对结果后以新批次替换');job.state='CANCELLED';job.updatedAt=now;job.dispatch={pending:false};job.events.push({state:'CANCELLED',at:now});return job;});
}
// One global root writer; expires never authorizes an old executor to write again.
export async function claimLease(env,key,ticket,runId,now=Date.now(),ttl=120000){
 if(!uuid(ticket)||!runId)fail(400,'后台执行身份无效');
 for(let i=0;i<8;i++){
  const before=await readRecord(env,LEASE_KEY);
  if(before&&before.expires>now){if(before.jobKey!==key||before.ticket!==ticket||before.runId!==runId)fail(409,'其他报价正在提交，任务已排队');return before;}
  const lease={jobKey:key,ticket,runId,token:(before?.token||0)+1,expires:now+ttl};
  if(await cas(env,LEASE_KEY,before,lease))return lease;
 }fail(409,'提交协调器正在更新，请重试');
}
export async function requireLease(env,key,ticket,runId,token,now=Date.now()){
 const lease=await readRecord(env,LEASE_KEY),job=await readRecord(env,key);
 if(!lease||lease.expires<=now||lease.jobKey!==key||lease.ticket!==ticket||lease.runId!==runId||lease.token!==token||!job||terminal.has(job.state)||job.state==='AUTH_REQUIRED')fail(409,'后台执行租约已失效，原任务保留');
 return {lease,job};
}
export async function renewLease(env,key,ticket,runId,token,now=Date.now(),ttl=120000){for(let attempt=0;attempt<4;attempt++){const {lease}=await requireLease(env,key,ticket,runId,token,now);const next={...lease,expires:Math.max(lease.expires,now+ttl)};if(await cas(env,LEASE_KEY,lease,next))return next;}fail(409,'后台租约已变化');}
export async function releaseLease(env,key,ticket,token){const lease=await readRecord(env,LEASE_KEY);if(lease?.jobKey===key&&lease.ticket===ticket&&lease.token===token)await cas(env,LEASE_KEY,lease,{...lease,expires:0});}
export async function authorizeOwner(env,owner){
 const cfg=await readRecord(env,'global-config.json');
 if(!cfg)return false;
 if(owner==='super')return !!cfg.data?.superHash;
 return cfg.data?.staff?.some(s=>s.name===owner&&s.canEdit!==false)===true;
}
export function retryDelay(attempts,retryAfter,now=Date.now(),random=Math.random){
 const seconds=Number(retryAfter),hint=retryAfter?(Number.isFinite(seconds)?seconds*1000:Date.parse(retryAfter)-now):0;
 return Math.max(Number.isFinite(hint)?Math.max(0,hint):0,Math.min(300000,2000*2**Math.min(attempts,8))*(0.8+random()*0.4));
}
export async function deferJob(env,key,code,{status=503,retryAfter,now=Date.now(),random=Math.random}={}){
 const blocked=[400,413,422,428].includes(status),auth=[401,403].includes(status);
 return transition(env,key,auth?'AUTH_REQUIRED':blocked?'BLOCKED_VALIDATION':'RETRY_WAIT',{reason:code,nextAttemptAt:blocked||auth?null:now+retryDelay((await readRecord(env,key))?.attempts||0,retryAfter,now,random),dispatch:{pending:!blocked&&!auth}},now);
}
export async function immutableEvidence(env,id,value){
 const key='_publication-v2:evidence:'+id,prior=await readRecord(env,key);
 if(prior){if(encoded(prior)!==encoded(value))fail(409,'发布证据已经存在，不能覆盖');return prior;}
 if(!await cas(env,key,null,value))return immutableEvidence(env,id,value);return value;
}
export async function finishJob(env,key,receipt,now=Date.now()){
 if(!receipt?.verified||!digest(receipt.contentHash)||!/^[a-f0-9]{40}$/.test(receipt.sha||''))fail(400,'发布回执未完成核验');
 return changeJob(env,key,job=>{
  if(job.contentHash!==receipt.contentHash)fail(409,'发布回执与冻结内容不一致');
  if(receipt.operationId&&receipt.operationId!==job.id)fail(409,'发布回执不属于当前任务');
  if(job.receipt){if(encoded(job.receipt)!==encoded(receipt))fail(409,'原成功回执不可覆盖');return null;}
  if(terminal.has(job.state))fail(409,'任务已经终止，不能伪造成功');
  job.receipt=receipt;job.state=receipt.visibility==='ARCHIVED'?'ARCHIVED':'SUCCEEDED';job.reason=null;job.nextAttemptAt=null;job.phase=receipt.visibility==='ARCHIVED'?'已存档，本批按当前日期规则不展示':'发布成功，展示已核验';job.updatedAt=now;job.dispatch={pending:false};job.events.push({state:job.state,at:now});return job;
 });
}
// Dispatch recovery is deliberately injectable: no production request in tests.
export async function recoverJobs(env,{send=fetch,now=Date.now(),limit=10,authorize=authorizeOwner,owner=null,id=null}={}){
 const rows=await env.DB.prepare("SELECT key,value FROM records WHERE key>=? AND key<? AND json_extract(value,'$.dispatch.pending')=1 AND json_extract(value,'$.nextAttemptAt')<=? AND (? IS NULL OR json_extract(value,'$.owner')=?) AND (? IS NULL OR json_extract(value,'$.id')=?) ORDER BY json_extract(value,'$.confirmedAt'),key LIMIT ?").bind(JOB_PREFIX,JOB_PREFIX+'\uffff',now,owner,owner,id,id,limit).all();
 const results=[];
 for(const row of rows.results){
  const before=JSON.parse(row.value);if(terminal.has(before.state))continue;
  if(!before.commit&&!before.candidate&&!await authorize(env,before.owner)){await transition(env,row.key,'AUTH_REQUIRED',{reason:'OWNER_PERMISSION_REVOKED',dispatch:{pending:false}},now);results.push({id:before.id,state:'AUTH_REQUIRED'});continue;}
  const ticket=crypto.randomUUID(),next={...before,revision:before.revision+1,state:'QUEUED',phase:'后台排队',reason:null,attempts:before.attempts+1,updatedAt:now,nextAttemptAt:now+20*60000,dispatch:{pending:true,ticket,at:now}};
  if(!await cas(env,row.key,before,next))continue;
  try{
   // Mapping goes first; a crash before dispatch remains recoverable via pending.
   await immutableEvidence(env,'ticket:'+ticket,{jobKey:row.key,uploadKey:before.uploadKey,ticket});
   const response=await send('https://api.github.com/repos/xiaopong190-oss/ops-center/dispatches',{method:'POST',headers:{Authorization:'Bearer '+env.LOGISTICS_GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'hangxu-recovery'},body:encoded({event_type:'logistics-snapshot-publish',client_payload:{ticket,reliable:true}}),redirect:'manual',signal:AbortSignal.timeout(20000)});
   if(!response.ok)await deferJob(env,row.key,'DISPATCH_'+response.status,{status:response.status,retryAfter:response.headers.get('Retry-After'),now});
   results.push({id:before.id,ticket,status:response.status});
  }catch(error){const message=String(error?.message||'network').split(env.LOGISTICS_GITHUB_TOKEN||'___no_token___').join('[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]').slice(0,250);console.warn('publication_dispatch_error',JSON.stringify({name:error?.name||'Error',message}));await deferJob(env,row.key,'DISPATCH_NETWORK',{now});results.push({id:before.id,state:'RETRY_WAIT'});}
 }
 return results;
}

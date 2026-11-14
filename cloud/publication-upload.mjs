import {Buffer} from 'node:buffer';
import {receiveJob,readRecord,ownedJob,listOwnedJobs,publicJob,cancelJob,transition,jobKey} from './publication-jobs.mjs';
const forever=Number.MAX_SAFE_INTEGER,fail=(status,message)=>{throw Object.assign(Error(message),{status})};
export async function publicationControl(input,env,user){
 if(input.action==='publication-list')return {ok:true,jobs:await listOwnedJobs(env,user)};
 if(!['publication-status','publication-cancel','publication-resume'].includes(input.action))return null;
 if(input.action==='publication-cancel')return {ok:true,job:publicJob(await cancelJob(env,user,input.id))};
 const job=await ownedJob(env,user,input.id);
 if(input.action==='publication-resume'){
  if(user.canEdit===false&&user.auth!=='super')fail(403,'当前账号没有修改权限');
  if(job.state!=='AUTH_REQUIRED')return {ok:true,job:publicJob(job)};
  return {ok:true,job:publicJob(await transition(env,jobKey(user.id,input.id),'RETRY_WAIT',{reason:null,nextAttemptAt:Date.now(),dispatch:{pending:true}}))};
 }
 return {ok:true,job:publicJob(job),...(job.receipt?{receipt:publicJob(job).receipt}:{pending:!['CANCELLED','SUPERSEDED','BLOCKED_VALIDATION','NEEDS_RECONFIRM'].includes(job.state)})};
}
export async function acceptUploaded(input,env,user,uploadKey,upload){
 const previous=await readRecord(env,jobKey(user.id,input.id));
 if(previous){if(previous.contentHash!==upload.sha256||previous.confirmedAt!==input.confirmedAt||!!previous.archiveAcknowledged!==!!input.archiveAcknowledged)fail(409,'原任务的内容或确认时间不一致');return {ok:true,pending:!previous.receipt,job:publicJob(previous),receipt:publicJob(previous).receipt||undefined,background:true};}
 if(!Number.isSafeInteger(input.confirmedAt))fail(400,'缺少本机点击确认时间；原批次保留，请核对后重新确认');
 const prefix=uploadKey.slice(0,uploadKey.lastIndexOf('job:'));
 // Each part was length/hash-verified before the upload endpoint encrypted it.
 // Pin references in bounded batches; the runner separately rechecks every part
 // and the full source digest BEFORE CLOUD_ACCEPTED/business validation. This
 // phase is CLOUD_RECEIVED, never a claim of successful content publication.
 // No full 64MiB reconstruction or 1024 D1 calls in a single edge request.
 const names=[...new Set(upload.parts.map(h=>prefix+'part:'+h))];
 for(let i=0;i<names.length;i+=40){
  const batch=names.slice(i,i+40),result=await env.DB.prepare("UPDATE records SET value=json_set(value,'$.expires',?) WHERE key IN ("+batch.map(()=>'?').join(',')+") AND json_extract(value,'$.expires')>=?").bind(forever,...batch,Date.now()).run();
  if(Number(result.meta?.changes??result.changes??0)!==batch.length)fail(409,'分片未收齐或已过期，尚未接管；原任务保留');
 }
 const pin=await env.DB.prepare('UPDATE records SET value=? WHERE key=? AND value=?').bind(JSON.stringify({...upload,expires:forever,reliable:true}),uploadKey,JSON.stringify(upload)).run();
 if(!Number(pin.meta?.changes??pin.changes??0))fail(409,'原上传任务正在更新，请重试接管');
 let job;try{job=await receiveJob(env,{owner:user.id,id:input.id,uploadKey,contentHash:upload.sha256,bytes:upload.bytes,confirmedAt:input.confirmedAt,archiveAcknowledged:!!input.archiveAcknowledged})}catch(error){
  // Failed admission/cancellation must not leave an unowned immortal manifest.
  // A concurrently accepted job protects it in the same SQL predicate.
  await env.DB.prepare("UPDATE records SET value=json_set(value,'$.expires',?) WHERE key=? AND NOT EXISTS (SELECT 1 FROM records WHERE key=?)").bind(Date.now()+86400000,uploadKey,jobKey(user.id,input.id)).run();throw error;
 }
 return {ok:true,pending:true,cloudReceived:true,background:true,job:publicJob(job),confirmedParts:0,totalParts:100};
}

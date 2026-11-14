import {workspaceRunner as legacyRunner} from './workspace-runner.mjs';
import {runnerIdentity} from './workspace-runner-auth.mjs';
import {readWorkspace} from './logistics-workspace.mjs';
import {queryState,businessDay,logisticsQuery} from './logistics-query-store.mjs';
import {readRecord,changeJob,transition,claimLease,renewLease,requireLease,releaseLease,immutableEvidence,finishJob,deferJob,authorizeOwner,compareConfirmation,INTENT_KEY} from './publication-jobs.mjs';
import {knownQueryPages,recordChunkCheckpoint,reuseChunk,recordQueryPage} from './publication-checkpoints.mjs';
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
const put=(env,key,value)=>env.DB.prepare('INSERT INTO records(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(value)).run();
const json=x=>Response.json(x,{headers:{'Cache-Control':'no-store'}});
const scopesKey='_publication-v2:scope-winners';
async function fencedPut(env,key,value,lease){
 const result=await env.DB.prepare("INSERT INTO records(key,value) SELECT ?,? WHERE EXISTS (SELECT 1 FROM records WHERE key='_publication-v2:lease' AND value=? AND json_extract(value,'$.expires')>?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,JSON.stringify(value),JSON.stringify(lease),Date.now()).run();
 if(!Number(result.meta?.changes??result.changes??0))fail(409,'后台租约已变化，拒绝旧执行者写入');
}
function boundEnvironment(env,lease,uploadKey){
 const DB=new Proxy(env.DB,{get(target,name){if(name!=='prepare'){const value=target[name];return typeof value==='function'?value.bind(target):value;}return sql=>{const prepared=target.prepare(sql);return new Proxy(prepared,{get(statement,method){if(method!=='bind'){const value=statement[method];return typeof value==='function'?value.bind(statement):value;}return(...args)=>{if(sql.startsWith('INSERT INTO records(key,value) VALUES(?,?)')&&args[0]===uploadKey){const guarded="INSERT INTO records(key,value) SELECT ?,? WHERE EXISTS (SELECT 1 FROM records WHERE key='_publication-v2:lease' AND value=? AND json_extract(value,'$.expires')>?) ON CONFLICT(key) DO UPDATE SET value=excluded.value";return target.prepare(guarded).bind(...args,JSON.stringify(lease),Date.now());}return statement.bind(...args);};}});};}});
 return {...env,DB};
}
export async function publicationRunner(req,env,send=fetch,identity=runnerIdentity){
 const url=new URL(req.url),match=url.pathname.match(/^\/api\/logistics-workspace-runner\/([a-f0-9-]{36})\/(.+)$/i);
 if(!match)return legacyRunner(req,env,send,identity);
 const [,ticket,action]=match,mapping=await readRecord(env,'_publication-v2:evidence:ticket:'+ticket);
 if(!mapping)return legacyRunner(req,env,send,identity);
 const claims=await identity(req,send),key=mapping.jobKey;let job=await readRecord(env,key);
 if(!job||job.dispatch.ticket!==ticket)fail(409,'旧执行尝试已失效，原任务由恢复器接管');
 if(['CANCELLED','SUPERSEDED','SUCCEEDED','ARCHIVED'].includes(job.state))return action==='meta'?json({terminal:true,jobState:job.state,receipt:job.receipt||null}):fail(409,'任务已经结束，不能继续写入');
 if(!job.commit&&!await authorizeOwner(env,job.owner)){
  const actual=job.candidate?await readWorkspace(env,send):null;
  if(actual&&actual.sha===job.candidate&&actual.envelope?.operationId===job.id){job=await transition(env,key,'GITHUB_COMMITTED',{commit:{rootSha:actual.sha,commitSha:null,operationId:job.id,contentHash:job.contentHash,confirmedAt:job.confirmedAt,at:Date.now()},phase:'已提交，继续核验展示'});}
  else{await transition(env,key,'AUTH_REQUIRED',{reason:'OWNER_PERMISSION_REVOKED',dispatch:{pending:false}});fail(403,'发布者权限已撤销，任务已暂停');}
 }
 if(action==='meta'){
  let lease;try{lease=await claimLease(env,key,ticket,claims.run_id)}catch(error){if(error.status===409)await deferJob(env,key,'WAITING_ROOT_COORDINATOR');throw error;}
  job=await transition(env,key,'RUNNING',{fence:lease.token,runId:claims.run_id,phase:'后台校验内容',nextAttemptAt:Date.now()+20*60000});
  const upload=await readRecord(env,job.uploadKey);if(!upload)fail(409,'原上传任务缺失，未重新创建');
  const current=await readWorkspace(env,send);
  if(job.commit&&job.commit.rootSha!==current.sha){
   if(job.queryProof?.sourceSha===job.commit.rootSha){
    const receipt={ok:true,verified:true,operationId:job.id,visibility:job.visibility||'VISIBLE',scopeVisibility:job.scopeVisibility,sha:job.commit.rootSha,savedAt:upload.runner?.manifest?.savedAt,snapshotHash:upload.runner?.manifest?.hash,contentHash:job.contentHash,queryVersion:job.queryProof.version.split('@')[0],businessDay:job.queryProof.day,queryContent:job.queryProof.kinds};
    const done=await finishJob(env,key,receipt);await changeJob(env,key,x=>({...x,supersededBy:current.envelope?.operationId||current.sha,phase:'曾展示可查，当前已被后续版本替代'}));await releaseLease(env,key,ticket,lease.token);return json({terminal:true,jobState:'SUCCEEDED',receipt:done.receipt});
   }
   await transition(env,key,'SUPERSEDED',{phase:'已存档，已被后续版本替代；未证明曾可查',supersededBy:current.envelope?.operationId||current.sha,dispatch:{pending:false}});await releaseLease(env,key,ticket,lease.token);return json({terminal:true,jobState:'SUPERSEDED'});
  }
  const manifest=upload.runner?.manifest||(job.candidate===current.sha?current.envelope:null)||(upload.receipt?.contentHash===job.contentHash&&upload.receipt?.sha===current.sha?current.envelope:null);
  const resume=current.envelope?.operationId===job.id&&manifest;
  if(resume&&!job.candidate)job=await changeJob(env,key,x=>({...x,candidate:current.sha}));
  // Only scoped batches may rebase automatically. Full/delta masters retain the
  // existing baseline checks and cannot erase unrelated concurrent changes.
  const runner={ticket,operationId:job.id,status:'running',requestedAt:Date.now(),runId:claims.run_id,progress:0,...(resume?{manifest}:{})};
  await put(env,job.uploadKey,{...upload,runner,...(resume?{baseSha:current.sha}:{})});await put(env,'_workspace-runner:'+ticket,{jobKey:job.uploadKey,expires:Number.MAX_SAFE_INTEGER});
  const queryPages=await knownQueryPages(env,job,await queryState(env),businessDay());
  return json({onlineQuery:env.ONLINE_QUERY_ENABLED==='1',reliable:true,bytes:upload.bytes,sha256:upload.sha256,parts:upload.parts,baseSha:upload.baseSha,baseContentHash:upload.baseContentHash||null,operationId:job.id,confirmedAt:job.confirmedAt,queryPages,...(resume?{resume:{rootSha:current.sha,manifest}}:{})});
 }
 await requireLease(env,key,ticket,claims.run_id,job.fence);
 const lease=await renewLease(env,key,ticket,claims.run_id,job.fence);
 await changeJob(env,key,x=>({...x,updatedAt:Date.now(),nextAttemptAt:Date.now()+20*60000}));
 const checkpointPut=(name,value)=>fencedPut(env,name,value,lease),proofKey=i=>job.uploadKey+':runner-proof:'+ticket+':'+i;
 if(/^reuse\/\d+$/.test(action)&&req.method==='POST')return json(await reuseChunk(req,env,{job,index:Number(action.slice(6)),send,put:checkpointPut,proofKey}));
 if(action==='query-page'&&req.method==='POST')return json(await recordQueryPage(req,env,{job,view:await queryState(env),day:businessDay(),put:checkpointPut}));
 if(action==='guard'&&req.method==='POST')return json({ok:true});
 if(action==='projection-plan'&&req.method==='POST'){
  const body=await req.json();if(!body.scopeCounts||job.scopes.some(scope=>!Number.isSafeInteger(body.scopeCounts[scope])||body.scopeCounts[scope]<0))fail(400,'展示作用域核验计划无效');
  const archive=body.hasIncomingQuotes===true&&job.scopes.length>0&&job.scopes.every(scope=>body.scopeCounts[scope]===0);
  if(archive&&!job.archiveAcknowledged){await transition(env,key,'BLOCKED_VALIDATION',{reason:'DISPLAY_CONFIRMATION_REQUIRED',phase:'本批按当前日期规则不展示；请保留原日期，明确确认仅归档后建立新修订',dispatch:{pending:false}});await releaseLease(env,key,ticket,job.fence);fail(422,'本批当前不展示，需要明确确认仅归档；原批次已保留，未提交GitHub');}
  await changeJob(env,key,x=>({...x,visibility:archive?'ARCHIVED':'VISIBLE',scopeVisibility:body.scopeCounts}));return json({ok:true,visibility:archive?'ARCHIVED':'VISIBLE'});
 }
 if(action==='query-read'&&req.method==='GET')return logisticsQuery(new Request('https://worker/api/logistics-query'+url.search),env,{id:job.owner,canEdit:false});
 if(action==='verified'&&req.method==='POST'){
  const proof=await req.json(),view=await queryState(env);
  if(proof.sourceSha!==job.commit?.rootSha||proof.version!==view?.version+'@'+businessDay()||proof.day!==businessDay()||proof.relationHash!==view?.relationHash||!proof.kinds||['quotes-price','quotes-strict','regional-price','regional-strict','warehouses','bills','ratings'].some(kind=>!Number.isSafeInteger(proof.kinds[kind]?.rows)||!/^[a-f0-9]{64}$/.test(proof.kinds[kind]?.hash||'')))fail(409,'展示内容证据与当前任务不一致');
  await changeJob(env,key,x=>({...x,queryProof:{...proof,verifiedAt:Date.now()},state:'QUERY_VERIFYING'}));return json({ok:true});
 }
 if(action==='rebase'&&req.method==='POST'){
  if(job.commit)fail(409,'任务已经提交，不能重新合并');
  const current=await readWorkspace(env,send),upload=await readRecord(env,job.uploadKey);
  await put(env,job.uploadKey,{...upload,baseSha:current.sha,baseContentHash:null});
  return json({baseSha:current.sha});
 }
 if(action==='scopes'&&req.method==='POST'){
  if(job.commit||job.state==='GITHUB_COMMITTING')fail(409,'任务已经进入提交阶段，不能修改作用域');
  const body=await req.json();if(!Array.isArray(body.scopes)||!body.scopes.length||body.scopes.length>300||body.scopes.some(s=>typeof s!=='string'||s.length>300))fail(400,'报价作用域无效');
  if(body.batchId){
   if(!/^[a-f0-9-]{36}$/i.test(body.batchId)||!/^[a-f0-9]{64}$/.test(body.batchHash||''))fail(400,'逻辑批次身份无效');
   const logicalKey='_publication-v2:batch:'+body.batchId,prior=await readRecord(env,logicalKey);
   if(prior&&prior.hash!==body.batchHash)fail(422,'同一逻辑批次内容不一致，必须保留原批次并建立新修订');
   if(prior&&prior.jobKey!==key){const other=await readRecord(env,prior.jobKey);if(other?.commit||!['CANCELLED','BLOCKED_VALIDATION','AUTH_REQUIRED'].includes(other?.state)&&compareConfirmation(other||prior,job)>=0){await transition(env,key,'SUPERSEDED',{reason:'DUPLICATE_LOGICAL_BATCH',phase:'同一逻辑批次已由另一任务处理，未重复提交',dispatch:{pending:false}});await releaseLease(env,key,ticket,job.fence);return json({terminal:true,jobState:'SUPERSEDED'});}}
   await fencedPut(env,logicalKey,{jobKey:key,id:job.id,confirmedAt:job.confirmedAt,hash:body.batchHash},lease);
  }
  const superseded=[],winners=await readRecord(env,scopesKey)||{};
  for(const scope of body.scopes){const winner=winners[scope];if(winner&&compareConfirmation(winner,job)>0)superseded.push(scope);}
  const capacity={...winners,...Object.fromEntries(body.scopes.map(s=>[s,{id:job.id,confirmedAt:job.confirmedAt,rootSha:'0'.repeat(40),jobKey:key}]))};
  if(new TextEncoder().encode(JSON.stringify(capacity)).length>1024*1024)fail(507,'发布协调账本达到容量保护，原任务保留');
  if(superseded.length===body.scopes.length){await transition(env,key,'SUPERSEDED',{scopes:body.scopes,phase:'确认时间较早，已被后续批次替代',dispatch:{pending:false}});await releaseLease(env,key,ticket,job.fence);return json({terminal:true,jobState:'SUPERSEDED',superseded});}
  await transition(env,key,'CLOUD_ACCEPTED',{scopes:body.scopes.filter(s=>!superseded.includes(s)),phase:'内容已核验，等待提交'});
  return json({superseded});
 }
 if(action==='commit-intent'&&req.method==='POST'){
  const body=await req.json();if(!/^[a-f0-9]{40}$/.test(body.rootSha||''))fail(400,'提交版本无效');
  job=await changeJob(env,key,x=>{if(x.state==='CANCELLED'||x.commit)fail(409,'任务不可重新提交');return {...x,state:'GITHUB_COMMITTING',candidate:body.rootSha,updatedAt:Date.now()};});
  await fencedPut(env,INTENT_KEY,{rootSha:body.rootSha,jobKey:key,ticket,fence:job.fence,state:'committing'},lease);
  return json({ok:true});
 }
 if(action==='committed'&&req.method==='POST'){
  const body=await req.json(),current=await readWorkspace(env,send);
  if(body.rootSha!==current.sha||current.envelope?.operationId!==job.id||job.candidate!==current.sha)fail(409,'GitHub提交读回不一致');
  const prior=await readRecord(env,'_publication-v2:evidence:commit:'+job.id);
  const commit=prior||{rootSha:current.sha,commitSha:body.commitSha||null,operationId:job.id,contentHash:job.contentHash,confirmedAt:job.confirmedAt,at:Date.now()};
  if(commit.rootSha!==current.sha||commit.contentHash!==job.contentHash)fail(409,'历史提交证据不一致');
  await immutableEvidence(env,'commit:'+job.id,commit);
  await transition(env,key,'GITHUB_COMMITTED',{commit,phase:'已提交，展示同步中'});
  const winners=await readRecord(env,scopesKey)||{};
  for(const scope of job.scopes)winners[scope]={id:job.id,confirmedAt:job.confirmedAt,rootSha:current.sha,jobKey:key};
  await fencedPut(env,scopesKey,winners,lease);
  await fencedPut(env,INTENT_KEY,{rootSha:current.sha,jobKey:key,ticket,fence:job.fence,state:'committed'},lease);
  return json({ok:true});
 }
 if(action==='failed'&&req.method==='POST'){
  if(['BLOCKED_VALIDATION','AUTH_REQUIRED','NEEDS_RECONFIRM'].includes(job.state)){await releaseLease(env,key,ticket,job.fence);return json({ok:true});}
  const code=req.headers.get('X-Workspace-Failure')||'RUNNER_FAILED';
  const permanent=['BATCH_SCOPE_CONFLICT','PUBLICATION_BASE_REQUIRED','PUBLICATION_SECTIONS_REMOVED','BUSINESS_VALIDATION_FAILED','QUERY_VALIDATION_FAILED','SOURCE_HASH_MISMATCH','SOURCE_PART_MISMATCH','SOURCE_JSON_INVALID','SNAPSHOT_SIZE_INVALID'];
  const status=(permanent.includes(code)||(code==='PUBLICATION_CONFLICT'&&job.scopes.includes('__full-master__')))?422:/^(?:GITHUB|CLOUD)_(401|403)$/.test(code)?403:/^(?:GITHUB|CLOUD)_429$/.test(code)?429:503;
  await deferJob(env,key,code,{status,retryAfter:req.headers.get('X-Workspace-Retry-After')});
  if(job.candidate&&!job.commit){const actual=await readWorkspace(env,send);if(actual.sha!==job.candidate)await fencedPut(env,INTENT_KEY,{rootSha:actual.sha,state:'committed'},lease);}
  await releaseLease(env,key,ticket,job.fence);return json({ok:true});
 }
 if(action==='finish'){
  const view=await queryState(env),latest=await readRecord(env,key);
  if(env.ONLINE_QUERY_ENABLED!=='1'||!view||view.sourceSha!==latest.commit?.rootSha||latest.queryProof?.version!==view.version+'@'+businessDay())fail(409,'完整展示内容核验尚未完成，未写成功回执');
 }
 const response=await legacyRunner(req,boundEnvironment(env,lease,job.uploadKey),send,async()=>claims);
 await requireLease(env,key,ticket,claims.run_id,job.fence);
 if(/^verify\/\d+$/.test(action)&&response.ok)await recordChunkCheckpoint(env,job,await readRecord(env,proofKey(Number(action.slice(7)))),checkpointPut);
 if(action==='finish'&&response.ok){
  const result=await response.clone().json(),view=await queryState(env);
  job=await readRecord(env,key);
  if(env.ONLINE_QUERY_ENABLED!=='1'||!view||view.sourceSha!==result.receipt?.sha||!view.tableSchema||!(view.days||[view.day]).includes(businessDay())||job.queryProof?.version!==view.version+'@'+businessDay())fail(409,'完整展示核验尚未完成');
  // The runner performs exact projection readback before finish; bind its
  // evidence to this immutable receipt, not to whichever root is current later.
  const receipt={...result.receipt,operationId:job.id,visibility:job.visibility||'VISIBLE',scopeVisibility:job.scopeVisibility,queryVersion:view.version,businessDay:businessDay(),relationHash:view.relationHash,queryContent:job.queryProof.kinds};
  await finishJob(env,key,receipt);await releaseLease(env,key,ticket,job.fence);return json({...result,receipt});
 }
 return response;
}

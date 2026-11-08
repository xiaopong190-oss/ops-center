(function(root){'use strict';const cloudEndpoint='https://ops-center-cloud.xiaopong190-asin-radar.workers.dev/api/logistics-workspace';let endpoint=location.hostname==='127.0.0.1'?'/local-workspace':cloudEndpoint,relayMissing=false,relayNetwork=false;const params=new URLSearchParams(location.search),display=params.get('audience')==='display',testing=params.get('testing')==='1',keys=['logistics-company-directory-v1','logistics-quotes-v1','logistics-monthly-bills-v1','logistics-completed-ratings-v1'];let state={mode:display?'snapshot':'local',sha:null,savedAt:null,loaded:!display},prepared=null,busy=false,paused=false;const uploadKey='workspace-pending-upload-v1',partBytes=128*1024,maxBytes=64*1024*1024;
 if(!display){try{const last=JSON.parse(localStorage.getItem('workspace-last-publication'));if(last?.sha&&last.savedAt)state.lastPublication=last}catch{}}
 const data=()=>({space:'real',storage:Object.fromEntries(keys.map((k,i)=>[k,JSON.parse(localStorage.getItem(k)||(i===0||i===3?'[]':i===1?'{"quotes":[],"templates":[]}':'{"rows":[],"aliases":{}}'))]))});
 function validate(d){Domain.directory(d.storage[keys[0]]);QuoteCore.validate(d.storage[keys[1]]);root.WeeklyCarryover?.validate(d.storage[keys[1]]);Domain.bills(d.storage[keys[2]]);Domain.ratings(d.storage[keys[3]],new Date(Date.now()+14*3600000).toISOString().slice(0,10));return d}
 async function once(query='',body){
  if(busy&&prepared?.session&&await sessionKey()!==prepared.session)throw Object.assign(Error('登录已变化，已停止本次发布；请重新登录并预览，本机数据和原任务保留'),{status:401});
  const token=localStorage.getItem('ops-cloud-session-v1');if(!token)throw Object.assign(Error('请先登录运营中心；展示快照需要受控访问'),{status:401});
  let response;try{response=await fetch(endpoint+query,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},...(body?{body}:{}),cache:'no-store',signal:AbortSignal.timeout(body&&JSON.parse(body).action==='commit'?180000:60000)})}catch(error){if(relayNetwork)throw Error('本机转发与浏览器直连云端均未成功；请检查此电脑访问云端服务的网络或代理。原上传任务与本机数据保留');if(relayMissing)throw Error('本机仍运行旧上传服务，直连云端也未成功。请在原文件夹双击“启动航序.cmd”，关闭旧页面后重新打开；不用重新导入数据');throw error}
  if(busy&&prepared?.session&&await sessionKey()!==prepared.session)throw Object.assign(Error('登录已变化，本次响应未用于确认发布；原任务保留'),{status:401});
  // Only a missing local route may use the same already-authorized cloud destination.
  if(endpoint==='/local-workspace'&&[404,405].includes(response.status)){relayMissing=true;endpoint=cloudEndpoint;progress('connect','检测到本机旧服务，正在尝试连接同一云端服务；建议在原文件夹运行“启动航序.cmd”…');return once(query,body)}
  let result;try{result=typeof response.text==='function'?JSON.parse(await response.text()):await response.json()}catch{throw Object.assign(Error('快照接口返回了非JSON内容（HTTP '+response.status+'）；'+(body&&JSON.parse(body).action==='commit'?'云端提交尚未完成，已上传分片与固定任务保留；继续本次提交即可，不需重新导入':endpoint==='/local-workspace'?'请在原文件夹运行“启动航序.cmd”':'云端或网络网关响应异常，请稍后重试')),{status:response.ok?502:response.status,retryAfter:response.headers?.get('Retry-After')})}
  if(endpoint==='/local-workspace'&&response.status===502&&(result.code==='LOCAL_CLOUD_NETWORK'||/^本机连接云端失败（LOCAL_CLOUD_NETWORK）/.test(result.error||''))){relayNetwork=true;endpoint=cloudEndpoint;progress('connect','本机转发连接失败，正在使用浏览器连接同一云端服务（沿用原登录和上传任务）…');return once(query,body)}
  if(!response.ok)throw Object.assign(Error(result.error||'快照服务暂不可用'),{status:response.status,retryAfter:response.headers?.get('Retry-After'),...(['D1_DAILY_READ_LIMIT','D1_DAILY_WRITE_LIMIT'].includes(result.code)?{code:result.code,retryable:false,resetAt:result.resetAt}:{})});return result
 }
 async function request(query='',payload){
  const body=payload?JSON.stringify(payload):undefined;
  for(let attempt=0;;attempt++){
   try{return await once(query,body)}catch(error){
    if(error.retryable===false||(error.status&&error.status<500&&![408,429].includes(error.status)))throw error;
    const hint=error.retryAfter,seconds=hint?Number(hint):NaN;
    const delay=Number.isFinite(seconds)?Math.max(0,seconds*1000):hint?Math.max(0,Date.parse(hint)-Date.now()):NaN;
    if(attempt===2||delay>30000){
     error.message=(error.status===429?'云端请求受限':'云端请求暂未完成')+'：'+error.message+(delay>30000?'。请至少等待 '+Math.ceil(delay/1000)+' 秒后重试':'。请恢复网络或稍后重试');
     throw error;
    }
    await new Promise(resolve=>setTimeout(resolve,Number.isFinite(delay)?delay:Math.random()*1000*2**attempt));
   }
  }
 }
 function displayProjection(snapshot){if(root.WorkspaceDataManagement)return root.WorkspaceDataManagement.projection(snapshot);const original=snapshot.storage[keys[1]],quotes=root.WeeklyCarryover?root.WeeklyCarryover.displayDatabase(original):Object.fromEntries(Object.entries(original).filter(([key])=>!['importExceptions','deletedQuotes','originExcludedQuotes','weeklyCarryover'].includes(key)));return {...snapshot,storage:{...snapshot.storage,[keys[1]]:quotes}}}
 function comparable(snapshot){return JSON.stringify(displayProjection(snapshot))}
 const cacheKey='workspace-display-cache-v1';
 async function sessionKey(){const token=localStorage.getItem('ops-cloud-session-v1');if(!token)throw Object.assign(Error('请先登录运营中心；展示快照需要受控访问'),{status:401});const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')}
 async function cached(session){try{const meta=JSON.parse(localStorage.getItem(cacheKey));if(meta?.session!==session||!meta.sha||keys.some(k=>localStorage.getItem(k)===null))return null;validate(data());if(!meta.contentHash||meta.contentHash!==await digest(new TextEncoder().encode(comparable(data()))))return null;return meta}catch{return null}}
 async function downloadPages(result,delta=false,session){
  const m=delta?result.incremental:result.paged;if(!Number.isSafeInteger(m.bytes)||m.bytes<1||m.bytes>maxBytes||!Array.isArray(m.parts)||m.parts.length!==Math.ceil(m.bytes/(512*1024))||!m.parts.every(h=>/^[a-f0-9]{64}$/.test(h))||!/^[a-f0-9]{64}$/.test(m.hash))throw Error('展示快照分批索引无效');
  const chunks=[];let received=0,reused=0,downloaded=0;
  for(let i=0;i<m.parts.length;i++){
   const expected=Math.min(512*1024,m.bytes-i*512*1024);let bytes=null;
   if(session&&root.WorkspaceDisplayCache?.loadPart){const saved=await root.WorkspaceDisplayCache.loadPart(session,m.parts[i]);if(saved){const candidate=new Uint8Array(saved);if(candidate.length===expected&&await digest(candidate)===m.parts[i]){bytes=candidate;reused++}}}
   if(!bytes){const part=await request('?page='+i+'&sha='+result.sha+(delta?'&delta=1':''));if(part.sha!==result.sha||part.index!==i||part.hash!==m.parts[i]||typeof part.content!=='string'||part.content.length>750000)throw Error('展示批次版本或格式无效');const raw=atob(part.content);bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(bytes.length!==expected||await digest(bytes)!==m.parts[i])throw Error('展示批次内容校验失败，原缓存保留');if(session&&root.WorkspaceDisplayCache?.savePart)await root.WorkspaceDisplayCache.savePart(session,m.parts[i],bytes);downloaded++;}
   chunks.push(bytes);received+=bytes.length;progress('download',(delta?'正在合并新增与变更数据 ':'正在载入展示数据 ')+(i+1)+' / '+m.parts.length+' 批；本机复用 '+reused+' 批，本次下载 '+downloaded+' 批');
  }
  const all=new Uint8Array(received);let offset=0;for(const bytes of chunks){all.set(bytes,offset);offset+=bytes.length}if(received!==m.bytes||await digest(all)!==m.hash)throw Error('展示快照完整性校验失败，原缓存保留');return {...result,data:JSON.parse(new TextDecoder().decode(all))};
 }
 async function performLoad(repair=false){if(testing){state.loaded=true;return state}if(display)progress('load-auth','正在核验登录并读取已发布快照版本…');const tokenSession=display?await sessionKey():null,meta=display?await request('?meta=1'):null,session=display&&/^[a-f0-9]{64}$/.test(meta?.cacheScope||'')?meta.cacheScope:tokenSession,cache=display?await cached(session):null;
 if(display&&root.document&&(!['load','save','loadPart','savePart'].every(name=>typeof root.WorkspaceDisplayCache?.[name]==='function')||typeof root.WorkspaceDelta?.apply!=='function'))throw Error('展示缓存或增量模块未初始化，已停止下载以避免反复全量读取；请更新页面后重试');
 let source=null,migrated=false;if(display&&root.WorkspaceDisplayCache){source=await root.WorkspaceDisplayCache.load(session);if(!source&&session!==tokenSession){const legacy=await root.WorkspaceDisplayCache.load(tokenSession);if(legacy?.session===tokenSession){source={...legacy,session};migrated=true}}if(source&&(source.session!==session||!source.sha||await digest(new TextEncoder().encode(JSON.stringify(source.data)))!==source.hash))source=null;}
 if(source&&meta.sha===source.sha){await install(source.data,session,source.sha,source.savedAt,migrated,tokenSession);state={mode:'snapshot',session:tokenSession,sha:source.sha,savedAt:source.savedAt,loaded:true,cached:true,incremental:false};progress('cached','版本未变，已使用本机缓存，未下载报价');return state;}
 if(cache&&meta.sha===cache.sha){if(await sessionKey()!==tokenSession)throw Object.assign(Error('登录账号已变化，请重新打开查询'),{status:401});state={mode:'snapshot',session:tokenSession,sha:cache.sha,savedAt:cache.savedAt,loaded:true,cached:true};return state}
 if(display&&root.document&&!source&&!cache&&!repair){let previous;try{previous=JSON.parse(localStorage.getItem(cacheKey))}catch{}if(previous?.session===session&&previous?.sha)throw Object.assign(Error('本机完整缓存缺失或校验失败；已停止自动重复下载，请点击重新下载并修复缓存'),{code:'CACHE_REPAIR_REQUIRED'});}
 try{
  if(display&&root.WorkspaceDisplayCache?.verify){progress('cache-storage','正在核验本机缓存能否持久保存…');await root.WorkspaceDisplayCache.verify(session);}
  progress('cache-check',source?'正在检查增量更新…':'正在读取展示快照；将复用已校验的下载批次…');
  let result=await request();
  if(result.paged){
   if(source&&result.paged.hash===source.hash)result={...result,data:source.data,usedSource:true};
   else if(source&&root.WorkspaceDelta&&result.incremental?.baseHash===source.hash){
    const patch=await downloadPages(result,true,session),next=await root.WorkspaceDelta.apply(source.data,patch.data);
    if(await digest(new TextEncoder().encode(JSON.stringify(next)))!==result.paged.hash)throw Error('增量合并后的完整快照校验失败，原缓存保留');
    result={...result,data:next,usedIncremental:true};
   }else result=await downloadPages(result,false,session);
  }
  progress('install','正在核验并切换展示快照…');
  if(!result.data)throw Error('GitHub 尚无已发布展示快照，请由录入同事发布；未覆盖上次成功数据');
  await install(result.data,session,result.sha,result.savedAt,true,tokenSession,result.usedIncremental?result.incremental.parts:result.paged?.parts||[]);
  state={mode:'snapshot',session:tokenSession,sha:result.sha,savedAt:result.savedAt,loaded:true,cached:!!result.usedSource,incremental:!!result.usedIncremental};
 }catch(error){
  const fallback=source||cache;
  if(!fallback||!meta?.sha||[401,403].includes(error.status))throw error;
  if(await sessionKey()!==tokenSession)throw Object.assign(Error('登录账号已变化，请重新打开查询'),{status:401});
  if(source&&cache?.sha!==source.sha)await install(source.data,session,source.sha,source.savedAt,false,tokenSession);
  state={mode:'snapshot',session:tokenSession,sha:fallback.sha,savedAt:fallback.savedAt,loaded:true,cached:true,availableSha:meta.sha!==fallback.sha?meta.sha:null,warning:'本次更新未完成，正在显示已核验的本机版本。'+error.message};
 }
 return state;
 }
 async function install(raw,session,sha,savedAt,persistSource=true,expectedToken=session,completedParts=[]){
  if(display&&await sessionKey()!==expectedToken)throw Object.assign(Error('登录账号已变化，本次下载未替换缓存，请重新打开'),{status:401});
  const next=displayProjection(validate(JSON.parse(JSON.stringify(raw)))),prior=keys.map(k=>localStorage.getItem(k)),priorMeta=localStorage.getItem(cacheKey);
  try{for(const k of keys)localStorage.setItem(k,JSON.stringify(next.storage[k]));await root.LocalQuoteStore?.flush();
   if(display){localStorage.setItem(cacheKey,JSON.stringify({session,sha,savedAt,contentHash:await digest(new TextEncoder().encode(comparable(next)))}));
    if(persistSource&&root.WorkspaceDisplayCache)await root.WorkspaceDisplayCache.save(session,{session,sha,savedAt,hash:await digest(new TextEncoder().encode(JSON.stringify(raw))),data:raw},completedParts);}
  }catch(error){for(let i=0;i<keys.length;i++)prior[i]===null?localStorage.removeItem(keys[i]):localStorage.setItem(keys[i],prior[i]);priorMeta===null?localStorage.removeItem(cacheKey):localStorage.setItem(cacheKey,priorMeta);await root.LocalQuoteStore?.flush();throw error}
 }
 let loading=null;
 function load(options={}){if(!loading){const run=()=>timed('download',async()=>{try{return await performLoad(display&&options.repair===true)}catch(error){if(display&&[401,403].includes(error.status))state={mode:'snapshot',sha:null,savedAt:null,loaded:false};throw error;}});loading=(display&&root.navigator?.locks?.request?root.navigator.locks.request('hangxu-display-load-v1',run):run()).finally(()=>{loading=null});}return loading}

 function counts(snapshot){const q=snapshot.storage[keys[1]];return {companies:snapshot.storage[keys[0]].length,quotes:q.quotes.length,regional:q.regionalQuotes?.length||0,templates:q.templates?.length||0,bills:snapshot.storage[keys[2]].rows.length,ratings:snapshot.storage[keys[3]].length}}
 function publicationScope(){const current=displayProjection(validate(data()));return {counts:counts(displayProjection(prepared.snapshot)),currentCounts:counts(current),unpublishedChanges:comparable(prepared.snapshot)!==comparable(current)}}
 function plan(meta={}){return {previousCounts:prepared.previousCounts||null,sha:prepared.baseSha,savedAt:meta.savedAt,resuming:!!prepared.frozen,alreadyPublished:!!prepared.alreadyPublished,phase:prepared.phase||null,confirmed:prepared.confirmed||0,total:prepared.total||0,...publicationScope(),encrypted:true}}
 async function remember(){if(root.WorkspaceUploadTasks&&!prepared.persisted){if(prepared?.session&&await sessionKey()!==prepared.session)throw Object.assign(Error('登录已变化，请重新预览发布；原任务保留'),{status:401});const session=prepared.session||await sessionKey();await root.WorkspaceUploadTasks.save(session,{...prepared,snapshot:undefined,persisted:true});prepared.persisted=true;} }
 async function performPreview(options={}){if(display)throw Error('展示端没有发布入口，请使用完整输入工作台');if(busy)throw Error('上传正在进行，请先暂停并等待当前请求完成');progress('preview-save','正在等待本机数据保存完成…');await root.LocalQuoteStore?.flush();
  progress('preview-task','正在读取上次固定上传任务…');if(root.WorkspaceUploadTasks){const session=await sessionKey();if(options.fresh){await root.WorkspaceUploadTasks.remove(session);localStorage.removeItem(uploadKey);prepared=null}else{const pending=await root.WorkspaceUploadTasks.load(session);if(pending?.frozen&&pending.raw){prepared={...pending,session,snapshot:JSON.parse(pending.raw)};try{const info=JSON.parse(localStorage.getItem(uploadKey));if(info?.id===prepared.operationId&&info.session===session){prepared.confirmed=info.confirmed||0;prepared.blocked=!!info.blocked;prepared.blockReason=info.blockReason||null;prepared.phase=info.phase||null}}catch{}if(await sessionKey()!==session)throw Object.assign(Error('登录已变化，请重新预览发布'),{status:401});return plan()}}}
  const snapshot=displayProjection(validate(data()));if(new TextEncoder().encode(JSON.stringify(snapshot)).length>maxBytes){prepared=null;throw Object.assign(Error('快照超过64MiB容量保护；本机数据保留，请联系管理员检查快照字段占用'),{code:'SNAPSHOT_CAPACITY'})}progress('preview-cloud','正在连接云端并检查发布权限；网络异常会显示错误，请稍候…');const publishSession=await sessionKey(),meta=await request('?meta=1');if(await sessionKey()!==publishSession)throw Object.assign(Error('登录已变化，请重新预览发布'),{status:401});if(!meta.writeConfigured)throw Error('服务端未配置GitHub发布凭证，本地内容保留');if(snapshot.storage[keys[1]].weeklyCarryover&&meta.weeklyCarryover!==1)throw Error('线上尚未启用上周报价同步，本机报价已保留。服务升级后请重新预览发布。');if(new TextEncoder().encode(JSON.stringify(snapshot)).length>(meta.maxSnapshotBytes||32*1024*1024))throw Error('云端尚未启用新版64MiB分批存储，请更新云端服务；不要删除有效数据');const q=snapshot.storage[keys[1]];if(meta.sha&&!snapshot.storage[keys[0]].length&&!q.quotes.length&&!q.regionalQuotes?.length&&!q.templates.length&&!snapshot.storage[keys[2]].rows.length&&!snapshot.storage[keys[3]].length)throw Error('本机数据为空，已阻止覆盖现有云端快照；请先检查旧数据');if(meta.sha&&meta.publicationSafety!=='verified-base-v1')throw Error('云端尚未启用完整数据发布保护，请管理员更新云端后再发布；本机数据保留');prepared={session:publishSession,baseSha:meta.sha,snapshot,raw:JSON.stringify(snapshot),operationId:crypto.randomUUID(),protocol:meta.uploadProtocol,recordDelta:meta.recordDelta};const last=state.lastPublication;let baseline;try{baseline=JSON.parse(localStorage.getItem('workspace-publication-base-v1'))}catch{}prepared.baseContentHash=last?.sha===meta.sha?last.dataHash:baseline?.session===publishSession&&baseline.sha===meta.sha?baseline.dataHash:null;prepared.previousCounts=last?.sha===meta.sha?last.counts:baseline?.session===publishSession&&baseline.sha===meta.sha?baseline.counts:null;prepared.alreadyPublished=!!(last?.dataHash&&last.sha===meta.sha&&last.dataHash===await digest(new TextEncoder().encode(prepared.raw)));return plan(meta)}
 const timings={};let measurement=null;
 const now=()=>root.performance?.now?.()??Date.now();
 function finishStage(){if(!measurement)return;const elapsed=now()-measurement.since;const stages=measurement.stages;stages[measurement.stage]=Math.round((stages[measurement.stage]||0)+elapsed);}
 async function timed(kind,run){
  if(measurement)return run();
  const start=now(),stages={};measurement={since:start,stage:'initial',stages};let outcome='failed';
  try{const result=await run();outcome=result?.warning?'cached-fallback':'completed';return result;}
  finally{finishStage();timings[kind]={outcome,totalMs:Math.round(now()-start),stages};measurement=null;}
 }
 function progress(stage,message){if(measurement&&measurement.stage!==stage){finishStage();measurement.stage=stage;measurement.since=now();}state={...state,stage,progress:message};if(root.parent&&root.parent!==root)root.parent.postMessage({type:'hangxu-publish-progress',stage,message},location.origin)}
 async function digest(bytes){const value=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(value),b=>b.toString(16).padStart(2,'0')).join('')}
 function base64(bytes){let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text)}
 async function chunkPublish(){
  progress('prepare','正在准备并保存本次固定上传任务…');let transport=prepared.transport||prepared.raw;
  if(!prepared.transport&&prepared.recordDelta&&root.WorkspaceDelta){let baseline;try{baseline=JSON.parse(localStorage.getItem('workspace-record-baseline-v1'))}catch{}const session=await sessionKey();const delta=await root.WorkspaceDelta.create(prepared.snapshot,baseline?.session===session&&baseline.sha===prepared.baseSha?baseline.index:null);prepared.nextIndex=delta.index;const deltaRaw=JSON.stringify(delta.payload);if(deltaRaw.length<transport.length)transport=deltaRaw}
  const bytes=new TextEncoder().encode(transport);if(bytes.length>maxBytes)throw Error('本批增量清单超过64MiB容量保护，请联系管理员处理');const sha256=await digest(bytes),parts=[];
  for(let i=0;i<bytes.length;i+=partBytes)parts.push(await digest(bytes.subarray(i,i+partBytes)));
  const session=await sessionKey();let prior;try{prior=JSON.parse(localStorage.getItem(uploadKey))}catch{}
  if(!prepared.frozen&&prior?.session===session&&prior.sha256===sha256&&prior.expires>Date.now()){prepared.operationId=prior.id;prepared.baseSha=prior.baseSha}
  const id=prepared.operationId;prepared.transport=transport;prepared.frozen=true;prepared.total=parts.length;await remember();
  const saveProgress=()=>localStorage.setItem(uploadKey,JSON.stringify({session,id,sha256,baseSha:prepared.baseSha,confirmed:prepared.confirmed||0,total:parts.length,phase:prepared.phase||null,expires:Date.now()+86400000}));saveProgress();
  progress('resume','正在查询服务端已确认的分片，可恢复上次进度…');let remote=await request('',{action:'start',id,bytes:bytes.length,sha256,parts,baseSha:prepared.baseSha,baseContentHash:prepared.baseContentHash||null});
  if(remote.receipt)return checkedReceipt(remote.receipt,sha256);if(prepared.snapshot.storage[keys[1]].weeklyCarryover&&remote.weeklyCarryover!==1)throw Error('线上尚未启用上周报价同步，原任务保留。服务升级后可继续。');if(prepared.baseSha&&remote.publicationSafety!=='verified-base-v1')throw Error('云端尚未启用完整数据发布保护，原任务保留，请管理员更新后继续');
  let confirmed=parts.length-remote.missing.length;prepared.confirmed=confirmed;saveProgress();progress('upload','服务端已确认 '+confirmed+' / '+parts.length+' 片，只补传缺少部分');
  for(const index of remote.missing){
   if(paused)throw Error('本次上传已暂停，进度已保存；点击继续发布即可恢复');
   const raw=bytes.subarray(index*partBytes,Math.min(bytes.length,(index+1)*partBytes));let packed=raw,encoding='raw';
   if(typeof CompressionStream!=='undefined'&&typeof Blob!=='undefined'&&typeof Response!=='undefined'){const compressed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());if(compressed.length<raw.length){packed=compressed;encoding='gzip'}}
   progress('upload','正在上传并确认分片 '+(confirmed+1)+' / '+parts.length+'（已确认 '+Math.floor(confirmed/parts.length*100)+'%）；失败后可继续，无需重新导入');
   await request('',{action:'part',id,index,encoding,content:base64(packed)});confirmed++;prepared.confirmed=confirmed;saveProgress();progress('upload','已确认 '+confirmed+' / '+parts.length+' 片（'+Math.floor(confirmed/parts.length*100)+'%），已保存续传进度');
  }
  if(paused)throw Error('本次上传已暂停，进度已保存；点击继续发布即可恢复');
  prepared.phase='commit';saveProgress();progress('commit','上传分片已全部确认；正在请求后台发布。本机无需再传文件，尚未发布成功…');
  for(let step=0;step<200;step++){
   if(paused)throw Error('已暂停等待发布结果；已启动的后台任务仍会继续，点击继续上传核实结果，无需重传');
   remote=await request('',{action:'commit',id});
   if(!remote.pending)return checkedReceipt(remote.receipt,sha256);
   if(!Number.isInteger(remote.confirmedParts)||!Number.isInteger(remote.totalParts)||remote.confirmedParts<0||remote.confirmedParts>remote.totalParts||remote.totalParts>128)throw Error('提交进度格式无效，固定任务保留');
   const stage=remote.confirmedParts===0?'等待 GitHub 后台接单或读取已上传分片':remote.confirmedParts<35?'后台正在读取并校验已上传分片':remote.confirmedParts<95?'后台正在生成、加密并核验展示快照':'后台正在发布版本并核验回执';progress('commit',remote.background?'本机上传已完成；'+stage+'。刚刚查询了原任务，尚未取得成功回执。此处为后台处理阶段，不是当前电脑的上传百分比；GitHub 排队耗时不固定。':'本机上传已完成；后台已核验 '+remote.confirmedParts+' / '+remote.totalParts+' 批，尚未取得成功回执。');
  }
  throw Error('本次分阶段提交尚未完成，任务保留；请继续上传，无需重传');
 }
 function checkedReceipt(receipt,sha256){if(!receipt?.ok||!receipt.verified||receipt.contentHash!==sha256||!receipt.sha||!receipt.savedAt)throw Error('未取得内容一致的GitHub核验回执，请继续本次发布');return receipt}
 async function publicationStatus(){const last=state.lastPublication;if(!last?.sha)return {status:'never',unpublishedChanges:true};if(!last.dataHash)return {status:'unknown',unpublishedChanges:null};const current=await digest(new TextEncoder().encode(comparable(validate(data()))));return {status:current===last.dataHash?'published':'changed',unpublishedChanges:current!==last.dataHash};}
 async function performPublish(){if(display||!prepared)throw Error('请先预览本次快照发布');if(busy)throw Error('正在发布，请等待回执');if(prepared.blocked)throw Error(prepared.blockReason||'云端版本冲突，请核对后选择“改发当前数据”；旧任务保留');if(!prepared.frozen&&prepared.raw!==comparable(data())){prepared=null;throw Error('本地数据已变化，请重新预览发布')}busy=true;paused=false;try{
  progress('prepare','正在核对发布任务…');let receipt;if(prepared?.session&&await sessionKey()!==prepared.session)throw Object.assign(Error('登录已变化，请重新预览发布；原任务保留'),{status:401});
  if(prepared.alreadyPublished){progress('verify','正在核验云端仍为上次成功版本；内容未变时无需重新上传或排队…');const meta=await request('?meta=1');if(meta.sha!==prepared.baseSha)throw Error('云端版本已变化，请重新预览发布');receipt={ok:true,verified:true,unchanged:true,sha:meta.sha,savedAt:state.lastPublication.savedAt};}
  else if(prepared.protocol==='chunks-v1')receipt=await chunkPublish();
  else{progress('upload','正在上传完整快照…');receipt=await request('',{baseSha:prepared.baseSha,baseContentHash:prepared.baseContentHash||null,operationId:prepared.operationId,data:prepared.snapshot});if(!receipt.ok||!receipt.sha||!receipt.savedAt)throw Error('未取得有效发布回执，请刷新版本后再试');progress('verify','已取得上传回执，正在下载核验…');let verified=await request();if(verified.paged)verified=await downloadPages(verified);if(verified.sha!==receipt.sha||!verified.data||comparable(validate(verified.data))!==prepared.raw)throw Error('上传回执已取得，但GitHub读回内容或版本未核验一致；请重试本次发布，本机数据保留')}
  progress('receipt','正在确认并保存发布回执…');await root.LocalQuoteStore?.flush();if(prepared?.session&&await sessionKey()!==prepared.session)throw Object.assign(Error('登录已变化，请重新预览发布；原任务保留'),{status:401});receipt={...receipt,...publicationScope()};state={mode:'local',loaded:true,sha:receipt.sha,savedAt:receipt.savedAt,counts:receipt.counts,currentCounts:receipt.currentCounts,unpublishedChanges:receipt.unpublishedChanges,dataHash:await digest(new TextEncoder().encode(prepared.raw))};localStorage.setItem('workspace-last-publication',JSON.stringify(state));state.lastPublication={...state};localStorage.removeItem(uploadKey);if(root.WorkspaceUploadTasks){try{await root.WorkspaceUploadTasks.remove(await sessionKey())}catch{progress('saved','发布已成功，旧任务清理失败；再次继续可核实成功回执')}}if(prepared.nextIndex){try{localStorage.setItem('workspace-record-baseline-v1',JSON.stringify({sha:receipt.sha,session:await sessionKey(),index:prepared.nextIndex}))}catch{progress('saved','发布成功；本机同步索引未保存，下次将安全重新建立')}}prepared=null;return receipt
 }catch(error){if([422,428].includes(error.status)&&prepared?.frozen){prepared.blocked=true;prepared.blockReason=error.message;try{const info=JSON.parse(localStorage.getItem(uploadKey));localStorage.setItem(uploadKey,JSON.stringify({...info,blocked:true,blockReason:error.message}))}catch{}}if(error.status===409&&!prepared?.frozen){prepared=null;error.message+='；请重新预览发布'}else if(error.status===409){prepared.blocked=true;try{const info=JSON.parse(localStorage.getItem(uploadKey));localStorage.setItem(uploadKey,JSON.stringify({...info,blocked:true}))}catch{}error.message+='；云端版本冲突，固定任务和本机数据保留；请核对后选择“改发当前数据”'}error.message='['+(state.stage||'prepare')+'] '+error.message+(prepared?.frozen&&(!root.WorkspaceUploadTasks||prepared.persisted)?'。已确认 '+(prepared.confirmed||0)+' / '+prepared.total+' 片；'+(prepared.blocked?'已阻止本次覆盖，固定任务保留，请核对后重新准备发布':'任务已保留，请点击继续上传'):'');throw error}finally{busy=false}}
 async function performDiscard(){if(display)throw Error('展示端不能清理上传任务');if(busy)throw Error('上传正在进行，请先暂停并等待当前请求结束');if(root.WorkspaceUploadTasks&&localStorage.getItem('ops-cloud-session-v1'))await root.WorkspaceUploadTasks.remove(await sessionKey());localStorage.removeItem(uploadKey);prepared=null;state={...state,stage:null,progress:'旧上传任务已清除，本机数据保留'};return state}
 function publicationLock(run){return root.navigator?.locks?.request?root.navigator.locks.request('hangxu-publish-v1',{ifAvailable:true},lock=>{if(!lock)throw Error('另一个航序页面正在准备或发布，请回到该页面完成或暂停后再试');return run()}):run()}
 const preview=options=>publicationLock(()=>timed('preview',()=>performPreview(options))),publish=()=>publicationLock(()=>timed('publish',performPublish)),discard=()=>publicationLock(performDiscard);
 let sharedPreview=null;
 async function syncBase({apply=false}={}){
  if(display||busy)throw Error('请在输入端暂停上传后载入共享数据');
  const session=await sessionKey();
  if(apply){
   if(!sharedPreview||sharedPreview.session!==session)throw Error('请重新预览共享数据');if(sharedPreview.reduction.length)throw Error('共享快照明显少于本机数据，已阻止替换；请先核对并恢复完整共享版本');
   await root.LocalQuoteStore?.flush();
   if(JSON.stringify(validate(data()))!==sharedPreview.backupRaw)throw Error('本机数据已变化，请重新预览共享数据');
   if(!root.WorkspaceUploadTasks)throw Error('本机备份模块未就绪，未替换数据');
   if(await root.WorkspaceUploadTasks.load(session))throw Error('请先完成原上传任务，或在本地数据管理中清除旧上传任务');
   const meta=await request('?meta=1');if(meta.sha!==sharedPreview.sha)throw Error('共享版本已变化，请重新预览');
   if(await sessionKey()!==session)throw Error('登录已变化，请重新预览');
   const backupKey=session+':before-shared-sync:'+crypto.randomUUID();
   await root.WorkspaceUploadTasks.save(backupKey,{raw:sharedPreview.backupRaw,createdAt:new Date().toISOString(),kind:'before-shared-sync'});
   const saved=await root.WorkspaceUploadTasks.load(backupKey);
   if(saved?.raw!==sharedPreview.backupRaw)throw Error('同步前备份未核验，未替换本机数据');await root.LocalQuoteStore?.refresh();if(JSON.stringify(validate(data()))!==sharedPreview.backupRaw)throw Error('本机数据已变化，备份保留，请重新预览');
   const priorMarker=localStorage.getItem('workspace-publication-base-v1');
   try{
    localStorage.setItem('workspace-publication-base-v1',JSON.stringify({session,sha:sharedPreview.sha,dataHash:sharedPreview.dataHash,backupKey,counts:counts(sharedPreview.snapshot)}));
    await install(sharedPreview.snapshot,session,sharedPreview.sha,sharedPreview.savedAt,false,session);
   }catch(error){if(priorMarker===null)localStorage.removeItem('workspace-publication-base-v1');else localStorage.setItem('workspace-publication-base-v1',priorMarker);throw error;}
   sharedPreview=null;return {ok:true,backupKey};
  }
  await root.LocalQuoteStore?.flush();const backupRaw=JSON.stringify(validate(data())),localRaw=comparable(JSON.parse(backupRaw)),meta=await request('?meta=1');
  if(!meta.sha)throw Error('云端尚无共享快照，请先保存并首次发布');
  let result=await request();if(result.paged)result=await downloadPages(result,false,session);
  if(result.sha!==meta.sha||await sessionKey()!==session)throw Error('版本或登录已变化，请重新预览');
  const snapshot=displayProjection(validate(result.data));
  const localCounts=counts(JSON.parse(localRaw)),sharedCounts=counts(snapshot),reduction=Object.keys(localCounts).filter(key=>localCounts[key]>0&&(sharedCounts[key]===0||(localCounts[key]>=1000&&sharedCounts[key]<localCounts[key]/2)));
  sharedPreview={reduction,backupRaw,session,sha:result.sha,savedAt:result.savedAt,snapshot,localRaw,dataHash:await digest(new TextEncoder().encode(JSON.stringify(snapshot)))};
  return {sha:result.sha,counts:sharedCounts,localCounts,reduction};
 }
 async function baselineBackup(){const session=await sessionKey(),marker=JSON.parse(localStorage.getItem('workspace-publication-base-v1')||'null');if(marker?.session!==session||!marker.backupKey)throw Error('当前登录没有载入前备份');const saved=await root.WorkspaceUploadTasks?.load(marker.backupKey);if(!saved?.raw)throw Error('载入前备份读取失败');return JSON.parse(saved.raw);}
 let versionCheck=null,lastVersionCheck=0;
 async function checkVersion(){if(!display||!state.loaded||loading)return state;if(versionCheck)return versionCheck;if(Date.now()-lastVersionCheck<60000)return state;lastVersionCheck=Date.now();versionCheck=(async()=>{const session=await sessionKey();if(state.session&&state.session!==session)throw Object.assign(Error('登录账号已变化，请重新打开查询'),{status:401});const meta=await request('?meta=1');if(await sessionKey()!==session)throw Object.assign(Error('登录账号已变化，请重新打开查询'),{status:401});state={...state,availableSha:meta.sha&&meta.sha!==state.sha?meta.sha:null};return state})().finally(()=>{versionCheck=null});return versionCheck}
 async function weeklyReminder(week,confirm=false){
  if(display)throw Error('展示端无需处理每周提醒');
  if(testing&&!localStorage.getItem('ops-cloud-session-v1'))return {confirmed:confirm};
  const session=await sessionKey();
  const result=await request('?weekly='+encodeURIComponent(week),confirm?{action:'confirm-weekly'}:undefined);
  if(await sessionKey()!==session||typeof result.confirmed!=='boolean')throw Error('团队提醒状态尚未核验');
  return result;
 }
 const ready=display?load():Promise.resolve(state);root.WorkspaceSnapshot={ready,load,checkVersion,weeklyReminder,syncBase:options=>publicationLock(()=>syncBase(options)),baselineBackup,preview,publish,publicationStatus,discard,pause:()=>{paused=true},isBusy:()=>busy,state:()=>state,diagnostics:()=>JSON.parse(JSON.stringify(timings)),data};
})(window);

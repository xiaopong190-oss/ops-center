// GitHub's standard runner performs whole-snapshot computation. The Free Worker
// handles one existing upload part or one compressed publication part per call.
import {Buffer} from 'node:buffer';
import {runnerIdentity,RUNNER_REPO} from './workspace-runner-auth.mjs';
import {readWorkspace,logisticsWorkspace} from './logistics-workspace.mjs';
import {checkManifest,SHARD_BYTES} from './workspace-shards.mjs';
const api='https://api.github.com/repos/'+RUNNER_REPO+'/',shardAAD=Buffer.from('logistics-workspace-shard-v1'),rootAAD=Buffer.from('ops-center/logistics-workspace/snapshot/v1');
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
const hash=async b=>Buffer.from(await crypto.subtle.digest('SHA-256',b)).toString('hex');
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const headers=env=>({Authorization:'Bearer '+env.LOGISTICS_GITHUB_TOKEN,Accept:'application/vnd.github+json','User-Agent':'ops-center-snapshot-publisher','X-GitHub-Api-Version':'2022-11-28'});
const get=async(env,key)=>{const row=await env.DB.prepare('SELECT value FROM records WHERE key=?').bind(key).first();return row?JSON.parse(row.value):null};
const put=(env,key,value)=>env.DB.prepare('INSERT INTO records(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(value)).run();
const changed=result=>Number(result?.meta?.changes??result?.changes??0)>0;
async function aes(env,usage){const b=Buffer.from(env.ENCRYPTION_KEY||'','base64');if(b.length!==32)fail(503,'快照加密配置不可用');return crypto.subtle.importKey('raw',b,'AES-GCM',false,[usage])}
async function decrypt(envelope,env,aad){try{return Buffer.from(await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(envelope.iv,'base64'),additionalData:aad},await aes(env,'decrypt'),Buffer.from(envelope.content,'base64')))}catch{fail(502,'后台批次解密校验失败')}}
async function encrypt(packed,env){const iv=crypto.getRandomValues(new Uint8Array(12)),content=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:shardAAD},await aes(env,'encrypt'),packed);return {iv:Buffer.from(iv).toString('base64'),content:Buffer.from(content).toString('base64')}}
const pending=job=>({ok:true,pending:true,confirmedParts:Math.min(99,job.runner?.progress||0),totalParts:100,background:true});
async function completed(env,jobKey,job,send){
 if(!job.runner?.manifest)return null;const current=await readWorkspace(env,send),m=job.runner.manifest;
 if(current.envelope?.operationId!==job.runner.operationId)return null;
 if(current.envelope.hash!==m.hash||JSON.stringify(current.envelope.parts)!==JSON.stringify(m.parts)||current.envelope.bytes!==m.bytes)fail(502,'后台发布读回不一致，原任务保留');
 job.receipt={ok:true,sha:current.sha,savedAt:m.savedAt,snapshotHash:m.hash,verified:true,contentHash:job.sha256};job.runner.status='done';job.runner.progress=100;await put(env,jobKey,job);return {ok:true,receipt:job.receipt,missing:[]};
}
export async function backgroundCommit(env,user,id,jobKey,job,send=fetch){
 if(job.receipt)return {ok:true,receipt:job.receipt,missing:[]};
 const done=await completed(env,jobKey,job,send);if(done)return done;
 if(job.runner){if(job.runner.status==='failed')fail(502,'后台发布未完成（'+(job.runner.errorCode||'RUNNER_FAILED')+'）；原分片和本机数据保留，请联系管理员检查后台任务');if(Date.now()-job.runner.requestedAt>15*60000)fail(502,'后台发布超时，原任务保留，请联系管理员检查后台运行');await new Promise(r=>setTimeout(r,4000));return pending(job)}
 const ticket=crypto.randomUUID(),next={...job,runner:{ticket,operationId:id,status:'queued',requestedAt:Date.now(),progress:0}};
 await put(env,'_workspace-runner:'+ticket,{jobKey,expires:job.expires});
 const claim=await env.DB.prepare('UPDATE records SET value=? WHERE key=? AND value=?').bind(JSON.stringify(next),jobKey,JSON.stringify(job)).run();
 if(!changed(claim)){const actual=await get(env,jobKey);return actual.receipt?{ok:true,receipt:actual.receipt,missing:[]}:pending(actual)}
 try{const r=await send(api+'dispatches',{method:'POST',headers:{...headers(env),'Content-Type':'application/json'},body:JSON.stringify({event_type:'logistics-snapshot-publish',client_payload:{ticket}}),redirect:'manual',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('DISPATCH_'+r.status)}catch(error){next.runner.status='failed';next.runner.errorCode=/^DISPATCH_\d+$/.test(error.message)?error.message:'DISPATCH_NETWORK';await put(env,jobKey,next);fail(502,'后台任务启动失败（'+next.runner.errorCode+'），原上传分片保留')}
 return pending(next);
}
async function bodyBytes(req,max){const chunks=[];let n=0;for await(const b of req.body||[]){n+=b.length;if(n>max)fail(413,'后台批次超过上限');chunks.push(b)}return Buffer.concat(chunks)}
export async function workspaceRunner(req,env,send=fetch,identity=runnerIdentity){
 if(!env.DB)fail(503,'后台暂存服务不可用');const claims=await identity(req,send),url=new URL(req.url);
 if(url.pathname==='/api/logistics-workspace-runner/audit-read'){
  if(req.method!=='GET')fail(405,'核对仅允许读取');
  const query=url.search;if(query&&!/^\?page=(?:0|[1-9]\d*)&sha=[a-f0-9]{40,64}$/.test(query))fail(400,'核对参数无效');
  return logisticsWorkspace(new Request('https://worker/api/logistics-workspace'+query),env,{id:'signed-publication-audit',canEdit:false},send);
 }
 if(url.pathname==='/api/logistics-workspace-runner/self-test'){
  if(req.method==='GET')return Response.json({ok:true,protocol:'free-actions-v1'},{headers:{'Cache-Control':'no-store'}});
  if(req.method!=='POST')fail(405,'后台方法无效');const packed=await bodyBytes(req,SHARD_BYTES+2048),envelope=await encrypt(packed,env),back=await decrypt(envelope,env,shardAAD);if(!back.equals(packed))fail(502,'加密自检未通过');return Response.json({ok:true,hash:await hash(back),bytes:back.length},{headers:{'Cache-Control':'no-store'}});
 }
 const match=url.pathname.match(/^\/api\/logistics-workspace-runner\/([a-f0-9-]{36})\/(meta|part\/\d+|base|seal\/\d+|verify\/\d+|ready|finish|failed|progress)$/i);if(!match)fail(404,'后台路径无效');
 const [,ticket,action]=match,mapping=await get(env,'_workspace-runner:'+ticket);if(!mapping||mapping.expires<Date.now())fail(410,'后台任务不存在或已过期');let job=await get(env,mapping.jobKey);
 if(!job||job.expires<Date.now()||job.runner?.ticket!==ticket)fail(410,'后台任务已失效');
 if(job.runner.runId&&job.runner.runId!==claims.run_id)fail(403,'后台任务已绑定其他运行');
 if(!job.runner.runId){const next={...job,runner:{...job.runner,runId:claims.run_id,status:'running'}};const result=await env.DB.prepare('UPDATE records SET value=? WHERE key=? AND value=?').bind(JSON.stringify(next),mapping.jobKey,JSON.stringify(job)).run();if(!changed(result))fail(409,'后台任务正在绑定，请重试');job=next}
 const json=value=>Response.json(value,{headers:{'Cache-Control':'no-store'}}),proofKey=i=>mapping.jobKey+':runner-proof:'+ticket+':'+i;
 if(action==='meta'&&req.method==='GET')return json({bytes:job.bytes,sha256:job.sha256,parts:job.parts,baseSha:job.baseSha,operationId:job.runner.operationId});
 if(action.startsWith('part/')&&req.method==='GET'){
  const i=Number(action.slice(5));if(!Number.isSafeInteger(i)||i<0||i>=job.parts.length)fail(400,'后台原分片编号无效');const prefix=mapping.jobKey.slice(0,mapping.jobKey.lastIndexOf('job:')),key=prefix+'part:'+job.parts[i],part=await get(env,key);if(!part||part.expires<Date.now())fail(409,'原上传分片已过期或缺少');const raw=await decrypt(part,env,Buffer.from(key));if(await hash(raw)!==job.parts[i]||raw.length!==Math.min(128*1024,job.bytes-i*128*1024))fail(502,'原上传分片摘要不一致');return new Response(raw,{headers:{'Content-Type':'application/octet-stream','Cache-Control':'no-store'}});
 }
 if(action==='base'&&req.method==='GET'){
  const current=await readWorkspace(env,send);if(current.sha!==job.baseSha)fail(409,'展示版本已变化，原任务保留');if(!current.envelope)return json({empty:true});if(current.envelope.schemaVersion!==1)fail(409,'大快照增量应改为完整投影，原任务保留');const packed=await decrypt(current.envelope,env,rootAAD);return new Response(packed,{headers:{'Content-Type':'application/octet-stream','X-Workspace-Compression':current.envelope.compression||'none','Cache-Control':'no-store'}});
 }
 if(action.startsWith('seal/')&&req.method==='POST'){
  const i=Number(action.slice(5)),plainHash=req.headers.get('X-Plain-Hash'),bytes=Number(req.headers.get('X-Plain-Bytes'));if(!Number.isSafeInteger(i)||i<0||i>=128||!validHash(plainHash)||!Number.isSafeInteger(bytes)||bytes<1||bytes>SHARD_BYTES)fail(400,'后台加密批次参数无效');const packed=await bodyBytes(req,SHARD_BYTES+2048);if(packed.length<18||packed[0]!==31||packed[1]!==139)fail(400,'后台批次不是GZIP');const envelope=await encrypt(packed,env),encoded=Buffer.from(JSON.stringify(envelope)),proof={hash:plainHash,bytes,packedHash:await hash(packed),envelopeHash:await hash(encoded),expires:job.expires};await put(env,proofKey(i),proof);return new Response(encoded,{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }
 if(action.startsWith('verify/')&&req.method==='POST'){
  const i=Number(action.slice(7));if(!Number.isSafeInteger(i)||i<0||i>=128)fail(400,'后台核验编号无效');const proof=await get(env,proofKey(i));if(!proof)fail(409,'后台批次尚未加密');const raw=await bodyBytes(req,SHARD_BYTES*1.5+4096);if(await hash(raw)!==proof.envelopeHash)fail(502,'GitHub批次密文读回不一致');let envelope;try{envelope=JSON.parse(raw)}catch{fail(400,'后台密文格式无效')}if(await hash(await decrypt(envelope,env,shardAAD))!==proof.packedHash)fail(502,'GitHub批次解密读回不一致');proof.verified=true;await put(env,proofKey(i),proof);return json({ok:true,hash:proof.hash});
 }
 if(action==='ready'&&req.method==='POST'){
  let m;try{m=checkManifest(JSON.parse(await bodyBytes(req,20000)))}catch{fail(400,'后台发布索引无效')}if(m.operationId!==job.runner.operationId||typeof m.savedAt!=='string'||!Number.isFinite(Date.parse(m.savedAt)))fail(400,'后台发布版本无效');let bytes=0;for(let offset=0;offset<m.parts.length;offset+=40){const names=m.parts.slice(offset,offset+40).map((_,i)=>proofKey(offset+i)),rows=await env.DB.prepare('SELECT key,value FROM records WHERE key IN ('+names.map(()=>'?').join(',')+')').bind(...names).all(),found=new Map(rows.results.map(r=>[r.key,JSON.parse(r.value)]));for(let j=0;j<names.length;j++){const proof=found.get(names[j]);if(!proof?.verified||proof.hash!==m.parts[offset+j]||proof.bytes!==Math.min(SHARD_BYTES,m.bytes-(offset+j)*SHARD_BYTES))fail(409,'后台批次未全部核验');bytes+=proof.bytes}}if(bytes!==m.bytes)fail(400,'后台快照长度不一致');const current=await readWorkspace(env,send);if(current.sha!==job.baseSha)fail(409,'展示快照已有更新，未覆盖');job.runner.manifest=m;job.runner.progress=95;await put(env,mapping.jobKey,job);return json({ok:true});
 }
 if(action==='finish'&&req.method==='POST'){const result=await completed(env,mapping.jobKey,job,send);if(!result)fail(409,'后台根快照尚未发布');return json(result)}
 if(action==='progress'&&req.method==='POST'){const n=Number(req.headers.get('X-Workspace-Progress'));if(!Number.isInteger(n)||n<0||n>95)fail(400,'后台进度无效');job.runner.progress=Math.max(job.runner.progress||0,n);await put(env,mapping.jobKey,job);return json({ok:true})}
 if(action==='failed'&&req.method==='POST'){const done=await completed(env,mapping.jobKey,job,send);if(done)return json(done);job.runner.status='failed';job.runner.errorCode='RUNNER_FAILED';await put(env,mapping.jobKey,job);return json({ok:true})}
 fail(405,'后台方法无效');
}

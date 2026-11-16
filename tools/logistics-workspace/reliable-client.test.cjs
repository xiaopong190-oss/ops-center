const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
function browser({failLocal=false,wrongReceipt=false,noIdb=false,cancelFailure=false,hangStatus=false}={}){
 const storage=new Map([['ops-cloud-session-v1','synthetic-session']]),tasks=new Map(),calls=[];let savedTask,fail=failLocal;
 const w={AbortController,location:{hostname:'127.0.0.1',search:''},URLSearchParams,TextEncoder,TextDecoder,AbortSignal,crypto:crypto.webcrypto,Date,JSON,Promise,Error,atob,Domain:{directory(){},bills(){},ratings(){}},QuoteCore:{validate(){}},setTimeout:fn=>setTimeout(fn,0),localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},WorkspaceUploadTasks:noIdb?undefined:{load:async s=>tasks.get(s)||null,save:async(s,v)=>tasks.set(s,JSON.parse(JSON.stringify(v))),remove:async s=>tasks.delete(s)}};
 w.fetch=async(url,options)=>{
  const body=options.body&&JSON.parse(options.body);calls.push({url,body});
  if(url.endsWith('?meta=1'))return Response.json({writeConfigured:true,sha:null,uploadProtocol:'chunks-v1',publicationSafety:'verified-base-v1',publicationReliable:true,cacheScope:'a'.repeat(64)});
  if(url==='/local-publication'){
   if(body.action==='save'){savedTask=body.task;if(fail)return Response.json({error:'synthetic disk full'},{status:503});return Response.json({ok:true,state:'LOCAL_SAVED',contentHash:digest(body.task.transport)});}
   if(body.action==='continue')return Response.json({ok:true});if(body.action==='cancel')return cancelFailure?Response.json({error:'已进入提交阶段'},{status:409}):Response.json({ok:true,state:'CANCELLED'});
  }
  if(body?.action==='publication-status'){if(hangStatus)return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'})),{once:true}));
   const sha='b'.repeat(40),day='2026-11-14',queryContent=Object.fromEntries(['quotes-price','quotes-strict','regional-price','regional-strict','warehouses','bills','ratings'].map(k=>[k,{rows:0,hash:'d'.repeat(64)}]));
   return Response.json({ok:true,receipt:{ok:true,verified:true,operationId:wrongReceipt?crypto.randomUUID():savedTask.operationId,sha,savedAt:day,contentHash:digest(savedTask.transport),queryVersion:sha+':'+day+':'+'e'.repeat(64),businessDay:day,queryContent}});
  }
  throw Error('Unexpected request '+url+' '+body?.action);
 };w.window=w;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'snapshot-client.js'),'utf8'),w);
 return {api:w.WorkspaceSnapshot,calls,tasks,storage,task:()=>savedTask,allowLocal:()=>{fail=false}};
}
test('desktop confirmation freezes the exact parent click time, saves both tiers first and delegates uploading to the local service',async()=>{const c=browser();await c.api.preview();const receipt=await c.api.publish({confirmedAt:123456789});assert(receipt.verified);assert.equal(c.task().confirmedAt,123456789);assert(!c.calls.some(c=>['start','part','publication-accept','commit'].includes(c.body?.action)));assert.equal(c.calls.filter(c=>c.body?.action==='save').length,1);assert(c.calls.findIndex(c=>c.body?.action==='save')<c.calls.findIndex(c=>c.body?.action==='publication-status'));});
test('filesystem failure never starts transfer; retry preserves original click time and operation ID',async()=>{const c=browser({failLocal:true});await c.api.preview();await assert.rejects(c.api.publish({confirmedAt:999}),/disk full/);const original=c.task().operationId;assert(!c.calls.some(c=>c.body?.action==='continue'||c.body?.action==='publication-status'));c.allowLocal();await c.api.publish({confirmedAt:10000});assert.equal(c.task().operationId,original);assert.equal(c.task().confirmedAt,999);});
test('a same-content receipt belonging to a different task cannot clear local publication state',async()=>{const c=browser({wrongReceipt:true});await c.api.preview();await assert.rejects(c.api.publish({confirmedAt:1000}),/完整展示内容核验证据/);assert.equal(c.tasks.size,1);assert(!c.storage.has('workspace-last-publication'));});
test('epoch-zero local click time is retained without a server-time substitution',async()=>{const c=browser();await c.api.preview();await c.api.publish({confirmedAt:0});assert.equal(c.task().confirmedAt,0);});

test('cancel frozen failed publication clears browser continuation only after durable cancellation, without touching quote master',async()=>{const c=browser({failLocal:true});await c.api.preview();await assert.rejects(c.api.publish({confirmedAt:999}));const id=c.task().operationId;await c.api.cancel();assert.equal(c.tasks.size,0);assert(c.calls.some(c=>c.body?.action==='cancel'&&c.body.id===id));assert.equal(c.api.state().progress,'本次发布已取消，本地报价保留')});
test('committed/unknown cancellation failure retains the original browser task',async()=>{const c=browser({failLocal:true,cancelFailure:true});await c.api.preview();await assert.rejects(c.api.publish({confirmedAt:999}));await assert.rejects(c.api.cancel(),/提交阶段/);assert.equal(c.tasks.size,1)});

test('legacy frozen tasks cannot be falsely cancelled using a new-protocol tombstone',async()=>{const c=browser({failLocal:true});await c.api.preview();await assert.rejects(c.api.publish({confirmedAt:999}));for(const t of c.tasks.values())t.reliable=false;await c.api.preview();await assert.rejects(c.api.cancel(),/旧版发布协议/);assert.equal(c.tasks.size,1);assert(!c.calls.some(c=>c.body?.action==='cancel'))});

test('cancelling a hung foreground request aborts waiting without retries before coordinator cancellation',async()=>{const c=browser({hangStatus:true});await c.api.preview();const publishing=c.api.publish({confirmedAt:999}),rejected=assert.rejects(publishing,/中止/);for(let i=0;i<100&&!c.calls.some(c=>c.body?.action==='publication-status');i++)await new Promise(r=>setTimeout(r,1));await c.api.cancel();await rejected;assert.equal(c.tasks.size,0);assert.equal(c.calls.filter(c=>c.body?.action==='publication-status').length,1);assert(c.calls.some(c=>c.body?.action==='cancel'))});

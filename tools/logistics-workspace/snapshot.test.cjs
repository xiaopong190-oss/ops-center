const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function client(search='',responses=[],persisted,hostname,extensions={}){const storage=persisted||new Map([['ops-cloud-session-v1','session']]),calls=[];const w={location:{search,hostname},URLSearchParams,TextEncoder,TextDecoder,atob,AbortSignal,crypto:crypto.webcrypto,Domain:{directory(){},bills(){},ratings(){}},QuoteCore:{validate(){}},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async(url,options)=>{calls.push({url,options});const r=responses.shift();if(!r)throw Error('unexpected request');if(r instanceof Response)return r;return {status:r.status||(r.ok===false?409:200),ok:r.ok!==false,json:async()=>({...r,...(r.writeConfigured!==undefined||r.missing?{publicationSafety:'verified-base-v1'}:{})})}},...extensions,setTimeout:(fn)=>setTimeout(fn,0),Date,JSON,Promise,Error};w.window=w;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'snapshot-client.js'),'utf8'),w);return {api:w.WorkspaceSnapshot,storage,calls,w}}
test('local master never fetches or publishes on startup',async()=>{const c=client();await c.api.ready;assert.equal(c.calls.length,0);await assert.rejects(c.api.publish(),/预览/)});

test('a new client cannot publish over an existing snapshot through an older unprotected backend',async()=>{
 const source=client().api.data(),c=client('',[Response.json({sha:'a'.repeat(40),writeConfigured:true})]);
 c.storage.set('logistics-company-directory-v1',JSON.stringify([{id:'synthetic'}]));
 await assert.rejects(c.api.preview(),/云端尚未启用完整数据发布保护/);
 assert.equal(c.calls.length,1);
 await assert.rejects(c.api.publish(),/预览/);
});

test('explicit shared-baseline load verifies a complete local backup and preserves original local evidence',async()=>{
 const source=client().api.data(),shared=JSON.parse(JSON.stringify(source)),tasks=new Map();
 shared.storage['logistics-company-directory-v1']=[{id:'shared',name:'合成共享物流'}];
 source.storage['logistics-quotes-v1'].importExceptions=[{raw:'合成本机证据'}];
 const store={load:async key=>tasks.get(key)||null,save:async(key,value)=>tasks.set(key,value),remove:async key=>tasks.delete(key)};
 const c=client('',[{sha:'a'},{sha:'a',data:shared},{sha:'a'},{sha:'a',writeConfigured:true}],undefined,undefined,{WorkspaceUploadTasks:store});
 for(const [key,value]of Object.entries(source.storage))c.storage.set(key,JSON.stringify(value));
 const before=JSON.stringify([...c.storage]);const plan=await c.api.syncBase();
 assert.equal(plan.sha,'a');assert.equal(JSON.stringify([...c.storage]),before);
 await c.api.syncBase({apply:true});
 assert.equal(c.api.data().storage['logistics-company-directory-v1'][0].id,'shared');
 assert.equal((await c.api.baselineBackup()).storage['logistics-quotes-v1'].importExceptions[0].raw,'合成本机证据');
 const marker=JSON.parse(c.storage.get('workspace-publication-base-v1'));
 assert.equal(marker.dataHash,crypto.createHash('sha256').update(JSON.stringify(shared)).digest('hex'));
 await c.api.preview();
});

test('shared-baseline load stops before replacing local rows when backup fails, data changes or a fixed upload exists',async()=>{
 for(const failure of ['backup','local-change','pending']){
  const shared=client().api.data(),store={load:async()=>failure==='pending'?{frozen:true}:null,save:async()=>{throw Error('synthetic backup failure')}};
  const c=client('',[{sha:'a'},{sha:'a',data:shared},{sha:'a'}],undefined,undefined,{WorkspaceUploadTasks:store});
  await c.api.syncBase();
  if(failure==='local-change')c.storage.set('logistics-company-directory-v1','[{"id":"new-local"}]');
  const before=JSON.stringify([...c.storage]);
  await assert.rejects(c.api.syncBase({apply:true}));
  assert.equal(JSON.stringify([...c.storage]),before);
 }
});

test('the current partial cloud snapshot cannot replace a more complete local master during baseline loading',async()=>{
 const local=client().api.data(),shared=client().api.data();
 local.storage['logistics-quotes-v1'].quotes=Array.from({length:2000},(_,id)=>({id}));
 shared.storage['logistics-quotes-v1'].regionalQuotes=Array.from({length:62},(_,id)=>({id}));
 const c=client('',[{sha:'partial'},{sha:'partial',data:shared}],undefined,undefined,{WorkspaceUploadTasks:{load:async()=>null,save:async()=>{throw Error('must not save or replace');}}});
 for(const [key,value]of Object.entries(local.storage))c.storage.set(key,JSON.stringify(value));
 const before=JSON.stringify([...c.storage]),plan=await c.api.syncBase();
 assert(plan.reduction.includes('quotes'));
 await assert.rejects(c.api.syncBase({apply:true}),/共享快照明显少于本机/);
 assert.equal(JSON.stringify([...c.storage]),before);
});

test('a publication safety rejection preserves the task and stops suggesting repeated continuation',async()=>{
 const c=client('',[{writeConfigured:true,sha:null,uploadProtocol:'chunks-v1'},{missing:[]},{ok:false,status:428,error:'已阻止覆盖共享数据，请清除旧任务后载入共享完整数据'}]);
 await c.api.preview();
 await assert.rejects(c.api.publish(),error=>error.status===428&&!error.message.includes('请点击继续上传'));
 const task=JSON.parse(c.storage.get('workspace-pending-upload-v1'));
 assert.equal(task.blocked,true);assert.match(task.blockReason,/载入共享完整数据/);
 const calls=c.calls.length;
 await assert.rejects(c.api.publish(),/载入共享完整数据/);
 assert.equal(c.calls.length,calls);
 assert(!c.storage.has('workspace-last-publication'));
});

test('a real display page with missing cache or delta adapter stops before a full download',async()=>{
 for(const ext of [{document:{},WorkspaceDisplayCache:undefined,WorkspaceDelta:{}},{document:{},WorkspaceDisplayCache:{},WorkspaceDelta:undefined}]){const c=client('?audience=display',[{sha:'a'}],undefined,undefined,ext);await assert.rejects(c.api.ready,/模块未初始化.*已停止下载/);assert.equal(c.calls.length,1)}
});

test('same verified account reuses a completed snapshot after relogin, while other accounts and revoked sessions cannot',async()=>{
 const {IDBFactory}=require('../../modules/new-product-followup/work/qa/node_modules/fake-indexeddb'),{create}=require('./display-cache.js'),db=new IDBFactory(),store=create(db),scope='d'.repeat(64),source=client().api.data();source.storage['logistics-quotes-v1'].quotes=[{id:'original'}];
 const a=client('?audience=display',[{sha:'a',cacheScope:scope},{sha:'a',data:source}],undefined,undefined,{WorkspaceDisplayCache:store});await a.api.ready;
 a.storage.set('ops-cloud-session-v1','renewed-token-same-person');a.storage.set('logistics-quotes-v1',JSON.stringify({quotes:[{id:'working-normalization'}],templates:[]}));
 const b=client('?audience=display',[{sha:'a',cacheScope:scope}],a.storage,undefined,{WorkspaceDisplayCache:create(db)});await b.api.ready;assert.equal(b.calls.length,1);assert.equal(b.api.state().cached,true);assert.equal(b.api.data().storage['logistics-quotes-v1'].quotes[0].id,'original');
 const c=client('?audience=display',[{sha:'a',cacheScope:'e'.repeat(64)},{sha:'a',data:source}],a.storage,undefined,{WorkspaceDisplayCache:create(db)});await c.api.ready;assert.equal(c.calls.length,2);
 const denied=client('?audience=display',[{ok:false,status:401,error:'revoked'}],a.storage,undefined,{WorkspaceDisplayCache:{load:async()=>{throw Error('must not access cache before authorization')}}});await assert.rejects(denied.api.ready,/revoked/);assert.equal(denied.calls.length,1);
});

test('existing token-bound completed source migrates after fresh same-session authorization without downloading batches',async()=>{
 const {IDBFactory}=require('../../modules/new-product-followup/work/qa/node_modules/fake-indexeddb'),{create}=require('./display-cache.js'),store=create(new IDBFactory()),source=client().api.data();
 const a=client('?audience=display',[{sha:'a'},{sha:'a',data:source}],undefined,undefined,{WorkspaceDisplayCache:store});await a.api.ready;
 const scope='f'.repeat(64),b=client('?audience=display',[{sha:'a',cacheScope:scope}],a.storage,undefined,{WorkspaceDisplayCache:store});await b.api.ready;assert.equal(b.calls.length,1);assert.equal((await store.load(scope)).sha,'a');
});

test('an account change during an authorized cache read cannot install the prior account source',async()=>{
 let saved=null;const scope='9'.repeat(64),source=client().api.data(),store={load:async()=>saved,save:async(_,v)=>{saved=v}},a=client('?audience=display',[{sha:'a',cacheScope:scope},{sha:'a',data:source}],undefined,undefined,{WorkspaceDisplayCache:store});await a.api.ready;
 const prior=a.storage.get('logistics-quotes-v1');const b=client('?audience=display',[{sha:'a',cacheScope:scope}],a.storage,undefined,{WorkspaceDisplayCache:{load:async()=>{a.storage.set('ops-cloud-session-v1','another-account-token');return saved}}});await assert.rejects(b.api.ready,/账号已变化/);assert.equal(a.storage.get('logistics-quotes-v1'),prior);
});

test('a corrupt saved batch is downloaded again instead of trusting its cache key',async()=>{
 const {IDBFactory}=require('../../modules/new-product-followup/work/qa/node_modules/fake-indexeddb'),{create}=require('./display-cache.js'),store=create(new IDBFactory()),source=client().api.data(),bytes=Buffer.from(JSON.stringify(source)),hash=crypto.createHash('sha256').update(bytes).digest('hex'),scope='7'.repeat(64);
 await store.savePart(scope,hash,new Uint8Array(bytes.length));const c=client('?audience=display',[{sha:'a',cacheScope:scope},{sha:'a',paged:{bytes:bytes.length,hash,parts:[hash]}},{sha:'a',index:0,hash,content:bytes.toString('base64')}],undefined,undefined,{WorkspaceDisplayCache:store});await c.api.ready;assert.equal(c.calls.length,3);assert.equal(c.api.state().loaded,true);assert.equal(await store.loadPart(scope,hash),null);
});

test('a new page resumes verified saved batches after interruption and relogin instead of downloading them again',async()=>{
 const {IDBFactory}=require('../../modules/new-product-followup/work/qa/node_modules/fake-indexeddb'),{create}=require('./display-cache.js'),db=new IDBFactory(),store=create(db),scope='b'.repeat(64),source=client().api.data();source.storage['logistics-quotes-v1'].quotes=[{id:'large',source:'x'.repeat(1100000)}];
 const bytes=Buffer.from(JSON.stringify(source)),hash=b=>crypto.createHash('sha256').update(b).digest('hex'),parts=[];for(let i=0;i<bytes.length;i+=512*1024)parts.push(bytes.subarray(i,i+512*1024));const manifest={sha:'a',paged:{bytes:bytes.length,hash:hash(bytes),parts:parts.map(hash)}},part=i=>({sha:'a',index:i,hash:hash(parts[i]),content:parts[i].toString('base64')});
 const a=client('?audience=display',[{sha:'a',cacheScope:scope},manifest,part(0),{ok:false,status:401,error:'interrupted'}],undefined,undefined,{WorkspaceDisplayCache:store});await assert.rejects(a.api.ready,/interrupted/);assert.equal(await store.load(scope),null);assert.equal((await store.loadPart(scope,hash(parts[0]))).length,parts[0].length);
 a.storage.set('ops-cloud-session-v1','new-token-same-account');const b=client('?audience=display',[{sha:'a',cacheScope:scope},manifest,part(1),part(2)],a.storage,undefined,{WorkspaceDisplayCache:create(db)});await b.api.ready;assert.equal(b.calls.length,4);assert(b.calls[2].url.includes('?page=1&'));assert(!b.calls.some(c=>c.url.includes('?page=0&')));assert.equal(b.api.state().loaded,true);assert.equal(await store.loadPart(scope,hash(parts[0])),null,'completed source commit releases redundant saved batches');
 const c=client('?audience=display',[{sha:'a',cacheScope:scope}],b.storage,undefined,{WorkspaceDisplayCache:create(db)});await c.api.ready;assert.equal(c.calls.length,1);
});

test('startup plus repeated refresh clicks share one snapshot load',async()=>{const source=client().api.data(),c=client('?audience=display',[{sha:'same'},{sha:'same',data:source}]);await Promise.all([c.api.ready,c.api.load(),c.api.load()]);assert.equal(c.calls.length,2);assert.equal(c.api.state().loaded,true)});

test('republishing identical content under a new root SHA does not download any data batches',async()=>{
 let saved=null;const store={load:async()=>saved,save:async(_,v)=>{saved=v}},source=client().api.data(),a=client('?audience=display',[{sha:'a'},{sha:'a',data:source}],undefined,undefined,{WorkspaceDisplayCache:store});await a.api.ready;
 const bytes=Buffer.from(JSON.stringify(source)),hash=crypto.createHash('sha256').update(bytes).digest('hex');const b=client('?audience=display',[{sha:'b'},{sha:'b',paged:{bytes:bytes.length,hash,parts:[hash]}}],a.storage,undefined,{WorkspaceDisplayCache:store});await b.api.ready;assert.equal(b.calls.length,2);assert.equal(b.api.state().cached,true);assert.equal(saved.sha,'b');
});

test('immutable durable source survives reopen and working-data normalization without redownloading',async()=>{
 const {IDBFactory}=require('../../modules/new-product-followup/work/qa/node_modules/fake-indexeddb'),{create}=require('./display-cache.js'),db=new IDBFactory(),store=create(db),source=client().api.data();source.storage['logistics-quotes-v1'].quotes=[{id:'original'}];
 const a=client('?audience=display',[{sha:'a'},{sha:'a',savedAt:'today',data:source}],undefined,undefined,{WorkspaceDisplayCache:store});await a.api.ready;
 a.storage.set('logistics-quotes-v1',JSON.stringify({quotes:[{id:'working-data-modified'}],templates:[]}));
 const b=client('?audience=display',[{sha:'a'}],a.storage,undefined,{WorkspaceDisplayCache:create(db)});await b.api.ready;
 assert.equal(b.calls.length,1);assert.equal(b.api.state().cached,true);assert.equal(b.api.data().storage['logistics-quotes-v1'].quotes[0].id,'original');
 const c=client('?audience=display',[{sha:'a'},{sha:'a',data:source}],new Map([['ops-cloud-session-v1','another-account']]),undefined,{WorkspaceDisplayCache:create(db)});await c.api.ready;assert.equal(c.calls.length,2);
});

test('new snapshot transfers only added/modified record values and applies deletion before switching the durable baseline',async()=>{
 const {IDBFactory}=require('../../modules/new-product-followup/work/qa/node_modules/fake-indexeddb'),{create}=require('./display-cache.js'),store=create(new IDBFactory()),Delta=require('./record-delta.js'),source=client().api.data();source.storage['logistics-quotes-v1'].quotes=[{id:'keep'},{id:'change',price:10},{id:'delete'}];
 const a=client('?audience=display',[{sha:'a'},{sha:'a',data:source}],undefined,undefined,{WorkspaceDisplayCache:store});await a.api.ready;
 const next=JSON.parse(JSON.stringify(source));next.storage['logistics-quotes-v1'].quotes=[{id:'keep'},{id:'change',price:20},{id:'added'}];const delta=(await Delta.create(next,await Delta.index(source))).payload,bytes=Buffer.from(JSON.stringify(delta)),hash=b=>crypto.createHash('sha256').update(b).digest('hex'),target=Buffer.from(JSON.stringify(next));
 assert.equal(delta.changes['logistics-quotes-v1/quotes'].added.length,2);
 const b=client('?audience=display',[{sha:'b'},{sha:'b',paged:{bytes:target.length,hash:hash(target),parts:[hash(target)]},incremental:{baseHash:hash(Buffer.from(JSON.stringify(source))),bytes:bytes.length,hash:hash(bytes),parts:[hash(bytes)]}},{sha:'b',index:0,hash:hash(bytes),content:bytes.toString('base64')}],a.storage,undefined,{WorkspaceDisplayCache:store,WorkspaceDelta:Delta});await b.api.ready;
 assert.equal(b.calls.length,3);assert(b.calls[2].url.endsWith('&delta=1'));assert.equal(b.api.state().incremental,true);assert.equal(JSON.stringify(b.api.data()),JSON.stringify(next));
 const c=client('?audience=display',[{sha:'b'}],b.storage,undefined,{WorkspaceDisplayCache:store});await c.api.ready;assert.equal(c.calls.length,1);assert.equal(JSON.stringify(c.api.data()),JSON.stringify(next));
});

test('corrupt increment and failed durable commit preserve the previous full source and working data',async()=>{
 const Delta=require('./record-delta.js'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 for(const failure of ['target-hash','record-hash','durable-write']){
  let saved=null,failSave=false;const store={load:async()=>saved,save:async(_,v)=>{if(failSave)throw Error('durable write failed');saved=JSON.parse(JSON.stringify(v))}},source=client().api.data();source.storage['logistics-quotes-v1'].quotes=[{id:'old'}];
  const a=client('?audience=display',[{sha:'a'},{sha:'a',data:source}],undefined,undefined,{WorkspaceDisplayCache:store});await a.api.ready;const before=JSON.stringify([...a.storage]),prior=JSON.stringify(saved),next=JSON.parse(JSON.stringify(source));next.storage['logistics-quotes-v1'].quotes.push({id:'new'});
  const payload=(await Delta.create(next,await Delta.index(source))).payload;if(failure==='record-hash')payload.changes['logistics-quotes-v1/quotes'].added[0].hash='f'.repeat(64);
  const bytes=Buffer.from(JSON.stringify(payload)),target=Buffer.from(JSON.stringify(next));failSave=failure==='durable-write';
  const b=client('?audience=display',[{sha:'b'},{sha:'b',paged:{bytes:target.length,hash:failure==='target-hash'?'e'.repeat(64):hash(target),parts:[hash(target)]},incremental:{baseHash:hash(Buffer.from(JSON.stringify(source))),bytes:bytes.length,hash:hash(bytes),parts:[hash(bytes)]}},{sha:'b',index:0,hash:hash(bytes),content:bytes.toString('base64')}],a.storage,undefined,{WorkspaceDisplayCache:store,WorkspaceDelta:Delta});
  await b.api.ready;assert.equal(b.api.state().sha,'a');assert.equal(b.api.state().loaded,true);assert.equal(b.api.state().availableSha,'b');assert.match(b.api.state().warning,/本次更新未完成/);assert.equal(JSON.stringify([...a.storage]),before);assert.equal(JSON.stringify(saved),prior);assert.equal(b.calls.length,3);
 }
});

test('daily D1 budget exhaustion stops after one request and preserves local data without a network diagnosis',async()=>{
 const c=client(),before=JSON.stringify([...c.storage]);await c.api.ready;
 c.w.fetch=async()=>{c.calls.push({});return Response.json({code:'D1_DAILY_READ_LIMIT',retryable:false,resetAt:'2026-10-31T00:00:00.000Z',error:'今日读取额度已用尽，UTC 00:00重置'},{status:503})};
 await assert.rejects(c.api.preview(),e=>e.code==='D1_DAILY_READ_LIMIT'&&!e.message.includes('网络')&&e.retryable===false);
 assert.equal(c.calls.length,1);assert.equal(JSON.stringify([...c.storage]),before);
});

test('empty local master cannot overwrite an existing published snapshot',async()=>{const c=client('',[{writeConfigured:true,sha:'a'.repeat(40)}]);await assert.rejects(c.api.preview(),/本机数据为空/);assert.equal(c.calls.length,1);assert(!c.storage.has('workspace-last-publication'))});

test('new frontend on old local server handles plain 404 and uses only the fixed cloud fallback',async()=>{const c=client('',[new Response('Not found',{status:404}),Response.json({writeConfigured:true,sha:null,uploadProtocol:'chunks-v1'})],undefined,'127.0.0.1');await c.api.preview();assert.equal(c.calls.length,2);assert.equal(c.calls[0].url,'/local-workspace?meta=1');assert.equal(c.calls[1].url,'https://ops-center-cloud.xiaopong190-asin-radar.workers.dev/api/logistics-workspace?meta=1');assert.equal(c.calls[0].options.headers.Authorization,c.calls[1].options.headers.Authorization)});

test('local permission failure never falls back around authentication',async()=>{const c=client('',[Response.json({error:'denied'},{status:403})],undefined,'127.0.0.1');await assert.rejects(c.api.preview(),/denied/);assert.equal(c.calls.length,1)});

test('non-JSON gateway response reports HTTP failure rather than a misleading JSON syntax error',async()=>{const c=client('',Array.from({length:3},()=>new Response('<html>gateway unavailable</html>',{status:502})));await assert.rejects(c.api.preview(),/非JSON.*HTTP 502/);assert.equal(c.calls.length,3);assert(!c.storage.has('workspace-last-publication'))});

test('missing local relay plus failed cloud connection gives restart instructions and keeps local data',async()=>{const c=client('',[new Response('Not found',{status:404})],undefined,'127.0.0.1');c.storage.set('logistics-company-directory-v1','[{"id":"keep"}]');await assert.rejects(c.api.preview(),/旧上传服务.*启动航序/);assert.equal(c.storage.get('logistics-company-directory-v1'),'[{"id":"keep"}]')});
test('publication requires preview and valid receipt; no silent auto publication',async()=>{const c=client('',[{writeConfigured:true,sha:null},{ok:true,sha:'a'.repeat(40),savedAt:'2026-10-26'},{data:client().api.data(),sha:'a'.repeat(40)}]);await c.api.preview();assert.equal(c.calls.length,1);const r=await c.api.publish();assert.equal(r.sha.length,40);assert.equal(c.calls[1].options.method,'POST');assert.equal(JSON.parse(c.calls[1].options.body).data.space,'real');assert.equal(c.calls[1].options.headers.Authorization,'Bearer session')});
test('changed local data invalidates the prepared publication',async()=>{const c=client('',[{writeConfigured:true,sha:null}]);await c.api.preview();c.storage.set('logistics-company-directory-v1','[{"id":"changed"}]');await assert.rejects(c.api.publish(),/已变化/);assert.equal(c.calls.length,1)});
test('version conflict preserves local master and requires a fresh preview before retry',async()=>{const c=client('',[{writeConfigured:true,sha:null},{ok:false,error:'conflict'},{writeConfigured:true,sha:'b'.repeat(40)},{ok:true,sha:'a'.repeat(40),savedAt:'today'},{data:{...client().api.data(),storage:{...client().api.data().storage,'logistics-company-directory-v1':[{id:'company'}]}},sha:'a'.repeat(40)}]);c.storage.set('logistics-company-directory-v1','[{"id":"company"}]');await c.api.preview();await assert.rejects(c.api.publish(),/conflict/);await assert.rejects(c.api.publish(),/预览/);await c.api.preview();await c.api.publish();assert.equal(JSON.parse(c.calls[3].options.body).baseSha,'b'.repeat(40))});

test('display fetches authenticated snapshot and cannot publish',async()=>{const source=client().api.data();const c=client('?audience=display',[{sha:'a',savedAt:'today'},{data:source,sha:'a',savedAt:'today'}]);await c.api.ready;assert.equal(c.api.state().mode,'snapshot');assert.equal(c.calls.length,2);await assert.rejects(c.api.preview(),/展示端/);await assert.rejects(c.api.publish(),/预览/)});
test('unauthenticated snapshot access fails before network',async()=>{const c=client();c.storage.delete('ops-cloud-session-v1');await assert.rejects(c.api.preview(),/登录/);assert.equal(c.calls.length,0)});
test('receipt without matching readback never reports success',async()=>{const c=client('',[{writeConfigured:true,sha:null},{ok:true,sha:'a'.repeat(40),savedAt:'today'},{data:client().api.data(),sha:'b'.repeat(40)}]);await c.api.preview();await assert.rejects(c.api.publish(),/未核验一致/);assert.equal(c.storage.has('workspace-last-publication'),false)});
test('transient failures retry same operation before confirmed readback',async()=>{const c=client('',[{writeConfigured:true,sha:null},{ok:false,status:502,error:'temporary'},{ok:true,sha:'a'.repeat(40),savedAt:'today'},{data:client().api.data(),sha:'a'.repeat(40)}]);await c.api.preview();await c.api.publish();assert.equal(c.calls[1].options.body,c.calls[2].options.body);assert(c.storage.has('workspace-last-publication'))});
test('missing snapshot preserves prior cache and gives explicit error',async()=>{const c=client('',[{data:null,sha:null}]);c.storage.set('logistics-company-directory-v1','[{"id":"prior"}]');await assert.rejects(c.api.load(),/尚无已发布/);assert.equal(c.storage.get('logistics-company-directory-v1'),'[{"id":"prior"}]')});
test('reopening display with same version authenticates metadata but skips full download',async()=>{const source=client().api.data(),responses=[{sha:'a',savedAt:'today'},{data:source,sha:'a',savedAt:'today'},{sha:'a',savedAt:'today'}],c=client('?audience=display',responses);await c.api.ready;assert.equal(c.calls.length,2);assert(c.storage.has('workspace-display-cache-v1'));await c.api.load();assert.equal(c.calls.length,3);assert.match(c.calls[2].url,/meta=1/);assert.equal(c.api.state().cached,true)});
test('a new display page reuses persisted cache and corrupt cache triggers a fresh download',async()=>{const source=client().api.data(),first=client('?audience=display',[{sha:'a'},{data:source,sha:'a',savedAt:'today'}]);await first.api.ready;const second=client('?audience=display',[{sha:'a'}],first.storage);await second.api.ready;assert.equal(second.calls.length,1);assert.equal(second.api.state().cached,true);second.storage.set('logistics-quotes-v1','invalid JSON');const repaired=client('?audience=display',[{sha:'a'},{data:source,sha:'a',savedAt:'today'}],second.storage);await repaired.api.ready;assert.equal(repaired.calls.length,2);assert.equal(repaired.api.state().cached,false)});
test('changed version downloads once and persists the latest data and version',async()=>{const source=client().api.data(),next=JSON.parse(JSON.stringify(source));next.storage['logistics-company-directory-v1']=[{id:'new'}];const c=client('?audience=display',[{sha:'a'},{data:source,sha:'a',savedAt:'old'},{sha:'b'},{data:next,sha:'b',savedAt:'new'},{sha:'b'}]);await c.api.ready;await c.api.load();assert.equal(c.api.state().sha,'b');assert.equal(c.storage.get('logistics-company-directory-v1'),'[{"id":"new"}]');await c.api.load();assert.equal(c.calls.length,5);assert.equal(c.api.state().cached,true)});
test('new version failure keeps the authorized verified snapshot available and retry switches it',async()=>{
 const source=client().api.data(),next=JSON.parse(JSON.stringify(source));next.storage['logistics-company-directory-v1']=[{id:'new'}];
 const c=client('?audience=display',[{sha:'a'},{data:source,sha:'a',savedAt:'old'},{sha:'b'},...Array.from({length:3},()=>({ok:false,status:502,error:'offline'})),{sha:'b'},{data:next,sha:'b',savedAt:'new'},{ok:false,status:401,error:'session revoked'}]);
 await c.api.ready;await c.api.load();assert.equal(c.api.state().sha,'a');assert.equal(c.api.state().loaded,true);assert.equal(c.api.state().availableSha,'b');assert.match(c.api.state().warning,/正在显示已核验/);assert.equal(c.api.diagnostics().download.outcome,'cached-fallback');
 await c.api.load();assert.equal(c.api.state().sha,'b');assert.equal(c.api.state().warning,undefined);assert.equal(c.api.diagnostics().download.outcome,'completed');assert('install' in c.api.diagnostics().download.stages);
 await assert.rejects(c.api.load(),/session revoked/);assert.equal(c.api.state().loaded,false);
});
test('408 and 429 retry in place with Retry-After; longer cooldown preserves the HTTP status',async()=>{
 const limited=seconds=>Response.json({error:'slow down'},{status:429,headers:{'Retry-After':String(seconds)}});
 const c=client('',[Response.json({error:'timeout'},{status:408}),limited(2),{writeConfigured:true,sha:null}]),delays=[];
 c.w.setTimeout=(fn,delay)=>{delays.push(delay);return setTimeout(fn,0)};
 await c.api.preview();assert.equal(c.calls.length,3);assert(delays[0]>=0&&delays[0]<1000);assert.equal(delays[1],2000);
 const d=client('',[limited(60)]);await assert.rejects(d.api.preview(),e=>e.status===429&&/60 秒/.test(e.message));assert.equal(d.calls.length,1);
});
test('cache is session-bound and cannot replace a fresh authorization after logout',async()=>{const source=client().api.data(),c=client('?audience=display',[{sha:'a'},{data:source,sha:'a',savedAt:'today'},{sha:'a'},{data:source,sha:'a',savedAt:'today'}]);await c.api.ready;c.storage.set('ops-cloud-session-v1','different-session');await c.api.load();assert.equal(c.calls.length,4);assert.equal(c.api.state().cached,false);c.storage.delete('ops-cloud-session-v1');await assert.rejects(c.api.load(),/登录/);assert.equal(c.calls.length,4)});
test('upload excludes local evidence before network and preserves it in local storage',async()=>{const source=client().api.data();source.storage['logistics-quotes-v1'].quotes=[{id:'valid'}];const c=client('',[{writeConfigured:true,sha:null},{ok:true,sha:'a'.repeat(40),savedAt:'today'},{data:source,sha:'a'.repeat(40)}]);const master={...source.storage['logistics-quotes-v1'],importExceptions:[{raw:'private source evidence'}],deletedQuotes:[{id:'deleted'}]};c.storage.set('logistics-quotes-v1',JSON.stringify(master));await c.api.preview();await c.api.publish();const sent=JSON.parse(c.calls[1].options.body).data.storage['logistics-quotes-v1'];assert.equal(sent.importExceptions,undefined);assert.equal(sent.deletedQuotes,undefined);assert.deepEqual(sent.quotes,[{id:'valid'}]);assert.equal(c.storage.get('logistics-quotes-v1'),JSON.stringify(master))});
test('script preloads start together while execution and storage readiness remain ordered',async()=>{const events=[],sources=['large-cache.js','storage-space.js','snapshot-client.js','consumer.js'];const w={location:{search:'',origin:'http://test'},parent:{postMessage(){}},setTimeout,clearTimeout,URLSearchParams,LocalQuoteStoreReady:Promise.resolve().then(()=>events.push('storage-ready')),WorkspaceSnapshot:{ready:Promise.resolve()},document:{getElementById:()=>({textContent:JSON.stringify(sources)}),createElement:tag=>({tag}),head:{append:node=>events.push('preload:'+node.href)},body:{append:node=>{events.push('execute:'+node.src);queueMicrotask(()=>node.onload())}}}};w.window=w;await vm.runInNewContext(fs.readFileSync(path.join(__dirname,'workspace-loader.js'),'utf8'),w);assert.deepEqual(events.filter(x=>x.startsWith('preload:')),sources.map(s=>'preload:'+s));assert.deepEqual(events.filter(x=>x.startsWith('execute:')),sources.map(s=>'execute:'+s));assert(events.indexOf('storage-ready')<events.indexOf('execute:storage-space.js'))});
test('shared modules are original source bytes; all runtime dependencies exist',()=>{const manifest=require('./shared-logic.json');assert.ok(Object.keys(manifest.sharedSourceHashes).length>=40);for(const [file,hash]of Object.entries(manifest.sharedSourceHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../logistics-rating',file),'utf8').replace(/\r\n/g,'\n')).digest('hex'),hash,file);for(const entry of ['import','compare','warehouses','ratings','monthly']){const html=fs.readFileSync(path.join(__dirname,'runtime',entry+'.html'),'utf8'),list=JSON.parse(html.match(/<script id="appScripts" type="application\/json">(.*?)<\/script>/s)[1]);for(const file of list)assert.ok(fs.existsSync(path.resolve(__dirname,'runtime',file.split('?')[0])),file);assert.ok(list.find(x=>x.includes('snapshot-client.js')));assert.ok(!list.find(x=>x.includes('github-data.js')))}});


test('oversize snapshot fails before metadata network with actionable local cleanup guidance',async()=>{const c=client();c.storage.set('logistics-quotes-v1',JSON.stringify({quotes:[],templates:[],note:'中'.repeat(23*1024*1024)}));await assert.rejects(c.api.preview(),/64MiB容量保护/);assert.equal(c.calls.length,0);assert.equal(c.api.isBusy(),false);await assert.rejects(c.api.publish(),/预览/);assert(c.storage.get('logistics-quotes-v1').length>12000000)});
test('discard clears frozen task and retry metadata, preserves business records and baseline',async()=>{const c=client('',[{writeConfigured:true,sha:null}]);let removed=0;c.w.WorkspaceUploadTasks={load:async()=>null,remove:async()=>removed++};c.storage.set('logistics-company-directory-v1','[{"id":"keep"}]');c.storage.set('workspace-record-baseline-v1','keep-baseline');c.storage.set('workspace-pending-upload-v1','old-task');await c.api.preview();await c.api.discard();assert.equal(removed,1);assert.equal(c.storage.get('workspace-pending-upload-v1'),undefined);assert.equal(c.storage.get('workspace-record-baseline-v1'),'keep-baseline');assert.equal(c.storage.get('logistics-company-directory-v1'),'[{"id":"keep"}]');await assert.rejects(c.api.publish(),/预览/);assert.equal(c.calls.length,1)});

test('all generated local runtime dependencies are in portable server whitelist',()=>{const {routes}=require('./dev-server.cjs');for(const entry of ['import','compare','warehouses','ratings','monthly','overview']){const html=fs.readFileSync(path.join(__dirname,'runtime',entry+'.html'),'utf8'),list=JSON.parse(html.match(/id="appScripts" type="application\/json">(.*?)<\/script>/s)[1]);for(const file of list){const url=new URL(file,'http://local/tools/logistics-workspace/runtime/'+entry+'.html');assert(routes.has(url.pathname),url.pathname)}}});

test('paged display retries current failed batch, verifies bytes and switches local cache only after complete snapshot',async()=>{const value=client().api.data();value.storage['logistics-quotes-v1'].note='虚拟快照'.repeat(50000);const bytes=Buffer.from(JSON.stringify(value)),parts=[];for(let i=0;i<bytes.length;i+=512*1024)parts.push(bytes.subarray(i,i+512*1024));const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),sha='a'.repeat(40),manifest={sha,savedAt:'today',paged:{bytes:bytes.length,hash:hash(bytes),parts:parts.map(hash)}},responses=[{sha},manifest];for(let i=0;i<parts.length;i++){if(i===1)responses.push({ok:false,status:502,error:'synthetic slow network'});responses.push({sha,index:i,hash:hash(parts[i]),content:parts[i].toString('base64')})}const c=client('?audience=display',responses);await c.api.ready;assert.equal(JSON.parse(c.storage.get('logistics-quotes-v1')).note,value.storage['logistics-quotes-v1'].note);const page1=c.calls.filter(x=>x.url.includes('page=1'));assert.equal(page1.length,2);assert.equal(c.api.state().sha,sha)});
test('corrupt or version-mismatched batch keeps prior local data and never reports display ready',async()=>{const value=client().api.data(),bytes=Buffer.from(JSON.stringify(value)),hash=crypto.createHash('sha256').update(bytes).digest('hex'),storage=new Map([['ops-cloud-session-v1','session'],['logistics-company-directory-v1','[{"id":"keep"}]']]),sha='a'.repeat(40);const c=client('?audience=display',[{sha},{sha,paged:{bytes:bytes.length,hash,parts:[hash]}},{sha:'b'.repeat(40),index:0,hash,content:bytes.toString('base64')}],storage);await assert.rejects(c.api.ready,/版本或格式/);assert.equal(storage.get('logistics-company-directory-v1'),'[{"id":"keep"}]');assert.equal(c.api.state().loaded,false)});

test('36MiB snapshot previews with upgraded cloud, while old cloud gives upgrade guidance instead of deleting records',async()=>{const raw=JSON.stringify({quotes:[],templates:[],note:'中'.repeat(12*1024*1024)}),newClient=client('',[{writeConfigured:true,sha:null,uploadProtocol:'chunks-v1',maxSnapshotBytes:64*1024*1024}]);newClient.storage.set('logistics-quotes-v1',raw);await newClient.api.preview();assert.equal(newClient.calls.length,1);assert.equal(newClient.storage.get('logistics-quotes-v1'),raw);const old=client('',[{writeConfigured:true,sha:null,uploadProtocol:'chunks-v1'}]);old.storage.set('logistics-quotes-v1',raw);await assert.rejects(old.api.preview(),/更新云端服务.*不要删除/);assert.equal(old.storage.get('logistics-quotes-v1'),raw)});

test('frozen old task reports published scope separately from current local scope, including equal-count edits',async()=>{
 const old=client().api.data();old.storage['logistics-quotes-v1']={quotes:[{id:'old'}],regionalQuotes:[{id:'region'}],templates:[{id:'template'}]};
 const sha='c'.repeat(40),c=client('',[{ok:true,sha,savedAt:'today'},{data:old,sha}]);let removed=0;
 c.w.WorkspaceUploadTasks={load:async()=>({frozen:true,raw:JSON.stringify(old),baseSha:'base',operationId:'frozen'}),remove:async()=>removed++};
 const current=JSON.parse(JSON.stringify(old.storage['logistics-quotes-v1']));current.quotes.push({id:'new'});current.templates.push({id:'new-template'});c.storage.set('logistics-quotes-v1',JSON.stringify(current));
 const p=await c.api.preview();assert.equal(p.resuming,true);assert.equal(p.counts.quotes,1);assert.equal(p.currentCounts.quotes,2);assert.equal(p.counts.templates,1);assert.equal(p.currentCounts.templates,2);assert.equal(p.unpublishedChanges,true);assert.equal(c.calls.length,0);
 const r=await c.api.publish();assert.equal(r.counts.quotes,1);assert.equal(r.currentCounts.quotes,2);assert.equal(r.unpublishedChanges,true);assert.equal(c.api.state().unpublishedChanges,true);assert.equal(removed,1);assert.equal(c.storage.get('logistics-quotes-v1'),JSON.stringify(current));
 const d=client();d.w.WorkspaceUploadTasks={load:async()=>({frozen:true,raw:JSON.stringify(old)})};current.quotes=[{id:'same-count-but-edited'}];current.templates=[{id:'template'}];d.storage.set('logistics-quotes-v1',JSON.stringify(current));const equal=await d.api.preview();assert.equal(equal.counts.quotes,equal.currentCounts.quotes);assert.equal(equal.unpublishedChanges,true);
});
test('valid JSON cache changed under unchanged cloud SHA is downloaded again, not silently reused',async()=>{
 const source=client().api.data();source.storage['logistics-quotes-v1'].quotes=[{id:'keep'}];const sha='same',c=client('?audience=display',[{sha},{data:source,sha,savedAt:'today'},{sha},{data:source,sha,savedAt:'today'}]);await c.api.ready;
 c.storage.set('logistics-quotes-v1',JSON.stringify({quotes:[],templates:[]}));await c.api.load();assert.equal(c.calls.length,4);assert.equal(c.api.state().cached,false);assert.equal(JSON.parse(c.storage.get('logistics-quotes-v1')).quotes.length,1);
});

test('frozen chunks receipt preserves old transport and exposes additions saved during upload',async()=>{
 const source=client().api.data(),raw=JSON.stringify(source),contentHash=crypto.createHash('sha256').update(raw).digest('hex'),receipt={ok:true,verified:true,contentHash,sha:'a'.repeat(40),savedAt:'today'},c=client('',[{receipt}]);
 c.w.WorkspaceUploadTasks={load:async()=>({frozen:true,raw,transport:raw,protocol:'chunks-v1',operationId:'frozen-chunks',persisted:true}),remove:async()=>{}};await c.api.preview();
 c.storage.set('logistics-quotes-v1',JSON.stringify({quotes:[{id:'saved-during-upload'}],templates:[]}));const result=await c.api.publish();assert.equal(result.counts.quotes,0);assert.equal(result.currentCounts.quotes,1);assert.equal(result.unpublishedChanges,true);assert.equal(JSON.parse(c.calls[0].options.body).id,'frozen-chunks');
});

test('staged commit automatically advances pending steps and never treats progress as publication success',async()=>{
 const source=client().api.data(),raw=JSON.stringify(source),contentHash=crypto.createHash('sha256').update(raw).digest('hex'),receipt={ok:true,verified:true,contentHash,sha:'a'.repeat(40),savedAt:'today'};
 const c=client('',[{writeConfigured:true,sha:null,uploadProtocol:'chunks-v1'},{missing:[]},{ok:true,pending:true,confirmedParts:3,totalParts:6},{receipt}]);await c.api.preview();await c.api.publish();assert.equal(c.calls.filter(x=>x.options.body&&JSON.parse(x.options.body).action==='commit').length,2);assert(c.storage.has('workspace-last-publication'));assert.equal(c.api.state().lastPublication.sha,receipt.sha);
 const fresh=client('',[],c.storage);await fresh.api.ready;assert.equal(fresh.api.state().lastPublication.sha,receipt.sha);assert.equal(fresh.api.state().lastPublication.counts.quotes,0);
});
test('pause during staged commit retains one frozen task, resumes only commit and does not report success early',async()=>{
 const raw=JSON.stringify(client().api.data()),contentHash=crypto.createHash('sha256').update(raw).digest('hex'),c=client('',[{writeConfigured:true,sha:null,uploadProtocol:'chunks-v1'},{missing:[]},{ok:true,pending:true,confirmedParts:3,totalParts:6},{missing:[]},{receipt:{ok:true,verified:true,contentHash,sha:'b'.repeat(40),savedAt:'today'}}]);
 const fetch=c.w.fetch;let commits=0;c.w.fetch=async(...args)=>{const result=await fetch(...args);if(args[1].body&&JSON.parse(args[1].body).action==='commit'&&++commits===1)c.api.pause();return result};await c.api.preview();await assert.rejects(c.api.publish(),/已暂停等待发布结果/);assert(!c.storage.has('workspace-last-publication'));await c.api.publish();assert.equal(c.calls.filter(x=>x.options.body&&JSON.parse(x.options.body).action==='part').length,0);assert(c.storage.has('workspace-last-publication'));
});
test('non-JSON commit 503 preserves fixed task and points to commit recovery, not restarting an already-working local relay',async()=>{const c=client('',[{writeConfigured:true,sha:null,uploadProtocol:'chunks-v1'},{missing:[]},...Array.from({length:3},()=>new Response('worker unavailable',{status:503}))],undefined,'127.0.0.1');await c.api.preview();await assert.rejects(c.api.publish(),e=>/commit.*HTTP 503/.test(e.message)&&/固定任务保留/.test(e.message)&&!e.message.includes('启动航序.cmd'));assert(!c.storage.has('workspace-last-publication'));assert(c.storage.has('workspace-pending-upload-v1'))});

test('local relay network failure retries identical authorized request through browser to the fixed cloud only',async()=>{const c=client('',[Response.json({code:'LOCAL_CLOUD_NETWORK',error:'network unavailable'},{status:502}),Response.json({writeConfigured:true,sha:null,uploadProtocol:'chunks-v1'})],undefined,'127.0.0.1');await c.api.preview();assert.equal(c.calls.length,2);assert.equal(c.calls[0].url,'/local-workspace?meta=1');assert.equal(c.calls[1].url,'https://ops-center-cloud.xiaopong190-asin-radar.workers.dev/api/logistics-workspace?meta=1');assert.equal(c.calls[0].options.headers.Authorization,c.calls[1].options.headers.Authorization)});
test('old relay network error is recognized, browser connection failure preserves task and reports both paths',async()=>{const c=client('',[Response.json({error:'本机连接云端失败（LOCAL_CLOUD_NETWORK）；上传进度保留'},{status:502})],undefined,'127.0.0.1');c.storage.set('workspace-pending-upload-v1','keep');await assert.rejects(c.api.preview(),/本机转发与浏览器直连云端均未成功/);assert.equal(c.storage.get('workspace-pending-upload-v1'),'keep');assert.equal(c.calls.filter(x=>x.url.startsWith('/local-workspace')).length,1)});
test('local application failures and authorization failures never switch to browser fallback',async()=>{for(const status of [401,403,409,502]){const c=client('',Array.from({length:3},()=>Response.json({error:'application failure'},{status})),undefined,'127.0.0.1');await assert.rejects(c.api.preview());assert(c.calls.every(x=>x.url==='/local-workspace?meta=1'))}});

test('network fallback preserves POST operation, body and authorization and still requires readback',async()=>{const sha='a'.repeat(40),data=client().api.data();const c=client('',[{writeConfigured:true,sha:null},Response.json({code:'LOCAL_CLOUD_NETWORK'},{status:502}),{ok:true,sha,savedAt:'2026-10-29'}, {sha,data}],undefined,'127.0.0.1');await c.api.preview();const receipt=await c.api.publish();assert.equal(receipt.sha,sha);const sent=c.calls.filter(x=>x.options.method==='POST');assert.equal(sent.length,2);assert.equal(sent[0].options.body,sent[1].options.body);assert.equal(sent[0].options.headers.Authorization,sent[1].options.headers.Authorization);assert.equal(c.calls.at(-1).options.method,'GET')});

test('published snapshot load applies explicit-origin scope to an existing raw snapshot and stores only its display projection',async()=>{const source=client().api.data(),q=source.storage['logistics-quotes-v1'];q.quotes=[{channel:'宁波起运',date:'2026-10-30'},{channel:'深圳起运',date:'2026-10-30'}];q.regionalQuotes=[{channel:'厦门始发',date:'2026-10-30'}];q.templates=[{country:'美国',warehouse:'ONT8'}];const c=client('?audience=display',[{sha:'origin-test'},{sha:'origin-test',savedAt:'2026-10-30',data:source}]);c.w.WorkspaceDataManagement=require('./data-management.js');await c.api.ready;const stored=JSON.parse(c.storage.get('logistics-quotes-v1'));assert.equal(stored.quotes.length,1);assert.equal(stored.quotes[0].channel,'深圳起运');assert.equal(stored.regionalQuotes.length,0);assert.equal(stored.templates.length,1);assert.equal(source.storage['logistics-quotes-v1'].quotes.length,2)});

test('publisher login changes invalidate a prepared publication before any POST',async()=>{const c=client('',[{writeConfigured:true,sha:null}]);await c.api.preview();c.storage.set('ops-cloud-session-v1','different-login');await assert.rejects(c.api.publish(),/登录已变化/);assert.equal(c.calls.length,1);assert(!c.storage.has('workspace-last-publication'))});
test('a login change during preview cannot prepare the previous account response',async()=>{const c=client('',[{writeConfigured:true,sha:null}]),fetch=c.w.fetch;c.w.fetch=async(...args)=>{const response=await fetch(...args);c.storage.set('ops-cloud-session-v1','different-login');return response};await assert.rejects(c.api.preview(),/登录已变化/);assert.equal(c.calls.length,1);await assert.rejects(c.api.publish(),/预览/)});
test('publication status detects same-count data edits and treats legacy receipts as unverified',async()=>{const data=client().api.data();data.storage['logistics-quotes-v1'].regionalQuotes=[{id:'same',price:100}];const c=client('',[{writeConfigured:true,sha:null},{ok:true,sha:'published',savedAt:'2026-11-02'},{sha:'published',data}]);c.storage.set('logistics-quotes-v1',JSON.stringify(data.storage['logistics-quotes-v1']));assert.equal((await c.api.publicationStatus()).status,'never');await c.api.preview();await c.api.publish();assert.equal((await c.api.publicationStatus()).status,'published');c.storage.set('logistics-quotes-v1',JSON.stringify({quotes:[],templates:[],regionalQuotes:[{id:'same',price:200}]}));assert.equal((await c.api.publicationStatus()).status,'changed');const legacy=client('',[],new Map([['ops-cloud-session-v1','session'],['workspace-last-publication',JSON.stringify({sha:'old',savedAt:'2026-10-28'})]]));assert.equal((await legacy.api.publicationStatus()).status,'unknown')});

test('another publishing tab blocks preview, publish and task deletion before touching network or progress',async()=>{const c=client('',[],undefined,undefined,{navigator:{locks:{request:async(name,options,fn)=>{assert.equal(name,'hangxu-publish-v1');assert.equal(options.ifAvailable,true);return fn(null)}}}});c.storage.set('workspace-pending-upload-v1','keep');for(const fn of [()=>c.api.preview(),()=>c.api.publish(),()=>c.api.discard()])await assert.rejects(fn(),/另一个航序页面/);assert.equal(c.calls.length,0);assert.equal(c.storage.get('workspace-pending-upload-v1'),'keep')});

test('changed publisher login cannot save a frozen task under the new login',async()=>{let saved=0;const c=client('',[{writeConfigured:true,sha:null,uploadProtocol:'chunks-v1'}],undefined,undefined,{WorkspaceUploadTasks:{load:async()=>null,save:async()=>saved++,remove:async()=>{}}});await c.api.preview();c.storage.set('ops-cloud-session-v1','other');await assert.rejects(c.api.publish(),/登录已变化/);assert.equal(saved,0);assert.equal(c.calls.length,1);assert(!c.storage.has('workspace-pending-upload-v1'))});

test('version checks are metadata-only, throttled, and leave loaded rows unchanged',async()=>{
 const source=client().api.data(),c=client('?audience=display',[{sha:'old'},{sha:'old',data:source},{sha:'new'}]);await c.api.ready;const before=JSON.stringify(c.api.data());await c.api.checkVersion();await c.api.checkVersion();assert.equal(c.calls.length,3);assert(c.calls[2].url.endsWith('?meta=1'));assert.equal(c.api.state().sha,'old');assert.equal(c.api.state().availableSha,'new');assert.equal(JSON.stringify(c.api.data()),before);
});
test('version checks do not run on input and reject an account change during the request',async()=>{
 const local=client();await local.api.checkVersion();assert.equal(local.calls.length,0);
 const c=client('?audience=display',[{sha:'old'},{sha:'old',data:client().api.data()},{sha:'new'}]);await c.api.ready;const fetch=c.w.fetch;c.w.fetch=async(...args)=>{const r=await fetch(...args);c.storage.set('ops-cloud-session-v1','other');return r};await assert.rejects(c.api.checkVersion(),/账号已变化/);assert.equal(c.api.state().sha,'old');assert(!c.api.state().availableSha);
});
test('background processing uses stage descriptions instead of upload percentages and pausing only stops waiting',async()=>{
 const messages=[],c=client('',[{writeConfigured:true,sha:null,uploadProtocol:'chunks-v1'},{missing:[]},{pending:true,background:true,confirmedParts:0,totalParts:100}],undefined,undefined,{parent:{postMessage:m=>messages.push(m)}});
 const fetch=c.w.fetch;c.w.fetch=async(...args)=>{const r=await fetch(...args);if(args[1].body&&JSON.parse(args[1].body).action==='commit')c.api.pause();return r};await c.api.preview();await assert.rejects(c.api.publish(),/后台任务仍会继续/);assert(messages.some(m=>m.message.includes('等待 GitHub 后台接单')));assert(messages.filter(m=>m.stage==='commit').every(m=>!/[0-9]+%/.test(m.message)));assert(!c.storage.has('workspace-last-publication'));assert.equal(JSON.parse(c.storage.get('workspace-pending-upload-v1')).phase,'commit');
});

test('unchanged saved data and freshly checked cloud version skip uploads and background dispatch',async()=>{
 const data=client().api.data();data.storage['logistics-company-directory-v1']=[{id:'c',name:'synthetic'}];const raw=JSON.stringify(data),dataHash=crypto.createHash('sha256').update(raw).digest('hex'),last={sha:'same',savedAt:'2026-11-02',dataHash},storage=new Map([['logistics-company-directory-v1',JSON.stringify(data.storage['logistics-company-directory-v1'])],['ops-cloud-session-v1','session'],['workspace-last-publication',JSON.stringify(last)]]),c=client('',[{writeConfigured:true,sha:'same',uploadProtocol:'chunks-v1'},{sha:'same'}],storage);
 const before=JSON.stringify(c.api.data()),p=await c.api.preview();assert.equal(p.alreadyPublished,true);assert.equal(c.calls.length,1);assert.equal(c.calls[0].options.method,'GET');const r=await c.api.publish();assert.equal(r.unchanged,true);assert.equal(r.verified,true);assert.equal(r.sha,'same');assert.equal(c.calls.length,2);assert(c.calls.every(x=>x.options.method==='GET'));assert.equal(JSON.stringify(c.api.data()),before);assert(!c.storage.has('workspace-pending-upload-v1'));
});

test('same-count edits, unknown old receipts or changed cloud versions cannot skip publication',async()=>{
 const data=client().api.data();data.storage['logistics-company-directory-v1']=[{id:'c',name:'synthetic'}];const raw=JSON.stringify(data),dataHash=crypto.createHash('sha256').update(raw).digest('hex');for(const last of [{sha:'other',savedAt:'today',dataHash},{sha:'same',savedAt:'today'},{sha:'same',savedAt:'today',dataHash:'0'.repeat(64)}]){const c=client('',[{writeConfigured:true,sha:'same'}],new Map([['logistics-company-directory-v1',JSON.stringify(data.storage['logistics-company-directory-v1'])],['ops-cloud-session-v1','session'],['workspace-last-publication',JSON.stringify(last)]]));assert.equal((await c.api.preview()).alreadyPublished,false)}
 const last={sha:'same',savedAt:'today',dataHash},c=client('',[{writeConfigured:true,sha:'same'},{sha:'changed'}],new Map([['logistics-company-directory-v1',JSON.stringify(data.storage['logistics-company-directory-v1'])],['ops-cloud-session-v1','session'],['workspace-last-publication',JSON.stringify(last)]]));await c.api.preview();await assert.rejects(c.api.publish(),/云端版本已变化.*重新预览/);assert(c.calls.every(x=>x.options.method==='GET'));assert.equal(JSON.parse(c.storage.get('workspace-last-publication')).sha,'same');
});

test('restored task identifies the backend wait without uploading or dispatching anything during preview',async()=>{
 const raw=JSON.stringify(client().api.data()),session=crypto.createHash('sha256').update('session').digest('hex'),id='saved';const c=client('',[],new Map([['ops-cloud-session-v1','session'],['workspace-pending-upload-v1',JSON.stringify({id,session,confirmed:4,total:4,phase:'commit'})]]),undefined,{WorkspaceUploadTasks:{load:async()=>({frozen:true,raw,operationId:id,total:4})}});const p=await c.api.preview();assert.equal(p.resuming,true);assert.equal(p.phase,'commit');assert.equal(p.confirmed,4);assert.equal(c.calls.length,0);
});

test('all backend milestone values remain stages, never imply verified publication',async()=>{
 const messages=[],c=client('',[{writeConfigured:true,sha:null,uploadProtocol:'chunks-v1'},{missing:[]},...[0,25,35,90,95].map(confirmedParts=>({pending:true,background:true,confirmedParts,totalParts:100}))],undefined,undefined,{parent:{postMessage:m=>messages.push(m)}});const fetch=c.w.fetch;c.w.fetch=async(...args)=>{const r=await fetch(...args);if(c.calls.length===7)c.api.pause();return r};await c.api.preview();await assert.rejects(c.api.publish(),/后台任务仍会继续/);const stages=messages.filter(x=>x.stage==='commit');assert(stages.some(x=>x.message.includes('读取并校验')));assert(stages.some(x=>x.message.includes('生成、加密')));assert(stages.some(x=>x.message.includes('核验回执')));assert(stages.every(x=>!/[0-9]+%/.test(x.message)));assert(!c.storage.has('workspace-last-publication'));
});
test('explicit cache repair downloads safely after automatic load stops',async()=>{
 const {create}=require('./display-cache.js'),{IDBFactory}=require('../../modules/new-product-followup/work/qa/node_modules/fake-indexeddb'),store=create(new IDBFactory()),source=client().api.data(),scope='a'.repeat(64),responses=[{sha:'old',cacheScope:scope},{sha:'old',data:source}];
 const a=client('?audience=display',responses,undefined,undefined,{WorkspaceDisplayCache:store});await a.api.ready;
 a.storage.set('logistics-quotes-v1','{}');
 const broken={load:async()=>null,save:store.save,loadPart:store.loadPart,savePart:store.savePart,verify:store.verify};
 const replies=[{sha:'new',cacheScope:scope},{sha:'new',cacheScope:scope},{ok:false,status:401,error:'download denied'},{sha:'new',cacheScope:scope},{sha:'new',data:source}];
 const b=client('?audience=display',replies,a.storage,undefined,{document:{},WorkspaceDisplayCache:broken,WorkspaceDelta:{apply(){}}});
 await assert.rejects(b.api.ready,e=>e.code==='CACHE_REPAIR_REQUIRED');assert.equal(b.calls.length,1);const prior=b.storage.get('logistics-quotes-v1');await assert.rejects(b.api.load({repair:true}),/download denied/);assert.equal(b.storage.get('logistics-quotes-v1'),prior);await b.api.load({repair:true});assert.equal(b.api.state().sha,'new');assert.equal(b.calls.length,5);
});

test('confirmed carry survives encrypted publication and matches two separate viewers; skip and expiry take effect',async()=>{
 const W=require('../logistics-rating/extensions/weekly-carryover.js'),M=require('./data-management.js');
 const {encryptWorkspace,decryptWorkspace}=await import('../../cloud/logistics-workspace.mjs');
 const env={ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64')};
 const extensions={WeeklyCarryover:W,WorkspaceDataManagement:M};
 const q='logistics-quotes-v1',companies='logistics-company-directory-v1',sha='a'.repeat(40),secondSha='b'.repeat(40),thirdSha='c'.repeat(40),today='2026-11-09',savedAt='2026-11-09T12:00:00Z';
 const row={companyId:'a',company:'测试公司',country:'英国',warehouse:'BHX1',channel:'海运',price:1000,currency:'CNY',unit:'kg',min:10,max:20,date:'2026-11-06',terms:'普货'};
 const original={quotes:[row],regionalQuotes:[{...row,regionRaw:'BHX1'}],templates:[{country:'英国',warehouse:'BHX1'}]};
 const retained=W.choose(original,today,'keep'),responses=[{writeConfigured:true,weeklyCarryover:1,sha:null}];
 const publisher=client('',responses,undefined,undefined,extensions);
 publisher.storage.set(companies,JSON.stringify([{id:'a',name:row.company,aliases:[]}]));
 publisher.storage.set(q,JSON.stringify(retained));
 await publisher.api.preview();
 const cloudSource=await decryptWorkspace(await encryptWorkspace(M.projection(publisher.api.data()),env,{savedAt}),env);
 responses.push({ok:true,sha,savedAt},{sha,savedAt,data:cloudSource});
 const receipt=await publisher.api.publish();
 assert.equal(receipt.sha,sha);
 assert.equal((await publisher.api.publicationStatus()).status,'published');
 assert.deepEqual(JSON.parse(publisher.calls[1].options.body).data,cloudSource);
 const declined=W.choose(retained,today,'skip');
 publisher.storage.set(q,JSON.stringify(declined));
 assert.equal((await publisher.api.publicationStatus()).status,'changed');
 const after=await decryptWorkspace(await encryptWorkspace(M.projection(publisher.api.data()),env,{savedAt}),env);
 const fresh={...row,date:today,price:1200};
 publisher.storage.set(q,JSON.stringify(W.replaceProviders({...retained,quotes:[fresh],regionalQuotes:[]},[fresh],()=>null,today)));
 const replaced=await decryptWorkspace(await encryptWorkspace(M.projection(publisher.api.data()),env,{savedAt}),env);
 const first=client('?audience=display',[{sha},{sha,savedAt,data:cloudSource},{sha:secondSha},{sha:secondSha,savedAt,data:after},{sha:thirdSha},{sha:thirdSha,savedAt,data:replaced}],undefined,undefined,extensions);
 const second=client('?audience=display',[{sha},{sha,savedAt,data:cloudSource}],new Map([['ops-cloud-session-v1','second-viewer']]),undefined,extensions);
 await Promise.all([first.api.ready,second.api.ready]);
 assert.equal(second.calls[0].options.headers.Authorization,'Bearer second-viewer');
 for(const viewer of [first,second]){
  const local=W.effective(retained,today),remote=W.effective(viewer.api.data().storage[q],today);
  assert.deepEqual(remote.quotes,local.quotes);assert.deepEqual(remote.regionalQuotes,local.regionalQuotes);
  assert.equal(remote.quotes[0].date,'2026-11-06');
  assert.equal(W.effective(viewer.api.data().storage[q],'2026-11-16').carriedQuotes.length,0);
 }
 await first.api.load();assert.equal(first.api.state().sha,secondSha);
 assert.equal(W.effective(first.api.data().storage[q],today).quotes.length,0);
 assert.equal(W.effective(first.api.data().storage[q],today).regionalQuotes.length,0);
 await first.api.load();assert.equal(first.api.state().sha,thirdSha);
 assert.deepEqual(W.effective(first.api.data().storage[q],today).quotes,[fresh]);
 assert.equal(W.effective(first.api.data().storage[q],today).carriedRegions.length,0);
});
test('an older backend is rejected before publishing a carry decision and the local copy is preserved',async()=>{
 const W=require('../logistics-rating/extensions/weekly-carryover.js');
 const c=client('',[{writeConfigured:true,sha:null}],undefined,undefined,{WeeklyCarryover:W});
 const key='logistics-quotes-v1',value=JSON.stringify(W.choose({quotes:[],templates:[]},'2026-11-09','skip'));
 c.storage.set(key,value);await assert.rejects(c.api.preview(),/线上尚未启用上周报价同步/);
 assert.equal(c.calls.length,1);assert.equal(c.storage.get(key),value);
 assert.equal(c.storage.has('workspace-last-publication'),false);
});

test('publication preview sends only the queued scope and detects a same-provider revision across reopen',async()=>{
 const B=require('../logistics-rating/extensions/supplier-quote-batch.js'),q='logistics-quotes-v1',d='logistics-company-directory-v1';
 const sha='a'.repeat(40),next='b'.repeat(40),day=new Date().toLocaleDateString('sv-SE'),company={id:'a',name:'甲物流',aliases:[]};
 const row={companyId:'a',company:'甲物流',country:'英国',regionRaw:'范围',channel:'空运',price:2500,currency:'CNY',unit:'kg',date:day,terms:'普货'};
 const pending=B.capture({},[],[row],[company],crypto.randomUUID()).pendingQuoteBatches;
 const cloud=client().api.data();cloud.storage[d]=[company];cloud.storage[q].regionalQuotes=[{...row,price:2000}];
 const meta={writeConfigured:true,uploadProtocol:'chunks-v1',supplierQuoteBatch:true,sha};
 const c=client('',[meta,{sha,data:cloud}],undefined,undefined,{SupplierQuoteBatch:B});
 c.storage.set(q,JSON.stringify({quotes:Array(410).fill({}),templates:[],pendingQuoteBatches:pending}));
 const preview=await c.api.preview();assert(preview.batch);assert.equal(preview.counts.regional,1);assert.equal(preview.counts.quotes,0);
 assert(c.calls.every(call=>call.options.method==='GET'));
 const changed=structuredClone(cloud);changed.storage[q].regionalQuotes[0].price=2200;
 const reopened=client('',[{...meta,sha:next},{sha:next,data:changed}],c.storage,undefined,{SupplierQuoteBatch:B});
 await assert.rejects(reopened.api.preview(),/同一服务商的同类型报价已变更/);
 assert.equal(JSON.parse(c.storage.get(q)).pendingQuoteBatches.length,1);
});

test('batch publish sends fragments, verifies the receipt and then clears only the confirmed local batch',async()=>{
 const B=require('../logistics-rating/extensions/supplier-quote-batch.js'),q='logistics-quotes-v1',d='logistics-company-directory-v1';
 const sha='a'.repeat(40),next='b'.repeat(40),day=new Date().toLocaleDateString('sv-SE'),company={id:'a',name:'甲物流',aliases:[]};
 const row={companyId:'a',company:'甲物流',country:'英国',regionRaw:'范围',channel:'空运',price:2500,currency:'CNY',unit:'kg',date:day,terms:'普货'};
 const make=()=>B.capture({},[],[row],[company],crypto.randomUUID()).pendingQuoteBatches[0];
 const first=make(),second=make(),shared=client().api.data(),responses=[];
 shared.storage[d]=[company];
 const c=client('',responses,undefined,undefined,{SupplierQuoteBatch:B,btoa});
 const read=()=>JSON.parse(c.storage.get(q));
 c.w.Domain.withWriteLock=fn=>fn();
 c.w.ComparisonStore={read,commit:db=>c.storage.set(q,JSON.stringify(db))};
 c.storage.set(q,JSON.stringify({quotes:Array(410).fill({}),templates:[],pendingQuoteBatches:[first,second]}));
 responses.push({writeConfigured:true,uploadProtocol:'chunks-v1',supplierQuoteBatch:true,sha},{sha,data:shared});
 assert((await c.api.preview()).batch);
 const expectedScope=await B.scopeHash(shared,first,day);
 const contentHash=crypto.createHash('sha256').update(JSON.stringify({...first,expectedScope})).digest('hex');
 responses.push({missing:[0],publicationSafety:'verified-base-v1'},{ok:true},{receipt:{ok:true,verified:true,contentHash,sha:next,savedAt:day}});
 const receipt=await c.api.publish();assert.equal(receipt.regionalQuotes,1);
 assert.deepEqual(read().pendingQuoteBatches,[second]);
 const reopened=client('',[],c.storage,undefined,{SupplierQuoteBatch:B});
 assert.equal(reopened.api.state().lastBatchPublication.sha,next);assert.equal(read().quotes.length,410);
 const part=JSON.parse(c.calls[3].options.body),uploaded=JSON.parse(Buffer.from(part.content,'base64').toString());
 assert.equal(uploaded.id,first.id);assert.equal(uploaded.quotes.length,0);assert.equal(uploaded.regionalQuotes.length,1);
});

test('an older first batch reports its actual supplier and dates without hiding a later supplier or writing data',async()=>{
 const B=require('../logistics-rating/extensions/supplier-quote-batch.js'),q='logistics-quotes-v1',d='logistics-company-directory-v1';
 const day=new Date().toLocaleDateString('sv-SE'),yesterday=new Date(Date.now()-86400000).toLocaleDateString('sv-SE');
 const companies=[{id:'old',name:'合成旧批次物流',aliases:[]},{id:'new',name:'合成新区域物流',aliases:[]}];
 const row=(company,date)=>({companyId:company.id,company:company.name,country:'美国',regionRaw:'邮编8开头',channel:'空运',price:2500,currency:'CNY',unit:'kg',date,terms:'普货'});
 const old=B.capture({},[],[row(companies[0],yesterday)],companies,crypto.randomUUID()).pendingQuoteBatches[0];
 const next=B.capture({},[],[row(companies[1],day)],companies,crypto.randomUUID()).pendingQuoteBatches[0];
 const cloud=client().api.data();cloud.storage[d]=companies;cloud.storage[q].regionalQuotes=[row(companies[0],day)];
 const originalCloud=JSON.stringify(cloud),meta={sha:'a'.repeat(40),writeConfigured:true,uploadProtocol:'chunks-v1',supplierQuoteBatch:true};
 const c=client('',[meta,{sha:meta.sha,data:cloud},meta,{sha:meta.sha,data:cloud}],undefined,undefined,{SupplierQuoteBatch:B,Domain:{directory(){},bills(){},ratings(){},withWriteLock:fn=>fn()}});
 c.w.ComparisonStore={read:()=>JSON.parse(c.storage.get(q)),commit:db=>c.storage.set(q,JSON.stringify(db))};
 c.storage.set(q,JSON.stringify({quotes:[],templates:[],regionalQuotes:[row(companies[1],day)],pendingQuoteBatches:[old,next]}));
 const before=JSON.stringify([...c.storage]);
 await assert.rejects(c.api.preview(),error=>{
  assert.equal(error.code,'NEWER_SUPPLIER_QUOTES');assert.match(error.message,/合成旧批次物流.*区域报价/);
  assert(error.message.includes(yesterday));assert(error.message.includes(day));
  assert.equal(error.publicationIssue.providers[0],companies[0].name);assert.equal(error.publicationIssue.nextProviders[0],companies[1].name);assert.equal(error.publicationIssue.queueLength,2);
  return true;
 });
 assert.equal(JSON.stringify([...c.storage]),before);assert.equal(JSON.stringify(cloud),originalCloud);
 await assert.rejects(c.api.publish(),/预览/);
 await c.api.deferBatch();const preview=await c.api.preview();
 assert.equal(preview.providers[0],companies[1].name);assert.equal(preview.counts.regional,1);
 assert.deepEqual(JSON.parse(c.storage.get(q)).regionalQuotes,[row(companies[1],day)]);
 assert.equal(JSON.parse(c.storage.get(q)).pendingQuoteBatches.length,2);
 assert(c.calls.every(call=>call.options.method==='GET'));assert.equal(JSON.stringify(cloud),originalCloud);
});

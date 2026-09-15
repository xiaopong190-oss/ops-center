import callerModule from '../amazon-growth/gateway/caller.js';
import evidenceModule from '../amazon-growth/gateway/evidence.js';
import {analyzeRequest} from './keyword/server/services/analyze.js';

const enc = new TextEncoder();
const origins = new Set(['https://xiaopong190-oss.github.io']);
const shared = new Set(['agents.json','global-config.json','kpi-monthly.json','lingxing-sku-db.json','logistics.json','production.json','tasks.json','tools-links.json']);
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
const json = (data, status=200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
const hex = bytes => [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
const hash = async s => hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
async function passwordHash(password, salt=crypto.randomUUID()) {
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  return salt+':'+hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100000},key,256));
}
async function matches(value, stored) { return !!stored && await passwordHash(String(value),stored.split(':')[0])===stored; }
async function get(env,key) { const row=await env.DB.prepare('SELECT value FROM records WHERE key=?').bind(key).first();return row?JSON.parse(row.value):null; }
async function put(env,key,value) { await env.DB.prepare('INSERT INTO records(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(value)).run(); }
async function body(req) { const text=await req.text();if(text.length>3000000)fail(413,'请求过大');try{return JSON.parse(text);}catch{fail(400,'无效 JSON');} }
async function quota(env,key,max,seconds) {
  const bucket=key+':'+Math.floor(Date.now()/1000/seconds);
  const row=await env.DB.prepare('INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,Date.now()+seconds*1000).first();
  if(row.count>max)fail(429,'请求过于频繁，请稍后再试');
}
function publicConfig(record) {
  return {...record,data:{staff:(record?.data?.staff||[]).map(({name,role,canEdit,autoShare})=>({name,role,canEdit,autoShare})),superAutoShare:record?.data?.superAutoShare===true,cloudManaged:true}};
}
function userFor(config,name,auth) {
  if(auth==='super')return {id:'super',name:'超级管理员',role:'super',auth:'super',canEdit:true};
  const s=config.data.staff.find(s=>s.name===name);
  return s?{id:s.name,name:s.name,role:s.role,auth:'staff',canEdit:s.canEdit!==false,autoShare:s.autoShare===true}:null;
}
async function session(req,env,optional=false) {
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
  if(!token){if(optional)return null;fail(401,'请重新登录');}
  const s=await env.DB.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').bind(await hash(token),Date.now()).first();
  if(!s){if(optional)return null;fail(401,'登录已过期，请重新登录');}
  const cfg=await get(env,'global-config.json');
  const user=userFor(cfg,s.name,s.auth);
  const version=s.auth==='super'?cfg.data.superHash:cfg.data.staff.find(x=>x.name===s.name)?.codeHash;
  if(!user||version!==s.version)fail(401,'账号或 M 码已变更，请重新登录');
  return user;
}
function admin(u) { if(u?.auth!=='super')fail(403,'仅超级管理员可管理'); }
async function encrypt(env,data,decode=false) {
  const key=await crypto.subtle.importKey('raw',Uint8Array.from(atob(env.ENCRYPTION_KEY),c=>c.charCodeAt(0)), 'AES-GCM',false,['encrypt','decrypt']);
  if(decode){const a=Uint8Array.from(atob(data),c=>c.charCodeAt(0));return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:a.slice(0,12)},key,a.slice(12))));}
  const iv=crypto.getRandomValues(new Uint8Array(12));const bytes=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(data))));
  return btoa(String.fromCharCode(...iv,...bytes));
}
async function connections(env){const blob=await get(env,'_connections');return blob?encrypt(env,blob,true):JSON.parse(env.MCP_CONNECTIONS||'[]');}
function safeConnections(list){return list.map(c=>({id:c.id,name:c.name,provider:c.provider,enabled:c.enabled,host:new URL(c.endpoint).host,hasKey:!!c.key,authHeader:c.authHeader,authPrefix:c.authPrefix}));}
function validateConnection(c){
  let u;try{u=new URL(c.endpoint);}catch{fail(400,'无效 MCP 地址');}
  if(u.protocol!=='https:'||u.username||u.password||u.hash||!['mcp.xydc.com','mcp.sellersprite.com'].includes(u.hostname))fail(400,'仅支持西柚与卖家精灵官方 HTTPS MCP 地址');
  if(!['xiyou','sellersprite'].includes(c.provider)||!c.name||c.name.length>80)fail(400,'连接名称或平台无效');
  if(!/^[A-Za-z0-9-]+$/.test(c.authHeader)||/^(host|origin|cookie|content-length)$/i.test(c.authHeader)||/[\r\n]/.test(c.key+c.authPrefix))fail(400,'鉴权格式错误');
}
function fileAccess(file,u,write=false){
  if(file==='global-config.json'){if(write)admin(u);return;}
  if(!u)fail(401,'请登录');
  if(write&&u.canEdit===false)fail(403,'当前账号没有修改权限');
  if(shared.has(file))return;
  if(file.startsWith('playbook-u-')&&file.endsWith('.json')) {
    let name;try{name=Buffer.from(file.slice(11,-5),'base64url').toString('utf8');}catch{fail(400,'文件名无效');}
    if(u.auth==='super'||name===u.id)return;
  }
  fail(403,'不能访问其他运营的数据');
}
async function secureConfig(input,prev) {
  if(!input||!Array.isArray(input.staff)||input.staff.length>300)fail(400,'员工名单格式错误');
  const old=prev?.data||{};
  const superHash=input.superPassword?await passwordHash(String(input.superPassword)):old.superHash;
  const opsHash=input.opsPassword?await passwordHash(String(input.opsPassword)):old.opsHash;
  if(!superHash||!opsHash)fail(400,'请设置管理员及默认 M 码');
  const staff=[];const names=new Set();
  for(const item of input.staff){
    const name=String(item.name||'').trim();if(!name||names.has(name)||name.length>80)fail(400,'姓名为空或重复');names.add(name);
    const previous=(old.staff||[]).find(x=>x.name===name);
    const codeHash=item.loginCode?await passwordHash(String(item.loginCode)):previous?.codeHash||opsHash;
    staff.push({name,role:String(item.role||''),canEdit:item.canEdit!==false,autoShare:item.autoShare===true,codeHash});
  }
  return {data:{staff,superHash,opsHash,superAutoShare:input.superAutoShare===true},updatedAt:Date.now(),updatedBy:'超级管理员'};
}
async function handle(req,env) {
  const url=new URL(req.url),p=url.pathname;
  if(p==='/ops-api/health')return json({ok:true,version:'cloud-v1'});
  if(p==='/ops-api/bootstrap') {
    if(!env.BOOTSTRAP_TOKEN||req.headers.get('Authorization')!==`Bearer ${env.BOOTSTRAP_TOKEN}`)fail(403,'禁止访问');
    if(await get(env,'global-config.json'))fail(409,'已初始化，禁止覆盖');
    const b=await body(req),cfg=await secureConfig(b.records['global-config.json'].data,null);
    const rows=Object.entries(b.records).filter(([k])=>shared.has(k)||/^playbook-u-[A-Za-z0-9_-]+\.json$/.test(k));
    const statements=rows.map(([k,v])=>env.DB.prepare('INSERT INTO records(key,value) VALUES(?,?)').bind(k,JSON.stringify(k==='global-config.json'?cfg:v)));
    for(const c of b.connections)validateConnection(c);
    statements.push(env.DB.prepare('INSERT INTO records(key,value) VALUES(?,?)').bind('_connections',JSON.stringify(await encrypt(env,b.connections))));
    await env.DB.batch(statements);return json({ok:true,records:rows.length,staff:cfg.data.staff.length,connections:b.connections.length});
  }
  if(p==='/ops-api/login'&&req.method==='POST'){
    await quota(env,'login:'+await hash(req.headers.get('CF-Connecting-IP')||'unknown'),20,900);
    const b=await body(req),cfg=await get(env,'global-config.json');if(!cfg)fail(503,'后台尚未初始化');
    if(typeof b.password!=='string'||b.password.length>200)fail(400,'M 码格式错误');
    let auth='staff',name=String(b.name||''),version;
    if(await matches(b.password,cfg.data.superHash)){auth='super';name='super';version=cfg.data.superHash;}
    else { const s=cfg.data.staff.find(x=>x.name.toLowerCase()===name.toLowerCase());if(!s||!await matches(b.password,s.codeHash))fail(401,'姓名或 M 码不正确');name=s.name;version=s.codeHash; }
    const token=crypto.randomUUID()+crypto.randomUUID();
    await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').bind(await hash(token),name,auth,version,Date.now()+7*86400000).run();
    return json({token,user:userFor(cfg,name,auth)});
  }
  if(p==='/ops-api/me')return json({user:await session(req,env)});
  if(p==='/ops-api/preferences'&&req.method==='POST'){
    const u=await session(req,env),b=await body(req),cfg=await get(env,'global-config.json');
    if(u.auth==='super')cfg.data.superAutoShare=b.autoShare===true;
    else cfg.data.staff.find(s=>s.name===u.name).autoShare=b.autoShare===true;
    await put(env,'global-config.json',cfg);return json({ok:true});
  }
  if(p==='/ops-api/password'&&req.method==='POST'){
    const u=await session(req,env);if(u.auth==='super')fail(403,'管理员请从员工与 M 码设置修改');
    const b=await body(req),cfg=await get(env,'global-config.json'),s=cfg.data.staff.find(x=>x.name===u.name);
    if(!await matches(b.oldPassword,s.codeHash))fail(403,'原 M 码不正确');
    if(typeof b.newPassword!=='string'||b.newPassword.length<4||b.newPassword.length>128)fail(400,'新 M 码需为 4–128 位');
    s.codeHash=await passwordHash(b.newPassword);await put(env,'global-config.json',cfg);
    await env.DB.prepare('UPDATE sessions SET version=? WHERE token=?').bind(s.codeHash,await hash(req.headers.get('Authorization').slice(7))).run();
    return json({ok:true});
  }
  if(p.startsWith('/ops-api/gist/')){
    const u=await session(req,env,true);
    if(req.method==='GET'){
      const rows=await env.DB.prepare('SELECT key,value FROM records WHERE key NOT LIKE ?').bind('\\_%').all();const files={};
      for(const row of rows.results){try{fileAccess(row.key,u);}catch{continue;}const v=JSON.parse(row.value);files[row.key]={content:JSON.stringify(row.key==='global-config.json'?publicConfig(v):v)};}
      return json({files});
    }
    if(req.method==='PATCH'){
      if(!u)fail(401,'请登录');await quota(env,'write:'+u.id,120,60);
      const b=await body(req);if(!b.files||Object.keys(b.files).length>30)fail(400,'文件请求无效');
      const statements=[];
      for(const [k,v] of Object.entries(b.files)){
        fileAccess(k,u,true);
        if(v===null){if(shared.has(k))fail(400,'不能删除共享表');statements.push(env.DB.prepare('DELETE FROM records WHERE key=?').bind(k));continue;}
        let record;try{record=JSON.parse(v.content);}catch{fail(400,'记录格式错误');}
        if(k==='global-config.json')record=await secureConfig(record.data,await get(env,k));
        statements.push(env.DB.prepare('INSERT INTO records VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,JSON.stringify(record)));
      }
      await env.DB.batch(statements);return json({ok:true});
    }
    fail(405,'方法不允许');
  }
  if(p.startsWith('/api/')){
    const u=await session(req,env);
    if(p==='/api/health')return json({ok:true,mcpEndpointConfigured:(await connections(env)).length>0,anthropicConfigured:!!env.ANTHROPIC_API_KEY});
    const list=await connections(env);
    if(p==='/api/pool')return json({connections:list.filter(c=>c.enabled).map(c=>({id:c.id,provider:c.provider,enabled:true,name:c.provider==='xiyou'?'西柚数据':'卖家精灵数据'}))});
    if(p==='/api/connections'){
      admin(u);if(req.method==='GET')return json({connections:safeConnections(list)});
      const b=await body(req),old=list.find(c=>c.id===b.id);
      if(b.action==='save'){
        const i=b.connection||{},prev=list.find(c=>c.id===i.id);if(i.id&&!prev)fail(404,'连接不存在');
        const c={id:prev?.id||crypto.randomUUID(),provider:i.provider||prev?.provider,name:i.name||prev?.name,endpoint:i.endpoint||prev?.endpoint,key:i.key||prev?.key||'',authHeader:i.authHeader||prev?.authHeader||'Authorization',authPrefix:i.authPrefix??prev?.authPrefix??'Bearer ',enabled:prev?.enabled??true};validateConnection(c);
        if(prev&&new URL(prev.endpoint).origin!==new URL(c.endpoint).origin&&!i.key)fail(400,'更换地址需重新填写密钥');
        if(prev)list[list.indexOf(prev)]=c;else list.push(c);
      }else if(b.action==='toggle'&&old)old.enabled=!old.enabled;
      else if(b.action==='move'&&old){const indices=list.map((c,i)=>c.provider===old.provider?i:-1).filter(i=>i>=0),i=list.indexOf(old),j=indices[indices.indexOf(i)+(b.direction==='up'?-1:1)];if(j!==undefined)[list[i],list[j]]=[list[j],list[i]];}
      else fail(400,'未知操作');
      await put(env,'_connections',await encrypt(env,list));return json({connections:safeConnections(list)});
    }
    const caller=callerModule.createCaller({registry:{list:()=>list,get:id=>list.find(c=>c.id===id&&c.enabled)}});
    if(p==='/api/analyze'&&req.method==='POST'){
      const b=await body(req);
      await quota(env,'keywords:'+u.id,30,86400);
      if(b.source==='mcp')await quota(env,'mcp:'+u.id,500,86400);
      try{return json(await analyzeRequest(b,{createMcpClient(){
        const c=list.find(c=>c.enabled&&c.provider==='sellersprite');if(!c)fail(503,'卖家精灵连接尚未配置');
        const client=new caller.McpSession(c);
        return {listTools:async()=>({tools:await client.connect()}),callTool:async({name,arguments:args})=>({structuredContent:await client.call(name,args)}),close:async()=>{}};
      }}));}catch(e){if(e.name==='ValidationError')fail(400,e.message);throw e;}
    }
    if(p==='/api/explain')fail(503,'AI 解读尚未配置，关键词规则分析仍可使用');
    if(p==='/api/mcp'||p==='/api/connection-rpc'){
      const c=list.find(c=>c.enabled&&(req.headers.get('X-Connection-Id')?c.id===req.headers.get('X-Connection-Id'):c.provider==='xiyou'));if(!c)fail(503,'MCP 连接未配置');
      const b=await body(req);if(!['initialize','notifications/initialized','tools/list','tools/call'].includes(b.method))fail(400,'不支持的 MCP 方法');
      await quota(env,'mcp:'+u.id,500,86400);
      const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream',[c.authHeader]:c.authPrefix+c.key};
      for(const h of ['Mcp-Session-Id','MCP-Protocol-Version'])if(req.headers.get(h))headers[h]=req.headers.get(h);
      const r=await fetch(c.endpoint,{method:'POST',headers,body:JSON.stringify(b),redirect:'manual',signal:AbortSignal.timeout(60000)});
      return new Response(r.body,{status:r.status,headers:{'Content-Type':r.headers.get('Content-Type')||'application/json','Mcp-Session-Id':r.headers.get('Mcp-Session-Id')||'','Cache-Control':'no-store'}});
    }
    if(p.startsWith('/api/evidence/')){
      const b=req.method==='POST'?await body(req):{},store=evidenceModule.createStore({file:'/tmp/unused-evidence.json',memoryOnly:true});
      if(p.endsWith('/stats'))return json(store.stats());
      if(p.endsWith('/estimate'))return json(store.estimate(b.requests||[]));
      if(p.endsWith('/lookup')||p.endsWith('/call')){
        const provider=b.provider==='sellersprite'?'sellersprite':'xiyou',key=u.id+':'+evidenceModule.evidenceKey(provider,b.tool,b.arguments||{});
        const row=await env.DB.prepare('SELECT value FROM evidence WHERE key=? AND expires>?').bind(key,Date.now()).first();
        if(row&&!b.refresh)return json({...JSON.parse(row.value),hit:true});
        if(p.endsWith('/lookup')||b.cacheOnly)return json({key,hit:false,cacheOnly:!!b.cacheOnly});
        await quota(env,'mcp:'+u.id,500,86400);
        const result=await caller.callProvider(provider,b.tool,b.arguments||{},b.connectionId);
        const resultBody={key,hit:false,payload:result.payload,source:result.source,events:result.events,tool:b.tool,provider,retrievedAt:Date.now(),expiresAt:Date.now()+evidenceModule.ttlMs(b.tool)};
        await env.DB.prepare('INSERT INTO evidence VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires').bind(key,JSON.stringify(resultBody),resultBody.expiresAt).run();return json(resultBody);
      }
      if(p.endsWith('/publish')||p.endsWith('/put'))return json({stored:0,skipped:b.items?.length||1,reasons:['云端只缓存经认证的上游调用，请继续使用本地历史']});
      if(p.endsWith('/export'))return json({refs:[]});
    }
    if(p==='/api/claude')fail(503,'LLM API Key 尚未配置；可使用本地规则报告');
    fail(404,'接口不存在');
  }
  if(p.startsWith('/ops-api/'))fail(404,'接口不存在');
  if((p==='/'||p.endsWith('/')||p.endsWith('.html'))&&!url.searchParams.has('embedded'))return Response.redirect('https://xiaopong190-oss.github.io/ops-center/',302);
  const asset=await env.ASSETS.fetch(req);
  return asset;
}
export default {async fetch(req,env){
  const origin=req.headers.get('Origin'),own=new URL(req.url).origin;
  if(origin&&!origins.has(origin)&&origin!==own)return json({error:'来源不允许'},403);
  let r;
  try{r=req.method==='OPTIONS'?new Response(null,{status:204}):await handle(req,env);}catch(e){
    console.error('request_failed',new URL(req.url).pathname,e?.name||'Error',e?.message||String(e));
    r=json({error:e.status?e.message:'服务请求失败，请稍后重试'},e.status||502);
  }
  const headers=new Headers(r.headers);if(origin)headers.set('Access-Control-Allow-Origin',origin);
  headers.set('Vary','Origin');headers.set('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');headers.set('Access-Control-Allow-Headers','Content-Type,Authorization,X-Connection-Id,X-Connection-Admin,X-Proxy-Token,X-Evidence-Client,Mcp-Session-Id,MCP-Protocol-Version');headers.set('Access-Control-Expose-Headers','Mcp-Session-Id');
  headers.set('X-Content-Type-Options','nosniff');
  return new Response(r.body,{status:r.status,headers});
}};

import {Buffer} from 'node:buffer';
export function logisticsStorage(user){
const FOLLOWUP_KEY = '_logistics-backup:'+Buffer.from(user.id).toString('base64url');
const PART_BYTES = 512 * 1024;
const MAX_BYTES = 32 * 1024 * 1024;
const fail = (status,message) => {throw Object.assign(Error(message),{status});};
const sha256 = async bytes => Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
const get = async (env,key) => (await env.DB.prepare('SELECT value FROM records WHERE key=?').bind(key).first())?.value;
const insert = (env,key,value) => env.DB.prepare('INSERT INTO records(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(key,value).run();
async function readParts(env,keys) {
  const values = new Map();
  for (let start=0;start<keys.length;start+=50) {
    const batch=keys.slice(start,start+50);
    const rows=await env.DB.prepare('SELECT key,value FROM records WHERE key IN ('+batch.map(()=>'?').join(',')+')').bind(...batch).all();
    for(const row of rows.results)values.set(row.key,row.value);
  }
  return keys.map(key=>{const value=values.get(key);if(value===undefined)fail(409,'上传分片尚未收齐，原数据未改变');return Buffer.from(value,'base64');});
}
async function readFollowup(env) {
  const raw=await get(env,FOLLOWUP_KEY);
  if(!raw)return {raw:null,snapshot:{revision:0,data:{products:[],records:[],events:[]}}};
  const pointer=JSON.parse(raw);
  if(pointer.storage!=='followup-shards-v1')return {raw,snapshot:pointer};
  const bytes=Buffer.concat(await readParts(env,pointer.parts));
  if(bytes.length!==pointer.bytes||await sha256(bytes)!==pointer.sha256)fail(503,'数据分片校验失败，请联系管理员；历史版本仍保留');
  return {raw,snapshot:JSON.parse(bytes.toString('utf8'))};
}
async function writeFollowup(env,previous,next) {
  const bytes=Buffer.from(JSON.stringify(next),'utf8');
  if(bytes.length>MAX_BYTES)fail(413,'工作台已超过32MB容量保护上限，请导出归档后联系管理员扩容；原数据未改变');
  const version=Date.now()+'-'+crypto.randomUUID(),parts=[];
  // Immutable data parts and the previous root are written before the only live pointer changes.
  for(let offset=0;offset<bytes.length;offset+=PART_BYTES){
    const key=FOLLOWUP_KEY+':version:'+version+':'+parts.length;parts.push(key);
    await insert(env,key,bytes.subarray(offset,offset+PART_BYTES).toString('base64'));
  }
  const pointer=JSON.stringify({storage:'followup-shards-v1',createdAt:Date.now(),revision:next.revision,version,parts,bytes:bytes.length,sha256:await sha256(bytes)});
  if(previous.raw)await insert(env,FOLLOWUP_KEY+':history:'+previous.snapshot.revision+':'+version,previous.raw);
  const result=previous.raw
    ? await env.DB.prepare("UPDATE records SET value=? WHERE key=? AND json_extract(value,'$.revision')=?").bind(pointer,FOLLOWUP_KEY,previous.snapshot.revision).run()
    : await insert(env,FOLLOWUP_KEY,pointer);
  if(Number(result.meta?.changes??result.changes)!==1)fail(409,'其它人员已更新，请刷新后重试；本次修改未覆盖云端');
}
async function uploadFollowup(req,env,user,commit) {
  if(req.method!=='POST')fail(405,'方法不允许');
  if(user.canEdit===false&&user.auth!=='super')fail(403,'当前帐号没有编辑权限');
  const text=await req.text();if(Buffer.byteLength(text)>750000)fail(413,'上传分片过大');
  let input;try{input=JSON.parse(text);}catch{fail(400,'无效上传数据');}
  const {action,id}=input;
  if(!/^[0-9a-f-]{36}$/i.test(id||''))fail(400,'上传编号无效');
  const prefix=FOLLOWUP_KEY+':upload:'+id,owner=user.id;
  if(action==='start'){
    if(!Number.isSafeInteger(input.bytes)||input.bytes<1||input.bytes>MAX_BYTES||!Number.isSafeInteger(input.count)||input.count!==Math.ceil(input.bytes/PART_BYTES)||!/^[0-9a-f]{64}$/.test(input.sha256||''))fail(400,'上传大小或校验信息无效');
    const existing=await get(env,prefix);
    if(existing){const m=JSON.parse(existing);if(m.owner!==owner||m.sha256!==input.sha256||m.bytes!==input.bytes)fail(409,'上传编号冲突');return Response.json({ok:true,id});}
    await insert(env,prefix,JSON.stringify({owner,bytes:input.bytes,count:input.count,sha256:input.sha256,expires:Date.now()+86400000}));
    return Response.json({ok:true,id});
  }
  const raw=await get(env,prefix);if(!raw)fail(404,'上传会话不存在，请重试');
  const manifest=JSON.parse(raw);
  if(manifest.owner!==owner)fail(403,'不能操作其它运营的上传');
  if(manifest.expires<Date.now())fail(410,'上传会话已过期，请重新上传');
  if(action==='part'){
    if(!Number.isInteger(input.index)||input.index<0||input.index>=manifest.count||typeof input.content!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.content))fail(400,'分片格式无效');
    const bytes=Buffer.from(input.content,'base64'),expected=input.index===manifest.count-1?manifest.bytes-input.index*PART_BYTES:PART_BYTES;
    if(bytes.length!==expected||bytes.toString('base64')!==input.content)fail(400,'分片大小或编码错误');
    const key=prefix+':'+input.index;
    await insert(env,key,input.content);
    if(await get(env,key)!==input.content)fail(409,'同一分片内容不一致');
    return Response.json({ok:true,index:input.index});
  }
  if(action!=='commit')fail(400,'上传操作无效');
  const bytes=Buffer.concat(await readParts(env,Array.from({length:manifest.count},(_,i)=>prefix+':'+i)));
  if(bytes.length!==manifest.bytes||await sha256(bytes)!==manifest.sha256)fail(400,'上传校验失败，原数据未改变');
  return commit(bytes.toString('utf8'));
}

return {read:readFollowup,write:writeFollowup,upload:uploadFollowup};
}

const STORE_NAME = 'product-followup-complete-v1';
const freshData = () => ({products:[],records:[],events:[]});
let memoryData = freshData(), storageMode = 'loading';
const storageReady = new Promise(resolve => {
  try {
    const request = indexedDB.open(STORE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspace');
    request.onsuccess = () => { storageMode='persistent'; resolve(request.result); };
    request.onerror = () => { storageMode='session'; resolve(null); };
    request.onblocked = () => { storageMode='session'; resolve(null); };
  } catch { storageMode='session'; resolve(null); }
});
function safeActor(value) {
  try { if(value!==undefined)localStorage.setItem('product-workspace-actor',value); return localStorage.getItem('product-workspace-actor')||''; }
  catch { return value||''; }
}
function validBody(kind, body) {
  const specs=kind==='product'?productFields:configs[kind];
  if(!specs||!body||typeof body!=='object'||Array.isArray(body))throw Error('记录格式无效');
  const out={};
  for(const [key,label,type,options] of specs){
    let v=body[key];
    if(v===undefined||v===null||v===''){out[key]='';continue;}
    if(type==='number'){
      if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>Number.MAX_SAFE_INTEGER)throw Error(label+'需填写有效范围内的非负数字');
      if(['quantity','orders'].includes(key)&&!Number.isSafeInteger(v))throw Error(label+'需填写非负整数');
      out[key]=v;continue;
    }
    if(typeof v!=='string'||v.length>4000)throw Error(label+'格式无效或内容过长');
    v=v.trim();
        if(kind==='product'&&key==='stage')v=optimizationStage(v);
    if(type==='select'&&!options.includes(v))throw Error(label+'请选择有效选项');
    if(type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v))throw Error(label+'日期无效');
    if(type==='datetime-local'&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'Z'))||new Date(v+'Z').toISOString().slice(0,16)!==v))throw Error(label+'无效');
    if(type==='url'){
      let u;try{u=new URL(v);}catch{throw Error('证据链接无效');}
      if(!['http:','https:'].includes(u.protocol)||!u.hostname)throw Error('证据链接需为 http 或 https 地址');
    }
    out[key]=v;
  }
  const required=kind==='product'?['name','sku','owner','stage','operating','health','purpose','issue','next','due']:kind==='optimization'?['title','owner','problem','plan','metric','baseline','target','start','due','status']:kind==='operation'?['owner','status','purpose','issue','next','due','target']:kind==='task'?['title','owner','due','target','status']:kind==='campaign'?['title','owner','channel','target','status']:['title','status'];
  for(const key of required)if(out[key]==='')throw Error('请填写'+specs.find(s=>s[0]===key)[1]);
  if((kind==='task'&&out.status==='已验证')||(kind==='campaign'&&out.status==='已完成'))if(!out.result||!out.evidence)throw Error('标记完成验证前，请填写实际结果及证据链接');
  if(kind==='operation'&&out.status==='已完成'&&(!out.result||!out.evidence))throw Error('完成运营分工前，请填写结果与证据');
  if(kind==='optimization'&&out.status==='已完成'&&(!out.actual||!out.result||!out.evidence))throw Error('完成优化前，请填写实际值、验证结论与证据');
  if(kind==='shipment'&&out.status==='已签收'&&(!out.arrived||!out.evidence))throw Error('已签收需填写实际到货日及物流凭证链接');
  if(out.start&&out.due&&out.start>out.due)throw Error('结束日期不能早于开始日期');
  if(kind==='shipment'&&out.shipped&&out.arrived&&out.shipped>out.arrived)throw Error('实际到货日不能早于实际发货日');
  return out;
}
function applyChange(current,input){
  const next=structuredClone(current), {kind}=input, body=validBody(kind,input.body);
  const actor=typeof input.actor==='string'?input.actor.trim():'',reason=typeof input.reason==='string'?input.reason.trim():'';
  if(!actor||actor.length>100)throw Error('请填写操作人（不超过100字）');
  if(!reason||reason.length>2000)throw Error('请填写变更原因（不超过2000字）');
  const rows=kind==='product'?next.products:next.records;
  const old=input.id?rows.find(r=>r.id===input.id):null;
  if(input.id&&!old)throw Error('记录不存在');
  if(old?.deleted_at)throw Error('该记录已删除，不能继续修改');
  if(old&&old.version!==input.version)throw Error('记录已被更新，请刷新后重新编辑');
  if(old&&kind!=='product'&&old.kind!==kind)throw Error('记录类型不一致');
  const id=old?.id||crypto.randomUUID(),pid=kind==='product'?id:old?.product_id||input.productId;
  if(kind!=='product'&&!next.products.some(p=>p.id===pid&&!p.deleted_at))throw Error('关联产品不存在');
  if(body.operationId){
    const assignment=next.records.find(r=>r.id===body.operationId&&r.kind==='operation'&&r.product_id===pid&&!r.deleted_at);
    if(!assignment)throw Error('关联运营分工不存在或不属于当前产品');
  }
  if(body.optimizationId&&!next.records.some(r=>!r.deleted_at&&r.kind==='optimization'&&r.id===body.optimizationId&&r.product_id===pid))throw Error('关联优化方案不存在或不属于当前产品');
  if(kind==='operation'&&next.records.some(r=>!r.deleted_at&&r.id!==id&&r.kind==='operation'&&r.product_id===pid&&['owner','store','site'].every(k=>r.body[k]===body[k])))throw Error('该产品、店铺、站点已为此运营建立分工，请更新现有分工');
  if(kind==='product'&&next.products.some(p=>p.id!==id&&p.body.sku.normalize('NFKC').toLowerCase()===body.sku.normalize('NFKC').toLowerCase()))throw Error('SKU已存在，请填写唯一SKU');
  const now=new Date().toISOString();
  const row={id,body,version:(old?.version||0)+1,updated_at:now,...(kind==='product'?{}:{kind,product_id:pid})};
  if(old)rows.splice(rows.indexOf(old),1);
  rows.unshift(row);
  next.events.unshift({id:crypto.randomUUID(),product_id:pid,actor,reason,action:(old?'更新':'新增')+kindName[kind],before:old?JSON.stringify(old.body):null,after:JSON.stringify(body),created_at:now});
  return {next,result:{ok:true,id}};
}
function applyDeletion(current,input){
  const next=structuredClone(current),rows=input.kind==='product'?next.products:next.records;
  const row=rows.find(r=>r.id===input.id&&!r.deleted_at);
  if(!row||(input.kind!=='product'&&row.kind!==input.kind))throw Error('记录不存在或已删除');
  if(row.version!==input.version)throw Error('记录已被更新，请刷新后重试删除');
  const actor=typeof input.actor==='string'?input.actor.trim():'',reason=typeof input.reason==='string'?input.reason.trim():'';
  if(!actor||actor.length>100||!reason||reason.length>2000)throw Error('请填写有效操作人与删除原因');
  if(input.kind==='operation'&&next.records.some(r=>!r.deleted_at&&r.body.operationId===row.id))throw Error('此分工仍有关联记录，请先更新关联记录为产品通用或删除关联记录');
  if(input.kind==='optimization'&&next.records.some(r=>!r.deleted_at&&r.body.optimizationId===row.id))throw Error('此方案仍有跟进事项，请先调整或删除关联事项');
  const now=new Date().toISOString(),targets=input.kind==='product'?[row,...next.records.filter(r=>r.product_id===row.id&&!r.deleted_at)]:[row];
  for(const target of targets){
    target.deleted_at=now;target.deleted_by=actor;target.delete_reason=reason;target.version++;target.updated_at=now;
    next.events.unshift({id:crypto.randomUUID(),product_id:input.kind==='product'?row.id:row.product_id,actor,reason,action:'删除'+kindName[target.kind||'product'],before:JSON.stringify(target.body),after:JSON.stringify({...target.body,deleted:'已删除'}),created_at:now});
  }
  return {next,result:{ok:true,id:row.id,count:targets.length}};
}
async function transact(change){
  const db=await storageReady;
  if(!db){const old=structuredClone(memoryData);if(!change)return old;const changed=change(old);memoryData=changed.next;return changed.result;}
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('workspace',change?'readwrite':'readonly'),store=tx.objectStore('workspace');
    let result,error;
    const request=store.get('data');
    request.onsuccess=()=>{try{const current=request.result||freshData();if(change){const changed=change(current);result=changed.result;store.put(changed.next,'data');}else result=current;}catch(e){error=e;tx.abort();}};
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(error||Error('保存未完成，原记录未变更。请导出备份并检查浏览器存储空间。'));
    tx.onerror=()=>{};
  });
}
async function api(path,body){
  if(path!=='/api/workbench')throw Error('未知操作');
  return transact(body?current=>body.action==='delete'?applyDeletion(current,body):applyChange(current,body):null);
}
function updateStorageLabel(){
  const label=document.getElementById('storage-label');
  if(label)label.textContent=storageMode==='persistent'?'本机保存 · 建议定期导出备份':'仅本次页面 · 关闭前请导出备份';
}
function downloadBackup(snapshot){
  const backup={format:STORE_NAME,exportedAt:new Date().toISOString(),data:snapshot};
  const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='产品跟进备份-'+new Date().toISOString().slice(0,10)+'.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function validateBackup(value){
  if(value?.format!==STORE_NAME)throw Error('请选择本工作台导出的备份文件');
  const d=value.data;
  if(!d||!['products','records','events'].every(k=>Array.isArray(d[k])))throw Error('备份内容不完整');
  const ids=new Set(),skus=new Set(),safeId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
  for(const p of d.products){
    p.body=validBody('product',p.body);
    const sku=p.body.sku.normalize('NFKC').toLowerCase();
    if(!safeId(p.id)||ids.has(p.id)||skus.has(sku)||!Number.isSafeInteger(p.version)||p.version<1||!Number.isFinite(Date.parse(p.updated_at)))throw Error('备份产品标识、SKU、日期或版本无效');
    ids.add(p.id);skus.add(sku);
  }
  const recordIds=new Set();
  for(const r of d.records){
    r.body=validBody(r.kind,r.body);
    if(!configs[r.kind]||!ids.has(r.product_id)||!safeId(r.id)||ids.has(r.id)||recordIds.has(r.id)||!Number.isSafeInteger(r.version)||r.version<1||!Number.isFinite(Date.parse(r.updated_at)))throw Error('备份记录或产品关联无效');
    recordIds.add(r.id);
  }
  for(const r of d.records)if(r.body.operationId&&!d.records.some(a=>a.id===r.body.operationId&&a.kind==='operation'&&a.product_id===r.product_id))throw Error('备份运营关联无效');
  for(const r of d.records)if(r.body.optimizationId&&!d.records.some(a=>a.id===r.body.optimizationId&&a.kind==='optimization'&&a.product_id===r.product_id))throw Error('备份优化方案关联无效');
  const eventIds=new Set();
  for(const e of d.events){
    if(!safeId(e.id)||eventIds.has(e.id)||!ids.has(e.product_id)||!['id','actor','action','reason','after','created_at'].every(k=>typeof e[k]==='string')||!Number.isFinite(Date.parse(e.created_at)))throw Error('备份历史记录无效');
    eventIds.add(e.id);
    const after=JSON.parse(e.after),before=e.before?JSON.parse(e.before):{};
    if(!after||Array.isArray(after)||typeof after!=='object'||!before||Array.isArray(before)||typeof before!=='object')throw Error('备份变更内容无效');
  }
  return d;
}
document.addEventListener('click',async e=>{
  if(e.target.closest('#export-backup'))try{downloadBackup(await api('/api/workbench'));toast('已生成包含全部记录和历史的备份，请保留下载文件。');}catch(err){toast(err.message,true);}
  if(e.target.closest('#import-backup'))document.getElementById('backup-file').click();
});
document.addEventListener('change',async e=>{
  if(e.target.id!=='backup-file'||!e.target.files[0])return;
  try{
    const file=e.target.files[0];if(file.size>20*1024*1024)throw Error('备份文件超过20MB');
    const imported=validateBackup(JSON.parse(await file.text()));
    const current=await api('/api/workbench');
    if(current.products.length||current.records.length||current.events.length)throw Error('当前已有记录。为避免覆盖，请在空白工作空间导入备份。');
    const actor=document.getElementById('actor').value.trim();
    if(!actor||actor.length>100)throw Error('导入前请填写操作人（不超过100字）');
    await transact(current=>{
      if(current.products.length||current.records.length||current.events.length)throw Error('当前已有记录，已取消导入');
      const next=structuredClone(imported),now=new Date().toISOString();
      for(const p of next.products)next.events.unshift({id:crypto.randomUUID(),product_id:p.id,actor,action:'导入备份',reason:'从本机备份恢复产品及关联记录',before:null,after:JSON.stringify(p.body),created_at:now});
      return {next,result:{ok:true}};
    });
    await load();toast('备份已恢复，导入操作已记录到时间线。');
  }catch(err){toast(err.message,true);}finally{e.target.value='';}
});

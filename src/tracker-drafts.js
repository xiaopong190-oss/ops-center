import {mergeTrackerImport} from './tracker-cloud-adapter.js';
function mergeTrackerFields(previous,patch){
  const result={...previous};
  for(const key of Object.keys(patch)){
    if(['__proto__','constructor','prototype'].includes(key))throw Error('无效字段');
    result[key]=patch[key]&&typeof patch[key]==='object'&&!Array.isArray(patch[key])?mergeTrackerFields(previous?.[key]||{},patch[key]):structuredClone(patch[key]);
  }
  return result;
}
export function applyTrackerOperations(original,operations,user={}){
  const visible=structuredClone(original),patch={},events=[];
  let result;
  for(const operation of operations){
    const {type,path,value}=operation,before=structuredClone(visible);
    if(type==='import'){
      const imported=mergeTrackerImport(visible,value);result={added:imported.added,skipped:imported.skipped};
      for(const [key,row] of Object.entries(imported.docs))if(!visible[key]){visible[key]=row;patch[key]=row;}
    }else{
      if(!/^(links|ships|perf)\/[^/]+$/.test(path||''))throw Error('记录路径无效');
      if(type==='update'){
        if(!visible[path])throw Error('记录已被隐藏，请先刷新后重新处理');
        visible[path]=mergeTrackerFields(visible[path],value);patch[path]=visible[path];
      }else if(type==='set'){
        if(visible[path])throw Error('记录已存在，请刷新后编辑');
        visible[path]=structuredClone(value);patch[path]=visible[path];
      }else if(type==='delete'){
        const paths=[path];
        if(path.startsWith('links/'))for(const [key,row] of Object.entries(visible))if(row.linkId===path.slice(6))paths.push(key);
        for(const key of paths){delete visible[key];patch[key]=null;}
      }else throw Error('修改类型无效');
    }
    const keys=Object.keys(visible).filter(key=>JSON.stringify(visible[key])!==JSON.stringify(before[key]));
    for(const key of Object.keys(before))if(!visible[key])keys.push(key);
    events.push({id:operation.id,product_id:'',actor:user.name||'',actor_id:user.id||'',action:'新品大屏'+type,
      reason:'按字段合并运营修改，保留其它运营记录',created_at:operation.createdAt,
      before:JSON.stringify(Object.fromEntries(keys.map(key=>[key,before[key]??null]))),
      after:JSON.stringify(Object.fromEntries(keys.map(key=>[key,visible[key]??null])))});
  }
  return {docs:visible,patch,events,result};
}

export function createTrackerDraftDb({context,cloud,store,onState=()=>{},notify=()=>{}}){
  let pending=[],userId='',error='',saving=false,confirmed='',chain=Promise.resolve();
  const listeners=new Set();
  const uncommitted=operations=>{const ids=new Set(cloud._snapshot()?.data.events.map(event=>event.id)||[]);return operations.filter(operation=>!ids.has(operation.id));};
  const visible=()=>applyTrackerOperations(cloud._dump(),uncommitted(pending),context().user).docs;
  const status=()=>{const snapshot=cloud._snapshot();onState({isDirty:pending.length>0,saving,error,meta:snapshot?{updatedBy:snapshot.updatedBy,updatedAt:snapshot.updatedAt,revision:snapshot.revision}:null,
    barHint:confirmed|| (context().autoShare?'已开启自动分享 · 修改按字段合并 · 操作历史保留':'沿用个人暂存 · 点「保存并上传」后共享给全员'),
    dirtyHint:pending.length+' 项修改已保存在本账号，尚未上传'});};
  const emit=()=>{for(const listener of listeners)listener();status();};
  const serialized=task=>{const result=chain.catch(()=>{}).then(task);chain=result;return result;};
  for(const name of ['links','ships','perf'])cloud.collection(name).onSnapshot(()=>{try{emit();}catch{status();}});
  const requireUser=()=>{
    const c=context();if(!c.canEdit||!c.user?.id||c.user.id==='guest'||userId!==c.user.id)throw Error('当前用户没有编辑权限或数据尚未就绪');return c.user.id;
  };
  const flush=async()=>{
    const identity=requireUser();
    if(!pending.length)return true;
    const batch=structuredClone(pending),ids=new Set(batch.map(operation=>operation.id));
    saving=true;error='';confirmed='';status();
    try{
      await cloud._commit(batch);
      if(context().user?.id!==identity)throw Error('帐号已变化；请回原帐号核对上传状态');
      const remaining=pending.filter(operation=>!ids.has(operation.id));
      await store.save(identity,remaining);
      pending=remaining;confirmed='上传成功 · 云端已确认 · '+new Date().toLocaleTimeString();emit();return true;
    }catch(failure){error='上传未确认：'+failure.message+'；'+pending.length+' 项修改仍保存在本账号本机草稿，请重试上传';status();throw failure;}
    finally{saving=false;status();}
  };
  const stage=(type,path,value)=>serialized(async()=>{
    const identity=requireUser(),operation={id:crypto.randomUUID(),type,path,value:structuredClone(value??null),createdAt:new Date().toISOString()};
    const next=[...pending,operation];
    const applied=applyTrackerOperations(cloud._dump(),uncommitted(next),context().user);
    await store.save(identity,next); // Durable per-account draft precedes UI success.
    if(context().user?.id!==identity)throw Error('帐号已变化，修改仍保存在原帐号草稿');
    pending=next;error='';confirmed='';emit();
    if(context().autoShare)await flush();
    return applied.result;
  });
  const watch=listener=>{listeners.add(listener);queueMicrotask(listener);return()=>listeners.delete(listener);};
  return {
    save:()=>serialized(flush),
    refresh:options=>serialized(async()=>{
      const identity=context().user?.id;
      if(identity!==userId){
        userId=identity;pending=[];error='';await cloud.refresh();
        if(context().user?.id!==identity)return;
        const restored=await store.load(identity)||[];
        if(context().user?.id!==identity)return;
        pending=restored;
      }
      else {if(options?.discardDraft){await store.save(identity,[]);pending=[];}await cloud.refresh();}
      if(context().user?.id!==identity)return;
      // Operations already acknowledged by the cloud are safe to remove after a lost response.
      const committed=new Set(cloud._snapshot()?.data.events.map(event=>event.id)||[]);
      const remaining=pending.filter(operation=>!committed.has(operation.id));
      if(remaining.length!==pending.length){await store.save(identity,remaining);pending=remaining;}
      emit();if(context().autoShare&&pending.length)await flush();
    }),
    clear(){userId='';pending=[];error='';confirmed='';cloud.clear();emit();},
    _dump:visible,_snapshot:cloud._snapshot,
    _load:input=>stage('import','',input).then(result=>notify('已合并补充 '+result.added+' 条；已有 '+result.skipped+' 条保持原样')),
    collection:name=>({onSnapshot:callback=>watch(()=>callback({docs:Object.entries(visible()).filter(([key])=>key.startsWith(name+'/')).map(([key,row])=>({id:key.slice(name.length+1),exists:true,data:()=>structuredClone(row)}))}))}),
    doc:path=>({
      onSnapshot:callback=>watch(()=>callback({exists:!!visible()[path],data:()=>structuredClone(visible()[path])})),
      set:value=>stage('set',path,value),update:value=>stage('update',path,value),delete:()=>stage('delete',path,null),
    }),
  };
}

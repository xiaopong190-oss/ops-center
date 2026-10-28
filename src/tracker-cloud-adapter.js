import {applyTrackerOperations} from './tracker-drafts.js';
// The original workbench collections remain byte-for-byte intact. Tracker edits
// live in an additive namespace in the same revision-controlled cloud document.
export function projectTracker(data) {
  const docs = Object.create(null), productLinks = new Map();
  const live = row => !row.deleted_at;
  for (const product of data.products.filter(live)) {
    const assignments = data.records.filter(r => live(r) && r.kind === 'operation' && r.product_id === product.id);
    const scopes = assignments.length ? assignments : [null];
    productLinks.set(product.id, scopes.map(a => 'legacy-' + (a?.id || product.id)));
    for (const assignment of scopes) {
      const p = product.body, a = assignment?.body || {};
      docs['links/legacy-' + (assignment?.id || product.id)] = {
        sku: p.sku || '', name: p.name || '', owner: a.owner || p.owner || '',
        account: a.account || '', store: a.store || '', site: a.site || '',
        issue: [p.issue, a.issue].filter(Boolean).join('；'), updatedAt: assignment?.updated_at || product.updated_at || '',
        legacyProductId: product.id, legacyOperationId: assignment?.id || null,
      };
    }
  }
  for (const shipment of data.records.filter(r => live(r) && r.kind === 'shipment')) {
    const b = shipment.body, candidates = productLinks.get(shipment.product_id) || [];
    const linkId = b.operationId ? 'legacy-' + b.operationId : candidates.length === 1 ? candidates[0] : null;
    // An unassigned shipment is never silently attributed to an arbitrary shop.
    if (!linkId || !docs['links/' + linkId]) continue;
    const steps = Array.from({length:7}, () => ({status:'wait', date:''}));
    if (b.shipped) steps[0] = {status:'done', date:b.shipped};
    if (b.arrived || b.status === '已签收') steps[5] = {status:'done', date:b.arrived || ''};
    docs['ships/legacy-' + shipment.id] = {linkId, no:b.title || '', shipment:b.shipment || b.tracking || '',
      mode:b.mode || b.method || '', qty:typeof b.quantity === 'number' ? b.quantity : null,
      route:b.route || '', etaPlanned:b.eta || b.due || '', etaLatest:b.eta || b.due || '', steps,
      legacyRecordId:shipment.id};
  }
  for (const [path, value] of Object.entries(data.trackerV1?.docs || {})) {
    if (value === null) delete docs[path]; else docs[path] = structuredClone(value);
  }
  return docs;
}

export function mergeTrackerImport(current, incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw Error('请选择大屏导出的 JSON');
  if (incoming.data && ['products','records','events'].every(key => Array.isArray(incoming.data[key]))) incoming = projectTracker(incoming.data);
  const result = structuredClone(current), idMap = new Map();
  let added = 0, skipped = 0;
  const entries = Object.entries(incoming);
  if (!entries.length || entries.some(([key, value]) => !/^(links|ships|perf)\/[^/]+$/.test(key) || !value || typeof value !== 'object' || Array.isArray(value))) throw Error('文件包含无效记录');
  const identity = row => JSON.stringify([row.sku || '',row.account || '',row.store || '',row.site || '']);
  for (const [path, row] of entries.filter(([key]) => key.startsWith('links/'))) {
    const match = Object.entries(result).find(([key, old]) => key.startsWith('links/') && identity(old) === identity(row));
    if (match) { idMap.set(path.slice(6), match[0].slice(6)); skipped++; continue; }
    if (result[path]) { idMap.set(path.slice(6), path.slice(6)); skipped++; continue; }
    result[path] = structuredClone(row); idMap.set(path.slice(6),path.slice(6)); added++;
  }
  for (const [path, value] of entries.filter(([key]) => !key.startsWith('links/'))) {
    const row = {...value,linkId:idMap.get(value.linkId) || value.linkId};
    if (!result['links/' + row.linkId]) throw Error('货件或经营数据缺少关联链接：' + path);
    if (result[path]) { skipped++; continue; }
    result[path] = row; added++;
  }
  return {docs:result,added,skipped};
}

export function createTrackerCloudDb({context, backup, notify, onError}) {
  let snapshot = null, docs = {}, queue = Promise.resolve(), identity = '';
  const listeners = new Set();
  const emit = () => { for (const listener of listeners) listener(); };
  const install = value => {
    if (snapshot && value.revision < snapshot.revision) return;
    snapshot = value; docs = projectTracker(value.data); emit();
  };
  const request = () => {
    const c = context();
    if (!c.user?.id || c.user.id === 'guest' || !c.cloudRequest) throw Error('请先登录运营中心，共享连接就绪后重试');
    return c.cloudRequest;
  };
  const refresh = async () => {
    const c = context(), userId = c.user?.id;
    if (identity !== userId) { identity = userId; snapshot = null; docs = {}; emit(); }
    const send = request(), value = await send('/ops-api/followup');
    if (context().user?.id === userId) install(value);
  };
  const mutate = change => {
    const userId = context().user?.id;
    const task = queue.catch(() => {}).then(async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
        const c = context();
        if (c.user?.id !== userId || !c.canEdit) throw Error('当前用户没有编辑权限，未保存');
        const send = request(), current = await send('/ops-api/followup');
        if (context().user?.id !== userId) throw Error('登录身份已变化，未保存');
        await backup(current, userId); // Failure prevents a cloud write.
        // Backups are asynchronous: recheck authorization after that boundary.
        if (context().user?.id !== userId) throw Error('登录身份已变化，未保存');
        if (!context().canEdit) throw Error('当前用户没有编辑权限，未保存');
        const next = structuredClone(current.data), visible = projectTracker(next);
        const changed = change(visible,next);
        if(changed.noop){install(current);return changed.result;}
        next.trackerV1 = {...next.trackerV1, schema:1, docs:{...next.trackerV1?.docs,...changed.patch}};
        if(changed.events)next.events.unshift(...changed.events);
        else next.events.unshift({id:crypto.randomUUID(),product_id:'',actor:c.user.name,actor_id:userId,
          action:'新品大屏更新',reason:changed.reason,created_at:new Date().toISOString(),
          before:JSON.stringify(Object.fromEntries(Object.keys(changed.patch).map(k => [k,visible[k] ?? null]))),after:JSON.stringify(changed.patch)});
        {
          const saved = await send('/ops-api/followup',{revision:current.revision,data:next});
          if (context().user?.id === userId) install(saved);
          return changed.result;
        }
        } catch (error) {
          if (context().user?.id !== userId || !context().canEdit) throw error;
          const retryable = !error.status || error.status >= 500 || [408,429].includes(error.status) || /其它人员已更新/.test(error.message);
          if (attempt === 3 || !retryable) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
        }
      }
    });
    queue = task;
    return task;
  };
  const watch = callback => { listeners.add(callback); queueMicrotask(callback); return () => listeners.delete(callback); };
  const deepMerge = (a,b) => {
    const out = {...a};
    for (const key of Object.keys(b)) {
      if (['__proto__','prototype','constructor'].includes(key)) throw Error('无效字段');
      out[key] = b[key] && typeof b[key] === 'object' && !Array.isArray(b[key]) ? deepMerge(a?.[key] || {},b[key]) : structuredClone(b[key]);
    }
    return out;
  };
  return {
    _commit:operations => mutate((visible,current) => {
      const existing=new Set(current.events.map(event=>event.id));
      const pending=operations.filter(operation=>!existing.has(operation.id));
      const applied=applyTrackerOperations(visible,pending,context().user);
      return {...applied,noop:pending.length===0};
    }),
    refresh, clear(){identity='';snapshot=null;docs={};emit();},
    _dump:() => structuredClone(docs), _snapshot:() => structuredClone(snapshot),
    _load:incoming => mutate(visible => {
      const result = mergeTrackerImport(visible,incoming);
      return {patch:Object.fromEntries(Object.entries(result.docs).filter(([key]) => !visible[key])),reason:'合并导入；保留已有记录',result};
    }).then(result => notify('已补充 ' + result.added + ' 条；保留已有 ' + result.skipped + ' 条')),
    collection:name => ({onSnapshot:callback => watch(() => callback({docs:Object.entries(docs).filter(([key]) => key.startsWith(name + '/')).map(([key,value]) => ({id:key.slice(name.length+1),exists:true,data:() => structuredClone(value)}))}))}),
    doc:path => ({
      onSnapshot:callback => watch(() => callback({exists:!!docs[path],data:() => structuredClone(docs[path])})),
      set:value => mutate(visible => {
        if (visible[path]) throw Error('记录已存在，请刷新后编辑');
        return {patch:{[path]:structuredClone(value)},reason:'新增 '+path};
      }),
      update:value => mutate(visible => {
        if (!visible[path]) throw Error('记录不存在，请刷新');
        return {patch:{[path]:deepMerge(visible[path],value)},reason:'更新 '+path};
      }),
      delete:() => mutate(visible => {
        const patch = {[path]:null};
        if (path.startsWith('links/')) for (const [key,row] of Object.entries(visible)) if (row.linkId === path.slice(6)) patch[key] = null;
        return {patch,reason:'隐藏 '+path+'；原始记录和历史仍保留'};
      }),
    }),
  };
}

// Executed inside the formal workbench, using its existing validation and persistence.
let opsFollowupContext = { staff: [], user: null, canEdit: false };
if (!operating.includes('已完成')) operating.push('已完成');
const followupOperatingField = productFields.find(field => field[0] === 'operating');
if (!followupOperatingField[3].includes('已完成')) followupOperatingField[3].push('已完成');
productFields.push(['result', '最终完成结论', 'text'], ['evidence', '最终完成证据', 'url']);
function followupCanWrite() {
  const c = opsFollowupContext;
  return Boolean(c.canEdit && c.user?.id && c.user.id !== 'guest' && c.user.name);
}
function requireFollowupUser() {
  if (!followupCanWrite()) throw Error('当前用户没有编辑权限，请在运营中心登录可编辑帐号。');
  return opsFollowupContext.user;
}
const followupOriginalChange = applyChange;
applyChange = function(current, input) {
  const user = requireFollowupUser();
  const rows = input.kind === 'product' ? current.products : current.records;
  const previous = rows.find(row => row.id === input.id);
  if (previous) input = {...input,version:previous.version};
  const assignment = current.records.find(row => row.id === input.body?.operationId && !row.deleted_at && row.kind === 'operation' && row.product_id === (input.productId || previous?.product_id));
  const product = current.products.find(row => row.id === (input.productId || previous?.product_id));
  const body = { ...input.body };
  if (!body.owner && !previous) body.owner = assignment?.body.owner || product?.body.owner || user.name;
  if (assignment) {
    if (!body.account) body.account = assignment.body.account || assignment.body.store || '';
    if (!body.site) body.site = assignment.body.site || '';
  }
  if (input.kind === 'product') {
    body.stage ||= productFields.find(field => field[0] === 'stage')[3][0];
    body.health ||= '正常';
  }
  const changed = Object.keys(body).filter(key => JSON.stringify(body[key] ?? '') !== JSON.stringify(previous?.body[key] ?? ''));
  const fields = input.kind === 'product' ? productFields : configs[input.kind];
  const summary = previous ? '更新：' + changed.map(key => fields.find(field => field[0] === key)?.[1] || key).join('、') : '新建' + kindName[input.kind];
  input = { ...input, body, reason: input.reason?.trim() || summary || '保存记录' };
  if (input.body?.owner && !opsFollowupContext.staff.some(s => s.name === input.body.owner)) {
    throw Error('请从运营中心员工名单重新选择负责人。');
  }
  if (input.kind === 'product' && input.body?.operating === '已完成') {
    if (!input.body.result?.trim() || !input.body.evidence?.trim()) throw Error('最终完成需填写完成结论和证据链接。');
    const pending = current.records.some(row => !row.deleted_at && row.product_id === input.id &&
      ['task', 'operation', 'campaign', 'optimization'].includes(row.kind) && !['已完成', '已验证'].includes(row.body.status));
    if (pending) throw Error('请先完成或验证该产品的运营分工、任务、推广和优化事项。');
  }
  const result = followupOriginalChange(current, { ...input, actor: user.name });
  if (result.next.events[0]) result.next.events[0].actor_id = user.id;
  return result;
};
const followupOriginalDeletion = applyDeletion;
applyDeletion = function(current, input) {
  const user = requireFollowupUser();
  const result = followupOriginalDeletion(current, { ...input, actor: user.name });
  if (result.next.events[0]) result.next.events[0].actor_id = user.id;
  return result;
};
const followupOriginalTransaction = transact;
let followupCloudSnapshot = null;
let followupLocalSnapshot = null;
let followupCloudIdentity = '';
let followupLoadSequence = 0;
load = async function() {
  const sequence = ++followupLoadSequence;
  try {
    const snapshot = await api('/api/workbench');
    if (sequence !== followupLoadSequence) return;
    data = {...snapshot,products:snapshot.products.filter(r=>!r.deleted_at).map(p=>({...p,body:{...p.body,stage:optimizationStage(p.body.stage)}})),records:snapshot.records.filter(r=>!r.deleted_at)};
    render(); updateStorageLabel();
  } catch (error) {
    if (sequence !== followupLoadSequence) return;
    const label = document.getElementById('storage-label');
    if (label) label.textContent = '共享同步失败：' + error.message + '（当前显示可能是旧数据）';
    toast(error.message, true);
  }
};
async function followupPersistence(change) {
  const request = opsFollowupContext.cloudRequest;
  if (!request && opsFollowupContext.requireCloud) throw Error('共享连接未加载，未保存。请刷新运营中心后重试。');
  if (!request) return followupOriginalTransaction(change);
  for (let attempt = 0; attempt < 4; attempt++) {
  const snapshot = await request('/ops-api/followup');
  followupCloudSnapshot = snapshot;
  if (!change) return snapshot.data;
  const changed = change(snapshot.data);
  let saved;
  try { saved = await request('/ops-api/followup', {revision:snapshot.revision,data:changed.next}); }
  catch (error) { if (attempt < 3 && /其它人员已更新/.test(error.message)) continue; throw error; }
  followupCloudSnapshot = saved;
  return changed.result;
  }
}
transact = function(change) {
  if (change) requireFollowupUser();
  return followupPersistence(change ? current => {
    const user = requireFollowupUser();
    const result = change(current);
    // Backup import prepends one new audit event per product. Keep every older imported event untouched.
    if (!current.products.length && !current.events.length && result.next.events[0]?.action === '导入备份') {
      for (const event of result.next.events.slice(0, result.next.products.length)) {
        if (event.action === '导入备份') { event.actor = user.name; event.actor_id = user.id; }
      }
    }
    return result;
  } : null);
};
// Formal entry has no sample-data action, including programmatic invocation.
teamDemo = async function() { throw Error('正式页面不提供示例数据。'); };
function updateFollowupPersonnel() {
  document.querySelectorAll('#demo,#complex-demo').forEach(el => el.remove());
  document.querySelectorAll('#actor,input[name="actor"]').forEach(el => {
    el.value = opsFollowupContext.user?.name || '';
    el.readOnly = true;
    el.placeholder = '使用运营中心当前登录人';
    el.title = '操作人由运营中心当前登录帐号提供';
  });
  document.querySelectorAll('#record-form [name="owner"]').forEach(el => {
    let select = el;
    if (el.tagName !== 'SELECT') {
      select = document.createElement('select');
      select.name = 'owner';
      select.dataset.previousOwner = el.value;
      el.replaceWith(select);
    }
    const signature = JSON.stringify(opsFollowupContext.staff.map(s => [s.name, s.role]));
    if (select.dataset.staffSignature === signature) return;
    const old = select.value || select.dataset.previousOwner || '';
    select.replaceChildren(new Option('选择运营中心负责人', ''));
    for (const person of opsFollowupContext.staff) select.add(new Option(person.name + (person.role ? ' · ' + person.role : ''), person.name));
    if (old && !opsFollowupContext.staff.some(s => s.name === old)) {
      const removed = new Option(old + '（原负责人，请重新分配）', old);
      removed.disabled = true;
      select.add(removed);
    }
    select.value = old;
    select.dataset.staffSignature = signature;
  });
  document.querySelectorAll('[data-new],#import-backup,#save').forEach(el => { el.disabled = !followupCanWrite(); });
  simplifyFollowupForm();
}
function simplifyFollowupForm() {
  const form = document.getElementById('record-form');
  if (!form || !modal || modal.kind === 'delete') return;
  if (!form.dataset.simplified) {
    form.dataset.simplified = 'true';
    form.querySelector('[name="actor"]')?.closest('label')?.setAttribute('hidden', '');
    const reason = form.querySelector('[name="reason"]');
    if (reason) { reason.required = false; reason.placeholder = '特殊调整可补充说明，常规变更自动记录'; reason.closest('label').querySelector('span').textContent = '补充说明（选填）'; }
    const grid = form.querySelector('.form-grid');
    const details = document.createElement('details');
    details.className = 'wide';
    details.innerHTML = '<summary style="cursor:pointer;padding:10px 0">更多信息（选填）</summary><div class="form-grid"></div>';
    const extra = details.querySelector('div');
    const optional = ['purpose','issue','stage','health','title','account','site','executedAt','firstLegStatus','reason'];
    // Keep record titles visible; only the optional duty title on assignments is folded.
    for (const label of [...grid.children]) {
      const field = label.querySelector('[name]');
      if (field && optional.includes(field.name) && (field.name !== 'title' || modal.kind === 'operation') && !(modal.kind === 'operation' && ['account','site'].includes(field.name))) extra.append(label);
    }
    if (extra.children.length) grid.append(details);
    const owner = form.querySelector('[name="owner"]');
    if (owner && !owner.value && !modal.row) {
      const assignment = data.records.find(row => row.id === form.querySelector('[name="operationId"]')?.value);
      const product = data.products.find(row => row.id === selected);
      const name = assignment?.body.owner || product?.body.owner || opsFollowupContext.user?.name;
      if ([...owner.options].some(option => option.value === name)) owner.value = name;
    }
    for (const name of ['stage','health']) {
      const field = form.querySelector('[name="' + name + '"]');
      if (field && !field.value && !modal.row) field.selectedIndex = 1;
    }
    const note = form.querySelector('.form-note');
    if (note) note.textContent = '操作人、时间和字段变更自动记录；负责人默认沿用已有分工，可调整。完成验证需提供结果和证据。';
  }
  if (modal.kind === 'product') {
    const done = form.querySelector('[name="operating"]')?.value === '已完成';
    for (const name of ['result','evidence']) { const label = form.querySelector('[name="' + name + '"]')?.closest('label'); if (label) label.hidden = !done; }
  }
}
document.addEventListener('change', e => {
  if (e.target.name === 'operating') simplifyFollowupForm();
  if (e.target.name === 'operationId') {
    const assignment = data.records.find(row => row.id === e.target.value && row.kind === 'operation');
    if (!assignment) return;
    const form = document.getElementById('record-form');
    for (const [key, value] of [['owner',assignment.body.owner],['account',assignment.body.account || assignment.body.store],['site',assignment.body.site]]) {
      const field = form?.querySelector('[name="' + key + '"]');
      if (field) field.value = value || '';
    }
  }
});
window.setOpsFollowupContext = function(context) {
  const wasActive = opsFollowupContext.active;
  opsFollowupContext = context;
  updateFollowupPersonnel();
  const identity = context.cloudRequest ? context.user?.id : '';
  if (identity && identity !== followupCloudIdentity) {
    followupCloudIdentity = identity;
    data = freshData(); render();
    (async () => {
      followupLocalSnapshot = await followupOriginalTransaction(null);
      await load();
      updateCloudMigration();
    })().catch(error => toast(error.message, true));
  } else if (context.active && !wasActive && identity && !modal && !busy) {
    load().then(updateCloudMigration);
  }
};
function updateCloudMigration() {
  let button = document.getElementById('upload-local-followup');
  const available = opsFollowupContext.cloudRequest && followupCanWrite() && followupLocalSnapshot?.products.length;
  if (!available) { button?.remove(); return; }
  if (!button) {
    button = document.createElement('button'); button.id = 'upload-local-followup'; button.className = 'quiet';
    document.getElementById('export-backup').before(button);
    button.addEventListener('click', async () => {
      try {
        requireFollowupUser();
        for (let attempt = 0; attempt < 4; attempt++) {
          const cloud = await opsFollowupContext.cloudRequest('/ops-api/followup');
          try { followupCloudSnapshot = await opsFollowupContext.cloudRequest('/ops-api/followup', {revision:cloud.revision,data:followupLocalSnapshot,merge:true}); break; }
          catch (error) { if (attempt < 3 && /其它人员已更新/.test(error.message)) continue; throw error; }
        }
        await load(); toast('本机记录已上传，其它帐号刷新即可查看。'); updateCloudMigration();
      } catch (error) { toast(error.message, true); }
    });
  }
  button.textContent = '上传本机产品（合并共享，' + followupLocalSnapshot.products.length + '款）';
  button.disabled = !followupCanWrite();
}
const followupLocalStorageLabel = updateStorageLabel;
updateStorageLabel = function() {
  if (!opsFollowupContext.cloudRequest) return followupLocalStorageLabel();
  const label = document.getElementById('storage-label');
  if (label) label.textContent = followupCloudSnapshot
    ? 'Cloudflare共享 · 版本 ' + followupCloudSnapshot.revision + ' · 共' + data.products.length + '款 · 同步于 ' + new Date().toLocaleTimeString('zh-CN')
    : '正在连接Cloudflare共享库…';
};
setInterval(() => {
  if (opsFollowupContext.cloudRequest && !modal && !busy) load().then(updateCloudMigration);
}, 30000);
// Guard backup import before the legacy document listener can read a file or mutate storage.
document.addEventListener('change', e => {
  if (e.target.id === 'backup-file' && opsFollowupContext.cloudRequest && e.target.files?.[0]) {
    e.stopImmediatePropagation();
    const file = e.target.files[0];
    (async () => {
      requireFollowupUser();
      if (file.size > 3000000) throw Error('单次上传请小于3MB');
      const uploaded = validateBackup(JSON.parse(await file.text()));
      for (let attempt = 0; attempt < 4; attempt++) {
        const snapshot = await opsFollowupContext.cloudRequest('/ops-api/followup');
        try { await opsFollowupContext.cloudRequest('/ops-api/followup', {revision:snapshot.revision,data:uploaded,merge:true}); break; }
        catch (error) { if (attempt < 3 && /其它人员已更新/.test(error.message)) continue; throw error; }
      }
      await load(); toast('产品已合并上传，已有记录的覆盖修改已记录到历史。');
    })().catch(error => toast(error.message, true)).finally(() => { e.target.value = ''; });
    return;
  }
  if (e.target.id === 'backup-file' && !followupCanWrite()) {
    e.stopImmediatePropagation();
    e.target.value = '';
    toast('当前用户没有导入权限。', true);
  }
}, true);
document.addEventListener('submit', e => {
  if (e.target.id !== 'record-form') return;
  updateFollowupPersonnel();
  if (!followupCanWrite()) { e.preventDefault(); e.stopImmediatePropagation(); toast('当前用户没有编辑权限。', true); }
}, true);
const followupObserver = new MutationObserver(updateFollowupPersonnel);
followupObserver.observe(document.body, { childList: true, subtree: true });
updateFollowupPersonnel();

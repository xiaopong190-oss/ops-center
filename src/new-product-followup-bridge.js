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
transact = function(change) {
  if (change) requireFollowupUser();
  return followupOriginalTransaction(change ? current => {
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
}
window.setOpsFollowupContext = function(context) {
  opsFollowupContext = context;
  updateFollowupPersonnel();
};
// Guard backup import before the legacy document listener can read a file or mutate storage.
document.addEventListener('change', e => {
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

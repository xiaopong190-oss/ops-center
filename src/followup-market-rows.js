// An assignment ID identifies a market row; equal site labels must not merge separate shops.
configs.operation.find(field => field[0] === 'store')[1] = '店铺名称';
configs.operation.find(field => field[0] === 'site')[1] = '站点 / 市场';
configs.operation.splice(2, 0, ['account', '帐号名称', 'text']);
function marketIdentity(assignment) {
  const b = assignment.body;
  return ['帐号：' + (b.account || '未填写'), '店铺：' + (b.store || '未填写'), '站点：' + (b.site || '未填写')].join(' · ');
}
assignmentLabel = function(id) {
  const assignment = allAssignments().find(row => row.id === id);
  return assignment ? marketIdentity(assignment) + ' · ' + assignment.body.owner : '产品通用 / 未关联店铺';
};
marketChildren = function(pid) {
  const rows = data.records.filter(row => row.product_id === pid && !row.deleted_at);
  const assignments = rows.filter(row => row.kind === 'operation');
  const groups = assignments.map(assignment => ({ assignment, rows: rows.filter(row => row.id === assignment.id || row.body.operationId === assignment.id) }));
  const unlinked = rows.filter(row => row.kind !== 'operation' && !assignments.some(assignment => assignment.id === row.body.operationId));
  if (unlinked.length) groups.push({ assignment: null, rows: unlinked });
  const markup = groups.map(group => {
    const assignment = group.assignment;
    const active = group.rows.filter(row => ['进行中','推广中','测款中','优化中','运输中','清关中'].includes(row.body.status) && row.kind !== 'operation');
    const dated = group.rows.map(row => row.body.due).filter(Boolean).sort();
    const logistics = group.rows.filter(row => row.kind === 'shipment');
    const label = assignment ? marketIdentity(assignment) : '未关联帐号 / 店铺（保留原记录，请关联）';
    const actions = assignment
      ? '<button type="button" class="text-button" data-market-update="' + esc(assignment.id) + '">更新此店铺进度</button><button type="button" class="text-button" data-market-task="' + esc(assignment.id) + '">＋ 添加此店铺跟进</button>'
      : group.rows.map(row => '<button type="button" class="text-button" data-market-record="' + esc(row.id) + '">关联 / 更新：' + esc(row.body.title || kindName[row.kind]) + '</button>').join('');
    return '<div class="market-child" style="display:grid;grid-template-columns:2fr 1fr 1.5fr 1.2fr;gap:16px;padding:16px;border-bottom:1px solid #e5eaf2"><div><strong>' + esc(label) + '</strong><div>' + actions + '</div></div><div>' + esc(assignment?.body.owner || '按记录负责人') + '<br>' + esc(assignment?.body.status || '待关联') + '</div><div>' + (active.map(row => esc(row.body.title) + '<br><small>' + esc(row.body.executedAt?.replace('T',' ') || '未填写执行时间') + '</small>').join('<br>') || '暂无执行中的动作') + (assignment?.body.next ? '<br>下一步：' + esc(assignment.body.next) : '') + '</div><div>' + logistics.map(row => esc(row.body.firstLegStatus || row.body.status)).join('、') + '<br>下次跟进：' + esc(dated[0] || '待安排') + '</div></div>';
  }).join('');
  return '<div style="padding:12px 24px"><button type="button" class="quiet" data-market-add="' + esc(pid) + '">＋ 添加帐号 / 店铺 / 站点</button>' + (markup || '<p class="muted">尚未添加店铺，添加后各店铺独立更新进度。</p>') + '</div>';
};
document.addEventListener('click', e => {
  const button = e.target.closest('button');
  if (!button) return;
  if (button.dataset.marketAdd) { selected = button.dataset.marketAdd; open('operation'); }
  const id = button.dataset.marketUpdate || button.dataset.marketTask || button.dataset.marketRecord;
  if (!id) return;
  const row = data.records.find(record => record.id === id);
  if (!row) return;
  selected = row.product_id;
  if (button.dataset.marketTask) {
    open('task');
    const form = document.getElementById('record-form');
    form.querySelector('[name="operationId"]').value = row.id;
    form.querySelector('[name="owner"]').value = row.body.owner;
    form.querySelector('[name="account"]').value = row.body.account || row.body.store || '';
    form.querySelector('[name="site"]').value = row.body.site || '';
  } else open(row.kind, row);
});

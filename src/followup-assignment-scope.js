// Scope every detail tab to a stable assignment ID, never to a displayed site label.
let selectedAssignment = '';
function assignmentScopedRows(rows) {
  return rows.filter(row => !selectedAssignment || (selectedAssignment === '__unlinked' ? !row.body.operationId && row.kind !== 'operation' : row.id === selectedAssignment || row.body.operationId === selectedAssignment));
}
function assignmentScopedHistory(pid) {
  const originalEvents = data.events;
  if (selectedAssignment) data.events = originalEvents.filter(event => {
    const before = event.before ? JSON.parse(event.before) : {};
    const after = event.after ? JSON.parse(event.after) : {};
    if (selectedAssignment === '__unlinked') return !before.operationId && !after.operationId && !event.operation_id;
    return event.operation_id === selectedAssignment || before.operationId === selectedAssignment || after.operationId === selectedAssignment;
  });
  try { return timeline(pid); } finally { data.events = originalEvents; }
}
const assignmentOriginalDrawer = renderDrawer;
renderDrawer = function() {
  if (selectedAssignment && selectedAssignment !== '__unlinked' && !data.records.some(row=>row.id===selectedAssignment && row.product_id===selected)) selectedAssignment = '';
  assignmentOriginalDrawer();
  const strip = document.querySelector('.drawer .status-strip');
  if (!strip) return;
  const picker = document.createElement('select');
  picker.id = 'drawer-assignment'; picker.setAttribute('aria-label','帐号店铺站点范围');
  picker.innerHTML = '<option value="">全部帐号 / 站点</option><option value="__unlinked">待关联旧记录</option>' + allAssignments().filter(row=>row.product_id===selected).map(row=>'<option value="'+esc(row.id)+'">'+esc(marketIdentity(row))+'</option>').join('');
  picker.value = selectedAssignment;
  strip.after(picker);
};
const assignmentOriginalRecord = record;
record = function(row) {
  const id = row.kind === 'operation' ? row.id : row.body.operationId;
  const html = assignmentOriginalRecord(row);
  if (!id) return html;
  return html.replaceAll('data-product="'+esc(row.product_id)+'"', 'data-assignment-open="'+esc(id)+'"');
};
const assignmentOriginalOpen = open;
open = function(kind,row) {
  assignmentOriginalOpen(kind,row);
  const field = document.querySelector('#record-form [name="operationId"]');
  if (!field) return;
  field.closest('label').querySelector('span').textContent = '关联帐号 / 店铺 / 站点（必选）';
  field.required = true;
  field.options[0].textContent = '请选择帐号 / 店铺 / 站点';
  if (!row && selectedAssignment && selectedAssignment !== '__unlinked') {
    field.value = selectedAssignment;
    field.dispatchEvent(new Event('change',{bubbles:true}));
  }
};
document.addEventListener('change',e=>{
  if (e.target.id === 'drawer-assignment') { selectedAssignment=e.target.value;renderDrawer(); }
});
document.addEventListener('click',e=>{
  const button=e.target.closest('button');
  if (!button) return;
  if (button.dataset.assignmentOpen) {
    const row=allAssignments().find(row=>row.id===button.dataset.assignmentOpen);
    if (!row) return;
    selected=row.product_id;selectedAssignment=row.id;tab='task';renderDrawer();
  }
},true);
document.addEventListener('click',e=>{
  const button=e.target.closest('button');
  if (button?.dataset.product) { selectedAssignment='';renderDrawer(); }
},false);

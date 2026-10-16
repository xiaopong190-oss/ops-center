import fs from 'node:fs';
const root = new URL('../', import.meta.url);
let html = fs.readFileSync(new URL('modules/new-product-followup/index.html', root), 'utf8');
// Separate production storage from the legacy standalone page; backup format stays compatible.
html = html.replace('indexedDB.open(STORE_NAME, 1)', "indexedDB.open('ops-new-product-followup-v1', 1)");
html = html.replaceAll('操作人由手动填写', '操作人使用运营中心当前登录帐号').replaceAll('请先填写右上角操作人。', '请先在运营中心登录。');
html = html.replaceAll('团队管理 · 本机版', '团队协作 · 共享版');
const bridge = fs.readFileSync(new URL('src/new-product-followup-bridge.js', root), 'utf8');
const marketRows = fs.readFileSync(new URL('src/followup-market-rows.js', root), 'utf8');
const assignmentScope = fs.readFileSync(new URL('src/followup-assignment-scope.js', root), 'utf8');
const logisticsSimple = fs.readFileSync(new URL('src/followup-logistics-simple.js', root), 'utf8');
const costPromotionSimple = fs.readFileSync(new URL('src/followup-cost-promotion-simple.js', root), 'utf8');
const dualOverview = fs.readFileSync(new URL('src/followup-dual-overview.js', root), 'utf8');
const consistentEntry = fs.readFileSync(new URL('src/followup-consistent-entry.js', root), 'utf8');
const supplyOverview = fs.readFileSync(new URL('src/followup-supply-overview.js', root), 'utf8');
// Basic creation should not require repeating planning notes at every level.
html = html.replace("['name','sku','owner','stage','operating','health','purpose','issue','next','due']", "['name','sku','owner','stage','operating','health']")
  .replace("['owner','status','purpose','issue','next','due','target']", "['owner','status']")
  .replace("['title','owner','due','target','status']", "['title','owner','due','status']");
html = html.replace("['owner','store','site'].every", "['owner','account','store','site'].every");
// Do not launch a local read before the parent publishes its authenticated cloud context.
html = html.replace("$('#actor').value=safeActor();load();", "$('#actor').value=safeActor();render();updateStorageLabel();");
html = html.replace("toast('已保存，本次变更已记入时间线')", "toast(opsFollowupContext.cloudRequest ? '已保存到共享库，其它帐号可刷新查看' : '已保存到本机，本次变更已记入时间线')");
html = html.replace('rs=data.records.filter(r=>r.product_id===p.id&&r.kind===tab)', 'rs=assignmentScopedRows(data.records.filter(r=>r.product_id===p.id&&r.kind===tab))');
html = html.replace("tab==='history'?timeline(p.id)", "tab==='history'?assignmentScopedHistory(p.id)");
html = html.replace("if(kind==='shipment'&&out.status==='已签收'&&(!out.arrived||!out.evidence))throw Error('已签收需填写实际到货日及物流凭证链接');", "if(kind==='shipment'&&(out.quantity===null||out.quantity===undefined||out.quantity===''))throw Error('请填写发货数量');");
html = html.replace("['title','owner','channel','target','status']", "['title','owner','channel','status']");
html = html.replace("(kind==='campaign'&&out.status==='已完成')", 'false');
html = html.replace('  return out;', "  if(kind==='cost'&&out.actual==='')throw Error('请填写成本金额');return out;");
html = html.replace('</body>', '<script>' + bridge + '\n' + marketRows + '\n' + logisticsSimple + '\n' + costPromotionSimple + '\n' + assignmentScope + '\n' + supplyOverview + '\n' + dualOverview + '\n' + consistentEntry + '</script></body>');
fs.writeFileSync(new URL('src/NewProductFollowupDocument.js', root), 'export const NEW_PRODUCT_FOLLOWUP_HTML = ' + JSON.stringify(html) + ';\n');
console.log('Built production followup document (empty by default)');


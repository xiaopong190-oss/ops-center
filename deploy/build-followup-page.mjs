import fs from 'node:fs';
const root = new URL('../', import.meta.url);
let html = fs.readFileSync(new URL('modules/new-product-followup/index.html', root), 'utf8');
// Separate production storage from the legacy standalone page; backup format stays compatible.
html = html.replace('indexedDB.open(STORE_NAME, 1)', "indexedDB.open('ops-new-product-followup-v1', 1)");
html = html.replaceAll('操作人由手动填写', '操作人使用运营中心当前登录帐号').replaceAll('请先填写右上角操作人。', '请先在运营中心登录。');
const bridge = fs.readFileSync(new URL('src/new-product-followup-bridge.js', root), 'utf8');
html = html.replace('</body>', '<script>' + bridge + '</script></body>');
fs.writeFileSync(new URL('src/NewProductFollowupDocument.js', root), 'export const NEW_PRODUCT_FOLLOWUP_HTML = ' + JSON.stringify(html) + ';\n');
console.log('Built production followup document (empty by default)');

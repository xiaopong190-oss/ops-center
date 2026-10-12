import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { NEW_PRODUCT_FOLLOWUP_HTML } from '../src/NewProductFollowupDocument.js';
const require = createRequire(new URL('../modules/new-product-followup/work/qa/package.json', import.meta.url));
const { JSDOM, VirtualConsole } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');
const db = new IDBFactory();
const errors = [];
const pause = () => new Promise(resolve => setTimeout(resolve, 30));
function page() {
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  return new JSDOM(NEW_PRODUCT_FOLLOWUP_HTML, {
    url: 'https://example.test/ops-center/', runScripts: 'dangerously', virtualConsole: console,
    beforeParse(window) {
      window.structuredClone = structuredClone;
      window.indexedDB = db;
      window.crypto.randomUUID = randomUUID;
    },
  });
}
let dom = page();
await pause();
let w = dom.window;
assert.equal(w.eval('data.products.length'), 0, 'formal page starts empty');
assert.equal(w.document.querySelector('#complex-demo'), null);
assert.equal(w.document.querySelector('#demo'), null);
assert.throws(() => w.eval('transact(current => ({next:current}))'), /编辑权限/);
const context = { staff: [{name:'运营甲',role:'运营'},{name:'物流乙',role:'物流'}], user: {id:'user-1',name:'运营甲'}, canEdit:true };
w.setOpsFollowupContext(context);
w.eval("open('product')");
await pause();
assert.equal(w.document.querySelector('[name="owner"]').tagName, 'SELECT');
assert.equal(w.document.querySelector('[name="owner"]').options.length, 3);
assert.equal(w.document.querySelector('[name="actor"]').readOnly, true);
assert.equal(w.document.querySelector('#actor').value, '运营甲');
assert.equal(w.document.querySelector('[name="reason"]').required, false);
assert.equal(w.document.querySelector('[name="actor"]').closest('label').hidden, true);
assert.equal(w.document.querySelector('[name="owner"]').value, '运营甲');
assert.ok(w.document.querySelector('[name="issue"]').closest('details'));
assert.equal(w.document.querySelector('[name="result"]').closest('label').hidden, true);
const product = {name:'正式产品',sku:'TEST-01',owner:'物流乙',stage:'已上架',operating:'测款中',health:'正常',purpose:'验证',issue:'跟进',next:'到货检查',due:'2026-12-01'};
const saved = await w.eval('api')('/api/workbench', {kind:'product',body:product,actor:'伪造操作人',reason:'测试新建'});
let snapshot = await w.eval('api')('/api/workbench');
assert.equal(snapshot.events[0].actor, '运营甲');
assert.equal(snapshot.events[0].actor_id, 'user-1');
w.setOpsFollowupContext({...context,user:{id:'user-2',name:'物流乙'}});
await w.eval('api')('/api/workbench', {kind:'product',id:saved.id,version:1,body:{...product,next:'入仓检查'},actor:'伪造',reason:'更新'});
snapshot = await w.eval('api')('/api/workbench');
assert.equal(snapshot.events[0].actor, '物流乙');
assert.equal(snapshot.events[1].actor, '运营甲');
await assert.rejects(w.eval('api')('/api/workbench', {kind:'product',id:saved.id,version:2,body:{...product,operating:'已完成'},reason:'完成'}), /完成结论/);
await w.eval('api')('/api/workbench', {kind:'product',id:saved.id,version:2,body:{...product,operating:'已完成',result:'已完成验证',evidence:'https://example.test/report'},reason:'完成'});
const simple = await w.eval('api')('/api/workbench', {kind:'product',body:{name:'简化录入',sku:'MIN-01',operating:'待上架'}});
const assignment = await w.eval('api')('/api/workbench', {kind:'operation',productId:simple.id,body:{owner:'物流乙',status:'待上架',store:'店铺A',site:'US'}});
await w.eval('api')('/api/workbench', {kind:'task',productId:simple.id,body:{title:'检查入仓',operationId:assignment.id,due:'2026-12-01',status:'待开始'}});
const inherited = (await w.eval('api')('/api/workbench')).records[0];
assert.equal(inherited.body.owner, '物流乙');
assert.equal(inherited.body.account, '店铺A');
assert.equal(inherited.body.site, 'US');
assert.match((await w.eval('api')('/api/workbench')).events[0].reason, /新建/);
const marketA = await w.eval('api')('/api/workbench', {kind:'operation',productId:simple.id,body:{owner:'物流乙',account:'帐号A',store:'同名店铺',site:'US',status:'推广中'}});
const marketB = await w.eval('api')('/api/workbench', {kind:'operation',productId:simple.id,body:{owner:'物流乙',account:'帐号B',store:'同名店铺',site:'US',status:'待上架'}});
await w.eval('load')();
let markets = w.eval('marketChildren')(simple.id);
assert.match(markets, /帐号A/); assert.match(markets, /帐号B/);
assert.ok(markets.includes('data-market-update="' + marketA.id + '"'));
assert.ok(markets.includes('data-market-update="' + marketB.id + '"'));
const savedA = (await w.eval('api')('/api/workbench')).records.find(row => row.id === marketA.id);
await w.eval('api')('/api/workbench', {kind:'operation',id:marketA.id,version:savedA.version,body:{...savedA.body,status:'优化中'}});
assert.equal((await w.eval('api')('/api/workbench')).records.find(row => row.id === marketB.id).body.status, '待上架');
w.eval('open')( 'operation', savedA ); await pause();
assert.equal(w.document.querySelector('[name="account"]').closest('details'), null);
assert.equal(w.document.querySelector('[name="site"]').closest('details'), null);
w.setOpsFollowupContext({...context,staff:[{name:'运营甲',role:'运营'}]});
assert.match(w.document.querySelector('[name="owner"]').textContent, /运营甲/);
await assert.rejects(w.eval('api')('/api/workbench', {kind:'product',body:{...product,sku:'TEST-02'},reason:'检查移除人员'}), /重新选择负责人/);
w.setOpsFollowupContext({...context,canEdit:false});
assert.equal(w.document.querySelector('[data-new]').disabled, true);
await assert.rejects(w.eval('api')('/api/workbench', {kind:'product',body:product,reason:'只读'}), /编辑权限/);
dom.window.close();
dom = page(); await pause(); w = dom.window;
assert.equal((await w.eval('api')('/api/workbench')).products.length, 2, 'persisted across reopen, no samples added');
assert.deepEqual(errors, [], 'document scripts load without errors');
dom.window.close();
console.log('PASS: empty start, no samples, shared staff, readonly actor, identity audit, staff removal, readonly permissions, persistent reopen');
// Separate browser instances must use the same remote snapshot, even with existing local records.
const left = page(), right = page();
let shared = {revision:0,data:{products:[],records:[],events:[]}};
const cloudRequest = async (path, input) => {
  assert.equal(path, '/ops-api/followup');
  if (input) {
    if (input.revision !== shared.revision) throw Error('其它人员已更新');
    shared = {revision:shared.revision+1,data:structuredClone(input.data)};
  }
  return structuredClone(shared);
};
await pause();
left.window.setOpsFollowupContext({...context,requireCloud:true,active:true,cloudRequest});
right.window.setOpsFollowupContext({...context,user:{id:'user-2',name:'物流乙'},requireCloud:true,active:true,cloudRequest});
await pause();
assert.equal(left.window.eval('data.products.length'),0,'local data must not overwrite cloud');
await left.window.eval('api')('/api/workbench',{kind:'product',body:{name:'跨电脑产品',sku:'CLOUD-01',operating:'待上架'}});
await right.window.eval('load')();
assert.equal(right.window.eval('data.products[0].body.name'),'跨电脑产品');
assert.match(right.window.document.querySelector('#storage-label').textContent,/版本 1/);
right.window.setOpsFollowupContext({...context,requireCloud:true});
await assert.rejects(right.window.eval('api')('/api/workbench',{kind:'product',body:product}),/共享连接未加载/);
assert.equal(shared.data.products.length,1,'missing cloud must not silently save locally');
left.window.close();right.window.close();
console.log('PASS: two browsers share saves, startup ignores local records, missing cloud rejects saves');
const scopeDom=page();await pause();const sw=scopeDom.window;
sw.setOpsFollowupContext(context);
const sp=await sw.eval('api')('/api/workbench',{kind:'product',body:{name:'范围测试',sku:'SCOPE',operating:'待上架'}});
const sa=await sw.eval('api')('/api/workbench',{kind:'operation',productId:sp.id,body:{owner:'运营甲',account:'A',store:'店铺',site:'UK',status:'待上架'}});
const sb=await sw.eval('api')('/api/workbench',{kind:'operation',productId:sp.id,body:{owner:'运营甲',account:'B',store:'店铺',site:'UK',status:'待上架'}});
await sw.eval('load')();
sw.eval('data.records').push(...['task','shipment','cost','campaign'].flatMap(kind=>[
{id:kind+'A',kind,product_id:sp.id,body:{title:kind+'ONLY_A',operationId:sa.id}},
{id:kind+'B',kind,product_id:sp.id,body:{title:kind+'ONLY_B',operationId:sb.id}}]));
sw.eval('selected='+JSON.stringify(sp.id)+';selectedAssignment='+JSON.stringify(sa.id));
for(const kind of ['task','shipment','cost','campaign']) {
 sw.eval('tab='+JSON.stringify(kind)+';renderDrawer()');
 const html=sw.document.querySelector('.detail-content').textContent;
 assert.ok(html.includes(kind+'ONLY_A'));assert.ok(!html.includes(kind+'ONLY_B'));
}
sw.eval("tab='history';renderDrawer()");
assert.ok(sw.document.querySelector('.detail-content').textContent.includes('→ A'));
assert.ok(!sw.document.querySelector('.detail-content').textContent.includes('→ B'));
sw.eval("open('shipment')");
assert.equal(sw.document.querySelector('[name="operationId"]').value,sa.id);
assert.equal(sw.document.querySelector('[name="operationId"]').required,true);
scopeDom.window.close();
console.log('PASS: same shop/site different accounts isolate all detail tabs and history; new records inherit exact assignment');




import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

import { mapLingxingShipment } from './domain.mjs';
import { openLogisticsStore } from './store.mjs';
import { runMonthlySettlement, confirmStatement, listStatements } from './settlement.mjs';
import { queryCarrierRatings } from './rating.mjs';
import { service } from '../shared/server.mjs';
import { connections } from '../shared/connections.mjs';
import { demoClient } from '../demo.mjs';

async function withTempStore(t) {
  const dir = await mkdtemp(join(tmpdir(), 'carriers-test-'));
  const store = openLogisticsStore(dir);
  t.after(async () => {
    try { store.close(); } catch { /* already closed */ }
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
  return { dir, store };
}

// ---------------------------------------------------------------------------
// 1. Carrier Directory: validation, deduplication, source-ID reuse, restart persistence
// ---------------------------------------------------------------------------
test('名录校验、去重、复用已有源承运商 ID（不分裂）及重启持久化', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'carriers-dir-'));
  let store = openLogisticsStore(dir);
  t.after(async () => {
    try { store.close(); } catch { /* already closed */ }
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  // Sync a shipment with existing Lingxing source carrier
  store.upsertShipmentsPage([mapLingxingShipment({
    sid: 101,
    shipment_id: 'FBA-C-01',
    shipment_sn: 'SN-C-01',
    weight: '50',
    weight_unit: 'kg',
    carrier_id: 'CARRIER-APEX',
    carrier_name: '极速空派物流',
    tracking_no: 'APEX-1001',
    source_version: 1,
    last_update_time: '2026-04-01T10:00:00Z'
  }, null, { sid: '101' })]);

  // Validation: reject empty, whitespace, too long, control chars
  for (const badName of ['', '   ', 'a'.repeat(81), 'bad\x07name', null]) {
    assert.throws(() => store.createCarrier({ name: badName }), /名称/);
  }

  // Add a brand-new manual carrier
  const created = store.createCarrier({ name: '  顺丰   跨境  ', note: '美西直飞', operator: 'alice' });
  assert.equal(created.carrier.name, '顺丰 跨境');
  assert.equal(created.carrier.reusedSourceId, false);
  assert.match(created.carrier.id, /^CARRIER-M-/);

  // Deduplication: case & whitespace insensitive -> 409
  assert.throws(
    () => store.createCarrier({ name: '顺丰 跨境' }),
    err => err.statusCode === 409 && /已存在/.test(err.message)
  );

  // Reuse existing Lingxing source carrier ID when adding same carrier name to directory
  const reused = store.createCarrier({ name: '  极速空派物流 ', operator: 'alice' });
  assert.equal(reused.carrier.id, 'CARRIER-APEX', '同名服务商必须复用已有源承运商 ID，不可分裂');
  assert.equal(reused.carrier.reusedSourceId, true);

  // Unified listCarriers should NOT duplicate CARRIER-APEX
  const listBeforeRestart = store.listCarriers();
  assert.equal(listBeforeRestart.filter(c => c.id === 'CARRIER-APEX').length, 1);
  assert.equal(listBeforeRestart.length, 2);

  // Restart SQLite and verify directory persists
  store.close();
  store = openLogisticsStore(dir);
  const listAfterRestart = store.listCarriers();
  assert.equal(listAfterRestart.length, 2);
  assert.ok(listAfterRestart.some(c => c.id === created.carrier.id && c.name === '顺丰 跨境'));
  assert.ok(listAfterRestart.some(c => c.id === 'CARRIER-APEX' && c.inDirectory === true));
});

// ---------------------------------------------------------------------------
// 2. Manual leg binding + manual tracking number + survives re-sync & restart + traceability
// ---------------------------------------------------------------------------
test('运输段人工绑定服务商与无原单号补录：重同步、重启保留，原领星名与人工归属可追溯', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'carriers-bind-'));
  let store = openLogisticsStore(dir);
  t.after(async () => {
    try { store.close(); } catch { /* already closed */ }
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  const baseRaw = {
    sid: 101,
    shipment_id: 'FBA-NOTRACK-01',
    shipment_sn: 'SN-NT-01',
    weight: '30',
    weight_unit: 'kg',
    carrier_id: 'UNASSIGNED',
    carrier_name: '未指定物流商',
    tracking_no: null,
    source_version: 1,
    last_update_time: '2026-04-01T10:00:00Z'
  };
  store.upsertShipmentsPage([mapLingxingShipment(baseRaw, null, { sid: '101' })]);
  const { carrier: sf } = store.createCarrier({ name: '顺丰跨境', operator: 'ops' });

  const legId = store.listShipments({ sid: '101' }).items[0].legs[0].id;
  const bound = store.bindLegCarrier({
    legId,
    carrierId: sf.id,
    manualTrackingNo: 'SF-MANUAL-888',
    note: '纸质面单确认',
    operator: 'bob'
  });
  assert.equal(bound.effectiveCarrierId, sf.id);
  assert.equal(bound.effectiveCarrierName, '顺丰跨境');
  assert.equal(bound.effectiveTrackingNo, 'SF-MANUAL-888');
  assert.equal(bound.sourceCarrierId, 'UNASSIGNED');
  assert.equal(bound.sourceCarrierName, '未指定物流商');
  assert.equal(bound.sourceTrackingNo, null);

  // Replay sync with newer source_version & restart SQLite
  store.upsertShipmentsPage([mapLingxingShipment({
    ...baseRaw,
    carrier_id: 'LX-RAW-9',
    carrier_name: '领星原名A',
    source_version: 2,
    last_update_time: '2026-04-05T10:00:00Z'
  }, null, { sid: '101' })]);
  store.close();
  store = openLogisticsStore(dir);

  const reloadedLeg = store.listShipments({ sid: '101' }).items[0].legs[0];
  assert.equal(reloadedLeg.carrierId, sf.id, '重同步与重启后必须保留人工绑定');
  assert.equal(reloadedLeg.carrierName, '顺丰跨境');
  assert.equal(reloadedLeg.trackingNo, 'SF-MANUAL-888');
  assert.equal(reloadedLeg.sourceCarrierName, '领星原名A', '原领星服务商名称保持可追溯');
  assert.equal(reloadedLeg.carrierBinding.operator, 'bob');
  assert.equal(store.getCarrierBindingAudit(legId).length, 1);

  // Unbind restores source carrier and logs audit
  store.bindLegCarrier({ legId, carrierId: null, operator: 'bob', note: '撤销手工归属' });
  const afterUnbind = store.listShipments({ sid: '101' }).items[0].legs[0];
  assert.equal(afterUnbind.carrierId, 'LX-RAW-9');
  assert.equal(afterUnbind.carrierName, '领星原名A');
  assert.equal(afterUnbind.carrierBinding, null);
  assert.equal(store.getCarrierBindingAudit(legId).length, 2);
});

// ---------------------------------------------------------------------------
// 3. Exact tracking-number lookup: matched / not_found (no prefix guess) / cross_shop / conflict
// ---------------------------------------------------------------------------
test('按运单号手动拉取服务商：精确匹配来源、找不到不猜号段、跨店拒绝、冲突提示', async t => {
  const { store } = await withTempStore(t);

  store.upsertShipmentsPage([
    mapLingxingShipment({
      sid: 101, shipment_id: 'FBA-LK-1', shipment_sn: 'SN-LK-1', weight: '10', weight_unit: 'kg',
      carrier_id: 'CARRIER-A', carrier_name: '承运商甲', tracking_no: 'TRK-OK-001',
      source_version: 1, last_update_time: '2026-04-01T00:00:00Z'
    }, null, { sid: '101' }),
    // Same tracking_no in shop 102 only -> cross_shop when queried from shop 101
    mapLingxingShipment({
      sid: 102, shipment_id: 'FBA-LK-2', shipment_sn: 'SN-LK-2', weight: '10', weight_unit: 'kg',
      carrier_id: 'CARRIER-B', carrier_name: '承运商乙', tracking_no: 'TRK-OTHER-SHOP',
      source_version: 1, last_update_time: '2026-04-01T00:00:00Z'
    }, null, { sid: '102' }),
    // Conflict: same tracking_no in shop 101 linked to two different carriers
    mapLingxingShipment({
      sid: 101, shipment_id: 'FBA-LK-3A', shipment_sn: 'SN-LK-3A', weight: '10', weight_unit: 'kg',
      carrier_id: 'CARRIER-A', carrier_name: '承运商甲', tracking_no: 'TRK-CONFLICT',
      source_version: 1, last_update_time: '2026-04-01T00:00:00Z'
    }, null, { sid: '101' }),
    mapLingxingShipment({
      sid: 101, shipment_id: 'FBA-LK-3B', shipment_sn: 'SN-LK-3B', weight: '10', weight_unit: 'kg',
      carrier_id: 'CARRIER-C', carrier_name: '承运商丙', tracking_no: 'TRK-CONFLICT',
      source_version: 1, last_update_time: '2026-04-01T00:00:00Z'
    }, null, { sid: '101' })
  ]);

  // 1. Exact match in same shop
  const ok = store.lookupCarrierByTrackingNo({ trackingNo: 'trk-ok-001', sid: '101' });
  assert.equal(ok.status, 'matched');
  assert.equal(ok.carrier.id, 'CARRIER-A');
  assert.equal(ok.carrier.name, '承运商甲');
  assert.equal(ok.matchSourceCode, 'lingxing_leg');

  // 2. Not found (even with well-known UPS 1Z prefix -> MUST NOT guess!)
  const nf = store.lookupCarrierByTrackingNo({ trackingNo: '1Z999AA10123456784', sid: '101' });
  assert.equal(nf.status, 'not_found');
  assert.equal(nf.carrier, null);

  // 3. Cross-shop
  const cross = store.lookupCarrierByTrackingNo({ trackingNo: 'TRK-OTHER-SHOP', sid: '101' });
  assert.equal(cross.status, 'cross_shop');
  assert.equal(cross.carrier, null);
  assert.deepEqual(cross.matchedSids, ['102']);

  // 4. Conflict (two different carriers share same tracking no in shop 101)
  const conf = store.lookupCarrierByTrackingNo({ trackingNo: 'TRK-CONFLICT', sid: '101' });
  assert.equal(conf.status, 'conflict');
  assert.equal(conf.carrier, null);
  assert.equal(conf.candidates.length, 2);
});

// ---------------------------------------------------------------------------
// 4. Effective carrier applies to shipments, pricing, ratings & DRAFT statements,
//    while leaving CONFIRMED statements and verified defect history untouched
// ---------------------------------------------------------------------------
test('有效服务商统一用于货件、运费、评级和未确认账单，不改变已确认账单与已核缺陷历史', async t => {
  const { store } = await withTempStore(t);

  // April shipment (draft statement) + May shipment (confirmed statement + verified defect fee)
  store.upsertShipmentsPage([
    mapLingxingShipment({
      sid: 101, shipment_id: 'FBA-APR-1', shipment_sn: 'SN-APR-1',
      country_code: 'US', dest_timezone: 'America/Los_Angeles', route_lane: 'CN-US',
      promised_arrival_start: '2026-04-10', promised_arrival_end: '2026-04-12',
      signed_at: '2026-04-11T18:00:00Z', weight: '100', weight_unit: 'kg',
      carrier_id: 'CARRIER-OLD', carrier_name: '旧承运商',
      source_version: 1, last_update_time: '2026-04-12T00:00:00Z'
    }, null, { sid: '101' }),
    mapLingxingShipment({
      sid: 101, shipment_id: 'FBA-MAY-1', shipment_sn: 'SN-MAY-1',
      country_code: 'US', dest_timezone: 'America/Los_Angeles', route_lane: 'CN-US',
      promised_arrival_start: '2026-05-10', promised_arrival_end: '2026-05-12',
      signed_at: '2026-05-11T18:00:00Z', weight: '50', weight_unit: 'kg',
      carrier_id: 'CARRIER-OLD', carrier_name: '旧承运商',
      source_version: 1, last_update_time: '2026-05-12T00:00:00Z'
    }, null, { sid: '101' })
  ]);

  const ships = store.listShipments({ sid: '101' }).items;
  const aprLeg = ships.find(s => s.fbaShipmentId === 'FBA-APR-1').legs[0];
  const mayLeg = ships.find(s => s.fbaShipmentId === 'FBA-MAY-1').legs[0];

  store.saveLegPricing({ legId: aprLeg.id, unitPrice: '2.00', currency: 'USD', expectedVersion: 0 });
  store.saveLegPricing({ legId: mayLeg.id, unitPrice: '2.00', currency: 'USD', expectedVersion: 0 });

  // Verified defect fee on May shipment under CARRIER-OLD
  store.recordDefectFee({
    sourceBillNo: 'BILL-MAY-01', sourceLineNo: 'L1', currency: 'USD',
    occurredDate: '2026-05-15', bookingMonth: '2026-05', totalAmount: '20.00',
    carrierId: 'CARRIER-OLD', carrierName: '旧承运商',
    responsibilityBasis: '签收破损确认', status: 'verified',
    targets: [{ sid: '101', fbaShipmentId: 'FBA-MAY-1', legId: mayLeg.id, weight: 1 }]
  });

  // April remains DRAFT; May is CONFIRMED (frozen)
  runMonthlySettlement(store, '2026-04');
  const mayRun = runMonthlySettlement(store, '2026-05');
  confirmStatement(store, mayRun.statements[0].id, 'cfo');

  // Create new manual carrier:
  // 1) Rebind April (DRAFT) leg to newCarrier -> allowed, draft statement moves cleanly to newCarrier
  const { carrier: newCarrier } = store.createCarrier({ name: '新合作物流', operator: 'ops' });
  store.bindLegCarrier({ legId: aprLeg.id, carrierId: newCarrier.id, operator: 'ops' });

  runMonthlySettlement(store, '2026-04');
  const aprStmts = listStatements(store, { periodMonth: '2026-04' });
  assert.equal(aprStmts.length, 1);
  assert.equal(aprStmts[0].carrierId, newCarrier.id);
  assert.equal(aprStmts[0].carrierName, '新合作物流');
  assert.equal(aprStmts[0].netPayableAmount, '200.00');

  // 2) Financial guard: May leg is ALREADY in CONFIRMED statement for CARRIER-OLD!
  //    Rebinding to newCarrier MUST be rejected with 409 so A & B cannot both be payable!
  assert.throws(
    () => store.bindLegCarrier({ legId: mayLeg.id, carrierId: newCarrier.id, operator: 'ops' }),
    err => err.statusCode === 409 && /已确认账单/.test(err.message) && /重复应付/.test(err.message)
  );

  //    Same-entity tracking number maintenance on confirmed May leg MUST still be allowed!
  const sameEntityTrack = store.bindLegCarrier({
    legId: mayLeg.id,
    carrierId: 'CARRIER-OLD',
    manualTrackingNo: 'OLD-POD-TRACK-99',
    note: '补录同主体运单号',
    operator: 'ops'
  });
  assert.equal(sameEntityTrack.effectiveCarrierId, 'CARRIER-OLD');
  assert.equal(sameEntityTrack.effectiveTrackingNo, 'OLD-POD-TRACK-99');

  //    Rerunning May settlement after rejected rebind & same-entity track update MUST NOT create any payable on newCarrier!
  runMonthlySettlement(store, '2026-05');
  const mayStmtsAfterRerun = listStatements(store, { periodMonth: '2026-05' });
  assert.equal(mayStmtsAfterRerun.length, 1, '重算同月不得为其他主体生成重复应付账单');
  assert.equal(mayStmtsAfterRerun[0].carrierId, 'CARRIER-OLD');
  assert.equal(mayStmtsAfterRerun[0].status, 'confirmed');
  assert.equal(mayStmtsAfterRerun[0].freightAmount, '100.00');
  assert.equal(mayStmtsAfterRerun[0].defectDeductionAmount, '20.00');
  assert.equal(mayStmtsAfterRerun[0].netPayableAmount, '80.00');

  //    Also verify unbind guard: when a leg was manually bound to carrier B, confirmed under B,
  //    attempting to unbind back to source carrier A MUST be rejected with 409!
  const aprRun = runMonthlySettlement(store, '2026-04');
  confirmStatement(store, aprRun.statements[0].id, 'cfo');
  assert.throws(
    () => store.bindLegCarrier({ legId: aprLeg.id, carrierId: null, operator: 'ops' }),
    err => err.statusCode === 409 && /禁止解除绑定变更结算主体/.test(err.message)
  );
  runMonthlySettlement(store, '2026-04');
  const aprStmtsFinal = listStatements(store, { periodMonth: '2026-04' });
  assert.equal(aprStmtsFinal.length, 1, '已确认账单解除绑定被拒后重算同月仍只有唯一应付主体');
  assert.equal(aprStmtsFinal[0].carrierId, newCarrier.id);

  // Verified defect fee history MUST remain under CARRIER-OLD
  const fees = store.listDefectFees({ bookingMonth: '2026-05' });
  assert.equal(fees[0].carrier_id, 'CARRIER-OLD');

  // Ratings reflect April under newCarrier and May under CARRIER-OLD
  const ratings = queryCarrierRatings(store).ratings;
  assert.ok(ratings.some(r => r.carrierId === newCarrier.id && r.totalShipments === 1));
  assert.ok(ratings.some(r => r.carrierId === 'CARRIER-OLD' && r.totalShipments === 1));
});

// ---------------------------------------------------------------------------
// 5. Gateway, UI toolbar cleanup, shared providers.source, unconfigured state & demo isolation
// ---------------------------------------------------------------------------
test('移除工具栏 API 快捷入口、保留全局菜单、仅用 providers.source 且未配置状态准确', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'carriers-gateway-'));

  // 1) Unconfigured live server using default connections({})
  const unconfiguredProviders = connections({});
  const liveUnconfigured = service({ directory: dir, providers: unconfiguredProviders, demo: false });
  liveUnconfigured.listen(0, '127.0.0.1');
  await once(liveUnconfigured, 'listening');

  // 2) Configured live server via shared providers.source
  let sourceCalled = false;
  const configuredProviders = connections(
    { LINGXING_TRANSPORT: 'api', LINGXING_APP_ID: '0123456789abcdef', LINGXING_APP_SECRET: 'secret' },
    {
      sourceFactory: () => ({
        transport: 'API',
        async read(path) {
          sourceCalled = true;
          if (path === '/erp/sc/data/seller/lists') return { code: 0, data: [] };
          return { code: 0, data: { list: [], total: 0 }, total: 0 };
        },
        async orderDetails() { return { code: 0, data: [] }; }
      })
    }
  );
  const liveConfigured = service({ directory: dir, providers: configuredProviders, demo: false });
  liveConfigured.listen(0, '127.0.0.1');
  await once(liveConfigured, 'listening');

  t.after(async () => {
    await Promise.all([
      new Promise(r => liveUnconfigured.close(r)),
      new Promise(r => liveConfigured.close(r))
    ]);
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  const baseUnconf = `http://127.0.0.1:${liveUnconfigured.address().port}`;
  const baseConf = `http://127.0.0.1:${liveConfigured.address().port}`;

  // UI check: toolbar has NO connections.html link, global menu & home link preserved
  const html = await (await fetch(baseUnconf + '/system/logistics.html')).text();
  assert.doesNotMatch(html, /class="ghost-link"[^>]*connections\.html/, '物流模块工具栏不得包含 API 配置快捷入口');
  assert.match(html, /class="global-nav"/, '必须保留全局导航菜单');
  assert.match(html, /<a href="\.\/">经营首页<\/a>/, '必须保留经营首页入口');

  // Unconfigured live state MUST report liveConfigured: false and return 503 on live sync, 403 on demo sync
  const ovUnconf = await (await fetch(baseUnconf + '/api/logistics/overview')).json();
  assert.equal(ovUnconf.liveConfigured, false, '未配置领星凭据时 liveConfigured 必须为 false');
  const syncUnconf = await fetch(baseUnconf + '/api/logistics/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'live' })
  });
  assert.equal(syncUnconf.status, 503);
  const syncDemoBlocked = await fetch(baseUnconf + '/api/logistics/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'demo' })
  });
  assert.equal(syncDemoBlocked.status, 403);

  // Configured live server calls through shared providers.source
  const ovConf = await (await fetch(baseConf + '/api/logistics/overview')).json();
  assert.equal(ovConf.liveConfigured, true);
  const syncConf = await fetch(baseConf + '/api/logistics/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'live' })
  });
  assert.equal(syncConf.status, 200);
  assert.equal(sourceCalled, true, '必须通过共享 providers.source 调用领星');

  // HTTP carrier directory API check
  const createRes = await fetch(baseConf + '/api/logistics/carriers', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'HTTP 测试物流商', operator: 'tester' })
  });
  assert.equal(createRes.status, 200);
  const listRes = await (await fetch(baseConf + '/api/logistics/carriers')).json();
  assert.ok(listRes.carriers.some(c => c.name === 'HTTP 测试物流商'));
});

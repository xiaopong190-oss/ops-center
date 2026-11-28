import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';

import { parseDecimal, allocateMinor, formatMinor } from './decimal.mjs';
import { evaluateArrival, resolveWeight, computeFreightPricing, mapLingxingShipment } from './domain.mjs';
import { openLogisticsStore } from './store.mjs';
import { syncShopShipments, syncAllShops, FBA_SHIPMENT_LIST_PATH, FBA_SHIPMENT_DETAIL_PATH } from './sync.mjs';
import { createDemoLogisticsClient, seedDemoPricingAndFees } from './demo-data.mjs';
import { runMonthlySettlement, confirmStatement, listStatements, exportStatementCsv, startMonthlyScheduler } from './settlement.mjs';
import { queryCarrierRatings } from './rating.mjs';
import { service } from '../shared/server.mjs';
import { demoClient } from '../demo.mjs';

async function withTempStore(t) {
  const dir = await mkdtemp(join(tmpdir(), 'logistics-test-'));
  const store = openLogisticsStore(dir);
  t.after(async () => {
    try { store.close(); } catch { /* already closed */ }
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
  return { dir, store };
}

async function withTempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'logistics-test-'));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
  return dir;
}

// ---------------------------------------------------------------------------
// 1. US Same-Plan 5 Shipments (4 on Apr 1, 1 on May 1 -> 30 days delayed, 0 fee without bill)
// ---------------------------------------------------------------------------
test('场景1：美国同计划五票（四票4月1日准时、一票5月1日延迟30天，无账单时已核缺陷费为0）', async t => {
  const { store } = await withTempStore(t);

  const client = createDemoLogisticsClient();
  await syncAllShops({ client, store, startDate: '2026-03-01', endDate: '2026-05-31', dataMode: 'demo' });

  const batches = store.listBatches({ sid: '101', now: '2026-05-10T12:00:00Z' });
  const planA = batches.find(b => b.planId === 'PLAN-US-202603-A');
  assert.ok(planA, '应按共同发运计划号归组');
  assert.equal(planA.shipments.length, 5);
  assert.equal(planA.onTimeCount, 4);
  assert.equal(planA.delayedCount, 1);
  assert.equal(planA.anomalyShipments.length, 1);

  const fifth = planA.anomalyShipments[0];
  assert.equal(fifth.fbaShipmentId, 'FBA18USPLAN05');
  assert.equal(fifth.deviationDays, 30);
  assert.equal(fifth.carriers[0].carrierId, 'CARRIER-SLOW');
  assert.equal(fifth.carriers[0].trackingNo, 'SLOW-770055');

  const fifthFull = planA.shipments.find(s => s.fbaShipmentId === 'FBA18USPLAN05');
  assert.equal(fifthFull.warningDefectAmount, '40.00'); // 预警金额独立展示
  assert.deepEqual(fifthFull.verifiedDefectFees, {});   // 无账单时已核缺陷费为 0
});

// ---------------------------------------------------------------------------
// 2. Inject USD 40 defect fee on 5th shipment, replay idempotency, next-month reversal
// ---------------------------------------------------------------------------
test('场景2：注入第五票 USD 40 缺陷费并重放幂等，次月冲销引用原行且历史月结可复核', async t => {
  const { store } = await withTempStore(t);

  const client = createDemoLogisticsClient();
  await syncAllShops({ client, store, startDate: '2026-03-01', endDate: '2026-05-31', dataMode: 'demo' });
  seedDemoPricingAndFees(store);

  const feePayload = {
    sourceBillNo: 'BILL-2026-05-888',
    sourceLineNo: 'LINE-01',
    currency: 'USD',
    occurredDate: '2026-05-05',
    bookingMonth: '2026-05',
    totalAmount: '40.00',
    carrierId: 'CARRIER-SLOW',
    carrierName: '远洋慢递物流',
    responsibilityBasis: '尾程延迟30天签收赔付确认单',
    status: 'verified',
    targets: [{ sid: '101', fbaShipmentId: 'FBA18USPLAN05', legId: '101:SP20260315005:REC-SP20260315005-1', weight: 1 }]
  };

  const first = store.recordDefectFee(feePayload);
  assert.equal(first.deduplicated, false);
  const replay = store.recordDefectFee(feePayload);
  assert.equal(replay.deduplicated, true);
  assert.equal(replay.fee.id, first.fee.id);

  const mayFees = store.listDefectFees({ bookingMonth: '2026-05' });
  assert.equal(mayFees.length, 1);
  assert.equal(mayFees[0].total_amount, '40.00');

  // Generate & confirm May statement
  const mayRun = runMonthlySettlement(store, '2026-05');
  const maySlow = mayRun.statements.find(s => s.carrierId === 'CARRIER-SLOW' && s.currency === 'USD');
  assert.ok(maySlow);
  assert.equal(maySlow.freightAmount, '28.00');
  assert.equal(maySlow.defectDeductionAmount, '40.00');
  assert.equal(maySlow.netPayableAmount, '-12.00');
  confirmStatement(store, maySlow.id, 'finance-auditor');

  // Next-month (2026-06) reversal referencing original fee line
  const rev = store.reverseDefectFee({
    feeId: first.fee.id,
    reversalDate: '2026-06-03',
    reversalMonth: '2026-06',
    reason: '物流商提供清关不可抗力证明，核减冲销',
    operator: 'finance-auditor'
  });
  assert.equal(rev.reversal.reversed_fee_id, first.fee.id);
  assert.equal(rev.reversal.total_amount, '-40.00');

  // June settlement credits back USD 40.00 (defectDeduction = -40.00 -> netPayable = +40.00)
  const junRun = runMonthlySettlement(store, '2026-06');
  const junSlow = junRun.statements.find(s => s.carrierId === 'CARRIER-SLOW' && s.currency === 'USD');
  assert.equal(junSlow.defectDeductionAmount, '-40.00');
  assert.equal(junSlow.netPayableAmount, '40.00');

  // Historical May statement remains intact & reproducible
  const mayRecheck = listStatements(store, { periodMonth: '2026-05', carrierId: 'CARRIER-SLOW' })[0];
  assert.equal(mayRecheck.status, 'confirmed');
  assert.equal(mayRecheck.defectDeductionAmount, '40.00');
  assert.equal(mayRecheck.netPayableAmount, '-12.00');
});

// ---------------------------------------------------------------------------
// 3. 12.345 kg × USD 2.40/kg = 29.63, manual override to 28.00 (delta -1.63),
//    restart persistence & sync replay with weight change alert
// ---------------------------------------------------------------------------
test('场景3：12.345 kg × USD 2.40/kg 手改至 28.00，重启及重复同步后保留覆盖并提示源重变更', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'logistics-test-'));
  let store = openLogisticsStore(dir);
  t.after(async () => {
    try { store.close(); } catch { /* already closed */ }
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  const baseRaw = {
    sid: 101,
    shipment_id: 'FBA-PRICE-01',
    shipment_sn: 'SP-PRICE-01',
    weight: '12.345',
    weight_unit: 'kg',
    carrier_id: 'CARRIER-A',
    carrier_name: '测试承运商A',
    source_version: 1,
    last_update_time: '2026-04-01T10:00:00Z'
  };
  store.upsertShipmentsPage([mapLingxingShipment(baseRaw, null, { sid: '101' })]);
  const legId = '101:SP-PRICE-01:SP-PRICE-01-L1';

  const saved = store.saveLegPricing({
    legId,
    unitPrice: '2.40',
    priceUnit: 'kg',
    currency: 'USD',
    manualOverrideAmount: '28.00',
    overrideReason: '协议包干折扣',
    operator: 'alice',
    expectedVersion: 0
  });
  assert.equal(saved.calculated_amount, '29.63');
  assert.equal(saved.effective_amount, '28.00');
  assert.equal(saved.override_delta, '-1.63');
  assert.equal(saved.version, 1);

  // Restart database (close & reopen)
  store.close();
  store = openLogisticsStore(dir);

  // Replay sync with UPDATED source weight (13.000 kg, source_version: 2)
  const updatedRaw = { ...baseRaw, weight: '13.000', source_version: 2, last_update_time: '2026-04-02T10:00:00Z' };
  store.upsertShipmentsPage([mapLingxingShipment(updatedRaw, null, { sid: '101' })]);

  const { items } = store.listShipments({ sid: '101' });
  const leg = items[0].legs[0];
  assert.equal(leg.weightFormatted, '13');
  assert.equal(leg.pricing.effectiveAmount, '28.00');      // Manual override preserved!
  assert.equal(leg.pricing.calculatedAmount, '31.20');     // 13 * 2.40
  assert.equal(leg.pricing.overrideDelta, '-3.20');        // 28.00 - 31.20
  assert.equal(leg.pricing.sourceWeightChanged, true);     // Weight change flagged!
  assert.equal(leg.pricing.previousWeightFormatted, '12.345');

  const audit = store.getPricingAudit(legId);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].operator, 'alice');
  assert.equal(audit[0].reason, '协议包干折扣');
  assert.equal(audit[0].after.calculated_amount, '29.63');
});

// ---------------------------------------------------------------------------
// 4. Calendar Boundaries: early/window edges/late/leap day/cross-year/DST/missing event
// ---------------------------------------------------------------------------
test('场景4：日历边界（提前一天、窗口两端、晚一天、闰日、跨年、夏令时切换、缺实际事件）', () => {
  const tz = 'America/Los_Angeles';

  // 1 day early
  const early = evaluateArrival({
    promisedStart: '2026-04-01', promisedEnd: '2026-04-05', destTimezone: tz,
    signedAt: '2026-03-31T20:00:00Z' // 2026-03-31 13:00 PDT
  });
  assert.equal(early.status, 'early');
  assert.equal(early.deviationDays, -1);

  // Window start (local calendar day boundary: 2026-04-01 00:30 PDT = 07:30Z)
  const atStart = evaluateArrival({
    promisedStart: '2026-04-01', promisedEnd: '2026-04-05', destTimezone: tz,
    signedAt: '2026-04-01T07:30:00Z'
  });
  assert.equal(atStart.status, 'on_time');
  assert.equal(atStart.deviationDays, 0);

  // Window end (2026-04-05 23:30 PDT = 2026-04-06T06:30:00Z -> still April 5 in LA!)
  const atEnd = evaluateArrival({
    promisedStart: '2026-04-01', promisedEnd: '2026-04-05', destTimezone: tz,
    signedAt: '2026-04-06T06:30:00Z'
  });
  assert.equal(atEnd.actualLocalDay, '2026-04-05');
  assert.equal(atEnd.status, 'on_time');
  assert.equal(atEnd.deviationDays, 0);

  // 1 day late (2026-04-06 00:15 PDT = 2026-04-06T07:15:00Z)
  const late = evaluateArrival({
    promisedStart: '2026-04-01', promisedEnd: '2026-04-05', destTimezone: tz,
    signedAt: '2026-04-06T07:15:00Z'
  });
  assert.equal(late.actualLocalDay, '2026-04-06');
  assert.equal(late.status, 'delayed');
  assert.equal(late.deviationDays, 1);

  // Leap day (2024-02-28 promised -> delivered 2024-02-29 => +1 day; delivered 2024-03-01 => +2 days)
  const leap1 = evaluateArrival({
    promisedStart: '2024-02-28', promisedEnd: '2024-02-28', destTimezone: 'UTC',
    signedAt: '2024-02-29T12:00:00Z'
  });
  assert.equal(leap1.deviationDays, 1);
  const leap2 = evaluateArrival({
    promisedStart: '2024-02-28', promisedEnd: '2024-02-28', destTimezone: 'UTC',
    signedAt: '2024-03-01T12:00:00Z'
  });
  assert.equal(leap2.deviationDays, 2);

  // Cross-year (2025-12-31 -> 2026-01-01 => +1 day)
  const crossYear = evaluateArrival({
    promisedStart: '2025-12-31', promisedEnd: '2025-12-31', destTimezone: 'UTC',
    firstReceivedAt: '2026-01-01T01:00:00Z'
  });
  assert.equal(crossYear.status, 'delayed');
  assert.equal(crossYear.deviationDays, 1);
  assert.equal(crossYear.actualEventSource, 'first_received');

  // DST Spring-Forward (2026-03-08 23h day in America/Los_Angeles)
  const dstSpring = evaluateArrival({
    promisedStart: '2026-03-07', promisedEnd: '2026-03-07', destTimezone: tz,
    signedAt: '2026-03-09T06:30:00Z' // 2026-03-08 23:30 PDT
  });
  assert.equal(dstSpring.actualLocalDay, '2026-03-08');
  assert.equal(dstSpring.deviationDays, 1);

  // DST Fall-Back (2026-11-01 25h day in America/Los_Angeles)
  const dstFall = evaluateArrival({
    promisedStart: '2026-10-31', promisedEnd: '2026-10-31', destTimezone: tz,
    signedAt: '2026-11-02T07:30:00Z' // 2026-11-01 23:30 PST
  });
  assert.equal(dstFall.actualLocalDay, '2026-11-01');
  assert.equal(dstFall.deviationDays, 1);

  // Missing actual event -> in_transit vs overdue vs unknown
  const inTransit = evaluateArrival({
    promisedStart: '2026-05-01', promisedEnd: '2026-05-10', destTimezone: tz,
    now: '2026-05-08T12:00:00Z'
  });
  assert.equal(inTransit.status, 'in_transit');
  assert.equal(inTransit.actualEventSource, 'unknown');

  const overdue = evaluateArrival({
    promisedStart: '2026-05-01', promisedEnd: '2026-05-10', destTimezone: tz,
    now: '2026-05-15T18:00:00Z'
  });
  assert.equal(overdue.status, 'overdue');
  assert.equal(overdue.deviationDays, 5);

  const unknown = evaluateArrival({
    promisedStart: null, promisedEnd: null, destTimezone: tz
  });
  assert.equal(unknown.status, 'unknown');
});

// ---------------------------------------------------------------------------
// 5. Illegal values, mixed-SKU box, cross-shop duplicate ID, multi-carrier, missing planId
// ---------------------------------------------------------------------------
test('场景5：非法值拒绝、混箱只计一次、跨店重号隔离、多物流商防重复计费、缺计划号不混组', async t => {
  // Reject zero, negative, huge, unknown unit, missing currency
  assert.throws(() => parseDecimal('0', { allowZero: false }));
  assert.throws(() => parseDecimal('-5.2', { allowNegative: false }));
  assert.throws(() => parseDecimal('999999999999'));
  assert.throws(() => computeFreightPricing({ weight: '10', weightUnit: 'stone', unitPrice: '2', currency: 'USD' }));
  assert.throws(() => computeFreightPricing({ weight: '10', weightUnit: 'kg', unitPrice: '2', currency: '' }));
  // Multi-leg whole-shipment double billing rejected
  assert.throws(() => computeFreightPricing({
    weight: '100', weightUnit: 'kg', unitPrice: '2', currency: 'USD',
    legCount: 2, pricingScope: 'whole_shipment'
  }), /禁止重复使用整单重量/);

  // Mixed-SKU box: BOX-1 appears twice (SKU-A & SKU-B) -> counted ONCE (12.5 + 7.5 = 20 kg)
  const mixedOk = resolveWeight({
    boxes: [
      { box_no: 'BOX-1', sku: 'SKU-A', weight: '12.5', weight_unit: 'kg', owner_shipment_id: 'FBA-MIX' },
      { box_no: 'BOX-1', sku: 'SKU-B', weight: '12.5', weight_unit: 'kg', owner_shipment_id: 'FBA-MIX' },
      { box_no: 'BOX-2', sku: 'SKU-C', weight: '7.5', weight_unit: 'kg', owner_shipment_id: 'FBA-MIX' }
    ],
    declaredBoxCount: 2,
    targetShipmentId: 'FBA-MIX'
  });
  assert.equal(mixedOk.settlementBlocked, false);
  assert.equal(mixedOk.weightFormatted, '20');
  assert.equal(mixedOk.boxCount, 2);

  // Incomplete box count or ambiguous ownership -> blocked
  const incompleteBox = resolveWeight({
    boxes: [{ box_no: 'BOX-1', weight: '10', weight_unit: 'kg' }],
    declaredBoxCount: 3,
    targetShipmentId: 'FBA-MIX'
  });
  assert.equal(incompleteBox.settlementBlocked, true);

  // Duplicate FBA shipment ID across two shops (sid=101 vs sid=102) + missing planId not merged
  const { store } = await withTempStore(t);

  const s101 = mapLingxingShipment({
    sid: 101, shipment_id: 'FBA-DUP-001', shipment_sn: 'SN-101', plan_id: null,
    weight: '50', weight_unit: 'kg', shipped_at: '2026-04-01T00:00:00Z',
    promised_arrival_start: '2026-04-10', promised_arrival_end: '2026-04-10',
    source_version: 1, last_update_time: '2026-04-02T00:00:00Z'
  }, null, { sid: '101' });

  const s102 = mapLingxingShipment({
    sid: 102, shipment_id: 'FBA-DUP-001', shipment_sn: 'SN-102', plan_id: null,
    weight: '80', weight_unit: 'kg', shipped_at: '2026-04-01T00:00:00Z',
    promised_arrival_start: '2026-04-10', promised_arrival_end: '2026-04-10',
    source_version: 1, last_update_time: '2026-04-02T00:00:00Z'
  }, null, { sid: '102' });

  // Multi-carrier single dispatch order
  const multiCarrier = mapLingxingShipment({
    sid: 101, shipment_id: 'FBA-MULTI-01', shipment_sn: 'SN-MULTI', plan_id: 'PLAN-X',
    weight: '100', weight_unit: 'kg', source_version: 1, last_update_time: '2026-04-02T00:00:00Z'
  }, {
    shipment_sn: 'SN-MULTI',
    logistics_list: [
      { logistics_record_id: 'LEG-SEA', carrier_id: 'C-SEA', carrier_name: '海运头程', weight: '100', weight_unit: 'kg', pricing_scope: 'leg_weight' },
      { logistics_record_id: 'LEG-TRUCK', carrier_id: 'C-TRUCK', carrier_name: '尾程卡派', weight: '100', weight_unit: 'kg', pricing_scope: 'leg_weight' }
    ]
  }, { sid: '101' });

  store.upsertShipmentsPage([s101, s102, multiCarrier]);
  assert.equal(store.listShipments({ sid: '101' }).items.length, 2);
  assert.equal(store.listShipments({ sid: '102' }).items.length, 1);
  assert.equal(store.listShipments({ sid: '102' }).items[0].weightFormatted, '80');

  // Missing planId shipments are NOT merged into any batch group
  const batches = store.listBatches({});
  assert.equal(batches.length, 1);
  assert.equal(batches[0].planId, 'PLAN-X');
  assert.equal(batches[0].shipments[0].legs.length, 2);
});

// ---------------------------------------------------------------------------
// 6. Fee split across 3 shipments with cent conservation + multi-currency + disputed
// ---------------------------------------------------------------------------
test('场景6：同一费用拆至三票分币尾差守恒、多币种隔离、争议承担方不扣应付', async t => {
  // Pure cent conservation check: 10.00 / 3 -> 3.34 + 3.33 + 3.33 = 10.00
  const shares = allocateMinor(1000n, [1, 1, 1]);
  assert.deepEqual(shares.map(s => formatMinor(s, 2)), ['3.34', '3.33', '3.33']);
  assert.equal(shares.reduce((a, b) => a + b, 0n), 1000n);

  const { store } = await withTempStore(t);

  const client = createDemoLogisticsClient();
  await syncAllShops({ client, store, startDate: '2026-03-01', endDate: '2026-05-31', dataMode: 'demo' });
  seedDemoPricingAndFees(store);

  // Split USD 10.00 across 3 APEX shipments
  const splitRes = store.recordDefectFee({
    sourceBillNo: 'BILL-SPLIT-01',
    sourceLineNo: 'L1',
    currency: 'USD',
    occurredDate: '2026-04-10',
    bookingMonth: '2026-04',
    totalAmount: '10.00',
    carrierId: 'CARRIER-APEX',
    carrierName: '极速空派物流',
    responsibilityBasis: '三票合单超重附加费',
    status: 'verified',
    targets: [
      { sid: '101', fbaShipmentId: 'FBA18USPLAN01', weight: 1 },
      { sid: '101', fbaShipmentId: 'FBA18USPLAN02', weight: 1 },
      { sid: '101', fbaShipmentId: 'FBA18USPLAN03', weight: 1 }
    ]
  });
  assert.deepEqual(splitRes.allocations.map(a => a.allocated_amount), ['3.34', '3.33', '3.33']);

  // Record a EUR fee (different currency -> separate statement)
  store.recordDefectFee({
    sourceBillNo: 'BILL-EUR-01',
    sourceLineNo: 'L1',
    currency: 'EUR',
    occurredDate: '2026-04-12',
    bookingMonth: '2026-04',
    totalAmount: '25.00',
    carrierId: 'CARRIER-APEX',
    carrierName: '极速空派物流',
    responsibilityBasis: '欧盟清关杂费',
    status: 'verified',
    targets: [{ sid: '101', fbaShipmentId: 'FBA18USPLAN01', weight: 1 }]
  });

  // Record a DISPUTED USD 99.00 fee -> MUST NOT deduct from APEX USD net payable!
  store.recordDefectFee({
    sourceBillNo: 'BILL-DISPUTE-01',
    sourceLineNo: 'L1',
    currency: 'USD',
    occurredDate: '2026-04-15',
    bookingMonth: '2026-04',
    totalAmount: '99.00',
    carrierId: 'CARRIER-APEX',
    carrierName: '极速空派物流',
    responsibilityBasis: '争议待仲裁',
    status: 'disputed',
    targets: [{ sid: '101', fbaShipmentId: 'FBA18USPLAN04', weight: 1 }]
  });

  const run = runMonthlySettlement(store, '2026-04');
  const apexUsd = run.statements.find(s => s.carrierId === 'CARRIER-APEX' && s.currency === 'USD');
  const apexEur = run.statements.find(s => s.carrierId === 'CARRIER-APEX' && s.currency === 'EUR');

  assert.ok(apexUsd && apexEur, '不同币种必须独立出账');
  assert.equal(apexUsd.defectDeductionAmount, '10.00'); // Only verified 10.00 deducted; disputed 99.00 excluded!
  assert.equal(apexUsd.pendingCount, 1);                // Disputed fee listed in pendingItems
  assert.equal(apexEur.defectDeductionAmount, '25.00');
});

// ---------------------------------------------------------------------------
// 7. Extreme Stress Test: 10,000+ shipments, duplicate & out-of-order pages,
//    HTTP 429 retry, mid-sync interruption & resume, concurrent pricing override (409),
//    and dual concurrent monthly settlement jobs
// ---------------------------------------------------------------------------
test('场景7：极限测试（10,000票、重复乱序分页、429重试、中断续传、并发改价冲突、双任务月结唯一性）', async t => {
  const { store } = await withTempStore(t);

  const TOTAL = 10000;
  const PAGE_SIZE = 500;
  const allRows = [];
  for (let i = 0; i < TOTAL; i++) {
    const id = `FBA10K${String(i).padStart(6, '0')}`;
    allRows.push({
      sid: 201,
      shipment_id: id,
      shipment_sn: `SN10K${String(i).padStart(6, '0')}`,
      plan_id: `PLAN-10K-${Math.floor(i / 50)}`,
      destination_fulfillment_center_id: 'ONT8',
      country_code: 'US',
      dest_timezone: 'America/Los_Angeles',
      route_lane: 'CN-US-WEST',
      service_level: 'SEA',
      promised_arrival_start: '2026-04-01',
      promised_arrival_end: '2026-04-15',
      signed_at: '2026-04-10T18:00:00Z',
      weight: '10.000',
      weight_unit: 'kg',
      carrier_id: i % 2 === 0 ? 'CARRIER-MEGA-A' : 'CARRIER-MEGA-B',
      carrier_name: i % 2 === 0 ? '巨轮海运A' : '巨轮海运B',
      source_version: 2,
      last_update_time: '2026-04-11T00:00:00Z'
    });
  }

  let calls = 0;
  let injected429 = false;
  let injectedCrash = false;

  const chaosClient = {
    async read(path, params) {
      if (path === FBA_SHIPMENT_LIST_PATH) {
        calls += 1;
        // Inject 429 on 3rd call
        if (!injected429 && calls === 3) {
          injected429 = true;
          const err = new Error('领星业务 HTTP 429');
          err.status = 429;
          throw err;
        }
        // Inject mid-sync crash at offset >= 4000 to verify cursor resume
        if (!injectedCrash && params.offset >= 4000) {
          injectedCrash = true;
          throw new Error('模拟网络中断');
        }
        const slice = allRows.slice(params.offset, params.offset + params.length);
        return { code: 0, total: TOTAL, data: slice };
      }
      if (path === FBA_SHIPMENT_DETAIL_PATH) {
        return { code: 0, data: [] };
      }
      throw new Error(`unexpected path ${path}`);
    }
  };

  const t0 = performance.now();
  // First run fails at offset 4000
  await assert.rejects(
    syncShopShipments({ client: chaosClient, store, sid: '201', startDate: '2026-04-01', endDate: '2026-04-30', pageSize: PAGE_SIZE, pause: async () => {} }),
    /模拟网络中断/
  );
  const midCursor = store.getCursor('201', '2026-04-01..2026-04-30');
  assert.equal(midCursor.last_offset, 4000);
  assert.equal(midCursor.completed, 0);

  // Inject out-of-order / stale duplicate page replay (source_version: 1, wrong weight: 999)
  const staleRes = store.upsertShipmentsPage([
    mapLingxingShipment({ ...allRows[0], weight: '999.000', source_version: 1, last_update_time: '2026-04-01T00:00:00Z' }, null, { sid: '201' })
  ]);
  assert.equal(staleRes.skippedStale, 1);

  // Resume from offset 4000 to completion
  const resumed = await syncShopShipments({
    client: chaosClient, store, sid: '201', startDate: '2026-04-01', endDate: '2026-04-30', pageSize: PAGE_SIZE, pause: async () => {}
  });
  const syncMs = Math.round(performance.now() - t0);
  assert.equal(resumed.resumedFromOffset, 4000);

  // Verify exact 10,000 rows and stale out-of-order record did NOT overwrite weight=10
  const stats = store.getStats();
  assert.equal(stats.shipmentCount, TOTAL);
  const firstRow = store.db.prepare('SELECT weight_formatted, source_version FROM shipments WHERE sid = ? AND fba_shipment_id = ?').get('201', 'FBA10K000000');
  assert.equal(firstRow.weight_formatted, '10');
  assert.equal(firstRow.source_version, 2);

  // Bulk price all 10,000 legs in one fast transaction to test settlement at scale
  const tPrice0 = performance.now();
  const insertPrice = store.db.prepare(`
    INSERT INTO leg_pricing (
      leg_id, sid, fba_shipment_id, carrier_id, currency, weight_unit,
      unit_price_scaled, unit_price_formatted, weight_scaled_at_pricing,
      calculated_minor, calculated_amount, effective_minor, effective_amount,
      override_delta_minor, override_delta, is_overridden, version, updated_at
    ) VALUES (?, '201', ?, ?, 'USD', 'kg', '2000000', '2', '10000000', '2000', '20.00', '2000', '20.00', '0', '0.00', 0, 1, ?)
  `);
  const nowIso = new Date().toISOString();
  store.transaction(() => {
    for (let i = 0; i < TOTAL; i++) {
      const sn = `SN10K${String(i).padStart(6, '0')}`;
      const id = `FBA10K${String(i).padStart(6, '0')}`;
      insertPrice.run(`201:${sn}:${sn}-L1`, id, i % 2 === 0 ? 'CARRIER-MEGA-A' : 'CARRIER-MEGA-B', nowIso);
    }
  });
  const bulkPriceMs = Math.round(performance.now() - tPrice0);

  // Concurrent pricing override test: two updates with expectedVersion=1 -> second MUST fail with 409
  const targetLeg = '201:SN10K000000:SN10K000000-L1';
  const okUpdate = store.saveLegPricing({
    legId: targetLeg, unitPrice: '2.00', priceUnit: 'kg', currency: 'USD',
    manualOverrideAmount: '19.50', overrideReason: '并发测试1', operator: 'op1', expectedVersion: 1
  });
  assert.equal(okUpdate.version, 2);
  assert.throws(() => store.saveLegPricing({
    legId: targetLeg, unitPrice: '2.00', priceUnit: 'kg', currency: 'USD',
    manualOverrideAmount: '18.00', overrideReason: '过期版本写入', operator: 'op2', expectedVersion: 1
  }), /版本冲突/);

  // Dual concurrent monthly settlement runs -> exactly 1 regular statement per carrier/currency, exact totals
  const tSettle0 = performance.now();
  const [run1, run2] = await Promise.all([
    Promise.resolve().then(() => runMonthlySettlement(store, '2026-04', { triggerType: 'job-1' })),
    Promise.resolve().then(() => runMonthlySettlement(store, '2026-04', { triggerType: 'job-2' }))
  ]);
  const settleMs = Math.round(performance.now() - tSettle0);

  const allStmts = listStatements(store, { periodMonth: '2026-04' });
  assert.equal(allStmts.length, 2, '每个承运商+币种+账期仅允许存在一份常规月结单');
  const megaA = allStmts.find(s => s.carrierId === 'CARRIER-MEGA-A');
  const megaB = allStmts.find(s => s.carrierId === 'CARRIER-MEGA-B');
  // 5000 legs * 20.00 = 100000.00; megaA has 1 override -0.50 -> 99999.50
  assert.equal(megaA.lineCount, 5000);
  assert.equal(megaA.calculatedFreightAmount, '100000.00');
  assert.equal(megaA.overrideDeltaAmount, '-0.50');
  assert.equal(megaA.netPayableAmount, '99999.50');
  assert.equal(megaB.lineCount, 5000);
  assert.equal(megaB.netPayableAmount, '100000.00');
  assert.ok(run1.statements.length === 2 && run2.statements.length === 2);

  console.log(`[极限测试实测] 10,000票同步+续传+429耗时=${syncMs}ms, 批量计价=${bulkPriceMs}ms, 双任务月结=${settleMs}ms`);
});

// ---------------------------------------------------------------------------
// 8. Full HTTP E2E: Home entry, Workbench UI, Sync, Override, Settlement, Export,
//    Freeze + Cross-month Adjustment, Catch-up Scheduler, Rating before/after price change
// ---------------------------------------------------------------------------
test('场景8：端到端（首页进入、工作台、同步、改价、月结导出同源同值、冻结调整、自动补跑、评级改价对照）', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'logistics-e2e-'));
  const server = service({ directory: dir, client: demoClient, demo: true });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(r => server.close(r));
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  const getJson = async path => {
    const r = await fetch(base + path);
    assert.equal(r.status, 200, `GET ${path} failed`);
    return r.json();
  };
  const postJson = async (path, body) => {
    const r = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { status: r.status, data: await r.json() };
  };

  // 1. Home entry & Logistics workbench page
  const homeHtml = await (await fetch(base + '/system/')).text();
  assert.ok(homeHtml.includes('logistics.html'), '首页应包含物流工作台入口');
  const logHtml = await (await fetch(base + '/system/logistics.html')).text();
  assert.match(logHtml, /<a href="\.\/">经营首页<\/a>/);
  assert.match(logHtml, /window\.systemData=/);
  assert.equal((await fetch(base + '/system/logistics.js')).status, 200);
  assert.equal((await fetch(base + '/system/logistics.css')).status, 200);

  // 2. Sync demo data via API
  const syncRes = await postJson('/api/logistics/sync', { mode: 'demo' });
  assert.equal(syncRes.status, 200);
  assert.equal(syncRes.data.dataMode, 'demo');

  // 3. Rating BEFORE price change
  const ratingBefore = await getJson('/api/logistics/ratings');
  const slowBefore = ratingBefore.ratings.find(r => r.carrierId === 'CARRIER-SLOW');
  const apexBefore = ratingBefore.ratings.find(r => r.carrierId === 'CARRIER-APEX');
  assert.ok(slowBefore && apexBefore);
  assert.equal(apexBefore.sufficientSample, true);
  assert.equal(slowBefore.sufficientSample, true);
  assert.ok(apexBefore.totalScore > slowBefore.totalScore, '极速空派评分应高于远洋慢递');

  // 4. Generate & confirm April statement, then export CSV & JSON and verify exact equality
  const settleRes = await postJson('/api/logistics/settlements/run', { periodMonth: '2026-04' });
  assert.equal(settleRes.status, 200);
  const apexStmt = settleRes.data.statements.find(s => s.carrierId === 'CARRIER-APEX' && s.currency === 'USD');
  assert.ok(apexStmt);

  const confirmRes = await postJson('/api/logistics/settlements/confirm', { statementId: apexStmt.id, operator: 'cfo' });
  assert.equal(confirmRes.status, 200);
  assert.equal(confirmRes.data.statement.status, 'confirmed');

  const exportedJson = await getJson(`/api/logistics/settlements/${encodeURIComponent(apexStmt.id)}/export?format=json`);
  const exportedCsv = await (await fetch(`${base}/api/logistics/settlements/${encodeURIComponent(apexStmt.id)}/export?format=csv`)).text();
  assert.equal(exportedJson.netPayableAmount, apexStmt.netPayableAmount);
  assert.ok(exportedCsv.includes(`net_payable=${apexStmt.netPayableAmount}`), 'CSV 导出应付金额必须与 API/页面同源同值');

  // 5. Override price on one APEX shipment AFTER confirmation -> frozen statement stays immutable, adjustment statement created
  const shipments = await getJson('/api/logistics/shipments');
  const apexShip = shipments.items.find(s => s.fbaShipmentId === 'FBA18USPLAN01');
  const apexLeg = apexShip.legs[0];
  const overrideRes = await postJson('/api/logistics/pricing', {
    legId: apexLeg.id,
    unitPrice: '3.50', // Higher unit price -> lowers price competitiveness score!
    currency: 'USD',
    expectedVersion: apexLeg.pricing.version,
    operator: 'ops-mgr'
  });
  assert.equal(overrideRes.status, 200);

  // Rerun 2026-04 settlement -> original confirmed statement unchanged, adjustment statement generated
  const rerunRes = await postJson('/api/logistics/settlements/run', { periodMonth: '2026-04' });
  assert.equal(rerunRes.status, 200);
  const allApril = (await getJson('/api/logistics/settlements?periodMonth=2026-04')).statements;
  const origStillFrozen = allApril.find(s => s.id === apexStmt.id);
  const adjStmt = allApril.find(s => s.statementType === 'adjustment' && s.originalStatementId === apexStmt.id);
  assert.equal(origStillFrozen.netPayableAmount, apexStmt.netPayableAmount, '已确认冻结账单不可被篡改');
  assert.ok(adjStmt, '跨月/冻结后变更必须生成引用原账单的调整单');

  // 6. Rating AFTER price increase -> pricePoints decreases explainably
  const ratingAfter = await getJson('/api/logistics/ratings');
  const apexAfter = ratingAfter.ratings.find(r => r.carrierId === 'CARRIER-APEX');
  assert.ok(apexAfter.weightedUnitPrice > apexBefore.weightedUnitPrice);
  assert.ok(apexAfter.scoreBreakdown.pricePoints <= apexBefore.scoreBreakdown.pricePoints);

  // 7. Auto catch-up scheduler on fresh restart for previous closed month
  const { store: schedStore } = await withTempStore(t);
  const scheduler = startMonthlyScheduler(schedStore, { nowFn: () => '2026-05-02T09:00:00+08:00', intervalMs: 3600000 });
  scheduler.stop();
  assert.ok(scheduler.initialRun, '服务启动应自动补跑上月(2026-04)月结任务');
  assert.equal(scheduler.initialRun.periodMonth, '2026-04');
});


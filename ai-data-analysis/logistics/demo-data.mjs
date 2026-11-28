// Sanitized synthetic demo client & seed data for Lingxing FBA Logistics Workbench.
// Explicitly marked as `demo` mode in API & UI; includes the 5-shipment US plan scenario,
// multi-carrier shipments, mixed-SKU boxes, and peer-group carriers for rating comparison.

import { FBA_SHIPMENT_LIST_PATH, FBA_SHIPMENT_DETAIL_PATH } from './sync.mjs';

export const DEMO_SHOPS = [
  { sid: 101, name: '北美旗舰店 (演示)', country: 'US' },
  { sid: 102, name: '欧洲精品店 (演示)', country: 'DE' }
];

export function buildDemoFixtures() {
  const shipments = [
    // --- US Same-Plan 5 Shipments (4 on-time Apr 1, 1 delayed May 1 by 30 days) ---
    {
      sid: 101,
      shipment_id: 'FBA18USPLAN01',
      shipment_sn: 'SP20260315001',
      plan_id: 'PLAN-US-202603-A',
      shipment_name: 'US-ONT8-批次A-第1票',
      destination_fulfillment_center_id: 'ONT8',
      country_code: 'US',
      dest_timezone: 'America/Los_Angeles',
      route_lane: 'CN-US-WEST',
      service_level: 'AIR_EXPRESS',
      shipped_at: '2026-03-20T08:00:00Z',
      promised_arrival_start: '2026-03-30',
      promised_arrival_end: '2026-04-01',
      signed_at: '2026-04-01T18:00:00Z', // 2026-04-01 11:00 PDT
      first_received_at: '2026-04-02T01:00:00Z',
      putaway_at: '2026-04-02T14:00:00Z',
      weight: '120.5',
      weight_unit: 'kg',
      carrier_id: 'CARRIER-APEX',
      carrier_name: '极速空派物流',
      tracking_no: 'APEX-900101',
      source_version: 2,
      last_update_time: '2026-04-02T15:00:00Z'
    },
    {
      sid: 101,
      shipment_id: 'FBA18USPLAN02',
      shipment_sn: 'SP20260315002',
      plan_id: 'PLAN-US-202603-A',
      shipment_name: 'US-ONT8-批次A-第2票',
      destination_fulfillment_center_id: 'ONT8',
      country_code: 'US',
      dest_timezone: 'America/Los_Angeles',
      route_lane: 'CN-US-WEST',
      service_level: 'AIR_EXPRESS',
      shipped_at: '2026-03-20T08:00:00Z',
      promised_arrival_start: '2026-03-30',
      promised_arrival_end: '2026-04-01',
      signed_at: '2026-04-01T19:30:00Z',
      weight: '98.0',
      weight_unit: 'kg',
      carrier_id: 'CARRIER-APEX',
      carrier_name: '极速空派物流',
      tracking_no: 'APEX-900102',
      source_version: 2,
      last_update_time: '2026-04-01T20:00:00Z'
    },
    {
      sid: 101,
      shipment_id: 'FBA18USPLAN03',
      shipment_sn: 'SP20260315003',
      plan_id: 'PLAN-US-202603-A',
      shipment_name: 'US-ONT8-批次A-第3票',
      destination_fulfillment_center_id: 'ONT8',
      country_code: 'US',
      dest_timezone: 'America/Los_Angeles',
      route_lane: 'CN-US-WEST',
      service_level: 'AIR_EXPRESS',
      shipped_at: '2026-03-20T08:00:00Z',
      promised_arrival_start: '2026-03-30',
      promised_arrival_end: '2026-04-01',
      signed_at: '2026-04-01T17:15:00Z',
      weight: '110.25',
      weight_unit: 'kg',
      carrier_id: 'CARRIER-APEX',
      carrier_name: '极速空派物流',
      tracking_no: 'APEX-900103',
      source_version: 2,
      last_update_time: '2026-04-01T18:00:00Z'
    },
    {
      sid: 101,
      shipment_id: 'FBA18USPLAN04',
      shipment_sn: 'SP20260315004',
      plan_id: 'PLAN-US-202603-A',
      shipment_name: 'US-ONT8-批次A-第4票',
      destination_fulfillment_center_id: 'ONT8',
      country_code: 'US',
      dest_timezone: 'America/Los_Angeles',
      route_lane: 'CN-US-WEST',
      service_level: 'AIR_EXPRESS',
      shipped_at: '2026-03-20T08:00:00Z',
      promised_arrival_start: '2026-03-30',
      promised_arrival_end: '2026-04-01',
      signed_at: '2026-04-01T16:00:00Z',
      weight: '105.0',
      weight_unit: 'kg',
      carrier_id: 'CARRIER-APEX',
      carrier_name: '极速空派物流',
      tracking_no: 'APEX-900104',
      source_version: 2,
      last_update_time: '2026-04-01T17:00:00Z'
    },
    {
      sid: 101,
      shipment_id: 'FBA18USPLAN05',
      shipment_sn: 'SP20260315005',
      plan_id: 'PLAN-US-202603-A',
      shipment_name: 'US-ONT8-批次A-第5票(异常延迟)',
      destination_fulfillment_center_id: 'ONT8',
      country_code: 'US',
      dest_timezone: 'America/Los_Angeles',
      route_lane: 'CN-US-WEST',
      service_level: 'AIR_EXPRESS',
      shipped_at: '2026-03-20T08:00:00Z',
      promised_arrival_start: '2026-03-30',
      promised_arrival_end: '2026-04-01',
      signed_at: '2026-05-01T18:00:00Z', // 2026-05-01 PDT => 30 days delayed
      weight: '12.345',
      weight_unit: 'kg',
      carrier_id: 'CARRIER-SLOW',
      carrier_name: '远洋慢递物流',
      tracking_no: 'SLOW-770055',
      warning_defect_amount: '40.00',
      warning_defect_currency: 'USD',
      source_version: 3,
      last_update_time: '2026-05-01T19:00:00Z'
    },
    // --- Additional shipments for Carrier-APEX (so >= 5 samples for rating) ---
    {
      sid: 101,
      shipment_id: 'FBA18USPLAN06',
      shipment_sn: 'SP20260322006',
      plan_id: 'PLAN-US-202603-B',
      shipment_name: 'US-LAX9-批次B-第1票',
      destination_fulfillment_center_id: 'LAX9',
      country_code: 'US',
      dest_timezone: 'America/Los_Angeles',
      route_lane: 'CN-US-WEST',
      service_level: 'AIR_EXPRESS',
      shipped_at: '2026-03-25T08:00:00Z',
      promised_arrival_start: '2026-04-05',
      promised_arrival_end: '2026-04-07',
      signed_at: '2026-04-04T19:00:00Z', // early by 1 day
      weight: '85.0',
      weight_unit: 'kg',
      carrier_id: 'CARRIER-APEX',
      carrier_name: '极速空派物流',
      tracking_no: 'APEX-900106',
      source_version: 1,
      last_update_time: '2026-04-05T01:00:00Z'
    },
    // --- Additional shipments for Carrier-SLOW (so >= 5 samples in same peer group) ---
    ...[1, 2, 3, 4].map(i => ({
      sid: 101,
      shipment_id: `FBA18USSLOW0${i}`,
      shipment_sn: `SP2026032501${i}`,
      plan_id: 'PLAN-US-202603-C',
      shipment_name: `US-ONT8-远洋第${i}票`,
      destination_fulfillment_center_id: 'ONT8',
      country_code: 'US',
      dest_timezone: 'America/Los_Angeles',
      route_lane: 'CN-US-WEST',
      service_level: 'AIR_EXPRESS',
      shipped_at: '2026-03-25T08:00:00Z',
      promised_arrival_start: '2026-04-08',
      promised_arrival_end: '2026-04-10',
      signed_at: i <= 3 ? '2026-04-09T18:00:00Z' : '2026-04-14T18:00:00Z',
      weight: '60.0',
      weight_unit: 'kg',
      carrier_id: 'CARRIER-SLOW',
      carrier_name: '远洋慢递物流',
      tracking_no: `SLOW-77001${i}`,
      source_version: 1,
      last_update_time: '2026-04-15T10:00:00Z'
    })),
    // --- EU shipment with missing weight (待补数, blocks settlement) ---
    {
      sid: 102,
      shipment_id: 'FBA18DEWAIT01',
      shipment_sn: 'SP20260401099',
      plan_id: 'PLAN-DE-202604-A',
      shipment_name: 'DE-FRA1-待补重货件',
      destination_fulfillment_center_id: 'FRA1',
      country_code: 'DE',
      dest_timezone: 'Europe/Berlin',
      route_lane: 'CN-EU',
      service_level: 'RAIL',
      shipped_at: '2026-04-01T08:00:00Z',
      promised_arrival_start: '2026-04-25',
      promised_arrival_end: '2026-04-28',
      weight: null,
      weight_unit: 'kg',
      carrier_id: 'CARRIER-EURAIL',
      carrier_name: '欧铁专线',
      tracking_no: 'EUR-55001',
      source_version: 1,
      last_update_time: '2026-04-02T09:00:00Z'
    }
  ];

  const details = shipments.map(s => ({
    shipment_sn: s.shipment_sn,
    shipment_id: s.shipment_id,
    plan_id: s.plan_id,
    destination_fulfillment_center_id: s.destination_fulfillment_center_id,
    dest_timezone: s.dest_timezone,
    weight: s.weight,
    weight_unit: s.weight_unit,
    signed_at: s.signed_at || null,
    first_received_at: s.first_received_at || null,
    putaway_at: s.putaway_at || null,
    logistics_list: [
      {
        logistics_record_id: `REC-${s.shipment_sn}-1`,
        shipment_sn: s.shipment_sn,
        carrier_id: s.carrier_id,
        carrier_name: s.carrier_name,
        tracking_no: s.tracking_no,
        weight: s.weight,
        weight_unit: s.weight_unit,
        pricing_scope: 'shipment',
        route_lane: s.route_lane,
        service_level: s.service_level
      }
    ]
  }));

  return { shipments, details };
}

export function createDemoLogisticsClient() {
  const { shipments, details } = buildDemoFixtures();
  return {
    transport: 'DEMO',
    async read(path, params = {}) {
      if (path === '/erp/sc/data/seller/lists') {
        return { code: 0, data: DEMO_SHOPS };
      }
      if (path === FBA_SHIPMENT_LIST_PATH) {
        const sid = Number(params.sid);
        const filtered = shipments.filter(s => s.sid === sid);
        const offset = Number(params.offset || 0);
        const length = Number(params.length || 200);
        return {
          code: 0,
          total: filtered.length,
          data: filtered.slice(offset, offset + length)
        };
      }
      if (path === FBA_SHIPMENT_DETAIL_PATH) {
        const sns = new Set(params.shipment_sn_arr || []);
        return {
          code: 0,
          data: details.filter(d => sns.has(d.shipment_sn))
        };
      }
      throw new Error(`演示物流客户端不支持路径: ${path}`);
    }
  };
}

/**
 * Seed demo pricing and a sample defect fee if the store is empty.
 */
export function seedDemoPricingAndFees(store) {
  const { items } = store.listShipments({ limit: 500 });
  for (const s of items) {
    for (const leg of s.legs) {
      if (leg.settlementBlocked || leg.pricing) continue;
      if (leg.carrierId === 'CARRIER-APEX') {
        store.saveLegPricing({
          legId: leg.id,
          unitPrice: '2.20',
          priceUnit: leg.weightUnit,
          currency: 'USD',
          operator: 'demo-seed',
          expectedVersion: 0
        });
      } else if (leg.carrierId === 'CARRIER-SLOW') {
        const isFifth = s.fbaShipmentId === 'FBA18USPLAN05';
        store.saveLegPricing({
          legId: leg.id,
          unitPrice: '2.40',
          priceUnit: leg.weightUnit,
          currency: 'USD',
          manualOverrideAmount: isFifth ? '28.00' : null,
          overrideReason: isFifth ? '演示：协商折扣改价' : null,
          operator: 'demo-seed',
          expectedVersion: 0
        });
      }
    }
  }
}


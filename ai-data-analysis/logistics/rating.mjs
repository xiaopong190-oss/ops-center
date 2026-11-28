// Carrier rating query backed by the shared computeCarrierRatings() in domain.mjs.

import { computeCarrierRatings, evaluateArrival, toLocalCalendarDay } from './domain.mjs';

export function queryCarrierRatings(store, { periodFrom = null, periodTo = null, now = new Date().toISOString() } = {}) {
  const cfg = store.getConfig();
  const tz = cfg.settlementTimezone || 'Asia/Shanghai';

  const rows = store.db.prepare(`
    SELECT
      s.sid, s.fba_shipment_id, s.dest_timezone, s.route_lane AS s_lane, s.service_level AS s_service,
      s.promised_start, s.promised_end, s.signed_at, s.first_received_at, s.putaway_at,
      s.actual_delivered_at, s.actual_event_source,
      l.id AS leg_id,
      COALESCE(b.carrier_id, l.carrier_id) AS carrier_id,
      COALESCE(b.carrier_name, l.carrier_name) AS carrier_name,
      l.route_lane AS l_lane, l.service_level AS l_service,
      l.weight_formatted, l.weight_unit,
      p.currency AS p_currency, p.effective_amount AS p_effective_amount
    FROM shipments s
    JOIN shipment_legs l ON l.sid = s.sid AND l.fba_shipment_id = s.fba_shipment_id
    LEFT JOIN leg_carrier_bindings b ON b.leg_id = l.id
    LEFT JOIN leg_pricing p ON p.leg_id = l.id
  `).all();

  // Verified liable defect shipments (deduplicated by sid:fba_shipment_id, excluding reversed-out fees)
  const defectRows = store.db.prepare(`
    SELECT a.sid, a.fba_shipment_id, a.carrier_id,
      SUM(CAST(a.allocated_minor AS INTEGER)) AS net_minor
    FROM defect_fee_allocations a
    JOIN defect_fees f ON f.id = a.fee_id
    WHERE f.status IN ('verified', 'reversed')
    GROUP BY a.sid, a.fba_shipment_id, a.carrier_id
  `).all();

  const liableSet = new Set();
  for (const d of defectRows) {
    if (Number(d.net_minor) > 0) {
      liableSet.add(`${d.sid}:${d.fba_shipment_id}:${d.carrier_id || ''}`);
    }
  }

  const records = [];
  for (const r of rows) {
    if (periodFrom || periodTo) {
      const refDay = r.actual_delivered_at
        ? toLocalCalendarDay(r.actual_delivered_at, tz)
        : (r.promised_end || null);
      if (refDay) {
        const refMonth = refDay.slice(0, 7);
        if (periodFrom && refMonth < periodFrom) continue;
        if (periodTo && refMonth > periodTo) continue;
      }
    }

    const arrival = evaluateArrival({
      promisedStart: r.promised_start,
      promisedEnd: r.promised_end,
      destTimezone: r.dest_timezone,
      signedAt: r.signed_at,
      firstReceivedAt: r.first_received_at,
      putawayAt: r.putaway_at,
      actualDeliveredAt: r.actual_delivered_at,
      actualEventSource: r.actual_event_source,
      now
    });

    const shipmentKey = `${r.sid}:${r.fba_shipment_id}`;
    records.push({
      shipmentKey,
      carrierId: r.carrier_id,
      carrierName: r.carrier_name,
      routeLane: r.l_lane || r.s_lane,
      serviceLevel: r.l_service || r.s_service,
      weightUnit: r.weight_unit || 'UNKNOWN_UNIT',
      currency: r.p_currency || 'UNKNOWN_CUR',
      arrivalStatus: arrival.status,
      weightNum: r.weight_formatted != null ? Number(r.weight_formatted) : 0,
      effectiveFreightNum: r.p_effective_amount != null ? Number(r.p_effective_amount) : null,
      hasVerifiedLiableDefect: liableSet.has(`${shipmentKey}:${r.carrier_id}`)
    });
  }

  const samplePeriod = periodFrom && periodTo
    ? `${periodFrom} ~ ${periodTo}`
    : periodFrom
      ? `${periodFrom} 起`
      : '全部已同步周期';

  return {
    config: {
      ratingWeights: cfg.ratingWeights,
      minSampleSize: cfg.minSampleSize,
      gradeThresholds: cfg.gradeThresholds
    },
    samplePeriod,
    ratings: computeCarrierRatings(records, cfg, samplePeriod)
  };
}


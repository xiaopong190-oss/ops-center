// Single source of truth for logistics mapping, box weight aggregation,
// arrival calendar-day evaluation, pricing, and rating calculations.
// All lists, statements, exports, and ratings MUST use these functions.

import {
  SCALE,
  currencyDecimals,
  normalizeCurrency,
  normalizeUnit,
  parseDecimal,
  formatScaled,
  multiplyToCurrency,
  parseCurrencyToMinor,
  formatMinor,
  allocateMinor
} from './decimal.mjs';

export const MAPPING_VERSION = 'lx-logistics-v1.0';
export const RATING_VERSION = 'carrier-rating-v1.0';

export const DEFAULT_CONFIG = Object.freeze({
  settlementTimezone: 'Asia/Shanghai',
  freightMonthBasis: 'actual_delivered_at',
  feeMonthBasis: 'booking_month',
  ratingWeights: {
    onTime: 0.60,
    price: 0.25,
    defectFree: 0.15
  },
  minSampleSize: 5,
  gradeThresholds: {
    A: 90,
    B: 80,
    C: 70
  }
});

// ---------------------------------------------------------------------------
// Timezone & Local Calendar Day Utilities (DST, Leap-day, Cross-year safe)
// ---------------------------------------------------------------------------

const dtfCache = new Map();
function getDateFormatter(timeZone) {
  if (!dtfCache.has(timeZone)) {
    // Throws RangeError if timeZone is invalid IANA timezone
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    dtfCache.set(timeZone, fmt);
  }
  return dtfCache.get(timeZone);
}

export function isValidTimezone(tz) {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try {
    getDateFormatter(tz.trim());
    return true;
  } catch {
    return false;
  }
}

export function isValidIsoDate(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Convert an ISO timestamp (or YYYY-MM-DD) into local calendar date YYYY-MM-DD in `timeZone`.
 */
export function toLocalCalendarDay(timestamp, timeZone) {
  if (!timestamp) return null;
  if (isValidIsoDate(timestamp)) return timestamp;
  if (!isValidTimezone(timeZone)) return null;
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) return null;
  const parts = getDateFormatter(timeZone).formatToParts(new Date(ms));
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  if (!y || !m || !d) return null;
  return `${y}-${m}-${d}`;
}

/**
 * Calendar-day difference (dayB - dayA) in integer days.
 * Uses pure UTC midnight on YYYY-MM-DD so DST transitions never cause +/-1 hour drift.
 */
export function calendarDayDiff(dayA, dayB) {
  if (!isValidIsoDate(dayA) || !isValidIsoDate(dayB)) return null;
  const [ya, ma, da] = dayA.split('-').map(Number);
  const [yb, mb, db] = dayB.split('-').map(Number);
  const msA = Date.UTC(ya, ma - 1, da);
  const msB = Date.UTC(yb, mb - 1, db);
  return Math.round((msB - msA) / 86400000);
}

/**
 * Evaluate arrival timeliness against frozen promised window in destination timezone.
 *
 * Returns:
 *   {
 *     status: 'early' | 'on_time' | 'delayed' | 'in_transit' | 'overdue' | 'unknown',
 *     deviationDays: number | null,
 *     actualLocalDay: string | null,
 *     actualEventSource: 'signed' | 'first_received' | 'putaway' | 'carrier_pod' | 'unknown',
 *     promisedStart: string | null,
 *     promisedEnd: string | null
 *   }
 */
export function evaluateArrival({
  promisedStart,
  promisedEnd,
  destTimezone,
  signedAt,
  firstReceivedAt,
  putawayAt,
  actualDeliveredAt,
  actualEventSource,
  now = new Date().toISOString()
}) {
  const start = isValidIsoDate(promisedStart) ? promisedStart : null;
  const end = isValidIsoDate(promisedEnd) ? promisedEnd : start;
  const tzValid = isValidTimezone(destTimezone);

  // Determine actual delivery timestamp & source strictly from signed / carrier_pod events.
  // NEVER treat firstReceivedAt or putawayAt as actual delivery; when signed/POD is missing,
  // keep actual arrival unknown (actualLocalDay = null, actualEventSource = 'unknown').
  let deliveredTs = null;
  let source = 'unknown';
  const explicitSource = actualEventSource || null;
  if (actualDeliveredAt && (!explicitSource || explicitSource === 'signed' || explicitSource === 'carrier_pod')) {
    deliveredTs = actualDeliveredAt;
    source = explicitSource || 'carrier_pod';
  } else if (signedAt) {
    deliveredTs = signedAt;
    source = 'signed';
  }

  if (!start || !end || !tzValid || calendarDayDiff(start, end) < 0) {
    return {
      status: 'unknown',
      deviationDays: null,
      actualLocalDay: deliveredTs && tzValid ? toLocalCalendarDay(deliveredTs, destTimezone) : null,
      actualEventSource: source,
      promisedStart: start,
      promisedEnd: end
    };
  }

  if (deliveredTs) {
    const actualLocalDay = toLocalCalendarDay(deliveredTs, destTimezone);
    if (!actualLocalDay) {
      return {
        status: 'unknown',
        deviationDays: null,
        actualLocalDay: null,
        actualEventSource: source,
        promisedStart: start,
        promisedEnd: end
      };
    }
    const diffStart = calendarDayDiff(start, actualLocalDay);
    const diffEnd = calendarDayDiff(end, actualLocalDay);
    if (diffStart < 0) {
      return {
        status: 'early',
        deviationDays: diffStart, // negative
        actualLocalDay,
        actualEventSource: source,
        promisedStart: start,
        promisedEnd: end
      };
    }
    if (diffEnd <= 0) {
      return {
        status: 'on_time',
        deviationDays: 0,
        actualLocalDay,
        actualEventSource: source,
        promisedStart: start,
        promisedEnd: end
      };
    }
    return {
      status: 'delayed',
      deviationDays: diffEnd, // positive
      actualLocalDay,
      actualEventSource: source,
      promisedStart: start,
      promisedEnd: end
    };
  }

  // Signed/POD is missing, but FBA receiving/putaway event exists -> actual arrival remains unknown
  // (do not fabricate delivery from receiving/putaway, and do not misreport as in_transit/overdue).
  if (firstReceivedAt || putawayAt) {
    return {
      status: 'unknown',
      deviationDays: null,
      actualLocalDay: null,
      actualEventSource: 'unknown',
      promisedStart: start,
      promisedEnd: end
    };
  }

  // Not yet delivered: distinguish in_transit vs overdue using current local day in destTimezone
  const todayLocalDay = toLocalCalendarDay(now, destTimezone);
  if (!todayLocalDay) {
    return {
      status: 'unknown',
      deviationDays: null,
      actualLocalDay: null,
      actualEventSource: 'unknown',
      promisedStart: start,
      promisedEnd: end
    };
  }
  const overdueDays = calendarDayDiff(end, todayLocalDay);
  if (overdueDays > 0) {
    return {
      status: 'overdue',
      deviationDays: overdueDays,
      actualLocalDay: null,
      actualEventSource: 'unknown',
      promisedStart: start,
      promisedEnd: end
    };
  }
  return {
    status: 'in_transit',
    deviationDays: 0,
    actualLocalDay: null,
    actualEventSource: 'unknown',
    promisedStart: start,
    promisedEnd: end
  };
}

// ---------------------------------------------------------------------------
// Box-level Weight Aggregation & Ambiguity Guard
// ---------------------------------------------------------------------------

/**
 * Aggregate weight for a shipment or leg from box records.
 * Rules from 工作流.md:
 * - Only sum box weights when box_no can be deduplicated, box count is complete, and ownership is unambiguous.
 * - A mixed box containing multiple SKUs (same box_no) is counted ONLY ONCE.
 * - If same box_no has conflicting weights or units, or missing weight/unit/box_no/ownership, block settlement.
 */
export function resolveWeight({
  directWeight,
  directUnit,
  boxes,
  declaredBoxCount,
  targetShipmentId
}) {
  // 1. Try box-level aggregation when boxes array is provided
  if (Array.isArray(boxes) && boxes.length > 0) {
    const seenBoxes = new Map(); // box_no -> { weightScaled, unit }
    let commonUnit = null;

    for (const box of boxes) {
      const boxNo = box?.box_no != null ? String(box.box_no).trim() : '';
      if (!boxNo) {
        return {
          weightScaled: null,
          weightFormatted: null,
          unit: null,
          source: 'box_sum',
          settlementBlocked: true,
          blockReason: '箱号缺失，无法去重汇总箱重'
        };
      }
      if (box.owner_shipment_id && targetShipmentId && String(box.owner_shipment_id) !== String(targetShipmentId)) {
        return {
          weightScaled: null,
          weightFormatted: null,
          unit: null,
          source: 'box_sum',
          settlementBlocked: true,
          blockReason: `箱 ${boxNo} 归属货件不明确或冲突`
        };
      }
      if (box.owner_ambiguous) {
        return {
          weightScaled: null,
          weightFormatted: null,
          unit: null,
          source: 'box_sum',
          settlementBlocked: true,
          blockReason: `箱 ${boxNo} 归属存在歧义，已隔离待补数`
        };
      }
      const unit = normalizeUnit(box.weight_unit || box.unit || directUnit);
      if (!unit) {
        return {
          weightScaled: null,
          weightFormatted: null,
          unit: null,
          source: 'box_sum',
          settlementBlocked: true,
          blockReason: `箱 ${boxNo} 缺少有效重量单位`
        };
      }
      if (commonUnit && commonUnit !== unit) {
        return {
          weightScaled: null,
          weightFormatted: null,
          unit: null,
          source: 'box_sum',
          settlementBlocked: true,
          blockReason: `箱级重量单位不一致 (${commonUnit} vs ${unit})`
        };
      }
      commonUnit = unit;

      let wScaled;
      try {
        wScaled = parseDecimal(box.weight, { allowNegative: false, allowZero: false });
      } catch (e) {
        return {
          weightScaled: null,
          weightFormatted: null,
          unit: null,
          source: 'box_sum',
          settlementBlocked: true,
          blockReason: `箱 ${boxNo} 重量非法: ${e.message}`
        };
      }

      if (seenBoxes.has(boxNo)) {
        // Mixed-SKU box: same box_no appears for multiple SKUs -> must have same box weight and count ONLY ONCE
        const prev = seenBoxes.get(boxNo);
        if (prev.weightScaled !== wScaled) {
          return {
            weightScaled: null,
            weightFormatted: null,
            unit: null,
            source: 'box_sum',
            settlementBlocked: true,
            blockReason: `混装箱 ${boxNo} 存在冲突重量`
          };
        }
      } else {
        seenBoxes.set(boxNo, { weightScaled: wScaled, unit });
      }
    }

    if (declaredBoxCount != null && Number.isInteger(Number(declaredBoxCount)) && Number(declaredBoxCount) > 0) {
      if (seenBoxes.size !== Number(declaredBoxCount)) {
        return {
          weightScaled: null,
          weightFormatted: null,
          unit: commonUnit,
          source: 'box_sum',
          settlementBlocked: true,
          blockReason: `箱数不完整（去重箱数 ${seenBoxes.size}，申报箱数 ${declaredBoxCount}）`
        };
      }
    }

    let totalScaled = 0n;
    for (const entry of seenBoxes.values()) {
      totalScaled += entry.weightScaled;
    }
    return {
      weightScaled: totalScaled,
      weightFormatted: formatScaled(totalScaled, 3, true),
      unit: commonUnit,
      source: 'box_sum',
      boxCount: seenBoxes.size,
      settlementBlocked: false,
      blockReason: null
    };
  }

  // 2. Fallback to direct shipment/leg weight
  const unit = normalizeUnit(directUnit);
  if (directWeight === null || directWeight === undefined || directWeight === '') {
    return {
      weightScaled: null,
      weightFormatted: null,
      unit: unit,
      source: 'missing',
      settlementBlocked: true,
      blockReason: '缺少领星重量，待补数'
    };
  }
  if (!unit) {
    return {
      weightScaled: null,
      weightFormatted: null,
      unit: null,
      source: 'direct',
      settlementBlocked: true,
      blockReason: `重量单位无效或缺失: ${String(directUnit ?? '')}`
    };
  }
  let wScaled;
  try {
    wScaled = parseDecimal(directWeight, { allowNegative: false, allowZero: false });
  } catch (e) {
    return {
      weightScaled: null,
      weightFormatted: null,
      unit,
      source: 'direct',
      settlementBlocked: true,
      blockReason: `重量非法: ${e.message}`
    };
  }
  return {
    weightScaled: wScaled,
    weightFormatted: formatScaled(wScaled, 3, true),
    unit,
    source: 'direct',
    settlementBlocked: false,
    blockReason: null
  };
}

// ---------------------------------------------------------------------------
// Pricing & Manual Override Calculation
// ---------------------------------------------------------------------------

/**
 * Compute freight pricing for a shipment/leg.
 * - Rejects missing/invalid weight, unit mismatch, missing/invalid currency, or non-positive unit price.
 * - Multi-leg guard: if pricingScope === 'whole_shipment' on a multi-leg shipment, reject double billing.
 */
export function computeFreightPricing({
  weight,
  weightUnit,
  unitPrice,
  priceUnit,
  currency,
  manualOverrideAmount = null,
  legCount = 1,
  pricingScope = 'shipment'
}) {
  const cur = normalizeCurrency(currency);
  if (!cur) throw new Error('币种缺失或格式无效（需 3 位大写币种代码）');
  const wUnit = normalizeUnit(weightUnit);
  if (!wUnit) throw new Error('货件重量单位缺失或不支持');
  const pUnit = normalizeUnit(priceUnit || weightUnit);
  if (!pUnit || pUnit !== wUnit) {
    throw new Error(`单价单位(${priceUnit})与重量单位(${weightUnit})不一致`);
  }
  if (legCount > 1 && pricingScope === 'whole_shipment') {
    throw new Error('多运输段禁止重复使用整单重量计费，请指定明确计价范围');
  }

  const wScaled = typeof weight === 'bigint'
    ? weight
    : parseDecimal(weight, { allowNegative: false, allowZero: false });
  if (wScaled <= 0n) throw new Error('计费重量必须大于 0');

  const priceScaled = typeof unitPrice === 'bigint'
    ? unitPrice
    : parseDecimal(unitPrice, { allowNegative: false, allowZero: false });
  if (priceScaled <= 0n) throw new Error('单价必须大于 0');

  const calc = multiplyToCurrency(wScaled, priceScaled, cur);
  const decimals = calc.decimals;

  let effectiveMinor = calc.minor;
  let isOverridden = false;
  if (manualOverrideAmount !== null && manualOverrideAmount !== undefined && manualOverrideAmount !== '') {
    effectiveMinor = typeof manualOverrideAmount === 'bigint'
      ? manualOverrideAmount
      : parseCurrencyToMinor(manualOverrideAmount, cur, { allowNegative: false, allowZero: true });
    isOverridden = true;
  }

  const deltaMinor = effectiveMinor - calc.minor;

  return {
    currency: cur,
    decimals,
    weightScaled: wScaled.toString(),
    weightFormatted: formatScaled(wScaled, 3, true),
    weightUnit: wUnit,
    unitPriceScaled: priceScaled.toString(),
    unitPriceFormatted: formatScaled(priceScaled, 4, true),
    calculatedMinor: calc.minor.toString(),
    calculatedAmount: calc.formatted,
    effectiveMinor: effectiveMinor.toString(),
    effectiveAmount: formatMinor(effectiveMinor, decimals),
    overrideDeltaMinor: deltaMinor.toString(),
    overrideDelta: formatMinor(deltaMinor, decimals),
    exactIntermediate12: calc.exactScaled12,
    isOverridden
  };
}

// ---------------------------------------------------------------------------
// Defect Fee Allocation
// ---------------------------------------------------------------------------

/**
 * Allocate a single bill-line defect fee across one or more target shipments/legs.
 * Guarantees sum of allocated amounts === totalAmount in currency minor units.
 */
export function allocateDefectFee({ totalAmount, currency, targets }) {
  const cur = normalizeCurrency(currency);
  if (!cur) throw new Error('缺陷费币种无效');
  const decimals = currencyDecimals(cur);
  const totalMinor = parseCurrencyToMinor(totalAmount, cur, { allowNegative: false, allowZero: false });
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('至少需要一个分摊目标货件');
  }
  const weights = targets.map(t => t.weight ?? 1);
  const shares = allocateMinor(totalMinor, weights);
  return targets.map((t, idx) => ({
    ...t,
    currency: cur,
    allocatedMinor: shares[idx].toString(),
    allocatedAmount: formatMinor(shares[idx], decimals)
  }));
}

// ---------------------------------------------------------------------------
// Carrier Rating Calculation (Same peer group: lane + service + unit + currency)
// ---------------------------------------------------------------------------

export function medianNumber(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Compute carrier ratings within peer groups `(routeLane, serviceLevel, weightUnit, currency)`.
 *
 * Each input record:
 *   {
 *     shipmentKey, carrierId, carrierName, routeLane, serviceLevel,
 *     weightUnit, currency, arrivalStatus,
 *     weightNum, effectiveFreightNum, hasVerifiedLiableDefect
 *   }
 */
export function computeCarrierRatings(records, config = DEFAULT_CONFIG, samplePeriod = '') {
  const weights = config.ratingWeights || DEFAULT_CONFIG.ratingWeights;
  const minSample = config.minSampleSize ?? DEFAULT_CONFIG.minSampleSize;
  const thresholds = config.gradeThresholds || DEFAULT_CONFIG.gradeThresholds;

  // Group by peer group key
  const peerGroups = new Map();
  for (const r of records) {
    const groupKey = [
      r.routeLane || 'UNKNOWN_LANE',
      r.serviceLevel || 'STANDARD',
      r.weightUnit || 'UNKNOWN_UNIT',
      r.currency || 'UNKNOWN_CUR'
    ].join('|');
    if (!peerGroups.has(groupKey)) peerGroups.set(groupKey, []);
    peerGroups.get(groupKey).push(r);
  }

  const results = [];

  for (const [groupKey, groupRows] of peerGroups.entries()) {
    const [routeLane, serviceLevel, weightUnit, currency] = groupKey.split('|');

    // Aggregate per carrier inside this peer group
    const byCarrier = new Map();
    for (const row of groupRows) {
      const cid = row.carrierId || 'UNKNOWN_CARRIER';
      if (!byCarrier.has(cid)) {
        byCarrier.set(cid, {
          carrierId: cid,
          carrierName: row.carrierName || cid,
          totalShipments: 0,
          determinableDelivered: 0,
          onTimeOrEarly: 0,
          delayed: 0,
          overdueUndelivered: 0,
          inTransit: 0,
          unknownArrival: 0,
          totalWeight: 0,
          totalEffectiveFreight: 0,
          pricedShipments: 0,
          liableDefectShipments: new Set()
        });
      }
      const stat = byCarrier.get(cid);
      stat.totalShipments += 1;

      if (row.arrivalStatus === 'early' || row.arrivalStatus === 'on_time') {
        stat.determinableDelivered += 1;
        stat.onTimeOrEarly += 1;
      } else if (row.arrivalStatus === 'delayed') {
        stat.determinableDelivered += 1;
        stat.delayed += 1;
      } else if (row.arrivalStatus === 'overdue') {
        stat.overdueUndelivered += 1;
      } else if (row.arrivalStatus === 'in_transit') {
        stat.inTransit += 1;
      } else {
        stat.unknownArrival += 1;
      }

      if (row.weightNum > 0 && row.effectiveFreightNum != null && row.effectiveFreightNum >= 0) {
        stat.totalWeight += row.weightNum;
        stat.totalEffectiveFreight += row.effectiveFreightNum;
        stat.pricedShipments += 1;
      }

      if (row.hasVerifiedLiableDefect) {
        stat.liableDefectShipments.add(row.shipmentKey);
      }
    }

    // Compute peer-group weighted unit prices for median benchmark
    const carrierUnitPrices = [];
    for (const stat of byCarrier.values()) {
      stat.weightedUnitPrice = stat.totalWeight > 0
        ? stat.totalEffectiveFreight / stat.totalWeight
        : null;
      if (stat.weightedUnitPrice != null && stat.weightedUnitPrice > 0) {
        carrierUnitPrices.push(stat.weightedUnitPrice);
      }
    }
    const groupMedianUnitPrice = medianNumber(carrierUnitPrices);

    for (const stat of byCarrier.values()) {
      const denom = stat.determinableDelivered;
      const coverageRate = stat.totalShipments > 0 ? denom / stat.totalShipments : 0;
      const onTimeRate = denom > 0 ? stat.onTimeOrEarly / denom : null;
      const defectCount = stat.liableDefectShipments.size;
      const defectRate = denom > 0 ? Math.min(1, defectCount / denom) : null;
      const defectFreeRate = defectRate != null ? Math.max(0, 1 - defectRate) : null;

      let priceScoreRatio = null;
      if (groupMedianUnitPrice != null && stat.weightedUnitPrice != null && stat.weightedUnitPrice > 0) {
        priceScoreRatio = Math.min(1, groupMedianUnitPrice / stat.weightedUnitPrice);
      }

      const sufficientSample = denom >= minSample && groupMedianUnitPrice != null && priceScoreRatio != null;
      let totalScore = null;
      let grade = '样本不足';

      if (sufficientSample) {
        const rawScore = (
          onTimeRate * weights.onTime +
          priceScoreRatio * weights.price +
          defectFreeRate * weights.defectFree
        ) * 100;
        totalScore = Number(rawScore.toFixed(2));
        if (totalScore >= thresholds.A) grade = 'A';
        else if (totalScore >= thresholds.B) grade = 'B';
        else if (totalScore >= thresholds.C) grade = 'C';
        else grade = 'D';
      }

      results.push({
        ratingVersion: RATING_VERSION,
        samplePeriod,
        peerGroup: { routeLane, serviceLevel, weightUnit, currency },
        carrierId: stat.carrierId,
        carrierName: stat.carrierName,
        grade,
        sufficientSample,
        insufficientReason: sufficientSample
          ? null
          : (denom < minSample ? `已妥投可判定样本不足(${denom}/${minSample})` : '缺少同组可比单价基准'),
        totalScore,
        denominator: denom,
        totalShipments: stat.totalShipments,
        coverageRate: Number(coverageRate.toFixed(4)),
        onTimeOrEarlyCount: stat.onTimeOrEarly,
        delayedCount: stat.delayed,
        overdueUndeliveredCount: stat.overdueUndelivered,
        inTransitCount: stat.inTransit,
        unknownArrivalCount: stat.unknownArrival,
        onTimeRate: onTimeRate != null ? Number(onTimeRate.toFixed(4)) : null,
        defectShipmentCount: defectCount,
        defectFreeRate: defectFreeRate != null ? Number(defectFreeRate.toFixed(4)) : null,
        weightedUnitPrice: stat.weightedUnitPrice != null ? Number(stat.weightedUnitPrice.toFixed(4)) : null,
        groupMedianUnitPrice: groupMedianUnitPrice != null ? Number(groupMedianUnitPrice.toFixed(4)) : null,
        priceScoreRatio: priceScoreRatio != null ? Number(priceScoreRatio.toFixed(4)) : null,
        scoreBreakdown: sufficientSample ? {
          onTimePoints: Number((onTimeRate * weights.onTime * 100).toFixed(2)),
          pricePoints: Number((priceScoreRatio * weights.price * 100).toFixed(2)),
          defectFreePoints: Number((defectFreeRate * weights.defectFree * 100).toFixed(2))
        } : null
      });
    }
  }

  return results.sort((a, b) => {
    if (a.sufficientSample !== b.sufficientSample) return a.sufficientSample ? -1 : 1;
    return (b.totalScore ?? -1) - (a.totalScore ?? -1);
  });
}

// ---------------------------------------------------------------------------
// Lingxing FBA Field Normalization (with full provenance metadata)
// ---------------------------------------------------------------------------

/**
 * Normalize a Lingxing FBA shipment list record + optional detail record.
 * Saves source_field_path, source_id, raw_value, unit, timezone, collected_at, mapping_version.
 */
export function normalizeIsoDate(str) {
  if (typeof str !== 'string') return null;
  const trimmed = str.trim();
  const candidate = trimmed.length >= 10 ? trimmed.slice(0, 10) : trimmed;
  return isValidIsoDate(candidate) ? candidate : null;
}

/**
 * Expand official Lingxing box_list entries:
 *   box_list[].{ box_num, cg_box_weight, box_codes, box_skus[].shipment_id }
 * as well as legacy box entries { box_no, weight, weight_unit, owner_shipment_id }.
 * Filters boxes belonging to other FBA shipments when box_skus[].shipment_id is unambiguous,
 * and flags ambiguity when a single box spans multiple shipments or lacks ownership in a multi-shipment dispatch.
 */
export function normalizeLingxingBoxes(rawBoxes, { targetShipmentId, dispatchShipmentCount = 1 } = {}) {
  if (!Array.isArray(rawBoxes) || rawBoxes.length === 0) return { boxes: null, declaredBoxCount: null, ambiguousReason: null };

  const expanded = [];
  let declaredTotalForShipment = 0;
  let hasBoxNum = false;

  for (const box of rawBoxes) {
    if (!box || typeof box !== 'object') continue;

    // Official shape: box_skus[].shipment_id
    const isOfficialBox = (
      box.cg_box_weight !== undefined ||
      box.box_codes !== undefined ||
      box.box_num !== undefined ||
      Array.isArray(box.box_skus)
    );

    if (!isOfficialBox) {
      expanded.push(box);
      continue;
    }

    let ownerShipmentId = box.owner_shipment_id ? String(box.owner_shipment_id).trim() : null;
    if (Array.isArray(box.box_skus) && box.box_skus.length > 0) {
      const skuShipmentIds = [...new Set(
        box.box_skus
          .map(sku => sku?.shipment_id ?? sku?.fba_shipment_id)
          .filter(v => v != null && String(v).trim() !== '')
          .map(v => String(v).trim())
      )];
      if (skuShipmentIds.length > 1) {
        return { boxes: null, declaredBoxCount: null, ambiguousReason: '单箱混装多个 FBA 货件，归属不明确，已隔离待补数' };
      }
      if (skuShipmentIds.length === 1) {
        ownerShipmentId = skuShipmentIds[0];
      }
    }

    if (ownerShipmentId && targetShipmentId && ownerShipmentId !== String(targetShipmentId)) {
      // Belongs cleanly to another FBA shipment in the same dispatch order -> skip
      continue;
    }
    if (!ownerShipmentId && dispatchShipmentCount > 1) {
      return { boxes: null, declaredBoxCount: null, ambiguousReason: '多货件一单中存在未标明 shipment_id 的箱记录，归属不明确' };
    }

    const boxNum = box.box_num != null ? Number(box.box_num) : null;
    if (boxNum != null) {
      if (!Number.isInteger(boxNum) || boxNum <= 0) {
        return { boxes: null, declaredBoxCount: null, ambiguousReason: `箱数 box_num 非法: ${box.box_num}` };
      }
      hasBoxNum = true;
      declaredTotalForShipment += boxNum;
    }

    const rawCodes = Array.isArray(box.box_codes)
      ? box.box_codes
      : typeof box.box_codes === 'string' && box.box_codes.trim()
        ? box.box_codes.split(',').map(s => s.trim()).filter(Boolean)
        : [];

    if (rawCodes.length === 0) {
      return { boxes: null, declaredBoxCount: null, ambiguousReason: '箱号 box_codes 缺失，无法去重汇总箱重' };
    }
    if (boxNum != null && rawCodes.length !== boxNum) {
      return {
        boxes: null,
        declaredBoxCount: null,
        ambiguousReason: `箱号数量(${rawCodes.length})与箱数 box_num(${boxNum})不一致，箱数不完整`
      };
    }

    const weightVal = box.cg_box_weight ?? box.weight;
    const unitVal = box.weight_unit ?? box.unit ?? 'kg';
    for (const code of rawCodes) {
      expanded.push({
        box_no: String(code).trim(),
        weight: weightVal,
        weight_unit: unitVal,
        owner_shipment_id: ownerShipmentId || targetShipmentId || null
      });
    }
  }

  return {
    boxes: expanded.length > 0 ? expanded : null,
    declaredBoxCount: hasBoxNum ? declaredTotalForShipment : null,
    ambiguousReason: null
  };
}

/**
 * Extract official Lingxing actual_expenses_list.chargeable_weight (unit: kg).
 */
export function extractChargeableWeight(rawDetail, rawShipment, targetShipmentId) {
  const expenses = rawDetail?.actual_expenses_list ?? rawShipment?.actual_expenses_list ?? null;
  if (!expenses) return null;

  if (!Array.isArray(expenses) && typeof expenses === 'object') {
    if (expenses.chargeable_weight != null && expenses.chargeable_weight !== '') {
      return { weight: expenses.chargeable_weight, unit: expenses.weight_unit || 'kg', level: 'dispatch_order' };
    }
    return null;
  }

  if (Array.isArray(expenses) && expenses.length > 0) {
    // Prefer entries explicitly tagged with targetShipmentId
    const matched = expenses.filter(e =>
      e && (e.shipment_id || e.fba_shipment_id) &&
      String(e.shipment_id || e.fba_shipment_id).trim() === String(targetShipmentId) &&
      e.chargeable_weight != null && e.chargeable_weight !== ''
    );
    if (matched.length > 0) {
      let sum = 0n;
      for (const e of matched) {
        sum += parseDecimal(e.chargeable_weight, { allowNegative: false, allowZero: false });
      }
      return { weight: formatScaled(sum, 3, true), unit: matched[0].weight_unit || 'kg', level: 'shipment_expense' };
    }
    // Otherwise dispatch-order-level chargeable_weight entries (no shipment_id)
    const dispatchEntries = expenses.filter(e =>
      e && !e.shipment_id && !e.fba_shipment_id &&
      e.chargeable_weight != null && e.chargeable_weight !== ''
    );
    if (dispatchEntries.length > 0) {
      let sum = 0n;
      for (const e of dispatchEntries) {
        sum += parseDecimal(e.chargeable_weight, { allowNegative: false, allowZero: false });
      }
      return { weight: formatScaled(sum, 3, true), unit: dispatchEntries[0].weight_unit || 'kg', level: 'dispatch_order' };
    }
  }
  return null;
}

export function mapLingxingShipment(rawShipment, rawDetail, { sid, collectedAt = new Date().toISOString(), dispatchShipmentCount = 1 } = {}) {
  const shopSid = String(sid ?? rawShipment.sid ?? rawShipment.store_id ?? '').trim();
  const fbaShipmentId = String(rawShipment.shipment_id ?? rawShipment.fba_shipment_id ?? rawShipment.shipmentId ?? '').trim();
  if (!shopSid || !fbaShipmentId) {
    throw new Error('领星货件缺少店铺 SID 或 FBA 货件号');
  }

  const shipmentSn = rawDetail?.shipment_sn ?? rawShipment.shipment_sn ?? rawShipment.dispatch_no ?? null;
  const planId = rawShipment.sta_inbound_plan_id ?? rawShipment.plan_id ?? rawShipment.inbound_plan_id ?? rawDetail?.sta_inbound_plan_id ?? rawDetail?.plan_id ?? null;
  const batchGroupId = rawShipment.batch_group_id ?? null;
  const destFc = rawShipment.destination_fulfillment_center_id ?? rawShipment.dest_fc ?? rawDetail?.destination_fulfillment_center_id ?? '';
  // NEVER default missing country/timezone to US or America/Los_Angeles
  const destCountry = rawShipment.country_code ?? rawShipment.dest_country ?? rawDetail?.country_code ?? rawDetail?.dest_country ?? null;
  const destTimezone = rawShipment.dest_timezone ?? rawDetail?.dest_timezone ?? null;
  const routeLane = rawShipment.route_lane ?? rawDetail?.route_lane ?? (destCountry ? `CN-${destCountry}` : null);
  const serviceLevel = rawShipment.service_level ?? rawShipment.transport_type_name ?? 'STANDARD';

  const sourceVersion = Number(rawShipment.source_version ?? rawShipment.version ?? 0) || 0;
  const sourceUpdatedAt = rawShipment.last_update_time ?? rawShipment.update_time ?? rawShipment.gmt_modified ?? collectedAt;

  const effectiveDispatchCount = Math.max(
    Number(dispatchShipmentCount) || 1,
    Array.isArray(rawDetail?.fba_shipment_ids) ? rawDetail.fba_shipment_ids.length : 1,
    Number(rawDetail?.shipment_count) || 1
  );

  // Weight resolution priority:
  // 1. Official or legacy box_list (deduplicated by box_codes/box_no, scoped by box_skus[].shipment_id)
  // 2. Shipment-level direct weight or shipment-scoped actual_expenses_list.chargeable_weight
  // 3. Dispatch-order-level weight / actual_expenses_list.chargeable_weight (blocked if dispatchShipmentCount > 1)
  const rawBoxes = rawDetail?.box_list ?? rawShipment.box_list ?? null;
  const boxNorm = normalizeLingxingBoxes(rawBoxes, { targetShipmentId: fbaShipmentId, dispatchShipmentCount: effectiveDispatchCount });
  const declaredBoxCount = boxNorm.declaredBoxCount ?? rawDetail?.box_count ?? rawShipment.box_count ?? null;

  let chargeable = null;
  let chargeableError = null;
  try {
    chargeable = extractChargeableWeight(rawDetail, rawShipment, fbaShipmentId);
  } catch (e) {
    chargeableError = e.message;
  }

  const hasShipmentDirectWeight = rawShipment.weight != null || rawShipment.total_weight != null;
  const hasDetailDirectWeight = rawDetail?.weight != null;
  const hasBoxes = Array.isArray(boxNorm.boxes) && boxNorm.boxes.length > 0;
  const weightFromDispatchOrderOnly = !hasBoxes && !boxNorm.ambiguousReason && !hasShipmentDirectWeight && (
    (chargeable && chargeable.level === 'dispatch_order') || hasDetailDirectWeight
  );

  let weightInfo;
  if (boxNorm.ambiguousReason) {
    weightInfo = {
      weightScaled: null,
      weightFormatted: null,
      unit: null,
      source: 'box_sum',
      settlementBlocked: true,
      blockReason: boxNorm.ambiguousReason
    };
  } else if (hasBoxes) {
    weightInfo = resolveWeight({
      directWeight: null,
      directUnit: rawShipment.weight_unit ?? rawDetail?.weight_unit ?? 'kg',
      boxes: boxNorm.boxes,
      declaredBoxCount,
      targetShipmentId: fbaShipmentId
    });
  } else if (hasShipmentDirectWeight) {
    weightInfo = resolveWeight({
      directWeight: rawShipment.weight ?? rawShipment.total_weight,
      directUnit: rawShipment.weight_unit ?? rawDetail?.weight_unit ?? null
    });
  } else if (chargeableError) {
    weightInfo = {
      weightScaled: null,
      weightFormatted: null,
      unit: 'kg',
      source: 'actual_expenses_chargeable_weight',
      settlementBlocked: true,
      blockReason: `计费重非法: ${chargeableError}`
    };
  } else if (chargeable) {
    weightInfo = resolveWeight({
      directWeight: chargeable.weight,
      directUnit: chargeable.unit
    });
    if (!weightInfo.settlementBlocked) {
      weightInfo = { ...weightInfo, source: chargeable.level === 'dispatch_order' ? 'dispatch_order' : 'actual_expenses_chargeable_weight' };
    }
  } else {
    weightInfo = resolveWeight({
      directWeight: rawDetail?.weight ?? null,
      directUnit: rawDetail?.weight_unit ?? rawShipment.weight_unit ?? null
    });
  }

  if (weightFromDispatchOrderOnly) {
    if (effectiveDispatchCount > 1) {
      weightInfo = {
        weightScaled: null,
        weightFormatted: null,
        unit: weightInfo.unit,
        source: 'dispatch_order_ambiguous',
        settlementBlocked: true,
        blockReason: '仅发货单级有重量且对应多个 FBA 货件，禁止重复计费，请补齐单票重量或明确分摊'
      };
    } else if (!weightInfo.settlementBlocked) {
      weightInfo = { ...weightInfo, source: 'dispatch_order' };
    }
  }

  // Promised arrival window:
  // Official STA fields: sta_delivery_start_date / sta_delivery_end_date;
  // Fallback: promised_arrival_start / promised_arrival_end / expected_arrival_date (single date => start === end).
  const rawExpectedDate = rawDetail?.expected_arrival_date ?? rawShipment.expected_arrival_date ?? null;
  const rawStaStart = rawShipment.sta_delivery_start_date ?? rawDetail?.sta_delivery_start_date ?? null;
  const rawStaEnd = rawShipment.sta_delivery_end_date ?? rawDetail?.sta_delivery_end_date ?? null;
  const promisedStart = normalizeIsoDate(
    rawStaStart ?? rawShipment.promised_arrival_start ?? rawDetail?.promised_arrival_start ?? rawShipment.promised_arrival_date ?? rawExpectedDate
  );
  const promisedEnd = normalizeIsoDate(
    rawStaEnd ?? rawShipment.promised_arrival_end ?? rawDetail?.promised_arrival_end ?? rawExpectedDate
  ) ?? promisedStart;

  // Distinct arrival events (never conflate receiving/putaway with actual delivery)
  const signedAt = rawDetail?.signed_at ?? rawShipment.signed_at ?? null;
  const firstReceivedAt = rawDetail?.first_received_at ?? rawShipment.first_received_at ?? null;
  const putawayAt = rawDetail?.putaway_at ?? rawShipment.putaway_at ?? null;
  const explicitDeliveredAt = rawDetail?.actual_delivered_at ?? rawShipment.actual_delivered_at ?? null;
  const explicitEventSource = rawDetail?.actual_event_source ?? rawShipment.actual_event_source ?? null;
  const actualDeliveredAt = (explicitDeliveredAt && (!explicitEventSource || explicitEventSource === 'signed' || explicitEventSource === 'carrier_pod'))
    ? explicitDeliveredAt
    : (signedAt ?? null);
  const actualEventSource = actualDeliveredAt
    ? (explicitDeliveredAt ? (explicitEventSource || 'carrier_pod') : 'signed')
    : 'unknown';

  // Legs (supports multi-carrier per dispatch order & multi-shipment per dispatch order)
  const rawLegs = Array.isArray(rawDetail?.logistics_list) && rawDetail.logistics_list.length > 0
    ? rawDetail.logistics_list
    : Array.isArray(rawShipment.logistics_list) && rawShipment.logistics_list.length > 0
      ? rawShipment.logistics_list
      : [{
          logistics_record_id: rawDetail?.logistics_record_id ?? rawShipment.logistics_record_id ?? `${shipmentSn || fbaShipmentId}-L1`,
          shipment_sn: shipmentSn || fbaShipmentId,
          carrier_id: rawDetail?.carrier_id ?? rawShipment.carrier_id ?? 'UNASSIGNED',
          carrier_name: rawDetail?.carrier_name ?? rawShipment.carrier_name ?? rawDetail?.logistics_provider_name ?? '未指定物流商',
          tracking_no: rawDetail?.logistics_tracking_number ?? rawDetail?.tracking_no ?? rawShipment.tracking_no ?? null,
          weight: weightInfo.weightFormatted,
          weight_unit: weightInfo.unit,
          pricing_scope: 'shipment',
          service_level: serviceLevel,
          route_lane: routeLane
        }];

  const legs = rawLegs.map((leg, idx) => {
    const legHasOwnWeight = leg.weight != null && (!weightFromDispatchOrderOnly || (leg.owner_shipment_id && String(leg.owner_shipment_id) === fbaShipmentId));
    let legWeight;
    if (weightFromDispatchOrderOnly && effectiveDispatchCount > 1 && !(leg.owner_shipment_id && String(leg.owner_shipment_id) === fbaShipmentId)) {
      legWeight = weightInfo;
    } else if (legHasOwnWeight) {
      legWeight = resolveWeight({ directWeight: leg.weight, directUnit: leg.weight_unit || weightInfo.unit });
      if (weightFromDispatchOrderOnly && !legWeight.settlementBlocked) {
        legWeight = { ...legWeight, source: 'dispatch_order' };
      }
    } else if (rawLegs.length === 1) {
      legWeight = weightInfo;
    } else {
      legWeight = {
        weightScaled: null,
        weightFormatted: null,
        unit: weightInfo.unit,
        source: 'missing',
        settlementBlocked: true,
        blockReason: '多运输段缺少分段重量，禁止复用整单重量'
      };
    }

    const scope = leg.pricing_scope || (rawLegs.length > 1 ? 'leg_weight' : 'shipment');
    const blocked = legWeight.settlementBlocked || (rawLegs.length > 1 && scope === 'whole_shipment');
    const blockReason = (rawLegs.length > 1 && scope === 'whole_shipment')
      ? '多运输段禁止重复使用整单重量计费'
      : legWeight.blockReason;

    return {
      sid: shopSid,
      fbaShipmentId,
      shipmentSn: String(leg.shipment_sn ?? shipmentSn ?? fbaShipmentId),
      logisticsRecordId: String(leg.logistics_record_id ?? `${shipmentSn || fbaShipmentId}-L${idx + 1}`),
      carrierId: String(leg.carrier_id ?? 'UNASSIGNED'),
      carrierName: String(leg.carrier_name ?? leg.logistics_provider_name ?? leg.carrier_id ?? '未指定物流商'),
      trackingNo: leg.tracking_no ?? leg.logistics_tracking_number ?? null,
      routeLane: leg.route_lane ?? routeLane,
      serviceLevel: leg.service_level ?? serviceLevel,
      pricingScope: scope,
      weightScaled: legWeight.weightScaled != null ? legWeight.weightScaled.toString() : null,
      weightFormatted: legWeight.weightFormatted,
      weightUnit: legWeight.unit,
      weightSource: legWeight.source,
      settlementBlocked: blocked,
      blockReason,
      provenance: {
        sourceFieldPath: rawDetail?.logistics_list ? 'detail.logistics_list' : 'shipment.logistics_list',
        sourceId: String(leg.logistics_record_id ?? fbaShipmentId),
        rawValue: { weight: leg.weight ?? weightInfo.weightFormatted ?? null, unit: leg.weight_unit ?? weightInfo.unit ?? null },
        unit: legWeight.unit,
        timezone: destTimezone,
        collectedAt,
        mappingVersion: MAPPING_VERSION
      }
    };
  });

  return {
    sid: shopSid,
    fbaShipmentId,
    shipmentSn: shipmentSn ? String(shipmentSn) : null,
    planId: planId ? String(planId) : null,
    batchGroupId: batchGroupId ? String(batchGroupId) : (planId ? `PLAN:${shopSid}:${planId}` : null),
    shipmentName: rawShipment.shipment_name ?? fbaShipmentId,
    destFc,
    destCountry,
    destTimezone,
    routeLane,
    serviceLevel,
    shippedAt: rawShipment.shipped_at ?? rawDetail?.shipped_at ?? null,
    promisedStart: isValidIsoDate(promisedStart) ? promisedStart : null,
    promisedEnd: isValidIsoDate(promisedEnd) ? promisedEnd : null,
    signedAt,
    firstReceivedAt,
    putawayAt,
    actualDeliveredAt,
    actualEventSource,
    weightScaled: weightInfo.weightScaled != null ? weightInfo.weightScaled.toString() : null,
    weightFormatted: weightInfo.weightFormatted,
    weightUnit: weightInfo.unit,
    weightSource: weightInfo.source,
    settlementBlocked: weightInfo.settlementBlocked,
    blockReason: weightInfo.blockReason,
    warningDefectAmount: rawShipment.warning_defect_amount ?? null,
    warningDefectCurrency: normalizeCurrency(rawShipment.warning_defect_currency) ?? null,
    sourceVersion,
    sourceUpdatedAt,
    collectedAt,
    mappingVersion: MAPPING_VERSION,
    provenance: {
      sourceFieldPath: 'FBAShipmentList+getInboundShipmentListMwsDetail',
      sourceId: fbaShipmentId,
      rawValue: {
        weight: rawShipment.weight ?? rawDetail?.weight ?? null,
        weight_unit: rawShipment.weight_unit ?? rawDetail?.weight_unit ?? null,
        chargeable_weight: chargeable?.weight ?? null,
        box_count: declaredBoxCount,
        sta_inbound_plan_id: rawShipment.sta_inbound_plan_id ?? rawDetail?.sta_inbound_plan_id ?? null,
        sta_delivery_start_date: rawStaStart,
        sta_delivery_end_date: rawStaEnd,
        expected_arrival_date: rawExpectedDate,
        promised_arrival_start: promisedStart,
        promised_arrival_end: promisedEnd,
        signed_at: signedAt,
        first_received_at: firstReceivedAt,
        putaway_at: putawayAt
      },
      unit: weightInfo.unit,
      timezone: destTimezone,
      collectedAt,
      mappingVersion: MAPPING_VERSION
    },
    legs
  };
}


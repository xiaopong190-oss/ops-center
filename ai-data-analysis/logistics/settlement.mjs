// Automatic monthly settlement engine, statement freeze/adjustment lifecycle,
// CSV/JSON exporter (single source of truth), and startup catch-up scheduler.

import { randomUUID } from 'node:crypto';
import { toLocalCalendarDay, evaluateArrival } from './domain.mjs';
import { currencyDecimals, formatMinor } from './decimal.mjs';

export function previousMonthInTimezone(nowIso = new Date().toISOString(), timeZone = 'Asia/Shanghai') {
  const today = toLocalCalendarDay(nowIso, timeZone);
  if (!today) throw new Error(`无效结算时区: ${timeZone}`);
  const [y, m] = today.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function isValidPeriodMonth(periodMonth) {
  return typeof periodMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodMonth);
}

/**
 * Compute per-(carrier, currency) settlement snapshots for `periodMonth` directly from store.
 */
export function buildSettlementSnapshots(store, periodMonth, { settlementTimezone } = {}) {
  if (!isValidPeriodMonth(periodMonth)) {
    const err = new Error('账期格式无效，需为 YYYY-MM');
    err.statusCode = 400;
    throw err;
  }
  const cfg = store.getConfig();
  const tz = settlementTimezone || cfg.settlementTimezone || 'Asia/Shanghai';

  // 1. Load all shipments delivered in `periodMonth` (in settlementTimezone)
  const allShipments = store.db.prepare('SELECT * FROM shipments WHERE actual_delivered_at IS NOT NULL').all();
  const deliveredInPeriod = [];
  for (const s of allShipments) {
    const localDay = toLocalCalendarDay(s.actual_delivered_at, tz);
    if (localDay && localDay.slice(0, 7) === periodMonth) {
      deliveredInPeriod.push({ ...s, deliveredLocalDay: localDay });
    }
  }

  const legStmt = store.db.prepare(`
    SELECT l.*,
      COALESCE(b.carrier_id, l.carrier_id) AS eff_carrier_id,
      COALESCE(b.carrier_name, l.carrier_name) AS eff_carrier_name,
      COALESCE(NULLIF(TRIM(b.manual_tracking_no), ''), l.tracking_no) AS eff_tracking_no,
      l.carrier_id AS src_carrier_id,
      l.carrier_name AS src_carrier_name,
      p.currency AS p_currency, p.unit_price_formatted AS p_unit_price_formatted,
      p.calculated_minor AS p_calculated_minor, p.calculated_amount AS p_calculated_amount,
      p.effective_minor AS p_effective_minor, p.effective_amount AS p_effective_amount,
      p.override_delta_minor AS p_override_delta_minor, p.override_delta AS p_override_delta,
      p.is_overridden AS p_is_overridden, p.override_reason AS p_override_reason,
      p.source_weight_changed AS p_source_weight_changed, p.version AS p_version
    FROM shipment_legs l
    LEFT JOIN leg_carrier_bindings b ON b.leg_id = l.id
    LEFT JOIN leg_pricing p ON p.leg_id = l.id
    WHERE l.sid = ? AND l.fba_shipment_id = ?
  `);

  // Group buckets by `${carrierId}|${currency}`
  const buckets = new Map();
  const ensureBucket = (carrierId, carrierName, currency) => {
    const key = `${carrierId}|${currency}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        periodMonth,
        carrierId,
        carrierName: carrierName || carrierId,
        currency,
        settlementTimezone: tz,
        freightLines: [],
        defectLines: [],
        pendingItems: [],
        calculatedFreightMinor: 0n,
        overrideDeltaMinor: 0n,
        effectiveFreightMinor: 0n,
        defectDeductionMinor: 0n
      });
    }
    return buckets.get(key);
  };

  for (const s of deliveredInPeriod) {
    const legs = legStmt.all(s.sid, s.fba_shipment_id);
    for (const l of legs) {
      const effCarrierId = l.eff_carrier_id || l.carrier_id;
      const effCarrierName = l.eff_carrier_name || l.carrier_name;
      if (l.settlement_blocked || !l.weight_scaled || !l.weight_unit) {
        // Record pending blocked item under carrier's existing or USD fallback bucket if needed
        const cur = l.p_currency || 'USD';
        const b = ensureBucket(effCarrierId, effCarrierName, cur);
        b.pendingItems.push({
          type: 'blocked_weight',
          sid: s.sid,
          fbaShipmentId: s.fba_shipment_id,
          shipmentSn: l.shipment_sn,
          legId: l.id,
          reason: l.block_reason || '缺少重量或存在歧义，已阻止结算'
        });
        continue;
      }
      if (l.p_version == null || !l.p_currency) {
        const b = ensureBucket(effCarrierId, effCarrierName, 'USD');
        b.pendingItems.push({
          type: 'missing_pricing',
          sid: s.sid,
          fbaShipmentId: s.fba_shipment_id,
          shipmentSn: l.shipment_sn,
          legId: l.id,
          reason: '尚未维护单价，待计价后结算'
        });
        continue;
      }

      const b = ensureBucket(effCarrierId, effCarrierName, l.p_currency);
      const calcMinor = BigInt(l.p_calculated_minor);
      const deltaMinor = BigInt(l.p_override_delta_minor);
      const effMinor = BigInt(l.p_effective_minor);

      b.calculatedFreightMinor += calcMinor;
      b.overrideDeltaMinor += deltaMinor;
      b.effectiveFreightMinor += effMinor;
      b.freightLines.push({
        lineType: 'freight',
        sid: s.sid,
        fbaShipmentId: s.fba_shipment_id,
        shipmentSn: l.shipment_sn,
        legId: l.id,
        logisticsRecordId: l.logistics_record_id,
        carrierId: effCarrierId,
        carrierName: effCarrierName,
        sourceCarrierId: l.src_carrier_id,
        sourceCarrierName: l.src_carrier_name,
        trackingNo: l.eff_tracking_no,
        deliveredLocalDay: s.deliveredLocalDay,
        weight: l.weight_formatted,
        weightUnit: l.weight_unit,
        unitPrice: l.p_unit_price_formatted,
        currency: l.p_currency,
        calculatedFreight: l.p_calculated_amount,
        overrideDelta: l.p_override_delta,
        effectiveFreight: l.p_effective_amount,
        isOverridden: Boolean(l.p_is_overridden),
        overrideReason: l.p_override_reason,
        sourceWeightChanged: Boolean(l.p_source_weight_changed),
        pricingVersion: l.p_version
      });
    }
  }

  // 2. Load all defect fees & reversals booked in `periodMonth`
  const fees = store.listDefectFees({ bookingMonth: periodMonth });
  for (const fee of fees) {
    const carrierId = fee.carrier_id || 'UNASSIGNED';
    const carrierName = fee.carrier_name || carrierId;
    const b = ensureBucket(carrierId, carrierName, fee.currency);

    if (fee.status === 'verified' || fee.status === 'reversed') {
      // Verified fee has positive allocated_minor (deducted from payable);
      // Reversal has negative allocated_minor (credits back to payable).
      if (fee.allocations.length > 0) {
        for (const a of fee.allocations) {
          const minor = BigInt(a.allocated_minor);
          b.defectDeductionMinor += minor;
          b.defectLines.push({
            lineType: fee.status === 'reversed' ? 'defect_reversal' : 'defect_deduction',
            feeId: fee.id,
            sourceBillNo: fee.source_bill_no,
            sourceLineNo: fee.source_line_no,
            occurredDate: fee.occurred_date,
            bookingMonth: fee.booking_month,
            status: fee.status,
            reversedFeeId: fee.reversed_fee_id,
            reversalReason: fee.reversal_reason,
            responsibilityBasis: fee.responsibility_basis,
            sid: a.sid,
            fbaShipmentId: a.fba_shipment_id,
            legId: a.leg_id,
            currency: fee.currency,
            amount: a.allocated_amount,
            minor: a.allocated_minor
          });
        }
      } else {
        const minor = BigInt(fee.total_minor);
        b.defectDeductionMinor += minor;
        b.defectLines.push({
          lineType: fee.status === 'reversed' ? 'defect_reversal' : 'defect_deduction',
          feeId: fee.id,
          sourceBillNo: fee.source_bill_no,
          sourceLineNo: fee.source_line_no,
          occurredDate: fee.occurred_date,
          bookingMonth: fee.booking_month,
          status: fee.status,
          reversedFeeId: fee.reversed_fee_id,
          reversalReason: fee.reversal_reason,
          responsibilityBasis: fee.responsibility_basis,
          sid: null,
          fbaShipmentId: null,
          legId: null,
          currency: fee.currency,
          amount: fee.total_amount,
          minor: fee.total_minor
        });
      }
    } else {
      // pending_review or disputed -> DO NOT deduct from payable! List in pendingItems.
      b.pendingItems.push({
        type: fee.status === 'disputed' ? 'disputed_defect_fee' : 'pending_defect_fee',
        feeId: fee.id,
        sourceBillNo: fee.source_bill_no,
        sourceLineNo: fee.source_line_no,
        currency: fee.currency,
        amount: fee.total_amount,
        status: fee.status,
        reason: fee.status === 'disputed' ? '争议承担方，暂不扣减应付' : '待核缺陷费，暂不归责扣款'
      });
    }
  }

  const snapshots = [];
  for (const b of buckets.values()) {
    const decimals = currencyDecimals(b.currency);
    const adjustmentMinor = 0n;
    const netPayableMinor = b.effectiveFreightMinor - b.defectDeductionMinor + adjustmentMinor;
    snapshots.push({
      periodMonth: b.periodMonth,
      carrierId: b.carrierId,
      carrierName: b.carrierName,
      currency: b.currency,
      settlementTimezone: b.settlementTimezone,
      calculatedFreightMinor: b.calculatedFreightMinor.toString(),
      overrideDeltaMinor: b.overrideDeltaMinor.toString(),
      effectiveFreightMinor: b.effectiveFreightMinor.toString(),
      defectDeductionMinor: b.defectDeductionMinor.toString(),
      adjustmentMinor: adjustmentMinor.toString(),
      netPayableMinor: netPayableMinor.toString(),
      calculatedFreightAmount: formatMinor(b.calculatedFreightMinor, decimals),
      overrideDeltaAmount: formatMinor(b.overrideDeltaMinor, decimals),
      effectiveFreightAmount: formatMinor(b.effectiveFreightMinor, decimals),
      defectDeductionAmount: formatMinor(b.defectDeductionMinor, decimals),
      adjustmentAmount: formatMinor(adjustmentMinor, decimals),
      netPayableAmount: formatMinor(netPayableMinor, decimals),
      lineCount: b.freightLines.length + b.defectLines.length,
      pendingCount: b.pendingItems.length,
      freightLines: b.freightLines,
      defectLines: b.defectLines,
      pendingItems: b.pendingItems
    });
  }
  return snapshots;
}

/**
 * Run monthly settlement for `periodMonth`.
 * - Atomic under `BEGIN IMMEDIATE` + unique index on `(period_month, carrier_id, currency)` for regular statements.
 * - Draft statements are recalculated in-place.
 * - Confirmed statements remain FROZEN; if new totals differ, generates an `adjustment` statement referencing `original_statement_id`.
 */
export function runMonthlySettlement(store, periodMonth, { triggerType = 'manual', settlementTimezone } = {}) {
  const startedAt = new Date().toISOString();
  const runId = randomUUID();

  try {
    const result = store.transaction(() => {
      const snapshots = buildSettlementSnapshots(store, periodMonth, { settlementTimezone });
      const now = new Date().toISOString();
      const statements = [];

      for (const snap of snapshots) {
        const existing = store.db.prepare(`
          SELECT * FROM monthly_statements
          WHERE period_month = ? AND carrier_id = ? AND currency = ? AND statement_type = 'regular'
        `).get(periodMonth, snap.carrierId, snap.currency);

        if (!existing) {
          const id = `STMT-${periodMonth}-${snap.carrierId}-${snap.currency}`;
          store.db.prepare(`
            INSERT INTO monthly_statements (
              id, period_month, carrier_id, carrier_name, currency,
              statement_type, original_statement_id, status, settlement_timezone,
              calculated_freight_minor, override_delta_minor, freight_minor,
              defect_deduction_minor, adjustment_minor, net_payable_minor,
              calculated_freight_amount, override_delta_amount, freight_amount,
              defect_deduction_amount, adjustment_amount, net_payable_amount,
              pending_count, line_count, snapshot_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'regular', NULL, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id, periodMonth, snap.carrierId, snap.carrierName, snap.currency, snap.settlementTimezone,
            snap.calculatedFreightMinor, snap.overrideDeltaMinor, snap.effectiveFreightMinor,
            snap.defectDeductionMinor, snap.adjustmentMinor, snap.netPayableMinor,
            snap.calculatedFreightAmount, snap.overrideDeltaAmount, snap.effectiveFreightAmount,
            snap.defectDeductionAmount, snap.adjustmentAmount, snap.netPayableAmount,
            snap.pendingCount, snap.lineCount, JSON.stringify(snap), now, now
          );
          statements.push(store.db.prepare('SELECT * FROM monthly_statements WHERE id = ?').get(id));
        } else if (existing.status === 'draft') {
          store.db.prepare(`
            UPDATE monthly_statements SET
              carrier_name = ?,
              settlement_timezone = ?,
              calculated_freight_minor = ?,
              override_delta_minor = ?,
              freight_minor = ?,
              defect_deduction_minor = ?,
              adjustment_minor = ?,
              net_payable_minor = ?,
              calculated_freight_amount = ?,
              override_delta_amount = ?,
              freight_amount = ?,
              defect_deduction_amount = ?,
              adjustment_amount = ?,
              net_payable_amount = ?,
              pending_count = ?,
              line_count = ?,
              snapshot_json = ?,
              updated_at = ?
            WHERE id = ?
          `).run(
            snap.carrierName, snap.settlementTimezone,
            snap.calculatedFreightMinor, snap.overrideDeltaMinor, snap.effectiveFreightMinor,
            snap.defectDeductionMinor, snap.adjustmentMinor, snap.netPayableMinor,
            snap.calculatedFreightAmount, snap.overrideDeltaAmount, snap.effectiveFreightAmount,
            snap.defectDeductionAmount, snap.adjustmentAmount, snap.netPayableAmount,
            snap.pendingCount, snap.lineCount, JSON.stringify(snap), now, existing.id
          );
          statements.push(store.db.prepare('SELECT * FROM monthly_statements WHERE id = ?').get(existing.id));
        } else {
          // Existing regular statement is CONFIRMED (frozen)!
          // Compute delta against confirmed statement + all previous adjustment statements referencing it.
          const priorAdjs = store.db.prepare(
            "SELECT * FROM monthly_statements WHERE original_statement_id = ? AND statement_type = 'adjustment'"
          ).all(existing.id);

          let coveredNetMinor = BigInt(existing.net_payable_minor);
          let coveredFreightMinor = BigInt(existing.freight_minor);
          let coveredDefectMinor = BigInt(existing.defect_deduction_minor);
          for (const adj of priorAdjs) {
            coveredNetMinor += BigInt(adj.net_payable_minor);
            coveredFreightMinor += BigInt(adj.freight_minor);
            coveredDefectMinor += BigInt(adj.defect_deduction_minor);
          }

          const deltaNetMinor = BigInt(snap.netPayableMinor) - coveredNetMinor;
          const deltaFreightMinor = BigInt(snap.effectiveFreightMinor) - coveredFreightMinor;
          const deltaDefectMinor = BigInt(snap.defectDeductionMinor) - coveredDefectMinor;

          if (deltaNetMinor !== 0n || deltaFreightMinor !== 0n || deltaDefectMinor !== 0n) {
            const decimals = currencyDecimals(snap.currency);
            const adjId = `ADJ-${periodMonth}-${snap.carrierId}-${snap.currency}-${priorAdjs.length + 1}`;
            const adjSnap = {
              ...snap,
              statementType: 'adjustment',
              originalStatementId: existing.id,
              adjustmentFreightAmount: formatMinor(deltaFreightMinor, decimals),
              adjustmentDefectAmount: formatMinor(deltaDefectMinor, decimals),
              netPayableAmount: formatMinor(deltaNetMinor, decimals)
            };
            store.db.prepare(`
              INSERT INTO monthly_statements (
                id, period_month, carrier_id, carrier_name, currency,
                statement_type, original_statement_id, status, settlement_timezone,
                calculated_freight_minor, override_delta_minor, freight_minor,
                defect_deduction_minor, adjustment_minor, net_payable_minor,
                calculated_freight_amount, override_delta_amount, freight_amount,
                defect_deduction_amount, adjustment_amount, net_payable_amount,
                pending_count, line_count, snapshot_json, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, 'adjustment', ?, 'draft', ?, '0', '0', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              adjId, periodMonth, snap.carrierId, snap.carrierName, snap.currency,
              existing.id, snap.settlementTimezone,
              deltaFreightMinor.toString(), deltaDefectMinor.toString(), deltaNetMinor.toString(), deltaNetMinor.toString(),
              formatMinor(0n, decimals), formatMinor(0n, decimals), formatMinor(deltaFreightMinor, decimals),
              formatMinor(deltaDefectMinor, decimals), formatMinor(deltaNetMinor, decimals), formatMinor(deltaNetMinor, decimals),
              snap.pendingCount, snap.lineCount, JSON.stringify(adjSnap), now, now
            );
            statements.push(store.db.prepare('SELECT * FROM monthly_statements WHERE id = ?').get(adjId));
          } else {
            statements.push(existing);
          }
        }
      }

      // Remove stale DRAFT regular statements in this period whose carrier/currency no longer has any activity
      // (e.g. after rebinding a leg's carrier before confirmation). Confirmed statements are NEVER touched!
      const activeKeys = new Set(snapshots.map(s => `${s.carrierId}|${s.currency}`));
      const existingDrafts = store.db.prepare(`
        SELECT id, carrier_id, currency FROM monthly_statements
        WHERE period_month = ? AND statement_type = 'regular' AND status = 'draft'
      `).all(periodMonth);
      for (const d of existingDrafts) {
        if (!activeKeys.has(`${d.carrier_id}|${d.currency}`)) {
          store.db.prepare('DELETE FROM monthly_statements WHERE id = ? AND status = \'draft\'').run(d.id);
        }
      }

      store.db.prepare(`
        INSERT INTO settlement_runs (id, period_month, trigger_type, status, statement_count, started_at, finished_at, error)
        VALUES (?, ?, ?, 'completed', ?, ?, ?, NULL)
      `).run(runId, periodMonth, triggerType, statements.length, startedAt, now);

      return { runId, periodMonth, triggerType, statements: statements.map(hydrateStatement) };
    });
    return result;
  } catch (err) {
    try {
      store.db.prepare(`
        INSERT INTO settlement_runs (id, period_month, trigger_type, status, statement_count, started_at, finished_at, error)
        VALUES (?, ?, ?, 'failed', 0, ?, ?, ?)
      `).run(runId, periodMonth, triggerType, startedAt, new Date().toISOString(), err.message);
    } catch { /* ignore */ }
    throw err;
  }
}

export function confirmStatement(store, statementId, operator = 'finance') {
  const now = new Date().toISOString();
  return store.transaction(() => {
    const stmt = store.db.prepare('SELECT * FROM monthly_statements WHERE id = ?').get(statementId);
    if (!stmt) {
      const err = new Error('对账单不存在');
      err.statusCode = 404;
      throw err;
    }
    if (stmt.status === 'confirmed') {
      return hydrateStatement(stmt);
    }
    store.db.prepare(`
      UPDATE monthly_statements
      SET status = 'confirmed', confirmed_at = ?, confirmed_by = ?, updated_at = ?
      WHERE id = ?
    `).run(now, String(operator), now, statementId);
    return hydrateStatement(store.db.prepare('SELECT * FROM monthly_statements WHERE id = ?').get(statementId));
  });
}

export function hydrateStatement(row) {
  if (!row) return null;
  return {
    id: row.id,
    periodMonth: row.period_month,
    carrierId: row.carrier_id,
    carrierName: row.carrier_name,
    currency: row.currency,
    statementType: row.statement_type,
    originalStatementId: row.original_statement_id,
    status: row.status,
    settlementTimezone: row.settlement_timezone,
    calculatedFreightAmount: row.calculated_freight_amount,
    overrideDeltaAmount: row.override_delta_amount,
    freightAmount: row.freight_amount,
    defectDeductionAmount: row.defect_deduction_amount,
    adjustmentAmount: row.adjustment_amount,
    netPayableAmount: row.net_payable_amount,
    pendingCount: row.pending_count,
    lineCount: row.line_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confirmedAt: row.confirmed_at,
    confirmedBy: row.confirmed_by,
    snapshot: JSON.parse(row.snapshot_json)
  };
}

export function listStatements(store, { periodMonth, carrierId, status } = {}) {
  const conds = [];
  const params = [];
  if (periodMonth) { conds.push('period_month = ?'); params.push(periodMonth); }
  if (carrierId) { conds.push('carrier_id = ?'); params.push(carrierId); }
  if (status) { conds.push('status = ?'); params.push(status); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  return store.db.prepare(
    `SELECT * FROM monthly_statements ${where} ORDER BY period_month DESC, carrier_id ASC, created_at ASC`
  ).all(...params).map(hydrateStatement);
}

export function getStatementById(store, id) {
  const row = store.db.prepare('SELECT * FROM monthly_statements WHERE id = ?').get(id);
  return hydrateStatement(row);
}

/**
 * Export statement as CSV directly from the immutable/canonical snapshot.
 */
export function exportStatementCsv(statement) {
  const esc = v => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const header = [
    'statement_id', 'period_month', 'statement_type', 'status', 'carrier_id', 'carrier_name', 'currency',
    'line_type', 'sid', 'fba_shipment_id', 'shipment_sn', 'leg_id', 'source_bill_no', 'source_line_no',
    'weight', 'weight_unit', 'unit_price', 'calculated_freight', 'override_delta', 'effective_freight',
    'defect_deduction', 'note'
  ];
  const lines = [header.join(',')];
  const snap = statement.snapshot;

  for (const l of snap.freightLines || []) {
    lines.push([
      statement.id, statement.periodMonth, statement.statementType, statement.status,
      statement.carrierId, statement.carrierName, statement.currency,
      'freight', l.sid, l.fbaShipmentId, l.shipmentSn, l.legId, '', '',
      l.weight, l.weightUnit, l.unitPrice, l.calculatedFreight, l.overrideDelta, l.effectiveFreight,
      '0', l.overrideReason || ''
    ].map(esc).join(','));
  }

  for (const d of snap.defectLines || []) {
    lines.push([
      statement.id, statement.periodMonth, statement.statementType, statement.status,
      statement.carrierId, statement.carrierName, statement.currency,
      d.lineType, d.sid || '', d.fbaShipmentId || '', '', d.legId || '', d.sourceBillNo, d.sourceLineNo,
      '', '', '', '0', '0', '0',
      d.amount, d.reversalReason || d.responsibilityBasis || ''
    ].map(esc).join(','));
  }

  lines.push([
    statement.id, statement.periodMonth, statement.statementType, statement.status,
    statement.carrierId, statement.carrierName, statement.currency,
    'TOTAL', '', '', '', '', '', '',
    '', '', '', statement.calculatedFreightAmount, statement.overrideDeltaAmount, statement.freightAmount,
    statement.defectDeductionAmount, `net_payable=${statement.netPayableAmount};pending=${statement.pendingCount}`
  ].map(esc).join(','));

  return lines.join('\r\n');
}

/**
 * Startup catch-up + periodic monthly scheduler.
 * Checks on startup for previous closed month (if not yet run) and schedules periodic checks.
 */
export function startMonthlyScheduler(store, { nowFn = () => new Date().toISOString(), intervalMs = 60 * 60 * 1000 } = {}) {
  const catchUp = () => {
    try {
      const cfg = store.getConfig();
      const tz = cfg.settlementTimezone || 'Asia/Shanghai';
      const targetMonth = previousMonthInTimezone(nowFn(), tz);
      const alreadyRan = store.db.prepare(
        "SELECT 1 FROM settlement_runs WHERE period_month = ? AND status = 'completed' LIMIT 1"
      ).get(targetMonth);
      if (!alreadyRan) {
        return runMonthlySettlement(store, targetMonth, { triggerType: 'auto_catchup', settlementTimezone: tz });
      }
      return null;
    } catch (err) {
      console.error('自动月结补跑异常:', err.message);
      return null;
    }
  };

  // Run catch-up immediately on startup
  const initialRun = catchUp();
  const timer = setInterval(() => {
    const cfg = store.getConfig();
    const tz = cfg.settlementTimezone || 'Asia/Shanghai';
    const localDay = toLocalCalendarDay(nowFn(), tz);
    if (localDay && localDay.endsWith('-01')) {
      catchUp();
    }
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    initialRun,
    triggerCatchUp: catchUp,
    stop: () => clearInterval(timer)
  };
}


import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_CONFIG,
  evaluateArrival,
  computeFreightPricing,
  allocateDefectFee,
  isValidTimezone
} from './domain.mjs';
import {
  currencyDecimals,
  normalizeCurrency,
  parseCurrencyToMinor,
  formatMinor,
  formatScaled
} from './decimal.mjs';

export const SCHEMA_VERSION = 1;

export class LogisticsStore {
  constructor(dbPath) {
    this.dbPath = dbPath;
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.migrate();
  }

  close() {
    this.db.close();
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    }
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS logistics_config (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_cursors (
        sid TEXT NOT NULL,
        window_key TEXT NOT NULL,
        last_offset INTEGER NOT NULL DEFAULT 0,
        last_source_updated_at TEXT,
        completed INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (sid, window_key)
      );

      CREATE TABLE IF NOT EXISTS shipments (
        sid TEXT NOT NULL,
        fba_shipment_id TEXT NOT NULL,
        shipment_sn TEXT,
        plan_id TEXT,
        batch_group_id TEXT,
        shipment_name TEXT,
        dest_fc TEXT,
        dest_country TEXT,
        dest_timezone TEXT,
        route_lane TEXT,
        service_level TEXT NOT NULL DEFAULT 'STANDARD',
        shipped_at TEXT,
        promised_start TEXT,
        promised_end TEXT,
        signed_at TEXT,
        first_received_at TEXT,
        putaway_at TEXT,
        actual_delivered_at TEXT,
        actual_event_source TEXT NOT NULL DEFAULT 'unknown',
        weight_scaled TEXT,
        weight_formatted TEXT,
        weight_unit TEXT,
        weight_source TEXT NOT NULL DEFAULT 'missing',
        settlement_blocked INTEGER NOT NULL DEFAULT 0,
        block_reason TEXT,
        warning_defect_amount TEXT,
        warning_defect_currency TEXT,
        source_version INTEGER NOT NULL DEFAULT 0,
        source_updated_at TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        mapping_version TEXT NOT NULL,
        provenance_json TEXT NOT NULL,
        data_mode TEXT NOT NULL DEFAULT 'live',
        PRIMARY KEY (sid, fba_shipment_id)
      );

      CREATE INDEX IF NOT EXISTS idx_shipments_batch ON shipments(batch_group_id);
      CREATE INDEX IF NOT EXISTS idx_shipments_delivered ON shipments(actual_delivered_at);
      CREATE INDEX IF NOT EXISTS idx_shipments_plan ON shipments(sid, plan_id);
      CREATE INDEX IF NOT EXISTS idx_shipments_sn ON shipments(sid, shipment_sn);

      CREATE TABLE IF NOT EXISTS shipment_legs (
        id TEXT PRIMARY KEY,
        sid TEXT NOT NULL,
        fba_shipment_id TEXT NOT NULL,
        shipment_sn TEXT NOT NULL,
        logistics_record_id TEXT NOT NULL,
        carrier_id TEXT NOT NULL,
        carrier_name TEXT NOT NULL,
        tracking_no TEXT,
        route_lane TEXT,
        service_level TEXT NOT NULL DEFAULT 'STANDARD',
        pricing_scope TEXT NOT NULL DEFAULT 'shipment',
        weight_scaled TEXT,
        weight_formatted TEXT,
        weight_unit TEXT,
        weight_source TEXT NOT NULL DEFAULT 'missing',
        settlement_blocked INTEGER NOT NULL DEFAULT 0,
        block_reason TEXT,
        provenance_json TEXT NOT NULL,
        FOREIGN KEY (sid, fba_shipment_id) REFERENCES shipments(sid, fba_shipment_id)
      );

      CREATE INDEX IF NOT EXISTS idx_legs_shipment ON shipment_legs(sid, fba_shipment_id);
      CREATE INDEX IF NOT EXISTS idx_legs_carrier ON shipment_legs(carrier_id);
      CREATE INDEX IF NOT EXISTS idx_legs_sn ON shipment_legs(sid, shipment_sn);

      CREATE TABLE IF NOT EXISTS leg_pricing (
        leg_id TEXT PRIMARY KEY REFERENCES shipment_legs(id),
        sid TEXT NOT NULL,
        fba_shipment_id TEXT NOT NULL,
        carrier_id TEXT NOT NULL,
        currency TEXT NOT NULL,
        weight_unit TEXT NOT NULL,
        unit_price_scaled TEXT NOT NULL,
        unit_price_formatted TEXT NOT NULL,
        weight_scaled_at_pricing TEXT NOT NULL,
        calculated_minor TEXT NOT NULL,
        calculated_amount TEXT NOT NULL,
        effective_minor TEXT NOT NULL,
        effective_amount TEXT NOT NULL,
        override_delta_minor TEXT NOT NULL,
        override_delta TEXT NOT NULL,
        is_overridden INTEGER NOT NULL DEFAULT 0,
        override_reason TEXT,
        override_by TEXT,
        override_at TEXT,
        source_weight_changed INTEGER NOT NULL DEFAULT 0,
        previous_weight_formatted TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pricing_audit_log (
        id TEXT PRIMARY KEY,
        leg_id TEXT NOT NULL,
        sid TEXT NOT NULL,
        fba_shipment_id TEXT NOT NULL,
        action TEXT NOT NULL,
        operator TEXT NOT NULL,
        reason TEXT,
        before_json TEXT,
        after_json TEXT NOT NULL,
        version INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pricing_audit_leg ON pricing_audit_log(leg_id, created_at);

      CREATE TABLE IF NOT EXISTS defect_fees (
        id TEXT PRIMARY KEY,
        source_bill_no TEXT NOT NULL,
        source_line_no TEXT NOT NULL,
        currency TEXT NOT NULL,
        occurred_date TEXT NOT NULL,
        booking_month TEXT NOT NULL,
        total_minor TEXT NOT NULL,
        total_amount TEXT NOT NULL,
        carrier_id TEXT,
        carrier_name TEXT,
        responsibility_basis TEXT,
        status TEXT NOT NULL,
        reversed_fee_id TEXT,
        reversal_reason TEXT,
        operator TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (source_bill_no, source_line_no, currency)
      );
      CREATE INDEX IF NOT EXISTS idx_defect_fees_month ON defect_fees(booking_month, carrier_id);

      CREATE TABLE IF NOT EXISTS defect_fee_allocations (
        id TEXT PRIMARY KEY,
        fee_id TEXT NOT NULL REFERENCES defect_fees(id),
        sid TEXT NOT NULL,
        fba_shipment_id TEXT NOT NULL,
        leg_id TEXT,
        carrier_id TEXT,
        currency TEXT NOT NULL,
        allocated_minor TEXT NOT NULL,
        allocated_amount TEXT NOT NULL,
        weight_basis TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_alloc_shipment ON defect_fee_allocations(sid, fba_shipment_id);
      CREATE INDEX IF NOT EXISTS idx_alloc_fee ON defect_fee_allocations(fee_id);

      CREATE TABLE IF NOT EXISTS monthly_statements (
        id TEXT PRIMARY KEY,
        period_month TEXT NOT NULL,
        carrier_id TEXT NOT NULL,
        carrier_name TEXT NOT NULL,
        currency TEXT NOT NULL,
        statement_type TEXT NOT NULL DEFAULT 'regular',
        original_statement_id TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        settlement_timezone TEXT NOT NULL,
        calculated_freight_minor TEXT NOT NULL,
        override_delta_minor TEXT NOT NULL,
        freight_minor TEXT NOT NULL,
        defect_deduction_minor TEXT NOT NULL,
        adjustment_minor TEXT NOT NULL,
        net_payable_minor TEXT NOT NULL,
        calculated_freight_amount TEXT NOT NULL,
        override_delta_amount TEXT NOT NULL,
        freight_amount TEXT NOT NULL,
        defect_deduction_amount TEXT NOT NULL,
        adjustment_amount TEXT NOT NULL,
        net_payable_amount TEXT NOT NULL,
        pending_count INTEGER NOT NULL DEFAULT 0,
        line_count INTEGER NOT NULL DEFAULT 0,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        confirmed_at TEXT,
        confirmed_by TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_statements_regular_unique
        ON monthly_statements(period_month, carrier_id, currency)
        WHERE statement_type = 'regular';
      CREATE INDEX IF NOT EXISTS idx_statements_period ON monthly_statements(period_month, status);

      CREATE TABLE IF NOT EXISTS settlement_runs (
        id TEXT PRIMARY KEY,
        period_month TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        status TEXT NOT NULL,
        statement_count INTEGER NOT NULL DEFAULT 0,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        error TEXT
      );

      CREATE TABLE IF NOT EXISTS shipment_evidence_log (
        id TEXT PRIMARY KEY,
        sid TEXT NOT NULL,
        fba_shipment_id TEXT NOT NULL,
        dest_timezone TEXT,
        dest_country TEXT,
        actual_delivered_at TEXT,
        actual_event_source TEXT,
        evidence_ref TEXT NOT NULL,
        operator TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_evidence_shipment ON shipment_evidence_log(sid, fba_shipment_id, created_at);

      CREATE TABLE IF NOT EXISTS carriers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL DEFAULT 'manual',
        note TEXT,
        created_by TEXT NOT NULL DEFAULT 'operator',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS leg_carrier_bindings (
        leg_id TEXT PRIMARY KEY REFERENCES shipment_legs(id),
        carrier_id TEXT NOT NULL,
        carrier_name TEXT NOT NULL,
        manual_tracking_no TEXT,
        binding_source TEXT NOT NULL DEFAULT 'manual',
        note TEXT,
        operator TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_bindings_carrier ON leg_carrier_bindings(carrier_id);
      CREATE INDEX IF NOT EXISTS idx_bindings_tracking ON leg_carrier_bindings(manual_tracking_no);

      CREATE TABLE IF NOT EXISTS carrier_binding_audit_log (
        id TEXT PRIMARY KEY,
        leg_id TEXT NOT NULL,
        sid TEXT NOT NULL,
        fba_shipment_id TEXT NOT NULL,
        action TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        operator TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_carrier_binding_audit_leg ON carrier_binding_audit_log(leg_id, created_at);
    `);

    const row = this.db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(SCHEMA_VERSION);
    if (!row) {
      this.db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        SCHEMA_VERSION,
        'initial_logistics_schema',
        new Date().toISOString()
      );
    }
  }

  getConfig() {
    const rows = this.db.prepare('SELECT key, value_json FROM logistics_config').all();
    const cfg = structuredClone(DEFAULT_CONFIG);
    for (const r of rows) {
      try {
        cfg[r.key] = JSON.parse(r.value_json);
      } catch { /* ignore */ }
    }
    return cfg;
  }

  updateConfig(patch) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO logistics_config (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `);
    this.transaction(() => {
      for (const [k, v] of Object.entries(patch)) {
        stmt.run(k, JSON.stringify(v), now);
      }
    });
    return this.getConfig();
  }

  getCursor(sid, windowKey) {
    return this.db.prepare('SELECT * FROM sync_cursors WHERE sid = ? AND window_key = ?').get(String(sid), String(windowKey)) || null;
  }

  saveCursor(sid, windowKey, { lastOffset, lastSourceUpdatedAt = null, completed = false }) {
    this.db.prepare(`
      INSERT INTO sync_cursors (sid, window_key, last_offset, last_source_updated_at, completed, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(sid, window_key) DO UPDATE SET
        last_offset = excluded.last_offset,
        last_source_updated_at = COALESCE(excluded.last_source_updated_at, sync_cursors.last_source_updated_at),
        completed = excluded.completed,
        updated_at = excluded.updated_at
    `).run(String(sid), String(windowKey), lastOffset, lastSourceUpdatedAt, completed ? 1 : 0, new Date().toISOString());
  }

  /**
   * Idempotent version-guarded upsert of a batch of normalized shipments + legs,
   * optionally advancing the sync cursor in the EXACT same SQLite transaction.
   */
  upsertShipmentsPage(normalizedShipments, { dataMode = 'live', cursor = null } = {}) {
    const selectExisting = this.db.prepare(
      'SELECT source_version, source_updated_at, promised_start, promised_end, dest_timezone FROM shipments WHERE sid = ? AND fba_shipment_id = ?'
    );
    const upsertShipment = this.db.prepare(`
      INSERT INTO shipments (
        sid, fba_shipment_id, shipment_sn, plan_id, batch_group_id, shipment_name,
        dest_fc, dest_country, dest_timezone, route_lane, service_level,
        shipped_at, promised_start, promised_end,
        signed_at, first_received_at, putaway_at, actual_delivered_at, actual_event_source,
        weight_scaled, weight_formatted, weight_unit, weight_source,
        settlement_blocked, block_reason,
        warning_defect_amount, warning_defect_currency,
        source_version, source_updated_at, collected_at, mapping_version, provenance_json, data_mode
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(sid, fba_shipment_id) DO UPDATE SET
        shipment_sn = excluded.shipment_sn,
        plan_id = excluded.plan_id,
        batch_group_id = excluded.batch_group_id,
        shipment_name = excluded.shipment_name,
        dest_fc = excluded.dest_fc,
        dest_country = COALESCE(shipments.dest_country, excluded.dest_country),
        dest_timezone = COALESCE(shipments.dest_timezone, excluded.dest_timezone),
        route_lane = COALESCE(shipments.route_lane, excluded.route_lane),
        service_level = excluded.service_level,
        shipped_at = COALESCE(excluded.shipped_at, shipments.shipped_at),
        promised_start = COALESCE(shipments.promised_start, excluded.promised_start),
        promised_end = COALESCE(shipments.promised_end, excluded.promised_end),
        signed_at = COALESCE(excluded.signed_at, shipments.signed_at),
        first_received_at = COALESCE(excluded.first_received_at, shipments.first_received_at),
        putaway_at = COALESCE(excluded.putaway_at, shipments.putaway_at),
        actual_delivered_at = COALESCE(shipments.actual_delivered_at, excluded.actual_delivered_at),
        actual_event_source = CASE WHEN shipments.actual_delivered_at IS NOT NULL THEN shipments.actual_event_source WHEN excluded.actual_delivered_at IS NOT NULL THEN excluded.actual_event_source ELSE shipments.actual_event_source END,
        weight_scaled = excluded.weight_scaled,
        weight_formatted = excluded.weight_formatted,
        weight_unit = excluded.weight_unit,
        weight_source = excluded.weight_source,
        settlement_blocked = excluded.settlement_blocked,
        block_reason = excluded.block_reason,
        warning_defect_amount = excluded.warning_defect_amount,
        warning_defect_currency = excluded.warning_defect_currency,
        source_version = excluded.source_version,
        source_updated_at = excluded.source_updated_at,
        collected_at = excluded.collected_at,
        mapping_version = excluded.mapping_version,
        provenance_json = excluded.provenance_json,
        data_mode = excluded.data_mode
    `);

    const upsertLeg = this.db.prepare(`
      INSERT INTO shipment_legs (
        id, sid, fba_shipment_id, shipment_sn, logistics_record_id,
        carrier_id, carrier_name, tracking_no, route_lane, service_level, pricing_scope,
        weight_scaled, weight_formatted, weight_unit, weight_source,
        settlement_blocked, block_reason, provenance_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        carrier_id = excluded.carrier_id,
        carrier_name = excluded.carrier_name,
        tracking_no = excluded.tracking_no,
        route_lane = excluded.route_lane,
        service_level = excluded.service_level,
        pricing_scope = excluded.pricing_scope,
        weight_scaled = excluded.weight_scaled,
        weight_formatted = excluded.weight_formatted,
        weight_unit = excluded.weight_unit,
        weight_source = excluded.weight_source,
        settlement_blocked = excluded.settlement_blocked,
        block_reason = excluded.block_reason,
        provenance_json = excluded.provenance_json
    `);

    const selectPricing = this.db.prepare('SELECT * FROM leg_pricing WHERE leg_id = ?');
    const flagWeightChange = this.db.prepare(`
      UPDATE leg_pricing
      SET source_weight_changed = 1,
          previous_weight_formatted = COALESCE(previous_weight_formatted, ?),
          calculated_minor = ?,
          calculated_amount = ?,
          override_delta_minor = ?,
          override_delta = ?,
          updated_at = ?
      WHERE leg_id = ?
    `);
    const recalcNonOverridden = this.db.prepare(`
      UPDATE leg_pricing
      SET weight_scaled_at_pricing = ?,
          calculated_minor = ?,
          calculated_amount = ?,
          effective_minor = ?,
          effective_amount = ?,
          override_delta_minor = '0',
          override_delta = ?,
          updated_at = ?
      WHERE leg_id = ?
    `);

    let insertedOrUpdated = 0;
    let skippedStale = 0;

    this.transaction(() => {
      for (const s of normalizedShipments) {
        const existing = selectExisting.get(s.sid, s.fbaShipmentId);
        if (existing) {
          // Reject stale / out-of-order replays: higher source_version wins; if equal, compare source_updated_at
          const isOlderVersion = s.sourceVersion < existing.source_version;
          const isOlderTimestamp = s.sourceVersion === existing.source_version &&
            String(s.sourceUpdatedAt) < String(existing.source_updated_at);
          if (isOlderVersion || isOlderTimestamp) {
            skippedStale += 1;
            continue;
          }
        }

        upsertShipment.run(
          s.sid, s.fbaShipmentId, s.shipmentSn, s.planId, s.batchGroupId, s.shipmentName,
          s.destFc, s.destCountry, s.destTimezone, s.routeLane, s.serviceLevel,
          s.shippedAt, s.promisedStart, s.promisedEnd,
          s.signedAt, s.firstReceivedAt, s.putawayAt, s.actualDeliveredAt, s.actualEventSource,
          s.weightScaled, s.weightFormatted, s.weightUnit, s.weightSource,
          s.settlementBlocked ? 1 : 0, s.blockReason,
          s.warningDefectAmount != null ? String(s.warningDefectAmount) : null, s.warningDefectCurrency,
          s.sourceVersion, s.sourceUpdatedAt, s.collectedAt, s.mappingVersion, JSON.stringify(s.provenance), dataMode
        );
        insertedOrUpdated += 1;

        for (const leg of s.legs) {
          const legId = `${leg.sid}:${leg.fbaShipmentId}:${leg.shipmentSn}:${leg.logisticsRecordId}`;
          upsertLeg.run(
            legId, leg.sid, leg.fbaShipmentId, leg.shipmentSn, leg.logisticsRecordId,
            leg.carrierId, leg.carrierName, leg.trackingNo, leg.routeLane, leg.serviceLevel, leg.pricingScope,
            leg.weightScaled, leg.weightFormatted, leg.weightUnit, leg.weightSource,
            leg.settlementBlocked ? 1 : 0, leg.blockReason, JSON.stringify(leg.provenance)
          );

          // Sync replay check against existing pricing:
          // - If manually overridden and source weight changed: PRESERVE override value, update calculated & delta, and flag source_weight_changed!
          // - If not overridden and source weight changed: recalculate effective & calculated seamlessly.
          const pricing = selectPricing.get(legId);
          if (pricing && leg.weightScaled && leg.weightUnit === pricing.weight_unit && leg.weightScaled !== pricing.weight_scaled_at_pricing) {
            const now = new Date().toISOString();
            const recalc = computeFreightPricing({
              weight: BigInt(leg.weightScaled),
              weightUnit: leg.weightUnit,
              unitPrice: BigInt(pricing.unit_price_scaled),
              priceUnit: pricing.weight_unit,
              currency: pricing.currency,
              manualOverrideAmount: pricing.is_overridden ? BigInt(pricing.effective_minor) : null,
              legCount: s.legs.length,
              pricingScope: leg.pricingScope
            });
            if (pricing.is_overridden) {
              const prevW = formatScaled(BigInt(pricing.weight_scaled_at_pricing), 3, true);
              flagWeightChange.run(
                prevW,
                recalc.calculatedMinor,
                recalc.calculatedAmount,
                recalc.overrideDeltaMinor,
                recalc.overrideDelta,
                now,
                legId
              );
            } else {
              recalcNonOverridden.run(
                leg.weightScaled,
                recalc.calculatedMinor,
                recalc.calculatedAmount,
                recalc.effectiveMinor,
                recalc.effectiveAmount,
                formatMinor(0n, currencyDecimals(pricing.currency)),
                now,
                legId
              );
            }
          }
        }
      }

      // Cross-page / cross-sync guard: if multiple FBA shipments share the same (sid, shipment_sn)
      // and only dispatch-order-level weight exists, block settlement on all of them to forbid double-billing.
      const affectedSns = new Set();
      for (const s of normalizedShipments) {
        if (s.shipmentSn && (s.weightSource === 'dispatch_order' || s.weightSource === 'dispatch_order_ambiguous')) {
          affectedSns.add(`${s.sid}\0${s.shipmentSn}`);
        }
      }
      if (affectedSns.size > 0) {
        const countBySn = this.db.prepare(
          'SELECT COUNT(DISTINCT fba_shipment_id) AS cnt FROM shipments WHERE sid = ? AND shipment_sn = ?'
        );
        const blockDispatchShipments = this.db.prepare(`
          UPDATE shipments
          SET weight_scaled = NULL,
              weight_formatted = NULL,
              weight_source = 'dispatch_order_ambiguous',
              settlement_blocked = 1,
              block_reason = '仅发货单级有重量且对应多个 FBA 货件，禁止重复计费，请补齐单票重量或明确分摊'
          WHERE sid = ? AND shipment_sn = ? AND weight_source IN ('dispatch_order', 'dispatch_order_ambiguous')
        `);
        const blockDispatchLegs = this.db.prepare(`
          UPDATE shipment_legs
          SET weight_scaled = NULL,
              weight_formatted = NULL,
              weight_source = 'dispatch_order_ambiguous',
              settlement_blocked = 1,
              block_reason = '仅发货单级有重量且对应多个 FBA 货件，禁止重复计费，请补齐单票重量或明确分摊'
          WHERE sid = ? AND shipment_sn = ? AND weight_source IN ('dispatch_order', 'dispatch_order_ambiguous')
        `);
        for (const pair of affectedSns) {
          const [pairSid, pairSn] = pair.split('\0');
          const { cnt } = countBySn.get(pairSid, pairSn);
          if (Number(cnt) > 1) {
            blockDispatchShipments.run(pairSid, pairSn);
            blockDispatchLegs.run(pairSid, pairSn);
          }
        }
      }

      if (cursor) {
        this.saveCursor(cursor.sid, cursor.windowKey, cursor);
      }
    });

    return { insertedOrUpdated, skippedStale };
  }

  /**
   * Set or update pricing (and optional manual override) on a leg with optimistic locking (`expectedVersion`).
   */
  saveLegPricing({
    legId,
    unitPrice,
    priceUnit,
    currency,
    manualOverrideAmount = null,
    overrideReason = null,
    operator = 'operator',
    expectedVersion = null
  }) {
    const leg = this.db.prepare(`
      SELECT l.*, COALESCE(b.carrier_id, l.carrier_id) AS eff_carrier_id
      FROM shipment_legs l
      LEFT JOIN leg_carrier_bindings b ON b.leg_id = l.id
      WHERE l.id = ?
    `).get(legId);
    if (!leg) {
      const err = new Error('未找到对应的物流运输段');
      err.statusCode = 404;
      throw err;
    }
    if (leg.settlement_blocked || !leg.weight_scaled || !leg.weight_unit) {
      const err = new Error(leg.block_reason || '该运输段重量待补数或存在歧义，暂不可计价');
      err.statusCode = 400;
      throw err;
    }
    if (leg.weight_source === 'dispatch_order' || leg.weight_source === 'dispatch_order_ambiguous') {
      const snCnt = this.db.prepare(
        'SELECT COUNT(DISTINCT fba_shipment_id) AS cnt FROM shipments WHERE sid = ? AND shipment_sn = ?'
      ).get(leg.sid, leg.shipment_sn);
      if (Number(snCnt.cnt) > 1) {
        const err = new Error('仅发货单级有重量且对应多个 FBA 货件，禁止重复计费');
        err.statusCode = 400;
        throw err;
      }
    }

    const legCountRow = this.db.prepare(
      'SELECT COUNT(*) AS cnt FROM shipment_legs WHERE sid = ? AND fba_shipment_id = ?'
    ).get(leg.sid, leg.fba_shipment_id);

    const hasOverride = manualOverrideAmount !== null && manualOverrideAmount !== undefined && manualOverrideAmount !== '';
    if (hasOverride && (!overrideReason || !String(overrideReason).trim())) {
      const err = new Error('手动覆盖最终价必须填写原因');
      err.statusCode = 400;
      throw err;
    }

    const calc = computeFreightPricing({
      weight: BigInt(leg.weight_scaled),
      weightUnit: leg.weight_unit,
      unitPrice,
      priceUnit: priceUnit || leg.weight_unit,
      currency,
      manualOverrideAmount: hasOverride ? manualOverrideAmount : null,
      legCount: Number(legCountRow.cnt),
      pricingScope: leg.pricing_scope
    });

    const now = new Date().toISOString();

    return this.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM leg_pricing WHERE leg_id = ?').get(legId);
      const currentVersion = existing ? existing.version : 0;
      if (expectedVersion !== null && expectedVersion !== undefined && Number(expectedVersion) !== currentVersion) {
        const err = new Error(`计价版本冲突（当前版本 ${currentVersion}，提交版本 ${expectedVersion}），请刷新后重试`);
        err.statusCode = 409;
        throw err;
      }

      const nextVersion = currentVersion + 1;
      this.db.prepare(`
        INSERT INTO leg_pricing (
          leg_id, sid, fba_shipment_id, carrier_id, currency, weight_unit,
          unit_price_scaled, unit_price_formatted, weight_scaled_at_pricing,
          calculated_minor, calculated_amount,
          effective_minor, effective_amount,
          override_delta_minor, override_delta,
          is_overridden, override_reason, override_by, override_at,
          source_weight_changed, previous_weight_formatted,
          version, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)
        ON CONFLICT(leg_id) DO UPDATE SET
          currency = excluded.currency,
          weight_unit = excluded.weight_unit,
          unit_price_scaled = excluded.unit_price_scaled,
          unit_price_formatted = excluded.unit_price_formatted,
          weight_scaled_at_pricing = excluded.weight_scaled_at_pricing,
          calculated_minor = excluded.calculated_minor,
          calculated_amount = excluded.calculated_amount,
          effective_minor = excluded.effective_minor,
          effective_amount = excluded.effective_amount,
          override_delta_minor = excluded.override_delta_minor,
          override_delta = excluded.override_delta,
          is_overridden = excluded.is_overridden,
          override_reason = excluded.override_reason,
          override_by = excluded.override_by,
          override_at = excluded.override_at,
          source_weight_changed = 0,
          previous_weight_formatted = NULL,
          version = excluded.version,
          updated_at = excluded.updated_at
      `).run(
        legId, leg.sid, leg.fba_shipment_id, leg.eff_carrier_id || leg.carrier_id, calc.currency, calc.weightUnit,
        calc.unitPriceScaled, calc.unitPriceFormatted, calc.weightScaled,
        calc.calculatedMinor, calc.calculatedAmount,
        calc.effectiveMinor, calc.effectiveAmount,
        calc.overrideDeltaMinor, calc.overrideDelta,
        calc.isOverridden ? 1 : 0,
        calc.isOverridden ? String(overrideReason).trim() : null,
        calc.isOverridden ? String(operator) : null,
        calc.isOverridden ? now : null,
        nextVersion, now
      );

      const saved = this.db.prepare('SELECT * FROM leg_pricing WHERE leg_id = ?').get(legId);
      this.db.prepare(`
        INSERT INTO pricing_audit_log (
          id, leg_id, sid, fba_shipment_id, action, operator, reason, before_json, after_json, version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(), legId, leg.sid, leg.fba_shipment_id,
        calc.isOverridden ? 'manual_override' : 'unit_price_set',
        String(operator),
        calc.isOverridden ? String(overrideReason).trim() : '设置单价',
        existing ? JSON.stringify(existing) : null,
        JSON.stringify(saved),
        nextVersion,
        now
      );

      return saved;
    });
  }

  getPricingAudit(legId) {
    return this.db.prepare('SELECT * FROM pricing_audit_log WHERE leg_id = ? ORDER BY version DESC').all(legId)
      .map(r => ({
        ...r,
        before: r.before_json ? JSON.parse(r.before_json) : null,
        after: JSON.parse(r.after_json)
      }));
  }

  /**
   * Record traceable POD evidence and/or destination warehouse timezone for a shipment
   * when the upstream Lingxing API does not supply signed_at or dest_timezone.
   */
  recordShipmentFulfillmentEvidence({
    sid,
    fbaShipmentId,
    destTimezone = null,
    destCountry = null,
    actualDeliveredAt = null,
    actualEventSource = 'carrier_pod',
    evidenceRef,
    operator = 'operator'
  }) {
    const shopSid = String(sid ?? '').trim();
    const shipId = String(fbaShipmentId ?? '').trim();
    if (!shopSid || !shipId) {
      const err = new Error('缺少店铺 SID 或 FBA 货件号');
      err.statusCode = 400;
      throw err;
    }
    if (!evidenceRef || !String(evidenceRef).trim()) {
      const err = new Error('补录 POD 或目的仓时区必须提供可追溯凭证来源（evidenceRef）');
      err.statusCode = 400;
      throw err;
    }
    if (!destTimezone && !actualDeliveredAt && !destCountry) {
      const err = new Error('请至少填写目的仓时区、国家或实际 POD 签收时间');
      err.statusCode = 400;
      throw err;
    }
    if (destTimezone && !isValidTimezone(destTimezone)) {
      const err = new Error(`无效的 IANA 时区: ${destTimezone}`);
      err.statusCode = 400;
      throw err;
    }
    if (actualDeliveredAt) {
      if (!Number.isFinite(Date.parse(actualDeliveredAt))) {
        const err = new Error(`无效的 POD 时间格式: ${actualDeliveredAt}`);
        err.statusCode = 400;
        throw err;
      }
      if (!['carrier_pod', 'signed'].includes(actualEventSource)) {
        const err = new Error('POD 来源仅允许 carrier_pod 或 signed');
        err.statusCode = 400;
        throw err;
      }
    }

    const now = new Date().toISOString();
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM shipments WHERE sid = ? AND fba_shipment_id = ?').get(shopSid, shipId);
      if (!existing) {
        const err = new Error('未找到对应的 FBA 货件');
        err.statusCode = 404;
        throw err;
      }

      const nextTz = destTimezone ? destTimezone.trim() : existing.dest_timezone;
      const nextCountry = destCountry ? String(destCountry).trim().toUpperCase() : existing.dest_country;
      const nextLane = existing.route_lane || (nextCountry ? `CN-${nextCountry}` : null);
      const nextDelivered = actualDeliveredAt || existing.actual_delivered_at;
      const nextSource = actualDeliveredAt ? actualEventSource : existing.actual_event_source;
      const nextSigned = (actualDeliveredAt && actualEventSource === 'signed') ? actualDeliveredAt : existing.signed_at;

      this.db.prepare(`
        UPDATE shipments
        SET dest_timezone = ?,
            dest_country = ?,
            route_lane = ?,
            signed_at = ?,
            actual_delivered_at = ?,
            actual_event_source = ?
        WHERE sid = ? AND fba_shipment_id = ?
      `).run(nextTz, nextCountry, nextLane, nextSigned, nextDelivered, nextSource, shopSid, shipId);

      if (nextLane && !existing.route_lane) {
        this.db.prepare('UPDATE shipment_legs SET route_lane = COALESCE(route_lane, ?) WHERE sid = ? AND fba_shipment_id = ?')
          .run(nextLane, shopSid, shipId);
      }

      const evId = randomUUID();
      this.db.prepare(`
        INSERT INTO shipment_evidence_log (
          id, sid, fba_shipment_id, dest_timezone, dest_country,
          actual_delivered_at, actual_event_source, evidence_ref, operator, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        evId, shopSid, shipId,
        destTimezone ? destTimezone.trim() : null,
        destCountry ? String(destCountry).trim().toUpperCase() : null,
        actualDeliveredAt || null,
        actualDeliveredAt ? actualEventSource : null,
        String(evidenceRef).trim(),
        String(operator),
        now
      );

      const updated = this.listShipments({ sid: shopSid }).items.find(i => i.fbaShipmentId === shipId);
      const evidence = this.db.prepare('SELECT * FROM shipment_evidence_log WHERE id = ?').get(evId);
      return { shipment: updated, evidence };
    });
  }

  getShipmentEvidenceHistory(sid, fbaShipmentId) {
    return this.db.prepare(
      'SELECT * FROM shipment_evidence_log WHERE sid = ? AND fba_shipment_id = ? ORDER BY created_at DESC'
    ).all(String(sid), String(fbaShipmentId));
  }

  // -------------------------------------------------------------------------
  // Carrier Directory, Leg Carrier Bindings & Exact Tracking-Number Lookup
  // -------------------------------------------------------------------------

  static normalizeCarrierName(rawName) {
    if (typeof rawName !== 'string') {
      const err = new Error('物流服务商名称不能为空');
      err.statusCode = 400;
      throw err;
    }
    const cleaned = rawName.trim().replace(/\s+/g, ' ');
    if (!cleaned || cleaned.length > 80) {
      const err = new Error('物流服务商名称长度须为 1 至 80 个字符');
      err.statusCode = 400;
      throw err;
    }
    if (/[\x00-\x1f\x7f]/.test(cleaned)) {
      const err = new Error('物流服务商名称包含非法控制字符');
      err.statusCode = 400;
      throw err;
    }
    return { name: cleaned, normalizedName: cleaned.toLowerCase() };
  }

  /**
   * Manually add a carrier to the persistent SQLite directory.
   * - Validates name & enforces case/whitespace-insensitive uniqueness.
   * - Reuses existing Lingxing source carrier_id when the same carrier name already exists
   *   in shipment_legs (prevents splitting the same carrier into two IDs!).
   */
  createCarrier({ name, carrierId = null, note = null, operator = 'operator' }) {
    const { name: cleanedName, normalizedName } = LogisticsStore.normalizeCarrierName(name);
    const now = new Date().toISOString();

    return this.transaction(() => {
      const dupName = this.db.prepare('SELECT * FROM carriers WHERE normalized_name = ?').get(normalizedName);
      if (dupName) {
        const err = new Error(`物流服务商「${cleanedName}」已存在（ID: ${dupName.id}）`);
        err.statusCode = 409;
        throw err;
      }

      // Reuse existing Lingxing source carrier_id if same name already appears in synced legs
      const sourceMatch = this.db.prepare(`
        SELECT carrier_id, carrier_name
        FROM shipment_legs
        WHERE carrier_id != 'UNASSIGNED'
          AND LOWER(TRIM(carrier_name)) = ?
        LIMIT 1
      `).get(normalizedName);

      let resolvedId;
      let reusedSourceId = false;
      if (sourceMatch) {
        resolvedId = sourceMatch.carrier_id;
        reusedSourceId = true;
      } else if (carrierId && String(carrierId).trim()) {
        const cid = String(carrierId).trim();
        if (!/^[A-Za-z0-9._:-]{2,64}$/.test(cid) || cid === 'UNASSIGNED') {
          const err = new Error('自定义服务商 ID 须为 2-64 位字母、数字或 . _ : -');
          err.statusCode = 400;
          throw err;
        }
        resolvedId = cid;
      } else {
        resolvedId = `CARRIER-M-${randomUUID().slice(0, 8).toUpperCase()}`;
      }

      const dupId = this.db.prepare('SELECT * FROM carriers WHERE id = ?').get(resolvedId);
      if (dupId) {
        const err = new Error(`服务商 ID「${resolvedId}」已存在于名录（${dupId.name}）`);
        err.statusCode = 409;
        throw err;
      }

      this.db.prepare(`
        INSERT INTO carriers (id, name, normalized_name, source, note, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        resolvedId,
        cleanedName,
        normalizedName,
        reusedSourceId ? 'manual_linked_source' : 'manual',
        note ? String(note).trim() : null,
        String(operator),
        now,
        now
      );

      const saved = this.db.prepare('SELECT * FROM carriers WHERE id = ?').get(resolvedId);
      return {
        carrier: {
          id: saved.id,
          name: saved.name,
          source: saved.source,
          reusedSourceId,
          inDirectory: true,
          note: saved.note,
          createdBy: saved.created_by,
          createdAt: saved.created_at
        }
      };
    });
  }

  /**
   * Unified carrier list: persistent manual directory + distinct synced Lingxing source carriers
   * (deduplicated by carrier_id and normalized name so the same carrier never splits).
   */
  listCarriers() {
    const dirRows = this.db.prepare('SELECT * FROM carriers ORDER BY created_at DESC, name ASC').all();
    const byId = new Map();
    const byNormName = new Set();

    for (const r of dirRows) {
      byId.set(r.id, {
        id: r.id,
        name: r.name,
        source: r.source,
        inDirectory: true,
        note: r.note,
        createdBy: r.created_by,
        createdAt: r.created_at
      });
      byNormName.add(r.normalized_name);
    }

    const legCarriers = this.db.prepare(`
      SELECT carrier_id, MIN(carrier_name) AS carrier_name
      FROM shipment_legs
      WHERE carrier_id IS NOT NULL AND carrier_id != '' AND carrier_id != 'UNASSIGNED'
      GROUP BY carrier_id
      ORDER BY carrier_id ASC
    `).all();

    for (const lc of legCarriers) {
      const norm = String(lc.carrier_name || lc.carrier_id).trim().replace(/\s+/g, ' ').toLowerCase();
      if (byId.has(lc.carrier_id) || byNormName.has(norm)) continue;
      byId.set(lc.carrier_id, {
        id: lc.carrier_id,
        name: lc.carrier_name || lc.carrier_id,
        source: 'lingxing_source',
        inDirectory: false,
        note: null,
        createdBy: null,
        createdAt: null
      });
      byNormName.add(norm);
    }

    return [...byId.values()];
  }

  findConfirmedStatementForLeg(legId) {
    const confirmed = this.db.prepare(`
      SELECT id, period_month, carrier_id, carrier_name, currency, snapshot_json
      FROM monthly_statements
      WHERE status = 'confirmed' AND statement_type = 'regular'
      ORDER BY period_month DESC
    `).all();
    for (const stmt of confirmed) {
      try {
        const snap = JSON.parse(stmt.snapshot_json);
        if (Array.isArray(snap.freightLines) && snap.freightLines.some(l => l.legId === legId)) {
          return stmt;
        }
      } catch { /* ignore malformed snapshot */ }
    }
    return null;
  }

  /**
   * Bind (or clear) a manual carrier and optional manual tracking number on a transport leg.
   * - Preserves original Lingxing source carrier & tracking number on shipment_legs.
   * - Updates leg_pricing.carrier_id to keep pricing & draft settlement aligned.
   * - Financial guard: if the leg is already included in a CONFIRMED statement's freight lines,
   *   rejects any rebind/unbind that would change the settlement carrier (preventing double payable
   *   across A and B), while still allowing tracking number/note maintenance under the same carrier.
   */
  bindLegCarrier({
    legId,
    carrierId,
    manualTrackingNo = null,
    bindingSource = 'manual',
    note = null,
    operator = 'operator'
  }) {
    if (!legId || !String(legId).trim()) {
      const err = new Error('缺少运输段 legId');
      err.statusCode = 400;
      throw err;
    }
    const cleanTracking = manualTrackingNo != null && String(manualTrackingNo).trim() !== ''
      ? String(manualTrackingNo).trim()
      : null;
    if (cleanTracking && (cleanTracking.length > 80 || /[\x00-\x1f\x7f]/.test(cleanTracking))) {
      const err = new Error('运单号格式无效（最长 80 字符且不可含控制字符）');
      err.statusCode = 400;
      throw err;
    }
    const now = new Date().toISOString();

    return this.transaction(() => {
      const leg = this.db.prepare('SELECT * FROM shipment_legs WHERE id = ?').get(legId);
      if (!leg) {
        const err = new Error('未找到对应的物流运输段');
        err.statusCode = 404;
        throw err;
      }

      const prevBinding = this.db.prepare('SELECT * FROM leg_carrier_bindings WHERE leg_id = ?').get(legId) || null;
      const confirmedStmt = this.findConfirmedStatementForLeg(legId);

      // Clear binding if carrierId is null or empty string
      if (carrierId === null || carrierId === '') {
        if (confirmedStmt && leg.carrier_id !== confirmedStmt.carrier_id) {
          const err = new Error(
            `该运输段已计入已确认账单 ${confirmedStmt.id}（账期 ${confirmedStmt.period_month}，结算主体 ${confirmedStmt.carrier_name}/${confirmedStmt.carrier_id}），禁止解除绑定变更结算主体，以免重复应付`
          );
          err.statusCode = 409;
          throw err;
        }
        this.db.prepare('DELETE FROM leg_carrier_bindings WHERE leg_id = ?').run(legId);
        // Restore leg_pricing.carrier_id to original source carrier_id
        this.db.prepare('UPDATE leg_pricing SET carrier_id = ?, updated_at = ? WHERE leg_id = ?')
          .run(leg.carrier_id, now, legId);

        this.db.prepare(`
          INSERT INTO carrier_binding_audit_log (
            id, leg_id, sid, fba_shipment_id, action, before_json, after_json, operator, note, created_at
          ) VALUES (?, ?, ?, ?, 'unbind', ?, NULL, ?, ?, ?)
        `).run(
          randomUUID(), legId, leg.sid, leg.fba_shipment_id,
          prevBinding ? JSON.stringify(prevBinding) : null,
          String(operator), note ? String(note).trim() : '恢复源服务商', now
        );

        return {
          legId,
          binding: null,
          effectiveCarrierId: leg.carrier_id,
          effectiveCarrierName: leg.carrier_name,
          effectiveTrackingNo: leg.tracking_no,
          sourceCarrierId: leg.carrier_id,
          sourceCarrierName: leg.carrier_name,
          sourceTrackingNo: leg.tracking_no
        };
      }

      // Resolve target carrier from unified directory (manual directory OR existing source carrier)
      const allCarriers = this.listCarriers();
      const target = allCarriers.find(c => c.id === String(carrierId).trim());
      if (!target) {
        const err = new Error(`未找到物流服务商 ID: ${carrierId}，请先在服务商名录中新增`);
        err.statusCode = 404;
        throw err;
      }

      if (confirmedStmt && target.id !== confirmedStmt.carrier_id) {
        const err = new Error(
          `该运输段已计入已确认账单 ${confirmedStmt.id}（账期 ${confirmedStmt.period_month}，结算主体 ${confirmedStmt.carrier_name}/${confirmedStmt.carrier_id}），禁止改绑为其他结算主体（${target.name}/${target.id}），以免 A/B 重复应付`
        );
        err.statusCode = 409;
        throw err;
      }

      const effectiveManualTracking = cleanTracking !== null
        ? cleanTracking
        : (prevBinding?.manual_tracking_no ?? null);
      const source = ['manual', 'tracking_lookup'].includes(bindingSource) ? bindingSource : 'manual';

      this.db.prepare(`
        INSERT INTO leg_carrier_bindings (
          leg_id, carrier_id, carrier_name, manual_tracking_no, binding_source, note, operator, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(leg_id) DO UPDATE SET
          carrier_id = excluded.carrier_id,
          carrier_name = excluded.carrier_name,
          manual_tracking_no = excluded.manual_tracking_no,
          binding_source = excluded.binding_source,
          note = excluded.note,
          operator = excluded.operator,
          updated_at = excluded.updated_at
      `).run(
        legId, target.id, target.name, effectiveManualTracking,
        source, note ? String(note).trim() : null, String(operator), now
      );

      // Keep leg_pricing.carrier_id aligned with effective carrier
      this.db.prepare('UPDATE leg_pricing SET carrier_id = ?, updated_at = ? WHERE leg_id = ?')
        .run(target.id, now, legId);

      const saved = this.db.prepare('SELECT * FROM leg_carrier_bindings WHERE leg_id = ?').get(legId);
      this.db.prepare(`
        INSERT INTO carrier_binding_audit_log (
          id, leg_id, sid, fba_shipment_id, action, before_json, after_json, operator, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(), legId, leg.sid, leg.fba_shipment_id,
        source === 'tracking_lookup' ? 'lookup_bind' : 'bind',
        prevBinding ? JSON.stringify(prevBinding) : null,
        JSON.stringify(saved),
        String(operator), note ? String(note).trim() : null, now
      );

      return {
        legId,
        binding: {
          carrierId: saved.carrier_id,
          carrierName: saved.carrier_name,
          manualTrackingNo: saved.manual_tracking_no,
          bindingSource: saved.binding_source,
          note: saved.note,
          operator: saved.operator,
          updatedAt: saved.updated_at
        },
        effectiveCarrierId: saved.carrier_id,
        effectiveCarrierName: saved.carrier_name,
        effectiveTrackingNo: saved.manual_tracking_no || leg.tracking_no,
        sourceCarrierId: leg.carrier_id,
        sourceCarrierName: leg.carrier_name,
        sourceTrackingNo: leg.tracking_no
      };
    });
  }

  getCarrierBindingAudit(legId) {
    return this.db.prepare(
      'SELECT * FROM carrier_binding_audit_log WHERE leg_id = ? ORDER BY created_at DESC'
    ).all(String(legId)).map(r => ({
      ...r,
      before: r.before_json ? JSON.parse(r.before_json) : null,
      after: r.after_json ? JSON.parse(r.after_json) : null
    }));
  }

  /**
   * Exact tracking-number carrier lookup (NEVER guesses by tracking number prefix/pattern).
   * Explicitly distinguishes:
   * - matched: single unambiguous carrier in same shop (or globally if sid omitted)
   * - cross_shop: exact match exists ONLY in another shop (sid mismatch)
   * - conflict: exact match maps to multiple different carriers
   * - not_found: no exact record with known carrier found
   */
  lookupCarrierByTrackingNo({ trackingNo, sid = null }) {
    const clean = typeof trackingNo === 'string' ? trackingNo.trim() : '';
    if (!clean) {
      const err = new Error('请输入要查询的运单号');
      err.statusCode = 400;
      throw err;
    }
    const normTracking = clean.toLowerCase();

    const rows = this.db.prepare(`
      SELECT
        l.id AS leg_id, l.sid, l.fba_shipment_id, l.shipment_sn,
        l.carrier_id AS src_carrier_id, l.carrier_name AS src_carrier_name, l.tracking_no AS src_tracking_no,
        b.carrier_id AS bind_carrier_id, b.carrier_name AS bind_carrier_name, b.manual_tracking_no
      FROM shipment_legs l
      LEFT JOIN leg_carrier_bindings b ON b.leg_id = l.id
      WHERE LOWER(TRIM(COALESCE(l.tracking_no, ''))) = ?
         OR LOWER(TRIM(COALESCE(b.manual_tracking_no, ''))) = ?
    `).all(normTracking, normTracking);

    const resolvedMatches = [];
    for (const r of rows) {
      const cid = r.bind_carrier_id || r.src_carrier_id;
      const cname = r.bind_carrier_name || r.src_carrier_name;
      if (!cid || cid === 'UNASSIGNED') continue;
      const matchedVia = (r.bind_carrier_id && r.manual_tracking_no && r.manual_tracking_no.trim().toLowerCase() === normTracking)
        ? 'manual_binding'
        : r.bind_carrier_id
          ? 'manual_binding'
          : 'lingxing_leg';
      resolvedMatches.push({
        sid: r.sid,
        fbaShipmentId: r.fba_shipment_id,
        shipmentSn: r.shipment_sn,
        legId: r.leg_id,
        carrierId: cid,
        carrierName: cname,
        source: matchedVia
      });
    }

    if (resolvedMatches.length === 0) {
      return {
        status: 'not_found',
        trackingNo: clean,
        message: '未在已同步记录中找到该运单号对应的物流商（不按号段猜测）',
        carrier: null,
        candidates: []
      };
    }

    const reqSid = sid != null && String(sid).trim() !== '' ? String(sid).trim() : null;
    const inShop = reqSid ? resolvedMatches.filter(m => m.sid === reqSid) : resolvedMatches;
    const otherShop = reqSid ? resolvedMatches.filter(m => m.sid !== reqSid) : [];

    // If sid specified and NO matches in current shop, but matches exist in another shop -> cross_shop
    if (reqSid && inShop.length === 0 && otherShop.length > 0) {
      const otherSids = [...new Set(otherShop.map(m => m.sid))];
      return {
        status: 'cross_shop',
        trackingNo: clean,
        message: `该运单号仅在其他店铺（${otherSids.join(', ')}）存在记录，存在跨店风险，未自动套用`,
        carrier: null,
        matchedSids: otherSids,
        candidates: otherShop
      };
    }

    // Check if matches within scope disagree on carrier_id
    const distinctCarriers = new Map();
    for (const m of inShop) {
      if (!distinctCarriers.has(m.carrierId)) {
        distinctCarriers.set(m.carrierId, { id: m.carrierId, name: m.carrierName, source: m.source });
      }
    }

    // Also flag conflict if no sid was provided and matches span multiple shops with different carriers or multiple shops
    const distinctSidsInScope = [...new Set(inShop.map(m => m.sid))];
    if (distinctCarriers.size > 1) {
      return {
        status: 'conflict',
        trackingNo: clean,
        message: `该运单号匹配到 ${distinctCarriers.size} 个不同物流商（存在冲突），请手动核对后选择`,
        carrier: null,
        candidates: inShop
      };
    }
    if (!reqSid && distinctSidsInScope.length > 1) {
      return {
        status: 'cross_shop',
        trackingNo: clean,
        message: `该运单号跨多个店铺（${distinctSidsInScope.join(', ')}），请指定店铺或手动确认`,
        carrier: null,
        matchedSids: distinctSidsInScope,
        candidates: inShop
      };
    }

    const winner = [...distinctCarriers.values()][0];
    return {
      status: 'matched',
      trackingNo: clean,
      matchSource: winner.source === 'manual_binding' ? '已保存人工绑定记录' : '领星同步运输段记录',
      matchSourceCode: winner.source,
      message: `已精确匹配物流商：${winner.name}（来源：${winner.source === 'manual_binding' ? '人工绑定记录' : '领星同步记录'}）`,
      carrier: { id: winner.id, name: winner.name },
      matchedCount: inShop.length,
      candidates: inShop
    };
  }

  /**
   * Record a traceable defect fee from an actual bill line (idempotent on source_bill_no + source_line_no + currency).
   * Supports many-to-many allocation across multiple shipments/legs with cent conservation.
   * Disputed or missing responsibility_basis -> status = 'disputed' or 'pending_review', NOT deducted from payable.
   */
  recordDefectFee({
    sourceBillNo,
    sourceLineNo,
    currency,
    occurredDate,
    bookingMonth,
    totalAmount,
    carrierId = null,
    carrierName = null,
    responsibilityBasis = null,
    status = null,
    targets = [],
    operator = 'operator'
  }) {
    const billNo = String(sourceBillNo ?? '').trim();
    const lineNo = String(sourceLineNo ?? '').trim();
    if (!billNo || !lineNo) {
      const err = new Error('缺陷费必须提供原账单号与行号');
      err.statusCode = 400;
      throw err;
    }
    const cur = normalizeCurrency(currency);
    if (!cur) {
      const err = new Error('缺陷费币种无效');
      err.statusCode = 400;
      throw err;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(occurredDate || ''))) {
      const err = new Error('发生日格式无效（需 YYYY-MM-DD）');
      err.statusCode = 400;
      throw err;
    }
    const bMonth = bookingMonth && /^\d{4}-\d{2}$/.test(bookingMonth)
      ? bookingMonth
      : String(occurredDate).slice(0, 7);

    const totalMinor = parseCurrencyToMinor(totalAmount, cur, { allowNegative: false, allowZero: false });
    const formattedTotal = formatMinor(totalMinor, currencyDecimals(cur));

    // Determine effective status: deducting from carrier requires explicit responsibility_basis & non-disputed & valid targets
    let finalStatus = status || 'verified';
    if (!['verified', 'pending_review', 'disputed'].includes(finalStatus)) {
      const err = new Error('无效的缺陷费状态');
      err.statusCode = 400;
      throw err;
    }
    if (!Array.isArray(targets) || targets.length === 0 || !carrierId || !responsibilityBasis || !String(responsibilityBasis).trim()) {
      if (finalStatus === 'verified') {
        finalStatus = 'pending_review';
      }
    }

    const allocations = Array.isArray(targets) && targets.length > 0
      ? allocateDefectFee({ totalAmount: formattedTotal, currency: cur, targets })
      : [];

    return this.transaction(() => {
      // Idempotent check on (source_bill_no, source_line_no, currency)
      const existing = this.db.prepare(
        'SELECT * FROM defect_fees WHERE source_bill_no = ? AND source_line_no = ? AND currency = ?'
      ).get(billNo, lineNo, cur);

      if (existing) {
        const existingAllocs = this.db.prepare('SELECT * FROM defect_fee_allocations WHERE fee_id = ?').all(existing.id);
        return { fee: existing, allocations: existingAllocs, deduplicated: true };
      }

      const feeId = randomUUID();
      const now = new Date().toISOString();
      this.db.prepare(`
        INSERT INTO defect_fees (
          id, source_bill_no, source_line_no, currency, occurred_date, booking_month,
          total_minor, total_amount, carrier_id, carrier_name, responsibility_basis,
          status, reversed_fee_id, reversal_reason, operator, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
      `).run(
        feeId, billNo, lineNo, cur, occurredDate, bMonth,
        totalMinor.toString(), formattedTotal, carrierId, carrierName || carrierId,
        responsibilityBasis ? String(responsibilityBasis).trim() : null,
        finalStatus, String(operator), now
      );

      const insertAlloc = this.db.prepare(`
        INSERT INTO defect_fee_allocations (
          id, fee_id, sid, fba_shipment_id, leg_id, carrier_id, currency,
          allocated_minor, allocated_amount, weight_basis
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const savedAllocs = [];
      for (const a of allocations) {
        const allocId = randomUUID();
        insertAlloc.run(
          allocId, feeId, String(a.sid), String(a.fbaShipmentId), a.legId || null,
          a.carrierId || carrierId || null, cur,
          a.allocatedMinor, a.allocatedAmount, a.weight != null ? String(a.weight) : '1'
        );
        savedAllocs.push({
          id: allocId,
          fee_id: feeId,
          sid: String(a.sid),
          fba_shipment_id: String(a.fbaShipmentId),
          leg_id: a.legId || null,
          carrier_id: a.carrierId || carrierId || null,
          currency: cur,
          allocated_minor: a.allocatedMinor,
          allocated_amount: a.allocatedAmount
        });
      }

      const fee = this.db.prepare('SELECT * FROM defect_fees WHERE id = ?').get(feeId);
      return { fee, allocations: savedAllocs, deduplicated: false };
    });
  }

  /**
   * Reverse an existing defect fee while preserving the original record intact.
   * Reversal is booked in `reversalMonth` (e.g. next month) and references `reversed_fee_id`.
   */
  reverseDefectFee({ feeId, reversalDate, reversalMonth, reason, operator = 'operator' }) {
    if (!reason || !String(reason).trim()) {
      const err = new Error('冲销必须填写原因');
      err.statusCode = 400;
      throw err;
    }
    const rDate = reversalDate || new Date().toISOString().slice(0, 10);
    const rMonth = reversalMonth && /^\d{4}-\d{2}$/.test(reversalMonth) ? reversalMonth : rDate.slice(0, 7);

    return this.transaction(() => {
      const orig = this.db.prepare('SELECT * FROM defect_fees WHERE id = ?').get(feeId);
      if (!orig) {
        const err = new Error('未找到原缺陷费记录');
        err.statusCode = 404;
        throw err;
      }
      if (orig.reversed_fee_id) {
        const err = new Error('冲销记录不可再次冲销');
        err.statusCode = 400;
        throw err;
      }

      const existingRev = this.db.prepare('SELECT * FROM defect_fees WHERE reversed_fee_id = ?').get(feeId);
      if (existingRev) {
        const existingAllocs = this.db.prepare('SELECT * FROM defect_fee_allocations WHERE fee_id = ?').all(existingRev.id);
        return { reversal: existingRev, allocations: existingAllocs, deduplicated: true };
      }

      const origAllocs = this.db.prepare('SELECT * FROM defect_fee_allocations WHERE fee_id = ?').all(feeId);
      const revId = randomUUID();
      const negMinor = -BigInt(orig.total_minor);
      const negAmount = formatMinor(negMinor, currencyDecimals(orig.currency));
      const now = new Date().toISOString();

      this.db.prepare(`
        INSERT INTO defect_fees (
          id, source_bill_no, source_line_no, currency, occurred_date, booking_month,
          total_minor, total_amount, carrier_id, carrier_name, responsibility_basis,
          status, reversed_fee_id, reversal_reason, operator, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        revId,
        `${orig.source_bill_no}#REV`,
        `${orig.source_line_no}#REV`,
        orig.currency,
        rDate,
        rMonth,
        negMinor.toString(),
        negAmount,
        orig.carrier_id,
        orig.carrier_name,
        orig.responsibility_basis,
        'reversed',
        orig.id,
        String(reason).trim(),
        String(operator),
        now
      );

      const insertAlloc = this.db.prepare(`
        INSERT INTO defect_fee_allocations (
          id, fee_id, sid, fba_shipment_id, leg_id, carrier_id, currency,
          allocated_minor, allocated_amount, weight_basis
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const savedAllocs = [];
      for (const a of origAllocs) {
        const aNegMinor = -BigInt(a.allocated_minor);
        const aNegAmt = formatMinor(aNegMinor, currencyDecimals(a.currency));
        const allocId = randomUUID();
        insertAlloc.run(
          allocId, revId, a.sid, a.fba_shipment_id, a.leg_id, a.carrier_id, a.currency,
          aNegMinor.toString(), aNegAmt, a.weight_basis
        );
        savedAllocs.push({
          id: allocId, fee_id: revId, sid: a.sid, fba_shipment_id: a.fba_shipment_id,
          leg_id: a.leg_id, carrier_id: a.carrier_id, currency: a.currency,
          allocated_minor: aNegMinor.toString(), allocated_amount: aNegAmt
        });
      }

      const reversal = this.db.prepare('SELECT * FROM defect_fees WHERE id = ?').get(revId);
      return { reversal, allocations: savedAllocs, deduplicated: false };
    });
  }

  listDefectFees({ bookingMonth, carrierId, sid, fbaShipmentId } = {}) {
    const conds = [];
    const params = [];
    if (bookingMonth) { conds.push('f.booking_month = ?'); params.push(bookingMonth); }
    if (carrierId) { conds.push('f.carrier_id = ?'); params.push(carrierId); }
    if (sid && fbaShipmentId) {
      conds.push('EXISTS (SELECT 1 FROM defect_fee_allocations a WHERE a.fee_id = f.id AND a.sid = ? AND a.fba_shipment_id = ?)');
      params.push(String(sid), String(fbaShipmentId));
    }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const fees = this.db.prepare(`SELECT f.* FROM defect_fees f ${where} ORDER BY f.booking_month DESC, f.created_at DESC`).all(...params);
    if (!fees.length) return [];
    const allocStmt = this.db.prepare('SELECT * FROM defect_fee_allocations WHERE fee_id = ?');
    return fees.map(f => ({
      ...f,
      allocations: allocStmt.all(f.id)
    }));
  }

  /**
   * List enriched shipments with legs, pricing, arrival evaluation, and verified/pending defect fee sums.
   */
  listShipments({ sid, planId, batchGroupId, carrierId, status, limit = 500, offset = 0, now = new Date().toISOString() } = {}) {
    const conds = [];
    const params = [];
    if (sid && sid !== 'all') { conds.push('s.sid = ?'); params.push(String(sid)); }
    if (planId) { conds.push('s.plan_id = ?'); params.push(String(planId)); }
    if (batchGroupId) { conds.push('s.batch_group_id = ?'); params.push(String(batchGroupId)); }
    if (carrierId) {
      conds.push(`EXISTS (
        SELECT 1 FROM shipment_legs l
        LEFT JOIN leg_carrier_bindings b ON b.leg_id = l.id
        WHERE l.sid = s.sid AND l.fba_shipment_id = s.fba_shipment_id
          AND COALESCE(b.carrier_id, l.carrier_id) = ?
      )`);
      params.push(String(carrierId));
    }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const totalRow = this.db.prepare(`SELECT COUNT(*) AS cnt FROM shipments s ${where}`).get(...params);
    const rows = this.db.prepare(
      `SELECT s.* FROM shipments s ${where} ORDER BY s.source_updated_at DESC, s.fba_shipment_id ASC LIMIT ? OFFSET ?`
    ).all(...params, Number(limit), Number(offset));

    if (!rows.length) {
      return { total: Number(totalRow.cnt), items: [] };
    }

    const legStmt = this.db.prepare(`
      SELECT l.*,
        b.carrier_id AS b_carrier_id, b.carrier_name AS b_carrier_name,
        b.manual_tracking_no AS b_manual_tracking_no, b.binding_source AS b_binding_source,
        b.note AS b_note, b.operator AS b_operator, b.updated_at AS b_updated_at,
        p.currency AS p_currency, p.unit_price_scaled AS p_unit_price_scaled, p.unit_price_formatted AS p_unit_price_formatted,
        p.calculated_minor AS p_calculated_minor, p.calculated_amount AS p_calculated_amount,
        p.effective_minor AS p_effective_minor, p.effective_amount AS p_effective_amount,
        p.override_delta_minor AS p_override_delta_minor, p.override_delta AS p_override_delta,
        p.is_overridden AS p_is_overridden, p.override_reason AS p_override_reason,
        p.override_by AS p_override_by, p.override_at AS p_override_at,
        p.source_weight_changed AS p_source_weight_changed, p.previous_weight_formatted AS p_previous_weight_formatted,
        p.version AS p_version, p.updated_at AS p_updated_at
      FROM shipment_legs l
      LEFT JOIN leg_carrier_bindings b ON b.leg_id = l.id
      LEFT JOIN leg_pricing p ON p.leg_id = l.id
      WHERE l.sid = ? AND l.fba_shipment_id = ?
      ORDER BY l.id ASC
    `);

    const feeStmt = this.db.prepare(`
      SELECT a.*, f.status AS fee_status, f.source_bill_no, f.source_line_no, f.booking_month, f.occurred_date, f.reversed_fee_id
      FROM defect_fee_allocations a
      JOIN defect_fees f ON f.id = a.fee_id
      WHERE a.sid = ? AND a.fba_shipment_id = ?
    `);

    const items = [];
    for (const s of rows) {
      const arrival = evaluateArrival({
        promisedStart: s.promised_start,
        promisedEnd: s.promised_end,
        destTimezone: s.dest_timezone,
        signedAt: s.signed_at,
        firstReceivedAt: s.first_received_at,
        putawayAt: s.putaway_at,
        actualDeliveredAt: s.actual_delivered_at,
        actualEventSource: s.actual_event_source,
        now
      });
      if (status && status !== 'all' && arrival.status !== status) continue;

      const legs = legStmt.all(s.sid, s.fba_shipment_id).map(l => {
        const effectiveCarrierId = l.b_carrier_id || l.carrier_id;
        const effectiveCarrierName = l.b_carrier_name || l.carrier_name;
        const effectiveTrackingNo = l.b_manual_tracking_no || l.tracking_no;
        return {
        id: l.id,
        sid: l.sid,
        fbaShipmentId: l.fba_shipment_id,
        shipmentSn: l.shipment_sn,
        logisticsRecordId: l.logistics_record_id,
        carrierId: effectiveCarrierId,
        carrierName: effectiveCarrierName,
        trackingNo: effectiveTrackingNo,
        sourceCarrierId: l.carrier_id,
        sourceCarrierName: l.carrier_name,
        sourceTrackingNo: l.tracking_no,
        carrierBinding: l.b_carrier_id ? {
          carrierId: l.b_carrier_id,
          carrierName: l.b_carrier_name,
          manualTrackingNo: l.b_manual_tracking_no,
          bindingSource: l.b_binding_source,
          note: l.b_note,
          operator: l.b_operator,
          updatedAt: l.b_updated_at
        } : null,
        routeLane: l.route_lane,
        serviceLevel: l.service_level,
        pricingScope: l.pricing_scope,
        weightScaled: l.weight_scaled,
        weightFormatted: l.weight_formatted,
        weightUnit: l.weight_unit,
        weightSource: l.weight_source,
        settlementBlocked: Boolean(l.settlement_blocked),
        blockReason: l.block_reason,
        pricing: l.p_version != null ? {
          currency: l.p_currency,
          unitPriceFormatted: l.p_unit_price_formatted,
          calculatedMinor: l.p_calculated_minor,
          calculatedAmount: l.p_calculated_amount,
          effectiveMinor: l.p_effective_minor,
          effectiveAmount: l.p_effective_amount,
          overrideDeltaMinor: l.p_override_delta_minor,
          overrideDelta: l.p_override_delta,
          isOverridden: Boolean(l.p_is_overridden),
          overrideReason: l.p_override_reason,
          overrideBy: l.p_override_by,
          overrideAt: l.p_override_at,
          sourceWeightChanged: Boolean(l.p_source_weight_changed),
          previousWeightFormatted: l.p_previous_weight_formatted,
          version: l.p_version,
          updatedAt: l.p_updated_at
        } : null
      };
      });

      const feeAllocs = feeStmt.all(s.sid, s.fba_shipment_id);
      const verifiedByCurrency = new Map();
      const pendingByCurrency = new Map();
      for (const a of feeAllocs) {
        const targetMap = (a.fee_status === 'verified' || a.fee_status === 'reversed')
          ? verifiedByCurrency
          : pendingByCurrency;
        targetMap.set(a.currency, (targetMap.get(a.currency) || 0n) + BigInt(a.allocated_minor));
      }

      const verifiedDefectFees = Object.fromEntries(
        [...verifiedByCurrency.entries()].map(([c, m]) => [c, formatMinor(m, currencyDecimals(c))])
      );
      const pendingDefectFees = Object.fromEntries(
        [...pendingByCurrency.entries()].map(([c, m]) => [c, formatMinor(m, currencyDecimals(c))])
      );

      items.push({
        sid: s.sid,
        fbaShipmentId: s.fba_shipment_id,
        shipmentSn: s.shipment_sn,
        planId: s.plan_id,
        batchGroupId: s.batch_group_id,
        shipmentName: s.shipment_name,
        destFc: s.dest_fc,
        destCountry: s.dest_country,
        destTimezone: s.dest_timezone,
        routeLane: s.route_lane,
        serviceLevel: s.service_level,
        shippedAt: s.shipped_at,
        promisedStart: s.promised_start,
        promisedEnd: s.promised_end,
        signedAt: s.signed_at,
        firstReceivedAt: s.first_received_at,
        putawayAt: s.putaway_at,
        actualDeliveredAt: s.actual_delivered_at,
        actualEventSource: s.actual_event_source,
        arrival,
        weightScaled: s.weight_scaled,
        weightFormatted: s.weight_formatted,
        weightUnit: s.weight_unit,
        weightSource: s.weight_source,
        settlementBlocked: Boolean(s.settlement_blocked),
        blockReason: s.block_reason,
        warningDefectAmount: s.warning_defect_amount,
        warningDefectCurrency: s.warning_defect_currency,
        verifiedDefectFees,
        pendingDefectFees,
        defectFeeLines: feeAllocs,
        sourceVersion: s.source_version,
        sourceUpdatedAt: s.source_updated_at,
        collectedAt: s.collected_at,
        mappingVersion: s.mapping_version,
        dataMode: s.data_mode,
        legs
      });
    }

    return { total: status && status !== 'all' ? items.length : Number(totalRow.cnt), items };
  }

  /**
   * Batch / plan grouping summary (US same-plan anomaly detection).
   */
  listBatches({ sid, now = new Date().toISOString() } = {}) {
    const { items } = this.listShipments({ sid, limit: 5000, offset: 0, now });
    const groups = new Map();
    for (const item of items) {
      if (!item.batchGroupId) continue; // Shipments without planId/batchGroupId are NOT merged by day!
      if (!groups.has(item.batchGroupId)) {
        groups.set(item.batchGroupId, {
          batchGroupId: item.batchGroupId,
          sid: item.sid,
          planId: item.planId,
          destCountry: item.destCountry,
          destTimezone: item.destTimezone,
          shipments: [],
          onTimeCount: 0,
          earlyCount: 0,
          delayedCount: 0,
          overdueCount: 0,
          inTransitCount: 0,
          anomalyShipments: []
        });
      }
      const g = groups.get(item.batchGroupId);
      g.shipments.push(item);
      if (item.arrival.status === 'on_time') g.onTimeCount += 1;
      else if (item.arrival.status === 'early') g.earlyCount += 1;
      else if (item.arrival.status === 'delayed') {
        g.delayedCount += 1;
        g.anomalyShipments.push({
          fbaShipmentId: item.fbaShipmentId,
          deviationDays: item.arrival.deviationDays,
          carriers: item.legs.map(l => ({ carrierId: l.carrierId, carrierName: l.carrierName, legId: l.id, trackingNo: l.trackingNo }))
        });
      } else if (item.arrival.status === 'overdue') {
        g.overdueCount += 1;
        g.anomalyShipments.push({
          fbaShipmentId: item.fbaShipmentId,
          deviationDays: item.arrival.deviationDays,
          carriers: item.legs.map(l => ({ carrierId: l.carrierId, carrierName: l.carrierName, legId: l.id, trackingNo: l.trackingNo }))
        });
      } else if (item.arrival.status === 'in_transit') {
        g.inTransitCount += 1;
      }
    }
    return [...groups.values()];
  }

  getStats() {
    const shipmentCount = Number(this.db.prepare('SELECT COUNT(*) AS cnt FROM shipments').get().cnt);
    const legCount = Number(this.db.prepare('SELECT COUNT(*) AS cnt FROM shipment_legs').get().cnt);
    const feeCount = Number(this.db.prepare('SELECT COUNT(*) AS cnt FROM defect_fees').get().cnt);
    const statementCount = Number(this.db.prepare('SELECT COUNT(*) AS cnt FROM monthly_statements').get().cnt);
    const modeRow = this.db.prepare('SELECT data_mode, MAX(collected_at) AS last_collected FROM shipments').get();
    return {
      shipmentCount,
      legCount,
      feeCount,
      statementCount,
      dataMode: modeRow?.data_mode || null,
      lastSyncedAt: modeRow?.last_collected || null
    };
  }
}

export function openLogisticsStore(directory, dbName = 'logistics.db') {
  return new LogisticsStore(join(directory, dbName));
}


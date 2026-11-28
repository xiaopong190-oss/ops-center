// Server-side paginated Lingxing FBA shipment & dispatch detail sync engine.
// Features:
// - Per-shop & updated-time window pagination
// - Cursor advances ONLY AFTER page persistence transaction commits
// - Interrupt & resume from saved cursor
// - Out-of-order / duplicate page safe (version-guarded idempotent upsert)
// - HTTP 429 / Lingxing 3001008 retry with exponential backoff

import { mapLingxingShipment } from './domain.mjs';

export const FBA_SHIPMENT_LIST_PATH = '/erp/sc/data/fba_report/shipmentList';
export const FBA_DISPATCH_LIST_PATH = '/erp/sc/routing/storage/shipment/getInboundShipmentList';
export const FBA_SHIPMENT_DETAIL_PATH = '/erp/sc/routing/storage/shipment/getInboundShipmentListMwsDetail';

function extractDetailShipmentIds(detail) {
  const ids = new Set();
  if (!detail || typeof detail !== 'object') return ids;
  if (detail.shipment_id) ids.add(String(detail.shipment_id).trim());
  if (detail.fba_shipment_id) ids.add(String(detail.fba_shipment_id).trim());
  if (detail.rel_shipment_id) ids.add(String(detail.rel_shipment_id).trim());
  if (Array.isArray(detail.fba_shipment_ids)) {
    for (const id of detail.fba_shipment_ids) if (id) ids.add(String(id).trim());
  }
  if (Array.isArray(detail.box_list)) {
    for (const b of detail.box_list) {
      if (Array.isArray(b?.box_skus)) {
        for (const sku of b.box_skus) {
          const sid = sku?.shipment_id ?? sku?.fba_shipment_id;
          if (sid) ids.add(String(sid).trim());
        }
      }
    }
  }
  for (const arrKey of ['item_list', 'relate_list', 'shipment_list', 'rel_list']) {
    if (Array.isArray(detail[arrKey])) {
      for (const item of detail[arrKey]) {
        const sid = item?.shipment_id ?? item?.fba_shipment_id ?? item?.rel_shipment_id;
        if (sid) ids.add(String(sid).trim());
      }
    }
  }
  return ids;
}

async function fetchDispatchIndex({ client, shopSid, startDate, endDate, pageSize, pause }) {
  const fbaIdToSns = new Map(); // fba_shipment_id -> Set<shipment_sn>
  const snToFbaIds = new Map(); // shipment_sn -> Set<fba_shipment_id>
  let offset = 0;
  let pages = 0;
  while (pages < 200) {
    const resp = await callWithRetry(
      () => client.read(FBA_DISPATCH_LIST_PATH, {
        sids: shopSid,
        start_date: startDate,
        end_date: endDate,
        offset,
        length: pageSize
      }),
      pause
    );
    const list = Array.isArray(resp?.data) ? resp.data : (Array.isArray(resp?.data?.list) ? resp.data.list : null);
    if (!list) throw new Error('领星发货单列表响应结构无效（缺少 data 或 data.list）');
    for (const row of list) {
      const sn = row?.shipment_sn ? String(row.shipment_sn).trim() : '';
      if (!sn) continue;
      if (!snToFbaIds.has(sn)) snToFbaIds.set(sn, new Set());
      for (const fbaId of extractDetailShipmentIds(row)) {
        snToFbaIds.get(sn).add(fbaId);
        if (!fbaIdToSns.has(fbaId)) fbaIdToSns.set(fbaId, new Set());
        fbaIdToSns.get(fbaId).add(sn);
      }
    }
    offset += list.length;
    pages += 1;
    const total = Number(resp.total ?? resp.data?.total ?? list.length);
    if (list.length === 0 || offset >= total) break;
  }
  return { fbaIdToSns, snToFbaIds };
}

/**
 * Sync FBA shipments & dispatch details for one shop over a time window.
 * Supports resuming from persisted cursor if a previous run was interrupted.
 */
export async function syncShopShipments({
  client,
  store,
  sid,
  startDate,
  endDate,
  pageSize = 200,
  dataMode = 'live',
  maxPages = 2000,
  pause = ms => new Promise(r => setTimeout(r, ms))
}) {
  const shopSid = String(sid).trim();
  if (!/^\d+$/.test(shopSid)) {
    throw new Error(`无效的领星店铺 SID: ${sid}`);
  }
  const windowKey = `${startDate}..${endDate}`;
  const savedCursor = store.getCursor(shopSid, windowKey);
  let offset = savedCursor && !savedCursor.completed ? Number(savedCursor.last_offset) : 0;

  let pagesFetched = 0;
  let totalInsertedOrUpdated = 0;
  let totalSkippedStale = 0;
  let expectedTotal = null;
  let dispatchIndex = null;

  while (pagesFetched < maxPages) {
    const listResp = await callWithRetry(
      () => client.read(FBA_SHIPMENT_LIST_PATH, {
        sid: shopSid,
        start_date: startDate,
        end_date: endDate,
        offset,
        length: pageSize
      }),
      pause
    );

    if (!listResp || !listResp.data || typeof listResp.data !== 'object' || Array.isArray(listResp.data) || !Array.isArray(listResp.data.list)) {
      throw new Error('领星 FBA 货件列表响应结构无效（缺少 data.list 数组）');
    }
    const rawList = listResp.data.list;
    const rawTotal = listResp.total ?? listResp.data.total;
    const pageTotal = Number(rawTotal);
    if (rawTotal == null || !Number.isSafeInteger(pageTotal) || pageTotal < 0) {
      throw new Error('领星 FBA 货件列表分页 total 缺失或无效');
    }
    expectedTotal = pageTotal;

    const rows = rawList.filter(r => String(r.sid ?? r.store_id ?? shopSid) === shopSid);

    // If official shipmentList rows lack shipment_sn, query the dispatch order list
    // (getInboundShipmentList) to match shipment_sn via real FBA shipment_id association keys.
    const hasMissingSn = rows.some(r => !r.shipment_sn);
    if (hasMissingSn && dispatchIndex === null) {
      dispatchIndex = await fetchDispatchIndex({ client, shopSid, startDate, endDate, pageSize, pause });
    }

    // Fetch dispatch details individually per shipment_sn using official contract:
    // POST /erp/sc/routing/storage/shipment/getInboundShipmentListMwsDetail with { shipment_sn }
    const snSet = new Set();
    const detailBySn = new Map();
    const detailByFbaId = new Map();
    const snShipmentIds = new Map(); // shipment_sn -> Set<fba_shipment_id>

    for (const raw of rows) {
      const fbaId = String(raw.shipment_id ?? raw.fba_shipment_id ?? raw.shipmentId ?? '').trim();
      const matchedSns = [];
      if (raw.shipment_sn) matchedSns.push(String(raw.shipment_sn).trim());
      if (fbaId && dispatchIndex?.fbaIdToSns?.has(fbaId)) {
        for (const sn of dispatchIndex.fbaIdToSns.get(fbaId)) {
          if (!matchedSns.includes(sn)) matchedSns.push(sn);
        }
      }
      for (const sn of matchedSns) {
        snSet.add(sn);
        if (!snShipmentIds.has(sn)) snShipmentIds.set(sn, new Set());
        if (fbaId) snShipmentIds.get(sn).add(fbaId);
        if (dispatchIndex?.snToFbaIds?.has(sn)) {
          for (const linked of dispatchIndex.snToFbaIds.get(sn)) snShipmentIds.get(sn).add(linked);
        }
      }
    }

    for (const sn of snSet) {
      const detailResp = await callWithRetry(
        () => client.read(FBA_SHIPMENT_DETAIL_PATH, { shipment_sn: sn }),
        pause
      );
      if (!detailResp || !detailResp.data || typeof detailResp.data !== 'object' || Array.isArray(detailResp.data)) {
        throw new Error('领星发货单详情响应结构无效（data 应为对象）');
      }
      const d = detailResp.data;
      detailBySn.set(sn, d);
      const linkedIds = extractDetailShipmentIds(d);
      if (!snShipmentIds.has(sn)) snShipmentIds.set(sn, new Set());
      for (const fbaId of linkedIds) {
        snShipmentIds.get(sn).add(fbaId);
        if (!detailByFbaId.has(fbaId)) detailByFbaId.set(fbaId, d);
      }
    }

    const collectedAt = new Date().toISOString();
    const normalized = [];
    for (const raw of rows) {
      const fbaId = String(raw.shipment_id ?? raw.fba_shipment_id ?? raw.shipmentId ?? '').trim();
      if (!fbaId) continue;
      let sn = raw.shipment_sn ? String(raw.shipment_sn).trim() : null;
      if (!sn && dispatchIndex?.fbaIdToSns?.has(fbaId)) {
        sn = [...dispatchIndex.fbaIdToSns.get(fbaId)][0] || null;
      }
      const detail = (sn ? detailBySn.get(sn) : null) || detailByFbaId.get(fbaId) || null;
      const effectiveSn = sn || (detail?.shipment_sn ? String(detail.shipment_sn).trim() : null);
      const dispatchShipmentCount = effectiveSn ? (snShipmentIds.get(effectiveSn)?.size || 1) : 1;
      normalized.push(mapLingxingShipment(
        effectiveSn && !raw.shipment_sn ? { ...raw, shipment_sn: effectiveSn } : raw,
        detail,
        { sid: shopSid, collectedAt, dispatchShipmentCount }
      ));
    }

    const nextOffset = offset + rawList.length;
    const isCompleted = rawList.length === 0 || nextOffset >= expectedTotal;
    const latestSourceUpdated = normalized.reduce(
      (max, item) => (item.sourceUpdatedAt > max ? item.sourceUpdatedAt : max),
      ''
    ) || null;

    // Persist page AND advance cursor atomically in one transaction
    const stats = store.upsertShipmentsPage(normalized, {
      dataMode,
      cursor: {
        sid: shopSid,
        windowKey,
        lastOffset: nextOffset,
        lastSourceUpdatedAt: latestSourceUpdated,
        completed: isCompleted
      }
    });

    totalInsertedOrUpdated += stats.insertedOrUpdated;
    totalSkippedStale += stats.skippedStale;
    pagesFetched += 1;
    offset = nextOffset;

    if (isCompleted) break;
    if (rawList.length === 0 && offset < expectedTotal) {
      throw new Error(`领星 FBA 货件分页中断（已读 ${offset} / 共 ${expectedTotal}）`);
    }
  }

  return {
    sid: shopSid,
    windowKey,
    pagesFetched,
    expectedTotal,
    insertedOrUpdated: totalInsertedOrUpdated,
    skippedStale: totalSkippedStale,
    resumedFromOffset: savedCursor && !savedCursor.completed ? Number(savedCursor.last_offset) : 0
  };
}

async function callWithRetry(fn, pause, maxAttempts = 4) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const msg = String(err?.message || '');
      const retryable = err?.status === 429 || /\b429\b|3001008|rate.?limit/i.test(msg);
      if (!retryable || attempt >= maxAttempts - 1) throw err;
      const backoffMs = Math.min(4000, 100 * (2 ** attempt));
      await pause(backoffMs);
      attempt += 1;
    }
  }
}

/**
 * Sync all shops from Lingxing client.
 */
export async function syncAllShops({
  client,
  store,
  startDate,
  endDate,
  pageSize = 200,
  dataMode = 'live',
  pause
}) {
  const { data: shops } = await client.read('/erp/sc/data/seller/lists', {});
  if (!Array.isArray(shops)) {
    throw new Error('领星店铺列表响应结构无效');
  }
  const results = [];
  for (const s of shops) {
    const sid = String(s.sid);
    if (!/^\d+$/.test(sid)) continue;
    const res = await syncShopShipments({
      client,
      store,
      sid,
      startDate,
      endDate,
      pageSize,
      dataMode,
      pause
    });
    results.push({ ...res, shopName: s.name || sid });
  }
  return {
    dataMode,
    syncedAt: new Date().toISOString(),
    shopCount: results.length,
    results
  };
}


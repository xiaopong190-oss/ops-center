// Server-side paginated Lingxing FBA shipment & dispatch detail sync engine.
// Features:
// - Per-shop & updated-time window pagination
// - Cursor advances ONLY AFTER page persistence transaction commits
// - Interrupt & resume from saved cursor
// - Out-of-order / duplicate page safe (version-guarded idempotent upsert)
// - HTTP 429 / Lingxing 3001008 retry with exponential backoff

import { mapLingxingShipment } from './domain.mjs';

export const FBA_SHIPMENT_LIST_PATH = '/erp/sc/routing/storage/shipment/getInboundShipmentList';
export const FBA_SHIPMENT_DETAIL_PATH = '/erp/sc/routing/storage/shipment/getInboundShipmentListMwsDetailList';

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

  while (pagesFetched < maxPages) {
    const listResp = await callWithRetry(
      () => client.read(FBA_SHIPMENT_LIST_PATH, {
        sid: Number(shopSid),
        start_date: startDate,
        end_date: endDate,
        offset,
        length: pageSize
      }),
      pause
    );

    if (!listResp || !Array.isArray(listResp.data)) {
      throw new Error('领星 FBA 货件列表响应结构无效（缺少 data 数组）');
    }
    const pageTotal = Number(listResp.total);
    if (!Number.isSafeInteger(pageTotal) || pageTotal < 0) {
      throw new Error('领星 FBA 货件列表分页 total 缺失或无效');
    }
    expectedTotal = pageTotal;

    const rows = listResp.data.filter(r => String(r.sid ?? r.store_id ?? shopSid) === shopSid);

    // Fetch dispatch details in batches of 50 by shipment_sn if available
    const snSet = [...new Set(rows.map(r => r.shipment_sn).filter(Boolean))];
    const detailBySn = new Map();
    const detailByFbaId = new Map();

    for (let i = 0; i < snSet.length; i += 50) {
      const batchSn = snSet.slice(i, i + 50);
      const detailResp = await callWithRetry(
        () => client.read(FBA_SHIPMENT_DETAIL_PATH, { shipment_sn_arr: batchSn }),
        pause
      );
      if (!detailResp || !Array.isArray(detailResp.data)) {
        throw new Error('领星发货单详情响应结构无效（缺少 data 数组）');
      }
      for (const d of detailResp.data) {
        if (d.shipment_sn) detailBySn.set(String(d.shipment_sn), d);
        if (d.shipment_id || d.fba_shipment_id) {
          detailByFbaId.set(String(d.shipment_id || d.fba_shipment_id), d);
        }
      }
    }

    const collectedAt = new Date().toISOString();
    const normalized = [];
    for (const raw of rows) {
      const fbaId = String(raw.shipment_id ?? raw.fba_shipment_id ?? raw.shipmentId ?? '').trim();
      if (!fbaId) continue;
      const detail = detailByFbaId.get(fbaId) || (raw.shipment_sn ? detailBySn.get(String(raw.shipment_sn)) : null) || null;
      normalized.push(mapLingxingShipment(raw, detail, { sid: shopSid, collectedAt }));
    }

    const nextOffset = offset + listResp.data.length;
    const isCompleted = listResp.data.length === 0 || nextOffset >= expectedTotal;
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
    if (listResp.data.length === 0 && offset < expectedTotal) {
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


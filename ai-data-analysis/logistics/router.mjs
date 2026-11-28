// HTTP API router for /api/logistics/* mounted on the shared gateway (shared/server.mjs).

import { openLogisticsStore } from './store.mjs';
import { syncAllShops } from './sync.mjs';
import { createDemoLogisticsClient, seedDemoPricingAndFees } from './demo-data.mjs';
import {
  runMonthlySettlement,
  confirmStatement,
  listStatements,
  getStatementById,
  exportStatementCsv,
  startMonthlyScheduler,
  previousMonthInTimezone
} from './settlement.mjs';
import { queryCarrierRatings } from './rating.mjs';

async function readJsonBody(req, maxBytes = 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const err = new Error('请求体过大');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const err = new Error('JSON 格式无效');
    err.statusCode = 400;
    throw err;
  }
}

export function createLogisticsRouter({ directory, client = null, providers = null, demo = false, enableScheduler = true }) {
  const store = openLogisticsStore(directory);
  const scheduler = enableScheduler ? startMonthlyScheduler(store) : null;
  let activeSync = null;

  function resolveClient(requestedMode) {
    const useDemo = requestedMode === 'demo' || (demo && requestedMode !== 'live');
    if (useDemo) {
      return { effectiveClient: createDemoLogisticsClient(), dataMode: 'demo' };
    }
    // Try live client if configured
    if (client && !demo) {
      return { effectiveClient: client, dataMode: 'live' };
    }
    const desc = providers?.describe?.();
    const selectedProvider = desc?.providers?.find(p => p.id === desc.selected);
    if (selectedProvider?.configured && providers?.source) {
      return { effectiveClient: providers.source, dataMode: 'live' };
    }
    return { effectiveClient: null, dataMode: 'unconfigured' };
  }

  async function handle(req, res, url, send) {
    const path = url.pathname;
    if (!path.startsWith('/api/logistics')) return false;

    if (req.headers['sec-fetch-site'] === 'cross-site') {
      send(403, { error: '仅支持系统内同源访问' });
      return true;
    }

    if (req.method === 'POST' && !req.headers['content-type']?.startsWith('application/json')) {
      send(415, { error: '需要 application/json 请求' });
      return true;
    }

    try {
      // GET /api/logistics/overview
      if (path === '/api/logistics/overview' && req.method === 'GET') {
        const stats = store.getStats();
        const cfg = store.getConfig();
        const desc = providers?.describe?.() || null;
        const selectedProvider = desc?.providers?.find(p => p.id === desc.selected);
        const liveConfigured = Boolean((!demo && client) || selectedProvider?.configured);
        send(200, {
          ...stats,
          demo,
          liveConfigured,
          config: cfg,
          suggestedSettlementMonth: previousMonthInTimezone(new Date().toISOString(), cfg.settlementTimezone)
        });
        return true;
      }

      // POST /api/logistics/sync
      if (path === '/api/logistics/sync' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const mode = body.mode || (demo ? 'demo' : 'live');
        const { effectiveClient, dataMode } = resolveClient(mode);
        if (!effectiveClient) {
          send(503, {
            error: '领星真实凭据尚未配置，请在「API 与模型接入」配置后重试，或使用演示模式同步',
            liveConfigured: false
          });
          return true;
        }
        const endDate = body.endDate || new Date().toISOString().slice(0, 10);
        const startDate = body.startDate || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

        activeSync ??= syncAllShops({
          client: effectiveClient,
          store,
          startDate,
          endDate,
          pageSize: Number(body.pageSize) || 200,
          dataMode
        }).then(result => {
          if (dataMode === 'demo' && body.seedDemoPricing !== false) {
            seedDemoPricingAndFees(store);
          }
          return result;
        }).finally(() => { activeSync = null; });

        const result = await activeSync;
        send(200, result);
        return true;
      }

      // GET /api/logistics/shipments
      if (path === '/api/logistics/shipments' && req.method === 'GET') {
        const result = store.listShipments({
          sid: url.searchParams.get('sid') || 'all',
          planId: url.searchParams.get('planId') || undefined,
          batchGroupId: url.searchParams.get('batchGroupId') || undefined,
          carrierId: url.searchParams.get('carrierId') || undefined,
          status: url.searchParams.get('status') || 'all',
          limit: Number(url.searchParams.get('limit') || 500),
          offset: Number(url.searchParams.get('offset') || 0),
          now: url.searchParams.get('now') || undefined
        });
        send(200, result);
        return true;
      }

      // GET /api/logistics/batches
      if (path === '/api/logistics/batches' && req.method === 'GET') {
        const batches = store.listBatches({
          sid: url.searchParams.get('sid') || 'all',
          now: url.searchParams.get('now') || undefined
        });
        send(200, { batches });
        return true;
      }

      // POST /api/logistics/pricing
      if (path === '/api/logistics/pricing' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const saved = store.saveLegPricing({
          legId: body.legId,
          unitPrice: body.unitPrice,
          priceUnit: body.priceUnit,
          currency: body.currency,
          manualOverrideAmount: body.manualOverrideAmount ?? null,
          overrideReason: body.overrideReason ?? null,
          operator: body.operator || 'operator',
          expectedVersion: body.expectedVersion
        });
        send(200, { pricing: saved });
        return true;
      }

      // GET /api/logistics/pricing/audit?legId=...
      if (path === '/api/logistics/pricing/audit' && req.method === 'GET') {
        const legId = url.searchParams.get('legId');
        if (!legId) {
          send(400, { error: '缺少 legId 参数' });
          return true;
        }
        send(200, { audit: store.getPricingAudit(legId) });
        return true;
      }

      // GET /api/logistics/defect-fees
      if (path === '/api/logistics/defect-fees' && req.method === 'GET') {
        const fees = store.listDefectFees({
          bookingMonth: url.searchParams.get('bookingMonth') || undefined,
          carrierId: url.searchParams.get('carrierId') || undefined,
          sid: url.searchParams.get('sid') || undefined,
          fbaShipmentId: url.searchParams.get('fbaShipmentId') || undefined
        });
        send(200, { fees });
        return true;
      }

      // POST /api/logistics/defect-fees
      if (path === '/api/logistics/defect-fees' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const result = store.recordDefectFee({
          sourceBillNo: body.sourceBillNo,
          sourceLineNo: body.sourceLineNo,
          currency: body.currency,
          occurredDate: body.occurredDate,
          bookingMonth: body.bookingMonth,
          totalAmount: body.totalAmount,
          carrierId: body.carrierId,
          carrierName: body.carrierName,
          responsibilityBasis: body.responsibilityBasis,
          status: body.status,
          targets: body.targets || [],
          operator: body.operator || 'operator'
        });
        send(200, result);
        return true;
      }

      // POST /api/logistics/defect-fees/reverse
      if (path === '/api/logistics/defect-fees/reverse' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const result = store.reverseDefectFee({
          feeId: body.feeId,
          reversalDate: body.reversalDate,
          reversalMonth: body.reversalMonth,
          reason: body.reason,
          operator: body.operator || 'operator'
        });
        send(200, result);
        return true;
      }

      // GET /api/logistics/settlements
      if (path === '/api/logistics/settlements' && req.method === 'GET') {
        const statements = listStatements(store, {
          periodMonth: url.searchParams.get('periodMonth') || undefined,
          carrierId: url.searchParams.get('carrierId') || undefined,
          status: url.searchParams.get('status') || undefined
        });
        send(200, { statements });
        return true;
      }

      // POST /api/logistics/settlements/run
      if (path === '/api/logistics/settlements/run' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const cfg = store.getConfig();
        const periodMonth = body.periodMonth || previousMonthInTimezone(new Date().toISOString(), cfg.settlementTimezone);
        const result = runMonthlySettlement(store, periodMonth, {
          triggerType: body.triggerType || 'manual',
          settlementTimezone: body.settlementTimezone
        });
        send(200, result);
        return true;
      }

      // POST /api/logistics/settlements/confirm
      if (path === '/api/logistics/settlements/confirm' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const statement = confirmStatement(store, body.statementId, body.operator || 'finance');
        send(200, { statement });
        return true;
      }

      // GET /api/logistics/settlements/:id/export?format=csv|json
      const exportMatch = /^\/api\/logistics\/settlements\/([^/]+)\/export$/.exec(path);
      if (exportMatch && req.method === 'GET') {
        const id = decodeURIComponent(exportMatch[1]);
        const stmt = getStatementById(store, id);
        if (!stmt) {
          send(404, { error: '对账单不存在' });
          return true;
        }
        const format = (url.searchParams.get('format') || 'csv').toLowerCase();
        if (format === 'json') {
          send(200, stmt);
          return true;
        }
        const csv = exportStatementCsv(stmt);
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${id.replace(/[^\w.-]/g, '_')}.csv"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer'
        });
        res.end('\uFEFF' + csv);
        return true;
      }

      // GET /api/logistics/ratings
      if (path === '/api/logistics/ratings' && req.method === 'GET') {
        const result = queryCarrierRatings(store, {
          periodFrom: url.searchParams.get('periodFrom') || null,
          periodTo: url.searchParams.get('periodTo') || null,
          now: url.searchParams.get('now') || undefined
        });
        send(200, result);
        return true;
      }

      // POST /api/logistics/config
      if (path === '/api/logistics/config' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const updated = store.updateConfig(body);
        send(200, { config: updated });
        return true;
      }

      send(404, { error: '未找到物流接口' });
      return true;
    } catch (err) {
      const status = err.statusCode || 400;
      send(status, { error: err.message || '物流服务处理失败' });
      return true;
    }
  }

  function close() {
    scheduler?.stop?.();
    store.close();
  }

  return { handle, store, scheduler, close };
}


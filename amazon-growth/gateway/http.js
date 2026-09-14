'use strict';

function createGateway({ store, caller, origins }) {
  const allow = new Set(origins || ['http://localhost:8787', 'http://localhost:3210']);

  function allowedOrigin(origin) {
    return origin && allow.has(origin) ? origin : '';
  }

  function applyCors(req, res) {
    const origin = req.headers.origin;
    const echoed = allowedOrigin(origin);
    if (echoed) res.setHeader('Access-Control-Allow-Origin', echoed);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers',
      'Content-Type, Accept, Mcp-Session-Id, X-Mcp-Endpoint, X-Mcp-Key, X-Anthropic-Key, X-Proxy-Token, X-Connection-Id, X-Connection-Admin, X-Evidence-Client');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    return !origin || !!echoed;
  }

  function json(res, code, body) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(store.publicSafe(body)));
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', c => {
        size += c.length;
        if (size > 8 * 1024 * 1024) { reject(Object.assign(new Error('请求体过大'), { status: 413 })); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (!raw) return resolve({});
          const value = JSON.parse(raw);
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
          resolve(value);
        } catch {
          reject(Object.assign(new Error('请求体必须是 JSON 对象'), { status: 400 }));
        }
      });
      req.on('error', reject);
    });
  }

  async function handle(req, res, url) {
    if (url === '/api/evidence/stats' && req.method === 'GET') {
      return json(res, 200, store.stats());
    }
    if (url === '/api/evidence/lookup' && req.method === 'POST') {
      const body = await readBody(req);
      return json(res, 200, store.lookup(body.provider || 'xiyou', body.tool, body.arguments || {}));
    }
    if (url === '/api/evidence/estimate' && req.method === 'POST') {
      const body = await readBody(req);
      return json(res, 200, store.estimate(Array.isArray(body.requests) ? body.requests : []));
    }
    if (url === '/api/evidence/put' && req.method === 'POST') {
      const body = await readBody(req);
      return json(res, 200, store.put({
        provider: body.provider,
        tool: body.tool,
        arguments: body.arguments,
        payload: body.payload,
        error: body.error,
        retrievedAt: body.retrievedAt,
        sourceRunId: body.sourceRunId,
        client: req.headers['x-evidence-client'] || body.client || ''
      }));
    }
    if (url === '/api/evidence/publish' && req.method === 'POST') {
      const body = await readBody(req);
      const items = Array.isArray(body.items) ? body.items : [];
      const result = { stored: 0, skipped: 0, reasons: [] };
      items.forEach(item => {
        const site = store.siteOf(item.arguments || {});
        if (item.site && String(item.site).toUpperCase() !== site) {
          result.skipped += 1;
          result.reasons.push('旧结果不可安全复用：站点不一致');
          return;
        }
        if (!item.tool || !item.arguments || item.payload === undefined) {
          result.skipped += 1;
          result.reasons.push('旧结果不可安全复用：参数不明');
          return;
        }
        store.put(item);
        result.stored += 1;
      });
      return json(res, 200, result);
    }
    if (url === '/api/evidence/export' && req.method === 'POST') {
      const body = await readBody(req);
      return json(res, 200, { refs: store.exportRefs(body.keys || []) });
    }
    if (url === '/api/evidence/call' && req.method === 'POST') {
      const body = await readBody(req);
      const provider = body.provider === 'sellersprite' ? 'sellersprite' : 'xiyou';
      const tool = body.tool;
      const args = body.arguments || {};
      if (!tool) return json(res, 400, { error: '缺少 tool' });
      const client = req.headers['x-evidence-client'] || body.client || '';
      try {
        const out = await store.through(provider, tool, args, async () => {
          const r = await caller.callProvider(provider, tool, args, body.connectionId);
          return { payload: r.payload, source: r.source, events: r.events };
        }, { refresh: !!body.refresh, cacheOnly: !!body.cacheOnly, sourceRunId: body.sourceRunId, client });
        if (body.cacheOnly && !out.hit) return json(res, 200, Object.assign({ hit: false }, out));
        return json(res, 200, {
          key: out.key,
          hit: !!out.hit,
          stale: !!out.stale,
          payload: out.payload,
          retrievedAt: out.retrievedAt,
          expiresAt: out.expiresAt,
          source: out.source,
          events: out.events || [],
          tool,
          provider
        });
      } catch (err) {
        return json(res, 502, { error: err.message || String(err), key: store.evidenceKey(provider, tool, args) });
      }
    }
    return false;
  }

  return { applyCors, handle, allowedOrigin, readBody };
}

module.exports = { createGateway };

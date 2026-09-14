'use strict';
const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { createStore, evidenceKey } = require('../gateway/evidence');
const { createCaller, wrapToolArgs, adaptToolArgs } = require('../gateway/caller');
const { createGateway } = require('../gateway/http');

(async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'xiyou-ev-'));
  let now = Date.parse('2026-09-12T00:00:00Z');
  const store = createStore({ file: path.join(folder, 'cache.json'), now: () => now, persistDelay: 0, memoryOnly: true });

  const a = { marketplace: 'US', asin: 'B0GH78L65N', start_date: '2026-08-01', end_date: '2026-09-08' };
  const b = { marketplace: 'JP', asin: 'B0GH78L65N', start_date: '2026-08-01', end_date: '2026-09-08' };
  const c = { marketplace: 'US', asin: 'B0GH78L65N', start_date: '2026-07-01', end_date: '2026-09-08' };
  assert.notEqual(evidenceKey('xiyou', 'get_asin_bsr_trends', a), evidenceKey('xiyou', 'get_asin_bsr_trends', b), '站点必须隔离');
  assert.notEqual(evidenceKey('xiyou', 'get_asin_bsr_trends', a), evidenceKey('xiyou', 'get_asin_bsr_trends', c), '日期窗口必须隔离');
  assert.equal(evidenceKey('xiyou', 'get_asin_info', { asin: 'B0GH78L65N', marketplace: 'US', apiKey: 'SECRET' }), evidenceKey('xiyou', 'get_asin_info', { asin: 'B0GH78L65N', marketplace: 'US' }));

  let calls = 0;
  const produce = async () => { calls += 1; await new Promise(r => setTimeout(r, 20)); return { payload: { ok: calls }, source: { id: 'a', name: 'A' } }; };
  const [x, y] = await Promise.all([
    store.through('xiyou', 'get_asin_info', a, produce),
    store.through('xiyou', 'get_asin_info', a, produce)
  ]);
  assert.equal(calls, 1, '相同请求并发必须去重');
  assert.equal(x.payload.ok, y.payload.ok);
  const hit = await store.through('xiyou', 'get_asin_info', a, produce);
  assert.equal(calls, 1, '未过期缓存不得再次调用');
  assert.equal(hit.hit, true);

  now += 8 * 3600 * 1000;
  const stale = store.lookup('xiyou', 'get_asin_bsr_trends', a);
  assert.equal(stale.hit, false);
  store.put({ provider: 'xiyou', tool: 'get_asin_bsr_trends', arguments: a, payload: { rank: 1 }, retrievedAt: now - 7 * 3600 * 1000 });
  const daily = store.lookup('xiyou', 'get_asin_bsr_trends', a);
  assert.equal(daily.stale, true, '日级数据 6 小时后过期');

  store.put({ provider: 'xiyou', tool: 'get_asin_info', arguments: a, payload: { title: 'Kettle' } });
  const leaked = JSON.stringify(store.lookup('xiyou', 'get_asin_info', a));
  assert(!/SECRET/.test(leaked), '缓存不得含 Token');
  assert(!/"apiKey"/.test(leaked));

  const est = store.estimate([
    { provider: 'xiyou', tool: 'get_asin_info', arguments: a },
    { provider: 'xiyou', tool: 'get_asin_traffic', arguments: a }
  ]);
  assert.equal(est.hits, 1);
  assert.equal(est.misses, 1);

  let upstream = 0;
  const caller = createCaller({
    registry: {
      list: () => [{ id: 'a', provider: 'xiyou', name: 'A', enabled: true }, { id: 'b', provider: 'xiyou', name: 'B', enabled: true }],
      get: id => ({ id, provider: 'xiyou', name: id, endpoint: 'https://example.invalid/mcp', key: 'hidden-token', authHeader: 'Authorization', authPrefix: 'Bearer ', enabled: true })
    },
    fetchImpl: async (_url, opts) => {
      const body = JSON.parse(opts.body);
      if (body.method === 'initialize') return { ok: true, headers: { get: () => 'sid' }, text: async () => JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { serverInfo: { name: 'x' } } }) };
      if (body.method === 'notifications/initialized') return { ok: true, headers: { get: () => null }, text: async () => '' };
      if (body.method === 'tools/list') return { ok: true, headers: { get: () => 'sid' }, text: async () => JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'get_asin_info' }] } }) };
      upstream += 1;
      if (String(opts.headers.Authorization || '').includes('hidden-token') === false) throw Error('missing auth');
      if (upstream === 1) return { ok: false, status: 429, statusText: 'Too Many Requests', headers: { get: () => null }, text: async () => 'no' };
      return { ok: true, headers: { get: () => 'sid' }, text: async () => JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { structuredContent: { title: 'ok' } } }) };
    }
  });
  const r = await caller.callProvider('xiyou', 'get_asin_info', { marketplace: 'US', asin: 'B0AAAAAAAA' });
  assert.equal(r.payload.title, 'ok');
  assert.equal(r.source.id, 'b');

  const wrapped = wrapToolArgs(
    { type: 'object', required: ['request'], properties: { request: { type: 'object' } } },
    { marketplace: 'US', asin: 'B0AAAAAAAA' }
  );
  assert.deepEqual(wrapped, { request: { marketplace: 'US', asin: 'B0AAAAAAAA' } }, '卖家精灵扁平参数必须包进 request');
  assert.deepEqual(
    wrapToolArgs({ properties: { request: { type: 'object' } } }, { request: { asin: 'B0AAAAAAAA' } }),
    { request: { asin: 'B0AAAAAAAA' } },
    '已包装的参数不得再包一层'
  );
  assert.deepEqual(
    adaptToolArgs(
      { type: 'object', required: ['asins'], properties: { asins: { type: 'array', items: { type: 'string' } }, marketplace: { type: 'string' } } },
      { marketplace: 'US', site: 'US', asin: 'B0AAAAAAAA' }
    ),
    { marketplace: 'US', asins: ['B0AAAAAAAA'] },
    'schema 要 asins 时必须把单个 asin 补成数组，并丢掉 schema 没有的字段'
  );
  assert.deepEqual(
    adaptToolArgs(
      { type: 'object', required: ['asins', 'country'], properties: { asins: { type: 'array', items: { type: 'string' } }, country: { type: 'string' } } },
      { marketplace: 'US', site: 'US', asin: 'B0AAAAAAAA', start_date: '2026-06-15' }
    ),
    { asins: ['B0AAAAAAAA'], country: 'US' },
    'schema 要 country 时必须从 marketplace/site 补上，并丢掉多余日期'
  );
  assert.deepEqual(
    adaptToolArgs(
      { type: 'object', required: ['asins', 'start_month'], properties: { asins: { type: 'array' }, start_month: { type: 'string' }, end_month: { type: 'string' } } },
      { asin: 'B0AAAAAAAA', start_date: '2026-06-15', end_date: '2026-09-12' }
    ),
    { asins: ['B0AAAAAAAA'], start_month: '2026-06', end_month: '2026-09' },
    '月度接口要把日期窗口收成 start_month/end_month'
  );
  const monthNow = new Date();
  const yyyy = monthNow.getUTCMonth() === 0 ? monthNow.getUTCFullYear() - 1 : monthNow.getUTCFullYear();
  const mm = String(monthNow.getUTCMonth() === 0 ? 12 : monthNow.getUTCMonth()).padStart(2, '0');
  const sellerSchema = {
    type: 'object',
    required: ['request'],
    properties: {
      request: {
        type: 'object',
        required: ['asins'],
        properties: {
          marketplace: { type: 'string' },
          asins: { type: 'array' },
          reverseType: { type: 'string' },
          date: { type: 'string' },
          size: { type: 'integer', maximum: 10 }
        }
      }
    }
  };
  assert.deepEqual(
    adaptToolArgs(sellerSchema, { marketplace: 'US', asin: 'B0AAAAAAAA' }).request,
    { marketplace: 'US', asins: ['B0AAAAAAAA'], reverseType: 'M', date: String(yyyy) + mm, size: 10 },
    '卖家精灵出单词/评论要按 schema 补 reverseType、月份和 size'
  );

  const gw = createGateway({ store, caller, origins: ['http://localhost:8787', 'http://localhost:3210'] });
  assert.equal(gw.allowedOrigin('https://attacker.invalid'), '');
  assert.equal(gw.allowedOrigin('http://localhost:3210'), 'http://localhost:3210');
  const fakeRes = { headers: {}, setHeader(k, v) { this.headers[k] = v; } };
  assert.equal(gw.applyCors({ headers: { origin: 'https://attacker.invalid' } }, fakeRes), false);
  assert.equal(gw.applyCors({ headers: { origin: 'http://localhost:3210' } }, fakeRes), true);

  const safe = store.publicSafe({ key: 'xiyou|US|asin|B0GH78L65N|get_asin_info|abc', payload: { title: 'Kettle' } });
  assert.equal(safe.payload.title, 'Kettle');
  assert.throws(() => store.publicSafe({ apiKey: 'sk-real-token-value' }));

  fs.rmSync(folder, { recursive: true, force: true });
  console.log('PASS gateway cache isolation, inflight dedupe, TTL, no token leak, failover, CORS');
})().catch(e => { console.error(e); process.exitCode = 1; });

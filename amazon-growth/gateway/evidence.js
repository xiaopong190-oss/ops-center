'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = 1;
const SECRET_KEY = /^(key|token|authorization|api[_-]?key|secret|password|cookie|proxyToken)$/i;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const TTL = {
  detail: 1 * DAY,
  daily: 6 * HOUR,
  monthly: 1 * DAY,
  category: 7 * DAY,
  review: 14 * DAY
};

const TOOL_TTL = {
  get_asin_info: 'detail',
  get_asin_variations: 'detail',
  keepa_info: 'detail',
  asin_detail_with_coupon_trend: 'detail',
  competitor_lookup: 'detail',
  asin_competitor: 'detail',
  get_asin_traffic: 'daily',
  get_asin_traffic_trends: 'daily',
  get_asin_bsr_trends: 'daily',
  get_asin_keywords: 'daily',
  get_asin_keywords_daily: 'daily',
  get_asin_keyword_rank_trends: 'daily',
  get_asin_keyword_rank_hourly: 'daily',
  get_asin_keyword_traffic_trends: 'daily',
  get_asin_ad_change_trends: 'daily',
  get_asin_info_change_trends: 'daily',
  get_asin_info_trends: 'daily',
  get_keyword_info: 'daily',
  get_keyword_asin_analysis: 'daily',
  get_keyword_advertising_replay: 'daily',
  get_asin_orders_last_30_days: 'monthly',
  get_asin_order_trends: 'monthly',
  get_asin_traffic_trends_weekly: 'monthly',
  get_asin_traffic_trends_monthly: 'monthly',
  get_asin_keywords_monthly: 'monthly',
  asin_sales_trend: 'monthly',
  asin_prediction: 'monthly',
  bsr_prediction: 'monthly',
  keyword_order: 'monthly',
  review: 'review'
};

function ttlMs(tool) {
  if (/^get_category_/.test(tool) || /^market_/.test(tool) || tool === 'product_node' || tool === 'search_market_insight_categories' || tool === 'generate_category_insight_resource') {
    return TTL.category;
  }
  return TTL[TOOL_TTL[tool] || 'daily'];
}

function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  Object.keys(value).sort().forEach(k => {
    if (SECRET_KEY.test(k)) return;
    out[k] = stripSecrets(value[k]);
  });
  return out;
}

function canonical(value) {
  return JSON.stringify(stripSecrets(value == null ? {} : value));
}

function argsHash(args) {
  return crypto.createHash('sha256').update(canonical(args)).digest('hex').slice(0, 16);
}

function pick(obj, names) {
  if (!obj || typeof obj !== 'object') return '';
  for (const name of names) {
    if (obj[name] != null && obj[name] !== '') return obj[name];
    if (obj.request && obj.request[name] != null && obj.request[name] !== '') return obj.request[name];
  }
  return '';
}

function siteOf(args) {
  return String(pick(args, ['marketplace', 'site', 'country', 'country_code']) || 'US').toUpperCase();
}

function entityOf(args) {
  const asin = String(pick(args, ['asin', 'primaryAsin', 'primary_asin']) || '').toUpperCase();
  if (/^[A-Z0-9]{10}$/.test(asin)) return { type: 'asin', id: asin };
  const asins = pick(args, ['asins', 'asinList', 'asin_list']);
  if (Array.isArray(asins) && asins[0]) return { type: 'asin', id: String(asins[0]).toUpperCase() };
  const keyword = String(pick(args, ['keyword', 'keywords', 'search_term', 'q']) || '').trim();
  if (keyword) return { type: 'keyword', id: keyword.toLowerCase() };
  const category = String(pick(args, ['category', 'categoryId', 'category_id', 'nodeIdPath']) || '').trim();
  if (category) return { type: 'category', id: category.toLowerCase() };
  return { type: 'none', id: '-' };
}

function evidenceKey(provider, tool, args) {
  const site = siteOf(args);
  const entity = entityOf(args);
  return [provider || 'xiyou', site, entity.type, entity.id, tool, argsHash(args)].join('|');
}

function createStore(options = {}) {
  const file = options.file || path.join(__dirname, '..', 'proxy', 'evidence-cache.json');
  const nowFn = options.now || (() => Date.now());
  const items = new Map();
  const inflight = new Map();
  const quota = {
    xiyou: { calls: 0, hits: 0, staleHits: 0, errors: 0, inflightJoins: 0 },
    sellersprite: { calls: 0, hits: 0, staleHits: 0, errors: 0, inflightJoins: 0 }
  };
  let persistTimer = null;

  function load() {
    try {
      if (!fs.existsSync(file)) return;
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      (raw.items || []).forEach(item => {
        if (item && item.key && item.payload !== undefined) items.set(item.key, item);
      });
      if (raw.quota) {
        ['xiyou', 'sellersprite'].forEach(p => {
          if (raw.quota[p]) Object.assign(quota[p], raw.quota[p]);
        });
      }
    } catch (_) { /* keep empty */ }
  }

  function persistSoon() {
    if (options.memoryOnly) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      try {
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tmp = file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          quota,
          items: [...items.values()]
        }), { mode: 0o600 });
        fs.renameSync(tmp, file);
      } catch (_) { /* ignore disk errors */ }
    }, options.persistDelay == null ? 250 : options.persistDelay);
  }

  function bucket(provider) {
    return quota[provider] || quota.xiyou;
  }

  function snapshot(item, extra) {
    const ts = nowFn();
    const stale = !!(item && item.expiresAt && item.expiresAt <= ts);
    return Object.assign({
      key: item.key,
      provider: item.provider,
      site: item.site,
      entityType: item.entityType,
      entityId: item.entityId,
      tool: item.tool,
      canonicalArgs: item.canonicalArgs,
      payload: item.payload,
      retrievedAt: item.retrievedAt,
      expiresAt: item.expiresAt,
      schemaVersion: item.schemaVersion || SCHEMA_VERSION,
      sourceRunId: item.sourceRunId || '',
      stale
    }, extra || {});
  }

  function lookup(provider, tool, args) {
    const key = evidenceKey(provider, tool, args);
    const item = items.get(key);
    if (!item || item.payload === undefined) return { key, hit: false };
    const stale = item.expiresAt <= nowFn();
    bucket(provider)[stale ? 'staleHits' : 'hits'] += 1;
    return Object.assign(snapshot(item, { hit: true, stale }), { key });
  }

  function put(input) {
    const provider = input.provider || 'xiyou';
    const tool = input.tool;
    const args = input.arguments || {};
    if (!tool) throw Error('缺少 tool');
    if (input.payload === undefined) throw Error('缺少 payload');
    const key = evidenceKey(provider, tool, args);
    const prev = items.get(key);
    const ts = nowFn();
    if (input.error && prev && prev.payload !== undefined && prev.retrievedAt >= (input.retrievedAt || ts)) {
      return snapshot(prev, { hit: true, skipped: true, reason: '错误未覆盖较新成功缓存' });
    }
    if (input.error && !input.payload) {
      const miss = {
        key, provider, tool, site: siteOf(args), error: String(input.error), attemptedAt: ts
      };
      bucket(provider).errors += 1;
      persistSoon();
      return miss;
    }
    const entity = entityOf(args);
    const item = {
      key,
      provider,
      site: siteOf(args),
      entityType: entity.type,
      entityId: entity.id,
      tool,
      canonicalArgs: stripSecrets(args),
      payload: input.payload,
      retrievedAt: input.retrievedAt || ts,
      expiresAt: (input.retrievedAt || ts) + (input.ttlMs || ttlMs(tool)),
      schemaVersion: SCHEMA_VERSION,
      sourceRunId: input.sourceRunId || '',
      client: input.client || ''
    };
    items.set(key, item);
    persistSoon();
    return snapshot(item, { hit: false, stored: true });
  }

  async function through(provider, tool, args, produce, opts = {}) {
    const key = evidenceKey(provider, tool, args);
    if (!opts.refresh && !opts.cacheOnly) {
      const existing = items.get(key);
      if (existing && existing.payload !== undefined && existing.expiresAt > nowFn()) {
        bucket(provider).hits += 1;
        return snapshot(existing, { hit: true, stale: false });
      }
    }
    if (opts.cacheOnly) {
      const existing = items.get(key);
      if (existing && existing.payload !== undefined) {
        bucket(provider).staleHits += existing.expiresAt <= nowFn() ? 1 : 0;
        if (existing.expiresAt > nowFn()) bucket(provider).hits += 1;
        return snapshot(existing, { hit: true });
      }
      return { key, hit: false, cacheOnly: true };
    }
    if (inflight.has(key)) {
      bucket(provider).inflightJoins += 1;
      return inflight.get(key);
    }
    const job = (async () => {
      try {
        const result = await produce();
        bucket(provider).calls += 1;
        const stored = put({
          provider, tool, arguments: args, payload: result && result.payload !== undefined ? result.payload : result,
          retrievedAt: nowFn(), sourceRunId: opts.sourceRunId, client: opts.client
        });
        return Object.assign(stored, {
          source: result && result.source,
          events: (result && result.events) || []
        });
      } catch (err) {
        bucket(provider).errors += 1;
        throw err;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, job);
    return job;
  }

  function estimate(requests) {
    const out = { total: requests.length, hits: 0, stale: 0, misses: 0, byProvider: { xiyou: 0, sellersprite: 0 }, keys: [] };
    requests.forEach(req => {
      const provider = req.provider || 'xiyou';
      const key = evidenceKey(provider, req.tool, req.arguments || {});
      const item = items.get(key);
      const stale = !!(item && item.expiresAt <= nowFn());
      const hit = !!(item && item.payload !== undefined && !stale);
      if (hit) out.hits += 1;
      else if (item && item.payload !== undefined) out.stale += 1;
      else {
        out.misses += 1;
        out.byProvider[provider] = (out.byProvider[provider] || 0) + 1;
      }
      out.keys.push({ key, provider, tool: req.tool, hit, stale: !!(item && stale) });
    });
    return out;
  }

  function stats() {
    let fresh = 0, stale = 0;
    const ts = nowFn();
    items.forEach(item => {
      if (item.expiresAt > ts) fresh += 1;
      else stale += 1;
    });
    return {
      schemaVersion: SCHEMA_VERSION,
      size: items.size,
      fresh,
      stale,
      inflight: inflight.size,
      quota: JSON.parse(JSON.stringify(quota))
    };
  }

  function exportRefs(keys) {
    return (keys || []).map(key => {
      const item = items.get(key);
      if (!item) return { key, found: false };
      return {
        key: item.key,
        provider: item.provider,
        site: item.site,
        entityType: item.entityType,
        entityId: item.entityId,
        tool: item.tool,
        canonicalArgs: item.canonicalArgs,
        retrievedAt: item.retrievedAt,
        expiresAt: item.expiresAt,
        found: true
      };
    });
  }

  function publicSafe(obj) {
    const text = JSON.stringify(obj);
    if (/Bearer\s+[A-Za-z0-9._\-]{12,}/i.test(text) || /"(apiKey|proxyToken|MCP_API_KEY|secret-key)"\s*:\s*"[^"]+"/i.test(text)) {
      throw Error('响应含疑似密钥，已拒绝下发');
    }
    return obj;
  }

  load();

  return {
    SCHEMA_VERSION, ttlMs, evidenceKey, argsHash, siteOf, entityOf, stripSecrets, canonical,
    lookup, put, through, estimate, stats, exportRefs, publicSafe, items, quota
  };
}

module.exports = { createStore, evidenceKey, argsHash, ttlMs, siteOf, entityOf, stripSecrets, TOOL_TTL };

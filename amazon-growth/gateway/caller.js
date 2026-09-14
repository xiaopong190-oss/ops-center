'use strict';

const PROTOCOL_VERSION = '2025-06-18';
const CERTAIN = /^HTTP (429|402)\b|weekly credit|WeeklyCreditBalanceInsufficient|(?:insufficient[_ ]credits|quota[_ ]exceeded|rate[_ ]limit[_ ]exceeded|额度不足|余额不足)/i;
const WRAP_NAMES = ['request', 'params', 'input', 'payload', 'body'];

function wrapToolArgs(schema, args) {
  const src = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  const props = schema && schema.properties && typeof schema.properties === 'object' ? schema.properties : null;
  if (!props) return src;
  const required = Array.isArray(schema.required) ? schema.required : [];
  for (let i = 0; i < WRAP_NAMES.length; i++) {
    const name = WRAP_NAMES[i];
    if (src[name] !== undefined) return src;
    if (!Object.prototype.hasOwnProperty.call(props, name)) continue;
    const node = props[name];
    const isObj = node && typeof node === 'object' && (node.type === 'object' || node.type == null || (Array.isArray(node.type) && node.type.indexOf('object') >= 0));
    if (!isObj) continue;
    if (required.indexOf(name) >= 0 || Object.keys(props).length === 1) return { [name]: src };
  }
  return src;
}

function firstAsin(value) {
  if (Array.isArray(value)) return value[0] || '';
  return String(value == null ? '' : value).split(/[,，\s]+/).filter(Boolean)[0] || '';
}

function asinList(value) {
  if (Array.isArray(value)) return value.map(v => String(v || '').toUpperCase()).filter(v => /^[A-Z0-9]{10}$/.test(v));
  return String(value == null ? '' : value).split(/[,，\s]+/).map(v => v.trim().toUpperCase()).filter(v => /^[A-Z0-9]{10}$/.test(v));
}

function coerceAsins(value, rule) {
  const list = asinList(value);
  if (!list.length) return undefined;
  if (rule && (rule.type === 'string' || (Array.isArray(rule.type) && rule.type.indexOf('string') >= 0))) return list.join(',');
  return list;
}

function firstDefined(obj, keys) {
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (obj[k] !== undefined && obj[k] !== '') return obj[k];
  }
}

function copyIfSchema(out, props, keys, value) {
  if (value === undefined) return;
  keys.forEach(k => {
    if (props[k] && out[k] === undefined) out[k] = value;
  });
}

function fillRequiredAliases(schema, args) {
  const props = schema && schema.properties && typeof schema.properties === 'object' ? schema.properties : null;
  if (!props) return args;
  const required = Array.isArray(schema.required) ? schema.required : [];
  const out = Object.assign({}, args);
  copyIfSchema(out, props, ['marketplace', 'marketplace_id', 'site', 'site_id', 'country', 'country_code', 'countryCode', 'region'], firstDefined(out, ['marketplace', 'marketplace_id', 'site', 'site_id', 'country', 'country_code', 'countryCode', 'region']));
  const fromVal = firstDefined(out, ['start_date', 'startDate', 'from_date', 'date_from', 'begin_date', 'start']);
  const toVal = firstDefined(out, ['end_date', 'endDate', 'to_date', 'date_to', 'end']);
  copyIfSchema(out, props, ['start_date', 'startDate', 'from_date', 'date_from', 'begin_date', 'start'], fromVal);
  copyIfSchema(out, props, ['end_date', 'endDate', 'to_date', 'date_to', 'end'], toVal);
  copyIfSchema(out, props, ['start_month', 'startMonth', 'from_month', 'month_from'], fromVal ? String(fromVal).slice(0, 7) : firstDefined(out, ['start_month', 'startMonth']));
  copyIfSchema(out, props, ['end_month', 'endMonth', 'to_month', 'month_to'], toVal ? String(toVal).slice(0, 7) : firstDefined(out, ['end_month', 'endMonth']));
  const asinsKey = ['asins', 'asinList', 'asin_list'].find(k => props[k]);
  if (asinsKey && out[asinsKey] === undefined) {
    const filled = coerceAsins(out.asin || out.asins || out.asinList || out.asin_list, props[asinsKey]);
    if (filled !== undefined) out[asinsKey] = filled;
  }
  if (props.asin && out.asin === undefined) {
    const one = firstAsin(out.asins || out.asinList || out.asin_list);
    if (one) out.asin = one;
  }
  if (required.indexOf('asins') >= 0 && required.indexOf('asin') < 0 && out.asins !== undefined) delete out.asin;
  if (props.reverseType && out.reverseType === undefined) out.reverseType = 'M';
  if (props.size && out.size === undefined) {
    const max = Number(props.size.maximum);
    out.size = Number.isFinite(max) ? Math.min(10, max) : 10;
  }
  const monthRaw = firstDefined(out, ['month', 'date', 'historyDate', 'yyyyMM', 'start_month', 'end_date', 'start_date']);
  let yyyymm = monthRaw && /^\d{4}-\d{2}/.test(String(monthRaw)) ? String(monthRaw).slice(0, 7).replace('-', '') : '';
  if (!yyyymm) {
    const now = new Date();
    const y = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
    const m = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth();
    yyyymm = String(y) + String(m).padStart(2, '0');
  }
  if (props.month && out.month === undefined && (required.indexOf('month') >= 0 || props.reverseType)) out.month = yyyymm;
  if (props.historyDate && out.historyDate === undefined && (required.indexOf('historyDate') >= 0 || props.reverseType)) out.historyDate = yyyymm;
  if (props.date && out.date === undefined && props.reverseType) out.date = yyyymm;
  return out;
}

function knownOnly(schema, args) {
  const props = schema && schema.properties && typeof schema.properties === 'object' ? schema.properties : null;
  if (!props || !args || typeof args !== 'object') return args;
  const out = {};
  Object.keys(args).forEach(k => { if (Object.prototype.hasOwnProperty.call(props, k)) out[k] = args[k]; });
  return out;
}

function adaptToolArgs(schema, args) {
  const wrapped = wrapToolArgs(schema, args);
  const wrapName = WRAP_NAMES.find(name => wrapped[name] && typeof wrapped[name] === 'object' && !Array.isArray(wrapped[name]));
  if (wrapName && schema && schema.properties && schema.properties[wrapName]) {
    const inner = schema.properties[wrapName];
    const filled = fillRequiredAliases({ properties: inner.properties, required: inner.required || [] }, wrapped[wrapName]);
    wrapped[wrapName] = knownOnly(inner, filled);
    return knownOnly(schema, wrapped);
  }
  return knownOnly(schema, fillRequiredAliases(schema, wrapped));
}

function certain(err) {
  return CERTAIN.test(String((err && err.message) || err || ''));
}

function parseSse(text, id) {
  const lines = (text + '\n\n').split(/\r?\n/);
  let last = null;
  let buf = [];
  for (const line of lines) {
    if (line.startsWith('data:')) buf.push(line.slice(5).trim());
    else if (line === '') {
      if (buf.length) {
        try {
          const obj = JSON.parse(buf.join('\n'));
          if (obj && obj.id === id && (obj.result !== undefined || obj.error !== undefined)) last = obj;
        } catch (_) { /* ignore */ }
        buf = [];
      }
    }
  }
  if (buf.length && !last) {
    try { last = JSON.parse(buf.join('\n')); } catch (_) { /* ignore */ }
  }
  return last;
}

function unwrap(result) {
  if (!result) return null;
  if (result.structuredContent) return result.structuredContent;
  const content = result.content;
  if (!Array.isArray(content)) return result;
  const out = [];
  for (const c of content) {
    if (c.type === 'text' && typeof c.text === 'string') {
      const t = c.text.trim();
      if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
        try { out.push(JSON.parse(t)); continue; } catch (_) { /* keep */ }
      }
      out.push(t);
    } else if (c.type === 'resource' && c.resource) out.push(c.resource.text || c.resource);
    else out.push(c);
  }
  return out.length === 1 ? out[0] : out;
}

class McpSession {
  constructor(connection, fetchImpl) {
    this.connection = connection;
    this.fetchImpl = fetchImpl || fetch;
    this.sessionId = null;
    this.id = 0;
    this.tools = null;
  }

  headers() {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream'
    };
    if (this.connection.key) {
      headers[this.connection.authHeader || 'Authorization'] = (this.connection.authPrefix ?? 'Bearer ') + this.connection.key;
    }
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    return headers;
  }

  async rpc(method, params, isNotification) {
    const body = { jsonrpc: '2.0', method };
    if (params !== undefined) body.params = params;
    if (!isNotification) body.id = ++this.id;
    let upstream, text;
    try {
      upstream = await this.fetchImpl(this.connection.endpoint, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(60000)
      });
      text = await upstream.text();
    } catch (e) {
      throw Error('上游响应未确认，请核验本次是否已执行；未自动重试。');
    }
    const sid = upstream.headers.get('mcp-session-id') || upstream.headers.get('Mcp-Session-Id');
    if (sid) this.sessionId = sid;
    if (isNotification) return { ok: upstream.ok };
    if (!upstream.ok) throw Error('HTTP ' + upstream.status + ' ' + upstream.statusText + (text ? ' — ' + text.slice(0, 400) : ''));
    const ctype = String(upstream.headers.get('content-type') || '').toLowerCase();
    const payload = ctype.indexOf('text/event-stream') >= 0 ? parseSse(text, body.id) : (text ? JSON.parse(text) : null);
    if (!payload) throw Error('服务端返回空响应');
    if (payload.id !== body.id) throw Error('响应 ID 与请求不匹配');
    if (payload.error) throw Error('MCP 错误 ' + (payload.error.code || '') + ': ' + (payload.error.message || JSON.stringify(payload.error)));
    return payload;
  }

  async connect() {
    this.sessionId = null;
    await this.rpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'mcp-evidence-gateway', version: '1.0.0' }
    });
    try { await this.rpc('notifications/initialized', {}, true); } catch (_) { /* optional */ }
    this.tools = [];
    let cursor;
    const seen = new Set();
    do {
      const list = await this.rpc('tools/list', cursor ? { cursor } : {});
      if (!list.result || !Array.isArray(list.result.tools)) throw Error('无效工具列表');
      this.tools.push(...list.result.tools);
      cursor = list.result.nextCursor;
      if (cursor && (seen.has(cursor) || seen.size >= 100)) throw Error('工具列表分页异常');
      seen.add(cursor);
    } while (cursor);
    if (this.tools.some(t => t.name === 'secret_expired')) throw Error((this.connection.name || '连接') + '：密钥已过期，请编辑连接更新密钥');
    return this.tools;
  }

  async call(tool, args) {
    if (!this.tools) await this.connect();
    const schema = (this.tools || []).find(t => t.name === tool);
    const mapped = adaptToolArgs(schema && schema.inputSchema, args);
    const r = await this.rpc('tools/call', { name: tool, arguments: mapped });
    if (r.result && r.result.isError) throw Error('工具执行失败：' + JSON.stringify(unwrap(r.result)).slice(0, 400));
    return unwrap(r.result);
  }
}

function createCaller({ registry, fetchImpl } = {}) {
  const sessions = new Map();

  function enabled(provider) {
    return (registry.list() || []).filter(c => c.provider === provider && c.enabled);
  }

  function sessionFor(id) {
    const conn = registry.get(id);
    if (!conn) throw Error('连接不存在或已停用');
    let s = sessions.get(id);
    if (!s) {
      s = new McpSession(conn, fetchImpl);
      sessions.set(id, s);
    }
    return s;
  }

  async function callOn(connectionId, tool, args) {
    return sessionFor(connectionId).call(tool, args);
  }

  async function callProvider(provider, tool, args, preferredId) {
    const events = [];
    const ids = [];
    if (preferredId && registry.get(preferredId)) ids.push(preferredId);
    enabled(provider).forEach(c => { if (ids.indexOf(c.id) < 0) ids.push(c.id); });
    if (!ids.length) throw Error('本平台没有已启用的 MCP 连接，请先添加连接');
    let last;
    for (const id of ids) {
      const meta = (registry.list() || []).find(c => c.id === id) || { name: id };
      try {
        const payload = await callOn(id, tool, args);
        return { payload, source: { provider, id, name: meta.name }, events };
      } catch (err) {
        last = err;
        if (!certain(err)) throw err;
        events.push({ connection: meta.name, state: '额度不足或限流，切换备用' });
        sessions.delete(id);
      }
    }
    throw Error('本组可用连接已耗尽：' + (last && last.message || ''));
  }

  return { certain, callOn, callProvider, unwrap, parseSse, McpSession };
}

module.exports = { createCaller, certain, unwrap, parseSse, wrapToolArgs, adaptToolArgs };

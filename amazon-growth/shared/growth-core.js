/* 增长中心 · 全局数据层 GrowthCore
 *
 * 五个工具共用的数据只在这里读写：
 *   connection  接入模式 / 代理地址 / 代理访问令牌（MCP 连接组本身存在服务端 /api/connections）
 *   ai          AI 模型服务偏好（localStorage）与本会话密钥（sessionStorage）
 *   context     全局参数：站点、ASIN、对比 ASIN、关键词、类目、品牌、日期区间（跨标签页同步）
 *   evidence    共享证据网关 /api/evidence/* 客户端（自动带代理令牌）
 *   user        opsUser / opsRole（来自地址栏）
 *
 * 工具私有数据（场景运行记录、竞品权重、监控清单、推品方案、关键词导入文件等）不放这里。
 * 零依赖、经典脚本，需在各工具脚本之前加载。
 */
(function () {
  "use strict";
  if (window.GrowthCore) return;

  const KEY = {
    conn: "growth-conn-v1",
    ctx: "growth-context-v1",
    legacy: "xiyou-console-v1"
  };
  const CTX_FIELDS = ["site", "asin", "asins", "keyword", "category", "brand", "dateFrom", "dateTo"];
  const SITES = ["US", "UK", "DE", "JP", "FR", "IT", "ES", "CA", "MX", "AU", "IN", "NL", "SE"];

  function readJSON(store, key) {
    try { return JSON.parse(store.getItem(key) || "null"); } catch (_) { return null; }
  }
  function writeJSON(store, key, value) {
    try { store.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
  }

  /* ---------- 事件 ---------- */
  const listeners = {};
  function on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); return () => off(type, fn); }
  function off(type, fn) { listeners[type] = (listeners[type] || []).filter(f => f !== fn); }
  function emit(type, payload, meta) { (listeners[type] || []).slice().forEach(fn => { try { fn(payload, meta || {}); } catch (e) { console.error(e); } }); }

  /* ---------- 用户与角色 ---------- */
  const params = new URLSearchParams(location.search);
  const user = {
    id: params.get("opsUser") || "local",
    name: params.get("opsName") || "",
    role: params.get("opsRole") === "super" ? "super" : "operator",
    get isSuper() { return this.role === "super"; }
  };
  /** 把身份参数带到站内链接上，切换工具时不丢角色 */
  function carryParams(root) {
    (root || document).querySelectorAll("a[data-carry], .app-switch a").forEach(a => {
      const href = a.getAttribute("href");
      if (!href || /^(https?:)?\/\//.test(href) && !href.startsWith(location.origin)) return;
      const u = new URL(href, location.href);
      ["embedded", "opsUser", "opsName", "opsRole"].forEach(k => { if (params.has(k)) u.searchParams.set(k, params.get(k)); });
      a.href = u.pathname + u.search + u.hash;
    });
  }

  /* ---------- 接入与鉴权 ---------- */
  const defaultProxy = /^https?:$/.test(location.protocol) ? location.origin : "http://localhost:8787";
  function connection() {
    let c = readJSON(localStorage, KEY.conn);
    if (!c) {
      // 一次性迁移：旧版只存在调用台的 xiyou-console-v1.cfg 里
      const legacy = (readJSON(localStorage, KEY.legacy) || {}).cfg || {};
      c = { mode: legacy.mode, proxy: legacy.proxy, proxyToken: legacy.proxyToken };
      if (legacy.proxy || legacy.proxyToken || legacy.mode) writeJSON(localStorage, KEY.conn, c);
    }
    return {
      mode: c.mode === "direct" ? "direct" : "proxy",
      proxy: String(c.proxy || defaultProxy).trim().replace(/\/+$/, ""),
      proxyToken: String(c.proxyToken || "")
    };
  }
  function setConnection(patch) {
    const next = Object.assign(connection(), patch || {});
    const clean = { mode: next.mode === "direct" ? "direct" : "proxy", proxy: String(next.proxy || "").trim().replace(/\/+$/, ""), proxyToken: String(next.proxyToken || "").trim() };
    writeJSON(localStorage, KEY.conn, clean);
    emit("connection", connection());
    return connection();
  }
  function headers(extra) {
    const h = { "Content-Type": "application/json" };
    const t = connection().proxyToken;
    if (t) h["X-Proxy-Token"] = t;
    return Object.assign(h, extra || {});
  }
  function url(path) {
    if (/^https?:\/\//.test(path)) return path;
    return connection().proxy + (path.charAt(0) === "/" ? path : "/" + path);
  }
  async function api(path, opts) {
    const o = Object.assign({}, opts || {});
    o.headers = headers(o.headers);
    if (o.body && typeof o.body !== "string") o.body = JSON.stringify(o.body);
    const res = await fetch(url(path), o);
    let data = null;
    try { data = await res.json(); } catch (_) { /* 非 JSON */ }
    if (!res.ok) throw Error((data && (typeof data.error === "string" ? data.error : data.message)) || ("HTTP " + res.status));
    return data;
  }

  /* ---------- 共享证据网关 ---------- */
  function evidence(clientName) {
    const h = { "X-Evidence-Client": clientName || "unknown" };
    const post = (p, body) => api(p, { method: "POST", headers: h, body: body || {} });
    return {
      stats: () => api("/api/evidence/stats", { headers: h }),
      estimate: requests => post("/api/evidence/estimate", { requests: requests || [] }),
      lookup: (provider, tool, args) => post("/api/evidence/lookup", { provider: provider || "xiyou", tool, arguments: args || {} }),
      call: (provider, tool, args, opts) => post("/api/evidence/call", Object.assign({ provider: provider || "xiyou", tool, arguments: args || {} }, opts || {})),
      exportRefs: keys => post("/api/evidence/export", { keys: keys || [] }),
      publish: items => post("/api/evidence/publish", { items: items || [] })
    };
  }
  /** MCP 连接组（服务端保存，页面只读；增删改仍走调用台连接组弹层） */
  function connections() { return api("/api/connections").then(r => (r && r.connections) || []); }

  /* ---------- AI 模型 ---------- */
  const AI_SPECS = {
    auto: ["自动（Cloudflare 优先）", ""],
    cloudflare: ["Cloudflare", ""],
    gemini: ["Gemini", "gemini-3.8-flash"],
    deepseek: ["DeepSeek", "deepseek-flash"],
    anthropic: ["Claude", "claude-sonnet-4-6"]
  };
  const aiKey = "growth-ai-v1:" + user.id;
  const ai = {
    specs: AI_SPECS,
    storageKey: aiKey,
    prefs: () => readJSON(localStorage, aiKey) || {},
    secrets: () => readJSON(sessionStorage, aiKey) || {},
    save(prefs, secrets) {
      const ok = writeJSON(sessionStorage, aiKey, secrets || {}) && writeJSON(localStorage, aiKey, prefs || {});
      if (ok) emit("ai", ai.current());
      return ok;
    },
    current() {
      const p = ai.prefs();
      const provider = AI_SPECS[p.provider] ? p.provider : "auto";
      return { provider, label: AI_SPECS[provider][0], model: (p[provider] && p[provider].model) || AI_SPECS[provider][1], hasKey: !!ai.secrets()[provider] };
    },
    /** 合并进调用台 cfg，供 claude.js 使用 */
    config(base) {
      const c = ai.current();
      return Object.assign({}, base || {}, { llmProvider: c.provider, model: c.model, llmKey: ai.secrets()[c.provider] || "" });
    }
  };

  /* ---------- 全局参数 ---------- */
  function normCtx(o) {
    const out = {};
    CTX_FIELDS.forEach(k => { if (o && o[k] != null) out[k] = String(o[k]).trim(); });
    if (out.site && SITES.indexOf(out.site.toUpperCase()) >= 0) out.site = out.site.toUpperCase();
    if (out.asin) out.asin = out.asin.toUpperCase();
    // 日期只收完整的 YYYY-MM-DD（输入到一半的值不进全局，也不推给其他工具）
    ["dateFrom", "dateTo"].forEach(k => {
      if (out[k] == null) return;
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(out[k]);
      const ok = (m && +m[1] >= 2000 && +m[1] <= 2100 && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31);
      if (!ok) delete out[k];
    });
    return out;
  }
  const context = {
    fields: CTX_FIELDS.slice(),
    sites: SITES.slice(),
    get() { return normCtx(readJSON(localStorage, KEY.ctx) || {}); },
    set(patch, source) {
      const prev = context.get();
      const next = Object.assign({}, prev, normCtx(patch));
      const changed = CTX_FIELDS.filter(k => (prev[k] || "") !== (next[k] || ""));
      if (!changed.length) return next;
      next.updatedAt = Date.now();
      next.updatedBy = source || "";
      writeJSON(localStorage, KEY.ctx, next);
      emit("context", next, { changed, source: source || "", remote: false });
      return next;
    },
    clear(source) {
      writeJSON(localStorage, KEY.ctx, { updatedAt: Date.now(), updatedBy: source || "" });
      emit("context", {}, { changed: CTX_FIELDS.slice(), source: source || "", remote: false });
    },
    onChange: fn => on("context", fn),
    /**
     * 把页面输入框绑到全局参数。
     *   map:  { site: "#site", asin: "#asin", ... }
     *   opts: { source: "asinscope", seed: true }
     * 规则：
     *   1. 加载时全局有值 → 填进页面并派发 input/change，让页面自己的逻辑照常运行；
     *      全局没有值 → 用页面现值作为种子（seed !== false）。
     *   2. 只有用户真实输入（isTrusted）才写回全局，页面脚本自己改值（例如监控清单把窗口截到 31 天）不回写。
     *   3. 其他标签页改了全局参数 → 未聚焦的输入框同步更新。
     */
    bind(map, opts) {
      const o = Object.assign({ source: "", seed: true }, opts || {});
      const els = {};
      Object.keys(map || {}).forEach(k => {
        if (CTX_FIELDS.indexOf(k) < 0) return;
        const el = typeof map[k] === "string" ? document.querySelector(map[k]) : map[k];
        if (el) els[k] = el;
      });
      const apply = (ctx, onlyKeys) => {
        Object.keys(els).forEach(k => {
          if (onlyKeys && onlyKeys.indexOf(k) < 0) return;
          const el = els[k];
          const v = ctx[k];
          if (v == null || v === "" || el.value === v || document.activeElement === el) return;
          if (el.tagName === "SELECT" && !Array.prototype.some.call(el.options, op => (op.value || op.text) === v)) return;
          el.value = v;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        });
      };
      const g = context.get();
      const hasGlobal = Object.keys(els).some(k => g[k]);
      if (hasGlobal) apply(g);
      else if (o.seed) {
        const seed = {};
        Object.keys(els).forEach(k => { if (els[k].value) seed[k] = els[k].value; });
        context.set(seed, o.source);
      }
      Object.keys(els).forEach(k => {
        const write = e => { if (e.isTrusted) context.set({ [k]: els[k].value }, o.source); };
        els[k].addEventListener("change", write);
        els[k].addEventListener("input", write);
      });
      const unsub = on("context", (ctx, meta) => { if (meta.remote) apply(ctx, meta.changed); });
      return { apply: () => apply(context.get()), unbind: unsub, elements: els };
    }
  };

  /* ---------- 跨标签页同步 ---------- */
  window.addEventListener("storage", e => {
    if (e.key === KEY.ctx) {
      let prev = {};
      try { prev = normCtx(JSON.parse(e.oldValue || "{}")); } catch (_) { /* ignore */ }
      const next = context.get();
      const changed = CTX_FIELDS.filter(k => (prev[k] || "") !== (next[k] || ""));
      emit("context", next, { changed, source: next.updatedBy || "", remote: true });
    } else if (e.key === KEY.conn) emit("connection", connection(), { remote: true });
    else if (e.key === aiKey) emit("ai", ai.current(), { remote: true });
  });

  window.GrowthCore = {
    version: "1.0.0",
    keys: Object.assign({}, KEY),
    user, carryParams,
    connection, setConnection, headers, url, api,
    connections, evidence,
    ai, context,
    on, off
  };
})();

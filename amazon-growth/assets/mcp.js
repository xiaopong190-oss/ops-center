/* MCP Streamable HTTP 客户端
 * 协议：JSON-RPC 2.0 over HTTP POST（MCP 2025-06-18 Streamable HTTP transport）
 * 服务端可能以 application/json 或 text/event-stream 返回，两种都解析。
 */
(function () {
  "use strict";

  const PROTOCOL_VERSION = "2025-06-18";
  const KEYWORD_MAX = 8;

  function parseKeywords(raw, max) {
    const cap = max == null ? KEYWORD_MAX : max;
    const out = [];
    String(raw == null ? "" : raw).split(/[\n\r,，;；]+/).forEach(part => {
      const t = String(part || "").trim();
      if (!t) return;
      const key = t.toLowerCase();
      if (out.some(x => x.toLowerCase() === key)) return;
      out.push(t);
    });
    return cap < 0 ? out : out.slice(0, cap);
  }

  class McpClient {
    constructor(cfg) {
      this.mode = cfg.mode || "proxy";          // "proxy" | "direct"
      this.endpoint = (cfg.endpoint || "").trim();
      this.apiKey = (cfg.apiKey || "").trim();
      this.proxy = (cfg.proxy || "").trim().replace(/\/$/, "");
      this.proxyToken = cfg.proxyToken || "";
      this.connectionId = cfg.connectionId || "";
      this.authHeader = cfg.authHeader || "Authorization";
      this.authPrefix = cfg.authPrefix === undefined ? "Bearer " : cfg.authPrefix;
      this.sessionId = null;
      this.tools = null;                        // tools/list 返回的原始工具数组
      this.schemas = {};                        // name -> inputSchema
      this.id = 0;
      this.log = cfg.log || function () {};
    }

    get target() {
      return this.mode === "proxy" ? this.proxy + (this.connectionId ? "/api/connection-rpc" : "/api/mcp") : this.endpoint;
    }

    headers() {
      const h = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
      };
      if (this.sessionId) h["Mcp-Session-Id"] = this.sessionId;
      if (this.mode === "proxy") {
        if (this.connectionId) { h["X-Connection-Id"]=this.connectionId; if(this.proxyToken)h["X-Proxy-Token"]=this.proxyToken; return h; }
        if (this.proxyToken) h["X-Proxy-Token"] = this.proxyToken;
        // 代理模式：端点与密钥由服务端环境变量决定；如果前端填了就一并转发，方便本地调试
        if (this.endpoint) h["X-Mcp-Endpoint"] = this.endpoint;
        if (this.apiKey) h["X-Mcp-Key"] = this.apiKey;
      } else {
        if (this.apiKey) h[this.authHeader] = this.authPrefix + this.apiKey;
      }
      return h;
    }

    async rpc(method, params, isNotification) {
      const body = { jsonrpc: "2.0", method: method };
      if (params !== undefined) body.params = params;
      if (!isNotification) body.id = ++this.id;

      const started = Date.now();
      const res = await fetch(this.target, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body), signal: AbortSignal.timeout(60000)
      });

      const sid = res.headers.get("Mcp-Session-Id") || res.headers.get("mcp-session-id");
      if (sid) this.sessionId = sid;

      if (isNotification) return { ok: res.ok, ms: Date.now() - started };

      const ctype = (res.headers.get("Content-Type") || "").toLowerCase();
      const text = await res.text();

      if (!res.ok) {
        throw new Error("HTTP " + res.status + " " + res.statusText + (text ? " — " + text.slice(0, 400) : ""));
      }

      let payload;
      if (ctype.indexOf("text/event-stream") >= 0) {
        payload = parseSse(text, body.id);
      } else {
        payload = text ? JSON.parse(text) : null;
      }
      if (!payload) throw new Error("服务端返回空响应");
      if (payload.id !== body.id) throw new Error("响应 ID 与请求不匹配");
      if (payload.error) {
        const e = payload.error;
        throw new Error("MCP 错误 " + (e.code || "") + ": " + (e.message || JSON.stringify(e)));
      }
      payload.__ms = Date.now() - started;
      return payload;
    }

    async connect() {
      this.sessionId = null;
      const init = await this.rpc("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "xiyou-amz-console", version: "1.0.0" }
      });
      this.log("initialize ok", init.result);
      try { await this.rpc("notifications/initialized", {}, true); } catch (e) { /* 部分服务端不需要 */ }

      this.tools = [];
      let cursor;
      const seen = new Set();
      do {
        const list = await this.rpc("tools/list", cursor ? {cursor} : {});
        if (!list.result || !Array.isArray(list.result.tools)) throw new Error("无效工具列表");
        this.tools.push(...list.result.tools);
        cursor = list.result.nextCursor;
        if (cursor && (seen.has(cursor) || seen.size >= 100)) throw new Error("工具列表分页异常");
        seen.add(cursor);
      } while (cursor);
      this.schemas = {};
      this.tools.forEach(t => { this.schemas[t.name] = t.inputSchema || t.input_schema || null; });
      return {
        server: init.result && init.result.serverInfo,
        protocolVersion: init.result && init.result.protocolVersion,
        tools: this.tools
      };
    }

    async call(name, args) {
      if (!this.sessionId && !this.tools) await this.connect();
      const r = await this.rpc("tools/call", { name: name, arguments: args || {} });
      if (r.result && r.result.isError) throw new Error("工具执行失败：" + JSON.stringify(unwrap(r.result)).slice(0, 400));
      return { raw: r.result, ms: r.__ms, data: unwrap(r.result) };
    }
  }

  /* ---------- SSE 解析：取最后一个含 JSON-RPC 结果的 data 帧 ---------- */
  function parseSse(text, id) {
    const lines = (text + "\n\n").split(/\r?\n/);
    let last = null;
    let buf = [];
    for (const line of lines) {
      if (line.startsWith("data:")) {
        buf.push(line.slice(5).trim());
      } else if (line === "") {
        if (buf.length) {
          try {
            const obj = JSON.parse(buf.join("\n"));
            if (obj && obj.id === id && (obj.result !== undefined || obj.error !== undefined)) last = obj;
          } catch (e) { /* 忽略非 JSON 帧 */ }
          buf = [];
        }
      }
    }
    if (buf.length && !last) {
      try { last = JSON.parse(buf.join("\n")); } catch (e) { /* ignore */ }
    }
    return last;
  }

  /* ---------- 把 MCP tools/call 结果拆成可用数据 ---------- */
  function unwrap(result) {
    if (!result) return null;
    if (result.structuredContent) return result.structuredContent;
    const content = result.content;
    if (!Array.isArray(content)) return result;
    const out = [];
    for (const c of content) {
      if (c.type === "text" && typeof c.text === "string") {
        const t = c.text.trim();
        if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
          try { out.push(JSON.parse(t)); continue; } catch (e) { /* 原样保留 */ }
        }
        out.push(t);
      } else if (c.type === "resource" && c.resource) {
        out.push(c.resource.text || c.resource);
      } else {
        out.push(c);
      }
    }
    return out.length === 1 ? out[0] : out;
  }

  /* ================= 参数自动映射 =================
   * 我们的规范化参数名 -> 服务端 inputSchema 里可能用的属性名。
   * 有 schema 就按 schema 匹配（并做类型适配：string / array / integer）；
   * 没 schema 就用别名表里的第一个作为默认名。
   */
  const ALIAS = {
    site:      ["marketplace", "marketplace_id", "site", "site_id", "country", "country_code", "region", "站点"],
    asin:      ["asin", "product_asin", "child_asin", "parent_asin", "primary_asin", "asins", "asin_list"],
    asins:     ["asins", "asin_list", "asinList", "asin_array", "asin_codes", "asin"],
    keyword:   ["keyword", "keywords", "search_term", "searchterm", "query", "kw", "term", "text"],
    // 类目文本与类目 ID 必须分开。把 category_id 放在这里会把用户输入的
    // “electric kettle” 当作资源接口所需的真实 ID，导致 category unavailable。
    category:  ["category", "category_name", "category_path", "keyword", "name", "query"],
    nodeIdPath:["nodeIdPath", "node_id_path", "nodeidpath"],
    brand:     ["brand", "brand_name", "brands"],
    dateFrom:  ["start_date", "from_date", "date_from", "begin_date", "start", "from", "start_day"],
    dateTo:    ["end_date", "to_date", "date_to", "end", "to", "end_day"],
    date:      ["date", "day", "target_date", "report_date", "start_date"],
    monthFrom: ["start_month", "from_month", "month_from", "begin_month", "start_date", "month"],
    monthTo:   ["end_month", "to_month", "month_to", "end_date", "month"],
    weekFrom:  ["start_week", "startWeek", "from_week", "week_from", "begin_week", "week_start"],
    weekTo:    ["end_week", "endWeek", "to_week", "week_to", "week_end"],
    resource:  ["resource_id", "resourceid", "insight_resource_id", "task_id", "job_id"],
    categoryId:["category_id", "categoryid", "node_id", "cid", "id"],
    bsr:       ["bsr", "bsrRank", "bsr_rank", "rank"],
    primaryAsin:["primary_asin", "primaryasin"],
    keywordList:["keyword_list", "keywordList", "keywords"]
  };

  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

  function schemaProps(schema) {
    if (!schema) return null;
    const p = schema.properties || (schema.type === "object" && schema.props) || null;
    return p && typeof p === "object" ? p : null;
  }

  const WRAP_NAMES = ["request", "params", "input", "payload", "body"];

  function isObjectSchema(node) {
    if (!node || typeof node !== "object") return false;
    if (Array.isArray(node.type)) return node.type.indexOf("object") >= 0;
    if (node.type && node.type !== "object") return false;
    return true;
  }

  function wrapperField(schema) {
    const props = schemaProps(schema);
    if (!props) return null;
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (let i = 0; i < WRAP_NAMES.length; i++) {
      const name = WRAP_NAMES[i];
      if (!Object.prototype.hasOwnProperty.call(props, name)) continue;
      if (!isObjectSchema(props[name])) continue;
      if (required.indexOf(name) >= 0 || Object.keys(props).length === 1) return name;
    }
    return null;
  }

  function asinListFrom(form, ctx) {
    const out = [];
    const add = v => {
      String(v == null ? "" : v).split(/[,，\s]+/).forEach(part => {
        const a = String(part || "").trim().toUpperCase();
        if (/^[A-Z0-9]{10}$/.test(a) && out.indexOf(a) < 0) out.push(a);
      });
    };
    if (ctx && Array.isArray(ctx.watchlist)) ctx.watchlist.forEach(add);
    if (ctx && Array.isArray(ctx.variantAsins)) ctx.variantAsins.forEach(add);
    add(form && form.asin);
    add(form && form.asins);
    return out;
  }

  function utcToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function lastCompleteMonth(from, to) {
    const end = /^\d{4}-\d{2}-\d{2}$/.test(to || "") ? to : utcToday();
    const d = new Date(end + "T00:00:00Z");
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    if (d.getUTCDate() < last) d.setUTCMonth(d.getUTCMonth() - 1);
    return String(d.getUTCFullYear()) + String(d.getUTCMonth() + 1).padStart(2, "0");
  }

  function saturdayYmd(day) {
    const d = new Date(mondayOf(day) + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 5);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  }

  function fillInnerGaps(args, props, form, ctx) {
    if (!props) return;
    const month = lastCompleteMonth(form && form.dateFrom, form && form.dateTo);
    const asins = asinListFrom(form, ctx);
    const kw = parseKeywords(form && form.keyword)[0] || String((form && form.keyword) || "").trim();
    if (props.reverseType && args.reverseType === undefined) args.reverseType = "M";
    if (props.reverseType && props.date) {
      const weekly = String(args.reverseType || "M").toUpperCase() === "W";
      if (args.date === undefined || /^\d{4}-\d{2}(-\d{2})?$/.test(args.date)) {
        args.date = weekly ? saturdayYmd(form && form.dateTo) : month;
      }
    }
    if (props.historyDate && /^\d{4}-\d{2}-\d{2}$/.test(args.historyDate || "")) args.historyDate = args.historyDate.slice(0, 7).replace("-", "");
    if (props.historyDate && args.historyDate === undefined) args.historyDate = month;
    if (props.month && /^\d{4}-\d{2}-\d{2}$/.test(args.month || "")) args.month = args.month.slice(0, 7).replace("-", "");
    if (props.month && args.month === undefined && (!props.month.type || props.month.type === "string")) args.month = month;
    if (props.asins) {
      const cur = Array.isArray(args.asins) ? args.asins.slice() : (args.asins ? [args.asins] : []);
      asins.forEach(a => { if (cur.indexOf(a) < 0) cur.push(a); });
      if (cur.length) args.asins = coerce(cur, props.asins);
    }
    if (props.asinList && args.asinList === undefined && asins.length) args.asinList = coerce(asins, props.asinList);
    if (props.q && args.q === undefined) args.q = (form && form.asin) || kw;
    if (props.queryType && args.queryType === undefined) args.queryType = coerce(2, props.queryType);
    if (props.text && args.text === undefined && kw) args.text = kw;
    if (props.monthly && args.monthly === undefined && props.monthly.type === "boolean") args.monthly = true;
    const siteKey = findProp(props, ALIAS.site);
    if (siteKey && args[siteKey] === undefined) args[siteKey] = (form && form.site) || "US";
    if (props.relations && args.relations === undefined) {
      const fromCtx = ctx && Array.isArray(ctx.relations) && ctx.relations.length ? ctx.relations : ["vav","sp","avp","bab","fbt","mib","csi","bav"];
      args.relations = coerce(fromCtx, props.relations);
    }
    if (props.size && args.size === undefined && (props.size.type === "integer" || props.size.type === "number")) {
      const max = Number(props.size.maximum);
      const fallback = Number.isFinite(max) ? Math.min(50, max) : 50;
      args.size = coerce(fallback, props.size);
    }
    if (props.starList && args.starList === undefined && ctx && Array.isArray(ctx.starList) && ctx.starList.length) {
      args.starList = coerce(ctx.starList, props.starList);
    }
    if (props.page && args.page === undefined && props.page.type === "integer") args.page = coerce(1, props.page);
    if (props.nodeIdPath && args.nodeIdPath === undefined && ctx && /^\d+(:\d+)*$/.test(String(ctx.nodeIdPath || ""))) args.nodeIdPath = ctx.nodeIdPath;
    if (props.topN && args.topN === undefined) args.topN = coerce(10, props.topN);
    if (props.newProduct && args.newProduct === undefined) args.newProduct = coerce(6, props.newProduct);
    if (props.bsr && args.bsr === undefined && ctx && ctx.bsr != null) args.bsr = coerce(ctx.bsr, props.bsr);
  }

  /** 在 schema 属性里找与别名匹配的真实字段名 */
  function findProp(props, aliases) {
    if (!props) return null;
    const keys = Object.keys(props);
    const map = {};
    keys.forEach(k => { map[norm(k)] = k; });
    for (const a of aliases) {
      if (!norm(a)) continue;
      const hit = map[norm(a)];
      if (hit) return hit;
    }
    return null;
  }

  function addUtcMonths(day, delta) {
    const src = /^\d{4}-\d{2}-\d{2}$/.test(day || "") ? day : utcToday();
    const d = new Date(src + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + delta);
    return d.toISOString().slice(0, 10);
  }
  function monthSpan(fromM, toM) {
    const a = String(fromM || "").match(/^(\d{4})-(\d{2})/);
    const b = String(toM || "").match(/^(\d{4})-(\d{2})/);
    if (!a || !b) return 0;
    return (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2])) + 1;
  }
  function daySpan(from, to) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "")) return 0;
    return Math.round((new Date(to + "T00:00:00Z") - new Date(from + "T00:00:00Z")) / 864e5) + 1;
  }
  function mondayOf(day) {
    const src = /^\d{4}-\d{2}-\d{2}$/.test(day || "") ? day : utcToday();
    const d = new Date(src + "T00:00:00Z");
    const wd = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - (wd === 0 ? 6 : wd - 1));
    return d.toISOString().slice(0, 10);
  }
  function isoWeekOf(day) {
    const monday = mondayOf(day);
    const d = new Date(monday + "T00:00:00Z");
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    const yStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const w = Math.ceil((((t - yStart) / 864e5) + 1) / 7);
    return t.getUTCFullYear() + "-W" + String(w).padStart(2, "0");
  }
  function weekValue(day, prop) {
    const rule = prop || {};
    const pattern = String(rule.pattern || "");
    const example = Array.isArray(rule.examples) ? rule.examples[0] : rule.example;
    const hint = String(rule.description || rule.title || "").toLowerCase();
    if (typeof example === "string" && /^\d{4}-W\d{2}$/.test(example)) return isoWeekOf(day);
    if (typeof example === "string" && /^\d{4}-\d{2}-\d{2}$/.test(example)) return mondayOf(day);
    if (/W\\d|yyyy-?Www|\d\{4\}-W/i.test(pattern) || /iso\s*week|yyyy-w/.test(hint)) return isoWeekOf(day);
    if (rule.type === "integer" || rule.type === "number") {
      const iso = isoWeekOf(day);
      const n = Number((iso.split("-W")[1] || "").replace(/^0/, "") || iso.split("-W")[1]);
      return Number.isFinite(n) ? n : iso;
    }
    if (rule.format === "date" || /date|yyyy-mm-dd|周一|星期/.test(hint) || /^\^?\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(pattern)) return mondayOf(day);
    return mondayOf(day);
  }
  function coerce(value, propSchema) {
    if (!propSchema) return value;
    const t = propSchema.type;
    if (t === "array") return Array.isArray(value) ? value : String(value).split(/[,，\s]+/).filter(Boolean);
    if (t === "integer" || t === "number") {
      const n = Number(value);
      if (!Number.isFinite(n) || (t === "integer" && !Number.isInteger(n))) throw new Error("参数必须为" + (t === "integer" ? "整数" : "数字"));
      return n;
    }
    if (t === "string" && Array.isArray(value)) return value.join(",");
    return value;
  }

  /**
   * 依据接口需要的规范化参数 p[] + 当前表单值，构造实参对象。
   * ctx: 跨步骤上下文（如 category_id / resource_id），存在同名 schema 属性时自动注入。
   */
  function buildArgs(toolId, meta, form, schema, ctx) {
    const wrap = wrapperField(schema);
    const outer = schemaProps(schema);
    const inner = wrap && outer ? outer[wrap] : null;
    const working = inner
      ? { type: "object", properties: inner.properties, required: inner.required || [] }
      : schema;
    const props = schemaProps(working);
    const args = {};
    const need = (meta && meta.p) || [];

    const put = (canonical, value) => {
      if (value === undefined || value === null || value === "") return;
      let key = props ? findProp(props, ALIAS[canonical] || [canonical]) : null;
      if (!key && !props) key = (ALIAS[canonical] || [canonical])[0];
      if (!key) return;                                  // schema 里没有这个参数就不传
      args[key] = coerce(value, props ? props[key] : null);
    };

    // 卖家精灵 Keepa / 详情不带 marketplace 时会落到日本站；同一 ASIN 在 JP 也有占位页。
    // schema 即使没列出该字段，只要工具声明需要站点，也强制带上表单站点（空则默认 US）。
    const siteVal = (form && form.site) || "US";
    if (need.includes("site") || (props && findProp(props, ALIAS.site))) {
      const siteKey = props ? findProp(props, ALIAS.site) : "marketplace";
      if (siteKey) args[siteKey] = coerce(siteVal, props ? props[siteKey] : null);
      else args.marketplace = siteVal;
    }
    if (need.includes("asin")) {
      if (toolId === "get_asin_traffic" && ctx && Array.isArray(ctx.asins) && ctx.asins.length) put("asin", ctx.asins);
      else if (["get_asin_info","get_asin_orders_last_30_days","get_asin_traffic"].includes(toolId) && ctx && Array.isArray(ctx.watchlist) && ctx.watchlist.length) put("asin", ctx.watchlist);
      else if (toolId === "competitor_lookup" && ctx && Array.isArray(ctx.competitorAsins) && ctx.competitorAsins.length) put("asin", ctx.competitorAsins);
      else put("asin", form.asin);
    }
    if (need.includes("asins")) {
      const arr = ctx && Array.isArray(ctx.watchlist) && ctx.watchlist.length
        ? ctx.watchlist.slice()
        : String(form.asins || "").split(/[,，\s]+/).filter(Boolean);
      if (ctx && Array.isArray(ctx.variantAsins)) {
        ctx.variantAsins.forEach(a => { if (arr.indexOf(a) < 0) arr.push(a); });
      }
      put("asins", arr);
    }
    if (need.includes("keyword")) {
      const list = parseKeywords(form.keyword);
      put("keyword", list[0] || String(form.keyword || "").trim());
      if (list.length > 1) put("keywordList", list);
    }
    if (toolId === "competitor_lookup" && props && props.size && args.size === undefined) {
      const n = Array.isArray(args.asins) ? args.asins.length : 0;
      args.size = coerce(Math.max(20, n), props.size);
    }
    if (toolId === "traffic_source" && props && props.q && args.q === undefined) {
      args.q = form.asin || parseKeywords(form.keyword)[0] || form.keyword;
    }
    if (toolId === "review" && props && props.size && args.size === undefined) {
      const max = Number(props.size.maximum);
      args.size = coerce(Number.isFinite(max) ? Math.min(10, max) : 10, props.size);
    }
    if (need.includes("category")) put("category", form.category);
    if (need.includes("brand")) put("brand", form.brand);
    if (toolId === "get_category_keyword_analysis" && props && props.correlationType) args.correlationType = form.correlationType || "high";
    // 西柚类目接口普遍把周期设为必填。近 30 天口径只允许 period，
    // 不能同时带 cycle 或日期。
    if (props && props.cycleFilter) args.cycleFilter = { period: "last30days" };
    // 榜单接口使用独立的 reportPeriod。按服务端 schema 的类型生成，
    // 避免把通用 cycleFilter 错当成榜单周期。
    if (props && props.reportPeriod) {
      const rule = props.reportPeriod;
      if (rule.type === "object") {
        const periodKey = rule.properties && (rule.properties.period ? "period" : Object.keys(rule.properties)[0]);
        args.reportPeriod = periodKey ? {[periodKey]:(rule.properties[periodKey].enum||[])[0] || rule.properties[periodKey].default || "last30days"} : {period:"last30days"};
      } else args.reportPeriod = (rule.enum||[])[0] || rule.default || "last30days";
    }
    // 新品榜不带上架天数时返回类目畅销老品。近 180 天是“近期真正跑出来”的默认观察窗。
    if (toolId === "get_category_new_release_ranking" && props && props.rangeFilters &&
        props.rangeFilters.properties && props.rangeFilters.properties.streetDays) {
      args.rangeFilters = Object.assign({}, args.rangeFilters, { streetDays: [{ min: 0, max: 180 }] });
    }
    if (toolId === "get_category_primary_asins" && ctx && ctx.priceType && props) {
      const key = findProp(props, ["priceType", "price_type", "priceSegment", "price_segment"]);
      if (key) args[key] = coerce(ctx.priceType, props[key]);
    }
    // 类目关键词接口只接受显式的同月日期，不接受 period。使用表单结束日
    // 的上一个完整自然月，确保数据可比且不把未完月份当完整月份。
    if (["get_category_keyword_analysis","get_category_keywords"].includes(toolId) && props) {
      delete args.cycleFilter;
      const anchor = /^\d{4}-\d{2}-\d{2}$/.test(form.dateTo || "") ? new Date((form.dateTo || "") + "T00:00:00Z") : new Date();
      const y = anchor.getUTCMonth() === 0 ? anchor.getUTCFullYear()-1 : anchor.getUTCFullYear();
      const m = anchor.getUTCMonth() === 0 ? 12 : anchor.getUTCMonth();
      const mm = String(m).padStart(2,"0"), last = String(new Date(Date.UTC(y,m,0)).getUTCDate()).padStart(2,"0");
      const startKey=findProp(props,ALIAS.dateFrom),endKey=findProp(props,ALIAS.dateTo);
      if(startKey)args[startKey]=coerce(`${y}-${mm}-01`,props[startKey]);
      if(endKey)args[endKey]=coerce(`${y}-${mm}-${last}`,props[endKey]);
    }
    if (need.includes("range")) { put("dateFrom", form.dateFrom); put("dateTo", form.dateTo); }
    if (need.includes("date")) put("date", form.dateTo || form.dateFrom);
    if (need.includes("months")) {
      put("monthFrom", (form.dateFrom || "").slice(0, 7));
      put("monthTo", (form.dateTo || "").slice(0, 7));
    }
    if (["get_keyword_analysis_monthly","get_asin_order_trends","get_asin_traffic_trends_monthly"].includes(toolId)) {
      const toM = (form.dateTo || utcToday()).slice(0, 7);
      const fromM = (form.dateFrom || "").slice(0, 7);
      if (toM && monthSpan(fromM, toM) < 6) {
        put("monthFrom", addUtcMonths(form.dateTo || utcToday(), -5).slice(0, 7));
        put("monthTo", toM);
      }
    }
    if (props) {
      const weekFromKey = findProp(props, ALIAS.weekFrom);
      const weekToKey = findProp(props, ALIAS.weekTo);
      if (weekFromKey && args[weekFromKey] === undefined) {
        const v = weekValue(form.dateFrom || form.dateTo, props[weekFromKey]);
        if (v !== undefined && v !== "") args[weekFromKey] = coerce(v, props[weekFromKey]);
      }
      if (weekToKey && args[weekToKey] === undefined) {
        const v = weekValue(form.dateTo || form.dateFrom, props[weekToKey]);
        if (v !== undefined && v !== "") args[weekToKey] = coerce(v, props[weekToKey]);
      }
    }

    // 跨步骤上下文注入（类目类接口的前置产物）
    if (ctx && props) {
      Object.keys(ctx).forEach(canonical => {
        if (toolId === "bsr_prediction" && canonical === "categoryId") return;
        const key = findProp(props, ALIAS[canonical] || [canonical]);
        // 前置步骤生成的标识符比表单中的同名/近似字段更权威。
        // 例如 get_category_primary_asins 返回的 primaryAsin 必须覆盖左侧残留 ASIN。
        if (key && (args[key] === undefined || ["categoryId","resource","primaryAsin"].includes(canonical))) {
          if (canonical === "nodeIdPath" && !/^\d+(:\d+)*$/.test(String(ctx[canonical] || ""))) return;
          args[key] = coerce(ctx[canonical], props[key]);
        }
      });
    }
    if (toolId === "bsr_prediction" && props) {
      const bsrKey = findProp(props, ALIAS.bsr);
      if (bsrKey && args[bsrKey] === undefined && ctx && ctx.bsr != null) args[bsrKey] = coerce(ctx.bsr, props[bsrKey]);
      const catKey = findProp(props, ["categoryId", "category_id"]);
      if (catKey && args[catKey] === undefined && ctx && /^\d+$/.test(String(ctx.bsrCategoryId || ""))) args[catKey] = coerce(ctx.bsrCategoryId, props[catKey]);
    }

    // schema 里的必填项若仍缺失，用表单里最像的值兜一下
    if (props && Array.isArray(working.required)) {
      working.required.forEach(req => {
        if (args[req] !== undefined) return;
        if (WRAP_NAMES.indexOf(req) >= 0) return;
        const nr = norm(req);
        const guess =
          /asin/.test(nr) ? form.asin :
          /^q$/.test(nr) ? (form.asin || parseKeywords(form.keyword)[0] || form.keyword) :
          /keyword|term|query/.test(nr) ? (parseKeywords(form.keyword)[0] || form.keyword) :
          /brand/.test(nr) ? form.brand :
          /categoryid|nodeidpath|nodeid|resourceid|^cid$|^id$/.test(nr) ? null :
          /category/.test(nr) ? form.category :
          /^relations?$/.test(nr) ? ((ctx && Array.isArray(ctx.relations) && ctx.relations.length) ? ctx.relations : ["vav","sp","avp","bab","fbt","mib","csi","bav"]) :
          /market|site|country|region/.test(nr) ? form.site :
          /startweek|fromweek|weekfrom|beginweek/.test(nr) ? weekValue(form.dateFrom || form.dateTo, props[req]) :
          /endweek|toweek|weekto/.test(nr) ? weekValue(form.dateTo || form.dateFrom, props[req]) :
          /startdate|fromdate|begin/.test(nr) ? form.dateFrom :
          /enddate|todate/.test(nr) ? form.dateTo :
          /date|day/.test(nr) ? form.dateTo : null;
        if (guess) args[req] = coerce(guess, props[req]);
      });
    }
    if (wrap) fillInnerGaps(args, props, form, ctx);
    if (props) {
      for (const key of working.required || []) {
        if (args[key] !== undefined) continue;
        if (WRAP_NAMES.indexOf(key) >= 0) continue;
        throw new Error("缺少接口必填参数：" + key);
      }
      for (const key of Object.keys(args)) {
        const rule = props[key] || {}, value = args[key];
        if (rule.enum && !rule.enum.includes(value)) throw new Error("参数枚举不匹配：" + key);
        if (typeof value === "number" && ((rule.minimum !== undefined && value < rule.minimum) || (rule.maximum !== undefined && value > rule.maximum))) throw new Error("参数超出范围：" + key);
        if (typeof value === "string" && ((rule.minLength !== undefined && value.length < rule.minLength) || (rule.maxLength !== undefined && value.length > rule.maxLength))) throw new Error("参数长度不符：" + key);
      }
    }
    if (wrap) return { [wrap]: args };
    const requiredOuter = (schema && Array.isArray(schema.required)) ? schema.required : [];
    for (let i = 0; i < WRAP_NAMES.length; i++) {
      if (requiredOuter.indexOf(WRAP_NAMES[i]) >= 0 && args[WRAP_NAMES[i]] === undefined) return { [WRAP_NAMES[i]]: args };
    }
    return args;
  }

  /** 从返回结果里捞出后续步骤可能需要的 id（类目洞察资源等） */
  function harvestContext(data) {
    const found = {};
    const want = [
      ["categoryId", /^(category_?id|categoryid|node_?id|cid)$/i],
      ["resource", /^(resource_?id|insight_?resource_?id|task_?id|job_?id)$/i],
      ["primaryAsin", /^(primary_?asin|representative_?asin)$/i]
    ];
    const walk = (v, depth) => {
      if (!v || depth > 4) return;
      if (Array.isArray(v)) { v.slice(0, 5).forEach(x => walk(x, depth + 1)); return; }
      if (typeof v !== "object") return;
      Object.keys(v).forEach(k => {
        want.forEach(([canon, re]) => {
          if (re.test(k) && found[canon] === undefined && (typeof v[k] === "string" || typeof v[k] === "number")) {
            found[canon] = v[k];
          }
        });
        walk(v[k], depth + 1);
      });
    };
    walk(data, 0);
    return found;
  }

  function readableName(v) {
    if (v == null) return "";
    if (typeof v === "string") return v;
    return v.original || v.translated || v.name || v.value || "";
  }
  function normName(s) {
    return String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").replace(/\s+/g, " ").trim().replace(/s$/, "");
  }
  function collectCategories(data, out, depth) {
    if (!data || depth > 8) return out;
    if (Array.isArray(data)) { data.forEach(x => collectCategories(x, out, depth + 1)); return out; }
    if (typeof data !== "object") return out;
    if (data.categoryId && data.categoryName) out.push(data);
    Object.keys(data).forEach(k => collectCategories(data[k], out, depth + 1));
    return out;
  }
  /** 按用户品类词选最贴叶子类目，避免命中“Electric Kettles & Smart Drinkware”这类父级。 */
  function pickCategory(data, query) {
    const target = normName(query);
    const rows = collectCategories(data, [], 0);
    const seen = new Set();
    const scored = [];
    rows.forEach(r => {
      if (!r.categoryId || seen.has(r.categoryId) || r.available === false) return;
      seen.add(r.categoryId);
      const name = readableName(r.categoryName);
      const n = normName(name);
      if (!n) return;
      let score = 0;
      if (n === target) score += 40;
      else if (n.startsWith(target + " ") || n.endsWith(" " + target)) score += 22;
      else if (n.indexOf(target) >= 0) score += 12;
      if (/ and | smart | travel | car /.test(" " + n + " ") && n !== target) score -= 10;
      if (target.indexOf("gooseneck") < 0 && n.indexOf("gooseneck") >= 0) score -= 14;
      if (target.indexOf("travel") < 0 && n.indexOf("travel") >= 0) score -= 14;
      if (typeof r.level === "number") score += Math.min(4, r.level);
      scored.push({ categoryId: r.categoryId, name: name, score: score, raw: r });
    });
    scored.sort((a, b) => b.score - a.score || String(a.name).length - String(b.name).length);
    return scored[0] && scored[0].score > 0 ? scored[0] : null;
  }

  function pickSellerNode(data, query) {
    const root = data && data.data !== undefined ? data.data : data;
    const rows = Array.isArray(root) ? root : ((root && Array.isArray(root.items)) ? root.items : []);
    const target = normName(query);
    const scored = [];
    rows.forEach(r => {
      if (!r || !/^\d+(:\d+)*$/.test(String(r.nodeIdPath || ""))) return;
      const name = readableName(r.nodeLabelPath || r.nodeLabelLocale || "");
      const leaf = String(name.split(":").pop() || "");
      const n = normName(leaf);
      const full = normName(name);
      if (!n && !full) return;
      let nameScore = 0;
      if (n === target) nameScore += 40;
      else if (full === target) nameScore += 36;
      else if (n.indexOf(target) >= 0) nameScore += 18;
      else if (full.indexOf(target) >= 0) nameScore += 8;
      const tokens = target.split(" ").filter(t => t.length > 2);
      if (tokens.some(t => n.indexOf(t) >= 0 || full.indexOf(t) >= 0)) nameScore += 4;
      if (/ and | smart | travel | guitar | instrument | piano | violin /.test(" " + n + " " + full + " ")) nameScore -= 16;
      if (nameScore <= 0) return;
      let score = nameScore + Math.min(5, String(r.nodeIdPath).split(":").length);
      if (typeof r.products === "number" && r.products > 0 && r.products < 8000) score += 2;
      scored.push({ nodeIdPath: r.nodeIdPath, name: name, score: score, products: r.products });
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0] && scored[0].score > 0 ? scored[0] : null;
  }

  const RELATION_LABEL = {
    vav: "看了又看", fbt: "组合购买 FBT", ftb: "组合购买 FBT", mib: "捆绑销售",
    csi: "买了又买", bav: "看后还买", sp: "SP广告", avp: "关联广告",
    bab: "浏览后买", mie: "加购扩展", cob: "一起买", fsa: "四星推荐", bca: "品牌关联"
  };
  function relationLabel(code) {
    const c = String(code || "").toLowerCase();
    return RELATION_LABEL[c] || c;
  }
  function harvestVariantAsins(data) {
    const out = [];
    const add = v => {
      if (v && typeof v === "object") v = v.asin || v.childAsin || v.primaryAsin || "";
      const a = String(v == null ? "" : v).trim().toUpperCase();
      if (/^[A-Z0-9]{10}$/.test(a) && out.indexOf(a) < 0) out.push(a);
    };
    const walk = (v, depth) => {
      if (!v || depth > 8) return;
      if (typeof v === "string") { add(v); return; }
      if (Array.isArray(v)) { v.forEach(x => walk(x, depth + 1)); return; }
      if (typeof v !== "object") return;
      ["asin", "childAsin", "child_asin", "variationAsin", "primaryAsin"].forEach(k => { if (v[k] != null) add(v[k]); });
      ["data", "list", "items", "result", "children", "childAsins", "childAsinList", "child_asins", "variations", "variationList", "childList", "asins"].forEach(k => {
        if (v[k] != null) walk(v[k], depth + 1);
      });
    };
    walk(data, 0);
    return out.slice(0, 20);
  }

  window.Mcp = { McpClient, buildArgs, harvestContext, harvestVariantAsins, pickCategory, pickSellerNode, unwrap, ALIAS, parseKeywords, KEYWORD_MAX, wrapperField, relationLabel };
})();

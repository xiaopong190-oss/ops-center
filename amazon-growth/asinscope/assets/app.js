(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const LS_CFG = "asinscope-config-v1";
  const LS_PROJ = "asinscope-projects-v1";
  const LS_REP = "asinscope-reports-v1";
  const LS_SESSION = "asinscope-session-v1";
  const SESSION_DB = "asinscope-cache-v1";
  const state = {
    mode: "standard",
    comparisonAsins: [],
    cacheOnly: false,
    running: false,
    report: null,
    config: loadCfg()
  };

  function loadCfg() {
    try { return Object.assign({ weights: Object.assign({}, window.AsinScopeAnalyze.DEFAULT_WEIGHTS), thresholds: Object.assign({}, window.AsinScopeAnalyze.DEFAULT_THRESHOLDS) }, JSON.parse(localStorage.getItem(LS_CFG) || "{}")); }
    catch (_) { return { weights: Object.assign({}, window.AsinScopeAnalyze.DEFAULT_WEIGHTS), thresholds: Object.assign({}, window.AsinScopeAnalyze.DEFAULT_THRESHOLDS) }; }
  }
  function saveCfg() { localStorage.setItem(LS_CFG, JSON.stringify(state.config)); }
  function loadList(key) { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (_) { return []; } }
  function saveList(key, list) { localStorage.setItem(key, JSON.stringify(list.slice(0, 40))); }
  function toast(msg) { const el = $("#toast"); el.textContent = msg; el.className = "toast on"; setTimeout(() => { el.className = "toast"; }, 3200); }
  function usablePayload(out) {
    if (!out || out.payload === undefined || out.payload === null) return false;
    const p = out.payload;
    if (typeof p !== "object") return true;
    if (p.error === true || (p.data && p.data.error === true)) return false;
    if (p.code != null && /^(error|fail|failed|invalid)$/i.test(String(p.code))) return false;
    return true;
  }
  function friendlyError(msg) {
    const text = String(msg == null ? "" : msg);
    const miss = text.match(/missing required argument\s+\\?"?(\w+)/i);
    if (miss) return "接口缺少必填参数 " + miss[1] + "，这一步记为数据不足，其余步骤继续。";
    const json = text.replace(/^工具执行失败：/, "");
    try {
      const obj = JSON.parse(json);
      const inner = obj && obj.data && (obj.data.message || obj.data.error);
      if (inner) return String(inner);
    } catch (_) { /* keep */ }
    return text.slice(0, 180);
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function show(v) { return v == null || v === "" ? "—" : String(v); }
  function kv(pairs) {
    return '<dl class="kv">' + pairs.map(p => "<dt>" + esc(p[0]) + "</dt><dd>" + esc(show(p[1])) + "</dd>").join("") + "</dl>";
  }
  function tableHtml(headers, rows) {
    return "<table><thead><tr>" + headers.map(h => "<th>" + esc(h) + "</th>").join("") + "</tr></thead><tbody>" +
      (rows || []).map(r => "<tr>" + r.map(c => "<td>" + esc(c) + "</td>").join("") + "</tr>").join("") +
      "</tbody></table>";
  }
  function chapterHtml(b) {
    return (b.lead ? "<p class=\"lead\">" + esc(b.lead) + "</p>" : "") +
      ((b.facts || []).length ? kv(b.facts) : "") +
      ((b.conclusion || []).length ? "<h3>核心结论</h3><ul>" + b.conclusion.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "") +
      ((b.process || []).length ? "<h3>分析过程</h3><ol>" + b.process.map(p => "<li><b>步骤 " + esc(p.n) + " · " + esc(p.title) + "</b> " + esc(p.text) + "</li>").join("") + "</ol>" : "") +
      (b.tables || []).map(t => "<h3>" + esc(t.title) + "</h3>" + tableHtml(t.headers, t.rows) + (t.note ? "<p class=\"meta\">" + esc(t.note) + "</p>" : "")).join("") +
      "<p class=\"meta\">" + esc(b.note || "") + (b.boundary ? " " + esc(b.boundary) : "") + "</p>";
  }
  function ymd(d) { const p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
  function form() {
    return {
      targetAsin: ($("#asin").value || "").trim().toUpperCase(),
      site: $("#site").value || "US",
      dateFrom: $("#from").value,
      dateTo: $("#to").value,
      mode: state.mode,
      comparisonAsins: state.comparisonAsins.slice()
    };
  }
  function applyForm(f) {
    if (!f || typeof f !== "object") return;
    if (f.targetAsin) $("#asin").value = f.targetAsin;
    if (f.site) $("#site").value = f.site;
    if (f.dateFrom) $("#from").value = f.dateFrom;
    if (f.dateTo) $("#to").value = f.dateTo;
    if (f.mode) {
      state.mode = f.mode;
      document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("on", b.getAttribute("data-mode") === f.mode));
    }
    if (Array.isArray(f.comparisonAsins)) state.comparisonAsins = f.comparisonAsins.filter(a => /^[A-Z0-9]{10}$/.test(a)).slice(0, 5);
    if (f.cacheOnly != null) {
      state.cacheOnly = !!f.cacheOnly;
      $("#onlyCacheBtn").textContent = state.cacheOnly ? "仅用已有数据 · 开" : "仅用已有数据";
    }
    renderCmp();
  }
  function sessionSnap() {
    return { form: form(), cacheOnly: state.cacheOnly, report: state.report, savedAt: Date.now() };
  }
  function flushSession() {
    const snap = sessionSnap();
    try { localStorage.setItem(LS_SESSION, JSON.stringify(snap)); }
    catch (_) {
      try { localStorage.setItem(LS_SESSION, JSON.stringify({ form: snap.form, cacheOnly: snap.cacheOnly, savedAt: snap.savedAt })); }
      catch (__) { /* ignore */ }
    }
    if (!window.indexedDB) return;
    try {
      const req = indexedDB.open(SESSION_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("state");
      req.onsuccess = () => {
        const tx = req.result.transaction("state", "readwrite");
        tx.objectStore("state").put(snap, "session");
      };
    } catch (_) { /* ignore */ }
  }
  function loadSession() {
    try { return JSON.parse(localStorage.getItem(LS_SESSION) || "null"); }
    catch (_) { return null; }
  }
  function loadSessionDb() {
    if (!window.indexedDB) return Promise.resolve(null);
    return new Promise(resolve => {
      try {
        const req = indexedDB.open(SESSION_DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore("state");
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const tx = req.result.transaction("state", "readonly");
          const get = tx.objectStore("state").get("session");
          get.onsuccess = () => resolve(get.result || null);
          get.onerror = () => resolve(null);
        };
      } catch (_) { resolve(null); }
    });
  }
  function renderCmp() {
    $("#cmpList").innerHTML = state.comparisonAsins.map(a => '<span class="chip">' + a + ' <button data-del="' + a + '" type="button">×</button></span>').join("");
  }
  function renderHistory() {
    const reports = loadList(LS_REP);
    $("#history").innerHTML = reports.length
      ? reports.map((r, i) => '<p><button type="button" data-hist="' + i + '">' + esc(new Date(r.generatedAt).toLocaleString()) + " · " + esc(r.targetAsin) + " · " + esc(r.mode) + "</button></p>").join("")
      : "<p>还没有本工具的报告。</p>";
  }
  function setRunning(on, text) {
    state.running = !!on;
    document.body.classList.toggle("is-running", !!on);
    const btn = $("#runBtn");
    btn.disabled = !!on;
    btn.setAttribute("aria-busy", on ? "true" : "false");
    btn.textContent = on ? (text || "分析中…") : "开始分析";
    $("#cost").classList.toggle("running", !!on);
    if (on) $("#cost").textContent = (text || "分析中…") + " · 请勿重复点击";
    document.querySelectorAll("[data-mode]").forEach(b => { b.disabled = !!on; });
    $("#onlyCacheBtn").disabled = !!on;
    if ($("#clearBtn")) $("#clearBtn").disabled = !!on;
  }
  function showView(name) {
    const report = name === "report";
    $("#reportView").hidden = !report;
    $("#historyView").hidden = report;
    $("#tab-report").setAttribute("aria-selected", report ? "true" : "false");
    $("#tab-history").setAttribute("aria-selected", report ? "false" : "true");
  }
  function showReportBody(on) {
    if ($("#emptyBox")) $("#emptyBox").hidden = !!on;
    if ($("#reportBody")) $("#reportBody").hidden = !on;
  }
  function themeMode() {
    try { return localStorage.getItem("xiyou-theme") || "auto"; } catch (_) { return "auto"; }
  }
  function applyTheme() {
    const t = themeMode();
    if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
    const btn = $("#themeBtn");
    if (btn) btn.textContent = t === "dark" ? "深色" : t === "light" ? "浅色" : "自动";
  }
  function cycleTheme() {
    const order = ["auto", "light", "dark"];
    const next = order[(order.indexOf(themeMode()) + 1) % 3];
    try { localStorage.setItem("xiyou-theme", next); } catch (_) { /* ignore */ }
    applyTheme();
  }
  function renderConn(on, title, hint) {
    const bar = $("#connBar");
    if (!bar) return;
    bar.className = on ? "conn on" : "conn off";
    bar.innerHTML = '<span class="dot"></span><span>' + esc(title) + "</span>" + (hint ? '<span class="hint">' + esc(hint) + "</span>" : "");
  }
  function pingGateway() {
    if (!window.AsinScopeMcp || !window.AsinScopeMcp.stats) {
      renderConn(false, "网关未通", "连接组在调用台");
      return;
    }
    window.AsinScopeMcp.stats().then(s => {
      renderConn(true, "证据库 " + (s.size || 0), "新鲜 " + (s.fresh || 0) + (s.stale ? " · 过期 " + s.stale : "") + " · 连接组在调用台");
    }).catch(() => {
      renderConn(false, "网关未通", "连接组在调用台");
    });
  }
  async function refreshCost() {
    const f = form();
    if (!/^[A-Z0-9]{10}$/.test(f.targetAsin)) { $("#cost").textContent = "填入目标 ASIN 后显示缓存命中和预计新增调用。打开页面不会取数。"; return; }
    const requests = window.AsinScopeAnalyze.planRequests(f);
    const extra = window.AsinScopeAnalyze.fallbackBudget ? window.AsinScopeAnalyze.fallbackBudget(f) : 0;
    const est = await window.AsinScopeMcp.estimate(requests);
    $("#cost").textContent = "缓存命中 " + est.hits + "/" + est.total + (est.stale ? " · 过期 " + est.stale : "") + " · 预计新增调用 " + est.misses + " · 西柚 " + (est.byProvider.xiyou || 0) + " / 卖家精灵 " + (est.byProvider.sellersprite || 0) + (extra ? " · 西柚空结果最多再补卖家精灵 " + extra : "");
  }
  function renderReport(report) {
    state.report = report;
    const failHtml = (report.failed && report.failed.length)
      ? '<div class="metric-card"><b>取数失败</b>' + report.failed.slice(0, 8).map(esc).join("<br>") + (report.failed.length > 8 ? "<br>…" : "") + '<span class="grade 数据不足">' + report.failed.length + " 步</span></div>"
      : "";
    $("#cards").innerHTML = failHtml + (report.cards || []).map(c => '<div class="metric-card"><b>' + esc(c.label) + "</b>" + esc(c.value) + '<span class="grade ' + esc(c.grade) + '">' + esc(c.grade) + "</span></div>").join("");
    showReportBody(true);
    showView("report");
    $("#nav").innerHTML = (report.sections || []).map((s, i) => '<button type="button" data-sec="' + esc(s.id) + '" class="' + (i ? "" : "on") + '">' + esc(s.title) + "</button>").join("");
    $("#sections").innerHTML = (report.sections || []).map(s => {
      const ev = (s.evidence || []).map(e => (e.tool || "") + (e.retrievedAt ? " · " + new Date(e.retrievedAt).toLocaleString() : "") + (e.note ? " · " + e.note : "")).join("；");
      const b = s.body || {};
      let body = "";
      if (s.id === "s7") {
        const process = b.process || [];
        const conclusion = b.conclusion || [];
        body = (b.lead ? "<p class=\"lead\">" + esc(b.lead) + "</p>" : "") +
          kv([["评论样本", b.reviewCount], ["3–4★", b.midCount], ["1–2★", b.lowCount], ["主痛点", b.topPain], ["功能机会", b.topFeat]]) +
          (conclusion.length ? "<h3>核心结论</h3><ul>" + conclusion.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "") +
          (process.length ? "<h3>分析过程</h3><ol>" + process.map(p => "<li><b>步骤 " + esc(p.n) + " · " + esc(p.title) + "</b> " + esc(p.text) + "</li>").join("") + "</ol>" : "") +
          ((b.layers || []).length ? "<h3>分层结论</h3>" + tableHtml(["分层", "条数", "怎么用"], b.layers.map(r => [r.name, r.n, r.use])) : "") +
          ((b.themes || []).length ? "<h3>主题与方案</h3>" + tableHtml(["主题", "类型", "次数", "证据", "建议"], b.themes.map(r => [r.name, r.kind, r.n, r.grade, r.fix])) : "<p class=\"meta\">本样本没有命中主题词典，不编造痛点。</p>") +
          ((b.excerpts || []).length ? "<h3>评论摘录</h3>" + tableHtml(["星级", "分层", "日期", "命中", "摘要"], b.excerpts.map(r => [r.star, r.layer, r.date, r.hits, r.text])) : "") +
          "<p class=\"meta\">" + esc(b.note || "") + (b.boundary ? " " + esc(b.boundary) : "") + "</p>";
      } else if (b.process && b.process.length) {
        body = chapterHtml(b);
      } else {
        body = "<p>本章暂无结构化摘要。请硬刷新后用已有数据重跑。</p>";
      }
      return '<section class="section panel" id="' + esc(s.id) + '"><h2>' + esc(s.title) + ' <span class="grade ' + esc(s.grade) + '">' + esc(s.grade) + "</span></h2><p class=\"meta\">" + esc(ev) + "</p>" + body + "</section>";
    }).join("");
  }
  async function run(cacheOnly) {
    const f = form();
    if (state.running) return toast("正在分析，请等当前这一轮结束");
    if (!/^[A-Z0-9]{10}$/.test(f.targetAsin)) {
      $("#f-asin").classList.add("miss");
      return toast("请填写 10 位目标 ASIN");
    }
    $("#f-asin").classList.remove("miss");
    const requests = window.AsinScopeAnalyze.planRequests(f);
    const evidence = {};
    const evidenceKeys = [];
    setRunning(true, "分析中 0/" + requests.length);
    try {
      const failed = [];
      const called = new Set();
      const callKey = req => [req.provider || "", req.tool || "", (req.arguments && req.arguments.asin) || ""].join("|");
      async function callOne(req) {
        const k = callKey(req);
        if (called.has(k)) return;
        called.add(k);
        try {
          const out = await window.AsinScopeMcp.call(req.provider, req.tool, req.arguments, { cacheOnly: cacheOnly });
          if (out && out.key) evidenceKeys.push(out.key);
          if (usablePayload(out)) {
            if (req.arguments && req.arguments.asin && req.arguments.asin !== f.targetAsin) {
              const bucket = evidence["cmp:" + req.arguments.asin] || {};
              if (req.tool === "get_asin_info") bucket.info = out.payload;
              if (req.tool === "keepa_info") { bucket.keepa = out.payload; if (!bucket.info) bucket.info = out.payload; }
              if (req.tool === "asin_detail_with_coupon_trend") { bucket.detail = out.payload; if (!bucket.info) bucket.info = out.payload; }
              if (req.tool === "get_asin_orders_last_30_days" || req.tool === "asin_sales_trend") bucket.orders = out.payload;
              if (req.tool === "get_asin_traffic") bucket.traffic = out.payload;
              if (req.tool === "get_asin_bsr_trends") bucket.bsr = out.payload;
              evidence["cmp:" + req.arguments.asin] = bucket;
            } else {
              evidence[req.tool] = out;
            }
          } else {
            failed.push((req.provider === "sellersprite" ? "卖家精灵 · " : "") + req.tool + "：" + friendlyError((out && out.payload && (out.payload.message || (out.payload.data && out.payload.data.message))) || "返回空结果或接口报错"));
          }
        } catch (err) {
          failed.push((req.provider === "sellersprite" ? "卖家精灵 · " : "") + req.tool + "：" + friendlyError(err.message || err));
        }
      }
      for (let i = 0; i < requests.length; i++) {
        const req = requests[i];
        setRunning(true, "分析中 " + (i + 1) + "/" + requests.length + " · " + (req.provider === "sellersprite" ? "卖家精灵 · " : "西柚 · ") + req.tool);
        await callOne(req);
      }
      const extra = window.AsinScopeAnalyze.neededFallbacks(f, evidence);
      for (let j = 0; j < extra.length; j++) {
        const req = extra[j];
        setRunning(true, "补卖家精灵 " + (j + 1) + "/" + extra.length + " · " + req.tool);
        await callOne(req);
      }
      const report = window.AsinScopeAnalyze.build(evidence, f, state.config);
      report.evidenceKeys = evidenceKeys;
      report.failed = failed;
      renderReport(report);
      const reports = loadList(LS_REP);
      reports.unshift({ generatedAt: report.generatedAt, targetAsin: f.targetAsin, mode: f.mode, site: f.site, report: report });
      saveList(LS_REP, reports);
      const projects = loadList(LS_PROJ);
      projects.unshift({ id: f.targetAsin + "-" + Date.now(), name: f.targetAsin, targetAsin: f.targetAsin, comparisonAsins: f.comparisonAsins, site: f.site, dateFrom: f.dateFrom, dateTo: f.dateTo, createdAt: Date.now() });
      saveList(LS_PROJ, projects);
      toast(failed.length === requests.length
        ? ("全部 " + failed.length + " 步失败：" + (failed[0] || "没有可用连接或参数"))
        : (failed.length ? ("已生成，" + failed.length + " 步数据不足") : (cacheOnly ? "已用缓存生成" : "分析完成")));
      renderHistory();
      flushSession();
      refreshCost();
    } catch (e) {
      toast(e.message || String(e));
    }
    setRunning(false);
    refreshCost();
  }

  const today = new Date();
  $("#to").value = ymd(today);
  $("#from").value = ymd(new Date(today.getTime() - 89 * 864e5));
  renderCmp();
  renderHistory();
  applyTheme();
  pingGateway();
  function hydrate(snap) {
    if (snap && snap.form) applyForm(Object.assign({}, snap.form, { cacheOnly: snap.cacheOnly }));
    if (snap && snap.report) renderReport(snap.report);
    else {
      const last = loadList(LS_REP)[0];
      if (last && last.report) {
        renderReport(last.report);
        applyForm({
          targetAsin: last.targetAsin || last.report.targetAsin,
          site: last.site || last.report.site,
          mode: last.mode || last.report.mode,
          dateFrom: last.dateFrom || last.report.dateFrom,
          dateTo: last.dateTo || last.report.dateTo,
          comparisonAsins: last.comparisonAsins || last.report.comparisonAsins || []
        });
      }
    }
    renderHistory();
    refreshCost();
  }
  const boot = loadSession();
  if (boot) hydrate(boot);
  loadSessionDb().then(dbSnap => {
    if (!dbSnap) return;
    const localAt = boot && boot.savedAt ? boot.savedAt : 0;
    if (!boot || (dbSnap.savedAt && dbSnap.savedAt >= localAt)) hydrate(dbSnap);
  });
  function onFormChange() { flushSession(); refreshCost(); }
  $("#asin").addEventListener("input", () => { $("#f-asin").classList.remove("miss"); onFormChange(); });
  $("#asin").addEventListener("change", onFormChange);
  $("#site").addEventListener("change", onFormChange);
  $("#from").addEventListener("change", onFormChange);
  $("#to").addEventListener("change", onFormChange);
  document.querySelectorAll("[data-mode]").forEach(btn => btn.addEventListener("click", () => {
    state.mode = btn.getAttribute("data-mode");
    document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("on", b.getAttribute("data-mode") === state.mode));
    onFormChange();
  }));
  $("#cmp").addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    const a = $("#cmp").value.trim().toUpperCase();
    $("#cmp").value = "";
    if (!/^[A-Z0-9]{10}$/.test(a) || state.comparisonAsins.indexOf(a) >= 0 || state.comparisonAsins.length >= 5) return;
    state.comparisonAsins.push(a);
    renderCmp();
    onFormChange();
  });
  $("#cmpList").addEventListener("click", e => {
    const a = e.target.getAttribute("data-del");
    if (!a) return;
    state.comparisonAsins = state.comparisonAsins.filter(x => x !== a);
    renderCmp();
    onFormChange();
  });
  $("#runBtn").addEventListener("click", () => run(state.cacheOnly));
  $("#onlyCacheBtn").addEventListener("click", () => { state.cacheOnly = !state.cacheOnly; $("#onlyCacheBtn").textContent = state.cacheOnly ? "仅用已有数据 · 开" : "仅用已有数据"; flushSession(); toast(state.cacheOnly ? "不会发起新的 MCP 调用" : "将按缺失项取数"); });
  $("#themeBtn").addEventListener("click", cycleTheme);
  $("#connBar").addEventListener("click", () => toast("连接组在运营调用台设置。本页只读共享证据网关。"));
  $("#clearBtn").addEventListener("click", () => {
    if (state.running) return;
    $("#asin").value = "";
    $("#cmp").value = "";
    state.comparisonAsins = [];
    renderCmp();
    onFormChange();
    toast("已清空本页参数，没有删除历史报告");
  });
  document.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => showView(btn.getAttribute("data-view"))));
  $("#history").addEventListener("click", e => {
    const i = e.target.getAttribute("data-hist");
    if (i == null) return;
    const item = loadList(LS_REP)[Number(i)];
    if (item && item.report) {
      renderReport(item.report);
      flushSession();
      showView("report");
      toast("已打开本工具历史报告，未改调用台");
    }
  });
  $("#nav").addEventListener("click", e => {
    const id = e.target.getAttribute("data-sec");
    if (!id) return;
    document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("on", b.getAttribute("data-sec") === id));
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#cfgBtn").addEventListener("click", () => {
    $("#w-ads").value = state.config.weights.ads;
    $("#w-keyword").value = state.config.weights.keyword;
    $("#w-price").value = state.config.weights.price;
    $("#w-listing").value = state.config.weights.listing;
    $("#t-price").value = state.config.thresholds.priceMove;
    $("#cfg").hidden = false;
  });
  $("#cfgClose").addEventListener("click", () => { $("#cfg").hidden = true; });
  $("#cfgSave").addEventListener("click", () => {
    state.config.weights = {
      ads: Number($("#w-ads").value) || 30,
      keyword: Number($("#w-keyword").value) || 25,
      price: Number($("#w-price").value) || 25,
      listing: Number($("#w-listing").value) || 20
    };
    state.config.thresholds.priceMove = Number($("#t-price").value) || 5;
    saveCfg();
    $("#cfg").hidden = true;
    flushSession();
    toast("配置已保存在本页，不会改调用台");
  });
  window.addEventListener("pagehide", flushSession);
  window.addEventListener("beforeunload", flushSession);
  document.querySelectorAll(".app-switch a").forEach(a => a.addEventListener("click", flushSession));
})();

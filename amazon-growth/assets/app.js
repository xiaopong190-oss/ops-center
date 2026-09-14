/* 西柚数据调用台 — 应用逻辑 */
(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));
  const esc = t => String(t === null || t === undefined ? "" : t)
    .replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const LS = "xiyou-console-v1";
  const DEFAULT_CFG = {
    mode: "proxy",
    proxy: window.location && /^https?:$/.test(window.location.protocol) ? window.location.origin : "http://localhost:8787",
    endpoint: "",
    apiKey: "",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    anthropicKey: "",
    model: "claude-sonnet-4-6"
  };

  const state = {
    cfg: Object.assign({}, DEFAULT_CFG),
    form: {
      site: "US", asin: "", asins: "", keyword: "", category: "", brand: "",
      dateFrom: "", dateTo: ""
    },
    client: null,
    connected: false,
    serverTools: null,
    lists: {},
    activeList: "",
    scene: null,
    run: null      // { sceneId, steps:[{tool,cn,why,status,args,data,raw,ms,error}], ctx:{} , analysis }
  };
  let sceneQ = "";
  let sceneMod = "";
  let toolQ = "";
  let showAllParams = false;

  /* ---------------- 存取配置 ---------------- */
  let firstRun = true;
  function load() {
    try {
      const raw = localStorage.getItem(LS);
      if (raw) {
        firstRun = false;
        const o = JSON.parse(raw);
        Object.assign(state.cfg, o.cfg || {});
        Object.assign(state.form, o.form || {});
        if (o.lists && typeof o.lists === "object" && !Array.isArray(o.lists)) state.lists = o.lists;
        state.activeList = typeof o.activeList === "string" ? o.activeList : "";
      }
    } catch (e) { /* ignore */ }
    if (!state.form.dateTo) {
      const d = new Date();
      const p = n => String(n).padStart(2, "0");
      state.form.dateTo = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
      const s = new Date(d.getTime() - 29 * 864e5);
      state.form.dateFrom = s.getFullYear() + "-" + p(s.getMonth() + 1) + "-" + p(s.getDate());
    }
  }
  function save() {
    try { localStorage.setItem(LS, JSON.stringify({ cfg: state.cfg, form: state.form, lists: state.lists, activeList: state.activeList })); } catch (e) { /* ignore */ }
  }

  /* ---------------- 结果持久化（刷新后恢复） ---------------- */
  const RUN_DB = "xiyou-console-cache-v1";
  function runStore(mode) {
    if (!window.indexedDB) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(RUN_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("state");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("state", mode);
        const store = tx.objectStore("state");
        resolve({db, tx, store});
      };
    });
  }
  function idbGet(store, key) {
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function cloneRun(run) {
    try { return JSON.parse(JSON.stringify(run)); } catch (e) { return null; }
  }
  async function persistRun() {
    if (!state.run) return;
    state.run.savedAt = new Date().toISOString();
    state.run.sceneSnapshot = state.scene ? {
      id:state.scene.id, mod:state.scene.mod, name:state.scene.name, goal:state.scene.goal,
      needs:state.scene.needs, chain:state.scene.chain, out:state.scene.out
    } : null;
    try {
      const h = await runStore("readwrite");
      if (!h) return;
      h.store.put(state.run, "latest");
      const ok = state.run.steps.some(s => s.status === "ok");
      const bad = state.run.steps.some(s => s.status === "error");
      const unfinished = state.run.steps.some(s => s.status === "idle" || s.status === "running");
      if (ok && !bad && !unfinished && state.run.sceneId) h.store.put(state.run, "good:" + state.run.sceneId);
      await new Promise((resolve, reject) => { h.tx.oncomplete=resolve; h.tx.onerror=()=>reject(h.tx.error); });
      h.db.close();
    } catch (e) { console.warn("保存运行结果失败", e); }
  }
  async function loadGoodRun(sceneId) {
    if (!sceneId) return null;
    try {
      const h = await runStore("readonly");
      if (!h) return null;
      const value = await idbGet(h.store, "good:" + sceneId);
      h.db.close();
      if (!value || !Array.isArray(value.steps) || !value.steps.some(s => s.status === "ok")) return null;
      return value;
    } catch (e) { return null; }
  }
  async function clearPersistedRun() {
    try {
      const h = await runStore("readwrite");
      if (!h) return;
      h.store.delete("latest");
      await new Promise((resolve, reject) => { h.tx.oncomplete=resolve; h.tx.onerror=()=>reject(h.tx.error); });
      h.db.close();
    } catch (e) { /* ignore */ }
  }
  async function restoreRun() {
    try {
      const h = await runStore("readonly");
      if (!h) return false;
      let value = await idbGet(h.store, "latest");
      if (value && Array.isArray(value.steps) && !value.steps.some(s => s.status === "ok") && value.sceneId) {
        const good = await idbGet(h.store, "good:" + value.sceneId);
        if (good && Array.isArray(good.steps) && good.steps.some(s => s.status === "ok")) {
          good.lastFailedNote = ((value.steps.find(s => s.status === "error") || {}).error) || "上次运行失败";
          good.lastFailedAt = value.savedAt;
          value = good;
        }
      }
      h.db.close();
      if (!value || !Array.isArray(value.steps)) return false;
      value.steps.forEach(step => {
        if (step.status === "running") { step.status = "error"; step.error = "页面刷新时该步骤尚未完成，请重新运行工作流。"; }
      });
      const scene = window.SCENES[value.sceneId] || value.sceneSnapshot;
      if (!scene) return false;
      state.scene = scene; state.run = value;
      if (value.form) { Object.assign(state.form, value.form); fillForm(); }
      $$(".card").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.scene === scene.id)));
      renderRunPanel();
      toast(value.lastFailedNote ? "上次运行失败，已恢复此前成功结果" : "已恢复上次运行结果");
      if (reportHashOn() && (value.analysis || value.visualReport)) openReport();
      return true;
    } catch (e) { console.warn("恢复运行结果失败", e); return false; }
  }
  const CAT_CTX_LS = "xiyou-catctx-v1";
  function catCtxKey(form) {
    return String((form && form.site) || "") + "|" + String((form && form.category) || "").trim().toLowerCase();
  }
  function readCatCtx(form) {
    try {
      const map = JSON.parse(localStorage.getItem(CAT_CTX_LS) || "{}");
      const hit = map[catCtxKey(form)];
      if (hit && hit.categoryId && Date.now() - (hit.savedAt || 0) < 20 * 864e5) return hit;
    } catch (e) { /* ignore */ }
    return null;
  }
  function writeCatCtx(form, ctx) {
    if (!form || !ctx || !ctx.categoryId) return;
    try {
      const map = JSON.parse(localStorage.getItem(CAT_CTX_LS) || "{}");
      map[catCtxKey(form)] = { categoryId: ctx.categoryId, savedAt: Date.now() };
      localStorage.setItem(CAT_CTX_LS, JSON.stringify(map));
    } catch (e) { /* ignore */ }
  }

  /* ---------------- 监控清单 ---------------- */
  function renderLists() {
    const sel = $("#listSel");
    if (!sel) return;
    const names = Object.keys(state.lists).filter(n => n !== "__proto__" && n !== "constructor").sort();
    sel.innerHTML = '<option value="">— 未保存 —</option>' + names.map(n =>
      `<option value="${esc(n)}"${n === state.activeList ? " selected" : ""}>${esc(n)}</option>`).join("");
    $("#listDel").disabled = !state.activeList;
    $("#listDel").textContent = "删除";
    deleteConfirm = "";
  }
  function applyList(name) {
    if (!name || !Object.prototype.hasOwnProperty.call(state.lists, name)) {
      state.activeList = ""; save(); renderLists(); return;
    }
    Object.assign(state.form, state.lists[name]);
    state.activeList = name;
    $("#listName").value = name;
    fillForm(); save(); renderLists();
    if (state.scene) renderRunPanel();
    toast("已切到清单「" + name + "」");
  }
  function saveList() {
    if (state.busy || state.analyzing) return toast("请等待当前任务完成", "err");
    readForm();
    const name = ($("#listName").value || "").trim();
    if (!name) return toast("请先输入清单名称", "err");
    if (name.length > 80 || ["__proto__", "prototype", "constructor"].includes(name)) return toast("清单名称无效或过长", "err");
    state.lists[name] = Object.assign({}, state.form);
    state.activeList = name;
    save(); renderLists(); toast("已保存清单「" + name + "」");
  }
  let deleteConfirm = "";
  function delList() {
    if (state.busy || state.analyzing || !state.activeList) return;
    const name = state.activeList;
    if (deleteConfirm !== name) {
      deleteConfirm = name;
      $("#listDel").textContent = "确认删除";
      toast("再次点击确认删除「" + name + "」", "err");
      return;
    }
    delete state.lists[name]; state.activeList = "";
    $("#listName").value = "";
    save(); renderLists(); toast("已删除");
  }
  function exportLists() {
    if (!Object.keys(state.lists).length) return toast("还没有保存任何清单", "err");
    const payload = { kind:"xiyou-console-watchlists", version:1, exportedAt:new Date().toISOString(), lists:state.lists };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "xiyou-watchlists.json";
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    toast("已导出 " + Object.keys(state.lists).length + " 份清单");
  }
  function importLists(file) {
    if (!file || file.size > 1024 * 1024) return toast("导入文件不能超过 1 MB", "err");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || parsed.kind !== "xiyou-console-watchlists" || parsed.version !== 1 || !parsed.lists || Array.isArray(parsed.lists)) throw new Error("不是有效的西柚监控清单文件");
        let count = 0;
        Object.keys(parsed.lists).slice(0, 200).forEach(name => {
          if (!name || name.length > 80 || ["__proto__", "prototype", "constructor"].includes(name)) return;
          const value = parsed.lists[name];
          if (!value || typeof value !== "object" || Array.isArray(value)) return;
          const clean = {};
          Object.keys(FIELDS).forEach(field => { if (typeof value[field] === "string" && value[field].length <= 4000) clean[field] = value[field]; });
          state.lists[name] = clean; count++;
        });
        save(); renderLists(); toast("已导入 " + count + " 份清单");
      } catch (e) { toast("导入失败：" + e.message, "err"); }
    };
    reader.onerror = () => toast("导入失败：无法读取文件", "err");
    reader.readAsText(file);
  }

  /* ---------------- 提示条 ---------------- */
  let tt;
  function toast(msg, kind) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "toast on" + (kind ? " " + kind : "");
    clearTimeout(tt);
    tt = setTimeout(() => { el.className = "toast"; }, 2600);
  }

  /* ---------------- 渲染：场景 / 接口 ---------------- */
  function sceneMatch(s, m) {
    if (sceneMod && m.k !== sceneMod) return false;
    const q = sceneQ.trim().toLowerCase();
    if (!q) return true;
    const hay = [s.name, s.goal, s.id, (s.chain || []).map(c => c[0] + " " + (c[1] || "")).join(" ")].join(" ").toLowerCase();
    return hay.indexOf(q) >= 0;
  }
  function restorePressed() {
    $$(".card").forEach(c => c.setAttribute("aria-pressed", String(state.scene && c.dataset.scene === state.scene.id)));
  }
  function renderModChips() {
    const el = $("#modChips");
    if (!el) return;
    el.innerHTML = `<button type="button" class="chip${sceneMod ? "" : " on"}" data-mod="">全部</button>` +
      window.MODULES.map(m => `<button type="button" class="chip${sceneMod === m.k ? " on" : ""}" data-mod="${m.k}">${m.k} ${esc(m.name)}</button>`).join("");
  }
  function renderScenes() {
    const blocks = window.MODULES.map(m => {
      const scenes = m.scenes.filter(s => sceneMatch(s, m));
      if (!scenes.length) return "";
      return `
      <section class="mod">
        <div class="mod-hd">
          <span class="mod-k">${m.k}</span>
          <h3>${esc(m.name)}</h3>
          <span class="mod-d">${esc(m.desc)}</span>
        </div>
        <div class="grid">
          ${scenes.map(s => `
            <button class="card" type="button" data-scene="${s.id}" aria-pressed="false" title="${esc(s.chain.map(c => c[0]).join(" › "))}">
              <span class="card-t">${esc(s.name)}</span>
              <span class="card-g">${esc(s.goal)}</span>
              <span class="card-meta">
                ${s.needs.map(n => `<span class="chip need">${window.NEEDLABEL[n]}</span>`).join("")}
                <span class="chip n">${s.chain.length} 步</span>
              </span>
            </button>`).join("")}
        </div>
      </section>`;
    }).filter(Boolean).join("");
    $("#scenes").innerHTML = blocks || '<p class="finder-empty">没有匹配的场景。清空搜索或换一个模块再试。</p>';
    restorePressed();
  }

  function renderTools() {
    const avail = state.serverTools ? state.serverTools.reduce((a, t) => (a[t.name] = true, a), {}) : null;
    const q = toolQ.trim().toLowerCase();
    const blocks = window.GROUPS.map(g => {
      const ids = g.ids.filter(([id, cn, d]) => !q || [id, cn, d].join(" ").toLowerCase().indexOf(q) >= 0);
      if (!ids.length) return "";
      return `
      <section class="mod">
        <div class="mod-hd">
          <span class="mod-k">${ids.length} 个</span>
          <h3>${esc(g.k)}</h3>
          <span class="mod-d">${esc(g.d)}</span>
        </div>
        <div class="dict tablewrap">
          ${ids.map(([id, cn, d]) => `
            <div class="dict-row">
              <span class="dict-id">${esc(id)}${avail ? (avail[id] ? ' <b class="ok">●</b>' : ' <b class="off">○</b>') : ""}</span>
              <span class="dict-cn">${esc(cn)}</span>
              <span class="dict-d">${esc(d)}</span>
              <button class="dict-b" data-tool="${id}">单独运行</button>
            </div>`).join("")}
        </div>
      </section>`;
    }).filter(Boolean).join("");
    $("#tools").innerHTML = blocks || '<p class="finder-empty">没有匹配的接口。</p>';
  }

  /* ---------------- 表单 ---------------- */
  const FIELDS = { correlationType: "p-correlation", site: "p-site", asin: "p-asin", asins: "p-asins", keyword: "p-kw", category: "p-cat", brand: "p-brand", dateFrom: "p-from", dateTo: "p-to" };
  function fillForm() { Object.keys(FIELDS).forEach(k => { const el = $("#" + FIELDS[k]); if (el) el.value = state.form[k] || ""; }); }
  function readForm() { Object.keys(FIELDS).forEach(k => { const el = $("#" + FIELDS[k]); if (el) state.form[k] = (el.value || "").trim(); }); save(); }

  const NEED2FORM = { asin: "asin", asins: "asins", kw: "keyword", cat: "category", brand: "brand" };
  function parseKeywords(raw, max) {
    if (window.Mcp && window.Mcp.parseKeywords) return window.Mcp.parseKeywords(raw, max);
    const cap = max == null ? 8 : max;
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
  function filledKeywordSet(raw) {
    return new Set(parseKeywords(raw, -1).map(t => t.toLowerCase()));
  }
  function toolNeedsKeyword(tool) {
    return ((window.TOOL[tool] || {}).p || []).indexOf("keyword") >= 0;
  }
  function expandKeywordSteps(steps, form) {
    const kws = parseKeywords(form && form.keyword);
    if (!kws.length) return steps || [];
    const out = [];
    (steps || []).forEach(st => {
      if (!st || !toolNeedsKeyword(st.tool) || st.targetKeyword) { out.push(st); return; }
      kws.forEach(term => {
        out.push(Object.assign({}, st, {
          targetKeyword: term,
          why: (st.why || "") + (kws.length > 1 ? " · " + term : ""),
          cn: (st.cn || st.tool) + (kws.length > 1 ? " · " + term : "")
        }));
      });
    });
    return out;
  }
  function sceneNeedKeys(scene) {
    const needs = [...((scene && scene.needs) || [])];
    if ((scene && scene.chain || []).some(([id]) => ((window.TOOL[id] || {}).p || []).some(p => ["date","range","months"].includes(p)))) needs.push("date");
    return needs;
  }
  function requiredFieldIds(scene) {
    const ids = [];
    sceneNeedKeys(scene).forEach(n => {
      if (n === "date") { ids.push("f-from", "f-to"); return; }
      const key = NEED2FORM[n];
      if (key) ids.push("f-" + key);
    });
    return ids;
  }
  function relevantFieldIds(scene) {
    const ids = new Set(scene ? requiredFieldIds(scene) : []);
    if (!scene) return ids;
    (scene.chain || []).forEach(c => {
      (((window.TOOL[c[0]] || {}).p) || []).forEach(p => {
        if (p === "asin") ids.add("f-asin");
        if (p === "asins") ids.add("f-asins");
        if (p === "keyword") ids.add("f-keyword");
        if (p === "category") ids.add("f-category");
        if (p === "brand") ids.add("f-brand");
        if (p === "date" || p === "range" || p === "months") { ids.add("f-from"); ids.add("f-to"); }
      });
    });
    if ((scene.chain || []).some(c => c[0] === "get_category_keyword_analysis")) ids.add("f-correlationType");
    return ids;
  }
  function syncFieldVisibility(scene) {
    const usedIds = relevantFieldIds(scene);
    ["f-asin", "f-asins", "f-keyword", "f-category", "f-brand", "f-correlationType", "f-from", "f-to"].forEach(id => {
      const el = $("#" + id);
      if (!el) return;
      const used = !scene || usedIds.has(id);
      el.classList.remove("unused");
      if (!used) el.classList.add("unused");
      el.hidden = !!(scene && !showAllParams && !used);
    });
  }
  function markSceneFields(scene, miss) {
    $$(".field").forEach(f => { f.classList.remove("need"); f.classList.remove("miss"); });
    syncFieldVisibility(scene);
    if (!scene) return;
    requiredFieldIds(scene).forEach(id => { const el = $("#" + id); if (el) el.classList.add("need"); });
    (miss || []).forEach(id => { const el = $("#" + id); if (el) el.classList.add("miss"); });
    if ((miss || []).indexOf("f-from") >= 0) { const t = $("#f-to"); if (t) t.classList.add("miss"); }
  }
  function missingFor(scene) {
    const miss = [];
    const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || "") && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
    const needs = sceneNeedKeys(scene);
    needs.forEach(n => {
      if (n === "date") { if (!validDate(state.form.dateFrom) || !validDate(state.form.dateTo) || state.form.dateFrom > state.form.dateTo) miss.push("f-from"); return; }
      const key = NEED2FORM[n];
      if (key && !state.form[key]) miss.push("f-" + key);
      if (key === "asin" && state.form.asin && !/^[A-Z0-9]{10}$/i.test(state.form.asin)) miss.push("f-asin");
      if (key === "asins" && state.form.asins) {
        const values = String(state.form.asins).split(/[,，\s]+/).filter(Boolean);
        if (!values.length || values.length > 20 || values.some(v => !/^[A-Z0-9]{10}$/i.test(v))) miss.push("f-asins");
      }
      if (key === "keyword" && state.form.keyword) {
        const values = parseKeywords(state.form.keyword, -1);
        if (!values.length || values.length > 8) miss.push("f-keyword");
      }
    });
    return miss;
  }

  function quotaHaltMessage(err) {
    const msg = String((err && err.message) || err || "");
    if (window.ConnectionPool && window.ConnectionPool.certain({ message: msg })) return true;
    return /本组可用连接已耗尽|weekly credit|WeeklyCreditBalanceInsufficient|HTTP 402\b|HTTP 429\b/i.test(msg);
  }
  function skipReasonFor(st, ctx, haltReason) {
    const tool = st.tool;
    const provider = st.provider || "xiyou";
    if (haltReason && provider === "xiyou") return haltReason;
    if (tool === "search_market_insight_categories") {
      if (ctx && ctx.categoryId) return "已定位类目 " + ctx.categoryId + "，未重复搜索";
      return null;
    }
    if (tool === "generate_category_insight_resource") {
      if (!ctx || !ctx.categoryId) return "前置类目未定位，未调用（避免误报缺少 categoryId）";
      return null;
    }
    if (/^get_category_/.test(tool) || tool === "get_primary_asin_children") {
      if (!ctx || !ctx.categoryId) return "前置类目未定位，未调用（避免误报缺少 categoryId）";
      if (!ctx.resource) return "前置洞察资源未生成，未调用";
    }
    if (tool === "get_primary_asin_children" && !(ctx && ctx.primaryAsin)) return "前置代表 ASIN 未取到，未调用";
    if (tool === "get_asin_info" && !(state.form && /^[A-Z0-9]{10}$/i.test(state.form.asin || ""))) return "未填写主 ASIN，跳过价格对照";
    if (["get_keyword_info","get_keyword_asin_analysis","get_keyword_aba_trends"].includes(tool) && !(st.targetKeyword || parseKeywords((state.form && state.form.keyword) || "").length)) return "未填写关键词，跳过点击/转化集中度";
    if (["get_asin_keyword_rank_trends","get_asin_keyword_traffic_trends"].includes(tool) && !(st.targetKeyword || parseKeywords((state.form && state.form.keyword) || "").length)) return "未填写核心词，跳过卡位";
    if (tool === "get_multi_asin_keyword_comparison" && ctx && Array.isArray(ctx.watchlist) && ctx.watchlist.length < 2) return "监控名单不足 2 个 ASIN，跳过多 ASIN 词对比";
    if (tool === "traffic_listing" && ctx && ctx.relationStatEmpty) return "关联统计各类型都是 0，没有明细可拉";
    const MARKET_NODE_TOOLS = ["market_product_concentration","market_seller_country_distribution","market_seller_concentration","market_seller_type_concentration","market_listing_date_distribution","market_ebc_distribution"];
    if (MARKET_NODE_TOOLS.indexOf(tool) >= 0 && !(ctx && /^\d+(:\d+)*$/.test(String(ctx.nodeIdPath || "")))) return "未定位卖家精灵类目节点（nodeIdPath），未调用";
    if (tool === "asin_detail_with_coupon_trend") {
      const asin = (state.form && state.form.asin) || (state.run && state.run.form && state.run.form.asin) || "";
      if (!/^[A-Z0-9]{10}$/i.test(asin)) return "未填写主 ASIN，跳过叶子类目交叉确认";
    }
    if (tool === "bsr_prediction" && !(ctx && ctx.bsr != null && /^\d+$/.test(String(ctx.bsrCategoryId || "")))) return "未取到大类 BSR 和一级类目节点，未调用";
    return null;
  }

  function applySceneFieldHints(s) {
    const fromL = document.querySelector("#f-from label");
    const asinsL = document.querySelector("#f-asins label");
    const kwL = document.querySelector("#f-keyword label");
    if (fromL) fromL.textContent = s && s.id === "s11" ? "起始日期（建议跨度 ≥90 天）" : s && s.id === "s23" ? "起始日期（周期窗口，建议 ≥7 天）" : s && s.id === "s17" ? "起始日期（赛道格局建议 ≥90 天，最好 6 个月）" : s && s.id === "s12" ? "起始日期（走势建议 ≥6 个月）" : "起始日期";
    if (asinsL) asinsL.textContent = s && s.id === "s23" ? "对比 ASIN（监控名单，逗号分隔，≤8）" : "对比 ASIN（逗号分隔，≤20）";
    if (kwL) kwL.textContent = "关键词（逗号或换行分隔，≤8）";
  }

  function watchlistFrom(form) {
    const list = [];
    const add = v => {
      const a = String(v || "").trim().toUpperCase();
      if (/^[A-Z0-9]{10}$/.test(a) && list.indexOf(a) < 0 && list.length < 8) list.push(a);
    };
    add(form && form.asin);
    String((form && form.asins) || "").split(/[,，\s]+/).forEach(add);
    return list;
  }

  function harvestSellerNode(st, form, ctx) {
    if (!st || !ctx) return;
    if (st.tool === "product_node" && window.Mcp && window.Mcp.pickSellerNode) {
      const picked = window.Mcp.pickSellerNode(st.data, form && form.category);
      if (picked && /^\d+(:\d+)*$/.test(String(picked.nodeIdPath || ""))) {
        ctx.nodeIdPath = picked.nodeIdPath;
        if (picked.name) ctx.nodeLabelPath = picked.name;
      }
    }
    if (st.tool === "asin_detail_with_coupon_trend") {
      const root = st.data && st.data.data !== undefined ? st.data.data : st.data;
      const asin = root && root.asin && typeof root.asin === "object" ? root.asin : root;
      if (asin && /^\d+(:\d+)*$/.test(String(asin.nodeIdPath || ""))) {
        ctx.nodeIdPath = asin.nodeIdPath;
        const label = asin.nodeLabelPath;
        if (label) ctx.nodeLabelPath = typeof label === "string" ? label : (label.original || label.translated || label.name || "");
      }
    }
    if (st.tool === "asin_sales_trend" || st.tool === "asin_prediction" || st.tool === "asin_detail_with_coupon_trend") {
      harvestPredictionInputs(st.data, ctx);
    }
  }

  function harvestPredictionInputs(data, ctx) {
    if (!ctx) return;
    const root = data && data.data !== undefined ? data.data : data;
    const asin = (root && root.asin && typeof root.asin === "object") ? root.asin
      : (root && root.asinDetail && typeof root.asinDetail === "object") ? root.asinDetail
      : root;
    const rank = Number(asin && (asin.bsrRank ?? asin.bsr));
    if (Number.isFinite(rank) && rank > 0) ctx.bsr = rank;
    const path = asin && asin.nodeIdPath;
    if (/^\d+(:\d+)*$/.test(String(path || ""))) {
      ctx.bsrCategoryId = String(path).split(":")[0];
      ctx.bsrCategoryLabel = asin.nodeLabelPath ? String(asin.nodeLabelPath).split(":")[0] : ctx.bsrCategoryLabel;
    }
    if (/^\d+$/.test(String((asin && asin.categoryId) || "")) && !ctx.bsrCategoryId) ctx.bsrCategoryId = String(asin.categoryId);
    if (asin && asin.category && !ctx.bsrCategoryLabel) ctx.bsrCategoryLabel = String(asin.category);
    const days = (root && (root.dailyItemList || root.dayItemList)) || [];
    if (ctx.bsr == null && days[0] && Number(days[0].bsr) > 0) ctx.bsr = Number(days[0].bsr);
  }

  function harvestListingRelations(data, ctx) {
    if (!ctx) return [];
    const root = data && data.data !== undefined ? data.data : data;
    const items = (root && (Array.isArray(root.items) ? root.items : root.list)) || [];
    const rels = [];
    items.forEach(x => {
      const code = String((x && x.relation) || "").trim();
      const n = Number(x && x.count);
      if (code && Number.isFinite(n) && n > 0 && rels.indexOf(code) < 0) rels.push(code);
    });
    ctx.relations = rels;
    ctx.relationStatEmpty = !rels.length;
    return rels;
  }

  function relationLabel(code) {
    return window.Mcp && window.Mcp.relationLabel ? window.Mcp.relationLabel(code) : String(code || "");
  }

  function listingStepsFor(rels) {
    return (rels || []).slice(0, 6).map(code => ({
      tool: "traffic_listing",
      provider: "sellersprite",
      targetRelation: code,
      why: "拉「" + relationLabel(code) + "」导流 ASIN 明细",
      cn: "卖家精灵 · 关联列表 · " + relationLabel(code),
      status: "idle", args: null, data: null, ms: 0, error: null
    }));
  }

  function maybeInjectListingByRelation(scene, st, i) {
    if (!st || st.tool !== "traffic_listing_stat" || !state.run || state.run.ctx.listingByRelInjected) return;
    state.run.ctx.listingByRelInjected = true;
    const add = listingStepsFor(state.run.ctx.relations);
    const idx = state.run.steps.findIndex((s, j) => j > i && s.tool === "traffic_listing" && !s.targetRelation);
    if (idx >= 0) {
      if (add.length) state.run.steps.splice(idx, 1, ...add);
      else {
        state.run.steps[idx].status = "skip";
        state.run.steps[idx].error = "关联统计各类型都是 0，没有明细可拉";
      }
    } else if (add.length) state.run.steps.splice(i + 1, 0, ...add);
  }

  function splitGenericListingRetries() {
    if (!state.run) return;
    const rels = state.run.ctx && state.run.ctx.relations;
    if (!rels || !rels.length) return;
    const generic = state.run.steps.filter(s => s.tool === "traffic_listing" && !s.targetRelation && (s.status === "error" || s.status === "ok" || s.status === "idle"));
    const failedOrMixed = generic.filter(s => s.status === "error" || (s.status === "ok" && !(s.args && s.args.request && Array.isArray(s.args.request.relations) && s.args.request.relations.length === 1)));
    if (!failedOrMixed.length) return;
    const first = failedOrMixed[0];
    const idx = state.run.steps.indexOf(first);
    state.run.steps = state.run.steps.filter(s => failedOrMixed.indexOf(s) < 0);
    const add = listingStepsFor(rels);
    add.forEach(x => { x.status = "error"; x.error = "待按类型重拉来源"; });
    state.run.steps.splice(Math.max(0, idx), 0, ...add);
  }

  function stepCallCtx(st, form, ctx) {
    const next = Object.assign({}, form);
    if (st && st.targetAsin) next.asin = st.targetAsin;
    if (st && st.targetKeyword) next.keyword = st.targetKeyword;
    const nextCtx = (st && st.targetAsin) ? Object.assign({}, ctx || {}, { watchlist: null }) : Object.assign({}, ctx || {});
    if (st && st.targetRelation) nextCtx.relations = [st.targetRelation];
    if (st && Array.isArray(st.targetStars) && st.targetStars.length) nextCtx.starList = st.targetStars;
    return { form: next, ctx: nextCtx };
  }

  function expandReviewSteps(steps) {
    const out = [];
    (steps || []).forEach(st => {
      if (!st || st.tool !== "review" || st.targetStars) { out.push(st); return; }
      [
        { stars: [1, 2], why: "拉 1–2★ 差评，区分物流、期望和产品问题" },
        { stars: [3, 4], why: "拉 3–4★ 可改进痛点" },
        { stars: [5], why: "拉 5★ 看哪些功能被买过的人验证" }
      ].forEach(band => {
        out.push(Object.assign({}, st, {
          targetStars: band.stars,
          why: band.why,
          cn: ((st.cn || "卖家精灵 · Product Review") + " · " + band.stars.join("–") + "★")
        }));
      });
    });
    return out;
  }

  function pickWordbankCores(steps, n) {
    const map = new Map();
    const numish = v => {
      if (v === null || v === undefined || v === "") return 0;
      if (typeof v === "object") v = v.value !== undefined ? v.value : (v.metrics && v.metrics.value);
      const x = Number(v);
      return Number.isFinite(x) ? x : 0;
    };
    const eat = (step, weight) => {
      if (!step || step.status !== "ok") return;
      let d = step.data;
      if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { return; } }
      const collect = (v, depth) => {
        if (!v || depth > 10) return;
        if (Array.isArray(v)) { v.forEach(x => collect(x, depth + 1)); return; }
        if (typeof v !== "object") return;
        const raw = v.searchTerm || v.keyword || v.term;
        const term = raw && typeof raw === "object" ? (raw.value || raw.original || raw.translated || "") : raw;
        if (term) {
          const key = String(term).trim().toLowerCase();
          if (!key) return;
          const prev = map.get(key) || { term: String(term).trim(), volume: 0, sources: 0 };
          prev.volume = Math.max(prev.volume, numish(v.searchVolume || v.weeklySearchVolume || v.categoryRelevantSearchVolume));
          prev.sources += weight;
          map.set(key, prev);
          return;
        }
        Object.values(v).forEach(x => collect(x, depth + 1));
      };
      collect(d, 0);
    };
    eat(steps.find(s => s.tool === "get_asin_keywords"), 2);
    eat(steps.find(s => s.tool === "get_category_keywords"), 1);
    const filled = filledKeywordSet((state.form && state.form.keyword) || "");
    return [...map.values()].sort((a, b) => b.sources - a.sources || b.volume - a.volume).map(x => x.term).filter(t => !filled.has(String(t).toLowerCase())).slice(0, n || 5);
  }

  function maybeInjectWordbank(scene, st, i) {
    if (!scene || scene.id !== "s15" || !st || st.tool !== "get_category_keywords" || !state.run || state.run.ctx.kwInfoInjected) return;
    state.run.ctx.kwInfoInjected = true;
    const terms = pickWordbankCores(state.run.steps, 5);
    const add = terms.map(term => ({
      tool: "get_keyword_info",
      why: "给核心候选词「" + term + "」补搜索量、难度、CPC",
      targetKeyword: term,
      cn: (window.TOOL.get_keyword_info || {}).cn || "关键词基础市场指标",
      status: "idle", args: null, data: null, ms: 0, error: null
    }));
    if (add.length) state.run.steps.splice(i + 1, 0, ...add);
  }

  function stealRankOf(v) {
    if (!v || typeof v !== "object") return null;
    if (window.Analyst && window.Analyst.U && window.Analyst.U.organicRankOf) {
      const parsed = window.Analyst.U.organicRankOf(v);
      if (parsed !== null && parsed !== undefined) return parsed;
    }
    if (Array.isArray(v.ranks)) {
      const hit = v.ranks.find(x => x && ["or", "organic", "organicrank", "natural"].indexOf(String(x.position || x.displayPosition || x.pos || x.type || "").toLowerCase()) >= 0);
      const n = Number(hit && (hit.totalRank !== undefined ? hit.totalRank : hit.rank));
      if (Number.isFinite(n)) return n;
    }
    const bag = [v.orRank, v.organicRank, v.organicRankValue, v.naturalRank, v.organicSearchRank];
    if (typeof v.rank === "number" || typeof v.rank === "string") bag.push(v.rank);
    if (v.organic && typeof v.organic === "object") bag.push(v.organic.rank, v.organic.organicRank, v.organic.totalRank);
    for (const x of bag) {
      if (x === null || x === undefined || x === "") continue;
      const n = Number(typeof x === "object" ? (x.value !== undefined ? x.value : (x.metrics && x.metrics.value)) : x);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function pickStealCores(steps, nInfo, nArena) {
    const map = new Map();
    const numish = v => {
      if (v === null || v === undefined || v === "") return 0;
      if (typeof v === "object") v = v.value !== undefined ? v.value : (v.metrics && v.metrics.value);
      const x = Number(v);
      return Number.isFinite(x) ? x : 0;
    };
    const step = (steps || []).find(s => s.tool === "get_asin_keywords" && s.status === "ok");
    if (!step) return { info: [], arena: [] };
    let d = step.data;
    if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { return { info: [], arena: [] }; } }
    const collect = (v, depth) => {
      if (!v || depth > 10) return;
      if (Array.isArray(v)) { v.forEach(x => collect(x, depth + 1)); return; }
      if (typeof v !== "object") return;
      const raw = v.searchTerm || v.keyword || v.term;
      const term = raw && typeof raw === "object" ? (raw.value || raw.original || raw.translated || "") : raw;
      if (term) {
        const key = String(term).trim().toLowerCase();
        if (!key) return;
        const prev = map.get(key) || { term: String(term).trim(), volume: 0, rank: null };
        prev.volume = Math.max(prev.volume, numish(v.searchVolume || v.weeklySearchVolume || v.categoryRelevantSearchVolume));
        if (prev.rank === null) prev.rank = stealRankOf(v);
        map.set(key, prev);
        return;
      }
      Object.values(v).forEach(x => collect(x, depth + 1));
    };
    collect(d, 0);
    const filled = filledKeywordSet((state.form && state.form.keyword) || "");
    const all = [...map.values()].filter(t => !filled.has(t.term.toLowerCase()));
    const steal = all.filter(t => t.rank !== null && t.rank > 4).sort((a, b) => b.volume - a.volume);
    const rest = all.filter(t => !(t.rank !== null && t.rank > 4)).sort((a, b) => b.volume - a.volume);
    const ordered = steal.concat(rest);
    const info = ordered.slice(0, nInfo || 5).map(t => t.term);
    const arena = (steal.length ? steal : ordered).slice(0, nArena || 2).map(t => t.term);
    return { info, arena };
  }

  function maybeInjectSteal(scene, st, i) {
    if (!scene || scene.id !== "s18" || !st || st.tool !== "get_asin_keywords" || st.status !== "ok" || !state.run || state.run.ctx.stealInjected) return;
    state.run.ctx.stealInjected = true;
    const picked = pickStealCores(state.run.steps, 5, 2);
    const filled = filledKeywordSet((state.form && state.form.keyword) || "");
    const add = picked.info.map(term => ({
      tool: "get_keyword_info",
      why: "给反查词「" + term + "」补搜索量、难度、CPC",
      targetKeyword: term,
      cn: (window.TOOL.get_keyword_info || {}).cn || "关键词基础市场指标",
      status: "idle", args: null, data: null, ms: 0, error: null
    }));
    picked.arena.forEach(term => {
      if (filled.has(term.toLowerCase())) return;
      add.push({
        tool: "get_keyword_asin_analysis",
        why: "看「" + term + "」下竞品排名与流量占比是否稳固",
        targetKeyword: term,
        cn: (window.TOOL.get_keyword_asin_analysis || {}).cn || "关键词近 7 天的 ASIN 列表",
        status: "idle", args: null, data: null, ms: 0, error: null
      });
    });
    if (add.length) state.run.steps.splice(i + 1, 0, ...add);
  }

  /* ---------------- 选中场景 ---------------- */
  function selectScene(id, keepCached) {
    if (state.busy || state.analyzing) { toast("请等待当前任务完成", "err"); return; }
    closeReport();
    state.scene = window.SCENES[id];
    state.run = null;
    if (!keepCached) clearPersistedRun();
    $$(".card").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.scene === id)));
    renderRunPanel();
  }

  function renderRunPanel() {
    const s = state.scene;
    const panel = $("#runPanel");
    applySceneFieldHints(s);
    if (!s) {
      panel.innerHTML = '<div class="empty-box"><p class="empty">从下方选一个作业场景。</p><p class="hint">选中后，左侧会只留下这个场景需要的参数。</p></div>';
      markSceneFields(null, []);
      return;
    }

    const miss = missingFor(s);
    const needKeys = sceneNeedKeys(s);
    const run = state.run;
    const canAnalyze = !state.busy && !state.analyzing && run && run.steps.some(x => x.status === "ok");
    const stepCounts = run ? run.steps.reduce((a, x) => { a[x.status] = (a[x.status] || 0) + 1; return a; }, {}) : null;
    const stepLine = stepCounts
      ? ((stepCounts.ok || 0) + " 成功 · " + (stepCounts.error || 0) + " 失败 · " + (stepCounts.skip || 0) + " 跳过 · 共 " + run.steps.length + " 步")
      : (s.chain.length + " 步待运行");
    const history = run && Array.isArray(run.reportHistory) ? run.reportHistory : [];
    const selectedReport = run && run.selectedReportId ? history.find(x => x.id === run.selectedReportId) : null;
    const viewedReport = selectedReport ? selectedReport.visualReport : run && run.visualReport;
    const viewedText = selectedReport ? selectedReport.text : run && run.analysis;
    const historyOptions = history.slice().reverse().map((x, i) => `<option value="${esc(x.id)}" ${run && run.selectedReportId === x.id ? "selected" : ""}>历史版本 ${history.length - i} · ${esc(new Date(x.createdAt).toLocaleString())}</option>`).join("");

    const stepsHtml = (run ? run.steps : s.chain.map(([tool, why, provider]) => ({
      tool, why, provider:provider || "xiyou", cn: (window.TOOL[tool] || {}).cn || tool, status: "idle"
    }))).map((st, i) => stepHtml(st, i)).join("");

    panel.innerHTML = `
      <div class="run-hd">
        <div>
          <div class="run-mod">${esc(s.mod)}</div>
          <h2 class="run-t">${esc(s.name)}</h2>
          <p class="run-g">${esc(s.goal)}</p>
        </div>
        <div class="run-actions">
          <button class="btn btn-primary" id="runBtn" ${miss.length || state.busy || state.analyzing ? "disabled" : ""}>${state.busy ? "运行中…" : run ? "重新运行" : "运行工作流"}</button>
          ${run && run.steps.some(x=>x.status==="error") ? `<button class="btn btn-ghost" id="retryFailedBtn" ${state.busy || state.analyzing ? "disabled" : ""}>只重试失败步骤</button>` : ""}
          <button class="btn btn-primary btn-analyze" id="analyzeBtn" ${canAnalyze ? "" : "disabled"}>生成分析报告</button>
        </div>
      </div>
      ${run && run.savedAt ? `<p class="savedline">已保存 · ${esc(new Date(run.savedAt).toLocaleString())}</p>` : ""}
      ${run && run.lastFailedNote ? `<p class="warnline on">最近一次重跑失败，已保留本次成功结果。原因：${esc(run.lastFailedNote)}。西柚周额度用尽时请勿反复重跑。</p>` : ""}
      <p class="needline">本场景必填 ${needKeys.map(n => `<span class="chip need">${esc(window.NEEDLABEL[n] || n)}</span>`).join("")}</p>
      <p class="stepline">${esc(stepLine)}</p>
      ${miss.length ? `<p class="warnline on">请检查高对比必填项：ASIN 应为 10 位字母数字、对比最多 20 个；关键词用逗号/分号/换行分隔最多 8 个（词面空格保留）；日期须完整且开始日不晚于结束日。</p>` : ""}
      ${!canAnalyze && run ? `<p class="hint">至少有 1 步成功后才能生成报告。</p>` : ""}
      <div class="steps">${stepsHtml}</div>
      <div class="analysis-bar">
        <span class="hint">${esc(s.out)}</span>
      </div>
      ${run && run.analysis ? `<div class="report-history-bar"><label for="reportVersion">报告版本</label><select id="reportVersion"><option value="" ${!run.selectedReportId ? "selected" : ""}>当前版本 · ${esc(new Date(run.reportGeneratedAt || run.savedAt || Date.now()).toLocaleString())}</option>${historyOptions}</select><span>切换版本不会调用 MCP</span></div>` : ""}
      ${viewedText ? reportPeekHtml(viewedReport, viewedText) : '<div id="analysisOut"></div>'}
    `;
    const stage = $("#reportStage");
    if (stage && stage.hidden === false) fillReportDoc();

    markSceneFields(s, miss);
  }

  function currentVisual(visual, text) {
    const form = (state.run && state.run.form) || state.form || {};
    const scene = state.scene;
    const bits = [form.site, form.category, form.brand, form.asin].filter(Boolean);
    const dates = form.dateFrom && form.dateTo ? form.dateFrom + " ~ " + form.dateTo : "";
    const base = visual && typeof visual === "object" ? Object.assign({}, visual) : { text: text || "" };
    if (!base.text && text) base.text = text;
    if (!base.title && scene) base.title = scene.name;
    if (!base.goal && scene) base.goal = scene.goal;
    if (!base.kicker && scene) base.kicker = scene.mod;
    if (!base.meta || !base.meta.line) {
      base.meta = { line: [bits.join(" · "), dates].filter(Boolean).join("  ·  ") };
    }
    return base;
  }

  function reportPeekHtml(visual, text) {
    const bundled = currentVisual(visual, text);
    const title = window.Analyst.displayTitle ? window.Analyst.displayTitle(bundled, state.scene) : (state.scene && state.scene.name) || "报告";
    const preview = window.Analyst.renderPreview ? window.Analyst.renderPreview(bundled) : "<p class=\"report-preview-lead\">报告已生成。</p>";
    return `<div class="report-peek" id="analysisOut">
        <div class="report-peek-hd">
          <div>
            <div class="run-mod">结论摘要</div>
            <h3>${esc(title)}</h3>
          </div>
          <button class="btn btn-primary" id="openReportBtn">全屏阅读</button>
        </div>
        ${preview}
      </div>`;
  }

  function fillReportDoc() {
    const doc = $("#reportDoc");
    const run = state.run;
    if (!doc || !run) return;
    const history = Array.isArray(run.reportHistory) ? run.reportHistory : [];
    const selected = run.selectedReportId ? history.find(x => x.id === run.selectedReportId) : null;
    const visual = selected ? selected.visualReport : run.visualReport;
    const text = selected ? selected.text : run.analysis;
    if (!text && !visual) { doc.innerHTML = ""; return; }
    const bundled = currentVisual(visual, text);
    doc.innerHTML = window.Analyst.renderDocument ? window.Analyst.renderDocument(bundled, state.scene) : (window.Analyst.md ? window.Analyst.md(text || "") : esc(text || ""));
  }

  function reportHashOn() {
    try { return location.hash === "#report"; } catch (e) { return false; }
  }

  function setReportHash(on) {
    try {
      if (on && location.hash !== "#report") history.pushState({ report: true }, "", "#report");
      if (!on && location.hash === "#report") history.replaceState(null, "", location.pathname + location.search);
    } catch (e) { /* ignore */ }
  }

  function openReport() {
    const run = state.run;
    if (!run || !(run.analysis || run.visualReport)) return;
    fillReportDoc();
    const stage = $("#reportStage");
    if (stage) {
      stage.hidden = false;
      stage.scrollTop = 0;
    }
    if (document.body && document.body.classList) document.body.classList.add("report-open");
    setReportHash(true);
    const closeBtn = $("#closeReportBtn");
    if (closeBtn && closeBtn.focus) closeBtn.focus();
  }

  function closeReport() {
    const stage = $("#reportStage");
    if (stage) stage.hidden = true;
    if (document.body && document.body.classList) document.body.classList.remove("report-open");
    setReportHash(false);
  }

  function stepHtml(st, i) {
    const badge = {
      idle: '<span class="st st-idle">待运行</span>',
      running: '<span class="st st-run">调用中…</span>',
      ok: '<span class="st st-ok">成功 ' + (st.ms || 0) + 'ms</span>',
      error: '<span class="st st-err">失败</span>',
      skip: '<span class="st st-skip">已跳过</span>'
    }[st.status] || "";
    let body = "";
    if (st.status === "error") body = '<div class="step-err">' + esc(st.error) + "</div>";
    else if (st.status === "skip") body = '<div class="step-skip">' + esc(st.error) + "</div>";
    else if (st.status === "ok") body = renderResult(st, i);
    const used = st.source && st.source.name ? '<div class="step-args">连接 ' + esc(st.source.name) + "</div>" : "";
    const ev = Array.isArray(st.events) && st.events.length
      ? '<div class="step-args">' + st.events.map(x => esc((x.connection || "") + " · " + (x.state || ""))).join("；") + "</div>"
      : "";
    const moreLabel = st.status === "error" ? "查看失败原因" : st.status === "ok" ? "查看返回" : "详情";
    const more = (body || used || ev || st.args)
      ? `<details class="step-more"${st.status === "error" ? " open" : ""}><summary>${moreLabel}</summary>${st.args ? '<div class="step-args">实参 ' + esc(JSON.stringify(st.args)) + "</div>" : ""}${used}${ev}${body}</details>`
      : "";
    return `
      <div class="step-card ${st.status}">
        <div class="step-top">
          <span class="step-n">${i + 1}</span>
          <span class="step-id">${esc(st.tool)}</span>
          <span class="step-cn">${esc(st.cn)}</span>
          ${badge}
        </div>
        <p class="step-why">${esc(st.why)}</p>
        ${more}
      </div>`;
  }

  function findRows(data, depth = 0) {
    if (depth > 12) return null;
    if (Array.isArray(data) && data.length && typeof data[0] === "object" && !Array.isArray(data[0])) return data;
    if (data && typeof data === "object") {
      const keys = ["data", "list", "items", "rows", "records", "result", "keywords", "asins", "trends"];
      for (const k of keys) {
        if (Array.isArray(data[k]) && data[k].length && typeof data[k][0] === "object") return data[k];
      }
      for (const k of Object.keys(data)) {
        const v = data[k];
        if (Array.isArray(v) && v.length && typeof v[0] === "object" && !Array.isArray(v[0])) return v;
        if (v && typeof v === "object") { const r = findRows(v, depth + 1); if (r) return r; }
      }
    }
    return null;
  }

  function resultSite(st, rows) {
    const row = (rows || []).find(r => r && (r.marketplace || r.site || r.country));
    const args = st && st.args;
    const nested = args && args.request;
    const fromArgs = args && (args.marketplace || args.site || args.country || (nested && (nested.marketplace || nested.site)));
    return String((row && (row.marketplace || row.site || row.country)) || fromArgs || (state.form && state.form.site) || "US").toUpperCase();
  }
  function colScore(name, site) {
    const n = String(name || "").replace(/_/g, "").toLowerCase();
    const prefer = ["marketplace","site","keyword","searchterm","asin","brand","title","relation","count","searchvolume","aba","abarank","cpc","units","price","bsr","ratings"];
    const pi = prefer.indexOf(n);
    if (pi >= 0) return 200 - pi;
    if (n === "keywordcn" || n === "titlecn") return 150;
    const lang = (n.match(/^(?:keyword|title)(jp|ja|de|fr|it|es|uk|kr|pt)$/) || [])[1];
    if (lang) {
      const map = {jp:"JP",ja:"JP",de:"DE",fr:"FR",it:"IT",es:"ES",uk:"UK",kr:"KR",pt:"PT"};
      return map[lang] === site ? 80 : -40;
    }
    if (n === "departments" || n === "department" || n === "categorypath") return -30;
    return 10;
  }
  function pickDisplayCols(rows, site, limit) {
    const cols = [];
    (rows || []).slice(0, 20).forEach(r => Object.keys(r || {}).forEach(k => { if (cols.indexOf(k) < 0) cols.push(k); }));
    const ranked = cols.slice().sort((a, b) => colScore(b, site) - colScore(a, site) || cols.indexOf(a) - cols.indexOf(b));
    const kept = ranked.filter(c => colScore(c, site) >= 0);
    return (kept.length ? kept : ranked).slice(0, limit || 12);
  }
  function renderResult(st, i) {
    const rows = findRows(st.data);
    let table = "";
    if (rows) {
      const cols = [];
      rows.slice(0, 20).forEach(r => Object.keys(r || {}).forEach(k => { if (cols.indexOf(k) < 0) cols.push(k); }));
      const site = resultSite(st, rows);
      const use = pickDisplayCols(rows, site, 12);
      let ordered = rows;
      if (rows.length && rows.every(r => r && r.relation != null && r.count != null)) {
        ordered = rows.slice().sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
      }
      const show = ordered.slice(0, 30);
      const jpName = cols.some(c => /keywordjp|keywordja|titlejp|titleja/i.test(c));
      const note = "共 " + rows.length + " 条" + (rows.length > 30 ? "，表格显示前 30 条" : "") + (cols.length > 12 ? "；字段 " + cols.length + " 个，表格显示前 12 个" : "") + (site === "US" && jpName ? "。keywordJp 是英文词的日文译名，不是日本站" : "");
      table = `<div class="tablewrap"><table class="data"><thead><tr>${use.map(c => "<th>" + esc(c) + "</th>").join("")}</tr></thead>
        <tbody>${show.map(r => "<tr>" + use.map(c => {
          const v = r == null ? null : r[c];
          const t = (v === null || v === undefined) ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v));
          return "<td>" + esc(t.length > 80 ? t.slice(0, 80) + "…" : t) + "</td>";
        }).join("") + "</tr>").join("")}</tbody></table></div>
        <div class="tblnote">${esc(note)}</div>`;
    } else if (st.data && typeof st.data === "object" && !Array.isArray(st.data)) {
      // 单条对象：渲染成字段 / 值两列
      const entries = Object.keys(st.data).filter(k => k !== "_echo_args").map(k => {
        const v = st.data[k];
        const t = (v === null || v === undefined) ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v));
        return [k, t.length > 160 ? t.slice(0, 160) + "…" : t];
      });
      table = `<div class="tablewrap"><table class="data kv"><thead><tr><th>字段</th><th>值</th></tr></thead>
        <tbody>${entries.map(([k, v]) => "<tr><td>" + esc(k) + "</td><td>" + esc(v) + "</td></tr>").join("")}</tbody></table></div>
        <div class="tblnote">单条记录，${entries.length} 个字段</div>`;
    } else {
      table = '<div class="tblnote">返回不是结构化数据，展开看原始 JSON。</div>';
    }
    return table + `<details class="rawbox"><summary>原始 JSON</summary><pre class="raw">${esc((JSON.stringify(st.data, null, 2) || "null").slice(0, 20000))}</pre></details>`;
  }

  /* ---------------- 运行 ---------------- */
  async function ensureClient() {
    state.client = window.ConnectionPool && state.cfg.mode === "proxy" ? new window.ConnectionPool.Pool(state.cfg,"xiyou") : new window.Mcp.McpClient(state.cfg);
    const info = await state.client.connect();
    state.connected = true;
    state.serverTools = info.tools;
    renderConnBar(info);
    renderTools();
    return state.client;
  }

  function themeMode() {
    try { return localStorage.getItem("xiyou-theme") || "auto"; } catch (e) { return "auto"; }
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
    try { localStorage.setItem("xiyou-theme", next); } catch (e) { /* ignore */ }
    applyTheme();
  }

  function renderConnBar(info) {
    const bar = $("#connBar");
    if (!state.connected) {
      bar.className = "conn off";
      bar.innerHTML = '<span class="dot"></span><span>未连接</span><span class="hint">点此打开设置并测试连接</span>';
      return;
    }
    if (window.ConnectionPool && state.client && Array.isArray(state.client.entries)) {
      const names = state.client.entries.map(e => e.name).filter(Boolean);
      bar.className = "conn on";
      bar.innerHTML =
        '<span class="dot"></span>' +
        "<span>已连接 " + esc((info && info.server && info.server.name) || names[0] || "西柚组") + "</span>" +
        '<span class="hint">本组 ' + names.length + " 条：" + esc(names.join(" → ")) + "；额度不足时按此顺序切换</span>";
      return;
    }
    const known = Object.keys(window.TOOL);
    const server = (state.serverTools || []).map(t => t.name);
    const missing = known.filter(k => server.indexOf(k) < 0);
    const extra = server.filter(k => known.indexOf(k) < 0);
    bar.className = "conn on";
    bar.innerHTML =
      '<span class="dot"></span>' +
      "<span>已连接 " + esc((info && info.server && info.server.name) || "MCP") + "</span>" +
      '<span class="hint">服务端 ' + server.length + " 个工具"
      + (missing.length ? "；本地字典有 " + missing.length + " 个未在服务端出现" : "")
      + (extra.length ? "；服务端多出 " + extra.length + " 个" : "") + "</span>";
  }

  async function runScene() {
    if (state.busy || state.analyzing) return;
    const s = state.scene;
    if (!s) return;
    readForm();
    if (missingFor(s).length) { renderRunPanel(); toast("还有必填参数没填", "err"); return; }

    state.busy = true;
    const form = Object.assign({}, state.form);
    let shouldReport = false;
    try {
    try {
      if (!state.connected) await ensureClient();
      else if (state.client && window.ConnectionPool && state.client instanceof window.ConnectionPool.Pool) await state.client.connect();
      renderConnBar(state.client && state.client.entries ? { server: { name: (state.client.entries[state.client.index] || {}).name }, tools: state.serverTools || [] } : null);
    } catch (e) { toast("连接失败：" + e.message, "err"); renderConnBar(); return; }

    const prior = state.run && state.run.sceneId === s.id && state.run.steps.some(x => x.status === "ok")
      ? cloneRun(state.run) : null;

    state.run = {
      sceneId: s.id, ctx: {}, analysis: null, reportHistory: [], selectedReportId: null, form,
      steps: s.chain.map(([tool, why, provider]) => ({
        tool, why, provider:provider || "xiyou", cn: (window.TOOL[tool] || {}).cn || tool, status: "idle",
        args: null, data: null, ms: 0, error: null
      }))
    };
    if (s.id === "s23") state.run.ctx.watchlist = watchlistFrom(form);
    const cached = readCatCtx(form);
    if (cached && cached.categoryId) state.run.ctx.categoryId = cached.categoryId;
    if (window.Connections) state.run.steps.push(...window.Connections.plan(s.id).map(p=>({...p,status:"idle",args:null,data:null,error:null})));
    state.run.steps = expandKeywordSteps(state.run.steps, form);
    if (s.id === "s30") state.run.steps = expandReviewSteps(state.run.steps);
    const pools={xiyou:state.client};
    await persistRun();
    renderRunPanel();

    let haltReason = null;
    for (let i = 0; i < state.run.steps.length; i++) {
      const st = state.run.steps[i];
      const skip = skipReasonFor(st, state.run.ctx, haltReason);
      if (skip) {
        st.status = "skip";
        st.error = skip;
        maybeInjectWordbank(s, st, i);
        await persistRun();
        renderRunPanel();
        continue;
      }
      st.status = "running";
      await persistRun();
      renderRunPanel();
      try {
        const provider=st.provider||"xiyou";
        if(!pools[provider]){pools[provider]=new window.ConnectionPool.Pool(state.cfg,provider);await pools[provider].connect();}
        const client=pools[provider],meta=window.TOOL[st.tool],schema=client.schemas[st.tool]||null;
        const call=stepCallCtx(st,form,state.run.ctx);
        st.args=st.argsTemplate?window.Connections.template(call.form,st.argsTemplate,schema||st.schema):window.Mcp.buildArgs(st.tool,meta,call.form,schema,call.ctx);
        const r=await client.call(st.tool,st.args,{form,contextSource:state.run.ctxSource});
        st.source=r.source;st.events=r.events;st.args=r.args||st.args;
        st.data = r.data; st.ms = r.ms; st.status = "ok";
        harvestSellerNode(st, form, state.run.ctx);
        if (st.tool === "asin_competitor") {
          const rows = window.Analyst && window.Analyst.U ? window.Analyst.U.findRows(st.data) : [];
          const asins = [];
          rows.forEach(row => {
            const a = String((row && row.asin) || "").toUpperCase();
            if (/^[A-Z0-9]{10}$/.test(a) && asins.indexOf(a) < 0) asins.push(a);
          });
          if (asins.length) state.run.ctx.competitorAsins = asins.slice(0, 8);
        }
        if (st.tool === "get_asin_variations" || st.tool === "get_parent_asin_keywords") {
          const found = window.Mcp && window.Mcp.harvestVariantAsins ? window.Mcp.harvestVariantAsins(st.data) : [];
          if (found.length) {
            const cur = Array.isArray(state.run.ctx.variantAsins) ? state.run.ctx.variantAsins.slice() : [];
            found.forEach(a => { if (cur.indexOf(a) < 0) cur.push(a); });
            state.run.ctx.variantAsins = cur.slice(0, 20);
          }
        }
        if (st.tool === "traffic_listing_stat") {
          harvestListingRelations(st.data, state.run.ctx);
          maybeInjectListingByRelation(s, st, i);
        }
        if(provider==="xiyou"){
          Object.assign(state.run.ctx,window.Mcp.harvestContext(r.data),r.context||{});
          if (st.tool === "search_market_insight_categories" && window.Mcp.pickCategory) {
            const picked = window.Mcp.pickCategory(r.data, form.category);
            if (picked && picked.categoryId) state.run.ctx.categoryId = picked.categoryId;
          }
          writeCatCtx(form, state.run.ctx);
          if (s.id === "s3" && st.tool === "get_category_price_segment_trends") {
            const t = window.Analyst.topPriceType ? window.Analyst.topPriceType(st.data) : null;
            if (t) state.run.ctx.priceType = t;
          }
          if ((s.id === "s2" || s.id === "s24") && st.tool === "get_category_new_release_ranking") {
            const asins = window.Analyst.topNewAsins ? window.Analyst.topNewAsins(st.data, 6) : [];
            if (asins.length && !state.run.steps.some(x => x.tool === "get_asin_traffic")) {
              state.run.ctx.asins = asins;
              state.run.steps.splice(i + 1, 0, {
                tool: "get_asin_traffic",
                why: "对近 180 天出量新品拆近 7 天自然/广告流量，判断是自然接住还是广告托起来",
                cn: (window.TOOL.get_asin_traffic || {}).cn || "ASIN 近 7 天流量得分",
                status: "idle", args: null, data: null, ms: 0, error: null
              });
            }
          }
          if (s.id === "s23" && st.tool === "get_asin_info" && !state.run.ctx.watchInjected) {
            state.run.ctx.watchInjected = true;
            const extras = (state.run.ctx.watchlist || []).filter(a => a !== String(form.asin || "").toUpperCase()).slice(0, 5);
            const add = extras.flatMap(asin => [
              {tool:"get_asin_info_change_trends",why:"监控名单 "+asin+" 的 Listing 变更",targetAsin:asin,cn:(window.TOOL.get_asin_info_change_trends||{}).cn||"基础信息变动",status:"idle",args:null,data:null,ms:0,error:null},
              {tool:"get_asin_ad_change_trends",why:"监控名单 "+asin+" 的新广告",targetAsin:asin,cn:(window.TOOL.get_asin_ad_change_trends||{}).cn||"广告变化",status:"idle",args:null,data:null,ms:0,error:null}
            ]);
            if (add.length) state.run.steps.splice(i + 1, 0, ...add);
          }
          maybeInjectWordbank(s, st, i);
          maybeInjectSteal(s, st, i);
          state.run.ctxSource=r.source?.id;
        }
      } catch (e) {
        st.status = "error";
        st.error = e.message || String(e);
        if ((st.provider || "xiyou") === "xiyou" && quotaHaltMessage(st.error)) {
          haltReason = "前置步骤额度不足，未调用（避免重复消耗额度）";
        }
        maybeInjectWordbank(s, st, i);
      }
      await persistRun();
      renderRunPanel();
    }
    const okCount = state.run.steps.filter(x => x.status === "ok").length;
    if (!okCount) {
      const good = prior || await loadGoodRun(s.id);
      if (good && good.steps && good.steps.some(x => x.status === "ok")) {
        const note = (state.run.steps.find(x => x.status === "error") || {}).error || "本次运行失败";
        state.run = good;
        state.run.lastFailedNote = note;
        state.run.lastFailedAt = new Date().toISOString();
        await persistRun();
        toast("本次因额度或前置失败，已保留上次成功结果。失败原因：" + note, "err");
        shouldReport = true;
        return;
      }
    }
    await persistRun();
    toast("工作流完成：" + okCount + " / " + state.run.steps.length + " 步成功", okCount ? "" : "err");
    shouldReport = okCount > 0;
    } finally { state.busy = false; renderRunPanel(); }
    if (shouldReport) await maybeGenerateReport({open:false});
  }

  async function runSingleTool(id) {
    if (state.busy || state.analyzing) return;
    const tool = window.TOOL[id];
    if (!tool) return;
    const map = {keyword:"kw",category:"cat",range:"date",months:"date",date:"date"};
    state.scene = {id:"_tool_" + id, mod:"单接口", name:tool.cn, goal:tool.d,
      needs:(tool.p || []).map(p=>map[p] || p), chain:[[id,tool.d]], out:"整理返回数据并标注来源。"};
    state.run = null;
    $("#scenes").hidden = false; $("#tools").hidden = true;
    return runScene();
  }

  async function retryFailedSteps() {
    if (state.busy || state.analyzing || !state.run) return;
    const statOk = state.run.steps.find(s => s.tool === "traffic_listing_stat" && s.status === "ok");
    if (statOk) harvestListingRelations(statOk.data, state.run.ctx);
    splitGenericListingRetries();
    const failed = state.run.steps.filter(s => s.status === "error");
    if (!failed.length) return;
    const retryable = failed.slice();
    state.busy = true;
    const form = Object.assign({}, state.run.form || state.form);
    const pools = {xiyou:state.client};
    try {
      if (!state.connected) await ensureClient();
      else if (state.client && window.ConnectionPool && state.client instanceof window.ConnectionPool.Pool) await state.client.connect();
      pools.xiyou = state.client;
      let haltReason = null;
      for (const st of retryable) {
        const skip = skipReasonFor(st, state.run.ctx, haltReason);
        if (skip) { st.status = "skip"; st.error = skip; await persistRun(); renderRunPanel(); continue; }
        st.status = "running"; st.error = null; renderRunPanel();
        try {
          const provider=st.provider||"xiyou";
          if(!pools[provider]){pools[provider]=new window.ConnectionPool.Pool(state.cfg,provider);await pools[provider].connect();}
          const client=pools[provider],meta=window.TOOL[st.tool],schema=client.schemas[st.tool]||null;
          const call=stepCallCtx(st,form,state.run.ctx);
          st.args=st.argsTemplate?window.Connections.template(call.form,st.argsTemplate,schema||st.schema):window.Mcp.buildArgs(st.tool,meta,call.form,schema,call.ctx);
          const r=await client.call(st.tool,st.args,{form,contextSource:state.run.ctxSource});
          st.source=r.source;st.events=r.events;st.args=r.args||st.args;st.data=r.data;st.ms=r.ms;st.status="ok";
          harvestSellerNode(st, form, state.run.ctx);
          if (st.tool === "asin_competitor") {
            const rows = window.Analyst && window.Analyst.U ? window.Analyst.U.findRows(st.data) : [];
            const asins = [];
            rows.forEach(row => {
              const a = String((row && row.asin) || "").toUpperCase();
              if (/^[A-Z0-9]{10}$/.test(a) && asins.indexOf(a) < 0) asins.push(a);
            });
            if (asins.length) state.run.ctx.competitorAsins = asins.slice(0, 8);
          }
          if (st.tool === "get_asin_variations" || st.tool === "get_parent_asin_keywords") {
            const found = window.Mcp && window.Mcp.harvestVariantAsins ? window.Mcp.harvestVariantAsins(st.data) : [];
            if (found.length) {
              const cur = Array.isArray(state.run.ctx.variantAsins) ? state.run.ctx.variantAsins.slice() : [];
              found.forEach(a => { if (cur.indexOf(a) < 0) cur.push(a); });
              state.run.ctx.variantAsins = cur.slice(0, 20);
            }
          }
          if (st.tool === "traffic_listing_stat") {
            harvestListingRelations(st.data, state.run.ctx);
            maybeInjectListingByRelation(state.scene, st, state.run.steps.indexOf(st));
          }
          if(provider==="xiyou"){Object.assign(state.run.ctx,window.Mcp.harvestContext(r.data),r.context||{});if(st.tool==="search_market_insight_categories"&&window.Mcp.pickCategory){const picked=window.Mcp.pickCategory(r.data,form.category);if(picked&&picked.categoryId)state.run.ctx.categoryId=picked.categoryId;}writeCatCtx(form,state.run.ctx);state.run.ctxSource=r.source?.id;}
        } catch(e) {
          st.status="error";
          st.error=e.message||String(e);
          if ((st.provider || "xiyou") === "xiyou" && quotaHaltMessage(st.error)) {
            haltReason = "前置步骤额度不足，未调用（避免重复消耗额度）";
          }
        }
        await persistRun(); renderRunPanel();
      }
      toast("失败步骤重试完成："+retryable.filter(s=>s.status==="ok").length+" / "+retryable.length+" 步成功");
    } catch(e) {toast("重试失败："+(e.message||e),"err");}
    finally {state.busy=false;renderRunPanel();}
    if (state.run && state.run.steps.some(s=>s.status==="ok")) await maybeGenerateReport({open:false});
  }

  /* ---------------- 分析 ---------------- */
  function isOpsScene(scene) {
    return !!(scene && String(scene.id).indexOf("_tool_") !== 0);
  }

  async function maybeGenerateReport(opts) {
    if (!isOpsScene(state.scene)) return;
    await analyze(opts || {});
  }

  async function analyze(opts) {
    opts = opts || {};
    if (state.busy || state.analyzing || !state.run || !state.scene || !state.run.steps.some(s=>s.status === "ok")) return;
    state.analyzing = true;
    renderRunPanel();
    const btn = $("#analyzeBtn");
    if (btn) { btn.disabled = true; btn.textContent = "正在生成报告…"; }
    try {
      if (!Array.isArray(state.run.reportHistory)) state.run.reportHistory = [];
      if (state.run.analysis && !state.run.reportHistory.some(x => x.text === state.run.analysis)) {
        state.run.reportHistory.push({id:"report_" + Date.now(),createdAt:state.run.reportGeneratedAt || state.run.savedAt || Date.now(),text:state.run.analysis,visualReport:state.run.visualReport || null});
      }
      const result = await window.Analyst.report(state.cfg, state.scene, state.run.form || state.form, state.run.steps);
      state.run.analysis = result.text;
      state.run.visualReport = result;
      state.run.reportGeneratedAt = Date.now();
      state.run.selectedReportId = null;
      await persistRun();
    } catch (e) {
      state.analyzing = false;
      renderRunPanel();
      const out = $("#analysisOut");
      if (out) out.innerHTML = '<div class="analysis err">报告生成失败：' + esc(e.message) + '</div>';
      return;
    }
    state.analyzing = false;
    renderRunPanel();
    if (opts.open !== false) openReport();
  }

  /* ---------------- 指令文本（无 MCP 时的兜底） ---------------- */
  function promptText() {
    const s = state.scene, f = state.form;
    const lines = ["【站点】" + f.site];
    if (s.needs.indexOf("asin") >= 0) lines.push("【ASIN】" + (f.asin || "⚠ 待填写"));
    if (s.needs.indexOf("asins") >= 0) lines.push("【对比 ASIN】" + (f.asins || "⚠ 待填写"));
    if (s.needs.indexOf("kw") >= 0) lines.push("【关键词】" + (f.keyword || "⚠ 待填写"));
    if (s.needs.indexOf("cat") >= 0) lines.push("【类目 / 品类词】" + (f.category || "⚠ 待填写"));
    if (s.needs.indexOf("brand") >= 0) lines.push("【品牌】" + (f.brand || "⚠ 待填写"));
    if (s.needs.indexOf("date") >= 0) lines.push("【时间区间】" + (f.dateFrom && f.dateTo ? f.dateFrom + " ~ " + f.dateTo : "⚠ 待填写"));
    const steps = s.chain.map((c, i) => (i + 1) + ". " + c[0] + "（" + ((window.TOOL[c[0]] || {}).cn || "") + "）— " + c[1]).join("\n");
    return "用西柚 MCP 帮我做【" + s.name + "】。\n\n" + lines.join("\n") +
      "\n\n目标：" + s.goal + "\n\n请按顺序调用以下接口，每步先说明取到了什么，再进入下一步：\n" + steps +
      "\n\n" + s.out + "\n\n要求：接口无数据或参数不符时，直接说明原因再继续下一步，不要用估计值补齐；关键结论标注来自哪个接口。";
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast("已复制"); }
    catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast("已复制"); } catch (e2) { toast("复制失败，请手动选中", "err"); }
      document.body.removeChild(ta);
    }
  }

  /* ---------------- 设置弹层 ---------------- */
  function openSettings() {
    if (!window.OPS_IS_SUPER) return;
    const c = state.cfg;
    $("#s-mode").value = c.mode;
    $("#s-proxy").value = c.proxy;
    $("#s-token").value = c.proxyToken || "";
    $("#s-endpoint").value = c.endpoint;
    $("#s-key").value = c.apiKey;
    $("#s-authheader").value = c.authHeader;
    $("#s-authprefix").value = c.authPrefix;
    $("#s-anthropic").value = c.anthropicKey;
    $("#s-model").value = c.model;
    syncModeUI();
    $("#settings").hidden = false;
    const first = $("#s-mode");
    if (first && first.focus) first.focus();
  }
  function syncModeUI() {
    const proxy = $("#s-mode").value === "proxy";
    $("#row-proxy").hidden = !proxy;
    $("#proxyNote").hidden = !proxy;
    $("#directNote").hidden = proxy;
  }
  function saveSettings() {
    if (!window.OPS_IS_SUPER) { toast("仅超级管理员可修改连接设置", "err"); return; }
    if (state.busy || state.analyzing) { toast("请等待当前任务完成", "err"); return; }
    state.cfg = {
      mode: $("#s-mode").value,
      proxy: $("#s-proxy").value.trim(),
      proxyToken: $("#s-token").value.trim(),
      endpoint: $("#s-endpoint").value.trim(),
      apiKey: $("#s-key").value.trim(),
      authHeader: $("#s-authheader").value.trim() || "Authorization",
      authPrefix: $("#s-authprefix").value,
      anthropicKey: $("#s-anthropic").value.trim(),
      model: $("#s-model").value.trim() || "claude-sonnet-4-6"
    };
    save();
    state.connected = false; state.serverTools = null; state.client = null;
    renderConnBar(); renderTools();
    $("#settings").hidden = true;
    toast("设置已保存到本机浏览器");
  }

  async function testConn() {
    if (!window.OPS_IS_SUPER) { toast("仅超级管理员可测试连接", "err"); return; }
    if (state.busy || state.analyzing) { toast("请等待当前任务完成", "err"); return; }
    state.busy = true;
    const btn = $("#s-test");
    btn.disabled = true; btn.textContent = "连接中…";
    const before = Object.assign({}, state.cfg);
    state.cfg = {
      mode: $("#s-mode").value, proxy: $("#s-proxy").value.trim(), endpoint: $("#s-endpoint").value.trim(),
      proxyToken: $("#s-token").value.trim(),
      apiKey: $("#s-key").value.trim(), authHeader: $("#s-authheader").value.trim() || "Authorization",
      authPrefix: $("#s-authprefix").value, anthropicKey: $("#s-anthropic").value.trim(), model: $("#s-model").value.trim()
    };
    try {
      const info = await ensureClient();
      const n = (state.serverTools || []).length;
      $("#s-result").className = "s-result ok";
      $("#s-result").textContent = "连接成功，服务端返回 " + n + " 个工具。" +
        (info && info.serverInfo ? "" : "");
      toast("连接成功");
    } catch (e) {
      state.cfg = before;
      state.connected = false; state.client = null; state.serverTools = null;
      renderConnBar();
      $("#s-result").className = "s-result err";
      $("#s-result").textContent = "连接失败：" + (e.message || e);
    }
    btn.disabled = false; btn.textContent = "测试连接";
    state.busy = false;
    renderRunPanel();
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    document.addEventListener("click", e => {
      const card = e.target.closest(".card");
      if (card) {
        readForm();
        selectScene(card.dataset.scene);
        const w = $("#runWrap");
        if (w && w.getBoundingClientRect().top < 0) w.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      const tb = e.target.closest(".dict-b");
      if (tb) { runSingleTool(tb.dataset.tool); return; }

      const tab = e.target.closest(".tab");
      if (tab) {
        $$(".tab").forEach(t => t.setAttribute("aria-selected", String(t === tab)));
        $("#scenes").hidden = tab.dataset.view !== "scenes";
        $("#tools").hidden = tab.dataset.view !== "tools";
        if ($("#sceneFinder")) $("#sceneFinder").hidden = tab.dataset.view !== "scenes";
        if ($("#toolFinder")) $("#toolFinder").hidden = tab.dataset.view !== "tools";
        return;
      }
      const modChip = e.target.closest("#modChips [data-mod]");
      if (modChip) {
        sceneMod = modChip.getAttribute("data-mod") || "";
        renderModChips();
        renderScenes();
        return;
      }
      if (e.target.id === "runBtn") { runScene(); return; }
      if (e.target.id === "retryFailedBtn") { retryFailedSteps(); return; }
      if (e.target.id === "promptBtn") { readForm(); copy(promptText()); return; }
      if (e.target.id === "analyzeBtn") { analyze(); return; }
      if (e.target.id === "openReportBtn") { openReport(); return; }
      if (e.target.id === "closeReportBtn") { closeReport(); return; }
      if (e.target.id === "printReportBtn") { window.print(); return; }
      if (e.target.id === "themeBtn" || e.target.closest("#themeBtn")) { cycleTheme(); return; }
      if (e.target.id === "connBar" || e.target.closest("#connBar")) { openSettings(); return; }
      if (e.target.id === "openSettings" || e.target.closest("#openSettings")) { openSettings(); return; }
      if (e.target.id === "s-save") { saveSettings(); return; }
      if (e.target.id === "s-test") { testConn(); return; }
      if (e.target.id === "s-close" || e.target.id === "settings") { $("#settings").hidden = true; return; }
      if (e.target.id === "connectionsModal") { $("#connectionsModal").hidden = true; return; }
      if (e.target.id === "clearBtn") {
        ["asin", "asins", "keyword", "category", "brand"].forEach(k => state.form[k] = "");
        fillForm(); save(); renderRunPanel(); toast("参数已清空"); return;
      }
    });
    document.addEventListener("change", e => {
      if (e.target.id === "reportVersion" && state.run) {
        state.run.selectedReportId = e.target.value || null;
        persistRun();
        renderRunPanel();
      }
    });

    Object.keys(FIELDS).forEach(k => {
      const el = $("#" + FIELDS[k]);
      if (el) el.addEventListener("input", () => { readForm(); if (state.scene) renderRunPanel(); });
    });
    $("#s-mode").addEventListener("change", syncModeUI);
    if ($("#listSel")) {
      $("#listSel").addEventListener("change", e => applyList(e.target.value));
      $("#listSave").addEventListener("click", saveList);
      $("#listDel").addEventListener("click", delList);
      $("#listExport").addEventListener("click", exportLists);
      $("#listImport").addEventListener("click", () => $("#listFile").click());
      $("#listFile").addEventListener("change", e => {
        if (e.target.files && e.target.files[0]) importLists(e.target.files[0]);
        e.target.value = "";
      });
    }
    const sap = $("#showAllParams");
    if (sap) sap.addEventListener("change", () => {
      showAllParams = sap.checked;
      syncFieldVisibility(state.scene);
    });
    const sq = $("#sceneQ");
    if (sq) sq.addEventListener("input", e => { sceneQ = e.target.value; renderScenes(); });
    const tq = $("#toolQ");
    if (tq) tq.addEventListener("input", e => { toolQ = e.target.value; renderTools(); });
    document.addEventListener("keydown", e => {
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || "")) {
        e.preventDefault();
        const tab = document.querySelector('.tab[aria-selected="true"]');
        const box = tab && tab.dataset.view === "tools" ? $("#toolQ") : $("#sceneQ");
        if (box) box.focus();
        return;
      }
      if (e.key !== "Escape") return;
      const stage = $("#reportStage");
      if (stage && stage.hidden === false) { closeReport(); return; }
      if ($("#settings")) $("#settings").hidden = true;
      if ($("#connectionsModal")) $("#connectionsModal").hidden = true;
    });
    if (typeof window.addEventListener === "function") {
      window.addEventListener("hashchange", () => {
        if (reportHashOn()) openReport();
        else closeReport();
      });
      window.addEventListener("pagehide", () => { readForm(); save(); });
      document.querySelectorAll(".app-switch a").forEach(a => a.addEventListener("click", () => { readForm(); save(); }));
    }
  }

  /* ---------------- 启动 ---------------- */
  load();
  applyTheme();
  renderModChips();
  renderScenes();
  renderTools();
  fillForm();
  renderLists();
  renderConnBar();
  bind();
  (async function bootstrap() {
    const restored = await restoreRun();
    if (!restored) selectScene("s7", true);
    if (firstRun && window.OPS_IS_SUPER) openSettings();
  })();
})();

/* 数据与连接 · 全局层管理页 */
(function () {
  "use strict";
  const G = window.GrowthCore;
  const $ = s => document.querySelector(s);
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isSuper = !!window.OPS_IS_SUPER;

  function toast(msg, kind) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "toast on" + (kind ? " " + kind : "");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.className = "toast"; }, 3200);
  }

  /* ---------- 数据分层 ---------- */
  const GLOBALS = [
    ["#sec-conn", "接入与鉴权", "代理地址 · PROXY_TOKEN"],
    ["#sec-mcp", "MCP 连接组", "西柚 · 卖家精灵 · 顺序"],
    ["#sec-ai", "AI 模型 API", "服务 · 模型 · Key"],
    ["#sec-cache", "共享证据缓存", "接口结果复用"],
    ["#sec-ctx", "全局参数", "站点 · ASIN · 日期"]
  ];
  const TOOLS = [
    ["运营调用台", "/", ["连接", "AI", "缓存", "参数"], ["31 个场景定义", "运行记录与报告版本", "场景补充步骤"]],
    ["完整竞品分析", "/asinscope/", ["连接", "缓存", "站点 · ASIN · 日期"], ["归因权重与阈值", "九章报告", "任务历史"]],
    ["监控清单", "/watchlist/", ["连接", "缓存", "站点 · 日期"], ["品线与对照名单", "各期快照", "导入导出文件"]],
    ["推品计划", "/launch-plan/", ["新建时预填站点"], ["推品方案（云保存）", "九步表单与手写", "预算与 Plan B"]],
    ["关键词库", "/keywords/", ["连接", "AI", "站点"], ["SQP / 广告报告导入", "7 天本地分析缓存", "目标 ACOS / CPA"]]
  ];
  function renderLayers() {
    $("#globalsRow").innerHTML = GLOBALS.map(([href, t, d]) =>
      `<a class="gs-global" href="${href}"><strong>${esc(t)}</strong><span>${esc(d)}</span></a>`).join("");
    $("#toolsRow").innerHTML = TOOLS.map(([n, href, reads, own]) => `
      <div class="gs-tool">
        <a href="${href}" data-carry><strong>${esc(n)}</strong></a>
        <span class="gs-cap">读取全局</span>
        <span class="gs-chips">${reads.map(r => `<span>${esc(r)}</span>`).join("")}</span>
        <span class="gs-cap">本工具私有</span>
        <ul>${own.map(o => `<li>${esc(o)}</li>`).join("")}</ul>
      </div>`).join("");
  }

  /* ---------- 接入与鉴权 ---------- */
  function fillConn() {
    const c = G.connection();
    $("#g-mode").value = c.mode;
    $("#g-proxy").value = c.proxy;
    $("#g-token").value = c.proxyToken;
    ["#g-mode", "#g-proxy", "#g-token", "#g-save"].forEach(s => { $(s).disabled = !isSuper; });
    $("#connRole").textContent = isSuper ? "超级管理员可编辑" : "运营只读";
  }
  function setBar(ok, text) {
    const bar = $("#connBar");
    bar.className = "conn " + (ok ? "on" : "off");
    bar.innerHTML = '<span class="dot"></span><span>' + esc(text) + "</span>";
  }
  async function probe() {
    try {
      const s = await G.evidence("settings").stats();
      setBar(true, "网关已连通");
      return s;
    } catch (e) {
      setBar(false, "网关未通");
      throw e;
    }
  }
  $("#g-save").addEventListener("click", () => {
    if (!isSuper) return;
    G.setConnection({ mode: $("#g-mode").value, proxy: $("#g-proxy").value, proxyToken: $("#g-token").value });
    fillConn();
    toast("已保存，五个工具共用这份接入设置");
    refreshAll();
  });
  $("#g-test").addEventListener("click", async () => {
    const btn = $("#g-test"), out = $("#g-result");
    btn.disabled = true; btn.textContent = "测试中…";
    // 用表单里的值直接测试，不落盘，也不惊动其他已打开的工具
    const base = ($("#g-proxy").value.trim() || location.origin).replace(/\/+$/, "");
    const token = $("#g-token").value.trim();
    const h = token ? { "X-Proxy-Token": token } : {};
    try {
      const res = await fetch(base + "/api/evidence/stats", { headers: Object.assign({ "X-Evidence-Client": "settings" }, h) });
      if (!res.ok) throw Error("HTTP " + res.status + (res.status === 401 || res.status === 403 ? "（访问令牌不对）" : ""));
      let n = "";
      try { const r = await fetch(base + "/api/connections", { headers: h }); if (r.ok) n = " · 连接组 " + (((await r.json()).connections) || []).length + " 条"; } catch (_) { /* 可能无权读取 */ }
      out.className = "s-result ok"; out.textContent = "连接成功：证据网关可用" + n + "。" + (isSuper ? "点「保存」后五个工具生效。" : "");
    } catch (e) {
      out.className = "s-result err"; out.textContent = "连接失败：" + (e.message || e);
    } finally {
      btn.disabled = false; btn.textContent = "测试连接";
    }
  });

  /* ---------- MCP 连接组 ---------- */
  const PROVIDER = { xiyou: "西柚", sellersprite: "卖家精灵" };
  async function loadMcp() {
    const body = $("#mcpTable tbody");
    body.innerHTML = '<tr><td colspan="5" class="hint">读取中…</td></tr>';
    try {
      const list = await G.connections();
      if (!list.length) { body.innerHTML = '<tr><td colspan="5" class="hint">还没有连接。超级管理员可点「编辑连接组」添加。</td></tr>'; return; }
      const order = {};
      body.innerHTML = list.slice().sort((a, b) => (a.provider === "xiyou" ? 0 : 1) - (b.provider === "xiyou" ? 0 : 1)).map(c => {
        order[c.provider] = (order[c.provider] || 0) + 1;
        return `<tr><td class="mono">#${order[c.provider]}</td><td><span class="gs-prov gs-prov-${esc(c.provider)}">${esc(PROVIDER[c.provider] || c.provider)}</span></td><td>${esc(c.name)}</td><td class="mono">${esc(c.host || "—")}</td><td>${c.enabled ? '<span class="gs-ok">已启用</span>' : '<span class="gs-idle">已停用</span>'}</td></tr>`;
      }).join("");
    } catch (e) {
      body.innerHTML = `<tr><td colspan="5" class="hint">读不到连接组：${esc(e.message || e)}。请先检查上方接入设置。</td></tr>`;
    }
  }
  $("#mcpReload").addEventListener("click", loadMcp);

  /* ---------- AI ---------- */
  function renderAi() {
    const c = G.ai.current();
    $("#aiSummary").innerHTML =
      `<dt>服务</dt><dd>${esc(c.label)}</dd>` +
      `<dt>模型</dt><dd class="mono">${esc(c.model || "由服务端决定")}</dd>` +
      `<dt>本会话 Key</dt><dd>${c.hasKey ? "已填写" : "未填写（使用服务端配置）"}</dd>`;
  }
  G.on("ai", renderAi);

  /* ---------- 共享证据缓存 ---------- */
  const STAT_LABEL = { size: "缓存条数", fresh: "新鲜", stale: "已过期", hits: "命中次数", misses: "未命中", ttl: "有效期", ttlMs: "有效期 ms", bytes: "体积 bytes" };
  async function loadCache() {
    const dl = $("#cacheStats");
    try {
      const s = await probe();
      const rows = Object.keys(s || {}).filter(k => s[k] == null || typeof s[k] !== "object");
      dl.innerHTML = rows.length
        ? rows.map(k => `<dt>${esc(STAT_LABEL[k] || k)}</dt><dd class="mono">${esc(s[k])}</dd>`).join("")
        : "<dt>状态</dt><dd>网关已连通，暂无统计字段</dd>";
    } catch (e) {
      dl.innerHTML = `<dt>状态</dt><dd>网关未通：${esc(e.message || e)}</dd>`;
    }
  }
  $("#cacheReload").addEventListener("click", loadCache);

  /* ---------- 全局参数 ---------- */
  $("#c-site").innerHTML = G.context.sites.map(s => `<option>${s}</option>`).join("");
  const SOURCE = { console: "运营调用台", asinscope: "完整竞品分析", watchlist: "监控清单", keywords: "关键词库", settings: "数据与连接" };
  function renderCtxMeta() {
    const g = G.context.get();
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem(G.keys.ctx) || "{}") || {}; } catch (_) { /* ignore */ }
    $("#ctxMeta").textContent = raw.updatedAt
      ? "最近更新：" + new Date(raw.updatedAt).toLocaleString() + (raw.updatedBy ? " · 来自" + (SOURCE[raw.updatedBy] || raw.updatedBy) : "") + "。改这里会同步到其他打开的工具。"
      : "还没有全局参数。任一工具里填过的站点、ASIN、日期会自动出现在这里。";
    return g;
  }
  const binding = G.context.bind({
    site: "#c-site", asin: "#c-asin", asins: "#c-asins", keyword: "#c-kw",
    category: "#c-cat", brand: "#c-brand", dateFrom: "#c-from", dateTo: "#c-to"
  }, { source: "settings", seed: false });
  G.context.onChange(renderCtxMeta);
  $("#ctxClear").addEventListener("click", () => {
    G.context.clear("settings");
    Object.values(binding.elements).forEach(el => { if (el.tagName === "SELECT") el.selectedIndex = 0; else el.value = ""; });
    renderCtxMeta();
    toast("已清空全局参数；各工具里已填的值不受影响");
  });

  /* ---------- 主题 ---------- */
  function themeMode() { try { return localStorage.getItem("xiyou-theme") || "auto"; } catch (_) { return "auto"; } }
  function applyTheme() {
    const t = themeMode();
    if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
    $("#themeBtn").textContent = t === "dark" ? "深色" : t === "light" ? "浅色" : "自动";
  }
  $("#themeBtn").addEventListener("click", () => {
    const order = ["auto", "light", "dark"];
    try { localStorage.setItem("xiyou-theme", order[(order.indexOf(themeMode()) + 1) % 3]); } catch (_) { /* ignore */ }
    applyTheme();
  });

  function refreshAll() { loadCache(); loadMcp(); }
  G.on("connection", (c, meta) => { if (meta && meta.remote) { fillConn(); refreshAll(); } });

  document.querySelectorAll(".gs-super").forEach(el => { el.hidden = !isSuper; });
  G.carryParams();
  renderLayers();
  G.carryParams($("#toolsRow"));
  fillConn();
  renderAi();
  renderCtxMeta();
  applyTheme();
  refreshAll();
})();

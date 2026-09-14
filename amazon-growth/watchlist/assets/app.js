(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const LS_LISTS = "watchlist-lists-v1";
  const LS_REP = "watchlist-reports-v1";
  const LS_SESSION = "watchlist-session-v1";
  const CONSOLE_LS = "xiyou-console-v1";
  const LANE_SLOTS = 5;
  function emptyLane() { return { category: "", asin: "", peers: [] }; }
  function emptyLanes() { return Array.from({ length: LANE_SLOTS }, emptyLane); }
  const state = {
    lanes: emptyLanes(),
    cacheOnly: false,
    savePeriod: true,
    running: false,
    report: null,
    lists: {},
    activeList: ""
  };
  let deleteConfirm = "";

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "toast on";
    setTimeout(() => { el.className = "toast"; }, 3200);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
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
    return text.slice(0, 180);
  }
  function ymd(d) {
    const p = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "") || fallback; } catch (_) { return fallback; }
  }
  function saveJson(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) { /* ignore */ }
  }
  function filledLanes() {
    return window.WatchlistAnalyze.lanesFrom({ lanes: state.lanes });
  }
  function listFromFormLike(v) {
    if (!v || typeof v !== "object") return null;
    const lanes = window.WatchlistAnalyze.lanesFrom(v);
    const asins = window.WatchlistAnalyze.rosterFrom({
      lanes: lanes,
      asin: v.asin || v.targetAsin,
      asins: Array.isArray(v.asins) ? v.asins : undefined,
      asinsText: typeof v.asins === "string" ? v.asins : (Array.isArray(v.comparisonAsins) ? v.comparisonAsins.join(",") : "")
    });
    if (!asins.length && Array.isArray(v.comparisonAsins)) {
      v.comparisonAsins.forEach(a => {
        const x = String(a || "").toUpperCase();
        if (/^[A-Z0-9]{10}$/.test(x) && asins.indexOf(x) < 0) asins.push(x);
      });
    }
    if (!asins.length) return null;
    return {
      site: v.site || "US",
      lanes: lanes,
      asins: asins.slice(0, 8),
      keywords: String(v.keywords || v.keyword || ""),
      dateFrom: v.dateFrom || "",
      dateTo: v.dateTo || ""
    };
  }
  function snapsOf(list) {
    return list && Array.isArray(list.snapshots) ? list.snapshots : [];
  }
  function lastSnap(list) {
    return snapsOf(list)[0] || null;
  }
  function packList(base, extra) {
    const cur = base && typeof base === "object" ? base : {};
    const next = extra && typeof extra === "object" ? extra : {};
    const lanes = Array.isArray(next.lanes) ? next.lanes.slice(0, LANE_SLOTS) : (Array.isArray(cur.lanes) ? cur.lanes.slice(0, LANE_SLOTS) : []);
    const asins = Array.isArray(next.asins) ? next.asins.slice(0, 8) : (cur.asins || []).slice();
    return {
      site: next.site || cur.site || "US",
      lanes: lanes,
      asins: asins.length ? asins : window.WatchlistAnalyze.rosterFrom({ lanes: lanes }),
      keywords: next.keywords != null ? String(next.keywords) : String(cur.keywords || ""),
      dateFrom: next.dateFrom != null ? next.dateFrom : (cur.dateFrom || ""),
      dateTo: next.dateTo != null ? next.dateTo : (cur.dateTo || ""),
      snapshots: snapsOf(next).length ? snapsOf(next) : snapsOf(cur),
      lastAt: next.lastAt || cur.lastAt || 0
    };
  }
  function putList(lists, name, next) {
    if (!name || !next) return;
    const cur = lists[name];
    if (!cur || !(cur.asins || []).length) lists[name] = packList(next, next);
    else if ((next.asins || []).length > (cur.asins || []).length) lists[name] = packList(cur, next);
  }
  function persistLists() {
    const packed = { lists: state.lists, activeList: state.activeList };
    try {
      localStorage.setItem(LS_LISTS, JSON.stringify(packed));
      return;
    } catch (_) { /* 可能超配额，先削旧快照 */ }
    Object.keys(state.lists).forEach(n => {
      const L = state.lists[n];
      if (snapsOf(L).length > 3) L.snapshots = snapsOf(L).slice(0, 3);
    });
    try { localStorage.setItem(LS_LISTS, JSON.stringify({ lists: state.lists, activeList: state.activeList })); } catch (__) { /* ignore */ }
  }
  function attachSnapshot(name, report, f) {
    if (!name || !report) return;
    const cur = state.lists[name] || {};
    const snaps = snapsOf(cur).slice();
    const at = report.generatedAt || Date.now();
    if (!snaps.some(s => s && s.generatedAt === at)) {
      snaps.unshift({
        generatedAt: at,
        asins: (f && f.asins) || report.asins || [],
        lanes: (f && f.lanes) || report.lanes || [],
        site: (f && f.site) || report.site || "US",
        dateFrom: (f && f.dateFrom) || report.dateFrom || "",
        dateTo: (f && f.dateTo) || report.dateTo || "",
        report: report
      });
    }
    state.lists[name] = packList(cur, Object.assign({}, f || {}, { snapshots: snaps.slice(0, 12), lastAt: at }));
    persistLists();
    renderLists();
  }
  function adoptLooseReports() {
    loadReports().forEach(item => {
      if (!item || !item.report) return;
      let name = item.listName && state.lists[item.listName] ? item.listName : "";
      if (!name) {
        const key = (item.asins || []).join(",");
        name = Object.keys(state.lists).find(n => (state.lists[n].asins || []).join(",") === key) || "";
      }
      if (!name && (item.asins || []).length) name = item.listName || ("监控 · " + item.asins[0]);
      if (!name) return;
      if (!state.lists[name]) state.lists[name] = packList(null, { asins: item.asins, site: item.site, dateFrom: item.report.dateFrom, dateTo: item.report.dateTo });
      attachSnapshot(name, item.report, { asins: item.asins, site: item.site, dateFrom: item.report.dateFrom, dateTo: item.report.dateTo });
    });
  }
  function migrateConsoleLists() {
    const own = loadJson(LS_LISTS, { lists: {}, activeList: "" }) || { lists: {}, activeList: "" };
    const lists = Object.assign({}, own.lists || {});
    const consoleState = loadJson(CONSOLE_LS, {});
    const src = consoleState && consoleState.lists && typeof consoleState.lists === "object" ? consoleState.lists : {};
    Object.keys(src).forEach(name => {
      if (!name || name.length > 80 || ["__proto__", "prototype", "constructor"].includes(name)) return;
      putList(lists, name, listFromFormLike(src[name]));
    });
    putList(lists, "调用台当前", listFromFormLike(consoleState && consoleState.form));
    const scope = loadJson("asinscope-session-v1", null);
    putList(lists, "竞品分析当前", listFromFormLike(scope && scope.form));
    const packed = {
      lists: lists,
      activeList: own.activeList || consoleState.activeList || (lists["调用台当前"] ? "调用台当前" : Object.keys(lists)[0] || "")
    };
    saveJson(LS_LISTS, packed);
    return packed;
  }
  function loadLists() {
    const packed = migrateConsoleLists();
    state.lists = packed.lists || {};
    state.activeList = packed.activeList && state.lists[packed.activeList] ? packed.activeList : "";
  }
  function applyWindow(silent) {
    const win = window.WatchlistAnalyze.windowOf({ dateFrom: $("#from").value, dateTo: $("#to").value });
    if (win.from && $("#from").value !== win.from) $("#from").value = win.from;
    if (win.to && $("#to").value !== win.to) $("#to").value = win.to;
    const hint = $("#dateHint");
    if (hint) {
      hint.textContent = win.error
        ? (win.error + "。窗口必填，最多一个月。")
        : (win.clamped
          ? ("已收到结束日前 " + win.days + " 天。窗口最多一个月。")
          : ("窗口 " + win.days + " 天。最多一个月。≥7 天才按周期对照。"));
    }
    if (win.clamped && !silent) toast("窗口最多一个月，已收到结束日前 31 天");
    return win;
  }
  function form() {
    const win = applyWindow(true);
    const lanes = filledLanes();
    return {
      site: $("#site").value || "US",
      lanes: lanes,
      asins: window.WatchlistAnalyze.rosterFrom({ lanes: lanes }),
      keywords: ($("#keywords").value || "").trim(),
      dateFrom: win.from || $("#from").value,
      dateTo: win.to || $("#to").value
    };
  }
  function applyForm(f) {
    if (!f || typeof f !== "object") return;
    if (f.site) $("#site").value = f.site;
    if (f.dateFrom) $("#from").value = f.dateFrom;
    if (f.dateTo) $("#to").value = f.dateTo;
    if (f.keywords != null) $("#keywords").value = f.keywords;
    const slots = emptyLanes();
    const fromLanes = window.WatchlistAnalyze.lanesFrom(f);
    if (fromLanes.length) {
      fromLanes.forEach((L, i) => { slots[i] = { category: L.category, asin: L.asin, peers: (L.peers || []).slice() }; });
    } else {
      const asins = window.WatchlistAnalyze.rosterFrom(f);
      if (asins[0]) slots[0] = { category: String(f.category || "").trim().slice(0, 80), asin: asins[0], peers: asins.slice(1, 8) };
    }
    state.lanes = slots;
    renderLanes();
    applyWindow(true);
  }
  const AMAZON_DP = {
    US: "https://www.amazon.com/dp/",
    UK: "https://www.amazon.co.uk/dp/",
    DE: "https://www.amazon.de/dp/",
    JP: "https://www.amazon.co.jp/dp/",
    FR: "https://www.amazon.fr/dp/",
    IT: "https://www.amazon.it/dp/",
    ES: "https://www.amazon.es/dp/",
    CA: "https://www.amazon.ca/dp/",
    MX: "https://www.amazon.com.mx/dp/",
    AU: "https://www.amazon.com.au/dp/",
    IN: "https://www.amazon.in/dp/",
    NL: "https://www.amazon.nl/dp/",
    SE: "https://www.amazon.se/dp/"
  };
  const TEST_LIST = {
    site: "US",
    lanes: [
      { category: "Electric Kettles", asin: "B0GH78L65N" },
      { category: "Pour Over Kettle", asin: "B0BNVHR71X" }
    ],
    keywords: "",
    dateFrom: "2026-08-10",
    dateTo: "2026-09-08"
  };
  function amazonUrl(asin) {
    const site = ($("#site") && $("#site").value) || "US";
    return (AMAZON_DP[site] || AMAZON_DP.US) + String(asin || "").toUpperCase();
  }
  function renderLanes() {
    const box = $("#laneBox");
    if (!box) return;
    box.innerHTML = state.lanes.map((L, i) => {
      const on = /^[A-Z0-9]{10}$/.test(L.asin);
      const peers = (L.peers || []).map(a =>
        '<span class="chip"><a href="' + esc(amazonUrl(a)) + '" target="_blank" rel="noopener">' + esc(a) + "</a>" +
        ' <button data-lane="' + i + '" data-del-peer="' + a + '" type="button">×</button></span>').join("");
      return '<div class="lane' + (on ? " is-on" : "") + '" data-i="' + i + '">' +
        '<div class="lane-row">' +
          '<span class="lane-n">' + (i + 1) + "</span>" +
          '<input class="lane-cat" data-i="' + i + '" data-k="category" placeholder="类目" value="' + esc(L.category) + '">' +
          '<input class="lane-asin" data-i="' + i + '" data-k="asin" placeholder="主 ASIN" maxlength="10" spellcheck="false" value="' + esc(L.asin) + '">' +
          (on ? '<a class="lane-dp" href="' + esc(amazonUrl(L.asin)) + '" target="_blank" rel="noopener">前台</a>' : '<span class="lane-dp" hidden></span>') +
        "</div>" +
        '<input class="lane-peers" data-i="' + i + '" data-k="peersText" placeholder="对照 ASIN，逗号分隔，可选" value="' + esc((L.peers || []).join(", ")) + '">' +
        (peers ? '<div class="cmp-chips">' + peers + "</div>" : "") +
      "</div>";
    }).join("");
  }
  function renderLists() {
    const names = Object.keys(state.lists).filter(n => n !== "__proto__" && n !== "constructor" && snapsOf(state.lists[n]).length).sort((a, b) => {
      const da = lastSnap(state.lists[a]);
      const db = lastSnap(state.lists[b]);
      return (db && db.generatedAt || 0) - (da && da.generatedAt || 0) || a.localeCompare(b, "zh");
    });
    $("#listSel").innerHTML = '<option value="">— 选一份已完成的清单 —</option>' + names.map(n => {
      const nSnap = snapsOf(state.lists[n]).length;
      const last = lastSnap(state.lists[n]);
      const tag = nSnap ? (nSnap + " 期 · " + new Date(last.generatedAt).toLocaleDateString()) : "尚无快照";
      return '<option value="' + esc(n) + '"' + (n === state.activeList ? " selected" : "") + ">" + esc(n) + " · " + esc(tag) + "</option>";
    }).join("");
    $("#listDel").disabled = !state.activeList;
    $("#listDel").textContent = "删除";
    deleteConfirm = "";
    if (state.activeList) $("#listName").value = state.activeList;
    const status = $("#listStatus");
    if (status) {
      const cur = state.activeList && state.lists[state.activeList];
      const nSnap = snapsOf(cur).length;
      const last = lastSnap(cur);
      status.textContent = nSnap
        ? ("本组 " + nSnap + " 期 · 最近 " + new Date(last.generatedAt).toLocaleString() + "。切清单打开的是最近一期快照。")
        : "还没有完成的期报。先填品线主 ASIN，点开始监控，跑完再写入清单。";
    }
  }
  function applyList(name) {
    if (!name || !Object.prototype.hasOwnProperty.call(state.lists, name)) {
      state.activeList = "";
      persistLists();
      renderLists();
      renderHistory();
      return;
    }
    state.activeList = name;
    $("#listName").value = name;
    const item = state.lists[name];
    const snap = lastSnap(item);
    applyForm(snap ? Object.assign({}, item, {
      asins: snap.asins || item.asins,
      lanes: snap.lanes || item.lanes,
      dateFrom: snap.dateFrom || item.dateFrom,
      dateTo: snap.dateTo || item.dateTo
    }) : item);
    persistLists();
    renderLists();
    renderHistory();
    if (snap && snap.report) {
      renderReport(snap.report);
      toast("已打开清单「" + name + "」最近一期快照");
    } else {
      showReportBody(false);
      toast("「" + name + "」还没有完成的期报，跑完才会写入");
    }
    flushSession();
    refreshCost();
  }
  function saveList() {
    if (state.running) return toast("请等待当前任务完成");
    if (!state.report) return toast("清单只保存已经监控完成的期报。请先点开始监控。");
    const name = ($("#listName").value || "").trim();
    if (!name) return toast("请先给这份完成的清单起个名字");
    if (name.length > 80 || ["__proto__", "prototype", "constructor"].includes(name)) return toast("清单名称无效或过长");
    state.activeList = name;
    attachSnapshot(name, state.report, form());
    renderHistory();
    toast("已把本期快照写入清单「" + name + "」");
  }
  function delList() {
    if (state.running || !state.activeList) return;
    const name = state.activeList;
    if (deleteConfirm !== name) {
      deleteConfirm = name;
      $("#listDel").textContent = "确认删除";
      toast("再次点击确认删除「" + name + "」");
      return;
    }
    delete state.lists[name];
    state.activeList = "";
    $("#listName").value = "";
    persistLists();
    renderLists();
    toast("已删除");
  }
  function exportLists() {
    if (!Object.keys(state.lists).length) return toast("还没有保存任何清单");
    const payload = { kind: "xiyou-watchlist-v1", version: 1, exportedAt: new Date().toISOString(), lists: state.lists };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "xiyou-watchlists.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    toast("已导出 " + Object.keys(state.lists).length + " 份清单");
  }
  function importLists(file) {
    if (!file || file.size > 1024 * 1024) return toast("导入文件不能超过 1 MB");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const kindOk = parsed && (parsed.kind === "xiyou-watchlist-v1" || parsed.kind === "xiyou-console-watchlists");
        if (!kindOk || parsed.version !== 1 || !parsed.lists || Array.isArray(parsed.lists)) throw new Error("不是有效的监控清单文件");
        let count = 0;
        Object.keys(parsed.lists).slice(0, 200).forEach(name => {
          if (!name || name.length > 80 || ["__proto__", "prototype", "constructor"].includes(name)) return;
          const value = parsed.lists[name];
          if (!value || typeof value !== "object" || Array.isArray(value)) return;
          const lanes = window.WatchlistAnalyze.lanesFrom(value);
          const asins = Array.isArray(value.asins)
            ? value.asins.filter(a => /^[A-Z0-9]{10}$/i.test(a)).map(a => a.toUpperCase()).slice(0, 8)
            : window.WatchlistAnalyze.rosterFrom({ asin: value.asin, asinsText: value.asins, lanes: lanes });
          const snaps = Array.isArray(value.snapshots) ? value.snapshots.filter(s => s && s.report).slice(0, 12) : [];
          state.lists[name] = packList(state.lists[name], {
            site: typeof value.site === "string" ? value.site : "US",
            lanes: lanes,
            asins: asins,
            keywords: String(value.keywords || value.keyword || "").slice(0, 4000),
            dateFrom: String(value.dateFrom || "").slice(0, 10),
            dateTo: String(value.dateTo || "").slice(0, 10),
            snapshots: snaps,
            lastAt: value.lastAt || (snaps[0] && snaps[0].generatedAt) || 0
          });
          count += 1;
        });
        persistLists();
        renderLists();
        toast("已导入 " + count + " 份清单（有快照的才会当作完成档案）");
      } catch (e) { toast("导入失败：" + e.message); }
    };
    reader.onerror = () => toast("导入失败：无法读取文件");
    reader.readAsText(file);
  }

  function kv(pairs) {
    return '<dl class="kv">' + pairs.map(p => "<dt>" + esc(p[0]) + "</dt><dd>" + esc(p[1] == null || p[1] === "" ? "—" : p[1]) + "</dd>").join("") + "</dl>";
  }
  function cellHtml(c) {
    const s = String(c == null ? "" : c);
    const m = s.match(/^([A-Z0-9]{10})(.*)$/);
    if (m) return '<a href="' + esc(amazonUrl(m[1])) + '" target="_blank" rel="noopener">' + esc(m[1]) + "</a>" + esc(m[2]);
    return esc(s);
  }
  function tableHtml(headers, rows, rowIds) {
    return "<table><thead><tr>" + headers.map(h => "<th>" + esc(h) + "</th>").join("") + "</tr></thead><tbody>" +
      (rows || []).map((r, i) => {
        const id = rowIds && rowIds[i];
        return "<tr" + (id ? ' class="row-link" data-sec="' + esc(id) + '"' : "") + ">" +
          r.map(c => "<td>" + cellHtml(c) + "</td>").join("") + "</tr>";
      }).join("") +
      "</tbody></table>";
  }
  function tilesHtml(tiles) {
    return '<div class="lane-tiles">' + (tiles || []).map(t =>
      '<button type="button" class="lane-tile signal-' + esc(t.signal) + '" data-sec="' + esc(t.id) + '">' +
        '<span class="lane-tile-kicker">' + esc(t.signal) + "</span>" +
        "<b>" + esc(t.category) + "</b>" +
        '<span class="lane-tile-asin">' + esc(t.asin) + (t.brand ? " · " + esc(t.brand) : "") + "</span>" +
        '<span class="lane-tile-metrics">' + esc(t.price) + " · 近30天 " + esc(t.orders) + "</span>" +
        '<span class="lane-tile-bsr">BSR ' + esc(t.bsrPath) + "</span>" +
        '<span class="lane-tile-act">' + esc(t.lastAction || "窗口内无主动动作") + "</span>" +
      "</button>").join("") + "</div>";
  }
  function processHtml(process, folded) {
    if (!(process || []).length) return "";
    const ol = "<ol>" + process.map(p => "<li><b>步骤 " + esc(p.n) + " · " + esc(p.title) + "</b> " + esc(p.text) + "</li>").join("") + "</ol>";
    if (folded) return '<details class="fold"><summary>本行口径（与单品线相同）</summary>' + ol + "</details>";
    return "<h3>分析过程</h3>" + ol;
  }
  function chapterHtml(b) {
    const lane = b.skin === "lane";
    const board = b.skin === "board";
    return (b.lead ? "<p class=\"lead\">" + esc(b.lead) + "</p>" : "") +
      (board && (b.tiles || []).length ? tilesHtml(b.tiles) : "") +
      ((b.facts || []).length ? kv(b.facts) : "") +
      (!lane && (b.conclusion || []).length ? "<h3>核心结论</h3><ul>" + b.conclusion.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "") +
      processHtml(b.process, lane) +
      (b.tables || []).map(t => "<h3>" + esc(t.title) + "</h3>" + tableHtml(t.headers, t.rows, t.rowIds) + (t.note ? "<p class=\"meta\">" + esc(t.note) + "</p>" : "")).join("") +
      "<p class=\"meta\">" + esc(b.note || "") + (b.boundary ? " " + esc(b.boundary) : "") + "</p>";
  }
  function showView(name) {
    const report = name === "report";
    $("#reportView").hidden = !report;
    $("#historyView").hidden = report;
    $("#tab-report").setAttribute("aria-selected", report ? "true" : "false");
    $("#tab-history").setAttribute("aria-selected", report ? "false" : "true");
  }
  function showReportBody(on) {
    $("#emptyBox").hidden = !!on;
    $("#reportBody").hidden = !on;
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
    bar.className = on ? "conn on" : "conn off";
    bar.innerHTML = '<span class="dot"></span><span>' + esc(title) + "</span>" + (hint ? '<span class="hint">' + esc(hint) + "</span>" : "");
  }
  function pingGateway() {
    window.WatchlistMcp.stats().then(s => {
      renderConn(true, "证据库 " + (s.size || 0), "新鲜 " + (s.fresh || 0) + " · 连接组在调用台");
    }).catch(() => renderConn(false, "网关未通", "连接组在调用台"));
  }
  function loadReports() { return loadJson(LS_REP, []); }
  function saveReports(list) { saveJson(LS_REP, list.slice(0, 40)); }
  function snapLabel(r) {
    const lanes = (r && r.lanes) || (r && r.report && r.report.lanes) || [];
    if (lanes.length) return lanes.map(L => L.category || L.asin).join(" / ");
    return ((r && r.asins) || []).join("/") || "";
  }
  function renderHistory() {
    const mine = state.activeList ? snapsOf(state.lists[state.activeList]) : [];
    if (mine.length) {
      $("#history").innerHTML = mine.map((r, i) =>
        '<p><button type="button" data-snap="' + i + '">' + esc(new Date(r.generatedAt).toLocaleString()) + " · 第 " + (mine.length - i) + " 期 · " +
        esc(snapLabel(r) || state.activeList) + "</button></p>").join("");
      return;
    }
    const reports = loadReports();
    $("#history").innerHTML = reports.length
      ? reports.map((r, i) => '<p><button type="button" data-hist="' + i + '">' + esc(new Date(r.generatedAt).toLocaleString()) + " · " + esc(snapLabel(r) || r.listName || "未入清单") + "</button></p>").join("")
      : "<p>还没有完成的期报。跑完并写入清单后，各期快照会出现在这里。</p>";
  }
  function setRunning(on, text) {
    state.running = !!on;
    document.body.classList.toggle("is-running", !!on);
    const btn = $("#runBtn");
    btn.disabled = !!on;
    btn.setAttribute("aria-busy", on ? "true" : "false");
    btn.textContent = on ? (text || "监控中…") : "开始监控";
    $("#cost").classList.toggle("running", !!on);
    if (on) $("#cost").textContent = (text || "监控中…") + " · 请勿重复点击";
    $("#onlyCacheBtn").disabled = !!on;
    $("#clearBtn").disabled = !!on;
    $("#listSave").disabled = !!on;
  }
  async function refreshCost() {
    const f = form();
    if (!f.asins.length) {
      $("#cost").textContent = "先填至少一条品线的主 ASIN。打开页面不会取数。每条主链接会拉西柚监控接口和卖家精灵补充接口。多品线不会做跨类目词对照。";
      return;
    }
    const requests = window.WatchlistAnalyze.planRequests(f);
    const extra = window.WatchlistAnalyze.fallbackBudget(f);
    const est = await window.WatchlistMcp.estimate(requests);
    $("#cost").textContent = "缓存命中 " + est.hits + "/" + est.total +
      (est.stale ? " · 过期 " + est.stale : "") +
      " · 预计新增调用 " + est.misses +
      " · 西柚 " + (est.byProvider.xiyou || 0) + " / 卖家精灵 " + (est.byProvider.sellersprite || 0) +
      (extra ? " · 西柚空结果最多再补 " + extra : "");
  }
  function missKind(out, err) {
    if (err) return "error";
    const p = out && out.payload;
    if (!p || typeof p !== "object") return "empty";
    if (p.error === true || (p.data && p.data.error === true)) return "error";
    if (p.code != null && /^(error|fail|failed|invalid)$/i.test(String(p.code))) return "error";
    const msg = String(p.message || p.msg || "");
    if (/missing required|400|403|429|402|invalid|失败/.test(msg)) return "error";
    return "empty";
  }
  function missLabel(req, asin) {
    return (req.provider === "sellersprite" ? "卖家精灵 · " : "") + req.tool + (asin && asin !== "_shared" ? " · " + asin : "");
  }
  function renderReport(report) {
    state.report = report;
    const rawFail = report.failed || [];
    const empty = Array.isArray(report.empty) ? report.empty : rawFail.filter(x => String(x).indexOf("返回空结果") >= 0);
    const failed = Array.isArray(report.empty) ? rawFail : rawFail.filter(x => String(x).indexOf("返回空结果") < 0);
    const emptyN = empty.length;
    const failN = failed.length;
    const gapHtml = (emptyN || failN)
      ? '<details class="gaps"><summary>空结果 ' + emptyN + " 步 · 接口报错 " + failN + " 步</summary>" +
        "<p>空结果不是失败，记数据不足。趋势接口要自己设时间，最多一个月。</p>" +
        (emptyN ? "<ul>" + empty.slice(0, 12).map(x => "<li>" + esc(x) + "</li>").join("") + (emptyN > 12 ? "<li>…</li>" : "") + "</ul>" : "") +
        (failN ? "<ul>" + failed.slice(0, 8).map(x => "<li>" + esc(x) + "</li>").join("") + (failN > 8 ? "<li>…</li>" : "") + "</ul>" : "") +
        "</details>"
      : "";
    const cards = $("#cards");
    cards.parentNode.querySelectorAll(".gaps").forEach(el => el.remove());
    cards.innerHTML = (report.cards || []).map(c =>
      '<div class="metric-card"><b>' + esc(c.label) + "</b>" + esc(c.value) + '<span class="grade ' + esc(c.grade) + '">' + esc(c.grade) + "</span></div>").join("");
    if (gapHtml) cards.insertAdjacentHTML("afterend", gapHtml);
    if (report.preview) {
      cards.insertAdjacentHTML("beforebegin", '<p class="note" id="previewNote">这是虚拟数据，只用来看界面。没有调用 MCP，也没有写入你的清单。</p>');
    } else {
      const old = document.getElementById("previewNote");
      if (old) old.remove();
    }
    const port = report.mode === "portfolio";
    const layout = document.querySelector("#reportBody .layout");
    if (layout) layout.classList.toggle("is-portfolio", port);
    $("#nav").innerHTML = (report.sections || []).map((s, i) =>
      '<button type="button" data-sec="' + esc(s.id) + '" class="' + (i ? "" : "on") + '">' +
        esc(s.title) + (s.signal ? '<span class="nav-tag">' + esc(s.signal) + "</span>" : "") +
      "</button>").join("");
    $("#sections").innerHTML = (report.sections || []).map((s, i) => {
      const ev = (s.evidence || []).map(e => (e.tool || "") + (e.retrievedAt ? " · " + new Date(e.retrievedAt).toLocaleString() : "") + (e.note ? " · " + e.note : "")).join("；");
      return '<section class="section panel' + (port && i ? "" : " on") + '" id="' + esc(s.id) + '"><h2>' + esc(s.title) +
        ' <span class="grade ' + esc(s.grade) + '">' + esc(s.grade) + "</span></h2>" +
        (ev ? "<p class=\"meta\">" + esc(ev) + "</p>" : "") + chapterHtml(s) + "</section>";
    }).join("");
    showReportBody(true);
    showView("report");
  }
  function focusSection(id) {
    if (!id) return;
    document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("on", b.getAttribute("data-sec") === id));
    const port = state.report && state.report.mode === "portfolio";
    if (port) {
      document.querySelectorAll("#sections .section").forEach(el => el.classList.toggle("on", el.id === id));
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function slotAsin(req) {
    const args = req.arguments || {};
    if (req.tool.indexOf("multi_asin") >= 0 || req.tool === "get_keyword_info") return "_shared";
    return String(args.asin || "").toUpperCase() || "_shared";
  }
  function idbAll(dbName, storeName) {
    return new Promise(resolve => {
      if (!window.indexedDB) return resolve([]);
      function openExisting() {
        try {
          const req = indexedDB.open(dbName);
          req.onupgradeneeded = ev => {
            try { ev.target.transaction.abort(); } catch (_) { /* 不新建空库，避免挡住调用台 */ }
          };
          req.onerror = () => resolve([]);
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(storeName)) { db.close(); return resolve([]); }
            const tx = db.transaction(storeName, "readonly");
            const getAll = tx.objectStore(storeName).getAll();
            getAll.onsuccess = () => { db.close(); resolve(getAll.result || []); };
            getAll.onerror = () => { db.close(); resolve([]); };
          };
        } catch (_) { resolve([]); }
      }
      if (indexedDB.databases) {
        indexedDB.databases().then(list => {
          if (!(list || []).some(d => d && d.name === dbName)) return resolve([]);
          openExisting();
        }).catch(openExisting);
      } else openExisting();
    });
  }
  async function absorbLocal() {
    const site = ($("#site").value || "US");
    let evidence = {};
    const items = [];
    const runs = await idbAll("xiyou-console-cache-v1", "state");
    runs.forEach(run => {
      if (!run || !Array.isArray(run.steps)) return;
      const formSite = run.form && run.form.site ? run.form.site : site;
      const got = window.WatchlistAnalyze.ingestSteps(run.steps, formSite);
      evidence = window.WatchlistAnalyze.mergeEvidence(evidence, got.evidence);
      got.items.forEach(it => items.push(it));
      const fromRun = listFromFormLike(run.form);
      if (fromRun) {
        putList(state.lists, run.sceneId === "s23" ? "调用台 · 每日监控快照" : ("调用台 · " + (run.sceneSnapshot && run.sceneSnapshot.name || run.sceneId || "旧结果")), fromRun);
      }
    });
    persistLists();
    renderLists();
    if (items.length && window.WatchlistMcp.publish) {
      window.WatchlistMcp.publish(items).then(r => {
        pingGateway();
        if (r && r.stored) toast("已带上调用台旧结果 " + r.stored + " 条");
      }).catch(() => { /* 网关不可用时仍用本页本地证据 */ });
    }
    state.localEvidence = evidence;
    return evidence;
  }
  function localFilled(req, evidence) {
    const asin = slotAsin(req);
    const slot = evidence[asin] && evidence[asin][req.tool];
    return window.WatchlistAnalyze.thinSlot(req.tool, window.WatchlistAnalyze.payloadOf(slot));
  }
  async function run(cacheOnly) {
    const f = form();
    if (state.running) return toast("正在监控，请等当前这一轮结束");
    if (!f.asins.length) {
      $("#f-asins").classList.add("miss");
      return toast("请先填写至少 1 条品线的主 ASIN");
    }
    $("#f-asins").classList.remove("miss");
    const win = window.WatchlistAnalyze.windowOf(f);
    if (win.error) {
      $("#f-dates").classList.add("miss");
      return toast(win.error + "。请设置时间，最多一个月。");
    }
    $("#f-dates").classList.remove("miss");
    f.dateFrom = win.from;
    f.dateTo = win.to;
    const requests = window.WatchlistAnalyze.planRequests(f);
    const evidence = window.WatchlistAnalyze.mergeEvidence({}, state.localEvidence || {});
    setRunning(true, "监控中 0/" + requests.length);
    try {
      const failed = [];
      const empty = [];
      const called = new Set();
      async function callOne(req) {
        const k = [req.provider, req.tool, slotAsin(req), (req.arguments && req.arguments.keyword) || ""].join("|");
        if (called.has(k)) return;
        called.add(k);
        if (localFilled(req, evidence)) return;
        const asin = slotAsin(req);
        try {
          const out = await window.WatchlistMcp.call(req.provider, req.tool, req.arguments, { cacheOnly: cacheOnly });
          if (!evidence[asin]) evidence[asin] = {};
          if (usablePayload(out)) evidence[asin][req.tool] = out;
          else if (!localFilled(req, evidence)) {
            const kind = missKind(out, null);
            const line = missLabel(req, asin) + "：" + friendlyError((out && out.payload && (out.payload.message || out.payload.msg)) || (kind === "empty" ? "返回空结果" : "接口报错"));
            (kind === "error" ? failed : empty).push(line);
          }
        } catch (err) {
          if (!localFilled(req, evidence)) failed.push(missLabel(req, asin) + "：" + friendlyError(err.message || err));
        }
      }
      for (let i = 0; i < requests.length; i++) {
        const req = requests[i];
        setRunning(true, "监控中 " + (i + 1) + "/" + requests.length + " · " + (req.provider === "sellersprite" ? "卖家精灵 · " : "西柚 · ") + req.tool);
        await callOne(req);
      }
      const extra = window.WatchlistAnalyze.neededFallbacks(f, evidence);
      for (let j = 0; j < extra.length; j++) {
        const req = extra[j];
        setRunning(true, "补卖家精灵 " + (j + 1) + "/" + extra.length + " · " + req.tool);
        await callOne(req);
      }
      evidence.failed = failed;
      evidence.empty = empty;
      const report = window.WatchlistAnalyze.build(evidence, f);
      report.failed = failed;
      report.empty = empty;
      const name = state.activeList || ($("#listName").value || "").trim() || ("监控 · " + f.asins[0]);
      state.activeList = name;
      $("#listName").value = name;
      report.listName = name;
      report.filledSlots = window.WatchlistAnalyze.filledCount(evidence);
      renderReport(report);
      if (state.savePeriod) {
        attachSnapshot(name, report, f);
        const reports = loadReports();
        reports.unshift({ generatedAt: report.generatedAt, asins: f.asins, lanes: f.lanes, listName: name, site: f.site, report: report });
        saveReports(reports);
      }
      const missN = failed.length + empty.length;
      toast(failed.length === requests.length
        ? ("全部 " + failed.length + " 步失败：" + (failed[0] || "没有可用连接或参数"))
        : (state.savePeriod
          ? (missN ? ("已写入清单「" + name + "」，空结果 " + empty.length + "、报错 " + failed.length) : (cacheOnly ? "已用缓存写入清单「" + name + "」" : "监控完成，已写入清单「" + name + "」"))
          : (missN ? ("本期未保存。空结果 " + empty.length + "、报错 " + failed.length) : "本期报告已出，未写入清单")));
      renderHistory();
      flushSession();
      refreshCost();
    } catch (e) {
      toast(e.message || String(e));
    }
    setRunning(false);
    refreshCost();
  }
  function flushSession() {
    saveJson(LS_SESSION, { form: form(), cacheOnly: state.cacheOnly, savePeriod: state.savePeriod, report: state.report, activeList: state.activeList, savedAt: Date.now() });
  }
  function hydrate(snap) {
    if (snap && snap.form) applyForm(Object.assign({}, snap.form, { cacheOnly: snap.cacheOnly }));
    if (snap && snap.cacheOnly != null) {
      state.cacheOnly = !!snap.cacheOnly;
      $("#onlyCacheBtn").textContent = state.cacheOnly ? "仅用已有数据 · 开" : "仅用已有数据";
    }
    if (snap && snap.savePeriod != null) {
      state.savePeriod = !!snap.savePeriod;
      if ($("#savePeriod")) $("#savePeriod").checked = state.savePeriod;
    }
    if (snap && snap.activeList && state.lists[snap.activeList]) {
      state.activeList = snap.activeList;
      $("#listName").value = snap.activeList;
    }
    if (snap && snap.report) renderReport(snap.report);
    else {
      const last = loadReports()[0];
      if (last && last.report) {
        renderReport(last.report);
        applyForm({
          asins: last.asins || last.report.asins,
          lanes: last.lanes || last.report.lanes,
          site: last.site || last.report.site,
          dateFrom: last.report.dateFrom,
          dateTo: last.report.dateTo
        });
      }
    }
    renderLists();
    renderHistory();
    refreshCost();
  }

  const today = new Date();
  $("#to").value = ymd(today);
  $("#from").value = ymd(new Date(today.getTime() - 29 * 864e5));
  loadLists();
  adoptLooseReports();
  applyTheme();
  pingGateway();
  renderLanes();
  renderLists();
  renderHistory();
  if (state.activeList && state.lists[state.activeList]) applyForm(state.lists[state.activeList]);
  const boot = loadJson(LS_SESSION, null);
  const wantPreview = /(?:\?|&)preview=1(?:&|$)/.test(location.search || "");
  if (wantPreview) loadPreview();
  else if (boot) hydrate(boot);
  else refreshCost();
  absorbLocal().then(local => {
    if (wantPreview) return;
    const n = window.WatchlistAnalyze.filledCount(local);
    if (!n) return;
    const f = form();
    if (!f.asins.length) {
      const prefer = state.lists["调用台当前"] || state.lists["调用台 · 每日监控快照"] || state.lists[state.activeList];
      if (prefer) {
        applyForm(prefer);
        if (state.lists["调用台当前"]) state.activeList = "调用台当前";
        renderLists();
      }
    }
    const ready = form();
    if (!ready.asins.length) return;
    const have = state.report && Number(state.report.filledSlots) || 0;
    if (have >= n && state.report && (state.report.asins || []).length) return;
    const report = window.WatchlistAnalyze.build(local, ready);
    report.listName = state.activeList || "调用台旧结果";
    report.filledSlots = n;
    renderReport(report);
    attachSnapshot(report.listName, report, ready);
    flushSession();
    refreshCost();
  });

  function setSpan(days) {
    const n = Number(days);
    if (!n) return;
    const to = new Date();
    const from = new Date(to.getTime() - (n - 1) * 864e5);
    $("#to").value = ymd(to);
    $("#from").value = ymd(from);
    onFormChange();
    toast(n < 7
      ? "不足 7 天只当当日快照，不能当周期报告"
      : ("已设近 " + n + " 天。还要再点「开始监控」才出这一期报表"));
  }
  function loadTestList() {
    applyForm(TEST_LIST);
    onFormChange();
    toast("已填入两条测试品线。这还不是清单，跑完才会写入快照。");
  }
  function loadPreview() {
    const fx = window.WatchlistAnalyze.previewFixture();
    applyForm(fx.form);
    const report = window.WatchlistAnalyze.build(fx.evidence, fx.form);
    report.preview = true;
    report.listName = "界面预览 · 虚拟数据";
    report.filledSlots = window.WatchlistAnalyze.filledCount(fx.evidence);
    renderReport(report);
    $("#cost").textContent = "虚拟预览：5 条品线，没有调用 MCP，没有写入清单。";
    toast("已打开 5 条品线的虚拟界面。点左侧类目名可下钻。");
  }
  function onFormChange() { flushSession(); refreshCost(); renderLanes(); }
  $("#site").addEventListener("change", onFormChange);
  $("#from").addEventListener("change", () => { applyWindow(false); onFormChange(); });
  $("#to").addEventListener("change", () => { applyWindow(false); onFormChange(); });
  if ($("#savePeriod")) {
    $("#savePeriod").checked = state.savePeriod;
    $("#savePeriod").addEventListener("change", () => {
      state.savePeriod = !!$("#savePeriod").checked;
      flushSession();
      toast(state.savePeriod ? "跑完会写入清单" : "跑完只出报告，不写入清单");
    });
  }
  $("#keywords").addEventListener("input", onFormChange);
  function parsePeers(text) {
    return String(text || "").split(/[,，;\s]+/).map(s => s.trim().toUpperCase()).filter(a => /^[A-Z0-9]{10}$/.test(a));
  }
  $("#laneBox").addEventListener("input", e => {
    const i = Number(e.target.getAttribute("data-i"));
    const k = e.target.getAttribute("data-k");
    if (!Number.isFinite(i) || !state.lanes[i] || !k) return;
    if (k === "category") state.lanes[i].category = e.target.value.slice(0, 80);
    if (k === "asin") state.lanes[i].asin = e.target.value.trim().toUpperCase().slice(0, 10);
    if (k === "peersText") state.lanes[i].peers = parsePeers(e.target.value).filter(a => a !== state.lanes[i].asin).slice(0, 2);
    $("#f-asins").classList.remove("miss");
    flushSession();
    refreshCost();
  });
  $("#laneBox").addEventListener("change", e => {
    const i = Number(e.target.getAttribute("data-i"));
    if (!Number.isFinite(i) || !state.lanes[i]) return;
    if (e.target.getAttribute("data-k") === "asin") {
      state.lanes[i].asin = e.target.value.trim().toUpperCase();
      const a = state.lanes[i].asin;
      if (/^[A-Z0-9]{10}$/.test(a) && state.lanes.some((L, j) => j !== i && L.asin === a)) {
        toast("这个 ASIN 已在其他品线，不会重复取数");
      }
    }
    renderLanes();
    onFormChange();
  });
  $("#laneBox").addEventListener("click", e => {
    const i = Number(e.target.getAttribute("data-lane"));
    const a = e.target.getAttribute("data-del-peer");
    if (!Number.isFinite(i) || !a || !state.lanes[i]) return;
    state.lanes[i].peers = (state.lanes[i].peers || []).filter(x => x !== a);
    renderLanes();
    onFormChange();
  });
  if ($("#loadTest")) $("#loadTest").addEventListener("click", loadTestList);
  if ($("#loadPreview")) $("#loadPreview").addEventListener("click", loadPreview);
  document.querySelectorAll("[data-span]").forEach(btn => btn.addEventListener("click", () => setSpan(btn.getAttribute("data-span"))));
  $("#runBtn").addEventListener("click", () => run(state.cacheOnly));
  $("#onlyCacheBtn").addEventListener("click", () => {
    state.cacheOnly = !state.cacheOnly;
    $("#onlyCacheBtn").textContent = state.cacheOnly ? "仅用已有数据 · 开" : "仅用已有数据";
    flushSession();
    toast(state.cacheOnly ? "不会发起新的 MCP 调用" : "将按缺失项取数");
  });
  $("#themeBtn").addEventListener("click", cycleTheme);
  $("#connBar").addEventListener("click", () => toast("连接组在运营调用台设置。本页只读共享证据网关。"));
  $("#clearBtn").addEventListener("click", () => {
    if (state.running) return;
    state.lanes = emptyLanes();
    $("#keywords").value = "";
    $("#listName").value = "";
    state.activeList = "";
    renderLanes();
    renderLists();
    persistLists();
    onFormChange();
    toast("已清空本页参数，没有删除历史报告");
  });
  $("#listSel").addEventListener("change", e => applyList(e.target.value));
  $("#listSave").addEventListener("click", saveList);
  $("#listDel").addEventListener("click", delList);
  $("#listExport").addEventListener("click", exportLists);
  $("#listImport").addEventListener("click", () => $("#listFile").click());
  $("#listFile").addEventListener("change", e => {
    if (e.target.files && e.target.files[0]) importLists(e.target.files[0]);
    e.target.value = "";
  });
  document.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => showView(btn.getAttribute("data-view"))));
  $("#history").addEventListener("click", e => {
    const snapI = e.target.getAttribute("data-snap");
    if (snapI != null) {
      const item = snapsOf(state.lists[state.activeList])[Number(snapI)];
      if (item && item.report) {
        renderReport(item.report);
        toast("已打开该清单第 " + (snapsOf(state.lists[state.activeList]).length - Number(snapI)) + " 期快照");
      }
      return;
    }
    const i = e.target.getAttribute("data-hist");
    if (i == null) return;
    const item = loadReports()[Number(i)];
    if (item && item.report) {
      renderReport(item.report);
      toast("已打开未入清单的旧报告");
    }
  });
  $("#nav").addEventListener("click", e => {
    const btn = e.target.closest("[data-sec]");
    if (!btn || !$("#nav").contains(btn)) return;
    focusSection(btn.getAttribute("data-sec"));
  });
  $("#sections").addEventListener("click", e => {
    if (e.target.closest("a")) return;
    const btn = e.target.closest("[data-sec]");
    if (!btn || !$("#sections").contains(btn)) return;
    focusSection(btn.getAttribute("data-sec"));
  });
  window.addEventListener("pagehide", flushSession);
  window.addEventListener("beforeunload", flushSession);
  document.querySelectorAll(".app-switch a").forEach(a => a.addEventListener("click", flushSession));
})();

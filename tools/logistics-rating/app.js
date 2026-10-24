(function () {
  if(new URLSearchParams(location.search).get('demo')==='all'&&!window.LogisticsSpace?.isDemo){location.replace('index.html?space=demo&demo=all#/import');return;}
  if(new URLSearchParams(location.search).get('demo')==='all'){Domain.withWriteLock(()=>{try{Demo.seed();location.replace('index.html#/import');}catch(e){document.getElementById('app').textContent=e.message;}});return;}
  var D = window.DATA;
  var P = D.P, F = D.F, G = D.G;
  var companyIds = P.map(function (name) { return Companies.find(name)?.id || null; });
  function refreshCompanyNames() { companyIds.forEach(function (id, i) { if(!id)return; P[i] = Companies.name(id).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }); }
  refreshCompanyNames();
  Companies.subscribe(function () { refreshCompanyNames(); });
  var KEY = 'lrc-prototype-state-v1';
  var DEFAULT = {
    ch: 'eu-rail', region: 'eu', step: 1, kind: 'quote', names: {}, issues: {}, warn: false, remember: true, maps: {},
    billDone: false, trackDone: false,
    scores: {}, preset: 'bal', submitted: false, synced: {}, note: '',
    trial: { status: '未合作', signed: { 'eu-rail': 0, 'eu-air': 0, 'eu-truck': 0 } }
  };
  var S = load();
  if (S.kind === 'track') { S.kind = 'quote'; S.step = 1; S.trackDone = false; save(); }
  var toast = null, toastTimer = null;

  function load() {
    try { var s = JSON.parse(sessionStorage.getItem(KEY)); if (s) { if (!D.CH.some(function(c){return c.key === s.ch;}) || !['us','eu'].includes(s.region) || !D.PRESETS[s.preset] || !['quote','bill','track'].includes(s.kind) || !Number.isInteger(s.step) || s.step<1 || s.step>4) throw Error('导入状态无效'); return Object.assign(clone(DEFAULT), s); } } catch (e) {}
    return clone(DEFAULT);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function set(patch) { Object.assign(S, patch); save(); render(); }
  function showToast(html) {
    toast = html; render();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast = null; render(); }, 6000);
  }

  // ---------- 公共 ----------
  function gradeOf(t) { return t >= 90 ? 'S' : t >= 80 ? 'A' : t >= 70 ? 'B' : t >= 60 ? 'C' : 'D'; }
  function half(v) { return Math.min(10, Math.round(v * 2) / 2); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function isBackup(i) { return D.QUOTE_WEEK[i] < D.WEEK; }
  function backupList() { return P.map(function (n, i) { return i; }).filter(isBackup); }
  function tbd(text, tip) { return '<span class="tbd" title="' + (tip || text) + '">待定 · ' + text + '</span>'; }
  function rule(text) { return '<span class="rule">已定 · ' + text + '</span>'; }
  function setChannel(k) { var c = D.chByKey(k); set({ ch: k, region: c.region }); }
  function setRegion(r) {
    var c = D.chByKey(S.ch);
    var patch = { region: r };
    if (c.region !== r) patch.ch = D.CH.filter(function (x) { return x.region === r; })[0].key;
    set(patch);
  }
  function chipsHtml(action) {
    return '<div class="chips" role="group" aria-label="选择渠道">' + D.CH.map(function (c) {
      return '<button class="chip' + (c.key === S.ch ? ' on' : '') + '" data-a="' + action + '" data-v="' + c.key + '">' + c.label + '</button>';
    }).join('') + '</div>';
  }
  function regionSeg(labels) {
    return '<div class="seg" role="group" aria-label="目的地">' +
      '<button class="' + (S.region === 'us' ? 'on' : '') + '" data-a="region" data-v="us">' + labels[0] + '</button>' +
      '<button class="' + (S.region === 'eu' ? 'on' : '') + '" data-a="region" data-v="eu">' + labels[1] + '</button></div>';
  }
  function backupBanner(where) {
    var b = backupList();
    if (!b.length) return '';
    return '<div class="banner grey"><span class="tag backup">备用</span><span class="grow"><b>' + b.map(function (i) { return P[i]; }).join('、') +
      '</b> 最近一周（第 ' + D.WEEK + ' 周）没有价格，已放入备用：不拿上一周价格顶上，' + where + '。' +
      '最近一次报价：' + D.G_LAST.map(function (g) { return g.ch + ' ¥' + g.price + '/kg（第 ' + g.week + ' 周，不使用）'; }).join('；') + '。</span>' +
      rule('最近一周无价格 → 备用') + '</div>';
  }
  function weekBanner() {
    return '<div class="banner blue"><span class="grow">比价周：<b>' + D.WEEK_LABEL + '</b>。只比最近一周的报价，旧周价格不参与。</span>' + rule('只比最近一周') + '</div>';
  }

  // ---------- 名称匹配（导入第 2 步） ----------
  function choiceOf(k) {
    var x = D.NAMES[k];
    if (S.names[k] !== undefined) return S.names[k];
    if (x.cands.length && x.cands[0][1] >= 90) return x.cands[0][0];
    return null;
  }
  function namePending() { var n = 0; D.NAMES.forEach(function (x, k) { if (choiceOf(k) === null) n++; }); return n; }
  function fIsNew() { return choiceOf(5) === 'new'; }

  // ---------- 分仓比价 ----------
  function warehouseTable(chKey) {
    var cur = D.chByKey(chKey);
    var prov = [];
    cur.data.forEach(function (d, i) { if (d && !isBackup(i) && (i < 5 || (i === F && fIsNew()))) prov.push(i); });
    var wins = {}, gaps = [], whCount = 0, sumMin = 0, sumMinAll = 0, sumByProv = {}, coverage = {}, maxGap = -1, maxGapWh = '', newWins = 0, rows = [];
    prov.forEach(function (i) { wins[i] = 0; sumByProv[i] = 0; coverage[i] = 0; });
    D.WH[cur.region].forEach(function (z, zi) {
      rows.push({ zone: z.zone, count: z.codes.length });
      z.codes.forEach(function (wc, wi) {
        whCount++;
        var prices = prov.map(function (i) { return D.priceAt(cur, i, zi, wi); });
        var coop = prices.filter(function (v, k) { return v != null && prov[k] < 5; });
        var all = prices.filter(function (v) { return v != null; });
        var mn = Math.min.apply(null, coop), mx = Math.max.apply(null, coop), mnAll = Math.min.apply(null, all);
        var gap = Math.round((mx - mn) / mn * 100);
        gaps.push(gap); sumMin += mn; sumMinAll += mnAll;
        if (gap > maxGap) { maxGap = gap; maxGapWh = wc[0]; }
        var minName = '';
        var cells = prices.map(function (v, k) {
          var i = prov[k];
          if (v == null) return { none: true };
          var isNew = i === F;
          if (!isNew) { sumByProv[i] += v; coverage[i]++; }
          var isMin = !isNew && v === mn, newMin = isNew && v < mn;
          if (isMin) { wins[i]++; minName += (minName ? ' / ' : '') + P[i]; }
          if (newMin) newWins++;
          var d = Math.round((v - mn) / mn * 100);
          return { v: v, min: isMin, newMin: newMin, diff: isMin ? '已合作最低' : d < 0 ? '比已合作最低便宜 ' + (-d) + '%' : '+' + d + '%' };
        });
        rows.push({ code: wc[0], place: wc[1], zone: z.zone, cells: cells, gap: gap, minName: minName });
      });
    });
    var coopProv = prov.filter(function (i) { return i < 5; });
    var top = coopProv.slice().sort(function (a, b) { return wins[b] - wins[a]; })[0];
    var single = coopProv.filter(function (i) { return coverage[i] === whCount; }).sort(function (a, b) { return sumByProv[a] - sumByProv[b]; })[0];
    return {
      cur: cur, prov: prov, rows: rows, newInCh: prov.indexOf(F) >= 0, newWins: newWins,
      sum: {
        wh: whCount, zones: D.WH[cur.region].map(function (z) { return z.zone; }).join(' · '),
        top: P[top], topWins: wins[top], avgGap: Math.round(gaps.reduce(function (s, g) { return s + g; }, 0) / gaps.length),
        maxGapWh: maxGapWh + '（' + maxGap + '%）', save: single === undefined || !sumByProv[single] ? '—' : Math.round((sumByProv[single] - sumMin) / sumByProv[single] * 1000) / 10,
        single: single === undefined ? '无完整覆盖公司，暂不计算' : P[single], extra: Math.round((sumMin - sumMinAll) / sumMin * 1000) / 10
      }
    };
  }

  function downloadText(filename, text) {
    var blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function exportTable() {
    var t = warehouseTable(S.ch);
    var head = ['区域', '仓库', '地名'].concat(t.prov.map(function (i) { return P[i] + (i === F ? '（未合作）' : ''); })).concat(['价差%', '已合作最低']);
    var lines = [head.join(',')];
    t.rows.forEach(function (r) {
      if (!r.code) return;
      lines.push([r.zone, r.code, r.place].concat(r.cells.map(function (c) { return c.none ? '无报价' : c.v.toFixed(1); })).concat([r.gap, r.minName]).join(','));
    });
    var fn = '仓库比价_' + t.cur.label.replace(' · ', '') + '_2026W' + D.WEEK + '.csv';
    downloadText(fn, lines.join('\n'));
    showToast('已导出「' + fn + '」：' + t.cur.label + ' 的仓库比价表（仓库、各物流商单价、价差、最低标记）。' + tbd('导出文件格式', '设计稿没写导出格式，原型先导出 CSV'));
  }
  function downloadTemplate() {
    if (S.kind !== 'quote') {
      showToast('账单请使用月度公司对账页的标准模板。' + tbd('账单模板列'));
      return;
    }
    downloadText('标准导入模板_报价表.csv', D.TEMPLATE_COLS.join(',') + '\n');
    showToast('已下载「标准导入模板_报价表.csv」，列与清洗页标准字段对齐：' + D.TEMPLATE_COLS.join('、') + '。');
  }

  // ---------- 周评分 ----------
  function scoreBase() {
    var list = [];
    D.CH.forEach(function (c) {
      var items = [];
      c.data.forEach(function (d, i) {
        if (!d || isBackup(i)) return;
        if (i === F) { items.push({ i: i, d: d, isNew: true }); return; }
        var avg = (d[0] + d[1]) / 2;
        items.push({ i: i, d: d, actual: avg * (1 + (100 - d[3]) / 200) });
      });
      var coop = items.filter(function (x) { return !x.isNew; });
      var minP = Math.min.apply(null, coop.map(function (x) { return x.d[2]; }));
      var minA = Math.min.apply(null, coop.map(function (x) { return x.actual; }));
      var minProm = Math.min.apply(null, coop.map(function (x) { return (x.d[0] + x.d[1]) / 2; }));
      items.forEach(function (x) {
        var row = { key: x.i + '|' + c.key, i: x.i, chKey: c.key, region: c.region, ch: c.name, chLabel: c.label, isNew: !!x.isNew, p: half(10 * minP / x.d[2]), cheaper: x.d[2] < minP };
        if (!x.isNew) { row.t = half(5 * minA / x.actual + x.d[3] / 20); row.c = half(D.COOP[x.i]); }
        else { row.qt = half(10 * minProm / ((x.d[0] + x.d[1]) / 2)); row.prom = x.d[0] + '–' + x.d[1]; }
        list.push(row);
      });
    });
    return list;
  }
  function signedOf(chKey) { return S.trial.signed[chKey] || 0; }
  function scoreAll() {
    var w = D.PRESETS[S.preset].w;
    return scoreBase().map(function (b) {
      var s = S.scores[b.key] || {};
      var p = s.p != null ? s.p : b.p;
      if (b.isNew) {
        if (S.trial.status === '试单中' && signedOf(b.chKey) >= 3) {
          var ft = s.ft != null ? s.ft : null, fc = s.fc != null ? s.fc : null;
          var ftot = ft == null || fc == null ? null : Math.round((p * w[0] + ft * w[1] + fc * w[2]) * 10);
          return { b: b, p: p, t: ft, c: fc, formal: true, total: ftot, grade: ftot == null ? null : gradeOf(ftot) };
        }
        var qt = s.t != null ? s.t : b.qt;
        var pre = Math.round((p * w[0] + qt * w[1]) / (w[0] + w[1]) * 10);
        return { b: b, p: p, t: qt, isNew: true, total: pre, grade: gradeOf(pre) };
      }
      var t = s.t != null ? s.t : b.t, c = s.c != null ? s.c : b.c;
      var total = Math.round((p * w[0] + t * w[1] + c * w[2]) * 10);
      return { b: b, p: p, t: t, c: c, total: total, grade: gradeOf(total) };
    });
  }
  function setScore(key, f, v) {
    var next = clone(S.scores);
    next[key] = next[key] || {};
    next[key][f] = v;
    set({ scores: next, submitted: false });
  }

  // ---------- 页面：数据导入 ----------
  function pageImport() {
    var h = '<div class="head-row"><div><h1>数据导入与仓库比价</h1><p class="lead">报价单保留规则：最近 30 天（当前示例列表按此过滤；真实文件存储尚未接入）。导入报价表 → 确认物流商是谁 → 清洗字段 → 按「渠道 × 亚马逊目的仓」逐仓比价。物流商没确认完，不进入比价。账单导入落到差错次数。</p></div></div>';
    if (S.kind === 'quote') {
      var steps = [['上传文件', '报价表 / 账单'], ['确认物流商', '名称模糊比对，由你确认'], ['字段清洗', '统一仓库、渠道、币种和单位'], ['按仓库比价', '渠道 × 亚马逊仓库，逐仓找最低']];
      h += '<ol class="steps" aria-label="步骤">' + steps.map(function (s, k) {
        var n = k + 1, cur = n === S.step, done = n < S.step;
        return '<li><button class="step' + (cur ? ' cur' : '') + (done ? ' done' : '') + '" data-a="step" data-v="' + n + '"><span class="n">' + (done ? '✓' : n) + '</span><span><div class="t">' + s[0] + '</div><div class="sub">' + s[1] + '</div></span></button></li>';
      }).join('') + '</ol>';
      if (S.warn && namePending() > 0) h += '<div class="banner alert" role="alert">还有 ' + namePending() + ' 个物流商名称没确认，先确认完才能清洗和比价。</div>';
    }
    if (S.kind !== 'quote' || S.step === 1) h += importStep1();
    else if (S.step === 2) h += importStep2();
    else if (S.step === 3) h += importStep3();
    else h += importStep4();
    return h;
  }

  function importStep1() {
    var files = D.FILES[S.kind];
    var retentionNow = new Date();
    var cutoff = new Date(retentionNow.getFullYear(), retentionNow.getMonth(), retentionNow.getDate() - 30);
    if (S.kind === 'quote') files = files.filter(function (f) {
      // 原型文件只有 ISO 周号；按该周周一生成演示报价日期。
      var jan4 = new Date(2026, 0, 4);
      var day = jan4.getDay() || 7;
      var issued = new Date(2026, 0, 4 - day + 1 + (f.week - 1) * 7);
      return issued >= cutoff;
    });
    var kinds = [['quote', '物流商报价表'], ['bill', '实际账单 / 对账单']];
    var dest = { quote: '报价表：确认物流商 → 清洗 → 按仓比价', bill: '账单：核对提货价 / 实际签收价是否与对应周报价一致，结果落到「差错次数」', track: '轨迹：签收记录落到运单「实际时效」' };
    var h = '<div class="flex-wrap"><section class="card card-pad" style="flex: 999 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 18px" aria-label="上传文件">';
    h += '<div style="display: flex; flex-wrap: wrap; gap: 16px"><label class="field">数据类型<select data-a="kind">' + kinds.map(function (k) { return '<option value="' + k[0] + '"' + (S.kind === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="field">美元汇率（用于 $ 报价换算）<input type="text" value="[当周汇率]" style="width: 160px; min-width: 0"></label></div>';
    h += '<div class="banner blue" style="font-size: 13px"><span class="grow">' + dest[S.kind] + '</span>' + (S.kind === 'bill' ? rule('账单 → 差错次数') : S.kind === 'track' ? rule('轨迹 → 实际时效') : '') + '</div>';
    h += '<label class="drop"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2450D8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"></path><path d="M7 9l5-5 5 5"></path><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"></path></svg><span style="font-size: 16px; font-weight: 600">把文件拖到这里，或点击选择文件</span><span class="muted" style="font-size: 13px">支持 .xlsx / .xls / .csv，可一次导入多家（原型使用下方示例文件）</span><input type="file" multiple accept=".xlsx,.xls,.csv" style="position: absolute; width: 1px; height: 1px; opacity: 0"></label>';
    h += '<div style="display: flex; flex-direction: column; gap: 8px"><div style="font-size: 13px; font-weight: 600; color: #3A3F49">已导入 ' + files.length + ' 个文件</div>' + files.map(function (f) {
      var stale = f.week < D.WEEK;
      return '<div class="file-row"><span class="fn">' + f.name + '</span><span>名称：' + f.names + '</span><span>' + f.rows + ' 行</span><span>报价周：第 ' + f.week + ' 周</span>' +
        (stale ? '<span class="tag backup" style="font-size: 12px; padding: 3px 10px">非最近一周 → 备用</span>' : '<span class="tag blue" style="font-size: 12px; padding: 3px 10px">已解析</span>') + '</div>';
    }).join('') + '</div>';
    if (S.kind === 'quote') h += '<div style="display: flex; justify-content: flex-end"><button class="btn primary" data-a="step" data-v="2">下一步：确认物流商</button></div>';
    if (S.kind === 'bill') h += '<div style="display: flex; justify-content: flex-end"><button class="btn primary" data-a="billDone">解析并写入差错次数</button></div>' + (S.billDone ? billResult() : '');
    if (S.kind === 'track') h += '<div style="display: flex; justify-content: flex-end"><button class="btn primary" data-a="trackDone">解析并写入实际时效</button></div>' + (S.trackDone ? trackResult() : '');
    h += '</section>';
    h += '<aside class="card card-pad" style="flex: 1 1 300px; display: flex; flex-direction: column; gap: 12px; font-size: 13px; line-height: 1.7; color: #3A3F49"><h2 style="font-size: 16px">导入后的处理顺序</h2>' +
      '<div><b>1. 认人</b>：报价单里的物流商名称和已有物流商做模糊比对，由你确认</div><div><b>2. 清洗</b>：统一仓库代码、渠道名、币种单位，去重，标出异常</div><div><b>3. 比价</b>：只取最近一周报价，按渠道 × 亚马逊仓库逐仓找最低价</div><div><b>4. 评级</b>：合作过的按价格、时效、配合正式评级；新物流商先按价格 + 报价时效预评级</div>' +
      '<div style="padding-top: 8px; border-top: 1px solid #EEF0F3">账单 → <b>差错次数</b>（配合）</div>' +
      '<button class="btn outline-blue sm" style="align-self: flex-start" data-a="template">下载标准导入模板</button><div class="sub">报价表模板列：' + D.TEMPLATE_COLS.join('、') + '。' + (S.kind !== 'quote' ? ' ' + tbd('账单模板列') : '') + '</div></aside></div>';
    return h;
  }

  function billResult() {
    var bad = 0;
    var rows = D.BILLS.map(function (b) {
      var c = D.chByKey(b.ch), ix = D.whIndex(c.region, b.wh);
      var q = D.priceAt(c, b.i, ix[0], ix[1]);
      var pick = r1(q + b.pick), sign = r1(q + b.sign);
      var issues = [];
      if (pick !== q) issues.push('提货价与第 ' + b.week + ' 周报价不符');
      if (sign !== q) issues.push('实际签收价与第 ' + b.week + ' 周报价不符');
      if (issues.length) bad++;
      return '<tr class="' + (issues.length ? 'bad' : '') + '"><td class="mono">' + b.no + '</td><td>' + P[b.i] + '</td><td>' + c.label + ' · ' + b.wh + '</td><td>' + b.date + '（第 ' + b.week + ' 周）</td><td>¥' + q.toFixed(1) + '</td><td>¥' + pick.toFixed(1) + '</td><td>¥' + sign.toFixed(1) + '</td><td>' +
        (issues.length ? '<span class="tag warn">异常</span> ' + issues.join('；') : '<span class="tag blue">一致</span>') + '</td></tr>';
    }).join('');
    return '<div class="card" style="overflow: hidden"><div class="card-head"><h2 style="font-size: 15px">账单核对 · ' + D.BILLS.length + ' 条，' + bad + ' 条异常</h2>' + rule('提货价 / 实际签收价与对应周不符 → 异常') + '</div>' +
      '<div style="overflow-x: auto"><table class="simple-table"><tr><th>运单</th><th>物流商</th><th>渠道 · 仓</th><th>提货日</th><th>对应周报价</th><th>提货价</th><th>实际签收价</th><th>核对</th></tr>' + rows + '</table></div>' +
      '<p class="foot-note">已写入配合数据的「账单差错次数」，三维对比页和周评分页的配合参考分会显示来源。 ' + tbd('差错计次', '一条账单怎样计成一次差错、价格异常是否计入差错，还没定') + ' 原型保留设计稿示例次数（A 1 / B 0 / C 3 / D 1 / E 2），不按上表重算。</p></div>';
  }
  function trackResult() {
    var rows = D.TRACKS.map(function (t) {
      var c = D.chByKey(t.ch);
      return '<tr class="' + (t.unmatched ? 'bad' : '') + '"><td class="mono">' + t.no + '</td><td>' + P[t.i] + '</td><td>' + c.label + ' · ' + t.wh + '</td><td>' + t.picked + '</td><td>' + t.signed + '</td><td>' + t.days + ' 天</td><td>' +
        (t.unmatched ? '<span class="tag new">未对上运单</span> ' + tbd('轨迹对票') : '<span class="tag blue">已写入实际时效</span>') + '</td></tr>';
    }).join('');
    return '<div class="card" style="overflow: hidden"><div class="card-head"><h2 style="font-size: 15px">轨迹写入 · ' + D.TRACKS.length + ' 条</h2>' + rule('轨迹 → 实际时效') + '</div>' +
      '<div style="overflow-x: auto"><table class="simple-table"><tr><th>运单</th><th>物流商</th><th>渠道 · 仓</th><th>提货</th><th>签收</th><th>实际天数</th><th>结果</th></tr>' + rows + '</table></div>' +
      '<p class="foot-note">实际时效应取运单均值。 ' + tbd('轨迹对票', '一条轨迹怎样对应一票运单、是否同时写「是否准时」，还没定') + ' 三维对比和周评分仍显示设计稿的估算天数，并标明来源。</p></div>';
  }

  function importStep2() {
    var nAuto = 0, nPend = 0, nNew = 0;
    var rows = D.NAMES.map(function (x, k) {
      var ch = choiceOf(k), top = x.cands[0], autoHit = S.names[k] === undefined && top && top[1] >= 90;
      var status, sCls, hint, bg = '#FFFFFF';
      if (ch === null) { nPend++; status = '待确认'; sCls = 'background: #FFF1E6; color: #8F3A05'; bg = '#FFF7F0'; hint = top ? '建议：' + P[top[0]] + (x.cands.length > 1 ? '，有多个候选' : '') : '没找到相似名称，可能是新物流商'; }
      else if (ch === 'new') { nNew++; status = '新物流商'; sCls = 'background: #EEF0F3; color: #3A3F49'; hint = '将新建，标记为「未合作」'; }
      else if (autoHit) { nAuto++; status = '自动匹配'; sCls = 'background: #E9EEFC; color: #1A3BA6'; hint = '相似度 ' + top[1] + '%，可改'; }
      else { status = '已确认'; sCls = 'background: #1A3BA6; color: #FFFFFF'; hint = S.remember ? '别名将记住' : ''; }
      if (x.backup && ch !== null && ch !== 'new') hint += '；无第 ' + D.WEEK + ' 周价格 → 备用，不进入清洗与比价';
      var opts = x.cands.map(function (c) {
        var on = ch === c[0];
        var st = c[1] >= 90 ? 'background: #E9EEFC; color: #1A3BA6' : c[1] >= 60 ? 'background: #FFF1E6; color: #8F3A05' : 'background: #EEF0F3; color: #5E6470';
        return '<button class="opt' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-a="name" data-k="' + k + '" data-v="' + c[0] + '">' + P[c[0]] + '<span class="sim" style="' + st + '">' + c[1] + '%</span></button>';
      });
      opts.push('<button class="opt' + (ch === 'new' ? ' on' : '') + '" data-a="name" data-k="' + k + '" data-v="new">作为新物流商</button>');
      return '<div class="row-grid" style="grid-template-columns: minmax(220px, 1fr) minmax(0, 2fr) 200px; background: ' + bg + '"><div><div style="font-size: 15px; font-weight: 600">' + x.raw + (x.backup ? ' <span class="tag backup">备用</span>' : '') + '</div><div class="sub" style="margin-top: 3px">' + x.file + ' · ' + x.rows + ' 行</div></div>' +
        '<div style="display: flex; flex-wrap: wrap; gap: 8px">' + opts.join('') + '</div>' +
        '<div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; text-align: right"><span class="status-pill" style="' + sCls + '">' + status + '</span><span class="sub">' + hint + '</span></div></div>';
    }).join('');
    var blocked = nPend > 0;
    return '<section class="card" style="overflow: hidden" aria-label="确认物流商"><div class="card-head" style="align-items: flex-start"><div style="flex: 1 1 520px"><h2>确认物流商是谁</h2><p class="lead" style="font-size: 13px">先去掉「有限公司 / 国际 / 物流 / 货运 / 地名括号 / 空格符号」再比对相似度。≥ 90% 自动匹配（可改）；60–89% 给出候选，需要你点选确认；低于 60% 默认按新物流商处理。</p></div>' +
      '<div style="display: flex; gap: 8px; flex-wrap: wrap; font-size: 13px"><span class="status-pill" style="background: #E9EEFC; color: #1A3BA6">自动匹配 ' + nAuto + '</span><span class="status-pill" style="background: #FFF1E6; color: #8F3A05">待确认 ' + nPend + '</span><span class="status-pill" style="background: #EEF0F3; color: #3A3F49">新物流商 ' + nNew + '</span></div></div>' +
      '<div class="row-grid th" style="grid-template-columns: minmax(220px, 1fr) minmax(0, 2fr) 200px"><span>报价单里的名称</span><span>匹配到（点选确认）</span><span style="text-align: right">状态</span></div>' + rows +
      '<div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 20px; border-top: 1px solid #E3E5EA"><label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #3A3F49; min-height: 44px"><input type="checkbox" data-a="remember"' + (S.remember ? ' checked' : '') + ' style="width: 18px; height: 18px; accent-color: #2450D8">记住确认过的别名，下次导入自动识别</label>' +
      '<div style="display: flex; gap: 10px"><button class="btn" data-a="step" data-v="1">上一步</button><button class="btn primary" data-a="step" data-v="3"' + (blocked ? ' disabled' : '') + '>' + (blocked ? '还有 ' + nPend + ' 个待确认' : '下一步：清洗数据') + '</button></div></div></section>';
  }

  function importStep3() {
    var pending = 0;
    var issues = D.ISSUES.map(function (x, i) {
      var s = S.issues[i];
      if (x.expired) {
        return '<div class="issue" style="background: #FAFAFB"><span class="type">' + x.type + '</span><span style="flex: 1 1 360px">' + x.text + '</span><span class="muted">' + x.where + '</span><span style="font-weight: 600; color: #5E6470">不参与比价</span>' + rule('不拿旧价顶上') + '</div>';
      }
      if (!s) pending++;
      var actions = !s ? '<button class="btn outline-blue sm" data-a="issue" data-k="' + i + '" data-v="fix">' + x.fixLabel + '</button><button class="btn sm" data-a="issue" data-k="' + i + '" data-v="skip">忽略</button>'
        : '<span style="font-weight: 600; color: #5E6470">' + (s === 'fix' ? '已处理' : '已忽略') + '</span><button class="link-btn" data-a="issue" data-k="' + i + '" data-v="">撤销</button>';
      var tb = x.tbdFix ? tbd('标为正确 / 忽略后是否进比价') : (s === 'skip' ? tbd('忽略后是否进比价') : '');
      return '<div class="issue" style="background: ' + (s ? '#FAFAFB' : '#FFFFFF') + '"><span class="type">' + x.type + '</span><span style="flex: 1 1 360px">' + x.text + '</span><span class="muted">' + x.where + '</span>' + actions + tb + '</div>';
    }).join('');
    var stat = function (k, v, color) { return '<div class="card stat"><div class="k">' + k + '</div><div class="v" style="font-size: 28px' + (color ? '; color: ' + color : '') + '">' + v + '</div></div>'; };
    var h = '<section class="grid-cards" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))" aria-label="清洗概况">' + stat('原始行数', '1,364') + stat('自动修正', '331', '#1A3BA6') + stat('去重删除', '65') + stat('待你确认', pending, '#8F3A05') +
      '<div class="card stat dark"><div class="k">可用于比对</div><div class="v" style="font-size: 28px">1,292</div></div></section>';
    h += '<div class="flex-wrap"><section class="card" style="flex: 1 1 440px; min-width: 0; overflow: hidden"><div class="card-head" style="display: block"><h2 style="font-size: 16px">字段映射</h2><div class="sub" style="margin-top: 4px">系统按列名自动识别，识别错的直接改</div></div>' + D.MAPS.map(function (m, k) {
      var cur = S.maps[k] || m.std;
      var opts = ['物流商', '渠道', '目的仓库', '单价', '时效', '生效日期', '忽略此列'];
      return '<div class="map-row"><span class="mono" style="color: #3A3F49">' + m.raw + '</span><span class="muted">→</span><select data-a="map" data-k="' + k + '" aria-label="' + m.raw + ' 映射到">' + opts.map(function (o) { return '<option' + (o === cur ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select><span style="font-size: 12px; text-align: right; color: ' + (m.conf === '确定' ? '#5E6470' : '#8F3A05') + '">' + m.conf + '</span></div>';
    }).join('') + '</section>';
    h += '<section class="card" style="flex: 1 1 520px; min-width: 0; overflow: hidden"><div class="card-head" style="display: block"><h2 style="font-size: 16px">清洗记录</h2><div class="sub" style="margin-top: 4px">每条规则都有示例</div></div>' + D.RULES.map(function (r) {
      return '<div style="padding: 14px 20px; border-top: 1px solid #EEF0F3; display: flex; flex-direction: column; gap: 8px"><div style="display: flex; justify-content: space-between; gap: 12px; font-size: 14px"><span style="font-weight: 600">' + r.name + '</span><span style="color: #1A3BA6; font-weight: 600">' + r.count + ' 行</span></div><div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px"><span class="before mono">' + r.before + '</span><span class="muted">→</span><span class="after mono">' + r.after + '</span></div></div>';
    }).join('') + '</section></div>';
    h += '<section class="card" style="overflow: hidden" aria-label="待确认"><div class="card-head"><h2 style="font-size: 16px">待你确认 · ' + pending + ' 条</h2><span class="sub">不处理也能继续，这些行不参与比价</span></div>' + issues +
      '<div style="display: flex; justify-content: space-between; padding: 16px 20px; border-top: 1px solid #E3E5EA"><button class="btn" data-a="step" data-v="2">上一步</button><button class="btn primary" data-a="step" data-v="4">下一步：按仓库比价</button></div></section>';
    return h;
  }

  function importStep4() {
    var t = warehouseTable(S.ch);
    var h = chipsHtml('ch') + weekBanner() + backupBanner('不进入这张比价表、不打当周 S–D，也不另给一份周比价分');
    if (t.newInCh) h += '<div class="banner orange"><span class="grow"><b style="color: #8F3A05">物流商 F 没有合作过。</b>它的报价参与比价，但只代表报价，没有实际时效和配合记录；在 ' + t.newWins + ' 个仓是最低价。要用它，建议先小批量试单。</span></div>';
    else if (!fIsNew() && D.chByKey(S.ch).data[F]) h += '<div class="banner grey"><span class="grow">F速运国际 在第 2 步还没建成新物流商，暂不进入这张表。</span></div>';
    h += '<section class="grid-cards" aria-label="比价概况">' +
      '<div class="card stat"><div class="k">覆盖仓库</div><div class="v">' + t.sum.wh + ' 个</div><div class="d">' + t.sum.zones + '</div></div>' +
      '<div class="card stat"><div class="k">已合作中拿下最多仓最低价</div><div class="v">' + t.sum.top + '</div><div class="d">' + t.sum.topWins + ' 个仓最低</div></div>' +
      '<div class="card stat"><div class="k">平均最高最低价差</div><div class="v">' + t.sum.avgGap + '%</div><div class="d">价差最大：' + t.sum.maxGapWh + '</div></div>' +
      '<div class="card stat dark" style="display: flex; flex-direction: column; gap: 6px"><div class="k">按仓选已合作最低价可省</div><div class="v" style="margin: 0">' + t.sum.save + '%</div><div class="d">对比全部走 ' + t.sum.single + '</div>' +
      (t.sum.save < 0 ? '<div>' + tbd('缺仓时节省比例口径', '单一物流商有仓无报价时，分子分母覆盖的仓库不是同一批，比例可能为负；设计稿未定，原型照原公式显示') + '</div>' : '') +
      (t.newInCh ? '<div style="font-size: 13px; padding-top: 6px; border-top: 1px solid #3A57BE">算上 物流商 F 可再省 ' + t.sum.extra + '%（需试单验证）</div>' : '') + '</div></section>';
    var synced = S.synced[S.ch];
    h += '<section class="card" style="overflow: hidden" aria-label="仓库比价表"><div class="card-head"><h2>' + t.cur.label + ' · 按亚马逊仓库比价（¥/kg · 第 ' + D.WEEK + ' 周）</h2><div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center">' +
      (synced ? '<span style="font-size: 13px; color: #1A3BA6; font-weight: 600">已同步为第 ' + D.WEEK + ' 周价格参考分</span>' : '') +
      '<button class="btn sm" data-a="export">导出比价表</button><button class="btn primary sm" data-a="sync">同步为本周价格参考分</button></div></div>';
    var cols = t.prov.length;
    h += '<div style="overflow-x: auto"><div class="wh-grid" style="min-width: ' + (180 + cols * 160 + 100) + 'px; grid-template-columns: 180px repeat(' + cols + ', minmax(160px, 1fr)) 100px">';
    h += '<div class="h first">仓库</div>' + t.prov.map(function (i) { return '<div class="h">' + P[i] + (i === F ? ' <span class="tag new">未合作</span>' : '') + '</div>'; }).join('') + '<div class="h">价差</div>';
    t.rows.forEach(function (r) {
      if (!r.code) { h += '<div class="zone">' + r.zone + ' · ' + r.count + ' 个仓</div>'; return; }
      h += '<div class="first"><div class="mono" style="font-size: 14px; font-weight: 700">' + r.code + '</div><div class="sub" style="margin-top: 2px">' + r.place + '</div></div>';
      r.cells.forEach(function (c) {
        if (c.none) { h += '<div style="background: #FAFAFB; font-size: 13px; color: #6B7280">无报价</div>'; return; }
        h += '<div style="background: ' + (c.min ? '#F0F4FF' : c.newMin ? '#FFF7F0' : '#FFFFFF') + '"><div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap"><span style="font-size: 15px; font-weight: ' + (c.min || c.newMin ? 700 : 500) + '">¥' + c.v.toFixed(1) + '</span>' +
          (c.min ? '<span class="tag dark">最低</span>' : '') + (c.newMin ? '<span class="tag warn">报价最低 · 待试单</span>' : '') + '</div><div class="sub" style="margin-top: 2px">' + c.diff + '</div></div>';
      });
      h += '<div style="font-size: 14px; font-weight: 600; color: ' + (r.gap >= 15 ? '#8F3A05' : '#3A3F49') + '">' + r.gap + '%</div>';
    });
    h += '</div></div><p class="foot-note">「最低」只在已合作物流商中评出；未合作物流商的低价单独标「报价最低 · 待试单」。「+x%」= 比该仓已合作最低价贵多少。价格为清洗后统一口径：¥/kg、含燃油附加费、只取第 ' + D.WEEK + ' 周报价；备用服务商不进入本表。<br>' +
      '「同步为本周价格参考分」把当前渠道的分仓比价写成周评分页的价格参考分。 ' + tbd('仓库价收成渠道单价', '仓库价怎样收成一个渠道单价还没有公式；原型沿用设计稿的渠道基准价算价格参考分') + '</p></section>';
    return h;
  }

  // ---------- 页面：渠道优势对比 ----------
  function pageChannels() {
    var list = D.CH.filter(function (c) { return c.region === S.region; });
    var provs = [0, 1, 2, 3, 4].filter(function (i) { return !isBackup(i); });
    var chs = list.map(function (c) {
      var bp = -1, bs = -1, bt = -1, minD = 999, maxD = 0, minP = 999, maxP = 0, n = 0;
      provs.forEach(function (i) {
        var d = c.data[i]; if (!d) return;
        n++;
        minD = Math.min(minD, d[0]); maxD = Math.max(maxD, d[1]); minP = Math.min(minP, d[2]); maxP = Math.max(maxP, d[2]);
        if (bp < 0 || d[2] < c.data[bp][2]) bp = i;
        if (bs < 0 || d[0] + d[1] < c.data[bs][0] + c.data[bs][1]) bs = i;
        if (bt < 0 || d[3] > c.data[bt][3]) bt = i;
      });
      return { c: c, n: n, bp: bp, bs: bs, bt: bt, days: minD + '–' + maxD, price: '¥' + minP + '–' + maxP };
    });
    var icons = {
      air: '<path d="M10 4l2 0 3 7 5 1v2l-5 1-3 5h-2l1.5-5H7l-1.5 2H4l1-3-1-3h1.5L7 13h4.5z"></path>',
      sea: '<path d="M4 14h16l-2.5 5h-11z"></path><path d="M7 14V9h10v5"></path><path d="M12 9V5"></path><path d="M3 21c2 0 2-1 4.5-1s2.5 1 4.5 1 2-1 4.5-1 2.5 1 4.5 1"></path>',
      rail: '<rect x="6" y="3" width="12" height="13" rx="3"></rect><path d="M6 10h12"></path><path d="M8 20l2-4M16 20l-2-4"></path>',
      truck: '<path d="M3 7h11v9H3z"></path><path d="M14 10h4l3 3v3h-7z"></path><circle cx="7" cy="18" r="1.6"></circle><circle cx="17" cy="18" r="1.6"></circle>'
    };
    var h = '<div class="head-row"><div><h1>渠道优势对比</h1><p class="lead">按目的地查看每家物流商在各运输方式上的时效、价格与准时率，自动标出每个渠道的最优选择。</p></div>' + regionSeg(['美国 · 空 / 海', '欧洲 · 铁 / 海 / 空 / 卡航']) + '</div>';
    h += weekBanner() + backupBanner('不出现在渠道概览和矩阵里，不打当周 S–D');
    h += '<section class="grid-cards" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr))" aria-label="渠道概览">' + chs.map(function (x) {
      var sel = x.c.key === S.ch;
      return '<article class="card card-pad" style="display: flex; flex-direction: column; gap: 14px;' + (sel ? ' border: 2px solid #2450D8' : '') + '"><div style="display: flex; align-items: center; gap: 12px"><span style="width: 40px; height: 40px; border-radius: 10px; background: #E9EEFC; display: inline-flex; align-items: center; justify-content: center"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2450D8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + icons[x.c.kind] + '</svg></span>' +
        '<div style="flex: 1"><div style="font-size: 17px; font-weight: 600">' + x.c.name + '</div><div class="sub">' + x.n + ' 家可走</div></div>' +
        (sel ? '<span class="tag blue">当前渠道</span>' : '<button class="link-btn" data-a="ch" data-v="' + x.c.key + '">设为当前渠道</button>') + '</div>' +
        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px"><div><div class="sub">典型时效</div><div style="font-size: 16px; font-weight: 600; margin-top: 2px">' + x.days + ' 天</div></div><div><div class="sub">价格区间</div><div style="font-size: 16px; font-weight: 600; margin-top: 2px">' + x.price + '</div></div></div>' +
        '<div style="font-size: 13px; color: #3A3F49; line-height: 1.6; padding: 10px 12px; background: #F6F7F9; border-radius: 8px">适合：' + x.c.fit + '</div>' +
        '<div style="display: flex; flex-direction: column; gap: 6px; font-size: 13px"><div class="kv"><span class="muted">价格最优</span><b>' + P[x.bp] + '</b></div><div class="kv"><span class="muted">时效最快</span><b>' + P[x.bs] + '</b></div><div class="kv"><span class="muted">最稳定（准时率）</span><b>' + P[x.bt] + '</b></div></div></article>';
    }).join('') + '</section>';
    h += '<section class="card" style="overflow: hidden" aria-label="物流商 × 渠道矩阵"><div class="card-head"><h2>物流商 × 渠道矩阵 · ' + (S.region === 'us' ? '美国' : '欧洲') + '</h2><div style="display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: #3A3F49"><span><span class="tag blue">价</span> 价格最低</span><span><span class="tag dark">快</span> 时效最快</span><span><span class="tag new">稳</span> 准时率最高</span></div></div>';
    h += '<div style="overflow-x: auto"><div class="mx" style="display: grid; min-width: ' + (200 + chs.length * 200) + 'px; grid-template-columns: 200px repeat(' + chs.length + ', minmax(200px, 1fr))"><div class="h first">物流商</div>' + chs.map(function (x) { return '<div class="h"' + (x.c.key === S.ch ? ' style="color: #1A3BA6"' : '') + '>' + x.c.name + '（¥/kg）</div>'; }).join('');
    provs.forEach(function (i) {
      var open = chs.filter(function (x) { return x.c.data[i]; }).length;
      h += '<div class="first"><div style="font-size: 15px; font-weight: 600">' + P[i] + '</div><div class="sub">开通 ' + open + ' 个渠道</div></div>';
      chs.forEach(function (x) {
        var d = x.c.data[i];
        if (!d) { h += '<div style="background: #FAFAFB; font-size: 13px; color: #6B7280">未开通</div>'; return; }
        var best = x.bp === i || x.bs === i || x.bt === i;
        h += '<div style="background: ' + (best ? '#FBFCFF' : '#FFFFFF') + '"><div><span style="font-size: 18px; font-weight: 600">' + d[0] + '–' + d[1] + '</span> <span class="sub">天</span></div><div style="font-size: 13px; color: #3A3F49; margin-top: 4px">¥' + d[2] + ' · 准时 ' + d[3] + '%</div><div style="display: flex; gap: 6px; margin-top: 8px">' +
          (x.bp === i ? '<span class="tag blue" style="font-size: 12px">价</span>' : '') + (x.bs === i ? '<span class="tag dark" style="font-size: 12px">快</span>' : '') + (x.bt === i ? '<span class="tag new" style="font-size: 12px">稳</span>' : '') + '</div></div>';
      });
    });
    h += '</div></div><p class="foot-note">口径：时效 = 提货至仓库签收天数（近 4 周区间）；价格 = 第 ' + D.WEEK + ' 周含燃油附加费的单价；准时率 = 近 4 周按承诺时效内签收的票数占比。数据来源：[物流报价表 / 轨迹导出]。未合作的物流商 F 和备用服务商不在本页。</p></section>';
    return h;
  }

  // ---------- 页面：价格 · 时效 · 配合 ----------
  function pageCompare() {
    var cur = D.chByKey(S.ch);
    var items = [], closed = [];
    [0, 1, 2, 3, 4].forEach(function (i) {
      if (isBackup(i)) return;
      var d = cur.data[i];
      if (!d) { closed.push(P[i]); return; }
      var avg = (d[0] + d[1]) / 2;
      items.push({ i: i, d: d, actual: r1(avg * (1 + (100 - d[3]) / 200)) });
    });
    var minP = Math.min.apply(null, items.map(function (x) { return x.d[2]; }));
    var minA = Math.min.apply(null, items.map(function (x) { return x.actual; }));
    items.forEach(function (x) {
      x.pS = r1(10 * minP / x.d[2]); x.tS = r1(5 * minA / x.actual + x.d[3] / 20); x.cS = D.COOP[x.i];
      x.total = Math.round(x.pS * 3 + x.tS * 4 + x.cS * 3);
    });
    var byTotal = items.slice().sort(function (a, b) { return b.total - a.total; });
    var best = function (f, asc) { return items.slice().sort(function (a, b) { return asc ? f(a) - f(b) : f(b) - f(a); })[0]; };
    var bp = best(function (x) { return x.d[2]; }, true), bt = best(function (x) { return x.actual; }, true), bc = best(function (x) { return x.cS; }, false);
    var h = '<div><h1>价格 · 时效 · 配合 三维对比</h1><p class="lead">选一个渠道，横向比较各物流商的成本、时效兑现和配合度；三项分数是系统参考分，运营在周评分页可以调整。</p></div>';
    h += chipsHtml('ch') + weekBanner() + backupBanner('不进入这张对比，不打当周 S–D，也不另给一份周比价分');
    h += '<section class="grid-cards" aria-label="推荐">' +
      '<div class="card stat"><div class="k">成本优先</div><div class="v" style="font-size: 20px; margin-top: 6px">' + P[bp.i] + '</div><div class="d">单价最低 ¥' + bp.d[2] + '/kg</div></div>' +
      '<div class="card stat"><div class="k">时效优先</div><div class="v" style="font-size: 20px; margin-top: 6px">' + P[bt.i] + '</div><div class="d">实际平均 ' + bt.actual + ' 天</div></div>' +
      '<div class="card stat"><div class="k">配合最好</div><div class="v" style="font-size: 20px; margin-top: 6px">' + P[bc.i] + '</div><div class="d">配合分 ' + bc.cS + ' / 10</div></div>' +
      '<div class="card stat dark"><div class="k">综合推荐（价 30% · 时 40% · 配 30%）</div><div class="v" style="font-size: 20px; margin-top: 6px">' + P[byTotal[0].i] + '</div><div class="d">综合 ' + byTotal[0].total + ' 分</div></div></section>';
    var srcBill = S.billDone ? '<span class="tag blue">来自账单导入</span>' : '<span class="tag grey">未导入账单 · 示例</span>';
    var srcTrack = S.trackDone ? '<span class="tag blue">轨迹已导入</span>' : '<span class="tag grey">未导入轨迹 · 示例估算</span>';
    h += '<section class="card" style="overflow: hidden" aria-label="对比表"><div class="card-head"><h2>' + cur.label + ' · 物流商对比</h2><span class="sub" style="font-size: 13px">' + (closed.length ? '未开通：' + closed.join('、') : items.length + ' 家均已开通') + '</span></div>';
    h += '<div style="overflow-x: auto"><div style="min-width: 1080px"><div class="cmp" style="background: #F6F7F9; font-size: 12px; font-weight: 600; color: #5E6470"><div style="padding: 12px 20px">物流商</div><div style="padding: 12px 16px">价格</div><div style="padding: 12px 16px; flex-direction: row; flex-wrap: wrap; align-items: center">时效 ' + srcTrack + '</div><div style="padding: 12px 16px; flex-direction: row; flex-wrap: wrap; align-items: center">配合 ' + srcBill + '</div><div style="padding: 12px 16px">综合</div></div>';
    var bar = function (v, color) { return '<div class="bar"><div class="track"><div class="fill" style="width: ' + v * 10 + '%; background: ' + color + '"></div></div><span class="num">' + v + '</span></div>'; };
    byTotal.forEach(function (x, k) {
      var g = gradeOf(x.total);
      h += '<div class="cmp" style="border-top: 1px solid #E3E5EA"><div><div style="font-size: 15px; font-weight: 600">' + P[x.i] + '</div><div class="sub">排名第 ' + (k + 1) + '</div></div>' +
        '<div><div class="kv"><span class="muted">单价</span><b>¥' + x.d[2] + '/kg</b></div><div class="kv"><span class="muted">附加费占比</span><span>' + D.SUR[x.i] + '%</span></div>' + bar(x.pS, '#2450D8') + '</div>' +
        '<div><div class="kv"><span class="muted">承诺 / 实际</span><b>' + x.d[0] + '–' + x.d[1] + ' / ' + x.actual + ' 天</b></div><div class="kv"><span class="muted">准时率</span><span>' + x.d[3] + '%</span></div>' + bar(x.tS, '#1A3BA6') + '</div>' +
        '<div><div class="kv"><span class="muted">响应 / 异常处理</span><b>' + D.RESP[x.i] + ' 小时 / ' + D.EXC[x.i] + ' 天</b></div><div class="kv"><span class="muted">账单差错</span><span>' + D.BILL_ERR[x.i] + ' 次 / 月</span></div>' + bar(x.cS, '#C2570C') + '</div>' +
        '<div style="justify-content: center"><div style="font-size: 26px; font-weight: 700">' + x.total + '</div><span class="gb g-' + g + '" style="align-self: flex-start; padding: 3px 10px">' + g + ' 级</span><span class="sub">渠道等级</span></div></div>';
    });
    h += '</div></div><p class="foot-note">参考分算法：价格分 = 最低单价 ÷ 本家单价 × 10；时效分 = 一半看实际天数（最快 ÷ 本家）、一半看准时率；配合分 = 响应速度、异常处理、账单准确三项加权。综合 = 价格 30% + 时效 40% + 配合 30%，满分 100。等级是这个渠道的等级，和服务商等级分开。<br>' +
      tbd('评分取整和权重', '本页价格分、时效分保留 1 位小数、权重固定 30/40/30；周评分页取 0.5 步长、权重可换。两页是否统一还没定') + ' ' +
      tbd('配合分月 / 周口径', '账单差错本页按「次/月」，数据模型按周记录；配合三项权重也没定，示例直接用 8.5 / 9.4 / 6.2 / 8.0 / 7.1') + ' ' +
      tbd('轨迹对票', '实际天数应取运单均值；对票规则没定，本页仍用设计稿估算：承诺均值 × (1 + (100 − 准时率) / 200)') + '</p></section>';
    return h;
  }

  // ---------- 页面：周评分与评级 ----------
  function pageScore() {
    var w = D.PRESETS[S.preset].w;
    var all = scoreAll();
    var alerts = [], banners = [];
    var tagNew = 'background: #FFF1E6; color: #8F3A05', tagWarn = 'background: #8F3A05; color: #FFFFFF', tagInfo = 'background: #E9EEFC; color: #1A3BA6', tagGrey = 'background: #EEF0F3; color: #3A3F49';
    var cards = [];
    [0, 1, 2, 3, 4, 5, 6].forEach(function (i) {
      if (isBackup(i)) {
        alerts.push({ tag: '备用', st: tagGrey, bg: '#F6F7F9', text: P[i] + '：第 ' + D.WEEK + ' 周没有价格，放入备用，不打当周 S–D，也不另给周比价分。' });
        cards.push('<article class="pcard backup"><div style="display: flex; justify-content: space-between"><div><div style="font-size: 15px; font-weight: 600">' + P[i] + '</div><div class="sub">备用 · 最近一周无价格</div></div><span class="grade g-none">备用</span></div>' +
          '<div style="font-size: 13px; color: #3A3F49; line-height: 1.6">最近报价停在第 ' + D.QUOTE_WEEK[i] + ' 周，不拿来顶上。本周<b>不打 S–D</b>，不进渠道对比，也不给周比价分。</div>' + rule('备用不比对') + '<div class="act">动作：催更第 ' + D.WEEK + ' 周报价</div></article>');
        return;
      }
      var mine = all.filter(function (x) { return x.b.i === i; });
      var chList = '<div class="chgrades"><div class="sub" style="font-weight: 600">渠道评级（单独评）</div>' + mine.map(function (x) {
        var g = x.grade, pre = x.isNew;
        return '<div><span>' + (x.b.region === 'us' ? '美国' : '欧洲') + x.b.ch + '</span><span>' + (x.total == null ? '<span class="sub">待打分</span>' : x.total + ' <span class="gb ' + (pre ? 'g-pre' : 'g-' + g) + '" style="min-width: 22px; padding: 1px 3px; font-size: 11px">' + g + '</span>' + (pre ? ' <span class="sub">次级</span>' : '')) + '</span></div>';
      }).join('') + '</div>';
      if (i === F) {
        var pres = mine.filter(function (x) { return x.isNew; });
        var trial = S.trial.status === '试单中';
        var avg = function (arr, f) { return arr.length ? Math.round(arr.reduce(function (s, x) { return s + f(x); }, 0) / arr.length * 10) / 10 : '—'; };
        var preTotal = pres.length ? Math.round(pres.reduce(function (s, x) { return s + x.total; }, 0) / pres.length) : null;
        var preGrade = preTotal == null ? '—' : gradeOf(preTotal);
        var cheap = mine.filter(function (x) { return x.b.cheaper; }).map(function (x) { return '欧洲' + x.b.ch; });
        var chs = mine.map(function (x) { return '欧洲' + x.b.ch; }).join('、');
        banners.push('<div class="banner orange" role="status" style="align-items: center"><span class="grow"><b style="color: #8F3A05">' + P[i] + (trial ? ' 试单中，仍按报价预评级' : ' 没有合作过，先按报价预评级') + '：' + preGrade + ' 级（' + preTotal + ' 分）· 次级。</b>只用了价格和报价里的承诺时效（' + chs + '）；实际时效兑现和配合度要试单后才评。试单签收按渠道计，哪个渠道满 3 票，哪个渠道转正式。' + (cheap.length ? '它的' + cheap.join('、') + '报价低于现有合作物流商，值得试单。' : '') + '</span>' +
          (trial ? '<span class="tag new" style="font-size: 13px; padding: 6px 12px">已安排试单</span>' : '<button class="btn warn" data-a="trial">安排试单</button>') + tbd('试单先选渠道 / 票数', '点「安排试单」前要不要先选渠道或票数，还没定；原型对 F 有报价的三个渠道一起安排') + '</div>');
        alerts.push({ tag: '新物流商', st: tagNew, bg: '#FFF7F0', text: P[i] + (trial ? ' 试单中' : ' 未合作过') + '：按报价预评级 ' + preGrade + ' 级（次级），不参与排名。各渠道签收满 3 票后，该渠道加入实际时效和配合，转正式评级。' });
        var prog = mine.map(function (x) {
          var n = signedOf(x.b.chKey);
          return '<div><div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #5E6470; margin-bottom: 4px"><span>欧洲' + x.b.ch + '</span><span>' + Math.min(n, 3) + ' / 3 票签收' + (n >= 3 ? ' · <b style="color: #1A3BA6">已转正式</b>' : '') +
            (trial && n < 3 ? ' <button class="link-btn" data-a="sign" data-v="' + x.b.chKey + '">+1 签收（演示）</button>' : '') + '</span></div><div class="progress"><div style="width: ' + Math.round(Math.min(n, 3) / 3 * 100) + '%"></div></div></div>';
        }).join('');
        cards.push('<article class="pcard pre"><div style="display: flex; justify-content: space-between; align-items: flex-start"><div><div style="font-size: 15px; font-weight: 600">' + P[i] + '</div><div class="sub">' + S.trial.status + ' · 服务商次级</div></div><span class="grade g-pre">' + preGrade + '</span></div>' +
          '<div style="display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap"><span style="font-size: 30px; font-weight: 700">' + (preTotal == null ? '—' : preTotal) + '</span><span style="font-size: 13px; font-weight: 600; color: #8F3A05">预评级 · 仅看报价</span></div>' +
          '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12px"><span style="padding: 4px 8px; border-radius: 6px; background: #E9EEFC; color: #1A3BA6">价格 ' + avg(pres, function (x) { return x.p; }) + '</span><span style="padding: 4px 8px; border-radius: 6px; background: #E9EEFC; color: #1A3BA6">报价时效 ' + avg(pres, function (x) { return x.t; }) + '</span><span style="padding: 4px 8px; border-radius: 6px; border: 1px dashed #C2570C; color: #8F3A05">实际时效 待试单</span><span style="padding: 4px 8px; border-radius: 6px; border: 1px dashed #C2570C; color: #8F3A05">配合 待试单</span></div>' +
          '<div style="display: flex; flex-direction: column; gap: 8px"><div class="sub" style="font-weight: 600">试单进度（按渠道计）</div>' + prog + '</div>' + rule('满 3 票按渠道计') + chList +
          '<div class="act">动作：' + (trial ? '试单中，跟踪签收' : '安排小批量试单') + '</div></article>');
        return;
      }
      var total = Math.round(mine.reduce(function (s, x) { return s + x.total; }, 0) / mine.length);
      var g = gradeOf(total), last = gradeOf(D.HIST[i][6]);
      var ORDER = ['S', 'A', 'B', 'C', 'D'];
      var diff = ORDER.indexOf(last) - ORDER.indexOf(g);
      var series = D.HIST[i].concat([total]);
      mine.forEach(function (x) {
        [['t', '时效分'], ['p', '价格分'], ['c', '配合分']].forEach(function (f) { if (x[f[0]] < 5) alerts.push({ tag: '预警', st: tagWarn, bg: '#FFF7F0', text: P[i] + ' ' + x.b.chLabel + '：' + f[1] + ' ' + x[f[0]] + '，低于 5 分' }); });
      });
      if (diff < 0) alerts.push({ tag: '降级', st: tagWarn, bg: '#FFF7F0', text: P[i] + '：由 ' + last + ' 降为 ' + g + ' 级，' + D.ACT[g] });
      if (diff > 0) alerts.push({ tag: '升级', st: tagInfo, bg: '#F3F6FE', text: P[i] + '：由 ' + last + ' 升为 ' + g + ' 级' });
      if ((g === 'C' || g === 'D') && (last === 'C' || last === 'D')) alerts.push({ tag: '预警', st: tagWarn, bg: '#FFF7F0', text: P[i] + '：连续 2 周 C 级及以下，下周将自动再降一级（演示只提示）' });
      cards.push('<article class="pcard"><div style="display: flex; justify-content: space-between; align-items: flex-start"><div><div style="font-size: 15px; font-weight: 600">' + P[i] + '</div><div class="sub">服务商评级 · ' + mine.length + ' 个渠道</div></div><span class="grade g-' + g + '">' + g + '</span></div>' +
        '<div style="display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap"><span style="font-size: 30px; font-weight: 700">' + total + '</span><span style="font-size: 13px; font-weight: 600; color: ' + (diff > 0 ? '#1A3BA6' : diff < 0 ? '#8F3A05' : '#5E6470') + '">' + (diff > 0 ? '↑ 由 ' + last + ' 升级' : diff < 0 ? '↓ 由 ' + last + ' 降级' : '持平（' + last + '）') + '</span></div>' +
        '<div class="trend" aria-hidden="true">' + series.map(function (v, k) { return '<div style="height: ' + Math.max(4, Math.round(v - 50)) + 'px; background: ' + (k === 7 ? '#2450D8' : '#C9D3F2') + '"></div>'; }).join('') + '</div>' +
        '<div style="display: flex; justify-content: space-between; font-size: 11px; color: #5E6470"><span>第 36 周</span><span>本周</span></div>' + chList +
        '<div class="act">动作：' + D.ACT[g] + '</div></article>');
    });

    var rowsHtml = all.filter(function (x) { return x.b.region === S.region; }).map(function (x) {
      var b = x.b, k = b.key, pre = !!x.isNew, formal = !!x.formal;
      var low = !pre && x.total != null && (x.p < 5 || x.t < 5 || x.c < 5);
      var synced = S.synced[b.chKey];
      var pRef = (pre ? '报价单价 · ' : '') + '参考 ' + b.p + (synced ? ' · <span style="color: #1A3BA6">已同步第 ' + D.WEEK + ' 周分仓比价</span>' : ' · 未同步分仓比价（示例）');
      var slider = function (f, v, label) {
        return '<label class="slider"><input type="range" min="0" max="10" step="0.5" value="' + (v == null ? 0 : v) + '" data-a="score" data-k="' + k + '" data-f="' + f + '" aria-label="' + label + '"><b>' + (v == null ? '—' : v) + '</b></label>';
      };
      var nm = P[b.i] + ' ' + b.chLabel;
      var col3;
      if (pre) col3 = '<div style="font-size: 13px; color: #8F3A05">配合：试单后才打分</div>';
      else if (formal) col3 = '<div>' + slider('fc', x.c, nm + ' 配合分') + '<div class="sub" style="color: #8F3A05">试单满 3 票 · 开始打配合</div></div>';
      else col3 = '<div>' + slider('c', x.c, nm + ' 配合分') + '<div class="sub">参考 ' + b.c + (S.billDone ? ' · 差错次数来自账单导入' : '') + '</div></div>';
      var tCol = pre ? '<div>' + slider('t', x.t, nm + ' 报价时效分') + '<div class="sub" style="color: #8F3A05">按报价承诺 ' + b.prom + ' 天 · 参考 ' + b.qt + '</div></div>'
        : formal ? '<div>' + slider('ft', x.t, nm + ' 时效分') + '<div class="sub" style="color: #8F3A05">改用实际兑现 · 待轨迹导入后打分</div></div>'
        : '<div>' + slider('t', x.t, nm + ' 时效分') + '<div class="sub">实际兑现 · 参考 ' + b.t + (S.trackDone ? ' · 轨迹已导入' : '') + '</div></div>';
      var gradeHtml = x.total == null ? '<span class="sub">待打分</span>' : '<span style="font-size: 20px; font-weight: 700">' + x.total + '</span><span class="gb ' + (pre ? 'g-pre' : 'g-' + x.grade) + '">' + x.grade + '</span>' + (pre ? '<span style="font-size: 11px; font-weight: 600; color: #8F3A05">预评级 · 渠道次级</span>' : formal ? '<span style="font-size: 11px; font-weight: 600; color: #1A3BA6">正式 · 第 1 周保护期</span>' : '');
      var statusTag = b.i === F ? '<span class="tag new">' + (formal ? '已转正式' : S.trial.status === '试单中' ? '试单中 ' + Math.min(signedOf(b.chKey), 3) + '/3' : '未合作') + '</span>' : '';
      return '<div class="score-row" style="background: ' + (pre ? '#FFFBF7' : low ? '#FFF7F0' : '#FFFFFF') + '"><div><div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap"><span style="font-size: 14px; font-weight: 600">' + P[b.i] + '</span>' + statusTag + '</div><div class="sub" style="margin-top: 2px">' + b.ch + '</div></div>' +
        '<div>' + slider('p', x.p, nm + ' 价格分') + '<div class="sub">' + pRef + '</div></div>' + tCol + col3 +
        '<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">' + gradeHtml + '</div></div>';
    }).join('');

    var h = '<div class="head-row"><div><h1>周评分与自动评级</h1><p class="lead">运营每周给每个物流商的每个渠道打价格、时效、配合三项分（0–10），系统按权重算综合分并自动评级。渠道与服务商分别评级，一个好渠道也算不错。</p>' +
      '<div class="banner orange" style="margin-top: 10px; padding: 8px 12px; font-size: 13px; display: inline-flex"><b style="color: #8F3A05">预评级可以显示 S。物流商次级，渠道也次级。</b></div></div>' +
      '<div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center">' + (S.submitted ? '<span style="font-size: 13px; color: #1A3BA6; font-weight: 600">已提交第 ' + D.WEEK + ' 周评分，评级已更新</span>' : '') +
      '<button class="btn" data-a="reset">重置为参考分</button><button class="btn primary" data-a="submit">提交本周评分</button></div></div>';
    h += banners.join('') + backupBanner('不打当周 S–D，也不另给一份周比价分');
    h += '<section class="grid-cards" style="grid-template-columns: repeat(auto-fit, minmax(230px, 1fr))" aria-label="物流商评级">' + cards.join('') + '</section>';
    h += '<div class="banner grey" style="font-size: 13px"><span class="grow">卡片大字是<b>服务商评级</b>，下方列表是<b>渠道评级</b>，两者分开看：渠道等级不会被服务商等级拉低，一个好渠道本身就值得用。</span>' + rule('渠道与服务商分别评级') +
      tbd('服务商评级口径', '服务商评级怎么算还没定；原型暂沿用设计稿示例（服务商分 = 各渠道综合分平均），不把渠道等级推成服务商等级') + '</div>';
    h += '<div class="flex-wrap"><section class="card" style="flex: 999 1 640px; min-width: 0; overflow: hidden" aria-label="本周打分"><div class="card-head"><h2>本周打分表</h2>' + regionSeg(['美国', '欧洲']) + '</div>' +
      '<div style="overflow-x: auto"><div style="min-width: 900px"><div class="score-row th" style="background: #F6F7F9; font-size: 12px; font-weight: 600; color: #5E6470"><div>物流商 / 渠道</div><div>价格（' + Math.round(w[0] * 100) + '%）</div><div>时效（' + Math.round(w[1] * 100) + '%）</div><div>配合（' + Math.round(w[2] * 100) + '%）</div><div>渠道综合 / 等级</div></div>' + rowsHtml + '</div></div>' +
      '<div style="padding: 14px 20px; border-top: 1px solid #E3E5EA; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; font-size: 13px"><label for="note" class="muted">本周备注</label><input id="note" data-a="note" type="text" value="' + (S.note || '').replace(/"/g, '&quot;') + '" placeholder="例如：B 家海运本周爆舱，延误 3 天" style="flex: 1 1 280px; min-height: 40px; padding: 0 12px; border: 1px solid #D5D8DE; border-radius: 8px; font: inherit; font-size: 13px"><span class="muted">打分人：[运营姓名]</span></div>' +
      '<p class="foot-note">参考分先收到 0.5 步长并封顶 10，综合分四舍五入。 ' + tbd('评分取整和权重', '本页取 0.5 步长、权重可换；三维对比页保留 1 位小数、权重固定，两页可差 1 分左右。是否统一还没定') + ' 已同步的价格参考分不会覆盖手改分，点「重置为参考分」才回到参考。</p></section>';
    h += '<aside style="flex: 1 1 320px; display: flex; flex-direction: column; gap: 16px"><section class="card card-pad" style="display: flex; flex-direction: column; gap: 12px"><h2 style="font-size: 16px">评分权重</h2>' +
      Object.keys(D.PRESETS).map(function (k) { return '<button class="preset' + (S.preset === k ? ' on' : '') + '" data-a="preset" data-v="' + k + '"><b>' + D.PRESETS[k].name + '</b><span style="font-size: 12px">' + D.PRESETS[k].desc + '</span></button>'; }).join('') + '</section>';
    var gr = [['S', '≥ 90'], ['A', '80–89'], ['B', '70–79'], ['C', '60–69'], ['D', '< 60']];
    h += '<section class="card card-pad" style="display: flex; flex-direction: column; gap: 10px"><h2 style="font-size: 16px">自动评级规则</h2><div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px">' +
      gr.map(function (x) { return '<div style="display: flex; gap: 10px; align-items: center"><span class="gb g-' + x[0] + '">' + x[0] + '</span><span class="muted" style="width: 56px">' + x[1] + '</span><span>' + D.ACT[x[0]] + '</span></div>'; }).join('') +
      '<div style="display: flex; gap: 10px; align-items: center"><span class="gb g-pre">预</span><span class="muted" style="width: 56px">未合作</span><span>次级：按价格 + 报价承诺时效预评级，同样用 S–D，可以显示 S，不参与排名</span></div>' +
      '<div style="display: flex; gap: 10px; align-items: center"><span class="gb g-none" style="font-size: 11px">备</span><span class="muted" style="width: 56px">备用</span><span>最近一周无价格：不打当周 S–D</span></div></div>' +
      '<div style="font-size: 12px; color: #5E6470; line-height: 1.7; padding-top: 6px; border-top: 1px solid #EEF0F3">附加规则：单项低于 5 分自动预警；连续 2 周 C 及以下自动再降一级（演示只提示）。<br>新物流商：未合作（报价预评级，价格与时效权重按比例放大到 100%）→ 试单中（该渠道签收不足 3 票，仍是次级）→ 该渠道正式评级（该渠道签收满 3 票后，时效换成实际兑现，加入配合）。试单票数按渠道计，不把各渠道加在一起。正式评级前 4 周不触发自动降级。<br>' +
      tbd('降级与 4 周保护期优先级', '连续 C 再降一级降的是服务商还是渠道、和前 4 周保护期谁优先，还没定') + '</div></section>';
    h += '<section class="card card-pad" style="display: flex; flex-direction: column; gap: 10px"><h2 style="font-size: 16px">本周提示 · ' + alerts.length + ' 条</h2>' +
      alerts.map(function (a) { return '<div class="alert-item" style="background: ' + a.bg + '"><span class="tag" style="' + a.st + '">' + a.tag + '</span><span style="color: #3A3F49">' + a.text + '</span></div>'; }).join('') + '</section></aside></div>';
    return h;
  }

  // ---------- 外壳 ----------
  function quoteFrame(view){return '<iframe id="module-frame" title="报价清洗与同仓比价" src="quotes.html?view='+view+'&v=0.2.7-beta.64" style="width:100%;height:1600px;border:0;border-radius:12px"></iframe>';}
  var ROUTES = { import: ['数据导入', function(){return quoteFrame('import');}], channels: ['报价对比', function(){return '<iframe id="module-frame" title="N0.01 报价对比" src="n001.html?v=0.2.7-beta.64" style="width:100%;height:1600px;border:0;border-radius:12px"></iframe>'; }], warehouses: ['国家仓库模板', function(){return quoteFrame('warehouses');}], bills: ['月度对账', function(){return '<iframe id="module-frame" title="月度对账" src="monthly.html?v=0.2.7-beta.64" style="width:100%;height:1100px;border:0"></iframe>';}], score: ['合作评级', function () { return '<iframe id="module-frame" title="月度合作评级" src="ratings.html?v=0.2.7-beta.64" style="width:100%;height:1550px;border:0;border-radius:12px"></iframe>'; }] };
  function route() { var r = (location.hash || '').replace('#/', ''); if(r==='compare')r='channels';return ROUTES[r] ? r : 'import'; }
  function render() {
    var r = route();
    var kindName = { quote: '报价表', bill: '账单', track: '轨迹' }[S.kind];
    var stepName = S.kind === 'quote' ? '第 ' + S.step + ' 步' : kindName;
    var header = '<header class="top"><div class="brand"><span class="brand-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h11v9H3z"></path><path d="M14 10h4l3 3v3h-7z"></path><circle cx="7" cy="18" r="1.6"></circle><circle cx="17" cy="18" r="1.6"></circle></svg></span>物流商评级中心</div>' +
      '<nav class="nav" aria-label="主导航">' + Object.keys(ROUTES).map(function (k) { return '<a href="#/' + k + '" class="' + (k === r ? 'on' : '') + '">' + ROUTES[k][0] + '</a>'; }).join('') + '</nav>' +
      '<div class="top-right"><span class="pill-demo">' + (window.LogisticsSpace?.isDemo?'演示空间 · 独立数据':'真实业务空间') + '</span><details style="position:relative"><summary style="cursor:pointer;color:#617086">演示数据</summary><div style="position:absolute;right:0;top:28px;z-index:50;width:200px;padding:12px;background:white;box-shadow:0 4px 20px #0002;border-radius:10px"><button data-a="demoSuite" class="btn">进入/重置整套Demo</button><button data-a="realSpace" class="btn">返回真实业务</button><button data-a="clearSuite" class="btn" style="margin-top:8px">清除演示数据</button></div></details></div></header>';
    document.getElementById('app').innerHTML = header + '<main style="padding:0;max-width:none">' + ROUTES[r][1]() + '</main>' + '<footer class="app-version">v0.2.7-beta.64 · 本地试用版 · <a href="boundaries.html">使用说明</a></footer>' + (toast ? '<div class="toast" role="status">' + toast + '</div>' : '');
    document.title = ROUTES[r][0] + ' · 物流商评级中心';
  }

  window.addEventListener('message',function(e){var frame=document.getElementById('module-frame');if(!frame||e.source!==frame.contentWindow||e.origin!==location.origin||!e.data||e.data.type!=='module-height')return;var h=e.data.height;if(Number.isFinite(h)&&h>=200&&h<=20000)frame.style.height=Math.ceil(h)+'px';});
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-a]');
    if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    var a = el.getAttribute('data-a'), v = el.getAttribute('data-v'), k = el.getAttribute('data-k');
    if(a==='realSpace'){LogisticsSpace.switchTo('real');return;}
    if(a==='demoSuite'&&!LogisticsSpace.isDemo){location.href='index.html?space=demo&demo=all#/import';return;}
    if(a==='clearSuite'&&!LogisticsSpace.isDemo){showToast('请进入演示空间后清除演示数据。');return;}
    if(a==='demoSuite'){Domain.withWriteLock(()=>{try{Demo.seed();location.href='index.html#/import';location.reload();}catch(e){showToast('演示载入失败，请检查存储并重试。');}});return;}
    if(a==='clearSuite'){Domain.withWriteLock(()=>{try{Demo.clear();location.href='index.html#/import';location.reload();}catch(e){showToast('演示清除失败，请检查存储并重试。');}});return;}
    if (a === 'step') {
      var n = +v;
      if (n >= 3 && namePending() > 0) { set({ step: 2, warn: true }); return; }
      if (n >= 3) D.NAMES.forEach(function (x, i) { var pick = choiceOf(i); if (pick !== null) Companies.imported(pick === 'new' ? x.raw : companyIds[pick]); });
      set({ step: n, warn: false }); window.scrollTo(0, 0);
    } else if (a === 'name') { var nm = clone(S.names); nm[k] = v === 'new' ? 'new' : +v; set({ names: nm, warn: false }); }
    else if (a === 'issue') { var is = clone(S.issues); if (v) is[k] = v; else delete is[k]; set({ issues: is }); }
    else if (a === 'ch') setChannel(v);
    else if (a === 'region') setRegion(v);
    else if (a === 'export') exportTable();
    else if (a === 'template') downloadTemplate();
    else if (a === 'sync') {
      var sy = clone(S.synced); sy[S.ch] = D.WEEK; set({ synced: sy, submitted: false });
      showToast('已把 ' + D.chByKey(S.ch).label + ' 的分仓比价写成第 ' + D.WEEK + ' 周价格参考分。<a href="#/score">查看月度合作评级 →</a>');
    } else if (a === 'billDone') { set({ billDone: true }); showToast('账单已写入「差错次数」，三维对比和周评分的配合列会标明来源。'); }
    else if (a === 'trackDone') { set({ trackDone: true }); showToast('轨迹已写入运单「实际时效」。'); }
    else if (a === 'trial') {
      set({ trial: { status: '试单中', signed: S.trial.signed }, submitted: false });
      showToast('物流商 F 已从「未合作」进入「试单中」，仍是次级预评级。各渠道签收满 3 票后单独转正式。');
    } else if (a === 'sign') {
      var sg = clone(S.trial.signed); sg[v] = (sg[v] || 0) + 1;
      set({ trial: { status: S.trial.status, signed: sg }, submitted: false });
    } else if (a === 'preset') set({ preset: v, submitted: false });
    else if (a === 'reset') set({ scores: {}, submitted: false });
    else if (a === 'submit') set({ submitted: true });
    else if (a === 'resetAll') { S = clone(DEFAULT); save(); toast = null; location.hash = '#/import'; render(); }
  });
  document.addEventListener('change', function (e) {
    var el = e.target, a = el.getAttribute('data-a');
    if (a === 'kind') set({ kind: el.value });
    else if (a === 'remember') set({ remember: el.checked });
    else if (a === 'map') { var m = clone(S.maps); m[el.getAttribute('data-k')] = el.value; set({ maps: m }); }
    else if (a === 'score') setScore(el.getAttribute('data-k'), el.getAttribute('data-f'), parseFloat(el.value));
    else if (a === 'note') { S.note = el.value; save(); }
  });
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.getAttribute('data-a') === 'score') { var b = el.parentNode.querySelector('b'); if (b) b.textContent = el.value; }
  });
  window.addEventListener('hashchange', function () { render(); window.scrollTo(0, 0); });
  render();
})();

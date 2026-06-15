/**
 * 从 Gist 汇总任务 / 物流 / 生产 / 考核，推送钉钉群机器人
 *
 * 本地测试（只打印，不发送）:
 *   node deploy/dingtalk-daily-digest.mjs --dry-run
 *
 * 定时任务默认：昨日（上海时区）任务/物流/生产/考核任一有云端保存才发送；--force 忽略
 *
 * 本地发送（需 webhook）:
 *   set DINGTALK_WEBHOOK=https://oapi.dingtalk.com/robot/send?access_token=...
 *   set DINGTALK_SECRET=SEC...   # 若机器人启用了加签
 *   node deploy/dingtalk-daily-digest.mjs
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_URL = "https://xiaopong190-oss.github.io/ops-center/app.html";
const dryRun = process.argv.includes("--dry-run");
const forceSend = process.argv.includes("--force");

function loadGistConfig() {
  const secretPath = path.join(root, "src", "cloud-sync-config.secret.js");
  const cfgPath = path.join(root, "src", "cloud-sync-config.js");
  let token = process.env.GITHUB_GIST_TOKEN || process.env.OPS_GIST_TOKEN || "";
  if (!token && fs.existsSync(secretPath)) {
    const src = fs.readFileSync(secretPath, "utf8");
    token = (src.match(/GITHUB_GIST_TOKEN\s*=\s*"([^"]+)"/) || [])[1] || "";
  }
  let gistId = process.env.GITHUB_GIST_ID || process.env.OPS_GIST_ID || "";
  if (!gistId && fs.existsSync(cfgPath)) {
    const src = fs.readFileSync(cfgPath, "utf8");
    gistId = (src.match(/GITHUB_GIST_ID\s*=\s*"([^"]+)"/) || [])[1] || "";
  }
  if (!token || !gistId) throw new Error("缺少 Gist Token / ID（环境变量或 cloud-sync-config.secret.js）");
  return { token, gistId };
}

function loadDingTalkConfig() {
  const localPath = path.join(root, "deploy", "dingtalk.local.json");
  let webhook = process.env.DINGTALK_WEBHOOK || "";
  let secret = process.env.DINGTALK_SECRET || "";
  if (fs.existsSync(localPath)) {
    try {
      const j = JSON.parse(fs.readFileSync(localPath, "utf8"));
      webhook = webhook || j.webhook || "";
      secret = secret || j.secret || "";
    } catch { /* ignore */ }
  }
  return { webhook, secret };
}

function shParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  return {
    y: +parts.year,
    m: +parts.month,
    d: +parts.day,
    iso: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
  };
}

function shYesterdayIso() {
  const t = Date.now() - 86400000;
  return shParts(new Date(t)).iso;
}

function fmtTime(ts) {
  if (!ts) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function wasUpdatedOnDay(meta, isoDay) {
  if (!meta?.updatedAt) return false;
  const d = shParts(new Date(meta.updatedAt)).iso;
  return d === isoDay;
}

function hadUpdatesYesterday(bundles, isoDay) {
  return bundles.some(b => wasUpdatedOnDay(b.meta, isoDay));
}

async function fetchGistFile(token, gistId, fileName) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`Gist 读取失败 HTTP ${res.status}`);
  const gist = await res.json();
  const content = gist?.files?.[fileName]?.content;
  if (!content) return { data: [], meta: null };
  const record = JSON.parse(content);
  return {
    data: Array.isArray(record?.data) ? record.data : (record?.data?.staff ? record.data : []),
    meta: record?.updatedBy ? { updatedBy: record.updatedBy, updatedAt: record.updatedAt } : null,
    raw: record,
  };
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function taskStatus(t) {
  if (t.actual) return "done";
  if (t.nodes?.some(n => n.status === "blocked")) return "blocked";
  const due = t.due ? Math.round((new Date(t.due).setHours(0, 0, 0, 0) - new Date(shParts().iso).getTime()) / 86400000) : null;
  if (due !== null && due < 0) return "over";
  return "inprog";
}

function tallyOpsReviews(reviews) {
  const r = reviews || {};
  let good = 0, bad = 0;
  Object.values(r).forEach(v => { if (v === "good") good++; if (v === "bad") bad++; });
  return { good, bad };
}

function desSelfScore(v) {
  const n = parseInt(v, 10);
  return n === 1 || n === 2 ? n : 0;
}

function calcDesSummary(w) {
  const prem = num(w.prem), std = num(w.std), aplus = num(w.aplus);
  const imgPts = prem * 5 + std;
  const imgTotal = imgPts + aplus * 0.5;
  const vid = num(w.vid);
  const vidPts = vid * 2;
  const manualPts = desSelfScore(w.manualScore);
  const packagingPts = desSelfScore(w.packagingScore);
  const outputPts = Math.round((imgTotal + vidPts + manualPts + packagingPts) * 10) / 10;
  const { good: goodReviews, bad: badReviews } = tallyOpsReviews(w.opsReviews);
  return {
    imgPts, aplusPts: aplus * 0.5, vid, vidPts, manualPts, packagingPts, outputPts,
    goodReviews, badReviews, desReviewPts: goodReviews - badReviews,
    quotaOk: outputPts >= 5, rework: num(w.rework),
  };
}

function calcOpsWeeklyScore(w) {
  const orderCount = num(w.lsku);
  const target = num(w.torder) || num(w.tnsku) || 1;
  const rate = parseFloat(w.prate);
  const hasRate = Number.isFinite(rate);
  const orderScore = Math.min(1, orderCount / target) * 50;
  const profitScore = hasRate && rate > 0 ? 20 : 0;
  const profit15Score = hasRate && rate >= 15 ? 30 : 0;
  const total = Math.round((orderScore + profitScore + profit15Score) * 10) / 10;
  return {
    orderScore: Math.round(orderScore * 10) / 10,
    profitScore,
    profit15Score,
    total,
    rate: hasRate ? rate : null,
  };
}

function kpiDevProgress(actual, target) {
  const a = num(actual), t = num(target);
  if (t <= 0) return `${a}款`;
  const pct = Math.min(100, Math.round(a / t * 100));
  return `${a}/${t}款 ${pct}%`;
}

function calcDevSummary(w) {
  return {
    devNew: kpiDevProgress(num(w.devNew), w.tNew),
    sampleIn: kpiDevProgress(num(w.sampleIn), w.tSample),
    order: kpiDevProgress(num(w.order), w.tOrder),
    pass: num(w.pass),
    abn: num(w.abn),
  };
}

function weekHasOpsData(w) {
  return ["wstyle", "nsku", "lsku", "sales", "prate", "acos", "adsp", "sout"].some(k => w[k] !== "" && w[k] != null);
}

function weekHasDesData(w) {
  if (["prem", "std", "vid", "aplus", "incompleteReason", "manualScore", "packagingScore"].some(k => w[k] !== "" && w[k] != null)) return true;
  return Object.keys(w.opsReviews || {}).length > 0;
}

function weekHasDevData(w) {
  return ["devNew", "sampleIn", "order", "pass", "abn"].some(k => w[k] !== "" && w[k] != null);
}

function opsWeekDetail(s) {
  if (!s.total) return "";
  return [
    s.orderScore ? `下单${s.orderScore}` : null,
    s.profitScore ? `赢${s.profitScore}` : null,
    s.profit15Score ? `利${s.profit15Score}` : null,
  ].filter(Boolean).join("+");
}

function desWeekDetail(s) {
  if (!s.outputPts) return "";
  const parts = [];
  if (s.imgPts) parts.push(`图${s.imgPts}`);
  if (s.aplusPts) parts.push(`A+${s.aplusPts.toFixed(1)}`);
  if (s.vidPts) parts.push(`视${s.vidPts}`);
  if (s.manualPts) parts.push(`说${s.manualPts}`);
  if (s.packagingPts) parts.push(`包${s.packagingPts}`);
  return parts.join("+");
}

function avgScore(vals) {
  const filled = vals.filter(v => v > 0);
  return filled.length ? Math.round(filled.reduce((a, b) => a + b, 0) / filled.length * 10) / 10 : 0;
}

function collectLogisticsExceptions(gList) {
  const items = [];
  for (const g of gList) {
    const batch = clip(g.name || g.sku, 22);
    for (const e of (g.exceptions || []).filter(x => !x.resolved)) {
      items.push({ batch, fba: "", e });
    }
    for (const fba of g.fbaShipments || []) {
      for (const e of (fba.exceptions || []).filter(x => !x.resolved)) {
        items.push({
          batch,
          fba: clip(fba.warehouse || fba.name, 16),
          e,
        });
      }
    }
  }
  return items;
}

function fmtLogisticsExc({ batch, fba, e }) {
  const where = fba ? `**${batch}·${fba}**` : `**${batch}**`;
  const bits = [clip(e.desc, 40)];
  if (e.date) bits.push(e.date);
  if (e.action) bits.push(`处理：${clip(e.action, 24)}`);
  return `- ${where} ${bits.join(" · ")}`;
}

function collectProductionExceptions(pList) {
  return pList.flatMap(b =>
    (b.exceptions || []).filter(e => !e.resolved).map(e => ({ b, e }))
  );
}

function fmtProductionExc({ b, e }) {
  const label = [b.product, b.batch].filter(Boolean).join("-") || clip(b.name, 18);
  const bits = [clip(e.desc, 36)];
  if (e.date) bits.push(e.date);
  if (e.impact) bits.push(`影响：${clip(e.impact, 16)}`);
  if (e.action) bits.push(`处理：${clip(e.action, 20)}`);
  if (e.responsible) bits.push(`@${e.responsible}`);
  return `- **${label}** ${bits.join(" · ")}`;
}

function buildKpiLines(kList, today) {
  const lines = [];
  const roleLabel = { ops: "运营", des: "美工", dev: "开发" };
  const monthRecs = kList.filter(r => r.year === today.y && r.month === today.m);
  if (!monthRecs.length) {
    lines.push("- 本月暂无考核记录");
    return lines;
  }

  const byRole = { ops: [], des: [], dev: [] };
  for (const r of monthRecs) {
    if (byRole[r.role]) byRole[r.role].push(r);
  }

  if (byRole.ops.length) {
    lines.push("**运营考核**");
    for (const r of byRole.ops) {
      const weeks = r.weeks || {};
      const breakdown = [1, 2, 3, 4].map(w => {
        const d = weeks[w] || {};
        if (!weekHasOpsData(d)) return null;
        const s = calcOpsWeeklyScore(d);
        const detail = opsWeekDetail(s);
        return `W${w}:${s.total}分${detail ? `(${detail})` : ""}`;
      }).filter(Boolean);
      if (!breakdown.length) continue;
      const scores = [1, 2, 3, 4].map(w => calcOpsWeeklyScore(weeks[w] || {}).total);
      const avg = avgScore(scores);
      lines.push(`- **${r.person}** 周均 **${avg}** 分 · ${breakdown.join(" · ")}`);
    }
  }

  if (byRole.des.length) {
    lines.push("");
    lines.push("**美工考核**");
    for (const r of byRole.des) {
      const weeks = r.weeks || {};
      const breakdown = [1, 2, 3, 4].map(w => {
        const d = weeks[w] || {};
        if (!weekHasDesData(d)) return null;
        const s = calcDesSummary(d);
        const detail = desWeekDetail(s);
        return `W${w}:${s.outputPts}分${detail ? `(${detail})` : ""}`;
      }).filter(Boolean);
      if (!breakdown.length) continue;
      const scores = [1, 2, 3, 4].map(w => calcDesSummary(weeks[w] || {}).outputPts);
      const avg = avgScore(scores);
      const quota = [1, 2, 3, 4].filter(w => calcDesSummary(weeks[w] || {}).quotaOk).length;
      lines.push(`- **${r.person}** 周均 **${avg}** 分 · 达标 **${quota}/4** 周 · ${breakdown.join(" · ")}`);
    }
  }

  if (byRole.dev.length) {
    lines.push("");
    lines.push("**开发考核**");
    for (const r of byRole.dev) {
      const weeks = r.weeks || {};
      const breakdown = [1, 2, 3, 4].map(w => {
        const d = weeks[w] || {};
        if (!weekHasDevData(d)) return null;
        const s = calcDevSummary(d);
        return `W${w}: 新品${s.devNew} · 打样${s.sampleIn} · 下单${s.order}${s.pass ? ` · 通过${s.pass}款` : ""}${s.abn ? ` · 异常${s.abn}款` : ""}`;
      }).filter(Boolean);
      if (!breakdown.length) continue;
      lines.push(`- **${r.person}** ${breakdown.join(" · ")}`);
    }
  }

  if (lines.length === 1 && lines[0].startsWith("- 本月")) return lines;
  if (!lines.some(l => l.startsWith("- **"))) {
    lines.length = 0;
    lines.push("- 本月暂无已填考核数据");
  }
  return lines;
}

function prodStatus(b) {
  const openExc = (b.exceptions || []).filter(e => !e.resolved);
  if (b.stage === "已完成") return "done";
  if (openExc.length) return "blocked";
  if (b.etaDelivery) {
    const due = Math.round((new Date(b.etaDelivery).setHours(0, 0, 0, 0) - new Date(shParts().iso).getTime()) / 86400000);
    if (due < 0 && !b.actualDelivery) return "overdue";
  }
  return "inprog";
}

function logisticsMissingTrack(g) {
  return (g.fbaShipments || []).some(s => !s.tracking?.trim());
}

function clip(s, n = 36) {
  const t = String(s || "").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function buildDigest({ tasks, production, logistics, kpi, yesterday }) {
  const today = shParts();
  const lines = [];
  lines.push(`## 泓森运营日报 ${today.m}/${today.d}`);
  lines.push("");
  lines.push(`> [打开运营中心](${APP_URL})`);
  lines.push("");

  // ── 任务 ──
  lines.push("### 📋 任务跟进");
  const tList = tasks.data || [];
  const tMeta = tasks.meta;
  const doneY = tList.filter(t => t.actual === yesterday);
  const over = tList.filter(t => taskStatus(t) === "over");
  const blocked = tList.filter(t => taskStatus(t) === "blocked");
  lines.push(`- 共 **${tList.length}** 条 · 逾期 **${over.length}** · 受阻 **${blocked.length}**`);
  if (tMeta?.updatedAt) {
    lines.push(`- 云端最后更新：**${tMeta.updatedBy || "未知"}** ${fmtTime(tMeta.updatedAt)}${wasUpdatedOnDay(tMeta, yesterday) ? "（含昨日更新）" : ""}`);
  }
  if (doneY.length) {
    lines.push(`- 昨日完成 **${doneY.length}** 条：${doneY.slice(0, 3).map(t => clip(t.task, 24)).join("；")}`);
  }
  if (over.length) {
    lines.push(`- ⚠️ 逾期：${over.slice(0, 4).map(t => `${clip(t.task, 20)}（${t.owner || "—"}）`).join("；")}`);
  }
  if (blocked.length) {
    lines.push(`- 🚧 受阻：${blocked.slice(0, 3).map(t => `${clip(t.task, 20)}${t.block ? `：${clip(t.block, 20)}` : ""}`).join("；")}`);
  }
  lines.push("");

  // ── 物流 ──
  lines.push("### 🚢 物流头程");
  const lList = logistics.data || [];
  const lMeta = logistics.meta;
  const inTransit = lList.filter(g => g.headStatus === "在途" || g.headStatus === "已到港");
  const missing = lList.filter(logisticsMissingTrack);
  const logExcs = collectLogisticsExceptions(lList);
  lines.push(`- 批次 **${lList.length}** · 在途/到港 **${inTransit.length}** · 缺追踪码 **${missing.length}** · 未解决异常 **${logExcs.length}**`);
  if (lMeta?.updatedAt) {
    lines.push(`- 云端最后更新：**${lMeta.updatedBy || "未知"}** ${fmtTime(lMeta.updatedAt)}${wasUpdatedOnDay(lMeta, yesterday) ? "（含昨日更新）" : ""}`);
  }
  if (missing.length) {
    lines.push(`- ⚠️ 缺追踪：${missing.slice(0, 3).map(g => clip(g.name, 22)).join("；")}`);
  }
  if (logExcs.length) {
    lines.push("");
    lines.push("#### 物流异常明细");
    logExcs.slice(0, 10).forEach(x => lines.push(fmtLogisticsExc(x)));
    if (logExcs.length > 10) lines.push(`- …另有 **${logExcs.length - 10}** 条未列出`);
  } else {
    lines.push("- ✅ 当前无未解决物流异常");
  }
  lines.push("");

  // ── 生产 ──
  lines.push("### 🏭 精品生产");
  const pList = production.data || [];
  const pMeta = production.meta;
  const pOver = pList.filter(b => prodStatus(b) === "overdue");
  const pBlock = pList.filter(b => prodStatus(b) === "blocked");
  const pDoneY = pList.filter(b => b.actualDelivery === yesterday || b.actualShip === yesterday);
  lines.push(`- 批次 **${pList.length}** · 逾期 **${pOver.length}** · 异常 **${pBlock.length}**`);
  if (pMeta?.updatedAt) {
    lines.push(`- 云端最后更新：**${pMeta.updatedBy || "未知"}** ${fmtTime(pMeta.updatedAt)}${wasUpdatedOnDay(pMeta, yesterday) ? "（含昨日更新）" : ""}`);
  }
  if (pDoneY.length) {
    lines.push(`- 昨日交期/出货：**${pDoneY.slice(0, 3).map(b => `${b.product || ""}${b.batch || ""}`.trim() || clip(b.name, 16)).join("；")}`);
  }
  if (pOver.length) {
    lines.push(`- ⚠️ 逾期：${pOver.slice(0, 3).map(b => `${b.product}-${b.batch}（${b.owner || "—"}）`).join("；")}`);
  }
  const prodExcs = collectProductionExceptions(pList);
  if (prodExcs.length) {
    lines.push("");
    lines.push("#### 精品异常明细");
    prodExcs.slice(0, 10).forEach(x => lines.push(fmtProductionExc(x)));
    if (prodExcs.length > 10) lines.push(`- …另有 **${prodExcs.length - 10}** 条未列出`);
  } else {
    lines.push("- ✅ 当前无未解决生产异常");
  }
  lines.push("");

  // ── 考核 ──
  lines.push("### 📊 考核结果");
  const kList = kpi.data || [];
  const kMeta = kpi.meta;
  lines.push(...buildKpiLines(kList, today));
  if (kMeta?.updatedAt) {
    lines.push("");
    lines.push(`- 云端最后更新：**${kMeta.updatedBy || "未知"}** ${fmtTime(kMeta.updatedAt)}${wasUpdatedOnDay(kMeta, yesterday) ? "（含昨日更新）" : ""}`);
  }

  return lines.join("\n");
}

function signWebhook(webhook, secret) {
  if (!secret) return webhook;
  const timestamp = Date.now();
  const str = `${timestamp}\n${secret}`;
  const sign = encodeURIComponent(crypto.createHmac("sha256", secret).update(str).digest("base64"));
  const sep = webhook.includes("?") ? "&" : "?";
  return `${webhook}${sep}timestamp=${timestamp}&sign=${sign}`;
}

async function sendDingTalk(webhook, secret, title, text) {
  const url = signWebhook(webhook, secret);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: { title, text },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errcode !== 0) {
    throw new Error(`钉钉发送失败: HTTP ${res.status} errcode=${body.errcode} ${body.errmsg || ""}`);
  }
  return body;
}

async function main() {
  const yesterday = shYesterdayIso();
  const { token, gistId } = loadGistConfig();
  const [tasks, production, logistics, kpi] = await Promise.all([
    fetchGistFile(token, gistId, "tasks.json"),
    fetchGistFile(token, gistId, "production.json"),
    fetchGistFile(token, gistId, "logistics.json"),
    fetchGistFile(token, gistId, "kpi-monthly.json"),
  ]);

  const bundles = [tasks, production, logistics, kpi];
  const text = buildDigest({ tasks, production, logistics, kpi, yesterday });
  const title = `泓森运营日报 ${shParts().m}/${shParts().d}`;
  const shouldSend = forceSend || hadUpdatesYesterday(bundles, yesterday);

  if (dryRun) {
    console.log("── dry-run（未发送钉钉）──");
    console.log(shouldSend
      ? `✓ 昨日（${yesterday}）有云端更新，定时任务将会发送`
      : `○ 昨日（${yesterday}）无云端更新，定时任务将跳过（加 --force 可强制发送）`);
    console.log(text);
    console.log("\n✓ Gist 读取成功，正文已生成");
    return;
  }

  if (!shouldSend) {
    console.log(`○ 跳过发送：昨日（${yesterday}）任务/物流/生产/考核均无云端保存记录`);
    return;
  }

  const { webhook, secret } = loadDingTalkConfig();
  if (!webhook) {
    console.error("缺少 DINGTALK_WEBHOOK（环境变量或 deploy/dingtalk.local.json）");
    console.log("\n预览正文：\n");
    console.log(text);
    process.exit(1);
  }

  await sendDingTalk(webhook, secret, title, text);
  console.log("✓ 已发送到钉钉群");
}

main().catch(e => {
  console.error(e.message || e);
  process.exit(1);
});

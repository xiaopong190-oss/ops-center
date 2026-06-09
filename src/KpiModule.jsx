import { useState, useEffect, useMemo, useCallback } from "react";
import { getEmployees, RoleBadge } from "./GlobalConfig.jsx";
import { useSharedList } from "./utils/storage.js";
import { useCloudSyncPage } from "./GlobalCloudSync.jsx";
import {
  OpsPremiumPanel, OpsPremiumMonthSummary, emptyPremiumWeek, weekHasPremiumData,
} from "./OpsPremiumKpi.jsx";

const WEEKS = [1, 2, 3, 4];
const KPI_STORAGE_KEY = "kpi-monthly";

const emptyOpsWeek = () => ({
  wstyle: "", nsku: "", lsku: "", aadd: "", aout: "", atot: "", sales: "", prate: "",
  acos: "", adsp: "", ador: "", nacos: "", perfOk: null, sout: "", sdays: "",
  perfRemark: "", profitRemark: "",
  tnsku: "", tsal: "", taco: "", tadsp: "", torder: "",
  desReview: { person: "", rating: "" },
});

const emptyDesWeek = () => ({
  prem: "", std: "", vid: "", aplus: "", dad: "", ontime: "", demand: "", rework: "",
  incompleteReason: "", opsReviews: {},
});

const DES_INCOMPLETE_HINTS = ["单品多变体", "产品复杂", "素材需求变更", "等待运营确认", "拍摄/打样延误"];

function tallyOpsReviews(reviews) {
  const r = reviews || {};
  let good = 0, bad = 0;
  Object.values(r).forEach(v => { if (v === "good") good++; if (v === "bad") bad++; });
  return { good, bad };
}

function removeOpsDesReview(items, year, month, opsPerson, week, desPerson) {
  const next = [...items];
  const idx = next.findIndex(r =>
    r.year === year && r.month === month && r.role === "des" && r.person === desPerson
  );
  if (idx < 0) return next;
  const wk = { ...emptyDesWeek(), ...(next[idx].weeks?.[week] || {}) };
  if (!wk.opsReviews?.[opsPerson]) return next;
  const opsReviews = { ...wk.opsReviews };
  delete opsReviews[opsPerson];
  next[idx] = { ...next[idx], weeks: { ...next[idx].weeks, [week]: { ...wk, opsReviews } } };
  return next;
}

function applyOpsDesReviewToItems(items, year, month, opsPerson, week, desReview, prevDesReview) {
  if (!opsPerson) return items;
  let next = [...items];
  const prevPerson = prevDesReview?.person;
  const newPerson = desReview?.person;
  if (prevPerson && prevPerson !== newPerson) {
    next = removeOpsDesReview(next, year, month, opsPerson, week, prevPerson);
  }
  if (!newPerson) return next;
  let idx = next.findIndex(r =>
    r.year === year && r.month === month && r.role === "des" && r.person === newPerson
  );
  if (idx < 0) {
    next.push({ year, month, role: "des", person: newPerson, weeks: {} });
    idx = next.length - 1;
  }
  const wk = { ...emptyDesWeek(), ...(next[idx].weeks?.[week] || {}) };
  const opsReviews = { ...(wk.opsReviews || {}) };
  if (desReview.rating === "good" || desReview.rating === "bad") opsReviews[opsPerson] = desReview.rating;
  else delete opsReviews[opsPerson];
  next[idx] = { ...next[idx], weeks: { ...next[idx].weeks, [week]: { ...wk, opsReviews } } };
  return next;
}

const emptyDevWeek = () => ({
  tNew: "", tSample: "", tOrder: "",
  devNew: "", sampleIn: "", pass: "", order: "", abn: "",
  abnRemark: "",
});

const emptyDevMonthTargets = () => ({ tDev: "", tSample: "", tOrder: "" });

const KPI_ROLE_META = {
  ops: { label: "运营", color: "#2d7dd2", sumBorder: "#b8d4f0" },
  des: { label: "美工", color: "#6b21a8", sumBorder: "#e9d5ff" },
  dev: { label: "开发", color: "#00695c", sumBorder: "#99f6e4" },
};

function emptyWeekForRole(role) {
  if (role === "ops") return emptyOpsWeek();
  if (role === "ops_jp") return emptyPremiumWeek();
  if (role === "dev") return emptyDevWeek();
  return emptyDesWeek();
}

function getPremiumSkuList(items, year, month, person) {
  return findRecord(items, year, month, "ops_jp", person)?.skuList || [];
}

function opsEffectiveRole(curRole, curOpsSub) {
  if (curRole !== "ops") return curRole;
  return curOpsSub === "premium" ? "ops_jp" : "ops";
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const kpiInp = {
  width: "100%", fontSize: 13, padding: "6px 9px", border: "1px solid var(--border)",
  borderRadius: 6, fontFamily: "inherit", background: "var(--card)", color: "inherit",
};
const kpiInpSm = { ...kpiInp, fontSize: 12, padding: "4px 8px" };
const kpiLbl = { fontSize: 10, color: "var(--tm)", marginBottom: 4, display: "block" };
const kpiCard = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 9, padding: 12,
};
const kpiModTitle = {
  fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
  color: "var(--tm)", marginBottom: 8, display: "flex", alignItems: "center", gap: 8,
};
const kpiBadge = (bg, color) => ({
  display: "inline-flex", fontSize: 10, padding: "2px 6px", borderRadius: 4,
  background: bg, color, fontWeight: 500, marginTop: 6,
});

function findRecord(items, year, month, role, person) {
  return items.find(r =>
    r.year === year && r.month === month && r.role === role && r.person === person
  );
}

function getWeekData(items, year, month, role, person, week) {
  const rec = findRecord(items, year, month, role, person);
  const w = rec?.weeks?.[week];
  const base = emptyWeekForRole(role);
  if (!w) return base;
  const merged = { ...base, ...w };
  if (base.desReview) merged.desReview = { ...base.desReview, ...(w.desReview || {}) };
  return merged;
}

function hydrateOpsDesReview(items, year, month, opsPerson, week, desReview) {
  const cur = { ...emptyOpsWeek().desReview, ...desReview };
  if (cur.person && cur.rating) return cur;
  for (const rec of items) {
    if (rec.role !== "des" || rec.year !== year || rec.month !== month) continue;
    const rating = rec.weeks?.[week]?.opsReviews?.[opsPerson];
    if (rating) return { person: rec.person, rating };
  }
  return cur;
}

function getDevMonthTargets(items, year, month, person) {
  const rec = findRecord(items, year, month, "dev", person);
  return { ...emptyDevMonthTargets(), ...(rec?.monthTargets || {}) };
}

function calcOpsSummary(w) {
  const add = num(w.aadd), out = num(w.aout), net = add - out;
  const sales = num(w.sales), rate = parseFloat(w.prate);
  const wstyle = num(w.wstyle), nsku = num(w.nsku), acos = parseFloat(w.acos), sout = num(w.sout);
  return {
    net,
    sales,
    rate: Number.isFinite(rate) ? rate : null,
    wstyle,
    nsku,
    acos: Number.isFinite(acos) ? acos : null,
    sout,
    sdays: parseFloat(w.sdays),
  };
}

function calcDesSummary(w) {
  const prem = num(w.prem), std = num(w.std), aplus = num(w.aplus);
  const imgPts = prem * 5 + std;
  const imgTotal = imgPts + aplus * 0.5;
  const vid = num(w.vid);
  const vidPts = vid * 2;
  const outputPts = Math.round((imgTotal + vidPts) * 10) / 10;
  const ot = num(w.ontime), dm = num(w.demand);
  const { good: goodReviews, bad: badReviews } = tallyOpsReviews(w.opsReviews);
  const desReviewPts = goodReviews - badReviews;
  return {
    imgPts,
    aplusPts: aplus * 0.5,
    total: imgTotal,
    vid,
    vidPts,
    outputPts,
    goodReviews,
    badReviews,
    desReviewPts,
    quotaOk: outputPts >= 5,
    aplus,
    rework: num(w.rework),
    rate: dm > 0 ? Math.round(ot / dm * 100) : null,
  };
}

/** 运营周考核：下单款数 50% + 赢利 20% + 赢利且利润率≥15% 30% */
function calcOpsWeeklyScore(w) {
  const orderCount = num(w.lsku);
  const target = num(w.torder) || num(w.tnsku) || 1;
  const rate = parseFloat(w.prate);
  const hasRate = Number.isFinite(rate);
  const orderPct = Math.min(1, orderCount / target);
  const orderScore = orderPct * 50;
  const profitScore = hasRate && rate > 0 ? 20 : 0;
  const profit15Score = hasRate && rate >= 15 ? 30 : 0;
  const total = Math.round((orderScore + profitScore + profit15Score) * 10) / 10;
  return {
    orderCount,
    target,
    orderScore: Math.round(orderScore * 10) / 10,
    profitScore,
    profit15Score,
    total,
    rate: hasRate ? rate : null,
  };
}

function weekHasOpsData(w) {
  if (["wstyle", "nsku", "lsku", "sales", "prate", "acos", "adsp", "sout"].some(k => w[k] !== "" && w[k] != null)) return true;
  if (w.desReview?.person && w.desReview?.rating) return true;
  return false;
}

function weekHasDesData(w) {
  if (["prem", "std", "vid", "aplus", "incompleteReason"].some(k => w[k] !== "" && w[k] != null)) return true;
  return Object.keys(w.opsReviews || {}).length > 0;
}

function weekHasDevData(w) {
  return ["devNew", "sampleIn", "order", "pass", "abn"].some(k => w[k] !== "" && w[k] != null);
}

function kpiDevProgress(actual, target) {
  const a = num(actual), t = num(target);
  if (t <= 0) return { pct: 0, color: "var(--tm)", text: "待填写目标", cls: "" };
  const pct = Math.min(100, Math.round(a / t * 100));
  const color = pct >= 100 ? "#2d9e52" : pct >= 60 ? "#e09000" : "#e55";
  const cls = pct >= 100 ? "g" : pct >= 60 ? "a" : "r";
  return {
    pct,
    color,
    cls,
    text: `${a}/${t}款  ${pct}%${pct >= 100 ? " ✓" : ""}`,
    rateText: `${pct}%`,
  };
}

function calcDevSummary(w) {
  const devNew = num(w.devNew), sampleIn = num(w.sampleIn), pass = num(w.pass);
  const order = num(w.order), abn = num(w.abn);
  const pNew = kpiDevProgress(devNew, w.tNew);
  const pSample = kpiDevProgress(sampleIn, w.tSample);
  const pOrder = kpiDevProgress(order, w.tOrder);
  return { devNew, sampleIn, pass, order, abn, pNew, pSample, pOrder };
}

function SummaryBar({ items, role }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(90px,1fr))", gap: 10,
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
      padding: "12px 14px", marginBottom: 14,
    }}>
      {items.map(it => (
        <div key={it.label} style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: it.color || "var(--text)" }}>{it.value}</div>
          <div style={{ fontSize: 10, color: "var(--tm)", marginTop: 2 }}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}

function DesHeartBtn({ active, kind, onClick }) {
  const isGood = kind === "good";
  return (
    <button type="button" onClick={onClick} title={isGood ? "好评" : "差评"} style={{
      width: 34, height: 34, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 18,
      border: `1px solid ${active ? (isGood ? "#fca5a5" : "var(--border)") : "var(--border)"}`,
      background: active ? (isGood ? "#fef2f2" : "var(--bg)") : "var(--card)",
      color: isGood ? (active ? "#e11d48" : "#fda4af") : (active ? "#9ca3af" : "#d1d5db"),
      opacity: active ? 1 : 0.85,
      lineHeight: 1,
    }}>
      {isGood ? "♥" : "💔"}
    </button>
  );
}

function OpsDesReviewSection({ data, onChange, desStaff = [] }) {
  const review = data.desReview || { person: "", rating: "" };
  const setReview = (patch) => onChange({ ...data, desReview: { ...review, ...patch } });
  const setRating = (rating) => {
    if (!review.person) return;
    setReview({ rating: review.rating === rating ? "" : rating });
  };

  return (
    <Section title="美工评价（匿名）">
      <div style={kpiCard}>
        <div style={{ fontSize: 11, color: "var(--tm)", marginBottom: 10 }}>
          每位运营每周可评价 <strong>1 位</strong> 美工：♥ 美工 +1 分 · 💔 美工 −1 分。美工端仅显示汇总，不显示评价人姓名。
        </div>
        {desStaff.length === 0 ? (
          <div style={{ fontSize: 12, color: "#e09000" }}>暂无美工人员 · 请在 ⚙ 设置中添加（角色选「美工」）</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <label style={{ fontSize: 11, color: "var(--tm)" }}>本周评价美工</label>
            <select style={{ ...kpiInpSm, minWidth: 140, background: "var(--card)" }} value={review.person}
              onChange={e => setReview({ person: e.target.value, rating: "" })}>
              <option value="">请选择</option>
              {desStaff.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
            </select>
            <DesHeartBtn kind="good" active={review.rating === "good"} onClick={() => setRating("good")} />
            <DesHeartBtn kind="bad" active={review.rating === "bad"} onClick={() => setRating("bad")} />
            <span style={{ fontSize: 11, color: "var(--tm)" }}>
              {review.rating === "good" ? "已评：美工 +1" : review.rating === "bad" ? "已评：美工 −1" : review.person ? "请选择好评或差评" : "请先选择美工"}
            </span>
          </div>
        )}
      </div>
    </Section>
  );
}

function OpsWeekForm({ week, data, onChange, desStaff = [] }) {
  const set = (k, v) => onChange({ ...data, [k]: v });
  const s = calcOpsSummary(data);
  const score = calcOpsWeeklyScore(data);
  const net = s.net;

  return (
    <div>
      <OpsScorePanel score={score} />
      <SummaryBar items={[
        { label: "周销售额($)", value: s.sales > 0 ? `$${Math.round(s.sales).toLocaleString()}` : "—", color: "#2d9e52" },
        { label: "利润率", value: s.rate != null ? `${s.rate.toFixed(1)}%` : "—", color: s.rate != null && s.rate < 15 ? "#e55" : s.rate != null ? "#2d9e52" : undefined },
        { label: "周开款", value: s.wstyle || "—" },
        { label: "周上架新品", value: s.nsku || "—" },
        { label: "A品净变化", value: net !== 0 ? `${net >= 0 ? "+" : ""}${net}` : "—", color: net > 0 ? "#2d9e52" : net < 0 ? "#e55" : undefined },
        { label: "整体ACOS", value: s.acos != null ? `${s.acos}%` : "—" },
        { label: "A品断货天", value: String(s.sout), color: s.sout === 0 ? "#2d9e52" : "#e55" },
      ]} />

      <Section title="上新">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 7 }}>
          <FieldCard label="开款（运营）" hint="周开款数量（运营）">
            <NumInput value={data.wstyle} onChange={v => set("wstyle", v)} unit="款" />
          </FieldCard>
          <FieldCard label="上架新品 / LISTED SKU" hint="周上架新品数量">
            <NumInput value={data.nsku} onChange={v => set("nsku", v)} unit="SKU" />
            <TargetRow label="计划目标" value={data.tnsku} onChange={v => set("tnsku", v)} unit="SKU" />
          </FieldCard>
          <FieldCard label="落地 / LAUNCH" hint="本周下单款数（下大货）">
            <NumInput value={data.lsku} onChange={v => set("lsku", v)} unit="款" />
            <TargetRow label="下单目标" value={data.torder} onChange={v => set("torder", v)} unit="款" />
            <span style={kpiBadge("#eef6ff", "#2d7dd2")}>考核权重 50%</span>
          </FieldCard>
        </div>
      </Section>

      <Section title="A 品管理">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 7 }}>
          <FieldCard label="A品 / ADD" hint="本周新增 A 品数">
            <NumInput value={data.aadd} onChange={v => set("aadd", v)} unit="个" />
            <span style={kpiBadge("#d4f0dc", "#2d9e52")}>新增 +1 分</span>
          </FieldCard>
          <FieldCard label="A品 / OUT" hint="本周退出 A 品数">
            <NumInput value={data.aout} onChange={v => set("aout", v)} unit="个" />
            <span style={kpiBadge("#fee2e2", "#e55")}>退出 −1 分</span>
          </FieldCard>
          <FieldCard label="A品 / NET（自动）" hint="A 品净变化">
            <input style={{ ...kpiInp, opacity: 0.7 }} readOnly value={net} />
          </FieldCard>
          <FieldCard label="A品 / TOTAL" hint="A 品总数（周末快照）">
            <NumInput value={data.atot} onChange={v => set("atot", v)} unit="个" />
          </FieldCard>
        </div>
      </Section>

      <Section title="销售额与利润">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 7 }}>
          <FieldCard label="销售 / SALES" hint="周销售额">
            <NumInput value={data.sales} onChange={v => set("sales", v)} unit="USD" />
            <TargetRow label="目标" value={data.tsal} onChange={v => set("tsal", v)} unit="USD" />
          </FieldCard>
          <FieldCard label="利润 / PROFIT" hint="利润率（考核：赢利 20% + ≥15% 另 30%）">
            <NumInput value={data.prate} onChange={v => set("prate", v)} unit="%" step="0.1" />
            {s.rate != null && s.rate < 15 && (
              <textarea style={{ ...kpiInp, marginTop: 6, minHeight: 40, fontSize: 11 }} value={data.profitRemark}
                onChange={e => set("profitRemark", e.target.value)} placeholder="低于 15% 请说明原因…" />
            )}
          </FieldCard>
        </div>
      </Section>

      <Section title="广告">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 7 }}>
          <FieldCard label="广告 / ACOS" hint="整体 ACOS">
            <NumInput value={data.acos} onChange={v => set("acos", v)} unit="%" step="0.1" />
            <TargetRow label="目标 ≤" value={data.taco} onChange={v => set("taco", v)} unit="%" />
          </FieldCard>
          <FieldCard label="广告 / SPEND" hint="广告总花费">
            <NumInput value={data.adsp} onChange={v => set("adsp", v)} unit="USD" />
            <TargetRow label="周预算" value={data.tadsp} onChange={v => set("tadsp", v)} unit="USD" />
          </FieldCard>
          <FieldCard label="广告 / ORDERS" hint="广告带来订单数">
            <NumInput value={data.ador} onChange={v => set("ador", v)} unit="单" />
          </FieldCard>
          <FieldCard label="新品广告 / NEW ACOS" hint="新品广告 ACOS">
            <NumInput value={data.nacos} onChange={v => set("nacos", v)} unit="%" step="0.1" />
          </FieldCard>
        </div>
      </Section>

      <OpsDesReviewSection data={data} onChange={onChange} desStaff={desStaff} />

      <Section title="账号健康（FBA）">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 7 }}>
          <FieldCard label="绩效 / PERFORMANCE" hint="绩效指标本周是否达标" danger>
            <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
              <PerfBtn ok selected={data.perfOk === true} onClick={() => set("perfOk", true)}>✓ 达标</PerfBtn>
              <PerfBtn ok={false} selected={data.perfOk === false} onClick={() => set("perfOk", false)}>✗ 触红线</PerfBtn>
            </div>
            {data.perfOk === false && (
              <textarea style={{ ...kpiInp, marginTop: 6, minHeight: 40, fontSize: 11 }} value={data.perfRemark}
                onChange={e => set("perfRemark", e.target.value)} placeholder="触红线请填写说明…" />
            )}
          </FieldCard>
          <FieldCard label="断货 / STOCKOUT" hint="A 品断货天数" danger>
            <NumInput value={data.sout} onChange={v => set("sout", v)} unit="天" />
          </FieldCard>
          <FieldCard label="预警 / STOCK DAYS" hint="A 品最低可售天数">
            <NumInput value={data.sdays} onChange={v => set("sdays", v)} unit="天" />
            {Number.isFinite(s.sdays) && s.sdays > 0 && (
              <span style={kpiBadge(s.sdays < 30 ? "#fee2e2" : s.sdays < 45 ? "#fff0d4" : "#d4f0dc",
                s.sdays < 30 ? "#e55" : s.sdays < 45 ? "#e09000" : "#2d9e52")}>
                {s.sdays < 30 ? `⚠ 仅${s.sdays}天` : s.sdays < 45 ? `注意${s.sdays}天` : `✓ 充裕${s.sdays}天`}
              </span>
            )}
          </FieldCard>
        </div>
      </Section>
    </div>
  );
}

function DesWeekForm({ week, data, onChange }) {
  const set = (k, v) => onChange({ ...data, [k]: v });
  const s = calcDesSummary(data);
  const needsReason = !s.quotaOk;
  const desReviewFmt = s.desReviewPts > 0 ? `+${s.desReviewPts}` : s.desReviewPts < 0 ? String(s.desReviewPts) : "0";

  const appendHint = (hint) => {
    const cur = data.incompleteReason || "";
    set("incompleteReason", cur ? `${cur}；${hint}` : hint);
  };

  return (
    <div>
      <SummaryBar items={[
        { label: "考核产出分", value: s.outputPts > 0 ? s.outputPts.toFixed(1) : "—", color: s.quotaOk ? "#2d9e52" : s.outputPts > 0 ? "#e09000" : undefined },
        { label: "图片当量", value: s.total > 0 ? s.total.toFixed(1) : "—" },
        { label: "视频分", value: s.vidPts > 0 ? String(s.vidPts) : "—", color: s.vidPts > 0 ? "#6b21a8" : undefined },
        { label: "美工评价分", value: s.desReviewPts !== 0 ? desReviewFmt : "—", color: s.desReviewPts > 0 ? "#6b21a8" : s.desReviewPts < 0 ? "#9ca3af" : undefined },
        { label: "图片当量分", value: s.imgPts || "—" },
        { label: "A+当量分", value: s.aplusPts > 0 ? s.aplusPts.toFixed(1) : "—", color: s.aplusPts > 0 ? "#6b21a8" : undefined },
        { label: "视频(条)", value: s.vid || "—" },
        { label: "A+完成数", value: s.aplus || "—" },
        { label: "按时交付率", value: s.rate != null ? `${s.rate}%` : "—", color: s.rate != null && s.rate >= 90 ? "#2d9e52" : s.rate != null && s.rate >= 70 ? "#e09000" : s.rate != null ? "#e55" : undefined },
        { label: "返工次数", value: String(s.rework), color: s.rework > 0 ? "#e55" : undefined },
        { label: "好评♥", value: s.goodReviews || "—", color: s.goodReviews > 0 ? "#e11d48" : undefined },
        { label: "差评💔", value: s.badReviews || "—", color: s.badReviews > 0 ? "#9ca3af" : undefined },
      ]} />

      <Section title="图片产出（精品 1张 = 精铺 5张）">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 7 }}>
          <FieldCard label="精品图 / PREMIUM" hint="精品图完成数" accent="#6b21a8">
            <NumInput value={data.prem} onChange={v => set("prem", v)} unit="张" />
            <QuotaBox outputPts={s.outputPts} imgPts={s.imgPts} aplusPts={s.aplusPts} vidPts={s.vidPts} prem={num(data.prem) * 5} std={num(data.std)} />
          </FieldCard>
          <FieldCard label="精铺图 / STANDARD" hint="精铺图完成数">
            <NumInput value={data.std} onChange={v => set("std", v)} unit="张" />
          </FieldCard>
        </div>
      </Section>

      <Section title="视频">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 7 }}>
          <FieldCard label="视频 / VIDEO" hint="视频完成数（每条计 2 分）">
            <NumInput value={data.vid} onChange={v => set("vid", v)} unit="条" />
            <span style={kpiBadge("#f3e8ff", "#6b21a8")}>1 条 = 2 分</span>
          </FieldCard>
        </div>
      </Section>

      <Section title="其他交付">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 7 }}>
          <FieldCard label="A+ / EBC" hint="A+ 完成数">
            <NumInput value={data.aplus} onChange={v => set("aplus", v)} unit="套" />
            <span style={kpiBadge("#f3e8ff", "#6b21a8")}>1 套 = 0.5 当量分</span>
          </FieldCard>
          <FieldCard label="广告素材 / AD ASSETS" hint="广告素材完成数">
            <NumInput value={data.dad} onChange={v => set("dad", v)} unit="件" />
          </FieldCard>
          <FieldCard label="交付 / ON-TIME" hint="按时交付率">
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input style={{ ...kpiInpSm, width: 66 }} type="number" placeholder="准时" value={data.ontime} onChange={e => set("ontime", e.target.value)} />
              <span style={{ fontSize: 11, color: "var(--tm)" }}>/</span>
              <input style={{ ...kpiInpSm, width: 66 }} type="number" placeholder="总需求" value={data.demand} onChange={e => set("demand", e.target.value)} />
              <span style={{ fontSize: 11, color: "var(--tm)" }}>= {s.rate != null ? `${s.rate}%` : "—"}</span>
            </div>
          </FieldCard>
          <FieldCard label="返工 / REWORK" hint="返工次数（大改重做）">
            <NumInput value={data.rework} onChange={v => set("rework", v)} unit="次" />
          </FieldCard>
        </div>
      </Section>

      <Section title="考核未完成说明">
          <div style={{
            ...kpiCard,
            borderColor: needsReason && !data.incompleteReason ? "#e9d5ff" : "var(--border)",
            background: needsReason && !data.incompleteReason ? "#faf5ff" : "var(--card)",
          }}>
            <div style={{ fontSize: 11, color: needsReason ? "#6b21a8" : "var(--tm)", marginBottom: 8, fontWeight: needsReason ? 600 : 400 }}>
              {needsReason
                ? "本周考核产出未达 5 分（图片当量 + 视频分），请说明原因"
                : "如本周未达标，请在此说明原因（如单品多变体、产品复杂等）"}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {DES_INCOMPLETE_HINTS.map(h => (
                <button key={h} type="button" onClick={() => appendHint(h)} style={{
                  fontSize: 11, padding: "3px 10px", borderRadius: 99, cursor: "pointer", fontFamily: "inherit",
                  border: "1px solid #e9d5ff", background: "#f3e8ff", color: "#6b21a8",
                }}>+ {h}</button>
              ))}
            </div>
            <textarea style={{ ...kpiInp, minHeight: 72, fontSize: 12, resize: "vertical" }}
              value={data.incompleteReason || ""} onChange={e => set("incompleteReason", e.target.value)}
              placeholder="如：本周 2 款均为单品 8 变体，主图+A+ 工作量超预期…" />
          </div>
      </Section>

      <Section title="运营对美工评价（匿名）">
        <div style={{
          ...kpiCard,
          marginBottom: 10,
          background: "linear-gradient(135deg,#faf5ff,#fff)",
          borderColor: "#e9d5ff",
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b21a8", marginBottom: 4 }}>美工本周评价加减分</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: s.desReviewPts > 0 ? "#6b21a8" : s.desReviewPts < 0 ? "#9ca3af" : "var(--text)" }}>
            {s.desReviewPts !== 0 ? desReviewFmt : "0"}
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--tm)", marginLeft: 6 }}>分（运营评·计入美工）</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--tm)", marginTop: 4 }}>
            已收到 <strong>{s.goodReviews + s.badReviews}</strong> 条运营评价（匿名）· ♥ {s.goodReviews} · 💔 {s.badReviews}
          </div>
        </div>
        <div style={{ ...kpiCard, fontSize: 11, color: "var(--tm)" }}>
          评价由各位运营在 <strong>运营 → 精铺</strong> 考核页提交，此处不显示评价人姓名。
        </div>
      </Section>
    </div>
  );
}

function OpsScorePanel({ score }) {
  const color = score.total >= 80 ? "#2d9e52" : score.total >= 60 ? "#e09000" : score.total > 0 ? "#e55" : "var(--text)";
  const items = [
    { label: "下单款数", pct: "50%", value: `${score.orderScore}分`, sub: `${score.orderCount}/${score.target}款` },
    { label: "赢利", pct: "20%", value: `${score.profitScore}分`, sub: score.profitScore ? "已赢利" : "未达" },
    { label: "利润率≥15%", pct: "30%", value: `${score.profit15Score}分`, sub: score.rate != null ? `${score.rate.toFixed(1)}%` : "—" },
  ];
  return (
    <div style={{
      background: "linear-gradient(135deg,#eef6ff,#f8fbff)", border: "1px solid #b8d4f0",
      borderRadius: 10, padding: "12px 14px", marginBottom: 14,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#2d7dd2" }}>本周考核得分</div>
        <div style={{ fontSize: 22, fontWeight: 700, color }}>{score.total}<span style={{ fontSize: 12, fontWeight: 500, color: "var(--tm)" }}> / 100</span></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        {items.map(it => (
          <div key={it.label} style={{ background: "var(--card)", borderRadius: 8, padding: "8px 10px", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, color: "var(--tm)" }}>{it.label} <span style={{ color: "#2d7dd2" }}>{it.pct}</span></div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{it.value}</div>
            <div style={{ fontSize: 10, color: "var(--tm)", marginTop: 2 }}>{it.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuotaBox({ outputPts, imgPts, aplusPts, vidPts, prem, std }) {
  const pct = Math.min(100, Math.round(outputPts / 5 * 100));
  const barColor = outputPts >= 5 ? "#2d9e52" : outputPts > 0 ? "#e09000" : "var(--border)";
  return (
    <div style={{ marginTop: 8, background: "var(--bg)", borderRadius: 6, padding: "9px 11px" }}>
      <div style={{ fontSize: 10, color: "var(--tm)", marginBottom: 4 }}>周考核 5 分制 · 每天约 1 分合格（精品×5 + 精铺×1 + A+×0.5 + 视频×2）</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: outputPts >= 5 ? "#2d9e52" : "var(--text)" }}>
        {Number(outputPts.toFixed(1))} <span style={{ fontSize: 11, fontWeight: 400, color: "var(--tm)" }}>/ 5</span>
      </div>
      {(imgPts > 0 || aplusPts > 0 || vidPts > 0) && (
        <div style={{ fontSize: 10, color: "var(--tm)", marginTop: 4 }}>
          图片 {imgPts} 分{aplusPts > 0 ? ` + A+ ${aplusPts.toFixed(1)} 分` : ""}{vidPts > 0 ? ` + 视频 ${vidPts} 分` : ""}
        </div>
      )}
      <div style={{ background: "var(--border)", borderRadius: 99, height: 4, marginTop: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 99, transition: "width 0.2s" }} />
      </div>
      <div style={{ fontSize: 10, color: outputPts >= 5 ? "#2d9e52" : outputPts > 0 ? "#e09000" : "var(--tm)", marginTop: 4 }}>
        {outputPts >= 5 ? `✓ 达标（超出${(outputPts - 5).toFixed(1)}分）` : outputPts > 0 ? `进行中，还差${(5 - outputPts).toFixed(1)}分` : "尚未开始"}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={kpiModTitle}>{title}<span style={{ flex: 1, height: 1, background: "var(--border)" }} /></div>
      {children}
    </div>
  );
}

function FieldCard({ label, hint, children, danger, accent, teal }) {
  const border = danger ? "#fecaca" : teal ? "#99f6e4" : accent ? "#e9d5ff" : "var(--border)";
  const bg = danger ? "#fef2f2" : teal ? "#f0fdfa" : accent ? "#faf5ff" : "var(--card)";
  return (
    <div style={{ ...kpiCard, borderColor: border, background: bg }}>
      <div style={{ fontSize: 10, color: "var(--tm)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, lineHeight: 1.4 }}>{hint}</div>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, unit, step }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input type="number" style={kpiInp} value={value} step={step || "1"} min="0"
        onChange={e => onChange(e.target.value)} placeholder="0" />
      {unit && <span style={{ fontSize: 11, color: "var(--tm)", whiteSpace: "nowrap" }}>{unit}</span>}
    </div>
  );
}

function TargetRow({ label, value, onChange, unit }) {
  return (
    <div style={{ fontSize: 10, color: "var(--tm)", marginTop: 5, display: "flex", alignItems: "center", gap: 4 }}>
      {label}：
      <input type="number" style={{ ...kpiInpSm, width: 55, borderStyle: "dashed" }} value={value}
        onChange={e => onChange(e.target.value)} placeholder="—" />
      {unit}
    </div>
  );
}

function PerfBtn({ ok, selected, onClick, children }) {
  const color = ok ? "#2d9e52" : "#e55";
  return (
    <button type="button" onClick={onClick} style={{
      fontSize: 11, padding: "3px 9px", borderRadius: 99, cursor: "pointer", fontFamily: "inherit",
      border: `1px solid ${color}`, color,
      background: selected ? (ok ? "#d4f0dc" : "#fee2e2") : "transparent",
    }}>{children}</button>
  );
}

function OpsMonthlySummary({ items, year, month, person }) {
  const rows = useMemo(() => {
    const vals = (fn) => WEEKS.map(w => fn(getWeekData(items, year, month, "ops", person, w)));
    const scores = vals(w => calcOpsWeeklyScore(w).total);
    return [
      { label: "周考核得分", vals: scores, type: "avg", fmt: n => `${n.toFixed(1)}分`, cls: n => n >= 80 ? "g" : n >= 60 ? "a" : n > 0 ? "r" : "" },
      { label: "周销售额($)", vals: vals(w => num(w.sales)), type: "sum", fmt: n => `$${Math.round(n).toLocaleString()}`, cls: n => n > 0 ? "g" : "" },
      { label: "利润率(%)", vals: vals(w => num(w.prate)), type: "avg", fmt: n => `${n.toFixed(1)}%`, cls: n => n >= 15 ? "g" : n > 0 ? "r" : "" },
      { label: "下单款数", vals: vals(w => num(w.lsku)), type: "sum", fmt: n => String(n), cls: () => "" },
      { label: "周开款（运营）", vals: vals(w => num(w.wstyle)), type: "sum", fmt: n => String(n), cls: () => "" },
      { label: "周上架新品(SKU)", vals: vals(w => num(w.nsku)), type: "sum", fmt: n => String(n), cls: () => "" },
      { label: "A品净变化", vals: vals(w => num(w.aadd) - num(w.aout)), type: "sum", fmt: n => `${n >= 0 ? "+" : ""}${n}`, cls: n => n > 0 ? "g" : n < 0 ? "r" : "" },
      { label: "整体ACOS(%)", vals: vals(w => num(w.acos)), type: "avg", fmt: n => `${n.toFixed(1)}%`, cls: () => "" },
      { label: "广告花费($)", vals: vals(w => num(w.adsp)), type: "sum", fmt: n => `$${Math.round(n).toLocaleString()}`, cls: () => "" },
      { label: "A品断货(天)", vals: vals(w => num(w.sout)), type: "sum", fmt: n => String(n), cls: n => n === 0 ? "g" : n > 0 ? "r" : "" },
    ];
  }, [items, year, month, person]);

  const summaries = rows.map(row => {
    const total = row.vals.reduce((a, b) => a + b, 0);
    const nonZero = row.vals.filter(v => v > 0);
    const avg = nonZero.length ? total / nonZero.length : 0;
    const agg = row.type === "sum" ? total : avg;
    return { ...row, agg };
  });

  const avgScore = summaries[0]?.agg || 0;
  return (
    <MonthlyBlock title="运营 — 月度汇总" color="#2d7dd2"
      cards={[
        { label: "月均考核得分", value: `${avgScore.toFixed(1)}分`, cls: avgScore >= 80 ? "g" : avgScore >= 60 ? "a" : avgScore > 0 ? "r" : "" },
        ...summaries.slice(1, 9).map((r, i) => ({
          label: ["月销售额($)", "月均利润率", "月下单合计", "月开款合计", "月上架新品合计", "A品净变化", "月均ACOS", "月广告花费($)"][i],
          value: r.fmt(r.agg),
          cls: r.cls(r.agg),
        })),
      ]}
      rows={summaries}
    />
  );
}

function DesMonthlySummary({ items, year, month, person }) {
  const data = useMemo(() => {
    const weeks = WEEKS.map(w => getWeekData(items, year, month, "des", person, w));
    const summaries = weeks.map(d => calcDesSummary(d));
    const pts = summaries.map(s => s.total);
    const outputPts = summaries.map(s => s.outputPts);
    const vidPts = summaries.map(s => s.vidPts);
    const desReviewPts = summaries.map(s => s.desReviewPts);
    const quotaDone = outputPts.filter(p => p >= 5).length;
    const vid = weeks.map(d => num(d.vid));
    const ap = weeks.map(d => num(d.aplus));
    const rw = weeks.map(d => num(d.rework));
    const rates = weeks.map(d => {
      const dm = num(d.demand), ot = num(d.ontime);
      return dm > 0 ? Math.round(ot / dm * 100) : null;
    }).filter(r => r != null);
    const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;
    let totalGood = 0, totalBad = 0, reasonWeeks = 0;
    weeks.forEach(d => {
      const t = tallyOpsReviews(d.opsReviews);
      totalGood += t.good;
      totalBad += t.bad;
      if (d.incompleteReason) reasonWeeks++;
    });
    return { pts, outputPts, vidPts, desReviewPts, quotaDone, vid, ap, rw, avgRate, totalGood, totalBad, reasonWeeks, weeks };
  }, [items, year, month, person]);

  const rows = [
    { label: "考核产出分", vals: data.outputPts, type: "avg", fmt: n => n.toFixed(1), cls: n => n >= 5 ? "g" : n > 0 ? "a" : "" },
    { label: "图片当量(含A+)", vals: data.pts.map(v => Math.round(v * 10) / 10), type: "sum", fmt: n => n.toFixed(1), cls: n => n >= 5 ? "g" : n > 0 ? "a" : "" },
    { label: "视频分(×2)", vals: data.vidPts, type: "sum", fmt: n => String(n), cls: n => n > 0 ? "g" : "" },
    { label: "美工评价分(运营评)", vals: data.desReviewPts, type: "sum", fmt: n => n > 0 ? `+${n}` : String(n), cls: n => n > 0 ? "g" : n < 0 ? "r" : "" },
    { label: "视频(条)", vals: data.vid, type: "sum", fmt: n => String(n), cls: () => "" },
    { label: "A+(套)", vals: data.ap, type: "sum", fmt: n => String(n), cls: () => "" },
    { label: "按时交付率", vals: WEEKS.map(w => {
      const d = getWeekData(items, year, month, "des", person, w);
      const dm = num(d.demand), ot = num(d.ontime);
      return dm > 0 ? Math.round(ot / dm * 100) : 0;
    }), type: "avg", fmt: n => `${n}%`, cls: n => n >= 90 ? "g" : n >= 70 ? "a" : n > 0 ? "r" : "" },
    { label: "返工次数", vals: data.rw, type: "sum", fmt: n => String(n), cls: n => n > 0 ? "r" : "" },
    { label: "运营好评(♥)", vals: data.weeks.map(d => tallyOpsReviews(d.opsReviews).good), type: "sum", fmt: n => String(n), cls: n => n > 0 ? "g" : "" },
    { label: "运营差评(💔)", vals: data.weeks.map(d => tallyOpsReviews(d.opsReviews).bad), type: "sum", fmt: n => String(n), cls: n => n > 0 ? "r" : "" },
  ].map(row => {
    const total = row.vals.reduce((a, b) => a + b, 0);
    const nonZero = row.vals.filter(v => v > 0);
    const avg = nonZero.length ? total / nonZero.length : 0;
    const agg = row.type === "sum" ? total : Math.round(avg);
    return { ...row, agg };
  });

  return (
    <MonthlyBlock title="美工 — 月度汇总" color="#6b21a8"
      cards={[
        { label: "月当量总分", value: data.pts.reduce((a, b) => a + b, 0).toFixed(1) },
        { label: "月美工评价净分", value: (() => { const t = data.desReviewPts.reduce((a, b) => a + b, 0); return t > 0 ? `+${t}` : String(t); })(), cls: data.desReviewPts.reduce((a, b) => a + b, 0) > 0 ? "g" : data.desReviewPts.reduce((a, b) => a + b, 0) < 0 ? "r" : "" },
        { label: "配额达标周数", value: `${data.quotaDone}/4周`, cls: data.quotaDone === 4 ? "g" : data.quotaDone >= 2 ? "a" : "r" },
        { label: "月视频合计", value: String(data.vid.reduce((a, b) => a + b, 0)) },
        { label: "月A+合计", value: String(data.ap.reduce((a, b) => a + b, 0)) },
        { label: "月均按时交付率", value: data.avgRate > 0 ? `${data.avgRate}%` : "—", cls: data.avgRate >= 90 ? "g" : data.avgRate >= 70 ? "a" : data.avgRate > 0 ? "r" : "" },
        { label: "月返工合计", value: String(data.rw.reduce((a, b) => a + b, 0)), cls: data.rw.reduce((a, b) => a + b, 0) > 0 ? "r" : "" },
        { label: "月运营好评", value: String(data.totalGood), cls: data.totalGood > 0 ? "g" : "" },
        { label: "月运营差评", value: String(data.totalBad), cls: data.totalBad > 0 ? "r" : "" },
        { label: "未完成说明", value: data.reasonWeeks > 0 ? `${data.reasonWeeks}周` : "—", cls: data.reasonWeeks > 0 ? "a" : "" },
      ]}
      rows={rows}
    />
  );
}

function DevProgressBox({ title, accent, progress }) {
  const barColor = progress.pct > 0 ? progress.color : "var(--border)";
  return (
    <div style={{ marginTop: 8, background: accent ? "#ecfdf5" : "var(--bg)", borderRadius: 6, padding: "9px 11px" }}>
      <div style={{ fontSize: 10, color: accent ? "#00695c" : "var(--tm)", marginBottom: 4 }}>{title}</div>
      <div style={{ background: "var(--border)", borderRadius: 99, height: 4, overflow: "hidden" }}>
        <div style={{ width: `${progress.pct}%`, height: "100%", background: barColor, borderRadius: 99, transition: "width 0.2s" }} />
      </div>
      <div style={{ fontSize: 10, color: progress.color, marginTop: 4 }}>{progress.text}</div>
    </div>
  );
}

function DevWeekForm({ data, onChange }) {
  const set = (k, v) => onChange({ ...data, [k]: v });
  const s = calcDevSummary(data);

  return (
    <div>
      <SummaryBar items={[
        { label: "大货下单（考核）", value: s.order || "—", color: "#00695c" },
        { label: "下单达成率", value: s.pOrder.rateText !== "0%" ? s.pOrder.rateText : "—", color: s.pOrder.cls === "g" ? "#2d9e52" : s.pOrder.cls === "a" ? "#e09000" : undefined },
        { label: "新开发款", value: s.devNew || "—" },
        { label: "开发达成率", value: s.pNew.rateText !== "0%" ? s.pNew.rateText : "—", color: s.pNew.cls === "g" ? "#2d9e52" : s.pNew.cls === "a" ? "#e09000" : undefined },
        { label: "收到样板", value: s.sampleIn || "—" },
        { label: "收样达成率", value: s.pSample.rateText !== "0%" ? s.pSample.rateText : "—", color: s.pSample.cls === "g" ? "#2d9e52" : s.pSample.cls === "a" ? "#e09000" : undefined },
        { label: "异常款数", value: String(s.abn), color: s.abn > 0 ? "#e55" : undefined },
      ]} />

      <Section title="阶段目标设定">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 7 }}>
          <FieldCard label="阶段1 目标 / DEVELOP TARGET" hint="本周开发目标" teal>
            <NumInput value={data.tNew} onChange={v => set("tNew", v)} unit="款" />
          </FieldCard>
          <FieldCard label="阶段2 目标 / SAMPLE TARGET" hint="本周收样目标" teal>
            <NumInput value={data.tSample} onChange={v => set("tSample", v)} unit="款" />
          </FieldCard>
          <FieldCard label="阶段3 目标 / ORDER TARGET（考核）" hint="本周大货下单目标" teal>
            <NumInput value={data.tOrder} onChange={v => set("tOrder", v)} unit="款" />
            <span style={kpiBadge("#ecfdf5", "#00695c")}>主要考核项</span>
          </FieldCard>
        </div>
      </Section>

      <Section title="本周实际完成">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 7 }}>
          <FieldCard label="阶段1 / NEW DEV" hint="本周新开发款数">
            <NumInput value={data.devNew} onChange={v => set("devNew", v)} unit="款" />
            <DevProgressBox title="开发达成率（本周）" progress={s.pNew} />
          </FieldCard>
          <FieldCard label="阶段2 / SAMPLE IN" hint="本周收到样板款数">
            <NumInput value={data.sampleIn} onChange={v => set("sampleIn", v)} unit="款" />
            <DevProgressBox title="收样达成率（本周）" progress={s.pSample} />
          </FieldCard>
          <FieldCard label="阶段2+ / PASS" hint="本周样板通过款数">
            <NumInput value={data.pass} onChange={v => set("pass", v)} unit="款" />
          </FieldCard>
          <FieldCard label="阶段3 / ORDER（考核）" hint="本周大货下单款数" teal>
            <NumInput value={data.order} onChange={v => set("order", v)} unit="款" />
            <DevProgressBox title="下单达成率（本周）" accent progress={s.pOrder} />
          </FieldCard>
          <FieldCard label="异常 / ABNORMAL" hint="本周异常款数" danger>
            <NumInput value={data.abn} onChange={v => set("abn", v)} unit="款" />
            <span style={kpiBadge("#fee2e2", "#e55")}>含延期/质量/取消</span>
            <textarea style={{ ...kpiInp, marginTop: 6, minHeight: 40, fontSize: 11 }} value={data.abnRemark}
              onChange={e => set("abnRemark", e.target.value)} placeholder="异常说明…" />
          </FieldCard>
        </div>
      </Section>
    </div>
  );
}

function DevMonthProgressCard({ label, hint, actual, target, onTargetChange }) {
  const p = kpiDevProgress(actual, target);
  return (
    <div style={{ ...kpiCard, borderColor: "#99f6e4", background: "#f0fdfa" }}>
      <div style={{ fontSize: 10, color: "var(--tm)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>{hint}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: "#00695c" }}>{actual}</span>
        <span style={{ fontSize: 12, color: "var(--tm)" }}>
          / <input type="number" style={{ ...kpiInpSm, width: 50, borderStyle: "dashed" }} value={target}
            onChange={e => onTargetChange(e.target.value)} placeholder="月目标" min="0" /> 款
        </span>
      </div>
      <div style={{ background: "var(--border)", borderRadius: 99, height: 4, overflow: "hidden" }}>
        <div style={{ width: `${p.pct}%`, height: "100%", background: p.pct > 0 ? p.color : "var(--border)", borderRadius: 99 }} />
      </div>
      <div style={{ fontSize: 10, color: p.color, marginTop: 4 }}>
        {num(target) > 0 ? `${actual}/${num(target)}款（月累计 ${p.pct}%）${p.pct >= 100 ? " ✓" : ""}` : "请填写月目标"}
      </div>
    </div>
  );
}

function DevMonthlySummary({ items, year, month, person, monthTargets, onMonthTargetsChange, onSaveMonthTargets, saving }) {
  const totals = useMemo(() => {
    const orderArr = WEEKS.map(w => num(getWeekData(items, year, month, "dev", person, w).order));
    const devArr = WEEKS.map(w => num(getWeekData(items, year, month, "dev", person, w).devNew));
    const sampleArr = WEEKS.map(w => num(getWeekData(items, year, month, "dev", person, w).sampleIn));
    const passArr = WEEKS.map(w => num(getWeekData(items, year, month, "dev", person, w).pass));
    const abnArr = WEEKS.map(w => num(getWeekData(items, year, month, "dev", person, w).abn));
    return {
      orderArr, devArr, sampleArr, passArr, abnArr,
      totalOrder: orderArr.reduce((a, b) => a + b, 0),
      totalDev: devArr.reduce((a, b) => a + b, 0),
      totalSample: sampleArr.reduce((a, b) => a + b, 0),
      totalPass: passArr.reduce((a, b) => a + b, 0),
      totalAbn: abnArr.reduce((a, b) => a + b, 0),
    };
  }, [items, year, month, person]);

  const rows = [
    { label: "大货下单（考核）", vals: totals.orderArr, type: "sum", fmt: n => String(n), cls: n => n > 0 ? "t" : "" },
    { label: "新开发款", vals: totals.devArr, type: "sum", fmt: n => String(n), cls: () => "" },
    { label: "收到样板", vals: totals.sampleArr, type: "sum", fmt: n => String(n), cls: () => "" },
    { label: "样板通过", vals: totals.passArr, type: "sum", fmt: n => String(n), cls: n => n > 0 ? "g" : "" },
    { label: "异常款数", vals: totals.abnArr, type: "sum", fmt: n => String(n), cls: n => n > 0 ? "r" : "" },
  ].map(row => ({ ...row, agg: row.vals.reduce((a, b) => a + b, 0) }));

  const tagColor = { g: "#2d9e52", r: "#e55", a: "#e09000", t: "#00695c" };

  return (
    <div>
      <MonthlyBlock title="开发 — 月度汇总" color="#00695c"
        cards={[
          { label: "月大货下单合计", value: String(totals.totalOrder), cls: totals.totalOrder > 0 ? "t" : "" },
          { label: "月开发款合计", value: String(totals.totalDev) },
          { label: "月收样合计", value: String(totals.totalSample) },
          { label: "样板通过合计", value: String(totals.totalPass), cls: totals.totalPass > 0 ? "g" : "" },
          { label: "平均周期(天)", value: "—" },
          { label: "月异常款合计", value: String(totals.totalAbn), cls: totals.totalAbn > 0 ? "r" : "" },
        ]}
        rows={rows}
        tagColor={tagColor}
      />
      <div style={{ marginTop: 16 }}>
        <div style={{ ...kpiModTitle, color: "#00695c" }}>各阶段月累计进度</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 8, marginTop: 10 }}>
          <DevMonthProgressCard label="阶段1 / 月开发目标" hint="新开发款 月累计"
            actual={totals.totalDev} target={monthTargets.tDev}
            onTargetChange={v => onMonthTargetsChange({ ...monthTargets, tDev: v })} />
          <DevMonthProgressCard label="阶段2 / 月收样目标" hint="收到样板 月累计"
            actual={totals.totalSample} target={monthTargets.tSample}
            onTargetChange={v => onMonthTargetsChange({ ...monthTargets, tSample: v })} />
          <DevMonthProgressCard label="阶段3 / 月下单目标（考核）" hint="大货下单 月累计"
            actual={totals.totalOrder} target={monthTargets.tOrder}
            onTargetChange={v => onMonthTargetsChange({ ...monthTargets, tOrder: v })} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" onClick={onSaveMonthTargets} disabled={saving}
            style={{ background: "#00695c", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 12, cursor: saving ? "wait" : "pointer", fontFamily: "inherit", fontWeight: 600, opacity: saving ? 0.8 : 1 }}>
            {saving ? "上传中…" : "☁️ 保存并上传月目标"}
          </button>
        </div>
      </div>
    </div>
  );
}

const STAT_COLORS = { g: "#2d9e52", a: "#e09000", r: "#e55" };

function opsScoreCls(n) {
  if (!n) return "";
  if (n >= 80) return "g";
  if (n >= 60) return "a";
  return "r";
}

/** 美工 5 分制：≥5 周达标 · ≥3 部分达标 · <3 未达标（每天约 1 分合格） */
function desScoreCls(n) {
  if (!n) return "";
  if (n >= 5) return "g";
  if (n >= 3) return "a";
  return "r";
}

/** 美工周考核得分（5 分制，即产出分；周满分 5，每天约 1 分合格） */
function calcDesWeeklyScore(w) {
  return calcDesSummary(w).outputPts;
}

function avgFilled(vals) {
  const filled = vals.filter(v => v > 0);
  return filled.length ? Math.round(filled.reduce((a, b) => a + b, 0) / filled.length * 10) / 10 : 0;
}

function buildOpsStatsRow(items, year, month, name) {
  const weekBreakdowns = WEEKS.map(w => {
    const d = getWeekData(items, year, month, "ops", name, w);
    const s = calcOpsWeeklyScore(d);
    return { week: w, filled: weekHasOpsData(d), ...s };
  });
  const weekScores = weekBreakdowns.map(s => s.total);
  const weekFilled = weekBreakdowns.map(s => s.filled);
  const filled = weekScores.filter(s => s > 0);
  const avg = filled.length ? Math.round(filled.reduce((a, b) => a + b, 0) / filled.length * 10) / 10 : 0;
  const avgOrder = avgFilled(weekBreakdowns.map(s => s.orderScore));
  const avgProfit = avgFilled(weekBreakdowns.map(s => s.profitScore));
  const avgProfit15 = avgFilled(weekBreakdowns.map(s => s.profit15Score));
  let totalSales = 0, totalNsku = 0, totalLsku = 0;
  WEEKS.forEach(w => {
    const d = getWeekData(items, year, month, "ops", name, w);
    totalSales += num(d.sales);
    totalNsku += num(d.nsku);
    totalLsku += num(d.lsku);
  });
  return {
    name, weekScores, weekBreakdowns, weekFilled, avg, avgOrder, avgProfit, avgProfit15,
    totalSales, totalNsku, totalLsku, filledWeeks: weekFilled.filter(Boolean).length,
  };
}

function buildDesStatsRow(items, year, month, name) {
  const weeks = WEEKS.map(w => getWeekData(items, year, month, "des", name, w));
  const weekBreakdowns = weeks.map((d, i) => {
    const s = calcDesSummary(d);
    return {
      week: WEEKS[i],
      filled: weekHasDesData(d),
      prem: num(d.prem), std: num(d.std), vid: num(d.vid), aplus: num(d.aplus),
      ...s,
    };
  });
  const weekScores = weekBreakdowns.map(s => s.outputPts);
  const weekFilled = weekBreakdowns.map(s => s.filled);
  const filled = weekScores.filter(v => v > 0);
  const avg = filled.length ? Math.round(filled.reduce((a, b) => a + b, 0) / filled.length * 10) / 10 : 0;
  const avgImg = avgFilled(weekBreakdowns.map(s => s.imgPts));
  const avgVid = avgFilled(weekBreakdowns.map(s => s.vidPts));
  const avgAplus = avgFilled(weekBreakdowns.map(s => s.aplusPts));
  const quotaDone = weekBreakdowns.filter(s => s.quotaOk).length;
  const reviewNet = weekBreakdowns.reduce((a, s) => a + s.desReviewPts, 0);
  const rework = weeks.reduce((a, d) => a + num(d.rework), 0);
  return {
    name, weekScores, weekBreakdowns, weekFilled, avg, avgImg, avgVid, avgAplus,
    quotaDone, reviewNet, rework, filledWeeks: weekFilled.filter(Boolean).length,
  };
}

function opsWeekDetail(s) {
  if (!s.total) return "";
  const parts = [
    s.orderScore ? `下单${s.orderScore}` : null,
    s.profitScore ? `赢${s.profitScore}` : null,
    s.profit15Score ? `利${s.profit15Score}` : null,
  ].filter(Boolean);
  return parts.join("+");
}

function desWeekDetail(s) {
  if (!s.outputPts) return "";
  const parts = [];
  if (s.imgPts) parts.push(`图${s.imgPts}`);
  if (s.aplusPts) parts.push(`A+${s.aplusPts.toFixed(1)}`);
  if (s.vidPts) parts.push(`视${s.vidPts}`);
  return parts.join("+") || "";
}

function StatWeekCell({ value, cls, fmt = v => String(v), scale, detail }) {
  const has = value > 0;
  const display = has ? fmt(value) : "—";
  const bg = cls === "g" ? "#eafaf1" : cls === "a" ? "#fff8e6" : cls === "r" ? "#fef2f2" : "transparent";
  return (
    <td style={{
      padding: "7px 4px", textAlign: "center", fontSize: 12, borderBottom: "1px solid var(--border)",
      background: bg, color: has ? (STAT_COLORS[cls] || "var(--text)") : "var(--tm)",
      fontWeight: has ? 600 : 400, minWidth: scale === 100 ? 52 : 48,
    }}>
      <div>{display}</div>
      {scale && has && <div style={{ fontSize: 9, color: "var(--tm)", marginTop: 1, fontWeight: 400 }}>/{scale}</div>}
      {detail && has && <div style={{ fontSize: 8, color: "var(--tm)", marginTop: 2, fontWeight: 400, lineHeight: 1.2 }}>{detail}</div>}
    </td>
  );
}

function KpiStatsFormulaCards() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 10 }}>
      <div style={{ background: "#eef6ff", border: "1px solid #b8d4f0", borderRadius: 8, padding: "10px 12px", fontSize: 11, lineHeight: 1.65 }}>
        <div style={{ fontWeight: 700, color: "#2d7dd2", marginBottom: 6 }}>运营 100 分制 · 怎么算</div>
        <div><strong>① 下单款数 50 分</strong> = min(本周下单款 ÷ 周目标, 1) × 50</div>
        <div style={{ color: "var(--tm)" }}>周目标取自「周目标下单款」或「月目标开款」</div>
        <div style={{ marginTop: 4 }}><strong>② 赢利 20 分</strong> = 本周有正利润率 → 20，否则 0</div>
        <div style={{ marginTop: 4 }}><strong>③ 利润率≥15% 30 分</strong> = 利润率 ≥15% → 30，否则 0</div>
        <div style={{ marginTop: 6, fontWeight: 600, color: "#2d7dd2" }}>周得分 = ① + ② + ③（满分 100）</div>
      </div>
      <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "10px 12px", fontSize: 11, lineHeight: 1.65 }}>
        <div style={{ fontWeight: 700, color: "#6b21a8", marginBottom: 6 }}>美工 5 分制 · 怎么算</div>
        <div><strong>精铺图</strong> 1 张 = 1 分（≈ 每天 1 张即合格）</div>
        <div><strong>精品图</strong> 1 张 = 5 分（≈ 一周合格量）</div>
        <div><strong>A+</strong> 1 套 = 0.5 分 · <strong>视频</strong> 1 条 = 2 分</div>
        <div style={{ marginTop: 6, fontWeight: 600, color: "#6b21a8" }}>周得分 = 图片 + A+ + 视频（满分 5，每天约 1 分合格）</div>
        <div style={{ marginTop: 4, color: "var(--tm)" }}>运营评价（♥+1 / 💔−1）单独统计，不计入周得分</div>
      </div>
    </div>
  );
}

function OpsStatsExpandRow({ row, colSpan, expanded }) {
  if (!expanded) return null;
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: "0 8px 10px", borderBottom: "1px solid var(--border)", background: "#f8fbff" }}>
        <div style={{ fontSize: 10, color: "#2d7dd2", fontWeight: 600, marginBottom: 6 }}>{row.name} · 各周得分明细</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ color: "var(--tm)" }}>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>周</th>
                <th style={{ padding: "4px 6px" }}>下单(50%)</th>
                <th style={{ padding: "4px 6px" }}>赢利(20%)</th>
                <th style={{ padding: "4px 6px" }}>利润≥15%(30%)</th>
                <th style={{ padding: "4px 6px" }}>合计</th>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>计算依据</th>
              </tr>
            </thead>
            <tbody>
              {row.weekBreakdowns.map(s => (
                <tr key={s.week}>
                  <td style={{ padding: "5px 6px", fontWeight: 600 }}>第{s.week}周</td>
                  <td style={{ padding: "5px 6px", textAlign: "center" }}>{s.orderScore || "—"}</td>
                  <td style={{ padding: "5px 6px", textAlign: "center" }}>{s.profitScore || "—"}</td>
                  <td style={{ padding: "5px 6px", textAlign: "center" }}>{s.profit15Score || "—"}</td>
                  <td style={{ padding: "5px 6px", textAlign: "center", fontWeight: 700, color: opsScoreCls(s.total) ? STAT_COLORS[opsScoreCls(s.total)] : "var(--text)" }}>
                    {s.total ? `${s.total}/100` : "—"}
                  </td>
                  <td style={{ padding: "5px 6px", color: "var(--tm)", fontSize: 10 }}>
                    {!s.total ? "未填写" : (
                      <>
                        下单 {s.orderCount}/{s.target}款 → {s.orderScore}分
                        {s.rate != null ? ` · 利润率 ${s.rate.toFixed(1)}%` : " · 利润率未填"}
                        {s.profitScore ? " · 已赢利" : " · 未赢利"}
                        {s.profit15Score ? " · 达15%" : ""}
                      </>
                    )}
                  </td>
                </tr>
              ))}
              <tr style={{ background: "#eef6ff" }}>
                <td style={{ padding: "5px 6px", fontWeight: 600 }}>月均</td>
                <td style={{ padding: "5px 6px", textAlign: "center" }}>{row.avgOrder ? row.avgOrder.toFixed(1) : "—"}</td>
                <td style={{ padding: "5px 6px", textAlign: "center" }}>{row.avgProfit ? row.avgProfit.toFixed(1) : "—"}</td>
                <td style={{ padding: "5px 6px", textAlign: "center" }}>{row.avgProfit15 ? row.avgProfit15.toFixed(1) : "—"}</td>
                <td style={{ padding: "5px 6px", textAlign: "center", fontWeight: 700 }}>{row.avg ? `${row.avg.toFixed(1)}/100` : "—"}</td>
                <td style={{ padding: "5px 6px", fontSize: 10, color: "var(--tm)" }}>
                  {row.avg ? `${row.avgOrder.toFixed(1)}+${row.avgProfit.toFixed(1)}+${row.avgProfit15.toFixed(1)}` : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

function DesStatsExpandRow({ row, colSpan, expanded }) {
  if (!expanded) return null;
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: "0 8px 10px", borderBottom: "1px solid var(--border)", background: "#faf5ff" }}>
        <div style={{ fontSize: 10, color: "#6b21a8", fontWeight: 600, marginBottom: 6 }}>{row.name} · 各周产出明细</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ color: "var(--tm)" }}>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>周</th>
                <th style={{ padding: "4px 6px" }}>精品图</th>
                <th style={{ padding: "4px 6px" }}>精铺图</th>
                <th style={{ padding: "4px 6px" }}>A+</th>
                <th style={{ padding: "4px 6px" }}>视频</th>
                <th style={{ padding: "4px 6px" }}>图片分</th>
                <th style={{ padding: "4px 6px" }}>A+分</th>
                <th style={{ padding: "4px 6px" }}>视频分</th>
                <th style={{ padding: "4px 6px" }}>周得分</th>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>评价/返工</th>
              </tr>
            </thead>
            <tbody>
              {row.weekBreakdowns.map(s => (
                <tr key={s.week}>
                  <td style={{ padding: "5px 6px", fontWeight: 600 }}>第{s.week}周</td>
                  <td style={{ padding: "5px 6px", textAlign: "center" }}>{s.prem || "—"}</td>
                  <td style={{ padding: "5px 6px", textAlign: "center" }}>{s.std || "—"}</td>
                  <td style={{ padding: "5px 6px", textAlign: "center" }}>{s.aplus || "—"}</td>
                  <td style={{ padding: "5px 6px", textAlign: "center" }}>{s.vid || "—"}</td>
                  <td style={{ padding: "5px 6px", textAlign: "center" }}>{s.imgPts || "—"}</td>
                  <td style={{ padding: "5px 6px", textAlign: "center" }}>{s.aplusPts ? s.aplusPts.toFixed(1) : "—"}</td>
                  <td style={{ padding: "5px 6px", textAlign: "center" }}>{s.vidPts || "—"}</td>
                  <td style={{ padding: "5px 6px", textAlign: "center", fontWeight: 700, color: desScoreCls(s.outputPts) ? STAT_COLORS[desScoreCls(s.outputPts)] : "var(--text)" }}>
                    {s.outputPts ? `${s.outputPts.toFixed(1)}/5` : "—"}
                    {s.quotaOk && <span style={{ fontSize: 9, color: "#2d9e52", marginLeft: 2 }}>✓</span>}
                  </td>
                  <td style={{ padding: "5px 6px", fontSize: 10, color: "var(--tm)" }}>
                    {!s.outputPts && !s.goodReviews && !s.badReviews ? "未填写" : (
                      <>
                        {s.prem ? `精品${s.prem}×5` : ""}{s.std ? `${s.prem ? "+" : ""}精铺${s.std}×1` : ""}
                        {s.aplus ? ` + A+${s.aplus}×0.5` : ""}{s.vid ? ` + 视频${s.vid}×2` : ""}
                        {(s.goodReviews || s.badReviews) ? ` · ♥${s.goodReviews} 💔${s.badReviews}` : ""}
                      </>
                    )}
                  </td>
                </tr>
              ))}
              <tr style={{ background: "#f3e8ff" }}>
                <td style={{ padding: "5px 6px", fontWeight: 600 }}>月均</td>
                <td colSpan={4} style={{ padding: "5px 6px", textAlign: "center", color: "var(--tm)", fontSize: 10 }}>—</td>
                <td style={{ padding: "5px 6px", textAlign: "center" }}>{row.avgImg ? row.avgImg.toFixed(1) : "—"}</td>
                <td style={{ padding: "5px 6px", textAlign: "center" }}>{row.avgAplus ? row.avgAplus.toFixed(1) : "—"}</td>
                <td style={{ padding: "5px 6px", textAlign: "center" }}>{row.avgVid ? row.avgVid.toFixed(1) : "—"}</td>
                <td style={{ padding: "5px 6px", textAlign: "center", fontWeight: 700 }}>{row.avg ? `${row.avg.toFixed(1)}/5` : "—"}</td>
                <td style={{ padding: "5px 6px", fontSize: 10, color: "var(--tm)" }}>
                  {row.avg ? `图${row.avgImg.toFixed(1)}+A+${row.avgAplus.toFixed(1)}+视${row.avgVid.toFixed(1)}` : "—"}
                  {row.reviewNet !== 0 ? ` · 月评${row.reviewNet > 0 ? "+" : ""}${row.reviewNet}` : ""}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

function KpiStatsSummaryChips({ chips, color }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      {chips.map(c => (
        <div key={c.label} style={{ background: "var(--bg)", borderRadius: 8, padding: "8px 14px", minWidth: 88, textAlign: "center", border: `1px solid ${color}22` }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: c.cls ? STAT_COLORS[c.cls] : color }}>{c.value}</div>
          <div style={{ fontSize: 10, color: "var(--tm)", marginTop: 2 }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

function KpiStatsTable({ title, subtitle, color, headers, rows, emptyHint }) {
  return (
    <div style={{ background: "var(--card)", border: `1px solid ${color}33`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: "var(--tm)", marginTop: 2 }}>{subtitle}</div>}
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--tm)", padding: "1.5rem 0", textAlign: "center" }}>{emptyHint}</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {headers.map(h => (
                  <th key={h} style={{
                    padding: "6px 8px", color: "var(--tm)", borderBottom: `2px solid ${color}44`,
                    textAlign: h === "姓名" ? "left" : "center", fontWeight: 600, whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KpiStatsPage({ items, year, month, staffTick = 0 }) {
  const [expandedOps, setExpandedOps] = useState({});
  const [expandedDes, setExpandedDes] = useState({});
  const toggleOps = (name) => setExpandedOps(p => ({ ...p, [name]: !p[name] }));
  const toggleDes = (name) => setExpandedDes(p => ({ ...p, [name]: !p[name] }));

  const opsStaff = useMemo(() => getEmployees().filter(e => e.role === "运营" && e.name), [year, month, staffTick]);
  const desStaff = useMemo(() => getEmployees().filter(e => e.role === "美工" && e.name), [year, month, staffTick]);

  const opsRows = useMemo(() => opsStaff.map(s => buildOpsStatsRow(items, year, month, s.name)), [items, year, month, opsStaff]);
  const desRows = useMemo(() => desStaff.map(s => buildDesStatsRow(items, year, month, s.name)), [items, year, month, desStaff]);

  const opsAvg = opsRows.filter(r => r.avg > 0);
  const teamOpsAvg = opsAvg.length ? Math.round(opsAvg.reduce((a, r) => a + r.avg, 0) / opsAvg.length * 10) / 10 : 0;
  const desAvg = desRows.filter(r => r.avg > 0);
  const teamDesAvg = desAvg.length ? Math.round(desAvg.reduce((a, r) => a + r.avg, 0) / desAvg.length * 10) / 10 : 0;

  const OPS_COLS = 10;
  const DES_COLS = 11;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 12, color: "var(--tm)", padding: "10px 12px", background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)", lineHeight: 1.6 }}>
        <div>{year}年{month}月 · 运营与美工团队一览（两套分制，请勿混比）</div>
        <div style={{ marginTop: 4 }}>
          <span style={{ color: "#2d7dd2", fontWeight: 600 }}>运营 100 分制</span>：≥80 优 · ≥60 良 &nbsp;|&nbsp;
          <span style={{ color: "#6b21a8", fontWeight: 600 }}>美工 5 分制</span>：满分 5 · 每天约 1 分合格 · 周≥5 达标
        </div>
        <div style={{ marginTop: 4, fontSize: 11 }}>点击姓名展开各周得分明细 · 单元格下方为分项构成</div>
      </div>

      <KpiStatsFormulaCards />

      <KpiStatsTable
        title="运营 · 精铺考核"
        subtitle="100 分制 · 下单50% + 赢利20% + 利润率≥15%占30%"
        color="#2d7dd2"
        headers={["姓名", "W1", "W2", "W3", "W4", "月均", "月均构成", "月销售额", "月上新", "填写"]}
        emptyHint="暂无运营人员 · 请在设置中添加"
        rows={opsRows.flatMap(r => [
          <tr key={r.name} style={{ cursor: "pointer" }} onClick={() => toggleOps(r.name)}>
            <td style={{ padding: "7px 8px", fontWeight: 600, borderBottom: expandedOps[r.name] ? "none" : "1px solid var(--border)", whiteSpace: "nowrap", color: "#2d7dd2" }}>
              <span style={{ fontSize: 9, marginRight: 4 }}>{expandedOps[r.name] ? "▼" : "▶"}</span>{r.name}
            </td>
            {r.weekBreakdowns.map((s, i) => (
              <StatWeekCell key={i} value={s.total} cls={opsScoreCls(s.total)} fmt={v => v.toFixed(0)} scale={100} detail={opsWeekDetail(s)} />
            ))}
            <StatWeekCell value={r.avg} cls={opsScoreCls(r.avg)} fmt={v => v.toFixed(1)} scale={100}
              detail={r.avg ? `${r.avgOrder.toFixed(0)}+${r.avgProfit.toFixed(0)}+${r.avgProfit15.toFixed(0)}` : ""} />
            <td style={{ padding: "7px 6px", textAlign: "center", borderBottom: expandedOps[r.name] ? "none" : "1px solid var(--border)", fontSize: 10, color: "var(--tm)", lineHeight: 1.3 }}>
              {r.avg ? (
                <>
                  <div>下单{r.avgOrder.toFixed(0)}</div>
                  <div>赢利{r.avgProfit.toFixed(0)}+利15%{r.avgProfit15.toFixed(0)}</div>
                </>
              ) : "—"}
            </td>
            <td style={{ padding: "7px 8px", textAlign: "center", borderBottom: expandedOps[r.name] ? "none" : "1px solid var(--border)", fontSize: 12 }}>
              {r.totalSales > 0 ? `$${Math.round(r.totalSales).toLocaleString()}` : "—"}
            </td>
            <td style={{ padding: "7px 8px", textAlign: "center", borderBottom: expandedOps[r.name] ? "none" : "1px solid var(--border)", fontSize: 12 }}>
              {r.totalNsku > 0 ? r.totalNsku : "—"}
            </td>
            <td style={{ padding: "7px 8px", textAlign: "center", borderBottom: expandedOps[r.name] ? "none" : "1px solid var(--border)", fontSize: 11, color: r.filledWeeks === 4 ? "#2d9e52" : "var(--tm)" }}>
              {r.filledWeeks}/4
            </td>
          </tr>,
          <OpsStatsExpandRow key={`${r.name}-detail`} row={r} colSpan={OPS_COLS} expanded={expandedOps[r.name]} />,
        ])}
      />
      {opsRows.length > 0 && (
        <KpiStatsSummaryChips color="#2d7dd2" chips={[
          { label: "运营人数", value: String(opsRows.length) },
          { label: "团队月均得分", value: teamOpsAvg > 0 ? `${teamOpsAvg.toFixed(1)}/100` : "—", cls: opsScoreCls(teamOpsAvg) },
          { label: "月销合计", value: opsRows.some(r => r.totalSales > 0) ? `$${Math.round(opsRows.reduce((a, r) => a + r.totalSales, 0)).toLocaleString()}` : "—" },
          { label: "月上新合计", value: String(opsRows.reduce((a, r) => a + r.totalNsku, 0)) || "—" },
        ]} />
      )}

      <KpiStatsTable
        title="美工 · 周考核"
        subtitle="5 分制 · 每天约 1 分合格 · 精铺1分/精品5分/A+0.5/视频2 · 运营评价另计"
        color="#6b21a8"
        headers={["姓名", "W1", "W2", "W3", "W4", "月均", "月均构成", "达标周", "月评价", "返工", "填写"]}
        emptyHint="暂无美工人员 · 请在设置中添加"
        rows={desRows.flatMap(r => [
          <tr key={r.name} style={{ cursor: "pointer" }} onClick={() => toggleDes(r.name)}>
            <td style={{ padding: "7px 8px", fontWeight: 600, borderBottom: expandedDes[r.name] ? "none" : "1px solid var(--border)", whiteSpace: "nowrap", color: "#6b21a8" }}>
              <span style={{ fontSize: 9, marginRight: 4 }}>{expandedDes[r.name] ? "▼" : "▶"}</span>{r.name}
            </td>
            {r.weekBreakdowns.map((s, i) => (
              <StatWeekCell key={i} value={s.outputPts} cls={desScoreCls(s.outputPts)} fmt={v => v.toFixed(1)} scale={5} detail={desWeekDetail(s)} />
            ))}
            <StatWeekCell value={r.avg} cls={desScoreCls(r.avg)} fmt={v => v.toFixed(1)} scale={5}
              detail={r.avg ? `图${r.avgImg.toFixed(0)}+视${r.avgVid.toFixed(0)}` : ""} />
            <td style={{ padding: "7px 6px", textAlign: "center", borderBottom: expandedDes[r.name] ? "none" : "1px solid var(--border)", fontSize: 10, color: "var(--tm)", lineHeight: 1.3 }}>
              {r.avg ? (
                <>
                  <div>图{r.avgImg.toFixed(1)}</div>
                  <div>A+{r.avgAplus.toFixed(1)}+视{r.avgVid.toFixed(1)}</div>
                </>
              ) : "—"}
            </td>
            <td style={{ padding: "7px 8px", textAlign: "center", borderBottom: expandedDes[r.name] ? "none" : "1px solid var(--border)", fontSize: 12, fontWeight: 600, color: r.quotaDone === 4 ? "#2d9e52" : r.quotaDone >= 2 ? "#e09000" : r.quotaDone > 0 ? "#e55" : "var(--tm)" }}>
              {r.quotaDone}/4
            </td>
            <td style={{ padding: "7px 8px", textAlign: "center", borderBottom: expandedDes[r.name] ? "none" : "1px solid var(--border)", fontSize: 12, color: r.reviewNet > 0 ? "#6b21a8" : r.reviewNet < 0 ? "#9ca3af" : "var(--tm)" }}>
              {r.reviewNet !== 0 ? (r.reviewNet > 0 ? `+${r.reviewNet}` : String(r.reviewNet)) : "—"}
            </td>
            <td style={{ padding: "7px 8px", textAlign: "center", borderBottom: expandedDes[r.name] ? "none" : "1px solid var(--border)", fontSize: 12, color: r.rework > 0 ? "#e55" : "var(--tm)" }}>
              {r.rework > 0 ? r.rework : "—"}
            </td>
            <td style={{ padding: "7px 8px", textAlign: "center", borderBottom: expandedDes[r.name] ? "none" : "1px solid var(--border)", fontSize: 11, color: r.filledWeeks === 4 ? "#2d9e52" : "var(--tm)" }}>
              {r.filledWeeks}/4
            </td>
          </tr>,
          <DesStatsExpandRow key={`${r.name}-detail`} row={r} colSpan={DES_COLS} expanded={expandedDes[r.name]} />,
        ])}
      />
      {desRows.length > 0 && (
        <KpiStatsSummaryChips color="#6b21a8" chips={[
          { label: "美工人数", value: String(desRows.length) },
          { label: "团队月均得分", value: teamDesAvg > 0 ? `${teamDesAvg.toFixed(1)}/5` : "—", cls: desScoreCls(teamDesAvg) },
          { label: "全员达标周", value: `${desRows.reduce((a, r) => a + r.quotaDone, 0)}次` },
          { label: "月评价净分", value: (() => { const t = desRows.reduce((a, r) => a + r.reviewNet, 0); return t !== 0 ? (t > 0 ? `+${t}` : String(t)) : "—"; })() },
        ]} />
      )}
    </div>
  );
}

function MonthlyBlock({ title, color, cards, rows, tagColor: tagColorProp }) {
  const tagColor = tagColorProp || { g: "#2d9e52", r: "#e55", a: "#e09000", t: "#00695c" };
  return (
    <div style={{ background: "var(--card)", border: `1px solid ${color}33`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color, marginBottom: 12 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8, marginBottom: 14 }}>
        {cards.map(c => (
          <div key={c.label} style={{ background: "var(--bg)", borderRadius: 7, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: c.cls ? tagColor[c.cls] : "var(--text)" }}>{c.value}</div>
            <div style={{ fontSize: 10, color: "var(--tm)", marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--tm)", borderBottom: "1px solid var(--border)" }}>指标</th>
              {WEEKS.map(w => <th key={w} style={{ padding: "6px 8px", color: "var(--tm)", borderBottom: "1px solid var(--border)" }}>第{w}周</th>)}
              <th style={{ padding: "6px 8px", color, borderBottom: "1px solid var(--border)" }}>月合计/均值</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.label}>
                <td style={{ padding: "7px 8px", color: "var(--tm)", borderBottom: "1px solid var(--border)" }}>{row.label}</td>
                {row.vals.map((v, i) => (
                  <td key={i} style={{ padding: "7px 8px", borderBottom: "1px solid var(--border)", color: row.cls(v) ? tagColor[row.cls(v)] : "inherit" }}>{row.fmt(v)}</td>
                ))}
                <td style={{ padding: "7px 8px", borderBottom: "1px solid var(--border)", color, fontWeight: 500 }}>
                  {row.fmt(row.agg)}{row.type === "avg" ? " (均)" : " (计)"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function KpiPanel({ active = true }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [curRole, setCurRole] = useState("ops");
  const [curOpsSub, setCurOpsSub] = useState("bulk");
  const [curPremiumPage, setCurPremiumPage] = useState("score");
  const [curWeek, setCurWeek] = useState(1);
  const [person, setPerson] = useState("");
  const [draft, setDraft] = useState(emptyOpsWeek());
  const [skuListDraft, setSkuListDraft] = useState([]);
  const [monthTargetsDraft, setMonthTargetsDraft] = useState(emptyDevMonthTargets());
  const [toast, setToast] = useState("");
  const [staffTick, setStaffTick] = useState(0);

  const { items, persist, meta, loading, saving, error, reload } = useSharedList(KPI_STORAGE_KEY, [], { active });

  const isStatsView = curRole === "stats";
  const effectiveRole = isStatsView ? "ops" : opsEffectiveRole(curRole, curOpsSub);
  const roleMeta = KPI_ROLE_META[curRole] || KPI_ROLE_META.ops;
  const roleLabel = isStatsView ? "统计" : roleMeta.label;
  const staffList = useMemo(() => {
    const list = getEmployees().filter(e => e.role === roleLabel && e.name);
    return list.length ? list : [];
  }, [roleLabel, staffTick]);

  const desStaffList = useMemo(() => {
    const list = getEmployees().filter(e => e.role === "美工" && e.name);
    return list.length ? list : [];
  }, [staffTick]);

  useEffect(() => {
    const onCfg = () => setStaffTick(t => t + 1);
    window.addEventListener("ops-global-config-updated", onCfg);
    return () => window.removeEventListener("ops-global-config-updated", onCfg);
  }, []);

  useEffect(() => {
    if (!staffList.length) { setPerson(""); return; }
    if (!staffList.some(s => s.name === person)) setPerson(staffList[0].name);
  }, [staffList, person]);

  useEffect(() => {
    if (!person) {
      setDraft(emptyWeekForRole(effectiveRole));
      setSkuListDraft([]);
      setMonthTargetsDraft(emptyDevMonthTargets());
      return;
    }
    if (curRole === "dev" && curWeek === 0) {
      setMonthTargetsDraft(getDevMonthTargets(items, year, month, person));
      return;
    }
    if (curWeek === 0) return;
    const wk = getWeekData(items, year, month, effectiveRole, person, curWeek);
    if (effectiveRole === "ops") {
      setDraft({ ...wk, desReview: hydrateOpsDesReview(items, year, month, person, curWeek, wk.desReview) });
    } else {
      setDraft(wk);
    }
    if (effectiveRole === "ops_jp") {
      setSkuListDraft(getPremiumSkuList(items, year, month, person));
    }
  }, [items, year, month, curRole, curOpsSub, effectiveRole, person, curWeek]);

  const weekDone = useMemo(() => {
    if (!person) return {};
    const out = {};
    WEEKS.forEach(w => {
      const d = getWeekData(items, year, month, effectiveRole, person, w);
      if (effectiveRole === "ops") out[w] = weekHasOpsData(d);
      else if (effectiveRole === "ops_jp") out[w] = weekHasPremiumData(d);
      else if (effectiveRole === "dev") out[w] = weekHasDevData(d);
      else out[w] = weekHasDesData(d);
    });
    return out;
  }, [items, year, month, effectiveRole, person]);

  const showToast = (msg, ok = true) => {
    setToast(msg);
    setTimeout(() => setToast(""), ok ? 2200 : 3500);
  };

  const upsertWeek = useCallback(async (weekData, skuList) => {
    if (!person) return false;
    let next = [...items];
    let idx = next.findIndex(r => r.year === year && r.month === month && r.role === effectiveRole && r.person === person);
    if (idx < 0) {
      next.push({ year, month, role: effectiveRole, person, weeks: {} });
      idx = next.length - 1;
    }
    const patch = { weeks: { ...next[idx].weeks, [curWeek]: weekData } };
    if (effectiveRole === "ops_jp" && skuList) patch.skuList = skuList;
    next[idx] = { ...next[idx], ...patch };
    if (effectiveRole === "ops") {
      const prev = getWeekData(items, year, month, "ops", person, curWeek);
      next = applyOpsDesReviewToItems(next, year, month, person, curWeek, weekData.desReview || {}, prev.desReview);
    }
    const ok = await persist(next);
    if (ok) showToast(`第${curWeek}周已保存并上传云端 ✓`);
    else showToast("上传失败，请检查网络或 Gist 配置后重试", false);
    return ok;
  }, [items, year, month, effectiveRole, person, curWeek, persist]);

  const upsertMonthTargets = useCallback(async (targets) => {
    if (!person || curRole !== "dev") return false;
    const next = [...items];
    let idx = next.findIndex(r => r.year === year && r.month === month && r.role === "dev" && r.person === person);
    if (idx < 0) {
      next.push({ year, month, role: "dev", person, weeks: {}, monthTargets: targets });
    } else {
      next[idx] = { ...next[idx], monthTargets: targets };
    }
    const ok = await persist(next);
    if (ok) showToast("月目标已保存并上传云端 ✓");
    else showToast("上传失败，请检查网络或 Gist 配置后重试", false);
    return ok;
  }, [items, year, month, person, curRole, persist]);

  const saveCurrentToCloud = useCallback(async () => {
    if (!person) return "请先选择人员";
    if (curWeek === 0) {
      if (curRole === "dev") return upsertMonthTargets(monthTargetsDraft);
      return "月度汇总为汇总视图，请切换到具体周次填写后保存";
    }
    return effectiveRole === "ops_jp"
      ? upsertWeek(draft, skuListDraft)
      : upsertWeek(draft);
  }, [person, curWeek, curRole, effectiveRole, monthTargetsDraft, draft, skuListDraft, upsertMonthTargets, upsertWeek]);

  const kpiDirty = useMemo(() => {
    if (!person) return false;
    if (curRole === "dev" && curWeek === 0) {
      const saved = getDevMonthTargets(items, year, month, person);
      return JSON.stringify(monthTargetsDraft) !== JSON.stringify(saved);
    }
    if (curWeek === 0) return false;
    const saved = getWeekData(items, year, month, effectiveRole, person, curWeek);
    const weekDirty = JSON.stringify(draft) !== JSON.stringify(saved);
    if (effectiveRole === "ops_jp") {
      const savedSku = getPremiumSkuList(items, year, month, person);
      return weekDirty || JSON.stringify(skuListDraft) !== JSON.stringify(savedSku);
    }
    return weekDirty;
  }, [person, curRole, effectiveRole, curWeek, year, month, items, draft, monthTargetsDraft, skuListDraft]);

  useCloudSyncPage(active, {
    label: "考核",
    save: saveCurrentToCloud,
    reload,
    meta,
    loading,
    saving,
    error,
    isDirty: kpiDirty,
    dirtyHint: curRole === "dev" && curWeek === 0 ? "开发月目标未上传" : `考核第${curWeek}周数据未上传`,
  });

  const clearWeek = () => {
    setDraft(emptyWeekForRole(effectiveRole));
  };

  const tabStyle = (activeTab, color) => ({
    padding: "6px 16px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 13,
    border: `1px solid ${activeTab ? color : "var(--border)"}`,
    background: activeTab ? `${color}18` : "transparent",
    color: activeTab ? color : "var(--tm)",
    fontWeight: activeTab ? 600 : 400,
  });

  const wtabStyle = (w, isMonthly) => {
    const done = !isMonthly && weekDone[w];
    const isActive = isMonthly ? curWeek === 0 : curWeek === w;
    const activeColor = roleMeta.color;
    return {
      padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 12,
      border: `1px solid ${isActive ? activeColor : done ? "#86efac" : "var(--border)"}`,
      background: isActive ? "var(--bg)" : "transparent",
      color: isActive ? "var(--text)" : done ? "#2d9e52" : "var(--tm)",
    };
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 12, borderBottom: "1px solid var(--border)", paddingBottom: 14 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>月度 KPI <span style={{ color: "#2d7dd2" }}>跟踪表</span></div>
          <div style={{ fontSize: 11, color: "var(--tm)", marginTop: 4 }}>按人员分别记录 · 云端共享</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ fontSize: 11, color: "var(--tm)" }}>年份</label>
          <input type="number" style={{ ...kpiInpSm, width: 72 }} value={year} min={2020} max={2099} onChange={e => setYear(+e.target.value || now.getFullYear())} />
          <label style={{ fontSize: 11, color: "var(--tm)" }}>月份</label>
          <select style={{ ...kpiInpSm, background: "var(--card)" }} value={month} onChange={e => setMonth(+e.target.value)}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
          </select>
          <span style={{ fontSize: 12, color: "var(--tm)" }}>{year}年{month}月</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" style={tabStyle(isStatsView, "#5c6bc0")} onClick={() => setCurRole("stats")}>统计</button>
        <button type="button" style={tabStyle(curRole === "ops", "#2d7dd2")} onClick={() => { setCurRole("ops"); setCurWeek(1); }}>运营</button>
        <button type="button" style={tabStyle(curRole === "des", "#6b21a8")} onClick={() => { setCurRole("des"); setCurWeek(1); }}>美工</button>
        <button type="button" style={tabStyle(curRole === "dev", "#00695c")} onClick={() => { setCurRole("dev"); setCurWeek(1); }}>开发</button>
        {curRole === "ops" && (
          <div style={{ display: "flex", gap: 4, marginLeft: 8, paddingLeft: 8, borderLeft: "1px solid var(--border)" }}>
            <button type="button" style={tabStyle(curOpsSub === "bulk", "#2d7dd2")} onClick={() => { setCurOpsSub("bulk"); setCurWeek(1); }}>精铺</button>
            <button type="button" style={{ ...tabStyle(curOpsSub === "premium", "#0C447C"), borderColor: curOpsSub === "premium" ? "#85B7EB" : "var(--border)", background: curOpsSub === "premium" ? "#E6F1FB" : "transparent" }}
              onClick={() => { setCurOpsSub("premium"); setCurWeek(1); setCurPremiumPage("score"); }}>精品</button>
          </div>
        )}
      </div>

      {isStatsView ? (
        <KpiStatsPage items={items} year={year} month={month} staffTick={staffTick} />
      ) : (
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap",
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px",
      }}>
        <span style={{ fontSize: 12, color: "var(--tm)", fontWeight: 500 }}>当前{roleLabel}</span>
        {staffList.length ? (
          <select style={{ ...kpiInpSm, minWidth: 140, background: "var(--card)" }} value={person} onChange={e => setPerson(e.target.value)}>
            {staffList.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        ) : (
          <span style={{ fontSize: 12, color: "#e09000" }}>暂无{roleLabel}人员 · 请在 ⚙ 设置 → 全局员工名单 中添加（角色选「{roleLabel}」）</span>
        )}
        {person && <RoleBadge role={roleLabel} />}
        {person && (
          <span style={{ fontSize: 11, color: "var(--tm)", marginLeft: "auto" }}>
            正在查看：<strong style={{ color: "var(--text)" }}>{person}</strong> 的 {year}年{month}月 KPI
          </span>
        )}
      </div>
      )}

      {!isStatsView && !person ? null : !isStatsView ? (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {WEEKS.map(w => (
              <button key={w} type="button" style={wtabStyle(w, false)} onClick={() => setCurWeek(w)}>第{w}周</button>
            ))}
            <button type="button" style={{ ...wtabStyle(0, true), marginLeft: 4, borderColor: roleMeta.sumBorder, color: roleMeta.color }}
              onClick={() => setCurWeek(0)}>月度汇总</button>
          </div>

          {curWeek === 0 ? (
            curRole === "ops" && curOpsSub === "premium"
              ? <OpsPremiumMonthSummary items={items} year={year} month={month} person={person} getWeekData={getWeekData} />
              : curRole === "ops"
                ? <OpsMonthlySummary items={items} year={year} month={month} person={person} />
              : curRole === "dev"
                ? <DevMonthlySummary items={items} year={year} month={month} person={person}
                    monthTargets={monthTargetsDraft}
                    onMonthTargetsChange={setMonthTargetsDraft}
                    onSaveMonthTargets={() => upsertMonthTargets(monthTargetsDraft)}
                    saving={saving} />
                : <DesMonthlySummary items={items} year={year} month={month} person={person} />
          ) : (
            <>
              {curRole === "ops" && curOpsSub === "premium"
                ? <OpsPremiumPanel page={curPremiumPage} week={curWeek} data={draft} skuList={skuListDraft}
                    onChange={setDraft} onSkuListChange={setSkuListDraft} onPageChange={setCurPremiumPage} />
                : curRole === "ops"
                  ? <OpsWeekForm week={curWeek} data={draft} onChange={setDraft} desStaff={desStaffList} />
                  : curRole === "dev"
                    ? <DevWeekForm data={draft} onChange={setDraft} />
                    : <DesWeekForm week={curWeek} data={draft} onChange={setDraft} />}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                <button type="button" onClick={clearWeek} disabled={saving} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: saving ? "wait" : "pointer", color: "var(--tm)", fontFamily: "inherit" }}>清空本周</button>
                <button type="button" onClick={() => (effectiveRole === "ops_jp" ? upsertWeek(draft, skuListDraft) : upsertWeek(draft))} disabled={saving}
                  style={{ background: curRole === "dev" ? "#00695c" : curOpsSub === "premium" ? "#0C447C" : "#2d7dd2", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 12, cursor: saving ? "wait" : "pointer", fontFamily: "inherit", fontWeight: 600, opacity: saving ? 0.85 : 1 }}>
                  {saving ? "上传中…" : `☁️ 保存并上传第${curWeek}周`}
                </button>
              </div>
            </>
          )}
        </>
      ) : null}

      {toast && (
        <div style={{
          position: "fixed", bottom: 20, right: 20,
          background: toast.includes("失败") ? "#fee2e2" : "#d4f0dc",
          border: `1px solid ${toast.includes("失败") ? "#fecaca" : "#86efac"}`,
          color: toast.includes("失败") ? "#e55" : "#2d9e52",
          padding: "9px 16px", borderRadius: 8, fontSize: 12, zIndex: 99,
        }}>{toast}</div>
      )}
    </div>
  );
}

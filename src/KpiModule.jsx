import { useState, useEffect, useMemo, useCallback } from "react";
import { getEmployees, RoleBadge } from "./GlobalConfig.jsx";
import { useSharedList } from "./utils/storage.js";
import { useCloudSyncPage } from "./GlobalCloudSync.jsx";

const WEEKS = [1, 2, 3, 4];
const KPI_STORAGE_KEY = "kpi-monthly";

const emptyOpsWeek = () => ({
  nsku: "", lsku: "", aadd: "", aout: "", atot: "", sales: "", prate: "",
  acos: "", adsp: "", ador: "", nacos: "", perfOk: null, sout: "", sdays: "",
  perfRemark: "", profitRemark: "",
  tnsku: "", tsal: "", taco: "", tadsp: "", torder: "",
});

const emptyDesWeek = () => ({
  prem: "", std: "", vid: "", aplus: "", dad: "", ontime: "", demand: "", rework: "",
});

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
  if (role === "dev") return emptyDevWeek();
  return emptyDesWeek();
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
  if (!w) return emptyWeekForRole(role);
  return { ...emptyWeekForRole(role), ...w };
}

function getDevMonthTargets(items, year, month, person) {
  const rec = findRecord(items, year, month, "dev", person);
  return { ...emptyDevMonthTargets(), ...(rec?.monthTargets || {}) };
}

function calcOpsSummary(w) {
  const add = num(w.aadd), out = num(w.aout), net = add - out;
  const sales = num(w.sales), rate = parseFloat(w.prate);
  const nsku = num(w.nsku), acos = parseFloat(w.acos), sout = num(w.sout);
  return {
    net,
    sales,
    rate: Number.isFinite(rate) ? rate : null,
    nsku,
    acos: Number.isFinite(acos) ? acos : null,
    sout,
    sdays: parseFloat(w.sdays),
  };
}

function calcDesSummary(w) {
  const prem = num(w.prem), std = num(w.std), aplus = num(w.aplus);
  const imgPts = prem * 5 + std;
  const total = imgPts + aplus * 0.5;
  const ot = num(w.ontime), dm = num(w.demand);
  return {
    imgPts,
    aplusPts: aplus * 0.5,
    total,
    quotaOk: total >= 5,
    vid: num(w.vid),
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
  return ["nsku", "lsku", "sales", "prate", "acos", "adsp", "sout"].some(k => w[k] !== "" && w[k] != null);
}

function weekHasDesData(w) {
  return ["prem", "std", "vid", "aplus"].some(k => w[k] !== "" && w[k] != null);
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

function OpsWeekForm({ week, data, onChange }) {
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
        { label: "本周上新", value: s.nsku || "—" },
        { label: "A品净变化", value: net !== 0 ? `${net >= 0 ? "+" : ""}${net}` : "—", color: net > 0 ? "#2d9e52" : net < 0 ? "#e55" : undefined },
        { label: "整体ACOS", value: s.acos != null ? `${s.acos}%` : "—" },
        { label: "A品断货天", value: String(s.sout), color: s.sout === 0 ? "#2d9e52" : "#e55" },
      ]} />

      <Section title="上新">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 7 }}>
          <FieldCard label="上新 / NEW SKU" hint="周上新数量">
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

  return (
    <div>
      <SummaryBar items={[
        { label: "图片当量分", value: s.imgPts || "—" },
        { label: "A+当量分", value: s.aplusPts > 0 ? s.aplusPts.toFixed(1) : "—", color: s.aplusPts > 0 ? "#6b21a8" : undefined },
        { label: "合计当量", value: s.total > 0 ? s.total.toFixed(1) : "—", color: s.total >= 5 ? "#2d9e52" : s.total > 0 ? "#e09000" : undefined },
        { label: "视频完成数", value: s.vid || "—" },
        { label: "A+完成数", value: s.aplus || "—" },
        { label: "按时交付率", value: s.rate != null ? `${s.rate}%` : "—", color: s.rate != null && s.rate >= 90 ? "#2d9e52" : s.rate != null && s.rate >= 70 ? "#e09000" : s.rate != null ? "#e55" : undefined },
        { label: "返工次数", value: String(s.rework), color: s.rework > 0 ? "#e55" : undefined },
      ]} />

      <Section title="图片产出（精品 1张 = 精铺 5张）">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 7 }}>
          <FieldCard label="精品图 / PREMIUM" hint="精品图完成数" accent="#6b21a8">
            <NumInput value={data.prem} onChange={v => set("prem", v)} unit="张" />
            <QuotaBox total={s.total} imgPts={s.imgPts} aplusPts={s.aplusPts} prem={num(data.prem) * 5} std={num(data.std)} />
          </FieldCard>
          <FieldCard label="精铺图 / STANDARD" hint="精铺图完成数">
            <NumInput value={data.std} onChange={v => set("std", v)} unit="张" />
          </FieldCard>
        </div>
      </Section>

      <Section title="视频">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 7 }}>
          <FieldCard label="视频 / VIDEO" hint="视频完成数">
            <NumInput value={data.vid} onChange={v => set("vid", v)} unit="条" />
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

function QuotaBox({ total, imgPts, aplusPts, prem, std }) {
  const pct = Math.min(100, Math.round(total / 5 * 100));
  const barColor = total >= 5 ? "#2d9e52" : total > 0 ? "#e09000" : "var(--border)";
  return (
    <div style={{ marginTop: 8, background: "var(--bg)", borderRadius: 6, padding: "9px 11px" }}>
      <div style={{ fontSize: 10, color: "var(--tm)", marginBottom: 4 }}>周配额：5 当量分（精品×5 + 精铺×1 + A+×0.5）</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: total >= 5 ? "#2d9e52" : "var(--text)" }}>
        {Number(total.toFixed(1))} <span style={{ fontSize: 11, fontWeight: 400, color: "var(--tm)" }}>/ 5 当量分</span>
      </div>
      {(imgPts > 0 || aplusPts > 0) && (
        <div style={{ fontSize: 10, color: "var(--tm)", marginTop: 4 }}>
          图片 {imgPts} 分{aplusPts > 0 ? ` + A+ ${aplusPts.toFixed(1)} 分` : ""}
        </div>
      )}
      <div style={{ background: "var(--border)", borderRadius: 99, height: 4, marginTop: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 99, transition: "width 0.2s" }} />
      </div>
      <div style={{ fontSize: 10, color: total >= 5 ? "#2d9e52" : total > 0 ? "#e09000" : "var(--tm)", marginTop: 4 }}>
        {total >= 5 ? `✓ 达标（超出${(total - 5).toFixed(1)}分）` : total > 0 ? `进行中，还差${(5 - total).toFixed(1)}分` : "尚未开始"}
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
      { label: "周上新(SKU)", vals: vals(w => num(w.nsku)), type: "sum", fmt: n => String(n), cls: () => "" },
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
        ...summaries.slice(1, 8).map((r, i) => ({
          label: ["月销售额($)", "月均利润率", "月下单合计", "月上新合计", "A品净变化", "月均ACOS", "月广告花费($)"][i],
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
    const pts = WEEKS.map(w => {
      const d = getWeekData(items, year, month, "des", person, w);
      return calcDesSummary(d).total;
    });
    const quotaDone = pts.filter(p => p >= 5).length;
    const vid = WEEKS.map(w => num(getWeekData(items, year, month, "des", person, w).vid));
    const ap = WEEKS.map(w => num(getWeekData(items, year, month, "des", person, w).aplus));
    const rw = WEEKS.map(w => num(getWeekData(items, year, month, "des", person, w).rework));
    const rates = WEEKS.map(w => {
      const d = getWeekData(items, year, month, "des", person, w);
      const dm = num(d.demand), ot = num(d.ontime);
      return dm > 0 ? Math.round(ot / dm * 100) : null;
    }).filter(r => r != null);
    const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;
    return { pts, quotaDone, vid, ap, rw, avgRate };
  }, [items, year, month, person]);

  const rows = [
    { label: "当量分(含A+)", vals: data.pts.map(v => Math.round(v * 10) / 10), type: "sum", fmt: n => n.toFixed(1), cls: n => n >= 5 ? "g" : n > 0 ? "a" : "" },
    { label: "视频(条)", vals: data.vid, type: "sum", fmt: n => String(n), cls: () => "" },
    { label: "A+(套)", vals: data.ap, type: "sum", fmt: n => String(n), cls: () => "" },
    { label: "按时交付率", vals: WEEKS.map(w => {
      const d = getWeekData(items, year, month, "des", person, w);
      const dm = num(d.demand), ot = num(d.ontime);
      return dm > 0 ? Math.round(ot / dm * 100) : 0;
    }), type: "avg", fmt: n => `${n}%`, cls: n => n >= 90 ? "g" : n >= 70 ? "a" : n > 0 ? "r" : "" },
    { label: "返工次数", vals: data.rw, type: "sum", fmt: n => String(n), cls: n => n > 0 ? "r" : "" },
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
        { label: "配额达标周数", value: `${data.quotaDone}/4周`, cls: data.quotaDone === 4 ? "g" : data.quotaDone >= 2 ? "a" : "r" },
        { label: "月视频合计", value: String(data.vid.reduce((a, b) => a + b, 0)) },
        { label: "月A+合计", value: String(data.ap.reduce((a, b) => a + b, 0)) },
        { label: "月均按时交付率", value: data.avgRate > 0 ? `${data.avgRate}%` : "—", cls: data.avgRate >= 90 ? "g" : data.avgRate >= 70 ? "a" : data.avgRate > 0 ? "r" : "" },
        { label: "月返工合计", value: String(data.rw.reduce((a, b) => a + b, 0)), cls: data.rw.reduce((a, b) => a + b, 0) > 0 ? "r" : "" },
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
  const [curWeek, setCurWeek] = useState(1);
  const [person, setPerson] = useState("");
  const [draft, setDraft] = useState(emptyOpsWeek());
  const [monthTargetsDraft, setMonthTargetsDraft] = useState(emptyDevMonthTargets());
  const [toast, setToast] = useState("");
  const [staffTick, setStaffTick] = useState(0);

  const { items, persist, meta, loading, saving, error, reload } = useSharedList(KPI_STORAGE_KEY, [], { active });

  const roleMeta = KPI_ROLE_META[curRole] || KPI_ROLE_META.ops;
  const roleLabel = roleMeta.label;
  const staffList = useMemo(() => {
    const list = getEmployees().filter(e => e.role === roleLabel && e.name);
    return list.length ? list : [];
  }, [roleLabel, staffTick]);

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
      setDraft(emptyWeekForRole(curRole));
      setMonthTargetsDraft(emptyDevMonthTargets());
      return;
    }
    if (curRole === "dev" && curWeek === 0) {
      setMonthTargetsDraft(getDevMonthTargets(items, year, month, person));
      return;
    }
    setDraft(getWeekData(items, year, month, curRole, person, curWeek));
  }, [items, year, month, curRole, person, curWeek]);

  const weekDone = useMemo(() => {
    if (!person) return {};
    const out = {};
    WEEKS.forEach(w => {
      const d = getWeekData(items, year, month, curRole, person, w);
      if (curRole === "ops") out[w] = weekHasOpsData(d);
      else if (curRole === "dev") out[w] = weekHasDevData(d);
      else out[w] = weekHasDesData(d);
    });
    return out;
  }, [items, year, month, curRole, person]);

  const showToast = (msg, ok = true) => {
    setToast(msg);
    setTimeout(() => setToast(""), ok ? 2200 : 3500);
  };

  const upsertWeek = useCallback(async (weekData) => {
    if (!person) return false;
    const next = [...items];
    let idx = next.findIndex(r => r.year === year && r.month === month && r.role === curRole && r.person === person);
    if (idx < 0) {
      next.push({ year, month, role: curRole, person, weeks: {} });
      idx = next.length - 1;
    }
    next[idx] = {
      ...next[idx],
      weeks: { ...next[idx].weeks, [curWeek]: weekData },
    };
    const ok = await persist(next);
    if (ok) showToast(`第${curWeek}周已保存并上传云端 ✓`);
    else showToast("上传失败，请检查网络或 Gist 配置后重试", false);
    return ok;
  }, [items, year, month, curRole, person, curWeek, persist]);

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
    return upsertWeek(draft);
  }, [person, curWeek, curRole, monthTargetsDraft, draft, upsertMonthTargets, upsertWeek]);

  useCloudSyncPage(active, {
    label: "考核",
    save: saveCurrentToCloud,
    reload,
    meta,
    loading,
    saving,
    error,
  });

  const clearWeek = () => {
    setDraft(emptyWeekForRole(curRole));
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

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button type="button" style={tabStyle(curRole === "ops", "#2d7dd2")} onClick={() => { setCurRole("ops"); setCurWeek(1); }}>运营</button>
        <button type="button" style={tabStyle(curRole === "des", "#6b21a8")} onClick={() => { setCurRole("des"); setCurWeek(1); }}>美工</button>
        <button type="button" style={tabStyle(curRole === "dev", "#00695c")} onClick={() => { setCurRole("dev"); setCurWeek(1); }}>开发</button>
      </div>

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

      {!person ? null : (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {WEEKS.map(w => (
              <button key={w} type="button" style={wtabStyle(w, false)} onClick={() => setCurWeek(w)}>第{w}周</button>
            ))}
            <button type="button" style={{ ...wtabStyle(0, true), marginLeft: 4, borderColor: roleMeta.sumBorder, color: roleMeta.color }}
              onClick={() => setCurWeek(0)}>月度汇总</button>
          </div>

          {curWeek === 0 ? (
            curRole === "ops"
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
              {curRole === "ops"
                ? <OpsWeekForm week={curWeek} data={draft} onChange={setDraft} />
                : curRole === "dev"
                  ? <DevWeekForm data={draft} onChange={setDraft} />
                  : <DesWeekForm week={curWeek} data={draft} onChange={setDraft} />}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                <button type="button" onClick={clearWeek} disabled={saving} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: saving ? "wait" : "pointer", color: "var(--tm)", fontFamily: "inherit" }}>清空本周</button>
                <button type="button" onClick={() => upsertWeek(draft)} disabled={saving}
                  style={{ background: curRole === "dev" ? "#00695c" : "#2d7dd2", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 12, cursor: saving ? "wait" : "pointer", fontFamily: "inherit", fontWeight: 600, opacity: saving ? 0.85 : 1 }}>
                  {saving ? "上传中…" : `☁️ 保存并上传第${curWeek}周`}
                </button>
              </div>
            </>
          )}
        </>
      )}

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

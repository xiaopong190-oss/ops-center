import { useState, useMemo } from "react";

export const PREMIUM_SKU_DIMS = ["利润", "库存", "广告", "转化", "退款", "合规"];

const STOCK_OPTS = [
  "无断货，库存充裕(>30天)",
  "无断货，有补货预警(≤30天)",
  "1款断货或即将断货",
  "2款及以上断货",
];

const PREMIUM_CFGS = {
  new: {
    label: "新品推广期",
    kpis: [
      { id: "tacos", name: "账号整体TACoS", desc: "广告报告 → 总广告花费 ÷ 总销售额", where: "广告管理 → 广告活动报告", unit: "%", placeholder: "如 18", target: "目标 ≤25%", wt: 20,
        score: (v, w) => { if (Number.isNaN(v)) return null; if (v <= 20) return w; if (v <= 25) return Math.round(w * 0.8); return Math.max(0, w - Math.floor((v - 25) * 2)); } },
      { id: "gmv", name: "账号GMV达成率", desc: "实际销售额 ÷ 本月目标销售额", where: "数据报告 → 销售和流量报告", unit: "%", placeholder: "如 105", target: "目标 ≥100%", wt: 25,
        score: (v, w) => { if (Number.isNaN(v)) return null; return Math.min(w + 4, Math.max(0, w + (v - 100) * 0.3)); } },
      { id: "newrank", name: "新品BSR周均提升", desc: "核心新品本周类目排名 vs 上周排名变化", where: "商品页面 → 查看BSR排名", unit: "名", placeholder: "如 12", target: "目标周提升≥5名", wt: 20,
        score: (v, w) => { if (Number.isNaN(v)) return null; if (v >= 5) return w; if (v >= 0) return Math.round(w * v / 5); return Math.max(0, w + Math.round(v * 1.5)); } },
      { id: "refund", name: "账号整体退款率", desc: "退款订单数 ÷ 总订单数", where: "报告 → 退款报告", unit: "%", placeholder: "如 5.5", target: "目标 ≤8%", wt: 15,
        score: (v, w) => { if (Number.isNaN(v)) return null; return Math.max(0, w - Math.floor(Math.max(0, v - 8) / 0.5) * 1.5); } },
      { id: "stock", name: "断货或库存预警", desc: "核心款是否断货或预计7天内断货", where: "库存管理 → 库存计划", isSelect: true, opts: STOCK_OPTS, target: "目标：无断货", wt: 10,
        score: (v, w) => { const m = { 0: w, 1: Math.round(w * 0.7), 2: Math.round(w * 0.3), 3: 0 }; return v === "" ? null : (m[v] !== undefined ? m[v] : null); } },
      { id: "comply", name: "合规与账号健康", desc: "Account Health页面是否有警告/政策违规", where: "绩效 → Account Health", unit: "次", placeholder: "0", target: "目标：0次警告", wt: 10,
        score: (v, w) => { if (Number.isNaN(v)) return null; return Math.max(0, w - v * 5); } },
    ],
  },
  mature: {
    label: "成熟维护期",
    kpis: [
      { id: "profit", name: "账号净利润达成率", desc: "本月实际净利润 ÷ 目标净利润", where: "财务报告 → 利润报表", unit: "%", placeholder: "如 98", target: "目标 ≥100%", wt: 30,
        score: (v, w) => { if (Number.isNaN(v)) return null; return Math.min(w + 5, Math.max(0, w + (v - 100) * 1.5)); } },
      { id: "tacos", name: "账号整体TACoS", desc: "广告报告 → 总广告花费 ÷ 总销售额", where: "广告管理 → 广告活动报告", unit: "%", placeholder: "如 12", target: "目标 ≤15%", wt: 20,
        score: (v, w) => { if (Number.isNaN(v)) return null; if (v < 10) return w + 1; if (v <= 15) return w; return Math.max(0, w - Math.floor((v - 15) * 2)); } },
      { id: "gmv", name: "账号GMV达成率", desc: "实际销售额 ÷ 本月目标销售额", where: "数据报告 → 销售和流量报告", unit: "%", placeholder: "如 102", target: "目标 ≥95%", wt: 15,
        score: (v, w) => { if (Number.isNaN(v)) return null; if (v >= 95) return Math.min(w + 2, w + (v - 100) * 0.2); return Math.max(0, w - (95 - v) * 0.5); } },
      { id: "refund", name: "账号整体退款率", desc: "退款订单数 ÷ 总订单数", where: "报告 → 退款报告", unit: "%", placeholder: "如 3.5", target: "目标 ≤5%（严控）", wt: 15,
        score: (v, w) => { if (Number.isNaN(v)) return null; return Math.max(0, w - Math.floor(Math.max(0, v - 5) / 0.5) * 2); } },
      { id: "stock", name: "断货或库存预警", desc: "核心款是否断货或预计7天内断货", where: "库存管理 → 库存计划", isSelect: true, opts: STOCK_OPTS, target: "目标：无断货", wt: 10,
        score: (v, w) => { const m = { 0: w, 1: Math.round(w * 0.7), 2: Math.round(w * 0.3), 3: 0 }; return v === "" ? null : (m[v] !== undefined ? m[v] : null); } },
      { id: "comply", name: "合规与账号健康", desc: "Account Health页面是否有警告/政策违规", where: "绩效 → Account Health", unit: "次", placeholder: "0", target: "目标：0次警告", wt: 10,
        score: (v, w) => { if (Number.isNaN(v)) return null; return Math.max(0, w - v * 5); } },
    ],
  },
};

export function emptyPremiumWeek() {
  return { mode: "new", redline: false, stage: "self", note: "", vals: {}, skuData: {} };
}

export function weekHasPremiumData(w) {
  if (!w) return false;
  if (w.redline || w.note) return true;
  if (Object.values(w.vals || {}).some(v => v !== "" && v != null)) return true;
  if (Object.keys(w.skuData || {}).length > 0) return true;
  return false;
}

export function calcPremiumWeekScore(data) {
  if (!data || data.redline) return null;
  const cfg = PREMIUM_CFGS[data.mode || "new"];
  if (!cfg) return null;
  let total = 0;
  let cnt = 0;
  cfg.kpis.forEach(kpi => {
    const raw = (data.vals || {})[kpi.id];
    const v = kpi.isSelect ? raw : parseFloat(raw);
    const s = kpi.score(v, kpi.wt);
    if (s !== null) { total += Math.max(0, s); cnt++; }
  });
  return cnt > 0 ? Math.round(total * 10) / 10 : null;
}

export function premiumGradeInfo(sc, redline) {
  if (redline) return { g: "红线", b: "0%", cls: "gf", msg: "红线触发，当周当月绩效清零。" };
  if (sc === null) return { g: "—", b: "—", cls: "", msg: "" };
  if (sc >= 90) return { g: "S 优秀", b: "100%", cls: "ga", msg: "账号整体健康，全额发放本周绩效。" };
  if (sc >= 80) return { g: "A 良好", b: "按比例", cls: "gb", msg: "良好，重点改善扣分项，下周冲刺优秀。" };
  if (sc >= 60) return { g: "B 合格", b: "基础", cls: "gc", msg: "合格，需制定改进计划，防止连续低于此线。" };
  return { g: "C 不达标", b: "不发", cls: "gf", msg: "未达60分，不发提成，需提交本周复盘报告。" };
}

const adviceStyle = {
  ga: { background: "#EAF3DE", border: "1px solid #97C459", color: "#3B6D11" },
  gb: { background: "#FAEEDA", border: "1px solid #EF9F27", color: "#854F0B" },
  gc: { background: "#FAECE7", border: "1px solid #F0997B", color: "#993C1D" },
  gf: { background: "#FCEBEB", border: "1px solid #F09595", color: "#A32D2D" },
};

const premiumInp = {
  width: "100%", fontSize: 12, padding: "4px 6px", textAlign: "center",
  border: "1px solid var(--border)", borderRadius: 6, fontFamily: "inherit",
  background: "var(--card)", color: "inherit",
};

function HeroCard({ label, value, tone }) {
  const colors = { blue: "#185FA5", green: "#3B6D11", red: "#A32D2D", amber: "#854F0B" };
  return (
    <div style={{ background: "var(--bg)", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: "var(--tm)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: tone ? colors[tone] : "var(--text)" }}>{value}</div>
    </div>
  );
}

function FlowBar({ stage }) {
  const steps = [
    { id: "self", label: "运营自评", icon: "✎" },
    { id: "manager", label: "主管审核", icon: "✓" },
    { id: "approved", label: "HR存档", icon: "🏢" },
  ];
  const order = ["self", "manager", "approved"];
  const idx = order.indexOf(stage);
  return (
    <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 9, overflow: "hidden", marginBottom: 14 }}>
      {steps.map((s, i) => {
        const cls = i < idx ? "done" : stage === s.id ? "active" : "pending";
        const bg = cls === "done" ? "#EAF3DE" : cls === "active" ? "#E6F1FB" : "var(--bg)";
        const color = cls === "done" ? "#3B6D11" : cls === "active" ? "#0C447C" : "var(--tm)";
        return (
          <div key={s.id} style={{
            flex: 1, padding: "8px 6px", textAlign: "center", fontSize: 11, color, background: bg,
            borderRight: i < 2 ? "1px solid var(--border)" : "none", fontWeight: cls === "active" ? 600 : 400,
          }}>
            <div style={{ fontSize: 14, marginBottom: 2 }}>{s.icon}</div>
            {s.label}
          </div>
        );
      })}
    </div>
  );
}

function PremiumScoreForm({ data, onChange }) {
  const set = (patch) => onChange({ ...data, ...patch });
  const setVal = (id, v) => set({ vals: { ...(data.vals || {}), [id]: v } });
  const cfg = PREMIUM_CFGS[data.mode || "new"];
  const sc = calcPremiumWeekScore(data);
  const gi = premiumGradeInfo(data.redline ? 0 : sc, data.redline);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {["new", "mature"].map(m => (
          <button key={m} type="button" onClick={() => set({ mode: m })} style={{
            fontSize: 12, padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
            border: `1px solid ${data.mode === m ? (m === "new" ? "#85B7EB" : "#97C459") : "var(--border)"}`,
            background: data.mode === m ? (m === "new" ? "#E6F1FB" : "#EAF3DE") : "var(--card)",
            color: data.mode === m ? (m === "new" ? "#0C447C" : "#27500A") : "var(--tm)",
            fontWeight: data.mode === m ? 600 : 400,
          }}>
            {m === "new" ? "新品期" : "成熟期"}
          </button>
        ))}
      </div>

      <FlowBar stage={data.stage || "self"} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
        <HeroCard label="本周得分" value={data.redline ? "0" : sc !== null ? sc.toFixed(1) : "填写中"} tone={data.redline ? "red" : "blue"} />
        <HeroCard label="绩效等级" value={data.redline ? "红线" : gi.g} />
        <HeroCard label="提成系数" value={data.redline ? "0%" : gi.b} />
        <HeroCard label="审批状态" value={data.stage === "self" ? "待提交" : data.stage === "manager" ? "主管审核中" : "已存档"} />
      </div>

      <div style={{
        border: "1px solid #F09595", borderRadius: 9, padding: "10px 12px", marginBottom: 12,
        background: "#FCEBEB", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#A32D2D" }}>红线一票否决</span>
        <span style={{ fontSize: 11, color: "#791F1F", flex: 1 }}>账号被封 / 大卖链接被移除 → 当周当月绩效清零</span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: "#791F1F" }}>
          <input type="checkbox" checked={!!data.redline} onChange={e => set({ redline: e.target.checked })} />
          {data.redline ? "已触发" : "未触发"}
        </label>
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: 9, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ padding: "8px 12px", background: "var(--bg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>账号层KPI — {cfg.label}</span>
          <span style={{ fontSize: 11, color: "var(--tm)" }}>数据来源：亚马逊卖家后台</span>
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 56px 120px 52px", gap: 8, padding: "6px 12px",
          fontSize: 10, color: "var(--tm)", borderTop: "1px solid var(--border)", background: "var(--card)",
        }}>
          <span>指标</span><span style={{ textAlign: "center" }}>权重</span><span>填入实际值</span><span style={{ textAlign: "center" }}>得分</span>
        </div>
        {cfg.kpis.map(kpi => {
          const raw = (data.vals || {})[kpi.id] ?? "";
          const v = kpi.isSelect ? raw : parseFloat(raw);
          const s = kpi.score(v, kpi.wt);
          const scCls = s !== null ? (s / kpi.wt >= 0.85 ? "#0F6E56" : s / kpi.wt >= 0.6 ? "#854F0B" : "#A32D2D") : "var(--tm)";
          return (
            <div key={kpi.id} style={{
              display: "grid", gridTemplateColumns: "1fr 56px 120px 52px", gap: 8, alignItems: "center",
              padding: "10px 12px", borderTop: "1px solid var(--border)",
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{kpi.name}</div>
                <div style={{ fontSize: 11, color: "var(--tm)", marginTop: 2 }}>{kpi.desc}</div>
                <div style={{ fontSize: 10, color: "#185FA5", marginTop: 2 }}>{kpi.where}</div>
                <span style={{
                  fontSize: 10, padding: "1px 6px", borderRadius: 8, marginTop: 4, display: "inline-block",
                  background: "var(--bg)", color: "var(--tm)",
                }}>{kpi.target}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--tm)", textAlign: "center" }}>{kpi.wt}%</div>
              {kpi.isSelect ? (
                <select style={{ ...premiumInp, textAlign: "left" }} value={raw} onChange={e => setVal(kpi.id, e.target.value)}>
                  <option value="">请选择</option>
                  {kpi.opts.map((o, i) => <option key={i} value={String(i)}>{o}</option>)}
                </select>
              ) : (
                <input style={premiumInp} type="number" step="0.1" placeholder={kpi.placeholder} value={raw}
                  onChange={e => setVal(kpi.id, e.target.value)} />
              )}
              <div style={{ fontSize: 13, fontWeight: 600, textAlign: "center", color: scCls }}>
                {s !== null ? s.toFixed(1) : "—"}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: 9, padding: "10px 12px", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>运营自评备注（异常说明 / 主动动作）</div>
        <textarea style={{ ...premiumInp, textAlign: "left", minHeight: 60, resize: "vertical" }} placeholder="如：本周TACoS偏高因为测试了3组新品广告组合…"
          value={data.note || ""} onChange={e => set({ note: e.target.value })} />
      </div>

      {sc !== null && !data.redline && gi.msg && (
        <div style={{
          borderRadius: 9, padding: "10px 12px", marginBottom: 12,
          ...adviceStyle[gi.cls] || {},
        }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>{gi.msg}</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        {sc !== null && data.stage === "self" && (
          <button type="button" onClick={() => set({ stage: "manager" })} style={{
            fontSize: 12, padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
            background: "#E6F1FB", border: "1px solid #85B7EB", color: "#0C447C",
          }}>提交主管审核 →</button>
        )}
        {data.stage === "manager" && (
          <button type="button" onClick={() => set({ stage: "approved" })} style={{
            fontSize: 12, padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
            background: "#EAF3DE", border: "1px solid #97C459", color: "#27500A",
          }}>主管确认通过 → HR存档</button>
        )}
        {data.stage === "approved" && (
          <span style={{ fontSize: 12, color: "#3B6D11" }}>✓ 已审批存档</span>
        )}
      </div>
    </div>
  );
}

function DotBtn({ active, tone, onClick }) {
  const colors = { g: "#3B6D11", y: "#854F0B", r: "#A32D2D" };
  const bg = { g: "#EAF3DE", y: "#FAEEDA", r: "#FCEBEB" };
  return (
    <button type="button" onClick={onClick} style={{
      width: 26, height: 26, borderRadius: "50%", border: `1px solid ${active ? "#97C459" : "var(--border)"}`,
      cursor: "pointer", fontSize: 11, fontWeight: 600, margin: "0 2px",
      background: active ? bg[tone] : "var(--card)", color: colors[tone], opacity: active ? 1 : 0.35,
      fontFamily: "inherit",
    }}>●</button>
  );
}

function PremiumSkuForm({ week, data, skuList, onChange, onSkuListChange }) {
  const skuData = data.skuData || {};

  const setDot = (skuIdx, dim, val) => {
    const row = { ...(skuData[String(skuIdx)] || {}) };
    row[dim] = val;
    onChange({ ...data, skuData: { ...skuData, [String(skuIdx)]: row } });
  };

  const addSku = () => {
    const name = window.prompt("输入SKU名称（如 A001 或 蓝色托特包）");
    if (!name?.trim()) return;
    const phase = window.confirm("新品期点确定，成熟期点取消") ? "new" : "mature";
    const next = [...skuList, { name: name.trim(), phase }];
    const idx = next.length - 1;
    const row = {};
    PREMIUM_SKU_DIMS.forEach(d => { row[d] = "g"; });
    onSkuListChange(next);
    onChange({ ...data, skuData: { ...skuData, [String(idx)]: row } });
  };

  const updateSku = (i, patch) => {
    const next = skuList.map((s, j) => j === i ? { ...s, ...patch } : s);
    onSkuListChange(next);
  };

  let redCount = 0, yellowCount = 0;
  skuList.forEach((_, i) => {
    PREMIUM_SKU_DIMS.forEach(dim => {
      const v = skuData[String(i)]?.[dim] || "g";
      if (v === "r") redCount++;
      if (v === "y") yellowCount++;
    });
  });

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--tm)", marginBottom: 10 }}>
        运营负责的SKU — 每周扫描一次，只打状态，不填数字
      </div>
      <div style={{ border: "1px solid var(--border)", borderRadius: 9, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ padding: "8px 12px", background: "var(--bg)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>SKU健康扫描 · 第{week}周</span>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "#EAF3DE", color: "#3B6D11" }}>绿=正常</span>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "#FAEEDA", color: "#854F0B" }}>黄=关注</span>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "#FCEBEB", color: "#A32D2D" }}>红=异常</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--bg)" }}>
                <th style={{ padding: "8px 10px", textAlign: "left", color: "var(--tm)", fontWeight: 500 }}>SKU/款名</th>
                <th style={{ padding: "8px 10px", textAlign: "left", color: "var(--tm)", fontWeight: 500 }}>阶段</th>
                {PREMIUM_SKU_DIMS.map(d => (
                  <th key={d} style={{ padding: "8px 6px", textAlign: "center", color: "var(--tm)", fontWeight: 500 }}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {skuList.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 16, textAlign: "center", color: "var(--tm)" }}>暂无SKU，点击下方添加</td></tr>
              ) : skuList.map((sku, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 10px" }}>
                    <input style={{ ...premiumInp, width: 90, textAlign: "left" }} value={sku.name}
                      onChange={e => updateSku(i, { name: e.target.value })} />
                    <div style={{ marginTop: 4 }}>
                      <span style={{
                        fontSize: 10, padding: "1px 6px", borderRadius: 8,
                        background: sku.phase === "new" ? "#E6F1FB" : "#EAF3DE",
                        color: sku.phase === "new" ? "#0C447C" : "#27500A",
                      }}>{sku.phase === "new" ? "新品" : "成熟"}</span>
                    </div>
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <select style={{ fontSize: 10, padding: "2px 4px", borderRadius: 4, border: "1px solid var(--border)" }}
                      value={sku.phase} onChange={e => updateSku(i, { phase: e.target.value })}>
                      <option value="new">新品</option>
                      <option value="mature">成熟</option>
                    </select>
                  </td>
                  {PREMIUM_SKU_DIMS.map(dim => {
                    const cur = skuData[String(i)]?.[dim] || "g";
                    return (
                      <td key={dim} style={{ padding: "8px 6px", textAlign: "center" }}>
                        {["g", "y", "r"].map(v => (
                          <DotBtn key={v} tone={v} active={cur === v} onClick={() => setDot(i, dim, v)} />
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={addSku} style={{
            fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
            border: "1px solid var(--border)", background: "var(--card)",
          }}>+ 添加SKU</button>
          <span style={{ fontSize: 11, color: "var(--tm)" }}>红色异常项需在考核备注中说明处理方案</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
        <HeroCard label="红色异常项" value={String(redCount)} tone={redCount > 0 ? "red" : undefined} />
        <HeroCard label="黄色关注项" value={String(yellowCount)} tone={yellowCount > 0 ? "amber" : undefined} />
        <HeroCard label="SKU数量" value={String(skuList.length)} />
      </div>
      {redCount > 0 && (
        <div style={{ fontSize: 12, color: "#A32D2D", padding: "8px 12px", background: "#FCEBEB", borderRadius: 8 }}>
          有 {redCount} 个红色异常项，请在考核备注中说明处理方案。
        </div>
      )}
    </div>
  );
}

export function OpsPremiumMonthSummary({ items, year, month, person, getWeekData }) {
  const WEEKS = [1, 2, 3, 4];
  const weekRows = useMemo(() => WEEKS.map(w => {
    const d = getWeekData(items, year, month, "ops_jp", person, w);
    return { w, sc: calcPremiumWeekScore(d), red: !!d.redline, mode: d.mode || "new" };
  }), [items, year, month, person, getWeekData]);

  const hasRed = weekRows.some(x => x.red);
  const filled = weekRows.filter(x => x.sc !== null);
  const monthSc = hasRed ? 0 : (filled.length ? filled.reduce((a, x) => a + x.sc, 0) / filled.length : null);
  const gi = premiumGradeInfo(monthSc, hasRed);
  const mode = weekRows.find(x => x.sc !== null)?.mode || "new";
  const cfg = PREMIUM_CFGS[mode];

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#0C447C", marginBottom: 12 }}>精品运营 — 月度总评</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
        <HeroCard label="月度综合分" value={monthSc !== null ? monthSc.toFixed(1) : "暂无"} tone="blue" />
        <HeroCard label="月度等级" value={hasRed ? "红线触发" : gi.g} />
        <HeroCard label="月度提成" value={hasRed ? "0%" : gi.b} />
        <HeroCard label="完成周次" value={`${filled.length}/4`} />
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: 9, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ padding: "8px 12px", background: "var(--bg)", fontSize: 13, fontWeight: 600 }}>四周评分趋势</div>
        <div style={{ padding: "12px 14px", display: "flex", alignItems: "flex-end", gap: 12, height: 100 }}>
          {weekRows.map(ws => {
            const sc = ws.red ? 0 : ws.sc;
            const h = sc !== null ? Math.round(sc * 0.7) : 4;
            const color = sc === null ? "var(--bg)" : sc >= 90 ? "#639922" : sc >= 80 ? "#EF9F27" : sc >= 60 ? "#D85A30" : "#E24B4A";
            return (
              <div key={ws.w} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{sc !== null ? sc.toFixed(0) : "—"}</span>
                <div style={{ width: "100%", background: color, borderRadius: "3px 3px 0 0", height: h, minHeight: 4 }} />
                <span style={{ fontSize: 10, color: "var(--tm)" }}>W{ws.w}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: 9, overflow: "hidden" }}>
        <div style={{ padding: "8px 12px", background: "var(--bg)", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>月度KPI平均达成</span>
          <span style={{ fontSize: 11, color: "var(--tm)" }}>四周均值 · {cfg.label}</span>
        </div>
        {cfg.kpis.map(kpi => {
          const scores = WEEKS.map(w => {
            const d = getWeekData(items, year, month, "ops_jp", person, w);
            const raw = (d.vals || {})[kpi.id];
            const v = kpi.isSelect ? raw : parseFloat(raw);
            return kpi.score(v, kpi.wt);
          }).filter(s => s !== null);
          const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
          const pct = avg !== null ? Math.min(100, Math.round(avg / kpi.wt * 100)) : 0;
          const barColor = pct >= 85 ? "#639922" : pct >= 60 ? "#BA7517" : "#E24B4A";
          const txtColor = avg !== null ? (pct >= 85 ? "#3B6D11" : pct >= 60 ? "#854F0B" : "#A32D2D") : "var(--tm)";
          return (
            <div key={kpi.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 12, minWidth: 130 }}>{kpi.name}</span>
              <div style={{ flex: 1, height: 5, background: "var(--bg)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${avg !== null ? pct : 0}%`, background: barColor, borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, minWidth: 52, textAlign: "right", color: txtColor }}>
                {avg !== null ? `${avg.toFixed(1)}/${kpi.wt}` : "暂无"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OpsPremiumPanel({ page, week, data, skuList, onChange, onSkuListChange, onPageChange }) {
  const tabStyle = (id) => ({
    flex: 1, fontSize: 13, padding: "8px 0", textAlign: "center", cursor: "pointer",
    background: page === id ? "var(--bg)" : "var(--card)", color: page === id ? "var(--text)" : "var(--tm)",
    border: "none", fontWeight: page === id ? 600 : 400, fontFamily: "inherit",
    borderRight: id !== "sku" ? "1px solid var(--border)" : "none",
  });

  return (
    <div>
      <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 9, overflow: "hidden", marginBottom: 14 }}>
        <button type="button" style={tabStyle("score")} onClick={() => onPageChange("score")}>绩效考核</button>
        <button type="button" style={tabStyle("sku")} onClick={() => onPageChange("sku")}>SKU预警</button>
      </div>
      {page === "score"
        ? <PremiumScoreForm data={data} onChange={onChange} />
        : <PremiumSkuForm week={week} data={data} skuList={skuList} onChange={onChange} onSkuListChange={onSkuListChange} />}
    </div>
  );
}

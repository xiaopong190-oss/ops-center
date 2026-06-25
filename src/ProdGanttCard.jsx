import { useRef, useMemo, useState, useEffect } from "react";

const PROD_GANTT_STATUS = {
  setup: { label: "立项/备料", color: "#5F5E5A", bg: "#F4F3EF", dot: "#888780", border: "#C8C6BC" },
  producing: { label: "生产中", color: "#185FA5", bg: "#EBF4FD", dot: "#378ADD", border: "#85B7EB" },
  qc: { label: "QC验货", color: "#1a9e8a", bg: "#d1fae5", dot: "#1a9e8a", border: "#5eead4" },
  shipping: { label: "出货", color: "#0F6E56", bg: "#E5F6F0", dot: "#0F6E56", border: "#86efac" },
  done: { label: "已完成", color: "#2d9e52", bg: "#d4f0dc", dot: "#2d9e52", border: "#86efac" },
  blocked: { label: "异常", color: "#78350f", bg: "#fef3c7", dot: "#e09000", border: "#ffe0a0" },
  overdue: { label: "逾期", color: "#E24B4A", bg: "#fee2e2", dot: "#E24B4A", border: "#fecaca" },
};

const PROD_GANTT_SORT_OPTIONS = [
  { key: "name", label: "产品名称" },
  { key: "shipDate", label: "最近下单" },
  { key: "etaArrival", label: "预计交期" },
  { key: "batches", label: "批次数" },
];

const PROD_GANTT_FILTER_KEY = "ops-prod-gantt-filters";
const PROD_GANTT_EXPAND_KEY = "ops-prod-gantt-expanded";

const PROD_GANTT_BTN_PRIMARY = {
  background: "#2d7dd2",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
  fontWeight: 600,
  flexShrink: 0,
};

const prodGanttFilterChip = (active) => ({
  background: active ? "#2d7dd2" : "var(--card)",
  color: active ? "#fff" : "var(--tm)",
  border: `1px solid ${active ? "#2d7dd2" : "var(--border)"}`,
  borderRadius: 20,
  padding: "4px 12px",
  fontSize: 11,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
});

function loadProdGanttFilters() {
  try {
    const raw = sessionStorage.getItem(PROD_GANTT_FILTER_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === "object") {
        return {
          productFilter: typeof p.productFilter === "string" ? p.productFilter : "all",
          statusFilter: typeof p.statusFilter === "string" ? p.statusFilter : "all",
          sortBy: PROD_GANTT_SORT_OPTIONS.some(o => o.key === p.sortBy) ? p.sortBy : "name",
        };
      }
    }
  } catch { /* ignore */ }
  return { productFilter: "all", statusFilter: "all", sortBy: "name" };
}

function saveProdGanttFilters(filters) {
  try { sessionStorage.setItem(PROD_GANTT_FILTER_KEY, JSON.stringify(filters)); } catch { /* ignore */ }
}

function loadProdGanttExpanded() {
  try {
    const raw = sessionStorage.getItem(PROD_GANTT_EXPAND_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === "object") return p;
    }
  } catch { /* ignore */ }
  return {};
}

function saveProdGanttExpanded(state) {
  try { sessionStorage.setItem(PROD_GANTT_EXPAND_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

function prodGanttNormalizeStage(s) {
  return s === "生产" ? "生产中" : (s || "立项");
}

function prodGanttOpenExcs(b) {
  return (b.exceptions || []).filter(e => !e.resolved);
}

function prodGanttBatchStatus(b) {
  if (prodGanttNormalizeStage(b.stage) === "已完成") return "done";
  if (prodGanttOpenExcs(b).length) return "blocked";
  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);
  if (b.etaDelivery) {
    const d = new Date(b.etaDelivery);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((d - TODAY) / 86400000);
    if (diff < 0 && !["出货", "已完成"].includes(prodGanttNormalizeStage(b.stage))) return "overdue";
  }
  return "inprog";
}

function batchToGanttStatus(b) {
  const st = prodGanttBatchStatus(b);
  if (st === "blocked") return "blocked";
  if (st === "overdue") return "overdue";
  const stage = prodGanttNormalizeStage(b.stage);
  if (stage === "已完成") return "done";
  if (stage === "出货") return "shipping";
  if (stage === "QC验货") return "qc";
  if (stage === "生产中") return "producing";
  return "setup";
}

/** 产品分组键（产品编号 + 款式，与下方列表分组一致） */
export function prodGroupKey(b) {
  return `${(b.product || "未命名").trim()}::${(b.name || "").trim()}`;
}

export function prodMatchesProduct(b, productFilter) {
  return productFilter === "all" || prodGroupKey(b) === productFilter;
}

function prodBatchGanttMeta(b, today) {
  const excCount = prodGanttOpenExcs(b).length;
  let overdue = prodGanttBatchStatus(b) === "overdue";
  if (!overdue && b.etaDelivery) {
    const eta = prodGanttParseD(b.etaDelivery);
    const stage = prodGanttNormalizeStage(b.stage);
    if (eta && eta < today && !["出货", "已完成"].includes(stage) && !b.actualDelivery) overdue = true;
  }
  return { excCount, overdue };
}

function prodDominantStatus(statuses) {
  const order = ["blocked", "overdue", "producing", "qc", "shipping", "setup", "done"];
  if (!statuses.length) return "setup";
  if (statuses.every(s => s === "done")) return "done";
  for (const key of order) {
    if (statuses.some(s => s === key)) return key;
  }
  return "setup";
}

function prodDisplayName(product, name) {
  const parts = [product, name].filter(Boolean);
  return parts.join(" ") || "未命名";
}

/** 按产品编号 + 款式聚合，每个生产批次在甘特图中独立一行 */
export function productionItemsToGanttProducts(items) {
  if (!Array.isArray(items) || !items.length) return [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const byKey = new Map();
  for (const b of items) {
    const key = prodGroupKey(b);
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: key,
        product: b.product || "",
        styleName: b.name || "",
        name: prodDisplayName(b.product, b.name),
        sku: b.product || "",
        batches: [],
      });
    }
    const meta = prodBatchGanttMeta(b, today);
    byKey.get(key).batches.push({
      id: b.id,
      label: b.batch || "批次",
      sub: b.supplier || "",
      status: batchToGanttStatus(b),
      shipDate: b.orderDate || "",
      etaArrival: b.actualDelivery || b.etaDelivery || b.etaShip || "",
      excCount: meta.excCount,
      overdue: meta.overdue,
    });
  }
  for (const p of byKey.values()) {
    p.batches.sort((a, b) => {
      const ta = prodGanttParseD(a.shipDate)?.getTime() || 0;
      const tb = prodGanttParseD(b.shipDate)?.getTime() || 0;
      return tb - ta;
    });
  }
  return Array.from(byKey.values());
}

const prodGanttParseD = (s) => {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

const prodGanttFmtShort = (d) => {
  if (!d) return "—";
  if (typeof d === "string") {
    const p = prodGanttParseD(d);
    if (!p) return "—";
    return `${p.getMonth() + 1}/${p.getDate()}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

function prodGanttProductSummary(batches) {
  const ships = batches.map(b => prodGanttParseD(b.shipDate)).filter(Boolean);
  const etas = batches.map(b => prodGanttParseD(b.etaArrival)).filter(Boolean);
  return {
    shipDate: ships.length ? new Date(Math.min(...ships.map(d => d.getTime()))).toISOString().slice(0, 10) : "",
    etaArrival: etas.length ? new Date(Math.max(...etas.map(d => d.getTime()))).toISOString().slice(0, 10) : "",
    status: prodDominantStatus(batches.map(b => b.status)),
    excCount: batches.reduce((s, b) => s + (b.excCount || 0), 0),
    overdue: batches.some(b => b.overdue),
    batchCount: batches.length,
  };
}

function prodGanttCalcBarPos(shipDate, etaArrival, min, totalDays) {
  const start = prodGanttParseD(shipDate) || prodGanttParseD(etaArrival);
  const end = prodGanttParseD(etaArrival) || prodGanttParseD(shipDate);
  if (!start || !end) return null;
  const s = start < end ? start : end;
  const e = start < end ? end : start;
  return {
    left: ((s - min) / 86400000 / totalDays) * 100,
    width: Math.max(8, ((e - s) / 86400000 / totalDays) * 100),
    start: s,
    end: e,
  };
}

function ProdGanttAlerts({ excCount, overdue, compact }) {
  const items = [];
  if (overdue) items.push({ t: "逾期", c: "#E24B4A", bg: "#fee2e2" });
  if (excCount > 0) items.push({ t: `⚠${excCount}`, c: "#b45309", bg: "#fff0d4" });
  if (!items.length) return null;
  return (
    <span style={{ display: "inline-flex", gap: compact ? 3 : 4, flexShrink: 0 }}>
      {items.map(it => (
        <span key={it.t} style={{ fontSize: compact ? 9 : 10, fontWeight: 700, padding: compact ? "1px 5px" : "2px 6px", borderRadius: 10, background: it.bg, color: it.c, whiteSpace: "nowrap" }}>{it.t}</span>
      ))}
    </span>
  );
}

function ProdGanttTrack({ shipDate, etaArrival, status, label, sub, excCount, overdue, min, totalDays, today, height = 40, compact = false, segments, segmentsOnly = false }) {
  const pos = prodGanttCalcBarPos(shipDate, etaArrival, min, totalDays);
  const st = PROD_GANTT_STATUS[status] || PROD_GANTT_STATUS.setup;
  const trackH = height;

  if (segmentsOnly && segments?.length) {
    return (
      <div style={{ flex: 1, position: "relative", height: trackH, background: "#f3f4f6", borderRadius: 8, border: "1px solid #e5e7eb" }}>
        {segments.map(seg => {
          const sp = prodGanttCalcBarPos(seg.shipDate, seg.etaArrival, min, totalDays);
          if (!sp) return null;
          const ss = PROD_GANTT_STATUS[seg.status] || PROD_GANTT_STATUS.setup;
          return (
            <div
              key={seg.id}
              title={`${seg.label} · ${ss.label} · ${prodGanttFmtShort(seg.shipDate)}→${prodGanttFmtShort(seg.etaArrival)}`}
              style={{
                position: "absolute",
                left: `${sp.left}%`,
                width: `${sp.width}%`,
                top: 3,
                bottom: 3,
                background: `linear-gradient(180deg, ${ss.bg}, ${ss.border}88)`,
                border: `1.5px solid ${seg.overdue ? "#E24B4A" : ss.border}`,
                borderRadius: 4,
                minWidth: 4,
              }}
            />
          );
        })}
      </div>
    );
  }

  if (!pos) {
    return (
      <div style={{ flex: 1, height: trackH, background: "#f9fafb", borderRadius: 8, border: "2px dashed #d1d5db", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#9ca3af" }}>
        暂无日期区间
      </div>
    );
  }

  const todayInBar = today >= pos.start && today <= pos.end;
  const todayPctInBar = todayInBar ? ((today - pos.start) / (pos.end - pos.start)) * 100 : null;

  return (
    <div style={{ flex: 1, position: "relative", height: trackH, background: "#f3f4f6", borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.04)" }}>
      <div
        title={`${label || ""} ${prodGanttFmtShort(pos.start)} → ${prodGanttFmtShort(pos.end)} · ${st.label}`}
        style={{
          position: "absolute",
          left: `${pos.left}%`,
          width: `${pos.width}%`,
          top: 5,
          bottom: 5,
          background: `linear-gradient(180deg, ${st.bg} 0%, ${st.border}33 100%)`,
          border: `2px solid ${overdue ? "#E24B4A" : st.border}`,
          borderRadius: 6,
          boxShadow: overdue ? "0 0 0 1px #fecaca" : "0 1px 3px rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 8px",
          gap: 6,
          overflow: "hidden",
          minWidth: 48,
        }}
      >
        <span style={{ fontSize: compact ? 9 : 10, fontWeight: 700, color: st.color, flexShrink: 0, background: "rgba(255,255,255,0.7)", padding: "1px 4px", borderRadius: 4 }}>
          {prodGanttFmtShort(pos.start)}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, flex: 1, justifyContent: "center" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.dot, flexShrink: 0, boxShadow: `0 0 0 2px ${st.bg}` }} />
          {label && <span style={{ fontSize: compact ? 10 : 11, fontWeight: 700, color: st.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>}
          {sub && !compact && <span style={{ fontSize: 9, color: st.color, opacity: 0.8, flexShrink: 0 }}>{sub}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <ProdGanttAlerts excCount={excCount} overdue={overdue} compact={compact} />
          <span style={{ fontSize: compact ? 9 : 10, fontWeight: 700, color: st.color, background: "rgba(255,255,255,0.7)", padding: "1px 4px", borderRadius: 4 }}>
            {prodGanttFmtShort(pos.end)}
          </span>
        </div>
        {todayPctInBar != null && (
          <div style={{ position: "absolute", left: `${todayPctInBar}%`, top: -3, bottom: -3, width: 3, background: "#E24B4A", borderRadius: 2, zIndex: 2, pointerEvents: "none" }} title="今天" />
        )}
      </div>
    </div>
  );
}

function prodApplyGanttView(products, { productFilter, statusFilter, sortBy }) {
  let list = products.map(p => ({
    ...p,
    batches: statusFilter === "all"
      ? [...(p.batches || [])]
      : (p.batches || []).filter(b => b.status === statusFilter),
  }));

  if (statusFilter !== "all") {
    list = list.filter(p => p.batches.length > 0);
  }
  if (productFilter !== "all") {
    list = list.filter(p => p.id === productFilter);
  }

  const orderKey = (p) => {
    const times = (p.batches || []).map(b => prodGanttParseD(b.shipDate)?.getTime()).filter(Boolean);
    return times.length ? Math.max(...times) : 0;
  };
  const etaKey = (p) => {
    const times = (p.batches || []).map(b => prodGanttParseD(b.etaArrival)?.getTime()).filter(Boolean);
    return times.length ? Math.min(...times) : Infinity;
  };

  list.sort((a, b) => {
    if (sortBy === "shipDate") return orderKey(b) - orderKey(a);
    if (sortBy === "etaArrival") return etaKey(a) - etaKey(b);
    if (sortBy === "batches") return (b.batches?.length || 0) - (a.batches?.length || 0);
    return String(a.name).localeCompare(String(b.name), "zh");
  });

  return list;
}

async function prodGanttCaptureScreenshot(el) {
  if (!el) return;
  const w = el.scrollWidth;
  const h = el.scrollHeight;
  const html = el.outerHTML;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<foreignObject width="100%" height="100%">
<div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;background:var(--card,#fff);font-family:inherit;">
${html}
</div>
</foreignObject></svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * 2;
      canvas.height = h * 2;
      const ctx = canvas.getContext("2d");
      ctx.scale(2, 2);
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--card").trim() || "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0);
      const a = document.createElement("a");
      a.download = `prod-gantt-${new Date().toISOString().slice(0, 10)}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      resolve();
    };
    img.onerror = reject;
    img.src = url;
  });
}

function ProdGanttTimeline({ products, today }) {
  const [expanded, setExpanded] = useState(loadProdGanttExpanded);

  useEffect(() => {
    saveProdGanttExpanded(expanded);
  }, [expanded]);

  const toggleProduct = (id) => setExpanded(prev => ({ ...prev, [id]: prev[id] !== true }));

  const { min, totalDays, weeks, todayPct } = useMemo(() => {
    let minD = new Date(today);
    let maxD = new Date(today);
    products.forEach(p => {
      (p.batches || []).forEach(b => {
        [b.shipDate, b.etaArrival].forEach(s => {
          const d = prodGanttParseD(s);
          if (!d) return;
          if (d < minD) minD = new Date(d);
          if (d > maxD) maxD = new Date(d);
        });
      });
    });
    minD.setDate(minD.getDate() - 7);
    maxD.setDate(maxD.getDate() + 21);
    const totalDays = Math.max(1, Math.round((maxD - minD) / 86400000));
    const weeks = [];
    const cur = new Date(minD);
    cur.setDate(cur.getDate() - cur.getDay());
    while (cur <= maxD) {
      weeks.push(new Date(cur));
      cur.setDate(cur.getDate() + 7);
    }
    const todayPct = ((today - minD) / 86400000 / totalDays) * 100;
    return { min: minD, max: maxD, totalDays, weeks, todayPct };
  }, [products, today]);

  const LABEL_W = 180;
  const TodayLine = () => todayPct >= 0 && todayPct <= 100 ? (
    <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, width: 2, background: "#E24B4A", zIndex: 3, pointerEvents: "none" }}>
      <div style={{ position: "absolute", top: -14, left: -10, fontSize: 9, color: "#E24B4A", fontWeight: 700, whiteSpace: "nowrap" }}>今天</div>
    </div>
  ) : null;

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 720 }}>
        <div style={{ display: "flex", marginLeft: LABEL_W, borderBottom: "2px solid var(--border)", paddingBottom: 6, marginBottom: 10 }}>
          {weeks.map((w, i) => (
            <div key={i} style={{ flex: 1, minWidth: 56, fontSize: 10, fontWeight: 600, color: "var(--tm)", textAlign: "center" }}>
              {w.getMonth() + 1}/{w.getDate()}
            </div>
          ))}
        </div>
        {products.map(p => {
          const isOpen = expanded[p.id] === true;
          const batches = p.batches || [];
          const batchCount = batches.length;
          const summary = prodGanttProductSummary(batches);
          return (
            <div key={p.id} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, minHeight: 44 }}>
                <button
                  type="button"
                  onClick={() => toggleProduct(p.id)}
                  title={isOpen ? "收起产品" : "展开各批次"}
                  style={{ width: 26, height: 26, flexShrink: 0, background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 11, color: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  {isOpen ? "▼" : "▶"}
                </button>
                <div style={{ width: LABEL_W - 32, flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: "var(--tm)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span>{p.sku || "—"} · {batchCount} 批</span>
                    {summary.shipDate && summary.etaArrival && (
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>{prodGanttFmtShort(summary.shipDate)} → {prodGanttFmtShort(summary.etaArrival)}</span>
                    )}
                    <ProdGanttAlerts excCount={summary.excCount} overdue={summary.overdue} compact />
                  </div>
                </div>
                <div style={{ flex: 1, position: "relative" }}>
                  <TodayLine />
                  <ProdGanttTrack
                    shipDate={summary.shipDate}
                    etaArrival={summary.etaArrival}
                    status={summary.status}
                    label={isOpen ? null : `${batchCount} 批汇总`}
                    excCount={isOpen ? 0 : summary.excCount}
                    overdue={summary.overdue}
                    min={min}
                    totalDays={totalDays}
                    today={today}
                    height={isOpen ? 18 : 44}
                    compact={!isOpen}
                    segments={isOpen ? batches : null}
                    segmentsOnly={isOpen}
                  />
                </div>
              </div>
              {isOpen && batches.map(b => (
                <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, marginLeft: 32 }}>
                  <div style={{ width: LABEL_W - 32, flexShrink: 0, paddingLeft: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.label}>{b.label}</div>
                    <div style={{ fontSize: 9, color: "var(--tm)", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, color: PROD_GANTT_STATUS[b.status]?.color }}>{PROD_GANTT_STATUS[b.status]?.label}</span>
                      {b.sub && <span>· {b.sub}</span>}
                      <ProdGanttAlerts excCount={b.excCount} overdue={b.overdue} compact />
                    </div>
                  </div>
                  <div style={{ flex: 1, position: "relative" }}>
                    <TodayLine />
                    <ProdGanttTrack
                      shipDate={b.shipDate}
                      etaArrival={b.etaArrival}
                      status={b.status}
                      label={b.label}
                      sub={b.sub}
                      excCount={b.excCount}
                      overdue={b.overdue}
                      min={min}
                      totalDays={totalDays}
                      today={today}
                      height={36}
                    />
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ProdGanttCard({ items = [], today: todayProp, productFilter: controlledProductFilter }) {
  const saved = loadProdGanttFilters();
  const isProductControlled = controlledProductFilter !== undefined;
  const [internalProductFilter, setInternalProductFilter] = useState(saved.productFilter);
  const productFilter = isProductControlled ? controlledProductFilter : internalProductFilter;
  const [statusFilter, setStatusFilter] = useState(saved.statusFilter);
  const [sortBy, setSortBy] = useState(saved.sortBy);

  useEffect(() => {
    if (isProductControlled) {
      const prev = loadProdGanttFilters();
      saveProdGanttFilters({ ...prev, statusFilter, sortBy });
    } else {
      saveProdGanttFilters({ productFilter, statusFilter, sortBy });
    }
  }, [productFilter, statusFilter, sortBy, isProductControlled]);

  const today = useMemo(() => {
    const d = todayProp ? new Date(todayProp) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [todayProp]);

  const allProducts = useMemo(() => productionItemsToGanttProducts(items), [items]);
  const viewProducts = useMemo(
    () => prodApplyGanttView(allProducts, { productFilter, statusFilter, sortBy }),
    [allProducts, productFilter, statusFilter, sortBy]
  );

  useEffect(() => {
    if (isProductControlled || productFilter === "all" || allProducts.some(p => p.id === productFilter)) return;
    setInternalProductFilter("all");
  }, [allProducts, productFilter, isProductControlled]);

  const chartRef = useRef(null);
  const datedBatchCount = viewProducts.reduce(
    (n, p) => n + (p.batches || []).filter(b => b.shipDate || b.etaArrival).length,
    0
  );
  const hasFilters = (!isProductControlled && productFilter !== "all") || statusFilter !== "all";

  const setProduct = (id) => { if (!isProductControlled) setInternalProductFilter(id); };
  const setStatus = (key) => setStatusFilter(key);
  const resetFilters = () => {
    if (!isProductControlled) setInternalProductFilter("all");
    setStatusFilter("all");
  };

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>精品生产看板</div>
          <div style={{ fontSize: 11, color: "var(--tm)", marginTop: 2 }}>
            甘特时间轴 · 自动同步下方生产批次
            {allProducts.length > 0 && (
              <span> · {viewProducts.length}/{allProducts.length} 个产品 · 每批次独立一行</span>
            )}
          </div>
        </div>
        <button type="button" onClick={() => prodGanttCaptureScreenshot(chartRef.current).catch(() => alert("截图失败，请重试"))} style={PROD_GANTT_BTN_PRIMARY}>📷 截图</button>
      </div>

      {allProducts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {!isProductControlled && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--tm)", flexShrink: 0 }}>产品</span>
              <button type="button" onClick={() => setProduct("all")} style={prodGanttFilterChip(productFilter === "all")}>全部</button>
              {allProducts.map(p => (
                <button key={p.id} type="button" onClick={() => setProduct(p.id)} style={prodGanttFilterChip(productFilter === p.id)} title={p.name}>
                  {p.sku || p.name}{p.batches?.length > 1 ? ` (${p.batches.length})` : ""}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--tm)", flexShrink: 0 }}>状态</span>
            <button type="button" onClick={() => setStatus("all")} style={prodGanttFilterChip(statusFilter === "all")}>全部</button>
            {Object.entries(PROD_GANTT_STATUS).map(([k, v]) => (
              <button key={k} type="button" onClick={() => setStatus(k)} style={prodGanttFilterChip(statusFilter === k)}>{v.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--tm)", flexShrink: 0 }}>排序</span>
            {PROD_GANTT_SORT_OPTIONS.map(o => (
              <button key={o.key} type="button" onClick={() => setSortBy(o.key)} style={prodGanttFilterChip(sortBy === o.key)}>{o.label}</button>
            ))}
            {hasFilters && (
              <button type="button" onClick={resetFilters} style={{ ...prodGanttFilterChip(false), marginLeft: 4, color: "#2d7dd2", borderColor: "#b8d4f0" }}>清除筛选</button>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {Object.entries(PROD_GANTT_STATUS).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: v.color, fontWeight: 600 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: v.bg, border: `2px solid ${v.border}` }} />
            {v.label}
          </div>
        ))}
        <span style={{ fontSize: 10, color: "#E24B4A", fontWeight: 600 }}>| 逾期红框</span>
        <span style={{ fontSize: 10, color: "#b45309", fontWeight: 600 }}>⚠ 异常</span>
      </div>
      <div ref={chartRef}>
        {!allProducts.length ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--tm)", fontSize: 13 }}>暂无批次，请先在下方「+ 新建批次」</div>
        ) : !viewProducts.length ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--tm)", fontSize: 13 }}>
            没有符合筛选条件的产品
            <button type="button" onClick={resetFilters} style={{ display: "block", margin: "8px auto 0", background: "none", border: "none", color: "#2d7dd2", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>清除筛选</button>
          </div>
        ) : datedBatchCount === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--tm)", fontSize: 13 }}>当前产品暂无日期数据，请在下方的批次中填写下单日期或预计交期</div>
        ) : (
          <ProdGanttTimeline products={viewProducts} today={today} />
        )}
      </div>
    </div>
  );
}

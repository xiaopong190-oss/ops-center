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

/** 将下方生产批次转为甘特产品行（按产品编号 + 款式聚合） */
export function productionItemsToGanttProducts(items) {
  if (!Array.isArray(items) || !items.length) return [];
  const byKey = new Map();
  for (const b of items) {
    const key = `${b.product || "未命名"}::${b.name || ""}`.trim();
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: key,
        name: [b.product, b.name].filter(Boolean).join(" ") || "未命名",
        sku: b.product || "",
        batches: [],
      });
    }
    byKey.get(key).batches.push({
      id: b.id,
      label: b.batch || "批次",
      status: batchToGanttStatus(b),
      shipDate: b.orderDate || "",
      etaArrival: b.actualDelivery || b.etaDelivery || b.etaShip || "",
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
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

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

function ProdGanttTimeline({ products, today, statusMap }) {
  const { min, totalDays, weeks } = useMemo(() => {
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
    return { min: minD, max: maxD, totalDays, weeks };
  }, [products, today]);

  const todayPct = ((today - min) / 86400000 / totalDays) * 100;

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 640 }}>
        <div style={{ display: "flex", marginLeft: 140, borderBottom: "1px solid var(--border)", paddingBottom: 6, marginBottom: 8 }}>
          {weeks.map((w, i) => (
            <div key={i} style={{ flex: 1, minWidth: 56, fontSize: 10, color: "var(--tm)", textAlign: "center" }}>
              {w.getMonth() + 1}/{w.getDate()}
            </div>
          ))}
        </div>
        {products.map(p => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", marginBottom: 10, minHeight: 36 }}>
            <div style={{ width: 132, flexShrink: 0, paddingRight: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
              {p.sku && <div style={{ fontSize: 10, color: "var(--tm)" }}>{p.sku}</div>}
            </div>
            <div style={{ flex: 1, position: "relative", height: 28, background: "var(--bg)", borderRadius: 6, border: "1px solid var(--border)" }}>
              {todayPct >= 0 && todayPct <= 100 && (
                <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, width: 2, background: "#E24B4A", opacity: 0.7, zIndex: 2 }} title="今天" />
              )}
              {(p.batches || []).map(b => {
                const start = prodGanttParseD(b.shipDate) || prodGanttParseD(b.etaArrival);
                const end = prodGanttParseD(b.etaArrival) || prodGanttParseD(b.shipDate);
                if (!start || !end) return null;
                const s = start < end ? start : end;
                const e = start < end ? end : start;
                const left = ((s - min) / 86400000 / totalDays) * 100;
                const width = Math.max(2, ((e - s) / 86400000 / totalDays) * 100);
                const st = statusMap[b.status] || statusMap.setup;
                return (
                  <div
                    key={b.id}
                    title={`${b.label} · ${st.label} · ${prodGanttFmtShort(s)}–${prodGanttFmtShort(e)}`}
                    style={{
                      position: "absolute",
                      left: `${left}%`,
                      width: `${width}%`,
                      top: 4,
                      bottom: 4,
                      background: st.bg,
                      border: `1px solid ${st.border}`,
                      borderRadius: 4,
                      display: "flex",
                      alignItems: "center",
                      padding: "0 6px",
                      fontSize: 10,
                      fontWeight: 600,
                      color: st.color,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      zIndex: 1,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot, marginRight: 4, flexShrink: 0 }} />
                    {b.label}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProdGanttCard({ items = [], today: todayProp }) {
  const saved = loadProdGanttFilters();
  const [productFilter, setProductFilter] = useState(saved.productFilter);
  const [statusFilter, setStatusFilter] = useState(saved.statusFilter);
  const [sortBy, setSortBy] = useState(saved.sortBy);

  useEffect(() => {
    saveProdGanttFilters({ productFilter, statusFilter, sortBy });
  }, [productFilter, statusFilter, sortBy]);

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
    if (productFilter !== "all" && !allProducts.some(p => p.id === productFilter)) {
      setProductFilter("all");
    }
  }, [allProducts, productFilter]);

  const chartRef = useRef(null);
  const datedBatchCount = viewProducts.reduce(
    (n, p) => n + (p.batches || []).filter(b => b.shipDate || b.etaArrival).length,
    0
  );
  const hasFilters = productFilter !== "all" || statusFilter !== "all";

  const setProduct = (id) => setProductFilter(id);
  const setStatus = (key) => setStatusFilter(key);
  const resetFilters = () => { setProductFilter("all"); setStatusFilter("all"); };

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>精品生产看板</div>
          <div style={{ fontSize: 11, color: "var(--tm)", marginTop: 2 }}>
            甘特时间轴 · 自动同步下方生产批次
            {allProducts.length > 0 && (
              <span> · 显示 {viewProducts.length}/{allProducts.length} 个产品</span>
            )}
          </div>
        </div>
        <button type="button" onClick={() => prodGanttCaptureScreenshot(chartRef.current).catch(() => alert("截图失败，请重试"))} style={PROD_GANTT_BTN_PRIMARY}>📷 截图</button>
      </div>

      {allProducts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--tm)", flexShrink: 0 }}>产品</span>
            <button type="button" onClick={() => setProduct("all")} style={prodGanttFilterChip(productFilter === "all")}>全部</button>
            {allProducts.map(p => (
              <button key={p.id} type="button" onClick={() => setProduct(p.id)} style={prodGanttFilterChip(productFilter === p.id)} title={p.name}>
                {p.sku || p.name}{p.batches?.length > 1 ? ` (${p.batches.length})` : ""}
              </button>
            ))}
          </div>
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

      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        {Object.entries(PROD_GANTT_STATUS).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: v.color }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: v.dot }} />
            {v.label}
          </div>
        ))}
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
          <ProdGanttTimeline products={viewProducts} today={today} statusMap={PROD_GANTT_STATUS} />
        )}
      </div>
    </div>
  );
}

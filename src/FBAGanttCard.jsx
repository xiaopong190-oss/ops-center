import { useRef, useMemo, useState, useEffect } from "react";

const STATUS = {
  pending: { label: "待发货", color: "#5F5E5A", bg: "#F4F3EF", dot: "#888780", border: "#C8C6BC" },
  transit: { label: "运输中", color: "#185FA5", bg: "#EBF4FD", dot: "#378ADD", border: "#85B7EB" },
  arrived: { label: "已到达", color: "#0F6E56", bg: "#E5F6F0", dot: "#0F6E56", border: "#86efac" },
  receiving: { label: "接收中", color: "#1a9e8a", bg: "#d1fae5", dot: "#1a9e8a", border: "#5eead4" },
  done: { label: "已完成", color: "#2d9e52", bg: "#d4f0dc", dot: "#2d9e52", border: "#86efac" },
};

const SORT_OPTIONS = [
  { key: "name", label: "产品名称" },
  { key: "shipDate", label: "最近出货" },
  { key: "etaArrival", label: "预计到港" },
  { key: "batches", label: "批次数" },
];

const GANTT_FILTER_KEY = "ops-gantt-filters";

const BTN_PRIMARY = {
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

const filterChip = (active) => ({
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

function loadGanttFilters() {
  try {
    const raw = sessionStorage.getItem(GANTT_FILTER_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === "object") {
        return {
          productFilter: typeof p.productFilter === "string" ? p.productFilter : "all",
          statusFilter: typeof p.statusFilter === "string" ? p.statusFilter : "all",
          sortBy: SORT_OPTIONS.some(o => o.key === p.sortBy) ? p.sortBy : "name",
        };
      }
    }
  } catch { /* ignore */ }
  return { productFilter: "all", statusFilter: "all", sortBy: "name" };
}

function saveGanttFilters(filters) {
  try { sessionStorage.setItem(GANTT_FILTER_KEY, JSON.stringify(filters)); } catch { /* ignore */ }
}

const ganttBatchAllDone = (g) => (g.fbaShipments || []).length > 0 && (g.fbaShipments || []).every(s => s.status === "已完成");
const ganttBatchReceiving = (g) => (g.fbaShipments || []).some(s => s.status === "接收中");

function groupToGanttStatus(g) {
  if (ganttBatchAllDone(g)) return "done";
  if (ganttBatchReceiving(g)) return "receiving";
  if (g.headStatus === "已到港") return "arrived";
  if (g.headStatus === "已出港" || g.headStatus === "在途") return "transit";
  return "pending";
}

function productDisplayName(name, sku) {
  if (!sku) return name || "未命名";
  if (!name || name === sku) return sku;
  let rest = name.startsWith(sku) ? name.slice(sku.length) : name;
  rest = rest.replace(/第[一二三四五六七八九十\d]+批/g, "").trim();
  return rest ? `${sku} ${rest}` : sku;
}

function batchLabel(name, sku) {
  if (!name) return "批次";
  if (sku && name.startsWith(sku)) {
    const rest = name.slice(sku.length).trim();
    return rest || name;
  }
  return name;
}

/** 将下方发货批次列表转为甘特图产品行（按 SKU 聚合） */
export function logisticsGroupsToGanttProducts(groups) {
  if (!Array.isArray(groups) || !groups.length) return [];
  const byKey = new Map();
  for (const g of groups) {
    const key = (g.sku || g.name || `id-${g.id}`).trim();
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: key,
        name: productDisplayName(g.name, g.sku),
        sku: g.sku || "",
        batches: [],
      });
    }
    byKey.get(key).batches.push({
      id: g.id,
      label: batchLabel(g.name, g.sku),
      status: groupToGanttStatus(g),
      shipDate: g.shipDate || g.etaDeparture || "",
      etaArrival: g.etaArrival || "",
    });
  }
  return Array.from(byKey.values());
}

const parseD = (s) => {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

const fmtShort = (d) => {
  if (!d) return "—";
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

function applyGanttView(products, { productFilter, statusFilter, sortBy }) {
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

  const shipKey = (p) => {
    const times = (p.batches || []).map(b => parseD(b.shipDate)?.getTime()).filter(Boolean);
    return times.length ? Math.max(...times) : 0;
  };
  const etaKey = (p) => {
    const times = (p.batches || []).map(b => parseD(b.etaArrival)?.getTime()).filter(Boolean);
    return times.length ? Math.min(...times) : Infinity;
  };

  list.sort((a, b) => {
    if (sortBy === "shipDate") return shipKey(b) - shipKey(a);
    if (sortBy === "etaArrival") return etaKey(a) - etaKey(b);
    if (sortBy === "batches") return (b.batches?.length || 0) - (a.batches?.length || 0);
    return String(a.name).localeCompare(String(b.name), "zh");
  });

  return list;
}

async function captureScreenshot(el) {
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
      a.download = `fba-gantt-${new Date().toISOString().slice(0, 10)}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      resolve();
    };
    img.onerror = reject;
    img.src = url;
  });
}

function GanttTimeline({ products, today }) {
  const { min, totalDays, weeks } = useMemo(() => {
    let minD = new Date(today);
    let maxD = new Date(today);
    products.forEach(p => {
      (p.batches || []).forEach(b => {
        [b.shipDate, b.etaArrival].forEach(s => {
          const d = parseD(s);
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
                const start = parseD(b.shipDate) || parseD(b.etaArrival);
                const end = parseD(b.etaArrival) || parseD(b.shipDate);
                if (!start || !end) return null;
                const s = start < end ? start : end;
                const e = start < end ? end : start;
                const left = ((s - min) / 86400000 / totalDays) * 100;
                const width = Math.max(2, ((e - s) / 86400000 / totalDays) * 100);
                const st = STATUS[b.status] || STATUS.pending;
                return (
                  <div
                    key={b.id}
                    title={`${b.label} · ${st.label} · ${fmtShort(s)}–${fmtShort(e)}`}
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

export default function FBAGanttCard({ groups = [], today: todayProp }) {
  const saved = loadGanttFilters();
  const [productFilter, setProductFilter] = useState(saved.productFilter);
  const [statusFilter, setStatusFilter] = useState(saved.statusFilter);
  const [sortBy, setSortBy] = useState(saved.sortBy);

  useEffect(() => {
    saveGanttFilters({ productFilter, statusFilter, sortBy });
  }, [productFilter, statusFilter, sortBy]);

  const today = useMemo(() => {
    const d = todayProp ? new Date(todayProp) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [todayProp]);

  const allProducts = useMemo(() => logisticsGroupsToGanttProducts(groups), [groups]);
  const viewProducts = useMemo(
    () => applyGanttView(allProducts, { productFilter, statusFilter, sortBy }),
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
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>FBA 物流看板</div>
          <div style={{ fontSize: 11, color: "var(--tm)", marginTop: 2 }}>
            甘特时间轴 · 自动同步下方发货批次
            {allProducts.length > 0 && (
              <span> · 显示 {viewProducts.length}/{allProducts.length} 个产品</span>
            )}
          </div>
        </div>
        <button type="button" onClick={() => captureScreenshot(chartRef.current).catch(() => alert("截图失败，请重试"))} style={BTN_PRIMARY}>📷 截图</button>
      </div>

      {allProducts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--tm)", flexShrink: 0 }}>产品</span>
            <button type="button" onClick={() => setProduct("all")} style={filterChip(productFilter === "all")}>全部</button>
            {allProducts.map(p => (
              <button key={p.id} type="button" onClick={() => setProduct(p.id)} style={filterChip(productFilter === p.id)} title={p.name}>
                {p.sku || p.name}{p.batches?.length > 1 ? ` (${p.batches.length})` : ""}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--tm)", flexShrink: 0 }}>状态</span>
            <button type="button" onClick={() => setStatus("all")} style={filterChip(statusFilter === "all")}>全部</button>
            {Object.entries(STATUS).map(([k, v]) => (
              <button key={k} type="button" onClick={() => setStatus(k)} style={filterChip(statusFilter === k)}>{v.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--tm)", flexShrink: 0 }}>排序</span>
            {SORT_OPTIONS.map(o => (
              <button key={o.key} type="button" onClick={() => setSortBy(o.key)} style={filterChip(sortBy === o.key)}>{o.label}</button>
            ))}
            {hasFilters && (
              <button type="button" onClick={resetFilters} style={{ ...filterChip(false), marginLeft: 4, color: "#2d7dd2", borderColor: "#b8d4f0" }}>清除筛选</button>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        {Object.entries(STATUS).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: v.color }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: v.dot }} />
            {v.label}
          </div>
        ))}
      </div>
      <div ref={chartRef}>
        {!allProducts.length ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--tm)", fontSize: 13 }}>暂无批次，请先在下方「导入 CSV」或「+ 新建批次」</div>
        ) : !viewProducts.length ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--tm)", fontSize: 13 }}>
            没有符合筛选条件的产品
            <button type="button" onClick={resetFilters} style={{ display: "block", margin: "8px auto 0", background: "none", border: "none", color: "#2d7dd2", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>清除筛选</button>
          </div>
        ) : datedBatchCount === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--tm)", fontSize: 13 }}>当前产品暂无日期数据，请在下方的批次中填写出货日或预计到港</div>
        ) : (
          <GanttTimeline products={viewProducts} today={today} />
        )}
      </div>
    </div>
  );
}

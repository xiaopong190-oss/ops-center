import { useRef, useMemo, useState, useEffect } from "react";

const STATUS = {
  pending: { label: "待发货", color: "#4b5563", bg: "#e5e7eb", dot: "#6b7280", border: "#9ca3af" },
  transit: { label: "运输中", color: "#1a4e8a", bg: "#bfdbfe", dot: "#2563eb", border: "#60a5fa" },
  arrived: { label: "已到达", color: "#065f46", bg: "#6ee7b7", dot: "#059669", border: "#34d399" },
  receiving: { label: "接收中", color: "#0f766e", bg: "#99f6e4", dot: "#14b8a6", border: "#2dd4bf" },
  done: { label: "已完成", color: "#166534", bg: "#86efac", dot: "#22c55e", border: "#4ade80" },
};
const GANTT_TRACKING_CHECK_STAGES = ["已入仓", "清关中", "已起运 (开船/起飞)", "在途"];
const GANTT_ARRIVED_STAGES = ["到港", "上架中", "完成"];

const SORT_OPTIONS = [
  { key: "name", label: "产品名称" },
  { key: "shipDate", label: "最近出货" },
  { key: "etaArrival", label: "预计到港" },
  { key: "batches", label: "批次数" },
];

const GANTT_FILTER_KEY = "ops-gantt-filters";
const GANTT_EXPAND_KEY = "ops-gantt-expanded";

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

function loadGanttExpanded() {
  try {
    const raw = sessionStorage.getItem(GANTT_EXPAND_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === "object") return p;
    }
  } catch { /* ignore */ }
  return {};
}

function saveGanttExpanded(state) {
  try { sessionStorage.setItem(GANTT_EXPAND_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

function groupToGanttStatus(g) {
  const fbas = g.fbaShipments || [];
  if (!fbas.length) return "pending";
  const statuses = fbas.map(f => fbaToGanttStatus(f));
  if (statuses.every(s => s === "done")) return "done";
  if (statuses.some(s => s === "receiving")) return "receiving";
  if (statuses.some(s => s === "arrived")) return "arrived";
  if (statuses.some(s => s === "transit")) return "transit";
  return "pending";
}

function fbaMissingTrack(f) {
  const st = ganttNorm(f.status);
  return GANTT_TRACKING_CHECK_STAGES.includes(st) && !(f.tracking || "").trim();
}

function batchGanttMeta(g, today) {
  const fbas = g.fbaShipments || [];
  let excCount = (g.exceptions || []).filter(e => !e.resolved).length;
  fbas.forEach(f => { excCount += (f.exceptions || []).filter(e => !e.resolved).length; });
  const missingTrack = fbas.some(fbaMissingTrack);
  const overdue = fbas.some(f => {
    const eta = parseD(f.etaArrival || g.etaArrival || f.windowEnd);
    if (!eta) return false;
    return eta < today && !GANTT_ARRIVED_STAGES.includes(ganttNorm(f.status));
  }) || (() => {
    const eta = parseD(g.etaArrival);
    return eta && eta < today && fbas.length === 0;
  })();
  return { excCount, missingTrack, overdue };
}

function dominantStatus(statuses) {
  const order = ["pending", "transit", "arrived", "receiving", "done"];
  if (!statuses.length) return "pending";
  if (statuses.every(s => s === "done")) return "done";
  for (let i = order.length - 2; i >= 0; i--) {
    if (statuses.some(s => s === order[i])) return order[i];
  }
  return "pending";
}

function productGanttSummary(batches) {
  const ships = batches.map(b => parseD(b.shipDate)).filter(Boolean);
  const etas = batches.map(b => parseD(b.etaArrival)).filter(Boolean);
  return {
    shipDate: ships.length ? new Date(Math.min(...ships.map(d => d.getTime()))).toISOString().slice(0, 10) : "",
    etaArrival: etas.length ? new Date(Math.max(...etas.map(d => d.getTime()))).toISOString().slice(0, 10) : "",
    status: dominantStatus(batches.map(b => b.status)),
    excCount: batches.reduce((s, b) => s + (b.excCount || 0), 0),
    overdue: batches.some(b => b.overdue),
    missingTrack: batches.some(b => b.missingTrack),
    batchCount: batches.length,
  };
}

const GANTT_STAGE_MAP = {
  备货中: "待出库", 准备发货: "待出库", 已发货: "已入仓", 已出港: "已起运 (开船/起飞)",
  运输中: "在途", 已到港: "到港", 接收中: "上架中", 已完成: "完成",
};
const ganttNorm = (s) => GANTT_STAGE_MAP[s] || s;
const GANTT_TRANSIT_STAGES = ["清关中", "已起运 (开船/起飞)", "在途"];

function fbaToGanttStatus(fba) {
  const st = ganttNorm(fba.status);
  if (st === "完成") return "done";
  if (st === "上架中") return "receiving";
  if (st === "到港") return "arrived";
  if (GANTT_TRANSIT_STAGES.includes(st)) return "transit";
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

const parseD = (s) => {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

/** 按 SKU 聚合产品，每个发货批次占甘特图一行（避免同产品多批次重叠） */
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
    const fbas = g.fbaShipments || [];
    const shipCandidates = [g.shipDate, g.etaDeparture, ...fbas.map(f => f.etaDeparture || g.shipDate || g.etaDeparture)].filter(Boolean);
    const etaCandidates = [g.etaArrival, ...fbas.map(f => f.etaArrival || g.etaArrival || f.windowEnd)].filter(Boolean);
    const shipDate = shipCandidates.sort()[0] || "";
    const etaArrival = etaCandidates.sort().slice(-1)[0] || "";
    const todayNorm = new Date();
    todayNorm.setHours(0, 0, 0, 0);
    const meta = batchGanttMeta(g, todayNorm);
    const label = batchLabel(g.name, g.sku);
    byKey.get(key).batches.push({
      id: `g-${g.id}`,
      label,
      status: groupToGanttStatus(g),
      shipDate,
      etaArrival,
      fbaCount: fbas.length,
      sub: fbas.length > 1 ? `${fbas.length} 个货件` : (fbas[0]?.warehouse || ""),
      excCount: meta.excCount,
      overdue: meta.overdue,
      missingTrack: meta.missingTrack,
    });
  }
  for (const p of byKey.values()) {
    p.batches.sort((a, b) => {
      const ta = parseD(a.shipDate)?.getTime() || 0;
      const tb = parseD(b.shipDate)?.getTime() || 0;
      return tb - ta;
    });
  }
  return Array.from(byKey.values());
}

const fmtShort = (d) => {
  if (!d) return "—";
  if (typeof d === "string") {
    const p = parseD(d);
    if (!p) return "—";
    return `${p.getMonth() + 1}/${p.getDate()}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

function calcBarPos(shipDate, etaArrival, min, totalDays) {
  const start = parseD(shipDate) || parseD(etaArrival);
  const end = parseD(etaArrival) || parseD(shipDate);
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

function GanttAlerts({ excCount, overdue, missingTrack, compact }) {
  const items = [];
  if (overdue) items.push({ t: "逾期", c: "#E24B4A", bg: "#fee2e2" });
  if (excCount > 0) items.push({ t: `⚠${excCount}`, c: "#b45309", bg: "#fff0d4" });
  if (missingTrack) items.push({ t: "缺追踪", c: "#b91c1c", bg: "#fee2e2" });
  if (!items.length) return null;
  return (
    <span style={{ display: "inline-flex", gap: compact ? 3 : 4, flexShrink: 0 }}>
      {items.map(it => (
        <span key={it.t} style={{ fontSize: compact ? 9 : 10, fontWeight: 700, padding: compact ? "1px 5px" : "2px 6px", borderRadius: 10, background: it.bg, color: it.c, whiteSpace: "nowrap" }}>{it.t}</span>
      ))}
    </span>
  );
}

function GanttTrack({ shipDate, etaArrival, status, label, sub, excCount, overdue, missingTrack, min, totalDays, today, height = 40, compact = false, segments, segmentsOnly = false }) {
  const pos = calcBarPos(shipDate, etaArrival, min, totalDays);
  const st = STATUS[status] || STATUS.pending;
  const trackH = height;

  if (segmentsOnly && segments?.length) {
    return (
      <div style={{ flex: 1, position: "relative", height: trackH, background: "#f3f4f6", borderRadius: 8, border: "1px solid #e5e7eb" }}>
        {segments.map(seg => {
          const sp = calcBarPos(seg.shipDate, seg.etaArrival, min, totalDays);
          if (!sp) return null;
          const ss = STATUS[seg.status] || STATUS.pending;
          return (
            <div
              key={seg.id}
              title={`${seg.label} · ${ss.label} · ${fmtShort(seg.shipDate)}→${fmtShort(seg.etaArrival)}`}
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
        title={`${label || ""} ${fmtShort(pos.start)} → ${fmtShort(pos.end)} · ${st.label}`}
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
          {fmtShort(pos.start)}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, flex: 1, justifyContent: "center" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.dot, flexShrink: 0, boxShadow: `0 0 0 2px ${st.bg}` }} />
          {label && <span style={{ fontSize: compact ? 10 : 11, fontWeight: 700, color: st.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>}
          {sub && !compact && <span style={{ fontSize: 9, color: st.color, opacity: 0.8, flexShrink: 0 }}>{sub}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <GanttAlerts excCount={excCount} overdue={overdue} missingTrack={missingTrack} compact={compact} />
          <span style={{ fontSize: compact ? 9 : 10, fontWeight: 700, color: st.color, background: "rgba(255,255,255,0.7)", padding: "1px 4px", borderRadius: 4 }}>
            {fmtShort(pos.end)}
          </span>
        </div>
        {todayPctInBar != null && (
          <div style={{ position: "absolute", left: `${todayPctInBar}%`, top: -3, bottom: -3, width: 3, background: "#E24B4A", borderRadius: 2, zIndex: 2, pointerEvents: "none" }} title="今天" />
        )}
      </div>
      {segments?.map(seg => {
        const sp = calcBarPos(seg.shipDate, seg.etaArrival, min, totalDays);
        if (!sp) return null;
        const ss = STATUS[seg.status] || STATUS.pending;
        return (
          <div
            key={seg.id}
            title={`${seg.label} · ${ss.label}`}
            style={{
              position: "absolute",
              left: `${sp.left}%`,
              width: `${sp.width}%`,
              top: "50%",
              height: 6,
              marginTop: -3,
              background: ss.dot,
              borderRadius: 3,
              opacity: 0.85,
              pointerEvents: "none",
            }}
          />
        );
      })}
    </div>
  );
}

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
  const [expanded, setExpanded] = useState(loadGanttExpanded);

  useEffect(() => {
    saveGanttExpanded(expanded);
  }, [expanded]);

  const toggleProduct = (id) => setExpanded(prev => ({ ...prev, [id]: prev[id] === false }));

  const { min, totalDays, weeks, todayPct } = useMemo(() => {
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
          const isOpen = expanded[p.id] !== false;
          const batches = p.batches || [];
          const batchCount = batches.length;
          const summary = productGanttSummary(batches);
          return (
            <div key={p.id} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, minHeight: 44 }}>
                <button
                  type="button"
                  onClick={() => toggleProduct(p.id)}
                  title={isOpen ? "收起产品" : "展开产品"}
                  style={{ width: 26, height: 26, flexShrink: 0, background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 11, color: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  {isOpen ? "▼" : "▶"}
                </button>
                <div style={{ width: LABEL_W - 32, flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: "var(--tm)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span>{p.sku || "—"} · {batchCount} 批</span>
                    {summary.shipDate && summary.etaArrival && (
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>{fmtShort(summary.shipDate)} → {fmtShort(summary.etaArrival)}</span>
                    )}
                    <GanttAlerts excCount={summary.excCount} overdue={summary.overdue} missingTrack={summary.missingTrack} compact />
                  </div>
                </div>
                <div style={{ flex: 1, position: "relative" }}>
                  <TodayLine />
                  <GanttTrack
                    shipDate={summary.shipDate}
                    etaArrival={summary.etaArrival}
                    status={summary.status}
                    label={isOpen ? null : `${batchCount} 批汇总`}
                    excCount={isOpen ? 0 : summary.excCount}
                    overdue={summary.overdue}
                    missingTrack={isOpen ? false : summary.missingTrack}
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
                      <span style={{ fontWeight: 600, color: STATUS[b.status]?.color }}>{STATUS[b.status]?.label}</span>
                      {b.sub && <span>· {b.sub}</span>}
                      <GanttAlerts excCount={b.excCount} overdue={b.overdue} missingTrack={b.missingTrack} compact />
                    </div>
                  </div>
                  <div style={{ flex: 1, position: "relative" }}>
                    <TodayLine />
                    <GanttTrack
                      shipDate={b.shipDate}
                      etaArrival={b.etaArrival}
                      status={b.status}
                      label={b.label}
                      sub={b.sub}
                      excCount={b.excCount}
                      overdue={b.overdue}
                      missingTrack={b.missingTrack}
                      min={min}
                      totalDays={totalDays}
                      today={today}
                      height={44}
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
              <span> · {viewProducts.length}/{allProducts.length} 个产品 · 每批次独立一行</span>
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

      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {Object.entries(STATUS).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: v.color, fontWeight: 600 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: v.bg, border: `2px solid ${v.border}` }} />
            {v.label}
          </div>
        ))}
        <span style={{ fontSize: 10, color: "#E24B4A", fontWeight: 600 }}>| 逾期红框</span>
        <span style={{ fontSize: 10, color: "#b45309", fontWeight: 600 }}>⚠ 异常</span>
        <span style={{ fontSize: 10, color: "#b91c1c", fontWeight: 600 }}>缺追踪</span>
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

import { useState, useRef, useEffect } from "react";
import { OwnerField, ownerFilterEntries, RoleBadge, getStaffRole } from "./GlobalConfig.jsx";
import { useSharedList, formatSharedTime } from "./utils/storage.js";
import { useCloudSyncPage } from "./GlobalCloudSync.jsx";
import FBAGanttCard from "./FBAGanttCard.jsx";

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const fmtD = (d) => { if (!d) return "—"; const p = d.split("-"); return p[1] + "/" + p[2]; };
const daysDiff = (due) => { if (!due) return null; const d = new Date(due); d.setHours(0, 0, 0, 0); return Math.round((d - TODAY) / 86400000); };
const badge = (bg, color, extra = {}) => ({ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: bg, color, fontWeight: 500, whiteSpace: "nowrap", ...extra });
const lbl = { display: "block", fontSize: 11, color: "var(--tm)", marginBottom: 3, fontWeight: 500 };
const inp = { width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", background: "transparent", color: "inherit", display: "block" };
const inpSm = { fontSize: 12, padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 6, fontFamily: "inherit", background: "transparent", color: "inherit" };
const AVATAR_PALETTE = [["#dbeafe", "#1e3a8a"], ["#d1fae5", "#065f46"], ["#fef3c7", "#78350f"], ["#ede9fe", "#4c1d95"], ["#fce7f3", "#831843"], ["#fee2e2", "#7f1d1d"], ["#d1fae5", "#064e3b"], ["#fef9c3", "#713f12"]];
const strHash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % AVATAR_PALETTE.length; return h; };
const Avatar = ({ name, size = 24 }) => {
  const [bg, tx] = AVATAR_PALETTE[strHash(name || "?")];
  return (<div style={{ width: size, height: size, borderRadius: "50%", background: bg, color: tx, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.42, fontWeight: 700, flexShrink: 0 }}>{(name || "?").slice(0, 1)}</div>);
};

const LOG_EXPAND_KEY = "ops-logistics-expanded";
const LOG_FILTER_KEY = "ops-logistics-filters";
let logisticsExpandedCache = null;

function isPlainObj(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function loadExpandedState() {
  if (isPlainObj(logisticsExpandedCache)) return { ...logisticsExpandedCache };
  try {
    const raw = localStorage.getItem(LOG_EXPAND_KEY) || sessionStorage.getItem(LOG_EXPAND_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isPlainObj(parsed)) {
        logisticsExpandedCache = parsed;
        return { ...logisticsExpandedCache };
      }
    }
  } catch { /* ignore */ }
  logisticsExpandedCache = { 1: true };
  return { ...logisticsExpandedCache };
}

function saveExpandedState(state) {
  logisticsExpandedCache = { ...state };
  try {
    const json = JSON.stringify(logisticsExpandedCache);
    localStorage.setItem(LOG_EXPAND_KEY, json);
    sessionStorage.setItem(LOG_EXPAND_KEY, json);
  } catch { /* ignore */ }
}

function loadLogisticsFilters() {
  try {
    const raw = sessionStorage.getItem(LOG_FILTER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isPlainObj(parsed)) {
        return {
          filter: typeof parsed.filter === "string" ? parsed.filter : "all",
          ownerFilter: typeof parsed.ownerFilter === "string" ? parsed.ownerFilter : "all",
        };
      }
    }
  } catch { /* ignore */ }
  return { filter: "all", ownerFilter: "all" };
}

function saveLogisticsFilters(filters) {
  try { sessionStorage.setItem(LOG_FILTER_KEY, JSON.stringify(filters)); } catch { /* ignore */ }
}

function isBatchExpanded(expanded, id) {
  if (!isPlainObj(expanded)) return Number(id) === 1;
  const key = String(id);
  if (Object.prototype.hasOwnProperty.call(expanded, key)) return expanded[key] === true;
  if (Object.prototype.hasOwnProperty.call(expanded, id)) return expanded[id] === true;
  return Number(id) === 1;
}

// ─── LOGISTICS MODULE (Shipment Group + FBA) ─────────────────────────
/** 头程状态与 FBA 货件状态共用 */
const SHIPMENT_STAGES = ["待出库", "已入仓", "清关中", "已起运 (开船/起飞)", "在途", "到港", "上架中", "完成"];
const LEGACY_STAGE_MAP = {
  备货中: "待出库", 准备发货: "待出库",
  已发货: "已入仓", 已出港: "已起运 (开船/起飞)",
  运输中: "在途", 已到港: "到港", 接收中: "上架中", 已完成: "完成",
};
const DEFAULT_SHIPMENT_STAGE = "待出库";
const normalizeShipmentStage = (s) => LEGACY_STAGE_MAP[s] || (SHIPMENT_STAGES.includes(s) ? s : DEFAULT_SHIPMENT_STAGE);
const stageColor = (s) => ({
  待出库: "#9ca3af", 已入仓: "#6b7280", "已起运 (开船/起飞)": "#5b6abf", 清关中: "#7a6dd2",
  在途: "#2d7dd2", 到港: "#1a9e8a", 上架中: "#7a6dd2", 完成: "#2d9e52",
}[normalizeShipmentStage(s)] || "#888");
const STAGE_STYLE = {
  缺少追踪编码: { bg: "#fee2e2", c: "#E24B4A" },
  待出库: { bg: "#f3f4f6", c: "#6b7280" },
  已入仓: { bg: "#e5e7eb", c: "#4b5563" },
  "已起运 (开船/起飞)": { bg: "#e0e7ff", c: "#3730a3" },
  清关中: { bg: "#ede9fe", c: "#5b21b6" },
  在途: { bg: "#dceeff", c: "#2d7dd2" },
  到港: { bg: "#d1fae5", c: "#1a9e8a" },
  上架中: { bg: "#ede9fe", c: "#6b21a8" },
  完成: { bg: "#d4f0dc", c: "#2d9e52" },
};
const TRACKING_CHECK_STAGES = ["已入仓", "清关中", "已起运 (开船/起飞)", "在途"];
const HEAD_TRANSIT_STAGES = ["清关中", "已起运 (开船/起飞)", "在途"];
const headArrivedOrLater = (s) => ["到港", "上架中", "完成"].includes(normalizeShipmentStage(s));
const TRANSPORT_META = { 海运: { icon: "🚢", bg: "#dceeff", c: "#1a4e8a" }, 空运: { icon: "✈", bg: "#ede9fe", c: "#4c1d95" }, 快递: { icon: "📦", bg: "#fef3c7", c: "#78350f" } };
const fmtWindow = (s, e) => (!s && !e) ? "—" : `${s ? fmtD(s) : "?"} – ${e ? fmtD(e) : "?"}`;
const fbaEffectiveStatus = (fba) => {
  const st = normalizeShipmentStage(fba.status);
  if (TRACKING_CHECK_STAGES.includes(st) && !(fba.tracking || "").trim()) return "缺少追踪编码";
  return st;
};
const batchMissingTrack = (g) => (g.fbaShipments || []).some(s => fbaEffectiveStatus(s) === "缺少追踪编码");
const batchReceiving = (g) => (g.fbaShipments || []).some(s => normalizeShipmentStage(s.status) === "上架中");
const batchAllDone = (g) => (g.fbaShipments || []).length > 0 && (g.fbaShipments || []).every(s => normalizeShipmentStage(s.status) === "完成");
const deriveHeadStatus = (fbaShipments) => {
  const fbas = fbaShipments || [];
  if (!fbas.length) return DEFAULT_SHIPMENT_STAGE;
  const indices = fbas.map(f => SHIPMENT_STAGES.indexOf(normalizeShipmentStage(f.status))).filter(i => i >= 0);
  return indices.length ? SHIPMENT_STAGES[Math.min(...indices)] : DEFAULT_SHIPMENT_STAGE;
};
const batchHeadTransit = (g) => {
  const fbas = g.fbaShipments || [];
  if (fbas.length) return fbas.some(f => HEAD_TRANSIT_STAGES.includes(normalizeShipmentStage(f.status)));
  return HEAD_TRANSIT_STAGES.includes(normalizeShipmentStage(g.headStatus));
};
const fbaEtaArrival = (fba, batch) => fba.etaArrival || batch?.etaArrival || fba.windowEnd || "";
const fbaOpenExcCount = (fba) => (fba.exceptions || []).filter(e => !e.resolved).length;
const fbaAllExceptions = (fba, batch, fbaIndex = 0) => {
  if ((fba.exceptions || []).length) return fba.exceptions;
  if (fbaIndex === 0 && (batch?.exceptions || []).length) return batch.exceptions;
  return [];
};
const openExcCount = (g) => {
  let n = (g.exceptions || []).filter(e => !e.resolved).length;
  (g.fbaShipments || []).forEach(f => { n += fbaOpenExcCount(f); });
  return n;
};
const fbaOverdue = (fba, batch) => {
  const d = daysDiff(fbaEtaArrival(fba, batch));
  return d !== null && d < 0 && !headArrivedOrLater(fba.status);
};
const batchHeadOverdue = (g) => {
  const fbas = g.fbaShipments || [];
  if (fbas.length) return fbas.some(f => fbaOverdue(f, g));
  const d = daysDiff(g.etaArrival);
  return d !== null && d < 0;
};
const batchEarliestEtaDiff = (g) => {
  const diffs = (g.fbaShipments || []).map(f => daysDiff(fbaEtaArrival(f, g))).filter(d => d !== null);
  if (diffs.length) return Math.min(...diffs);
  return daysDiff(g.etaArrival);
};
const batchDisplayQty = (group) => {
  const fbas = group.fbaShipments || [];
  if (fbas.length) return sumFbaExpectedQty(fbas);
  return group.totalQty || 0;
};

const ensureFbaDefaults = (fba, batch) => ({
  ...fba,
  etaArrival: fba.etaArrival || batch?.etaArrival || "",
  etaDeparture: fba.etaDeparture || batch?.etaDeparture || "",
  exceptions: fba.exceptions || [],
});
const sumFbaExpectedQty = (fbaShipments) =>
  (fbaShipments || []).reduce((s, f) => s + (Number(f.expectedQty) || 0), 0);
// ─── Amazon STA CSV import ───────────────────────────────────────────
const parseCsvRow = (line) => {
  const cells = []; let cur = ""; let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuote = !inQuote; continue; }
    if (c === "," && !inQuote) { cells.push(cur); cur = ""; continue; }
    cur += c;
  }
  cells.push(cur);
  return cells.map(s => s.trim());
};
const warehouseFromStaName = (name) => { const m = (name || "").match(/-([A-Z0-9]{3,5})\s*$/); return m ? m[1] : ""; };
const isoFromStaName = (name) => {
  const m = (name || "").match(/\((\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return "";
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
};
const addDaysIso = (iso, days) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const parseAmazonStaCsv = (text, id) => {
  const warnings = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const meta = {};
  for (const line of lines.slice(0, 15)) {
    if (!line.trim()) continue;
    const row = parseCsvRow(line);
    if (row.length >= 2 && row[0] && row[1] && row[0] !== "SKU") meta[row[0]] = row[1];
  }
  const fbaId = meta["货件编号"] || "";
  const name = meta["货件名称"] || "";
  if (!fbaId && !name) throw new Error("不是有效的 STA 货件 CSV");
  let skuInfo = null;
  for (let i = 0; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    if (row[0] !== "SKU") continue;
    const header = row;
    const data = parseCsvRow(lines[i + 1] || "");
    if (!data[0] || data[0] === "SKU") break;
    const idx = (k) => header.indexOf(k);
    skuInfo = { sku: data[idx("SKU")] || data[0], asin: data[idx("ASIN")] || "", fnsku: data[idx("FNSKU")] || "", units: +(data[idx("商品总数")] || 0) };
    break;
  }
  const warehouse = warehouseFromStaName(name);
  if (!warehouse) warnings.push("未解析到仓库代码");
  const windowStart = isoFromStaName(name);
  let expectedQty = +(meta["商品数量"] || 0);
  if (skuInfo?.units) expectedQty = skuInfo.units;
  if (!expectedQty) warnings.push("商品数量为 0");
  const note = [meta["配送地址"] && `配送 ${meta["配送地址"]}`, meta["箱子数量"] && `${meta["箱子数量"]} 箱`, skuInfo?.fnsku && `FNSKU ${skuInfo.fnsku}`].filter(Boolean).join(" · ");
  return {
    fba: { id, name, fbaId, internalId: (meta["工作流程名称"] || "").slice(0, 8).toUpperCase(), warehouse, expectedQty, receivedQty: 0, windowStart, windowEnd: addDaysIso(windowStart, 6), etaDeparture: "", etaArrival: addDaysIso(windowStart, 6), tracking: "", status: DEFAULT_SHIPMENT_STAGE, exceptions: [], note },
    sku: skuInfo?.sku || "",
    warnings,
  };
};
const readStaCsvFiles = async (fileList) => {
  const files = Array.from(fileList);
  const baseId = Date.now();
  const parsed = await Promise.all(files.map((f, i) => f.text().then(t => parseAmazonStaCsv(t, baseId + i))));
  return {
    fbaShipments: parsed.map(p => p.fba),
    totalQty: parsed.reduce((s, p) => s + (p.fba.expectedQty || 0), 0),
    sku: parsed.find(p => p.sku)?.sku || "",
    warnings: parsed.flatMap((p, i) => p.warnings.map(w => `${files[i].name}: ${w}`)),
  };
};
const normalizeFbaId = (id) => (id || "").trim().toUpperCase();
const collectFbaIdsFromGroups = (groups, excludeGroupId = null) => {
  const ids = new Set();
  for (const g of groups || []) {
    if (excludeGroupId != null && g.id === excludeGroupId) continue;
    for (const s of g.fbaShipments || []) {
      const fid = normalizeFbaId(s.fbaId);
      if (fid) ids.add(fid);
    }
  }
  return ids;
};
const splitDuplicateFbaImports = (incoming, existingIds) => {
  const seen = new Set(existingIds);
  const unique = [];
  const dupes = [];
  for (const f of incoming) {
    const fid = normalizeFbaId(f.fbaId);
    if (fid && seen.has(fid)) {
      dupes.push(fid);
      continue;
    }
    if (fid) seen.add(fid);
    unique.push(f);
  }
  return { unique, dupes };
};
const formatDuplicateFbaMsg = (dupes, action) => {
  const list = [...new Set(dupes)].join("、");
  return dupes.length === 1
    ? `FBA 货件编号 ${list} 已存在，${action}`
    : `以下 FBA 货件编号已存在，${action}：${list}`;
};

const INIT_LOGISTICS = [
  {
    id: 1, name: "FB100绿色第三批", sku: "FB100", totalQty: 800, owner: "陈工",
    shipDate: "2026-04-10", transport: "海运", forwarder: "中外运华南", blNumber: "COSU6284731",
    etaDeparture: "2026-05-15", etaArrival: "2026-06-08", headStatus: "在途", note: "正常在途",
    exceptions: [],
    fbaShipments: [
      { id: 101, name: "FBA STA (04/20/2026 10:14)-RDU2", fbaId: "FBA19BWMS0S7", internalId: "11VGG45G", warehouse: "RDU2", expectedQty: 144, receivedQty: 0, windowStart: "2026-05-31", windowEnd: "2026-06-06", etaDeparture: "2026-05-15", etaArrival: "2026-06-08", tracking: "", status: "已入仓", exceptions: [], note: "" },
      { id: 102, name: "FBA STA (04/20/2026 10:14)-SWF2", fbaId: "FBA19BWMT1K3", internalId: "22HJK89M", warehouse: "SWF2", expectedQty: 160, receivedQty: 0, windowStart: "2026-06-01", windowEnd: "2026-06-07", etaDeparture: "2026-05-15", etaArrival: "2026-06-08", tracking: "1Z999AA10123456784", status: "在途", exceptions: [], note: "" },
      { id: 103, name: "FBA STA (04/20/2026 10:14)-IAH3", fbaId: "FBA19BWMV4P9", internalId: "33PLM12N", warehouse: "IAH3", expectedQty: 168, receivedQty: 120, windowStart: "2026-05-28", windowEnd: "2026-06-03", etaDeparture: "2026-05-15", etaArrival: "2026-06-08", tracking: "TBA6284731003", status: "上架中", exceptions: [], note: "" },
      { id: 104, name: "FBA STA (04/20/2026 10:14)-MDW2", fbaId: "FBA19BWMX7R2", internalId: "44QRS56T", warehouse: "MDW2", expectedQty: 176, receivedQty: 176, windowStart: "2026-05-20", windowEnd: "2026-05-26", etaDeparture: "2026-05-15", etaArrival: "2026-06-08", tracking: "FBA6284731004", status: "完成", exceptions: [], note: "" },
      { id: 105, name: "FBA STA (04/20/2026 10:14)-ORF2", fbaId: "FBA19BWMZ9T5", internalId: "55UVW78X", warehouse: "ORF2", expectedQty: 152, receivedQty: 0, windowStart: "2026-06-05", windowEnd: "2026-06-11", etaDeparture: "2026-05-15", etaArrival: "2026-06-08", tracking: "", status: "已入仓", exceptions: [], note: "" },
    ],
  },
  {
    id: 2, name: "FB101白色第二批", sku: "FB101", totalQty: 300, owner: "陈工",
    shipDate: "2026-05-08", transport: "空运", forwarder: "顺丰国际", blNumber: "SF20260508001",
    etaDeparture: "2026-05-12", etaArrival: "2026-05-18", headStatus: "到港", note: "",
    exceptions: [],
    fbaShipments: [
      { id: 201, name: "FBA STA (05/08/2026 09:30)-LAX9", fbaId: "FBA19BXAA1B2", internalId: "66ABC01D", warehouse: "LAX9", expectedQty: 300, receivedQty: 280, windowStart: "2026-05-22", windowEnd: "2026-05-28", etaDeparture: "2026-05-12", etaArrival: "2026-05-18", tracking: "SF6284732001", status: "上架中", exceptions: [{ desc: "IAH3 仓库拒收部分箱", date: "2026-05-25", resolved: false, action: "货代协调重新配送" }], note: "" },
    ],
  },
  {
    id: 3, name: "FB200黑色第一批", sku: "FB200", totalQty: 200, owner: "李工",
    shipDate: "2026-05-01", transport: "海运", forwarder: "马士基订舱", blNumber: "MAEU9876543",
    etaDeparture: "2026-05-28", etaArrival: "2026-06-25", headStatus: "待出库", note: "等工厂尾数",
    exceptions: [],
    fbaShipments: [
      { id: 301, name: "FBA STA (05/01/2026 14:00)-ONT8", fbaId: "FBA19BYCC3D4", internalId: "77DEF02G", warehouse: "ONT8", expectedQty: 200, receivedQty: 0, windowStart: "2026-06-20", windowEnd: "2026-06-26", etaDeparture: "2026-05-28", etaArrival: "2026-06-25", tracking: "", status: "待出库", exceptions: [], note: "" },
    ],
  },
];
function ExceptionEditor({ excs, setExcs }) {
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tm)", borderTop: "1px solid var(--border)", paddingTop: 10, marginBottom: 8 }}>异常记录</div>
      {excs.map((ex, i) => (
        <div key={i} style={{ background: ex.resolved ? "#f0faf4" : "#fff8e6", border: `1px solid ${ex.resolved ? "#b7e4c7" : "#ffe0a0"}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <input value={ex.desc} onChange={e => { const a = [...excs]; a[i] = { ...ex, desc: e.target.value }; setExcs(a); }} placeholder="异常描述" style={{ ...inpSm, flex: 1 }} />
            <input type="date" value={ex.date} onChange={e => { const a = [...excs]; a[i] = { ...ex, date: e.target.value }; setExcs(a); }} style={{ ...inpSm, width: 120 }} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={ex.action} onChange={e => { const a = [...excs]; a[i] = { ...ex, action: e.target.value }; setExcs(a); }} placeholder="处理方式 / 跟进动作" style={{ ...inpSm, flex: 1 }} />
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--tm)", whiteSpace: "nowrap", cursor: "pointer" }}>
              <input type="checkbox" checked={ex.resolved} onChange={e => { const a = [...excs]; a[i] = { ...ex, resolved: e.target.checked }; setExcs(a); }} />已解决
            </label>
            <button type="button" onClick={() => setExcs(excs.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 16 }}>×</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setExcs([...excs, { desc: "", date: TODAY.toISOString().split("T")[0], action: "", resolved: false }])} style={{ width: "100%", border: "1px dashed var(--border)", borderRadius: 8, padding: "5px 0", fontSize: 12, cursor: "pointer", color: "var(--tm)", background: "transparent", marginBottom: 12, fontFamily: "inherit" }}>+ 记录异常</button>
    </>
  );
}
function FbaStatusBadge({ fba }) {
  const st = fbaEffectiveStatus(fba);
  const s = STAGE_STYLE[st] || STAGE_STYLE[DEFAULT_SHIPMENT_STAGE];
  return <span style={badge(s.bg, s.c)}>{st}</span>;
}

function StageDotLine({ stage, dotSize = 7, connector = true }) {
  const st = normalizeShipmentStage(stage);
  const stageIdx = SHIPMENT_STAGES.indexOf(st);
  return (
    <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
      {SHIPMENT_STAGES.map((s, i) => {
        const done = i < stageIdx;
        const active = i === stageIdx;
        const c = active ? stageColor(s) : done ? "#2d9e52" : "var(--border)";
        const size = active ? dotSize : Math.max(5, dotSize - 2);
        return (
          <span key={s} style={{ display: "flex", alignItems: "center", flex: connector && i < SHIPMENT_STAGES.length - 1 ? 1 : "none" }} title={s}>
            <span style={{ width: size, height: size, borderRadius: "50%", background: c, outline: active ? `2px solid ${c}` : "none", outlineOffset: 1, flexShrink: 0 }} />
            {connector && i < SHIPMENT_STAGES.length - 1 && (
              <span style={{ flex: 1, height: 2, background: done ? "#2d9e52" : "var(--border)", margin: "0 1px" }} />
            )}
          </span>
        );
      })}
    </div>
  );
}

function FbaArrivalHint({ fba, batch }) {
  const eta = fbaEtaArrival(fba, batch);
  const d = daysDiff(eta);
  if (headArrivedOrLater(fba.status)) return <span style={{ fontSize: 10, color: "var(--tm)" }}>已抵达</span>;
  if (d === null) return <span style={{ fontSize: 10, color: "var(--tm)" }}>抵达 —</span>;
  if (d < 0) return <span style={badge("#fee2e2", "#E24B4A")}>逾期 {Math.abs(d)} 天</span>;
  if (d === 0) return <span style={badge("#fff0d4", "#7a4a00")}>今日抵达</span>;
  if (d <= 7) return <span style={badge("#dceeff", "#1a4e8a")}>{fmtD(eta)} · {d} 天</span>;
  return <span style={{ fontSize: 10, color: "var(--tm)" }}>抵达 {fmtD(eta)}</span>;
}

function FbaExceptionList({ exceptions }) {
  const list = exceptions || [];
  if (!list.length) return null;
  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }} onClick={e => e.stopPropagation()}>
      {list.map((ex, i) => {
        const resolved = !!ex.resolved;
        const desc = (ex.desc || "").trim() || "（未填写描述）";
        return (
          <div key={i} style={{ fontSize: 10, lineHeight: 1.45, padding: "6px 8px", borderRadius: 6, background: resolved ? "#f0faf4" : "#fff8e6", border: `1px solid ${resolved ? "#b7e4c7" : "#ffe0a0"}`, color: resolved ? "#2d6a4f" : "#7a4a00" }}>
            <span style={{ fontWeight: 600 }}>{resolved ? "✓ " : "⚠ "}{desc}</span>
            {ex.action && <span style={{ marginLeft: 4, opacity: 0.9 }}>· {ex.action}</span>}
            <span style={{ marginLeft: 4, opacity: 0.75 }}>· {ex.date ? fmtD(ex.date) : "—"}{resolved ? " 已解决" : " 未解决"}</span>
          </div>
        );
      })}
    </div>
  );
}

function FbaStageTrack({ fba, batch, fbaIndex = 0 }) {
  const f = ensureFbaDefaults(fba, batch);
  const st = normalizeShipmentStage(f.status);
  const stageIdx = SHIPMENT_STAGES.indexOf(st);
  const prog = stageIdx >= 0 ? Math.round((stageIdx / (SHIPMENT_STAGES.length - 1)) * 100) : 0;
  const excN = fbaOpenExcCount(f);
  const overdue = fbaOverdue(f, batch);
  return (
    <div style={{ marginBottom: 12, padding: "10px 12px", background: "var(--bg)", borderRadius: 10, border: `1px solid ${overdue ? "#fecaca" : excN ? "#ffe0a0" : "var(--border)"}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={badge("#ede9fe", "#4c1d95", { fontSize: 10, fontWeight: 700, padding: "3px 6px" })}>{f.warehouse || "—"}</span>
          <span style={{ fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.fbaId || f.name || "货件"}</span>
          {f.expectedQty > 0 && <span style={{ fontSize: 10, color: "var(--tm)" }}>{f.expectedQty} 件</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <FbaStatusBadge fba={f} />
          <FbaArrivalHint fba={f} batch={batch} />
          {excN > 0 && <span style={badge("#fff0d4", "#e09000")}>⚠ {excN} 异常</span>}
        </div>
      </div>
      <div style={{ height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ height: "100%", width: `${prog}%`, background: stageColor(st), borderRadius: 2 }} />
      </div>
      <StageDotLine stage={f.status} dotSize={6} />
      <FbaExceptionList exceptions={fbaAllExceptions(f, batch, fbaIndex)} />
    </div>
  );
}
function FbaRow({ fba, onEditTracking }) {
  const [editing, setEditing] = useState(false);
  const [trackVal, setTrackVal] = useState(fba.tracking || "");
  const missing = fbaEffectiveStatus(fba) === "缺少追踪编码";
  const saveTrack = () => { onEditTracking(fba.id, trackVal.trim()); setEditing(false); };
  return (
    <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: 11 }}>
      <div style={{ fontWeight: 600, marginBottom: 3, lineHeight: 1.4 }}>{fba.name}</div>
      <div style={{ color: "var(--tm)", marginBottom: 6 }}>{fba.fbaId}{fba.internalId ? ` · ${fba.internalId}` : ""}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 4 }}>
        <span style={{ color: "var(--tm)" }}>配送 {fmtWindow(fba.windowStart, fba.windowEnd)}</span>
        <span style={{ color: "var(--tm)" }}>{fba.expectedQty} 件{fba.receivedQty > 0 ? ` / 已收 ${fba.receivedQty}` : ""}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {editing ? (
          <>
            <input value={trackVal} onChange={e => setTrackVal(e.target.value)} placeholder="输入追踪编码" style={{ ...inpSm, flex: 1, minWidth: 140 }} autoFocus onKeyDown={e => { if (e.key === "Enter") saveTrack(); if (e.key === "Escape") setEditing(false); }} />
            <button type="button" onClick={saveTrack} style={{ background: "#2d7dd2", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>保存</button>
          </>
        ) : missing ? (
          <button type="button" onClick={e => { e.stopPropagation(); setTrackVal(fba.tracking || ""); setEditing(true); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#E24B4A", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>缺少追踪编码 · 点击填写</button>
        ) : (
          <span style={{ color: "var(--tm)", cursor: "pointer" }} onClick={e => { e.stopPropagation(); setTrackVal(fba.tracking || ""); setEditing(true); }} title="点击编辑">追踪 {fba.tracking || "—"}</span>
        )}
      </div>
    </div>
  );
}
function ShipmentGroupCard({ group, expanded, onToggleExpand, onEdit, onEditTracking, onDelete }) {
  const fbas = group.fbaShipments || [];
  const fbaCount = fbas.length;
  const totalQty = batchDisplayQty(group);
  const excN = openExcCount(group);
  const bc = batchHeadOverdue(group) ? "#E24B4A" : excN > 0 ? "#e09000" : "var(--border)";
  const tm = TRANSPORT_META[group.transport] || { icon: "📦", bg: "#f3f4f6", c: "#666" };
  return (
    <div style={{ background: "var(--card)", border: `1px solid ${batchHeadOverdue(group) ? "#fecaca" : "var(--border)"}`, borderLeft: `4px solid ${bc === "var(--border)" ? "#c8c6bc" : bc}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "12px 14px", background: "var(--bg)", borderBottom: expanded ? "1px solid var(--border)" : "none" }}>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onToggleExpand(); }}
          title={expanded ? "收起批次" : "展开批次"}
          style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, width: 28, height: 28, flexShrink: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 11, color: "#2d7dd2", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}
        >
          {expanded ? "▼" : "▶"}
        </button>
        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={onEdit}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{group.name}</span>
            {group.sku && <span style={{ fontSize: 12, color: "var(--tm)" }}>{group.sku}</span>}
            <span style={badge(tm.bg, tm.c)}>{tm.icon} {group.transport}</span>
            {excN > 0 && <span style={badge("#fff0d4", "#e09000")}>⚠ {excN} 异常</span>}
          </div>
          <div style={{ fontSize: 11, color: "var(--tm)" }}>
            {fbaCount} 个货件 · 共 <strong style={{ color: "var(--text)", fontWeight: 700 }}>{totalQty}</strong> 件
            {group.blNumber ? ` · B/L ${group.blNumber}` : ""}
            {group.updatedAt ? ` · 更新 ${formatSharedTime(group.updatedAt)}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Avatar name={group.owner} />
            <span style={{ fontSize: 11, color: "var(--tm)" }}>{group.owner}</span>
            <RoleBadge role={getStaffRole(group.owner)} />
          </div>
          <button type="button" onClick={e => { e.stopPropagation(); onDelete(); }} style={{ background: "transparent", border: "1px solid #fecaca", borderRadius: 6, padding: "2px 8px", fontSize: 10, cursor: "pointer", fontFamily: "inherit", color: "#e55" }}>删除</button>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: "12px 14px 14px" }}>
          {fbaCount > 0 ? (
            <>
              {fbas.map((f, i) => <FbaStageTrack key={f.id} fba={f} batch={group} fbaIndex={i} />)}
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 4 }}>
                {fbas.map(f => <FbaRow key={f.id} fba={f} onEditTracking={(fid, tracking) => onEditTracking(group.id, fid, tracking)} />)}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: "var(--tm)", padding: "6px 0", cursor: "pointer" }} onClick={onEdit}>暂无货件 · 点击编辑添加</div>
          )}
        </div>
      )}
    </div>
  );
}
function FbaEditorRow({ fba, onChange, onRemove }) {
  const setExcs = (exceptions) => onChange({ ...fba, exceptions });
  const excs = fba.exceptions || [];
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px", marginBottom: 8, background: "var(--bg)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{fba.warehouse || "货件"}{fba.fbaId ? ` · ${fba.fbaId}` : ""}</span>
        <button type="button" onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 18, padding: "0 4px" }}>×</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div><label style={lbl}>货件名称</label><input value={fba.name} onChange={e => onChange({ ...fba, name: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>FBA 货件编号</label><input value={fba.fbaId} onChange={e => onChange({ ...fba, fbaId: e.target.value })} placeholder="FBA19..." style={inp} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div><label style={lbl}>内部编号</label><input value={fba.internalId} onChange={e => onChange({ ...fba, internalId: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>仓库代码</label><input value={fba.warehouse} onChange={e => onChange({ ...fba, warehouse: e.target.value.toUpperCase() })} placeholder="RDU2" style={inp} /></div>
        <div><label style={lbl}>预计件数</label><input type="number" value={fba.expectedQty} onChange={e => onChange({ ...fba, expectedQty: +e.target.value || 0 })} style={inp} /></div>
        <div><label style={lbl}>已收件数</label><input type="number" value={fba.receivedQty} onChange={e => onChange({ ...fba, receivedQty: +e.target.value || 0 })} style={inp} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div><label style={lbl}>预计出港</label><input type="date" value={fba.etaDeparture || ""} onChange={e => onChange({ ...fba, etaDeparture: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>预计抵达</label><input type="date" value={fba.etaArrival || ""} onChange={e => onChange({ ...fba, etaArrival: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>配送开始</label><input type="date" value={fba.windowStart} onChange={e => onChange({ ...fba, windowStart: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>配送结束</label><input type="date" value={fba.windowEnd} onChange={e => onChange({ ...fba, windowEnd: e.target.value })} style={inp} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div><label style={lbl}>追踪编码</label><input value={fba.tracking} onChange={e => onChange({ ...fba, tracking: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>状态</label><select value={normalizeShipmentStage(fba.status)} onChange={e => onChange({ ...fba, status: e.target.value })} style={{ ...inp, background: "var(--card)" }}>{SHIPMENT_STAGES.map(s => <option key={s}>{s}</option>)}</select></div>
      </div>
      <ExceptionEditor excs={excs} setExcs={setExcs} />
    </div>
  );
}
function ShipmentModal({ item, onSave, onClose, onDelete, getExistingFbaIds }) {
  const [form, setForm] = useState(item);
  const [fbas, setFbas] = useState(() => {
    const legacyExcs = item.exceptions?.length ? item.exceptions.map(e => ({ ...e })) : [];
    return (item.fbaShipments || []).map((s, i) => ensureFbaDefaults({
      ...s,
      exceptions: (s.exceptions?.length ? s.exceptions : (i === 0 ? legacyExcs : [])).map(e => ({ ...e })),
    }, item));
  });
  const [nextFbaId, setNextFbaId] = useState(() => Math.max(0, ...(item.fbaShipments || []).map(s => s.id)) + 1);
  const [importMsg, setImportMsg] = useState("");
  const [saveWarn, setSaveWarn] = useState("");
  const fileInputRef = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const applyFbas = (nextFbas) => {
    setFbas(nextFbas);
    if (nextFbas.length) {
      setForm(f => ({ ...f, totalQty: sumFbaExpectedQty(nextFbas) }));
    }
  };
  const handleSave = (e) => {
    e?.stopPropagation?.();
    if (!form.name.trim()) {
      setSaveWarn("请先填写「批次名称」");
      return;
    }
    setSaveWarn("");
    const totalQty = fbas.length ? sumFbaExpectedQty(fbas) : form.totalQty;
    const normalizedFbas = fbas.map(f => ({
      ...ensureFbaDefaults(f, form),
      status: normalizeShipmentStage(f.status),
      exceptions: (f.exceptions || []).map(e => ({ ...e })),
    }));
    onSave({
      ...form,
      headStatus: deriveHeadStatus(normalizedFbas),
      totalQty,
      exceptions: [],
      fbaShipments: normalizedFbas,
    });
  };
  const emptyFba = () => ({ id: nextFbaId, name: "", fbaId: "", internalId: "", warehouse: "", expectedQty: 0, receivedQty: 0, windowStart: "", windowEnd: "", etaDeparture: "", etaArrival: "", tracking: "", status: DEFAULT_SHIPMENT_STAGE, exceptions: [], note: "" });
  const onCsvPick = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    try {
      const { fbaShipments, totalQty, sku, warnings } = await readStaCsvFiles(files);
      const existingIds = new Set(getExistingFbaIds ? getExistingFbaIds() : []);
      fbas.forEach(f => {
        const fid = normalizeFbaId(f.fbaId);
        if (fid) existingIds.add(fid);
      });
      const { unique, dupes } = splitDuplicateFbaImports(fbaShipments, existingIds);
      if (!unique.length) {
        setImportMsg(formatDuplicateFbaMsg(dupes, "无法重复导入"));
        e.target.value = "";
        return;
      }
      let nid = nextFbaId;
      const imported = unique.map(f => ({ ...f, id: nid++ }));
      const merged = [...fbas, ...imported];
      applyFbas(merged);
      setNextFbaId(nid);
      setForm(f => ({
        ...f,
        totalQty: sumFbaExpectedQty(merged),
        sku: f.sku || sku,
        name: f.name || (imported.length === 1 ? imported[0].name : f.name),
      }));
      const baseMsg = warnings.length ? `已导入 ${imported.length} 个货件（${warnings.join("；")}）` : `已导入 ${imported.length} 个 STA 货件`;
      setImportMsg(dupes.length ? `${baseMsg}；${formatDuplicateFbaMsg(dupes, "已跳过")}` : baseMsg);
    } catch (err) {
      setImportMsg(err.message || "CSV 解析失败");
    }
    e.target.value = "";
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem 1rem" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} aria-hidden />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "relative", zIndex: 1, background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 14, width: "100%", maxWidth: 760, maxHeight: "calc(100vh - 3rem)",
          color: "var(--text)", display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem 1.5rem 0" }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: "1rem" }}>{item.id ? "编辑发货批次" : "新建发货批次"}</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tm)", marginBottom: 8 }}>批次信息</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>批次名称 <span style={{ color: "#c62828" }}>*</span></label><input value={form.name} onChange={e => { set("name", e.target.value); if (saveWarn) setSaveWarn(""); }} placeholder="FB100绿色第三批" style={inp} /></div>
          <div><label style={lbl}>产品 / SKU</label><input value={form.sku} onChange={e => set("sku", e.target.value)} placeholder="FB100" style={inp} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>跟进人</label><OwnerField value={form.owner} onChange={v => set("owner", v)} inputStyle={inp} /></div>
          <div><label style={lbl}>头程方式</label><select value={form.transport} onChange={e => set("transport", e.target.value)} style={{ ...inp, background: "var(--card)" }}>{Object.keys(TRANSPORT_META).map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label style={lbl}>国内出货日期</label><input type="date" value={form.shipDate} onChange={e => set("shipDate", e.target.value)} style={inp} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div><label style={lbl}>货代公司</label><input value={form.forwarder} onChange={e => set("forwarder", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>提单号 B/L</label><input value={form.blNumber} onChange={e => set("blNumber", e.target.value)} style={inp} /></div>
        </div>
        <div style={{ marginBottom: 12 }}><label style={lbl}>备注</label><input value={form.note} onChange={e => set("note", e.target.value)} style={inp} /></div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tm)", borderTop: "1px solid var(--border)", paddingTop: 10, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span>FBA 货件 ({fbas.length})</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input ref={fileInputRef} type="file" accept=".csv" multiple style={{ display: "none" }} onChange={onCsvPick} />
            <button type="button" onClick={() => fileInputRef.current?.click()} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", color: "#2d7dd2" }}>📥 导入 STA CSV</button>
          </div>
        </div>
        {importMsg && <div style={{ fontSize: 11, color: importMsg.includes("失败") || importMsg.includes("不是") ? "#E24B4A" : "#1a6b35", marginBottom: 8, padding: "6px 10px", background: importMsg.includes("失败") || importMsg.includes("不是") ? "#fee2e2" : "#f0faf4", borderRadius: 8 }}>{importMsg}</div>}
        {fbas.map((f, i) => <FbaEditorRow key={f.id} fba={f} onChange={v => { const a = [...fbas]; a[i] = v; applyFbas(a); }} onRemove={() => applyFbas(fbas.filter((_, j) => j !== i))} />)}
        <button type="button" onClick={() => { applyFbas([...fbas, emptyFba()]); setNextFbaId(nextFbaId + 1); }} style={{ width: "100%", border: "1px dashed var(--border)", borderRadius: 8, padding: "6px 0", fontSize: 12, cursor: "pointer", color: "var(--tm)", background: "transparent", marginBottom: 12, fontFamily: "inherit" }}>+ 添加 FBA 货件</button>
        </div>
        <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)", padding: "12px 1.5rem 1.5rem", background: "var(--card)" }}>
          {saveWarn && <div style={{ fontSize: 12, color: "#c62828", marginBottom: 8 }}>{saveWarn}</div>}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            {item.id ? <button type="button" onClick={onDelete} style={{ background: "none", border: "none", color: "#e55", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>删除批次</button> : <div />}
            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              <button type="button" onClick={onClose} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "var(--tm)" }}>取消</button>
              <button type="button" onClick={handleSave} style={{ background: "#2d7dd2", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>保存</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export function LogisticsPanel({ active = true }) {
  const { items, meta, loading, saving, error, persist, reload } = useSharedList("logistics", INIT_LOGISTICS, { active });
  const list = Array.isArray(items) ? items : [];
  const savedFilters = loadLogisticsFilters();
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState(savedFilters.filter || "all");
  const [ownerFilter, setOwnerFilter] = useState(savedFilters.ownerFilter || "all");
  const [expanded, setExpanded] = useState(loadExpandedState);
  const panelCsvRef = useRef(null);

  useEffect(() => {
    saveLogisticsFilters({ filter, ownerFilter });
  }, [filter, ownerFilter]);

  const setFilterPersist = (key) => {
    setFilter(key);
    saveLogisticsFilters({ filter: key, ownerFilter });
  };
  const setOwnerFilterPersist = (name) => {
    setOwnerFilter(name);
    saveLogisticsFilters({ filter, ownerFilter: name });
  };

  const toggleExpanded = (id) => setExpanded(prev => {
    const key = String(id);
    const next = { ...prev, [key]: !isBatchExpanded(prev, id) };
    saveExpandedState(next);
    return next;
  });
  const nextId = () => Math.max(0, ...list.map(i => i.id || 0)) + 1;
  const counts = {
    all: list.length,
    transit: list.filter(batchHeadTransit).length,
    missing_track: list.filter(batchMissingTrack).length,
    receiving: list.filter(batchReceiving).length,
    done: list.filter(batchAllDone).length,
  };
  const owners = ownerFilterEntries();
  let vis = list.slice();
  if (ownerFilter !== "all") vis = vis.filter(i => i.owner === ownerFilter);
  if (filter === "transit") vis = vis.filter(batchHeadTransit);
  else if (filter === "missing_track") vis = vis.filter(batchMissingTrack);
  else if (filter === "receiving") vis = vis.filter(batchReceiving);
  else if (filter === "done") vis = vis.filter(batchAllDone);
  vis.sort((a, b) => {
    const pa = batchHeadOverdue(a) ? 0 : openExcCount(a) ? 1 : 2;
    const pb = batchHeadOverdue(b) ? 0 : openExcCount(b) ? 1 : 2;
    if (pa !== pb) return pa - pb;
    return batchEarliestEtaDiff(a) - batchEarliestEtaDiff(b);
  });
  const save = (t) => {
    const now = Date.now();
    const withTime = { ...t, updatedAt: now };
    if (t.id) persist(list.map(x => x.id === t.id ? withTime : x));
    else persist([...list, { ...withTime, id: nextId() }]);
    setModal(null);
  };
  const deleteGroup = (g) => {
    if (!window.confirm(`确定删除批次「${g.name || g.sku || "未命名"}」？删除后无法恢复。`)) return;
    persist(list.filter(x => x.id !== g.id));
    if (modal?.id === g.id) setModal(null);
  };
  const editTracking = (gid, fid, tracking) => {
    const now = Date.now();
    persist(list.map(g => {
      if (g.id !== gid) return g;
      const fbaShipments = (g.fbaShipments || []).map(s => s.id !== fid ? s : {
        ...s, tracking,
        status: tracking.trim() && ["待出库", "已入仓"].includes(normalizeShipmentStage(s.status)) ? "在途" : normalizeShipmentStage(s.status),
      });
      return { ...g, fbaShipments, headStatus: deriveHeadStatus(fbaShipments), updatedAt: now };
    }));
  };
  const cloneGroup = (g) => ({
    ...g,
    exceptions: (g.exceptions || []).map(e => ({ ...e })),
    fbaShipments: (g.fbaShipments || []).map(s => ({
      ...ensureFbaDefaults(s, g),
      exceptions: (s.exceptions || []).map(e => ({ ...e })),
    })),
  });
  const emptyGroup = { name: "", sku: "", totalQty: 0, owner: "", shipDate: "", transport: "海运", forwarder: "", blNumber: "", etaDeparture: "", etaArrival: "", headStatus: DEFAULT_SHIPMENT_STAGE, note: "", exceptions: [], fbaShipments: [] };
  const onPanelCsvImport = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    try {
      const { fbaShipments, totalQty, sku } = await readStaCsvFiles(files);
      const existingIds = collectFbaIdsFromGroups(list);
      const { unique, dupes } = splitDuplicateFbaImports(fbaShipments, existingIds);
      if (!unique.length) {
        alert(formatDuplicateFbaMsg(dupes, "无法重复导入"));
        e.target.value = "";
        return;
      }
      if (dupes.length) alert(formatDuplicateFbaMsg(dupes, "已跳过重复项"));
      const label = files.length === 1 ? unique[0]?.fbaId || "新批次" : `导入 ${unique.length} 个货件`;
      setModal({ ...emptyGroup, name: label, sku, totalQty, fbaShipments: unique });
    } catch (err) {
      alert(err.message || "CSV 解析失败");
    }
    e.target.value = "";
  };
  const tabs = [
    { key: "all", label: "全部", nc: "var(--text)" },
    { key: "transit", label: "头程在途", nc: "#2d7dd2" },
    { key: "missing_track", label: "缺少追踪码", nc: "#E24B4A" },
    { key: "receiving", label: "FBA接收中", nc: "#1a9e8a" },
    { key: "done", label: "已完成", nc: "#2d9e52" },
  ];
  useCloudSyncPage(active, {
    label: "物流",
    save: async () => persist(list),
    reload,
    meta,
    loading,
    saving,
    error,
    isDirty: !!modal,
    dirtyHint: "物流批次编辑弹窗未保存",
  });
  return (
    <div>
      <FBAGanttCard groups={list} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 7, flex: 1, minWidth: 280 }}>
          {tabs.map(f => (
            <div key={f.key} onClick={() => setFilterPersist(f.key)} style={{ background: "var(--card)", border: `1px solid ${filter === f.key ? "#2d7dd2" : "var(--border)"}`, borderRadius: 10, padding: "9px 10px", cursor: "pointer" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: f.nc }}>{counts[f.key]}</div>
              <div style={{ fontSize: 10, color: "var(--tm)", marginTop: 1 }}>{f.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <input ref={panelCsvRef} type="file" accept=".csv" multiple style={{ display: "none" }} onChange={onPanelCsvImport} />
        <button type="button" onClick={() => panelCsvRef.current?.click()} style={{ background: "var(--card)", color: "#2d7dd2", border: "1px solid #2d7dd2", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>📥 导入 CSV</button>
        <button onClick={() => setModal(emptyGroup)} style={{ background: "#2d7dd2", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>+ 新建批次</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--tm)" }}>跟进人</span>
        {owners.map(o => (
          <button key={o.name} onClick={() => setOwnerFilterPersist(o.name)} style={{ background: ownerFilter === o.name ? "#2d7dd2" : "var(--card)", color: ownerFilter === o.name ? "#fff" : "var(--tm)", border: `1px solid ${ownerFilter === o.name ? "#2d7dd2" : "var(--border)"}`, borderRadius: 20, padding: "4px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>
            {o.name === "all" ? "全部" : (<>{o.name}{o.role && <RoleBadge role={o.role} style={{ padding: "0 5px", fontSize: 9 }} />}</>)}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {vis.length ? vis.map(g => (
          <ShipmentGroupCard
            key={g.id}
            group={g}
            expanded={isBatchExpanded(expanded, g.id)}
            onToggleExpand={() => toggleExpanded(g.id)}
            onEdit={() => setModal(cloneGroup(g))}
            onEditTracking={editTracking}
            onDelete={() => deleteGroup(g)}
          />
        )) : <div style={{ textAlign: "center", padding: "2rem", color: "var(--tm)", fontSize: 13 }}>暂无匹配批次</div>}
      </div>
      {modal && <ShipmentModal item={modal} onSave={save} getExistingFbaIds={() => collectFbaIdsFromGroups(list, modal.id)} onClose={() => {
        if (!window.confirm("弹窗未点「保存」，修改不会上传。确定关闭？")) return;
        setModal(null);
      }} onDelete={() => { persist(list.filter(x => x.id !== modal.id)); setModal(null); }} />}
    </div>
  );
}

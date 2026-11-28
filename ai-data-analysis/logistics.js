const STATUS_META = {
  delayed: { text: '延迟到达', cls: 'pill-red', priority: 0 },
  overdue: { text: '未到已逾期', cls: 'pill-red', priority: 1 },
  unknown: { text: '未知 / 缺事件', cls: 'pill-muted', priority: 2 },
  in_transit: { text: '在途', cls: 'pill-amber', priority: 3 },
  on_time: { text: '符合预期', cls: 'pill-green', priority: 4 },
  early: { text: '提前到达', cls: 'pill-cyan', priority: 5 }
};

const FEE_STATUS_LABELS = {
  verified: { text: '已核扣款', cls: 'pill-red' },
  pending_review: { text: '待核查', cls: 'pill-amber' },
  disputed: { text: '有争议(不扣应付)', cls: 'pill-amber' },
  reversed: { text: '已冲销', cls: 'pill-cyan' }
};

const EVENT_SOURCE_LABELS = {
  signed: '签收单 (signed)',
  carrier_pod: '承运商 POD (carrier_pod)',
  unknown: '来源缺失（未知）'
};

const SHIPMENT_PAGE_SIZE = 500;

let state = {
  overview: null,
  shipments: [],
  shipmentTotal: 0,
  shipmentOffset: 0,
  loadingMore: false,
  batches: [],
  fees: [],
  statements: [],
  ratings: [],
  selectedKey: null
};

const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function shipmentKey(s) {
  return `${s.sid}:${s.fbaShipmentId}`;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

function showBanner(message, isError = false) {
  const el = document.getElementById('status-banner');
  el.hidden = false;
  el.className = `status-banner${isError ? ' is-error' : ''}`;
  el.textContent = message;
}

function clearBanner() {
  const el = document.getElementById('status-banner');
  el.hidden = true;
}

function escHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function parseIsoDayMs(isoDay) {
  if (!isoDay || !/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return null;
  const [y, m, d] = isoDay.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function sortShipmentsAnomalyFirst(list) {
  return [...list].sort((a, b) => {
    const pa = STATUS_META[a.arrival?.status]?.priority ?? 9;
    const pb = STATUS_META[b.arrival?.status]?.priority ?? 9;
    if (pa !== pb) return pa - pb;
    const da = Number(a.arrival?.deviationDays ?? 0);
    const db = Number(b.arrival?.deviationDays ?? 0);
    if (da !== db) return db - da;
    if (a.settlementBlocked !== b.settlementBlocked) return a.settlementBlocked ? -1 : 1;
    return String(a.fbaShipmentId).localeCompare(String(b.fbaShipmentId));
  });
}

function getFilteredShipments() {
  const statusFilter = document.getElementById('filter-status').value;
  const q = document.getElementById('filter-search').value.trim().toLowerCase();
  const sorted = sortShipmentsAnomalyFirst(state.shipments);
  return sorted.filter(s => {
    if (statusFilter === 'unplanned') {
      if (s.planId) return false;
    } else if (statusFilter !== 'all' && s.arrival?.status !== statusFilter) {
      return false;
    }
    if (q) {
      const hay = [
        s.fbaShipmentId,
        s.planId || '无计划',
        s.shipmentSn || '',
        s.destFc || '',
        ...s.legs.map(l => `${l.carrierName} ${l.carrierId} ${l.trackingNo || ''}`)
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function ensureSelection() {
  if (!state.shipments.length) {
    state.selectedKey = null;
    return null;
  }
  const current = state.shipments.find(s => shipmentKey(s) === state.selectedKey);
  if (current) return current;
  // Default focus: highest-deviation delayed shipment (e.g. +30d anomaly in 5-shipment plan)
  const sorted = sortShipmentsAnomalyFirst(state.shipments);
  const preferred = sorted.find(s => s.arrival?.status === 'delayed' && s.planId) || sorted[0];
  state.selectedKey = preferred ? shipmentKey(preferred) : null;
  return preferred || null;
}

function getSelectedShipment() {
  return state.shipments.find(s => shipmentKey(s) === state.selectedKey) || null;
}

function selectShipment(key) {
  state.selectedKey = key;
  renderHero();
  renderShipmentRail();
  renderSelectedDetail();
}

function mergeShipmentsDedup(existing, incoming) {
  const map = new Map();
  for (const s of existing) map.set(shipmentKey(s), s);
  for (const s of incoming) map.set(shipmentKey(s), s);
  return [...map.values()];
}

async function refreshAll() {
  try {
    const [overview, shipmentsRes, batchesRes, feesRes, stmtsRes, ratingsRes] = await Promise.all([
      api('/api/logistics/overview'),
      api(`/api/logistics/shipments?limit=${SHIPMENT_PAGE_SIZE}&offset=0`),
      api('/api/logistics/batches'),
      api('/api/logistics/defect-fees'),
      api('/api/logistics/settlements'),
      api('/api/logistics/ratings')
    ]);
    const firstPage = mergeShipmentsDedup([], shipmentsRes.items || []);
    state = {
      ...state,
      overview,
      shipments: firstPage,
      shipmentTotal: Number(shipmentsRes.total ?? firstPage.length),
      shipmentOffset: (shipmentsRes.items || []).length,
      loadingMore: false,
      batches: batchesRes.batches || [],
      fees: feesRes.fees || [],
      statements: stmtsRes.statements || [],
      ratings: ratingsRes.ratings || []
    };
    ensureSelection();
    renderOverview();
    renderHero();
    renderShipmentRail();
    renderSelectedDetail();
    renderDefects();
    renderStatements();
    renderRatings();
  } catch (err) {
    showBanner(`加载失败：${err.message}`, true);
  }
}

async function loadNextShipmentsPage() {
  if (state.loadingMore || state.shipments.length >= state.shipmentTotal) return;
  state.loadingMore = true;
  const btn = document.getElementById('btn-load-more');
  if (btn) { btn.disabled = true; btn.textContent = '加载中…'; }
  try {
    const res = await api(`/api/logistics/shipments?limit=${SHIPMENT_PAGE_SIZE}&offset=${state.shipmentOffset}`);
    const incoming = res.items || [];
    state.shipments = mergeShipmentsDedup(state.shipments, incoming);
    state.shipmentTotal = Number(res.total ?? state.shipmentTotal);
    state.shipmentOffset += incoming.length;
    // Preserve current selection; only pick default if nothing was selected yet
    ensureSelection();
    renderOverview();
    renderHero();
    renderShipmentRail();
    renderSelectedDetail();
  } catch (err) {
    showBanner(`加载下一页失败：${err.message}`, true);
  } finally {
    state.loadingMore = false;
    if (btn) { btn.disabled = false; btn.textContent = '加载下一页'; }
  }
}

function renderOverview() {
  const o = state.overview;
  const badge = document.getElementById('mode-badge');
  const meta = document.getElementById('logistics-meta');
  const isLive = o.dataMode === 'live' || (!o.dataMode && o.liveConfigured && !o.demo);
  badge.className = `mode-badge ${isLive ? 'is-live' : 'is-demo'}`;
  badge.textContent = o.dataMode === 'live'
    ? '真实领星同步'
    : o.dataMode === 'demo'
      ? '脱敏演示模式'
      : o.liveConfigured ? '待同步(已配置真实领星)' : '脱敏演示可用(未配置真实凭据)';

  const demoBtn = document.getElementById('btn-sync-demo');
  if (demoBtn) demoBtn.hidden = !o.demo;

  const syncText = o.lastSyncedAt ? `最近同步 ${new Date(o.lastSyncedAt).toLocaleString('zh-CN')}` : '尚未同步';
  meta.textContent = `结算时区 ${o.config?.settlementTimezone || 'Asia/Shanghai'} · ${syncText}`;

  const anomalies = state.shipments.filter(s => ['delayed', 'overdue'].includes(s.arrival?.status)).length;
  const blocked = state.shipments.filter(s => s.settlementBlocked).length;
  document.getElementById('kpi-shipments').textContent = String(o.shipmentCount ?? 0);
  document.getElementById('kpi-anomalies').textContent = String(anomalies);
  document.getElementById('kpi-blocked').textContent = String(blocked);
  document.getElementById('tab-count-fees').textContent = String(o.feeCount ?? 0);
  document.getElementById('tab-count-stmts').textContent = String(o.statementCount ?? 0);
}

/* =========================================================================
   等距立体货运场景 Canvas 渲染器（不透明三面明暗、叠放波纹集装箱、货运卡车、带屋顶装卸门 FBA 仓与流光轨迹）
   ========================================================================= */
const isoSceneState = {
  status: 'unknown',
  isAnomaly: false,
  originLabel: '起运港堆场',
  carrierLabel: '待同步',
  destLabel: '目的 FBA 仓',
  delayText: '',
  rafId: null
};

function isoProject(x, y, z, ox, oy) {
  return {
    x: ox + (x - y) * 0.866,
    y: oy + (x + y) * 0.44 - z
  };
}

function fillPoly(ctx, pts, fill, stroke = null, lineWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function drawIsoBox(ctx, x, y, z, dx, dy, dz, colors, ox, oy) {
  const p = (px, py, pz) => isoProject(px, py, pz, ox, oy);
  // Ground cast shadow
  if (z === 0) {
    fillPoly(ctx, [
      p(x + 4, y + 4, 0), p(x + dx + 8, y + 4, 0),
      p(x + dx + 8, y + dy + 8, 0), p(x + 4, y + dy + 8, 0)
    ], 'rgba(2, 6, 16, 0.52)');
  }
  // Right-front face (+x face)
  fillPoly(ctx, [
    p(x + dx, y, z), p(x + dx, y + dy, z),
    p(x + dx, y + dy, z + dz), p(x + dx, y, z + dz)
  ], colors.right, colors.stroke || 'rgba(15, 23, 42, 0.55)', 0.9);
  // Left-front face (+y face)
  fillPoly(ctx, [
    p(x, y + dy, z), p(x + dx, y + dy, z),
    p(x + dx, y + dy, z + dz), p(x, y + dy, z + dz)
  ], colors.left, colors.stroke || 'rgba(15, 23, 42, 0.55)', 0.9);
  // Top face (+z face)
  fillPoly(ctx, [
    p(x, y, z + dz), p(x + dx, y, z + dz),
    p(x + dx, y + dy, z + dz), p(x, y + dy, z + dz)
  ], colors.top, colors.stroke || 'rgba(255, 255, 255, 0.16)', 0.9);
}

function drawCorrugatedContainer(ctx, x, y, z, dx, dy, dz, palette, ox, oy) {
  drawIsoBox(ctx, x, y, z, dx, dy, dz, palette, ox, oy);
  const p = (px, py, pz) => isoProject(px, py, pz, ox, oy);
  // Vertical corrugation ribs on the long +y face
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.24)';
  ctx.lineWidth = 1.2;
  const ribStep = 7;
  for (let rx = x + ribStep; rx < x + dx - 3; rx += ribStep) {
    const a = p(rx, y + dy, z + 2);
    const b = p(rx, y + dy, z + dz - 2);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // Double container doors + locking bars on the +x end face
  const midY = y + dy / 2;
  const d1 = p(x + dx, midY, z + 1);
  const d2 = p(x + dx, midY, z + dz - 1);
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.65)';
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(d1.x, d1.y); ctx.lineTo(d2.x, d2.y); ctx.stroke();
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
  ctx.lineWidth = 1;
  for (const offset of [-4, 4]) {
    const l1 = p(x + dx, midY + offset, z + 3);
    const l2 = p(x + dx, midY + offset, z + dz - 3);
    ctx.beginPath(); ctx.moveTo(l1.x, l1.y); ctx.lineTo(l2.x, l2.y); ctx.stroke();
  }
}

function drawIsoTruck(ctx, x, y, isAnomaly, ox, oy) {
  const p = (px, py, pz) => isoProject(px, py, pz, ox, oy);
  // Chassis shadow
  fillPoly(ctx, [
    p(x - 2, y + 2, 0), p(x + 70, y + 2, 0),
    p(x + 70, y + 28, 0), p(x - 2, y + 28, 0)
  ], 'rgba(2, 6, 16, 0.58)');
  // Trailer container
  const trailerPalette = isAnomaly
    ? { top: '#fb7185', left: '#e11d48', right: '#9f1239' }
    : { top: '#38bdf8', left: '#0284c7', right: '#075985' };
  drawCorrugatedContainer(ctx, x, y, 6, 46, 22, 24, trailerPalette, ox, oy);
  // Truck tractor cab in front (+x)
  drawIsoBox(ctx, x + 48, y + 2, 5, 16, 18, 19, {
    top: '#e2e8f0', left: '#94a3b8', right: '#64748b'
  }, ox, oy);
  // Windshield on cab +x face
  fillPoly(ctx, [
    p(x + 64, y + 4, 14), p(x + 64, y + 18, 14),
    p(x + 64, y + 18, 22), p(x + 64, y + 4, 22)
  ], '#0f172a', '#38bdf8', 0.9);
  // Wheels along +y side
  for (const wx of [x + 10, x + 22, x + 56]) {
    const wc = p(wx, y + 22, 4);
    ctx.beginPath();
    ctx.ellipse(wc.x, wc.y, 4.5, 5.5, 0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#090d16';
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

function drawFbaWarehouse(ctx, x, y, isAnomaly, ox, oy) {
  const dx = 76, dy = 64, dz = 38;
  const p = (px, py, pz) => isoProject(px, py, pz, ox, oy);
  // Main warehouse solid body
  drawIsoBox(ctx, x, y, 0, dx, dy, dz, {
    top: '#1e293b',
    left: '#1e3a5f',
    right: '#132540',
    stroke: 'rgba(148, 163, 184, 0.32)'
  }, ox, oy);

  // Pitched gabled roof (2 opaque shaded slopes)
  const ridgeZ = dz + 20;
  const midY = y + dy / 2;
  const roofAccent = isAnomaly ? '#f59e0b' : '#10b981';
  const roofDark = isAnomaly ? '#b45309' : '#047857';
  // Back slope
  fillPoly(ctx, [
    p(x - 3, y - 2, dz), p(x + dx + 3, y - 2, dz),
    p(x + dx + 3, midY, ridgeZ), p(x - 3, midY, ridgeZ)
  ], roofDark, 'rgba(255, 255, 255, 0.16)', 0.9);
  // Front slope
  fillPoly(ctx, [
    p(x - 3, y + dy + 2, dz), p(x + dx + 3, y + dy + 2, dz),
    p(x + dx + 3, midY, ridgeZ), p(x - 3, midY, ridgeZ)
  ], roofAccent, 'rgba(255, 255, 255, 0.25)', 1);
  // Front gable triangle (+x end)
  fillPoly(ctx, [
    p(x + dx, y, dz), p(x + dx, y + dy, dz), p(x + dx, midY, ridgeZ)
  ], '#1e293b', 'rgba(255, 255, 255, 0.18)', 0.9);

  // 3 Loading dock bays with roll-up doors on the +y front wall
  for (let i = 0; i < 3; i++) {
    const bx = x + 10 + i * 21;
    fillPoly(ctx, [
      p(bx, y + dy, 0), p(bx + 14, y + dy, 0),
      p(bx + 14, y + dy, 17), p(bx, y + dy, 17)
    ], '#060c18', '#475569', 1);
    // Horizontal roll-up slats
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 0.8;
    for (let sz = 5; sz <= 14; sz += 4) {
      const a = p(bx + 1, y + dy, sz);
      const b = p(bx + 13, y + dy, sz);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    // Yellow dock safety canopy stripe
    fillPoly(ctx, [
      p(bx - 1, y + dy, 17), p(bx + 15, y + dy, 17),
      p(bx + 15, y + dy, 19.5), p(bx - 1, y + dy, 19.5)
    ], '#fbbf24');
  }

  // Rooftop "FBA" sign block
  const signPt = p(x + dx / 2, midY, ridgeZ + 6);
  ctx.fillStyle = 'rgba(7, 13, 25, 0.9)';
  ctx.strokeStyle = roofAccent;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(signPt.x - 22, signPt.y - 11, 44, 18, 5);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 10.5px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('FBA', signPt.x, signPt.y + 1.5);
}

function drawCallout(ctx, pt, text, borderColor, textColor = '#eaf1fb') {
  ctx.font = '600 11.5px "Noto Sans SC", system-ui, sans-serif';
  const w = Math.max(66, ctx.measureText(text).width + 18);
  const h = 23;
  const rx = pt.x - w / 2;
  const ry = pt.y - h / 2;
  ctx.fillStyle = 'rgba(6, 12, 24, 0.92)';
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(rx, ry, w, h, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pt.x, pt.y + 0.5);
}

function renderIsoFreightCanvas(ts = 0) {
  const canvas = document.getElementById('iso-freight-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = 680, H = 360;
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width = W * dpr;
    canvas.height = H * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const ox = 248;
  const oy = 112;
  const p = (x, y, z = 0) => isoProject(x, y, z, ox, oy);
  const isAnom = isoSceneState.isAnomaly;
  const t = reducedMotion ? 0.35 : (ts / 2600) % 1;

  // 1. Isometric base deck with thickness
  drawIsoBox(ctx, -30, -30, -10, 410, 170, 10, {
    top: '#0c162b', left: '#081021', right: '#060c1a', stroke: 'rgba(34, 211, 238, 0.25)'
  }, ox, oy);

  // Grid lines on deck
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.09)';
  ctx.lineWidth = 1;
  for (let gx = -20; gx <= 370; gx += 30) {
    const a = p(gx, -28, 0), b = p(gx, 138, 0);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (let gy = -20; gy <= 130; gy += 30) {
    const a = p(-28, gy, 0), b = p(378, gy, 0);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  // 2. Freight route lane from Origin Yard to Destination FBA Warehouse
  const roadY1 = 56, roadY2 = 88;
  fillPoly(ctx, [
    p(30, roadY1, 0.5), p(300, roadY1, 0.5),
    p(300, roadY2, 0.5), p(30, roadY2, 0.5)
  ], 'rgba(15, 28, 52, 0.95)', 'rgba(34, 211, 238, 0.32)', 1);

  // Luminous flowing trajectory beam
  const trackY = 72;
  const startPt = p(52, trackY, 1.5);
  const endPt = p(286, trackY, 1.5);
  const grad = ctx.createLinearGradient(startPt.x, startPt.y, endPt.x, endPt.y);
  grad.addColorStop(0, '#0284c7');
  grad.addColorStop(0.5, isAnom ? '#fbbf24' : '#22d3ee');
  grad.addColorStop(1, isAnom ? '#f43f5e' : '#34d399');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(startPt.x, startPt.y); ctx.lineTo(endPt.x, endPt.y); ctx.stroke();

  // Animated luminous light pulses along the route
  for (let i = 0; i < 3; i++) {
    const phase = (t + i / 3) % 1;
    const fx = 52 + phase * 230;
    const fp = p(fx, trackY, 2);
    const glow = ctx.createRadialGradient(fp.x, fp.y, 1, fp.x, fp.y, 13);
    glow.addColorStop(0, isAnom ? 'rgba(251, 113, 133, 0.95)' : 'rgba(165, 243, 252, 0.95)');
    glow.addColorStop(1, 'rgba(34, 211, 238, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(fp.x, fp.y, 13, 0, Math.PI * 2); ctx.fill();
  }

  // Red overshoot extension past destination warehouse when delayed/overdue
  if (isAnom) {
    const ovStart = p(302, trackY, 2);
    const ovEnd = p(368, trackY, 2);
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 5;
    ctx.shadowColor = 'rgba(244, 63, 94, 0.9)';
    ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(ovStart.x, ovStart.y); ctx.lineTo(ovEnd.x, ovEnd.y); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // 3. Origin Stacked Corrugated Containers (2 tiers: 2 bottom + 1 top)
  drawCorrugatedContainer(ctx, -10, 12, 0, 56, 24, 22, { top: '#0ea5e9', left: '#0369a1', right: '#0c4a6e' }, ox, oy);
  drawCorrugatedContainer(ctx, -10, 42, 0, 56, 24, 22, { top: '#14b8a6', left: '#0f766e', right: '#115e59' }, ox, oy);
  drawCorrugatedContainer(ctx, -4, 22, 22, 48, 24, 20, { top: '#38bdf8', left: '#0284c7', right: '#075985' }, ox, oy);

  // 4. Mid-route Isometric Freight Truck
  let truckX = 120;
  if (isoSceneState.status === 'on_time' || isoSceneState.status === 'early') truckX = 172;
  else if (isoSceneState.status === 'delayed') truckX = 186;
  else if (isoSceneState.status === 'overdue') truckX = 146;
  drawIsoTruck(ctx, truckX, 60, isAnom, ox, oy);

  // 5. Destination FBA Warehouse (gabled roof + 3 loading docks)
  drawFbaWarehouse(ctx, 266, 26, isAnom, ox, oy);

  // 6. Pulsing beacon ring at destination dock
  const beacon = p(298, 96, 1);
  const pulseR = reducedMotion ? 16 : 8 + ((ts / 1400) % 1) * 20;
  const pulseAlpha = reducedMotion ? 0.55 : Math.max(0, 0.85 - ((ts / 1400) % 1) * 0.85);
  ctx.strokeStyle = isAnom ? `rgba(244, 63, 94, ${pulseAlpha})` : `rgba(52, 211, 153, ${pulseAlpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(beacon.x, beacon.y, pulseR, pulseR * 0.52, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 7. Crisp callout labels
  drawCallout(ctx, p(18, 28, 56), isoSceneState.originLabel, 'rgba(56, 189, 248, 0.7)');
  drawCallout(ctx, p(truckX + 30, 68, 48), isoSceneState.carrierLabel, isAnom ? 'rgba(244, 63, 94, 0.8)' : 'rgba(34, 211, 238, 0.7)', isAnom ? '#fecdd3' : '#eaf1fb');
  drawCallout(ctx, p(304, 52, 86), isoSceneState.destLabel, isAnom ? 'rgba(251, 191, 36, 0.8)' : 'rgba(52, 211, 153, 0.75)');
  if (isAnom && isoSceneState.delayText) {
    drawCallout(ctx, p(350, 80, 18), isoSceneState.delayText, '#f43f5e', '#fecdd3');
  }
}

function startIsoAnimation() {
  if (isoSceneState.rafId) cancelAnimationFrame(isoSceneState.rafId);
  if (reducedMotion) {
    renderIsoFreightCanvas(0);
    return;
  }
  const tick = ts => {
    renderIsoFreightCanvas(ts);
    isoSceneState.rafId = requestAnimationFrame(tick);
  };
  isoSceneState.rafId = requestAnimationFrame(tick);
}

function renderHero() {
  const s = getSelectedShipment();
  const stage = document.getElementById('hero-stage');
  const devBox = document.getElementById('hero-deviation-box');
  const pill = document.getElementById('hero-status-pill');
  const btnEv = document.getElementById('hero-btn-evidence');
  const btnPrice = document.getElementById('hero-btn-pricing');

  if (!s) {
    stage.classList.remove('is-anomaly');
    devBox.classList.remove('is-alert');
    Object.assign(isoSceneState, {
      status: 'unknown', isAnomaly: false,
      originLabel: '起运港堆场', carrierLabel: '待同步', destLabel: '目的 FBA 仓', delayText: ''
    });
    renderIsoFreightCanvas(0);
    document.getElementById('hero-plan-label').textContent = '尚未加载货件';
    document.getElementById('hero-shipment-id').textContent = '—';
    pill.className = 'status-pill is-unknown';
    pill.textContent = '空列表';
    document.getElementById('hero-deviation-value').textContent = '—';
    document.getElementById('hero-deviation-sub').textContent = '请点击右上角「同步真实领星」或「加载脱敏演示」';
    document.getElementById('hero-promised').textContent = '—';
    document.getElementById('hero-actual').textContent = '—';
    document.getElementById('hero-dest-tz').textContent = '—';
    document.getElementById('hero-defect-summary').textContent = '—';
    btnEv.disabled = true;
    btnPrice.disabled = true;
    return;
  }

  const st = s.arrival?.status || 'unknown';
  const meta = STATUS_META[st] || STATUS_META.unknown;
  const isAnom = st === 'delayed' || st === 'overdue';
  stage.classList.toggle('is-anomaly', isAnom);
  devBox.classList.toggle('is-alert', isAnom);

  const primaryLeg = s.legs[0] || null;
  const dev = s.arrival?.deviationDays;
  Object.assign(isoSceneState, {
    status: st,
    isAnomaly: isAnom,
    originLabel: s.shipmentSn ? `发货单 ${s.shipmentSn}` : `店铺 ${s.sid}`,
    carrierLabel: primaryLeg ? primaryLeg.carrierName : '未指定物流商',
    destLabel: s.destFc ? `FBA ${s.destFc}` : '目的仓未标',
    delayText: st === 'delayed' ? `延迟 +${dev} 天` : st === 'overdue' ? `逾期 +${dev} 天` : ''
  });
  renderIsoFreightCanvas(performance.now());

  document.getElementById('hero-plan-label').textContent = s.planId
    ? `同批计划 ${s.planId} · 店铺 ${s.sid}`
    : `无计划独立货件 · 店铺 ${s.sid}`;
  document.getElementById('hero-shipment-id').textContent = s.fbaShipmentId;
  pill.className = `status-pill is-${st}`;
  pill.textContent = meta.text;

  const devEl = document.getElementById('hero-deviation-value');
  const devSub = document.getElementById('hero-deviation-sub');
  if (st === 'delayed') {
    devEl.textContent = `+${dev} 天延迟`;
    devSub.textContent = `晚于承诺止日 ${s.promisedEnd || '—'}，关联承运段：${s.legs.map(l => l.carrierName).join(' / ') || '未知'}`;
  } else if (st === 'overdue') {
    devEl.textContent = `已逾期 +${dev} 天`;
    devSub.textContent = `尚无有效签收/POD，已超承诺止日 ${s.promisedEnd || '—'}`;
  } else if (st === 'early') {
    devEl.textContent = `${dev} 天（提前）`;
    devSub.textContent = `早于承诺起日 ${s.promisedStart || '—'} 妥投`;
  } else if (st === 'on_time') {
    devEl.textContent = '0 天 · 按期';
    devSub.textContent = '在承诺到达窗口内妥投，符合履约预期';
  } else if (st === 'in_transit') {
    devEl.textContent = '在途中';
    devSub.textContent = `未到承诺止日 ${s.promisedEnd || '—'}，等待签收或 POD`;
  } else {
    devEl.textContent = '未知';
    devSub.textContent = !s.destTimezone
      ? '缺少目的仓时区，无法按当地日历日判定；可点击下方补录'
      : '缺少有效签收或承运 POD（接收/上架不作妥投依据）';
  }

  document.getElementById('hero-promised').textContent = s.promisedStart
    ? (s.promisedStart === s.promisedEnd ? s.promisedStart : `${s.promisedStart} ~ ${s.promisedEnd}`)
    : '缺失';
  document.getElementById('hero-actual').textContent = s.arrival?.actualLocalDay
    ? `${s.arrival.actualLocalDay} (${s.arrival.actualEventSource})`
    : '未知 / 未妥投';
  document.getElementById('hero-dest-tz').textContent = `${s.destFc || '—'} · ${s.destTimezone || '时区缺失'}`;

  const verifiedText = Object.entries(s.verifiedDefectFees || {}).map(([c, v]) => `${c} ${v}`).join(', ') || '0';
  const warnText = s.warningDefectAmount ? `${s.warningDefectCurrency || ''} ${s.warningDefectAmount}` : '无';
  document.getElementById('hero-defect-summary').textContent = `已核 ${verifiedText} / 预警 ${warnText}`;

  btnEv.disabled = false;
  btnEv.onclick = () => openEvidenceModal(s.sid, s.fbaShipmentId);

  const priceableLeg = s.legs.find(l => !l.settlementBlocked) || null;
  btnPrice.disabled = !priceableLeg;
  btnPrice.onclick = () => { if (priceableLeg) openPricingModal(priceableLeg.id); };
}

function renderShipmentRail() {
  const listbox = document.getElementById('shipment-listbox');
  const filtered = getFilteredShipments();
  const totalCount = Math.max(state.shipmentTotal, state.shipments.length);
  document.getElementById('rail-count').textContent = state.shipments.length < totalCount
    ? `${filtered.length} / 已载 ${state.shipments.length}（共 ${totalCount}）`
    : `${filtered.length} / ${totalCount}`;

  const footer = document.getElementById('rail-footer');
  const pageInfo = document.getElementById('rail-page-info');
  const hasMore = state.shipments.length < totalCount;
  footer.hidden = !hasMore;
  if (hasMore) {
    pageInfo.textContent = `已加载 ${state.shipments.length} / 共 ${totalCount} 票`;
  }

  if (!filtered.length) {
    listbox.innerHTML = '<p class="section-hint" style="padding:10px">无匹配货件，请调整筛选条件或先同步数据。</p>';
    return;
  }

  listbox.innerHTML = filtered.map(s => {
    const key = shipmentKey(s);
    const selected = key === state.selectedKey;
    const st = s.arrival?.status || 'unknown';
    const meta = STATUS_META[st] || STATUS_META.unknown;
    const isAnom = st === 'delayed' || st === 'overdue';
    const devLabel = isAnom && s.arrival?.deviationDays != null
      ? `+${s.arrival.deviationDays}天`
      : st === 'early' && s.arrival?.deviationDays != null
        ? `${s.arrival.deviationDays}天`
        : meta.text;
    const planTag = s.planId ? `计划 ${s.planId}` : '无计划独立';
    const carrier = s.legs[0]?.carrierName || '未指定';

    return `<button type="button" role="option"
      class="rail-item ${selected ? 'is-selected' : ''} ${isAnom ? 'is-anomaly' : ''}"
      data-key="${escHtml(key)}"
      aria-selected="${selected ? 'true' : 'false'}">
      <div class="rail-item-top">
        <span class="rail-item-id mono">${escHtml(s.fbaShipmentId)}</span>
        <span class="pill ${meta.cls}">${escHtml(devLabel)}</span>
      </div>
      <div class="rail-item-meta">
        <span>${escHtml(planTag)}</span>
        <span>${escHtml(carrier)}</span>
      </div>
      <div class="rail-item-meta mono">
        <span>店铺 ${escHtml(s.sid)} · ${escHtml(s.destFc || '—')}</span>
        <span>${s.settlementBlocked ? '阻断结算' : (s.weightFormatted ? `${escHtml(s.weightFormatted)} ${escHtml(s.weightUnit || '')}` : '缺重')}</span>
      </div>
    </button>`;
  }).join('');

  for (const btn of listbox.querySelectorAll('.rail-item')) {
    btn.addEventListener('click', () => selectShipment(btn.dataset.key));
  }
}

function renderSelectedDetail() {
  const s = getSelectedShipment();
  renderSelectedLegs(s);
  renderSelectedTimeline(s);
  renderBatchAxis(s);
}

function renderSelectedLegs(s) {
  const root = document.getElementById('selected-legs');
  const metaEl = document.getElementById('legs-meta');
  if (!s) {
    metaEl.textContent = '请选择左侧货件查看承运段与计价';
    root.innerHTML = '<p class="section-hint">暂无选中货件</p>';
    return;
  }
  metaEl.textContent = `共 ${s.legs.length} 个承运段 · 发货单 ${s.shipmentSn || '缺失'} · 映射 ${s.mappingVersion}`;

  root.innerHTML = s.legs.map(leg => {
    const p = leg.pricing;
    const pricingHtml = leg.settlementBlocked
      ? `<span class="pill pill-red">待补数 / 阻断结算</span><div class="leg-sub">${escHtml(leg.blockReason || '缺少重量或存在歧义')}</div>`
      : p
        ? `<div class="mono">${escHtml(p.currency)} ${escHtml(p.unitPriceFormatted)} / ${escHtml(leg.weightUnit)}</div>
           <div class="leg-sub mono">计算 ${escHtml(p.calculatedAmount)} → <strong>生效 ${escHtml(p.effectiveAmount)}</strong></div>
           ${p.isOverridden ? `<span class="pill pill-amber">手改差额 ${escHtml(p.overrideDelta)}</span>` : ''}
           ${p.sourceWeightChanged ? `<span class="pill pill-red">源重变更 ${escHtml(p.previousWeightFormatted)}→${escHtml(leg.weightFormatted)}</span>` : ''}`
        : '<span class="pill pill-muted">尚未维护单价</span>';

    return `<div class="leg-card">
      <div>
        <div class="leg-title">${escHtml(leg.carrierName)} <span class="section-hint mono">(${escHtml(leg.carrierId)})</span></div>
        <div class="leg-sub mono">运单 ${escHtml(leg.trackingNo || '—')} · 记录 ${escHtml(leg.logisticsRecordId)}</div>
      </div>
      <div class="mono">
        <div>${leg.weightFormatted ? `${escHtml(leg.weightFormatted)} ${escHtml(leg.weightUnit || '')}` : '重量缺失'}</div>
        <div class="leg-sub">来源 ${escHtml(leg.weightSource)} · 范围 ${escHtml(leg.pricingScope)}</div>
      </div>
      <div>${pricingHtml}</div>
      <div>
        <button type="button" class="btn btn-secondary btn-sm btn-leg-price" data-leg-id="${escHtml(leg.id)}" ${leg.settlementBlocked ? 'disabled' : ''}>计价 / 改价</button>
      </div>
    </div>`;
  }).join('');

  for (const btn of root.querySelectorAll('.btn-leg-price')) {
    btn.addEventListener('click', () => openPricingModal(btn.dataset.legId));
  }
}

function renderSelectedTimeline(s) {
  const root = document.getElementById('selected-timeline');
  if (!s) {
    root.innerHTML = '<li class="timeline-step is-missing"><span class="step-node">1</span><div class="step-card"><span class="step-label">暂无事件</span></div></li>';
    return;
  }

  const st = s.arrival?.status || 'unknown';
  const promisedRange = s.promisedStart
    ? (s.promisedStart === s.promisedEnd ? s.promisedStart : `${s.promisedStart} ~ ${s.promisedEnd}`)
    : null;
  const hasActual = Boolean(s.arrival?.actualLocalDay);
  const dev = s.arrival?.deviationDays;

  const actualCallout = st === 'delayed' && dev != null
    ? `延迟 ${dev} 天`
    : st === 'overdue' && dev != null
      ? `已逾期 ${dev} 天`
      : null;

  // Chronological order: 发运出库 -> 承诺到达窗口 -> 实际妥投(POD/签收) -> FBA首次接收 -> FBA上架
  const steps = [
    {
      cls: s.shippedAt ? '' : 'is-missing',
      tag: '真实事件',
      label: '发运出库',
      value: s.shippedAt ? s.shippedAt.slice(0, 10) : '来源缺失',
      note: s.shippedAt || '上游未提供发货时间（不虚构启运/清关/在途时间）'
    },
    {
      cls: promisedRange ? 'is-window' : 'is-missing',
      tag: '承诺基准',
      label: '承诺到达窗口',
      value: promisedRange || '缺失（无法判定）',
      note: s.destTimezone ? `冻结仓时区 ${s.destTimezone}` : '目的仓时区缺失（未默认美国/洛杉矶）'
    },
    {
      cls: hasActual ? (st === 'delayed' ? 'is-delayed' : 'is-actual') : (st === 'overdue' ? 'is-delayed' : 'is-missing'),
      tag: '妥投判定依据',
      label: '实际妥投 (签收 / POD)',
      value: hasActual ? `${s.arrival.actualLocalDay}` : '未知 / 缺失',
      callout: actualCallout,
      note: EVENT_SOURCE_LABELS[s.arrival?.actualEventSource] || s.arrival?.actualEventSource || '来源缺失'
    },
    {
      cls: s.firstReceivedAt ? '' : 'is-missing',
      tag: '仓内事件(非妥投)',
      label: 'FBA 首次接收',
      value: s.firstReceivedAt ? s.firstReceivedAt.slice(0, 10) : '未记录 / 缺失',
      note: '仅作仓内追踪，不充当实际妥投依据'
    },
    {
      cls: s.putawayAt ? '' : 'is-missing',
      tag: '仓内事件(非妥投)',
      label: 'FBA 上架完成',
      value: s.putawayAt ? s.putawayAt.slice(0, 10) : '未记录 / 缺失',
      note: '仅作仓内追踪，不充当实际妥投依据'
    }
  ];

  root.innerHTML = steps.map((step, idx) => `<li class="timeline-step ${step.cls}">
    <span class="step-node" aria-hidden="true">${idx + 1}</span>
    <div class="step-card">
      <div class="step-label"><span>${escHtml(step.label)}</span><span class="step-tag">${escHtml(step.tag)}</span></div>
      <div class="step-value mono">${escHtml(step.value)}</div>
      ${step.callout ? `<span class="step-delay-callout mono">${escHtml(step.callout)}</span>` : ''}
      <div class="step-note">${escHtml(step.note)}</div>
    </div>
  </li>`).join('');
}

function renderBatchAxis(selected) {
  const root = document.getElementById('batch-axis-container');
  const sub = document.getElementById('batch-compare-subtitle');

  if (!selected) {
    sub.textContent = '选择货件后展示同批共享日期轴对比';
    root.innerHTML = '';
    return;
  }

  if (!selected.batchGroupId) {
    sub.textContent = `${selected.fbaShipmentId} 无共同发运计划号，保持独立追踪（不与同日其他计划混并）`;
    root.innerHTML = '<p class="section-hint">该货件为无计划独立货件，左侧导航可直接随时选中并维护其计价与 POD。</p>';
    return;
  }

  const batch = state.batches.find(b => b.batchGroupId === selected.batchGroupId);
  const peers = batch ? batch.shipments : state.shipments.filter(x => x.batchGroupId === selected.batchGroupId);
  sub.textContent = `计划 ${selected.planId}（共 ${peers.length} 票 · 异常 ${peers.filter(p => ['delayed', 'overdue'].includes(p.arrival?.status)).length} 票）· 点击任意行切换聚焦`;

  // Compute shared date axis bounds across all shipments in this batch
  const allDays = [];
  for (const p of peers) {
    const ps = parseIsoDayMs(p.promisedStart);
    const pe = parseIsoDayMs(p.promisedEnd);
    const act = parseIsoDayMs(p.arrival?.actualLocalDay);
    if (ps != null) allDays.push(ps);
    if (pe != null) allDays.push(pe);
    if (act != null) allDays.push(act);
  }
  if (!allDays.length) {
    root.innerHTML = '<p class="section-hint">该批次缺少承诺窗口与实际到达日期，无法绘制共享日期轴。</p>';
    return;
  }

  const dayMs = 86400000;
  const minMs = Math.min(...allDays) - 2 * dayMs;
  const maxMs = Math.max(...allDays) + 2 * dayMs;
  const span = Math.max(dayMs, maxMs - minMs);
  const pct = ms => Math.max(0, Math.min(100, ((ms - minMs) / span) * 100));
  const fmtDay = ms => new Date(ms).toISOString().slice(0, 10);

  const midMs = Math.round((minMs + maxMs) / 2);
  const scaleHtml = `<div class="axis-scale mono">
    <span>${fmtDay(minMs)}</span>
    <span>${fmtDay(midMs)}</span>
    <span>${fmtDay(maxMs)}</span>
  </div>`;

  const rowsHtml = peers.map(p => {
    const key = shipmentKey(p);
    const isSel = key === state.selectedKey;
    const st = p.arrival?.status || 'unknown';
    const isAnom = st === 'delayed' || st === 'overdue';
    const ps = parseIsoDayMs(p.promisedStart);
    const pe = parseIsoDayMs(p.promisedEnd) ?? ps;
    const act = parseIsoDayMs(p.arrival?.actualLocalDay);

    const winLeft = ps != null ? pct(ps) : 0;
    const winWidth = ps != null && pe != null ? Math.max(1.5, pct(pe + dayMs) - pct(ps)) : 0;

    let barsHtml = '';
    if (winWidth > 0) {
      barsHtml += `<div class="axis-window-band" style="left:${winLeft.toFixed(2)}%;width:${winWidth.toFixed(2)}%"></div>`;
    }
    if (act != null && ps != null) {
      const startPos = Math.min(pct(ps), pct(act));
      const normalEnd = pe != null ? Math.min(pct(act + dayMs), pct(pe + dayMs)) : pct(act + dayMs);
      if (normalEnd > startPos) {
        barsHtml += `<div class="axis-bar-normal" style="left:${startPos.toFixed(2)}%;width:${Math.max(2, normalEnd - startPos).toFixed(2)}%"></div>`;
      }
      if (pe != null && act > pe) {
        const delayStart = pct(pe + dayMs);
        const delayEnd = pct(act + dayMs);
        barsHtml += `<div class="axis-bar-delay" style="left:${delayStart.toFixed(2)}%;width:${Math.max(3, delayEnd - delayStart).toFixed(2)}%" title="延迟 +${p.arrival.deviationDays} 天"></div>`;
      }
    } else if (ps != null) {
      barsHtml += `<div class="axis-bar-unknown" style="left:${winLeft.toFixed(2)}%;width:${Math.max(8, winWidth).toFixed(2)}%"></div>`;
    }

    const badgeText = st === 'delayed'
      ? `+${p.arrival.deviationDays} 天延迟`
      : st === 'overdue'
        ? `逾期 +${p.arrival.deviationDays} 天`
        : st === 'early'
          ? `提前 ${p.arrival.deviationDays} 天`
          : st === 'on_time'
            ? '按期'
            : (STATUS_META[st]?.text || '未知');
    const badgeCls = STATUS_META[st]?.cls || 'pill-muted';

    return `<button type="button" class="axis-row ${isSel ? 'is-selected' : ''} ${isAnom ? 'is-anomaly' : ''}" data-key="${escHtml(key)}" aria-pressed="${isSel ? 'true' : 'false'}">
      <div>
        <div class="mono" style="font-weight:700;font-size:12px">${escHtml(p.fbaShipmentId)}</div>
        <div class="section-hint">${escHtml(p.legs[0]?.carrierName || '—')}</div>
      </div>
      <div class="axis-lane">${barsHtml}</div>
      <div class="axis-row-badge"><span class="pill ${badgeCls}">${escHtml(badgeText)}</span></div>
    </button>`;
  }).join('');

  root.innerHTML = scaleHtml + rowsHtml;
  for (const row of root.querySelectorAll('.axis-row')) {
    row.addEventListener('click', () => selectShipment(row.dataset.key));
  }
}

/* =========================================================================
   弹窗：计价/改价 与 POD/时区补录（沿用原 API 契约）
   ========================================================================= */
async function openPricingModal(legId) {
  let targetLeg = null;
  let targetShipment = null;
  for (const s of state.shipments) {
    const found = s.legs.find(l => l.id === legId);
    if (found) { targetLeg = found; targetShipment = s; break; }
  }
  if (!targetLeg) return;

  const dialog = document.getElementById('pricing-dialog');
  const form = document.getElementById('pricing-form');
  form.elements.legId.value = legId;
  form.elements.expectedVersion.value = String(targetLeg.pricing?.version ?? 0);
  form.elements.unitPrice.value = targetLeg.pricing?.unitPriceFormatted ?? '';
  form.elements.currency.value = targetLeg.pricing?.currency ?? 'USD';
  form.elements.manualOverrideAmount.value = targetLeg.pricing?.isOverridden ? targetLeg.pricing.effectiveAmount : '';
  form.elements.overrideReason.value = targetLeg.pricing?.overrideReason ?? '';

  document.getElementById('pricing-context').innerHTML =
    `货件 <strong class="mono">${escHtml(targetShipment.fbaShipmentId)}</strong> · 物流商 <strong>${escHtml(targetLeg.carrierName)}</strong> · 重量 <strong class="mono">${escHtml(targetLeg.weightFormatted)} ${escHtml(targetLeg.weightUnit)}</strong> · 当前版本 v${targetLeg.pricing?.version ?? 0}`;

  const auditBox = document.getElementById('pricing-audit-list');
  auditBox.textContent = '加载审计记录…';
  dialog.showModal();
  try {
    const { audit } = await api(`/api/logistics/pricing/audit?legId=${encodeURIComponent(legId)}`);
    auditBox.innerHTML = audit.length
      ? '<strong>审计历史：</strong>' + audit.map(a =>
          `<div>v${a.version} · ${escHtml(a.action)} · 操作人 ${escHtml(a.operator)} · 生效 ${escHtml(a.after?.effective_amount)} (差额 ${escHtml(a.after?.override_delta)}) · ${escHtml(a.reason || '')}</div>`
        ).join('')
      : '暂无历史改价记录';
  } catch (err) {
    auditBox.textContent = `审计读取失败: ${err.message}`;
  }
}

async function openEvidenceModal(sid, fbaShipmentId) {
  const s = state.shipments.find(x => x.sid === sid && x.fbaShipmentId === fbaShipmentId);
  if (!s) return;
  const dialog = document.getElementById('evidence-dialog');
  const form = document.getElementById('evidence-form');
  form.elements.sid.value = sid;
  form.elements.fbaShipmentId.value = fbaShipmentId;
  form.elements.destTimezone.value = s.destTimezone || '';
  form.elements.destCountry.value = s.destCountry || '';
  form.elements.actualDeliveredAt.value = s.actualDeliveredAt || '';
  form.elements.evidenceRef.value = '';
  document.getElementById('evidence-context').innerHTML =
    `货件 <strong class="mono">${escHtml(fbaShipmentId)}</strong> · 店铺 ${escHtml(sid)} · 目的仓 ${escHtml(s.destFc || '—')} · 当前时区 ${escHtml(s.destTimezone || '缺失')}`;
  const histBox = document.getElementById('evidence-history-list');
  histBox.textContent = '加载补录历史…';
  dialog.showModal();
  try {
    const { history } = await api(`/api/logistics/shipments/evidence?sid=${encodeURIComponent(sid)}&fbaShipmentId=${encodeURIComponent(fbaShipmentId)}`);
    histBox.innerHTML = history.length
      ? '<strong>补录历史：</strong>' + history.map(h =>
          `<div>${escHtml(h.created_at)} · ${escHtml(h.operator)} · 时区 ${escHtml(h.dest_timezone || '—')} · POD ${escHtml(h.actual_delivered_at || '—')} (${escHtml(h.actual_event_source || '—')}) · 凭证 ${escHtml(h.evidence_ref)}</div>`
        ).join('')
      : '暂无补录记录';
  } catch (err) {
    histBox.textContent = `历史读取失败: ${err.message}`;
  }
}

/* =========================================================================
   Tab 2/3/4: 缺陷费与冲销、自动月结对账、物流商评级（保持既有 API 口径）
   ========================================================================= */
function renderDefects() {
  const tbody = document.getElementById('defects-tbody');
  if (!state.fees.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="section-hint">暂无缺陷费记录（无原账单时已核缺陷费为 0）</td></tr>';
    return;
  }
  tbody.innerHTML = state.fees.map(f => {
    const st = FEE_STATUS_LABELS[f.status] || { text: f.status, cls: 'pill-muted' };
    const allocText = (f.allocations || []).map(a => `${a.sid}:${a.fba_shipment_id} (${a.currency} ${a.allocated_amount})`).join('<br>') || '未分摊';
    const canReverse = !f.reversed_fee_id && f.status !== 'reversed';
    return `<tr>
      <td class="mono">${escHtml(f.source_bill_no)} / ${escHtml(f.source_line_no)}${f.reversed_fee_id ? `<div class="section-hint">冲销原单 ${escHtml(f.reversed_fee_id.slice(0, 8))}</div>` : ''}</td>
      <td class="mono">${escHtml(f.occurred_date)} / ${escHtml(f.booking_month)}</td>
      <td>${escHtml(f.carrier_name || f.carrier_id || '未归责')}</td>
      <td class="mono"><strong>${escHtml(f.currency)} ${escHtml(f.total_amount)}</strong></td>
      <td>
        <span class="pill ${st.cls}">${st.text}</span>
        <div class="section-hint">${escHtml(f.reversal_reason || f.responsibility_basis || '—')}</div>
      </td>
      <td class="mono">${allocText}</td>
      <td>${canReverse ? `<button type="button" class="btn btn-secondary btn-sm btn-reverse-fee" data-fee-id="${escHtml(f.id)}">次月冲销</button>` : '—'}</td>
    </tr>`;
  }).join('');

  for (const btn of tbody.querySelectorAll('.btn-reverse-fee')) {
    btn.addEventListener('click', async () => {
      const reason = prompt('请输入冲销原因（将保留原记录并在次月生成引用原行的冲销记录）：', '承运商申诉通过核减');
      if (!reason) return;
      const month = prompt('请输入冲销入账月（YYYY-MM）：', '2026-06');
      if (!month) return;
      try {
        await api('/api/logistics/defect-fees/reverse', {
          method: 'POST',
          body: JSON.stringify({ feeId: btn.dataset.feeId, reversalMonth: month, reversalDate: `${month}-01`, reason })
        });
        showBanner('已完成冲销并保留原缺陷费记录');
        await refreshAll();
      } catch (err) {
        showBanner(`冲销失败：${err.message}`, true);
      }
    });
  }
}

function renderStatements() {
  const tbody = document.getElementById('statements-tbody');
  if (!state.statements.length) {
    tbody.innerHTML = '<tr><td colspan="12" class="section-hint">暂无月结对账单，请选择月份点击「生成 / 重算月结账单」</td></tr>';
    return;
  }
  tbody.innerHTML = state.statements.map(s => {
    const isConfirmed = s.status === 'confirmed';
    const typeLabel = s.statementType === 'adjustment' ? `调整单(引用 ${s.originalStatementId})` : '月结单';
    return `<tr>
      <td class="mono"><strong>${escHtml(s.id)}</strong><div class="section-hint">${escHtml(typeLabel)}</div></td>
      <td class="mono">${escHtml(s.periodMonth)}</td>
      <td>${escHtml(s.carrierName)}</td>
      <td class="mono">${escHtml(s.currency)}</td>
      <td><span class="pill ${isConfirmed ? 'pill-green' : 'pill-amber'}">${isConfirmed ? '已确认冻结' : '草稿'}</span></td>
      <td class="mono">${escHtml(s.calculatedFreightAmount)}</td>
      <td class="mono">${escHtml(s.overrideDeltaAmount)}</td>
      <td class="mono">${escHtml(s.freightAmount)}</td>
      <td class="mono">${escHtml(s.defectDeductionAmount)}</td>
      <td class="mono"><strong>${escHtml(s.netPayableAmount)}</strong></td>
      <td class="mono">${s.pendingCount}</td>
      <td>
        <div class="filter-row">
          <button type="button" class="btn btn-secondary btn-sm btn-view-stmt" data-id="${escHtml(s.id)}">溯源</button>
          ${!isConfirmed ? `<button type="button" class="btn btn-primary btn-sm btn-confirm-stmt" data-id="${escHtml(s.id)}">确认冻结</button>` : ''}
          <a class="btn btn-secondary btn-sm" href="/api/logistics/settlements/${encodeURIComponent(s.id)}/export?format=csv">CSV</a>
        </div>
      </td>
    </tr>`;
  }).join('');

  for (const btn of tbody.querySelectorAll('.btn-view-stmt')) {
    btn.addEventListener('click', () => showStatementDetail(btn.dataset.id));
  }
  for (const btn of tbody.querySelectorAll('.btn-confirm-stmt')) {
    btn.addEventListener('click', async () => {
      try {
        await api('/api/logistics/settlements/confirm', {
          method: 'POST',
          body: JSON.stringify({ statementId: btn.dataset.id, operator: 'finance-lead' })
        });
        showBanner(`对账单 ${btn.dataset.id} 已确认并冻结`);
        await refreshAll();
      } catch (err) {
        showBanner(`确认失败：${err.message}`, true);
      }
    });
  }
}

function showStatementDetail(id) {
  const s = state.statements.find(x => x.id === id);
  if (!s) return;
  const sec = document.getElementById('statement-detail-section');
  sec.hidden = false;
  document.getElementById('statement-detail-title').textContent = `账单溯源明细 · ${s.id} (${s.periodMonth} / ${s.carrierName} / ${s.currency})`;
  const snap = s.snapshot || {};
  const freightRows = (snap.freightLines || []).map(l =>
    `<tr><td class="mono">${escHtml(l.fbaShipmentId)}</td><td class="mono">${escHtml(l.shipmentSn)}</td><td class="mono">${escHtml(l.weight)} ${escHtml(l.weightUnit)}</td><td class="mono">${escHtml(l.unitPrice)}</td><td class="mono">${escHtml(l.calculatedFreight)}</td><td class="mono">${escHtml(l.overrideDelta)}</td><td class="mono"><strong>${escHtml(l.effectiveFreight)}</strong></td></tr>`
  ).join('') || '<tr><td colspan="7" class="section-hint">无运费行</td></tr>';

  const defectRows = (snap.defectLines || []).map(d =>
    `<tr><td class="mono">${escHtml(d.sourceBillNo)}/${escHtml(d.sourceLineNo)}</td><td class="mono">${escHtml(d.fbaShipmentId || '—')}</td><td>${escHtml(d.lineType)}</td><td class="mono"><strong>${escHtml(d.amount)}</strong></td><td>${escHtml(d.reversalReason || d.responsibilityBasis || '')}</td></tr>`
  ).join('') || '<tr><td colspan="5" class="section-hint">无已核缺陷费/冲销行</td></tr>';

  const pendingRows = (snap.pendingItems || []).map(p =>
    `<li>${escHtml(p.type)} · ${escHtml(p.fbaShipmentId || p.sourceBillNo || '')} — ${escHtml(p.reason)}</li>`
  ).join('');

  document.getElementById('statement-detail-body').innerHTML = `
    <h3>运费明细行</h3>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>货件号</th><th>发货单号</th><th>重量</th><th>单价</th><th>计算价</th><th>改价差额</th><th>生效运费</th></tr></thead><tbody>${freightRows}</tbody></table></div>
    <h3>缺陷扣款与冲销行</h3>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>原账单/行号</th><th>关联货件</th><th>类型</th><th>金额</th><th>依据/原因</th></tr></thead><tbody>${defectRows}</tbody></table></div>
    ${pendingRows ? `<h3>待核/阻断项（未计入应付）</h3><ul>${pendingRows}</ul>` : ''}
  `;
}

function renderRatings() {
  const tbody = document.getElementById('ratings-tbody');
  if (!state.ratings.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="section-hint">暂无评级数据</td></tr>';
    return;
  }
  tbody.innerHTML = state.ratings.map(r => {
    const pg = r.peerGroup;
    const gradeCls = r.grade === 'A' ? 'pill-green' : r.grade === 'B' ? 'pill-cyan' : r.grade === 'C' ? 'pill-amber' : r.grade === 'D' ? 'pill-red' : 'pill-muted';
    const breakdown = r.scoreBreakdown
      ? `准时 ${r.scoreBreakdown.onTimePoints} + 单价 ${r.scoreBreakdown.pricePoints} + 无缺陷 ${r.scoreBreakdown.defectFreePoints}`
      : r.insufficientReason || '样本不足';
    return `<tr>
      <td class="mono">${escHtml(pg.routeLane)} / ${escHtml(pg.serviceLevel)}<div class="section-hint">${escHtml(pg.weightUnit)} · ${escHtml(pg.currency)}</div></td>
      <td><strong>${escHtml(r.carrierName)}</strong><div class="section-hint mono">${escHtml(r.ratingVersion)}</div></td>
      <td><span class="pill ${gradeCls}">${escHtml(r.grade)}</span> <strong class="mono">${r.totalScore ?? '—'}</strong></td>
      <td class="mono">${r.onTimeRate != null ? `${(r.onTimeRate * 100).toFixed(1)}%` : '—'}<div class="section-hint">分母 ${r.denominator} · 覆盖 ${(r.coverageRate * 100).toFixed(0)}%</div></td>
      <td class="mono">${r.overdueUndeliveredCount}</td>
      <td class="mono">${r.weightedUnitPrice ?? '—'} / ${r.groupMedianUnitPrice ?? '—'}</td>
      <td class="mono">${r.defectFreeRate != null ? `${(r.defectFreeRate * 100).toFixed(1)}%` : '—'} (${r.defectShipmentCount}票)</td>
      <td class="section-hint">${escHtml(breakdown)}</td>
    </tr>`;
  }).join('');
}

/* =========================================================================
   事件绑定、轻微 3D 倾斜与全键盘导航
   ========================================================================= */
function bindEvents() {
  // Subtle 3D tilt respecting prefers-reduced-motion
  if (!reducedMotion) {
    const tiltTarget = document.getElementById('hero-tilt-target');
    tiltTarget.addEventListener('pointermove', e => {
      const rect = tiltTarget.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      tiltTarget.style.setProperty('--tilt-x', `${(-ny * 6).toFixed(2)}deg`);
      tiltTarget.style.setProperty('--tilt-y', `${(nx * 8).toFixed(2)}deg`);
    });
    tiltTarget.addEventListener('pointerleave', () => {
      tiltTarget.style.setProperty('--tilt-x', '0deg');
      tiltTarget.style.setProperty('--tilt-y', '0deg');
    });
  }

  // Tab switching with ArrowLeft / ArrowRight keyboard support
  const tabs = [...document.querySelectorAll('.tab-btn')];
  const activateTab = tab => {
    for (const b of tabs) {
      const active = b === tab;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    }
    for (const panel of document.querySelectorAll('.tab-panel')) {
      panel.hidden = panel.id !== `panel-${tab.dataset.tab}`;
    }
  };
  for (let i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', () => activateTab(tabs[i]));
    tabs[i].addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = tabs[(i + 1) % tabs.length];
        next.focus();
        activateTab(next);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = tabs[(i - 1 + tabs.length) % tabs.length];
        prev.focus();
        activateTab(prev);
      }
    });
  }

  // Keyboard navigation on left shipment listbox (ArrowUp / ArrowDown / Home / End)
  const listbox = document.getElementById('shipment-listbox');
  listbox.addEventListener('keydown', e => {
    const items = [...listbox.querySelectorAll('.rail-item')];
    if (!items.length) return;
    const idx = items.findIndex(el => el.dataset.key === state.selectedKey);
    let nextIdx = idx;
    if (e.key === 'ArrowDown') nextIdx = idx < items.length - 1 ? idx + 1 : 0;
    else if (e.key === 'ArrowUp') nextIdx = idx > 0 ? idx - 1 : items.length - 1;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = items.length - 1;
    else return;
    e.preventDefault();
    const targetKey = items[nextIdx].dataset.key;
    selectShipment(targetKey);
    const updatedBtn = listbox.querySelector(`.rail-item[data-key="${CSS.escape(targetKey)}"]`);
    updatedBtn?.focus();
  });

  document.getElementById('filter-status').addEventListener('change', renderShipmentRail);
  document.getElementById('filter-search').addEventListener('input', renderShipmentRail);
  document.getElementById('btn-load-more').addEventListener('click', loadNextShipmentsPage);

  document.getElementById('btn-sync-live').addEventListener('click', async () => {
    try {
      showBanner('正在同步真实领星 FBA 货件与发货单详情…');
      const res = await api('/api/logistics/sync', { method: 'POST', body: JSON.stringify({ mode: 'live' }) });
      showBanner(`真实领星同步完成：共 ${res.shopCount} 个店铺`);
      await refreshAll();
    } catch (err) {
      showBanner(err.message, true);
    }
  });

  document.getElementById('btn-sync-demo').addEventListener('click', async () => {
    try {
      showBanner('正在加载脱敏演示数据…');
      const res = await api('/api/logistics/sync', { method: 'POST', body: JSON.stringify({ mode: 'demo' }) });
      showBanner(`脱敏演示数据已加载（${res.shopCount} 个演示店铺），请注意与真实领星数据区分`);
      await refreshAll();
    } catch (err) {
      showBanner(err.message, true);
    }
  });

  const pricingDialog = document.getElementById('pricing-dialog');
  document.getElementById('btn-close-pricing').addEventListener('click', () => pricingDialog.close());
  document.getElementById('btn-cancel-pricing').addEventListener('click', () => pricingDialog.close());
  document.getElementById('pricing-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/api/logistics/pricing', {
        method: 'POST',
        body: JSON.stringify({
          legId: fd.get('legId'),
          expectedVersion: Number(fd.get('expectedVersion')),
          unitPrice: String(fd.get('unitPrice')).trim(),
          currency: String(fd.get('currency')).trim().toUpperCase(),
          manualOverrideAmount: String(fd.get('manualOverrideAmount')).trim() || null,
          overrideReason: String(fd.get('overrideReason')).trim() || null,
          operator: String(fd.get('operator')).trim() || 'operator'
        })
      });
      pricingDialog.close();
      showBanner('计价与审计记录已保存');
      await refreshAll();
    } catch (err) {
      showBanner(`计价保存失败：${err.message}`, true);
    }
  });

  const evDialog = document.getElementById('evidence-dialog');
  document.getElementById('btn-close-evidence').addEventListener('click', () => evDialog.close());
  document.getElementById('btn-cancel-evidence').addEventListener('click', () => evDialog.close());
  document.getElementById('evidence-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/api/logistics/shipments/evidence', {
        method: 'POST',
        body: JSON.stringify({
          sid: fd.get('sid'),
          fbaShipmentId: fd.get('fbaShipmentId'),
          destTimezone: String(fd.get('destTimezone')).trim() || null,
          destCountry: String(fd.get('destCountry')).trim() || null,
          actualDeliveredAt: String(fd.get('actualDeliveredAt')).trim() || null,
          actualEventSource: fd.get('actualEventSource'),
          evidenceRef: String(fd.get('evidenceRef')).trim(),
          operator: String(fd.get('operator')).trim() || 'ops-auditor'
        })
      });
      evDialog.close();
      showBanner('POD 证据与目的仓时区已保存并记录审计');
      await refreshAll();
    } catch (err) {
      showBanner(`补录失败：${err.message}`, true);
    }
  });

  document.getElementById('defect-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const targets = String(fd.get('targetShipments')).split(',').map(s => s.trim()).filter(Boolean).map(pair => {
      const [sid, fbaShipmentId] = pair.split(':');
      return { sid: sid?.trim(), fbaShipmentId: fbaShipmentId?.trim(), weight: 1 };
    });
    try {
      const res = await api('/api/logistics/defect-fees', {
        method: 'POST',
        body: JSON.stringify({
          sourceBillNo: fd.get('sourceBillNo'),
          sourceLineNo: fd.get('sourceLineNo'),
          currency: String(fd.get('currency')).toUpperCase(),
          totalAmount: fd.get('totalAmount'),
          occurredDate: fd.get('occurredDate'),
          bookingMonth: fd.get('bookingMonth') || undefined,
          carrierId: fd.get('carrierId') || null,
          responsibilityBasis: fd.get('responsibilityBasis') || null,
          status: fd.get('status'),
          targets
        })
      });
      showBanner(res.deduplicated ? '该账单行已存在（幂等去重）' : '缺陷费已入账并完成分摊');
      await refreshAll();
    } catch (err) {
      showBanner(`缺陷费录入失败：${err.message}`, true);
    }
  });

  document.getElementById('btn-run-settlement').addEventListener('click', async () => {
    const month = document.getElementById('settlement-month').value;
    try {
      const res = await api('/api/logistics/settlements/run', {
        method: 'POST',
        body: JSON.stringify({ periodMonth: month, triggerType: 'manual' })
      });
      showBanner(`账期 ${month} 月结完成，共生成/更新 ${res.statements.length} 份对账单`);
      await refreshAll();
    } catch (err) {
      showBanner(`月结执行失败：${err.message}`, true);
    }
  });

  document.getElementById('btn-close-detail').addEventListener('click', () => {
    document.getElementById('statement-detail-section').hidden = true;
  });
  document.getElementById('btn-refresh-ratings').addEventListener('click', () => {
    clearBanner();
    refreshAll();
  });
}

bindEvents();
startIsoAnimation();
refreshAll();

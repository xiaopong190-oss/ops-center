const STATUS_LABELS = {
  early: { text: '提前到达', cls: 'pill-cyan' },
  on_time: { text: '符合预期', cls: 'pill-green' },
  delayed: { text: '延迟', cls: 'pill-red' },
  overdue: { text: '未到已逾期', cls: 'pill-red' },
  in_transit: { text: '在途', cls: 'pill-amber' },
  unknown: { text: '未知', cls: 'pill-muted' }
};

const FEE_STATUS_LABELS = {
  verified: { text: '已核扣款', cls: 'pill-red' },
  pending_review: { text: '待核查', cls: 'pill-amber' },
  disputed: { text: '有争议(不扣应付)', cls: 'pill-amber' },
  reversed: { text: '已冲销', cls: 'pill-cyan' }
};

let state = {
  overview: null,
  shipments: [],
  batches: [],
  fees: [],
  statements: [],
  ratings: []
};

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
  return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

async function refreshAll() {
  try {
    const [overview, shipmentsRes, batchesRes, feesRes, stmtsRes, ratingsRes] = await Promise.all([
      api('/api/logistics/overview'),
      api('/api/logistics/shipments?limit=500'),
      api('/api/logistics/batches'),
      api('/api/logistics/defect-fees'),
      api('/api/logistics/settlements'),
      api('/api/logistics/ratings')
    ]);
    state = {
      overview,
      shipments: shipmentsRes.items || [],
      batches: batchesRes.batches || [],
      fees: feesRes.fees || [],
      statements: stmtsRes.statements || [],
      ratings: ratingsRes.ratings || []
    };
    renderOverview();
    renderBatches();
    renderShipments();
    renderDefects();
    renderStatements();
    renderRatings();
  } catch (err) {
    showBanner(`加载失败：${err.message}`, true);
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
  document.getElementById('kpi-legs').textContent = String(o.legCount ?? 0);
  document.getElementById('kpi-anomalies').textContent = String(anomalies);
  document.getElementById('kpi-blocked').textContent = String(blocked);
  document.getElementById('kpi-fees').textContent = String(o.feeCount ?? 0);
  document.getElementById('kpi-statements').textContent = String(o.statementCount ?? 0);
}

function renderBatches() {
  const root = document.getElementById('batches-container');
  if (!state.batches.length) {
    root.innerHTML = '<p class="section-hint">暂无按发运计划归组的批次数据，请先同步真实领星或加载脱敏演示数据。</p>';
    return;
  }
  root.innerHTML = state.batches.map(b => {
    const hasAnom = b.anomalyShipments.length > 0;
    const rows = b.shipments.map(s => {
      const st = STATUS_LABELS[s.arrival.status] || STATUS_LABELS.unknown;
      const isAnom = ['delayed', 'overdue'].includes(s.arrival.status);
      const legText = s.legs.map(l => `${l.carrierName}(${l.trackingNo || l.logisticsRecordId})`).join(' / ');
      const verifiedFeeText = Object.entries(s.verifiedDefectFees || {}).map(([c, a]) => `${c} ${a}`).join(', ') || '0';
      return `<div class="timeline-row ${isAnom ? 'is-anomaly' : ''}">
        <div>
          <strong class="mono">${escHtml(s.fbaShipmentId)}</strong>
          <span> · ${escHtml(s.destFc || '')}</span>
          <div style="color:#8fa3bf">承运段：${escHtml(legText)}</div>
        </div>
        <div style="text-align:right">
          <span class="pill ${st.cls}">${st.text}${s.arrival.deviationDays ? ` (${s.arrival.deviationDays > 0 ? '+' : ''}${s.arrival.deviationDays}天)` : ''}</span>
          <div class="mono" style="color:#8fa3bf">实到 ${escHtml(s.arrival.actualLocalDay || '未妥投')} · 已核缺陷 ${escHtml(verifiedFeeText)}</div>
        </div>
      </div>`;
    }).join('');

    return `<article class="batch-card ${hasAnom ? 'has-anomaly' : ''}">
      <div class="batch-head">
        <div>
          <strong>计划 ${escHtml(b.planId)}</strong>
          <span class="section-hint"> · 店铺 ${escHtml(b.sid)} · ${escHtml(b.destTimezone)}</span>
        </div>
        <span class="pill ${hasAnom ? 'pill-red' : 'pill-green'}">共 ${b.shipments.length} 票 · 异常 ${b.anomalyShipments.length}</span>
      </div>
      <div class="timeline-list">${rows}</div>
    </article>`;
  }).join('');
}

function renderShipments() {
  const statusFilter = document.getElementById('filter-status').value;
  const q = document.getElementById('filter-search').value.trim().toLowerCase();
  const tbody = document.getElementById('shipments-tbody');

  const filtered = state.shipments.filter(s => {
    if (statusFilter !== 'all' && s.arrival.status !== statusFilter) return false;
    if (q) {
      const hay = [
        s.fbaShipmentId, s.planId, s.shipmentSn, s.destFc,
        ...s.legs.map(l => `${l.carrierName} ${l.carrierId} ${l.trackingNo || ''}`)
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="section-hint">暂无匹配货件记录</td></tr>';
    return;
  }

  const rowsHtml = [];
  for (const s of filtered) {
    const st = STATUS_LABELS[s.arrival.status] || STATUS_LABELS.unknown;
    const verifiedFee = Object.entries(s.verifiedDefectFees || {}).map(([c, v]) => `${c} ${v}`).join(' / ') || '0';
    const warningFee = s.warningDefectAmount ? `${s.warningDefectCurrency || ''} ${s.warningDefectAmount}` : '—';

    for (const leg of s.legs) {
      const p = leg.pricing;
      const pricingHtml = leg.settlementBlocked
        ? `<span class="pill pill-red">待补数/阻断</span><div class="section-hint">${escHtml(leg.blockReason)}</div>`
        : p
          ? `<div class="mono">${escHtml(p.currency)} ${escHtml(p.unitPriceFormatted)}/${escHtml(leg.weightUnit)}</div>
             <div class="mono">计算 ${escHtml(p.calculatedAmount)} → <strong>生效 ${escHtml(p.effectiveAmount)}</strong></div>
             ${p.isOverridden ? `<span class="pill pill-amber">手改差额 ${escHtml(p.overrideDelta)}</span>` : ''}
             ${p.sourceWeightChanged ? `<span class="pill pill-red">源重量变更(${escHtml(p.previousWeightFormatted)}→${escHtml(leg.weightFormatted)})</span>` : ''}`
          : '<span class="pill pill-muted">待计价</span>';

      rowsHtml.push(`<tr>
        <td>
          <div class="mono"><strong>${escHtml(s.fbaShipmentId)}</strong></div>
          <div class="section-hint">店铺 ${escHtml(s.sid)} · ${escHtml(s.shipmentSn || '—')}</div>
        </td>
        <td>
          <div>${escHtml(s.planId || '无计划号(独立)')}</div>
          <div class="section-hint">${escHtml(s.destFc || '—')} · ${escHtml(s.destTimezone)}</div>
        </td>
        <td class="mono">
          <div>承诺 ${escHtml(s.promisedStart || '—')} ~ ${escHtml(s.promisedEnd || '—')}</div>
          <div>实到 ${escHtml(s.arrival.actualLocalDay || '—')} (${escHtml(s.arrival.actualEventSource)})</div>
        </td>
        <td>
          <span class="pill ${st.cls}">${st.text}</span>
          <div class="mono section-hint">偏差 ${s.arrival.deviationDays != null ? `${s.arrival.deviationDays} 天` : '—'}</div>
        </td>
        <td class="mono">
          <div>${leg.weightFormatted ? `${escHtml(leg.weightFormatted)} ${escHtml(leg.weightUnit)}` : '缺失'}</div>
          <div class="section-hint">来源 ${escHtml(leg.weightSource)} · ${escHtml(leg.pricingScope)}</div>
        </td>
        <td>
          <div><strong>${escHtml(leg.carrierName)}</strong></div>
          <div class="section-hint mono">${escHtml(leg.trackingNo || leg.logisticsRecordId)}</div>
        </td>
        <td>${pricingHtml}</td>
        <td class="mono">
          <div>预警 ${escHtml(warningFee)}</div>
          <div>已核 <strong>${escHtml(verifiedFee)}</strong></div>
        </td>
        <td>
          <div class="filter-row">
            <button type="button" class="btn btn-secondary btn-sm btn-edit-pricing"
              data-leg-id="${escHtml(leg.id)}"
              data-shipment="${escHtml(s.fbaShipmentId)}"
              data-weight="${escHtml(leg.weightFormatted || '')}"
              data-unit="${escHtml(leg.weightUnit || '')}"
              data-carrier="${escHtml(leg.carrierName)}"
              ${leg.settlementBlocked ? 'disabled' : ''}>计价 / 改价</button>
            <button type="button" class="btn btn-secondary btn-sm btn-edit-evidence"
              data-sid="${escHtml(s.sid)}"
              data-shipment="${escHtml(s.fbaShipmentId)}">POD / 时区</button>
          </div>
        </td>
      </tr>`);
    }
  }
  tbody.innerHTML = rowsHtml.join('');

  for (const btn of tbody.querySelectorAll('.btn-edit-pricing')) {
    btn.addEventListener('click', () => openPricingModal(btn.dataset.legId));
  }
  for (const btn of tbody.querySelectorAll('.btn-edit-evidence')) {
    btn.addEventListener('click', () => openEvidenceModal(btn.dataset.sid, btn.dataset.shipment));
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
    if (!audit.length) {
      auditBox.textContent = '暂无历史改价记录';
    } else {
      auditBox.innerHTML = '<strong>审计历史：</strong>' + audit.map(a =>
        `<div>v${a.version} · ${escHtml(a.action)} · 操作人 ${escHtml(a.operator)} · 生效 ${escHtml(a.after?.effective_amount)} (差额 ${escHtml(a.after?.override_delta)}) · ${escHtml(a.reason || '')}</div>`
      ).join('');
    }
  } catch (err) {
    auditBox.textContent = `审计读取失败: ${err.message}`;
  }
}

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

function bindEvents() {
  for (const tab of document.querySelectorAll('.tab-btn')) {
    tab.addEventListener('click', () => {
      for (const b of document.querySelectorAll('.tab-btn')) {
        b.classList.toggle('is-active', b === tab);
        b.setAttribute('aria-selected', String(b === tab));
      }
      for (const panel of document.querySelectorAll('.tab-panel')) {
        panel.hidden = panel.id !== `panel-${tab.dataset.tab}`;
      }
    });
  }

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

  document.getElementById('filter-status').addEventListener('change', renderShipments);
  document.getElementById('filter-search').addEventListener('input', renderShipments);

  const dialog = document.getElementById('pricing-dialog');
  document.getElementById('btn-close-pricing').addEventListener('click', () => dialog.close());
  document.getElementById('btn-cancel-pricing').addEventListener('click', () => dialog.close());

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
      dialog.close();
      showBanner('计价与审计记录已保存');
      await refreshAll();
    } catch (err) {
      showBanner(`计价保存失败：${err.message}`, true);
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
refreshAll();


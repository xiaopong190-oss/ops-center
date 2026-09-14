import { parseReportFiles } from './report-parser.js';

const $ = (selector) => document.querySelector(selector);
const apiBase = localStorage.getItem('rootlineApiBase') || '';
const percent = (value) => value == null ? '—' : `${(value * 100).toFixed(1)}%`;
const number = (value) => value == null ? '—' : Number(value).toLocaleString('en-US');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const MCP_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
let lastAnalysisResult = null;

function openCacheDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('rootline-keyword-cache', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('mcp-results', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function cacheGet(key) {
  const db = await openCacheDb();
  try {
    const record = await new Promise((resolve, reject) => {
      const request = db.transaction('mcp-results').objectStore('mcp-results').get(key);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    if (!record) return null;
    if (Date.now() - record.savedAt >= MCP_CACHE_TTL) {
      db.transaction('mcp-results', 'readwrite').objectStore('mcp-results').delete(key); return null;
    }
    return record;
  } finally { db.close(); }
}
async function cacheSet(key, payload) {
  const db = await openCacheDb();
  try {
    await new Promise((resolve, reject) => {
      const request = db.transaction('mcp-results', 'readwrite').objectStore('mcp-results').put({ key, savedAt: Date.now(), payload });
      request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
function cacheKey(input) {
  return ['mcp-v13', input.marketplace, input.ownAsin.trim().toUpperCase(), input.productStage, input.productType,
    input.sqpReportSignature || 'no-sqp-report', input.adReportSignature || 'no-ad-report',
    ...input.competitorAsins.map((value) => value.trim().toUpperCase()).filter(Boolean).sort()].join('|');
}

async function readImportFile() {
  const result = await parseReportFiles($('#dataFile').files, '数据文件', true);
  if (!result) throw new Error('请选择 XLSX、CSV 或 JSON 数据文件');
  return result.rows;
}

document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.nav-item,.view').forEach((item) => item.classList.remove('active'));
  button.classList.add('active'); $(`#${button.dataset.view}`).classList.add('active');
}));

function table(columns, rows) {
  if (!rows.length) return '<div class="quality-note">暂无数据</div>';
  return `<table><thead><tr>${columns.map((col) => `<th>${col.label}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((col) => `<td class="${col.class || ''}">${col.render ? col.render(row) : escapeHtml(row[col.key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

const status = (row) => `<span class="pill ${row.status === '值得投' ? 'good' : row.status === '不适用' ? 'bad' : ''}">${escapeHtml(row.status)}</span>`;
const coverage = (row) => Object.entries(row.coverageMatrix || {}).map(([asin,value]) => `${escapeHtml(asin)}:${value?'✓':'—'}`).join(' ');
const shares = (row) => Object.entries(row.trafficShares || {}).map(([asin,value]) => `${escapeHtml(asin)}:${percent(value)}`).join(' ') || '数据缺失';
const intent = (row) => row.activeIntentIndex == null ? '未计算' : row.activeIntentIndex.toFixed(2);
const libraryColumns = [
  {label:'关键词',key:'keyword'},{label:'规范化关键词',key:'normalizedKeyword'},{label:'主词根',key:'root'},
  {label:'流量维度',key:'dimension'},{label:'分类依据',key:'classificationBasis'},
  {label:'竞品覆盖矩阵',render:coverage},{label:'反选频次',key:'reverseFrequency',class:'num'},
  {label:'Listing覆盖',render:(r)=>r.listingCoverage==null?'待验证':r.listingCoverage?'是':'否'},{label:'反选状态',key:'reverseStatus'},
  {label:'月搜索量',render:(r)=>number(r.marketSearches),class:'num'},{label:'月购买量',render:(r)=>number(r.marketPurchases),class:'num'},
  {label:'市场购买率',render:(r)=>percent(r.marketPurchaseRate),class:'num'},{label:'SPR',render:(r)=>number(r.spr),class:'num'},
  {label:'词长类型',key:'wordLengthType'},{label:'SPR易度',render:(r)=>r.sprEase?.toFixed(3)??'—',class:'num'},
  {label:'逐竞品流量占比',render:shares},{label:'自身意向指数',render:(r)=>r.intentIndex?.toFixed(2)??'—',class:'num'},
  {label:'市场意向指数',render:(r)=>r.marketIntentIndex?.toFixed(2)??'—',class:'num'},{label:'意向判断',key:'intentJudgment'},
  {label:'产品冲突检查',key:'productConflictCheck'},{label:'综合评分',render:(r)=>r.score?.toFixed(6)??'—',class:'num'},
  {label:'评分排名',render:(r)=>r.scoreRank??'—',class:'num'},{label:'建议状态',render:status},{label:'数据来源与日期',key:'dataSourceAndDate'}
];
const qualityColumns = [
  {label:'优质等级',key:'tier'},{label:'关键词',key:'keyword'},{label:'主词根',key:'root'},{label:'流量维度',key:'dimension'},
  {label:'竞品覆盖频次',key:'reverseFrequency',class:'num'},{label:'覆盖矩阵',render:coverage},
  {label:'月搜索量',render:(r)=>number(r.marketSearches),class:'num'},{label:'月购买量',render:(r)=>number(r.marketPurchases),class:'num'},
  {label:'市场购买率',render:(r)=>percent(r.marketPurchaseRate),class:'num'},{label:'有效意向指数',render:intent,class:'num'},
  {label:'SPR',render:(r)=>number(r.spr),class:'num'},{label:'逐竞品流量占比',render:shares},
  {label:'SPR易度',render:(r)=>r.sprEase?.toFixed(3)??'—',class:'num'},{label:'综合评分',render:(r)=>r.score?.toFixed(6)??'—',class:'num'},
  {label:'产品冲突检查',key:'productConflictCheck'},{label:'入选公式',key:'inclusionFormula'},
  {label:'最终结论',key:'finalConclusion'},{label:'数据来源与数据期',key:'dataSourceAndDate'}
];

function render(result, cacheInfo = null) {
  lastAnalysisResult = result;
  $('#explain').disabled = false;
  $('#ai-output').textContent = '规则分析已完成。点击“生成 AI 解读”获取策略说明。';
  const s = result.summary;
  $('#summary').innerHTML = [['值得投',s.qualified],['观察',s.watch],['暂不建议',s.rejected],['不适用',s.notApplicable],['集中度',s.concentration]].map(([label,value]) => `<div class="kpi"><small>${label}</small><strong>${escapeHtml(value)}</strong></div>`).join('');
  $('#quality-table').innerHTML = table(qualityColumns, result.qualityKeywords);
  $('#library-table').innerHTML = table(libraryColumns, result.mainLibrary);
  $('#excluded-table').innerHTML = table([
    {label:'关键词',key:'keyword'},{label:'建议状态',render:status},{label:'排除/待验证类别',key:'exclusionCategory'},
    {label:'具体原因',key:'exclusionReason'},{label:'综合评分排名',render:(r)=>r.compositeScoreRank??'—',class:'num'},{label:'数据来源',key:'dataSourceAndDate'}
  ], result.excludedKeywords);
  $('#roots-table').innerHTML = table([
    {label:'排名',key:'rank',class:'num'},{label:'词根',key:'root'},{label:'竞品关键词数',key:'keywordCount',class:'num'},
    {label:'聚合搜索量',render:(r)=>number(r.searches),class:'num'},{label:'搜索量份额',render:(r)=>percent(r.searchShare),class:'num'},
    {label:'聚合购买量',render:(r)=>number(r.purchases),class:'num'},{label:'词根购买率',render:(r)=>percent(r.marketPurchaseRate),class:'num'},
    {label:'SQP聚合点击/购买',render:(r)=>`${number(r.sqpClicks)} / ${number(r.sqpPurchases)}`,class:'num'},
    {label:'广告聚合点击/订单',render:(r)=>`${number(r.adClicks)} / ${number(r.adOrders)}`,class:'num'},
    {label:'词根自身CVR',render:(r)=>percent(r.rootOwnCvr),class:'num'},
    {label:'词根依赖度',render:(r)=>r.rootDependencyIndex?.toFixed(2)??'—',class:'num'},
    {label:'依赖度公式',key:'dependencyFormula'},{label:'有效词根意向指数',render:(r)=>r.rootIntentIndex?.toFixed(2)??'—',class:'num'},
    {label:'意向口径',key:'rootIntentScope'},
    {label:'转化份额',render:(r)=>percent(r.rootConversionShare),class:'num'},{label:'优先级得分',render:(r)=>r.priorityScore?.toFixed(4)??'—',class:'num'},
    {label:'优质关键词数',key:'qualityKeywordCount',class:'num'},{label:'优质词根',render:(r)=>r.isQualityRoot?'是':'否'},
    {label:'公式',key:'formula'},{label:'入选/未入选原因',key:'selectionReason'}
  ], result.rootAnalysis);
  $('#quality-roots-table').innerHTML = table([
    {label:'优质词根',key:'root'},{label:'聚合搜索量',render:(r)=>number(r.searches),class:'num'},
    {label:'搜索量份额',render:(r)=>percent(r.searchShare),class:'num'},{label:'词根自身CVR',render:(r)=>percent(r.rootOwnCvr),class:'num'},
    {label:'词根市场CVR',render:(r)=>percent(r.marketPurchaseRate),class:'num'},
    {label:'词根依赖度',render:(r)=>r.rootDependencyIndex?.toFixed(2)??'—',class:'num'},
    {label:'市场/自身意向指数',render:(r)=>r.rootIntentIndex?.toFixed(2)??'—',class:'num'},
    {label:'转化份额',render:(r)=>percent(r.rootConversionShare),class:'num'},
    {label:'综合得分',render:(r)=>r.priorityScore?.toFixed(4)??'—',class:'num'},{label:'综合排名',key:'rank',class:'num'},
    {label:'所含优质关键词',render:(r)=>r.qualityKeywords.map(escapeHtml).join('、')},{label:'入选公式',key:'selectionReason'},{label:'数据置信度',key:'confidence'}
  ], result.qualityRoots);
  $('#dimensions-table').innerHTML = table([
    {label:'流量维度',key:'dimension'},{label:'关键词数',key:'keywordCount',class:'num'},{label:'数量占比',render:(r)=>percent(r.countShare),class:'num'},
    {label:'搜索量',render:(r)=>number(r.searches),class:'num'},{label:'搜索量占比',render:(r)=>percent(r.searchShare),class:'num'},
    {label:'购买量',render:(r)=>number(r.purchases),class:'num'},{label:'代表词',render:(r)=>r.representativeKeywords.map(escapeHtml).join('、')||'—'},
    {label:'结构性缺口',key:'structuralGap'}
  ], result.fiveDimensions);
  const dispersion = result.dispersion;
  $('#dispersion-content').innerHTML = `<div class="notice"><strong>${escapeHtml(dispersion.level)}</strong> · ${escapeHtml(dispersion.trigger)}<br>${escapeHtml(dispersion.decisionBasis)}<br>${escapeHtml(dispersion.broadBoundary)}<br>数据边界：${escapeHtml(dispersion.verificationGap)}</div>
  <div class="head"><div><h1>候选最优关键词</h1><p>先过资格门槛，再按订单/CVR/I/CPA或新品市场得分排序</p></div></div><div class="panel">${table([
    {label:'排名',key:'rank',class:'num'},{label:'关键词',key:'keyword'},{label:'主词根',key:'root'},
    {label:'分类',key:'classification'},{label:'点击',render:(r)=>number(r.clicks),class:'num'},
    {label:'订单',render:(r)=>number(r.orders),class:'num'},{label:'自身CVR',render:(r)=>percent(r.ownCvr),class:'num'},
    {label:'大盘CVR',render:(r)=>percent(r.marketCvr),class:'num'},{label:'有效I',render:(r)=>r.intentIndex?.toFixed(2)??'—',class:'num'},
    {label:'市场搜索量',render:(r)=>number(r.marketSearches),class:'num'},{label:'判定原因',key:'reason'}
  ], dispersion.keywordCandidates)}</div>
  <div class="head"><div><h1>候选最优词根</h1><p>分散类目优先观察聚合词根，而不是争夺单一大词</p></div></div><div class="panel">${table([
    {label:'排名',key:'rank',class:'num'},{label:'词根',key:'root'},{label:'有效变体',key:'keywordVariants',class:'num'},
    {label:'聚合搜索量',render:(r)=>number(r.searches),class:'num'},{label:'聚合点击',render:(r)=>number(r.clicks),class:'num'},
    {label:'聚合订单',render:(r)=>number(r.orders),class:'num'},{label:'词根I',render:(r)=>r.intentIndex?.toFixed(2)??'—',class:'num'},
    {label:'词根依赖度',render:(r)=>r.dependencyIndex?.toFixed(2)??'—',class:'num'},{label:'分类',key:'classification'},{label:'判定原因',key:'reason'}
  ], dispersion.rootCandidates)}</div>`;
  const broad=dispersion.broadAnalysis, checks=broad.activationChecks;
  const broadChecks = checks.productStage === 'new'
    ? `新品 ✓ · 非标品 ${checks.nonStandardProduct?'✓':'×'} · 严重分散 ${checks.severeDispersion?'✓':'×'} · 至少1个候选词根 ${checks.hasCandidateRoot?'✓':'×'}（当前${checks.candidateRootCount}）`
    : `严重分散 ${checks.severeDispersion?'✓':'×'} · 至少1个Broad候选根 ${checks.hasCandidateRoot?'✓':'×'}（当前${checks.candidateRootCount}） · Broad实投数据 ${checks.broadDataAvailable?'已提供':'未提供'} · 稳定大词 ${checks.stableBigWordCount}个（仅作优先级参考） · 跨周字段 ${checks.hasWeekData?'✓':'缺失'}`;
  $('#broad-content').innerHTML = `<div class="notice"><strong>${escapeHtml(broad.activationStatus)}</strong><br>${escapeHtml(broad.role)}<br>${escapeHtml(broad.reason)}<br>触发检查：${broadChecks}<br>${escapeHtml(broad.pollutionWarning)}</div>
  <div class="head"><div><h1>最值得投放 Broad 的词根</h1><p>${broad.dataAvailable?'按Broad实投变体、纯度、I_root、跨周和盈利性独立验证':'根据市场/SQP/Phrase生成预判候选，不要求先有Broad数据'}</p></div></div><div class="panel">${table([
    {label:'词根',key:'root'},{label:'分级',key:'grade'},{label:'适合Broad',render:(r)=>r.suitable?'是':'否'},
    {label:'证据阶段',key:'evidenceStage'},
    {label:'触发词数',key:'variants',class:'num'},{label:'点击/订单',render:(r)=>`${number(r.clicks)} / ${number(r.orders)}`,class:'num'},
    {label:'跨周',key:'activeWeeks',class:'num'},{label:'纯度',render:(r)=>percent(r.purity),class:'num'},
    {label:'相邻/间隔/倒序',render:(r)=>`${percent(r.adjacentShare)} / ${percent(r.orderedGapShare)} / ${percent(r.reversedShare)}`},
    {label:'I_root',render:(r)=>r.intentIndex?.toFixed(2)??'—',class:'num'},{label:'大盘覆盖',render:(r)=>percent(r.marketCoverage),class:'num'},
    {label:'CPA/ACOS',render:(r)=>`${r.cpa?.toFixed(2)??'—'} / ${percent(r.acos)}`},{label:'数据置信度',render:(r)=>r.confidence??(r.activeWeeks>=2?'账户跨周证据':'待补跨周证据')},{label:'唯一动作',key:'action'}
  ], broad.rootGrades)}</div><div class="head"><div><h1>Broad触发变体</h1><p>用于验证Broad词根的扩展质量；相关出单词可独立加入Exact，但不是本模块的最终目的</p></div></div><div class="panel">${table([
    {label:'Broad触发搜索词',key:'keyword'},{label:'归属词根（仅参考）',key:'root'},
    {label:'点击',render:(r)=>number(r.clicks),class:'num'},{label:'订单',render:(r)=>number(r.orders),class:'num'},
    {label:'CVR',render:(r)=>percent(r.cvr),class:'num'},{label:'唯一动作',key:'action'}
  ], broad.harvest)}</div>`;
  const traffic = result.traffic;
  $('#traffic-content').innerHTML = `<div class="kpis">${[
    ['有效流量词',traffic.effectiveKeywordCount],['总搜索量',number(traffic.totalSearches)],['Top5流量',number(traffic.top5Total)],
    ['第6–10名流量',number(traffic.rank6To10Total)],['断层比',traffic.gapRatio?.toFixed(2)??'—']
  ].map(([label,value])=>`<div class="kpi"><small>${label}</small><strong>${value}</strong></div>`).join('')}</div>
  <div class="notice">断层比 = ${escapeHtml(traffic.gapFormula)}；${escapeHtml(traffic.gapClassification)}；集中度结论：${escapeHtml(traffic.concentration)}</div>`+
  [['Top5',traffic.top5Share],['Top10',traffic.top10Share],['Top20',traffic.top20Share]].map(([label,value]) => `<div class="traffic-card"><div><span>${label}</span><strong>${percent(value)}</strong></div><div class="bar"><i style="width:${Math.min(100,value*100)}%"></i></div></div>`).join('');
  $('#nav-quality').textContent = result.qualityKeywords.length; $('#nav-roots').textContent = result.rootAnalysis.length;
  $('#nav-library').textContent = result.mainLibrary.length; $('#nav-excluded').textContent = result.excludedKeywords.length;
  $('#nav-quality-roots').textContent = result.qualityRoots.length;
  $('#nav-dispersion').textContent = result.dispersion.keywordCandidates.length;
  $('#limitations').innerHTML = result.dataQuality.limitations.map(escapeHtml).join('<br>');
  $('#self-assessment').innerHTML = Object.entries(result.selfAssessment || {}).map(([key,value]) => `${value?'✓':'⚠️'} ${escapeHtml(key)}`).join('<br>');
  $('#notice').className = 'notice';
  const cacheText = cacheInfo ? `已使用本机缓存（保存于 ${new Date(cacheInfo.savedAt).toLocaleString()}，7 天内有效）。` : '';
  $('#notice').textContent = `分析完成：获取 ${result.summary.totalKeywords} 条关键词，其中 ${result.summary.qualified} 条通过优质词筛选。${cacheText}${result.meta.disclaimer} 结果未在服务端持久化。生成时间：${new Date(result.meta.generatedAt).toLocaleString()}`;
  if (!result.qualityKeywords.length && result.mainLibrary.length) {
    document.querySelector('[data-view="library"]').click();
  }
}

$('#explain').addEventListener('click', async () => {
  if (!lastAnalysisResult) return;
  const button = $('#explain'); button.disabled = true; button.textContent = 'AI 解读中…';
  $('#ai-output').textContent = '正在调用 Cloudflare Workers AI，仅发送分析摘要与排名结果…';
  try {
    const response = await fetch(`${apiBase}/api/explain`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result: lastAnalysisResult })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `请求失败：${response.status}`);
    $('#ai-output').innerHTML = `<div style="white-space:pre-wrap">${escapeHtml(payload.text)}</div><small>模型：${escapeHtml(payload.model)} · AI 仅作解释，规则计算结果优先。</small>`;
  } catch (error) {
    $('#ai-output').textContent = `AI 解读失败：${error.message}`;
  } finally { button.disabled = false; button.textContent = '重新生成 AI 解读'; }
});

$('#run').addEventListener('click', async () => {
  const button = $('#run'); button.disabled = true; button.textContent = '分析中…';
  $('#notice').className = 'notice'; $('#notice').textContent = '正在校验参数并生成分析…';
  try {
    const source = $('#source').value;
    const importedKeywords = source === 'import' ? await readImportFile() : undefined;
    const productStage = $('#productStage').value;
    const accountFile = productStage === 'existing' ? await parseReportFiles($('#accountFile').files, 'Amazon SQP 报告', true) : null;
    const adFile = productStage === 'existing' ? await parseReportFiles($('#adFile').files, '广告搜索词报告') : null;
    if (productStage === 'existing' && !accountFile && !adFile) throw new Error('老品分析请至少上传 SQP 或广告搜索词报告');
    const requestInput = {
      ownAsin:$('#ownAsin').value,
      competitorAsins:[...document.querySelectorAll('.competitor')].map((input)=>input.value),
      marketplace:$('#marketplace').value, source, importedKeywords, productStage, productType:$('#productType').value,
      ownSqpRows:accountFile?.rows, sqpReportSignature:accountFile?.signature,
      adSearchTermRows:adFile?.rows, adReportSignature:adFile?.signature
      ,targetAcos:$('#targetAcos').value, allowableCpa:$('#allowableCpa').value
    };
    const key = source === 'mcp' ? cacheKey(requestInput) : null;
    if (key && $('#useMcpCache').checked) {
      const cached = await cacheGet(key).catch(() => null);
      if (cached) { render(cached.payload, cached); return; }
    }
    const response = await fetch(`${apiBase}/api/analyze`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify(requestInput)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `请求失败：${response.status}`);
    if (key) await cacheSet(key, payload).catch(() => {});
    render(payload);
  } catch (error) {
    $('#notice').className = 'notice error'; $('#notice').textContent = error.message;
  } finally { button.disabled = false; button.textContent = '运行分析 →'; }
});

$('#source').addEventListener('change', () => {
  $('#fileField').hidden = $('#source').value !== 'import';
  $('#cacheField').hidden = $('#source').value !== 'mcp';
});

$('#productStage').addEventListener('change', () => {
  $('#accountFileField').hidden = $('#productStage').value !== 'existing';
  $('#adFileField').hidden = $('#productStage').value !== 'existing';
});

$('#run').click();

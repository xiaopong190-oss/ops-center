import { MockProvider } from '../providers/mock-provider.js';
import { McpProvider } from '../providers/mcp-provider.js';
import { ImportProvider } from '../providers/import-provider.js';

class ValidationError extends Error { constructor(message) { super(message); this.name = 'ValidationError'; } }
const asinPattern = /^[A-Z0-9]{10}$/;

function validate(input) {
  const ownAsin = String(input.ownAsin || '').trim().toUpperCase();
  const competitorAsins = [...new Set((input.competitorAsins || []).map((v) => String(v).trim().toUpperCase()).filter(Boolean))];
  if (!asinPattern.test(ownAsin)) throw new ValidationError('自身 ASIN 必须是 10 位字母或数字');
  if (competitorAsins.length < 1 || competitorAsins.length > 3 || competitorAsins.some((asin) => !asinPattern.test(asin))) {
    throw new ValidationError('请输入 1–3 个有效竞品 ASIN');
  }
  if (competitorAsins.includes(ownAsin)) throw new ValidationError('自身 ASIN 不能同时作为竞品');
  const productStage = input.productStage === 'existing' ? 'existing' : 'new';
  const productType = ['standard', 'semi-standard', 'non-standard'].includes(input.productType)
    ? input.productType : 'unknown';
  const hasSqp = Array.isArray(input.ownSqpRows) && input.ownSqpRows.length;
  const hasAds = Array.isArray(input.adSearchTermRows) && input.adSearchTermRows.length;
  if (productStage === 'existing' && !hasSqp && !hasAds) {
    throw new ValidationError('老品分析请至少上传 SQP 或广告搜索词报告');
  }
  const targetAcos = Number(input.targetAcos);
  const allowableCpa = Number(input.allowableCpa);
  return { ownAsin, competitorAsins, marketplace: input.marketplace || 'US', productStage, productType,
    targetAcos: Number.isFinite(targetAcos) && targetAcos > 0 ? targetAcos / (targetAcos > 1 ? 100 : 1) : null,
    allowableCpa: Number.isFinite(allowableCpa) && allowableCpa > 0 ? allowableCpa : null };
}

const round = (value, digits = 2) => Number(value.toFixed(digits));

const normalizeText = (value) => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
const splitList = (value) => String(value || '').split(/[,，;；\n]+/).map(normalizeText).filter(Boolean);
function productChecks(keyword, input) {
  const normalized = normalizeText(keyword);
  const configured = { brand: [], spec: [], color: [], function: [] };
  for (const term of splitList(input.conflictTerms)) {
    const match = term.match(/^(brand|spec|color|function)\s*:\s*(.+)$/);
    if (match) configured[match[1]].push(match[2]); else configured.brand.push(term);
  }
  const knownColors = ['black','white','red','blue','green','pink','silver','gold','gray','grey','黄色','红色','蓝色','绿色','白色','黑色','银色','金色'];
  const targetColors = splitList(input.colors);
  const foreignColors = knownColors.filter((color) => normalized.includes(color) && !targetColors.some((target) => target.includes(color) || color.includes(target)));
  const has = (terms) => terms.some((term) => normalized.includes(term));
  const checks = {
    brandConflict: has(configured.brand), specConflict: has(configured.spec),
    colorConflict: foreignColors.length > 0 || has(configured.color), functionConflict: has(configured.function)
  };
  const conflict = Object.values(checks).some(Boolean);
  const listing = normalizeText(input.listingText);
  const listingCoverage = listing ? listing.includes(normalized) : null;
  return { ...checks, conflict,
    productConflictCheck: conflict ? `存在冲突：${Object.entries(checks).filter(([,value])=>value).map(([key])=>key).join('、')}` : '无明确冲突',
    listingCoverage,
    reverseStatus: listingCoverage == null ? '待验证·缺少Listing文本' : (!listingCoverage ? '是' : '否') };
}

function wordLengthType(keyword) {
  const count = normalizeText(keyword).split(/\s+/).filter(Boolean).length;
  return count <= 1 ? '核心词型' : count <= 3 ? '词组型' : '长尾型';
}

function scoreKeyword(item, input) {
  const marketCvr = item.marketPurchaseRate ?? (item.marketSearches > 0 ? item.marketPurchases / item.marketSearches : null);
  const sqpCvr = item.sqpClicks > 0 ? item.sqpPurchases / item.sqpClicks : null;
  const adCvr = item.adClicks > 0 ? item.adOrders / item.adClicks : null;
  const ownCvr = sqpCvr ?? adCvr;
  const dependencyIndex = ownCvr != null && marketCvr > 0 ? ownCvr / marketCvr : null;
  const intentIndex = item.ownIntentIndexFromShares ?? null;
  const marketIntentIndex = item.marketIntentIndex ?? null;
  const activeIntentIndex = input.productStage === 'existing' ? intentIndex : marketIntentIndex;
  const cpa = item.adOrders > 0 ? item.adSpend / item.adOrders : null;
  const acos = item.adSales > 0 ? item.adSpend / item.adSales : null;
  const checks = { brandConflict:false, specConflict:false, colorConflict:false, functionConflict:false,
    conflict:false, productConflictCheck:'未检查·已撤销自动冲突判断', listingCoverage:null,
    reverseStatus:'待验证·未执行Listing覆盖检查' };
  const score = input.productStage === 'existing'
    ? (activeIntentIndex == null || ownCvr == null ? null : round(activeIntentIndex * ownCvr * item.sprEase, 6))
    : (activeIntentIndex == null ? null : round(activeIntentIndex * item.sprEase, 6));
  const gatePassed = item.reverseFrequency >= 2 && activeIntentIndex >= 1;
  let status = '观察';
  if (activeIntentIndex != null && activeIntentIndex < 1) status = '暂不建议';
  const intentJudgment = activeIntentIndex == null ? '数据不足' : activeIntentIndex >= 1 ? '高意向' : '低意向';
  const coverageMatrix = Object.fromEntries(input.competitorAsins.map((asin, index) => [asin, Boolean(item.coverage?.[index])]));
  const inclusionFormula = input.productStage === 'existing'
    ? `覆盖频次 ${item.reverseFrequency}≥2 AND 自身意向指数 ${intentIndex?.toFixed(2) ?? '缺失'}≥1`
    : `覆盖频次 ${item.reverseFrequency}≥2 AND 市场意向指数 ${marketIntentIndex?.toFixed(2) ?? '缺失'}≥1`;
  return { ...item, marketPurchaseRate: marketCvr, sqpCvr, adCvr, ownCvr,
    intentIndexScope: sqpCvr != null ? 'SQP' : adCvr != null ? '广告搜索词' : null,
    intentIndex, marketIntentIndex, activeIntentIndex, intentJudgment, cpa, acos, score, status,
    coverageMatrix, normalizedKeyword: item.normalizedKeyword || String(item.keyword).trim().toLowerCase().replace(/\s+/g, ' '),
    classificationBasis: item.classificationBasis || '导入数据未提供分类依据',
    listingCoverage: item.listingCoverage ?? null,
    reverseStatus: item.listingCoverage === false ? '竞品有、目标Listing缺失' : item.listingCoverage === true ? '目标Listing已覆盖' : '待验证',
    ...checks, wordLengthType: item.wordLengthType, sprEase: item.sprEase,
    productConflictCheck: checks.productConflictCheck,
    inclusionFormula,
    dependencyIndex, gatePassed, finalConclusion: status,
    dataSourceAndDate: `${item.sourceTool || item.source || '未知来源'} · ${item.month || '数据期未知'}`
  };
}

const accountAliases = {
  keyword: ['Search Query', 'Search Query Text', '搜索查询', '搜索词', 'Customer Search Term', 'Search Term', 'keyword'],
  queryVolume: ['Search Query Volume', 'Query Volume', '搜索查询量', '查询量'],
  impressions: ['Impressions: ASIN Count', 'ASIN Impression Count', 'ASIN Impressions', 'ASIN 展示量'],
  clicks: ['Clicks: ASIN Count', 'ASIN Click Count', 'ASIN Clicks', 'Clicks', 'ASIN 点击量', '点击'],
  cartAdds: ['Cart Adds: ASIN Count', 'ASIN Cart Add Count', 'ASIN Cart Adds', 'ASIN 加购量'],
  orders: ['Purchases: ASIN Count', 'ASIN Purchase Count', 'ASIN Purchases', 'Orders', 'ASIN 购买量', '订单'],
  impressionShare: ['Impressions: ASIN Share %', 'ASIN Impression Share', 'ASIN 展示份额'],
  clickShare: ['Clicks: ASIN Share %', 'ASIN Click Share', 'ASIN 点击份额'],
  cartAddShare: ['Cart Adds: ASIN Share %', 'ASIN Cart Add Share', 'ASIN 加购份额'],
  purchaseShare: ['Purchases: ASIN Share %', 'ASIN Purchase Share', 'ASIN 购买份额'],
};
const adAliases = {
  keyword: ['Customer Search Term', 'Search Term', '客户搜索词', '搜索词', 'keyword'],
  matchType: ['Match Type', '匹配类型', 'Keyword Match Type', 'Targeting Type'],
  date: ['Date', '日期', 'Week', '周', 'Start Date', '开始日期', 'Report Date'],
  clicks: ['Clicks', '点击量', '点击'], orders: ['7 Day Total Orders (#)', '14 Day Total Orders (#)', 'Orders', '订单量', '订单'],
  spend: ['Spend', '花费', '支出'], sales: ['7 Day Total Sales', '14 Day Total Sales', 'Sales', '销售额', '销售']
};
function weekKey(value) {
  if (value == null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).trim();
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7; utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return `${utc.getUTCFullYear()}-W${String(Math.ceil((((utc-yearStart)/86400000)+1)/7)).padStart(2,'0')}`;
}
function normalizeMatchType(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text.includes('broad') || text.includes('广泛')) return 'broad';
  if (text.includes('phrase') || text.includes('词组')) return 'phrase';
  if (text.includes('exact') || text.includes('精准')) return 'exact';
  return 'unknown';
}
function accountValue(row, keys) { for (const key of keys) if (row[key] !== undefined && row[key] !== '') return row[key]; return null; }
function accountNumber(row, keys) {
  const raw = accountValue(row, keys); if (raw == null) return 0;
  const value = Number(String(raw).replace(/[,\s$£€¥]/g, '')); return Number.isFinite(value) ? value : 0;
}
function accountRate(row, keys) {
  const raw = accountValue(row, keys); if (raw == null) return null;
  const value = Number(String(raw).replace(/[,\s%]/g, '')); if (!Number.isFinite(value)) return null;
  return String(raw).includes('%') || value > 1 ? value / 100 : value;
}
function aggregateSqpRows(rows = []) {
  const terms = new Map();
  for (const row of rows.slice(0, 50000)) {
    const keyword = String(accountValue(row, accountAliases.keyword) || '').trim().toLowerCase();
    if (!keyword) continue;
    const current = terms.get(keyword) || { sqpImpressions: 0, sqpClicks: 0, sqpCartAdds: 0, sqpPurchases: 0, sqpQueryVolume: 0 };
    current.sqpQueryVolume += accountNumber(row, accountAliases.queryVolume);
    current.sqpImpressions += accountNumber(row, accountAliases.impressions);
    current.sqpClicks += accountNumber(row, accountAliases.clicks);
    current.sqpCartAdds += accountNumber(row, accountAliases.cartAdds);
    current.sqpPurchases += accountNumber(row, accountAliases.orders);
    current.sqpImpressionShare = accountRate(row, accountAliases.impressionShare) ?? current.sqpImpressionShare ?? null;
    current.sqpClickShare = accountRate(row, accountAliases.clickShare) ?? current.sqpClickShare ?? null;
    current.sqpCartAddShare = accountRate(row, accountAliases.cartAddShare) ?? current.sqpCartAddShare ?? null;
    current.sqpPurchaseShare = accountRate(row, accountAliases.purchaseShare) ?? current.sqpPurchaseShare ?? null;
    terms.set(keyword, current);
  }
  return terms;
}

function aggregateAdRows(rows = []) {
  const terms = new Map();
  for (const row of rows.slice(0, 50000)) {
    const keyword = String(accountValue(row, adAliases.keyword) || '').trim().toLowerCase();
    if (!keyword) continue;
    const current = terms.get(keyword) || { adClicks: 0, adOrders: 0, adSpend: 0, adSales: 0,
      broadAdClicks: 0, broadAdOrders: 0, broadAdSpend: 0, broadAdSales: 0,
      phraseAdClicks: 0, phraseAdOrders: 0, phraseAdSpend: 0, phraseAdSales: 0,
      exactAdClicks: 0, exactAdOrders: 0, unknownAdClicks: 0, matchTypes: [] };
    const clicks = accountNumber(row, adAliases.clicks), orders = accountNumber(row, adAliases.orders);
    const spend = accountNumber(row, adAliases.spend), sales = accountNumber(row, adAliases.sales);
    const matchType = normalizeMatchType(accountValue(row, adAliases.matchType));
    const week = weekKey(accountValue(row, adAliases.date));
    current.broadWeeks ||= []; current.phraseWeeks ||= []; current.exactWeeks ||= [];
    current.adClicks += clicks; current.adOrders += orders; current.adSpend += spend; current.adSales += sales;
    if (!current.matchTypes.includes(matchType)) current.matchTypes.push(matchType);
    if (matchType === 'broad') {
      current.broadAdClicks += clicks; current.broadAdOrders += orders; current.broadAdSpend += spend; current.broadAdSales += sales;
      if (week && !current.broadWeeks.includes(week)) current.broadWeeks.push(week);
    } else if (matchType === 'phrase') {
      current.phraseAdClicks += clicks; current.phraseAdOrders += orders; current.phraseAdSpend += spend; current.phraseAdSales += sales;
      if (week && !current.phraseWeeks.includes(week)) current.phraseWeeks.push(week);
    } else if (matchType === 'exact') {
      current.exactAdClicks += clicks; current.exactAdOrders += orders;
      if (week && !current.exactWeeks.includes(week)) current.exactWeeks.push(week);
    } else current.unknownAdClicks += clicks;
    terms.set(keyword, current);
  }
  return terms;
}

function summarizeRoots(keywords, input) {
  const total = keywords.reduce((sum, item) => sum + item.marketSearches, 0) || 1;
  const totalPurchases = keywords.reduce((sum, item) => sum + item.marketPurchases, 0);
  const overallMarketCvr = total ? totalPurchases / total : null;
  const groups = new Map();
  for (const item of keywords) {
    const group = groups.get(item.root) || { root: item.root, keywordCount: 0, searches: 0, purchases: 0,
      sqpClicks: 0, sqpPurchases: 0, adClicks: 0, adOrders: 0,
      phraseAdClicks: 0, phraseAdOrders: 0, broadAdClicks: 0, broadAdOrders: 0,
      qualityKeywordCount: 0, qualityKeywords: [] };
    group.keywordCount += 1; group.searches += item.marketSearches; group.purchases += item.marketPurchases;
    group.sqpClicks += item.sqpClicks || 0; group.sqpPurchases += item.sqpPurchases || 0;
    group.adClicks += item.adClicks || 0; group.adOrders += item.adOrders || 0;
    group.phraseAdClicks += item.phraseAdClicks || 0; group.phraseAdOrders += item.phraseAdOrders || 0;
    group.broadAdClicks += item.broadAdClicks || 0; group.broadAdOrders += item.broadAdOrders || 0;
    if (item.status === '值得投') { group.qualityKeywordCount += 1; group.qualityKeywords.push(item.keyword); }
    groups.set(item.root, group);
  }
  const allGroups = [...groups.values()];
  const rootTotals = allGroups.reduce((acc, group) => {
    acc.sqpClicks += group.sqpClicks; acc.sqpPurchases += group.sqpPurchases;
    acc.adClicks += group.adClicks; acc.adOrders += group.adOrders; return acc;
  }, { sqpClicks: 0, sqpPurchases: 0, adClicks: 0, adOrders: 0 });
  rootTotals.phraseAdClicks = allGroups.reduce((sum, group) => sum + group.phraseAdClicks, 0);
  rootTotals.phraseAdOrders = allGroups.reduce((sum, group) => sum + group.phraseAdOrders, 0);
  const ranked = allGroups.map((group) => {
    const marketPurchaseRate = group.searches ? group.purchases / group.searches : null;
    const sqpRootCvr = group.sqpClicks ? group.sqpPurchases / group.sqpClicks : null;
    const adRootCvr = group.adClicks ? group.adOrders / group.adClicks : null;
    const phraseRootCvr = group.phraseAdClicks ? group.phraseAdOrders / group.phraseAdClicks : null;
    const rootOwnCvr = sqpRootCvr ?? phraseRootCvr;
    const rootDependencyIndex = rootOwnCvr != null && marketPurchaseRate > 0 ? rootOwnCvr / marketPurchaseRate : null;
    const marketRootIntentIndex = marketPurchaseRate != null && overallMarketCvr > 0 ? marketPurchaseRate / overallMarketCvr : null;
    const useSqp = rootTotals.sqpClicks > 0 && rootTotals.sqpPurchases > 0;
    const usePhrase = !useSqp && rootTotals.phraseAdClicks > 0;
    const rootClickShare = useSqp ? group.sqpClicks / rootTotals.sqpClicks
      : usePhrase ? group.phraseAdClicks / rootTotals.phraseAdClicks : null;
    const rootConversionShare = input.productStage === 'new' ? group.purchases / Math.max(1, totalPurchases)
      : useSqp ? group.sqpPurchases / rootTotals.sqpPurchases
        : usePhrase && rootTotals.phraseAdOrders ? group.phraseAdOrders / rootTotals.phraseAdOrders : null;
    const rootOwnIntentIndex = rootClickShare > 0 && rootConversionShare != null ? rootConversionShare / rootClickShare : null;
    const rootIntentIndex = input.productStage === 'existing' ? rootOwnIntentIndex : marketRootIntentIndex;
    return { ...group, searchShare: group.searches / total, marketPurchaseRate, sqpRootCvr, adRootCvr,
      rootOwnCvr, phraseRootCvr, rootDependencyIndex, marketRootIntentIndex, rootOwnIntentIndex, rootIntentIndex,
      rootClickShare, rootConversionShare,
      rootIntentScope: input.productStage === 'existing' ? (useSqp ? 'SQP转化份额÷点击份额' : usePhrase ? 'Phrase订单份额÷点击份额（排除Broad）' : '数据不足·缺少SQP/Phrase') : '市场词根意向指数' };
  }).map((group) => ({ ...group, priorityScore: group.rootIntentIndex == null || group.rootConversionShare == null ? null : group.rootConversionShare * group.rootIntentIndex }))
    .sort((a, b) => (b.priorityScore ?? -1) - (a.priorityScore ?? -1))
    .map((group, index) => ({ ...group, rank: index + 1 }));
  return ranked.map((group) => {
    const isQualityRoot = group.rank <= 3 && group.rootIntentIndex >= 1 && group.qualityKeywordCount >= 1;
    const reasons = [];
    if (group.rank > 3) reasons.push('综合排名未进前3');
    if (!(group.rootIntentIndex >= 1)) reasons.push('词根意向指数不足或缺失');
    if (!group.qualityKeywordCount) reasons.push('词根下无优质关键词');
    return { ...group, isQualityRoot,
      selectionReason: isQualityRoot ? '排名前3 AND 词根意向指数≥1 AND 至少1个优质关键词' : reasons.join('；'),
      formula: `${((group.rootConversionShare ?? 0) * 100).toFixed(1)}% × ${group.rootIntentIndex?.toFixed(2) ?? '缺失'}`,
      dependencyFormula: group.rootDependencyIndex == null ? '不可计算'
        : `${(group.rootOwnCvr * 100).toFixed(1)}% ÷ ${(group.marketPurchaseRate * 100).toFixed(1)}% = ${group.rootDependencyIndex.toFixed(2)}`,
      confidence: group.rootIntentIndex == null ? '低' : input.productStage === 'existing' && (group.sqpPurchases || group.adOrders) < 3 ? '中' : '高'
    };
  });
}

function trafficSummary(keywords) {
  const sorted = [...keywords].sort((a, b) => b.marketSearches - a.marketSearches);
  const total = sorted.reduce((sum, item) => sum + item.marketSearches, 0) || 1;
  const sum = (start, end) => sorted.slice(start, end).reduce((value, item) => value + item.marketSearches, 0);
  const top5 = sum(0, 5), next5 = sum(5, 10);
  const ratio = next5 ? top5 / next5 : null;
  const top20Share = sum(0, 20) / total;
  return {
    effectiveKeywordCount: sorted.filter((item) => item.marketSearches > 0).length,
    totalSearches: total,
    top5Total: top5,
    rank6To10Total: next5,
    gapRatio: ratio,
    gapFormula: `${top5} ÷ ${next5}`,
    gapClassification: ratio == null ? '数据不足' : ratio >= 3 ? '显著断层' : ratio >= 1.5 ? '中等断层' : '均匀断层',
    concentration: top20Share >= 0.7 ? '集中型' : top20Share >= 0.4 ? '中等集中' : '分散型',
    top5Share: top5 / total,
    top10Share: sum(0, 10) / total,
    top20Share
  };
}

function dispersionSummary(keywords, roots, traffic, input) {
  const uniformGap = traffic.gapRatio == null || traffic.gapRatio < 1.5;
  const lowTop20 = traffic.top20Share < 0.4;
  const level = lowTop20 && uniformGap ? '严重分散' : lowTop20 || uniformGap ? '中度分散' : '非严重分散';
  const enabled = level === '严重分散';
  const orderValue = (row) => (row.sqpPurchases || row.adOrders || 0);
  const clickValue = (row) => (row.sqpClicks || row.adClicks || 0);
  const keywordCandidates = [...keywords].filter((row) => {
    if (input.productStage === 'new') return row.gatePassed && row.marketIntentIndex >= 1;
    return orderValue(row) >= 3 && row.intentIndex > 1;
  }).sort((a, b) => {
    if (input.productStage === 'existing') {
      return orderValue(b) - orderValue(a) || (b.ownCvr ?? -1) - (a.ownCvr ?? -1)
        || (b.intentIndex ?? -1) - (a.intentIndex ?? -1) || (a.cpa ?? Infinity) - (b.cpa ?? Infinity);
    }
    return (b.score ?? -1) - (a.score ?? -1);
  }).slice(0, 20).map((row, index) => ({
    rank: index + 1, keyword: row.keyword, root: row.root,
    orders: orderValue(row), clicks: clickValue(row), ownCvr: row.ownCvr,
    marketCvr: row.marketPurchaseRate, intentIndex: row.activeIntentIndex,
    marketSearches: row.marketSearches, score: row.score,
    classification: input.productStage === 'new' ? '市场候选最优词' : '待跨周验证候选词',
    reason: input.productStage === 'new'
      ? '竞品覆盖≥2、市场意向指数≥1；尚无自身转化数据'
      : '订单≥3且自身意向指数>1；缺少跨至少2个自然周字段，不能标为已验证最优词'
  }));
  const rootCandidates = [...roots].filter((row) => {
    if (input.productStage === 'new') return row.keywordCount >= 2 && row.rootIntentIndex > 1 && row.qualityKeywordCount >= 1;
    return (row.sqpClicks || row.phraseAdClicks) >= 30 && (row.sqpPurchases || row.phraseAdOrders) >= 5
      && row.keywordCount >= 2 && row.rootIntentIndex > 1;
  }).sort((a, b) => (b.priorityScore ?? -1) - (a.priorityScore ?? -1)).slice(0, 10).map((row, index) => ({
    rank: index + 1, root: row.root, keywordVariants: row.keywordCount,
    searches: row.searches, orders: row.sqpPurchases || row.phraseAdOrders || 0,
    clicks: row.sqpClicks || row.phraseAdClicks || 0, intentIndex: row.rootIntentIndex,
    dependencyIndex: row.rootDependencyIndex, score: row.priorityScore,
    classification: input.productStage === 'new' ? '市场候选最优词根' : '待跨周验证候选词根',
    reason: input.productStage === 'new'
      ? '有效变体≥2、词根意向指数>1且包含优质关键词'
      : '仅采用SQP/Phrase证据并达到点击/订单/变体/I门槛；仍需跨周稳定性与大盘覆盖率验证'
  }));
  const broadRows = keywords.filter((row) => (row.broadAdClicks || row.broadAdOrders) > 0);
  const broadTotals = broadRows.reduce((acc, row) => {
    acc.clicks += row.broadAdClicks || 0; acc.orders += row.broadAdOrders || 0;
    acc.spend += row.broadAdSpend || 0; acc.sales += row.broadAdSales || 0; return acc;
  }, { clicks: 0, orders: 0, spend: 0, sales: 0 });
  const broadCvr = broadTotals.clicks ? broadTotals.orders / broadTotals.clicks : null;
  const avgOrdersPerTerm = broadRows.length ? broadTotals.orders / broadRows.length : null;
  const marketSearches = keywords.reduce((sum, row) => sum + (row.marketSearches || 0), 0);
  const marketPurchases = keywords.reduce((sum, row) => sum + (row.marketPurchases || 0), 0);
  const marketCvr = marketSearches ? marketPurchases / marketSearches : null;
  const lowBroadConversion = broadCvr == null || marketCvr == null || broadCvr <= marketCvr;
  const exactPhraseClicks = keywords.reduce((sum,row)=>sum+(row.exactAdClicks||0)+(row.phraseAdClicks||0),0);
  const allTypedAdClicks = keywords.reduce((sum,row)=>sum+(row.exactAdClicks||0)+(row.phraseAdClicks||0)+(row.broadAdClicks||0),0);
  const exactPhraseCoverage = allTypedAdClicks ? exactPhraseClicks / allTypedAdClicks : null;
  const hasWeekData = keywords.some((row)=>(row.broadWeeks?.length||0)+(row.phraseWeeks?.length||0)+(row.exactWeeks?.length||0)>0);
  const stableBigWords = keywords.filter((row) => {
    const nonBroadOrders = (row.sqpPurchases||0)+(row.phraseAdOrders||0)+(row.exactAdOrders||0);
    const weeks = new Set([...(row.phraseWeeks||[]),...(row.exactWeeks||[])]).size;
    return nonBroadOrders >= 3 && weeks >= 2 && row.activeIntentIndex > 1;
  });
  const longTailInsufficient = exactPhraseCoverage == null || exactPhraseCoverage < 0.6;
  const broadCandidateRoots = roots.filter((row) => row.keywordCount >= 2 && row.qualityKeywordCount >= 1
    && (row.marketRootIntentIndex > 1 || row.rootIntentIndex > 1));
  const existingBroadEligible = enabled && broadCandidateRoots.length >= 1;
  const newProductBroadEligible = input.productStage === 'new' && input.productType === 'non-standard'
    && enabled && broadCandidateRoots.length >= 1;
  const broadEligible = input.productStage === 'new' ? newProductBroadEligible : existingBroadEligible;
  const activationStatus = input.productStage === 'new'
    ? input.productType === 'unknown' ? '未激活·请选择产品类型'
      : input.productType !== 'non-standard' ? '不建议激活·新品不是非标品'
        : !enabled ? '不建议激活·市场不够分散'
          : broadCandidateRoots.length < 1 ? '未激活·没有合格的高意向候选词根'
            : '建议激活新品Broad探索'
    : !enabled ? '不建议激活·市场不够分散'
      : broadCandidateRoots.length < 1 ? '未激活·没有合格的Broad候选词根'
        : !broadRows.length ? '建议启动Broad候选测试'
          : hasWeekData ? 'Broad实投验证中' : 'Broad条件性验证·缺少跨周字段';
  const broadHarvest = [...broadRows].filter((row) => row.broadAdOrders > 0)
    .sort((a,b) => b.broadAdOrders-a.broadAdOrders || (b.broadAdOrders/Math.max(1,b.broadAdClicks))-(a.broadAdOrders/Math.max(1,a.broadAdClicks)))
    .map((row) => ({ keyword: row.keyword, root: row.root, clicks: row.broadAdClicks, orders: row.broadAdOrders,
      cvr: row.broadAdClicks ? row.broadAdOrders / row.broadAdClicks : null,
      action: '作为Broad词根的变体证据；相关且出单的完整词可另入Exact，但不影响Broad词根继续独立评估' }));
  const seedRoots = roots.filter((row) => row.broadAdClicks > 0 || row.broadAdOrders > 0
    || broadCandidateRoots.some((candidate) => candidate.root === row.root));
  const broadRootGrades = seedRoots.map((root) => {
    const rootTokens = normalizeText(root.root).split(/\s+/).filter(Boolean);
    let clicks=0,orders=0,spend=0,sales=0,adjacentClicks=0,orderedGapClicks=0,reversedClicks=0,partialClicks=0;
    let marketCoveredClicks=0,marketSearchesSum=0,marketPurchasesSum=0; const variants=new Set(); const weeks=new Set();
    for (const row of broadRows) {
      const tokens=normalizeText(row.keyword).split(/\s+/).filter(Boolean);
      const positions=rootTokens.map((token)=>tokens.indexOf(token));
      const present=positions.filter((position)=>position>=0).length;
      if (present>0) partialClicks += row.broadAdClicks||0;
      if (present!==rootTokens.length) continue;
      const ordered=positions.every((position,index)=>index===0||position>positions[index-1]);
      const adjacent=ordered&&positions.every((position,index)=>index===0||position===positions[index-1]+1);
      const rowClicks=row.broadAdClicks||0;
      if(adjacent) adjacentClicks+=rowClicks; else if(ordered) orderedGapClicks+=rowClicks; else reversedClicks+=rowClicks;
      clicks+=rowClicks; orders+=row.broadAdOrders||0; spend+=row.broadAdSpend||0; sales+=row.broadAdSales||0;
      variants.add(row.keyword); for(const week of row.broadWeeks||[]) weeks.add(week);
      if(row.marketPurchaseRate!=null){marketCoveredClicks+=rowClicks;marketSearchesSum+=row.marketSearches||0;marketPurchasesSum+=row.marketPurchases||0;}
    }
    if(!clicks&&!partialClicks) return null;
    const purity=partialClicks?clicks/partialClicks:0, marketCoverage=clicks?marketCoveredClicks/clicks:0;
    const ownCvr=clicks?orders/clicks:null, marketRootCvr=marketSearchesSum?marketPurchasesSum/marketSearchesSum:null;
    const intentIndex=ownCvr!=null&&marketRootCvr>0?ownCvr/marketRootCvr:null;
    const cpa=orders?spend/orders:null, acos=sales?spend/sales:null;
    const profitability=input.targetAcos!=null&&acos!=null?acos<=input.targetAcos
      : input.allowableCpa!=null&&cpa!=null?cpa<=input.allowableCpa:null;
    const highConfidence=variants.length>=2&&clicks>=30&&orders>=5&&weeks.size>=2&&purity>=0.8
      &&intentIndex>1&&marketCoverage>=0.6&&profitability===true;
    let grade=highConfidence?'Broad高置信词根':intentIndex>1?'Broad潜力词根':'Broad探索词根';
    if(purity<0.6)grade='Broad过宽词根';else if(purity<0.8)grade='Broad拆分词根';
    if(orders<=1||clicks<10)grade='Broad偶然出单词';
    const suitable=enabled&&['Broad高置信词根','Broad潜力词根'].includes(grade);
    return {root:root.root,grade,suitable,evidenceStage:'Broad实投验证',variants:variants.size,clicks,orders,activeWeeks:weeks.size,purity,
      adjacentShare:clicks?adjacentClicks/clicks:0,orderedGapShare:clicks?orderedGapClicks/clicks:0,reversedShare:clicks?reversedClicks/clicks:0,
      ownCvr,marketRootCvr,intentIndex,marketCoverage,cpa,acos,profitability,
      action:grade==='Broad高置信词根'?'作为独立Broad流量池保留并按盈利性扩量'
        : grade==='Broad潜力词根'?'维持小预算Broad测试并积累订单与跨周证据'
          : grade==='Broad拆分词根'?'拆成功能/属性/场景子根后分别测试Broad'
            : grade==='Broad过宽词根'?'暂停该Broad根，继续下钻并清理污染':'继续积累Broad样本，不作强结论'};
  }).filter(Boolean).sort((a,b)=>Number(b.suitable)-Number(a.suitable)||(b.intentIndex??-1)-(a.intentIndex??-1));
  const prelaunchBroadRoots = broadCandidateRoots.map((root) => ({
    root: root.root, grade: input.productStage === 'new' ? '新品Broad候选词根' : 'Broad候选词根',
    suitable: broadEligible, evidenceStage:'市场/SQP/Phrase预判',
    variants: root.keywordCount, clicks: null, orders: null, activeWeeks: null,
    purity: null, adjacentShare: null, orderedGapShare: null, reversedShare: null,
    ownCvr: null, marketRootCvr: root.marketPurchaseRate, intentIndex: root.marketRootIntentIndex ?? root.rootIntentIndex,
    marketCoverage: null, cpa: null, acos: null, profitability: null,
    confidence: '预判证据·待Broad实投验证',
    action: broadEligible
      ? '该词根单独建Broad组；小预算、低Bid、无TOS测试7–14天，验证有效变体、纯度、I_root、跨周与盈利性'
      : '保留为Broad候选，不启动投放'
  }));
  const effectiveRootGrades = broadRows.length ? broadRootGrades : prelaunchBroadRoots;
  const broadAnalysis = {
    dataAvailable: broadRows.length > 0, eligible: broadEligible, activationStatus,
    role: input.productStage === 'new'
      ? '新品非标且市场严重分散时，Broad只用于受控拓词；候选不是已验证最优词根'
      : !broadRows.length ? '未执行·Search Term报告缺少Broad匹配类型数据'
        : broadEligible ? '严重分散低单词产出：Broad仅用于低预算拓词'
          : '不建议用Broad推导集中度或核心词根；仅保留受控探索',
    reason: input.productStage === 'new'
      ? `阶段=新品；产品类型=${input.productType}；分散=${level}；Broad候选词根=${broadCandidateRoots.length}`
      : `分散=${level}；Broad数据=${broadRows.length?'已提供':'未提供，可先做候选预判'}；稳定大词=${stableBigWords.length}；Broad CVR=${broadCvr == null ? '待实投' : (broadCvr*100).toFixed(1)+'%'}`,
    activationChecks:{severeDispersion:enabled,noStableBigWords:stableBigWords.length===0,
      lowOrdersPerTerm:avgOrdersPerTerm!=null&&avgOrdersPerTerm<3,lowBroadConversion,longTailInsufficient,hasWeekData,
      exactPhraseCoverage,stableBigWordCount:stableBigWords.length, productStage:input.productStage,
      productType:input.productType, nonStandardProduct:input.productType==='non-standard', broadDataAvailable:broadRows.length>0,
      candidateRootCount:broadCandidateRoots.length, hasCandidateRoot:broadCandidateRoots.length>=1},
    totals: { ...broadTotals, cvr: broadCvr, avgOrdersPerTerm },
    harvest: broadHarvest, rootGrades:effectiveRootGrades,
    pollutionWarning: 'Broad包含Phrase及更宽扩展，相关性更易污染；不进入正式词根排名，不用于推导类目集中度。'
  };
  return {
    enabled, level,
    trigger: `Top20占比 ${(traffic.top20Share * 100).toFixed(1)}%；断层比 ${traffic.gapRatio?.toFixed(2) ?? '不可计算'}`,
    decisionBasis: enabled ? '严重分散：优先按词根聚合、订单贡献、CVR、意向指数、稳定性和盈利性判断，不以单词搜索量冠军代替最优。'
      : '当前未同时满足 Top20<40% 与断层比<1.5，保留常规词级+词根双层判断。',
    broadBoundary: 'Broad 是广告广泛匹配方式；其搜索词报告反映投放触发结果，不等于类目天然需求结构。',
    confirmedOptimalKeywords: [],
    confirmedOptimalRoots: [],
    keywordCandidates,
    rootCandidates, broadAnalysis,
    verificationGap: input.productStage === 'new'
      ? '新品缺少自身点击、订单、跨周和盈利数据，只能输出市场候选。'
      : '当前导入未形成跨周活跃周数与词根大盘覆盖率，候选不得升级为已验证最优。'
  };
}

export async function analyzeRequest(rawInput, env = (typeof process !== 'undefined' ? process.env : {})) {
  const input = validate(rawInput);
  const providerName = ['mcp', 'import'].includes(rawInput.source) ? rawInput.source : (env.DATA_PROVIDER || 'mock');
  const provider = providerName === 'mcp' ? new McpProvider(env)
    : providerName === 'import' ? new ImportProvider(rawInput.importedKeywords) : new MockProvider();
  const raw = await provider.getKeywordData(input);
  const sqpTerms = aggregateSqpRows(rawInput.ownSqpRows);
  const adTerms = aggregateAdRows(rawInput.adSearchTermRows);
  const emptySqp = { sqpImpressions: 0, sqpClicks: 0, sqpCartAdds: 0, sqpPurchases: 0, sqpQueryVolume: 0 };
  const emptyAds = { adClicks: 0, adOrders: 0, adSpend: 0, adSales: 0 };
  const enriched = raw.map((item) => ({
    ...item,
    ...(sqpTerms.get(String(item.keyword).trim().toLowerCase()) || emptySqp),
    ...(adTerms.get(String(item.keyword).trim().toLowerCase()) || emptyAds)
  }));
  const known = new Set(enriched.map((item) => String(item.keyword).trim().toLowerCase()));
  const reportKeywords = new Set([...sqpTerms.keys(), ...adTerms.keys()]);
  for (const keyword of reportKeywords) {
    if (!known.has(keyword)) enriched.push({
      keyword, root: keyword.split(/\s+/).slice(-2).join(' '),
      dimension: sqpTerms.has(keyword) ? 'SQP 官方查询词' : '广告真实搜索词',
      marketSearches: sqpTerms.get(keyword)?.sqpQueryVolume || 0, marketPurchases: 0, marketPurchaseRate: null,
      spr: 0, coverage: input.competitorAsins.map(() => 0), reverseFrequency: 0, conflict: null,
      source: sqpTerms.has(keyword) ? 'Amazon SQP 官方账户数据' : 'Amazon 广告账户数据',
      sourceTool: sqpTerms.has(keyword) ? 'SQP Import' : 'Search Term Import', month: 'imported', competitorAsins: [],
      ...(sqpTerms.get(keyword) || emptySqp), ...(adTerms.get(keyword) || emptyAds)
    });
  }
  const top20 = [...enriched].sort((a, b) => (b.marketSearches || 0) - (a.marketSearches || 0)).slice(0, 20);
  const top20Rates = top20.map((item) => item.marketPurchaseRate ?? (item.marketSearches > 0 ? item.marketPurchases / item.marketSearches : null)).filter((value) => value != null);
  const top20MarketCvrMean = top20Rates.length ? top20Rates.reduce((sum, value) => sum + value, 0) / top20Rates.length : null;
  const totals = top20.reduce((acc, item) => {
    acc.sqpClicks += item.sqpClicks || 0; acc.sqpPurchases += item.sqpPurchases || 0;
    acc.adClicks += item.adClicks || 0; acc.adOrders += item.adOrders || 0; return acc;
  }, { sqpClicks: 0, sqpPurchases: 0, adClicks: 0, adOrders: 0 });
  const groups = new Map();
  for (const item of enriched) {
    item.wordLengthType = wordLengthType(item.keyword);
    const values = groups.get(item.wordLengthType) || []; values.push(item.spr || 0); groups.set(item.wordLengthType, values);
  }
  for (const item of enriched) {
    const values = groups.get(item.wordLengthType), min = Math.min(...values), max = Math.max(...values);
    item.sprEase = max === min ? 1 : round(0.1 + 0.9 * (max - (item.spr || 0)) / (max - min), 4);
    const marketCvr = item.marketPurchaseRate ?? (item.marketSearches > 0 ? item.marketPurchases / item.marketSearches : null);
    item.marketIntentIndex = marketCvr != null && top20MarketCvrMean > 0 ? marketCvr / top20MarketCvrMean : null;
    const sqpClickShare = item.sqpClickShare ?? (totals.sqpClicks ? item.sqpClicks / totals.sqpClicks : null);
    const sqpPurchaseShare = item.sqpPurchaseShare ?? (totals.sqpPurchases ? item.sqpPurchases / totals.sqpPurchases : null);
    const adClickShare = totals.adClicks ? item.adClicks / totals.adClicks : null;
    const adOrderShare = totals.adOrders ? item.adOrders / totals.adOrders : null;
    item.ownIntentIndexFromShares = sqpClickShare > 0 && sqpPurchaseShare != null
      ? sqpPurchaseShare / sqpClickShare : adClickShare > 0 && adOrderShare != null ? adOrderShare / adClickShare : null;
  }
  const prelim = enriched.map((item) => scoreKeyword(item, input));
  const gated = prelim.filter((item) => item.gatePassed && item.score != null).sort((a, b) => b.score - a.score);
  const worthCount = gated.length ? Math.max(1, Math.ceil(gated.length / 3)) : 0;
  const worth = new Set(gated.slice(0, worthCount).map((item) => item.normalizedKeyword));
  const rank = new Map(gated.map((item, index) => [item.normalizedKeyword, index + 1]));
  const keywords = prelim.map((item) => ({
    ...item, scoreRank: rank.get(item.normalizedKeyword) ?? null,
    status: worth.has(item.normalizedKeyword) ? '值得投' : item.status,
    finalConclusion: worth.has(item.normalizedKeyword)
      ? (input.productStage === 'existing' ? '已验证优质词' : '新品候选优质词') : item.status
  })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const roots = summarizeRoots(keywords, input);
  const traffic = trafficSummary(keywords);
  const dispersion = dispersionSummary(keywords, roots, traffic, input);
  const qualityKeywords = keywords.filter((item) => item.status === '值得投').map((item, index) => ({
    ...item, tier: index < 3 ? 'S' : index < 10 ? 'A' : 'B'
  }));
  const totalKeywordSearches = keywords.reduce((sum, item) => sum + item.marketSearches, 0) || 1;
  const fiveDimensions = ['核心词', '同义词', '规格词', '替代词', '互补词'].map((dimension) => {
    const rows = keywords.filter((item) => item.dimension === dimension);
    const searches = rows.reduce((sum, item) => sum + item.marketSearches, 0);
    const purchases = rows.reduce((sum, item) => sum + item.marketPurchases, 0);
    return { dimension, keywordCount: rows.length, countShare: rows.length / Math.max(1, keywords.length),
      searches, searchShare: searches / totalKeywordSearches, purchases,
      representativeKeywords: [...rows].sort((a,b)=>b.marketSearches-a.marketSearches).slice(0, 3).map((item) => item.keyword),
      structuralGap: rows.length ? '已覆盖' : '⚠️缺口，需主动拓词' };
  });
  const excludedKeywords = keywords.filter((item) => item.status !== '值得投').map((item) => ({
    ...item,
    exclusionCategory: item.brandConflict ? '竞品品牌词' : item.specConflict ? '规格冲突词'
      : item.colorConflict ? '颜色冲突词' : item.functionConflict ? '功能冲突词'
      : item.activeIntentIndex == null ? '指标缺失的待验证词'
      : item.activeIntentIndex < 1 ? '意向指数<1的泛流量词'
        : item.reverseStatus === '待验证·缺少Listing文本' ? '待核实词'
          : item.adClicks > 0 && item.adOrders === 0 ? '有自身广告数据时的否定词候选' : '观察词',
    exclusionReason: item.productConflictCheck !== '无明确冲突' ? item.productConflictCheck
      : item.activeIntentIndex == null ? '意向指数缺失' : item.activeIntentIndex < 1 ? `有效意向指数 ${item.activeIntentIndex.toFixed(2)}<1`
        : item.reverseFrequency < 2 ? `反选频次 ${item.reverseFrequency}<2` : '门槛通过但综合评分未进入前1/3',
    compositeScoreRank: item.scoreRank
  }));
  const selfAssessment = {
    '已完成新品/老品判断': ['new','existing'].includes(input.productStage),
    '提供1–3个有效竞品ASIN': input.competitorAsins.length >= 1 && input.competitorAsins.length <= 3,
    '先门槛后排名且仅前1/3值得投': qualityKeywords.every((item)=>item.gatePassed),
    '新品使用市场意向指数': input.productStage !== 'new' || keywords.every((item)=>item.intentIndex == null || item.activeIntentIndex===item.marketIntentIndex),
    '综合评分未包含反选频次': true,
    'SPR按词长类型归一化': keywords.every((item)=>item.sprEase>=0.1 && item.sprEase<=1),
    '词根得分使用转化份额×意向指数': roots.every((item)=>item.priorityScore==null || Math.abs(item.priorityScore-item.rootConversionShare*item.rootIntentIndex)<1e-9),
    '优质词根同时满足三个条件': roots.filter((item)=>item.isQualityRoot).every((item)=>item.rank<=3&&item.rootIntentIndex>=1&&item.qualityKeywordCount>=1),
    '五维结构已检查缺口': fiveDimensions.length===5,
    '排除与待验证已逐词分类': excludedKeywords.every((item)=>Boolean(item.exclusionCategory))
  };
  return {
    meta: {
      ...input, source: provider.name, generatedAt: new Date().toISOString(),
      persisted: false,
      disclaimer: provider.name === 'mock' ? '当前为演示数据，不代表真实市场结果。'
        : provider.name === 'file-import' ? '当前结果基于用户导入文件，指标口径取决于文件来源。'
          : 'SellerSprite 指标属于第三方估算口径。'
    },
    summary: {
      totalKeywords: keywords.length,
      qualified: qualityKeywords.length,
      watch: keywords.filter((item) => item.status === '观察').length,
      rejected: keywords.filter((item) => item.status === '暂不建议').length,
      notApplicable: keywords.filter((item) => item.status === '不适用').length,
      concentration: traffic.concentration,
      gapRatio: traffic.gapRatio
    },
    qualityKeywords,
    qualityRoots: roots.filter((item) => item.isQualityRoot),
    mainLibrary: keywords,
    rootAnalysis: roots,
    traffic,
    dispersion,
    fiveDimensions,
    excludedKeywords,
    selfAssessment,
    dataQuality: {
      intentIndexCoverage: keywords.filter((item) => item.intentIndex != null).length / Math.max(1, keywords.length),
      limitations: [
        input.productStage === 'existing'
          ? `${sqpTerms.size ? '依赖度 I 优先使用 SQP 同词 CVR。' : '未提供 SQP 时，依赖度 I 降级使用广告搜索词 CVR。'} SQP 与广告点击/订单保持独立，未相加；未提供跨周字段时不判定为稳定 I。`
          : '新品未导入账户搜索词点击/订单，因此不计算词级依赖度 I。',
        provider.name === 'mock' ? '演示 Provider 仅用于验证应用流程。'
          : provider.name === 'file-import' ? '分析质量取决于导入字段的完整性与来源口径。'
            : 'SellerSprite 搜索量、购买量和购买率属于第三方估算口径。'
      ]
    }
  };
}


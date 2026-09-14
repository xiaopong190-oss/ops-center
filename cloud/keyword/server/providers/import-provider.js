const aliases = {
  keyword: ['keyword', '关键词', 'searchTerm', 'search_term'], root: ['root', '词根', 'keywordRoot', '主词根'],
  dimension: ['dimension', '流量维度', '意图分类'], searches: ['marketSearches', 'searches', '月搜索量', '搜索量'],
  purchases: ['marketPurchases', 'purchases', '月购买量', '购买量'],
  purchaseRate: ['marketPurchaseRate', 'purchaseRate', '购买率', '转化率'], spr: ['spr', 'SPR'],
  frequency: ['reverseFrequency', '反选频次', '竞品频次']
};
function pick(row, keys) { for (const key of keys) if (row[key] !== undefined && row[key] !== '') return row[key]; return null; }
function numeric(row, keys) {
  const raw = pick(row, keys); if (raw == null) return null;
  const value = Number(String(raw).replace(/[,\s%$]/g, ''));
  if (!Number.isFinite(value)) return null;
  return String(raw).includes('%') ? value / 100 : value;
}
export class ImportProvider {
  name = 'file-import';
  constructor(rows) { this.rows = rows; }
  async getKeywordData({ competitorAsins }) {
    if (!Array.isArray(this.rows) || !this.rows.length) throw new Error('导入文件没有数据行');
    const normalized = this.rows.slice(0, 5000).map((row) => {
      const keyword = String(pick(row, aliases.keyword) || '').trim(); if (!keyword) return null;
      const searches = numeric(row, aliases.searches) || 0;
      const purchases = numeric(row, aliases.purchases);
      let rate = numeric(row, aliases.purchaseRate); if (rate != null && rate > 1) rate /= 100;
      if (rate == null && searches > 0 && purchases != null) rate = purchases / searches;
      const frequency = Math.max(1, Math.round(numeric(row, aliases.frequency) || 1));
      return {
        keyword, normalizedKeyword: keyword.toLowerCase().replace(/\s+/g, ' '),
        root: String(pick(row, aliases.root) || keyword.split(/\s+/).slice(-2).join(' ')),
        dimension: String(pick(row, aliases.dimension) || '待分类'), marketSearches: searches,
        classificationBasis: pick(row, ['分类依据']) || '导入文件未提供分类依据',
        marketPurchases: purchases || 0, marketPurchaseRate: rate, spr: numeric(row, aliases.spr) || 0,
        coverage: competitorAsins.map((_, index) => index < frequency ? 1 : 0),
        reverseFrequency: Math.min(frequency, competitorAsins.length), conflict: null,
        productConflictCheck: pick(row, ['产品冲突检查']) || '待验证·导入文件未提供产品属性',
        listingCoverage: null, reverseStatus: '待验证', trafficShares: {},
        source: '用户导入文件', sourceTool: 'ImportProvider', month: 'imported',
        competitorAsins: competitorAsins.slice(0, frequency)
      };
    }).filter(Boolean);
    if (!normalized.length) throw new Error('导入文件缺少 keyword 或 关键词列');
    return normalized;
  }
}


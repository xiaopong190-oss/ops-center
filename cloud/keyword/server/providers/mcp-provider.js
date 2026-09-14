


function parseToolResult(result) {
  if (result?.isError) throw new Error('卖家精灵 MCP 工具返回错误');
  const texts = (result?.content || []).filter((part) => part.type === 'text').map((part) => part.text);
  if (!texts.length) return result?.structuredContent || {};
  for (const text of texts) {
    try { return JSON.parse(text); } catch { /* try next content item */ }
  }
  throw new Error('卖家精灵 MCP 返回了无法解析的文本结果');
}

function findRecords(value, depth = 0) {
  if (depth > 6 || value == null) return [];
  if (Array.isArray(value)) {
    if (!value.length || typeof value[0] === 'object') return value;
    return [];
  }
  if (typeof value !== 'object') return [];
  for (const key of ['records', 'items', 'list', 'rows', 'data', 'result']) {
    if (key in value) {
      const found = findRecords(value[key], depth + 1);
      if (found.length) return found;
    }
  }
  for (const child of Object.values(value)) {
    const found = findRecords(child, depth + 1);
    if (found.length) return found;
  }
  return [];
}

function numeric(record, ...keys) {
  for (const key of keys) {
    const raw = record[key];
    if (raw !== undefined && raw !== null && raw !== '') {
      const value = Number(String(raw).replace(/[%,$]/g, ''));
      if (Number.isFinite(value)) return String(raw).includes('%') ? value / 100 : value;
    }
  }
  return null;
}

function rootFor(keyword) {
  const words = keyword.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length <= 2 ? words.join(' ') : words.slice(-2).join(' ');
}

function normalizeKeyword(keyword) { return String(keyword).trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' '); }

function dimensionFor(keyword) {
  const value = keyword.toLowerCase();
  if (/without|instead|alternative|replacement|substitute/.test(value)) return ['替代词', '包含替代、替换或规避属性语义'];
  if (/scale|filter|stand|holder|accessory|cleaner/.test(value)) return ['互补词', '描述与目标产品配套使用的商品'];
  if (/with |size|inch|steel|plastic|color|temperature|\d/.test(value)) return ['规格词', '包含材质、尺寸、颜色、功能或数值规格'];
  if (/tea kettle|pour over kettle/.test(value)) return ['同义词', '与核心品类存在同义或近义表达'];
  return ['核心词', '直接描述目标品类或核心产品'];
}

function normalizeRecord(record, input) {
  const keyword = String(record.keyword || record.keywords || record.searchTerm || record.keywordName || '').trim();
  if (!keyword) return null;
  const searches = numeric(record, 'searches', 'searchVolume', 'monthlySearches') || 0;
  const purchases = numeric(record, 'purchases', 'monthlyPurchases', 'purchaseVolume');
  let purchaseRate = numeric(record, 'purchaseRate', 'conversionRate');
  if (purchaseRate != null && purchaseRate > 1) purchaseRate /= 100;
  if (purchaseRate == null && searches > 0 && purchases != null) purchaseRate = purchases / searches;
  const related = record.relatedAsins || record.asinList || (typeof record.relationAsin === 'string' ? record.relationAsin : []);
  const relatedAsins = Array.isArray(related) ? related : String(related).split(/[,;\s]+/).filter(Boolean);
  const coverage = input.competitorAsins.map((asin) => relatedAsins.includes(asin) ? 1 : 0);
  const declaredFrequency = numeric(record, 'competitors', 'competitorCount', 'relationAsin', 'asinCount');
  const reverseFrequency = Math.min(
    input.competitorAsins.length,
    Math.max(1, coverage.reduce((sum, value) => sum + value, 0), Math.round(declaredFrequency || 0))
  );
  const [dimension, classificationBasis] = dimensionFor(keyword);
  return {
    keyword,
    normalizedKeyword: normalizeKeyword(keyword),
    root: String(record.root || record.keywordRoot || rootFor(keyword)),
    dimension,
    classificationBasis,
    marketSearches: searches,
    marketPurchases: purchases ?? 0,
    marketPurchaseRate: purchaseRate,
    spr: numeric(record, 'spr', 'cprExact', 'SPR') || 0,
    coverage,
    reverseFrequency,
    conflict: null,
    productConflictCheck: '待验证·缺少目标产品品牌/规格/颜色/功能属性',
    listingCoverage: null,
    reverseStatus: '待验证·缺少目标Listing文本',
    trafficShares: {},
    source: 'SellerSprite 第三方估算',
    sourceTool: 'traffic_extend',
    month: record.historyDate || record.month || 'nearly',
    competitorAsins: input.competitorAsins.filter((_, index) => coverage[index])
  };
}

export class McpProvider {
  name = 'seller-sprite-mcp';

  constructor(env = {}) {
    this.env = env;
  }

  async getKeywordData(input) {
    let client;
    try {
      if (!this.env.createMcpClient) throw new Error('卖家精灵连接尚未配置');
      client = this.env.createMcpClient();
      const tools = await client.listTools();
      if (!tools.tools.some((tool) => tool.name === 'traffic_extend')) {
        throw new Error('MCP 服务没有提供 traffic_extend 工具');
      }
      const result = await client.callTool({
        name: 'traffic_extend',
        arguments: {
          request: {
            asinList: input.competitorAsins,
            marketplace: input.marketplace,
            queryType: 2,
            page: 1,
            size: 100,
            order: { field: 'searches', desc: true }
          }
        }
      }, undefined, { timeout: 90_000 });
      const payload = parseToolResult(result);
      const records = findRecords(payload).map((record) => normalizeRecord(record, input)).filter(Boolean);
      if (!records.length) throw new Error('卖家精灵 MCP 未返回可用关键词记录');
      const byKeyword = new Map(records.map((record) => [record.normalizedKeyword, record]));
      if (tools.tools.some((tool) => tool.name === 'traffic_keyword')) {
        const asins = [input.ownAsin, ...input.competitorAsins];
        const details = await Promise.all(asins.map(async (asin) => {
          try {
            const detail = await client.callTool({ name: 'traffic_keyword', arguments: { request: {
              asin, marketplace: input.marketplace, page: 1, size: 100,
              order: { field: 'trafficPercentage', desc: true }
            } } }, undefined, { timeout: 90_000 });
            return [asin, findRecords(parseToolResult(detail))];
          } catch { return [asin, []]; }
        }));
        for (const [asin, rows] of details) for (const row of rows) {
          const normalized = normalizeRecord(row, input); if (!normalized) continue;
          const item = byKeyword.get(normalized.normalizedKeyword) || normalized;
          const share = numeric(row, 'trafficPercentage', 'trafficShare') || 0;
          item.trafficShares[asin] = share > 1 ? share / 100 : share;
          const competitorIndex = input.competitorAsins.indexOf(asin);
          if (competitorIndex >= 0) item.coverage[competitorIndex] = 1;
          else item.targetTrafficCoverage = true;
          byKeyword.set(item.normalizedKeyword, item);
        }
      }
      return [...byKeyword.values()].map((item) => ({
        ...item,
        reverseFrequency: item.coverage.reduce((sum, value) => sum + Number(Boolean(value)), 0),
        competitorAsins: input.competitorAsins.filter((_, index) => item.coverage[index])
      }));
    } catch (error) {
      const message = String(error?.message || '未知错误').replace(/https?:\/\/\S+/g, '[MCP URL]');
      throw new Error(`卖家精灵 MCP 调用失败：${message}`);
    } finally {
      await client?.close().catch(() => {});
    }
  }
}


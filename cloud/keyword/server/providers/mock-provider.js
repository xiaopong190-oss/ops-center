const seeds = [
  ['gooseneck kettle with temperature control', 'gooseneck kettle', '规格词', 8200, 623, 45, [1, 1, 1]],
  ['electric gooseneck kettle stainless steel', 'gooseneck kettle', '规格词', 6400, 455, 38, [1, 1, 1]],
  ['kettle for pour over coffee lovers', 'pour over kettle', '核心词', 3900, 315, 22, [1, 0, 1]],
  ['gooseneck kettle without plastic taste', 'gooseneck kettle', '替代词', 2150, 163, 29, [1, 1, 0]],
  ['tea kettle stovetop whistling', 'tea kettle', '同义词', 5600, 330, 61, [0, 1, 1]],
  ['coffee scale with kettle', 'kettle', '互补词', 1340, 71, 54, [1, 0, 1]],
  ['cheap kettle deal', 'kettle', '核心词', 9000, 54, 60, [1, 1, 0]],
  ['red kettle vintage style', 'kettle', '规格词', 1800, 49, 70, [0, 1, 0]]
];

export class MockProvider {
  name = 'mock';

  async getKeywordData({ competitorAsins }) {
    return seeds.map(([keyword, root, dimension, searches, purchases, spr, coverage], index) => ({
      keyword, normalizedKeyword: keyword.toLowerCase(), root, dimension,
      classificationBasis: '演示分类规则', marketSearches: searches, marketPurchases: purchases,
      marketPurchaseRate: purchases / searches, spr, coverage,
      reverseFrequency: coverage.reduce((sum, value) => sum + value, 0),
      conflict: keyword.startsWith('red ') ? '颜色冲突词' : null,
      productConflictCheck: keyword.startsWith('red ') ? '颜色冲突：目标产品属性需核对' : '未发现明确冲突',
      listingCoverage: null, reverseStatus: '待验证', trafficShares: {},
      source: '演示数据', sourceTool: 'MockProvider', month: 'demo',
      competitorAsins: competitorAsins.filter((_, i) => coverage[i])
    }));
  }
}


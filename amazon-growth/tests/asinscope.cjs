const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const ctx = { window: {}, document: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../asinscope/assets/analyze.js'), 'utf8'), ctx);
const A = ctx.window.AsinScopeAnalyze;

const form = {
  targetAsin: 'B0BNVHR71X',
  site: 'US',
  dateFrom: '2026-06-15',
  dateTo: '2026-09-12',
  mode: 'standard',
  comparisonAsins: ['B0GH78L65N']
};

const planned = A.planRequests(form);
assert(planned.some(r => r.provider === 'xiyou' && r.tool === 'get_asin_variations'));
assert(planned.some(r => r.provider === 'sellersprite' && r.tool === 'review'), '标准模式必须拉卖家精灵评论，西柚没有该接口');
assert(!planned.some(r => r.provider === 'sellersprite' && r.tool === 'keepa_info'), '标准模式先不预拉 Keepa，只在西柚空结果时补');

const emptyFb = A.neededFallbacks(form, {});
assert(emptyFb.some(r => r.tool === 'keepa_info' && r.arguments.asin === 'B0BNVHR71X'), '变体/BSR 空时应补 Keepa');
assert(emptyFb.some(r => r.tool === 'keyword_order'), '关键词空时应补出单词');
assert(emptyFb.some(r => r.tool === 'asin_sales_trend'), '订单空时应补销量趋势');
assert(emptyFb.some(r => r.tool === 'keepa_info' && r.arguments.asin === 'B0GH78L65N'), '对比 ASIN 信息空时只补 Keepa');
assert(A.fallbackBudget(form) === emptyFb.length);

const filled = A.neededFallbacks(form, {
  get_asin_info: { payload: { data: { entities: [{ asin: 'B0BNVHR71X', title: 'Kettle', price: '34.99' }] } } },
  get_asin_variations: { payload: { data: { children: [{ asin: 'B0CHILD00A' }, { asin: 'B0CHILD00B' }] } } },
  get_asin_keywords: { payload: { list: [{ keyword: 'electric kettle' }] } },
  get_asin_orders_last_30_days: { payload: { list: [{ orderCount: 40 }] } },
  get_asin_traffic: { payload: { entities: [{ organicTrafficScore: 10, advertisingTrafficScore: 4 }] } },
  get_asin_bsr_trends: { payload: { list: [{ rank: 1200, localDate: '2026-09-01' }] } },
  get_asin_info_trends: { payload: { list: [{ localDate: '2026-09-01', price: 30 }] } },
  get_asin_info_change_trends: { payload: { list: [{ changeType: 'title', before: 'A', after: 'B' }] } },
  get_asin_ad_change_trends: { payload: { list: [{ type: 'sp', before: 1, after: 2 }] } },
  get_asin_traffic_trends: { payload: { list: [{ localDate: '2026-09-01', organic: 1 }] } },
  get_asin_order_trends: { payload: { list: [{ month: '2026-08', value: 10 }] } },
  review: { payload: { list: [{ content: 'leaks at the lid' }] } },
  'cmp:B0GH78L65N': { info: { title: 'Rival', price: 32 }, orders: { orderCount: 9 }, traffic: { organicTrafficScore: 2 }, bsr: { list: [{ rank: 9 }] } }
});
assert.equal(filled.length, 0, '西柚已有有效字段时不得再打卖家精灵');

assert.equal(A.flattenVariations({ data: { children: [{ asin: 'B0CHILD00A' }, 'B0CHILD00B'] } }).length, 2);
assert.equal(A.thinSlot('get_asin_info_change_trends', { list: Array.from({ length: 88 }, () => ({ title: 'Kettle', localDate: '2026-09-01' })) }), false, '日快照不能当成 Listing 改版');
assert.equal(A.thinSlot('get_asin_info_change_trends', { list: [{ changeType: 'title', before: 'A', after: 'B' }] }), true);
assert.equal(A.thinSlot('get_asin_info_change_trends', { list: Array.from({ length: 88 }, () => ({ changeType: 'title', localDate: '2026-09-01', title: 'Kettle' })) }), false, '只有 changeType 的日快照不能当 Listing 改版');
const xiyouPrice = {
  data: {
    trends: [
      { date: '2026-06-15', priceDistribution: { display: '39.99', deal: '', coupon: [] } },
      { date: '2026-06-16', priceDistribution: { display: '33.14', deal: '33.14', coupon: [] } },
      { date: '2026-06-17', priceDistribution: { display: '39.99', deal: '', coupon: [] } }
    ]
  }
};
assert.equal(A.thinSlot('get_asin_info_trends', xiyouPrice), true, 'priceDistribution.display 必须当成价格日点');
const xiyouChange = {
  data: {
    trends: [
      { date: '2026-06-15', previous: { title: 'Old', image: 'a' }, current: { title: 'Old', image: 'a' } },
      { date: '2026-07-15', previous: { title: 'Old Title Long', image: 'a' }, current: { title: 'New Title Short', image: 'a' } }
    ]
  }
};
assert.equal(A.thinSlot('get_asin_info_change_trends', xiyouChange), true, 'previous/current 标题有差才是改版');
const xiyouAds = { data: { trends: [{ date: '2026-07-23', added: { 0: [{ campaignName: 'SP-A', campaignType: 'sp' }] } }, { date: '2026-07-24', added: {} }] } };
assert.equal(A.thinSlot('get_asin_ad_change_trends', xiyouAds), true, 'added 新活动才是广告动作');
const s5live = A.build({
  get_asin_info_trends: { payload: xiyouPrice },
  get_asin_info_change_trends: { payload: xiyouChange },
  get_asin_ad_change_trends: { payload: xiyouAds }
}, form, {});
const s5b = s5live.sections.find(s => s.id === 's5');
assert.notEqual(s5b.grade, '数据不足', s5b.body.lead);
assert(s5b.body.priceMoves >= 2, '39.99→33.14→39.99 应记两次价格动作');
assert.equal(s5b.body.listingChanges, 1);
assert.equal(s5b.body.newAds, 1);
assert(s5b.body.promoDays >= 1);
assert(s5b.body.process[0].n === 1);

const report = A.build({
  get_asin_info_change_trends: { payload: { list: Array.from({ length: 88 }, () => ({ title: 'Kettle', localDate: '2026-09-01' })) } },
  get_asin_ad_change_trends: { payload: { list: Array.from({ length: 88 }, () => ({ title: 'Kettle' })) } },
  keepa_info: { payload: { data: { title: 'Gooseneck', brand: 'Stariver', price: 34.9, children: [{ asin: 'B0CHILD00A' }], bsr: [{ timePoint: 1757000000, value: 800 }], price: [{ timePoint: 1757000000, value: 34.9 }] } } },
  review: { payload: { list: [{ content: 'handle gets hot' }] } }
}, form, {});
const s5 = report.sections.find(s => s.id === 's5');
const s6 = report.sections.find(s => s.id === 's6');
const s7 = report.sections.find(s => s.id === 's7');
const bsrPayload = {
  data: {
    categoryTree: [
      { categoryId: '1', name: 'Kitchen', root: true },
      { categoryId: '289753', name: 'Electric Kettles', root: false }
    ],
    trends: [
      { date: '2026-06-15', values: [{ categoryId: '1', rank: 2000 }, { categoryId: '289753', rank: 80 }] },
      { date: '2026-09-12', values: [{ categoryId: '1', rank: 1800 }, { categoryId: '289753', rank: 30 }] }
    ]
  }
};
assert.equal(A.bsrSeries(bsrPayload).length, 2);
assert.equal(A.bsrSeries(bsrPayload)[0].rank, 80);
assert.equal(A.thinSlot('get_asin_bsr_trends', bsrPayload), true);
const life = A.build({ get_asin_bsr_trends: { payload: bsrPayload } }, form, {});
const lifeCard = life.cards.find(c => c.label === '生命周期');
assert(lifeCard.value.indexOf('增长') >= 0, lifeCard.value);
assert(lifeCard.value.indexOf('#30') >= 0, lifeCard.value);
assert.notEqual(lifeCard.value, '数据不足');

const blocked = A.build({
  get_asin_variations: { payload: { data: { entities: [] } } },
  keepa_info: { payload: { data: { title: 'Gooseneck', children: [{ asin: 'B0CHILD00A' }] } } }
}, form, {});
assert(blocked.sections.find(s => s.id === 's6').body.variantCount >= 1, '西柚变体为空时必须改用 Keepa 子体');
assert.equal(s5.body.listingChanges, 0);
assert.equal(s5.body.newAds, 0);
assert(s6.body.variantCount >= 1, 'Keepa 子体应补上变体数');
assert.equal(s7.body.reviewCount, 1);
assert(s7.body.process && s7.body.process[0] && s7.body.process[0].n === 1, 'VOC 分析过程必须从步骤 1 开始');
assert(s7.body.conclusion && s7.body.conclusion.length >= 3, 'VOC 必须有核心结论，不能只报条数');
assert(s7.body.lead && /手柄/.test(s7.body.lead + s7.body.conclusion.join('')), '有正文时要做主题分层，不能只写评论样本');
assert(report.cards[0].value.indexOf('Stariver') >= 0 || report.cards[0].value.indexOf('Gooseneck') >= 0);

const voc = A.vocAnalyze({
  data: {
    items: [
      { star: 4, title: 'drip', content: 'The lid leaks and drips at the spout', date: 1726000000000, verified: true },
      { star: 3, title: 'again', content: 'lid leaks after a week', date: 1726100000000 },
      { star: 5, title: 'nice', content: 'precise pour gooseneck easy to use', date: 1726200000000 }
    ]
  }
});
assert.equal(voc.process[0].n, 1);
assert(voc.process.some(p => p.title === '抽样'));
assert(voc.conclusion.some(c => /漏水/.test(c)), '3–4★ 漏水应记主痛点，5★ gooseneck 不得抢痛点');
assert(voc.layers.find(l => l.name === '可改进痛点').n >= 1);
assert(voc.themes.some(t => /漏水/.test(t.name) && t.n >= 2));
assert(voc.excerpts.length === 3);

const emptyVoc = A.vocAnalyze({});
assert(emptyVoc.conclusion.some(c => /不能做 VOC|没有评论/.test(c)));
assert.equal(emptyVoc.reviewCount, 0);
assert(!emptyVoc.analyzed);

const noDict = A.vocAnalyze({ list: [{ star: 5, content: 'Great product I love the color' }] });
assert(noDict.conclusion.some(c => /没有命中产品痛点|不能编造/.test(c)));
assert.equal(noDict.themes.length, 0);

report.sections.forEach(sec => {
  assert(sec.body && sec.body.process && sec.body.process[0] && sec.body.process[0].n === 1, sec.id + ' 必须有分析过程步骤 1');
  assert(sec.body.conclusion && sec.body.conclusion.length >= 2, sec.id + ' 必须有核心结论，不能只报条数');
  assert(sec.body.lead, sec.id + ' 必须有导语');
});
assert(report.sections.find(s => s.id === 's1').body.facts.some(r => r[0] === '功能点'));
assert(/走量|主推/.test(report.sections.find(s => s.id === 's6').body.conclusion.join('')));

const emptyCh = A.build({}, { targetAsin: 'B0BNVHR71X', site: 'US', mode: 'standard', comparisonAsins: [] }, {});
assert(emptyCh.sections.find(s => s.id === 's1').body.conclusion.some(c => /不能做商品定位|没有标题/.test(c)));
assert(emptyCh.sections.find(s => s.id === 's8').body.conclusion.some(c => /没有对比|未添加/.test(c)));

console.log('PASS asinscope seller-sprite fallback, review in standard, snapshot not counted as listing edits');

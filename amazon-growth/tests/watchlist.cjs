const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const ctx = { window: {}, document: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../watchlist/assets/analyze.js'), 'utf8'), ctx);
const A = ctx.window.WatchlistAnalyze;

const form = {
  site: 'US',
  asins: ['B0BNVHR71X', 'B0GH78L65N', 'B0D621B6Y9'],
  keywords: 'electric kettle, gooseneck kettle',
  dateFrom: '2026-06-15',
  dateTo: '2026-09-12'
};

assert.equal(A.MAX_WINDOW_DAYS, 31);
assert.equal(A.windowOf({ dateFrom: '2026-08-14', dateTo: '2026-09-12' }).days, 30);
assert.equal(A.windowOf({ dateFrom: '2026-06-01', dateTo: '2026-09-12' }).clamped, true);
assert.equal(A.windowOf({ dateFrom: '2026-06-01', dateTo: '2026-09-12' }).days, 31);
assert(A.windowOf({ dateFrom: '', dateTo: '' }).error);

assert.deepEqual(A.rosterFrom({ asins: form.asins.concat(['B0BNVHR71X', 'BAD', 'B0EXTRA001', 'B0EXTRA002', 'B0EXTRA003', 'B0EXTRA004', 'B0EXTRA005']) }).length, 8);
assert.deepEqual(A.keywordsFrom(form), ['electric kettle', 'gooseneck kettle']);

const planned = A.planRequests(form);
assert(planned.some(r => r.provider === 'xiyou' && r.tool === 'get_asin_info' && r.arguments.asin === 'B0GH78L65N'));
assert(planned.some(r => r.provider === 'xiyou' && r.tool === 'get_asin_info_change_trends' && r.arguments.asin === 'B0D621B6Y9'));
assert(planned.some(r => r.provider === 'xiyou' && r.tool === 'get_multi_asin_keyword_comparison' && r.arguments.asins.length === 3));
assert(planned.some(r => r.provider === 'sellersprite' && r.tool === 'review' && r.arguments.asin === 'B0BNVHR71X'));
assert(planned.some(r => r.provider === 'sellersprite' && r.tool === 'keepa_info'));
assert(planned.some(r => r.provider === 'sellersprite' && r.tool === 'asin_competitor'));
assert(planned.some(r => r.provider === 'xiyou' && r.tool === 'get_keyword_info' && r.arguments.keyword === 'electric kettle'));
assert(planned.some(r => r.provider === 'xiyou' && r.tool === 'get_asin_keyword_rank_trends' && r.arguments.asin === 'B0GH78L65N'));
assert(!A.planRequests({ asins: ['B0BNVHR71X'] }).some(r => r.tool === 'get_multi_asin_keyword_comparison'));

const snaps = { trends: Array.from({ length: 88 }, () => ({ date: '2026-09-01', title: 'Kettle' })) };
assert.equal(A.listingEdits(snaps).length, 0, '日快照不能当成 Listing 改版');
assert.equal(A.listingEdits({
  trends: [{ date: '2026-07-15', previous: { title: 'Old' }, current: { title: 'New' } }]
}).length, 1);
assert.equal(A.adAdds({
  trends: [{ date: '2026-07-01', added: { 0: [{ campaignName: 'SP-A', campaignType: 'sp' }] } }]
}).length, 1);
assert.equal(A.playOf({ listing: 1, ads: 2, cuts: 1, adsRatio: null, orders: 10 }), '促销冲量');
assert.equal(A.playOf({ listing: 0, ads: 0, cuts: 0, ups: 0, adsRatio: null, orders: null }), '窗口内安静');

const empty = A.build({}, { site: 'US', asins: [], dateFrom: '2026-06-15', dateTo: '2026-09-12' });
assert(empty.sections[0].lead.indexOf('没有主 ASIN') >= 0);
assert(empty.sections[0].process[0].n === 1);
assert(empty.sections[0].conclusion.length >= 2);

const diaryBucket = {
  get_asin_bsr_trends: { payload: { trends: [
    { date: '2026-07-10', values: [{ rank: 100, categoryId: '1' }] },
    { date: '2026-07-15', values: [{ rank: 100, categoryId: '1' }] },
    { date: '2026-07-20', values: [{ rank: 70, categoryId: '1' }] }
  ], categoryTree: [{ categoryId: '1', name: 'Electric Kettles' }] } },
  get_asin_info_trends: { payload: { trends: [
    { date: '2026-07-10', stars: 4.4, ratings: 100, priceDistribution: { display: 40 } },
    { date: '2026-07-15', stars: 4.4, ratings: 102, priceDistribution: { display: 32, deal: 32, coupon: [{}] } },
    { date: '2026-07-20', stars: 4.4, ratings: 110, priceDistribution: { display: 32 } }
  ] } },
  get_asin_info_change_trends: { payload: { trends: [{ date: '2026-07-15', previous: { title: 'A' }, current: { title: 'B' } }] } }
};
const days = A.diaryOf(diaryBucket);
assert(days.length >= 3);
assert(days.some(d => d.day === '2026-07-15' && d.active.indexOf('改 Listing') >= 0 && d.active.indexOf('降价') >= 0));
const stickyCoupon = A.diaryOf({
  get_asin_info_trends: { payload: { trends: [
    { date: '2026-07-10', stars: 4.4, ratings: 100, priceDistribution: { display: 40 } },
    { date: '2026-07-11', stars: 4.4, ratings: 100, priceDistribution: { display: 40, coupon: [{}] } },
    { date: '2026-07-12', stars: 4.4, ratings: 100, priceDistribution: { display: 40, coupon: [{}] } }
  ] } }
});
assert(stickyCoupon.some(d => d.day === '2026-07-11' && d.coupon && d.active.indexOf('优惠') >= 0), '出券当天应记主动优惠');
assert(stickyCoupon.some(d => d.day === '2026-07-12' && d.coupon && d.active.indexOf('优惠') < 0), '连续有券不当新动作');
assert(days.some(d => d.passive.indexOf('Ratings') >= 0 || d.day === '2026-07-10'));
const scored = A.scoreActions(days);
assert(scored.some(s => s.day === '2026-07-15' && s.verdict === '名次改善' && s.learn === '可学习'));
const adsOnly = A.scoreActions(A.diaryOf({
  get_asin_bsr_trends: { payload: { trends: [
    { date: '2026-07-10', values: [{ rank: 100, categoryId: '1' }] },
    { date: '2026-07-15', values: [{ rank: 100, categoryId: '1' }] },
    { date: '2026-07-20', values: [{ rank: 70, categoryId: '1' }] }
  ], categoryTree: [{ categoryId: '1', name: 'Electric Kettles' }] } },
  get_asin_ad_change_trends: { payload: { trends: [{ date: '2026-07-15', added: { 0: [{ campaignName: 'SP' }] } }] } }
}));
assert(adsOnly.some(s => s.day === '2026-07-15' && s.verdict === '名次改善' && s.learn === '可核验名次，不可复制花费'));
assert(!adsOnly.some(s => s.learn === '可学习'));

const report = A.build({
  B0BNVHR71X: Object.assign({
    get_asin_info: { payload: { data: { entities: [{ asin: 'B0BNVHR71X', brand: 'Nueve', title: 'Kettle', price: 40 }] } } },
    get_asin_ad_change_trends: { payload: { trends: [{ date: '2026-07-16', added: { 0: [{ campaignName: 'SP' }] } }] } }
  }, diaryBucket),
  B0GH78L65N: {
    get_asin_info: { payload: { data: { entities: [{ asin: 'B0GH78L65N', brand: 'Rival', title: 'Other', price: 29 }] } } }
  }
}, { site: 'US', asins: ['B0BNVHR71X', 'B0GH78L65N'], dateFrom: '2026-06-15', dateTo: '2026-09-12' });
assert(report.cards[0].value.indexOf('天') >= 0);
assert(report.sections.every(s => s.process && s.process[0] && s.process[0].n === 1));
assert(report.sections[0].title.indexOf('每日定点') >= 0);
assert(report.sections[3].lead.indexOf('可学习') >= 0 || report.sections[3].conclusion.join('').indexOf('可学习') >= 0);
assert(report.sections[4].lead.indexOf('对照') >= 0);

const ingested = A.ingestSteps([
  { status: 'ok', tool: 'get_asin_info', provider: 'xiyou', targetAsin: 'B0BNVHR71X', data: { entities: [{ asin: 'B0BNVHR71X', brand: 'Nueve', title: 'Kettle', price: 40 }] } },
  { status: 'error', tool: 'get_asin_orders_last_30_days', targetAsin: 'B0BNVHR71X', data: { list: [{ orderCount: 9 }] } },
  { status: 'ok', tool: 'get_multi_asin_keyword_comparison', data: { list: [{ asin: 'B0BNVHR71X' }] } },
  { status: 'idle', tool: 'get_asin_traffic', data: {} },
  { status: 'ok', tool: 'get_asin_info', args: { asin: 'B0GH78L65N' }, data: { data: { entities: [{ asin: 'B0GH78L65N', brand: 'Rival', title: 'Other', price: 29 }] } } }
], 'US');
assert(ingested.evidence.B0BNVHR71X && ingested.evidence.B0BNVHR71X.get_asin_info, 'ok + targetAsin 应入账');
assert(!ingested.evidence.B0BNVHR71X.get_asin_orders_last_30_days, 'error 步骤不得入账');
assert(ingested.evidence._shared && ingested.evidence._shared.get_multi_asin_keyword_comparison, '多 ASIN 词对照进 _shared');
assert(ingested.evidence.B0GH78L65N && ingested.evidence.B0GH78L65N.get_asin_info, 'args.asin 应入账');
assert.equal(A.filledCount(ingested.evidence), 3);
assert.equal(ingested.items.length, 3);
assert.equal(ingested.items[0].site, 'US');

const merged = A.mergeEvidence({
  B0BNVHR71X: { get_asin_info: { payload: { entities: [] } } }
}, ingested.evidence);
assert(A.thinSlot('get_asin_info', A.payloadOf(merged.B0BNVHR71X.get_asin_info)), '有标题的旧结果应覆盖空槽');

assert.equal(A.MAX_LANES, 5);
assert.deepEqual(A.lanesFrom({
  lanes: [
    { category: 'Electric Kettles', asin: 'B0BNVHR71X', peers: ['B0GH78L65N', 'B0D621B6Y9'] },
    { category: 'Pour Over', asin: 'B0GH78L65N' },
    { category: 'dup', asin: 'B0BNVHR71X' }
  ]
}).map(L => [L.category, L.asin, L.peers.length]), [['Electric Kettles', 'B0BNVHR71X', 2], ['Pour Over', 'B0GH78L65N', 0]]);

const plannedLanes = A.planRequests({
  site: 'US',
  lanes: [
    { category: 'Electric Kettles', asin: 'B0BNVHR71X' },
    { category: 'Pour Over', asin: 'B0GH78L65N' }
  ],
  keywords: 'electric kettle',
  dateFrom: '2026-08-01',
  dateTo: '2026-08-20'
});
assert(plannedLanes.some(r => r.tool === 'get_asin_info' && r.arguments.asin === 'B0BNVHR71X'));
assert(plannedLanes.some(r => r.tool === 'get_asin_info' && r.arguments.asin === 'B0GH78L65N'));
assert(!plannedLanes.some(r => r.tool === 'get_multi_asin_keyword_comparison'), '多品线不能做跨类目词对照');
assert(!plannedLanes.some(r => r.tool === 'get_keyword_info'), '多品线不套共享核心词');

const plannedPeers = A.planRequests({
  site: 'US',
  lanes: [{ category: 'Electric Kettles', asin: 'B0BNVHR71X', peers: ['B0GH78L65N'] }],
  dateFrom: '2026-08-01',
  dateTo: '2026-08-20'
});
assert(plannedPeers.some(r => r.tool === 'get_multi_asin_keyword_comparison' && r.arguments.asins.join(',') === 'B0BNVHR71X,B0GH78L65N'));

const port = A.build({
  B0BNVHR71X: Object.assign({
    get_asin_info: { payload: { data: { entities: [{ asin: 'B0BNVHR71X', brand: 'Nueve', title: 'Kettle', price: 40 }] } } }
  }, diaryBucket),
  B0GH78L65N: {
    get_asin_info: { payload: { data: { entities: [{ asin: 'B0GH78L65N', brand: 'Rival', title: 'Other', price: 29 }] } } }
  }
}, {
  site: 'US',
  lanes: [
    { category: 'Electric Kettles', asin: 'B0BNVHR71X' },
    { category: 'Pour Over', asin: 'B0GH78L65N' }
  ],
  dateFrom: '2026-06-15',
  dateTo: '2026-09-12'
});
assert.equal(port.mode, 'portfolio');
assert(port.sections[0].title.indexOf('总览') >= 0);
assert(port.sections[0].lead.indexOf('不跨类目') >= 0);
assert(port.sections.every(s => s.process && s.process[0] && s.process[0].n === 1));
assert(port.sections.some(s => s.id === 'lane-B0BNVHR71X' && s.lead.indexOf('Electric Kettles') >= 0));
assert(port.cards[0].value.indexOf('2') >= 0);
assert.equal((port.sections[0].tiles || []).length, 2);
assert(port.sections.some(s => s.skin === 'lane' && (s.tables || []).some(t => t.headers.indexOf('星级') >= 0)));

const oneLane = A.build({
  B0BNVHR71X: Object.assign({
    get_asin_info: { payload: { data: { entities: [{ asin: 'B0BNVHR71X', brand: 'Nueve', title: 'Kettle', price: 40 }] } } }
  }, diaryBucket)
}, { site: 'US', lanes: [{ category: 'Electric Kettles', asin: 'B0BNVHR71X' }], dateFrom: '2026-06-15', dateTo: '2026-09-12' });
assert(!oneLane.mode);
assert(oneLane.sections[0].title.indexOf('每日定点') >= 0);

const fx = A.previewFixture();
assert.equal(fx.form.lanes.length, 5);
const preview = A.build(fx.evidence, fx.form);
assert.equal(preview.mode, 'portfolio');
assert.equal(preview.sections.length, 6);
assert(preview.sections[0].tables[0].rows.length === 5);
assert.equal((preview.sections[0].tiles || []).length, 5);
assert(preview.sections[0].tiles.some(t => t.signal === '可学习' && t.bsrPath.indexOf('→') >= 0));
assert(preview.cards[0].value.indexOf('5') >= 0);
assert(preview.sections.some(s => s.id === 'lane-B0VIRT0001' && String(s.lead).indexOf('可学习') >= 0));

console.log('PASS watchlist roster, related xiyou/sellersprite plan, snapshot not counted, periodic report, ingest console steps, multi-lane portfolio');

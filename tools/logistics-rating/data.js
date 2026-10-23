// 示例数据：取自设计稿 Import / Main / Compare / Score 四页的 renderVals()。
// 物流商 G 是为演示「最近一周无价格 → 备用」加的示例，它只有第 42 周报价。
window.DATA = (function () {
  var WEEK = 43;
  var WEEK_LABEL = '2026 · 第 43 周（10/19–10/25）';
  var P = ['物流商 A', '物流商 B', '物流商 C', '物流商 D', '物流商 E', '物流商 F', '物流商 G'];
  var F = 5, G = 6;
  // 每家最近一次报价所在的周
  var QUOTE_WEEK = [43, 43, 43, 43, 43, 43, 42];
  var G_LAST = [
    { ch: '美国 · 海运', price: 9.4, week: 42 },
    { ch: '欧洲 · 海运', price: 8.6, week: 42 }
  ];

  // data[i] = [承诺/时效下沿, 上沿, ¥/kg, 准时率]；null = 未开通
  var CH = [
    { key: 'us-air', label: '美国 · 空运', name: '空运', region: 'us', kind: 'air', fit: '急补货、新品首批、高货值小件',
      data: [[8, 11, 38.5, 94], [7, 10, 41, 96], [9, 13, 35.8, 88], null, [8, 12, 37.2, 91], null, null], zf: [1, 1.02, 1.04] },
    { key: 'us-sea', label: '美国 · 海运', name: '海运', region: 'us', kind: 'sea', fit: '常规大货补货、重货低货值',
      data: [[25, 32, 9.8, 90], [22, 28, 11.5, 95], [28, 38, 8.6, 82], [24, 30, 10.2, 93], [26, 34, 9.1, 87], null, null], zf: [1, 1.07, 1.13] },
    { key: 'eu-rail', label: '欧洲 · 铁路', name: '铁路', region: 'eu', kind: 'rail', fit: '比海运快、比空运省，中等货值',
      data: [[28, 35, 16.5, 89], null, [30, 38, 15.2, 84], [26, 32, 17.8, 94], [29, 36, 15.9, 88], [25, 31, 14.6, null], null], zf: [1, 1.08, 1.04, 1.07, 1.09] },
    { key: 'eu-sea', label: '欧洲 · 海运', name: '海运', region: 'eu', kind: 'sea', fit: '大货常规补货、成本优先',
      data: [[35, 45, 8.9, 88], [33, 40, 10.4, 93], [38, 50, 7.9, 80], [34, 42, 9.6, 91], null, null, null], zf: [1, 1.06, 1.03, 1.05, 1.06] },
    { key: 'eu-air', label: '欧洲 · 空运', name: '空运', region: 'eu', kind: 'air', fit: '断货急补、旺季前抢时效',
      data: [[8, 12, 42, 92], [7, 10, 45.5, 95], null, [9, 12, 40.8, 90], [8, 11, 43, 93], [8, 11, 41.5, null], null], zf: [1, 1.03, 1.02, 1.04, 1.05] },
    { key: 'eu-truck', label: '欧洲 · 卡航', name: '卡航', region: 'eu', kind: 'truck', fit: '时效介于铁路与空运之间，多国派送',
      data: [[18, 24, 21.5, 91], null, [20, 26, 19.8, 86], [16, 22, 23, 95], [19, 25, 20.6, 89], [17, 23, 19.9, null], null], zf: [1, 1.12, 1.03, 1.06, 1.1] }
  ];

  var WH = {
    us: [
      { zone: '美西', codes: [['ONT8', '加州 莫雷诺谷'], ['LGB8', '加州 里亚尔托'], ['SBD1', '加州 布卢明顿'], ['LAX9', '加州 丰塔纳']] },
      { zone: '美中', codes: [['FTW1', '得州 达拉斯'], ['MDW2', '伊利诺伊 乔利埃特'], ['IND9', '印第安纳 格林伍德']] },
      { zone: '美东', codes: [['ABE8', '新泽西 弗洛伦斯'], ['AVP1', '宾州 黑兹尔顿'], ['TEB9', '新泽西 罗宾斯维尔']] }
    ],
    eu: [
      { zone: '德国', codes: [['DTM2', '多特蒙德'], ['LEJ1', '莱比锡'], ['FRA7', '法兰克福']] },
      { zone: '英国', codes: [['BHX4', '考文垂'], ['LTN4', '邓斯特布尔']] },
      { zone: '法国', codes: [['ORY4', '巴黎 布雷蒂尼']] },
      { zone: '意大利', codes: [['MXP5', '卡斯泰尔圣乔瓦尼']] },
      { zone: '西班牙', codes: [['MAD4', '马德里']] }
    ]
  };
  var JIT = [0, 0.05, -0.03, 0.04, -0.02, 0.06, -0.04];

  function chByKey(k) { return CH.filter(function (c) { return c.key === k; })[0]; }
  // 设计稿 Import 页的分仓价生成方式（含取模挖空）
  function priceAt(ch, i, zi, wi) {
    var d = ch.data[i];
    if (!d) return null;
    if ((i * 3 + wi + zi) % 11 === 7) return null;
    var j = JIT[(i * 2 + wi * 3 + zi) % JIT.length];
    return Math.round(d[2] * ch.zf[zi] * (1 + j) * 10) / 10;
  }
  function whIndex(region, code) {
    var r = null;
    WH[region].forEach(function (z, zi) { z.codes.forEach(function (c, wi) { if (c[0] === code) r = [zi, wi]; }); });
    return r;
  }

  var NAMES = [
    { raw: 'A物流（深圳）有限公司', file: '物流商A_报价_2026W43.xlsx', rows: 312, cands: [[0, 96]] },
    { raw: '物流商-B', file: '物流商B价格表（10月）.csv', rows: 420, cands: [[1, 93]] },
    { raw: 'C国际货运', file: 'C-D-E 三家汇总报价.xlsx', rows: 186, cands: [[2, 78]] },
    { raw: 'D&E联运', file: 'C-D-E 三家汇总报价.xlsx', rows: 168, cands: [[3, 64], [4, 61]] },
    { raw: 'E 物流 Express', file: 'C-D-E 三家汇总报价.xlsx', rows: 200, cands: [[4, 85], [1, 42]] },
    { raw: 'F速运国际', file: 'F速运_欧线报价.xlsx', rows: 78, cands: [] },
    { raw: 'G物流（宁波）', file: '物流商G_报价_2026W42.xlsx', rows: 96, cands: [[6, 95]], backup: true }
  ];
  var FILES = {
    quote: [
      { name: '物流商A_报价_2026W43.xlsx', names: 'A物流（深圳）有限公司', rows: 312, week: 43 },
      { name: '物流商B价格表（10月）.csv', names: '物流商-B', rows: 420, week: 43 },
      { name: 'C-D-E 三家汇总报价.xlsx', names: '3 个', rows: 554, week: 43 },
      { name: 'F速运_欧线报价.xlsx', names: 'F速运国际', rows: 78, week: 43 },
      { name: '物流商G_报价_2026W42.xlsx', names: 'G物流（宁波）', rows: 96, week: 42 }
    ],
    bill: [
      { name: '10月第3周_对账单_ABCDE.xlsx', names: '5 个', rows: 5, week: 43 }
    ],
    track: [
      { name: '轨迹导出_2026W43.csv', names: '5 个', rows: 5, week: 43 }
    ]
  };
  var MAPS = [
    { raw: '货代/供应商', std: '物流商', conf: '确定' },
    { raw: '运输方式', std: '渠道', conf: '确定' },
    { raw: 'FBA仓', std: '目的仓库', conf: '确定' },
    { raw: '单价(RMB/KG)', std: '单价', conf: '确定' },
    { raw: 'Rate($/lb)', std: '单价', conf: '需换算' },
    { raw: '时效(自然日)', std: '时效', conf: '确定' },
    { raw: '报价日期', std: '生效日期', conf: '确定' },
    { raw: '备注', std: '忽略此列', conf: '建议' }
  ];
  var RULES = [
    { name: '物流商名称归一（上一步确认）', count: 1364, before: 'A物流（深圳）有限公司', after: '物流商 A' },
    { name: '仓库代码标准化', count: 151, before: '安大略-ont 8', after: 'ONT8' },
    { name: '渠道名称归一', count: 96, before: '美森快船', after: '美国 · 海运（快船）' },
    { name: '币种与单位换算', count: 58, before: '$0.95/lb', after: '¥/kg（按当周汇率）' },
    { name: '欧洲仓归国家', count: 26, before: 'Dortmund DTM2', after: 'DTM2 · 德国' },
    { name: '重复报价去重', count: 65, before: '同仓同渠道 3 条', after: '保留最新 1 条' }
  ];
  // decided: 'fix'/'skip' 两个动作；expired 为已定规则（不拿旧价顶上），不再给「仍然使用」
  var ISSUES = [
    { type: '缺目的仓', text: '物流商 C 美国海运有 3 行没填仓库', where: 'C-D-E 汇总.xlsx 第 88–90 行', fixLabel: '补填仓库' },
    { type: '价格异常', text: '物流商 E 欧洲空运 MXP5 单价 ¥96/kg，高于同渠道中位数 2 倍', where: '第 412 行', fixLabel: '标为正确', tbdFix: true },
    { type: '无法识别', text: '仓库写作「洛杉矶仓」，对应多个可能仓库', where: '物流商B价格表 第 57 行', fixLabel: '选择仓库' },
    { type: '非最近一周', text: '物流商 A 卡航 3 行报价生效日期为 9 月，不是第 43 周价格', where: '第 201–203 行', expired: true }
  ];

  // 账单：提货价 / 实际签收价与对应周报价核对
  var BILLS = [
    { no: 'YD43-0012', i: 2, ch: 'us-sea', wh: 'ONT8', date: '10/20', week: 43, pick: 0, sign: 0 },
    { no: 'YD43-0031', i: 3, ch: 'eu-rail', wh: 'DTM2', date: '10/19', week: 43, pick: 0, sign: 0.8 },
    { no: 'YD43-0047', i: 0, ch: 'us-air', wh: 'FTW1', date: '10/21', week: 43, pick: 1.6, sign: 1.6 },
    { no: 'YD43-0058', i: 1, ch: 'us-sea', wh: 'ABE8', date: '10/20', week: 43, pick: 0, sign: 0 },
    { no: 'YD43-0063', i: 4, ch: 'eu-air', wh: 'MXP5', date: '10/22', week: 43, pick: 0, sign: 0 }
  ];
  var TRACKS = [
    { no: 'YD42-0105', i: 0, ch: 'us-sea', wh: 'ONT8', picked: '09/18', signed: '10/19', days: 31 },
    { no: 'YD42-0117', i: 1, ch: 'us-sea', wh: 'LGB8', picked: '09/22', signed: '10/19', days: 27 },
    { no: 'YD42-0129', i: 3, ch: 'eu-rail', wh: 'DTM2', picked: '09/20', signed: '10/20', days: 30 },
    { no: 'YD42-0133', i: 4, ch: 'eu-truck', wh: 'BHX4', picked: '09/29', signed: '10/21', days: 22 },
    { no: '（无运单号）', i: 2, ch: 'us-sea', wh: '—', picked: '09/16', signed: '10/22', days: 36, unmatched: true }
  ];

  var SUR = [6, 4, 9, 5, 7], RESP = [1.5, 0.5, 4, 2, 3], EXC = [2, 1, 4, 2.5, 3], BILL_ERR = [1, 0, 3, 1, 2], COOP = [8.5, 9.4, 6.2, 8.0, 7.1];
  var HIST = [[82, 84, 83, 85, 81, 84, 86], [91, 92, 90, 93, 92, 91, 92], [66, 64, 68, 63, 65, 62, 64], [84, 83, 85, 86, 84, 85, 83], [74, 76, 73, 75, 77, 74, 75]];
  var PRESETS = {
    bal: { name: '均衡', desc: '价格 30% · 时效 40% · 配合 30%', w: [0.3, 0.4, 0.3] },
    cost: { name: '成本优先', desc: '价格 50% · 时效 25% · 配合 25%', w: [0.5, 0.25, 0.25] },
    speed: { name: '时效优先（旺季）', desc: '价格 20% · 时效 55% · 配合 25%', w: [0.2, 0.55, 0.25] }
  };
  var ACT = { S: '优先分配货量，可谈年度价', A: '正常合作', B: '观察，重点跟踪', C: '发整改通知，减少新发货', D: '暂停新单，约谈' };
  var TEMPLATE_COLS = ['物流商', '渠道', '目的仓库', '单价', '时效', '生效日期'];

  return {
    WEEK: WEEK, WEEK_LABEL: WEEK_LABEL, P: P, F: F, G: G, QUOTE_WEEK: QUOTE_WEEK, G_LAST: G_LAST,
    CH: CH, WH: WH, chByKey: chByKey, priceAt: priceAt, whIndex: whIndex,
    NAMES: NAMES, FILES: FILES, MAPS: MAPS, RULES: RULES, ISSUES: ISSUES, BILLS: BILLS, TRACKS: TRACKS,
    SUR: SUR, RESP: RESP, EXC: EXC, BILL_ERR: BILL_ERR, COOP: COOP, HIST: HIST, PRESETS: PRESETS, ACT: ACT,
    TEMPLATE_COLS: TEMPLATE_COLS
  };
})();

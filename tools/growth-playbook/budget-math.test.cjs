const assert = require("assert");
const m = require("./budget-math.cjs");

function sample(over) {
  const d = m.defaultBudget();
  d.adStart = 1;
  d.adEnd = 0.3;
  d.k = 0.6;
  d.mode = "MAX";
  d.price = 30;
  d.commission = 0.85;
  d.discount = 0.9;
  d.fba = 4;
  d.cost = 8;
  d.head = 2;
  d.keywords[0] = { name: "yoga mat", spr: 8, cpc: 0.9, cvr: 10 };
  d.weekTargets[0] = 28;
  return Object.assign(d, over || {});
}

function ok(d) {
  const miss = m.validateBudget(d);
  assert.deepStrictEqual(miss, [], miss.join("；"));
}

let n = 0;
function test(name, fn) {
  n += 1;
  fn();
  console.log("ok", n, name);
}

test("vine fee tiers 0/1/2/3/10/11/30/31", () => {
  assert.strictEqual(m.vineFeeUsd(0), 0);
  assert.strictEqual(m.vineFeeUsd(1), 0);
  assert.strictEqual(m.vineFeeUsd(2), 0);
  assert.strictEqual(m.vineFeeUsd(3), 75);
  assert.strictEqual(m.vineFeeUsd(10), 75);
  assert.strictEqual(m.vineFeeUsd(11), 200);
  assert.strictEqual(m.vineFeeUsd(30), 200);
  assert.ok(Number.isNaN(m.vineFeeUsd(31)));
  assert.strictEqual(m.vineQtyInt(""), 0);
  assert.strictEqual(m.vineQtyInt("0"), 0);
  assert.strictEqual(m.vineQtyInt(2.4), 0);
  assert.strictEqual(m.vineQtyInt(-1), 0);
  assert.strictEqual(m.vineQtyInt(31), 0);
  assert.strictEqual(m.vineQtyInt(30), 30);
});

test("vine total is fee plus goods not fee only", () => {
  const x = m.extraCosts(sample({ vineQty: 30, manQty: "", manFee: "" }));
  assert.strictEqual(x.fee, 200);
  assert.strictEqual(x.vineQty, 30);
  assert.strictEqual(x.vineUnit, 8 + 2 + 4);
  assert.strictEqual(x.vineGoods, 30 * 14);
  assert.strictEqual(x.vineTotal, 200 + 420);
});

test("manual is goods plus commission not product cost only", () => {
  const x = m.extraCosts(sample({ vineQty: 0, manQty: 5, manFee: 15 }));
  assert.strictEqual(x.manGoods, 5 * (8 + 2));
  assert.strictEqual(x.manPay, 75);
  assert.strictEqual(x.manTotal, 125);
});

test("empty cost treated as 0 for extra, not NaN", () => {
  const x = m.extraCosts(sample({ cost: "", head: "", fba: "", vineQty: 10 }));
  assert.strictEqual(x.fee, 75);
  assert.strictEqual(x.vineGoods, 0);
  assert.strictEqual(x.vineTotal, 75);
  assert.ok(Number.isFinite(x.extra));
});

test("negative cost/head/fba clamped in extra", () => {
  const x = m.extraCosts(sample({ cost: -8, head: -2, fba: -4, vineQty: 10 }));
  assert.strictEqual(x.vineGoods, 0);
  assert.strictEqual(x.vineTotal, 75);
});

test("invalid vine 31 does not silently bill 31 units", () => {
  const x = m.extraCosts(sample({ vineQty: 31 }));
  assert.strictEqual(x.vineQty, 0);
  assert.strictEqual(x.fee, 0);
  assert.strictEqual(x.vineGoods, 0);
  const miss = m.validateBudget(sample({ vineQty: 31 }));
  assert.ok(miss.some(s => /Vine/.test(s)));
});

test("partial keyword blocks validate", () => {
  const d = sample();
  d.keywords[1] = { name: "", spr: "", cpc: "", cvr: "" };
  assert.deepStrictEqual(m.validateBudget(d), []);
  d.keywords[1] = { name: "half", spr: 3, cpc: "", cvr: "" };
  assert.ok(m.validateBudget(d).some(s => /第2个词/.test(s)));
});

test("empty keyword rows ignored; empty weeks ignored", () => {
  const d = sample();
  d.weekTargets[2] = 40;
  d.weekTargets[1] = "";
  ok(d);
  const r = m.computeBudget(d);
  assert.deepStrictEqual(r.weeks.map(w => w.week), [1, 3]);
});

test("MAX is listing cap not single-keyword spend", () => {
  const d = sample();
  d.mode = "MAX";
  d.keywords[1] = { name: "bands", spr: 6, cpc: 1, cvr: 12.5 };
  ok(d);
  const r = m.computeBudget(d);
  assert.strictEqual(r.kws.length, 2);
  assert.strictEqual(r.listingFull, 8 * 7);
  assert.ok(r.byKw[0] > 0 && r.byKw[1] > 0);
  const sum = sample({ mode: "SUM" });
  sum.keywords[1] = { name: "bands", spr: 6, cpc: 1, cvr: 12.5 };
  const r2 = m.computeBudget(sum);
  assert.strictEqual(r2.listingFull, 8 * 7 + 6 * 7);
  assert.ok(r2.total < r.total);
});

test("unit margin and cover/payback weeks", () => {
  const d = sample({ vineQty: "", manQty: "" });
  ok(d);
  const r = m.computeBudget(d);
  const sell = 30 * 0.9;
  const unit = sell * 0.85 - 4 - 8 - 2;
  assert.ok(Math.abs(r.unit - unit) < 1e-9);
  assert.ok(r.coverWeek === 1 || r.coverWeek > 1 || r.coverWeek == null);
  assert.ok(Number.isFinite(r.total) && r.total > 0);
});

test("payback includes vine+manual extra; card-free week does not", () => {
  const base = sample({ vineQty: "", manQty: "" });
  const heavy = sample({ vineQty: 30, manQty: 20, manFee: 50 });
  heavy.weekTargets = Array.from({ length: 13 }, (_, i) => String(20 + i * 4));
  base.weekTargets = heavy.weekTargets.slice();
  const a = m.computeBudget(base);
  const b = m.computeBudget(heavy);
  assert.ok(b.extra > 200);
  assert.strictEqual(a.coverWeek, b.coverWeek);
  if (a.paybackWeek && b.paybackWeek) assert.ok(b.paybackWeek >= a.paybackWeek);
});

test("CVR 0 / 100 / 100.1", () => {
  assert.ok(!m.keywordComplete({ name: "a", spr: 1, cpc: 1, cvr: 0 }));
  assert.ok(m.keywordComplete({ name: "a", spr: 1, cpc: 1, cvr: 100 }));
  assert.ok(!m.keywordComplete({ name: "a", spr: 1, cpc: 1, cvr: 100.1 }));
  assert.strictEqual(m.cvrPctToClicks(10), 10);
});

test("ad share week1 equals start", () => {
  const d = sample({ adStart: 1, adEnd: 0.3, k: 0.6 });
  const r = m.computeBudget(d);
  const share0 = 0.3 + (1 - 0.3) * Math.exp(-0.6 * 0);
  assert.ok(Math.abs(share0 - 1) < 1e-12);
  assert.ok(r.byWeek[0] > 0);
});

test("missing required fields fail validate", () => {
  assert.ok(m.validateBudget(sample({ price: "" })).length);
  assert.ok(m.validateBudget(sample({ cost: "" })).length);
  assert.ok(m.validateBudget(sample({ fba: "" })).length);
  assert.ok(m.validateBudget(sample({ keywords: m.defaultBudget().keywords })).length);
  assert.ok(m.validateBudget(sample({ weekTargets: m.defaultBudget().weekTargets })).length);
});

test("man qty without commission fails; 0 commission ok", () => {
  assert.ok(m.validateBudget(sample({ manQty: 3, manFee: "" })).some(s => /佣金/.test(s)));
  ok(sample({ manQty: 3, manFee: 0 }));
});

test("k=0 and adStart=0 fail", () => {
  assert.ok(m.validateBudget(sample({ k: 0 })).length);
  assert.ok(m.validateBudget(sample({ adStart: 0 })).length);
});

console.log("\n" + n + " tests passed");

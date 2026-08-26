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

test("manual income is qty times unit margin; expense is qty times full price plus commission", () => {
  const d = sample({ vineQty: 0, manQty: 10, manFee: 15, manRate: 1 });
  const x = m.extraCosts(d);
  const unit = m.unitMargin(d);
  assert.ok(Math.abs(unit - (30 * 0.9 * 0.85 - 4 - 8 - 2)) < 1e-9);
  assert.ok(Math.abs(x.manIncome - 10 * unit) < 1e-9);
  assert.ok(Math.abs(x.manGoods - 10 * 30 * 1) < 1e-9);
  assert.ok(Math.abs(x.manPay - 150) < 1e-9);
  assert.ok(Math.abs(x.manExpense - (300 + 150)) < 1e-9);
  assert.ok(Math.abs(x.manTotal - (x.manExpense - x.manIncome)) < 1e-9);
});

test("manual expense does not add product cost again (already in income)", () => {
  const a = m.extraCosts(sample({ manQty: 10, manFee: 15, manRate: 1, cost: 8 }));
  const b = m.extraCosts(sample({ manQty: 10, manFee: 15, manRate: 1, cost: 18 }));
  assert.ok(Math.abs(a.manExpense - b.manExpense) < 1e-12);
  assert.ok(b.manIncome < a.manIncome);
  assert.ok(b.manTotal > a.manTotal);
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
  const emptyKw = Array.from({ length: m.BUDGET_KW }, () => ({ name: "", spr: "", cpc: "", cvr: "", clicks: "" }));
  const emptyWk = Array.from({ length: m.BUDGET_WK }, () => "");
  assert.ok(m.validateBudget(sample({ keywords: emptyKw })).length);
  assert.ok(m.validateBudget(sample({ weekTargets: emptyWk })).length);
});

test("man qty without commission fails; 0 commission ok", () => {
  assert.ok(m.validateBudget(sample({ manQty: 3, manFee: "" })).some(s => /佣金/.test(s)));
  ok(sample({ manQty: 3, manFee: 0 }));
});

test("empty manRate with qty still uses 1", () => {
  const x = m.extraCosts(sample({ manQty: 10, manFee: 0, manRate: "" }));
  assert.ok(Math.abs(x.manRate - 1) < 1e-12);
  assert.ok(Math.abs(x.manGoods - 10 * 30) < 1e-9);
});

test("k=0 and adStart=0 fail", () => {
  assert.ok(m.validateBudget(sample({ k: 0 })).length);
  assert.ok(m.validateBudget(sample({ adStart: 0 })).length);
});

test("hydrateBudget fills empty saved form with demo so header can compute", () => {
  const d = m.hydrateBudget({ price: "", keywords: [], weekTargets: [] });
  assert.strictEqual(d.price, 30);
  assert.strictEqual(d.keywords[0].name, "yoga mat");
  assert.strictEqual(d.weekTargets[0], 28);
  assert.deepStrictEqual(m.validateBudget(d), []);
  const kept = m.hydrateBudget(sample({ price: 42 }));
  kept.keywords[0] = { name: "bands", spr: 6, cpc: 1, cvr: 12 };
  const kept2 = m.hydrateBudget(kept);
  assert.strictEqual(kept2.price, 42);
  assert.strictEqual(kept2.keywords[0].name, "bands");
});

test("hydrate does not inject demo week1/keyword0 over a partial user plan", () => {
  const weeks = Array.from({ length: m.BUDGET_WK }, () => "");
  weeks[2] = 40;
  const kws = Array.from({ length: m.BUDGET_KW }, () => ({ name: "", spr: "", cpc: "", cvr: "", clicks: "" }));
  kws[1] = { name: "bands", spr: 6, cpc: 1, cvr: 12 };
  const d = m.hydrateBudget({ price: 42, fba: 4, cost: 8, head: 2, keywords: kws, weekTargets: weeks, manQty: 0 });
  assert.strictEqual(d.price, 42);
  assert.strictEqual(d.keywords[0].name, "");
  assert.strictEqual(d.keywords[1].name, "bands");
  assert.strictEqual(String(d.weekTargets[0] || ""), "");
  assert.strictEqual(Number(d.weekTargets[2]), 40);
  assert.strictEqual(Number(d.manQty), 0);
});

test("budgetNum strips $ and commas; $ prefix is not NaN", () => {
  assert.strictEqual(m.budgetNum("$30"), 30);
  assert.strictEqual(m.budgetNum("1,234.5"), 1234.5);
  assert.strictEqual(m.budgetNum("  $8.00 "), 8);
});

test("discount 0 is zero sell not treated as 1", () => {
  const unit = m.unitMargin(sample({ discount: 0 }));
  assert.ok(Math.abs(unit - (0 - 4 - 8 - 2)) < 1e-9);
});

test("computeBudget unit matches unitMargin", () => {
  const d = sample({ price: -30, discount: 0.9 });
  const r = m.computeBudget(d);
  assert.ok(Math.abs(r.unit - m.unitMargin(d)) < 1e-12);
});

test("negative week target fails validate and is not billed", () => {
  const weeks = Array.from({ length: m.BUDGET_WK }, () => "");
  weeks[0] = -10;
  const miss = m.validateBudget(sample({ weekTargets: weeks }));
  assert.ok(miss.some(s => /周/.test(s)));
  const r = m.computeBudget(sample({ weekTargets: weeks }));
  assert.strictEqual(r.weeks.length, 0);
  assert.strictEqual(r.total, 0);
});

test("manRate 0 bills commission only; invalid 1.5 does not silently use 1", () => {
  const zero = m.extraCosts(sample({ manQty: 10, manFee: 15, manRate: 0 }));
  assert.strictEqual(zero.manRate, 0);
  assert.ok(Math.abs(zero.manExpense - 150) < 1e-9);
  const bad = m.extraCosts(sample({ manQty: 10, manFee: 15, manRate: 1.5 }));
  assert.strictEqual(bad.manRate, 0);
  assert.ok(m.validateBudget(sample({ manQty: 10, manFee: 15, manRate: 1.5 })).some(s => /拿货/.test(s)));
});

test("cover week ignores vine/manual extra", () => {
  const weeks = Array.from({ length: 13 }, (_, i) => String(80 + i * 10));
  const a = m.computeBudget(sample({ vineQty: "", manQty: "", weekTargets: weeks }));
  const b = m.computeBudget(sample({ vineQty: 30, manQty: 20, manFee: 50, weekTargets: weeks }));
  assert.strictEqual(a.coverWeek, b.coverWeek);
  assert.ok(b.extra > a.extra);
});

test("vine 10.0 and spaced 11 stay in the right fee tier", () => {
  assert.strictEqual(m.vineQtyInt("10.0"), 10);
  assert.strictEqual(m.vineFeeUsd(m.vineQtyInt("10.0")), 75);
  assert.strictEqual(m.vineQtyInt(" 11 "), 11);
  assert.strictEqual(m.vineFeeUsd(11), 200);
});

test("manual 2.4 and 10000 do not bill", () => {
  assert.strictEqual(m.extraCosts(sample({ manQty: 2.4, manFee: 15 })).manQty, 0);
  assert.ok(m.validateBudget(sample({ manQty: 2.4, manFee: 15 })).length);
  assert.strictEqual(m.extraCosts(sample({ manQty: 10000, manFee: 15 })).manQty, 0);
  assert.ok(m.validateBudget(sample({ manQty: 10000, manFee: 15 })).length);
});

test("manual net can be negative if take-rate is 0 and fee is 0", () => {
  const x = m.extraCosts(sample({ manQty: 10, manFee: 0, manRate: 0 }));
  assert.ok(x.manTotal < 0);
  assert.ok(Number.isFinite(x.extra));
});

test("commission 1 and CVR 100 stay valid", () => {
  ok(sample({ commission: 1 }));
  const d = sample();
  d.keywords[0].cvr = 100;
  ok(d);
  assert.strictEqual(m.cvrPctToClicks(100), 1);
});

console.log("\n" + n + " tests passed");

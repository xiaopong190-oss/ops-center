(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root === "object" && root) Object.assign(root, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const BUDGET_KW = 8;
  const BUDGET_WK = 13;
  const VINE_MAX = 30;
  const MAN_MAX = 9999;

  function budgetNum(v) {
    const n = parseFloat(String(v == null ? "" : v).replace(/[$,]/g, "").trim());
    return Number.isFinite(n) ? n : NaN;
  }

  function num0(v) {
    const n = budgetNum(v);
    return Number.isFinite(n) ? n : 0;
  }

  function money(n) {
    if (!Number.isFinite(n)) return "—";
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function nearInt(n) {
    return Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-9;
  }

  function cvrPctToClicks(cvrPct) {
    const p = budgetNum(cvrPct);
    if (!(p > 0)) return NaN;
    return 100 / p;
  }

  function clicksToCvrPct(clicks) {
    const c = budgetNum(clicks);
    if (!(c > 0)) return "";
    const n = 100 / c;
    return String(Math.round(n * 100) / 100);
  }

  function keywordComplete(kw) {
    return !!(String((kw && kw.name) || "").trim()
      && budgetNum(kw.spr) > 0
      && budgetNum(kw.cpc) > 0
      && budgetNum(kw.cvr) > 0
      && budgetNum(kw.cvr) <= 100);
  }

  function keywordStarted(kw) {
    return [kw && kw.name, kw && kw.spr, kw && kw.cpc, kw && kw.cvr].some(v => String(v || "").trim() !== "");
  }

  function activeKeywords(d) {
    return (d.keywords || []).filter(keywordComplete);
  }

  function activeWeeks(d) {
    return (d.weekTargets || []).map((v, w) => ({ w, week: w + 1, target: budgetNum(v) })).filter(x => x.target > 0);
  }

  function defaultBudget() {
    const keywords = Array.from({ length: BUDGET_KW }, () => ({ name: "", spr: "", cpc: "", cvr: "", clicks: "" }));
    keywords[0] = { name: "yoga mat", spr: 8, cpc: 0.9, cvr: 10, clicks: "" };
    const weekTargets = Array.from({ length: BUDGET_WK }, () => "");
    weekTargets[0] = 28;
    return {
      n: 0, m: 0,
      adStart: 1, adEnd: 0.3, k: 0.6, mode: "MAX",
      keywords, weekTargets,
      price: 30, commission: 0.85, discount: 0.9, fba: 4, cost: 8, head: 2,
      vineQty: "", manQty: 10, manFee: 15, manRate: 1
    };
  }

  function emptyVal(v) {
    return v == null || String(v).trim() === "";
  }

  function hydrateBudget(saved) {
    const demo = defaultBudget();
    if (!saved || typeof saved !== "object") return demo;
    const d = Object.assign({}, demo, saved);
    ["price", "fba", "cost", "head", "discount", "commission", "adStart", "adEnd", "k", "mode", "manQty", "manFee", "manRate"].forEach((k) => {
      if (emptyVal(d[k])) d[k] = demo[k];
    });
    const blankKw = () => ({ name: "", spr: "", cpc: "", cvr: "", clicks: "" });
    const kwIn = Array.isArray(saved.keywords) ? saved.keywords : [];
    d.keywords = Array.from({ length: BUDGET_KW }, (_, i) => Object.assign(blankKw(), kwIn[i] || {}));
    if (!activeKeywords(d).length) d.keywords = demo.keywords.map((kw) => Object.assign({}, kw));
    const wkIn = Array.isArray(saved.weekTargets) ? saved.weekTargets : [];
    d.weekTargets = Array.from({ length: BUDGET_WK }, (_, i) => (i < wkIn.length ? wkIn[i] : ""));
    if (!activeWeeks(d).length) d.weekTargets = demo.weekTargets.slice();
    return d;
  }

  function productReady(d) {
    return budgetNum(d && d.price) > 0
      && budgetNum(d && d.commission) > 0 && budgetNum(d && d.commission) <= 1
      && budgetNum(d && d.discount) > 0 && budgetNum(d && d.discount) <= 1
      && budgetNum(d && d.fba) >= 0
      && budgetNum(d && d.cost) >= 0
      && budgetNum(d && d.head) >= 0;
  }

  function boundedInt(v, min, max) {
    const n = budgetNum(v);
    if (!Number.isFinite(n) || n <= 0 || !nearInt(n)) return 0;
    const q = Math.round(n);
    if (q < min || q > max) return 0;
    return q;
  }

  function vineQtyInt(v) { return boundedInt(v, 1, VINE_MAX); }
  function manQtyInt(v) { return boundedInt(v, 1, MAN_MAX); }
  function qtyInt(v) { return manQtyInt(v); }

  function vineFeeUsd(qty) {
    if (qty <= 0) return 0;
    if (qty <= 2) return 0;
    if (qty <= 10) return 75;
    if (qty <= 30) return 200;
    return NaN;
  }

  function sellPrice(d) {
    const price = Math.max(0, num0(d && d.price));
    const disc = budgetNum(d && d.discount);
    if (!Number.isFinite(disc)) return price;
    return price * Math.max(0, disc);
  }

  function unitMargin(d) {
    const sell = sellPrice(d);
    const comm = budgetNum(d && d.commission);
    const after = sell * (Number.isFinite(comm) && comm > 0 && comm <= 1 ? comm : 0);
    return after - Math.max(0, num0(d && d.fba)) - Math.max(0, num0(d && d.cost)) - Math.max(0, num0(d && d.head));
  }

  function extraCosts(d) {
    const vineQty = vineQtyInt(d && d.vineQty);
    const manQty = manQtyInt(d && d.manQty);
    const feeRaw = vineFeeUsd(vineQty);
    const fee = Number.isFinite(feeRaw) ? feeRaw : 0;
    const cost = Math.max(0, num0(d && d.cost));
    const head = Math.max(0, num0(d && d.head));
    const fba = Math.max(0, num0(d && d.fba));
    const manFee = Math.max(0, num0(d && d.manFee));
    const rateRaw = budgetNum(d && d.manRate);
    const rateFilled = String((d && d.manRate) || "").trim() !== "";
    let manRate = 0;
    if (Number.isFinite(rateRaw) && rateRaw >= 0 && rateRaw <= 1) manRate = rateRaw;
    else if (manQty && !rateFilled) manRate = 1;
    const vineUnit = cost + head + fba;
    const vineGoods = vineQty * vineUnit;
    const vineTotal = fee + vineGoods;
    const unit = unitMargin(d);
    const manIncome = manQty * unit;
    // 支出不含产品成本：成本已在 unit margin（收入）里扣过，避免算两次。
    const manExpense = manQty * (Math.max(0, num0(d && d.price)) * manRate + manFee);
    const manPay = manQty * manFee;
    const manGoods = manQty * Math.max(0, num0(d && d.price)) * manRate;
    const manTotal = manExpense - manIncome;
    return {
      vineQty, manQty, fee, vineUnit, vineGoods, vineTotal,
      manFee, manPay, manRate, manIncome, manExpense, manGoods, manTotal,
      extra: vineTotal + manTotal
    };
  }

  function validateBudget(d) {
    const miss = [];
    if (!(d.adStart > 0 && d.adStart <= 1)) miss.push("广告占比起始值（0～1，如 1 = 100%）");
    if (!(d.adEnd >= 0 && d.adEnd <= 1)) miss.push("广告占比稳定值（0～1）");
    if (!(d.k > 0)) miss.push("衰减速度 k");
    (d.keywords || []).forEach((kw, i) => {
      if (!keywordStarted(kw) || keywordComplete(kw)) return;
      miss.push("第" + (i + 1) + "个词没填完（名称 / SPR / CPC / CVR）");
    });
    if (!activeKeywords(d).length) miss.push("至少完整填写 1 个关键词（不用凑满 8 个）");
    if (!activeWeeks(d).length) miss.push("至少填写 1 周的目标订单（空着的周不算）");
    (d.weekTargets || []).forEach((v, i) => {
      const raw = String(v == null ? "" : v).trim();
      if (raw === "") return;
      const n = budgetNum(v);
      if (!(n > 0)) miss.push("第" + (i + 1) + "周目标订单须为正数");
    });
    if (!(budgetNum(d.price) > 0)) miss.push("产品单价");
    if (!(budgetNum(d.commission) > 0 && budgetNum(d.commission) <= 1)) miss.push("佣金后比例（如 0.85）");
    if (!(budgetNum(d.discount) > 0 && budgetNum(d.discount) <= 1)) miss.push("折扣率（不打折填 1）");
    if (!(budgetNum(d.fba) >= 0)) miss.push("尾程派送费");
    if (!(budgetNum(d.cost) >= 0)) miss.push("产品成本（采购成本，没有就填 0）");
    if (!(budgetNum(d.head) >= 0)) miss.push("头程（运到 FBA 的单件运费，没有就填 0）");
    const vRaw = String(d.vineQty || "").trim();
    const vq = budgetNum(d.vineQty);
    if (vRaw !== "" && (!(vq >= 0 && vq <= VINE_MAX) || !nearInt(vq))) {
      miss.push("Vine 数量（0～30 的整数；1–2 免费，3–10 为 $75，11–30 为 $200）");
    }
    const mRaw = String(d.manQty || "").trim();
    const mq = budgetNum(d.manQty);
    if (mRaw !== "" && (!(mq >= 0 && mq <= MAN_MAX) || !nearInt(mq))) {
      miss.push("手动测评数量（整数，没有就空着）");
    }
    if (manQtyInt(d.manQty) > 0 && !(budgetNum(d.manFee) >= 0)) {
      miss.push("手动测评佣金（$/件，没有就填 0）");
    }
    const rate = budgetNum(d.manRate);
    if (manQtyInt(d.manQty) > 0 && String(d.manRate || "").trim() !== "" && !(rate >= 0 && rate <= 1)) {
      miss.push("手动拿货折扣（0～1，默认 1 表示按售价全额）");
    }
    if (budgetNum(d.cost) < 0) miss.push("产品成本不能为负");
    if (budgetNum(d.head) < 0) miss.push("头程不能为负");
    if (budgetNum(d.fba) < 0) miss.push("尾程不能为负");
    return miss;
  }

  function computeBudget(d) {
    const kws = activeKeywords(d).map(kw => {
      const spr = budgetNum(kw.spr);
      const cpc = budgetNum(kw.cpc);
      const clicks = cvrPctToClicks(kw.cvr);
      return {
        name: String(kw.name || "").trim(),
        spr, cpc, clicks,
        cvr: budgetNum(kw.cvr),
        full: spr * 7,
        cpa: cpc * clicks
      };
    });
    const weeks = activeWeeks(d);
    const fulls = kws.map(x => x.full);
    const listingFull = d.mode === "SUM" ? fulls.reduce((a, b) => a + b, 0) : Math.max.apply(null, fulls.concat([0]));
    const sell = sellPrice(d);
    const unit = unitMargin(d);
    const unitRate = sell > 0 ? unit / sell : NaN;
    const byWeek = weeks.map(() => 0);
    const byKw = kws.map(() => 0);
    let total = 0;
    kws.forEach((kw, i) => {
      weeks.forEach((slot, wi) => {
        const progress = listingFull ? slot.target / listingFull : 0;
        const orders = kw.full * progress;
        const share = d.adEnd + (d.adStart - d.adEnd) * Math.exp(-d.k * slot.w);
        const spend = (Number.isFinite(orders) && Number.isFinite(share) && Number.isFinite(kw.cpa))
          ? orders * share * kw.cpa : 0;
        byWeek[wi] += spend;
        byKw[i] += spend;
        total += spend;
      });
    });
    let coverWeek = null, paybackWeek = null;
    let cumProfit = 0, cumAd = 0;
    const weekProfit = [];
    const weekNet = [];
    const extra = extraCosts(d).extra;
    const extraSafe = Number.isFinite(extra) ? extra : 0;
    weeks.forEach((slot, wi) => {
      const profit = slot.target * unit;
      weekProfit.push(profit);
      weekNet.push(profit - byWeek[wi]);
      cumProfit += profit;
      cumAd += byWeek[wi];
      if (coverWeek == null && Number.isFinite(profit) && profit >= byWeek[wi]) coverWeek = slot.week;
      if (paybackWeek == null && Number.isFinite(cumProfit) && cumProfit >= cumAd + extraSafe) paybackWeek = slot.week;
    });
    return { kws, listingFull, unit, unitRate, byWeek, byKw, weekProfit, weekNet, total, coverWeek, paybackWeek, weeks, extra: extraSafe };
  }

  return {
    BUDGET_KW, BUDGET_WK, VINE_MAX, MAN_MAX,
    budgetNum, num0, money, nearInt, cvrPctToClicks, clicksToCvrPct,
    keywordComplete, keywordStarted, activeKeywords, activeWeeks,
    defaultBudget, qtyInt, vineQtyInt, manQtyInt, vineFeeUsd,
    extraCosts, validateBudget, computeBudget, unitMargin, sellPrice,
    hydrateBudget, productReady
  };
});

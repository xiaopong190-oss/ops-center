(function () {
  "use strict";
  const DEFAULT_WEIGHTS = { ads: 30, keyword: 25, price: 25, listing: 20 };
  const DEFAULT_THRESHOLDS = { priceMove: 5, surgeSigma: 2.5, persistDays: 14 };
  const FALLBACKS = {
    get_asin_info: ["asin_detail_with_coupon_trend", "keepa_info"],
    get_asin_orders_last_30_days: ["asin_sales_trend"],
    get_asin_traffic: ["traffic_listing_stat"],
    get_asin_bsr_trends: ["keepa_info"],
    get_asin_variations: ["keepa_info", "asin_detail_with_coupon_trend"],
    get_asin_keywords: ["keyword_order"],
    get_asin_info_trends: ["keepa_info", "asin_detail_with_coupon_trend"],
    get_asin_info_change_trends: ["asin_detail_with_coupon_trend"],
    get_asin_ad_change_trends: ["traffic_listing_stat"],
    get_asin_order_trends: ["asin_sales_trend"],
    get_asin_traffic_trends: ["keepa_info"]
  };

  function scalar(v) {
    if (v == null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
    if (typeof v === "object") {
      if (Number.isFinite(v.value)) return v.value;
      if (v.metrics && Number.isFinite(v.metrics.value)) return v.metrics.value;
    }
    return null;
  }
  function text(v) {
    if (v == null) return "";
    if (typeof v === "object") return String(v.value || v.name || v.original || v.label || "").trim();
    return String(v).trim();
  }
  function unwrapPayload(payload) {
    let cur = payload;
    for (let i = 0; i < 6 && cur && typeof cur === "object" && !Array.isArray(cur); i++) {
      if (["list", "items", "rows", "records", "entities", "trends", "salesTrendPoints", "reviewList", "reviews"].some(k => Array.isArray(cur[k]))) return cur;
      const next = cur.data !== undefined ? cur.data : cur.result;
      if (next && typeof next === "object") { cur = next; continue; }
      break;
    }
    return cur;
  }
  function rows(payload) {
    const src = unwrapPayload(payload);
    if (Array.isArray(src) && src.length && typeof src[0] === "object") return src;
    if (!src || typeof src !== "object") return [];
    const keys = ["list", "items", "rows", "records", "entities", "trends", "salesTrendPoints", "reviewList", "reviews", "data", "result"];
    for (let i = 0; i < keys.length; i++) {
      const v = src[keys[i]];
      if (Array.isArray(v) && v.length && typeof v[0] === "object") return v;
      if (v && typeof v === "object" && Array.isArray(v.list)) return v.list;
    }
    return [];
  }
  function first(payload) {
    const src = unwrapPayload(payload);
    const r = rows(src);
    if (r.length) return r[0];
    if (src && typeof src === "object" && !Array.isArray(src)) return src;
    return null;
  }
  function grade(ok, mid) {
    if (ok) return "高";
    if (mid) return "中";
    return "数据不足";
  }
  function ev(tool, retrievedAt, note) {
    return { tool: tool, retrievedAt: retrievedAt || null, note: note || "" };
  }

  function infoView(p) {
    const raw = first(p) || {};
    const nested = raw.asin && typeof raw.asin === "object" ? raw.asin : null;
    const r = raw.asinInfo || raw.productInfo || nested || raw;
    return {
      asin: text(r.asin || r.primaryAsin || raw.asin).toUpperCase(),
      title: text(r.title || r.productTitle || raw.title),
      brand: text(r.brand || r.brandName || raw.brand),
      price: scalar(r.price || r.listingPrice || r.dealPrice || raw.price),
      stars: scalar(r.stars || r.star || r.rating || raw.stars || raw.rating),
      ratings: scalar(r.ratings || r.reviews || r.ratingsCount || raw.ratings),
      category: text(r.category || r.categoryName || r.bsrCategory || raw.category)
    };
  }

  function keepaRoot(payload) {
    const src = unwrapPayload(payload) || {};
    return src.keepa && typeof src.keepa === "object" ? Object.assign({}, src, src.keepa) : src;
  }
  function bsrValue(r) {
    if (!r || typeof r !== "object") return null;
    const direct = scalar(r.bsr != null ? r.bsr : (r.rank != null ? r.rank : (r.totalRank != null ? r.totalRank : (r.categoryRank != null ? r.categoryRank : r.bsrRank))));
    if (direct != null) return direct;
    const list = Array.isArray(r.ranks) ? r.ranks : (Array.isArray(r.values) ? r.values : []);
    for (let i = 0; i < list.length; i++) {
      const n = scalar(list[i] && (list[i].bsr != null ? list[i].bsr : list[i].rank));
      if (n != null) return n;
    }
    return null;
  }
  function bsrSeries(payload) {
    const keepa = keepaPts(payload, ["bsr", "salesRank", "amazonSalesRank", "sales_rank"]);
    if (keepa.length) return keepa.map(p => ({ day: p.day, rank: p.value, cat: "Keepa" }));
    const src = unwrapPayload(payload) || {};
    const tree = Array.isArray(src.categoryTree) ? src.categoryTree : [];
    const trends = Array.isArray(src.trends) ? src.trends : [];
    if (trends.length && trends.some(t => Array.isArray(t.values))) {
      const meta = {};
      tree.forEach(c => {
        const id = String((c && (c.categoryId || c.id)) || "");
        if (id) meta[id] = { name: text(c.name || c.categoryName), root: !!c.root };
      });
      const by = {};
      trends.forEach(t => {
        const day = text(t.date || t.localDate);
        (t.values || []).forEach(v => {
          const id = String((v && (v.categoryId || v.id)) || "bsr");
          const rank = scalar(v && (v.rank != null ? v.rank : v.bsr));
          if (rank == null || !day) return;
          if (!by[id]) by[id] = [];
          by[id].push({ day: day, rank: rank, cat: (meta[id] && meta[id].name) || id });
        });
      });
      const ids = Object.keys(by);
      if (!ids.length) return [];
      ids.forEach(id => by[id].sort((a, b) => a.day.localeCompare(b.day)));
      let best = ids[0];
      ids.forEach(id => {
        const leaf = meta[id] && !meta[id].root;
        const bestLeaf = meta[best] && !meta[best].root;
        if (leaf && !bestLeaf) best = id;
        else if (!!leaf === !!bestLeaf && by[id].length > by[best].length) best = id;
      });
      return by[best];
    }
    return rows(src).map(r => {
      const rank = bsrValue(r);
      const day = text(r.localDate || r.date || r.day);
      return rank != null ? { day: day, rank: rank, cat: text(r.categoryName || r.category) } : null;
    }).filter(Boolean);
  }
  function keepaPts(payload, keys) {
    const root = keepaRoot(payload);
    let arr = [];
    for (let i = 0; i < keys.length; i++) {
      if (Array.isArray(root[keys[i]])) { arr = root[keys[i]]; break; }
    }
    return arr.map(p => {
      if (!p || typeof p !== "object") return null;
      const n = Number(p.timePoint || p.time || p.t || 0);
      const day = n > 0 ? new Date(n < 1e12 ? n * 1000 : n).toISOString().slice(0, 10) : text(p.date || p.day);
      const v = scalar(p.value != null ? p.value : p.v);
      return day && v != null ? { day: day, value: v } : null;
    }).filter(Boolean);
  }
  function salesPts(payload) {
    const src = unwrapPayload(payload) || {};
    const raw = Array.isArray(src.salesTrendPoints) ? src.salesTrendPoints : (Array.isArray(src.items) ? src.items : rows(src));
    return raw.filter(p => p && typeof p === "object").map(p => {
      const child = scalar(p.childUnitSales != null ? p.childUnitSales : p.childUnits);
      const parent = scalar(p.parentUnitSales != null ? p.parentUnitSales : (p.parentUnits != null ? p.parentUnits : p.units));
      return { month: text(p.month || p.date).slice(0, 7), units: child != null ? child : parent };
    }).filter(p => p.month);
  }
  function flattenVariations(payload) {
    const out = [];
    const seen = new Set();
    function push(c) {
      let asin = "";
      if (typeof c === "string") asin = c;
      else if (c && typeof c === "object") asin = text(c.asin || c.childAsin || c.child_asin || c.variationAsin || c.primaryAsin);
      asin = String(asin || "").toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin)) return;
      seen.add(asin);
      out.push({
        asin: asin,
        attr: c && typeof c === "object" ? text(c.color || c.size || c.style) : "",
        price: c && typeof c === "object" ? scalar(c.price) : null
      });
    }
    function walk(v, depth) {
      if (!v || depth > 8) return;
      if (typeof v === "string") {
        String(v).split(/[,;，\s]+/).forEach(part => { if (/^[A-Z0-9]{10}$/i.test(part)) push(part); });
        return;
      }
      if (Array.isArray(v)) { v.forEach(x => walk(x, depth + 1)); return; }
      if (typeof v !== "object") return;
      ["asin", "childAsin", "child_asin", "variationAsin"].forEach(k => {
        if (v[k] != null) push(v[k] && typeof v[k] === "object" ? v[k] : v);
      });
      ["data", "list", "items", "result", "children", "childAsins", "childAsinList", "child_asins", "variations", "variationList", "childList", "asins", "variationCSV"].forEach(k => {
        if (v[k] != null) walk(v[k], depth + 1);
      });
    }
    walk(payload, 0);
    return out;
  }
  function fieldDiff(prev, cur) {
    if (!prev || !cur || typeof prev !== "object" || typeof cur !== "object") return [];
    return ["title", "image", "bullet", "brand", "name"].map(k => {
      const a = text(prev[k]);
      const b = text(cur[k]);
      return a && b && a !== b ? { field: k, before: a, after: b } : null;
    }).filter(Boolean);
  }
  function hasBeforeAfter(r) {
    if (r.previous && r.current && typeof r.previous === "object" && typeof r.current === "object" && !Array.isArray(r.previous)) {
      return fieldDiff(r.previous, r.current).length > 0;
    }
    const before = r.before != null ? r.before : (r.oldValue != null ? r.oldValue : (typeof r.previous !== "object" ? r.previous : r.oldTitle));
    const after = r.after != null ? r.after : (r.newValue != null ? r.newValue : (typeof r.current !== "object" ? r.current : r.newTitle));
    if (before == null && after == null) return false;
    return String(before) !== String(after);
  }
  function isChangeRow(r) {
    if (!r || typeof r !== "object") return false;
    if (!hasBeforeAfter(r)) return false;
    const field = text(r.changeType || r.type || r.field || r.changedField || r.action);
    return !field || /title|image|pic|listing|bullet|aplus|brand|name/.test(field.toLowerCase());
  }
  function adEntries(r) {
    if (!r || typeof r !== "object") return [];
    const added = r.added;
    let camps = [];
    if (Array.isArray(added)) camps = added;
    else if (added && typeof added === "object") {
      Object.keys(added).forEach(k => {
        const v = added[k];
        if (Array.isArray(v)) camps = camps.concat(v);
        else if (v && typeof v === "object") camps.push(v);
      });
    }
    return camps.filter(c => c && typeof c === "object");
  }
  function isAdRow(r) {
    if (!r || typeof r !== "object") return false;
    if (adEntries(r).length) return true;
    if (r.before != null || r.after != null || r.oldValue != null || r.newValue != null) {
      const field = text(r.changeType || r.type || r.field || r.adType || r.position);
      return !field || /ad|sp\b|sbv?|ppc|sponsored/.test(field.toLowerCase());
    }
    const field = text(r.changeType || r.type || r.field || r.adType || r.position);
    return !!field && /ad|sp\b|sbv?|ppc|sponsored/.test(field.toLowerCase());
  }
  function distPrice(pd) {
    if (pd == null) return null;
    if (typeof pd !== "object") return scalar(pd);
    const display = scalar(pd.display);
    if (display != null) return display;
    const deal = scalar(pd.deal);
    if (deal != null) return deal;
    return scalar(pd.origin != null ? pd.origin : pd.prime);
  }
  function dealOn(pd) {
    if (!pd || typeof pd !== "object") return false;
    if (scalar(pd.deal) != null) return true;
    if (Array.isArray(pd.coupon) && pd.coupon.length) return true;
    if (Array.isArray(pd.promotion) && pd.promotion.length) return true;
    return false;
  }
  function priceSeries(payload) {
    const src = unwrapPayload(payload) || {};
    const trends = Array.isArray(src.trends) ? src.trends : [];
    const fromDist = trends.map(r => {
      const day = text(r.date || r.localDate);
      const pd = r.priceDistribution;
      const v = distPrice(pd) != null ? distPrice(pd) : scalar(r.price || r.listingPrice || r.dealPrice);
      return day && v != null ? { day: day, price: v, deal: dealOn(pd) } : null;
    }).filter(Boolean);
    if (fromDist.length) return fromDist;
    const keepa = keepaPts(payload, ["price", "buyBox"]);
    if (keepa.length) return keepa.map(p => ({ day: p.day, price: p.value, deal: false }));
    return rows(payload).map(r => {
      if (r && r.timePoint != null && r.value != null && r.priceDistribution == null && r.price == null) return null;
      const day = text(r.localDate || r.date || r.day);
      const v = scalar(r.price || r.listingPrice || r.dealPrice);
      return day && v != null ? { day: day, price: v, deal: false } : null;
    }).filter(Boolean);
  }
  function listingEdits(payload) {
    const out = [];
    (Array.isArray((unwrapPayload(payload) || {}).trends) ? unwrapPayload(payload).trends : rows(payload)).forEach(r => {
      if (!r || typeof r !== "object") return;
      const day = text(r.date || r.localDate || r.day);
      if (r.previous && r.current && typeof r.previous === "object" && typeof r.current === "object" && !Array.isArray(r.previous)) {
        fieldDiff(r.previous, r.current).forEach(d => {
          out.push({ day: day, changeType: d.field, before: d.before, after: d.after });
        });
        return;
      }
      if (!isChangeRow(r)) return;
      out.push({
        day: day,
        changeType: text(r.changeType || r.type || r.field || "Listing"),
        before: text(r.before || r.oldValue || r.previous || r.oldTitle),
        after: text(r.after || r.newValue || r.current || r.newTitle)
      });
    });
    return out;
  }
  function adAdds(payload) {
    const out = [];
    (Array.isArray((unwrapPayload(payload) || {}).trends) ? unwrapPayload(payload).trends : rows(payload)).forEach(r => {
      adEntries(r).forEach(c => {
        out.push({
          day: text(r.date || r.localDate || r.day),
          changeType: text(c.campaignType || c.adType || c.type || "ad"),
          before: "",
          after: text(c.campaignName || c.name || c.campaignId)
        });
      });
    });
    return out;
  }
  function reviewRows(payload) {
    return rows(payload).filter(r => text(r.reviewContent || r.content || r.review || r.text || r.body || r.comment || r.reviewText || r.reviewBody || r.desc));
  }
  function reviewDay(v) {
    if (v == null || v === "") return "";
    const raw = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return "";
    const ms = n < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
  }
  function stripReviewHtml(s) {
    return String(s || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  function reviewView(r) {
    if (!r || typeof r !== "object") return null;
    const star = scalar(r.star != null ? r.star : (r.stars != null ? r.stars : (r.rating != null ? r.rating : r.starRating)));
    const title = stripReviewHtml(text(r.title || r.reviewTitle || ""));
    const content = stripReviewHtml(text(r.reviewContent || r.content || r.comment || r.body || r.text || r.review || r.reviewText || r.reviewBody || r.desc));
    const blob = (title + " " + content).replace(/\s+/g, " ").trim();
    if (!blob && star == null) return null;
    return {
      star: star,
      title: title,
      content: content,
      text: blob,
      date: reviewDay(r.date || r.reviewDate || r.createdTime),
      verified: r.verified === true,
      vine: r.vine === true || r.free === true || r.experience === true
    };
  }
  const VOC_THEMES = [
    { id: "leak", name: "漏水/密封", kind: "pain", re: /leak|drip|seep|seal|spout drip|漏水|滴水|渗/i, fix: "检查壶嘴密封和壶盖配合" },
    { id: "rust", name: "锈/异味/材质", kind: "pain", re: /rust|metallic|plastic taste|chemical|smell|odor|锈|异味|塑料味|金属味/i, fix: "减少塑料过水，改不锈钢水路" },
    { id: "temp", name: "温控/保温", kind: "pain", re: /temperature|inaccurate|not hot enough|lukewarm|keep warm|hold temp|cool too|温控|不热|保温|温度不准/i, fix: "校准温控或加保温" },
    { id: "spout", name: "壶嘴/水流", kind: "pain", re: /spout|pour over|gooseneck|flow rate|dribble|splash|壶嘴|水流|鹅颈|溅/i, fix: "优化鹅颈出水和止水" },
    { id: "handle", name: "手柄/防烫", kind: "pain", re: /handle|hot to (the )?touch|burn|scald|cool touch|手柄|烫手|防烫/i, fix: "手柄隔热或双层壶壁" },
    { id: "lid", name: "壶盖/开合", kind: "pain", re: /lid|hard to open|pop off|盖子|打不开|盖不严/i, fix: "改进开盖和密封" },
    { id: "noise", name: "噪音", kind: "pain", re: /loud|noisy|noise|buzz|吵|噪音/i, fix: "降低加热噪音" },
    { id: "base", name: "底座/断电", kind: "pain", re: /base|cord|plug|shut.?off|boil dry|auto off|底座|插头|断电|干烧/i, fix: "检查底座接触和自动断电" },
    { id: "durable", name: "耐用/故障", kind: "pain", re: /broke|broken|stopped working|dead|warranty|month later|坏了|不工作|故障|保修/i, fix: "提高加热元件寿命" },
    { id: "ship", name: "物流/包装", kind: "logistics", re: /shipping|packaging|box crushed|damaged in transit|arrived broken|物流|包装|运输破损/i, fix: "包装加固，不当产品功能" },
    { id: "expect", name: "期望不符", kind: "expect", re: /not as (described|pictured)|smaller than|cheap feel|expected|和描述不符|和图片不符|比想象/i, fix: "标题主图对齐实际规格" },
    { id: "speed", name: "煮水速度", kind: "feature", re: /fast boil|quick boil|heats? (up )?fast|rapid|很快|迅速烧开|1500w/i, fix: "作为卖点写进标题和五点" },
    { id: "easy", name: "易用/清洁", kind: "feature", re: /easy to (use|clean)|simple|intuitive|好用|好清洗|易清洁/i, fix: "作为卖点保留" },
    { id: "precise", name: "精准倒水/手冲", kind: "feature", re: /precise pour|control(led)? pour|pour over|gooseneck|手冲|精准倒/i, fix: "鹅颈/手冲能力是差异点" }
  ];
  const VOC_WISH = /wish|would be better|need(s|ed)? a|missing|should have|hope they|if only|没有.{0,8}(保温|温控|滤网)|希望|最好能|建议加/i;
  function vocHits(blob) {
    const t = String(blob || "");
    return VOC_THEMES.filter(th => th.re.test(t));
  }
  function vocLayer(rev, hits) {
    if (!rev) return "未分层";
    if (hits.some(h => h.kind === "logistics")) return "物流/包装";
    if (hits.some(h => h.kind === "expect")) return "期望不符";
    if (rev.star != null && rev.star <= 2 && hits.some(h => h.kind === "pain")) return "产品差评";
    if (rev.star != null && rev.star >= 3 && rev.star <= 4 && hits.some(h => h.kind === "pain")) return "可改进痛点";
    if (VOC_WISH.test(rev.text) && rev.star != null && rev.star <= 4) return "功能机会";
    if (rev.star === 5 && hits.some(h => h.kind === "feature")) return "功能验证";
    if (rev.star === 5) return "好评";
    if (rev.star != null && rev.star <= 2) return "差评待拆";
    return "未分层";
  }
  function vocGrade(n) {
    if (n >= 3) return "样本内较稳";
    if (n === 2) return "待复核";
    return "单条，不能当需求";
  }
  function vocKindLabel(kind) {
    if (kind === "pain") return "痛点";
    if (kind === "feature") return "功能";
    if (kind === "logistics") return "物流";
    return "期望";
  }
  function collectReviews(payload) {
    const map = new Map();
    rows(payload).forEach(row => {
      const r = reviewView(row);
      if (!r) return;
      const key = [r.date, r.star, r.title, r.content].join("|");
      if (!map.has(key)) map.set(key, r);
    });
    return [...map.values()].sort((a, b) => (b.star || 0) - (a.star || 0) || String(b.date).localeCompare(String(a.date)));
  }
  function vocAnalyze(payload, opts) {
    const options = opts || {};
    const split = !!options.split;
    const mode = options.mode || "";
    const annotated = collectReviews(payload).map(r => {
      const hits = vocHits(r.text);
      return Object.assign({}, r, { hits: hits, layer: vocLayer(r, hits) });
    });
    const mid = annotated.filter(r => r.star === 3 || r.star === 4);
    const low = annotated.filter(r => r.star === 1 || r.star === 2);
    const themeCount = new Map();
    annotated.forEach(r => r.hits.forEach(h => {
      if (h.kind === "pain" && r.star === 5) return;
      const cur = themeCount.get(h.id) || { theme: h, n: 0 };
      cur.n += 1;
      themeCount.set(h.id, cur);
    }));
    const themes = [...themeCount.values()].sort((a, b) => b.n - a.n);
    const pains = themes.filter(t => t.theme.kind === "pain");
    const features = themes.filter(t => t.theme.kind === "feature");
    const logistics = themes.filter(t => t.theme.kind === "logistics");
    const listedPain = (pains[0] && pains[0].n >= 2) ? pains[0] : null;
    const topPain = listedPain;
    const weakPains = pains.filter(t => t.n === 1);
    const topFeat = features[0] || null;
    const wishRows = annotated.filter(r => VOC_WISH.test(r.text));
    const vineN = annotated.filter(r => r.vine).length;
    const verifiedN = annotated.filter(r => r.verified).length;
    const layerRows = [
      { name: "可改进痛点", n: annotated.filter(r => r.layer === "可改进痛点").length, use: "3–4★ 且命中产品问题，优先改结构" },
      { name: "产品差评", n: annotated.filter(r => r.layer === "产品差评").length, use: "1–2★ 产品问题，要看是不是个例" },
      { name: "物流/包装", n: annotated.filter(r => r.layer === "物流/包装").length, use: "不当功能机会" },
      { name: "期望不符", n: annotated.filter(r => r.layer === "期望不符").length, use: "改图片和标题，不当结构缺陷" },
      { name: "功能机会", n: annotated.filter(r => r.layer === "功能机会").length, use: "3–4★ 里明确希望补的功能" },
      { name: "功能验证", n: annotated.filter(r => r.layer === "功能验证").length, use: "5★ 里被点名的能力，可写进卖点" }
    ];
    const themeRows = themes.map(t => ({
      id: t.theme.id,
      name: t.theme.name,
      kind: vocKindLabel(t.theme.kind),
      n: t.n,
      grade: vocGrade(t.n),
      fix: t.theme.fix
    }));
    const excerpts = annotated.slice(0, 20).map(r => ({
      star: r.star == null ? "—" : (r.star + "★"),
      layer: r.layer,
      date: r.date || "—",
      hits: r.hits.length ? r.hits.map(h => h.name).join("、") : "未命中词典",
      text: (r.text || "").slice(0, 80)
    }));
    let lead;
    if (!annotated.length) {
      lead = mode === "quick"
        ? "快速模式不拉评论，不能做 VOC。"
        : "评论接口没有返回正文。确认站点是美国站、主 ASIN 填对后重新运行。西柚没有评论接口，这里只用卖家精灵抽样，不要用记录条数当 VOC。";
    } else {
      lead = "样本 " + annotated.length + " 条" + (split ? "，已按 1–2★ / 3–4★ / 5★ 分批" : "，是混页抽样（标准模式一次最多 10 条），不是全量评论") + "。3–4★ " + mid.length + " 条，1–2★ " + low.length + " 条。" +
        (topPain ? ("主痛点是 " + topPain.theme.name + "，样本内 " + topPain.n + " 次，" + vocGrade(topPain.n) + "。") : (weakPains.length ? ("没有可立项的主痛点，只有单条：" + weakPains.map(t => t.theme.name).join("、") + "。") : "没有匹配到产品痛点词。")) +
        (topFeat ? (" 被提到的功能是 " + topFeat.theme.name + " " + topFeat.n + " 次。") : "") +
        (logistics.length ? (" 物流/包装 " + logistics[0].n + " 次，不当功能缺陷。") : "") +
        " 这是抽样不是全量 VOC，Vine/免费评 " + vineN + " 条。";
    }
    const process = [
      { n: 1, title: "抽样", text: "西柚没有评论接口。卖家精灵默认混页，一次最多 10 条。条数不是 Listing 上的全部评分数，也不能当痛点结论。" },
      { n: 2, title: "分层", text: "先读 3–4★：更像可改进。1–2★ 先拆物流/期望/产品。5★ 只用来验证哪些功能被买过的人点名。" },
      { n: 3, title: "主题", text: "用正文匹配漏水、温控、壶嘴、手柄、物流等词典。没匹配到就写未命中，不编造。" },
      { n: 4, title: "证据", text: "同主题 ≥3 次才在本样本里较稳；2 次待复核；1 次不能立项。Vine/免费评降权。" },
      { n: 5, title: "动作", text: "痛点对结构，物流对包装，期望对图片标题。功能机会只有愿望句或 3–4★ 点名缺失时才写。" }
    ];
    const conclusion = annotated.length ? [
      "样本 " + annotated.length + " 条" + (split ? "，已按星级分批。" : "。这是混页抽样，不是全量 VOC，也不能按星级补齐未拉到的页。"),
      topPain ? ("主痛点 " + topPain.theme.name + "，出现 " + topPain.n + " 次，" + vocGrade(topPain.n) + "。建议：" + topPain.theme.fix + "。") : (weakPains.length ? ("没有达到待复核的产品痛点。单条提到：" + weakPains.map(t => t.theme.name + "（" + t.theme.fix + "）").join("；") + "。不能当需求。") : "本样本没有命中产品痛点词典，不能编造漏水或温控问题。"),
      mid.length ? ("3–4★ " + mid.length + " 条是可改进观察窗，优先看这些，不要被 5★ 好评淹没。") : "没有 3–4★ 正文，可改进痛点证据弱。",
      logistics.length ? ("物流/包装 " + logistics[0].n + " 次，这是履约问题，不要写成产品功能缺陷。") : "本样本没有物流主题。",
      (topFeat || wishRows.length)
        ? ("功能侧：" + (topFeat ? (topFeat.theme.name + " " + topFeat.n + " 次，" + topFeat.theme.fix + "。") : "") + (wishRows.length ? ("愿望句 " + wishRows.length + " 条。") : ""))
        : "没有可点名的功能验证或愿望句。",
      "证据等级是抽样。Vine/免费评 " + vineN + " 条，Verified " + verifiedN + " 条。没有退货率和全量评论，不能把单条写成必须改的功能。"
    ] : [
      "没有评论正文，不能做 VOC。",
      mode === "quick" ? "快速模式不拉评论；要痛点分层请改标准或深度后重跑。" : "确认美国站和主 ASIN 后重新运行。西柚没有评论接口，必须有卖家精灵抽样。",
      "不要把“成功 1 步、10 条记录”写成痛点结论。"
    ];
    const analyzed = annotated.length > 0 && (themes.length > 0 || mid.length > 0 || low.length > 0);
    return {
      reviewCount: annotated.length,
      midCount: mid.length,
      lowCount: low.length,
      topPain: topPain ? topPain.theme.name : (weakPains.length ? "单条未立项" : "未命中"),
      topFeat: topFeat ? topFeat.theme.name : (wishRows.length ? "愿望句" : "未命中"),
      lead: lead,
      process: process,
      conclusion: conclusion,
      layers: layerRows,
      themes: themeRows,
      excerpts: excerpts,
      note: annotated.length
        ? "西柚没有评论接口，这里用卖家精灵抽样做痛点分层。条数不是结论，词典未命中也不补零编造。"
        : (mode === "quick" ? "快速模式不拉评论。" : "卖家精灵评论未取到，不能编痛点。"),
      boundary: "分析只用本次已返回的评论正文。没有退货率和全量评论，本页不下令改模或备货。",
      analyzed: analyzed
    };
  }
  function keywordRows(payload) {
    return rows(payload).filter(r => text(r.keyword || r.searchTerm || r.word || r.q));
  }
  function couponDays(payload) {
    const src = unwrapPayload(payload) || {};
    const list = Array.isArray(src.couponTrends) ? src.couponTrends : [];
    return list.filter(x => x && typeof x === "object").length;
  }
  function thinSlot(tool, payload) {
    if (payload == null) return false;
    if (tool === "get_asin_info" || tool === "asin_detail_with_coupon_trend" || tool === "keepa_info" || tool === "competitor_lookup") {
      const info = infoView(payload);
      return !!(info.title || info.brand || info.price != null);
    }
    if (tool === "get_asin_orders_last_30_days" || tool === "asin_sales_trend" || tool === "asin_prediction") {
      const row = first(payload) || {};
      if (scalar(row.orderCount || row.orders || row.value) != null) return true;
      return salesPts(payload).some(p => p.units != null);
    }
    if (tool === "get_asin_traffic" || tool === "traffic_listing_stat") {
      const t = first(payload) || {};
      return scalar(t.organicTrafficScore || t.organic || t.advertisingTrafficScore || t.advertising || t.total) != null;
    }
    if (tool === "get_asin_bsr_trends") return bsrSeries(payload).length > 0;
    if (tool === "get_asin_variations") return flattenVariations(payload).length > 0;
    if (tool === "get_asin_keywords" || tool === "keyword_order") return keywordRows(payload).length > 0;
    if (tool === "get_asin_info_trends") return priceSeries(payload).length > 0;
    if (tool === "get_asin_info_change_trends") return listingEdits(payload).length > 0 || couponDays(payload) > 0;
    if (tool === "get_asin_ad_change_trends") return adAdds(payload).length > 0 || rows(payload).some(isAdRow);
    if (tool === "review") return reviewRows(payload).length > 0;
    return rows(payload).length > 0;
  }

  function packArgs(form, id, extra) {
    const site = (form && form.site) || "US";
    return Object.assign({ marketplace: site, site: site, asin: id, asins: [id] }, extra || {});
  }

  function planRequests(form) {
    const asin = form.targetAsin;
    const range = packArgs(form, asin, { start_date: form.dateFrom, end_date: form.dateTo });
    const basic = packArgs(form, asin);
    const target = [
      { provider: "xiyou", tool: "get_asin_info", arguments: basic },
      { provider: "xiyou", tool: "get_asin_orders_last_30_days", arguments: basic },
      { provider: "xiyou", tool: "get_asin_traffic", arguments: basic },
      { provider: "xiyou", tool: "get_asin_bsr_trends", arguments: range },
      { provider: "xiyou", tool: "get_asin_variations", arguments: basic }
    ];
    if (form.mode !== "quick") {
      target.push(
        { provider: "xiyou", tool: "get_asin_traffic_trends", arguments: range },
        { provider: "xiyou", tool: "get_asin_keywords", arguments: basic },
        { provider: "xiyou", tool: "get_asin_info_trends", arguments: range },
        { provider: "xiyou", tool: "get_asin_info_change_trends", arguments: range },
        { provider: "xiyou", tool: "get_asin_ad_change_trends", arguments: range },
        { provider: "xiyou", tool: "get_asin_order_trends", arguments: range },
        { provider: "sellersprite", tool: "review", arguments: Object.assign({}, basic, { size: 10 }) }
      );
    }
    if (form.mode === "deep") {
      target.push(
        { provider: "sellersprite", tool: "keepa_info", arguments: basic },
        { provider: "sellersprite", tool: "asin_detail_with_coupon_trend", arguments: basic },
        { provider: "sellersprite", tool: "traffic_listing_stat", arguments: basic },
        { provider: "sellersprite", tool: "asin_prediction", arguments: basic }
      );
    }
    (form.comparisonAsins || []).forEach(cmp => {
      const a = packArgs(form, cmp);
      target.push(
        { provider: "xiyou", tool: "get_asin_info", arguments: a },
        { provider: "xiyou", tool: "get_asin_orders_last_30_days", arguments: a },
        { provider: "xiyou", tool: "get_asin_traffic", arguments: a },
        { provider: "xiyou", tool: "get_asin_bsr_trends", arguments: Object.assign({}, a, { start_date: form.dateFrom, end_date: form.dateTo }) }
      );
    });
    return target;
  }

  function reqKey(req) {
    return [req.provider || "", req.tool || "", (req.arguments && req.arguments.asin) || ""].join("|");
  }

  function neededFallbacks(form, evidenceMap) {
    const ev = evidenceMap || {};
    const out = [];
    const seen = new Set();
    function add(tool, args) {
      const req = { provider: "sellersprite", tool: tool, arguments: args };
      const k = reqKey(req);
      if (seen.has(k)) return;
      seen.add(k);
      out.push(req);
    }
    planRequests(form).forEach(req => {
      if (req.provider === "sellersprite") {
        seen.add(reqKey(req));
        return;
      }
      const cmp = req.arguments && req.arguments.asin && req.arguments.asin !== form.targetAsin;
      if (cmp) {
        const bucket = ev["cmp:" + req.arguments.asin] || {};
        const slot = req.tool === "get_asin_info" ? bucket.info
          : req.tool === "get_asin_orders_last_30_days" ? bucket.orders
            : req.tool === "get_asin_traffic" ? bucket.traffic
              : req.tool === "get_asin_bsr_trends" ? bucket.bsr : null;
        if (thinSlot(req.tool, slot)) return;
        if (req.tool === "get_asin_info" || req.tool === "get_asin_bsr_trends") add("keepa_info", req.arguments);
        return;
      }
      if (thinSlot(req.tool, ev[req.tool] && ev[req.tool].payload)) return;
      (FALLBACKS[req.tool] || []).forEach(ss => add(ss, req.arguments));
    });
    return out;
  }

  function fallbackBudget(form) {
    return neededFallbacks(form, {}).length;
  }

  function pickPayload(get, tools) {
    for (let i = 0; i < tools.length; i++) {
      const item = get(tools[i]);
      if (item && thinSlot(tools[i], item.payload)) return { tool: tools[i], item: item, payload: item.payload };
    }
    return { tool: tools[0], item: get(tools[0]) || null, payload: null };
  }

  const TITLE_FEATS = [
    ["鹅颈壶嘴", /gooseneck|pour.?over|鹅颈|手冲/i],
    ["温控", /temperature control|variable temp|preset|温控/i],
    ["不锈钢", /stainless|steel/i],
    ["快速沸腾", /\b(1000|1200|1500)\s*w\b|fast boil|rapid/i],
    ["保温", /keep warm|保温/i],
    ["茶滤", /tea infuser|infuser|茶滤/i]
  ];
  function shortTitle(title, brand) {
    const t = String(title || "").replace(/\s+/g, " ").trim();
    if (!t) return brand || "该 ASIN";
    let first = t.split("|")[0].trim().replace(/\s+for\s+Home\b.*/i, "").trim();
    return first.length > 40 ? first.slice(0, 38) + "…" : first;
  }
  function titleFeats(title) {
    const t = String(title || "");
    const out = TITLE_FEATS.filter(x => x[1].test(t)).map(x => x[0]);
    const w = t.match(/(\d{3,4})\s*W/i);
    if (w && !out.some(x => x.indexOf("W") >= 0)) out.push(w[1] + "W");
    const cap = t.match(/(\d+(?:\.\d+)?)\s*L\b/i);
    if (cap) out.push(cap[1] + "L");
    return out;
  }
  function fmtN(n) {
    if (n == null || !Number.isFinite(Number(n))) return "数据不足";
    const x = Number(n);
    return Math.abs(x) >= 100 ? String(Math.round(x)) : String(Math.round(x * 10) / 10);
  }
  function money(n) { return n == null ? "数据不足" : "$" + fmtN(n); }
  function pct(n) { return n == null ? "数据不足" : (Math.round(n * 1000) / 10) + "%"; }
  function kwView(r) {
    return {
      keyword: text(r.keyword || r.searchTerm || r.word || r.q),
      volume: scalar(r.searchVolume || r.volume || r.aba || r.searches || r.organicTrafficScore),
      rank: scalar(r.organicRank || r.rank || r.totalRank || r.position),
      orders: scalar(r.orderCount || r.purchases || r.units)
    };
  }
  function positionChapter(info) {
    const feats = titleFeats(info.title);
    const short = shortTitle(info.title, info.brand);
    const has = !!(info.title || info.brand || info.price != null);
    const lead = has
      ? ((info.brand || "未标明品牌") + " · " + short + "：卖什么是 " + (feats.length ? feats.slice(0, 3).join("、") : "标题未拆出功能点") + "，售价 " + money(info.price) + "，" + (info.stars == null ? "星级数据不足" : fmtN(info.stars) + " 星") + " / Ratings " + (info.ratings == null ? "数据不足" : fmtN(info.ratings)) + (info.category ? "，类目 " + info.category : "") + "。完整英文标题不进一句话结论。")
      : "商品底稿未取到，不能写定位。确认站点、ASIN 后重跑，不要用空字段编品牌或功能。";
    const conclusion = has ? [
      "卖什么：" + (info.brand || "未标明品牌") + " " + short + (feats.length ? "，功能点 " + feats.join("、") : "，标题词典未命中，不编造功能。") + "。",
      "价格 " + money(info.price) + "，星级 " + (info.stars == null ? "数据不足" : fmtN(info.stars)) + "，Ratings " + (info.ratings == null ? "数据不足" : fmtN(info.ratings)) + "。Ratings 不是评论文本条数。",
      info.category ? ("类目 " + info.category + "。叶子类目以后面 BSR 树为准，这里只作商品底稿。") : "类目数据不足，不把标题词当成类目。",
      "没有上架天数、优惠和卖家身份时不写新品或自营结论。"
    ] : ["没有标题/品牌/价格，不能做商品定位。", "不要把取数失败写成“无品牌低价货”。"];
    return Object.assign({}, info, {
      lead: lead,
      facts: [["品牌", info.brand || "数据不足"], ["短标题", short], ["功能点", feats.join("、") || "未从标题拆出"], ["价格", money(info.price)], ["星级", info.stars], ["Ratings", info.ratings], ["类目", info.category || "数据不足"]],
      process: [
        { n: 1, title: "底稿", text: "先读品牌、短标题、价格、星级、Ratings。完整 Listing 标题只留在底稿，不贴进一句话结论。" },
        { n: 2, title: "功能", text: "用标题词典拆鹅颈、温控、不锈钢、功率、容量。没匹配到就写未拆出，不把整句英文当卖点清单。" },
        { n: 3, title: "价格与门槛", text: "价格只报本次返回值。没有成本就不能判断贵或便宜；星级和 Ratings 是门槛，不是 VOC。" },
        { n: 4, title: "类目", text: "类目字段有就记。真正的叶子排名看 BSR 树，不在这一章用标题猜类目。" },
        { n: 5, title: "边界", text: "缺字段写数据不足。没有上架期、优惠、卖家类型，不下新品或跟卖结论。" }
      ],
      conclusion: conclusion,
      tables: [],
      note: "商品定位只回答卖什么，不回答卖多少或能不能打。",
      boundary: "第三方详情不是后台 Listing。品牌空着就写未标明，不补零。",
      analyzed: has
    });
  }
  function lifeChapter(p) {
    const days = p.bsrRows.length;
    const hist = (p.hist || []).filter(x => x.units != null);
    const suspect = p.orders != null && p.ratings != null && p.ratings > 0 && ((p.orders / p.ratings) > 150 || (p.orders >= 10000 && p.ratings < 200));
    const has = p.orders != null || days > 0;
    const lead = !has
      ? "近 30 天订单和 BSR 日点都没有，不能判断量级或生命周期。"
      : ("量级：" + (p.orders == null ? "近 30 天订单数据不足" : ("近 30 天约 " + fmtN(p.orders) + " 单（模型/第三方口径" + (suspect ? "，和 Ratings 数量级对不上，待核" : "") + ")")) + "。阶段：" + p.lifeText + "。BSR 数值下降=位次靠前，点数不是趋势强度。");
    const conclusion = has ? [
      p.orders == null ? "近 30 天订单数据不足，只能量级未知，不能算利润或备货。" : ("近 30 天推算订单 " + fmtN(p.orders) + "。这不是后台实单。" + (suspect ? " 和 Ratings " + fmtN(p.ratings) + " 对不上，先核字段，不当爆款。" : "")),
      days < 2 ? (days === 1 ? ("BSR 只有 1 个点 #" + fmtN(p.lastBsr) + "，不能比方向。") : "BSR 日点未拆出，不能写增长或衰退。") : ("叶子类目 " + (p.bsrCat || "未标明") + " 从 #" + fmtN(p.firstBsr) + " 到 #" + fmtN(p.lastBsr) + "，判定 " + p.lifecycle + "（窗口内变化超过 30% 才改阶段，否则成熟/走平）。"),
      hist.length >= 2 ? ("月线有 " + hist.length + " 个点，最新 " + hist[hist.length - 1].month + " 约 " + fmtN(hist[hist.length - 1].units) + "。缺月不补零，两点以上才能看爬坡。") : "月订单点不足，不把近 30 天单量写成月趋势。",
      "生命周期看叶子 BSR 方向，不看大类，也不把日波动写成爆发。"
    ] : ["订单和 BSR 都没有，不能写量级或阶段。", "不要用空结果编造成长曲线。"];
    return {
      orders: p.orders,
      bsrPoints: days,
      lastBsr: p.lastBsr,
      bsrCat: p.bsrCat,
      lifecycle: p.lifeText,
      lead: lead,
      facts: [["近30天订单", p.orders == null ? "数据不足" : fmtN(p.orders)], ["BSR 点数", days], ["最近 BSR", p.lastBsr], ["BSR 类目", p.bsrCat || "数据不足"], ["阶段判断", p.lifeText]],
      process: [
        { n: 1, title: "量级", text: "近 30 天只读订单字段。推算单不是后台实单，只看数量级，不算利润。" },
        { n: 2, title: "叶子 BSR", text: "优先叶子类目日点。数值越小位次越靠前。大类排名不代替叶子。" },
        { n: 3, title: "阶段", text: "窗口末名次 < 首名次 ×0.7 记增长，> 首名次 ×1.3 记衰退，中间成熟/走平。少于 2 个点不下阶段。" },
        { n: 4, title: "月线", text: "有月订单再看爬坡。1 个点只报量级。缺月不补零。" },
        { n: 5, title: "边界", text: "和 Ratings 数量级对不上标待核。日点跳动不是爆发拐点。" }
      ],
      conclusion: conclusion,
      tables: hist.length ? [{ title: "月订单点", headers: ["月份", "推算销量"], rows: hist.slice(-8).map(x => [x.month, fmtN(x.units)]), note: "缺月不补零。" }] : [],
      note: "点数不是结论。阶段只比本窗口首末叶子名次。",
      boundary: "没有库存和实单，本页不下令备货。",
      analyzed: has
    };
  }
  function trafficChapter(p) {
    const kws = (p.keywords || []).map(kwView).filter(k => k.keyword);
    const mix = p.adsShare == null ? "流量结构不足" : (p.adsShare >= 0.55 ? "广告依赖偏高" : (p.adsShare <= 0.25 ? "自然为主" : "自然与广告混合"));
    const orgShare = p.adsShare == null ? null : Math.max(0, 1 - p.adsShare);
    const orgOrders = p.orders != null && orgShare != null ? p.orders * orgShare : null;
    const adsOrders = p.orders != null && p.adsShare != null ? p.orders * p.adsShare : null;
    const has = p.org != null || p.ads != null || kws.length > 0;
    const lead = !has
      ? "自然/广告得分和入口词都没有，不能写护城河。"
      : (mix + "。广告占比 " + pct(p.adsShare) + "。入口词样本 " + kws.length + " 个，词条数不是护城河。" + (orgOrders == null ? " 没有订单或占比时，不能把配比换成单量。" : (" 按占比分摊近 30 天推算单：自然约 " + fmtN(orgOrders) + "，广告约 " + fmtN(adsOrders) + "，这不是后台归因。")));
    const conclusion = has ? [
      "结构：" + mix + "。自然得分 " + (p.org == null ? "数据不足" : fmtN(p.org)) + "，广告得分 " + (p.ads == null ? "数据不足" : fmtN(p.ads)) + "。得分不是曝光次数。",
      orgOrders == null ? "缺少订单或占比，不能拆自然/广告单量。" : ("分摊单量：自然约 " + fmtN(orgOrders) + "，广告约 " + fmtN(adsOrders) + "。这是流量占比 × 推算订单，不是亚马逊告诉你每一单从哪来。"),
      kws.length ? ("入口词先看前几个：" + kws.slice(0, 6).map(k => k.keyword).join("、") + "。没有自然位或搜索量时，只当词面样本。") : "还没有关键词样本，不能写护城河。",
      p.adsShare != null && p.adsShare >= 0.55 ? "广告依赖偏高，停投后量级可能回落，不能当自然盘复制。" : "没有花费和 ACOS，只能判断结构，不能判断这套广告能不能赚。"
    ] : ["流量和词都没有，不能写结构或护城河。", "不要把空词表写成蓝海。"];
    return {
      org: p.org,
      ads: p.ads,
      adsShare: p.adsShare,
      keywordCount: kws.length,
      topKeywords: kws.slice(0, 8).map(k => k.keyword),
      lead: lead,
      facts: [["自然流量分", p.org], ["广告流量分", p.ads], ["广告占比", pct(p.adsShare)], ["分摊自然单", orgOrders == null ? "数据不足" : fmtN(orgOrders)], ["分摊广告单", adsOrders == null ? "数据不足" : fmtN(adsOrders)], ["词条数", kws.length]],
      process: [
        { n: 1, title: "配比", text: "用广告流量占比看结构：≥55% 广告依赖偏高，≤25% 自然为主，中间混合。优先用接口给出的占比，没有再用得分相加。" },
        { n: 2, title: "分摊", text: "有近 30 天订单时，按占比拆自然/广告单量。这是分摊不是归因。缺一列就不算。" },
        { n: 3, title: "入口词", text: "列出本次返回的词面。搜索量、自然位有就表上写，没有写数据不足。" },
        { n: 4, title: "护城河", text: "词条数不是护城河。没有词位和转化份额，不能说守得住。" },
        { n: 5, title: "复制", text: "没有花费就不能复制广告。广告占比高只说明依赖，不说明可打。" }
      ],
      conclusion: conclusion,
      tables: kws.length ? [{ title: "入口词样本", headers: ["词", "搜索量/得分", "自然位", "出单"], rows: kws.slice(0, 12).map(k => [k.keyword, k.volume == null ? "数据不足" : fmtN(k.volume), k.rank == null ? "数据不足" : fmtN(k.rank), k.orders == null ? "数据不足" : fmtN(k.orders)]) }] : [],
      note: "词条数不当护城河。流量得分不是曝光。",
      boundary: "没有花费、利润和自身转化率，不下必投结论。",
      analyzed: has
    };
  }
  function surgeChapter(p) {
    const drivers = p.drivers || [];
    const supported = drivers.filter(d => d.support);
    const bsrN = p.bsrRows.length;
    const moved = bsrN >= 2 && (p.lastBsr < p.firstBsr * 0.7 || p.lastBsr > p.firstBsr * 1.3);
    const grew = bsrN >= 2 && p.lastBsr < p.firstBsr * 0.7;
    const fake = supported.length > 0 && bsrN >= 2 && !moved;
    const has = supported.length > 0 || bsrN >= 2;
    const lead = !has
      ? "没有可比 BSR，也没有可核验的动作，不能做爆发归因。"
      : (bsrN < 2 ? "BSR 点不足，只能列出可见动作，不能验证爆发是否真实。" : (grew ? ("窗口内叶子 BSR 从 #" + fmtN(p.firstBsr) + " 到 #" + fmtN(p.lastBsr) + "，达到增长阈值，再对照动作是否同时发生。") : (moved ? ("BSR 明显退后，先当衰退或掉队，不要写成爆发。") : "BSR 走平，未见爆发；下面的驱动只说明窗口里有过动作，不证明它把排名打起来。"))) +
        (p.topDriver ? (" 当前最大可见驱动是 " + p.topDriver.name + "，权重只在本页已支持项里归一。") : " 没有可支持的驱动。");
    const conclusion = has ? [
      bsrN < 2 ? "BSR 不足 2 个点，爆发真实性无法验证。" : (grew ? "BSR 达到增长阈值，只能说窗口内名次变好，还要动作对齐才能归因。" : (moved ? "名次明显退后，不是爆发。" : "未见爆发。有动作不等于打起来了。")),
      supported.length ? ("可见支持：" + supported.map(d => d.name + " " + d.relative + "%").join("、") + "。相对权重只在支持项内分配，不是全网因果。") : "广告、词、价格、Listing 都无法验证，不能编驱动。",
      "词表存在不是关键词爆发；广告记录不是持续在投；一次改价不是价格战。",
      fake ? "动作有、BSR 走平：更像常规维护或伪信号，不要当爆发案例抄。" : "没有花费、库存和广告在投状态，本页不下必跟结论。"
    ] : ["爆发无法验证。", "不要把空驱动矩阵写成“没有竞争”。"];
    return {
      drivers: drivers,
      note: "权重只在本工具内生效，不会写回 8787。有动作不是爆发。",
      lead: lead,
      facts: [["BSR 点数", bsrN], ["阶段", p.lifeText || "数据不足"], ["可见驱动", supported.length ? supported.map(d => d.name).join("、") : "无"], ["最大驱动", p.topDriver ? p.topDriver.name : "未验证"]],
      process: [
        { n: 1, title: "先看排名", text: "至少 2 个叶子 BSR 点。增长要末名次 < 首名次 ×0.7。走平就先否定“爆发”。" },
        { n: 2, title: "对照动作", text: "只把真正改过的广告、价格、Listing、词表记为可支持。日快照和空记录不算。" },
        { n: 3, title: "权重", text: "只在本页已支持的驱动里按配置归一。未支持项相对权重为 0，不补假百分比。" },
        { n: 4, title: "伪信号", text: "有改版或词表但 BSR 没动，记常规维护，不当爆发。" },
        { n: 5, title: "边界", text: "本工具权重不写回调用台。没有花费就不能说哪条广告打起来的。" }
      ],
      conclusion: conclusion,
      tables: [{ title: "驱动矩阵", headers: ["驱动", "支持", "相对权重"], rows: drivers.map(d => [d.name, d.support ? "支持" : "无法验证", (d.relative || 0) + "%"]) }],
      boundary: "权重是本页配置，不是平台归因。",
      analyzed: has
    };
  }
  function actionChapter(p) {
    const moves = p.priceMoves || [];
    const listing = p.listing || [];
    const ads = p.adChanges || [];
    const pts = Array.isArray(p.priceRows) ? p.priceRows : [];
    const nPts = pts.length || Number(p.priceRows) || 0;
    const firstP = pts[0] || null;
    const lastP = pts.length ? pts[pts.length - 1] : null;
    const minP = pts.reduce((m, x) => m == null || x.price < m ? x.price : m, null);
    const maxP = pts.reduce((m, x) => m == null || x.price > m ? x.price : m, null);
    const has = moves.length > 0 || listing.length > 0 || ads.length > 0 || p.promoDays > 0 || nPts > 0;
    const lead = !has
      ? "价格走势、优惠、Listing 真改版和广告 added 都没有拆出来，不能写打法档案。西柚价格在 priceDistribution，改版在 previous/current，广告在 added，不是顶层 price。"
      : ((nPts ? ("价格日点 " + nPts + " 个，从 " + money(firstP && firstP.price) + " 到 " + money(lastP && lastP.price) + "，窗口最低 " + money(minP) + "。") : "价格日点未拆出。") +
        "超过 " + p.threshold + "% 的价格动作 " + moves.length + " 次，Listing 真改版 " + listing.length + " 次（标题/主图有差才算），新广告活动 " + ads.length + " 条，优惠/成交日 " + (p.promoDays || 0) + " 天。日快照条数不是动作次数。");
    const conclusion = has ? [
      nPts ? ("标价看 display。窗口 " + (firstP && firstP.day || "") + " 至 " + (lastP && lastP.day || "") + "，现价 " + money(lastP && lastP.price) + "，最低 " + money(minP) + "，最高 " + money(maxP) + "。") : "价格日点数据不足。",
      moves.length ? ("相邻日 |Δ|≥" + p.threshold + "% 的动作 " + moves.length + " 次。先看这些点，不要把每天快照价当成改价。") : (nPts >= 2 ? "相邻日价格波动都不到 " + p.threshold + "%，记走平，不是没有价格数据。" : "没有可比价格点。"),
      p.promoDays > 0 ? ("优惠/成交价出现 " + p.promoDays + " 天（deal/coupon/promotion）。这是字段出现天数，不是天天满减。") : "本窗口没有 deal/coupon 字段。",
      listing.length ? ("Listing 真改版 " + listing.length + " 次：只比 previous/current 的标题或主图。同一标题连拍 80 多天只算 0 次。") : (nPts ? "标题和主图在窗口内没有可核验差异。" : "改版字段未拆出。"),
      ads.length ? ("新广告活动 " + ads.length + " 条，来自 added，不是 88 天快照。出现过不等于现在还在投，更没有花费。") : "没有 added 里的新广告活动。",
      "反复出现才写打法。1 次改标题或加一条 SP 只进档案，不下必须跟。"
    ] : ["窗口内没有可核验动作，也没有价格日点。", "不要把 88 条日快照写成 88 次改版。"];
    const tables = [];
    if (nPts) tables.push({ title: "价格摘要", headers: ["指标", "结果"], rows: [["日点", String(nPts)], ["首日", (firstP && firstP.day || "—") + " " + money(firstP && firstP.price)], ["末日", (lastP && lastP.day || "—") + " " + money(lastP && lastP.price)], ["最低", money(minP)], ["最高", money(maxP)], ["≥" + p.threshold + "% 动作", String(moves.length)]] });
    if (moves.length) tables.push({ title: "价格动作", headers: ["日期", "价格"], rows: moves.slice(0, 10).map(x => [x.day || "—", money(x.price)]) });
    if (listing.length) tables.push({ title: "Listing 改版", headers: ["日期", "类型", "改前", "改后"], rows: listing.slice(0, 8).map(r => [r.day || "—", text(r.changeType || r.type || r.field || "Listing"), (text(r.before || r.oldValue) || "—").slice(0, 36), (text(r.after || r.newValue) || "—").slice(0, 36)]) });
    if (ads.length) tables.push({ title: "新广告活动", headers: ["日期", "类型", "活动"], rows: ads.slice(0, 10).map(r => [r.day || "—", text(r.changeType || "ad"), (text(r.after) || "—").slice(0, 40)]) });
    return {
      priceMoves: moves.length,
      listingChanges: listing.length,
      newAds: ads.length,
      promoDays: p.promoDays,
      threshold: p.threshold,
      lead: lead,
      facts: [["价格日点", nPts || "数据不足"], ["现价", lastP ? money(lastP.price) : "数据不足"], ["价格动作", moves.length], ["Listing 真改版", listing.length], ["新广告活动", ads.length], ["优惠/成交日", p.promoDays || 0]],
      process: [
        { n: 1, title: "价格", text: "西柚日点在 trends[].priceDistribution.display，不是顶层 price。相邻日 |Δ|≥阈值才记动作。" },
        { n: 2, title: "优惠", text: "deal / coupon / promotion 有值才记优惠日。空数组不当天天有券。" },
        { n: 3, title: "Listing", text: "比 previous 与 current 的 title/image。相同内容连拍不算改版。" },
        { n: 4, title: "广告", text: "只数 added 里新出现的活动。空 added 的日期丢掉。" },
        { n: 5, title: "打法", text: "反复出现才下打法。单次变更只进档案。没有花费不下必投。" }
      ],
      conclusion: conclusion,
      tables: tables,
      note: "日快照条数不是动作次数。Keepa 的 reviews 数组是价格点，不是评论。",
      boundary: "没有花费和库存，不下令跟价或必投。",
      analyzed: has
    };
  }
  function variantChapter(variants, targetAsin) {
    const list = variants || [];
    const priced = list.filter(v => v.price != null).sort((a, b) => a.price - b.price);
    const attrs = list.filter(v => v.attr);
    const spread = priced.length >= 2 ? ((priced[priced.length - 1].price - priced[0].price) / priced[0].price) : null;
    const has = list.length > 0;
    const lead = !has
      ? "没有拆出子体。单 ASIN 或字段对不上都先这样写，不是失败。"
      : ("去重子体 " + list.length + " 个（已去掉目标 ASIN）。记录数不是走量款，也定不了主推——本页没有按子体拆开的词覆盖。");
    const conclusion = has ? [
      "子体 " + list.length + " 个。这是名单，不是销量排序。",
      priced.length ? ("有价子体 " + priced.length + " 个，低 " + money(priced[0].price) + " 到高 " + money(priced[priced.length - 1].price) + (spread != null && spread >= 0.3 ? "，价差超过 30%，先当不同定位而不是同一款换色。" : "。")) : "子体价格数据不足，不能画价格结构。",
      attrs.length ? ("带颜色/尺寸等属性的 " + attrs.length + " 个。属性空着的只当占位 ASIN。") : "属性字段不足，不能按颜色/尺寸分组。",
      "没有子体词覆盖就不能指定主推。不要把名单第一个或最便宜的当成爆款子体。"
    ] : ["没有子体名单。单 ASIN 无变体是结果。", "不要把空变体写成“只有一款很好做”。"];
    return {
      variantCount: list.length,
      lead: lead,
      facts: [["变体数", list.length], ["有价子体", priced.length], ["有属性子体", attrs.length], ["主推候选", "未定（词未按子体拆）"]],
      process: [
        { n: 1, title: "去重", text: "从变体/Keepa/详情里收 children，去掉目标 ASIN 和重复号。字符串 ASIN 也算。" },
        { n: 2, title: "结构", text: "看属性与价格。价差大先当不同定位。缺价不补零。" },
        { n: 3, title: "主推", text: "主推要看子体词覆盖或子体销量。本页没有这两项，主推未定。" },
        { n: 4, title: "占位", text: "无属性、无价格的子体更像占位，不当走量款。" },
        { n: 5, title: "边界", text: "记录数不是走量款数。不能按名单顺序备货。" }
      ],
      conclusion: conclusion,
      tables: list.length ? [{ title: "变体名单", headers: ["子体 ASIN", "属性", "价格"], rows: list.slice(0, 16).map(v => [v.asin, v.attr || "—", v.price == null ? "数据不足" : money(v.price)]) }] : [],
      note: "记录数不是走量款。主推未定。",
      boundary: "没有子体销量和子体词，本页不指定主推。",
      analyzed: has
    };
  }
  function compareChapter(rows, target) {
    const list = rows || [];
    const has = list.length > 0;
    const withOrders = list.filter(r => r.orders != null);
    const top = withOrders.slice().sort((a, b) => b.orders - a.orders)[0] || null;
    const cheap = list.filter(r => r.price != null).slice().sort((a, b) => a.price - b.price)[0] || null;
    const lead = !has
      ? "未添加对比 ASIN。矩阵空着不是“没有竞品”，只是这次没对照。"
      : ("对照 " + list.length + " 个 ASIN。" + (top ? ("推算单最高的是 " + top.asin + " 约 " + fmtN(top.orders) + "，不是后台实单。") : "对比单量数据不足。") + (cheap ? (" 标价最低 " + cheap.asin + " " + money(cheap.price) + "。") : "") + " 缺字段保持数据不足，不补零对齐。");
    const conclusion = has ? [
      "矩阵只比较本次取到的字段。品牌、价格、Ratings、近 30 天单、自然/广告分，缺谁写谁。",
      top ? ("量级上 " + top.asin + " 推算单更高。推算单不能直接当成它比目标更好做。") : "对比订单数据不足，不能比量级。",
      cheap && target && target.price != null && cheap.price != null && cheap.price < target.price * 0.7
        ? (cheap.asin + " 比目标便宜超过 30%，先核是不是规格不同或亏本价，不能无脑跟价。")
        : "价格对照只能看标价，没有成本就不能说谁更有利润。",
      "Ratings 高不是更好做；流量分不是曝光。矩阵不能替代 VOC 和词位。"
    ] : ["没有对比 ASIN，跳过矩阵。", "不要把空表写成蓝海。"];
    const all = (target ? [target] : []).concat(list);
    return {
      rows: list,
      lead: lead,
      facts: [["对照数", list.length], ["目标 ASIN", target && target.asin ? target.asin : "数据不足"], ["单量最高", top ? top.asin : "数据不足"], ["标价最低", cheap ? cheap.asin : "数据不足"]],
      process: [
        { n: 1, title: "对齐", text: "每个对比 ASIN 只填取到的字段。空着写数据不足，不拿目标值去填。" },
        { n: 2, title: "量级", text: "近 30 天推算单只看数量级。没有订单的行不参与谁更大。" },
        { n: 3, title: "价格评分", text: "标价和 Ratings 对照。偏离大先问规格，不先跟价。" },
        { n: 4, title: "流量", text: "自然/广告分只作结构参考，不是曝光或花费。" },
        { n: 5, title: "边界", text: "矩阵不能定主推，也不能替代 VOC。没有成本不下利润判断。" }
      ],
      conclusion: conclusion,
      tables: all.length ? [{ title: "对照表", headers: ["角色", "ASIN", "品牌", "价格", "Ratings", "近30天单", "自然", "广告"], rows: all.map(r => [r.role || "对照", r.asin, r.brand || "—", r.price == null ? "数据不足" : money(r.price), r.ratings == null ? "数据不足" : fmtN(r.ratings), r.orders == null ? "数据不足" : fmtN(r.orders), r.org == null ? "数据不足" : fmtN(r.org), r.ads == null ? "数据不足" : fmtN(r.ads)]) }] : [],
      note: "空单元格是数据不足，不是 0。",
      boundary: "对比 ASIN 各自取数，不共用目标结论。",
      analyzed: has
    };
  }
  function planChapter(p) {
    const copy = p.topDriver
      ? ["先验证「" + p.topDriver.name + "」是否仍在发生，而不是直接复制结果。", p.adsShare != null && p.adsShare >= 0.55 ? "它现在更像广告托着，复制前先能算自己的 ACOS。" : "结构还不明时，先复核对得上的动作，不抄销量结果。"]
      : ["先补齐商品、流量和动作证据，再谈复制。"];
    if (p.voc && p.voc.topPain && p.voc.topPain !== "未命中" && p.voc.topPain !== "单条未立项") copy.push("VOC 主痛点 " + p.voc.topPain + " 已达样本门槛，差异化可以对照，但不能把抽样写成必须改模。");
    else if (p.voc && p.voc.reviewCount) copy.push("VOC 没有可立项痛点。不要按单条差评改结构。");
    const noCopy = [
      "流量得分不是曝光。",
      "第三方订单不是后台订单。",
      "新增广告不等于持续在投。",
      "变体记录数不是走量款。",
      "没有花费/利润/库存时不下必投或必备货结论。",
      "卖家精灵是估算口径，不能冒充西柚或后台。"
    ];
    const plan = [
      "7 天：核对价格与广告是否仍在动，Listing 改版有没有继续。",
      "30 天：看自然/广告占比是否稳态，推算单有没有跟着掉。",
      "90 天：用叶子 BSR 与月订单判断阶段，而不是单日尖峰或 10 条评论。"
    ];
    const lead = p.hasInfo
      ? ("可复制的是仍能核对的动作，不是它现在的销量结果。" + (p.topDriver ? ("优先核验 " + p.topDriver.name + "。") : "当前没有可支持驱动。") + " 不可复制的是第三方口径和没有花费的广告故事。")
      : "底稿都不足，行动计划只能先补数，不能给跟卖清单。";
    return {
      copy: copy,
      noCopy: noCopy,
      plan: plan,
      lead: lead,
      facts: [["最大可见驱动", p.topDriver ? p.topDriver.name : "未验证"], ["流量结构", p.trafficText || "数据不足"], ["生命周期", p.lifeText || "数据不足"]],
      process: [
        { n: 1, title: "已证实", text: "只把前面章节支持过的驱动放进可复制。猜测的机会不进清单。" },
        { n: 2, title: "不可复制", text: "口径、花费、库存、全量 VOC 这些本页没有的，一律划掉。" },
        { n: 3, title: "7 天", text: "先看动作还在不在：价、广告、Listing。" },
        { n: 4, title: "30 天", text: "再看结构稳不稳：自然/广告占比和推算单。" },
        { n: 5, title: "90 天", text: "最后用叶子 BSR 和月线判断阶段。抽样评论和单日尖峰不能当阶段。" }
      ],
      conclusion: [copy[0], "不可复制：花费未知的广告、第三方订单、变体条数、单条 VOC。", "按 7 / 30 / 90 天核验，不在本页下必投或必备货令。"],
      tables: [
        { title: "可核对动作", headers: ["项"], rows: copy.map(x => [x]) },
        { title: "不可复制", headers: ["项"], rows: noCopy.map(x => [x]) },
        { title: "验证计划", headers: ["窗口", "看什么"], rows: [["7 天", plan[0].replace(/^7 天：/, "")], ["30 天", plan[1].replace(/^30 天：/, "")], ["90 天", plan[2].replace(/^90 天：/, "")]] }
      ],
      note: "行动结论只综合本页章节，不写回 8787。",
      boundary: "没有花费、利润、库存，本页不下令开卖或备货。",
      analyzed: !!p.hasInfo
    };
  }

  function build(evidenceMap, form, config) {
    const weights = Object.assign({}, DEFAULT_WEIGHTS, (config && config.weights) || {});
    const th = Object.assign({}, DEFAULT_THRESHOLDS, (config && config.thresholds) || {});
    const get = tool => evidenceMap[tool] || null;
    const infoPick = pickPayload(get, ["get_asin_info", "asin_detail_with_coupon_trend", "keepa_info"]);
    const orderPick = pickPayload(get, ["get_asin_orders_last_30_days", "asin_sales_trend", "asin_prediction"]);
    const trafficPick = pickPayload(get, ["get_asin_traffic", "traffic_listing_stat"]);
    const bsrPick = pickPayload(get, ["get_asin_bsr_trends", "keepa_info"]);
    const varPick = pickPayload(get, ["get_asin_variations", "keepa_info", "asin_detail_with_coupon_trend"]);
    const kwPick = pickPayload(get, ["get_asin_keywords", "keyword_order"]);
    const pricePick = pickPayload(get, ["get_asin_info_trends", "keepa_info", "asin_detail_with_coupon_trend"]);
    const listingPick = pickPayload(get, ["get_asin_info_change_trends", "asin_detail_with_coupon_trend"]);
    const adPick = pickPayload(get, ["get_asin_ad_change_trends", "traffic_listing_stat"]);
    const reviewPick = pickPayload(get, ["review"]);

    const info = infoView(infoPick.payload);
    const orderRow = first(orderPick.payload) || {};
    let orders = scalar(orderRow.orderCount || orderRow.orders || orderRow.value);
    if (orders == null) {
      const hist = salesPts(orderPick.payload).filter(p => p.units != null);
      orders = hist.length ? hist[hist.length - 1].units : null;
    }
    const traffic = first(trafficPick.payload) || {};
    const org = scalar(traffic.organicTrafficScore || traffic.organic);
    const ads = scalar(traffic.advertisingTrafficScore || traffic.advertising);
    const adsRatio = scalar(traffic.advertisingTrafficScoreRatio);
    const bsrRows = bsrSeries(bsrPick.payload);
    const lastBsr = bsrRows.length ? bsrRows[bsrRows.length - 1].rank : null;
    const firstBsr = bsrRows.length ? bsrRows[0].rank : null;
    const bsrCat = bsrRows.length ? bsrRows[bsrRows.length - 1].cat : "";
    const variants = flattenVariations(varPick.payload).filter(v => v.asin !== String(form.targetAsin || "").toUpperCase());
    const keywords = keywordRows(kwPick.payload);
    const trendPay = get("get_asin_info_trends") && get("get_asin_info_trends").payload;
    const keepaPay = get("keepa_info") && get("keepa_info").payload;
    const couponPay = get("asin_detail_with_coupon_trend") && get("asin_detail_with_coupon_trend").payload;
    const changePay = get("get_asin_info_change_trends") && get("get_asin_info_change_trends").payload;
    const adPay = get("get_asin_ad_change_trends") && get("get_asin_ad_change_trends").payload;
    let pricePts = priceSeries(trendPay);
    if (!pricePts.length) pricePts = priceSeries(pricePick.payload);
    if (!pricePts.length) pricePts = priceSeries(keepaPay);
    if (!pricePts.length) pricePts = priceSeries(couponPay);
    const priceRows = pricePts.map(p => ({ localDate: p.day, price: p.price }));
    const listing = listingEdits(changePay).length ? listingEdits(changePay) : listingEdits(listingPick.payload);
    const adChanges = adAdds(adPay).length ? adAdds(adPay) : (adAdds(adPick.payload).length ? adAdds(adPick.payload) : rows(adPick.payload).filter(isAdRow));
    const promoDays = pricePts.filter(p => p.deal).length + couponDays(couponPay) + couponDays(listingPick.payload);
    const voc = vocAnalyze(reviewPick.payload, { mode: form.mode, split: false });

    const hasInfo = !!(info.title || info.brand || info.price !== null);
    const lifecycle = bsrRows.length < 2 ? (bsrRows.length === 1 ? ("仅 #" + lastBsr + "，不能比方向") : "BSR 日点未拆出")
      : (lastBsr < firstBsr * 0.7 ? "增长" : (lastBsr > firstBsr * 1.3 ? "衰退" : "成熟/走平"));
    const lifeText = bsrRows.length < 2 ? lifecycle : (lifecycle + " · " + (bsrCat ? bsrCat + " " : "") + "#" + lastBsr + "（" + firstBsr + "→" + lastBsr + "，" + bsrRows.length + " 天）");
    const adsShare = adsRatio != null ? adsRatio : (org != null && ads != null && (org + ads) > 0 ? ads / (org + ads) : null);
    const priceMoves = [];
    priceRows.map(r => ({ day: text(r.localDate || r.date || r.day), price: scalar(r.price || r.listingPrice || r.dealPrice || r.value) }))
      .filter(x => x.day && x.price != null)
      .sort((a, b) => a.day.localeCompare(b.day))
      .forEach((row, i, arr) => {
        if (!i) return;
        const prev = arr[i - 1].price;
        if (prev && Math.abs(row.price - prev) / prev * 100 >= th.priceMove) priceMoves.push(row);
      });

    const srcNote = tool => tool && !/^get_/.test(tool) ? "卖家精灵补西柚空结果" : "";
    const drivers = [
      { name: "广告", weight: weights.ads, support: adChanges.length > 0, evidence: ev(adPick.tool, adPick.item && adPick.item.retrievedAt, srcNote(adPick.tool)) },
      { name: "关键词", weight: weights.keyword, support: keywords.length > 0, evidence: ev(kwPick.tool, kwPick.item && kwPick.item.retrievedAt, srcNote(kwPick.tool)) },
      { name: "价格", weight: weights.price, support: priceMoves.length > 0 || promoDays > 0, evidence: ev(pricePick.tool, pricePick.item && pricePick.item.retrievedAt, srcNote(pricePick.tool)) },
      { name: "Listing", weight: weights.listing, support: listing.length > 0, evidence: ev(listingPick.tool, listingPick.item && listingPick.item.retrievedAt, srcNote(listingPick.tool)) }
    ];
    const supported = drivers.filter(d => d.support);
    const weightSum = supported.reduce((s, d) => s + d.weight, 0) || 1;
    drivers.forEach(d => { d.relative = d.support ? Math.round(d.weight / weightSum * 100) : 0; });
    const topDriver = supported.slice().sort((a, b) => b.relative - a.relative)[0] || null;

    const headline = {
      what: info.brand || info.title ? ((info.brand || "未标明品牌") + (info.title ? " · " + info.title.slice(0, 48) : "")) : "商品信息不足",
      volume: orders == null ? "近 30 天订单未取到" : ("近 30 天约 " + orders + " 单（模型/第三方口径）"),
      life: lifeText,
      traffic: adsShare == null ? "流量结构不足" : (adsShare >= 0.55 ? "广告依赖偏高" : (adsShare <= 0.25 ? "自然为主" : "自然与广告混合")),
      chance: topDriver ? ("当前最大可见驱动：" + topDriver.name) : "驱动不足，先补动作证据",
      risk: adsShare != null && adsShare >= 0.55 ? "广告停投后量级可能回落，不能当自然盘" : (variants.length > 8 ? "变体多，主推子体不清时容易误判" : "第三方销量不是后台订单")
    };

    const cards = [
      { label: "它卖什么", value: headline.what, grade: grade(hasInfo, info.asin) },
      { label: "量级", value: headline.volume, grade: grade(orders != null, false) },
      { label: "生命周期", value: headline.life, grade: grade(bsrRows.length >= 8, bsrRows.length > 0) },
      { label: "流量依赖", value: headline.traffic, grade: grade(adsShare != null, org != null || ads != null) },
      { label: "最大机会", value: headline.chance, grade: grade(!!topDriver, supported.length > 0) },
      { label: "风险", value: headline.risk, grade: grade(hasInfo || adsShare != null, true) }
    ];

    const compare = (form.comparisonAsins || []).map(asin => {
      const pack = evidenceMap["cmp:" + asin] || {};
      const ci = infoView(pack.info || pack.keepa || pack.detail);
      const co = first(pack.orders) || {};
      const ct = first(pack.traffic) || {};
      return {
        asin: asin,
        brand: ci.brand,
        price: ci.price,
        ratings: ci.ratings,
        orders: scalar(co.orderCount || co.orders),
        org: scalar(ct.organicTrafficScore || ct.organic),
        ads: scalar(ct.advertisingTrafficScore || ct.advertising)
      };
    });
    const s1 = positionChapter(info);
    const s2 = lifeChapter({
      orders: orders,
      bsrRows: bsrRows,
      firstBsr: firstBsr,
      lastBsr: lastBsr,
      bsrCat: bsrCat,
      lifecycle: lifecycle,
      lifeText: lifeText,
      hist: salesPts(orderPick.payload),
      ratings: info.ratings
    });
    const s3 = trafficChapter({ org: org, ads: ads, adsShare: adsShare, keywords: keywords, orders: orders });
    const s4 = surgeChapter({ drivers: drivers, bsrRows: bsrRows, firstBsr: firstBsr, lastBsr: lastBsr, topDriver: topDriver, lifeText: lifeText });
    const s5 = actionChapter({
      priceMoves: priceMoves,
      listing: listing,
      adChanges: adChanges,
      promoDays: promoDays,
      threshold: th.priceMove,
      priceRows: pricePts
    });
    const s6 = variantChapter(variants, form.targetAsin);
    const s8 = compareChapter(compare, {
      role: "目标",
      asin: form.targetAsin,
      brand: info.brand,
      price: info.price,
      ratings: info.ratings,
      orders: orders,
      org: org,
      ads: ads
    });
    const s9 = planChapter({
      hasInfo: hasInfo,
      topDriver: topDriver,
      adsShare: adsShare,
      voc: voc,
      trafficText: headline.traffic,
      lifeText: lifeText
    });

    return {
      generatedAt: Date.now(),
      site: form.site || "US",
      targetAsin: form.targetAsin,
      comparisonAsins: (form.comparisonAsins || []).slice(),
      dateFrom: form.dateFrom,
      dateTo: form.dateTo,
      mode: form.mode,
      weights: weights,
      cards: cards,
      headline: headline,
      sections: [
        { id: "s1", title: "01 商品与定位", kind: "raw", grade: grade(s1.analyzed, !!info.asin), evidence: [ev(infoPick.tool, infoPick.item && infoPick.item.retrievedAt, srcNote(infoPick.tool) || "标题/价格/评分")], body: s1 },
        { id: "s2", title: "02 销量、BSR 与生命周期", kind: "raw", grade: grade(orders != null || bsrRows.length >= 8, bsrRows.length > 0 || orders != null), evidence: [ev(orderPick.tool, orderPick.item && orderPick.item.retrievedAt, srcNote(orderPick.tool)), ev(bsrPick.tool, bsrPick.item && bsrPick.item.retrievedAt, srcNote(bsrPick.tool) || "叶子类目日点，数值下降=位次靠前")], body: s2 },
        { id: "s3", title: "03 流量结构与关键词护城河", kind: "raw", grade: grade(adsShare != null || keywords.length > 0, org != null || ads != null), evidence: [ev(trafficPick.tool, trafficPick.item && trafficPick.item.retrievedAt, srcNote(trafficPick.tool)), ev(kwPick.tool, kwPick.item && kwPick.item.retrievedAt, srcNote(kwPick.tool))], body: s3 },
        { id: "s4", title: "04 爆发真实性与驱动归因", kind: "raw", grade: grade(s4.analyzed && (bsrRows.length >= 2 || supported.length > 0), supported.length > 0), evidence: drivers.map(d => d.evidence), body: s4 },
        { id: "s5", title: "05 价格、促销与 Listing 动作", kind: "raw", grade: grade(s5.analyzed && (pricePts.length >= 8 || listing.length > 0 || adChanges.length > 0 || promoDays > 0), pricePts.length > 0), evidence: [ev("get_asin_info_trends", (get("get_asin_info_trends") || {}).retrievedAt || (pricePick.item && pricePick.item.retrievedAt), "价格读 trends[].priceDistribution.display"), ev("get_asin_info_change_trends", (get("get_asin_info_change_trends") || {}).retrievedAt || (listingPick.item && listingPick.item.retrievedAt), "previous/current 标题或主图有差才记改版"), ev("get_asin_ad_change_trends", (get("get_asin_ad_change_trends") || {}).retrievedAt || (adPick.item && adPick.item.retrievedAt), "added 新广告活动，不是日快照条数")], body: s5 },
        { id: "s6", title: "06 变体矩阵", kind: "raw", grade: grade(s6.analyzed, false), evidence: [ev(varPick.tool, varPick.item && varPick.item.retrievedAt, srcNote(varPick.tool) || "子体去重，记录数不是走量款")], body: s6 },
        { id: "s7", title: "07 VOC 痛点与功能机会", kind: "raw", grade: grade(voc.analyzed, voc.reviewCount > 0), evidence: [ev("review", reviewPick.item && reviewPick.item.retrievedAt, "卖家精灵 · Product Review")], body: voc },
        { id: "s8", title: "08 对比竞品矩阵", kind: "table", grade: grade(s8.analyzed, false), evidence: compare.map(c => ev("get_asin_info", null, c.asin)), body: s8 },
        { id: "s9", title: "09 可复制动作 / 不可复制因素 / 验证计划", kind: "actions", grade: grade(s9.analyzed, false), evidence: [ev("composite", Date.now(), "本工具独立规则")], body: s9 }
      ]
    };
  }

  window.AsinScopeAnalyze = {
    DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
    DEFAULT_THRESHOLDS: DEFAULT_THRESHOLDS,
    FALLBACKS: FALLBACKS,
    build: build,
    planRequests: planRequests,
    neededFallbacks: neededFallbacks,
    fallbackBudget: fallbackBudget,
    thinSlot: thinSlot,
    bsrSeries: bsrSeries,
    flattenVariations: flattenVariations,
    rows: rows,
    infoView: infoView,
    vocAnalyze: vocAnalyze
  };
})();

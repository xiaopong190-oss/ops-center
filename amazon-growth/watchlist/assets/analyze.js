(function () {
  "use strict";
  const FALLBACKS = {
    get_asin_info: ["asin_detail_with_coupon_trend", "keepa_info"],
    get_asin_orders_last_30_days: ["asin_sales_trend"],
    get_asin_traffic: ["traffic_listing_stat", "traffic_source"],
    get_asin_bsr_trends: ["keepa_info"],
    get_asin_variations: ["keepa_info"],
    get_asin_keywords: ["keyword_order"],
    get_asin_info_trends: ["keepa_info", "asin_detail_with_coupon_trend"],
    get_asin_info_change_trends: ["asin_detail_with_coupon_trend"],
    get_asin_ad_change_trends: ["traffic_listing_stat"],
    get_asin_order_trends: ["asin_sales_trend"],
    get_asin_traffic_trends: ["keepa_info"]
  };
  const XIYOU_ASIN = [
    "get_asin_info",
    "get_asin_orders_last_30_days",
    "get_asin_traffic",
    "get_asin_info_trends",
    "get_asin_info_change_trends",
    "get_asin_ad_change_trends",
    "get_asin_bsr_trends",
    "get_asin_traffic_trends",
    "get_asin_keyword_count_trends",
    "get_asin_keywords_daily",
    "get_asin_keywords",
    "get_asin_variations",
    "get_asin_order_trends"
  ];
  const SS_ASIN = [
    "keepa_info",
    "asin_detail_with_coupon_trend",
    "asin_sales_trend",
    "keyword_order",
    "review",
    "asin_competitor",
    "competitor_lookup",
    "traffic_listing_stat",
    "traffic_source"
  ];

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
  const MAX_WINDOW_DAYS = 31;
  const MAX_LANES = 5;
  function lanesFrom(form) {
    const raw = Array.isArray(form && form.lanes) ? form.lanes : [];
    const out = [];
    const seen = new Set();
    raw.forEach(L => {
      const asin = String((L && (L.asin || L.mainAsin)) || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin) || out.length >= MAX_LANES) return;
      seen.add(asin);
      const peers = [];
      const laneCount = raw.filter(x => /^[A-Z0-9]{10}$/.test(String((x && (x.asin || x.mainAsin)) || "").trim().toUpperCase())).length;
      const maxPeers = laneCount >= 2 ? 2 : 7;
      (L && L.peers ? L.peers : []).forEach(p => {
        const a = String(p || "").trim().toUpperCase();
        if (/^[A-Z0-9]{10}$/.test(a) && a !== asin && peers.indexOf(a) < 0 && peers.length < maxPeers) peers.push(a);
      });
      out.push({
        category: String((L && L.category) || "").trim().slice(0, 80),
        asin: asin,
        peers: peers,
        keyword: String((L && L.keyword) || "").trim()
      });
    });
    return out;
  }
  function allLaneAsins(lanes) {
    const list = [];
    (lanes || []).forEach(L => {
      [L.asin].concat(L.peers || []).forEach(a => {
        if (a && list.indexOf(a) < 0) list.push(a);
      });
    });
    return list.slice(0, 8);
  }
  function windowOf(form) {
    const from = String((form && form.dateFrom) || "").slice(0, 10);
    const to = String((form && form.dateTo) || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return { from: from, to: to, days: null, clamped: false, error: "没有起止日期" };
    }
    const a = Date.parse(from + "T00:00:00Z");
    const b = Date.parse(to + "T00:00:00Z");
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { from: from, to: to, days: null, clamped: false, error: "日期无效" };
    if (b < a) return { from: from, to: to, days: null, clamped: false, error: "结束日早于起始日" };
    const days = Math.round((b - a) / 864e5) + 1;
    if (days > MAX_WINDOW_DAYS) {
      const clampedFrom = new Date(b - (MAX_WINDOW_DAYS - 1) * 864e5).toISOString().slice(0, 10);
      return { from: clampedFrom, to: to, days: MAX_WINDOW_DAYS, clamped: true, error: null };
    }
    return { from: from, to: to, days: days, clamped: false, error: null };
  }
  function rosterFrom(form) {
    const list = [];
    function add(v) {
      const a = String(v || "").trim().toUpperCase();
      if (/^[A-Z0-9]{10}$/.test(a) && list.indexOf(a) < 0 && list.length < 8) list.push(a);
    }
    lanesFrom(form).forEach(L => {
      add(L.asin);
      (L.peers || []).forEach(add);
    });
    (form && form.asins ? form.asins : []).forEach(add);
    add(form && form.asin);
    String((form && form.asinsText) || "").split(/[,，;\s]+/).forEach(add);
    return list;
  }
  function keywordsFrom(form) {
    return String((form && form.keywords) || "").split(/[,，;|\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 3);
  }
  function packArgs(form, id, extra) {
    const site = (form && form.site) || "US";
    return Object.assign({ marketplace: site, site: site, asin: id, asins: [id] }, extra || {});
  }
  function reqKey(req) {
    const args = req.arguments || {};
    const id = args.asin || (Array.isArray(args.asins) ? args.asins.join(",") : "") || args.keyword || "";
    return [req.provider || "", req.tool || "", id].join("|");
  }
  function planRequests(form) {
    const lanes = lanesFrom(form);
    const asins = lanes.length ? allLaneAsins(lanes) : rosterFrom(form);
    const kws = lanes.length > 1 ? [] : keywordsFrom(form);
    const out = [];
    const seen = new Set();
    function add(req) {
      const k = reqKey(req);
      if (seen.has(k)) return;
      seen.add(k);
      out.push(req);
    }
    asins.forEach(asin => {
      const basic = packArgs(form, asin);
      const range = packArgs(form, asin, { start_date: form.dateFrom, end_date: form.dateTo });
      XIYOU_ASIN.forEach(tool => add({
        provider: "xiyou",
        tool: tool,
        arguments: /trends|daily|change/.test(tool) || tool === "get_asin_order_trends" ? range : basic
      }));
      SS_ASIN.forEach(tool => add({
        provider: "sellersprite",
        tool: tool,
        arguments: tool === "review" ? Object.assign({}, basic, { size: 10 }) : basic
      }));
      kws.forEach(keyword => {
        add({ provider: "xiyou", tool: "get_asin_keyword_rank_trends", arguments: packArgs(form, asin, { keyword: keyword, start_date: form.dateFrom, end_date: form.dateTo }) });
        add({ provider: "xiyou", tool: "get_asin_keyword_traffic_trends", arguments: packArgs(form, asin, { keyword: keyword, start_date: form.dateFrom, end_date: form.dateTo }) });
      });
    });
    if (lanes.length >= 2) {
      lanes.forEach(L => {
        const group = [L.asin].concat(L.peers || []);
        if (group.length >= 2) {
          add({
            provider: "xiyou",
            tool: "get_multi_asin_keyword_comparison",
            arguments: { marketplace: (form && form.site) || "US", site: (form && form.site) || "US", asins: group }
          });
        }
      });
    } else if (asins.length >= 2) {
      add({
        provider: "xiyou",
        tool: "get_multi_asin_keyword_comparison",
        arguments: { marketplace: (form && form.site) || "US", site: (form && form.site) || "US", asins: asins.slice() }
      });
    }
    kws.forEach(keyword => {
      add({
        provider: "xiyou",
        tool: "get_keyword_info",
        arguments: { marketplace: (form && form.site) || "US", site: (form && form.site) || "US", keyword: keyword }
      });
    });
    return out;
  }
  function payloadOf(slot) {
    if (!slot) return null;
    return slot.payload !== undefined ? slot.payload : slot;
  }
  function thinSlot(tool, payload) {
    if (payload == null) return false;
    if (tool === "get_asin_info" || tool === "asin_detail_with_coupon_trend" || tool === "keepa_info" || tool === "competitor_lookup") {
      const info = infoView(payload);
      return !!(info.title || info.brand || info.price != null);
    }
    if (tool === "get_asin_orders_last_30_days" || tool === "asin_sales_trend") {
      return orderCount(payload) != null;
    }
    if (tool === "get_asin_traffic" || tool === "traffic_listing_stat" || tool === "traffic_source") {
      const t = trafficView(payload);
      return t.org != null || t.ads != null;
    }
    if (tool === "get_asin_bsr_trends") return bsrSeries(payload).length > 0;
    if (tool === "get_asin_keywords" || tool === "keyword_order") return keywordRows(payload).length > 0;
    if (tool === "get_asin_info_trends") return priceSeries(payload).length > 0;
    if (tool === "get_asin_info_change_trends") return listingEdits(payload).length > 0;
    if (tool === "get_asin_ad_change_trends") return adAdds(payload).length > 0;
    if (tool === "review") return reviewRows(payload).length > 0;
    return rows(payload).length > 0;
  }
  function neededFallbacks(form, evidence) {
    const ev = evidence || {};
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
      const asin = req.arguments && req.arguments.asin;
      const bucket = (asin && ev[asin]) || {};
      const slot = bucket[req.tool];
      if (thinSlot(req.tool, payloadOf(slot))) return;
      (FALLBACKS[req.tool] || []).forEach(ss => add(ss, req.arguments));
    });
    return out;
  }
  function fallbackBudget(form) {
    return neededFallbacks(form, {}).length;
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
      ratings: scalar(r.ratings || r.reviews || r.ratingsCount || raw.ratings)
    };
  }
  function trafficView(p) {
    const r = first(p) || {};
    const org = scalar(r.organicTrafficScore || r.organic);
    const ads = scalar(r.advertisingTrafficScore || r.advertising);
    const ratio = scalar(r.advertisingTrafficScoreRatio || r.adsRatio || r.advertisingRatio);
    return {
      org: org,
      ads: ads,
      adsRatio: ratio != null ? ratio : (org != null && ads != null && (org + ads) > 0 ? ads / (org + ads) : null)
    };
  }
  function keepaRoot(payload) {
    const src = unwrapPayload(payload) || {};
    return src.keepa && typeof src.keepa === "object" ? Object.assign({}, src, src.keepa) : src;
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
    const raw = Array.isArray(src.salesTrendPoints) ? src.salesTrendPoints : rows(src);
    return raw.filter(p => p && typeof p === "object").map(p => {
      const child = scalar(p.childUnitSales != null ? p.childUnitSales : p.childUnits);
      const parent = scalar(p.parentUnitSales != null ? p.parentUnitSales : (p.parentUnits != null ? p.parentUnits : p.units));
      return { month: text(p.month || p.date).slice(0, 7), units: child != null ? child : parent };
    }).filter(p => p.month);
  }
  function orderCount(p) {
    const r = first(p) || {};
    const n = scalar(r.orderCount || r.orders || r.value);
    if (n != null) return n;
    const pts = salesPts(p);
    const last = pts.filter(x => x.units != null).pop();
    return last ? last.units : null;
  }
  function distPrice(pd) {
    if (pd == null) return null;
    if (typeof pd !== "object") return scalar(pd);
    return scalar(pd.display != null ? pd.display : (pd.deal != null ? pd.deal : (pd.origin != null ? pd.origin : pd.prime)));
  }
  function dealOn(pd) {
    if (!pd || typeof pd !== "object") return false;
    return scalar(pd.deal) != null || (Array.isArray(pd.coupon) && pd.coupon.length) || (Array.isArray(pd.promotion) && pd.promotion.length);
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
      const day = text(r.localDate || r.date || r.day);
      const v = scalar(r.price || r.listingPrice || r.dealPrice);
      return day && v != null ? { day: day, price: v, deal: false } : null;
    }).filter(Boolean);
  }
  function fieldDiff(prev, cur) {
    if (!prev || !cur || typeof prev !== "object" || typeof cur !== "object") return [];
    return ["title", "image", "bullet", "brand", "name"].map(k => {
      const a = text(prev[k]);
      const b = text(cur[k]);
      return a && b && a !== b ? { field: k, before: a, after: b } : null;
    }).filter(Boolean);
  }
  function listingEdits(payload) {
    const out = [];
    (Array.isArray((unwrapPayload(payload) || {}).trends) ? unwrapPayload(payload).trends : rows(payload)).forEach(r => {
      if (!r || typeof r !== "object") return;
      const day = text(r.date || r.localDate || r.day);
      if (r.previous && r.current && typeof r.previous === "object" && typeof r.current === "object" && !Array.isArray(r.previous)) {
        fieldDiff(r.previous, r.current).forEach(d => out.push({ day: day, changeType: d.field, before: d.before, after: d.after }));
      }
    });
    return out;
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
  function adAdds(payload) {
    const out = [];
    (Array.isArray((unwrapPayload(payload) || {}).trends) ? unwrapPayload(payload).trends : rows(payload)).forEach(r => {
      adEntries(r).forEach(c => out.push({
        day: text(r.date || r.localDate || r.day),
        after: text(c.campaignName || c.name || c.campaignId)
      }));
    });
    return out;
  }
  function bsrSeries(payload) {
    const keepa = keepaPts(payload, ["bsr", "salesRank", "amazonSalesRank"]);
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
    return [];
  }
  function keywordRows(payload) {
    return rows(payload).filter(r => text(r.keyword || r.searchTerm || r.word || r.q || r.term));
  }
  function reviewRows(payload) {
    return rows(payload).filter(r => text(r.reviewContent || r.content || r.review || r.text || r.body || r.comment));
  }
  function pick(bucket, tools) {
    for (let i = 0; i < tools.length; i++) {
      const slot = bucket && bucket[tools[i]];
      if (thinSlot(tools[i], payloadOf(slot))) return payloadOf(slot);
    }
    return payloadOf(bucket && bucket[tools[0]]);
  }
  function priceMoves(pts, thresh) {
    const t = (thresh || 5) / 100;
    let n = 0;
    const sorted = (pts || []).slice().sort((a, b) => a.day.localeCompare(b.day));
    for (let i = 1; i < sorted.length; i++) {
      if (!Math.abs(sorted[i - 1].price)) continue;
      if (Math.abs(sorted[i].price - sorted[i - 1].price) / Math.abs(sorted[i - 1].price) >= t) n += 1;
    }
    return n;
  }
  function playOf(p) {
    if (p.listing && p.ads && p.cuts) return "促销冲量";
    if (p.listing >= 2) return "测 Listing";
    if (p.ads && !p.listing) return "加投";
    if (p.adsRatio != null && p.adsRatio >= 0.7) return "广告托量";
    if (p.adsRatio != null && p.adsRatio <= 0.3 && p.orders != null) return "自然接住";
    if (p.listing || p.ads || p.cuts || p.ups) return "有零散动作";
    return "窗口内安静";
  }
  function fmt(n, d) {
    if (n == null || !Number.isFinite(Number(n))) return "数据不足";
    const x = Number(n);
    return d ? String(Math.round(x * 10) / 10) : String(Math.round(x));
  }
  function grade(ok) { return ok ? "高" : "数据不足"; }
  function evNote(tool, at, note) {
    return { tool: tool, retrievedAt: at || null, note: note || "" };
  }

  function profileOf(asin, bucket, main, thresh) {
    const info = infoView(pick(bucket, ["get_asin_info", "asin_detail_with_coupon_trend", "keepa_info", "competitor_lookup"]) || {});
    const orders = orderCount(pick(bucket, ["get_asin_orders_last_30_days", "asin_sales_trend"]));
    const traf = trafficView(pick(bucket, ["get_asin_traffic", "traffic_listing_stat", "traffic_source"]) || {});
    const prices = priceSeries(pick(bucket, ["get_asin_info_trends", "keepa_info", "asin_detail_with_coupon_trend"]) || {});
    const listing = listingEdits(pick(bucket, ["get_asin_info_change_trends"]) || {});
    const ads = adAdds(pick(bucket, ["get_asin_ad_change_trends"]) || {});
    const bsr = bsrSeries(pick(bucket, ["get_asin_bsr_trends", "keepa_info"]) || {});
    const kws = keywordRows(pick(bucket, ["get_asin_keywords", "keyword_order"]) || {});
    const reviews = reviewRows(pick(bucket, ["review"]) || {});
    const moves = priceMoves(prices, thresh);
    let cuts = 0, ups = 0;
    const sorted = prices.slice().sort((a, b) => a.day.localeCompare(b.day));
    for (let i = 1; i < sorted.length; i++) {
      if (!Math.abs(sorted[i - 1].price)) continue;
      const ch = (sorted[i].price - sorted[i - 1].price) / Math.abs(sorted[i - 1].price);
      if (ch <= -0.05) cuts += 1;
      else if (ch >= 0.05) ups += 1;
    }
    const p = {
      asin: asin,
      main: !!main,
      title: info.title,
      brand: info.brand,
      price: info.price != null ? info.price : (sorted.length ? sorted[sorted.length - 1].price : null),
      stars: info.stars,
      ratings: info.ratings,
      orders: orders,
      adsRatio: traf.adsRatio,
      listing: listing.length,
      ads: ads.length,
      cuts: cuts,
      ups: ups,
      moves: moves,
      dealDays: prices.filter(x => x.deal).length,
      bsr: bsr.length ? bsr[bsr.length - 1].rank : null,
      bsrCat: bsr.length ? bsr[bsr.length - 1].cat : "",
      kwN: kws.length,
      reviewN: reviews.length
    };
    p.play = playOf(p);
    p.action = p.listing + p.ads + p.cuts + p.ups;
    return p;
  }
  function addDays(ymd, n) {
    const t = Date.parse(String(ymd || "").slice(0, 10) + "T00:00:00Z");
    if (!Number.isFinite(t)) return "";
    return new Date(t + n * 864e5).toISOString().slice(0, 10);
  }
  function trendDays(payload) {
    const src = unwrapPayload(payload) || {};
    return Array.isArray(src.trends) ? src.trends : rows(payload);
  }
  function starSeries(payload) {
    const out = [];
    trendDays(payload).forEach(r => {
      if (!r || typeof r !== "object") return;
      const day = text(r.date || r.localDate || r.day).slice(0, 10);
      const stars = scalar(r.stars || r.star || r.rating || (r.ratingInfo && (r.ratingInfo.stars || r.ratingInfo.rating)));
      const ratings = scalar(r.ratings || r.ratingsCount || r.reviewCount || r.reviews || (r.ratingInfo && r.ratingInfo.ratings));
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && (stars != null || ratings != null)) out.push({ day: day, stars: stars, ratings: ratings });
    });
    if (out.length) return out;
    const by = {};
    keepaPts(payload, ["rating", "stars", "star"]).forEach(p => {
      if (!by[p.day]) by[p.day] = { day: p.day, stars: null, ratings: null };
      by[p.day].stars = p.value;
    });
    keepaPts(payload, ["reviews", "reviewCount", "ratings"]).forEach(p => {
      if (!by[p.day]) by[p.day] = { day: p.day, stars: null, ratings: null };
      by[p.day].ratings = p.value;
    });
    return Object.keys(by).sort().map(k => by[k]);
  }
  function couponMarks(payload) {
    const src = unwrapPayload(payload) || {};
    const list = Array.isArray(src.couponTrends) ? src.couponTrends : [];
    return list.map(x => ({
      day: text(x && (x.date || x.day || x.localDate)).slice(0, 10),
      label: text((x && (x.type || x.coupon || x.display)) || "coupon"),
      price: scalar(x && (x.finalPrice != null ? x.finalPrice : x.price))
    })).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.day));
  }
  function diaryOf(bucket) {
    const by = {};
    function row(day) {
      const k = String(day || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return null;
      if (!by[k]) by[k] = { day: k, bsr: null, bsrCat: "", stars: null, ratings: null, price: null, coupon: false, couponLabel: "", listing: [], ads: [], cut: false, up: false, active: [], passive: [] };
      return by[k];
    }
    bsrSeries(pick(bucket, ["get_asin_bsr_trends", "keepa_info"]) || {}).forEach(p => {
      const r = row(p.day);
      if (r) { r.bsr = p.rank; r.bsrCat = p.cat || ""; }
    });
    priceSeries(pick(bucket, ["get_asin_info_trends", "keepa_info", "asin_detail_with_coupon_trend"]) || {}).forEach(p => {
      const r = row(p.day);
      if (r) { r.price = p.price; if (p.deal) r.coupon = true; }
    });
    starSeries(pick(bucket, ["get_asin_info_trends", "keepa_info"]) || {}).forEach(p => {
      const r = row(p.day);
      if (!r) return;
      if (p.stars != null) r.stars = p.stars;
      if (p.ratings != null) r.ratings = p.ratings;
    });
    couponMarks(pick(bucket, ["asin_detail_with_coupon_trend", "get_asin_info_change_trends"]) || {}).forEach(p => {
      const r = row(p.day);
      if (r) { r.coupon = true; r.couponLabel = p.label; }
    });
    listingEdits(pick(bucket, ["get_asin_info_change_trends"]) || {}).forEach(p => {
      const r = row(p.day);
      if (r) r.listing.push(p.changeType || "title");
    });
    adAdds(pick(bucket, ["get_asin_ad_change_trends"]) || {}).forEach(p => {
      const r = row(p.day);
      if (r) r.ads.push(p.after || "ad");
    });
    const days = Object.keys(by).sort().map(k => by[k]);
    for (let i = 1; i < days.length; i++) {
      const prev = days[i - 1];
      const cur = days[i];
      if (prev.price != null && cur.price != null && Math.abs(prev.price)) {
        const ch = (cur.price - prev.price) / Math.abs(prev.price);
        if (ch <= -0.05) cur.cut = true;
        else if (ch >= 0.05) cur.up = true;
      }
      if (cur.listing.length) cur.active.push("改 Listing");
      if (cur.ads.length) cur.active.push("新广告");
      if (cur.cut) cur.active.push("降价");
      if (cur.up) cur.active.push("提价");
      if (cur.coupon && !prev.coupon && !cur.cut) cur.active.push("优惠");
      if (!cur.active.length) {
        if (prev.bsr != null && cur.bsr != null && cur.bsr !== prev.bsr) cur.passive.push("BSR");
        if (prev.stars != null && cur.stars != null && cur.stars !== prev.stars) cur.passive.push("星级");
        if (prev.ratings != null && cur.ratings != null && cur.ratings !== prev.ratings) cur.passive.push("Ratings");
        if (prev.price != null && cur.price != null && cur.price !== prev.price && !cur.cut && !cur.up) cur.passive.push("价格微动");
      }
    }
    return days;
  }
  function laterBsr(days, i, lo, hi) {
    const startDay = days[i] && days[i].day;
    const from = addDays(startDay, lo);
    const to = addDays(startDay, hi);
    if (!from || !to) return null;
    for (let j = i + 1; j < days.length; j++) {
      if (days[j].day < from) continue;
      if (days[j].day > to) break;
      if (days[j].bsr != null) return days[j].bsr;
    }
    return null;
  }
  function bsrJudge(start, later) {
    if (start == null || later == null) return "无法验证";
    if (later < start * 0.9) return "名次改善";
    if (later > start * 1.1) return "名次变差";
    return "名次走平";
  }
  function scoreActions(days) {
    const out = [];
    (days || []).forEach((d, i) => {
      if (!d.active.length) return;
      const later = laterBsr(days, i, 3, 7);
      const verdict = bsrJudge(d.bsr, later);
      const learn = verdict === "名次改善" && d.active.some(a => a === "改 Listing" || a === "降价" || a === "优惠");
      const adsOnly = d.active.length === 1 && d.active[0] === "新广告";
      out.push({
        day: d.day,
        actions: d.active.slice(),
        bsr: d.bsr,
        later: later,
        verdict: verdict,
        learn: learn ? "可学习" : (verdict === "名次改善" && adsOnly ? "可核验名次，不可复制花费" : (verdict === "无法验证" ? "数据不足" : "不学"))
      });
    });
    return out;
  }
  function dailyTerms(payload) {
    const by = {};
    rows(payload).forEach(r => {
      const day = text(r.localDate || r.date || r.day).slice(0, 10);
      const term = text(r.searchTerm || r.keyword || r.term || r.word);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !term) return;
      if (!by[day]) by[day] = new Set();
      by[day].add(term);
    });
    const days = Object.keys(by).sort();
    if (days.length < 2) return { gained: [], lost: [], days: days.length };
    return {
      gained: [...by[days[days.length - 1]]].filter(t => !by[days[0]].has(t)),
      lost: [...by[days[0]]].filter(t => !by[days[days.length - 1]].has(t)),
      days: days.length
    };
  }

  function buildPortfolio(evidence, form, lanes) {
    const ev = evidence || {};
    const winInfo = windowOf(form);
    const span = winInfo.days;
    const horizon = span == null ? "窗口未知" : span >= 30 ? "月度对照" : span >= 7 ? "周期对照" : "当日快照";
    const win = winInfo.from && winInfo.to ? winInfo.from + " ~ " + winInfo.to : "本窗口";
    const asins = allLaneAsins(lanes);
    const views = lanes.map((L, i) => {
      const p = profileOf(L.asin, ev[L.asin] || {}, true, 5);
      const diary = diaryOf(ev[L.asin] || {});
      const scored = scoreActions(diary);
      const learnN = scored.filter(s => s.learn === "可学习").length;
      const activeN = diary.filter(d => d.active.length).length;
      const bsrDays = diary.filter(d => d.bsr != null);
      return {
        i: i + 1,
        category: L.category || ("品线 " + (i + 1)),
        asin: L.asin,
        peers: L.peers || [],
        p: p,
        diary: diary,
        scored: scored,
        learnN: learnN,
        activeN: activeN,
        dayN: diary.length,
        bsrDays: bsrDays,
        peersView: (L.peers || []).map(a => profileOf(a, ev[a] || {}, false, 5))
      };
    });
    const diaryN = views.filter(v => v.dayN > 0).length;
    const actionN = views.filter(v => v.activeN > 0).length;
    const learnSum = views.reduce((n, v) => n + v.learnN, 0);
    function section(id, title, g, body) {
      return Object.assign({ id: id, title: title, grade: g, evidence: [] }, body);
    }
    function lastActive(diary) {
      for (let i = (diary || []).length - 1; i >= 0; i--) {
        if (diary[i].active && diary[i].active.length) return diary[i].day + " " + diary[i].active.join("、");
      }
      return "";
    }
    function signalOf(v) {
      if (v.learnN) return "可学习";
      if (v.activeN) return "有动作";
      return "安静";
    }
    views.forEach(v => {
      v.lastAction = lastActive(v.diary);
      v.signal = signalOf(v);
      v.bsrFrom = v.bsrDays.length ? v.bsrDays[0].bsr : null;
      v.bsrTo = v.bsrDays.length ? v.bsrDays[v.bsrDays.length - 1].bsr : null;
      v.bsrPath = v.bsrFrom == null ? "未提供" : fmt(v.bsrFrom, 0) + " → " + fmt(v.bsrTo, 0);
    });
    const boardRows = views.map(v => [
      v.category,
      v.asin,
      v.p.price == null ? "未提供" : "$" + fmt(v.p.price, 1),
      v.p.orders == null ? "未提供" : fmt(v.p.orders, 0),
      v.bsrPath + (v.p.bsrCat ? " · " + v.p.bsrCat : ""),
      v.lastAction || "无",
      v.signal
    ]);
    const tiles = views.map(v => ({
      id: "lane-" + v.asin,
      category: v.category,
      asin: v.asin,
      brand: v.p.brand || "",
      price: v.p.price == null ? "未提供" : "$" + fmt(v.p.price, 1),
      orders: v.p.orders == null ? "未提供" : fmt(v.p.orders, 0),
      bsrPath: v.bsrPath,
      lastAction: v.lastAction,
      signal: v.signal,
      learnN: v.learnN,
      activeN: v.activeN,
      dayN: v.dayN
    }));
    const lead = win + "（" + horizon + (span != null ? " " + span + " 天" : "") + "）并排看 " + views.length + " 条品线。先扫看板，再点一张卡片看该行完整日记。不跨类目比 BSR 或词覆盖。";
    const laneSections = views.map(v => {
      const diaryRows = v.diary.slice(-40).map(d => [
        d.day,
        d.bsr == null ? "未提供" : fmt(d.bsr, 0) + (d.bsrCat ? " · " + d.bsrCat : ""),
        d.stars == null ? "未提供" : fmt(d.stars, 1),
        d.ratings == null ? "未提供" : fmt(d.ratings, 0),
        d.price == null ? "未提供" : "$" + fmt(d.price, 1),
        d.coupon ? (d.couponLabel || "有") : "无",
        d.active.join("、") || "—",
        d.passive.join("、") || "—"
      ]);
      const actionRows = v.scored.map(s => [s.day, s.actions.join("、"), s.bsr == null ? "未提供" : fmt(s.bsr, 0), s.later == null ? "未提供" : fmt(s.later, 0), s.verdict, s.learn]);
      const learnRows = v.scored.filter(s => s.learn === "可学习").map(s => [s.day, s.actions.join("、"), s.verdict, "动作后 3–7 日叶子 BSR 改善。没有花费，只学动作本身。"]);
      const peerRows = v.peersView.map(p => [p.asin, String(p.listing), String(p.ads), String(p.moves)]);
      return section("lane-" + v.asin, String(v.i).padStart(2, "0") + " " + v.category, grade(v.dayN > 0), {
        lead: v.category + " 的主链接 " + v.asin + "。" +
          (v.dayN ? "定点 " + v.dayN + " 天。" : "还没有日点。") +
          (v.bsrDays.length ? " 叶子 BSR 从 " + fmt(v.bsrDays[0].bsr, 0) + " 到 " + fmt(v.bsrDays[v.bsrDays.length - 1].bsr, 0) + "。" : " BSR 未提供。") +
          (v.activeN ? " 主动动作 " + v.activeN + " 天。" : " 窗口内没有可核验主动动作。") +
          (v.learnN ? " 可学习 " + v.learnN + " 条。" : " 还没有可学习条目。") +
          (v.peers.length ? " 对照 " + v.peers.join("、") + "，只看有没有同类动作。" : ""),
        skin: "lane",
        signal: v.signal,
        facts: [
          ["类目", v.category],
          ["主 ASIN", v.asin],
          ["品牌", v.p.brand || "未提供"],
          ["价格", v.p.price == null ? "未提供" : "$" + fmt(v.p.price, 1)],
          ["近30天订单", v.p.orders == null ? "未提供" : fmt(v.p.orders, 0)],
          ["叶子 BSR", v.bsrPath],
          ["最近动作", v.lastAction || "无"],
          ["对照", v.peers.join("、") || "无"]
        ],
        conclusion: [
          "本行只解释 " + v.asin + "，不拿它的 BSR 去和其他类目比先后。",
          v.learnN ? ("可学习 " + v.learnN + " 条：动作后 3–7 日叶子 BSR 改善。") : "本窗口没有可学习的有效动作。",
          v.peers.length ? ("对照只计数，不并入本行有效动作。") : "本行没有对照 ASIN。"
        ],
        process: [
          { n: 1, title: "定品线", text: "这一行是一个类目的主链接。其他行是别的类目，不进本行日记。" },
          { n: 2, title: "写日点", text: "叶子 BSR、价格、主动/被动与单品线监控同一口径。" },
          { n: 3, title: "评动作", text: "只评估本行主动动作后 3–7 日叶子 BSR。" },
          { n: 4, title: "对照", text: "对照最多 2 个，且必须是同类目。空着就空着。" },
          { n: 5, title: "边界", text: "不跨行比名次、词覆盖或谁更好做。" }
        ],
        tables: [
          diaryRows.length ? { title: "每日定点（最多最近 40 天）", headers: ["日期", "叶子 BSR", "星级", "Ratings", "价格", "优惠", "主动", "被动"], rows: diaryRows, note: "口径与单品线监控相同。日快照不是改版。" } : null,
          actionRows.length ? { title: "动作 → 3–7 日 BSR", headers: ["动作日", "主动动作", "当日 BSR", "3–7 日 BSR", "判断", "学习"], rows: actionRows, note: "名次改善仍要人工看库存和 Deal。" } : null,
          learnRows.length ? { title: "可学习", headers: ["日期", "动作", "判断", "怎么用"], rows: learnRows, note: "只学动作，不下令开卖。" } : null,
          peerRows.length ? { title: "同类目对照", headers: ["ASIN", "真改版", "新广告", "≥5% 变价"], rows: peerRows, note: "条数不是谁赢。" } : null
        ].filter(Boolean),
        note: "本行是品线日记，不是完整竞品九章。",
        boundary: "接口没抓到的当天动作，本行当未提供，不编造。"
      });
    });
    return {
      generatedAt: Date.now(),
      mode: "portfolio",
      site: (form && form.site) || "US",
      dateFrom: winInfo.from || form.dateFrom,
      dateTo: winInfo.to || form.dateTo,
      asins: asins,
      lanes: views.map(v => ({ category: v.category, asin: v.asin, peers: v.peers.slice() })),
      failed: ev.failed || [],
      cards: [
        { label: "品线", value: String(views.length) + " 条", grade: grade(views.length > 0) },
        { label: "有日记", value: String(diaryN) + " 条", grade: grade(diaryN > 0) },
        { label: "本期有动作", value: String(actionN) + " 条", grade: grade(actionN > 0) },
        { label: "可学习合计", value: String(learnSum) + " 条", grade: grade(learnSum > 0) }
      ],
      sections: [
        section("board", "总览", grade(views.length > 0), {
          skin: "board",
          lead: lead,
          tiles: tiles,
          facts: [
            ["品线数", views.length],
            ["窗口", win],
            ["口径", horizon],
            ["主链接", views.map(v => v.asin).join("、")]
          ],
          conclusion: [
            "并排看 " + views.length + " 个类目主链接，不是把它们塞进同一场对照。",
            "点卡片下钻该行完整日记。价格、近30天、BSR 不能跨行比好坏。",
            learnSum ? ("可学习合计 " + learnSum + " 条，优先打开标了可学习的卡片。") : "各品线都还没有可学习条目。"
          ],
          process: [
            { n: 1, title: "分品线", text: "每条品线一个类目主链接。旧的扁平名单不会自动拆成 5 个假类目。" },
            { n: 2, title: "各自取数", text: "只给本行主链接（和可选同类目对照）拉接口。不把 5 个主链接丢进一次词对照。" },
            { n: 3, title: "看板", text: "先看信号、BSR 首末、最近动作。数字仍是各行自己的日记摘要。" },
            { n: 4, title: "下钻", text: "点卡片只打开那一行。日记列与单品线监控相同，不减口径。" },
            { n: 5, title: "边界", text: "不同叶子类目的 BSR 数字没有可比性。词覆盖也不能跨类目加总。" }
          ],
          tables: [{
            title: "对照表",
            headers: ["类目", "主 ASIN", "价格", "近30天", "BSR 首→末", "最近动作", "信号"],
            rows: boardRows,
            rowIds: views.map(v => "lane-" + v.asin),
            note: "各列只描述本行。点行或点卡片下钻，不要按 BSR 给 5 个类目排序争第一。"
          }],
          note: "组合监控最多 5 条品线。总览是索引，完整日记在各行里。",
          boundary: "本页不是完整竞品分析，也不把跨类目名单当成一场竞争。"
        })
      ].concat(laneSections)
    };
  }

  function previewFixture() {
    const dateFrom = "2026-08-10";
    const dateTo = "2026-09-08";
    const days = [];
    let t = Date.parse(dateFrom + "T00:00:00Z");
    const end = Date.parse(dateTo + "T00:00:00Z");
    while (t <= end) {
      days.push(new Date(t).toISOString().slice(0, 10));
      t += 864e5;
    }
    function slot(payload) {
      return { payload: payload, retrievedAt: Date.parse("2026-09-08T12:00:00Z"), local: true };
    }
    function bucket(spec) {
      const infoTrends = days.map((d, i) => {
        let price = spec.price;
        if (spec.cutDay && d >= spec.cutDay) price = Math.round(spec.price * spec.cutTo * 10) / 10;
        const pd = { display: price };
        if (spec.couponDay && d >= spec.couponDay) pd.coupon = [{ type: "coupon" }];
        return {
          date: d,
          stars: spec.stars,
          ratings: spec.ratings + Math.floor(i / 4),
          priceDistribution: pd
        };
      });
      const bsrTrends = days.map(d => {
        let rank = spec.bsrBefore;
        const shiftDay = spec.cutDay || spec.adDay;
        if (shiftDay && d >= shiftDay && spec.bsrStep) {
          const after = Math.round((Date.parse(d + "T00:00:00Z") - Date.parse(shiftDay + "T00:00:00Z")) / 864e5);
          rank = Math.max(spec.bsrAfter, spec.bsrBefore - after * spec.bsrStep);
        } else if (spec.drift) {
          const i = days.indexOf(d);
          rank = spec.bsrBefore + (i % 6 === 0 ? spec.drift : 0);
        }
        return { date: d, values: [{ rank: rank, categoryId: spec.catId }] };
      });
      const changes = [];
      if (spec.listingDay) {
        changes.push({
          date: spec.listingDay,
          previous: { title: spec.title },
          current: { title: spec.title + " (2026)" }
        });
      }
      const ads = [];
      if (spec.adDay) {
        ads.push({ date: spec.adDay, added: { 0: [{ campaignName: "SP-" + spec.asin.slice(-2), campaignType: "sp" }] } });
      }
      return {
        get_asin_info: slot({
          data: {
            entities: [{
              asin: spec.asin,
              brand: spec.brand,
              title: spec.title,
              price: spec.price,
              stars: spec.stars,
              ratings: spec.ratings
            }]
          }
        }),
        get_asin_orders_last_30_days: slot({ orderCount: spec.orders }),
        get_asin_info_trends: slot({ trends: infoTrends }),
        get_asin_bsr_trends: slot({
          trends: bsrTrends,
          categoryTree: [{ categoryId: spec.catId, name: spec.catName }]
        }),
        get_asin_info_change_trends: slot({ trends: changes }),
        get_asin_ad_change_trends: slot({ trends: ads })
      };
    }
    const specs = [
      { category: "Electric Kettles", asin: "B0VIRT0001", brand: "NorthPour", title: "Gooseneck Electric Kettle 1.0L", price: 39.9, cutTo: 0.85, orders: 420, catId: "k1", catName: "Electric Kettles", bsrBefore: 168, bsrAfter: 64, bsrStep: 18, cutDay: "2026-09-01", stars: 4.5, ratings: 1288 },
      { category: "Pour Over Kettle", asin: "B0VIRT0002", brand: "Nueve", title: "Stovetop Pour Over Kettle", price: 29.0, cutTo: 1, orders: 190, catId: "k2", catName: "Pour Over Kettles", bsrBefore: 240, bsrAfter: 240, bsrStep: 0, listingDay: "2026-08-22", stars: 4.3, ratings: 640 },
      { category: "Air Fryers", asin: "B0VIRT0003", brand: "CrispBay", title: "5.8QT Air Fryer", price: 59.9, cutTo: 1, orders: 860, catId: "a1", catName: "Air Fryers", bsrBefore: 95, bsrAfter: 58, bsrStep: 8, adDay: "2026-08-20", stars: 4.6, ratings: 4100 },
      { category: "Coffee Grinders", asin: "B0VIRT0004", brand: "BurrHouse", title: "Conical Burr Grinder", price: 79.0, cutTo: 1, orders: 140, catId: "c1", catName: "Coffee Grinders", bsrBefore: 310, bsrAfter: 310, bsrStep: 0, drift: 12, stars: 4.4, ratings: 520 },
      { category: "Toaster Ovens", asin: "B0VIRT0005", brand: "OvenLite", title: "Countertop Toaster Oven", price: 89.0, cutTo: 0.82, orders: 260, catId: "t1", catName: "Toaster Ovens", bsrBefore: 205, bsrAfter: 88, bsrStep: 16, cutDay: "2026-08-25", couponDay: "2026-08-25", stars: 4.2, ratings: 980 }
    ];
    const evidence = {};
    const lanes = specs.map(s => {
      evidence[s.asin] = bucket(s);
      return { category: s.category, asin: s.asin, peers: [] };
    });
    return {
      form: { site: "US", lanes: lanes, asins: lanes.map(L => L.asin), keywords: "", dateFrom: dateFrom, dateTo: dateTo },
      evidence: evidence
    };
  }

  function build(evidence, form) {
    const lanes = lanesFrom(form);
    if (lanes.length >= 2) return buildPortfolio(evidence, form, lanes);
    const asins = rosterFrom(form);
    const main = asins[0] || "";
    const ev = evidence || {};
    const people = asins.map(a => profileOf(a, ev[a] || {}, a === main, 5));
    const diary = main ? diaryOf(ev[main] || {}) : [];
    const scored = scoreActions(diary);
    const winInfo = windowOf(form);
    const span = winInfo.days;
    const horizon = span == null ? "窗口未知" : span >= 30 ? "月度对照" : span >= 7 ? "周期对照" : "当日快照";
    const win = winInfo.from && winInfo.to ? winInfo.from + " ~ " + winInfo.to : "本窗口";
    const failed = ev.failed || [];
    const hasMain = !!main;
    const dayN = diary.length;
    const activeN = diary.filter(d => d.active.length).length;
    const passiveN = diary.filter(d => d.passive.length).length;
    const learnN = scored.filter(s => s.learn === "可学习").length;
    const first = diary[0] || null;
    const last = diary.length ? diary[diary.length - 1] : null;
    const bsrDays = diary.filter(d => d.bsr != null);
    const starDays = diary.filter(d => d.stars != null);
    const couponDays = diary.filter(d => d.coupon);
    const lead = !hasMain
      ? "没有主 ASIN，不能做每日定点档案。把要盯的商品加进左侧，第一个是主 ASIN。"
      : (win + "（" + horizon + (span != null ? " " + span + " 天" : "") + "）盯主 ASIN " + main + "。" +
        (dayN ? "定点 " + dayN + " 天。" : "还没有日点。") +
        (bsrDays.length ? " 叶子 BSR 从 " + fmt(bsrDays[0].bsr, 0) + " 到 " + fmt(bsrDays[bsrDays.length - 1].bsr, 0) + "。" : " BSR 数据不足。") +
        (activeN ? " 主动动作 " + activeN + " 天。" : " 窗口内没有可核验主动动作。") +
        (learnN ? " 可学习 " + learnN + " 条（动作后 3–7 日名次改善）。" : " 还没有可学习的有效动作。"));

    function section(id, title, g, body) {
      return Object.assign({ id: id, title: title, grade: g, evidence: [] }, body);
    }
    const diaryRows = diary.slice(-40).map(d => [
      d.day,
      d.bsr == null ? "数据不足" : fmt(d.bsr, 0) + (d.bsrCat ? " · " + d.bsrCat : ""),
      d.stars == null ? "数据不足" : fmt(d.stars, 1),
      d.ratings == null ? "数据不足" : fmt(d.ratings, 0),
      d.price == null ? "数据不足" : "$" + fmt(d.price, 1),
      d.coupon ? (d.couponLabel || "有") : "无",
      d.active.join("、") || "—",
      d.passive.join("、") || "—"
    ]);
    const actionRows = scored.map(s => [
      s.day,
      s.actions.join("、"),
      s.bsr == null ? "数据不足" : fmt(s.bsr, 0),
      s.later == null ? "数据不足" : fmt(s.later, 0),
      s.verdict,
      s.learn
    ]);
    const learnRows = scored.filter(s => s.learn === "可学习").map(s => [s.day, s.actions.join("、"), s.verdict, "动作后 3–7 日叶子 BSR 改善。没有花费，只学动作本身。"]);
    const noCopy = [
      ["广告花费", "新广告后名次变了也不能复制预算"],
      ["推算订单", "不是后台实单"],
      ["星级抽样", "日点星级不是全量 VOC"],
      ["被动 BSR/Ratings", "没有主动动作，不当成可学打法"]
    ];

    return {
      generatedAt: Date.now(),
      site: (form && form.site) || "US",
      dateFrom: winInfo.from || form.dateFrom,
      dateTo: winInfo.to || form.dateTo,
      asins: asins,
      failed: failed,
      cards: [
        { label: "定点天数", value: dayN ? String(dayN) + " 天" : "数据不足", grade: grade(dayN > 0) },
        { label: "主动动作", value: String(activeN) + " 天", grade: grade(hasMain) },
        { label: "被动变化", value: String(passiveN) + " 天", grade: grade(hasMain) },
        { label: "可学习", value: String(learnN) + " 条", grade: grade(learnN > 0) }
      ],
      sections: [
        section("s1", "01 每日定点", grade(dayN > 0), {
          lead: lead,
          facts: [
            ["主 ASIN", main || "数据不足"],
            ["窗口", win],
            ["口径", horizon],
            ["BSR 日点", bsrDays.length],
            ["星级日点", starDays.length],
            ["优惠日", couponDays.length],
            ["首日", first ? first.day : "数据不足"],
            ["末日", last ? last.day : "数据不足"]
          ],
          conclusion: [
            hasMain ? ("主 ASIN " + main + "，定点 " + (dayN || "数据不足") + " 天。") : "没有主 ASIN。",
            bsrDays.length ? ("叶子 BSR 首 " + fmt(bsrDays[0].bsr, 0) + "，末 " + fmt(bsrDays[bsrDays.length - 1].bsr, 0) + "。数值越小位次越靠前。") : "BSR 数据不足，不能看排名轨迹。",
            starDays.length || couponDays.length
              ? ("星级日点 " + starDays.length + "，优惠日 " + couponDays.length + "。优惠日只说明字段出现，不是天天满减。")
              : "星级和优惠都数据不足。"
          ],
          process: [
            { n: 1, title: "定主 ASIN", text: "第一个 ASIN 是日记对象。其余只作对照，不是九章竞品分析。" },
            { n: 2, title: "划窗口", text: "起止日期必填，最多一个月（31 天）。超过一个月西柚趋势接口常空返回。≥7 天才能看动作后 3–7 日名次。" },
            { n: 3, title: "BSR", text: "叶子类目日点，西柚 trends[].values[].rank，空了补 Keepa。" },
            { n: 4, title: "星级与券", text: "星级/Ratings 读 info_trends 或 Keepa。券读 couponTrends 和 priceDistribution。" },
            { n: 5, title: "缺列", text: "哪一天缺 BSR/星级/券就写数据不足，不补零。" }
          ],
          tables: diaryRows.length ? [{ title: "每日定点（最多最近 40 天）", headers: ["日期", "叶子 BSR", "星级", "Ratings", "价格", "优惠", "主动", "被动"], rows: diaryRows, note: "日快照不是改版。主动列才是可监测动作。" }] : [],
          note: "本页盯主 ASIN 的日点，不是完整竞品九章。",
          boundary: "接口没抓到的当天动作，本页当数据不足，不编造。"
        }),
        section("s2", "02 主动动作与被动变化", grade(activeN + passiveN > 0), {
          lead: activeN
            ? ("主动动作 " + activeN + " 天：改 Listing、新广告、≥5% 变价、优惠出现。被动变化 " + passiveN + " 天：没有这些动作时的 BSR/星级/Ratings 漂移。")
            : (passiveN ? ("窗口内没有可核验主动动作。被动变化 " + passiveN + " 天，不能当成打法。") : "还没有可区分的主动或被动日。"),
          conclusion: [
            "主动动作 " + activeN + " 天，被动变化 " + passiveN + " 天。",
            "真改版只数 previous/current 标题或主图。日快照不当改版。",
            "只动 BSR 或 Ratings、没有价/券/Listing/新广告，记被动，不学。"
          ],
          process: [
            { n: 1, title: "Listing", text: "previous/current 的 title 或 image 有差才记改版。" },
            { n: 2, title: "广告", text: "只数 added 里的新活动。不是在投状态。" },
            { n: 3, title: "价格", text: "相邻日 |Δ|≥5% 记降价/提价。" },
            { n: 4, title: "优惠", text: "日表「优惠」列是当天有没有券。主动「优惠」只在从无到有（出券）时记，天天有券不当新动作。" },
            { n: 5, title: "被动", text: "当天没有上面四类，但 BSR/星级/Ratings 变了，记被动。" }
          ],
          tables: [{ title: "动作计数", headers: ["类型", "天数/次数", "口径"], rows: [
            ["改 Listing", String(diary.reduce((n, d) => n + d.listing.length, 0)), "标题/主图有差"],
            ["新广告", String(diary.reduce((n, d) => n + d.ads.length, 0)), "added 新活动"],
            ["降价", String(diary.filter(d => d.cut).length), "相邻日 ≤-5%"],
            ["提价", String(diary.filter(d => d.up).length), "相邻日 ≥5%"],
            ["优惠日", String(couponDays.length), "字段出现，不是天天满减"],
            ["被动日", String(passiveN), "无主动动作的漂移"]
          ], note: "次数不是强度。" }],
          note: "对照 ASIN 不进这一章的日记。",
          boundary: "没观测到不等于没做。没有花费不能判断广告是否在投。"
        }),
        section("s3", "03 周期有效动作", grade(scored.length > 0), {
          lead: scored.length
            ? ("本窗口主动动作 " + scored.length + " 条。动作日后 3–7 天叶子 BSR 改善 " + scored.filter(s => s.verdict === "名次改善").length + " 条、走平 " + scored.filter(s => s.verdict === "名次走平").length + " 条、变差 " + scored.filter(s => s.verdict === "名次变差").length + " 条、无法验证 " + scored.filter(s => s.verdict === "无法验证").length + " 条。")
            : "没有主动动作，不能判断有效。被动 BSR 变化不进这一章。",
          conclusion: [
            scored.length ? ("有效待核（名次改善）" + scored.filter(s => s.verdict === "名次改善").length + " 条。") : "有效动作数据不足。",
            "有效只看动作后 3–7 日叶子 BSR。星级很少在一周内跳，不当成交依据。",
            span != null && span < 10 ? "窗口短于 10 天，很多动作看不到 3–7 日结果，会写无法验证。" : "窗口够长才谈周期有效。"
          ],
          process: [
            { n: 1, title: "取动作日", text: "只评估有主动动作的日子。" },
            { n: 2, title: "看 3–7 日", text: "取动作日后 3 到 7 天里第一个有 BSR 的点。" },
            { n: 3, title: "改善", text: "后来名次 < 动作日 ×0.9 记改善。数值越小越好。" },
            { n: 4, title: "变差/走平", text: ">1.1 倍记变差，中间走平。缺 BSR 写无法验证。" },
            { n: 5, title: "边界", text: "这是时间对齐，不是花费归因。同时有促销和广告时不拆谁的功劳。" }
          ],
          tables: actionRows.length ? [{ title: "动作 → 3–7 日 BSR", headers: ["动作日", "主动动作", "当日 BSR", "3–7 日 BSR", "判断", "学习"], rows: actionRows, note: "名次改善仍要人工看库存和 Deal。" }] : [],
          note: "对照 ASIN 不参与有效动作判定。",
          boundary: "没有花费和后台实单，本页不下必投。"
        }),
        section("s4", "04 可学习与不可复制", grade(learnN > 0), {
          lead: learnN
            ? ("可学习 " + learnN + " 条：改 Listing / 降价 / 优惠之后，3–7 日叶子 BSR 改善。广告即使名次改善也只核验，不复制花费。")
            : "还没有可学习条目。被动变化和无法验证的动作都不进学习清单。",
          conclusion: [
            learnN ? ("优先核验：" + scored.filter(s => s.learn === "可学习").slice(0, 3).map(s => s.day + " " + s.actions.join("、")).join("；") + "。") : "本窗口没有可学习的有效动作。",
            "可学习的是仍能核对的动作，不是它现在的销量结果。",
            "不可复制：广告花费、推算订单、星级抽样、被动 BSR。"
          ],
          process: [
            { n: 1, title: "可学习", text: "改 Listing、降价或优惠，且 3–7 日 BSR 改善。" },
            { n: 2, title: "只核验", text: "只有新广告、名次却改善：可核验名次，不可复制花费。" },
            { n: 3, title: "不学", text: "名次变差或走平，不进学习清单。" },
            { n: 4, title: "数据不足", text: "动作日或随后 3–7 日没有 BSR。" },
            { n: 5, title: "复验", text: "下一期用同一主 ASIN、同一窗口长度再跑，不换一批号来比。" }
          ],
          tables: [
            { title: "可学习", headers: ["日期", "动作", "判断", "怎么用"], rows: learnRows.length ? learnRows : [["数据不足", "—", "—", "本窗口没有可学习条目"]], note: "只学动作，不下令开卖。" },
            { title: "不可复制", headers: ["项", "原因"], rows: noCopy }
          ],
          note: "学习结论只综合本页日记。",
          boundary: "没有花费、利润、库存，本页不下令开卖或备货。"
        }),
        section("s5", "05 对照 ASIN", grade(asins.length > 1), {
          lead: asins.length > 1
            ? ("对照 " + (asins.length - 1) + " 个，只看同窗口有没有同类动作，不在本页做九章竞品拆解。")
            : "没有对照 ASIN。要并排看别人，把第二个及以后的号加进本组。",
          conclusion: [
            asins.length > 1 ? ("对照名单：" + asins.slice(1).join("、") + "。") : "本组只有主 ASIN。",
            "对照不参与有效动作判定，避免把别人的销量抄成自己的结论。",
            "要做定位、VOC、变体、爆发归因，去完整竞品分析，不在本页扩九章。"
          ],
          process: [
            { n: 1, title: "主次", text: "第一个是日记对象，其余是对照。" },
            { n: 2, title: "同窗", text: "对照也拉同一窗口的价、改版、广告、BSR。" },
            { n: 3, title: "只计数", text: "这里只报对照有没有动作，不断谁更好做。" },
            { n: 4, title: "不混判", text: "有效动作只评主 ASIN。" },
            { n: 5, title: "边界", text: "对照空着写数据不足，不补零对齐。" }
          ],
          tables: asins.length > 1 ? [{ title: "对照有没有动作", headers: ["ASIN", "真改版", "新广告", "≥5% 变价", "优惠日"], rows: people.filter(p => !p.main).map(p => [p.asin, String(p.listing), String(p.ads), String(p.moves), String(p.dealDays)]), note: "条数不是谁赢。" }] : [],
          note: "对照可空。",
          boundary: "本页不是完整竞品分析。"
        })
      ]
    };
  }

  function stepAsin(st) {
    if (st && st.targetAsin && /^[A-Z0-9]{10}$/i.test(st.targetAsin)) return String(st.targetAsin).toUpperCase();
    const a = st && st.args && (st.args.asin || st.args.product_asin);
    if (Array.isArray(a) && a[0] && /^[A-Z0-9]{10}$/i.test(a[0])) return String(a[0]).toUpperCase();
    if (typeof a === "string" && /^[A-Z0-9]{10}$/i.test(a)) return a.toUpperCase();
    return "";
  }
  function ingestSteps(steps, site) {
    const evidence = {};
    const items = [];
    (steps || []).forEach(st => {
      if (!st || st.status !== "ok" || st.data == null) return;
      const tool = st.tool;
      if (!tool) return;
      const provider = st.provider || "xiyou";
      const asin = stepAsin(st);
      const args = Object.assign({}, st.args && typeof st.args === "object" ? st.args : {});
      const siteCode = args.site || args.marketplace || site || "US";
      if (asin) {
        if (!args.asin) args.asin = asin;
        if (!args.asins) args.asins = [asin];
      }
      if (!args.site) args.site = siteCode;
      if (!args.marketplace) args.marketplace = siteCode;
      const bucket = (tool.indexOf("multi_asin") >= 0 || tool === "get_keyword_info") ? "_shared" : (asin || "_shared");
      if (!evidence[bucket]) evidence[bucket] = {};
      if (!evidence[bucket][tool]) evidence[bucket][tool] = { payload: st.data, retrievedAt: st.savedAt || null, local: true };
      items.push({ provider: provider, tool: tool, arguments: args, payload: st.data, site: siteCode });
    });
    return { evidence: evidence, items: items };
  }
  function mergeEvidence(base, extra) {
    const out = base || {};
    Object.keys(extra || {}).forEach(asin => {
      if (asin === "failed") return;
      if (!out[asin] || typeof out[asin] !== "object") out[asin] = {};
      Object.keys(extra[asin] || {}).forEach(tool => {
        const slot = extra[asin][tool];
        const payload = payloadOf(slot);
        const have = payloadOf(out[asin][tool]);
        if (thinSlot(tool, payload) && !thinSlot(tool, have)) out[asin][tool] = slot;
        else if (!out[asin][tool] && payload != null) out[asin][tool] = slot;
      });
    });
    return out;
  }
  function filledCount(ev) {
    let n = 0;
    Object.keys(ev || {}).forEach(k => {
      if (k === "failed") return;
      n += Object.keys(ev[k] || {}).length;
    });
    return n;
  }

  window.WatchlistAnalyze = {
    MAX_WINDOW_DAYS: MAX_WINDOW_DAYS,
    MAX_LANES: MAX_LANES,
    windowOf: windowOf,
    lanesFrom: lanesFrom,
    rosterFrom: rosterFrom,
    keywordsFrom: keywordsFrom,
    planRequests: planRequests,
    neededFallbacks: neededFallbacks,
    fallbackBudget: fallbackBudget,
    thinSlot: thinSlot,
    listingEdits: listingEdits,
    adAdds: adAdds,
    priceSeries: priceSeries,
    playOf: playOf,
    diaryOf: diaryOf,
    scoreActions: scoreActions,
    ingestSteps: ingestSteps,
    mergeEvidence: mergeEvidence,
    filledCount: filledCount,
    payloadOf: payloadOf,
    build: build,
    previewFixture: previewFixture
  };
})();

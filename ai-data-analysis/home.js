
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND']);
const MISSING_CURRENCY = '__MISSING__';
const DASH = '—';

function toFiniteNumber(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function cleanFloat(value) {
  return Math.round(value * 1e6) / 1e6;
}

function normalizeCurrency(value) {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return code || null;
}

function currencyKey(code) {
  return code || MISSING_CURRENCY;
}

function currencyLabel(key) {
  return key === MISSING_CURRENCY ? '未标币种' : key;
}

function formatAmount(value, currencyCode) {
  if (value === null || !Number.isFinite(value)) return DASH;
  const digits = currencyCode && ZERO_DECIMAL_CURRENCIES.has(currencyCode) ? 0 : 2;
  const rounded = Object.is(Number(value.toFixed(digits)), -0) ? 0 : value;
  const formatted = rounded.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  return currencyCode && currencyCode !== MISSING_CURRENCY
    ? `${currencyCode} ${formatted}`
    : formatted;
}

function formatSignedAmount(value, currencyCode) {
  if (value === null || !Number.isFinite(value)) return DASH;
  const digits = currencyCode && ZERO_DECIMAL_CURRENCIES.has(currencyCode) ? 0 : 2;
  const abs = Math.abs(value);
  const fixedAbs = Number(abs.toFixed(digits));
  const sign = fixedAbs === 0 ? '' : value > 0 ? '+' : '-';
  const formatted = fixedAbs.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  return currencyCode && currencyCode !== MISSING_CURRENCY
    ? `${currencyCode} ${sign}${formatted}`
    : `${sign}${formatted}`;
}

function formatPercent(ratio) {
  if (ratio === null || !Number.isFinite(ratio)) return DASH;
  const pct = ratio * 100;
  const normalized = Object.is(Number(pct.toFixed(1)), -0) ? 0 : pct;
  return `${normalized.toFixed(1)}%`;
}

function sortCurrencyKeys(keys) {
  return [...keys].sort((a, b) => {
    if (a === MISSING_CURRENCY) return 1;
    if (b === MISSING_CURRENCY) return -1;
    return a.localeCompare(b, 'en');
  });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildShopList(data) {
  const map = new Map();
  const shops = Array.isArray(data.shops) ? data.shops : [];
  for (const shop of shops) {
    if (shop && shop.sid != null && String(shop.sid).trim() !== '') {
      const sid = String(shop.sid);
      map.set(sid, {
        sid,
        name: shop.name || sid,
        site: shop.site || '',
        currency: normalizeCurrency(shop.currency)
      });
    }
  }
  const products = Array.isArray(data.products) ? data.products : [];
  for (const product of products) {
    if (product && product.sid != null && !map.has(String(product.sid))) {
      const sid = String(product.sid);
      map.set(sid, {
        sid,
        name: `店铺 ${sid}`,
        site: product.site || '',
        currency: normalizeCurrency(product.currency)
      });
    }
  }
  const rows = Array.isArray(data.rows) ? data.rows : [];
  for (const row of rows) {
    if (row && row.sid != null && !map.has(String(row.sid))) {
      const sid = String(row.sid);
      map.set(sid, {
        sid,
        name: `店铺 ${sid}`,
        site: '',
        currency: normalizeCurrency(row.orderCurrency)
      });
    }
  }
  return [...map.values()];
}

function summarizeAds(data, selectedSid, shopBySid) {
  const products = Array.isArray(data.products) ? data.products : [];
  const performance = Array.isArray(data.performance) ? data.performance : [];
  const productById = new Map();
  for (const p of products) {
    if (p && p.id != null) productById.set(String(p.id), p);
  }

  const groups = new Map();
  let matchedRecords = 0;

  for (const record of performance) {
    if (!record || typeof record !== 'object') continue;
    const product = record.linkId != null ? productById.get(String(record.linkId)) : null;
    const sid = record.sid != null
      ? String(record.sid)
      : (product && product.sid != null ? String(product.sid) : null);
    if (selectedSid !== 'all' && sid !== selectedSid) continue;

    matchedRecords += 1;
    const currency = normalizeCurrency(record.currency)
      || (product ? normalizeCurrency(product.currency) : null)
      || (sid && shopBySid.get(sid) ? shopBySid.get(sid).currency : null);
    const key = currencyKey(currency);
    if (!groups.has(key)) {
      groups.set(key, {
        currencyKey: key,
        currency,
        spendSum: 0,
        spendValid: 0,
        spendMissing: 0,
        adSalesSum: 0,
        adSalesValid: 0,
        adSalesMissing: 0,
        records: 0
      });
    }
    const bucket = groups.get(key);
    bucket.records += 1;

    const spend = toFiniteNumber(record.adSpend);
    if (spend === null) {
      bucket.spendMissing += 1;
    } else {
      bucket.spendSum = cleanFloat(bucket.spendSum + spend);
      bucket.spendValid += 1;
    }

    const adSales = toFiniteNumber(record.adSales);
    if (adSales === null) {
      bucket.adSalesMissing += 1;
    } else {
      bucket.adSalesSum = cleanFloat(bucket.adSalesSum + adSales);
      bucket.adSalesValid += 1;
    }
  }

  const items = sortCurrencyKeys(groups.keys()).map(key => {
    const g = groups.get(key);
    const spend = g.currency && !g.spendMissing && g.spendValid > 0 ? g.spendSum : null;
    const adSales = g.currency && !g.adSalesMissing && g.adSalesValid > 0 ? g.adSalesSum : null;
    let acos = null;
    let acosNote = '';
    if (spend === null || adSales === null) {
      acosNote = '花费或归因销售额缺失';
    } else if (adSales === 0) {
      acosNote = spend > 0 ? '有花费但归因销售额为 0' : '花费与归因销售额均为 0';
    } else {
      acos = spend / adSales;
    }
    return {
      ...g,
      spend,
      adSales,
      acos,
      acosNote
    };
  });

  return { items, matchedRecords };
}

function summarizeOrders(data, selectedSid) {
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const fees = data.fees && typeof data.fees === 'object' ? data.fees : {};
  const orderMap = new Map();

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const sid = row.sid != null ? String(row.sid) : '';
    if (selectedSid !== 'all' && sid !== selectedSid) continue;
    const orderId = row.orderId != null ? String(row.orderId) : '';
    const key = `${sid}:${orderId}`;

    if (!orderMap.has(key)) {
      orderMap.set(key, {
        key,
        sid,
        orderId,
        currency: null,
        mixedCurrency: false,
        profitSum: 0,
        profitMissing: false,
        rowCount: 0
      });
    }
    const order = orderMap.get(key);
    order.rowCount += 1;

    const rowCurrency = normalizeCurrency(row.orderCurrency);
    if (rowCurrency) {
      if (order.currency && order.currency !== rowCurrency) {
        order.mixedCurrency = true;
      } else {
        order.currency = rowCurrency;
      }
    }

    if(!rowCurrency)order.mixedCurrency=true;
    const profit = toFiniteNumber(row.profit);
    if (profit === null) {
      order.profitMissing = true;
    } else {
      order.profitSum = cleanFloat(order.profitSum + profit);
    }
  }

  const groups = new Map();

  for (const order of orderMap.values()) {
    const currency = order.mixedCurrency ? null : order.currency;
    const key = currencyKey(currency);
    if (!groups.has(key)) {
      groups.set(key, {
        currencyKey: key,
        currency,
        orderCount: 0,
        validProfitOrders: 0,
        missingProfitOrders: 0,
        profitTotal: 0,
        lossOrders: 0,
        feeTotal: 0,
        feeOrders: 0,
        crossCurrencyFeeOrders: 0
      });
    }
    const bucket = groups.get(key);
    bucket.orderCount += 1;

    let serviceFee = 0;
    let feeKnown=true;
    if (Object.prototype.hasOwnProperty.call(fees, order.key)) {
      const feeEntry = fees[order.key];
      const feeAmount = feeEntry ? toFiniteNumber(feeEntry.amount) : null;
      const feeCurrency = feeEntry ? normalizeCurrency(feeEntry.currency) : null;
      if (feeAmount !== null) {
        if (currency && feeCurrency === currency) {
          serviceFee = feeAmount;
          bucket.feeTotal = cleanFloat(bucket.feeTotal + feeAmount);
          bucket.feeOrders += 1;
        } else {
          feeKnown=false;
          bucket.crossCurrencyFeeOrders += 1;
        }
      }else feeKnown=false;
    }

    if (order.profitMissing || !currency || !feeKnown) {
      bucket.missingProfitOrders += 1;
    } else {
      const net = cleanFloat(order.profitSum - serviceFee);
      bucket.validProfitOrders += 1;
      bucket.profitTotal = cleanFloat(bucket.profitTotal + net);
      if (net < 0) {
        bucket.lossOrders += 1;
      }
    }
  }

  const items = sortCurrencyKeys(groups.keys()).map(key => {
    const g = groups.get(key);
    return {
      ...g,
      provisionalProfit: !g.missingProfitOrders && g.validProfitOrders > 0 ? g.profitTotal : null,
      lossOrderCount: !g.missingProfitOrders && g.validProfitOrders > 0 ? g.lossOrders : null
    };
  });

  return { items, totalOrders: orderMap.size };
}

function summarizeProducts(data, selectedSid) {
  const products = Array.isArray(data.products) ? data.products : [];
  const hasPerformanceArray = Array.isArray(data.performance);
  const performance = hasPerformanceArray ? data.performance : [];

  const filtered = products.filter(p => {
    if (!p || typeof p !== 'object') return false;
    if (selectedSid === 'all') return true;
    return p.sid != null && String(p.sid) === selectedSid;
  });

  const perfByLink = new Map();
  for (const record of performance) {
    if (!record || record.linkId == null) continue;
    const id = String(record.linkId);
    if (!perfByLink.has(id)) perfByLink.set(id, []);
    perfByLink.get(id).push(record);
  }

  let withSalesCount = 0;
  let zeroSalesCount = 0;
  let missingCount = 0;
  const zeroProducts = [];

  for (const product of filtered) {
    const id = product.id != null ? String(product.id) : '';
    const records = perfByLink.get(id) || [];
    if (!hasPerformanceArray || records.length === 0) {
      missingCount += 1;
      continue;
    }

    let unitsSum = 0;
    let unitsValid = 0;
    for(const rec of records){
      const units=toFiniteNumber(rec.units);
      if(units!==null && units>=0){unitsSum+=units;unitsValid++;}
    }
    if(unitsSum>0){
      withSalesCount++;
    }else if(unitsValid!==records.length){
      missingCount++;
    }else{
      zeroSalesCount += 1;
      zeroProducts.push({
        name: product.name || product.sku || product.asin || id,
        sku: product.sku || '',
        asin: product.asin || '',
        site: product.site || ''
      });
    }
  }

  const totalCount = filtered.length;
  const knownCount = withSalesCount + zeroSalesCount;

  return {
    totalCount,
    withSalesCount: knownCount > 0 ? withSalesCount : null,
    zeroSalesCount: knownCount > 0 ? zeroSalesCount : null,
    missingCount,
    zeroProducts
  };
}

function renderEmptyState(container, title, detail) {
  const box = el('div', 'empty-state');
  box.append(el('strong', '', title), el('span', '', detail));
  container.append(box);
}

function renderAdsCard(summary, bodyEl, hintEl) {
  bodyEl.replaceChildren();
  if (summary.items.length === 0) {
    renderEmptyState(bodyEl, DASH, '当前筛选范围内暂无广告绩效数据');
    hintEl.textContent = '0 条绩效记录';
    return;
  }

  const list = el('div', 'currency-list');
  const compact = summary.items.length > 1;

  for (const item of summary.items) {
    const block = el('div', 'currency-block');
    const top = el('div', 'currency-top');

    const badge = el(
      'span',
      `currency-badge${item.currencyKey === MISSING_CURRENCY ? ' is-missing' : ''}`,
      currencyLabel(item.currencyKey)
    );

    let tone = 'tone-cyan';
    if (item.acos === null) tone = 'tone-missing';


    const hero = el(
      'div',
      `hero-metric${compact ? ' is-compact' : ''} ${tone}`,
      formatPercent(item.acos)
    );
    top.append(hero, badge);
    block.append(top);

    if (item.acosNote) {
      block.append(el('div', 'hero-caption', item.acosNote));
    }

    const subs = el('div', 'sub-metrics');

    const spendBox = el('div', 'sub-item');
    spendBox.append(
      el('span', 'sub-label', '广告花费'),
      el(
        'span',
        `sub-value${item.spend === null ? ' tone-missing' : ''}`,
        formatAmount(item.spend, item.currency)
      )
    );

    const salesBox = el('div', 'sub-item');
    salesBox.append(
      el('span', 'sub-label', '归因销售额'),
      el(
        'span',
        `sub-value${item.adSales === null ? ' tone-missing' : ''}`,
        formatAmount(item.adSales, item.currency)
      )
    );

    subs.append(spendBox, salesBox);
    block.append(subs);

    const notes = [];
    if (item.spendMissing > 0) notes.push(`含 ${item.spendMissing} 条缺花费`);
    if (item.adSalesMissing > 0) notes.push(`含 ${item.adSalesMissing} 条缺归因销售`);
    if (notes.length > 0) {
      const pills = el('div', 'note-pills');
      for (const text of notes) pills.append(el('span', 'note-pill', text));
      block.append(pills);
    }

    list.append(block);
  }

  bodyEl.append(list);
  hintEl.textContent = `${summary.items.length} 个币种分组 · ${summary.matchedRecords} 条记录`;
}

function renderOrdersCard(summary, bodyEl, hintEl) {
  bodyEl.replaceChildren();
  if (summary.items.length === 0) {
    renderEmptyState(bodyEl, DASH, '当前筛选范围内暂无订单数据');
    hintEl.textContent = '0 笔订单';
    return;
  }

  const list = el('div', 'currency-list');
  const compact = summary.items.length > 1;

  for (const item of summary.items) {
    const block = el('div', 'currency-block');
    const top = el('div', 'currency-top');

    const badge = el(
      'span',
      `currency-badge${item.currencyKey === MISSING_CURRENCY ? ' is-missing' : ''}`,
      currencyLabel(item.currencyKey)
    );

    let tone = 'tone-missing';
    if (item.provisionalProfit !== null) {
      tone = item.provisionalProfit < 0 ? 'tone-negative' : 'tone-positive';
    }

    const hero = el(
      'div',
      `hero-metric${compact ? ' is-compact' : ''} ${tone}`,
      formatSignedAmount(item.provisionalProfit, item.currency)
    );
    top.append(hero, badge);
    block.append(top);

    const subs = el('div', 'sub-metrics');

    const lossBox = el('div', 'sub-item');
    const lossText = item.lossOrderCount === null ? DASH : `${item.lossOrderCount} 单`;
    const lossTone = item.lossOrderCount === null
      ? ' tone-missing'
      : item.lossOrderCount > 0
        ? ' tone-negative'
        : ' tone-positive';
    lossBox.append(
      el('span', 'sub-label', '亏损单数'),
      el('span', `sub-value${lossTone}`, lossText)
    );

    const countBox = el('div', 'sub-item');
    countBox.append(
      el('span', 'sub-label', '订单总数 / 已扣服务费'),
      el(
        'span',
        'sub-value',
        item.feeOrders > 0
          ? `${item.orderCount} 单 · -${formatAmount(item.feeTotal, item.currency)}`
          : `${item.orderCount} 单`
      )
    );

    subs.append(lossBox, countBox);
    block.append(subs);

    const notes = [];
    if (item.missingProfitOrders > 0) notes.push(`含 ${item.missingProfitOrders} 单盈亏待核实`);
    if (item.crossCurrencyFeeOrders > 0) notes.push(`含 ${item.crossCurrencyFeeOrders} 单服务费币种待核对`);
    if (notes.length > 0) {
      const pills = el('div', 'note-pills');
      for (const text of notes) pills.append(el('span', 'note-pill', text));
      block.append(pills);
    }

    list.append(block);
  }

  bodyEl.append(list);
  hintEl.textContent = `${summary.items.length} 个币种分组 · 共 ${summary.totalOrders} 笔订单`;
}

function renderProductsCard(summary, bodyEl, hintEl) {
  bodyEl.replaceChildren();
  if (summary.totalCount === 0) {
    renderEmptyState(bodyEl, DASH, '当前筛选范围内暂无跟踪商品');
    hintEl.textContent = '0 款跟踪商品';
    return;
  }

  const box = el('div', 'product-summary');
  const heroRow = el('div', 'product-hero-row');

  const zeroLeft = el('div');
  let zeroTone = 'tone-missing';
  let zeroText = DASH;
  if (summary.zeroSalesCount !== null) {
    zeroText = `${summary.zeroSalesCount} 款`;
    zeroTone = summary.zeroSalesCount > 0 ? 'tone-warn' : 'tone-positive';
  }
  zeroLeft.append(
    el('div', `hero-metric ${zeroTone}`, zeroText),
    el('div', 'hero-caption', summary.zeroSalesCount === null ? '本期销量数据缺失' : '本期零销量跟踪商品')
  );

  const ratioRight = el('div', 'product-ratio');
  const withSalesText = summary.withSalesCount === null ? DASH : String(summary.withSalesCount);
  ratioRight.append(
    el('strong', '', `${withSalesText} / ${summary.totalCount}`),
    el('span', '', '有销量 / 总数')
  );

  heroRow.append(zeroLeft, ratioRight);
  box.append(heroRow);

  const subs = el('div', 'sub-metrics');
  const activeBox = el('div', 'sub-item');
  activeBox.append(
    el('span', 'sub-label', '本期有销量'),
    el(
      'span',
      `sub-value${summary.withSalesCount === null ? ' tone-missing' : ' tone-positive'}`,
      summary.withSalesCount === null ? DASH : `${summary.withSalesCount} 款`
    )
  );

  const totalBox = el('div', 'sub-item');
  totalBox.append(
    el('span', 'sub-label', '跟踪商品总数'),
    el('span', 'sub-value', `${summary.totalCount} 款`)
  );
  subs.append(activeBox, totalBox);
  box.append(subs);

  if (summary.missingCount > 0) {
    const pills = el('div', 'note-pills');
    pills.append(el('span', 'note-pill', `数据缺失 ${summary.missingCount} 款（未计为零销量）`));
    box.append(pills);
  }

  bodyEl.append(box);

  if (summary.zeroProducts.length > 0) {
    const ul = el('ul', 'zero-list');
    const maxShown = 4;
    for (const item of summary.zeroProducts.slice(0, maxShown)) {
      const li = el('li');
      li.append(
        el('span', 'zero-name', item.name),
        el('span', 'zero-meta', [item.site, item.sku || item.asin].filter(Boolean).join(' · '))
      );
      ul.append(li);
    }
    if (summary.zeroProducts.length > maxShown) {
      const more = el('li');
      more.append(
        el('span', 'zero-name', `另有 ${summary.zeroProducts.length - maxShown} 款零销量商品`),
        el('span', 'zero-meta', '见新品跟踪')
      );
      ul.append(more);
    }
    bodyEl.append(ul);
  }

  hintEl.textContent = summary.zeroSalesCount === null
    ? `共 ${summary.totalCount} 款 · 待补齐销量数据`
    : `零销量 ${summary.zeroSalesCount} 款 · 有销量 ${summary.withSalesCount} / ${summary.totalCount}`;
}

function renderHeader(data, shops) {
  const metaEl = document.getElementById('source-meta');
  const bannerEl = document.getElementById('sync-banner');
  metaEl.replaceChildren();

  const hasError = Boolean(data.error);
  const hasSyncWarn = Boolean(data.syncError && !data.error);
  const dot = el('span', `meta-dot${hasError ? ' is-error' : hasSyncWarn ? ' is-warn' : ''}`);
  metaEl.append(dot);

  const sourceLabel = data.dataset
    ? '共享演示模型'
    : data.mode === 'demo'
      ? '模拟领星数据'
      : `领星 ${data.transport || 'API'}`;
  const periodLabel = data.from && data.to ? `${data.from} 至 ${data.to}` : '统计周期未同步';
  const syncLabel = data.syncedAt
    ? `更新于 ${new Date(data.syncedAt).toLocaleString('zh-CN')}`
    : '尚未同步';

  metaEl.append(
    document.createTextNode(`${sourceLabel} · ${periodLabel} · ${shops.length} 个店铺 · ${syncLabel}`)
  );

  if (data.error || data.syncError) {
    bannerEl.hidden = false;
    bannerEl.className = `sync-banner${data.error ? ' is-error' : ''}`;
    bannerEl.textContent = data.error
      ? `数据尚未就绪：${data.error}`
      : `上次同步异常（当前仍展示最近可用版本）：${data.syncError}`;
  } else {
    bannerEl.hidden = true;
    bannerEl.textContent = '';
  }
}

function init() {
  const raw = window.systemData;
  const data = raw && typeof raw === 'object'
    ? raw
    : { shops: [], rows: [], products: [], performance: [], fees: {}, error: '未检测到共享数据，请从系统入口访问' };

  const shops = buildShopList(data);
  const shopBySid = new Map(shops.map(s => [s.sid, s]));
  const select = document.getElementById('shop-filter');

  select.replaceChildren();
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = shops.length > 0 ? `全部店铺（${shops.length}）` : '全部店铺';
  select.append(allOpt);

  for (const shop of shops) {
    const opt = document.createElement('option');
    opt.value = shop.sid;
    opt.textContent = [shop.name, shop.site, shop.currency].filter(Boolean).join(' · ');
    select.append(opt);
  }

  renderHeader(data, shops);

  const adsBody = document.getElementById('ads-body');
  const adsHint = document.getElementById('ads-hint');
  const ordersBody = document.getElementById('orders-body');
  const ordersHint = document.getElementById('orders-hint');
  const productsBody = document.getElementById('products-body');
  const productsHint = document.getElementById('products-hint');

  function renderAll() {
    const selectedSid = select.value || 'all';
    renderAdsCard(summarizeAds(data, selectedSid, shopBySid), adsBody, adsHint);
    renderOrdersCard(summarizeOrders(data, selectedSid), ordersBody, ordersHint);
    renderProductsCard(summarizeProducts(data, selectedSid), productsBody, productsHint);
  }

  select.addEventListener('change', renderAll);
  renderAll();
}

if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
}
export {summarizeAds,summarizeOrders,summarizeProducts};

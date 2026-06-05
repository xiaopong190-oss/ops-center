const STORAGE_KEY = "ops-center-fba-hanhai-product-config-v1";

const WAREHOUSE_MAP = {
  IAH3: {
    code: "IAH3",
    addr1: "15525 Milner Road 77032 - HOUSTON, TX - United States",
    city: "HOUSTON",
    state: "TX",
    zipcode: "77032",
  },
  MCC1: {
    code: "MCC1",
    addr1: "300 Rancho Cordova Pkwy 95742 - RANCHO CORDOVA, CA - United States",
    city: "RANCHO CORDOVA",
    state: "CA",
    zipcode: "95742",
  },
  SMF3: {
    code: "SMF3",
    addr1: "3923 S B ST 95206 - STOCKTON, CA - United States",
    city: "STOCKTON",
    state: "CA",
    zipcode: "95206",
  },
  ONT8: {
    code: "ONT8",
    addr1: "24300 Nandina Ave 92376 - SAN BERNARDINO, CA - United States",
    city: "SAN BERNARDINO",
    state: "CA",
    zipcode: "92376",
  },
};

const DEFAULT_PRODUCTS = {
  "FB002-LF-US-C": {
    sku: "FB002-LF-US-C",
    template_name: "水壶-白",
    electric: "是",
    en_name: "Gooseneck Electric Kettle Stainless Steel",
    cn_name: "电热水壶",
    declare_price: "",
    material: "不锈钢/Stainless Steel",
    hs_code: "",
    usage: "Home/家用",
    brand: "non",
    model: "",
  },
  "FB001-HS-US-N": {
    sku: "FB001-HS-US-N",
    template_name: "水壶-N",
    electric: "是",
    en_name: "Gooseneck Electric Kettle Stainless Steel",
    cn_name: "电热水壶",
    declare_price: "",
    material: "不锈钢/Stainless Steel",
    hs_code: "",
    usage: "Home/家用",
    brand: "non",
    model: "",
  },
};

const REQUIRED_FIELDS = [
  ["en_name", "产品英文品名"],
  ["cn_name", "产品中文品名"],
  ["declare_price", "产品申报单价"],
  ["material", "产品材质"],
  ["hs_code", "产品海关编码"],
  ["usage", "产品用途"],
  ["brand", "产品品牌"],
];

const OPTIONAL_FIELDS = new Set(["sku", "template_name", "electric", "model"]);

let parsedShipments = [];
let productConfig = loadProductConfig();

const els = {
  csvInput: document.getElementById("csvInput"),
  csvDropzone: document.getElementById("csvDropzone"),
  batchList: document.getElementById("batchList"),
  productEditor: document.getElementById("productEditor"),
  convertBtn: document.getElementById("convertBtn"),
  previewBtn: document.getElementById("previewBtn"),
  clearFilesBtn: document.getElementById("clearFilesBtn"),
  status: document.getElementById("status"),
  preview: document.getElementById("preview"),
  addProductBtn: document.getElementById("addProductBtn"),
  exportConfigBtn: document.getElementById("exportConfigBtn"),
  importConfigInput: document.getElementById("importConfigInput"),
  configAlert: document.getElementById("configAlert"),
  exportAlert: document.getElementById("exportAlert"),
};

function loadProductConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_PRODUCTS);
    return { ...structuredClone(DEFAULT_PRODUCTS), ...JSON.parse(raw) };
  } catch {
    return structuredClone(DEFAULT_PRODUCTS);
  }
}

function saveProductConfig() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(productConfig));
}

function lbsToKg(value) {
  return round1(Number(value) * 0.45359237);
}

function inchToCm(value) {
  return round1(Number(value) * 2.54);
}

function round1(num) {
  return Math.round(num * 10) / 10;
}

function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((item) => item !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function parseFbaShipment(rows) {
  const meta = {};
  const products = [];
  let headerIndex = -1;

  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i][0] === "SKU") {
      headerIndex = i;
      break;
    }
  }

  for (const row of rows) {
    if (row.length >= 2 && row[0] && row[1] && row[0] !== "SKU" && !row[0].startsWith("原厂包装发货")) {
      const key = row[0].replaceAll('"', "").trim();
      if (!key.includes("SKU")) {
        meta[key] = row[1].replaceAll('"', "").trim();
      }
    }
  }

  if (headerIndex >= 0) {
    for (let i = headerIndex + 1; i < rows.length; i += 1) {
      const row = rows[i];
      if (row[0] && row.length >= 15) products.push(row);
    }
  }

  if (!meta["货件编号"]) {
    throw new Error("无法识别货件编号");
  }
  if (!products.length) {
    throw new Error("未找到 SKU 产品行");
  }

  return { meta, products };
}

function normalizeProductRow(row) {
  return {
    sku: row[0],
    title: row[1],
    asin: row[2],
    fnsku: row[3],
    template_name: row[4],
    weight_lb: row[7],
    length_in: row[8],
    width_in: row[9],
    height_in: row[10],
    qty_per_box: Number(row[11]),
    box_count: Number(row[12]),
    total_qty: Number(row[13]),
    box_ids: row[14]
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .sort(),
  };
}

function detectWarehouse(shipmentName, deliveryAddress) {
  const upperName = shipmentName.toUpperCase();
  for (const code of Object.keys(WAREHOUSE_MAP)) {
    if (upperName.includes(code)) return { ...WAREHOUSE_MAP[code] };
  }

  const city = deliveryAddress.split(",")[0].trim().toUpperCase();
  const match = Object.values(WAREHOUSE_MAP).find((item) => item.city === city);
  if (match) return { ...match };

  return {
    code: "",
    addr1: "",
    city: deliveryAddress.split(",")[0]?.trim() || "",
    state: deliveryAddress.split(",")[1]?.trim() || "",
    zipcode: "",
  };
}

function getProductConfig(sku, templateName) {
  if (productConfig[sku]) return productConfig[sku];
  return Object.values(productConfig).find((item) => item.template_name === templateName) || null;
}

function validateProductConfig(info, sku) {
  const missing = REQUIRED_FIELDS.filter(([key]) => !String(info[key] ?? "").trim()).map(
    ([, label]) => label
  );
  if (missing.length) {
    throw new Error(`SKU ${sku} 缺少：${missing.join("、")}`);
  }
}

function validateWarehouse(warehouse) {
  if (!warehouse.code || !warehouse.addr1 || !warehouse.city || !warehouse.zipcode) {
    throw new Error(`仓库信息不完整（${warehouse.code || "未知"}）`);
  }
}

function createBlankSheet() {
  const sheet = [];
  for (let r = 0; r < 54; r += 1) sheet[r] = Array(21).fill("");

  const set = (r, c, value) => {
    sheet[r][c] = value;
  };

  set(0, 0, "客户订单号");
  set(0, 4, "带电*");
  set(0, 5, "否");
  set(0, 8, "店铺");
  set(1, 0, "服务*");
  set(1, 1, "美国普船卡派");
  set(1, 4, "带磁*");
  set(1, 5, "否");
  set(1, 8, "发件人地址编码");
  set(2, 0, "地址库编码");
  set(2, 4, "液体*");
  set(2, 5, "否");
  set(2, 8, "发件人姓名");
  set(3, 0, "收件人姓名*");
  set(3, 1, "Amazon");
  set(3, 4, "粉末*");
  set(3, 5, "否");
  set(3, 8, "发件人公司");
  set(4, 0, "收件人公司");
  set(4, 4, "危险品*");
  set(4, 5, "否");
  set(4, 8, "发件人地址一");
  set(5, 0, "收件人地址一*");
  set(5, 4, "报关方式*");
  set(5, 5, "报关退税");
  set(5, 8, "发件人地址二");
  set(6, 0, "收件人地址二");
  set(6, 4, "清关方式");
  set(6, 8, "发件人地址三");
  set(7, 0, "收件人地址三");
  set(7, 4, "交税方式");
  set(7, 8, "发件人城市");
  set(8, 0, "收件人城市*");
  set(8, 4, "交货条款");
  set(8, 8, "发件人省份/州");
  set(9, 0, "收件人省份/州");
  set(9, 4, "派送方式");
  set(9, 8, "发件人邮编");
  set(10, 0, "收件人邮编*");
  set(10, 4, "VAT号*");
  set(10, 8, "发件人国家代码(二字代码)");
  set(11, 0, "收件人国家代码(二字代码)*");
  set(11, 1, "US");
  set(11, 4, "参考号一");
  set(11, 8, "发件人电话");
  set(12, 0, "收件人电话");
  set(12, 4, "参考号二");
  set(12, 8, "发件人邮箱");
  set(13, 0, "收件人邮箱");
  set(13, 4, "备注");
  set(14, 0, "PO Number");
  set(14, 4, "购买保险");
  set(14, 5, "否");
  set(15, 0, "箱数");
  set(15, 4, "保价");
  set(16, 4, "投保币种");

  const headers = [
    "货箱编号*",
    "货箱重量(KG)*",
    "货箱长度(CM)*",
    "货箱宽度(CM)*",
    "货箱高度(CM)*",
    "产品英文品名*",
    "产品中文品名*",
    "产品申报单价*",
    "产品申报数量*",
    "产品材质*",
    "产品海关编码*",
    "产品用途*",
    "产品品牌*",
    "产品型号*",
    "产品销售链接",
    "产品销售价格",
    "产品图片链接",
    "产品重量(kg)",
    "产品ASIN",
    "产品FNSKU",
    "产品SKU",
  ];
  headers.forEach((label, index) => set(17, index, label));

  return sheet;
}

function buildWorkbook(shipment, warehouse, productInfo) {
  const sheet = createBlankSheet();
  const product = shipment.products[0];
  const set = (r, c, value) => {
    sheet[r][c] = value;
  };

  set(0, 5, productInfo.electric || "否");
  set(2, 1, warehouse.code);
  set(5, 1, warehouse.addr1);
  set(8, 1, warehouse.city);
  set(9, 1, warehouse.state);
  set(10, 1, warehouse.zipcode);
  set(15, 1, product.box_count);

  const weightKg = lbsToKg(product.weight_lb);
  const lengthCm = inchToCm(product.length_in);
  const widthCm = inchToCm(product.width_in);
  const heightCm = inchToCm(product.height_in);

  product.box_ids.forEach((boxId, index) => {
    const row = 18 + index;
    set(row, 0, boxId);
    set(row, 1, weightKg);
    set(row, 2, lengthCm);
    set(row, 3, widthCm);
    set(row, 4, heightCm);
    set(row, 5, productInfo.en_name);
    set(row, 6, productInfo.cn_name);
    set(row, 7, Number(productInfo.declare_price));
    set(row, 8, product.qty_per_box);
    set(row, 9, productInfo.material);
    set(row, 10, productInfo.hs_code);
    set(row, 11, productInfo.usage);
    set(row, 12, productInfo.brand);
    if (productInfo.model) set(row, 13, productInfo.model);
    set(row, 18, product.asin);
    set(row, 19, product.fnsku);
    set(row, 20, product.sku);
  });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(sheet);
  XLSX.utils.book_append_sheet(workbook, worksheet, "模版");
  return workbook;
}

function getRequiredSkus() {
  const skus = new Set();
  parsedShipments.forEach((item) => {
    if (item.shipment?.products?.[0]?.sku) {
      skus.add(item.shipment.products[0].sku);
    }
  });
  return skus;
}

function ensureProductStubsForBatch() {
  parsedShipments.forEach((item) => {
    const product = item.shipment?.products?.[0];
    if (!product?.sku || productConfig[product.sku]) return;

    productConfig[product.sku] = {
      sku: product.sku,
      template_name: product.template_name || "",
      electric: "否",
      en_name: "",
      cn_name: "",
      declare_price: "",
      material: "",
      hs_code: "",
      usage: "",
      brand: "",
      model: "",
    };
  });
  saveProductConfig();
}

function getMissingRequiredFields(info) {
  return REQUIRED_FIELDS.filter(([key]) => !String(info[key] ?? "").trim()).map(
    ([, label]) => label
  );
}

function getProductState(item, isBatchRequired) {
  const missing = getMissingRequiredFields(item);
  if (!isBatchRequired) {
    return missing.length ? "idle" : "idle";
  }
  if (!missing.length) return "ready";
  const filledCount = REQUIRED_FIELDS.length - missing.length;
  return filledCount > 0 ? "warn" : "missing";
}

function getFieldVisualState(field, value, isBatchRequired) {
  const filled = String(value ?? "").trim().length > 0;
  if (OPTIONAL_FIELDS.has(field)) {
    return filled ? "field-ok" : "field-idle";
  }
  if (!isBatchRequired) return filled ? "field-ok" : "field-idle";
  return filled ? "field-ok" : "field-missing";
}

function getBatchConfigSummary() {
  const requiredSkus = getRequiredSkus();
  const summary = {
    total: requiredSkus.size,
    ready: 0,
    incomplete: [],
    missingSkus: [],
  };

  requiredSkus.forEach((sku) => {
    const shipment = parsedShipments.find((item) => item.shipment?.products?.[0]?.sku === sku);
    const templateName = shipment?.shipment?.products?.[0]?.template_name || "";
    const info = getProductConfig(sku, templateName);
    if (!info) {
      summary.missingSkus.push(sku);
      summary.incomplete.push({ sku, missing: ["整个 SKU 未配置"] });
      return;
    }
    const missing = getMissingRequiredFields(info);
    if (!missing.length) {
      summary.ready += 1;
    } else {
      summary.incomplete.push({ sku, missing });
    }
  });

  return summary;
}

function renderConfigAlert() {
  const requiredSkus = getRequiredSkus();
  if (!requiredSkus.size) {
    els.configAlert.classList.add("hidden");
    els.configAlert.innerHTML = "";
    return;
  }

  const summary = getBatchConfigSummary();
  const pending = summary.total - summary.ready;

  if (pending === 0 && !summary.missingSkus.length) {
    els.configAlert.className = "config-alert success";
    els.configAlert.innerHTML = `
      <strong>本批 SKU 已全部配好</strong>
      共 ${summary.total} 个 SKU，必填项完整，可以导出。
    `;
    return;
  }

  const lines = summary.incomplete
    .map((item) => `<li><b>${item.sku}</b>：还缺 ${item.missing.join("、")}</li>`)
    .join("");

  const missingSkuLine = summary.missingSkus.length
    ? `<li><b>未配置的 SKU</b>：${summary.missingSkus.join("、")}（请点「新增 SKU」）</li>`
    : "";

  els.configAlert.className = `config-alert ${pending === summary.total ? "error" : "warn"}`;
  els.configAlert.innerHTML = `
    <strong>本批还有 ${pending} 个 SKU 没配完，暂时不能导出</strong>
    已配好 ${summary.ready} / ${summary.total}。请补全下面标红的必填项：
    <ul>${missingSkuLine}${lines}</ul>
  `;
}

function renderExportAlert(allReady) {
  if (!parsedShipments.length) {
    els.exportAlert.classList.add("hidden");
    return;
  }

  if (allReady) {
    els.exportAlert.className = "export-alert success";
    els.exportAlert.innerHTML = `<strong>全部货件已通过校验</strong>可以安全导出 ZIP。`;
    els.exportAlert.classList.remove("hidden");
    els.convertBtn.classList.remove("blocked");
    els.convertBtn.textContent = `批量生成并下载 ZIP（${parsedShipments.length} 个文件）`;
    return;
  }

  const badItems = parsedShipments.filter((item) => !evaluateShipment(item).ok);
  els.exportAlert.className = "export-alert error";
  els.exportAlert.innerHTML = `
    <strong>还有 ${badItems.length} 个货件不能导出</strong>
    请先处理上方黄色/红色提示，把所有必填项补全后再下载。
  `;
  els.exportAlert.classList.remove("hidden");
  els.convertBtn.classList.add("blocked");
  els.convertBtn.textContent = `还不能导出（还差 ${badItems.length} 个）`;
}

function evaluateShipment(item) {
  if (item.error) return { ok: false, message: item.error };

  try {
    const product = item.shipment.products[0];
    const productInfo = getProductConfig(product.sku, product.template_name);
    if (!productInfo) {
      throw new Error(`未配置 SKU ${product.sku}`);
    }
    validateProductConfig(productInfo, product.sku);
    validateWarehouse(item.warehouse);
    return { ok: true, message: "可转换" };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

function renderProductEditor() {
  const requiredSkus = getRequiredSkus();
  els.productEditor.innerHTML = "";

  const sortedProducts = Object.values(productConfig).sort((a, b) => {
    const aReq = requiredSkus.has(a.sku) ? 0 : 1;
    const bReq = requiredSkus.has(b.sku) ? 0 : 1;
    if (aReq !== bReq) return aReq - bReq;
    const aMissing = getMissingRequiredFields(a).length;
    const bMissing = getMissingRequiredFields(b).length;
    return bMissing - aMissing;
  });

  sortedProducts.forEach((item) => {
    const block = document.createElement("div");
    const isBatchRequired = requiredSkus.has(item.sku);
    const state = getProductState(item, isBatchRequired);
    const missing = getMissingRequiredFields(item);

    block.className = `product-item state-${state}`;
    block.dataset.sku = item.sku;

    const statusText = !isBatchRequired
      ? "当前批次未使用此 SKU"
      : !missing.length
        ? "本批必填项已配好，可以导出"
        : `本批还缺 ${missing.length} 项：${missing.join("、")}`;

    const tagHtml = isBatchRequired
      ? !missing.length
        ? '<span class="tag tag-ready">本批已配好</span>'
        : '<span class="tag">本批待补全</span>'
      : "";

    block.innerHTML = `
      <header>
        <h3>${escapeHtml(item.sku)} ${tagHtml}</h3>
        <button type="button" class="btn secondary remove-product">删除</button>
      </header>
      <p class="product-status-text ${state}">${escapeHtml(statusText)}</p>
      <div class="product-fields">
        ${renderField("sku", "SKU", item.sku, false, isBatchRequired)}
        ${renderField("template_name", "原厂包装模板", item.template_name, false, isBatchRequired)}
        ${renderField("electric", "带电", item.electric, false, isBatchRequired)}
        ${renderField("en_name", "英文品名", item.en_name, true, isBatchRequired)}
        ${renderField("cn_name", "中文品名", item.cn_name, true, isBatchRequired)}
        ${renderField("declare_price", "申报单价", item.declare_price, true, isBatchRequired)}
        ${renderField("material", "材质", item.material, true, isBatchRequired)}
        ${renderField("hs_code", "海关编码", item.hs_code, true, isBatchRequired)}
        ${renderField("usage", "用途", item.usage, true, isBatchRequired)}
        ${renderField("brand", "品牌", item.brand, true, isBatchRequired)}
        ${renderField("model", "型号", item.model, false, isBatchRequired)}
      </div>
    `;

    block.querySelector(".remove-product").addEventListener("click", () => {
      delete productConfig[item.sku];
      saveProductConfig();
      refreshUi();
    });

    block.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => {
        productConfig[item.sku][input.dataset.field] = input.value;
        saveProductConfig();
        updateProductBlockVisual(block, item.sku, isBatchRequired);
        refreshUi({ skipEditor: true });
      });
    });

    els.productEditor.appendChild(block);
  });

  renderConfigAlert();
}

function renderField(field, label, value, isRequired, isBatchRequired) {
  const visual = getFieldVisualState(field, value, isBatchRequired);
  const filled = String(value ?? "").trim().length > 0;
  const hint = isRequired
    ? filled
      ? '<span class="field-hint ok">已填写</span>'
      : '<span class="field-hint missing">必填未填</span>'
    : "";
  const star = isRequired ? '<span class="req-star">*</span>' : "";

  return `
    <label>
      <span class="field-label-row">${star}${label} ${hint}</span>
      <input
        type="text"
        class="${visual}"
        data-field="${field}"
        data-required="${isRequired}"
        value="${escapeHtml(String(value ?? ""))}"
        placeholder="${isRequired && isBatchRequired && !filled ? "请填写" + label : ""}"
      />
    </label>
  `;
}

function updateProductBlockVisual(block, sku, isBatchRequired) {
  const item = productConfig[sku];
  if (!item || !block) return;

  const state = getProductState(item, isBatchRequired);
  const missing = getMissingRequiredFields(item);
  block.className = `product-item state-${state}`;

  const statusEl = block.querySelector(".product-status-text");
  if (statusEl) {
    statusEl.className = `product-status-text ${state}`;
    statusEl.textContent = !isBatchRequired
      ? "当前批次未使用此 SKU"
      : !missing.length
        ? "本批必填项已配好，可以导出"
        : `本批还缺 ${missing.length} 项：${missing.join("、")}`;
  }

  block.querySelectorAll("input").forEach((input) => {
    const field = input.dataset.field;
    const isRequired = input.dataset.required === "true";
    input.className = getFieldVisualState(field, input.value, isBatchRequired);

    const labelRow = input.parentElement?.querySelector(".field-label-row");
    if (!labelRow || !isRequired) return;
    const filled = input.value.trim().length > 0;
    const hint = labelRow.querySelector(".field-hint");
    if (hint) {
      hint.className = `field-hint ${filled ? "ok" : "missing"}`;
      hint.textContent = filled ? "已填写" : "必填未填";
    }
    if (!filled && isBatchRequired) {
      input.placeholder = "必填，请填写";
    } else {
      input.placeholder = "";
    }
  });
}

function refreshUi(options = {}) {
  if (!options.skipEditor) renderProductEditor();
  renderBatchList();
  renderConfigAlert();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function syncProductConfigFromEditor() {
  document.querySelectorAll(".product-item").forEach((block) => {
    const sku = block.dataset.sku;
    block.querySelectorAll("input").forEach((input) => {
      const field = input.dataset.field;
      const value = input.value.trim();
      if (field === "sku" && value && value !== sku) {
        const old = productConfig[sku];
        delete productConfig[sku];
        old.sku = value;
        productConfig[value] = old;
        block.dataset.sku = value;
        return;
      }
      productConfig[sku][field] = value;
    });
  });
  saveProductConfig();
}

function showStatus(message, type = "") {
  els.status.textContent = message;
  els.status.className = `status ${type}`.trim();
}

function renderBatchList() {
  if (!parsedShipments.length) {
    els.batchList.classList.add("hidden");
    els.batchList.innerHTML = "";
    els.convertBtn.disabled = true;
    els.previewBtn.disabled = true;
    els.clearFilesBtn.disabled = true;
    els.exportAlert.classList.add("hidden");
    return;
  }

  els.batchList.classList.remove("hidden");
  els.clearFilesBtn.disabled = false;

  const rows = parsedShipments
    .map((item) => {
      const product = item.shipment?.products?.[0];
      const status = evaluateShipment(item);
      const rowClass = status.ok ? "row-ok" : "row-bad";
      const badge = status.ok
        ? '<span class="badge badge-ok">可导出</span>'
        : `<span class="badge badge-bad">${escapeHtml(status.message)}</span>`;
      return `
        <tr class="${rowClass}">
          <td>${escapeHtml(item.fileName)}</td>
          <td>${escapeHtml(item.shipment?.meta?.["货件编号"] || "-")}</td>
          <td>${escapeHtml(product?.sku || "-")}</td>
          <td>${escapeHtml(item.warehouse?.code || "-")}</td>
          <td>${product ? `${product.box_count} 箱 / ${product.total_qty} 件` : "-"}</td>
          <td>${badge}</td>
        </tr>
      `;
    })
    .join("");

  els.batchList.innerHTML = `
    <table class="batch-table">
      <thead>
        <tr>
          <th>文件名</th>
          <th>货件编号</th>
          <th>SKU</th>
          <th>仓库</th>
          <th>数量</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  const allReady = parsedShipments.every((item) => evaluateShipment(item).ok);
  els.convertBtn.disabled = !allReady;
  els.previewBtn.disabled = false;
  renderExportAlert(allReady);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^\uFEFF/, ""));
    reader.onerror = () => reject(new Error(`读取失败: ${file.name}`));
    reader.readAsText(file, "UTF-8");
  });
}

async function parseCsvFile(file) {
  const text = await readFileAsText(file);
  const rows = parseCsvText(text);
  const shipment = parseFbaShipment(rows);
  shipment.products = shipment.products.map(normalizeProductRow);
  const warehouse = detectWarehouse(shipment.meta["货件名称"], shipment.meta["配送地址"]);
  return { fileName: file.name, shipment, warehouse, error: null };
}

async function handleCsvFiles(fileList) {
  const files = Array.from(fileList).filter((file) => file.name.toLowerCase().endsWith(".csv"));
  if (!files.length) {
    showStatus("请上传 CSV 文件。", "error");
    return;
  }

  showStatus(`正在解析 ${files.length} 个文件...`, "");

  const results = await Promise.all(
    files.map(async (file) => {
      try {
        return await parseCsvFile(file);
      } catch (error) {
        return { fileName: file.name, shipment: null, warehouse: null, error: error.message };
      }
    })
  );

  const existingNames = new Set(parsedShipments.map((item) => item.fileName));
  results.forEach((item) => {
    if (!existingNames.has(item.fileName)) {
      parsedShipments.push(item);
      existingNames.add(item.fileName);
    }
  });

  ensureProductStubsForBatch();
  refreshUi();

  const okCount = parsedShipments.filter((item) => evaluateShipment(item).ok).length;
  const failCount = parsedShipments.length - okCount;
  showStatus(
    `已加载 ${parsedShipments.length} 个文件。可导出 ${okCount} 个，待处理 ${failCount} 个。`,
    failCount ? "warn" : "success"
  );
}

function buildOutputFilename(shipmentId) {
  return `瀚海万博国际物流-B2B单票导入模版 - ${shipmentId}.xls`;
}

function prepareShipmentOutput(item) {
  const product = item.shipment.products[0];
  const productInfo = getProductConfig(product.sku, product.template_name);
  if (!productInfo) {
    throw new Error(`${item.fileName}: 未配置 SKU ${product.sku}`);
  }
  validateProductConfig(productInfo, product.sku);
  validateWarehouse(item.warehouse);

  const workbook = buildWorkbook(item.shipment, item.warehouse, productInfo);
  const shipmentId = item.shipment.meta["货件编号"];
  return {
    filename: buildOutputFilename(shipmentId),
    data: XLSX.write(workbook, { bookType: "biff8", type: "array" }),
  };
}

async function convertAllAndDownloadZip() {
  try {
    if (!parsedShipments.length) throw new Error("请先上传 CSV 文件。");
    syncProductConfigFromEditor();

    const validItems = parsedShipments.filter((item) => evaluateShipment(item).ok);
    if (validItems.length !== parsedShipments.length) {
      throw new Error("仍有文件未通过校验，请根据列表中的状态提示补全配置。");
    }

    const zip = new JSZip();
    validItems.forEach((item) => {
      const output = prepareShipmentOutput(item);
      zip.file(output.filename, output.data);
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `瀚海万博-B2B批量导入-${stamp}.zip`;
    link.click();
    URL.revokeObjectURL(url);

    showStatus(`已生成 ZIP，共 ${validItems.length} 个 XLS 文件。`, "success");
  } catch (error) {
    showStatus(error.message, "error");
  }
}

function previewAll() {
  try {
    if (!parsedShipments.length) throw new Error("请先上传 CSV 文件。");
    syncProductConfigFromEditor();

    const previewData = parsedShipments.map((item) => {
      const product = item.shipment?.products?.[0];
      const status = evaluateShipment(item);
      if (!status.ok) {
        return {
          file: item.fileName,
          shipment_id: item.shipment?.meta?.["货件编号"] || null,
          status: status.message,
        };
      }

      const productInfo = getProductConfig(product.sku, product.template_name);
      return {
        file: item.fileName,
        shipment_id: item.shipment.meta["货件编号"],
        warehouse: item.warehouse,
        product_declaration: productInfo,
        boxes: product.box_ids.map((boxId) => ({
          box_id: boxId,
          weight_kg: lbsToKg(product.weight_lb),
          size_cm: `${inchToCm(product.length_in)} x ${inchToCm(product.width_in)} x ${inchToCm(product.height_in)}`,
          qty: product.qty_per_box,
          asin: product.asin,
          fnsku: product.fnsku,
          sku: product.sku,
        })),
        status: "可转换",
      };
    });

    els.preview.classList.remove("hidden");
    els.preview.textContent = JSON.stringify(previewData, null, 2);
    showStatus("已生成全部货件预览。", "success");
  } catch (error) {
    els.preview.classList.add("hidden");
    showStatus(error.message, "error");
  }
}

function clearFiles() {
  parsedShipments = [];
  refreshUi();
  els.preview.classList.add("hidden");
  els.csvInput.value = "";
  showStatus("已清空文件列表。", "");
}

function addProduct() {
  const sku = `NEW-SKU-${Date.now()}`;
  productConfig[sku] = {
    sku,
    template_name: "",
    electric: "否",
    en_name: "",
    cn_name: "",
    declare_price: "",
    material: "",
    hs_code: "",
    usage: "",
    brand: "",
    model: "",
  };
  saveProductConfig();
  refreshUi();
}

function exportConfig() {
  syncProductConfigFromEditor();
  const blob = new Blob([JSON.stringify(productConfig, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "product_config.json";
  link.click();
  URL.revokeObjectURL(url);
}

function importConfig(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(String(reader.result));
      productConfig = { ...structuredClone(DEFAULT_PRODUCTS), ...imported };
      saveProductConfig();
      refreshUi();
      showStatus("产品配置导入成功。", "success");
    } catch {
      showStatus("配置文件格式无效。", "error");
    }
  };
  reader.readAsText(file, "UTF-8");
}

els.csvInput.addEventListener("change", (event) => {
  const files = event.target.files;
  if (files?.length) handleCsvFiles(files);
});

els.csvDropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  els.csvDropzone.classList.add("dragover");
});

els.csvDropzone.addEventListener("dragleave", () => {
  els.csvDropzone.classList.remove("dragover");
});

els.csvDropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  els.csvDropzone.classList.remove("dragover");
  const files = event.dataTransfer.files;
  if (files?.length) handleCsvFiles(files);
});

els.convertBtn.addEventListener("click", convertAllAndDownloadZip);
els.previewBtn.addEventListener("click", previewAll);
els.clearFilesBtn.addEventListener("click", clearFiles);
els.addProductBtn.addEventListener("click", addProduct);
els.exportConfigBtn.addEventListener("click", exportConfig);
els.importConfigInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) importConfig(file);
});

renderProductEditor();

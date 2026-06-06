const STORAGE_KEY = "ops-center-fba-hanhai-product-config-v1";
const STORAGE_KEY_DB = "ops-center-fba-hanhai-sku-db-v1";
const STORAGE_KEY_DB_META = "ops-center-fba-hanhai-sku-db-meta-v1";
const GIST_SKU_DB_FILE = "lingxing-sku-db.json";
const GIST_API = "https://api.github.com/gists";
const CLOUD_SNAPSHOT_URLS = [
  "/docs/data/shared-lingxing-sku-db.json",
  "../../docs/data/shared-lingxing-sku-db.json",
  "../../../docs/data/shared-lingxing-sku-db.json",
];

/** 保存到 SKU 库时持久化的字段 */
const DB_PERSIST_FIELDS = [
  "template_name",
  "electric",
  "en_name",
  "cn_name",
  "declare_price",
  "material",
  "hs_code",
  "usage",
  "brand",
  "model",
];

/** 须手填后点「保存到 SKU 库」才会入库、下次自动匹配的字段 */
const MANUAL_SKU_DB_FIELDS = ["declare_price", "material", "hs_code", "usage"];

/** 表头别名 → 标准字段（瀚海模版 + 领星产品导出） */
const DB_COLUMN_ALIASES = {
  sku: [
    "sku",
    "seller sku",
    "seller-sku",
    "msku",
    "产品sku",
    "sku码",
    "sku编码",
    "商品sku",
    "本地sku",
  ],
  template_name: ["template_name", "template", "原厂包装模板", "包装模板", "包装"],
  electric: ["electric", "带电", "是否带电", "带电池"],
  en_name: [
    "en_name",
    "english name",
    "英文品名",
    "产品英文品名",
    "英文名称",
    "品名英文",
    "英文报关名",
    "英文申报名",
    "报关英文名",
  ],
  cn_name: [
    "cn_name",
    "chinese name",
    "中文品名",
    "产品中文品名",
    "中文名称",
    "品名中文",
    "中文报关名",
    "中文申报名",
    "报关中文名",
  ],
  declare_price: ["declare_price", "申报单价", "产品申报单价", "申报价格", "单价", "申报价"],
  material: ["material", "材质", "产品材质", "材料"],
  hs_code: ["hs_code", "hs code", "hscode", "海关编码", "产品海关编码", "hs编码", "税号"],
  usage: ["usage", "用途", "产品用途", "使用用途"],
  brand: ["brand", "品牌", "产品品牌", "品牌名"],
  model: ["model", "型号", "产品型号"],
};

/** 领星导出专用列（导入时合并到申报字段） */
const LINGXING_COLUMN_ALIASES = {
  product_name: ["品名", "产品名称", "产品品名"],
  material_cn: ["中文材质"],
  material_en: ["英文材质"],
  usage_cn: ["中文用途"],
  usage_en: ["英文用途"],
  clearance_price: ["清关单价"],
  customs_price: ["报关单价"],
  clearance_hs_code: ["清关hscode", "清关hs编码"],
  customs_hs_code: ["报关hscode", "报关hs编码"],
  customs_model: ["清关型号", "报关型号"],
  special_attr: ["特殊属性", "商品属性", "物流属性", "产品属性"],
};

const DB_EXPORT_HEADERS = [
  ["sku", "SKU"],
  ["template_name", "原厂包装模板"],
  ["electric", "带电"],
  ["en_name", "英文品名"],
  ["cn_name", "中文品名"],
  ["declare_price", "申报单价"],
  ["material", "材质"],
  ["hs_code", "海关编码"],
  ["usage", "用途"],
  ["brand", "品牌"],
  ["model", "型号"],
];

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
  FTW1: {
    code: "FTW1",
    addr1: "15201 Heritage Parkway 76177 - Fort Worth, TX - United States",
    city: "Fort Worth",
    state: "TX",
    zipcode: "76177",
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

/** FBA CSV 有、直接写入 XLS，不需手填 */
const FBA_FIELDS = new Set(["sku", "template_name"]);

/** 瀚海固定模版必填，FBA CSV 不提供 → 须手填并高亮 */
const OUTPUT_MANUAL_FIELDS = new Set(REQUIRED_FIELDS.map(([key]) => key));

const OPTIONAL_FIELDS = new Set(["electric", "model"]);

let parsedShipments = [];
let skuDatabase = loadSkuDatabase();
let skuDatabaseMeta = loadSkuDatabaseMeta();
let productConfig = loadProductConfigDraft();

const els = {
  csvInput: document.getElementById("csvInput"),
  csvDropzone: document.getElementById("csvDropzone"),
  batchList: document.getElementById("batchList"),
  warehouseFixPanel: document.getElementById("warehouseFixPanel"),
  productEditor: document.getElementById("productEditor"),
  convertBtn: document.getElementById("convertBtn"),
  previewBtn: document.getElementById("previewBtn"),
  clearFilesBtn: document.getElementById("clearFilesBtn"),
  status: document.getElementById("status"),
  preview: document.getElementById("preview"),
  addProductBtn: document.getElementById("addProductBtn"),
  exportConfigBtn: document.getElementById("exportConfigBtn"),
  exportConfigXlsBtn: document.getElementById("exportConfigXlsBtn"),
  exportConfigJsonBtn: document.getElementById("exportConfigJsonBtn"),
  importConfigInput: document.getElementById("importConfigInput"),
  saveBatchDbBtn: document.getElementById("saveBatchDbBtn"),
  pullCloudDbBtn: document.getElementById("pullCloudDbBtn"),
  pushCloudDbBtn: document.getElementById("pushCloudDbBtn"),
  dbStats: document.getElementById("dbStats"),
  batchMatchStats: document.getElementById("batchMatchStats"),
  configAlert: document.getElementById("configAlert"),
  exportAlert: document.getElementById("exportAlert"),
  lingxingDbSection: document.getElementById("lingxingDbSection"),
  productConfigSection: document.getElementById("productConfigSection"),
  exportSection: document.getElementById("exportSection"),
};

function loadSkuDatabase() {
  try {
    const rawDb = localStorage.getItem(STORAGE_KEY_DB);
    if (rawDb) {
      return { ...structuredClone(DEFAULT_PRODUCTS), ...JSON.parse(rawDb) };
    }
    const rawLegacy = localStorage.getItem(STORAGE_KEY);
    if (rawLegacy) {
      const migrated = { ...structuredClone(DEFAULT_PRODUCTS), ...JSON.parse(rawLegacy) };
      localStorage.setItem(STORAGE_KEY_DB, JSON.stringify(migrated));
      return migrated;
    }
    return structuredClone(DEFAULT_PRODUCTS);
  } catch {
    return structuredClone(DEFAULT_PRODUCTS);
  }
}

function saveSkuDatabase() {
  localStorage.setItem(STORAGE_KEY_DB, JSON.stringify(skuDatabase));
}

function loadSkuDatabaseMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DB_META);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSkuDatabaseMeta() {
  localStorage.setItem(STORAGE_KEY_DB_META, JSON.stringify(skuDatabaseMeta));
}

function getGistConfig() {
  try {
    if (window.__OPS_GIST__?.id) return window.__OPS_GIST__;
    if (window.parent?.__OPS_GIST__?.id) return window.parent.__OPS_GIST__;
  } catch {
    /* iframe cross-origin */
  }
  return window.__OPS_GIST__ || {};
}

function cloudGistConfigured() {
  const g = getGistConfig();
  return Boolean(g.token && g.id);
}

function gistHeaders(json = false) {
  const g = getGistConfig();
  const h = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${g.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function serializeSkuDatabaseForCloud() {
  const out = {};
  Object.values(skuDatabase).forEach((record) => {
    const cleaned = cleanDbRecordFromRow(record);
    if (!cleaned) return;
    out[cleaned.sku] = { ...cleaned };
    if (record._localSaved) out[cleaned.sku]._localSaved = record._localSaved;
  });
  return out;
}

function cloudRecordToSkuRecords(record) {
  const data = record?.data ?? record;
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data)) return data;
  return Object.entries(data)
    .map(([key, val]) => {
      if (!val || typeof val !== "object") return null;
      return { ...val, sku: val.sku || key };
    })
    .filter(Boolean);
}

async function fetchCloudSkuRecordFromGist() {
  if (!cloudGistConfigured()) return null;
  const g = getGistConfig();
  const res = await fetch(`${GIST_API}/${g.id}`, { headers: gistHeaders() });
  if (!res.ok) throw new Error(`团队库 Gist 读取失败 HTTP ${res.status}`);
  const gist = await res.json();
  const content = gist?.files?.[GIST_SKU_DB_FILE]?.content;
  if (!content) return null;
  return JSON.parse(content);
}

async function fetchCloudSkuRecordFromStatic() {
  for (const url of CLOUD_SNAPSHOT_URLS) {
    try {
      const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      /* try next path */
    }
  }
  return null;
}

async function fetchCloudSkuRecord() {
  if (cloudGistConfigured()) {
    try {
      const record = await fetchCloudSkuRecordFromGist();
      if (record) return record;
    } catch (error) {
      console.warn("[sku-db] Gist 读取失败，尝试静态快照", error);
    }
  }
  return fetchCloudSkuRecordFromStatic();
}

async function pushCloudSkuRecord(updatedBy = "FBA转换工具") {
  if (!cloudGistConfigured()) {
    throw new Error("未配置 GitHub Gist Token（需 gist-config.local.js），无法写入团队库");
  }
  const g = getGistConfig();
  const payload = {
    data: serializeSkuDatabaseForCloud(),
    updatedBy,
    updatedAt: Date.now(),
  };
  const res = await fetch(`${GIST_API}/${g.id}`, {
    method: "PATCH",
    headers: gistHeaders(true),
    body: JSON.stringify({
      files: {
        [GIST_SKU_DB_FILE]: { content: JSON.stringify(payload, null, 2) },
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`团队库保存失败 HTTP ${res.status}${detail ? `: ${detail.slice(0, 120)}` : ""}`);
  }
  skuDatabaseMeta.cloudUpdatedAt = payload.updatedAt;
  skuDatabaseMeta.cloudUpdatedBy = updatedBy;
  skuDatabaseMeta.cloudSource = "gist";
  saveSkuDatabaseMeta();
  return payload;
}

async function syncSkuDatabaseFromCloud(options = {}) {
  const record = await fetchCloudSkuRecord();
  if (!record) {
    if (!options.silent) {
      showStatus("团队库暂无数据（需配置 Gist 或等待 GitHub 部署快照）", "warn");
    }
    return { added: 0, ignored: 0, total: 0 };
  }

  const records = cloudRecordToSkuRecords(record);
  if (!records.length) {
    if (!options.silent) showStatus("团队库为空", "warn");
    return { added: 0, ignored: 0, total: 0 };
  }

  const result = mergeImportedSkuRecords(records, {
    skipExisting: true,
    source: "cloud",
    fileName: "GitHub 团队库",
  });
  skuDatabaseMeta.cloudPulledAt = Date.now();
  if (record.updatedAt) skuDatabaseMeta.cloudUpdatedAt = record.updatedAt;
  if (record.updatedBy) skuDatabaseMeta.cloudUpdatedBy = record.updatedBy;
  saveSkuDatabaseMeta();
  reapplyDatabaseToBatch();
  refreshUi();

  if (!options.silent) {
    showStatus(
      `已从 GitHub 团队库更新：新增 ${result.added}，已有 SKU 跳过 ${result.ignored}（共 ${result.total} 条）`,
      "success"
    );
  }
  return result;
}

async function syncSkuDatabaseToCloud(options = {}) {
  syncProductConfigFromEditor();
  const payload = await pushCloudSkuRecord();
  const count = Object.keys(payload.data || {}).length;
  if (!options.silent) {
    showStatus(`已同步 ${count} 条 SKU 到 GitHub 团队库，全员可调用`, "success");
  }
  refreshUi();
  return payload;
}

async function maybePushCloudAfterLocalSave() {
  if (!cloudGistConfigured()) return;
  try {
    await syncSkuDatabaseToCloud({ silent: true });
  } catch (error) {
    console.warn("[sku-db] 自动同步团队库失败", error);
  }
}

async function initCloudSkuDatabase() {
  try {
    await syncSkuDatabaseFromCloud({ silent: true });
  } catch (error) {
    console.warn("[sku-db] 启动拉取团队库失败", error);
  }
}

function getImportColumnAliases() {
  const merged = {};
  Object.entries(DB_COLUMN_ALIASES).forEach(([field, aliases]) => {
    merged[field] = [...aliases];
  });
  Object.entries(LINGXING_COLUMN_ALIASES).forEach(([field, aliases]) => {
    merged[field] = [...(merged[field] || []), ...aliases];
  });
  return merged;
}

function lookupSkuDatabase(sku) {
  const key = cleanCellValue(sku);
  if (!key) return null;
  if (skuDatabase[key]) return skuDatabase[key];
  return null;
}

function combineBilingual(cn, en) {
  const c = cleanCellValue(cn);
  const e = cleanCellValue(en);
  if (c && e && c !== e) return `${c}/${e}`;
  return c || e;
}

function electricFromSpecialAttr(value) {
  const v = cleanCellValue(value).toLowerCase();
  if (!v) return "否";
  if (/带电|电池|battery|electric|磁|liquid|液体|粉末|powder/.test(v)) return "是";
  return "否";
}

function normalizeImportRow(raw) {
  let electric = raw.electric;
  if (!electric && raw.special_attr) {
    electric = electricFromSpecialAttr(raw.special_attr);
  }

  return cleanDbRecordFromRow({
    sku: raw.sku,
    template_name: raw.template_name,
    electric,
    en_name: raw.en_name,
    cn_name: raw.cn_name || raw.product_name,
    declare_price: raw.declare_price || raw.clearance_price || raw.customs_price,
    material: raw.material || combineBilingual(raw.material_cn, raw.material_en),
    hs_code: raw.hs_code || raw.clearance_hs_code || raw.customs_hs_code,
    usage: raw.usage || combineBilingual(raw.usage_cn, raw.usage_en),
    brand: raw.brand,
    model: raw.model || raw.customs_model,
  });
}

function detectLingxingFormat(headerRow) {
  const norms = new Set(headerRow.map((cell) => normalizeHeaderKey(cell)).filter(Boolean));
  const markers = [
    "品名",
    "中文报关名",
    "英文报关名",
    "清关hscode",
    "报关hscode",
    "中文材质",
    "特殊属性",
    "清关单价",
  ];
  const hits = markers.filter((marker) => norms.has(normalizeHeaderKey(marker))).length;
  return hits >= 2;
}

function mergeDbIntoConfigIfEmpty(config, sku) {
  applyLingxingDbToConfig(config, sku, null);
}

/** 英文品名压缩为 3–5 个单词，便于报关 */
function shortenEnName(value, maxWords = 5, minWords = 3) {
  const cleaned = cleanCellValue(value);
  if (!cleaned) return "";

  const words = cleaned
    .replace(/[,，;；|/\\]+/g, " ")
    .replace(/[^\w\s\-'.]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0);

  if (!words.length) return cleaned.slice(0, 40);
  if (words.length <= maxWords) return words.join(" ");

  const trimmed = words.slice(0, maxWords).join(" ");
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount >= minWords) return trimmed;
  return words.slice(0, minWords).join(" ");
}

function finalizeEnName(config) {
  if (!config || config._en_name_manual) return;
  const raw = String(config.en_name || "").trim();
  if (!raw) return;
  const optimized = shortenEnName(raw);
  if (optimized) config.en_name = optimized;
}

/** 领星库与 FBA 重合字段：领星优先；SKU / 包装模板仍来自 FBA */
function applyLingxingDbToConfig(config, sku, product) {
  if (!config) return false;

  const db = lookupSkuDatabase(sku);
  config._from_lingxing = config._from_lingxing || {};

  if (db) {
    config._localSaved = { ...(db._localSaved || {}) };
    DB_PERSIST_FIELDS.forEach((field) => {
      const dbVal = String(db[field] ?? "").trim();
      if (!dbVal) return;
      config[field] = dbVal;
      config._from_lingxing[field] = true;
      if (field === "en_name") {
        config._en_name_from_fba = false;
        config._en_name_from_lingxing = true;
      }
    });
  }

  if (product) {
    config.sku = product.sku || config.sku;
    config.template_name = product.template_name || config.template_name || "";
    applyFbaAutoFields(config, product);
  }

  finalizeEnName(config);
  finalizeBrand(config);
  return Boolean(db);
}

function isFieldFromLingxing(config, field) {
  return Boolean(config?._from_lingxing?.[field]);
}

function getBatchLingxingMatchSummary() {
  const requiredSkus = getRequiredSkus();
  if (!requiredSkus.size) return null;

  let matched = 0;
  const unmatched = [];
  requiredSkus.forEach((sku) => {
    if (lookupSkuDatabase(sku)) {
      matched += 1;
    } else {
      unmatched.push(sku);
    }
  });

  return {
    total: requiredSkus.size,
    matched,
    unmatched,
  };
}

function loadProductConfigDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProductConfigDraft() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(productConfig));
}

function buildConfigFromDatabaseAndFba(product) {
  const config = {
    sku: product.sku,
    template_name: product.template_name || "",
    electric: "否",
    en_name: "",
    cn_name: "",
    declare_price: "",
    material: "",
    hs_code: "",
    usage: "",
    brand: "non",
    model: "",
    _from_lingxing: {},
  };
  applyLingxingDbToConfig(config, product.sku, product);
  return config;
}

function isFieldFromDb(sku, field, value, config) {
  if (config && isFieldFromLocalSaved(config, field)) return true;
  if (config && isFieldFromLingxing(config, field)) return true;
  const db = lookupSkuDatabase(sku);
  if (!db) return false;
  const dbVal = String(db[field] ?? "").trim();
  const curVal = String(value ?? "").trim();
  if (!dbVal || !curVal) return false;
  if (field === "en_name") {
    return curVal === dbVal || curVal === shortenEnName(dbVal);
  }
  return dbVal === curVal;
}

function isSkuInDatabase(sku) {
  return Boolean(lookupSkuDatabase(sku));
}

function isFieldFromLocalSaved(config, field) {
  if (!config) return false;
  if (config._localSaved?.[field]) return true;
  const db = lookupSkuDatabase(config.sku);
  return Boolean(db?._localSaved?.[field]);
}

function formatSavedFieldLabels(fields) {
  const labels = {
    declare_price: "申报单价",
    material: "材质",
    hs_code: "海关编码",
    usage: "用途",
    en_name: "英文品名",
    cn_name: "中文品名",
    brand: "品牌",
    model: "型号",
    electric: "带电",
  };
  return fields.map((f) => labels[f] || f).join("、");
}

function collectSavedDbFields(cleaned) {
  return DB_PERSIST_FIELDS.filter((field) => String(cleaned[field] ?? "").trim());
}

function saveSkuToDatabase(sku) {
  const config = productConfig[sku];
  if (!config) return { ok: false, savedFields: [] };

  const cleaned = cleanDbRecordFromRow(config);
  if (!cleaned) return { ok: false, savedFields: [] };

  const existing = skuDatabase[sku] || {};
  const localSaved = { ...(existing._localSaved || {}) };
  MANUAL_SKU_DB_FIELDS.forEach((field) => {
    if (String(cleaned[field] ?? "").trim()) {
      localSaved[field] = true;
    }
  });

  skuDatabase[sku] = {
    ...existing,
    ...cleaned,
    sku: cleaned.sku,
    _localSaved: localSaved,
    _updatedAt: new Date().toISOString(),
  };
  saveSkuDatabase();

  config._localSaved = { ...localSaved };
  config._from_lingxing = config._from_lingxing || {};
  Object.keys(localSaved).forEach((field) => {
    if (localSaved[field]) config._from_lingxing[field] = true;
  });

  saveProductConfigDraft();
  const savedFields = collectSavedDbFields(cleaned);
  maybePushCloudAfterLocalSave();
  return { ok: true, savedFields, localSavedFields: MANUAL_SKU_DB_FIELDS.filter((f) => localSaved[f]) };
}

function saveBatchToDatabase() {
  syncProductConfigFromEditor();
  const requiredSkus = getRequiredSkus();
  let count = 0;
  const allLocalFields = new Set();
  requiredSkus.forEach((sku) => {
    const result = saveSkuToDatabase(sku);
    if (result.ok) {
      count += 1;
      result.localSavedFields?.forEach((f) => allLocalFields.add(f));
    }
  });
  return { count, localSavedLabels: formatSavedFieldLabels([...allLocalFields]) };
}

function reapplyDatabaseToBatch() {
  forEachBatchProduct((product) => {
    if (!product.sku) return;

    if (!productConfig[product.sku]) {
      productConfig[product.sku] = buildConfigFromDatabaseAndFba(product);
      return;
    }

    applyLingxingDbToConfig(productConfig[product.sku], product.sku, product);
  });
  saveProductConfigDraft();
}

function renderDbStats() {
  if (!els.dbStats) return;
  const count = Object.keys(skuDatabase).length;
  const sourceLabel = skuDatabaseMeta.source === "lingxing" ? "领星产品导出" : "SKU 库";
  const importedAt = skuDatabaseMeta.importedAt
    ? new Date(skuDatabaseMeta.importedAt).toLocaleString("zh-CN")
    : null;
  const importHint = importedAt
    ? `上次导入：${importedAt}（${sourceLabel}，${skuDatabaseMeta.fileName || "文件"}）。已自动保存在浏览器，刷新后仍可用。`
    : "尚未导入领星 SKU 库。请从领星 ERP「产品管理 → 导出」下载 CSV / XLS 后导入，导入后自动保存。";
  const reimportHint =
    count > 0 ? " 再次导入时相同 SKU 自动跳过，仅新增库中没有的 SKU。" : "";
  const cloudCount = skuDatabaseMeta.cloudUpdatedAt
    ? ` GitHub 团队库：${skuDatabaseMeta.cloudUpdatedBy || "已同步"} · ${new Date(skuDatabaseMeta.cloudUpdatedAt).toLocaleString("zh-CN")}。`
    : cloudGistConfigured()
      ? " 已连接 GitHub Gist，可同步团队库。"
      : " 只读快照：docs/data/shared-lingxing-sku-db.json（部署后可用）。";
  els.dbStats.textContent = `领星 SKU 库共 ${count} 条。${importHint}${reimportHint}${cloudCount}`;
}

function renderBatchMatchStats() {
  if (!els.batchMatchStats) return;
  const summary = getBatchLingxingMatchSummary();
  if (!summary) {
    els.batchMatchStats.classList.add("hidden");
    els.batchMatchStats.textContent = "";
    return;
  }

  els.batchMatchStats.classList.remove("hidden");
  if (summary.matched === summary.total) {
    els.batchMatchStats.textContent = `本批 FBA 货件 ${summary.total} 个 SKU，已全部与领星库匹配。`;
    els.batchMatchStats.className = "hint batch-match-stats match-ok";
    return;
  }

  const unmatchedText = summary.unmatched.slice(0, 8).join("、");
  const suffix = summary.unmatched.length > 8 ? "…" : "";
  els.batchMatchStats.textContent = `本批 ${summary.total} 个 SKU，领星库已匹配 ${summary.matched} 个；未匹配：${unmatchedText}${suffix}`;
  els.batchMatchStats.className = "hint batch-match-stats match-warn";
}

function normalizeHeaderKey(text) {
  return String(text ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/\*/g, "")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function cleanCellValue(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/^\uFEFF/, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeElectric(value) {
  const v = cleanCellValue(value).toLowerCase();
  if (!v) return "否";
  if (["是", "yes", "y", "true", "1", "带电"].includes(v)) return "是";
  if (["否", "no", "n", "false", "0", "不带电"].includes(v)) return "否";
  return v.includes("是") ? "是" : "否";
}

function normalizeBrand(value) {
  return cleanCellValue(value) || "non";
}

function finalizeBrand(config) {
  if (!config) return;
  config.brand = normalizeBrand(config.brand);
}

function cleanDeclarePrice(value) {
  const raw = cleanCellValue(value).replace(/[,，￥$¥\s]/g, "");
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? String(n) : cleanCellValue(value);
}

function cleanDbRecordFromRow(row) {
  if (!row || typeof row !== "object") return null;
  const sku = cleanCellValue(row.sku);
  if (!sku) return null;

  const record = { sku };
  record.template_name = cleanCellValue(row.template_name);
  record.electric = normalizeElectric(row.electric);
  record.en_name = cleanCellValue(row.en_name);
  record.cn_name = cleanCellValue(row.cn_name);
  record.declare_price = cleanDeclarePrice(row.declare_price);
  record.material = cleanCellValue(row.material);
  record.hs_code = cleanCellValue(row.hs_code).replace(/\s/g, "");
  record.usage = cleanCellValue(row.usage);
  record.brand = normalizeBrand(row.brand);
  record.model = cleanCellValue(row.model);
  return record;
}

function mapColumnsFromHeaderRow(headerRow) {
  const colMap = {};
  const aliasLookup = new Map();
  Object.entries(getImportColumnAliases()).forEach(([field, aliases]) => {
    aliases.forEach((alias) => {
      aliasLookup.set(normalizeHeaderKey(alias), field);
    });
  });

  headerRow.forEach((cell, idx) => {
    const norm = normalizeHeaderKey(cell);
    if (!norm) return;
    const field = aliasLookup.get(norm);
    if (field && colMap[field] === undefined) {
      colMap[field] = idx;
    }
  });
  return colMap;
}

function findHeaderRowMapping(rows) {
  const maxScan = Math.min(rows.length, 25);
  for (let r = 0; r < maxScan; r += 1) {
    const row = rows[r];
    if (!row?.length) continue;
    const colMap = mapColumnsFromHeaderRow(row);
    if (colMap.sku !== undefined) {
      return { headerRowIndex: r, colMap };
    }
  }
  return null;
}

function sheetRowsToRecords(rows) {
  const headerInfo = findHeaderRowMapping(rows);
  if (!headerInfo) {
    throw new Error("未识别表头，请确保文件含 SKU 列（领星导出通常含 SKU、品名、中文报关名等）");
  }

  const { headerRowIndex, colMap } = headerInfo;
  const isLingxing = detectLingxingFormat(rows[headerRowIndex]);
  const records = [];
  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row?.length || row.every((cell) => !cleanCellValue(cell))) continue;

    const raw = {};
    Object.entries(colMap).forEach(([field, colIdx]) => {
      raw[field] = row[colIdx];
    });
    const cleaned = normalizeImportRow(raw);
    if (cleaned) records.push(cleaned);
  }
  return { records, isLingxing };
}

function parseDelimitedText(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || "";
  if (firstLine.includes("\t") && !firstLine.includes(",")) {
    return text
      .split(/\r?\n/)
      .map((line) => line.split("\t").map((cell) => cell.replace(/^\uFEFF/, "").trim()))
      .filter((row) => row.some((cell) => cell !== ""));
  }
  return parseCsvText(text);
}

function attachLocalSavedMeta(cleaned, sourceRow) {
  if (!cleaned) return null;
  if (!sourceRow?._localSaved) return cleaned;
  return { ...cleaned, _localSaved: { ...sourceRow._localSaved } };
}

function parseSkuDatabaseJson(text) {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) {
    return parsed
      .map((row) => attachLocalSavedMeta(normalizeImportRow(row), row))
      .filter(Boolean);
  }
  return Object.entries(parsed)
    .map(([key, val]) => {
      if (!val || typeof val !== "object") return null;
      return attachLocalSavedMeta(normalizeImportRow({ ...val, sku: val.sku || key }), val);
    })
    .filter(Boolean);
}

function parseSkuDatabaseCsv(text) {
  const rows = parseDelimitedText(text);
  return sheetRowsToRecords(rows);
}

function isLingxingAuxSheet(sheetName) {
  return /基础信息|字典|包含单品|产品标签|产品箱规|供应商报价|更多产品箱规|更多供应商/i.test(sheetName);
}

function parseSkuDatabaseXls(buffer) {
  const workbook = XLSX.read(buffer, { type: "array" });
  let best = { records: [], isLingxing: false, sheetName: "" };

  workbook.SheetNames.forEach((sheetName) => {
    if (isLingxingAuxSheet(sheetName)) return;
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    try {
      const { records, isLingxing } = sheetRowsToRecords(rows);
      const score = records.length + (isLingxing ? 10000 : 0);
      if (score > best.records.length + (best.isLingxing ? 10000 : 0)) {
        best = { records, isLingxing, sheetName };
      }
    } catch {
      // try next sheet
    }
  });

  if (!best.records.length) {
    throw new Error("Excel 中未找到有效 SKU 数据表，请确认含 SKU 列的产品列表");
  }
  return best;
}

function mergeImportedSkuRecords(records, meta = {}) {
  const skipExisting = meta.skipExisting !== false;
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let ignored = 0;

  records.forEach((row) => {
    const cleaned = normalizeImportRow(row);
    if (!cleaned?.sku) {
      skipped += 1;
      return;
    }

    const sku = cleaned.sku;
    const existing = skuDatabase[sku];
    if (existing) {
      if (skipExisting) {
        ignored += 1;
        return;
      }

      const merged = { ...existing, sku };
      const localSaved = { ...(existing._localSaved || {}) };
      let changed = false;
      DB_PERSIST_FIELDS.forEach((field) => {
        const val = cleaned[field];
        if (!val) return;
        if (localSaved[field]) return;
        if (merged[field] !== val) {
          merged[field] = val;
          changed = true;
        }
      });
      merged._localSaved = localSaved;
      skuDatabase[sku] = merged;
      if (changed) updated += 1;
      return;
    }

    skuDatabase[sku] = {
      ...(attachLocalSavedMeta(cleaned, row) || cleaned),
      _fromLingxing: meta.source === "lingxing",
    };
    added += 1;
  });

  saveSkuDatabase();
  skuDatabaseMeta = {
    ...skuDatabaseMeta,
    ...meta,
    importedAt: new Date().toISOString(),
    totalSkus: Object.keys(skuDatabase).length,
    persisted: true,
  };
  saveSkuDatabaseMeta();
  return { added, updated, skipped, ignored, total: records.length };
}

function buildSkuDatabaseExportRows() {
  const headerRow = DB_EXPORT_HEADERS.map(([, label]) => label);
  const fieldKeys = DB_EXPORT_HEADERS.map(([key]) => key);
  const dataRows = Object.values(skuDatabase)
    .map((record) => cleanDbRecordFromRow(record))
    .filter(Boolean)
    .sort((a, b) => a.sku.localeCompare(b.sku, "zh-CN"))
    .map((record) => fieldKeys.map((key) => record[key] ?? ""));
  return [headerRow, ...dataRows];
}

function escapeCsvCell(value) {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`读取失败: ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
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

function cellText(row, index) {
  return String(row[index] ?? "").replaceAll('"', "").trim();
}

function isSingleBoxCsvFormat(rows, headerIndex) {
  const header = rows[headerIndex] || [];
  return header.some((cell) => {
    const text = String(cell ?? "");
    return text.includes("箱子 1 的商品数量") || text.includes("箱子1");
  });
}

function parseBoxFooterRows(rows, startIndex) {
  const box = { box_ids: [], weight_lb: "", length_in: "", width_in: "", height_in: "" };
  for (let i = startIndex; i < rows.length; i += 1) {
    const label = cellText(rows[i], 6) || cellText(rows[i], 0);
    const val = cellText(rows[i], 7) || cellText(rows[i], 1);
    if (!label) continue;
    if (label === "箱号") {
      box.box_ids = val.split(/[,，]/).map((id) => id.trim()).filter(Boolean).sort();
    } else if (label.includes("包装箱重量")) box.weight_lb = val;
    else if (label.includes("包装箱长度")) box.length_in = val;
    else if (label.includes("包装箱宽度")) box.width_in = val;
    else if (label.includes("包装箱高度")) box.height_in = val;
  }
  return box;
}

function parseSingleBoxProducts(rows, headerIndex) {
  const products = [];
  let footerStart = rows.length;

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const label = cellText(row, 6);
    if (label === "箱号" || label.startsWith("包装箱")) {
      footerStart = i;
      break;
    }
    const sku = cellText(row, 0);
    const asin = cellText(row, 2);
    if (sku && sku !== "SKU" && asin) {
      products.push({
        sku,
        title: cellText(row, 1),
        asin,
        fnsku: cellText(row, 3),
        template_name: cellText(row, 5),
        total_qty: Number(cellText(row, 6)) || 0,
        qty_in_box: Number(cellText(row, 7)) || Number(cellText(row, 6)) || 0,
      });
    }
  }

  const boxDetails = parseBoxFooterRows(rows, footerStart);
  return products.map((product) => ({
    ...product,
    weight_lb: boxDetails.weight_lb,
    length_in: boxDetails.length_in,
    width_in: boxDetails.width_in,
    height_in: boxDetails.height_in,
    qty_per_box: product.qty_in_box,
    box_count: 1,
    box_ids: boxDetails.box_ids,
  }));
}

function parseCasePackProducts(rows, headerIndex) {
  const products = [];
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row[0] && row.length >= 15) products.push(row);
  }
  return products;
}

function parseFbaShipment(rows) {
  const meta = {};
  let headerIndex = -1;

  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i][0] === "SKU") {
      headerIndex = i;
      break;
    }
  }

  for (const row of rows) {
    if (row.length >= 2 && row[0] && row[1] && row[0] !== "SKU" && !row[0].startsWith("原厂包装发货")) {
      const key = cellText(row, 0);
      if (!key.includes("SKU")) {
        meta[key] = cellText(row, 1);
      }
    }
  }

  if (headerIndex < 0) {
    throw new Error("无法识别 SKU 表头");
  }

  const singleBox = isSingleBoxCsvFormat(rows, headerIndex);
  const rawProducts = singleBox
    ? parseSingleBoxProducts(rows, headerIndex)
    : parseCasePackProducts(rows, headerIndex);

  if (!meta["货件编号"]) {
    throw new Error("无法识别货件编号");
  }
  if (!rawProducts.length) {
    throw new Error("未找到 SKU 产品行");
  }

  return {
    meta,
    products: rawProducts.map((row) => normalizeProductRow(row, singleBox ? "single_box" : "case_pack")),
  };
}

function normalizeProductRow(row, format = "case_pack") {
  if (format === "single_box" || (row && row.sku && row.asin && !Array.isArray(row))) {
    return {
      sku: row.sku,
      title: row.title || "",
      asin: row.asin,
      fnsku: row.fnsku || "",
      template_name: row.template_name || "",
      weight_lb: row.weight_lb,
      length_in: row.length_in,
      width_in: row.width_in,
      height_in: row.height_in,
      qty_per_box: Number(row.qty_per_box ?? row.qty_in_box) || 0,
      box_count: Number(row.box_count) || 1,
      total_qty: Number(row.total_qty) || 0,
      box_ids: Array.isArray(row.box_ids) ? row.box_ids : [],
    };
  }

  return {
    sku: cellText(row, 0),
    title: cellText(row, 1),
    asin: cellText(row, 2),
    fnsku: cellText(row, 3),
    template_name: cellText(row, 4),
    weight_lb: cellText(row, 7),
    length_in: cellText(row, 8),
    width_in: cellText(row, 9),
    height_in: cellText(row, 10),
    qty_per_box: Number(cellText(row, 11)),
    box_count: Number(cellText(row, 12)),
    total_qty: Number(cellText(row, 13)),
    box_ids: cellText(row, 14)
      .split(/[,，]/)
      .map((id) => id.trim())
      .filter(Boolean)
      .sort(),
  };
}

function detectWarehouse(shipmentName, deliveryAddress) {
  const name = shipmentName || "";
  const upperName = name.toUpperCase();
  const address = deliveryAddress || "";

  for (const code of Object.keys(WAREHOUSE_MAP)) {
    if (upperName.includes(code)) return { ...WAREHOUSE_MAP[code] };
  }

  const suffixMatch = name.match(/-([A-Z0-9]{4})\s*$/i);
  if (suffixMatch) {
    const code = suffixMatch[1].toUpperCase();
    if (WAREHOUSE_MAP[code]) return { ...WAREHOUSE_MAP[code] };
  }

  const city = address.split(",")[0].trim().toUpperCase();
  const cityAliases = { DALLAS: "FTW1" };
  if (cityAliases[city] && WAREHOUSE_MAP[cityAliases[city]]) {
    return { ...WAREHOUSE_MAP[cityAliases[city]] };
  }

  const match = Object.values(WAREHOUSE_MAP).find((item) => item.city.toUpperCase() === city);
  if (match) return { ...match };

  return {
    code: "",
    addr1: "",
    city: address.split(",")[0]?.trim() || "",
    state: address.split(",")[1]?.trim() || "",
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
  const issues = getWarehouseIssues(warehouse);
  if (issues.length) {
    throw new Error(`仓库信息不完整：${issues.join("、")}`);
  }
}

function createBlankSheet(boxRowCount = 0) {
  const sheet = [];
  const rowCount = Math.max(54, 18 + boxRowCount + 2);
  for (let r = 0; r < rowCount; r += 1) sheet[r] = Array(21).fill("");

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
    "",
    "",
    "",
  ];
  headers.forEach((label, index) => set(17, index, label));

  return sheet;
}

function buildWorkbook(shipment, warehouse) {
  const products = shipment.products || [];
  const totalBoxRows = products.reduce((sum, p) => sum + (p.box_ids?.length || 0), 0);
  const sheet = createBlankSheet(totalBoxRows);
  const set = (r, c, value) => {
    sheet[r][c] = value;
  };

  let electric = "否";
  let rowIndex = 0;

  products.forEach((product) => {
    const productInfo = getProductConfig(product.sku, product.template_name);
    if (!productInfo) return;

    if (productInfo.electric === "是") electric = "是";

    const weightKg = lbsToKg(product.weight_lb);
    const lengthCm = inchToCm(product.length_in);
    const widthCm = inchToCm(product.width_in);
    const heightCm = inchToCm(product.height_in);

    product.box_ids.forEach((boxId) => {
      const row = 18 + rowIndex;
      rowIndex += 1;
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
    });
  });

  set(0, 5, electric);
  set(2, 1, warehouse.code);
  set(5, 1, warehouse.addr1);
  set(8, 1, warehouse.city);
  set(9, 1, warehouse.state);
  set(10, 1, warehouse.zipcode);

  const uniqueBoxIds = new Set();
  products.forEach((p) => p.box_ids.forEach((id) => uniqueBoxIds.add(id)));
  set(15, 1, uniqueBoxIds.size || rowIndex);

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(sheet);
  XLSX.utils.book_append_sheet(workbook, worksheet, "模版");
  return workbook;
}

function forEachBatchProduct(callback) {
  parsedShipments.forEach((item) => {
    (item.shipment?.products || []).forEach((product) => {
      callback(product, item);
    });
  });
}

function findBatchProduct(sku) {
  let found = null;
  forEachBatchProduct((product) => {
    if (product.sku === sku) found = product;
  });
  return found;
}

function summarizeShipment(item) {
  const products = item.shipment?.products || [];
  const skus = [...new Set(products.map((p) => p.sku).filter(Boolean))];
  const totalBoxes = products.reduce((sum, p) => sum + (p.box_ids?.length || Number(p.box_count) || 0), 0);
  const totalQty = products.reduce((sum, p) => sum + (Number(p.total_qty) || 0), 0);
  return { skus, totalBoxes, totalQty };
}

function getRequiredSkus() {
  const skus = new Set();
  forEachBatchProduct((product) => {
    if (product.sku) skus.add(product.sku);
  });
  return skus;
}

/** FBA 商品名称 → 仅当领星库未提供时作为英文品名兜底，并压缩为 3–5 词 */
function applyFbaAutoFields(config, product) {
  if (!config || !product) return;
  config.template_name = product.template_name || config.template_name;
  if (config._en_name_manual || config._en_name_from_lingxing) return;
  const title = String(product.title || "").trim();
  if (!title) return;
  if (String(config.en_name || "").trim()) return;
  config.en_name = shortenEnName(title);
  config._en_name_from_fba = true;
}

function isEnNameFromFba(config, product) {
  if (!config || !product) return false;
  if (config._en_name_manual || config._en_name_from_lingxing || isFieldFromLingxing(config, "en_name")) {
    return false;
  }
  if (config._en_name_from_fba) return Boolean(String(config.en_name || "").trim());
  const title = String(product.title || "").trim();
  if (!title) return false;
  return String(config.en_name || "").trim() === shortenEnName(title);
}

function ensureProductStubsForBatch() {
  forEachBatchProduct((product) => {
    if (!product.sku) return;

    if (productConfig[product.sku]) {
      applyLingxingDbToConfig(productConfig[product.sku], product.sku, product);
      return;
    }

    productConfig[product.sku] = buildConfigFromDatabaseAndFba(product);
  });
  saveProductConfigDraft();
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

function getFieldVisualState(field, value, isBatchRequired, fromFbaDerived = false, fromDb = false) {
  const filled = String(value ?? "").trim().length > 0;

  if (fromDb && filled) return "field-from-db";

  if (FBA_FIELDS.has(field) || fromFbaDerived) {
    if (fromFbaDerived && OUTPUT_MANUAL_FIELDS.has(field)) {
      return filled ? "field-from-fba" : "field-missing";
    }
    return filled ? "field-from-fba" : "field-fba-missing";
  }

  if (OUTPUT_MANUAL_FIELDS.has(field)) {
    if (!isBatchRequired) return filled ? "field-ok" : "field-idle";
    return filled ? "field-ok" : "field-missing";
  }

  if (OPTIONAL_FIELDS.has(field)) {
    return filled ? "field-ok" : "field-idle";
  }

  return filled ? "field-ok" : "field-idle";
}

function getWarehouseIssues(warehouse) {
  if (!warehouse) return ["仓库信息"];
  const issues = [];
  if (!warehouse.code?.trim()) issues.push("仓库代码");
  if (!warehouse.addr1?.trim()) issues.push("收件地址");
  if (!warehouse.city?.trim()) issues.push("城市");
  if (!warehouse.zipcode?.trim()) issues.push("邮编");
  return issues;
}

function syncProductFromFba(sku) {
  const batchProduct = findBatchProduct(sku);
  if (!batchProduct || !productConfig[sku]) return;
  applyLingxingDbToConfig(productConfig[sku], sku, batchProduct);
}

function formatFbaContext(product) {
  if (!product) return "";
  const parts = [
    product.title && `标题 ${product.title.length > 80 ? `${product.title.slice(0, 80)}…` : product.title}`,
    product.asin && `ASIN ${product.asin}`,
    product.fnsku && `FNSKU ${product.fnsku}`,
    product.box_count && `${product.box_count} 箱`,
    product.total_qty && `${product.total_qty} 件`,
    product.weight_lb && `${product.weight_lb} lb`,
    product.length_in && `${product.length_in}×${product.width_in}×${product.height_in} in`,
  ].filter(Boolean);
  return parts.join(" · ");
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
    const batchProduct = findBatchProduct(sku);
    const templateName = batchProduct?.template_name || "";
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
    <strong>本批还有 ${pending} 个 SKU 的瀚海模版字段没配完，暂时不能导出</strong>
    已配好 ${summary.ready} / ${summary.total}。请补全下面<span class="req-star">标红</span>的手填项：
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
    const products = item.shipment?.products || [];
    if (!products.length) {
      throw new Error("未找到 SKU 产品行");
    }

    validateWarehouse(item.warehouse);

    for (const product of products) {
      const productInfo = getProductConfig(product.sku, product.template_name);
      if (!productInfo) {
        throw new Error(`未配置 SKU ${product.sku}`);
      }
      validateProductConfig(productInfo, product.sku);
    }

    return { ok: true, message: "可转换" };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

function renderProductEditor() {
  const requiredSkus = getRequiredSkus();

  if (!parsedShipments.length || !requiredSkus.size) {
    els.productConfigSection.classList.add("hidden");
    els.productEditor.innerHTML = "";
    els.configAlert.classList.add("hidden");
    return;
  }

  els.productConfigSection.classList.remove("hidden");
  els.productEditor.innerHTML = "";

  const sortedProducts = [...requiredSkus]
    .map((sku) => productConfig[sku])
    .filter(Boolean)
    .sort((a, b) => getMissingRequiredFields(a).length - getMissingRequiredFields(b).length);

  sortedProducts.forEach((item) => {
    syncProductFromFba(item.sku);
    const batchProduct = findBatchProduct(item.sku);
    const block = document.createElement("div");
    const isBatchRequired = true;
    const state = getProductState(item, isBatchRequired);
    const missing = getMissingRequiredFields(item);
    const fbaContext = formatFbaContext(batchProduct);
    const enFromFba = isEnNameFromFba(item, batchProduct);

    block.className = `product-item state-${state}`;
    block.dataset.sku = item.sku;

    const statusText = !missing.length
      ? "本批必填项已配好，可以导出"
      : `瀚海模版还缺 ${missing.length} 项须手填：${missing.join("、")}`;

    const tagHtml = !missing.length
      ? '<span class="tag tag-ready">本批已配好</span>'
      : '<span class="tag">模版必填待补</span>';
    const dbTagHtml = isSkuInDatabase(item.sku)
      ? '<span class="tag tag-db">领星已匹配</span>'
      : '<span class="tag tag-new">未入领星库</span>';

    block.innerHTML = `
      <header>
        <h3>${escapeHtml(item.sku)} ${tagHtml} ${dbTagHtml}</h3>
        <div class="product-header-actions">
          <button type="button" class="btn primary save-sku-db">保存到 SKU 库</button>
          <button type="button" class="btn secondary remove-product">删除</button>
        </div>
      </header>
      <p class="product-status-text ${state}">${escapeHtml(statusText)}</p>
      ${fbaContext ? `<p class="fba-context"><span class="fba-context-label">FBA 已带入输出</span>${escapeHtml(fbaContext)}</p>` : ""}
      <p class="fields-section-title fields-section-fba">来自 FBA CSV（只读）</p>
      <div class="product-fields product-fields-fba">
        ${renderField("sku", "SKU", item.sku, { isBatchRequired, fromFba: true })}
        ${renderField("template_name", "原厂包装模板", item.template_name, { isBatchRequired, fromFba: true })}
      </div>
      <p class="fields-section-title fields-section-manual">瀚海模版必填（领星库与 FBA 重合时优先领星；英文品名自动压缩为 3–5 词） <span class="req-star">*</span></p>
      <div class="product-fields product-fields-manual">
        ${renderField("en_name", "英文品名", item.en_name, { isRequired: true, isBatchRequired, fromFbaDerived: enFromFba, fromDb: isFieldFromDb(item.sku, "en_name", item.en_name, item) })}
        ${renderField("cn_name", "中文品名", item.cn_name, { isRequired: true, isBatchRequired, fromDb: isFieldFromDb(item.sku, "cn_name", item.cn_name, item) })}
        ${renderField("declare_price", "申报单价", item.declare_price, { isRequired: true, isBatchRequired, fromDb: isFieldFromDb(item.sku, "declare_price", item.declare_price, item), needsLocalSave: true, config: item })}
        ${renderField("material", "材质", item.material, { isRequired: true, isBatchRequired, fromDb: isFieldFromDb(item.sku, "material", item.material, item), needsLocalSave: true, config: item })}
        ${renderField("hs_code", "海关编码", item.hs_code, { isRequired: true, isBatchRequired, fromDb: isFieldFromDb(item.sku, "hs_code", item.hs_code, item), needsLocalSave: true, config: item })}
        ${renderField("usage", "用途", item.usage, { isRequired: true, isBatchRequired, fromDb: isFieldFromDb(item.sku, "usage", item.usage, item), needsLocalSave: true, config: item })}
        ${renderField("brand", "品牌", item.brand, { isRequired: true, isBatchRequired, fromDb: isFieldFromDb(item.sku, "brand", item.brand, item) })}
      </div>
      <p class="fields-section-title">其他输出项（可选）</p>
      <div class="product-fields">
        ${renderField("electric", "带电", item.electric, { isBatchRequired, fromDb: isFieldFromDb(item.sku, "electric", item.electric, item) })}
        ${renderField("model", "型号", item.model, { isBatchRequired, fromDb: isFieldFromDb(item.sku, "model", item.model, item) })}
      </div>
    `;

    block.querySelector(".remove-product").addEventListener("click", () => {
      delete productConfig[item.sku];
      saveProductConfigDraft();
      refreshUi();
    });

    block.querySelector(".save-sku-db").addEventListener("click", () => {
      syncProductConfigFromEditor();
      const result = saveSkuToDatabase(item.sku);
      if (!result.ok) {
        showStatus(`SKU ${item.sku} 保存失败。`, "error");
        return;
      }
      const localNote =
        result.localSavedFields?.length > 0
          ? `（已入库：${formatSavedFieldLabels(result.localSavedFields)}）`
          : "";
      showStatus(`SKU ${item.sku} 已保存到库${localNote}，下次同 SKU 自动匹配。`, "success");
      refreshUi();
    });

    block.querySelectorAll("input:not([readonly])").forEach((input) => {
      input.addEventListener("input", () => {
        const field = input.dataset.field;
        if (field === "en_name") {
          productConfig[item.sku]._en_name_manual = true;
          productConfig[item.sku]._en_name_from_fba = false;
          productConfig[item.sku]._en_name_from_lingxing = false;
        }
        if (productConfig[item.sku]._from_lingxing) {
          delete productConfig[item.sku]._from_lingxing[field];
        }
        productConfig[item.sku][field] = input.value;
        saveProductConfigDraft();
        updateProductBlockVisual(block, item.sku, isBatchRequired);
        refreshUi({ skipEditor: true });
      });
    });

    els.productEditor.appendChild(block);
  });

  renderConfigAlert();
}

function renderField(field, label, value, options = {}) {
  const {
    isRequired = false,
    isBatchRequired = false,
    fromFba = false,
    fromFbaDerived = false,
    fromDb = false,
    needsLocalSave = false,
    config = null,
  } = options;
  const fromLocalSaved = needsLocalSave && isFieldFromLocalSaved(config, field);
  const visual = getFieldVisualState(field, value, isBatchRequired, fromFbaDerived || fromFba, fromDb || fromLocalSaved);
  const filled = String(value ?? "").trim().length > 0;

  let hint = "";
  if (fromLocalSaved) {
    hint = '<span class="field-hint saved-db">已入库</span>';
  } else if (fromDb) {
    hint = filled
      ? '<span class="field-hint db">领星库</span>'
      : '<span class="field-hint missing">模版必填</span>';
  } else if (needsLocalSave && isBatchRequired && !filled) {
    hint = '<span class="field-hint pending-save">填后保存入库</span>';
  } else if (fromFba || fromFbaDerived) {
    hint = filled
      ? '<span class="field-hint fba">FBA 已带</span>'
      : '<span class="field-hint missing">FBA 未识别</span>';
  } else if (isRequired) {
    hint = filled
      ? '<span class="field-hint ok">已填写</span>'
      : '<span class="field-hint missing">模版必填</span>';
  }

  const star = isRequired ? '<span class="req-star">*</span>' : "";
  const readOnly = fromFba ? "readonly" : "";
  const placeholder = !fromFba && isRequired && isBatchRequired && !filled ? `请填写${label}` : "";

  return `
    <label>
      <span class="field-label-row">${star}${label} ${hint}</span>
      <input
        type="text"
        class="${visual}"
        data-field="${field}"
        data-required="${isRequired}"
        data-from-fba="${fromFba || fromFbaDerived}"
        data-from-db="${fromDb}"
        value="${escapeHtml(String(value ?? ""))}"
        placeholder="${escapeHtml(placeholder)}"
        ${readOnly}
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
    statusEl.textContent = !missing.length
      ? "本批必填项已配好，可以导出"
      : `瀚海模版还缺 ${missing.length} 项须手填：${missing.join("、")}`;
  }

  block.querySelectorAll("input:not([readonly])").forEach((input) => {
    const field = input.dataset.field;
    const isRequired = input.dataset.required === "true";
    const fromFba = input.dataset.fromFba === "true";
    const fromDb = input.dataset.fromDb === "true" || isFieldFromLingxing(item, field);
    input.className = getFieldVisualState(
      field,
      input.value,
      isBatchRequired,
      fromFba && field === "en_name",
      fromDb
    );

    const labelRow = input.parentElement?.querySelector(".field-label-row");
    if (!labelRow) return;

    const filled = input.value.trim().length > 0;
    const hint = labelRow.querySelector(".field-hint");
    if (!hint) return;

    if (fromDb) {
      hint.className = `field-hint ${filled ? "db" : "missing"}`;
      hint.textContent = filled ? "领星库" : "模版必填";
      return;
    }

    if (fromFba) {
      hint.className = `field-hint ${filled ? "fba" : "missing"}`;
      hint.textContent = filled ? "FBA 已带" : "FBA 未识别";
      return;
    }

    if (!isRequired) return;

    hint.className = `field-hint ${filled ? "ok" : "missing"}`;
    hint.textContent = filled ? "已填写" : "模版必填";
    input.placeholder = !filled && isBatchRequired ? "必填，请填写" : "";
  });
}

function refreshUi(options = {}) {
  if (!options.skipEditor) renderProductEditor();
  renderBatchList();
  renderConfigAlert();
  renderDbStats();
  renderBatchMatchStats();
  updateStepVisibility();
}

function updateStepVisibility() {
  const hasBatch = parsedShipments.length > 0;
  els.exportSection.classList.toggle("hidden", !hasBatch);
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
    block.querySelectorAll("input:not([readonly])").forEach((input) => {
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
  saveProductConfigDraft();
}

function showStatus(message, type = "") {
  els.status.textContent = message;
  els.status.className = `status ${type}`.trim();
}

function renderWarehouseFixPanel() {
  if (!els.warehouseFixPanel) return;

  const needsFix = parsedShipments.filter((item) => getWarehouseIssues(item.warehouse).length);
  if (!needsFix.length) {
    els.warehouseFixPanel.classList.add("hidden");
    els.warehouseFixPanel.innerHTML = "";
    return;
  }

  els.warehouseFixPanel.classList.remove("hidden");
  els.warehouseFixPanel.innerHTML = `
    <div class="warehouse-fix-title">仓库信息须补全（瀚海模版必填，FBA 可能未识别）</div>
    ${needsFix
      .map((item, index) => {
        const w = item.warehouse || {};
        const issues = getWarehouseIssues(w);
        return `
          <div class="warehouse-fix-item" data-shipment-index="${parsedShipments.indexOf(item)}">
            <div class="warehouse-fix-head">
              <strong>${escapeHtml(item.fileName)}</strong>
              <span class="field-hint missing">缺：${escapeHtml(issues.join("、"))}</span>
            </div>
            <div class="warehouse-fix-fields">
              ${renderWarehouseField("code", "仓库代码", w.code)}
              ${renderWarehouseField("addr1", "收件地址", w.addr1)}
              ${renderWarehouseField("city", "城市", w.city)}
              ${renderWarehouseField("state", "州", w.state)}
              ${renderWarehouseField("zipcode", "邮编", w.zipcode)}
            </div>
          </div>
        `;
      })
      .join("")}
  `;

  els.warehouseFixPanel.querySelectorAll(".warehouse-fix-input").forEach((input) => {
    input.addEventListener("input", () => {
      const block = input.closest(".warehouse-fix-item");
      const shipmentIndex = Number(block.dataset.shipmentIndex);
      const item = parsedShipments[shipmentIndex];
      if (!item) return;
      if (!item.warehouse) item.warehouse = {};
      item.warehouse[input.dataset.field] = input.value.trim();
      updateWarehouseFieldVisual(input);
      refreshUi({ skipEditor: true });
    });
  });
}

function renderWarehouseField(field, label, value) {
  const filled = String(value ?? "").trim().length > 0;
  const visual = filled ? "field-ok" : "field-missing";
  return `
    <label>
      <span class="field-label-row"><span class="req-star">*</span>${label}
        <span class="field-hint ${filled ? "ok" : "missing"}">${filled ? "已填写" : "模版必填"}</span>
      </span>
      <input type="text" class="warehouse-fix-input ${visual}" data-field="${field}" value="${escapeHtml(String(value ?? ""))}" placeholder="请填写${label}" />
    </label>
  `;
}

function updateWarehouseFieldVisual(input) {
  const filled = input.value.trim().length > 0;
  input.className = `warehouse-fix-input ${filled ? "field-ok" : "field-missing"}`;
  const hint = input.parentElement?.querySelector(".field-hint");
  if (hint) {
    hint.className = `field-hint ${filled ? "ok" : "missing"}`;
    hint.textContent = filled ? "已填写" : "模版必填";
  }
}

function renderBatchList() {
  if (!parsedShipments.length) {
    els.batchList.classList.add("hidden");
    els.batchList.innerHTML = "";
    if (els.warehouseFixPanel) {
      els.warehouseFixPanel.classList.add("hidden");
      els.warehouseFixPanel.innerHTML = "";
    }
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
      const summary = summarizeShipment(item);
      const status = evaluateShipment(item);
      const rowClass = status.ok ? "row-ok" : "row-bad";
      const badge = status.ok
        ? '<span class="badge badge-ok">可导出</span>'
        : `<span class="badge badge-bad">${escapeHtml(status.message)}</span>`;
      const skuLabel = summary.skus.length
        ? summary.skus.map((sku) => escapeHtml(sku)).join("<br>")
        : "-";
      return `
        <tr class="${rowClass}">
          <td>${escapeHtml(item.fileName)}</td>
          <td>${escapeHtml(item.shipment?.meta?.["货件编号"] || "-")}</td>
          <td>${skuLabel}</td>
          <td>${escapeHtml(item.warehouse?.code || "-")}</td>
          <td>${summary.totalBoxes ? `${summary.totalBoxes} 箱 / ${summary.totalQty} 件` : "-"}</td>
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
  renderWarehouseFixPanel();
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
  const { meta, products } = parseFbaShipment(rows);
  const warehouse = detectWarehouse(meta["货件名称"], meta["配送地址"]);
  return { fileName: file.name, shipment: { meta, products }, warehouse, error: null };
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
  const matchSummary = getBatchLingxingMatchSummary();
  const matchMsg = matchSummary
    ? ` 领星库匹配 ${matchSummary.matched}/${matchSummary.total} SKU。`
    : "";
  showStatus(
    `已加载 ${parsedShipments.length} 个文件。可导出 ${okCount} 个，待处理 ${failCount} 个。${matchMsg}`,
    failCount ? "warn" : "success"
  );
}

function buildOutputFilename(shipmentId) {
  return `瀚海万博国际物流-B2B单票导入模版 - ${shipmentId}.xls`;
}

function prepareShipmentOutput(item) {
  const products = item.shipment.products || [];
  if (!products.length) {
    throw new Error(`${item.fileName}: 未找到 SKU 产品行`);
  }

  validateWarehouse(item.warehouse);

  products.forEach((product) => {
    const productInfo = getProductConfig(product.sku, product.template_name);
    if (!productInfo) {
      throw new Error(`${item.fileName}: 未配置 SKU ${product.sku}`);
    }
    validateProductConfig(productInfo, product.sku);
  });

  const workbook = buildWorkbook(item.shipment, item.warehouse);
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
      const status = evaluateShipment(item);
      if (!status.ok) {
        return {
          file: item.fileName,
          shipment_id: item.shipment?.meta?.["货件编号"] || null,
          status: status.message,
        };
      }

      const products = item.shipment?.products || [];
      return {
        file: item.fileName,
        shipment_id: item.shipment.meta["货件编号"],
        warehouse: item.warehouse,
        skus: products.map((product) => product.sku),
        products: products.map((product) => {
          const productInfo = getProductConfig(product.sku, product.template_name);
          return {
            sku: product.sku,
            product_declaration: productInfo,
            boxes: product.box_ids.map((boxId) => ({
              box_id: boxId,
              weight_kg: lbsToKg(product.weight_lb),
              size_cm: `${inchToCm(product.length_in)} x ${inchToCm(product.width_in)} x ${inchToCm(product.height_in)}`,
              qty: product.qty_per_box,
              asin: product.asin,
              fnsku: product.fnsku,
            })),
          };
        }),
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
    brand: "non",
    model: "",
  };
  saveProductConfigDraft();
  refreshUi();
}

function exportConfig() {
  const rows = buildSkuDatabaseExportRows();
  const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
  downloadBlob(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), "sku_database.csv");
}

function exportConfigJson() {
  const cleaned = {};
  Object.values(skuDatabase).forEach((record) => {
    const row = cleanDbRecordFromRow(record);
    if (!row) return;
    cleaned[row.sku] = { ...row };
    if (record._localSaved) cleaned[row.sku]._localSaved = record._localSaved;
  });
  downloadBlob(
    new Blob([JSON.stringify(cleaned, null, 2)], { type: "application/json" }),
    "sku_database.json"
  );
}

function exportConfigXls() {
  const rows = buildSkuDatabaseExportRows();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "SKU库");
  XLSX.writeFile(workbook, "sku_database.xls", { bookType: "biff8" });
}

async function importConfig(file) {
  const name = file.name.toLowerCase();
  try {
    let records = [];
    let isLingxing = false;
    if (name.endsWith(".json")) {
      records = parseSkuDatabaseJson(await readFileAsText(file));
    } else if (name.endsWith(".csv")) {
      ({ records, isLingxing } = parseSkuDatabaseCsv(await readFileAsText(file)));
    } else if (name.endsWith(".xls") || name.endsWith(".xlsx")) {
      const parsed = parseSkuDatabaseXls(await readFileAsArrayBuffer(file));
      records = parsed.records;
      isLingxing = parsed.isLingxing;
    } else {
      showStatus("不支持的格式，请使用 JSON / CSV / XLS / XLSX。", "error");
      return;
    }

    if (!records.length) {
      showStatus("未解析到有效 SKU 行，请检查是否为领星产品导出且含 SKU 列。", "error");
      return;
    }

    const result = mergeImportedSkuRecords(records, {
      source: isLingxing ? "lingxing" : "file",
      fileName: file.name,
      skipExisting: true,
    });
    reapplyDatabaseToBatch();
    refreshUi();
    const sourceNote = isLingxing ? "（领星导出）" : "";
    showStatus(
      `领星 SKU 库已自动保存${sourceNote}：新增 ${result.added} 条，已有 SKU 跳过 ${result.ignored} 条，无效 ${result.skipped} 条（共 ${result.total} 行）。`,
      "success"
    );
    if (cloudGistConfigured() && (result.added > 0 || result.total > 0)) {
      try {
        await syncSkuDatabaseToCloud({ silent: true });
        showStatus(`已导入并同步到 GitHub 团队库（${Object.keys(serializeSkuDatabaseForCloud()).length} 条）`, "success");
      } catch (error) {
        showStatus(`本地已导入，但同步团队库失败：${error.message}`, "warn");
      }
    }
  } catch (error) {
    showStatus(`领星 SKU 库导入失败：${error.message}`, "error");
  } finally {
    if (els.importConfigInput) els.importConfigInput.value = "";
  }
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
if (els.exportConfigXlsBtn) els.exportConfigXlsBtn.addEventListener("click", exportConfigXls);
if (els.exportConfigJsonBtn) els.exportConfigJsonBtn.addEventListener("click", exportConfigJson);
els.importConfigInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) importConfig(file);
});
if (els.saveBatchDbBtn) {
  els.saveBatchDbBtn.addEventListener("click", async () => {
    const result = saveBatchToDatabase();
    const localNote = result.localSavedLabels ? `（入库字段：${result.localSavedLabels}）` : "";
    showStatus(`已将本批 ${result.count} 个 SKU 保存到库${localNote}，下次自动匹配。`, "success");
    try {
      await maybePushCloudAfterLocalSave();
      if (cloudGistConfigured()) {
        showStatus("本批已保存并同步到 GitHub 团队库", "success");
      }
    } catch {
      /* local save ok */
    }
    refreshUi();
  });
}
if (els.pullCloudDbBtn) {
  els.pullCloudDbBtn.addEventListener("click", () => {
    syncSkuDatabaseFromCloud().catch((error) => showStatus(error.message, "error"));
  });
}
if (els.pushCloudDbBtn) {
  els.pushCloudDbBtn.addEventListener("click", () => {
    syncSkuDatabaseToCloud().catch((error) => showStatus(error.message, "error"));
  });
}

initCloudSkuDatabase().finally(() => refreshUi());

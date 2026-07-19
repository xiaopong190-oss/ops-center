/* ops-center prebuilt bundle */
function confirmDeleteWarning(name, typeLabel) {
  return window.confirm(`⚠️ 警告\n\n确定删除${typeLabel}「${name}」吗？\n\n删除后无法恢复，链接与配置将从本机浏览器中永久移除。`);
}
const {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  createContext,
  useContext
} = React;
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const fmtD = d => {
  if (!d) return "—";
  const p = d.split("-");
  return p[1] + "/" + p[2];
};
const daysDiff = due => {
  if (!due) return null;
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - TODAY) / 86400000);
};
const badge = (bg, color, extra = {}) => ({
  fontSize: 10,
  padding: "2px 8px",
  borderRadius: 20,
  background: bg,
  color,
  fontWeight: 500,
  whiteSpace: "nowrap",
  ...extra
});
const lbl = {
  display: "block",
  fontSize: 11,
  color: "var(--tm)",
  marginBottom: 3,
  fontWeight: 500
};
const inp = {
  width: "100%",
  fontSize: 13,
  padding: "7px 10px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontFamily: "inherit",
  background: "transparent",
  color: "inherit",
  display: "block"
};
const inpSm = {
  fontSize: 12,
  padding: "5px 8px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontFamily: "inherit",
  background: "transparent",
  color: "inherit"
};
const AVATAR_PALETTE = [["#dbeafe", "#1e3a8a"], ["#d1fae5", "#065f46"], ["#fef3c7", "#78350f"], ["#ede9fe", "#4c1d95"], ["#fce7f3", "#831843"], ["#fee2e2", "#7f1d1d"], ["#d1fae5", "#064e3b"], ["#fef9c3", "#713f12"]];
const strHash = s => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % AVATAR_PALETTE.length;
  return h;
};
const Avatar = ({
  name,
  size = 24
}) => {
  const [bg, tx] = AVATAR_PALETTE[strHash(name || "?")];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      borderRadius: "50%",
      background: bg,
      color: tx,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: size * 0.42,
      fontWeight: 700,
      flexShrink: 0
    }
  }, (name || "?").slice(0, 1));
};
const LOG_EXPAND_KEY = "ops-logistics-expanded";
const LOG_FILTER_KEY = "ops-logistics-filters";
let logisticsExpandedCache = null;
function isPlainObj(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}
function loadExpandedState() {
  if (isPlainObj(logisticsExpandedCache)) return {
    ...logisticsExpandedCache
  };
  try {
    const raw = localStorage.getItem(LOG_EXPAND_KEY) || sessionStorage.getItem(LOG_EXPAND_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isPlainObj(parsed)) {
        logisticsExpandedCache = parsed;
        return {
          ...logisticsExpandedCache
        };
      }
    }
  } catch {/* ignore */}
  logisticsExpandedCache = {
    1: true
  };
  return {
    ...logisticsExpandedCache
  };
}
function saveExpandedState(state) {
  logisticsExpandedCache = {
    ...state
  };
  try {
    const json = JSON.stringify(logisticsExpandedCache);
    localStorage.setItem(LOG_EXPAND_KEY, json);
    sessionStorage.setItem(LOG_EXPAND_KEY, json);
  } catch {/* ignore */}
}
function loadLogisticsFilters() {
  try {
    const raw = sessionStorage.getItem(LOG_FILTER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isPlainObj(parsed)) {
        return {
          filter: typeof parsed.filter === "string" ? parsed.filter : "all",
          ownerFilter: typeof parsed.ownerFilter === "string" ? parsed.ownerFilter : "all",
          productFilter: typeof parsed.productFilter === "string" ? parsed.productFilter : "all"
        };
      }
    }
  } catch {/* ignore */}
  return {
    filter: "all",
    ownerFilter: "all",
    productFilter: "all"
  };
}
function saveLogisticsFilters(filters) {
  try {
    sessionStorage.setItem(LOG_FILTER_KEY, JSON.stringify(filters));
  } catch {/* ignore */}
}
function isBatchExpanded(expanded, id) {
  if (!isPlainObj(expanded)) return Number(id) === 1;
  const key = String(id);
  if (Object.prototype.hasOwnProperty.call(expanded, key)) return expanded[key] === true;
  if (Object.prototype.hasOwnProperty.call(expanded, id)) return expanded[id] === true;
  return Number(id) === 1;
}

// ─── CLOUD SYNC (GitHub Gist — token via gist-config.js, not in repo) ─
const GITHUB_GIST_ID = "d4c6e4e873edfef595350da3ecc5c4da";
function getGistToken() {
  if (typeof window !== "undefined" && window.__OPS_GIST__?.token) return String(window.__OPS_GIST__.token);
  return "";
}
function getGistId() {
  if (typeof window !== "undefined" && window.__OPS_GIST__?.id) return String(window.__OPS_GIST__.id);
  return GITHUB_GIST_ID || "";
}

// ─── GLOBAL CONFIG (全站共享：员工名单等) ─────────────────────────────
const CONFIG_STORAGE_KEY = "ops-center-global-config";

// ─── GitHub Gist 共享（一个 Gist 里多个 json 文件）────────────────────
const GIST_API = "https://api.github.com/gists";
const GIST_SHARED_FILES = {
  logistics: "logistics.json",
  tasks: "tasks.json",
  production: "production.json",
  "tools-links": "tools-links.json",
  agents: "agents.json",
  "kpi-monthly": "kpi-monthly.json",
  "global-config": "global-config.json",
  "lingxing-sku-db": "lingxing-sku-db.json"
};
function gistConfigured() {
  return Boolean(getGistToken() && getGistId());
}
function gistHeaders(json = false) {
  const h = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${getGistToken()}`,
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}
async function gistFetchAll() {
  const res = await fetch(`${GIST_API}/${getGistId()}`, {
    headers: gistHeaders()
  });
  if (!res.ok) throw new Error(`Gist 读取失败 HTTP ${res.status}`);
  return res.json();
}
async function gistReadRecord(key) {
  const fileName = GIST_SHARED_FILES[key];
  if (!fileName) return null;
  const gist = await gistFetchAll();
  const content = gist?.files?.[fileName]?.content;
  if (!content) return null;
  const record = JSON.parse(content);
  if (record && typeof record === "object") return record;
  return null;
}
async function gistWriteRecord(key, payload) {
  const fileName = GIST_SHARED_FILES[key];
  if (!fileName) throw new Error(`未知共享键: ${key}`);
  const res = await fetch(`${GIST_API}/${getGistId()}`, {
    method: "PATCH",
    headers: gistHeaders(true),
    body: JSON.stringify({
      files: {
        [fileName]: {
          content: JSON.stringify(payload, null, 2)
        }
      }
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gist 保存失败 HTTP ${res.status}${detail ? `: ${detail.slice(0, 120)}` : ""}`);
  }
  return payload;
}

// ─── sharedStorage ───────────────────────────────────────────────────
// 已配置 Gist → 全公司共享；未配置 → 仅 localStorage

const sharedStorage = {
  async get(key) {
    if (!GIST_SHARED_FILES[key]) return localGet(key);
    if (!gistConfigured()) return localGet(key);
    try {
      const record = await gistReadRecord(key);
      if (record) localSet(key, record);
      return record ?? localGet(key);
    } catch (e) {
      console.warn(`[sharedStorage] get "${key}" Gist 失败，用本地缓存`, e?.message);
      return localGet(key);
    }
  },
  async set(key, value, updatedBy) {
    const payload = {
      data: value,
      updatedBy: updatedBy || "未知",
      updatedAt: Date.now()
    };
    if (!GIST_SHARED_FILES[key]) {
      localSet(key, payload);
      window.dispatchEvent(new CustomEvent(`ops-shared-updated:${key}`));
      return payload;
    }
    if (!gistConfigured()) {
      localSet(key, payload);
      window.dispatchEvent(new CustomEvent(`ops-shared-updated:${key}`));
      throw new Error("未配置 GitHub Gist，已暂存本机（请填写 cloud-sync-config.js）");
    }
    try {
      await gistWriteRecord(key, payload);
      localSet(key, payload);
      window.dispatchEvent(new CustomEvent(`ops-shared-updated:${key}`));
      return payload;
    } catch (e) {
      localSet(key, payload);
      window.dispatchEvent(new CustomEvent(`ops-shared-updated:${key}`));
      throw new Error(`云端保存失败（已暂存本机）：${e?.message || "网络错误"}`);
    }
  },
  async delete(key) {
    localStorage.removeItem(`shared:${key}`);
    await sharedStorage.set(key, [], "");
  }
};
function localGet(key) {
  try {
    const raw = localStorage.getItem(`shared:${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function localSet(key, payload) {
  try {
    localStorage.setItem(`shared:${key}`, JSON.stringify(payload));
  } catch {/* ignore */}
}

// ─── ROLE / STAFF ─────────────────────────────────────────────────────
const ROLE_COLORS = {
  运营: {
    bg: "#dceeff",
    color: "#1a4e8a"
  },
  美工: {
    bg: "#f3e8ff",
    color: "#6b21a8"
  },
  设计: {
    bg: "#e8f5e9",
    color: "#2e7d32"
  },
  开发: {
    bg: "#e0f2f1",
    color: "#00695c"
  },
  采购: {
    bg: "#fff3e0",
    color: "#e65100"
  },
  管理: {
    bg: "#fce4ec",
    color: "#880e4f"
  }
};
const STAFF_ROLE_OPTIONS = Object.keys(ROLE_COLORS);
const DEFAULT_GLOBAL_CONFIG = {
  staff: [{
    name: "杨彬",
    role: "运营"
  }, {
    name: "stella",
    role: "运营"
  }, {
    name: "张玉堂",
    role: "美工"
  }, {
    name: "张工",
    role: "设计"
  }, {
    name: "王律师",
    role: "管理"
  }]
};
const DEFAULT_ROLE_BY_NAME = Object.fromEntries(DEFAULT_GLOBAL_CONFIG.staff.map(e => [e.name, e.role]));
function normalizeStaffEntry(item) {
  let entry;
  if (typeof item === "string") {
    const [name, role] = item.split("|").map(s => s.trim());
    entry = {
      name: name || item.trim(),
      role: role || ""
    };
  } else {
    entry = {
      name: String(item?.name || "").trim(),
      role: String(item?.role || "").trim()
    };
  }
  if (entry.name && !entry.role && DEFAULT_ROLE_BY_NAME[entry.name]) {
    entry.role = DEFAULT_ROLE_BY_NAME[entry.name];
  }
  return entry;
}
function parseStaffText(text) {
  return text.split(/\r?\n/).map(line => {
    const [name, role] = line.split("|").map(s => s.trim());
    return {
      name: name || line.trim(),
      role: role || ""
    };
  }).filter(e => e.name);
}
function formatStaffText(staff) {
  return staff.map(e => `${e.name}|${e.role || ""}`).join("\n");
}
function getCurrentUserName() {
  try {
    const raw = sessionStorage.getItem("ops-center-current-user");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.name) return parsed.name;
    }
  } catch {/* ignore */}
  return "未知";
}
function readSharedStaffCache() {
  try {
    const raw = localStorage.getItem("shared:global-config");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const staff = parsed?.data?.staff;
    if (Array.isArray(staff) && staff.length) {
      return {
        staff: staff.map(normalizeStaffEntry).filter(e => e.name)
      };
    }
  } catch {/* ignore */}
  return null;
}
function loadLegacyLocalConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.staff) || !parsed.staff.length) return null;
    return {
      staff: parsed.staff.map(normalizeStaffEntry).filter(e => e.name)
    };
  } catch {
    return null;
  }
}
function loadGlobalConfig() {
  const shared = readSharedStaffCache();
  if (shared) return shared;
  const legacy = loadLegacyLocalConfig();
  if (legacy) return legacy;
  return {
    staff: DEFAULT_GLOBAL_CONFIG.staff.map(e => ({
      ...e
    }))
  };
}

/** 从 Gist 拉取员工名单（与其它共享页相同逻辑，结果写入本地缓存） */
async function fetchGlobalConfigFromCloud() {
  if (!gistConfigured()) return loadGlobalConfig();
  try {
    const record = await sharedStorage.get("global-config");
    if (record?.data?.staff?.length) {
      window.dispatchEvent(new CustomEvent("ops-global-config-updated"));
      return record.data;
    }
    const legacy = loadLegacyLocalConfig();
    if (legacy?.staff?.length) {
      await sharedStorage.set("global-config", legacy, getCurrentUserName());
      window.dispatchEvent(new CustomEvent("ops-global-config-updated"));
      return legacy;
    }
  } catch (e) {
    console.warn("[global-config] 云端读取失败，使用本地缓存", e?.message);
  }
  return loadGlobalConfig();
}
function getGlobalConfigMeta() {
  try {
    const raw = localStorage.getItem("shared:global-config");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.updatedBy ? {
      updatedBy: parsed.updatedBy,
      updatedAt: parsed.updatedAt
    } : null;
  } catch {
    return null;
  }
}
async function saveGlobalConfig(config) {
  const next = {
    staff: (config.staff || []).map(normalizeStaffEntry).filter(e => e.name)
  };
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
  } catch {/* ignore */}
  if (gistConfigured()) {
    await sharedStorage.set("global-config", next, getCurrentUserName());
  } else {
    localSet("global-config", {
      data: next,
      updatedBy: getCurrentUserName(),
      updatedAt: Date.now()
    });
    window.dispatchEvent(new CustomEvent("ops-shared-updated:global-config"));
  }
  window.dispatchEvent(new CustomEvent("ops-global-config-updated"));
  return next;
}
function getEmployees() {
  return loadGlobalConfig().staff;
}
function getStaffNames() {
  return getEmployees().map(e => e.name);
}
function getStaffRole(name) {
  return getEmployees().find(e => e.name === name)?.role || "";
}
function ownerOptions() {
  return getEmployees().slice().sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}
function ownerFilterEntries() {
  return [{
    name: "all",
    role: ""
  }, ...ownerOptions()];
}
function ownerFilterOptions() {
  return ownerFilterEntries().map(e => e.name);
}
function formatOwnerLabel(emp) {
  if (!emp) return "";
  if (typeof emp === "string") {
    const role = getStaffRole(emp);
    return role ? `${emp} · ${role}` : emp;
  }
  return emp.role ? `${emp.name} · ${emp.role}` : emp.name;
}
function RoleBadge({
  role,
  style
}) {
  if (!role) return null;
  const c = ROLE_COLORS[role] || {
    bg: "#f3f4f6",
    color: "#666"
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      padding: "1px 6px",
      borderRadius: 10,
      background: c.bg,
      color: c.color,
      whiteSpace: "nowrap",
      ...style
    }
  }, role);
}
function OwnerField({
  value,
  onChange,
  placeholder = "选择负责人…",
  style,
  inputStyle
}) {
  useGlobalConfig();
  const employees = ownerOptions();
  const known = new Set(employees.map(e => e.name));
  const fieldStyle = {
    ...(inputStyle || style),
    background: "var(--card)"
  };
  if (!employees.length) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "#92400e",
        background: "#fffbeb",
        border: "1px solid #fcd34d",
        borderRadius: 8,
        padding: "7px 10px",
        lineHeight: 1.45
      }
    }, "\u8BF7\u5148\u5728 \u2699 \u8BBE\u7F6E \u2192 \u5168\u5C40\u5458\u5DE5\u540D\u5355 \u4E2D\u6DFB\u52A0\u4EBA\u5458");
  }
  return /*#__PURE__*/React.createElement("select", {
    value: known.has(value) ? value : "",
    onChange: e => onChange(e.target.value),
    style: fieldStyle
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, placeholder), employees.map(e => /*#__PURE__*/React.createElement("option", {
    key: e.name,
    value: e.name
  }, formatOwnerLabel(e))));
}
function StaffListEditor({
  rows,
  onChange
}) {
  const setRow = (i, patch) => onChange(rows.map((r, j) => j === i ? {
    ...r,
    ...patch
  } : r));
  const removeRow = i => onChange(rows.filter((_, j) => j !== i));
  const addRow = () => onChange([...rows, {
    name: "",
    role: STAFF_ROLE_OPTIONS[0] || "运营"
  }]);
  const inp = {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    padding: "7px 10px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontFamily: "inherit",
    background: "transparent",
    color: "inherit"
  };
  const sel = {
    ...inp,
    width: 92,
    flex: "0 0 92px",
    background: "var(--card)",
    cursor: "pointer"
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 6,
      padding: "0 2px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 11,
      color: "var(--tm)",
      fontWeight: 500
    }
  }, "\u59D3\u540D"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 92,
      flexShrink: 0,
      fontSize: 11,
      color: "var(--tm)",
      fontWeight: 500
    }
  }, "\u89D2\u8272"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 28
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      maxHeight: 300,
      overflowY: "auto",
      marginBottom: 10,
      paddingRight: 2
    }
  }, rows.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--tm)",
      textAlign: "center",
      padding: "12px 0"
    }
  }, "\u6682\u65E0\u5458\u5DE5\uFF0C\u70B9\u51FB\u4E0B\u65B9\u6DFB\u52A0"), rows.map((row, i) => {
    const roles = !row.role || STAFF_ROLE_OPTIONS.includes(row.role) ? STAFF_ROLE_OPTIONS : [...STAFF_ROLE_OPTIONS, row.role];
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: "flex",
        gap: 8,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: row.name,
      onChange: e => setRow(i, {
        name: e.target.value
      }),
      placeholder: "\u8F93\u5165\u59D3\u540D",
      style: inp
    }), /*#__PURE__*/React.createElement("select", {
      value: row.role || STAFF_ROLE_OPTIONS[0],
      onChange: e => setRow(i, {
        role: e.target.value
      }),
      style: sel
    }, roles.map(r => /*#__PURE__*/React.createElement("option", {
      key: r,
      value: r
    }, r))), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => removeRow(i),
      style: {
        width: 28,
        height: 28,
        border: "none",
        background: "transparent",
        color: "#bbb",
        cursor: "pointer",
        fontSize: 20,
        lineHeight: 1,
        flexShrink: 0,
        fontFamily: "inherit"
      }
    }, "\xD7"));
  })), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: addRow,
    style: {
      width: "100%",
      border: "1px dashed var(--border)",
      borderRadius: 8,
      padding: "7px 0",
      fontSize: 12,
      cursor: "pointer",
      color: "var(--tm)",
      background: "transparent",
      fontFamily: "inherit"
    }
  }, "+ \u6DFB\u52A0\u5458\u5DE5"));
}
function GlobalSettingsModal({
  onClose,
  onSaved
}) {
  const [rows, setRows] = useState(() => getEmployees().map(e => ({
    ...e
  })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState(() => getGlobalConfigMeta());
  useEffect(() => {
    const onKey = e => {
      if (e.key === "Escape" && !saving) onClose();
    };
    const refreshMeta = () => setMeta(getGlobalConfigMeta());
    window.addEventListener("keydown", onKey);
    window.addEventListener("ops-global-config-updated", refreshMeta);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ops-global-config-updated", refreshMeta);
    };
  }, [onClose, saving]);
  const save = async () => {
    const staff = rows.map(r => ({
      name: r.name.trim(),
      role: r.role || ""
    })).filter(r => r.name);
    setSaving(true);
    setError("");
    try {
      await saveGlobalConfig({
        staff
      });
      onSaved && onSaved();
    } catch (e) {
      setError(e?.message || "保存失败，请检查网络或 Gist 配置");
    } finally {
      setSaving(false);
    }
  };
  const metaLine = meta?.updatedBy ? `☁️ 最后由 ${meta.updatedBy} 更新 · 保存后全公司同步` : "☁️ 保存后上传云端，全员实时同步";
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.4)",
      zIndex: 300,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: "2rem 1rem",
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 14,
      padding: "1.25rem 1.5rem",
      width: "100%",
      maxWidth: 440,
      color: "var(--text)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 15,
      marginBottom: 4
    }
  }, "\u5168\u5C40\u5458\u5DE5\u540D\u5355"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginBottom: 8,
      lineHeight: 1.5
    }
  }, "\u6B64\u5904\u4E3A\u5168\u5458\u552F\u4E00\u6765\u6E90\uFF1A\u5404\u9875\u300C\u8D1F\u8D23\u4EBA / \u8DDF\u8FDB\u4EBA\u300D\u53EA\u80FD\u4ECE\u6B64\u540D\u5355\u9009\u62E9\uFF0C\u4E0D\u80FD\u5728\u5176\u4ED6\u5730\u65B9\u968F\u610F\u6DFB\u52A0\u59D3\u540D\u3002"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#065f46",
      background: "#ecfdf5",
      border: "1px solid #6ee7b7",
      borderRadius: 8,
      padding: "6px 10px",
      marginBottom: 12
    }
  }, metaLine), error && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#b91c1c",
      background: "#fee2e2",
      border: "1px solid #fecaca",
      borderRadius: 8,
      padding: "6px 10px",
      marginBottom: 10
    }
  }, error), /*#__PURE__*/React.createElement(StaffListEditor, {
    rows: rows,
    onChange: setRows
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    disabled: saving,
    onClick: onClose,
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "6px 14px",
      fontSize: 12,
      cursor: saving ? "wait" : "pointer",
      fontFamily: "inherit",
      color: "var(--tm)"
    }
  }, "\u53D6\u6D88"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    disabled: saving,
    onClick: save,
    style: {
      background: saving ? "#b8d4f0" : "#2d7dd2",
      border: "none",
      borderRadius: 8,
      padding: "6px 14px",
      fontSize: 12,
      cursor: saving ? "wait" : "pointer",
      fontFamily: "inherit",
      color: "#fff"
    }
  }, saving ? "上传中…" : "☁️ 保存并同步"))));
}
function useGlobalConfig() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion(v => v + 1);
    const onShared = () => {
      fetchGlobalConfigFromCloud().finally(bump);
    };
    window.addEventListener("ops-global-config-updated", bump);
    window.addEventListener("ops-shared-updated:global-config", onShared);
    return () => {
      window.removeEventListener("ops-global-config-updated", bump);
      window.removeEventListener("ops-shared-updated:global-config", onShared);
    };
  }, []);
  return {
    version,
    staff: getEmployees(),
    reload: () => fetchGlobalConfigFromCloud().then(() => setVersion(v => v + 1))
  };
}
window.ROLE_COLORS = ROLE_COLORS;
window.getEmployees = getEmployees;
window.getStaffNames = getStaffNames;
window.getStaffRole = getStaffRole;
window.ownerOptions = ownerOptions;
window.ownerFilterOptions = ownerFilterOptions;
window.ownerFilterEntries = ownerFilterEntries;
window.formatOwnerLabel = formatOwnerLabel;
window.RoleBadge = RoleBadge;
window.OwnerField = OwnerField;
window.GlobalSettingsModal = GlobalSettingsModal;
window.useGlobalConfig = useGlobalConfig;
window.fetchGlobalConfigFromCloud = fetchGlobalConfigFromCloud;
window.getGlobalConfigMeta = getGlobalConfigMeta;
window.sharedStorage = sharedStorage;
// ─── STORAGE (shared / private) ─────────────────────────────────────
const CURRENT_USER_KEY = "ops-center-current-user";

/** 后台拉取间隔；0=关闭自动拉取，仅手动「从云端更新」。默认 30 分钟 */
const CLOUD_POLL_MS = 1800000;
function getCurrentUser() {
  try {
    const raw = sessionStorage.getItem(CURRENT_USER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id && parsed?.name) return parsed;
    }
  } catch {/* ignore */}
  return {
    id: "guest",
    name: "访客"
  };
}
function setCurrentUser(user) {
  try {
    sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify({
      id: user.id || user.name || "guest",
      name: user.name || "访客"
    }));
  } catch {/* ignore */}
}
const privateStorage = {
  get(userId, key) {
    try {
      const raw = localStorage.getItem(`user:${userId}:${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set(userId, key, value) {
    localStorage.setItem(`user:${userId}:${key}`, JSON.stringify(value));
  },
  delete(userId, key) {
    localStorage.removeItem(`user:${userId}:${key}`);
  }
};
function formatSharedTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
}
const DEVICE_ID_KEY = "ops-center-device-id";
function getOrCreateDeviceId() {
  try {
    const cached = localStorage.getItem(DEVICE_ID_KEY);
    if (cached) return cached;
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? `dev-${crypto.randomUUID()}` : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `dev-${Date.now()}`;
  }
}
async function resolveClientId() {
  return getOrCreateDeviceId();
}
function isLocalOpsServer() {
  return false;
}
function priorityLocalKey(clientId, date) {
  return `priority:${clientId}:${date}`;
}
function loadTodayPriority(clientId, date) {
  const id = clientId || getOrCreateDeviceId();
  try {
    const raw = localStorage.getItem(priorityLocalKey(id, date));
    if (!raw) return {
      date: "",
      text: ""
    };
    const parsed = JSON.parse(raw);
    if (parsed?.date === date) return {
      date: parsed.date,
      text: parsed.text || ""
    };
  } catch {/* ignore */}
  return {
    date: "",
    text: ""
  };
}
function saveTodayPriority(clientId, date, text) {
  const id = clientId || getOrCreateDeviceId();
  const entry = {
    date,
    text: text.trim()
  };
  try {
    localStorage.setItem(priorityLocalKey(id, date), JSON.stringify(entry));
  } catch {/* ignore */}
  return entry;
}

/** 按 id 合并：保留云端其他人新增的记录，本机改动覆盖同 id */
function mergeIdLists(latest, incoming) {
  const base = Array.isArray(latest) ? latest : [];
  const patch = Array.isArray(incoming) ? incoming : [];
  const byId = new Map();
  for (const item of base) {
    if (item?.id != null) byId.set(item.id, item);
  }
  for (const item of patch) {
    if (item?.id != null) byId.set(item.id, item);
  }
  const noId = patch.filter(item => item?.id == null);
  return [...byId.values(), ...noId];
}
async function fetchLatestSharedArray(storageKey, fallback) {
  const raw = await sharedStorage.get(storageKey);
  if (Array.isArray(raw?.data)) return raw.data;
  return Array.isArray(fallback) ? fallback : [];
}
function useSharedList(storageKey, defaultData, {
  active = true
} = {}) {
  const defaultRef = useRef(defaultData);
  defaultRef.current = defaultData;
  const [state, setState] = useState({
    data: defaultData,
    meta: null,
    loading: true,
    error: ""
  });
  const fetchingRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const fetchFromCloud = useCallback(async (force = false) => {
    if (fetchingRef.current) return;
    const now = Date.now();
    if (!force && now - lastFetchAtRef.current < 3000) return;
    fetchingRef.current = true;
    lastFetchAtRef.current = now;
    try {
      const raw = await sharedStorage.get(storageKey);
      if (!raw) {
        setState({
          data: defaultRef.current,
          meta: null,
          loading: false,
          error: ""
        });
        return;
      }
      const data = Array.isArray(raw.data) ? raw.data : defaultRef.current;
      setState({
        data,
        meta: raw,
        loading: false,
        error: ""
      });
    } catch (e) {
      setState(prev => ({
        ...prev,
        data: prev.data ?? defaultRef.current,
        loading: false,
        error: e?.message || "读取失败"
      }));
    } finally {
      fetchingRef.current = false;
    }
  }, [storageKey]);
  useEffect(() => {
    setState(prev => ({
      ...prev,
      loading: true,
      error: ""
    }));
    fetchFromCloud(true);
  }, [fetchFromCloud]);
  useEffect(() => {
    const handler = () => fetchFromCloud(true);
    window.addEventListener(`ops-shared-updated:${storageKey}`, handler);
    return () => window.removeEventListener(`ops-shared-updated:${storageKey}`, handler);
  }, [storageKey, fetchFromCloud]);
  useEffect(() => {
    if (!active || CLOUD_POLL_MS <= 0) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") fetchFromCloud();
    }, CLOUD_POLL_MS);
    return () => clearInterval(timer);
  }, [fetchFromCloud, active]);
  const [saving, setSaving] = useState(false);
  const persist = useCallback(async data => {
    setSaving(true);
    setState(prev => ({
      ...prev,
      data,
      error: ""
    }));
    try {
      const payload = await sharedStorage.set(storageKey, data, getCurrentUser().name);
      setState(prev => ({
        ...prev,
        data,
        meta: payload || {
          ...prev.meta,
          updatedBy: getCurrentUser().name,
          updatedAt: Date.now()
        },
        error: ""
      }));
      return true;
    } catch (e) {
      setState(prev => ({
        ...prev,
        error: e?.message || "保存失败"
      }));
      return false;
    } finally {
      setSaving(false);
    }
  }, [storageKey]);

  /** 保存前先拉云端最新数据，再 mergeFn 合并后上传，避免 A/B 互相覆盖 */
  const persistMerge = useCallback(async mergeFn => {
    setSaving(true);
    setState(prev => ({
      ...prev,
      error: ""
    }));
    try {
      let merged;
      for (let attempt = 0; attempt < 3; attempt++) {
        const raw = await sharedStorage.get(storageKey);
        const latest = Array.isArray(raw?.data) ? raw.data : defaultRef.current;
        merged = mergeFn(latest);
        try {
          const payload = await sharedStorage.set(storageKey, merged, getCurrentUser().name);
          setState(prev => ({
            ...prev,
            data: merged,
            meta: payload || {
              ...prev.meta,
              updatedBy: getCurrentUser().name,
              updatedAt: Date.now()
            },
            error: ""
          }));
          return true;
        } catch (saveErr) {
          if (attempt === 2) throw saveErr;
          await new Promise(r => setTimeout(r, 350 * (attempt + 1)));
        }
      }
      return false;
    } catch (e) {
      setState(prev => ({
        ...prev,
        error: e?.message || "保存失败"
      }));
      return false;
    } finally {
      setSaving(false);
    }
  }, [storageKey]);
  const reload = useCallback(async () => {
    setState(prev => ({
      ...prev,
      loading: true,
      error: ""
    }));
    await fetchFromCloud(true);
  }, [fetchFromCloud]);
  return {
    items: state.data,
    meta: state.meta,
    loading: state.loading,
    saving,
    error: state.error,
    persist,
    persistMerge,
    reload
  };
}
function SharedMetaLine({
  meta,
  style,
  onReload,
  onSaveCloud,
  loading,
  saving,
  error
}) {
  let bg = "#ecfdf5",
    border = "#6ee7b7",
    color = "#065f46";
  let text = "☁️ GitHub 云端已启用 · 填写后点「保存并上传」同步全员";
  if (loading) {
    bg = "#f3f4f6";
    border = "#d1d5db";
    color = "#4b5563";
    text = "⏳ 正在从云端加载…";
  } else if (saving) {
    bg = "#eef6ff";
    border = "#b8d4f0";
    color = "#1a4e8a";
    text = "⏳ 正在保存并上传到云端…";
  } else if (error) {
    bg = "#fee2e2";
    border = "#fca5a5";
    color = "#991b1b";
    text = `❌ ${error} · 数据已暂存本机，请重试上传`;
  } else if (meta?.updatedBy) {
    text = CLOUD_POLL_MS > 0 ? `☁️ 最后由 ${meta.updatedBy} 更新于 ${formatSharedTime(meta.updatedAt)} · 可见时每 ${Math.round(CLOUD_POLL_MS / 60000)} 分钟自动拉取` : `☁️ 最后由 ${meta.updatedBy} 更新于 ${formatSharedTime(meta.updatedAt)} · 请点「从云端更新」手动拉取`;
  }
  const btnBase = {
    background: "#fff",
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: 11,
    fontFamily: "inherit",
    fontWeight: 600,
    flexShrink: 0,
    cursor: "pointer"
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color,
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 8,
      padding: "8px 12px",
      marginBottom: 12,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      flexWrap: "wrap",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, text), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap"
    }
  }, onSaveCloud && /*#__PURE__*/React.createElement("button", {
    type: "button",
    disabled: loading || saving,
    onClick: e => {
      e.preventDefault();
      e.stopPropagation();
      onSaveCloud();
    },
    style: {
      ...btnBase,
      background: saving ? "#eef6ff" : "#2d7dd2",
      border: saving ? "1px solid #b8d4f0" : "none",
      color: saving ? "#1a4e8a" : "#fff",
      opacity: loading || saving ? 0.85 : 1,
      cursor: loading || saving ? "wait" : "pointer",
      minWidth: 108
    }
  }, saving ? "上传中…" : "☁️ 保存并上传"), onReload && /*#__PURE__*/React.createElement("button", {
    type: "button",
    disabled: loading || saving,
    onClick: e => {
      e.preventDefault();
      e.stopPropagation();
      onReload();
    },
    style: {
      ...btnBase,
      border: `1px solid ${border}`,
      color,
      opacity: loading || saving ? 0.75 : 1,
      cursor: loading || saving ? "wait" : "pointer",
      minWidth: 88
    }
  }, loading ? "更新中…" : "↻ 从云端更新")));
}

// ─── USER CONTEXT ───────────────────────────────────────────────────
const UserContext = createContext(getCurrentUser());
function useCurrentUser() {
  return useContext(UserContext);
}
const STATUS = {
  pending: {
    label: "待发货",
    color: "#4b5563",
    bg: "#e5e7eb",
    dot: "#6b7280",
    border: "#9ca3af"
  },
  transit: {
    label: "运输中",
    color: "#1a4e8a",
    bg: "#bfdbfe",
    dot: "#2563eb",
    border: "#60a5fa"
  },
  arrived: {
    label: "已到达",
    color: "#065f46",
    bg: "#6ee7b7",
    dot: "#059669",
    border: "#34d399"
  },
  receiving: {
    label: "接收中",
    color: "#0f766e",
    bg: "#99f6e4",
    dot: "#14b8a6",
    border: "#2dd4bf"
  },
  done: {
    label: "已完成",
    color: "#166534",
    bg: "#86efac",
    dot: "#22c55e",
    border: "#4ade80"
  }
};
const GANTT_TRACKING_CHECK_STAGES = ["已入仓", "清关中", "已起运 (开船/起飞)", "在途"];
const GANTT_ARRIVED_STAGES = ["到港", "上架中", "完成"];
const SORT_OPTIONS = [{
  key: "name",
  label: "产品名称"
}, {
  key: "shipDate",
  label: "最近出货"
}, {
  key: "etaArrival",
  label: "预计到港"
}, {
  key: "batches",
  label: "批次数"
}];
const GANTT_FILTER_KEY = "ops-gantt-filters";
const GANTT_EXPAND_KEY = "ops-gantt-expanded";
const BTN_PRIMARY = {
  background: "#2d7dd2",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
  fontWeight: 600,
  flexShrink: 0
};
const filterChip = active => ({
  background: active ? "#2d7dd2" : "var(--card)",
  color: active ? "#fff" : "var(--tm)",
  border: `1px solid ${active ? "#2d7dd2" : "var(--border)"}`,
  borderRadius: 20,
  padding: "4px 12px",
  fontSize: 11,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap"
});
function loadGanttFilters() {
  try {
    const raw = sessionStorage.getItem(GANTT_FILTER_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === "object") {
        return {
          productFilter: typeof p.productFilter === "string" ? p.productFilter : "all",
          statusFilter: typeof p.statusFilter === "string" ? p.statusFilter : "all",
          sortBy: SORT_OPTIONS.some(o => o.key === p.sortBy) ? p.sortBy : "name"
        };
      }
    }
  } catch {/* ignore */}
  return {
    productFilter: "all",
    statusFilter: "all",
    sortBy: "name"
  };
}
function saveGanttFilters(filters) {
  try {
    sessionStorage.setItem(GANTT_FILTER_KEY, JSON.stringify(filters));
  } catch {/* ignore */}
}
function loadGanttExpanded() {
  try {
    const raw = sessionStorage.getItem(GANTT_EXPAND_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === "object") return p;
    }
  } catch {/* ignore */}
  return {};
}
function saveGanttExpanded(state) {
  try {
    sessionStorage.setItem(GANTT_EXPAND_KEY, JSON.stringify(state));
  } catch {/* ignore */}
}
function groupToGanttStatus(g) {
  const fbas = g.fbaShipments || [];
  if (!fbas.length) return "pending";
  const statuses = fbas.map(f => fbaToGanttStatus(f));
  if (statuses.every(s => s === "done")) return "done";
  if (statuses.some(s => s === "receiving")) return "receiving";
  if (statuses.some(s => s === "arrived")) return "arrived";
  if (statuses.some(s => s === "transit")) return "transit";
  return "pending";
}
function fbaMissingTrack(f) {
  const st = ganttNorm(f.status);
  return GANTT_TRACKING_CHECK_STAGES.includes(st) && !(f.tracking || "").trim();
}
function batchGanttMeta(g, today) {
  const fbas = g.fbaShipments || [];
  let excCount = (g.exceptions || []).filter(e => !e.resolved).length;
  fbas.forEach(f => {
    excCount += (f.exceptions || []).filter(e => !e.resolved).length;
  });
  const missingTrack = fbas.some(fbaMissingTrack);
  const overdue = fbas.some(f => {
    const eta = parseD(f.etaArrival || g.etaArrival || f.windowEnd);
    if (!eta) return false;
    return eta < today && !GANTT_ARRIVED_STAGES.includes(ganttNorm(f.status));
  }) || (() => {
    const eta = parseD(g.etaArrival);
    return eta && eta < today && fbas.length === 0;
  })();
  return {
    excCount,
    missingTrack,
    overdue
  };
}
function dominantStatus(statuses) {
  const order = ["pending", "transit", "arrived", "receiving", "done"];
  if (!statuses.length) return "pending";
  if (statuses.every(s => s === "done")) return "done";
  for (let i = order.length - 2; i >= 0; i--) {
    if (statuses.some(s => s === order[i])) return order[i];
  }
  return "pending";
}
function productGanttSummary(batches) {
  const ships = batches.map(b => parseD(b.shipDate)).filter(Boolean);
  const etas = batches.map(b => parseD(b.etaArrival)).filter(Boolean);
  return {
    shipDate: ships.length ? new Date(Math.min(...ships.map(d => d.getTime()))).toISOString().slice(0, 10) : "",
    etaArrival: etas.length ? new Date(Math.max(...etas.map(d => d.getTime()))).toISOString().slice(0, 10) : "",
    status: dominantStatus(batches.map(b => b.status)),
    excCount: batches.reduce((s, b) => s + (b.excCount || 0), 0),
    overdue: batches.some(b => b.overdue),
    missingTrack: batches.some(b => b.missingTrack),
    batchCount: batches.length
  };
}
const GANTT_STAGE_MAP = {
  备货中: "待出库",
  准备发货: "待出库",
  已发货: "已入仓",
  已出港: "已起运 (开船/起飞)",
  运输中: "在途",
  已到港: "到港",
  接收中: "上架中",
  已完成: "完成"
};
const ganttNorm = s => GANTT_STAGE_MAP[s] || s;
const GANTT_TRANSIT_STAGES = ["清关中", "已起运 (开船/起飞)", "在途"];
function fbaToGanttStatus(fba) {
  const st = ganttNorm(fba.status);
  if (st === "完成") return "done";
  if (st === "上架中") return "receiving";
  if (st === "到港") return "arrived";
  if (GANTT_TRANSIT_STAGES.includes(st)) return "transit";
  return "pending";
}
function productDisplayName(name, sku) {
  if (!sku) return name || "未命名";
  if (!name || name === sku) return sku;
  let rest = name.startsWith(sku) ? name.slice(sku.length) : name;
  rest = rest.replace(/第[一二三四五六七八九十\d]+批/g, "").trim();
  return rest ? `${sku} ${rest}` : sku;
}
function batchLabel(name, sku) {
  if (!name) return "批次";
  if (sku && name.startsWith(sku)) {
    const rest = name.slice(sku.length).trim();
    return rest || name;
  }
  return name;
}
const parseD = s => {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

/** 按 SKU 聚合产品，每个发货批次占甘特图一行（避免同产品多批次重叠） */
function logisticsGroupsToGanttProducts(groups) {
  if (!Array.isArray(groups) || !groups.length) return [];
  const byKey = new Map();
  for (const g of groups) {
    const key = (g.sku || g.name || `id-${g.id}`).trim();
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: key,
        name: productDisplayName(g.name, g.sku),
        sku: g.sku || "",
        batches: []
      });
    }
    const fbas = g.fbaShipments || [];
    const shipCandidates = [g.shipDate, g.etaDeparture, ...fbas.map(f => f.etaDeparture || g.shipDate || g.etaDeparture)].filter(Boolean);
    const etaCandidates = [g.etaArrival, ...fbas.map(f => f.etaArrival || g.etaArrival || f.windowEnd)].filter(Boolean);
    const shipDate = shipCandidates.sort()[0] || "";
    const etaArrival = etaCandidates.sort().slice(-1)[0] || "";
    const todayNorm = new Date();
    todayNorm.setHours(0, 0, 0, 0);
    const meta = batchGanttMeta(g, todayNorm);
    const label = batchLabel(g.name, g.sku);
    byKey.get(key).batches.push({
      id: `g-${g.id}`,
      label,
      status: groupToGanttStatus(g),
      shipDate,
      etaArrival,
      fbaCount: fbas.length,
      sub: fbas.length > 1 ? `${fbas.length} 个货件` : fbas[0]?.warehouse || "",
      excCount: meta.excCount,
      overdue: meta.overdue,
      missingTrack: meta.missingTrack
    });
  }
  for (const p of byKey.values()) {
    p.batches.sort((a, b) => {
      const ta = parseD(a.shipDate)?.getTime() || 0;
      const tb = parseD(b.shipDate)?.getTime() || 0;
      return tb - ta;
    });
  }
  return Array.from(byKey.values());
}
const fmtShort = d => {
  if (!d) return "—";
  if (typeof d === "string") {
    const p = parseD(d);
    if (!p) return "—";
    return `${p.getMonth() + 1}/${p.getDate()}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
function calcBarPos(shipDate, etaArrival, min, totalDays) {
  const start = parseD(shipDate) || parseD(etaArrival);
  const end = parseD(etaArrival) || parseD(shipDate);
  if (!start || !end) return null;
  const s = start < end ? start : end;
  const e = start < end ? end : start;
  return {
    left: (s - min) / 86400000 / totalDays * 100,
    width: Math.max(8, (e - s) / 86400000 / totalDays * 100),
    start: s,
    end: e
  };
}
function GanttAlerts({
  excCount,
  overdue,
  missingTrack,
  compact
}) {
  const items = [];
  if (overdue) items.push({
    t: "逾期",
    c: "#E24B4A",
    bg: "#fee2e2"
  });
  if (excCount > 0) items.push({
    t: `⚠${excCount}`,
    c: "#b45309",
    bg: "#fff0d4"
  });
  if (missingTrack) items.push({
    t: "缺追踪",
    c: "#b91c1c",
    bg: "#fee2e2"
  });
  if (!items.length) return null;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: compact ? 3 : 4,
      flexShrink: 0
    }
  }, items.map(it => /*#__PURE__*/React.createElement("span", {
    key: it.t,
    style: {
      fontSize: compact ? 9 : 10,
      fontWeight: 700,
      padding: compact ? "1px 5px" : "2px 6px",
      borderRadius: 10,
      background: it.bg,
      color: it.c,
      whiteSpace: "nowrap"
    }
  }, it.t)));
}
function GanttTrack({
  shipDate,
  etaArrival,
  status,
  label,
  sub,
  excCount,
  overdue,
  missingTrack,
  min,
  totalDays,
  today,
  height = 40,
  compact = false,
  segments,
  segmentsOnly = false
}) {
  const pos = calcBarPos(shipDate, etaArrival, min, totalDays);
  const st = STATUS[status] || STATUS.pending;
  const trackH = height;
  if (segmentsOnly && segments?.length) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        position: "relative",
        height: trackH,
        background: "#f3f4f6",
        borderRadius: 8,
        border: "1px solid #e5e7eb"
      }
    }, segments.map(seg => {
      const sp = calcBarPos(seg.shipDate, seg.etaArrival, min, totalDays);
      if (!sp) return null;
      const ss = STATUS[seg.status] || STATUS.pending;
      return /*#__PURE__*/React.createElement("div", {
        key: seg.id,
        title: `${seg.label} · ${ss.label} · ${fmtShort(seg.shipDate)}→${fmtShort(seg.etaArrival)}`,
        style: {
          position: "absolute",
          left: `${sp.left}%`,
          width: `${sp.width}%`,
          top: 3,
          bottom: 3,
          background: `linear-gradient(180deg, ${ss.bg}, ${ss.border}88)`,
          border: `1.5px solid ${seg.overdue ? "#E24B4A" : ss.border}`,
          borderRadius: 4,
          minWidth: 4
        }
      });
    }));
  }
  if (!pos) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        height: trackH,
        background: "#f9fafb",
        borderRadius: 8,
        border: "2px dashed #d1d5db",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        color: "#9ca3af"
      }
    }, "\u6682\u65E0\u65E5\u671F\u533A\u95F4");
  }
  const todayInBar = today >= pos.start && today <= pos.end;
  const todayPctInBar = todayInBar ? (today - pos.start) / (pos.end - pos.start) * 100 : null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      position: "relative",
      height: trackH,
      background: "#f3f4f6",
      borderRadius: 8,
      border: "1px solid #e5e7eb",
      boxShadow: "inset 0 1px 2px rgba(0,0,0,0.04)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    title: `${label || ""} ${fmtShort(pos.start)} → ${fmtShort(pos.end)} · ${st.label}`,
    style: {
      position: "absolute",
      left: `${pos.left}%`,
      width: `${pos.width}%`,
      top: 5,
      bottom: 5,
      background: `linear-gradient(180deg, ${st.bg} 0%, ${st.border}33 100%)`,
      border: `2px solid ${overdue ? "#E24B4A" : st.border}`,
      borderRadius: 6,
      boxShadow: overdue ? "0 0 0 1px #fecaca" : "0 1px 3px rgba(0,0,0,0.08)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 8px",
      gap: 6,
      overflow: "hidden",
      minWidth: 48
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: compact ? 9 : 10,
      fontWeight: 700,
      color: st.color,
      flexShrink: 0,
      background: "rgba(255,255,255,0.7)",
      padding: "1px 4px",
      borderRadius: 4
    }
  }, fmtShort(pos.start)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5,
      minWidth: 0,
      flex: 1,
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: st.dot,
      flexShrink: 0,
      boxShadow: `0 0 0 2px ${st.bg}`
    }
  }), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: compact ? 10 : 11,
      fontWeight: 700,
      color: st.color,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, label), sub && !compact && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: st.color,
      opacity: 0.8,
      flexShrink: 0
    }
  }, sub)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(GanttAlerts, {
    excCount: excCount,
    overdue: overdue,
    missingTrack: missingTrack,
    compact: compact
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: compact ? 9 : 10,
      fontWeight: 700,
      color: st.color,
      background: "rgba(255,255,255,0.7)",
      padding: "1px 4px",
      borderRadius: 4
    }
  }, fmtShort(pos.end))), todayPctInBar != null && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: `${todayPctInBar}%`,
      top: -3,
      bottom: -3,
      width: 3,
      background: "#E24B4A",
      borderRadius: 2,
      zIndex: 2,
      pointerEvents: "none"
    },
    title: "\u4ECA\u5929"
  })), segments?.map(seg => {
    const sp = calcBarPos(seg.shipDate, seg.etaArrival, min, totalDays);
    if (!sp) return null;
    const ss = STATUS[seg.status] || STATUS.pending;
    return /*#__PURE__*/React.createElement("div", {
      key: seg.id,
      title: `${seg.label} · ${ss.label}`,
      style: {
        position: "absolute",
        left: `${sp.left}%`,
        width: `${sp.width}%`,
        top: "50%",
        height: 6,
        marginTop: -3,
        background: ss.dot,
        borderRadius: 3,
        opacity: 0.85,
        pointerEvents: "none"
      }
    });
  }));
}
function applyGanttView(products, {
  productFilter,
  statusFilter,
  sortBy
}) {
  let list = products.map(p => ({
    ...p,
    batches: statusFilter === "all" ? [...(p.batches || [])] : (p.batches || []).filter(b => b.status === statusFilter)
  }));
  if (statusFilter !== "all") {
    list = list.filter(p => p.batches.length > 0);
  }
  if (productFilter !== "all") {
    list = list.filter(p => p.id === productFilter);
  }
  const shipKey = p => {
    const times = (p.batches || []).map(b => parseD(b.shipDate)?.getTime()).filter(Boolean);
    return times.length ? Math.max(...times) : 0;
  };
  const etaKey = p => {
    const times = (p.batches || []).map(b => parseD(b.etaArrival)?.getTime()).filter(Boolean);
    return times.length ? Math.min(...times) : Infinity;
  };
  list.sort((a, b) => {
    if (sortBy === "shipDate") return shipKey(b) - shipKey(a);
    if (sortBy === "etaArrival") return etaKey(a) - etaKey(b);
    if (sortBy === "batches") return (b.batches?.length || 0) - (a.batches?.length || 0);
    return String(a.name).localeCompare(String(b.name), "zh");
  });
  return list;
}
async function captureScreenshot(el) {
  if (!el) return;
  const w = el.scrollWidth;
  const h = el.scrollHeight;
  const html = el.outerHTML;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<foreignObject width="100%" height="100%">
<div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;background:var(--card,#fff);font-family:inherit;">
${html}
</div>
</foreignObject></svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * 2;
      canvas.height = h * 2;
      const ctx = canvas.getContext("2d");
      ctx.scale(2, 2);
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--card").trim() || "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0);
      const a = document.createElement("a");
      a.download = `fba-gantt-${new Date().toISOString().slice(0, 10)}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      resolve();
    };
    img.onerror = reject;
    img.src = url;
  });
}
function GanttTimeline({
  products,
  today
}) {
  const [expanded, setExpanded] = useState(loadGanttExpanded);
  useEffect(() => {
    saveGanttExpanded(expanded);
  }, [expanded]);
  const toggleProduct = id => setExpanded(prev => ({
    ...prev,
    [id]: prev[id] !== true
  }));
  const {
    min,
    totalDays,
    weeks,
    todayPct
  } = useMemo(() => {
    let minD = new Date(today);
    let maxD = new Date(today);
    products.forEach(p => {
      (p.batches || []).forEach(b => {
        [b.shipDate, b.etaArrival].forEach(s => {
          const d = parseD(s);
          if (!d) return;
          if (d < minD) minD = new Date(d);
          if (d > maxD) maxD = new Date(d);
        });
      });
    });
    minD.setDate(minD.getDate() - 7);
    maxD.setDate(maxD.getDate() + 21);
    const totalDays = Math.max(1, Math.round((maxD - minD) / 86400000));
    const weeks = [];
    const cur = new Date(minD);
    cur.setDate(cur.getDate() - cur.getDay());
    while (cur <= maxD) {
      weeks.push(new Date(cur));
      cur.setDate(cur.getDate() + 7);
    }
    const todayPct = (today - minD) / 86400000 / totalDays * 100;
    return {
      min: minD,
      max: maxD,
      totalDays,
      weeks,
      todayPct
    };
  }, [products, today]);
  const LABEL_W = 180;
  const TodayLine = () => todayPct >= 0 && todayPct <= 100 ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: `${todayPct}%`,
      top: 0,
      bottom: 0,
      width: 2,
      background: "#E24B4A",
      zIndex: 3,
      pointerEvents: "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: -14,
      left: -10,
      fontSize: 9,
      color: "#E24B4A",
      fontWeight: 700,
      whiteSpace: "nowrap"
    }
  }, "\u4ECA\u5929")) : null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 720
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      marginLeft: LABEL_W,
      borderBottom: "2px solid var(--border)",
      paddingBottom: 6,
      marginBottom: 10
    }
  }, weeks.map((w, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      minWidth: 56,
      fontSize: 10,
      fontWeight: 600,
      color: "var(--tm)",
      textAlign: "center"
    }
  }, w.getMonth() + 1, "/", w.getDate()))), products.map(p => {
    const isOpen = expanded[p.id] === true;
    const batches = p.batches || [];
    const batchCount = batches.length;
    const summary = productGanttSummary(batches);
    return /*#__PURE__*/React.createElement("div", {
      key: p.id,
      style: {
        marginBottom: 10,
        paddingBottom: 8,
        borderBottom: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 6,
        minHeight: 44
      }
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => toggleProduct(p.id),
      title: isOpen ? "收起产品" : "展开产品",
      style: {
        width: 26,
        height: 26,
        flexShrink: 0,
        background: "#eff6ff",
        border: "1px solid #93c5fd",
        borderRadius: 6,
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 11,
        color: "#2563eb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }
    }, isOpen ? "▼" : "▶"), /*#__PURE__*/React.createElement("div", {
      style: {
        width: LABEL_W - 32,
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: "var(--text)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }
    }, p.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: "var(--tm)",
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("span", null, p.sku || "—", " \xB7 ", batchCount, " \u6279"), summary.shipDate && summary.etaArrival && /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600,
        color: "var(--text)"
      }
    }, fmtShort(summary.shipDate), " \u2192 ", fmtShort(summary.etaArrival)), /*#__PURE__*/React.createElement(GanttAlerts, {
      excCount: summary.excCount,
      overdue: summary.overdue,
      missingTrack: summary.missingTrack,
      compact: true
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement(TodayLine, null), /*#__PURE__*/React.createElement(GanttTrack, {
      shipDate: summary.shipDate,
      etaArrival: summary.etaArrival,
      status: summary.status,
      label: isOpen ? null : `${batchCount} 批汇总`,
      excCount: isOpen ? 0 : summary.excCount,
      overdue: summary.overdue,
      missingTrack: isOpen ? false : summary.missingTrack,
      min: min,
      totalDays: totalDays,
      today: today,
      height: isOpen ? 18 : 44,
      compact: !isOpen,
      segments: isOpen ? batches : null,
      segmentsOnly: isOpen
    }))), isOpen && batches.map(b => /*#__PURE__*/React.createElement("div", {
      key: b.id,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 8,
        marginLeft: 32
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: LABEL_W - 32,
        flexShrink: 0,
        paddingLeft: 4
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      },
      title: b.label
    }, b.label), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "var(--tm)",
        display: "flex",
        alignItems: "center",
        gap: 4,
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600,
        color: STATUS[b.status]?.color
      }
    }, STATUS[b.status]?.label), b.sub && /*#__PURE__*/React.createElement("span", null, "\xB7 ", b.sub), /*#__PURE__*/React.createElement(GanttAlerts, {
      excCount: b.excCount,
      overdue: b.overdue,
      missingTrack: b.missingTrack,
      compact: true
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement(TodayLine, null), /*#__PURE__*/React.createElement(GanttTrack, {
      shipDate: b.shipDate,
      etaArrival: b.etaArrival,
      status: b.status,
      label: b.label,
      sub: b.sub,
      excCount: b.excCount,
      overdue: b.overdue,
      missingTrack: b.missingTrack,
      min: min,
      totalDays: totalDays,
      today: today,
      height: 44
    })))));
  })));
}
function FBAGanttCard({
  groups = [],
  today: todayProp,
  productFilter: controlledProductFilter
}) {
  const saved = loadGanttFilters();
  const isProductControlled = controlledProductFilter !== undefined;
  const [internalProductFilter, setInternalProductFilter] = useState(saved.productFilter);
  const productFilter = isProductControlled ? controlledProductFilter : internalProductFilter;
  const [statusFilter, setStatusFilter] = useState(saved.statusFilter);
  const [sortBy, setSortBy] = useState(saved.sortBy);
  useEffect(() => {
    if (isProductControlled) {
      const prev = loadGanttFilters();
      saveGanttFilters({
        ...prev,
        statusFilter,
        sortBy
      });
    } else {
      saveGanttFilters({
        productFilter,
        statusFilter,
        sortBy
      });
    }
  }, [productFilter, statusFilter, sortBy, isProductControlled]);
  const today = useMemo(() => {
    const d = todayProp ? new Date(todayProp) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [todayProp]);
  const allProducts = useMemo(() => logisticsGroupsToGanttProducts(groups), [groups]);
  const viewProducts = useMemo(() => applyGanttView(allProducts, {
    productFilter,
    statusFilter,
    sortBy
  }), [allProducts, productFilter, statusFilter, sortBy]);
  useEffect(() => {
    if (isProductControlled || productFilter === "all" || allProducts.some(p => p.id === productFilter)) return;
    setInternalProductFilter("all");
  }, [allProducts, productFilter, isProductControlled]);
  const chartRef = useRef(null);
  const datedBatchCount = viewProducts.reduce((n, p) => n + (p.batches || []).filter(b => b.shipDate || b.etaArrival).length, 0);
  const hasFilters = !isProductControlled && productFilter !== "all" || statusFilter !== "all";
  const setProduct = id => {
    if (!isProductControlled) setInternalProductFilter(id);
  };
  const setStatus = key => setStatusFilter(key);
  const resetFilters = () => {
    if (!isProductControlled) setInternalProductFilter("all");
    setStatusFilter("all");
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: "1rem 1.25rem",
      marginBottom: "1rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginBottom: 12,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: "var(--text)"
    }
  }, "FBA \u7269\u6D41\u770B\u677F"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginTop: 2
    }
  }, "\u7518\u7279\u65F6\u95F4\u8F74 \xB7 \u81EA\u52A8\u540C\u6B65\u4E0B\u65B9\u53D1\u8D27\u6279\u6B21", allProducts.length > 0 && /*#__PURE__*/React.createElement("span", null, " \xB7 ", viewProducts.length, "/", allProducts.length, " \u4E2A\u4EA7\u54C1 \xB7 \u6BCF\u6279\u6B21\u72EC\u7ACB\u4E00\u884C"))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => captureScreenshot(chartRef.current).catch(() => alert("截图失败，请重试")),
    style: BTN_PRIMARY
  }, "\uD83D\uDCF7 \u622A\u56FE")), allProducts.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      marginBottom: 12
    }
  }, !isProductControlled && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      flexShrink: 0
    }
  }, "\u4EA7\u54C1"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setProduct("all"),
    style: filterChip(productFilter === "all")
  }, "\u5168\u90E8"), allProducts.map(p => /*#__PURE__*/React.createElement("button", {
    key: p.id,
    type: "button",
    onClick: () => setProduct(p.id),
    style: filterChip(productFilter === p.id),
    title: p.name
  }, p.sku || p.name, p.batches?.length > 1 ? ` (${p.batches.length})` : ""))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      flexShrink: 0
    }
  }, "\u72B6\u6001"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setStatus("all"),
    style: filterChip(statusFilter === "all")
  }, "\u5168\u90E8"), Object.entries(STATUS).map(([k, v]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    type: "button",
    onClick: () => setStatus(k),
    style: filterChip(statusFilter === k)
  }, v.label))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      flexShrink: 0
    }
  }, "\u6392\u5E8F"), SORT_OPTIONS.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.key,
    type: "button",
    onClick: () => setSortBy(o.key),
    style: filterChip(sortBy === o.key)
  }, o.label)), hasFilters && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: resetFilters,
    style: {
      ...filterChip(false),
      marginLeft: 4,
      color: "#2d7dd2",
      borderColor: "#b8d4f0"
    }
  }, "\u6E05\u9664\u7B5B\u9009"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      marginBottom: 12,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, Object.entries(STATUS).map(([k, v]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      fontSize: 10,
      color: v.color,
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: 3,
      background: v.bg,
      border: `2px solid ${v.border}`
    }
  }), v.label)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "#E24B4A",
      fontWeight: 600
    }
  }, "| \u903E\u671F\u7EA2\u6846"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "#b45309",
      fontWeight: 600
    }
  }, "\u26A0 \u5F02\u5E38"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "#b91c1c",
      fontWeight: 600
    }
  }, "\u7F3A\u8FFD\u8E2A")), /*#__PURE__*/React.createElement("div", {
    ref: chartRef
  }, !allProducts.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "2rem",
      color: "var(--tm)",
      fontSize: 13
    }
  }, "\u6682\u65E0\u6279\u6B21\uFF0C\u8BF7\u5148\u5728\u4E0B\u65B9\u300C\u5BFC\u5165 CSV\u300D\u6216\u300C+ \u65B0\u5EFA\u6279\u6B21\u300D") : !viewProducts.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "2rem",
      color: "var(--tm)",
      fontSize: 13
    }
  }, "\u6CA1\u6709\u7B26\u5408\u7B5B\u9009\u6761\u4EF6\u7684\u4EA7\u54C1", /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: resetFilters,
    style: {
      display: "block",
      margin: "8px auto 0",
      background: "none",
      border: "none",
      color: "#2d7dd2",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "\u6E05\u9664\u7B5B\u9009")) : datedBatchCount === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "2rem",
      color: "var(--tm)",
      fontSize: 13
    }
  }, "\u5F53\u524D\u4EA7\u54C1\u6682\u65E0\u65E5\u671F\u6570\u636E\uFF0C\u8BF7\u5728\u4E0B\u65B9\u7684\u6279\u6B21\u4E2D\u586B\u5199\u51FA\u8D27\u65E5\u6216\u9884\u8BA1\u5230\u6E2F") : /*#__PURE__*/React.createElement(GanttTimeline, {
    products: viewProducts,
    today: today
  })));
}

// ─── LOGISTICS MODULE (Shipment Group + FBA) ─────────────────────────
/** 头程状态与 FBA 货件状态共用 */
const SHIPMENT_STAGES = ["待出库", "已入仓", "清关中", "已起运 (开船/起飞)", "在途", "到港", "上架中", "完成"];
const LEGACY_STAGE_MAP = {
  备货中: "待出库",
  准备发货: "待出库",
  已发货: "已入仓",
  已出港: "已起运 (开船/起飞)",
  运输中: "在途",
  已到港: "到港",
  接收中: "上架中",
  已完成: "完成"
};
const DEFAULT_SHIPMENT_STAGE = "待出库";
const normalizeShipmentStage = s => LEGACY_STAGE_MAP[s] || (SHIPMENT_STAGES.includes(s) ? s : DEFAULT_SHIPMENT_STAGE);
const stageColor = s => ({
  待出库: "#9ca3af",
  已入仓: "#6b7280",
  "已起运 (开船/起飞)": "#5b6abf",
  清关中: "#7a6dd2",
  在途: "#2d7dd2",
  到港: "#1a9e8a",
  上架中: "#7a6dd2",
  完成: "#2d9e52"
})[normalizeShipmentStage(s)] || "#888";
const STAGE_STYLE = {
  缺少追踪编码: {
    bg: "#fee2e2",
    c: "#E24B4A"
  },
  待出库: {
    bg: "#f3f4f6",
    c: "#6b7280"
  },
  已入仓: {
    bg: "#e5e7eb",
    c: "#4b5563"
  },
  "已起运 (开船/起飞)": {
    bg: "#e0e7ff",
    c: "#3730a3"
  },
  清关中: {
    bg: "#ede9fe",
    c: "#5b21b6"
  },
  在途: {
    bg: "#dceeff",
    c: "#2d7dd2"
  },
  到港: {
    bg: "#d1fae5",
    c: "#1a9e8a"
  },
  上架中: {
    bg: "#ede9fe",
    c: "#6b21a8"
  },
  完成: {
    bg: "#d4f0dc",
    c: "#2d9e52"
  }
};
const TRACKING_CHECK_STAGES = ["已入仓", "清关中", "已起运 (开船/起飞)", "在途"];
const HEAD_TRANSIT_STAGES = ["清关中", "已起运 (开船/起飞)", "在途"];
const headArrivedOrLater = s => ["到港", "上架中", "完成"].includes(normalizeShipmentStage(s));
const TRANSPORT_META = {
  海运: {
    icon: "🚢",
    bg: "#dceeff",
    c: "#1a4e8a"
  },
  空运: {
    icon: "✈",
    bg: "#ede9fe",
    c: "#4c1d95"
  },
  快递: {
    icon: "📦",
    bg: "#fef3c7",
    c: "#78350f"
  }
};
const fmtWindow = (s, e) => !s && !e ? "—" : `${s ? fmtD(s) : "?"} – ${e ? fmtD(e) : "?"}`;
const fbaEffectiveStatus = fba => {
  const st = normalizeShipmentStage(fba.status);
  if (TRACKING_CHECK_STAGES.includes(st) && !(fba.tracking || "").trim()) return "缺少追踪编码";
  return st;
};
const batchMissingTrack = g => (g.fbaShipments || []).some(s => fbaEffectiveStatus(s) === "缺少追踪编码");
const batchReceiving = g => (g.fbaShipments || []).some(s => normalizeShipmentStage(s.status) === "上架中");
const batchAllDone = g => (g.fbaShipments || []).length > 0 && (g.fbaShipments || []).every(s => normalizeShipmentStage(s.status) === "完成");
const deriveHeadStatus = fbaShipments => {
  const fbas = fbaShipments || [];
  if (!fbas.length) return DEFAULT_SHIPMENT_STAGE;
  const indices = fbas.map(f => SHIPMENT_STAGES.indexOf(normalizeShipmentStage(f.status))).filter(i => i >= 0);
  return indices.length ? SHIPMENT_STAGES[Math.min(...indices)] : DEFAULT_SHIPMENT_STAGE;
};
const batchHeadTransit = g => {
  const fbas = g.fbaShipments || [];
  if (fbas.length) return fbas.some(f => HEAD_TRANSIT_STAGES.includes(normalizeShipmentStage(f.status)));
  return HEAD_TRANSIT_STAGES.includes(normalizeShipmentStage(g.headStatus));
};
const fbaEtaArrival = (fba, batch) => fba.etaArrival || batch?.etaArrival || fba.windowEnd || "";
const fbaOpenExcCount = fba => (fba.exceptions || []).filter(e => !e.resolved).length;
const fbaAllExceptions = (fba, batch, fbaIndex = 0) => {
  if ((fba.exceptions || []).length) return fba.exceptions;
  if (fbaIndex === 0 && (batch?.exceptions || []).length) return batch.exceptions;
  return [];
};
const openExcCount = g => {
  let n = (g.exceptions || []).filter(e => !e.resolved).length;
  (g.fbaShipments || []).forEach(f => {
    n += fbaOpenExcCount(f);
  });
  return n;
};
const fbaOverdue = (fba, batch) => {
  const d = daysDiff(fbaEtaArrival(fba, batch));
  return d !== null && d < 0 && !headArrivedOrLater(fba.status);
};
const batchHeadOverdue = g => {
  const fbas = g.fbaShipments || [];
  if (fbas.length) return fbas.some(f => fbaOverdue(f, g));
  const d = daysDiff(g.etaArrival);
  return d !== null && d < 0;
};
const batchEarliestEtaDiff = g => {
  const diffs = (g.fbaShipments || []).map(f => daysDiff(fbaEtaArrival(f, g))).filter(d => d !== null);
  if (diffs.length) return Math.min(...diffs);
  return daysDiff(g.etaArrival);
};
const batchDisplayQty = group => {
  const fbas = group.fbaShipments || [];
  if (fbas.length) return sumFbaExpectedQty(fbas);
  return group.totalQty || 0;
};
const ensureFbaDefaults = (fba, batch) => ({
  ...fba,
  etaArrival: fba.etaArrival || batch?.etaArrival || "",
  etaDeparture: fba.etaDeparture || batch?.etaDeparture || "",
  exceptions: fba.exceptions || []
});
const sumFbaExpectedQty = fbaShipments => (fbaShipments || []).reduce((s, f) => s + (Number(f.expectedQty) || 0), 0);
// ─── Amazon STA CSV import ───────────────────────────────────────────
const parseCsvRow = line => {
  const cells = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (c === "," && !inQuote) {
      cells.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  cells.push(cur);
  return cells.map(s => s.trim());
};
const warehouseFromStaName = name => {
  const m = (name || "").match(/-([A-Z0-9]{3,5})\s*$/);
  return m ? m[1] : "";
};
const isoFromStaName = name => {
  const m = (name || "").match(/\((\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return "";
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
};
const addDaysIso = (iso, days) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const parseAmazonStaCsv = (text, id) => {
  const warnings = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const meta = {};
  for (const line of lines.slice(0, 15)) {
    if (!line.trim()) continue;
    const row = parseCsvRow(line);
    if (row.length >= 2 && row[0] && row[1] && row[0] !== "SKU") meta[row[0]] = row[1];
  }
  const fbaId = meta["货件编号"] || "";
  const name = meta["货件名称"] || "";
  if (!fbaId && !name) throw new Error("不是有效的 STA 货件 CSV");
  let skuInfo = null;
  for (let i = 0; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    if (row[0] !== "SKU") continue;
    const header = row;
    const data = parseCsvRow(lines[i + 1] || "");
    if (!data[0] || data[0] === "SKU") break;
    const idx = k => header.indexOf(k);
    skuInfo = {
      sku: data[idx("SKU")] || data[0],
      asin: data[idx("ASIN")] || "",
      fnsku: data[idx("FNSKU")] || "",
      units: +(data[idx("商品总数")] || 0)
    };
    break;
  }
  const warehouse = warehouseFromStaName(name);
  if (!warehouse) warnings.push("未解析到仓库代码");
  const windowStart = isoFromStaName(name);
  let expectedQty = +(meta["商品数量"] || 0);
  if (skuInfo?.units) expectedQty = skuInfo.units;
  if (!expectedQty) warnings.push("商品数量为 0");
  const note = [meta["配送地址"] && `配送 ${meta["配送地址"]}`, meta["箱子数量"] && `${meta["箱子数量"]} 箱`, skuInfo?.fnsku && `FNSKU ${skuInfo.fnsku}`].filter(Boolean).join(" · ");
  return {
    fba: {
      id,
      name,
      fbaId,
      internalId: (meta["工作流程名称"] || "").slice(0, 8).toUpperCase(),
      warehouse,
      expectedQty,
      receivedQty: 0,
      windowStart,
      windowEnd: addDaysIso(windowStart, 6),
      etaDeparture: "",
      etaArrival: addDaysIso(windowStart, 6),
      tracking: "",
      status: DEFAULT_SHIPMENT_STAGE,
      exceptions: [],
      note
    },
    sku: skuInfo?.sku || "",
    warnings
  };
};
const readStaCsvFiles = async fileList => {
  const files = Array.from(fileList);
  const baseId = Date.now();
  const parsed = await Promise.all(files.map((f, i) => f.text().then(t => parseAmazonStaCsv(t, baseId + i))));
  return {
    fbaShipments: parsed.map(p => p.fba),
    totalQty: parsed.reduce((s, p) => s + (p.fba.expectedQty || 0), 0),
    sku: parsed.find(p => p.sku)?.sku || "",
    warnings: parsed.flatMap((p, i) => p.warnings.map(w => `${files[i].name}: ${w}`))
  };
};
const normalizeFbaId = id => (id || "").trim().toUpperCase();
const collectFbaIdsFromGroups = (groups, excludeGroupId = null) => {
  const ids = new Set();
  for (const g of groups || []) {
    if (excludeGroupId != null && g.id === excludeGroupId) continue;
    for (const s of g.fbaShipments || []) {
      const fid = normalizeFbaId(s.fbaId);
      if (fid) ids.add(fid);
    }
  }
  return ids;
};
const splitDuplicateFbaImports = (incoming, existingIds) => {
  const seen = new Set(existingIds);
  const unique = [];
  const dupes = [];
  for (const f of incoming) {
    const fid = normalizeFbaId(f.fbaId);
    if (fid && seen.has(fid)) {
      dupes.push(fid);
      continue;
    }
    if (fid) seen.add(fid);
    unique.push(f);
  }
  return {
    unique,
    dupes
  };
};
const formatDuplicateFbaMsg = (dupes, action) => {
  const list = [...new Set(dupes)].join("、");
  return dupes.length === 1 ? `FBA 货件编号 ${list} 已存在，${action}` : `以下 FBA 货件编号已存在，${action}：${list}`;
};
const groupProductKey = g => (g.sku || g.name || `id-${g.id}`).trim();
const groupMatchesProduct = (g, productFilter) => productFilter === "all" || groupProductKey(g) === productFilter;
const productTabChip = active => ({
  background: active ? "#2d7dd2" : "var(--card)",
  color: active ? "#fff" : "var(--text)",
  border: `1px solid ${active ? "#2d7dd2" : "var(--border)"}`,
  borderRadius: 10,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: active ? 600 : 500,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap"
});
const INIT_LOGISTICS = [{
  id: 1,
  name: "FB100绿色第三批",
  sku: "FB100",
  totalQty: 800,
  owner: "陈工",
  shipDate: "2026-04-10",
  transport: "海运",
  forwarder: "中外运华南",
  blNumber: "COSU6284731",
  etaDeparture: "2026-05-15",
  etaArrival: "2026-06-08",
  headStatus: "在途",
  note: "正常在途",
  exceptions: [],
  fbaShipments: [{
    id: 101,
    name: "FBA STA (04/20/2026 10:14)-RDU2",
    fbaId: "FBA19BWMS0S7",
    internalId: "11VGG45G",
    warehouse: "RDU2",
    expectedQty: 144,
    receivedQty: 0,
    windowStart: "2026-05-31",
    windowEnd: "2026-06-06",
    etaDeparture: "2026-05-15",
    etaArrival: "2026-06-08",
    tracking: "",
    status: "已入仓",
    exceptions: [],
    note: ""
  }, {
    id: 102,
    name: "FBA STA (04/20/2026 10:14)-SWF2",
    fbaId: "FBA19BWMT1K3",
    internalId: "22HJK89M",
    warehouse: "SWF2",
    expectedQty: 160,
    receivedQty: 0,
    windowStart: "2026-06-01",
    windowEnd: "2026-06-07",
    etaDeparture: "2026-05-15",
    etaArrival: "2026-06-08",
    tracking: "1Z999AA10123456784",
    status: "在途",
    exceptions: [],
    note: ""
  }, {
    id: 103,
    name: "FBA STA (04/20/2026 10:14)-IAH3",
    fbaId: "FBA19BWMV4P9",
    internalId: "33PLM12N",
    warehouse: "IAH3",
    expectedQty: 168,
    receivedQty: 120,
    windowStart: "2026-05-28",
    windowEnd: "2026-06-03",
    etaDeparture: "2026-05-15",
    etaArrival: "2026-06-08",
    tracking: "TBA6284731003",
    status: "上架中",
    exceptions: [],
    note: ""
  }, {
    id: 104,
    name: "FBA STA (04/20/2026 10:14)-MDW2",
    fbaId: "FBA19BWMX7R2",
    internalId: "44QRS56T",
    warehouse: "MDW2",
    expectedQty: 176,
    receivedQty: 176,
    windowStart: "2026-05-20",
    windowEnd: "2026-05-26",
    etaDeparture: "2026-05-15",
    etaArrival: "2026-06-08",
    tracking: "FBA6284731004",
    status: "完成",
    exceptions: [],
    note: ""
  }, {
    id: 105,
    name: "FBA STA (04/20/2026 10:14)-ORF2",
    fbaId: "FBA19BWMZ9T5",
    internalId: "55UVW78X",
    warehouse: "ORF2",
    expectedQty: 152,
    receivedQty: 0,
    windowStart: "2026-06-05",
    windowEnd: "2026-06-11",
    etaDeparture: "2026-05-15",
    etaArrival: "2026-06-08",
    tracking: "",
    status: "已入仓",
    exceptions: [],
    note: ""
  }]
}, {
  id: 2,
  name: "FB101白色第二批",
  sku: "FB101",
  totalQty: 300,
  owner: "陈工",
  shipDate: "2026-05-08",
  transport: "空运",
  forwarder: "顺丰国际",
  blNumber: "SF20260508001",
  etaDeparture: "2026-05-12",
  etaArrival: "2026-05-18",
  headStatus: "到港",
  note: "",
  exceptions: [],
  fbaShipments: [{
    id: 201,
    name: "FBA STA (05/08/2026 09:30)-LAX9",
    fbaId: "FBA19BXAA1B2",
    internalId: "66ABC01D",
    warehouse: "LAX9",
    expectedQty: 300,
    receivedQty: 280,
    windowStart: "2026-05-22",
    windowEnd: "2026-05-28",
    etaDeparture: "2026-05-12",
    etaArrival: "2026-05-18",
    tracking: "SF6284732001",
    status: "上架中",
    exceptions: [{
      desc: "IAH3 仓库拒收部分箱",
      date: "2026-05-25",
      resolved: false,
      action: "货代协调重新配送"
    }],
    note: ""
  }]
}, {
  id: 3,
  name: "FB200黑色第一批",
  sku: "FB200",
  totalQty: 200,
  owner: "李工",
  shipDate: "2026-05-01",
  transport: "海运",
  forwarder: "马士基订舱",
  blNumber: "MAEU9876543",
  etaDeparture: "2026-05-28",
  etaArrival: "2026-06-25",
  headStatus: "待出库",
  note: "等工厂尾数",
  exceptions: [],
  fbaShipments: [{
    id: 301,
    name: "FBA STA (05/01/2026 14:00)-ONT8",
    fbaId: "FBA19BYCC3D4",
    internalId: "77DEF02G",
    warehouse: "ONT8",
    expectedQty: 200,
    receivedQty: 0,
    windowStart: "2026-06-20",
    windowEnd: "2026-06-26",
    etaDeparture: "2026-05-28",
    etaArrival: "2026-06-25",
    tracking: "",
    status: "待出库",
    exceptions: [],
    note: ""
  }]
}];
function ExceptionEditor({
  excs,
  setExcs
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--tm)",
      borderTop: "1px solid var(--border)",
      paddingTop: 10,
      marginBottom: 8
    }
  }, "\u5F02\u5E38\u8BB0\u5F55"), excs.map((ex, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      background: ex.resolved ? "#f0faf4" : "#fff8e6",
      border: `1px solid ${ex.resolved ? "#b7e4c7" : "#ffe0a0"}`,
      borderRadius: 8,
      padding: "10px 12px",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: ex.desc,
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        desc: e.target.value
      };
      setExcs(a);
    },
    placeholder: "\u5F02\u5E38\u63CF\u8FF0",
    style: {
      ...inpSm,
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: ex.date,
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        date: e.target.value
      };
      setExcs(a);
    },
    style: {
      ...inpSm,
      width: 120
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: ex.action,
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        action: e.target.value
      };
      setExcs(a);
    },
    placeholder: "\u5904\u7406\u65B9\u5F0F / \u8DDF\u8FDB\u52A8\u4F5C",
    style: {
      ...inpSm,
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("label", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      fontSize: 11,
      color: "var(--tm)",
      whiteSpace: "nowrap",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: ex.resolved,
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        resolved: e.target.checked
      };
      setExcs(a);
    }
  }), "\u5DF2\u89E3\u51B3"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setExcs(excs.filter((_, j) => j !== i)),
    style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      color: "#aaa",
      fontSize: 16
    }
  }, "\xD7")))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setExcs([...excs, {
      desc: "",
      date: TODAY.toISOString().split("T")[0],
      action: "",
      resolved: false
    }]),
    style: {
      width: "100%",
      border: "1px dashed var(--border)",
      borderRadius: 8,
      padding: "5px 0",
      fontSize: 12,
      cursor: "pointer",
      color: "var(--tm)",
      background: "transparent",
      marginBottom: 12,
      fontFamily: "inherit"
    }
  }, "+ \u8BB0\u5F55\u5F02\u5E38"));
}
function FbaStatusBadge({
  fba
}) {
  const st = fbaEffectiveStatus(fba);
  const s = STAGE_STYLE[st] || STAGE_STYLE[DEFAULT_SHIPMENT_STAGE];
  return /*#__PURE__*/React.createElement("span", {
    style: badge(s.bg, s.c)
  }, st);
}
function StageDotLine({
  stage,
  dotSize = 7,
  connector = true
}) {
  const st = normalizeShipmentStage(stage);
  const stageIdx = SHIPMENT_STAGES.indexOf(st);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      width: "100%"
    }
  }, SHIPMENT_STAGES.map((s, i) => {
    const done = i < stageIdx;
    const active = i === stageIdx;
    const c = active ? stageColor(s) : done ? "#2d9e52" : "var(--border)";
    const size = active ? dotSize : Math.max(5, dotSize - 2);
    return /*#__PURE__*/React.createElement("span", {
      key: s,
      style: {
        display: "flex",
        alignItems: "center",
        flex: connector && i < SHIPMENT_STAGES.length - 1 ? 1 : "none"
      },
      title: s
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: size,
        height: size,
        borderRadius: "50%",
        background: c,
        outline: active ? `2px solid ${c}` : "none",
        outlineOffset: 1,
        flexShrink: 0
      }
    }), connector && i < SHIPMENT_STAGES.length - 1 && /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        height: 2,
        background: done ? "#2d9e52" : "var(--border)",
        margin: "0 1px"
      }
    }));
  }));
}
function FbaArrivalHint({
  fba,
  batch
}) {
  const eta = fbaEtaArrival(fba, batch);
  const d = daysDiff(eta);
  if (headArrivedOrLater(fba.status)) return /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--tm)"
    }
  }, "\u5DF2\u62B5\u8FBE");
  if (d === null) return /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--tm)"
    }
  }, "\u62B5\u8FBE \u2014");
  if (d < 0) return /*#__PURE__*/React.createElement("span", {
    style: badge("#fee2e2", "#E24B4A")
  }, "\u903E\u671F ", Math.abs(d), " \u5929");
  if (d === 0) return /*#__PURE__*/React.createElement("span", {
    style: badge("#fff0d4", "#7a4a00")
  }, "\u4ECA\u65E5\u62B5\u8FBE");
  if (d <= 7) return /*#__PURE__*/React.createElement("span", {
    style: badge("#dceeff", "#1a4e8a")
  }, fmtD(eta), " \xB7 ", d, " \u5929");
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--tm)"
    }
  }, "\u62B5\u8FBE ", fmtD(eta));
}
function FbaExceptionList({
  exceptions
}) {
  const list = exceptions || [];
  if (!list.length) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      display: "flex",
      flexDirection: "column",
      gap: 4
    },
    onClick: e => e.stopPropagation()
  }, list.map((ex, i) => {
    const resolved = !!ex.resolved;
    const desc = (ex.desc || "").trim() || "（未填写描述）";
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        fontSize: 10,
        lineHeight: 1.45,
        padding: "6px 8px",
        borderRadius: 6,
        background: resolved ? "#f0faf4" : "#fff8e6",
        border: `1px solid ${resolved ? "#b7e4c7" : "#ffe0a0"}`,
        color: resolved ? "#2d6a4f" : "#7a4a00"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600
      }
    }, resolved ? "✓ " : "⚠ ", desc), ex.action && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 4,
        opacity: 0.9
      }
    }, "\xB7 ", ex.action), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 4,
        opacity: 0.75
      }
    }, "\xB7 ", ex.date ? fmtD(ex.date) : "—", resolved ? " 已解决" : " 未解决"));
  }));
}
function FbaStageTrack({
  fba,
  batch,
  fbaIndex = 0
}) {
  const f = ensureFbaDefaults(fba, batch);
  const st = normalizeShipmentStage(f.status);
  const stageIdx = SHIPMENT_STAGES.indexOf(st);
  const prog = stageIdx >= 0 ? Math.round(stageIdx / (SHIPMENT_STAGES.length - 1) * 100) : 0;
  const excN = fbaOpenExcCount(f);
  const overdue = fbaOverdue(f, batch);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 12,
      padding: "10px 12px",
      background: "var(--bg)",
      borderRadius: 10,
      border: `1px solid ${overdue ? "#fecaca" : excN ? "#ffe0a0" : "var(--border)"}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginBottom: 6,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: badge("#ede9fe", "#4c1d95", {
      fontSize: 10,
      fontWeight: 700,
      padding: "3px 6px"
    })
  }, f.warehouse || "—"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, f.fbaId || f.name || "货件"), f.expectedQty > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--tm)"
    }
  }, f.expectedQty, " \u4EF6")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement(FbaStatusBadge, {
    fba: f
  }), /*#__PURE__*/React.createElement(FbaArrivalHint, {
    fba: f,
    batch: batch
  }), excN > 0 && /*#__PURE__*/React.createElement("span", {
    style: badge("#fff0d4", "#e09000")
  }, "\u26A0 ", excN, " \u5F02\u5E38"))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 3,
      background: "var(--border)",
      borderRadius: 2,
      overflow: "hidden",
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: `${prog}%`,
      background: stageColor(st),
      borderRadius: 2
    }
  })), /*#__PURE__*/React.createElement(StageDotLine, {
    stage: f.status,
    dotSize: 6
  }), /*#__PURE__*/React.createElement(FbaExceptionList, {
    exceptions: fbaAllExceptions(f, batch, fbaIndex)
  }));
}
function FbaRow({
  fba,
  onEditTracking
}) {
  const [editing, setEditing] = useState(false);
  const [trackVal, setTrackVal] = useState(fba.tracking || "");
  const missing = fbaEffectiveStatus(fba) === "缺少追踪编码";
  const saveTrack = () => {
    onEditTracking(fba.id, trackVal.trim());
    setEditing(false);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "10px 12px",
      borderBottom: "1px solid var(--border)",
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      marginBottom: 3,
      lineHeight: 1.4
    }
  }, fba.name), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--tm)",
      marginBottom: 6
    }
  }, fba.fbaId, fba.internalId ? ` · ${fba.internalId}` : ""), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      alignItems: "center",
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--tm)"
    }
  }, "\u914D\u9001 ", fmtWindow(fba.windowStart, fba.windowEnd)), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--tm)"
    }
  }, fba.expectedQty, " \u4EF6", fba.receivedQty > 0 ? ` / 已收 ${fba.receivedQty}` : "")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap"
    }
  }, editing ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("input", {
    value: trackVal,
    onChange: e => setTrackVal(e.target.value),
    placeholder: "\u8F93\u5165\u8FFD\u8E2A\u7F16\u7801",
    style: {
      ...inpSm,
      flex: 1,
      minWidth: 140
    },
    autoFocus: true,
    onKeyDown: e => {
      if (e.key === "Enter") saveTrack();
      if (e.key === "Escape") setEditing(false);
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: saveTrack,
    style: {
      background: "#2d7dd2",
      color: "#fff",
      border: "none",
      borderRadius: 6,
      padding: "4px 10px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "\u4FDD\u5B58")) : missing ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: e => {
      e.stopPropagation();
      setTrackVal(fba.tracking || "");
      setEditing(true);
    },
    style: {
      background: "none",
      border: "none",
      padding: 0,
      cursor: "pointer",
      color: "#E24B4A",
      fontSize: 11,
      fontWeight: 600,
      fontFamily: "inherit"
    }
  }, "\u7F3A\u5C11\u8FFD\u8E2A\u7F16\u7801 \xB7 \u70B9\u51FB\u586B\u5199") : /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--tm)",
      cursor: "pointer"
    },
    onClick: e => {
      e.stopPropagation();
      setTrackVal(fba.tracking || "");
      setEditing(true);
    },
    title: "\u70B9\u51FB\u7F16\u8F91"
  }, "\u8FFD\u8E2A ", fba.tracking || "—")));
}
function ShipmentGroupCard({
  group,
  expanded,
  onToggleExpand,
  onEdit,
  onEditTracking,
  onDelete
}) {
  const fbas = group.fbaShipments || [];
  const fbaCount = fbas.length;
  const totalQty = batchDisplayQty(group);
  const excN = openExcCount(group);
  const bc = batchHeadOverdue(group) ? "#E24B4A" : excN > 0 ? "#e09000" : "var(--border)";
  const tm = TRANSPORT_META[group.transport] || {
    icon: "📦",
    bg: "#f3f4f6",
    c: "#666"
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--card)",
      border: `1px solid ${batchHeadOverdue(group) ? "#fecaca" : "var(--border)"}`,
      borderLeft: `4px solid ${bc === "var(--border)" ? "#c8c6bc" : bc}`,
      borderRadius: 12,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      padding: "12px 14px",
      background: "var(--bg)",
      borderBottom: expanded ? "1px solid var(--border)" : "none"
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: e => {
      e.stopPropagation();
      onToggleExpand();
    },
    title: expanded ? "收起批次" : "展开批次",
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      width: 28,
      height: 28,
      flexShrink: 0,
      cursor: "pointer",
      fontFamily: "inherit",
      fontSize: 11,
      color: "#2d7dd2",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2
    }
  }, expanded ? "▼" : "▶"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      cursor: "pointer"
    },
    onClick: onEdit
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap",
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700
    }
  }, group.name), group.sku && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--tm)"
    }
  }, group.sku), /*#__PURE__*/React.createElement("span", {
    style: badge(tm.bg, tm.c)
  }, tm.icon, " ", group.transport), excN > 0 && /*#__PURE__*/React.createElement("span", {
    style: badge("#fff0d4", "#e09000")
  }, "\u26A0 ", excN, " \u5F02\u5E38")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, fbaCount, " \u4E2A\u8D27\u4EF6 \xB7 \u5171 ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "var(--text)",
      fontWeight: 700
    }
  }, totalQty), " \u4EF6", group.blNumber ? ` · B/L ${group.blNumber}` : "", group.updatedAt ? ` · 更新 ${formatSharedTime(group.updatedAt)}` : "")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: 6,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: group.owner
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, group.owner), /*#__PURE__*/React.createElement(RoleBadge, {
    role: getStaffRole(group.owner)
  })), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: e => {
      e.stopPropagation();
      onDelete();
    },
    style: {
      background: "transparent",
      border: "1px solid #fecaca",
      borderRadius: 6,
      padding: "2px 8px",
      fontSize: 10,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "#e55"
    }
  }, "\u5220\u9664"))), expanded && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 14px 14px"
    }
  }, fbaCount > 0 ? /*#__PURE__*/React.createElement(React.Fragment, null, fbas.map((f, i) => /*#__PURE__*/React.createElement(FbaStageTrack, {
    key: f.id,
    fba: f,
    batch: group,
    fbaIndex: i
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid var(--border)",
      marginTop: 4
    }
  }, fbas.map(f => /*#__PURE__*/React.createElement(FbaRow, {
    key: f.id,
    fba: f,
    onEditTracking: (fid, tracking) => onEditTracking(group.id, fid, tracking)
  })))) : /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      padding: "6px 0",
      cursor: "pointer"
    },
    onClick: onEdit
  }, "\u6682\u65E0\u8D27\u4EF6 \xB7 \u70B9\u51FB\u7F16\u8F91\u6DFB\u52A0")));
}
function FbaEditorRow({
  fba,
  onChange,
  onRemove
}) {
  const setExcs = exceptions => onChange({
    ...fba,
    exceptions
  });
  const excs = fba.exceptions || [];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "10px",
      marginBottom: 8,
      background: "var(--bg)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 600
    }
  }, fba.warehouse || "货件", fba.fbaId ? ` · ${fba.fbaId}` : ""), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onRemove,
    style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      color: "#aaa",
      fontSize: 18,
      padding: "0 4px"
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u8D27\u4EF6\u540D\u79F0"), /*#__PURE__*/React.createElement("input", {
    value: fba.name,
    onChange: e => onChange({
      ...fba,
      name: e.target.value
    }),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "FBA \u8D27\u4EF6\u7F16\u53F7"), /*#__PURE__*/React.createElement("input", {
    value: fba.fbaId,
    onChange: e => onChange({
      ...fba,
      fbaId: e.target.value
    }),
    placeholder: "FBA19...",
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr 1fr",
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5185\u90E8\u7F16\u53F7"), /*#__PURE__*/React.createElement("input", {
    value: fba.internalId,
    onChange: e => onChange({
      ...fba,
      internalId: e.target.value
    }),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u4ED3\u5E93\u4EE3\u7801"), /*#__PURE__*/React.createElement("input", {
    value: fba.warehouse,
    onChange: e => onChange({
      ...fba,
      warehouse: e.target.value.toUpperCase()
    }),
    placeholder: "RDU2",
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u9884\u8BA1\u4EF6\u6570"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: fba.expectedQty,
    onChange: e => onChange({
      ...fba,
      expectedQty: +e.target.value || 0
    }),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5DF2\u6536\u4EF6\u6570"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: fba.receivedQty,
    onChange: e => onChange({
      ...fba,
      receivedQty: +e.target.value || 0
    }),
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr 1fr",
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u9884\u8BA1\u51FA\u6E2F"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: fba.etaDeparture || "",
    onChange: e => onChange({
      ...fba,
      etaDeparture: e.target.value
    }),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u9884\u8BA1\u62B5\u8FBE"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: fba.etaArrival || "",
    onChange: e => onChange({
      ...fba,
      etaArrival: e.target.value
    }),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u914D\u9001\u5F00\u59CB"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: fba.windowStart,
    onChange: e => onChange({
      ...fba,
      windowStart: e.target.value
    }),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u914D\u9001\u7ED3\u675F"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: fba.windowEnd,
    onChange: e => onChange({
      ...fba,
      windowEnd: e.target.value
    }),
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u8FFD\u8E2A\u7F16\u7801"), /*#__PURE__*/React.createElement("input", {
    value: fba.tracking,
    onChange: e => onChange({
      ...fba,
      tracking: e.target.value
    }),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u72B6\u6001"), /*#__PURE__*/React.createElement("select", {
    value: normalizeShipmentStage(fba.status),
    onChange: e => onChange({
      ...fba,
      status: e.target.value
    }),
    style: {
      ...inp,
      background: "var(--card)"
    }
  }, SHIPMENT_STAGES.map(s => /*#__PURE__*/React.createElement("option", {
    key: s
  }, s))))), /*#__PURE__*/React.createElement(ExceptionEditor, {
    excs: excs,
    setExcs: setExcs
  }));
}
function ShipmentModal({
  item,
  onSave,
  onClose,
  onDelete,
  getExistingFbaIds
}) {
  const [form, setForm] = useState(item);
  const [fbas, setFbas] = useState(() => {
    const legacyExcs = item.exceptions?.length ? item.exceptions.map(e => ({
      ...e
    })) : [];
    return (item.fbaShipments || []).map((s, i) => ensureFbaDefaults({
      ...s,
      exceptions: (s.exceptions?.length ? s.exceptions : i === 0 ? legacyExcs : []).map(e => ({
        ...e
      }))
    }, item));
  });
  const [nextFbaId, setNextFbaId] = useState(() => Math.max(0, ...(item.fbaShipments || []).map(s => s.id)) + 1);
  const [importMsg, setImportMsg] = useState("");
  const [saveWarn, setSaveWarn] = useState("");
  const fileInputRef = useRef(null);
  const set = (k, v) => setForm(f => ({
    ...f,
    [k]: v
  }));
  const applyFbas = nextFbas => {
    setFbas(nextFbas);
    if (nextFbas.length) {
      setForm(f => ({
        ...f,
        totalQty: sumFbaExpectedQty(nextFbas)
      }));
    }
  };
  const handleSave = e => {
    e?.stopPropagation?.();
    if (!form.name.trim()) {
      setSaveWarn("请先填写「批次名称」");
      return;
    }
    setSaveWarn("");
    const totalQty = fbas.length ? sumFbaExpectedQty(fbas) : form.totalQty;
    const normalizedFbas = fbas.map(f => ({
      ...ensureFbaDefaults(f, form),
      status: normalizeShipmentStage(f.status),
      exceptions: (f.exceptions || []).map(e => ({
        ...e
      }))
    }));
    onSave({
      ...form,
      headStatus: deriveHeadStatus(normalizedFbas),
      totalQty,
      exceptions: [],
      fbaShipments: normalizedFbas
    });
  };
  const emptyFba = () => ({
    id: nextFbaId,
    name: "",
    fbaId: "",
    internalId: "",
    warehouse: "",
    expectedQty: 0,
    receivedQty: 0,
    windowStart: "",
    windowEnd: "",
    etaDeparture: "",
    etaArrival: "",
    tracking: "",
    status: DEFAULT_SHIPMENT_STAGE,
    exceptions: [],
    note: ""
  });
  const onCsvPick = async e => {
    const files = e.target.files;
    if (!files?.length) return;
    try {
      const {
        fbaShipments,
        totalQty,
        sku,
        warnings
      } = await readStaCsvFiles(files);
      const existingIds = new Set(getExistingFbaIds ? getExistingFbaIds() : []);
      fbas.forEach(f => {
        const fid = normalizeFbaId(f.fbaId);
        if (fid) existingIds.add(fid);
      });
      const {
        unique,
        dupes
      } = splitDuplicateFbaImports(fbaShipments, existingIds);
      if (!unique.length) {
        setImportMsg(formatDuplicateFbaMsg(dupes, "无法重复导入"));
        e.target.value = "";
        return;
      }
      let nid = nextFbaId;
      const imported = unique.map(f => ({
        ...f,
        id: nid++
      }));
      const merged = [...fbas, ...imported];
      applyFbas(merged);
      setNextFbaId(nid);
      setForm(f => ({
        ...f,
        totalQty: sumFbaExpectedQty(merged),
        sku: f.sku || sku,
        name: f.name || (imported.length === 1 ? imported[0].name : f.name)
      }));
      const baseMsg = warnings.length ? `已导入 ${imported.length} 个货件（${warnings.join("；")}）` : `已导入 ${imported.length} 个 STA 货件`;
      setImportMsg(dupes.length ? `${baseMsg}；${formatDuplicateFbaMsg(dupes, "已跳过")}` : baseMsg);
    } catch (err) {
      setImportMsg(err.message || "CSV 解析失败");
    }
    e.target.value = "";
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      zIndex: 400,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem 1rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: "absolute",
      inset: 0,
      background: "rgba(0,0,0,0.4)"
    },
    "aria-hidden": true
  }), /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: "relative",
      zIndex: 1,
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 14,
      width: "100%",
      maxWidth: 760,
      maxHeight: "calc(100vh - 3rem)",
      color: "var(--text)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: "1.5rem 1.5rem 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 15,
      marginBottom: "1rem"
    }
  }, item.id ? "编辑发货批次" : "新建发货批次"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--tm)",
      marginBottom: 8
    }
  }, "\u6279\u6B21\u4FE1\u606F"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u6279\u6B21\u540D\u79F0 ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#c62828"
    }
  }, "*")), /*#__PURE__*/React.createElement("input", {
    value: form.name,
    onChange: e => {
      set("name", e.target.value);
      if (saveWarn) setSaveWarn("");
    },
    placeholder: "FB100\u7EFF\u8272\u7B2C\u4E09\u6279",
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u4EA7\u54C1 / SKU"), /*#__PURE__*/React.createElement("input", {
    value: form.sku,
    onChange: e => set("sku", e.target.value),
    placeholder: "FB100",
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u8DDF\u8FDB\u4EBA"), /*#__PURE__*/React.createElement(OwnerField, {
    value: form.owner,
    onChange: v => set("owner", v),
    inputStyle: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5934\u7A0B\u65B9\u5F0F"), /*#__PURE__*/React.createElement("select", {
    value: form.transport,
    onChange: e => set("transport", e.target.value),
    style: {
      ...inp,
      background: "var(--card)"
    }
  }, Object.keys(TRANSPORT_META).map(t => /*#__PURE__*/React.createElement("option", {
    key: t
  }, t)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u56FD\u5185\u51FA\u8D27\u65E5\u671F"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.shipDate,
    onChange: e => set("shipDate", e.target.value),
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u8D27\u4EE3\u516C\u53F8"), /*#__PURE__*/React.createElement("input", {
    value: form.forwarder,
    onChange: e => set("forwarder", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u63D0\u5355\u53F7 B/L"), /*#__PURE__*/React.createElement("input", {
    value: form.blNumber,
    onChange: e => set("blNumber", e.target.value),
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5907\u6CE8"), /*#__PURE__*/React.createElement("input", {
    value: form.note,
    onChange: e => set("note", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--tm)",
      borderTop: "1px solid var(--border)",
      paddingTop: 10,
      marginBottom: 8,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", null, "FBA \u8D27\u4EF6 (", fbas.length, ")"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("input", {
    ref: fileInputRef,
    type: "file",
    accept: ".csv",
    multiple: true,
    style: {
      display: "none"
    },
    onChange: onCsvPick
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => fileInputRef.current?.click(),
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "4px 10px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "#2d7dd2"
    }
  }, "\uD83D\uDCE5 \u5BFC\u5165 STA CSV"))), importMsg && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: importMsg.includes("失败") || importMsg.includes("不是") ? "#E24B4A" : "#1a6b35",
      marginBottom: 8,
      padding: "6px 10px",
      background: importMsg.includes("失败") || importMsg.includes("不是") ? "#fee2e2" : "#f0faf4",
      borderRadius: 8
    }
  }, importMsg), fbas.map((f, i) => /*#__PURE__*/React.createElement(FbaEditorRow, {
    key: f.id,
    fba: f,
    onChange: v => {
      const a = [...fbas];
      a[i] = v;
      applyFbas(a);
    },
    onRemove: () => applyFbas(fbas.filter((_, j) => j !== i))
  })), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      applyFbas([...fbas, emptyFba()]);
      setNextFbaId(nextFbaId + 1);
    },
    style: {
      width: "100%",
      border: "1px dashed var(--border)",
      borderRadius: 8,
      padding: "6px 0",
      fontSize: 12,
      cursor: "pointer",
      color: "var(--tm)",
      background: "transparent",
      marginBottom: 12,
      fontFamily: "inherit"
    }
  }, "+ \u6DFB\u52A0 FBA \u8D27\u4EF6")), /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      borderTop: "1px solid var(--border)",
      padding: "12px 1.5rem 1.5rem",
      background: "var(--card)"
    }
  }, saveWarn && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#c62828",
      marginBottom: 8
    }
  }, saveWarn), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8
    }
  }, item.id ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onDelete,
    style: {
      background: "none",
      border: "none",
      color: "#e55",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "\u5220\u9664\u6279\u6B21") : /*#__PURE__*/React.createElement("div", null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginLeft: "auto"
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClose,
    style: {
      background: "transparent",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "8px 16px",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "var(--tm)"
    }
  }, "\u53D6\u6D88"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: handleSave,
    style: {
      background: "#2d7dd2",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      padding: "8px 20px",
      fontSize: 13,
      cursor: "pointer",
      fontFamily: "inherit",
      fontWeight: 600
    }
  }, "\u4FDD\u5B58"))))));
}
function LogisticsPanel({
  active = true
}) {
  const {
    items,
    meta,
    loading,
    saving,
    error,
    persist,
    reload
  } = useSharedList("logistics", INIT_LOGISTICS, {
    active
  });
  const list = Array.isArray(items) ? items : [];
  const savedFilters = loadLogisticsFilters();
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState(savedFilters.filter || "all");
  const [ownerFilter, setOwnerFilter] = useState(savedFilters.ownerFilter || "all");
  const [productFilter, setProductFilter] = useState(savedFilters.productFilter || "all");
  const [expanded, setExpanded] = useState(loadExpandedState);
  const panelCsvRef = useRef(null);
  const products = useMemo(() => logisticsGroupsToGanttProducts(list), [list]);
  const currentProduct = productFilter === "all" ? null : products.find(p => p.id === productFilter) || null;
  useEffect(() => {
    if (productFilter === "all" || products.some(p => p.id === productFilter)) return;
    setProductFilter("all");
  }, [products, productFilter]);
  useEffect(() => {
    saveLogisticsFilters({
      filter,
      ownerFilter,
      productFilter
    });
  }, [filter, ownerFilter, productFilter]);
  const setFilterPersist = key => {
    setFilter(key);
    saveLogisticsFilters({
      filter: key,
      ownerFilter,
      productFilter
    });
  };
  const setOwnerFilterPersist = name => {
    setOwnerFilter(name);
    saveLogisticsFilters({
      filter,
      ownerFilter: name,
      productFilter
    });
  };
  const setProductFilterPersist = key => {
    setProductFilter(key);
    saveLogisticsFilters({
      filter,
      ownerFilter,
      productFilter: key
    });
  };
  const toggleExpanded = id => setExpanded(prev => {
    const key = String(id);
    const next = {
      ...prev,
      [key]: !isBatchExpanded(prev, id)
    };
    saveExpandedState(next);
    return next;
  });
  const nextId = () => Math.max(0, ...list.map(i => i.id || 0)) + 1;
  const scopedList = productFilter === "all" ? list : list.filter(g => groupMatchesProduct(g, productFilter));
  const counts = {
    all: scopedList.length,
    transit: scopedList.filter(batchHeadTransit).length,
    missing_track: scopedList.filter(batchMissingTrack).length,
    receiving: scopedList.filter(batchReceiving).length,
    done: scopedList.filter(batchAllDone).length
  };
  const owners = ownerFilterEntries();
  let vis = scopedList.slice();
  if (ownerFilter !== "all") vis = vis.filter(i => i.owner === ownerFilter);
  if (filter === "transit") vis = vis.filter(batchHeadTransit);else if (filter === "missing_track") vis = vis.filter(batchMissingTrack);else if (filter === "receiving") vis = vis.filter(batchReceiving);else if (filter === "done") vis = vis.filter(batchAllDone);
  vis.sort((a, b) => {
    const pa = batchHeadOverdue(a) ? 0 : openExcCount(a) ? 1 : 2;
    const pb = batchHeadOverdue(b) ? 0 : openExcCount(b) ? 1 : 2;
    if (pa !== pb) return pa - pb;
    return batchEarliestEtaDiff(a) - batchEarliestEtaDiff(b);
  });
  const save = t => {
    const now = Date.now();
    const withTime = {
      ...t,
      updatedAt: now
    };
    if (t.id) persist(list.map(x => x.id === t.id ? withTime : x));else persist([...list, {
      ...withTime,
      id: nextId()
    }]);
    setModal(null);
  };
  const deleteGroup = g => {
    if (!window.confirm(`确定删除批次「${g.name || g.sku || "未命名"}」？删除后无法恢复。`)) return;
    persist(list.filter(x => x.id !== g.id), {
      replace: true
    });
    if (modal?.id === g.id) setModal(null);
  };
  const editTracking = (gid, fid, tracking) => {
    const now = Date.now();
    persist(list.map(g => {
      if (g.id !== gid) return g;
      const fbaShipments = (g.fbaShipments || []).map(s => s.id !== fid ? s : {
        ...s,
        tracking,
        status: tracking.trim() && ["待出库", "已入仓"].includes(normalizeShipmentStage(s.status)) ? "在途" : normalizeShipmentStage(s.status)
      });
      return {
        ...g,
        fbaShipments,
        headStatus: deriveHeadStatus(fbaShipments),
        updatedAt: now
      };
    }));
  };
  const cloneGroup = g => ({
    ...g,
    exceptions: (g.exceptions || []).map(e => ({
      ...e
    })),
    fbaShipments: (g.fbaShipments || []).map(s => ({
      ...ensureFbaDefaults(s, g),
      exceptions: (s.exceptions || []).map(e => ({
        ...e
      }))
    }))
  });
  const emptyGroup = {
    name: "",
    sku: "",
    totalQty: 0,
    owner: "",
    shipDate: "",
    transport: "海运",
    forwarder: "",
    blNumber: "",
    etaDeparture: "",
    etaArrival: "",
    headStatus: DEFAULT_SHIPMENT_STAGE,
    note: "",
    exceptions: [],
    fbaShipments: []
  };
  const emptyGroupForProduct = () => {
    if (!currentProduct) return {
      ...emptyGroup
    };
    return {
      ...emptyGroup,
      sku: currentProduct.sku || currentProduct.id
    };
  };
  const onPanelCsvImport = async e => {
    const files = e.target.files;
    if (!files?.length) return;
    try {
      const {
        fbaShipments,
        totalQty,
        sku
      } = await readStaCsvFiles(files);
      const existingIds = collectFbaIdsFromGroups(list);
      const {
        unique,
        dupes
      } = splitDuplicateFbaImports(fbaShipments, existingIds);
      if (!unique.length) {
        alert(formatDuplicateFbaMsg(dupes, "无法重复导入"));
        e.target.value = "";
        return;
      }
      if (dupes.length) alert(formatDuplicateFbaMsg(dupes, "已跳过重复项"));
      const label = files.length === 1 ? unique[0]?.fbaId || "新批次" : `导入 ${unique.length} 个货件`;
      const base = emptyGroupForProduct();
      setModal({
        ...base,
        name: label,
        sku: base.sku || sku,
        totalQty,
        fbaShipments: unique
      });
    } catch (err) {
      alert(err.message || "CSV 解析失败");
    }
    e.target.value = "";
  };
  const tabs = [{
    key: "all",
    label: "全部",
    nc: "var(--text)"
  }, {
    key: "transit",
    label: "头程在途",
    nc: "#2d7dd2"
  }, {
    key: "missing_track",
    label: "缺少追踪码",
    nc: "#E24B4A"
  }, {
    key: "receiving",
    label: "FBA接收中",
    nc: "#1a9e8a"
  }, {
    key: "done",
    label: "已完成",
    nc: "#2d9e52"
  }];
  useCloudSyncPage(active, {
    label: "物流",
    save: async () => persist(list),
    reload,
    meta,
    loading,
    saving,
    error,
    isDirty: !!modal,
    dirtyHint: "物流批次编辑弹窗未保存"
  });
  return /*#__PURE__*/React.createElement("div", null, products.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: "1rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginBottom: 8
    }
  }, "\u4EA7\u54C1\u5206\u9875 \xB7 \u5207\u6362\u67E5\u770B\u5404\u4EA7\u54C1\u5934\u7A0B"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setProductFilterPersist("all"),
    style: productTabChip(productFilter === "all")
  }, "\u5168\u90E8\u4EA7\u54C1", /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 6,
      fontSize: 11,
      opacity: 0.85
    }
  }, "(", list.length, ")")), products.map(p => /*#__PURE__*/React.createElement("button", {
    key: p.id,
    type: "button",
    onClick: () => setProductFilterPersist(p.id),
    style: productTabChip(productFilter === p.id),
    title: p.name
  }, p.sku || p.name, /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 6,
      fontSize: 11,
      opacity: 0.85
    }
  }, "(", p.batches.length, ")"))))), currentProduct && /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--card)",
      border: "1px solid #2d7dd2",
      borderRadius: 12,
      padding: "12px 16px",
      marginBottom: "1rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: "var(--text)"
    }
  }, currentProduct.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginTop: 4
    }
  }, currentProduct.batches.length, " \u4E2A\u53D1\u8D27\u6279\u6B21 \xB7 \u4EC5\u663E\u793A\u672C\u4EA7\u54C1\u76F8\u5173\u5934\u7A0B")), /*#__PURE__*/React.createElement(FBAGanttCard, {
    groups: list,
    productFilter: productFilter
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "1rem",
      flexWrap: "wrap",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(5, 1fr)",
      gap: 7,
      flex: 1,
      minWidth: 280
    }
  }, tabs.map(f => /*#__PURE__*/React.createElement("div", {
    key: f.key,
    onClick: () => setFilterPersist(f.key),
    style: {
      background: "var(--card)",
      border: `1px solid ${filter === f.key ? "#2d7dd2" : "var(--border)"}`,
      borderRadius: 10,
      padding: "9px 10px",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      color: f.nc
    }
  }, counts[f.key]), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginTop: 1
    }
  }, f.label)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("input", {
    ref: panelCsvRef,
    type: "file",
    accept: ".csv",
    multiple: true,
    style: {
      display: "none"
    },
    onChange: onPanelCsvImport
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => panelCsvRef.current?.click(),
    style: {
      background: "var(--card)",
      color: "#2d7dd2",
      border: "1px solid #2d7dd2",
      borderRadius: 8,
      padding: "8px 14px",
      fontSize: 13,
      cursor: "pointer",
      fontFamily: "inherit",
      fontWeight: 600
    }
  }, "\uD83D\uDCE5 \u5BFC\u5165 CSV"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setModal(emptyGroupForProduct()),
    style: {
      background: "#2d7dd2",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      padding: "8px 16px",
      fontSize: 13,
      cursor: "pointer",
      fontFamily: "inherit",
      fontWeight: 600
    }
  }, "+ \u65B0\u5EFA\u6279\u6B21"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginBottom: "1rem",
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, "\u8DDF\u8FDB\u4EBA"), owners.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.name,
    onClick: () => setOwnerFilterPersist(o.name),
    style: {
      background: ownerFilter === o.name ? "#2d7dd2" : "var(--card)",
      color: ownerFilter === o.name ? "#fff" : "var(--tm)",
      border: `1px solid ${ownerFilter === o.name ? "#2d7dd2" : "var(--border)"}`,
      borderRadius: 20,
      padding: "4px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      display: "inline-flex",
      alignItems: "center",
      gap: 4
    }
  }, o.name === "all" ? "全部" : /*#__PURE__*/React.createElement(React.Fragment, null, o.name, o.role && /*#__PURE__*/React.createElement(RoleBadge, {
    role: o.role,
    style: {
      padding: "0 5px",
      fontSize: 9
    }
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, vis.length ? vis.map(g => /*#__PURE__*/React.createElement(ShipmentGroupCard, {
    key: g.id,
    group: g,
    expanded: isBatchExpanded(expanded, g.id),
    onToggleExpand: () => toggleExpanded(g.id),
    onEdit: () => setModal(cloneGroup(g)),
    onEditTracking: editTracking,
    onDelete: () => deleteGroup(g)
  })) : /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "2rem",
      color: "var(--tm)",
      fontSize: 13
    }
  }, currentProduct ? "该产品暂无匹配批次" : "暂无匹配批次")), modal && /*#__PURE__*/React.createElement(ShipmentModal, {
    item: modal,
    onSave: save,
    getExistingFbaIds: () => collectFbaIdsFromGroups(list, modal.id),
    onClose: () => {
      if (!window.confirm("弹窗未点「保存」，修改不会上传。确定关闭？")) return;
      setModal(null);
    },
    onDelete: () => {
      persist(list.filter(x => x.id !== modal.id), {
        replace: true
      });
      setModal(null);
    }
  }));
}

// Shared helpers (TODAY, fmtD, Avatar, …) come from LogisticsModule.browser.jsx loaded first.

const PROD_GANTT_STATUS = {
  setup: {
    label: "立项/备料",
    color: "#5F5E5A",
    bg: "#F4F3EF",
    dot: "#888780",
    border: "#C8C6BC"
  },
  producing: {
    label: "生产中",
    color: "#185FA5",
    bg: "#EBF4FD",
    dot: "#378ADD",
    border: "#85B7EB"
  },
  qc: {
    label: "QC验货",
    color: "#1a9e8a",
    bg: "#d1fae5",
    dot: "#1a9e8a",
    border: "#5eead4"
  },
  shipping: {
    label: "出货",
    color: "#0F6E56",
    bg: "#E5F6F0",
    dot: "#0F6E56",
    border: "#86efac"
  },
  done: {
    label: "已完成",
    color: "#2d9e52",
    bg: "#d4f0dc",
    dot: "#2d9e52",
    border: "#86efac"
  },
  blocked: {
    label: "异常",
    color: "#78350f",
    bg: "#fef3c7",
    dot: "#e09000",
    border: "#ffe0a0"
  },
  overdue: {
    label: "逾期",
    color: "#E24B4A",
    bg: "#fee2e2",
    dot: "#E24B4A",
    border: "#fecaca"
  }
};
const PROD_GANTT_SORT_OPTIONS = [{
  key: "name",
  label: "产品名称"
}, {
  key: "shipDate",
  label: "最近下单"
}, {
  key: "etaArrival",
  label: "预计交期"
}, {
  key: "batches",
  label: "批次数"
}];
const PROD_GANTT_FILTER_KEY = "ops-prod-gantt-filters";
const PROD_GANTT_EXPAND_KEY = "ops-prod-gantt-expanded";
const PROD_GANTT_BTN_PRIMARY = {
  background: "#2d7dd2",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
  fontWeight: 600,
  flexShrink: 0
};
const prodGanttFilterChip = active => ({
  background: active ? "#2d7dd2" : "var(--card)",
  color: active ? "#fff" : "var(--tm)",
  border: `1px solid ${active ? "#2d7dd2" : "var(--border)"}`,
  borderRadius: 20,
  padding: "4px 12px",
  fontSize: 11,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap"
});
function loadProdGanttFilters() {
  try {
    const raw = sessionStorage.getItem(PROD_GANTT_FILTER_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === "object") {
        return {
          productFilter: typeof p.productFilter === "string" ? p.productFilter : "all",
          statusFilter: typeof p.statusFilter === "string" ? p.statusFilter : "all",
          sortBy: PROD_GANTT_SORT_OPTIONS.some(o => o.key === p.sortBy) ? p.sortBy : "name"
        };
      }
    }
  } catch {/* ignore */}
  return {
    productFilter: "all",
    statusFilter: "all",
    sortBy: "name"
  };
}
function saveProdGanttFilters(filters) {
  try {
    sessionStorage.setItem(PROD_GANTT_FILTER_KEY, JSON.stringify(filters));
  } catch {/* ignore */}
}
function loadProdGanttExpanded() {
  try {
    const raw = sessionStorage.getItem(PROD_GANTT_EXPAND_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === "object") return p;
    }
  } catch {/* ignore */}
  return {};
}
function saveProdGanttExpanded(state) {
  try {
    sessionStorage.setItem(PROD_GANTT_EXPAND_KEY, JSON.stringify(state));
  } catch {/* ignore */}
}
function prodGanttNormalizeStage(s) {
  return s === "生产" ? "生产中" : s || "立项";
}
function prodGanttOpenExcs(b) {
  return (b.exceptions || []).filter(e => !e.resolved);
}
function prodGanttBatchStatus(b) {
  if (prodGanttNormalizeStage(b.stage) === "已完成") return "done";
  if (prodGanttOpenExcs(b).length) return "blocked";
  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);
  if (b.etaDelivery) {
    const d = new Date(b.etaDelivery);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((d - TODAY) / 86400000);
    if (diff < 0 && !["出货", "已完成"].includes(prodGanttNormalizeStage(b.stage))) return "overdue";
  }
  return "inprog";
}
function batchToGanttStatus(b) {
  const st = prodGanttBatchStatus(b);
  if (st === "blocked") return "blocked";
  if (st === "overdue") return "overdue";
  const stage = prodGanttNormalizeStage(b.stage);
  if (stage === "已完成") return "done";
  if (stage === "出货") return "shipping";
  if (stage === "QC验货") return "qc";
  if (stage === "生产中") return "producing";
  return "setup";
}

/** 产品分组键（产品编号 + 款式，与下方列表分组一致） */
function prodGroupKey(b) {
  return `${(b.product || "未命名").trim()}::${(b.name || "").trim()}`;
}
function prodMatchesProduct(b, productFilter) {
  return productFilter === "all" || prodGroupKey(b) === productFilter;
}
function prodBatchGanttMeta(b, today) {
  const excCount = prodGanttOpenExcs(b).length;
  let overdue = prodGanttBatchStatus(b) === "overdue";
  if (!overdue && b.etaDelivery) {
    const eta = prodGanttParseD(b.etaDelivery);
    const stage = prodGanttNormalizeStage(b.stage);
    if (eta && eta < today && !["出货", "已完成"].includes(stage) && !b.actualDelivery) overdue = true;
  }
  return {
    excCount,
    overdue
  };
}
function prodDominantStatus(statuses) {
  const order = ["blocked", "overdue", "producing", "qc", "shipping", "setup", "done"];
  if (!statuses.length) return "setup";
  if (statuses.every(s => s === "done")) return "done";
  for (const key of order) {
    if (statuses.some(s => s === key)) return key;
  }
  return "setup";
}
function prodDisplayName(product, name) {
  const parts = [product, name].filter(Boolean);
  return parts.join(" ") || "未命名";
}

/** 按产品编号 + 款式聚合，每个生产批次在甘特图中独立一行 */
function productionItemsToGanttProducts(items) {
  if (!Array.isArray(items) || !items.length) return [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const byKey = new Map();
  for (const b of items) {
    const key = prodGroupKey(b);
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: key,
        product: b.product || "",
        styleName: b.name || "",
        name: prodDisplayName(b.product, b.name),
        sku: b.product || "",
        batches: []
      });
    }
    const meta = prodBatchGanttMeta(b, today);
    byKey.get(key).batches.push({
      id: b.id,
      label: b.batch || "批次",
      sub: b.supplier || "",
      status: batchToGanttStatus(b),
      shipDate: b.orderDate || "",
      etaArrival: b.actualDelivery || b.etaDelivery || b.etaShip || "",
      excCount: meta.excCount,
      overdue: meta.overdue
    });
  }
  for (const p of byKey.values()) {
    p.batches.sort((a, b) => {
      const ta = prodGanttParseD(a.shipDate)?.getTime() || 0;
      const tb = prodGanttParseD(b.shipDate)?.getTime() || 0;
      return tb - ta;
    });
  }
  return Array.from(byKey.values());
}
const prodGanttParseD = s => {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};
const prodGanttFmtShort = d => {
  if (!d) return "—";
  if (typeof d === "string") {
    const p = prodGanttParseD(d);
    if (!p) return "—";
    return `${p.getMonth() + 1}/${p.getDate()}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
function prodGanttProductSummary(batches) {
  const ships = batches.map(b => prodGanttParseD(b.shipDate)).filter(Boolean);
  const etas = batches.map(b => prodGanttParseD(b.etaArrival)).filter(Boolean);
  return {
    shipDate: ships.length ? new Date(Math.min(...ships.map(d => d.getTime()))).toISOString().slice(0, 10) : "",
    etaArrival: etas.length ? new Date(Math.max(...etas.map(d => d.getTime()))).toISOString().slice(0, 10) : "",
    status: prodDominantStatus(batches.map(b => b.status)),
    excCount: batches.reduce((s, b) => s + (b.excCount || 0), 0),
    overdue: batches.some(b => b.overdue),
    batchCount: batches.length
  };
}
function prodGanttCalcBarPos(shipDate, etaArrival, min, totalDays) {
  const start = prodGanttParseD(shipDate) || prodGanttParseD(etaArrival);
  const end = prodGanttParseD(etaArrival) || prodGanttParseD(shipDate);
  if (!start || !end) return null;
  const s = start < end ? start : end;
  const e = start < end ? end : start;
  return {
    left: (s - min) / 86400000 / totalDays * 100,
    width: Math.max(8, (e - s) / 86400000 / totalDays * 100),
    start: s,
    end: e
  };
}
function ProdGanttAlerts({
  excCount,
  overdue,
  compact
}) {
  const items = [];
  if (overdue) items.push({
    t: "逾期",
    c: "#E24B4A",
    bg: "#fee2e2"
  });
  if (excCount > 0) items.push({
    t: `⚠${excCount}`,
    c: "#b45309",
    bg: "#fff0d4"
  });
  if (!items.length) return null;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: compact ? 3 : 4,
      flexShrink: 0
    }
  }, items.map(it => /*#__PURE__*/React.createElement("span", {
    key: it.t,
    style: {
      fontSize: compact ? 9 : 10,
      fontWeight: 700,
      padding: compact ? "1px 5px" : "2px 6px",
      borderRadius: 10,
      background: it.bg,
      color: it.c,
      whiteSpace: "nowrap"
    }
  }, it.t)));
}
function ProdGanttTrack({
  shipDate,
  etaArrival,
  status,
  label,
  sub,
  excCount,
  overdue,
  min,
  totalDays,
  today,
  height = 40,
  compact = false,
  segments,
  segmentsOnly = false
}) {
  const pos = prodGanttCalcBarPos(shipDate, etaArrival, min, totalDays);
  const st = PROD_GANTT_STATUS[status] || PROD_GANTT_STATUS.setup;
  const trackH = height;
  if (segmentsOnly && segments?.length) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        position: "relative",
        height: trackH,
        background: "#f3f4f6",
        borderRadius: 8,
        border: "1px solid #e5e7eb"
      }
    }, segments.map(seg => {
      const sp = prodGanttCalcBarPos(seg.shipDate, seg.etaArrival, min, totalDays);
      if (!sp) return null;
      const ss = PROD_GANTT_STATUS[seg.status] || PROD_GANTT_STATUS.setup;
      return /*#__PURE__*/React.createElement("div", {
        key: seg.id,
        title: `${seg.label} · ${ss.label} · ${prodGanttFmtShort(seg.shipDate)}→${prodGanttFmtShort(seg.etaArrival)}`,
        style: {
          position: "absolute",
          left: `${sp.left}%`,
          width: `${sp.width}%`,
          top: 3,
          bottom: 3,
          background: `linear-gradient(180deg, ${ss.bg}, ${ss.border}88)`,
          border: `1.5px solid ${seg.overdue ? "#E24B4A" : ss.border}`,
          borderRadius: 4,
          minWidth: 4
        }
      });
    }));
  }
  if (!pos) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        height: trackH,
        background: "#f9fafb",
        borderRadius: 8,
        border: "2px dashed #d1d5db",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        color: "#9ca3af"
      }
    }, "\u6682\u65E0\u65E5\u671F\u533A\u95F4");
  }
  const todayInBar = today >= pos.start && today <= pos.end;
  const todayPctInBar = todayInBar ? (today - pos.start) / (pos.end - pos.start) * 100 : null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      position: "relative",
      height: trackH,
      background: "#f3f4f6",
      borderRadius: 8,
      border: "1px solid #e5e7eb",
      boxShadow: "inset 0 1px 2px rgba(0,0,0,0.04)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    title: `${label || ""} ${prodGanttFmtShort(pos.start)} → ${prodGanttFmtShort(pos.end)} · ${st.label}`,
    style: {
      position: "absolute",
      left: `${pos.left}%`,
      width: `${pos.width}%`,
      top: 5,
      bottom: 5,
      background: `linear-gradient(180deg, ${st.bg} 0%, ${st.border}33 100%)`,
      border: `2px solid ${overdue ? "#E24B4A" : st.border}`,
      borderRadius: 6,
      boxShadow: overdue ? "0 0 0 1px #fecaca" : "0 1px 3px rgba(0,0,0,0.08)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 8px",
      gap: 6,
      overflow: "hidden",
      minWidth: 48
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: compact ? 9 : 10,
      fontWeight: 700,
      color: st.color,
      flexShrink: 0,
      background: "rgba(255,255,255,0.7)",
      padding: "1px 4px",
      borderRadius: 4
    }
  }, prodGanttFmtShort(pos.start)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5,
      minWidth: 0,
      flex: 1,
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: st.dot,
      flexShrink: 0,
      boxShadow: `0 0 0 2px ${st.bg}`
    }
  }), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: compact ? 10 : 11,
      fontWeight: 700,
      color: st.color,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, label), sub && !compact && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: st.color,
      opacity: 0.8,
      flexShrink: 0
    }
  }, sub)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(ProdGanttAlerts, {
    excCount: excCount,
    overdue: overdue,
    compact: compact
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: compact ? 9 : 10,
      fontWeight: 700,
      color: st.color,
      background: "rgba(255,255,255,0.7)",
      padding: "1px 4px",
      borderRadius: 4
    }
  }, prodGanttFmtShort(pos.end))), todayPctInBar != null && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: `${todayPctInBar}%`,
      top: -3,
      bottom: -3,
      width: 3,
      background: "#E24B4A",
      borderRadius: 2,
      zIndex: 2,
      pointerEvents: "none"
    },
    title: "\u4ECA\u5929"
  })));
}
function prodApplyGanttView(products, {
  productFilter,
  statusFilter,
  sortBy
}) {
  let list = products.map(p => ({
    ...p,
    batches: statusFilter === "all" ? [...(p.batches || [])] : (p.batches || []).filter(b => b.status === statusFilter)
  }));
  if (statusFilter !== "all") {
    list = list.filter(p => p.batches.length > 0);
  }
  if (productFilter !== "all") {
    list = list.filter(p => p.id === productFilter);
  }
  const orderKey = p => {
    const times = (p.batches || []).map(b => prodGanttParseD(b.shipDate)?.getTime()).filter(Boolean);
    return times.length ? Math.max(...times) : 0;
  };
  const etaKey = p => {
    const times = (p.batches || []).map(b => prodGanttParseD(b.etaArrival)?.getTime()).filter(Boolean);
    return times.length ? Math.min(...times) : Infinity;
  };
  list.sort((a, b) => {
    if (sortBy === "shipDate") return orderKey(b) - orderKey(a);
    if (sortBy === "etaArrival") return etaKey(a) - etaKey(b);
    if (sortBy === "batches") return (b.batches?.length || 0) - (a.batches?.length || 0);
    return String(a.name).localeCompare(String(b.name), "zh");
  });
  return list;
}
async function prodGanttCaptureScreenshot(el) {
  if (!el) return;
  const w = el.scrollWidth;
  const h = el.scrollHeight;
  const html = el.outerHTML;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<foreignObject width="100%" height="100%">
<div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;background:var(--card,#fff);font-family:inherit;">
${html}
</div>
</foreignObject></svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * 2;
      canvas.height = h * 2;
      const ctx = canvas.getContext("2d");
      ctx.scale(2, 2);
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--card").trim() || "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0);
      const a = document.createElement("a");
      a.download = `prod-gantt-${new Date().toISOString().slice(0, 10)}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      resolve();
    };
    img.onerror = reject;
    img.src = url;
  });
}
function ProdGanttTimeline({
  products,
  today
}) {
  const [expanded, setExpanded] = useState(loadProdGanttExpanded);
  useEffect(() => {
    saveProdGanttExpanded(expanded);
  }, [expanded]);
  const toggleProduct = id => setExpanded(prev => ({
    ...prev,
    [id]: prev[id] !== true
  }));
  const {
    min,
    totalDays,
    weeks,
    todayPct
  } = useMemo(() => {
    let minD = new Date(today);
    let maxD = new Date(today);
    products.forEach(p => {
      (p.batches || []).forEach(b => {
        [b.shipDate, b.etaArrival].forEach(s => {
          const d = prodGanttParseD(s);
          if (!d) return;
          if (d < minD) minD = new Date(d);
          if (d > maxD) maxD = new Date(d);
        });
      });
    });
    minD.setDate(minD.getDate() - 7);
    maxD.setDate(maxD.getDate() + 21);
    const totalDays = Math.max(1, Math.round((maxD - minD) / 86400000));
    const weeks = [];
    const cur = new Date(minD);
    cur.setDate(cur.getDate() - cur.getDay());
    while (cur <= maxD) {
      weeks.push(new Date(cur));
      cur.setDate(cur.getDate() + 7);
    }
    const todayPct = (today - minD) / 86400000 / totalDays * 100;
    return {
      min: minD,
      max: maxD,
      totalDays,
      weeks,
      todayPct
    };
  }, [products, today]);
  const LABEL_W = 180;
  const TodayLine = () => todayPct >= 0 && todayPct <= 100 ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: `${todayPct}%`,
      top: 0,
      bottom: 0,
      width: 2,
      background: "#E24B4A",
      zIndex: 3,
      pointerEvents: "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: -14,
      left: -10,
      fontSize: 9,
      color: "#E24B4A",
      fontWeight: 700,
      whiteSpace: "nowrap"
    }
  }, "\u4ECA\u5929")) : null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 720
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      marginLeft: LABEL_W,
      borderBottom: "2px solid var(--border)",
      paddingBottom: 6,
      marginBottom: 10
    }
  }, weeks.map((w, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      minWidth: 56,
      fontSize: 10,
      fontWeight: 600,
      color: "var(--tm)",
      textAlign: "center"
    }
  }, w.getMonth() + 1, "/", w.getDate()))), products.map(p => {
    const isOpen = expanded[p.id] === true;
    const batches = p.batches || [];
    const batchCount = batches.length;
    const summary = prodGanttProductSummary(batches);
    return /*#__PURE__*/React.createElement("div", {
      key: p.id,
      style: {
        marginBottom: 10,
        paddingBottom: 8,
        borderBottom: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 6,
        minHeight: 44
      }
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => toggleProduct(p.id),
      title: isOpen ? "收起产品" : "展开各批次",
      style: {
        width: 26,
        height: 26,
        flexShrink: 0,
        background: "#eff6ff",
        border: "1px solid #93c5fd",
        borderRadius: 6,
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 11,
        color: "#2563eb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }
    }, isOpen ? "▼" : "▶"), /*#__PURE__*/React.createElement("div", {
      style: {
        width: LABEL_W - 32,
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: "var(--text)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }
    }, p.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: "var(--tm)",
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("span", null, p.sku || "—", " \xB7 ", batchCount, " \u6279"), summary.shipDate && summary.etaArrival && /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600,
        color: "var(--text)"
      }
    }, prodGanttFmtShort(summary.shipDate), " \u2192 ", prodGanttFmtShort(summary.etaArrival)), /*#__PURE__*/React.createElement(ProdGanttAlerts, {
      excCount: summary.excCount,
      overdue: summary.overdue,
      compact: true
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement(TodayLine, null), /*#__PURE__*/React.createElement(ProdGanttTrack, {
      shipDate: summary.shipDate,
      etaArrival: summary.etaArrival,
      status: summary.status,
      label: isOpen ? null : `${batchCount} 批汇总`,
      excCount: isOpen ? 0 : summary.excCount,
      overdue: summary.overdue,
      min: min,
      totalDays: totalDays,
      today: today,
      height: isOpen ? 18 : 44,
      compact: !isOpen,
      segments: isOpen ? batches : null,
      segmentsOnly: isOpen
    }))), isOpen && batches.map(b => /*#__PURE__*/React.createElement("div", {
      key: b.id,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 8,
        marginLeft: 32
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: LABEL_W - 32,
        flexShrink: 0,
        paddingLeft: 4
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      },
      title: b.label
    }, b.label), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "var(--tm)",
        display: "flex",
        alignItems: "center",
        gap: 4,
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600,
        color: PROD_GANTT_STATUS[b.status]?.color
      }
    }, PROD_GANTT_STATUS[b.status]?.label), b.sub && /*#__PURE__*/React.createElement("span", null, "\xB7 ", b.sub), /*#__PURE__*/React.createElement(ProdGanttAlerts, {
      excCount: b.excCount,
      overdue: b.overdue,
      compact: true
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement(TodayLine, null), /*#__PURE__*/React.createElement(ProdGanttTrack, {
      shipDate: b.shipDate,
      etaArrival: b.etaArrival,
      status: b.status,
      label: b.label,
      sub: b.sub,
      excCount: b.excCount,
      overdue: b.overdue,
      min: min,
      totalDays: totalDays,
      today: today,
      height: 36
    })))));
  })));
}
function ProdGanttCard({
  items = [],
  today: todayProp,
  productFilter: controlledProductFilter
}) {
  const saved = loadProdGanttFilters();
  const isProductControlled = controlledProductFilter !== undefined;
  const [internalProductFilter, setInternalProductFilter] = useState(saved.productFilter);
  const productFilter = isProductControlled ? controlledProductFilter : internalProductFilter;
  const [statusFilter, setStatusFilter] = useState(saved.statusFilter);
  const [sortBy, setSortBy] = useState(saved.sortBy);
  useEffect(() => {
    if (isProductControlled) {
      const prev = loadProdGanttFilters();
      saveProdGanttFilters({
        ...prev,
        statusFilter,
        sortBy
      });
    } else {
      saveProdGanttFilters({
        productFilter,
        statusFilter,
        sortBy
      });
    }
  }, [productFilter, statusFilter, sortBy, isProductControlled]);
  const today = useMemo(() => {
    const d = todayProp ? new Date(todayProp) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [todayProp]);
  const allProducts = useMemo(() => productionItemsToGanttProducts(items), [items]);
  const viewProducts = useMemo(() => prodApplyGanttView(allProducts, {
    productFilter,
    statusFilter,
    sortBy
  }), [allProducts, productFilter, statusFilter, sortBy]);
  useEffect(() => {
    if (isProductControlled || productFilter === "all" || allProducts.some(p => p.id === productFilter)) return;
    setInternalProductFilter("all");
  }, [allProducts, productFilter, isProductControlled]);
  const chartRef = useRef(null);
  const datedBatchCount = viewProducts.reduce((n, p) => n + (p.batches || []).filter(b => b.shipDate || b.etaArrival).length, 0);
  const hasFilters = !isProductControlled && productFilter !== "all" || statusFilter !== "all";
  const setProduct = id => {
    if (!isProductControlled) setInternalProductFilter(id);
  };
  const setStatus = key => setStatusFilter(key);
  const resetFilters = () => {
    if (!isProductControlled) setInternalProductFilter("all");
    setStatusFilter("all");
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: "1rem 1.25rem",
      marginBottom: "1rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginBottom: 12,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: "var(--text)"
    }
  }, "\u7CBE\u54C1\u751F\u4EA7\u770B\u677F"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginTop: 2
    }
  }, "\u7518\u7279\u65F6\u95F4\u8F74 \xB7 \u81EA\u52A8\u540C\u6B65\u4E0B\u65B9\u751F\u4EA7\u6279\u6B21", allProducts.length > 0 && /*#__PURE__*/React.createElement("span", null, " \xB7 ", viewProducts.length, "/", allProducts.length, " \u4E2A\u4EA7\u54C1 \xB7 \u6BCF\u6279\u6B21\u72EC\u7ACB\u4E00\u884C"))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => prodGanttCaptureScreenshot(chartRef.current).catch(() => alert("截图失败，请重试")),
    style: PROD_GANTT_BTN_PRIMARY
  }, "\uD83D\uDCF7 \u622A\u56FE")), allProducts.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      marginBottom: 12
    }
  }, !isProductControlled && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      flexShrink: 0
    }
  }, "\u4EA7\u54C1"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setProduct("all"),
    style: prodGanttFilterChip(productFilter === "all")
  }, "\u5168\u90E8"), allProducts.map(p => /*#__PURE__*/React.createElement("button", {
    key: p.id,
    type: "button",
    onClick: () => setProduct(p.id),
    style: prodGanttFilterChip(productFilter === p.id),
    title: p.name
  }, p.sku || p.name, p.batches?.length > 1 ? ` (${p.batches.length})` : ""))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      flexShrink: 0
    }
  }, "\u72B6\u6001"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setStatus("all"),
    style: prodGanttFilterChip(statusFilter === "all")
  }, "\u5168\u90E8"), Object.entries(PROD_GANTT_STATUS).map(([k, v]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    type: "button",
    onClick: () => setStatus(k),
    style: prodGanttFilterChip(statusFilter === k)
  }, v.label))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      flexShrink: 0
    }
  }, "\u6392\u5E8F"), PROD_GANTT_SORT_OPTIONS.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.key,
    type: "button",
    onClick: () => setSortBy(o.key),
    style: prodGanttFilterChip(sortBy === o.key)
  }, o.label)), hasFilters && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: resetFilters,
    style: {
      ...prodGanttFilterChip(false),
      marginLeft: 4,
      color: "#2d7dd2",
      borderColor: "#b8d4f0"
    }
  }, "\u6E05\u9664\u7B5B\u9009"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      marginBottom: 12,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, Object.entries(PROD_GANTT_STATUS).map(([k, v]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      fontSize: 10,
      color: v.color,
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: 3,
      background: v.bg,
      border: `2px solid ${v.border}`
    }
  }), v.label)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "#E24B4A",
      fontWeight: 600
    }
  }, "| \u903E\u671F\u7EA2\u6846"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "#b45309",
      fontWeight: 600
    }
  }, "\u26A0 \u5F02\u5E38")), /*#__PURE__*/React.createElement("div", {
    ref: chartRef
  }, !allProducts.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "2rem",
      color: "var(--tm)",
      fontSize: 13
    }
  }, "\u6682\u65E0\u6279\u6B21\uFF0C\u8BF7\u5148\u5728\u4E0B\u65B9\u300C+ \u65B0\u5EFA\u6279\u6B21\u300D") : !viewProducts.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "2rem",
      color: "var(--tm)",
      fontSize: 13
    }
  }, "\u6CA1\u6709\u7B26\u5408\u7B5B\u9009\u6761\u4EF6\u7684\u4EA7\u54C1", /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: resetFilters,
    style: {
      display: "block",
      margin: "8px auto 0",
      background: "none",
      border: "none",
      color: "#2d7dd2",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "\u6E05\u9664\u7B5B\u9009")) : datedBatchCount === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "2rem",
      color: "var(--tm)",
      fontSize: 13
    }
  }, "\u5F53\u524D\u4EA7\u54C1\u6682\u65E0\u65E5\u671F\u6570\u636E\uFF0C\u8BF7\u5728\u4E0B\u65B9\u7684\u6279\u6B21\u4E2D\u586B\u5199\u4E0B\u5355\u65E5\u671F\u6216\u9884\u8BA1\u4EA4\u671F") : /*#__PURE__*/React.createElement(ProdGanttTimeline, {
    products: viewProducts,
    today: today
  })));
}

// ─── PRODUCTION MODULE ─────────────────────────────────────────────────
const PROD_STAGES = ["立项", "打样", "确样", "下单备料", "生产中", "QC验货", "出货", "已完成"];
const prodStageColor = s => ({
  已完成: "#2d9e52",
  出货: "#2d9e52",
  QC验货: "#1a9e8a",
  生产中: "#2d7dd2",
  下单备料: "#7a6dd2",
  确样: "#c07000",
  打样: "#d85a30",
  立项: "#888",
  生产: "#2d7dd2"
})[s] || "#888";
const QC_METHODS = ["自检", "第三方", "工厂自检"];
const QC_RESULTS = ["通过", "不通过", "有条件通过"];
const QC_STYLE = {
  通过: {
    bg: "#d4f0dc",
    c: "#2d9e52"
  },
  不通过: {
    bg: "#fee2e2",
    c: "#e55"
  },
  有条件通过: {
    bg: "#fff0d4",
    c: "#e09000"
  }
};
const EXC_PARTIES = ["工厂", "我方", "供应商", "物料"];
const isShipped = b => ["出货", "已完成"].includes(b.stage);
const openProdExcs = b => (b.exceptions || []).filter(e => !e.resolved);
const deliveryDelta = b => {
  if (!b.actualDelivery || !b.etaDelivery) return null;
  return Math.round((new Date(b.actualDelivery) - new Date(b.etaDelivery)) / 86400000);
};
const deliveryWarning = b => {
  if (isShipped(b) || b.actualDelivery) return null;
  const idx = PROD_STAGES.indexOf(b.stage);
  if (idx >= PROD_STAGES.indexOf("QC验货")) return null;
  const d = daysDiff(b.etaDelivery);
  if (d === null) return null;
  if (d < 0) return {
    level: "over",
    text: `逾期${Math.abs(d)}天`
  };
  if (d <= 3) return {
    level: "urgent",
    text: "紧急"
  };
  if (d <= 7) return {
    level: "soon",
    text: "即将到期"
  };
  return null;
};
const prodBatchStatus = b => {
  if (b.stage === "已完成") return "done";
  if (openProdExcs(b).length) return "blocked";
  const delta = deliveryDelta(b);
  if (delta !== null && delta > 0 && !isShipped(b)) return "overdue";
  const d = daysDiff(b.etaDelivery);
  if (d !== null && d < 0 && !isShipped(b)) return "overdue";
  return "inprog";
};
const isProducing = b => b.stage === "生产中";
const isQcStage = b => b.stage === "QC验货";
const normalizeStage = s => s === "生产" ? "生产中" : s;
const PROD_FILTER_KEY = "ops-prod-filters";
function loadProdFilters() {
  try {
    const raw = sessionStorage.getItem(PROD_FILTER_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === "object") {
        return {
          tabFilter: typeof p.tabFilter === "string" ? p.tabFilter : "all",
          stageFilter: typeof p.stageFilter === "string" ? p.stageFilter : "all",
          ownerFilter: typeof p.ownerFilter === "string" ? p.ownerFilter : "all",
          supplierFilter: typeof p.supplierFilter === "string" ? p.supplierFilter : "all",
          productFilter: typeof p.productFilter === "string" ? p.productFilter : "all",
          excOnly: !!p.excOnly
        };
      }
    }
  } catch {/* ignore */}
  return {
    tabFilter: "all",
    stageFilter: "all",
    ownerFilter: "all",
    supplierFilter: "all",
    productFilter: "all",
    excOnly: false
  };
}
function saveProdFilters(filters) {
  try {
    sessionStorage.setItem(PROD_FILTER_KEY, JSON.stringify(filters));
  } catch {/* ignore */}
}
const prodProductTabChip = active => ({
  background: active ? "#2d7dd2" : "var(--card)",
  color: active ? "#fff" : "var(--text)",
  border: `1px solid ${active ? "#2d7dd2" : "var(--border)"}`,
  borderRadius: 10,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: active ? 600 : 500,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap"
});
const INIT_PROD = [{
  id: 1,
  product: "FB102",
  name: "感温变色款",
  batch: "第一批",
  qty: "500件",
  owner: "李工",
  supplier: "东莞鑫达厂",
  poNumber: "PO20260401",
  orderDate: "2026-04-01",
  etaDelivery: "2026-06-15",
  actualDelivery: "",
  etaShip: "",
  actualShip: "",
  qcMethod: "第三方",
  qcCompany: "SGS",
  qcDate: "",
  qcResult: "",
  qcReportNo: "",
  qcNote: "",
  stage: "打样",
  note: "",
  exceptions: [{
    desc: "感温油墨供应商报价超预期40%",
    date: "2026-05-20",
    impact: "预计延期7天",
    action: "等待管理层决策是否换供应商",
    responsible: "供应商",
    resolved: false,
    resolvedDate: ""
  }]
}, {
  id: 2,
  product: "FB200",
  name: "黑色款",
  batch: "第二批",
  qty: "300件",
  owner: "李工",
  supplier: "宁波精工",
  poNumber: "PO20260415",
  orderDate: "2026-04-15",
  etaDelivery: "2026-05-30",
  actualDelivery: "",
  etaShip: "2026-06-05",
  actualShip: "",
  qcMethod: "工厂自检",
  qcCompany: "",
  qcDate: "",
  qcResult: "",
  qcReportNo: "",
  qcNote: "",
  stage: "生产中",
  note: "",
  exceptions: [{
    desc: "试产缩水问题",
    date: "2026-05-22",
    impact: "质量问题",
    action: "工厂调整模具参数，二次试产中",
    responsible: "工厂",
    resolved: false,
    resolvedDate: ""
  }]
}, {
  id: 3,
  product: "FB200",
  name: "黑色款",
  batch: "第一批",
  qty: "200件",
  owner: "李工",
  supplier: "宁波精工",
  poNumber: "PO20260301",
  orderDate: "2026-03-01",
  etaDelivery: "2026-04-30",
  actualDelivery: "2026-05-02",
  etaShip: "2026-05-10",
  actualShip: "2026-05-12",
  qcMethod: "第三方",
  qcCompany: "BV",
  qcDate: "2026-04-28",
  qcResult: "通过",
  qcReportNo: "BV20260428",
  qcNote: "",
  stage: "已完成",
  note: "",
  exceptions: []
}, {
  id: 4,
  product: "FB400",
  name: "豆浆机",
  batch: "第一批",
  qty: "150件",
  owner: "张工",
  supplier: "顺德家电厂",
  poNumber: "PO20260420",
  orderDate: "2026-04-20",
  etaDelivery: "2026-06-30",
  actualDelivery: "",
  etaShip: "",
  actualShip: "",
  qcMethod: "自检",
  qcCompany: "",
  qcDate: "2026-05-25",
  qcResult: "有条件通过",
  qcReportNo: "QC-FB400-01",
  qcNote: "闪光按键需复测",
  stage: "QC验货",
  note: "",
  exceptions: []
}, {
  id: 5,
  product: "FB501",
  name: "变体款",
  batch: "第一批",
  qty: "200件",
  owner: "张工",
  supplier: "待定点",
  poNumber: "",
  orderDate: "",
  etaDelivery: "2026-07-15",
  actualDelivery: "",
  etaShip: "",
  actualShip: "",
  qcMethod: "自检",
  qcCompany: "",
  qcDate: "",
  qcResult: "",
  qcReportNo: "",
  qcNote: "",
  stage: "立项",
  note: "方案讨论中",
  exceptions: []
}];
const INIT_PROD_DEFAULT = INIT_PROD.map(b => ({
  ...b,
  stage: normalizeStage(b.stage)
}));
function ProdExceptionEditor({
  excs,
  setExcs
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--tm)",
      borderTop: "1px solid var(--border)",
      paddingTop: 10,
      marginBottom: 8
    }
  }, "\u5F02\u5E38\u8BB0\u5F55"), excs.map((ex, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      background: ex.resolved ? "#f0faf4" : "#fff8e6",
      border: `1px solid ${ex.resolved ? "#b7e4c7" : "#ffe0a0"}`,
      borderRadius: 8,
      padding: "10px 12px",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: ex.desc,
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        desc: e.target.value
      };
      setExcs(a);
    },
    placeholder: "\u5F02\u5E38\u63CF\u8FF0",
    style: {
      ...inpSm,
      width: "100%",
      marginBottom: 6
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: ex.date,
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        date: e.target.value
      };
      setExcs(a);
    },
    style: inpSm
  }), /*#__PURE__*/React.createElement("input", {
    value: ex.impact || "",
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        impact: e.target.value
      };
      setExcs(a);
    },
    placeholder: "\u5F71\u54CD\uFF08\u5982\uFF1A\u9884\u8BA1\u5EF6\u671F5\u5929\uFF09",
    style: inpSm
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: 8,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: ex.action || "",
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        action: e.target.value
      };
      setExcs(a);
    },
    placeholder: "\u5904\u7406\u65B9\u5F0F",
    style: inpSm
  }), /*#__PURE__*/React.createElement("select", {
    value: ex.responsible || "工厂",
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        responsible: e.target.value
      };
      setExcs(a);
    },
    style: {
      ...inpSm,
      background: "var(--card)",
      width: 88
    }
  }, EXC_PARTIES.map(p => /*#__PURE__*/React.createElement("option", {
    key: p
  }, p)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      fontSize: 11,
      color: "var(--tm)",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: !!ex.resolved,
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        resolved: e.target.checked
      };
      setExcs(a);
    }
  }), "\u5DF2\u89E3\u51B3"), ex.resolved && /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: ex.resolvedDate || "",
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        resolvedDate: e.target.value
      };
      setExcs(a);
    },
    style: {
      ...inpSm,
      width: 120
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setExcs(excs.filter((_, j) => j !== i)),
    style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      color: "#aaa",
      fontSize: 16,
      marginLeft: "auto"
    }
  }, "\xD7")))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setExcs([...excs, {
      desc: "",
      date: TODAY.toISOString().split("T")[0],
      impact: "",
      action: "",
      responsible: "工厂",
      resolved: false,
      resolvedDate: ""
    }]),
    style: {
      width: "100%",
      border: "1px dashed var(--border)",
      borderRadius: 8,
      padding: "5px 0",
      fontSize: 12,
      cursor: "pointer",
      color: "var(--tm)",
      background: "transparent",
      marginBottom: 12,
      fontFamily: "inherit"
    }
  }, "+ \u8BB0\u5F55\u5F02\u5E38"));
}
function ProdModal({
  item,
  onSave,
  onClose,
  onDelete
}) {
  const [form, setForm] = useState({
    ...item,
    stage: normalizeStage(item.stage)
  });
  const [excs, setExcs] = useState(item.exceptions ? item.exceptions.map(e => ({
    ...e
  })) : []);
  const set = (k, v) => setForm(f => ({
    ...f,
    [k]: v
  }));
  const delta = deliveryDelta(form);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.4)",
      zIndex: 200,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: "2rem 1rem",
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 14,
      padding: "1.5rem",
      width: "100%",
      maxWidth: 720,
      color: "var(--text)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 15,
      marginBottom: "1rem"
    }
  }, item.id ? "编辑生产批次" : "新建生产批次"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--tm)",
      marginBottom: 8
    }
  }, "\u57FA\u672C\u4FE1\u606F"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u4EA7\u54C1\u7F16\u53F7"), /*#__PURE__*/React.createElement("input", {
    value: form.product,
    onChange: e => set("product", e.target.value),
    placeholder: "FB200",
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u6B3E\u5F0F\u540D\u79F0"), /*#__PURE__*/React.createElement("input", {
    value: form.name,
    onChange: e => set("name", e.target.value),
    placeholder: "\u9ED1\u8272\u6B3E",
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u6279\u6B21"), /*#__PURE__*/React.createElement("input", {
    value: form.batch,
    onChange: e => set("batch", e.target.value),
    placeholder: "\u7B2C\u4E8C\u6279",
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u8BA2\u5355\u6570\u91CF"), /*#__PURE__*/React.createElement("input", {
    value: form.qty,
    onChange: e => set("qty", e.target.value),
    placeholder: "500\u4EF6",
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u8DDF\u8FDB\u4EBA"), /*#__PURE__*/React.createElement(OwnerField, {
    value: form.owner,
    onChange: v => set("owner", v),
    inputStyle: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u4F9B\u5E94\u5546"), /*#__PURE__*/React.createElement("input", {
    value: form.supplier || "",
    onChange: e => set("supplier", e.target.value),
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5408\u540C / PO \u7F16\u53F7"), /*#__PURE__*/React.createElement("input", {
    value: form.poNumber || "",
    onChange: e => set("poNumber", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5F53\u524D\u9636\u6BB5"), /*#__PURE__*/React.createElement("select", {
    value: form.stage,
    onChange: e => set("stage", e.target.value),
    style: {
      ...inp,
      background: "var(--card)"
    }
  }, PROD_STAGES.map(s => /*#__PURE__*/React.createElement("option", {
    key: s
  }, s))))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--tm)",
      borderTop: "1px solid var(--border)",
      paddingTop: 10,
      marginBottom: 8
    }
  }, "\u65F6\u95F4\u8282\u70B9"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u4E0B\u5355\u65E5\u671F"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.orderDate,
    onChange: e => set("orderDate", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u9884\u8BA1\u4EA4\u671F"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.etaDelivery,
    onChange: e => set("etaDelivery", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5B9E\u9645\u4EA4\u671F"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.actualDelivery,
    onChange: e => set("actualDelivery", e.target.value),
    style: inp
  }))), delta !== null && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      marginBottom: 10,
      padding: "6px 10px",
      borderRadius: 8,
      background: delta > 0 ? "#fee2e2" : "#f0faf4",
      color: delta > 0 ? "#b91c1c" : "#1a6b35"
    }
  }, "\u4EA4\u671F\u5BF9\u6BD4\uFF1A", delta > 0 ? `晚 ${delta} 天` : delta < 0 ? `提前 ${Math.abs(delta)} 天` : "准时"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u9884\u8BA1\u51FA\u8D27\u65E5"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.etaShip || "",
    onChange: e => set("etaShip", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5B9E\u9645\u51FA\u8D27\u65E5"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.actualShip || "",
    onChange: e => set("actualShip", e.target.value),
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--tm)",
      borderTop: "1px solid var(--border)",
      paddingTop: 10,
      marginBottom: 8
    }
  }, "QC \u4FE1\u606F"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      marginBottom: 10,
      flexWrap: "wrap"
    }
  }, QC_METHODS.map(m => /*#__PURE__*/React.createElement("label", {
    key: m,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      fontSize: 12,
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: "qcMethod",
    checked: form.qcMethod === m,
    onChange: () => set("qcMethod", m)
  }), m))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, form.qcMethod === "第三方" && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "QC \u516C\u53F8"), /*#__PURE__*/React.createElement("input", {
    value: form.qcCompany || "",
    onChange: e => set("qcCompany", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "QC \u65E5\u671F"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.qcDate || "",
    onChange: e => set("qcDate", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "QC \u7ED3\u8BBA"), /*#__PURE__*/React.createElement("select", {
    value: form.qcResult || "",
    onChange: e => set("qcResult", e.target.value),
    style: {
      ...inp,
      background: "var(--card)"
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "\u2014"), QC_RESULTS.map(r => /*#__PURE__*/React.createElement("option", {
    key: r
  }, r))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "QC \u62A5\u544A\u7F16\u53F7"), /*#__PURE__*/React.createElement("input", {
    value: form.qcReportNo || "",
    onChange: e => set("qcReportNo", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "QC \u5907\u6CE8"), /*#__PURE__*/React.createElement("input", {
    value: form.qcNote || "",
    onChange: e => set("qcNote", e.target.value),
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5907\u6CE8"), /*#__PURE__*/React.createElement("input", {
    value: form.note || "",
    onChange: e => set("note", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement(ProdExceptionEditor, {
    excs: excs,
    setExcs: setExcs
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderTop: "1px solid var(--border)",
      paddingTop: 12
    }
  }, item.id ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onDelete,
    style: {
      background: "none",
      border: "none",
      color: "#e55",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "\u5220\u9664") : /*#__PURE__*/React.createElement("div", null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClose,
    style: {
      background: "transparent",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "6px 14px",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "var(--tm)"
    }
  }, "\u53D6\u6D88"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      if (!form.product.trim()) return;
      onSave({
        ...form,
        exceptions: excs
      });
    },
    style: {
      background: "#2d7dd2",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      padding: "6px 16px",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit",
      fontWeight: 600
    }
  }, "\u4FDD\u5B58")))));
}
function ProdBatchCard({
  item,
  onClick
}) {
  const [showResolved, setShowResolved] = useState(false);
  const st = prodBatchStatus(item);
  const stage = normalizeStage(item.stage);
  const bc = st === "done" ? "#2d9e52" : st === "blocked" ? "#e09000" : st === "overdue" ? "#e55" : "#2d7dd2";
  const stageIdx = PROD_STAGES.indexOf(stage);
  const openExcs = openProdExcs(item);
  const resolvedExcs = (item.exceptions || []).filter(e => e.resolved);
  const delta = deliveryDelta(item);
  const warn = deliveryWarning(item);
  const qc = item.qcResult ? QC_STYLE[item.qcResult] : null;
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderLeft: `3px solid ${bc}`,
      borderRadius: 10,
      padding: "12px 14px",
      cursor: "pointer",
      marginBottom: 8
    },
    onMouseEnter: e => e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)",
    onMouseLeave: e => e.currentTarget.style.boxShadow = "none"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap",
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600
    }
  }, item.batch), item.supplier && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, item.supplier), /*#__PURE__*/React.createElement("span", {
    style: badge(st === "done" ? "#d4f0dc" : st === "blocked" ? "#fff0d4" : st === "overdue" ? "#fee2e2" : "#dceeff", st === "done" ? "#1a6b35" : st === "blocked" ? "#7a4a00" : st === "overdue" ? "#b91c1c" : "#1a4e8a")
  }, stage))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: item.owner
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, item.owner), /*#__PURE__*/React.createElement(RoleBadge, {
    role: getStaffRole(item.owner)
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      flexWrap: "nowrap",
      gap: 0,
      marginBottom: 8,
      overflowX: "auto",
      paddingBottom: 2
    }
  }, PROD_STAGES.map((s, i) => {
    const done = i < stageIdx;
    const active = i === stageIdx;
    const c = active ? prodStageColor(s) : done ? "#2d9e52" : "var(--border)";
    return /*#__PURE__*/React.createElement("span", {
      key: s,
      style: {
        display: "flex",
        alignItems: "center",
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 3
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: active ? 10 : 7,
        height: active ? 10 : 7,
        borderRadius: "50%",
        background: c,
        outline: active ? `2px solid ${c}` : "none",
        outlineOffset: 2,
        display: "inline-block"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        color: active ? "var(--text)" : done ? "var(--tm)" : "var(--border)",
        fontWeight: active ? 600 : 400,
        whiteSpace: "nowrap"
      }
    }, s === "下单备料" ? "备料" : s === "生产中" ? "生产" : s.replace("QC验货", "QC"))), i < PROD_STAGES.length - 1 && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 10,
        height: 2,
        background: done ? "#2d9e52" : "var(--border)",
        margin: "0 2px"
      }
    }));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      display: "flex",
      gap: 12,
      flexWrap: "wrap",
      marginBottom: 8
    }
  }, item.orderDate && /*#__PURE__*/React.createElement("span", null, "\u4E0B\u5355 ", fmtD(item.orderDate)), item.etaDelivery && /*#__PURE__*/React.createElement("span", null, "\u9884\u8BA1\u4EA4\u671F ", fmtD(item.etaDelivery)), item.actualDelivery && /*#__PURE__*/React.createElement("span", {
    style: {
      color: delta > 0 ? "#e55" : "#2d9e52"
    }
  }, "\u5B9E\u4EA4 ", fmtD(item.actualDelivery), delta !== null && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 4
    }
  }, "(", delta > 0 ? `晚${delta}天` : delta < 0 ? `提前${Math.abs(delta)}天` : "准时", ")")), warn && /*#__PURE__*/React.createElement("span", {
    style: badge(warn.level === "over" || warn.level === "urgent" ? "#fee2e2" : "#fff0d4", warn.level === "over" || warn.level === "urgent" ? "#b91c1c" : "#7a4a00")
  }, warn.text)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, qc && /*#__PURE__*/React.createElement("span", {
    style: badge(qc.bg, qc.c)
  }, "QC ", item.qcResult), openExcs.length > 0 && /*#__PURE__*/React.createElement("span", {
    style: badge("#fee2e2", "#b91c1c")
  }, "\u26A0 ", openExcs.length, " \u5F02\u5E38"), item.qty && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, item.qty), item.updatedAt && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--tm)"
    }
  }, "\u66F4\u65B0 ", formatSharedTime(item.updatedAt))), openExcs.map((ex, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    onClick: e => e.stopPropagation(),
    style: {
      marginTop: 7,
      padding: "6px 10px",
      background: "#fff8e6",
      color: "#7a4a00",
      borderRadius: 7,
      fontSize: 11,
      lineHeight: 1.5,
      borderLeft: "3px solid #e09000"
    }
  }, "\u26A1 ", ex.desc, ex.impact && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#555"
    }
  }, " \xB7 ", ex.impact), ex.action && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#555"
    }
  }, " \u2192 ", ex.action), ex.responsible && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#888"
    }
  }, " [", ex.responsible, "]"))), resolvedExcs.length > 0 && /*#__PURE__*/React.createElement("div", {
    onClick: e => {
      e.stopPropagation();
      setShowResolved(!showResolved);
    },
    style: {
      marginTop: 6,
      fontSize: 10,
      color: "var(--tm)",
      cursor: "pointer"
    }
  }, showResolved ? "▲ 收起" : "▼", " \u5DF2\u89E3\u51B3 ", resolvedExcs.length, " \u6761", showResolved && resolvedExcs.map((ex, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      marginTop: 4,
      padding: "4px 8px",
      background: "#f0faf4",
      borderRadius: 6,
      color: "#666"
    }
  }, ex.desc))));
}
function ProductGroup({
  product,
  name,
  batches,
  onEdit
}) {
  const hasOpenExc = batches.some(b => openProdExcs(b).length > 0);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
      padding: "8px 12px",
      background: "var(--bg)",
      borderRadius: 10,
      border: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700
    }
  }, product), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--tm)"
    }
  }, name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, batches.length, " \u4E2A\u6279\u6B21"), hasOpenExc && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: "#e55",
      flexShrink: 0
    },
    title: "\u6709\u672A\u89E3\u51B3\u5F02\u5E38"
  })), batches.map(b => /*#__PURE__*/React.createElement(ProdBatchCard, {
    key: b.id,
    item: b,
    onClick: () => onEdit(b)
  })));
}
function ProductionPanel({
  active = true
}) {
  const {
    items,
    meta,
    loading,
    saving,
    error,
    persist,
    reload
  } = useSharedList("production", INIT_PROD_DEFAULT, {
    active
  });
  const list = Array.isArray(items) ? items : [];
  const savedFilters = loadProdFilters();
  const [modal, setModal] = useState(null);
  const [tabFilter, setTabFilter] = useState(savedFilters.tabFilter || "all");
  const [stageFilter, setStageFilter] = useState(savedFilters.stageFilter || "all");
  const [ownerFilter, setOwnerFilter] = useState(savedFilters.ownerFilter || "all");
  const [supplierFilter, setSupplierFilter] = useState(savedFilters.supplierFilter || "all");
  const [productFilter, setProductFilter] = useState(savedFilters.productFilter || "all");
  const [excOnly, setExcOnly] = useState(!!savedFilters.excOnly);
  const products = useMemo(() => productionItemsToGanttProducts(list), [list]);
  const currentProduct = productFilter === "all" ? null : products.find(p => p.id === productFilter) || null;
  useEffect(() => {
    if (productFilter === "all" || products.some(p => p.id === productFilter)) return;
    setProductFilter("all");
  }, [products, productFilter]);
  useEffect(() => {
    saveProdFilters({
      tabFilter,
      stageFilter,
      ownerFilter,
      supplierFilter,
      productFilter,
      excOnly
    });
  }, [tabFilter, stageFilter, ownerFilter, supplierFilter, productFilter, excOnly]);
  const scopedList = productFilter === "all" ? list : list.filter(b => prodMatchesProduct(b, productFilter));
  const counts = {
    all: scopedList.length,
    blocked: scopedList.filter(i => prodBatchStatus(i) === "blocked").length,
    overdue: scopedList.filter(i => prodBatchStatus(i) === "overdue").length,
    producing: scopedList.filter(isProducing).length,
    qc: scopedList.filter(isQcStage).length,
    done: scopedList.filter(i => i.stage === "已完成").length
  };
  const owners = ownerFilterEntries();
  const suppliers = ["all", ...new Set(scopedList.map(i => i.supplier).filter(Boolean))];
  let vis = scopedList.slice();
  if (tabFilter === "blocked") vis = vis.filter(i => prodBatchStatus(i) === "blocked");else if (tabFilter === "overdue") vis = vis.filter(i => prodBatchStatus(i) === "overdue");else if (tabFilter === "producing") vis = vis.filter(isProducing);else if (tabFilter === "qc") vis = vis.filter(isQcStage);else if (tabFilter === "done") vis = vis.filter(i => i.stage === "已完成");
  if (stageFilter !== "all") vis = vis.filter(i => normalizeStage(i.stage) === stageFilter);
  if (ownerFilter !== "all") vis = vis.filter(i => i.owner === ownerFilter);
  if (supplierFilter !== "all") vis = vis.filter(i => i.supplier === supplierFilter);
  if (excOnly) vis = vis.filter(i => openProdExcs(i).length > 0);
  const groups = {};
  vis.forEach(b => {
    const key = prodGroupKey(b);
    if (!groups[key]) groups[key] = {
      product: b.product,
      name: b.name,
      batches: []
    };
    groups[key].batches.push(b);
  });
  Object.values(groups).forEach(g => {
    g.batches.sort((a, b) => {
      const da = a.orderDate || a.etaDelivery || "";
      const db = b.orderDate || b.etaDelivery || "";
      return db.localeCompare(da);
    });
  });
  const groupList = Object.values(groups).sort((a, b) => a.product.localeCompare(b.product));
  const emptyBatch = {
    product: "",
    name: "",
    batch: "第一批",
    qty: "",
    owner: "",
    supplier: "",
    poNumber: "",
    orderDate: "",
    etaDelivery: "",
    actualDelivery: "",
    etaShip: "",
    actualShip: "",
    qcMethod: "自检",
    qcCompany: "",
    qcDate: "",
    qcResult: "",
    qcReportNo: "",
    qcNote: "",
    stage: "立项",
    note: "",
    exceptions: []
  };
  const emptyBatchForProduct = () => {
    if (!currentProduct) return {
      ...emptyBatch
    };
    return {
      ...emptyBatch,
      product: currentProduct.product || currentProduct.sku || "",
      name: currentProduct.styleName || ""
    };
  };
  const save = t => {
    const now = Date.now();
    if (t.id) persist(list.map(x => x.id === t.id ? {
      ...t,
      updatedAt: now
    } : x));else persist([...list, {
      ...t,
      id: Math.max(0, ...list.map(x => x.id || 0)) + 1,
      updatedAt: now
    }]);
    setModal(null);
  };
  const clone = b => ({
    ...b,
    exceptions: (b.exceptions || []).map(e => ({
      ...e
    }))
  });
  const tabs = [{
    key: "all",
    label: "全部",
    nc: "var(--text)"
  }, {
    key: "blocked",
    label: "异常未解决",
    nc: "#e09000"
  }, {
    key: "overdue",
    label: "逾期未交",
    nc: "#e55"
  }, {
    key: "producing",
    label: "生产中",
    nc: "#2d7dd2"
  }, {
    key: "qc",
    label: "QC中",
    nc: "#1a9e8a"
  }, {
    key: "done",
    label: "已完成",
    nc: "#2d9e52"
  }];
  useCloudSyncPage(active, {
    label: "生产",
    save: async () => persist(list),
    reload,
    meta,
    loading,
    saving,
    error,
    isDirty: !!modal,
    dirtyHint: "生产批次编辑弹窗未保存"
  });
  return /*#__PURE__*/React.createElement("div", null, products.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: "1rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginBottom: 8
    }
  }, "\u4EA7\u54C1\u5206\u9875 \xB7 \u5207\u6362\u67E5\u770B\u5404\u4EA7\u54C1\u751F\u4EA7\u8FDB\u5EA6"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setProductFilter("all"),
    style: prodProductTabChip(productFilter === "all")
  }, "\u5168\u90E8\u4EA7\u54C1", /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 6,
      fontSize: 11,
      opacity: 0.85
    }
  }, "(", list.length, ")")), products.map(p => /*#__PURE__*/React.createElement("button", {
    key: p.id,
    type: "button",
    onClick: () => setProductFilter(p.id),
    style: prodProductTabChip(productFilter === p.id),
    title: p.name
  }, p.sku || p.name, /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 6,
      fontSize: 11,
      opacity: 0.85
    }
  }, "(", p.batches.length, ")"))))), currentProduct && /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--card)",
      border: "1px solid #2d7dd2",
      borderRadius: 12,
      padding: "12px 16px",
      marginBottom: "1rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: "var(--text)"
    }
  }, currentProduct.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginTop: 4
    }
  }, currentProduct.batches.length, " \u4E2A\u751F\u4EA7\u6279\u6B21 \xB7 \u4EC5\u663E\u793A\u672C\u4EA7\u54C1\u76F8\u5173\u8BA2\u5355")), /*#__PURE__*/React.createElement(ProdGanttCard, {
    items: list,
    productFilter: productFilter
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: "1rem",
      flexWrap: "wrap",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(6, 1fr)",
      gap: 7,
      flex: 1,
      minWidth: 320
    }
  }, tabs.map(f => /*#__PURE__*/React.createElement("div", {
    key: f.key,
    onClick: () => setTabFilter(f.key),
    style: {
      background: "var(--card)",
      border: `1px solid ${tabFilter === f.key ? "#2d7dd2" : "var(--border)"}`,
      borderRadius: 10,
      padding: "9px 8px",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      color: f.nc
    }
  }, counts[f.key]), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginTop: 1
    }
  }, f.label)))), /*#__PURE__*/React.createElement("button", {
    onClick: () => setModal(emptyBatchForProduct()),
    style: {
      background: "#2d7dd2",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      padding: "8px 16px",
      fontSize: 13,
      cursor: "pointer",
      fontFamily: "inherit",
      fontWeight: 600,
      flexShrink: 0
    }
  }, "+ \u65B0\u5EFA\u6279\u6B21")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginBottom: "1rem",
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("select", {
    value: stageFilter,
    onChange: e => setStageFilter(e.target.value),
    style: {
      ...inpSm,
      background: "var(--card)",
      width: "auto"
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "\u5168\u90E8\u9636\u6BB5"), PROD_STAGES.map(s => /*#__PURE__*/React.createElement("option", {
    key: s,
    value: s
  }, s))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, "\u8DDF\u8FDB\u4EBA"), owners.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.name,
    type: "button",
    onClick: () => setOwnerFilter(o.name),
    style: {
      background: ownerFilter === o.name ? "#2d7dd2" : "var(--card)",
      color: ownerFilter === o.name ? "#fff" : "var(--tm)",
      border: `1px solid ${ownerFilter === o.name ? "#2d7dd2" : "var(--border)"}`,
      borderRadius: 20,
      padding: "4px 10px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      display: "inline-flex",
      alignItems: "center",
      gap: 4
    }
  }, o.name === "all" ? "全部" : /*#__PURE__*/React.createElement(React.Fragment, null, o.name, o.role && /*#__PURE__*/React.createElement(RoleBadge, {
    role: o.role,
    style: {
      padding: "0 5px",
      fontSize: 9
    }
  })))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginLeft: 4
    }
  }, "\u4F9B\u5E94\u5546"), suppliers.slice(0, 6).map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    type: "button",
    onClick: () => setSupplierFilter(s),
    style: {
      background: supplierFilter === s ? "#7a6dd2" : "var(--card)",
      color: supplierFilter === s ? "#fff" : "var(--tm)",
      border: `1px solid ${supplierFilter === s ? "#7a6dd2" : "var(--border)"}`,
      borderRadius: 20,
      padding: "4px 10px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, s === "all" ? "全部" : s)), /*#__PURE__*/React.createElement("label", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      fontSize: 11,
      color: "var(--tm)",
      cursor: "pointer",
      marginLeft: 4
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: excOnly,
    onChange: e => setExcOnly(e.target.checked)
  }), "\u53EA\u770B\u5F02\u5E38")), /*#__PURE__*/React.createElement("div", null, groupList.length ? groupList.map(g => /*#__PURE__*/React.createElement(ProductGroup, {
    key: `${g.product}-${g.name}`,
    product: g.product,
    name: g.name,
    batches: g.batches,
    onEdit: b => setModal(clone(b))
  })) : /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "2rem",
      color: "var(--tm)",
      fontSize: 13
    }
  }, currentProduct ? "该产品暂无匹配批次" : "暂无匹配批次")), modal && /*#__PURE__*/React.createElement(ProdModal, {
    item: modal,
    onSave: save,
    onClose: () => {
      if (!window.confirm("弹窗未点「保存」，修改不会上传。确定关闭？")) return;
      setModal(null);
    },
    onDelete: () => {
      persist(list.filter(x => x.id !== modal.id), {
        replace: true
      });
      setModal(null);
    }
  }));
}

// Shared helpers (TODAY, fmtD, Avatar, …) come from LogisticsModule.browser.jsx loaded first.

// ─── TOOLS MODULE ──────────────────────────────────────────────────────
// 新窗口：url/openUrl  |  可换链：configurableUrl: true  |  内嵌：target: "inline"  |  组件：component
// runtime: "local" = 本机 Windows 工具（云端仅下载，不在服务器执行）

const URL_STORAGE_PREFIX = "ops-center-tool-url-";
const NAME_STORAGE_PREFIX = "ops-center-tool-name-";
const ONLINE_DOCS_KEY = "ops-center-online-docs";
const DEFAULT_ONLINE_DOC = {
  id: "online-doc-default",
  name: "在线文档",
  url: "https://www.kdocs.cn/l/cuP9MuR9zUkN?R=L1MvMTE=",
  desc: "金山 / 钉钉 / 飞书等在线文档，链接可随时更换",
  icon: "📄"
};
const DEFAULT_ONLINE_DOCS = [DEFAULT_ONLINE_DOC];

/** 仅用于从旧版 localStorage 一次性迁移 */
function readLegacyOnlineDocs() {
  try {
    const raw = localStorage.getItem(ONLINE_DOCS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {/* ignore */}
  const legacyUrl = localStorage.getItem(URL_STORAGE_PREFIX + "online-doc");
  const legacyName = localStorage.getItem(NAME_STORAGE_PREFIX + "online-doc");
  if (legacyUrl || legacyName) {
    return [{
      ...DEFAULT_ONLINE_DOC,
      name: legacyName || DEFAULT_ONLINE_DOC.name,
      url: legacyUrl || DEFAULT_ONLINE_DOC.url
    }];
  }
  return null;
}
function clearLegacyOnlineDocsStorage() {
  try {
    localStorage.removeItem(ONLINE_DOCS_KEY);
    localStorage.removeItem(URL_STORAGE_PREFIX + "online-doc");
    localStorage.removeItem(NAME_STORAGE_PREFIX + "online-doc");
  } catch {/* ignore */}
}
const onlineDocToTool = doc => ({
  id: doc.id,
  name: doc.name || "在线文档",
  desc: doc.desc || DEFAULT_ONLINE_DOC.desc,
  icon: doc.icon || "📄",
  category: "运营",
  configurableUrl: true,
  defaultUrl: doc.url || "",
  isOnlineDoc: true
});
const toolUrl = (tool, customUrls = {}) => {
  if (tool.isOnlineDoc) return tool.defaultUrl || "";
  if (tool.configurableUrl) return customUrls[tool.id] || tool.defaultUrl || "";
  return tool.url || tool.openUrl;
};
const toolDisplayName = (tool, customNames = {}) => {
  if (tool.isOnlineDoc) return tool.name;
  return tool.configurableUrl && customNames[tool.id] ? customNames[tool.id] : tool.name;
};
const resolveToolUrl = url => {
  if (!url) return "";
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
};
const openToolUrl = url => {
  const target = resolveToolUrl(url);
  if (!target) return false;
  window.open(target, "_blank", "noopener,noreferrer");
  return true;
};
const downloadToolPackage = tool => {
  const url = resolveToolUrl(tool.downloadUrl);
  if (!url) return false;
  const a = document.createElement("a");
  a.href = url;
  a.download = tool.downloadName || "";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
};
const UNIT_CATALOG = {
  mass: {
    label: "质量",
    base: "kg",
    groups: [{
      name: "公制",
      units: [{
        id: "t",
        name: "吨",
        sym: "t",
        factor: 1000
      }, {
        id: "kg",
        name: "千克",
        sym: "kg",
        factor: 1
      }, {
        id: "g",
        name: "克",
        sym: "g",
        factor: 0.001
      }, {
        id: "mg",
        name: "毫克",
        sym: "mg",
        factor: 1e-6
      }]
    }, {
      name: "英制",
      units: [{
        id: "lb",
        name: "磅",
        sym: "lb",
        factor: 0.45359237
      }, {
        id: "oz",
        name: "盎司",
        sym: "oz",
        factor: 0.028349523125
      }]
    }],
    defaults: {
      left: "kg",
      right: "lb",
      leftVal: "1"
    }
  },
  length: {
    label: "长度",
    base: "m",
    groups: [{
      name: "公制",
      units: [{
        id: "km",
        name: "千米",
        sym: "km",
        factor: 1000
      }, {
        id: "m",
        name: "米",
        sym: "m",
        factor: 1
      }, {
        id: "cm",
        name: "厘米",
        sym: "cm",
        factor: 0.01
      }, {
        id: "mm",
        name: "毫米",
        sym: "mm",
        factor: 0.001
      }]
    }, {
      name: "英制",
      units: [{
        id: "mile",
        name: "英里",
        sym: "mi",
        factor: 1609.344
      }, {
        id: "ft",
        name: "英尺",
        sym: "ft",
        factor: 0.3048
      }, {
        id: "in",
        name: "英寸",
        sym: "in",
        factor: 0.0254
      }]
    }],
    defaults: {
      left: "m",
      right: "cm",
      leftVal: "1"
    }
  }
};
const allUnits = cat => UNIT_CATALOG[cat].groups.flatMap(g => g.units);
const findUnit = (cat, id) => allUnits(cat).find(u => u.id === id);
const fmtConvNum = (n, summary = false) => {
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  if (summary) {
    if (abs >= 100) return Number(n.toFixed(2)).toString();
    if (abs >= 1) return Number(n.toFixed(4)).toString();
    return Number(n.toPrecision(4)).toString();
  }
  if (abs === 0) return "0";
  if (abs >= 10000) return Number(n.toFixed(2)).toString();
  if (abs >= 1) return Number(n.toFixed(6)).toString();
  if (abs >= 0.0001) return Number(n.toPrecision(8)).toString();
  return n.toExponential(4);
};
const convert = (val, fromId, toId, cat) => {
  const from = findUnit(cat, fromId);
  const to = findUnit(cat, toId);
  if (!from || !to) return "";
  const n = parseFloat(val);
  if (val.trim() === "" || !Number.isFinite(n)) return "";
  return fmtConvNum(n * from.factor / to.factor);
};
const unitLabel = u => u ? `${u.name}(${u.sym})` : "";
function UnitPicker({
  cat,
  selected,
  onSelect,
  onClose
}) {
  const cfg = UNIT_CATALOG[cat];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      border: "1px solid var(--border)",
      borderRadius: 10,
      overflow: "hidden",
      background: "var(--card)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 0
    }
  }, cfg.groups.map(g => /*#__PURE__*/React.createElement("div", {
    key: g.name,
    style: {
      padding: "10px 12px",
      borderRight: g.name === cfg.groups[0]?.name ? "1px solid var(--border)" : "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginBottom: 8,
      fontWeight: 600
    }
  }, g.name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 2
    }
  }, g.units.map(u => /*#__PURE__*/React.createElement("button", {
    key: u.id,
    type: "button",
    onClick: () => {
      onSelect(u.id);
      onClose();
    },
    style: {
      textAlign: "left",
      background: selected === u.id ? "rgba(45,125,210,0.12)" : "transparent",
      color: selected === u.id ? "#2d7dd2" : "var(--text)",
      border: "none",
      borderRadius: 6,
      padding: "7px 10px",
      fontSize: 13,
      cursor: "pointer",
      fontFamily: "inherit",
      fontWeight: selected === u.id ? 600 : 400
    }
  }, unitLabel(u))))))));
}
function UnitConverterTool() {
  const [cat, setCat] = useState("mass");
  const [leftUnit, setLeftUnit] = useState("kg");
  const [rightUnit, setRightUnit] = useState("lb");
  const [leftVal, setLeftVal] = useState("1");
  const [rightVal, setRightVal] = useState("2.2046");
  const [picker, setPicker] = useState(null);
  const applyDefaults = nextCat => {
    const d = UNIT_CATALOG[nextCat].defaults;
    setLeftUnit(d.left);
    setRightUnit(d.right);
    setLeftVal(d.leftVal);
    setRightVal(convert(d.leftVal, d.left, d.right, nextCat));
    setPicker(null);
  };
  const switchCat = nextCat => {
    setCat(nextCat);
    applyDefaults(nextCat);
  };
  const onLeftVal = v => {
    setLeftVal(v);
    setRightVal(convert(v, leftUnit, rightUnit, cat));
  };
  const onRightVal = v => {
    setRightVal(v);
    setLeftVal(convert(v, rightUnit, leftUnit, cat));
  };
  const onLeftUnit = id => {
    setLeftUnit(id);
    setRightVal(convert(leftVal, id, rightUnit, cat));
  };
  const onRightUnit = id => {
    setRightUnit(id);
    setRightVal(convert(leftVal, leftUnit, id, cat));
  };
  const swap = () => {
    setLeftUnit(rightUnit);
    setRightUnit(leftUnit);
    setLeftVal(rightVal);
    setRightVal(leftVal);
    setPicker(null);
  };
  const leftU = findUnit(cat, leftUnit);
  const rightU = findUnit(cat, rightUnit);
  const ratio = leftU && rightU ? leftU.factor / rightU.factor : 0;
  const summary = ratio ? `1${leftU.name}=${fmtConvNum(ratio, true)}${rightU.name}` : "";
  const boxStyle = {
    flex: 1,
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    background: "var(--bg)"
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 0,
      marginBottom: 16,
      borderBottom: "1px solid var(--border)"
    }
  }, Object.entries(UNIT_CATALOG).map(([key, cfg]) => /*#__PURE__*/React.createElement("button", {
    key: key,
    type: "button",
    onClick: () => switchCat(key),
    style: {
      background: cat === key ? "var(--card)" : "transparent",
      color: cat === key ? "#2d7dd2" : "var(--tm)",
      border: "none",
      borderBottom: cat === key ? "2px solid #2d7dd2" : "2px solid transparent",
      padding: "10px 20px",
      fontSize: 14,
      fontWeight: cat === key ? 600 : 400,
      cursor: "pointer",
      fontFamily: "inherit",
      marginBottom: -1
    }
  }, cfg.label))), summary && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 700,
      marginBottom: 20,
      letterSpacing: "-0.02em"
    }
  }, summary), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "stretch",
      gap: 10,
      marginBottom: picker ? 0 : 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: boxStyle
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    inputMode: "decimal",
    value: leftVal,
    onChange: e => onLeftVal(e.target.value),
    style: {
      width: "100%",
      border: "none",
      background: "transparent",
      fontSize: 28,
      fontWeight: 600,
      padding: "16px 14px 8px",
      fontFamily: "inherit",
      color: "var(--text)",
      outline: "none",
      boxSizing: "border-box"
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setPicker(picker === "left" ? null : "left"),
    style: {
      width: "100%",
      border: "none",
      borderTop: "1px solid var(--border)",
      background: picker === "left" ? "rgba(45,125,210,0.08)" : "var(--card)",
      padding: "10px 14px",
      fontSize: 13,
      color: picker === "left" ? "#2d7dd2" : "var(--text)",
      cursor: "pointer",
      fontFamily: "inherit",
      textAlign: "left",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", null, unitLabel(leftU)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--tm)"
    }
  }, picker === "left" ? "▲" : "▼"))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: swap,
    title: "\u4E92\u6362\u5355\u4F4D\u4E0E\u6570\u503C",
    style: {
      alignSelf: "center",
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      width: 44,
      height: 44,
      fontSize: 20,
      cursor: "pointer",
      color: "#2d7dd2",
      fontFamily: "inherit",
      flexShrink: 0
    }
  }, "\u21C4"), /*#__PURE__*/React.createElement("div", {
    style: boxStyle
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    inputMode: "decimal",
    value: rightVal,
    onChange: e => onRightVal(e.target.value),
    style: {
      width: "100%",
      border: "none",
      background: "transparent",
      fontSize: 28,
      fontWeight: 600,
      padding: "16px 14px 8px",
      fontFamily: "inherit",
      color: "var(--text)",
      outline: "none",
      boxSizing: "border-box"
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setPicker(picker === "right" ? null : "right"),
    style: {
      width: "100%",
      border: "none",
      borderTop: "1px solid var(--border)",
      background: picker === "right" ? "rgba(45,125,210,0.08)" : "var(--card)",
      padding: "10px 14px",
      fontSize: 13,
      color: picker === "right" ? "#2d7dd2" : "var(--text)",
      cursor: "pointer",
      fontFamily: "inherit",
      textAlign: "left",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", null, unitLabel(rightU)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--tm)"
    }
  }, picker === "right" ? "▲" : "▼")))), picker && /*#__PURE__*/React.createElement(UnitPicker, {
    cat: cat,
    selected: picker === "left" ? leftUnit : rightUnit,
    onSelect: picker === "left" ? onLeftUnit : onRightUnit,
    onClose: () => setPicker(null)
  }));
}
const TOOL_CATALOG = [{
  id: "weight-converter",
  name: "单位换算",
  desc: "质量与长度实时换算，支持多单位切换",
  icon: "⚖️",
  category: "常用",
  component: UnitConverterTool
}, {
  id: "fba-profit",
  name: "FBA 利润计算器",
  desc: "全链路利润：体积重、尺寸分档、头程 / 佣金 / 退货",
  icon: "💰",
  category: "FBA",
  openUrl: "fba-profit-calculator.html"
}, {
  id: "fba-warehouse",
  name: "FBA 分仓工具",
  desc: "美国货运参谋：分仓方案、头程与仓储费用测算",
  icon: "📦",
  category: "FBA",
  openUrl: "fba-warehouse-tool.html"
}, {
  id: "fba-hanhai",
  name: "FBA → 瀚海万博转换",
  desc: "批量上传 FBA 原厂包装 CSV，转换为瀚海万博 B2B 单票导入模版 (.xls) 并打包下载",
  icon: "🚢",
  category: "物流",
  target: "inline",
  openUrl: "tools/fba-hanhai-converter/index.html"
}, {
  id: "amazon-tracker",
  name: "亚马逊推广追踪",
  desc: "精铺/精品 · 月度规划 · 投入产出分析",
  icon: "📦",
  category: "运营",
  url: "https://xiaopong190-oss.github.io/ops-center/tools/amazon-tracker/"
}, {
  id: "jingpu-flow",
  name: "精铺流程",
  desc: "七阶段运营清单 · 从抵达到分类决策 · 逐项勾选跟踪",
  icon: "✅",
  category: "运营",
  target: "inline",
  openUrl: "tools/jingpu-flow/index.html"
}];
const loadCustomUrls = () => {
  const saved = {};
  for (const t of TOOL_CATALOG) {
    if (!t.configurableUrl) continue;
    try {
      const v = localStorage.getItem(URL_STORAGE_PREFIX + t.id);
      if (v) saved[t.id] = v;
    } catch {/* ignore */}
  }
  return saved;
};
const loadCustomNames = () => {
  const saved = {};
  for (const t of TOOL_CATALOG) {
    if (!t.configurableUrl) continue;
    try {
      const v = localStorage.getItem(NAME_STORAGE_PREFIX + t.id);
      if (v) saved[t.id] = v;
    } catch {/* ignore */}
  }
  return saved;
};
const TOOL_CATEGORIES = ["全部", ...new Set(TOOL_CATALOG.map(t => t.category))];
const lblSm = {
  display: "block",
  fontSize: 10,
  color: "var(--tm)",
  marginBottom: 3
};
function ToolCard({
  tool,
  displayName,
  resolvedUrl,
  isEditing,
  editName,
  editUrl,
  onOpen,
  onStartEdit,
  onEditNameChange,
  onEditUrlChange,
  onEditSave,
  onEditSaveAndOpen,
  onEditCancel,
  onDuplicate,
  onDelete
}) {
  const href = resolvedUrl ?? toolUrl(tool);
  const inline = tool.target === "inline";
  const configurable = !!tool.configurableUrl;
  const isOnlineDoc = !!tool.isOnlineDoc;
  const stop = e => e.stopPropagation();
  const openHref = e => {
    stop(e);
    if (href) openToolUrl(href);else onStartEdit(tool);
  };
  return /*#__PURE__*/React.createElement("div", {
    onClick: () => {
      if (!isEditing) onOpen(tool);
    },
    style: {
      background: isEditing ? "rgba(45,125,210,0.06)" : "var(--card)",
      border: isEditing ? "2px solid #2d7dd2" : "1px solid var(--border)",
      borderRadius: 12,
      padding: "14px 16px",
      cursor: isEditing ? "default" : "pointer",
      display: "flex",
      gap: 12,
      alignItems: "flex-start"
    },
    onMouseEnter: e => {
      if (!isEditing) e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)";
    },
    onMouseLeave: e => {
      e.currentTarget.style.boxShadow = "none";
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 28,
      lineHeight: 1,
      flexShrink: 0
    }
  }, tool.icon), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginBottom: 4,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    onClick: openHref,
    title: configurable ? href ? "点击打开文档" : "点击设置链接" : undefined,
    style: {
      fontSize: 14,
      fontWeight: 600,
      cursor: configurable && !isEditing ? "pointer" : undefined
    }
  }, displayName), /*#__PURE__*/React.createElement("span", {
    style: badge("#f3f4f6", "#666")
  }, tool.category), tool.runtime === "local" && /*#__PURE__*/React.createElement("span", {
    style: badge("#fce4ec", "#c62828")
  }, "\u672C\u673A\u5DE5\u5177"), tool.intranetOnly && /*#__PURE__*/React.createElement("span", {
    style: badge("#fff3e0", "#e65100")
  }, "\u4EC5\u5185\u7F51"), tool.downloadUrl && !isLocalOpsServer() && /*#__PURE__*/React.createElement("span", {
    style: badge("#e8eaf6", "#3949ab")
  }, "\u4E0B\u8F7D"), configurable && /*#__PURE__*/React.createElement("span", {
    style: badge("#fff3e0", "#e65100")
  }, "\u53EF\u7F16\u8F91"), href && inline && /*#__PURE__*/React.createElement("span", {
    style: badge("#e8f5e9", "#2e7d32")
  }, "\u5185\u5D4C"), href && !inline && !configurable && /*#__PURE__*/React.createElement("span", {
    style: badge("#dceeff", "#1a4e8a")
  }, "\u65B0\u7A97\u53E3"), configurable && !isEditing && /*#__PURE__*/React.createElement("span", {
    style: badge("#dceeff", "#1a4e8a")
  }, "\u65B0\u7A97\u53E3"), isEditing && /*#__PURE__*/React.createElement("span", {
    style: badge("#dceeff", "#1a4e8a")
  }, "\u7F16\u8F91\u4E2D")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--tm)",
      lineHeight: 1.5
    }
  }, tool.desc), configurable && isEditing && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    },
    onClick: stop
  }, /*#__PURE__*/React.createElement("label", {
    style: lblSm
  }, "\u663E\u793A\u540D\u79F0"), /*#__PURE__*/React.createElement("input", {
    value: editName,
    onChange: e => onEditNameChange(e.target.value),
    placeholder: "\u5982\uFF1A\u7F8E\u5DE5\u56FE\u9700\u3001\u8FD0\u8425\u8868\u683C\u2026",
    style: {
      ...inp,
      fontSize: 12,
      marginBottom: 8
    },
    autoFocus: true
  }), /*#__PURE__*/React.createElement("label", {
    style: lblSm
  }, "\u6587\u6863\u94FE\u63A5"), /*#__PURE__*/React.createElement("input", {
    value: editUrl,
    onChange: e => onEditUrlChange(e.target.value),
    placeholder: "\u7C98\u8D34\u91D1\u5C71 / \u9489\u9489 / \u98DE\u4E66\u94FE\u63A5\u2026",
    style: {
      ...inp,
      fontSize: 12,
      marginBottom: 8
    },
    onKeyDown: e => {
      if (e.key === "Enter") onEditSave();
      if (e.key === "Escape") onEditCancel();
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onEditSave,
    style: {
      background: "#2d7dd2",
      border: "none",
      borderRadius: 6,
      padding: "5px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "#fff"
    }
  }, "\u4FDD\u5B58"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onEditCancel,
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      padding: "5px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "var(--tm)"
    }
  }, "\u53D6\u6D88"), editUrl.trim() && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: e => {
      stop(e);
      onEditSaveAndOpen();
    },
    style: {
      marginLeft: "auto",
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      padding: "5px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "#2d7dd2"
    }
  }, "\u4FDD\u5B58\u5E76\u6253\u5F00 \u2197"))), configurable && !isEditing && /*#__PURE__*/React.createElement("div", {
    role: "button",
    tabIndex: 0,
    title: href ? "点击打开链接" : "点击设置链接",
    onClick: openHref,
    onKeyDown: e => {
      if (e.key === "Enter") openHref(e);
    },
    style: {
      fontSize: 10,
      color: "#2d7dd2",
      marginTop: 6,
      padding: "4px 8px",
      borderRadius: 6,
      background: "var(--bg)",
      border: "1px dashed var(--border)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      cursor: "text"
    }
  }, href || "尚未设置链接，点击此处添加")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      flexShrink: 0
    }
  }, configurable && !isEditing && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "\u7F16\u8F91\u540D\u79F0\u4E0E\u94FE\u63A5",
    onClick: e => {
      stop(e);
      onStartEdit(tool);
    },
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      width: 28,
      height: 28,
      fontSize: 13,
      cursor: "pointer",
      color: "#2d7dd2",
      fontFamily: "inherit",
      lineHeight: 1
    }
  }, "\u270E"), isOnlineDoc && onDuplicate && /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "\u590D\u5236\u4E00\u4EFD",
    onClick: e => {
      stop(e);
      onDuplicate(tool);
    },
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      width: 28,
      height: 28,
      fontSize: 12,
      cursor: "pointer",
      color: "#2e7d32",
      fontFamily: "inherit",
      lineHeight: 1
    }
  }, "\u29C9"), isOnlineDoc && onDelete && /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "\u5220\u9664\u6B64\u6587\u6863",
    onClick: e => {
      stop(e);
      onDelete(tool);
    },
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      width: 28,
      height: 28,
      fontSize: 12,
      cursor: "pointer",
      color: "#c62828",
      fontFamily: "inherit",
      lineHeight: 1
    }
  }, "\xD7")), !isEditing && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--tm)"
    }
  }, inline ? "→" : "↗")));
}
function ToolsPanel({
  active: tabActive = true
}) {
  const {
    items: onlineDocs,
    meta: docsMeta,
    loading: docsLoading,
    saving: docsSaving,
    error: docsError,
    persist: persistOnlineDocs,
    reload: reloadDocs
  } = useSharedList("tools-links", DEFAULT_ONLINE_DOCS, {
    active: tabActive
  });
  const [customUrls, setCustomUrls] = useState(loadCustomUrls);
  const [customNames, setCustomNames] = useState(loadCustomNames);
  const [inlineTool, setInlineTool] = useState(null);
  const [active, setActive] = useState(null);
  const [cat, setCat] = useState("全部");
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editUrl, setEditUrl] = useState("");
  const [editName, setEditName] = useState("");
  const [legacyMigrated, setLegacyMigrated] = useState(false);
  useEffect(() => {
    if (!tabActive || docsLoading || legacyMigrated) return;
    const legacy = readLegacyOnlineDocs();
    if (!legacy?.length) {
      setLegacyMigrated(true);
      return;
    }
    const cloudEmpty = onlineDocs.length <= 1 && !(onlineDocs[0]?.url && onlineDocs[0].url !== DEFAULT_ONLINE_DOC.url);
    if (cloudEmpty || docsMeta?._showingDemo) {
      persistOnlineDocs(legacy);
      clearLegacyOnlineDocsStorage();
    }
    setLegacyMigrated(true);
  }, [tabActive, docsLoading, legacyMigrated, onlineDocs, docsMeta, persistOnlineDocs]);
  const setOnlineDocs = updater => {
    const next = typeof updater === "function" ? updater(onlineDocs) : updater;
    persistOnlineDocs(next);
  };
  const onlineDocTools = onlineDocs.map(onlineDocToTool);
  const allTools = [...onlineDocTools, ...TOOL_CATALOG];
  const tool = allTools.find(t => t.id === active);
  const ActiveComponent = tool?.component;
  const editingTool = allTools.find(t => t.id === editingId);
  const persistEdit = () => {
    if (!editingId) return;
    const url = editUrl.trim();
    const name = editName.trim();
    if (editingTool?.isOnlineDoc) {
      setOnlineDocs(prev => prev.map(d => d.id === editingId ? {
        ...d,
        name: name || "在线文档",
        url
      } : d));
      setEditingId(null);
      setEditUrl("");
      setEditName("");
      return;
    }
    const catalog = TOOL_CATALOG.find(t => t.id === editingId);
    try {
      if (url) localStorage.setItem(URL_STORAGE_PREFIX + editingId, url);else localStorage.removeItem(URL_STORAGE_PREFIX + editingId);
      if (name && name !== catalog?.name) localStorage.setItem(NAME_STORAGE_PREFIX + editingId, name);else localStorage.removeItem(NAME_STORAGE_PREFIX + editingId);
    } catch {/* ignore */}
    setCustomUrls(prev => {
      const next = {
        ...prev
      };
      if (url) next[editingId] = url;else delete next[editingId];
      return next;
    });
    setCustomNames(prev => {
      const next = {
        ...prev
      };
      if (name && name !== catalog?.name) next[editingId] = name;else delete next[editingId];
      return next;
    });
  };
  const startEdit = t => {
    setEditingId(t.id);
    if (t.isOnlineDoc) {
      setEditUrl(t.defaultUrl || "");
      setEditName(t.name || "在线文档");
      return;
    }
    setEditUrl(customUrls[t.id] || t.defaultUrl || "");
    setEditName(customNames[t.id] || t.name);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditUrl("");
    setEditName("");
  };
  const saveEdit = () => {
    persistEdit();
    setEditingId(null);
    setEditUrl("");
    setEditName("");
  };
  const saveEditAndOpen = () => {
    const url = editUrl.trim();
    if (!url || !editingId) return;
    persistEdit();
    setEditingId(null);
    setEditUrl("");
    setEditName("");
    window.open(resolveToolUrl(url), "_blank", "noopener,noreferrer");
  };
  const handleToolClick = t => {
    if (editingId) return;
    if (t.downloadUrl && !isLocalOpsServer()) {
      downloadToolPackage(t);
      return;
    }
    const url = toolUrl(t, customUrls);
    if (t.target === "inline" && url) {
      setInlineTool({
        ...t,
        _resolvedUrl: resolveToolUrl(url)
      });
      return;
    }
    if (url) {
      openToolUrl(url);
      return;
    }
    if (t.configurableUrl) {
      startEdit(t);
      return;
    }
    setActive(t.id);
  };
  const duplicateOnlineDoc = tool => {
    const source = onlineDocs.find(d => d.id === tool.id);
    if (!source) return;
    const copy = {
      ...source,
      id: "online-doc-" + Date.now(),
      name: (source.name || "在线文档") + " 副本"
    };
    setOnlineDocs(prev => [...prev, copy]);
  };
  const addOnlineDoc = () => {
    const doc = {
      id: "online-doc-" + Date.now(),
      name: "新在线文档",
      url: "",
      desc: DEFAULT_ONLINE_DOC.desc,
      icon: "📄"
    };
    setOnlineDocs(prev => [...prev, doc]);
    startEdit(onlineDocToTool(doc));
  };
  const deleteOnlineDoc = tool => {
    if (onlineDocs.length <= 1) {
      window.alert("至少保留一个在线文档");
      return;
    }
    if (!confirmDeleteWarning(tool.name, "在线文档")) return;
    if (editingId === tool.id) cancelEdit();
    setOnlineDocs(prev => prev.filter(d => d.id !== tool.id));
  };
  let list = allTools;
  if (cat !== "全部") list = list.filter(t => t.category === cat);
  if (q.trim()) {
    const s = q.trim().toLowerCase();
    list = list.filter(t => {
      const dn = toolDisplayName(t, customNames).toLowerCase();
      return dn.includes(s) || t.name.toLowerCase().includes(s) || t.desc.toLowerCase().includes(s);
    });
  }
  useCloudSyncPage(tabActive, {
    label: "工具",
    save: async () => persistOnlineDocs(onlineDocs),
    reload: reloadDocs,
    meta: docsMeta,
    loading: docsLoading,
    saving: docsSaving,
    error: docsError,
    isDirty: editingId !== null,
    dirtyHint: "在线文档编辑未保存"
  });
  if (inlineTool) {
    const url = resolveToolUrl(inlineTool._resolvedUrl || toolUrl(inlineTool, customUrls));
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative",
        height: "calc(100vh - 120px)",
        display: "flex",
        flexDirection: "column"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 8,
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setInlineTool(null),
      style: {
        background: "transparent",
        border: "none",
        color: "#2d7dd2",
        fontSize: 13,
        cursor: "pointer",
        fontFamily: "inherit",
        padding: 0
      }
    }, "\u2190 \u8FD4\u56DE\u5DE5\u5177\u5217\u8868"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14,
        fontWeight: 600
      }
    }, inlineTool.icon, " ", inlineTool.name), inlineTool.intranetOnly && /*#__PURE__*/React.createElement("span", {
      style: badge("#fff3e0", "#e65100")
    }, "\u4EC5\u5185\u7F51")), inlineTool.intranetOnly && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "#e65100",
        marginBottom: 8,
        flexShrink: 0
      }
    }, "\u6B64\u5DE5\u5177\u4EC5\u5728\u516C\u53F8\u5185\u7F51\u53EF\u7528\uFF0C\u5916\u7F51\u6216 GitHub Pages \u65E0\u6CD5\u8BBF\u95EE\u722C\u866B\u670D\u52A1\u3002"), /*#__PURE__*/React.createElement("iframe", {
      src: url,
      title: inlineTool.name,
      style: {
        flex: 1,
        width: "100%",
        minHeight: 0,
        border: "none",
        borderRadius: 8,
        background: "#fff"
      }
    }));
  }
  if (tool && ActiveComponent) {
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setActive(null),
      style: {
        background: "transparent",
        border: "none",
        color: "#2d7dd2",
        fontSize: 13,
        cursor: "pointer",
        fontFamily: "inherit",
        marginBottom: "1rem",
        padding: 0
      }
    }, "\u2190 \u8FD4\u56DE\u5DE5\u5177\u5217\u8868"), /*#__PURE__*/React.createElement("div", {
      style: {
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "1.25rem 1.5rem"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: "1rem",
        paddingBottom: 12,
        borderBottom: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 26
      }
    }, tool.icon), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 600
      }
    }, tool.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "var(--tm)",
        marginTop: 2
      }
    }, tool.desc))), /*#__PURE__*/React.createElement(ActiveComponent, null)));
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: "1rem",
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "\u641C\u7D22\u5DE5\u5177\u2026",
    style: {
      ...inpSm,
      flex: 1,
      minWidth: 140,
      maxWidth: 220
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: addOnlineDoc,
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 20,
      padding: "4px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "#2d7dd2"
    }
  }, "+ \u6DFB\u52A0\u5728\u7EBF\u6587\u6863"), TOOL_CATEGORIES.map(c => /*#__PURE__*/React.createElement("button", {
    key: c,
    type: "button",
    onClick: () => setCat(c),
    style: {
      background: cat === c ? "#2d7dd2" : "var(--card)",
      color: cat === c ? "#fff" : "var(--tm)",
      border: `1px solid ${cat === c ? "#2d7dd2" : "var(--border)"}`,
      borderRadius: 20,
      padding: "4px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, c))), list.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
      gap: 10
    }
  }, list.map(t => /*#__PURE__*/React.createElement(ToolCard, {
    key: t.id,
    tool: t,
    displayName: toolDisplayName(t, customNames),
    resolvedUrl: toolUrl(t, customUrls),
    isEditing: editingId === t.id,
    editName: editName,
    editUrl: editUrl,
    onOpen: handleToolClick,
    onStartEdit: startEdit,
    onEditNameChange: setEditName,
    onEditUrlChange: setEditUrl,
    onEditSave: saveEdit,
    onEditSaveAndOpen: saveEditAndOpen,
    onEditCancel: cancelEdit,
    onDuplicate: duplicateOnlineDoc,
    onDelete: deleteOnlineDoc
  }))) : /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "2.5rem 1rem",
      color: "var(--tm)",
      fontSize: 13
    }
  }, "\u6CA1\u6709\u5339\u914D\u7684\u5DE5\u5177"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "1.5rem",
      padding: "10px 14px",
      borderRadius: 10,
      background: "var(--bg)",
      border: "1px dashed var(--border)",
      fontSize: 11,
      color: "var(--tm)",
      lineHeight: 1.6
    }
  }, "\u300C\u5728\u7EBF\u6587\u6863\u300D\u53EF\u6DFB\u52A0\u591A\u4E2A\uFF1A\u70B9\u300C+ \u6DFB\u52A0\u5728\u7EBF\u6587\u6863\u300D\u6216\u53F3\u4FA7 \u29C9 \u590D\u5236\uFF1B\u270E \u6539\u540D\u79F0/\u94FE\u63A5\uFF0C\xD7 \u5220\u9664\u3002"));
}

// Shared helpers (TODAY, fmtD, Avatar, …) come from LogisticsModule.browser.jsx loaded first.

// ─── AI AGENTS MODULE ──────────────────────────────────────────────────
// GPTs / Gems 链接列表 → GitHub Gist 全公司共享

const AGENTS_LEGACY_KEY = "ops-center-ai-agents";
const AGENT_CATEGORIES = ["全部", "GPTs", "Gems", "其他"];
const CATEGORY_ICONS = {
  GPTs: "🤖",
  Gems: "✨",
  其他: "🧠"
};
const detectCategory = url => {
  const u = (url || "").toLowerCase();
  if (u.includes("chatgpt.com/g/") || u.includes("chat.openai.com/g/")) return "GPTs";
  if (u.includes("gemini.google.com/gems") || u.includes("gemini.google.com/app") && u.includes("gem")) return "Gems";
  return "其他";
};
function readLegacyAgents() {
  try {
    const raw = localStorage.getItem(AGENTS_LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {/* ignore */}
  return null;
}
function clearLegacyAgentsStorage() {
  try {
    localStorage.removeItem(AGENTS_LEGACY_KEY);
  } catch {/* ignore */}
}
const resolveAgentUrl = url => {
  if (!url) return "";
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
};
const openAgentUrl = url => {
  const target = resolveAgentUrl(url);
  if (!target) return false;
  window.open(target, "_blank", "noopener,noreferrer");
  return true;
};
function AgentCard({
  agent,
  isEditing,
  editName,
  editUrl,
  editDesc,
  onOpen,
  onStartEdit,
  onEditNameChange,
  onEditUrlChange,
  onEditDescChange,
  onEditSave,
  onEditSaveAndOpen,
  onEditCancel,
  onDuplicate,
  onDelete
}) {
  const stop = e => e.stopPropagation();
  const openHref = e => {
    stop(e);
    if (agent.url) openAgentUrl(agent.url);else onStartEdit(agent);
  };
  return /*#__PURE__*/React.createElement("div", {
    onClick: () => {
      if (!isEditing) onOpen(agent);
    },
    style: {
      background: isEditing ? "rgba(45,125,210,0.06)" : "var(--card)",
      border: isEditing ? "2px solid #2d7dd2" : "1px solid var(--border)",
      borderRadius: 12,
      padding: "14px 16px",
      cursor: isEditing ? "default" : "pointer",
      display: "flex",
      gap: 12,
      alignItems: "flex-start"
    },
    onMouseEnter: e => {
      if (!isEditing) e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)";
    },
    onMouseLeave: e => {
      e.currentTarget.style.boxShadow = "none";
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 28,
      lineHeight: 1,
      flexShrink: 0
    }
  }, agent.icon || CATEGORY_ICONS[agent.category] || "🧠"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginBottom: 4,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    onClick: openHref,
    title: agent.url ? "点击打开" : "点击设置链接",
    style: {
      fontSize: 14,
      fontWeight: 600,
      cursor: !isEditing ? "pointer" : undefined
    }
  }, agent.name), /*#__PURE__*/React.createElement("span", {
    style: badge("#f3f4f6", "#666")
  }, agent.category), /*#__PURE__*/React.createElement("span", {
    style: badge("#dceeff", "#1a4e8a")
  }, "\u65B0\u7A97\u53E3"), isEditing && /*#__PURE__*/React.createElement("span", {
    style: badge("#dceeff", "#1a4e8a")
  }, "\u7F16\u8F91\u4E2D")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--tm)",
      lineHeight: 1.5
    }
  }, agent.desc || "ChatGPT GPTs 或 Google Gems 链接"), isEditing && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    },
    onClick: stop
  }, /*#__PURE__*/React.createElement("label", {
    style: lblSm
  }, "\u540D\u79F0"), /*#__PURE__*/React.createElement("input", {
    value: editName,
    onChange: e => onEditNameChange(e.target.value),
    placeholder: "\u5982\uFF1AListing \u4F18\u5316\u52A9\u624B\u2026",
    style: {
      ...inp,
      fontSize: 12,
      marginBottom: 8
    },
    autoFocus: true
  }), /*#__PURE__*/React.createElement("label", {
    style: lblSm
  }, "\u94FE\u63A5"), /*#__PURE__*/React.createElement("input", {
    value: editUrl,
    onChange: e => onEditUrlChange(e.target.value),
    placeholder: "\u7C98\u8D34 GPTs / Gems \u5206\u4EAB\u94FE\u63A5\u2026",
    style: {
      ...inp,
      fontSize: 12,
      marginBottom: 8
    },
    onKeyDown: e => {
      if (e.key === "Enter") onEditSave();
      if (e.key === "Escape") onEditCancel();
    }
  }), /*#__PURE__*/React.createElement("label", {
    style: lblSm
  }, "\u8BF4\u660E\uFF08\u53EF\u9009\uFF09"), /*#__PURE__*/React.createElement("input", {
    value: editDesc,
    onChange: e => onEditDescChange(e.target.value),
    placeholder: "\u7B80\u77ED\u63CF\u8FF0\u7528\u9014\u2026",
    style: {
      ...inp,
      fontSize: 12,
      marginBottom: 8
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onEditSave,
    style: {
      background: "#2d7dd2",
      border: "none",
      borderRadius: 6,
      padding: "5px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "#fff"
    }
  }, "\u4FDD\u5B58"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onEditCancel,
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      padding: "5px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "var(--tm)"
    }
  }, "\u53D6\u6D88"), editUrl.trim() && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: e => {
      stop(e);
      onEditSaveAndOpen();
    },
    style: {
      marginLeft: "auto",
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      padding: "5px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "#2d7dd2"
    }
  }, "\u4FDD\u5B58\u5E76\u6253\u5F00 \u2197"))), !isEditing && /*#__PURE__*/React.createElement("div", {
    role: "button",
    tabIndex: 0,
    title: agent.url ? "点击打开链接" : "点击设置链接",
    onClick: openHref,
    onKeyDown: e => {
      if (e.key === "Enter") openHref(e);
    },
    style: {
      fontSize: 10,
      color: "#2d7dd2",
      marginTop: 6,
      padding: "4px 8px",
      borderRadius: 6,
      background: "var(--bg)",
      border: "1px dashed var(--border)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      cursor: "pointer"
    }
  }, agent.url || "尚未设置链接，点击此处添加")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      flexShrink: 0
    }
  }, !isEditing && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "\u7F16\u8F91",
    onClick: e => {
      stop(e);
      onStartEdit(agent);
    },
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      width: 28,
      height: 28,
      fontSize: 13,
      cursor: "pointer",
      color: "#2d7dd2",
      fontFamily: "inherit",
      lineHeight: 1
    }
  }, "\u270E"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "\u590D\u5236\u4E00\u4EFD",
    onClick: e => {
      stop(e);
      onDuplicate(agent);
    },
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      width: 28,
      height: 28,
      fontSize: 12,
      cursor: "pointer",
      color: "#2e7d32",
      fontFamily: "inherit",
      lineHeight: 1
    }
  }, "\u29C9"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "\u5220\u9664",
    onClick: e => {
      stop(e);
      onDelete(agent);
    },
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      width: 28,
      height: 28,
      fontSize: 12,
      cursor: "pointer",
      color: "#c62828",
      fontFamily: "inherit",
      lineHeight: 1
    }
  }, "\xD7"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--tm)"
    }
  }, "\u2197"))));
}
function AgentsPanel({
  active: tabActive = true
}) {
  const {
    items: agents,
    meta,
    loading,
    saving,
    error,
    persist: persistAgents,
    reload
  } = useSharedList("agents", [], {
    active: tabActive
  });
  const [cat, setCat] = useState("全部");
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [legacyMigrated, setLegacyMigrated] = useState(false);
  useEffect(() => {
    if (!tabActive || loading || legacyMigrated) return;
    const legacy = readLegacyAgents();
    if (!legacy?.length) {
      setLegacyMigrated(true);
      return;
    }
    if (!agents.length) {
      persistAgents(legacy);
      clearLegacyAgentsStorage();
    }
    setLegacyMigrated(true);
  }, [tabActive, loading, legacyMigrated, agents.length, persistAgents]);
  const setAgents = updater => {
    const next = typeof updater === "function" ? updater(agents) : updater;
    persistAgents(next);
  };
  const persistEdit = () => {
    if (!editingId) return;
    const url = editUrl.trim();
    const name = editName.trim() || "未命名智能体";
    const desc = editDesc.trim();
    const category = detectCategory(url);
    setAgents(prev => prev.map(a => a.id === editingId ? {
      ...a,
      name,
      url,
      desc,
      category,
      icon: CATEGORY_ICONS[category] || "🧠"
    } : a));
  };
  const startEdit = agent => {
    setEditingId(agent.id);
    setEditName(agent.name || "");
    setEditUrl(agent.url || "");
    setEditDesc(agent.desc || "");
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditUrl("");
    setEditDesc("");
  };
  const saveEdit = () => {
    persistEdit();
    cancelEdit();
  };
  const saveEditAndOpen = () => {
    const url = editUrl.trim();
    if (!url || !editingId) return;
    persistEdit();
    cancelEdit();
    openAgentUrl(url);
  };
  const handleAgentClick = agent => {
    if (editingId) return;
    if (agent.url) {
      openAgentUrl(agent.url);
      return;
    }
    startEdit(agent);
  };
  const addAgent = () => {
    const agent = {
      id: "agent-" + Date.now(),
      name: "新智能体",
      url: "",
      desc: "",
      category: "其他",
      icon: "🧠"
    };
    setAgents(prev => [...prev, agent]);
    startEdit(agent);
  };
  const duplicateAgent = agent => {
    const copy = {
      ...agent,
      id: "agent-" + Date.now(),
      name: (agent.name || "智能体") + " 副本"
    };
    setAgents(prev => [...prev, copy]);
  };
  const deleteAgent = agent => {
    if (!confirmDeleteWarning(agent.name, "智能体")) return;
    if (editingId === agent.id) cancelEdit();
    setAgents(prev => prev.filter(a => a.id !== agent.id));
  };
  let list = agents;
  if (cat !== "全部") list = list.filter(a => a.category === cat);
  if (q.trim()) {
    const s = q.trim().toLowerCase();
    list = list.filter(a => (a.name || "").toLowerCase().includes(s) || (a.desc || "").toLowerCase().includes(s) || (a.url || "").toLowerCase().includes(s));
  }
  useCloudSyncPage(tabActive, {
    label: "智能体",
    save: async () => persistAgents(agents),
    reload,
    meta,
    loading,
    saving,
    error,
    isDirty: editingId !== null,
    dirtyHint: "智能体编辑未保存"
  });
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: "1rem",
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "\u641C\u7D22\u667A\u80FD\u4F53\u2026",
    style: {
      ...inpSm,
      flex: 1,
      minWidth: 140,
      maxWidth: 220
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: addAgent,
    style: {
      background: "#2d7dd2",
      color: "#fff",
      border: "none",
      borderRadius: 20,
      padding: "4px 14px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      fontWeight: 600
    }
  }, "+ \u6DFB\u52A0\u667A\u80FD\u4F53"), AGENT_CATEGORIES.map(c => /*#__PURE__*/React.createElement("button", {
    key: c,
    type: "button",
    onClick: () => setCat(c),
    style: {
      background: cat === c ? "#2d7dd2" : "var(--card)",
      color: cat === c ? "#fff" : "var(--tm)",
      border: `1px solid ${cat === c ? "#2d7dd2" : "var(--border)"}`,
      borderRadius: 20,
      padding: "4px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, c))), list.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
      gap: 10
    }
  }, list.map(a => /*#__PURE__*/React.createElement(AgentCard, {
    key: a.id,
    agent: a,
    isEditing: editingId === a.id,
    editName: editName,
    editUrl: editUrl,
    editDesc: editDesc,
    onOpen: handleAgentClick,
    onStartEdit: startEdit,
    onEditNameChange: setEditName,
    onEditUrlChange: setEditUrl,
    onEditDescChange: setEditDesc,
    onEditSave: saveEdit,
    onEditSaveAndOpen: saveEditAndOpen,
    onEditCancel: cancelEdit,
    onDuplicate: duplicateAgent,
    onDelete: deleteAgent
  }))) : /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "2.5rem 1rem",
      color: "var(--tm)",
      fontSize: 13
    }
  }, agents.length ? "没有匹配的智能体" : "还没有智能体，点击「+ 添加智能体」开始添加 GPTs 或 Gems 链接"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "1.5rem",
      padding: "10px 14px",
      borderRadius: 10,
      background: "var(--bg)",
      border: "1px dashed var(--border)",
      fontSize: 11,
      color: "var(--tm)",
      lineHeight: 1.6
    }
  }, "\u7C98\u8D34 ChatGPT GPTs \u6216 Google Gems \u5206\u4EAB\u94FE\u63A5\uFF0C\u70B9\u51FB\u5361\u7247\u5373\u53EF\u5728\u65B0\u7A97\u53E3\u6253\u5F00\uFF1B\u6DFB\u52A0\u540E\u5168\u516C\u53F8\u7535\u8111\u81EA\u52A8\u540C\u6B65\u3002", /*#__PURE__*/React.createElement("br", null), "\u94FE\u63A5\u4F1A\u81EA\u52A8\u8BC6\u522B\u7C7B\u578B\uFF08GPTs / Gems\uFF09\uFF1B\u270E \u7F16\u8F91\u540D\u79F0\u4E0E\u94FE\u63A5\uFF0C\u29C9 \u590D\u5236\uFF0C\xD7 \u5220\u9664\u3002"));
}

// Shared helpers (TODAY, fmtD, Avatar, …) come from LogisticsModule.browser.jsx loaded first.

// ─── KNOWLEDGE BASE MODULE ─────────────────────────────────────────────
// 内嵌亚马逊卖家知识库（GitHub Pages）与关键词库

const KNOWLEDGE_BASE_URL = "https://xiaopong190-oss.github.io/knowledge/";
const KEYWORD_LIBRARY_URL = "https://rootline-keyword-dashboard.xiaopong190-asin-radar.workers.dev/";
function EmbedPanel({
  title,
  subtitle,
  url,
  iframeTitle
}) {
  const openExternal = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      height: "calc(100vh - 120px)",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
      flexShrink: 0,
      flexWrap: "wrap",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 600
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginTop: 2
    }
  }, subtitle)), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: openExternal,
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "6px 12px",
      fontSize: 12,
      cursor: "pointer",
      color: "#2d7dd2",
      fontFamily: "inherit",
      fontWeight: 500
    }
  }, "\u2197 \u65B0\u7A97\u53E3\u6253\u5F00")), /*#__PURE__*/React.createElement("iframe", {
    src: url,
    title: iframeTitle,
    style: {
      flex: 1,
      width: "100%",
      minHeight: 0,
      border: "1px solid var(--border)",
      borderRadius: 10,
      background: "#fff"
    }
  }));
}
function KnowledgePanel({
  active = true
}) {
  return /*#__PURE__*/React.createElement(EmbedPanel, {
    title: "\uD83D\uDCDA \u4E9A\u9A6C\u900A\u5356\u5BB6\u77E5\u8BC6\u5E93",
    subtitle: "Amazon Seller OS \xB7 \u8FD0\u8425\u65B9\u6CD5\u8BBA\u4E0E\u5DE5\u5177\u5408\u96C6\uFF0C\u6301\u7EED\u66F4\u65B0",
    url: KNOWLEDGE_BASE_URL,
    iframeTitle: "\u4E9A\u9A6C\u900A\u5356\u5BB6\u77E5\u8BC6\u5E93"
  });
}
function KeywordPanel({
  active = true
}) {
  return /*#__PURE__*/React.createElement(EmbedPanel, {
    title: "\uD83D\uDD11 \u5173\u952E\u8BCD\u5E93",
    subtitle: "Rootline Keyword Dashboard \xB7 ASIN \u5173\u952E\u8BCD\u5206\u6790\u4E0E\u8BCD\u5E93",
    url: KEYWORD_LIBRARY_URL,
    iframeTitle: "\u5173\u952E\u8BCD\u5E93"
  });
}
const FX_CACHE_KEY = "ops-center-fx-rates";
const FX_SWAP_KEY = "ops-center-fx-swap";
const NEWS_CACHE_KEY = "ops-center-amazon-news";
const FX_TARGETS = [{
  code: "USD",
  label: "美元",
  symbol: "$",
  decimals: 4
}, {
  code: "GBP",
  label: "英镑",
  symbol: "£",
  decimals: 4
}, {
  code: "EUR",
  label: "欧元",
  symbol: "€",
  decimals: 4
}, {
  code: "JPY",
  label: "日元",
  symbol: "¥",
  decimals: 2,
  per100: true
}];
const WORLD_CLOCKS = [{
  id: "us",
  label: "美国",
  sub: "纽约",
  tz: "America/New_York",
  flag: "🇺🇸"
}, {
  id: "jp",
  label: "日本",
  sub: "东京",
  tz: "Asia/Tokyo",
  flag: "🇯🇵"
}, {
  id: "uk",
  label: "英国",
  sub: "伦敦",
  tz: "Europe/London",
  flag: "🇬🇧"
}, {
  id: "de",
  label: "德国",
  sub: "柏林",
  tz: "Europe/Berlin",
  flag: "🇩🇪"
}, {
  id: "cn",
  label: "北京",
  sub: "中国",
  tz: "Asia/Shanghai",
  flag: "🇨🇳"
}];
const WORLD_CLOCK_ICON = {
  us: "ops-icon-blue",
  jp: "ops-icon-amber",
  uk: "ops-icon-purple",
  de: "ops-icon-green",
  cn: "ops-icon-blue"
};
const BEIJING_TZ = "Asia/Shanghai";
function beijingTodayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BEIJING_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const y = parts.find(p => p.type === "year")?.value || "0000";
  const m = parts.find(p => p.type === "month")?.value || "01";
  const d = parts.find(p => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}
function todayKey() {
  return beijingTodayKey();
}
function formatFxRate(value, decimals) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(decimals);
}
function loadFxCache() {
  try {
    const raw = localStorage.getItem(FX_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function saveFxCache(data) {
  try {
    localStorage.setItem(FX_CACHE_KEY, JSON.stringify(data));
  } catch {/* ignore */}
}
const FX_CODES = FX_TARGETS.map(t => t.code);
function pickFxRates(allRates) {
  const rates = {};
  for (const code of FX_CODES) {
    const v = allRates?.[code];
    if (typeof v === "number" && v > 0) rates[code] = v;
  }
  return Object.keys(rates).length === FX_CODES.length ? rates : null;
}
async function fetchJson(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
async function fetchExchangeRatesFromApi() {
  const frankfurter = "https://api.frankfurter.app/latest?from=CNY&to=" + FX_CODES.join(",");
  const erApi = "https://open.er-api.com/v6/latest/CNY";
  const host = "https://api.exchangerate.host/latest?base=CNY&symbols=" + FX_CODES.join(",");
  const invert = "https://api.frankfurter.app/latest?from=USD&to=CNY," + FX_CODES.filter(c => c !== "USD").join(",");
  const bundled = new URL("fx-rates.json", window.location.href).href;
  const sources = [async () => {
    const data = await fetchJson(frankfurter);
    const rates = pickFxRates(data.rates);
    if (!rates) throw new Error("incomplete");
    return {
      asOf: data.date || todayKey(),
      rates,
      source: "frankfurter"
    };
  }, async () => {
    const data = await fetchJson(erApi);
    if (data.result !== "success") throw new Error("er-api");
    const rates = pickFxRates(data.rates);
    if (!rates) throw new Error("incomplete");
    const asOf = data.time_last_update_utc?.slice(5, 16) || todayKey();
    return {
      asOf,
      rates,
      source: "er-api"
    };
  }, async () => {
    const data = await fetchJson(host);
    if (!data.success) throw new Error("exchangerate.host");
    const rates = pickFxRates(data.rates);
    if (!rates) throw new Error("incomplete");
    return {
      asOf: data.date || todayKey(),
      rates,
      source: "exchangerate.host"
    };
  }, async () => {
    const data = await fetchJson(invert);
    const cnyPerUsd = data.rates?.CNY;
    if (!cnyPerUsd || cnyPerUsd <= 0) throw new Error("invert");
    const rates = {
      USD: 1 / cnyPerUsd
    };
    for (const code of FX_CODES) {
      if (code === "USD") continue;
      const perUsd = data.rates?.[code];
      if (!perUsd || perUsd <= 0) throw new Error("invert");
      rates[code] = perUsd / cnyPerUsd;
    }
    return {
      asOf: data.date || todayKey(),
      rates,
      source: "frankfurter-invert"
    };
  }, async () => {
    const data = await fetchJson(bundled);
    const rates = pickFxRates(data.rates);
    if (!rates) throw new Error("bundled");
    return {
      asOf: data.asOf || data.date || todayKey(),
      rates,
      source: "bundled"
    };
  }];
  let lastErr;
  for (const load of sources) {
    try {
      return await load();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("all sources failed");
}
function useExchangeRates() {
  const [state, setState] = useState(() => {
    const cached = loadFxCache();
    if (cached?.rates) {
      const fresh = cached.date === todayKey();
      return {
        status: fresh ? "ok" : "stale",
        date: cached.date || "",
        asOf: cached.asOf || cached.date || "",
        rates: cached.rates,
        error: ""
      };
    }
    return {
      status: "loading",
      date: "",
      asOf: "",
      rates: null,
      error: ""
    };
  });
  useEffect(() => {
    const cached = loadFxCache();
    if (cached?.date === todayKey() && cached.rates) {
      setState({
        status: "ok",
        date: cached.date,
        asOf: cached.asOf,
        rates: cached.rates,
        error: ""
      });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const live = await fetchExchangeRatesFromApi();
        const payload = {
          date: todayKey(),
          asOf: live.asOf,
          rates: live.rates,
          source: live.source
        };
        saveFxCache(payload);
        if (!cancelled) {
          setState({
            status: "ok",
            date: payload.date,
            asOf: payload.asOf,
            rates: payload.rates,
            error: ""
          });
        }
      } catch (e) {
        if (cancelled) return;
        if (cached?.rates) {
          setState({
            status: "stale",
            date: cached.date || "",
            asOf: cached.asOf || cached.date || "",
            rates: cached.rates,
            error: e.message || "获取失败"
          });
          return;
        }
        setState(s => ({
          ...s,
          status: "error",
          error: e.message || "获取失败"
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
function loadNewsCache() {
  try {
    const raw = localStorage.getItem(NEWS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function saveNewsCache(data) {
  try {
    localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(data));
  } catch {/* ignore */}
}
async function fetchAmazonNewsPayload() {
  const bundled = new URL("amazon-news.json", window.location.href).href;
  const sources = [async () => {
    const data = await fetchJson("/api/amazon-news");
    if (data?.ok && data.news?.items?.length) return data.news;
    throw new Error("api empty");
  }, async () => {
    const data = await fetchJson(bundled);
    if (data?.items?.length) return data;
    throw new Error("bundled empty");
  }];
  let lastErr;
  for (const load of sources) {
    try {
      return await load();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("all news sources failed");
}
function useAmazonNews() {
  const [state, setState] = useState(() => {
    const cached = loadNewsCache();
    if (cached?.items?.length) {
      return {
        status: "stale",
        items: cached.items,
        sourceLabel: cached.sourceLabel || "",
        updatedAt: cached.updatedAt || "",
        error: ""
      };
    }
    return {
      status: "loading",
      items: [],
      sourceLabel: "",
      updatedAt: "",
      error: ""
    };
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const news = await fetchAmazonNewsPayload();
        saveNewsCache(news);
        if (!cancelled) {
          setState({
            status: "ok",
            items: news.items,
            sourceLabel: news.sourceLabel || "Amazon 官方新闻",
            updatedAt: news.updatedAt || "",
            error: ""
          });
        }
      } catch (e) {
        if (cancelled) return;
        const cached = loadNewsCache();
        if (cached?.items?.length) {
          setState({
            status: "stale",
            items: cached.items,
            sourceLabel: cached.sourceLabel || "",
            updatedAt: cached.updatedAt || "",
            error: e.message || "获取失败"
          });
          return;
        }
        setState(s => ({
          ...s,
          status: "error",
          error: e.message || "获取失败"
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
function AmazonNewsCard({
  news
}) {
  const formatUpdated = iso => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(d);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: "1.25rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-section-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-section-title"
  }, "\uD83D\uDCF0 \u4E9A\u9A6C\u900A\u52A8\u6001"), /*#__PURE__*/React.createElement("div", {
    className: "ops-section-meta"
  }, news.status === "ok" ? news.sourceLabel : news.status === "stale" ? "缓存 · " + news.sourceLabel : news.status === "loading" ? "加载中…" : "暂不可用", news.updatedAt && news.status !== "loading" && ` · ${formatUpdated(news.updatedAt)}`)), news.status === "error" && /*#__PURE__*/React.createElement("div", {
    className: "ops-card ops-card-padded",
    style: {
      fontSize: 12,
      color: "var(--tm)"
    }
  }, "\u65B0\u95FB\u83B7\u53D6\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u5237\u65B0\u3002"), news.status !== "error" && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, (news.status === "loading" ? [{
    title: "…"
  }, {
    title: "…"
  }, {
    title: "…"
  }] : news.items.slice(0, 3)).map((item, i) => /*#__PURE__*/React.createElement("a", {
    key: item.link || i,
    href: item.link || "#",
    target: "_blank",
    rel: "noopener noreferrer",
    onClick: e => {
      if (!item.link) e.preventDefault();
    },
    className: "ops-card ops-card-padded ops-card-hover",
    style: {
      display: "block",
      textDecoration: "none",
      color: "inherit",
      opacity: news.status === "loading" ? 0.5 : 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: `ops-metric-icon-box ops-icon-amber`,
    style: {
      width: 36,
      height: 36,
      fontSize: 16
    }
  }, "\uD83D\uDCF0"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      lineHeight: 1.45,
      color: "var(--text)"
    }
  }, item.title), item.summary && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginTop: 4,
      lineHeight: 1.5,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, item.summary)), /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      textAlign: "right"
    }
  }, item.date && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginBottom: 4
    }
  }, item.date), item.category && /*#__PURE__*/React.createElement("span", {
    className: "ops-badge ops-badge-info"
  }, item.category), item.link && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--primary)",
      marginTop: 4,
      fontWeight: 600
    }
  }, "\u2197")))))), /*#__PURE__*/React.createElement("div", {
    className: "ops-section-meta",
    style: {
      marginTop: 10
    }
  }, "\u81EA\u52A8\u540C\u6B65 Amazon \u5B98\u65B9 RSS\uFF0C\u6BCF 4 \u5C0F\u65F6\u66F4\u65B0\uFF0C\u65E0\u9700\u4EBA\u5DE5\u7EF4\u62A4\u3002"));
}
function fxCellLines(t, raw, foreignBase) {
  if (raw == null) return {
    primary: "—",
    sub: null
  };
  if (!foreignBase) {
    const mult = t.per100 ? 100 : 1;
    const val = raw * mult;
    const primary = t.per100 ? `100 CNY = ${formatFxRate(val, t.decimals)} JPY` : `1 CNY = ${t.symbol}${formatFxRate(val, t.decimals)}`;
    const sub = t.per100 ? `100 JPY ≈ ¥${formatFxRate(100 / raw, 2)} CNY` : `1 ${t.symbol} ≈ ¥${formatFxRate(1 / raw, 2)} CNY`;
    return {
      primary,
      sub
    };
  }
  const mult = t.per100 ? 100 : 1;
  const val = raw * mult;
  const primary = t.per100 ? `100 JPY = ¥${formatFxRate(100 / raw, 2)} CNY` : `1 ${t.symbol} = ¥${formatFxRate(1 / raw, 2)} CNY`;
  const sub = t.per100 ? `100 CNY ≈ ${formatFxRate(val, t.decimals)} JPY` : `1 CNY ≈ ${t.symbol}${formatFxRate(val, t.decimals)}`;
  return {
    primary,
    sub
  };
}
function ExchangeRatesCard({
  fx
}) {
  const FX_ICON = {
    USD: "ops-icon-green",
    GBP: "ops-icon-purple",
    EUR: "ops-icon-blue",
    JPY: "ops-icon-amber"
  };
  const [foreignBase, setForeignBase] = useState(() => {
    try {
      return localStorage.getItem(FX_SWAP_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleSwap = () => {
    setForeignBase(v => {
      const next = !v;
      try {
        localStorage.setItem(FX_SWAP_KEY, next ? "1" : "0");
      } catch {/* ignore */}
      return next;
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "ops-card ops-card-padded ops-card-elevated",
    style: {
      marginBottom: "1.25rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-section-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-section-title-row"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "ops-fx-swap-btn" + (foreignBase ? " active" : ""),
    onClick: toggleSwap,
    title: foreignBase ? "切换为：人民币 → 外币" : "切换为：外币 → 人民币",
    "aria-label": "\u8C03\u6362\u6C47\u7387\u65B9\u5411"
  }, "\u21C4"), /*#__PURE__*/React.createElement("div", {
    className: "ops-section-title"
  }, "\uD83D\uDCB1 \u4ECA\u65E5\u6C47\u7387", foreignBase ? "（外币→人民币）" : "（人民币→外币）")), /*#__PURE__*/React.createElement("div", {
    className: "ops-section-meta"
  }, fx.status === "ok" ? `参考 ${fx.asOf}` : fx.status === "stale" ? `缓存 ${fx.asOf}` : fx.status === "loading" ? "加载中…" : "暂不可用")), fx.status === "stale" && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginBottom: 8
    }
  }, "\u7F51\u7EDC\u66F4\u65B0\u5931\u8D25\uFF0C\u663E\u793A\u4E0A\u6B21\u7F13\u5B58\u6C47\u7387\u3002"), fx.status === "error" && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--tm)",
      lineHeight: 1.55
    }
  }, "\u6C47\u7387\u83B7\u53D6\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u5237\u65B0\u9875\u9762\u3002"), fx.status !== "error" && /*#__PURE__*/React.createElement("div", {
    className: "ops-rate-grid"
  }, FX_TARGETS.map(t => {
    const raw = fx.rates?.[t.code];
    const lines = fxCellLines(t, raw, foreignBase);
    return /*#__PURE__*/React.createElement("div", {
      key: t.code,
      className: "ops-rate-cell"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: `ops-metric-icon-box ${FX_ICON[t.code] || "ops-icon-blue"}`,
      style: {
        width: 36,
        height: 36,
        fontSize: 15,
        fontWeight: 700
      }
    }, t.symbol), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        fontWeight: 600,
        color: "var(--text)"
      }
    }, t.label, " ", t.code)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 800,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "-0.02em"
      }
    }, fx.status === "loading" ? "…" : /*#__PURE__*/React.createElement("span", null, lines.primary)), raw != null && fx.status === "ok" && lines.sub && /*#__PURE__*/React.createElement("div", {
      className: "ops-metric-sub"
    }, lines.sub));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginTop: 10,
      lineHeight: 1.5
    }
  }, "\u6570\u636E\u6765\u6E90\uFF1A\u591A\u6E90\u6C47\u7387 API + \u672C\u5730\u7F13\u5B58\uFF0C\u4EC5\u4F9B\u53C2\u8003\u3002"));
}
function formatClockTime(date, tz) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}
function formatClockDate(date, tz) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: tz,
    month: "numeric",
    day: "numeric",
    weekday: "short"
  }).format(date);
}
function useNow(tickMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}
function getPriorityOwnerId() {
  try {
    const lan = localStorage.getItem("ops-center-client-id");
    if (lan && /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(lan)) return lan;
    let dev = localStorage.getItem("ops-center-device-id");
    if (!dev) {
      dev = typeof crypto !== "undefined" && crypto.randomUUID ? `dev-${crypto.randomUUID()}` : `dev-${Date.now()}`;
      localStorage.setItem("ops-center-device-id", dev);
    }
    return dev;
  } catch {
    return "dev-fallback";
  }
}
function priorityStorageKey(date) {
  return `ops-priority:${date}`;
}
function readPriorityForToday(date) {
  try {
    const raw = localStorage.getItem(priorityStorageKey(date));
    if (!raw) return {
      date: "",
      text: ""
    };
    const parsed = JSON.parse(raw);
    if (parsed?.date === date && parsed.text) {
      return {
        date: parsed.date,
        text: parsed.text
      };
    }
  } catch {/* ignore */}
  return {
    date: "",
    text: ""
  };
}
function writePriorityForToday(date, text) {
  const entry = {
    date,
    text: text.trim()
  };
  localStorage.setItem(priorityStorageKey(date), JSON.stringify(entry));
  return entry;
}
function PriorityModal({
  initialText,
  onSave,
  onClose,
  requiredHint,
  required
}) {
  const [text, setText] = useState(initialText || "");
  const [warn, setWarn] = useState("");
  const canClose = !required;
  const tryClose = () => {
    if (canClose) onClose();
  };
  useEffect(() => {
    if (!canClose) return;
    const onKey = e => {
      if (e.key === "Escape") tryClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canClose, onClose]);
  const handleSave = () => {
    if (!text.trim()) {
      setWarn("请先填写今日最优先工作，保存后才能关闭。");
      return;
    }
    try {
      onSave(text);
      setWarn("");
    } catch (e) {
      setWarn(e?.message || "保存失败，请重试");
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    onClick: canClose ? tryClose : undefined,
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.45)",
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 16,
      padding: "1.35rem 1.5rem",
      width: "100%",
      maxWidth: 440,
      color: "var(--text)",
      boxShadow: "0 16px 48px rgba(0,0,0,0.12)",
      position: "relative",
      zIndex: 1001
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 16,
      marginBottom: 6
    }
  }, "\u4ECA\u65E5\u6700\u4F18\u5148\u5DE5\u4F5C"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--tm)",
      marginBottom: 14,
      lineHeight: 1.55
    }
  }, requiredHint || "写下今天必须完成的第一件事，保存后会在首页显示。"), /*#__PURE__*/React.createElement("textarea", {
    value: text,
    onChange: e => {
      setText(e.target.value);
      if (warn) setWarn("");
    },
    placeholder: "\u4F8B\u5982\uFF1A\u5B8C\u6210 FB101 \u5934\u7A0B\u8FFD\u8E2A\u7801\u8865\u5F55\u3001\u5BA1\u6838\u7F8E\u5DE5\u6392\u671F\u2026",
    autoFocus: true,
    style: {
      width: "100%",
      minHeight: 96,
      fontSize: 14,
      padding: "10px 12px",
      border: `1px solid ${warn ? "#e57373" : "var(--border)"}`,
      borderRadius: 10,
      fontFamily: "inherit",
      background: "transparent",
      color: "inherit",
      resize: "vertical",
      display: "block",
      marginBottom: warn ? 8 : 14,
      lineHeight: 1.5
    },
    onKeyDown: e => {
      if (e.key === "Enter" && e.ctrlKey) handleSave();
    }
  }), warn && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#c62828",
      marginBottom: 14,
      lineHeight: 1.5
    }
  }, warn), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "flex-end",
      gap: 8
    }
  }, canClose && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: tryClose,
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "7px 14px",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "var(--tm)"
    }
  }, "\u53D6\u6D88"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: handleSave,
    style: {
      background: "#2d7dd2",
      border: "none",
      borderRadius: 8,
      padding: "7px 16px",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "#fff",
      fontWeight: 600
    }
  }, "\u4FDD\u5B58"))));
}

// ─── HOME MODULE ───────────────────────────────────────────────────────

function HomePanel() {
  const now = useNow();
  const fx = useExchangeRates();
  const news = useAmazonNews();
  const today = beijingTodayKey(now);
  const [clientId, setClientId] = useState("");
  const [priority, setPriority] = useState({
    date: "",
    text: ""
  });
  const [priorityReady, setPriorityReady] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const todayPriority = priority.date === today ? priority.text : "";
  useEffect(() => {
    let cancelled = false;
    const saved = readPriorityForToday(today);
    setPriority(saved);
    setShowModal(!saved.text.trim());
    setPriorityReady(true);
    resolveClientId().then(id => {
      if (!cancelled && id) setClientId(id);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [today]);
  const handleSavePriority = text => {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("请先填写内容");
    let entry;
    try {
      entry = writePriorityForToday(today, trimmed);
    } catch {
      throw new Error("无法保存，请检查浏览器是否允许本地存储");
    }
    setPriority(entry);
    setShowModal(false);
    const id = clientId || getPriorityOwnerId();
    saveTodayPriority(id, today, trimmed).catch(() => {});
  };
  const beijingDate = formatClockDate(now, "Asia/Shanghai");
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ops-page-header",
    style: {
      marginBottom: "1.25rem"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ops-page-subtitle"
  }, "\u6B22\u8FCE\u56DE\u6765"), /*#__PURE__*/React.createElement("div", {
    className: "ops-page-title",
    style: {
      fontSize: 20
    }
  }, beijingDate))), /*#__PURE__*/React.createElement(AmazonNewsCard, {
    news: news
  }), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-grid",
    style: {
      marginBottom: "1.25rem"
    }
  }, WORLD_CLOCKS.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.id,
    className: "ops-metric-card ops-metric-card-elevated"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-card-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: `ops-metric-icon-box ${WORLD_CLOCK_ICON[c.id] || "ops-icon-blue"}`
  }, c.flag), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: "var(--text)"
    }
  }, c.label), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-label",
    style: {
      marginBottom: 0
    }
  }, c.sub))), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-value",
    style: {
      fontSize: 24,
      fontVariantNumeric: "tabular-nums",
      color: c.id === "cn" ? "var(--primary)" : "var(--text)"
    }
  }, formatClockTime(now, c.tz)), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-sub"
  }, formatClockDate(now, c.tz))))), /*#__PURE__*/React.createElement(ExchangeRatesCard, {
    fx: fx
  }), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-card ops-metric-card-hero",
    style: {
      marginBottom: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: todayPriority ? 10 : 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600
    }
  }, "\uD83C\uDFAF \u4ECA\u65E5\u6700\u4F18\u5148"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "ops-btn",
    onClick: () => setShowModal(true),
    style: {
      background: "rgba(255,255,255,0.2)",
      borderColor: "rgba(255,255,255,0.3)",
      color: "#fff"
    }
  }, todayPriority ? "修改" : "填写")), todayPriority ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      lineHeight: 1.6,
      whiteSpace: "pre-wrap"
    }
  }, todayPriority) : /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-sub"
  }, "\u5C1A\u672A\u8BBE\u5B9A\u4ECA\u65E5\u4F18\u5148\u4E8B\u9879\uFF0C\u70B9\u51FB\u300C\u586B\u5199\u300D\u5F00\u59CB\u3002")), priorityReady && showModal && /*#__PURE__*/React.createElement(PriorityModal, {
    initialText: todayPriority,
    required: !todayPriority,
    requiredHint: !todayPriority ? "新的一天，请先写下今天最重要的一件事。填写并保存后才能关闭。" : undefined,
    onSave: handleSavePriority,
    onClose: () => setShowModal(false)
  }));
}
const PREMIUM_SKU_DIMS = ["利润", "库存", "广告", "转化", "退款", "合规"];
const STOCK_OPTS = ["无断货，库存充裕(>30天)", "无断货，有补货预警(≤30天)", "1款断货或即将断货", "2款及以上断货"];
const PREMIUM_CFGS = {
  new: {
    label: "新品推广期",
    kpis: [{
      id: "tacos",
      name: "账号整体TACoS",
      desc: "广告报告 → 总广告花费 ÷ 总销售额",
      where: "广告管理 → 广告活动报告",
      unit: "%",
      placeholder: "如 18",
      target: "目标 ≤25%",
      wt: 20,
      score: (v, w) => {
        if (Number.isNaN(v)) return null;
        if (v <= 20) return w;
        if (v <= 25) return Math.round(w * 0.8);
        return Math.max(0, w - Math.floor((v - 25) * 2));
      }
    }, {
      id: "gmv",
      name: "账号GMV达成率",
      desc: "实际销售额 ÷ 本月目标销售额",
      where: "数据报告 → 销售和流量报告",
      unit: "%",
      placeholder: "如 105",
      target: "目标 ≥100%",
      wt: 25,
      score: (v, w) => {
        if (Number.isNaN(v)) return null;
        return Math.min(w + 4, Math.max(0, w + (v - 100) * 0.3));
      }
    }, {
      id: "newrank",
      name: "新品BSR周均提升",
      desc: "核心新品本周类目排名 vs 上周排名变化",
      where: "商品页面 → 查看BSR排名",
      unit: "名",
      placeholder: "如 12",
      target: "目标周提升≥5名",
      wt: 20,
      score: (v, w) => {
        if (Number.isNaN(v)) return null;
        if (v >= 5) return w;
        if (v >= 0) return Math.round(w * v / 5);
        return Math.max(0, w + Math.round(v * 1.5));
      }
    }, {
      id: "refund",
      name: "账号整体退款率",
      desc: "退款订单数 ÷ 总订单数",
      where: "报告 → 退款报告",
      unit: "%",
      placeholder: "如 5.5",
      target: "目标 ≤8%",
      wt: 15,
      score: (v, w) => {
        if (Number.isNaN(v)) return null;
        return Math.max(0, w - Math.floor(Math.max(0, v - 8) / 0.5) * 1.5);
      }
    }, {
      id: "stock",
      name: "断货或库存预警",
      desc: "核心款是否断货或预计7天内断货",
      where: "库存管理 → 库存计划",
      isSelect: true,
      opts: STOCK_OPTS,
      target: "目标：无断货",
      wt: 10,
      score: (v, w) => {
        const m = {
          0: w,
          1: Math.round(w * 0.7),
          2: Math.round(w * 0.3),
          3: 0
        };
        return v === "" ? null : m[v] !== undefined ? m[v] : null;
      }
    }, {
      id: "comply",
      name: "合规与账号健康",
      desc: "Account Health页面是否有警告/政策违规",
      where: "绩效 → Account Health",
      unit: "次",
      placeholder: "0",
      target: "目标：0次警告",
      wt: 10,
      score: (v, w) => {
        if (Number.isNaN(v)) return null;
        return Math.max(0, w - v * 5);
      }
    }]
  },
  mature: {
    label: "成熟维护期",
    kpis: [{
      id: "profit",
      name: "账号净利润达成率",
      desc: "本月实际净利润 ÷ 目标净利润",
      where: "财务报告 → 利润报表",
      unit: "%",
      placeholder: "如 98",
      target: "目标 ≥100%",
      wt: 30,
      score: (v, w) => {
        if (Number.isNaN(v)) return null;
        return Math.min(w + 5, Math.max(0, w + (v - 100) * 1.5));
      }
    }, {
      id: "tacos",
      name: "账号整体TACoS",
      desc: "广告报告 → 总广告花费 ÷ 总销售额",
      where: "广告管理 → 广告活动报告",
      unit: "%",
      placeholder: "如 12",
      target: "目标 ≤15%",
      wt: 20,
      score: (v, w) => {
        if (Number.isNaN(v)) return null;
        if (v < 10) return w + 1;
        if (v <= 15) return w;
        return Math.max(0, w - Math.floor((v - 15) * 2));
      }
    }, {
      id: "gmv",
      name: "账号GMV达成率",
      desc: "实际销售额 ÷ 本月目标销售额",
      where: "数据报告 → 销售和流量报告",
      unit: "%",
      placeholder: "如 102",
      target: "目标 ≥95%",
      wt: 15,
      score: (v, w) => {
        if (Number.isNaN(v)) return null;
        if (v >= 95) return Math.min(w + 2, w + (v - 100) * 0.2);
        return Math.max(0, w - (95 - v) * 0.5);
      }
    }, {
      id: "refund",
      name: "账号整体退款率",
      desc: "退款订单数 ÷ 总订单数",
      where: "报告 → 退款报告",
      unit: "%",
      placeholder: "如 3.5",
      target: "目标 ≤5%（严控）",
      wt: 15,
      score: (v, w) => {
        if (Number.isNaN(v)) return null;
        return Math.max(0, w - Math.floor(Math.max(0, v - 5) / 0.5) * 2);
      }
    }, {
      id: "stock",
      name: "断货或库存预警",
      desc: "核心款是否断货或预计7天内断货",
      where: "库存管理 → 库存计划",
      isSelect: true,
      opts: STOCK_OPTS,
      target: "目标：无断货",
      wt: 10,
      score: (v, w) => {
        const m = {
          0: w,
          1: Math.round(w * 0.7),
          2: Math.round(w * 0.3),
          3: 0
        };
        return v === "" ? null : m[v] !== undefined ? m[v] : null;
      }
    }, {
      id: "comply",
      name: "合规与账号健康",
      desc: "Account Health页面是否有警告/政策违规",
      where: "绩效 → Account Health",
      unit: "次",
      placeholder: "0",
      target: "目标：0次警告",
      wt: 10,
      score: (v, w) => {
        if (Number.isNaN(v)) return null;
        return Math.max(0, w - v * 5);
      }
    }]
  }
};
function emptyPremiumWeek() {
  return {
    mode: "new",
    redline: false,
    stage: "self",
    note: "",
    vals: {},
    skuData: {}
  };
}
function weekHasPremiumData(w) {
  if (!w) return false;
  if (w.redline || w.note) return true;
  if (Object.values(w.vals || {}).some(v => v !== "" && v != null)) return true;
  if (Object.keys(w.skuData || {}).length > 0) return true;
  return false;
}
function calcPremiumWeekScore(data) {
  if (!data || data.redline) return null;
  const cfg = PREMIUM_CFGS[data.mode || "new"];
  if (!cfg) return null;
  let total = 0;
  let cnt = 0;
  cfg.kpis.forEach(kpi => {
    const raw = (data.vals || {})[kpi.id];
    const v = kpi.isSelect ? raw : parseFloat(raw);
    const s = kpi.score(v, kpi.wt);
    if (s !== null) {
      total += Math.max(0, s);
      cnt++;
    }
  });
  return cnt > 0 ? Math.round(total * 10) / 10 : null;
}
function premiumGradeInfo(sc, redline) {
  if (redline) return {
    g: "红线",
    b: "0%",
    cls: "gf",
    msg: "红线触发，当周当月绩效清零。"
  };
  if (sc === null) return {
    g: "—",
    b: "—",
    cls: "",
    msg: ""
  };
  if (sc >= 90) return {
    g: "S 优秀",
    b: "100%",
    cls: "ga",
    msg: "账号整体健康，全额发放本周绩效。"
  };
  if (sc >= 80) return {
    g: "A 良好",
    b: "按比例",
    cls: "gb",
    msg: "良好，重点改善扣分项，下周冲刺优秀。"
  };
  if (sc >= 60) return {
    g: "B 合格",
    b: "基础",
    cls: "gc",
    msg: "合格，需制定改进计划，防止连续低于此线。"
  };
  return {
    g: "C 不达标",
    b: "不发",
    cls: "gf",
    msg: "未达60分，不发提成，需提交本周复盘报告。"
  };
}
const adviceStyle = {
  ga: {
    background: "#EAF3DE",
    border: "1px solid #97C459",
    color: "#3B6D11"
  },
  gb: {
    background: "#FAEEDA",
    border: "1px solid #EF9F27",
    color: "#854F0B"
  },
  gc: {
    background: "#FAECE7",
    border: "1px solid #F0997B",
    color: "#993C1D"
  },
  gf: {
    background: "#FCEBEB",
    border: "1px solid #F09595",
    color: "#A32D2D"
  }
};
const premiumInp = {
  width: "100%",
  fontSize: 12,
  padding: "4px 6px",
  textAlign: "center",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontFamily: "inherit",
  background: "var(--card)",
  color: "inherit"
};
function HeroCard({
  label,
  value,
  tone
}) {
  const colors = {
    blue: "#185FA5",
    green: "#3B6D11",
    red: "#A32D2D",
    amber: "#854F0B"
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--bg)",
      borderRadius: 8,
      padding: "10px 12px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginBottom: 4
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 600,
      color: tone ? colors[tone] : "var(--text)"
    }
  }, value));
}
function FlowBar({
  stage
}) {
  const steps = [{
    id: "self",
    label: "运营自评",
    icon: "✎"
  }, {
    id: "manager",
    label: "主管审核",
    icon: "✓"
  }, {
    id: "approved",
    label: "HR存档",
    icon: "🏢"
  }];
  const order = ["self", "manager", "approved"];
  const idx = order.indexOf(stage);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      border: "1px solid var(--border)",
      borderRadius: 9,
      overflow: "hidden",
      marginBottom: 14
    }
  }, steps.map((s, i) => {
    const cls = i < idx ? "done" : stage === s.id ? "active" : "pending";
    const bg = cls === "done" ? "#EAF3DE" : cls === "active" ? "#E6F1FB" : "var(--bg)";
    const color = cls === "done" ? "#3B6D11" : cls === "active" ? "#0C447C" : "var(--tm)";
    return /*#__PURE__*/React.createElement("div", {
      key: s.id,
      style: {
        flex: 1,
        padding: "8px 6px",
        textAlign: "center",
        fontSize: 11,
        color,
        background: bg,
        borderRight: i < 2 ? "1px solid var(--border)" : "none",
        fontWeight: cls === "active" ? 600 : 400
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 14,
        marginBottom: 2
      }
    }, s.icon), s.label);
  }));
}
function PremiumScoreForm({
  data,
  onChange
}) {
  const set = patch => onChange({
    ...data,
    ...patch
  });
  const setVal = (id, v) => set({
    vals: {
      ...(data.vals || {}),
      [id]: v
    }
  });
  const cfg = PREMIUM_CFGS[data.mode || "new"];
  const sc = calcPremiumWeekScore(data);
  const gi = premiumGradeInfo(data.redline ? 0 : sc, data.redline);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginBottom: 12,
      flexWrap: "wrap"
    }
  }, ["new", "mature"].map(m => /*#__PURE__*/React.createElement("button", {
    key: m,
    type: "button",
    onClick: () => set({
      mode: m
    }),
    style: {
      fontSize: 12,
      padding: "4px 12px",
      borderRadius: 6,
      cursor: "pointer",
      fontFamily: "inherit",
      border: `1px solid ${data.mode === m ? m === "new" ? "#85B7EB" : "#97C459" : "var(--border)"}`,
      background: data.mode === m ? m === "new" ? "#E6F1FB" : "#EAF3DE" : "var(--card)",
      color: data.mode === m ? m === "new" ? "#0C447C" : "#27500A" : "var(--tm)",
      fontWeight: data.mode === m ? 600 : 400
    }
  }, m === "new" ? "新品期" : "成熟期"))), /*#__PURE__*/React.createElement(FlowBar, {
    stage: data.stage || "self"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 8,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement(HeroCard, {
    label: "\u672C\u5468\u5F97\u5206",
    value: data.redline ? "0" : sc !== null ? sc.toFixed(1) : "填写中",
    tone: data.redline ? "red" : "blue"
  }), /*#__PURE__*/React.createElement(HeroCard, {
    label: "\u7EE9\u6548\u7B49\u7EA7",
    value: data.redline ? "红线" : gi.g
  }), /*#__PURE__*/React.createElement(HeroCard, {
    label: "\u63D0\u6210\u7CFB\u6570",
    value: data.redline ? "0%" : gi.b
  }), /*#__PURE__*/React.createElement(HeroCard, {
    label: "\u5BA1\u6279\u72B6\u6001",
    value: data.stage === "self" ? "待提交" : data.stage === "manager" ? "主管审核中" : "已存档"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px solid #F09595",
      borderRadius: 9,
      padding: "10px 12px",
      marginBottom: 12,
      background: "#FCEBEB",
      display: "flex",
      gap: 10,
      alignItems: "center",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: "#A32D2D"
    }
  }, "\u7EA2\u7EBF\u4E00\u7968\u5426\u51B3"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "#791F1F",
      flex: 1
    }
  }, "\u8D26\u53F7\u88AB\u5C01 / \u5927\u5356\u94FE\u63A5\u88AB\u79FB\u9664 \u2192 \u5F53\u5468\u5F53\u6708\u7EE9\u6548\u6E05\u96F6"), /*#__PURE__*/React.createElement("label", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      cursor: "pointer",
      fontSize: 11,
      color: "#791F1F"
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: !!data.redline,
    onChange: e => set({
      redline: e.target.checked
    })
  }), data.redline ? "已触发" : "未触发")), /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px solid var(--border)",
      borderRadius: 9,
      overflow: "hidden",
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 12px",
      background: "var(--bg)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600
    }
  }, "\u8D26\u53F7\u5C42KPI \u2014 ", cfg.label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, "\u6570\u636E\u6765\u6E90\uFF1A\u4E9A\u9A6C\u900A\u5356\u5BB6\u540E\u53F0")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 56px 120px 52px",
      gap: 8,
      padding: "6px 12px",
      fontSize: 10,
      color: "var(--tm)",
      borderTop: "1px solid var(--border)",
      background: "var(--card)"
    }
  }, /*#__PURE__*/React.createElement("span", null, "\u6307\u6807"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "center"
    }
  }, "\u6743\u91CD"), /*#__PURE__*/React.createElement("span", null, "\u586B\u5165\u5B9E\u9645\u503C"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "center"
    }
  }, "\u5F97\u5206")), cfg.kpis.map(kpi => {
    const raw = (data.vals || {})[kpi.id] ?? "";
    const v = kpi.isSelect ? raw : parseFloat(raw);
    const s = kpi.score(v, kpi.wt);
    const scCls = s !== null ? s / kpi.wt >= 0.85 ? "#0F6E56" : s / kpi.wt >= 0.6 ? "#854F0B" : "#A32D2D" : "var(--tm)";
    return /*#__PURE__*/React.createElement("div", {
      key: kpi.id,
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 56px 120px 52px",
        gap: 8,
        alignItems: "center",
        padding: "10px 12px",
        borderTop: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        fontWeight: 600
      }
    }, kpi.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "var(--tm)",
        marginTop: 2
      }
    }, kpi.desc), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: "#185FA5",
        marginTop: 2
      }
    }, kpi.where), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        padding: "1px 6px",
        borderRadius: 8,
        marginTop: 4,
        display: "inline-block",
        background: "var(--bg)",
        color: "var(--tm)"
      }
    }, kpi.target)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "var(--tm)",
        textAlign: "center"
      }
    }, kpi.wt, "%"), kpi.isSelect ? /*#__PURE__*/React.createElement("select", {
      style: {
        ...premiumInp,
        textAlign: "left"
      },
      value: raw,
      onChange: e => setVal(kpi.id, e.target.value)
    }, /*#__PURE__*/React.createElement("option", {
      value: ""
    }, "\u8BF7\u9009\u62E9"), kpi.opts.map((o, i) => /*#__PURE__*/React.createElement("option", {
      key: i,
      value: String(i)
    }, o))) : /*#__PURE__*/React.createElement("input", {
      style: premiumInp,
      type: "number",
      step: "0.1",
      placeholder: kpi.placeholder,
      value: raw,
      onChange: e => setVal(kpi.id, e.target.value)
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 600,
        textAlign: "center",
        color: scCls
      }
    }, s !== null ? s.toFixed(1) : "—"));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px solid var(--border)",
      borderRadius: 9,
      padding: "10px 12px",
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      marginBottom: 6
    }
  }, "\u8FD0\u8425\u81EA\u8BC4\u5907\u6CE8\uFF08\u5F02\u5E38\u8BF4\u660E / \u4E3B\u52A8\u52A8\u4F5C\uFF09"), /*#__PURE__*/React.createElement("textarea", {
    style: {
      ...premiumInp,
      textAlign: "left",
      minHeight: 60,
      resize: "vertical"
    },
    placeholder: "\u5982\uFF1A\u672C\u5468TACoS\u504F\u9AD8\u56E0\u4E3A\u6D4B\u8BD5\u4E863\u7EC4\u65B0\u54C1\u5E7F\u544A\u7EC4\u5408\u2026",
    value: data.note || "",
    onChange: e => set({
      note: e.target.value
    })
  })), sc !== null && !data.redline && gi.msg && /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 9,
      padding: "10px 12px",
      marginBottom: 12,
      ...(adviceStyle[gi.cls] || {})
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 500
    }
  }, gi.msg)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "flex-end",
      gap: 8
    }
  }, sc !== null && data.stage === "self" && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => set({
      stage: "manager"
    }),
    style: {
      fontSize: 12,
      padding: "6px 14px",
      borderRadius: 6,
      cursor: "pointer",
      fontFamily: "inherit",
      background: "#E6F1FB",
      border: "1px solid #85B7EB",
      color: "#0C447C"
    }
  }, "\u63D0\u4EA4\u4E3B\u7BA1\u5BA1\u6838 \u2192"), data.stage === "manager" && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => set({
      stage: "approved"
    }),
    style: {
      fontSize: 12,
      padding: "6px 14px",
      borderRadius: 6,
      cursor: "pointer",
      fontFamily: "inherit",
      background: "#EAF3DE",
      border: "1px solid #97C459",
      color: "#27500A"
    }
  }, "\u4E3B\u7BA1\u786E\u8BA4\u901A\u8FC7 \u2192 HR\u5B58\u6863"), data.stage === "approved" && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "#3B6D11"
    }
  }, "\u2713 \u5DF2\u5BA1\u6279\u5B58\u6863")));
}
function DotBtn({
  active,
  tone,
  onClick
}) {
  const colors = {
    g: "#3B6D11",
    y: "#854F0B",
    r: "#A32D2D"
  };
  const bg = {
    g: "#EAF3DE",
    y: "#FAEEDA",
    r: "#FCEBEB"
  };
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClick,
    style: {
      width: 26,
      height: 26,
      borderRadius: "50%",
      border: `1px solid ${active ? "#97C459" : "var(--border)"}`,
      cursor: "pointer",
      fontSize: 11,
      fontWeight: 600,
      margin: "0 2px",
      background: active ? bg[tone] : "var(--card)",
      color: colors[tone],
      opacity: active ? 1 : 0.35,
      fontFamily: "inherit"
    }
  }, "\u25CF");
}
function PremiumSkuForm({
  week,
  data,
  skuList,
  onChange,
  onSkuListChange
}) {
  const skuData = data.skuData || {};
  const setDot = (skuIdx, dim, val) => {
    const row = {
      ...(skuData[String(skuIdx)] || {})
    };
    row[dim] = val;
    onChange({
      ...data,
      skuData: {
        ...skuData,
        [String(skuIdx)]: row
      }
    });
  };
  const addSku = () => {
    const name = window.prompt("输入SKU名称（如 A001 或 蓝色托特包）");
    if (!name?.trim()) return;
    const phase = window.confirm("新品期点确定，成熟期点取消") ? "new" : "mature";
    const next = [...skuList, {
      name: name.trim(),
      phase
    }];
    const idx = next.length - 1;
    const row = {};
    PREMIUM_SKU_DIMS.forEach(d => {
      row[d] = "g";
    });
    onSkuListChange(next);
    onChange({
      ...data,
      skuData: {
        ...skuData,
        [String(idx)]: row
      }
    });
  };
  const updateSku = (i, patch) => {
    const next = skuList.map((s, j) => j === i ? {
      ...s,
      ...patch
    } : s);
    onSkuListChange(next);
  };
  let redCount = 0,
    yellowCount = 0;
  skuList.forEach((_, i) => {
    PREMIUM_SKU_DIMS.forEach(dim => {
      const v = skuData[String(i)]?.[dim] || "g";
      if (v === "r") redCount++;
      if (v === "y") yellowCount++;
    });
  });
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--tm)",
      marginBottom: 10
    }
  }, "\u8FD0\u8425\u8D1F\u8D23\u7684SKU \u2014 \u6BCF\u5468\u626B\u63CF\u4E00\u6B21\uFF0C\u53EA\u6253\u72B6\u6001\uFF0C\u4E0D\u586B\u6570\u5B57"), /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px solid var(--border)",
      borderRadius: 9,
      overflow: "hidden",
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 12px",
      background: "var(--bg)",
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      flex: 1
    }
  }, "SKU\u5065\u5EB7\u626B\u63CF \xB7 \u7B2C", week, "\u5468"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      padding: "2px 8px",
      borderRadius: 10,
      background: "#EAF3DE",
      color: "#3B6D11"
    }
  }, "\u7EFF=\u6B63\u5E38"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      padding: "2px 8px",
      borderRadius: 10,
      background: "#FAEEDA",
      color: "#854F0B"
    }
  }, "\u9EC4=\u5173\u6CE8"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      padding: "2px 8px",
      borderRadius: 10,
      background: "#FCEBEB",
      color: "#A32D2D"
    }
  }, "\u7EA2=\u5F02\u5E38")), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: "auto"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: "var(--bg)"
    }
  }, /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "8px 10px",
      textAlign: "left",
      color: "var(--tm)",
      fontWeight: 500
    }
  }, "SKU/\u6B3E\u540D"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "8px 10px",
      textAlign: "left",
      color: "var(--tm)",
      fontWeight: 500
    }
  }, "\u9636\u6BB5"), PREMIUM_SKU_DIMS.map(d => /*#__PURE__*/React.createElement("th", {
    key: d,
    style: {
      padding: "8px 6px",
      textAlign: "center",
      color: "var(--tm)",
      fontWeight: 500
    }
  }, d)))), /*#__PURE__*/React.createElement("tbody", null, skuList.length === 0 ? /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: 8,
    style: {
      padding: 16,
      textAlign: "center",
      color: "var(--tm)"
    }
  }, "\u6682\u65E0SKU\uFF0C\u70B9\u51FB\u4E0B\u65B9\u6DFB\u52A0")) : skuList.map((sku, i) => /*#__PURE__*/React.createElement("tr", {
    key: i,
    style: {
      borderTop: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "8px 10px"
    }
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...premiumInp,
      width: 90,
      textAlign: "left"
    },
    value: sku.name,
    onChange: e => updateSku(i, {
      name: e.target.value
    })
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      padding: "1px 6px",
      borderRadius: 8,
      background: sku.phase === "new" ? "#E6F1FB" : "#EAF3DE",
      color: sku.phase === "new" ? "#0C447C" : "#27500A"
    }
  }, sku.phase === "new" ? "新品" : "成熟"))), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "8px 10px"
    }
  }, /*#__PURE__*/React.createElement("select", {
    style: {
      fontSize: 10,
      padding: "2px 4px",
      borderRadius: 4,
      border: "1px solid var(--border)"
    },
    value: sku.phase,
    onChange: e => updateSku(i, {
      phase: e.target.value
    })
  }, /*#__PURE__*/React.createElement("option", {
    value: "new"
  }, "\u65B0\u54C1"), /*#__PURE__*/React.createElement("option", {
    value: "mature"
  }, "\u6210\u719F"))), PREMIUM_SKU_DIMS.map(dim => {
    const cur = skuData[String(i)]?.[dim] || "g";
    return /*#__PURE__*/React.createElement("td", {
      key: dim,
      style: {
        padding: "8px 6px",
        textAlign: "center"
      }
    }, ["g", "y", "r"].map(v => /*#__PURE__*/React.createElement(DotBtn, {
      key: v,
      tone: v,
      active: cur === v,
      onClick: () => setDot(i, dim, v)
    })));
  })))))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "10px 12px",
      borderTop: "1px solid var(--border)",
      display: "flex",
      gap: 8,
      alignItems: "center",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: addSku,
    style: {
      fontSize: 12,
      padding: "5px 12px",
      borderRadius: 6,
      cursor: "pointer",
      fontFamily: "inherit",
      border: "1px solid var(--border)",
      background: "var(--card)"
    }
  }, "+ \u6DFB\u52A0SKU"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, "\u7EA2\u8272\u5F02\u5E38\u9879\u9700\u5728\u8003\u6838\u5907\u6CE8\u4E2D\u8BF4\u660E\u5904\u7406\u65B9\u6848"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      gap: 8,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement(HeroCard, {
    label: "\u7EA2\u8272\u5F02\u5E38\u9879",
    value: String(redCount),
    tone: redCount > 0 ? "red" : undefined
  }), /*#__PURE__*/React.createElement(HeroCard, {
    label: "\u9EC4\u8272\u5173\u6CE8\u9879",
    value: String(yellowCount),
    tone: yellowCount > 0 ? "amber" : undefined
  }), /*#__PURE__*/React.createElement(HeroCard, {
    label: "SKU\u6570\u91CF",
    value: String(skuList.length)
  })), redCount > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#A32D2D",
      padding: "8px 12px",
      background: "#FCEBEB",
      borderRadius: 8
    }
  }, "\u6709 ", redCount, " \u4E2A\u7EA2\u8272\u5F02\u5E38\u9879\uFF0C\u8BF7\u5728\u8003\u6838\u5907\u6CE8\u4E2D\u8BF4\u660E\u5904\u7406\u65B9\u6848\u3002"));
}
function OpsPremiumMonthSummary({
  items,
  year,
  month,
  person,
  getWeekData
}) {
  const WEEKS = [1, 2, 3, 4];
  const weekRows = useMemo(() => WEEKS.map(w => {
    const d = getWeekData(items, year, month, "ops_jp", person, w);
    return {
      w,
      sc: calcPremiumWeekScore(d),
      red: !!d.redline,
      mode: d.mode || "new"
    };
  }), [items, year, month, person, getWeekData]);
  const hasRed = weekRows.some(x => x.red);
  const filled = weekRows.filter(x => x.sc !== null);
  const monthSc = hasRed ? 0 : filled.length ? filled.reduce((a, x) => a + x.sc, 0) / filled.length : null;
  const gi = premiumGradeInfo(monthSc, hasRed);
  const mode = weekRows.find(x => x.sc !== null)?.mode || "new";
  const cfg = PREMIUM_CFGS[mode];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.08em",
      color: "#0C447C",
      marginBottom: 12
    }
  }, "\u7CBE\u54C1\u8FD0\u8425 \u2014 \u6708\u5EA6\u603B\u8BC4"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 8,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(HeroCard, {
    label: "\u6708\u5EA6\u7EFC\u5408\u5206",
    value: monthSc !== null ? monthSc.toFixed(1) : "暂无",
    tone: "blue"
  }), /*#__PURE__*/React.createElement(HeroCard, {
    label: "\u6708\u5EA6\u7B49\u7EA7",
    value: hasRed ? "红线触发" : gi.g
  }), /*#__PURE__*/React.createElement(HeroCard, {
    label: "\u6708\u5EA6\u63D0\u6210",
    value: hasRed ? "0%" : gi.b
  }), /*#__PURE__*/React.createElement(HeroCard, {
    label: "\u5B8C\u6210\u5468\u6B21",
    value: `${filled.length}/4`
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px solid var(--border)",
      borderRadius: 9,
      overflow: "hidden",
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 12px",
      background: "var(--bg)",
      fontSize: 13,
      fontWeight: 600
    }
  }, "\u56DB\u5468\u8BC4\u5206\u8D8B\u52BF"), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 14px",
      display: "flex",
      alignItems: "flex-end",
      gap: 12,
      height: 100
    }
  }, weekRows.map(ws => {
    const sc = ws.red ? 0 : ws.sc;
    const h = sc !== null ? Math.round(sc * 0.7) : 4;
    const color = sc === null ? "var(--bg)" : sc >= 90 ? "#639922" : sc >= 80 ? "#EF9F27" : sc >= 60 ? "#D85A30" : "#E24B4A";
    return /*#__PURE__*/React.createElement("div", {
      key: ws.w,
      style: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        fontWeight: 600
      }
    }, sc !== null ? sc.toFixed(0) : "—"), /*#__PURE__*/React.createElement("div", {
      style: {
        width: "100%",
        background: color,
        borderRadius: "3px 3px 0 0",
        height: h,
        minHeight: 4
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        color: "var(--tm)"
      }
    }, "W", ws.w));
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px solid var(--border)",
      borderRadius: 9,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 12px",
      background: "var(--bg)",
      display: "flex",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600
    }
  }, "\u6708\u5EA6KPI\u5E73\u5747\u8FBE\u6210"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, "\u56DB\u5468\u5747\u503C \xB7 ", cfg.label)), cfg.kpis.map(kpi => {
    const scores = WEEKS.map(w => {
      const d = getWeekData(items, year, month, "ops_jp", person, w);
      const raw = (d.vals || {})[kpi.id];
      const v = kpi.isSelect ? raw : parseFloat(raw);
      return kpi.score(v, kpi.wt);
    }).filter(s => s !== null);
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const pct = avg !== null ? Math.min(100, Math.round(avg / kpi.wt * 100)) : 0;
    const barColor = pct >= 85 ? "#639922" : pct >= 60 ? "#BA7517" : "#E24B4A";
    const txtColor = avg !== null ? pct >= 85 ? "#3B6D11" : pct >= 60 ? "#854F0B" : "#A32D2D" : "var(--tm)";
    return /*#__PURE__*/React.createElement("div", {
      key: kpi.id,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderTop: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        minWidth: 130
      }
    }, kpi.name), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        height: 5,
        background: "var(--bg)",
        borderRadius: 3,
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: "100%",
        width: `${avg !== null ? pct : 0}%`,
        background: barColor,
        borderRadius: 3
      }
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        fontWeight: 600,
        minWidth: 52,
        textAlign: "right",
        color: txtColor
      }
    }, avg !== null ? `${avg.toFixed(1)}/${kpi.wt}` : "暂无"));
  })));
}
function OpsPremiumPanel({
  page,
  week,
  data,
  skuList,
  onChange,
  onSkuListChange,
  onPageChange
}) {
  const tabStyle = id => ({
    flex: 1,
    fontSize: 13,
    padding: "8px 0",
    textAlign: "center",
    cursor: "pointer",
    background: page === id ? "var(--bg)" : "var(--card)",
    color: page === id ? "var(--text)" : "var(--tm)",
    border: "none",
    fontWeight: page === id ? 600 : 400,
    fontFamily: "inherit",
    borderRight: id !== "sku" ? "1px solid var(--border)" : "none"
  });
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      border: "1px solid var(--border)",
      borderRadius: 9,
      overflow: "hidden",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    style: tabStyle("score"),
    onClick: () => onPageChange("score")
  }, "\u7EE9\u6548\u8003\u6838"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    style: tabStyle("sku"),
    onClick: () => onPageChange("sku")
  }, "SKU\u9884\u8B66")), page === "score" ? /*#__PURE__*/React.createElement(PremiumScoreForm, {
    data: data,
    onChange: onChange
  }) : /*#__PURE__*/React.createElement(PremiumSkuForm, {
    week: week,
    data: data,
    skuList: skuList,
    onChange: onChange,
    onSkuListChange: onSkuListChange
  }));
}
const WEEKS = [1, 2, 3, 4];
const KPI_STORAGE_KEY = "kpi-monthly";
const emptyOpsWeek = () => ({
  wstyle: "",
  nsku: "",
  lsku: "",
  selfsku: "",
  aadd: "",
  aout: "",
  atot: "",
  sales: "",
  prate: "",
  acos: "",
  adsp: "",
  ador: "",
  nacos: "",
  perfOk: null,
  sout: "",
  sdays: "",
  perfRemark: "",
  profitRemark: "",
  tnsku: "",
  tsal: "",
  taco: "",
  tadsp: "",
  torder: "",
  tselfsku: "",
  desReview: {
    person: "",
    rating: ""
  }
});
const emptyDesWeek = () => ({
  prem: "",
  std: "",
  vid: "",
  aplus: "",
  dad: "",
  ontime: "",
  demand: "",
  rework: "",
  manualScore: "",
  packagingScore: "",
  incompleteReason: "",
  opsReviews: {}
});

/** 美工自选项：说明书 / 包材设计，每项 1–2 分 */
function desSelfScore(v) {
  const n = parseInt(v, 10);
  return n === 1 || n === 2 ? n : 0;
}
const DES_INCOMPLETE_HINTS = ["单品多变体", "产品复杂", "素材需求变更", "等待运营确认", "拍摄/打样延误"];
function tallyOpsReviews(reviews) {
  const r = reviews || {};
  let good = 0,
    bad = 0;
  Object.values(r).forEach(v => {
    if (v === "good") good++;
    if (v === "bad") bad++;
  });
  return {
    good,
    bad
  };
}
function removeOpsDesReview(items, year, month, opsPerson, week, desPerson) {
  const next = [...items];
  const idx = next.findIndex(r => r.year === year && r.month === month && r.role === "des" && r.person === desPerson);
  if (idx < 0) return next;
  const wk = {
    ...emptyDesWeek(),
    ...(next[idx].weeks?.[week] || {})
  };
  if (!wk.opsReviews?.[opsPerson]) return next;
  const opsReviews = {
    ...wk.opsReviews
  };
  delete opsReviews[opsPerson];
  next[idx] = {
    ...next[idx],
    weeks: {
      ...next[idx].weeks,
      [week]: {
        ...wk,
        opsReviews
      }
    }
  };
  return next;
}
function applyOpsDesReviewToItems(items, year, month, opsPerson, week, desReview, prevDesReview) {
  if (!opsPerson) return items;
  let next = [...items];
  const prevPerson = prevDesReview?.person;
  const newPerson = desReview?.person;
  if (prevPerson && prevPerson !== newPerson) {
    next = removeOpsDesReview(next, year, month, opsPerson, week, prevPerson);
  }
  if (!newPerson) return next;
  let idx = next.findIndex(r => r.year === year && r.month === month && r.role === "des" && r.person === newPerson);
  if (idx < 0) {
    next.push({
      year,
      month,
      role: "des",
      person: newPerson,
      weeks: {}
    });
    idx = next.length - 1;
  }
  const wk = {
    ...emptyDesWeek(),
    ...(next[idx].weeks?.[week] || {})
  };
  const opsReviews = {
    ...(wk.opsReviews || {})
  };
  if (desReview.rating === "good" || desReview.rating === "bad") opsReviews[opsPerson] = desReview.rating;else delete opsReviews[opsPerson];
  next[idx] = {
    ...next[idx],
    weeks: {
      ...next[idx].weeks,
      [week]: {
        ...wk,
        opsReviews
      }
    }
  };
  return next;
}
const emptyDevWeek = () => ({
  tNew: "",
  tSample: "",
  tOrder: "",
  devNew: "",
  sampleIn: "",
  pass: "",
  order: "",
  abn: "",
  abnRemark: ""
});
const emptyDevMonthTargets = () => ({
  tDev: "",
  tSample: "",
  tOrder: ""
});
const KPI_ROLE_META = {
  ops: {
    label: "运营",
    color: "#2d7dd2",
    sumBorder: "#b8d4f0"
  },
  des: {
    label: "美工",
    color: "#6b21a8",
    sumBorder: "#e9d5ff"
  },
  dev: {
    label: "开发",
    color: "#00695c",
    sumBorder: "#99f6e4"
  }
};
function emptyWeekForRole(role) {
  if (role === "ops") return emptyOpsWeek();
  if (role === "ops_jp") return emptyPremiumWeek();
  if (role === "dev") return emptyDevWeek();
  return emptyDesWeek();
}
function getPremiumSkuList(items, year, month, person) {
  return findRecord(items, year, month, "ops_jp", person)?.skuList || [];
}
function opsEffectiveRole(curRole, curOpsSub) {
  if (curRole !== "ops") return curRole;
  return curOpsSub === "premium" ? "ops_jp" : "ops";
}
const num = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const kpiInp = {
  width: "100%",
  fontSize: 13,
  padding: "6px 9px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontFamily: "inherit",
  background: "var(--card)",
  color: "inherit"
};
const kpiInpSm = {
  ...kpiInp,
  fontSize: 12,
  padding: "4px 8px"
};
const kpiLbl = {
  fontSize: 10,
  color: "var(--tm)",
  marginBottom: 4,
  display: "block"
};
const kpiCard = {
  background: "var(--card)",
  border: "1px solid var(--border-light)",
  borderRadius: 16,
  padding: "18px 20px",
  boxShadow: "var(--shadow-card)"
};
const kpiModTitle = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--tm)",
  marginBottom: 8,
  display: "flex",
  alignItems: "center",
  gap: 8
};
const kpiBadge = (bg, color) => ({
  display: "inline-flex",
  fontSize: 10,
  padding: "2px 6px",
  borderRadius: 4,
  background: bg,
  color,
  fontWeight: 500,
  marginTop: 6
});
function findRecord(items, year, month, role, person) {
  return items.find(r => r.year === year && r.month === month && r.role === role && r.person === person);
}
function kpiRecordKey(r) {
  return `${r.year}|${r.month}|${r.role}|${r.person}`;
}

/** 合并考核记录：按周合并，避免 A/B 保存互相覆盖 */
function mergeKpiRecords(cloud, patch) {
  const merged = {
    ...cloud,
    ...patch,
    weeks: {
      ...(cloud?.weeks || {}),
      ...(patch?.weeks || {})
    }
  };
  if (patch?.monthTargets !== undefined) merged.monthTargets = patch.monthTargets;
  if (patch?.skuList !== undefined) merged.skuList = patch.skuList;
  return merged;
}
function upsertKpiRecord(items, patch) {
  const key = kpiRecordKey(patch);
  const next = [...items];
  const idx = next.findIndex(r => kpiRecordKey(r) === key);
  if (idx < 0) {
    next.push({
      ...patch,
      weeks: patch.weeks || {}
    });
  } else {
    next[idx] = mergeKpiRecords(next[idx], patch);
  }
  return next;
}
function getWeekData(items, year, month, role, person, week) {
  const rec = findRecord(items, year, month, role, person);
  const w = rec?.weeks?.[week];
  const base = emptyWeekForRole(role);
  if (!w) return base;
  const merged = {
    ...base,
    ...w
  };
  if (base.desReview) merged.desReview = {
    ...base.desReview,
    ...(w.desReview || {})
  };
  return merged;
}
function hydrateOpsDesReview(items, year, month, opsPerson, week, desReview) {
  const cur = {
    ...emptyOpsWeek().desReview,
    ...desReview
  };
  if (cur.person && cur.rating) return cur;
  for (const rec of items) {
    if (rec.role !== "des" || rec.year !== year || rec.month !== month) continue;
    const rating = rec.weeks?.[week]?.opsReviews?.[opsPerson];
    if (rating) return {
      person: rec.person,
      rating
    };
  }
  return cur;
}
function getDevMonthTargets(items, year, month, person) {
  const rec = findRecord(items, year, month, "dev", person);
  return {
    ...emptyDevMonthTargets(),
    ...(rec?.monthTargets || {})
  };
}
function calcOpsSummary(w) {
  const add = num(w.aadd),
    out = num(w.aout),
    net = add - out;
  const sales = num(w.sales),
    rate = parseFloat(w.prate);
  const wstyle = num(w.wstyle),
    nsku = num(w.nsku),
    acos = parseFloat(w.acos),
    sout = num(w.sout);
  return {
    net,
    sales,
    rate: Number.isFinite(rate) ? rate : null,
    wstyle,
    nsku,
    acos: Number.isFinite(acos) ? acos : null,
    sout,
    sdays: parseFloat(w.sdays)
  };
}
function calcDesSummary(w) {
  const prem = num(w.prem),
    std = num(w.std),
    aplus = num(w.aplus);
  const imgPts = prem * 5 + std;
  const imgTotal = imgPts + aplus * 0.5;
  const vid = num(w.vid);
  const vidPts = vid * 2;
  const manualPts = desSelfScore(w.manualScore);
  const packagingPts = desSelfScore(w.packagingScore);
  const extraPts = manualPts + packagingPts;
  const outputPts = Math.round((imgTotal + vidPts + extraPts) * 10) / 10;
  const ot = num(w.ontime),
    dm = num(w.demand);
  const {
    good: goodReviews,
    bad: badReviews
  } = tallyOpsReviews(w.opsReviews);
  const desReviewPts = goodReviews - badReviews;
  return {
    imgPts,
    aplusPts: aplus * 0.5,
    total: imgTotal,
    vid,
    vidPts,
    manualPts,
    packagingPts,
    extraPts,
    outputPts,
    goodReviews,
    badReviews,
    desReviewPts,
    quotaOk: outputPts >= 5,
    aplus,
    rework: num(w.rework),
    rate: dm > 0 ? Math.round(ot / dm * 100) : null
  };
}

/** 利润率得分（50 分）：≥15% 足分 · 10–15% 20 分 · 2–10% 10 分 · <2% 0 分 */
function calcProfitMarginScore(rate) {
  if (!Number.isFinite(rate)) return 0;
  if (rate >= 15) return 50;
  if (rate >= 10) return 20;
  if (rate >= 2) return 10;
  return 0;
}
function profitMarginTierLabel(rate) {
  if (!Number.isFinite(rate)) return "未填";
  if (rate >= 15) return "≥15% 足分";
  if (rate >= 10) return "10–15%";
  if (rate >= 2) return "2–10%";
  return "<2%";
}
function profitRateCls(rate) {
  if (!Number.isFinite(rate)) return "";
  if (rate >= 15) return "g";
  if (rate >= 10) return "a";
  if (rate >= 2) return "a";
  return "r";
}

/** 运营周考核：下单款数 50% + 利润率 50% */
function calcOpsWeeklyScore(w) {
  const orderCount = num(w.lsku);
  const target = num(w.torder) || num(w.tnsku) || 1;
  const rate = parseFloat(w.prate);
  const hasRate = Number.isFinite(rate);
  const orderPct = Math.min(1, orderCount / target);
  const orderScore = orderPct * 50;
  const profitMarginScore = calcProfitMarginScore(rate);
  const total = Math.round((orderScore + profitMarginScore) * 10) / 10;
  return {
    orderCount,
    target,
    orderScore: Math.round(orderScore * 10) / 10,
    profitMarginScore,
    profitMarginTier: hasRate ? profitMarginTierLabel(rate) : null,
    total,
    rate: hasRate ? rate : null
  };
}
function weekHasOpsData(w) {
  if (["wstyle", "nsku", "lsku", "selfsku", "sales", "prate", "acos", "adsp", "sout"].some(k => w[k] !== "" && w[k] != null)) return true;
  if (w.desReview?.person && w.desReview?.rating) return true;
  return false;
}
function weekHasDesData(w) {
  if (["prem", "std", "vid", "aplus", "incompleteReason", "manualScore", "packagingScore"].some(k => w[k] !== "" && w[k] != null)) return true;
  return Object.keys(w.opsReviews || {}).length > 0;
}
function weekHasDevData(w) {
  return ["devNew", "sampleIn", "order", "pass", "abn"].some(k => w[k] !== "" && w[k] != null);
}
function kpiDevProgress(actual, target) {
  const a = num(actual),
    t = num(target);
  if (t <= 0) return {
    pct: 0,
    color: "var(--tm)",
    text: "待填写目标",
    cls: ""
  };
  const pct = Math.min(100, Math.round(a / t * 100));
  const color = pct >= 100 ? "#2d9e52" : pct >= 60 ? "#e09000" : "#e55";
  const cls = pct >= 100 ? "g" : pct >= 60 ? "a" : "r";
  return {
    pct,
    color,
    cls,
    text: `${a}/${t}款  ${pct}%${pct >= 100 ? " ✓" : ""}`,
    rateText: `${pct}%`
  };
}
function calcDevSummary(w) {
  const devNew = num(w.devNew),
    sampleIn = num(w.sampleIn),
    pass = num(w.pass);
  const order = num(w.order),
    abn = num(w.abn);
  const pNew = kpiDevProgress(devNew, w.tNew);
  const pSample = kpiDevProgress(sampleIn, w.tSample);
  const pOrder = kpiDevProgress(order, w.tOrder);
  return {
    devNew,
    sampleIn,
    pass,
    order,
    abn,
    pNew,
    pSample,
    pOrder
  };
}
function SummaryBar({
  items,
  role
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit,minmax(90px,1fr))",
      gap: 10,
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "12px 14px",
      marginBottom: 14
    }
  }, items.map(it => /*#__PURE__*/React.createElement("div", {
    key: it.label,
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      color: it.color || "var(--text)"
    }
  }, it.value), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginTop: 2
    }
  }, it.label))));
}
function DesHeartBtn({
  active,
  kind,
  onClick
}) {
  const isGood = kind === "good";
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClick,
    title: isGood ? "好评" : "差评",
    style: {
      width: 34,
      height: 34,
      borderRadius: 8,
      cursor: "pointer",
      fontFamily: "inherit",
      fontSize: 18,
      border: `1px solid ${active ? isGood ? "#fca5a5" : "var(--border)" : "var(--border)"}`,
      background: active ? isGood ? "#fef2f2" : "var(--bg)" : "var(--card)",
      color: isGood ? active ? "#e11d48" : "#fda4af" : active ? "#9ca3af" : "#d1d5db",
      opacity: active ? 1 : 0.85,
      lineHeight: 1
    }
  }, isGood ? "♥" : "💔");
}
function OpsDesReviewSection({
  data,
  onChange,
  desStaff = [],
  opsPerson = "",
  viewerName = ""
}) {
  const isSelf = Boolean(viewerName && opsPerson && viewerName === opsPerson);
  if (!isSelf) return null;
  const review = data.desReview || {
    person: "",
    rating: ""
  };
  const setReview = patch => onChange({
    ...data,
    desReview: {
      ...review,
      ...patch
    }
  });
  const setRating = rating => {
    if (!review.person) return;
    setReview({
      rating: review.rating === rating ? "" : rating
    });
  };
  return /*#__PURE__*/React.createElement(Section, {
    title: "\u7F8E\u5DE5\u8BC4\u4EF7\uFF08\u533F\u540D\uFF09"
  }, /*#__PURE__*/React.createElement("div", {
    style: kpiCard
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginBottom: 10
    }
  }, "\u6BCF\u4F4D\u8FD0\u8425\u6BCF\u5468\u53EF\u8BC4\u4EF7 ", /*#__PURE__*/React.createElement("strong", null, "1 \u4F4D"), " \u7F8E\u5DE5\uFF1A\u2665 \u7F8E\u5DE5 +1 \u5206 \xB7 \uD83D\uDC94 \u7F8E\u5DE5 \u22121 \u5206\u3002\u7F8E\u5DE5\u7AEF\u4EC5\u663E\u793A\u6C47\u603B\uFF0C\u4E0D\u663E\u793A\u8BC4\u4EF7\u4EBA\u59D3\u540D\u3002"), desStaff.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#e09000"
    }
  }, "\u6682\u65E0\u7F8E\u5DE5\u4EBA\u5458 \xB7 \u8BF7\u5728 \u2699 \u8BBE\u7F6E\u4E2D\u6DFB\u52A0\uFF08\u89D2\u8272\u9009\u300C\u7F8E\u5DE5\u300D\uFF09") : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 10,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, "\u672C\u5468\u8BC4\u4EF7\u7F8E\u5DE5"), /*#__PURE__*/React.createElement("select", {
    style: {
      ...kpiInpSm,
      minWidth: 140,
      background: "var(--card)"
    },
    value: review.person,
    onChange: e => setReview({
      person: e.target.value,
      rating: ""
    })
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "\u8BF7\u9009\u62E9"), desStaff.map(d => /*#__PURE__*/React.createElement("option", {
    key: d.name,
    value: d.name
  }, d.name))), /*#__PURE__*/React.createElement(DesHeartBtn, {
    kind: "good",
    active: review.rating === "good",
    onClick: () => setRating("good")
  }), /*#__PURE__*/React.createElement(DesHeartBtn, {
    kind: "bad",
    active: review.rating === "bad",
    onClick: () => setRating("bad")
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, review.rating === "good" ? "已评：美工 +1" : review.rating === "bad" ? "已评：美工 −1" : review.person ? "请选择好评或差评" : "请先选择美工"))));
}
function OpsWeekForm({
  week,
  data,
  onChange,
  desStaff = [],
  opsPerson = "",
  viewerName = ""
}) {
  const set = (k, v) => onChange({
    ...data,
    [k]: v
  });
  const s = calcOpsSummary(data);
  const score = calcOpsWeeklyScore(data);
  const net = s.net;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(OpsScorePanel, {
    score: score
  }), /*#__PURE__*/React.createElement(SummaryBar, {
    items: [{
      label: "周销售额($)",
      value: s.sales > 0 ? `$${Math.round(s.sales).toLocaleString()}` : "—",
      color: "#2d9e52"
    }, {
      label: "利润率",
      value: s.rate != null ? `${s.rate.toFixed(1)}%` : "—",
      color: s.rate != null ? s.rate >= 15 ? "#2d9e52" : s.rate >= 10 ? "#e09000" : s.rate >= 2 ? "#e09000" : "#e55" : undefined
    }, {
      label: "周开款",
      value: s.wstyle || "—"
    }, {
      label: "周上架新品",
      value: s.nsku || "—"
    }, {
      label: "A品净变化",
      value: net !== 0 ? `${net >= 0 ? "+" : ""}${net}` : "—",
      color: net > 0 ? "#2d9e52" : net < 0 ? "#e55" : undefined
    }, {
      label: "整体ACOS",
      value: s.acos != null ? `${s.acos}%` : "—"
    }, {
      label: "A品断货天",
      value: String(s.sout),
      color: s.sout === 0 ? "#2d9e52" : "#e55"
    }]
  }), /*#__PURE__*/React.createElement(Section, {
    title: "\u4E0A\u65B0"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u5F00\u6B3E\uFF08\u8FD0\u8425\uFF09",
    hint: "\u5468\u5F00\u6B3E\u6570\u91CF\uFF08\u8FD0\u8425\uFF09"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.wstyle,
    onChange: v => set("wstyle", v),
    unit: "\u6B3E"
  })), /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u4E0A\u67B6\u65B0\u54C1 / LISTED SKU",
    hint: "\u5468\u4E0A\u67B6\u65B0\u54C1\u6570\u91CF"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.nsku,
    onChange: v => set("nsku", v),
    unit: "SKU"
  }), /*#__PURE__*/React.createElement(TargetRow, {
    label: "\u8BA1\u5212\u76EE\u6807",
    value: data.tnsku,
    onChange: v => set("tnsku", v),
    unit: "SKU"
  })), /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u843D\u5730 / LAUNCH",
    hint: "\u672C\u5468\u4E0B\u5355\u6B3E\u6570\uFF08\u4E0B\u5927\u8D27\uFF09"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.lsku,
    onChange: v => set("lsku", v),
    unit: "\u6B3E"
  }), /*#__PURE__*/React.createElement(TargetRow, {
    label: "\u4E0B\u5355\u76EE\u6807",
    value: data.torder,
    onChange: v => set("torder", v),
    unit: "\u6B3E"
  }), /*#__PURE__*/React.createElement("span", {
    style: kpiBadge("#eef6ff", "#2d7dd2")
  }, "\u8003\u6838\u6743\u91CD 50%")), /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u81EA\u5F00 / SELF OPEN",
    hint: "\u672C\u5468\u4E0B\u5355\u6B3E\u6570\uFF08\u8FD0\u8425\u81EA\u5F00\uFF09"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.selfsku,
    onChange: v => set("selfsku", v),
    unit: "\u6B3E"
  }), /*#__PURE__*/React.createElement(TargetRow, {
    label: "\u81EA\u5F00\u76EE\u6807",
    value: data.tselfsku,
    onChange: v => set("tselfsku", v),
    unit: "\u6B3E"
  })))), /*#__PURE__*/React.createElement(Section, {
    title: "A \u54C1\u7BA1\u7406"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(FieldCard, {
    label: "A\u54C1 / ADD",
    hint: "\u672C\u5468\u65B0\u589E A \u54C1\u6570"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.aadd,
    onChange: v => set("aadd", v),
    unit: "\u4E2A"
  }), /*#__PURE__*/React.createElement("span", {
    style: kpiBadge("#d4f0dc", "#2d9e52")
  }, "\u65B0\u589E +1 \u5206")), /*#__PURE__*/React.createElement(FieldCard, {
    label: "A\u54C1 / OUT",
    hint: "\u672C\u5468\u9000\u51FA A \u54C1\u6570"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.aout,
    onChange: v => set("aout", v),
    unit: "\u4E2A"
  }), /*#__PURE__*/React.createElement("span", {
    style: kpiBadge("#fee2e2", "#e55")
  }, "\u9000\u51FA \u22121 \u5206")), /*#__PURE__*/React.createElement(FieldCard, {
    label: "A\u54C1 / NET\uFF08\u81EA\u52A8\uFF09",
    hint: "A \u54C1\u51C0\u53D8\u5316"
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...kpiInp,
      opacity: 0.7
    },
    readOnly: true,
    value: net
  })), /*#__PURE__*/React.createElement(FieldCard, {
    label: "A\u54C1 / TOTAL",
    hint: "A \u54C1\u603B\u6570\uFF08\u5468\u672B\u5FEB\u7167\uFF09"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.atot,
    onChange: v => set("atot", v),
    unit: "\u4E2A"
  })))), /*#__PURE__*/React.createElement(Section, {
    title: "\u9500\u552E\u989D\u4E0E\u5229\u6DA6"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u9500\u552E / SALES",
    hint: "\u5468\u9500\u552E\u989D"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.sales,
    onChange: v => set("sales", v),
    unit: "USD"
  }), /*#__PURE__*/React.createElement(TargetRow, {
    label: "\u76EE\u6807",
    value: data.tsal,
    onChange: v => set("tsal", v),
    unit: "USD"
  })), /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u5229\u6DA6 / PROFIT",
    hint: "\u5229\u6DA6\u7387\uFF08\u8003\u6838 50 \u5206\uFF1A\u226515% \u8DB3\u5206 \xB7 10\u201315% 20 \xB7 2\u201310% 10 \xB7 <2% 0\uFF09"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.prate,
    onChange: v => set("prate", v),
    unit: "%",
    step: "0.1"
  }), score.rate != null && /*#__PURE__*/React.createElement("span", {
    style: kpiBadge(score.profitMarginScore >= 50 ? "#d4f0dc" : score.profitMarginScore >= 20 ? "#fff0d4" : score.profitMarginScore > 0 ? "#fff8e6" : "#fee2e2", score.profitMarginScore >= 50 ? "#2d9e52" : score.profitMarginScore >= 20 ? "#e09000" : score.profitMarginScore > 0 ? "#e09000" : "#e55")
  }, score.profitMarginTier, " \u2192 ", score.profitMarginScore, "\u5206"), s.rate != null && s.rate < 15 && /*#__PURE__*/React.createElement("textarea", {
    style: {
      ...kpiInp,
      marginTop: 6,
      minHeight: 40,
      fontSize: 11
    },
    value: data.profitRemark,
    onChange: e => set("profitRemark", e.target.value),
    placeholder: "\u4F4E\u4E8E 15% \u8BF7\u8BF4\u660E\u539F\u56E0\u2026"
  })))), /*#__PURE__*/React.createElement(Section, {
    title: "\u5E7F\u544A"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u5E7F\u544A / ACOS",
    hint: "\u6574\u4F53 ACOS"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.acos,
    onChange: v => set("acos", v),
    unit: "%",
    step: "0.1"
  }), /*#__PURE__*/React.createElement(TargetRow, {
    label: "\u76EE\u6807 \u2264",
    value: data.taco,
    onChange: v => set("taco", v),
    unit: "%"
  })), /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u5E7F\u544A / SPEND",
    hint: "\u5E7F\u544A\u603B\u82B1\u8D39"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.adsp,
    onChange: v => set("adsp", v),
    unit: "USD"
  }), /*#__PURE__*/React.createElement(TargetRow, {
    label: "\u5468\u9884\u7B97",
    value: data.tadsp,
    onChange: v => set("tadsp", v),
    unit: "USD"
  })), /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u5E7F\u544A / ORDERS",
    hint: "\u5E7F\u544A\u5E26\u6765\u8BA2\u5355\u6570"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.ador,
    onChange: v => set("ador", v),
    unit: "\u5355"
  })), /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u65B0\u54C1\u5E7F\u544A / NEW ACOS",
    hint: "\u65B0\u54C1\u5E7F\u544A ACOS"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.nacos,
    onChange: v => set("nacos", v),
    unit: "%",
    step: "0.1"
  })))), /*#__PURE__*/React.createElement(OpsDesReviewSection, {
    data: data,
    onChange: onChange,
    desStaff: desStaff,
    opsPerson: opsPerson,
    viewerName: viewerName
  }), /*#__PURE__*/React.createElement(Section, {
    title: "\u8D26\u53F7\u5065\u5EB7\uFF08FBA\uFF09"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u7EE9\u6548 / PERFORMANCE",
    hint: "\u7EE9\u6548\u6307\u6807\u672C\u5468\u662F\u5426\u8FBE\u6807",
    danger: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 5,
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement(PerfBtn, {
    ok: true,
    selected: data.perfOk === true,
    onClick: () => set("perfOk", true)
  }, "\u2713 \u8FBE\u6807"), /*#__PURE__*/React.createElement(PerfBtn, {
    ok: false,
    selected: data.perfOk === false,
    onClick: () => set("perfOk", false)
  }, "\u2717 \u89E6\u7EA2\u7EBF")), data.perfOk === false && /*#__PURE__*/React.createElement("textarea", {
    style: {
      ...kpiInp,
      marginTop: 6,
      minHeight: 40,
      fontSize: 11
    },
    value: data.perfRemark,
    onChange: e => set("perfRemark", e.target.value),
    placeholder: "\u89E6\u7EA2\u7EBF\u8BF7\u586B\u5199\u8BF4\u660E\u2026"
  })), /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u65AD\u8D27 / STOCKOUT",
    hint: "A \u54C1\u65AD\u8D27\u5929\u6570",
    danger: true
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.sout,
    onChange: v => set("sout", v),
    unit: "\u5929"
  })), /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u9884\u8B66 / STOCK DAYS",
    hint: "A \u54C1\u6700\u4F4E\u53EF\u552E\u5929\u6570"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.sdays,
    onChange: v => set("sdays", v),
    unit: "\u5929"
  }), Number.isFinite(s.sdays) && s.sdays > 0 && /*#__PURE__*/React.createElement("span", {
    style: kpiBadge(s.sdays < 30 ? "#fee2e2" : s.sdays < 45 ? "#fff0d4" : "#d4f0dc", s.sdays < 30 ? "#e55" : s.sdays < 45 ? "#e09000" : "#2d9e52")
  }, s.sdays < 30 ? `⚠ 仅${s.sdays}天` : s.sdays < 45 ? `注意${s.sdays}天` : `✓ 充裕${s.sdays}天`)))));
}
function DesSelfScorePicker({
  label,
  hint,
  value,
  onChange
}) {
  const opts = [{
    v: "",
    label: "未做"
  }, {
    v: "1",
    label: "1 分"
  }, {
    v: "2",
    label: "2 分"
  }];
  return /*#__PURE__*/React.createElement(FieldCard, {
    label: label,
    hint: hint,
    accent: "#6b21a8"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginTop: 4,
      flexWrap: "wrap"
    }
  }, opts.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.v || "none",
    type: "button",
    onClick: () => onChange(o.v),
    style: {
      padding: "5px 12px",
      borderRadius: 7,
      cursor: "pointer",
      fontFamily: "inherit",
      fontSize: 12,
      border: `1px solid ${value === o.v ? "#6b21a8" : "var(--border)"}`,
      background: value === o.v ? "#f3e8ff" : "var(--card)",
      color: value === o.v ? "#6b21a8" : "var(--tm)",
      fontWeight: value === o.v ? 600 : 400
    }
  }, o.label))), /*#__PURE__*/React.createElement("span", {
    style: kpiBadge("#f3e8ff", "#6b21a8")
  }, "\u81EA\u9009 1\u20132 \u5206 \xB7 \u8BA1\u5165\u5468\u4EA7\u51FA"));
}
function DesWeekForm({
  week,
  data,
  onChange
}) {
  const set = (k, v) => onChange({
    ...data,
    [k]: v
  });
  const s = calcDesSummary(data);
  const needsReason = !s.quotaOk;
  const desReviewFmt = s.desReviewPts > 0 ? `+${s.desReviewPts}` : s.desReviewPts < 0 ? String(s.desReviewPts) : "0";
  const appendHint = hint => {
    const cur = data.incompleteReason || "";
    set("incompleteReason", cur ? `${cur}；${hint}` : hint);
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SummaryBar, {
    items: [{
      label: "考核产出分",
      value: s.outputPts > 0 ? s.outputPts.toFixed(1) : "—",
      color: s.quotaOk ? "#2d9e52" : s.outputPts > 0 ? "#e09000" : undefined
    }, {
      label: "图片当量",
      value: s.total > 0 ? s.total.toFixed(1) : "—"
    }, {
      label: "视频分",
      value: s.vidPts > 0 ? String(s.vidPts) : "—",
      color: s.vidPts > 0 ? "#6b21a8" : undefined
    }, {
      label: "美工评价分",
      value: s.desReviewPts !== 0 ? desReviewFmt : "—",
      color: s.desReviewPts > 0 ? "#6b21a8" : s.desReviewPts < 0 ? "#9ca3af" : undefined
    }, {
      label: "图片当量分",
      value: s.imgPts || "—"
    }, {
      label: "A+当量分",
      value: s.aplusPts > 0 ? s.aplusPts.toFixed(1) : "—",
      color: s.aplusPts > 0 ? "#6b21a8" : undefined
    }, {
      label: "视频(条)",
      value: s.vid || "—"
    }, {
      label: "说明书",
      value: s.manualPts ? `${s.manualPts}分` : "—",
      color: s.manualPts ? "#6b21a8" : undefined
    }, {
      label: "包材设计",
      value: s.packagingPts ? `${s.packagingPts}分` : "—",
      color: s.packagingPts ? "#6b21a8" : undefined
    }, {
      label: "A+完成数",
      value: s.aplus || "—"
    }, {
      label: "按时交付率",
      value: s.rate != null ? `${s.rate}%` : "—",
      color: s.rate != null && s.rate >= 90 ? "#2d9e52" : s.rate != null && s.rate >= 70 ? "#e09000" : s.rate != null ? "#e55" : undefined
    }, {
      label: "返工次数",
      value: String(s.rework),
      color: s.rework > 0 ? "#e55" : undefined
    }]
  }), /*#__PURE__*/React.createElement(Section, {
    title: "\u56FE\u7247\u4EA7\u51FA\uFF08\u7CBE\u54C1 1\u5F20 = \u7CBE\u94FA 5\u5F20\uFF09"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u7CBE\u54C1\u56FE / PREMIUM",
    hint: "\u7CBE\u54C1\u56FE\u5B8C\u6210\u6570",
    accent: "#6b21a8"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.prem,
    onChange: v => set("prem", v),
    unit: "\u5F20"
  }), /*#__PURE__*/React.createElement(QuotaBox, {
    outputPts: s.outputPts,
    imgPts: s.imgPts,
    aplusPts: s.aplusPts,
    vidPts: s.vidPts,
    manualPts: s.manualPts,
    packagingPts: s.packagingPts,
    prem: num(data.prem) * 5,
    std: num(data.std)
  })), /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u7CBE\u94FA\u56FE / STANDARD",
    hint: "\u7CBE\u94FA\u56FE\u5B8C\u6210\u6570"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.std,
    onChange: v => set("std", v),
    unit: "\u5F20"
  })))), /*#__PURE__*/React.createElement(Section, {
    title: "\u89C6\u9891"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u89C6\u9891 / VIDEO",
    hint: "\u89C6\u9891\u5B8C\u6210\u6570\uFF08\u6BCF\u6761\u8BA1 2 \u5206\uFF09"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.vid,
    onChange: v => set("vid", v),
    unit: "\u6761"
  }), /*#__PURE__*/React.createElement("span", {
    style: kpiBadge("#f3e8ff", "#6b21a8")
  }, "1 \u6761 = 2 \u5206")))), /*#__PURE__*/React.createElement(Section, {
    title: "\u8BF4\u660E\u4E66\u4E0E\u5305\u6750\uFF08\u81EA\u9009\u8BA1\u5206\uFF09"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(DesSelfScorePicker, {
    label: "\u8BF4\u660E\u4E66 / MANUAL",
    hint: "\u672C\u5468\u8BF4\u660E\u4E66\u8BBE\u8BA1\u5DE5\u4F5C\u91CF\uFF0C\u81EA\u9009 1\u20132 \u5206",
    value: data.manualScore || "",
    onChange: v => set("manualScore", v)
  }), /*#__PURE__*/React.createElement(DesSelfScorePicker, {
    label: "\u5305\u6750\u8BBE\u8BA1 / PACKAGING",
    hint: "\u672C\u5468\u5305\u6750\u8BBE\u8BA1\u5DE5\u4F5C\u91CF\uFF0C\u81EA\u9009 1\u20132 \u5206",
    value: data.packagingScore || "",
    onChange: v => set("packagingScore", v)
  }))), /*#__PURE__*/React.createElement(Section, {
    title: "\u5176\u4ED6\u4EA4\u4ED8"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(FieldCard, {
    label: "A+ / EBC",
    hint: "A+ \u5B8C\u6210\u6570"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.aplus,
    onChange: v => set("aplus", v),
    unit: "\u5957"
  }), /*#__PURE__*/React.createElement("span", {
    style: kpiBadge("#f3e8ff", "#6b21a8")
  }, "1 \u5957 = 0.5 \u5F53\u91CF\u5206")), /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u5E7F\u544A\u7D20\u6750 / AD ASSETS",
    hint: "\u5E7F\u544A\u7D20\u6750\u5B8C\u6210\u6570"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.dad,
    onChange: v => set("dad", v),
    unit: "\u4EF6"
  })), /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u4EA4\u4ED8 / ON-TIME",
    hint: "\u6309\u65F6\u4EA4\u4ED8\u7387"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...kpiInpSm,
      width: 66
    },
    type: "number",
    placeholder: "\u51C6\u65F6",
    value: data.ontime,
    onChange: e => set("ontime", e.target.value)
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, "/"), /*#__PURE__*/React.createElement("input", {
    style: {
      ...kpiInpSm,
      width: 66
    },
    type: "number",
    placeholder: "\u603B\u9700\u6C42",
    value: data.demand,
    onChange: e => set("demand", e.target.value)
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, "= ", s.rate != null ? `${s.rate}%` : "—"))), /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u8FD4\u5DE5 / REWORK",
    hint: "\u8FD4\u5DE5\u6B21\u6570\uFF08\u5927\u6539\u91CD\u505A\uFF09"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.rework,
    onChange: v => set("rework", v),
    unit: "\u6B21"
  })))), /*#__PURE__*/React.createElement(Section, {
    title: "\u8003\u6838\u672A\u5B8C\u6210\u8BF4\u660E"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...kpiCard,
      borderColor: needsReason && !data.incompleteReason ? "#e9d5ff" : "var(--border)",
      background: needsReason && !data.incompleteReason ? "#faf5ff" : "var(--card)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: needsReason ? "#6b21a8" : "var(--tm)",
      marginBottom: 8,
      fontWeight: needsReason ? 600 : 400
    }
  }, needsReason ? "本周考核产出未达 5 分（图片 + 视频 + 说明书/包材自选），请说明原因" : "如本周未达标，请在此说明原因（如单品多变体、产品复杂等）"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      marginBottom: 8
    }
  }, DES_INCOMPLETE_HINTS.map(h => /*#__PURE__*/React.createElement("button", {
    key: h,
    type: "button",
    onClick: () => appendHint(h),
    style: {
      fontSize: 11,
      padding: "3px 10px",
      borderRadius: 99,
      cursor: "pointer",
      fontFamily: "inherit",
      border: "1px solid #e9d5ff",
      background: "#f3e8ff",
      color: "#6b21a8"
    }
  }, "+ ", h))), /*#__PURE__*/React.createElement("textarea", {
    style: {
      ...kpiInp,
      minHeight: 72,
      fontSize: 12,
      resize: "vertical"
    },
    value: data.incompleteReason || "",
    onChange: e => set("incompleteReason", e.target.value),
    placeholder: "\u5982\uFF1A\u672C\u5468 2 \u6B3E\u5747\u4E3A\u5355\u54C1 8 \u53D8\u4F53\uFF0C\u4E3B\u56FE+A+ \u5DE5\u4F5C\u91CF\u8D85\u9884\u671F\u2026"
  }))), /*#__PURE__*/React.createElement(Section, {
    title: "\u8FD0\u8425\u5BF9\u7F8E\u5DE5\u8BC4\u4EF7\uFF08\u533F\u540D\uFF09"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...kpiCard,
      marginBottom: 10,
      background: "linear-gradient(135deg,#faf5ff,#fff)",
      borderColor: "#e9d5ff"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: "#6b21a8",
      marginBottom: 4
    }
  }, "\u7F8E\u5DE5\u672C\u5468\u8BC4\u4EF7\u52A0\u51CF\u5206"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 700,
      color: s.desReviewPts > 0 ? "#6b21a8" : s.desReviewPts < 0 ? "#9ca3af" : "var(--text)"
    }
  }, s.desReviewPts !== 0 ? desReviewFmt : "0", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 500,
      color: "var(--tm)",
      marginLeft: 6
    }
  }, "\u5206\uFF08\u8FD0\u8425\u8BC4\xB7\u8BA1\u5165\u7F8E\u5DE5\uFF09"))), /*#__PURE__*/React.createElement("div", {
    style: {
      ...kpiCard,
      fontSize: 11,
      color: "var(--tm)"
    }
  }, "\u8BC4\u4EF7\u7531\u8FD0\u8425\u5728 ", /*#__PURE__*/React.createElement("strong", null, "\u8FD0\u8425 \u2192 \u7CBE\u94FA"), " \u8003\u6838\u9875\u533F\u540D\u63D0\u4EA4\uFF1B\u6B64\u5904\u4EC5\u663E\u793A\u52A0\u51CF\u5206\u5408\u8BA1\uFF0C\u4E0D\u663E\u793A\u8BC4\u4EF7\u4EBA\u53CA\u597D\u8BC4/\u5DEE\u8BC4\u6761\u6570\u3002")));
}
function OpsScorePanel({
  score
}) {
  const color = score.total >= 80 ? "#2d9e52" : score.total >= 60 ? "#e09000" : score.total > 0 ? "#e55" : "var(--text)";
  const items = [{
    label: "下单款数",
    pct: "50%",
    value: `${score.orderScore}分`,
    sub: `${score.orderCount}/${score.target}款`
  }, {
    label: "利润率",
    pct: "50%",
    value: `${score.profitMarginScore}分`,
    sub: score.rate != null ? `${score.rate.toFixed(1)}% · ${score.profitMarginTier}` : "未填"
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "linear-gradient(135deg,#eef6ff,#f8fbff)",
      border: "1px solid #b8d4f0",
      borderRadius: 10,
      padding: "12px 14px",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
      flexWrap: "wrap",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: "#2d7dd2"
    }
  }, "\u672C\u5468\u8003\u6838\u5F97\u5206"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 700,
      color
    }
  }, score.total, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 500,
      color: "var(--tm)"
    }
  }, " / 100"))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginBottom: 8
    }
  }, "\u5229\u6DA6\u7387\uFF1A\u226515% 50\u5206 \xB7 10\u201315% 20\u5206 \xB7 2\u201310% 10\u5206 \xB7 <2% 0\u5206"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(2,1fr)",
      gap: 8
    }
  }, items.map(it => /*#__PURE__*/React.createElement("div", {
    key: it.label,
    style: {
      background: "var(--card)",
      borderRadius: 8,
      padding: "8px 10px",
      border: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)"
    }
  }, it.label, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#2d7dd2"
    }
  }, it.pct)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      marginTop: 2
    }
  }, it.value), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginTop: 2
    }
  }, it.sub)))));
}
function QuotaBox({
  outputPts,
  imgPts,
  aplusPts,
  vidPts,
  manualPts = 0,
  packagingPts = 0,
  prem,
  std
}) {
  const pct = Math.min(100, Math.round(outputPts / 5 * 100));
  const barColor = outputPts >= 5 ? "#2d9e52" : outputPts > 0 ? "#e09000" : "var(--border)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      background: "var(--bg)",
      borderRadius: 6,
      padding: "9px 11px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginBottom: 4
    }
  }, "\u5468\u8003\u6838 5 \u5206\u5236 \xB7 \u7CBE\u54C1\xD75 + \u7CBE\u94FA\xD71 + A+\xD70.5 + \u89C6\u9891\xD72 + \u8BF4\u660E\u4E66/\u5305\u6750\u81EA\u9009(\u54041\u20132)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: outputPts >= 5 ? "#2d9e52" : "var(--text)"
    }
  }, Number(outputPts.toFixed(1)), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 400,
      color: "var(--tm)"
    }
  }, "/ 5")), (imgPts > 0 || aplusPts > 0 || vidPts > 0 || manualPts > 0 || packagingPts > 0) && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginTop: 4
    }
  }, "\u56FE\u7247 ", imgPts, " \u5206", aplusPts > 0 ? ` + A+ ${aplusPts.toFixed(1)} 分` : "", vidPts > 0 ? ` + 视频 ${vidPts} 分` : "", manualPts > 0 ? ` + 说明书 ${manualPts} 分` : "", packagingPts > 0 ? ` + 包材 ${packagingPts} 分` : ""), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--border)",
      borderRadius: 99,
      height: 4,
      marginTop: 6,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${pct}%`,
      height: "100%",
      background: barColor,
      borderRadius: 99,
      transition: "width 0.2s"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: outputPts >= 5 ? "#2d9e52" : outputPts > 0 ? "#e09000" : "var(--tm)",
      marginTop: 4
    }
  }, outputPts >= 5 ? `✓ 达标（超出${(outputPts - 5).toFixed(1)}分）` : outputPts > 0 ? `进行中，还差${(5 - outputPts).toFixed(1)}分` : "尚未开始"));
}
function Section({
  title,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: kpiModTitle
  }, title, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      height: 1,
      background: "var(--border)"
    }
  })), children);
}
function FieldCard({
  label,
  hint,
  children,
  danger,
  accent,
  teal
}) {
  const border = danger ? "#fecaca" : teal ? "#99f6e4" : accent ? "#e9d5ff" : "var(--border)";
  const bg = danger ? "#fef2f2" : teal ? "#f0fdfa" : accent ? "#faf5ff" : "var(--card)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...kpiCard,
      borderColor: border,
      background: bg
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginBottom: 2
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 500,
      marginBottom: 8,
      lineHeight: 1.4
    }
  }, hint), children);
}
function NumInput({
  value,
  onChange,
  unit,
  step
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "number",
    style: kpiInp,
    value: value,
    step: step || "1",
    min: "0",
    onChange: e => onChange(e.target.value),
    placeholder: "0"
  }), unit && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      whiteSpace: "nowrap"
    }
  }, unit));
}
function TargetRow({
  label,
  value,
  onChange,
  unit
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginTop: 5,
      display: "flex",
      alignItems: "center",
      gap: 4
    }
  }, label, "\uFF1A", /*#__PURE__*/React.createElement("input", {
    type: "number",
    style: {
      ...kpiInpSm,
      width: 55,
      borderStyle: "dashed"
    },
    value: value,
    onChange: e => onChange(e.target.value),
    placeholder: "\u2014"
  }), unit);
}
function PerfBtn({
  ok,
  selected,
  onClick,
  children
}) {
  const color = ok ? "#2d9e52" : "#e55";
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClick,
    style: {
      fontSize: 11,
      padding: "3px 9px",
      borderRadius: 99,
      cursor: "pointer",
      fontFamily: "inherit",
      border: `1px solid ${color}`,
      color,
      background: selected ? ok ? "#d4f0dc" : "#fee2e2" : "transparent"
    }
  }, children);
}
function OpsMonthlySummary({
  items,
  year,
  month,
  person
}) {
  const rows = useMemo(() => {
    const vals = fn => WEEKS.map(w => fn(getWeekData(items, year, month, "ops", person, w)));
    const scores = vals(w => calcOpsWeeklyScore(w).total);
    return [{
      label: "周考核得分",
      vals: scores,
      type: "avg",
      fmt: n => `${n.toFixed(1)}分`,
      cls: n => n >= 80 ? "g" : n >= 60 ? "a" : n > 0 ? "r" : ""
    }, {
      label: "周销售额($)",
      vals: vals(w => num(w.sales)),
      type: "sum",
      fmt: n => `$${Math.round(n).toLocaleString()}`,
      cls: n => n > 0 ? "g" : ""
    }, {
      label: "利润率(%)",
      vals: vals(w => num(w.prate)),
      type: "avg",
      fmt: n => `${n.toFixed(1)}%`,
      cls: n => profitRateCls(n)
    }, {
      label: "利润率得分",
      vals: vals(w => calcOpsWeeklyScore(w).profitMarginScore),
      type: "avg",
      fmt: n => `${n.toFixed(0)}分`,
      cls: n => n >= 50 ? "g" : n >= 20 ? "a" : n > 0 ? "a" : ""
    }, {
      label: "下单款数(大货)",
      vals: vals(w => num(w.lsku)),
      type: "sum",
      fmt: n => String(n),
      cls: () => ""
    }, {
      label: "下单款数(运营自开)",
      vals: vals(w => num(w.selfsku)),
      type: "sum",
      fmt: n => String(n),
      cls: () => ""
    }, {
      label: "周开款（运营）",
      vals: vals(w => num(w.wstyle)),
      type: "sum",
      fmt: n => String(n),
      cls: () => ""
    }, {
      label: "周上架新品(SKU)",
      vals: vals(w => num(w.nsku)),
      type: "sum",
      fmt: n => String(n),
      cls: () => ""
    }, {
      label: "A品净变化",
      vals: vals(w => num(w.aadd) - num(w.aout)),
      type: "sum",
      fmt: n => `${n >= 0 ? "+" : ""}${n}`,
      cls: n => n > 0 ? "g" : n < 0 ? "r" : ""
    }, {
      label: "整体ACOS(%)",
      vals: vals(w => num(w.acos)),
      type: "avg",
      fmt: n => `${n.toFixed(1)}%`,
      cls: () => ""
    }, {
      label: "广告花费($)",
      vals: vals(w => num(w.adsp)),
      type: "sum",
      fmt: n => `$${Math.round(n).toLocaleString()}`,
      cls: () => ""
    }, {
      label: "A品断货(天)",
      vals: vals(w => num(w.sout)),
      type: "sum",
      fmt: n => String(n),
      cls: n => n === 0 ? "g" : n > 0 ? "r" : ""
    }];
  }, [items, year, month, person]);
  const summaries = rows.map(row => {
    const total = row.vals.reduce((a, b) => a + b, 0);
    const nonZero = row.vals.filter(v => v > 0);
    const avg = nonZero.length ? total / nonZero.length : 0;
    const agg = row.type === "sum" ? total : avg;
    return {
      ...row,
      agg
    };
  });
  const avgScore = summaries[0]?.agg || 0;
  return /*#__PURE__*/React.createElement(MonthlyBlock, {
    title: "\u8FD0\u8425 \u2014 \u6708\u5EA6\u6C47\u603B",
    color: "#2d7dd2",
    cards: [{
      label: "月均考核得分",
      value: `${avgScore.toFixed(1)}分`,
      cls: avgScore >= 80 ? "g" : avgScore >= 60 ? "a" : avgScore > 0 ? "r" : ""
    }, ...summaries.slice(1, 10).map((r, i) => ({
      label: ["月销售额($)", "月均利润率", "月均利润率得分", "月下单合计", "月开款合计", "月上架新品合计", "A品净变化", "月均ACOS", "月广告花费($)"][i],
      value: r.fmt(r.agg),
      cls: r.cls(r.agg)
    }))],
    rows: summaries
  });
}
function DesMonthlySummary({
  items,
  year,
  month,
  person
}) {
  const data = useMemo(() => {
    const weeks = WEEKS.map(w => getWeekData(items, year, month, "des", person, w));
    const summaries = weeks.map(d => calcDesSummary(d));
    const pts = summaries.map(s => s.total);
    const outputPts = summaries.map(s => s.outputPts);
    const vidPts = summaries.map(s => s.vidPts);
    const desReviewPts = summaries.map(s => s.desReviewPts);
    const quotaDone = outputPts.filter(p => p >= 5).length;
    const vid = weeks.map(d => num(d.vid));
    const ap = weeks.map(d => num(d.aplus));
    const rw = weeks.map(d => num(d.rework));
    const rates = weeks.map(d => {
      const dm = num(d.demand),
        ot = num(d.ontime);
      return dm > 0 ? Math.round(ot / dm * 100) : null;
    }).filter(r => r != null);
    const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;
    let reasonWeeks = 0;
    weeks.forEach(d => {
      if (d.incompleteReason) reasonWeeks++;
    });
    return {
      pts,
      outputPts,
      vidPts,
      desReviewPts,
      quotaDone,
      vid,
      ap,
      rw,
      avgRate,
      reasonWeeks,
      weeks
    };
  }, [items, year, month, person]);
  const rows = [{
    label: "考核产出分",
    vals: data.outputPts,
    type: "avg",
    fmt: n => n.toFixed(1),
    cls: n => n >= 5 ? "g" : n > 0 ? "a" : ""
  }, {
    label: "图片当量(含A+)",
    vals: data.pts.map(v => Math.round(v * 10) / 10),
    type: "sum",
    fmt: n => n.toFixed(1),
    cls: n => n >= 5 ? "g" : n > 0 ? "a" : ""
  }, {
    label: "视频分(×2)",
    vals: data.vidPts,
    type: "sum",
    fmt: n => String(n),
    cls: n => n > 0 ? "g" : ""
  }, {
    label: "说明书(自选)",
    vals: data.weeks.map(d => desSelfScore(d.manualScore)),
    type: "sum",
    fmt: n => String(n),
    cls: n => n > 0 ? "g" : ""
  }, {
    label: "包材设计(自选)",
    vals: data.weeks.map(d => desSelfScore(d.packagingScore)),
    type: "sum",
    fmt: n => String(n),
    cls: n => n > 0 ? "g" : ""
  }, {
    label: "美工评价分(运营评)",
    vals: data.desReviewPts,
    type: "sum",
    fmt: n => n > 0 ? `+${n}` : String(n),
    cls: n => n > 0 ? "g" : n < 0 ? "r" : ""
  }, {
    label: "视频(条)",
    vals: data.vid,
    type: "sum",
    fmt: n => String(n),
    cls: () => ""
  }, {
    label: "A+(套)",
    vals: data.ap,
    type: "sum",
    fmt: n => String(n),
    cls: () => ""
  }, {
    label: "按时交付率",
    vals: WEEKS.map(w => {
      const d = getWeekData(items, year, month, "des", person, w);
      const dm = num(d.demand),
        ot = num(d.ontime);
      return dm > 0 ? Math.round(ot / dm * 100) : 0;
    }),
    type: "avg",
    fmt: n => `${n}%`,
    cls: n => n >= 90 ? "g" : n >= 70 ? "a" : n > 0 ? "r" : ""
  }, {
    label: "返工次数",
    vals: data.rw,
    type: "sum",
    fmt: n => String(n),
    cls: n => n > 0 ? "r" : ""
  }].map(row => {
    const total = row.vals.reduce((a, b) => a + b, 0);
    const nonZero = row.vals.filter(v => v > 0);
    const avg = nonZero.length ? total / nonZero.length : 0;
    const agg = row.type === "sum" ? total : Math.round(avg);
    return {
      ...row,
      agg
    };
  });
  return /*#__PURE__*/React.createElement(MonthlyBlock, {
    title: "\u7F8E\u5DE5 \u2014 \u6708\u5EA6\u6C47\u603B",
    color: "#6b21a8",
    cards: [{
      label: "月当量总分",
      value: data.pts.reduce((a, b) => a + b, 0).toFixed(1)
    }, {
      label: "月美工评价净分",
      value: (() => {
        const t = data.desReviewPts.reduce((a, b) => a + b, 0);
        return t > 0 ? `+${t}` : String(t);
      })(),
      cls: data.desReviewPts.reduce((a, b) => a + b, 0) > 0 ? "g" : data.desReviewPts.reduce((a, b) => a + b, 0) < 0 ? "r" : ""
    }, {
      label: "配额达标周数",
      value: `${data.quotaDone}/4周`,
      cls: data.quotaDone === 4 ? "g" : data.quotaDone >= 2 ? "a" : "r"
    }, {
      label: "月视频合计",
      value: String(data.vid.reduce((a, b) => a + b, 0))
    }, {
      label: "月A+合计",
      value: String(data.ap.reduce((a, b) => a + b, 0))
    }, {
      label: "月均按时交付率",
      value: data.avgRate > 0 ? `${data.avgRate}%` : "—",
      cls: data.avgRate >= 90 ? "g" : data.avgRate >= 70 ? "a" : data.avgRate > 0 ? "r" : ""
    }, {
      label: "月返工合计",
      value: String(data.rw.reduce((a, b) => a + b, 0)),
      cls: data.rw.reduce((a, b) => a + b, 0) > 0 ? "r" : ""
    }, {
      label: "未完成说明",
      value: data.reasonWeeks > 0 ? `${data.reasonWeeks}周` : "—",
      cls: data.reasonWeeks > 0 ? "a" : ""
    }],
    rows: rows
  });
}
function DevProgressBox({
  title,
  accent,
  progress
}) {
  const barColor = progress.pct > 0 ? progress.color : "var(--border)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      background: accent ? "#ecfdf5" : "var(--bg)",
      borderRadius: 6,
      padding: "9px 11px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: accent ? "#00695c" : "var(--tm)",
      marginBottom: 4
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--border)",
      borderRadius: 99,
      height: 4,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${progress.pct}%`,
      height: "100%",
      background: barColor,
      borderRadius: 99,
      transition: "width 0.2s"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: progress.color,
      marginTop: 4
    }
  }, progress.text));
}
function DevWeekForm({
  data,
  onChange
}) {
  const set = (k, v) => onChange({
    ...data,
    [k]: v
  });
  const s = calcDevSummary(data);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SummaryBar, {
    items: [{
      label: "大货下单（考核）",
      value: s.order || "—",
      color: "#00695c"
    }, {
      label: "下单达成率",
      value: s.pOrder.rateText !== "0%" ? s.pOrder.rateText : "—",
      color: s.pOrder.cls === "g" ? "#2d9e52" : s.pOrder.cls === "a" ? "#e09000" : undefined
    }, {
      label: "新开发款",
      value: s.devNew || "—"
    }, {
      label: "开发达成率",
      value: s.pNew.rateText !== "0%" ? s.pNew.rateText : "—",
      color: s.pNew.cls === "g" ? "#2d9e52" : s.pNew.cls === "a" ? "#e09000" : undefined
    }, {
      label: "收到样板",
      value: s.sampleIn || "—"
    }, {
      label: "收样达成率",
      value: s.pSample.rateText !== "0%" ? s.pSample.rateText : "—",
      color: s.pSample.cls === "g" ? "#2d9e52" : s.pSample.cls === "a" ? "#e09000" : undefined
    }, {
      label: "异常款数",
      value: String(s.abn),
      color: s.abn > 0 ? "#e55" : undefined
    }]
  }), /*#__PURE__*/React.createElement(Section, {
    title: "\u9636\u6BB5\u76EE\u6807\u8BBE\u5B9A"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u9636\u6BB51 \u76EE\u6807 / DEVELOP TARGET",
    hint: "\u672C\u5468\u5F00\u53D1\u76EE\u6807",
    teal: true
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.tNew,
    onChange: v => set("tNew", v),
    unit: "\u6B3E"
  })), /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u9636\u6BB52 \u76EE\u6807 / SAMPLE TARGET",
    hint: "\u672C\u5468\u6536\u6837\u76EE\u6807",
    teal: true
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.tSample,
    onChange: v => set("tSample", v),
    unit: "\u6B3E"
  })), /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u9636\u6BB53 \u76EE\u6807 / ORDER TARGET\uFF08\u8003\u6838\uFF09",
    hint: "\u672C\u5468\u5927\u8D27\u4E0B\u5355\u76EE\u6807",
    teal: true
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.tOrder,
    onChange: v => set("tOrder", v),
    unit: "\u6B3E"
  }), /*#__PURE__*/React.createElement("span", {
    style: kpiBadge("#ecfdf5", "#00695c")
  }, "\u4E3B\u8981\u8003\u6838\u9879")))), /*#__PURE__*/React.createElement(Section, {
    title: "\u672C\u5468\u5B9E\u9645\u5B8C\u6210"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u9636\u6BB51 / NEW DEV",
    hint: "\u672C\u5468\u65B0\u5F00\u53D1\u6B3E\u6570"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.devNew,
    onChange: v => set("devNew", v),
    unit: "\u6B3E"
  }), /*#__PURE__*/React.createElement(DevProgressBox, {
    title: "\u5F00\u53D1\u8FBE\u6210\u7387\uFF08\u672C\u5468\uFF09",
    progress: s.pNew
  })), /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u9636\u6BB52 / SAMPLE IN",
    hint: "\u672C\u5468\u6536\u5230\u6837\u677F\u6B3E\u6570"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.sampleIn,
    onChange: v => set("sampleIn", v),
    unit: "\u6B3E"
  }), /*#__PURE__*/React.createElement(DevProgressBox, {
    title: "\u6536\u6837\u8FBE\u6210\u7387\uFF08\u672C\u5468\uFF09",
    progress: s.pSample
  })), /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u9636\u6BB52+ / PASS",
    hint: "\u672C\u5468\u6837\u677F\u901A\u8FC7\u6B3E\u6570"
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.pass,
    onChange: v => set("pass", v),
    unit: "\u6B3E"
  })), /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u9636\u6BB53 / ORDER\uFF08\u8003\u6838\uFF09",
    hint: "\u672C\u5468\u5927\u8D27\u4E0B\u5355\u6B3E\u6570",
    teal: true
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.order,
    onChange: v => set("order", v),
    unit: "\u6B3E"
  }), /*#__PURE__*/React.createElement(DevProgressBox, {
    title: "\u4E0B\u5355\u8FBE\u6210\u7387\uFF08\u672C\u5468\uFF09",
    accent: true,
    progress: s.pOrder
  })), /*#__PURE__*/React.createElement(FieldCard, {
    label: "\u5F02\u5E38 / ABNORMAL",
    hint: "\u672C\u5468\u5F02\u5E38\u6B3E\u6570",
    danger: true
  }, /*#__PURE__*/React.createElement(NumInput, {
    value: data.abn,
    onChange: v => set("abn", v),
    unit: "\u6B3E"
  }), /*#__PURE__*/React.createElement("span", {
    style: kpiBadge("#fee2e2", "#e55")
  }, "\u542B\u5EF6\u671F/\u8D28\u91CF/\u53D6\u6D88"), /*#__PURE__*/React.createElement("textarea", {
    style: {
      ...kpiInp,
      marginTop: 6,
      minHeight: 40,
      fontSize: 11
    },
    value: data.abnRemark,
    onChange: e => set("abnRemark", e.target.value),
    placeholder: "\u5F02\u5E38\u8BF4\u660E\u2026"
  })))));
}
function DevMonthProgressCard({
  label,
  hint,
  actual,
  target,
  onTargetChange
}) {
  const p = kpiDevProgress(actual, target);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...kpiCard,
      borderColor: "#99f6e4",
      background: "#f0fdfa"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginBottom: 2
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 500,
      marginBottom: 8
    }
  }, hint), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 8,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 22,
      fontWeight: 700,
      color: "#00695c"
    }
  }, actual), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--tm)"
    }
  }, "/ ", /*#__PURE__*/React.createElement("input", {
    type: "number",
    style: {
      ...kpiInpSm,
      width: 50,
      borderStyle: "dashed"
    },
    value: target,
    onChange: e => onTargetChange(e.target.value),
    placeholder: "\u6708\u76EE\u6807",
    min: "0"
  }), " \u6B3E")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--border)",
      borderRadius: 99,
      height: 4,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${p.pct}%`,
      height: "100%",
      background: p.pct > 0 ? p.color : "var(--border)",
      borderRadius: 99
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: p.color,
      marginTop: 4
    }
  }, num(target) > 0 ? `${actual}/${num(target)}款（月累计 ${p.pct}%）${p.pct >= 100 ? " ✓" : ""}` : "请填写月目标"));
}
function DevMonthlySummary({
  items,
  year,
  month,
  person,
  monthTargets,
  onMonthTargetsChange
}) {
  const totals = useMemo(() => {
    const orderArr = WEEKS.map(w => num(getWeekData(items, year, month, "dev", person, w).order));
    const devArr = WEEKS.map(w => num(getWeekData(items, year, month, "dev", person, w).devNew));
    const sampleArr = WEEKS.map(w => num(getWeekData(items, year, month, "dev", person, w).sampleIn));
    const passArr = WEEKS.map(w => num(getWeekData(items, year, month, "dev", person, w).pass));
    const abnArr = WEEKS.map(w => num(getWeekData(items, year, month, "dev", person, w).abn));
    return {
      orderArr,
      devArr,
      sampleArr,
      passArr,
      abnArr,
      totalOrder: orderArr.reduce((a, b) => a + b, 0),
      totalDev: devArr.reduce((a, b) => a + b, 0),
      totalSample: sampleArr.reduce((a, b) => a + b, 0),
      totalPass: passArr.reduce((a, b) => a + b, 0),
      totalAbn: abnArr.reduce((a, b) => a + b, 0)
    };
  }, [items, year, month, person]);
  const rows = [{
    label: "大货下单（考核）",
    vals: totals.orderArr,
    type: "sum",
    fmt: n => String(n),
    cls: n => n > 0 ? "t" : ""
  }, {
    label: "新开发款",
    vals: totals.devArr,
    type: "sum",
    fmt: n => String(n),
    cls: () => ""
  }, {
    label: "收到样板",
    vals: totals.sampleArr,
    type: "sum",
    fmt: n => String(n),
    cls: () => ""
  }, {
    label: "样板通过",
    vals: totals.passArr,
    type: "sum",
    fmt: n => String(n),
    cls: n => n > 0 ? "g" : ""
  }, {
    label: "异常款数",
    vals: totals.abnArr,
    type: "sum",
    fmt: n => String(n),
    cls: n => n > 0 ? "r" : ""
  }].map(row => ({
    ...row,
    agg: row.vals.reduce((a, b) => a + b, 0)
  }));
  const tagColor = {
    g: "#2d9e52",
    r: "#e55",
    a: "#e09000",
    t: "#00695c"
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(MonthlyBlock, {
    title: "\u5F00\u53D1 \u2014 \u6708\u5EA6\u6C47\u603B",
    color: "#00695c",
    cards: [{
      label: "月大货下单合计",
      value: String(totals.totalOrder),
      cls: totals.totalOrder > 0 ? "t" : ""
    }, {
      label: "月开发款合计",
      value: String(totals.totalDev)
    }, {
      label: "月收样合计",
      value: String(totals.totalSample)
    }, {
      label: "样板通过合计",
      value: String(totals.totalPass),
      cls: totals.totalPass > 0 ? "g" : ""
    }, {
      label: "平均周期(天)",
      value: "—"
    }, {
      label: "月异常款合计",
      value: String(totals.totalAbn),
      cls: totals.totalAbn > 0 ? "r" : ""
    }],
    rows: rows,
    tagColor: tagColor
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...kpiModTitle,
      color: "#00695c"
    }
  }, "\u5404\u9636\u6BB5\u6708\u7D2F\u8BA1\u8FDB\u5EA6"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))",
      gap: 8,
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement(DevMonthProgressCard, {
    label: "\u9636\u6BB51 / \u6708\u5F00\u53D1\u76EE\u6807",
    hint: "\u65B0\u5F00\u53D1\u6B3E \u6708\u7D2F\u8BA1",
    actual: totals.totalDev,
    target: monthTargets.tDev,
    onTargetChange: v => onMonthTargetsChange({
      ...monthTargets,
      tDev: v
    })
  }), /*#__PURE__*/React.createElement(DevMonthProgressCard, {
    label: "\u9636\u6BB52 / \u6708\u6536\u6837\u76EE\u6807",
    hint: "\u6536\u5230\u6837\u677F \u6708\u7D2F\u8BA1",
    actual: totals.totalSample,
    target: monthTargets.tSample,
    onTargetChange: v => onMonthTargetsChange({
      ...monthTargets,
      tSample: v
    })
  }), /*#__PURE__*/React.createElement(DevMonthProgressCard, {
    label: "\u9636\u6BB53 / \u6708\u4E0B\u5355\u76EE\u6807\uFF08\u8003\u6838\uFF09",
    hint: "\u5927\u8D27\u4E0B\u5355 \u6708\u7D2F\u8BA1",
    actual: totals.totalOrder,
    target: monthTargets.tOrder,
    onTargetChange: v => onMonthTargetsChange({
      ...monthTargets,
      tOrder: v
    })
  }))));
}
const STAT_COLORS = {
  g: "#2d9e52",
  a: "#e09000",
  r: "#e55"
};
function opsScoreCls(n) {
  if (!n) return "";
  if (n >= 80) return "g";
  if (n >= 60) return "a";
  return "r";
}

/** 美工 5 分制：≥5 周达标 · ≥3 部分达标 · <3 未达标（每天约 1 分合格） */
function desScoreCls(n) {
  if (!n) return "";
  if (n >= 5) return "g";
  if (n >= 3) return "a";
  return "r";
}

/** 美工周考核得分（5 分制，即产出分；周满分 5，每天约 1 分合格） */
function calcDesWeeklyScore(w) {
  return calcDesSummary(w).outputPts;
}
function avgFilled(vals) {
  const filled = vals.filter(v => v > 0);
  return filled.length ? Math.round(filled.reduce((a, b) => a + b, 0) / filled.length * 10) / 10 : 0;
}
function buildOpsStatsRow(items, year, month, name) {
  const weekBreakdowns = WEEKS.map(w => {
    const d = getWeekData(items, year, month, "ops", name, w);
    const s = calcOpsWeeklyScore(d);
    return {
      week: w,
      filled: weekHasOpsData(d),
      ...s
    };
  });
  const weekScores = weekBreakdowns.map(s => s.total);
  const weekFilled = weekBreakdowns.map(s => s.filled);
  const filled = weekScores.filter(s => s > 0);
  const avg = filled.length ? Math.round(filled.reduce((a, b) => a + b, 0) / filled.length * 10) / 10 : 0;
  const avgOrder = avgFilled(weekBreakdowns.map(s => s.orderScore));
  const avgProfitMargin = avgFilled(weekBreakdowns.map(s => s.profitMarginScore));
  let totalSales = 0,
    totalNsku = 0,
    totalLsku = 0;
  WEEKS.forEach(w => {
    const d = getWeekData(items, year, month, "ops", name, w);
    totalSales += num(d.sales);
    totalNsku += num(d.nsku);
    totalLsku += num(d.lsku);
  });
  return {
    name,
    weekScores,
    weekBreakdowns,
    weekFilled,
    avg,
    avgOrder,
    avgProfitMargin,
    totalSales,
    totalNsku,
    totalLsku,
    filledWeeks: weekFilled.filter(Boolean).length
  };
}
function buildDesStatsRow(items, year, month, name) {
  const weeks = WEEKS.map(w => getWeekData(items, year, month, "des", name, w));
  const weekBreakdowns = weeks.map((d, i) => {
    const s = calcDesSummary(d);
    return {
      week: WEEKS[i],
      filled: weekHasDesData(d),
      prem: num(d.prem),
      std: num(d.std),
      vid: num(d.vid),
      aplus: num(d.aplus),
      ...s
    };
  });
  const weekScores = weekBreakdowns.map(s => s.outputPts);
  const weekFilled = weekBreakdowns.map(s => s.filled);
  const filled = weekScores.filter(v => v > 0);
  const avg = filled.length ? Math.round(filled.reduce((a, b) => a + b, 0) / filled.length * 10) / 10 : 0;
  const avgImg = avgFilled(weekBreakdowns.map(s => s.imgPts));
  const avgVid = avgFilled(weekBreakdowns.map(s => s.vidPts));
  const avgAplus = avgFilled(weekBreakdowns.map(s => s.aplusPts));
  const quotaDone = weekBreakdowns.filter(s => s.quotaOk).length;
  const reviewNet = weekBreakdowns.reduce((a, s) => a + s.desReviewPts, 0);
  const rework = weeks.reduce((a, d) => a + num(d.rework), 0);
  return {
    name,
    weekScores,
    weekBreakdowns,
    weekFilled,
    avg,
    avgImg,
    avgVid,
    avgAplus,
    quotaDone,
    reviewNet,
    rework,
    filledWeeks: weekFilled.filter(Boolean).length
  };
}
function opsWeekDetail(s) {
  if (!s.total) return "";
  const parts = [s.orderScore ? `下单${s.orderScore}` : null, s.rate != null ? `利润${s.profitMarginScore}` : null].filter(Boolean);
  return parts.join("+");
}
function desWeekDetail(s) {
  if (!s.outputPts) return "";
  const parts = [];
  if (s.imgPts) parts.push(`图${s.imgPts}`);
  if (s.aplusPts) parts.push(`A+${s.aplusPts.toFixed(1)}`);
  if (s.vidPts) parts.push(`视${s.vidPts}`);
  if (s.manualPts) parts.push(`说${s.manualPts}`);
  if (s.packagingPts) parts.push(`包${s.packagingPts}`);
  return parts.join("+") || "";
}
function StatWeekCell({
  value,
  cls,
  fmt = v => String(v),
  scale,
  detail
}) {
  const has = value > 0;
  const display = has ? fmt(value) : "—";
  const bg = cls === "g" ? "#eafaf1" : cls === "a" ? "#fff8e6" : cls === "r" ? "#fef2f2" : "transparent";
  return /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "7px 4px",
      textAlign: "center",
      fontSize: 12,
      borderBottom: "1px solid var(--border)",
      background: bg,
      color: has ? STAT_COLORS[cls] || "var(--text)" : "var(--tm)",
      fontWeight: has ? 600 : 400,
      minWidth: scale === 100 ? 52 : 48
    }
  }, /*#__PURE__*/React.createElement("div", null, display), scale && has && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--tm)",
      marginTop: 1,
      fontWeight: 400
    }
  }, "/", scale), detail && has && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 8,
      color: "var(--tm)",
      marginTop: 2,
      fontWeight: 400,
      lineHeight: 1.2
    }
  }, detail));
}
function KpiStatsFormulaCards() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#eef6ff",
      border: "1px solid #b8d4f0",
      borderRadius: 8,
      padding: "10px 12px",
      fontSize: 11,
      lineHeight: 1.65
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      color: "#2d7dd2",
      marginBottom: 6
    }
  }, "\u8FD0\u8425 100 \u5206\u5236 \xB7 \u600E\u4E48\u7B97"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "\u2460 \u4E0B\u5355\u6B3E\u6570 50 \u5206"), " = min(\u672C\u5468\u4E0B\u5355\u6B3E \xF7 \u5468\u76EE\u6807, 1) \xD7 50"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--tm)"
    }
  }, "\u5468\u76EE\u6807\u53D6\u81EA\u300C\u5468\u76EE\u6807\u4E0B\u5355\u6B3E\u300D\u6216\u300C\u6708\u76EE\u6807\u5F00\u6B3E\u300D"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("strong", null, "\u2461 \u5229\u6DA6\u7387 50 \u5206"), "\uFF08\u6309\u672C\u5468\u5229\u6DA6\u7387\u6863\u4F4D\uFF09"), /*#__PURE__*/React.createElement("div", {
    style: {
      paddingLeft: 8,
      color: "var(--tm)"
    }
  }, "\u226515% \u2192 50 \u5206\uFF08\u8DB3\u5206\uFF09\xB7 10\u201315% \u2192 20 \u5206 \xB7 2\u201310% \u2192 10 \u5206 \xB7 <2% \u2192 0 \u5206"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      fontWeight: 600,
      color: "#2d7dd2"
    }
  }, "\u5468\u5F97\u5206 = \u2460 + \u2461\uFF08\u6EE1\u5206 100\uFF09")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#faf5ff",
      border: "1px solid #e9d5ff",
      borderRadius: 8,
      padding: "10px 12px",
      fontSize: 11,
      lineHeight: 1.65
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      color: "#6b21a8",
      marginBottom: 6
    }
  }, "\u7F8E\u5DE5 5 \u5206\u5236 \xB7 \u600E\u4E48\u7B97"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "\u7CBE\u94FA\u56FE"), " 1 \u5F20 = 1 \u5206\uFF08\u2248 \u6BCF\u5929 1 \u5F20\u5373\u5408\u683C\uFF09"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "\u7CBE\u54C1\u56FE"), " 1 \u5F20 = 5 \u5206\uFF08\u2248 \u4E00\u5468\u5408\u683C\u91CF\uFF09"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "A+"), " 1 \u5957 = 0.5 \u5206 \xB7 ", /*#__PURE__*/React.createElement("strong", null, "\u89C6\u9891"), " 1 \u6761 = 2 \u5206"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "\u8BF4\u660E\u4E66 / \u5305\u6750\u8BBE\u8BA1"), " \u5404\u81EA\u9009 1\u20132 \u5206\uFF08\u8BA1\u5165\u5468\u4EA7\u51FA\uFF09"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      fontWeight: 600,
      color: "#6b21a8"
    }
  }, "\u5468\u5F97\u5206 = \u56FE\u7247 + A+ + \u89C6\u9891 + \u8BF4\u660E\u4E66 + \u5305\u6750\uFF08\u6EE1\u5206 5\uFF0C\u6BCF\u5929\u7EA6 1 \u5206\u5408\u683C\uFF09"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      color: "var(--tm)"
    }
  }, "\u8FD0\u8425\u8BC4\u4EF7\uFF08\u2665+1 / \uD83D\uDC94\u22121\uFF09\u5355\u72EC\u7EDF\u8BA1\uFF0C\u4E0D\u8BA1\u5165\u5468\u5F97\u5206")));
}
function OpsStatsExpandRow({
  row,
  colSpan,
  expanded
}) {
  if (!expanded) return null;
  return /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: colSpan,
    style: {
      padding: "0 8px 10px",
      borderBottom: "1px solid var(--border)",
      background: "#f8fbff"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#2d7dd2",
      fontWeight: 600,
      marginBottom: 6
    }
  }, row.name, " \xB7 \u5404\u5468\u5F97\u5206\u660E\u7EC6"), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: "auto"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      color: "var(--tm)"
    }
  }, /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "left",
      padding: "4px 6px"
    }
  }, "\u5468"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "4px 6px"
    }
  }, "\u4E0B\u5355(50%)"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "4px 6px"
    }
  }, "\u5229\u6DA6\u7387(50%)"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "4px 6px"
    }
  }, "\u5408\u8BA1"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "left",
      padding: "4px 6px"
    }
  }, "\u8BA1\u7B97\u4F9D\u636E"))), /*#__PURE__*/React.createElement("tbody", null, row.weekBreakdowns.map(s => /*#__PURE__*/React.createElement("tr", {
    key: s.week
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      fontWeight: 600
    }
  }, "\u7B2C", s.week, "\u5468"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      textAlign: "center"
    }
  }, s.orderScore || "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      textAlign: "center"
    }
  }, s.rate != null ? s.profitMarginScore : "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      textAlign: "center",
      fontWeight: 700,
      color: opsScoreCls(s.total) ? STAT_COLORS[opsScoreCls(s.total)] : "var(--text)"
    }
  }, s.total ? `${s.total}/100` : "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      color: "var(--tm)",
      fontSize: 10
    }
  }, !s.total ? "未填写" : /*#__PURE__*/React.createElement(React.Fragment, null, "\u4E0B\u5355 ", s.orderCount, "/", s.target, "\u6B3E \u2192 ", s.orderScore, "\u5206", s.rate != null ? ` · 利润率 ${s.rate.toFixed(1)}%（${s.profitMarginTier}）→ ${s.profitMarginScore}分` : " · 利润率未填")))), /*#__PURE__*/React.createElement("tr", {
    style: {
      background: "#eef6ff"
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      fontWeight: 600
    }
  }, "\u6708\u5747"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      textAlign: "center"
    }
  }, row.avgOrder ? row.avgOrder.toFixed(1) : "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      textAlign: "center"
    }
  }, row.avgProfitMargin ? row.avgProfitMargin.toFixed(1) : "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      textAlign: "center",
      fontWeight: 700
    }
  }, row.avg ? `${row.avg.toFixed(1)}/100` : "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      fontSize: 10,
      color: "var(--tm)"
    }
  }, row.avg ? `${row.avgOrder.toFixed(1)}+${row.avgProfitMargin.toFixed(1)}` : "—")))))));
}
function DesStatsExpandRow({
  row,
  colSpan,
  expanded
}) {
  if (!expanded) return null;
  return /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: colSpan,
    style: {
      padding: "0 8px 10px",
      borderBottom: "1px solid var(--border)",
      background: "#faf5ff"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#6b21a8",
      fontWeight: 600,
      marginBottom: 6
    }
  }, row.name, " \xB7 \u5404\u5468\u4EA7\u51FA\u660E\u7EC6"), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: "auto"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      color: "var(--tm)"
    }
  }, /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "left",
      padding: "4px 6px"
    }
  }, "\u5468"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "4px 6px"
    }
  }, "\u7CBE\u54C1\u56FE"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "4px 6px"
    }
  }, "\u7CBE\u94FA\u56FE"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "4px 6px"
    }
  }, "A+"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "4px 6px"
    }
  }, "\u89C6\u9891"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "4px 6px"
    }
  }, "\u56FE\u7247\u5206"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "4px 6px"
    }
  }, "A+\u5206"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "4px 6px"
    }
  }, "\u89C6\u9891\u5206"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "4px 6px"
    }
  }, "\u5468\u5F97\u5206"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "left",
      padding: "4px 6px"
    }
  }, "\u8BC4\u4EF7/\u8FD4\u5DE5"))), /*#__PURE__*/React.createElement("tbody", null, row.weekBreakdowns.map(s => /*#__PURE__*/React.createElement("tr", {
    key: s.week
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      fontWeight: 600
    }
  }, "\u7B2C", s.week, "\u5468"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      textAlign: "center"
    }
  }, s.prem || "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      textAlign: "center"
    }
  }, s.std || "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      textAlign: "center"
    }
  }, s.aplus || "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      textAlign: "center"
    }
  }, s.vid || "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      textAlign: "center"
    }
  }, s.imgPts || "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      textAlign: "center"
    }
  }, s.aplusPts ? s.aplusPts.toFixed(1) : "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      textAlign: "center"
    }
  }, s.vidPts || "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      textAlign: "center",
      fontWeight: 700,
      color: desScoreCls(s.outputPts) ? STAT_COLORS[desScoreCls(s.outputPts)] : "var(--text)"
    }
  }, s.outputPts ? `${s.outputPts.toFixed(1)}/5` : "—", s.quotaOk && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: "#2d9e52",
      marginLeft: 2
    }
  }, "\u2713")), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      fontSize: 10,
      color: "var(--tm)"
    }
  }, !s.outputPts && !s.desReviewPts ? "未填写" : /*#__PURE__*/React.createElement(React.Fragment, null, s.prem ? `精品${s.prem}×5` : "", s.std ? `${s.prem ? "+" : ""}精铺${s.std}×1` : "", s.aplus ? ` + A+${s.aplus}×0.5` : "", s.vid ? ` + 视频${s.vid}×2` : "", s.manualPts ? ` + 说明书${s.manualPts}分` : "", s.packagingPts ? ` + 包材${s.packagingPts}分` : "", s.desReviewPts ? ` · 运营评${s.desReviewPts > 0 ? "+" : ""}${s.desReviewPts}` : "")))), /*#__PURE__*/React.createElement("tr", {
    style: {
      background: "#f3e8ff"
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      fontWeight: 600
    }
  }, "\u6708\u5747"), /*#__PURE__*/React.createElement("td", {
    colSpan: 4,
    style: {
      padding: "5px 6px",
      textAlign: "center",
      color: "var(--tm)",
      fontSize: 10
    }
  }, "\u2014"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      textAlign: "center"
    }
  }, row.avgImg ? row.avgImg.toFixed(1) : "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      textAlign: "center"
    }
  }, row.avgAplus ? row.avgAplus.toFixed(1) : "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      textAlign: "center"
    }
  }, row.avgVid ? row.avgVid.toFixed(1) : "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      textAlign: "center",
      fontWeight: 700
    }
  }, row.avg ? `${row.avg.toFixed(1)}/5` : "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "5px 6px",
      fontSize: 10,
      color: "var(--tm)"
    }
  }, row.avg ? `图${row.avgImg.toFixed(1)}+A+${row.avgAplus.toFixed(1)}+视${row.avgVid.toFixed(1)}` : "—", row.reviewNet !== 0 ? ` · 月评${row.reviewNet > 0 ? "+" : ""}${row.reviewNet}` : "")))))));
}
function KpiSparkline({
  color = "#4080FF",
  light = false
}) {
  const stroke = light ? "rgba(255,255,255,0.6)" : color;
  return /*#__PURE__*/React.createElement("svg", {
    className: "ops-sparkline",
    viewBox: "0 0 80 28",
    preserveAspectRatio: "none"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "0,22 12,18 24,20 36,12 48,14 60,8 72,10 80,4",
    fill: "none",
    stroke: stroke,
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
}
function KpiStatsSummaryChips({
  chips,
  color
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-grid",
    style: {
      marginBottom: 14
    }
  }, chips.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.label,
    className: "ops-metric-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-label"
  }, c.label), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-value",
    style: {
      fontSize: 22,
      color: c.cls ? STAT_COLORS[c.cls] : color
    }
  }, c.value), /*#__PURE__*/React.createElement(KpiSparkline, {
    color: color
  }))));
}
function KpiStatsTable({
  title,
  subtitle,
  color,
  headers,
  rows,
  emptyHint
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "ops-card ops-card-padded",
    style: {
      borderColor: `${color}33`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginTop: 2
    }
  }, subtitle)), rows.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--tm)",
      padding: "1.5rem 0",
      textAlign: "center"
    }
  }, emptyHint) : /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: "auto"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, headers.map(h => /*#__PURE__*/React.createElement("th", {
    key: h,
    style: {
      padding: "6px 8px",
      color: "var(--tm)",
      borderBottom: `2px solid ${color}44`,
      textAlign: h === "姓名" ? "left" : "center",
      fontWeight: 600,
      whiteSpace: "nowrap"
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, rows))));
}
function KpiStatsPage({
  items,
  year,
  month,
  staffTick = 0
}) {
  const [expandedOps, setExpandedOps] = useState({});
  const [expandedDes, setExpandedDes] = useState({});
  const toggleOps = name => setExpandedOps(p => ({
    ...p,
    [name]: !p[name]
  }));
  const toggleDes = name => setExpandedDes(p => ({
    ...p,
    [name]: !p[name]
  }));
  const opsStaff = useMemo(() => getEmployees().filter(e => e.role === "运营" && e.name), [year, month, staffTick]);
  const desStaff = useMemo(() => getEmployees().filter(e => e.role === "美工" && e.name), [year, month, staffTick]);
  const opsRows = useMemo(() => opsStaff.map(s => buildOpsStatsRow(items, year, month, s.name)), [items, year, month, opsStaff]);
  const desRows = useMemo(() => desStaff.map(s => buildDesStatsRow(items, year, month, s.name)), [items, year, month, desStaff]);
  const opsAvg = opsRows.filter(r => r.avg > 0);
  const teamOpsAvg = opsAvg.length ? Math.round(opsAvg.reduce((a, r) => a + r.avg, 0) / opsAvg.length * 10) / 10 : 0;
  const desAvg = desRows.filter(r => r.avg > 0);
  const teamDesAvg = desAvg.length ? Math.round(desAvg.reduce((a, r) => a + r.avg, 0) / desAvg.length * 10) / 10 : 0;
  const OPS_COLS = 10;
  const DES_COLS = 11;
  const totalSales = opsRows.reduce((a, r) => a + r.totalSales, 0);
  const totalNsku = opsRows.reduce((a, r) => a + r.totalNsku, 0);
  const fillRate = opsRows.length ? Math.round(opsRows.reduce((a, r) => a + r.filledWeeks, 0) / (opsRows.length * 4) * 100) : 0;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-card ops-metric-card-hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-label"
  }, "\u56E2\u961F\u8FD0\u8425\u6708\u5747\u5F97\u5206"), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-value"
  }, teamOpsAvg > 0 ? teamOpsAvg.toFixed(1) : "—"), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-sub"
  }, teamOpsAvg > 0 ? "满分 100 · 精铺考核" : "暂无数据"), /*#__PURE__*/React.createElement(KpiSparkline, {
    light: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-card ops-metric-card-elevated"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-card-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-icon-box ops-icon-blue"
  }, "\uD83D\uDC65"), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-label",
    style: {
      marginBottom: 0
    }
  }, "\u8FD0\u8425\u4EBA\u6570")), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-value",
    style: {
      fontSize: 26,
      color: "var(--primary)"
    }
  }, opsRows.length || "—"), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-sub"
  }, "\u7CBE\u94FA\u8003\u6838\u6210\u5458")), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-card ops-metric-card-elevated"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-card-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-icon-box ops-icon-green"
  }, "$"), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-label",
    style: {
      marginBottom: 0
    }
  }, "\u6708\u9500\u5408\u8BA1")), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-value",
    style: {
      fontSize: 22
    }
  }, totalSales > 0 ? `$${Math.round(totalSales).toLocaleString()}` : "—"), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-sub"
  }, year, "\u5E74", month, "\u6708")), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-card ops-metric-card-elevated"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-card-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-icon-box ops-icon-amber"
  }, "\u2713"), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-label",
    style: {
      marginBottom: 0
    }
  }, "\u586B\u5199\u5B8C\u6210\u7387")), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-value",
    style: {
      fontSize: 26
    }
  }, opsRows.length ? `${fillRate}%` : "—"), /*#__PURE__*/React.createElement("span", {
    className: `ops-metric-trend ${fillRate >= 75 ? "ops-trend-up" : "ops-trend-down"}`
  }, fillRate >= 75 ? "↑ 良好" : fillRate > 0 ? "↓ 待完善" : "—")), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-card ops-metric-card-elevated"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-card-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-icon-box ops-icon-purple"
  }, "\uD83C\uDFA8"), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-label",
    style: {
      marginBottom: 0
    }
  }, "\u7F8E\u5DE5\u56E2\u961F\u6708\u5747")), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-value",
    style: {
      fontSize: 26,
      color: "var(--purple)"
    }
  }, teamDesAvg > 0 ? teamDesAvg.toFixed(1) : "—"), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-sub"
  }, "\u6EE1\u5206 5 \u5206\u5236"))), /*#__PURE__*/React.createElement("div", {
    className: "ops-card ops-card-padded",
    style: {
      fontSize: 12,
      color: "var(--tm)",
      lineHeight: 1.6
    }
  }, /*#__PURE__*/React.createElement("div", null, year, "\u5E74", month, "\u6708 \xB7 \u8FD0\u8425\u4E0E\u7F8E\u5DE5\u56E2\u961F\u4E00\u89C8\uFF08\u4E24\u5957\u5206\u5236\uFF0C\u8BF7\u52FF\u6DF7\u6BD4\uFF09"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#2d7dd2",
      fontWeight: 600
    }
  }, "\u8FD0\u8425 100 \u5206\u5236"), "\uFF1A\u226580 \u4F18 \xB7 \u226560 \u826F \xA0|\xA0", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#6b21a8",
      fontWeight: 600
    }
  }, "\u7F8E\u5DE5 5 \u5206\u5236"), "\uFF1A\u6EE1\u5206 5 \xB7 \u6BCF\u5929\u7EA6 1 \u5206\u5408\u683C \xB7 \u5468\u22655 \u8FBE\u6807"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 11
    }
  }, "\u70B9\u51FB\u59D3\u540D\u5C55\u5F00\u5404\u5468\u5F97\u5206\u660E\u7EC6 \xB7 \u5355\u5143\u683C\u4E0B\u65B9\u4E3A\u5206\u9879\u6784\u6210")), /*#__PURE__*/React.createElement(KpiStatsFormulaCards, null), /*#__PURE__*/React.createElement(KpiStatsTable, {
    title: "\u8FD0\u8425 \xB7 \u7CBE\u94FA\u8003\u6838",
    subtitle: "100 \u5206\u5236 \xB7 \u4E0B\u535550% + \u5229\u6DA6\u738750%\uFF08\u226515%\u8DB3\u5206/10\u201315%\u5F9720/2\u201310%\u5F9710/<2%\u5F970\uFF09",
    color: "#2d7dd2",
    headers: ["姓名", "W1", "W2", "W3", "W4", "月均", "月均构成", "月销售额", "月上新", "填写"],
    emptyHint: "\u6682\u65E0\u8FD0\u8425\u4EBA\u5458 \xB7 \u8BF7\u5728\u8BBE\u7F6E\u4E2D\u6DFB\u52A0",
    rows: opsRows.flatMap(r => [/*#__PURE__*/React.createElement("tr", {
      key: r.name,
      style: {
        cursor: "pointer"
      },
      onClick: () => toggleOps(r.name)
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "7px 8px",
        fontWeight: 600,
        borderBottom: expandedOps[r.name] ? "none" : "1px solid var(--border)",
        whiteSpace: "nowrap",
        color: "#2d7dd2"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        marginRight: 4
      }
    }, expandedOps[r.name] ? "▼" : "▶"), r.name), r.weekBreakdowns.map((s, i) => /*#__PURE__*/React.createElement(StatWeekCell, {
      key: i,
      value: s.total,
      cls: opsScoreCls(s.total),
      fmt: v => v.toFixed(0),
      scale: 100,
      detail: opsWeekDetail(s)
    })), /*#__PURE__*/React.createElement(StatWeekCell, {
      value: r.avg,
      cls: opsScoreCls(r.avg),
      fmt: v => v.toFixed(1),
      scale: 100,
      detail: r.avg ? `${r.avgOrder.toFixed(0)}+${r.avgProfitMargin.toFixed(0)}` : ""
    }), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "7px 6px",
        textAlign: "center",
        borderBottom: expandedOps[r.name] ? "none" : "1px solid var(--border)",
        fontSize: 10,
        color: "var(--tm)",
        lineHeight: 1.3
      }
    }, r.avg ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, "\u4E0B\u5355", r.avgOrder.toFixed(0)), /*#__PURE__*/React.createElement("div", null, "\u5229\u6DA6\u7387", r.avgProfitMargin.toFixed(0))) : "—"), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "7px 8px",
        textAlign: "center",
        borderBottom: expandedOps[r.name] ? "none" : "1px solid var(--border)",
        fontSize: 12
      }
    }, r.totalSales > 0 ? `$${Math.round(r.totalSales).toLocaleString()}` : "—"), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "7px 8px",
        textAlign: "center",
        borderBottom: expandedOps[r.name] ? "none" : "1px solid var(--border)",
        fontSize: 12
      }
    }, r.totalNsku > 0 ? r.totalNsku : "—"), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "7px 8px",
        textAlign: "center",
        borderBottom: expandedOps[r.name] ? "none" : "1px solid var(--border)",
        fontSize: 11,
        color: r.filledWeeks === 4 ? "#2d9e52" : "var(--tm)"
      }
    }, r.filledWeeks, "/4")), /*#__PURE__*/React.createElement(OpsStatsExpandRow, {
      key: `${r.name}-detail`,
      row: r,
      colSpan: OPS_COLS,
      expanded: expandedOps[r.name]
    })])
  }), opsRows.length > 0 && /*#__PURE__*/React.createElement(KpiStatsSummaryChips, {
    color: "#2d7dd2",
    chips: [{
      label: "运营人数",
      value: String(opsRows.length)
    }, {
      label: "团队月均得分",
      value: teamOpsAvg > 0 ? `${teamOpsAvg.toFixed(1)}/100` : "—",
      cls: opsScoreCls(teamOpsAvg)
    }, {
      label: "月销合计",
      value: opsRows.some(r => r.totalSales > 0) ? `$${Math.round(opsRows.reduce((a, r) => a + r.totalSales, 0)).toLocaleString()}` : "—"
    }, {
      label: "月上新合计",
      value: String(opsRows.reduce((a, r) => a + r.totalNsku, 0)) || "—"
    }]
  }), /*#__PURE__*/React.createElement(KpiStatsTable, {
    title: "\u7F8E\u5DE5 \xB7 \u5468\u8003\u6838",
    subtitle: "5 \u5206\u5236 \xB7 \u6BCF\u5929\u7EA6 1 \u5206\u5408\u683C \xB7 \u7CBE\u94FA1\u5206/\u7CBE\u54C15\u5206/A+0.5/\u89C6\u98912 \xB7 \u8FD0\u8425\u8BC4\u4EF7\u53E6\u8BA1",
    color: "#6b21a8",
    headers: ["姓名", "W1", "W2", "W3", "W4", "月均", "月均构成", "达标周", "月评价", "返工", "填写"],
    emptyHint: "\u6682\u65E0\u7F8E\u5DE5\u4EBA\u5458 \xB7 \u8BF7\u5728\u8BBE\u7F6E\u4E2D\u6DFB\u52A0",
    rows: desRows.flatMap(r => [/*#__PURE__*/React.createElement("tr", {
      key: r.name,
      style: {
        cursor: "pointer"
      },
      onClick: () => toggleDes(r.name)
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "7px 8px",
        fontWeight: 600,
        borderBottom: expandedDes[r.name] ? "none" : "1px solid var(--border)",
        whiteSpace: "nowrap",
        color: "#6b21a8"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        marginRight: 4
      }
    }, expandedDes[r.name] ? "▼" : "▶"), r.name), r.weekBreakdowns.map((s, i) => /*#__PURE__*/React.createElement(StatWeekCell, {
      key: i,
      value: s.outputPts,
      cls: desScoreCls(s.outputPts),
      fmt: v => v.toFixed(1),
      scale: 5,
      detail: desWeekDetail(s)
    })), /*#__PURE__*/React.createElement(StatWeekCell, {
      value: r.avg,
      cls: desScoreCls(r.avg),
      fmt: v => v.toFixed(1),
      scale: 5,
      detail: r.avg ? `图${r.avgImg.toFixed(0)}+视${r.avgVid.toFixed(0)}` : ""
    }), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "7px 6px",
        textAlign: "center",
        borderBottom: expandedDes[r.name] ? "none" : "1px solid var(--border)",
        fontSize: 10,
        color: "var(--tm)",
        lineHeight: 1.3
      }
    }, r.avg ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, "\u56FE", r.avgImg.toFixed(1)), /*#__PURE__*/React.createElement("div", null, "A+", r.avgAplus.toFixed(1), "+\u89C6", r.avgVid.toFixed(1))) : "—"), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "7px 8px",
        textAlign: "center",
        borderBottom: expandedDes[r.name] ? "none" : "1px solid var(--border)",
        fontSize: 12,
        fontWeight: 600,
        color: r.quotaDone === 4 ? "#2d9e52" : r.quotaDone >= 2 ? "#e09000" : r.quotaDone > 0 ? "#e55" : "var(--tm)"
      }
    }, r.quotaDone, "/4"), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "7px 8px",
        textAlign: "center",
        borderBottom: expandedDes[r.name] ? "none" : "1px solid var(--border)",
        fontSize: 12,
        color: r.reviewNet > 0 ? "#6b21a8" : r.reviewNet < 0 ? "#9ca3af" : "var(--tm)"
      }
    }, r.reviewNet !== 0 ? r.reviewNet > 0 ? `+${r.reviewNet}` : String(r.reviewNet) : "—"), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "7px 8px",
        textAlign: "center",
        borderBottom: expandedDes[r.name] ? "none" : "1px solid var(--border)",
        fontSize: 12,
        color: r.rework > 0 ? "#e55" : "var(--tm)"
      }
    }, r.rework > 0 ? r.rework : "—"), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: "7px 8px",
        textAlign: "center",
        borderBottom: expandedDes[r.name] ? "none" : "1px solid var(--border)",
        fontSize: 11,
        color: r.filledWeeks === 4 ? "#2d9e52" : "var(--tm)"
      }
    }, r.filledWeeks, "/4")), /*#__PURE__*/React.createElement(DesStatsExpandRow, {
      key: `${r.name}-detail`,
      row: r,
      colSpan: DES_COLS,
      expanded: expandedDes[r.name]
    })])
  }), desRows.length > 0 && /*#__PURE__*/React.createElement(KpiStatsSummaryChips, {
    color: "#6b21a8",
    chips: [{
      label: "美工人数",
      value: String(desRows.length)
    }, {
      label: "团队月均得分",
      value: teamDesAvg > 0 ? `${teamDesAvg.toFixed(1)}/5` : "—",
      cls: desScoreCls(teamDesAvg)
    }, {
      label: "全员达标周",
      value: `${desRows.reduce((a, r) => a + r.quotaDone, 0)}次`
    }, {
      label: "月评价净分",
      value: (() => {
        const t = desRows.reduce((a, r) => a + r.reviewNet, 0);
        return t !== 0 ? t > 0 ? `+${t}` : String(t) : "—";
      })()
    }]
  }));
}
function MonthlyBlock({
  title,
  color,
  cards,
  rows,
  tagColor: tagColorProp
}) {
  const tagColor = tagColorProp || {
    g: "#2d9e52",
    r: "#e55",
    a: "#e09000",
    t: "#00695c"
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--card)",
      border: `1px solid ${color}33`,
      borderRadius: 10,
      padding: "14px 16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.08em",
      color,
      marginBottom: 12
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
      gap: 8,
      marginBottom: 14
    }
  }, cards.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.label,
    style: {
      background: "var(--bg)",
      borderRadius: 7,
      padding: "10px 12px",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 700,
      color: c.cls ? tagColor[c.cls] : "var(--text)"
    }
  }, c.value), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginTop: 2
    }
  }, c.label)))), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: "auto"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "left",
      padding: "6px 8px",
      color: "var(--tm)",
      borderBottom: "1px solid var(--border)"
    }
  }, "\u6307\u6807"), WEEKS.map(w => /*#__PURE__*/React.createElement("th", {
    key: w,
    style: {
      padding: "6px 8px",
      color: "var(--tm)",
      borderBottom: "1px solid var(--border)"
    }
  }, "\u7B2C", w, "\u5468")), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "6px 8px",
      color,
      borderBottom: "1px solid var(--border)"
    }
  }, "\u6708\u5408\u8BA1/\u5747\u503C"))), /*#__PURE__*/React.createElement("tbody", null, rows.map(row => /*#__PURE__*/React.createElement("tr", {
    key: row.label
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "7px 8px",
      color: "var(--tm)",
      borderBottom: "1px solid var(--border)"
    }
  }, row.label), row.vals.map((v, i) => /*#__PURE__*/React.createElement("td", {
    key: i,
    style: {
      padding: "7px 8px",
      borderBottom: "1px solid var(--border)",
      color: row.cls(v) ? tagColor[row.cls(v)] : "inherit"
    }
  }, row.fmt(v))), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "7px 8px",
      borderBottom: "1px solid var(--border)",
      color,
      fontWeight: 500
    }
  }, row.fmt(row.agg), row.type === "avg" ? " (均)" : " (计)")))))));
}
function KpiPanel({
  active = true
}) {
  const currentUser = useCurrentUser();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [curRole, setCurRole] = useState("ops");
  const [curOpsSub, setCurOpsSub] = useState("bulk");
  const [curPremiumPage, setCurPremiumPage] = useState("score");
  const [curWeek, setCurWeek] = useState(1);
  const [person, setPerson] = useState("");
  const [draft, setDraft] = useState(emptyOpsWeek());
  const [skuListDraft, setSkuListDraft] = useState([]);
  const [monthTargetsDraft, setMonthTargetsDraft] = useState(emptyDevMonthTargets());
  const [toast, setToast] = useState("");
  const [staffTick, setStaffTick] = useState(0);
  const {
    items,
    persistMerge,
    meta,
    loading,
    saving,
    error,
    reload
  } = useSharedList(KPI_STORAGE_KEY, [], {
    active
  });
  const isStatsView = curRole === "stats";
  const effectiveRole = isStatsView ? "ops" : opsEffectiveRole(curRole, curOpsSub);
  const roleMeta = KPI_ROLE_META[curRole] || KPI_ROLE_META.ops;
  const roleLabel = isStatsView ? "统计" : roleMeta.label;
  const staffList = useMemo(() => {
    const list = getEmployees().filter(e => e.role === roleLabel && e.name);
    return list.length ? list : [];
  }, [roleLabel, staffTick]);
  const desStaffList = useMemo(() => {
    const list = getEmployees().filter(e => e.role === "美工" && e.name);
    return list.length ? list : [];
  }, [staffTick]);
  useEffect(() => {
    const onCfg = () => setStaffTick(t => t + 1);
    window.addEventListener("ops-global-config-updated", onCfg);
    return () => window.removeEventListener("ops-global-config-updated", onCfg);
  }, []);
  useEffect(() => {
    if (!staffList.length) {
      setPerson("");
      return;
    }
    if (!staffList.some(s => s.name === person)) setPerson(staffList[0].name);
  }, [staffList, person]);
  const draftLoadKeyRef = useRef("");
  const draftRef = useRef(draft);
  const skuListDraftRef = useRef(skuListDraft);
  const monthTargetsDraftRef = useRef(monthTargetsDraft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    skuListDraftRef.current = skuListDraft;
  }, [skuListDraft]);
  useEffect(() => {
    monthTargetsDraftRef.current = monthTargetsDraft;
  }, [monthTargetsDraft]);
  const isDraftDirtyFor = useCallback(sourceItems => {
    if (!person) return false;
    if (curRole === "dev" && curWeek === 0) {
      const saved = getDevMonthTargets(sourceItems, year, month, person);
      return JSON.stringify(monthTargetsDraftRef.current) !== JSON.stringify(saved);
    }
    if (curWeek === 0) return false;
    const saved = getWeekData(sourceItems, year, month, effectiveRole, person, curWeek);
    const weekDirty = JSON.stringify(draftRef.current) !== JSON.stringify(saved);
    if (effectiveRole === "ops_jp") {
      const savedSku = getPremiumSkuList(sourceItems, year, month, person);
      return weekDirty || JSON.stringify(skuListDraftRef.current) !== JSON.stringify(savedSku);
    }
    return weekDirty;
  }, [person, curRole, curWeek, year, month, effectiveRole]);
  useEffect(() => {
    const loadKey = `${year}|${month}|${curRole}|${curOpsSub}|${person}|${curWeek}`;
    const contextChanged = draftLoadKeyRef.current !== loadKey;
    draftLoadKeyRef.current = loadKey;
    if (!person) {
      setDraft(emptyWeekForRole(effectiveRole));
      setSkuListDraft([]);
      setMonthTargetsDraft(emptyDevMonthTargets());
      return;
    }
    if (curRole === "dev" && curWeek === 0) {
      if (contextChanged || !isDraftDirtyFor(items)) {
        setMonthTargetsDraft(getDevMonthTargets(items, year, month, person));
      }
      return;
    }
    if (curWeek === 0) return;
    if (!contextChanged && isDraftDirtyFor(items)) return;
    const wk = getWeekData(items, year, month, effectiveRole, person, curWeek);
    if (effectiveRole === "ops") {
      setDraft({
        ...wk,
        desReview: hydrateOpsDesReview(items, year, month, person, curWeek, wk.desReview)
      });
    } else {
      setDraft(wk);
    }
    if (effectiveRole === "ops_jp") {
      setSkuListDraft(getPremiumSkuList(items, year, month, person));
    }
  }, [items, year, month, curRole, curOpsSub, effectiveRole, person, curWeek, isDraftDirtyFor]);
  const weekDone = useMemo(() => {
    if (!person) return {};
    const out = {};
    WEEKS.forEach(w => {
      const d = getWeekData(items, year, month, effectiveRole, person, w);
      if (effectiveRole === "ops") out[w] = weekHasOpsData(d);else if (effectiveRole === "ops_jp") out[w] = weekHasPremiumData(d);else if (effectiveRole === "dev") out[w] = weekHasDevData(d);else out[w] = weekHasDesData(d);
    });
    return out;
  }, [items, year, month, effectiveRole, person]);
  const showToast = (msg, ok = true) => {
    setToast(msg);
    setTimeout(() => setToast(""), ok ? 2200 : 3500);
  };
  const upsertWeek = useCallback(async (weekData, skuList) => {
    if (!person) return false;
    let weekPayload = weekData;
    let desReviewPatch = null;
    if (effectiveRole === "ops") {
      const {
        desReview,
        ...rest
      } = weekData;
      weekPayload = rest;
      desReviewPatch = desReview || {};
    }
    const patch = {
      year,
      month,
      role: effectiveRole,
      person,
      weeks: {
        [curWeek]: weekPayload
      }
    };
    if (effectiveRole === "ops_jp" && skuList) patch.skuList = skuList;
    const ok = await persistMerge(latest => {
      let next = upsertKpiRecord(latest, patch);
      if (effectiveRole === "ops") {
        const prev = getWeekData(latest, year, month, "ops", person, curWeek);
        next = applyOpsDesReviewToItems(next, year, month, person, curWeek, desReviewPatch, prev.desReview);
      }
      return next;
    });
    if (ok) showToast(`第${curWeek}周已保存并上传云端 ✓`);else showToast("上传失败，请检查网络或 Gist 配置后重试", false);
    return ok;
  }, [person, year, month, effectiveRole, curWeek, persistMerge]);
  const upsertMonthTargets = useCallback(async targets => {
    if (!person || curRole !== "dev") return false;
    const patch = {
      year,
      month,
      role: "dev",
      person,
      monthTargets: targets
    };
    const ok = await persistMerge(latest => upsertKpiRecord(latest, patch));
    if (ok) showToast("月目标已保存并上传云端 ✓");else showToast("上传失败，请检查网络或 Gist 配置后重试", false);
    return ok;
  }, [person, year, month, curRole, persistMerge]);
  const saveCurrentToCloud = useCallback(async () => {
    if (!person) return "请先选择人员";
    if (curWeek === 0) {
      if (curRole === "dev") return upsertMonthTargets(monthTargetsDraft);
      return "月度汇总为汇总视图，请切换到具体周次填写后保存";
    }
    return effectiveRole === "ops_jp" ? upsertWeek(draft, skuListDraft) : upsertWeek(draft);
  }, [person, curWeek, curRole, effectiveRole, monthTargetsDraft, draft, skuListDraft, upsertMonthTargets, upsertWeek]);
  const kpiDirty = useMemo(() => {
    if (!person) return false;
    if (curRole === "dev" && curWeek === 0) {
      const saved = getDevMonthTargets(items, year, month, person);
      return JSON.stringify(monthTargetsDraft) !== JSON.stringify(saved);
    }
    if (curWeek === 0) return false;
    const saved = getWeekData(items, year, month, effectiveRole, person, curWeek);
    const weekDirty = JSON.stringify(draft) !== JSON.stringify(saved);
    if (effectiveRole === "ops_jp") {
      const savedSku = getPremiumSkuList(items, year, month, person);
      return weekDirty || JSON.stringify(skuListDraft) !== JSON.stringify(savedSku);
    }
    return weekDirty;
  }, [person, curRole, effectiveRole, curWeek, year, month, items, draft, monthTargetsDraft, skuListDraft]);
  useCloudSyncPage(active, {
    label: "考核",
    save: saveCurrentToCloud,
    reload,
    meta,
    loading,
    saving,
    error,
    isDirty: kpiDirty,
    dirtyHint: curRole === "dev" && curWeek === 0 ? "开发月目标未上传" : `考核第${curWeek}周数据未上传`
  });
  const clearWeek = () => {
    setDraft(emptyWeekForRole(effectiveRole));
  };
  const tabStyle = activeTab => `ops-segment-btn${activeTab ? " active" : ""}`;
  const wtabStyle = (w, isMonthly) => {
    const isActive = isMonthly ? curWeek === 0 : curWeek === w;
    return `ops-segment-btn${isActive ? " active" : ""}`;
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ops-page-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ops-page-title"
  }, "\u6708\u5EA6 KPI ", /*#__PURE__*/React.createElement("span", {
    className: "ops-page-title-accent"
  }, "\u8DDF\u8E2A\u8868")), /*#__PURE__*/React.createElement("div", {
    className: "ops-page-subtitle"
  }, "\u6309\u4EBA\u5458\u5206\u522B\u8BB0\u5F55 \xB7 \u4E91\u7AEF\u5171\u4EAB \xB7 ", year, "\u5E74", month, "\u6708")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, "\u5E74\u4EFD"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    className: "ops-card",
    style: {
      ...kpiInpSm,
      width: 72,
      boxShadow: "none"
    },
    value: year,
    min: 2020,
    max: 2099,
    onChange: e => setYear(+e.target.value || now.getFullYear())
  }), /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, "\u6708\u4EFD"), /*#__PURE__*/React.createElement("select", {
    className: "ops-card",
    style: {
      ...kpiInpSm,
      background: "var(--card)",
      boxShadow: "none"
    },
    value: month,
    onChange: e => setMonth(+e.target.value)
  }, Array.from({
    length: 12
  }, (_, i) => i + 1).map(m => /*#__PURE__*/React.createElement("option", {
    key: m,
    value: m
  }, m, "\u6708"))))), /*#__PURE__*/React.createElement("div", {
    className: "ops-segment",
    style: {
      marginBottom: 16,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: tabStyle(isStatsView),
    onClick: () => setCurRole("stats")
  }, "\u7EDF\u8BA1"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: tabStyle(curRole === "ops"),
    onClick: () => {
      setCurRole("ops");
      setCurWeek(1);
    }
  }, "\u8FD0\u8425"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: tabStyle(curRole === "des"),
    onClick: () => {
      setCurRole("des");
      setCurWeek(1);
    }
  }, "\u7F8E\u5DE5"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: tabStyle(curRole === "dev"),
    onClick: () => {
      setCurRole("dev");
      setCurWeek(1);
    }
  }, "\u5F00\u53D1"), curRole === "ops" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1,
      background: "var(--border)",
      margin: "4px 4px"
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: tabStyle(curOpsSub === "bulk"),
    onClick: () => {
      setCurOpsSub("bulk");
      setCurWeek(1);
    }
  }, "\u7CBE\u94FA"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: tabStyle(curOpsSub === "premium"),
    onClick: () => {
      setCurOpsSub("premium");
      setCurWeek(1);
      setCurPremiumPage("score");
    }
  }, "\u7CBE\u54C1"))), isStatsView ? /*#__PURE__*/React.createElement(KpiStatsPage, {
    items: items,
    year: year,
    month: month,
    staffTick: staffTick
  }) : /*#__PURE__*/React.createElement("div", {
    className: "ops-card ops-card-padded",
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 16,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--tm)",
      fontWeight: 500
    }
  }, "\u5F53\u524D", roleLabel), staffList.length ? /*#__PURE__*/React.createElement("select", {
    style: {
      ...kpiInpSm,
      minWidth: 140,
      background: "var(--card)"
    },
    value: person,
    onChange: e => setPerson(e.target.value)
  }, staffList.map(s => /*#__PURE__*/React.createElement("option", {
    key: s.name,
    value: s.name
  }, s.name))) : /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "#e09000"
    }
  }, "\u6682\u65E0", roleLabel, "\u4EBA\u5458 \xB7 \u8BF7\u5728 \u2699 \u8BBE\u7F6E \u2192 \u5168\u5C40\u5458\u5DE5\u540D\u5355 \u4E2D\u6DFB\u52A0\uFF08\u89D2\u8272\u9009\u300C", roleLabel, "\u300D\uFF09"), person && /*#__PURE__*/React.createElement(RoleBadge, {
    role: roleLabel
  }), person && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginLeft: "auto"
    }
  }, "\u6B63\u5728\u67E5\u770B\uFF1A", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "var(--text)"
    }
  }, person), " \u7684 ", year, "\u5E74", month, "\u6708 KPI")), !isStatsView && !person ? null : !isStatsView ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "ops-segment",
    style: {
      marginBottom: 16,
      flexWrap: "wrap"
    }
  }, WEEKS.map(w => /*#__PURE__*/React.createElement("button", {
    key: w,
    type: "button",
    className: wtabStyle(w, false),
    onClick: () => setCurWeek(w)
  }, "\u7B2C", w, "\u5468", weekDone[w] ? " ✓" : "")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: wtabStyle(0, true),
    onClick: () => setCurWeek(0)
  }, "\u6708\u5EA6\u6C47\u603B")), curWeek === 0 ? curRole === "ops" && curOpsSub === "premium" ? /*#__PURE__*/React.createElement(OpsPremiumMonthSummary, {
    items: items,
    year: year,
    month: month,
    person: person,
    getWeekData: getWeekData
  }) : curRole === "ops" ? /*#__PURE__*/React.createElement(OpsMonthlySummary, {
    items: items,
    year: year,
    month: month,
    person: person
  }) : curRole === "dev" ? /*#__PURE__*/React.createElement(DevMonthlySummary, {
    items: items,
    year: year,
    month: month,
    person: person,
    monthTargets: monthTargetsDraft,
    onMonthTargetsChange: setMonthTargetsDraft
  }) : /*#__PURE__*/React.createElement(DesMonthlySummary, {
    items: items,
    year: year,
    month: month,
    person: person
  }) : /*#__PURE__*/React.createElement(React.Fragment, null, curRole === "ops" && curOpsSub === "premium" ? /*#__PURE__*/React.createElement(OpsPremiumPanel, {
    page: curPremiumPage,
    week: curWeek,
    data: draft,
    skuList: skuListDraft,
    onChange: setDraft,
    onSkuListChange: setSkuListDraft,
    onPageChange: setCurPremiumPage
  }) : curRole === "ops" ? /*#__PURE__*/React.createElement(OpsWeekForm, {
    week: curWeek,
    data: draft,
    onChange: setDraft,
    desStaff: desStaffList,
    opsPerson: person,
    viewerName: currentUser?.name || ""
  }) : curRole === "dev" ? /*#__PURE__*/React.createElement(DevWeekForm, {
    data: draft,
    onChange: setDraft
  }) : /*#__PURE__*/React.createElement(DesWeekForm, {
    week: curWeek,
    data: draft,
    onChange: setDraft
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: clearWeek,
    disabled: saving,
    style: {
      background: "transparent",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "8px 14px",
      fontSize: 12,
      cursor: saving ? "wait" : "pointer",
      color: "var(--tm)",
      fontFamily: "inherit"
    }
  }, "\u6E05\u7A7A\u672C\u5468")))) : null, toast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      bottom: 20,
      right: 20,
      background: toast.includes("失败") ? "#fee2e2" : "#d4f0dc",
      border: `1px solid ${toast.includes("失败") ? "#fecaca" : "#86efac"}`,
      color: toast.includes("失败") ? "#e55" : "#2d9e52",
      padding: "9px 16px",
      borderRadius: 8,
      fontSize: 12,
      zIndex: 99
    }
  }, toast));
}
const ALL_CLOUD_KEYS = ["logistics", "tasks", "production", "tools-links", "agents", "kpi-monthly", "global-config"];
const LEAVE_MSG = "当前页有未上传的修改，确定离开吗？";
const CloudSyncContext = createContext(null);
function CloudSyncProvider({
  children
}) {
  const handlerRef = useRef(null);
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const bump = useCallback(() => setTick(t => t + 1), []);
  const register = useCallback(handler => {
    handlerRef.current = handler;
    setTick(t => t + 1);
  }, []);
  const unregister = useCallback(() => {
    handlerRef.current = null;
    setTick(t => t + 1);
  }, []);
  const getHandler = useCallback(() => handlerRef.current, []);
  const showToast = useCallback((msg, ms = 2200) => {
    setToast(msg);
    setTimeout(() => setToast(""), ms);
  }, []);
  const confirmLeaveIfDirty = useCallback(() => {
    const h = handlerRef.current;
    if (!h?.isDirty) return true;
    const hint = h.dirtyHint || LEAVE_MSG;
    return window.confirm(hint.endsWith("？") ? hint : `${hint}，确定离开吗？`);
  }, []);
  useEffect(() => {
    const onBeforeUnload = e => {
      const h = handlerRef.current;
      if (!h?.isDirty) return;
      e.preventDefault();
      e.returnValue = h.dirtyHint || LEAVE_MSG;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
  const reloadAllCloud = useCallback(async () => {
    setBusy(true);
    try {
      await handlerRef.current?.reload?.();
      await fetchGlobalConfigFromCloud();
      ALL_CLOUD_KEYS.forEach(key => {
        window.dispatchEvent(new CustomEvent(`ops-shared-updated:${key}`));
      });
      showToast("已从云端更新 ✓");
    } catch {
      showToast("云端更新失败，请重试", 3000);
    } finally {
      setBusy(false);
    }
  }, [showToast]);
  useEffect(() => {
    fetchGlobalConfigFromCloud().catch(() => {});
    if (CLOUD_POLL_MS <= 0) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") fetchGlobalConfigFromCloud().catch(() => {});
    }, CLOUD_POLL_MS);
    return () => clearInterval(timer);
  }, []);
  const saveToCloud = useCallback(async () => {
    const h = handlerRef.current;
    if (!h?.save) {
      showToast("当前页无待保存草稿；弹窗内点「保存」会自动上传", 2800);
      return;
    }
    setBusy(true);
    try {
      const ok = await h.save();
      if (ok === false) showToast("上传失败，请检查网络或 Gist 配置", 3200);else if (typeof ok === "string") showToast(ok);else showToast("已保存并上传云端 ✓");
    } catch (e) {
      showToast(e?.message || "上传失败", 3200);
    } finally {
      setBusy(false);
    }
  }, [showToast]);
  return /*#__PURE__*/React.createElement(CloudSyncContext.Provider, {
    value: {
      register,
      unregister,
      bump,
      tick,
      getHandler,
      confirmLeaveIfDirty,
      saveToCloud,
      reloadAllCloud,
      busy
    }
  }, children, toast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      bottom: 20,
      right: 20,
      zIndex: 200,
      background: toast.includes("失败") ? "#fee2e2" : "#d4f0dc",
      border: `1px solid ${toast.includes("失败") ? "#fecaca" : "#86efac"}`,
      color: toast.includes("失败") ? "#e55" : "#2d9e52",
      padding: "9px 16px",
      borderRadius: 8,
      fontSize: 12
    }
  }, toast));
}
function useCloudSyncPage(active, handlers) {
  const ctx = useContext(CloudSyncContext);
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!active || !ctx) return;
    ctx.register({
      get label() {
        return ref.current.label;
      },
      get save() {
        return ref.current.save;
      },
      get reload() {
        return ref.current.reload;
      },
      get meta() {
        return ref.current.meta;
      },
      get loading() {
        return ref.current.loading;
      },
      get saving() {
        return ref.current.saving;
      },
      get error() {
        return ref.current.error;
      },
      get isDirty() {
        return !!ref.current.isDirty;
      },
      get dirtyHint() {
        return ref.current.dirtyHint;
      }
    });
    return () => ctx.unregister();
  }, [active, ctx]);
  useEffect(() => {
    if (active && ctx) ctx.bump();
  }, [active, ctx, handlers.meta, handlers.loading, handlers.saving, handlers.error, handlers.label, handlers.isDirty]);
}
function useConfirmLeave() {
  const ctx = useContext(CloudSyncContext);
  return ctx?.confirmLeaveIfDirty || (() => true);
}
function GlobalCloudBar() {
  const ctx = useContext(CloudSyncContext);
  const _tick = ctx?.tick;
  const handler = ctx?.getHandler?.();
  const busy = ctx?.busy;
  const onSave = ctx?.saveToCloud;
  const onReload = ctx?.reloadAllCloud;
  if (!ctx) return null;
  const loading = busy || handler?.loading;
  const saving = busy || handler?.saving;
  const error = handler?.error;
  const pollMin = CLOUD_POLL_MS > 0 ? Math.round(CLOUD_POLL_MS / 60000) : 0;
  let bg = "#ecfdf5",
    border = "#6ee7b7",
    color = "#065f46";
  let text = pollMin > 0 ? `☁️ 全站云端同步 · 请点「从云端更新」手动拉取；页面可见时每 ${pollMin} 分钟自动拉一次` : "☁️ 全站云端同步 · 请点「从云端更新」手动拉取；填写后点「保存并上传」";
  if (handler?.isDirty) {
    bg = "#fffbeb";
    border = "#fcd34d";
    color = "#92400e";
    text = `⚠️ ${handler.dirtyHint || "有未上传的修改"} · 离开前请先「保存并上传」`;
  } else if (loading && !saving) {
    bg = "#f3f4f6";
    border = "#d1d5db";
    color = "#4b5563";
    text = "⏳ 正在从云端加载…";
  } else if (saving) {
    bg = "#eef6ff";
    border = "#b8d4f0";
    color = "#1a4e8a";
    text = "⏳ 正在保存并上传到云端…";
  } else if (error) {
    bg = "#fee2e2";
    border = "#fca5a5";
    color = "#991b1b";
    text = `❌ ${error} · 已暂存本机，请重试上传`;
  } else if (handler?.meta?.updatedBy) {
    const who = handler.meta.updatedBy;
    const when = formatSharedTime(handler.meta.updatedAt);
    const page = handler.label ? `（${handler.label}）` : "";
    text = pollMin > 0 ? `☁️ 最后由 ${who} 更新于 ${when}${page} · 手动更新；可见时每 ${pollMin} 分钟自动拉取` : `☁️ 最后由 ${who} 更新于 ${when}${page} · 请手动点「从云端更新」`;
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "ops-cloud-bar",
    style: {
      color,
      background: bg,
      border: `1px solid ${border}`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, text), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    disabled: loading || saving,
    onClick: onSave,
    className: "ops-btn ops-btn-primary",
    style: {
      opacity: loading || saving ? 0.85 : 1,
      cursor: loading || saving ? "wait" : "pointer",
      minWidth: 108
    }
  }, saving ? "上传中…" : "☁️ 保存并上传"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    disabled: loading || saving,
    onClick: onReload,
    className: "ops-btn",
    style: {
      opacity: loading || saving ? 0.75 : 1,
      cursor: loading || saving ? "wait" : "pointer",
      minWidth: 88
    }
  }, loading ? "更新中…" : "↻ 从云端更新")));
}
window.CloudSyncProvider = CloudSyncProvider;
window.useCloudSyncPage = useCloudSyncPage;
window.GlobalCloudBar = GlobalCloudBar;

// LogisticsModule.browser.jsx loads storage + GlobalConfig first.

// ─── TASK MODULE ──────────────────────────────────────────────────────
const NODE_STATUSES = [{
  val: "done",
  label: "完成",
  dot: "#2d9e52",
  color: "#1a6b35"
}, {
  val: "current",
  label: "进行中",
  dot: "#2d7dd2",
  color: "#1a4e8a"
}, {
  val: "blocked",
  label: "受阻",
  dot: "#e09000",
  color: "#7a4a00"
}, {
  val: "todo",
  label: "待开始",
  dot: "#bbb",
  color: "#666"
}];
const nsMeta = v => NODE_STATUSES.find(x => x.val === v) || NODE_STATUSES[3];
/** 旧任务分类 → 全局角色 */
const TASK_CAT_LEGACY_MAP = {
  研发: "开发",
  品牌: "管理"
};
function normalizeTaskCat(cat) {
  if (!cat) return STAFF_ROLE_OPTIONS[0] || "运营";
  return TASK_CAT_LEGACY_MAP[cat] || cat;
}
function taskCatBadge(cat) {
  const role = normalizeTaskCat(cat);
  const c = ROLE_COLORS[role];
  return c ? {
    bg: c.bg,
    c: c.color
  } : {
    bg: "#f3f4f6",
    c: "#666"
  };
}
function taskCatOptions(current) {
  const opts = [...STAFF_ROLE_OPTIONS];
  const norm = normalizeTaskCat(current);
  if (norm && !opts.includes(norm)) opts.push(norm);
  if (current && current !== norm && !opts.includes(current)) opts.push(current);
  return opts;
}
const DEFAULT_TASK_CAT = STAFF_ROLE_OPTIONS[0] || "运营";
const taskStatusOf = t => {
  if (t.actual) return "done";
  if (t.nodes && t.nodes.some(n => n.status === "blocked")) return "blocked";
  const d = daysDiff(t.due);
  if (d === null) return "inprog";
  if (d < 0) return "over";
  return "inprog";
};
const taskIsOverdue = t => !t.actual && daysDiff(t.due) !== null && daysDiff(t.due) < 0;
const getProgress = nodes => {
  if (!nodes || !nodes.length) return 0;
  return Math.round(nodes.filter(n => n.status === "done").length / nodes.length * 100);
};
const INIT_TASKS = [{
  id: 1,
  task: "FB100/101/200/201欧规样品制作",
  owner: "张工",
  cat: "设计",
  due: "2026-06-20",
  actual: "",
  nodes: [{
    name: "FB100",
    status: "done"
  }, {
    name: "FB101",
    status: "done"
  }, {
    name: "FB200",
    status: "current"
  }, {
    name: "FB201",
    status: "todo"
  }],
  block: "FB200模具待供应商确认"
}, {
  id: 2,
  task: "43条链接图设计排期",
  owner: "张工",
  cat: "设计",
  due: "2026-06-05",
  actual: "",
  nodes: [{
    name: "排期制定",
    status: "done"
  }, {
    name: "初稿输出",
    status: "current"
  }, {
    name: "审核",
    status: "todo"
  }, {
    name: "提交",
    status: "todo"
  }],
  block: ""
}, {
  id: 3,
  task: "FB300多士炉图片",
  owner: "杨彬",
  cat: "运营",
  due: "2026-05-28",
  actual: "",
  nodes: [{
    name: "拍摄",
    status: "done"
  }, {
    name: "修图",
    status: "blocked"
  }, {
    name: "上架",
    status: "todo"
  }],
  block: "修图师生病，预计延迟3天"
}, {
  id: 4,
  task: "FB102感温变色图档样品",
  owner: "张工",
  cat: "开发",
  due: "2026-06-15",
  actual: "",
  nodes: [{
    name: "工艺确认",
    status: "blocked"
  }, {
    name: "图档",
    status: "todo"
  }, {
    name: "打样",
    status: "todo"
  }, {
    name: "确样",
    status: "todo"
  }],
  block: "油墨供应商报价超预期40%，等待决策"
}, {
  id: 5,
  task: "FB400豆浆机功能测试",
  owner: "张工",
  cat: "开发",
  due: "2026-06-10",
  actual: "2026-05-25",
  nodes: [{
    name: "温度测试",
    status: "done"
  }, {
    name: "闪光测试",
    status: "done"
  }, {
    name: "整机",
    status: "done"
  }],
  block: ""
}, {
  id: 6,
  task: "FB欧洲德法品牌注册",
  owner: "王律师",
  cat: "管理",
  due: "2026-06-15",
  actual: "",
  nodes: [{
    name: "材料准备",
    status: "done"
  }, {
    name: "德国提交",
    status: "current"
  }, {
    name: "法国提交",
    status: "todo"
  }, {
    name: "回执",
    status: "todo"
  }],
  block: ""
}];
function NodeRow({
  node,
  onChange,
  onRemove
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      alignItems: "center",
      marginBottom: 5
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: node.name,
    onChange: e => onChange({
      ...node,
      name: e.target.value
    }),
    placeholder: "\u8282\u70B9\u540D\u79F0",
    style: {
      ...inpSm,
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("select", {
    value: node.status,
    onChange: e => onChange({
      ...node,
      status: e.target.value
    }),
    style: {
      ...inpSm,
      width: 86,
      background: "var(--card)"
    }
  }, NODE_STATUSES.map(s => /*#__PURE__*/React.createElement("option", {
    key: s.val,
    value: s.val
  }, s.label))), /*#__PURE__*/React.createElement("button", {
    onClick: onRemove,
    style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      color: "#aaa",
      fontSize: 18,
      padding: "0 3px"
    }
  }, "\xD7"));
}
function TaskModal({
  task,
  tasks,
  onSave,
  onClose,
  onDelete
}) {
  const [form, setForm] = useState(task);
  const [nodes, setNodes] = useState(task.nodes ? task.nodes.map(n => ({
    ...n
  })) : []);
  const set = (k, v) => setForm(f => ({
    ...f,
    [k]: v
  }));
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.4)",
      zIndex: 200,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: "2rem 1rem",
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 14,
      padding: "1.5rem",
      width: "100%",
      maxWidth: 480,
      color: "var(--text)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 15,
      marginBottom: "1rem"
    }
  }, task.id ? "编辑任务" : "新建任务"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u4EFB\u52A1\u5185\u5BB9"), /*#__PURE__*/React.createElement("textarea", {
    value: form.task,
    onChange: e => set("task", e.target.value),
    placeholder: "\u63CF\u8FF0\u4EFB\u52A1\u2026",
    style: {
      ...inp,
      height: 52,
      resize: "none"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u8D1F\u8D23\u4EBA"), /*#__PURE__*/React.createElement(OwnerField, {
    value: form.owner,
    onChange: v => set("owner", v),
    inputStyle: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5206\u7C7B\uFF08\u89D2\u8272\uFF09"), /*#__PURE__*/React.createElement("select", {
    value: normalizeTaskCat(form.cat),
    onChange: e => set("cat", e.target.value),
    style: {
      ...inp,
      background: "var(--card)"
    }
  }, taskCatOptions(form.cat).map(c => /*#__PURE__*/React.createElement("option", {
    key: c,
    value: c
  }, c))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u9884\u8BA1\u5B8C\u6210"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.due,
    onChange: e => set("due", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5B9E\u9645\u5B8C\u6210"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.actual,
    onChange: e => set("actual", e.target.value),
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--tm)",
      borderTop: "1px solid var(--border)",
      paddingTop: 10,
      marginBottom: 8
    }
  }, "\u4EFB\u52A1\u8282\u70B9"), nodes.map((n, i) => /*#__PURE__*/React.createElement(NodeRow, {
    key: i,
    node: n,
    onChange: v => {
      const a = [...nodes];
      a[i] = v;
      setNodes(a);
    },
    onRemove: () => setNodes(nodes.filter((_, j) => j !== i))
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => setNodes([...nodes, {
      name: "",
      status: "todo"
    }]),
    style: {
      width: "100%",
      border: "1px dashed var(--border)",
      borderRadius: 8,
      padding: "5px 0",
      fontSize: 12,
      cursor: "pointer",
      color: "var(--tm)",
      background: "transparent",
      marginBottom: 12,
      fontFamily: "inherit"
    }
  }, "+ \u6DFB\u52A0\u8282\u70B9"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--tm)",
      borderTop: "1px solid var(--border)",
      paddingTop: 10,
      marginBottom: 8
    }
  }, "\u5361\u70B9\u8BF4\u660E"), /*#__PURE__*/React.createElement("textarea", {
    value: form.block,
    onChange: e => set("block", e.target.value),
    placeholder: "\u7B49\u5F85\u4EC0\u4E48\uFF1F\u8C01\u51B3\u7B56\uFF1F\u9884\u8BA1\u4F55\u65F6\u89E3\u51B3\uFF1F",
    style: {
      ...inp,
      height: 48,
      resize: "none",
      marginBottom: 12
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderTop: "1px solid var(--border)",
      paddingTop: 12
    }
  }, task.id ? /*#__PURE__*/React.createElement("button", {
    onClick: onDelete,
    style: {
      background: "none",
      border: "none",
      color: "#e55",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "\u5220\u9664") : /*#__PURE__*/React.createElement("div", null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      background: "transparent",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "6px 14px",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "var(--tm)"
    }
  }, "\u53D6\u6D88"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      if (!form.task.trim()) return;
      onSave({
        ...form,
        nodes: nodes.filter(n => n.name.trim())
      });
    },
    style: {
      background: "#2d7dd2",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      padding: "6px 16px",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit",
      fontWeight: 600
    }
  }, "\u4FDD\u5B58")))));
}
function TaskCard({
  task,
  onClick
}) {
  const st = taskStatusOf(task);
  const prog = getProgress(task.nodes);
  const cc = taskCatBadge(task.cat);
  const catLabel = normalizeTaskCat(task.cat);
  const d = daysDiff(task.due);
  const bc = st === "over" ? "#e55" : st === "blocked" ? "#e09000" : st === "done" ? "#2d9e52" : "#2d7dd2";
  let due = null;
  if (task.actual) due = /*#__PURE__*/React.createElement("span", {
    style: badge("#d4f0dc", "#1a6b35")
  }, "\u2713 ", fmtD(task.actual));else if (task.due) {
    if (taskIsOverdue(task)) due = /*#__PURE__*/React.createElement("span", {
      style: badge("#fee2e2", "#b91c1c")
    }, "\u903E\u671F", Math.abs(d), "\u5929");else due = /*#__PURE__*/React.createElement("span", {
      style: badge("#f3f4f6", "#666")
    }, "\uD83D\uDCC5", fmtD(task.due));
  }
  const role = getStaffRole(task.owner);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    className: "ops-card ops-card-hover ops-card-padded",
    style: {
      borderLeft: `3px solid ${bc}`,
      borderRadius: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontSize: 13,
      fontWeight: 600,
      lineHeight: 1.4,
      color: st === "done" ? "var(--tm)" : "var(--text)",
      textDecoration: st === "done" ? "line-through" : "none"
    }
  }, task.task), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: task.owner
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, task.owner), /*#__PURE__*/React.createElement(RoleBadge, {
    role: role
  }))), task.nodes && task.nodes.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 3,
      background: "var(--border)",
      borderRadius: 2,
      marginBottom: 7,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: `${prog}%`,
      background: bc,
      borderRadius: 2
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 0,
      marginBottom: 7
    }
  }, task.nodes.map((n, i) => {
    const nm = nsMeta(n.status);
    const ic = n.status === "current";
    return /*#__PURE__*/React.createElement("span", {
      key: i,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 3
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: ic ? 10 : 8,
        height: ic ? 10 : 8,
        borderRadius: "50%",
        background: nm.dot,
        outline: ic ? `2px solid ${nm.dot}` : "none",
        outlineOffset: 2,
        display: "inline-block",
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: ic ? nm.color : "var(--tm)",
        fontWeight: ic ? 600 : 400
      }
    }, n.name), i < task.nodes.length - 1 && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        color: "var(--tm)",
        margin: "0 3px"
      }
    }, "\u2192"));
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 5,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: badge(cc.bg, cc.c)
  }, catLabel), due, prog > 0 && prog < 100 && /*#__PURE__*/React.createElement("span", {
    style: badge("#f3f4f6", "#666")
  }, prog, "%")), task.block && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      padding: "6px 10px",
      background: "#fff8e6",
      color: "#7a4a00",
      borderRadius: 7,
      fontSize: 11,
      lineHeight: 1.5,
      borderLeft: "3px solid #e09000"
    }
  }, "\u26A1 ", task.block));
}
function TasksPanel({
  active = true
}) {
  const {
    items: tasks,
    meta,
    loading,
    saving,
    error,
    persist,
    reload
  } = useSharedList("tasks", INIT_TASKS, {
    active
  });
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const nextId = () => Math.max(0, ...tasks.map(t => t.id || 0)) + 1;
  const counts = {
    all: tasks.length,
    over: tasks.filter(taskIsOverdue).length,
    blocked: tasks.filter(t => taskStatusOf(t) === "blocked").length,
    inprog: tasks.filter(t => taskStatusOf(t) === "inprog").length,
    done: tasks.filter(t => taskStatusOf(t) === "done").length
  };
  const sortO = {
    over: 0,
    blocked: 1,
    inprog: 2,
    done: 3
  };
  let vis = filter === "all" ? tasks : filter === "over" ? tasks.filter(taskIsOverdue) : tasks.filter(t => taskStatusOf(t) === filter);
  vis = [...vis].sort((a, b) => (sortO[taskStatusOf(a)] || 2) - (sortO[taskStatusOf(b)] || 2));
  const save = t => {
    const row = {
      ...t,
      cat: normalizeTaskCat(t.cat)
    };
    if (row.id) persist(tasks.map(x => x.id === row.id ? row : x));else persist([...tasks, {
      ...row,
      id: nextId()
    }]);
    setModal(null);
  };
  const tabs = [{
    key: "all",
    label: "全部",
    nc: "var(--text)"
  }, {
    key: "over",
    label: "逾期",
    nc: "#e55"
  }, {
    key: "blocked",
    label: "受阻",
    nc: "#c07000"
  }, {
    key: "inprog",
    label: "进行中",
    nc: "#2d7dd2"
  }, {
    key: "done",
    label: "已完成",
    nc: "#2d9e52"
  }];
  useCloudSyncPage(active, {
    label: "任务",
    save: async () => persist(tasks),
    reload,
    meta,
    loading,
    saving,
    error,
    isDirty: !!modal,
    dirtyHint: "任务编辑弹窗未保存"
  });
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "1rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(5, 1fr)",
      gap: 10,
      flex: 1,
      marginRight: 12
    }
  }, tabs.map(f => /*#__PURE__*/React.createElement("div", {
    key: f.key,
    onClick: () => setFilter(f.key),
    className: `ops-metric-card ops-card-hover${filter === f.key ? "" : ""}`,
    style: {
      borderColor: filter === f.key ? "#4080FF" : "var(--border)",
      boxShadow: filter === f.key ? "0 0 0 1px #4080FF" : undefined
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-value",
    style: {
      fontSize: 20,
      color: f.nc
    }
  }, counts[f.key]), /*#__PURE__*/React.createElement("div", {
    className: "ops-metric-label",
    style: {
      marginTop: 2,
      marginBottom: 0
    }
  }, f.label)))), /*#__PURE__*/React.createElement("button", {
    onClick: () => setModal({
      task: "",
      owner: "",
      cat: DEFAULT_TASK_CAT,
      due: "",
      actual: "",
      nodes: [],
      block: ""
    }),
    className: "ops-btn ops-btn-primary",
    style: {
      flexShrink: 0
    }
  }, "+ \u65B0\u5EFA")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, vis.length ? vis.map(t => /*#__PURE__*/React.createElement(TaskCard, {
    key: t.id,
    task: t,
    onClick: () => setModal({
      ...t,
      nodes: t.nodes ? t.nodes.map(n => ({
        ...n
      })) : []
    })
  })) : /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "2rem",
      color: "var(--tm)",
      fontSize: 13
    }
  }, "\u6682\u65E0\u4EFB\u52A1")), modal && /*#__PURE__*/React.createElement(TaskModal, {
    task: modal,
    tasks: tasks,
    onSave: save,
    onClose: () => {
      if (!window.confirm("弹窗未点「保存」，修改不会上传。确定关闭？")) return;
      setModal(null);
    },
    onDelete: () => {
      persist(tasks.filter(x => x.id !== modal.id), {
        replace: true
      });
      setModal(null);
    }
  }));
}
const TABS = [{
  key: "home",
  label: "首页",
  icon: "home"
}, {
  key: "tasks",
  label: "任务跟进",
  icon: "tasks"
}, {
  key: "logistics",
  label: "物流头程",
  icon: "logistics"
}, {
  key: "production",
  label: "精品生产",
  icon: "production"
}, {
  key: "kpi",
  label: "考核",
  icon: "kpi"
}, {
  key: "tools",
  label: "工具",
  icon: "tools"
}, {
  key: "agents",
  label: "AI 智能体",
  icon: "agents"
}, {
  key: "knowledge",
  label: "知识库",
  icon: "knowledge"
}, {
  key: "keywords",
  label: "关键词库",
  icon: "keywords"
}];
const TAB_TITLES = Object.fromEntries(TABS.map(t => [t.key, t.label]));
function NavIcon({
  name
}) {
  const s = {
    width: 18,
    height: 18,
    stroke: "currentColor",
    fill: "none",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  };
  if (name === "home") return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    style: s
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z"
  }));
  if (name === "tasks") return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    style: s
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "4",
    width: "18",
    height: "18",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 10h8M8 14h5"
  }));
  if (name === "logistics") return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    style: s
  }, /*#__PURE__*/React.createElement("rect", {
    x: "1",
    y: "6",
    width: "15",
    height: "10",
    rx: "1"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 9h4l3 4v3h-7V9z"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6",
    cy: "18",
    r: "2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "18",
    cy: "18",
    r: "2"
  }));
  if (name === "production") return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    style: s
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2 20h20M5 20V10l7-6 7 6v10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9 20v-5h6v5"
  }));
  if (name === "kpi") return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    style: s
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 19V5M4 19h16"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 15l3-4 3 2 5-7"
  }));
  if (name === "tools") return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    style: s
  }, /*#__PURE__*/React.createElement("path", {
    d: "M14.7 6.3a4 4 0 105.4 5.4L12 20l-3-3 7.7-10.7z"
  }));
  if (name === "agents") return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    style: s
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "8",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 20c0-4 3.6-7 8-7s8 3 8 7"
  }));
  if (name === "knowledge") return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    style: s
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 19.5A2.5 2.5 0 016.5 17H20"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"
  }));
  if (name === "keywords") return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    style: s
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M21 21l-4.3-4.3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 11h6M11 8v6"
  }));
  return null;
}
function BrandLogo({
  size = 28
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 32 32",
    "aria-hidden": true,
    style: {
      flexShrink: 0,
      display: "block"
    }
  }, /*#__PURE__*/React.createElement("rect", {
    x: "1",
    y: "1",
    width: "30",
    height: "30",
    rx: "8",
    fill: "#4080FF"
  }), /*#__PURE__*/React.createElement("text", {
    x: "16",
    y: "22",
    textAnchor: "middle",
    fill: "#fff",
    fontSize: "18",
    fontWeight: "700",
    fontFamily: "'PingFang SC','Microsoft YaHei',system-ui,sans-serif"
  }, "H"));
}
const SETTINGS_MENU_ITEMS = [{
  key: "staff",
  label: "全局员工名单"
}];
function SettingsMenu({
  onSelect
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = e => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const pick = key => {
    setOpen(false);
    onSelect(key);
  };
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: {
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "ops-btn",
    onClick: () => setOpen(o => !o),
    "aria-expanded": open,
    title: "\u8BBE\u7F6E"
  }, "\u2699 \u8BBE\u7F6E ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      opacity: 0.7
    }
  }, "\u25BE")), open && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      right: 0,
      top: "calc(100% + 4px)",
      minWidth: 148,
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: 4,
      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
      zIndex: 50
    }
  }, SETTINGS_MENU_ITEMS.map(item => /*#__PURE__*/React.createElement("button", {
    key: item.key,
    type: "button",
    onClick: () => pick(item.key),
    style: {
      display: "block",
      width: "100%",
      textAlign: "left",
      background: "transparent",
      border: "none",
      borderRadius: 7,
      padding: "8px 12px",
      fontSize: 12,
      cursor: "pointer",
      color: "var(--text)",
      fontFamily: "inherit"
    },
    onMouseEnter: e => e.currentTarget.style.background = "var(--bg)",
    onMouseLeave: e => e.currentTarget.style.background = "transparent"
  }, item.label))));
}
const APP_ORG_NAME = "泓森拓创科技";
const APP_PASSWORD = "X888888";
const APP_BUILD = "cloud-37-depth";
const AUTH_SESSION_KEY = "ops-center-auth";
function readAuthSession() {
  try {
    return sessionStorage.getItem(AUTH_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}
function LoginScreen({
  onSuccess
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = e => {
    e.preventDefault();
    if (password === APP_PASSWORD) {
      setCurrentUser({
        id: APP_ORG_NAME,
        name: APP_ORG_NAME
      });
      try {
        sessionStorage.setItem(AUTH_SESSION_KEY, "1");
      } catch {/* ignore */}
      onSuccess();
      return;
    }
    setError("密码错误，请重试");
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "ops-login-wrap"
  }, /*#__PURE__*/React.createElement("form", {
    onSubmit: submit,
    className: "ops-login-card"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(BrandLogo, {
    size: 36
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700
    }
  }, APP_ORG_NAME), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--tm)",
      marginTop: 2
    }
  }, "\u8FD0\u8425\u4E2D\u5FC3"))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--tm)",
      marginBottom: 18,
      lineHeight: 1.55
    }
  }, "\u8BF7\u8F93\u5165\u56E2\u961F\u8BBF\u95EE\u5BC6\u7801\u540E\u8FDB\u5165"), /*#__PURE__*/React.createElement("label", {
    style: {
      display: "block",
      fontSize: 11,
      color: "var(--tm)",
      marginBottom: 6,
      fontWeight: 500
    }
  }, "\u8BBF\u95EE\u5BC6\u7801"), /*#__PURE__*/React.createElement("input", {
    type: "password",
    value: password,
    onChange: e => {
      setPassword(e.target.value);
      if (error) setError("");
    },
    placeholder: "\u8BF7\u8F93\u5165\u5BC6\u7801",
    autoFocus: true,
    style: {
      width: "100%",
      fontSize: 14,
      padding: "10px 12px",
      border: `1px solid ${error ? "#F53F3F" : "var(--border)"}`,
      borderRadius: 10,
      fontFamily: "inherit",
      marginBottom: error ? 8 : 16,
      background: "var(--bg)"
    }
  }), error && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#F53F3F",
      marginBottom: 12
    }
  }, error), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    className: "ops-btn ops-btn-primary",
    style: {
      width: "100%",
      padding: "10px 14px",
      fontSize: 14,
      justifyContent: "center"
    }
  }, "\u8FDB\u5165\u8FD0\u8425\u4E2D\u5FC3")));
}
function AppShell({
  tab,
  setTab,
  dark,
  setDark,
  settingsPanel,
  setSettingsPanel
}) {
  const confirmLeave = useConfirmLeave();
  const trySetTab = key => {
    if (key === tab) return;
    if (!confirmLeave()) return;
    setTab(key);
  };
  const css = {
    "--bg": dark ? "#0d0d0d" : "#F4F7FE",
    "--card": dark ? "#1a1a1a" : "#FFFFFF",
    "--border": dark ? "rgba(255,255,255,0.08)" : "rgba(163,174,208,0.18)",
    "--border-light": dark ? "rgba(255,255,255,0.05)" : "rgba(163,174,208,0.12)",
    "--text": dark ? "#e8e8e8" : "#1B2559",
    "--tm": dark ? "#888" : "#A3AED0",
    "--primary": "#4318FF",
    "--primary-light": dark ? "#1a2a4a" : "#E9E3FF",
    "--shadow-card": dark ? "0 4px 18px rgba(0,0,0,0.35)" : "0 4px 18px rgba(112,144,176,0.12), 0 1px 3px rgba(112,144,176,0.06)",
    "--shadow-md": dark ? "0 8px 24px rgba(0,0,0,0.45)" : "0 8px 24px rgba(112,144,176,0.14)"
  };
  return /*#__PURE__*/React.createElement("div", {
    className: `ops-app${dark ? " ops-theme-dark" : " ops-theme-light"}`,
    style: css
  }, /*#__PURE__*/React.createElement("aside", {
    className: "ops-sidebar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-sidebar-brand"
  }, /*#__PURE__*/React.createElement(BrandLogo, {
    size: 32
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ops-sidebar-brand-text"
  }, "\u6CD3\u68EE\u62D3\u521B\u79D1\u6280"), /*#__PURE__*/React.createElement("span", {
    className: "ops-badge ops-badge-sidebar",
    style: {
      marginTop: 4
    }
  }, APP_BUILD))), /*#__PURE__*/React.createElement("nav", {
    className: "ops-sidebar-nav"
  }, TABS.map(t => /*#__PURE__*/React.createElement("div", {
    key: t.key,
    className: "ops-nav-item-wrap"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: `ops-nav-item${tab === t.key ? " active" : ""}`,
    onClick: () => trySetTab(t.key)
  }, /*#__PURE__*/React.createElement("span", {
    className: "ops-nav-icon"
  }, /*#__PURE__*/React.createElement(NavIcon, {
    name: t.icon
  })), t.label)))), /*#__PURE__*/React.createElement("div", {
    className: "ops-sidebar-footer"
  }, "\u8FD0\u8425\u4E2D\u5FC3 \xB7 \u4E91\u7AEF\u540C\u6B65")), /*#__PURE__*/React.createElement("div", {
    className: "ops-main"
  }, /*#__PURE__*/React.createElement("header", {
    className: "ops-topbar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ops-topbar-title"
  }, TAB_TITLES[tab] || "运营中心"), /*#__PURE__*/React.createElement("div", {
    className: "ops-topbar-actions"
  }, /*#__PURE__*/React.createElement(SettingsMenu, {
    onSelect: key => {
      if (key === "staff") setSettingsPanel("staff");
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "ops-btn",
    onClick: () => setDark(!dark)
  }, dark ? "☀ 日间" : "☾ 夜间"))), /*#__PURE__*/React.createElement("main", {
    className: "ops-content",
    style: {
      maxWidth: tab === "kpi" || tab === "knowledge" || tab === "keywords" ? 1280 : 960
    }
  }, /*#__PURE__*/React.createElement(GlobalCloudBar, null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: tab === "home" ? "block" : "none"
    }
  }, /*#__PURE__*/React.createElement(HomePanel, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: tab === "tasks" ? "block" : "none"
    }
  }, /*#__PURE__*/React.createElement(TasksPanel, {
    active: tab === "tasks"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: tab === "logistics" ? "block" : "none"
    }
  }, /*#__PURE__*/React.createElement(LogisticsPanel, {
    active: tab === "logistics"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: tab === "production" ? "block" : "none"
    }
  }, /*#__PURE__*/React.createElement(ProductionPanel, {
    active: tab === "production"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: tab === "kpi" ? "block" : "none"
    }
  }, /*#__PURE__*/React.createElement(KpiPanel, {
    active: tab === "kpi"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: tab === "knowledge" ? "block" : "none"
    }
  }, /*#__PURE__*/React.createElement(KnowledgePanel, {
    active: tab === "knowledge"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: tab === "keywords" ? "block" : "none"
    }
  }, /*#__PURE__*/React.createElement(KeywordPanel, {
    active: tab === "keywords"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: tab === "tools" ? "block" : "none"
    }
  }, /*#__PURE__*/React.createElement(ToolsPanel, {
    active: tab === "tools"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: tab === "agents" ? "block" : "none"
    }
  }, /*#__PURE__*/React.createElement(AgentsPanel, {
    active: tab === "agents"
  })))), settingsPanel === "staff" && /*#__PURE__*/React.createElement(GlobalSettingsModal, {
    onClose: () => setSettingsPanel(null),
    onSaved: () => setSettingsPanel(null)
  }));
}
function App() {
  const [authed, setAuthed] = useState(readAuthSession);
  const [currentUser, setCurrentUserState] = useState(() => getCurrentUser());
  const [tab, setTab] = useState("home");
  const [dark, setDark] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState(null);
  if (!authed) {
    return /*#__PURE__*/React.createElement(LoginScreen, {
      onSuccess: () => {
        setCurrentUserState(getCurrentUser());
        setAuthed(true);
      }
    });
  }
  return /*#__PURE__*/React.createElement(UserContext.Provider, {
    value: currentUser
  }, /*#__PURE__*/React.createElement(CloudSyncProvider, null, /*#__PURE__*/React.createElement(AppShell, {
    tab: tab,
    setTab: setTab,
    dark: dark,
    setDark: setDark,
    settingsPanel: settingsPanel,
    setSettingsPanel: setSettingsPanel
  })));
}
if (!window.__OPS_CENTER_MOUNTED__) {
  window.__OPS_CENTER_MOUNTED__ = true;
  const mountEl = document.getElementById("root");
  mountEl.replaceChildren();
  ReactDOM.createRoot(mountEl).render(/*#__PURE__*/React.createElement(App, null));
}

const { useState, useRef, useEffect, useCallback, useMemo, createContext, useContext } = React;

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const fmtD = (d) => { if (!d) return "—"; const p = d.split("-"); return p[1] + "/" + p[2]; };
const daysDiff = (due) => { if (!due) return null; const d = new Date(due); d.setHours(0, 0, 0, 0); return Math.round((d - TODAY) / 86400000); };
const badge = (bg, color, extra = {}) => ({ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: bg, color, fontWeight: 500, whiteSpace: "nowrap", ...extra });
const lbl = { display: "block", fontSize: 11, color: "var(--tm)", marginBottom: 3, fontWeight: 500 };
const inp = { width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", background: "transparent", color: "inherit", display: "block" };
const inpSm = { fontSize: 12, padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 6, fontFamily: "inherit", background: "transparent", color: "inherit" };
const AVATAR_PALETTE = [["#dbeafe", "#1e3a8a"], ["#d1fae5", "#065f46"], ["#fef3c7", "#78350f"], ["#ede9fe", "#4c1d95"], ["#fce7f3", "#831843"], ["#fee2e2", "#7f1d1d"], ["#d1fae5", "#064e3b"], ["#fef9c3", "#713f12"]];
const strHash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % AVATAR_PALETTE.length; return h; };
const Avatar = ({ name, size = 24 }) => {
  const [bg, tx] = AVATAR_PALETTE[strHash(name || "?")];
  return (<div style={{ width: size, height: size, borderRadius: "50%", background: bg, color: tx, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.42, fontWeight: 700, flexShrink: 0 }}>{(name || "?").slice(0, 1)}</div>);
};

const LOG_EXPAND_KEY = "ops-logistics-expanded";
const LOG_FILTER_KEY = "ops-logistics-filters";
let logisticsExpandedCache = null;

function isPlainObj(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function loadExpandedState() {
  if (isPlainObj(logisticsExpandedCache)) return { ...logisticsExpandedCache };
  try {
    const raw = localStorage.getItem(LOG_EXPAND_KEY) || sessionStorage.getItem(LOG_EXPAND_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isPlainObj(parsed)) {
        logisticsExpandedCache = parsed;
        return { ...logisticsExpandedCache };
      }
    }
  } catch { /* ignore */ }
  logisticsExpandedCache = { 1: true };
  return { ...logisticsExpandedCache };
}

function saveExpandedState(state) {
  logisticsExpandedCache = { ...state };
  try {
    const json = JSON.stringify(logisticsExpandedCache);
    localStorage.setItem(LOG_EXPAND_KEY, json);
    sessionStorage.setItem(LOG_EXPAND_KEY, json);
  } catch { /* ignore */ }
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
          productFilter: typeof parsed.productFilter === "string" ? parsed.productFilter : "all",
        };
      }
    }
  } catch { /* ignore */ }
  return { filter: "all", ownerFilter: "all", productFilter: "all" };
}

function saveLogisticsFilters(filters) {
  try { sessionStorage.setItem(LOG_FILTER_KEY, JSON.stringify(filters)); } catch { /* ignore */ }
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
  "lingxing-sku-db": "lingxing-sku-db.json",
};

function gistConfigured() {
  return Boolean(getGistToken() && getGistId());
}

function gistHeaders(json = false) {
  const h = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${getGistToken()}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function gistFetchAll() {
  const res = await fetch(`${GIST_API}/${getGistId()}`, { headers: gistHeaders() });
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
        [fileName]: { content: JSON.stringify(payload, null, 2) },
      },
    }),
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
      updatedAt: Date.now(),
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
  },
};

function localGet(key) {
  try {
    const raw = localStorage.getItem(`shared:${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function localSet(key, payload) {
  try {
    localStorage.setItem(`shared:${key}`, JSON.stringify(payload));
  } catch { /* ignore */ }
}

// ─── ROLE / STAFF ─────────────────────────────────────────────────────
const ROLE_COLORS = {
  运营: { bg: "#dceeff", color: "#1a4e8a" },
  美工: { bg: "#f3e8ff", color: "#6b21a8" },
  设计: { bg: "#e8f5e9", color: "#2e7d32" },
  开发: { bg: "#e0f2f1", color: "#00695c" },
  采购: { bg: "#fff3e0", color: "#e65100" },
  管理: { bg: "#fce4ec", color: "#880e4f" },
};

const STAFF_ROLE_OPTIONS = Object.keys(ROLE_COLORS);

const DEFAULT_GLOBAL_CONFIG = {
  staff: [
    { name: "杨彬", role: "运营" },
    { name: "stella", role: "运营" },
    { name: "张玉堂", role: "美工" },
    { name: "张工", role: "设计" },
    { name: "王律师", role: "管理" },
  ],
};

const DEFAULT_ROLE_BY_NAME = Object.fromEntries(
  DEFAULT_GLOBAL_CONFIG.staff.map(e => [e.name, e.role])
);

function normalizeStaffEntry(item) {
  let entry;
  if (typeof item === "string") {
    const [name, role] = item.split("|").map(s => s.trim());
    entry = { name: name || item.trim(), role: role || "" };
  } else {
    entry = { name: String(item?.name || "").trim(), role: String(item?.role || "").trim() };
  }
  if (entry.name && !entry.role && DEFAULT_ROLE_BY_NAME[entry.name]) {
    entry.role = DEFAULT_ROLE_BY_NAME[entry.name];
  }
  return entry;
}

function parseStaffText(text) {
  return text.split(/\r?\n/).map(line => {
    const [name, role] = line.split("|").map(s => s.trim());
    return { name: name || line.trim(), role: role || "" };
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
  } catch { /* ignore */ }
  return "未知";
}

function readSharedStaffCache() {
  try {
    const raw = localStorage.getItem("shared:global-config");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const staff = parsed?.data?.staff;
    if (Array.isArray(staff) && staff.length) {
      return { staff: staff.map(normalizeStaffEntry).filter(e => e.name) };
    }
  } catch { /* ignore */ }
  return null;
}

function loadLegacyLocalConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.staff) || !parsed.staff.length) return null;
    return { staff: parsed.staff.map(normalizeStaffEntry).filter(e => e.name) };
  } catch {
    return null;
  }
}

function loadGlobalConfig() {
  const shared = readSharedStaffCache();
  if (shared) return shared;
  const legacy = loadLegacyLocalConfig();
  if (legacy) return legacy;
  return { staff: DEFAULT_GLOBAL_CONFIG.staff.map(e => ({ ...e })) };
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
    return parsed?.updatedBy ? { updatedBy: parsed.updatedBy, updatedAt: parsed.updatedAt } : null;
  } catch {
    return null;
  }
}

async function saveGlobalConfig(config) {
  const next = {
    staff: (config.staff || []).map(normalizeStaffEntry).filter(e => e.name),
  };
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
  if (gistConfigured()) {
    await sharedStorage.set("global-config", next, getCurrentUserName());
  } else {
    localSet("global-config", {
      data: next,
      updatedBy: getCurrentUserName(),
      updatedAt: Date.now(),
    });
    window.dispatchEvent(new CustomEvent("ops-shared-updated:global-config"));
  }
  window.dispatchEvent(new CustomEvent("ops-global-config-updated"));
  return next;
}

function getEmployees() { return loadGlobalConfig().staff; }
function getStaffNames() { return getEmployees().map(e => e.name); }
function getStaffRole(name) { return getEmployees().find(e => e.name === name)?.role || ""; }

function ownerOptions() {
  return getEmployees().slice().sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

function ownerFilterEntries() {
  return [{ name: "all", role: "" }, ...ownerOptions()];
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

function RoleBadge({ role, style }) {
  if (!role) return null;
  const c = ROLE_COLORS[role] || { bg: "#f3f4f6", color: "#666" };
  return (
    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: c.bg, color: c.color, whiteSpace: "nowrap", ...style }}>
      {role}
    </span>
  );
}

function OwnerField({ value, onChange, placeholder = "选择负责人…", style, inputStyle }) {
  useGlobalConfig();
  const employees = ownerOptions();
  const known = new Set(employees.map(e => e.name));
  const fieldStyle = { ...(inputStyle || style), background: "var(--card)" };

  if (!employees.length) {
    return (
      <div style={{ fontSize: 11, color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "7px 10px", lineHeight: 1.45 }}>
        请先在 ⚙ 设置 → 全局员工名单 中添加人员
      </div>
    );
  }

  return (
    <select
      value={known.has(value) ? value : ""}
      onChange={e => onChange(e.target.value)}
      style={fieldStyle}
    >
      <option value="">{placeholder}</option>
      {employees.map(e => (
        <option key={e.name} value={e.name}>{formatOwnerLabel(e)}</option>
      ))}
    </select>
  );
}

function StaffListEditor({ rows, onChange }) {
  const setRow = (i, patch) => onChange(rows.map((r, j) => j === i ? { ...r, ...patch } : r));
  const removeRow = (i) => onChange(rows.filter((_, j) => j !== i));
  const addRow = () => onChange([...rows, { name: "", role: STAFF_ROLE_OPTIONS[0] || "运营" }]);
  const inp = { flex: 1, minWidth: 0, fontSize: 13, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", background: "transparent", color: "inherit" };
  const sel = { ...inp, width: 92, flex: "0 0 92px", background: "var(--card)", cursor: "pointer" };
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 6, padding: "0 2px" }}>
        <span style={{ flex: 1, fontSize: 11, color: "var(--tm)", fontWeight: 500 }}>姓名</span>
        <span style={{ width: 92, flexShrink: 0, fontSize: 11, color: "var(--tm)", fontWeight: 500 }}>角色</span>
        <span style={{ width: 28 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto", marginBottom: 10, paddingRight: 2 }}>
        {rows.length === 0 && <div style={{ fontSize: 12, color: "var(--tm)", textAlign: "center", padding: "12px 0" }}>暂无员工，点击下方添加</div>}
        {rows.map((row, i) => {
          const roles = !row.role || STAFF_ROLE_OPTIONS.includes(row.role) ? STAFF_ROLE_OPTIONS : [...STAFF_ROLE_OPTIONS, row.role];
          return (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={row.name} onChange={e => setRow(i, { name: e.target.value })} placeholder="输入姓名" style={inp} />
              <select value={row.role || STAFF_ROLE_OPTIONS[0]} onChange={e => setRow(i, { role: e.target.value })} style={sel}>
                {roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button type="button" onClick={() => removeRow(i)} style={{ width: 28, height: 28, border: "none", background: "transparent", color: "#bbb", cursor: "pointer", fontSize: 20, lineHeight: 1, flexShrink: 0, fontFamily: "inherit" }}>×</button>
            </div>
          );
        })}
      </div>
      <button type="button" onClick={addRow} style={{ width: "100%", border: "1px dashed var(--border)", borderRadius: 8, padding: "7px 0", fontSize: 12, cursor: "pointer", color: "var(--tm)", background: "transparent", fontFamily: "inherit" }}>+ 添加员工</button>
    </div>
  );
}

function GlobalSettingsModal({ onClose, onSaved }) {
  const [rows, setRows] = useState(() => getEmployees().map(e => ({ ...e })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState(() => getGlobalConfigMeta());
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !saving) onClose(); };
    const refreshMeta = () => setMeta(getGlobalConfigMeta());
    window.addEventListener("keydown", onKey);
    window.addEventListener("ops-global-config-updated", refreshMeta);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ops-global-config-updated", refreshMeta);
    };
  }, [onClose, saving]);
  const save = async () => {
    const staff = rows.map(r => ({ name: r.name.trim(), role: r.role || "" })).filter(r => r.name);
    setSaving(true);
    setError("");
    try {
      await saveGlobalConfig({ staff });
      onSaved && onSaved();
    } catch (e) {
      setError(e?.message || "保存失败，请检查网络或 Gist 配置");
    } finally {
      setSaving(false);
    }
  };
  const metaLine = meta?.updatedBy
    ? `☁️ 最后由 ${meta.updatedBy} 更新 · 保存后全公司同步`
    : "☁️ 保存后上传云端，全员实时同步";
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 300, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "2rem 1rem", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "1.25rem 1.5rem", width: "100%", maxWidth: 440, color: "var(--text)" }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>全局员工名单</div>
        <div style={{ fontSize: 11, color: "var(--tm)", marginBottom: 8, lineHeight: 1.5 }}>此处为全员唯一来源：各页「负责人 / 跟进人」只能从此名单选择，不能在其他地方随意添加姓名。</div>
        <div style={{ fontSize: 11, color: "#065f46", background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 8, padding: "6px 10px", marginBottom: 12 }}>{metaLine}</div>
        {error && <div style={{ fontSize: 11, color: "#b91c1c", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>{error}</div>}
        <StaffListEditor rows={rows} onChange={setRows} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button type="button" disabled={saving} onClick={onClose} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: saving ? "wait" : "pointer", fontFamily: "inherit", color: "var(--tm)" }}>取消</button>
          <button type="button" disabled={saving} onClick={save} style={{ background: saving ? "#b8d4f0" : "#2d7dd2", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: saving ? "wait" : "pointer", fontFamily: "inherit", color: "#fff" }}>{saving ? "上传中…" : "☁️ 保存并同步"}</button>
        </div>
      </div>
    </div>
  );
}

function useGlobalConfig() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion(v => v + 1);
    const onShared = () => { fetchGlobalConfigFromCloud().finally(bump); };
    window.addEventListener("ops-global-config-updated", bump);
    window.addEventListener("ops-shared-updated:global-config", onShared);
    return () => {
      window.removeEventListener("ops-global-config-updated", bump);
      window.removeEventListener("ops-shared-updated:global-config", onShared);
    };
  }, []);
  return { version, staff: getEmployees(), reload: () => fetchGlobalConfigFromCloud().then(() => setVersion(v => v + 1)) };
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
  } catch { /* ignore */ }
  return { id: "guest", name: "访客" };
}

function setCurrentUser(user) {
  try {
    sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify({
      id: user.id || user.name || "guest",
      name: user.name || "访客",
    }));
  } catch { /* ignore */ }
}

const privateStorage = {
  get(userId, key) {
    try {
      const raw = localStorage.getItem(`user:${userId}:${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  set(userId, key, value) {
    localStorage.setItem(`user:${userId}:${key}`, JSON.stringify(value));
  },
  delete(userId, key) {
    localStorage.removeItem(`user:${userId}:${key}`);
  },
};

function formatSharedTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(d);
}

const DEVICE_ID_KEY = "ops-center-device-id";

function getOrCreateDeviceId() {
  try {
    const cached = localStorage.getItem(DEVICE_ID_KEY);
    if (cached) return cached;
    const id = typeof crypto !== "undefined" && crypto.randomUUID
      ? `dev-${crypto.randomUUID()}`
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
    if (!raw) return { date: "", text: "" };
    const parsed = JSON.parse(raw);
    if (parsed?.date === date) return { date: parsed.date, text: parsed.text || "" };
  } catch { /* ignore */ }
  return { date: "", text: "" };
}

function saveTodayPriority(clientId, date, text) {
  const id = clientId || getOrCreateDeviceId();
  const entry = { date, text: text.trim() };
  try {
    localStorage.setItem(priorityLocalKey(id, date), JSON.stringify(entry));
  } catch { /* ignore */ }
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

function useSharedList(storageKey, defaultData, { active = true } = {}) {
  const defaultRef = useRef(defaultData);
  defaultRef.current = defaultData;

  const [state, setState] = useState({
    data: defaultData,
    meta: null,
    loading: true,
    error: "",
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
        setState({ data: defaultRef.current, meta: null, loading: false, error: "" });
        return;
      }
      const data = Array.isArray(raw.data) ? raw.data : defaultRef.current;
      setState({ data, meta: raw, loading: false, error: "" });
    } catch (e) {
      setState(prev => ({
        ...prev,
        data: prev.data ?? defaultRef.current,
        loading: false,
        error: e?.message || "读取失败",
      }));
    } finally {
      fetchingRef.current = false;
    }
  }, [storageKey]);

  useEffect(() => {
    setState(prev => ({ ...prev, loading: true, error: "" }));
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

  const persist = useCallback(async (data) => {
    setSaving(true);
    setState(prev => ({ ...prev, data, error: "" }));
    try {
      const payload = await sharedStorage.set(storageKey, data, getCurrentUser().name);
      setState(prev => ({
        ...prev,
        data,
        meta: payload || { ...prev.meta, updatedBy: getCurrentUser().name, updatedAt: Date.now() },
        error: "",
      }));
      return true;
    } catch (e) {
      setState(prev => ({ ...prev, error: e?.message || "保存失败" }));
      return false;
    } finally {
      setSaving(false);
    }
  }, [storageKey]);

  /** 保存前先拉云端最新数据，再 mergeFn 合并后上传，避免 A/B 互相覆盖 */
  const persistMerge = useCallback(async (mergeFn) => {
    setSaving(true);
    setState(prev => ({ ...prev, error: "" }));
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
            meta: payload || { ...prev.meta, updatedBy: getCurrentUser().name, updatedAt: Date.now() },
            error: "",
          }));
          return true;
        } catch (saveErr) {
          if (attempt === 2) throw saveErr;
          await new Promise(r => setTimeout(r, 350 * (attempt + 1)));
        }
      }
      return false;
    } catch (e) {
      setState(prev => ({ ...prev, error: e?.message || "保存失败" }));
      return false;
    } finally {
      setSaving(false);
    }
  }, [storageKey]);

  const reload = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: "" }));
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
    reload,
  };
}

function SharedMetaLine({ meta, style, onReload, onSaveCloud, loading, saving, error }) {
  let bg = "#ecfdf5", border = "#6ee7b7", color = "#065f46";
  let text = "☁️ GitHub 云端已启用 · 填写后点「保存并上传」同步全员";

  if (loading) {
    bg = "#f3f4f6"; border = "#d1d5db"; color = "#4b5563";
    text = "⏳ 正在从云端加载…";
  } else if (saving) {
    bg = "#eef6ff"; border = "#b8d4f0"; color = "#1a4e8a";
    text = "⏳ 正在保存并上传到云端…";
  } else if (error) {
    bg = "#fee2e2"; border = "#fca5a5"; color = "#991b1b";
    text = `❌ ${error} · 数据已暂存本机，请重试上传`;
  } else if (meta?.updatedBy) {
    text = CLOUD_POLL_MS > 0
      ? `☁️ 最后由 ${meta.updatedBy} 更新于 ${formatSharedTime(meta.updatedAt)} · 可见时每 ${Math.round(CLOUD_POLL_MS / 60000)} 分钟自动拉取`
      : `☁️ 最后由 ${meta.updatedBy} 更新于 ${formatSharedTime(meta.updatedAt)} · 请点「从云端更新」手动拉取`;
  }

  const btnBase = {
    background: "#fff",
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: 11,
    fontFamily: "inherit",
    fontWeight: 600,
    flexShrink: 0,
    cursor: "pointer",
  };

  return (
    <div style={{
      fontSize: 12, color, background: bg, border: `1px solid ${border}`,
      borderRadius: 8, padding: "8px 12px", marginBottom: 12,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 10, flexWrap: "wrap", ...style,
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>{text}</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {onSaveCloud && (
          <button type="button" disabled={loading || saving} onClick={e => { e.preventDefault(); e.stopPropagation(); onSaveCloud(); }}
            style={{
              ...btnBase,
              background: saving ? "#eef6ff" : "#2d7dd2",
              border: saving ? "1px solid #b8d4f0" : "none",
              color: saving ? "#1a4e8a" : "#fff",
              opacity: loading || saving ? 0.85 : 1,
              cursor: loading || saving ? "wait" : "pointer",
              minWidth: 108,
            }}>
            {saving ? "上传中…" : "☁️ 保存并上传"}
          </button>
        )}
        {onReload && (
          <button type="button" disabled={loading || saving} onClick={e => { e.preventDefault(); e.stopPropagation(); onReload(); }}
            style={{
              ...btnBase,
              border: `1px solid ${border}`,
              color,
              opacity: loading || saving ? 0.75 : 1,
              cursor: loading || saving ? "wait" : "pointer",
              minWidth: 88,
            }}>
            {loading ? "更新中…" : "↻ 从云端更新"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── USER CONTEXT ───────────────────────────────────────────────────
const UserContext = createContext(getCurrentUser());

function useCurrentUser() {
  return useContext(UserContext);
}



const STATUS = {
  pending: { label: "待发货", color: "#4b5563", bg: "#e5e7eb", dot: "#6b7280", border: "#9ca3af" },
  transit: { label: "运输中", color: "#1a4e8a", bg: "#bfdbfe", dot: "#2563eb", border: "#60a5fa" },
  arrived: { label: "已到达", color: "#065f46", bg: "#6ee7b7", dot: "#059669", border: "#34d399" },
  receiving: { label: "接收中", color: "#0f766e", bg: "#99f6e4", dot: "#14b8a6", border: "#2dd4bf" },
  done: { label: "已完成", color: "#166534", bg: "#86efac", dot: "#22c55e", border: "#4ade80" },
};
const GANTT_TRACKING_CHECK_STAGES = ["已入仓", "清关中", "已起运 (开船/起飞)", "在途"];
const GANTT_ARRIVED_STAGES = ["到港", "上架中", "完成"];

const SORT_OPTIONS = [
  { key: "name", label: "产品名称" },
  { key: "shipDate", label: "最近出货" },
  { key: "etaArrival", label: "预计到港" },
  { key: "batches", label: "批次数" },
];

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
  flexShrink: 0,
};

const filterChip = (active) => ({
  background: active ? "#2d7dd2" : "var(--card)",
  color: active ? "#fff" : "var(--tm)",
  border: `1px solid ${active ? "#2d7dd2" : "var(--border)"}`,
  borderRadius: 20,
  padding: "4px 12px",
  fontSize: 11,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
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
          sortBy: SORT_OPTIONS.some(o => o.key === p.sortBy) ? p.sortBy : "name",
        };
      }
    }
  } catch { /* ignore */ }
  return { productFilter: "all", statusFilter: "all", sortBy: "name" };
}

function saveGanttFilters(filters) {
  try { sessionStorage.setItem(GANTT_FILTER_KEY, JSON.stringify(filters)); } catch { /* ignore */ }
}

function loadGanttExpanded() {
  try {
    const raw = sessionStorage.getItem(GANTT_EXPAND_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === "object") return p;
    }
  } catch { /* ignore */ }
  return {};
}

function saveGanttExpanded(state) {
  try { sessionStorage.setItem(GANTT_EXPAND_KEY, JSON.stringify(state)); } catch { /* ignore */ }
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
  fbas.forEach(f => { excCount += (f.exceptions || []).filter(e => !e.resolved).length; });
  const missingTrack = fbas.some(fbaMissingTrack);
  const overdue = fbas.some(f => {
    const eta = parseD(f.etaArrival || g.etaArrival || f.windowEnd);
    if (!eta) return false;
    return eta < today && !GANTT_ARRIVED_STAGES.includes(ganttNorm(f.status));
  }) || (() => {
    const eta = parseD(g.etaArrival);
    return eta && eta < today && fbas.length === 0;
  })();
  return { excCount, missingTrack, overdue };
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
    batchCount: batches.length,
  };
}

const GANTT_STAGE_MAP = {
  备货中: "待出库", 准备发货: "待出库", 已发货: "已入仓", 已出港: "已起运 (开船/起飞)",
  运输中: "在途", 已到港: "到港", 接收中: "上架中", 已完成: "完成",
};
const ganttNorm = (s) => GANTT_STAGE_MAP[s] || s;
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

const parseD = (s) => {
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
        batches: [],
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
      sub: fbas.length > 1 ? `${fbas.length} 个货件` : (fbas[0]?.warehouse || ""),
      excCount: meta.excCount,
      overdue: meta.overdue,
      missingTrack: meta.missingTrack,
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

const fmtShort = (d) => {
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
    left: ((s - min) / 86400000 / totalDays) * 100,
    width: Math.max(8, ((e - s) / 86400000 / totalDays) * 100),
    start: s,
    end: e,
  };
}

function GanttAlerts({ excCount, overdue, missingTrack, compact }) {
  const items = [];
  if (overdue) items.push({ t: "逾期", c: "#E24B4A", bg: "#fee2e2" });
  if (excCount > 0) items.push({ t: `⚠${excCount}`, c: "#b45309", bg: "#fff0d4" });
  if (missingTrack) items.push({ t: "缺追踪", c: "#b91c1c", bg: "#fee2e2" });
  if (!items.length) return null;
  return (
    <span style={{ display: "inline-flex", gap: compact ? 3 : 4, flexShrink: 0 }}>
      {items.map(it => (
        <span key={it.t} style={{ fontSize: compact ? 9 : 10, fontWeight: 700, padding: compact ? "1px 5px" : "2px 6px", borderRadius: 10, background: it.bg, color: it.c, whiteSpace: "nowrap" }}>{it.t}</span>
      ))}
    </span>
  );
}

function GanttTrack({ shipDate, etaArrival, status, label, sub, excCount, overdue, missingTrack, min, totalDays, today, height = 40, compact = false, segments, segmentsOnly = false }) {
  const pos = calcBarPos(shipDate, etaArrival, min, totalDays);
  const st = STATUS[status] || STATUS.pending;
  const trackH = height;

  if (segmentsOnly && segments?.length) {
    return (
      <div style={{ flex: 1, position: "relative", height: trackH, background: "#f3f4f6", borderRadius: 8, border: "1px solid #e5e7eb" }}>
        {segments.map(seg => {
          const sp = calcBarPos(seg.shipDate, seg.etaArrival, min, totalDays);
          if (!sp) return null;
          const ss = STATUS[seg.status] || STATUS.pending;
          return (
            <div
              key={seg.id}
              title={`${seg.label} · ${ss.label} · ${fmtShort(seg.shipDate)}→${fmtShort(seg.etaArrival)}`}
              style={{
                position: "absolute",
                left: `${sp.left}%`,
                width: `${sp.width}%`,
                top: 3,
                bottom: 3,
                background: `linear-gradient(180deg, ${ss.bg}, ${ss.border}88)`,
                border: `1.5px solid ${seg.overdue ? "#E24B4A" : ss.border}`,
                borderRadius: 4,
                minWidth: 4,
              }}
            />
          );
        })}
      </div>
    );
  }

  if (!pos) {
    return (
      <div style={{ flex: 1, height: trackH, background: "#f9fafb", borderRadius: 8, border: "2px dashed #d1d5db", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#9ca3af" }}>
        暂无日期区间
      </div>
    );
  }

  const todayInBar = today >= pos.start && today <= pos.end;
  const todayPctInBar = todayInBar ? ((today - pos.start) / (pos.end - pos.start)) * 100 : null;

  return (
    <div style={{ flex: 1, position: "relative", height: trackH, background: "#f3f4f6", borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.04)" }}>
      <div
        title={`${label || ""} ${fmtShort(pos.start)} → ${fmtShort(pos.end)} · ${st.label}`}
        style={{
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
          minWidth: 48,
        }}
      >
        <span style={{ fontSize: compact ? 9 : 10, fontWeight: 700, color: st.color, flexShrink: 0, background: "rgba(255,255,255,0.7)", padding: "1px 4px", borderRadius: 4 }}>
          {fmtShort(pos.start)}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, flex: 1, justifyContent: "center" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.dot, flexShrink: 0, boxShadow: `0 0 0 2px ${st.bg}` }} />
          {label && <span style={{ fontSize: compact ? 10 : 11, fontWeight: 700, color: st.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>}
          {sub && !compact && <span style={{ fontSize: 9, color: st.color, opacity: 0.8, flexShrink: 0 }}>{sub}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <GanttAlerts excCount={excCount} overdue={overdue} missingTrack={missingTrack} compact={compact} />
          <span style={{ fontSize: compact ? 9 : 10, fontWeight: 700, color: st.color, background: "rgba(255,255,255,0.7)", padding: "1px 4px", borderRadius: 4 }}>
            {fmtShort(pos.end)}
          </span>
        </div>
        {todayPctInBar != null && (
          <div style={{ position: "absolute", left: `${todayPctInBar}%`, top: -3, bottom: -3, width: 3, background: "#E24B4A", borderRadius: 2, zIndex: 2, pointerEvents: "none" }} title="今天" />
        )}
      </div>
      {segments?.map(seg => {
        const sp = calcBarPos(seg.shipDate, seg.etaArrival, min, totalDays);
        if (!sp) return null;
        const ss = STATUS[seg.status] || STATUS.pending;
        return (
          <div
            key={seg.id}
            title={`${seg.label} · ${ss.label}`}
            style={{
              position: "absolute",
              left: `${sp.left}%`,
              width: `${sp.width}%`,
              top: "50%",
              height: 6,
              marginTop: -3,
              background: ss.dot,
              borderRadius: 3,
              opacity: 0.85,
              pointerEvents: "none",
            }}
          />
        );
      })}
    </div>
  );
}

function applyGanttView(products, { productFilter, statusFilter, sortBy }) {
  let list = products.map(p => ({
    ...p,
    batches: statusFilter === "all"
      ? [...(p.batches || [])]
      : (p.batches || []).filter(b => b.status === statusFilter),
  }));

  if (statusFilter !== "all") {
    list = list.filter(p => p.batches.length > 0);
  }
  if (productFilter !== "all") {
    list = list.filter(p => p.id === productFilter);
  }

  const shipKey = (p) => {
    const times = (p.batches || []).map(b => parseD(b.shipDate)?.getTime()).filter(Boolean);
    return times.length ? Math.max(...times) : 0;
  };
  const etaKey = (p) => {
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

function GanttTimeline({ products, today }) {
  const [expanded, setExpanded] = useState(loadGanttExpanded);

  useEffect(() => {
    saveGanttExpanded(expanded);
  }, [expanded]);

  const toggleProduct = (id) => setExpanded(prev => ({ ...prev, [id]: prev[id] !== true }));

  const { min, totalDays, weeks, todayPct } = useMemo(() => {
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
    const todayPct = ((today - minD) / 86400000 / totalDays) * 100;
    return { min: minD, max: maxD, totalDays, weeks, todayPct };
  }, [products, today]);

  const LABEL_W = 180;
  const TodayLine = () => todayPct >= 0 && todayPct <= 100 ? (
    <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, width: 2, background: "#E24B4A", zIndex: 3, pointerEvents: "none" }}>
      <div style={{ position: "absolute", top: -14, left: -10, fontSize: 9, color: "#E24B4A", fontWeight: 700, whiteSpace: "nowrap" }}>今天</div>
    </div>
  ) : null;

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 720 }}>
        <div style={{ display: "flex", marginLeft: LABEL_W, borderBottom: "2px solid var(--border)", paddingBottom: 6, marginBottom: 10 }}>
          {weeks.map((w, i) => (
            <div key={i} style={{ flex: 1, minWidth: 56, fontSize: 10, fontWeight: 600, color: "var(--tm)", textAlign: "center" }}>
              {w.getMonth() + 1}/{w.getDate()}
            </div>
          ))}
        </div>
        {products.map(p => {
          const isOpen = expanded[p.id] === true;
          const batches = p.batches || [];
          const batchCount = batches.length;
          const summary = productGanttSummary(batches);
          return (
            <div key={p.id} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, minHeight: 44 }}>
                <button
                  type="button"
                  onClick={() => toggleProduct(p.id)}
                  title={isOpen ? "收起产品" : "展开产品"}
                  style={{ width: 26, height: 26, flexShrink: 0, background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 11, color: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  {isOpen ? "▼" : "▶"}
                </button>
                <div style={{ width: LABEL_W - 32, flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: "var(--tm)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span>{p.sku || "—"} · {batchCount} 批</span>
                    {summary.shipDate && summary.etaArrival && (
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>{fmtShort(summary.shipDate)} → {fmtShort(summary.etaArrival)}</span>
                    )}
                    <GanttAlerts excCount={summary.excCount} overdue={summary.overdue} missingTrack={summary.missingTrack} compact />
                  </div>
                </div>
                <div style={{ flex: 1, position: "relative" }}>
                  <TodayLine />
                  <GanttTrack
                    shipDate={summary.shipDate}
                    etaArrival={summary.etaArrival}
                    status={summary.status}
                    label={isOpen ? null : `${batchCount} 批汇总`}
                    excCount={isOpen ? 0 : summary.excCount}
                    overdue={summary.overdue}
                    missingTrack={isOpen ? false : summary.missingTrack}
                    min={min}
                    totalDays={totalDays}
                    today={today}
                    height={isOpen ? 18 : 44}
                    compact={!isOpen}
                    segments={isOpen ? batches : null}
                    segmentsOnly={isOpen}
                  />
                </div>
              </div>
              {isOpen && batches.map(b => (
                <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, marginLeft: 32 }}>
                  <div style={{ width: LABEL_W - 32, flexShrink: 0, paddingLeft: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.label}>{b.label}</div>
                    <div style={{ fontSize: 9, color: "var(--tm)", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, color: STATUS[b.status]?.color }}>{STATUS[b.status]?.label}</span>
                      {b.sub && <span>· {b.sub}</span>}
                      <GanttAlerts excCount={b.excCount} overdue={b.overdue} missingTrack={b.missingTrack} compact />
                    </div>
                  </div>
                  <div style={{ flex: 1, position: "relative" }}>
                    <TodayLine />
                    <GanttTrack
                      shipDate={b.shipDate}
                      etaArrival={b.etaArrival}
                      status={b.status}
                      label={b.label}
                      sub={b.sub}
                      excCount={b.excCount}
                      overdue={b.overdue}
                      missingTrack={b.missingTrack}
                      min={min}
                      totalDays={totalDays}
                      today={today}
                      height={44}
                    />
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FBAGanttCard({ groups = [], today: todayProp, productFilter: controlledProductFilter }) {
  const saved = loadGanttFilters();
  const isProductControlled = controlledProductFilter !== undefined;
  const [internalProductFilter, setInternalProductFilter] = useState(saved.productFilter);
  const productFilter = isProductControlled ? controlledProductFilter : internalProductFilter;
  const [statusFilter, setStatusFilter] = useState(saved.statusFilter);
  const [sortBy, setSortBy] = useState(saved.sortBy);

  useEffect(() => {
    if (isProductControlled) {
      const prev = loadGanttFilters();
      saveGanttFilters({ ...prev, statusFilter, sortBy });
    } else {
      saveGanttFilters({ productFilter, statusFilter, sortBy });
    }
  }, [productFilter, statusFilter, sortBy, isProductControlled]);

  const today = useMemo(() => {
    const d = todayProp ? new Date(todayProp) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [todayProp]);

  const allProducts = useMemo(() => logisticsGroupsToGanttProducts(groups), [groups]);
  const viewProducts = useMemo(
    () => applyGanttView(allProducts, { productFilter, statusFilter, sortBy }),
    [allProducts, productFilter, statusFilter, sortBy]
  );

  useEffect(() => {
    if (isProductControlled || productFilter === "all" || allProducts.some(p => p.id === productFilter)) return;
    setInternalProductFilter("all");
  }, [allProducts, productFilter, isProductControlled]);

  const chartRef = useRef(null);
  const datedBatchCount = viewProducts.reduce(
    (n, p) => n + (p.batches || []).filter(b => b.shipDate || b.etaArrival).length,
    0
  );
  const hasFilters = (!isProductControlled && productFilter !== "all") || statusFilter !== "all";

  const setProduct = (id) => { if (!isProductControlled) setInternalProductFilter(id); };
  const setStatus = (key) => setStatusFilter(key);
  const resetFilters = () => {
    if (!isProductControlled) setInternalProductFilter("all");
    setStatusFilter("all");
  };

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>FBA 物流看板</div>
          <div style={{ fontSize: 11, color: "var(--tm)", marginTop: 2 }}>
            甘特时间轴 · 自动同步下方发货批次
            {allProducts.length > 0 && (
              <span> · {viewProducts.length}/{allProducts.length} 个产品 · 每批次独立一行</span>
            )}
          </div>
        </div>
        <button type="button" onClick={() => captureScreenshot(chartRef.current).catch(() => alert("截图失败，请重试"))} style={BTN_PRIMARY}>📷 截图</button>
      </div>

      {allProducts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {!isProductControlled && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--tm)", flexShrink: 0 }}>产品</span>
              <button type="button" onClick={() => setProduct("all")} style={filterChip(productFilter === "all")}>全部</button>
              {allProducts.map(p => (
                <button key={p.id} type="button" onClick={() => setProduct(p.id)} style={filterChip(productFilter === p.id)} title={p.name}>
                  {p.sku || p.name}{p.batches?.length > 1 ? ` (${p.batches.length})` : ""}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--tm)", flexShrink: 0 }}>状态</span>
            <button type="button" onClick={() => setStatus("all")} style={filterChip(statusFilter === "all")}>全部</button>
            {Object.entries(STATUS).map(([k, v]) => (
              <button key={k} type="button" onClick={() => setStatus(k)} style={filterChip(statusFilter === k)}>{v.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--tm)", flexShrink: 0 }}>排序</span>
            {SORT_OPTIONS.map(o => (
              <button key={o.key} type="button" onClick={() => setSortBy(o.key)} style={filterChip(sortBy === o.key)}>{o.label}</button>
            ))}
            {hasFilters && (
              <button type="button" onClick={resetFilters} style={{ ...filterChip(false), marginLeft: 4, color: "#2d7dd2", borderColor: "#b8d4f0" }}>清除筛选</button>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {Object.entries(STATUS).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: v.color, fontWeight: 600 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: v.bg, border: `2px solid ${v.border}` }} />
            {v.label}
          </div>
        ))}
        <span style={{ fontSize: 10, color: "#E24B4A", fontWeight: 600 }}>| 逾期红框</span>
        <span style={{ fontSize: 10, color: "#b45309", fontWeight: 600 }}>⚠ 异常</span>
        <span style={{ fontSize: 10, color: "#b91c1c", fontWeight: 600 }}>缺追踪</span>
      </div>
      <div ref={chartRef}>
        {!allProducts.length ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--tm)", fontSize: 13 }}>暂无批次，请先在下方「导入 CSV」或「+ 新建批次」</div>
        ) : !viewProducts.length ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--tm)", fontSize: 13 }}>
            没有符合筛选条件的产品
            <button type="button" onClick={resetFilters} style={{ display: "block", margin: "8px auto 0", background: "none", border: "none", color: "#2d7dd2", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>清除筛选</button>
          </div>
        ) : datedBatchCount === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--tm)", fontSize: 13 }}>当前产品暂无日期数据，请在下方的批次中填写出货日或预计到港</div>
        ) : (
          <GanttTimeline products={viewProducts} today={today} />
        )}
      </div>
    </div>
  );
}

// ─── LOGISTICS MODULE (Shipment Group + FBA) ─────────────────────────
/** 头程状态与 FBA 货件状态共用 */
const SHIPMENT_STAGES = ["待出库", "已入仓", "清关中", "已起运 (开船/起飞)", "在途", "到港", "上架中", "完成"];
const LEGACY_STAGE_MAP = {
  备货中: "待出库", 准备发货: "待出库",
  已发货: "已入仓", 已出港: "已起运 (开船/起飞)",
  运输中: "在途", 已到港: "到港", 接收中: "上架中", 已完成: "完成",
};
const DEFAULT_SHIPMENT_STAGE = "待出库";
const normalizeShipmentStage = (s) => LEGACY_STAGE_MAP[s] || (SHIPMENT_STAGES.includes(s) ? s : DEFAULT_SHIPMENT_STAGE);
const stageColor = (s) => ({
  待出库: "#9ca3af", 已入仓: "#6b7280", "已起运 (开船/起飞)": "#5b6abf", 清关中: "#7a6dd2",
  在途: "#2d7dd2", 到港: "#1a9e8a", 上架中: "#7a6dd2", 完成: "#2d9e52",
}[normalizeShipmentStage(s)] || "#888");
const STAGE_STYLE = {
  缺少追踪编码: { bg: "#fee2e2", c: "#E24B4A" },
  待出库: { bg: "#f3f4f6", c: "#6b7280" },
  已入仓: { bg: "#e5e7eb", c: "#4b5563" },
  "已起运 (开船/起飞)": { bg: "#e0e7ff", c: "#3730a3" },
  清关中: { bg: "#ede9fe", c: "#5b21b6" },
  在途: { bg: "#dceeff", c: "#2d7dd2" },
  到港: { bg: "#d1fae5", c: "#1a9e8a" },
  上架中: { bg: "#ede9fe", c: "#6b21a8" },
  完成: { bg: "#d4f0dc", c: "#2d9e52" },
};
const TRACKING_CHECK_STAGES = ["已入仓", "清关中", "已起运 (开船/起飞)", "在途"];
const HEAD_TRANSIT_STAGES = ["清关中", "已起运 (开船/起飞)", "在途"];
const headArrivedOrLater = (s) => ["到港", "上架中", "完成"].includes(normalizeShipmentStage(s));
const TRANSPORT_META = { 海运: { icon: "🚢", bg: "#dceeff", c: "#1a4e8a" }, 空运: { icon: "✈", bg: "#ede9fe", c: "#4c1d95" }, 快递: { icon: "📦", bg: "#fef3c7", c: "#78350f" } };
const fmtWindow = (s, e) => (!s && !e) ? "—" : `${s ? fmtD(s) : "?"} – ${e ? fmtD(e) : "?"}`;
const fbaEffectiveStatus = (fba) => {
  const st = normalizeShipmentStage(fba.status);
  if (TRACKING_CHECK_STAGES.includes(st) && !(fba.tracking || "").trim()) return "缺少追踪编码";
  return st;
};
const batchMissingTrack = (g) => (g.fbaShipments || []).some(s => fbaEffectiveStatus(s) === "缺少追踪编码");
const batchReceiving = (g) => (g.fbaShipments || []).some(s => normalizeShipmentStage(s.status) === "上架中");
const batchAllDone = (g) => (g.fbaShipments || []).length > 0 && (g.fbaShipments || []).every(s => normalizeShipmentStage(s.status) === "完成");
const deriveHeadStatus = (fbaShipments) => {
  const fbas = fbaShipments || [];
  if (!fbas.length) return DEFAULT_SHIPMENT_STAGE;
  const indices = fbas.map(f => SHIPMENT_STAGES.indexOf(normalizeShipmentStage(f.status))).filter(i => i >= 0);
  return indices.length ? SHIPMENT_STAGES[Math.min(...indices)] : DEFAULT_SHIPMENT_STAGE;
};
const batchHeadTransit = (g) => {
  const fbas = g.fbaShipments || [];
  if (fbas.length) return fbas.some(f => HEAD_TRANSIT_STAGES.includes(normalizeShipmentStage(f.status)));
  return HEAD_TRANSIT_STAGES.includes(normalizeShipmentStage(g.headStatus));
};
const fbaEtaArrival = (fba, batch) => fba.etaArrival || batch?.etaArrival || fba.windowEnd || "";
const fbaOpenExcCount = (fba) => (fba.exceptions || []).filter(e => !e.resolved).length;
const fbaAllExceptions = (fba, batch, fbaIndex = 0) => {
  if ((fba.exceptions || []).length) return fba.exceptions;
  if (fbaIndex === 0 && (batch?.exceptions || []).length) return batch.exceptions;
  return [];
};
const openExcCount = (g) => {
  let n = (g.exceptions || []).filter(e => !e.resolved).length;
  (g.fbaShipments || []).forEach(f => { n += fbaOpenExcCount(f); });
  return n;
};
const fbaOverdue = (fba, batch) => {
  const d = daysDiff(fbaEtaArrival(fba, batch));
  return d !== null && d < 0 && !headArrivedOrLater(fba.status);
};
const batchHeadOverdue = (g) => {
  const fbas = g.fbaShipments || [];
  if (fbas.length) return fbas.some(f => fbaOverdue(f, g));
  const d = daysDiff(g.etaArrival);
  return d !== null && d < 0;
};
const batchEarliestEtaDiff = (g) => {
  const diffs = (g.fbaShipments || []).map(f => daysDiff(fbaEtaArrival(f, g))).filter(d => d !== null);
  if (diffs.length) return Math.min(...diffs);
  return daysDiff(g.etaArrival);
};
const batchDisplayQty = (group) => {
  const fbas = group.fbaShipments || [];
  if (fbas.length) return sumFbaExpectedQty(fbas);
  return group.totalQty || 0;
};

const ensureFbaDefaults = (fba, batch) => ({
  ...fba,
  etaArrival: fba.etaArrival || batch?.etaArrival || "",
  etaDeparture: fba.etaDeparture || batch?.etaDeparture || "",
  exceptions: fba.exceptions || [],
});
const sumFbaExpectedQty = (fbaShipments) =>
  (fbaShipments || []).reduce((s, f) => s + (Number(f.expectedQty) || 0), 0);
// ─── Amazon STA CSV import ───────────────────────────────────────────
const parseCsvRow = (line) => {
  const cells = []; let cur = ""; let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuote = !inQuote; continue; }
    if (c === "," && !inQuote) { cells.push(cur); cur = ""; continue; }
    cur += c;
  }
  cells.push(cur);
  return cells.map(s => s.trim());
};
const warehouseFromStaName = (name) => { const m = (name || "").match(/-([A-Z0-9]{3,5})\s*$/); return m ? m[1] : ""; };
const isoFromStaName = (name) => {
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
    const idx = (k) => header.indexOf(k);
    skuInfo = { sku: data[idx("SKU")] || data[0], asin: data[idx("ASIN")] || "", fnsku: data[idx("FNSKU")] || "", units: +(data[idx("商品总数")] || 0) };
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
    fba: { id, name, fbaId, internalId: (meta["工作流程名称"] || "").slice(0, 8).toUpperCase(), warehouse, expectedQty, receivedQty: 0, windowStart, windowEnd: addDaysIso(windowStart, 6), etaDeparture: "", etaArrival: addDaysIso(windowStart, 6), tracking: "", status: DEFAULT_SHIPMENT_STAGE, exceptions: [], note },
    sku: skuInfo?.sku || "",
    warnings,
  };
};
const readStaCsvFiles = async (fileList) => {
  const files = Array.from(fileList);
  const baseId = Date.now();
  const parsed = await Promise.all(files.map((f, i) => f.text().then(t => parseAmazonStaCsv(t, baseId + i))));
  return {
    fbaShipments: parsed.map(p => p.fba),
    totalQty: parsed.reduce((s, p) => s + (p.fba.expectedQty || 0), 0),
    sku: parsed.find(p => p.sku)?.sku || "",
    warnings: parsed.flatMap((p, i) => p.warnings.map(w => `${files[i].name}: ${w}`)),
  };
};
const normalizeFbaId = (id) => (id || "").trim().toUpperCase();
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
  return { unique, dupes };
};
const formatDuplicateFbaMsg = (dupes, action) => {
  const list = [...new Set(dupes)].join("、");
  return dupes.length === 1
    ? `FBA 货件编号 ${list} 已存在，${action}`
    : `以下 FBA 货件编号已存在，${action}：${list}`;
};
const groupProductKey = (g) => (g.sku || g.name || `id-${g.id}`).trim();
const groupMatchesProduct = (g, productFilter) => productFilter === "all" || groupProductKey(g) === productFilter;
const productTabChip = (active) => ({
  background: active ? "#2d7dd2" : "var(--card)",
  color: active ? "#fff" : "var(--text)",
  border: `1px solid ${active ? "#2d7dd2" : "var(--border)"}`,
  borderRadius: 10,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: active ? 600 : 500,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
});

const INIT_LOGISTICS = [
  {
    id: 1, name: "FB100绿色第三批", sku: "FB100", totalQty: 800, owner: "陈工",
    shipDate: "2026-04-10", transport: "海运", forwarder: "中外运华南", blNumber: "COSU6284731",
    etaDeparture: "2026-05-15", etaArrival: "2026-06-08", headStatus: "在途", note: "正常在途",
    exceptions: [],
    fbaShipments: [
      { id: 101, name: "FBA STA (04/20/2026 10:14)-RDU2", fbaId: "FBA19BWMS0S7", internalId: "11VGG45G", warehouse: "RDU2", expectedQty: 144, receivedQty: 0, windowStart: "2026-05-31", windowEnd: "2026-06-06", etaDeparture: "2026-05-15", etaArrival: "2026-06-08", tracking: "", status: "已入仓", exceptions: [], note: "" },
      { id: 102, name: "FBA STA (04/20/2026 10:14)-SWF2", fbaId: "FBA19BWMT1K3", internalId: "22HJK89M", warehouse: "SWF2", expectedQty: 160, receivedQty: 0, windowStart: "2026-06-01", windowEnd: "2026-06-07", etaDeparture: "2026-05-15", etaArrival: "2026-06-08", tracking: "1Z999AA10123456784", status: "在途", exceptions: [], note: "" },
      { id: 103, name: "FBA STA (04/20/2026 10:14)-IAH3", fbaId: "FBA19BWMV4P9", internalId: "33PLM12N", warehouse: "IAH3", expectedQty: 168, receivedQty: 120, windowStart: "2026-05-28", windowEnd: "2026-06-03", etaDeparture: "2026-05-15", etaArrival: "2026-06-08", tracking: "TBA6284731003", status: "上架中", exceptions: [], note: "" },
      { id: 104, name: "FBA STA (04/20/2026 10:14)-MDW2", fbaId: "FBA19BWMX7R2", internalId: "44QRS56T", warehouse: "MDW2", expectedQty: 176, receivedQty: 176, windowStart: "2026-05-20", windowEnd: "2026-05-26", etaDeparture: "2026-05-15", etaArrival: "2026-06-08", tracking: "FBA6284731004", status: "完成", exceptions: [], note: "" },
      { id: 105, name: "FBA STA (04/20/2026 10:14)-ORF2", fbaId: "FBA19BWMZ9T5", internalId: "55UVW78X", warehouse: "ORF2", expectedQty: 152, receivedQty: 0, windowStart: "2026-06-05", windowEnd: "2026-06-11", etaDeparture: "2026-05-15", etaArrival: "2026-06-08", tracking: "", status: "已入仓", exceptions: [], note: "" },
    ],
  },
  {
    id: 2, name: "FB101白色第二批", sku: "FB101", totalQty: 300, owner: "陈工",
    shipDate: "2026-05-08", transport: "空运", forwarder: "顺丰国际", blNumber: "SF20260508001",
    etaDeparture: "2026-05-12", etaArrival: "2026-05-18", headStatus: "到港", note: "",
    exceptions: [],
    fbaShipments: [
      { id: 201, name: "FBA STA (05/08/2026 09:30)-LAX9", fbaId: "FBA19BXAA1B2", internalId: "66ABC01D", warehouse: "LAX9", expectedQty: 300, receivedQty: 280, windowStart: "2026-05-22", windowEnd: "2026-05-28", etaDeparture: "2026-05-12", etaArrival: "2026-05-18", tracking: "SF6284732001", status: "上架中", exceptions: [{ desc: "IAH3 仓库拒收部分箱", date: "2026-05-25", resolved: false, action: "货代协调重新配送" }], note: "" },
    ],
  },
  {
    id: 3, name: "FB200黑色第一批", sku: "FB200", totalQty: 200, owner: "李工",
    shipDate: "2026-05-01", transport: "海运", forwarder: "马士基订舱", blNumber: "MAEU9876543",
    etaDeparture: "2026-05-28", etaArrival: "2026-06-25", headStatus: "待出库", note: "等工厂尾数",
    exceptions: [],
    fbaShipments: [
      { id: 301, name: "FBA STA (05/01/2026 14:00)-ONT8", fbaId: "FBA19BYCC3D4", internalId: "77DEF02G", warehouse: "ONT8", expectedQty: 200, receivedQty: 0, windowStart: "2026-06-20", windowEnd: "2026-06-26", etaDeparture: "2026-05-28", etaArrival: "2026-06-25", tracking: "", status: "待出库", exceptions: [], note: "" },
    ],
  },
];
function ExceptionEditor({ excs, setExcs }) {
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tm)", borderTop: "1px solid var(--border)", paddingTop: 10, marginBottom: 8 }}>异常记录</div>
      {excs.map((ex, i) => (
        <div key={i} style={{ background: ex.resolved ? "#f0faf4" : "#fff8e6", border: `1px solid ${ex.resolved ? "#b7e4c7" : "#ffe0a0"}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <input value={ex.desc} onChange={e => { const a = [...excs]; a[i] = { ...ex, desc: e.target.value }; setExcs(a); }} placeholder="异常描述" style={{ ...inpSm, flex: 1 }} />
            <input type="date" value={ex.date} onChange={e => { const a = [...excs]; a[i] = { ...ex, date: e.target.value }; setExcs(a); }} style={{ ...inpSm, width: 120 }} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={ex.action} onChange={e => { const a = [...excs]; a[i] = { ...ex, action: e.target.value }; setExcs(a); }} placeholder="处理方式 / 跟进动作" style={{ ...inpSm, flex: 1 }} />
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--tm)", whiteSpace: "nowrap", cursor: "pointer" }}>
              <input type="checkbox" checked={ex.resolved} onChange={e => { const a = [...excs]; a[i] = { ...ex, resolved: e.target.checked }; setExcs(a); }} />已解决
            </label>
            <button type="button" onClick={() => setExcs(excs.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 16 }}>×</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setExcs([...excs, { desc: "", date: TODAY.toISOString().split("T")[0], action: "", resolved: false }])} style={{ width: "100%", border: "1px dashed var(--border)", borderRadius: 8, padding: "5px 0", fontSize: 12, cursor: "pointer", color: "var(--tm)", background: "transparent", marginBottom: 12, fontFamily: "inherit" }}>+ 记录异常</button>
    </>
  );
}
function FbaStatusBadge({ fba }) {
  const st = fbaEffectiveStatus(fba);
  const s = STAGE_STYLE[st] || STAGE_STYLE[DEFAULT_SHIPMENT_STAGE];
  return <span style={badge(s.bg, s.c)}>{st}</span>;
}

function StageDotLine({ stage, dotSize = 7, connector = true }) {
  const st = normalizeShipmentStage(stage);
  const stageIdx = SHIPMENT_STAGES.indexOf(st);
  return (
    <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
      {SHIPMENT_STAGES.map((s, i) => {
        const done = i < stageIdx;
        const active = i === stageIdx;
        const c = active ? stageColor(s) : done ? "#2d9e52" : "var(--border)";
        const size = active ? dotSize : Math.max(5, dotSize - 2);
        return (
          <span key={s} style={{ display: "flex", alignItems: "center", flex: connector && i < SHIPMENT_STAGES.length - 1 ? 1 : "none" }} title={s}>
            <span style={{ width: size, height: size, borderRadius: "50%", background: c, outline: active ? `2px solid ${c}` : "none", outlineOffset: 1, flexShrink: 0 }} />
            {connector && i < SHIPMENT_STAGES.length - 1 && (
              <span style={{ flex: 1, height: 2, background: done ? "#2d9e52" : "var(--border)", margin: "0 1px" }} />
            )}
          </span>
        );
      })}
    </div>
  );
}

function FbaArrivalHint({ fba, batch }) {
  const eta = fbaEtaArrival(fba, batch);
  const d = daysDiff(eta);
  if (headArrivedOrLater(fba.status)) return <span style={{ fontSize: 10, color: "var(--tm)" }}>已抵达</span>;
  if (d === null) return <span style={{ fontSize: 10, color: "var(--tm)" }}>抵达 —</span>;
  if (d < 0) return <span style={badge("#fee2e2", "#E24B4A")}>逾期 {Math.abs(d)} 天</span>;
  if (d === 0) return <span style={badge("#fff0d4", "#7a4a00")}>今日抵达</span>;
  if (d <= 7) return <span style={badge("#dceeff", "#1a4e8a")}>{fmtD(eta)} · {d} 天</span>;
  return <span style={{ fontSize: 10, color: "var(--tm)" }}>抵达 {fmtD(eta)}</span>;
}

function FbaExceptionList({ exceptions }) {
  const list = exceptions || [];
  if (!list.length) return null;
  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }} onClick={e => e.stopPropagation()}>
      {list.map((ex, i) => {
        const resolved = !!ex.resolved;
        const desc = (ex.desc || "").trim() || "（未填写描述）";
        return (
          <div key={i} style={{ fontSize: 10, lineHeight: 1.45, padding: "6px 8px", borderRadius: 6, background: resolved ? "#f0faf4" : "#fff8e6", border: `1px solid ${resolved ? "#b7e4c7" : "#ffe0a0"}`, color: resolved ? "#2d6a4f" : "#7a4a00" }}>
            <span style={{ fontWeight: 600 }}>{resolved ? "✓ " : "⚠ "}{desc}</span>
            {ex.action && <span style={{ marginLeft: 4, opacity: 0.9 }}>· {ex.action}</span>}
            <span style={{ marginLeft: 4, opacity: 0.75 }}>· {ex.date ? fmtD(ex.date) : "—"}{resolved ? " 已解决" : " 未解决"}</span>
          </div>
        );
      })}
    </div>
  );
}

function FbaStageTrack({ fba, batch, fbaIndex = 0 }) {
  const f = ensureFbaDefaults(fba, batch);
  const st = normalizeShipmentStage(f.status);
  const stageIdx = SHIPMENT_STAGES.indexOf(st);
  const prog = stageIdx >= 0 ? Math.round((stageIdx / (SHIPMENT_STAGES.length - 1)) * 100) : 0;
  const excN = fbaOpenExcCount(f);
  const overdue = fbaOverdue(f, batch);
  return (
    <div style={{ marginBottom: 12, padding: "10px 12px", background: "var(--bg)", borderRadius: 10, border: `1px solid ${overdue ? "#fecaca" : excN ? "#ffe0a0" : "var(--border)"}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={badge("#ede9fe", "#4c1d95", { fontSize: 10, fontWeight: 700, padding: "3px 6px" })}>{f.warehouse || "—"}</span>
          <span style={{ fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.fbaId || f.name || "货件"}</span>
          {f.expectedQty > 0 && <span style={{ fontSize: 10, color: "var(--tm)" }}>{f.expectedQty} 件</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <FbaStatusBadge fba={f} />
          <FbaArrivalHint fba={f} batch={batch} />
          {excN > 0 && <span style={badge("#fff0d4", "#e09000")}>⚠ {excN} 异常</span>}
        </div>
      </div>
      <div style={{ height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ height: "100%", width: `${prog}%`, background: stageColor(st), borderRadius: 2 }} />
      </div>
      <StageDotLine stage={f.status} dotSize={6} />
      <FbaExceptionList exceptions={fbaAllExceptions(f, batch, fbaIndex)} />
    </div>
  );
}
function FbaRow({ fba, onEditTracking }) {
  const [editing, setEditing] = useState(false);
  const [trackVal, setTrackVal] = useState(fba.tracking || "");
  const missing = fbaEffectiveStatus(fba) === "缺少追踪编码";
  const saveTrack = () => { onEditTracking(fba.id, trackVal.trim()); setEditing(false); };
  return (
    <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: 11 }}>
      <div style={{ fontWeight: 600, marginBottom: 3, lineHeight: 1.4 }}>{fba.name}</div>
      <div style={{ color: "var(--tm)", marginBottom: 6 }}>{fba.fbaId}{fba.internalId ? ` · ${fba.internalId}` : ""}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 4 }}>
        <span style={{ color: "var(--tm)" }}>配送 {fmtWindow(fba.windowStart, fba.windowEnd)}</span>
        <span style={{ color: "var(--tm)" }}>{fba.expectedQty} 件{fba.receivedQty > 0 ? ` / 已收 ${fba.receivedQty}` : ""}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {editing ? (
          <>
            <input value={trackVal} onChange={e => setTrackVal(e.target.value)} placeholder="输入追踪编码" style={{ ...inpSm, flex: 1, minWidth: 140 }} autoFocus onKeyDown={e => { if (e.key === "Enter") saveTrack(); if (e.key === "Escape") setEditing(false); }} />
            <button type="button" onClick={saveTrack} style={{ background: "#2d7dd2", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>保存</button>
          </>
        ) : missing ? (
          <button type="button" onClick={e => { e.stopPropagation(); setTrackVal(fba.tracking || ""); setEditing(true); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#E24B4A", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>缺少追踪编码 · 点击填写</button>
        ) : (
          <span style={{ color: "var(--tm)", cursor: "pointer" }} onClick={e => { e.stopPropagation(); setTrackVal(fba.tracking || ""); setEditing(true); }} title="点击编辑">追踪 {fba.tracking || "—"}</span>
        )}
      </div>
    </div>
  );
}
function ShipmentGroupCard({ group, expanded, onToggleExpand, onEdit, onEditTracking, onDelete }) {
  const fbas = group.fbaShipments || [];
  const fbaCount = fbas.length;
  const totalQty = batchDisplayQty(group);
  const excN = openExcCount(group);
  const bc = batchHeadOverdue(group) ? "#E24B4A" : excN > 0 ? "#e09000" : "var(--border)";
  const tm = TRANSPORT_META[group.transport] || { icon: "📦", bg: "#f3f4f6", c: "#666" };
  return (
    <div style={{ background: "var(--card)", border: `1px solid ${batchHeadOverdue(group) ? "#fecaca" : "var(--border)"}`, borderLeft: `4px solid ${bc === "var(--border)" ? "#c8c6bc" : bc}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "12px 14px", background: "var(--bg)", borderBottom: expanded ? "1px solid var(--border)" : "none" }}>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onToggleExpand(); }}
          title={expanded ? "收起批次" : "展开批次"}
          style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, width: 28, height: 28, flexShrink: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 11, color: "#2d7dd2", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}
        >
          {expanded ? "▼" : "▶"}
        </button>
        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={onEdit}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{group.name}</span>
            {group.sku && <span style={{ fontSize: 12, color: "var(--tm)" }}>{group.sku}</span>}
            <span style={badge(tm.bg, tm.c)}>{tm.icon} {group.transport}</span>
            {excN > 0 && <span style={badge("#fff0d4", "#e09000")}>⚠ {excN} 异常</span>}
          </div>
          <div style={{ fontSize: 11, color: "var(--tm)" }}>
            {fbaCount} 个货件 · 共 <strong style={{ color: "var(--text)", fontWeight: 700 }}>{totalQty}</strong> 件
            {group.blNumber ? ` · B/L ${group.blNumber}` : ""}
            {group.updatedAt ? ` · 更新 ${formatSharedTime(group.updatedAt)}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Avatar name={group.owner} />
            <span style={{ fontSize: 11, color: "var(--tm)" }}>{group.owner}</span>
            <RoleBadge role={getStaffRole(group.owner)} />
          </div>
          <button type="button" onClick={e => { e.stopPropagation(); onDelete(); }} style={{ background: "transparent", border: "1px solid #fecaca", borderRadius: 6, padding: "2px 8px", fontSize: 10, cursor: "pointer", fontFamily: "inherit", color: "#e55" }}>删除</button>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: "12px 14px 14px" }}>
          {fbaCount > 0 ? (
            <>
              {fbas.map((f, i) => <FbaStageTrack key={f.id} fba={f} batch={group} fbaIndex={i} />)}
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 4 }}>
                {fbas.map(f => <FbaRow key={f.id} fba={f} onEditTracking={(fid, tracking) => onEditTracking(group.id, fid, tracking)} />)}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: "var(--tm)", padding: "6px 0", cursor: "pointer" }} onClick={onEdit}>暂无货件 · 点击编辑添加</div>
          )}
        </div>
      )}
    </div>
  );
}
function FbaEditorRow({ fba, onChange, onRemove }) {
  const setExcs = (exceptions) => onChange({ ...fba, exceptions });
  const excs = fba.exceptions || [];
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px", marginBottom: 8, background: "var(--bg)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{fba.warehouse || "货件"}{fba.fbaId ? ` · ${fba.fbaId}` : ""}</span>
        <button type="button" onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 18, padding: "0 4px" }}>×</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div><label style={lbl}>货件名称</label><input value={fba.name} onChange={e => onChange({ ...fba, name: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>FBA 货件编号</label><input value={fba.fbaId} onChange={e => onChange({ ...fba, fbaId: e.target.value })} placeholder="FBA19..." style={inp} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div><label style={lbl}>内部编号</label><input value={fba.internalId} onChange={e => onChange({ ...fba, internalId: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>仓库代码</label><input value={fba.warehouse} onChange={e => onChange({ ...fba, warehouse: e.target.value.toUpperCase() })} placeholder="RDU2" style={inp} /></div>
        <div><label style={lbl}>预计件数</label><input type="number" value={fba.expectedQty} onChange={e => onChange({ ...fba, expectedQty: +e.target.value || 0 })} style={inp} /></div>
        <div><label style={lbl}>已收件数</label><input type="number" value={fba.receivedQty} onChange={e => onChange({ ...fba, receivedQty: +e.target.value || 0 })} style={inp} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div><label style={lbl}>预计出港</label><input type="date" value={fba.etaDeparture || ""} onChange={e => onChange({ ...fba, etaDeparture: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>预计抵达</label><input type="date" value={fba.etaArrival || ""} onChange={e => onChange({ ...fba, etaArrival: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>配送开始</label><input type="date" value={fba.windowStart} onChange={e => onChange({ ...fba, windowStart: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>配送结束</label><input type="date" value={fba.windowEnd} onChange={e => onChange({ ...fba, windowEnd: e.target.value })} style={inp} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div><label style={lbl}>追踪编码</label><input value={fba.tracking} onChange={e => onChange({ ...fba, tracking: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>状态</label><select value={normalizeShipmentStage(fba.status)} onChange={e => onChange({ ...fba, status: e.target.value })} style={{ ...inp, background: "var(--card)" }}>{SHIPMENT_STAGES.map(s => <option key={s}>{s}</option>)}</select></div>
      </div>
      <ExceptionEditor excs={excs} setExcs={setExcs} />
    </div>
  );
}
function ShipmentModal({ item, onSave, onClose, onDelete, getExistingFbaIds }) {
  const [form, setForm] = useState(item);
  const [fbas, setFbas] = useState(() => {
    const legacyExcs = item.exceptions?.length ? item.exceptions.map(e => ({ ...e })) : [];
    return (item.fbaShipments || []).map((s, i) => ensureFbaDefaults({
      ...s,
      exceptions: (s.exceptions?.length ? s.exceptions : (i === 0 ? legacyExcs : [])).map(e => ({ ...e })),
    }, item));
  });
  const [nextFbaId, setNextFbaId] = useState(() => Math.max(0, ...(item.fbaShipments || []).map(s => s.id)) + 1);
  const [importMsg, setImportMsg] = useState("");
  const [saveWarn, setSaveWarn] = useState("");
  const fileInputRef = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const applyFbas = (nextFbas) => {
    setFbas(nextFbas);
    if (nextFbas.length) {
      setForm(f => ({ ...f, totalQty: sumFbaExpectedQty(nextFbas) }));
    }
  };
  const handleSave = (e) => {
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
      exceptions: (f.exceptions || []).map(e => ({ ...e })),
    }));
    onSave({
      ...form,
      headStatus: deriveHeadStatus(normalizedFbas),
      totalQty,
      exceptions: [],
      fbaShipments: normalizedFbas,
    });
  };
  const emptyFba = () => ({ id: nextFbaId, name: "", fbaId: "", internalId: "", warehouse: "", expectedQty: 0, receivedQty: 0, windowStart: "", windowEnd: "", etaDeparture: "", etaArrival: "", tracking: "", status: DEFAULT_SHIPMENT_STAGE, exceptions: [], note: "" });
  const onCsvPick = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    try {
      const { fbaShipments, totalQty, sku, warnings } = await readStaCsvFiles(files);
      const existingIds = new Set(getExistingFbaIds ? getExistingFbaIds() : []);
      fbas.forEach(f => {
        const fid = normalizeFbaId(f.fbaId);
        if (fid) existingIds.add(fid);
      });
      const { unique, dupes } = splitDuplicateFbaImports(fbaShipments, existingIds);
      if (!unique.length) {
        setImportMsg(formatDuplicateFbaMsg(dupes, "无法重复导入"));
        e.target.value = "";
        return;
      }
      let nid = nextFbaId;
      const imported = unique.map(f => ({ ...f, id: nid++ }));
      const merged = [...fbas, ...imported];
      applyFbas(merged);
      setNextFbaId(nid);
      setForm(f => ({
        ...f,
        totalQty: sumFbaExpectedQty(merged),
        sku: f.sku || sku,
        name: f.name || (imported.length === 1 ? imported[0].name : f.name),
      }));
      const baseMsg = warnings.length ? `已导入 ${imported.length} 个货件（${warnings.join("；")}）` : `已导入 ${imported.length} 个 STA 货件`;
      setImportMsg(dupes.length ? `${baseMsg}；${formatDuplicateFbaMsg(dupes, "已跳过")}` : baseMsg);
    } catch (err) {
      setImportMsg(err.message || "CSV 解析失败");
    }
    e.target.value = "";
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem 1rem" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} aria-hidden />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "relative", zIndex: 1, background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 14, width: "100%", maxWidth: 760, maxHeight: "calc(100vh - 3rem)",
          color: "var(--text)", display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem 1.5rem 0" }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: "1rem" }}>{item.id ? "编辑发货批次" : "新建发货批次"}</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tm)", marginBottom: 8 }}>批次信息</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>批次名称 <span style={{ color: "#c62828" }}>*</span></label><input value={form.name} onChange={e => { set("name", e.target.value); if (saveWarn) setSaveWarn(""); }} placeholder="FB100绿色第三批" style={inp} /></div>
          <div><label style={lbl}>产品 / SKU</label><input value={form.sku} onChange={e => set("sku", e.target.value)} placeholder="FB100" style={inp} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>跟进人</label><OwnerField value={form.owner} onChange={v => set("owner", v)} inputStyle={inp} /></div>
          <div><label style={lbl}>头程方式</label><select value={form.transport} onChange={e => set("transport", e.target.value)} style={{ ...inp, background: "var(--card)" }}>{Object.keys(TRANSPORT_META).map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label style={lbl}>国内出货日期</label><input type="date" value={form.shipDate} onChange={e => set("shipDate", e.target.value)} style={inp} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div><label style={lbl}>货代公司</label><input value={form.forwarder} onChange={e => set("forwarder", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>提单号 B/L</label><input value={form.blNumber} onChange={e => set("blNumber", e.target.value)} style={inp} /></div>
        </div>
        <div style={{ marginBottom: 12 }}><label style={lbl}>备注</label><input value={form.note} onChange={e => set("note", e.target.value)} style={inp} /></div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tm)", borderTop: "1px solid var(--border)", paddingTop: 10, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span>FBA 货件 ({fbas.length})</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input ref={fileInputRef} type="file" accept=".csv" multiple style={{ display: "none" }} onChange={onCsvPick} />
            <button type="button" onClick={() => fileInputRef.current?.click()} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", color: "#2d7dd2" }}>📥 导入 STA CSV</button>
          </div>
        </div>
        {importMsg && <div style={{ fontSize: 11, color: importMsg.includes("失败") || importMsg.includes("不是") ? "#E24B4A" : "#1a6b35", marginBottom: 8, padding: "6px 10px", background: importMsg.includes("失败") || importMsg.includes("不是") ? "#fee2e2" : "#f0faf4", borderRadius: 8 }}>{importMsg}</div>}
        {fbas.map((f, i) => <FbaEditorRow key={f.id} fba={f} onChange={v => { const a = [...fbas]; a[i] = v; applyFbas(a); }} onRemove={() => applyFbas(fbas.filter((_, j) => j !== i))} />)}
        <button type="button" onClick={() => { applyFbas([...fbas, emptyFba()]); setNextFbaId(nextFbaId + 1); }} style={{ width: "100%", border: "1px dashed var(--border)", borderRadius: 8, padding: "6px 0", fontSize: 12, cursor: "pointer", color: "var(--tm)", background: "transparent", marginBottom: 12, fontFamily: "inherit" }}>+ 添加 FBA 货件</button>
        </div>
        <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)", padding: "12px 1.5rem 1.5rem", background: "var(--card)" }}>
          {saveWarn && <div style={{ fontSize: 12, color: "#c62828", marginBottom: 8 }}>{saveWarn}</div>}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            {item.id ? <button type="button" onClick={onDelete} style={{ background: "none", border: "none", color: "#e55", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>删除批次</button> : <div />}
            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              <button type="button" onClick={onClose} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "var(--tm)" }}>取消</button>
              <button type="button" onClick={handleSave} style={{ background: "#2d7dd2", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>保存</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function LogisticsPanel({ active = true }) {
  const { items, meta, loading, saving, error, persist, reload } = useSharedList("logistics", INIT_LOGISTICS, { active });
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
    saveLogisticsFilters({ filter, ownerFilter, productFilter });
  }, [filter, ownerFilter, productFilter]);

  const setFilterPersist = (key) => {
    setFilter(key);
    saveLogisticsFilters({ filter: key, ownerFilter, productFilter });
  };
  const setOwnerFilterPersist = (name) => {
    setOwnerFilter(name);
    saveLogisticsFilters({ filter, ownerFilter: name, productFilter });
  };
  const setProductFilterPersist = (key) => {
    setProductFilter(key);
    saveLogisticsFilters({ filter, ownerFilter, productFilter: key });
  };

  const toggleExpanded = (id) => setExpanded(prev => {
    const key = String(id);
    const next = { ...prev, [key]: !isBatchExpanded(prev, id) };
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
    done: scopedList.filter(batchAllDone).length,
  };
  const owners = ownerFilterEntries();
  let vis = scopedList.slice();
  if (ownerFilter !== "all") vis = vis.filter(i => i.owner === ownerFilter);
  if (filter === "transit") vis = vis.filter(batchHeadTransit);
  else if (filter === "missing_track") vis = vis.filter(batchMissingTrack);
  else if (filter === "receiving") vis = vis.filter(batchReceiving);
  else if (filter === "done") vis = vis.filter(batchAllDone);
  vis.sort((a, b) => {
    const pa = batchHeadOverdue(a) ? 0 : openExcCount(a) ? 1 : 2;
    const pb = batchHeadOverdue(b) ? 0 : openExcCount(b) ? 1 : 2;
    if (pa !== pb) return pa - pb;
    return batchEarliestEtaDiff(a) - batchEarliestEtaDiff(b);
  });
  const save = (t) => {
    const now = Date.now();
    const withTime = { ...t, updatedAt: now };
    if (t.id) persist(list.map(x => x.id === t.id ? withTime : x));
    else persist([...list, { ...withTime, id: nextId() }]);
    setModal(null);
  };
  const deleteGroup = (g) => {
    if (!window.confirm(`确定删除批次「${g.name || g.sku || "未命名"}」？删除后无法恢复。`)) return;
    persist(list.filter(x => x.id !== g.id), { replace: true });
    if (modal?.id === g.id) setModal(null);
  };
  const editTracking = (gid, fid, tracking) => {
    const now = Date.now();
    persist(list.map(g => {
      if (g.id !== gid) return g;
      const fbaShipments = (g.fbaShipments || []).map(s => s.id !== fid ? s : {
        ...s, tracking,
        status: tracking.trim() && ["待出库", "已入仓"].includes(normalizeShipmentStage(s.status)) ? "在途" : normalizeShipmentStage(s.status),
      });
      return { ...g, fbaShipments, headStatus: deriveHeadStatus(fbaShipments), updatedAt: now };
    }));
  };
  const cloneGroup = (g) => ({
    ...g,
    exceptions: (g.exceptions || []).map(e => ({ ...e })),
    fbaShipments: (g.fbaShipments || []).map(s => ({
      ...ensureFbaDefaults(s, g),
      exceptions: (s.exceptions || []).map(e => ({ ...e })),
    })),
  });
  const emptyGroup = { name: "", sku: "", totalQty: 0, owner: "", shipDate: "", transport: "海运", forwarder: "", blNumber: "", etaDeparture: "", etaArrival: "", headStatus: DEFAULT_SHIPMENT_STAGE, note: "", exceptions: [], fbaShipments: [] };
  const emptyGroupForProduct = () => {
    if (!currentProduct) return { ...emptyGroup };
    return { ...emptyGroup, sku: currentProduct.sku || currentProduct.id };
  };
  const onPanelCsvImport = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    try {
      const { fbaShipments, totalQty, sku } = await readStaCsvFiles(files);
      const existingIds = collectFbaIdsFromGroups(list);
      const { unique, dupes } = splitDuplicateFbaImports(fbaShipments, existingIds);
      if (!unique.length) {
        alert(formatDuplicateFbaMsg(dupes, "无法重复导入"));
        e.target.value = "";
        return;
      }
      if (dupes.length) alert(formatDuplicateFbaMsg(dupes, "已跳过重复项"));
      const label = files.length === 1 ? unique[0]?.fbaId || "新批次" : `导入 ${unique.length} 个货件`;
      const base = emptyGroupForProduct();
      setModal({ ...base, name: label, sku: base.sku || sku, totalQty, fbaShipments: unique });
    } catch (err) {
      alert(err.message || "CSV 解析失败");
    }
    e.target.value = "";
  };
  const tabs = [
    { key: "all", label: "全部", nc: "var(--text)" },
    { key: "transit", label: "头程在途", nc: "#2d7dd2" },
    { key: "missing_track", label: "缺少追踪码", nc: "#E24B4A" },
    { key: "receiving", label: "FBA接收中", nc: "#1a9e8a" },
    { key: "done", label: "已完成", nc: "#2d9e52" },
  ];
  useCloudSyncPage(active, {
    label: "物流",
    save: async () => persist(list),
    reload,
    meta,
    loading,
    saving,
    error,
    isDirty: !!modal,
    dirtyHint: "物流批次编辑弹窗未保存",
  });
  return (
    <div>
      {products.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: 11, color: "var(--tm)", marginBottom: 8 }}>产品分页 · 切换查看各产品头程</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setProductFilterPersist("all")} style={productTabChip(productFilter === "all")}>
              全部产品<span style={{ marginLeft: 6, fontSize: 11, opacity: 0.85 }}>({list.length})</span>
            </button>
            {products.map(p => (
              <button key={p.id} type="button" onClick={() => setProductFilterPersist(p.id)} style={productTabChip(productFilter === p.id)} title={p.name}>
                {p.sku || p.name}
                <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.85 }}>({p.batches.length})</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {currentProduct && (
        <div style={{ background: "var(--card)", border: "1px solid #2d7dd2", borderRadius: 12, padding: "12px 16px", marginBottom: "1rem" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{currentProduct.name}</div>
          <div style={{ fontSize: 11, color: "var(--tm)", marginTop: 4 }}>
            {currentProduct.batches.length} 个发货批次 · 仅显示本产品相关头程
          </div>
        </div>
      )}
      <FBAGanttCard groups={list} productFilter={productFilter} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 7, flex: 1, minWidth: 280 }}>
          {tabs.map(f => (
            <div key={f.key} onClick={() => setFilterPersist(f.key)} style={{ background: "var(--card)", border: `1px solid ${filter === f.key ? "#2d7dd2" : "var(--border)"}`, borderRadius: 10, padding: "9px 10px", cursor: "pointer" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: f.nc }}>{counts[f.key]}</div>
              <div style={{ fontSize: 10, color: "var(--tm)", marginTop: 1 }}>{f.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <input ref={panelCsvRef} type="file" accept=".csv" multiple style={{ display: "none" }} onChange={onPanelCsvImport} />
        <button type="button" onClick={() => panelCsvRef.current?.click()} style={{ background: "var(--card)", color: "#2d7dd2", border: "1px solid #2d7dd2", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>📥 导入 CSV</button>
        <button onClick={() => setModal(emptyGroupForProduct())} style={{ background: "#2d7dd2", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>+ 新建批次</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--tm)" }}>跟进人</span>
        {owners.map(o => (
          <button key={o.name} onClick={() => setOwnerFilterPersist(o.name)} style={{ background: ownerFilter === o.name ? "#2d7dd2" : "var(--card)", color: ownerFilter === o.name ? "#fff" : "var(--tm)", border: `1px solid ${ownerFilter === o.name ? "#2d7dd2" : "var(--border)"}`, borderRadius: 20, padding: "4px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>
            {o.name === "all" ? "全部" : (<>{o.name}{o.role && <RoleBadge role={o.role} style={{ padding: "0 5px", fontSize: 9 }} />}</>)}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {vis.length ? vis.map(g => (
          <ShipmentGroupCard
            key={g.id}
            group={g}
            expanded={isBatchExpanded(expanded, g.id)}
            onToggleExpand={() => toggleExpanded(g.id)}
            onEdit={() => setModal(cloneGroup(g))}
            onEditTracking={editTracking}
            onDelete={() => deleteGroup(g)}
          />
        )) : <div style={{ textAlign: "center", padding: "2rem", color: "var(--tm)", fontSize: 13 }}>{currentProduct ? "该产品暂无匹配批次" : "暂无匹配批次"}</div>}
      </div>
      {modal && <ShipmentModal item={modal} onSave={save} getExistingFbaIds={() => collectFbaIdsFromGroups(list, modal.id)} onClose={() => {
        if (!window.confirm("弹窗未点「保存」，修改不会上传。确定关闭？")) return;
        setModal(null);
      }} onDelete={() => { persist(list.filter(x => x.id !== modal.id), { replace: true }); setModal(null); }} />}
    </div>
  );
}

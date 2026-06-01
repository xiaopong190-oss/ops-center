const { useState, useRef, useEffect, useCallback, createContext, useContext } = React;

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

function loadExpandedState() {
  try {
    const raw = sessionStorage.getItem(LOG_EXPAND_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { 1: true };
}

function saveExpandedState(state) {
  try { sessionStorage.setItem(LOG_EXPAND_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

// ─── GLOBAL CONFIG (全站共享：员工名单等) ─────────────────────────────
const CONFIG_STORAGE_KEY = "ops-center-global-config";

const JSONBIN_API_KEY = "$2a$10$2ozXoCjldhmBsjtHria.3.Qe9IGP3lPWQnxGsvO4fOBdlfDogsBZq";
const JSONBIN_API_BASE = "https://api.jsonbin.io/v3/b";
const JSONBIN_BIN_IDS = {
  logistics: "6a1d27c321f9ee59d2a3c1c4",
  tasks: "6a1d27fd21f9ee59d2a3c26e",
  production: "6a1d282721f9ee59d2a3c30a",
  "tools-links": "6a1d284521f9ee59d2a3c375",
};

function resolveJsonBinId(key) {
  return JSONBIN_BIN_IDS[key] || null;
}

function sharedLocalGet(key) {
  try {
    const raw = localStorage.getItem(`shared:${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function sharedLocalSet(key, value, updatedBy) {
  const payload = {
    data: value,
    updatedBy: updatedBy || "未知",
    updatedAt: Date.now(),
  };
  localStorage.setItem(`shared:${key}`, JSON.stringify(payload));
  return payload;
}

function sharedLocalDelete(key) {
  localStorage.removeItem(`shared:${key}`);
}

function normalizeSharedRecord(record) {
  if (record == null) return null;
  if (typeof record === "object" && Object.prototype.hasOwnProperty.call(record, "data")) {
    return {
      data: record.data,
      updatedBy: record.updatedBy || "",
      updatedAt: record.updatedAt || 0,
    };
  }
  return { data: record, updatedBy: "", updatedAt: 0 };
}

function notifySharedUpdated(key) {
  window.dispatchEvent(new CustomEvent(`ops-shared-updated:${key}`));
}

const sharedStorage = {
  async get(key) {
    const binId = resolveJsonBinId(key);
    if (!binId) return sharedLocalGet(key);

    try {
      const res = await fetch(`${JSONBIN_API_BASE}/${binId}/latest`, {
        headers: { "X-Master-Key": JSONBIN_API_KEY },
        cache: "no-store",
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`JSONBin GET ${res.status}`);
      const json = await res.json();
      const normalized = normalizeSharedRecord(json.record);
      if (normalized) {
        sharedLocalSet(key, normalized.data, normalized.updatedBy);
        return { ...normalized, _source: "cloud" };
      }
      return null;
    } catch {
      const local = sharedLocalGet(key);
      if (local) return { ...local, _source: "local-fallback" };
      return null;
    }
  },

  async set(key, value, updatedBy) {
    const payload = {
      data: value,
      updatedBy: updatedBy || "未知",
      updatedAt: Date.now(),
    };
    const binId = resolveJsonBinId(key);
    if (!binId) {
      sharedLocalSet(key, value, updatedBy);
      notifySharedUpdated(key);
      return { ...payload, _source: "local" };
    }

    try {
      const res = await fetch(`${JSONBIN_API_BASE}/${binId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": JSONBIN_API_KEY,
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`JSONBin PUT ${res.status}`);
      sharedLocalSet(key, value, updatedBy);
      notifySharedUpdated(key);
      return { ...payload, _source: "cloud" };
    } catch (e) {
      sharedLocalSet(key, value, updatedBy);
      notifySharedUpdated(key);
      throw new Error(`云端保存失败（已暂存本机）：${e?.message || "网络错误"}`);
    }
  },

  async delete(key) {
    const binId = resolveJsonBinId(key);
    if (!binId) {
      sharedLocalDelete(key);
      notifySharedUpdated(key);
      return;
    }
    await sharedStorage.set(key, null, "");
  },
};

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
    const trimmed = line.trim();
    return { name: name || trimmed, role: role || "" };
  }).filter(e => e.name);
}

function formatStaffText(staff) {
  return staff.map(e => `${e.name}|${e.role || ""}`).join("\n");
}

function loadGlobalConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return { staff: DEFAULT_GLOBAL_CONFIG.staff.map(e => ({ ...e })) };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.staff) || !parsed.staff.length) {
      return { staff: DEFAULT_GLOBAL_CONFIG.staff.map(e => ({ ...e })) };
    }
    const staff = parsed.staff.map(normalizeStaffEntry).filter(e => e.name);
    if (JSON.stringify(parsed.staff) !== JSON.stringify(staff)) {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ staff }));
    }
    return { staff };
  } catch {
    return { staff: DEFAULT_GLOBAL_CONFIG.staff.map(e => ({ ...e })) };
  }
}

function saveGlobalConfig(config) {
  const next = {
    staff: (config.staff || []).map(normalizeStaffEntry).filter(e => e.name),
  };
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
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

/** 全局员工 + 业务数据里出现过的姓名，去重排序 */
function ownerOptions(...extraLists) {
  const fromData = extraLists.flat().filter(Boolean);
  const byName = new Map(getEmployees().map(e => [e.name, e]));
  for (const n of fromData) {
    if (!byName.has(n)) byName.set(n, { name: n, role: "" });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

/** 跟进人筛选：全部 + 员工对象列表 */
function ownerFilterEntries(...extraLists) {
  return [{ name: "all", role: "" }, ...ownerOptions(...extraLists)];
}

/** 跟进人筛选：全部 + 合并名单（姓名字符串，兼容旧用法） */
function ownerFilterOptions(...extraLists) {
  return ownerFilterEntries(...extraLists).map(e => e.name);
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

function OwnerField({ value, onChange, listId = "owner-list", extraOwners = [], placeholder = "选择负责人…", style, inputStyle }) {
  useGlobalConfig();
  const options = ownerOptions(extraOwners);
  const known = new Set(options.map(o => o.name));
  const [manual, setManual] = useState(() => !!(value && !known.has(value)));
  const fieldStyle = { ...(inputStyle || style), background: "var(--card)" };

  useEffect(() => {
    if (value && !known.has(value)) setManual(true);
    else if (value && known.has(value)) setManual(false);
  }, [value, options.map(o => o.name).join("\0")]);

  if (manual) {
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input list={listId} value={value} onChange={e => onChange(e.target.value)} placeholder="输入姓名…" style={{ ...fieldStyle, flex: 1 }} />
        <datalist id={listId}>{options.map(o => <option key={o.name} value={o.name}>{formatOwnerLabel(o)}</option>)}</datalist>
        <button type="button" onClick={() => { setManual(false); if (!known.has(value)) onChange(""); }} style={{ fontSize: 11, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", cursor: "pointer", color: "var(--tm)", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>从列表选</button>
      </div>
    );
  }

  return (
    <select
      value={known.has(value) ? value : ""}
      onChange={e => {
        const v = e.target.value;
        if (v === "__manual__") { setManual(true); onChange(""); return; }
        onChange(v);
      }}
      style={fieldStyle}
    >
      <option value="">{placeholder}</option>
      {options.map(o => (
        <option key={o.name} value={o.name}>{formatOwnerLabel(o)}</option>
      ))}
      <option value="__manual__">手动输入…</option>
    </select>
  );
}

function StaffListEditor({ rows, onChange }) {
  const setRow = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
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
              <button type="button" onClick={() => removeRow(i)} title="删除" aria-label="删除" style={{ width: 28, height: 28, border: "none", background: "transparent", color: "#bbb", cursor: "pointer", fontSize: 20, lineHeight: 1, flexShrink: 0, fontFamily: "inherit" }}>×</button>
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

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    const staff = rows.map(r => ({ name: r.name.trim(), role: r.role || "" })).filter(r => r.name);
    saveGlobalConfig({ staff });
    onSaved && onSaved();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 300, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "2rem 1rem", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "1.25rem 1.5rem", width: "100%", maxWidth: 440, color: "var(--text)" }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>全局员工名单</div>
        <div style={{ fontSize: 11, color: "var(--tm)", marginBottom: 14, lineHeight: 1.5 }}>
          填写姓名并选择角色，保存后会在各模块「负责人 / 跟进人」中统一出现。
        </div>
        <StaffListEditor rows={rows} onChange={setRows} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={onClose} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "var(--tm)" }}>取消</button>
          <button type="button" onClick={save} style={{ background: "#2d7dd2", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "#fff" }}>保存</button>
        </div>
      </div>
    </div>
  );
}

function useGlobalConfig() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion(v => v + 1);
    window.addEventListener("ops-global-config-updated", bump);
    return () => window.removeEventListener("ops-global-config-updated", bump);
  }, []);
  return { version, staff: getEmployees(), reload: () => setVersion(v => v + 1) };
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
window.sharedStorage = sharedStorage;
// ─── STORAGE (shared / private) ─────────────────────────────────────
const CURRENT_USER_KEY = "ops-center-current-user";

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
    } catch {
      return null;
    }
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
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const CLIENT_ID_KEY = "ops-center-client-id";
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

function isGitHubPages() {
  return typeof location !== "undefined" && /\.github\.io$/i.test(location.hostname);
}

function isLocalOpsServer() {
  if (typeof location === "undefined") return false;
  const h = location.hostname;
  return h === "localhost" || h.startsWith("127.") || isPrivateLanIp(h);
}

function isPrivateLanIp(ip) {
  if (!ip || typeof ip !== "string") return false;
  if (ip.startsWith("192.168.") || ip.startsWith("10.")) return true;
  return /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip);
}

function detectLocalLanIpViaWebRTC() {
  return new Promise((resolve) => {
    if (typeof RTCPeerConnection !== "function") {
      resolve("");
      return;
    }
    let settled = false;
    const finish = (ip) => {
      if (settled) return;
      settled = true;
      try { pc.close(); } catch { /* ignore */ }
      resolve(ip || "");
    };
    const pc = new RTCPeerConnection({ iceServers: [] });
    const found = new Set();
    pc.createDataChannel("ops-center");
    pc.onicecandidate = (event) => {
      if (!event.candidate?.candidate) return;
      const match = /(\d{1,3}(?:\.\d{1,3}){3})/.exec(event.candidate.candidate);
      if (!match) return;
      const ip = match[1];
      if (!isPrivateLanIp(ip)) return;
      found.add(ip);
      const preferred = [...found].find(i => i.startsWith("192.168.")) || [...found][0];
      finish(preferred);
    };
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .catch(() => finish(""));
    setTimeout(() => {
      if (found.size) {
        finish([...found].find(i => i.startsWith("192.168.")) || [...found][0]);
      } else {
        finish("");
      }
    }, 800);
  });
}

function priorityLocalKey(clientId, date) {
  return `priority:${clientId}:${date}`;
}

function readPriorityLocal(clientId, date) {
  try {
    const raw = localStorage.getItem(priorityLocalKey(clientId, date));
    if (!raw) return { date: "", text: "" };
    const parsed = JSON.parse(raw);
    if (parsed?.date === date && parsed.text) {
      return { date: parsed.date, text: parsed.text };
    }
  } catch { /* ignore */ }
  return { date: "", text: "" };
}

function writePriorityLocal(clientId, entry) {
  try {
    localStorage.setItem(priorityLocalKey(clientId, entry.date), JSON.stringify(entry));
  } catch { /* ignore */ }
}

async function resolveClientId() {
  try {
    const cached = localStorage.getItem(CLIENT_ID_KEY);
    if (cached && isPrivateLanIp(cached)) return cached;
    if (cached && !isPrivateLanIp(cached)) localStorage.removeItem(CLIENT_ID_KEY);
  } catch { /* ignore */ }

  if (isGitHubPages()) return getOrCreateDeviceId();

  if (isLocalOpsServer()) {
    try {
      const res = await fetch("/api/client-id");
      if (res.ok) {
        const data = await res.json();
        if (data.clientId && isPrivateLanIp(data.clientId)) {
          localStorage.setItem(CLIENT_ID_KEY, data.clientId);
          return data.clientId;
        }
      }
    } catch { /* ignore */ }

    const lanIp = await detectLocalLanIpViaWebRTC();
    if (lanIp && isPrivateLanIp(lanIp)) {
      try { localStorage.setItem(CLIENT_ID_KEY, lanIp); } catch { /* ignore */ }
      return lanIp;
    }
  }

  return getOrCreateDeviceId();
}

async function loadTodayPriority(clientId, date) {
  const id = clientId || getOrCreateDeviceId();
  if (!id) return { date: "", text: "" };

  if (isLocalOpsServer()) {
    try {
      const res = await fetch(`/api/priority?date=${encodeURIComponent(date)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.date === date && data.text) {
          const entry = { date: data.date, text: data.text };
          writePriorityLocal(id, entry);
          return entry;
        }
        if (data.ok && data.date === date && !data.text) {
          return { date: "", text: "" };
        }
      }
    } catch { /* ignore */ }
  }

  return readPriorityLocal(id, date);
}

async function saveTodayPriority(clientId, date, text) {
  const id = clientId || getOrCreateDeviceId();
  const entry = { date, text: text.trim() };
  writePriorityLocal(id, entry);

  if (isLocalOpsServer()) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2000);
      await fetch("/api/priority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, text: entry.text }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
    } catch { /* ignore */ }
  }

  return entry;
}

function useSharedList(storageKey, defaultData) {
  const read = useCallback(async () => {
    try {
      const raw = await sharedStorage.get(storageKey);
      const data = raw?.data != null ? raw.data : defaultData;
      return { data, meta: raw, error: "" };
    } catch (e) {
      return { data: defaultData, meta: null, error: e?.message || "读取失败" };
    }
  }, [storageKey, defaultData]);

  const [state, setState] = useState({ data: defaultData, meta: null, loading: true, error: "" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await read();
      if (!cancelled) setState({ ...next, loading: false });
    })();
    return () => { cancelled = true; };
  }, [read]);

  useEffect(() => {
    const handler = () => {
      read().then(next => setState({ ...next, loading: false }));
    };
    window.addEventListener(`ops-shared-updated:${storageKey}`, handler);
    return () => window.removeEventListener(`ops-shared-updated:${storageKey}`, handler);
  }, [storageKey, read]);

  useEffect(() => {
    const refresh = () => read().then(next => setState({ ...next, loading: false }));
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(refresh, 30000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [read]);

  const persist = useCallback(async (data) => {
    setState(prev => ({
      data,
      meta: { updatedBy: getCurrentUser().name, updatedAt: Date.now(), ...(prev.meta || {}) },
      loading: false,
      error: "",
    }));
    try {
      await sharedStorage.set(storageKey, data, getCurrentUser().name);
      const raw = await sharedStorage.get(storageKey);
      setState({
        data: raw?.data != null ? raw.data : data,
        meta: raw,
        loading: false,
        error: "",
      });
    } catch (e) {
      setState(prev => ({
        ...prev,
        data,
        loading: false,
        error: e?.message || "保存失败",
      }));
    }
  }, [storageKey]);

  const reload = useCallback(async () => {
    const next = await read();
    setState({ ...next, loading: false });
  }, [read]);

  return { items: state.data, meta: state.meta, loading: state.loading, error: state.error, persist, reload };
}

function SharedMetaLine({ meta, style, onReload, loading, error }) {
  let bg = "#eef6ff";
  let border = "#b8d4f0";
  let color = "#1a4e8a";
  let text = "☁️ 云端同步已启用 · 修改后全公司电脑自动共享";

  if (loading) {
    bg = "#f3f4f6";
    border = "#d1d5db";
    color = "#4b5563";
    text = "⏳ 正在从云端加载…";
  } else if (error) {
    bg = "#fee2e2";
    border = "#fca5a5";
    color = "#991b1b";
    text = `❌ ${error}`;
  } else if (meta?._source === "cloud") {
    bg = "#ecfdf5";
    border = "#6ee7b7";
    color = "#065f46";
    text = meta?.updatedBy
      ? `☁️ 已从云端同步 · 最后由 ${meta.updatedBy} 更新于 ${formatSharedTime(meta.updatedAt)}`
      : "☁️ 已从云端同步 · 数据全公司共享";
  } else if (meta?._source === "local-fallback") {
    bg = "#fffbeb";
    border = "#fcd34d";
    color = "#92400e";
    text = "⚠️ 云端暂不可用，当前显示本机缓存";
  } else if (meta?._source === "local") {
    bg = "#f3f4f6";
    border = "#d1d5db";
    color = "#4b5563";
    text = "💾 仅保存在本机（未配置云端）";
  } else if (meta?.updatedBy) {
    text = `最后由 ${meta.updatedBy} 更新于 ${formatSharedTime(meta.updatedAt)} · 每 30 秒自动同步`;
  }

  return (
    <div style={{
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
      ...style,
    }}>
      <span>{text}</span>
      {onReload && !loading && (
        <button type="button" onClick={onReload} style={{
          background: "#fff",
          border: `1px solid ${border}`,
          borderRadius: 6,
          padding: "4px 10px",
          fontSize: 11,
          cursor: "pointer",
          fontFamily: "inherit",
          color,
          fontWeight: 600,
          flexShrink: 0,
        }}>
          立即刷新
        </button>
      )}
    </div>
  );
}

// ─── USER CONTEXT ───────────────────────────────────────────────────
const UserContext = createContext(getCurrentUser());

function useCurrentUser() {
  return useContext(UserContext);
}


// ─── LOGISTICS MODULE (Shipment Group + FBA) ─────────────────────────
const HEAD_STAGES = ["备货中", "已出港", "在途", "已到港"];
const HEAD_STAGE_SHORT = { 备货中: "备货", 已出港: "出港", 在途: "在途", 已到港: "到港" };
const headStageColor = (s) => ({ 备货中: "#888", 已出港: "#7a6dd2", 在途: "#2d7dd2", 已到港: "#1a9e8a" }[s] || "#888");
const FBA_STATUSES = ["准备发货", "运输中", "缺少追踪编码", "接收中", "已完成"];
const FBA_STATUS_STYLE = {
  "缺少追踪编码": { bg: "#fee2e2", c: "#E24B4A" },
  "运输中": { bg: "#dceeff", c: "#2d7dd2" },
  "接收中": { bg: "#d1fae5", c: "#1a9e8a" },
  "已完成": { bg: "#d4f0dc", c: "#2d9e52" },
  "准备发货": { bg: "#f3f4f6", c: "#888" },
};
const TRANSPORT_META = { 海运: { icon: "🚢", bg: "#dceeff", c: "#1a4e8a" }, 空运: { icon: "✈", bg: "#ede9fe", c: "#4c1d95" }, 快递: { icon: "📦", bg: "#fef3c7", c: "#78350f" } };
const fmtWindow = (s, e) => (!s && !e) ? "—" : `${s ? fmtD(s) : "?"} – ${e ? fmtD(e) : "?"}`;
const fbaEffectiveStatus = (fba) => {
  if (fba.status === "缺少追踪编码") return "缺少追踪编码";
  if ((fba.status === "准备发货" || !fba.status) && !(fba.tracking || "").trim()) return "缺少追踪编码";
  return fba.status || "准备发货";
};
const batchMissingTrack = (g) => (g.fbaShipments || []).some(s => fbaEffectiveStatus(s) === "缺少追踪编码");
const batchReceiving = (g) => (g.fbaShipments || []).some(s => s.status === "接收中");
const batchAllDone = (g) => (g.fbaShipments || []).length > 0 && (g.fbaShipments || []).every(s => s.status === "已完成");
const batchHeadTransit = (g) => ["已出港", "在途"].includes(g.headStatus);
const batchHeadOverdue = (g) => { const d = daysDiff(g.etaArrival); return d !== null && d < 0 && g.headStatus !== "已到港"; };
const openExcCount = (g) => (g.exceptions || []).filter(e => !e.resolved).length;

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
    fba: { id, name, fbaId, internalId: (meta["工作流程名称"] || "").slice(0, 8).toUpperCase(), warehouse, expectedQty, receivedQty: 0, windowStart, windowEnd: addDaysIso(windowStart, 6), tracking: "", status: "准备发货", note },
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

const INIT_LOGISTICS = [
  {
    id: 1, name: "FB100绿色第三批", sku: "FB100", totalQty: 800, owner: "陈工",
    shipDate: "2026-04-10", transport: "海运", forwarder: "中外运华南", blNumber: "COSU6284731",
    etaDeparture: "2026-05-15", etaArrival: "2026-06-08", headStatus: "在途", note: "正常在途",
    exceptions: [],
    fbaShipments: [
      { id: 101, name: "FBA STA (04/20/2026 10:14)-RDU2", fbaId: "FBA19BWMS0S7", internalId: "11VGG45G", warehouse: "RDU2", expectedQty: 144, receivedQty: 0, windowStart: "2026-05-31", windowEnd: "2026-06-06", tracking: "", status: "准备发货", note: "" },
      { id: 102, name: "FBA STA (04/20/2026 10:14)-SWF2", fbaId: "FBA19BWMT1K3", internalId: "22HJK89M", warehouse: "SWF2", expectedQty: 160, receivedQty: 0, windowStart: "2026-06-01", windowEnd: "2026-06-07", tracking: "1Z999AA10123456784", status: "运输中", note: "" },
      { id: 103, name: "FBA STA (04/20/2026 10:14)-IAH3", fbaId: "FBA19BWMV4P9", internalId: "33PLM12N", warehouse: "IAH3", expectedQty: 168, receivedQty: 120, windowStart: "2026-05-28", windowEnd: "2026-06-03", tracking: "TBA6284731003", status: "接收中", note: "" },
      { id: 104, name: "FBA STA (04/20/2026 10:14)-MDW2", fbaId: "FBA19BWMX7R2", internalId: "44QRS56T", warehouse: "MDW2", expectedQty: 176, receivedQty: 176, windowStart: "2026-05-20", windowEnd: "2026-05-26", tracking: "FBA6284731004", status: "已完成", note: "" },
      { id: 105, name: "FBA STA (04/20/2026 10:14)-ORF2", fbaId: "FBA19BWMZ9T5", internalId: "55UVW78X", warehouse: "ORF2", expectedQty: 152, receivedQty: 0, windowStart: "2026-06-05", windowEnd: "2026-06-11", tracking: "", status: "准备发货", note: "" },
    ],
  },
  {
    id: 2, name: "FB101白色第二批", sku: "FB101", totalQty: 300, owner: "陈工",
    shipDate: "2026-05-08", transport: "空运", forwarder: "顺丰国际", blNumber: "SF20260508001",
    etaDeparture: "2026-05-12", etaArrival: "2026-05-18", headStatus: "已到港", note: "",
    exceptions: [{ desc: "IAH3 仓库拒收部分箱", date: "2026-05-25", resolved: false, action: "货代协调重新配送" }],
    fbaShipments: [
      { id: 201, name: "FBA STA (05/08/2026 09:30)-LAX9", fbaId: "FBA19BXAA1B2", internalId: "66ABC01D", warehouse: "LAX9", expectedQty: 300, receivedQty: 280, windowStart: "2026-05-22", windowEnd: "2026-05-28", tracking: "SF6284732001", status: "接收中", note: "" },
    ],
  },
  {
    id: 3, name: "FB200黑色第一批", sku: "FB200", totalQty: 200, owner: "李工",
    shipDate: "2026-05-01", transport: "海运", forwarder: "马士基订舱", blNumber: "MAEU9876543",
    etaDeparture: "2026-05-28", etaArrival: "2026-06-25", headStatus: "备货中", note: "等工厂尾数",
    exceptions: [],
    fbaShipments: [
      { id: 301, name: "FBA STA (05/01/2026 14:00)-ONT8", fbaId: "FBA19BYCC3D4", internalId: "77DEF02G", warehouse: "ONT8", expectedQty: 200, receivedQty: 0, windowStart: "2026-06-20", windowEnd: "2026-06-26", tracking: "", status: "准备发货", note: "" },
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
  const s = FBA_STATUS_STYLE[st] || FBA_STATUS_STYLE["准备发货"];
  return <span style={badge(s.bg, s.c)}>{st}</span>;
}
function FbaRow({ fba, onEditTracking }) {
  const [editing, setEditing] = useState(false);
  const [trackVal, setTrackVal] = useState(fba.tracking || "");
  const missing = fbaEffectiveStatus(fba) === "缺少追踪编码";
  const saveTrack = () => { onEditTracking(fba.id, trackVal.trim()); setEditing(false); };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: 11, alignItems: "start" }}>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 3, lineHeight: 1.4 }}>{fba.name}</div>
        <div style={{ color: "var(--tm)", marginBottom: 6 }}>{fba.fbaId}{fba.internalId ? ` · ${fba.internalId}` : ""}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 4 }}>
          <span style={badge("#ede9fe", "#4c1d95", { fontWeight: 700, fontSize: 11 })}>{fba.warehouse}</span>
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
            <span style={{ color: "var(--tm)", cursor: "pointer" }} onClick={e => { e.stopPropagation(); setTrackVal(fba.tracking || ""); setEditing(true); }} title="点击编辑">追踪 {fba.tracking}</span>
          )}
        </div>
      </div>
      <FbaStatusBadge fba={fba} />
    </div>
  );
}
function ShipmentGroupCard({ group, expanded, onToggleExpand, onEdit, onEditTracking }) {
  const stageIdx = HEAD_STAGES.indexOf(group.headStatus);
  const prog = stageIdx >= 0 ? Math.round((stageIdx / (HEAD_STAGES.length - 1)) * 100) : 0;
  const bc = batchHeadOverdue(group) ? "#E24B4A" : openExcCount(group) > 0 ? "#e09000" : headStageColor(group.headStatus);
  const d = daysDiff(group.etaArrival);
  const tm = TRANSPORT_META[group.transport] || { icon: "📦", bg: "#f3f4f6", c: "#666" };
  const fbaCount = (group.fbaShipments || []).length;
  let etaHint = null;
  if (group.headStatus !== "已到港" && d !== null) {
    if (d < 0) etaHint = <span style={badge("#fee2e2", "#E24B4A")}>到港逾期 {Math.abs(d)} 天</span>;
    else if (d === 0) etaHint = <span style={badge("#fff0d4", "#7a4a00")}>今日预计到港</span>;
    else if (d <= 7) etaHint = <span style={badge("#dceeff", "#1a4e8a")}>还有 {d} 天到港</span>;
    else etaHint = <span style={{ fontSize: 11, color: "var(--tm)" }}>预计到港 {fmtD(group.etaArrival)}</span>;
  }
  return (
    <div style={{ background: "var(--card)", border: `1px solid ${batchHeadOverdue(group) ? "#fecaca" : "var(--border)"}`, borderLeft: `4px solid ${bc}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", cursor: "pointer" }} onClick={onEdit}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{group.name}</span>
              <span style={{ fontSize: 12, color: "var(--tm)" }}>{group.sku}</span>
              <span style={badge(tm.bg, tm.c)}>{tm.icon} {group.transport}</span>
              {openExcCount(group) > 0 && <span style={badge("#fff0d4", "#e09000")}>⚠ {openExcCount(group)} 异常</span>}
            </div>
            <div style={{ fontSize: 11, color: "var(--tm)" }}>{fbaCount} 个货件 · 共 {group.totalQty} 件{group.blNumber ? ` · B/L ${group.blNumber}` : ""}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Avatar name={group.owner} /><span style={{ fontSize: 11, color: "var(--tm)" }}>{group.owner}</span><RoleBadge role={getStaffRole(group.owner)} /></div>
            {etaHint}
          </div>
        </div>
        <div style={{ marginBottom: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: headStageColor(group.headStatus) }}>头程 {group.headStatus}</span>
            <span style={{ fontSize: 10, color: "var(--tm)" }}>{prog}%</span>
          </div>
          <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
            <div style={{ height: "100%", width: `${prog}%`, background: bc, borderRadius: 2 }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto" }}>
            {HEAD_STAGES.map((s, i) => {
              const done = i < stageIdx; const active = i === stageIdx;
              const c = active ? headStageColor(s) : done ? "#2d9e52" : "var(--border)";
              return (<span key={s} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}><span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 36 }}><span style={{ width: active ? 10 : 7, height: active ? 10 : 7, borderRadius: "50%", background: c, outline: active ? `2px solid ${c}` : "none", outlineOffset: 2 }} /><span style={{ fontSize: 9, color: active ? "var(--text)" : done ? "var(--tm)" : "var(--border)", fontWeight: active ? 600 : 400 }}>{HEAD_STAGE_SHORT[s]}</span></span>{i < HEAD_STAGES.length - 1 && <span style={{ width: 16, height: 2, background: done ? "#2d9e52" : "var(--border)", margin: "0 2px", marginBottom: 12 }} />}</span>);
            })}
          </div>
        </div>
      </div>
      <div style={{ borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", background: "var(--bg)" }}>
        <span style={{ fontSize: 11, color: "var(--tm)" }}>{expanded ? "收起 FBA 货件" : `展开 ${fbaCount} 个 FBA 货件`}</span>
        <button type="button" onClick={e => { e.stopPropagation(); onToggleExpand(); }} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", color: "#2d7dd2" }}>{expanded ? "▲ 收起" : "▼ 展开"}</button>
      </div>
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
          {(group.fbaShipments || []).length ? (group.fbaShipments || []).map(f => <FbaRow key={f.id} fba={f} onEditTracking={(fid, tracking) => onEditTracking(group.id, fid, tracking)} />) : <div style={{ padding: "1rem", textAlign: "center", color: "var(--tm)", fontSize: 12 }}>暂无 FBA 货件</div>}
        </div>
      )}
    </div>
  );
}
function FbaEditorRow({ fba, onChange, onRemove }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px", marginBottom: 8, background: "var(--bg)" }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
        <div><label style={lbl}>配送开始</label><input type="date" value={fba.windowStart} onChange={e => onChange({ ...fba, windowStart: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>配送结束</label><input type="date" value={fba.windowEnd} onChange={e => onChange({ ...fba, windowEnd: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>追踪编码</label><input value={fba.tracking} onChange={e => onChange({ ...fba, tracking: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>状态</label><select value={fba.status} onChange={e => onChange({ ...fba, status: e.target.value })} style={{ ...inp, background: "var(--card)" }}>{FBA_STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
        <button type="button" onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 18, padding: "8px 4px" }}>×</button>
      </div>
    </div>
  );
}
function ShipmentModal({ item, ownerExtras, onSave, onClose, onDelete }) {
  const [form, setForm] = useState(item);
  const [excs, setExcs] = useState(item.exceptions ? item.exceptions.map(e => ({ ...e })) : []);
  const [fbas, setFbas] = useState(item.fbaShipments ? item.fbaShipments.map(s => ({ ...s })) : []);
  const [nextFbaId, setNextFbaId] = useState(() => Math.max(0, ...(item.fbaShipments || []).map(s => s.id)) + 1);
  const [importMsg, setImportMsg] = useState("");
  const fileInputRef = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const emptyFba = () => ({ id: nextFbaId, name: "", fbaId: "", internalId: "", warehouse: "", expectedQty: 0, receivedQty: 0, windowStart: "", windowEnd: "", tracking: "", status: "准备发货", note: "" });
  const onCsvPick = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    try {
      const { fbaShipments, totalQty, sku, warnings } = await readStaCsvFiles(files);
      let nid = nextFbaId;
      const imported = fbaShipments.map(f => ({ ...f, id: nid++ }));
      setFbas(prev => [...prev, ...imported]);
      setNextFbaId(nid);
      setForm(f => ({
        ...f,
        totalQty: f.totalQty ? f.totalQty : totalQty,
        sku: f.sku || sku,
        name: f.name || (imported.length === 1 ? imported[0].name : f.name),
      }));
      setImportMsg(warnings.length ? `已导入 ${imported.length} 个货件（${warnings.join("；")}）` : `已导入 ${imported.length} 个 STA 货件`);
    } catch (err) {
      setImportMsg(err.message || "CSV 解析失败");
    }
    e.target.value = "";
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "2rem 1rem", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "1.5rem", width: "100%", maxWidth: 760, color: "var(--text)" }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: "1rem" }}>{item.id ? "编辑发货批次" : "新建发货批次"}</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tm)", marginBottom: 8 }}>批次信息</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>批次名称</label><input value={form.name} onChange={e => set("name", e.target.value)} placeholder="FB100绿色第三批" style={inp} /></div>
          <div><label style={lbl}>产品 / SKU</label><input value={form.sku} onChange={e => set("sku", e.target.value)} placeholder="FB100" style={inp} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>总件数</label><input type="number" value={form.totalQty} onChange={e => set("totalQty", +e.target.value || 0)} style={inp} /></div>
          <div><label style={lbl}>跟进人</label><OwnerField listId="logistics-owner" value={form.owner} onChange={v => set("owner", v)} extraOwners={ownerExtras} inputStyle={inp} /></div>
          <div><label style={lbl}>头程方式</label><select value={form.transport} onChange={e => set("transport", e.target.value)} style={{ ...inp, background: "var(--card)" }}>{Object.keys(TRANSPORT_META).map(t => <option key={t}>{t}</option>)}</select></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>货代公司</label><input value={form.forwarder} onChange={e => set("forwarder", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>提单号 B/L</label><input value={form.blNumber} onChange={e => set("blNumber", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>国内出货日期</label><input type="date" value={form.shipDate} onChange={e => set("shipDate", e.target.value)} style={inp} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>预计出港</label><input type="date" value={form.etaDeparture} onChange={e => set("etaDeparture", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>预计到港</label><input type="date" value={form.etaArrival} onChange={e => set("etaArrival", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>头程状态</label><select value={form.headStatus} onChange={e => set("headStatus", e.target.value)} style={{ ...inp, background: "var(--card)" }}>{HEAD_STAGES.map(s => <option key={s}>{s}</option>)}</select></div>
        </div>
        <div style={{ marginBottom: 12 }}><label style={lbl}>备注</label><input value={form.note} onChange={e => set("note", e.target.value)} style={inp} /></div>
        <ExceptionEditor excs={excs} setExcs={setExcs} />
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tm)", borderTop: "1px solid var(--border)", paddingTop: 10, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span>FBA 货件 ({fbas.length})</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input ref={fileInputRef} type="file" accept=".csv" multiple style={{ display: "none" }} onChange={onCsvPick} />
            <button type="button" onClick={() => fileInputRef.current?.click()} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", color: "#2d7dd2" }}>📥 导入 STA CSV</button>
          </div>
        </div>
        {importMsg && <div style={{ fontSize: 11, color: importMsg.includes("失败") || importMsg.includes("不是") ? "#E24B4A" : "#1a6b35", marginBottom: 8, padding: "6px 10px", background: importMsg.includes("失败") || importMsg.includes("不是") ? "#fee2e2" : "#f0faf4", borderRadius: 8 }}>{importMsg}</div>}
        {fbas.map((f, i) => <FbaEditorRow key={f.id} fba={f} onChange={v => { const a = [...fbas]; a[i] = v; setFbas(a); }} onRemove={() => setFbas(fbas.filter((_, j) => j !== i))} />)}
        <button type="button" onClick={() => { setFbas([...fbas, emptyFba()]); setNextFbaId(nextFbaId + 1); }} style={{ width: "100%", border: "1px dashed var(--border)", borderRadius: 8, padding: "6px 0", fontSize: 12, cursor: "pointer", color: "var(--tm)", background: "transparent", marginBottom: 12, fontFamily: "inherit" }}>+ 添加 FBA 货件</button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          {item.id ? <button type="button" onClick={onDelete} style={{ background: "none", border: "none", color: "#e55", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>删除批次</button> : <div />}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "var(--tm)" }}>取消</button>
            <button type="button" onClick={() => { if (!form.name.trim()) return; onSave({ ...form, exceptions: excs, fbaShipments: fbas }); }} style={{ background: "#2d7dd2", color: "#fff", border: "none", borderRadius: 8, padding: "6px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}
function LogisticsPanel() {
  const { items, meta, loading, error, persist, reload } = useSharedList("logistics", INIT_LOGISTICS);
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [expanded, setExpanded] = useState(loadExpandedState);
  const panelCsvRef = useRef(null);
  const toggleExpanded = (id) => setExpanded(prev => {
    const next = { ...prev, [id]: !prev[id] };
    saveExpandedState(next);
    return next;
  });
  const nextId = () => Math.max(0, ...items.map(i => i.id || 0)) + 1;
  const counts = {
    all: items.length,
    transit: items.filter(batchHeadTransit).length,
    missing_track: items.filter(batchMissingTrack).length,
    receiving: items.filter(batchReceiving).length,
    done: items.filter(batchAllDone).length,
  };
  const owners = ownerFilterEntries(items.map(i => i.owner));
  let vis = items.slice();
  if (ownerFilter !== "all") vis = vis.filter(i => i.owner === ownerFilter);
  if (filter === "transit") vis = vis.filter(batchHeadTransit);
  else if (filter === "missing_track") vis = vis.filter(batchMissingTrack);
  else if (filter === "receiving") vis = vis.filter(batchReceiving);
  else if (filter === "done") vis = vis.filter(batchAllDone);
  vis.sort((a, b) => {
    const pa = batchHeadOverdue(a) ? 0 : openExcCount(a) ? 1 : 2;
    const pb = batchHeadOverdue(b) ? 0 : openExcCount(b) ? 1 : 2;
    if (pa !== pb) return pa - pb;
    const da = daysDiff(a.etaArrival), db = daysDiff(b.etaArrival);
    if (da === null) return 1; if (db === null) return -1;
    return da - db;
  });
  const save = (t) => {
    if (t.id) persist(items.map(x => x.id === t.id ? t : x));
    else persist([...items, { ...t, id: nextId() }]);
    setModal(null);
  };
  const editTracking = (gid, fid, tracking) => {
    persist(items.map(g => g.id !== gid ? g : {
      ...g, fbaShipments: (g.fbaShipments || []).map(s => s.id !== fid ? s : { ...s, tracking, status: tracking.trim() && s.status === "准备发货" ? "运输中" : s.status }),
    }));
  };
  const cloneGroup = (g) => ({ ...g, exceptions: (g.exceptions || []).map(e => ({ ...e })), fbaShipments: (g.fbaShipments || []).map(s => ({ ...s })) });
  const emptyGroup = { name: "", sku: "", totalQty: 0, owner: "", shipDate: "", transport: "海运", forwarder: "", blNumber: "", etaDeparture: "", etaArrival: "", headStatus: "备货中", note: "", exceptions: [], fbaShipments: [] };
  const onPanelCsvImport = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    try {
      const { fbaShipments, totalQty, sku } = await readStaCsvFiles(files);
      const label = files.length === 1 ? fbaShipments[0]?.fbaId || "新批次" : `导入 ${files.length} 个货件`;
      setModal({ ...emptyGroup, name: label, sku, totalQty, fbaShipments });
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
  return (
    <div>
      <SharedMetaLine meta={meta} loading={loading} error={error} onReload={reload} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 7, flex: 1, minWidth: 280 }}>
          {tabs.map(f => (
            <div key={f.key} onClick={() => setFilter(f.key)} style={{ background: "var(--card)", border: `1px solid ${filter === f.key ? "#2d7dd2" : "var(--border)"}`, borderRadius: 10, padding: "9px 10px", cursor: "pointer" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: f.nc }}>{counts[f.key]}</div>
              <div style={{ fontSize: 10, color: "var(--tm)", marginTop: 1 }}>{f.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <input ref={panelCsvRef} type="file" accept=".csv" multiple style={{ display: "none" }} onChange={onPanelCsvImport} />
        <button type="button" onClick={() => panelCsvRef.current?.click()} style={{ background: "var(--card)", color: "#2d7dd2", border: "1px solid #2d7dd2", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>📥 导入 CSV</button>
        <button onClick={() => setModal(emptyGroup)} style={{ background: "#2d7dd2", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>+ 新建批次</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--tm)" }}>跟进人</span>
        {owners.map(o => (
          <button key={o.name} onClick={() => setOwnerFilter(o.name)} style={{ background: ownerFilter === o.name ? "#2d7dd2" : "var(--card)", color: ownerFilter === o.name ? "#fff" : "var(--tm)", border: `1px solid ${ownerFilter === o.name ? "#2d7dd2" : "var(--border)"}`, borderRadius: 20, padding: "4px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>
            {o.name === "all" ? "全部" : (<>{o.name}{o.role && <RoleBadge role={o.role} style={{ padding: "0 5px", fontSize: 9 }} />}</>)}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {vis.length ? vis.map(g => (
          <ShipmentGroupCard
            key={g.id}
            group={g}
            expanded={!!expanded[g.id]}
            onToggleExpand={() => toggleExpanded(g.id)}
            onEdit={() => setModal(cloneGroup(g))}
            onEditTracking={editTracking}
          />
        )) : <div style={{ textAlign: "center", padding: "2rem", color: "var(--tm)", fontSize: 13 }}>暂无匹配批次</div>}
      </div>
      {modal && <ShipmentModal item={modal} ownerExtras={items.map(i => i.owner)} onSave={save} onClose={() => setModal(null)} onDelete={() => { persist(items.filter(x => x.id !== modal.id)); setModal(null); }} />}
    </div>
  );
}

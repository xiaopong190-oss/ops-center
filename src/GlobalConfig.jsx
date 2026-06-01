import { useState, useEffect } from "react";

export const CONFIG_STORAGE_KEY = "ops-center-global-config";

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

function delayMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonBinLatest(binId, storageKey) {
  const url = `${JSONBIN_API_BASE}/${binId}/latest`;
  const headers = { "X-Master-Key": JSONBIN_API_KEY };
  const attempts = [
    { via: "cloud", run: () => fetchWithTimeout(url, { headers }) },
    { via: "proxy", run: () => fetchWithTimeout(`https://corsproxy.io/?${encodeURIComponent(url)}`, { headers }) },
    { via: "snapshot", run: () => fetchWithTimeout(`data/shared-${storageKey}.json?v=${Date.now()}`, { cache: "no-store" }) },
  ];

  let lastErr = "网络错误";
  for (const { via, run } of attempts) {
    try {
      const res = await run();
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const record = json.record != null ? json.record : json;
      const normalized = normalizeSharedRecord(record);
      if (!normalized) return null;
      return { ...normalized, _via: via };
    } catch (e) {
      lastErr = e?.name === "AbortError" ? "连接超时" : (e?.message || "网络错误");
    }
  }
  throw new Error(lastErr);
}

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const sharedStorage = {
  async get(key, { retries = 3 } = {}) {
    const binId = resolveJsonBinId(key);
    if (!binId) return sharedLocalGet(key);

    let lastErr = "网络错误";
    for (let attempt = 0; attempt < retries; attempt++) {
      if (attempt > 0) await delayMs(800 * attempt);
      try {
        const normalized = await fetchJsonBinLatest(binId, key);
        if (normalized) {
          sharedLocalSet(key, normalized.data, normalized.updatedBy);
          const source = normalized._via === "snapshot" ? "snapshot" : "cloud";
          const { _via, ...rest } = normalized;
          return { ...rest, _source: source };
        }
        return null;
      } catch (e) {
        lastErr = e?.name === "AbortError" ? "连接超时" : (e?.message || "网络错误");
      }
    }

    const local = sharedLocalGet(key);
    const normalized = normalizeSharedRecord(local);
    if (normalized && Array.isArray(normalized.data) && normalized.data.length === 0) {
      return {
        data: null,
        updatedBy: "",
        updatedAt: 0,
        _source: "local-fallback",
        _cloudError: lastErr,
        _emptyLocalIgnored: true,
      };
    }
    if (normalized) return { ...normalized, _source: "local-fallback", _cloudError: lastErr };
    return { data: null, updatedBy: "", updatedAt: 0, _source: "local-fallback", _cloudError: lastErr };
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

export const ROLE_COLORS = {
  运营: { bg: "#dceeff", color: "#1a4e8a" },
  美工: { bg: "#f3e8ff", color: "#6b21a8" },
  设计: { bg: "#e8f5e9", color: "#2e7d32" },
  开发: { bg: "#e0f2f1", color: "#00695c" },
  采购: { bg: "#fff3e0", color: "#e65100" },
  管理: { bg: "#fce4ec", color: "#880e4f" },
};

export const STAFF_ROLE_OPTIONS = Object.keys(ROLE_COLORS);

export const DEFAULT_GLOBAL_CONFIG = {
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

export function parseStaffText(text) {
  return text.split(/\r?\n/).map(line => {
    const [name, role] = line.split("|").map(s => s.trim());
    const trimmed = line.trim();
    return { name: name || trimmed, role: role || "" };
  }).filter(e => e.name);
}

export function formatStaffText(staff) {
  return staff.map(e => `${e.name}|${e.role || ""}`).join("\n");
}

export function loadGlobalConfig() {
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

export function saveGlobalConfig(config) {
  const next = {
    staff: (config.staff || []).map(normalizeStaffEntry).filter(e => e.name),
  };
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("ops-global-config-updated"));
  return next;
}

export function getEmployees() {
  return loadGlobalConfig().staff;
}

export function getStaffNames() {
  return getEmployees().map(e => e.name);
}

export function getStaffRole(name) {
  return getEmployees().find(e => e.name === name)?.role || "";
}

/** 全局员工 + 业务数据里出现过的姓名，去重排序 */
export function ownerOptions(...extraLists) {
  const fromData = extraLists.flat().filter(Boolean);
  const byName = new Map(getEmployees().map(e => [e.name, e]));
  for (const n of fromData) {
    if (!byName.has(n)) byName.set(n, { name: n, role: "" });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

/** 跟进人筛选：全部 + 员工对象列表 */
export function ownerFilterEntries(...extraLists) {
  return [{ name: "all", role: "" }, ...ownerOptions(...extraLists)];
}

/** 跟进人筛选：全部 + 合并名单（姓名字符串，兼容旧用法） */
export function ownerFilterOptions(...extraLists) {
  return ownerFilterEntries(...extraLists).map(e => e.name);
}

export function formatOwnerLabel(emp) {
  if (!emp) return "";
  if (typeof emp === "string") {
    const role = getStaffRole(emp);
    return role ? `${emp} · ${role}` : emp;
  }
  return emp.role ? `${emp.name} · ${emp.role}` : emp.name;
}

export function RoleBadge({ role, style }) {
  if (!role) return null;
  const c = ROLE_COLORS[role] || { bg: "#f3f4f6", color: "#666" };
  return (
    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: c.bg, color: c.color, whiteSpace: "nowrap", ...style }}>
      {role}
    </span>
  );
}

export function OwnerField({ value, onChange, listId = "owner-list", extraOwners = [], placeholder = "选择负责人…", style, inputStyle }) {
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

export function GlobalSettingsModal({ onClose, onSaved }) {
  const [rows, setRows] = useState(() => getEmployees().map(e => ({ ...e })));

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    const staff = rows.map(r => ({ name: r.name.trim(), role: r.role || "" })).filter(r => r.name);
    saveGlobalConfig({ staff });
    onSaved?.();
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

export function useGlobalConfig() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion(v => v + 1);
    window.addEventListener("ops-global-config-updated", bump);
    return () => window.removeEventListener("ops-global-config-updated", bump);
  }, []);
  return { version, staff: getEmployees(), reload: () => setVersion(v => v + 1) };
}

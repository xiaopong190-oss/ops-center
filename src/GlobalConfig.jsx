import { useState, useEffect } from "react";
import { GITHUB_GIST_ID } from "./cloud-sync-config.js";

export const CONFIG_STORAGE_KEY = "ops-center-global-config";

function getGistToken() {
  if (typeof window !== "undefined" && window.__OPS_GIST__?.token) {
    return String(window.__OPS_GIST__.token);
  }
  return "";
}

function getGistId() {
  if (typeof window !== "undefined" && window.__OPS_GIST__?.id) {
    return String(window.__OPS_GIST__.id);
  }
  return GITHUB_GIST_ID || "";
}

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

export const sharedStorage = {
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
    return { name: name || line.trim(), role: role || "" };
  }).filter(e => e.name);
}

export function formatStaffText(staff) {
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

export function loadGlobalConfig() {
  const shared = readSharedStaffCache();
  if (shared) return shared;
  const legacy = loadLegacyLocalConfig();
  if (legacy) return legacy;
  return { staff: DEFAULT_GLOBAL_CONFIG.staff.map(e => ({ ...e })) };
}

/** 从 Gist 拉取员工名单（与其它共享页相同逻辑，结果写入本地缓存） */
export async function fetchGlobalConfigFromCloud() {
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

export function getGlobalConfigMeta() {
  try {
    const raw = localStorage.getItem("shared:global-config");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.updatedBy ? { updatedBy: parsed.updatedBy, updatedAt: parsed.updatedAt } : null;
  } catch {
    return null;
  }
}

export async function saveGlobalConfig(config) {
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

export function getEmployees() { return loadGlobalConfig().staff; }
export function getStaffNames() { return getEmployees().map(e => e.name); }
export function getStaffRole(name) { return getEmployees().find(e => e.name === name)?.role || ""; }

export function ownerOptions() {
  return getEmployees().slice().sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

export function ownerFilterEntries() {
  return [{ name: "all", role: "" }, ...ownerOptions()];
}

export function ownerFilterOptions() {
  return ownerFilterEntries().map(e => e.name);
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

export function OwnerField({ value, onChange, placeholder = "选择负责人…", style, inputStyle }) {
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

export function GlobalSettingsModal({ onClose, onSaved }) {
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
      onSaved?.();
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

export function useGlobalConfig() {
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

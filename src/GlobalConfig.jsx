import { useState, useEffect } from "react";
import { GITHUB_GIST_ID } from "./cloud-sync-config.js";

export const CONFIG_STORAGE_KEY = "ops-center-global-config";
/** 超级 / 运营 M 码默认值；正式以云端 global-config 为准，家里和会议室都能登 */
export const DEFAULT_SUPER_PASSWORD = "!X888888";
export const SUPER_PASSWORD = DEFAULT_SUPER_PASSWORD;
export const DEFAULT_OPS_PASSWORD = "888888";
const LEGACY_OPS_PASSWORDS = ["YY8800", "HST8800", "X888888"];

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
  if (!res.ok) throw new Error(`云端读取失败，请检查网络后重试`);
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
    throw new Error(`云端保存失败，请检查网络后重试`);
  }
  return payload;
}

const PLAYBOOK_MAX_BYTES = 800000;

function playbookGistFileName(userId) {
  const raw = String(userId || "").trim();
  if (!raw || raw === "guest") return "";
  let b64 = "";
  try {
    b64 = btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  } catch {
    b64 = encodeURIComponent(raw).replace(/%/g, "_");
  }
  return `playbook-u-${b64}.json`;
}

function decodePlaybookFileUser(fileName) {
  const m = /^playbook-u-(.+)\.json$/i.exec(String(fileName || ""));
  if (!m) return "";
  try {
    let b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    return decodeURIComponent(escape(atob(b64)));
  } catch {
    return "";
  }
}

function samePlaybookUser(u, userId) {
  const id = String(userId || "").trim().toLowerCase();
  if (!u || !id) return false;
  return String(u.id || "").trim().toLowerCase() === id || String(u.name || "").trim().toLowerCase() === id;
}

function purgeLocalPlaybook(userId) {
  const prefix = `user:${userId}:hs-playbook:`;
  const drop = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) drop.push(k);
    }
  } catch { /* ignore */ }
  drop.forEach((k) => {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  });
}

async function gistPatchFiles(files) {
  const res = await fetch(`${GIST_API}/${getGistId()}`, {
    method: "PATCH",
    headers: gistHeaders(true),
    body: JSON.stringify({ files }),
  });
  if (!res.ok) throw new Error("云端保存失败，请检查网络后重试");
}

export const opsPlaybookCloud = {
  configured() {
    return gistConfigured();
  },
  async load(userId) {
    const file = playbookGistFileName(userId);
    if (!file || !gistConfigured()) return null;
    const gist = await gistFetchAll();
    let content = gist?.files?.[file]?.content;
    if (!content) {
      const want = String(userId || "").trim().toLowerCase();
      for (const [name, f] of Object.entries(gist?.files || {})) {
        const decoded = decodePlaybookFileUser(name);
        if (decoded && decoded.toLowerCase() === want && f?.content) {
          content = f.content;
          break;
        }
      }
    }
    if (!content) return null;
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  },
  async save(userId, data) {
    const file = playbookGistFileName(userId);
    if (!file) return { skipped: true };
    const u = readSessionUser();
    const isSuper = u && (u.auth === "super" || u.role === "super");
    if (u && u.id !== "guest" && !samePlaybookUser(u, userId) && !isSuper) {
      throw new Error("不能写入其他运营的推品空间");
    }
    if (!gistConfigured()) throw new Error("云端未配置");
    const payload = { kind: "hongsen-playbook-cloud", version: 1, userId, updatedAt: Date.now(), ...data };
    const text = JSON.stringify(payload);
    if (text.length > PLAYBOOK_MAX_BYTES) {
      throw new Error("本账号推品计划超过云端限额，请删掉旧计划后再保存");
    }
    await gistPatchFiles({ [file]: { content: JSON.stringify(payload, null, 2) } });
    return payload;
  },
  async remove(userId) {
    purgeLocalPlaybook(userId);
    const file = playbookGistFileName(userId);
    if (!file || !gistConfigured()) return;
    try {
      await gistPatchFiles({ [file]: null });
    } catch (e) {
      console.warn("[opsPlaybookCloud] 删除云端空间失败", userId, e?.message);
    }
  },
  async purgeRemovedStaff(prevStaff, nextStaff) {
    const next = new Set((nextStaff || []).map((e) => String(e?.name || e || "").trim()).filter(Boolean));
    const prev = (prevStaff || []).map((e) => String(e?.name || e || "").trim()).filter(Boolean);
    for (const name of prev) {
      if (!next.has(name)) await opsPlaybookCloud.remove(name);
    }
  },
};

if (typeof window !== "undefined") window.opsPlaybookCloud = opsPlaybookCloud;

function bindPlaybookCloudBridge() {
  if (typeof window === "undefined" || window.__opsPlaybookCloudBridge) return;
  window.__opsPlaybookCloudBridge = true;
  window.addEventListener("message", async (ev) => {
    const d = ev && ev.data;
    if (!d || d.type !== "ops-playbook-cloud" || !ev.source) return;
    const reply = (ok, result, error) => {
      try { ev.source.postMessage({ type: "ops-playbook-cloud-result", reqId: d.reqId, ok, result, error }, "*"); } catch { /* ignore */ }
    };
    try {
      if (d.op === "configured") { reply(true, opsPlaybookCloud.configured()); return; }
      if (d.op === "load") { reply(true, await opsPlaybookCloud.load(d.userId)); return; }
      if (d.op === "save") { reply(true, await opsPlaybookCloud.save(d.userId, d.data)); return; }
      reply(false, null, "unknown op");
    } catch (e) {
      reply(false, null, e?.message || String(e));
    }
  });
}
bindPlaybookCloudBridge();

// ─── sharedStorage ───────────────────────────────────────────────────
// 已配置 Gist → 全公司共享；未配置 → 仅 localStorage

function readSessionUser() {
  try {
    const raw = sessionStorage.getItem("ops-center-current-user") || localStorage.getItem("ops-center-current-user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function sessionCanWrite(key) {
  const u = readSessionUser();
  if (!u || u.id === "guest") return true;
  if (u.auth === "super" || u.role === "super") return true;
  if (key === "global-config") return false;
  return u.canEdit !== false;
}

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

  async set(key, value, updatedBy, opts = {}) {
    if (!sessionCanWrite(key) && !opts.force) {
      throw new Error("当前账号没有修改权限");
    }
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
      throw new Error("云端未配置，已暂存在本机");
    }
    try {
      await gistWriteRecord(key, payload);
      localSet(key, payload);
      window.dispatchEvent(new CustomEvent(`ops-shared-updated:${key}`));
      return payload;
    } catch (e) {
      localSet(key, payload);
      window.dispatchEvent(new CustomEvent(`ops-shared-updated:${key}`));
      throw new Error(`云端保存失败（已暂存本机），请检查网络后重试`);
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
    { name: "杨彬", role: "运营", loginCode: "888888", canEdit: true },
    { name: "stella", role: "运营", loginCode: "888888", canEdit: true },
    { name: "张玉堂", role: "美工", loginCode: "888888", canEdit: true },
    { name: "张工", role: "设计", loginCode: "888888", canEdit: true },
    { name: "王律师", role: "管理", loginCode: "888888", canEdit: true },
  ],
};

const DEFAULT_ROLE_BY_NAME = Object.fromEntries(
  DEFAULT_GLOBAL_CONFIG.staff.map(e => [e.name, e.role])
);

function normalizeStaffEntry(item) {
  let entry;
  if (typeof item === "string") {
    const [name, role] = item.split("|").map(s => s.trim());
    entry = { name: name || item.trim(), role: role || "", loginCode: "", canEdit: true, autoShare: false };
  } else {
    entry = {
      name: String(item?.name || "").trim(),
      role: String(item?.role || "").trim(),
      loginCode: String(item?.loginCode || "").trim(),
      canEdit: item?.canEdit !== false,
      autoShare: item?.autoShare === true,
    };
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
    const raw = sessionStorage.getItem("ops-center-current-user") || localStorage.getItem("ops-center-current-user");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.name && parsed.name !== "访客") return parsed.name;
    }
  } catch { /* ignore */ }
  return "未知";
}

function extractOpsPassword(data) {
  return String(data?.opsPassword || "").trim();
}

function extractSuperPassword(data) {
  return String(data?.superPassword || "").trim();
}

function normalizeConfigData(data) {
  const staff = Array.isArray(data?.staff) ? data.staff.map(normalizeStaffEntry).filter(e => e.name) : [];
  const opsPassword = extractOpsPassword(data);
  const superPassword = extractSuperPassword(data);
  const next = { staff };
  if (opsPassword) next.opsPassword = opsPassword;
  if (superPassword) next.superPassword = superPassword;
  next.superAutoShare = data?.superAutoShare === true;
  return next;
}

function readSharedStaffCache() {
  try {
    const raw = localStorage.getItem("shared:global-config");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || !Array.isArray(parsed.data.staff)) return null;
    return normalizeConfigData(parsed.data);
  } catch { /* ignore */ }
  return null;
}

function loadLegacyLocalConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.staff)) return null;
    return normalizeConfigData(parsed);
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

export function getLoginStaff(staff = getEmployees()) {
  return (staff || []).filter(e => String(e.name || "").trim());
}

export function getOpsStaff(staff = getEmployees()) {
  return (staff || []).filter(e => e.role === "运营" && String(e.name || "").trim());
}

export function hasOpsStaff(staff = getEmployees()) {
  return getOpsStaff(staff).length > 0;
}

export function getOpsPassword(config = loadGlobalConfig()) {
  const fromCfg = String(config?.opsPassword || "").trim();
  if (!fromCfg || LEGACY_OPS_PASSWORDS.includes(fromCfg)) return DEFAULT_OPS_PASSWORD;
  return fromCfg;
}

export function getSuperPassword(config = loadGlobalConfig()) {
  const fromCfg = String(config?.superPassword || "").trim();
  return fromCfg || DEFAULT_SUPER_PASSWORD;
}

export function getPersonLoginCode(person, config = loadGlobalConfig()) {
  const personal = String(person?.loginCode || "").trim();
  return personal || getOpsPassword(config);
}

/** 从 Gist 拉取员工名单（与其它共享页相同逻辑，结果写入本地缓存） */
export async function fetchGlobalConfigFromCloud() {
  if (!gistConfigured()) return loadGlobalConfig();
  try {
    const record = await sharedStorage.get("global-config");
    if (record?.data && Array.isArray(record.data.staff)) {
      window.dispatchEvent(new CustomEvent("ops-global-config-updated"));
      return normalizeConfigData(record.data);
    }
    const legacy = loadLegacyLocalConfig();
    if (legacy?.staff?.length || legacy?.opsPassword || legacy?.superPassword) {
      try {
        await sharedStorage.set("global-config", legacy, getCurrentUserName());
      } catch { /* 非超管不能回写名单 */ }
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

export async function saveGlobalConfig(config, opts = {}) {
  const prev = loadGlobalConfig();
  const opsPassword = config.opsPassword !== undefined
    ? String(config.opsPassword || "").trim()
    : String(prev.opsPassword || "").trim() || DEFAULT_OPS_PASSWORD;
  const superPassword = config.superPassword !== undefined
    ? String(config.superPassword || "").trim()
    : String(prev.superPassword || "").trim() || DEFAULT_SUPER_PASSWORD;
  const superAutoShare = config.superAutoShare !== undefined
    ? config.superAutoShare === true
    : prev.superAutoShare === true;
  const next = {
    staff: (config.staff || []).map(normalizeStaffEntry).filter(e => e.name).map(e => ({
      name: e.name,
      role: e.role || "",
      loginCode: String(e.loginCode || "").trim() || opsPassword,
      canEdit: e.canEdit !== false,
      autoShare: e.autoShare === true,
    })),
  };
  if (opsPassword) next.opsPassword = opsPassword;
  if (superPassword) next.superPassword = superPassword;
  next.superAutoShare = superAutoShare;
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
  if (gistConfigured()) {
    await sharedStorage.set("global-config", next, getCurrentUserName(), opts);
  } else {
    localSet("global-config", {
      data: next,
      updatedBy: getCurrentUserName(),
      updatedAt: Date.now(),
    });
    window.dispatchEvent(new CustomEvent("ops-shared-updated:global-config"));
  }
  try {
    await opsPlaybookCloud.purgeRemovedStaff(prev.staff, next.staff);
  } catch (e) {
    console.warn("[opsPlaybookCloud] 清理离职账号空间失败", e?.message);
  }
  window.dispatchEvent(new CustomEvent("ops-global-config-updated"));
  return next;
}

export async function updateOwnLoginCode(oldPwd, newPwd) {
  const user = readSessionUser();
  const name = String(user?.name || "").trim();
  if (!name || user?.auth === "super" || user?.role === "super") {
    throw new Error("请用自己的员工账号登录后再改 M 码");
  }
  const nextPwd = String(newPwd || "").trim();
  const prevPwd = String(oldPwd || "").trim();
  if (nextPwd.length < 4) throw new Error("新 M 码至少 4 位");
  await fetchGlobalConfigFromCloud();
  const cfg = loadGlobalConfig();
  if (nextPwd === getSuperPassword(cfg)) throw new Error("不能与超级 M 码相同");
  const staff = (cfg.staff || []).map(e => ({ ...e }));
  const idx = staff.findIndex(e => e.name === name);
  if (idx < 0) throw new Error("当前账号不在云端名单中");
  if (prevPwd !== getPersonLoginCode(staff[idx], cfg)) throw new Error("当前 M 码不正确");
  staff[idx] = { ...staff[idx], loginCode: nextPwd };
  await saveGlobalConfig({
    staff,
    opsPassword: cfg.opsPassword,
    superPassword: cfg.superPassword,
    superAutoShare: cfg.superAutoShare,
  }, { force: true });
  return true;
}

function patchSessionUser(patch) {
  try {
    const raw = sessionStorage.getItem("ops-center-current-user") || localStorage.getItem("ops-center-current-user");
    const parsed = raw ? JSON.parse(raw) : {};
    const next = JSON.stringify({ ...parsed, ...patch });
    sessionStorage.setItem("ops-center-current-user", next);
    localStorage.setItem("ops-center-current-user", next);
  } catch { /* ignore */ }
}

export async function updateOwnAutoShare(autoShare) {
  const user = readSessionUser();
  if (!user?.name || user.id === "guest") throw new Error("请先登录");
  const on = !!autoShare;
  await fetchGlobalConfigFromCloud();
  const cfg = loadGlobalConfig();
  if (user.auth === "super" || user.role === "super") {
    await saveGlobalConfig({
      staff: cfg.staff,
      opsPassword: cfg.opsPassword,
      superPassword: cfg.superPassword,
      superAutoShare: on,
    }, { force: true });
  } else {
    const staff = (cfg.staff || []).map(e => ({ ...e }));
    const idx = staff.findIndex(e => e.name === user.name);
    if (idx < 0) throw new Error("当前账号不在云端名单中");
    staff[idx] = { ...staff[idx], autoShare: on };
    await saveGlobalConfig({
      staff,
      opsPassword: cfg.opsPassword,
      superPassword: cfg.superPassword,
      superAutoShare: cfg.superAutoShare,
    }, { force: true });
  }
  patchSessionUser({ autoShare: on });
  window.dispatchEvent(new CustomEvent("ops-user-prefs-updated"));
  return true;
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
        请先在 ⚙ 设置 → 员工与 M 码 中添加人员
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

function StaffListEditor({ rows, onChange, defaultLoginCode }) {
  const setRow = (i, patch) => onChange(rows.map((r, j) => j === i ? { ...r, ...patch } : r));
  const removeRow = (i) => onChange(rows.filter((_, j) => j !== i));
  const addRow = () => onChange([...rows, { name: "", role: STAFF_ROLE_OPTIONS[0] || "运营", loginCode: defaultLoginCode || DEFAULT_OPS_PASSWORD, canEdit: true, autoShare: false }]);
  const inp = { flex: 1, minWidth: 0, fontSize: 13, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", background: "transparent", color: "inherit" };
  const sel = { ...inp, width: 80, flex: "0 0 80px", background: "var(--card)", cursor: "pointer" };
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 6, padding: "0 2px" }}>
        <span style={{ flex: 1, fontSize: 11, color: "var(--tm)", fontWeight: 500 }}>姓名</span>
        <span style={{ width: 80, flexShrink: 0, fontSize: 11, color: "var(--tm)", fontWeight: 500 }}>角色</span>
        <span style={{ width: 52, flexShrink: 0, fontSize: 11, color: "var(--tm)", fontWeight: 500 }}>可修改</span>
        <span style={{ width: 64, flexShrink: 0, fontSize: 11, color: "var(--tm)", fontWeight: 500 }}>自动分享</span>
        <span style={{ width: 28 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto", marginBottom: 10, paddingRight: 2 }}>
        {rows.length === 0 && <div style={{ fontSize: 12, color: "var(--tm)", textAlign: "center", padding: "12px 0" }}>暂无员工，点击下方添加</div>}
        {rows.map((row, i) => {
          const roles = !row.role || STAFF_ROLE_OPTIONS.includes(row.role) ? STAFF_ROLE_OPTIONS : [...STAFF_ROLE_OPTIONS, row.role];
          return (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={row.name} onChange={e => setRow(i, { name: e.target.value })} placeholder="输入姓名" style={inp} />
              <select value={row.role || STAFF_ROLE_OPTIONS[0]} onChange={e => setRow(i, { role: e.target.value, loginCode: row.loginCode || defaultLoginCode || DEFAULT_OPS_PASSWORD })} style={sel}>
                {roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <label style={{ width: 52, flexShrink: 0, display: "flex", justifyContent: "center", cursor: "pointer" }} title="勾选后可改任务、物流等">
                <input type="checkbox" checked={row.canEdit !== false} onChange={e => setRow(i, { canEdit: e.target.checked })} />
              </label>
              <label style={{ width: 64, flexShrink: 0, display: "flex", justifyContent: "center", cursor: "pointer" }} title="勾选后改完立刻给全员；不勾选则只保存在该账号，点上传才分享">
                <input type="checkbox" checked={row.autoShare === true} onChange={e => setRow(i, { autoShare: e.target.checked })} />
              </label>
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
  const [opsPassword, setOpsPassword] = useState(() => getOpsPassword());
  const [superPassword, setSuperPassword] = useState(() => getSuperPassword());
  const [superAutoShare, setSuperAutoShare] = useState(() => loadGlobalConfig().superAutoShare === true);
  const [showOpsPwd, setShowOpsPwd] = useState(false);
  const [showSuperPwd, setShowSuperPwd] = useState(false);
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
    const pwd = opsPassword.trim();
    const superPwd = superPassword.trim();
    if (!superPwd) { setError("请设置超级 M 码"); return; }
    if (!pwd) { setError("请设置全员 M 码"); return; }
    if (pwd === superPwd) { setError("全员 M 码不能与超级 M 码相同"); return; }
    const prevOps = getOpsPassword();
    const staff = rows.map(r => {
      const existing = String(r.loginCode || "").trim();
      return {
        name: r.name.trim(),
        role: r.role || "",
        loginCode: !existing || existing === prevOps ? pwd : existing,
        canEdit: r.canEdit !== false,
        autoShare: r.autoShare === true,
      };
    }).filter(r => r.name);
    setSaving(true);
    setError("");
    try {
      await saveGlobalConfig({ staff, opsPassword: pwd, superPassword: superPwd, superAutoShare });
      onSaved?.();
    } catch (e) {
      setError(e?.message || "保存失败，请检查网络后重试");
    } finally {
      setSaving(false);
    }
  };
  const metaLine = meta?.updatedBy
    ? `☁️ 最后由 ${meta.updatedBy} 更新 · 保存后全公司同步`
    : "☁️ 保存后上传云端，全员实时同步";
  const fieldInp = { flex: 1, minWidth: 0, fontSize: 13, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", background: "transparent", color: "inherit" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 300, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "2rem 1rem", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "1.25rem 1.5rem", width: "100%", maxWidth: 620, color: "var(--text)" }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>员工与云端 M 码</div>
        <div style={{ fontSize: 11, color: "var(--tm)", marginBottom: 8, lineHeight: 1.5 }}>名单里有名字就能登录。推品计划每人一块云端空间，换电脑也能读到自己的。从名单删人后，该空间一并消除。默认修改只保存在自己账号，点「保存并上传」才分享。</div>
        <div style={{ fontSize: 11, color: "#065f46", background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 8, padding: "6px 10px", marginBottom: 12 }}>{metaLine}</div>
        {error && <div className="ops-note ops-note-danger" style={{ marginBottom: 10 }}>{error}</div>}
        <StaffListEditor rows={rows} onChange={setRows} defaultLoginCode={opsPassword.trim() || DEFAULT_OPS_PASSWORD} />
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tm)", borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 14, marginBottom: 8 }}>超级 M 码（云端）</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <input type={showSuperPwd ? "text" : "password"} value={superPassword} onChange={e => setSuperPassword(e.target.value)} placeholder="仅你和授权的人" style={fieldInp} />
          <button type="button" onClick={() => setShowSuperPwd(v => !v)} style={{ flexShrink: 0, background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "var(--tm)" }}>{showSuperPwd ? "隐藏" : "显示"}</button>
        </div>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "var(--text)", marginBottom: 12, cursor: "pointer", lineHeight: 1.45 }}>
          <input type="checkbox" checked={superAutoShare} onChange={e => setSuperAutoShare(e.target.checked)} style={{ marginTop: 2 }} />
          <span>超级账号修改任务 / 物流等后自动分享给全员（不勾选则只保存在本账号，点上传才分享）</span>
        </label>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tm)", marginBottom: 8 }}>全员 M 码（云端）</div>
        <div className={`ops-note${rows.filter(r => r.name.trim()).length ? " ops-note-ok" : " ops-note-warn"}`} style={{ marginBottom: 10 }}>
          {rows.filter(r => r.name.trim()).length ? `名单 ${rows.filter(r => r.name.trim()).length} 人。新员工默认用全员 M 码；员工自己改过的 M 码不会被覆盖。` : "尚未录入员工，无法登录。"}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type={showOpsPwd ? "text" : "password"} value={opsPassword} onChange={e => setOpsPassword(e.target.value)} placeholder="全员云端 M 码" style={fieldInp} />
          <button type="button" onClick={() => setShowOpsPwd(v => !v)} style={{ flexShrink: 0, background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "var(--tm)" }}>{showOpsPwd ? "隐藏" : "显示"}</button>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button type="button" disabled={saving} onClick={onClose} className="ops-btn">取消</button>
          <button type="button" disabled={saving} onClick={save} className="ops-btn ops-btn-primary">{saving ? "上传中…" : "保存并上传"}</button>
        </div>
      </div>
    </div>
  );
}

export function ChangePasswordModal({ onClose, onSaved, dark, setDark }) {
  const session = readSessionUser() || {};
  const isSuper = session.auth === "super" || session.role === "super";
  const [autoShare, setAutoShare] = useState(() => session.autoShare === true);
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);
  const changingPwd = !isSuper && (oldPwd || newPwd || confirmPwd);
  const save = async () => {
    if (changingPwd) {
      if (newPwd.trim() !== confirmPwd.trim()) { setError("两次新 M 码不一致"); return; }
      if (newPwd.trim() === oldPwd.trim()) { setError("新 M 码不能与当前 M 码相同"); return; }
    }
    setSaving(true);
    setError("");
    try {
      if (autoShare !== (session.autoShare === true)) await updateOwnAutoShare(autoShare);
      if (changingPwd) await updateOwnLoginCode(oldPwd, newPwd);
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e?.message || "修改失败，请检查网络");
    } finally {
      setSaving(false);
    }
  };
  const fieldInp = { width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", background: "transparent", color: "inherit", boxSizing: "border-box" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 300, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "2rem 1rem", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "1.25rem 1.5rem", width: "100%", maxWidth: 420, color: "var(--text)" }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>个人设置</div>
        <div style={{ fontSize: 11, color: "var(--tm)", marginBottom: 12, lineHeight: 1.5 }}>改完默认只保存在你的账号，点上传才给同事看。</div>
        {error && <div className="ops-note ops-note-danger" style={{ marginBottom: 10 }}>{error}</div>}
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tm)", marginBottom: 8 }}>外观</div>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "var(--text)", marginBottom: 16, cursor: "pointer", lineHeight: 1.45 }}>
          <input type="checkbox" checked={!!dark} onChange={e => setDark?.(e.target.checked)} style={{ marginTop: 2 }} />
          <span>夜间模式</span>
        </label>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tm)", marginBottom: 8 }}>数据保存</div>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "var(--text)", marginBottom: 16, cursor: "pointer", lineHeight: 1.45 }}>
          <input type="checkbox" checked={autoShare} onChange={e => setAutoShare(e.target.checked)} style={{ marginTop: 2 }} />
          <span>改完自动给同事看（不勾选则只保存在本账号，点「保存并上传」才分享）</span>
        </label>
        {!isSuper && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tm)", marginBottom: 8 }}>修改自己的云端 M 码</div>
            <div style={{ fontSize: 11, color: "var(--tm)", marginBottom: 10, lineHeight: 1.5 }}>不改可以留空。改完后公司、家里、会议室都用新 M 码。</div>
            <label style={{ display: "block", fontSize: 11, color: "var(--tm)", marginBottom: 6, fontWeight: 500 }}>当前 M 码</label>
            <input type="password" value={oldPwd} onChange={e => { setOldPwd(e.target.value); if (error) setError(""); }} style={{ ...fieldInp, marginBottom: 12 }} />
            <label style={{ display: "block", fontSize: 11, color: "var(--tm)", marginBottom: 6, fontWeight: 500 }}>新 M 码</label>
            <input type="password" value={newPwd} onChange={e => { setNewPwd(e.target.value); if (error) setError(""); }} placeholder="至少 4 位，不改请留空" style={{ ...fieldInp, marginBottom: 12 }} />
            <label style={{ display: "block", fontSize: 11, color: "var(--tm)", marginBottom: 6, fontWeight: 500 }}>确认新 M 码</label>
            <input type="password" value={confirmPwd} onChange={e => { setConfirmPwd(e.target.value); if (error) setError(""); }} style={{ ...fieldInp, marginBottom: 4 }} onKeyDown={e => { if (e.key === "Enter") save(); }} />
          </>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button type="button" disabled={saving} onClick={onClose} className="ops-btn">取消</button>
          <button type="button" disabled={saving} onClick={save} className="ops-btn ops-btn-primary">{saving ? "保存中…" : "保存"}</button>
        </div>
      </div>
    </div>
  );
}

export const PersonalSettingsModal = ChangePasswordModal;

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

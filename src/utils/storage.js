import { useState, useEffect, useCallback, useRef } from "react";
import { sharedStorage } from "../GlobalConfig.jsx";

export { sharedStorage } from "../GlobalConfig.jsx";

export const CURRENT_USER_KEY = "ops-center-current-user";

/** 后台拉取间隔；0=关闭自动拉取，仅手动「从云端更新」。默认 30 分钟 */
export const CLOUD_POLL_MS = 1800000;

export function getCurrentUser() {
  try {
    const raw = sessionStorage.getItem(CURRENT_USER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id && parsed?.name) return parsed;
    }
  } catch { /* ignore */ }
  return { id: "guest", name: "访客" };
}

export function setCurrentUser(user) {
  try {
    sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify({
      id: user.id || user.name || "guest",
      name: user.name || "访客",
    }));
  } catch { /* ignore */ }
}

export const privateStorage = {
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

export function formatSharedTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(d);
}

const DEVICE_ID_KEY = "ops-center-device-id";

export function getOrCreateDeviceId() {
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

export async function resolveClientId() {
  return getOrCreateDeviceId();
}

export function isLocalOpsServer() {
  return false;
}

function priorityLocalKey(clientId, date) {
  return `priority:${clientId}:${date}`;
}

export function loadTodayPriority(clientId, date) {
  const id = clientId || getOrCreateDeviceId();
  try {
    const raw = localStorage.getItem(priorityLocalKey(id, date));
    if (!raw) return { date: "", text: "" };
    const parsed = JSON.parse(raw);
    if (parsed?.date === date) return { date: parsed.date, text: parsed.text || "" };
  } catch { /* ignore */ }
  return { date: "", text: "" };
}

export function saveTodayPriority(clientId, date, text) {
  const id = clientId || getOrCreateDeviceId();
  const entry = { date, text: text.trim() };
  try {
    localStorage.setItem(priorityLocalKey(id, date), JSON.stringify(entry));
  } catch { /* ignore */ }
  return entry;
}

export function useSharedList(storageKey, defaultData, { active = true } = {}) {
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
    reload,
  };
}

export function SharedMetaLine({ meta, style, onReload, onSaveCloud, loading, saving, error }) {
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

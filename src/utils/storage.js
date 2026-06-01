import { useState, useEffect, useCallback } from "react";
import { sharedStorage } from "../GlobalConfig.jsx";

export const CURRENT_USER_KEY = "ops-center-current-user";

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

export { sharedStorage } from "../GlobalConfig.jsx";

export const privateStorage = {
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

export function formatSharedTime(ts) {
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
    }, 2500);
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

export async function resolveClientId() {
  try {
    const cached = localStorage.getItem(CLIENT_ID_KEY);
    if (cached && isPrivateLanIp(cached)) return cached;
    if (cached && !isPrivateLanIp(cached)) localStorage.removeItem(CLIENT_ID_KEY);
  } catch { /* ignore */ }

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

  return "";
}

export async function loadTodayPriority(clientId, date) {
  if (!clientId) return { date: "", text: "" };

  try {
    const res = await fetch(`/api/priority?date=${encodeURIComponent(date)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.date === date && data.text) {
        const entry = { date: data.date, text: data.text };
        writePriorityLocal(clientId, entry);
        return entry;
      }
      if (data.ok && data.date === date && !data.text) {
        return { date: "", text: "" };
      }
    }
  } catch { /* ignore */ }

  return readPriorityLocal(clientId, date);
}

export async function saveTodayPriority(clientId, date, text) {
  const entry = { date, text: text.trim() };
  writePriorityLocal(clientId, entry);

  try {
    await fetch("/api/priority", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, text: entry.text }),
    });
  } catch { /* ignore */ }

  return entry;
}

export function useSharedList(storageKey, defaultData) {
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

export function SharedMetaLine({ meta, style, onReload, loading, error }) {
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

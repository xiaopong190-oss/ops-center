import { useState, useEffect, useCallback } from "react";

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

export const sharedStorage = {
  get(key) {
    try {
      const raw = localStorage.getItem(`shared:${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set(key, value, updatedBy) {
    localStorage.setItem(`shared:${key}`, JSON.stringify({
      data: value,
      updatedBy: updatedBy || getCurrentUser().name,
      updatedAt: Date.now(),
    }));
  },
  delete(key) {
    localStorage.removeItem(`shared:${key}`);
  },
};

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

export function useSharedList(storageKey, defaultData) {
  const read = useCallback(() => {
    const raw = sharedStorage.get(storageKey);
    const data = raw?.data != null ? raw.data : defaultData;
    return { data, meta: raw };
  }, [storageKey, defaultData]);

  const [state, setState] = useState(() => read());

  useEffect(() => {
    const handler = (e) => {
      if (e.key === `shared:${storageKey}`) setState(read());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [storageKey, read]);

  const persist = useCallback((data) => {
    sharedStorage.set(storageKey, data, getCurrentUser().name);
    setState({ data, meta: sharedStorage.get(storageKey) });
  }, [storageKey]);

  return { items: state.data, meta: state.meta, persist, reload: () => setState(read()) };
}

export function SharedMetaLine({ meta, style }) {
  if (!meta?.updatedBy) return null;
  return (
    <div style={{ fontSize: 10, color: "var(--tm)", marginBottom: 10, ...style }}>
      最后由 {meta.updatedBy} 更新于 {formatSharedTime(meta.updatedAt)}
    </div>
  );
}

const { useState, useRef, useEffect, useCallback, useMemo, createContext, useContext } = React;
import { fetchGlobalConfigFromCloud } from "./GlobalConfig.jsx";

const ALL_CLOUD_KEYS = ["logistics", "tasks", "production", "tools-links", "agents", "kpi-monthly", "global-config"];

const LEAVE_MSG = "当前页有未上传的修改，确定离开吗？";

const CloudSyncContext = createContext(null);

function CloudSyncProvider({ children }) {
  const handlerRef = useRef(null);
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  const bump = useCallback(() => setTick(t => t + 1), []);

  const register = useCallback((handler) => {
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
    const onBeforeUnload = (e) => {
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
      if (ok === false) showToast("上传失败，请检查网络或 Gist 配置", 3200);
      else if (typeof ok === "string") showToast(ok);
      else showToast("已保存并上传云端 ✓");
    } catch (e) {
      showToast(e?.message || "上传失败", 3200);
    } finally {
      setBusy(false);
    }
  }, [showToast]);

  return (
    <CloudSyncContext.Provider value={{ register, unregister, bump, tick, getHandler, confirmLeaveIfDirty, saveToCloud, reloadAllCloud, busy }}>
      {children}
      {toast && (
        <div style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 200,
          background: toast.includes("失败") ? "#fee2e2" : "#d4f0dc",
          border: `1px solid ${toast.includes("失败") ? "#fecaca" : "#86efac"}`,
          color: toast.includes("失败") ? "#e55" : "#2d9e52",
          padding: "9px 16px", borderRadius: 8, fontSize: 12,
        }}>{toast}</div>
      )}
    </CloudSyncContext.Provider>
  );
}

function useCloudSyncPage(active, handlers) {
  const ctx = useContext(CloudSyncContext);
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!active || !ctx) return;
    ctx.register({
      get label() { return ref.current.label; },
      get save() { return ref.current.save; },
      get reload() { return ref.current.reload; },
      get meta() { return ref.current.meta; },
      get loading() { return ref.current.loading; },
      get saving() { return ref.current.saving; },
      get error() { return ref.current.error; },
      get isDirty() { return !!ref.current.isDirty; },
      get dirtyHint() { return ref.current.dirtyHint; },
    });
    return () => ctx.unregister();
  }, [active, ctx]);

  useEffect(() => {
    if (active && ctx) ctx.bump();
  }, [active, ctx, handlers.meta, handlers.loading, handlers.saving, handlers.error, handlers.label, handlers.isDirty]);
}

export function useConfirmLeave() {
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

  let bg = "#ecfdf5", border = "#6ee7b7", color = "#065f46";
  let text = pollMin > 0
    ? `☁️ 全站云端同步 · 请点「从云端更新」手动拉取；页面可见时每 ${pollMin} 分钟自动拉一次`
    : "☁️ 全站云端同步 · 请点「从云端更新」手动拉取；填写后点「保存并上传」";

  if (handler?.isDirty) {
    bg = "#fffbeb"; border = "#fcd34d"; color = "#92400e";
    text = `⚠️ ${handler.dirtyHint || "有未上传的修改"} · 离开前请先「保存并上传」`;
  } else if (loading && !saving) {
    bg = "#f3f4f6"; border = "#d1d5db"; color = "#4b5563";
    text = "⏳ 正在从云端加载…";
  } else if (saving) {
    bg = "#eef6ff"; border = "#b8d4f0"; color = "#1a4e8a";
    text = "⏳ 正在保存并上传到云端…";
  } else if (error) {
    bg = "#fee2e2"; border = "#fca5a5"; color = "#991b1b";
    text = `❌ ${error} · 已暂存本机，请重试上传`;
  } else if (handler?.meta?.updatedBy) {
    const who = handler.meta.updatedBy;
    const when = formatSharedTime(handler.meta.updatedAt);
    const page = handler.label ? `（${handler.label}）` : "";
    text = pollMin > 0
      ? `☁️ 最后由 ${who} 更新于 ${when}${page} · 手动更新；可见时每 ${pollMin} 分钟自动拉取`
      : `☁️ 最后由 ${who} 更新于 ${when}${page} · 请手动点「从云端更新」`;
  }

  const btn = {
    borderRadius: 6, padding: "6px 12px", fontSize: 11, fontFamily: "inherit",
    fontWeight: 600, flexShrink: 0, cursor: "pointer",
  };

  return (
    <div style={{
      fontSize: 12, color, background: bg, border: `1px solid ${border}`,
      borderRadius: 8, padding: "8px 12px", marginBottom: "1rem",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 10, flexWrap: "wrap",
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>{text}</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" disabled={loading || saving} onClick={onSave}
          style={{
            ...btn, background: saving ? "#eef6ff" : "#2d7dd2", border: saving ? "1px solid #b8d4f0" : "none",
            color: saving ? "#1a4e8a" : "#fff", opacity: loading || saving ? 0.85 : 1,
            cursor: loading || saving ? "wait" : "pointer", minWidth: 108,
          }}>
          {saving ? "上传中…" : "☁️ 保存并上传"}
        </button>
        <button type="button" disabled={loading || saving} onClick={onReload}
          style={{
            ...btn, background: "#fff", border: `1px solid ${border}`, color,
            opacity: loading || saving ? 0.75 : 1,
            cursor: loading || saving ? "wait" : "pointer", minWidth: 88,
          }}>
          {loading ? "更新中…" : "↻ 从云端更新"}
        </button>
      </div>
    </div>
  );
}

window.CloudSyncProvider = CloudSyncProvider;
window.useCloudSyncPage = useCloudSyncPage;
window.GlobalCloudBar = GlobalCloudBar;

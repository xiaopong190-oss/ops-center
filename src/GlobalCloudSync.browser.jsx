const { useState, useRef, useEffect, useCallback, useMemo, createContext, useContext } = React;

const ALL_CLOUD_KEYS = ["logistics", "tasks", "production", "tools-links", "agents", "kpi-monthly", "global-config"];

const LEAVE_MSG = "当前页有未分享的修改，确定离开吗？";

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

  const confirmLeaveIfDirty = useCallback(async () => {
    const h = handlerRef.current;
    if (!h?.isDirty) return true;
    const hint = h.dirtyHint || LEAVE_MSG;
    return opsConfirm(hint.endsWith("？") ? hint : `${hint}，确定离开吗？`);
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
    const h = handlerRef.current;
    if (h?.isDirty && !(await opsConfirm("从云端更新会用全员数据覆盖本账号未上传的修改，确定继续？"))) return;
    setBusy(true);
    try {
      await h?.reload?.({ discardDraft: true });
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
      showToast("当前页没有可上传的数据", 2800);
      return;
    }
    setBusy(true);
    try {
      const ok = await h.save();
      if (ok === false) showToast("上传失败，请检查网络后重试", 3200);
      else if (typeof ok === "string") showToast(ok);
      else showToast("已分享给全员 ✓");
    } catch (e) {
      showToast(e?.message || "上传失败", 3200);
    } finally {
      setBusy(false);
    }
  }, [showToast]);

  return (
    <CloudSyncContext.Provider value={{ register, unregister, bump, tick, getHandler, confirmLeaveIfDirty, saveToCloud, reloadAllCloud, busy }}>
      {children}
      <ConfirmHost />
      {toast && (
        <div className={`ops-toast${toast.includes("失败") ? " ops-toast-err" : " ops-toast-ok"}`}>{toast}</div>
      )}
    </CloudSyncContext.Provider>
  );
}

function ConfirmHost() {
  const [req, setReq] = useState(null);
  useEffect(() => {
    window.__opsConfirm = (message) => new Promise((resolve) => {
      setReq({ message: String(message || "确定？"), resolve });
    });
    return () => { delete window.__opsConfirm; };
  }, []);
  if (!req) return null;
  const close = (ok) => { req.resolve(ok); setReq(null); };
  return (
    <div className="ops-modal-backdrop" onClick={() => close(false)}>
      <div className="ops-confirm-card" onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 10 }}>请确认</div>
        <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", marginBottom: 16 }}>{req.message}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="ops-btn" onClick={() => close(false)}>取消</button>
          <button type="button" className="ops-btn ops-btn-primary" onClick={() => close(true)}>确定</button>
        </div>
      </div>
    </div>
  );
}

function opsConfirm(message) {
  if (typeof window !== "undefined" && typeof window.__opsConfirm === "function") {
    return window.__opsConfirm(message);
  }
  return Promise.resolve(window.confirm(String(message || "确定？")));
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
      get barHint() { return ref.current.barHint; },
    });
    return () => ctx.unregister();
  }, [active, ctx]);

  useEffect(() => {
    if (active && ctx) ctx.bump();
  }, [active, ctx, handlers.meta, handlers.loading, handlers.saving, handlers.error, handlers.label, handlers.isDirty, handlers.barHint]);
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

  let tone = "ok";
  let text = handler?.barHint
    || (userWantsAutoShare()
      ? "已开启自动分享：改完会立刻给同事看"
      : "改完只保存在你的账号，点「保存并上传」才给同事看");

  if (handler?.isDirty) {
    tone = "warn";
    text = `${handler.dirtyHint || "有还没给同事看的修改"} · 点「保存并上传」`;
  } else if (loading && !saving) {
    tone = "muted";
    text = "正在从云端加载…";
  } else if (saving) {
    tone = "info";
    text = "正在保存…";
  } else if (error) {
    tone = "danger";
    text = `${error} · 已暂存本机，请重试上传`;
  } else if (handler?.barHint) {
    text = handler.barHint;
  } else if (handler?.meta?.updatedBy) {
    const who = handler.meta.updatedBy;
    const when = formatSharedTime(handler.meta.updatedAt);
    const page = handler.label ? `（${handler.label}）` : "";
    text = `全员数据最后由 ${who} 更新于 ${when}${page} · ${userWantsAutoShare() ? "已开启自动分享" : "点上传才给同事看"}`;
  }

  return (
    <div className={`ops-cloud-bar ops-cloud-bar-${tone}`}>
      <span style={{ flex: 1, minWidth: 0 }}>{text}</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" disabled={loading || saving} onClick={onSave}
          className="ops-btn ops-btn-primary" style={{ minWidth: 108 }}>
          {saving ? "上传中…" : "保存并上传"}
        </button>
        <button type="button" disabled={loading || saving} onClick={onReload}
          className="ops-btn" style={{ minWidth: 88 }}>
          {loading ? "更新中…" : "从云端更新"}
        </button>
      </div>
    </div>
  );
}

window.CloudSyncProvider = CloudSyncProvider;
window.useCloudSyncPage = useCloudSyncPage;
window.GlobalCloudBar = GlobalCloudBar;
window.opsConfirm = opsConfirm;

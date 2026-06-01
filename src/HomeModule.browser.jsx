const { useState, useEffect, useCallback } = React;

const FX_CACHE_KEY = "ops-center-fx-rates";
const NEWS_CACHE_KEY = "ops-center-amazon-news";

const FX_TARGETS = [
  { code: "USD", label: "美元", symbol: "$", decimals: 4 },
  { code: "GBP", label: "英镑", symbol: "£", decimals: 4 },
  { code: "EUR", label: "欧元", symbol: "€", decimals: 4 },
  { code: "JPY", label: "日元", symbol: "¥", decimals: 2, per100: true },
];

const WORLD_CLOCKS = [
  { id: "us", label: "美国", sub: "纽约", tz: "America/New_York", flag: "🇺🇸" },
  { id: "jp", label: "日本", sub: "东京", tz: "Asia/Tokyo", flag: "🇯🇵" },
  { id: "uk", label: "英国", sub: "伦敦", tz: "Europe/London", flag: "🇬🇧" },
  { id: "de", label: "德国", sub: "柏林", tz: "Europe/Berlin", flag: "🇩🇪" },
  { id: "cn", label: "北京", sub: "中国", tz: "Asia/Shanghai", flag: "🇨🇳" },
];

const BEIJING_TZ = "Asia/Shanghai";

function beijingTodayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BEIJING_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find(p => p.type === "year")?.value || "0000";
  const m = parts.find(p => p.type === "month")?.value || "01";
  const d = parts.find(p => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

function todayKey() {
  return beijingTodayKey();
}

function formatFxRate(value, decimals) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(decimals);
}

function loadFxCache() {
  try {
    const raw = localStorage.getItem(FX_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveFxCache(data) {
  try {
    localStorage.setItem(FX_CACHE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

const FX_CODES = FX_TARGETS.map(t => t.code);

function pickFxRates(allRates) {
  const rates = {};
  for (const code of FX_CODES) {
    const v = allRates?.[code];
    if (typeof v === "number" && v > 0) rates[code] = v;
  }
  return Object.keys(rates).length === FX_CODES.length ? rates : null;
}

async function fetchJson(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchExchangeRatesFromApi() {
  const frankfurter = "https://api.frankfurter.app/latest?from=CNY&to=" + FX_CODES.join(",");
  const erApi = "https://open.er-api.com/v6/latest/CNY";
  const host = "https://api.exchangerate.host/latest?base=CNY&symbols=" + FX_CODES.join(",");
  const invert = "https://api.frankfurter.app/latest?from=USD&to=CNY," + FX_CODES.filter(c => c !== "USD").join(",");
  const bundled = new URL("fx-rates.json", window.location.href).href;

  const sources = [
    async () => {
      const data = await fetchJson(frankfurter);
      const rates = pickFxRates(data.rates);
      if (!rates) throw new Error("incomplete");
      return { asOf: data.date || todayKey(), rates, source: "frankfurter" };
    },
    async () => {
      const data = await fetchJson(erApi);
      if (data.result !== "success") throw new Error("er-api");
      const rates = pickFxRates(data.rates);
      if (!rates) throw new Error("incomplete");
      const asOf = data.time_last_update_utc?.slice(5, 16) || todayKey();
      return { asOf, rates, source: "er-api" };
    },
    async () => {
      const data = await fetchJson(host);
      if (!data.success) throw new Error("exchangerate.host");
      const rates = pickFxRates(data.rates);
      if (!rates) throw new Error("incomplete");
      return { asOf: data.date || todayKey(), rates, source: "exchangerate.host" };
    },
    async () => {
      const data = await fetchJson(invert);
      const cnyPerUsd = data.rates?.CNY;
      if (!cnyPerUsd || cnyPerUsd <= 0) throw new Error("invert");
      const rates = { USD: 1 / cnyPerUsd };
      for (const code of FX_CODES) {
        if (code === "USD") continue;
        const perUsd = data.rates?.[code];
        if (!perUsd || perUsd <= 0) throw new Error("invert");
        rates[code] = perUsd / cnyPerUsd;
      }
      return { asOf: data.date || todayKey(), rates, source: "frankfurter-invert" };
    },
    async () => {
      const data = await fetchJson(bundled);
      const rates = pickFxRates(data.rates);
      if (!rates) throw new Error("bundled");
      return { asOf: data.asOf || data.date || todayKey(), rates, source: "bundled" };
    },
  ];

  let lastErr;
  for (const load of sources) {
    try {
      return await load();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("all sources failed");
}

function useExchangeRates() {
  const [state, setState] = useState(() => {
    const cached = loadFxCache();
    if (cached?.rates) {
      const fresh = cached.date === todayKey();
      return {
        status: fresh ? "ok" : "stale",
        date: cached.date || "",
        asOf: cached.asOf || cached.date || "",
        rates: cached.rates,
        error: "",
      };
    }
    return { status: "loading", date: "", asOf: "", rates: null, error: "" };
  });

  useEffect(() => {
    const cached = loadFxCache();
    if (cached?.date === todayKey() && cached.rates) {
      setState({ status: "ok", date: cached.date, asOf: cached.asOf, rates: cached.rates, error: "" });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const live = await fetchExchangeRatesFromApi();
        const payload = {
          date: todayKey(),
          asOf: live.asOf,
          rates: live.rates,
          source: live.source,
        };
        saveFxCache(payload);
        if (!cancelled) {
          setState({ status: "ok", date: payload.date, asOf: payload.asOf, rates: payload.rates, error: "" });
        }
      } catch (e) {
        if (cancelled) return;
        if (cached?.rates) {
          setState({
            status: "stale",
            date: cached.date || "",
            asOf: cached.asOf || cached.date || "",
            rates: cached.rates,
            error: e.message || "获取失败",
          });
          return;
        }
        setState(s => ({ ...s, status: "error", error: e.message || "获取失败" }));
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return state;
}

function loadNewsCache() {
  try {
    const raw = localStorage.getItem(NEWS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveNewsCache(data) {
  try {
    localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

async function fetchAmazonNewsPayload() {
  const bundled = new URL("amazon-news.json", window.location.href).href;
  const sources = [
    async () => {
      const data = await fetchJson("/api/amazon-news");
      if (data?.ok && data.news?.items?.length) return data.news;
      throw new Error("api empty");
    },
    async () => {
      const data = await fetchJson(bundled);
      if (data?.items?.length) return data;
      throw new Error("bundled empty");
    },
  ];
  let lastErr;
  for (const load of sources) {
    try {
      return await load();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("all news sources failed");
}

function useAmazonNews() {
  const [state, setState] = useState(() => {
    const cached = loadNewsCache();
    if (cached?.items?.length) {
      return { status: "stale", items: cached.items, sourceLabel: cached.sourceLabel || "", updatedAt: cached.updatedAt || "", error: "" };
    }
    return { status: "loading", items: [], sourceLabel: "", updatedAt: "", error: "" };
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const news = await fetchAmazonNewsPayload();
        saveNewsCache(news);
        if (!cancelled) {
          setState({
            status: "ok",
            items: news.items,
            sourceLabel: news.sourceLabel || "Amazon 官方新闻",
            updatedAt: news.updatedAt || "",
            error: "",
          });
        }
      } catch (e) {
        if (cancelled) return;
        const cached = loadNewsCache();
        if (cached?.items?.length) {
          setState({
            status: "stale",
            items: cached.items,
            sourceLabel: cached.sourceLabel || "",
            updatedAt: cached.updatedAt || "",
            error: e.message || "获取失败",
          });
          return;
        }
        setState(s => ({ ...s, status: "error", error: e.message || "获取失败" }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}

function AmazonNewsCard({ news }) {
  const formatUpdated = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
  };

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>📰 亚马逊动态</div>
        <div style={{ fontSize: 10, color: "var(--tm)" }}>
          {news.status === "ok" ? news.sourceLabel : news.status === "stale" ? "缓存 · " + news.sourceLabel : news.status === "loading" ? "加载中…" : "暂不可用"}
          {news.updatedAt && news.status !== "loading" && ` · ${formatUpdated(news.updatedAt)}`}
        </div>
      </div>
      {news.status === "error" && (
        <div style={{ fontSize: 12, color: "var(--tm)", padding: "12px 14px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }}>
          新闻获取失败，请检查网络后刷新。
        </div>
      )}
      {news.status !== "error" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(news.status === "loading" ? [{ title: "…" }, { title: "…" }, { title: "…" }] : news.items.slice(0, 3)).map((item, i) => (
            <a
              key={item.link || i}
              href={item.link || "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => { if (!item.link) e.preventDefault(); }}
              style={{
                display: "block",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "12px 14px",
                textDecoration: "none",
                color: "inherit",
                opacity: news.status === "loading" ? 0.5 : 1,
              }}
              onMouseEnter={e => { if (item.link) e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45, color: "var(--text)" }}>{item.title}</div>
                  {item.summary && (
                    <div style={{ fontSize: 11, color: "var(--tm)", marginTop: 4, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.summary}</div>
                  )}
                </div>
                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  {item.date && <div style={{ fontSize: 10, color: "var(--tm)", marginBottom: 4 }}>{item.date}</div>}
                  {item.category && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "var(--bg)", color: "var(--tm)", border: "1px solid var(--border)" }}>{item.category}</span>}
                  {item.link && <div style={{ fontSize: 11, color: "#2d7dd2", marginTop: 4 }}>↗</div>}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10, color: "var(--tm)", marginTop: 8, lineHeight: 1.5 }}>自动同步 Amazon 官方 RSS，每 4 小时更新，无需人工维护。</div>
    </div>
  );
}

function ExchangeRatesCard({ fx }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px", marginBottom: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>💱 今日汇率（人民币）</div>
        <div style={{ fontSize: 10, color: "var(--tm)" }}>
          {fx.status === "ok" ? `参考 ${fx.asOf}` : fx.status === "stale" ? `缓存 ${fx.asOf}` : fx.status === "loading" ? "加载中…" : "暂不可用"}
        </div>
      </div>
      {fx.status === "stale" && (
        <div style={{ fontSize: 11, color: "var(--tm)", marginBottom: 8 }}>网络更新失败，显示上次缓存汇率。</div>
      )}
      {fx.status === "error" && (
        <div style={{ fontSize: 12, color: "var(--tm)", lineHeight: 1.55 }}>汇率获取失败，请检查网络后刷新页面。</div>
      )}
      {fx.status !== "error" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
          {FX_TARGETS.map(t => {
            const raw = fx.rates?.[t.code];
            const mult = t.per100 ? 100 : 1;
            const val = raw != null ? raw * mult : null;
            const prefix = t.per100 ? "100 CNY =" : "1 CNY =";
            const suffix = t.per100 ? ` ${formatFxRate(val, t.decimals)} JPY` : ` ${t.symbol}${formatFxRate(val, t.decimals)}`;
            return (
              <div key={t.code} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "var(--tm)", marginBottom: 4 }}>{t.label} {t.code}</div>
                <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {fx.status === "loading" ? "…" : (
                    <span>{prefix}{suffix}</span>
                  )}
                </div>
                {raw != null && fx.status === "ok" && !t.per100 && (
                  <div style={{ fontSize: 10, color: "var(--tm)", marginTop: 4 }}>
                    1 {t.symbol} ≈ ¥{formatFxRate(1 / raw, 2)} CNY
                  </div>
                )}
                {raw != null && fx.status === "ok" && t.per100 && (
                  <div style={{ fontSize: 10, color: "var(--tm)", marginTop: 4 }}>
                    100 JPY ≈ ¥{formatFxRate(100 / raw, 2)} CNY
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ fontSize: 10, color: "var(--tm)", marginTop: 10, lineHeight: 1.5 }}>数据来源：多源汇率 API + 本地缓存，仅供参考。</div>
    </div>
  );
}

function formatClockTime(date, tz) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatClockDate(date, tz) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: tz,
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function useNow(tickMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}

function PriorityModal({ initialText, onSave, onClose, requiredHint, required }) {
  const [text, setText] = useState(initialText || "");
  const [warn, setWarn] = useState("");
  const [saving, setSaving] = useState(false);

  const canClose = !required && !saving;

  const tryClose = () => {
    if (canClose) onClose();
  };

  useEffect(() => {
    if (!canClose) return;
    const onKey = (e) => { if (e.key === "Escape") tryClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canClose, onClose]);

  const handleSave = async () => {
    if (!text.trim()) {
      setWarn("请先填写今日最优先工作，保存后才能关闭。");
      return;
    }
    setWarn("");
    setSaving(true);
    try {
      await onSave(text);
    } catch (e) {
      setWarn(e?.message || "保存失败，请重试");
      setSaving(false);
    }
  };

  return (
    <div onClick={canClose ? tryClose : undefined} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 250, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "1.35rem 1.5rem", width: "100%", maxWidth: 440, color: "var(--text)", boxShadow: "0 16px 48px rgba(0,0,0,0.12)" }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>今日最优先工作</div>
        <div style={{ fontSize: 12, color: "var(--tm)", marginBottom: 14, lineHeight: 1.55 }}>
          {requiredHint || "写下今天必须完成的第一件事，保存后会在首页显示。"}
        </div>
        <textarea
          value={text}
          onChange={e => { setText(e.target.value); if (warn) setWarn(""); }}
          placeholder="例如：完成 FB101 头程追踪码补录、审核美工排期…"
          autoFocus
          style={{ width: "100%", minHeight: 96, fontSize: 14, padding: "10px 12px", border: `1px solid ${warn ? "#e57373" : "var(--border)"}`, borderRadius: 10, fontFamily: "inherit", background: "transparent", color: "inherit", resize: "vertical", display: "block", marginBottom: warn ? 8 : 14, lineHeight: 1.5 }}
          onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) handleSave(); }}
        />
        {warn && (
          <div style={{ fontSize: 12, color: "#c62828", marginBottom: 14, lineHeight: 1.5 }}>{warn}</div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {canClose && (
            <button type="button" onClick={tryClose} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "var(--tm)" }}>取消</button>
          )}
          <button type="button" onClick={handleSave} disabled={saving} style={{ background: saving ? "#94a3b8" : "#2d7dd2", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, cursor: saving ? "wait" : "pointer", fontFamily: "inherit", color: "#fff", fontWeight: 600 }}>{saving ? "保存中…" : "保存"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── HOME MODULE ───────────────────────────────────────────────────────

function HomePanel() {
  const now = useNow();
  const fx = useExchangeRates();
  const news = useAmazonNews();
  const today = beijingTodayKey(now);
  const [clientId, setClientId] = useState("");
  const [priority, setPriority] = useState({ date: "", text: "" });
  const [priorityReady, setPriorityReady] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const todayPriority = priority.date === today ? priority.text : "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await resolveClientId();
      if (cancelled) return;
      setClientId(id);
      const saved = await loadTodayPriority(id, today);
      if (cancelled) return;
      setPriority(saved);
      setShowModal(!saved.text.trim());
      setPriorityReady(true);
    })();
    return () => { cancelled = true; };
  }, [today]);

  const handleSavePriority = async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const id = clientId || getOrCreateDeviceId();
    if (id !== clientId) setClientId(id);
    const entry = await saveTodayPriority(id, today, trimmed);
    setPriority(entry);
    setShowModal(false);
  };

  const beijingDate = formatClockDate(now, "Asia/Shanghai");

  return (
    <div>
      <div style={{ marginBottom: "1.25rem" }}>
        <div style={{ fontSize: 13, color: "var(--tm)", marginBottom: 4 }}>欢迎回来</div>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>{beijingDate}</div>
      </div>

      <AmazonNewsCard news={news} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: "1.25rem" }}>
        {WORLD_CLOCKS.map(c => (
          <div key={c.id} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>{c.flag}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</div>
                <div style={{ fontSize: 10, color: "var(--tm)" }}>{c.sub}</div>
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em", color: c.id === "cn" ? "#2d7dd2" : "var(--text)" }}>
              {formatClockTime(now, c.tz)}
            </div>
            <div style={{ fontSize: 10, color: "var(--tm)", marginTop: 4 }}>{formatClockDate(now, c.tz)}</div>
          </div>
        ))}
      </div>

      <ExchangeRatesCard fx={fx} />

      <div style={{ background: "linear-gradient(135deg, rgba(45,125,210,0.08), rgba(45,125,210,0.02))", border: "1px solid rgba(45,125,210,0.25)", borderRadius: 14, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: todayPriority ? 10 : 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1a4e8a" }}>🎯 今日最优先</div>
          <button type="button" onClick={() => setShowModal(true)} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", color: "#2d7dd2" }}>
            {todayPriority ? "修改" : "填写"}
          </button>
        </div>
        {todayPriority ? (
          <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text)", whiteSpace: "pre-wrap" }}>{todayPriority}</div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--tm)", lineHeight: 1.55 }}>尚未设定今日优先事项，点击「填写」开始。</div>
        )}
      </div>

      {priorityReady && showModal && (
        <PriorityModal
          initialText={todayPriority}
          required={!todayPriority}
          requiredHint={!todayPriority ? "新的一天，请先写下今天最重要的一件事。填写并保存后才能关闭。" : undefined}
          onSave={handleSavePriority}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

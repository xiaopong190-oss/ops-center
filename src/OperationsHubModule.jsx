import { useEffect, useMemo, useState } from "react";
import { useCurrentUser } from "./context/UserContext.jsx";

const PRODUCT_KEY = "ops-center-active-product-v1";
const DEFAULT_PRODUCTS = [
  { id: "demo-1", name: "示例产品", site: "US", asin: "", stage: "新品期" },
];

function readProducts(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(`${PRODUCT_KEY}:${userId}`) || "null");
    if (saved?.products?.length) return saved;
  } catch { /* ignore malformed local draft */ }
  return { activeId: DEFAULT_PRODUCTS[0].id, products: DEFAULT_PRODUCTS };
}

export function ProductContextBar({ activeTab }) {
  const user = useCurrentUser();
  const userId = String(user?.id || user?.name || "guest");
  const [state, setState] = useState(() => readProducts(userId));
  const active = useMemo(() => state.products.find(p => p.id === state.activeId) || state.products[0], [state]);

  useEffect(() => setState(readProducts(userId)), [userId]);
  useEffect(() => {
    try { localStorage.setItem(`${PRODUCT_KEY}:${userId}`, JSON.stringify(state)); } catch { /* ignore */ }
    try {
      window.opsProductContext = { operatorId: userId, product: active };
      window.dispatchEvent(new CustomEvent("ops-product-changed", { detail: window.opsProductContext }));
    } catch { /* ignore */ }
  }, [state, userId, active]);

  const addProduct = () => {
    const id = `product-${Date.now()}`;
    setState(s => ({ activeId: id, products: [...s.products, { id, name: `新产品 ${s.products.length + 1}`, site: "US", asin: "", stage: "待定" }] }));
  };
  const patch = (key, value) => setState(s => ({ ...s, products: s.products.map(p => p.id === s.activeId ? { ...p, [key]: value } : p) }));

  return (
    <section className="ops-card ops-card-padded" style={{ marginBottom: 14, display: "grid", gridTemplateColumns: "minmax(170px,1.2fr) 90px minmax(150px,1fr) 105px auto", gap: 9, alignItems: "end" }}>
      <div><label className="ops-context-label">当前产品</label><select value={state.activeId} onChange={e => setState(s => ({ ...s, activeId: e.target.value }))} className="ops-context-input">{state.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div><label className="ops-context-label">站点</label><select value={active?.site || "US"} onChange={e => patch("site", e.target.value)} className="ops-context-input"><option>US</option><option>UK</option><option>DE</option><option>JP</option><option>CA</option></select></div>
      <div><label className="ops-context-label">主 ASIN</label><input value={active?.asin || ""} onChange={e => patch("asin", e.target.value.toUpperCase())} placeholder="B0XXXXXXXX" className="ops-context-input" /></div>
      <div><label className="ops-context-label">阶段</label><select value={active?.stage || "待定"} onChange={e => patch("stage", e.target.value)} className="ops-context-input"><option>待定</option><option>准备期</option><option>新品期</option><option>成长期</option><option>成熟期</option><option>清退期</option></select></div>
      <button type="button" className="ops-btn ops-btn-primary" onClick={addProduct}>+ 添加产品</button>
      <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "var(--tm)" }}>运营：{user?.name || "访客"} · 产品 ID：{active?.id} · 当前模块：{activeTab}。之后的计划、词库、监控和复盘都绑定这一份产品档案。
      </div>
    </section>
  );
}

function EmbeddedBusinessPanel({ title, subtitle, path }) {
  const user = useCurrentUser();
  const context = window.opsProductContext || {};
  const params = new URLSearchParams({ embedded: "1", opsUser: String(user?.id || user?.name || "guest"), opsName: String(user?.name || "访客"), productId: String(context.product?.id || ""), asin: String(context.product?.asin || ""), site: String(context.product?.site || "US") });
  const src = `${path}${path.includes("?") ? "&" : "?"}${params}`;
  return <div style={{ height: "calc(100vh - 230px)", minHeight: 560, display: "flex", flexDirection: "column" }}><div style={{ marginBottom: 9 }}><div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div><div style={{ fontSize: 11, color: "var(--tm)", marginTop: 2 }}>{subtitle}</div></div><iframe key={src} src={src} title={title} style={{ flex: 1, width: "100%", border: "1px solid var(--border)", borderRadius: 10, background: "#fff" }} /></div>;
}

export function LaunchPlanPanel() {
  return <EmbeddedBusinessPanel title="推品计划" subtitle="五阶段九步作战手册，与当前运营和产品档案绑定" path="tools/growth-playbook/index.html" />;
}

export function PromotionTrackerPanel() {
  return <EmbeddedBusinessPanel title="推广追踪" subtitle="月度规划、投入产出和实际达成复盘" path="tools/amazon-tracker/index.html" />;
}

export function WatchlistPanel() {
  const blocks = [
    ["每日定点", "BSR、价格、优惠、评分与 Ratings"],
    ["主动动作", "Listing 改版、广告、变价和出券"],
    ["关键词位", "共用当前产品的核心词和词库"],
    ["周期复盘", "对比动作后 3–7 日的叶子 BSR 变化"],
  ];
  return <div><div className="ops-card ops-card-padded"><div style={{ fontSize: 18, fontWeight: 700, marginBottom: 5 }}>监控清单</div><div style={{ color: "var(--tm)", fontSize: 12, marginBottom: 18 }}>架构预览：下一阶段将本地 xiyou-amz-console/watchlist 迁入这里。</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>{blocks.map(([title, text]) => <div key={title} className="ops-card ops-card-padded" style={{ borderLeft: "3px solid #4080FF" }}><div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div><div style={{ fontSize: 12, color: "var(--tm)", lineHeight: 1.6 }}>{text}</div></div>)}</div><div className="ops-note" style={{ marginTop: 16 }}>共用连接：西柚 MCP + 卖家精灵 MCP → Cloudflare 证据缓存 → 当前产品档案 → AI 周期结论</div></div></div>;
}

const CONNECTIONS = [
  { name: "Cloudflare AI", detail: "Workers AI / AI Gateway", color: "#f59e0b" },
  { name: "LLM API", detail: "OpenAI-compatible Base URL + Model", color: "#7c3aed" },
  { name: "西柚 MCP", detail: "商品、订单、流量、排名、改版", color: "#f97316" },
  { name: "卖家精灵 MCP", detail: "反查词、Keepa、评论、竞品与关联流量", color: "#0ea5e9" },
];

export function IntegrationsPanel() {
  return <div><div style={{ fontSize: 18, fontWeight: 700 }}>共用连接中心</div><div style={{ fontSize: 12, color: "var(--tm)", margin: "4px 0 16px" }}>架构预览：密钥将保存在 Cloudflare Secrets，业务页面只能调用，不能读取。</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>{CONNECTIONS.map(c => <section key={c.name} className="ops-card ops-card-padded" style={{ borderTop: `3px solid ${c.color}` }}><div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><strong>{c.name}</strong><span className="ops-badge">待配置</span></div><div style={{ fontSize: 12, color: "var(--tm)", margin: "8px 0 14px", minHeight: 36 }}>{c.detail}</div><button type="button" className="ops-btn" disabled>配置与测试（下一阶段）</button></section>)}</div><section className="ops-card ops-card-padded" style={{ marginTop: 14 }}><strong>统一调用链</strong><div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 12 }}>{["业务页面", "产品上下文", "Cloudflare Worker", "MCP 证据库", "LLM 分析", "档案与报告"].map((x, i, a) => <span key={x} style={{ display: "flex", gap: 8, alignItems: "center" }}><span className="ops-badge">{x}</span>{i < a.length - 1 && <b style={{ color: "var(--tm)" }}>→</b>}</span>)}</div></section></div>;
}

export function AmazonGrowthPanel() {
  const user = useCurrentUser();
  const isSuper = user?.auth === "super" || user?.role === "super";
  const params = new URLSearchParams({
    embedded: "1",
    opsUser: String(user?.id || user?.name || "guest"),
    opsName: String(user?.name || "访客"),
    opsRole: isSuper ? "super" : "operator",
  });
  return (
    <div style={{ height: "calc(100vh - 112px)", minHeight: 640, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>亚马逊增长中心</div>
          <div style={{ fontSize: 11, color: "var(--tm)", marginTop: 3 }}>运营调用、竞品分析、监控清单、推品计划与关键词库</div>
        </div>
        <span className="ops-badge">{isSuper ? "超级管理员 · 可配置连接" : "运营账号 · 仅业务调用"}</span>
      </div>
      <iframe
        src={`http://127.0.0.1:8791/?${params}`}
        title="亚马逊增长中心"
        style={{ flex: 1, width: "100%", minHeight: 0, border: "1px solid var(--border)", borderRadius: 10, background: "#f6f6f2" }}
      />
    </div>
  );
}

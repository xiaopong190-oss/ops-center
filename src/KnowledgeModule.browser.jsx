// Shared helpers (TODAY, fmtD, Avatar, …) come from LogisticsModule.browser.jsx loaded first.

// ─── KNOWLEDGE BASE MODULE ─────────────────────────────────────────────
// 内嵌亚马逊卖家知识库（GitHub Pages）与关键词库

const KNOWLEDGE_BASE_URL = "https://xiaopong190-oss.github.io/knowledge/";
const KEYWORD_LIBRARY_URL = "https://rootline-keyword-dashboard.xiaopong190-asin-radar.workers.dev/";

function EmbedPanel({ title, subtitle, url, iframeTitle }) {
  const openExternal = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div style={{ position: "relative", height: "calc(100vh - 120px)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexShrink: 0, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: 11, color: "var(--tm)", marginTop: 2 }}>{subtitle}</div>
        </div>
        <button
          type="button"
          onClick={openExternal}
          style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", color: "#2d7dd2", fontFamily: "inherit", fontWeight: 500 }}
        >
          ↗ 新窗口打开
        </button>
      </div>
      <iframe
        src={url}
        title={iframeTitle}
        style={{ flex: 1, width: "100%", minHeight: 0, border: "1px solid var(--border)", borderRadius: 10, background: "#fff" }}
      />
    </div>
  );
}

function KnowledgePanel({ active = true }) {
  return (
    <EmbedPanel
      title="📚 亚马逊卖家知识库"
      subtitle="Amazon Seller OS · 运营方法论与工具合集，持续更新"
      url={KNOWLEDGE_BASE_URL}
      iframeTitle="亚马逊卖家知识库"
    />
  );
}

function KeywordPanel({ active = true }) {
  return (
    <EmbedPanel
      title="🔑 关键词库"
      subtitle="Rootline Keyword Dashboard · ASIN 关键词分析与词库"
      url={KEYWORD_LIBRARY_URL}
      iframeTitle="关键词库"
    />
  );
}

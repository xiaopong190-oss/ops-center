// ─── KNOWLEDGE BASE MODULE ─────────────────────────────────────────────
// 内嵌亚马逊卖家知识库（GitHub Pages）

const KNOWLEDGE_BASE_URL = "https://xiaopong190-oss.github.io/knowledge/";

export function KnowledgePanel({ active = true }) {
  const openExternal = () => {
    window.open(KNOWLEDGE_BASE_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <div style={{ position: "relative", height: "calc(100vh - 120px)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexShrink: 0, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>📚 亚马逊卖家知识库</div>
          <div style={{ fontSize: 11, color: "var(--tm)", marginTop: 2 }}>Amazon Seller OS · 运营方法论与工具合集，持续更新</div>
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
        src={KNOWLEDGE_BASE_URL}
        title="亚马逊卖家知识库"
        style={{ flex: 1, width: "100%", minHeight: 0, border: "1px solid var(--border)", borderRadius: 10, background: "#fff" }}
      />
    </div>
  );
}

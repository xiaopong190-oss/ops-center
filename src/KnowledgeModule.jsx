import { useState, useEffect } from "react";

// ─── KNOWLEDGE BASE MODULE ─────────────────────────────────────────────
// 内嵌亚马逊卖家知识库（GitHub Pages）与关键词库

const KNOWLEDGE_BASE_URL = "https://xiaopong190-oss.github.io/knowledge/";
const KEYWORD_LIBRARY_URL = "https://rootline-keyword-dashboard.xiaopong190-asin-radar.workers.dev/";

function EmbedPanel({ title, subtitle, url, iframeTitle }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const openExternal = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    setReady(false);
    setFailed(false);
    const timer = setTimeout(() => setFailed(true), 10000);
    return () => clearTimeout(timer);
  }, [url]);

  return (
    <div style={{ position: "relative", height: "calc(100vh - 88px)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexShrink: 0, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: 11, color: "var(--tm)", marginTop: 2 }}>{subtitle}</div>
        </div>
        <button
          type="button"
          onClick={openExternal}
          className="ops-btn"
        >
          新窗口打开
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {!ready && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--tm)", border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)", zIndex: 1, flexDirection: "column", gap: 10, padding: 24, textAlign: "center" }}>
            {failed ? (
              <>
                <div>无法在本页内嵌打开</div>
                <button type="button" className="ops-btn ops-btn-primary" onClick={openExternal}>新窗口打开</button>
              </>
            ) : "正在加载…"}
          </div>
        )}
        <iframe
          src={url}
          title={iframeTitle}
          onLoad={() => { setReady(true); setFailed(false); }}
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)", visibility: ready ? "visible" : "hidden" }}
        />
      </div>
    </div>
  );
}

export function KnowledgePanel({ active = true }) {
  return (
    <EmbedPanel
      title="亚马逊卖家知识库"
      subtitle="运营方法论与工具合集，持续更新"
      url={KNOWLEDGE_BASE_URL}
      iframeTitle="知识库"
    />
  );
}

export function KeywordPanel({ active = true }) {
  return (
    <EmbedPanel
      title="关键词库"
      subtitle="ASIN 关键词分析与词库"
      url={KEYWORD_LIBRARY_URL}
      iframeTitle="关键词库"
    />
  );
}

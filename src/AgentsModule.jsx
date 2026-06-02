import { useState, useEffect } from "react";
import { useSharedList, SharedMetaLine } from "./utils/storage.js";

const inpSm = { fontSize: 12, padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 6, fontFamily: "inherit", background: "transparent", color: "inherit" };
const inp = { width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", background: "transparent", color: "inherit", display: "block" };
const badge = (bg, color, extra = {}) => ({ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: bg, color, fontWeight: 500, whiteSpace: "nowrap", ...extra });
const lblSm = { display: "block", fontSize: 10, color: "var(--tm)", marginBottom: 3 };

// ─── AI AGENTS MODULE ──────────────────────────────────────────────────
// GPTs / Gems 链接列表 → GitHub Gist 全公司共享

const AGENTS_LEGACY_KEY = "ops-center-ai-agents";
const AGENT_CATEGORIES = ["全部", "GPTs", "Gems", "其他"];
const CATEGORY_ICONS = { GPTs: "🤖", Gems: "✨", 其他: "🧠" };

const detectCategory = (url) => {
  const u = (url || "").toLowerCase();
  if (u.includes("chatgpt.com/g/") || u.includes("chat.openai.com/g/")) return "GPTs";
  if (u.includes("gemini.google.com/gems") || u.includes("gemini.google.com/app") && u.includes("gem")) return "Gems";
  return "其他";
};

function readLegacyAgents() {
  try {
    const raw = localStorage.getItem(AGENTS_LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

function clearLegacyAgentsStorage() {
  try { localStorage.removeItem(AGENTS_LEGACY_KEY); } catch { /* ignore */ }
}

const resolveAgentUrl = (url) => {
  if (!url) return "";
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
};

const openAgentUrl = (url) => {
  const target = resolveAgentUrl(url);
  if (!target) return false;
  window.open(target, "_blank", "noopener,noreferrer");
  return true;
};

function AgentCard({ agent, isEditing, editName, editUrl, editDesc, onOpen, onStartEdit, onEditNameChange, onEditUrlChange, onEditDescChange, onEditSave, onEditSaveAndOpen, onEditCancel, onDuplicate, onDelete }) {
  const stop = (e) => e.stopPropagation();

  const openHref = (e) => {
    stop(e);
    if (agent.url) openAgentUrl(agent.url);
    else onStartEdit(agent);
  };

  return (
    <div
      onClick={() => { if (!isEditing) onOpen(agent); }}
      style={{
        background: isEditing ? "rgba(45,125,210,0.06)" : "var(--card)",
        border: isEditing ? "2px solid #2d7dd2" : "1px solid var(--border)",
        borderRadius: 12,
        padding: "14px 16px",
        cursor: isEditing ? "default" : "pointer",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
      onMouseEnter={e => { if (!isEditing) e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{agent.icon || CATEGORY_ICONS[agent.category] || "🧠"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
          <span
            onClick={openHref}
            title={agent.url ? "点击打开" : "点击设置链接"}
            style={{ fontSize: 14, fontWeight: 600, cursor: !isEditing ? "pointer" : undefined }}
          >
            {agent.name}
          </span>
          <span style={badge("#f3f4f6", "#666")}>{agent.category}</span>
          <span style={badge("#dceeff", "#1a4e8a")}>新窗口</span>
          {isEditing && <span style={badge("#dceeff", "#1a4e8a")}>编辑中</span>}
        </div>
        <div style={{ fontSize: 12, color: "var(--tm)", lineHeight: 1.5 }}>{agent.desc || "ChatGPT GPTs 或 Google Gems 链接"}</div>

        {isEditing && (
          <div style={{ marginTop: 10 }} onClick={stop}>
            <label style={lblSm}>名称</label>
            <input value={editName} onChange={e => onEditNameChange(e.target.value)} placeholder="如：Listing 优化助手…" style={{ ...inp, fontSize: 12, marginBottom: 8 }} autoFocus />
            <label style={lblSm}>链接</label>
            <input
              value={editUrl}
              onChange={e => onEditUrlChange(e.target.value)}
              placeholder="粘贴 GPTs / Gems 分享链接…"
              style={{ ...inp, fontSize: 12, marginBottom: 8 }}
              onKeyDown={e => {
                if (e.key === "Enter") onEditSave();
                if (e.key === "Escape") onEditCancel();
              }}
            />
            <label style={lblSm}>说明（可选）</label>
            <input value={editDesc} onChange={e => onEditDescChange(e.target.value)} placeholder="简短描述用途…" style={{ ...inp, fontSize: 12, marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" onClick={onEditSave} style={{ background: "#2d7dd2", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", color: "#fff" }}>保存</button>
              <button type="button" onClick={onEditCancel} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", color: "var(--tm)" }}>取消</button>
              {editUrl.trim() && (
                <button type="button" onClick={e => { stop(e); onEditSaveAndOpen(); }} style={{ marginLeft: "auto", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", color: "#2d7dd2" }}>保存并打开 ↗</button>
              )}
            </div>
          </div>
        )}

        {!isEditing && (
          <div
            role="button"
            tabIndex={0}
            title={agent.url ? "点击打开链接" : "点击设置链接"}
            onClick={openHref}
            onKeyDown={e => { if (e.key === "Enter") openHref(e); }}
            style={{
              fontSize: 10,
              color: "#2d7dd2",
              marginTop: 6,
              padding: "4px 8px",
              borderRadius: 6,
              background: "var(--bg)",
              border: "1px dashed var(--border)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              cursor: "pointer",
            }}
          >
            {agent.url || "尚未设置链接，点击此处添加"}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {!isEditing && (
          <>
            <button type="button" title="编辑" onClick={e => { stop(e); onStartEdit(agent); }} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, width: 28, height: 28, fontSize: 13, cursor: "pointer", color: "#2d7dd2", fontFamily: "inherit", lineHeight: 1 }}>✎</button>
            <button type="button" title="复制一份" onClick={e => { stop(e); onDuplicate(agent); }} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, width: 28, height: 28, fontSize: 12, cursor: "pointer", color: "#2e7d32", fontFamily: "inherit", lineHeight: 1 }}>⧉</button>
            <button type="button" title="删除" onClick={e => { stop(e); onDelete(agent); }} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, width: 28, height: 28, fontSize: 12, cursor: "pointer", color: "#c62828", fontFamily: "inherit", lineHeight: 1 }}>×</button>
            <span style={{ fontSize: 12, color: "var(--tm)" }}>↗</span>
          </>
        )}
      </div>
    </div>
  );
}

export function AgentsPanel({ active: tabActive = true }) {
  const { items: agents, meta, loading, error, persist: persistAgents, reload } =
    useSharedList("agents", [], { active: tabActive });
  const [cat, setCat] = useState("全部");
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [legacyMigrated, setLegacyMigrated] = useState(false);

  useEffect(() => {
    if (!tabActive || loading || legacyMigrated) return;
    const legacy = readLegacyAgents();
    if (!legacy?.length) {
      setLegacyMigrated(true);
      return;
    }
    if (!agents.length) {
      persistAgents(legacy);
      clearLegacyAgentsStorage();
    }
    setLegacyMigrated(true);
  }, [tabActive, loading, legacyMigrated, agents.length, persistAgents]);

  const setAgents = (updater) => {
    const next = typeof updater === "function" ? updater(agents) : updater;
    persistAgents(next);
  };

  const persistEdit = () => {
    if (!editingId) return;
    const url = editUrl.trim();
    const name = editName.trim() || "未命名智能体";
    const desc = editDesc.trim();
    const category = detectCategory(url);

    setAgents(prev => prev.map(a => a.id === editingId
      ? { ...a, name, url, desc, category, icon: CATEGORY_ICONS[category] || "🧠" }
      : a));
  };

  const startEdit = (agent) => {
    setEditingId(agent.id);
    setEditName(agent.name || "");
    setEditUrl(agent.url || "");
    setEditDesc(agent.desc || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditUrl("");
    setEditDesc("");
  };

  const saveEdit = () => {
    persistEdit();
    cancelEdit();
  };

  const saveEditAndOpen = () => {
    const url = editUrl.trim();
    if (!url || !editingId) return;
    persistEdit();
    cancelEdit();
    openAgentUrl(url);
  };

  const handleAgentClick = (agent) => {
    if (editingId) return;
    if (agent.url) {
      openAgentUrl(agent.url);
      return;
    }
    startEdit(agent);
  };

  const addAgent = () => {
    const agent = {
      id: "agent-" + Date.now(),
      name: "新智能体",
      url: "",
      desc: "",
      category: "其他",
      icon: "🧠",
    };
    setAgents(prev => [...prev, agent]);
    startEdit(agent);
  };

  const duplicateAgent = (agent) => {
    const copy = {
      ...agent,
      id: "agent-" + Date.now(),
      name: (agent.name || "智能体") + " 副本",
    };
    setAgents(prev => [...prev, copy]);
  };

  const deleteAgent = (agent) => {
    if (!window.confirm(`确定删除「${agent.name}」？`)) return;
    if (editingId === agent.id) cancelEdit();
    setAgents(prev => prev.filter(a => a.id !== agent.id));
  };

  let list = agents;
  if (cat !== "全部") list = list.filter(a => a.category === cat);
  if (q.trim()) {
    const s = q.trim().toLowerCase();
    list = list.filter(a =>
      (a.name || "").toLowerCase().includes(s) ||
      (a.desc || "").toLowerCase().includes(s) ||
      (a.url || "").toLowerCase().includes(s)
    );
  }

  return (
    <div>
      <SharedMetaLine meta={meta} loading={loading} error={error} onReload={reload} />
      <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索智能体…" style={{ ...inpSm, flex: 1, minWidth: 140, maxWidth: 220 }} />
        <button type="button" onClick={addAgent} style={{ background: "#2d7dd2", color: "#fff", border: "none", borderRadius: 20, padding: "4px 14px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>+ 添加智能体</button>
        {AGENT_CATEGORIES.map(c => (
          <button key={c} type="button" onClick={() => setCat(c)} style={{ background: cat === c ? "#2d7dd2" : "var(--card)", color: cat === c ? "#fff" : "var(--tm)", border: `1px solid ${cat === c ? "#2d7dd2" : "var(--border)"}`, borderRadius: 20, padding: "4px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{c}</button>
        ))}
      </div>

      {list.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
          {list.map(a => (
            <AgentCard
              key={a.id}
              agent={a}
              isEditing={editingId === a.id}
              editName={editName}
              editUrl={editUrl}
              editDesc={editDesc}
              onOpen={handleAgentClick}
              onStartEdit={startEdit}
              onEditNameChange={setEditName}
              onEditUrlChange={setEditUrl}
              onEditDescChange={setEditDesc}
              onEditSave={saveEdit}
              onEditSaveAndOpen={saveEditAndOpen}
              onEditCancel={cancelEdit}
              onDuplicate={duplicateAgent}
              onDelete={deleteAgent}
            />
          ))}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--tm)", fontSize: 13 }}>
          {agents.length ? "没有匹配的智能体" : "还没有智能体，点击「+ 添加智能体」开始添加 GPTs 或 Gems 链接"}
        </div>
      )}

      <div style={{ marginTop: "1.5rem", padding: "10px 14px", borderRadius: 10, background: "var(--bg)", border: "1px dashed var(--border)", fontSize: 11, color: "var(--tm)", lineHeight: 1.6 }}>
        粘贴 ChatGPT GPTs 或 Google Gems 分享链接，点击卡片即可在新窗口打开；添加后全公司电脑自动同步。<br />
        链接会自动识别类型（GPTs / Gems）；✎ 编辑名称与链接，⧉ 复制，× 删除。
      </div>
    </div>
  );
}

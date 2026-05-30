// Shared helpers (TODAY, fmtD, Avatar, …) come from LogisticsModule.browser.jsx loaded first.

// ─── TOOLS MODULE ──────────────────────────────────────────────────────
// 新窗口：url/openUrl  |  可换链：configurableUrl: true  |  内嵌：target: "inline"  |  组件：component
// runtime: "local" = 本机 Windows 工具（云端仅下载，不在服务器执行）
const TOOL_CATALOG = [
  { id: "fba-profit", name: "FBA 利润计算器", desc: "全链路利润：体积重、尺寸分档、头程 / 佣金 / 退货", icon: "💰", category: "FBA", openUrl: "fba-profit-calculator.html" },
  { id: "fba-warehouse", name: "FBA 分仓工具", desc: "美国货运参谋：分仓方案、头程与仓储费用测算", icon: "📦", category: "FBA", openUrl: "fba-warehouse-tool.html" },
  { id: "amazon-tracker", name: "亚马逊推广追踪", desc: "精铺/精品 · 月度规划 · 投入产出分析", icon: "📦", category: "运营", url: "https://guangdongperfect2024-ctrl.github.io/amazon-tracker/" },
  { id: "online-doc", name: "在线文档", desc: "金山 / 钉钉 / 飞书等在线文档，链接可随时更换", icon: "📄", category: "运营", configurableUrl: true, defaultUrl: "https://www.kdocs.cn/l/cuP9MuR9zUkN?R=L1MvMTE=" },
  { id: "mailwatch", name: "MailWatch 邮件分析", desc: "一键打开：未运行时自动启动服务，再在新窗口打开界面", icon: "📧", category: "运营", runtime: "local", autoLaunch: true, defaultUrl: "http://127.0.0.1:8000", openUrl: "tools/mailwatch/index.html" },
  { id: "disk-cleaner", name: "C 盘垃圾清理", desc: "扫描并清理 2345 / 360 / 鲁大师等残留；保护 QQ、微信、百度网盘、WPS", icon: "🧹", category: "系统", runtime: "local", target: "inline", openUrl: "tools/disk-cleaner/index.html", downloadUrl: "packages/disk-cleaner-win.zip" },
];

const loadCustomUrls = () => {
  const saved = {};
  for (const t of TOOL_CATALOG) {
    if (!t.configurableUrl) continue;
    try {
      const v = localStorage.getItem(URL_STORAGE_PREFIX + t.id);
      if (v) saved[t.id] = v;
    } catch { /* ignore */ }
  }
  return saved;
};

const loadCustomNames = () => {
  const saved = {};
  for (const t of TOOL_CATALOG) {
    if (!t.configurableUrl) continue;
    try {
      const v = localStorage.getItem(NAME_STORAGE_PREFIX + t.id);
      if (v) saved[t.id] = v;
    } catch { /* ignore */ }
  }
  return saved;
};

const TOOL_CATEGORIES = ["全部", ...new Set(TOOL_CATALOG.map(t => t.category))];

const lblSm = { display: "block", fontSize: 10, color: "var(--tm)", marginBottom: 3 };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function openMailWatch(appUrl = "http://127.0.0.1:8000") {
  let target = appUrl;
  try {
    const statusRes = await fetch("/api/mailwatch/status");
    if (statusRes.ok) {
      const status = await statusRes.json();
      if (status.appUrl) target = status.appUrl;
      if (!status.running) {
        await fetch("/api/mailwatch/launch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start" }),
        });
        for (let i = 0; i < 20; i++) {
          await sleep(1500);
          const next = await fetch("/api/mailwatch/status").then(r => r.json()).catch(() => null);
          if (next?.running) break;
        }
      }
    }
  } catch { /* 非 run.bat 环境：直接尝试打开 */ }
  window.open(target, "_blank", "noopener,noreferrer");
}

function ToolCard({ tool, displayName, resolvedUrl, isEditing, editName, editUrl, onOpen, onStartEdit, onEditNameChange, onEditUrlChange, onEditSave, onEditSaveAndOpen, onEditCancel }) {
  const href = resolvedUrl ?? toolUrl(tool);
  const inline = tool.target === "inline";
  const configurable = !!tool.configurableUrl;

  const stop = (e) => e.stopPropagation();

  return (
    <div
      onClick={() => { if (!isEditing) onOpen(tool); }}
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
      <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{tool.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
          <span
            onClick={e => { if (configurable && !isEditing) { stop(e); onStartEdit(tool); } }}
            title={configurable ? "点击编辑名称与链接" : undefined}
            style={{ fontSize: 14, fontWeight: 600, cursor: configurable && !isEditing ? "text" : undefined }}
          >
            {displayName}
          </span>
          <span style={badge("#f3f4f6", "#666")}>{tool.category}</span>
          {tool.runtime === "local" && <span style={badge("#fce4ec", "#c62828")}>本机工具</span>}
          {configurable && <span style={badge("#fff3e0", "#e65100")}>可编辑</span>}
          {href && inline && <span style={badge("#e8f5e9", "#2e7d32")}>内嵌</span>}
          {href && !inline && !configurable && <span style={badge("#dceeff", "#1a4e8a")}>新窗口</span>}
          {configurable && !isEditing && <span style={badge("#dceeff", "#1a4e8a")}>新窗口</span>}
          {isEditing && <span style={badge("#dceeff", "#1a4e8a")}>编辑中</span>}
        </div>
        <div style={{ fontSize: 12, color: "var(--tm)", lineHeight: 1.5 }}>{tool.desc}</div>

        {configurable && isEditing && (
          <div style={{ marginTop: 10 }} onClick={stop}>
            <label style={lblSm}>显示名称</label>
            <input
              value={editName}
              onChange={e => onEditNameChange(e.target.value)}
              placeholder="如：美工图需、运营表格…"
              style={{ ...inp, fontSize: 12, marginBottom: 8 }}
              autoFocus
            />
            <label style={lblSm}>文档链接</label>
            <input
              value={editUrl}
              onChange={e => onEditUrlChange(e.target.value)}
              placeholder="粘贴金山 / 钉钉 / 飞书链接…"
              style={{ ...inp, fontSize: 12, marginBottom: 8 }}
              onKeyDown={e => {
                if (e.key === "Enter") onEditSave();
                if (e.key === "Escape") onEditCancel();
              }}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" onClick={onEditSave} style={{ background: "#2d7dd2", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", color: "#fff" }}>保存</button>
              <button type="button" onClick={onEditCancel} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", color: "var(--tm)" }}>取消</button>
              {editUrl.trim() && (
                <button type="button" onClick={e => { stop(e); onEditSaveAndOpen(); }} style={{ marginLeft: "auto", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", color: "#2d7dd2" }}>保存并打开 ↗</button>
              )}
            </div>
          </div>
        )}

        {configurable && !isEditing && (
          <div
            role="button"
            tabIndex={0}
            title="点击编辑链接"
            onClick={e => { stop(e); onStartEdit(tool); }}
            onKeyDown={e => { if (e.key === "Enter") { stop(e); onStartEdit(tool); } }}
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
              cursor: "text",
            }}
          >
            {href || "尚未设置链接，点击此处添加"}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {configurable && !isEditing && (
          <button
            type="button"
            title="编辑名称与链接"
            onClick={e => { stop(e); onStartEdit(tool); }}
            style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, width: 28, height: 28, fontSize: 13, cursor: "pointer", color: "#2d7dd2", fontFamily: "inherit", lineHeight: 1 }}
          >
            ✎
          </button>
        )}
        {!isEditing && <span style={{ fontSize: 12, color: "var(--tm)" }}>{inline ? "→" : "↗"}</span>}
      </div>
    </div>
  );
}

export function ToolsPanel() {
  const [customUrls, setCustomUrls] = useState(loadCustomUrls);
  const [customNames, setCustomNames] = useState(loadCustomNames);
  const [inlineTool, setInlineTool] = useState(null);
  const [active, setActive] = useState(null);
  const [cat, setCat] = useState("全部");
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editUrl, setEditUrl] = useState("");
  const [editName, setEditName] = useState("");

  const tool = TOOL_CATALOG.find(t => t.id === active);
  const ActiveComponent = tool?.component;

  const persistEdit = () => {
    if (!editingId) return;
    const catalog = TOOL_CATALOG.find(t => t.id === editingId);
    const url = editUrl.trim();
    const name = editName.trim();
    try {
      if (url) localStorage.setItem(URL_STORAGE_PREFIX + editingId, url);
      else localStorage.removeItem(URL_STORAGE_PREFIX + editingId);
      if (name && name !== catalog?.name) localStorage.setItem(NAME_STORAGE_PREFIX + editingId, name);
      else localStorage.removeItem(NAME_STORAGE_PREFIX + editingId);
    } catch { /* ignore */ }
    setCustomUrls(prev => {
      const next = { ...prev };
      if (url) next[editingId] = url;
      else delete next[editingId];
      return next;
    });
    setCustomNames(prev => {
      const next = { ...prev };
      if (name && name !== catalog?.name) next[editingId] = name;
      else delete next[editingId];
      return next;
    });
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditUrl(customUrls[t.id] || t.defaultUrl || "");
    setEditName(customNames[t.id] || t.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditUrl("");
    setEditName("");
  };

  const saveEdit = () => {
    persistEdit();
    setEditingId(null);
    setEditUrl("");
    setEditName("");
  };

  const saveEditAndOpen = () => {
    const url = editUrl.trim();
    if (!url || !editingId) return;
    persistEdit();
    setEditingId(null);
    setEditUrl("");
    setEditName("");
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleToolClick = (t) => {
    if (editingId) return;
    if (t.autoLaunch) {
      openMailWatch(t.defaultUrl || toolUrl(t, customUrls));
      return;
    }
    const url = toolUrl(t, customUrls);
    if (t.target === "inline" && url) {
      setInlineTool({ ...t, _resolvedUrl: url });
      return;
    }
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    if (t.configurableUrl) {
      startEdit(t);
      return;
    }
    setActive(t.id);
  };

  let list = TOOL_CATALOG;
  if (cat !== "全部") list = list.filter(t => t.category === cat);
  if (q.trim()) {
    const s = q.trim().toLowerCase();
    list = list.filter(t => {
      const dn = toolDisplayName(t, customNames).toLowerCase();
      return dn.includes(s) || t.name.toLowerCase().includes(s) || t.desc.toLowerCase().includes(s);
    });
  }

  if (inlineTool) {
    const url = inlineTool._resolvedUrl || toolUrl(inlineTool, customUrls);
    return (
      <div style={{ position: "relative", height: "calc(100vh - 120px)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexShrink: 0 }}>
          <button type="button" onClick={() => setInlineTool(null)} style={{ background: "transparent", border: "none", color: "#2d7dd2", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>← 返回工具列表</button>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{inlineTool.icon} {inlineTool.name}</span>
        </div>
        <iframe src={url} title={inlineTool.name} style={{ flex: 1, width: "100%", minHeight: 0, border: "none", borderRadius: 8, background: "#fff" }} />
      </div>
    );
  }

  if (tool && ActiveComponent) {
    return (
      <div>
        <button type="button" onClick={() => setActive(null)} style={{ background: "transparent", border: "none", color: "#2d7dd2", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: "1rem", padding: 0 }}>← 返回工具列表</button>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "1.25rem 1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem", paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 26 }}>{tool.icon}</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{tool.name}</div>
              <div style={{ fontSize: 12, color: "var(--tm)", marginTop: 2 }}>{tool.desc}</div>
            </div>
          </div>
          <ActiveComponent />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索工具…" style={{ ...inpSm, flex: 1, minWidth: 140, maxWidth: 220 }} />
        {TOOL_CATEGORIES.map(c => (
          <button key={c} type="button" onClick={() => setCat(c)} style={{ background: cat === c ? "#2d7dd2" : "var(--card)", color: cat === c ? "#fff" : "var(--tm)", border: `1px solid ${cat === c ? "#2d7dd2" : "var(--border)"}`, borderRadius: 20, padding: "4px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{c}</button>
        ))}
      </div>
      {list.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
          {list.map(t => (
            <ToolCard
              key={t.id}
              tool={t}
              displayName={toolDisplayName(t, customNames)}
              resolvedUrl={toolUrl(t, customUrls)}
              isEditing={editingId === t.id}
              editName={editName}
              editUrl={editUrl}
              onOpen={handleToolClick}
              onStartEdit={startEdit}
              onEditNameChange={setEditName}
              onEditUrlChange={setEditUrl}
              onEditSave={saveEdit}
              onEditSaveAndOpen={saveEditAndOpen}
              onEditCancel={cancelEdit}
            />
          ))}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--tm)", fontSize: 13 }}>没有匹配的工具</div>
      )}
      <div style={{ marginTop: "1.5rem", padding: "10px 14px", borderRadius: 10, background: "var(--bg)", border: "1px dashed var(--border)", fontSize: 11, color: "var(--tm)", lineHeight: 1.6 }}>
        「在线文档」可改显示名称（如「美工图需」）和链接，点标题或 ✎ 编辑，保存后本机记住。<br />
        「MailWatch 邮件分析」点击即可：未运行时会自动启动，然后打开新窗口（路径 D:\Projects\mailwatch）。<br />
        「C 盘垃圾清理」标记为本机工具：云端门户提供下载包，须在员工 Windows 电脑上运行。
      </div>
    </div>
  );
}

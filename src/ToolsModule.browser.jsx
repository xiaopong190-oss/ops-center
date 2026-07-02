// Shared helpers (TODAY, fmtD, Avatar, …) come from LogisticsModule.browser.jsx loaded first.

// ─── TOOLS MODULE ──────────────────────────────────────────────────────
// 新窗口：url/openUrl  |  可换链：configurableUrl: true  |  内嵌：target: "inline"  |  组件：component
// runtime: "local" = 本机 Windows 工具（云端仅下载，不在服务器执行）

const URL_STORAGE_PREFIX = "ops-center-tool-url-";
const NAME_STORAGE_PREFIX = "ops-center-tool-name-";
const ONLINE_DOCS_KEY = "ops-center-online-docs";

const DEFAULT_ONLINE_DOC = {
  id: "online-doc-default",
  name: "在线文档",
  url: "https://www.kdocs.cn/l/cuP9MuR9zUkN?R=L1MvMTE=",
  desc: "金山 / 钉钉 / 飞书等在线文档，链接可随时更换",
  icon: "📄",
};

const DEFAULT_ONLINE_DOCS = [DEFAULT_ONLINE_DOC];

/** 仅用于从旧版 localStorage 一次性迁移 */
function readLegacyOnlineDocs() {
  try {
    const raw = localStorage.getItem(ONLINE_DOCS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch { /* ignore */ }
  const legacyUrl = localStorage.getItem(URL_STORAGE_PREFIX + "online-doc");
  const legacyName = localStorage.getItem(NAME_STORAGE_PREFIX + "online-doc");
  if (legacyUrl || legacyName) {
    return [{
      ...DEFAULT_ONLINE_DOC,
      name: legacyName || DEFAULT_ONLINE_DOC.name,
      url: legacyUrl || DEFAULT_ONLINE_DOC.url,
    }];
  }
  return null;
}

function clearLegacyOnlineDocsStorage() {
  try {
    localStorage.removeItem(ONLINE_DOCS_KEY);
    localStorage.removeItem(URL_STORAGE_PREFIX + "online-doc");
    localStorage.removeItem(NAME_STORAGE_PREFIX + "online-doc");
  } catch { /* ignore */ }
}

const onlineDocToTool = (doc) => ({
  id: doc.id,
  name: doc.name || "在线文档",
  desc: doc.desc || DEFAULT_ONLINE_DOC.desc,
  icon: doc.icon || "📄",
  category: "运营",
  configurableUrl: true,
  defaultUrl: doc.url || "",
  isOnlineDoc: true,
});

const toolUrl = (tool, customUrls = {}) => {
  if (tool.isOnlineDoc) return tool.defaultUrl || "";
  if (tool.configurableUrl) return customUrls[tool.id] || tool.defaultUrl || "";
  return tool.url || tool.openUrl;
};

const toolDisplayName = (tool, customNames = {}) => {
  if (tool.isOnlineDoc) return tool.name;
  return (tool.configurableUrl && customNames[tool.id]) ? customNames[tool.id] : tool.name;
};

const resolveToolUrl = (url) => {
  if (!url) return "";
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
};

const openToolUrl = (url) => {
  const target = resolveToolUrl(url);
  if (!target) return false;
  window.open(target, "_blank", "noopener,noreferrer");
  return true;
};

const downloadToolPackage = (tool) => {
  const url = resolveToolUrl(tool.downloadUrl);
  if (!url) return false;
  const a = document.createElement("a");
  a.href = url;
  a.download = tool.downloadName || "";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
};

const UNIT_CATALOG = {
  mass: {
    label: "质量",
    base: "kg",
    groups: [
      { name: "公制", units: [
        { id: "t", name: "吨", sym: "t", factor: 1000 },
        { id: "kg", name: "千克", sym: "kg", factor: 1 },
        { id: "g", name: "克", sym: "g", factor: 0.001 },
        { id: "mg", name: "毫克", sym: "mg", factor: 1e-6 },
      ]},
      { name: "英制", units: [
        { id: "lb", name: "磅", sym: "lb", factor: 0.45359237 },
        { id: "oz", name: "盎司", sym: "oz", factor: 0.028349523125 },
      ]},
    ],
    defaults: { left: "kg", right: "lb", leftVal: "1" },
  },
  length: {
    label: "长度",
    base: "m",
    groups: [
      { name: "公制", units: [
        { id: "km", name: "千米", sym: "km", factor: 1000 },
        { id: "m", name: "米", sym: "m", factor: 1 },
        { id: "cm", name: "厘米", sym: "cm", factor: 0.01 },
        { id: "mm", name: "毫米", sym: "mm", factor: 0.001 },
      ]},
      { name: "英制", units: [
        { id: "mile", name: "英里", sym: "mi", factor: 1609.344 },
        { id: "ft", name: "英尺", sym: "ft", factor: 0.3048 },
        { id: "in", name: "英寸", sym: "in", factor: 0.0254 },
      ]},
    ],
    defaults: { left: "m", right: "cm", leftVal: "1" },
  },
};

const allUnits = (cat) => UNIT_CATALOG[cat].groups.flatMap(g => g.units);
const findUnit = (cat, id) => allUnits(cat).find(u => u.id === id);

const fmtConvNum = (n, summary = false) => {
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  if (summary) {
    if (abs >= 100) return Number(n.toFixed(2)).toString();
    if (abs >= 1) return Number(n.toFixed(4)).toString();
    return Number(n.toPrecision(4)).toString();
  }
  if (abs === 0) return "0";
  if (abs >= 10000) return Number(n.toFixed(2)).toString();
  if (abs >= 1) return Number(n.toFixed(6)).toString();
  if (abs >= 0.0001) return Number(n.toPrecision(8)).toString();
  return n.toExponential(4);
};

const convert = (val, fromId, toId, cat) => {
  const from = findUnit(cat, fromId);
  const to = findUnit(cat, toId);
  if (!from || !to) return "";
  const n = parseFloat(val);
  if (val.trim() === "" || !Number.isFinite(n)) return "";
  return fmtConvNum(n * from.factor / to.factor);
};

const unitLabel = (u) => u ? `${u.name}(${u.sym})` : "";

function UnitPicker({ cat, selected, onSelect, onClose }) {
  const cfg = UNIT_CATALOG[cat];
  return (
    <div style={{ marginTop: 10, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--card)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        {cfg.groups.map(g => (
          <div key={g.name} style={{ padding: "10px 12px", borderRight: g.name === cfg.groups[0]?.name ? "1px solid var(--border)" : "none" }}>
            <div style={{ fontSize: 11, color: "var(--tm)", marginBottom: 8, fontWeight: 600 }}>{g.name}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {g.units.map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { onSelect(u.id); onClose(); }}
                  style={{
                    textAlign: "left",
                    background: selected === u.id ? "rgba(45,125,210,0.12)" : "transparent",
                    color: selected === u.id ? "#2d7dd2" : "var(--text)",
                    border: "none",
                    borderRadius: 6,
                    padding: "7px 10px",
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontWeight: selected === u.id ? 600 : 400,
                  }}
                >
                  {unitLabel(u)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UnitConverterTool() {
  const [cat, setCat] = useState("mass");
  const [leftUnit, setLeftUnit] = useState("kg");
  const [rightUnit, setRightUnit] = useState("lb");
  const [leftVal, setLeftVal] = useState("1");
  const [rightVal, setRightVal] = useState("2.2046");
  const [picker, setPicker] = useState(null);

  const applyDefaults = (nextCat) => {
    const d = UNIT_CATALOG[nextCat].defaults;
    setLeftUnit(d.left);
    setRightUnit(d.right);
    setLeftVal(d.leftVal);
    setRightVal(convert(d.leftVal, d.left, d.right, nextCat));
    setPicker(null);
  };

  const switchCat = (nextCat) => {
    setCat(nextCat);
    applyDefaults(nextCat);
  };

  const onLeftVal = (v) => {
    setLeftVal(v);
    setRightVal(convert(v, leftUnit, rightUnit, cat));
  };

  const onRightVal = (v) => {
    setRightVal(v);
    setLeftVal(convert(v, rightUnit, leftUnit, cat));
  };

  const onLeftUnit = (id) => {
    setLeftUnit(id);
    setRightVal(convert(leftVal, id, rightUnit, cat));
  };

  const onRightUnit = (id) => {
    setRightUnit(id);
    setRightVal(convert(leftVal, leftUnit, id, cat));
  };

  const swap = () => {
    setLeftUnit(rightUnit);
    setRightUnit(leftUnit);
    setLeftVal(rightVal);
    setRightVal(leftVal);
    setPicker(null);
  };

  const leftU = findUnit(cat, leftUnit);
  const rightU = findUnit(cat, rightUnit);
  const ratio = leftU && rightU ? leftU.factor / rightU.factor : 0;
  const summary = ratio
    ? `1${leftU.name}=${fmtConvNum(ratio, true)}${rightU.name}`
    : "";

  const boxStyle = {
    flex: 1,
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    background: "var(--bg)",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
        {Object.entries(UNIT_CATALOG).map(([key, cfg]) => (
          <button
            key={key}
            type="button"
            onClick={() => switchCat(key)}
            style={{
              background: cat === key ? "var(--card)" : "transparent",
              color: cat === key ? "#2d7dd2" : "var(--tm)",
              border: "none",
              borderBottom: cat === key ? "2px solid #2d7dd2" : "2px solid transparent",
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: cat === key ? 600 : 400,
              cursor: "pointer",
              fontFamily: "inherit",
              marginBottom: -1,
            }}
          >
            {cfg.label}
          </button>
        ))}
      </div>

      {summary && (
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, letterSpacing: "-0.02em" }}>
          {summary}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "stretch", gap: 10, marginBottom: picker ? 0 : 8 }}>
        <div style={boxStyle}>
          <input
            type="text"
            inputMode="decimal"
            value={leftVal}
            onChange={e => onLeftVal(e.target.value)}
            style={{
              width: "100%",
              border: "none",
              background: "transparent",
              fontSize: 28,
              fontWeight: 600,
              padding: "16px 14px 8px",
              fontFamily: "inherit",
              color: "var(--text)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            type="button"
            onClick={() => setPicker(picker === "left" ? null : "left")}
            style={{
              width: "100%",
              border: "none",
              borderTop: "1px solid var(--border)",
              background: picker === "left" ? "rgba(45,125,210,0.08)" : "var(--card)",
              padding: "10px 14px",
              fontSize: 13,
              color: picker === "left" ? "#2d7dd2" : "var(--text)",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{unitLabel(leftU)}</span>
            <span style={{ fontSize: 10, color: "var(--tm)" }}>{picker === "left" ? "▲" : "▼"}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={swap}
          title="互换单位与数值"
          style={{
            alignSelf: "center",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            width: 44,
            height: 44,
            fontSize: 20,
            cursor: "pointer",
            color: "#2d7dd2",
            fontFamily: "inherit",
            flexShrink: 0,
          }}
        >
          ⇄
        </button>

        <div style={boxStyle}>
          <input
            type="text"
            inputMode="decimal"
            value={rightVal}
            onChange={e => onRightVal(e.target.value)}
            style={{
              width: "100%",
              border: "none",
              background: "transparent",
              fontSize: 28,
              fontWeight: 600,
              padding: "16px 14px 8px",
              fontFamily: "inherit",
              color: "var(--text)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            type="button"
            onClick={() => setPicker(picker === "right" ? null : "right")}
            style={{
              width: "100%",
              border: "none",
              borderTop: "1px solid var(--border)",
              background: picker === "right" ? "rgba(45,125,210,0.08)" : "var(--card)",
              padding: "10px 14px",
              fontSize: 13,
              color: picker === "right" ? "#2d7dd2" : "var(--text)",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{unitLabel(rightU)}</span>
            <span style={{ fontSize: 10, color: "var(--tm)" }}>{picker === "right" ? "▲" : "▼"}</span>
          </button>
        </div>
      </div>

      {picker && (
        <UnitPicker
          cat={cat}
          selected={picker === "left" ? leftUnit : rightUnit}
          onSelect={picker === "left" ? onLeftUnit : onRightUnit}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

const TOOL_CATALOG = [
  { id: "weight-converter", name: "单位换算", desc: "质量与长度实时换算，支持多单位切换", icon: "⚖️", category: "常用", component: UnitConverterTool },
  { id: "fba-profit", name: "FBA 利润计算器", desc: "全链路利润：体积重、尺寸分档、头程 / 佣金 / 退货", icon: "💰", category: "FBA", openUrl: "fba-profit-calculator.html" },
  { id: "fba-warehouse", name: "FBA 分仓工具", desc: "美国货运参谋：分仓方案、头程与仓储费用测算", icon: "📦", category: "FBA", openUrl: "fba-warehouse-tool.html" },
  { id: "fba-hanhai", name: "FBA → 瀚海万博转换", desc: "批量上传 FBA 原厂包装 CSV，转换为瀚海万博 B2B 单票导入模版 (.xls) 并打包下载", icon: "🚢", category: "物流", target: "inline", openUrl: "tools/fba-hanhai-converter/index.html" },
  { id: "amazon-tracker", name: "亚马逊推广追踪", desc: "精铺/精品 · 月度规划 · 投入产出分析", icon: "📦", category: "运营", url: "https://xiaopong190-oss.github.io/ops-center/tools/amazon-tracker/" },
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

function ToolCard({ tool, displayName, resolvedUrl, isEditing, editName, editUrl, onOpen, onStartEdit, onEditNameChange, onEditUrlChange, onEditSave, onEditSaveAndOpen, onEditCancel, onDuplicate, onDelete }) {
  const href = resolvedUrl ?? toolUrl(tool);
  const inline = tool.target === "inline";
  const configurable = !!tool.configurableUrl;
  const isOnlineDoc = !!tool.isOnlineDoc;

  const stop = (e) => e.stopPropagation();

  const openHref = (e) => {
    stop(e);
    if (href) openToolUrl(href);
    else onStartEdit(tool);
  };

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
            onClick={openHref}
            title={configurable ? (href ? "点击打开文档" : "点击设置链接") : undefined}
            style={{ fontSize: 14, fontWeight: 600, cursor: configurable && !isEditing ? "pointer" : undefined }}
          >
            {displayName}
          </span>
          <span style={badge("#f3f4f6", "#666")}>{tool.category}</span>
          {tool.runtime === "local" && <span style={badge("#fce4ec", "#c62828")}>本机工具</span>}
          {tool.intranetOnly && <span style={badge("#fff3e0", "#e65100")}>仅内网</span>}
          {tool.downloadUrl && !isLocalOpsServer() && <span style={badge("#e8eaf6", "#3949ab")}>下载</span>}
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
            title={href ? "点击打开链接" : "点击设置链接"}
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
              cursor: "text",
            }}
          >
            {href || "尚未设置链接，点击此处添加"}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {configurable && !isEditing && (
          <>
            <button
              type="button"
              title="编辑名称与链接"
              onClick={e => { stop(e); onStartEdit(tool); }}
              style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, width: 28, height: 28, fontSize: 13, cursor: "pointer", color: "#2d7dd2", fontFamily: "inherit", lineHeight: 1 }}
            >
              ✎
            </button>
            {isOnlineDoc && onDuplicate && (
              <button
                type="button"
                title="复制一份"
                onClick={e => { stop(e); onDuplicate(tool); }}
                style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, width: 28, height: 28, fontSize: 12, cursor: "pointer", color: "#2e7d32", fontFamily: "inherit", lineHeight: 1 }}
              >
                ⧉
              </button>
            )}
            {isOnlineDoc && onDelete && (
              <button
                type="button"
                title="删除此文档"
                onClick={e => { stop(e); onDelete(tool); }}
                style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, width: 28, height: 28, fontSize: 12, cursor: "pointer", color: "#c62828", fontFamily: "inherit", lineHeight: 1 }}
              >
                ×
              </button>
            )}
          </>
        )}
        {!isEditing && <span style={{ fontSize: 12, color: "var(--tm)" }}>{inline ? "→" : "↗"}</span>}
      </div>
    </div>
  );
}

function ToolsPanel({ active: tabActive = true }) {
  const { items: onlineDocs, meta: docsMeta, loading: docsLoading, saving: docsSaving, error: docsError, persist: persistOnlineDocs, reload: reloadDocs } =
    useSharedList("tools-links", DEFAULT_ONLINE_DOCS, { active: tabActive });
  const [customUrls, setCustomUrls] = useState(loadCustomUrls);
  const [customNames, setCustomNames] = useState(loadCustomNames);
  const [inlineTool, setInlineTool] = useState(null);
  const [active, setActive] = useState(null);
  const [cat, setCat] = useState("全部");
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editUrl, setEditUrl] = useState("");
  const [editName, setEditName] = useState("");
  const [legacyMigrated, setLegacyMigrated] = useState(false);

  useEffect(() => {
    if (!tabActive || docsLoading || legacyMigrated) return;
    const legacy = readLegacyOnlineDocs();
    if (!legacy?.length) {
      setLegacyMigrated(true);
      return;
    }
    const cloudEmpty = onlineDocs.length <= 1
      && !(onlineDocs[0]?.url && onlineDocs[0].url !== DEFAULT_ONLINE_DOC.url);
    if (cloudEmpty || docsMeta?._showingDemo) {
      persistOnlineDocs(legacy);
      clearLegacyOnlineDocsStorage();
    }
    setLegacyMigrated(true);
  }, [tabActive, docsLoading, legacyMigrated, onlineDocs, docsMeta, persistOnlineDocs]);

  const setOnlineDocs = (updater) => {
    const next = typeof updater === "function" ? updater(onlineDocs) : updater;
    persistOnlineDocs(next);
  };

  const onlineDocTools = onlineDocs.map(onlineDocToTool);
  const allTools = [...onlineDocTools, ...TOOL_CATALOG];

  const tool = allTools.find(t => t.id === active);
  const ActiveComponent = tool?.component;
  const editingTool = allTools.find(t => t.id === editingId);

  const persistEdit = () => {
    if (!editingId) return;
    const url = editUrl.trim();
    const name = editName.trim();

    if (editingTool?.isOnlineDoc) {
      setOnlineDocs(prev => prev.map(d => d.id === editingId
        ? { ...d, name: name || "在线文档", url }
        : d));
      setEditingId(null);
      setEditUrl("");
      setEditName("");
      return;
    }

    const catalog = TOOL_CATALOG.find(t => t.id === editingId);
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
    if (t.isOnlineDoc) {
      setEditUrl(t.defaultUrl || "");
      setEditName(t.name || "在线文档");
      return;
    }
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
    window.open(resolveToolUrl(url), "_blank", "noopener,noreferrer");
  };

  const handleToolClick = (t) => {
    if (editingId) return;
    if (t.downloadUrl && !isLocalOpsServer()) {
      downloadToolPackage(t);
      return;
    }
    const url = toolUrl(t, customUrls);
    if (t.target === "inline" && url) {
      setInlineTool({ ...t, _resolvedUrl: resolveToolUrl(url) });
      return;
    }
    if (url) {
      openToolUrl(url);
      return;
    }
    if (t.configurableUrl) {
      startEdit(t);
      return;
    }
    setActive(t.id);
  };

  const duplicateOnlineDoc = (tool) => {
    const source = onlineDocs.find(d => d.id === tool.id);
    if (!source) return;
    const copy = {
      ...source,
      id: "online-doc-" + Date.now(),
      name: (source.name || "在线文档") + " 副本",
    };
    setOnlineDocs(prev => [...prev, copy]);
  };

  const addOnlineDoc = () => {
    const doc = {
      id: "online-doc-" + Date.now(),
      name: "新在线文档",
      url: "",
      desc: DEFAULT_ONLINE_DOC.desc,
      icon: "📄",
    };
    setOnlineDocs(prev => [...prev, doc]);
    startEdit(onlineDocToTool(doc));
  };

  const deleteOnlineDoc = (tool) => {
    if (onlineDocs.length <= 1) {
      window.alert("至少保留一个在线文档");
      return;
    }
    if (!confirmDeleteWarning(tool.name, "在线文档")) return;
    if (editingId === tool.id) cancelEdit();
    setOnlineDocs(prev => prev.filter(d => d.id !== tool.id));
  };

  let list = allTools;
  if (cat !== "全部") list = list.filter(t => t.category === cat);
  if (q.trim()) {
    const s = q.trim().toLowerCase();
    list = list.filter(t => {
      const dn = toolDisplayName(t, customNames).toLowerCase();
      return dn.includes(s) || t.name.toLowerCase().includes(s) || t.desc.toLowerCase().includes(s);
    });
  }

  useCloudSyncPage(tabActive, {
    label: "工具",
    save: async () => persistOnlineDocs(onlineDocs),
    reload: reloadDocs,
    meta: docsMeta,
    loading: docsLoading,
    saving: docsSaving,
    error: docsError,
    isDirty: editingId !== null,
    dirtyHint: "在线文档编辑未保存",
  });

  if (inlineTool) {
    const url = resolveToolUrl(inlineTool._resolvedUrl || toolUrl(inlineTool, customUrls));
    return (
      <div style={{ position: "relative", height: "calc(100vh - 120px)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexShrink: 0 }}>
          <button type="button" onClick={() => setInlineTool(null)} style={{ background: "transparent", border: "none", color: "#2d7dd2", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>← 返回工具列表</button>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{inlineTool.icon} {inlineTool.name}</span>
          {inlineTool.intranetOnly && <span style={badge("#fff3e0", "#e65100")}>仅内网</span>}
        </div>
        {inlineTool.intranetOnly && (
          <div style={{ fontSize: 11, color: "#e65100", marginBottom: 8, flexShrink: 0 }}>
            此工具仅在公司内网可用，外网或 GitHub Pages 无法访问爬虫服务。
          </div>
        )}
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
        <button type="button" onClick={addOnlineDoc} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 20, padding: "4px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", color: "#2d7dd2" }}>+ 添加在线文档</button>
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
              onDuplicate={duplicateOnlineDoc}
              onDelete={deleteOnlineDoc}
            />
          ))}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--tm)", fontSize: 13 }}>没有匹配的工具</div>
      )}
      <div style={{ marginTop: "1.5rem", padding: "10px 14px", borderRadius: 10, background: "var(--bg)", border: "1px dashed var(--border)", fontSize: 11, color: "var(--tm)", lineHeight: 1.6 }}>
        「在线文档」可添加多个：点「+ 添加在线文档」或右侧 ⧉ 复制；✎ 改名称/链接，× 删除。
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from "react";
import { LogisticsPanel } from "./LogisticsModule.jsx";
import { ProductionPanel } from "./ProductionModule.jsx";
import { ToolsPanel } from "./ToolsModule.jsx";
import { AgentsPanel } from "./AgentsModule.jsx";
import { HomePanel } from "./HomeModule.jsx";
import { GlobalSettingsModal, OwnerField, useGlobalConfig, getStaffRole, RoleBadge, getStaffNames } from "./GlobalConfig.jsx";
import { UserContext } from "./context/UserContext.jsx";
import { getCurrentUser, setCurrentUser, useSharedList, SharedMetaLine } from "./utils/storage.js";

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const fmtD = (d) => { if (!d) return "—"; const p = d.split("-"); return p[1] + "/" + p[2]; };
const daysDiff = (due) => { if (!due) return null; const d = new Date(due); d.setHours(0, 0, 0, 0); return Math.round((d - TODAY) / 86400000); };

const badge = (bg, color, extra = {}) => ({ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: bg, color, fontWeight: 500, whiteSpace: "nowrap", ...extra });
const lbl = { display: "block", fontSize: 11, color: "var(--tm)", marginBottom: 3, fontWeight: 500 };
const inp = { width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", background: "transparent", color: "inherit", display: "block" };
const inpSm = { fontSize: 12, padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 6, fontFamily: "inherit", background: "transparent", color: "inherit" };

const AVATAR_PALETTE = [["#dbeafe", "#1e3a8a"], ["#d1fae5", "#065f46"], ["#fef3c7", "#78350f"], ["#ede9fe", "#4c1d95"], ["#fce7f3", "#831843"], ["#fee2e2", "#7f1d1d"], ["#d1fae5", "#064e3b"], ["#fef9c3", "#713f12"]];
const strHash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % AVATAR_PALETTE.length; return h; };
const Avatar = ({ name, size = 24 }) => {
  const [bg, tx] = AVATAR_PALETTE[strHash(name || "?")];
  return (<div style={{ width: size, height: size, borderRadius: "50%", background: bg, color: tx, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.42, fontWeight: 700, flexShrink: 0 }}>{(name || "?").slice(0, 1)}</div>);
};

// ─── TASK MODULE ──────────────────────────────────────────────────────
const NODE_STATUSES = [
  { val: "done", label: "完成", dot: "#2d9e52", color: "#1a6b35" }, { val: "current", label: "进行中", dot: "#2d7dd2", color: "#1a4e8a" },
  { val: "blocked", label: "受阻", dot: "#e09000", color: "#7a4a00" }, { val: "todo", label: "待开始", dot: "#bbb", color: "#666" },
];
const nsMeta = (v) => NODE_STATUSES.find(x => x.val === v) || NODE_STATUSES[3];
const CAT_COLORS = { 设计: { bg: "#ede9fe", c: "#4c1d95" }, 研发: { bg: "#fef3c7", c: "#78350f" }, 运营: { bg: "#dbeafe", c: "#1e3a8a" }, 品牌: { bg: "#fce7f3", c: "#831843" } };
const taskStatusOf = (t) => { if (t.actual) return "done"; if (t.nodes && t.nodes.some(n => n.status === "blocked")) return "blocked"; const d = daysDiff(t.due); if (d === null) return "inprog"; if (d < 0) return "over"; return "inprog"; };
const taskIsOverdue = (t) => !t.actual && daysDiff(t.due) !== null && daysDiff(t.due) < 0;
const getProgress = (nodes) => { if (!nodes || !nodes.length) return 0; return Math.round(nodes.filter(n => n.status === "done").length / nodes.length * 100); };

const INIT_TASKS = [
  { id: 1, task: "FB100/101/200/201欧规样品制作", owner: "杨工", cat: "设计", due: "2026-06-20", actual: "", nodes: [{ name: "FB100", status: "done" }, { name: "FB101", status: "done" }, { name: "FB200", status: "current" }, { name: "FB201", status: "todo" }], block: "FB200模具待供应商确认" },
  { id: 2, task: "43条链接图设计排期", owner: "杨工", cat: "设计", due: "2026-06-05", actual: "", nodes: [{ name: "排期制定", status: "done" }, { name: "初稿输出", status: "current" }, { name: "审核", status: "todo" }, { name: "提交", status: "todo" }], block: "" },
  { id: 3, task: "FB300多士炉图片", owner: "黄工", cat: "运营", due: "2026-05-28", actual: "", nodes: [{ name: "拍摄", status: "done" }, { name: "修图", status: "blocked" }, { name: "上架", status: "todo" }], block: "修图师生病，预计延迟3天" },
  { id: 4, task: "FB102感温变色图档样品", owner: "李工", cat: "研发", due: "2026-06-15", actual: "", nodes: [{ name: "工艺确认", status: "blocked" }, { name: "图档", status: "todo" }, { name: "打样", status: "todo" }, { name: "确样", status: "todo" }], block: "油墨供应商报价超预期40%，等待决策" },
  { id: 5, task: "FB400豆浆机功能测试", owner: "张工", cat: "研发", due: "2026-06-10", actual: "2026-05-25", nodes: [{ name: "温度测试", status: "done" }, { name: "闪光测试", status: "done" }, { name: "整机", status: "done" }], block: "" },
  { id: 6, task: "FB欧洲德法品牌注册", owner: "王律师", cat: "品牌", due: "2026-06-15", actual: "", nodes: [{ name: "材料准备", status: "done" }, { name: "德国提交", status: "current" }, { name: "法国提交", status: "todo" }, { name: "回执", status: "todo" }], block: "" },
];

function NodeRow({ node, onChange, onRemove }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}>
      <input value={node.name} onChange={e => onChange({ ...node, name: e.target.value })} placeholder="节点名称" style={{ ...inpSm, flex: 1 }} />
      <select value={node.status} onChange={e => onChange({ ...node, status: e.target.value })} style={{ ...inpSm, width: 86, background: "var(--card)" }}>
        {NODE_STATUSES.map(s => <option key={s.val} value={s.val}>{s.label}</option>)}
      </select>
      <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 18, padding: "0 3px" }}>×</button>
    </div>
  );
}

function TaskModal({ task, tasks, onSave, onClose, onDelete }) {
  const [form, setForm] = useState(task);
  const [nodes, setNodes] = useState(task.nodes ? task.nodes.map(n => ({ ...n })) : []);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "2rem 1rem", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "1.5rem", width: "100%", maxWidth: 480, color: "var(--text)" }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: "1rem" }}>{task.id ? "编辑任务" : "新建任务"}</div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>任务内容</label><textarea value={form.task} onChange={e => set("task", e.target.value)} placeholder="描述任务…" style={{ ...inp, height: 52, resize: "none" }} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>负责人</label>
            <OwnerField listId="task-owner" value={form.owner} onChange={v => set("owner", v)} extraOwners={tasks.map(t => t.owner)} inputStyle={inp} />
          </div>
          <div><label style={lbl}>分类</label>
            <select value={form.cat} onChange={e => set("cat", e.target.value)} style={{ ...inp, background: "var(--card)" }}>
              {["设计", "研发", "运营", "品牌"].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div><label style={lbl}>预计完成</label><input type="date" value={form.due} onChange={e => set("due", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>实际完成</label><input type="date" value={form.actual} onChange={e => set("actual", e.target.value)} style={inp} /></div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tm)", borderTop: "1px solid var(--border)", paddingTop: 10, marginBottom: 8 }}>任务节点</div>
        {nodes.map((n, i) => <NodeRow key={i} node={n} onChange={v => { const a = [...nodes]; a[i] = v; setNodes(a); }} onRemove={() => setNodes(nodes.filter((_, j) => j !== i))} />)}
        <button onClick={() => setNodes([...nodes, { name: "", status: "todo" }])} style={{ width: "100%", border: "1px dashed var(--border)", borderRadius: 8, padding: "5px 0", fontSize: 12, cursor: "pointer", color: "var(--tm)", background: "transparent", marginBottom: 12, fontFamily: "inherit" }}>+ 添加节点</button>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tm)", borderTop: "1px solid var(--border)", paddingTop: 10, marginBottom: 8 }}>卡点说明</div>
        <textarea value={form.block} onChange={e => set("block", e.target.value)} placeholder="等待什么？谁决策？预计何时解决？" style={{ ...inp, height: 48, resize: "none", marginBottom: 12 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          {task.id ? <button onClick={onDelete} style={{ background: "none", border: "none", color: "#e55", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>删除</button> : <div />}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "var(--tm)" }}>取消</button>
            <button onClick={() => { if (!form.task.trim()) return; onSave({ ...form, nodes: nodes.filter(n => n.name.trim()) }); }} style={{ background: "#2d7dd2", color: "#fff", border: "none", borderRadius: 8, padding: "6px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskCard({ task, onClick }) {
  const st = taskStatusOf(task);
  const prog = getProgress(task.nodes);
  const cc = CAT_COLORS[task.cat] || { bg: "#f0f0f0", c: "#555" };
  const d = daysDiff(task.due);
  const bc = st === "over" ? "#e55" : st === "blocked" ? "#e09000" : st === "done" ? "#2d9e52" : "#2d7dd2";
  let due = null;
  if (task.actual) due = <span style={badge("#d4f0dc", "#1a6b35")}>✓ {fmtD(task.actual)}</span>;
  else if (task.due) { if (taskIsOverdue(task)) due = <span style={badge("#fee2e2", "#b91c1c")}>逾期{Math.abs(d)}天</span>; else due = <span style={badge("#f3f4f6", "#666")}>📅{fmtD(task.due)}</span>; }
  const role = getStaffRole(task.owner);
  return (
    <div onClick={onClick} style={{ background: "var(--card)", border: "1px solid var(--border)", borderLeft: `3px solid ${bc}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)"} onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: st === "done" ? "var(--tm)" : "var(--text)", textDecoration: st === "done" ? "line-through" : "none" }}>{task.task}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <Avatar name={task.owner} />
          <span style={{ fontSize: 11, color: "var(--tm)" }}>{task.owner}</span>
          <RoleBadge role={role} />
        </div>
      </div>
      {task.nodes && task.nodes.length > 0 && (
        <>
          <div style={{ height: 3, background: "var(--border)", borderRadius: 2, marginBottom: 7, overflow: "hidden" }}><div style={{ height: "100%", width: `${prog}%`, background: bc, borderRadius: 2 }} /></div>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0, marginBottom: 7 }}>
            {task.nodes.map((n, i) => { const nm = nsMeta(n.status); const ic = n.status === "current"; return (<span key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: ic ? 10 : 8, height: ic ? 10 : 8, borderRadius: "50%", background: nm.dot, outline: ic ? `2px solid ${nm.dot}` : "none", outlineOffset: 2, display: "inline-block", flexShrink: 0 }} /><span style={{ fontSize: 11, color: ic ? nm.color : "var(--tm)", fontWeight: ic ? 600 : 400 }}>{n.name}</span>{i < task.nodes.length - 1 && <span style={{ fontSize: 10, color: "var(--tm)", margin: "0 3px" }}>→</span>}</span>); })}
          </div>
        </>
      )}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
        <span style={badge(cc.bg, cc.c)}>{task.cat}</span>{due}{prog > 0 && prog < 100 && <span style={badge("#f3f4f6", "#666")}>{prog}%</span>}
      </div>
      {task.block && <div style={{ marginTop: 8, padding: "6px 10px", background: "#fff8e6", color: "#7a4a00", borderRadius: 7, fontSize: 11, lineHeight: 1.5, borderLeft: "3px solid #e09000" }}>⚡ {task.block}</div>}
    </div>
  );
}

function TasksPanel() {
  const { items: tasks, meta, persist } = useSharedList("tasks", INIT_TASKS);
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const nextId = () => Math.max(0, ...tasks.map(t => t.id || 0)) + 1;
  const counts = { all: tasks.length, over: tasks.filter(taskIsOverdue).length, blocked: tasks.filter(t => taskStatusOf(t) === "blocked").length, inprog: tasks.filter(t => taskStatusOf(t) === "inprog").length, done: tasks.filter(t => taskStatusOf(t) === "done").length };
  const sortO = { over: 0, blocked: 1, inprog: 2, done: 3 };
  let vis = filter === "all" ? tasks : filter === "over" ? tasks.filter(taskIsOverdue) : tasks.filter(t => taskStatusOf(t) === filter);
  vis = [...vis].sort((a, b) => (sortO[taskStatusOf(a)] || 2) - (sortO[taskStatusOf(b)] || 2));
  const save = (t) => {
    if (t.id) persist(tasks.map(x => x.id === t.id ? t : x));
    else persist([...tasks, { ...t, id: nextId() }]);
    setModal(null);
  };
  const tabs = [{ key: "all", label: "全部", nc: "var(--text)" }, { key: "over", label: "逾期", nc: "#e55" }, { key: "blocked", label: "受阻", nc: "#c07000" }, { key: "inprog", label: "进行中", nc: "#2d7dd2" }, { key: "done", label: "已完成", nc: "#2d9e52" }];
  return (
    <div>
      <SharedMetaLine meta={meta} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 7, flex: 1, marginRight: 12 }}>
          {tabs.map(f => <div key={f.key} onClick={() => setFilter(f.key)} style={{ background: "var(--card)", border: `1px solid ${filter === f.key ? "#2d7dd2" : "var(--border)"}`, borderRadius: 10, padding: "9px 10px", cursor: "pointer" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: f.nc }}>{counts[f.key]}</div>
            <div style={{ fontSize: 10, color: "var(--tm)", marginTop: 1 }}>{f.label}</div>
          </div>)}
        </div>
        <button onClick={() => setModal({ task: "", owner: "", cat: "设计", due: "", actual: "", nodes: [], block: "" })} style={{ background: "#2d7dd2", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, flexShrink: 0 }}>+ 新建</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {vis.length ? vis.map(t => <TaskCard key={t.id} task={t} onClick={() => setModal({ ...t, nodes: t.nodes ? t.nodes.map(n => ({ ...n })) : [] })} />) : <div style={{ textAlign: "center", padding: "2rem", color: "var(--tm)", fontSize: 13 }}>暂无任务</div>}
      </div>
      {modal && <TaskModal task={modal} tasks={tasks} onSave={save} onClose={() => setModal(null)} onDelete={() => { persist(tasks.filter(x => x.id !== modal.id)); setModal(null); }} />}
    </div>
  );
}

const TABS = [{ key: "home", label: "首页" }, { key: "tasks", label: "任务跟进" }, { key: "logistics", label: "物流头程" }, { key: "production", label: "精品生产" }, { key: "tools", label: "工具" }, { key: "agents", label: "AI 智能体" }];

function BrandLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden style={{ flexShrink: 0, display: "block" }}>
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#1a1d24" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
      <text x="16" y="22" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="700" fontFamily="'PingFang SC','Microsoft YaHei',system-ui,sans-serif">H</text>
    </svg>
  );
}

const SETTINGS_MENU_ITEMS = [{ key: "staff", label: "全局员工名单" }];

function SettingsMenu({ onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);
  const pick = (key) => { setOpen(false); onSelect(key); };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} title="设置" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", color: "var(--tm)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
        ⚙ 设置 <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", minWidth: 148, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 50 }}>
          {SETTINGS_MENU_ITEMS.map(item => (
            <button key={item.key} type="button" onClick={() => pick(item.key)} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: 7, padding: "8px 12px", fontSize: 12, cursor: "pointer", color: "var(--text)", fontFamily: "inherit" }} onMouseEnter={e => e.currentTarget.style.background = "var(--bg)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const APP_ORG_NAME = "泓森拓创科技";
const APP_PASSWORD = "X888888";
const AUTH_SESSION_KEY = "ops-center-auth";

function readAuthSession() {
  try {
    return sessionStorage.getItem(AUTH_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function LoginScreen({ onSuccess }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (password === APP_PASSWORD) {
      setCurrentUser({ id: APP_ORG_NAME, name: APP_ORG_NAME });
      try { sessionStorage.setItem(AUTH_SESSION_KEY, "1"); } catch { /* ignore */ }
      onSuccess();
      return;
    }
    setError("密码错误，请重试");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f6", color: "#111", fontFamily: "'PingFang SC','Microsoft YaHei',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 360, background: "#fff", border: "1px solid #e5e5e5", borderRadius: 16, padding: "1.75rem 1.5rem", boxShadow: "0 12px 40px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{APP_ORG_NAME}</div>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 18, lineHeight: 1.55 }}>请输入团队访问密码后进入运营中心</div>
        <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 6, fontWeight: 500 }}>访问密码</label>
        <input
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); if (error) setError(""); }}
          placeholder="请输入密码"
          autoFocus
          style={{ width: "100%", fontSize: 14, padding: "10px 12px", border: `1px solid ${error ? "#e57373" : "#e5e5e5"}`, borderRadius: 10, fontFamily: "inherit", marginBottom: error ? 8 : 16 }}
        />
        {error && <div style={{ fontSize: 12, color: "#c62828", marginBottom: 12 }}>{error}</div>}
        <button type="submit" style={{ width: "100%", background: "#2d7dd2", border: "none", borderRadius: 10, padding: "10px 14px", fontSize: 14, cursor: "pointer", fontFamily: "inherit", color: "#fff", fontWeight: 600 }}>进入</button>
      </form>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(readAuthSession);
  const [currentUser, setCurrentUserState] = useState(() => getCurrentUser());
  const [tab, setTab] = useState("home");
  const [dark, setDark] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState(null);
  const { version: configVersion } = useGlobalConfig();
  const css = { "--bg": dark ? "#111" : "#f8f8f6", "--card": dark ? "#1c1c1c" : "#fff", "--border": dark ? "#2a2a2a" : "#e5e5e5", "--text": dark ? "#eee" : "#111", "--tm": dark ? "#777" : "#888" };
  if (!authed) {
    return <LoginScreen onSuccess={() => { setCurrentUserState(getCurrentUser()); setAuthed(true); }} />;
  }
  return (
    <UserContext.Provider value={currentUser}>
    <div style={{ ...css, minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "'PingFang SC','Microsoft YaHei',sans-serif" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "1.5rem 1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>
            <BrandLogo />
            泓森拓创科技
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <SettingsMenu onSelect={key => { if (key === "staff") setSettingsPanel("staff"); }} />
            <button onClick={() => setDark(!dark)} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", color: "var(--tm)", fontFamily: "inherit" }}>{dark ? "☀ 日间" : "☾ 夜间"}</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, marginBottom: "1.5rem", borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
          {TABS.map(t => (<button key={t.key} onClick={() => setTab(t.key)} style={{ background: "transparent", border: "none", borderBottom: tab === t.key ? "2px solid #2d7dd2" : "2px solid transparent", padding: "8px 18px", fontSize: 13, fontWeight: tab === t.key ? 600 : 400, color: tab === t.key ? "#2d7dd2" : "var(--tm)", cursor: "pointer", fontFamily: "inherit", marginBottom: -1 }}>{t.label}</button>))}
        </div>
        {tab === "home" && <HomePanel userId={currentUser.id} />}
        {tab === "tasks" && <TasksPanel key={configVersion} />}
        {tab === "logistics" && <LogisticsPanel key={configVersion} />}
        {tab === "production" && <ProductionPanel key={configVersion} />}
        {tab === "tools" && <ToolsPanel />}
        {tab === "agents" && <AgentsPanel />}
      </div>
      {settingsPanel === "staff" && <GlobalSettingsModal onClose={() => setSettingsPanel(null)} onSaved={() => setSettingsPanel(null)} />}
    </div>
    </UserContext.Provider>
  );
}


// LogisticsModule.browser.jsx loads storage + GlobalConfig first.

// ─── TASK MODULE ──────────────────────────────────────────────────────
const NODE_STATUSES = [
  { val: "done", label: "完成", dot: "#2d9e52", color: "#1a6b35" }, { val: "current", label: "进行中", dot: "#2d7dd2", color: "#1a4e8a" },
  { val: "blocked", label: "受阻", dot: "#e09000", color: "#7a4a00" }, { val: "todo", label: "待开始", dot: "#bbb", color: "#666" },
];
const nsMeta = (v) => NODE_STATUSES.find(x => x.val === v) || NODE_STATUSES[3];
/** 旧任务分类 → 全局角色 */
const TASK_CAT_LEGACY_MAP = { 研发: "开发", 品牌: "管理" };

function normalizeTaskCat(cat) {
  if (!cat) return STAFF_ROLE_OPTIONS[0] || "运营";
  return TASK_CAT_LEGACY_MAP[cat] || cat;
}

function taskCatBadge(cat) {
  const role = normalizeTaskCat(cat);
  const c = ROLE_COLORS[role];
  return c ? { bg: c.bg, c: c.color } : { bg: "#f3f4f6", c: "#666" };
}

function taskCatOptions(current) {
  const opts = [...STAFF_ROLE_OPTIONS];
  const norm = normalizeTaskCat(current);
  if (norm && !opts.includes(norm)) opts.push(norm);
  if (current && current !== norm && !opts.includes(current)) opts.push(current);
  return opts;
}

const DEFAULT_TASK_CAT = STAFF_ROLE_OPTIONS[0] || "运营";
const taskStatusOf = (t) => { if (t.actual) return "done"; if (t.nodes && t.nodes.some(n => n.status === "blocked")) return "blocked"; const d = daysDiff(t.due); if (d === null) return "inprog"; if (d < 0) return "over"; return "inprog"; };
const taskIsOverdue = (t) => !t.actual && daysDiff(t.due) !== null && daysDiff(t.due) < 0;
const getProgress = (nodes) => { if (!nodes || !nodes.length) return 0; return Math.round(nodes.filter(n => n.status === "done").length / nodes.length * 100); };

const INIT_TASKS = [
  { id: 1, task: "FB100/101/200/201欧规样品制作", owner: "张工", cat: "设计", due: "2026-06-20", actual: "", nodes: [{ name: "FB100", status: "done" }, { name: "FB101", status: "done" }, { name: "FB200", status: "current" }, { name: "FB201", status: "todo" }], block: "FB200模具待供应商确认" },
  { id: 2, task: "43条链接图设计排期", owner: "张工", cat: "设计", due: "2026-06-05", actual: "", nodes: [{ name: "排期制定", status: "done" }, { name: "初稿输出", status: "current" }, { name: "审核", status: "todo" }, { name: "提交", status: "todo" }], block: "" },
  { id: 3, task: "FB300多士炉图片", owner: "杨彬", cat: "运营", due: "2026-05-28", actual: "", nodes: [{ name: "拍摄", status: "done" }, { name: "修图", status: "blocked" }, { name: "上架", status: "todo" }], block: "修图师生病，预计延迟3天" },
  { id: 4, task: "FB102感温变色图档样品", owner: "张工", cat: "开发", due: "2026-06-15", actual: "", nodes: [{ name: "工艺确认", status: "blocked" }, { name: "图档", status: "todo" }, { name: "打样", status: "todo" }, { name: "确样", status: "todo" }], block: "油墨供应商报价超预期40%，等待决策" },
  { id: 5, task: "FB400豆浆机功能测试", owner: "张工", cat: "开发", due: "2026-06-10", actual: "2026-05-25", nodes: [{ name: "温度测试", status: "done" }, { name: "闪光测试", status: "done" }, { name: "整机", status: "done" }], block: "" },
  { id: 6, task: "FB欧洲德法品牌注册", owner: "王律师", cat: "管理", due: "2026-06-15", actual: "", nodes: [{ name: "材料准备", status: "done" }, { name: "德国提交", status: "current" }, { name: "法国提交", status: "todo" }, { name: "回执", status: "todo" }], block: "" },
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
            <OwnerField value={form.owner} onChange={v => set("owner", v)} inputStyle={inp} />
          </div>
          <div><label style={lbl}>分类（角色）</label>
            <select value={normalizeTaskCat(form.cat)} onChange={e => set("cat", e.target.value)} style={{ ...inp, background: "var(--card)" }}>
              {taskCatOptions(form.cat).map(c => <option key={c} value={c}>{c}</option>)}
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
  const cc = taskCatBadge(task.cat);
  const catLabel = normalizeTaskCat(task.cat);
  const d = daysDiff(task.due);
  const bc = st === "over" ? "#e55" : st === "blocked" ? "#e09000" : st === "done" ? "#2d9e52" : "#2d7dd2";
  let due = null;
  if (task.actual) due = <span style={badge("#d4f0dc", "#1a6b35")}>✓ {fmtD(task.actual)}</span>;
  else if (task.due) { if (taskIsOverdue(task)) due = <span style={badge("#fee2e2", "#b91c1c")}>逾期{Math.abs(d)}天</span>; else due = <span style={badge("#f3f4f6", "#666")}>📅{fmtD(task.due)}</span>; }
  const role = getStaffRole(task.owner);
  return (
    <div onClick={onClick} className="ops-card ops-card-hover ops-card-padded" style={{ borderLeft: `3px solid ${bc}`, borderRadius: 10 }}>
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
        <span style={badge(cc.bg, cc.c)}>{catLabel}</span>{due}{prog > 0 && prog < 100 && <span style={badge("#f3f4f6", "#666")}>{prog}%</span>}
      </div>
      {task.block && <div style={{ marginTop: 8, padding: "6px 10px", background: "#fff8e6", color: "#7a4a00", borderRadius: 7, fontSize: 11, lineHeight: 1.5, borderLeft: "3px solid #e09000" }}>⚡ {task.block}</div>}
    </div>
  );
}

function TasksPanel({ active = true }) {
  const { items: tasks, meta, loading, saving, error, persist, reload } = useSharedList("tasks", INIT_TASKS, { active });
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const nextId = () => Math.max(0, ...tasks.map(t => t.id || 0)) + 1;
  const counts = { all: tasks.length, over: tasks.filter(taskIsOverdue).length, blocked: tasks.filter(t => taskStatusOf(t) === "blocked").length, inprog: tasks.filter(t => taskStatusOf(t) === "inprog").length, done: tasks.filter(t => taskStatusOf(t) === "done").length };
  const sortO = { over: 0, blocked: 1, inprog: 2, done: 3 };
  let vis = filter === "all" ? tasks : filter === "over" ? tasks.filter(taskIsOverdue) : tasks.filter(t => taskStatusOf(t) === filter);
  vis = [...vis].sort((a, b) => (sortO[taskStatusOf(a)] || 2) - (sortO[taskStatusOf(b)] || 2));
  const save = (t) => {
    const row = { ...t, cat: normalizeTaskCat(t.cat) };
    if (row.id) persist(tasks.map(x => x.id === row.id ? row : x));
    else persist([...tasks, { ...row, id: nextId() }]);
    setModal(null);
  };
  const tabs = [{ key: "all", label: "全部", nc: "var(--text)" }, { key: "over", label: "逾期", nc: "#e55" }, { key: "blocked", label: "受阻", nc: "#c07000" }, { key: "inprog", label: "进行中", nc: "#2d7dd2" }, { key: "done", label: "已完成", nc: "#2d9e52" }];
  useCloudSyncPage(active, {
    label: "任务",
    save: async () => persist(tasks),
    reload,
    meta,
    loading,
    saving,
    error,
    isDirty: !!modal,
    dirtyHint: "任务编辑弹窗未保存",
  });
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, flex: 1, marginRight: 12 }}>
          {tabs.map(f => <div key={f.key} onClick={() => setFilter(f.key)} className={`ops-metric-card ops-card-hover${filter === f.key ? "" : ""}`} style={{ borderColor: filter === f.key ? "#4080FF" : "var(--border)", boxShadow: filter === f.key ? "0 0 0 1px #4080FF" : undefined }}>
            <div className="ops-metric-value" style={{ fontSize: 20, color: f.nc }}>{counts[f.key]}</div>
            <div className="ops-metric-label" style={{ marginTop: 2, marginBottom: 0 }}>{f.label}</div>
          </div>)}
        </div>
        <button onClick={() => setModal({ task: "", owner: "", cat: DEFAULT_TASK_CAT, due: "", actual: "", nodes: [], block: "" })} className="ops-btn ops-btn-primary" style={{ flexShrink: 0 }}>+ 新建</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {vis.length ? vis.map(t => <TaskCard key={t.id} task={t} onClick={() => setModal({ ...t, nodes: t.nodes ? t.nodes.map(n => ({ ...n })) : [] })} />) : <div style={{ textAlign: "center", padding: "2rem", color: "var(--tm)", fontSize: 13 }}>暂无任务</div>}
      </div>
      {modal && <TaskModal task={modal} tasks={tasks} onSave={save} onClose={() => {
        if (!window.confirm("弹窗未点「保存」，修改不会上传。确定关闭？")) return;
        setModal(null);
      }} onDelete={() => { persist(tasks.filter(x => x.id !== modal.id), { replace: true }); setModal(null); }} />}
    </div>
  );
}

const TABS = [
  { key: "home", label: "首页", icon: "home" },
  { key: "tasks", label: "任务跟进", icon: "tasks" },
  { key: "logistics", label: "物流头程", icon: "logistics" },
  { key: "production", label: "精品生产", icon: "production" },
  { key: "kpi", label: "考核", icon: "kpi" },
  { key: "tools", label: "工具", icon: "tools" },
  { key: "agents", label: "AI 智能体", icon: "agents" },
  { key: "knowledge", label: "知识库", icon: "knowledge" },
  { key: "keywords", label: "关键词库", icon: "keywords" },
];

const TAB_TITLES = Object.fromEntries(TABS.map(t => [t.key, t.label]));

function NavIcon({ name }) {
  const s = { width: 18, height: 18, stroke: "currentColor", fill: "none", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  if (name === "home") return <svg viewBox="0 0 24 24" style={s}><path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z" /></svg>;
  if (name === "tasks") return <svg viewBox="0 0 24 24" style={s}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 10h8M8 14h5" /></svg>;
  if (name === "logistics") return <svg viewBox="0 0 24 24" style={s}><rect x="1" y="6" width="15" height="10" rx="1" /><path d="M16 9h4l3 4v3h-7V9z" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></svg>;
  if (name === "production") return <svg viewBox="0 0 24 24" style={s}><path d="M2 20h20M5 20V10l7-6 7 6v10" /><path d="M9 20v-5h6v5" /></svg>;
  if (name === "kpi") return <svg viewBox="0 0 24 24" style={s}><path d="M4 19V5M4 19h16" /><path d="M8 15l3-4 3 2 5-7" /></svg>;
  if (name === "tools") return <svg viewBox="0 0 24 24" style={s}><path d="M14.7 6.3a4 4 0 105.4 5.4L12 20l-3-3 7.7-10.7z" /></svg>;
  if (name === "agents") return <svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>;
  if (name === "knowledge") return <svg viewBox="0 0 24 24" style={s}><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg>;
  if (name === "keywords") return <svg viewBox="0 0 24 24" style={s}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /><path d="M8 11h6M11 8v6" /></svg>;
  return null;
}

function BrandLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden style={{ flexShrink: 0, display: "block" }}>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#4080FF" />
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
      <button type="button" className="ops-btn" onClick={() => setOpen(o => !o)} aria-expanded={open} title="设置">
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
const APP_BUILD = "cloud-37-depth";
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
    <div className="ops-login-wrap">
      <form onSubmit={submit} className="ops-login-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <BrandLogo size={36} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{APP_ORG_NAME}</div>
            <div style={{ fontSize: 12, color: "var(--tm)", marginTop: 2 }}>运营中心</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--tm)", marginBottom: 18, lineHeight: 1.55 }}>请输入团队访问密码后进入</div>
        <label style={{ display: "block", fontSize: 11, color: "var(--tm)", marginBottom: 6, fontWeight: 500 }}>访问密码</label>
        <input
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); if (error) setError(""); }}
          placeholder="请输入密码"
          autoFocus
          style={{ width: "100%", fontSize: 14, padding: "10px 12px", border: `1px solid ${error ? "#F53F3F" : "var(--border)"}`, borderRadius: 10, fontFamily: "inherit", marginBottom: error ? 8 : 16, background: "var(--bg)" }}
        />
        {error && <div style={{ fontSize: 12, color: "#F53F3F", marginBottom: 12 }}>{error}</div>}
        <button type="submit" className="ops-btn ops-btn-primary" style={{ width: "100%", padding: "10px 14px", fontSize: 14, justifyContent: "center" }}>进入运营中心</button>
      </form>
    </div>
  );
}

function AppShell({ tab, setTab, dark, setDark, settingsPanel, setSettingsPanel }) {
  const confirmLeave = useConfirmLeave();
  const trySetTab = (key) => {
    if (key === tab) return;
    if (!confirmLeave()) return;
    setTab(key);
  };
  const css = {
    "--bg": dark ? "#0d0d0d" : "#F4F7FE",
    "--card": dark ? "#1a1a1a" : "#FFFFFF",
    "--border": dark ? "rgba(255,255,255,0.08)" : "rgba(163,174,208,0.18)",
    "--border-light": dark ? "rgba(255,255,255,0.05)" : "rgba(163,174,208,0.12)",
    "--text": dark ? "#e8e8e8" : "#1B2559",
    "--tm": dark ? "#888" : "#A3AED0",
    "--primary": "#4318FF",
    "--primary-light": dark ? "#1a2a4a" : "#E9E3FF",
    "--shadow-card": dark ? "0 4px 18px rgba(0,0,0,0.35)" : "0 4px 18px rgba(112,144,176,0.12), 0 1px 3px rgba(112,144,176,0.06)",
    "--shadow-md": dark ? "0 8px 24px rgba(0,0,0,0.45)" : "0 8px 24px rgba(112,144,176,0.14)",
  };
  return (
    <div className={`ops-app${dark ? " ops-theme-dark" : " ops-theme-light"}`} style={css}>
      <aside className="ops-sidebar">
        <div className="ops-sidebar-brand">
          <BrandLogo size={32} />
          <div>
            <div className="ops-sidebar-brand-text">泓森拓创科技</div>
            <span className="ops-badge ops-badge-sidebar" style={{ marginTop: 4 }}>{APP_BUILD}</span>
          </div>
        </div>
        <nav className="ops-sidebar-nav">
          {TABS.map(t => (
            <div key={t.key} className="ops-nav-item-wrap">
              <button type="button" className={`ops-nav-item${tab === t.key ? " active" : ""}`} onClick={() => trySetTab(t.key)}>
                <span className="ops-nav-icon"><NavIcon name={t.icon} /></span>
                {t.label}
              </button>
            </div>
          ))}
        </nav>
        <div className="ops-sidebar-footer">运营中心 · 云端同步</div>
      </aside>

      <div className="ops-main">
        <header className="ops-topbar">
          <div className="ops-topbar-title">{TAB_TITLES[tab] || "运营中心"}</div>
          <div className="ops-topbar-actions">
            <SettingsMenu onSelect={key => { if (key === "staff") setSettingsPanel("staff"); }} />
            <button type="button" className="ops-btn" onClick={() => setDark(!dark)}>{dark ? "☀ 日间" : "☾ 夜间"}</button>
          </div>
        </header>

        <main className="ops-content" style={{ maxWidth: tab === "kpi" || tab === "knowledge" || tab === "keywords" ? 1280 : 960 }}>
          <GlobalCloudBar />
          <div style={{ display: tab === "home" ? "block" : "none" }}><HomePanel /></div>
          <div style={{ display: tab === "tasks" ? "block" : "none" }}><TasksPanel active={tab === "tasks"} /></div>
          <div style={{ display: tab === "logistics" ? "block" : "none" }}><LogisticsPanel active={tab === "logistics"} /></div>
          <div style={{ display: tab === "production" ? "block" : "none" }}><ProductionPanel active={tab === "production"} /></div>
          <div style={{ display: tab === "kpi" ? "block" : "none" }}><KpiPanel active={tab === "kpi"} /></div>
          <div style={{ display: tab === "knowledge" ? "block" : "none" }}><KnowledgePanel active={tab === "knowledge"} /></div>
          <div style={{ display: tab === "keywords" ? "block" : "none" }}><KeywordPanel active={tab === "keywords"} /></div>
          <div style={{ display: tab === "tools" ? "block" : "none" }}><ToolsPanel active={tab === "tools"} /></div>
          <div style={{ display: tab === "agents" ? "block" : "none" }}><AgentsPanel active={tab === "agents"} /></div>
        </main>
      </div>

      {settingsPanel === "staff" && <GlobalSettingsModal onClose={() => setSettingsPanel(null)} onSaved={() => setSettingsPanel(null)} />}
    </div>
  );
}

function App() {
  const [authed, setAuthed] = useState(readAuthSession);
  const [currentUser, setCurrentUserState] = useState(() => getCurrentUser());
  const [tab, setTab] = useState("home");
  const [dark, setDark] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState(null);
  if (!authed) {
    return <LoginScreen onSuccess={() => { setCurrentUserState(getCurrentUser()); setAuthed(true); }} />;
  }
  return (
    <UserContext.Provider value={currentUser}>
    <CloudSyncProvider>
      <AppShell tab={tab} setTab={setTab} dark={dark} setDark={setDark} settingsPanel={settingsPanel} setSettingsPanel={setSettingsPanel} />
    </CloudSyncProvider>
    </UserContext.Provider>
  );
}

if (!window.__OPS_CENTER_MOUNTED__) {
  window.__OPS_CENTER_MOUNTED__ = true;
  const mountEl = document.getElementById("root");
  mountEl.replaceChildren();
  ReactDOM.createRoot(mountEl).render(<App />);
}

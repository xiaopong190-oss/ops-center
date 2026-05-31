// Shared helpers (TODAY, fmtD, Avatar, …) come from LogisticsModule.browser.jsx loaded first.

// ─── PRODUCTION MODULE ─────────────────────────────────────────────────
const PROD_STAGES = ["立项", "打样", "确样", "下单备料", "生产中", "QC验货", "出货", "已完成"];
const prodStageColor = (s) => ({ 已完成: "#2d9e52", 出货: "#2d9e52", QC验货: "#1a9e8a", 生产中: "#2d7dd2", 下单备料: "#7a6dd2", 确样: "#c07000", 打样: "#d85a30", 立项: "#888", 生产: "#2d7dd2" }[s] || "#888");
const QC_METHODS = ["自检", "第三方", "工厂自检"];
const QC_RESULTS = ["通过", "不通过", "有条件通过"];
const QC_STYLE = { 通过: { bg: "#d4f0dc", c: "#2d9e52" }, 不通过: { bg: "#fee2e2", c: "#e55" }, 有条件通过: { bg: "#fff0d4", c: "#e09000" } };
const EXC_PARTIES = ["工厂", "我方", "供应商", "物料"];
const isShipped = (b) => ["出货", "已完成"].includes(b.stage);
const openProdExcs = (b) => (b.exceptions || []).filter(e => !e.resolved);
const deliveryDelta = (b) => {
  if (!b.actualDelivery || !b.etaDelivery) return null;
  return Math.round((new Date(b.actualDelivery) - new Date(b.etaDelivery)) / 86400000);
};
const deliveryWarning = (b) => {
  if (isShipped(b) || b.actualDelivery) return null;
  const idx = PROD_STAGES.indexOf(b.stage);
  if (idx >= PROD_STAGES.indexOf("QC验货")) return null;
  const d = daysDiff(b.etaDelivery);
  if (d === null) return null;
  if (d < 0) return { level: "over", text: `逾期${Math.abs(d)}天` };
  if (d <= 3) return { level: "urgent", text: "紧急" };
  if (d <= 7) return { level: "soon", text: "即将到期" };
  return null;
};
const prodBatchStatus = (b) => {
  if (b.stage === "已完成") return "done";
  if (openProdExcs(b).length) return "blocked";
  const delta = deliveryDelta(b);
  if (delta !== null && delta > 0 && !isShipped(b)) return "overdue";
  const d = daysDiff(b.etaDelivery);
  if (d !== null && d < 0 && !isShipped(b)) return "overdue";
  return "inprog";
};
const isProducing = (b) => b.stage === "生产中";
const isQcStage = (b) => b.stage === "QC验货";
const normalizeStage = (s) => (s === "生产" ? "生产中" : s);

const INIT_PROD = [
  {
    id: 1, product: "FB102", name: "感温变色款", batch: "第一批", qty: "500件", owner: "李工", supplier: "东莞鑫达厂", poNumber: "PO20260401",
    orderDate: "2026-04-01", etaDelivery: "2026-06-15", actualDelivery: "", etaShip: "", actualShip: "",
    qcMethod: "第三方", qcCompany: "SGS", qcDate: "", qcResult: "", qcReportNo: "", qcNote: "",
    stage: "打样", note: "",
    exceptions: [{ desc: "感温油墨供应商报价超预期40%", date: "2026-05-20", impact: "预计延期7天", action: "等待管理层决策是否换供应商", responsible: "供应商", resolved: false, resolvedDate: "" }],
  },
  {
    id: 2, product: "FB200", name: "黑色款", batch: "第二批", qty: "300件", owner: "李工", supplier: "宁波精工", poNumber: "PO20260415",
    orderDate: "2026-04-15", etaDelivery: "2026-05-30", actualDelivery: "", etaShip: "2026-06-05", actualShip: "",
    qcMethod: "工厂自检", qcCompany: "", qcDate: "", qcResult: "", qcReportNo: "", qcNote: "",
    stage: "生产中", note: "",
    exceptions: [{ desc: "试产缩水问题", date: "2026-05-22", impact: "质量问题", action: "工厂调整模具参数，二次试产中", responsible: "工厂", resolved: false, resolvedDate: "" }],
  },
  {
    id: 3, product: "FB200", name: "黑色款", batch: "第一批", qty: "200件", owner: "李工", supplier: "宁波精工", poNumber: "PO20260301",
    orderDate: "2026-03-01", etaDelivery: "2026-04-30", actualDelivery: "2026-05-02", etaShip: "2026-05-10", actualShip: "2026-05-12",
    qcMethod: "第三方", qcCompany: "BV", qcDate: "2026-04-28", qcResult: "通过", qcReportNo: "BV20260428", qcNote: "",
    stage: "已完成", note: "",
    exceptions: [],
  },
  {
    id: 4, product: "FB400", name: "豆浆机", batch: "第一批", qty: "150件", owner: "张工", supplier: "顺德家电厂", poNumber: "PO20260420",
    orderDate: "2026-04-20", etaDelivery: "2026-06-30", actualDelivery: "", etaShip: "", actualShip: "",
    qcMethod: "自检", qcCompany: "", qcDate: "2026-05-25", qcResult: "有条件通过", qcReportNo: "QC-FB400-01", qcNote: "闪光按键需复测",
    stage: "QC验货", note: "",
    exceptions: [],
  },
  {
    id: 5, product: "FB501", name: "变体款", batch: "第一批", qty: "200件", owner: "张工", supplier: "待定点", poNumber: "",
    orderDate: "", etaDelivery: "2026-07-15", actualDelivery: "", etaShip: "", actualShip: "",
    qcMethod: "自检", qcCompany: "", qcDate: "", qcResult: "", qcReportNo: "", qcNote: "",
    stage: "立项", note: "方案讨论中",
    exceptions: [],
  },
];

function ProdExceptionEditor({ excs, setExcs }) {
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tm)", borderTop: "1px solid var(--border)", paddingTop: 10, marginBottom: 8 }}>异常记录</div>
      {excs.map((ex, i) => (
        <div key={i} style={{ background: ex.resolved ? "#f0faf4" : "#fff8e6", border: `1px solid ${ex.resolved ? "#b7e4c7" : "#ffe0a0"}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
          <input value={ex.desc} onChange={e => { const a = [...excs]; a[i] = { ...ex, desc: e.target.value }; setExcs(a); }} placeholder="异常描述" style={{ ...inpSm, width: "100%", marginBottom: 6 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
            <input type="date" value={ex.date} onChange={e => { const a = [...excs]; a[i] = { ...ex, date: e.target.value }; setExcs(a); }} style={inpSm} />
            <input value={ex.impact || ""} onChange={e => { const a = [...excs]; a[i] = { ...ex, impact: e.target.value }; setExcs(a); }} placeholder="影响（如：预计延期5天）" style={inpSm} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 6 }}>
            <input value={ex.action || ""} onChange={e => { const a = [...excs]; a[i] = { ...ex, action: e.target.value }; setExcs(a); }} placeholder="处理方式" style={inpSm} />
            <select value={ex.responsible || "工厂"} onChange={e => { const a = [...excs]; a[i] = { ...ex, responsible: e.target.value }; setExcs(a); }} style={{ ...inpSm, background: "var(--card)", width: 88 }}>{EXC_PARTIES.map(p => <option key={p}>{p}</option>)}</select>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--tm)", cursor: "pointer" }}><input type="checkbox" checked={!!ex.resolved} onChange={e => { const a = [...excs]; a[i] = { ...ex, resolved: e.target.checked }; setExcs(a); }} />已解决</label>
            {ex.resolved && <input type="date" value={ex.resolvedDate || ""} onChange={e => { const a = [...excs]; a[i] = { ...ex, resolvedDate: e.target.value }; setExcs(a); }} style={{ ...inpSm, width: 120 }} />}
            <button type="button" onClick={() => setExcs(excs.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 16, marginLeft: "auto" }}>×</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setExcs([...excs, { desc: "", date: TODAY.toISOString().split("T")[0], impact: "", action: "", responsible: "工厂", resolved: false, resolvedDate: "" }])} style={{ width: "100%", border: "1px dashed var(--border)", borderRadius: 8, padding: "5px 0", fontSize: 12, cursor: "pointer", color: "var(--tm)", background: "transparent", marginBottom: 12, fontFamily: "inherit" }}>+ 记录异常</button>
    </>
  );
}

function ProdModal({ item, ownerExtras, onSave, onClose, onDelete }) {
  const [form, setForm] = useState({ ...item, stage: normalizeStage(item.stage) });
  const [excs, setExcs] = useState(item.exceptions ? item.exceptions.map(e => ({ ...e })) : []);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const delta = deliveryDelta(form);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "2rem 1rem", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "1.5rem", width: "100%", maxWidth: 720, color: "var(--text)" }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: "1rem" }}>{item.id ? "编辑生产批次" : "新建生产批次"}</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tm)", marginBottom: 8 }}>基本信息</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>产品编号</label><input value={form.product} onChange={e => set("product", e.target.value)} placeholder="FB200" style={inp} /></div>
          <div><label style={lbl}>款式名称</label><input value={form.name} onChange={e => set("name", e.target.value)} placeholder="黑色款" style={inp} /></div>
          <div><label style={lbl}>批次</label><input value={form.batch} onChange={e => set("batch", e.target.value)} placeholder="第二批" style={inp} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>订单数量</label><input value={form.qty} onChange={e => set("qty", e.target.value)} placeholder="500件" style={inp} /></div>
          <div><label style={lbl}>跟进人</label><OwnerField listId="production-owner" value={form.owner} onChange={v => set("owner", v)} extraOwners={ownerExtras} inputStyle={inp} /></div>
          <div><label style={lbl}>供应商</label><input value={form.supplier || ""} onChange={e => set("supplier", e.target.value)} style={inp} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>合同 / PO 编号</label><input value={form.poNumber || ""} onChange={e => set("poNumber", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>当前阶段</label><select value={form.stage} onChange={e => set("stage", e.target.value)} style={{ ...inp, background: "var(--card)" }}>{PROD_STAGES.map(s => <option key={s}>{s}</option>)}</select></div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tm)", borderTop: "1px solid var(--border)", paddingTop: 10, marginBottom: 8 }}>时间节点</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>下单日期</label><input type="date" value={form.orderDate} onChange={e => set("orderDate", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>预计交期</label><input type="date" value={form.etaDelivery} onChange={e => set("etaDelivery", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>实际交期</label><input type="date" value={form.actualDelivery} onChange={e => set("actualDelivery", e.target.value)} style={inp} /></div>
        </div>
        {delta !== null && (
          <div style={{ fontSize: 11, marginBottom: 10, padding: "6px 10px", borderRadius: 8, background: delta > 0 ? "#fee2e2" : "#f0faf4", color: delta > 0 ? "#b91c1c" : "#1a6b35" }}>
            交期对比：{delta > 0 ? `晚 ${delta} 天` : delta < 0 ? `提前 ${Math.abs(delta)} 天` : "准时"}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>预计出货日</label><input type="date" value={form.etaShip || ""} onChange={e => set("etaShip", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>实际出货日</label><input type="date" value={form.actualShip || ""} onChange={e => set("actualShip", e.target.value)} style={inp} /></div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tm)", borderTop: "1px solid var(--border)", paddingTop: 10, marginBottom: 8 }}>QC 信息</div>
        <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
          {QC_METHODS.map(m => (
            <label key={m} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
              <input type="radio" name="qcMethod" checked={form.qcMethod === m} onChange={() => set("qcMethod", m)} />{m}
            </label>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          {form.qcMethod === "第三方" && <div><label style={lbl}>QC 公司</label><input value={form.qcCompany || ""} onChange={e => set("qcCompany", e.target.value)} style={inp} /></div>}
          <div><label style={lbl}>QC 日期</label><input type="date" value={form.qcDate || ""} onChange={e => set("qcDate", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>QC 结论</label><select value={form.qcResult || ""} onChange={e => set("qcResult", e.target.value)} style={{ ...inp, background: "var(--card)" }}><option value="">—</option>{QC_RESULTS.map(r => <option key={r}>{r}</option>)}</select></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>QC 报告编号</label><input value={form.qcReportNo || ""} onChange={e => set("qcReportNo", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>QC 备注</label><input value={form.qcNote || ""} onChange={e => set("qcNote", e.target.value)} style={inp} /></div>
        </div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>备注</label><input value={form.note || ""} onChange={e => set("note", e.target.value)} style={inp} /></div>
        <ProdExceptionEditor excs={excs} setExcs={setExcs} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          {item.id ? <button type="button" onClick={onDelete} style={{ background: "none", border: "none", color: "#e55", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>删除</button> : <div />}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "var(--tm)" }}>取消</button>
            <button type="button" onClick={() => { if (!form.product.trim()) return; onSave({ ...form, exceptions: excs }); }} style={{ background: "#2d7dd2", color: "#fff", border: "none", borderRadius: 8, padding: "6px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProdBatchCard({ item, onClick }) {
  const [showResolved, setShowResolved] = useState(false);
  const st = prodBatchStatus(item);
  const stage = normalizeStage(item.stage);
  const bc = st === "done" ? "#2d9e52" : st === "blocked" ? "#e09000" : st === "overdue" ? "#e55" : "#2d7dd2";
  const stageIdx = PROD_STAGES.indexOf(stage);
  const openExcs = openProdExcs(item);
  const resolvedExcs = (item.exceptions || []).filter(e => e.resolved);
  const delta = deliveryDelta(item);
  const warn = deliveryWarning(item);
  const qc = item.qcResult ? QC_STYLE[item.qcResult] : null;
  return (
    <div onClick={onClick} style={{ background: "var(--card)", border: "1px solid var(--border)", borderLeft: `3px solid ${bc}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", marginBottom: 8 }} onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)"} onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{item.batch}</span>
            {item.supplier && <span style={{ fontSize: 11, color: "var(--tm)" }}>{item.supplier}</span>}
            <span style={badge(st === "done" ? "#d4f0dc" : st === "blocked" ? "#fff0d4" : st === "overdue" ? "#fee2e2" : "#dceeff", st === "done" ? "#1a6b35" : st === "blocked" ? "#7a4a00" : st === "overdue" ? "#b91c1c" : "#1a4e8a")}>{stage}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}><Avatar name={item.owner} /><span style={{ fontSize: 11, color: "var(--tm)" }}>{item.owner}</span><RoleBadge role={getStaffRole(item.owner)} /></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "nowrap", gap: 0, marginBottom: 8, overflowX: "auto", paddingBottom: 2 }}>
        {PROD_STAGES.map((s, i) => {
          const done = i < stageIdx; const active = i === stageIdx;
          const c = active ? prodStageColor(s) : done ? "#2d9e52" : "var(--border)";
          return (<span key={s} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}><span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: active ? 10 : 7, height: active ? 10 : 7, borderRadius: "50%", background: c, outline: active ? `2px solid ${c}` : "none", outlineOffset: 2, display: "inline-block" }} /><span style={{ fontSize: 9, color: active ? "var(--text)" : done ? "var(--tm)" : "var(--border)", fontWeight: active ? 600 : 400, whiteSpace: "nowrap" }}>{s === "下单备料" ? "备料" : s === "生产中" ? "生产" : s.replace("QC验货", "QC")}</span></span>{i < PROD_STAGES.length - 1 && <span style={{ width: 10, height: 2, background: done ? "#2d9e52" : "var(--border)", margin: "0 2px" }} />}</span>);
        })}
      </div>
      <div style={{ fontSize: 11, color: "var(--tm)", display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        {item.orderDate && <span>下单 {fmtD(item.orderDate)}</span>}
        {item.etaDelivery && <span>预计交期 {fmtD(item.etaDelivery)}</span>}
        {item.actualDelivery && (
          <span style={{ color: delta > 0 ? "#e55" : "#2d9e52" }}>
            实交 {fmtD(item.actualDelivery)}
            {delta !== null && <span style={{ marginLeft: 4 }}>({delta > 0 ? `晚${delta}天` : delta < 0 ? `提前${Math.abs(delta)}天` : "准时"})</span>}
          </span>
        )}
        {warn && <span style={badge(warn.level === "over" || warn.level === "urgent" ? "#fee2e2" : "#fff0d4", warn.level === "over" || warn.level === "urgent" ? "#b91c1c" : "#7a4a00")}>{warn.text}</span>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {qc && <span style={badge(qc.bg, qc.c)}>QC {item.qcResult}</span>}
        {openExcs.length > 0 && <span style={badge("#fee2e2", "#b91c1c")}>⚠ {openExcs.length} 异常</span>}
        {item.qty && <span style={{ fontSize: 11, color: "var(--tm)" }}>{item.qty}</span>}
        {item.updatedAt && <span style={{ fontSize: 10, color: "var(--tm)" }}>更新 {formatSharedTime(item.updatedAt)}</span>}
      </div>
      {openExcs.map((ex, i) => (
        <div key={i} onClick={e => e.stopPropagation()} style={{ marginTop: 7, padding: "6px 10px", background: "#fff8e6", color: "#7a4a00", borderRadius: 7, fontSize: 11, lineHeight: 1.5, borderLeft: "3px solid #e09000" }}>
          ⚡ {ex.desc}{ex.impact && <span style={{ color: "#555" }}> · {ex.impact}</span>}{ex.action && <span style={{ color: "#555" }}> → {ex.action}</span>}{ex.responsible && <span style={{ color: "#888" }}> [{ex.responsible}]</span>}
        </div>
      ))}
      {resolvedExcs.length > 0 && (
        <div onClick={e => { e.stopPropagation(); setShowResolved(!showResolved); }} style={{ marginTop: 6, fontSize: 10, color: "var(--tm)", cursor: "pointer" }}>
          {showResolved ? "▲ 收起" : "▼"} 已解决 {resolvedExcs.length} 条
          {showResolved && resolvedExcs.map((ex, i) => (
            <div key={i} style={{ marginTop: 4, padding: "4px 8px", background: "#f0faf4", borderRadius: 6, color: "#666" }}>{ex.desc}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductGroup({ product, name, batches, onEdit }) {
  const hasOpenExc = batches.some(b => openProdExcs(b).length > 0);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "8px 12px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border)" }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{product}</span>
        <span style={{ fontSize: 12, color: "var(--tm)" }}>{name}</span>
        <span style={{ fontSize: 11, color: "var(--tm)" }}>{batches.length} 个批次</span>
        {hasOpenExc && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#e55", flexShrink: 0 }} title="有未解决异常" />}
      </div>
      {batches.map(b => <ProdBatchCard key={b.id} item={b} onClick={() => onEdit(b)} />)}
    </div>
  );
}

function ProductionPanel() {
  const { items, meta, persist } = useSharedList("production", INIT_PROD.map(b => ({ ...b, stage: normalizeStage(b.stage) })));
  const [modal, setModal] = useState(null);
  const [tabFilter, setTabFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [excOnly, setExcOnly] = useState(false);

  const counts = {
    all: items.length,
    blocked: items.filter(i => prodBatchStatus(i) === "blocked").length,
    overdue: items.filter(i => prodBatchStatus(i) === "overdue").length,
    producing: items.filter(isProducing).length,
    qc: items.filter(isQcStage).length,
    done: items.filter(i => i.stage === "已完成").length,
  };
  const owners = ownerFilterEntries(items.map(i => i.owner));
  const suppliers = ["all", ...new Set(items.map(i => i.supplier).filter(Boolean))];

  let vis = items.slice();
  if (tabFilter === "blocked") vis = vis.filter(i => prodBatchStatus(i) === "blocked");
  else if (tabFilter === "overdue") vis = vis.filter(i => prodBatchStatus(i) === "overdue");
  else if (tabFilter === "producing") vis = vis.filter(isProducing);
  else if (tabFilter === "qc") vis = vis.filter(isQcStage);
  else if (tabFilter === "done") vis = vis.filter(i => i.stage === "已完成");
  if (stageFilter !== "all") vis = vis.filter(i => normalizeStage(i.stage) === stageFilter);
  if (ownerFilter !== "all") vis = vis.filter(i => i.owner === ownerFilter);
  if (supplierFilter !== "all") vis = vis.filter(i => i.supplier === supplierFilter);
  if (excOnly) vis = vis.filter(i => openProdExcs(i).length > 0);

  const groups = {};
  vis.forEach(b => {
    const key = `${b.product}::${b.name}`;
    if (!groups[key]) groups[key] = { product: b.product, name: b.name, batches: [] };
    groups[key].batches.push(b);
  });
  Object.values(groups).forEach(g => {
    g.batches.sort((a, b) => {
      const da = a.orderDate || a.etaDelivery || "";
      const db = b.orderDate || b.etaDelivery || "";
      return db.localeCompare(da);
    });
  });
  const groupList = Object.values(groups).sort((a, b) => a.product.localeCompare(b.product));

  const emptyBatch = {
    product: "", name: "", batch: "第一批", qty: "", owner: "", supplier: "", poNumber: "",
    orderDate: "", etaDelivery: "", actualDelivery: "", etaShip: "", actualShip: "",
    qcMethod: "自检", qcCompany: "", qcDate: "", qcResult: "", qcReportNo: "", qcNote: "",
    stage: "立项", note: "", exceptions: [],
  };
  const save = (t) => {
    const now = Date.now();
    if (t.id) persist(items.map(x => x.id === t.id ? { ...t, updatedAt: now } : x));
    else persist([...items, { ...t, id: Math.max(0, ...items.map(x => x.id || 0)) + 1, updatedAt: now }]);
    setModal(null);
  };
  const clone = (b) => ({ ...b, exceptions: (b.exceptions || []).map(e => ({ ...e })) });

  const tabs = [
    { key: "all", label: "全部", nc: "var(--text)" },
    { key: "blocked", label: "异常未解决", nc: "#e09000" },
    { key: "overdue", label: "逾期未交", nc: "#e55" },
    { key: "producing", label: "生产中", nc: "#2d7dd2" },
    { key: "qc", label: "QC中", nc: "#1a9e8a" },
    { key: "done", label: "已完成", nc: "#2d9e52" },
  ];

  return (
    <div>
      <SharedMetaLine meta={meta} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 7, flex: 1, minWidth: 320 }}>
          {tabs.map(f => (
            <div key={f.key} onClick={() => setTabFilter(f.key)} style={{ background: "var(--card)", border: `1px solid ${tabFilter === f.key ? "#2d7dd2" : "var(--border)"}`, borderRadius: 10, padding: "9px 8px", cursor: "pointer" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: f.nc }}>{counts[f.key]}</div>
              <div style={{ fontSize: 10, color: "var(--tm)", marginTop: 1 }}>{f.label}</div>
            </div>
          ))}
        </div>
        <button onClick={() => setModal(emptyBatch)} style={{ background: "#2d7dd2", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, flexShrink: 0 }}>+ 新建批次</button>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} style={{ ...inpSm, background: "var(--card)", width: "auto" }}>
          <option value="all">全部阶段</option>
          {PROD_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 11, color: "var(--tm)" }}>跟进人</span>
        {owners.map(o => (
          <button key={o.name} type="button" onClick={() => setOwnerFilter(o.name)} style={{ background: ownerFilter === o.name ? "#2d7dd2" : "var(--card)", color: ownerFilter === o.name ? "#fff" : "var(--tm)", border: `1px solid ${ownerFilter === o.name ? "#2d7dd2" : "var(--border)"}`, borderRadius: 20, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>
            {o.name === "all" ? "全部" : (<>{o.name}{o.role && <RoleBadge role={o.role} style={{ padding: "0 5px", fontSize: 9 }} />}</>)}
          </button>
        ))}
        <span style={{ fontSize: 11, color: "var(--tm)", marginLeft: 4 }}>供应商</span>
        {suppliers.slice(0, 6).map(s => (
          <button key={s} type="button" onClick={() => setSupplierFilter(s)} style={{ background: supplierFilter === s ? "#7a6dd2" : "var(--card)", color: supplierFilter === s ? "#fff" : "var(--tm)", border: `1px solid ${supplierFilter === s ? "#7a6dd2" : "var(--border)"}`, borderRadius: 20, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{s === "all" ? "全部" : s}</button>
        ))}
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--tm)", cursor: "pointer", marginLeft: 4 }}>
          <input type="checkbox" checked={excOnly} onChange={e => setExcOnly(e.target.checked)} />只看异常
        </label>
      </div>
      <div>
        {groupList.length ? groupList.map(g => (
          <ProductGroup key={`${g.product}-${g.name}`} product={g.product} name={g.name} batches={g.batches} onEdit={b => setModal(clone(b))} />
        )) : <div style={{ textAlign: "center", padding: "2rem", color: "var(--tm)", fontSize: 13 }}>暂无匹配批次</div>}
      </div>
      {modal && <ProdModal item={modal} ownerExtras={items.map(i => i.owner)} onSave={save} onClose={() => setModal(null)} onDelete={() => { setItems(items.filter(x => x.id !== modal.id)); setModal(null); }} />}
    </div>
  );
}

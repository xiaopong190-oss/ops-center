const { useState, useEffect } = React;

const CONFIG_STORAGE_KEY = "ops-center-global-config";

const DEFAULT_GLOBAL_CONFIG = {
  staff: ["杨工", "黄工", "李工", "张工", "王律师"],
};

function loadGlobalConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GLOBAL_CONFIG, staff: [...DEFAULT_GLOBAL_CONFIG.staff] };
    const parsed = JSON.parse(raw);
    return {
      staff: Array.isArray(parsed.staff) && parsed.staff.length
        ? parsed.staff.filter(Boolean)
        : [...DEFAULT_GLOBAL_CONFIG.staff],
    };
  } catch {
    return { ...DEFAULT_GLOBAL_CONFIG, staff: [...DEFAULT_GLOBAL_CONFIG.staff] };
  }
}

function saveGlobalConfig(config) {
  const next = {
    staff: (config.staff || []).map(s => String(s).trim()).filter(Boolean),
  };
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("ops-global-config-updated"));
  return next;
}

function getStaffNames() {
  return loadGlobalConfig().staff;
}

function ownerOptions(...extraLists) {
  const fromData = extraLists.flat().filter(Boolean);
  return [...new Set([...getStaffNames(), ...fromData])].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function ownerFilterOptions(...extraLists) {
  return ["all", ...ownerOptions(...extraLists)];
}

function OwnerField({ value, onChange, listId = "owner-list", extraOwners = [], placeholder = "选择或输入姓名…", style, inputStyle }) {
  const options = ownerOptions(extraOwners);
  return (
    <>
      <input
        list={listId}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle || style}
      />
      <datalist id={listId}>
        {options.map(o => <option key={o} value={o} />)}
      </datalist>
    </>
  );
}

function GlobalSettingsModal({ onClose, onSaved }) {
  const [staffText, setStaffText] = useState(() => getStaffNames().join("\n"));

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    const staff = staffText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    saveGlobalConfig({ staff });
    onSaved?.();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 300, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "2rem 1rem", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "1.25rem 1.5rem", width: "100%", maxWidth: 420, color: "var(--text)" }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>全局设置</div>
        <div style={{ fontSize: 11, color: "var(--tm)", marginBottom: 12, lineHeight: 1.5 }}>
          公司员工名单会在任务、物流、精品等页面的「负责人 / 跟进人」下拉中统一出现，保存后全站生效。
        </div>
        <label style={{ display: "block", fontSize: 11, color: "var(--tm)", marginBottom: 4, fontWeight: 500 }}>公司员工（每行一个姓名）</label>
        <textarea
          value={staffText}
          onChange={e => setStaffText(e.target.value)}
          placeholder={"杨工\n黄工\n李工"}
          style={{ width: "100%", minHeight: 160, fontSize: 13, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", background: "transparent", color: "inherit", resize: "vertical", display: "block", marginBottom: 12 }}
          autoFocus
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "var(--tm)" }}>取消</button>
          <button type="button" onClick={save} style={{ background: "#2d7dd2", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "#fff" }}>保存</button>
        </div>
      </div>
    </div>
  );
}

function useGlobalConfig() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion(v => v + 1);
    window.addEventListener("ops-global-config-updated", bump);
    return () => window.removeEventListener("ops-global-config-updated", bump);
  }, []);
  return { version, staff: getStaffNames(), reload: () => setVersion(v => v + 1) };
}

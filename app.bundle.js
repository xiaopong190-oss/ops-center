/* ops-center prebuilt bundle */
const {
  useState,
  useRef,
  useEffect,
  useCallback,
  createContext,
  useContext
} = React;
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const fmtD = d => {
  if (!d) return "—";
  const p = d.split("-");
  return p[1] + "/" + p[2];
};
const daysDiff = due => {
  if (!due) return null;
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - TODAY) / 86400000);
};
const badge = (bg, color, extra = {}) => ({
  fontSize: 10,
  padding: "2px 8px",
  borderRadius: 20,
  background: bg,
  color,
  fontWeight: 500,
  whiteSpace: "nowrap",
  ...extra
});
const lbl = {
  display: "block",
  fontSize: 11,
  color: "var(--tm)",
  marginBottom: 3,
  fontWeight: 500
};
const inp = {
  width: "100%",
  fontSize: 13,
  padding: "7px 10px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontFamily: "inherit",
  background: "transparent",
  color: "inherit",
  display: "block"
};
const inpSm = {
  fontSize: 12,
  padding: "5px 8px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontFamily: "inherit",
  background: "transparent",
  color: "inherit"
};
const AVATAR_PALETTE = [["#dbeafe", "#1e3a8a"], ["#d1fae5", "#065f46"], ["#fef3c7", "#78350f"], ["#ede9fe", "#4c1d95"], ["#fce7f3", "#831843"], ["#fee2e2", "#7f1d1d"], ["#d1fae5", "#064e3b"], ["#fef9c3", "#713f12"]];
const strHash = s => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % AVATAR_PALETTE.length;
  return h;
};
const Avatar = ({
  name,
  size = 24
}) => {
  const [bg, tx] = AVATAR_PALETTE[strHash(name || "?")];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      borderRadius: "50%",
      background: bg,
      color: tx,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: size * 0.42,
      fontWeight: 700,
      flexShrink: 0
    }
  }, (name || "?").slice(0, 1));
};

// ─── GLOBAL CONFIG (全站共享：员工名单等) ─────────────────────────────
const CONFIG_STORAGE_KEY = "ops-center-global-config";
const JSONBIN_API_KEY = "$2a$10$2ozXoCjldhmBsjtHria.3.Qe9IGP3lPWQnxGsvO4fOBdlfDogsBZq";
const JSONBIN_API_BASE = "https://api.jsonbin.io/v3/b";
const JSONBIN_BIN_IDS = {
  logistics: "6a1d27c321f9ee59d2a3c1c4",
  tasks: "6a1d27fd21f9ee59d2a3c26e",
  production: "6a1d282721f9ee59d2a3c30a",
  "tools-links": "6a1d284521f9ee59d2a3c375"
};
function resolveJsonBinId(key) {
  return JSONBIN_BIN_IDS[key] || null;
}
function sharedLocalGet(key) {
  try {
    const raw = localStorage.getItem(`shared:${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function sharedLocalSet(key, value, updatedBy) {
  const payload = {
    data: value,
    updatedBy: updatedBy || "未知",
    updatedAt: Date.now()
  };
  localStorage.setItem(`shared:${key}`, JSON.stringify(payload));
  return payload;
}
function sharedLocalDelete(key) {
  localStorage.removeItem(`shared:${key}`);
}
function normalizeSharedRecord(record) {
  if (record == null) return null;
  if (typeof record === "object" && Object.prototype.hasOwnProperty.call(record, "data")) {
    return {
      data: record.data,
      updatedBy: record.updatedBy || "",
      updatedAt: record.updatedAt || 0
    };
  }
  return {
    data: record,
    updatedBy: "",
    updatedAt: 0
  };
}
function notifySharedUpdated(key) {
  window.dispatchEvent(new CustomEvent(`ops-shared-updated:${key}`));
}
const sharedStorage = {
  async get(key) {
    const binId = resolveJsonBinId(key);
    if (!binId) return sharedLocalGet(key);
    try {
      const res = await fetch(`${JSONBIN_API_BASE}/${binId}/latest`, {
        headers: {
          "X-Master-Key": JSONBIN_API_KEY
        },
        cache: "no-store"
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`JSONBin GET ${res.status}`);
      const json = await res.json();
      const normalized = normalizeSharedRecord(json.record);
      if (normalized) {
        sharedLocalSet(key, normalized.data, normalized.updatedBy);
        return {
          ...normalized,
          _source: "cloud"
        };
      }
      return null;
    } catch {
      const local = sharedLocalGet(key);
      if (local) return {
        ...local,
        _source: "local-fallback"
      };
      return null;
    }
  },
  async set(key, value, updatedBy) {
    const payload = {
      data: value,
      updatedBy: updatedBy || "未知",
      updatedAt: Date.now()
    };
    const binId = resolveJsonBinId(key);
    if (!binId) {
      sharedLocalSet(key, value, updatedBy);
      notifySharedUpdated(key);
      return {
        ...payload,
        _source: "local"
      };
    }
    try {
      const res = await fetch(`${JSONBIN_API_BASE}/${binId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": JSONBIN_API_KEY
        },
        body: JSON.stringify(payload),
        cache: "no-store"
      });
      if (!res.ok) throw new Error(`JSONBin PUT ${res.status}`);
      sharedLocalSet(key, value, updatedBy);
      notifySharedUpdated(key);
      return {
        ...payload,
        _source: "cloud"
      };
    } catch (e) {
      sharedLocalSet(key, value, updatedBy);
      notifySharedUpdated(key);
      throw new Error(`云端保存失败（已暂存本机）：${e?.message || "网络错误"}`);
    }
  },
  async delete(key) {
    const binId = resolveJsonBinId(key);
    if (!binId) {
      sharedLocalDelete(key);
      notifySharedUpdated(key);
      return;
    }
    await sharedStorage.set(key, null, "");
  }
};
const ROLE_COLORS = {
  运营: {
    bg: "#dceeff",
    color: "#1a4e8a"
  },
  美工: {
    bg: "#f3e8ff",
    color: "#6b21a8"
  },
  设计: {
    bg: "#e8f5e9",
    color: "#2e7d32"
  },
  开发: {
    bg: "#e0f2f1",
    color: "#00695c"
  },
  采购: {
    bg: "#fff3e0",
    color: "#e65100"
  },
  管理: {
    bg: "#fce4ec",
    color: "#880e4f"
  }
};
const STAFF_ROLE_OPTIONS = Object.keys(ROLE_COLORS);
const DEFAULT_GLOBAL_CONFIG = {
  staff: [{
    name: "杨彬",
    role: "运营"
  }, {
    name: "stella",
    role: "运营"
  }, {
    name: "张玉堂",
    role: "美工"
  }, {
    name: "张工",
    role: "设计"
  }, {
    name: "王律师",
    role: "管理"
  }]
};
const DEFAULT_ROLE_BY_NAME = Object.fromEntries(DEFAULT_GLOBAL_CONFIG.staff.map(e => [e.name, e.role]));
function normalizeStaffEntry(item) {
  let entry;
  if (typeof item === "string") {
    const [name, role] = item.split("|").map(s => s.trim());
    entry = {
      name: name || item.trim(),
      role: role || ""
    };
  } else {
    entry = {
      name: String(item?.name || "").trim(),
      role: String(item?.role || "").trim()
    };
  }
  if (entry.name && !entry.role && DEFAULT_ROLE_BY_NAME[entry.name]) {
    entry.role = DEFAULT_ROLE_BY_NAME[entry.name];
  }
  return entry;
}
function parseStaffText(text) {
  return text.split(/\r?\n/).map(line => {
    const [name, role] = line.split("|").map(s => s.trim());
    const trimmed = line.trim();
    return {
      name: name || trimmed,
      role: role || ""
    };
  }).filter(e => e.name);
}
function formatStaffText(staff) {
  return staff.map(e => `${e.name}|${e.role || ""}`).join("\n");
}
function loadGlobalConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return {
      staff: DEFAULT_GLOBAL_CONFIG.staff.map(e => ({
        ...e
      }))
    };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.staff) || !parsed.staff.length) {
      return {
        staff: DEFAULT_GLOBAL_CONFIG.staff.map(e => ({
          ...e
        }))
      };
    }
    const staff = parsed.staff.map(normalizeStaffEntry).filter(e => e.name);
    if (JSON.stringify(parsed.staff) !== JSON.stringify(staff)) {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({
        staff
      }));
    }
    return {
      staff
    };
  } catch {
    return {
      staff: DEFAULT_GLOBAL_CONFIG.staff.map(e => ({
        ...e
      }))
    };
  }
}
function saveGlobalConfig(config) {
  const next = {
    staff: (config.staff || []).map(normalizeStaffEntry).filter(e => e.name)
  };
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("ops-global-config-updated"));
  return next;
}
function getEmployees() {
  return loadGlobalConfig().staff;
}
function getStaffNames() {
  return getEmployees().map(e => e.name);
}
function getStaffRole(name) {
  return getEmployees().find(e => e.name === name)?.role || "";
}

/** 全局员工 + 业务数据里出现过的姓名，去重排序 */
function ownerOptions(...extraLists) {
  const fromData = extraLists.flat().filter(Boolean);
  const byName = new Map(getEmployees().map(e => [e.name, e]));
  for (const n of fromData) {
    if (!byName.has(n)) byName.set(n, {
      name: n,
      role: ""
    });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

/** 跟进人筛选：全部 + 员工对象列表 */
function ownerFilterEntries(...extraLists) {
  return [{
    name: "all",
    role: ""
  }, ...ownerOptions(...extraLists)];
}

/** 跟进人筛选：全部 + 合并名单（姓名字符串，兼容旧用法） */
function ownerFilterOptions(...extraLists) {
  return ownerFilterEntries(...extraLists).map(e => e.name);
}
function formatOwnerLabel(emp) {
  if (!emp) return "";
  if (typeof emp === "string") {
    const role = getStaffRole(emp);
    return role ? `${emp} · ${role}` : emp;
  }
  return emp.role ? `${emp.name} · ${emp.role}` : emp.name;
}
function RoleBadge({
  role,
  style
}) {
  if (!role) return null;
  const c = ROLE_COLORS[role] || {
    bg: "#f3f4f6",
    color: "#666"
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      padding: "1px 6px",
      borderRadius: 10,
      background: c.bg,
      color: c.color,
      whiteSpace: "nowrap",
      ...style
    }
  }, role);
}
function OwnerField({
  value,
  onChange,
  listId = "owner-list",
  extraOwners = [],
  placeholder = "选择负责人…",
  style,
  inputStyle
}) {
  useGlobalConfig();
  const options = ownerOptions(extraOwners);
  const known = new Set(options.map(o => o.name));
  const [manual, setManual] = useState(() => !!(value && !known.has(value)));
  const fieldStyle = {
    ...(inputStyle || style),
    background: "var(--card)"
  };
  useEffect(() => {
    if (value && !known.has(value)) setManual(true);else if (value && known.has(value)) setManual(false);
  }, [value, options.map(o => o.name).join("\0")]);
  if (manual) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 6,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("input", {
      list: listId,
      value: value,
      onChange: e => onChange(e.target.value),
      placeholder: "\u8F93\u5165\u59D3\u540D\u2026",
      style: {
        ...fieldStyle,
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("datalist", {
      id: listId
    }, options.map(o => /*#__PURE__*/React.createElement("option", {
      key: o.name,
      value: o.name
    }, formatOwnerLabel(o)))), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => {
        setManual(false);
        if (!known.has(value)) onChange("");
      },
      style: {
        fontSize: 11,
        padding: "6px 8px",
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--bg)",
        cursor: "pointer",
        color: "var(--tm)",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
        flexShrink: 0
      }
    }, "\u4ECE\u5217\u8868\u9009"));
  }
  return /*#__PURE__*/React.createElement("select", {
    value: known.has(value) ? value : "",
    onChange: e => {
      const v = e.target.value;
      if (v === "__manual__") {
        setManual(true);
        onChange("");
        return;
      }
      onChange(v);
    },
    style: fieldStyle
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, placeholder), options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.name,
    value: o.name
  }, formatOwnerLabel(o))), /*#__PURE__*/React.createElement("option", {
    value: "__manual__"
  }, "\u624B\u52A8\u8F93\u5165\u2026"));
}
function StaffListEditor({
  rows,
  onChange
}) {
  const setRow = (i, patch) => onChange(rows.map((r, j) => j === i ? {
    ...r,
    ...patch
  } : r));
  const removeRow = i => onChange(rows.filter((_, j) => j !== i));
  const addRow = () => onChange([...rows, {
    name: "",
    role: STAFF_ROLE_OPTIONS[0] || "运营"
  }]);
  const inp = {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    padding: "7px 10px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontFamily: "inherit",
    background: "transparent",
    color: "inherit"
  };
  const sel = {
    ...inp,
    width: 92,
    flex: "0 0 92px",
    background: "var(--card)",
    cursor: "pointer"
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 6,
      padding: "0 2px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 11,
      color: "var(--tm)",
      fontWeight: 500
    }
  }, "\u59D3\u540D"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 92,
      flexShrink: 0,
      fontSize: 11,
      color: "var(--tm)",
      fontWeight: 500
    }
  }, "\u89D2\u8272"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 28
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      maxHeight: 300,
      overflowY: "auto",
      marginBottom: 10,
      paddingRight: 2
    }
  }, rows.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--tm)",
      textAlign: "center",
      padding: "12px 0"
    }
  }, "\u6682\u65E0\u5458\u5DE5\uFF0C\u70B9\u51FB\u4E0B\u65B9\u6DFB\u52A0"), rows.map((row, i) => {
    const roles = !row.role || STAFF_ROLE_OPTIONS.includes(row.role) ? STAFF_ROLE_OPTIONS : [...STAFF_ROLE_OPTIONS, row.role];
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: "flex",
        gap: 8,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: row.name,
      onChange: e => setRow(i, {
        name: e.target.value
      }),
      placeholder: "\u8F93\u5165\u59D3\u540D",
      style: inp
    }), /*#__PURE__*/React.createElement("select", {
      value: row.role || STAFF_ROLE_OPTIONS[0],
      onChange: e => setRow(i, {
        role: e.target.value
      }),
      style: sel
    }, roles.map(r => /*#__PURE__*/React.createElement("option", {
      key: r,
      value: r
    }, r))), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => removeRow(i),
      title: "\u5220\u9664",
      "aria-label": "\u5220\u9664",
      style: {
        width: 28,
        height: 28,
        border: "none",
        background: "transparent",
        color: "#bbb",
        cursor: "pointer",
        fontSize: 20,
        lineHeight: 1,
        flexShrink: 0,
        fontFamily: "inherit"
      }
    }, "\xD7"));
  })), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: addRow,
    style: {
      width: "100%",
      border: "1px dashed var(--border)",
      borderRadius: 8,
      padding: "7px 0",
      fontSize: 12,
      cursor: "pointer",
      color: "var(--tm)",
      background: "transparent",
      fontFamily: "inherit"
    }
  }, "+ \u6DFB\u52A0\u5458\u5DE5"));
}
function GlobalSettingsModal({
  onClose,
  onSaved
}) {
  const [rows, setRows] = useState(() => getEmployees().map(e => ({
    ...e
  })));
  useEffect(() => {
    const onKey = e => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const save = () => {
    const staff = rows.map(r => ({
      name: r.name.trim(),
      role: r.role || ""
    })).filter(r => r.name);
    saveGlobalConfig({
      staff
    });
    onSaved && onSaved();
  };
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.4)",
      zIndex: 300,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: "2rem 1rem",
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 14,
      padding: "1.25rem 1.5rem",
      width: "100%",
      maxWidth: 440,
      color: "var(--text)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 15,
      marginBottom: 4
    }
  }, "\u5168\u5C40\u5458\u5DE5\u540D\u5355"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginBottom: 14,
      lineHeight: 1.5
    }
  }, "\u586B\u5199\u59D3\u540D\u5E76\u9009\u62E9\u89D2\u8272\uFF0C\u4FDD\u5B58\u540E\u4F1A\u5728\u5404\u6A21\u5757\u300C\u8D1F\u8D23\u4EBA / \u8DDF\u8FDB\u4EBA\u300D\u4E2D\u7EDF\u4E00\u51FA\u73B0\u3002"), /*#__PURE__*/React.createElement(StaffListEditor, {
    rows: rows,
    onChange: setRows
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClose,
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "6px 14px",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "var(--tm)"
    }
  }, "\u53D6\u6D88"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: save,
    style: {
      background: "#2d7dd2",
      border: "none",
      borderRadius: 8,
      padding: "6px 14px",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "#fff"
    }
  }, "\u4FDD\u5B58"))));
}
function useGlobalConfig() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion(v => v + 1);
    window.addEventListener("ops-global-config-updated", bump);
    return () => window.removeEventListener("ops-global-config-updated", bump);
  }, []);
  return {
    version,
    staff: getEmployees(),
    reload: () => setVersion(v => v + 1)
  };
}
window.ROLE_COLORS = ROLE_COLORS;
window.getEmployees = getEmployees;
window.getStaffNames = getStaffNames;
window.getStaffRole = getStaffRole;
window.ownerOptions = ownerOptions;
window.ownerFilterOptions = ownerFilterOptions;
window.ownerFilterEntries = ownerFilterEntries;
window.formatOwnerLabel = formatOwnerLabel;
window.RoleBadge = RoleBadge;
window.OwnerField = OwnerField;
window.GlobalSettingsModal = GlobalSettingsModal;
window.useGlobalConfig = useGlobalConfig;
window.sharedStorage = sharedStorage;
// ─── STORAGE (shared / private) ─────────────────────────────────────
const CURRENT_USER_KEY = "ops-center-current-user";
function getCurrentUser() {
  try {
    const raw = sessionStorage.getItem(CURRENT_USER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id && parsed?.name) return parsed;
    }
  } catch {/* ignore */}
  return {
    id: "guest",
    name: "访客"
  };
}
function setCurrentUser(user) {
  try {
    sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify({
      id: user.id || user.name || "guest",
      name: user.name || "访客"
    }));
  } catch {/* ignore */}
}
const privateStorage = {
  get(userId, key) {
    try {
      const raw = localStorage.getItem(`user:${userId}:${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set(userId, key, value) {
    localStorage.setItem(`user:${userId}:${key}`, JSON.stringify(value));
  },
  delete(userId, key) {
    localStorage.removeItem(`user:${userId}:${key}`);
  }
};
function formatSharedTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
}
const CLIENT_ID_KEY = "ops-center-client-id";
const DEVICE_ID_KEY = "ops-center-device-id";
function getOrCreateDeviceId() {
  try {
    const cached = localStorage.getItem(DEVICE_ID_KEY);
    if (cached) return cached;
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? `dev-${crypto.randomUUID()}` : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `dev-${Date.now()}`;
  }
}
function isPrivateLanIp(ip) {
  if (!ip || typeof ip !== "string") return false;
  if (ip.startsWith("192.168.") || ip.startsWith("10.")) return true;
  return /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip);
}
function detectLocalLanIpViaWebRTC() {
  return new Promise(resolve => {
    if (typeof RTCPeerConnection !== "function") {
      resolve("");
      return;
    }
    let settled = false;
    const finish = ip => {
      if (settled) return;
      settled = true;
      try {
        pc.close();
      } catch {/* ignore */}
      resolve(ip || "");
    };
    const pc = new RTCPeerConnection({
      iceServers: []
    });
    const found = new Set();
    pc.createDataChannel("ops-center");
    pc.onicecandidate = event => {
      if (!event.candidate?.candidate) return;
      const match = /(\d{1,3}(?:\.\d{1,3}){3})/.exec(event.candidate.candidate);
      if (!match) return;
      const ip = match[1];
      if (!isPrivateLanIp(ip)) return;
      found.add(ip);
      const preferred = [...found].find(i => i.startsWith("192.168.")) || [...found][0];
      finish(preferred);
    };
    pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(() => finish(""));
    setTimeout(() => {
      if (found.size) {
        finish([...found].find(i => i.startsWith("192.168.")) || [...found][0]);
      } else {
        finish("");
      }
    }, 2500);
  });
}
function priorityLocalKey(clientId, date) {
  return `priority:${clientId}:${date}`;
}
function readPriorityLocal(clientId, date) {
  try {
    const raw = localStorage.getItem(priorityLocalKey(clientId, date));
    if (!raw) return {
      date: "",
      text: ""
    };
    const parsed = JSON.parse(raw);
    if (parsed?.date === date && parsed.text) {
      return {
        date: parsed.date,
        text: parsed.text
      };
    }
  } catch {/* ignore */}
  return {
    date: "",
    text: ""
  };
}
function writePriorityLocal(clientId, entry) {
  try {
    localStorage.setItem(priorityLocalKey(clientId, entry.date), JSON.stringify(entry));
  } catch {/* ignore */}
}
async function resolveClientId() {
  try {
    const cached = localStorage.getItem(CLIENT_ID_KEY);
    if (cached && isPrivateLanIp(cached)) return cached;
    if (cached && !isPrivateLanIp(cached)) localStorage.removeItem(CLIENT_ID_KEY);
  } catch {/* ignore */}
  try {
    const res = await fetch("/api/client-id");
    if (res.ok) {
      const data = await res.json();
      if (data.clientId && isPrivateLanIp(data.clientId)) {
        localStorage.setItem(CLIENT_ID_KEY, data.clientId);
        return data.clientId;
      }
    }
  } catch {/* ignore */}
  const lanIp = await detectLocalLanIpViaWebRTC();
  if (lanIp && isPrivateLanIp(lanIp)) {
    try {
      localStorage.setItem(CLIENT_ID_KEY, lanIp);
    } catch {/* ignore */}
    return lanIp;
  }
  return getOrCreateDeviceId();
}
async function loadTodayPriority(clientId, date) {
  const id = clientId || getOrCreateDeviceId();
  if (!id) return {
    date: "",
    text: ""
  };
  try {
    const res = await fetch(`/api/priority?date=${encodeURIComponent(date)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.date === date && data.text) {
        const entry = {
          date: data.date,
          text: data.text
        };
        writePriorityLocal(id, entry);
        return entry;
      }
      if (data.ok && data.date === date && !data.text) {
        return {
          date: "",
          text: ""
        };
      }
    }
  } catch {/* ignore */}
  return readPriorityLocal(id, date);
}
async function saveTodayPriority(clientId, date, text) {
  const id = clientId || getOrCreateDeviceId();
  const entry = {
    date,
    text: text.trim()
  };
  writePriorityLocal(id, entry);
  try {
    await fetch("/api/priority", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        date,
        text: entry.text
      })
    });
  } catch {/* ignore */}
  return entry;
}
function useSharedList(storageKey, defaultData) {
  const read = useCallback(async () => {
    try {
      const raw = await sharedStorage.get(storageKey);
      const data = raw?.data != null ? raw.data : defaultData;
      return {
        data,
        meta: raw,
        error: ""
      };
    } catch (e) {
      return {
        data: defaultData,
        meta: null,
        error: e?.message || "读取失败"
      };
    }
  }, [storageKey, defaultData]);
  const [state, setState] = useState({
    data: defaultData,
    meta: null,
    loading: true,
    error: ""
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await read();
      if (!cancelled) setState({
        ...next,
        loading: false
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [read]);
  useEffect(() => {
    const handler = () => {
      read().then(next => setState({
        ...next,
        loading: false
      }));
    };
    window.addEventListener(`ops-shared-updated:${storageKey}`, handler);
    return () => window.removeEventListener(`ops-shared-updated:${storageKey}`, handler);
  }, [storageKey, read]);
  useEffect(() => {
    const refresh = () => read().then(next => setState({
      ...next,
      loading: false
    }));
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(refresh, 30000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [read]);
  const persist = useCallback(async data => {
    setState(prev => ({
      data,
      meta: {
        updatedBy: getCurrentUser().name,
        updatedAt: Date.now(),
        ...(prev.meta || {})
      },
      loading: false,
      error: ""
    }));
    try {
      await sharedStorage.set(storageKey, data, getCurrentUser().name);
      const raw = await sharedStorage.get(storageKey);
      setState({
        data: raw?.data != null ? raw.data : data,
        meta: raw,
        loading: false,
        error: ""
      });
    } catch (e) {
      setState(prev => ({
        ...prev,
        data,
        loading: false,
        error: e?.message || "保存失败"
      }));
    }
  }, [storageKey]);
  const reload = useCallback(async () => {
    const next = await read();
    setState({
      ...next,
      loading: false
    });
  }, [read]);
  return {
    items: state.data,
    meta: state.meta,
    loading: state.loading,
    error: state.error,
    persist,
    reload
  };
}
function SharedMetaLine({
  meta,
  style,
  onReload,
  loading,
  error
}) {
  let bg = "#eef6ff";
  let border = "#b8d4f0";
  let color = "#1a4e8a";
  let text = "☁️ 云端同步已启用 · 修改后全公司电脑自动共享";
  if (loading) {
    bg = "#f3f4f6";
    border = "#d1d5db";
    color = "#4b5563";
    text = "⏳ 正在从云端加载…";
  } else if (error) {
    bg = "#fee2e2";
    border = "#fca5a5";
    color = "#991b1b";
    text = `❌ ${error}`;
  } else if (meta?._source === "cloud") {
    bg = "#ecfdf5";
    border = "#6ee7b7";
    color = "#065f46";
    text = meta?.updatedBy ? `☁️ 已从云端同步 · 最后由 ${meta.updatedBy} 更新于 ${formatSharedTime(meta.updatedAt)}` : "☁️ 已从云端同步 · 数据全公司共享";
  } else if (meta?._source === "local-fallback") {
    bg = "#fffbeb";
    border = "#fcd34d";
    color = "#92400e";
    text = "⚠️ 云端暂不可用，当前显示本机缓存";
  } else if (meta?._source === "local") {
    bg = "#f3f4f6";
    border = "#d1d5db";
    color = "#4b5563";
    text = "💾 仅保存在本机（未配置云端）";
  } else if (meta?.updatedBy) {
    text = `最后由 ${meta.updatedBy} 更新于 ${formatSharedTime(meta.updatedAt)} · 每 30 秒自动同步`;
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color,
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 8,
      padding: "8px 12px",
      marginBottom: 12,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      flexWrap: "wrap",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", null, text), onReload && !loading && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onReload,
    style: {
      background: "#fff",
      border: `1px solid ${border}`,
      borderRadius: 6,
      padding: "4px 10px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      color,
      fontWeight: 600,
      flexShrink: 0
    }
  }, "\u7ACB\u5373\u5237\u65B0"));
}

// ─── USER CONTEXT ───────────────────────────────────────────────────
const UserContext = createContext(getCurrentUser());
function useCurrentUser() {
  return useContext(UserContext);
}

// ─── LOGISTICS MODULE (Shipment Group + FBA) ─────────────────────────
const HEAD_STAGES = ["备货中", "已出港", "在途", "已到港"];
const HEAD_STAGE_SHORT = {
  备货中: "备货",
  已出港: "出港",
  在途: "在途",
  已到港: "到港"
};
const headStageColor = s => ({
  备货中: "#888",
  已出港: "#7a6dd2",
  在途: "#2d7dd2",
  已到港: "#1a9e8a"
})[s] || "#888";
const FBA_STATUSES = ["准备发货", "运输中", "缺少追踪编码", "接收中", "已完成"];
const FBA_STATUS_STYLE = {
  "缺少追踪编码": {
    bg: "#fee2e2",
    c: "#E24B4A"
  },
  "运输中": {
    bg: "#dceeff",
    c: "#2d7dd2"
  },
  "接收中": {
    bg: "#d1fae5",
    c: "#1a9e8a"
  },
  "已完成": {
    bg: "#d4f0dc",
    c: "#2d9e52"
  },
  "准备发货": {
    bg: "#f3f4f6",
    c: "#888"
  }
};
const TRANSPORT_META = {
  海运: {
    icon: "🚢",
    bg: "#dceeff",
    c: "#1a4e8a"
  },
  空运: {
    icon: "✈",
    bg: "#ede9fe",
    c: "#4c1d95"
  },
  快递: {
    icon: "📦",
    bg: "#fef3c7",
    c: "#78350f"
  }
};
const fmtWindow = (s, e) => !s && !e ? "—" : `${s ? fmtD(s) : "?"} – ${e ? fmtD(e) : "?"}`;
const fbaEffectiveStatus = fba => {
  if (fba.status === "缺少追踪编码") return "缺少追踪编码";
  if ((fba.status === "准备发货" || !fba.status) && !(fba.tracking || "").trim()) return "缺少追踪编码";
  return fba.status || "准备发货";
};
const batchMissingTrack = g => (g.fbaShipments || []).some(s => fbaEffectiveStatus(s) === "缺少追踪编码");
const batchReceiving = g => (g.fbaShipments || []).some(s => s.status === "接收中");
const batchAllDone = g => (g.fbaShipments || []).length > 0 && (g.fbaShipments || []).every(s => s.status === "已完成");
const batchHeadTransit = g => ["已出港", "在途"].includes(g.headStatus);
const batchHeadOverdue = g => {
  const d = daysDiff(g.etaArrival);
  return d !== null && d < 0 && g.headStatus !== "已到港";
};
const openExcCount = g => (g.exceptions || []).filter(e => !e.resolved).length;

// ─── Amazon STA CSV import ───────────────────────────────────────────
const parseCsvRow = line => {
  const cells = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (c === "," && !inQuote) {
      cells.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  cells.push(cur);
  return cells.map(s => s.trim());
};
const warehouseFromStaName = name => {
  const m = (name || "").match(/-([A-Z0-9]{3,5})\s*$/);
  return m ? m[1] : "";
};
const isoFromStaName = name => {
  const m = (name || "").match(/\((\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return "";
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
};
const addDaysIso = (iso, days) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const parseAmazonStaCsv = (text, id) => {
  const warnings = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const meta = {};
  for (const line of lines.slice(0, 15)) {
    if (!line.trim()) continue;
    const row = parseCsvRow(line);
    if (row.length >= 2 && row[0] && row[1] && row[0] !== "SKU") meta[row[0]] = row[1];
  }
  const fbaId = meta["货件编号"] || "";
  const name = meta["货件名称"] || "";
  if (!fbaId && !name) throw new Error("不是有效的 STA 货件 CSV");
  let skuInfo = null;
  for (let i = 0; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    if (row[0] !== "SKU") continue;
    const header = row;
    const data = parseCsvRow(lines[i + 1] || "");
    if (!data[0] || data[0] === "SKU") break;
    const idx = k => header.indexOf(k);
    skuInfo = {
      sku: data[idx("SKU")] || data[0],
      asin: data[idx("ASIN")] || "",
      fnsku: data[idx("FNSKU")] || "",
      units: +(data[idx("商品总数")] || 0)
    };
    break;
  }
  const warehouse = warehouseFromStaName(name);
  if (!warehouse) warnings.push("未解析到仓库代码");
  const windowStart = isoFromStaName(name);
  let expectedQty = +(meta["商品数量"] || 0);
  if (skuInfo?.units) expectedQty = skuInfo.units;
  if (!expectedQty) warnings.push("商品数量为 0");
  const note = [meta["配送地址"] && `配送 ${meta["配送地址"]}`, meta["箱子数量"] && `${meta["箱子数量"]} 箱`, skuInfo?.fnsku && `FNSKU ${skuInfo.fnsku}`].filter(Boolean).join(" · ");
  return {
    fba: {
      id,
      name,
      fbaId,
      internalId: (meta["工作流程名称"] || "").slice(0, 8).toUpperCase(),
      warehouse,
      expectedQty,
      receivedQty: 0,
      windowStart,
      windowEnd: addDaysIso(windowStart, 6),
      tracking: "",
      status: "准备发货",
      note
    },
    sku: skuInfo?.sku || "",
    warnings
  };
};
const readStaCsvFiles = async fileList => {
  const files = Array.from(fileList);
  const baseId = Date.now();
  const parsed = await Promise.all(files.map((f, i) => f.text().then(t => parseAmazonStaCsv(t, baseId + i))));
  return {
    fbaShipments: parsed.map(p => p.fba),
    totalQty: parsed.reduce((s, p) => s + (p.fba.expectedQty || 0), 0),
    sku: parsed.find(p => p.sku)?.sku || "",
    warnings: parsed.flatMap((p, i) => p.warnings.map(w => `${files[i].name}: ${w}`))
  };
};
const INIT_LOGISTICS = [{
  id: 1,
  name: "FB100绿色第三批",
  sku: "FB100",
  totalQty: 800,
  owner: "陈工",
  shipDate: "2026-04-10",
  transport: "海运",
  forwarder: "中外运华南",
  blNumber: "COSU6284731",
  etaDeparture: "2026-05-15",
  etaArrival: "2026-06-08",
  headStatus: "在途",
  note: "正常在途",
  exceptions: [],
  fbaShipments: [{
    id: 101,
    name: "FBA STA (04/20/2026 10:14)-RDU2",
    fbaId: "FBA19BWMS0S7",
    internalId: "11VGG45G",
    warehouse: "RDU2",
    expectedQty: 144,
    receivedQty: 0,
    windowStart: "2026-05-31",
    windowEnd: "2026-06-06",
    tracking: "",
    status: "准备发货",
    note: ""
  }, {
    id: 102,
    name: "FBA STA (04/20/2026 10:14)-SWF2",
    fbaId: "FBA19BWMT1K3",
    internalId: "22HJK89M",
    warehouse: "SWF2",
    expectedQty: 160,
    receivedQty: 0,
    windowStart: "2026-06-01",
    windowEnd: "2026-06-07",
    tracking: "1Z999AA10123456784",
    status: "运输中",
    note: ""
  }, {
    id: 103,
    name: "FBA STA (04/20/2026 10:14)-IAH3",
    fbaId: "FBA19BWMV4P9",
    internalId: "33PLM12N",
    warehouse: "IAH3",
    expectedQty: 168,
    receivedQty: 120,
    windowStart: "2026-05-28",
    windowEnd: "2026-06-03",
    tracking: "TBA6284731003",
    status: "接收中",
    note: ""
  }, {
    id: 104,
    name: "FBA STA (04/20/2026 10:14)-MDW2",
    fbaId: "FBA19BWMX7R2",
    internalId: "44QRS56T",
    warehouse: "MDW2",
    expectedQty: 176,
    receivedQty: 176,
    windowStart: "2026-05-20",
    windowEnd: "2026-05-26",
    tracking: "FBA6284731004",
    status: "已完成",
    note: ""
  }, {
    id: 105,
    name: "FBA STA (04/20/2026 10:14)-ORF2",
    fbaId: "FBA19BWMZ9T5",
    internalId: "55UVW78X",
    warehouse: "ORF2",
    expectedQty: 152,
    receivedQty: 0,
    windowStart: "2026-06-05",
    windowEnd: "2026-06-11",
    tracking: "",
    status: "准备发货",
    note: ""
  }]
}, {
  id: 2,
  name: "FB101白色第二批",
  sku: "FB101",
  totalQty: 300,
  owner: "陈工",
  shipDate: "2026-05-08",
  transport: "空运",
  forwarder: "顺丰国际",
  blNumber: "SF20260508001",
  etaDeparture: "2026-05-12",
  etaArrival: "2026-05-18",
  headStatus: "已到港",
  note: "",
  exceptions: [{
    desc: "IAH3 仓库拒收部分箱",
    date: "2026-05-25",
    resolved: false,
    action: "货代协调重新配送"
  }],
  fbaShipments: [{
    id: 201,
    name: "FBA STA (05/08/2026 09:30)-LAX9",
    fbaId: "FBA19BXAA1B2",
    internalId: "66ABC01D",
    warehouse: "LAX9",
    expectedQty: 300,
    receivedQty: 280,
    windowStart: "2026-05-22",
    windowEnd: "2026-05-28",
    tracking: "SF6284732001",
    status: "接收中",
    note: ""
  }]
}, {
  id: 3,
  name: "FB200黑色第一批",
  sku: "FB200",
  totalQty: 200,
  owner: "李工",
  shipDate: "2026-05-01",
  transport: "海运",
  forwarder: "马士基订舱",
  blNumber: "MAEU9876543",
  etaDeparture: "2026-05-28",
  etaArrival: "2026-06-25",
  headStatus: "备货中",
  note: "等工厂尾数",
  exceptions: [],
  fbaShipments: [{
    id: 301,
    name: "FBA STA (05/01/2026 14:00)-ONT8",
    fbaId: "FBA19BYCC3D4",
    internalId: "77DEF02G",
    warehouse: "ONT8",
    expectedQty: 200,
    receivedQty: 0,
    windowStart: "2026-06-20",
    windowEnd: "2026-06-26",
    tracking: "",
    status: "准备发货",
    note: ""
  }]
}];
function ExceptionEditor({
  excs,
  setExcs
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--tm)",
      borderTop: "1px solid var(--border)",
      paddingTop: 10,
      marginBottom: 8
    }
  }, "\u5F02\u5E38\u8BB0\u5F55"), excs.map((ex, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      background: ex.resolved ? "#f0faf4" : "#fff8e6",
      border: `1px solid ${ex.resolved ? "#b7e4c7" : "#ffe0a0"}`,
      borderRadius: 8,
      padding: "10px 12px",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: ex.desc,
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        desc: e.target.value
      };
      setExcs(a);
    },
    placeholder: "\u5F02\u5E38\u63CF\u8FF0",
    style: {
      ...inpSm,
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: ex.date,
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        date: e.target.value
      };
      setExcs(a);
    },
    style: {
      ...inpSm,
      width: 120
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: ex.action,
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        action: e.target.value
      };
      setExcs(a);
    },
    placeholder: "\u5904\u7406\u65B9\u5F0F / \u8DDF\u8FDB\u52A8\u4F5C",
    style: {
      ...inpSm,
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("label", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      fontSize: 11,
      color: "var(--tm)",
      whiteSpace: "nowrap",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: ex.resolved,
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        resolved: e.target.checked
      };
      setExcs(a);
    }
  }), "\u5DF2\u89E3\u51B3"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setExcs(excs.filter((_, j) => j !== i)),
    style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      color: "#aaa",
      fontSize: 16
    }
  }, "\xD7")))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setExcs([...excs, {
      desc: "",
      date: TODAY.toISOString().split("T")[0],
      action: "",
      resolved: false
    }]),
    style: {
      width: "100%",
      border: "1px dashed var(--border)",
      borderRadius: 8,
      padding: "5px 0",
      fontSize: 12,
      cursor: "pointer",
      color: "var(--tm)",
      background: "transparent",
      marginBottom: 12,
      fontFamily: "inherit"
    }
  }, "+ \u8BB0\u5F55\u5F02\u5E38"));
}
function FbaStatusBadge({
  fba
}) {
  const st = fbaEffectiveStatus(fba);
  const s = FBA_STATUS_STYLE[st] || FBA_STATUS_STYLE["准备发货"];
  return /*#__PURE__*/React.createElement("span", {
    style: badge(s.bg, s.c)
  }, st);
}
function FbaRow({
  fba,
  onEditTracking
}) {
  const [editing, setEditing] = useState(false);
  const [trackVal, setTrackVal] = useState(fba.tracking || "");
  const missing = fbaEffectiveStatus(fba) === "缺少追踪编码";
  const saveTrack = () => {
    onEditTracking(fba.id, trackVal.trim());
    setEditing(false);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: 8,
      padding: "10px 12px",
      borderBottom: "1px solid var(--border)",
      fontSize: 11,
      alignItems: "start"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      marginBottom: 3,
      lineHeight: 1.4
    }
  }, fba.name), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--tm)",
      marginBottom: 6
    }
  }, fba.fbaId, fba.internalId ? ` · ${fba.internalId}` : ""), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      alignItems: "center",
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: badge("#ede9fe", "#4c1d95", {
      fontWeight: 700,
      fontSize: 11
    })
  }, fba.warehouse), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--tm)"
    }
  }, "\u914D\u9001 ", fmtWindow(fba.windowStart, fba.windowEnd)), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--tm)"
    }
  }, fba.expectedQty, " \u4EF6", fba.receivedQty > 0 ? ` / 已收 ${fba.receivedQty}` : "")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap"
    }
  }, editing ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("input", {
    value: trackVal,
    onChange: e => setTrackVal(e.target.value),
    placeholder: "\u8F93\u5165\u8FFD\u8E2A\u7F16\u7801",
    style: {
      ...inpSm,
      flex: 1,
      minWidth: 140
    },
    autoFocus: true,
    onKeyDown: e => {
      if (e.key === "Enter") saveTrack();
      if (e.key === "Escape") setEditing(false);
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: saveTrack,
    style: {
      background: "#2d7dd2",
      color: "#fff",
      border: "none",
      borderRadius: 6,
      padding: "4px 10px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "\u4FDD\u5B58")) : missing ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: e => {
      e.stopPropagation();
      setTrackVal(fba.tracking || "");
      setEditing(true);
    },
    style: {
      background: "none",
      border: "none",
      padding: 0,
      cursor: "pointer",
      color: "#E24B4A",
      fontSize: 11,
      fontWeight: 600,
      fontFamily: "inherit"
    }
  }, "\u7F3A\u5C11\u8FFD\u8E2A\u7F16\u7801 \xB7 \u70B9\u51FB\u586B\u5199") : /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--tm)",
      cursor: "pointer"
    },
    onClick: e => {
      e.stopPropagation();
      setTrackVal(fba.tracking || "");
      setEditing(true);
    },
    title: "\u70B9\u51FB\u7F16\u8F91"
  }, "\u8FFD\u8E2A ", fba.tracking))), /*#__PURE__*/React.createElement(FbaStatusBadge, {
    fba: fba
  }));
}
function ShipmentGroupCard({
  group,
  expanded,
  onToggleExpand,
  onEdit,
  onEditTracking
}) {
  const stageIdx = HEAD_STAGES.indexOf(group.headStatus);
  const prog = stageIdx >= 0 ? Math.round(stageIdx / (HEAD_STAGES.length - 1) * 100) : 0;
  const bc = batchHeadOverdue(group) ? "#E24B4A" : openExcCount(group) > 0 ? "#e09000" : headStageColor(group.headStatus);
  const d = daysDiff(group.etaArrival);
  const tm = TRANSPORT_META[group.transport] || {
    icon: "📦",
    bg: "#f3f4f6",
    c: "#666"
  };
  const fbaCount = (group.fbaShipments || []).length;
  let etaHint = null;
  if (group.headStatus !== "已到港" && d !== null) {
    if (d < 0) etaHint = /*#__PURE__*/React.createElement("span", {
      style: badge("#fee2e2", "#E24B4A")
    }, "\u5230\u6E2F\u903E\u671F ", Math.abs(d), " \u5929");else if (d === 0) etaHint = /*#__PURE__*/React.createElement("span", {
      style: badge("#fff0d4", "#7a4a00")
    }, "\u4ECA\u65E5\u9884\u8BA1\u5230\u6E2F");else if (d <= 7) etaHint = /*#__PURE__*/React.createElement("span", {
      style: badge("#dceeff", "#1a4e8a")
    }, "\u8FD8\u6709 ", d, " \u5929\u5230\u6E2F");else etaHint = /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: "var(--tm)"
      }
    }, "\u9884\u8BA1\u5230\u6E2F ", fmtD(group.etaArrival));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--card)",
      border: `1px solid ${batchHeadOverdue(group) ? "#fecaca" : "var(--border)"}`,
      borderLeft: `4px solid ${bc}`,
      borderRadius: 12,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 16px",
      cursor: "pointer"
    },
    onClick: onEdit
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap",
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700
    }
  }, group.name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--tm)"
    }
  }, group.sku), /*#__PURE__*/React.createElement("span", {
    style: badge(tm.bg, tm.c)
  }, tm.icon, " ", group.transport), openExcCount(group) > 0 && /*#__PURE__*/React.createElement("span", {
    style: badge("#fff0d4", "#e09000")
  }, "\u26A0 ", openExcCount(group), " \u5F02\u5E38")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, fbaCount, " \u4E2A\u8D27\u4EF6 \xB7 \u5171 ", group.totalQty, " \u4EF6", group.blNumber ? ` · B/L ${group.blNumber}` : "")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: 6,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: group.owner
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, group.owner), /*#__PURE__*/React.createElement(RoleBadge, {
    role: getStaffRole(group.owner)
  })), etaHint)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: headStageColor(group.headStatus)
    }
  }, "\u5934\u7A0B ", group.headStatus), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--tm)"
    }
  }, prog, "%")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 4,
      background: "var(--border)",
      borderRadius: 2,
      overflow: "hidden",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: `${prog}%`,
      background: bc,
      borderRadius: 2
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 0,
      overflowX: "auto"
    }
  }, HEAD_STAGES.map((s, i) => {
    const done = i < stageIdx;
    const active = i === stageIdx;
    const c = active ? headStageColor(s) : done ? "#2d9e52" : "var(--border)";
    return /*#__PURE__*/React.createElement("span", {
      key: s,
      style: {
        display: "flex",
        alignItems: "center",
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        minWidth: 36
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: active ? 10 : 7,
        height: active ? 10 : 7,
        borderRadius: "50%",
        background: c,
        outline: active ? `2px solid ${c}` : "none",
        outlineOffset: 2
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        color: active ? "var(--text)" : done ? "var(--tm)" : "var(--border)",
        fontWeight: active ? 600 : 400
      }
    }, HEAD_STAGE_SHORT[s])), i < HEAD_STAGES.length - 1 && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 16,
        height: 2,
        background: done ? "#2d9e52" : "var(--border)",
        margin: "0 2px",
        marginBottom: 12
      }
    }));
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid var(--border)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 16px",
      background: "var(--bg)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, expanded ? "收起 FBA 货件" : `展开 ${fbaCount} 个 FBA 货件`), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: e => {
      e.stopPropagation();
      onToggleExpand();
    },
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "4px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "#2d7dd2"
    }
  }, expanded ? "▲ 收起" : "▼ 展开")), expanded && /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid var(--border)",
      background: "var(--bg)"
    }
  }, (group.fbaShipments || []).length ? (group.fbaShipments || []).map(f => /*#__PURE__*/React.createElement(FbaRow, {
    key: f.id,
    fba: f,
    onEditTracking: (fid, tracking) => onEditTracking(group.id, fid, tracking)
  })) : /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "1rem",
      textAlign: "center",
      color: "var(--tm)",
      fontSize: 12
    }
  }, "\u6682\u65E0 FBA \u8D27\u4EF6")));
}
function FbaEditorRow({
  fba,
  onChange,
  onRemove
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "10px",
      marginBottom: 8,
      background: "var(--bg)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u8D27\u4EF6\u540D\u79F0"), /*#__PURE__*/React.createElement("input", {
    value: fba.name,
    onChange: e => onChange({
      ...fba,
      name: e.target.value
    }),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "FBA \u8D27\u4EF6\u7F16\u53F7"), /*#__PURE__*/React.createElement("input", {
    value: fba.fbaId,
    onChange: e => onChange({
      ...fba,
      fbaId: e.target.value
    }),
    placeholder: "FBA19...",
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr 1fr",
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5185\u90E8\u7F16\u53F7"), /*#__PURE__*/React.createElement("input", {
    value: fba.internalId,
    onChange: e => onChange({
      ...fba,
      internalId: e.target.value
    }),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u4ED3\u5E93\u4EE3\u7801"), /*#__PURE__*/React.createElement("input", {
    value: fba.warehouse,
    onChange: e => onChange({
      ...fba,
      warehouse: e.target.value.toUpperCase()
    }),
    placeholder: "RDU2",
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u9884\u8BA1\u4EF6\u6570"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: fba.expectedQty,
    onChange: e => onChange({
      ...fba,
      expectedQty: +e.target.value || 0
    }),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5DF2\u6536\u4EF6\u6570"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: fba.receivedQty,
    onChange: e => onChange({
      ...fba,
      receivedQty: +e.target.value || 0
    }),
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr 1fr auto",
      gap: 8,
      alignItems: "end"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u914D\u9001\u5F00\u59CB"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: fba.windowStart,
    onChange: e => onChange({
      ...fba,
      windowStart: e.target.value
    }),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u914D\u9001\u7ED3\u675F"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: fba.windowEnd,
    onChange: e => onChange({
      ...fba,
      windowEnd: e.target.value
    }),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u8FFD\u8E2A\u7F16\u7801"), /*#__PURE__*/React.createElement("input", {
    value: fba.tracking,
    onChange: e => onChange({
      ...fba,
      tracking: e.target.value
    }),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u72B6\u6001"), /*#__PURE__*/React.createElement("select", {
    value: fba.status,
    onChange: e => onChange({
      ...fba,
      status: e.target.value
    }),
    style: {
      ...inp,
      background: "var(--card)"
    }
  }, FBA_STATUSES.map(s => /*#__PURE__*/React.createElement("option", {
    key: s
  }, s)))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onRemove,
    style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      color: "#aaa",
      fontSize: 18,
      padding: "8px 4px"
    }
  }, "\xD7")));
}
function ShipmentModal({
  item,
  ownerExtras,
  onSave,
  onClose,
  onDelete
}) {
  const [form, setForm] = useState(item);
  const [excs, setExcs] = useState(item.exceptions ? item.exceptions.map(e => ({
    ...e
  })) : []);
  const [fbas, setFbas] = useState(item.fbaShipments ? item.fbaShipments.map(s => ({
    ...s
  })) : []);
  const [nextFbaId, setNextFbaId] = useState(() => Math.max(0, ...(item.fbaShipments || []).map(s => s.id)) + 1);
  const [importMsg, setImportMsg] = useState("");
  const fileInputRef = useRef(null);
  const set = (k, v) => setForm(f => ({
    ...f,
    [k]: v
  }));
  const emptyFba = () => ({
    id: nextFbaId,
    name: "",
    fbaId: "",
    internalId: "",
    warehouse: "",
    expectedQty: 0,
    receivedQty: 0,
    windowStart: "",
    windowEnd: "",
    tracking: "",
    status: "准备发货",
    note: ""
  });
  const onCsvPick = async e => {
    const files = e.target.files;
    if (!files?.length) return;
    try {
      const {
        fbaShipments,
        totalQty,
        sku,
        warnings
      } = await readStaCsvFiles(files);
      let nid = nextFbaId;
      const imported = fbaShipments.map(f => ({
        ...f,
        id: nid++
      }));
      setFbas(prev => [...prev, ...imported]);
      setNextFbaId(nid);
      setForm(f => ({
        ...f,
        totalQty: f.totalQty ? f.totalQty : totalQty,
        sku: f.sku || sku,
        name: f.name || (imported.length === 1 ? imported[0].name : f.name)
      }));
      setImportMsg(warnings.length ? `已导入 ${imported.length} 个货件（${warnings.join("；")}）` : `已导入 ${imported.length} 个 STA 货件`);
    } catch (err) {
      setImportMsg(err.message || "CSV 解析失败");
    }
    e.target.value = "";
  };
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.4)",
      zIndex: 200,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: "2rem 1rem",
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 14,
      padding: "1.5rem",
      width: "100%",
      maxWidth: 760,
      color: "var(--text)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 15,
      marginBottom: "1rem"
    }
  }, item.id ? "编辑发货批次" : "新建发货批次"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--tm)",
      marginBottom: 8
    }
  }, "\u6279\u6B21\u4FE1\u606F"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u6279\u6B21\u540D\u79F0"), /*#__PURE__*/React.createElement("input", {
    value: form.name,
    onChange: e => set("name", e.target.value),
    placeholder: "FB100\u7EFF\u8272\u7B2C\u4E09\u6279",
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u4EA7\u54C1 / SKU"), /*#__PURE__*/React.createElement("input", {
    value: form.sku,
    onChange: e => set("sku", e.target.value),
    placeholder: "FB100",
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u603B\u4EF6\u6570"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: form.totalQty,
    onChange: e => set("totalQty", +e.target.value || 0),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u8DDF\u8FDB\u4EBA"), /*#__PURE__*/React.createElement(OwnerField, {
    listId: "logistics-owner",
    value: form.owner,
    onChange: v => set("owner", v),
    extraOwners: ownerExtras,
    inputStyle: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5934\u7A0B\u65B9\u5F0F"), /*#__PURE__*/React.createElement("select", {
    value: form.transport,
    onChange: e => set("transport", e.target.value),
    style: {
      ...inp,
      background: "var(--card)"
    }
  }, Object.keys(TRANSPORT_META).map(t => /*#__PURE__*/React.createElement("option", {
    key: t
  }, t))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u8D27\u4EE3\u516C\u53F8"), /*#__PURE__*/React.createElement("input", {
    value: form.forwarder,
    onChange: e => set("forwarder", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u63D0\u5355\u53F7 B/L"), /*#__PURE__*/React.createElement("input", {
    value: form.blNumber,
    onChange: e => set("blNumber", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u56FD\u5185\u51FA\u8D27\u65E5\u671F"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.shipDate,
    onChange: e => set("shipDate", e.target.value),
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u9884\u8BA1\u51FA\u6E2F"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.etaDeparture,
    onChange: e => set("etaDeparture", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u9884\u8BA1\u5230\u6E2F"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.etaArrival,
    onChange: e => set("etaArrival", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5934\u7A0B\u72B6\u6001"), /*#__PURE__*/React.createElement("select", {
    value: form.headStatus,
    onChange: e => set("headStatus", e.target.value),
    style: {
      ...inp,
      background: "var(--card)"
    }
  }, HEAD_STAGES.map(s => /*#__PURE__*/React.createElement("option", {
    key: s
  }, s))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5907\u6CE8"), /*#__PURE__*/React.createElement("input", {
    value: form.note,
    onChange: e => set("note", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement(ExceptionEditor, {
    excs: excs,
    setExcs: setExcs
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--tm)",
      borderTop: "1px solid var(--border)",
      paddingTop: 10,
      marginBottom: 8,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", null, "FBA \u8D27\u4EF6 (", fbas.length, ")"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("input", {
    ref: fileInputRef,
    type: "file",
    accept: ".csv",
    multiple: true,
    style: {
      display: "none"
    },
    onChange: onCsvPick
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => fileInputRef.current?.click(),
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "4px 10px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "#2d7dd2"
    }
  }, "\uD83D\uDCE5 \u5BFC\u5165 STA CSV"))), importMsg && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: importMsg.includes("失败") || importMsg.includes("不是") ? "#E24B4A" : "#1a6b35",
      marginBottom: 8,
      padding: "6px 10px",
      background: importMsg.includes("失败") || importMsg.includes("不是") ? "#fee2e2" : "#f0faf4",
      borderRadius: 8
    }
  }, importMsg), fbas.map((f, i) => /*#__PURE__*/React.createElement(FbaEditorRow, {
    key: f.id,
    fba: f,
    onChange: v => {
      const a = [...fbas];
      a[i] = v;
      setFbas(a);
    },
    onRemove: () => setFbas(fbas.filter((_, j) => j !== i))
  })), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      setFbas([...fbas, emptyFba()]);
      setNextFbaId(nextFbaId + 1);
    },
    style: {
      width: "100%",
      border: "1px dashed var(--border)",
      borderRadius: 8,
      padding: "6px 0",
      fontSize: 12,
      cursor: "pointer",
      color: "var(--tm)",
      background: "transparent",
      marginBottom: 12,
      fontFamily: "inherit"
    }
  }, "+ \u6DFB\u52A0 FBA \u8D27\u4EF6"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderTop: "1px solid var(--border)",
      paddingTop: 12
    }
  }, item.id ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onDelete,
    style: {
      background: "none",
      border: "none",
      color: "#e55",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "\u5220\u9664\u6279\u6B21") : /*#__PURE__*/React.createElement("div", null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClose,
    style: {
      background: "transparent",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "6px 14px",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "var(--tm)"
    }
  }, "\u53D6\u6D88"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      if (!form.name.trim()) return;
      onSave({
        ...form,
        exceptions: excs,
        fbaShipments: fbas
      });
    },
    style: {
      background: "#2d7dd2",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      padding: "6px 16px",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit",
      fontWeight: 600
    }
  }, "\u4FDD\u5B58")))));
}
function LogisticsPanel() {
  const {
    items,
    meta,
    loading,
    error,
    persist,
    reload
  } = useSharedList("logistics", INIT_LOGISTICS);
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [expanded, setExpanded] = useState({
    1: true
  });
  const panelCsvRef = useRef(null);
  const nextId = () => Math.max(0, ...items.map(i => i.id || 0)) + 1;
  const counts = {
    all: items.length,
    transit: items.filter(batchHeadTransit).length,
    missing_track: items.filter(batchMissingTrack).length,
    receiving: items.filter(batchReceiving).length,
    done: items.filter(batchAllDone).length
  };
  const owners = ownerFilterEntries(items.map(i => i.owner));
  let vis = items.slice();
  if (ownerFilter !== "all") vis = vis.filter(i => i.owner === ownerFilter);
  if (filter === "transit") vis = vis.filter(batchHeadTransit);else if (filter === "missing_track") vis = vis.filter(batchMissingTrack);else if (filter === "receiving") vis = vis.filter(batchReceiving);else if (filter === "done") vis = vis.filter(batchAllDone);
  vis.sort((a, b) => {
    const pa = batchHeadOverdue(a) ? 0 : openExcCount(a) ? 1 : 2;
    const pb = batchHeadOverdue(b) ? 0 : openExcCount(b) ? 1 : 2;
    if (pa !== pb) return pa - pb;
    const da = daysDiff(a.etaArrival),
      db = daysDiff(b.etaArrival);
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
  const save = t => {
    if (t.id) persist(items.map(x => x.id === t.id ? t : x));else persist([...items, {
      ...t,
      id: nextId()
    }]);
    setModal(null);
  };
  const editTracking = (gid, fid, tracking) => {
    persist(items.map(g => g.id !== gid ? g : {
      ...g,
      fbaShipments: (g.fbaShipments || []).map(s => s.id !== fid ? s : {
        ...s,
        tracking,
        status: tracking.trim() && s.status === "准备发货" ? "运输中" : s.status
      })
    }));
  };
  const cloneGroup = g => ({
    ...g,
    exceptions: (g.exceptions || []).map(e => ({
      ...e
    })),
    fbaShipments: (g.fbaShipments || []).map(s => ({
      ...s
    }))
  });
  const emptyGroup = {
    name: "",
    sku: "",
    totalQty: 0,
    owner: "",
    shipDate: "",
    transport: "海运",
    forwarder: "",
    blNumber: "",
    etaDeparture: "",
    etaArrival: "",
    headStatus: "备货中",
    note: "",
    exceptions: [],
    fbaShipments: []
  };
  const onPanelCsvImport = async e => {
    const files = e.target.files;
    if (!files?.length) return;
    try {
      const {
        fbaShipments,
        totalQty,
        sku
      } = await readStaCsvFiles(files);
      const label = files.length === 1 ? fbaShipments[0]?.fbaId || "新批次" : `导入 ${files.length} 个货件`;
      setModal({
        ...emptyGroup,
        name: label,
        sku,
        totalQty,
        fbaShipments
      });
    } catch (err) {
      alert(err.message || "CSV 解析失败");
    }
    e.target.value = "";
  };
  const tabs = [{
    key: "all",
    label: "全部",
    nc: "var(--text)"
  }, {
    key: "transit",
    label: "头程在途",
    nc: "#2d7dd2"
  }, {
    key: "missing_track",
    label: "缺少追踪码",
    nc: "#E24B4A"
  }, {
    key: "receiving",
    label: "FBA接收中",
    nc: "#1a9e8a"
  }, {
    key: "done",
    label: "已完成",
    nc: "#2d9e52"
  }];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SharedMetaLine, {
    meta: meta,
    loading: loading,
    error: error,
    onReload: reload
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "1rem",
      flexWrap: "wrap",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(5, 1fr)",
      gap: 7,
      flex: 1,
      minWidth: 280
    }
  }, tabs.map(f => /*#__PURE__*/React.createElement("div", {
    key: f.key,
    onClick: () => setFilter(f.key),
    style: {
      background: "var(--card)",
      border: `1px solid ${filter === f.key ? "#2d7dd2" : "var(--border)"}`,
      borderRadius: 10,
      padding: "9px 10px",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      color: f.nc
    }
  }, counts[f.key]), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginTop: 1
    }
  }, f.label)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("input", {
    ref: panelCsvRef,
    type: "file",
    accept: ".csv",
    multiple: true,
    style: {
      display: "none"
    },
    onChange: onPanelCsvImport
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => panelCsvRef.current?.click(),
    style: {
      background: "var(--card)",
      color: "#2d7dd2",
      border: "1px solid #2d7dd2",
      borderRadius: 8,
      padding: "8px 14px",
      fontSize: 13,
      cursor: "pointer",
      fontFamily: "inherit",
      fontWeight: 600
    }
  }, "\uD83D\uDCE5 \u5BFC\u5165 CSV"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setModal(emptyGroup),
    style: {
      background: "#2d7dd2",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      padding: "8px 16px",
      fontSize: 13,
      cursor: "pointer",
      fontFamily: "inherit",
      fontWeight: 600
    }
  }, "+ \u65B0\u5EFA\u6279\u6B21"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginBottom: "1rem",
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, "\u8DDF\u8FDB\u4EBA"), owners.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.name,
    onClick: () => setOwnerFilter(o.name),
    style: {
      background: ownerFilter === o.name ? "#2d7dd2" : "var(--card)",
      color: ownerFilter === o.name ? "#fff" : "var(--tm)",
      border: `1px solid ${ownerFilter === o.name ? "#2d7dd2" : "var(--border)"}`,
      borderRadius: 20,
      padding: "4px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      display: "inline-flex",
      alignItems: "center",
      gap: 4
    }
  }, o.name === "all" ? "全部" : /*#__PURE__*/React.createElement(React.Fragment, null, o.name, o.role && /*#__PURE__*/React.createElement(RoleBadge, {
    role: o.role,
    style: {
      padding: "0 5px",
      fontSize: 9
    }
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, vis.length ? vis.map(g => /*#__PURE__*/React.createElement(ShipmentGroupCard, {
    key: g.id,
    group: g,
    expanded: !!expanded[g.id],
    onToggleExpand: () => setExpanded(e => ({
      ...e,
      [g.id]: !e[g.id]
    })),
    onEdit: () => setModal(cloneGroup(g)),
    onEditTracking: editTracking
  })) : /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "2rem",
      color: "var(--tm)",
      fontSize: 13
    }
  }, "\u6682\u65E0\u5339\u914D\u6279\u6B21")), modal && /*#__PURE__*/React.createElement(ShipmentModal, {
    item: modal,
    ownerExtras: items.map(i => i.owner),
    onSave: save,
    onClose: () => setModal(null),
    onDelete: () => {
      setItems(items.filter(x => x.id !== modal.id));
      setModal(null);
    }
  }));
}

// Shared helpers (TODAY, fmtD, Avatar, …) come from LogisticsModule.browser.jsx loaded first.

// ─── PRODUCTION MODULE ─────────────────────────────────────────────────
const PROD_STAGES = ["立项", "打样", "确样", "下单备料", "生产中", "QC验货", "出货", "已完成"];
const prodStageColor = s => ({
  已完成: "#2d9e52",
  出货: "#2d9e52",
  QC验货: "#1a9e8a",
  生产中: "#2d7dd2",
  下单备料: "#7a6dd2",
  确样: "#c07000",
  打样: "#d85a30",
  立项: "#888",
  生产: "#2d7dd2"
})[s] || "#888";
const QC_METHODS = ["自检", "第三方", "工厂自检"];
const QC_RESULTS = ["通过", "不通过", "有条件通过"];
const QC_STYLE = {
  通过: {
    bg: "#d4f0dc",
    c: "#2d9e52"
  },
  不通过: {
    bg: "#fee2e2",
    c: "#e55"
  },
  有条件通过: {
    bg: "#fff0d4",
    c: "#e09000"
  }
};
const EXC_PARTIES = ["工厂", "我方", "供应商", "物料"];
const isShipped = b => ["出货", "已完成"].includes(b.stage);
const openProdExcs = b => (b.exceptions || []).filter(e => !e.resolved);
const deliveryDelta = b => {
  if (!b.actualDelivery || !b.etaDelivery) return null;
  return Math.round((new Date(b.actualDelivery) - new Date(b.etaDelivery)) / 86400000);
};
const deliveryWarning = b => {
  if (isShipped(b) || b.actualDelivery) return null;
  const idx = PROD_STAGES.indexOf(b.stage);
  if (idx >= PROD_STAGES.indexOf("QC验货")) return null;
  const d = daysDiff(b.etaDelivery);
  if (d === null) return null;
  if (d < 0) return {
    level: "over",
    text: `逾期${Math.abs(d)}天`
  };
  if (d <= 3) return {
    level: "urgent",
    text: "紧急"
  };
  if (d <= 7) return {
    level: "soon",
    text: "即将到期"
  };
  return null;
};
const prodBatchStatus = b => {
  if (b.stage === "已完成") return "done";
  if (openProdExcs(b).length) return "blocked";
  const delta = deliveryDelta(b);
  if (delta !== null && delta > 0 && !isShipped(b)) return "overdue";
  const d = daysDiff(b.etaDelivery);
  if (d !== null && d < 0 && !isShipped(b)) return "overdue";
  return "inprog";
};
const isProducing = b => b.stage === "生产中";
const isQcStage = b => b.stage === "QC验货";
const normalizeStage = s => s === "生产" ? "生产中" : s;
const INIT_PROD = [{
  id: 1,
  product: "FB102",
  name: "感温变色款",
  batch: "第一批",
  qty: "500件",
  owner: "李工",
  supplier: "东莞鑫达厂",
  poNumber: "PO20260401",
  orderDate: "2026-04-01",
  etaDelivery: "2026-06-15",
  actualDelivery: "",
  etaShip: "",
  actualShip: "",
  qcMethod: "第三方",
  qcCompany: "SGS",
  qcDate: "",
  qcResult: "",
  qcReportNo: "",
  qcNote: "",
  stage: "打样",
  note: "",
  exceptions: [{
    desc: "感温油墨供应商报价超预期40%",
    date: "2026-05-20",
    impact: "预计延期7天",
    action: "等待管理层决策是否换供应商",
    responsible: "供应商",
    resolved: false,
    resolvedDate: ""
  }]
}, {
  id: 2,
  product: "FB200",
  name: "黑色款",
  batch: "第二批",
  qty: "300件",
  owner: "李工",
  supplier: "宁波精工",
  poNumber: "PO20260415",
  orderDate: "2026-04-15",
  etaDelivery: "2026-05-30",
  actualDelivery: "",
  etaShip: "2026-06-05",
  actualShip: "",
  qcMethod: "工厂自检",
  qcCompany: "",
  qcDate: "",
  qcResult: "",
  qcReportNo: "",
  qcNote: "",
  stage: "生产中",
  note: "",
  exceptions: [{
    desc: "试产缩水问题",
    date: "2026-05-22",
    impact: "质量问题",
    action: "工厂调整模具参数，二次试产中",
    responsible: "工厂",
    resolved: false,
    resolvedDate: ""
  }]
}, {
  id: 3,
  product: "FB200",
  name: "黑色款",
  batch: "第一批",
  qty: "200件",
  owner: "李工",
  supplier: "宁波精工",
  poNumber: "PO20260301",
  orderDate: "2026-03-01",
  etaDelivery: "2026-04-30",
  actualDelivery: "2026-05-02",
  etaShip: "2026-05-10",
  actualShip: "2026-05-12",
  qcMethod: "第三方",
  qcCompany: "BV",
  qcDate: "2026-04-28",
  qcResult: "通过",
  qcReportNo: "BV20260428",
  qcNote: "",
  stage: "已完成",
  note: "",
  exceptions: []
}, {
  id: 4,
  product: "FB400",
  name: "豆浆机",
  batch: "第一批",
  qty: "150件",
  owner: "张工",
  supplier: "顺德家电厂",
  poNumber: "PO20260420",
  orderDate: "2026-04-20",
  etaDelivery: "2026-06-30",
  actualDelivery: "",
  etaShip: "",
  actualShip: "",
  qcMethod: "自检",
  qcCompany: "",
  qcDate: "2026-05-25",
  qcResult: "有条件通过",
  qcReportNo: "QC-FB400-01",
  qcNote: "闪光按键需复测",
  stage: "QC验货",
  note: "",
  exceptions: []
}, {
  id: 5,
  product: "FB501",
  name: "变体款",
  batch: "第一批",
  qty: "200件",
  owner: "张工",
  supplier: "待定点",
  poNumber: "",
  orderDate: "",
  etaDelivery: "2026-07-15",
  actualDelivery: "",
  etaShip: "",
  actualShip: "",
  qcMethod: "自检",
  qcCompany: "",
  qcDate: "",
  qcResult: "",
  qcReportNo: "",
  qcNote: "",
  stage: "立项",
  note: "方案讨论中",
  exceptions: []
}];
function ProdExceptionEditor({
  excs,
  setExcs
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--tm)",
      borderTop: "1px solid var(--border)",
      paddingTop: 10,
      marginBottom: 8
    }
  }, "\u5F02\u5E38\u8BB0\u5F55"), excs.map((ex, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      background: ex.resolved ? "#f0faf4" : "#fff8e6",
      border: `1px solid ${ex.resolved ? "#b7e4c7" : "#ffe0a0"}`,
      borderRadius: 8,
      padding: "10px 12px",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: ex.desc,
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        desc: e.target.value
      };
      setExcs(a);
    },
    placeholder: "\u5F02\u5E38\u63CF\u8FF0",
    style: {
      ...inpSm,
      width: "100%",
      marginBottom: 6
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: ex.date,
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        date: e.target.value
      };
      setExcs(a);
    },
    style: inpSm
  }), /*#__PURE__*/React.createElement("input", {
    value: ex.impact || "",
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        impact: e.target.value
      };
      setExcs(a);
    },
    placeholder: "\u5F71\u54CD\uFF08\u5982\uFF1A\u9884\u8BA1\u5EF6\u671F5\u5929\uFF09",
    style: inpSm
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: 8,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: ex.action || "",
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        action: e.target.value
      };
      setExcs(a);
    },
    placeholder: "\u5904\u7406\u65B9\u5F0F",
    style: inpSm
  }), /*#__PURE__*/React.createElement("select", {
    value: ex.responsible || "工厂",
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        responsible: e.target.value
      };
      setExcs(a);
    },
    style: {
      ...inpSm,
      background: "var(--card)",
      width: 88
    }
  }, EXC_PARTIES.map(p => /*#__PURE__*/React.createElement("option", {
    key: p
  }, p)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      fontSize: 11,
      color: "var(--tm)",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: !!ex.resolved,
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        resolved: e.target.checked
      };
      setExcs(a);
    }
  }), "\u5DF2\u89E3\u51B3"), ex.resolved && /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: ex.resolvedDate || "",
    onChange: e => {
      const a = [...excs];
      a[i] = {
        ...ex,
        resolvedDate: e.target.value
      };
      setExcs(a);
    },
    style: {
      ...inpSm,
      width: 120
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setExcs(excs.filter((_, j) => j !== i)),
    style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      color: "#aaa",
      fontSize: 16,
      marginLeft: "auto"
    }
  }, "\xD7")))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setExcs([...excs, {
      desc: "",
      date: TODAY.toISOString().split("T")[0],
      impact: "",
      action: "",
      responsible: "工厂",
      resolved: false,
      resolvedDate: ""
    }]),
    style: {
      width: "100%",
      border: "1px dashed var(--border)",
      borderRadius: 8,
      padding: "5px 0",
      fontSize: 12,
      cursor: "pointer",
      color: "var(--tm)",
      background: "transparent",
      marginBottom: 12,
      fontFamily: "inherit"
    }
  }, "+ \u8BB0\u5F55\u5F02\u5E38"));
}
function ProdModal({
  item,
  ownerExtras,
  onSave,
  onClose,
  onDelete
}) {
  const [form, setForm] = useState({
    ...item,
    stage: normalizeStage(item.stage)
  });
  const [excs, setExcs] = useState(item.exceptions ? item.exceptions.map(e => ({
    ...e
  })) : []);
  const set = (k, v) => setForm(f => ({
    ...f,
    [k]: v
  }));
  const delta = deliveryDelta(form);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.4)",
      zIndex: 200,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: "2rem 1rem",
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 14,
      padding: "1.5rem",
      width: "100%",
      maxWidth: 720,
      color: "var(--text)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 15,
      marginBottom: "1rem"
    }
  }, item.id ? "编辑生产批次" : "新建生产批次"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--tm)",
      marginBottom: 8
    }
  }, "\u57FA\u672C\u4FE1\u606F"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u4EA7\u54C1\u7F16\u53F7"), /*#__PURE__*/React.createElement("input", {
    value: form.product,
    onChange: e => set("product", e.target.value),
    placeholder: "FB200",
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u6B3E\u5F0F\u540D\u79F0"), /*#__PURE__*/React.createElement("input", {
    value: form.name,
    onChange: e => set("name", e.target.value),
    placeholder: "\u9ED1\u8272\u6B3E",
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u6279\u6B21"), /*#__PURE__*/React.createElement("input", {
    value: form.batch,
    onChange: e => set("batch", e.target.value),
    placeholder: "\u7B2C\u4E8C\u6279",
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u8BA2\u5355\u6570\u91CF"), /*#__PURE__*/React.createElement("input", {
    value: form.qty,
    onChange: e => set("qty", e.target.value),
    placeholder: "500\u4EF6",
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u8DDF\u8FDB\u4EBA"), /*#__PURE__*/React.createElement(OwnerField, {
    listId: "production-owner",
    value: form.owner,
    onChange: v => set("owner", v),
    extraOwners: ownerExtras,
    inputStyle: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u4F9B\u5E94\u5546"), /*#__PURE__*/React.createElement("input", {
    value: form.supplier || "",
    onChange: e => set("supplier", e.target.value),
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5408\u540C / PO \u7F16\u53F7"), /*#__PURE__*/React.createElement("input", {
    value: form.poNumber || "",
    onChange: e => set("poNumber", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5F53\u524D\u9636\u6BB5"), /*#__PURE__*/React.createElement("select", {
    value: form.stage,
    onChange: e => set("stage", e.target.value),
    style: {
      ...inp,
      background: "var(--card)"
    }
  }, PROD_STAGES.map(s => /*#__PURE__*/React.createElement("option", {
    key: s
  }, s))))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--tm)",
      borderTop: "1px solid var(--border)",
      paddingTop: 10,
      marginBottom: 8
    }
  }, "\u65F6\u95F4\u8282\u70B9"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u4E0B\u5355\u65E5\u671F"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.orderDate,
    onChange: e => set("orderDate", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u9884\u8BA1\u4EA4\u671F"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.etaDelivery,
    onChange: e => set("etaDelivery", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5B9E\u9645\u4EA4\u671F"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.actualDelivery,
    onChange: e => set("actualDelivery", e.target.value),
    style: inp
  }))), delta !== null && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      marginBottom: 10,
      padding: "6px 10px",
      borderRadius: 8,
      background: delta > 0 ? "#fee2e2" : "#f0faf4",
      color: delta > 0 ? "#b91c1c" : "#1a6b35"
    }
  }, "\u4EA4\u671F\u5BF9\u6BD4\uFF1A", delta > 0 ? `晚 ${delta} 天` : delta < 0 ? `提前 ${Math.abs(delta)} 天` : "准时"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u9884\u8BA1\u51FA\u8D27\u65E5"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.etaShip || "",
    onChange: e => set("etaShip", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5B9E\u9645\u51FA\u8D27\u65E5"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.actualShip || "",
    onChange: e => set("actualShip", e.target.value),
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--tm)",
      borderTop: "1px solid var(--border)",
      paddingTop: 10,
      marginBottom: 8
    }
  }, "QC \u4FE1\u606F"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      marginBottom: 10,
      flexWrap: "wrap"
    }
  }, QC_METHODS.map(m => /*#__PURE__*/React.createElement("label", {
    key: m,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      fontSize: 12,
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: "qcMethod",
    checked: form.qcMethod === m,
    onChange: () => set("qcMethod", m)
  }), m))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, form.qcMethod === "第三方" && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "QC \u516C\u53F8"), /*#__PURE__*/React.createElement("input", {
    value: form.qcCompany || "",
    onChange: e => set("qcCompany", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "QC \u65E5\u671F"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.qcDate || "",
    onChange: e => set("qcDate", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "QC \u7ED3\u8BBA"), /*#__PURE__*/React.createElement("select", {
    value: form.qcResult || "",
    onChange: e => set("qcResult", e.target.value),
    style: {
      ...inp,
      background: "var(--card)"
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "\u2014"), QC_RESULTS.map(r => /*#__PURE__*/React.createElement("option", {
    key: r
  }, r))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "QC \u62A5\u544A\u7F16\u53F7"), /*#__PURE__*/React.createElement("input", {
    value: form.qcReportNo || "",
    onChange: e => set("qcReportNo", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "QC \u5907\u6CE8"), /*#__PURE__*/React.createElement("input", {
    value: form.qcNote || "",
    onChange: e => set("qcNote", e.target.value),
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5907\u6CE8"), /*#__PURE__*/React.createElement("input", {
    value: form.note || "",
    onChange: e => set("note", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement(ProdExceptionEditor, {
    excs: excs,
    setExcs: setExcs
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderTop: "1px solid var(--border)",
      paddingTop: 12
    }
  }, item.id ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onDelete,
    style: {
      background: "none",
      border: "none",
      color: "#e55",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "\u5220\u9664") : /*#__PURE__*/React.createElement("div", null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClose,
    style: {
      background: "transparent",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "6px 14px",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "var(--tm)"
    }
  }, "\u53D6\u6D88"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      if (!form.product.trim()) return;
      onSave({
        ...form,
        exceptions: excs
      });
    },
    style: {
      background: "#2d7dd2",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      padding: "6px 16px",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit",
      fontWeight: 600
    }
  }, "\u4FDD\u5B58")))));
}
function ProdBatchCard({
  item,
  onClick
}) {
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
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderLeft: `3px solid ${bc}`,
      borderRadius: 10,
      padding: "12px 14px",
      cursor: "pointer",
      marginBottom: 8
    },
    onMouseEnter: e => e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)",
    onMouseLeave: e => e.currentTarget.style.boxShadow = "none"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap",
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600
    }
  }, item.batch), item.supplier && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, item.supplier), /*#__PURE__*/React.createElement("span", {
    style: badge(st === "done" ? "#d4f0dc" : st === "blocked" ? "#fff0d4" : st === "overdue" ? "#fee2e2" : "#dceeff", st === "done" ? "#1a6b35" : st === "blocked" ? "#7a4a00" : st === "overdue" ? "#b91c1c" : "#1a4e8a")
  }, stage))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: item.owner
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, item.owner), /*#__PURE__*/React.createElement(RoleBadge, {
    role: getStaffRole(item.owner)
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      flexWrap: "nowrap",
      gap: 0,
      marginBottom: 8,
      overflowX: "auto",
      paddingBottom: 2
    }
  }, PROD_STAGES.map((s, i) => {
    const done = i < stageIdx;
    const active = i === stageIdx;
    const c = active ? prodStageColor(s) : done ? "#2d9e52" : "var(--border)";
    return /*#__PURE__*/React.createElement("span", {
      key: s,
      style: {
        display: "flex",
        alignItems: "center",
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 3
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: active ? 10 : 7,
        height: active ? 10 : 7,
        borderRadius: "50%",
        background: c,
        outline: active ? `2px solid ${c}` : "none",
        outlineOffset: 2,
        display: "inline-block"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        color: active ? "var(--text)" : done ? "var(--tm)" : "var(--border)",
        fontWeight: active ? 600 : 400,
        whiteSpace: "nowrap"
      }
    }, s === "下单备料" ? "备料" : s === "生产中" ? "生产" : s.replace("QC验货", "QC"))), i < PROD_STAGES.length - 1 && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 10,
        height: 2,
        background: done ? "#2d9e52" : "var(--border)",
        margin: "0 2px"
      }
    }));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      display: "flex",
      gap: 12,
      flexWrap: "wrap",
      marginBottom: 8
    }
  }, item.orderDate && /*#__PURE__*/React.createElement("span", null, "\u4E0B\u5355 ", fmtD(item.orderDate)), item.etaDelivery && /*#__PURE__*/React.createElement("span", null, "\u9884\u8BA1\u4EA4\u671F ", fmtD(item.etaDelivery)), item.actualDelivery && /*#__PURE__*/React.createElement("span", {
    style: {
      color: delta > 0 ? "#e55" : "#2d9e52"
    }
  }, "\u5B9E\u4EA4 ", fmtD(item.actualDelivery), delta !== null && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 4
    }
  }, "(", delta > 0 ? `晚${delta}天` : delta < 0 ? `提前${Math.abs(delta)}天` : "准时", ")")), warn && /*#__PURE__*/React.createElement("span", {
    style: badge(warn.level === "over" || warn.level === "urgent" ? "#fee2e2" : "#fff0d4", warn.level === "over" || warn.level === "urgent" ? "#b91c1c" : "#7a4a00")
  }, warn.text)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, qc && /*#__PURE__*/React.createElement("span", {
    style: badge(qc.bg, qc.c)
  }, "QC ", item.qcResult), openExcs.length > 0 && /*#__PURE__*/React.createElement("span", {
    style: badge("#fee2e2", "#b91c1c")
  }, "\u26A0 ", openExcs.length, " \u5F02\u5E38"), item.qty && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, item.qty), item.updatedAt && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--tm)"
    }
  }, "\u66F4\u65B0 ", formatSharedTime(item.updatedAt))), openExcs.map((ex, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    onClick: e => e.stopPropagation(),
    style: {
      marginTop: 7,
      padding: "6px 10px",
      background: "#fff8e6",
      color: "#7a4a00",
      borderRadius: 7,
      fontSize: 11,
      lineHeight: 1.5,
      borderLeft: "3px solid #e09000"
    }
  }, "\u26A1 ", ex.desc, ex.impact && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#555"
    }
  }, " \xB7 ", ex.impact), ex.action && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#555"
    }
  }, " \u2192 ", ex.action), ex.responsible && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#888"
    }
  }, " [", ex.responsible, "]"))), resolvedExcs.length > 0 && /*#__PURE__*/React.createElement("div", {
    onClick: e => {
      e.stopPropagation();
      setShowResolved(!showResolved);
    },
    style: {
      marginTop: 6,
      fontSize: 10,
      color: "var(--tm)",
      cursor: "pointer"
    }
  }, showResolved ? "▲ 收起" : "▼", " \u5DF2\u89E3\u51B3 ", resolvedExcs.length, " \u6761", showResolved && resolvedExcs.map((ex, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      marginTop: 4,
      padding: "4px 8px",
      background: "#f0faf4",
      borderRadius: 6,
      color: "#666"
    }
  }, ex.desc))));
}
function ProductGroup({
  product,
  name,
  batches,
  onEdit
}) {
  const hasOpenExc = batches.some(b => openProdExcs(b).length > 0);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
      padding: "8px 12px",
      background: "var(--bg)",
      borderRadius: 10,
      border: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700
    }
  }, product), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--tm)"
    }
  }, name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, batches.length, " \u4E2A\u6279\u6B21"), hasOpenExc && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: "#e55",
      flexShrink: 0
    },
    title: "\u6709\u672A\u89E3\u51B3\u5F02\u5E38"
  })), batches.map(b => /*#__PURE__*/React.createElement(ProdBatchCard, {
    key: b.id,
    item: b,
    onClick: () => onEdit(b)
  })));
}
function ProductionPanel() {
  const {
    items,
    meta,
    loading,
    error,
    persist,
    reload
  } = useSharedList("production", INIT_PROD.map(b => ({
    ...b,
    stage: normalizeStage(b.stage)
  })));
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
    done: items.filter(i => i.stage === "已完成").length
  };
  const owners = ownerFilterEntries(items.map(i => i.owner));
  const suppliers = ["all", ...new Set(items.map(i => i.supplier).filter(Boolean))];
  let vis = items.slice();
  if (tabFilter === "blocked") vis = vis.filter(i => prodBatchStatus(i) === "blocked");else if (tabFilter === "overdue") vis = vis.filter(i => prodBatchStatus(i) === "overdue");else if (tabFilter === "producing") vis = vis.filter(isProducing);else if (tabFilter === "qc") vis = vis.filter(isQcStage);else if (tabFilter === "done") vis = vis.filter(i => i.stage === "已完成");
  if (stageFilter !== "all") vis = vis.filter(i => normalizeStage(i.stage) === stageFilter);
  if (ownerFilter !== "all") vis = vis.filter(i => i.owner === ownerFilter);
  if (supplierFilter !== "all") vis = vis.filter(i => i.supplier === supplierFilter);
  if (excOnly) vis = vis.filter(i => openProdExcs(i).length > 0);
  const groups = {};
  vis.forEach(b => {
    const key = `${b.product}::${b.name}`;
    if (!groups[key]) groups[key] = {
      product: b.product,
      name: b.name,
      batches: []
    };
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
    product: "",
    name: "",
    batch: "第一批",
    qty: "",
    owner: "",
    supplier: "",
    poNumber: "",
    orderDate: "",
    etaDelivery: "",
    actualDelivery: "",
    etaShip: "",
    actualShip: "",
    qcMethod: "自检",
    qcCompany: "",
    qcDate: "",
    qcResult: "",
    qcReportNo: "",
    qcNote: "",
    stage: "立项",
    note: "",
    exceptions: []
  };
  const save = t => {
    const now = Date.now();
    if (t.id) persist(items.map(x => x.id === t.id ? {
      ...t,
      updatedAt: now
    } : x));else persist([...items, {
      ...t,
      id: Math.max(0, ...items.map(x => x.id || 0)) + 1,
      updatedAt: now
    }]);
    setModal(null);
  };
  const clone = b => ({
    ...b,
    exceptions: (b.exceptions || []).map(e => ({
      ...e
    }))
  });
  const tabs = [{
    key: "all",
    label: "全部",
    nc: "var(--text)"
  }, {
    key: "blocked",
    label: "异常未解决",
    nc: "#e09000"
  }, {
    key: "overdue",
    label: "逾期未交",
    nc: "#e55"
  }, {
    key: "producing",
    label: "生产中",
    nc: "#2d7dd2"
  }, {
    key: "qc",
    label: "QC中",
    nc: "#1a9e8a"
  }, {
    key: "done",
    label: "已完成",
    nc: "#2d9e52"
  }];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SharedMetaLine, {
    meta: meta,
    loading: loading,
    error: error,
    onReload: reload
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: "1rem",
      flexWrap: "wrap",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(6, 1fr)",
      gap: 7,
      flex: 1,
      minWidth: 320
    }
  }, tabs.map(f => /*#__PURE__*/React.createElement("div", {
    key: f.key,
    onClick: () => setTabFilter(f.key),
    style: {
      background: "var(--card)",
      border: `1px solid ${tabFilter === f.key ? "#2d7dd2" : "var(--border)"}`,
      borderRadius: 10,
      padding: "9px 8px",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      color: f.nc
    }
  }, counts[f.key]), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginTop: 1
    }
  }, f.label)))), /*#__PURE__*/React.createElement("button", {
    onClick: () => setModal(emptyBatch),
    style: {
      background: "#2d7dd2",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      padding: "8px 16px",
      fontSize: 13,
      cursor: "pointer",
      fontFamily: "inherit",
      fontWeight: 600,
      flexShrink: 0
    }
  }, "+ \u65B0\u5EFA\u6279\u6B21")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginBottom: "1rem",
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("select", {
    value: stageFilter,
    onChange: e => setStageFilter(e.target.value),
    style: {
      ...inpSm,
      background: "var(--card)",
      width: "auto"
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "\u5168\u90E8\u9636\u6BB5"), PROD_STAGES.map(s => /*#__PURE__*/React.createElement("option", {
    key: s,
    value: s
  }, s))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, "\u8DDF\u8FDB\u4EBA"), owners.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.name,
    type: "button",
    onClick: () => setOwnerFilter(o.name),
    style: {
      background: ownerFilter === o.name ? "#2d7dd2" : "var(--card)",
      color: ownerFilter === o.name ? "#fff" : "var(--tm)",
      border: `1px solid ${ownerFilter === o.name ? "#2d7dd2" : "var(--border)"}`,
      borderRadius: 20,
      padding: "4px 10px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      display: "inline-flex",
      alignItems: "center",
      gap: 4
    }
  }, o.name === "all" ? "全部" : /*#__PURE__*/React.createElement(React.Fragment, null, o.name, o.role && /*#__PURE__*/React.createElement(RoleBadge, {
    role: o.role,
    style: {
      padding: "0 5px",
      fontSize: 9
    }
  })))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginLeft: 4
    }
  }, "\u4F9B\u5E94\u5546"), suppliers.slice(0, 6).map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    type: "button",
    onClick: () => setSupplierFilter(s),
    style: {
      background: supplierFilter === s ? "#7a6dd2" : "var(--card)",
      color: supplierFilter === s ? "#fff" : "var(--tm)",
      border: `1px solid ${supplierFilter === s ? "#7a6dd2" : "var(--border)"}`,
      borderRadius: 20,
      padding: "4px 10px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, s === "all" ? "全部" : s)), /*#__PURE__*/React.createElement("label", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      fontSize: 11,
      color: "var(--tm)",
      cursor: "pointer",
      marginLeft: 4
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: excOnly,
    onChange: e => setExcOnly(e.target.checked)
  }), "\u53EA\u770B\u5F02\u5E38")), /*#__PURE__*/React.createElement("div", null, groupList.length ? groupList.map(g => /*#__PURE__*/React.createElement(ProductGroup, {
    key: `${g.product}-${g.name}`,
    product: g.product,
    name: g.name,
    batches: g.batches,
    onEdit: b => setModal(clone(b))
  })) : /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "2rem",
      color: "var(--tm)",
      fontSize: 13
    }
  }, "\u6682\u65E0\u5339\u914D\u6279\u6B21")), modal && /*#__PURE__*/React.createElement(ProdModal, {
    item: modal,
    ownerExtras: items.map(i => i.owner),
    onSave: save,
    onClose: () => setModal(null),
    onDelete: () => {
      setItems(items.filter(x => x.id !== modal.id));
      setModal(null);
    }
  }));
}

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
  icon: "📄"
};
const loadOnlineDocs = () => {
  try {
    const raw = localStorage.getItem(ONLINE_DOCS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {/* ignore */}
  const legacyUrl = localStorage.getItem(URL_STORAGE_PREFIX + "online-doc");
  const legacyName = localStorage.getItem(NAME_STORAGE_PREFIX + "online-doc");
  const docs = [{
    ...DEFAULT_ONLINE_DOC,
    name: legacyName || DEFAULT_ONLINE_DOC.name,
    url: legacyUrl || DEFAULT_ONLINE_DOC.url
  }];
  saveOnlineDocs(docs);
  return docs;
};
const saveOnlineDocs = docs => {
  try {
    localStorage.setItem(ONLINE_DOCS_KEY, JSON.stringify(docs));
  } catch {/* ignore */}
};
const onlineDocToTool = doc => ({
  id: doc.id,
  name: doc.name || "在线文档",
  desc: doc.desc || DEFAULT_ONLINE_DOC.desc,
  icon: doc.icon || "📄",
  category: "运营",
  configurableUrl: true,
  defaultUrl: doc.url || "",
  isOnlineDoc: true
});
const toolUrl = (tool, customUrls = {}) => {
  if (tool.isOnlineDoc) return tool.defaultUrl || "";
  if (tool.configurableUrl) return customUrls[tool.id] || tool.defaultUrl || "";
  return tool.url || tool.openUrl;
};
const toolDisplayName = (tool, customNames = {}) => {
  if (tool.isOnlineDoc) return tool.name;
  return tool.configurableUrl && customNames[tool.id] ? customNames[tool.id] : tool.name;
};
const isLocalOpsServer = () => location.hostname === "localhost" || location.hostname === "127.0.0.1";
const resolveToolUrl = url => {
  if (!url) return "";
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
};
const openToolUrl = url => {
  const target = resolveToolUrl(url);
  if (!target) return false;
  window.open(target, "_blank", "noopener,noreferrer");
  return true;
};
const downloadToolPackage = tool => {
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
    groups: [{
      name: "公制",
      units: [{
        id: "t",
        name: "吨",
        sym: "t",
        factor: 1000
      }, {
        id: "kg",
        name: "千克",
        sym: "kg",
        factor: 1
      }, {
        id: "g",
        name: "克",
        sym: "g",
        factor: 0.001
      }, {
        id: "mg",
        name: "毫克",
        sym: "mg",
        factor: 1e-6
      }]
    }, {
      name: "英制",
      units: [{
        id: "lb",
        name: "磅",
        sym: "lb",
        factor: 0.45359237
      }, {
        id: "oz",
        name: "盎司",
        sym: "oz",
        factor: 0.028349523125
      }]
    }],
    defaults: {
      left: "kg",
      right: "lb",
      leftVal: "1"
    }
  },
  length: {
    label: "长度",
    base: "m",
    groups: [{
      name: "公制",
      units: [{
        id: "km",
        name: "千米",
        sym: "km",
        factor: 1000
      }, {
        id: "m",
        name: "米",
        sym: "m",
        factor: 1
      }, {
        id: "cm",
        name: "厘米",
        sym: "cm",
        factor: 0.01
      }, {
        id: "mm",
        name: "毫米",
        sym: "mm",
        factor: 0.001
      }]
    }, {
      name: "英制",
      units: [{
        id: "mile",
        name: "英里",
        sym: "mi",
        factor: 1609.344
      }, {
        id: "ft",
        name: "英尺",
        sym: "ft",
        factor: 0.3048
      }, {
        id: "in",
        name: "英寸",
        sym: "in",
        factor: 0.0254
      }]
    }],
    defaults: {
      left: "m",
      right: "cm",
      leftVal: "1"
    }
  }
};
const allUnits = cat => UNIT_CATALOG[cat].groups.flatMap(g => g.units);
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
const unitLabel = u => u ? `${u.name}(${u.sym})` : "";
function UnitPicker({
  cat,
  selected,
  onSelect,
  onClose
}) {
  const cfg = UNIT_CATALOG[cat];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      border: "1px solid var(--border)",
      borderRadius: 10,
      overflow: "hidden",
      background: "var(--card)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 0
    }
  }, cfg.groups.map(g => /*#__PURE__*/React.createElement("div", {
    key: g.name,
    style: {
      padding: "10px 12px",
      borderRight: g.name === cfg.groups[0]?.name ? "1px solid var(--border)" : "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginBottom: 8,
      fontWeight: 600
    }
  }, g.name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 2
    }
  }, g.units.map(u => /*#__PURE__*/React.createElement("button", {
    key: u.id,
    type: "button",
    onClick: () => {
      onSelect(u.id);
      onClose();
    },
    style: {
      textAlign: "left",
      background: selected === u.id ? "rgba(45,125,210,0.12)" : "transparent",
      color: selected === u.id ? "#2d7dd2" : "var(--text)",
      border: "none",
      borderRadius: 6,
      padding: "7px 10px",
      fontSize: 13,
      cursor: "pointer",
      fontFamily: "inherit",
      fontWeight: selected === u.id ? 600 : 400
    }
  }, unitLabel(u))))))));
}
function UnitConverterTool() {
  const [cat, setCat] = useState("mass");
  const [leftUnit, setLeftUnit] = useState("kg");
  const [rightUnit, setRightUnit] = useState("lb");
  const [leftVal, setLeftVal] = useState("1");
  const [rightVal, setRightVal] = useState("2.2046");
  const [picker, setPicker] = useState(null);
  const applyDefaults = nextCat => {
    const d = UNIT_CATALOG[nextCat].defaults;
    setLeftUnit(d.left);
    setRightUnit(d.right);
    setLeftVal(d.leftVal);
    setRightVal(convert(d.leftVal, d.left, d.right, nextCat));
    setPicker(null);
  };
  const switchCat = nextCat => {
    setCat(nextCat);
    applyDefaults(nextCat);
  };
  const onLeftVal = v => {
    setLeftVal(v);
    setRightVal(convert(v, leftUnit, rightUnit, cat));
  };
  const onRightVal = v => {
    setRightVal(v);
    setLeftVal(convert(v, rightUnit, leftUnit, cat));
  };
  const onLeftUnit = id => {
    setLeftUnit(id);
    setRightVal(convert(leftVal, id, rightUnit, cat));
  };
  const onRightUnit = id => {
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
  const summary = ratio ? `1${leftU.name}=${fmtConvNum(ratio, true)}${rightU.name}` : "";
  const boxStyle = {
    flex: 1,
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    background: "var(--bg)"
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 0,
      marginBottom: 16,
      borderBottom: "1px solid var(--border)"
    }
  }, Object.entries(UNIT_CATALOG).map(([key, cfg]) => /*#__PURE__*/React.createElement("button", {
    key: key,
    type: "button",
    onClick: () => switchCat(key),
    style: {
      background: cat === key ? "var(--card)" : "transparent",
      color: cat === key ? "#2d7dd2" : "var(--tm)",
      border: "none",
      borderBottom: cat === key ? "2px solid #2d7dd2" : "2px solid transparent",
      padding: "10px 20px",
      fontSize: 14,
      fontWeight: cat === key ? 600 : 400,
      cursor: "pointer",
      fontFamily: "inherit",
      marginBottom: -1
    }
  }, cfg.label))), summary && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 700,
      marginBottom: 20,
      letterSpacing: "-0.02em"
    }
  }, summary), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "stretch",
      gap: 10,
      marginBottom: picker ? 0 : 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: boxStyle
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    inputMode: "decimal",
    value: leftVal,
    onChange: e => onLeftVal(e.target.value),
    style: {
      width: "100%",
      border: "none",
      background: "transparent",
      fontSize: 28,
      fontWeight: 600,
      padding: "16px 14px 8px",
      fontFamily: "inherit",
      color: "var(--text)",
      outline: "none",
      boxSizing: "border-box"
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setPicker(picker === "left" ? null : "left"),
    style: {
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
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", null, unitLabel(leftU)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--tm)"
    }
  }, picker === "left" ? "▲" : "▼"))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: swap,
    title: "\u4E92\u6362\u5355\u4F4D\u4E0E\u6570\u503C",
    style: {
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
      flexShrink: 0
    }
  }, "\u21C4"), /*#__PURE__*/React.createElement("div", {
    style: boxStyle
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    inputMode: "decimal",
    value: rightVal,
    onChange: e => onRightVal(e.target.value),
    style: {
      width: "100%",
      border: "none",
      background: "transparent",
      fontSize: 28,
      fontWeight: 600,
      padding: "16px 14px 8px",
      fontFamily: "inherit",
      color: "var(--text)",
      outline: "none",
      boxSizing: "border-box"
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setPicker(picker === "right" ? null : "right"),
    style: {
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
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", null, unitLabel(rightU)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--tm)"
    }
  }, picker === "right" ? "▲" : "▼")))), picker && /*#__PURE__*/React.createElement(UnitPicker, {
    cat: cat,
    selected: picker === "left" ? leftUnit : rightUnit,
    onSelect: picker === "left" ? onLeftUnit : onRightUnit,
    onClose: () => setPicker(null)
  }));
}
const TOOL_CATALOG = [{
  id: "weight-converter",
  name: "单位换算",
  desc: "质量与长度实时换算，支持多单位切换",
  icon: "⚖️",
  category: "常用",
  component: UnitConverterTool
}, {
  id: "fba-profit",
  name: "FBA 利润计算器",
  desc: "全链路利润：体积重、尺寸分档、头程 / 佣金 / 退货",
  icon: "💰",
  category: "FBA",
  openUrl: "fba-profit-calculator.html"
}, {
  id: "fba-warehouse",
  name: "FBA 分仓工具",
  desc: "美国货运参谋：分仓方案、头程与仓储费用测算",
  icon: "📦",
  category: "FBA",
  openUrl: "fba-warehouse-tool.html"
}, {
  id: "amazon-tracker",
  name: "亚马逊推广追踪",
  desc: "精铺/精品 · 月度规划 · 投入产出分析",
  icon: "📦",
  category: "运营",
  url: "https://guangdongperfect2024-ctrl.github.io/amazon-tracker/"
}, {
  id: "mailwatch",
  name: "MailWatch 邮件分析",
  desc: "亚马逊邮件 AI 分析 · 解压后双击「启动 MailWatch.bat」；本机 run.bat 可一键打开",
  icon: "📧",
  category: "运营",
  runtime: "local",
  autoLaunch: true,
  defaultUrl: "http://127.0.0.1:8000",
  downloadUrl: "packages/mailwatch-win.zip",
  downloadName: "mailwatch-win.zip"
}, {
  id: "disk-cleaner",
  name: "C 盘垃圾清理",
  desc: "扫描并清理 2345 / 360 / 鲁大师等残留；保护 QQ、微信、百度网盘、WPS",
  icon: "🧹",
  category: "系统",
  runtime: "local",
  target: "inline",
  openUrl: "tools/disk-cleaner/index.html",
  downloadUrl: "packages/disk-cleaner-win.zip"
}];
const loadCustomUrls = () => {
  const saved = {};
  for (const t of TOOL_CATALOG) {
    if (!t.configurableUrl) continue;
    try {
      const v = localStorage.getItem(URL_STORAGE_PREFIX + t.id);
      if (v) saved[t.id] = v;
    } catch {/* ignore */}
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
    } catch {/* ignore */}
  }
  return saved;
};
const TOOL_CATEGORIES = ["全部", ...new Set(TOOL_CATALOG.map(t => t.category))];
const lblSm = {
  display: "block",
  fontSize: 10,
  color: "var(--tm)",
  marginBottom: 3
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function openMailWatch(tool) {
  const appUrl = tool.defaultUrl || "http://127.0.0.1:8000";
  const tab = window.open("about:blank", "_blank", "noopener,noreferrer");
  let target = appUrl;
  try {
    const statusRes = await fetch("/api/mailwatch/status");
    if (statusRes.ok) {
      const status = await statusRes.json();
      if (status.appUrl) target = status.appUrl;
      if (!status.running) {
        await fetch("/api/mailwatch/launch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            action: "start"
          })
        });
        for (let i = 0; i < 20; i++) {
          await sleep(1500);
          const next = await fetch("/api/mailwatch/status").then(r => r.json()).catch(() => null);
          if (next?.running) break;
        }
      }
    }
  } catch {/* ignore */}
  if (tab) tab.location.href = target;else openToolUrl(target);
}
function ToolCard({
  tool,
  displayName,
  resolvedUrl,
  isEditing,
  editName,
  editUrl,
  onOpen,
  onStartEdit,
  onEditNameChange,
  onEditUrlChange,
  onEditSave,
  onEditSaveAndOpen,
  onEditCancel,
  onDuplicate,
  onDelete
}) {
  const href = resolvedUrl ?? toolUrl(tool);
  const inline = tool.target === "inline";
  const configurable = !!tool.configurableUrl;
  const isOnlineDoc = !!tool.isOnlineDoc;
  const stop = e => e.stopPropagation();
  const openHref = e => {
    stop(e);
    if (href) openToolUrl(href);else onStartEdit(tool);
  };
  return /*#__PURE__*/React.createElement("div", {
    onClick: () => {
      if (!isEditing) onOpen(tool);
    },
    style: {
      background: isEditing ? "rgba(45,125,210,0.06)" : "var(--card)",
      border: isEditing ? "2px solid #2d7dd2" : "1px solid var(--border)",
      borderRadius: 12,
      padding: "14px 16px",
      cursor: isEditing ? "default" : "pointer",
      display: "flex",
      gap: 12,
      alignItems: "flex-start"
    },
    onMouseEnter: e => {
      if (!isEditing) e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)";
    },
    onMouseLeave: e => {
      e.currentTarget.style.boxShadow = "none";
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 28,
      lineHeight: 1,
      flexShrink: 0
    }
  }, tool.icon), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginBottom: 4,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    onClick: openHref,
    title: configurable ? href ? "点击打开文档" : "点击设置链接" : undefined,
    style: {
      fontSize: 14,
      fontWeight: 600,
      cursor: configurable && !isEditing ? "pointer" : undefined
    }
  }, displayName), /*#__PURE__*/React.createElement("span", {
    style: badge("#f3f4f6", "#666")
  }, tool.category), tool.runtime === "local" && /*#__PURE__*/React.createElement("span", {
    style: badge("#fce4ec", "#c62828")
  }, "\u672C\u673A\u5DE5\u5177"), tool.downloadUrl && !isLocalOpsServer() && /*#__PURE__*/React.createElement("span", {
    style: badge("#e8eaf6", "#3949ab")
  }, "\u4E0B\u8F7D"), configurable && /*#__PURE__*/React.createElement("span", {
    style: badge("#fff3e0", "#e65100")
  }, "\u53EF\u7F16\u8F91"), href && inline && /*#__PURE__*/React.createElement("span", {
    style: badge("#e8f5e9", "#2e7d32")
  }, "\u5185\u5D4C"), href && !inline && !configurable && /*#__PURE__*/React.createElement("span", {
    style: badge("#dceeff", "#1a4e8a")
  }, "\u65B0\u7A97\u53E3"), configurable && !isEditing && /*#__PURE__*/React.createElement("span", {
    style: badge("#dceeff", "#1a4e8a")
  }, "\u65B0\u7A97\u53E3"), isEditing && /*#__PURE__*/React.createElement("span", {
    style: badge("#dceeff", "#1a4e8a")
  }, "\u7F16\u8F91\u4E2D")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--tm)",
      lineHeight: 1.5
    }
  }, tool.desc), configurable && isEditing && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    },
    onClick: stop
  }, /*#__PURE__*/React.createElement("label", {
    style: lblSm
  }, "\u663E\u793A\u540D\u79F0"), /*#__PURE__*/React.createElement("input", {
    value: editName,
    onChange: e => onEditNameChange(e.target.value),
    placeholder: "\u5982\uFF1A\u7F8E\u5DE5\u56FE\u9700\u3001\u8FD0\u8425\u8868\u683C\u2026",
    style: {
      ...inp,
      fontSize: 12,
      marginBottom: 8
    },
    autoFocus: true
  }), /*#__PURE__*/React.createElement("label", {
    style: lblSm
  }, "\u6587\u6863\u94FE\u63A5"), /*#__PURE__*/React.createElement("input", {
    value: editUrl,
    onChange: e => onEditUrlChange(e.target.value),
    placeholder: "\u7C98\u8D34\u91D1\u5C71 / \u9489\u9489 / \u98DE\u4E66\u94FE\u63A5\u2026",
    style: {
      ...inp,
      fontSize: 12,
      marginBottom: 8
    },
    onKeyDown: e => {
      if (e.key === "Enter") onEditSave();
      if (e.key === "Escape") onEditCancel();
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onEditSave,
    style: {
      background: "#2d7dd2",
      border: "none",
      borderRadius: 6,
      padding: "5px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "#fff"
    }
  }, "\u4FDD\u5B58"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onEditCancel,
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      padding: "5px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "var(--tm)"
    }
  }, "\u53D6\u6D88"), editUrl.trim() && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: e => {
      stop(e);
      onEditSaveAndOpen();
    },
    style: {
      marginLeft: "auto",
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      padding: "5px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "#2d7dd2"
    }
  }, "\u4FDD\u5B58\u5E76\u6253\u5F00 \u2197"))), configurable && !isEditing && /*#__PURE__*/React.createElement("div", {
    role: "button",
    tabIndex: 0,
    title: href ? "点击打开链接" : "点击设置链接",
    onClick: openHref,
    onKeyDown: e => {
      if (e.key === "Enter") openHref(e);
    },
    style: {
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
      cursor: "text"
    }
  }, href || "尚未设置链接，点击此处添加")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      flexShrink: 0
    }
  }, configurable && !isEditing && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "\u7F16\u8F91\u540D\u79F0\u4E0E\u94FE\u63A5",
    onClick: e => {
      stop(e);
      onStartEdit(tool);
    },
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      width: 28,
      height: 28,
      fontSize: 13,
      cursor: "pointer",
      color: "#2d7dd2",
      fontFamily: "inherit",
      lineHeight: 1
    }
  }, "\u270E"), isOnlineDoc && onDuplicate && /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "\u590D\u5236\u4E00\u4EFD",
    onClick: e => {
      stop(e);
      onDuplicate(tool);
    },
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      width: 28,
      height: 28,
      fontSize: 12,
      cursor: "pointer",
      color: "#2e7d32",
      fontFamily: "inherit",
      lineHeight: 1
    }
  }, "\u29C9"), isOnlineDoc && onDelete && /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "\u5220\u9664\u6B64\u6587\u6863",
    onClick: e => {
      stop(e);
      onDelete(tool);
    },
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      width: 28,
      height: 28,
      fontSize: 12,
      cursor: "pointer",
      color: "#c62828",
      fontFamily: "inherit",
      lineHeight: 1
    }
  }, "\xD7")), !isEditing && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--tm)"
    }
  }, inline ? "→" : "↗")));
}
function ToolsPanel() {
  const [customUrls, setCustomUrls] = useState(loadCustomUrls);
  const [customNames, setCustomNames] = useState(loadCustomNames);
  const [onlineDocs, setOnlineDocsState] = useState(loadOnlineDocs);
  const [inlineTool, setInlineTool] = useState(null);
  const [active, setActive] = useState(null);
  const [cat, setCat] = useState("全部");
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editUrl, setEditUrl] = useState("");
  const [editName, setEditName] = useState("");
  const setOnlineDocs = updater => {
    setOnlineDocsState(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveOnlineDocs(next);
      return next;
    });
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
      setOnlineDocs(prev => prev.map(d => d.id === editingId ? {
        ...d,
        name: name || "在线文档",
        url
      } : d));
      setEditingId(null);
      setEditUrl("");
      setEditName("");
      return;
    }
    const catalog = TOOL_CATALOG.find(t => t.id === editingId);
    try {
      if (url) localStorage.setItem(URL_STORAGE_PREFIX + editingId, url);else localStorage.removeItem(URL_STORAGE_PREFIX + editingId);
      if (name && name !== catalog?.name) localStorage.setItem(NAME_STORAGE_PREFIX + editingId, name);else localStorage.removeItem(NAME_STORAGE_PREFIX + editingId);
    } catch {/* ignore */}
    setCustomUrls(prev => {
      const next = {
        ...prev
      };
      if (url) next[editingId] = url;else delete next[editingId];
      return next;
    });
    setCustomNames(prev => {
      const next = {
        ...prev
      };
      if (name && name !== catalog?.name) next[editingId] = name;else delete next[editingId];
      return next;
    });
  };
  const startEdit = t => {
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
  const handleToolClick = t => {
    if (editingId) return;
    if (t.autoLaunch && isLocalOpsServer()) {
      openMailWatch(t);
      return;
    }
    if (t.downloadUrl && !isLocalOpsServer()) {
      downloadToolPackage(t);
      return;
    }
    const url = toolUrl(t, customUrls);
    if (t.target === "inline" && url) {
      setInlineTool({
        ...t,
        _resolvedUrl: resolveToolUrl(url)
      });
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
  const duplicateOnlineDoc = tool => {
    const source = onlineDocs.find(d => d.id === tool.id);
    if (!source) return;
    const copy = {
      ...source,
      id: "online-doc-" + Date.now(),
      name: (source.name || "在线文档") + " 副本"
    };
    setOnlineDocs(prev => [...prev, copy]);
  };
  const addOnlineDoc = () => {
    const doc = {
      id: "online-doc-" + Date.now(),
      name: "新在线文档",
      url: "",
      desc: DEFAULT_ONLINE_DOC.desc,
      icon: "📄"
    };
    setOnlineDocs(prev => [...prev, doc]);
    startEdit(onlineDocToTool(doc));
  };
  const deleteOnlineDoc = tool => {
    if (onlineDocs.length <= 1) {
      window.alert("至少保留一个在线文档");
      return;
    }
    if (!window.confirm(`确定删除「${tool.name}」？`)) return;
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
  if (inlineTool) {
    const url = resolveToolUrl(inlineTool._resolvedUrl || toolUrl(inlineTool, customUrls));
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative",
        height: "calc(100vh - 120px)",
        display: "flex",
        flexDirection: "column"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 8,
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setInlineTool(null),
      style: {
        background: "transparent",
        border: "none",
        color: "#2d7dd2",
        fontSize: 13,
        cursor: "pointer",
        fontFamily: "inherit",
        padding: 0
      }
    }, "\u2190 \u8FD4\u56DE\u5DE5\u5177\u5217\u8868"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14,
        fontWeight: 600
      }
    }, inlineTool.icon, " ", inlineTool.name)), /*#__PURE__*/React.createElement("iframe", {
      src: url,
      title: inlineTool.name,
      style: {
        flex: 1,
        width: "100%",
        minHeight: 0,
        border: "none",
        borderRadius: 8,
        background: "#fff"
      }
    }));
  }
  if (tool && ActiveComponent) {
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setActive(null),
      style: {
        background: "transparent",
        border: "none",
        color: "#2d7dd2",
        fontSize: 13,
        cursor: "pointer",
        fontFamily: "inherit",
        marginBottom: "1rem",
        padding: 0
      }
    }, "\u2190 \u8FD4\u56DE\u5DE5\u5177\u5217\u8868"), /*#__PURE__*/React.createElement("div", {
      style: {
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "1.25rem 1.5rem"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: "1rem",
        paddingBottom: 12,
        borderBottom: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 26
      }
    }, tool.icon), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 600
      }
    }, tool.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "var(--tm)",
        marginTop: 2
      }
    }, tool.desc))), /*#__PURE__*/React.createElement(ActiveComponent, null)));
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: "1rem",
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "\u641C\u7D22\u5DE5\u5177\u2026",
    style: {
      ...inpSm,
      flex: 1,
      minWidth: 140,
      maxWidth: 220
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: addOnlineDoc,
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 20,
      padding: "4px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "#2d7dd2"
    }
  }, "+ \u6DFB\u52A0\u5728\u7EBF\u6587\u6863"), TOOL_CATEGORIES.map(c => /*#__PURE__*/React.createElement("button", {
    key: c,
    type: "button",
    onClick: () => setCat(c),
    style: {
      background: cat === c ? "#2d7dd2" : "var(--card)",
      color: cat === c ? "#fff" : "var(--tm)",
      border: `1px solid ${cat === c ? "#2d7dd2" : "var(--border)"}`,
      borderRadius: 20,
      padding: "4px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, c))), list.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
      gap: 10
    }
  }, list.map(t => /*#__PURE__*/React.createElement(ToolCard, {
    key: t.id,
    tool: t,
    displayName: toolDisplayName(t, customNames),
    resolvedUrl: toolUrl(t, customUrls),
    isEditing: editingId === t.id,
    editName: editName,
    editUrl: editUrl,
    onOpen: handleToolClick,
    onStartEdit: startEdit,
    onEditNameChange: setEditName,
    onEditUrlChange: setEditUrl,
    onEditSave: saveEdit,
    onEditSaveAndOpen: saveEditAndOpen,
    onEditCancel: cancelEdit,
    onDuplicate: duplicateOnlineDoc,
    onDelete: deleteOnlineDoc
  }))) : /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "2.5rem 1rem",
      color: "var(--tm)",
      fontSize: 13
    }
  }, "\u6CA1\u6709\u5339\u914D\u7684\u5DE5\u5177"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "1.5rem",
      padding: "10px 14px",
      borderRadius: 10,
      background: "var(--bg)",
      border: "1px dashed var(--border)",
      fontSize: 11,
      color: "var(--tm)",
      lineHeight: 1.6
    }
  }, "\u300C\u5728\u7EBF\u6587\u6863\u300D\u53EF\u6DFB\u52A0\u591A\u4E2A\uFF1A\u70B9\u300C+ \u6DFB\u52A0\u5728\u7EBF\u6587\u6863\u300D\u6216\u53F3\u4FA7 \u29C9 \u590D\u5236\uFF1B\u270E \u6539\u540D\u79F0/\u94FE\u63A5\uFF0C\xD7 \u5220\u9664\u3002", /*#__PURE__*/React.createElement("br", null), "\u300CMailWatch \u90AE\u4EF6\u5206\u6790\u300D\u5728\u4E91\u7AEF\u70B9\u51FB\u5373\u4E0B\u8F7D\u5B89\u88C5\u5305\uFF1B\u672C\u673A run.bat \u4E0B\u4E00\u952E\u6253\u5F00\u3002", /*#__PURE__*/React.createElement("br", null), "\u300CC \u76D8\u5783\u573E\u6E05\u7406\u300D\u4E91\u7AEF\u53EF\u4E0B\u8F7D zip\uFF0C\u89E3\u538B\u540E\u5728 Windows \u672C\u673A\u8FD0\u884C\u3002", /*#__PURE__*/React.createElement("br", null)));
}

// Shared helpers (TODAY, fmtD, Avatar, …) come from LogisticsModule.browser.jsx loaded first.

// ─── AI AGENTS MODULE ──────────────────────────────────────────────────
// 点击卡片在新窗口打开 GPTs / Gems 等外部链接，数据保存在 localStorage

const AGENTS_STORAGE_KEY = "ops-center-ai-agents";
const AGENT_CATEGORIES = ["全部", "GPTs", "Gems", "其他"];
const CATEGORY_ICONS = {
  GPTs: "🤖",
  Gems: "✨",
  其他: "🧠"
};
const detectCategory = url => {
  const u = (url || "").toLowerCase();
  if (u.includes("chatgpt.com/g/") || u.includes("chat.openai.com/g/")) return "GPTs";
  if (u.includes("gemini.google.com/gems") || u.includes("gemini.google.com/app") && u.includes("gem")) return "Gems";
  return "其他";
};
const loadAgents = () => {
  try {
    const raw = localStorage.getItem(AGENTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {/* ignore */}
  return [];
};
const saveAgents = agents => {
  try {
    localStorage.setItem(AGENTS_STORAGE_KEY, JSON.stringify(agents));
  } catch {/* ignore */}
};
const resolveAgentUrl = url => {
  if (!url) return "";
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
};
const openAgentUrl = url => {
  const target = resolveAgentUrl(url);
  if (!target) return false;
  window.open(target, "_blank", "noopener,noreferrer");
  return true;
};
function AgentCard({
  agent,
  isEditing,
  editName,
  editUrl,
  editDesc,
  onOpen,
  onStartEdit,
  onEditNameChange,
  onEditUrlChange,
  onEditDescChange,
  onEditSave,
  onEditSaveAndOpen,
  onEditCancel,
  onDuplicate,
  onDelete
}) {
  const stop = e => e.stopPropagation();
  const openHref = e => {
    stop(e);
    if (agent.url) openAgentUrl(agent.url);else onStartEdit(agent);
  };
  return /*#__PURE__*/React.createElement("div", {
    onClick: () => {
      if (!isEditing) onOpen(agent);
    },
    style: {
      background: isEditing ? "rgba(45,125,210,0.06)" : "var(--card)",
      border: isEditing ? "2px solid #2d7dd2" : "1px solid var(--border)",
      borderRadius: 12,
      padding: "14px 16px",
      cursor: isEditing ? "default" : "pointer",
      display: "flex",
      gap: 12,
      alignItems: "flex-start"
    },
    onMouseEnter: e => {
      if (!isEditing) e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)";
    },
    onMouseLeave: e => {
      e.currentTarget.style.boxShadow = "none";
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 28,
      lineHeight: 1,
      flexShrink: 0
    }
  }, agent.icon || CATEGORY_ICONS[agent.category] || "🧠"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginBottom: 4,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    onClick: openHref,
    title: agent.url ? "点击打开" : "点击设置链接",
    style: {
      fontSize: 14,
      fontWeight: 600,
      cursor: !isEditing ? "pointer" : undefined
    }
  }, agent.name), /*#__PURE__*/React.createElement("span", {
    style: badge("#f3f4f6", "#666")
  }, agent.category), /*#__PURE__*/React.createElement("span", {
    style: badge("#dceeff", "#1a4e8a")
  }, "\u65B0\u7A97\u53E3"), isEditing && /*#__PURE__*/React.createElement("span", {
    style: badge("#dceeff", "#1a4e8a")
  }, "\u7F16\u8F91\u4E2D")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--tm)",
      lineHeight: 1.5
    }
  }, agent.desc || "ChatGPT GPTs 或 Google Gems 链接"), isEditing && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    },
    onClick: stop
  }, /*#__PURE__*/React.createElement("label", {
    style: lblSm
  }, "\u540D\u79F0"), /*#__PURE__*/React.createElement("input", {
    value: editName,
    onChange: e => onEditNameChange(e.target.value),
    placeholder: "\u5982\uFF1AListing \u4F18\u5316\u52A9\u624B\u2026",
    style: {
      ...inp,
      fontSize: 12,
      marginBottom: 8
    },
    autoFocus: true
  }), /*#__PURE__*/React.createElement("label", {
    style: lblSm
  }, "\u94FE\u63A5"), /*#__PURE__*/React.createElement("input", {
    value: editUrl,
    onChange: e => onEditUrlChange(e.target.value),
    placeholder: "\u7C98\u8D34 GPTs / Gems \u5206\u4EAB\u94FE\u63A5\u2026",
    style: {
      ...inp,
      fontSize: 12,
      marginBottom: 8
    },
    onKeyDown: e => {
      if (e.key === "Enter") onEditSave();
      if (e.key === "Escape") onEditCancel();
    }
  }), /*#__PURE__*/React.createElement("label", {
    style: lblSm
  }, "\u8BF4\u660E\uFF08\u53EF\u9009\uFF09"), /*#__PURE__*/React.createElement("input", {
    value: editDesc,
    onChange: e => onEditDescChange(e.target.value),
    placeholder: "\u7B80\u77ED\u63CF\u8FF0\u7528\u9014\u2026",
    style: {
      ...inp,
      fontSize: 12,
      marginBottom: 8
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onEditSave,
    style: {
      background: "#2d7dd2",
      border: "none",
      borderRadius: 6,
      padding: "5px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "#fff"
    }
  }, "\u4FDD\u5B58"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onEditCancel,
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      padding: "5px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "var(--tm)"
    }
  }, "\u53D6\u6D88"), editUrl.trim() && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: e => {
      stop(e);
      onEditSaveAndOpen();
    },
    style: {
      marginLeft: "auto",
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      padding: "5px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "#2d7dd2"
    }
  }, "\u4FDD\u5B58\u5E76\u6253\u5F00 \u2197"))), !isEditing && /*#__PURE__*/React.createElement("div", {
    role: "button",
    tabIndex: 0,
    title: agent.url ? "点击打开链接" : "点击设置链接",
    onClick: openHref,
    onKeyDown: e => {
      if (e.key === "Enter") openHref(e);
    },
    style: {
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
      cursor: "pointer"
    }
  }, agent.url || "尚未设置链接，点击此处添加")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      flexShrink: 0
    }
  }, !isEditing && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "\u7F16\u8F91",
    onClick: e => {
      stop(e);
      onStartEdit(agent);
    },
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      width: 28,
      height: 28,
      fontSize: 13,
      cursor: "pointer",
      color: "#2d7dd2",
      fontFamily: "inherit",
      lineHeight: 1
    }
  }, "\u270E"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "\u590D\u5236\u4E00\u4EFD",
    onClick: e => {
      stop(e);
      onDuplicate(agent);
    },
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      width: 28,
      height: 28,
      fontSize: 12,
      cursor: "pointer",
      color: "#2e7d32",
      fontFamily: "inherit",
      lineHeight: 1
    }
  }, "\u29C9"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "\u5220\u9664",
    onClick: e => {
      stop(e);
      onDelete(agent);
    },
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      width: 28,
      height: 28,
      fontSize: 12,
      cursor: "pointer",
      color: "#c62828",
      fontFamily: "inherit",
      lineHeight: 1
    }
  }, "\xD7"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--tm)"
    }
  }, "\u2197"))));
}
function AgentsPanel() {
  const [agents, setAgentsState] = useState(loadAgents);
  const [cat, setCat] = useState("全部");
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const setAgents = updater => {
    setAgentsState(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveAgents(next);
      return next;
    });
  };
  const persistEdit = () => {
    if (!editingId) return;
    const url = editUrl.trim();
    const name = editName.trim() || "未命名智能体";
    const desc = editDesc.trim();
    const category = detectCategory(url);
    setAgents(prev => prev.map(a => a.id === editingId ? {
      ...a,
      name,
      url,
      desc,
      category,
      icon: CATEGORY_ICONS[category] || "🧠"
    } : a));
  };
  const startEdit = agent => {
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
  const handleAgentClick = agent => {
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
      icon: "🧠"
    };
    setAgents(prev => [...prev, agent]);
    startEdit(agent);
  };
  const duplicateAgent = agent => {
    const copy = {
      ...agent,
      id: "agent-" + Date.now(),
      name: (agent.name || "智能体") + " 副本"
    };
    setAgents(prev => [...prev, copy]);
  };
  const deleteAgent = agent => {
    if (!window.confirm(`确定删除「${agent.name}」？`)) return;
    if (editingId === agent.id) cancelEdit();
    setAgents(prev => prev.filter(a => a.id !== agent.id));
  };
  let list = agents;
  if (cat !== "全部") list = list.filter(a => a.category === cat);
  if (q.trim()) {
    const s = q.trim().toLowerCase();
    list = list.filter(a => (a.name || "").toLowerCase().includes(s) || (a.desc || "").toLowerCase().includes(s) || (a.url || "").toLowerCase().includes(s));
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: "1rem",
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "\u641C\u7D22\u667A\u80FD\u4F53\u2026",
    style: {
      ...inpSm,
      flex: 1,
      minWidth: 140,
      maxWidth: 220
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: addAgent,
    style: {
      background: "#2d7dd2",
      color: "#fff",
      border: "none",
      borderRadius: 20,
      padding: "4px 14px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      fontWeight: 600
    }
  }, "+ \u6DFB\u52A0\u667A\u80FD\u4F53"), AGENT_CATEGORIES.map(c => /*#__PURE__*/React.createElement("button", {
    key: c,
    type: "button",
    onClick: () => setCat(c),
    style: {
      background: cat === c ? "#2d7dd2" : "var(--card)",
      color: cat === c ? "#fff" : "var(--tm)",
      border: `1px solid ${cat === c ? "#2d7dd2" : "var(--border)"}`,
      borderRadius: 20,
      padding: "4px 12px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, c))), list.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
      gap: 10
    }
  }, list.map(a => /*#__PURE__*/React.createElement(AgentCard, {
    key: a.id,
    agent: a,
    isEditing: editingId === a.id,
    editName: editName,
    editUrl: editUrl,
    editDesc: editDesc,
    onOpen: handleAgentClick,
    onStartEdit: startEdit,
    onEditNameChange: setEditName,
    onEditUrlChange: setEditUrl,
    onEditDescChange: setEditDesc,
    onEditSave: saveEdit,
    onEditSaveAndOpen: saveEditAndOpen,
    onEditCancel: cancelEdit,
    onDuplicate: duplicateAgent,
    onDelete: deleteAgent
  }))) : /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "2.5rem 1rem",
      color: "var(--tm)",
      fontSize: 13
    }
  }, agents.length ? "没有匹配的智能体" : "还没有智能体，点击「+ 添加智能体」开始添加 GPTs 或 Gems 链接"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "1.5rem",
      padding: "10px 14px",
      borderRadius: 10,
      background: "var(--bg)",
      border: "1px dashed var(--border)",
      fontSize: 11,
      color: "var(--tm)",
      lineHeight: 1.6
    }
  }, "\u7C98\u8D34 ChatGPT GPTs \u6216 Google Gems \u5206\u4EAB\u94FE\u63A5\uFF0C\u70B9\u51FB\u5361\u7247\u5373\u53EF\u5728\u65B0\u7A97\u53E3\u6253\u5F00\u3002", /*#__PURE__*/React.createElement("br", null), "\u94FE\u63A5\u4F1A\u81EA\u52A8\u8BC6\u522B\u7C7B\u578B\uFF08GPTs / Gems\uFF09\uFF1B\u270E \u7F16\u8F91\u540D\u79F0\u4E0E\u94FE\u63A5\uFF0C\u29C9 \u590D\u5236\uFF0C\xD7 \u5220\u9664\u3002"));
}
const FX_CACHE_KEY = "ops-center-fx-rates";
const NEWS_CACHE_KEY = "ops-center-amazon-news";
const FX_TARGETS = [{
  code: "USD",
  label: "美元",
  symbol: "$",
  decimals: 4
}, {
  code: "GBP",
  label: "英镑",
  symbol: "£",
  decimals: 4
}, {
  code: "EUR",
  label: "欧元",
  symbol: "€",
  decimals: 4
}, {
  code: "JPY",
  label: "日元",
  symbol: "¥",
  decimals: 2,
  per100: true
}];
const WORLD_CLOCKS = [{
  id: "us",
  label: "美国",
  sub: "纽约",
  tz: "America/New_York",
  flag: "🇺🇸"
}, {
  id: "jp",
  label: "日本",
  sub: "东京",
  tz: "Asia/Tokyo",
  flag: "🇯🇵"
}, {
  id: "uk",
  label: "英国",
  sub: "伦敦",
  tz: "Europe/London",
  flag: "🇬🇧"
}, {
  id: "de",
  label: "德国",
  sub: "柏林",
  tz: "Europe/Berlin",
  flag: "🇩🇪"
}, {
  id: "cn",
  label: "北京",
  sub: "中国",
  tz: "Asia/Shanghai",
  flag: "🇨🇳"
}];
const BEIJING_TZ = "Asia/Shanghai";
function beijingTodayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BEIJING_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const y = parts.find(p => p.type === "year")?.value || "0000";
  const m = parts.find(p => p.type === "month")?.value || "01";
  const d = parts.find(p => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}
function todayKey() {
  return beijingTodayKey();
}
function formatFxRate(value, decimals) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(decimals);
}
function loadFxCache() {
  try {
    const raw = localStorage.getItem(FX_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function saveFxCache(data) {
  try {
    localStorage.setItem(FX_CACHE_KEY, JSON.stringify(data));
  } catch {/* ignore */}
}
const FX_CODES = FX_TARGETS.map(t => t.code);
function pickFxRates(allRates) {
  const rates = {};
  for (const code of FX_CODES) {
    const v = allRates?.[code];
    if (typeof v === "number" && v > 0) rates[code] = v;
  }
  return Object.keys(rates).length === FX_CODES.length ? rates : null;
}
async function fetchJson(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
async function fetchExchangeRatesFromApi() {
  const frankfurter = "https://api.frankfurter.app/latest?from=CNY&to=" + FX_CODES.join(",");
  const erApi = "https://open.er-api.com/v6/latest/CNY";
  const host = "https://api.exchangerate.host/latest?base=CNY&symbols=" + FX_CODES.join(",");
  const invert = "https://api.frankfurter.app/latest?from=USD&to=CNY," + FX_CODES.filter(c => c !== "USD").join(",");
  const bundled = new URL("fx-rates.json", window.location.href).href;
  const sources = [async () => {
    const data = await fetchJson(frankfurter);
    const rates = pickFxRates(data.rates);
    if (!rates) throw new Error("incomplete");
    return {
      asOf: data.date || todayKey(),
      rates,
      source: "frankfurter"
    };
  }, async () => {
    const data = await fetchJson(erApi);
    if (data.result !== "success") throw new Error("er-api");
    const rates = pickFxRates(data.rates);
    if (!rates) throw new Error("incomplete");
    const asOf = data.time_last_update_utc?.slice(5, 16) || todayKey();
    return {
      asOf,
      rates,
      source: "er-api"
    };
  }, async () => {
    const data = await fetchJson(host);
    if (!data.success) throw new Error("exchangerate.host");
    const rates = pickFxRates(data.rates);
    if (!rates) throw new Error("incomplete");
    return {
      asOf: data.date || todayKey(),
      rates,
      source: "exchangerate.host"
    };
  }, async () => {
    const data = await fetchJson(invert);
    const cnyPerUsd = data.rates?.CNY;
    if (!cnyPerUsd || cnyPerUsd <= 0) throw new Error("invert");
    const rates = {
      USD: 1 / cnyPerUsd
    };
    for (const code of FX_CODES) {
      if (code === "USD") continue;
      const perUsd = data.rates?.[code];
      if (!perUsd || perUsd <= 0) throw new Error("invert");
      rates[code] = perUsd / cnyPerUsd;
    }
    return {
      asOf: data.date || todayKey(),
      rates,
      source: "frankfurter-invert"
    };
  }, async () => {
    const data = await fetchJson(bundled);
    const rates = pickFxRates(data.rates);
    if (!rates) throw new Error("bundled");
    return {
      asOf: data.asOf || data.date || todayKey(),
      rates,
      source: "bundled"
    };
  }];
  let lastErr;
  for (const load of sources) {
    try {
      return await load();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("all sources failed");
}
function useExchangeRates() {
  const [state, setState] = useState(() => {
    const cached = loadFxCache();
    if (cached?.rates) {
      const fresh = cached.date === todayKey();
      return {
        status: fresh ? "ok" : "stale",
        date: cached.date || "",
        asOf: cached.asOf || cached.date || "",
        rates: cached.rates,
        error: ""
      };
    }
    return {
      status: "loading",
      date: "",
      asOf: "",
      rates: null,
      error: ""
    };
  });
  useEffect(() => {
    const cached = loadFxCache();
    if (cached?.date === todayKey() && cached.rates) {
      setState({
        status: "ok",
        date: cached.date,
        asOf: cached.asOf,
        rates: cached.rates,
        error: ""
      });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const live = await fetchExchangeRatesFromApi();
        const payload = {
          date: todayKey(),
          asOf: live.asOf,
          rates: live.rates,
          source: live.source
        };
        saveFxCache(payload);
        if (!cancelled) {
          setState({
            status: "ok",
            date: payload.date,
            asOf: payload.asOf,
            rates: payload.rates,
            error: ""
          });
        }
      } catch (e) {
        if (cancelled) return;
        if (cached?.rates) {
          setState({
            status: "stale",
            date: cached.date || "",
            asOf: cached.asOf || cached.date || "",
            rates: cached.rates,
            error: e.message || "获取失败"
          });
          return;
        }
        setState(s => ({
          ...s,
          status: "error",
          error: e.message || "获取失败"
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
function loadNewsCache() {
  try {
    const raw = localStorage.getItem(NEWS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function saveNewsCache(data) {
  try {
    localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(data));
  } catch {/* ignore */}
}
async function fetchAmazonNewsPayload() {
  const bundled = new URL("amazon-news.json", window.location.href).href;
  const sources = [async () => {
    const data = await fetchJson("/api/amazon-news");
    if (data?.ok && data.news?.items?.length) return data.news;
    throw new Error("api empty");
  }, async () => {
    const data = await fetchJson(bundled);
    if (data?.items?.length) return data;
    throw new Error("bundled empty");
  }];
  let lastErr;
  for (const load of sources) {
    try {
      return await load();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("all news sources failed");
}
function useAmazonNews() {
  const [state, setState] = useState(() => {
    const cached = loadNewsCache();
    if (cached?.items?.length) {
      return {
        status: "stale",
        items: cached.items,
        sourceLabel: cached.sourceLabel || "",
        updatedAt: cached.updatedAt || "",
        error: ""
      };
    }
    return {
      status: "loading",
      items: [],
      sourceLabel: "",
      updatedAt: "",
      error: ""
    };
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const news = await fetchAmazonNewsPayload();
        saveNewsCache(news);
        if (!cancelled) {
          setState({
            status: "ok",
            items: news.items,
            sourceLabel: news.sourceLabel || "Amazon 官方新闻",
            updatedAt: news.updatedAt || "",
            error: ""
          });
        }
      } catch (e) {
        if (cancelled) return;
        const cached = loadNewsCache();
        if (cached?.items?.length) {
          setState({
            status: "stale",
            items: cached.items,
            sourceLabel: cached.sourceLabel || "",
            updatedAt: cached.updatedAt || "",
            error: e.message || "获取失败"
          });
          return;
        }
        setState(s => ({
          ...s,
          status: "error",
          error: e.message || "获取失败"
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
function AmazonNewsCard({
  news
}) {
  const formatUpdated = iso => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(d);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: "1.25rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600
    }
  }, "\uD83D\uDCF0 \u4E9A\u9A6C\u900A\u52A8\u6001"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)"
    }
  }, news.status === "ok" ? news.sourceLabel : news.status === "stale" ? "缓存 · " + news.sourceLabel : news.status === "loading" ? "加载中…" : "暂不可用", news.updatedAt && news.status !== "loading" && ` · ${formatUpdated(news.updatedAt)}`)), news.status === "error" && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--tm)",
      padding: "12px 14px",
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 12
    }
  }, "\u65B0\u95FB\u83B7\u53D6\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u5237\u65B0\u3002"), news.status !== "error" && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, (news.status === "loading" ? [{
    title: "…"
  }, {
    title: "…"
  }, {
    title: "…"
  }] : news.items.slice(0, 3)).map((item, i) => /*#__PURE__*/React.createElement("a", {
    key: item.link || i,
    href: item.link || "#",
    target: "_blank",
    rel: "noopener noreferrer",
    onClick: e => {
      if (!item.link) e.preventDefault();
    },
    style: {
      display: "block",
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: "12px 14px",
      textDecoration: "none",
      color: "inherit",
      opacity: news.status === "loading" ? 0.5 : 1
    },
    onMouseEnter: e => {
      if (item.link) e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)";
    },
    onMouseLeave: e => {
      e.currentTarget.style.boxShadow = "none";
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      lineHeight: 1.45,
      color: "var(--text)"
    }
  }, item.title), item.summary && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginTop: 4,
      lineHeight: 1.5,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, item.summary)), /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      textAlign: "right"
    }
  }, item.date && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginBottom: 4
    }
  }, item.date), item.category && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      padding: "2px 8px",
      borderRadius: 20,
      background: "var(--bg)",
      color: "var(--tm)",
      border: "1px solid var(--border)"
    }
  }, item.category), item.link && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#2d7dd2",
      marginTop: 4
    }
  }, "\u2197")))))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginTop: 8,
      lineHeight: 1.5
    }
  }, "\u81EA\u52A8\u540C\u6B65 Amazon \u5B98\u65B9 RSS\uFF0C\u6BCF 4 \u5C0F\u65F6\u66F4\u65B0\uFF0C\u65E0\u9700\u4EBA\u5DE5\u7EF4\u62A4\u3002"));
}
function ExchangeRatesCard({
  fx
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 14,
      padding: "14px 16px",
      marginBottom: "1.25rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600
    }
  }, "\uD83D\uDCB1 \u4ECA\u65E5\u6C47\u7387\uFF08\u4EBA\u6C11\u5E01\uFF09"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)"
    }
  }, fx.status === "ok" ? `参考 ${fx.asOf}` : fx.status === "stale" ? `缓存 ${fx.asOf}` : fx.status === "loading" ? "加载中…" : "暂不可用")), fx.status === "stale" && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--tm)",
      marginBottom: 8
    }
  }, "\u7F51\u7EDC\u66F4\u65B0\u5931\u8D25\uFF0C\u663E\u793A\u4E0A\u6B21\u7F13\u5B58\u6C47\u7387\u3002"), fx.status === "error" && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--tm)",
      lineHeight: 1.55
    }
  }, "\u6C47\u7387\u83B7\u53D6\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u5237\u65B0\u9875\u9762\u3002"), fx.status !== "error" && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
      gap: 8
    }
  }, FX_TARGETS.map(t => {
    const raw = fx.rates?.[t.code];
    const mult = t.per100 ? 100 : 1;
    const val = raw != null ? raw * mult : null;
    const prefix = t.per100 ? "100 CNY =" : "1 CNY =";
    const suffix = t.per100 ? ` ${formatFxRate(val, t.decimals)} JPY` : ` ${t.symbol}${formatFxRate(val, t.decimals)}`;
    return /*#__PURE__*/React.createElement("div", {
      key: t.code,
      style: {
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "10px 12px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "var(--tm)",
        marginBottom: 4
      }
    }, t.label, " ", t.code), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 15,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums"
      }
    }, fx.status === "loading" ? "…" : /*#__PURE__*/React.createElement("span", null, prefix, suffix)), raw != null && fx.status === "ok" && !t.per100 && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: "var(--tm)",
        marginTop: 4
      }
    }, "1 ", t.symbol, " \u2248 \xA5", formatFxRate(1 / raw, 2), " CNY"), raw != null && fx.status === "ok" && t.per100 && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: "var(--tm)",
        marginTop: 4
      }
    }, "100 JPY \u2248 \xA5", formatFxRate(100 / raw, 2), " CNY"));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginTop: 10,
      lineHeight: 1.5
    }
  }, "\u6570\u636E\u6765\u6E90\uFF1A\u591A\u6E90\u6C47\u7387 API + \u672C\u5730\u7F13\u5B58\uFF0C\u4EC5\u4F9B\u53C2\u8003\u3002"));
}
function formatClockTime(date, tz) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}
function formatClockDate(date, tz) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: tz,
    month: "numeric",
    day: "numeric",
    weekday: "short"
  }).format(date);
}
function useNow(tickMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}
function PriorityModal({
  initialText,
  onSave,
  onClose,
  requiredHint,
  required
}) {
  const [text, setText] = useState(initialText || "");
  const [warn, setWarn] = useState("");
  const [saving, setSaving] = useState(false);
  const canClose = !required && !saving;
  const tryClose = () => {
    if (canClose) onClose();
  };
  useEffect(() => {
    if (!canClose) return;
    const onKey = e => {
      if (e.key === "Escape") tryClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canClose, onClose]);
  const handleSave = async () => {
    if (!text.trim()) {
      setWarn("请先填写今日最优先工作，保存后才能关闭。");
      return;
    }
    setWarn("");
    setSaving(true);
    try {
      await onSave(text);
    } catch (e) {
      setWarn(e?.message || "保存失败，请重试");
      setSaving(false);
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    onClick: canClose ? tryClose : undefined,
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.45)",
      zIndex: 250,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 16,
      padding: "1.35rem 1.5rem",
      width: "100%",
      maxWidth: 440,
      color: "var(--text)",
      boxShadow: "0 16px 48px rgba(0,0,0,0.12)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 16,
      marginBottom: 6
    }
  }, "\u4ECA\u65E5\u6700\u4F18\u5148\u5DE5\u4F5C"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--tm)",
      marginBottom: 14,
      lineHeight: 1.55
    }
  }, requiredHint || "写下今天必须完成的第一件事，保存后会在首页显示。"), /*#__PURE__*/React.createElement("textarea", {
    value: text,
    onChange: e => {
      setText(e.target.value);
      if (warn) setWarn("");
    },
    placeholder: "\u4F8B\u5982\uFF1A\u5B8C\u6210 FB101 \u5934\u7A0B\u8FFD\u8E2A\u7801\u8865\u5F55\u3001\u5BA1\u6838\u7F8E\u5DE5\u6392\u671F\u2026",
    autoFocus: true,
    style: {
      width: "100%",
      minHeight: 96,
      fontSize: 14,
      padding: "10px 12px",
      border: `1px solid ${warn ? "#e57373" : "var(--border)"}`,
      borderRadius: 10,
      fontFamily: "inherit",
      background: "transparent",
      color: "inherit",
      resize: "vertical",
      display: "block",
      marginBottom: warn ? 8 : 14,
      lineHeight: 1.5
    },
    onKeyDown: e => {
      if (e.key === "Enter" && e.ctrlKey) handleSave();
    }
  }), warn && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#c62828",
      marginBottom: 14,
      lineHeight: 1.5
    }
  }, warn), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "flex-end",
      gap: 8
    }
  }, canClose && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: tryClose,
    style: {
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "7px 14px",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "var(--tm)"
    }
  }, "\u53D6\u6D88"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: handleSave,
    disabled: saving,
    style: {
      background: saving ? "#94a3b8" : "#2d7dd2",
      border: "none",
      borderRadius: 8,
      padding: "7px 16px",
      fontSize: 12,
      cursor: saving ? "wait" : "pointer",
      fontFamily: "inherit",
      color: "#fff",
      fontWeight: 600
    }
  }, saving ? "保存中…" : "保存"))));
}

// ─── HOME MODULE ───────────────────────────────────────────────────────

function HomePanel() {
  const now = useNow();
  const fx = useExchangeRates();
  const news = useAmazonNews();
  const today = beijingTodayKey(now);
  const [clientId, setClientId] = useState("");
  const [priority, setPriority] = useState({
    date: "",
    text: ""
  });
  const [priorityReady, setPriorityReady] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const todayPriority = priority.date === today ? priority.text : "";
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await resolveClientId();
      if (cancelled) return;
      setClientId(id);
      const saved = await loadTodayPriority(id, today);
      if (cancelled) return;
      setPriority(saved);
      setShowModal(!saved.text.trim());
      setPriorityReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [today]);
  const handleSavePriority = async text => {
    const trimmed = text.trim();
    if (!trimmed) return;
    let id = clientId;
    if (!id) {
      id = await resolveClientId();
      setClientId(id);
    }
    if (!id) throw new Error("无法识别本机，请刷新页面后重试");
    const entry = await saveTodayPriority(id, today, trimmed);
    setPriority(entry);
    setShowModal(false);
  };
  const beijingDate = formatClockDate(now, "Asia/Shanghai");
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: "1.25rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--tm)",
      marginBottom: 4
    }
  }, "\u6B22\u8FCE\u56DE\u6765"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 700,
      letterSpacing: "-0.02em"
    }
  }, beijingDate)), /*#__PURE__*/React.createElement(AmazonNewsCard, {
    news: news
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
      gap: 10,
      marginBottom: "1.25rem"
    }
  }, WORLD_CLOCKS.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.id,
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: "12px 14px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18,
      lineHeight: 1
    }
  }, c.flag), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600
    }
  }, c.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)"
    }
  }, c.sub))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 700,
      fontVariantNumeric: "tabular-nums",
      letterSpacing: "0.02em",
      color: c.id === "cn" ? "#2d7dd2" : "var(--text)"
    }
  }, formatClockTime(now, c.tz)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginTop: 4
    }
  }, formatClockDate(now, c.tz))))), /*#__PURE__*/React.createElement(ExchangeRatesCard, {
    fx: fx
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "linear-gradient(135deg, rgba(45,125,210,0.08), rgba(45,125,210,0.02))",
      border: "1px solid rgba(45,125,210,0.25)",
      borderRadius: 14,
      padding: "16px 18px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: todayPriority ? 10 : 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: "#1a4e8a"
    }
  }, "\uD83C\uDFAF \u4ECA\u65E5\u6700\u4F18\u5148"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setShowModal(true),
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "4px 10px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "#2d7dd2"
    }
  }, todayPriority ? "修改" : "填写")), todayPriority ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      lineHeight: 1.6,
      color: "var(--text)",
      whiteSpace: "pre-wrap"
    }
  }, todayPriority) : /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--tm)",
      lineHeight: 1.55
    }
  }, "\u5C1A\u672A\u8BBE\u5B9A\u4ECA\u65E5\u4F18\u5148\u4E8B\u9879\uFF0C\u70B9\u51FB\u300C\u586B\u5199\u300D\u5F00\u59CB\u3002")), priorityReady && showModal && /*#__PURE__*/React.createElement(PriorityModal, {
    initialText: todayPriority,
    required: !todayPriority,
    requiredHint: !todayPriority ? "新的一天，请先写下今天最重要的一件事。填写并保存后才能关闭。" : undefined,
    onSave: handleSavePriority,
    onClose: () => setShowModal(false)
  }));
}

// LogisticsModule.browser.jsx loads storage + GlobalConfig first.

// ─── TASK MODULE ──────────────────────────────────────────────────────
const NODE_STATUSES = [{
  val: "done",
  label: "完成",
  dot: "#2d9e52",
  color: "#1a6b35"
}, {
  val: "current",
  label: "进行中",
  dot: "#2d7dd2",
  color: "#1a4e8a"
}, {
  val: "blocked",
  label: "受阻",
  dot: "#e09000",
  color: "#7a4a00"
}, {
  val: "todo",
  label: "待开始",
  dot: "#bbb",
  color: "#666"
}];
const nsMeta = v => NODE_STATUSES.find(x => x.val === v) || NODE_STATUSES[3];
const CAT_COLORS = {
  设计: {
    bg: "#ede9fe",
    c: "#4c1d95"
  },
  研发: {
    bg: "#fef3c7",
    c: "#78350f"
  },
  运营: {
    bg: "#dbeafe",
    c: "#1e3a8a"
  },
  品牌: {
    bg: "#fce7f3",
    c: "#831843"
  }
};
const taskStatusOf = t => {
  if (t.actual) return "done";
  if (t.nodes && t.nodes.some(n => n.status === "blocked")) return "blocked";
  const d = daysDiff(t.due);
  if (d === null) return "inprog";
  if (d < 0) return "over";
  return "inprog";
};
const taskIsOverdue = t => !t.actual && daysDiff(t.due) !== null && daysDiff(t.due) < 0;
const getProgress = nodes => {
  if (!nodes || !nodes.length) return 0;
  return Math.round(nodes.filter(n => n.status === "done").length / nodes.length * 100);
};
const INIT_TASKS = [{
  id: 1,
  task: "FB100/101/200/201欧规样品制作",
  owner: "杨工",
  cat: "设计",
  due: "2026-06-20",
  actual: "",
  nodes: [{
    name: "FB100",
    status: "done"
  }, {
    name: "FB101",
    status: "done"
  }, {
    name: "FB200",
    status: "current"
  }, {
    name: "FB201",
    status: "todo"
  }],
  block: "FB200模具待供应商确认"
}, {
  id: 2,
  task: "43条链接图设计排期",
  owner: "杨工",
  cat: "设计",
  due: "2026-06-05",
  actual: "",
  nodes: [{
    name: "排期制定",
    status: "done"
  }, {
    name: "初稿输出",
    status: "current"
  }, {
    name: "审核",
    status: "todo"
  }, {
    name: "提交",
    status: "todo"
  }],
  block: ""
}, {
  id: 3,
  task: "FB300多士炉图片",
  owner: "黄工",
  cat: "运营",
  due: "2026-05-28",
  actual: "",
  nodes: [{
    name: "拍摄",
    status: "done"
  }, {
    name: "修图",
    status: "blocked"
  }, {
    name: "上架",
    status: "todo"
  }],
  block: "修图师生病，预计延迟3天"
}, {
  id: 4,
  task: "FB102感温变色图档样品",
  owner: "李工",
  cat: "研发",
  due: "2026-06-15",
  actual: "",
  nodes: [{
    name: "工艺确认",
    status: "blocked"
  }, {
    name: "图档",
    status: "todo"
  }, {
    name: "打样",
    status: "todo"
  }, {
    name: "确样",
    status: "todo"
  }],
  block: "油墨供应商报价超预期40%，等待决策"
}, {
  id: 5,
  task: "FB400豆浆机功能测试",
  owner: "张工",
  cat: "研发",
  due: "2026-06-10",
  actual: "2026-05-25",
  nodes: [{
    name: "温度测试",
    status: "done"
  }, {
    name: "闪光测试",
    status: "done"
  }, {
    name: "整机",
    status: "done"
  }],
  block: ""
}, {
  id: 6,
  task: "FB欧洲德法品牌注册",
  owner: "王律师",
  cat: "品牌",
  due: "2026-06-15",
  actual: "",
  nodes: [{
    name: "材料准备",
    status: "done"
  }, {
    name: "德国提交",
    status: "current"
  }, {
    name: "法国提交",
    status: "todo"
  }, {
    name: "回执",
    status: "todo"
  }],
  block: ""
}];
function NodeRow({
  node,
  onChange,
  onRemove
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      alignItems: "center",
      marginBottom: 5
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: node.name,
    onChange: e => onChange({
      ...node,
      name: e.target.value
    }),
    placeholder: "\u8282\u70B9\u540D\u79F0",
    style: {
      ...inpSm,
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("select", {
    value: node.status,
    onChange: e => onChange({
      ...node,
      status: e.target.value
    }),
    style: {
      ...inpSm,
      width: 86,
      background: "var(--card)"
    }
  }, NODE_STATUSES.map(s => /*#__PURE__*/React.createElement("option", {
    key: s.val,
    value: s.val
  }, s.label))), /*#__PURE__*/React.createElement("button", {
    onClick: onRemove,
    style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      color: "#aaa",
      fontSize: 18,
      padding: "0 3px"
    }
  }, "\xD7"));
}
function TaskModal({
  task,
  tasks,
  onSave,
  onClose,
  onDelete
}) {
  const [form, setForm] = useState(task);
  const [nodes, setNodes] = useState(task.nodes ? task.nodes.map(n => ({
    ...n
  })) : []);
  const set = (k, v) => setForm(f => ({
    ...f,
    [k]: v
  }));
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.4)",
      zIndex: 200,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: "2rem 1rem",
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 14,
      padding: "1.5rem",
      width: "100%",
      maxWidth: 480,
      color: "var(--text)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 15,
      marginBottom: "1rem"
    }
  }, task.id ? "编辑任务" : "新建任务"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u4EFB\u52A1\u5185\u5BB9"), /*#__PURE__*/React.createElement("textarea", {
    value: form.task,
    onChange: e => set("task", e.target.value),
    placeholder: "\u63CF\u8FF0\u4EFB\u52A1\u2026",
    style: {
      ...inp,
      height: 52,
      resize: "none"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u8D1F\u8D23\u4EBA"), /*#__PURE__*/React.createElement(OwnerField, {
    listId: "task-owner",
    value: form.owner,
    onChange: v => set("owner", v),
    extraOwners: tasks.map(t => t.owner),
    inputStyle: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5206\u7C7B"), /*#__PURE__*/React.createElement("select", {
    value: form.cat,
    onChange: e => set("cat", e.target.value),
    style: {
      ...inp,
      background: "var(--card)"
    }
  }, ["设计", "研发", "运营", "品牌"].map(c => /*#__PURE__*/React.createElement("option", {
    key: c
  }, c))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u9884\u8BA1\u5B8C\u6210"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.due,
    onChange: e => set("due", e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "\u5B9E\u9645\u5B8C\u6210"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.actual,
    onChange: e => set("actual", e.target.value),
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--tm)",
      borderTop: "1px solid var(--border)",
      paddingTop: 10,
      marginBottom: 8
    }
  }, "\u4EFB\u52A1\u8282\u70B9"), nodes.map((n, i) => /*#__PURE__*/React.createElement(NodeRow, {
    key: i,
    node: n,
    onChange: v => {
      const a = [...nodes];
      a[i] = v;
      setNodes(a);
    },
    onRemove: () => setNodes(nodes.filter((_, j) => j !== i))
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => setNodes([...nodes, {
      name: "",
      status: "todo"
    }]),
    style: {
      width: "100%",
      border: "1px dashed var(--border)",
      borderRadius: 8,
      padding: "5px 0",
      fontSize: 12,
      cursor: "pointer",
      color: "var(--tm)",
      background: "transparent",
      marginBottom: 12,
      fontFamily: "inherit"
    }
  }, "+ \u6DFB\u52A0\u8282\u70B9"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--tm)",
      borderTop: "1px solid var(--border)",
      paddingTop: 10,
      marginBottom: 8
    }
  }, "\u5361\u70B9\u8BF4\u660E"), /*#__PURE__*/React.createElement("textarea", {
    value: form.block,
    onChange: e => set("block", e.target.value),
    placeholder: "\u7B49\u5F85\u4EC0\u4E48\uFF1F\u8C01\u51B3\u7B56\uFF1F\u9884\u8BA1\u4F55\u65F6\u89E3\u51B3\uFF1F",
    style: {
      ...inp,
      height: 48,
      resize: "none",
      marginBottom: 12
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderTop: "1px solid var(--border)",
      paddingTop: 12
    }
  }, task.id ? /*#__PURE__*/React.createElement("button", {
    onClick: onDelete,
    style: {
      background: "none",
      border: "none",
      color: "#e55",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "\u5220\u9664") : /*#__PURE__*/React.createElement("div", null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      background: "transparent",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "6px 14px",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "var(--tm)"
    }
  }, "\u53D6\u6D88"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      if (!form.task.trim()) return;
      onSave({
        ...form,
        nodes: nodes.filter(n => n.name.trim())
      });
    },
    style: {
      background: "#2d7dd2",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      padding: "6px 16px",
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit",
      fontWeight: 600
    }
  }, "\u4FDD\u5B58")))));
}
function TaskCard({
  task,
  onClick
}) {
  const st = taskStatusOf(task);
  const prog = getProgress(task.nodes);
  const cc = CAT_COLORS[task.cat] || {
    bg: "#f0f0f0",
    c: "#555"
  };
  const d = daysDiff(task.due);
  const bc = st === "over" ? "#e55" : st === "blocked" ? "#e09000" : st === "done" ? "#2d9e52" : "#2d7dd2";
  let due = null;
  if (task.actual) due = /*#__PURE__*/React.createElement("span", {
    style: badge("#d4f0dc", "#1a6b35")
  }, "\u2713 ", fmtD(task.actual));else if (task.due) {
    if (taskIsOverdue(task)) due = /*#__PURE__*/React.createElement("span", {
      style: badge("#fee2e2", "#b91c1c")
    }, "\u903E\u671F", Math.abs(d), "\u5929");else due = /*#__PURE__*/React.createElement("span", {
      style: badge("#f3f4f6", "#666")
    }, "\uD83D\uDCC5", fmtD(task.due));
  }
  const role = getStaffRole(task.owner);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderLeft: `3px solid ${bc}`,
      borderRadius: 10,
      padding: "12px 14px",
      cursor: "pointer"
    },
    onMouseEnter: e => e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)",
    onMouseLeave: e => e.currentTarget.style.boxShadow = "none"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontSize: 13,
      fontWeight: 600,
      lineHeight: 1.4,
      color: st === "done" ? "var(--tm)" : "var(--text)",
      textDecoration: st === "done" ? "line-through" : "none"
    }
  }, task.task), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: task.owner
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--tm)"
    }
  }, task.owner), /*#__PURE__*/React.createElement(RoleBadge, {
    role: role
  }))), task.nodes && task.nodes.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 3,
      background: "var(--border)",
      borderRadius: 2,
      marginBottom: 7,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: `${prog}%`,
      background: bc,
      borderRadius: 2
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 0,
      marginBottom: 7
    }
  }, task.nodes.map((n, i) => {
    const nm = nsMeta(n.status);
    const ic = n.status === "current";
    return /*#__PURE__*/React.createElement("span", {
      key: i,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 3
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: ic ? 10 : 8,
        height: ic ? 10 : 8,
        borderRadius: "50%",
        background: nm.dot,
        outline: ic ? `2px solid ${nm.dot}` : "none",
        outlineOffset: 2,
        display: "inline-block",
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: ic ? nm.color : "var(--tm)",
        fontWeight: ic ? 600 : 400
      }
    }, n.name), i < task.nodes.length - 1 && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        color: "var(--tm)",
        margin: "0 3px"
      }
    }, "\u2192"));
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 5,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: badge(cc.bg, cc.c)
  }, task.cat), due, prog > 0 && prog < 100 && /*#__PURE__*/React.createElement("span", {
    style: badge("#f3f4f6", "#666")
  }, prog, "%")), task.block && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      padding: "6px 10px",
      background: "#fff8e6",
      color: "#7a4a00",
      borderRadius: 7,
      fontSize: 11,
      lineHeight: 1.5,
      borderLeft: "3px solid #e09000"
    }
  }, "\u26A1 ", task.block));
}
function TasksPanel() {
  const {
    items: tasks,
    meta,
    loading,
    error,
    persist,
    reload
  } = useSharedList("tasks", INIT_TASKS);
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const nextId = () => Math.max(0, ...tasks.map(t => t.id || 0)) + 1;
  const counts = {
    all: tasks.length,
    over: tasks.filter(taskIsOverdue).length,
    blocked: tasks.filter(t => taskStatusOf(t) === "blocked").length,
    inprog: tasks.filter(t => taskStatusOf(t) === "inprog").length,
    done: tasks.filter(t => taskStatusOf(t) === "done").length
  };
  const sortO = {
    over: 0,
    blocked: 1,
    inprog: 2,
    done: 3
  };
  let vis = filter === "all" ? tasks : filter === "over" ? tasks.filter(taskIsOverdue) : tasks.filter(t => taskStatusOf(t) === filter);
  vis = [...vis].sort((a, b) => (sortO[taskStatusOf(a)] || 2) - (sortO[taskStatusOf(b)] || 2));
  const save = t => {
    if (t.id) persist(tasks.map(x => x.id === t.id ? t : x));else persist([...tasks, {
      ...t,
      id: nextId()
    }]);
    setModal(null);
  };
  const tabs = [{
    key: "all",
    label: "全部",
    nc: "var(--text)"
  }, {
    key: "over",
    label: "逾期",
    nc: "#e55"
  }, {
    key: "blocked",
    label: "受阻",
    nc: "#c07000"
  }, {
    key: "inprog",
    label: "进行中",
    nc: "#2d7dd2"
  }, {
    key: "done",
    label: "已完成",
    nc: "#2d9e52"
  }];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SharedMetaLine, {
    meta: meta,
    loading: loading,
    error: error,
    onReload: reload
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "1rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(5, 1fr)",
      gap: 7,
      flex: 1,
      marginRight: 12
    }
  }, tabs.map(f => /*#__PURE__*/React.createElement("div", {
    key: f.key,
    onClick: () => setFilter(f.key),
    style: {
      background: "var(--card)",
      border: `1px solid ${filter === f.key ? "#2d7dd2" : "var(--border)"}`,
      borderRadius: 10,
      padding: "9px 10px",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      color: f.nc
    }
  }, counts[f.key]), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--tm)",
      marginTop: 1
    }
  }, f.label)))), /*#__PURE__*/React.createElement("button", {
    onClick: () => setModal({
      task: "",
      owner: "",
      cat: "设计",
      due: "",
      actual: "",
      nodes: [],
      block: ""
    }),
    style: {
      background: "#2d7dd2",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      padding: "8px 16px",
      fontSize: 13,
      cursor: "pointer",
      fontFamily: "inherit",
      fontWeight: 600,
      flexShrink: 0
    }
  }, "+ \u65B0\u5EFA")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, vis.length ? vis.map(t => /*#__PURE__*/React.createElement(TaskCard, {
    key: t.id,
    task: t,
    onClick: () => setModal({
      ...t,
      nodes: t.nodes ? t.nodes.map(n => ({
        ...n
      })) : []
    })
  })) : /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "2rem",
      color: "var(--tm)",
      fontSize: 13
    }
  }, "\u6682\u65E0\u4EFB\u52A1")), modal && /*#__PURE__*/React.createElement(TaskModal, {
    task: modal,
    tasks: tasks,
    onSave: save,
    onClose: () => setModal(null),
    onDelete: () => {
      persist(tasks.filter(x => x.id !== modal.id));
      setModal(null);
    }
  }));
}
const TABS = [{
  key: "home",
  label: "首页"
}, {
  key: "tasks",
  label: "任务跟进"
}, {
  key: "logistics",
  label: "物流头程"
}, {
  key: "production",
  label: "精品生产"
}, {
  key: "tools",
  label: "工具"
}, {
  key: "agents",
  label: "AI 智能体"
}];
function BrandLogo({
  size = 28
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 32 32",
    "aria-hidden": true,
    style: {
      flexShrink: 0,
      display: "block"
    }
  }, /*#__PURE__*/React.createElement("rect", {
    x: "1",
    y: "1",
    width: "30",
    height: "30",
    rx: "7",
    fill: "#1a1d24",
    stroke: "rgba(255,255,255,0.14)",
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("text", {
    x: "16",
    y: "22",
    textAnchor: "middle",
    fill: "#fff",
    fontSize: "18",
    fontWeight: "700",
    fontFamily: "'PingFang SC','Microsoft YaHei',system-ui,sans-serif"
  }, "H"));
}
const SETTINGS_MENU_ITEMS = [{
  key: "staff",
  label: "全局员工名单"
}];
function SettingsMenu({
  onSelect
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = e => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const pick = key => {
    setOpen(false);
    onSelect(key);
  };
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: {
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setOpen(o => !o),
    "aria-expanded": open,
    title: "\u8BBE\u7F6E",
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "6px 12px",
      fontSize: 12,
      cursor: "pointer",
      color: "var(--tm)",
      fontFamily: "inherit",
      display: "flex",
      alignItems: "center",
      gap: 4
    }
  }, "\u2699 \u8BBE\u7F6E ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      opacity: 0.7
    }
  }, "\u25BE")), open && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      right: 0,
      top: "calc(100% + 4px)",
      minWidth: 148,
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: 4,
      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
      zIndex: 50
    }
  }, SETTINGS_MENU_ITEMS.map(item => /*#__PURE__*/React.createElement("button", {
    key: item.key,
    type: "button",
    onClick: () => pick(item.key),
    style: {
      display: "block",
      width: "100%",
      textAlign: "left",
      background: "transparent",
      border: "none",
      borderRadius: 7,
      padding: "8px 12px",
      fontSize: 12,
      cursor: "pointer",
      color: "var(--text)",
      fontFamily: "inherit"
    },
    onMouseEnter: e => e.currentTarget.style.background = "var(--bg)",
    onMouseLeave: e => e.currentTarget.style.background = "transparent"
  }, item.label))));
}
const APP_ORG_NAME = "泓森拓创科技";
const APP_PASSWORD = "X888888";
const APP_BUILD = "cloud-14";
const AUTH_SESSION_KEY = "ops-center-auth";
function readAuthSession() {
  try {
    return sessionStorage.getItem(AUTH_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}
function LoginScreen({
  onSuccess
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = e => {
    e.preventDefault();
    if (password === APP_PASSWORD) {
      setCurrentUser({
        id: APP_ORG_NAME,
        name: APP_ORG_NAME
      });
      try {
        sessionStorage.setItem(AUTH_SESSION_KEY, "1");
      } catch {/* ignore */}
      onSuccess();
      return;
    }
    setError("密码错误，请重试");
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: "#f8f8f6",
      color: "#111",
      fontFamily: "'PingFang SC','Microsoft YaHei',sans-serif",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem"
    }
  }, /*#__PURE__*/React.createElement("form", {
    onSubmit: submit,
    style: {
      width: "100%",
      maxWidth: 360,
      background: "#fff",
      border: "1px solid #e5e5e5",
      borderRadius: 16,
      padding: "1.75rem 1.5rem",
      boxShadow: "0 12px 40px rgba(0,0,0,0.06)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      marginBottom: 6
    }
  }, APP_ORG_NAME), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#888",
      marginBottom: 18,
      lineHeight: 1.55
    }
  }, "\u8BF7\u8F93\u5165\u56E2\u961F\u8BBF\u95EE\u5BC6\u7801\u540E\u8FDB\u5165\u8FD0\u8425\u4E2D\u5FC3"), /*#__PURE__*/React.createElement("label", {
    style: {
      display: "block",
      fontSize: 11,
      color: "#888",
      marginBottom: 6,
      fontWeight: 500
    }
  }, "\u8BBF\u95EE\u5BC6\u7801"), /*#__PURE__*/React.createElement("input", {
    type: "password",
    value: password,
    onChange: e => {
      setPassword(e.target.value);
      if (error) setError("");
    },
    placeholder: "\u8BF7\u8F93\u5165\u5BC6\u7801",
    autoFocus: true,
    style: {
      width: "100%",
      fontSize: 14,
      padding: "10px 12px",
      border: `1px solid ${error ? "#e57373" : "#e5e5e5"}`,
      borderRadius: 10,
      fontFamily: "inherit",
      marginBottom: error ? 8 : 16
    }
  }), error && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#c62828",
      marginBottom: 12
    }
  }, error), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    style: {
      width: "100%",
      background: "#2d7dd2",
      border: "none",
      borderRadius: 10,
      padding: "10px 14px",
      fontSize: 14,
      cursor: "pointer",
      fontFamily: "inherit",
      color: "#fff",
      fontWeight: 600
    }
  }, "\u8FDB\u5165")));
}
function App() {
  const [authed, setAuthed] = useState(readAuthSession);
  const [currentUser, setCurrentUserState] = useState(() => getCurrentUser());
  const [tab, setTab] = useState("home");
  const [dark, setDark] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState(null);
  const css = {
    "--bg": dark ? "#111" : "#f8f8f6",
    "--card": dark ? "#1c1c1c" : "#fff",
    "--border": dark ? "#2a2a2a" : "#e5e5e5",
    "--text": dark ? "#eee" : "#111",
    "--tm": dark ? "#777" : "#888"
  };
  if (!authed) {
    return /*#__PURE__*/React.createElement(LoginScreen, {
      onSuccess: () => {
        setCurrentUserState(getCurrentUser());
        setAuthed(true);
      }
    });
  }
  return /*#__PURE__*/React.createElement(UserContext.Provider, {
    value: currentUser
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...css,
      minHeight: "100vh",
      background: "var(--bg)",
      color: "var(--text)",
      fontFamily: "'PingFang SC','Microsoft YaHei',sans-serif"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 820,
      margin: "0 auto",
      padding: "1.5rem 1rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "1.5rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      fontSize: 18,
      fontWeight: 700,
      letterSpacing: "-0.02em"
    }
  }, /*#__PURE__*/React.createElement(BrandLogo, null), "\u6CD3\u68EE\u62D3\u521B\u79D1\u6280", /*#__PURE__*/React.createElement("span", {
    title: "\u7248\u672C\u6807\u8BC6\uFF1A\u63A8\u9001 GitHub \u540E\u7EA6 1 \u5206\u949F\u751F\u6548",
    style: {
      fontSize: 10,
      fontWeight: 600,
      color: "#2d7dd2",
      background: "#eef6ff",
      border: "1px solid #b8d4f0",
      padding: "2px 7px",
      borderRadius: 5
    }
  }, APP_BUILD)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(SettingsMenu, {
    onSelect: key => {
      if (key === "staff") setSettingsPanel("staff");
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => setDark(!dark),
    style: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "6px 12px",
      fontSize: 12,
      cursor: "pointer",
      color: "var(--tm)",
      fontFamily: "inherit"
    }
  }, dark ? "☀ 日间" : "☾ 夜间"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 4,
      marginBottom: "1.5rem",
      borderBottom: "1px solid var(--border)",
      paddingBottom: 0
    }
  }, TABS.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.key,
    onClick: () => setTab(t.key),
    style: {
      background: "transparent",
      border: "none",
      borderBottom: tab === t.key ? "2px solid #2d7dd2" : "2px solid transparent",
      padding: "8px 18px",
      fontSize: 13,
      fontWeight: tab === t.key ? 600 : 400,
      color: tab === t.key ? "#2d7dd2" : "var(--tm)",
      cursor: "pointer",
      fontFamily: "inherit",
      marginBottom: -1
    }
  }, t.label))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: tab === "home" ? "block" : "none"
    }
  }, /*#__PURE__*/React.createElement(HomePanel, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: tab === "tasks" ? "block" : "none"
    }
  }, /*#__PURE__*/React.createElement(TasksPanel, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: tab === "logistics" ? "block" : "none"
    }
  }, /*#__PURE__*/React.createElement(LogisticsPanel, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: tab === "production" ? "block" : "none"
    }
  }, /*#__PURE__*/React.createElement(ProductionPanel, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: tab === "tools" ? "block" : "none"
    }
  }, /*#__PURE__*/React.createElement(ToolsPanel, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: tab === "agents" ? "block" : "none"
    }
  }, /*#__PURE__*/React.createElement(AgentsPanel, null)), settingsPanel === "staff" && /*#__PURE__*/React.createElement(GlobalSettingsModal, {
    onClose: () => setSettingsPanel(null),
    onSaved: () => setSettingsPanel(null)
  })));
}
if (!window.__OPS_CENTER_MOUNTED__) {
  window.__OPS_CENTER_MOUNTED__ = true;
  const mountEl = document.getElementById("root");
  mountEl.replaceChildren();
  ReactDOM.createRoot(mountEl).render(/*#__PURE__*/React.createElement(App, null));
}

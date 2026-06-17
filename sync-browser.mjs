import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, "src");

function toBrowser(src, { exportName, stripUtilsThrough = null }) {
  let out = src
    .replace(/^import \{[^}]+\} from "react";\r?\n/, "const { useState, useRef, useEffect, useCallback, useMemo, createContext, useContext } = React;\n")
    .replace(/^import \{ useState, useEffect \} from "react";\r?\n/, "const { useState, useEffect, useCallback } = React;\n")
    .replace(/^import \{ useState \} from "react";\r?\n/, "const { useState, useEffect, useCallback } = React;\n")
    .replace(/import \{[^}]+\} from "\.\/utils\/storage\.js";\r?\n/g, "")
    .replace(/import \{[^}]+\} from "\.\/GlobalCloudSync\.jsx";\r?\n/g, "")
    .replace(/import \{ confirmDeleteWarning \} from "\.\/utils\/confirmDelete\.js";\r?\n/g, "")
    .replace(/import \{[^}]+\} from "\.\/context\/UserContext\.jsx";\r?\n/g, "")
    .replace(/import \{ OwnerField, ownerFilterOptions \} from "\.\/GlobalConfig\.jsx";\r?\n/g, "")
    .replace(/import \{ OwnerField, ownerFilterEntries, RoleBadge, getStaffRole \} from "\.\/GlobalConfig\.jsx";\r?\n/g, "")
    .replace(/import \{ GlobalSettingsModal, OwnerField, useGlobalConfig, getStaffRole, RoleBadge, getStaffNames \} from "\.\/GlobalConfig\.jsx";\r?\n/g, "")
    .replace(/import \{ GlobalSettingsModal, OwnerField, useGlobalConfig, getStaffRole, RoleBadge \} from "\.\/GlobalConfig\.jsx";\r?\n/g, "")
    .replace(/import \{[^}]+\} from "\.\/GlobalConfig\.jsx";\r?\n/g, "")
    .replace(/import \{[^}]+\} from "\.\/OpsPremiumKpi\.jsx";\r?\n/g, "")
    .replace(/^import .+;\r?\n/gm, "");
  if (stripUtilsThrough) {
    const idx = out.indexOf(stripUtilsThrough);
    if (idx >= 0) {
      out =
        "// Shared helpers (TODAY, fmtD, Avatar, …) come from LogisticsModule.browser.jsx loaded first.\n\n" +
        out.slice(idx);
    }
  }
  if (exportName) {
    out = out.replace(new RegExp(`^export function ${exportName}`, "m"), `function ${exportName}`);
  }
  // confirmDeleteWarning 由 app.html 启动脚本统一注入，生成文件里不应再声明
  out = out.replace(/\/\/[^\n]*CONFIRM DELETE[^\n]*\r?\n/g, "");
  out = out.replace(/const confirmDeleteWarning[\s\S]*?\);\s*\r?\n/g, "");
  out = out.replace(/function confirmDeleteWarning\s*\([^)]*\)\s*\{[\s\S]*?\}\s*\r?\n/g, "");
  return out;
}

function storageBrowserBlock() {
  let storage = fs.readFileSync(path.join(dir, "utils/storage.js"), "utf8");
  storage = storage
    .replace(/^import \{[^}]+\} from "react";\r?\n/gm, "")
    .replace(/^import \{ sharedStorage \} from "\.\.\/GlobalConfig\.jsx";\r?\n/gm, "")
    .replace(/^export \{ sharedStorage \} from "\.\.\/GlobalConfig\.jsx";\r?\n/gm, "")
    .replace(/^export /gm, "");
  let userCtx = fs.readFileSync(path.join(dir, "context/UserContext.jsx"), "utf8");
  userCtx = userCtx
    .replace(/^import \{[^}]+\} from "react";\r?\n/, "")
    .replace(/^import \{ getCurrentUser \} from "\.\.\/utils\/storage\.js";\r?\n\r?\n/, "")
    .replace(/^export const UserContext/gm, "const UserContext")
    .replace(/^export function useCurrentUser/gm, "function useCurrentUser");
  return (
    "// ─── STORAGE (shared / private) ─────────────────────────────────────\n" +
    storage.trim() +
    "\n\n// ─── USER CONTEXT ───────────────────────────────────────────────────\n" +
    userCtx.trim() +
    "\n\n"
  );
}

function cloudSyncConfigBlock() {
  const cfgPath = path.join(dir, "cloud-sync-config.js");
  let gistId = "";
  if (fs.existsSync(cfgPath)) {
    const src = fs.readFileSync(cfgPath, "utf8");
    const m = src.match(/GITHUB_GIST_ID\s*=\s*"([^"]*)"/);
    if (m?.[1]) gistId = m[1];
  }
  return (
    "// ─── CLOUD SYNC (GitHub Gist — token via gist-config.js, not in repo) ─\n" +
    `const GITHUB_GIST_ID = ${JSON.stringify(gistId)};\n` +
    "function getGistToken() {\n" +
    "  if (typeof window !== \"undefined\" && window.__OPS_GIST__?.token) return String(window.__OPS_GIST__.token);\n" +
    "  return \"\";\n" +
    "}\n" +
    "function getGistId() {\n" +
    "  if (typeof window !== \"undefined\" && window.__OPS_GIST__?.id) return String(window.__OPS_GIST__.id);\n" +
    "  return GITHUB_GIST_ID || \"\";\n" +
    "}\n\n"
  );
}

function globalConfigBrowserBlock() {
  let gc = fs.readFileSync(path.join(dir, "GlobalConfig.jsx"), "utf8");
  gc = gc
    .replace(/^import \{ GITHUB_GIST_ID(?:, GITHUB_GIST_TOKEN as \w+)? \} from "\.\/cloud-sync-config\.js";\r?\n+/m, "")
    .replace(/^import \{ GITHUB_GIST_ID \} from "\.\/cloud-sync-config\.js";\r?\n+/m, "")
    .replace(/^function getGistToken\(\) \{[\s\S]*?^}\r?\n+/m, "")
    .replace(/^function getGistId\(\) \{[\s\S]*?^}\r?\n+/m, "")
    .replace(/^import \{[^}]+\} from "react";\r?\n+/m, "")
    .replace(/^export const CONFIG_STORAGE_KEY/m, "const CONFIG_STORAGE_KEY")
    .replace(/^export const sharedStorage/m, "const sharedStorage")
    .replace(/^export const ROLE_COLORS/m, "const ROLE_COLORS")
    .replace(/^export const STAFF_ROLE_OPTIONS/m, "const STAFF_ROLE_OPTIONS")
    .replace(/^export const DEFAULT_GLOBAL_CONFIG/m, "const DEFAULT_GLOBAL_CONFIG")
    .replace(/^export function /gm, "function ")
    .replace(/^export async function /gm, "async function ")
    .replace(/onSaved\?\.\(\)/g, "onSaved && onSaved()");
  return (
    cloudSyncConfigBlock() +
    "// ─── GLOBAL CONFIG (全站共享：员工名单等) ─────────────────────────────\n" +
    gc.trim() +
    "\n\nwindow.ROLE_COLORS = ROLE_COLORS;\n" +
    "window.getEmployees = getEmployees;\n" +
    "window.getStaffNames = getStaffNames;\n" +
    "window.getStaffRole = getStaffRole;\n" +
    "window.ownerOptions = ownerOptions;\n" +
    "window.ownerFilterOptions = ownerFilterOptions;\n" +
    "window.ownerFilterEntries = ownerFilterEntries;\n" +
    "window.formatOwnerLabel = formatOwnerLabel;\n" +
    "window.RoleBadge = RoleBadge;\n" +
    "window.OwnerField = OwnerField;\n" +
    "window.GlobalSettingsModal = GlobalSettingsModal;\n" +
    "window.useGlobalConfig = useGlobalConfig;\n" +
    "window.fetchGlobalConfigFromCloud = fetchGlobalConfigFromCloud;\n" +
    "window.getGlobalConfigMeta = getGlobalConfigMeta;\n" +
    "window.sharedStorage = sharedStorage;\n"
  );
}

function injectGlobalConfig(logisticsBrowser, afterStorage = "") {
  const marker = "// ─── LOGISTICS MODULE";
  const idx = logisticsBrowser.indexOf(marker);
  if (idx < 0) return logisticsBrowser;
  return logisticsBrowser.slice(0, idx) + globalConfigBrowserBlock() + storageBrowserBlock() + "\n" + afterStorage + logisticsBrowser.slice(idx);
}

const logRaw = fs.readFileSync(path.join(dir, "LogisticsModule.jsx"), "utf8");
const fbaGantt = fs.readFileSync(path.join(dir, "FBAGanttCard.jsx"), "utf8");
const logMerged = logRaw
  .replace(/^import FBAGanttCard from "\.\/FBAGanttCard\.jsx";\r?\n/m, "")
  .replace(/^import FBAGanttCard from '\.\/FBAGanttCard\.jsx';\r?\n/m, "");
const fbaGanttBrowser = toBrowser(fbaGantt, { exportName: null })
  .replace(/^export default function FBAGanttCard/m, "function FBAGanttCard")
  .replace(/^const \{[^}]+\} = React;\r?\n+/, "");
const logBrowser = toBrowser(logMerged, { exportName: "LogisticsPanel" });
fs.writeFileSync(
  path.join(dir, "LogisticsModule.browser.jsx"),
  injectGlobalConfig(logBrowser, fbaGanttBrowser + "\n")
);

const prod = fs.readFileSync(path.join(dir, "ProductionModule.jsx"), "utf8");
const prodGantt = fs.readFileSync(path.join(dir, "ProdGanttCard.jsx"), "utf8");
const prodMerged = prod
  .replace(/^import ProdGanttCard from "\.\/ProdGanttCard\.jsx";\r?\n/m, "")
  .replace(/^import ProdGanttCard from '\.\/ProdGanttCard\.jsx';\r?\n/m, "");
const prodGanttBrowser = toBrowser(prodGantt, { exportName: null })
  .replace(/^export default function ProdGanttCard/m, "function ProdGanttCard")
  .replace(/^export function productionItemsToGanttProducts/m, "function productionItemsToGanttProducts")
  .replace(/^const \{[^}]+\} = React;\r?\n+/, "");
let prodBrowser = toBrowser(prodMerged, { exportName: "ProductionPanel", stripUtilsThrough: "// ─── PRODUCTION MODULE" });
prodBrowser = prodBrowser.replace("// ─── PRODUCTION MODULE", prodGanttBrowser + "\n// ─── PRODUCTION MODULE");
fs.writeFileSync(path.join(dir, "ProductionModule.browser.jsx"), prodBrowser);

const tools = fs.readFileSync(path.join(dir, "ToolsModule.jsx"), "utf8");
fs.writeFileSync(
  path.join(dir, "ToolsModule.browser.jsx"),
  toBrowser(tools, { exportName: "ToolsPanel", stripUtilsThrough: "// ─── TOOLS MODULE" })
);

const agents = fs.readFileSync(path.join(dir, "AgentsModule.jsx"), "utf8");
fs.writeFileSync(
  path.join(dir, "AgentsModule.browser.jsx"),
  toBrowser(agents, { exportName: "AgentsPanel", stripUtilsThrough: "// ─── AI AGENTS MODULE" })
);

const home = fs.readFileSync(path.join(dir, "HomeModule.jsx"), "utf8");
fs.writeFileSync(
  path.join(dir, "HomeModule.browser.jsx"),
  toBrowser(home, { exportName: "HomePanel" })
);

const premiumKpi = fs.readFileSync(path.join(dir, "OpsPremiumKpi.jsx"), "utf8")
  .replace(/^import \{[^}]+\} from "react";\r?\n/, "")
  .replace(/^export /gm, "");
const kpi = fs.readFileSync(path.join(dir, "KpiModule.jsx"), "utf8")
  .replace(/import \{[^}]+\} from "\.\/OpsPremiumKpi\.jsx";\r?\n/g, "");
fs.writeFileSync(
  path.join(dir, "KpiModule.browser.jsx"),
  toBrowser(premiumKpi + "\n\n" + kpi, { exportName: "KpiPanel" })
);

const cloudSyncRaw = fs.readFileSync(path.join(dir, "GlobalCloudSync.jsx"), "utf8");
let cloudSyncBrowser = toBrowser(cloudSyncRaw, { exportName: null })
  .replace(/^export const ALL_CLOUD_KEYS/m, "const ALL_CLOUD_KEYS")
  .replace(/^export function useConfirmLeave/m, "function useConfirmLeave")
  .replace(/^export function CloudSyncProvider/m, "function CloudSyncProvider")
  .replace(/^export function useCloudSyncPage/m, "function useCloudSyncPage")
  .replace(/^export function GlobalCloudBar/m, "function GlobalCloudBar");
cloudSyncBrowser +=
  "\nwindow.CloudSyncProvider = CloudSyncProvider;\n" +
  "window.useCloudSyncPage = useCloudSyncPage;\n" +
  "window.GlobalCloudBar = GlobalCloudBar;\n";
fs.writeFileSync(path.join(dir, "GlobalCloudSync.browser.jsx"), cloudSyncBrowser);

const app = fs.readFileSync(path.join(dir, "App.jsx"), "utf8");
const sharedEnd = app.indexOf("// ─── TASK MODULE");
const appBrowser =
  "// LogisticsModule.browser.jsx loads storage + GlobalConfig first.\n\n" +
  app.slice(sharedEnd)
    .replace(/^import .+\r?\n/gm, "")
    .replace(/^export default function App/m, "function App")
    .trimEnd() +
  "\n\nif (!window.__OPS_CENTER_MOUNTED__) {\n  window.__OPS_CENTER_MOUNTED__ = true;\n  const mountEl = document.getElementById(\"root\");\n  mountEl.replaceChildren();\n  ReactDOM.createRoot(mountEl).render(<App />);\n}\n";
fs.writeFileSync(path.join(dir, "App.browser.jsx"), appBrowser);

console.log("sync-browser ok");

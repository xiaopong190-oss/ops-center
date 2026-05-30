import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, "src");

function toBrowser(src, { exportName, stripUtilsThrough = null }) {
  let out = src
    .replace(/^import \{ useState, useRef \} from "react";\r?\n/, "const { useState, useRef, useEffect } = React;\n")
    .replace(/^import \{ useState \} from "react";\r?\n/, "const { useState, useEffect } = React;\n")
    .replace(/import \{ OwnerField, ownerFilterOptions \} from "\.\/GlobalConfig\.jsx";\r?\n/g, "")
    .replace(/import \{ OwnerField, ownerFilterEntries, RoleBadge, getStaffRole \} from "\.\/GlobalConfig\.jsx";\r?\n/g, "")
    .replace(/import \{ GlobalSettingsModal, OwnerField, useGlobalConfig, getStaffRole, RoleBadge \} from "\.\/GlobalConfig\.jsx";\r?\n/g, "");
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
  return out;
}

function globalConfigBrowserBlock() {
  let gc = fs.readFileSync(path.join(dir, "GlobalConfig.jsx"), "utf8");
  gc = gc
    .replace(/^import \{ useState, useEffect \} from "react";\r?\n\r?\n/, "")
    .replace(/^export const CONFIG_STORAGE_KEY/m, "const CONFIG_STORAGE_KEY")
    .replace(/^export const ROLE_COLORS/m, "const ROLE_COLORS")
    .replace(/^export const STAFF_ROLE_OPTIONS/m, "const STAFF_ROLE_OPTIONS")
    .replace(/^export const DEFAULT_GLOBAL_CONFIG/m, "const DEFAULT_GLOBAL_CONFIG")
    .replace(/^export function /gm, "function ")
    .replace(/onSaved\?\.\(\)/g, "onSaved && onSaved()");
  return (
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
    "window.useGlobalConfig = useGlobalConfig;\n"
  );
}

function injectGlobalConfig(logisticsBrowser) {
  const marker = "// ─── LOGISTICS MODULE";
  const idx = logisticsBrowser.indexOf(marker);
  if (idx < 0) return logisticsBrowser;
  return logisticsBrowser.slice(0, idx) + globalConfigBrowserBlock() + "\n" + logisticsBrowser.slice(idx);
}

const log = fs.readFileSync(path.join(dir, "LogisticsModule.jsx"), "utf8");
fs.writeFileSync(
  path.join(dir, "LogisticsModule.browser.jsx"),
  injectGlobalConfig(toBrowser(log, { exportName: "LogisticsPanel" }))
);

const prod = fs.readFileSync(path.join(dir, "ProductionModule.jsx"), "utf8");
fs.writeFileSync(
  path.join(dir, "ProductionModule.browser.jsx"),
  toBrowser(prod, { exportName: "ProductionPanel", stripUtilsThrough: "// ─── PRODUCTION MODULE" })
);

const tools = fs.readFileSync(path.join(dir, "ToolsModule.jsx"), "utf8");
fs.writeFileSync(
  path.join(dir, "ToolsModule.browser.jsx"),
  toBrowser(tools, { exportName: "ToolsPanel", stripUtilsThrough: "// ─── TOOLS MODULE" })
);

const app = fs.readFileSync(path.join(dir, "App.jsx"), "utf8");
const sharedEnd = app.indexOf("// ─── TASK MODULE");
const appBrowser =
  "// LogisticsModule.browser.jsx loads shared helpers + GlobalConfig first.\n\n" +
  app.slice(sharedEnd)
    .replace(/^export default function App/m, "function App")
    .trimEnd() +
  "\n\nconst root = ReactDOM.createRoot(document.getElementById(\"root\"));\nroot.render(<App />);\n";
fs.writeFileSync(path.join(dir, "App.browser.jsx"), appBrowser);

console.log("sync-browser ok");

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import babel from "@babel/standalone";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");

const files = [
  "LogisticsModule.browser.jsx",
  "ProductionModule.browser.jsx",
  "ToolsModule.browser.jsx",
  "AgentsModule.browser.jsx",
  "HomeModule.browser.jsx",
  "KpiModule.browser.jsx",
  "GlobalCloudSync.browser.jsx",
  "App.browser.jsx",
];

function stripModuleSyntax(code, index) {
  if (index > 0) code = code.replace(/^const \{ useState[^}]+\} = React;\s*\r?\n/m, "");
  code = code.replace(/import\s+(?:type\s+)?(?:\{[\s\S]*?\}|\*\s+as\s+\w+|\w+)\s+from\s+["'][^"']+["']\s*;?/g, "");
  code = code.replace(/import\s+["'][^"']+["']\s*;?/g, "");
  code = code.replace(/^\s*import\s+.+$/gm, "");
  code = code.replace(/^export\s+default\s+/gm, "");
  code = code.replace(/^export\s+/gm, "");
  code = code.replace(/export\s*\{[\s\S]*?\}\s*from\s+["'][^"']+["']\s*;?/g, "");
  code = code.replace(/\/\/[^\n]*CONFIRM DELETE[^\n]*\r?\n/g, "");
  code = code.replace(/const confirmDeleteWarning[\s\S]*?\);\s*\r?\n/g, "");
  code = code.replace(/function confirmDeleteWarning\s*\([^)]*\)\s*\{[\s\S]*?\}\s*\r?\n/g, "");
  return code;
}

const confirmDeleteHelper =
  "function confirmDeleteWarning(name, typeLabel) {\n" +
  "  return window.confirm(\n" +
  "    `⚠️ 警告\\n\\n确定删除${typeLabel}「${name}」吗？\\n\\n删除后无法恢复，链接与配置将从本机浏览器中永久移除。`\n" +
  "  );\n" +
  "}\n\n";

let failed = false;
for (const file of files) {
  const raw = fs.readFileSync(path.join(src, file), "utf8");
  const bad = raw.match(/^\s*import\s+/gm) || raw.match(/import\s+\{[\s\S]*?\}\s*from\s+/g);
  if (bad?.length) {
    console.error("FAIL source import in", file, bad.slice(0, 3));
    failed = true;
  }
}

const chunks = files.map((file, i) => stripModuleSyntax(fs.readFileSync(path.join(src, file), "utf8"), i));
const bundled = confirmDeleteHelper + chunks.join("\n\n");
const compiled = babel.transform(bundled, { presets: ["react"], filename: "ops-center.bundle.jsx" }).code;
const outImports = compiled.match(/\bimport\s+[\{\*]/g);
if (outImports?.length) {
  console.error("FAIL compiled still has import:", outImports.length);
  failed = true;
} else {
  console.log("OK compiled bundle has no import statements");
}

if (failed) process.exit(1);
console.log("verify-browser-boot ok");

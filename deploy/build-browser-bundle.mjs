/**
 * 预编译 browser 模式 bundle，供 GitHub Pages 直接加载（无需运行时 Babel）
 */
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
  "KnowledgeModule.browser.jsx",
  "HomeModule.browser.jsx",
  "KpiModule.browser.jsx",
  "GlobalCloudSync.browser.jsx",
  "App.browser.jsx",
];

const confirmDeleteHelper =
  "function confirmDeleteWarning(name, typeLabel) {\n" +
  "  return window.confirm(\n" +
  "    `⚠️ 警告\\n\\n确定删除${typeLabel}「${name}」吗？\\n\\n删除后无法恢复，链接与配置将从本机浏览器中永久移除。`\n" +
  "  );\n" +
  "}\n\n";

function stripForBundle(code, index) {
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

const chunks = files.map((file, i) => {
  const code = fs.readFileSync(path.join(src, file), "utf8");
  return stripForBundle(code, i);
});

const bundled = confirmDeleteHelper + chunks.join("\n\n");
let compiled;
try {
  compiled = babel.transform(bundled, {
    presets: ["react"],
    filename: "ops-center.bundle.jsx",
  }).code;
} catch (e) {
  console.error("build-browser-bundle FAILED:", e.message);
  if (e.loc) console.error(`  at line ${e.loc.line}, column ${e.loc.column}`);
  process.exit(1);
}

const outPath = path.join(root, "app.bundle.js");
fs.writeFileSync(
  outPath,
  `/* ops-center prebuilt bundle */\n${compiled}\n`,
  "utf8"
);

console.log("build-browser-bundle ok:", outPath, `(${fs.statSync(outPath).size} bytes)`);

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
  "HomeModule.browser.jsx",
  "App.browser.jsx",
];

function stripForBundle(code, index) {
  if (index > 0) code = code.replace(/^const \{ useState[^}]+\} = React;\s*\r?\n/m, "");
  return code
    .replace(/^import .+;\s*\r?\n/gm, "")
    .replace(/^export default /gm, "")
    .replace(/^export /gm, "");
}

const chunks = files.map((file, i) => {
  const code = fs.readFileSync(path.join(src, file), "utf8");
  return stripForBundle(code, i);
});

const bundled = chunks.join("\n\n");
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

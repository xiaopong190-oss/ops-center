/**
 * 生成 GitHub Pages 静态站点到 docs/
 * 用法: node deploy/build-pages.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const out = path.join(root, "docs");

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn("skip (missing):", path.relative(root, src));
    return false;
  }
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn("skip dir (missing):", path.relative(root, src));
    return;
  }
  mkdirp(dest);
  for (const name of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, name.name);
    const d = path.join(dest, name.name);
    if (name.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

console.log("==> sync browser jsx");
execSync("node sync-browser.mjs", { cwd: root, stdio: "inherit" });

console.log("==> sync amazon news");
try {
  execSync("node sync-amazon-news.mjs --force", { cwd: root, stdio: "inherit" });
} catch {
  console.warn("amazon-news sync skipped (will use existing file if any)");
}

console.log("==> build precompiled app.bundle.js");
execSync("npm install --no-audit --no-fund", { cwd: root, stdio: "inherit" });
execSync("node deploy/build-browser-bundle.mjs", { cwd: root, stdio: "inherit" });

console.log("==> pack disk-cleaner zip (optional)");
try {
  execSync(
    'powershell -NoProfile -ExecutionPolicy Bypass -File "deploy/pack-disk-cleaner.ps1"',
    { cwd: root, stdio: "inherit" }
  );
} catch {
  console.warn("disk-cleaner zip skipped");
}

console.log("==> pack mailwatch zip (optional)");
try {
  execSync(
    'powershell -NoProfile -ExecutionPolicy Bypass -File "deploy/pack-mailwatch.ps1"',
    { cwd: root, stdio: "inherit" }
  );
} catch {
  console.warn("mailwatch zip skipped");
}

console.log("==> build docs/");
rmrf(out);
mkdirp(out);

const staticFiles = [
  "app.html",
  "logo.svg",
  "fx-rates.json",
  "amazon-news.json",
  "fba-profit-calculator.html",
  "fba-warehouse-tool.html",
];

for (const f of staticFiles) {
  copyFile(path.join(root, f), path.join(out, f));
}

copyFile(path.join(root, "app.bundle.js"), path.join(out, "app.bundle.js"));

// GitHub Pages 默认入口
copyFile(path.join(root, "app.html"), path.join(out, "index.html"));

const browserJsx = fs
  .readdirSync(path.join(root, "src"))
  .filter((f) => f.endsWith(".browser.jsx"));
for (const f of browserJsx) {
  copyFile(path.join(root, "src", f), path.join(out, "src", f));
}

copyDir(path.join(root, "tools"), path.join(out, "tools"));
copyDir(path.join(root, "packages"), path.join(out, "packages"));

fs.writeFileSync(path.join(out, ".nojekyll"), "");
fs.writeFileSync(
  path.join(out, "README.txt"),
  "此目录由 deploy/build-pages.mjs 自动生成，请勿手改。请改源码后重新打包。\n"
);

const countFiles = (dir) => {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countFiles(path.join(dir, e.name));
    else n++;
  }
  return n;
};

console.log(`\nDone: ${out}`);
console.log(`Files: ${countFiles(out)}`);
console.log("Upload: push to GitHub, enable Pages → source: GitHub Actions (or branch main /docs)");

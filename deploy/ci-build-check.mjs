import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const log = path.join(root, "ci-build.log");
const lines = [];

function logLine(s) {
  lines.push(s);
  console.log(s);
}

try {
  logLine("==> sync-browser");
  execSync("node sync-browser.mjs", { cwd: root, stdio: "pipe" });
  logLine("sync ok");

  logLine("==> build bundle");
  execSync("node deploy/build-browser-bundle.mjs", { cwd: root, stdio: "pipe" });
  const bundle = fs.readFileSync(path.join(root, "app.bundle.js"), "utf8");
  logLine(`bundle size: ${bundle.length}`);
  logLine(`cloud-14: ${bundle.includes("cloud-14")}`);
  logLine(`configVersion: ${bundle.includes("key: configVersion")}`);

  logLine("==> build-pages (no pack scripts)");
  execSync("node deploy/build-pages-lite.mjs", { cwd: root, stdio: "pipe" });
  logLine("docs ok");
  logLine("SUCCESS");
} catch (e) {
  logLine("FAILED: " + (e.stderr?.toString() || e.stdout?.toString() || e.message));
  process.exitCode = 1;
} finally {
  fs.writeFileSync(log, lines.join("\n"), "utf8");
}

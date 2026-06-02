/**
 * 把本机 localStorage 备份 JSON 推送到 Gist
 * 用法: node deploy/push-backup-to-gist.mjs path/to/backup.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const backupPath = process.argv[2];

if (!backupPath || !fs.existsSync(backupPath)) {
  console.error("用法: node deploy/push-backup-to-gist.mjs <backup.json>");
  process.exit(1);
}

function loadConfig() {
  const cfgPath = path.join(root, "src", "cloud-sync-config.js");
  const src = fs.readFileSync(cfgPath, "utf8");
  const token = (src.match(/GITHUB_GIST_TOKEN\s*=\s*"([^"]*)"/) || [])[1]?.trim();
  const gistId = (src.match(/GITHUB_GIST_ID\s*=\s*"([^"]*)"/) || [])[1]?.trim();
  if (!token || !gistId) throw new Error("请在 cloud-sync-config.js 填写 GITHUB_GIST_TOKEN 和 GITHUB_GIST_ID");
  return { token, gistId };
}

const { token, gistId } = loadConfig();
const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
const keys = ["logistics", "tasks", "production", "tools-links"];
const fileMap = {
  logistics: "logistics.json",
  tasks: "tasks.json",
  production: "production.json",
  "tools-links": "tools-links.json",
};

for (const key of keys) {
  const raw = backup[key] ?? backup[`shared:${key}`];
  if (!raw) {
    console.warn("跳过（备份里没有）:", key);
    continue;
  }
  const payload = typeof raw === "object" && raw.data != null
    ? raw
    : { data: raw, updatedBy: "backup-import", updatedAt: Date.now() };
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      files: { [fileMap[key]]: { content: JSON.stringify(payload, null, 2) } },
    }),
  });
  if (!res.ok) {
    console.error("FAIL", key, res.status, await res.text());
    process.exitCode = 1;
    continue;
  }
  const n = Array.isArray(payload.data) ? payload.data.length : "?";
  console.log("ok:", key, "→", n, "条");
}

console.log("\n完成。请 rebuild-bundle.bat 并刷新网站。");

/**
 * 在已有 Gist 里新增 agents.json（只需运行一次）
 * node deploy/add-gist-agents-file.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadConfig() {
  const secretPath = path.join(root, "src", "cloud-sync-config.secret.js");
  const cfgPath = path.join(root, "src", "cloud-sync-config.js");
  let token = process.env.GITHUB_GIST_TOKEN || process.env.OPS_GIST_TOKEN || "";
  if (!token && fs.existsSync(secretPath)) {
    const src = fs.readFileSync(secretPath, "utf8");
    token = (src.match(/GITHUB_GIST_TOKEN\s*=\s*"([^"]+)"/) || [])[1] || "";
  }
  let gistId = "";
  if (fs.existsSync(cfgPath)) {
    const src = fs.readFileSync(cfgPath, "utf8");
    gistId = (src.match(/GITHUB_GIST_ID\s*=\s*"([^"]+)"/) || [])[1] || "";
  }
  if (!token || !gistId) throw new Error("需要 cloud-sync-config.secret.js 里的 Token 和 GIST_ID");
  return { token, gistId };
}

const { token, gistId } = loadConfig();
const empty = JSON.stringify({ data: [], updatedBy: "init", updatedAt: Date.now() }, null, 2);

const res = await fetch(`https://api.github.com/gists/${gistId}`, {
  method: "PATCH",
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  },
  body: JSON.stringify({
    files: { "agents.json": { content: empty } },
  }),
});

if (!res.ok) {
  console.error("失败:", res.status, await res.text());
  process.exit(1);
}
console.log("✓ 已在 Gist 中创建 agents.json");

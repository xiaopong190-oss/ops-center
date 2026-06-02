/**
 * 创建 ops-center 用的 Secret Gist（4 个 json 文件）
 * 用法: 在 src/cloud-sync-config.secret.js 填入 Token，然后 node deploy/seed-github-gist.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadGistToken() {
  const fromEnv = process.env.GITHUB_GIST_TOKEN || process.env.OPS_GIST_TOKEN || process.env.GH_TOKEN || "";
  if (fromEnv) return fromEnv.trim();
  const secretPath = path.join(root, "src", "cloud-sync-config.secret.js");
  if (fs.existsSync(secretPath)) {
    const src = fs.readFileSync(secretPath, "utf8");
    const m = src.match(/GITHUB_GIST_TOKEN\s*=\s*"([^"]+)"/);
    if (m?.[1]) return m[1];
  }
  return "";
}

const token = loadGistToken();
if (!token) {
  console.error("请创建 src/cloud-sync-config.secret.js 并填入 GITHUB_GIST_TOKEN");
  process.exit(1);
}

const emptyPayload = (label) =>
  JSON.stringify({ data: [], updatedBy: "seed", updatedAt: Date.now(), _note: label }, null, 2);

const files = {
  "logistics.json": { content: emptyPayload("logistics") },
  "tasks.json": { content: emptyPayload("tasks") },
  "production.json": { content: emptyPayload("production") },
  "tools-links.json": { content: emptyPayload("tools-links") },
};

const res = await fetch("https://api.github.com/gists", {
  method: "POST",
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  },
  body: JSON.stringify({
    description: "ops-center 运营中心共享数据",
    public: false,
    files,
  }),
});

if (!res.ok) {
  console.error("创建 Gist 失败:", res.status, await res.text());
  process.exit(1);
}

const gist = await res.json();
console.log("\n✓ Gist 已创建");
console.log("  URL:", gist.html_url);
console.log("  GIST_ID:", gist.id);
console.log("\n请把 GIST_ID 写入 src/cloud-sync-config.js 和 gist-config.js");

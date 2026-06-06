/**
 * 向已有 ops-center Gist 追加 lingxing-sku-db.json（若不存在）
 * 用法: node deploy/patch-gist-lingxing-sku.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GIST_API = "https://api.github.com/gists";
const FILE_NAME = "lingxing-sku-db.json";

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

function loadGistId() {
  const fromEnv = process.env.GITHUB_GIST_ID || process.env.OPS_GIST_ID || "";
  if (fromEnv) return fromEnv.trim();
  const cfgPath = path.join(root, "src", "cloud-sync-config.js");
  if (fs.existsSync(cfgPath)) {
    const src = fs.readFileSync(cfgPath, "utf8");
    const m = src.match(/GITHUB_GIST_ID\s*=\s*"([^"]*)"/);
    if (m?.[1]) return m[1];
  }
  const gistCfgPath = path.join(root, "gist-config.js");
  if (fs.existsSync(gistCfgPath)) {
    const src = fs.readFileSync(gistCfgPath, "utf8");
    const m = src.match(/__OPS_GIST__\.id\s*=\s*"([^"]*)"/);
    if (m?.[1]) return m[1];
  }
  return "";
}

const token = loadGistToken();
const gistId = loadGistId();
if (!token || !gistId) {
  console.error("请配置 GITHUB_GIST_TOKEN 与 GIST_ID（cloud-sync-config.secret.js 或环境变量）");
  process.exit(1);
}

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "X-GitHub-Api-Version": "2022-11-28",
};

const getRes = await fetch(`${GIST_API}/${gistId}`, { headers });
if (!getRes.ok) {
  console.error("读取 Gist 失败:", getRes.status, await getRes.text());
  process.exit(1);
}

const gist = await getRes.json();
if (gist?.files?.[FILE_NAME]?.content) {
  const data = JSON.parse(gist.files[FILE_NAME].content);
  const count = data?.data && typeof data.data === "object"
    ? Object.keys(data.data).length
    : 0;
  console.log(`✓ ${FILE_NAME} 已存在（${count} 条 SKU），无需 patch`);
  process.exit(0);
}

const seedPath = path.join(root, "deploy", "snapshot-seeds", "shared-lingxing-sku-db.json");
const seed = fs.existsSync(seedPath)
  ? JSON.parse(fs.readFileSync(seedPath, "utf8"))
  : { data: {}, updatedBy: "seed", updatedAt: Date.now() };

const patchRes = await fetch(`${GIST_API}/${gistId}`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({
    files: {
      [FILE_NAME]: { content: JSON.stringify(seed, null, 2) },
    },
  }),
});

if (!patchRes.ok) {
  console.error("patch Gist 失败:", patchRes.status, await patchRes.text());
  process.exit(1);
}

console.log(`✓ 已向 Gist ${gistId} 添加 ${FILE_NAME}`);
console.log("  团队可在 FBA 转换工具中「从团队库更新」/「同步到团队库」");

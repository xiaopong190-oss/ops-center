/**
 * 从 cloud-sync-config.secret.js 生成本机 gist-config.local.js（勿提交）
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const secretPath = path.join(root, "src", "cloud-sync-config.secret.js");
const cfgPath = path.join(root, "src", "cloud-sync-config.js");
const outPath = path.join(root, "gist-config.local.js");

function readToken() {
  if (fs.existsSync(secretPath)) {
    const src = fs.readFileSync(secretPath, "utf8");
    const m = src.match(/GITHUB_GIST_TOKEN\s*=\s*"([^"]+)"/);
    if (m?.[1]) return m[1];
  }
  const env = process.env.GITHUB_GIST_TOKEN || process.env.OPS_GIST_TOKEN || "";
  if (env) return env.trim();
  return "";
}

function readGistId() {
  if (fs.existsSync(cfgPath)) {
    const src = fs.readFileSync(cfgPath, "utf8");
    const m = src.match(/GITHUB_GIST_ID\s*=\s*"([^"]+)"/);
    if (m?.[1]) return m[1];
  }
  return "";
}

const token = readToken();
const id = readGistId();
if (!token) {
  console.warn("write-local-gist-config: 无 Token，跳过 gist-config.local.js");
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  process.exit(0);
}

const body =
  `window.__OPS_GIST__ = window.__OPS_GIST__ || {};\n` +
  `window.__OPS_GIST__.token = ${JSON.stringify(token)};\n` +
  (id ? `window.__OPS_GIST__.id = ${JSON.stringify(id)};\n` : "");

fs.writeFileSync(outPath, body, "utf8");
console.log("gist-config.local.js ok (local only, not for git)");

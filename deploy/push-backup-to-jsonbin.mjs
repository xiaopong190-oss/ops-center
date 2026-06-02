/**
 * 将 data/local-backup.json 上传到 JSONBin
 * 用法: node deploy/push-backup-to-jsonbin.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const backupPath = path.join(root, "data", "local-backup.json");

const JSONBIN_API_KEY = "$2a$10$2ozXoCjldhmBsjtHria.3.Qe9IGP3lPWQnxGsvO4fOBdlfDogsBZq";
const JSONBIN_API_BASE = "https://api.jsonbin.io/v3/b";
const BINS = {
  logistics: "6a1d27c321f9ee59d2a3c1c4",
  tasks: "6a1d27fd21f9ee59d2a3c26e",
  production: "6a1d282721f9ee59d2a3c30a",
  "tools-links": "6a1d284521f9ee59d2a3c375",
};

if (!fs.existsSync(backupPath)) {
  console.error("找不到", backupPath);
  console.error("请先: run.bat → 打开 tools/backup-local-data.html → 下载并保存到 data/local-backup.json");
  process.exit(1);
}

const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
const modules = backup.modules || backup;

for (const [key, binId] of Object.entries(BINS)) {
  const mod = modules[key];
  if (!mod) {
    console.warn("skip (backup 无此模块):", key);
    continue;
  }
  const record = mod.data != null
    ? { data: mod.data, updatedBy: mod.updatedBy || "local-restore", updatedAt: mod.updatedAt || Date.now() }
    : { data: mod, updatedBy: "local-restore", updatedAt: Date.now() };
  const count = Array.isArray(record.data) ? record.data.length : "?";
  if (count === 0) {
    console.warn("skip (0 条):", key);
    continue;
  }
  const res = await fetch(`${JSONBIN_API_BASE}/${binId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": JSONBIN_API_KEY,
    },
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    console.error("FAIL", key, res.status, await res.text());
    process.exitCode = 1;
    continue;
  }
  console.log("upload ok:", key, "→", count, "条");
}

console.log("\n完成。请运行 DEPLOY-NOW.bat 更新线上，然后 Ctrl+F5。");

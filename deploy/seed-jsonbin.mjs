/**
 * 云端 JSONBin 为空时，写入示例数据（恢复可同步的初始内容）
 * 用法: node deploy/seed-jsonbin.mjs
 */
const JSONBIN_API_KEY = "$2a$10$2ozXoCjldhmBsjtHria.3.Qe9IGP3lPWQnxGsvO4fOBdlfDogsBZq";
const JSONBIN_API_BASE = "https://api.jsonbin.io/v3/b";
const BINS = {
  logistics: "6a1d27c321f9ee59d2a3c1c4",
  tasks: "6a1d27fd21f9ee59d2a3c26e",
  production: "6a1d282721f9ee59d2a3c30a",
};

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function extractConst(file, name) {
  const src = fs.readFileSync(path.join(root, "src", file), "utf8");
  const mark = `const ${name} = `;
  const start = src.indexOf(mark);
  if (start < 0) throw new Error(`找不到 ${name}`);
  let i = start + mark.length;
  while (src[i] === " ") i++;
  if (src[i] !== "[") throw new Error(`${name} 不是数组`);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "[") depth++;
    else if (src[j] === "]") {
      depth--;
      if (depth === 0) return eval(src.slice(i, j + 1));
    }
  }
  throw new Error(`${name} 数组未闭合`);
}

const seeds = {
  tasks: extractConst("App.jsx", "INIT_TASKS"),
  logistics: extractConst("LogisticsModule.jsx", "INIT_LOGISTICS"),
  production: extractConst("ProductionModule.jsx", "INIT_PROD"),
};

for (const [key, binId] of Object.entries(BINS)) {
  const payload = {
    data: seeds[key],
    updatedBy: "seed-script",
    updatedAt: Date.now(),
  };
  const res = await fetch(`${JSONBIN_API_BASE}/${binId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": JSONBIN_API_KEY,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error("FAIL", key, res.status, await res.text());
    process.exitCode = 1;
    continue;
  }
  console.log("seed ok:", key, "→", seeds[key].length, "条");
}

console.log("\n完成。请再运行 DEPLOY-NOW.bat 更新 Pages 快照。");

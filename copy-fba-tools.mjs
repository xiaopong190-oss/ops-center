import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)));

const tools = [
  { src: "d:\\自改小工具\\FBA工具\\index.html", dest: "fba-profit-calculator.html" },
  { src: "d:\\自改小工具\\FBA分仓工具\\index.html", dest: "fba-warehouse-tool.html" },
];

for (const { src, dest } of tools) {
  const out = path.join(root, dest);
  if (!fs.existsSync(src)) {
    console.warn("skip (source missing):", src);
    continue;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(src, out);
  console.log("copied", dest, fs.statSync(out).size, "bytes");
}

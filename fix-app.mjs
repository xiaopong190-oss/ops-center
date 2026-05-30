import fs from "fs";

const appPath = "D:/Projects/ops-center/src/App.jsx";
const lines = fs.readFileSync(appPath, "utf8").split(/\r?\n/);

// Find duplicate block: after TasksPanel closing brace, before real PRODUCTION (PROD_STAGES)
const prodIdx = lines.findIndex((l, i) => i > 150 && l.includes("PRODUCTION MODULE") && lines[i + 1]?.includes("PROD_STAGES"));
if (prodIdx < 0) {
  console.error("Could not find PRODUCTION MODULE with PROD_STAGES");
  process.exit(1);
}

// Find tasks panel end (line after "function TasksPanel" closing)
const tasksEnd = lines.findIndex((l, i) => i > 100 && l === "}" && lines[i - 1]?.trim() === ");");
const insertAfter = tasksEnd >= 0 ? tasksEnd + 1 : 152;

const head = lines.slice(0, 1); // import useState
head.push('import { LogisticsPanel } from "./LogisticsModule.jsx";');
head.push(...lines.slice(1, insertAfter));
const tail = lines.slice(prodIdx);

const out = [...head, "", ...tail].join("\n");
fs.writeFileSync(appPath, out);
console.log("Fixed App.jsx:", head.length, "+ tail", tail.length, "lines");

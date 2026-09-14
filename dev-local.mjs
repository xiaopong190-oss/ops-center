import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const growthDir = path.resolve(projectDir, "amazon-growth");
const viteBin = path.join(projectDir, "node_modules", "vite", "bin", "vite.js");
const growthServer = path.join(growthDir, "proxy", "server.js");
const children = [];

function run(command, args, options) {
  const child = spawn(command, args, { stdio: "inherit", ...options });
  children.push(child);
  child.on("exit", code => {
    if (!stopping && code) shutdown(code);
  });
  return child;
}

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach(child => {
    if (!child.killed) child.kill();
  });
  setTimeout(() => process.exit(code), 100).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run(process.execPath, [growthServer], {
  cwd: growthDir,
  env: { ...process.env, PORT: "8791", ASINSCOPE_PORT: "33210" },
});
run(process.execPath, [viteBin, ...process.argv.slice(2)], { cwd: projectDir });

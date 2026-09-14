#!/usr/bin/env node
/**
 * 西柚数据调用台 —— 本地/自托管代理
 * 作用：1) 绕开浏览器对第三方 MCP 端点的 CORS 限制
 *       2) 把 MCP 密钥和 Anthropic 密钥留在服务端，不进前端代码
 *       3) 顺带把仓库里的静态页托管出来，一个进程搞定
 *
 * 运行：node proxy/server.js        （需要 Node 18+，用内置 fetch）
 * 环境变量：
 *   PORT               默认 8787
 *   MCP_ENDPOINT       西柚 MCP 的 URL，例如 https://mcp.example.com/mcp
 *   MCP_API_KEY        西柚密钥
 *   MCP_AUTH_HEADER    鉴权头名，默认 Authorization
 *   MCP_AUTH_PREFIX    鉴权值前缀，默认 "Bearer "（若对方要 X-Api-Key: xxx，设为空串）
 *   ANTHROPIC_API_KEY  分析用的 Claude 密钥
 *   ALLOW_ORIGIN       允许的前端来源，默认 http://localhost:8787
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8787;
const SCOPE_PORT = process.env.ASINSCOPE_PORT || 3210;
const ROOT = path.resolve(__dirname, "..");
const SCOPE_ROOT = path.join(ROOT, "asinscope");
const WATCH_ROOT = path.join(ROOT, "watchlist");
const LAUNCH_ROOT = path.join(ROOT, "launch-plan");
const KEYWORDS_ROOT = path.join(ROOT, "keywords");
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || `http://localhost:${PORT}`;
let registry;
function connections(){if(!registry)registry=require(path.join(__dirname,"connections.js")).createRegistry({env:process.env});return registry;}
const store = require(path.join(ROOT, "gateway", "evidence")).createStore();
const caller = require(path.join(ROOT, "gateway", "caller")).createCaller({
  registry: { list: () => connections().list(), get: id => connections().get(id) }
});
const gateway = require(path.join(ROOT, "gateway", "http")).createGateway({
  store,
  caller,
  origins: Array.from(new Set([
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    `http://[::1]:${PORT}`,
    `http://localhost:${SCOPE_PORT}`,
    `http://127.0.0.1:${SCOPE_PORT}`,
    `http://[::1]:${SCOPE_PORT}`,
    ALLOW_ORIGIN
  ].filter(Boolean)))
});

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8"
};

function cors(req, res) {
  return gateway.applyCors(req, res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", c => {
      size += c.length;
      if (size > 8 * 1024 * 1024) { reject(Object.assign(new Error("请求体过大"), {status:413})); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        const value = JSON.parse(body);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
        resolve(body);
      } catch { reject(Object.assign(new Error("请求体必须是 JSON 对象"), {status:400})); }
    });
    req.on("error", reject);
  });
}

function fail(res, code, msg) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: msg }));
}

/* ---------------- /api/mcp ---------------- */
async function handleMcp(req, res, selected) {
  const endpoint = selected ? selected.endpoint : process.env.MCP_ENDPOINT;
  if (req.headers["x-mcp-endpoint"] && req.headers["x-mcp-endpoint"] !== endpoint) return fail(res, 403, "代理端点须在服务端配置，不允许请求覆盖");
  if (!endpoint) return fail(res, 500, "未配置 MCP 端点：请设置服务端 MCP_ENDPOINT 环境变量。");

  const key = selected ? selected.key : req.headers["x-mcp-key"] || process.env.MCP_API_KEY || "";
  const authHeader = selected ? selected.authHeader : process.env.MCP_AUTH_HEADER || "Authorization";
  const authPrefix = selected ? selected.authPrefix : process.env.MCP_AUTH_PREFIX === undefined ? "Bearer " : process.env.MCP_AUTH_PREFIX;

  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream"
  };
  if (key) headers[authHeader] = authPrefix + key;
  if (req.headers["mcp-session-id"]) headers["Mcp-Session-Id"] = req.headers["mcp-session-id"];

  const body = await readBody(req);

  let upstream, text;
  try {
    upstream = await fetch(endpoint, { method: "POST", headers, body, redirect:"error", signal:AbortSignal.timeout(60000) });
    text = await upstream.text();
  } catch (e) {
    return fail(res, 502, "上游响应未确认，请核验本次是否已执行；未自动重试。");
  }

  const out = {
    "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8"
  };
  const sid = upstream.headers.get("mcp-session-id");
  if (sid) out["Mcp-Session-Id"] = sid;
  gateway.applyCors(req, res);
  res.writeHead(upstream.status, out);
  res.end(text);
}

/* ---------------- /api/claude ---------------- */
async function handleClaude(req, res) {
  const key = req.headers["x-anthropic-key"] || process.env.ANTHROPIC_API_KEY;
  if (!key) return fail(res, 500, "未配置 Anthropic 密钥：设置 ANTHROPIC_API_KEY 环境变量，或在页面设置里填。");
  const body = await readBody(req);
  let upstream, text;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(60000),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body
    });
    text = await upstream.text();
  } catch (e) {
    return fail(res, 502, "无法连接 Anthropic API：" + e.message);
  }
  gateway.applyCors(req, res);
  res.writeHead(upstream.status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(text);
}

/* ---------------- 静态文件 ---------------- */
function serveStatic(req, res, urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath.split("?")[0]); }
  catch { return fail(res, 400, "无效 URL 编码"); }
  if (rel === "/") rel = "/index.html";
  if (rel === "/favicon.ico" || /^\/apple-touch-icon/i.test(rel)) {
    res.writeHead(204, { "Cache-Control": "no-store" });
    return res.end();
  }
  const file = path.join(ROOT, rel.replace(/^\//, "").replace(/\//g, path.sep));
  const allowed = ["/index.html", "/assets/app.js", "/assets/mcp.js", "/assets/pool.js", "/assets/connections-ui.js", "/assets/claude.js", "/assets/report.js", "/assets/scene-reports.js", "/assets/data.js", "/assets/style.css"];
  if (!allowed.includes(rel)) return fail(res, 403, "禁止访问");
  try {
    const relative = path.relative(ROOT, fs.realpathSync(file));
    if (relative.startsWith("..") || path.isAbsolute(relative)) return fail(res, 403, "禁止访问");
  } catch { return fail(res, 404, "文件不存在"); }
  fs.readFile(file, (err, data) => {
    if (err) return fail(res, 404, "Not found: " + rel);
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

const SCOPE_ALLOWED = [
  "/index.html",
  "/assets/app.js",
  "/assets/mcp-client.js",
  "/assets/analyze.js",
  "/assets/style.css"
];
const WATCH_ALLOWED = SCOPE_ALLOWED.slice();
const LAUNCH_ALLOWED = ["/index.html", "/app.html", "/budget-math.cjs"];
const KEYWORDS_ALLOWED = ["/index.html", "/app/index.html", "/app/app.js", "/app/styles.css", "/app/report-parser.js", "/app/vendor/exceljs.min.js"];

function serveFolder(root, allowed, req, res, urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath.split("?")[0]); }
  catch { return fail(res, 400, "无效 URL 编码"); }
  if (rel === "/") rel = "/index.html";
  if (rel === "/favicon.ico" || /^\/apple-touch-icon/i.test(rel)) {
    res.writeHead(204, { "Cache-Control": "no-store" });
    return res.end();
  }
  const file = path.join(root, rel.replace(/^\//, "").replace(/\//g, path.sep));
  if (!allowed.includes(rel)) return fail(res, 403, "禁止访问");
  try {
    const relative = path.relative(root, fs.realpathSync(file));
    if (relative.startsWith("..") || path.isAbsolute(relative)) return fail(res, 403, "禁止访问");
  } catch { return fail(res, 404, "文件不存在"); }
  fs.readFile(file, (err, data) => {
    if (err) return fail(res, 404, "Not found: " + rel);
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

function serveAsinscope(req, res, urlPath) {
  return serveFolder(SCOPE_ROOT, SCOPE_ALLOWED, req, res, urlPath);
}
function serveWatchlist(req, res, urlPath) {
  return serveFolder(WATCH_ROOT, WATCH_ALLOWED, req, res, urlPath);
}
function serveLaunchPlan(req, res, urlPath) {
  return serveFolder(LAUNCH_ROOT, LAUNCH_ALLOWED, req, res, urlPath);
}
function serveKeywords(req, res, urlPath) {
  if (urlPath === "/app/" || urlPath === "/app") urlPath = "/app/index.html";
  return serveFolder(KEYWORDS_ROOT, KEYWORDS_ALLOWED, req, res, urlPath);
}

/* ---------------- 入口 ---------------- */
function createHandler(kind) {
  return async (req, res) => {
  if (!cors(req, res)) return fail(res, 403, "来源不允许；请从本地服务地址打开页面");
  const host = req.headers.host || "";
  let hostName = host;
  if (host.startsWith("[")) hostName = host.slice(1, host.indexOf("]"));
  else hostName = host.split(":")[0];
  if (!["localhost", "127.0.0.1", "::1"].includes(hostName)) return fail(res, 403, "Host 不允许");
  const origin = req.headers.origin;
  if (origin && !gateway.allowedOrigin(origin)) return fail(res, 403, "来源不允许；请从本地服务地址打开页面");
  if (process.env.PROXY_TOKEN && req.headers["x-proxy-token"] !== process.env.PROXY_TOKEN && req.method !== "OPTIONS" && (req.url || "").startsWith("/api/") && !(req.url || "").startsWith("/api/health")) return fail(res, 401, "代理访问令牌无效");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const url = (req.url || "/").split("?")[0];
  try {
    if (url === "/api/connections") {
      if (req.method === "GET") { res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"}); return res.end(JSON.stringify({connections:connections().list()})); }
      if (req.method !== "POST") return fail(res,405,"只支持 GET / POST");
      if (req.headers["x-connection-admin"] !== "1" || !(req.headers["content-type"]||"").startsWith("application/json")) return fail(res,403,"无效管理请求");
      try { const result=connections().update(JSON.parse(await readBody(req))); res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"}); return res.end(JSON.stringify({connections:result})); }
      catch(e){ return fail(res,400,"连接配置未保存："+e.message); }
    }
    if (url === "/api/connection-rpc") {
      if (req.method !== "POST") return fail(res,405,"只接受 POST");
      const selected=connections().get(req.headers["x-connection-id"]);
      if (!selected) return fail(res,404,"连接不存在或已停用");
      if (req.headers["x-mcp-endpoint"] || req.headers["x-mcp-key"]) return fail(res,403,"已保存连接不接受请求覆盖");
      return await handleMcp(req,res,selected);
    }
    if (url === "/api/mcp") {
      if (req.method !== "POST") return fail(res, 405, "只接受 POST");
      return await handleMcp(req, res);
    }
    if (url === "/api/claude") {
      if (req.method !== "POST") return fail(res, 405, "只接受 POST");
      return await handleClaude(req, res);
    }
    if (url === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        ok: true,
        app: kind,
        gateway: true,
        mcpEndpointConfigured: Boolean(process.env.MCP_ENDPOINT),
        anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY)
      }));
    }
    if (url.indexOf("/api/evidence/") === 0) {
      const handled = await gateway.handle(req, res, url);
      if (handled !== false) return;
    }
    if (req.method === "GET") {
      if (url === "/launch-plan" || url.indexOf("/launch-plan/") === 0) {
        return serveLaunchPlan(req, res, url.replace(/^\/launch-plan/, "") || "/");
      }
      if (url === "/keywords" || url.indexOf("/keywords/") === 0) {
        return serveKeywords(req, res, url.replace(/^\/keywords/, "") || "/");
      }
      if (url === "/watchlist" || url.indexOf("/watchlist/") === 0) {
        return serveWatchlist(req, res, url.replace(/^\/watchlist/, "") || "/");
      }
      if (url === "/asinscope" || url.indexOf("/asinscope/") === 0) {
        return serveAsinscope(req, res, url.replace(/^\/asinscope/, "") || "/");
      }
      return serveStatic(req, res, url);
    }
    return fail(res, 404, "Not found");
  } catch (e) {
    return fail(res, e.status || 500, e.message || String(e));
  }
  };
}

function listenLocal(handler, port, onListen) {
  const ipv4 = http.createServer(handler);
  ipv4.listen(port, "127.0.0.1", onListen);
  try { http.createServer(handler).listen(port, "::1"); } catch (_) { /* 本机无 IPv6 时忽略 */ }
  return ipv4;
}

const server = listenLocal(createHandler("console"), PORT, () => {
  console.log("西柚调用台代理已启动：http://127.0.0.1:" + PORT + "/");
  console.log("  静态页        http://127.0.0.1:" + PORT + "/");
  console.log("  MCP 代理      POST /api/mcp");
  console.log("  证据网关      /api/evidence/*");
  console.log("  Claude 代理   POST /api/claude");
  console.log("  MCP_ENDPOINT      " + (process.env.MCP_ENDPOINT ? "已配置" : "未配置"));
  console.log("  ANTHROPIC_API_KEY " + (process.env.ANTHROPIC_API_KEY ? "已设置" : "（未设置）"));
});
if (!process.env.ASINSCOPE_DISABLE) {
  listenLocal(createHandler("asinscope"), SCOPE_PORT, () => {
    console.log("ASINSCOPE 竞品分析：http://127.0.0.1:" + SCOPE_PORT + "/");
  });
}

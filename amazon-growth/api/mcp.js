/** Vercel Serverless Function：/api/mcp
 *  与 proxy/server.js 的 MCP 代理等价，部署到 Vercel 时自动生效。
 *  在 Vercel 项目设置里配置环境变量：MCP_ENDPOINT / MCP_API_KEY /
 *  可选 MCP_AUTH_HEADER、MCP_AUTH_PREFIX、ALLOW_ORIGIN
 */
export default async function handler(req, res) {
  const origin = process.env.ALLOW_ORIGIN || "";
  if (req.headers.origin && req.headers.origin !== origin) return res.status(403).json({error:"来源不允许"});
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id, X-Mcp-Endpoint, X-Mcp-Key, X-Proxy-Token");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "只接受 POST" });
  if (!process.env.PROXY_TOKEN) return res.status(503).json({error:"请配置 PROXY_TOKEN"});
  if (req.headers["x-proxy-token"] !== process.env.PROXY_TOKEN) return res.status(401).json({error:"访问令牌无效"});

  const endpoint = process.env.MCP_ENDPOINT;
  if (req.headers["x-mcp-endpoint"] && req.headers["x-mcp-endpoint"] !== endpoint) return res.status(403).json({error:"不允许覆盖上游端点"});
  if (!endpoint) return res.status(500).json({ error: "未配置 MCP_ENDPOINT" });

  const key = req.headers["x-mcp-key"] || process.env.MCP_API_KEY || "";
  const authHeader = process.env.MCP_AUTH_HEADER || "Authorization";
  const authPrefix = process.env.MCP_AUTH_PREFIX === undefined ? "Bearer " : process.env.MCP_AUTH_PREFIX;

  const headers = { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" };
  if (key) headers[authHeader] = authPrefix + key;
  if (req.headers["mcp-session-id"]) headers["Mcp-Session-Id"] = req.headers["mcp-session-id"];

  const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  if (Buffer.byteLength(body) > 8 * 1024 * 1024) return res.status(413).json({error:"请求体过大"});
  try { const value = JSON.parse(body); if (!value || typeof value !== "object" || Array.isArray(value)) throw Error(); }
  catch { return res.status(400).json({error:"请求体必须是 JSON 对象"}); }

  let upstream, text;
  try {
    upstream = await fetch(endpoint, { method: "POST", headers, body, redirect:"error", signal:AbortSignal.timeout(60000) });
    text = await upstream.text();
  } catch (e) {
    return res.status(502).json({ error: "无法连接 MCP 端点：" + e.message });
  }

  const sid = upstream.headers.get("mcp-session-id");
  if (sid) res.setHeader("Mcp-Session-Id", sid);
  res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
  return res.status(upstream.status).send(text);
}

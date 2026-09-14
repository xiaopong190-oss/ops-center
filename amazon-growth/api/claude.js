/** Vercel Serverless Function：/api/claude
 *  把前端的分析请求转发到 Anthropic Messages API，密钥留在服务端。
 *  环境变量：ANTHROPIC_API_KEY，可选 ALLOW_ORIGIN
 */
export default async function handler(req, res) {
  const origin = process.env.ALLOW_ORIGIN || "";
  if (req.headers.origin && req.headers.origin !== origin) return res.status(403).json({error:"来源不允许"});
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Anthropic-Key, X-Proxy-Token");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "只接受 POST" });
  if (!process.env.PROXY_TOKEN) return res.status(503).json({error:"请配置 PROXY_TOKEN"});
  if (req.headers["x-proxy-token"] !== process.env.PROXY_TOKEN) return res.status(401).json({error:"访问令牌无效"});

  const key = req.headers["x-anthropic-key"] || process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "未配置 ANTHROPIC_API_KEY" });

  const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  if (Buffer.byteLength(body) > 8 * 1024 * 1024) return res.status(413).json({error:"请求体过大"});
  try { const value = JSON.parse(body); if (!value || typeof value !== "object" || Array.isArray(value)) throw Error(); }
  catch { return res.status(400).json({error:"请求体必须是 JSON 对象"}); }

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
    return res.status(502).json({ error: "无法连接 Anthropic API：" + e.message });
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(upstream.status).send(text);
}

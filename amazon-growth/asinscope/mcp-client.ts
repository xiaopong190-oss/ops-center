/** 3210 ASINSCOPE 只通过本机证据网关取数，不保存 MCP Token。浏览器实际加载 assets/mcp-client.js。 */
export type Provider = "xiyou" | "sellersprite";
export type EvidenceCall = {
  provider?: Provider;
  tool: string;
  arguments?: Record<string, unknown>;
  cacheOnly?: boolean;
  refresh?: boolean;
};
export type EvidenceHit = {
  key: string;
  hit: boolean;
  stale?: boolean;
  payload?: unknown;
  retrievedAt?: number;
  expiresAt?: number;
};
export const gatewayPaths = {
  call: "/api/evidence/call",
  lookup: "/api/evidence/lookup",
  estimate: "/api/evidence/estimate",
  stats: "/api/evidence/stats",
  export: "/api/evidence/export"
};

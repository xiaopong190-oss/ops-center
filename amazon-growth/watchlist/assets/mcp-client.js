/* 监控清单 · 共享证据网关客户端
 * 走全局层 GrowthCore.evidence：代理地址与访问令牌统一在「数据与连接」维护，本页不保存 MCP Token。 */
(function () {
  "use strict";
  window.WatchlistMcp = window.GrowthCore.evidence("watchlist");
})();

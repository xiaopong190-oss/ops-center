(function () {
  "use strict";
  function headers() {
    return { "Content-Type": "application/json", "X-Evidence-Client": "watchlist" };
  }
  async function json(url, body) {
    const res = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body || {}) });
    const data = await res.json();
    if (!res.ok) throw Error(data.error || ("HTTP " + res.status));
    return data;
  }
  window.WatchlistMcp = {
    stats: () => fetch("/api/evidence/stats").then(r => r.json()),
    estimate: requests => json("/api/evidence/estimate", { requests: requests || [] }),
    call: (provider, tool, args, opts) => json("/api/evidence/call", Object.assign({
      provider: provider || "xiyou",
      tool: tool,
      arguments: args || {}
    }, opts || {})),
    publish: items => json("/api/evidence/publish", { items: items || [] })
  };
})();

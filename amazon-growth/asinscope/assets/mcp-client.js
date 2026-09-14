(function () {
  "use strict";
  function headers() {
    return { "Content-Type": "application/json", "X-Evidence-Client": "asinscope" };
  }
  async function json(url, body) {
    const res = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body || {}) });
    const data = await res.json();
    if (!res.ok) throw Error(data.error || ("HTTP " + res.status));
    return data;
  }
  const Client = {
    stats: () => fetch("/api/evidence/stats").then(r => r.json()),
    estimate: requests => json("/api/evidence/estimate", { requests: requests || [] }),
    lookup: (provider, tool, args) => json("/api/evidence/lookup", { provider: provider || "xiyou", tool: tool, arguments: args || {} }),
    call: async (provider, tool, args, opts) => {
      const body = Object.assign({
        provider: provider || "xiyou",
        tool: tool,
        arguments: args || {}
      }, opts || {});
      return json("/api/evidence/call", body);
    },
    exportRefs: keys => json("/api/evidence/export", { keys: keys || [] }),
    publish: items => json("/api/evidence/publish", { items: items || [] })
  };
  window.AsinScopeMcp = Client;
})();

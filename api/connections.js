const { cors, catalog, PROVIDERS, configured, mem, log } = require("./_lib");

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
  });
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  const workspace = req.headers["x-workspace"] || req.query.workspace || "demo";

  if (req.method === "GET") {
    return res.status(200).json({
      workspace,
      catalog: catalog(),
      connections: mem.connections.filter((c) => c.workspace === workspace)
    });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const provider = String(body.provider || "").toLowerCase();
    if (!PROVIDERS[provider]) {
      return res.status(400).json({ error: "Unknown provider", catalog: catalog() });
    }
    const row = {
      id: "pipe_" + Date.now().toString(36),
      workspace,
      provider,
      label: PROVIDERS[provider].label,
      live: configured(provider),
      hook: body.hook || null,
      createdAt: new Date().toISOString()
    };
    mem.connections.unshift(row);
    log("Pipe", "Connected " + provider + " · " + workspace, row.live ? "OK" : "Held");
    return res.status(201).json({
      ok: true,
      connection: row,
      next: row.live
        ? "Ready to receive POST /api/jobs ship"
        : "Add env keys, then reconnect. Catalog says which keys."
    });
  }

  if (req.method === "DELETE") {
    const id = req.query.id;
    const before = mem.connections.length;
    mem.connections = mem.connections.filter((c) => !(c.id === id && c.workspace === workspace));
    log("Pipe", "Disconnected " + id, "OK");
    return res.status(200).json({ ok: true, removed: before !== mem.connections.length });
  }

  return res.status(405).json({ error: "Use GET, POST, or DELETE" });
};

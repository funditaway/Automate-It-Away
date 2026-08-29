const { cors, catalog, PROVIDERS, configured, mem, log, save, workspaceOf, readBody } = require("./_lib");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const workspace = workspaceOf(req);

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
      status: provider === "whatnot" ? "down" : configured(provider) ? "live" : "hold",
      hook: body.hook || null,
      createdAt: new Date().toISOString()
    };
    mem.connections.unshift(row);
    save();
    log("Pipe", "Connected " + provider + " · " + workspace, row.live ? "OK" : "Held", workspace);
    return res.status(201).json({
      ok: true,
      connection: row,
      next: row.live
        ? "Ready for POST /api/jobs action=ship"
        : "Add env keys, then reconnect. Catalog says which keys."
    });
  }

  if (req.method === "DELETE") {
    const id = req.query.id;
    const before = mem.connections.length;
    mem.connections = mem.connections.filter((c) => !(c.id === id && c.workspace === workspace));
    save();
    log("Pipe", "Disconnected " + id, "OK", workspace);
    return res.status(200).json({ ok: true, removed: before !== mem.connections.length });
  }

  return res.status(405).json({ error: "Use GET, POST, or DELETE" });
};

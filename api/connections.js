const { cors, catalog, PROVIDERS, configured, mem, log, save, ready, workspaceOf, readBody, personOf, isOwner } = require("./_lib");

const SOON = {
  stripe: { label: "Stripe", acts: ["checkout", "payout"], note: "Card and payout later. Grok liked the fit. No keys, no live money." },
  paypal: { label: "PayPal", acts: ["checkout", "payout"], note: "Same money rules as Square. Coming soon." },
  shopify: { label: "Shopify", acts: ["list", "sync"], note: "Shop inventory in. Queue still owns Yes." },
  gmail: { label: "Gmail inbound", acts: ["capture"], note: "Mail becomes a card. Not a send pipe." },
  drive: { label: "Google Drive", acts: ["file"], note: "Packets land in a folder. Coming soon." },
  marketplace: { label: "Facebook / Instagram shop", acts: ["list"], note: "Beta name only. Owner tap still required to post." },
  poshmark: { label: "Poshmark", acts: ["list"], note: "Resale lane after Consign pipe is honest." },
  mercari: { label: "Mercari", acts: ["list"], note: "Same. Shown, not live." },
  quickbooks: { label: "QuickBooks", acts: ["invoice"], note: "Books after Collect. Not a payout." },
  slack: { label: "Slack", acts: ["notify"], note: "Desk ping. Helpers see Needs you." },
  voice: { label: "Missed-call voice", acts: ["capture"], note: "A call becomes a card. We type it until this ships." }
};

function soonCatalog() {
  return Object.entries(SOON).map(([id, spec]) => ({
    id,
    label: spec.label,
    acts: spec.acts,
    live: false,
    connectable: false,
    lane: "soon",
    status: "soon",
    note: spec.note
  }));
}

function inboundOf(workspace) {
  return "https://automateitaway.com/api/hook?workspace=" + encodeURIComponent(workspace);
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();

  const workspace = workspaceOf(req);

  if (req.method === "GET") {
    return res.status(200).json({
      workspace,
      inbound: inboundOf(workspace),
      catalog: catalog(),
      soon: soonCatalog(),
      helpers: {
        owner: "Connect, drop, Stop, money rules.",
        helper: "Work the queue. Yes when the rule allows. Cannot connect a pipe or tap No."
      },
      note: "Webhook is the cross-internet pipe today. Coming soon is a wall, not a live switch.",
      connections: mem.connections.filter((c) => c.workspace === workspace)
    });
  }

  if (req.method === "POST") {
    const { person } = personOf(req, workspace);
    if (person && !isOwner(person)) {
      return res.status(403).json({ error: "Owner pin required to connect a pipe." });
    }
    const body = await readBody(req);
    const provider = String(body.provider || "").toLowerCase();
    if (SOON[provider]) {
      return res.status(409).json({
        error: "Coming soon. Grok liked the name. It is not a live pipe.",
        status: "soon",
        catalog: catalog(),
        soon: soonCatalog()
      });
    }
    if (!PROVIDERS[provider]) {
      return res.status(400).json({ error: "Unknown provider", catalog: catalog(), soon: soonCatalog() });
    }
    if (provider === "whatnot") {
      return res.status(409).json({ error: "Whatnot stays down. Not a launch pipe.", status: "down" });
    }
    const row = {
      id: "pipe_" + Date.now().toString(36),
      workspace,
      provider,
      label: PROVIDERS[provider].label,
      live: configured(provider),
      status: provider === "whatnot" ? "down" : configured(provider) ? "live" : "hold",
      hook: body.hook || null,
      inbound: inboundOf(workspace),
      createdAt: new Date().toISOString()
    };
    mem.connections.unshift(row);
    log("Pipe", "Connected " + provider + " · " + workspace, row.live ? "OK" : "Held", workspace);
    await save();
    return res.status(201).json({
      ok: true,
      connection: row,
      inbound: row.inbound,
      next: row.live
        ? "Ship posts to your hook. Your hook writes back to inbound."
        : "Add env keys, then reconnect. Catalog says which keys."
    });
  }

  if (req.method === "DELETE") {
    const { person } = personOf(req, workspace);
    if (person && !isOwner(person)) {
      return res.status(403).json({ error: "Owner pin required to drop a pipe." });
    }
    const id = req.query.id;
    const before = mem.connections.length;
    mem.connections = mem.connections.filter((c) => !(c.id === id && c.workspace === workspace));
    log("Pipe", "Disconnected " + id, "OK", workspace);
    await save();
    return res.status(200).json({ ok: true, removed: before !== mem.connections.length });
  }

  return res.status(405).json({ error: "Use GET, POST, or DELETE" });
};

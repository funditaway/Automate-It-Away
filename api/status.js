const {
  cors, catalog, mem, ready, workspaceOf, personOf,
  pipesAnswered, answeredProviders
} = require("./_lib");

function honestConnection(row, answered) {
  const id = row && row.provider;
  if (!id) return null;
  if (id === "whatnot") {
    return {
      id: row.id,
      provider: id,
      label: row.label || "Whatnot",
      live: false,
      status: "down",
      note: "Not a launch pipe"
    };
  }
  const wrote = answered.indexOf(id) >= 0;
  return {
    id: row.id,
    provider: id,
    label: row.label || id,
    live: wrote,
    status: wrote ? "live" : "hold",
    note: wrote ? "Pipe wrote back." : "Hold until this pipe answers."
  };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET" });
  await ready();

  const workspace = workspaceOf(req);
  const { workspace: row } = personOf(req, workspace);
  const pipes = catalog();
  const answered = answeredProviders(workspace);
  const wrote = pipesAnswered(workspace);
  const mine = workspace
    ? (mem.connections || []).filter((c) => c && c.workspace === workspace && c.lane !== "draft")
    : [];

  return res.status(200).json({
    ok: true,
    workspace: workspace || "",
    label: row ? (row.biz || row.name || row.slug || "") : "",
    status: wrote ? "live" : "hold",
    answered: wrote,
    answeredPipes: answered,
    note: wrote
      ? "A pipe wrote back on this desk."
      : "Orange until a real pipe answers. Catalog matches /api/health.",
    pipes,
    connections: mine.map((c) => honestConnection(c, answered)).filter(Boolean),
    inbound: workspace ? "https://automateitaway.com/api/hook?workspace=" + encodeURIComponent(workspace) : "",
    honesty: {
      rule: "hold until a real pipe answers",
      writeback: "dispatch.ok or dispatch.inbound, never dispatch.demo",
      catalog: "same as /api/health — webhook live; paid pipes hold unless env; whatnot down"
    }
  });
};

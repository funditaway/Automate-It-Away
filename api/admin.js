const { cors, mem, log, save, ready, workspaceOf, readBody, personOf, isOwner, publicPerson } = require("./_lib");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();

  const workspace = workspaceOf(req);
  const { workspace: row, person } = personOf(req, workspace);
  if (!row) return res.status(404).json({ error: "No workspace" });
  if (!person) return res.status(401).json({ error: "Pin required" });

  if (req.method === "GET") {
    const jobs = mem.jobs.filter((j) => j.workspace === workspace);
    const body = {
      ok: true,
      you: publicPerson(person),
      workspace: {
        slug: row.slug,
        biz: row.biz,
        city: row.city,
        model: row.model
      },
      people: (row.people || []).map(publicPerson),
      counts: {
        waiting: jobs.filter((j) => j.status === "exception").length,
        held: jobs.filter((j) => j.status === "held").length,
        shipped: jobs.filter((j) => j.status === "shipped").length,
        killed: jobs.filter((j) => j.status === "killed").length
      },
      tickets: (mem.tickets || []).filter((t) => t.workspace === workspace).slice(0, 40)
    };
    if (isOwner(person)) {
      body.audit = mem.audit.filter((a) => !a.workspace || a.workspace === workspace).slice(0, 40);
      body.money = mem.money.filter((m) => m.workspace === workspace).slice(0, 40);
      body.connections = mem.connections.filter((c) => c.workspace === workspace);
    }
    return res.status(200).json(body);
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const action = body.action || "ticket";

    if (action === "ticket") {
      if (!Array.isArray(mem.tickets)) mem.tickets = [];
      const ticket = {
        id: "t_" + Date.now().toString(36),
        workspace,
        title: body.title || "Ticket",
        body: body.body || "",
        from: person.name,
        role: person.role,
        status: "open",
        createdAt: new Date().toISOString()
      };
      mem.tickets.unshift(ticket);
      log("Admin", "Ticket · " + ticket.title, "OK", workspace);
      await save();
      return res.status(201).json({ ok: true, ticket });
    }

    if (!isOwner(person)) {
      return res.status(403).json({ error: "Owner only." });
    }

    if (action === "close-ticket") {
      const ticket = (mem.tickets || []).find((t) => t.id === body.id && t.workspace === workspace);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      ticket.status = "closed";
      await save();
      return res.status(200).json({ ok: true, ticket });
    }

    return res.status(400).json({ error: "action must be ticket or close-ticket" });
  }

  return res.status(405).json({ error: "Use GET or POST" });
};

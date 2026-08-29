const { cors, mem, log, save, slugify, hashPin, workspaceOf, readBody } = require("./_lib");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    const workspace = workspaceOf(req);
    const pin = req.headers["x-pin"];
    const row = mem.workspaces.find((w) => w.slug === workspace);
    if (!row) return res.status(404).json({ ok: false, error: "No workspace" });
    if (pin && row.pin !== hashPin(pin)) {
      return res.status(401).json({ ok: false, error: "Bad pin" });
    }
    return res.status(200).json({
      ok: true,
      workspace: { slug: row.slug, name: row.name, biz: row.biz, city: row.city, model: row.model }
    });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const action = body.action || "open";

    if (action === "login") {
      const slug = slugify(body.workspace || body.slug || body.biz);
      const row = mem.workspaces.find((w) => w.slug === slug);
      if (!row || row.pin !== hashPin(body.pin || "")) {
        return res.status(401).json({ ok: false, error: "Workspace or pin does not match" });
      }
      log("Auth", "Second phone · " + slug, "OK", slug);
      return res.status(200).json({
        ok: true,
        workspace: { slug: row.slug, name: row.name, biz: row.biz, city: row.city, model: row.model }
      });
    }

    const slug = slugify(body.slug || body.biz || body.name || "demo");
    let row = mem.workspaces.find((w) => w.slug === slug);
    if (!row) {
      row = {
        slug,
        name: body.name || "Owner",
        biz: body.biz || slug,
        city: body.city || "",
        model: body.model || "Consignment & resale",
        email: body.email || "",
        pin: hashPin(body.pin || "4170"),
        createdAt: new Date().toISOString()
      };
      mem.workspaces.unshift(row);
      save();
      log("Auth", "Opened workspace · " + slug, "OK", slug);
    } else if (body.pin && row.pin !== hashPin(body.pin)) {
      return res.status(401).json({ ok: false, error: "Pin does not match this workspace" });
    }
    return res.status(201).json({
      ok: true,
      workspace: { slug: row.slug, name: row.name, biz: row.biz, city: row.city, model: row.model },
      hint: "Same slug + pin on a second phone opens this queue."
    });
  }

  return res.status(405).json({ error: "Use GET or POST" });
};

const {
  cors, mem, log, save, ready, readBody, slugify, workspaceOf, personOf, isOwner,
  publicDesk, applyDeskEdit, setDeskClosed, setDeskCode, exportDesk, wipeDesk,
  adminPinOk, canDesk, setDeskPerms, setSeatCan, logDesk, exploreDesk, deskEventsOf
} = require("./_lib");

function confirmName(row, text) {
  const raw = String(text || "").trim().toLowerCase();
  if (!raw) return false;
  const slug = String(row.slug || "").toLowerCase();
  const biz = String(row.biz || "").trim().toLowerCase();
  const name = String(row.name || "").trim().toLowerCase();
  return raw === slug || raw === biz || raw === name || raw === "delete " + slug;
}

function gate(req, slug) {
  const pin = (req.headers && req.headers["x-pin"]) || "";
  const { workspace: row, person } = personOf(
    { headers: { "x-workspace": slug, "x-pin": pin } },
    slug
  );
  return { row, person };
}

function deny(res, msg) {
  return res.status(403).json({ ok: false, error: msg || "Not allowed on this desk." });
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();

  if (req.method === "GET") {
    if (req.query && (req.query.all === "1" || req.query.all === "true")) {
      if (!adminPinOk(req)) {
        return res.status(403).json({
          ok: false,
          error: "Platform list needs the admin pin. Shop owners list the desks they can open."
        });
      }
      return res.status(200).json({
        ok: true,
        all: true,
        desks: (mem.workspaces || []).map((w) => publicDesk(w, (w.people || []).find((p) => p && p.role === "owner"))),
        events: deskEventsOf("", 40)
      });
    }
    const slug = workspaceOf(req);
    const { row, person } = gate(req, slug);
    if (!row) return res.status(404).json({ ok: false, error: "No desk with that name." });
    if (req.headers["x-pin"] && !person) {
      return res.status(401).json({ ok: false, error: "Desk code does not match." });
    }
    if (!person) return res.status(401).json({ ok: false, error: "Desk code required." });
    if (req.query && (req.query.explore === "1" || req.query.audit === "1")) {
      if (!canDesk(person, row, "explore")) return deny(res, "No explore on this seat.");
      return res.status(200).json({ ok: true, explore: exploreDesk(row, person) });
    }
    return res.status(200).json({ ok: true, desk: publicDesk(row, person) });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Use GET or POST." });
  }

  const body = await readBody(req);
  const action = String(body.action || "list").toLowerCase();

  if (action === "list") {
    const incoming = Array.isArray(body.desks) ? body.desks : [];
    if (incoming.length > 32) {
      return res.status(400).json({ ok: false, error: "Too many desks on one pass." });
    }
    const desks = [];
    incoming.forEach((item) => {
      const slug = slugify((item && (item.slug || item.biz || item.name)) || "");
      const pin = item && item.pin != null ? String(item.pin) : "";
      if (!slug || pin.length < 4) return;
      const { workspace: row, person } = personOf(
        { headers: { "x-workspace": slug, "x-pin": pin } },
        slug
      );
      if (!row || !person) {
        desks.push({ slug, ok: false, error: "Desk name or code does not match." });
        return;
      }
      desks.push(Object.assign({ ok: true }, publicDesk(row, person)));
    });
    return res.status(200).json({ ok: true, desks });
  }

  if (action === "gone" || action === "deleted") {
    const slug = slugify(body.slug || body.workspace || workspaceOf(req));
    const { row, person } = gate(req, slug);
    if (row && person && canDesk(person, row, "explore")) {
      return res.status(200).json({ ok: true, live: true, events: deskEventsOf(slug, 25) });
    }
    const events = deskEventsOf(slug, 25).filter((e) => e && e.action === "delete");
    if (!events.length) {
      return res.status(404).json({ ok: false, error: "No deletion log for that name on this store." });
    }
    return res.status(200).json({ ok: true, live: false, events });
  }

  const slug = slugify(body.slug || body.workspace || workspaceOf(req));
  const pin = String((req.headers && req.headers["x-pin"]) || body.pin || "");
  const { workspace: row, person } = personOf(
    { headers: { "x-workspace": slug, "x-pin": pin } },
    slug
  );
  if (!row) return res.status(404).json({ ok: false, error: "No desk with that name." });
  if (!person) return res.status(401).json({ ok: false, error: "Desk code does not match." });

  if (action === "explore" || action === "audit") {
    if (!canDesk(person, row, "explore")) return deny(res, "No explore on this seat.");
    return res.status(200).json({ ok: true, explore: exploreDesk(row, person) });
  }

  if (action === "update" || action === "edit") {
    if (!canDesk(person, row, "update")) return deny(res, "This seat cannot edit the shop.");
    const saved = applyDeskEdit(row, body);
    if (!saved.ok) return res.status(400).json(saved);
    logDesk("edit", row, person, { biz: row.biz, does: row.does });
    await save();
    return res.status(200).json({ ok: true, desk: publicDesk(row, person) });
  }

  if (action === "close") {
    if (!canDesk(person, row, "close")) return deny(res, "This seat cannot close the desk.");
    setDeskClosed(row, true);
    logDesk("close", row, person);
    await save();
    return res.status(200).json({ ok: true, desk: publicDesk(row, person) });
  }

  if (action === "open" || action === "reopen") {
    if (!canDesk(person, row, "open")) return deny(res, "This seat cannot reopen the desk.");
    setDeskClosed(row, false);
    logDesk("open", row, person);
    await save();
    return res.status(200).json({ ok: true, desk: publicDesk(row, person) });
  }

  if (action === "code") {
    if (!isOwner(person)) return deny(res, "Only the owner can change the owner desk code.");
    const next = body.nextPin || body.newPin || body.code;
    const saved = setDeskCode(row, next);
    if (!saved.ok) return res.status(400).json(saved);
    logDesk("code", row, person);
    await save();
    return res.status(200).json({
      ok: true,
      desk: publicDesk(row, person),
      hint: "New owner desk code is on. Helpers keep their own codes. Update this phone."
    });
  }

  if (action === "export") {
    if (!canDesk(person, row, "export") && !canDesk(person, row, "explore")) {
      return deny(res, "This seat cannot export the desk.");
    }
    logDesk("export", row, person);
    await save();
    return res.status(200).json({ ok: true, pack: exportDesk(row) });
  }

  if (action === "perms") {
    if (!isOwner(person)) return deny(res, "Only the owner sets helper permissions.");
    const saved = setDeskPerms(row, body.perms || body);
    if (!saved.ok) return res.status(400).json(saved);
    logDesk("perms", row, person, saved.perms);
    await save();
    return res.status(200).json({ ok: true, desk: publicDesk(row, person), perms: saved.perms });
  }

  if (action === "seat") {
    if (!isOwner(person)) return deny(res, "Only the owner edits a helper seat.");
    const saved = setSeatCan(row, body.id || body.personId, body);
    if (!saved.ok) return res.status(400).json(saved);
    logDesk("seat", row, person, { id: body.id, can: saved.person && saved.person.can });
    await save();
    return res.status(200).json({ ok: true, person: saved.person, desk: publicDesk(row, person) });
  }

  if (action === "delete") {
    if (!isOwner(person)) return deny(res, "Only the owner can delete this desk.");
    if (!confirmName(row, body.confirm || body.say)) {
      return res.status(409).json({
        ok: false,
        error: "Type the shop name to delete this desk. Cards on it go with it. The deletion log stays.",
        need: row.biz || row.slug
      });
    }
    const wiped = wipeDesk(row.slug, person);
    await save();
    return res.status(200).json({
      ok: true,
      deleted: wiped.slug,
      name: wiped.name,
      event: wiped.event
    });
  }

  return res.status(400).json({
    ok: false,
    error: "Unknown desk action.",
    actions: ["list", "explore", "update", "close", "open", "code", "export", "perms", "seat", "delete"]
  });
};

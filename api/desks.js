const {
  cors, mem, save, ready, readBody, slugify, workspaceOf, personOf, isOwner
} = require("./_lib");
const {
  publicDesk, applyDeskEdit, setDeskClosed, setDeskCode, exportDesk, wipeDesk,
  adminPinOk, canDesk, setDeskPerms, setSeatCan, logDesk, exploreDesk, deskEventsOf
} = require("./_desk");
const { historyOf, isPriorityJob, capCard, needsOf } = require("./_history");

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
    const slug = workspaceOf(req);
    const { row, person } = gate(req, slug);
    if (!row) return res.status(404).json({ ok: false, error: "No desk with that name." });
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
    const desks = [];
    incoming.slice(0, 32).forEach((item) => {
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

  if (action === "history" || action === "timeline") {
    const incoming = Array.isArray(body.desks) ? body.desks : [];
    const one = slugify(body.slug || body.workspace || "");
    const asked = incoming.length ? incoming : (one ? [{ slug: one, pin: body.pin || (req.headers && req.headers["x-pin"]) }] : []);
    const want = String(body.lane || body.filter || "all").toLowerCase();
    const items = [];
    const desks = [];
    asked.slice(0, 32).forEach((item) => {
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
      const jobs = (mem.jobs || []).filter((j) => j && j.workspace === slug);
      historyOf(row, jobs, deskEventsOf(slug, 20)).items.forEach((it) => items.push(it));
    });
    items.sort((a, b) => String(b.t || "").localeCompare(String(a.t || "")));
    const shown = want && want !== "all" ? items.filter((it) => it.lane === want) : items;
    const counts = { need: 0, doing: 0, wait: 0, ext: 0, done: 0, stopped: 0, all: items.length };
    items.forEach((it) => { if (counts[it.lane] != null) counts[it.lane] += 1; });
    return res.status(200).json({ ok: true, format: "aia.desk.v1", desks, counts, items: shown.slice(0, 80) });
  }

  if (action === "priority" || action === "cap") {
    const incoming = Array.isArray(body.desks) ? body.desks : [];
    const one = slugify(body.slug || body.workspace || "");
    const asked = incoming.length ? incoming : (one ? [{ slug: one, pin: body.pin || (req.headers && req.headers["x-pin"]) }] : []);
    const desks = [];
    const items = [];
    asked.slice(0, 32).forEach((item) => {
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
      (mem.jobs || []).filter((j) => j && j.workspace === slug && isPriorityJob(j)).forEach((j) => {
        const card = capCard(j, row);
        if (card) {
          card.needsFull = needsOf(j, { staff: person.role === "employee" });
          items.push(card);
        }
      });
    });
    items.sort((a, b) => String(b.t || "").localeCompare(String(a.t || "")));
    return res.status(200).json({ ok: true, format: "aia.desk.v1", cap: true, desks, count: items.length, items: items.slice(0, 12) });
  }

  const slug = slugify(body.slug || body.workspace || workspaceOf(req));
  const pin = String((req.headers && req.headers["x-pin"]) || body.pin || "");
  const { workspace: row, person } = personOf(
    { headers: { "x-workspace": slug, "x-pin": pin } },
    slug
  );
  if (!row) return res.status(404).json({ ok: false, error: "No desk with that name." });
  if (!person) return res.status(401).json({ ok: false, error: "Desk code does not match." });

  if (action === "explore" || action === "audit" || action === "gone" || action === "deleted") {
    if (action === "gone" || action === "deleted") {
      let events = deskEventsOf(slug, 25).filter((e) => e && e.action === "delete");
      if (!events.length) {
        events = (mem.audit || []).filter((a) => a && a.workspace === slug && /delete/i.test(String(a.action || ""))).slice(0, 25)
          .map((a) => ({ t: a.t, action: "delete", slug: a.workspace, name: slug, by: a.agent, extra: { note: a.action } }));
      }
      if (!events.length) return res.status(404).json({ ok: false, error: "No deletion log for that name on this store." });
      return res.status(200).json({ ok: true, live: !!row, events });
    }
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

  if (action === "close" || action === "open" || action === "reopen") {
    if (!canDesk(person, row, action === "close" ? "close" : "open")) return deny(res, "This seat cannot close the desk.");
    setDeskClosed(row, action === "close");
    logDesk(action === "close" ? "close" : "open", row, person);
    await save();
    return res.status(200).json({ ok: true, desk: publicDesk(row, person) });
  }

  if (action === "code") {
    if (!isOwner(person)) return deny(res, "Only the owner can change the owner desk code.");
    const saved = setDeskCode(row, body.nextPin || body.newPin || body.code);
    if (!saved.ok) return res.status(400).json(saved);
    logDesk("code", row, person);
    await save();
    return res.status(200).json({ ok: true, desk: publicDesk(row, person) });
  }

  if (action === "export") {
    if (!canDesk(person, row, "export") && !canDesk(person, row, "explore")) return deny(res, "This seat cannot export the desk.");
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
      return res.status(409).json({ ok: false, error: "Type the shop name to delete this desk. Cards on it go with it. The deletion log stays.", need: row.biz || row.slug });
    }
    const wiped = wipeDesk(row.slug, person);
    await save();
    return res.status(200).json({ ok: true, deleted: wiped.slug, name: wiped.name, event: wiped.event });
  }

  return res.status(400).json({ ok: false, error: "Unknown desk action.", actions: ["list", "history", "priority", "explore", "update", "close", "open", "code", "export", "perms", "seat", "delete"] });
};

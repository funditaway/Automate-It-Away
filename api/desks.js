const lib = require("./_lib");
const {
  cors, mem, save, ready, readBody, slugify, workspaceOf, personOf, isOwner
} = lib;
const {
  publicDesk, applyDeskEdit, setDeskClosed, setDeskCode, exportDesk, wipeDesk,
  adminPinOk, canDesk, setDeskPerms, setSeatCan, logDesk, exploreDesk, deskEventsOf,
  leaveSeat, confirmDeskName, heldCollectAsk
} = require("./_desk");
const { historyOf, filterHistory, facetsOf, isPriorityJob, capCard, needsOf } = require("./_history");
const packHandler = require("./_packs");

function deskClosed(ws) {
  return !!(ws && (ws.closed === true || ws.accepts === false));
}
function deskListed(ws) {
  if (!ws || deskClosed(ws)) return false;
  if (ws.listed === true) return true;
  return String(ws.visibility || "").toLowerCase() === "public";
}
function listedCard(row) {
  if (!row || !deskListed(row)) return null;
  return { slug: row.slug, name: row.biz || row.name || row.slug, city: row.city || "", does: row.does || "", listed: true, drop: "/drop?ws=" + encodeURIComponent(row.slug) };
}
function searchListedDesks(query) {
  const q = String(query || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
  const rows = (mem.workspaces || []).map(listedCard).filter(Boolean);
  if (!q) return rows.slice(0, 20);
  return rows.filter((d) => [d.name, d.slug, d.city, d.does].join(" ").toLowerCase().indexOf(q) >= 0).slice(0, 20);
}
function setDeskListed(ws, on) {
  if (!ws) return { ok: false, error: "No desk." };
  ws.listed = !!on;
  ws.visibility = ws.listed ? "public" : "private";
  return { ok: true, listed: deskListed(ws) };
}
function confirmName(row, text) {
  return confirmDeskName(row, text);
}
function authReq(req, slug, pin) {
  const headers = Object.assign({}, (req && req.headers) || {});
  headers["x-workspace"] = slug;
  if (pin != null) headers["x-pin"] = pin;
  return { headers, query: (req && req.query) || {} };
}
function gate(req, slug) {
  const pin = (req.headers && req.headers["x-pin"]) || "";
  const { workspace: row, person, pending } = personOf(authReq(req, slug, pin), slug);
  return { row, person, pending };
}
function deny(res, msg) { return res.status(403).json({ ok: false, error: msg || "Not allowed on this desk." }); }
function sessionOk(req) {
  return !!(typeof lib.sessionTokenOf === "function" && lib.sessionTokenOf(req));
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();
  if (req.query && String(req.query.packs) === "1") return packHandler(req, res);

  if (req.method === "GET") {
    const q = req.query || {};
    if (q.q != null || q.search != null || q.listed === "1" || q.public === "1") {
      const term = q.q != null ? q.q : q.search;
      return res.status(200).json({ ok: true, listed: true, q: String(term || "").slice(0, 80), desks: searchListedDesks(term) });
    }
    const slug = workspaceOf(req);
    const { row, person, pending } = gate(req, slug);
    if (!row) return res.status(404).json({ ok: false, error: "No desk with that name." });
    if (pending) return res.status(403).json({ ok: false, pending: true, error: "That seat is waiting on the owner." });
    if (!person) return res.status(401).json({ ok: false, error: "Desk code required." });
    if (req.query && (req.query.explore === "1" || req.query.audit === "1")) {
      if (!canDesk(person, row, "explore")) return deny(res, "No explore on this seat.");
      return res.status(200).json({ ok: true, explore: exploreDesk(row, person) });
    }
    return res.status(200).json({ ok: true, desk: publicDesk(row, person) });
  }

  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use GET or POST." });
  const body = await readBody(req);
  const action = String(body.action || "list").toLowerCase();

  if (["packs", "pack-search", "marketplace", "list-pack", "publish-pack", "unlist-pack", "use-pack", "install-pack", "preview-pack"].indexOf(action) >= 0) {
    req.body = body;
    return packHandler(req, res);
  }

  if (action === "search" || action === "find") {
    return res.status(200).json({ ok: true, listed: true, q: String(body.q || body.query || body.name || "").slice(0, 80), desks: searchListedDesks(body.q || body.query || body.name) });
  }

  if (action === "list") {
    const incoming = Array.isArray(body.desks) ? body.desks : [];
    const desks = [];
    incoming.slice(0, 32).forEach((item) => {
      const slug = slugify((item && (item.slug || item.biz || item.name)) || "");
      const pin = item && item.pin != null ? String(item.pin) : "";
      if (!slug || (!pin && !sessionOk(req)) || (pin && pin.length < 4)) return;
      const { workspace: row, person } = personOf(authReq(req, slug, pin), slug);
      if (!row || !person) { desks.push({ slug, ok: false, error: "Desk name or code does not match." }); return; }
      desks.push(Object.assign({ ok: true }, publicDesk(row, person)));
    });
    return res.status(200).json({ ok: true, desks });
  }

  if (action === "history" || action === "timeline") {
    const incoming = Array.isArray(body.desks) ? body.desks : [];
    const one = slugify(body.slug || body.workspace || "");
    const asked = incoming.length ? incoming : (one ? [{ slug: one, pin: body.pin || (req.headers && req.headers["x-pin"]) }] : []);
    const advanced = body.advanced === true || body.advanced === "1" || body.audit === true || body.audit === "1";
    const items = [];
    const desks = [];
    asked.slice(0, 32).forEach((item) => {
      const slug = slugify((item && (item.slug || item.biz || item.name)) || "");
      const pin = item && item.pin != null ? String(item.pin) : "";
      if (!slug || (!pin && !sessionOk(req)) || (pin && pin.length < 4)) return;
      const { workspace: row, person } = personOf(authReq(req, slug, pin), slug);
      if (!row || !person) { desks.push({ slug, ok: false, error: "Desk name or code does not match." }); return; }
      desks.push(Object.assign({ ok: true }, publicDesk(row, person)));
      const jobs = (mem.jobs || []).filter((j) => j && j.workspace === slug);
      const audit = advanced ? (mem.audit || []).filter((a) => a && (!a.workspace || a.workspace === slug)).slice(0, 40) : [];
      historyOf(row, jobs, deskEventsOf(slug, advanced ? 40 : 20), { audit }).items.forEach((it) => items.push(it));
    });
    items.sort((a, b) => String(b.t || "").localeCompare(String(a.t || "")));
    const shown = filterHistory(items, body);
    const counts = { need: 0, doing: 0, wait: 0, ext: 0, done: 0, stopped: 0, past: 0, now: 0, next: 0, all: items.length };
    items.forEach((it) => { if (counts[it.lane] != null) counts[it.lane] += 1; if (it.when && counts[it.when] != null) counts[it.when] += 1; });
    return res.status(200).json({ ok: true, format: "aia.desk.v1", advanced: !!advanced, desks, counts, facets: facetsOf(items), items: shown.slice(0, advanced ? 120 : 80) });
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
      if (!slug || (!pin && !sessionOk(req)) || (pin && pin.length < 4)) return;
      const { workspace: row, person } = personOf(authReq(req, slug, pin), slug);
      if (!row || !person) { desks.push({ slug, ok: false, error: "Desk name or code does not match." }); return; }
      desks.push(Object.assign({ ok: true }, publicDesk(row, person)));
      (mem.jobs || []).filter((j) => j && j.workspace === slug && isPriorityJob(j)).forEach((j) => {
        const card = capCard(j, row);
        if (card) { card.needsFull = needsOf(j, { staff: person.role === "employee" }); items.push(card); }
      });
    });
    items.sort((a, b) => String(b.t || "").localeCompare(String(a.t || "")));
    return res.status(200).json({ ok: true, format: "aia.desk.v1", cap: true, desks, count: items.length, items: items.slice(0, 12) });
  }

  const slug = slugify(body.slug || body.workspace || workspaceOf(req));
  const pin = String((req.headers && req.headers["x-pin"]) || body.pin || "");
  const { workspace: row, person, pending } = personOf(authReq(req, slug, pin), slug);
  if (!row) return res.status(404).json({ ok: false, error: "No desk with that name." });
  if (pending) return res.status(403).json({ ok: false, pending: true, error: "That seat is waiting on the owner." });
  if (!person) return res.status(401).json({ ok: false, error: "Desk code does not match." });

  if (action === "listed" || action === "visibility") {
    if (!isOwner(person)) return deny(res, "Only the owner can list this desk in public search.");
    const on = body.listed != null ? !!body.listed : String(body.visibility || "").toLowerCase() === "public";
    setDeskListed(row, on);
    logDesk(on ? "listed" : "unlisted", row, person);
    await save();
    return res.status(200).json({ ok: true, listed: deskListed(row), visibility: deskListed(row) ? "public" : "private", desk: publicDesk(row, person) });
  }
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
    if (body.listed != null || body.visibility != null) {
      if (!isOwner(person)) return deny(res, "Only the owner can list this desk in public search.");
      setDeskListed(row, body.listed != null ? !!body.listed : String(body.visibility).toLowerCase() === "public");
    }
    const saved = applyDeskEdit(row, body);
    if (!saved.ok) return res.status(400).json(saved);
    logDesk("edit", row, person, { biz: row.biz, does: row.does, listed: deskListed(row) });
    await save();
    return res.status(200).json({ ok: true, desk: publicDesk(row, person), listed: deskListed(row) });
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
  if (action === "leave" || action === "detach") {
    const acc = (mem.accounts || []).find((a) => a && (
      (person.accountId && a.id === person.accountId) ||
      (a.desks || []).indexOf(row.slug) >= 0 ||
      (a.memberDesks || []).indexOf(row.slug) >= 0
    )) || null;
    const left = leaveSeat(row, person, acc);
    if (!left.ok) return res.status(left.status || 400).json({ ok: false, error: left.error });
    await save();
    return res.status(200).json({
      ok: true,
      left: left.left,
      hint: "You are off this desk. Cards stay for the owner.",
      event: left.event
    });
  }
  if (action === "delete") {
    if (!isOwner(person)) return deny(res, "Only the owner can delete this desk.");
    if (!confirmName(row, body.confirm || body.say)) {
      return res.status(409).json({ ok: false, error: "Type the shop name to delete this desk. Cards on it go with it. The deletion log stays.", need: row.biz || row.slug });
    }
    const asks = heldCollectAsk(row.slug, 250);
    if (asks.length) {
      return res.status(409).json({
        ok: false,
        ask: true,
        error: "This desk has a held collect card of $250 or more. Ask before you wipe it. Kill stays on the card.",
        held: asks.length
      });
    }
    const wiped = wipeDesk(row.slug, person);
    await save();
    return res.status(200).json({ ok: true, deleted: wiped.slug, name: wiped.name, event: wiped.event, charged: false });
  }
  return res.status(400).json({ ok: false, error: "Unknown desk action.", actions: ["list", "search", "packs", "list-pack", "unlist-pack", "use-pack", "preview-pack", "listed", "history", "priority", "explore", "update", "close", "open", "code", "export", "perms", "seat", "leave", "detach", "delete"] });
};

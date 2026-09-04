const lib = require("./_lib");
const {
  cors, mem, save, ready, readBody, slugify, workspaceOf, personOf, isOwner
} = lib;
const {
  publicDesk, applyDeskEdit, setDeskClosed, setDeskCode, exportDesk, wipeDesk,
  adminPinOk, canDesk, setDeskPerms, setSeatCan, logDesk, exploreDesk, deskEventsOf
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
  return { slug: row.slug, name: row.biz || row.name || row.slug, city: row.city || "", does: row.does || "", listed: true, aia: require("./_aia-net").of(row.aia || row.slug, row.slug).name, drop: "/drop?ws=" + encodeURIComponent(row.slug) };
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
  const raw = String(text || "").trim().toLowerCase();
  if (!raw) return false;
  return raw === String(row.slug || "").toLowerCase() || raw === String(row.biz || "").trim().toLowerCase() || raw === String(row.name || "").trim().toLowerCase() || raw === "delete " + String(row.slug || "").toLowerCase();
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

  if (["packs", "pack-search", "marketplace", "list-pack", "publish-pack", "submit-pack", "test-pack", "unlist-pack", "use-pack", "install-pack", "buy-pack", "preview-pack", "studio-draft", "grok-pack", "private-pack", "save-ai", "attach-ai", "remove-ai", "download-pack", "export-pack", "install-aia", "import-pack", "install-file"].indexOf(action) >= 0) {
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
      if (!slug || (!pin && !lib.sessionTokenOf(req)) || (pin && pin.length < 4)) return;
      const { workspace: row, person } = personOf(authReq(req, slug, pin), slug);
      if (!row || !person) { desks.push({ slug, ok: false, error: "Desk name or code does not match." }); return; }
      desks.push(Object.assign({ ok: true }, publicDesk(row, person)));
    });
    return res.status(200).json({ ok: true, desks });
  }

  if (action === "mine") {
    const slug = slugify(body.slug || body.workspace || workspaceOf(req));
    const pin = String((req.headers && req.headers["x-pin"]) || body.pin || "");
    const { workspace: row, person, pending } = personOf(authReq(req, slug, pin), slug);
    if (pending) return res.status(403).json({ ok: false, pending: true, error: "That seat is waiting on the owner." });
    if (!row || !person) return res.status(401).json({ ok: false, error: "Desk code does not match." });
    const { homeAccount, desksForPerson } = require("./_account");
    const acc = homeAccount(person, row);
    const mine = desksForPerson({ id: person.id, name: person.name, email: person.email, pin: person.pin, accountId: person.accountId || (acc && acc.id) });
    const mail = require("./_aia-mail");
    const aia = (acc && (acc.aia || (acc.handle ? acc.handle + ".aia" : ""))) || (row.aia || "");
    return res.status(200).json({
      ok: true,
      you: person,
      account: acc ? { id: acc.id, name: acc.name, handle: acc.handle || "", aia: aia, internet: "AIA Internet" } : null,
      handle: acc && acc.handle || "",
      at: aia,
      aia: aia,
      owned: mine.owned,
      member: mine.member,
      desks: (mine.owned || []).concat(mine.member || []),
      kinds: ["family", "friend", "helper", "member", "staff"],
      mail: acc ? mail.listForAccount(acc) : mail.listForDesk(row.slug),
      mx: mail.statusOf(),
      note: mail.HOLD_NOTE
    });
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
      if (!slug || (!pin && !lib.sessionTokenOf(req)) || (pin && pin.length < 4)) return;
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
      if (!slug || (!pin && !lib.sessionTokenOf(req)) || (pin && pin.length < 4)) return;
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

  if (action === "mail" || action === "aia-mail" || action === "mail-identity" || action === "mail-list") {
    const mail = require("./_aia-mail");
    if (mail.wantsSend(body)) return res.status(409).json(mail.sendHold());
    const { homeAccount } = require("./_account");
    const acc = homeAccount(person, row);
    return res.status(200).json({
      ok: true,
      mail: acc ? mail.listForAccount(acc) : mail.listForDesk(row.slug),
      deskMail: mail.listForDesk(row.slug),
      mx: mail.statusOf(),
      note: mail.HOLD_NOTE,
      desk: publicDesk(row, person)
    });
  }
  if (action === "mail-add" || action === "add-mail" || action === "save-mail" || action === "create-mail") {
    if (!isOwner(person)) return deny(res, "Only the owner can create a .aia email.");
    const mail = require("./_aia-mail");
    if (mail.wantsSend(body)) return res.status(409).json(mail.sendHold());
    const { homeAccount } = require("./_account");
    const acc = homeAccount(person, row);
    const made = mail.createIdentity(acc, row, body);
    if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error, mx: mail.statusOf() });
    logDesk("aia-mail", row, person, { address: made.identity && made.identity.address });
    await save();
    return res.status(200).json({
      ok: true,
      identity: made.identity,
      mail: made.mail,
      mx: mail.statusOf(),
      desk: publicDesk(row, person),
      hint: (made.identity && made.identity.address) + " is bound to this desk. Identities work on the desk now. Internet mail when the MX pipe is connected."
    });
  }
  if (action === "mail-remove" || action === "remove-mail") {
    if (!isOwner(person)) return deny(res, "Only the owner can remove a .aia email.");
    const mail = require("./_aia-mail");
    const { homeAccount } = require("./_account");
    const acc = homeAccount(person, row);
    const gone = mail.removeIdentity(acc, body.id || body.address || body.email || body.mail);
    if (!gone.ok) return res.status(gone.status || 400).json({ ok: false, error: gone.error });
    logDesk("aia-mail-remove", row, person, { address: gone.removed });
    await save();
    return res.status(200).json({
      ok: true,
      removed: gone.removed,
      mail: gone.mail,
      mx: mail.statusOf(),
      desk: publicDesk(row, person)
    });
  }
  if (action === "mail-send" || action === "send-mail") {
    return res.status(409).json(require("./_aia-mail").sendHold());
  }

  if (action === "listed" || action === "visibility") {
    if (!isOwner(person)) return deny(res, "Only the owner can list this desk in public search.");
    const on = body.listed != null ? !!body.listed : String(body.visibility || "").toLowerCase() === "public";
    setDeskListed(row, on);
    logDesk(on ? "listed" : "unlisted", row, person);
    await save();
    return res.status(200).json({ ok: true, listed: deskListed(row), visibility: deskListed(row) ? "public" : "private", desk: publicDesk(row, person) });
  }
  if (action === "handle" || action === "aia" || action === "aia-name") {
    if (!isOwner(person)) return deny(res, "Only the owner can set the .aia name.");
    const net = require("./_aia-net");
    const named = net.parseName(body.aia || body.aiaName || body.handle || body.at || body.host, row.slug);
    if (!named.ok) return res.status(400).json({ ok: false, error: named.error });
    const saved = applyDeskEdit(row, { aia: named.name });
    if (!saved.ok) return res.status(400).json(saved);
    const { accountForDesk } = require("./_account");
    const aiaAdmin = require("./_aia-admin");
    const acc = accountForDesk(row);
    let handle = named.label;
    if (acc) {
      const set = aiaAdmin.setAccountHandle(acc, named.name, { allowReserved: aiaAdmin.isPlatformAccount(acc) || aiaAdmin.isReviewerDesk(row) });
      if (!set.ok) return res.status(set.status || 409).json({ ok: false, error: set.error });
      handle = set.handle;
    }
    logDesk("aia", row, person, { aia: named.name });
    await save();
    return res.status(200).json({
      ok: true,
      aia: named.name,
      file: named.file,
      handle: handle,
      at: named.name,
      internet: net.INTERNET,
      chain: false,
      owned: false,
      net: net.publicNet(named),
      desk: publicDesk(row, person),
      note: net.statusOf().note
    });
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
  if (action === "delete") {
    if (!isOwner(person)) return deny(res, "Only the owner can delete this desk.");
    if (!confirmName(row, body.confirm || body.say)) {
      return res.status(409).json({ ok: false, error: "Type the shop name to delete this desk. Cards on it go with it. The deletion log stays.", need: row.biz || row.slug });
    }
    const wiped = wipeDesk(row.slug, person);
    await save();
    return res.status(200).json({ ok: true, deleted: wiped.slug, name: wiped.name, event: wiped.event });
  }
  return res.status(400).json({ ok: false, error: "Unknown desk action.", actions: ["list", "search", "mine", "packs", "list-pack", "submit-pack", "test-pack", "unlist-pack", "use-pack", "install-pack", "preview-pack", "studio-draft", "listed", "history", "priority", "explore", "update", "close", "open", "code", "export", "perms", "seat", "delete", "mail", "mail-add", "mail-remove"] });
};

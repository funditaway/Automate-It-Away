const lib = require("./_lib");
const { homeAccount, desksForPerson } = require("./_account");
const packApi = require("./_packs");

function cleanId(raw) {
  return String(raw || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function authReq(req, slug, pin) {
  const headers = Object.assign({}, (req && req.headers) || {});
  if (slug) headers["x-workspace"] = slug;
  if (pin) headers["x-pin"] = pin;
  return { headers: headers, query: (req && req.query) || {} };
}

function knownName(id, fallback) {
  const named = String(fallback || "").trim().slice(0, 80);
  if (named) return named;
  const row = packApi.findPack(id, { mine: false });
  return String((row && row.name) || id || "").trim().slice(0, 80);
}

function remember(map, id, name) {
  const key = cleanId(id);
  if (!key) return;
  if (!map[key]) map[key] = { id: key, name: "" };
  const next = String(name || "").trim().slice(0, 80);
  if (next && !map[key].name) map[key].name = next;
}

function ownedRows(person, hintRow) {
  const acc = homeAccount(person, hintRow);
  const mine = desksForPerson({
    id: person && person.id,
    name: person && person.name,
    email: person && person.email,
    pin: person && person.pin,
    accountId: (person && person.accountId) || (acc && acc.id)
  });
  const cards = (mine.owned || []).filter(function (d) {
    return d && d.slug && d.status !== "pending" && d.status !== "denied";
  });
  const slugs = {};
  cards.forEach(function (d) { slugs[d.slug] = true; });
  const rows = (lib.mem.workspaces || []).filter(function (w) { return w && slugs[w.slug]; });
  return { acc: acc, cards: cards, rows: rows };
}

function packMap(acc, rows) {
  const map = {};
  if (acc && Array.isArray(acc.ownedPacks)) {
    acc.ownedPacks.forEach(function (p) {
      if (!p) return;
      if (typeof p === "string") remember(map, p, "");
      else remember(map, p.id || p.pack, p.name);
    });
  }
  (rows || []).forEach(function (w) {
    if (w.pack) remember(map, w.pack, w.packName);
    (Array.isArray(w.packsOn) ? w.packsOn : []).forEach(function (id) { remember(map, id, ""); });
  });
  const slugSet = {};
  (rows || []).forEach(function (w) { slugSet[w.slug] = true; });
  (lib.mem.packs || []).forEach(function (p) {
    if (!p || !p.id || !slugSet[p.workspace]) return;
    remember(map, p.id, p.name);
  });
  return Object.keys(map).sort().map(function (key) {
    const row = map[key];
    return { id: row.id, name: knownName(row.id, row.name) || row.id };
  });
}

function deskOn(row, id) {
  const key = cleanId(id);
  if (!row || !key) return false;
  if (cleanId(row.pack) === key) return true;
  return (Array.isArray(row.packsOn) ? row.packsOn : []).some(function (item) { return cleanId(item) === key; });
}

function switchedOn(row, id) {
  const key = cleanId(id);
  if (!row || !key) return false;
  return (Array.isArray(row.packsOn) ? row.packsOn : []).some(function (item) { return cleanId(item) === key; });
}

function publicList(scope) {
  const packs = packMap(scope.acc, scope.rows);
  const bySlug = {};
  scope.rows.forEach(function (w) { bySlug[w.slug] = w; });
  return {
    ok: true,
    packs: packs.map(function (p) {
      return {
        id: p.id,
        name: p.name,
        desks: scope.cards.map(function (d) {
          const row = bySlug[d.slug];
          return { slug: d.slug, name: d.name || d.slug, on: deskOn(row, p.id), switched: switchedOn(row, p.id) };
        })
      };
    }),
    desks: scope.cards.map(function (d) { return { slug: d.slug, name: d.name || d.slug }; })
  };
}

function noteAccount(acc, id, name) {
  if (!acc) return;
  if (!Array.isArray(acc.ownedPacks)) acc.ownedPacks = [];
  const key = cleanId(id);
  const hit = acc.ownedPacks.some(function (p) {
    return cleanId(typeof p === "string" ? p : (p && (p.id || p.pack))) === key;
  });
  if (!hit) acc.ownedPacks.push({ id: key, name: String(name || key).slice(0, 80) });
  acc.ownedPacks = acc.ownedPacks.slice(0, 40);
}

function targetRow(scope, slug) {
  return (scope.rows || []).find(function (w) { return w && w.slug === slug; }) || null;
}

async function handler(req, res, body) {
  body = body || {};
  const action = String(body.action || "").toLowerCase();
  const pin = String((req.headers && req.headers["x-pin"]) || body.pin || "");
  const here = lib.slugify(body.workspace || lib.workspaceOf(req) || "");
  const found = lib.personOf(authReq(req, here, pin), here);
  if (found.pending) return res.status(403).json({ ok: false, error: "That seat is waiting on the owner." });
  if (!found.person) return res.status(401).json({ ok: false, error: "Open a desk you own." });
  const scope = ownedRows(found.person, found.workspace);

  if (action === "owned-packs") {
    const listed = publicList(scope);
    listed.empty = listed.packs.length === 0;
    return res.status(200).json(listed);
  }

  const slug = lib.slugify(body.slug || body.desk || "");
  const packId = cleanId(body.pack || body.id || "");
  const row = targetRow(scope, slug);
  if (!slug || !row) return res.status(403).json({ ok: false, error: "You do not own that desk." });
  const gate = lib.personOf(authReq(req, slug, pin), slug);
  if (!gate.person || !lib.isOwner(gate.person)) return res.status(403).json({ ok: false, error: "You do not own that desk." });

  const known = packMap(scope.acc, scope.rows);
  const pack = known.find(function (p) { return p.id === packId; }) || null;

  if (action === "pack-on") {
    const yes = body.yes === true || body.yes === "Yes" || body.tap === "Yes";
    if (!yes) return res.status(400).json({ ok: false, error: "Tap Yes." });
    if (!pack) return res.status(404).json({ ok: false, error: "That pack is not on this account." });
    if (!Array.isArray(row.packsOn)) row.packsOn = [];
    const face = cleanId(row.pack) === pack.id;
    const already = face || row.packsOn.some(function (item) { return cleanId(item) === pack.id; });
    if (!face && !already) row.packsOn.push(pack.id);
    row.packsOn = row.packsOn.filter(function (item, i, arr) {
      const key = cleanId(item);
      return key && arr.findIndex(function (other) { return cleanId(other) === key; }) === i;
    }).slice(0, 24);
    noteAccount(scope.acc, pack.id, pack.name);
    await lib.save();
    return res.status(200).json({
      ok: true,
      pack: { id: pack.id, name: pack.name },
      desk: row.slug,
      on: true,
      already: already || cleanId(row.pack) === pack.id,
      note: "On for this desk. Still on the account."
    });
  }

  if (action === "pack-off") {
    const stop = body.stop === true || body.tap === "Stop";
    if (!stop) return res.status(400).json({ ok: false, error: "Tap Stop." });
    if (!pack) return res.status(404).json({ ok: false, error: "That pack is not on this account." });
    const before = Array.isArray(row.packsOn) ? row.packsOn.slice() : [];
    row.packsOn = before.filter(function (item) { return cleanId(item) !== pack.id; });
    const changed = row.packsOn.length !== before.length;
    if (changed) await lib.save();
    const still = cleanId(row.pack) === pack.id;
    return res.status(200).json({
      ok: true,
      pack: { id: pack.id, name: pack.name },
      desk: row.slug,
      on: still || row.packsOn.some(function (item) { return cleanId(item) === pack.id; }),
      note: still ? "Still on this desk." : (changed ? "Off for this desk. Still on the account." : "Already off.")
    });
  }

  return res.status(400).json({ ok: false, error: "Unknown pack action." });
}

module.exports = handler;

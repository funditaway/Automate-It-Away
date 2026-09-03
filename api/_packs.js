const { cors, mem, save, readBody, personOf, isOwner, ensureRules } = require("./_lib");

const OFFICIAL = [
  { id: "home", name: "Home & family", type: "work", family: "Automate It Away", aisle: "Home", official: true, price: 0, use: "ok", does: "Reminders, chores, school, same-day.", features: ["reminder", "calendar", "same-day cap"], kinds: ["chore", "school", "pickup", "repair"] },
  { id: "consign", name: "Consignment & resale", type: "work", family: "Consign It Away", aisle: "Consign", official: true, price: 0, use: "ok", does: "Photo in. Listing draft. Payout waits.", features: ["listing draft", "title hold", "payout wait"], kinds: ["list", "title", "payout"] },
  { id: "quote", name: "Insurance", type: "work", family: "Quote It Away", aisle: "Insurance", official: true, price: 0, use: "ok", does: "Fact-find and packet draft. Bind stays off.", features: ["packet draft", "bind off desk", "year-2 review"], kinds: ["lead", "quote", "call", "review"], face: "Insurance", packId: "vita" },
  { id: "fund", name: "Fund raise", type: "work", family: "Fund It Away", aisle: "Fund", official: true, price: 0, use: "ok", does: "Campaign draft. Credit waits on the owner.", features: ["campaign draft", "credit wait"], kinds: ["raise", "credit"] },
  { id: "land", name: "Land lot", type: "work", family: "Land", aisle: "Land", official: true, price: 0, use: "ok", does: "Lot note. Flood and title wait.", features: ["lot note", "flood wait", "title wait"], kinds: ["lot", "flood", "survey", "title"] },
  { id: "aia", name: "AIA Help", type: "work", family: "Automate It Away", aisle: "AIA", official: true, price: 0, use: "ok", does: "World problem in. Card on the AIA Admin Desk. You tap.", features: ["talk drop", "ticket card", "draft reply"], kinds: ["broke", "login", "desk", "account", "pack", "pipe", "idea"], face: "AIA Help" }
];

const COLORS = [
  { id: "color-teal", name: "Teal", type: "cosmetic", family: "AIA", aisle: "Color", official: true, price: 0, use: "try", does: "Color on this phone." },
  { id: "color-harvest", name: "Harvest", type: "cosmetic", family: "AIA", aisle: "Color", official: true, price: 0, use: "try", does: "Color on this phone." },
  { id: "color-night", name: "Night", type: "cosmetic", family: "AIA", aisle: "Color", official: true, price: 0, use: "try", does: "Color on this phone." },
  { id: "color-slate", name: "Slate", type: "cosmetic", family: "AIA", aisle: "Color", official: true, price: 0, use: "try", does: "Color on this phone." }
];

function wantedRows() {
  try {
    const file = require("../packs/wanted.json");
    return (file.packs || []).map(function (p) {
      return {
        id: p.id,
        name: p.name,
        type: "wanted",
        family: p.family || "Wanted",
        aisle: p.aisle || "Wanted",
        official: false,
        wanted: true,
        price: 0,
        use: "make",
        does: p.does,
        face: p.face || p.name,
        kinds: p.kinds || [],
        features: ["Make this pack"],
        href: "/create?kind=pack&idea=" + p.id
      };
    });
  } catch (e) {
    return [];
  }
}

function allPacks() {
  return OFFICIAL.concat(wantedRows(), COLORS);
}

function publicPack(p) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    family: p.family,
    aisle: p.aisle,
    official: !!p.official,
    wanted: !!p.wanted,
    price: p.price || 0,
    use: p.use,
    does: p.does,
    face: p.face || p.name,
    features: p.features || [],
    kinds: p.kinds || [],
    href: p.href || (p.type === "wanted" ? "/create?kind=pack&idea=" + p.id : "/market?pack=" + p.id)
  };
}

function findPack(id) {
  const want = String(id || "").toLowerCase();
  if (want === "vita" || want === "insurance" || want === "quoteitaway") {
    return allPacks().find(function (p) { return p.id === "quote"; });
  }
  return allPacks().find(function (p) { return p.id === want || String(p.name).toLowerCase() === want; }) || null;
}

function searchPacks(q) {
  const term = String(q || "").trim().toLowerCase();
  const rows = allPacks().map(publicPack);
  if (!term) return rows;
  return rows.filter(function (p) {
    return [p.id, p.name, p.family, p.aisle, p.does, p.face].join(" ").toLowerCase().indexOf(term) >= 0;
  });
}

function loadOfficialFile(id) {
  const file = id === "quote" || id === "insurance" ? "vita" : id;
  try { return require("../packs/" + file + ".json"); } catch (e) { return null; }
}

function listingOf(id) {
  const row = findPack(id);
  if (!row) return null;
  const file = loadOfficialFile(row.packId || row.id);
  const out = publicPack(row);
  out.included = (file && file.qualify) || row.features || [];
  out.how = (file && file.do) || [];
  out.rules = (file && file.rules) || [];
  out.rails = (file && file.rails) || [];
  out.never = ["send", "stop", "pay"];
  if (row.face) out.face = row.face;
  return out;
}

function namedWorkspace(req) {
  const raw = req.headers["x-workspace"] || (req.query && req.query.workspace);
  if (raw == null || !String(raw).trim()) return "";
  return String(raw).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

async function packHandler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  const q = req.query || {};
  if (req.method === "GET") {
    if (q.creator) {
      return res.status(200).json({ ok: true, creator: String(q.creator).slice(0, 40), packs: searchPacks("").filter(function (p) { return p.official; }) });
    }
    if (q.id || q.pack) {
      const listing = listingOf(q.id || q.pack);
      if (!listing) return res.status(404).json({ ok: false, error: "No pack by that name." });
      return res.status(200).json({ ok: true, pack: listing, listing: listing });
    }
    const rows = searchPacks(q.q || q.search || "");
    return res.status(200).json({
      ok: true,
      q: String(q.q || q.search || "").slice(0, 80),
      packs: rows,
      official: rows.filter(function (p) { return p.official && p.type === "work"; }),
      wanted: rows.filter(function (p) { return p.wanted; }),
      color: rows.filter(function (p) { return p.type === "cosmetic"; }),
      never: ["send", "stop", "pay"]
    });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Use GET or POST." });
  const body = req.body || await readBody(req);
  const action = body.action || "packs";
  if (action === "packs" || action === "pack-search" || action === "marketplace") {
    return res.status(200).json({ ok: true, packs: searchPacks(body.q || body.search || "") });
  }
  const pack = findPack(body.id || body.pack || body.name);
  if (action === "preview-pack") {
    if (!pack) return res.status(404).json({ error: "No pack by that name." });
    return res.status(200).json({ ok: true, pack: listingOf(pack.id), never: ["send", "stop", "pay"] });
  }
  if (action === "use-pack" || action === "install-pack") {
    if (!pack) return res.status(404).json({ error: "No pack by that name." });
    if (pack.type === "wanted" || pack.use === "make") {
      return res.status(409).json({ ok: false, error: "Make this pack", href: "/create?kind=pack&idea=" + pack.id, pack: publicPack(pack) });
    }
    if (pack.type === "ask") {
      return res.status(409).json({ ok: false, error: "Ask is a tag.", pack: publicPack(pack) });
    }
    if (pack.type === "cosmetic") {
      return res.status(200).json({ ok: true, tryOn: pack.id, pack: publicPack(pack), note: "Color on this phone. No rules added." });
    }
    const workspace = namedWorkspace(req);
    if (!workspace) return res.status(400).json({ error: "Open a desk first." });
    const { workspace: shop, person } = personOf(req, workspace);
    if (!shop) return res.status(404).json({ error: "Open a desk first." });
    if (!isOwner(person)) return res.status(403).json({ error: "Only the owner can Use a pack." });
    const file = loadOfficialFile(pack.packId || pack.id);
    shop.pack = pack.packId || pack.id;
    shop.packName = pack.face || pack.name;
    if (file && Array.isArray(file.rules) && file.rules.length) {
      const have = ensureRules(shop).map(function (r) { return String(r.text || ""); });
      file.rules.forEach(function (r) {
        if (r && have.indexOf(String(r.text || "")) < 0) shop.rules.push(r);
      });
    }
    await save();
    return res.status(200).json({ ok: true, pack: publicPack(pack), shop: shop.slug, packName: shop.packName, never: ["send", "stop", "pay"] });
  }
  if (action === "list-pack" || action === "publish-pack" || action === "unlist-pack") {
    return res.status(409).json({ ok: false, error: "Creator lab is not on this catalog yet." });
  }
  return res.status(400).json({ error: "Unknown pack action." });
}

module.exports = packHandler;
module.exports.allPacks = allPacks;
module.exports.findPack = findPack;
module.exports.searchPacks = searchPacks;
module.exports.listingOf = listingOf;
module.exports.OFFICIAL = OFFICIAL;

const { cors, mem, save, readBody, personOf, isOwner, ensureRules, log, catalog } = require("./_lib");
const { grokOn, studioDraft } = require("./_grok");
const ais = require("./_ais");
const net = require("./_aia-net");

const OFFICIAL = [
  { id: "home", name: "Home & family", type: "work", family: "Automate It Away", aisle: "Home", official: true, price: 0, use: "ok", does: "Reminders, chores, school, same-day.", features: ["reminder", "calendar", "same-day cap"], kinds: ["chore", "school", "pickup", "repair"] },
  { id: "consign", name: "Consignment & resale", type: "work", family: "Consign It Away", aisle: "Consign", official: true, price: 0, use: "ok", does: "Photo in. Listing draft. Payout waits.", features: ["listing draft", "title hold", "payout wait"], kinds: ["list", "title", "payout"] },
  { id: "quote", name: "Insurance", type: "work", family: "Quote It Away", aisle: "Insurance", official: true, price: 0, use: "ok", does: "Fact-find and packet draft. Bind stays off.", features: ["packet draft", "bind off desk", "year-2 review"], kinds: ["lead", "quote", "call", "review"], face: "Insurance", packId: "vita" },
  { id: "fund", name: "Fund raise", type: "work", family: "Fund It Away", aisle: "Fund", official: true, price: 0, use: "ok", does: "Campaign draft. Credit waits on the owner.", features: ["campaign draft", "credit wait"], kinds: ["raise", "credit"] },
  { id: "land", name: "Land lot", type: "work", family: "Land", aisle: "Land", official: true, price: 0, use: "ok", does: "Lot note. Flood and title wait.", features: ["lot note", "flood wait", "title wait"], kinds: ["lot", "flood", "survey", "title"] },
  { id: "aia", name: "AIA Help", type: "work", family: "Automate It Away", aisle: "AIA", official: true, price: 0, use: "ok", does: "World problem in. Card on the AIA Admin Desk. You tap.", features: ["talk drop", "ticket card", "draft reply"], kinds: ["broke", "login", "desk", "account", "pack", "pipe", "idea"], face: "AIA Help" },
  { id: "aia-adoption", name: "Try it on this desk", type: "work", family: "Automate It Away", aisle: "AIA", official: true, price: 0, use: "ok", does: "Try first. Drop real work. Workers tap Yes or Stop. Open packs customize this desk. Drafts stay on the card.", features: ["try-first", "worker-first", "open packs", "secure-by-design"], kinds: ["task", "errand", "idea", "project"] }
];

const COLORS = [
  { id: "color-teal", name: "Teal", type: "cosmetic", family: "AIA", aisle: "Color", official: true, price: 0, use: "try", does: "Color on this phone." },
  { id: "color-harvest", name: "Harvest", type: "cosmetic", family: "AIA", aisle: "Color", official: true, price: 0, use: "try", does: "Color on this phone." },
  { id: "color-night", name: "Night", type: "cosmetic", family: "AIA", aisle: "Color", official: true, price: 0, use: "try", does: "Color on this phone." },
  { id: "color-slate", name: "Slate", type: "cosmetic", family: "AIA", aisle: "Color", official: true, price: 0, use: "try", does: "Color on this phone." }
];

const PACK_FILES = {
  home: function () { return require("../packs/home.json"); },
  consign: function () { return require("../packs/consign.json"); },
  vita: function () { return require("../packs/vita.json"); },
  fund: function () { return require("../packs/fund.json"); },
  land: function () { return require("../packs/land.json"); },
  aia: function () { return require("../packs/aia.json"); },
  "aia-adoption": function () { return require("../packs/aia-adoption.json"); }
};

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

function ensurePacks() {
  if (!Array.isArray(mem.packs)) mem.packs = [];
  return mem.packs;
}

function listedCreatorPacks(includeDrafts, workspace) {
  return ensurePacks().filter(function (p) {
    if (!p || !p.id) return false;
    const st = String(p.status || "draft").toLowerCase();
    const vis = String(p.visibility || st).toLowerCase();
    if (includeDrafts && workspace && p.workspace === workspace) return true;
    if (vis === "private" || st === "private" || st === "draft") return false;
    return st === "listed" || st === "published" || st === "submitted";
  });
}

function allPacks(opts) {
  const extra = listedCreatorPacks(opts && opts.mine, opts && opts.workspace);
  return OFFICIAL.concat(wantedRows(), COLORS, extra);
}

function grokStudio() {
  return {
    id: "grok",
    name: "Grok · AIA Studio",
    sku: false,
    product: "aia",
    role: "creator",
    does: "First-class creator on Creators Studio. Same AIA account — not a second SKU. Drafts packs and named desk AIs. Can list an ask. Collect stays HOLD. Packs land on this desk.",
    href: "/dev",
    market: "/market?creator=grok"
  };
}

function isGrokPack(p) {
  if (!p) return false;
  const who = [p.creatorId, p.authoredBy, p.source, p.creator].join(" ").toLowerCase();
  return /\bgrok\b/.test(who);
}

function publicPack(p) {
  if (!p) return null;
  const ask = Number(p.ask != null ? p.ask : p.price) || 0;
  const priced = !!(p.priced || ask > 0);
  const bots = Array.isArray(p.bots) ? p.bots : [];
  const deskAis = ais.normalizeAis([].concat(p.ais || [], bots), p.workspace);
  const rules = Array.isArray(p.rules) ? p.rules : [];
  const hold = collectHoldOf(p);
  const grok = isGrokPack(p);
  const vis = String(p.visibility || p.status || "").toLowerCase();
  const listed = vis === "listed" || vis === "published" || vis === "submitted" || (!p.official && (p.status === "listed" || p.status === "published" || p.status === "submitted"));
  return {
    id: p.id,
    name: p.name,
    type: p.type || "work",
    family: p.family || p.niche || p.creator || "",
    aisle: p.aisle || p.niche || "Creator",
    official: !!p.official,
    wanted: !!p.wanted,
    priced: priced,
    price: ask,
    ask: ask,
    use: p.use || (priced ? "hold" : "ok"),
    does: p.does,
    face: p.face || p.name,
    features: p.features || [],
    kinds: Array.isArray(p.kinds) ? p.kinds : String(p.kinds || "").split(/[,;]+/).map(function (s) { return s.trim(); }).filter(Boolean),
    creator: grok ? "Grok · AIA Studio" : (p.creator || (p.official ? "AIA" : p.workspace || "Listed creator")),
    creatorId: grok ? "grok" : (p.creatorId || p.workspace || (p.official ? "aia" : p.id)),
    authoredBy: grok ? "grok" : (p.authoredBy || "owner"),
    status: p.status || (p.official ? "listed" : "draft"),
    visibility: p.official ? "listed" : (p.wanted ? "wanted" : (vis === "private" || vis === "draft" ? "private" : (listed ? "listed" : (p.status || "draft")))),
    private: !p.official && !p.wanted && (vis === "private" || vis === "draft"),
    bots: deskAis.length || bots.length,
    botRows: (deskAis.length ? deskAis : bots).slice(0, 3),
    ais: deskAis.length,
    aiRows: deskAis.slice(0, 3).map(ais.publicAi),
    rules: rules.length,
    ruleRows: rules.slice(0, 8),
    dropHint: p.dropHint || "",
    queue: p.queue || null,
    collect: priced ? "hold" : "none",
    collectHold: hold,
    pipeMissing: !!(priced && !hold.pipe),
    charged: false,
    href: p.href || (p.type === "wanted" ? "/create?kind=pack&idea=" + p.id : "/market?pack=" + p.id),
    aia: (function () {
      const named = net.of(p.aia || p.aiaName || p.file || p.id || p.name, p.id || p.name);
      return named.name;
    })(),
    file: (function () {
      const named = net.of(p.aia || p.aiaName || p.file || p.id || p.name, p.id || p.name);
      return named.file;
    })(),
    internet: net.INTERNET,
    chain: false,
    owned: false,
    registry: net.publicNet(net.of(p.aia || p.id || p.name, p.id)).registry
  };
}

function findPack(id, opts) {
  const want = String(id || "").toLowerCase();
  if (want === "vita" || want === "insurance" || want === "quoteitaway") {
    return allPacks(opts).find(function (p) { return p.id === "quote"; });
  }
  return allPacks(opts).find(function (p) {
    if (!p) return false;
    if (p.id === want || String(p.name || "").toLowerCase() === want) return true;
    const named = net.of(p.aia || p.aiaName || p.file || p.id || p.name, p.id);
    return named.name === want || named.label === want.replace(/\.aia$/, "") || named.file === want;
  }) || null;
}

function searchPacks(q, opts) {
  const term = String(q || "").trim().toLowerCase();
  const rows = allPacks(opts).map(publicPack).filter(Boolean);
  if (!term) return rows;
  return rows.filter(function (p) {
    return [p.id, p.name, p.family, p.aisle, p.does, p.face, p.creator, p.aia, p.file].join(" ").toLowerCase().indexOf(term) >= 0;
  });
}

function loadOfficialFile(id) {
  const key = id === "quote" || id === "insurance" ? "vita" : String(id || "");
  const load = PACK_FILES[key];
  if (load) {
    try { return load(); } catch (e) { return null; }
  }
  try { return require("../packs/" + key + ".json"); } catch (e) { return null; }
}

function moneyPipeLive() {
  return (catalog() || []).some(function (p) {
    return p && p.live && (p.id === "square" || p.id === "webhook");
  });
}

function collectHoldOf(pack) {
  const ask = Number(pack && (pack.ask != null ? pack.ask : pack.price)) || 0;
  const pipe = moneyPipeLive();
  if (!(pack && (pack.priced || ask > 0))) {
    return { hold: true, charged: false, ask: 0, pipe: pipe ? "live" : null, note: "Packs never Collect on their own. Owner Yes still required." };
  }
  return {
    hold: true,
    charged: false,
    ask: ask,
    pipe: pipe ? "live" : null,
    note: pipe
      ? "Ask $" + ask + " is listed. Collect stays HOLD until a person taps Yes."
      : "Ask $" + ask + " is listed. No money pipe on this desk. Collect stays HOLD. Orange until Square or a live webhook is connected."
  };
}

function safeRules(rows) {
  return (rows || []).filter(function (r) {
    const blob = JSON.stringify(r || {});
    return !/\$250|over \$250|placeholder=\"250\"/i.test(blob);
  });
}

function listingOf(id, opts) {
  const row = findPack(id, opts);
  if (!row) return null;
  const file = row.official ? loadOfficialFile(row.packId || row.id) : null;
  const out = publicPack(row);
  out.included = (file && file.qualify) || row.features || [];
  out.how = (file && file.how) || {
    capture: "Drop the facts this pack named.",
    qualify: "Rules Cap or Wait on the words that matter.",
    do: "AIA drafts. A person still taps Yes or Stop.",
    collect: "Collect stays HOLD until Yes and a live money pipe.",
    follow: "The card stays on History until it is done."
  };
  if (typeof out.how !== "object") out.how = { do: String(out.how) };
  out.rules = safeRules((file && file.rules) || row.rules || []);
  out.ruleRows = out.rules;
  out.rails = (file && file.rails) || [];
  out.queue = (file && file.queue) || row.queue || null;
  out.never = ["send", "stop", "pay"];
  out.collectHold = collectHoldOf(row);
  const fileAis = ais.normalizeAis([].concat((file && (file.ais || file.bots)) || [], row.ais || [], row.bots || []), row.workspace);
  out.ais = fileAis.length;
  out.aiRows = fileAis.slice(0, 3).map(ais.publicAi);
  out.bots = fileAis.length || out.bots;
  out.botRows = fileAis.length ? fileAis.slice(0, 3) : out.botRows;
  out.rails = (out.rails || []).concat(fileAis.length ? [ais.RAILS] : []);
  if (row.face) out.face = row.face;
  return out;
}

function namedWorkspace(req) {
  const raw = req.headers["x-workspace"] || (req.query && req.query.workspace);
  if (raw == null || !String(raw).trim()) return "";
  return String(raw).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function slugPack(name) {
  return String(name || "pack").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "pack";
}

function clip(s, n) {
  return String(s == null ? "" : s).trim().slice(0, n || 160);
}

function normalizeCreatorPack(body, workspace, person) {
  const name = clip(body.name || body.title, 48);
  if (!name) return { ok: false, error: "Name the pack first." };
  const id = clip(body.id, 40) || (slugPack(workspace) + "-" + slugPack(name));
  const ask = Number(body.ask || body.price || 0) || 0;
  const deskAis = ais.normalizeAis([].concat(body.ais || [], body.bots || []), workspace);
  const bots = deskAis.map(function (a) {
    return {
      name: a.name,
      crew: a.role,
      role: a.role,
      does: a.does,
      prompt: a.prompt,
      steps: a.steps,
      allow: a.allow,
      deny: a.deny,
      aia: a.aia,
      file: a.file,
      draftOnly: true,
      never: a.never
    };
  });
  const visRaw = String(body.visibility || body.share || "").toLowerCase();
  const vis = visRaw === "listed" || visRaw === "published" || visRaw === "submitted" || visRaw === "market"
    ? (visRaw === "market" ? "listed" : visRaw)
    : (visRaw === "private" ? "private" : "");
  const rules = safeRules([].concat(body.rules || [], body.rule ? [{ text: String(body.rule) }] : [])).slice(0, 8);
  const queue = body.queue && typeof body.queue === "object" ? body.queue : {};
  const never = ["send", "stop", "pay", "bind"];
  const named = net.parseName(body.aia || body.aiaName || body.file || name, slugPack(name));
  if (!named.ok) return { ok: false, error: named.error };
  return {
    ok: true,
    pack: {
      id: id,
      workspace: workspace,
      creator: (person && person.name) || workspace || "Listed creator",
      creatorId: workspace,
      name: name,
      aia: named.name,
      aiaLabel: named.label,
      file: named.file,
      internet: net.INTERNET,
      chain: false,
      owned: false,
      niche: clip(body.niche || body.family, 40),
      family: clip(body.family || body.niche || workspace, 40),
      aisle: clip(body.aisle || body.niche || "Creator", 24),
      does: clip(body.does, 200),
      fields: body.fields || [],
      kinds: body.kinds,
      rules: rules,
      ask: ask,
      priced: ask > 0,
      price: ask,
      ais: deskAis,
      bots: bots,
      dropHint: clip(body.dropHint || (body.dropForm && body.dropForm.hint), 160),
      dropForm: body.dropForm || null,
      pipes: clip(typeof body.pipes === "string" ? body.pipes : (body.pipes || []).join(", "), 80),
      ext: clip(body.ext, 160),
      handTo: clip(body.handTo, 40),
      queue: {
        badge: clip(queue.badge, 24),
        empty: clip(queue.empty, 160),
        group: queue.group || "none",
        sort: queue.sort || "cap-first",
        chips: queue.chips,
        taps: queue.taps || "copy, text, email, hand, cap",
        never: never
      },
      never: never,
      collect: "hold",
      official: false,
      type: "work",
      authoredBy: String(body.authoredBy || body.creatorId || "").toLowerCase() === "grok" ? "grok" : "owner",
      creatorId: String(body.authoredBy || body.creatorId || "").toLowerCase() === "grok" ? "grok" : workspace,
      visibility: vis || (String(body.status || "draft").toLowerCase() === "listed" ? "listed" : "draft"),
      status: vis === "listed" || vis === "published" || vis === "submitted" ? vis : (vis === "private" ? "private" : String(body.status || "draft").toLowerCase()),
      updatedAt: new Date().toISOString()
    }
  };
}

function installPackOnDesk(shop, pack) {
  const file = pack.official ? loadOfficialFile(pack.packId || pack.id) : pack;
  shop.pack = pack.packId || pack.id;
  shop.packName = pack.face || pack.name;
  if (file && file.queue) shop.packQueue = file.queue;
  else if (pack.queue) shop.packQueue = pack.queue;
  const packAis = ais.normalizeAis([].concat((file && (file.ais || file.bots)) || [], pack.ais || [], pack.bots || []), shop.slug);
  if (packAis.length) ais.attachAisToDesk(shop, packAis);
  else if (Array.isArray(pack.bots) && pack.bots.length) shop.packBots = pack.bots.slice(0, 3);
  const incoming = safeRules((file && file.rules) || pack.rules || []);
  const have = ensureRules(shop).map(function (r) { return String(r.text || ""); });
  let added = 0;
  incoming.forEach(function (r) {
    if (!r || have.indexOf(String(r.text || "")) >= 0) return;
    shop.rules.push(r);
    added += 1;
  });
  return added;
}

function aiaFilenameOk(name) {
  const n = String(name || "").trim();
  if (!n) return true;
  return /\.aia$/i.test(n);
}

function readAiaPack(raw) {
  let src = raw;
  if (typeof src === "string") {
    try { src = JSON.parse(src); } catch (e) {
      return { ok: false, error: "That .aia file is not JSON." };
    }
  }
  if (src && typeof src === "object" && (src.pack || src.listing || src.json) && typeof (src.pack || src.listing || src.json) === "object") {
    src = src.pack || src.listing || src.json;
  }
  if (!src || typeof src !== "object" || Array.isArray(src)) {
    return { ok: false, error: "Install a .aia pack file." };
  }
  const name = src.name || src.title || src.aia || src.id;
  if (!name) return { ok: false, error: "That .aia pack needs a name." };
  return {
    ok: true,
    pack: Object.assign({}, src, {
      chain: false,
      owned: false,
      live: false,
      charged: false,
      collect: "hold",
      registry: net.statusOf().registry,
      internet: net.INTERNET
    })
  };
}

function packFileOf(listing) {
  const named = net.of(listing && (listing.aia || listing.file || listing.id || listing.name), listing && listing.id);
  const hold = net.statusOf();
  return {
    format: "aia.pack.v1",
    artifact: ".aia",
    internet: net.INTERNET,
    tld: ".aia",
    aia: named.name,
    file: named.file,
    id: listing && listing.id,
    name: listing && listing.name,
    does: listing && listing.does,
    family: listing && listing.family,
    aisle: listing && listing.aisle,
    kinds: listing && listing.kinds,
    rules: listing && (listing.ruleRows || listing.rules) || [],
    ais: listing && listing.aiRows || [],
    queue: listing && listing.queue,
    ask: listing && listing.ask,
    priced: listing && listing.priced,
    collect: "hold",
    charged: false,
    chain: false,
    owned: false,
    live: false,
    registry: hold.registry,
    note: hold.note,
    never: ["send", "stop", "pay", "bind"]
  };
}

function sendPackFile(res, listing) {
  const named = net.of(listing && (listing.aia || listing.file || listing.id || listing.name), listing && listing.id);
  const file = String(named.file || "pack.aia").replace(/"/g, "");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=\"" + file + "\"");
  res.setHeader("X-AIA-Format", "aia.pack.v1");
  return res.status(200).send(JSON.stringify(packFileOf(listing), null, 2));
}

async function packHandler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  const q = req.query || {};
  const workspace = namedWorkspace(req);
  const mine = q.mine === "1" || q.mine === "true";

  if (req.method === "GET") {
    if (q.creator) {
      const who = String(q.creator).slice(0, 40);
      const packs = searchPacks("", { mine: false }).filter(function (p) {
        if (who.toLowerCase() === "grok") return isGrokPack(p);
        return String(p.creatorId || p.family || "").toLowerCase() === who.toLowerCase() || (who === "aia" && p.official);
      });
      return res.status(200).json({
        ok: true,
        creator: who.toLowerCase() === "grok" ? grokStudio() : { name: who, official: who === "aia", does: "" },
        packs: packs
      });
    }
    if (q.download || q.file || q.dl === "1") {
      const listing = listingOf(q.download || q.file || q.id || q.pack, { mine: !!(mine || workspace), workspace: workspace })
        || listingOf(q.download || q.file || q.id || q.pack, { mine: false });
      if (!listing) return res.status(404).json({ ok: false, error: "No pack by that .aia name." });
      return sendPackFile(res, listing);
    }
    if (q.id || q.pack) {
      const listing = listingOf(q.id || q.pack, { mine: mine, workspace: workspace });
      if (!listing) return res.status(404).json({ ok: false, error: "No pack by that name." });
      return res.status(200).json({ ok: true, pack: listing, listing: listing });
    }
    if (q.ais === "1" || q.ais === "true") {
      if (!workspace) return res.status(400).json({ ok: false, error: "Open a desk first." });
      const { workspace: shop } = personOf(req, workspace);
      if (!shop) return res.status(404).json({ ok: false, error: "Open a desk first." });
      const rails = ais.railsOf(shop);
      return res.status(200).json({ ok: true, desk: shop.slug, ais: rails.ais, count: rails.count, rails: rails.rails, never: rails.never, aia: rails.aia, internet: rails.net });
    }
    const rows = searchPacks(q.q || q.search || "", { mine: mine, workspace: workspace });
    return res.status(200).json({
      ok: true,
      q: String(q.q || q.search || "").slice(0, 80),
      packs: rows,
      official: rows.filter(function (p) { return p.official && p.type === "work"; }),
      wanted: rows.filter(function (p) { return p.wanted; }),
      color: rows.filter(function (p) { return p.type === "cosmetic"; }),
      creator: rows.filter(function (p) { return !p.official && !p.wanted && p.type !== "cosmetic"; }),
      grok: { on: grokOn(), note: grokOn() ? "Grok drafts in Creators Studio. Never Send." : "Set XAI_API_KEY for Studio drafts." },
      studio: grokStudio(),
      never: ["send", "stop", "pay"],
      internet: net.statusOf()
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Use GET or POST." });
  const body = req.body || await readBody(req);
  const action = body.action || "packs";

  if (action === "packs" || action === "pack-search" || action === "marketplace") {
    return res.status(200).json({ ok: true, packs: searchPacks(body.q || body.search || "") });
  }

  if (action === "studio-draft" || action === "grok-pack") {
    if (!workspace) return res.status(400).json({ error: "Open a desk first." });
    const { workspace: shop, person } = personOf(req, workspace);
    if (!shop) return res.status(404).json({ error: "Open a desk first." });
    if (!isOwner(person)) return res.status(403).json({ error: "Only the owner can ask Grok in Creators Studio." });
    const grok = await studioDraft(body.brief || body.text || body.does || body.name, workspace, { kind: body.kind || "pack" });
    log("Grok", "Studio " + (body.kind || "pack") + " draft", grok && grok.ok ? "OK" : ((grok && grok.reason) || "Hold"), workspace);
    await save();
    if (grok && grok.reason === "no-key") {
      return res.status(200).json({
        ok: false,
        grok: "off",
        saved: false,
        note: "Drafts are off until XAI_API_KEY is on. Orange copy only. You can still write the pack by hand."
      });
    }
    if (!grok || !grok.ok) {
      return res.status(200).json({
        ok: false,
        grok: (grok && grok.reason) || "off",
        saved: false,
        note: "No draft this time. You can still write the pack by hand. AIA does not send."
      });
    }
    return res.status(200).json({
      ok: true,
      grok: "on",
      saved: false,
      pack: grok.pack,
      provider: grok.provider,
      model: grok.model,
      note: "Draft only. Yes saves it on this lab. Stop discards it. AIA does not send. Collect stays HOLD."
    });
  }

  if (action === "list-pack" || action === "publish-pack" || action === "submit-pack" || action === "test-pack" || action === "private-pack") {
    if (!workspace) return res.status(400).json({ error: "Open a desk first." });
    const { workspace: shop, person } = personOf(req, workspace);
    if (!shop) return res.status(404).json({ error: "Open a desk first." });
    if (!isOwner(person)) return res.status(403).json({ error: "Only the owner can list a pack." });
    const made = normalizeCreatorPack(body, workspace, person);
    if (!made.ok) return res.status(400).json({ ok: false, error: made.error });
    const row = made.pack;
    if (action === "private-pack" || body.visibility === "private" || body.share === "private") {
      row.status = "private";
      row.visibility = "private";
    }
    if (action === "publish-pack" || action === "submit-pack" || body.submit) {
      row.status = body.status === "draft" ? "listed" : (body.status || "listed");
      row.visibility = "listed";
    }
    if (action === "test-pack") row.status = row.status || "draft";
    const rows = ensurePacks();
    const idx = rows.findIndex(function (p) { return p && p.id === row.id && p.workspace === workspace; });
    if (idx >= 0) rows[idx] = Object.assign({}, rows[idx], row);
    else rows.unshift(row);
    mem.packs = rows.slice(0, 80);
    const listed = row.status === "listed" || row.status === "published" || row.status === "submitted" || action === "publish-pack" || action === "submit-pack" || action === "test-pack" || action === "private-pack" || body.preview === false;
    let added = 0;
    if (listed) added = installPackOnDesk(shop, row);
    await save();
    log("Desk", (action === "test-pack" ? "Test pack · " : (action === "private-pack" || row.visibility === "private" ? "Private pack · " : (listed ? "Publish pack · " : "List pack · "))) + row.name, "OK", workspace);
    const hold = collectHoldOf(row);
    const rails = ais.railsOf(shop);
    const note = action === "test-pack"
      ? "Pack is on this desk. Named AIs attach if the pack declared them. Open Drop or Queue. Packs never Send."
      : (action === "private-pack" || row.visibility === "private"
        ? "Private on this desk. Not on Market. Named AIs are bound here. Yes / Stop / Kill stay human."
        : (row.status === "listed" || row.status === "published" || row.status === "submitted"
          ? (row.priced
            ? "Listed with ask $" + row.ask + ". Pack JSON and desk AIs land on this desk. World desks can Buy / install. Collect stays HOLD until Yes and a money pipe."
            : "Listed free. Pack JSON and desk AIs land on this desk. World desks can install it onto their queue. Packs never Send.")
          : "Draft saved. Off Market until you list it. Packs never Send."));
    return res.status(200).json({ ok: true, pack: publicPack(row), added: added, desk: shop.slug, ais: rails.ais, collectHold: hold, charged: false, never: ["send", "stop", "pay"], note: note });
  }

  if (action === "save-ai" || action === "attach-ai") {
    if (!workspace) return res.status(400).json({ error: "Open a desk first." });
    const { workspace: shop, person } = personOf(req, workspace);
    if (!shop) return res.status(404).json({ error: "Open a desk first." });
    if (!isOwner(person)) return res.status(403).json({ error: "Only the owner can name a desk AI." });
    const made = ais.normalizeAi(body.ai || body, workspace);
    if (!made) return res.status(400).json({ ok: false, error: "Name the AI first." });
    const added = ais.attachAisToDesk(shop, [made]);
    await save();
    log("Desk AI", "Attach · " + made.name, "OK", workspace);
    const rails = ais.railsOf(shop);
    return res.status(200).json({
      ok: true,
      ai: ais.publicAi(made),
      ais: rails.ais,
      added: added,
      charged: false,
      never: ais.NEVER.slice(),
      rails: rails.rails,
      note: made.name + " is bound to this desk. Drafts only. Yes / Stop / Kill stay human. No silent money or mail."
    });
  }

  if (action === "remove-ai") {
    if (!workspace) return res.status(400).json({ error: "Open a desk first." });
    const { workspace: shop, person } = personOf(req, workspace);
    if (!shop || !isOwner(person)) return res.status(403).json({ error: "Only the owner can remove a desk AI." });
    const out = ais.removeDeskAi(shop, body.id || body.name || body.ai);
    if (!out.ok) return res.status(404).json({ ok: false, error: out.error });
    await save();
    log("Desk AI", "Remove · " + (body.id || body.name || ""), "OK", workspace);
    return res.status(200).json({ ok: true, ais: out.ais, note: "That desk AI is off this desk." });
  }

  if (action === "unlist-pack") {
    if (!workspace) return res.status(400).json({ error: "Open a desk first." });
    const { workspace: shop, person } = personOf(req, workspace);
    if (!shop || !isOwner(person)) return res.status(403).json({ error: "Only the owner can unlist a pack." });
    const id = String(body.id || body.pack || "").toLowerCase();
    const row = ensurePacks().find(function (p) { return p && p.workspace === workspace && (p.id === id || String(p.name).toLowerCase() === id); });
    if (!row) return res.status(404).json({ error: "No pack by that name on this lab." });
    row.status = "private";
    row.visibility = "private";
    await save();
    return res.status(200).json({ ok: true, pack: publicPack(row), note: "Pack is private again. Off Market. Still on this desk if you already installed it." });
  }

  const pack = findPack(body.id || body.pack || body.name || body.aia || body.file, { mine: true, workspace: workspace });
  if (action === "preview-pack") {
    if (!pack) return res.status(404).json({ error: "No pack by that name." });
    return res.status(200).json({ ok: true, pack: listingOf(pack.id, { mine: true, workspace: workspace }), never: ["send", "stop", "pay"], collectHold: collectHoldOf(pack) });
  }
  if (action === "download-pack" || action === "export-pack") {
    let row = pack || findPack(body.id || body.pack || body.name || body.aia || body.file, { mine: true, workspace: workspace });
    if (!row && (body.name || body.aia || body.does)) {
      const made = normalizeCreatorPack(body, workspace || "desk", null);
      if (made.ok) row = made.pack;
    }
    if (!row) return res.status(404).json({ ok: false, error: "No pack by that .aia name." });
    return sendPackFile(res, listingOf(row.id, { mine: true, workspace: workspace }) || publicPack(row) || row);
  }
  if (action === "install-aia" || action === "import-pack" || action === "install-file") {
    if (!workspace) return res.status(400).json({ error: "Open a desk first." });
    const { workspace: shop, person } = personOf(req, workspace);
    if (!shop) return res.status(404).json({ error: "Open a desk first." });
    if (!isOwner(person)) return res.status(403).json({ error: "Only the owner can install a .aia pack." });
    const fname = body.filename || body.fileName || body.file || "";
    if (typeof fname === "string" && fname && !aiaFilenameOk(fname)) {
      return res.status(400).json({ ok: false, error: "Use a .aia pack file." });
    }
    const parsed = readAiaPack(body.pack && typeof body.pack === "object" ? body.pack : body);
    if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });
    const made = normalizeCreatorPack(parsed.pack, workspace, person);
    if (!made.ok) return res.status(400).json({ ok: false, error: made.error });
    const row = made.pack;
    row.status = "private";
    row.visibility = "private";
    row.chain = false;
    row.owned = false;
    row.live = false;
    row.charged = false;
    const rows = ensurePacks();
    const idx = rows.findIndex(function (p) { return p && p.id === row.id && p.workspace === workspace; });
    if (idx >= 0) rows[idx] = Object.assign({}, rows[idx], row);
    else rows.unshift(row);
    mem.packs = rows.slice(0, 80);
    const added = installPackOnDesk(shop, row);
    await save();
    log("Desk", "Install .aia · " + row.name, "OK", workspace);
    const hold = collectHoldOf(row);
    const rails = ais.railsOf(shop);
    return res.status(200).json({
      ok: true,
      pack: publicPack(row),
      added: added,
      desk: shop.slug,
      ais: rails.ais,
      file: row.file,
      aia: row.aia,
      charged: false,
      chain: false,
      owned: false,
      collectHold: hold,
      never: ["send", "stop", "pay"],
      rails: rails.rails,
      note: "Installed " + row.file + " onto this desk. Named AIs attached. Private on AIA Internet — not on Market. Collect stays HOLD. No on-chain claim."
    });
  }
  if (action === "use-pack" || action === "install-pack" || action === "buy-pack") {
    if (!pack) return res.status(404).json({ error: "No pack by that name." });
    if (pack.type === "wanted" || pack.use === "make") {
      return res.status(409).json({ ok: false, error: "Make this pack", href: "/create?kind=pack&idea=" + pack.id, pack: publicPack(pack) });
    }
    if (pack.type === "cosmetic") {
      return res.status(200).json({ ok: true, tryOn: pack.id, pack: publicPack(pack), note: "Color on this phone. No rules added." });
    }
    if (!workspace) return res.status(400).json({ error: "Open a desk first." });
    const { workspace: shop, person } = personOf(req, workspace);
    if (!shop) return res.status(404).json({ error: "Open a desk first." });
    if (!isOwner(person)) return res.status(403).json({ error: "Only the owner can Use a pack." });
    const already = shop.pack === (pack.packId || pack.id);
    const added = installPackOnDesk(shop, pack);
    await save();
    log("Desk", "Install pack · " + (pack.name || pack.id), "OK", workspace);
    const hold = collectHoldOf(pack);
    const rails = ais.railsOf(shop);
    return res.status(200).json({
      ok: true,
      pack: publicPack(pack),
      shop: shop.slug,
      packName: shop.packName,
      already: already,
      added: added,
      rulesAdded: added,
      ais: rails.ais,
      charged: false,
      collectHold: hold,
      never: ["send", "stop", "pay"],
      rails: rails.rails,
      note: already
        ? "Already on this desk. " + hold.note
        : "Pack JSON is on this desk. " + (rails.count ? rails.count + " desk AI" + (rails.count === 1 ? "" : "s") + " attached. " : "") + hold.note
    });
  }
  return res.status(400).json({ error: "Unknown pack action." });
}

module.exports = packHandler;
module.exports.allPacks = allPacks;
module.exports.findPack = findPack;
module.exports.searchPacks = searchPacks;
module.exports.listingOf = listingOf;
module.exports.grokStudio = grokStudio;
module.exports.collectHoldOf = collectHoldOf;
module.exports.readAiaPack = readAiaPack;
module.exports.packFileOf = packFileOf;
module.exports.ais = ais;

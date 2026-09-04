const { cors, mem, save, readBody, personOf, isOwner, ensureRules, log, catalog } = require("./_lib");
const { grokOn, studioDraft } = require("./_grok");

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
    if (includeDrafts && workspace && p.workspace === workspace) return true;
    const st = String(p.status || "draft").toLowerCase();
    return st === "listed" || st === "published" || st === "submitted";
  });
}

function allPacks(opts) {
  const extra = listedCreatorPacks(opts && opts.mine, opts && opts.workspace);
  return OFFICIAL.concat(wantedRows(), COLORS, extra);
}

function publicPack(p) {
  if (!p) return null;
  const ask = Number(p.ask != null ? p.ask : p.price) || 0;
  const priced = !!(p.priced || ask > 0);
  const bots = Array.isArray(p.bots) ? p.bots : [];
  const rules = Array.isArray(p.rules) ? p.rules : [];
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
    creator: p.creator || (p.official ? "AIA" : p.workspace || "Listed creator"),
    creatorId: p.creatorId || p.workspace || (p.official ? "aia" : p.id),
    status: p.status || (p.official ? "listed" : "draft"),
    bots: bots.length,
    botRows: bots.slice(0, 3),
    rules: rules.length,
    ruleRows: rules.slice(0, 8),
    dropHint: p.dropHint || "",
    queue: p.queue || null,
    collect: priced ? "hold" : "none",
    href: p.href || (p.type === "wanted" ? "/create?kind=pack&idea=" + p.id : "/market?pack=" + p.id)
  };
}

function findPack(id, opts) {
  const want = String(id || "").toLowerCase();
  if (want === "vita" || want === "insurance" || want === "quoteitaway") {
    return allPacks(opts).find(function (p) { return p.id === "quote"; });
  }
  return allPacks(opts).find(function (p) { return p.id === want || String(p.name || "").toLowerCase() === want; }) || null;
}

function searchPacks(q, opts) {
  const term = String(q || "").trim().toLowerCase();
  const rows = allPacks(opts).map(publicPack).filter(Boolean);
  if (!term) return rows;
  return rows.filter(function (p) {
    return [p.id, p.name, p.family, p.aisle, p.does, p.face, p.creator].join(" ").toLowerCase().indexOf(term) >= 0;
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
  const bots = Array.isArray(body.bots) ? body.bots.slice(0, 3).map(function (b) {
    if (!b) return null;
    return {
      name: clip(b.name, 40),
      crew: clip(b.crew || "Doer", 16),
      does: clip(b.does, 160),
      prompt: clip(b.prompt, 400),
      draftOnly: true,
      never: ["send", "stop", "money"]
    };
  }).filter(function (b) { return b && b.name; }) : [];
  const rules = safeRules([].concat(body.rules || [], body.rule ? [{ text: String(body.rule) }] : [])).slice(0, 8);
  const queue = body.queue && typeof body.queue === "object" ? body.queue : {};
  const never = ["send", "stop", "pay", "bind"];
  return {
    ok: true,
    pack: {
      id: id,
      workspace: workspace,
      creator: (person && person.name) || workspace || "Listed creator",
      creatorId: workspace,
      name: name,
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
      status: String(body.status || "draft").toLowerCase(),
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
  if (Array.isArray(pack.bots) && pack.bots.length) shop.packBots = pack.bots.slice(0, 3);
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
        return String(p.creatorId || p.family || "").toLowerCase() === who.toLowerCase() || (who === "aia" && p.official);
      });
      return res.status(200).json({
        ok: true,
        creator: { name: who === "grok" ? "Grok · AIA" : who, official: who === "aia" || who === "grok", does: who === "grok" ? "Included drafter on Creators Studio. Same AIA account. Packs still wait on Yes." : "" },
        packs: packs
      });
    }
    if (q.id || q.pack) {
      const listing = listingOf(q.id || q.pack, { mine: mine, workspace: workspace });
      if (!listing) return res.status(404).json({ ok: false, error: "No pack by that name." });
      return res.status(200).json({ ok: true, pack: listing, listing: listing });
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
      never: ["send", "stop", "pay"]
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
    const grok = await studioDraft(body.brief || body.text || body.does || body.name, workspace);
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

  if (action === "list-pack" || action === "publish-pack" || action === "submit-pack" || action === "test-pack") {
    if (!workspace) return res.status(400).json({ error: "Open a desk first." });
    const { workspace: shop, person } = personOf(req, workspace);
    if (!shop) return res.status(404).json({ error: "Open a desk first." });
    if (!isOwner(person)) return res.status(403).json({ error: "Only the owner can list a pack." });
    const made = normalizeCreatorPack(body, workspace, person);
    if (!made.ok) return res.status(400).json({ ok: false, error: made.error });
    const row = made.pack;
    if (action === "publish-pack" || action === "submit-pack" || body.submit) row.status = body.status === "draft" ? "listed" : (body.status || "listed");
    if (action === "test-pack") row.status = row.status || "draft";
    const rows = ensurePacks();
    const idx = rows.findIndex(function (p) { return p && p.id === row.id && p.workspace === workspace; });
    if (idx >= 0) rows[idx] = Object.assign({}, rows[idx], row);
    else rows.unshift(row);
    mem.packs = rows.slice(0, 80);
    let added = 0;
    if (action === "test-pack" || body.preview === false) added = installPackOnDesk(shop, row);
    await save();
    log("Desk", (action === "test-pack" ? "Test pack · " : "List pack · ") + row.name, "OK", workspace);
    const note = action === "test-pack"
      ? "Pack is on this desk. Open Drop or Queue. Packs never Send."
      : (row.status === "listed" || row.status === "published"
        ? (row.priced
          ? "Listed with ask $" + row.ask + ". World desks can install it. Collect stays HOLD until Yes and a money pipe."
          : "Listed free. World desks can install it onto their queue. Packs never Send.")
        : "Draft saved. Off Market until you list it. Packs never Send.");
    return res.status(200).json({ ok: true, pack: publicPack(row), added: added, collectHold: collectHoldOf(row), note: note, never: ["send", "stop", "pay"] });
  }

  if (action === "unlist-pack") {
    if (!workspace) return res.status(400).json({ error: "Open a desk first." });
    const { workspace: shop, person } = personOf(req, workspace);
    if (!shop || !isOwner(person)) return res.status(403).json({ error: "Only the owner can unlist a pack." });
    const id = String(body.id || body.pack || "").toLowerCase();
    const row = ensurePacks().find(function (p) { return p && p.workspace === workspace && (p.id === id || String(p.name).toLowerCase() === id); });
    if (!row) return res.status(404).json({ error: "No pack by that name on this lab." });
    row.status = "draft";
    await save();
    return res.status(200).json({ ok: true, pack: publicPack(row), note: "Pack is private again." });
  }

  const pack = findPack(body.id || body.pack || body.name, { mine: true, workspace: workspace });
  if (action === "preview-pack") {
    if (!pack) return res.status(404).json({ error: "No pack by that name." });
    return res.status(200).json({ ok: true, pack: listingOf(pack.id, { mine: true, workspace: workspace }), never: ["send", "stop", "pay"], collectHold: collectHoldOf(pack) });
  }
  if (action === "use-pack" || action === "install-pack") {
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
    return res.status(200).json({
      ok: true,
      pack: publicPack(pack),
      shop: shop.slug,
      packName: shop.packName,
      already: already,
      added: added,
      rulesAdded: added,
      collectHold: hold,
      never: ["send", "stop", "pay"],
      note: already
        ? "Already on this desk. " + hold.note
        : "Pack is on this desk. Rules and queue face landed. " + hold.note
    });
  }
  return res.status(400).json({ error: "Unknown pack action." });
}

module.exports = packHandler;
module.exports.allPacks = allPacks;
module.exports.findPack = findPack;
module.exports.searchPacks = searchPacks;
module.exports.listingOf = listingOf;
module.exports.OFFICIAL = OFFICIAL;

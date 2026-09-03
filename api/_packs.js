const { mem, addWorkspaceRule, ensureRules } = require("./_lib");
const { ensureCreations, parseFieldList } = require("./_fields");

const DANGER = /payout|bind|illustration|wire|ach|commission/i;

const OFFICIAL = [
  { id: "home", name: "Home & family", family: "Automate It Away", niche: "home", does: "School form, same-day chore, bill due. Cap same-day.", dropHint: "Name who, when, and where. Cap same-day.", kinds: ["chore", "school", "form", "reminder", "request"], fields: [{ key: "who", label: "Who it is for" }, { key: "when", label: "When" }, { key: "where", label: "Where" }], ask: 0, rules: [{ text: "Cap same-day cards.", when: "qualify", then: "wait", contains: "same-day" }, { text: "Ask me if a kid or school is named.", when: "qualify", then: "wait", contains: "school" }] },
  { id: "consign", name: "Consignment & resale", family: "Consign It Away", niche: "consign", does: "Photo in. Comps. Draft a title. Wait on payout.", dropHint: "Photo, condition, ask. Draft only.", kinds: ["list", "photo", "walk-in"], fields: [{ key: "condition", label: "Condition" }, { key: "ask", label: "Ask", type: "number" }, { key: "title", label: "Title with it" }], ask: 0, rules: [{ text: "Cap title-missing items.", when: "qualify", then: "wait", contains: "title" }, { text: "Wait on me before a payout leaves.", when: "collect", then: "wait" }] },
  { id: "vita", name: "Insurance", family: "Quote It Away", niche: "insurance", does: "Need in. Draft a packet. Stop on an illustration send.", dropHint: "Need, state, when. Draft only. Do not send an illustration from here.", kinds: ["quote", "follow", "form"], fields: [{ key: "need", label: "What they need" }, { key: "state", label: "State" }, { key: "when", label: "When" }], ask: 0, rules: [{ text: "Cap this-week cards.", when: "qualify", then: "wait", contains: "this week" }, { text: "Stop if this is an illustration.", when: "do", then: "stop", contains: "illustration" }] },
  { id: "fund", name: "Fund raise", family: "Fund It Away", niche: "fund", does: "Campaign note in. Draft the page. Wait on a credit call.", dropHint: "Campaign, amount note. Wait on a credit call.", kinds: ["request", "follow", "form"], fields: [{ key: "campaign", label: "Campaign" }, { key: "amount", label: "Amount note", type: "number" }], ask: 0, rules: [{ text: "Wait on me before a credit decision.", when: "collect", then: "wait", contains: "credit" }] },
  { id: "land", name: "Land lot", family: "Tony Oddo land", niche: "land", does: "Lot interest in. Cap flood. Cap title.", dropHint: "Lot, flood note, title note.", kinds: ["quote", "follow", "request"], fields: [{ key: "lot", label: "Lot" }, { key: "flood", label: "Flood note" }, { key: "title", label: "Title note" }], ask: 0, rules: [{ text: "Cap flood cards.", when: "qualify", then: "wait", contains: "flood" }, { text: "Cap title cards.", when: "qualify", then: "wait", contains: "title" }] }
];

function listedOf() {
  if (!Array.isArray(mem.listedPacks)) mem.listedPacks = [];
  return mem.listedPacks;
}
function fieldRows(raw) {
  if (typeof parseFieldList === "function") return parseFieldList(raw).slice(0, 8);
  if (!Array.isArray(raw)) return String(raw || "").split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 8).map((label) => ({ key: String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), label: String(label).slice(0, 40), type: "text" }));
  return raw.slice(0, 8).map((f) => {
    if (!f) return null;
    if (typeof f === "string") return { key: f.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: f.slice(0, 40), type: "text" };
    return { key: String(f.key || f.label || "field").slice(0, 32), label: String(f.label || f.key || "field").slice(0, 40), type: f.type === "number" || f.type === "yesno" ? f.type : "text" };
  }).filter(Boolean);
}
function kindRows(raw) {
  const list = Array.isArray(raw) ? raw : String(raw || "").split(/[,;\n]+/);
  return list.map((k) => String(k || "").toLowerCase().trim().slice(0, 24)).filter(Boolean).slice(0, 8);
}
function publicPack(p, extra) {
  if (!p) return null;
  const ask = Number(p.ask || p.price || 0) || 0;
  return Object.assign({
    id: p.id,
    name: p.name,
    family: p.family || "",
    niche: p.niche || p.family || "",
    does: p.does || "",
    dropHint: p.dropHint || p.does || "",
    kinds: kindRows(p.kinds),
    fields: fieldRows(p.fields),
    free: ask <= 0,
    ask: ask > 0 ? ask : 0,
    priced: ask > 0,
    official: !!p.official,
    creator: !p.official,
    rules: Array.isArray(p.rules) ? p.rules.length : 0
  }, extra || {});
}
function dropShape(p) {
  const card = publicPack(p);
  if (!card) return null;
  card.drop = true;
  card.charged = false;
  card.installsRules = false;
  return card;
}
function catalog() {
  const official = OFFICIAL.map((p) => publicPack(Object.assign({ official: true }, p)));
  const listed = listedOf().map((p) => publicPack(p)).filter(Boolean);
  (mem.workspaces || []).forEach((ws) => {
    ensureCreations(ws).forEach((c) => {
      if (!c || c.share === "private" || !c.share) return;
      if (listed.some((row) => row && row.id === c.id)) return;
      listed.push(publicPack({ id: c.id, name: c.name, family: c.family || ws.biz || ws.name || "Desk pack", niche: c.niche || c.family || "", does: c.does, dropHint: c.dropHint || c.does, kinds: c.kinds, fields: c.fields, ask: c.price || c.ask || 0, official: false, rules: c.rules }));
    });
  });
  return official.concat(listed);
}
function searchPacks(q, filters) {
  const needle = String(q || "").toLowerCase().trim();
  const wantOfficial = !!(filters && (filters.official === true || filters.official === "1"));
  const wantFree = !!(filters && (filters.free === true || filters.free === "1"));
  const wantListed = !!(filters && (filters.listed === true || filters.listed === "1"));
  const wantMarket = !!(filters && (filters.market === true || filters.market === "1"));
  const family = String((filters && (filters.family || filters.pack || filters.niche)) || "").toLowerCase();
  return catalog().filter((p) => {
    if (wantOfficial && !p.official) return false;
    if (wantListed && p.official) return false;
    if (wantFree && p.priced) return false;
    if (wantMarket && !p.priced) return false;
    if (family && [p.family, p.niche, p.id, p.name].join(" ").toLowerCase().indexOf(family) < 0) return false;
    if (!needle) return true;
    const blob = [p.id, p.name, p.family, p.niche, p.does, p.dropHint].concat(p.kinds || []).concat((p.fields || []).map((f) => f.label || f.key)).join(" ").toLowerCase();
    return blob.indexOf(needle) >= 0;
  });
}
function findPack(id) {
  const want = String(id || "").toLowerCase().trim();
  if (!want) return null;
  const official = OFFICIAL.find((p) => p.id === want || String(p.name).toLowerCase() === want || String(p.niche).toLowerCase() === want);
  if (official) return Object.assign({ official: true }, official);
  const listed = listedOf().find((p) => p && (String(p.id).toLowerCase() === want || String(p.name).toLowerCase() === want));
  if (listed) return listed;
  for (const ws of mem.workspaces || []) {
    const hit = ensureCreations(ws).find((c) => c && (String(c.id).toLowerCase() === want || String(c.name).toLowerCase() === want));
    if (hit) return Object.assign({ official: false, ask: hit.price || hit.ask || 0, family: hit.family || (ws && (ws.biz || ws.name)) || "" }, hit);
  }
  const fuzzy = catalog().find((p) => p && (String(p.name).toLowerCase().indexOf(want) >= 0 || String(p.niche).toLowerCase() === want));
  if (fuzzy) return findPack(fuzzy.id);
  return null;
}
function slugPack(name) {
  return String(name || "pack").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "pack";
}
function safeThen(then) {
  if (then === "stop" || then === "wait" || then === "note" || then === "cap") return then === "cap" ? "wait" : then;
  return "wait";
}
function safeRules(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 8).map((r) => {
    if (!r) return null;
    const text = String(r.text || r || "").trim().slice(0, 240);
    if (!text) return null;
    const row = { text, when: r.when || "qualify", then: safeThen(r.then), contains: String(r.contains || "").slice(0, 80) };
    if (DANGER.test(text) && row.then !== "stop") row.then = "wait";
    return row;
  }).filter(Boolean);
}
function listPack(row, body, person) {
  const name = String(body.name || "").trim().slice(0, 48);
  if (!name) return { ok: false, status: 400, error: "Name the pack." };
  const ask = Number(body.ask || body.price || 0) || 0;
  const id = slugPack(body.id || name);
  if (findPack(id) && OFFICIAL.some((p) => p.id === id)) return { ok: false, status: 409, error: "That pack name is already listed." };
  if (listedOf().some((p) => p && p.id === id)) return { ok: false, status: 409, error: "That pack name is already listed." };
  const pack = {
    id,
    name,
    family: String(body.family || body.niche || (row && (row.biz || row.name)) || "Desk pack").slice(0, 48),
    niche: String(body.niche || body.family || "").trim().slice(0, 48),
    does: String(body.does || "").trim().slice(0, 180),
    dropHint: String(body.dropHint || body.does || "").trim().slice(0, 180),
    kinds: kindRows(body.kinds || body.kind),
    fields: fieldRows(body.fields || body.fieldList),
    ask: ask > 0 ? ask : 0,
    official: false,
    workspace: row && row.slug,
    listedBy: (person && person.name) || "owner",
    rules: safeRules(body.rules),
    createdAt: new Date().toISOString()
  };
  listedOf().unshift(pack);
  if (row) ensureCreations(row).unshift({ id, name, does: pack.does, dropHint: pack.dropHint, share: ask > 0 ? "market" : "listed", price: pack.ask, niche: pack.niche, family: pack.family, kinds: pack.kinds, fields: pack.fields, rules: pack.rules, createdAt: pack.createdAt });
  return { ok: true, charged: false, pack: publicPack(pack), note: pack.ask ? "Ask is a tag. No card charged. Drop can still preview this pack." : "Listed. Free to use on Drop and on a desk." };
}
function usePack(row, body, person) {
  const pack = findPack(body.id || body.pack);
  if (!pack) return { ok: false, status: 404, error: "No pack with that name." };
  const preview = body.preview === true || body.preview === "1" || String(body.action || "").indexOf("preview") === 0;
  if (Number(pack.ask || pack.price || 0) > 0 && !preview) {
    return { ok: false, status: 409, preview: true, charged: false, pack: publicPack(pack), error: "That pack has an ask. Tag only. No card. Preview it, or list your own." };
  }
  const added = [];
  (Array.isArray(pack.rules) ? pack.rules : []).forEach((r) => {
    const out = addWorkspaceRule(row, { text: r.text, when: r.when || "qualify", then: safeThen(r.then), contains: r.contains || "", ifMoney: r.ifMoney, source: "pack:" + pack.id }, person);
    if (out && out.ok) added.push(out.rule);
  });
  if (pack.fields && pack.fields.length && row) {
    row.fields = Array.isArray(row.fields) ? row.fields : [];
    fieldRows(pack.fields).forEach((f) => {
      if (!f || !f.key) return;
      if (!row.fields.some((have) => have && have.key === f.key)) row.fields.push(f);
    });
  }
  row.model = pack.name || row.model;
  row.packId = pack.id;
  return { ok: true, preview: !!preview, charged: false, pack: publicPack(pack), added: added.length, rules: ensureRules(row), note: preview ? "Preview is on this desk. Ask was not charged. Packs do not send money." : "Pack rules and fields are on this desk. Packs do not send money. You still tap Yes or No." };
}
function unlistPack(row, body) {
  const id = String(body.id || body.pack || "").toLowerCase();
  if (!id) return { ok: false, status: 400, error: "Name the pack to unlist." };
  if (["home", "consign", "vita", "fund", "land"].indexOf(id) >= 0) return { ok: false, status: 403, error: "Official packs stay listed." };
  if (!Array.isArray(mem.listedPacks)) mem.listedPacks = [];
  const before = mem.listedPacks.length;
  mem.listedPacks = mem.listedPacks.filter((p) => {
    if (!p || String(p.id).toLowerCase() !== id) return true;
    if (p.workspace && row && p.workspace !== row.slug) return true;
    return false;
  });
  if (row) (row.creations || []).forEach((c) => { if (c && String(c.id).toLowerCase() === id) c.share = "private"; });
  if (mem.listedPacks.length === before && !(row && (row.creations || []).some((c) => c && String(c.id).toLowerCase() === id))) {
    return { ok: false, status: 404, error: "No listed pack with that name on this desk." };
  }
  return { ok: true, charged: false, note: "Pack is private again. Search will not show it." };
}
function dropPack(body, q) {
  const id = (body && (body.id || body.pack)) || (q && (q.id || q.pack));
  if (id) {
    const pack = findPack(id);
    if (!pack) return { ok: false, status: 404, error: "No pack with that name." };
    if (Number(pack.ask || pack.price || 0) > 0) {
      return { ok: true, status: 200, preview: true, charged: false, drop: true, pack: dropShape(pack), note: "Ask is a tag. This drop can use the fields. No card. Rules stay off the desk until an owner previews or uses the pack." };
    }
    return { ok: true, charged: false, drop: true, pack: dropShape(pack), note: "Use these fields on this drop. Packs do not send money." };
  }
  return { ok: true, charged: false, drop: true, q: String((body && (body.q || body.query)) || (q && q.q) || "").slice(0, 80), packs: searchPacks((body && (body.q || body.query)) || (q && q.q), body || q || {}) };
}

async function handler(req, res) {
  const { cors, ready, readBody, workspaceOf, personOf, isOwner, save } = require("./_lib");
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();
  const q = req.query || {};
  if (req.method === "GET") {
    const term = q.q != null ? q.q : (q.search != null ? q.search : "");
    if (q.drop === "1" || q.id || q.pack) {
      const out = dropPack({ id: q.id || q.pack, q: term }, q);
      if (!out.ok) return res.status(out.status || 400).json(out);
      return res.status(200).json(out);
    }
    return res.status(200).json({ ok: true, listed: true, charged: false, q: String(term || "").slice(0, 80), packs: searchPacks(term, { market: q.market === "1", official: q.official === "1", free: q.free === "1", listed: q.listed === "1", family: q.family || q.pack || q.niche }) });
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use GET or POST." });
  const body = req.body && typeof req.body === "object" ? req.body : await readBody(req);
  const action = String(body.action || "packs").toLowerCase();
  if (action === "packs" || action === "pack-search" || action === "marketplace" || action === "search" || action === "drop-pack" || action === "pack-for-drop") {
    if (action === "drop-pack" || action === "pack-for-drop" || body.drop === true) {
      const out = dropPack(body, q);
      if (!out.ok) return res.status(out.status || 400).json(out);
      return res.status(200).json(out);
    }
    return res.status(200).json({ ok: true, listed: true, charged: false, q: String(body.q || body.query || body.name || "").slice(0, 80), packs: searchPacks(body.q || body.query || body.name, { market: body.market, official: body.official, free: body.free, listed: body.listed, family: body.family || body.pack || body.niche }) });
  }
  const slug = workspaceOf(req) || body.slug || body.workspace;
  const { workspace: row, person } = personOf(req, slug);
  if (!row) return res.status(404).json({ ok: false, error: "Open a desk first." });
  if (!person) return res.status(401).json({ ok: false, error: "Desk code required." });
  if (!isOwner(person)) return res.status(403).json({ ok: false, error: "Only the owner can list or use a pack." });
  if (action === "unlist" || action === "unlist-pack") {
    const out = unlistPack(row, body);
    if (!out.ok) return res.status(out.status || 400).json(out);
    await save();
    return res.status(200).json(out);
  }
  if (action === "list" || action === "list-pack" || action === "publish-pack") {
    const out = listPack(row, body, person);
    if (!out.ok) return res.status(out.status || 400).json(out);
    await save();
    return res.status(201).json(out);
  }
  if (action === "use" || action === "use-pack" || action === "install-pack" || action === "preview" || action === "preview-pack") {
    const out = usePack(row, Object.assign({}, body, { preview: action.indexOf("preview") === 0 || body.preview, action }), person);
    if (!out.ok) return res.status(out.status || 400).json(out);
    await save();
    return res.status(200).json(out);
  }
  if (action === "buy" || action === "checkout" || action === "install-paid") {
    return res.status(409).json({ ok: false, preview: true, charged: false, error: "Priced packs stay a tag. No card. Preview it instead." });
  }
  return res.status(400).json({ ok: false, error: "action must be packs, drop-pack, list-pack, unlist-pack, use-pack, or preview-pack" });
}

module.exports = handler;
module.exports.searchPacks = searchPacks;
module.exports.listPack = listPack;
module.exports.unlistPack = unlistPack;
module.exports.usePack = usePack;
module.exports.findPack = findPack;
module.exports.publicPack = publicPack;
module.exports.dropPack = dropPack;
module.exports.catalog = catalog;

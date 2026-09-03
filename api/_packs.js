const { mem, addWorkspaceRule, ensureRules } = require("./_lib");
const { ensureCreations } = require("./_fields");

const OFFICIAL = [
  {
    id: "home",
    name: "Home & family",
    family: "Automate It Away",
    does: "School form, same-day chore, bill due. Cap same-day.",
    ask: 0,
    rules: [
      { text: "Cap same-day cards.", when: "qualify", then: "wait", contains: "same-day" },
      { text: "Ask me if a kid or school is named.", when: "qualify", then: "wait", contains: "school" }
    ]
  },
  {
    id: "consign",
    name: "Consignment & resale",
    family: "Consign It Away",
    does: "Photo in. Comps. Draft a title. Wait on payout.",
    ask: 0,
    rules: [
      { text: "Cap title-missing items.", when: "qualify", then: "wait", contains: "title" },
      { text: "Wait on me before a payout leaves.", when: "collect", then: "wait" }
    ]
  },
  {
    id: "vita",
    name: "Insurance",
    family: "Quote It Away",
    does: "Need in. Draft a packet. Stop on an illustration send.",
    ask: 0,
    rules: [
      { text: "Cap this-week cards.", when: "qualify", then: "wait", contains: "this week" },
      { text: "Stop if this is an illustration.", when: "do", then: "stop", contains: "illustration" }
    ]
  },
  {
    id: "fund",
    name: "Fund raise",
    family: "Fund It Away",
    does: "Campaign note in. Draft the page. Wait on a credit call.",
    ask: 0,
    rules: [
      { text: "Wait on me before a credit decision.", when: "collect", then: "wait", contains: "credit" }
    ]
  },
  {
    id: "land",
    name: "Land lot",
    family: "Tony Oddo land",
    does: "Lot interest in. Cap flood. Cap title.",
    ask: 0,
    rules: [
      { text: "Cap flood cards.", when: "qualify", then: "wait", contains: "flood" },
      { text: "Cap title cards.", when: "qualify", then: "wait", contains: "title" }
    ]
  }
];

function listedOf() {
  if (!Array.isArray(mem.listedPacks)) mem.listedPacks = [];
  return mem.listedPacks;
}

function publicPack(p, extra) {
  if (!p) return null;
  const ask = Number(p.ask || p.price || 0) || 0;
  return Object.assign({
    id: p.id,
    name: p.name,
    family: p.family || "",
    does: p.does || "",
    free: ask <= 0,
    ask: ask > 0 ? ask : 0,
    priced: ask > 0,
    official: !!p.official,
    rules: Array.isArray(p.rules) ? p.rules.length : 0
  }, extra || {});
}

function catalog() {
  const official = OFFICIAL.map((p) => publicPack(Object.assign({ official: true }, p)));
  const listed = listedOf().map((p) => publicPack(p)).filter(Boolean);
  (mem.workspaces || []).forEach((ws) => {
    ensureCreations(ws).forEach((c) => {
      if (!c || c.share === "private" || !c.share) return;
      if (listed.some((row) => row && row.id === c.id)) return;
      listed.push(publicPack({
        id: c.id,
        name: c.name,
        family: c.family || ws.biz || ws.name || "Desk pack",
        does: c.does,
        ask: c.price || c.ask || 0,
        official: false,
        rules: c.rules
      }));
    });
  });
  return official.concat(listed);
}

function searchPacks(q, filters) {
  const needle = String(q || "").toLowerCase().trim();
  const wantOfficial = !!(filters && (filters.official === true || filters.official === "1"));
  const wantFree = !!(filters && (filters.free === true || filters.free === "1"));
  const family = String((filters && (filters.family || filters.pack)) || "").toLowerCase();
  return catalog().filter((p) => {
    if (wantOfficial && !p.official) return false;
    if (wantFree && p.priced) return false;
    if (family && String(p.family || "").toLowerCase().indexOf(family) < 0 && String(p.id) !== family) return false;
    if (!needle) return true;
    return [p.id, p.name, p.family, p.does].join(" ").toLowerCase().indexOf(needle) >= 0;
  });
}

function findPack(id) {
  const want = String(id || "").toLowerCase();
  const official = OFFICIAL.find((p) => p.id === want);
  if (official) return Object.assign({ official: true }, official);
  const listed = listedOf().find((p) => p && String(p.id).toLowerCase() === want);
  if (listed) return listed;
  for (const ws of mem.workspaces || []) {
    const hit = ensureCreations(ws).find((c) => c && String(c.id).toLowerCase() === want);
    if (hit) return Object.assign({ official: false, ask: hit.price || hit.ask || 0 }, hit);
  }
  return null;
}

function slugPack(name) {
  return String(name || "pack").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "pack";
}

function listPack(row, body, person) {
  const name = String(body.name || "").trim().slice(0, 48);
  if (!name) return { ok: false, status: 400, error: "Name the pack." };
  const ask = Number(body.ask || body.price || 0) || 0;
  const id = slugPack(body.id || name);
  if (findPack(id)) return { ok: false, status: 409, error: "That pack name is already listed." };
  const pack = {
    id,
    name,
    family: String(body.family || (row && (row.biz || row.name)) || "Desk pack").slice(0, 48),
    does: String(body.does || "").trim().slice(0, 180),
    ask: ask > 0 ? ask : 0,
    official: false,
    workspace: row && row.slug,
    listedBy: (person && person.name) || "owner",
    rules: Array.isArray(body.rules) ? body.rules.slice(0, 8) : [],
    createdAt: new Date().toISOString()
  };
  listedOf().unshift(pack);
  if (row) {
    const creations = ensureCreations(row);
    creations.unshift({
      id,
      name,
      does: pack.does,
      share: ask > 0 ? "market" : "listed",
      price: pack.ask,
      rules: pack.rules,
      createdAt: pack.createdAt
    });
  }
  return {
    ok: true,
    pack: publicPack(pack),
    note: pack.ask ? "Ask is a tag. No card charged." : "Listed. Free to use."
  };
}

function safeThen(then) {
  if (then === "stop" || then === "wait" || then === "note") return then;
  return "wait";
}

function usePack(row, body, person) {
  const pack = findPack(body.id || body.pack);
  if (!pack) return { ok: false, status: 404, error: "No pack with that name." };
  const preview = body.preview === true || body.preview === "1" || body.action === "preview" || body.action === "preview-pack";
  if (Number(pack.ask || pack.price || 0) > 0 && !preview) {
    return {
      ok: false,
      status: 409,
      preview: true,
      charged: false,
      pack: publicPack(pack),
      error: "That pack has an ask. Tag only. No card. Preview it, or list your own."
    };
  }
  const rules = Array.isArray(pack.rules) ? pack.rules : [];
  const added = [];
  rules.forEach((r) => {
    const out = addWorkspaceRule(row, {
      text: r.text,
      when: r.when || "qualify",
      then: safeThen(r.then),
      contains: r.contains || "",
      ifMoney: r.ifMoney,
      source: "pack:" + pack.id
    }, person);
    if (out && out.ok) added.push(out.rule);
  });
  row.model = pack.name || row.model;
  row.packId = pack.id;
  return {
    ok: true,
    preview: !!preview,
    charged: false,
    pack: publicPack(pack),
    added: added.length,
    rules: ensureRules(row),
    note: preview
      ? "Preview is on this desk. Ask was not charged. Packs do not send money."
      : "Pack rules are on this desk. Packs do not send money. You still tap Yes or No."
  };
}

module.exports = { searchPacks, listPack, usePack, findPack, publicPack, catalog };

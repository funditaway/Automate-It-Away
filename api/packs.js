const { cors, mem, log, save, ready, workspaceOf, readBody, personOf, isOwner, addWorkspaceRule, ensureRules } = require("./_lib");

const OFFICIAL = [
  {
    id: "home",
    name: "Home & family",
    family: "Automate It Away",
    does: "School form, same-day chore, bill due. Cap same-day. Wait if a kid or school is named.",
    free: true,
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
    free: true,
    ask: 0,
    rules: [
      { text: "Cap title-missing items.", when: "qualify", then: "wait", contains: "title" },
      { text: "Wait on me before a payout leaves.", when: "collect", then: "wait" }
    ]
  },
  {
    id: "vita",
    name: "Insurance desk",
    family: "Quote It Away",
    does: "Need in. Draft a packet. Stop on an illustration send.",
    free: true,
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
    free: true,
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
    free: true,
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

function publicPack(p) {
  if (!p) return null;
  const ask = Number(p.ask || 0) || 0;
  return {
    id: p.id,
    name: p.name,
    family: p.family || "",
    does: p.does || "",
    free: ask <= 0,
    ask: ask > 0 ? ask : 0,
    priced: ask > 0,
    official: !!p.official,
    rules: Array.isArray(p.rules) ? p.rules.length : 0
  };
}

function catalog() {
  const official = OFFICIAL.map((p) => Object.assign({ official: true }, publicPack(p), { rules: p.rules.length }));
  const listed = listedOf().map((p) => publicPack(p)).filter(Boolean);
  return official.concat(listed);
}

function matchPack(q) {
  const needle = String(q || "").toLowerCase().trim();
  const rows = catalog();
  if (!needle) return rows;
  return rows.filter((p) => {
    const blob = [p.id, p.name, p.family, p.does].join(" ").toLowerCase();
    return blob.indexOf(needle) >= 0;
  });
}

function findPack(id) {
  const want = String(id || "").toLowerCase();
  const official = OFFICIAL.find((p) => p.id === want);
  if (official) return Object.assign({ official: true }, official);
  return listedOf().find((p) => p && String(p.id).toLowerCase() === want) || null;
}

function safeThen(then) {
  if (then === "stop" || then === "wait" || then === "note") return then;
  return "wait";
}

function useOnDesk(row, pack, person) {
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
  return { added, rules: ensureRules(row) };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();

  const workspace = workspaceOf(req);
  const { workspace: row, person } = personOf(req, workspace);
  const q = (req.query && (req.query.q || req.query.search)) || "";

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      workspace: workspace || "",
      you: person ? { name: person.name, role: person.role } : null,
      packs: matchPack(q),
      official: OFFICIAL.map((p) => p.id),
      note: "Official packs are free. A priced listing is a tag. No card. Packs do not send money."
    });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const action = body.action || "use";

    if (action === "buy" || action === "install-paid" || action === "checkout") {
      return res.status(409).json({
        ok: false,
        preview: true,
        error: "Priced packs stay a tag. No card. No checkout on this desk."
      });
    }

    if (action === "list") {
      if (!row) return res.status(404).json({ ok: false, error: "Open a desk first so the listing has a home." });
      if (!isOwner(person)) return res.status(403).json({ ok: false, error: "Only the owner can list a pack." });
      const name = String(body.name || "").trim().slice(0, 48);
      if (!name) return res.status(400).json({ ok: false, error: "Name the pack." });
      const ask = Number(body.ask || 0) || 0;
      const id = String(body.id || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      if (findPack(id)) return res.status(409).json({ ok: false, error: "That pack name is already listed." });
      const pack = {
        id,
        name,
        family: String(body.family || row.biz || row.name || "Desk pack").slice(0, 48),
        does: String(body.does || "").trim().slice(0, 180),
        ask: ask > 0 ? ask : 0,
        free: !(ask > 0),
        official: false,
        workspace,
        listedBy: (person && person.name) || "owner",
        rules: Array.isArray(body.rules) ? body.rules.slice(0, 8) : [],
        createdAt: new Date().toISOString()
      };
      listedOf().unshift(pack);
      log("Desk", "Listed pack · " + pack.name + (pack.ask ? " · ask $" + pack.ask : ""), "OK", workspace);
      await save();
      return res.status(201).json({
        ok: true,
        pack: publicPack(pack),
        note: pack.ask ? "Ask is a tag. No card charged." : "Listed. Free to use."
      });
    }

    if (action === "use") {
      if (!row) return res.status(404).json({ ok: false, error: "Open a desk first." });
      if (!isOwner(person)) return res.status(403).json({ ok: false, error: "Only the owner can put a pack on this desk." });
      const pack = findPack(body.id || body.pack);
      if (!pack) return res.status(404).json({ ok: false, error: "No pack with that name." });
      if (Number(pack.ask || 0) > 0) {
        return res.status(409).json({
          ok: false,
          preview: true,
          pack: publicPack(pack),
          error: "That pack has an ask. Tag only. No card. Use a free official pack, or list your own."
        });
      }
      const used = useOnDesk(row, pack, person);
      log("Desk", "Used pack · " + pack.name, "OK", workspace);
      await save();
      return res.status(200).json({
        ok: true,
        pack: publicPack(pack),
        added: used.added.length,
        rules: used.rules,
        note: "Pack rules are on this desk. Packs do not send money. You still tap Yes or No."
      });
    }

    return res.status(400).json({ error: "action must be use, list, or buy" });
  }

  return res.status(405).json({ error: "Use GET or POST" });
};

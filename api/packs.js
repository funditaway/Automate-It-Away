const fs = require("fs");
const path = require("path");
const lib = require("./_lib");
const { cors, mem, ready, save, readBody, workspaceOf, personOf, isOwner } = lib;

const PACK_DIR = path.join(__dirname, "..", "packs");

function officialPacks() {
  try {
    return fs.readdirSync(PACK_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const raw = JSON.parse(fs.readFileSync(path.join(PACK_DIR, f), "utf8"));
        const id = raw.id || f.replace(/\.json$/, "");
        const ask = Number(raw.ask || raw.price || 0) || 0;
        return Object.assign({}, raw, { id, ask, free: ask <= 0, official: true });
      });
  } catch (e) {
    return [];
  }
}

function listedPacks() {
  return (mem.listedPacks || []).slice();
}

function publicPack(p) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name || p.id,
    family: p.family || "",
    does: p.does || "",
    ask: Number(p.ask || 0) || 0,
    free: !(Number(p.ask || 0) > 0),
    official: !!p.official,
    rules: Array.isArray(p.rules) ? p.rules.length : 0
  };
}

function findPack(id) {
  const want = String(id || "").toLowerCase();
  return officialPacks().concat(listedPacks()).find((p) => p && String(p.id).toLowerCase() === want) || null;
}

async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();

  const body = req.body && typeof req.body === "object" ? req.body : (req.method === "POST" ? await readBody(req) : {});
  const q = req.query || {};
  const action = String(body.action || q.action || (req.method === "GET" ? "list" : "")).toLowerCase()
    .replace("use-pack", "use")
    .replace("install-pack", "use")
    .replace("preview-pack", "preview")
    .replace("list-pack", "publish")
    .replace("pack-search", "search")
    .replace("marketplace", "list");

  if (req.method === "GET" || action === "list" || action === "search" || action === "packs") {
    const qtext = String(body.q || body.query || q.q || "").toLowerCase();
    let packs = officialPacks().concat(listedPacks()).map(publicPack).filter(Boolean);
    if (qtext) packs = packs.filter((p) => [p.id, p.name, p.family, p.does].join(" ").toLowerCase().indexOf(qtext) >= 0);
    return res.status(200).json({ ok: true, packs });
  }

  const slug = workspaceOf(req);
  const found = personOf(req, slug);

  if (action === "preview") {
    const pack = findPack(body.id || body.pack);
    if (!pack) return res.status(404).json({ ok: false, error: "No pack with that name." });
    return res.status(200).json({
      ok: true,
      preview: true,
      pack: publicPack(pack),
      note: "Preview only. Packs do not send money."
    });
  }

  if (action === "use") {
    if (!found.workspace || !found.person) return res.status(401).json({ ok: false, error: "Open the desk first." });
    if (!isOwner(found.person)) return res.status(403).json({ ok: false, error: "Only the owner can put a pack on this desk." });
    const pack = findPack(body.id || body.pack);
    if (!pack) return res.status(404).json({ ok: false, error: "No pack with that name." });
    if (Number(pack.ask || 0) > 0) {
      return res.status(409).json({ ok: false, hold: true, error: "Priced pack. Ask is a tag. No card. Preview it instead." });
    }
    const row = found.workspace;
    row.pack = pack.id;
    row.rules = lib.ensureRules(row);
    let added = 0;
    (pack.rules || []).forEach((rule) => {
      const text = (rule && (rule.text || rule)) || "";
      if (!text) return;
      if ((row.rules || []).some((r) => r && r.text === text)) return;
      row.rules.push(Object.assign({ id: "rule_" + Date.now() + "_" + added, source: "pack:" + pack.id }, typeof rule === "object" ? rule : { text }));
      added += 1;
    });
    await save();
    return res.status(200).json({ ok: true, pack: pack.id, added, note: "Pack is on this desk. Packs do not send money." });
  }

  if (action === "publish") {
    if (!found.workspace || !isOwner(found.person)) {
      return res.status(403).json({ ok: false, error: "Owner desk code required to list a pack." });
    }
    const name = String(body.name || "").trim();
    if (!name) return res.status(400).json({ ok: false, error: "Name the pack to list." });
    const id = lib.slugify(name);
    mem.listedPacks = mem.listedPacks || [];
    mem.listedPacks.push({
      id,
      name,
      does: String(body.does || "").slice(0, 240),
      ask: Number(body.ask || 0) || 0,
      official: false,
      listedBy: found.workspace.slug
    });
    await save();
    return res.status(200).json({ ok: true, id, note: "Pack is listed. Ask is a tag. No card." });
  }

  if (action === "unlist-pack" || action === "unlist") {
    if (!found.workspace || !isOwner(found.person)) return res.status(403).json({ ok: false, error: "Owner only." });
    const id = String(body.id || "").toLowerCase();
    mem.listedPacks = (mem.listedPacks || []).filter((p) => p && String(p.id).toLowerCase() !== id);
    await save();
    return res.status(200).json({ ok: true, note: "Pack unlisted." });
  }

  return res.status(400).json({ ok: false, error: "Unknown pack action." });
}

module.exports = handler;

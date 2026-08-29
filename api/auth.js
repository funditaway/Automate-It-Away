const {
  cors, mem, log, save, ready, slugify, hashPin, workspaceOf, readBody,
  ensurePeople, publicPerson, personOf, isOwner, ensureRules, ensureNouns, setWorkspaceNouns
} = require("./_lib");

function publicWorkspace(row) {
  return {
    slug: row.slug,
    name: row.name,
    biz: row.biz,
    city: row.city,
    model: row.model,
    people: (row.people || []).map(publicPerson),
    rules: ensureRules(row),
    nouns: ensureNouns(row)
  };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();

  if (req.method === "GET") {
    const workspace = workspaceOf(req);
    const { workspace: row, person } = personOf(req, workspace);
    if (!row) return res.status(404).json({ ok: false, error: "No workspace" });
    if (req.headers["x-pin"] && !person) {
      return res.status(401).json({ ok: false, error: "Bad pin" });
    }
    const first = !Array.isArray(row.rules) || !row.nouns || typeof row.nouns !== "object";
    const body = {
      ok: true,
      workspace: publicWorkspace(row),
      you: publicPerson(person)
    };
    if (first) await save();
    return res.status(200).json(body);
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const action = body.action || "open";

    if (action === "login") {
      const slug = slugify(body.workspace || body.slug || body.biz);
      const { workspace: row, person } = personOf(
        { headers: { "x-workspace": slug, "x-pin": body.pin || "" } },
        slug
      );
      if (!row || !person) {
        return res.status(401).json({ ok: false, error: "Desk name or desk code does not match" });
      }
      log("Auth", person.role + " signed in · " + person.name, "OK", slug);
      await save();
      return res.status(200).json({
        ok: true,
        workspace: publicWorkspace(row),
        you: publicPerson(person)
      });
    }

    if (action === "invite") {
      const slug = workspaceOf(req);
      const { workspace: row, person } = personOf(req, slug);
      if (!row) return res.status(404).json({ error: "No workspace" });
      if (!isOwner(person)) {
        return res.status(403).json({ error: "Owner desk code required to add people." });
      }
      const name = String(body.name || "").trim();
      const pin = String(body.pin || "");
      const role = body.role === "owner" ? "owner" : "employee";
      if (!name || pin.length < 4) {
        return res.status(400).json({ error: "Name and a 4+ digit desk code required." });
      }
      const hashed = hashPin(pin);
      if ((row.people || []).some((p) => p.pin === hashed) || row.pin === hashed) {
        return res.status(409).json({ error: "That desk code is already on this desk." });
      }
      const seat = {
        id: "p_" + Date.now().toString(36),
        name,
        role,
        email: body.email || "",
        pin: hashed,
        createdAt: new Date().toISOString()
      };
      row.people.push(seat);
      log("Auth", "Invited " + role + " · " + name, "OK", slug);
      await save();
      return res.status(201).json({ ok: true, person: publicPerson(seat), workspace: publicWorkspace(row) });
    }

    if (action === "remove") {
      const slug = workspaceOf(req);
      const { workspace: row, person } = personOf(req, slug);
      if (!isOwner(person)) return res.status(403).json({ error: "Owner desk code required." });
      const id = body.id;
      const target = (row.people || []).find((p) => p.id === id);
      if (!target) return res.status(404).json({ error: "Person not found" });
      if (target.role === "owner" && row.people.filter((p) => p.role === "owner").length < 2) {
        return res.status(409).json({ error: "Keep at least one owner." });
      }
      row.people = row.people.filter((p) => p.id !== id);
      log("Auth", "Removed · " + target.name, "OK", slug);
      await save();
      return res.status(200).json({ ok: true, workspace: publicWorkspace(row) });
    }

    if (action === "nouns") {
      const slug = workspaceOf(req);
      const { workspace: row, person } = personOf(req, slug);
      if (!row) return res.status(404).json({ ok: false, error: "Open a desk first so the words have a home." });
      if (!isOwner(person)) {
        return res.status(403).json({ ok: false, error: "Only the owner can name the steps." });
      }
      const set = setWorkspaceNouns(row, body.nouns || body);
      if (!set.ok) return res.status(400).json(set);
      log("Desk", "Nouns · " + slug, "OK", slug);
      await save();
      return res.status(200).json({ ok: true, nouns: set.nouns, workspace: publicWorkspace(row) });
    }

    const slug = slugify(body.slug || body.biz || body.name || "demo");
    if (!body.pin || String(body.pin).length < 4) {
      return res.status(400).json({ error: "Pick a desk code with at least 4 digits." });
    }
    let row = mem.workspaces.find((w) => w.slug === slug);
    if (!row) {
      row = {
        slug,
        name: body.name || "Owner",
        biz: body.biz || slug,
        city: body.city || "",
        model: body.model || "Consignment & resale",
        email: body.email || "",
        pin: hashPin(body.pin),
        createdAt: new Date().toISOString(),
        people: []
      };
      ensurePeople(row);
      ensureRules(row);
      ensureNouns(row);
      if (body.nouns) setWorkspaceNouns(row, body.nouns);
      row.people[0].name = body.name || "Owner";
      row.people[0].email = body.email || "";
      mem.workspaces.unshift(row);
      log("Auth", "Opened desk · " + slug, "OK", slug);
      await save();
    } else {
      ensurePeople(row);
      const hashed = hashPin(body.pin);
      const match = row.people.find((p) => p.pin === hashed) || (row.pin === hashed ? row.people[0] : null);
      if (!match) return res.status(401).json({ ok: false, error: "Desk code does not match this desk" });
    }
    return res.status(201).json({
      ok: true,
      workspace: publicWorkspace(row),
      you: publicPerson((row.people || []).find((p) => p.role === "owner")),
      hint: "Desk name + desk code opens this queue on any phone."
    });
  }

  return res.status(405).json({ error: "Use GET or POST" });
};

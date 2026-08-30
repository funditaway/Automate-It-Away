const {
  cors, mem, log, save, ready, slugify, hashPin, workspaceOf, readBody,
  ensurePeople, publicPerson, personOf, isOwner, ensureNouns, setWorkspaceNouns, ensureRules
} = require("./_lib");
const { ensureFields, applyFieldList, ensureCreations, publicCreation, addCreation } = require("./fields");
const { qualifyJob } = require("./engine");

function publicWorkspace(row) {
  return {
    slug: row.slug,
    name: row.name,
    biz: row.biz,
    city: row.city,
    model: row.model,
    does: row.does || "",
    people: (row.people || []).map(publicPerson),
    nouns: ensureNouns(row),
    rules: ensureRules(row),
    fields: ensureFields(row),
    creations: ensureCreations(row).map(publicCreation).filter(Boolean)
  };
}

function applyCustomOpen(row, body) {
  const modelPick = String(body.model || "").trim();
  const customName = String(body.customName || body.creation || "").trim();
  const does = String(body.does || "").trim().slice(0, 160);
  if (does) row.does = does;
  if (customName && (/something else|custom|other/i.test(modelPick) || !modelPick)) {
    row.model = customName;
  } else if (customName && modelPick === customName) {
    row.model = customName;
  }
  if (customName || does) {
    addCreation(row, { kind: "model", name: row.model || customName, does: does || body.does });
  }
  if (body.fields || body.fieldList) applyFieldList(row, body.fields || body.fieldList);
  return row;
}

function firstJobFrom(row, body, workspace) {
  const text = String(body.firstWork || body.work || "").trim();
  if (!text) return null;
  const job = {
    id: "job_" + Date.now().toString(36),
    workspace,
    title: text.slice(0, 80),
    notes: text,
    why: "From opening the desk. Human before send.",
    status: "exception",
    step: "Qualify",
    createdAt: new Date().toISOString(),
    log: ["Captured on open"],
    from: "onboard",
    pack: /home|family/i.test(row.model || "") ? "home" : undefined
  };
  qualifyJob(job, row);
  mem.jobs.unshift(job);
  return job;
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
    return res.status(200).json({
      ok: true,
      workspace: publicWorkspace(row),
      you: publicPerson(person)
    });
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
        return res.status(401).json({ ok: false, error: "Shop name or desk code does not match" });
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
        return res.status(409).json({ error: "That desk code is already on this shop." });
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

    if (action === "nouns") {
      const slug = workspaceOf(req);
      const { workspace: row, person } = personOf(req, slug);
      if (!row) return res.status(404).json({ ok: false, error: "Open a desk first so the words have a home." });
      if (!isOwner(person)) {
        return res.status(403).json({ ok: false, error: "Only the owner can change step words." });
      }
      const saved = setWorkspaceNouns(row, body.nouns);
      if (!saved.ok) return res.status(400).json(saved);
      log("Desk", "Nouns saved", "OK", slug);
      await save();
      return res.status(200).json({ ok: true, nouns: saved.nouns, workspace: publicWorkspace(row) });
    }

    if (action === "create") {
      const slug = workspaceOf(req);
      const { workspace: row, person } = personOf(req, slug);
      if (!row) return res.status(404).json({ ok: false, error: "Open a desk first so this has a home." });
      if (!isOwner(person)) {
        return res.status(403).json({ ok: false, error: "Only the owner can add a custom creation." });
      }
      const made = addCreation(row, body);
      if (!made.ok) return res.status(400).json(made);
      log("Desk", "Creation · " + made.creation.name, "OK", slug);
      await save();
      return res.status(201).json({
        ok: true,
        creation: made.creation,
        creations: made.creations,
        fields: made.fields,
        workspace: publicWorkspace(row)
      });
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
      row.people[0].name = body.name || "Owner";
      row.people[0].email = body.email || "";
      applyCustomOpen(row, body);
      mem.workspaces.unshift(row);
      const first = firstJobFrom(row, body, slug);
      log("Auth", "Opened shop · " + slug, "OK", slug);
      await save();
      return res.status(201).json({
        ok: true,
        workspace: publicWorkspace(row),
        you: publicPerson((row.people || []).find((p) => p.role === "owner")),
        job: first,
        hint: "Shop name + desk code opens this queue on any phone."
      });
    } else {
      ensurePeople(row);
      const hashed = hashPin(body.pin);
      const match = row.people.find((p) => p.pin === hashed) || (row.pin === hashed ? row.people[0] : null);
      if (!match) return res.status(401).json({ ok: false, error: "Desk code does not match this shop" });
    }
    return res.status(201).json({
      ok: true,
      workspace: publicWorkspace(row),
      you: publicPerson((row.people || []).find((p) => p.role === "owner")),
      hint: "Shop name + desk code opens this queue on any phone."
    });
  }

  return res.status(405).json({ error: "Use GET or POST" });
};

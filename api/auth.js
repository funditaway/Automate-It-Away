const {
  cors, mem, log, save, ready, slugify, hashPin, workspaceOf, readBody,
  ensurePeople, publicPerson, personOf, isOwner, ensureNouns, setWorkspaceNouns, ensureRules
} = require("./_lib");
const { ensureFields, applyFieldList, ensureCreations, publicCreation, addCreation } = require("./_fields");
const { qualifyJob } = require("./_engine");
const { inviteSeat, requestSeat, setSeatStatus, ensureAccount, createOwnerAccount, publicPlan,
  loginWithEmail, looksLikeEmail, emailTaken, emailOf, applyAccountDetails, setAccountPassword, passwordOk, homeAccount, accountForDesk, passwordMatches
} = require("./_account");
const libx = require("./_lib");

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

    if (action === "account" || action === "register") {
      const slug = slugify(body.slug || body.biz || body.name || "demo");
      if (!body.pin || String(body.pin).length < 4) {
        return res.status(400).json({ ok: false, error: "Pick a desk code with at least 4 digits." });
      }
      let exists = mem.workspaces.find((w) => w && w.slug === slug);
      if (exists) {
        return res.status(409).json({
          ok: false,
          error: "That desk name is already open. Sign in with the desk name and code."
        });
      }
    }

    if (action === "join") {
      const slug = slugify(body.workspace || body.slug || body.biz || workspaceOf(req));
      const row = mem.workspaces.find((w) => w && w.slug === slug);
      if (!row) {
        return res.status(404).json({
          ok: false,
          error: "No desk with that name. Ask the owner, or open your own account."
        });
      }
      const kind = String(body.kind || body.role || "member").toLowerCase();
      if (kind === "owner") {
        return res.status(400).json({ ok: false, error: "Owner seats are not a join request." });
      }
      const made = requestSeat(row, Object.assign({}, body, { kind: kind === "employee" ? "helper" : kind }));
      if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
      await save();
      return res.status(202).json({
        ok: true,
        pending: true,
        person: made.person,
        workspace: { slug: row.slug, name: row.biz || row.name || row.slug },
        hint: "On the book as a member. Owner approves on /admin and sets the permission. Then desk name + your code opens the queue."
      });
    }

    if (action === "request") {
      const slug = slugify(body.workspace || body.slug || workspaceOf(req));
      const row = mem.workspaces.find((w) => w && w.slug === slug);
      if (!row) return res.status(404).json({ ok: false, error: "No workspace" });
      const made = requestSeat(row, body);
      if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
      await save();
      return res.status(202).json({ ok: true, pending: true, person: made.person });
    }

    if (action === "approve" || action === "deny") {
      const slug = workspaceOf(req);
      const { workspace: row, person } = personOf(req, slug);
      if (!row) return res.status(404).json({ ok: false, error: "No workspace" });
      if (!isOwner(person)) return res.status(403).json({ ok: false, error: "Owner desk code required." });
      const made = setSeatStatus(row, body.id || body.personId, action === "deny" ? "denied" : "approved", person);
      if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
      await save();
      return res.status(200).json({ ok: true, person: made.person, workspace: publicWorkspace(row) });
    }

    if (action === "password" || action === "set-password") {
      const slug = workspaceOf(req) || slugify(body.workspace || body.slug || body.biz || "");
      const found = personOf(req, slug);
      if (!found.workspace || !found.person) return res.status(401).json({ ok: false, error: "Sign in first." });
      const acc = homeAccount(found.person, found.workspace);
      if (!acc) return res.status(404).json({ ok: false, error: "No AIA account on this login." });
      if (acc.password) {
        const current = String(body.current || body.old || "");
        const viaEmail = current && passwordMatches(acc.password, current);
        const viaPin = current && acc.pin && acc.pin === hashPin(current);
        if (!viaEmail && !viaPin) return res.status(401).json({ ok: false, error: "Current password or desk code does not match." });
      }
      const set = setAccountPassword(acc, body.password || body.next);
      if (!set.ok) return res.status(400).json({ ok: false, error: set.error });
      if (body.email && looksLikeEmail(body.email)) {
        const applied = applyAccountDetails(acc, { email: body.email });
        if (applied && applied.ok === false) return res.status(409).json({ ok: false, error: applied.error });
      }
      await save();
      return res.status(200).json({ ok: true, hasPassword: true, email: acc.email || "", hint: "Email and password can now open this account." });
    }

    if (action === "details" || action === "account-details" || action === "profile") {
      const slug = workspaceOf(req) || slugify(body.workspace || body.slug || "");
      const found = personOf(req, slug);
      if (!found.workspace || !found.person) return res.status(401).json({ ok: false, error: "Sign in first." });
      if (body.name) found.person.name = String(body.name).trim().slice(0, 80);
      const acc = homeAccount(found.person, found.workspace);
      if (acc) {
        const applied = applyAccountDetails(acc, body);
        if (applied && applied.ok === false) return res.status(400).json({ ok: false, error: applied.error });
      }
      await save();
      return res.status(200).json({ ok: true, you: publicPerson(found.person), account: acc ? { id: acc.id, name: acc.name, email: acc.email || "", phone: acc.phone || "", city: acc.city || "", state: acc.state || "", reach: acc.reach || "", hours: acc.hours || "", hasPassword: !!acc.password } : null });
    }

    if (action === "login") {
      const email = String(body.email || "").trim();
      const password = String(body.password || body.pass || "");
      if (looksLikeEmail(email) && password) {
        const via = loginWithEmail(email, password);
        if (!via.ok) return res.status(via.status || 401).json({ ok: false, error: via.error });
        let session = null;
        if (typeof libx.issueSession === "function") session = libx.issueSession(via.person, via.desk, via.account, req);
        if (session && typeof libx.sessionCookie === "function") res.setHeader("Set-Cookie", libx.sessionCookie(session.token));
        await save();
        return res.status(200).json({
          ok: true, savedLogin: true, emailLogin: true, session,
          account: via.account ? { id: via.account.id, name: via.account.name, ownerName: via.account.ownerName, email: via.account.email || "", hasPassword: true, plan: via.account.plan || "pro" } : null,
          plan: via.account ? publicPlan(via.account) : null,
          workspace: via.desk ? publicWorkspace(via.desk) : null,
          you: publicPerson(via.person),
          hint: "Signed in with email and password."
        });
      }

      const slug = slugify(body.workspace || body.slug || body.biz);
      const { workspace: row, person } = personOf(
        { headers: { "x-workspace": slug, "x-pin": body.pin || "" } },
        slug
      );
      if (personOf({ headers: { "x-workspace": slug, "x-pin": body.pin || "" } }, slug).pending) {
        return res.status(403).json({
          ok: false,
          pending: true,
          error: "That seat is waiting on the owner. They approve people on /admin."
        });
      }
      if (!row || !person) {
        return res.status(401).json({ ok: false, error: "Shop name or desk code does not match" });
      }
      log("Auth", person.role + " signed in · " + person.name, "OK", slug);
      let session = null;
      if (typeof libx.issueSession === "function") session = libx.issueSession(person, row, accountForDesk(row), req);
      if (session && typeof libx.sessionCookie === "function") res.setHeader("Set-Cookie", libx.sessionCookie(session.token));
      await save();
      return res.status(200).json({
        ok: true,
        savedLogin: true,
        session,
        workspace: publicWorkspace(row),
        you: publicPerson(person),
        hint: "Desk name + code opened this phone."
      });
    }

    if (action === "invite") {
      const slug = workspaceOf(req);
      const { workspace: row, person } = personOf(req, slug);
      if (!row) return res.status(404).json({ error: "No workspace" });
      if (!isOwner(person)) {
        return res.status(403).json({ error: "Owner desk code required to add people." });
      }
      ensureAccount();
      const made = inviteSeat(row, body, person);
      if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
      await save();
      return res.status(made.status || 201).json({
        ok: true,
        person: made.person,
        pending: !!made.pending,
        workspace: publicWorkspace(row)
      });
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
      const acc = createOwnerAccount(body, row);
      const first = firstJobFrom(row, body, slug);
      log("Auth", "Opened shop · free account · " + slug, "OK", slug);
      await save();
      return res.status(201).json({
        ok: true,
        account: { id: acc.id, name: acc.name, ownerName: acc.ownerName },
        plan: publicPlan(acc),
        workspace: publicWorkspace(row),
        you: publicPerson((row.people || []).find((p) => p.role === "owner")),
        job: first,
        hint: "Full owner account. Free for now. Monthly later. Shop name + desk code opens this queue."
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

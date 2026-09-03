const { cors, ready, save, readBody, workspaceOf, personOf, isOwner } = require("./_lib");
const {
  ensureAccount, accountForDesk, homeAccount, loginAccount, proHome, createOwnerAccount, publicPlan,
  switchPlan, publicPlans, looksLikeEmail
} = require("./_account");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();
  ensureAccount();

  if (req.method === "GET") {
    const slug = workspaceOf(req);
    const found = personOf(req, slug);
    if (found.pending) {
      return res.status(403).json({ ok: false, pending: true, error: "That seat is waiting on the owner." });
    }
    if (found.person) {
      const acc = homeAccount(found.person, found.workspace);
      if (acc) return res.status(200).json(proHome(acc, found.person));
    }
    const pin = (req.headers && req.headers["x-pin"]) || "";
    const via = loginAccount(slug, pin);
    if (via.ok) {
      const owner = via.person || (via.desk && via.desk.people || []).find((p) => p && p.role === "owner") || { name: via.account.ownerName, role: "owner", kind: "owner" };
      return res.status(200).json(proHome(via.account, owner));
    }
    if (!found.workspace || !found.person) {
      return res.status(401).json({ ok: false, error: "Account name, desk code, or email does not match." });
    }
    return res.status(200).json(proHome(accountForDesk(found.workspace), found.person));
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Use GET or POST." });
  }

  const body = await readBody(req);
  const action = String(body.action || "login").toLowerCase();

  if (action === "login" || action === "open" || action === "save") {
    const name = body.account || body.slug || body.biz || body.name || workspaceOf(req);
    const pin = body.pin || (req.headers && req.headers["x-pin"]) || "";
    const extra = {
      email: body.email || (looksLikeEmail(name) ? name : ""),
      password: body.password || body.pass || ""
    };
    const via = loginAccount(name, pin, extra);
    if (!via.ok) return res.status(via.status || 401).json({ ok: false, pending: !!via.pending, error: via.error });
    const who = via.person || (via.desk && via.desk.people || []).find((p) => p && p.role === "owner") || {
      name: via.account.ownerName, role: "owner", kind: "owner"
    };
    const lib = require("./_lib");
    const session = typeof lib.issueSession === "function" ? lib.issueSession(who, via.desk, via.account) : null;
    await save();
    const home = proHome(via.account, who);
    return res.status(200).json(Object.assign({ savedLogin: true, session }, home));
  }

  if (action === "attach") {
    const slug = workspaceOf(req);
    const found = personOf(req, slug);
    if (!found.workspace || !isOwner(found.person)) {
      return res.status(403).json({ ok: false, error: "Owner desk code required to attach a desk." });
    }
    const acc = accountForDesk(found.workspace);
    const other = String(body.desk || body.slug || "").trim();
    if (!other) return res.status(400).json({ ok: false, error: "Name the desk to attach." });
    const want = require("./_lib").slugify(other);
    const row = (require("./_lib").mem.workspaces || []).find((w) => w && w.slug === want);
    if (!row) return res.status(404).json({ ok: false, error: "No desk with that name." });
    acc.desks = acc.desks || [];
    if (acc.desks.indexOf(row.slug) < 0) acc.desks.push(row.slug);
    row.accountId = acc.id;
    await save();
    return res.status(200).json(proHome(acc, found.person));
  }

  if (action === "plan" || action === "subscribe") {
    const slug = workspaceOf(req);
    const found = personOf(req, slug);
    if (!found.workspace || !isOwner(found.person)) {
      return res.status(403).json({ ok: false, error: "Owner desk code required to switch the plan." });
    }
    const acc = accountForDesk(found.workspace);
    const made = switchPlan(acc, body.plan || body.id || body.name, found.person);
    if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
    await save();
    const home = proHome(acc, found.person);
    return res.status(200).json(Object.assign(home, {
      hint: made.plan.name + " is active. Still free. Features follow this plan."
    }));
  }

  if (action === "password" || action === "details" || action === "profile") {
    const slug = workspaceOf(req);
    const found = personOf(req, slug);
    if (!found.workspace || !found.person) {
      return res.status(401).json({ ok: false, error: "Sign in first." });
    }
    const acc = homeAccount(found.person, found.workspace);
    if (!acc) return res.status(404).json({ ok: false, error: "No AIA account on this login." });
    const extra = require("./_account");
    if (action === "password") {
      if (acc.password) {
        const current = String(body.current || body.old || "");
        const viaPw = current && acc.password === extra.hashPassword(current);
        const viaPin = current && acc.pin && acc.pin === require("./_lib").hashPin(current);
        if (!viaPw && !viaPin) {
          return res.status(401).json({ ok: false, error: "Current password or desk code does not match." });
        }
      }
      const set = extra.setAccountPassword(acc, body.password || body.next);
      if (!set.ok) return res.status(400).json({ ok: false, error: set.error });
      if (body.email && extra.looksLikeEmail(body.email)) {
        const applied = extra.applyAccountDetails(acc, { email: body.email });
        if (applied && applied.ok === false) return res.status(409).json({ ok: false, error: applied.error });
      }
      await save();
      return res.status(200).json({ ok: true, hasPassword: true, email: acc.email || "", hint: "Email and password can now open this account." });
    }
    if (body.name) found.person.name = String(body.name).trim().slice(0, 80);
    const applied = extra.applyAccountDetails(acc, body);
    if (applied && applied.ok === false) return res.status(400).json({ ok: false, error: applied.error });
    await save();
    return res.status(200).json(Object.assign(proHome(acc, found.person), { hint: "Account details saved." }));
  }

  if (action === "mint") {
    const slug = workspaceOf(req);
    const found = personOf(req, slug);
    if (!found.workspace || !isOwner(found.person)) {
      return res.status(403).json({ ok: false, error: "Owner desk code required." });
    }
    const acc = createOwnerAccount(body, found.workspace);
    await save();
    return res.status(200).json({ ok: true, plan: publicPlan(acc), account: { id: acc.id, name: acc.name } });
  }

  return res.status(400).json({
    ok: false,
    error: "Unknown account action.",
    actions: ["login", "open", "save", "attach", "plan", "mint", "password", "details"]
  });
};

const { cors, ready, save, readBody, workspaceOf, personOf, isOwner } = require("./_lib");
const {
  ensureAccount, accountForDesk, loginAccount, proHome, createOwnerAccount, publicPlan,
  switchPlan, publicPlans
} = require("./_account");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();
  ensureAccount();

  if (req.method === "GET") {
    const slug = workspaceOf(req);
    const pin = (req.headers && req.headers["x-pin"]) || "";
    const via = loginAccount(slug, pin);
    if (via.ok) {
      const owner = (via.desk && via.desk.people || []).find((p) => p && p.role === "owner") || { name: via.account.ownerName, role: "owner", kind: "owner" };
      return res.status(200).json(proHome(via.account, owner));
    }
    const found = personOf(req, slug);
    if (found.pending) {
      return res.status(403).json({ ok: false, pending: true, error: "That seat is waiting on the owner." });
    }
    if (!found.workspace || !found.person) {
      return res.status(401).json({ ok: false, error: "Account name or desk code does not match." });
    }
    if (!isOwner(found.person)) {
      return res.status(403).json({ ok: false, error: "Owner code opens the Pro account. Members stay on their desk." });
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
    const via = loginAccount(name, pin);
    if (!via.ok) return res.status(via.status || 401).json({ ok: false, pending: !!via.pending, error: via.error });
    const who = via.person || (via.desk && via.desk.people || []).find((p) => p && p.role === "owner") || {
      name: via.account.ownerName, role: "owner", kind: "owner"
    };
    const session = require("./_lib").issueSession(who, via.desk, via.account);
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
    actions: ["login", "open", "save", "attach", "plan", "mint"]
  });
};

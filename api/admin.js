const {
  cors, mem, ready, save, workspaceOf, personOf, isOwner, ensureRules, jobCounts, readBody
} = require("./_lib");
const { adminPinOk } = require("./_desk");
const {
  ensureAccount, publicAccount, accountSnapshot, inviteSeat, requestSeat,
  setSeatStatus, approvalsOf, peopleAcross, accountForDesk, requestMonthly, publicPlan,
  switchPlan, publicPlans, proHome, requestPermission, setPermission, desksForPerson
} = require("./_account");
const { setDeskPerms, setSeatCan, publicDesk } = require("./_desk");
const plans = require("./_plans");

function ticketsOf(slug) {
  return (mem.tickets || []).filter((t) => t && (!slug || t.workspace === slug)).slice(0, 40);
}
function askFn() { return requestPermission || plans.requestPermission; }
function permitFn() { return setPermission || plans.setPermission; }
function mineFn() { return desksForPerson || plans.desksForPerson; }

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();
  ensureAccount();

  if (req.method === "GET") {
    const slug = workspaceOf(req);
    const pin = (req.headers && req.headers["x-pin"]) || "";
    if (!pin && adminPinOk(req)) {
      return res.status(200).json({ ok: true, platform: true, you: { name: "Admin", role: "admin", kind: "owner", live: true }, account: publicAccount(), plan: publicPlan({ plan: "pro" }), plans: publicPlans(), people: peopleAcross(), approvals: approvalsOf(""), desks: (mem.workspaces || []).map((w) => publicDesk(w, (w.people || []).find((p) => p && p.role === "owner"))), tickets: ticketsOf(""), audit: (mem.audit || []).slice(0, 40), money: mem.money || [] });
    }
    const found = personOf(req, slug);
    const row = found.workspace;
    const person = found.person;
    if (!row) return res.status(404).json({ ok: false, error: "No workspace with that slug. Start one first." });
    if (found.pending) return res.status(403).json({ ok: false, pending: true, error: "That seat is waiting on the owner." });
    if (!person) return res.status(401).json({ ok: false, error: "Pin required." });
    const owner = isOwner(person);
    const snap = accountSnapshot(row, person);
    return res.status(200).json({ ok: true, you: snap.you, account: snap.account, plan: snap.plan, plans: publicPlans(), shop: snap.shop, counts: jobCounts(row.slug), people: snap.people, approvals: owner ? snap.approvals : [], perms: snap.perms, agents: snap.agents, kinds: snap.kinds, levels: snap.levels, hardOwner: snap.hardOwner, rules: ensureRules(row), tickets: ticketsOf(row.slug), audit: owner ? (mem.audit || []).filter((a) => !a.workspace || a.workspace === row.slug).slice(0, 40) : null, money: owner ? (mem.money || []).filter((m) => !m.workspace || m.workspace === row.slug).slice(0, 40) : null });
  }

  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use GET or POST." });
  const body = await readBody(req);
  const action = String(body.action || "invite").toLowerCase();
  const slug = workspaceOf(req);
  const found = personOf(req, slug);
  const row = found.workspace;
  const person = found.person;
  if (!row) return res.status(404).json({ ok: false, error: "No workspace" });
  if (!person) return res.status(401).json({ ok: false, error: "Desk code required." });

  if (action === "request") {
    const made = requestSeat(row, body);
    if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
    await save();
    return res.status(202).json({ ok: true, pending: true, person: made.person });
  }

  if (action === "ask" || action === "permission") {
    const fn = askFn();
    const made = fn(row, person, body.kind || body.want || body.permission);
    if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
    await save();
    return res.status(202).json(made);
  }

  if (action === "mine") {
    const fn = mineFn();
    const mine = fn({ id: person.id, name: person.name, email: person.email, pin: person.pin, accountId: person.accountId });
    return res.status(200).json({ ok: true, plan: publicPlan(accountForDesk(row)), you: person, owned: mine.owned, member: mine.member });
  }

  if (!isOwner(person)) return res.status(403).json({ ok: false, error: "Owner desk code required." });

  if (action === "invite") {
    const made = inviteSeat(row, body, person);
    if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
    await save();
    return res.status(made.status || 201).json({ ok: true, person: made.person, pending: !!made.pending, account: publicAccount() });
  }
  if (action === "approve" || action === "deny") {
    const made = setSeatStatus(row, body.id || body.personId, action === "deny" ? "denied" : "approved", person);
    if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
    await save();
    return res.status(200).json({ ok: true, person: made.person });
  }
  if (action === "permit" || action === "kind") {
    const fn = permitFn();
    const made = fn(row, body.id || body.personId, body.kind || body.want, person);
    if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
    await save();
    return res.status(200).json({ ok: true, person: made.person });
  }
  if (action === "perms") {
    const saved = setDeskPerms(row, body.perms || body);
    if (!saved.ok) return res.status(400).json(saved);
    await save();
    return res.status(200).json({ ok: true, perms: saved.perms });
  }
  if (action === "seat") {
    const saved = setSeatCan(row, body.id || body.personId, body);
    if (!saved.ok) return res.status(400).json(saved);
    await save();
    return res.status(200).json({ ok: true, person: saved.person });
  }
  if (action === "plan" || action === "subscribe") {
    const acc = accountForDesk(row);
    const made = switchPlan(acc, body.plan || body.id || body.name, person);
    if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
    await save();
    return res.status(200).json(Object.assign(proHome(acc, person), { hint: made.plan.name + " is active. Still free. Features follow this plan." }));
  }
  if (action === "pro" || action === "home" || action === "login") {
    return res.status(200).json(Object.assign({ savedLogin: true }, proHome(accountForDesk(row), person)));
  }
  if (action === "monthly" || action === "billing") {
    const acc = accountForDesk(row);
    const made = requestMonthly(acc, person);
    if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
    await save();
    return res.status(200).json({ ok: true, hold: true, plan: made.plan, hint: "Still free. Monthly is noted. No card taken. No charge." });
  }
  if (action === "remove") {
    const id = body.id || body.personId;
    const target = (row.people || []).find((p) => p && p.id === id);
    if (!target) return res.status(404).json({ ok: false, error: "Person not found" });
    if (target.role === "owner" && row.people.filter((p) => p.role === "owner").length < 2) return res.status(409).json({ ok: false, error: "Keep at least one owner." });
    row.people = row.people.filter((p) => p.id !== id);
    await save();
    return res.status(200).json({ ok: true, account: publicAccount() });
  }
  return res.status(400).json({ ok: false, error: "Unknown admin action.", actions: ["invite", "request", "ask", "permit", "mine", "approve", "deny", "plan", "login"] });
};

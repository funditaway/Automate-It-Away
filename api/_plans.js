const lib = require("./_lib");
const PLANS = {
  desk: { id: "desk", name: "Desk", tag: "One desk", features: { desksMax: 1, extraSeats: 0, teamQueues: false, timeline: false, scheduled: false, pipes: false, agents: false, staffLogins: false, savedLogin: true, packs: false, marketplace: false, automation: "Queue and drop" }, includes: ["One desk", "Your own account", "Desks you own and sit on", "Ask or change permission", "Queue and drop"], hides: ["Account-wide team queues", "Live pipes"] },
  pro: { id: "pro", name: "Pro", tag: "Every desk", features: { desksMax: 12, extraSeats: 8, teamQueues: true, timeline: true, scheduled: true, pipes: true, agents: true, staffLogins: true, savedLogin: true, packs: true, marketplace: true, automation: "Full" }, includes: ["Every desk", "Your own account", "Member desks", "Ask or change permission", "Team queues", "Pipes"], hides: [] },
  crew: { id: "crew", name: "Crew", tag: "Shops and staff", features: { desksMax: 40, extraSeats: 40, teamQueues: true, timeline: true, scheduled: true, pipes: true, agents: true, staffLogins: true, savedLogin: true, packs: true, marketplace: true, automation: "Full + staff" }, includes: ["Many desks", "Your own account", "Member desks", "Ask or change permission", "Staff logins", "Pipes"], hides: [] },
  dev: { id: "dev", name: "Dev", tag: "Pack creator", features: { desksMax: 12, extraSeats: 8, teamQueues: true, timeline: true, scheduled: true, pipes: true, agents: true, staffLogins: true, savedLogin: true, packs: true, marketplace: true, creator: true, automation: "Packs + desks" }, includes: ["Every desk", "Creators Studio on this same account", "List packs on the marketplace", "Buy / install onto this desk", "Ask listed · Collect HOLD"], hides: ["Silent pack checkout"] }
};
function planOf(id) { return PLANS[String(id || "pro").toLowerCase()] || PLANS.pro; }
function publicPlans() {
  return Object.keys(PLANS).map((id) => { const p = PLANS[id]; return { id: p.id, name: p.name, tag: p.tag, price: 0, charged: false, status: "free", includes: p.includes, hides: p.hides, features: p.features, note: "Free for now. Switch anytime. We tell you before we charge." }; });
}
function desksOfAccount(acc) {
  const slugs = (acc && acc.desks) || [];
  return (lib.mem.workspaces || []).filter((w) => w && (slugs.indexOf(w.slug) >= 0 || w.accountId === (acc && acc.id)));
}
function decoratePlan(acc) {
  const spec = planOf((acc && acc.plan) || "pro");
  return { id: spec.id, plan: spec.id, name: spec.name, tag: spec.tag, product: "aia", status: "free", cadence: "monthly", amount: 0, charged: false, automation: spec.features.automation, savedLogin: true, creator: !!(acc && acc.creator) || spec.id === "dev", features: spec.features, includes: spec.includes, hides: spec.hides, catalog: publicPlans(), note: spec.name + " is active. Free for now. Switch anytime. We tell you before we charge." };
}
function switchPlan(acc, id, actor) {
  if (!acc) return { ok: false, status: 404, error: "No account." };
  const spec = PLANS[String(id || "").toLowerCase()];
  if (!spec) return { ok: false, status: 400, error: "Pick Desk, Pro, Crew, or Dev." };
  acc.plan = spec.id; acc.features = spec.features;
  if (spec.id === "dev") acc.creator = true;
  acc.billing = Object.assign({}, acc.billing || {}, { plan: spec.id, status: "free", amount: 0, charged: false });
  return { ok: true, plan: decoratePlan(acc), by: (actor && actor.name) || "owner" };
}
function desksForPerson(hint) {
  const owned = []; const member = [];
  const email = String((hint && hint.email) || "").trim().toLowerCase();
  const pin = hint && hint.pin; const aid = hint && (hint.accountId || hint.id);
  (lib.mem.workspaces || []).forEach((w) => {
    if (!w) return;
    const hit = (w.people || []).find((p) => p && ((aid && (p.accountId === aid || p.id === aid)) || (email && String(p.email || "").trim().toLowerCase() === email) || (pin && p.pin === pin)));
    if (!hit) return;
    const ownerHit = hit.role === "owner" || hit.kind === "owner";
    const aia = require("./_aia-net").of(w.aia || w.slug, w.slug).name;
    const card = { slug: w.slug, name: w.biz || w.name || w.slug, aia: aia, role: ownerHit ? "owner" : (hit.kind || "member"), kind: ownerHit ? "owner" : (hit.kind || "member"), status: hit.status || "approved", requestedKind: hit.requestedKind || "", personId: hit.id, yours: ownerHit ? "own" : "member" };
    if (ownerHit) owned.push(card); else member.push(card);
  });
  return { owned, member };
}
function requestPermission(row, person, want) {
  if (!row || !person) return { ok: false, status: 404, error: "No desk." };
  if (person.role === "owner") return { ok: false, status: 400, error: "Owner already has every tap." };
  const kind = String(want || "member").toLowerCase();
  if (kind === "owner") return { ok: false, status: 400, error: "Owner seats are not a request." };
  person.requestedKind = kind; person.requestStatus = "pending";
  const job = { id: "job_" + Date.now().toString(36), workspace: row.slug, title: (person.name || "Member") + " asks for " + kind, notes: (person.name || "A member") + " wants " + kind + " on " + (row.biz || row.slug) + ".", status: "exception", step: "Qualify", waitingOn: "owner", from: "member", custom: { outcome: "permission", personId: person.id, wantKind: kind }, createdAt: new Date().toISOString(), log: ["Permission request"] };
  lib.mem.jobs = lib.mem.jobs || []; lib.mem.jobs.unshift(job);
  return { ok: true, status: 202, pending: true, person: typeof lib.publicPerson === "function" ? lib.publicPerson(person) : person, job: { id: job.id, title: job.title } };
}
function setPermission(row, id, want, actor) {
  if (!row) return { ok: false, status: 404, error: "No desk." };
  const seat = (row.people || []).find((p) => p && p.id === id);
  if (!seat) return { ok: false, status: 404, error: "Person not found." };
  if (seat.role === "owner") return { ok: false, status: 409, error: "Owner seat stays owner." };
  const kind = String(want || seat.requestedKind || "member").toLowerCase();
  seat.kind = kind; seat.status = "approved"; seat.requestedKind = "";
  return { ok: true, person: typeof lib.publicPerson === "function" ? lib.publicPerson(seat) : seat };
}
function loginAccount(name, pin) {
  const slug = lib.slugify(name || "");
  const hashed = lib.hashPin(pin || "");
  const acc = (lib.mem.accounts || []).find((a) => a && (a.slug === slug || lib.slugify(a.name) === slug) && a.pin && a.pin === hashed);
  if (acc) return { ok: true, account: acc };
  const desk = (lib.mem.workspaces || []).find((w) => w && w.slug === slug);
  if (desk && desk.pin === hashed) return { ok: true, account: { name: desk.biz, slug: desk.slug, desks: [desk.slug], plan: "pro", pin: desk.pin }, desk };
  const found = lib.personOf({ headers: { "x-workspace": slug, "x-pin": pin || "" } }, slug);
  if (found && found.person && found.person.role === "owner") return { ok: true, account: { name: found.workspace.biz, slug, desks: [slug], plan: "pro" }, desk: found.workspace, person: found.person };
  if (found && found.pending) return { ok: false, status: 403, pending: true, error: "That seat is waiting on the owner." };
  if (found && found.person) return { ok: true, account: { name: found.person.name, slug, desks: [], plan: "desk" }, desk: found.workspace, person: found.person, memberLogin: true };
  return { ok: false, status: 401, error: "Account name or code does not match." };
}
function proHome(acc, person) {
  const plan = decoratePlan(acc);
  const feat = plan.features || {};
  const hint = { id: person && person.id, name: person && person.name, email: person && person.email, pin: person && person.pin, accountId: person && person.accountId };
  const mine = desksForPerson(hint);
  const desks = desksOfAccount(acc).map((w) => ({ slug: w.slug, name: w.biz || w.name || w.slug, people: (w.people || []).length }));
  return { ok: true, product: "aia", savedLogin: true, account: acc ? { id: acc.id, name: acc.name, slug: acc.slug, desks: acc.desks || [], plan: plan.plan, creator: !!(acc.creator || plan.plan === "dev") } : null, plan, plans: publicPlans(), active: plan.plan, you: typeof lib.publicPerson === "function" ? lib.publicPerson(person) : person, mine, desksOwned: mine.owned, desksMember: mine.member, desks, teams: feat.teamQueues ? [] : [], timeline: [], scheduled: [], pipes: [], locked: { teamQueues: !feat.teamQueues, timeline: !feat.timeline, pipes: !feat.pipes } };
}
function seatBill() { return { people: 0, extra: 0, extraPrice: 0, charged: false }; }
function teamQueues() { return []; }
function accountTimeline() { return { items: [], scheduled: [] }; }
module.exports = { PLANS, planOf, publicPlans, decoratePlan, switchPlan, seatBill, desksOfAccount, teamQueues, accountTimeline, loginAccount, proHome, desksForPerson, requestPermission, setPermission };

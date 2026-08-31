const lib = require("./_lib");
const roles = require("./_roles");
const plans = require("./_plans");

const KINDS = ["owner", "family", "friend", "helper", "staff", "member", "agent"];

function seatCan(kind, crew, status) {
  if (typeof lib.defaultSeatCan === "function") return lib.defaultSeatCan(kind, crew, status);
  return roles.resolveCan(kind, crew, status);
}
function defaultBilling() {
  return { plan: "free", status: "free", cadence: "monthly", amount: 0, charged: false, note: "Free for now." };
}
function ensureAccount() {
  if (!Array.isArray(lib.mem.approvals)) lib.mem.approvals = [];
  if (!Array.isArray(lib.mem.accounts)) lib.mem.accounts = [];
  if (!lib.mem.account || typeof lib.mem.account !== "object") {
    lib.mem.account = { id: "aia", name: "Automate It Away", heldBy: "admin", ownerName: "James Oddo", note: "One AIA account per person. Own desks and sit on others.", createdAt: new Date().toISOString() };
  }
  return lib.mem.account;
}
function publicPlan(acc) {
  if (plans && typeof plans.decoratePlan === "function") return plans.decoratePlan(acc);
  return { plan: (acc && acc.plan) || "pro", status: "free", amount: 0, charged: false, note: "Free for now." };
}
function switchPlan(acc, id, actor) { return plans.switchPlan(acc, id, actor); }
function publicPlans() { return plans.publicPlans(); }
function proHome(acc, person) { return plans.proHome(acc, person); }
function loginAccount(name, pin) { return plans.loginAccount(name, pin); }
function desksForPerson(hint) { return plans.desksForPerson(hint); }
function requestPermission(row, person, want) { return plans.requestPermission(row, person, want); }
function setPermission(row, id, want, actor) { return plans.setPermission(row, id, want, actor); }

function findAccount(hint) {
  ensureAccount();
  const h = hint || {};
  const slug = lib.slugify(h.account || h.home || h.slug || h.biz || "");
  const email = String(h.email || "").trim().toLowerCase();
  return (lib.mem.accounts || []).find((a) => a && (
    (h.id && a.id === h.id) || (h.accountId && a.id === h.accountId) ||
    (slug && (a.slug === slug || lib.slugify(a.name) === slug)) ||
    (email && String(a.email || "").trim().toLowerCase() === email)
  )) || null;
}
function connectDesk(acc, row, as) {
  if (!acc || !row) return acc;
  acc.desks = acc.desks || [];
  acc.memberDesks = acc.memberDesks || [];
  if (as === "owner") {
    if (acc.desks.indexOf(row.slug) < 0) acc.desks.push(row.slug);
    row.accountId = acc.id;
    const owner = (row.people || []).find((p) => p && p.role === "owner");
    if (owner) owner.accountId = acc.id;
  } else if (acc.memberDesks.indexOf(row.slug) < 0) acc.memberDesks.push(row.slug);
  return acc;
}
function createOwnerAccount(body, row) {
  ensureAccount();
  const slug = row && row.slug ? row.slug : lib.slugify((body && (body.biz || body.account || body.name)) || "desk");
  const existing = findAccount(Object.assign({}, body || {}, { slug: row && row.slug, accountId: row && row.accountId }))
    || (lib.mem.accounts || []).find((a) => a && ((row && a.id === row.accountId) || (a.desks || []).indexOf(slug) >= 0));
  if (existing) {
    if (row) connectDesk(existing, row, "owner");
    return existing;
  }
  const acc = {
    id: "acct_" + Date.now().toString(36),
    name: String((body && (body.biz || body.account || body.name)) || (row && (row.biz || row.name)) || "Shop").trim().slice(0, 80),
    ownerName: String((body && body.name) || (row && row.name) || "Owner").trim().slice(0, 80),
    email: (body && body.email) || (row && row.email) || "",
    plan: "pro", billing: defaultBilling(), slug: slug,
    pin: body && body.pin ? lib.hashPin(body.pin) : (row && row.pin) || "",
    desks: row && row.slug ? [row.slug] : [], memberDesks: [], createdAt: new Date().toISOString()
  };
  lib.mem.accounts.unshift(acc);
  if (row) connectDesk(acc, row, "owner");
  return acc;
}
function accountForDesk(row) {
  ensureAccount();
  if (!row) return null;
  let acc = (lib.mem.accounts || []).find((a) => a && (a.id === row.accountId || (a.desks || []).indexOf(row.slug) >= 0));
  if (!acc) acc = createOwnerAccount({ name: row.name, biz: row.biz, email: row.email }, row);
  return acc;
}
function requestMonthly(acc, actor) {
  if (!acc) return { ok: false, status: 404, error: "No account." };
  acc.billing = Object.assign(defaultBilling(), acc.billing || {}, { requested: "monthly", charged: false, status: "free" });
  return { ok: true, plan: publicPlan(acc), by: (actor && actor.name) || "owner" };
}
function peopleAcross() {
  const rows = [];
  (lib.mem.workspaces || []).forEach((w) => {
    if (!w) return;
    (w.people || []).forEach((p) => { if (p) rows.push(Object.assign({ desk: w.biz || w.slug, slug: w.slug }, lib.publicPerson(p))); });
  });
  return rows;
}
function publicAccount(row) {
  const account = ensureAccount();
  const people = peopleAcross();
  const shop = row ? accountForDesk(row) : null;
  return { id: account.id, name: account.name, heldBy: account.heldBy, ownerName: account.ownerName, note: account.note, createdAt: account.createdAt, desks: (lib.mem.workspaces || []).length, people: people.length, pending: people.filter((p) => p.status === "pending").length, shop: shop ? { id: shop.id, name: shop.name, desks: shop.desks || [], memberDesks: shop.memberDesks || [] } : null, plan: shop ? publicPlan(shop) : publicPlan({ plan: "pro" }) };
}
function approvalsOf(slug) {
  ensureAccount();
  const s = lib.slugify(slug || "");
  return (lib.mem.approvals || []).filter((a) => a && (!s || a.slug === s)).slice(0, 80);
}
function normalizeKind(kind, role) {
  const raw = String(kind || "").toLowerCase();
  if (raw === "employee") return "helper";
  if (KINDS.includes(raw)) return raw;
  if (role === "owner") return "owner";
  return raw === "staff" ? "staff" : "helper";
}
function inviteSeat(row, body, actor) {
  if (!row) return { ok: false, status: 404, error: "No workspace" };
  const kind = normalizeKind(body.kind, body.role);
  const home = findAccount(body);
  const name = String(body.name || body.crew || (home && home.ownerName) || "").trim();
  const pin = String(body.pin || body.code || "");
  if (!name) return { ok: false, status: 400, error: "Name required." };
  let hashed = "";
  if (home && home.pin && pin.length < 4) hashed = home.pin;
  else if (pin.length >= 4) hashed = lib.hashPin(pin);
  else return { ok: false, status: 400, error: "Their AIA account name, or a 4+ digit code." };
  const ownerInvited = lib.isOwner(actor);
  const status = ownerInvited && kind !== "agent" ? "approved" : "pending";
  const seat = {
    id: "p_" + Date.now().toString(36), name, role: kind === "owner" ? "owner" : "employee", kind,
    crew: kind === "agent" ? name : "", email: body.email || (home && home.email) || "",
    accountId: home ? home.id : "", pin: hashed, status,
    can: seatCan(kind, "", status), createdAt: new Date().toISOString(),
    approvedAt: status === "approved" ? new Date().toISOString() : null
  };
  row.people = row.people || [];
  row.people.push(seat);
  if (home && kind !== "agent") connectDesk(home, row, "member");
  return { ok: true, status: status === "approved" ? 201 : 202, person: lib.publicPerson(seat), pending: status === "pending" };
}
function requestSeat(row, body) {
  if (!row) return { ok: false, status: 404, error: "No workspace" };
  return inviteSeat(row, Object.assign({}, body, { approve: false, status: "pending" }), { name: "request", role: "employee" });
}
function setSeatStatus(row, id, next, actor) {
  if (!row) return { ok: false, status: 404, error: "No desk." };
  const seat = (row.people || []).find((p) => p && p.id === id);
  if (!seat) return { ok: false, status: 404, error: "Person not found." };
  seat.status = String(next || "pending").toLowerCase();
  seat.approvedAt = seat.status === "approved" ? new Date().toISOString() : null;
  return { ok: true, status: 200, person: lib.publicPerson(seat) };
}
function accountSnapshot(row, person) {
  const shop = row ? accountForDesk(row) : null;
  return { account: publicAccount(row), plan: shop ? publicPlan(shop) : publicPlan(null), shop: shop ? { id: shop.id, name: shop.name, desks: shop.desks || [], memberDesks: shop.memberDesks || [] } : null, you: lib.publicPerson(person), people: row ? (row.people || []).map(lib.publicPerson) : [], approvals: row ? approvalsOf(row.slug) : [], kinds: KINDS, agents: roles.catalog().agents, levels: roles.catalog().levels, hardOwner: roles.HARD_OWNER };
}
module.exports = {
  ensureAccount, publicAccount, publicPlan, defaultBilling, createOwnerAccount, accountForDesk,
  requestMonthly, peopleAcross, approvalsOf, inviteSeat, requestSeat, setSeatStatus, accountSnapshot,
  normalizeKind, switchPlan, publicPlans, proHome, loginAccount, desksForPerson, requestPermission, setPermission,
  findAccount, connectDesk, planOf: plans.planOf, PLANS: plans.PLANS
};

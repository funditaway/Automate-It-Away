const lib = require("./_lib");
const roles = require("./_roles");
const plans = require("./_plans");

const KINDS = ["owner", "family", "friend", "helper", "staff", "member", "agent"];
const CREW = ["Foreman", "Mapper", "Packer", "Doer", "Rail", "Builder", "Worker"];

function seatCan(kind, crew, status) {
  if (typeof lib.defaultSeatCan === "function") return lib.defaultSeatCan(kind, crew, status);
  return roles.resolveCan(kind, crew, status);
}

function defaultBilling() {
  return {
    plan: "free",
    status: "free",
    cadence: "monthly",
    amount: 0,
    charged: false,
    startsAt: null,
    requested: "",
    note: "Free for now. Monthly later. We tell you before we charge."
  };
}

function ensureAccount() {
  if (!Array.isArray(lib.mem.approvals)) lib.mem.approvals = [];
  if (!Array.isArray(lib.mem.accounts)) lib.mem.accounts = [];
  if (!lib.mem.account || typeof lib.mem.account !== "object") {
    lib.mem.account = {
      id: "aia",
      name: "Automate It Away",
      heldBy: "admin",
      ownerName: "James Oddo",
      note: "Admin holds the account book. Each shop keeps its own desk, money, and license.",
      createdAt: new Date().toISOString()
    };
  }
  return lib.mem.account;
}

function publicPlan(acc) {
  if (plans && typeof plans.decoratePlan === "function") return plans.decoratePlan(acc);
  const b = (acc && acc.billing && typeof acc.billing === "object") ? acc.billing : defaultBilling();
  return {
    plan: (acc && acc.plan) || b.plan || "pro",
    status: "free",
    cadence: b.cadence || "monthly",
    amount: 0,
    charged: false,
    startsAt: b.startsAt || null,
    requested: b.requested || "",
    note: b.note || "Free for now. Switch the AIA plan anytime. We tell you before we charge."
  };
}
function switchPlan(acc, id, actor) {
  return plans.switchPlan(acc, id, actor);
}
function publicPlans() { return plans.publicPlans(); }
function proHome(acc, person) { return plans.proHome(acc, person); }
function loginAccount(name, pin) { return plans.loginAccount(name, pin); }

function createOwnerAccount(body, row) {
  ensureAccount();
  const slug = row && row.slug ? row.slug : lib.slugify((body && (body.biz || body.name)) || "desk");
  const existing = (lib.mem.accounts || []).find((a) => a && ((row && a.id === row.accountId) || (a.desks || []).indexOf(slug) >= 0));
  if (existing) {
    if (row && !row.accountId) row.accountId = existing.id;
    if (row && (existing.desks || []).indexOf(row.slug) < 0) existing.desks.push(row.slug);
    if (!existing.billing) existing.billing = defaultBilling();
    if (!existing.plan) existing.plan = "pro";
    existing.billing.charged = false;
    existing.billing.status = "free";
    return existing;
  }
  const acc = {
    id: "acct_" + Date.now().toString(36),
    name: String((body && (body.biz || body.account || body.name)) || (row && (row.biz || row.name)) || "Shop").trim().slice(0, 80),
    ownerName: String((body && body.name) || (row && row.name) || "Owner").trim().slice(0, 80),
    email: (body && body.email) || (row && row.email) || "",
    plan: "pro",
    billing: defaultBilling(),
    slug: slug,
    pin: body && body.pin ? lib.hashPin(body.pin) : (row && row.pin) || "",
    desks: row && row.slug ? [row.slug] : [],
    createdAt: new Date().toISOString()
  };
  lib.mem.accounts.unshift(acc);
  if (row) row.accountId = acc.id;
  lib.log("Auth", "Owner account · free · " + acc.name, "OK", slug);
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
  acc.billing = Object.assign(defaultBilling(), acc.billing || {});
  acc.billing.requested = "monthly";
  acc.billing.note = "Monthly later for extra member and staff logins. Still free.";
  acc.plan = acc.plan || "pro";
  acc.billing.status = "free";
  acc.billing.charged = false;
  lib.log("Auth", "Monthly later · still free · " + acc.name, "HOLD", acc.slug || "");
  return { ok: true, plan: publicPlan(acc), by: (actor && actor.name) || "owner" };
}

function peopleAcross() {
  const rows = [];
  (lib.mem.workspaces || []).forEach((w) => {
    if (!w) return;
    (w.people || []).forEach((p) => {
      if (!p) return;
      rows.push(Object.assign({ desk: w.biz || w.name || w.slug, slug: w.slug }, lib.publicPerson(p)));
    });
  });
  return rows;
}

function publicAccount(row) {
  const account = ensureAccount();
  const people = peopleAcross();
  const pending = people.filter((p) => p.status === "pending");
  const agents = people.filter((p) => p.kind === "agent");
  const shop = row ? accountForDesk(row) : null;
  return {
    id: account.id,
    name: account.name,
    heldBy: account.heldBy,
    ownerName: account.ownerName,
    note: account.note,
    createdAt: account.createdAt,
    desks: (lib.mem.workspaces || []).length,
    people: people.length,
    pending: pending.length,
    agents: agents.length,
    staff: people.filter((p) => p.kind === "staff").length,
    friends: people.filter((p) => p.kind === "friend" || p.kind === "family").length,
    shop: shop ? {
      id: shop.id,
      name: shop.name,
      ownerName: shop.ownerName,
      desks: shop.desks || [],
      createdAt: shop.createdAt
    } : null,
    plan: shop ? publicPlan(shop) : publicPlan({ plan: "pro" })
  };
}

function approvalsOf(slug) {
  ensureAccount();
  const s = lib.slugify(slug || "");
  return (lib.mem.approvals || []).filter((a) => a && (!s || a.slug === s)).slice(0, 80);
}

function logApproval(row) {
  ensureAccount();
  lib.mem.approvals.unshift(row);
  lib.mem.approvals = lib.mem.approvals.slice(0, 200);
  return row;
}

function normalizeKind(kind, role) {
  const raw = String(kind || "").toLowerCase();
  if (raw === "employee") return "helper";
  const kinds = lib.SEAT_KINDS || KINDS;
  if (kinds.includes(raw)) return raw;
  if (role === "owner") return "owner";
  if (role === "agent") return "agent";
  if (role === "employee" || role === "member" || role === "helper") return raw === "staff" ? "staff" : "helper";
  return "helper";
}

function normalizeCrew(name) {
  const raw = String(name || "").trim();
  const crewList = lib.CREW_AGENTS || CREW;
  const hit = crewList.find((c) => c.toLowerCase() === raw.toLowerCase());
  return hit || raw.slice(0, 24);
}

function pinTaken(row, hashed, exceptId) {
  if (row.pin === hashed) return true;
  return (row.people || []).some((p) => p && p.pin === hashed && p.id !== exceptId);
}

function inviteSeat(row, body, actor) {
  if (!row) return { ok: false, status: 404, error: "No workspace" };
  const kind = normalizeKind(body.kind, body.role);
  const isAgent = kind === "agent";
  const role = kind === "owner" ? "owner" : "employee";
  const name = String(body.name || body.crew || "").trim();
  const pin = String(body.pin || body.code || "");
  if (!name) return { ok: false, status: 400, error: "Name required." };
  if (pin.length < 4) {
    return { ok: false, status: 400, error: isAgent ? "Agent desk code needs at least 4 digits." : "Name and a 4+ digit desk code required." };
  }
  const hashed = lib.hashPin(pin);
  if (pinTaken(row, hashed)) {
    return { ok: false, status: 409, error: "That desk code is already on this shop." };
  }
  const ownerInvited = lib.isOwner(actor);
  const approveNow = ownerInvited && (body.approve === true || body.status === "approved") && !isAgent;
  const agentApproveNow = ownerInvited && isAgent && (body.approve === true || body.status === "approved");
  const status = (approveNow || agentApproveNow || (ownerInvited && !isAgent && body.approve !== false && body.status !== "pending"))
    ? "approved"
    : "pending";
  const crew = isAgent ? normalizeCrew(body.crew || name) : "";
  const seat = {
    id: "p_" + Date.now().toString(36),
    name: isAgent ? (crew || name) : name,
    role,
    kind,
    crew,
    email: body.email || "",
    phone: body.phone || "",
    pin: hashed,
    status,
    can: seatCan(kind, crew, status),
    requestedAt: new Date().toISOString(),
    approvedAt: status === "approved" ? new Date().toISOString() : null,
    approvedBy: status === "approved" ? ((actor && actor.name) || "owner") : "",
    createdAt: new Date().toISOString()
  };
  row.people = row.people || [];
  row.people.push(seat);
  logApproval({
    t: new Date().toISOString(),
    action: status === "approved" ? "invite" : "request",
    slug: row.slug,
    desk: row.biz || row.name || row.slug,
    personId: seat.id,
    name: seat.name,
    kind: seat.kind,
    crew: seat.crew,
    status,
    by: (actor && actor.name) || "desk"
  });
  lib.log("Auth", (isAgent ? "Agent " : "Invited ") + kind + " · " + seat.name + " · " + status, "OK", row.slug);
  return { ok: true, status: status === "approved" ? 201 : 202, person: lib.publicPerson(seat), pending: status === "pending" };
}

function requestSeat(row, body) {
  if (!row) return { ok: false, status: 404, error: "No workspace" };
  const kind = normalizeKind(body.kind || "friend");
  if (kind === "owner") return { ok: false, status: 400, error: "Owner seats are not a request." };
  return inviteSeat(row, Object.assign({}, body, { kind, approve: false, status: "pending" }), { name: "request", role: "employee" });
}

function setSeatStatus(row, id, next, actor) {
  if (!row) return { ok: false, status: 404, error: "No desk." };
  const seat = (row.people || []).find((p) => p && p.id === id);
  if (!seat) return { ok: false, status: 404, error: "Person not found." };
  if (seat.role === "owner") return { ok: false, status: 409, error: "Owner seat is already on." };
  const status = String(next || "").toLowerCase();
  if (status !== "approved" && status !== "denied" && status !== "pending") {
    return { ok: false, status: 400, error: "Use approved, denied, or pending." };
  }
  seat.status = status;
  seat.approvedAt = status === "approved" ? new Date().toISOString() : null;
  seat.approvedBy = status === "approved" ? ((actor && actor.name) || "owner") : "";
  if (status === "denied") {
    seat.can = seatCan(seat.kind || "helper");
    seat.can.draft = false;
    seat.can.edit = false;
  }
  logApproval({
    t: new Date().toISOString(),
    action: status === "approved" ? "approve" : status === "denied" ? "deny" : "hold",
    slug: row.slug,
    desk: row.biz || row.name || row.slug,
    personId: seat.id,
    name: seat.name,
    kind: seat.kind,
    crew: seat.crew || "",
    status,
    by: (actor && actor.name) || "owner"
  });
  lib.log("Auth", status + " · " + seat.name, "OK", row.slug);
  return { ok: true, status: 200, person: lib.publicPerson(seat) };
}

function accountSnapshot(row, person) {
  const counts = row && typeof lib.jobCounts === "function"
    ? lib.jobCounts(row.slug)
    : { waiting: 0, held: 0, shipped: 0, killed: 0 };
  const shop = row ? accountForDesk(row) : null;
  return {
    account: publicAccount(row),
    plan: shop ? publicPlan(shop) : publicPlan(null),
    shop: shop ? { id: shop.id, name: shop.name, ownerName: shop.ownerName, desks: shop.desks || [] } : null,
    you: lib.publicPerson(person),
    perms: row && typeof lib.deskPerms === "function" ? lib.deskPerms(row) : null,
    people: row ? (row.people || []).map(lib.publicPerson) : [],
    approvals: row ? approvalsOf(row.slug) : approvalsOf(""),
    agents: roles.catalog().agents,
    kinds: lib.SEAT_KINDS || KINDS,
    levels: roles.catalog().levels,
    hardOwner: roles.HARD_OWNER,
    counts
  };
}

module.exports = {
  ensureAccount,
  publicAccount,
  publicPlan,
  defaultBilling,
  createOwnerAccount,
  accountForDesk,
  requestMonthly,
  peopleAcross,
  approvalsOf,
  inviteSeat,
  requestSeat,
  setSeatStatus,
  accountSnapshot,
  normalizeKind,
  normalizeCrew,
  switchPlan,
  publicPlans,
  proHome,
  loginAccount,
  planOf: plans.planOf,
  PLANS: plans.PLANS
};

const crypto = require("crypto");
const lib = require("./_lib");
const roles = require("./_roles");
const plans = require("./_plans");

const PASSWORD_ITERATIONS = 120000;

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
function desksForPerson(hint) { return plans.desksForPerson(hint); }
function requestPermission(row, person, want) { return plans.requestPermission(row, person, want); }
function setPermission(row, id, want, actor) { return plans.setPermission(row, id, want, actor); }

function emailOf(row) {
  return String((row && (row.email || row.mail)) || "").trim().toLowerCase();
}
function looksLikeEmail(value) {
  const e = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 120;
}
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, PASSWORD_ITERATIONS, 32, "sha256").toString("hex");
  return ["pbkdf2", "sha256", PASSWORD_ITERATIONS, salt, hash].join("$");
}
function passwordMatches(stored, password) {
  const saved = String(stored || "");
  const raw = String(password || "");
  const parts = saved.split("$");
  if (parts[0] === "pbkdf2" && parts[1] === "sha256" && parts.length === 5) {
    const rounds = Number(parts[2]) || PASSWORD_ITERATIONS;
    const salt = parts[3] || "";
    const expected = parts[4] || "";
    const actual = crypto.pbkdf2Sync(raw, salt, rounds, Math.max(1, expected.length / 2), "sha256").toString("hex");
    try {
      return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
    } catch (e) {
      return false;
    }
  }
  return false;
}
function passwordOk(password) {
  const raw = String(password || "");
  if (raw.length < 8) return { ok: false, error: "Password needs at least 8 characters." };
  if (raw.length > 72) return { ok: false, error: "Password is too long." };
  return { ok: true };
}
function findAccountByEmail(email) {
  ensureAccount();
  const e = emailOf({ email: email });
  if (!e) return null;
  return (lib.mem.accounts || []).find((a) => a && emailOf(a) === e) || null;
}
function emailTaken(email, exceptId) {
  const hit = findAccountByEmail(email);
  return !!(hit && hit.id !== exceptId);
}
function setAccountPassword(acc, password) {
  const check = passwordOk(password);
  if (!check.ok) return check;
  acc.password = hashPassword(password);
  acc.passwordAt = new Date().toISOString();
  return { ok: true };
}
function applyAccountDetails(acc, body) {
  if (!acc || !body) return acc;
  if (body.ownerName || body.name) acc.ownerName = String(body.ownerName || body.name).trim().slice(0, 80);
  if (body.accountName || body.biz) acc.name = String(body.accountName || body.biz).trim().slice(0, 80);
  if (body.phone != null) acc.phone = String(body.phone).trim().slice(0, 32);
  if (body.city != null) acc.city = String(body.city).trim().slice(0, 60);
  if (body.state != null) acc.state = String(body.state).trim().slice(0, 40);
  if (body.timezone != null) acc.timezone = String(body.timezone).trim().slice(0, 60);
  if (body.hours != null) acc.hours = String(body.hours).trim().slice(0, 80);
  if (body.note != null || body.about != null) acc.note = String(body.note || body.about || "").trim().slice(0, 240);
  if (body.preferredDesk != null) acc.preferredDesk = String(body.preferredDesk).trim().slice(0, 80);
  const reach = String(body.reach || body.reachBy || "").toLowerCase();
  if (reach === "call" || reach === "text" || reach === "email") acc.reach = reach;
  if (body.photoUrl && String(body.photoUrl).length <= 180000) acc.photoUrl = String(body.photoUrl);
  if (body.photoUrl === "") acc.photoUrl = "";
  if (body.email != null && String(body.email).trim()) {
    const e = emailOf(body);
    if (!looksLikeEmail(e)) return { ok: false, error: "That email does not look right." };
    if (emailTaken(e, acc.id)) return { ok: false, error: "That email is already on another AIA account." };
    acc.email = e;
  }
  return acc;
}
function loginWithEmail(email, password) {
  ensureAccount();
  const e = emailOf({ email: email });
  const lockId = "email:" + e;
  if (!looksLikeEmail(e) || !password) {
    return { ok: false, status: 400, error: "Email and password are required for this door." };
  }
  if (typeof lib.isLocked === "function" && lib.isLocked(lockId)) {
    return { ok: false, status: 429, locked: true, error: "Too many tries. Wait 15 minutes." };
  }
  const acc = findAccountByEmail(e);
  if (!acc || !acc.password) {
    const fail = typeof lib.noteFail === "function" ? lib.noteFail(lockId) : null;
    if (fail && fail.locked) return { ok: false, status: 429, locked: true, error: "Too many tries. Wait 15 minutes." };
    return { ok: false, status: 401, error: "Email or password does not match." };
  }
  if (!passwordMatches(acc.password, password)) {
    const fail = typeof lib.noteFail === "function" ? lib.noteFail(lockId) : null;
    if (fail && fail.locked) return { ok: false, status: 429, locked: true, error: "Too many tries. Wait 15 minutes." };
    return { ok: false, status: 401, error: "Email or password does not match." };
  }
  if (typeof lib.noteOk === "function") lib.noteOk(lockId);
  const desks = (typeof plans.desksOfAccount === "function" ? plans.desksOfAccount(acc) : []) || [];
  const desk = desks[0] || (lib.mem.workspaces || []).find((w) => w && w.accountId === acc.id) || null;
  let person = null;
  if (desk) {
    person = (desk.people || []).find((p) => p && (p.accountId === acc.id || emailOf(p) === e || p.role === "owner")) || null;
  }
  if (!person) {
    person = { id: acc.id + "_owner", name: acc.ownerName || acc.name || "Owner", role: "owner", kind: "owner", status: "approved", accountId: acc.id, email: acc.email };
  }
  return { ok: true, account: acc, desk: desk, person: person, emailLogin: true };
}
function loginAccount(name, pin, extra) {
  extra = extra || {};
  const rawEmail = extra.email || (looksLikeEmail(name) ? name : "");
  const password = extra.password || extra.pass || "";
  if (looksLikeEmail(rawEmail) && password) return loginWithEmail(rawEmail, password);
  return plans.loginAccount(name, pin);
}
function proHome(acc, person, session) {
  const home = plans.proHome(acc, person) || { ok: true };
  if (home.account && acc) {
    home.account.email = acc.email || "";
    home.account.phone = acc.phone || "";
    home.account.city = acc.city || "";
    home.account.state = acc.state || "";
    home.account.timezone = acc.timezone || "";
    home.account.hours = acc.hours || "";
    home.account.note = acc.note || "";
    home.account.reach = acc.reach || "";
    home.account.preferredDesk = acc.preferredDesk || "";
    home.account.photoUrl = acc.photoUrl || "";
    home.account.createdAt = acc.createdAt || "";
    home.account.hasEmail = !!emailOf(acc);
    home.account.hasPassword = !!acc.password;
    home.account.mfaOn = !!acc.mfaOn;
    home.account.ownerName = acc.ownerName || home.account.ownerName || "";
    home.account.handle = acc.handle || "";
    home.account.aia = acc.aia || (acc.handle ? acc.handle + ".aia" : "");
    home.account.internet = "AIA Internet";
    home.account.chain = false;
    home.account.owned = false;
    try {
      const connect = require("./_connect-wallet");
      home.account.walletAddress = acc.walletAddress || "";
      home.account.walletChainId = acc.walletChainId || 0;
      home.account.wallet = connect.publicOf(acc, session || null);
      home.wallet = home.account.wallet;
    } catch (e) {}
  }
  try {
    const mail = require("./_aia-mail");
    home.mail = mail.listForAccount(acc);
    home.mx = mail.statusOf();
    home.mailNote = mail.HOLD_NOTE;
    if (home.account) {
      home.account.mail = home.mail;
      home.account.mx = mail.statusOf();
    }
  } catch (e) {}
  return home;
}

function findAccount(hint) {
  ensureAccount();
  const h = hint || {};
  const slug = lib.slugify(h.account || h.home || h.slug || h.biz || "");
  const email = emailOf(h);
  return (lib.mem.accounts || []).find((a) => a && (
    (h.id && a.id === h.id) || (h.accountId && a.id === h.accountId) ||
    (slug && (a.slug === slug || lib.slugify(a.name) === slug)) ||
    (email && emailOf(a) === email)
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
    if (body && body.password && !existing.password) setAccountPassword(existing, body.password);
    if (body && body.email && looksLikeEmail(body.email) && !existing.email) existing.email = emailOf(body);
    return existing;
  }
  const acc = {
    id: "acct_" + Date.now().toString(36) + require("crypto").randomBytes(4).toString("hex"),
    name: String((body && (body.biz || body.account || body.name)) || (row && (row.biz || row.name)) || "Shop").trim().slice(0, 80),
    ownerName: String((body && body.name) || (row && row.name) || "Owner").trim().slice(0, 80),
    email: (body && looksLikeEmail(body.email) ? emailOf(body) : "") || (row && row.email) || "",
    phone: body && body.phone ? String(body.phone).trim().slice(0, 32) : "",
    city: (body && body.city) || (row && row.city) || "",
    plan: "pro", billing: defaultBilling(), slug: slug,
    pin: body && body.pin ? lib.hashPin(body.pin) : (row && row.pin) || "",
    desks: row && row.slug ? [row.slug] : [], memberDesks: [], createdAt: new Date().toISOString()
  };
  if (body && body.password) setAccountPassword(acc, body.password);
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
function homeAccount(person, row) {
  ensureAccount();
  if (person && person.accountId) {
    const mine = (lib.mem.accounts || []).find((a) => a && a.id === person.accountId);
    if (mine) return mine;
  }
  if (person && emailOf(person)) {
    const byMail = findAccountByEmail(person.email);
    if (byMail) return byMail;
  }
  return row ? accountForDesk(row) : null;
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
function noteApproval(row, seat, status, actor) {
  ensureAccount();
  if (!row || !seat || !seat.id) return null;
  let hit = (lib.mem.approvals || []).find((a) => a && a.slug === row.slug && a.personId === seat.id) || null;
  if (!hit) {
    hit = { id: "approval_" + Date.now().toString(36), slug: row.slug, personId: seat.id, requestedAt: new Date().toISOString() };
    lib.mem.approvals.unshift(hit);
  }
  hit.name = seat.name || "";
  hit.kind = seat.kind || seat.role || "member";
  hit.status = String(status || seat.status || "pending").toLowerCase();
  hit.by = (actor && actor.name) || hit.by || "request";
  hit.updatedAt = new Date().toISOString();
  if (hit.status === "approved" || hit.status === "denied") hit.decidedAt = hit.updatedAt;
  return hit;
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
  noteApproval(row, seat, status, actor);
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
  noteApproval(row, seat, seat.status, actor);
  return { ok: true, status: 200, person: lib.publicPerson(seat) };
}
function accountSnapshot(row, person) {
  const shop = row ? accountForDesk(row) : null;
  return { account: publicAccount(row), plan: shop ? publicPlan(shop) : publicPlan(null), shop: shop ? { id: shop.id, name: shop.name, desks: shop.desks || [], memberDesks: shop.memberDesks || [] } : null, you: lib.publicPerson(person), people: row ? (row.people || []).map(lib.publicPerson) : [], approvals: row ? approvalsOf(row.slug) : [], kinds: KINDS, agents: roles.catalog().agents, levels: roles.catalog().levels, hardOwner: roles.HARD_OWNER };
}
module.exports = {
  ensureAccount, publicAccount, publicPlan, defaultBilling, createOwnerAccount, accountForDesk, homeAccount,
  requestMonthly, peopleAcross, approvalsOf, inviteSeat, requestSeat, setSeatStatus, accountSnapshot,
  normalizeKind, switchPlan, publicPlans, proHome, loginAccount, loginWithEmail, desksForPerson, requestPermission, setPermission,
  findAccount, findAccountByEmail, connectDesk, emailOf, looksLikeEmail, hashPassword, passwordMatches, passwordOk,
  setAccountPassword, applyAccountDetails, emailTaken,
  planOf: plans.planOf, PLANS: plans.PLANS
};

// My account settings for one person: GET /api/account?settings=1 and
// POST /api/account { action: "settings" | "secret-set" | "secret-remove" }.
// Also DELETE /api/account?secret=NAME.
// Connections and setup cards (connections, connect, connection-secret, disconnect,
// setup-cards, setup-card, setup-step) live in _account-connect.js and use this
// file's seat check, seal, and history.
// The account comes only from the seat the request already proves
// (X-Session / aia_session cookie, or X-Workspace + X-Pin). Any account id in
// the body or the query is never used to pick the account.
// Secrets are write-only: sealed with AES-256-GCM under AIA_ACCOUNT_SECRETS_KEY,
// never returned, never logged, never put in history. No key, no secrets.
// Stop and Kill always work on the actor's own desk. No field here can turn
// them off. Off-desk Stop/Kill is refused (403) and writes nothing.
// This file does not touch Collect, charges, or any money path.
const crypto = require("crypto");
const lib = require("./_lib");

const SECRET_ENV = "AIA_ACCOUNT_SECRETS_KEY";
const SECRET_KEY_MIN = 32;
const SECRET_MAX = 20;
const SECRET_VALUE_MAX = 4000;
const SECRET_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,39}$/;
const SEAL_TAG = "aia-acct-secret-1";
const HISTORY_MAX = 100;
const HISTORY_SHOW = 20;
const THEMES = ["system", "light", "dark"];
const REACH = ["call", "text", "email"];
const STOP_KEYS = ["money", "deletes", "messageNew"];
const STOP_WORDS = { money: "money", deletes: "deletes", messageNew: "messaging someone new" };
const PROFILE_LIMITS = { name: 80, phone: 32, city: 60, state: 40, timezone: 60, hours: 80, note: 240, email: 120 };
const ACTIONS = ["settings", "secret-set", "secret-remove", "automation-step"];
// Account kinds. A legacy account with no kind field reads as human; any
// other stored value that is not human, ai, or si reads as ai (locked side).
const ACCOUNT_KINDS = ["human", "ai", "si"];
// Steps an AI or SI account pauses before, and the stopBefore choice that turns each off.
const PAUSE_STEPS = { spend: "money", delete: "deletes", "message-new": "messageNew" };
const ALWAYS_STEPS = ["stop", "kill"];
const ID_FIELDS = ["accountId", "account", "acct", "acctId", "account_id", "owner", "ownerId", "personId", "seatId"];

// Request text only: strings (and numbers) pass, anything else reads as "".
// Never String() an object from a request: {toString:"x"} throws.
function str(v) {
  return typeof v === "string" ? v : typeof v === "number" && isFinite(v) ? String(v) : "";
}

// Plain text only: drop control characters and angle brackets, fold space, cap length.
function plain(value, max) {
  return str(value)
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max || 80);
}

function wants(req, body) {
  const q = (req && req.query) || {};
  const url = String((req && req.url) || "");
  if (req.method === "GET") return q.settings === "1" || /[?&]settings=1(?:&|$)/.test(url);
  if (req.method === "DELETE") return true;
  if (req.method === "POST") return ACTIONS.indexOf(str(body && body.action).toLowerCase()) >= 0;
  return false;
}

function refuse(res, status, error, extra) {
  return res.status(status).json(Object.assign({ ok: false, error: error }, extra || {}));
}

// A write body must be a plain object (prototype Object.prototype or null), so
// no field is ever read from a prototype (Probe 355 note: a body whose
// prototype carries allow.money:true). Same 400 as a field of the wrong type.
const BODY_NOT_PLAIN = "Send the request as a plain object. Nothing was saved.";
function plainBody(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

// Own seat only. Owners reach their own account. A helper, family, friend,
// member, or staff seat reaches only an account of its own, never the desk
// owner's. Waiting, denied, Desk AI, and unknown seats get nothing.
function ownSeat(req) {
  const slug = lib.workspaceOf(req);
  const found = lib.personOf(req, slug);
  if (found.pending) return { status: 403, error: "That seat is waiting on the owner.", pending: true };
  if (found.denied) return { status: 403, error: "That seat is not open." };
  const person = found.person;
  const row = found.workspace;
  if (!row || !person) return { status: 401, error: "Sign in first." };
  if (person.status && person.status !== "approved") return { status: 403, error: "That seat is waiting on the owner." };
  const kind = String(person.kind || "").toLowerCase();
  if (kind === "agent" || person.deskAi || String(person.role || "").toLowerCase() === "agent") {
    return { status: 403, error: "Desk AIs have no account settings." };
  }
  const accounts = lib.mem.accounts || [];
  let acc = null;
  if (lib.isOwner(person)) {
    acc = require("./_account").homeAccount(person, row);
  } else {
    acc = person.accountId ? accounts.find((a) => a && a.id === person.accountId) || null : null;
    if (acc && (acc.id === row.accountId || (acc.desks || []).indexOf(row.slug) >= 0)) acc = null;
    if (!acc) return { status: 403, error: "This seat has no AIA account of its own." };
  }
  if (!acc || !acc.id) return { status: 403, error: "No AIA account on this seat." };
  const session = found.session;
  if (session && session.accountId && session.accountId !== acc.id) {
    return { status: 403, error: "This sign-in belongs to a different account." };
  }
  if (session && !session.accountId && session.workspace && session.workspace !== row.slug) {
    return { status: 403, error: "This sign-in belongs to a different account." };
  }
  return { ok: true, row, person, account: acc };
}

function askedOther(req, body, acc) {
  const q = (req && req.query) || {};
  const srcs = [body || {}, q, (body && body.set) || {}];
  for (let i = 0; i < srcs.length; i++) {
    const src = srcs[i];
    if (!src || typeof src !== "object") continue;
    for (let j = 0; j < ID_FIELDS.length; j++) {
      const k = ID_FIELDS[j];
      if (src[k] == null || src[k] === "") continue;
      if (typeof src[k] !== "string" && typeof src[k] !== "number") return true;
      if (String(src[k]) !== String(acc.id)) return true;
    }
  }
  return false;
}

function settingsOf(acc) {
  if (!acc.settings || typeof acc.settings !== "object") acc.settings = {};
  const s = acc.settings;
  if (!s.automations || typeof s.automations !== "object") s.automations = {};
  if (!s.look || typeof s.look !== "object") s.look = {};
  return s;
}

// accountKindFrom(value), for sign-up: "human" when missing (undefined) or
// blank, the kind when it is one of human, ai, si, and null for anything else,
// null included (the caller answers 400). Only a real string counts: an
// object, array, or number is null.
function accountKindFrom(value) {
  if (value === undefined) return "human";
  if (typeof value !== "string") return null;
  const k = value.trim().toLowerCase();
  if (!k) return "human";
  return ACCOUNT_KINDS.indexOf(k) >= 0 ? k : null;
}

// Stored kind. No account, or a legacy account with no kind field: human.
// Any stored value that is not human, ai, or si ("agent", "", null, 7, an
// object): ai, so the self-lock and the pauses apply.
function kindOf(acc) {
  if (!acc || acc.kind === undefined) return "human";
  const k = typeof acc.kind === "string" ? acc.kind.trim().toLowerCase() : "";
  return ACCOUNT_KINDS.indexOf(k) >= 0 ? k : "ai";
}

// Who did it, as a kind. Desk AI seats are "ai". Otherwise the kind of the
// seat's own account, or the desk's account for an owner seat. Never creates an account.
function actorKind(person, row, acc) {
  if (acc) return kindOf(acc);
  if (person && (person.deskAi || String(person.kind || "").toLowerCase() === "agent" || String(person.role || "").toLowerCase() === "agent")) return "ai";
  const accounts = lib.mem.accounts || [];
  let hit = person && person.accountId ? accounts.find((a) => a && a.id === person.accountId) : null;
  if (!hit && row && (!person || lib.isOwner(person))) hit = accounts.find((a) => a && (a.id === row.accountId || (a.desks || []).indexOf(row.slug) >= 0));
  return kindOf(hit);
}

// One stamp for every account and desk history entry: who did it and their kind.
function stampWho(person, row, acc, fallback) {
  return { who: plain((person && person.name) || fallback || "You", 80), whoKind: actorKind(person, row, acc) };
}

// needsPause(kind, automation, actionType): true when an AI or SI account is
// about to spend, delete, or message someone new and the owner has not turned
// that stop-before off for this one automation (stopBefore.money / deletes /
// messageNew === false). Humans never pause here. Stop and Kill never pause.
function needsPause(kind, automation, actionType) {
  const k = accountKindFrom(kind) || "ai";
  if (k !== "ai" && k !== "si") return false;
  const key = PAUSE_STEPS[str(actionType).toLowerCase()];
  if (!key) return false;
  const sb = automation && automation.stopBefore;
  return !(sb && sb[key] === false);
}

// Only object entries count; null or other junk in stored history is skipped.
function historyOf(acc) {
  if (!Array.isArray(acc.history)) acc.history = [];
  acc.history = acc.history.filter((h) => h && typeof h === "object" && !Array.isArray(h));
  return acc.history;
}

// Read-only view of history for GET: never writes the account.
function historyView(acc) {
  return (Array.isArray(acc.history) ? acc.history : []).filter((h) => h && typeof h === "object" && !Array.isArray(h));
}

function addHistory(acc, person, section, what, whoKind) {
  const stamp = stampWho(person, null, acc);
  const row = {
    at: new Date().toISOString(),
    who: stamp.who,
    whoKind: whoKind || stamp.whoKind,
    section: section,
    what: plain(what, 200)
  };
  const list = historyOf(acc);
  list.unshift(row);
  acc.history = list.slice(0, HISTORY_MAX);
  return row;
}

function secretKey() {
  const raw = String(process.env[SECRET_ENV] || "");
  if (raw.length < SECRET_KEY_MIN) return null;
  return crypto.createHash("sha256").update("aia-account-secret|v1|" + raw).digest();
}

function seal(acc, name, value) {
  const key = secretKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(acc.id + "|" + name, "utf8"));
  const data = Buffer.concat([cipher.update(Buffer.from(String(value), "utf8")), cipher.final()]);
  return { aia: SEAL_TAG, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

// Server-side only, for a future pipe that needs the value. Never wired to a reply.
function openSecret(acc, name) {
  const key = secretKey();
  const hit = (acc && Array.isArray(acc.secrets) ? acc.secrets : []).find((s) => s && s.name === name);
  if (!key || !hit || !hit.sealed || hit.sealed.aia !== SEAL_TAG) return null;
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(hit.sealed.iv, "base64"));
    d.setAAD(Buffer.from(acc.id + "|" + name, "utf8"));
    d.setAuthTag(Buffer.from(hit.sealed.tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(hit.sealed.data, "base64")), d.final()]).toString("utf8");
  } catch (e) {
    return null;
  }
}

function publicSecrets(acc) {
  return (Array.isArray(acc.secrets) ? acc.secrets : [])
    .filter((s) => s && s.name)
    .map((s) => ({ name: s.name, set: true, updatedAt: s.updatedAt || s.createdAt || "" }));
}

function ownedDesks(acc) {
  const slugs = acc.desks || [];
  return (lib.mem.workspaces || []).filter((w) => w && (slugs.indexOf(w.slug) >= 0 || (w.accountId && w.accountId === acc.id)));
}

// Safer default until James decides: an AI or SI account cannot change its own
// kind or turn off its own pauses. Only the human owner of the desk it sits on can.
const SELF_LOCK = "An AI or SI account can't change this itself. The human owner can.";
function selfLocked(acc) {
  return kindOf(acc) !== "human";
}

function automationsOf(row) {
  const ais = require("./_ais");
  const out = [];
  lib.ensureRules(row).forEach((r) => {
    if (r && r.id) out.push({ kind: "rule", id: String(r.id), name: plain(r.text, 80) });
  });
  const seen = {};
  ais.deskAisOf(row).slice(0, 12).forEach((a) => {
    const id = plain((a && (a.id || a.name)) || "", 40);
    if (!id || seen[id.toLowerCase()]) return;
    seen[id.toLowerCase()] = true;
    out.push({ kind: "ai", id: id, name: plain(a.name || id, 40) });
  });
  return out;
}

function autoKey(slug, kind, id) {
  return slug + ":" + kind + ":" + id;
}

function stopBeforeOf(acc, key) {
  const saved = settingsOf(acc).automations[key] || {};
  const sb = saved.stopBefore || {};
  const out = {};
  STOP_KEYS.forEach((k) => { out[k] = sb[k] !== false; });
  return out;
}

function desksSection(acc, person) {
  const mine = require("./_account").desksForPerson({ id: person.id, name: person.name, email: person.email, pin: person.pin, accountId: acc.id });
  const cards = [].concat(mine.owned || [], mine.member || []);
  const seen = {};
  return cards.filter((c) => c && c.slug && !seen[c.slug] && (seen[c.slug] = true)).map((c) => {
    const row = (lib.mem.workspaces || []).find((w) => w && w.slug === c.slug) || {};
    return {
      slug: c.slug,
      name: plain(row.biz || row.name || c.slug, 80),
      yours: c.yours === "own" ? "own" : "member",
      pack: row.pack ? { id: plain(row.pack, 60), name: plain(row.packName || row.pack, 60) } : null,
      automations: automationsOf(row).map((a) => ({ kind: a.kind, id: a.id, name: a.name })),
      allowList: { available: false }
    };
  });
}

function automationSection(acc) {
  const rows = [];
  ownedDesks(acc).forEach((row) => {
    automationsOf(row).forEach((a) => {
      const key = autoKey(row.slug, a.kind, a.id);
      const saved = settingsOf(acc).automations[key] || {};
      rows.push({ desk: row.slug, kind: a.kind, id: a.id, name: a.name, stopBefore: stopBeforeOf(acc, key), updatedAt: saved.updatedAt || "" });
    });
  });
  return {
    available: true,
    stopAndKill: { always: true, canTurnOff: false, note: "Stop and Kill always work. They cannot be switched off." },
    runOnItsOwn: { available: false },
    note: "AIA still waits for a person on every card today. These stop-before choices are saved for when run-on-its-own ships.",
    items: rows
  };
}

function settingsReply(acc, person) {
  const s = settingsOf(acc);
  return {
    ok: true,
    settings: {
      account: { id: acc.id },
      profile: {
        available: true,
        kind: kindOf(acc),
        kindChoices: ACCOUNT_KINDS.slice(),
        name: plain(acc.ownerName || "", 80),
        email: plain(acc.email || "", 120),
        phone: plain(acc.phone || "", 32),
        city: plain(acc.city || "", 60),
        state: plain(acc.state || "", 40),
        timezone: plain(acc.timezone || "", 60),
        hours: plain(acc.hours || "", 80),
        note: plain(acc.note || "", 240)
      },
      talk: {
        available: true,
        reach: REACH.indexOf(acc.reach) >= 0 ? acc.reach : "",
        reachChoices: REACH.slice(),
        notify: { available: false }
      },
      desks: { available: true, items: desksSection(acc, person) },
      automations: automationSection(acc),
      look: { available: true, theme: THEMES.indexOf(s.look.theme) >= 0 ? s.look.theme : "system", themes: THEMES.slice() },
      secrets: { available: !!secretKey(), items: publicSecrets(acc), max: SECRET_MAX },
      connections: { available: true, items: require("./_account-connect").publicConnections(acc), setupCards: Array.isArray(acc.setupCards) ? acc.setupCards.length : 0, note: "Saved here only. AIA does not sign in to these services." },
      history: historyView(acc).slice(0, HISTORY_SHOW).map((h) => Object.assign({ at: h.at, who: h.who, section: h.section, what: h.what }, h.whoKind ? { whoKind: h.whoKind } : {}))
    }
  };
}

function onlyKeys(set, allowed) {
  const bad = Object.keys(set || {}).filter((k) => allowed.indexOf(k) < 0);
  return bad.length ? bad : null;
}

// Any field that names Stop or Kill is refused. Only the nested stopBefore
// choices (money, deletes, messageNew) are allowed, and only on automations.
function touchesStopKill(set) {
  const top = Object.keys(set || {}).some((k) => k !== "stopBefore" && /stop|kill/i.test(k));
  const sb = set && set.stopBefore;
  const nested = sb && typeof sb === "object" ? Object.keys(sb).some((k) => /stop|kill/i.test(k)) : false;
  return top || nested;
}

const KIND_CLEAR = "A kind can't be cleared. Pick human, ai, or si. Nothing changed.";
function applyProfile(acc, set, opts) {
  const bad = onlyKeys(set, Object.keys(PROFILE_LIMITS).concat(["kind"]));
  if (bad) return { ok: false, status: 400, error: "Not a profile field: " + plain(bad.join(", "), 80) };
  // kind: human, ai, or si. Checked before anything changes. A kind key that
  // is null, undefined, or blank would clear the stored kind (and a cleared
  // kind reads as human), so it is refused: nobody clears a kind.
  let wantKind = null;
  if (Object.prototype.hasOwnProperty.call(set, "kind")) {
    const v = set.kind;
    if (v === undefined || v === null || (typeof v === "string" && !v.trim())) return { ok: false, status: 400, error: KIND_CLEAR };
    wantKind = typeof v === "string" ? accountKindFrom(v) : null;
    if (!wantKind) return { ok: false, status: 400, error: "Pick human, ai, or si." };
  }
  if (wantKind && wantKind !== kindOf(acc) && selfLocked(acc) && !(opts && opts.byHumanOwner)) {
    return { ok: false, status: 403, error: SELF_LOCK, record: "Refused: this " + kindOf(acc) + " account tried to change its own kind to " + wantKind + ". Nothing changed." };
  }
  const changed = [];
  const kindWas = kindOf(acc);
  Object.keys(set).forEach((k) => {
    if (k === "email" || k === "kind") return;
    if (typeof set[k] !== "string") return;
    const v = plain(set[k], PROFILE_LIMITS[k]);
    const field = k === "name" ? "ownerName" : k;
    if ((acc[field] || "") !== v) { acc[field] = v; changed.push(k); }
  });
  if (set.email != null) {
    const accMod = require("./_account");
    if (typeof set.email !== "string") return { ok: false, status: 400, error: "That email does not look right." };
    const e = set.email.trim().toLowerCase();
    if (e && !accMod.looksLikeEmail(e)) return { ok: false, status: 400, error: "That email does not look right." };
    if (e && accMod.emailTaken(e, acc.id)) return { ok: false, status: 409, error: "That email is already on another AIA account." };
    if ((acc.email || "") !== e) { acc.email = e; changed.push("email"); }
  }
  if (wantKind && (acc.kind !== wantKind)) {
    acc.kind = wantKind;
    if (kindWas !== wantKind) changed.push("kind from " + kindWas + " to " + wantKind);
  }
  return { ok: true, what: changed.length ? "Changed " + changed.join(", ") + " on your profile." : "Saved your profile. Nothing changed." };
}

function applyTalk(acc, set) {
  const bad = onlyKeys(set, ["reach"]);
  if (bad) return { ok: false, status: 400, error: "Not a talk field: " + plain(bad.join(", "), 80) };
  const reach = str(set.reach).toLowerCase();
  if (REACH.indexOf(reach) < 0) return { ok: false, status: 400, error: "Pick call, text, or email." };
  acc.reach = reach;
  return { ok: true, what: "AIA reaches you by " + reach + "." };
}

function applyLook(acc, set) {
  const bad = onlyKeys(set, ["theme"]);
  if (bad) return { ok: false, status: 400, error: "Not a look field: " + plain(bad.join(", "), 80) };
  const theme = str(set.theme).toLowerCase();
  if (THEMES.indexOf(theme) < 0) return { ok: false, status: 400, error: "Pick system, light, or dark." };
  settingsOf(acc).look.theme = theme;
  return { ok: true, what: "Look set to " + theme + "." };
}

// desks: where to look. The account's own desks unless the human owner's
// forSeat path passes its own desk.
function findAutomation(acc, set, desks) {
  const slug = lib.slugify(str(set.desk));
  const kind = str(set.kind).toLowerCase();
  const id = str(set.id).slice(0, 80);
  const row = (desks || ownedDesks(acc)).find((w) => w.slug === slug);
  if (!row) return { ok: false, status: 404, error: "Not one of your desks." };
  const hit = automationsOf(row).find((a) => a.kind === kind && a.id === id);
  if (!hit) return { ok: false, status: 404, error: "No automation like that on this desk." };
  return { ok: true, row, hit, kind, id, key: autoKey(row.slug, kind, id) };
}

// One step an automation wants to take. Never does the step: run-on-its-own is
// not here yet. AI and SI accounts pause before spend, delete, message-new
// unless this automation's stop-before is off. Spend is still held by Collect
// HOLD for every kind. Stop and Kill always go through on the actor's own
// desk: the desk its seat is on (the default when no desk is named) or a desk
// its account owns. Any other desk is refused and nothing is written.
function onOwnDesk(acc, body, seatRow) {
  const named = body.desk != null && body.desk !== "";
  const slug = named ? lib.slugify(str(body.desk)) : (seatRow && seatRow.slug) || "";
  if (!slug) return false;
  if (seatRow && slug === seatRow.slug) return true;
  return ownedDesks(acc).some((w) => w.slug === slug);
}

function automationStep(acc, body, seatRow) {
  const step = str(body.step).toLowerCase();
  if (ALWAYS_STEPS.indexOf(step) >= 0) {
    if (!onOwnDesk(acc, body, seatRow)) return { ok: false, status: 403, error: "Stop and Kill work on your own desk only. Nothing was done." };
    return { ok: true, status: 200, step, paused: false, done: false, reply: "Stop and Kill always work." };
  }
  if (!PAUSE_STEPS[step]) return { ok: false, status: 400, error: "Pick spend, delete, or message-new." };
  const found = findAutomation(acc, body);
  if (!found.ok) return found;
  const kind = kindOf(acc);
  const label = (found.kind === "ai" ? "Desk AI " : "rule ") + "\"" + plain(found.hit.name, 60) + "\" on " + plain(found.row.biz || found.row.name || found.row.slug, 60);
  const words = step === "spend" ? "spending money" : step === "delete" ? "deleting something" : "messaging someone new";
  if (needsPause(kind, settingsOf(acc).automations[found.key], step)) {
    return { ok: false, status: 409, step, paused: true, held: false, done: false, charged: false, record: true,
      error: "Paused before " + words + " for " + label + ". This " + kind + " account waits for the owner. Nothing was done." };
  }
  if (step === "spend") {
    return { ok: false, status: 409, step, paused: false, held: true, done: false, charged: false, record: true,
      error: "Collect stays HOLD. Nothing was charged for " + label + "." };
  }
  return { ok: true, status: 200, step, paused: false, held: false, done: false, charged: false,
    reply: "Not paused for " + label + ". Run on its own is not here yet, so a person still taps on the card." };
}

function applyAutomation(acc, set, opts) {
  if (touchesStopKill(set)) return { ok: false, status: 400, error: "Stop and Kill always work. They cannot be switched off." };
  if (set.runOnItsOwn != null || set.auto != null || set.autoRun != null) {
    return { ok: false, status: 409, error: "Run on its own is not here yet. Nothing was changed." };
  }
  if (set.stopBefore != null) {
    if (typeof set.stopBefore !== "object" || Array.isArray(set.stopBefore)) return { ok: false, status: 400, error: "stopBefore must list money, deletes, or messageNew." };
    const odd = Object.keys(set.stopBefore).filter((k) => STOP_KEYS.indexOf(k) < 0);
    if (odd.length) return { ok: false, status: 400, error: "Not a stop-before choice: " + plain(odd.join(", "), 80) };
    const flat = Object.assign({}, set);
    delete flat.stopBefore;
    STOP_KEYS.forEach((k) => { if (set.stopBefore[k] != null) flat[k] = set.stopBefore[k]; });
    set = flat;
  }
  const bad = onlyKeys(set, ["desk", "kind", "id"].concat(STOP_KEYS));
  if (bad) return { ok: false, status: 400, error: "Not an automation field: " + plain(bad.join(", "), 80) };
  const found = findAutomation(acc, set, opts && opts.desks);
  if (!found.ok) return found;
  const { row, hit, kind, id } = found;
  const flips = STOP_KEYS.filter((k) => set[k] != null);
  if (!flips.length) return { ok: false, status: 400, error: "Say which stop to change: money, deletes, or messageNew." };
  for (let i = 0; i < flips.length; i++) {
    if (typeof set[flips[i]] !== "boolean") return { ok: false, status: 400, error: "Use true or false." };
  }
  const key = autoKey(row.slug, kind, id);
  const all = settingsOf(acc).automations;
  const now = stopBeforeOf(acc, key);
  const label = (kind === "ai" ? "Desk AI " : "rule ") + "\"" + plain(hit.name, 60) + "\" on " + plain(row.biz || row.name || row.slug, 60);
  const offs = flips.filter((k) => set[k] === false && now[k] !== false);
  if (offs.length && selfLocked(acc) && !(opts && opts.byHumanOwner)) {
    return { ok: false, status: 403, error: SELF_LOCK, record: "Refused: this " + kindOf(acc) + " account tried to turn off its own stop before " + offs.map((k) => STOP_WORDS[k]).join(", ") + " for " + label + ". Nothing changed." };
  }
  const words = [];
  flips.forEach((k) => {
    if (now[k] !== set[k]) words.push((set[k] ? "Turned on" : "Turned off") + " stop before " + STOP_WORDS[k]);
    now[k] = set[k];
  });
  all[key] = { stopBefore: now, updatedAt: new Date().toISOString() };
  return { ok: true, what: (words.length ? words.join("; ") : "Kept stop-before as it was") + " for " + label + "." };
}

// The human owner acting for an AI or SI seat on their own desk: the owner
// seat (lib.isOwner) of the desk the seat sits on, whose own account is human.
// forSeat names that seat's exact id on this desk, and the seat must be
// accepted (status "approved"); a waiting or denied seat is refused. Only
// stop-before, only on this desk. Kind is account-wide, so forSeat never
// changes it.
const FOR_SEAT_KIND = "Kind is account-wide, so it can't be changed for a seat from one desk. Nothing changed.";
function humanOwnerTarget(seat, body) {
  const no = { ok: false, status: 403, error: "Only the human owner of this desk can change this for an AI or SI seat." };
  if (!lib.isOwner(seat.person) || kindOf(seat.account) !== "human") return no;
  if (typeof body.forSeat !== "string") return { ok: false, status: 400, error: "Name the seat by its id." };
  const id = body.forSeat.slice(0, 80);
  const same = (seat.row.people || []).filter((x) => x && x.id === id && !lib.isOwner(x));
  if (same.some((x) => x.status !== "approved")) return { ok: false, status: 403, error: "That seat is not accepted on your desk. Nothing changed." };
  const p = same.find((x) => x.accountId);
  const target = p ? (lib.mem.accounts || []).find((a) => a && a.id === p.accountId) : null;
  if (!target || target.id === seat.account.id || !selfLocked(target)) return { ok: false, status: 404, error: "No AI or SI seat like that on this desk." };
  return { ok: true, account: target, seatId: id };
}

async function handle(req, res) {
  let body = {};
  if (req.method === "POST") {
    try { body = await lib.readBody(req); } catch (e) { return refuse(res, 400, "That request did not read."), true; }
    req.body = body;
  }
  const connectAction = req.method === "POST" && require("./_account-connect").ACTIONS.indexOf(str(body && body.action).toLowerCase()) >= 0;
  if (!connectAction && !wants(req, body)) return false;
  // Store guard (#350): while the store is not ready every saving request,
  // automation-step, Stop/Kill and the connection actions included, is the
  // same 503 store_not_ready, and nothing runs. No-op on a tree without
  // lib.storeNotReady.
  if (req.method !== "GET" && typeof lib.storeNotReady === "function" && lib.storeNotReady(res)) return true;
  if (connectAction) return (await require("./_account-connect").handle(req, res, body)), true;
  const seat = ownSeat(req);
  if (!seat.ok) return refuse(res, seat.status, seat.error, seat.pending ? { pending: true } : null), true;
  const acc = seat.account;
  const person = seat.person;
  if (askedOther(req, body, acc)) return refuse(res, 403, "Settings only change your own account."), true;
  if (req.method === "POST" && !plainBody(body)) return refuse(res, 400, BODY_NOT_PLAIN), true;
  const whoKind = kindOf(acc);

  if (req.method === "GET") {
    return res.status(200).json(settingsReply(acc, person)), true;
  }

  const action = req.method === "DELETE" ? "secret-remove" : str(body.action).toLowerCase();
  if (action === "automation-step") {
    const extra = onlyKeys(body, ["action", "desk", "kind", "id", "step"].concat(ID_FIELDS));
    if (extra) return refuse(res, 400, "Not an automation step field: " + plain(extra.join(", "), 80)), true;
    const out = automationStep(acc, body, seat.row);
    if (out.record) {
      addHistory(acc, person, "automations", out.error, whoKind);
      lib.log("Account", (out.paused ? "Paused · " : "Held · ") + out.step, "Hold", seat.row.slug);
      await lib.save();
    }
    if (!out.ok && !out.record) return refuse(res, out.status || 400, out.error), true;
    delete out.record;
    return res.status(out.status).json(out), true;
  }
  if (action === "secret-set") {
    const extra = onlyKeys(body, ["action", "name", "value"].concat(ID_FIELDS));
    if (extra) return refuse(res, 400, "Not a secret field: " + plain(extra.join(", "), 80)), true;
    const name = str(body.name).trim();
    if (!SECRET_NAME.test(name)) return refuse(res, 400, "Name the secret with letters, numbers, dot, dash, or underscore (40 max)."), true;
    if (typeof body.value !== "string" || !body.value.length) return refuse(res, 400, "Paste the secret value."), true;
    if (body.value.length > SECRET_VALUE_MAX) return refuse(res, 400, "That secret is too long."), true;
    if (body.value === name || name.indexOf(body.value) >= 0) return refuse(res, 400, "The name must not be the secret itself."), true;
    if (!secretKey()) return refuse(res, 409, "Secrets are off until the server secret key is set. Nothing was saved.", { secretsReady: false }), true;
    if (!Array.isArray(acc.secrets)) acc.secrets = [];
    let hit = acc.secrets.find((s) => s && s.name === name);
    if (!hit && acc.secrets.length >= SECRET_MAX) return refuse(res, 409, "This account already has " + SECRET_MAX + " secrets. Remove one first."), true;
    const sealed = seal(acc, name, body.value);
    body.value = "";
    if (!sealed) return refuse(res, 409, "Secrets are off until the server secret key is set. Nothing was saved.", { secretsReady: false }), true;
    const at = new Date().toISOString();
    const replaced = !!hit;
    if (!hit) { hit = { name: name, createdAt: at }; acc.secrets.push(hit); }
    hit.sealed = sealed;
    hit.updatedAt = at;
    addHistory(acc, person, "secrets", (replaced ? "Replaced the secret named " : "Saved a secret named ") + name + ".");
    lib.log("Account", "Secret saved", "OK", seat.row.slug);
    await lib.save();
    return res.status(200).json({ ok: true, secret: { name: name, set: true, updatedAt: at }, secrets: publicSecrets(acc), hint: "Saved. It will not be shown again." }), true;
  }

  if (action === "secret-remove") {
    const q = req.query || {};
    const name = str(req.method === "DELETE" ? q.secret || q.name : body.name).trim();
    if (!SECRET_NAME.test(name)) return refuse(res, 400, "Name the secret to remove."), true;
    const before = Array.isArray(acc.secrets) ? acc.secrets.length : 0;
    acc.secrets = (acc.secrets || []).filter((s) => s && s.name !== name);
    if (acc.secrets.length === before) return refuse(res, 404, "No secret with that name."), true;
    addHistory(acc, person, "secrets", "Removed the secret named " + name + ".");
    lib.log("Account", "Secret removed", "OK", seat.row.slug);
    await lib.save();
    return res.status(200).json({ ok: true, removed: name, secrets: publicSecrets(acc) }), true;
  }

  if (body.forSeat != null && body.forSeat !== "") {
    const extraF = onlyKeys(body, ["action", "section", "set", "forSeat"]);
    if (extraF) return refuse(res, 400, "Not a settings field: " + plain(extraF.join(", "), 80)), true;
    const tgt = humanOwnerTarget(seat, body);
    if (!tgt.ok) return refuse(res, tgt.status, tgt.error), true;
    const secF = str(body.section).toLowerCase();
    const setF = body.set && typeof body.set === "object" && !Array.isArray(body.set) ? body.set : null;
    if (!setF) return refuse(res, 400, "Send the changes in set."), true;
    if (touchesStopKill(setF)) return refuse(res, 400, "Stop and Kill always work. They cannot be switched off."), true;
    let madeF;
    if (secF === "profile") {
      // Kind is account-wide: never through forSeat (locked default until AIA decides).
      const badF = onlyKeys(setF, ["kind"]);
      if (badF || setF.kind == null) madeF = { ok: false, status: 400, error: "For an AI or SI seat, only stop-before can change here." };
      else {
        addHistory(tgt.account, person, "profile", "Refused: the owner of " + plain(seat.row.biz || seat.row.name || seat.row.slug, 60) + " tried to change this account's kind for seat " + plain(tgt.seatId, 40) + ". Kind is account-wide. Nothing changed.", whoKind);
        lib.log("Account", "Refused · owner kind", "Hold", seat.row.slug);
        await lib.save();
        madeF = { ok: false, status: 403, error: FOR_SEAT_KIND };
      }
    } else if (secF === "automations" || secF === "automation") {
      // Resolved on the human owner's own desk (the owner's scope), never the AI's list.
      const ownerDesk = ownedDesks(seat.account).filter((w) => w.slug === seat.row.slug);
      madeF = lib.slugify(str(setF.desk)) !== seat.row.slug || !ownerDesk.length ? { ok: false, status: 403, error: "Only automations on your own desk." } : applyAutomation(tgt.account, setF, { byHumanOwner: true, desks: ownerDesk });
    } else madeF = { ok: false, status: 400, error: "For an AI or SI seat, pick automations." };
    if (!madeF.ok) return refuse(res, madeF.status || 400, madeF.error), true;
    const secW = secF === "automation" ? "automations" : secF;
    const what = madeF.what.replace(/ on your profile\.$/, " on this account.");
    addHistory(tgt.account, person, secW, what, whoKind);
    lib.log("Account", "Owner set · " + secW, "OK", seat.row.slug);
    await lib.save();
    return res.status(200).json({ ok: true, hint: what, seat: { id: tgt.seatId, kind: kindOf(tgt.account) } }), true;
  }

  // action === "settings"
  const extra = onlyKeys(body, ["action", "section", "set"].concat(ID_FIELDS));
  if (extra) return refuse(res, 400, "Not a settings field: " + plain(extra.join(", "), 80)), true;
  const section = str(body.section).toLowerCase();
  const set = body.set && typeof body.set === "object" && !Array.isArray(body.set) ? body.set : null;
  if (!set) return refuse(res, 400, "Send the changes in set."), true;
  if (touchesStopKill(set)) return refuse(res, 400, "Stop and Kill always work. They cannot be switched off."), true;
  let made;
  if (section === "profile") made = applyProfile(acc, set);
  else if (section === "talk") made = applyTalk(acc, set);
  else if (section === "look") made = applyLook(acc, set);
  else if (section === "automations" || section === "automation") made = applyAutomation(acc, set);
  else if (section === "desks" || section === "notify") made = { ok: false, status: 409, error: "That part is read-only here for now." };
  else made = { ok: false, status: 400, error: "Pick profile, talk, automations, or look." };
  const sec = section === "automation" ? "automations" : section;
  if (!made.ok && made.record) {
    addHistory(acc, person, sec, made.record, whoKind);
    lib.log("Account", "Refused · " + sec, "Hold", seat.row.slug);
    await lib.save();
  }
  if (!made.ok) return refuse(res, made.status || 400, made.error), true;
  addHistory(acc, person, sec, made.what, whoKind);
  lib.log("Account", "Settings saved · " + sec, "OK", seat.row.slug);
  await lib.save();
  const reply = settingsReply(acc, person);
  reply.hint = made.what;
  return res.status(200).json(reply), true;
}

module.exports = { handle, ownSeat, plainBody, BODY_NOT_PLAIN, askedOther, ownedDesks, addHistory, seal, secretKey, SECRET_NAME, SECRET_VALUE_MAX, SELF_LOCK, ID_FIELDS, plain, publicSecrets, openSecret, accountKindFrom, kindOf, actorKind, stampWho, needsPause, automationStep, SECRET_ENV, STOP_KEYS, THEMES, ACCOUNT_KINDS, PAUSE_STEPS };

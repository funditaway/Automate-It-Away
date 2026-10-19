// My account: connections and setup cards. POST /api/account with action
// connections | connect | connection-secret | disconnect | setup-cards | setup-card | setup-step.
// Shape: SHAPE.md in the PR. Helper only (underscore file, not a Vercel function).
// - The account is always the seat's own (336 ownSeat). Anything else is a plain 404.
// - "Connect" only saves a masked secret or a hook address. No outside sign-in, no OAuth,
//   no outside call, no model call. Status is "saved" ("Saved, not tested yet") until a live
//   test succeeds; no live test ships here, so nothing reads "tested" yet.
// - Secrets and hooks are sealed with 336's account-secret seal and never returned.
// - Bought / received is preview only: nothing bought, nothing charged, no Market lookup.
// - Stop and Kill on a setup card always answer 200 for the card's own account.
// - Every save goes through lib.save(); a failed save puts memory back and answers 503.
//   Stack note: when this stacks with PR 350, saves move to guardStore.
const crypto = require("crypto");
const lib = require("./_lib");

const ACTIONS = ["connections", "connect", "connection-secret", "disconnect", "setup-cards", "setup-card", "setup-step"];
const CONN_MAX = 20;
const CARD_MAX = 50;
const CARD_HISTORY_MAX = 100;
const SECRETS_PER_CONN = 5;
const BUNDLE_MAX = 8;
const HOOK_MAX = 500;
const SOURCE_TYPES = ["pack", "automation", "addon", "bundle"];
const ACTS = ["read", "draft", "spend", "delete", "message-new"];
const STEP_KINDS = ["connect", "secret", "approve", "test"];
const SKIPPABLE = ["connect", "secret"];
const ALLOW_KEYS = ["money", "deletes", "messageNew"];
const ALLOW_WORDS = { money: "money", deletes: "deletes", messageNew: "messaging someone new" };
const MONEY_WORDS = /^(buy|pay|price|checkout|charge|charged|amount|cost|purchase|card|payment)$/i;
const NO_ONE = "Nothing like that for this sign-in.";
const NOT_SAVED = "That did not save. Nothing changed. Try again.";
const SECRETS_OFF = "Secrets are off until the server secret key is set. Nothing was saved.";
const STATUS_TEXT = { saved: "Saved, not tested yet", tested: "Tested" };

function S() { return require("./_account-settings"); }
function plain(v, max) { return S().plain(v, max); }
function newId(prefix) { return prefix + "_" + crypto.randomBytes(5).toString("hex"); }
function now() { return new Date().toISOString(); }
function refuse(res, status, error, extra) { return res.status(status).json(Object.assign({ ok: false, error: error }, extra || {})); }
function badKeys(obj, allowed) {
  const bad = Object.keys(obj || {}).filter((k) => allowed.indexOf(k) < 0);
  return bad.length ? bad : null;
}
function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }

// ---- connections ----------------------------------------------------------

// Readers never create anything; only the push paths below add the arrays.
function connsOf(acc) { return Array.isArray(acc.connections) ? acc.connections : []; }
function cardsOf(acc) { return Array.isArray(acc.setupCards) ? acc.setupCards : []; }
function addConn(acc, conn) { if (!Array.isArray(acc.connections)) acc.connections = []; acc.connections.push(conn); }
function addCard(acc, card) { if (!Array.isArray(acc.setupCards)) acc.setupCards = []; acc.setupCards.push(card); }
function serviceIdOf(name) { return lib.slugify(String(name || "")).slice(0, 40); }

function publicConnection(c) {
  const status = c.status === "tested" ? "tested" : "saved";
  return {
    id: c.id,
    service: c.service,
    serviceId: c.serviceId,
    label: c.label || "",
    status: status,
    statusText: STATUS_TEXT[status],
    createdAt: c.createdAt || "",
    updatedAt: c.updatedAt || c.createdAt || "",
    secretNames: (c.secrets || []).filter((s) => s && s.name).map((s) => ({ name: s.name, set: !!s.sealed })),
    hookSet: !!(c.hook && c.hook.sealed)
  };
}
function publicConnections(acc) {
  return (Array.isArray(acc && acc.connections) ? acc.connections : []).filter((c) => c && c.id).map(publicConnection);
}

function hasSaved(c) {
  return !!(c && ((c.secrets || []).some((s) => s && s.sealed) || (c.hook && c.hook.sealed)));
}

function checkSecret(name, value) {
  const s = S();
  if (!s.SECRET_NAME.test(String(name || ""))) return "Name the secret with letters, numbers, dot, dash, or underscore (40 max).";
  if (typeof value !== "string" || !value.length) return "Paste the secret value.";
  if (value.length > s.SECRET_VALUE_MAX) return "That secret is too long.";
  if (value === name || String(name).indexOf(value) >= 0) return "The name must not be the secret itself.";
  return null;
}

function sealFor(acc, conn, field, value) {
  return S().seal(acc, "conn:" + conn.id + ":" + field, value);
}

// ---- cards ----------------------------------------------------------------

function stepTitle(kind, group) {
  if (kind === "connect") return group.service ? "Connect " + group.service : "Connect";
  if (kind === "secret") return "Enter the secret";
  if (kind === "approve") return "Approve allowed actions once";
  return "Test run (dry run)";
}

function groupFrom(item, idx) {
  const service = item.service ? plain(item.service, 40) : null;
  return {
    id: "g" + (idx + 1),
    name: plain(item.name || item.id || ("Item " + (idx + 1)), 60),
    type: item.type,
    service: service || null,
    serviceId: service ? serviceIdOf(service) : null,
    connectionId: item.connectionId || null,
    acts: (Array.isArray(item.acts) ? item.acts : []).map((a) => String(a).toLowerCase()).filter((a, i, all) => ACTS.indexOf(a) >= 0 && all.indexOf(a) === i)
  };
}

function cardStatusText(card) {
  if (card.status === "stopped") return "Stopped. Nothing runs from this card. Start it again to go on.";
  if (card.status === "killed") return "Killed. Nothing more happens on this card.";
  if (card.status === "done") return "Set up as a dry run. Nothing runs on its own yet.";
  const done = card.steps.filter((s) => s.state === "done" || s.state === "skipped").length;
  return "Open. " + done + " of " + card.steps.length + " steps done.";
}

function refresh(card) {
  if (card.status === "open" && card.steps.every((s) => s.state === "done" || s.state === "skipped")) card.status = "done";
  card.statusText = cardStatusText(card);
  card.updatedAt = now();
}

function cardEntry(card, step, kind, from, to, stamp, what) {
  const e = { at: now(), cardId: card.id, stepId: step ? step.id : "card", kind: kind, from: from, to: to, who: stamp.who, whoKind: stamp.whoKind, what: plain(what, 200) };
  if (!Array.isArray(card.history)) card.history = [];
  card.history.unshift(e);
  card.history = card.history.slice(0, CARD_HISTORY_MAX);
  return e;
}

function markStep(card, step, to, stamp, what, extra) {
  const from = step.state;
  step.state = to;
  step.reason = (extra && extra.reason) || "";
  step.at = now();
  step.who = stamp.who;
  step.whoKind = stamp.whoKind;
  Object.keys(extra || {}).forEach((k) => { if (k !== "reason") step[k] = extra[k]; });
  return cardEntry(card, step, step.kind, from, to, stamp, what);
}

function newCard(acc, source, groups, desk, stamp) {
  const card = {
    id: newId("setup"),
    key: source.key,
    source: { type: source.type, id: source.id, name: source.name, preview: source.type !== "connection" },
    deskId: null,
    status: "open",
    statusText: "",
    bought: false,
    charged: false,
    createdAt: now(),
    updatedAt: now(),
    createdBy: { who: stamp.who, whoKind: stamp.whoKind },
    groups: groups,
    steps: [{ id: "card.desk", group: "card", kind: "desk", title: "Pick a desk", state: "todo", reason: "" }],
    history: []
  };
  groups.forEach((g) => {
    STEP_KINDS.forEach((k) => {
      const st = { id: g.id + "." + k, group: g.id, kind: k, title: stepTitle(k, g), state: "todo", reason: "" };
      if (k === "secret") st.secretNames = [];
      if ((k === "connect" || k === "secret") && !g.service) { st.state = "skipped"; st.reason = "Needs no outside account."; }
      card.steps.push(st);
    });
  });
  cardEntry(card, null, "created", "", "open", stamp, (source.type === "connection" ? "Setup card for " : "Preview setup card for ") + source.name + ".");
  if (desk) markStep(card, card.steps[0], "done", stamp, "Picked the desk " + plain(desk.biz || desk.name || desk.slug, 60) + ".", { deskId: desk.slug });
  if (desk) card.deskId = desk.slug;
  groups.forEach((g) => {
    if (!g.connectionId) return;
    const conn = connsOf(acc).find((c) => c.id === g.connectionId);
    const cs = card.steps.find((s) => s.id === g.id + ".connect");
    if (conn && hasSaved(conn)) {
      markStep(card, cs, "done", stamp, "Saved " + conn.service + " on My account.", { connectionId: conn.id });
      const ss = card.steps.find((s) => s.id === g.id + ".secret");
      markStep(card, ss, "done", stamp, "A secret or hook is saved for " + conn.service + ".", { secretNames: publicConnection(conn).secretNames.map((n) => n.name) });
    }
  });
  refresh(card);
  return card;
}

function publicCard(card) {
  const out = JSON.parse(JSON.stringify(card));
  delete out.key;
  return out;
}

// ---- dry run --------------------------------------------------------------

function dryRun(acc, card, group, tryActs) {
  const s = S();
  const kind = s.kindOf(acc);
  const approve = card.steps.find((x) => x.id === group.id + ".approve");
  const allowed = (approve && approve.allowed) || {};
  const stopBefore = { money: allowed.money !== true, deletes: allowed.deletes !== true, messageNew: allowed.messageNew !== true };
  const conn = group.connectionId ? connsOf(acc).find((c) => c.id === group.connectionId) : null;
  const checks = [];
  if (group.service) checks.push({ what: "Secret or hook saved for " + group.service, ok: hasSaved(conn) });
  checks.push({ what: "Desk picked", ok: !!card.deskId });
  checks.push({ what: "Allowed actions approved once", ok: !!(approve && approve.state === "done") });
  const acts = group.acts.concat(tryActs || []).filter((a, i, all) => all.indexOf(a) === i);
  const rows = acts.map((act) => {
    const paused = s.needsPause(kind, { stopBefore: stopBefore }, act === "message-new" ? "message-new" : act);
    if (act === "spend") return { act, paused, held: true, done: false, charged: false, text: "Collect stays HOLD. Nothing was charged." };
    const words = act === "delete" ? "deleting something" : act === "message-new" ? "messaging someone new" : act === "draft" ? "drafting" : "reading";
    return { act, paused, held: false, done: false, charged: false, text: paused ? "Would stop before " + words + " and wait for a person." : "Would ask a person on the card before " + words + ". Nothing was done." };
  });
  return {
    dryRun: true, sent: false, outsideCalls: 0, modelCalls: 0, charged: false,
    checks: checks,
    acts: rows,
    text: "Dry run only. Nothing was sent." + (group.service ? " " + group.service + " stays " + STATUS_TEXT.saved + "." : "")
  };
}

// ---- save with put-back ---------------------------------------------------

function snap(acc) {
  return JSON.stringify({ connections: acc.connections, setupCards: acc.setupCards, history: acc.history });
}
function putBack(acc, was) {
  const w = JSON.parse(was);
  ["connections", "setupCards", "history"].forEach((k) => { if (w[k] === undefined) delete acc[k]; else acc[k] = w[k]; });
}
async function commit(acc, was) {
  let ok = false;
  try { ok = (await lib.save()) !== false; } catch (e) { ok = false; }
  if (!ok) putBack(acc, was);
  return ok;
}

// ---- handler --------------------------------------------------------------

async function handle(req, res, body) {
  const s = S();
  const action = String(body.action || "").toLowerCase();
  const seat = s.ownSeat(req);
  if (!seat.ok) return refuse(res, 404, NO_ONE);
  const acc = seat.account;
  const person = seat.person;
  if (s.askedOther(req, body, acc)) return refuse(res, 404, NO_ONE);
  const stamp = s.stampWho(person, null, acc);
  const desks = s.ownedDesks(acc);
  const deskOf = (id) => { const slug = lib.slugify(String(id || "")); return slug ? desks.find((w) => w.slug === slug) || null : null; };
  const idOk = s.ID_FIELDS;
  const was = snap(acc);
  const done = async (status, payload, accountLine, section) => {
    if (accountLine) s.addHistory(acc, person, section || "connections", accountLine, stamp.whoKind);
    if (!(await commit(acc, was))) return refuse(res, 503, NOT_SAVED);
    lib.log("Account", (section || "connections") + " · " + action, "OK", seat.row.slug);
    return res.status(status).json(payload);
  };

  if (action === "connections") {
    const extra = badKeys(body, ["action"].concat(idOk));
    if (extra) return refuse(res, 400, "Not a connections field: " + plain(extra.join(", "), 80));
    return res.status(200).json({ ok: true, connections: publicConnections(acc), max: CONN_MAX, note: "Saved here only. AIA does not sign in to these services." });
  }

  if (action === "connect") {
    const extra = badKeys(body, ["action", "service", "label", "secrets", "hook", "connectionId", "deskId"].concat(idOk));
    if (extra) return refuse(res, 400, "Not a connect field: " + plain(extra.join(", "), 80));
    let conn = null;
    if (body.connectionId != null && body.connectionId !== "") {
      conn = connsOf(acc).find((c) => c.id === String(body.connectionId));
      if (!conn) return refuse(res, 404, "No connection like that.");
    }
    const service = conn ? conn.service : plain(body.service, 40);
    if (!service || !serviceIdOf(service)) return refuse(res, 400, "Name the service.");
    const label = body.label != null ? plain(body.label, 60) : conn ? conn.label : "";
    if (!conn) conn = connsOf(acc).find((c) => c.serviceId === serviceIdOf(service) && (c.label || "") === label) || null;
    const secrets = body.secrets == null ? {} : body.secrets;
    if (!isObj(secrets)) return refuse(res, 400, "Send secrets as names and values.");
    const names = Object.keys(secrets);
    if (names.length > SECRETS_PER_CONN) return refuse(res, 400, "Up to " + SECRETS_PER_CONN + " secrets per connection.");
    for (let i = 0; i < names.length; i++) {
      const why = checkSecret(names[i], secrets[names[i]]);
      if (why) return refuse(res, 400, why);
    }
    const hook = body.hook == null || body.hook === "" ? null : body.hook;
    if (hook != null && (typeof hook !== "string" || !/^https:\/\/[^\s<>]+$/i.test(hook) || hook.length > HOOK_MAX)) return refuse(res, 400, "A hook address must start with https://.");
    const isNew = !conn;
    if (isNew && !names.length && !hook) return refuse(res, 400, "Paste a secret or a hook address to save.");
    if (isNew && connsOf(acc).length >= CONN_MAX) return refuse(res, 409, "This account already has " + CONN_MAX + " connections. Remove one first.");
    let desk = null;
    if (body.deskId != null && body.deskId !== "") { desk = deskOf(body.deskId); if (!desk) return refuse(res, 404, "Not one of your desks."); }
    if ((names.length || hook) && !s.secretKey()) return refuse(res, 409, SECRETS_OFF, { secretsReady: false });
    const at = now();
    if (isNew) conn = { id: newId("conn"), service: service, serviceId: serviceIdOf(service), label: label, status: "saved", createdAt: at, updatedAt: at, secrets: [], hook: null };
    if (!Array.isArray(conn.secrets)) conn.secrets = [];
    const sealedAll = [];
    for (let i = 0; i < names.length; i++) {
      const sealed = sealFor(acc, conn, "secret:" + names[i], secrets[names[i]]);
      if (!sealed) return refuse(res, 409, SECRETS_OFF, { secretsReady: false });
      sealedAll.push([names[i], sealed]);
    }
    const hookSealed = hook ? sealFor(acc, conn, "hook", hook) : null;
    if (hook && !hookSealed) return refuse(res, 409, SECRETS_OFF, { secretsReady: false });
    names.forEach((n) => { secrets[n] = ""; });
    body.hook = "";
    if (isNew) addConn(acc, conn);
    sealedAll.forEach(([n, sealed]) => {
      let hit = conn.secrets.find((x) => x.name === n);
      if (!hit) { hit = { name: n, createdAt: at }; conn.secrets.push(hit); }
      hit.sealed = sealed; hit.updatedAt = at;
    });
    if (hookSealed) conn.hook = { sealed: hookSealed, updatedAt: at };
    conn.label = label;
    conn.status = conn.status === "tested" && !names.length && !hook ? "tested" : "saved";
    conn.updatedAt = at;
    // One setup card per connection, ever.
    let card = cardsOf(acc).find((c) => c.key === "connection:" + conn.id && c.status !== "killed");
    let cardCreated = false;
    if (!card) {
      if (cardsOf(acc).length >= CARD_MAX) { putBack(acc, was); return refuse(res, 409, "This account already has " + CARD_MAX + " setup cards."); }
      card = newCard(acc, { key: "connection:" + conn.id, type: "connection", id: conn.id, name: service }, [groupFrom({ type: "connection", name: service + (label ? " (" + label + ")" : ""), service: service, connectionId: conn.id }, 0)], desk, stamp);
      addCard(acc, card);
      cardCreated = true;
    }
    const line = (isNew ? "Saved " : "Updated ") + service + (label ? " (" + label + ")" : "") + (names.length ? ": secret " + names.join(", ") : "") + (hook ? (names.length ? " and" : ":") + " hook address" : "") + ". Saved, not tested yet.";
    return done(200, { ok: true, created: isNew, connection: publicConnection(conn), card: publicCard(card), cardCreated: cardCreated, hint: STATUS_TEXT.saved + "." + (cardCreated ? " A setup card is waiting." : "") }, line);
  }

  if (action === "connection-secret") {
    const extra = badKeys(body, ["action", "connectionId", "name", "value"].concat(idOk));
    if (extra) return refuse(res, 400, "Not a secret field: " + plain(extra.join(", "), 80));
    const conn = connsOf(acc).find((c) => c.id === String(body.connectionId || ""));
    if (!conn) return refuse(res, 404, "No connection like that.");
    const name = String(body.name || "").trim();
    const why = checkSecret(name, body.value);
    if (why) return refuse(res, 400, why);
    if (!s.secretKey()) return refuse(res, 409, SECRETS_OFF, { secretsReady: false });
    if (!Array.isArray(conn.secrets)) conn.secrets = [];
    let hit = conn.secrets.find((x) => x.name === name);
    if (!hit && conn.secrets.length >= SECRETS_PER_CONN) return refuse(res, 409, "Up to " + SECRETS_PER_CONN + " secrets per connection.");
    const sealed = sealFor(acc, conn, "secret:" + name, body.value);
    body.value = "";
    if (!sealed) return refuse(res, 409, SECRETS_OFF, { secretsReady: false });
    const at = now();
    const replaced = !!hit;
    if (!hit) { hit = { name: name, createdAt: at }; conn.secrets.push(hit); }
    hit.sealed = sealed; hit.updatedAt = at;
    conn.status = "saved";
    conn.updatedAt = at;
    return done(200, { ok: true, name: name, set: true }, (replaced ? "Replaced the secret named " : "Saved a secret named ") + name + " on " + conn.service + ".");
  }

  if (action === "disconnect") {
    const extra = badKeys(body, ["action", "connectionId"].concat(idOk));
    if (extra) return refuse(res, 400, "Not a disconnect field: " + plain(extra.join(", "), 80));
    const conn = connsOf(acc).find((c) => c.id === String(body.connectionId || ""));
    if (!conn) return refuse(res, 404, "No connection like that.");
    acc.connections = connsOf(acc).filter((c) => c !== conn);
    cardsOf(acc).forEach((card) => {
      if (card.status === "killed") return;
      let hit = false;
      card.groups.forEach((g) => {
        if (g.connectionId !== conn.id) return;
        g.connectionId = null;
        hit = true;
        ["connect", "secret"].forEach((k) => {
          const st = card.steps.find((x) => x.id === g.id + "." + k);
          if (st) markStep(card, st, "blocked", stamp, "The connection to " + conn.service + " was removed.", { reason: "The connection was removed. Connect again to go on." });
        });
      });
      if (hit) { if (card.status === "done") card.status = "open"; refresh(card); }
    });
    return done(200, { ok: true, removed: conn.id, connections: publicConnections(acc) }, "Removed " + conn.service + (conn.label ? " (" + conn.label + ")" : "") + " and its saved secrets.");
  }

  if (action === "setup-cards") {
    const extra = badKeys(body, ["action", "deskId"].concat(idOk));
    if (extra) return refuse(res, 400, "Not a setup field: " + plain(extra.join(", "), 80));
    let list = cardsOf(acc);
    if (body.deskId != null && body.deskId !== "") {
      const desk = deskOf(body.deskId);
      if (!desk) return refuse(res, 404, "Not one of your desks.");
      list = list.filter((c) => c.deskId === desk.slug);
    }
    return res.status(200).json({ ok: true, cards: list.map(publicCard) });
  }

  if (action === "setup-card") {
    const extra = badKeys(body, ["action", "from", "deskId"].concat(idOk));
    if (extra) return refuse(res, 400, "Not a setup field: " + plain(extra.join(", "), 80));
    const from = body.from;
    if (!isObj(from)) return refuse(res, 400, "Pick what this is: connection, pack, automation, addon, or bundle.");
    const moneyKey = (o) => Object.keys(o || {}).some((k) => MONEY_WORDS.test(k));
    if (moneyKey(from) || (Array.isArray(from.items) && from.items.some((it) => isObj(it) && moneyKey(it)))) {
      return refuse(res, 409, "Collect stays HOLD. Nothing is bought here. This is a preview card.");
    }
    const type = String(from.type || "").toLowerCase();
    let desk = null;
    if (body.deskId != null && body.deskId !== "") { desk = deskOf(body.deskId); if (!desk) return refuse(res, 404, "Not one of your desks."); }
    let source, groups;
    if (type === "connection") {
      const bad = badKeys(from, ["type", "connectionId"]);
      if (bad) return refuse(res, 400, "Not a setup field: " + plain(bad.join(", "), 80));
      const conn = connsOf(acc).find((c) => c.id === String(from.connectionId || ""));
      if (!conn) return refuse(res, 404, "No connection like that.");
      source = { key: "connection:" + conn.id, type: "connection", id: conn.id, name: conn.service };
      groups = [groupFrom({ type: "connection", name: conn.service + (conn.label ? " (" + conn.label + ")" : ""), service: conn.service, connectionId: conn.id }, 0)];
    } else if (SOURCE_TYPES.indexOf(type) >= 0) {
      const itemKeys = ["type", "id", "name", "service", "acts"];
      const bad = badKeys(from, type === "bundle" ? ["type", "id", "name", "items"] : itemKeys);
      if (bad) return refuse(res, 400, "Not a setup field: " + plain(bad.join(", "), 80));
      const id = lib.slugify(String(from.id || from.name || "")).slice(0, 60);
      const name = plain(from.name || from.id, 60);
      if (!id || !name) return refuse(res, 400, "Name the " + type + ".");
      let items;
      if (type === "bundle") {
        if (!Array.isArray(from.items) || !from.items.length || from.items.length > BUNDLE_MAX) return refuse(res, 400, "A bundle needs 1 to " + BUNDLE_MAX + " items.");
        for (let i = 0; i < from.items.length; i++) {
          const it = from.items[i];
          if (!isObj(it)) return refuse(res, 400, "A bundle needs 1 to " + BUNDLE_MAX + " items.");
          const b2 = badKeys(it, itemKeys);
          if (b2) return refuse(res, 400, "Not a setup field: " + plain(b2.join(", "), 80));
          const t2 = String(it.type || "automation").toLowerCase();
          if (t2 === "bundle" || SOURCE_TYPES.indexOf(t2) < 0) return refuse(res, 400, "Pick what this is: connection, pack, automation, addon, or bundle.");
          if (!plain(it.name || it.id, 60)) return refuse(res, 400, "Name each item in the bundle.");
        }
        items = from.items.map((it) => Object.assign({}, it, { type: String(it.type || "automation").toLowerCase() }));
      } else items = [Object.assign({}, from, { type: type })];
      for (let i = 0; i < items.length; i++) {
        if (items[i].acts != null && !Array.isArray(items[i].acts)) return refuse(res, 400, "List acts as read, draft, spend, delete, or message-new.");
      }
      source = { key: type + ":" + id, type: type, id: id, name: name };
      groups = items.map((it, i) => groupFrom(it, i));
    } else return refuse(res, 400, "Pick what this is: connection, pack, automation, addon, or bundle.");
    const have = cardsOf(acc).find((c) => c.key === source.key && c.status !== "killed");
    const hint = source.type === "connection" ? STATUS_TEXT.saved + "." : "Preview only. Nothing was bought or charged.";
    if (have) return res.status(200).json({ ok: true, created: false, card: publicCard(have), hint: hint });
    if (cardsOf(acc).length >= CARD_MAX) return refuse(res, 409, "This account already has " + CARD_MAX + " setup cards.");
    const card = newCard(acc, source, groups, desk, stamp);
    addCard(acc, card);
    return done(200, { ok: true, created: true, card: publicCard(card), hint: hint }, "Setup card for " + source.name + (source.type === "connection" ? "." : " (preview, nothing bought)."), "setup");
  }

  if (action === "setup-step") {
    const extra = badKeys(body, ["action", "cardId", "stepId", "do", "reason", "deskId", "connectionId", "secret", "allow", "try", "live"].concat(idOk));
    if (extra) return refuse(res, 400, "Not a setup step field: " + plain(extra.join(", "), 80));
    const card = cardsOf(acc).find((c) => c.id === String(body.cardId || ""));
    if (!card) return refuse(res, 404, "No setup card like that.");
    const verb = String(body.do || "").toLowerCase();
    if (["done", "skip", "stop", "kill", "start"].indexOf(verb) < 0) return refuse(res, 400, "Pick done, skip, stop, kill, or start.");

    if (verb === "stop" || verb === "kill") {
      // Always 200 for the card's own account, in any state.
      const to = verb === "stop" ? "stopped" : "killed";
      if (card.status === to || (verb === "stop" && card.status === "killed")) {
        return res.status(200).json({ ok: true, changed: false, card: publicCard(card) });
      }
      const from = card.status;
      card.status = to;
      if (verb === "kill") {
        card.steps.forEach((st) => { if (st.state === "todo") { st.state = "blocked"; st.reason = "Killed. Nothing more happens on this card."; } });
      }
      refresh(card);
      const entry = cardEntry(card, null, verb, from, to, stamp, verb === "stop" ? "Stopped this setup card." : "Killed this setup card.");
      s.addHistory(acc, person, "setup", (verb === "stop" ? "Stopped" : "Killed") + " the setup card for " + card.source.name + ".", stamp.whoKind);
      let saved = false;
      try { saved = (await lib.save()) !== false; } catch (e) { saved = false; }
      const out = { ok: true, changed: true, saved: saved, card: publicCard(card), entry: entry };
      if (!saved) out.hint = (verb === "stop" ? "Stopped" : "Killed") + " here, but it did not save. Tap " + (verb === "stop" ? "Stop" : "Kill") + " again.";
      return res.status(200).json(out);
    }
    if (card.status === "killed") return refuse(res, 409, "This card was killed. Nothing more happens on it.");
    if (verb === "start") {
      if (card.status !== "stopped") return refuse(res, 409, "This card is not stopped.");
      card.status = "open";
      refresh(card);
      const entry = cardEntry(card, null, "start", "stopped", card.status, stamp, "Started this setup card again.");
      return done(200, { ok: true, card: publicCard(card), entry: entry }, "Started the setup card for " + card.source.name + " again.", "setup");
    }
    if (card.status === "stopped") return refuse(res, 409, "This card is stopped. Start it again to go on.");
    const step = card.steps.find((x) => x.id === String(body.stepId || ""));
    if (!step) return refuse(res, 404, "No step like that on this card.");
    if (step.state === "done" || step.state === "skipped") return refuse(res, 409, "That step is already done. Nothing changed.");
    const group = card.groups.find((g) => g.id === step.group) || null;
    // Order is enforced here, never by the page.
    if (step.kind !== "desk") {
      const before = card.steps.filter((x) => x.group === step.group && STEP_KINDS.indexOf(x.kind) < STEP_KINDS.indexOf(step.kind));
      const open = before.find((x) => x.state !== "done" && x.state !== "skipped");
      if (open) return refuse(res, 409, open.kind === "approve" ? "Approve allowed actions first." : "Do the earlier steps first: " + open.title + ".");
      if (step.kind === "approve" || step.kind === "test") {
        const ds = card.steps.find((x) => x.id === "card.desk");
        if (ds.state !== "done") return refuse(res, 409, "Do the earlier steps first: Pick a desk.");
      }
    }
    if (verb === "skip") {
      if (SKIPPABLE.indexOf(step.kind) < 0) return refuse(res, 400, "This step cannot be skipped.");
      const reason = plain(body.reason, 200);
      if (!reason) return refuse(res, 400, "Say why you are skipping this step.");
      const entry = markStep(card, step, "skipped", stamp, "Skipped " + step.title + ": " + reason, { reason: reason });
      refresh(card);
      return done(200, { ok: true, card: publicCard(card), step: Object.assign({}, step), entry: entry }, "Skipped " + step.title + " on the setup card for " + card.source.name + ".", "setup");
    }
    let entry;
    if (step.kind === "desk") {
      const desk = deskOf(body.deskId);
      if (!desk) return refuse(res, 404, "Not one of your desks.");
      card.deskId = desk.slug;
      entry = markStep(card, step, "done", stamp, "Picked the desk " + plain(desk.biz || desk.name || desk.slug, 60) + ".", { deskId: desk.slug });
    } else if (step.kind === "connect") {
      const conn = connsOf(acc).find((c) => c.id === String(body.connectionId || ""));
      if (!conn) return refuse(res, 404, "No connection like that.");
      if (group.serviceId && conn.serviceId !== group.serviceId) return refuse(res, 409, "That connection is for " + conn.service + ", not " + group.service + ".");
      if (!hasSaved(conn)) return refuse(res, 409, "Nothing is saved on that connection yet.");
      group.connectionId = conn.id;
      entry = markStep(card, step, "done", stamp, "Linked " + conn.service + (conn.label ? " (" + conn.label + ")" : "") + ". Saved, not tested yet.", { connectionId: conn.id });
    } else if (step.kind === "secret") {
      const conn = group.connectionId ? connsOf(acc).find((c) => c.id === group.connectionId) : null;
      if (!conn) return refuse(res, 409, "Do the earlier steps first: " + stepTitle("connect", group) + ".");
      let line = "A secret or hook is saved for " + conn.service + ".";
      if (body.secret != null) {
        if (!isObj(body.secret) || badKeys(body.secret, ["name", "value"])) return refuse(res, 400, "Send the secret as a name and a value.");
        const name = String(body.secret.name || "").trim();
        const why = checkSecret(name, body.secret.value);
        if (why) return refuse(res, 400, why);
        if (!s.secretKey()) return refuse(res, 409, SECRETS_OFF, { secretsReady: false });
        if (!Array.isArray(conn.secrets)) conn.secrets = [];
        let hit = conn.secrets.find((x) => x.name === name);
        if (!hit && conn.secrets.length >= SECRETS_PER_CONN) return refuse(res, 409, "Up to " + SECRETS_PER_CONN + " secrets per connection.");
        const sealed = sealFor(acc, conn, "secret:" + name, body.secret.value);
        body.secret.value = "";
        if (!sealed) return refuse(res, 409, SECRETS_OFF, { secretsReady: false });
        const at = now();
        if (!hit) { hit = { name: name, createdAt: at }; conn.secrets.push(hit); }
        hit.sealed = sealed; hit.updatedAt = at;
        conn.status = "saved"; conn.updatedAt = at;
        line = "Saved a secret named " + name + " for " + conn.service + ".";
      } else if (!hasSaved(conn)) return refuse(res, 400, "Paste the secret value.");
      entry = markStep(card, step, "done", stamp, line, { secretNames: publicConnection(conn).secretNames.map((n) => n.name) });
    } else if (step.kind === "approve") {
      const allow = body.allow == null ? {} : body.allow;
      if (!isObj(allow)) return refuse(res, 400, "Send allow with money, deletes, or messageNew.");
      if (Object.keys(allow).some((k) => /stop|kill/i.test(k))) return refuse(res, 400, "Stop and Kill always work. They cannot be switched off.");
      const odd = badKeys(allow, ALLOW_KEYS);
      if (odd) return refuse(res, 400, "Not an allowed action: " + plain(odd.join(", "), 80));
      for (let i = 0; i < ALLOW_KEYS.length; i++) {
        const v = allow[ALLOW_KEYS[i]];
        if (v != null && typeof v !== "boolean") return refuse(res, 400, "Use true or false.");
      }
      const offs = ALLOW_KEYS.filter((k) => allow[k] === true);
      if (offs.length && s.kindOf(acc) !== "human") {
        // 336 safer default: an AI or SI account cannot turn off its own pauses.
        const what = "Refused: this " + s.kindOf(acc) + " account tried to turn off its own stop before " + offs.map((k) => ALLOW_WORDS[k]).join(", ") + " for " + group.name + ". Nothing changed.";
        cardEntry(card, step, "refused", step.state, step.state, stamp, what);
        s.addHistory(acc, person, "setup", what, stamp.whoKind);
        await commit(acc, was);
        return refuse(res, 403, s.SELF_LOCK);
      }
      const allowed = { money: allow.money === true, deletes: allow.deletes === true, messageNew: allow.messageNew === true, stopAndKill: "always" };
      entry = markStep(card, step, "done", stamp, "Approved allowed actions once for " + group.name + ": " + (offs.length ? "may go without stopping first for " + offs.map((k) => ALLOW_WORDS[k]).join(", ") : "kept every stop-before on") + ". Stop and Kill always work.", { allowed: allowed });
    } else {
      if (body.live === true || body.live === "true") return refuse(res, 409, "A live test is not here yet. Nothing was sent.");
      const tryActs = body.try == null ? [] : body.try;
      if (!Array.isArray(tryActs) || tryActs.some((a) => ACTS.indexOf(String(a).toLowerCase()) < 0)) return refuse(res, 400, "List acts as read, draft, spend, delete, or message-new.");
      const result = dryRun(acc, card, group, tryActs.map((a) => String(a).toLowerCase()));
      entry = markStep(card, step, "done", stamp, "Dry run for " + group.name + ". Nothing was sent or charged.", { result: result });
    }
    refresh(card);
    return done(200, { ok: true, card: publicCard(card), step: JSON.parse(JSON.stringify(step)), entry: entry }, step.title + " on the setup card for " + card.source.name + ": done.", "setup");
  }
  return false;
}

module.exports = { ACTIONS, handle, publicConnections, publicConnection, STATUS_TEXT };

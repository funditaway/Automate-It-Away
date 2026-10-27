// My account follow-on for the desk: Pause, What this can do, Activity, Undo,
// and Export + Close. POST /api/account and a few GET flags on the same route.
// Helper only (underscore file, not a Vercel function). No desk.html.
//
// The account is always the proved seat (same ownSeat as settings and connections).
// A stranger, a waiting seat, a Desk AI seat, or another account id gets the
// same "Nothing like that for this sign-in." Create Desk AIs stay drafts.
// Run on its own stays off. Collect stays HOLD. Nothing here charges, sends,
// deletes an account, or turns Stop and Kill off.
const crypto = require("crypto");
const lib = require("./_lib");

const ACTIONS = ["pause", "unpause", "can-do", "activity", "undo", "export-close"];
const GET_FLAGS = ["pause", "can", "activity", "undo", "exportClose"];
const NO_ONE = "Nothing like that for this sign-in.";
const RUN_HOLD = "Run on its own is not here yet. Nothing was changed.";
const NOT_SAVED = "That did not save. Nothing changed. Try again.";
const CLOSE_HOLD = "Closing the account stays on hold. Nothing was deleted. Export your book, leave this phone, or leave the desk.";
const STOP_LINE = "You still tap Yes, Stop, or Kill. Those cannot be switched off.";
const DRAFT_LINE = "This Desk AI stays a draft. You tap Yes, Stop, or Kill.";
const OWN_LINE = "It does not run on its own.";
const COLLECT_LINE = "Collect stays HOLD. Nothing is charged.";
const STEP_WORDS = {
  qualify: "sort what came in and what it still needs",
  capture: "take in what you dropped",
  do: "draft the next step and the words, for you to check",
  follow: "draft a follow-up when a card is waiting"
};
const NEVER_WORDS = {
  send: "send",
  stop: "stop on its own",
  money: "pay",
  mail: "mail",
  yes: "tap Yes",
  kill: "kill"
};
const THEN_WORDS = {
  draft: "leave a draft on the card",
  queue: "put it on the queue",
  notify: "leave a note for you",
  note: "leave a note on the card",
  wait: "wait for a person",
  stop: "stop and wait for a person",
  tag: "add a tag",
  escalate: "hand it to a person"
};
const STOP_WORDS = { money: "money", deletes: "deletes", messageNew: "messaging someone new" };
const DO_WORDS = {
  export: "export",
  "leave-phone": "leave-phone",
  "leave-every-phone": "leave-every-phone",
  "leave-desk": "leave-desk",
  "close-desk": "close-desk",
  "open-desk": "open-desk",
  "close-account": "close-account"
};

function S() { return require("./_account-settings"); }
function str(v) {
  return typeof v === "string" ? v : typeof v === "number" && isFinite(v) ? String(v) : "";
}
function nowIso() { return new Date().toISOString(); }
function refuse(res, status, error, extra) {
  return res.status(status).json(Object.assign({ ok: false, error: error }, extra || {}));
}
function flagOn(req, name) {
  const q = (req && req.query) || {};
  if (q[name] === "1") return true;
  return new RegExp("[?&]" + name + "=1(?:&|$)").test(String((req && req.url) || ""));
}
function wants(req, body) {
  if (!req) return false;
  if (req.method === "GET") {
    const q = req.query || {};
    const url = String(req.url || "");
    if (q.settings === "1" || /[?&]settings=1(?:&|$)/.test(url)) return false;
    return GET_FLAGS.some((k) => flagOn(req, k));
  }
  if (req.method !== "POST" || !body || typeof body.action !== "string") return false;
  return ACTIONS.indexOf(body.action.toLowerCase()) >= 0;
}
function holdsRun(body) {
  if (!body || typeof body !== "object") return false;
  return ["runOnItsOwn", "auto", "autoRun"].some((k) => Object.prototype.hasOwnProperty.call(body, k));
}
function badKeys(obj, allowed) {
  const bad = Object.keys(obj || {}).filter((k) => allowed.indexOf(k) < 0);
  return bad.length ? bad : null;
}
function locked(acc) { return S().kindOf(acc) !== "human"; }
function owned(acc) { return S().ownedDesks(acc); }
function ownedRow(acc, desk) {
  const slug = lib.slugify(str(desk));
  if (!slug) return null;
  return owned(acc).find((w) => w && w.slug === slug) || null;
}
// forSeat stores the flag on the AI account, but the desk is the human owner's.
function deskFor(acc, seat, byHuman, desk) {
  const slug = lib.slugify(str(desk));
  if (!slug) return null;
  if (byHuman) {
    if (!seat || !seat.row || seat.row.slug !== slug) return null;
    if (!ownedRow(seat.account, slug)) return null;
    return seat.row;
  }
  return ownedRow(acc, slug);
}
function scopeDesks(acc, seat, byHuman) {
  if (byHuman) {
    if (!seat || !seat.row || !ownedRow(seat.account, seat.row.slug)) return [];
    return [seat.row];
  }
  return owned(acc);
}
function listAutos(row) {
  // automationsOf is not exported. Rebuild the same list the settings page uses.
  const s = S();
  const out = [];
  lib.ensureRules(row).forEach((r) => {
    if (r && r.id) out.push({ kind: "rule", id: String(r.id), name: s.plain(r.text, 80), rule: r });
  });
  const seen = {};
  require("./_ais").deskAisOf(row).slice(0, 12).forEach((a) => {
    const id = s.plain((a && (a.id || a.name)) || "", 40);
    if (!id || seen[id.toLowerCase()]) return;
    seen[id.toLowerCase()] = true;
    out.push({ kind: "ai", id: id, name: s.plain(a.name || id, 40), ai: a });
  });
  return out;
}
function findAuto(acc, desk, kind, id, desks) {
  const row = (desks || owned(acc)).find((w) => w && w.slug === lib.slugify(str(desk)));
  if (!row) return { ok: false, status: 404, error: NO_ONE };
  const hit = listAutos(row).find((a) => a.kind === kind && a.id === id);
  if (!hit) return { ok: false, status: 404, error: "No automation like that on this desk." };
  return { ok: true, row: row, hit: hit, key: row.slug + ":" + kind + ":" + id };
}
function readStop(acc, key) {
  const saved = acc.settings && acc.settings.automations && acc.settings.automations[key];
  const sb = saved && saved.stopBefore || {};
  return { money: sb.money !== false, deletes: sb.deletes !== false, messageNew: sb.messageNew !== false };
}
function readPaused(acc, key, slug) {
  const saved = acc.settings && acc.settings.automations && acc.settings.automations[key];
  const run = acc.settings && acc.settings.runs && acc.settings.runs[slug];
  return { item: !!(saved && saved.paused === true), desk: !!(run && run.paused === true) };
}
function ensureSettings(acc) {
  if (!acc.settings || typeof acc.settings !== "object" || Array.isArray(acc.settings)) acc.settings = {};
  return acc.settings;
}
function setItemPaused(acc, key, on) {
  const settings = ensureSettings(acc);
  if (!settings.automations || typeof settings.automations !== "object" || Array.isArray(settings.automations)) settings.automations = {};
  const prev = settings.automations[key] && typeof settings.automations[key] === "object" ? settings.automations[key] : {};
  const was = prev.paused === true;
  const next = Object.assign({}, prev);
  if (on) {
    next.paused = true;
    next.pausedAt = nowIso();
  } else {
    delete next.paused;
    delete next.pausedAt;
  }
  next.updatedAt = nowIso();
  settings.automations[key] = next;
  return was;
}
function setDeskPaused(acc, slug, on) {
  const settings = ensureSettings(acc);
  if (!settings.runs || typeof settings.runs !== "object" || Array.isArray(settings.runs)) settings.runs = {};
  const was = !!(settings.runs[slug] && settings.runs[slug].paused === true);
  if (on) settings.runs[slug] = { paused: true, pausedAt: nowIso(), updatedAt: nowIso() };
  else delete settings.runs[slug];
  return was;
}
function writeStop(acc, key, sb) {
  const settings = ensureSettings(acc);
  if (!settings.automations || typeof settings.automations !== "object" || Array.isArray(settings.automations)) settings.automations = {};
  const prev = settings.automations[key] && typeof settings.automations[key] === "object" ? settings.automations[key] : {};
  const next = { stopBefore: { money: sb.money !== false, deletes: sb.deletes !== false, messageNew: sb.messageNew !== false }, updatedAt: nowIso() };
  if (prev.paused === true) {
    next.paused = true;
    if (prev.pausedAt) next.pausedAt = prev.pausedAt;
  }
  settings.automations[key] = next;
}

// The frame hangs off the history line for that step (not a new account field).
// A stop-before change then still touches only that one automation. The line's
// public view never includes the frame, so a desk code kept for "you left" stays
// on the server. Non-enumerable pending so a compare of the account cannot see it
// before the history line is written.
const PENDING = Symbol.for("aia.undoPending");
function noteUndo(acc, frame) {
  if (!acc || !frame) return null;
  const s = S();
  const row = {
    id: "undo_" + crypto.randomBytes(4).toString("hex"),
    at: nowIso(),
    kind: frame.kind,
    label: s.plain(frame.label, 200),
    desk: frame.desk || "",
    key: frame.key || "",
    autoKind: frame.autoKind || "",
    autoId: frame.autoId || "",
    scope: frame.scope || "",
    beforePaused: frame.beforePaused === true,
    beforeClosed: frame.beforeClosed === true,
    before: frame.before || null,
    person: frame.person || null,
    memberDesk: frame.memberDesk || ""
  };
  Object.defineProperty(acc, PENDING, { value: row, writable: true, enumerable: false, configurable: true });
  return row;
}
function takePending(acc) {
  if (!acc) return null;
  const row = acc[PENDING] || null;
  if (row) delete acc[PENDING];
  return row;
}
function topUndo(acc) {
  const rows = historyRows(acc);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].undo && !rows[i].undo.done) return rows[i];
  }
  return null;
}

function snap(acc, row) {
  return {
    acc: JSON.stringify({
      settings: acc.settings,
      history: acc.history,
      undo: acc.undo,
      desks: acc.desks,
      memberDesks: acc.memberDesks
    }),
    desk: row ? JSON.stringify({ closed: row.closed, accepts: row.accepts, closedAt: row.closedAt, people: row.people }) : null,
    row: row || null
  };
}
function restore(acc, shot) {
  const w = JSON.parse(shot.acc);
  ["settings", "history", "undo", "desks", "memberDesks"].forEach((k) => {
    if (w[k] === undefined) delete acc[k];
    else acc[k] = w[k];
  });
  if (shot.row && shot.desk) {
    const d = JSON.parse(shot.desk);
    shot.row.closed = d.closed;
    shot.row.accepts = d.accepts;
    shot.row.closedAt = d.closedAt;
    shot.row.people = d.people;
  }
}
async function commit(acc, shot) {
  let ok = false;
  try { ok = (await lib.save()) !== false; } catch (e) { ok = false; }
  if (!ok) restore(acc, shot);
  return ok;
}

function draftOnlyFor(kind, scope) {
  return scope === "desk" || kind === "ai";
}
function pauseHint(on, kind, scope) {
  const stay = draftOnlyFor(kind, scope) ? " Desk AIs stay drafts." : "";
  if (scope === "desk") {
    return (on ? "Paused." : "Unpaused.") + stay + " You still tap Yes, Stop, or Kill. " + OWN_LINE;
  }
  if (kind === "ai") {
    return (on ? "Paused." : "Unpaused.") + " This Desk AI stays a draft. You still tap Yes, Stop, or Kill. " + OWN_LINE;
  }
  return (on ? "Paused." : "Unpaused.") + " You still tap Yes, Stop, or Kill on each card. " + OWN_LINE;
}
function baseFlags(extra) {
  return Object.assign({
    charged: false,
    collect: "hold",
    runOnItsOwn: false,
    deleted: false
  }, extra || {});
}

function stopLines(sb) {
  const on = [];
  const off = [];
  Object.keys(STOP_WORDS).forEach((k) => { (sb[k] === false ? off : on).push(STOP_WORDS[k]); });
  const lines = [];
  if (on.length) lines.push("It stops before " + on.join(", ") + ".");
  if (off.length) lines.push("Stop before " + off.join(", ") + " is off for this one. " + COLLECT_LINE + " " + OWN_LINE);
  return lines;
}

function canAutomation(acc, found) {
  const hit = found.hit;
  const paused = readPaused(acc, found.key, found.row.slug);
  const sb = readStop(acc, found.key);
  const lines = [];
  const allowed = { read: false, draft: false, spend: false, deletes: false, messageNew: false };
  if (hit.kind === "ai" && hit.ai) {
    const steps = Array.isArray(hit.ai.steps) ? hit.ai.steps : [];
    steps.forEach((step) => {
      if (!STEP_WORDS[step]) return;
      lines.push("It can " + STEP_WORDS[step] + ".");
      if (step === "qualify" || step === "capture") allowed.read = true;
      if (step === "do" || step === "follow") allowed.draft = true;
    });
    const never = Array.isArray(hit.ai.never) ? hit.ai.never : [];
    const cant = never.map((k) => NEVER_WORDS[k] || "").filter(Boolean);
    if (cant.length) lines.push("It cannot " + cant.join(", ") + ".");
    lines.push(DRAFT_LINE);
  } else if (hit.kind === "rule" && hit.rule) {
    const text = S().plain(hit.rule.text, 160);
    if (text) lines.push("This rule says: " + text + ".");
    const then = THEN_WORDS[String(hit.rule.then || "").toLowerCase()];
    lines.push(then ? "When it matches, it can " + then + "." : "It waits for a person.");
    lines.push("It cannot send, pay, or delete on its own.");
  }
  stopLines(sb).forEach((line) => lines.push(line));
  if (paused.item) lines.push("It is paused. Nothing starts from it until you unpause it.");
  else if (paused.desk) lines.push("The desk is paused. Nothing starts from it until you unpause the desk.");
  lines.push(STOP_LINE);
  lines.push(OWN_LINE);
  lines.push(COLLECT_LINE);
  return {
    kind: hit.kind === "ai" ? "automation" : "rule",
    desk: found.row.slug,
    id: hit.id,
    name: hit.name,
    paused: paused.item || paused.desk,
    deskPaused: paused.desk,
    draftOnly: hit.kind === "ai",
    runOnItsOwn: false,
    stopAndKill: STOP_LINE,
    allowed: allowed,
    lines: lines
  };
}

function canConnection(acc, conn) {
  const pub = require("./_account-connect").publicConnection(conn);
  const cards = (Array.isArray(acc.setupCards) ? acc.setupCards : []).filter((card) => {
    if (!card) return false;
    if (card.source && card.source.type === "connection" && card.source.id === conn.id) return true;
    return (card.groups || []).some((g) => g && g.connectionId === conn.id);
  }).map((card) => {
    const approve = (card.steps || []).find((step) => step && step.kind === "approve" && step.state === "done" && step.allowed);
    const allowed = {
      money: !!(approve && approve.allowed && approve.allowed.money === true),
      deletes: !!(approve && approve.allowed && approve.allowed.deletes === true),
      messageNew: !!(approve && approve.allowed && approve.allowed.messageNew === true)
    };
    const lines = [];
    const offs = Object.keys(STOP_WORDS).filter((k) => allowed[k] === true);
    if (!approve) lines.push("No allowed actions are approved on this setup card.");
    else if (!offs.length) lines.push("You approved this setup card with every stop-before still on.");
    else lines.push("You approved going on without stopping first for " + offs.map((k) => STOP_WORDS[k]).join(", ") + ". " + COLLECT_LINE + " " + OWN_LINE);
    lines.push(STOP_LINE);
    return { id: card.id, name: (card.source && card.source.name) || card.id, allowed: allowed, lines: lines };
  });
  const lines = [
    (pub.service || "This connection") + " is " + (pub.statusText || "saved") + ".",
    "Saved here only. AIA does not sign in.",
    pub.hookSet ? "A hook address is saved." : "No hook address is saved.",
    (pub.secretNames || []).length ? "A secret is saved. The value is not shown." : "No secret is saved.",
    "It cannot spend, delete, or message someone new from this list. A setup card below is the only place an approval is recorded.",
    STOP_LINE,
    OWN_LINE,
    COLLECT_LINE
  ];
  return {
    kind: "connection",
    id: pub.id,
    service: pub.service,
    label: pub.label,
    statusText: pub.statusText,
    paused: false,
    draftOnly: true,
    runOnItsOwn: false,
    allowed: { read: false, draft: false, spend: false, deletes: false, messageNew: false },
    lines: lines,
    cards: cards
  };
}

function canCard(acc, card) {
  const lines = [
    "Setup card for " + ((card.source && card.source.name) || "this") + ". " + (card.statusText || ""),
    "Nothing here adds an allowed action.",
    STOP_LINE,
    OWN_LINE,
    COLLECT_LINE
  ];
  return {
    kind: "setup-card",
    id: card.id,
    name: (card.source && card.source.name) || card.id,
    status: card.status || "",
    paused: card.status === "stopped" || card.status === "killed",
    draftOnly: true,
    runOnItsOwn: false,
    allowed: { read: false, draft: false, spend: false, deletes: false, messageNew: false },
    lines: lines
  };
}

function historyRows(acc) {
  return (Array.isArray(acc.history) ? acc.history : []).filter((h) => h && typeof h === "object");
}
function accountActivity(acc, ref, name) {
  return historyRows(acc).filter((h) => {
    if (ref && h.ref === ref) return true;
    if (name && h.section === "automations" && String(h.what || "").indexOf(name) >= 0) return true;
    return false;
  }).map((h) => ({
    at: h.at || "",
    who: h.who || "",
    whoKind: h.whoKind || "",
    what: h.what || "",
    kind: "account",
    section: h.section || ""
  }));
}
function cardActivity(card) {
  return (Array.isArray(card.history) ? card.history : []).filter((e) => e && typeof e === "object").map((e) => ({
    at: e.at || "",
    who: e.who || "",
    whoKind: e.whoKind || "",
    what: e.what || "",
    kind: e.kind || "card",
    from: e.from || "",
    to: e.to || ""
  }));
}
function jobActivity(job, row) {
  const item = require("./_history").historyItem(job, row);
  const rows = [];
  if (item) {
    rows.push({
      at: item.t || "",
      who: item.who || "",
      what: (item.title || "Card") + (item.status ? " · " + item.status : ""),
      kind: "job",
      card: item
    });
  }
  (Array.isArray(job.log) ? job.log : []).forEach((line) => {
    if (typeof line !== "string" || !line.trim()) return;
    rows.push({ at: job.updatedAt || job.createdAt || "", who: "", what: line.trim().slice(0, 200), kind: "log" });
  });
  return rows;
}
function sortActivity(rows) {
  return rows.filter(Boolean).sort((a, b) => String(b.at || "").localeCompare(String(a.at || ""))).slice(0, 40);
}
function activityNote(rows) {
  return rows.length ? "Only what was recorded." : "Nothing recorded on this yet.";
}

function jobOwned(id, desks) {
  const want = str(id);
  if (!want) return null;
  const map = {};
  (desks || []).forEach((w) => { if (w && w.slug) map[w.slug] = w; });
  const job = (lib.mem.jobs || []).find((j) => j && String(j.id) === want && map[j.workspace]);
  if (!job) return null;
  return { job: job, row: map[job.workspace] };
}

const DROP_KEYS = { password: 1, pin: 1, sealed: 1, token: 1, tokenHash: 1, secrets: 1, undo: 1, hook: 1 };
function strip(v, depth) {
  if (!v || typeof v !== "object" || (depth || 0) > 10) return v;
  if (Array.isArray(v)) return v.map((x) => strip(x, (depth || 0) + 1));
  const out = {};
  Object.keys(v).forEach((k) => {
    if (DROP_KEYS[k]) return;
    out[k] = strip(v[k], (depth || 0) + 1);
  });
  return out;
}
function exportPack(acc, person, req) {
  const s = S();
  const desks = owned(acc).map((row) => require("./_desk").exportDesk(row, person)).filter(Boolean);
  const pack = {
    format: "aia.account.v1",
    exportedAt: nowIso(),
    note: "Your account book. No desk code. No password. No secrets. Collect stays HOLD.",
    account: {
      id: acc.id,
      name: acc.name || "",
      ownerName: acc.ownerName || "",
      email: acc.email || "",
      phone: acc.phone || "",
      city: acc.city || "",
      state: acc.state || "",
      timezone: acc.timezone || "",
      hours: acc.hours || "",
      note: s.plain(acc.note, 240),
      kind: s.kindOf(acc),
      createdAt: acc.createdAt || "",
      desks: Array.isArray(acc.desks) ? acc.desks.slice() : [],
      handle: acc.handle || ""
    },
    desks: desks,
    connections: require("./_account-connect").publicConnections(acc),
    sessions: typeof lib.listSessions === "function" ? lib.listSessions({ accountId: acc.id, currentToken: lib.sessionTokenOf(req) }) : [],
    history: historyRows(acc).slice(0, 100).map((h) => ({
      at: h.at || "", who: h.who || "", whoKind: h.whoKind || "", section: h.section || "", what: h.what || ""
    }))
  };
  return strip(pack);
}
function exportMenu() {
  return {
    export: { available: true, do: "export", note: "Exports the account book you own. No desk code. No password. No secrets." },
    leavePhone: { available: true, do: "leave-phone", note: "Leaves this phone. Your account stays." },
    leaveEveryPhone: { available: true, do: "leave-every-phone", note: "Leaves every phone. Your account stays." },
    leaveDesk: { available: true, do: "leave-desk", note: "You leave this desk. Your account stays. The last owner keeps the seat." },
    closeDesk: { available: true, do: "close-desk", note: "Closes this desk so new work stops. Cards stay. You can open it again. Nothing is deleted." },
    openDesk: { available: true, do: "open-desk", note: "Opens a closed desk again. Cards stayed. Nothing runs on its own." },
    closeAccount: { available: false, hold: true, do: "close-account", note: "Closing the account stays on hold. Nothing is deleted." },
    collect: "hold",
    runOnItsOwn: false
  };
}

function undoOpens(acc, frame) {
  if (!frame) return false;
  if (frame.kind === "pause") return frame.beforePaused !== true;
  if (frame.kind === "close-desk") return frame.beforeClosed !== true;
  if (frame.kind === "stop-before") {
    const cur = readStop(acc, frame.key);
    const before = frame.before || {};
    return ["money", "deletes", "messageNew"].some((k) => before[k] === false && cur[k] !== false);
  }
  return false;
}

function fieldBag(body, q) {
  return { body: body || {}, q: q || {} };
}
function oneText(bag, key) {
  const body = bag.body;
  const q = bag.q;
  const inBody = body && Object.prototype.hasOwnProperty.call(body, key);
  const inQ = q && Object.prototype.hasOwnProperty.call(q, key) && q[key] != null && q[key] !== "";
  if (inBody && body[key] != null && body[key] !== "") {
    if (typeof body[key] !== "string") return { bad: key };
    return { value: body[key] };
  }
  if (!inBody && inQ) {
    if (typeof q[key] !== "string") return { bad: key };
    return { value: q[key] };
  }
  return { value: "" };
}

async function handle(req, res, body) {
  const s = S();
  body = body && typeof body === "object" ? body : {};
  const q = (req && req.query) || {};
  const post = req.method === "POST";
  const action = post ? String(body.action || "").toLowerCase() : "";
  const seat = s.ownSeat(req);
  if (!seat.ok) return refuse(res, 404, NO_ONE);
  if (s.askedOther(req, post ? body : q, seat.account)) return refuse(res, 404, NO_ONE);
  if (post && !s.plainBody(body)) return refuse(res, 400, s.BODY_NOT_PLAIN);
  if (post && holdsRun(body)) return refuse(res, 409, RUN_HOLD);

  let acc = seat.account;
  let byHuman = false;
  const person = seat.person;
  const whoKind = s.kindOf(seat.account);
  if (post && body.forSeat != null && body.forSeat !== "") {
    if (action === "export-close") return refuse(res, 400, "Export and close use your own account. Nothing was changed.");
    if (typeof body.forSeat !== "string") return refuse(res, 400, "Name the seat by its id.");
    const tgt = s.humanOwnerTarget(seat, body);
    if (!tgt.ok) return refuse(res, tgt.status || 403, tgt.error);
    acc = tgt.account;
    byHuman = true;
  } else if (!post && typeof q.forSeat === "string" && q.forSeat) {
    const tgt = s.humanOwnerTarget(seat, { forSeat: q.forSeat });
    if (!tgt.ok) return refuse(res, tgt.status || 403, tgt.error);
    acc = tgt.account;
    byHuman = true;
  }

  const bag = fieldBag(post ? body : {}, q);
  const picked = {};
  const names = ["target", "desk", "kind", "id", "connectionId", "cardId", "jobId", "do"];
  for (let i = 0; i < names.length; i++) {
    const got = oneText(bag, names[i]);
    if (got.bad) return refuse(res, 400, "Send " + got.bad + " as plain text. Nothing was saved.");
    picked[names[i]] = got.value;
  }

  const idOk = s.ID_FIELDS;
  if (post) {
    const allowed = {
      pause: ["action", "target", "desk", "kind", "id", "forSeat"].concat(idOk),
      unpause: ["action", "target", "desk", "kind", "id", "forSeat"].concat(idOk),
      "can-do": ["action", "desk", "kind", "id", "connectionId", "cardId", "jobId", "forSeat"].concat(idOk),
      activity: ["action", "desk", "kind", "id", "connectionId", "cardId", "jobId", "forSeat"].concat(idOk),
      undo: ["action", "forSeat"].concat(idOk),
      "export-close": ["action", "do", "desk"].concat(idOk)
    }[action] || ["action"];
    const extra = badKeys(body, allowed);
    if (extra) return refuse(res, 400, "Not a field here: " + s.plain(extra.join(", "), 80) + ". Nothing was saved.");
    if (Object.keys(body).some((k) => k !== "action" && k !== "forSeat" && /stop|kill/i.test(k))) {
      return refuse(res, 400, "Stop and Kill always work. They cannot be switched off.");
    }
  }

  const readPause = !post && flagOn(req, "pause");
  const readCan = !post && flagOn(req, "can");
  const readActivity = !post && flagOn(req, "activity");
  const readUndo = !post && flagOn(req, "undo");
  const readExport = !post && flagOn(req, "exportClose");
  const reads = [readPause, readCan, readActivity, readUndo, readExport].filter(Boolean).length;
  if (!post && reads !== 1) return refuse(res, 400, "Ask for one thing.");

  if (readPause) return readPauseView(res, acc, seat, byHuman, picked);
  if (post && (action === "pause" || action === "unpause")) {
    return writePause(res, acc, person, whoKind, byHuman, seat, picked, action === "pause");
  }

  if (action === "can-do" || readCan) return readCanDo(res, acc, seat, byHuman, picked);
  if (action === "activity" || readActivity) return readActivityOf(res, acc, seat, byHuman, picked);
  if (action === "undo" || readUndo) return doUndo(res, acc, person, whoKind, byHuman, seat, !post);
  if (action === "export-close" || readExport) return doExport(req, res, acc, person, whoKind, seat, picked, !post);
  return refuse(res, 400, "Ask for pause, what this can do, activity, undo, or export and close.");
}

function readPauseView(res, acc, seat, byHuman, picked) {
  const s = S();
  if (!picked.desk && !picked.kind && !picked.id) {
    const desks = scopeDesks(acc, seat, byHuman).map((row) => ({
      slug: row.slug,
      name: s.plain(row.biz || row.name || row.slug, 80),
      paused: readPaused(acc, "", row.slug).desk,
      draftOnly: true
    }));
    const items = [];
    scopeDesks(acc, seat, byHuman).forEach((row) => {
      listAutos(row).forEach((hit) => {
        const key = row.slug + ":" + hit.kind + ":" + hit.id;
        const paused = readPaused(acc, key, row.slug);
        items.push({
          desk: row.slug, kind: hit.kind, id: hit.id, name: hit.name,
          paused: paused.item || paused.desk, deskPaused: paused.desk,
          draftOnly: hit.kind === "ai", runOnItsOwn: false
        });
      });
    });
    return res.status(200).json(baseFlags({ ok: true, wrote: false, pause: { desks: desks, items: items, stopAndKill: STOP_LINE } }));
  }
  const deskRow = deskFor(acc, seat, byHuman, picked.desk);
  if (!deskRow) return refuse(res, 404, NO_ONE);
  if (!picked.kind && !picked.id) {
    const paused = readPaused(acc, "", deskRow.slug).desk;
    return res.status(200).json(baseFlags({
      ok: true, wrote: false, pause: {
        target: "desk", desk: deskRow.slug, paused: paused, draftOnly: true,
        runOnItsOwn: false, stopAndKill: STOP_LINE, hint: pauseHint(paused, "ai", "desk")
      }
    }));
  }
  if (picked.kind !== "rule" && picked.kind !== "ai") return refuse(res, 400, "Pick a rule or a Desk AI.");
  const found = findAuto(acc, picked.desk, picked.kind, picked.id, [deskRow]);
  if (!found.ok) return refuse(res, found.status, found.error);
  const paused = readPaused(acc, found.key, found.row.slug);
  return res.status(200).json(baseFlags({
    ok: true, wrote: false, pause: {
      target: "automation", desk: found.row.slug, kind: found.hit.kind, id: found.hit.id, name: found.hit.name,
      paused: paused.item || paused.desk, itemPaused: paused.item, deskPaused: paused.desk,
      draftOnly: found.hit.kind === "ai", runOnItsOwn: false, stopAndKill: STOP_LINE,
      hint: pauseHint(paused.item || paused.desk, found.hit.kind, "automation")
    }
  }));
}

async function writePause(res, acc, person, whoKind, byHuman, seat, picked, turningOn) {
  const s = S();
  const target = (picked.target || (picked.kind || picked.id ? "automation" : "")).toLowerCase();
  if (target !== "automation" && target !== "desk") return refuse(res, 400, "Say what to pause: an automation, or the desk.");
  const deskRow = deskFor(acc, seat, byHuman, picked.desk);
  if (!deskRow) return refuse(res, 404, NO_ONE);
  const shot = snap(acc, null);
  if (target === "desk") {
    const was = readPaused(acc, "", deskRow.slug).desk;
    if (was === turningOn) {
      return res.status(200).json(baseFlags({
        ok: true, wrote: false, changed: false, paused: was, target: "desk", desk: deskRow.slug,
        draftOnly: true, stopAndKill: STOP_LINE, hint: pauseHint(was, "ai", "desk")
      }));
    }
    if (!turningOn && locked(acc) && !byHuman) {
      s.addHistory(acc, person, "automations", "Refused: this " + s.kindOf(acc) + " account tried to unpause " + s.plain(deskRow.biz || deskRow.name || deskRow.slug, 60) + ". Nothing changed.", whoKind, "desk:" + deskRow.slug);
      if (!(await commit(acc, shot))) return refuse(res, 503, NOT_SAVED);
      return refuse(res, 403, s.SELF_LOCK);
    }
    setDeskPaused(acc, deskRow.slug, turningOn);
    const label = (turningOn ? "Paused" : "Unpaused") + " automations on " + s.plain(deskRow.biz || deskRow.name || deskRow.slug, 60) + ".";
    noteUndo(acc, { kind: "pause", scope: "desk", label: label, desk: deskRow.slug, beforePaused: was });
    s.addHistory(acc, person, "automations", label + " Desk AIs stay drafts. " + STOP_LINE, whoKind, "desk:" + deskRow.slug);
    lib.log("Account", (turningOn ? "Paused desk" : "Unpaused desk"), "OK", deskRow.slug);
    if (!(await commit(acc, shot))) return refuse(res, 503, NOT_SAVED);
    return res.status(200).json(baseFlags({
      ok: true, wrote: true, changed: true, paused: turningOn, target: "desk", desk: deskRow.slug,
      draftOnly: true, stopAndKill: STOP_LINE, hint: pauseHint(turningOn, "ai", "desk")
    }));
  }
  if (picked.kind !== "rule" && picked.kind !== "ai") return refuse(res, 400, "Pick a rule or a Desk AI.");
  const desks = [deskRow];
  const found = findAuto(acc, picked.desk, picked.kind, picked.id, desks);
  if (!found.ok) return refuse(res, found.status, found.error);
  const was = readPaused(acc, found.key, found.row.slug).item;
  const labelName = (found.hit.kind === "ai" ? "Desk AI " : "Rule ") + "\"" + found.hit.name + "\"";
  if (was === turningOn) {
    return res.status(200).json(baseFlags({
      ok: true, wrote: false, changed: false, paused: was || readPaused(acc, found.key, found.row.slug).desk,
      target: "automation", desk: found.row.slug, kind: found.hit.kind, id: found.hit.id,
      draftOnly: found.hit.kind === "ai", stopAndKill: STOP_LINE, hint: pauseHint(was, found.hit.kind, "automation")
    }));
  }
  if (!turningOn && locked(acc) && !byHuman) {
    s.addHistory(acc, person, "automations", "Refused: this " + s.kindOf(acc) + " account tried to unpause " + labelName + ". Nothing changed.", whoKind, found.key);
    if (!(await commit(acc, shot))) return refuse(res, 503, NOT_SAVED);
    return refuse(res, 403, s.SELF_LOCK);
  }
  setItemPaused(acc, found.key, turningOn);
  const label = (turningOn ? "Paused " : "Unpaused ") + labelName + " on " + s.plain(found.row.biz || found.row.name || found.row.slug, 60) + ".";
  noteUndo(acc, {
    kind: "pause", scope: "item", label: label, desk: found.row.slug, key: found.key,
    autoKind: found.hit.kind, autoId: found.hit.id, beforePaused: was
  });
  s.addHistory(acc, person, "automations", label + (found.hit.kind === "ai" ? " It stays a draft." : "") + " " + STOP_LINE, whoKind, found.key);
  lib.log("Account", (turningOn ? "Paused" : "Unpaused") + " automation", "OK", found.row.slug);
  if (!(await commit(acc, shot))) return refuse(res, 503, NOT_SAVED);
  const still = readPaused(acc, found.key, found.row.slug);
  return res.status(200).json(baseFlags({
    ok: true, wrote: true, changed: true, paused: still.item || still.desk, itemPaused: still.item, deskPaused: still.desk,
    target: "automation", desk: found.row.slug, kind: found.hit.kind, id: found.hit.id,
    draftOnly: found.hit.kind === "ai", stopAndKill: STOP_LINE, hint: pauseHint(turningOn, found.hit.kind, "automation")
  }));
}

function readCanDo(res, acc, seat, byHuman, picked) {
  const named = [picked.connectionId, picked.cardId, picked.jobId, (picked.kind || picked.id) ? "auto" : ""].filter(Boolean);
  if (named.length > 1) return refuse(res, 400, "Name one thing: an automation, a connection, a setup card, or a card.");
  if (picked.connectionId) {
    const conn = (Array.isArray(acc.connections) ? acc.connections : []).find((c) => c && c.id === picked.connectionId);
    if (!conn) return refuse(res, 404, "No connection like that.");
    return res.status(200).json(baseFlags({ ok: true, wrote: false, can: canConnection(acc, conn) }));
  }
  if (picked.cardId) {
    const card = (Array.isArray(acc.setupCards) ? acc.setupCards : []).find((c) => c && c.id === picked.cardId);
    if (!card) return refuse(res, 404, "No setup card like that.");
    return res.status(200).json(baseFlags({ ok: true, wrote: false, can: canCard(acc, card) }));
  }
  if (picked.jobId) {
    const hit = jobOwned(picked.jobId, scopeDesks(acc, seat, byHuman));
    if (!hit) return refuse(res, 404, NO_ONE);
    const lines = [
      "This card is " + (hit.job.status || "open") + ".",
      "You tap Yes, Stop, or Kill.",
      "Nothing is sent on its own.",
      COLLECT_LINE,
      OWN_LINE
    ];
    let can = { kind: "card", id: hit.job.id, name: S().plain(hit.job.title, 80), paused: false, draftOnly: true, runOnItsOwn: false, allowed: { read: false, draft: false, spend: false, deletes: false, messageNew: false }, lines: lines };
    const ai = hit.job.deskAi && (hit.job.deskAi.id || hit.job.deskAi.name);
    if (ai) {
      const found = findAuto(acc, hit.row.slug, "ai", String(hit.job.deskAi.id || hit.job.deskAi.name), [hit.row]);
      if (found.ok) can = canAutomation(acc, found);
    }
    return res.status(200).json(baseFlags({ ok: true, wrote: false, can: can }));
  }
  if (!picked.desk || !picked.kind || !picked.id) return refuse(res, 400, "Name an automation, a connection, a setup card, or a card.");
  if (picked.kind !== "rule" && picked.kind !== "ai") return refuse(res, 400, "Pick a rule or a Desk AI.");
  const row = deskFor(acc, seat, byHuman, picked.desk);
  if (!row) return refuse(res, 404, NO_ONE);
  const found = findAuto(acc, picked.desk, picked.kind, picked.id, [row]);
  if (!found.ok) return refuse(res, found.status, found.error);
  return res.status(200).json(baseFlags({ ok: true, wrote: false, can: canAutomation(acc, found) }));
}

function readActivityOf(res, acc, seat, byHuman, picked) {
  const named = [picked.connectionId, picked.cardId, picked.jobId, (picked.kind || picked.id) ? "auto" : ""].filter(Boolean);
  if (named.length > 1) return refuse(res, 400, "Name one thing: an automation, a connection, a setup card, or a card.");
  let rows = [];
  if (picked.connectionId) {
    const conn = (Array.isArray(acc.connections) ? acc.connections : []).find((c) => c && c.id === picked.connectionId);
    if (!conn) return refuse(res, 404, "No connection like that.");
    rows = accountActivity(acc, "conn:" + conn.id, "");
    (Array.isArray(acc.setupCards) ? acc.setupCards : []).forEach((card) => {
      if (!card) return;
      const linked = (card.source && card.source.id === conn.id) || (card.groups || []).some((g) => g && g.connectionId === conn.id);
      if (linked) rows = rows.concat(cardActivity(card));
    });
  } else if (picked.cardId) {
    const card = (Array.isArray(acc.setupCards) ? acc.setupCards : []).find((c) => c && c.id === picked.cardId);
    if (!card) return refuse(res, 404, "No setup card like that.");
    rows = cardActivity(card).concat(accountActivity(acc, "card:" + card.id, ""));
  } else if (picked.jobId) {
    const hit = jobOwned(picked.jobId, scopeDesks(acc, seat, byHuman));
    if (!hit) return refuse(res, 404, NO_ONE);
    rows = jobActivity(hit.job, hit.row);
  } else if (picked.kind || picked.id) {
    if (picked.kind !== "rule" && picked.kind !== "ai") return refuse(res, 400, "Pick a rule or a Desk AI.");
    const row = deskFor(acc, seat, byHuman, picked.desk);
    if (!row) return refuse(res, 404, NO_ONE);
    const found = findAuto(acc, picked.desk, picked.kind, picked.id, [row]);
    if (!found.ok) return refuse(res, found.status, found.error);
    rows = accountActivity(acc, found.key, found.hit.name);
    const aiId = found.hit.kind === "ai" ? found.hit.id : "";
    if (aiId) {
      (lib.mem.jobs || []).forEach((job) => {
        if (!job || job.workspace !== row.slug || !job.deskAi) return;
        const id = String(job.deskAi.id || job.deskAi.name || "");
        if (id === aiId) rows = rows.concat(jobActivity(job, row));
      });
    }
  } else if (picked.desk) {
    const row = deskFor(acc, seat, byHuman, picked.desk);
    if (!row) return refuse(res, 404, NO_ONE);
    rows = accountActivity(acc, "desk:" + row.slug, "");
    const jobs = (lib.mem.jobs || []).filter((j) => j && j.workspace === row.slug);
    const pack = require("./_history").historyOf(row, jobs, Array.isArray(lib.mem.deskEvents) ? lib.mem.deskEvents.filter((e) => e && e.slug === row.slug).slice(0, 40) : []);
    (pack.items || []).forEach((item) => {
      rows.push({ at: item.t || "", who: item.who || "", what: item.title || item.label || "Card", kind: item.kind || "job", card: item.kind === "job" ? item : undefined });
    });
  } else {
    rows = historyRows(acc).slice(0, 40).map((h) => ({
      at: h.at || "", who: h.who || "", whoKind: h.whoKind || "", what: h.what || "", kind: "account", section: h.section || ""
    }));
  }
  rows = sortActivity(rows);
  return res.status(200).json(baseFlags({ ok: true, wrote: false, activity: rows, note: activityNote(rows) }));
}

async function doUndo(res, acc, person, whoKind, byHuman, seat, preview) {
  const s = S();
  const host = topUndo(acc);
  const frame = host && host.undo;
  if (preview) {
    const view = frame
      ? { available: true, kind: frame.kind, label: frame.label }
      : { available: false, label: "", note: "Nothing to undo." };
    return res.status(200).json(baseFlags({ ok: true, wrote: false, undo: view }));
  }
  if (!frame) return refuse(res, 409, "Nothing to undo.");
  if (undoOpens(acc, frame) && locked(acc) && !byHuman) {
    const shot = snap(acc, null);
    s.addHistory(acc, person, "undo", "Refused: this " + s.kindOf(acc) + " account tried to undo \"" + s.plain(frame.label, 80) + "\". Nothing changed.", whoKind);
    if (!(await commit(acc, shot))) return refuse(res, 503, NOT_SAVED);
    return refuse(res, 403, s.SELF_LOCK);
  }
  const ownedDesk = frame.desk ? deskFor(acc, seat, byHuman, frame.desk) : null;
  const leaveDesk = frame.kind === "leave-desk"
    ? ((lib.mem.workspaces || []).find((w) => w && w.slug === frame.desk) || null)
    : null;
  const row = frame.kind === "leave-desk" ? leaveDesk : ownedDesk;
  const shot = snap(acc, row);
  let what = "";
  if (frame.kind === "pause") {
    if (!ownedDesk) return refuse(res, 409, "That step can't be undone. Nothing changed.");
    if (frame.scope === "desk") setDeskPaused(acc, ownedDesk.slug, frame.beforePaused === true);
    else {
      const found = findAuto(acc, frame.desk, frame.autoKind, frame.autoId, [ownedDesk]);
      if (!found.ok) return refuse(res, 409, "That step can't be undone. Nothing changed.");
      setItemPaused(acc, found.key, frame.beforePaused === true);
    }
    what = "Undid: " + frame.label;
  } else if (frame.kind === "stop-before") {
    if (!ownedDesk || !frame.before) return refuse(res, 409, "That step can't be undone. Nothing changed.");
    const found = findAuto(acc, frame.desk, frame.autoKind, frame.autoId, [ownedDesk]);
    if (!found.ok) return refuse(res, 409, "That step can't be undone. Nothing changed.");
    writeStop(acc, found.key, frame.before);
    what = "Undid: " + frame.label;
  } else if (frame.kind === "close-desk") {
    if (!ownedDesk) return refuse(res, 409, "That step can't be undone. Nothing changed.");
    require("./_desk").setDeskClosed(ownedDesk, frame.beforeClosed === true);
    what = frame.beforeClosed ? "Undid the open. The desk is closed again. Nothing was deleted." : "Undid the close. The desk is open again. Cards stayed. Nothing was deleted.";
  } else if (frame.kind === "leave-desk") {
    if (!leaveDesk || !frame.person || !frame.person.id) return refuse(res, 409, "That step can't be undone. Nothing changed.");
    if (frame.person.accountId && frame.person.accountId !== acc.id) return refuse(res, 409, "That step can't be undone. Nothing changed.");
    if (!Array.isArray(leaveDesk.people)) leaveDesk.people = [];
    if (!leaveDesk.people.some((p) => p && p.id === frame.person.id)) leaveDesk.people.push(JSON.parse(JSON.stringify(frame.person)));
    if (frame.memberDesk) {
      acc.memberDesks = Array.isArray(acc.memberDesks) ? acc.memberDesks : [];
      if (acc.memberDesks.indexOf(frame.memberDesk) < 0) acc.memberDesks.push(frame.memberDesk);
    }
    what = "Undid leaving " + s.plain(leaveDesk.biz || leaveDesk.name || leaveDesk.slug, 60) + ". Your seat is back. Nothing was deleted.";
  } else {
    host.undo = null;
    s.addHistory(acc, person, "undo", "That step can't be undone. Nothing changed.", whoKind);
    if (!(await commit(acc, shot))) return refuse(res, 503, NOT_SAVED);
    return refuse(res, 409, "That step can't be undone. Nothing changed.");
  }
  host.undo = null;
  s.addHistory(acc, person, "undo", what, whoKind, frame.key || (frame.desk ? "desk:" + frame.desk : ""));
  lib.log("Account", "Undo", "OK", frame.desk || (seat && seat.row && seat.row.slug) || "");
  if (!(await commit(acc, shot))) return refuse(res, 503, NOT_SAVED);
  return res.status(200).json(baseFlags({
    ok: true,
    wrote: true,
    undid: true,
    hint: what,
    undo: { available: !!topUndo(acc), kind: topUndo(acc) ? topUndo(acc).undo.kind : "", label: topUndo(acc) ? topUndo(acc).undo.label : "" }
  }));
}

async function doExport(req, res, acc, person, whoKind, seat, picked, preview) {
  const s = S();
  if (preview || !picked.do) {
    if (!preview && !picked.do) return refuse(res, 400, "Say what to do: export, leave this phone, leave every phone, leave the desk, close the desk, or open the desk.");
    return res.status(200).json(baseFlags({ ok: true, wrote: false, exportClose: exportMenu() }));
  }
  const todo = DO_WORDS[String(picked.do || "").toLowerCase()];
  if (!todo) return refuse(res, 400, "Say what to do: export, leave this phone, leave every phone, leave the desk, close the desk, or open the desk.");
  if (todo === "close-account") {
    const shot = snap(acc, null);
    s.addHistory(acc, person, "close", "Asked to close the account. That stays on hold. Nothing was deleted.", whoKind, "account:" + acc.id);
    if (!(await commit(acc, shot))) return refuse(res, 503, NOT_SAVED);
    return refuse(res, 409, CLOSE_HOLD, { hold: true, deleted: false, charged: false, collect: "hold" });
  }
  const desk = todo === "close-desk" || todo === "open-desk" || todo === "leave-desk"
    ? (ownedRow(acc, picked.desk || (seat.row && seat.row.slug)) || null)
    : null;
  if ((todo === "close-desk" || todo === "open-desk") && !desk) return refuse(res, 404, NO_ONE);
  if (todo === "leave-desk") {
    const row = seat.row;
    if (!row || (picked.desk && lib.slugify(picked.desk) !== row.slug)) return refuse(res, 404, NO_ONE);
    const shot = snap(acc, row);
    const wasMember = (acc.memberDesks || []).indexOf(row.slug) >= 0;
    const personCopy = JSON.parse(JSON.stringify(person));
    const left = require("./_account").leaveSeat(row, person);
    if (!left.ok) return refuse(res, left.status || 409, left.error);
    noteUndo(acc, { kind: "leave-desk", label: "Left " + (left.name || row.slug) + ".", desk: row.slug, person: personCopy, memberDesk: wasMember ? row.slug : "" });
    s.addHistory(acc, person, "close", "You left " + s.plain(left.name || row.slug, 60) + ". Your account stays.", whoKind, "desk:" + row.slug);
    require("./_desk").logDesk("leave", row, person, { kind: left.kind });
    if (!(await commit(acc, shot))) return refuse(res, 503, NOT_SAVED);
    return res.status(200).json(baseFlags({ ok: true, wrote: true, left: left.left, hint: "You left. Your account stays. Nothing was deleted." }));
  }
  if (todo === "close-desk" || todo === "open-desk") {
    const closing = todo === "close-desk";
    const was = !!(desk.closed === true || desk.accepts === false);
    if (was === closing) {
      return res.status(200).json(baseFlags({
        ok: true, wrote: false, changed: false, closed: was, desk: desk.slug,
        hint: closing ? "Already closed. Cards stay. Nothing was deleted." : "Already open. Nothing runs on its own."
      }));
    }
    const shot = snap(acc, desk);
    require("./_desk").setDeskClosed(desk, closing);
    noteUndo(acc, { kind: "close-desk", label: (closing ? "Closed " : "Opened ") + (desk.biz || desk.slug) + ".", desk: desk.slug, beforeClosed: was });
    s.addHistory(acc, person, "close", (closing ? "Closed " : "Opened ") + s.plain(desk.biz || desk.name || desk.slug, 60) + ". Nothing was deleted.", whoKind, "desk:" + desk.slug);
    require("./_desk").logDesk(closing ? "close" : "open", desk, person);
    if (!(await commit(acc, shot))) return refuse(res, 503, NOT_SAVED);
    return res.status(200).json(baseFlags({
      ok: true, wrote: true, changed: true, closed: closing, desk: desk.slug, draftOnly: true,
      hint: closing
        ? "Closed. New work stops. Cards stay. You can open it again. Nothing was deleted."
        : "Open again. Cards stayed. Desk AIs stay drafts. Nothing runs on its own."
    }));
  }
  if (todo === "export") {
    const shot = snap(acc, null);
    const pack = exportPack(acc, person, req);
    s.addHistory(acc, person, "export", "Exported your account book. No desk code. No password. No secrets.", whoKind, "account:" + acc.id);
    lib.log("Account", "Exported account book", "OK", seat.row && seat.row.slug);
    if (!(await commit(acc, shot))) return refuse(res, 503, NOT_SAVED);
    return res.status(200).json(baseFlags({
      ok: true, wrote: true, hint: "Exported. No desk code. No password. No secrets. Collect stays HOLD.", pack: pack
    }));
  }
  // leave-phone / leave-every-phone. No undo: a sign-in is not put back from here.
  const token = lib.sessionTokenOf(req);
  const shot = snap(acc, null);
  let removed = 0;
  if (todo === "leave-every-phone") removed = typeof lib.revokeSession === "function" ? lib.revokeSession("", { accountId: acc.id }) : 0;
  else if (token) removed = typeof lib.revokeSession === "function" ? lib.revokeSession(token) : 0;
  if (typeof lib.clearSessionCookie === "function") res.setHeader("Set-Cookie", lib.clearSessionCookie());
  s.addHistory(acc, person, "close", todo === "leave-every-phone" ? "Left every phone. Your account stays." : "Left this phone. Your account stays.", whoKind, "account:" + acc.id);
  if (!(await commit(acc, shot))) return refuse(res, 503, NOT_SAVED);
  return res.status(200).json(baseFlags({
    ok: true,
    wrote: true,
    loggedOut: true,
    removed: removed,
    hint: todo === "leave-every-phone" ? "Left every phone. Your account stays." : "Left this phone. Your account stays."
  }));
}

module.exports = { wants, handle, noteUndo, takePending, ACTIONS, NO_ONE, CLOSE_HOLD, RUN_HOLD };

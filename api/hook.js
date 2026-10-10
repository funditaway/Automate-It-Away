const crypto = require("crypto");
const { cors, mem, log, save, ready, slugify, readBody } = require("./_lib");
const { deskClosed, deskClosedMessage } = require("./_desk");
const { qualifyJob, applyRules } = require("./_engine");
const { makeCapturedJob, addTalk } = require("./_fields");
const { applyDeskAiDraft } = require("./_handoff");
const mail = require("./_aia-mail");

const HOOK_HOUR_MS = 60 * 60 * 1000;
const HOOK_NEW_CAP = 5;
const SENDER_LIMIT = 120;
const SUBJECT_LIMIT = 160;
let tooBigSeq = 0;

// Stranger text only. Coerce, drop control characters (CR, LF, NUL, the
// other C0/C1 controls), collapse whitespace, then clip by code point.
// A cut keeps limit-1 code points and adds "…", so the stored string is
// exactly that many code points. HTML entities are not decoded.
function strangerText(value, limit) {
  const text = String(value == null ? "" : value)
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  const points = Array.from(text);
  if (points.length <= limit) return text;
  return points.slice(0, limit - 1).join("") + "…";
}

function headerBag(headers) {
  const bag = {};
  const src = headers || {};
  Object.keys(src).forEach(function (key) {
    bag[String(key).toLowerCase()] = src[key];
  });
  return bag;
}

function headerMeta(headers, names, limit) {
  const bag = headerBag(headers);
  for (let i = 0; i < names.length; i++) {
    const raw = bag[names[i]];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const text = strangerText(value, limit);
    if (text) return text;
  }
  return "";
}

function readJsonString(text, quoteAt) {
  if (text.charAt(quoteAt) !== "\"") return null;
  let i = quoteAt + 1;
  let out = "";
  while (i < text.length) {
    const c = text.charAt(i);
    if (c === "\\") {
      if (i + 1 >= text.length) return null;
      const n = text.charAt(i + 1);
      if (n === "u") {
        if (i + 6 > text.length) return null;
        const hex = text.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }
      if (n === "b") out += "\b";
      else if (n === "f") out += "\f";
      else if (n === "n") out += "\n";
      else if (n === "r") out += "\r";
      else if (n === "t") out += "\t";
      else out += n;
      i += 2;
      continue;
    }
    if (c === "\"") return { value: out, end: i + 1 };
    out += c;
    i += 1;
  }
  return null;
}

// Only JSON string fields whose closing quote is inside the kept prefix.
// A value cut off at the cap is ignored. Nothing here is copied onto the card
// except the sender, subject, and desk fields the caller asks for.
const HOOK_FIELD_KEYS = {
  from: true,
  sender: true,
  replyTo: true,
  subject: true,
  to: true,
  recipient: true,
  address: true,
  workspace: true,
  secret: true,
  hookSecret: true
};

function completeStringFields(buf) {
  const text = Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf || "");
  const out = {};
  let i = 0;
  while (i < text.length) {
    const keyStart = text.indexOf("\"", i);
    if (keyStart < 0) break;
    const key = readJsonString(text, keyStart);
    if (!key) {
      i = keyStart + 1;
      continue;
    }
    let j = key.end;
    while (j < text.length && /\s/.test(text.charAt(j))) j += 1;
    if (text.charAt(j) !== ":") {
      i = keyStart + 1;
      continue;
    }
    j += 1;
    while (j < text.length && /\s/.test(text.charAt(j))) j += 1;
    if (text.charAt(j) !== "\"") {
      i = j < text.length ? j + 1 : text.length;
      continue;
    }
    const keep = !!HOOK_FIELD_KEYS[key.value];
    if (!keep) {
      const skipped = readJsonString(text, j);
      i = skipped ? skipped.end : j + 1;
      continue;
    }
    const val = readJsonString(text, j);
    if (!val) {
      i = j + 1;
      continue;
    }
    if (out[key.value] === undefined) out[key.value] = val.value;
    i = val.end;
  }
  return out;
}

function namedField(fields, names, limit) {
  const src = fields || {};
  for (let i = 0; i < names.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(src, names[i])) continue;
    const text = strangerText(src[names[i]], limit);
    if (text) return text;
  }
  return "";
}

function sizeText(err) {
  if (err && err.fromLength && Number.isFinite(Number(err.declared))) {
    return String(Math.trunc(Number(err.declared))) + " bytes";
  }
  const seen = Number(err && err.seen);
  const n = Number.isFinite(seen) && seen > 0 ? Math.trunc(seen) : 0;
  if (err && err.measured) return String(n) + " bytes";
  return "at least " + n + " bytes";
}

// Identity fields only. Text, notes, and pad stay off the card.
// A pre-parsed body is the whole JSON Vercel already read, so a desk or
// secret field counts wherever it sits in that value. Caller must not pass
// a raw stream's unread tail.
function fieldsFromParsed(body) {
  if (typeof body === "string" || Buffer.isBuffer(body)) return completeStringFields(body);
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const out = {};
  Object.keys(HOOK_FIELD_KEYS).forEach(function (key) {
    const raw = body[key];
    if (raw == null || typeof raw === "object") return;
    const text = String(raw);
    if (text) out[key] = text;
  });
  return out;
}

function senderOf(req, fields) {
  return headerMeta(req && req.headers, ["from", "x-from", "sender", "x-sender", "reply-to"], SENDER_LIMIT)
    || namedField(fields, ["from", "sender", "replyTo"], SENDER_LIMIT)
    || "unknown";
}

function subjectOf(req, fields) {
  return headerMeta(req && req.headers, ["subject", "x-subject"], SUBJECT_LIMIT)
    || namedField(fields, ["subject"], SUBJECT_LIMIT)
    || "unknown";
}

// A normal hook post needs no secret, no token, and no sign-in. Naming an
// existing desk is enough. If that desk record has hookSecret or
// inboundSecret, the post has to carry the same string or it does not
// create a card. The too-big card uses this same check.
function deskHookSecret(shop) {
  if (!shop) return "";
  const named = shop.hookSecret != null ? String(shop.hookSecret) : "";
  const raw = named ? shop.hookSecret : shop.inboundSecret;
  if (raw == null || typeof raw === "object") return "";
  return String(raw);
}

function pushSecret(list, value) {
  if (value == null || typeof value === "object") return;
  const text = String(value);
  if (!text) return;
  list.push(text);
}

function hookCandidates(req, fields, body) {
  const found = [];
  const bag = headerBag(req && req.headers);
  ["x-hook-secret", "x-aia-hook-secret"].forEach(function (name) {
    const raw = bag[name];
    pushSecret(found, Array.isArray(raw) ? raw[0] : raw);
  });
  const query = (req && req.query) || {};
  pushSecret(found, query.secret);
  pushSecret(found, query.hookSecret);
  const src = fields || {};
  pushSecret(found, src.secret);
  pushSecret(found, src.hookSecret);
  if (body && typeof body === "object" && !Buffer.isBuffer(body) && !Array.isArray(body)) {
    pushSecret(found, body.secret);
    pushSecret(found, body.hookSecret);
  }
  return found;
}

function secretEquals(want, got) {
  const a = Buffer.from(String(want), "utf8");
  const b = Buffer.from(String(got), "utf8");
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function hookAllows(shop, candidates) {
  const want = deskHookSecret(shop);
  if (!want) return true;
  const list = candidates || [];
  for (let i = 0; i < list.length; i++) {
    if (secretEquals(want, list[i])) return true;
  }
  return false;
}

function deskFromHook(req, fields) {
  const query = (req && req.query) || {};
  const headers = (req && req.headers) || {};
  // Pre-parsed: fields already include a workspace / to / recipient / address
  // from anywhere in the JSON. Raw cut: fields are only complete strings
  // inside the kept prefix, so a desk past 4 MB is not here.
  const toAddr = namedField(fields, ["to", "recipient", "address"], 200) || query.to || "";
  const identity = toAddr ? mail.findByAddress(toAddr) : null;
  const workspaceField = fields && fields.workspace != null ? String(fields.workspace) : "";
  const workspace = slugify(headers["x-workspace"] || query.workspace || workspaceField || (identity && identity.workspace) || "");
  const shop = workspace ? ((mem.workspaces || []).find(function (w) { return w && w.slug === workspace; }) || null) : null;
  return { workspace: workspace, shop: shop };
}

function tooBigCards(workspace) {
  return (mem.jobs || []).filter(function (job) {
    return job && job.workspace === workspace && job.custom && job.custom.tooBig === true;
  });
}

function cardOpen(job) {
  if (!job) return false;
  const status = String(job.status || "");
  return status !== "shipped" && status !== "killed";
}

function openTooBig(workspace, sender) {
  const want = sender || "unknown";
  return tooBigCards(workspace).find(function (job) {
    return cardOpen(job) && String((job.custom && job.custom.sender) || "unknown") === want;
  }) || null;
}

function tooBigThisHour(workspace, now) {
  const cut = now - HOOK_HOUR_MS;
  return tooBigCards(workspace).filter(function (job) {
    const at = Date.parse(job.createdAt);
    return Number.isFinite(at) && at >= cut;
  });
}

function newestThisHour(workspace, now) {
  const rows = tooBigThisHour(workspace, now);
  let best = null;
  let bestAt = -1;
  let bestIndex = Infinity;
  rows.forEach(function (job) {
    const at = Date.parse(job.createdAt);
    const index = (mem.jobs || []).indexOf(job);
    if (!best || at > bestAt || (at === bestAt && index < bestIndex)) {
      best = job;
      bestAt = at;
      bestIndex = index;
    }
  });
  return best;
}

function overflowLine(n) {
  return String(n) + " more too-big posts this hour";
}

function paintTooBig(job) {
  const meta = job.custom || {};
  const sizes = Array.isArray(meta.sizes) ? meta.sizes : [];
  const latest = sizes.length ? sizes[sizes.length - 1] : "unknown";
  const sender = meta.sender || "unknown";
  const subject = meta.subject || "unknown";
  const count = meta.count || 1;
  const more = meta.overflow > 0 ? overflowLine(meta.overflow) : "";
  job.title = "Too big to take in";
  job.from = sender;
  job.why = "Size " + latest + ". Sender " + sender + ". Subject " + subject + ". Seen " + count + ". Collect HOLD." + (more ? " " + more : "");
  job.next = more || "Collect HOLD. You still tap Yes or Stop.";
  job.overflowNote = more;
  job.collect = "HOLD";
  job.charged = false;
  return job;
}

function newTooBig(workspace, sender, subject, sizeLabel, nowIso) {
  tooBigSeq += 1;
  const job = {
    id: "job_" + Date.now().toString(36) + "b" + tooBigSeq.toString(36),
    workspace: workspace,
    title: "Too big to take in",
    status: "waiting",
    step: "Qualify",
    createdAt: nowIso,
    lastSeen: nowIso,
    charged: false,
    amount: null,
    waitingOn: "person",
    collect: "HOLD",
    log: ["Too big to take in"],
    custom: {
      tooBig: true,
      sender: sender,
      subject: subject,
      count: 1,
      lastSeen: nowIso,
      sizes: [sizeLabel],
      overflow: 0
    }
  };
  return paintTooBig(job);
}

function foldTooBig(job, sizeLabel, nowIso) {
  const meta = job.custom;
  meta.count = (Number(meta.count) || 1) + 1;
  meta.lastSeen = nowIso;
  if (!Array.isArray(meta.sizes)) meta.sizes = [];
  meta.sizes.push(sizeLabel);
  job.lastSeen = nowIso;
  paintTooBig(job);
}

function bumpOverflow(job) {
  job.custom.overflow = (Number(job.custom.overflow) || 0) + 1;
  paintTooBig(job);
}

async function noteHookTooBig(req, err) {
  // Pre-parsed JSON: the desk field is wherever Vercel left it in req.body.
  // Raw stream: only query, headers, and fields fully inside err.kept.
  const fields = err && err.parsed
    ? fieldsFromParsed(req && req.body)
    : completeStringFields(err && err.kept);
  const candidates = hookCandidates(req, fields, err && err.parsed ? req && req.body : null);
  if (err && err.parsed && req) req.body = undefined;
  if (err) err.kept = null;
  const desk = deskFromHook(req, fields);
  if (!desk.shop) {
    log("Pipe", "Too big to take in", "No desk", desk.workspace || null);
    await save();
    return;
  }
  if (!hookAllows(desk.shop, candidates)) return;
  const sender = senderOf(req, fields);
  const subject = subjectOf(req, fields);
  const sizeLabel = sizeText(err);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const open = openTooBig(desk.workspace, sender);
  if (open) {
    foldTooBig(open, sizeLabel, nowIso);
    await save();
    return;
  }
  if (tooBigThisHour(desk.workspace, now).length >= HOOK_NEW_CAP) {
    const host = newestThisHour(desk.workspace, now);
    if (host) {
      bumpOverflow(host);
      await save();
    }
    return;
  }
  const job = newTooBig(desk.workspace, sender, subject, sizeLabel, nowIso);
  if (!Array.isArray(mem.jobs)) mem.jobs = [];
  mem.jobs.unshift(job);
  log("Pipe", "Too big to take in", "Waiting", desk.workspace);
  await save();
}

function eventOf(body) {
  const raw = String(body.event || body.action || body.status || "update").toLowerCase();
  if (/need[s]?\s*a?\s*hand|manual|by[\s-]?hand|retry|reopen/.test(raw)) return "hand";
  if (/sold|paid/.test(raw)) return "collect";
  if (/booked|done|complete|shipped|confirmed/.test(raw)) return "done";
  if (/fail|error|cancel|kill|stop/.test(raw)) return "kill";
  if (/capture|new|create|intake/.test(raw)) return "capture";
  return "update";
}

function finishDone(job, body, how) {
  const note = String(body.notes || body.text || body.reason || "Pipe confirmed done.").trim();
  job.status = "shipped";
  job.doneHow = how;
  job.doneAt = new Date().toISOString();
  job.doneBy = body.who || body.provider || "webhook";
  job.awaiting = null;
  job.offDesk = false;
  job.followed = true;
  job.followNote = note;
  job.step = "Follow";
  job.rail = "done";
  job.whoTapped = job.doneBy;
  job.dispatch = { provider: body.provider || "webhook", inbound: true, demo: false, done: true, how: how };
  addTalk(job, job.doneBy, note, "follow");
  return note;
}

function applyStatusRules(job, workspace) {
  const shop = (mem.workspaces || []).find((w) => w && w.slug === workspace) || null;
  if (shop) applyRules(job, shop, "status");
  return job;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();

  if (req.method !== "POST") {
    return res.status(200).json({
      ok: true,
      use: "POST",
      events: ["capture", "update", "do", "done", "hand", "collect", "kill", "mail"],
      inbound: "POST to /api/hook with to: local@account.aia — Drop / Capture on that desk. Automations can trigger from inbound.",
      send: "hold",
      mx: mail.statusOf(),
      note: "Write back done when the work finished off the desk. Write back hand when a person still has to finish it. Owner still owns Stop. .aia identities work on the desk now. Internet mail when the MX pipe is connected."
    });
  }

  let body;
  try { body = await readBody(req, res); }
  catch (err) {
    if (err && err.statusCode === 413) {
      if (err.hook) await noteHookTooBig(req, err);
      return;
    }
    throw err;
  }
  if (mail.wantsSend(body)) {
    return res.status(409).json(mail.sendHold());
  }
  const toAddr = body.to || body.recipient || body.address || req.query.to || "";
  const identity = toAddr ? mail.findByAddress(toAddr) : null;
  if (toAddr && /\.aia$/i.test(String(toAddr).trim()) && !identity) {
    const parsed = mail.parseAddress(toAddr);
    return res.status(400).json({
      ok: false,
      error: parsed.ok ? ("No .aia email identity for " + parsed.address + ".") : parsed.error,
      mx: mail.statusOf()
    });
  }
  const workspace = slugify(req.headers["x-workspace"] || req.query.workspace || body.workspace || (identity && identity.workspace) || "");
  if (!workspace) return res.status(400).json({ ok: false, error: "Name the desk or send to a .aia email." });
  const shop = (mem.workspaces || []).find((w) => w && w.slug === workspace) || null;
  if (!shop) {
    return res.status(400).json({
      ok: false,
      error: "No desk with that name.",
      mx: mail.statusOf()
    });
  }
  if (!hookAllows(shop, hookCandidates(req, null, body))) {
    return res.status(403).json({ ok: false, error: "Hook secret does not match this desk." });
  }
  if (deskHookSecret(shop) && body && typeof body === "object") {
    delete body.secret;
    delete body.hookSecret;
  }
  const event = identity ? "capture" : eventOf(body);
  const title = body.title || body.item || body.name || body.notes || "Pipe update";

  let job = null;
  if (body.id || body.jobId) {
    job = mem.jobs.find((j) => j.workspace === workspace && (j.id === body.id || j.id === body.jobId));
  }
  if (!job && body.externalId) {
    job = mem.jobs.find((j) => j.workspace === workspace && j.externalId === String(body.externalId));
  }

  if (event === "capture" || !job) {
    if (deskClosed(shop)) {
      return res.status(409).json({ ok: false, error: deskClosedMessage(shop), closed: true });
    }
    const inbound = identity ? mail.inboundPayload(body, identity) : {};
    job = makeCapturedJob(workspace, shop, Object.assign({}, body, inbound, {
      title: inbound.title || title,
      why: inbound.why || body.why || "In from a pipe.",
      from: inbound.from || body.from || body.provider || "webhook",
      notes: inbound.notes || body.notes || body.text || "",
      lane: inbound.lane || body.lane || (identity ? "in" : "ext"),
      kind: inbound.kind || body.kind
    }));
    job.log = [identity ? ("Mail · " + identity.address) : "Pipe capture"];
    job.provider = (identity && "aia-mail") || body.provider || job.provider || "webhook";
    if (identity) {
      job.aiaMail = identity.address;
      job.to = identity.address;
      job.kind = job.kind || "email";
      job.custom = Object.assign({}, job.custom || {}, inbound.custom || {});
      const box = String(identity.address || "").toLowerCase();
      if (job.assignee && String(job.assignee).toLowerCase() === box) delete job.assignee;
      if (identity.bind === "ai" && identity.aiName) job.assignee = identity.aiName;
    }
    qualifyJob(job, shop);
    try {
      const { grokRecommend } = require("./_grok");
      const grok = await grokRecommend(job, shop, workspace);
      if (grok && grok.ok) addTalk(job, "grok", job.draft || "Draft on the card.", "rec");
    } catch (e) {}
    applyDeskAiDraft(job, shop, "qualify");
    const tell = String(job.tell || "").trim();
    if (tell && !(job.thread || []).some((t) => t && t.kind === "tell" && String(t.text || "").trim() === tell)) {
      addTalk(job, job.whoTapped || job.contactName || "drop", tell, "tell");
    }
    if (job.notes && String(job.notes).trim() !== tell) addTalk(job, job.from || "pipe", job.notes, "note");
    mem.jobs.unshift(job);
    mem.inbox.unshift({
      id: "in_" + Date.now().toString(36),
      workspace,
      text: job.title,
      from: job.from,
      at: Date.now()
    });
    log("Pipe", "In · " + job.title, "Waiting", workspace);
    await save();
    return res.status(201).json({ ok: true, event: "capture", job });
  }

  if (event === "kill") {
    job.status = "killed";
    job.awaiting = null;
    job.offDesk = false;
    job.killReason = body.reason || body.killReason || "Pipe said stop";
    job.whoTapped = body.who || body.provider || "webhook";
    job.log = (job.log || []).concat(["Pipe stop"]);
    log("Pipe", "Stop · " + job.title, "Stopped", workspace);
    await save();
    return res.status(200).json({ ok: true, event: "kill", job });
  }

  if (event === "hand") {
    const note = String(body.notes || body.text || body.reason || "Pipe could not finish. Needs a hand.").trim();
    job.status = "exception";
    job.awaiting = null;
    job.offDesk = false;
    job.waitingOn = "owner";
    job.why = note;
    job.next = "Do this by hand. Then tap Done off desk.";
    job.rail = "hand";
    job.step = "Do";
    job.whoTapped = body.who || body.provider || "webhook";
    addTalk(job, job.whoTapped, note, "ask");
    job.log = (job.log || []).concat(["Pipe · needs a hand"]);
    log("Pipe", "Hand · " + job.title, "Waiting", workspace);
    await save();
    return res.status(200).json({ ok: true, event: "hand", job });
  }

  if (event === "done") {
    finishDone(job, body, body.how || "pipe");
    applyStatusRules(job, workspace);
    job.log = (job.log || []).concat(["Pipe wrote back · done"]);
    log("Pipe", "Done · " + job.title, "OK", workspace);
    await save();
    return res.status(200).json({ ok: true, event: "done", job });
  }

  if (event === "collect") {
    const amount = Number(body.amount || job.amount || job.ask || 0);
    finishDone(job, body, "pipe");
    job.step = "Collect";
    job.amount = amount || job.amount;
    job.log = (job.log || []).concat(["Pipe wrote back · collect"]);
    mem.money.unshift({
      at: new Date().toISOString(),
      workspace,
      who: job.payoutTo || job.title,
      what: "Pipe collect",
      amt: amount ? "$" + amount : "—",
      held: false
    });
    log("Pipe", "Collect · " + job.title, "OK", workspace);
    await save();
    return res.status(200).json({ ok: true, event: "collect", job });
  }

  job.notes = body.notes || job.notes;
  if (body.status) job.pipeStatus = String(body.status).slice(0, 80);
  if (String(body.event || "").toLowerCase() === "do") {
    job.status = "out";
    job.offDesk = true;
    job.awaiting = "writeback";
    job.next = "Off the desk. Waiting on write-back.";
  }
  job.log = (job.log || []).concat(["Pipe update"]);
  addTalk(job, body.who || body.provider || "webhook", body.notes || body.text || "Pipe update.", "note");
  log("Pipe", "Update · " + job.title, "OK", workspace);
  await save();
  return res.status(200).json({ ok: true, event: "update", job });
};

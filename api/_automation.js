// Desk automation runner. One Yes approves the allowed actions and the plan.
// Each later step is one short tick: lock, check halt, do one step, record, unlock.
// Vercel previews keep the shared Blob store closed (api/_lib.js blobAllowed).
const crypto = require("crypto");
const { mem, save, readBody, personOf, isOwner, slugify, workspaceOf } = require("./_lib");

const PAGE_NOTE = "Steps only move while this page is open.";
const NOT_APPROVED = "Not on the approved list.";
const ACTIONS = [
  { id: "add_note", sentence: "Add a note on this card.", risk: { spend: false, delete: false, newContact: false }, held: false },
  { id: "draft_reply", sentence: "Draft a reply on this card.", risk: { spend: false, delete: false, newContact: false }, held: false },
  { id: "set_status", sentence: "Set the status on this card.", risk: { spend: false, delete: false, newContact: false }, held: false },
  { id: "ask_desk_ai", sentence: "Ask the Desk AI about this step.", risk: { spend: false, delete: false, newContact: false }, held: false },
  { id: "send_message", sentence: "Send a message to someone.", risk: { spend: false, delete: false, newContact: true }, held: true },
  { id: "delete_card", sentence: "Delete this card.", risk: { spend: false, delete: true, newContact: false }, held: true },
  { id: "pay", sentence: "Pay from this card.", risk: { spend: true, delete: false, newContact: false }, held: true }
];

let leaseMsValue = 15000;
let tickHold = null;
let modelFns = null;

function catalog() {
  return ACTIONS.map((row) => ({
    id: row.id,
    sentence: row.sentence,
    risk: { spend: !!row.risk.spend, delete: !!row.risk.delete, newContact: !!row.risk.newContact },
    held: !!row.held
  }));
}

function actionById(id) {
  return ACTIONS.find((row) => row.id === id) || null;
}

function ticksMode() {
  return process.env.VERCEL_ENV === "production" ? "cron" : "page";
}

function modelKey() {
  return process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.AIA_GROK_KEY || "";
}

function setLeaseMsForTests(ms) {
  leaseMsValue = Number(ms) > 0 ? Number(ms) : 15000;
}

function setTickHoldForTests(fn) {
  tickHold = typeof fn === "function" ? fn : null;
}

function setModelForTests(fns) {
  modelFns = fns || null;
}

function leaseMs() {
  return leaseMsValue;
}

function findIds(text) {
  const src = String(text || "");
  const found = [];
  ACTIONS.forEach((row) => {
    const re = new RegExp("(^|[^a-z0-9_])" + row.id + "([^a-z0-9_]|$)", "i");
    if (re.test(src) && found.indexOf(row.id) < 0) found.push(row.id);
  });
  return found;
}

function keywordAction(text) {
  const t = String(text || "").toLowerCase();
  if (/\bpay\b/.test(t) || /\bcharge\b/.test(t) || /\bspend\b/.test(t)) return "pay";
  if (/\bdelete\b/.test(t)) return "delete_card";
  if (/\bsend\b/.test(t) || /\bmessage\b/.test(t)) return "send_message";
  if (/\bask\b/.test(t)) return "ask_desk_ai";
  if (/\bstatus\b/.test(t)) return "set_status";
  if (/\breply\b/.test(t) || /\bdraft\b/.test(t)) return "draft_reply";
  if (/\bnote\b/.test(t)) return "add_note";
  return "";
}

function cardBlob(job) {
  if (!job) return "";
  return [job.title, job.notes, job.draft, job.why, job.tell].filter(Boolean).join("\n");
}

function validateAllowed(value) {
  if (!Array.isArray(value)) return { ok: false, error: "Allowed actions must be a list." };
  const ids = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== "string") return { ok: false, error: "Allowed actions must be action names." };
    if (!actionById(item)) return { ok: false, error: "Unknown action." };
    if (ids.indexOf(item) >= 0) return { ok: false, error: "Allowed actions must not repeat." };
    ids.push(item);
  }
  return { ok: true, allowed: ids };
}

function pausesOf(raw) {
  const pauses = { spend: true, delete: true, newContact: true };
  if (raw == null) return pauses;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const keys = ["spend", "delete", "newContact"];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (raw[key] == null) continue;
    if (typeof raw[key] !== "boolean") return null;
    pauses[key] = raw[key];
  }
  return pauses;
}

function approvalHash(allowed, plan) {
  const body = JSON.stringify({
    allowed: Array.isArray(allowed) ? allowed.slice() : [],
    plan: Array.isArray(plan) ? plan.slice() : []
  });
  return crypto.createHash("sha256").update(body, "utf8").digest("hex");
}

function planOf(ai) {
  try {
    return require("./_ais").planText(ai && ai.plan).plan;
  } catch (e) {
    return Array.isArray(ai && ai.plan) ? ai.plan.slice() : [];
  }
}

function stampApproval(ai, allowed, pauses, person) {
  const plan = planOf(ai);
  const list = allowed.slice();
  ai.automation = {
    allowed: list.slice(),
    pauses: pauses || pausesOf(null),
    approvedBy: (person && (person.name || person.id)) || "owner",
    approvedAt: new Date().toISOString(),
    approvedHash: approvalHash(list, plan),
    approvedAllowed: list.slice(),
    approvedPlan: plan.slice(),
    stopped: false
  };
  return ai.automation;
}

function approvalView(ai) {
  const pauses = pausesOf(ai && ai.automation && ai.automation.pauses) || pausesOf(null);
  const auto = ai && ai.automation;
  if (!auto || !auto.approvedAt || !auto.approvedHash) {
    return { approved: false, needsNewYes: false, needsNewYesWhy: null, pauses: pauses };
  }
  const plan = planOf(ai);
  const allowed = Array.isArray(auto.allowed) ? auto.allowed.slice() : [];
  const approvedAllowed = Array.isArray(auto.approvedAllowed) ? auto.approvedAllowed : [];
  const approvedPlan = Array.isArray(auto.approvedPlan) ? auto.approvedPlan : [];
  const hash = approvalHash(allowed, plan);
  let why = null;
  if (JSON.stringify(allowed) !== JSON.stringify(approvedAllowed)) why = "allowed";
  else if (JSON.stringify(plan) !== JSON.stringify(approvedPlan) || hash !== auto.approvedHash) why = "plan";
  else if (auto.stopped) why = "stopped";
  return {
    approved: !why,
    needsNewYes: !!why,
    needsNewYesWhy: why,
    pauses: pauses
  };
}

function suggestAllowed(brief, pack) {
  const text = String(brief || "") + "\n" + (pack ? JSON.stringify(pack) : "");
  const ids = findIds(text).filter((id) => {
    const row = actionById(id);
    return row && !row.held;
  });
  if (!ids.length) return ["add_note", "draft_reply"];
  return ids;
}

function cronSecretValue() {
  const secret = process.env.CRON_SECRET;
  if (typeof secret !== "string" || secret.length === 0) return "";
  return secret;
}

function bearerToken(req) {
  const headers = (req && req.headers) || {};
  const raw = headers.authorization || headers.Authorization || "";
  const header = Array.isArray(raw) ? String(raw[0] || "") : String(raw || "");
  if (!header) return { present: false, token: "" };
  const match = /^Bearer (.*)$/.exec(header);
  if (!match) return { present: true, token: null };
  return { present: true, token: match[1] };
}

// Cron is closed when CRON_SECRET is unset or empty. Equal-length tokens are
// compared with timingSafeEqual. A different length is refused without throwing.
function cronAuthorized(req) {
  const secret = cronSecretValue();
  if (!secret) return false;
  const got = bearerToken(req);
  if (!got.present || got.token == null) return false;
  const left = Buffer.from(String(got.token), "utf8");
  const right = Buffer.from(secret, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function pinRaw(req, body) {
  if (body && body.pin != null && String(body.pin) !== "") return String(body.pin);
  const headers = (req && req.headers) || {};
  if (headers["x-pin"] != null && String(headers["x-pin"]) !== "") return String(headers["x-pin"]);
  return "";
}

function ownerGate(req, body) {
  const pin = pinRaw(req, body);
  const slug = slugify((body && (body.ws || body.workspace || body.slug)) || workspaceOf(req) || "");
  if (!pin) return { ok: false, status: 403, body: { ok: false, error: "Desk code required." } };
  if (!slug) return { ok: false, status: 403, body: { ok: false, error: "Desk code required." } };
  const headers = Object.assign({}, (req && req.headers) || {}, { "x-workspace": slug, "x-pin": pin });
  const found = personOf({ headers: headers, query: (req && req.query) || {} }, slug);
  if (!found.workspace) return { ok: false, status: 404, body: { ok: false, error: "Open a desk first." } };
  if (!found.person || !isOwner(found.person)) {
    return { ok: false, status: 403, body: { ok: false, error: "Only the owner can do that." } };
  }
  return { ok: true, shop: found.workspace, person: found.person, slug: slug };
}

function liveAi(shop, aiId) {
  const want = String(aiId || "");
  if (!want || !shop) return null;
  const rows = shop.ais || [];
  return rows.find((row) => row && (row.id === want || String(row.name || "").toLowerCase() === want.toLowerCase())) || null;
}

function aiForCard(shop, job) {
  const rows = (shop && shop.ais) || [];
  const runId = job && job.run && job.run.aiId;
  if (runId) {
    const hit = liveAi(shop, runId);
    if (hit) return hit;
  }
  const hint = job && job.deskAi;
  if (hint) {
    const key = String(hint.id || hint.name || hint || "");
    const hit = liveAi(shop, key);
    if (hit) return hit;
  }
  if (rows.length === 1) return rows[0];
  const approved = rows.filter((row) => row && row.automation && row.automation.approvedAt);
  approved.sort((a, b) => String(b.automation.approvedAt).localeCompare(String(a.automation.approvedAt)));
  return approved[0] || null;
}

function cardOnDesk(shop, cardId) {
  const id = String(cardId || "");
  if (!id) return { error: { status: 400, body: { ok: false, error: "Name the card." } } };
  const job = (mem.jobs || []).find((row) => row && row.id === id);
  if (!job) return { error: { status: 404, body: { ok: false, error: "No card with that id." } } };
  if (job.workspace !== shop.slug) return { error: { status: 403, body: { ok: false, error: "That card is on another desk." } } };
  return { job: job };
}

function aiOnDesk(shop, aiId) {
  const id = String(aiId || "");
  if (!id) return { error: { status: 400, body: { ok: false, error: "Name the Desk AI." } } };
  const ai = liveAi(shop, id);
  if (ai) return { ai: ai };
  const elsewhere = (mem.workspaces || []).some((row) => row && row.slug !== shop.slug && liveAi(row, id));
  if (elsewhere) return { error: { status: 403, body: { ok: false, error: "That Desk AI is on another desk." } } };
  return { error: { status: 404, body: { ok: false, error: "No Desk AI by that name." } } };
}

function nextN(run) {
  let max = 0;
  (run.steps || []).forEach((step) => {
    if (step && typeof step.n === "number" && step.n > max) max = step.n;
  });
  return max + 1;
}

function lastStepNum(run) {
  const steps = (run && run.steps) || [];
  if (!steps.length) return null;
  const last = steps[steps.length - 1];
  return last && typeof last.n === "number" ? last.n : null;
}

function pushStep(run, n, fields) {
  if (!Array.isArray(run.steps)) run.steps = [];
  const step = {
    n: n,
    at: new Date().toISOString(),
    action: fields.action,
    said: fields.said || "",
    result: fields.result,
    why: fields.why || ""
  };
  if (fields.action === "pay" || fields.charged === false) step.charged = false;
  run.steps.push(step);
  return step;
}

function publicStep(step) {
  const out = {
    n: step.n,
    at: step.at,
    action: step.action,
    said: step.said || "",
    result: step.result,
    why: step.why || ""
  };
  if (step.action === "pay") out.charged = false;
  return out;
}

function publicRun(run) {
  if (!run) return null;
  const ticksBy = run.ticksBy === "cron" ? "cron" : "page";
  const out = {
    state: run.state,
    ticksBy: ticksBy,
    aiId: run.aiId || "",
    steps: (run.steps || []).map(publicStep),
    waiting: run.waiting ? { n: run.waiting.n, action: run.waiting.action, why: run.waiting.why } : null
  };
  if (ticksBy === "page") out.note = PAGE_NOTE;
  return out;
}

function cardAiId(shop, job) {
  if (!job) return null;
  if (job.run && job.run.aiId) {
    const hit = liveAi(shop, job.run.aiId);
    return hit ? hit.id : null;
  }
  const hint = job.deskAi != null && job.deskAi !== "" ? job.deskAi : job.aiId;
  if (hint == null || hint === "") return null;
  const key = typeof hint === "object" ? (hint.id || hint.aiId || hint.name || "") : hint;
  if (!key) return null;
  const hit = liveAi(shop, key);
  return hit ? hit.id : null;
}

function readFields(job, shop) {
  const aiId = cardAiId(shop, job);
  const ai = aiId ? liveAi(shop, aiId) : null;
  const view = ai ? approvalView(ai) : { approved: false, needsNewYes: false, needsNewYesWhy: null, pauses: pausesOf(null) };
  const allowed = ai && ai.automation && Array.isArray(ai.automation.allowed) ? ai.automation.allowed.slice() : [];
  return {
    run: publicRun(job && job.run),
    aiId: aiId,
    allowed: allowed,
    approved: view.approved,
    needsNewYes: view.needsNewYes,
    needsNewYesWhy: view.needsNewYesWhy,
    pauses: view.pauses
  };
}

function storedApprovalAi(row) {
  const view = approvalView(row);
  const auto = (row && row.automation) || {};
  return {
    id: row.id,
    approved: view.approved,
    needsNewYes: view.needsNewYes,
    needsNewYesWhy: view.needsNewYesWhy,
    allowed: Array.isArray(auto.allowed) ? auto.allowed.slice() : [],
    pauses: view.pauses,
    approvedAt: auto.approvedAt || null
  };
}

function recipientOf(job, line) {
  const parts = [line];
  if (job) {
    parts.push(job.email, job.phone, job.contactName, job.to);
    if (job.from && String(job.from).indexOf("@") >= 0) parts.push(job.from);
  }
  const blob = parts.filter(Boolean).join(" ");
  const email = blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email) return email[0].toLowerCase();
  if (job && job.phone) return String(job.phone).replace(/\s+/g, "");
  if (job && job.contactName) return String(job.contactName).trim().toLowerCase();
  return "";
}

function contactKnown(shop, key) {
  if (!key) return false;
  return (shop.approvedContacts || []).some((row) => row && row.key === key);
}

function rememberContact(shop, key, by) {
  if (!key) return;
  if (!Array.isArray(shop.approvedContacts)) shop.approvedContacts = [];
  if (contactKnown(shop, key)) return;
  shop.approvedContacts.push({ key: key, label: key, at: new Date().toISOString(), by: by || "" });
}

function pausePlain(why) {
  if (why === "spend") return "Waiting for a yes before spending.";
  if (why === "delete") return "Waiting for a yes before deleting.";
  return "Waiting for a yes before messaging someone new.";
}

function pauseFor(spec, ai, shop, job, line) {
  const pauses = pausesOf(ai && ai.automation && ai.automation.pauses) || pausesOf(null);
  if (spec.risk.spend && pauses.spend) return "spend";
  if (spec.risk.delete && pauses.delete) return "delete";
  if (spec.risk.newContact && pauses.newContact) {
    const who = recipientOf(job, line);
    if (!contactKnown(shop, who)) return "newContact";
  }
  return "";
}

function stubMap(line, card) {
  const fromLine = findIds(line);
  if (fromLine.length) return { action: fromLine[0], said: String(line || "") };
  const word = keywordAction(line);
  if (word) return { action: word, said: String(line || "") };
  const fromCard = findIds(cardBlob(card));
  if (fromCard.length) return { action: fromCard[0], said: "Card text named " + fromCard[0] + "." };
  const wordCard = keywordAction(cardBlob(card));
  if (wordCard) return { action: wordCard, said: "Card text named " + wordCard + "." };
  return { action: "add_note", said: String(line || "") };
}

function stubAsk(line, card) {
  const named = findIds(line).concat(findIds(cardBlob(card)));
  const uniq = [];
  named.forEach((id) => { if (uniq.indexOf(id) < 0) uniq.push(id); });
  const tail = uniq.length ? (" Named " + uniq.join(" ") + ".") : "";
  return "Desk AI stub. Collect stays HOLD. Nothing sent." + tail;
}

function parseActionFromText(text) {
  const raw = String(text || "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(raw.slice(start, end + 1));
      if (obj && typeof obj.action === "string") {
        return { action: obj.action, said: typeof obj.said === "string" ? obj.said : raw.slice(0, 400) };
      }
    } catch (e) {}
  }
  const ids = findIds(raw);
  if (ids.length) return { action: ids[0], said: raw.slice(0, 400) };
  return null;
}

async function callModel(kind, line, card) {
  const key = modelKey();
  if (!key) return "";
  const payload = {
    model: process.env.AIA_GROK_MODEL || "grok-4-fast-non-reasoning",
    temperature: 0,
    max_tokens: 180,
    messages: [
      { role: "system", content: "Return JSON only. {\"action\":\"catalog id\",\"said\":\"plain sentence\"}. Do not invent actions." },
      { role: "user", content: JSON.stringify({ kind: kind, step: String(line || "").slice(0, 500), card: cardBlob(card).slice(0, 500), actions: catalog().map((row) => row.id) }) }
    ]
  };
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
}

async function mapStep(line, card) {
  if (modelFns && typeof modelFns.map === "function") {
    const out = await modelFns.map(line, card);
    if (out && typeof out === "object" && typeof out.action === "string") {
      return { action: out.action, said: typeof out.said === "string" ? out.said : String(line || "") };
    }
    if (typeof out === "string") return { action: out, said: String(line || "") };
  }
  if (!modelKey()) return stubMap(line, card);
  try {
    const text = await callModel("map", line, card);
    return parseActionFromText(text) || stubMap(line, card);
  } catch (e) {
    return stubMap(line, card);
  }
}

async function askModel(line, card) {
  if (modelFns && typeof modelFns.ask === "function") {
    const out = await modelFns.ask(line, card);
    return typeof out === "string" ? out : stubAsk(line, card);
  }
  if (!modelKey()) return stubAsk(line, card);
  try {
    const text = await callModel("ask", line, card);
    return text || stubAsk(line, card);
  } catch (e) {
    return stubAsk(line, card);
  }
}

// Desk-only effects. pay never leaves this process and never sets charged true.
function execute(action, job, step, line) {
  if (action === "pay") job.charged = false;
  if (action === "add_note") {
    const note = String(line || "Note").slice(0, 500);
    job.notes = job.notes ? (String(job.notes) + "\n" + note) : note;
    step.said = note;
    step.result = "ok";
    step.why = "";
    return;
  }
  if (action === "draft_reply") {
    job.draft = String(line || "Draft").slice(0, 500);
    job.charged = false;
    step.said = job.draft;
    step.result = "ok";
    step.why = "Draft on the card. Nothing sent.";
    return;
  }
  if (action === "set_status") {
    const found = /\b(open|waiting|done|hold)\b/i.exec(String(line || ""));
    job.status = found ? found[1].toLowerCase() : "open";
    step.said = "Status is " + job.status + ".";
    step.result = "ok";
    step.why = "";
    return;
  }
  if (action === "send_message") {
    job.sent = false;
    step.result = "held";
    step.why = "held, not sent";
    step.said = "Message held, not sent.";
    return;
  }
  if (action === "delete_card") {
    job.deleted = true;
    job.deletedAt = new Date().toISOString();
    step.result = "ok";
    step.said = "Card marked deleted on this desk.";
    step.why = "Soft delete only.";
    return;
  }
  if (action === "pay") {
    job.charged = false;
    step.charged = false;
    step.result = "held";
    step.said = "Pay was not collected.";
    step.why = "Collect stays HOLD. Nothing charged.";
    return;
  }
  step.result = "failed";
  step.why = "No such action.";
}

function finishHalt(job, shop, ai, run) {
  if (!run || run.state === "stopped" || run.state === "killed") {
    if (run) run.halt = null;
    return;
  }
  const kind = run.halt === "kill" ? "kill" : "stop";
  if (run.waiting) {
    const waiting = (run.steps || []).find((step) => step && step.n === run.waiting.n);
    if (waiting && waiting.result === "waiting") {
      waiting.result = "skipped";
      waiting.why = kind === "kill" ? "Killed." : "Stopped.";
    }
    run.waiting = null;
  }
  const n = nextN(run);
  if (kind === "kill") {
    const dropped = Math.max(0, (run.queue || []).length - (run.cursor || 0));
    run.queue = (run.queue || []).slice(0, run.cursor || 0);
    run.cardId = job.id;
    pushStep(run, n, {
      action: "kill",
      said: dropped ? ("Dropped " + dropped + " queued steps.") : "Killed.",
      result: "ok",
      why: "Killed."
    });
    run.state = "killed";
  } else {
    run.cardId = job.id;
    pushStep(run, n, { action: "stop", said: "Stopped.", result: "ok", why: "Stopped." });
    run.state = "stopped";
    if (ai && ai.automation) ai.automation.stopped = true;
  }
  run.halt = null;
  run.lock = null;
}

function haltReply(run, inFlight) {
  return {
    ok: true,
    state: run ? run.state : null,
    lastStep: run ? lastStepNum(run) : null,
    inFlight: !!inFlight
  };
}

function requestHalt(job, shop, ai, kind) {
  const run = job && job.run;
  if (!run) return { ok: true, state: null, lastStep: null, inFlight: false };
  if (run.state === "killed") return haltReply(run, false);
  if (kind === "stop" && run.state === "stopped") return haltReply(run, false);
  const inFlight = !!(run.lock && run.lock.until > Date.now());
  if (inFlight) {
    run.halt = kind;
    run.state = "stopping";
    return haltReply(run, true);
  }
  run.halt = kind;
  finishHalt(job, shop, ai, run);
  return haltReply(run, false);
}

async function performStep(job, shop, ai, run, n, key) {
  const queue = run.queue || [];
  const index = run.cursor || 0;
  if (index >= queue.length) {
    if (!(run.steps || []).some((step) => step && step.action === "plan")) {
      run.cardId = job.id;
      pushStep(run, n, { action: "plan", said: "No steps on this plan.", result: "skipped", why: "No plan steps." });
    } else {
      delete run.seen[key];
    }
    run.state = "done";
    return true;
  }
  const line = String(queue[index] || "");
  const mapped = await mapStep(line, job);
  const actionId = mapped && mapped.action;
  const spec = actionById(actionId);
  const allowed = (ai.automation && ai.automation.allowed) || [];
  run.cardId = job.id;
  if (!spec) {
    pushStep(run, n, { action: String(actionId || "unknown"), said: String(line || ""), result: "skipped", why: "No such action." });
    run.seen[key] = "done";
    run.cursor = index + 1;
    if (run.cursor >= queue.length) run.state = "done";
    return true;
  }
  if (spec.id === "pay") job.charged = false;
  if (allowed.indexOf(spec.id) < 0) {
    const step = pushStep(run, n, { action: spec.id, said: String(line || ""), result: "skipped", why: NOT_APPROVED });
    if (spec.id === "pay") step.charged = false;
    run.seen[key] = "done";
    run.cursor = index + 1;
    if (run.cursor >= queue.length) run.state = "done";
    return true;
  }
  if (spec.id === "ask_desk_ai") {
    const answer = await askModel(line, job);
    const named = findIds(answer).filter((id) => id !== "ask_desk_ai");
    const blocked = named.filter((id) => allowed.indexOf(id) < 0);
    pushStep(run, n, {
      action: "ask_desk_ai",
      said: answer,
      result: blocked.length ? "skipped" : "ok",
      why: blocked.length ? NOT_APPROVED : ""
    });
    run.seen[key] = "done";
    run.cursor = index + 1;
    if (run.cursor >= queue.length) run.state = "done";
    return true;
  }
  const why = pauseFor(spec, ai, shop, job, line);
  if (why) {
    const who = recipientOf(job, line);
    pushStep(run, n, { action: spec.id, said: String(line || spec.sentence), result: "waiting", why: pausePlain(why) });
    if (spec.id === "pay") {
      const step = run.steps[run.steps.length - 1];
      step.charged = false;
      job.charged = false;
    }
    run.waiting = { n: n, action: spec.id, why: why, recipient: who };
    run.state = "paused";
    run.seen[key] = "done";
    run.cursor = index + 1;
    return true;
  }
  const step = {
    n: n,
    at: new Date().toISOString(),
    action: spec.id,
    said: "",
    result: "ok",
    why: ""
  };
  execute(spec.id, job, step, line);
  if (spec.id === "pay") step.charged = false;
  run.steps.push(step);
  run.seen[key] = "done";
  run.cursor = index + 1;
  if (run.cursor >= queue.length) run.state = "done";
  return true;
}

async function tickOne(job, shop, ai) {
  const run = job && job.run;
  if (!run) return { ok: true, state: null, lastStep: null, inFlight: false, moved: false };
  if (run.state !== "running" || run.waiting) {
    return { ok: true, state: run.state, lastStep: lastStepNum(run), inFlight: false, moved: false };
  }
  const now = Date.now();
  if (run.lock && run.lock.until > now) {
    return { ok: true, state: run.state, lastStep: lastStepNum(run), inFlight: true, moved: false };
  }
  if (!run.seen) run.seen = {};
  const n = nextN(run);
  const key = String(job.id) + ":" + n;
  if (run.seen[key] === "open") {
    return { ok: true, state: run.halt ? "stopping" : run.state, lastStep: lastStepNum(run), inFlight: true, moved: false };
  }
  if (run.seen[key] === "done") {
    return { ok: true, state: run.state, lastStep: lastStepNum(run), inFlight: false, moved: false };
  }
  const token = crypto.randomBytes(8).toString("hex");
  run.seen[key] = "open";
  run.lock = { token: token, until: now + leaseMs() };
  let moved = false;
  try {
    if (tickHold) await tickHold(job);
    if (run.halt === "stop" || run.halt === "kill") {
      delete run.seen[key];
      finishHalt(job, shop, ai, run);
      moved = true;
    } else {
      moved = await performStep(job, shop, ai, run, n, key);
      if (run.halt === "stop" || run.halt === "kill") finishHalt(job, shop, ai, run);
    }
  } finally {
    if (run.lock && run.lock.token === token) run.lock = null;
  }
  return { ok: true, state: run.state, lastStep: lastStepNum(run), inFlight: false, moved: !!moved };
}

function cronEligible(job) {
  const run = job && job.run;
  if (!run) return false;
  if (run.state !== "running") return false;
  if (!run.startedBy) return false;
  if (run.waiting) return false;
  if (run.ticksBy !== "cron") return false;
  if (run.lock && run.lock.until > Date.now()) return false;
  return true;
}

async function cronTickOne() {
  const jobs = mem.jobs || [];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    if (!cronEligible(job)) continue;
    const shop = (mem.workspaces || []).find((row) => row && row.slug === job.workspace) || null;
    const ai = shop ? liveAi(shop, job.run.aiId) : null;
    if (!shop || !ai) continue;
    const view = approvalView(ai);
    if (!view.approved || view.needsNewYes) continue;
    const before = (job.run.steps || []).length;
    await tickOne(job, shop, ai);
    const after = (job.run.steps || []).length;
    return {
      ok: true,
      cron: true,
      ticked: after > before,
      cardId: job.id,
      state: job.run.state,
      lastStep: lastStepNum(job.run),
      inFlight: false
    };
  }
  return { ok: true, cron: true, ticked: false, cardId: null, state: null, lastStep: null, inFlight: false };
}

function deny(res) {
  return res.status(403).json({ ok: false, error: "Not allowed." });
}

async function handle(req, res) {
  const body = (req && req.body && typeof req.body === "object") ? req.body : await readBody(req);
  const action = String(body.action || "").toLowerCase();
  if (action === "run-tick" && !pinRaw(req, body)) {
    if (!cronAuthorized(req)) return deny(res);
    const out = await cronTickOne();
    if (out.ticked) await save();
    return res.status(200).json(out);
  }
  const gate = ownerGate(req, body);
  if (!gate.ok) return res.status(gate.status).json(gate.body);
  const shop = gate.shop;
  const person = gate.person;

  if (action === "approve-automation" || action === "automation-pauses") {
    const found = aiOnDesk(shop, body.aiId || body.id || body.ai);
    if (found.error) return res.status(found.error.status).json(found.error.body);
    const ai = found.ai;
    if (action === "automation-pauses") {
      const pauses = pausesOf(body.pauses);
      if (!pauses) return res.status(400).json({ ok: false, error: "Pauses must be yes or no for spending, deleting, and someone new." });
      if (!ai.automation) ai.automation = {};
      ai.automation.pauses = pauses;
      await save();
      const view = approvalView(ai);
      return res.status(200).json({ ok: true, approved: view.approved, needsNewYes: view.needsNewYes, needsNewYesWhy: view.needsNewYesWhy, pauses: view.pauses });
    }
    const checked = validateAllowed(body.allowed);
    if (!checked.ok) return res.status(400).json({ ok: false, error: checked.error });
    const pauses = body.pauses == null ? pausesOf(ai.automation && ai.automation.pauses) : pausesOf(body.pauses);
    if (!pauses) return res.status(400).json({ ok: false, error: "Pauses must be yes or no for spending, deleting, and someone new." });
    stampApproval(ai, checked.allowed, pauses, person);
    await save();
    const stored = (shop.ais || []).find((row) => row && row.id === ai.id) || ai;
    return res.status(200).json({ ok: true, charged: false, ai: storedApprovalAi(stored) });
  }

  const card = cardOnDesk(shop, body.cardId || body.id);
  if (card.error) return res.status(card.error.status).json(card.error.body);
  const job = card.job;

  if (action === "run-read") {
    return res.status(200).json(Object.assign({ ok: true }, readFields(job, shop)));
  }

  if (action === "run-stop" || action === "run-kill") {
    const ai = aiForCard(shop, job);
    const out = requestHalt(job, shop, ai, action === "run-kill" ? "kill" : "stop");
    await save();
    return res.status(200).json(out);
  }

  if (action === "run-start") {
    const found = aiOnDesk(shop, body.aiId || body.ai);
    if (found.error) return res.status(found.error.status).json(found.error.body);
    const ai = found.ai;
    const view = approvalView(ai);
    if (!view.approved || view.needsNewYes) {
      return res.status(409).json({
        ok: false,
        error: view.needsNewYes ? "This automation needs a new Yes." : "This automation needs a Yes before it can run.",
        needsNewYes: !!view.needsNewYes,
        needsNewYesWhy: view.needsNewYesWhy
      });
    }
    if (job.run && job.run.state === "killed") return res.status(409).json({ ok: false, error: "This run was killed." });
    if (job.run && job.run.state === "done") return res.status(409).json({ ok: false, error: "This run is already done." });
    if (job.run && (job.run.state === "running" || job.run.state === "paused" || job.run.state === "stopping")) {
      return res.status(200).json(Object.assign({ ok: true, state: job.run.state, lastStep: lastStepNum(job.run), inFlight: !!(job.run.lock && job.run.lock.until > Date.now()) }, readFields(job, shop)));
    }
    if (!job.run) {
      job.run = {
        state: "running",
        ticksBy: ticksMode(),
        aiId: ai.id,
        steps: [],
        waiting: null,
        startedBy: person.id || person.name || "owner",
        startedAt: new Date().toISOString(),
        queue: planOf(ai).slice(),
        cursor: 0,
        lock: null,
        halt: null,
        seen: {}
      };
    } else {
      job.run.state = "running";
      job.run.halt = null;
      job.run.aiId = ai.id;
      job.run.startedBy = job.run.startedBy || person.id || person.name || "owner";
    }
    await tickOne(job, shop, ai);
    await save();
    return res.status(200).json(Object.assign({ ok: true, state: job.run.state, lastStep: lastStepNum(job.run), inFlight: false }, readFields(job, shop)));
  }

  if (action === "step-answer") {
    const ai = aiForCard(shop, job);
    const run = job.run;
    const n = Number(body.n);
    if (!run || !run.waiting || run.waiting.n !== n || run.state !== "paused") {
      return res.status(409).json({ ok: false, error: "That is not the step waiting for an answer." });
    }
    const yes = body.yes === true || body.yes === "yes";
    const step = (run.steps || []).find((row) => row && row.n === n);
    const spec = actionById(run.waiting.action);
    const allowed = (ai && ai.automation && ai.automation.allowed) || [];
    if (!yes) {
      if (step) {
        step.result = "skipped";
        step.why = "You said no.";
      }
      run.waiting = null;
      run.state = run.cursor >= (run.queue || []).length ? "done" : "running";
    } else if (!spec || allowed.indexOf(spec.id) < 0) {
      if (step) {
        step.result = "skipped";
        step.why = NOT_APPROVED;
      }
      run.waiting = null;
      run.state = run.cursor >= (run.queue || []).length ? "done" : "running";
    } else {
      if (spec.id === "send_message" && run.waiting.why === "newContact") {
        rememberContact(shop, run.waiting.recipient, person && person.name);
      }
      if (step) execute(spec.id, job, step, step.said || "");
      if (spec.id === "pay" && step) step.charged = false;
      run.waiting = null;
      run.state = run.cursor >= (run.queue || []).length ? "done" : "running";
    }
    await save();
    return res.status(200).json(Object.assign({ ok: true, state: job.run.state, lastStep: lastStepNum(job.run), inFlight: false }, readFields(job, shop)));
  }

  if (action === "run-tick") {
    const ai = aiForCard(shop, job);
    const result = await tickOne(job, shop, ai);
    if (result.moved) await save();
    return res.status(200).json(Object.assign({
      ok: true,
      state: result.state,
      lastStep: result.lastStep,
      inFlight: !!result.inFlight
    }, readFields(job, shop)));
  }

  return res.status(400).json({ ok: false, error: "Unknown desk action." });
}

async function cronHandler(req, res) {
  if (!cronAuthorized(req)) return deny(res);
  const out = await cronTickOne();
  if (out.ticked) await save();
  return res.status(200).json(out);
}

module.exports = {
  PAGE_NOTE,
  NOT_APPROVED,
  catalog,
  actionById,
  ticksMode,
  validateAllowed,
  pausesOf,
  approvalHash,
  stampApproval,
  approvalView,
  suggestAllowed,
  cronAuthorized,
  handle,
  cronHandler,
  setLeaseMsForTests,
  setTickHoldForTests,
  setModelForTests,
  publicRun,
  readFields
};

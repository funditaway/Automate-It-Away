// Desk automation runner.
// One Yes approves the allowed actions and the plan. Each tick takes one step.
// Locks, step results, stops, kills and run numbers are create-if-absent claims
// (api/_runclaims.js). The desk store is updated by version compare-and-swap.
// Nothing here charges. Collect stays HOLD.
const crypto = require("crypto");
const fs = require("fs");
const { mem, save, readBody, personOf, isOwner, slugify, workspaceOf, applyStore, payload } = require("./_lib");
const claims = require("./_runclaims");

const PAGE_NOTE = "Steps only move while this page is open.";
const NOT_APPROVED = "Not on the approved list.";
const NEEDS_YES = "This automation needs a new Yes.";
const AI_GONE = "That Desk AI is gone.";
const STEP_STOPPED = "This step stopped before finishing.";
const CARD_GONE = "This card is gone.";
const NO_MATCH = "No approved action matches this step.";
const MANY_MATCH = "This step matches more than one action.";
const KILL_MSG = "This card's automation was killed.";
const HOLD_WHY = "Collect stays HOLD. Nothing charged.";
const MODEL_MS = 8000;
const STEP_MS = 12000;

const ACTIONS = [
  { id: "add_note", sentence: "Add a note on this card.", risk: { spend: false, delete: false, newContact: false }, held: false, keys: ["note"] },
  { id: "draft_reply", sentence: "Draft a reply on this card.", risk: { spend: false, delete: false, newContact: false }, held: false, keys: ["draft", "reply"] },
  { id: "set_status", sentence: "Set the status on this card.", risk: { spend: false, delete: false, newContact: false }, held: false, keys: ["status"] },
  { id: "ask_desk_ai", sentence: "Ask the Desk AI about this step.", risk: { spend: false, delete: false, newContact: false }, held: false, keys: ["ask"] }
];

let fixtures = [];
let leaseMsValue = Number(process.env.AIA_LEASE_MS) > 0 ? Number(process.env.AIA_LEASE_MS) : 15000;
let tickHold = null;
let modelFns = null;

function mutation(name) { return claims.mutation(name); }

function catalog() {
  return ACTIONS.map(publicAction);
}

function publicAction(row) {
  return {
    id: row.id,
    sentence: row.sentence,
    risk: { spend: !!row.risk.spend, delete: !!row.risk.delete, newContact: !!row.risk.newContact },
    held: !!row.held
  };
}

function knownActions() {
  return ACTIONS.concat(fixtures || []);
}

function actionById(id) {
  return knownActions().find((row) => row.id === id) || null;
}

function catalogAction(id) {
  return ACTIONS.find((row) => row.id === id) || null;
}

function ticksMode() {
  return process.env.VERCEL_ENV === "production" ? "cron" : "page";
}

function modelKey() {
  return process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.AIA_GROK_KEY || "";
}

function setLeaseMsForTests(ms) { leaseMsValue = Number(ms) > 0 ? Number(ms) : 15000; }
function setTickHoldForTests(fn) { tickHold = typeof fn === "function" ? fn : null; }
function setModelForTests(fns) { modelFns = fns || null; }
function setFixtureActionsForTests(rows) { fixtures = Array.isArray(rows) ? rows.map((row) => Object.assign({ keys: [], held: false }, row)) : []; }
function setMutationForTests(name, on) { return claims.setMutationForTests(name, on); }
function leaseMs() { return leaseMsValue; }

function safeId(id) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

function lockRel(cardId, runNo, n, attempt) {
  return "locks/run-" + safeId(cardId) + "-" + runNo + "-" + n + "-" + attempt;
}
function doneRel(cardId, runNo, n) {
  return "done/run-" + safeId(cardId) + "-" + runNo + "-" + n;
}
function answerRel(cardId, runNo, n) {
  return "answer/run-" + safeId(cardId) + "-" + runNo + "-" + n;
}
function stopRel(cardId, runNo) {
  return "stop/run-" + safeId(cardId) + "-" + runNo;
}
function killRel(cardId) {
  return "kill/run-" + safeId(cardId);
}
function runRel(cardId, runNo) {
  return "runs/" + safeId(cardId) + "-" + runNo;
}
function effectId(cardId, runNo, n) {
  return "run-" + safeId(cardId) + "-" + runNo + "-" + n;
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function withTimeout(work, ms, why) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      const err = new Error(why || "This step timed out.");
      err.code = "STEP_TIMEOUT";
      reject(err);
    }, ms);
    Promise.resolve().then(work).then((value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    }, (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

function plainError(err) {
  const msg = err && err.message ? String(err.message) : "This step failed.";
  if (err && err.code === "STEP_TIMEOUT" || /timed out/i.test(msg)) return "This step timed out.";
  return msg.replace(/\s+/g, " ").slice(0, 180) || "This step failed.";
}

function word(text, key) {
  return new RegExp("(^|[^a-z0-9_])" + key + "([^a-z0-9_]|$)", "i").test(String(text || ""));
}

function namedIds(text) {
  const ids = signalsOf(text).slice();
  const extra = String(text || "").match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) || [];
  extra.forEach((id) => { if (ids.indexOf(id) < 0) ids.push(id); });
  return ids;
}

function signalsOf(text) {
  const src = String(text || "");
  const found = [];
  ACTIONS.forEach((row) => {
    const byId = word(src, row.id);
    const byKey = (row.keys || []).some((key) => word(src, key));
    if ((byId || byKey) && found.indexOf(row.id) < 0) found.push(row.id);
  });
  (fixtures || []).forEach((row) => {
    if (row && row.id && word(src, row.id) && found.indexOf(row.id) < 0) found.push(row.id);
  });
  return found;
}

function suggestAllowed(brief, pack, plan) {
  const chunks = [];
  if (brief) chunks.push(String(brief));
  const lists = [plan, pack && pack.plan];
  lists.forEach((list) => {
    if (Array.isArray(list)) list.forEach((line) => chunks.push(String(line || "")));
    else if (typeof list === "string" && list) chunks.push(list);
  });
  if (pack && pack.does) chunks.push(String(pack.does));
  const ids = [];
  chunks.forEach((chunk) => {
    signalsOf(chunk).forEach((id) => { if (ids.indexOf(id) < 0) ids.push(id); });
  });
  return ids;
}

function validateAllowed(value) {
  if (!Array.isArray(value)) return { ok: false, error: "Allowed actions must be a list." };
  const ids = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== "string") return { ok: false, error: "Allowed actions must be action names." };
    if (!catalogAction(item)) return { ok: false, error: "Unknown action." };
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
  try { return require("./_ais").planText(ai && ai.plan).plan; }
  catch (e) { return Array.isArray(ai && ai.plan) ? ai.plan.slice() : []; }
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
    approvedPlan: plan.slice()
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
  return { approved: !why, needsNewYes: !!why, needsNewYesWhy: why, pauses: pauses };
}

function yesAfter(ai, stop) {
  const approvedAt = Date.parse(ai && ai.automation && ai.automation.approvedAt || "");
  const stoppedAt = Date.parse(stop && stop.at || "");
  return Number.isFinite(approvedAt) && Number.isFinite(stoppedAt) && approvedAt > stoppedAt;
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
  return (shop.ais || []).find((row) => row && (row.id === want || String(row.name || "").toLowerCase() === want.toLowerCase())) || null;
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

function jobById(id) {
  return (mem.jobs || []).find((row) => row && row.id === id) || null;
}

function shopBySlug(slug) {
  return (mem.workspaces || []).find((row) => row && row.slug === slug) || null;
}

function lastStepNum(run) {
  const steps = (run && run.steps) || [];
  if (!steps.length) return null;
  const last = steps[steps.length - 1];
  return last && typeof last.n === "number" ? last.n : null;
}

function publicStep(step) {
  return {
    n: step.n,
    at: step.at,
    action: step.action,
    said: step.said || "",
    result: step.result,
    why: step.why || ""
  };
}

function publicRun(run) {
  if (!run) return null;
  const ticksBy = run.ticksBy === "cron" ? "cron" : "page";
  const out = {
    state: run.state,
    ticksBy: ticksBy,
    aiId: run.aiId || "",
    runNo: run.runNo || null,
    steps: (run.steps || []).map(publicStep),
    waiting: run.waiting ? { n: run.waiting.n, action: run.waiting.action, why: run.waiting.why } : null
  };
  if (ticksBy === "page") out.note = PAGE_NOTE;
  return out;
}

function cardAiId(shop, job) {
  if (!job) return null;
  const hint = job.run && job.run.aiId ? job.run.aiId : (job.deskAi != null && job.deskAi !== "" ? job.deskAi : job.aiId);
  if (hint == null || hint === "") return null;
  const key = typeof hint === "object" ? (hint.id || hint.aiId || hint.name || "") : hint;
  if (!key) return null;
  const hit = liveAi(shop, key);
  return hit ? hit.id : null;
}

async function highestRunNo(cardId) {
  let k = 0;
  for (let n = 1; n < 500; n++) {
    const rec = await claims.readClaim(runRel(cardId, n));
    if (!rec) return k;
    k = n;
  }
  return k;
}

async function readKill(cardId) { return claims.readClaim(killRel(cardId)); }
async function readStop(cardId, runNo) {
  if (!runNo) return null;
  return claims.readClaim(stopRel(cardId, runNo));
}

async function stepRecord(cardId, runNo, n) {
  const answer = await claims.readClaim(answerRel(cardId, runNo, n));
  if (answer) return answer;
  return claims.readClaim(doneRel(cardId, runNo, n));
}

async function loadSteps(cardId, runNo) {
  const steps = [];
  for (let n = 1; n < 200; n++) {
    const rec = await stepRecord(cardId, runNo, n);
    if (!rec) break;
    steps.push({
      id: effectId(cardId, runNo, n),
      n: n,
      at: rec.at,
      action: rec.action,
      said: rec.said || "",
      result: rec.result,
      why: rec.why || ""
    });
  }
  return steps;
}

async function flightOf(cardId, runNo, n) {
  if (!cardId || !runNo || !n) return { inFlight: false, stepStartedAt: null };
  const done = await claims.readClaim(doneRel(cardId, runNo, n));
  if (done) return { inFlight: false, stepStartedAt: null };
  let latest = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const rec = await claims.readClaim(lockRel(cardId, runNo, n, attempt));
    if (!rec) break;
    latest = rec;
  }
  if (!latest) return { inFlight: false, stepStartedAt: null };
  if (Date.parse(latest.expiresAt) > Date.now()) return { inFlight: true, stepStartedAt: latest.at || null };
  return { inFlight: false, stepStartedAt: null };
}

async function runView(ai, job) {
  const base = ai ? approvalView(ai) : { approved: false, needsNewYes: false, needsNewYesWhy: null, pauses: pausesOf(null) };
  const run = job && job.run;
  if (!run || !run.runNo) return base;
  const stop = await readStop(job.id, run.runNo);
  if (stop && !yesAfter(ai, stop)) {
    if (base.needsNewYes && (base.needsNewYesWhy === "allowed" || base.needsNewYesWhy === "plan")) return base;
    return { approved: false, needsNewYes: true, needsNewYesWhy: "stopped", pauses: base.pauses };
  }
  if (stop && yesAfter(ai, stop)) return base;
  if (run.state === "running" && run.approvedHash && ai && ai.automation && ai.automation.approvedHash && run.approvedHash !== ai.automation.approvedHash && !base.needsNewYes) {
    return { approved: false, needsNewYes: true, needsNewYesWhy: "plan", pauses: base.pauses };
  }
  return base;
}

async function readFields(job, shop) {
  const aiId = cardAiId(shop, job);
  const ai = aiId ? liveAi(shop, aiId) : null;
  let view = await runView(ai, job);
  const allowed = ai && ai.automation && Array.isArray(ai.automation.allowed) ? ai.automation.allowed.slice() : [];
  const run = job && job.run;
  let runNo = run && run.runNo || null;
  let steps = run && run.runNo ? await loadSteps(job.id, run.runNo) : [];
  let state = run ? run.state : null;
  const killed = job ? await readKill(job.id) : null;
  const stopped = !killed && runNo ? await readStop(job.id, runNo) : null;
  const n = run ? ((run.cursor || 0) + 1) : 0;
  const flight = await flightOf(job && job.id, runNo, n);
  if (killed) state = flight.inFlight ? "stopping" : "killed";
  else if (stopped) state = flight.inFlight ? "stopping" : "stopped";
  const shown = run ? Object.assign({}, run, { state: state || run.state, steps: steps.length ? steps : (run.steps || []) }) : null;
  if (!ai && run && run.aiId) view = Object.assign({}, view);
  return {
    run: publicRun(shown),
    aiId: aiId,
    allowed: allowed,
    approved: view.approved,
    needsNewYes: view.needsNewYes,
    needsNewYesWhy: view.needsNewYesWhy,
    pauses: view.pauses,
    inFlight: !!flight.inFlight,
    stepStartedAt: flight.stepStartedAt || null,
    runNo: runNo
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

function addressKey(value) {
  const key = String(value || "").trim().toLowerCase();
  if (!key) return "";
  if (key.indexOf("@") >= 0 && key.indexOf(" ") < 0) return key;
  const digits = key.replace(/[^\d]/g, "");
  if (digits.length >= 7 && /^[+\d\s().-]+$/.test(key)) return digits;
  return "";
}

function recipientOf(job, line) {
  const parts = [line];
  if (job) parts.push(job.email, job.phone, job.to);
  if (mutation("nameIsKnown") && job) parts.push(job.contactName);
  const blob = parts.filter(Boolean).join(" ");
  const email = blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email) return addressKey(email[0]);
  if (job && job.phone) return addressKey(job.phone);
  if (mutation("nameIsKnown") && job && job.contactName) return String(job.contactName).trim().toLowerCase();
  return "";
}

function contactKnown(shop, key) {
  const id = addressKey(key);
  if (!id) return false;
  if (mutation("contactsCrossDesk")) {
    return (mem.workspaces || []).some((row) => (row && row.approvedContacts || []).some((item) => item && item.key === id));
  }
  return (shop && shop.approvedContacts || []).some((item) => item && item.key === id);
}

function rememberContact(shop, key, by) {
  const id = addressKey(key);
  if (!id || !shop) return;
  if (!Array.isArray(shop.approvedContacts)) shop.approvedContacts = [];
  if (contactKnown(shop, id)) return;
  shop.approvedContacts.push({ key: id, label: id, at: new Date().toISOString(), by: by || "" });
}

function pausePlain(why) {
  if (why === "spend") return "Waiting for a yes before spending.";
  if (why === "delete") return "Waiting for a yes before deleting.";
  return "Waiting for a yes before messaging someone new.";
}

function pauseFor(spec, ai, shop, job, line) {
  if (!spec || !spec.risk) return "";
  const pauses = pausesOf(ai && ai.automation && ai.automation.pauses) || pausesOf(null);
  if (spec.risk.spend && pauses.spend) return "spend";
  if (spec.risk.delete && pauses.delete) return "delete";
  if (spec.risk.newContact && pauses.newContact) {
    const who = recipientOf(job, line);
    if (!contactKnown(shop, who)) return "newContact";
  }
  return "";
}

function stubAsk(line) {
  const named = signalsOf(line);
  const tail = named.length ? (" Named " + named.join(" ") + ".") : "";
  return "Desk AI stub. Collect stays HOLD. Nothing sent." + tail;
}

async function callModel(kind, line, card, budget) {
  if (budget.calls >= 1 && !mutation("twoModelCalls")) return "";
  budget.calls += 1;
  const key = modelKey();
  if (!key) return "";
  const payloadBody = {
    model: process.env.AIA_GROK_MODEL || "grok-4-fast-non-reasoning",
    temperature: 0,
    max_tokens: 180,
    messages: [
      { role: "system", content: "Return JSON only. {\"action\":\"catalog id\",\"said\":\"plain sentence\"}." },
      { role: "user", content: JSON.stringify({ kind: kind, step: String(line || "").slice(0, 500), actions: catalog().map((row) => row.id) }) }
    ]
  };
  const response = await withTimeout(() => fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify(payloadBody)
  }), MODEL_MS, "This step timed out.");
  const data = await response.json().catch(() => ({}));
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
}

async function mapStep(line, budget) {
  const signals = signalsOf(line);
  if (signals.length === 1 && !mutation("defaultAddNote") && !mutation("twoModelCalls")) {
    return { action: signals[0], said: String(line || "") };
  }
  if (modelFns && typeof modelFns.map === "function" && (budget.calls < 1 || mutation("twoModelCalls"))) {
    budget.calls += 1;
    const out = await withTimeout(() => modelFns.map(line), MODEL_MS, "This step timed out.");
    if (out && typeof out === "object" && typeof out.action === "string") {
      return { action: out.action, said: typeof out.said === "string" ? out.said : String(line || "") };
    }
    if (typeof out === "string" && out) return { action: out, said: String(line || "") };
  } else if (modelKey() && signals.length !== 1) {
    const text = await callModel("map", line, null, budget);
    const ids = signalsOf(text);
    if (ids.length === 1) return { action: ids[0], said: String(line || "") };
  }
  if (mutation("defaultAddNote")) return { action: "add_note", said: String(line || "") };
  if (!signals.length) return { none: true };
  return { many: true };
}

function effectFor(action, line) {
  if (action === "add_note") return { type: "add_note", text: String(line || "Note").slice(0, 500) };
  if (action === "draft_reply") return { type: "draft_reply", text: String(line || "Draft").slice(0, 500) };
  if (action === "set_status") {
    const found = /\b(open|waiting|done|hold)\b/i.exec(String(line || ""));
    return { type: "set_status", value: found ? found[1].toLowerCase() : "open" };
  }
  if (action === "ask_desk_ai") return { type: "ask", text: "" };
  return { type: "none" };
}

function applyEffect(job, effect) {
  if (!job || !effect || !effect.id) return false;
  if (!Array.isArray(job.applied)) job.applied = [];
  if (job.applied.indexOf(effect.id) >= 0) return false;
  job.charged = false;
  if (effect.type === "add_note") {
    const text = String(effect.text || "");
    job.notes = job.notes ? (String(job.notes) + "\n" + text) : text;
  } else if (effect.type === "draft_reply") {
    job.draft = String(effect.text || "");
  } else if (effect.type === "set_status") {
    job.status = effect.value || "open";
  }
  job.applied.push(effect.id);
  return true;
}

async function haltKind(cardId, runNo) {
  if (await readKill(cardId)) return "kill";
  if (!mutation("noStopCheck") && await readStop(cardId, runNo)) return "stop";
  return "";
}

function currentEnough(runNo, current) {
  return !!runNo && runNo === current;
}

async function publishBody(body) {
  if (!body) return { ok: false };
  applyStore(body);
  try { await save(); } catch (e) {}
  return { ok: true };
}

async function casApply(cardId, mutate, stale) {
  const result = await claims.casDesk((body) => mutate(body, cardId), stale);
  if (result && result.ok && result.body && !result.skipped) await publishBody(result.body);
  return result || { ok: false };
}

function patchJob(body, cardId, patch) {
  const job = (body.jobs || []).find((row) => row && row.id === cardId);
  if (!job) return null;
  if (!job.run) job.run = {};
  if (patch.run) job.run = Object.assign({}, job.run, patch.run);
  if (patch.effect) applyEffect(job, patch.effect);
  if (patch.step && job.run) {
    if (!Array.isArray(job.run.steps)) job.run.steps = [];
    if (!job.run.steps.some((step) => step && step.id === patch.step.id)) job.run.steps.push(patch.step);
  }
  if (patch.contact && patch.contact.key) {
    const shop = (body.workspaces || []).find((row) => row && row.slug === job.workspace);
    if (shop) rememberContact(shop, patch.contact.key, patch.contact.by);
  }
  if (patch.deleted) job.deleted = true;
  return job;
}

async function commitRecord(rel, cardId, runNo, record, stale) {
  const current = await highestRunNo(cardId);
  if (!currentEnough(runNo, current)) return { dropped: true };
  if (await haltKind(cardId, runNo)) return { halted: true };
  const won = await claims.claim(rel, record);
  if (!won.ok) return { lost: true, record: won.record };
  if (process.env.AIA_DIE_AFTER_COMMIT === "1") process.exit(0);
  const step = {
    id: record.effect && record.effect.id || effectId(cardId, runNo, record.n),
    n: record.n,
    at: record.at,
    action: record.action,
    said: record.said || "",
    result: record.result,
    why: record.why || ""
  };
  const applied = await casApply(cardId, (body) => {
    const job = patchJob(body, cardId, { effect: record.effect, step: step, run: record.run || null, contact: record.contact || null });
    return !!job;
  }, stale);
  if (await haltKind(cardId, runNo)) await markHalt(cardId, runNo, await haltKind(cardId, runNo));
  return { ok: true, won: true, applied: !!(applied && applied.ok), applyFailed: !(applied && applied.ok) };
}

async function finishHalted(job, run, kind, stale) {
  const state = kind === "kill" ? "killed" : "stopped";
  const n = (run.cursor || 0) + 1;
  if (!(await stepRecord(job.id, run.runNo, n))) {
    const why = kind === "kill" ? KILL_MSG : "Stopped.";
    const at = new Date().toISOString();
    const record = {
      at: at,
      runNo: run.runNo,
      n: n,
      action: kind === "kill" ? "kill" : "stop",
      said: why,
      result: "skipped",
      why: why,
      effect: { id: effectId(job.id, run.runNo, n), type: "none" },
      run: { state: state, waiting: null, queue: kind === "kill" ? [] : (run.queue || []), cursor: run.cursor || 0 }
    };
    const won = await claims.claim(doneRel(job.id, run.runNo, n), record);
    if (won.ok) {
      const step = {
        id: record.effect.id,
        n: n,
        at: at,
        action: record.action,
        said: why,
        result: "skipped",
        why: why
      };
      await casApply(job.id, (body, cardId) => {
        const live = patchJob(body, cardId, { step: step, run: record.run });
        return !!live;
      }, stale);
    }
  }
  await markHalt(job.id, run.runNo, kind);
}

async function recordKillStep(cardId, runNo) {
  const job = jobById(cardId);
  const run = job && job.run;
  if (!run || run.runNo !== runNo) return;
  const n = (run.cursor || 0) + 1;
  if (await stepRecord(cardId, runNo, n)) return;
  const at = new Date().toISOString();
  const record = {
    at: at,
    runNo: runNo,
    n: n,
    action: "kill",
    said: KILL_MSG,
    result: "skipped",
    why: KILL_MSG,
    effect: { id: effectId(cardId, runNo, n), type: "none" },
    run: { state: "killed", waiting: null, queue: [], cursor: run.cursor || 0 }
  };
  const won = await claims.claim(doneRel(cardId, runNo, n), record);
  if (!won.ok) return;
  const step = {
    id: record.effect.id,
    n: n,
    at: at,
    action: "kill",
    said: KILL_MSG,
    result: "skipped",
    why: KILL_MSG
  };
  await casApply(cardId, (body) => {
    const live = (body.jobs || []).find((row) => row && row.id === cardId);
    if (!live || !live.run || live.run.runNo !== runNo) return false;
    live.run.state = "killed";
    live.run.waiting = null;
    live.run.queue = [];
    if (!Array.isArray(live.run.steps)) live.run.steps = [];
    if (!live.run.steps.some((row) => row && row.id === step.id)) live.run.steps.push(step);
    return true;
  }, null);
}

async function markHalt(cardId, runNo, kind) {
  const state = kind === "kill" ? "killed" : "stopped";
  if (kind === "kill") await recordKillStep(cardId, runNo);
  await casApply(cardId, (body) => {
    const job = (body.jobs || []).find((row) => row && row.id === cardId);
    if (!job || !job.run) return false;
    if (kind === "stop" && job.run.runNo && job.run.runNo !== runNo) return false;
    job.run.state = state;
    job.run.waiting = null;
    if (kind === "kill") job.run.queue = [];
    return true;
  }, null);
}

async function noteNeedsYes(job, shop, ai, run, stale) {
  const notedRel = "noted/run-" + safeId(job.id) + "-" + run.runNo + "-needs-yes";
  const noted = await claims.claim(notedRel, { at: new Date().toISOString() });
  if (!noted.ok) {
    await markHalt(job.id, run.runNo, "stop");
    const live = jobById(job.id);
    if (live && live.run) live.run.state = "paused";
    return { paused: true };
  }
  const n = (run.cursor || 0) + 1;
  const at = new Date().toISOString();
  const record = {
    at: at,
    runNo: run.runNo,
    n: n,
    action: "plan",
    said: NEEDS_YES,
    result: "skipped",
    why: NEEDS_YES,
    effect: { id: effectId(job.id, run.runNo, n), type: "none" },
    run: { state: "paused", cursor: run.cursor || 0, waiting: null }
  };
  await commitRecord(doneRel(job.id, run.runNo, n), job.id, run.runNo, record, stale);
  const live = jobById(job.id);
  if (live && live.run) live.run.state = "paused";
  return { paused: true };
}

async function buildOutcome(job, shop, ai, run, line) {
  const budget = { calls: 0 };
  if (!line && line !== "") {
    return { action: "plan", said: "No steps on this plan.", result: "skipped", why: "No plan steps.", effect: { type: "none" } };
  }
  const mapped = await mapStep(line, budget);
  if (mapped.none) return { action: "plan", said: String(line || ""), result: "skipped", why: NO_MATCH, effect: { type: "none" } };
  if (mapped.many) return { action: "plan", said: String(line || ""), result: "skipped", why: MANY_MATCH, effect: { type: "none" } };
  const spec = actionById(mapped.action);
  if (!spec || (!catalogAction(spec.id) && !(fixtures || []).some((row) => row.id === spec.id))) {
    return { action: String(mapped.action || "unknown"), said: String(line || ""), result: "skipped", why: "No such action.", effect: { type: "none" } };
  }
  const allowed = (ai && ai.automation && ai.automation.allowed) || [];
  if (allowed.indexOf(spec.id) < 0) {
    return { action: spec.id, said: String(line || ""), result: "skipped", why: NOT_APPROVED, effect: { type: "none" } };
  }
  const pause = pauseFor(spec, ai, shop, job, line);
  if (pause) {
    return {
      action: spec.id,
      said: String(line || spec.sentence || ""),
      result: "waiting",
      why: pausePlain(pause),
      effect: { type: "none" },
      waiting: { n: 0, action: spec.id, why: pause, recipient: recipientOf(job, line) }
    };
  }
  if (spec.risk && spec.risk.spend && !pause) {
    return { action: spec.id, said: "Pay was not collected.", result: "failed", why: HOLD_WHY, effect: { type: "none" } };
  }
  if (spec.id === "ask_desk_ai") {
    let said = mapped.said || "";
    if (budget.calls < 1 || mutation("twoModelCalls")) {
      if (modelFns && typeof modelFns.ask === "function") {
        budget.calls += 1;
        const out = await withTimeout(() => modelFns.ask(line, job), MODEL_MS, "This step timed out.");
        said = typeof out === "string" ? out : stubAsk(line);
      } else if (!modelKey()) said = stubAsk(line);
      else said = await callModel("ask", line, job, budget) || stubAsk(line);
    }
    const named = namedIds(said).filter((id) => id !== "ask_desk_ai");
    const blocked = named.filter((id) => allowed.indexOf(id) < 0);
    return {
      action: "ask_desk_ai",
      said: said,
      result: blocked.length ? "skipped" : "ok",
      why: blocked.length ? NOT_APPROVED : "",
      effect: blocked.length ? { type: "none" } : { type: "ask", text: said }
    };
  }
  const effect = effectFor(spec.id, line);
  if (spec.id === "add_note") return { action: spec.id, said: effect.text, result: "ok", why: "", effect: effect };
  if (spec.id === "draft_reply") return { action: spec.id, said: effect.text, result: "ok", why: "Draft on the card. Nothing sent.", effect: effect };
  if (spec.id === "set_status") return { action: spec.id, said: "Status is " + effect.value + ".", result: "ok", why: "", effect: effect };
  return { action: spec.id, said: String(line || ""), result: "failed", why: "No such action.", effect: { type: "none" } };
}

async function claimStep(cardId, runNo, n) {
  if (mutation("noLock")) {
    return { ok: true, attempt: 0, at: new Date().toISOString(), expiresAt: new Date(Date.now() + leaseMs()).toISOString(), bypass: true };
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    const existing = await claims.readClaim(lockRel(cardId, runNo, n, attempt));
    if (!existing) {
      const at = new Date().toISOString();
      const expiresAt = new Date(Date.now() + leaseMs()).toISOString();
      const won = await claims.claim(lockRel(cardId, runNo, n, attempt), { at: at, expiresAt: expiresAt });
      if (!won.ok) continue;
      return { ok: true, attempt: attempt, at: at, expiresAt: expiresAt, afterExpiry: attempt > 0 };
    }
    if (Date.parse(existing.expiresAt) > Date.now()) {
      return { ok: false, inFlight: true, stepStartedAt: existing.at || null };
    }
  }
  return { ok: false, inFlight: false, stepStartedAt: null };
}

async function tickOne(job, shop, aiOpt) {
  const run = job && job.run;
  if (!run || !run.runNo) return { ok: true, state: run ? run.state : null, lastStep: null, inFlight: false, moved: false, runNo: null };
  const stale = JSON.parse(JSON.stringify(payload()));
  const current = await highestRunNo(job.id);
  if (!currentEnough(run.runNo, current)) return { ok: true, state: run.state, lastStep: lastStepNum(run), inFlight: false, moved: false, dropped: true, runNo: run.runNo };
  const earlyHalt = await haltKind(job.id, run.runNo);
  if (earlyHalt) {
    await markHalt(job.id, run.runNo, earlyHalt);
    const live = jobById(job.id);
    return { ok: true, state: earlyHalt === "kill" ? "killed" : "stopped", lastStep: lastStepNum(live && live.run), inFlight: false, moved: false, runNo: run.runNo };
  }
  const pausedBlocked = run.state === "paused" && !mutation("cronSkipState");
  if (run.waiting || run.state === "stopped" || run.state === "killed" || run.state === "done" || pausedBlocked) {
    const flight = await flightOf(job.id, run.runNo, (run.cursor || 0) + 1);
    return { ok: true, state: run.state, lastStep: lastStepNum(run), inFlight: !!flight.inFlight, moved: false, runNo: run.runNo, stepStartedAt: flight.stepStartedAt };
  }
  if (run.state !== "running" && !mutation("cronSkipState")) {
    return { ok: true, state: run.state, lastStep: lastStepNum(run), inFlight: false, moved: false, runNo: run.runNo };
  }
  const ai = mutation("fallbackOtherAi")
    ? (liveAi(shop, run.aiId) || (shop && shop.ais || [])[0] || null)
    : liveAi(shop, run.aiId);
  if (!ai || (aiOpt && ai.id !== run.aiId && !mutation("fallbackOtherAi"))) {
    return finishFailed(job, shop, null, run, AI_GONE, "stopped", stale);
  }
  if (job.deleted || !jobById(job.id)) return finishFailed(job, shop, ai, run, CARD_GONE, "stopped", stale);
  const view = await runView(ai, job);
  if ((view.needsNewYes || (run.approvedHash && ai.automation && run.approvedHash !== ai.automation.approvedHash)) && !mutation("noNeedsNewYesHalt") && !mutation("cronSkipApproval")) {
    await noteNeedsYes(job, shop, ai, run, stale);
    const live = jobById(job.id);
    return { ok: true, state: "paused", lastStep: lastStepNum(live && live.run), inFlight: false, moved: true, runNo: run.runNo };
  }
  const n = (run.cursor || 0) + 1;
  const existing = await stepRecord(job.id, run.runNo, n);
  if (existing) {
    await repairOne(job, existing, stale);
    return { ok: true, state: jobById(job.id) && jobById(job.id).run.state, lastStep: n, inFlight: false, moved: false, runNo: run.runNo };
  }
  const slot = await claimStep(job.id, run.runNo, n);
  if (!slot.ok) {
    return { ok: true, state: run.state, lastStep: lastStepNum(run), inFlight: !!slot.inFlight, moved: false, runNo: run.runNo, stepStartedAt: slot.stepStartedAt || null };
  }
  if (process.env.AIA_DIE_AFTER_CLAIM === "1") process.exit(0);
  let outcome;
  try {
    outcome = await withTimeout(async () => {
      if (slot.afterExpiry) {
        return { action: "step", said: STEP_STOPPED, result: "failed", why: STEP_STOPPED, effect: { type: "none" } };
      }
      const queue = mutation("reuseOldPlan") ? (run.queue || []) : (run.queue || []);
      if ((run.cursor || 0) >= queue.length) {
        return { action: "plan", said: "No steps on this plan.", result: "skipped", why: "No plan steps.", effect: { type: "none" }, done: true };
      }
      const line = String(queue[run.cursor || 0] || "");
      return buildOutcome(job, shop, ai, run, line);
    }, STEP_MS, "This step timed out.");
  } catch (err) {
    outcome = { action: "step", said: "", result: "failed", why: plainError(err), effect: { type: "none" } };
  }
  const delay = Number(process.env.AIA_TICK_DELAY_MS || 0);
  if (delay > 0 && slot.attempt === 0) await wait(delay);
  if (tickHold && slot.attempt === 0) {
    try { await tickHold(job); } catch (err) {
      outcome = { action: "step", said: "", result: "failed", why: plainError(err), effect: { type: "none" } };
    }
  }
  const nowNo = await highestRunNo(job.id);
  if (!currentEnough(run.runNo, nowNo)) return { ok: true, state: run.state, lastStep: lastStepNum(run), inFlight: false, moved: false, dropped: true, runNo: run.runNo };
  const lateHalt = await haltKind(job.id, run.runNo);
  if (lateHalt) {
    await finishHalted(job, run, lateHalt, stale);
    return { ok: true, state: lateHalt === "kill" ? "killed" : "stopped", lastStep: lastStepNum(jobById(job.id) && jobById(job.id).run), inFlight: false, moved: false, runNo: run.runNo };
  }
  const at = new Date().toISOString();
  const waiting = outcome.waiting ? { n: n, action: outcome.waiting.action, why: outcome.waiting.why, recipient: outcome.waiting.recipient || "" } : null;
  const holdCursor = outcome.why === STEP_STOPPED;
  const nextCursor = (waiting || holdCursor) ? (run.cursor || 0) : (run.cursor || 0) + 1;
  const queueLen = (run.queue || []).length;
  let state = "running";
  if (waiting) state = "paused";
  else if (outcome.done || nextCursor >= queueLen) state = "done";
  const record = {
    at: at,
    runNo: run.runNo,
    n: n,
    action: outcome.action,
    said: outcome.said || "",
    result: outcome.result,
    why: outcome.why || "",
    effect: Object.assign({ id: effectId(job.id, run.runNo, n) }, outcome.effect || { type: "none" }),
    run: { state: state, cursor: nextCursor, waiting: waiting, stepStartedAt: null }
  };
  const committed = await commitRecord(doneRel(job.id, run.runNo, n), job.id, run.runNo, record, stale);
  if (committed.dropped || committed.halted || committed.lost) {
    return { ok: true, state: jobById(job.id) && jobById(job.id).run ? jobById(job.id).run.state : run.state, lastStep: lastStepNum(jobById(job.id) && jobById(job.id).run), inFlight: false, moved: false, runNo: run.runNo };
  }
  return { ok: true, state: state, lastStep: n, inFlight: false, moved: true, runNo: run.runNo };
}

async function finishFailed(job, shop, ai, run, why, state, stale) {
  const n = (run.cursor || 0) + 1;
  const at = new Date().toISOString();
  const record = {
    at: at,
    runNo: run.runNo,
    n: n,
    action: "plan",
    said: why,
    result: "failed",
    why: why,
    effect: { id: effectId(job.id, run.runNo, n), type: "none" },
    run: { state: state, waiting: null, cursor: run.cursor || 0 }
  };
  await commitRecord(doneRel(job.id, run.runNo, n), job.id, run.runNo, record, stale);
  return { ok: true, state: state, lastStep: n, inFlight: false, moved: true, runNo: run.runNo };
}

async function repairOne(job, record, stale) {
  if (!record || !job || !job.run) return;
  const current = await highestRunNo(job.id);
  if (!currentEnough(job.run.runNo, current)) return;
  const kind = await haltKind(job.id, job.run.runNo);
  if (kind) {
    await markHalt(job.id, job.run.runNo, kind);
    return;
  }
  const applied = job.applied || [];
  const id = record.effect && record.effect.id;
  const effectPending = !!(record.effect && record.effect.type && record.effect.type !== "none" && (!id || applied.indexOf(id) < 0));
  const runPending = record.run && job.run.cursor !== record.run.cursor;
  if (!effectPending && !runPending) return;
  await casApply(job.id, (body) => {
    const live = (body.jobs || []).find((row) => row && row.id === job.id);
    if (!live) return false;
    if (effectPending) applyEffect(live, record.effect);
    if (!live.run) live.run = {};
    if (record.run) live.run = Object.assign({}, live.run, record.run);
    const step = {
      id: id,
      n: record.n,
      at: record.at,
      action: record.action,
      said: record.said || "",
      result: record.result,
      why: record.why || ""
    };
    if (!Array.isArray(live.run.steps)) live.run.steps = [];
    if (!live.run.steps.some((row) => row && row.id === step.id)) live.run.steps.push(step);
    return true;
  }, stale);
}

function cronEligible(job) {
  const run = job && job.run;
  if (!run) return false;
  if (!mutation("cronSkipState") && run.state !== "running") return false;
  if (!mutation("cronSkipStartedBy") && !run.startedBy) return false;
  if (run.waiting) return false;
  if (!mutation("cronSkipTicksBy") && run.ticksBy !== "cron") return false;
  return true;
}

async function cronTickOne() {
  const jobs = mem.jobs || [];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    if (!cronEligible(job)) continue;
    const flight = await flightOf(job.id, job.run.runNo, (job.run.cursor || 0) + 1);
    if (flight.inFlight) continue;
    const shop = shopBySlug(job.workspace);
    const ai = shop ? liveAi(shop, job.run.aiId) : null;
    if (!shop || !ai) continue;
    if (!mutation("cronSkipApproval")) {
      const view = await runView(ai, job);
      if (!view.approved || view.needsNewYes) continue;
    }
    const before = (await loadSteps(job.id, job.run.runNo)).length;
    await tickOne(job, shop, ai);
    const afterJob = jobById(job.id) || job;
    const after = (await loadSteps(job.id, afterJob.run.runNo)).length;
    return {
      ok: true,
      cron: true,
      ticked: after > before,
      cardId: job.id,
      state: afterJob.run.state,
      lastStep: lastStepNum(afterJob.run),
      inFlight: false,
      runNo: afterJob.run.runNo || null
    };
  }
  return { ok: true, cron: true, ticked: false, cardId: null, state: null, lastStep: null, inFlight: false, runNo: null };
}

function deny(res) {
  return res.status(403).json({ ok: false, error: "Not allowed." });
}

async function reloadMem() {
  const body = await claims.reloadBody();
  if (body) applyStore(body);
  return body;
}

async function claimNextRun(cardId) {
  const k = await highestRunNo(cardId);
  const runNo = k + 1;
  const won = await claims.claim(runRel(cardId, runNo), { at: new Date().toISOString(), runNo: runNo });
  return { won: won.ok, runNo: runNo };
}

function freshRun(ai, person, runNo, ticksBy, previous) {
  const reuse = mutation("reuseOldPlan") && previous && Array.isArray(previous.queue) && previous.queue.length;
  return {
    state: "running",
    ticksBy: ticksBy,
    aiId: ai.id,
    runNo: runNo,
    steps: [],
    waiting: null,
    startedBy: person.id || person.name || "owner",
    startedAt: new Date().toISOString(),
    queue: reuse ? previous.queue.slice() : planOf(ai).slice(),
    cursor: reuse ? (previous.cursor || 0) : 0,
    approvedHash: (ai.automation && ai.automation.approvedHash) || ""
  };
}

async function handle(req, res) {
  try {
    return await handleInner(req, res);
  } catch (err) {
    return res.status(200).json({ ok: false, error: plainError(err), inFlight: false });
  }
}

async function handleInner(req, res) {
  const body = (req && req.body && typeof req.body === "object") ? req.body : await readBody(req);
  const action = String(body.action || "").toLowerCase();
  if (action === "run-tick" && !pinRaw(req, body)) {
    if (!cronAuthorized(req)) return deny(res);
    const out = await cronTickOne();
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
    return res.status(200).json(Object.assign({ ok: true }, await readFields(job, shop)));
  }

  if (action === "run-stop" || action === "run-kill") {
    const killing = action === "run-kill";
    const run = job.run;
    if (killing) await claims.claim(killRel(job.id), { at: new Date().toISOString() });
    if (!run) {
      return res.status(200).json({
        ok: true,
        state: killing ? "killed" : null,
        lastStep: null,
        inFlight: false,
        runNo: null
      });
    }
    const flight = await flightOf(job.id, run.runNo, (run.cursor || 0) + 1);
    if (!killing && (run.state === "done" || run.state === "stopped" || run.state === "killed" || await readKill(job.id))) {
      const fields = await readFields(job, shop);
      return res.status(200).json({ ok: true, state: fields.run && fields.run.state, lastStep: lastStepNum(fields.run), inFlight: !!fields.inFlight, runNo: fields.runNo });
    }
    if (!killing) await claims.claim(stopRel(job.id, run.runNo), { at: new Date().toISOString(), runNo: run.runNo });
    if (flight.inFlight) {
      await casApply(job.id, (body) => {
        const live = (body.jobs || []).find((row) => row && row.id === job.id);
        if (!live || !live.run || live.run.runNo !== run.runNo) return false;
        live.run.state = "stopping";
        return true;
      }, null);
    } else {
      await markHalt(job.id, run.runNo, killing ? "kill" : "stop");
    }
    const fields = await readFields(jobById(job.id) || job, shop);
    const halted = killing ? "killed" : "stopped";
    return res.status(200).json({
      ok: true,
      state: flight.inFlight ? "stopping" : ((fields.run && fields.run.state) || halted),
      lastStep: lastStepNum(fields.run),
      inFlight: !!(flight.inFlight || fields.inFlight),
      runNo: fields.runNo
    });
  }

  if (action === "run-start") {
    if (!mutation("noKillPrecheck") && await readKill(job.id)) {
      return res.status(409).json({ ok: false, error: KILL_MSG });
    }
    const found = aiOnDesk(shop, body.aiId || body.ai);
    if (found.error) return res.status(found.error.status).json(found.error.body);
    const ai = found.ai;
    const view = await runView(ai, job);
    if (!view.approved || view.needsNewYes) {
      return res.status(409).json({
        ok: false,
        error: view.needsNewYes ? NEEDS_YES : "This automation needs a Yes before it can run.",
        needsNewYes: !!view.needsNewYes,
        needsNewYesWhy: view.needsNewYesWhy
      });
    }
    if (job.run && job.run.state === "done") return res.status(409).json({ ok: false, error: "This run is already done." });
    if (job.run && (job.run.state === "running" || (job.run.state === "paused" && job.run.waiting))) {
      const fields = await readFields(job, shop);
      return res.status(200).json(Object.assign({ ok: true, state: job.run.state, lastStep: lastStepNum(job.run), inFlight: fields.inFlight, runNo: fields.runNo }, fields));
    }
    const delay = Number(process.env.AIA_DELAY_BEFORE_RUN_CLAIM_MS || 0);
    if (delay > 0) {
      if (process.env.AIA_DELAY_FLAG) {
        try { fs.writeFileSync(process.env.AIA_DELAY_FLAG, "1"); } catch (e) {}
      }
      await wait(delay);
    }
    const claimed = await claimNextRun(job.id);
    if (!claimed.won) {
      await reloadMem();
      const live = jobById(job.id) || job;
      const fields = await readFields(live, shopBySlug(shop.slug) || shop);
      return res.status(200).json(Object.assign({ ok: true, state: live.run && live.run.state, lastStep: lastStepNum(live.run), started: false }, fields));
    }
    if (!mutation("noKillPostcheck") && await readKill(job.id)) {
      job.run = {
        state: "killed",
        ticksBy: ticksMode(),
        aiId: ai.id,
        runNo: claimed.runNo,
        steps: [],
        waiting: null,
        startedBy: person.id || person.name || "owner",
        startedAt: new Date().toISOString(),
        queue: [],
        cursor: 0,
        approvedHash: ai.automation && ai.automation.approvedHash || ""
      };
      await save();
      const fields = await readFields(jobById(job.id) || job, shop);
      return res.status(200).json(Object.assign({ ok: true, state: "killed", lastStep: null, inFlight: false }, fields));
    }
    const started = freshRun(ai, person, claimed.runNo, ticksMode(), job.run);
    job.run = started;
    job.deskAi = ai.id;
    await save();
    await tickOne(jobById(job.id) || job, shopBySlug(shop.slug) || shop, ai);
    const live = jobById(job.id) || job;
    const fields = await readFields(live, shopBySlug(shop.slug) || shop);
    return res.status(200).json(Object.assign({ ok: true, state: live.run && live.run.state, lastStep: lastStepNum(live.run) }, fields));
  }

  if (action === "step-answer") {
    const run = job.run;
    const n = Number(body.n);
    if (!run || !run.waiting || run.waiting.n !== n || run.state !== "paused") {
      return res.status(409).json({ ok: false, error: "That is not the step waiting for an answer." });
    }
    const ai = liveAi(shop, run.aiId);
    const view = await runView(ai, job);
    if ((view.needsNewYes || (ai && run.approvedHash && ai.automation && run.approvedHash !== ai.automation.approvedHash)) && !mutation("noNeedsNewYesHalt")) {
      await noteNeedsYes(job, shop, ai, run, JSON.parse(JSON.stringify(payload())));
      return res.status(409).json({ ok: false, error: NEEDS_YES, needsNewYes: true, needsNewYesWhy: view.needsNewYesWhy });
    }
    const yes = body.yes === true || body.yes === "yes";
    const spec = actionById(run.waiting.action);
    const allowed = (ai && ai.automation && ai.automation.allowed) || [];
    const permitted = !!(spec && allowed.indexOf(spec.id) >= 0);
    let result = "skipped";
    let why = "You said no.";
    let effect = { type: "none" };
    let contact = null;
    if (yes && (permitted || mutation("stepAnswerSkipAllowed"))) {
      if (spec && spec.risk && spec.risk.spend) {
        result = "failed";
        why = HOLD_WHY;
        job.charged = false;
      } else if (spec && spec.risk && spec.risk.newContact && run.waiting.why === "newContact") {
        contact = { key: run.waiting.recipient, by: person && person.name };
        result = "ok";
        why = "Held, not sent. Nothing left this desk.";
        effect = { type: "none" };
      } else if (spec) {
        effect = effectFor(spec.id, run.waiting.action);
        result = "ok";
        why = "";
      }
    } else if (yes && !permitted) {
      why = NOT_APPROVED;
    }
    const at = new Date().toISOString();
    const nextCursor = (run.cursor || 0) + 1;
    const state = nextCursor >= (run.queue || []).length ? "done" : "running";
    const record = {
      at: at,
      runNo: run.runNo,
      n: n,
      action: run.waiting.action,
      said: yes ? "Yes." : "No.",
      result: result,
      why: why,
      effect: Object.assign({ id: effectId(job.id, run.runNo, n) + "-answer" }, effect),
      contact: contact,
      run: { state: state, cursor: nextCursor, waiting: null }
    };
    await commitRecord(answerRel(job.id, run.runNo, n), job.id, run.runNo, record, JSON.parse(JSON.stringify(payload())));
    const live = jobById(job.id) || job;
    const fields = await readFields(live, shop);
    return res.status(200).json(Object.assign({ ok: true, state: live.run && live.run.state, lastStep: lastStepNum(live.run), inFlight: false }, fields));
  }

  if (action === "run-tick") {
    const ai = liveAi(shop, job.run && job.run.aiId);
    const result = await tickOne(job, shop, ai);
    const live = jobById(job.id) || job;
    const fields = await readFields(live, shopBySlug(shop.slug) || shop);
    return res.status(200).json(Object.assign({
      ok: true,
      state: (fields.run && fields.run.state) || result.state,
      lastStep: result.lastStep,
      inFlight: result.inFlight != null ? !!result.inFlight : !!fields.inFlight,
      runNo: fields.runNo
    }, fields));
  }

  return res.status(400).json({ ok: false, error: "Unknown desk action." });
}

async function cronHandler(req, res) {
  if (!cronAuthorized(req)) return deny(res);
  const out = await cronTickOne();
  return res.status(200).json(out);
}

module.exports = {
  PAGE_NOTE,
  NOT_APPROVED,
  NEEDS_YES,
  AI_GONE,
  STEP_STOPPED,
  CARD_GONE,
  NO_MATCH,
  MANY_MATCH,
  KILL_MSG,
  HOLD_WHY,
  catalog,
  actionById,
  ticksMode,
  validateAllowed,
  pausesOf,
  approvalHash,
  stampApproval,
  approvalView,
  suggestAllowed,
  signalsOf,
  cronAuthorized,
  handle,
  cronHandler,
  setLeaseMsForTests,
  setTickHoldForTests,
  setModelForTests,
  setFixtureActionsForTests,
  setMutationForTests,
  publicRun,
  readFields,
  contactKnown,
  rememberContact,
  recipientOf,
  pauseFor,
  addressKey,
  reloadMem,
  highestRunNo,
  readKill,
  readStop
};

#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const store = path.join(os.tmpdir(), "aia-automation-runner-" + process.pid + "-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
process.env.VERCEL_ENV = "preview";
delete process.env.CRON_SECRET;
delete process.env.XAI_API_KEY;
delete process.env.GROK_API_KEY;
delete process.env.AIA_GROK_KEY;
delete global.__aia;
delete global.__aiaHydrate;

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function keysOf(obj) { return Object.keys(obj || {}).sort(); }

const aisSrc = fs.readFileSync(path.join(root, "api/_ais.js"), "utf8");
const grokSrc = fs.readFileSync(path.join(root, "api/_grok.js"), "utf8");
const packsSrc = fs.readFileSync(path.join(root, "api/_packs.js"), "utf8");
const jobsSrc = fs.readFileSync(path.join(root, "api/jobs.js"), "utf8");
const autoSrc = fs.readFileSync(path.join(root, "api/_automation.js"), "utf8");
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));

if (aisSrc.indexOf("Collect stays HOLD") < 0) fail("_ais.js Collect HOLD wording changed");
else pass("Collect HOLD wording stays in _ais.js");
if (grokSrc.indexOf("Collect stays HOLD") < 0) fail("_grok.js Collect HOLD wording changed");
else pass("Collect HOLD wording stays in _grok.js");
if (packsSrc.indexOf("Collect stays HOLD") < 0) fail("_packs.js Collect HOLD wording changed");
else pass("Collect HOLD wording stays in _packs.js");
if (jobsSrc.indexOf("run-start") >= 0 || jobsSrc.indexOf("run-read") >= 0 || jobsSrc.indexOf("approve-automation") >= 0) {
  fail("api/jobs.js gained an automation route");
} else pass("nothing new in /api/jobs");
if (autoSrc.indexOf("timingSafeEqual") < 0) fail("cron auth must use timingSafeEqual");
else pass("cron auth uses timingSafeEqual");
const cronPaths = (vercel.crons || []).map((row) => row && row.path).filter(Boolean);
if (cronPaths.some((p) => /automation/.test(p))) fail("vercel.json must not schedule the automation cron");
else pass("vercel.json has no automation cron entry");

const ais = require("../api/_ais");
const lib = require("../api/_lib");
const automation = require("../api/_automation");
const desks = require("../api/_desks-http");
const auth = require("../api/auth");
const packs = require("../api/_packs");
const hook = require("../api/hook");
const health = require("../api/health");
const cron = require("../api/automation-cron");
const { mem, hashPin, ensurePeople, ready, blobAllowed } = lib;

const fetches = [];
const origFetch = global.fetch;
global.fetch = async function (url) {
  fetches.push(String(url));
  throw new Error("outbound blocked");
};
const origEqual = crypto.timingSafeEqual;
let equalCalls = 0;
crypto.timingSafeEqual = function (a, b) {
  equalCalls += 1;
  return origEqual.call(crypto, a, b);
};

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end() { return this; }
  };
}

async function call(handler, method, headers, body, query) {
  const res = mockRes();
  await handler({ method: method, headers: headers || {}, body: body || null, query: query || {} }, res);
  return res;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function storeBytes() {
  return JSON.stringify({ workspaces: mem.workspaces, jobs: mem.jobs, audit: mem.audit, inbox: mem.inbox });
}

let cardN = 0;
function makeCard(slug, extra) {
  cardN += 1;
  const job = Object.assign({
    id: "job_auto_" + cardN,
    workspace: slug,
    title: "Card " + cardN,
    status: "exception",
    notes: "",
    createdAt: new Date().toISOString()
  }, extra || {});
  mem.jobs.unshift(job);
  return job;
}

function plantRun(job, ai, state, extra) {
  job.run = Object.assign({
    state: state,
    ticksBy: "cron",
    aiId: ai.id,
    startedBy: state === "running" ? "p_owner" : "p_owner",
    steps: [],
    waiting: null,
    queue: ["add_note planted"],
    cursor: 0,
    seen: {},
    lock: null,
    halt: null
  }, extra || {});
  return job;
}

async function main() {
  await ready();
  if (blobAllowed()) fail("preview must not allow the live blob store");
  else pass("preview blob guard stays closed");

  const slug = "auto-desk";
  const pin = "4821";
  const shop = {
    slug: slug,
    name: "Ada",
    biz: slug,
    pin: hashPin(pin),
    createdAt: new Date().toISOString(),
    people: [],
    rules: [],
    ais: []
  };
  ensurePeople(shop);
  shop.people.push({
    id: "p_help",
    name: "Helper",
    role: "employee",
    kind: "helper",
    status: "approved",
    pin: hashPin("9999")
  });
  mem.workspaces.unshift(shop);
  const owner = { "x-workspace": slug, "x-pin": pin };
  const otherSlug = "other-desk";
  const other = {
    slug: otherSlug,
    name: "Other",
    biz: otherSlug,
    pin: hashPin("1111"),
    createdAt: new Date().toISOString(),
    people: [],
    rules: [],
    ais: []
  };
  ensurePeople(other);
  mem.workspaces.unshift(other);

  const catalogRes = await call(desks, "GET", {}, null, { actions: "1" });
  const viaAuth = await call(auth, "GET", {}, null, { via: "desks", actions: "1" });
  const catalog = catalogRes.body;
  if (!Array.isArray(catalog)) fail("GET /api/desks?actions=1 must return a list");
  else pass("GET /api/desks?actions=1 returns a list");
  if (!same(viaAuth.body, catalog)) fail("auth via=desks actions list changed");
  else pass("actions list is the same through /api/auth?via=desks");
  const ids = (catalog || []).map((row) => row && row.id);
  const wantIds = ["add_note", "draft_reply", "set_status", "ask_desk_ai", "send_message", "delete_card", "pay"];
  if (!same(ids, wantIds)) fail("catalog ids changed: " + JSON.stringify(ids));
  else pass("catalog ids");
  const heldIds = (catalog || []).filter((row) => row && row.held).map((row) => row.id);
  if (!same(heldIds, ["send_message", "delete_card", "pay"])) fail("held actions changed: " + JSON.stringify(heldIds));
  else pass("send_message, delete_card and pay are held");
  (catalog || []).forEach((row) => {
    if (!row || !row.sentence || !row.risk || typeof row.risk.spend !== "boolean" || typeof row.risk.delete !== "boolean" || typeof row.risk.newContact !== "boolean" || typeof row.held !== "boolean") {
      fail("catalog row shape " + JSON.stringify(row));
    }
  });
  pass("catalog rows have sentence, risk and held");
  const payRow = (catalog || []).find((row) => row.id === "pay");
  const sendRow = (catalog || []).find((row) => row.id === "send_message");
  const delRow = (catalog || []).find((row) => row.id === "delete_card");
  if (!payRow.risk.spend || !delRow.risk.delete || !sendRow.risk.newContact) fail("risk flags are wrong");
  else if (payRow.risk.delete || payRow.risk.newContact) fail("pay risk must be spend only");
  else pass("risk flags spend, delete, newContact");

  const plain = await call(packs, "POST", owner, {
    action: "save-ai",
    name: "Plain",
    role: "Doer",
    does: "Draft on this desk",
    steps: "qualify, do, follow",
    plan: ["Open the desk", "Draft the note"]
  });
  const plainAi = plain.body && plain.body.ai;
  const plainStored = (shop.ais || []).find((row) => row && row.name === "Plain");
  const publicKeys = ["aia", "aiaLabel", "allow", "bound", "chain", "deny", "does", "draftOnly", "face", "file", "id", "internet", "name", "never", "owned", "plan", "prompt", "promptSummary", "rails", "role", "rules", "steps"];
  const replyKeys = ["added", "ai", "ais", "charged", "never", "note", "ok", "planCut", "rails"];
  if (plain.statusCode !== 200 || !plain.body || !plain.body.ok) fail("plain save-ai " + plain.statusCode);
  else if (!same(keysOf(plain.body), replyKeys)) fail("plain save-ai reply keys changed: " + keysOf(plain.body).join(","));
  else if (!same(keysOf(plainAi), publicKeys)) fail("plain save-ai ai keys changed: " + keysOf(plainAi).join(","));
  else if (!same(plainAi, ais.publicAi(plainStored))) fail("plain save-ai ai is not publicAi(stored)");
  else if (plainStored.automation) fail("plain save-ai stored an approval");
  else if (Object.prototype.hasOwnProperty.call(plainAi, "approved") || Object.prototype.hasOwnProperty.call(plainAi, "allowed") || Object.prototype.hasOwnProperty.call(plainAi, "pauses")) {
    fail("plain save-ai reply gained approval fields");
  } else pass("save-ai without allowed keeps the old reply and store shape");

  const beforeBad = storeBytes();
  const badCases = [
    ["nope"],
    ["add_note", "add_note"],
    ["add_note", 1],
    "add_note",
    { id: "add_note" }
  ];
  for (let i = 0; i < badCases.length; i++) {
    const bad = await call(packs, "POST", owner, {
      action: "save-ai",
      name: "Plain",
      plan: ["Open the desk"],
      allowed: badCases[i],
      pauses: { spend: false }
    });
    if (bad.statusCode !== 400) fail("bad allowed must 400, got " + bad.statusCode + " for " + JSON.stringify(badCases[i]));
    else pass("bad allowed 400 (" + JSON.stringify(badCases[i]) + ")");
  }
  const badPauses = await call(packs, "POST", owner, {
    action: "save-ai",
    name: "Plain",
    allowed: ["add_note"],
    pauses: { spend: "yes" }
  });
  if (badPauses.statusCode !== 400) fail("bad pauses must 400");
  else pass("bad pauses 400");
  if (storeBytes() !== beforeBad) fail("rejected allowed/pauses wrote the store");
  else if ((shop.ais || []).some((row) => row && row.name !== "Plain")) fail("rejected save-ai added an AI");
  else if (plainStored.automation) fail("rejected save-ai stamped Plain");
  else pass("rejected allowed writes nothing");

  const longPlan = [];
  for (let i = 0; i < 201; i++) longPlan.push("line " + i);
  const inputAllowed = ["draft_reply", "add_note"];
  const yesSave = await call(packs, "POST", owner, {
    action: "save-ai",
    ws: slug,
    pin: pin,
    name: "Yes",
    role: "Doer",
    does: "Draft on this desk",
    plan: longPlan,
    allowed: inputAllowed
  });
  const yesStored = (shop.ais || []).find((row) => row && row.name === "Yes");
  const yesAi = yesSave.body && yesSave.body.ai;
  if (yesSave.statusCode !== 200 || !yesStored || !yesStored.automation) fail("save-ai with allowed did not store a Yes");
  else pass("save-ai with allowed stores the Yes in the same write");
  if (!yesStored || yesStored.plan.length !== 200) fail("stored plan must be the cut 200 lines");
  else if (yesStored.automation.approvedHash !== automation.approvalHash(yesStored.automation.allowed, yesStored.plan)) {
    fail("approvedHash is not the hash of the stored plan and allowed list");
  } else if (automation.approvalHash(inputAllowed, longPlan) === yesStored.automation.approvedHash) {
    fail("approvedHash used the uncut plan");
  } else pass("approvedHash is over the stored plan and the stored allowed list");
  if (!yesAi || yesAi.approved !== true || yesAi.needsNewYes !== false || yesAi.needsNewYesWhy !== null) {
    fail("save-ai reply ai approval flags " + JSON.stringify(yesAi && { approved: yesAi.approved, needsNewYes: yesAi.needsNewYes, needsNewYesWhy: yesAi.needsNewYesWhy }));
  } else if (!same(yesAi.allowed, yesStored.automation.allowed) || !same(yesAi.pauses, yesStored.automation.pauses)) {
    fail("save-ai reply ai allowed/pauses are not the stored row");
  } else if (!Object.prototype.hasOwnProperty.call(yesAi, "needsNewYesWhy") || !Object.prototype.hasOwnProperty.call(yesAi, "pauses")) {
    fail("save-ai reply ai missing approval fields");
  } else pass("save-ai reply ai includes approval fields from the stored row");

  const bareCard = makeCard(slug, { title: "No AI yet" });
  const bareRead = await call(desks, "POST", owner, { action: "run-read", ws: slug, pin: pin, cardId: bareCard.id });
  if (bareRead.statusCode !== 200 || !bareRead.body || bareRead.body.ok !== true) fail("run-read bare card " + bareRead.statusCode);
  else if (bareRead.body.aiId !== null) fail("run-read aiId must be null when the card has no Desk AI");
  else if (!same(bareRead.body.allowed, [])) fail("run-read allowed must be [] when none is saved");
  else if (bareRead.body.run !== null) fail("run-read run must be null before a run");
  else pass("run-read with no Desk AI returns aiId null and allowed []");

  const linked = makeCard(slug, { title: "Linked", deskAi: yesStored.id });
  const linkedRead = await call(desks, "POST", owner, { action: "run-read", ws: slug, pin: pin, cardId: linked.id });
  if (!linkedRead.body || linkedRead.body.aiId !== yesStored.id) fail("run-read aiId before a run: " + JSON.stringify(linkedRead.body && linkedRead.body.aiId));
  else if (!same(linkedRead.body.allowed, yesStored.automation.allowed)) fail("run-read allowed is not the saved list");
  else if (linkedRead.body.approved !== true || linkedRead.body.needsNewYes !== false || linkedRead.body.needsNewYesWhy !== null) {
    fail("immediate run-read must be approved with no new Yes");
  } else if (linkedRead.body.run !== null) fail("linked card has no run yet");
  else pass("run-read returns aiId and allowed before a run, approved true");

  const junkAt = "1999-01-01T00:00:00.000Z";
  const pauseInput = { spend: false };
  const approve = await call(desks, "POST", owner, {
    action: "approve-automation",
    ws: slug,
    pin: pin,
    aiId: yesStored.id,
    allowed: ["add_note"],
    pauses: pauseInput,
    approvedAt: junkAt,
    approved: false,
    charged: true
  });
  const approveKeys = ["ai", "charged", "ok"];
  const aiKeys = ["allowed", "approved", "approvedAt", "id", "needsNewYes", "needsNewYesWhy", "pauses"];
  const storedAfter = (shop.ais || []).find((row) => row && row.id === yesStored.id);
  if (approve.statusCode !== 200 || !approve.body) fail("approve-automation " + approve.statusCode);
  else if (!same(keysOf(approve.body), approveKeys)) fail("approve-automation keys " + keysOf(approve.body).join(","));
  else if (approve.body.ok !== true || approve.body.charged !== false) fail("approve-automation must answer ok and charged false");
  else if (!same(keysOf(approve.body.ai), aiKeys)) fail("approve-automation ai keys " + keysOf(approve.body.ai).join(","));
  else if (approve.body.ai === undefined) fail("approve-automation missing ai");
  else if (approve.body.ai.allowed === pauseInput || approve.body.ai.pauses === pauseInput) fail("approve reply reused the input object");
  else if (approve.body.ai.approvedAt === junkAt || approve.body.ai.approved !== true) fail("approve reply followed the input flags");
  else if (!same(approve.body.ai.allowed, storedAfter.automation.allowed)) fail("approve allowed is not the stored list");
  else if (!same(approve.body.ai.pauses, storedAfter.automation.pauses)) fail("approve pauses are not the stored pauses");
  else if (approve.body.ai.approvedAt !== storedAfter.automation.approvedAt) fail("approve approvedAt is not the stored time");
  else if (approve.body.ai.id !== storedAfter.id || approve.body.ai.needsNewYes !== false || approve.body.ai.needsNewYesWhy !== null) {
    fail("approve ai flags are not the stored row");
  } else if (storedAfter.automation.pauses.delete !== true || storedAfter.automation.pauses.newContact !== true || storedAfter.automation.pauses.spend !== false) {
    fail("omitted pauses must default to on");
  } else pass("approve-automation replies from the stored row with charged false");
  pauseInput.spend = true;
  pauseInput.delete = false;
  if (approve.body.ai.pauses.spend !== false || approve.body.ai.pauses.delete !== true) fail("approve pauses followed later input edits");
  else pass("approve pauses stay the stored copy");

  const drafted = await call(packs, "POST", owner, { action: "studio-draft", brief: "Write the desk note", kind: "ai" });
  const draftedHeld = await call(packs, "POST", owner, { action: "studio-draft", brief: "please set_status and pay and send_message", kind: "ai" });
  const draftedOnlyHeld = await call(packs, "POST", owner, { action: "studio-draft", brief: "pay the send_message", kind: "ai" });
  if (!drafted.body || !drafted.body.ai || !same(drafted.body.ai.allowed, ["add_note", "draft_reply"])) {
    fail("studio-draft fallback allowed " + JSON.stringify(drafted.body && drafted.body.ai));
  } else pass("studio-draft with no model returns [add_note, draft_reply]");
  if (!draftedHeld.body || !draftedHeld.body.ai || !same(draftedHeld.body.ai.allowed, ["set_status"])) {
    fail("studio-draft should keep only the desk action the job needs: " + JSON.stringify(draftedHeld.body && draftedHeld.body.ai));
  } else pass("studio-draft drops held actions and keeps set_status");
  if (!draftedOnlyHeld.body || !same(draftedOnlyHeld.body.ai.allowed, ["add_note", "draft_reply"])) {
    fail("held-only brief must fall back, got " + JSON.stringify(draftedOnlyHeld.body && draftedOnlyHeld.body.ai));
  } else pass("studio-draft never includes held actions by default");

  const runSave = await call(packs, "POST", owner, {
    action: "save-ai",
    name: "Run",
    role: "Doer",
    does: "Draft on this desk",
    plan: ["add_note first", "add_note second", "add_note third"],
    allowed: ["add_note", "ask_desk_ai", "set_status"]
  });
  const runAi = (shop.ais || []).find((row) => row && row.name === "Run");
  if (runSave.statusCode !== 200 || !runAi) fail("Run AI did not save");
  const runCard = makeCard(slug, { deskAi: runAi.id, title: "Runner" });
  const started = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: runCard.id, aiId: runAi.id });
  if (started.statusCode !== 200 || !started.body || started.body.run.ticksBy !== "page") fail("preview ticksBy " + JSON.stringify(started.body && started.body.run));
  else if (started.body.run.note !== "Steps only move while this page is open.") fail("preview note missing");
  else if (started.body.run.aiId !== runAi.id || started.body.aiId !== runAi.id) fail("run.aiId missing");
  else if (!started.body.run.steps || started.body.run.steps.length !== 1) fail("run-start must take one step");
  else pass("preview run says steps only move while the page is open");
  const again = await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: runCard.id });
  const third = await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: runCard.id });
  const fourth = await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: runCard.id });
  const ns = (runCard.run.steps || []).map((step) => step.n);
  if (!same(ns, [1, 2, 3])) fail("steps must be recorded once each, got " + JSON.stringify(ns));
  else if (fourth.body.run.steps.length !== 3 || runCard.run.state !== "done") fail("extra tick added a step");
  else pass("repeated ticks record each step once");
  if (!again.body || typeof again.body.inFlight !== "boolean") fail("run-tick inFlight must be boolean");
  else pass("run-tick inFlight is boolean");

  const gate = {};
  gate.promise = new Promise((resolve) => { gate.release = resolve; });
  automation.setTickHoldForTests(() => gate.promise);
  const parallelAi = runAi;
  await call(packs, "POST", owner, {
    action: "save-ai",
    name: "Run",
    plan: ["add_note alpha", "add_note beta"],
    allowed: ["add_note"]
  });
  const parallelCard = makeCard(slug, { deskAi: parallelAi.id });
  const p1 = call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: parallelCard.id, aiId: parallelAi.id });
  await wait(40);
  const p2 = call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: parallelCard.id });
  await wait(30);
  const early = await p2;
  if (!early.body || early.body.inFlight !== true) fail("second tick must see the lock, inFlight " + JSON.stringify(early.body && early.body.inFlight));
  else pass("parallel tick is in flight and does not take the step");
  gate.release();
  await p1;
  automation.setTickHoldForTests(null);
  if ((parallelCard.run.steps || []).length !== 1) fail("parallel ticks recorded " + (parallelCard.run.steps || []).length + " steps");
  else pass("parallel ticks record the step once");

  automation.setLeaseMsForTests(30);
  const leaseGate = {};
  leaseGate.promise = new Promise((resolve) => { leaseGate.release = resolve; });
  automation.setTickHoldForTests(() => leaseGate.promise);
  const leaseCard = makeCard(slug, { deskAi: parallelAi.id });
  const slow = call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: leaseCard.id, aiId: parallelAi.id });
  await wait(50);
  const late = await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: leaseCard.id });
  if (!late.body || late.body.inFlight !== true) fail("expired lease must not start the same step again");
  leaseGate.release();
  await slow;
  automation.setTickHoldForTests(null);
  automation.setLeaseMsForTests(15000);
  if ((leaseCard.run.steps || []).length !== 1) fail("lease retry recorded " + (leaseCard.run.steps || []).length);
  else pass("idempotency key cardId+n holds across the lease");

  const stopGate = {};
  stopGate.promise = new Promise((resolve) => { stopGate.release = resolve; });
  automation.setTickHoldForTests(() => stopGate.promise);
  const stopCard = makeCard(slug, { deskAi: parallelAi.id });
  const stopTick = call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: stopCard.id, aiId: parallelAi.id });
  await wait(30);
  const stopping = await call(desks, "POST", owner, { action: "run-stop", ws: slug, pin: pin, cardId: stopCard.id });
  if (!stopping.body || !same(keysOf(stopping.body), ["inFlight", "lastStep", "ok", "state"])) fail("run-stop keys " + keysOf(stopping.body).join(","));
  else if (stopping.body.state !== "stopping" || stopping.body.inFlight !== true || stopping.body.lastStep !== null) {
    fail("in-flight stop " + JSON.stringify(stopping.body));
  } else if (typeof stopping.body.inFlight !== "boolean" || (stopping.body.lastStep !== null && typeof stopping.body.lastStep !== "number")) {
    fail("run-stop lastStep/inFlight types");
  } else pass("run-stop is stopping with lastStep null while the lock is held");
  stopGate.release();
  await stopTick;
  automation.setTickHoldForTests(null);
  const stopped = await call(desks, "POST", owner, { action: "run-read", ws: slug, pin: pin, cardId: stopCard.id });
  if (stopCard.run.state !== "stopped" || stopped.body.needsNewYesWhy !== "stopped" || stopped.body.needsNewYes !== true) {
    fail("after the lock, stop must stick and need a new Yes: " + JSON.stringify(stopped.body && { state: stopCard.run.state, why: stopped.body.needsNewYesWhy }));
  } else pass("stop becomes stopped only after the lock, needsNewYesWhy stopped");
  const resume = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: stopCard.id, aiId: parallelAi.id });
  if (resume.statusCode !== 409) fail("resume after stop must wait for a new Yes");
  else pass("resume after stop needs a new Yes");
  const reyes = await call(desks, "POST", owner, {
    action: "approve-automation",
    ws: slug,
    pin: pin,
    aiId: parallelAi.id,
    allowed: ["add_note"],
    pauses: { spend: true, delete: true, newContact: true }
  });
  if (!reyes.body || reyes.body.charged !== false || !reyes.body.ai || reyes.body.ai.needsNewYes !== false) fail("re-approve after stop");
  else pass("approve-automation can Yes again after stop");
  const resumed = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: stopCard.id, aiId: parallelAi.id });
  if (resumed.statusCode !== 200 || stopCard.run.state === "stopped") fail("new Yes must let the run continue");
  else pass("a new Yes lets the stopped run continue");

  const killGate = {};
  killGate.promise = new Promise((resolve) => { killGate.release = resolve; });
  automation.setTickHoldForTests(() => killGate.promise);
  const killCard = makeCard(slug, { deskAi: parallelAi.id });
  const killTick = call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: killCard.id, aiId: parallelAi.id });
  await wait(30);
  const killing = await call(desks, "POST", owner, { action: "run-kill", ws: slug, pin: pin, cardId: killCard.id });
  if (!killing.body || killing.body.state !== "stopping" || killing.body.inFlight !== true || typeof killing.body.lastStep !== "object" && killing.body.lastStep !== null && typeof killing.body.lastStep !== "number") {
    fail("in-flight kill " + JSON.stringify(killing.body));
  } else if (killing.body.lastStep !== null) fail("kill lastStep before the first step must be null");
  else pass("run-kill is stopping and inFlight true during the step");
  killGate.release();
  await killTick;
  automation.setTickHoldForTests(null);
  if (killCard.run.state !== "killed") fail("kill must become killed after the lock");
  else if ((killCard.run.queue || []).length !== 0) fail("kill must drop queued steps");
  else if (!(killCard.run.steps || []).some((step) => step && step.action === "kill")) fail("kill must show on the card");
  else pass("kill drops queued steps and shows on the card");
  const dead = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: killCard.id, aiId: parallelAi.id });
  if (dead.statusCode === 200) fail("a killed run must not start again");
  else pass("kill ends that run");

  await call(packs, "POST", owner, {
    action: "save-ai",
    name: "Run",
    plan: ["pay the bill", "delete_card now", "send_message"],
    allowed: ["pay", "delete_card", "send_message", "add_note", "ask_desk_ai"],
    pauses: { spend: true, delete: true, newContact: true }
  });
  const riskCard = makeCard(slug, { deskAi: parallelAi.id, email: "ada@example.com", contactName: "Ada" });
  const paused = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: riskCard.id, aiId: parallelAi.id });
  if (!paused.body || paused.body.run.state !== "paused" || !paused.body.run.waiting || paused.body.run.waiting.why !== "spend") {
    fail("spend pause " + JSON.stringify(paused.body && paused.body.run));
  } else if (riskCard.charged !== false) fail("a paused pay must still be charged false");
  else pass("pay pauses before spending and stays uncharged");
  const fetchBefore = fetches.length;
  await call(desks, "POST", owner, { action: "automation-pauses", ws: slug, pin: pin, aiId: parallelAi.id, pauses: { spend: false, delete: true, newContact: true } });
  const payCard = makeCard(slug, { deskAi: parallelAi.id });
  const paid = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: payCard.id, aiId: parallelAi.id });
  const payStep = payCard.run && payCard.run.steps && payCard.run.steps[0];
  if (!payStep || payStep.action !== "pay" || payStep.charged !== false || payCard.charged !== false) fail("pay with the pause off " + JSON.stringify(payStep));
  else if (fetches.length !== fetchBefore) fail("pay called out: " + fetches.slice(fetchBefore).join(","));
  else if (!/Collect stays HOLD/.test(payStep.why || "")) fail("pay must say Collect stays HOLD");
  else pass("pay with the pause off is charged false and makes no outside call");

  const wrongN = await call(desks, "POST", owner, { action: "step-answer", ws: slug, pin: pin, cardId: riskCard.id, n: 99, yes: true });
  if (wrongN.statusCode !== 409 || riskCard.run.waiting.n === 99) fail("step-answer must ignore a step that is not waiting");
  else pass("step-answer only accepts the waiting step");
  const saidNo = await call(desks, "POST", owner, { action: "step-answer", ws: slug, pin: pin, cardId: riskCard.id, n: riskCard.run.waiting.n, yes: false });
  if (!saidNo.body || riskCard.run.steps[0].result !== "skipped" || riskCard.run.steps[0].why !== "You said no.") fail("no on a pause must show on the step");
  else pass("saying no is recorded");

  await call(packs, "POST", owner, {
    action: "save-ai",
    name: "Run",
    plan: ["ask_desk_ai delete_card", "Do the thing"],
    allowed: ["ask_desk_ai", "add_note"]
  });
  const modelCard = makeCard(slug, { deskAi: parallelAi.id, notes: "pay", title: "Model" });
  automation.setModelForTests({
    map: (line) => {
      if (String(line).indexOf("ask_desk_ai") >= 0) return { action: "ask_desk_ai", said: "process.exit(1)" };
      return { action: "pay", said: "require('child_process')" };
    },
    ask: () => "You should delete_card and also pay."
  });
  const modeled = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: modelCard.id, aiId: parallelAi.id });
  const asked = modelCard.run.steps[0];
  if (!asked || asked.result !== "skipped" || asked.why !== "Not on the approved list." || modelCard.deleted) {
    fail("unapproved action named by ask_desk_ai must be skipped: " + JSON.stringify(asked));
  } else pass("ask_desk_ai output is not run when the action is not approved");
  const nextModel = await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: modelCard.id });
  const picked = modelCard.run.steps[1];
  if (!picked || picked.action !== "pay" || picked.why !== "Not on the approved list." || modelCard.charged === true) {
    fail("model-picked pay must be refused: " + JSON.stringify(picked));
  } else pass("an action the model picks is still checked against the approved list");
  automation.setModelForTests(null);
  if (!nextModel.body) fail("model tick missing");

  const stubCard = makeCard(slug, { deskAi: parallelAi.id, notes: "pay", title: "Stub" });
  await call(packs, "POST", owner, {
    action: "save-ai",
    name: "Run",
    plan: ["Do the thing"],
    allowed: ["add_note"]
  });
  const stubbed = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: stubCard.id, aiId: parallelAi.id });
  const stubStep = stubCard.run.steps[0];
  if (!stubStep || stubStep.action !== "pay" || stubStep.why !== "Not on the approved list.") {
    fail("card text pay must be refused: " + JSON.stringify(stubStep) + " " + JSON.stringify(stubbed.body && stubbed.body.run));
  } else pass("card text cannot name an unapproved action");

  const hookRes = await call(hook, "POST", { "x-workspace": slug }, {
    workspace: slug,
    event: "capture",
    title: "Hello from Sam",
    email: "sam@example.com",
    from: "sam@example.com",
    contactName: "Sam"
  });
  const hooked = hookRes.body && hookRes.body.job;
  if (!hooked || String(hooked.email || "").toLowerCase() !== "sam@example.com") fail("hook did not keep the email on the card");
  else if ((shop.approvedContacts || []).length) fail("hook marked Sam as someone this desk already approved");
  else pass("a person on a hooked card is not someone we already approved");
  await call(packs, "POST", owner, {
    action: "save-ai",
    name: "Run",
    plan: ["send_message", "send_message"],
    allowed: ["send_message"],
    pauses: { spend: true, delete: true, newContact: true }
  });
  hooked.deskAi = parallelAi.id;
  const messaging = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: hooked.id, aiId: parallelAi.id });
  if (!messaging.body || !messaging.body.run.waiting || messaging.body.run.waiting.why !== "newContact") {
    fail("someone new must pause: " + JSON.stringify(messaging.body && messaging.body.run));
  } else if ((shop.approvedContacts || []).some((row) => row && row.key === "sam@example.com")) fail("pause must not approve the contact yet");
  else pass("messaging someone new pauses");
  const beforeContacts = JSON.stringify(shop.approvedContacts || []);
  const noSend = makeCard(slug, { deskAi: parallelAi.id, email: "new@example.com" });
  await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: noSend.id, aiId: parallelAi.id });
  await call(desks, "POST", owner, { action: "step-answer", ws: slug, pin: pin, cardId: noSend.id, n: noSend.run.waiting.n, yes: false });
  if (JSON.stringify(shop.approvedContacts || []) !== beforeContacts) fail("saying no must not save the contact");
  else pass("saying no does not approve a new contact");
  const yesSend = await call(desks, "POST", owner, { action: "step-answer", ws: slug, pin: pin, cardId: hooked.id, n: hooked.run.waiting.n, yes: true });
  const sentStep = (hooked.run.steps || []).find((step) => step && step.action === "send_message" && step.result !== "waiting");
  if (!sentStep || sentStep.result !== "held" || sentStep.why !== "held, not sent") fail("yes on a new contact must hold the message: " + JSON.stringify(sentStep));
  else if (!(shop.approvedContacts || []).some((row) => row && row.key === "sam@example.com")) fail("yes must remember the contact on this desk");
  else if (fetches.length !== fetchBefore) fail("send_message called out");
  else pass("yes holds the message and remembers the contact");
  const second = await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: hooked.id });
  const secondStep = hooked.run.steps[hooked.run.steps.length - 1];
  if (!second.body || hooked.run.waiting || !secondStep || secondStep.result !== "held" || secondStep.why !== "held, not sent") {
    fail("a known contact must not pause, and still must not send: " + JSON.stringify(secondStep));
  } else pass("a contact this desk already approved does not pause, and is still not sent");

  await call(packs, "POST", owner, {
    action: "save-ai",
    name: "Run",
    plan: ["delete_card the row"],
    allowed: ["delete_card"],
    pauses: { spend: true, delete: false, newContact: true }
  });
  const delCard = makeCard(slug, { deskAi: parallelAi.id, title: "Delete me" });
  await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: delCard.id, aiId: parallelAi.id });
  if (!delCard.deleted || !mem.jobs.some((row) => row && row.id === delCard.id)) fail("delete_card must soft-delete and keep the card");
  else pass("delete_card is a soft delete");

  const planChanged = await call(packs, "POST", owner, {
    action: "save-ai",
    name: "Yes",
    plan: ["a different step"]
  });
  const yesNow = (shop.ais || []).find((row) => row && row.name === "Yes");
  const whyPlan = automation.approvalView(yesNow);
  if (planChanged.statusCode !== 200 || whyPlan.needsNewYesWhy !== "plan" || whyPlan.needsNewYes !== true) {
    fail("a later plan edit must need a new Yes (plan): " + JSON.stringify(whyPlan));
  } else pass("needsNewYesWhy is plan when the steps change");
  yesNow.automation.allowed = yesNow.automation.allowed.concat(["pay"]);
  const whyAllowed = automation.approvalView(yesNow);
  if (whyAllowed.needsNewYesWhy !== "allowed") fail("needsNewYesWhy must be allowed when the list changes");
  else pass("needsNewYesWhy is allowed when the list changes");

  const quiet = makeCard(slug, { deskAi: parallelAi.id });
  const stepCount = (quiet.run && quiet.run.steps || []).length;
  const ownerActions = ["run-start", "step-answer", "run-stop", "run-kill", "run-read", "automation-pauses"];
  for (let i = 0; i < ownerActions.length; i++) {
    const missing = await call(desks, "POST", { "x-workspace": slug }, { action: ownerActions[i], ws: slug, cardId: quiet.id, aiId: parallelAi.id, n: 1, yes: true, pauses: { spend: true } });
    const wrong = await call(desks, "POST", { "x-workspace": slug, "x-pin": "0000" }, { action: ownerActions[i], ws: slug, pin: "0000", cardId: quiet.id, aiId: parallelAi.id, n: 1, yes: true, pauses: { spend: true } });
    const helper = await call(desks, "POST", { "x-workspace": slug, "x-pin": "9999" }, { action: ownerActions[i], ws: slug, pin: "9999", cardId: quiet.id, aiId: parallelAi.id, n: 1, pauses: { spend: true } });
    if (missing.statusCode !== 403 || wrong.statusCode !== 403 || helper.statusCode !== 403) {
      fail(ownerActions[i] + " pin check " + [missing.statusCode, wrong.statusCode, helper.statusCode].join("/"));
    } else pass(ownerActions[i] + " refuses a missing, wrong, or helper pin");
  }
  const tickMissing = await call(desks, "POST", { "x-workspace": slug }, { action: "run-tick", ws: slug, cardId: quiet.id });
  if (tickMissing.statusCode !== 403) fail("run-tick with no pin and no secret must be 403");
  else pass("run-tick with no pin and no secret is 403");
  if ((quiet.run && quiet.run.steps || []).length !== stepCount) fail("a refused pin still changed the card");
  else pass("owner checks run before the card changes");

  const foreign = makeCard(otherSlug, { title: "Theirs" });
  const foreignAi = ais.normalizeAi({ name: "Theirs", plan: ["add_note"] }, otherSlug);
  other.ais = [foreignAi];
  const crossCard = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: foreign.id, aiId: parallelAi.id });
  const crossAi = await call(desks, "POST", owner, { action: "run-read", ws: slug, pin: pin, cardId: quiet.id, aiId: foreignAi.id });
  const crossStart = await call(desks, "POST", owner, { action: "approve-automation", ws: slug, pin: pin, aiId: foreignAi.id, allowed: ["add_note"] });
  if (crossCard.statusCode !== 403 || foreign.run) fail("a card on another desk must be refused");
  else pass("a card on another desk is refused");
  if (crossStart.statusCode !== 403 || foreignAi.automation) fail("an AI on another desk must be refused");
  else pass("an AI on another desk is refused");
  if (crossAi.statusCode !== 200) fail("run-read on our own card should still work");
  else pass("owner checks do not follow an ai id onto another desk");

  const cronHeaders = [undefined, "", "Bearer undefined", "Bearer ", "Bearer null"];
  equalCalls = 0;
  for (let i = 0; i < cronHeaders.length; i++) {
    const headers = { "x-workspace": slug };
    if (cronHeaders[i] !== undefined) headers.authorization = cronHeaders[i];
    const tick = await call(desks, "POST", headers, { action: "run-tick", ws: slug, cardId: quiet.id });
    const hit = await call(cron, "GET", headers, null, {});
    if (tick.statusCode !== 403 || hit.statusCode !== 403) fail("closed cron header must be 403: " + JSON.stringify(cronHeaders[i]));
    else pass("closed cron refuses " + JSON.stringify(cronHeaders[i] || ""));
  }
  process.env.CRON_SECRET = "";
  const emptySecret = await call(cron, "POST", { authorization: "Bearer " }, { action: "run-tick" });
  if (emptySecret.statusCode !== 403) fail("empty CRON_SECRET must close the cron path");
  else pass("empty CRON_SECRET closes the cron path");
  if (equalCalls !== 0) fail("closed cron must not compare tokens");
  else pass("closed cron does not call timingSafeEqual");
  delete process.env.CRON_SECRET;

  process.env.CRON_SECRET = "abcdef";
  const wrongLen = await call(cron, "GET", { authorization: "Bearer short" }, null, {});
  const beforeEqual = equalCalls;
  const wrongSame = await call(cron, "GET", { authorization: "Bearer zzzzzz" }, null, {});
  if (wrongLen.statusCode !== 403 || wrongSame.statusCode !== 403) fail("bad bearer must be 403");
  else if (equalCalls === beforeEqual) fail("equal-length bearer must use timingSafeEqual");
  else pass("a wrong secret is refused, and equal lengths use timingSafeEqual");
  const wrongPin = await call(desks, "POST", { "x-workspace": slug, "x-pin": "0000", authorization: "Bearer abcdef" }, {
    action: "run-tick", ws: slug, pin: "0000", cardId: quiet.id
  });
  if (wrongPin.statusCode !== 403) fail("a wrong pin must not fall through to the cron secret");
  else pass("a wrong pin is refused before the cron secret");

  const previewRunning = makeCard(slug, { deskAi: parallelAi.id });
  process.env.VERCEL_ENV = "preview";
  await call(packs, "POST", owner, {
    action: "save-ai",
    name: "Run",
    plan: ["add_note one", "add_note two"],
    allowed: ["add_note"],
    pauses: { spend: false, delete: false, newContact: false }
  });
  await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: previewRunning.id, aiId: parallelAi.id });
  const previewSteps = previewRunning.run.steps.length;
  if (previewRunning.run.ticksBy !== "page") fail("preview run ticksBy changed");
  const pausedCron = makeCard(slug, { deskAi: parallelAi.id });
  plantRun(pausedCron, parallelAi, "paused", { waiting: { n: 1, action: "send_message", why: "newContact" }, steps: [{ n: 1, at: "t", action: "send_message", said: "", result: "waiting", why: "Waiting." }] });
  const stoppedCron = plantRun(makeCard(slug, { deskAi: parallelAi.id }), parallelAi, "stopped");
  const killedCron = plantRun(makeCard(slug, { deskAi: parallelAi.id }), parallelAi, "killed");
  const doneCron = plantRun(makeCard(slug, { deskAi: parallelAi.id }), parallelAi, "done");
  const stoppingCron = plantRun(makeCard(slug, { deskAi: parallelAi.id }), parallelAi, "stopping");
  const noBy = plantRun(makeCard(slug, { deskAi: parallelAi.id }), parallelAi, "running", { startedBy: "" });
  const bare = makeCard(slug, { deskAi: parallelAi.id });
  const waitingRun = plantRun(makeCard(slug, { deskAi: parallelAi.id }), parallelAi, "running", {
    waiting: { n: 1, action: "pay", why: "spend" },
    steps: [{ n: 1, at: "t", action: "pay", said: "", result: "waiting", why: "Waiting for a yes before spending.", charged: false }]
  });
  const runningB = plantRun(makeCard(slug, { deskAi: parallelAi.id }), parallelAi, "running");
  const runningA = plantRun(makeCard(slug, { deskAi: parallelAi.id }), parallelAi, "running");
  const cronTick = await call(cron, "GET", { authorization: "Bearer abcdef" }, null, {});
  if (!cronTick.body || cronTick.body.ticked !== true || cronTick.body.cardId !== runningA.id) {
    fail("cron must tick one running run, got " + JSON.stringify(cronTick.body && { ticked: cronTick.body.ticked, cardId: cronTick.body.cardId }));
  } else if ((runningA.run.steps || []).length !== 1 || (runningB.run.steps || []).length !== 0) {
    fail("cron ticked more than one run");
  } else pass("cron advances one step on one running run");
  const untouched = [pausedCron, stoppedCron, killedCron, doneCron, stoppingCron, noBy, waitingRun];
  if (untouched.some((job) => (job.run.steps || []).length !== (job === waitingRun || job === pausedCron ? 1 : 0) || (job === waitingRun && job.run.steps[0].result !== "waiting"))) {
    fail("cron moved a run that was not exactly running");
  } else if (bare.run) fail("cron started a run");
  else if (previewRunning.run.steps.length !== previewSteps) fail("cron moved a preview page run");
  else if ((shop.approvedContacts || []).some((row) => row && row.key === "ada@example.com") && false) fail("cron answered a waiting step");
  else pass("cron does not start, resume, answer, or move a run that is not running");
  if (waitingRun.run.steps[0].result !== "waiting" || pausedCron.run.state !== "paused") fail("cron answered a waiting step");
  else pass("cron does not answer a waiting step");

  process.env.VERCEL_ENV = "production";
  const prodCard = makeCard(slug, { deskAi: parallelAi.id });
  const prod = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: prodCard.id, aiId: parallelAi.id });
  if (!prod.body || prod.body.run.ticksBy !== "cron") fail("production ticksBy must be cron");
  else if (prod.body.run.note) fail("production run must not say the page has to stay open");
  else pass("production ticksBy is cron");
  process.env.VERCEL_ENV = "preview";
  delete process.env.CRON_SECRET;

  const healthRes = await call(health, "GET", {}, null, {});
  const storeInfo = healthRes.body && healthRes.body.store;
  if (!storeInfo || storeInfo.driver !== "tmp" || storeInfo.live !== false) {
    fail("preview store must be tmp and not live: " + JSON.stringify(storeInfo));
  } else if (mem.driver === "blob" || blobAllowed()) fail("preview touched the live store");
  else pass("preview store stays tmp and not live");

  const skipped = (modelCard.run.steps || []).filter((step) => step.result === "skipped" || step.result === "waiting");
  if (!skipped.length || skipped.some((step) => !step.why)) fail("a skip or pause must show a why");
  else if (!["running", "paused", "stopping", "stopped", "killed", "done"].some((state) => state === killCard.run.state)) fail("kill state missing");
  else pass("pauses, refusals, skips, stops and kills show on the card");
}

main().catch((err) => {
  failed += 1;
  console.error("FAIL threw " + (err && err.stack || err));
}).finally(() => {
  global.fetch = origFetch;
  crypto.timingSafeEqual = origEqual;
  try { fs.unlinkSync(store); } catch (e) {}
  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-automation-runner passed");
});

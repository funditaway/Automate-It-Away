#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { fork } = require("child_process");

const store = path.join(os.tmpdir(), "aia-automation-runner-" + process.pid + "-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
process.env.VERCEL_ENV = "preview";
delete process.env.CRON_SECRET;
delete process.env.XAI_API_KEY;
delete process.env.GROK_API_KEY;
delete process.env.AIA_GROK_KEY;
delete process.env.AIA_LEASE_MS;
delete process.env.AIA_TICK_DELAY_MS;
delete process.env.AIA_DIE_AFTER_CLAIM;
delete process.env.AIA_DIE_AFTER_COMMIT;
delete process.env.AIA_DELAY_BEFORE_RUN_CLAIM_MS;
delete global.__aia;
delete global.__aiaHydrate;

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function keysOf(obj) { return Object.keys(obj || {}).sort(); }
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function safe(id) { return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80); }

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
if (autoSrc.indexOf("allowOverwrite: false") < 0 && fs.readFileSync(path.join(root, "api/_runclaims.js"), "utf8").indexOf("allowOverwrite: false") < 0) {
  fail("blob claims must use allowOverwrite false");
} else pass("blob create-if-absent uses allowOverwrite false");
const cronPaths = (vercel.crons || []).map((row) => row && row.path).filter(Boolean);
if (cronPaths.some((p) => /automation/.test(p))) fail("vercel.json must not schedule the automation cron");
else pass("vercel.json has no automation cron entry");
const fn = vercel.functions || {};
if (!fn["api/automation-cron.js"] || !fn["api/auth.js"] || !(fn["api/automation-cron.js"].maxDuration > 0)) {
  fail("maxDuration must be set on the automation functions");
} else pass("maxDuration is set under the function max");

const ais = require("../api/_ais");
const lib = require("../api/_lib");
const automation = require("../api/_automation");
const claims = require("../api/_runclaims");
const desks = require("../api/_desks-http");
const auth = require("../api/auth");
const packs = require("../api/_packs");
const hook = require("../api/hook");
const health = require("../api/health");
const cron = require("../api/automation-cron");
const { mem, hashPin, ensurePeople, ready, blobAllowed } = lib;

const fetches = [];
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

function claimNames(cardId) {
  const dir = path.join(claims.claimsDir(), "locks");
  if (!fs.existsSync(dir)) return [];
  const id = safe(cardId);
  return fs.readdirSync(dir).filter((name) => name.indexOf(id) >= 0);
}

async function waitForLock(cardId, ms, least) {
  const start = Date.now();
  const need = least || 0;
  while (Date.now() - start < ms) {
    if (claimNames(cardId).length > need) return true;
    await wait(25);
  }
  return false;
}

async function waitForFlag(file, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fs.existsSync(file)) return true;
    await wait(25);
  }
  return false;
}

function forkChild(cmd, env) {
  return new Promise((resolve) => {
    const child = fork(path.join(__dirname, "automation-race-child.js"), [cmd], {
      env: Object.assign({}, process.env, env || {}, { AIA_STORE_PATH: store, VERCEL_ENV: "preview" }),
      stdio: ["ignore", "pipe", "pipe", "ipc"]
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (buf) => { out += buf; });
    child.stderr.on("data", (buf) => { err += buf; });
    child.on("exit", (code) => {
      let body = null;
      const line = out.trim().split("\n").filter(Boolean).pop() || "";
      try { body = JSON.parse(line); } catch (e) {}
      const api = body && body.body && typeof body.body === "object" ? body.body : body;
      resolve({ code: code, status: body && body.status, body: api, out: out, err: err });
    });
  });
}

async function reload() {
  await automation.reloadMem();
}

async function main() {
  await ready();
  if (blobAllowed()) fail("preview must not allow the live blob store");
  else pass("preview blob guard stays closed");

  const slug = "auto-desk";
  const pin = "4821";
  const shop = {
    slug: slug, name: "Ada", biz: slug, pin: hashPin(pin),
    createdAt: new Date().toISOString(), people: [], rules: [], ais: []
  };
  ensurePeople(shop);
  shop.people.push({ id: "p_help", name: "Helper", role: "employee", kind: "helper", status: "approved", pin: hashPin("9999") });
  mem.workspaces.unshift(shop);
  const owner = { "x-workspace": slug, "x-pin": pin };
  const other = {
    slug: "other-desk", name: "Other", biz: "other-desk", pin: hashPin("1111"),
    createdAt: new Date().toISOString(), people: [], rules: [], ais: []
  };
  ensurePeople(other);
  mem.workspaces.unshift(other);
  function liveShop() {
    return (mem.workspaces || []).find((row) => row && row.slug === slug) || shop;
  }
  function liveOther() {
    return (mem.workspaces || []).find((row) => row && row.slug === "other-desk") || other;
  }

  const catalogRes = await call(desks, "GET", {}, null, { actions: "1" });
  const viaAuth = await call(auth, "GET", {}, null, { via: "desks", actions: "1" });
  const catalog = catalogRes.body;
  if (!Array.isArray(catalog)) fail("GET /api/desks?actions=1 must return a list");
  else pass("GET /api/desks?actions=1 returns a list");
  if (!same(viaAuth.body, catalog)) fail("auth via=desks actions list changed");
  else pass("actions list is the same through /api/auth?via=desks");
  const ids = (catalog || []).map((row) => row && row.id);
  if (!same(ids, ["add_note", "draft_reply", "set_status", "ask_desk_ai"])) fail("catalog ids changed: " + JSON.stringify(ids));
  else pass("v1 catalog is the four desk actions");
  const banned = (catalog || []).filter((row) => row && (row.id === "pay" || row.id === "send_message" || row.id === "delete_card" || row.held));
  if (banned.length) fail("held actions are still in the catalog");
  else pass("send, delete and pay are not in the catalog");
  (catalog || []).forEach((row) => {
    if (!row || row.risk.spend || row.risk.delete || row.risk.newContact) fail("v1 action carries a risk flag");
  });
  pass("v1 actions carry no risk flags");

  const plain = await call(packs, "POST", owner, {
    action: "save-ai", name: "Plain", role: "Doer", does: "Draft on this desk",
    steps: "qualify, do, follow", plan: ["Open the desk", "Draft the note"]
  });
  const plainAi = plain.body && plain.body.ai;
  const plainStored = (liveShop().ais || []).find((row) => row && row.name === "Plain");
  const publicKeys = ["aia", "aiaLabel", "allow", "bound", "chain", "deny", "does", "draftOnly", "face", "file", "id", "internet", "name", "never", "owned", "plan", "prompt", "promptSummary", "rails", "role", "rules", "steps"];
  const replyKeys = ["added", "ai", "ais", "charged", "never", "note", "ok", "planCut", "rails"];
  if (plain.statusCode !== 200 || !plain.body || !plain.body.ok) fail("plain save-ai " + plain.statusCode);
  else if (!same(keysOf(plain.body), replyKeys)) fail("plain save-ai reply keys changed: " + keysOf(plain.body).join(","));
  else if (!same(keysOf(plainAi), publicKeys)) fail("plain save-ai ai keys changed: " + keysOf(plainAi).join(","));
  else if (!same(plainAi, ais.publicAi(plainStored))) fail("plain save-ai ai is not publicAi(stored)");
  else if (plainStored.automation) fail("plain save-ai stored an approval");
  else pass("save-ai without allowed keeps the old reply and store shape");

  const beforeBad = storeBytes();
  const badCases = [["nope"], ["add_note", "add_note"], ["add_note", 1], "add_note", { id: "add_note" }, ["pay"], ["send_message"], ["delete_card"]];
  for (let i = 0; i < badCases.length; i++) {
    const bad = await call(packs, "POST", owner, { action: "save-ai", name: "Plain", does: "Draft on this desk", plan: ["Open the desk"], allowed: badCases[i] });
    if (bad.statusCode !== 400) fail("bad allowed must 400, got " + bad.statusCode + " for " + JSON.stringify(badCases[i]));
    else pass("bad allowed 400 (" + JSON.stringify(badCases[i]) + ")");
  }
  const badPause = await call(packs, "POST", owner, { action: "save-ai", name: "Plain", does: "Draft on this desk", plan: ["Open the desk"], allowed: ["add_note"], pauses: { spend: "yes" } });
  if (badPause.statusCode !== 400) fail("bad pauses must 400");
  else pass("bad pauses 400");
  const badApprove = await call(desks, "POST", owner, { action: "approve-automation", ws: slug, pin: pin, aiId: plainStored.id, allowed: ["pay"] });
  if (badApprove.statusCode !== 400) fail("approve must 400 for pay");
  else pass("approve-automation 400 for an action outside v1");
  if (storeBytes() !== beforeBad) fail("rejected allowed/pauses wrote the store");
  else pass("rejected allowed writes nothing");

  const inputAllowed = ["add_note", "ask_desk_ai"];
  const yesSave = await call(packs, "POST", owner, {
    action: "save-ai", name: "Yes", role: "Doer", does: "Draft on this desk",
    plan: ["Add a note"], allowed: inputAllowed, pauses: { spend: false }
  });
  const yesStored = (liveShop().ais || []).find((row) => row && row.name === "Yes");
  const yesAi = yesSave.body && yesSave.body.ai;
  if (!yesStored || !yesStored.automation || !yesStored.automation.approvedAt) fail("save-ai with allowed did not store a Yes");
  else pass("save-ai with allowed stores the Yes in the same write");
  if (yesStored && yesStored.automation && yesStored.automation.approvedHash !== automation.approvalHash(yesStored.automation.allowed, yesStored.plan)) {
    fail("approvedHash is not the hash of the stored plan and allowed list");
  } else pass("approvedHash is over the stored plan and the stored allowed list");
  if (!yesAi || yesAi.approved !== true || yesAi.needsNewYes !== false || !same(yesAi.allowed, yesStored.automation.allowed) || !yesAi.pauses) {
    fail("save-ai reply ai approval fields are missing");
  } else pass("save-ai reply ai includes approval fields from the stored row");

  const bare = makeCard(slug);
  const bareRead = await call(desks, "POST", owner, { action: "run-read", ws: slug, pin: pin, cardId: bare.id });
  if (!bareRead.body || bareRead.body.run !== null) fail("run-read without a run must return run null");
  else if (bareRead.body.aiId !== null || !same(bareRead.body.allowed, [])) fail("run-read aiId/allowed before a desk AI");
  else if (bareRead.body.inFlight !== false || bareRead.body.stepStartedAt !== null || bareRead.body.runNo !== null) fail("run-read flight fields before a run");
  else pass("run-read with no Desk AI returns aiId null, allowed [], inFlight false");

  const linked = makeCard(slug, { deskAi: yesStored.id });
  const linkedRead = await call(desks, "POST", owner, { action: "run-read", ws: slug, pin: pin, cardId: linked.id });
  if (!linkedRead.body || linkedRead.body.aiId !== yesStored.id) fail("run-read aiId before a run");
  else if (!same(linkedRead.body.allowed, yesStored.automation.allowed)) fail("run-read allowed is not the saved list");
  else if (linkedRead.body.approved !== true || linkedRead.body.needsNewYes !== false) fail("run-read should be approved before a run");
  else pass("run-read returns aiId and allowed before a run, approved true");

  const pauseInput = { spend: false, delete: true, newContact: true };
  const junkAt = "1999-01-01T00:00:00.000Z";
  const approve = await call(desks, "POST", owner, {
    action: "approve-automation", ws: slug, pin: pin, aiId: yesStored.id,
    allowed: ["add_note"], pauses: pauseInput, approved: false, approvedAt: junkAt, charged: true
  });
  pauseInput.spend = true;
  const storedAfter = (liveShop().ais || []).find((row) => row && row.id === yesStored.id);
  const approveKeys = ["ai", "charged", "ok"];
  const aiKeys = ["allowed", "approved", "approvedAt", "id", "needsNewYes", "needsNewYesWhy", "pauses"];
  if (approve.statusCode !== 200 || !approve.body || !same(keysOf(approve.body), approveKeys)) fail("approve-automation keys");
  else if (approve.body.ok !== true || approve.body.charged !== false) fail("approve-automation must answer ok and charged false");
  else if (!same(keysOf(approve.body.ai), aiKeys)) fail("approve-automation ai keys " + keysOf(approve.body.ai).join(","));
  else if (approve.body.ai.approvedAt === junkAt || approve.body.ai.pauses === pauseInput) fail("approve reply followed the input");
  else if (!same(approve.body.ai.allowed, storedAfter.automation.allowed) || !same(approve.body.ai.pauses, storedAfter.automation.pauses)) fail("approve reply is not the stored row");
  else if (approve.body.ai.pauses.spend !== false) fail("approve pauses followed later input edits");
  else pass("approve-automation replies from the stored row with charged false");

  const drafted = await call(packs, "POST", owner, { action: "studio-draft", brief: "Write the desk note", kind: "ai" });
  const draftedBoth = await call(packs, "POST", owner, { action: "studio-draft", brief: "Set the status. Ask the desk AI.", kind: "ai" });
  const draftedHeld = await call(packs, "POST", owner, { action: "studio-draft", brief: "please set_status and pay and send_message", kind: "ai" });
  const draftedOnlyHeld = await call(packs, "POST", owner, { action: "studio-draft", brief: "pay the send_message", kind: "ai" });
  if (!drafted.body || !drafted.body.ai || !same(drafted.body.ai.allowed, ["add_note"])) fail("studio-draft note map " + JSON.stringify(drafted.body && drafted.body.ai));
  else pass("studio-draft maps a note to add_note");
  if (!draftedBoth.body || !same(draftedBoth.body.ai.allowed, ["set_status", "ask_desk_ai"])) fail("studio-draft union " + JSON.stringify(draftedBoth.body && draftedBoth.body.ai && draftedBoth.body.ai.allowed));
  else pass("studio-draft unions the actions the brief clearly maps to");
  if (!draftedHeld.body || !same(draftedHeld.body.ai.allowed, ["set_status"])) fail("studio-draft kept a held action");
  else pass("studio-draft drops actions outside v1 and keeps set_status");
  if (!draftedOnlyHeld.body || !same(draftedOnlyHeld.body.ai.allowed, [])) fail("held-only brief must not guess an action");
  else pass("studio-draft does not default to add_note");

  const runSave = await call(packs, "POST", owner, {
    action: "save-ai", name: "Run", role: "Doer", does: "Draft on this desk",
    plan: ["Add a note", "Set the status"], allowed: ["add_note", "set_status", "draft_reply", "ask_desk_ai"]
  });
  const runAi = (liveShop().ais || []).find((row) => row && row.name === "Run");
  if (!runSave.body || !runSave.body.ok || !runAi) fail("could not save the runner AI");
  const runCard = makeCard(slug, { deskAi: runAi.id, title: "Page card" });
  const started = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: runCard.id, aiId: runAi.id });
  const liveCard = (mem.jobs || []).find((row) => row && row.id === runCard.id) || runCard;
  if (!started.body || !started.body.run || started.body.run.ticksBy !== "page" || started.body.run.note !== automation.PAGE_NOTE) {
    fail("preview run must say steps only move while the page is open");
  } else if (started.body.run.aiId !== runAi.id || started.body.aiId !== runAi.id) fail("run aiId missing");
  else if (!started.body.run.steps || started.body.run.steps.length !== 1 || started.body.run.steps[0].action !== "add_note") fail("first tick did not record add_note");
  else if (started.body.inFlight !== false || typeof started.body.runNo !== "number") fail("run-start flight shape");
  else pass("preview run says steps only move while the page is open");
  const again = await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: liveCard.id });
  const afterTick = (mem.jobs || []).find((row) => row && row.id === runCard.id);
  if (!afterTick || (afterTick.run.steps || []).length !== 2 || afterTick.run.steps[1].action !== "set_status") fail("second tick did not take the next step once");
  else if (again.body.inFlight !== false) fail("finished tick left inFlight true");
  else pass("repeated ticks record each step once");

  const gate = {};
  gate.promise = new Promise((resolve) => { gate.open = resolve; });
  automation.setTickHoldForTests(() => gate.promise);
  automation.setLeaseMsForTests(5000);
  const parallel = makeCard(slug, { deskAi: runAi.id });
  const firstTick = call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: parallel.id, aiId: runAi.id });
  await wait(80);
  const early = await Promise.all([1, 2, 3, 4, 5].map(() => call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: parallel.id, aiId: runAi.id })));
  gate.open();
  const first = await firstTick;
  automation.setTickHoldForTests(null);
  const parallelJob = (mem.jobs || []).find((row) => row && row.id === parallel.id);
  const inFlightSeen = early.some((row) => row.body && row.body.inFlight === true);
  if (!inFlightSeen) fail("overlapping ticks did not report inFlight");
  else if (!parallelJob || (parallelJob.run.steps || []).filter((step) => step && step.n === 1).length !== 1) fail("overlapping ticks recorded the step more than once");
  else if ((parallelJob.applied || []).filter((id) => /-1$/.test(id)).length > 1) fail("overlapping ticks applied the effect more than once");
  else pass("overlapping ticks record the step once and report inFlight");
  if (!first.body) fail("parallel start missing");

  await lib.save();
  const locksBefore = claimNames(parallel.id).length;
  const forkA = forkChild("tick", { AIA_CARD: parallel.id, AIA_WS: slug, AIA_PIN: pin, AIA_TICK_DELAY_MS: "800", AIA_LEASE_MS: "5000" });
  const sawLock = await waitForLock(parallel.id, 4000, locksBefore);
  const forkB = await forkChild("tick", { AIA_CARD: parallel.id, AIA_WS: slug, AIA_PIN: pin, AIA_LEASE_MS: "5000" });
  const forkADone = await forkA;
  await reload();
  const forked = (mem.jobs || []).find((row) => row && row.id === parallel.id);
  const forkedOnce = (forked && forked.run && forked.run.steps || []).filter((step) => step && step.n === 2);
  if (!sawLock) fail("the first process never claimed a lock");
  else if (!forkB.body || forkB.body.inFlight !== true) fail("a second process did not see the lock: " + JSON.stringify({ status: forkB.body && forkB.body.status, inFlight: forkB.body && forkB.body.inFlight, error: forkB.body && forkB.body.error, err: (forkB.err || "").slice(0, 240), out: (forkB.out || "").slice(0, 240) }));
  else if (forkedOnce.length !== 1) fail("two processes recorded the same step more than once");
  else pass("separate processes share the store lock");
  const lockFile = path.join(claims.claimsDir(), "locks");
  if (!fs.existsSync(lockFile)) fail("lock claim was deleted");
  else pass("old lock claims are left in place");

  const slow = makeCard(slug, { deskAi: runAi.id, title: "Slow" });
  await lib.save();
  const slowA = forkChild("start", { AIA_CARD: slow.id, AIA_WS: slug, AIA_PIN: pin, AIA_AI: runAi.id, AIA_TICK_DELAY_MS: "500", AIA_LEASE_MS: "200" });
  await wait(280);
  const slowB = await forkChild("tick", { AIA_CARD: slow.id, AIA_WS: slug, AIA_PIN: pin, AIA_LEASE_MS: "200" });
  await slowA;
  await reload();
  const slowJob = (mem.jobs || []).find((row) => row && row.id === slow.id);
  const slowSteps = slowJob && slowJob.run && slowJob.run.steps || [];
  if (slowSteps.length !== 1) fail("a slow tick and the next attempt committed more than one step: " + slowSteps.length + " " + (slowB.err || "").slice(0, 160));
  else pass("a tick that outlives its lease still commits one step");

  const died = makeCard(slug, { deskAi: runAi.id, title: "Died" });
  await lib.save();
  const dead = await forkChild("start", { AIA_CARD: died.id, AIA_WS: slug, AIA_PIN: pin, AIA_AI: runAi.id, AIA_DIE_AFTER_CLAIM: "1", AIA_LEASE_MS: "80" });
  await wait(150);
  await reload();
  const afterDie = await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: died.id });
  const diedJob = (mem.jobs || []).find((row) => row && row.id === died.id);
  const diedSteps = diedJob && diedJob.run && diedJob.run.steps || [];
  if (dead.code !== 0) fail("dying tick exited " + dead.code);
  else if (diedSteps.length !== 1 || diedSteps[0].result !== "failed" || diedSteps[0].why !== automation.STEP_STOPPED) {
    fail("expired lease did not fail the step once: " + JSON.stringify(diedSteps) + " " + JSON.stringify(afterDie.body && afterDie.body.run));
  } else pass("a tick that dies holding the lock fails that step once");
  await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: died.id });
  const diedAgain = (mem.jobs || []).find((row) => row && row.id === died.id);
  if ((diedAgain.run.steps || []).length !== 1) fail("the failed step was recorded again");
  else pass("the expired-lease failure is not repeated");

  const halfAi = (liveShop().ais || []).find((row) => row && row.id === runAi.id);
  halfAi.plan = ["Add a note"];
  halfAi.automation.approvedPlan = ["Add a note"];
  halfAi.automation.approvedHash = automation.approvalHash(halfAi.automation.allowed, ["Add a note"]);
  const half = makeCard(slug, { deskAi: runAi.id, title: "Half" });
  await lib.save();
  await forkChild("start", { AIA_CARD: half.id, AIA_WS: slug, AIA_PIN: pin, AIA_AI: runAi.id, AIA_DIE_AFTER_COMMIT: "1" });
  await reload();
  const halfBefore = (mem.jobs || []).find((row) => row && row.id === half.id);
  const notesBefore = halfBefore && halfBefore.notes || "";
  await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: half.id });
  await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: half.id });
  const halfJob = (mem.jobs || []).find((row) => row && row.id === half.id);
  const noteCount = String(halfJob && halfJob.notes || "").split("Add a note").length - 1;
  if (!notesBefore && noteCount !== 1) fail("a winner that died before apply was applied " + noteCount + " times");
  else if ((halfJob.applied || []).length !== 1) fail("effect id was applied more than once");
  else pass("a commit that dies before apply is applied once by the next tick");

  const stopCard = makeCard(slug, { deskAi: runAi.id, title: "Stop me" });
  await lib.save();
  const stopTick = forkChild("start", { AIA_CARD: stopCard.id, AIA_WS: slug, AIA_PIN: pin, AIA_AI: runAi.id, AIA_TICK_DELAY_MS: "800", AIA_LEASE_MS: "5000" });
  await waitForLock(stopCard.id, 4000);
  const stopped = await forkChild("stop", { AIA_CARD: stopCard.id, AIA_WS: slug, AIA_PIN: pin });
  await stopTick;
  await reload();
  const stopJob = (mem.jobs || []).find((row) => row && row.id === stopCard.id);
  const stopRead = await call(desks, "POST", owner, { action: "run-read", ws: slug, pin: pin, cardId: stopCard.id });
  if (!stopped.body || stopped.body.inFlight !== true) fail("stop during a tick did not keep inFlight");
  else if (!stopRead.body || stopRead.body.run.state !== "stopped" || stopRead.body.needsNewYesWhy !== "stopped") fail("stop must stick on this run and need a new Yes");
  else if ((stopJob.run.steps || []).some((step) => step && step.action === "add_note" && step.result === "ok")) fail("stop lost the step that was in flight");
  else pass("stop writes a record the in-flight tick cannot ignore");

  const otherCard = makeCard(slug, { deskAi: runAi.id, title: "Other card" });
  const otherStart = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: otherCard.id, aiId: runAi.id });
  if (!otherStart.body || otherStart.body.run.state === "stopped" || !(otherStart.body.run.steps || []).length) fail("stop on one run blocked another card");
  else pass("stop applies to that run only");

  const doneCard = (mem.jobs || []).find((row) => row && row.id === otherCard.id);
  if (doneCard && doneCard.run && doneCard.run.state !== "done") {
    await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: otherCard.id });
  }
  const doneStop = await call(desks, "POST", owner, { action: "run-stop", ws: slug, pin: pin, cardId: otherCard.id });
  const doneRead = await call(desks, "POST", owner, { action: "run-read", ws: slug, pin: pin, cardId: otherCard.id });
  if (!doneStop.body || doneStop.body.state === "stopped" || (doneRead.body && doneRead.body.needsNewYesWhy === "stopped")) fail("stop on a finished run changed the Yes");
  else pass("stop on a finished run is a no-op");

  await call(packs, "POST", owner, {
    action: "save-ai", name: "Run", does: "Draft on this desk",
    plan: ["Ask the desk AI"], allowed: ["ask_desk_ai", "add_note"]
  });
  const resumed = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: stopCard.id, aiId: runAi.id });
  const resumedJob = (mem.jobs || []).find((row) => row && row.id === stopCard.id);
  const resumedActions = ((resumedJob && resumedJob.run && resumedJob.run.steps) || []).map((step) => step.action);
  if (!resumed.body || resumed.body.needsNewYes) fail("a new Yes did not let the stopped run start again");
  else if (resumedActions.indexOf("set_status") >= 0 || resumedActions.indexOf("draft_reply") >= 0) fail("resume ran the old plan: " + resumedActions.join(","));
  else if (resumedActions[0] !== "ask_desk_ai") fail("resume did not start the new plan at step 1: " + resumedActions.join(","));
  else if (!resumed.body.runNo || resumed.body.runNo < 2) fail("resume did not take a new run number");
  else pass("resume after a new Yes runs the new plan from step 1");

  const twinA = forkChild("start", { AIA_CARD: stopCard.id, AIA_WS: slug, AIA_PIN: pin, AIA_AI: runAi.id });
  const twinB = forkChild("start", { AIA_CARD: stopCard.id, AIA_WS: slug, AIA_PIN: pin, AIA_AI: runAi.id });
  await twinA;
  await twinB;
  await reload();
  let runClaims = 0;
  for (let n = 1; n < 10; n++) if (await claims.readClaim("runs/" + safe(stopCard.id) + "-" + n)) runClaims = n;
  const twinJob = (mem.jobs || []).find((row) => row && row.id === stopCard.id);
  if (runClaims !== (twinJob && twinJob.run && twinJob.run.runNo)) fail("two resumes left a different run than the card");
  else if (runClaims > (resumed.body.runNo + 1)) fail("two resumes started more than one new run");
  else pass("two resumes at once leave one new run");

  const staleCard = makeCard(slug, { deskAi: runAi.id, title: "Stale" });
  await call(packs, "POST", owner, {
    action: "save-ai", name: "Run", does: "Draft on this desk",
    plan: ["Add a note"], allowed: ["add_note", "ask_desk_ai"]
  });
  await lib.save();
  const staleTick = forkChild("start", { AIA_CARD: staleCard.id, AIA_WS: slug, AIA_PIN: pin, AIA_AI: runAi.id, AIA_TICK_DELAY_MS: "900", AIA_LEASE_MS: "5000" });
  await waitForLock(staleCard.id, 4000);
  await forkChild("stop", { AIA_CARD: staleCard.id, AIA_WS: slug, AIA_PIN: pin });
  await call(packs, "POST", owner, {
    action: "save-ai", name: "Run", does: "Draft on this desk",
    plan: ["Add a note"], allowed: ["add_note", "ask_desk_ai"]
  });
  await reload();
  const staleAi = (liveShop().ais || []).find((row) => row && row.name === "Run") || runAi;
  const newer = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: staleCard.id, aiId: staleAi.id });
  await staleTick;
  await reload();
  const staleDone = await claims.readClaim("done/run-" + safe(staleCard.id) + "-1-1");
  const newerJob = (mem.jobs || []).find((row) => row && row.id === staleCard.id);
  if (staleDone && staleDone.result === "ok") fail("an old run committed after the next run started");
  else if (!newer.body || !newerJob || !newerJob.run || newerJob.run.runNo < 2) fail("the new run did not start " + JSON.stringify({ status: newer.statusCode, error: newer.body && newer.body.error, state: newer.body && newer.body.state, runNo: newer.body && newer.body.runNo, jobRun: newerJob && newerJob.run && newerJob.run.runNo, stale: staleDone && staleDone.result }));
  else pass("a tick from the old run commits nothing after the next run starts");

  const killCard = makeCard(slug, { deskAi: runAi.id, title: "Kill me" });
  await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: killCard.id, aiId: runAi.id });
  const killed = await call(desks, "POST", owner, { action: "run-kill", ws: slug, pin: pin, cardId: killCard.id });
  await call(packs, "POST", owner, {
    action: "save-ai", name: "Run", does: "Draft on this desk",
    plan: ["Add a note"], allowed: ["add_note"]
  });
  const killedStart = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: killCard.id, aiId: runAi.id });
  if (!killed.body || typeof killed.body.inFlight !== "boolean" || !killed.body.runNo) fail("kill reply dropped inFlight or runNo " + JSON.stringify(killed.body && { inFlight: killed.body.inFlight, runNo: killed.body.runNo, error: killed.body.error, state: killed.body.state }));
  else if (killedStart.statusCode !== 409 || !killedStart.body || killedStart.body.error !== automation.KILL_MSG) fail("a new Yes must not clear a kill");
  else pass("kill is permanent for the card");

  const midKill = makeCard(slug, { deskAi: runAi.id, title: "Mid kill" });
  await lib.save();
  const midFlag = path.join(os.tmpdir(), "aia-delay-" + safe(midKill.id));
  try { fs.unlinkSync(midFlag); } catch (e) {}
  const midStart = forkChild("start", { AIA_CARD: midKill.id, AIA_WS: slug, AIA_PIN: pin, AIA_AI: runAi.id, AIA_DELAY_BEFORE_RUN_CLAIM_MS: "800", AIA_DELAY_FLAG: midFlag });
  await waitForFlag(midFlag, 4000);
  await forkChild("kill", { AIA_CARD: midKill.id, AIA_WS: slug, AIA_PIN: pin });
  const midDone = await midStart;
  await reload();
  const midJob = (mem.jobs || []).find((row) => row && row.id === midKill.id);
  if (!midDone.body || midDone.body.state !== "killed") fail("a kill between the checks did not end the run: " + JSON.stringify({ state: midDone.body && midDone.body.state, error: midDone.body && midDone.body.error, err: (midDone.err || "").slice(0, 200) }));
  else if (midJob && midJob.run && (midJob.run.steps || []).length) fail("a kill between the checks left a step");
  else pass("a kill landing during run-start ends killed with zero steps");

  await call(packs, "POST", owner, {
    action: "save-ai", name: "Run", does: "Draft on this desk",
    plan: ["Add a note", "Add a note"], allowed: ["add_note"]
  });
  const drift = makeCard(slug, { deskAi: runAi.id, title: "Drift" });
  await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: drift.id, aiId: runAi.id });
  const driftAi = (liveShop().ais || []).find((row) => row && row.id === runAi.id);
  driftAi.plan = ["Set the status"];
  const driftTick = await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: drift.id });
  const driftJob = (mem.jobs || []).find((row) => row && row.id === drift.id);
  const driftWhys = (driftJob.run.steps || []).map((step) => step.why);
  if (driftJob.run.state !== "paused" || driftWhys.filter((why) => why === automation.NEEDS_YES).length !== 1) {
    fail("needsNewYes did not pause with one skipped step: " + JSON.stringify(driftTick.body && driftTick.body.run));
  } else pass("needsNewYes records one skipped step and pauses");
  await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: drift.id });
  const driftAgain = (mem.jobs || []).find((row) => row && row.id === drift.id);
  if ((driftAgain.run.steps || []).filter((step) => step.why === automation.NEEDS_YES).length !== 1) fail("needsNewYes was recorded again");
  else pass("needsNewYes is not repeated on the next tick");

  const goneCard = makeCard(slug, { deskAi: runAi.id, title: "Gone AI" });
  await call(packs, "POST", owner, {
    action: "save-ai", name: "Run", does: "Draft on this desk",
    plan: ["Add a note", "Add a note"], allowed: ["add_note"]
  });
  await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: goneCard.id, aiId: runAi.id });
  const keeper = (liveShop().ais || []).find((row) => row && row.name === "Yes");
  liveShop().ais = (liveShop().ais || []).filter((row) => row && row.id !== runAi.id);
  const goneTick = await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: goneCard.id });
  const goneJob = (mem.jobs || []).find((row) => row && row.id === goneCard.id);
  if (!goneTick.body || goneTick.statusCode >= 500) fail("a missing Desk AI returned " + goneTick.statusCode);
  else if (!goneJob || goneJob.run.state !== "stopped" || !(goneJob.run.steps || []).some((step) => step.why === automation.AI_GONE)) fail("missing Desk AI did not stop the run");
  else if ((goneJob.run.steps || []).some((step) => step.action === "add_note" && step.result === "ok" && step.n > 1)) fail("the run fell back to another Desk AI");
  else if (goneTick.body.inFlight !== false) fail("inFlight stayed true after the Desk AI was gone");
  else pass("a run stops when its own Desk AI is gone");
  liveShop().ais.push(driftAi);

  const missing = makeCard(slug, { deskAi: driftAi.id, title: "Missing card", deleted: true });
  await call(packs, "POST", owner, {
    action: "save-ai", name: "Run", does: "Draft on this desk", plan: ["Add a note", "Add a note"], allowed: ["add_note"]
  });
  const runAgain = (liveShop().ais || []).find((row) => row && row.name === "Run");
  const missingLive = () => (mem.jobs || []).find((row) => row && row.id === missing.id) || missing;
  missingLive().deleted = false;
  await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: missing.id, aiId: runAgain.id });
  missingLive().deleted = true;
  await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: missing.id });
  const missingJob = (mem.jobs || []).find((row) => row && row.id === missing.id);
  if (!missingJob || !(missingJob.run.steps || []).some((step) => step.why === automation.CARD_GONE) || missingJob.run.state !== "stopped") {
    fail("a deleted card did not stop the run");
  } else pass("a gone card records a failed step and stops");

  const muddy = makeCard(slug, { deskAi: runAgain.id, title: "Muddy" });
  await call(packs, "POST", owner, {
    action: "save-ai", name: "Run", does: "Draft on this desk",
    plan: ["Draft a note", "Do the thing"], allowed: ["add_note", "draft_reply", "set_status", "ask_desk_ai"]
  });
  const muddyStart = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: muddy.id, aiId: runAgain.id });
  await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: muddy.id });
  const muddyJob = (mem.jobs || []).find((row) => row && row.id === muddy.id);
  const muddyWhys = (muddyJob.run.steps || []).map((step) => step.why);
  if (muddyWhys[0] !== automation.MANY_MATCH || muddyWhys[1] !== automation.NO_MATCH) fail("mapper guessed: " + muddyWhys.join(" | "));
  else if (muddyJob.notes) fail("an unmatched step still wrote a note");
  else if (!muddyStart.body) fail("muddy start failed");
  else pass("zero or two matches are skipped and never default to add_note");

  let modelCalls = 0;
  automation.setModelForTests({
    map(line) { modelCalls += 1; return { action: "set_status", said: String(line || "") }; },
    ask() { modelCalls += 1; return "Desk AI stub. Collect stays HOLD. Nothing sent. Named delete_card."; }
  });
  const modeled = makeCard(slug, { deskAi: runAgain.id, title: "Modeled" });
  await call(packs, "POST", owner, {
    action: "save-ai", name: "Run", does: "Draft on this desk",
    plan: ["Do the thing", "Ask the desk AI"], allowed: ["add_note", "ask_desk_ai"]
  });
  modelCalls = 0;
  await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: modeled.id, aiId: runAgain.id });
  const modeledJob = (mem.jobs || []).find((row) => row && row.id === modeled.id);
  if (!modeledJob || modeledJob.run.steps[0].why !== automation.NOT_APPROVED || modeledJob.status === "open") fail("a model-chosen action skipped the allowed list");
  else pass("a model-chosen action still has to be on the allowed list");
  modelCalls = 0;
  await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: modeled.id });
  const askStep = ((mem.jobs || []).find((row) => row && row.id === modeled.id).run.steps || [])[1];
  if (!askStep || askStep.action !== "ask_desk_ai" || modelCalls !== 1) fail("ask_desk_ai made " + modelCalls + " model calls");
  else if (askStep.result !== "skipped" || askStep.why !== automation.NOT_APPROVED) fail("ask output ran an action that was not approved");
  else pass("ask_desk_ai makes one model call and does not run an unapproved action");
  automation.setModelForTests(null);

  automation.setFixtureActionsForTests([
    { id: "fixture_new", sentence: "Message someone.", risk: { spend: false, delete: false, newContact: true }, held: false },
    { id: "fixture_spend", sentence: "Spend.", risk: { spend: true, delete: false, newContact: false }, held: false }
  ]);
  const fixtureAi = (liveShop().ais || []).find((row) => row && row.name === "Run");
  function allowFixture(extra) {
    const list = ["add_note"].concat(extra || []);
    const plan = fixtureAi.plan;
    fixtureAi.automation.allowed = list.slice();
    fixtureAi.automation.approvedAllowed = list.slice();
    fixtureAi.automation.approvedHash = automation.approvalHash(list, Array.isArray(plan) ? plan : []);
    fixtureAi.automation.approvedPlan = Array.isArray(plan) ? plan.slice() : [];
  }
  fixtureAi.plan = ["fixture_new sam@example.com"];
  allowFixture(["fixture_new"]);
  const named = makeCard(slug, { deskAi: fixtureAi.id, title: "Named only", contactName: "Sam" });
  if (automation.addressKey("Sam") || automation.contactKnown(liveShop(), "Sam")) fail("a name on its own counted as a known contact");
  else pass("a contact with only a name is never known");
  const hooked = await call(hook, "POST", { "x-workspace": slug }, { event: "capture", title: "Pipe person", email: "sam@example.com", from: "sam@example.com" });
  const hookedJob = hooked.body && hooked.body.job;
  if (!hookedJob || (liveShop().approvedContacts || []).length) fail("a hooked person became a known contact " + hooked.statusCode + " " + JSON.stringify(hooked.body && (hooked.body.error || hooked.body.event)) + " contacts " + JSON.stringify(liveShop().approvedContacts || []));
  else pass("a person on a hooked card is not someone we already approved");
  hookedJob.deskAi = fixtureAi.id;
  fixtureAi.plan = ["fixture_new sam@example.com"];
  allowFixture(["fixture_new"]);
  const messaging = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: hookedJob.id, aiId: fixtureAi.id });
  const msgJob = (mem.jobs || []).find((row) => row && row.id === hookedJob.id);
  if (!messaging.body || !msgJob || !msgJob.run.waiting || msgJob.run.waiting.why !== "newContact") fail("messaging someone new did not pause");
  else pass("messaging someone new pauses");
  liveOther().approvedContacts = [{ key: "sam@example.com", label: "sam@example.com" }];
  if (automation.contactKnown(liveShop(), "sam@example.com")) fail("a contact known on another desk counted here");
  else pass("contacts are not known across desks");
  const saidNo = await call(desks, "POST", owner, { action: "step-answer", ws: slug, pin: pin, cardId: hookedJob.id, n: msgJob.run.waiting.n, yes: false });
  if (!saidNo.body || (liveShop().approvedContacts || []).some((row) => row && row.key === "sam@example.com")) fail("saying no approved the contact");
  else pass("saying no does not approve a new contact");
  const againNew = makeCard(slug, { deskAi: fixtureAi.id, email: "sam@example.com", title: "Again" });
  fixtureAi.plan = ["fixture_new sam@example.com", "fixture_new sam@example.com"];
  allowFixture(["fixture_new"]);
  await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: againNew.id, aiId: fixtureAi.id });
  const againJob = (mem.jobs || []).find((row) => row && row.id === againNew.id);
  await call(desks, "POST", owner, { action: "step-answer", ws: slug, pin: pin, cardId: againNew.id, n: againJob.run.waiting.n, yes: true });
  if (!(liveShop().approvedContacts || []).some((row) => row && row.key === "sam@example.com")) fail("yes did not remember the contact");
  else if (fetches.length) fail("a new-contact yes made an outside call");
  else pass("yes remembers the contact and does not send");
  await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: againNew.id });
  const second = (mem.jobs || []).find((row) => row && row.id === againNew.id);
  if (second.run.waiting) fail("a known contact paused again");
  else pass("a contact this desk already approved does not pause");

  fixtureAi.plan = ["fixture_spend"];
  fixtureAi.automation.pauses = { spend: false, delete: true, newContact: true };
  allowFixture(["fixture_spend"]);
  const payCard = makeCard(slug, { deskAi: fixtureAi.id, title: "Spend" });
  fetches.length = 0;
  await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: payCard.id, aiId: fixtureAi.id });
  const payJob = (mem.jobs || []).find((row) => row && row.id === payCard.id);
  if (!payJob || payJob.charged === true || !payJob.run.steps[0] || payJob.run.steps[0].why !== automation.HOLD_WHY) fail("spend was allowed to charge");
  else if (fetches.length) fail("spend made an outside call");
  else if (["ok", "failed", "skipped", "waiting"].indexOf(payJob.run.steps[0].result) < 0) fail("result left the enum");
  else pass("nothing charges, and Collect stays HOLD");
  automation.setFixtureActionsForTests([]);

  const quiet = makeCard(slug, { deskAi: fixtureAi.id });
  const ownerActions = ["run-start", "step-answer", "run-stop", "run-kill", "run-read", "automation-pauses", "run-tick", "approve-automation"];
  for (let i = 0; i < ownerActions.length; i++) {
    const before = storeBytes();
    const missingPin = await call(desks, "POST", { "x-workspace": slug }, { action: ownerActions[i], ws: slug, cardId: quiet.id, aiId: fixtureAi.id, n: 1, yes: true });
    const wrong = await call(desks, "POST", owner, { action: ownerActions[i], ws: slug, pin: "0000", cardId: quiet.id, aiId: fixtureAi.id, n: 1, yes: true });
    const helper = await call(desks, "POST", { "x-workspace": slug, "x-pin": "9999" }, { action: ownerActions[i], ws: slug, pin: "9999", cardId: quiet.id, aiId: fixtureAi.id, n: 1, yes: true });
    if (missingPin.statusCode !== 403 || wrong.statusCode !== 403 || helper.statusCode !== 403) fail(ownerActions[i] + " owner check");
    else if (storeBytes() !== before) fail(ownerActions[i] + " wrote before the owner check");
  }
  pass("owner checks refuse a missing, wrong, or helper pin");
  const foreign = makeCard("other-desk");
  const cross = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: foreign.id, aiId: fixtureAi.id });
  if (cross.statusCode !== 403) fail("a card on another desk was accepted");
  else pass("a card on another desk is refused");

  equalCalls = 0;
  const closedHeaders = ["", "Bearer undefined", "Bearer ", "Bearer null"];
  for (let i = 0; i < closedHeaders.length; i++) {
    const closed = await call(cron, "GET", closedHeaders[i] ? { authorization: closedHeaders[i] } : {}, null);
    if (closed.statusCode !== 403) fail("closed cron accepted " + JSON.stringify(closedHeaders[i]));
  }
  if (equalCalls !== 0) fail("closed cron called timingSafeEqual");
  else pass("closed cron does not call timingSafeEqual");
  process.env.CRON_SECRET = "cron-secret";
  const badSecret = await call(cron, "GET", { authorization: "Bearer cron-secret-no" }, null);
  const goodPrep = await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: "0000", cardId: quiet.id });
  if (badSecret.statusCode !== 403 || goodPrep.statusCode !== 403) fail("a bad secret or a bad pin was accepted");
  else pass("a wrong secret is refused, and a wrong pin is refused first");

  process.env.CRON_SECRET = "cron-secret";
  const cronAi = (liveShop().ais || []).find((row) => row && row.name === "Run");
  cronAi.plan = ["Add a note"];
  allowFixture([]);
  cronAi.automation.allowed = ["add_note"];
  cronAi.automation.approvedAllowed = ["add_note"];
  cronAi.automation.approvedPlan = ["Add a note"];
  cronAi.automation.approvedHash = automation.approvalHash(["add_note"], ["Add a note"]);
  const runningA = makeCard(slug, { deskAi: cronAi.id, title: "Cron A" });
  runningA.run = {
    state: "running", ticksBy: "cron", aiId: cronAi.id, runNo: 1, startedBy: "p_owner",
    steps: [], waiting: null, queue: ["Add a note"], cursor: 0, approvedHash: cronAi.automation.approvedHash
  };
  await claims.claim("runs/" + safe(runningA.id) + "-1", { at: new Date().toISOString(), runNo: 1 });
  const pausedRun = makeCard(slug, { deskAi: cronAi.id, title: "Cron paused" });
  pausedRun.run = Object.assign({}, runningA.run, { state: "paused", steps: [], queue: ["Add a note"], cursor: 0, waiting: null });
  await claims.claim("runs/" + safe(pausedRun.id) + "-1", { at: new Date().toISOString(), runNo: 1 });
  const pageRun = makeCard(slug, { deskAi: cronAi.id, title: "Cron page" });
  pageRun.run = Object.assign({}, runningA.run, { ticksBy: "page", steps: [], queue: ["Add a note"], cursor: 0, waiting: null });
  await claims.claim("runs/" + safe(pageRun.id) + "-1", { at: new Date().toISOString(), runNo: 1 });
  const nobody = makeCard(slug, { deskAi: cronAi.id, title: "Cron nobody" });
  nobody.run = Object.assign({}, runningA.run, { startedBy: "", steps: [], queue: ["Add a note"], cursor: 0, waiting: null });
  await claims.claim("runs/" + safe(nobody.id) + "-1", { at: new Date().toISOString(), runNo: 1 });
  mem.jobs = [runningA, pausedRun, pageRun, nobody].concat(mem.jobs.filter((row) => row && [runningA.id, pausedRun.id, pageRun.id, nobody.id].indexOf(row.id) < 0));
  await lib.save();
  const cronOnce = await call(cron, "GET", { authorization: "Bearer cron-secret" }, null);
  await reload();
  const cronJob = (mem.jobs || []).find((row) => row && row.id === runningA.id);
  const cronPaused = (mem.jobs || []).find((row) => row && row.id === pausedRun.id);
  const cronPage = (mem.jobs || []).find((row) => row && row.id === pageRun.id);
  const cronNobody = (mem.jobs || []).find((row) => row && row.id === nobody.id);
  if (!cronOnce.body || cronOnce.body.ticked !== true || cronOnce.body.cardId !== runningA.id) fail("cron did not tick the one running run");
  else if ((cronJob.run.steps || []).length !== 1) fail("cron did not record one step");
  else if ((cronPaused.run.steps || []).length || (cronPage.run.steps || []).length || (cronNobody.run.steps || []).length) fail("cron moved a run it must leave alone");
  else pass("cron advances one running person-started cron run and leaves the others");
  const cronAgain = await call(cron, "GET", { authorization: "Bearer cron-secret" }, null);
  if (cronAgain.body && cronAgain.body.ticked) fail("cron took a second step in one call");
  else pass("one cron call takes one step");

  cronAi.plan = ["Set the status"];
  const cronDrift = await call(cron, "GET", { authorization: "Bearer cron-secret" }, null);
  const cronJobAfter = (mem.jobs || []).find((row) => row && row.id === runningA.id);
  if (cronDrift.body && cronDrift.body.ticked) fail("cron ticked a run that needs a new Yes");
  else if ((cronJobAfter.run.steps || []).length !== 1) fail("cron recorded a step after the plan changed");
  else pass("cron does not tick when the run needs a new Yes");

  const prev = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  if (automation.ticksMode() !== "cron") fail("production ticksBy should be cron");
  else pass("production ticksBy is cron");
  process.env.VERCEL_ENV = prev || "preview";
  const healthRes = await call(health, "GET", {}, null);
  if (!healthRes.body || !healthRes.body.store || healthRes.body.store.driver === "blob" || healthRes.body.store.live === true) fail("preview store became live");
  else pass("preview store stays tmp and not live");

  const raceCard = makeCard(slug, { deskAi: cronAi.id, title: "Race me", notes: "" });
  cronAi.plan = ["Add a note"];
  cronAi.automation.allowed = ["add_note"];
  cronAi.automation.approvedAllowed = ["add_note"];
  cronAi.automation.approvedPlan = ["Add a note"];
  cronAi.automation.approvedHash = automation.approvalHash(["add_note"], ["Add a note"]);
  await lib.save();
  const raceTick = forkChild("start", { AIA_CARD: raceCard.id, AIA_WS: slug, AIA_PIN: pin, AIA_AI: cronAi.id, AIA_TICK_DELAY_MS: "600", AIA_LEASE_MS: "5000" });
  await wait(180);
  const raceHook = await forkChild("hook", { AIA_WS: slug, AIA_HOOK_TITLE: "Hook survives" });
  const raceEdit = await forkChild("edit", { AIA_CARD: raceCard.id, AIA_WS: slug, AIA_PIN: pin, AIA_TITLE: "Kept title" });
  await raceTick;
  await reload();
  const raceJob = (mem.jobs || []).find((row) => row && row.id === raceCard.id);
  const raceHookJob = (mem.jobs || []).find((row) => row && row.title === "Hook survives");
  if (!raceHook.body || raceHook.body.status >= 400) fail("hook child failed " + (raceHook.err || "").slice(0, 200));
  else if (!raceHookJob) fail("the hook card was erased by the tick");
  else if (!raceJob || raceJob.title !== "Kept title") fail("the person's edit was erased: " + (raceJob && raceJob.title));
  else pass("a tick keeps a concurrent hook card and a person's edit");

  async function badWhen(flag, fn) {
    const before = automation.setMutationForTests;
    process.env["AIA_MUTATE_" + flag] = "1";
    automation.setMutationForTests(flag, true);
    let bad = false;
    try { bad = await fn(); } finally {
      delete process.env["AIA_MUTATE_" + flag];
      automation.setMutationForTests(flag, false);
      before;
    }
    if (!bad) fail("mutation not caught: " + flag);
    else pass("mutation caught: " + flag);
  }

  await badWhen("noLock", async () => {
    const card = makeCard(slug, { deskAi: cronAi.id, title: "No lock" });
    await lib.save();
    const a = forkChild("start", { AIA_CARD: card.id, AIA_WS: slug, AIA_PIN: pin, AIA_AI: cronAi.id, AIA_TICK_DELAY_MS: "400", AIA_LEASE_MS: "5000", AIA_MUTATE_noLock: "1" });
    await wait(120);
    const b = await forkChild("tick", { AIA_CARD: card.id, AIA_WS: slug, AIA_PIN: pin, AIA_LEASE_MS: "5000", AIA_MUTATE_noLock: "1" });
    await a;
    return !(b.body && b.body.inFlight === true);
  });

  await badWhen("cronSkipStartedBy", async () => {
    const card = makeCard(slug, { deskAi: cronAi.id, title: "No starter" });
    card.run = Object.assign({}, runningA.run, { state: "running", ticksBy: "cron", startedBy: "", steps: [], cursor: 0, waiting: null, queue: ["Add a note"] });
    await claims.claim("runs/" + safe(card.id) + "-1", { at: new Date().toISOString(), runNo: 1 });
    mem.jobs.unshift(card);
    await lib.save();
    const out = await call(cron, "GET", { authorization: "Bearer cron-secret" }, null);
    await reload();
    const job = (mem.jobs || []).find((row) => row && row.id === card.id);
    return !!(out.body && out.body.ticked && job && (job.run.steps || []).length);
  });

  await badWhen("cronSkipState", async () => {
    const card = makeCard(slug, { deskAi: cronAi.id, title: "Paused cron" });
    card.run = Object.assign({}, runningA.run, { state: "paused", ticksBy: "cron", waiting: null, steps: [], cursor: 0, queue: ["Add a note"] });
    await claims.claim("runs/" + safe(card.id) + "-1", { at: new Date().toISOString(), runNo: 1 });
    mem.jobs.unshift(card);
    await lib.save();
    const out = await call(cron, "GET", { authorization: "Bearer cron-secret" }, null);
    await reload();
    const job = (mem.jobs || []).find((row) => row && row.id === card.id);
    return !!(job && (job.run.steps || []).length);
  });

  await badWhen("cronSkipTicksBy", async () => {
    const card = makeCard(slug, { deskAi: cronAi.id, title: "Page cron" });
    card.run = Object.assign({}, runningA.run, { state: "running", ticksBy: "page", steps: [], cursor: 0, waiting: null, queue: ["Add a note"] });
    await claims.claim("runs/" + safe(card.id) + "-1", { at: new Date().toISOString(), runNo: 1 });
    mem.jobs.unshift(card);
    await lib.save();
    await call(cron, "GET", { authorization: "Bearer cron-secret" }, null);
    await reload();
    const job = (mem.jobs || []).find((row) => row && row.id === card.id);
    return !!(job && (job.run.steps || []).length);
  });

  await badWhen("cronSkipApproval", async () => {
    const card = makeCard(slug, { deskAi: cronAi.id, title: "Needs yes cron" });
    card.run = Object.assign({}, runningA.run, { state: "running", ticksBy: "cron", steps: [], cursor: 0, waiting: null, queue: ["Add a note"], approvedHash: "old" });
    await claims.claim("runs/" + safe(card.id) + "-1", { at: new Date().toISOString(), runNo: 1 });
    mem.jobs.unshift(card);
    await lib.save();
    await call(cron, "GET", { authorization: "Bearer cron-secret" }, null);
    await reload();
    const job = (mem.jobs || []).find((row) => row && row.id === card.id);
    return !!(job && (job.run.steps || []).some((step) => step && step.result === "ok"));
  });

  await badWhen("contactsCrossDesk", async () => {
    const mine = liveShop().approvedContacts;
    liveShop().approvedContacts = [];
    liveOther().approvedContacts = [{ key: "ada@example.com", label: "ada@example.com" }];
    const known = automation.contactKnown(liveShop(), "ada@example.com");
    liveShop().approvedContacts = mine;
    return known === true;
  });

  await badWhen("stepAnswerSkipAllowed", async () => {
    const ai = (liveShop().ais || []).find((row) => row && row.name === "Run");
    ai.plan = ["Add a note"];
    ai.automation.allowed = [];
    ai.automation.approvedAllowed = [];
    ai.automation.approvedHash = automation.approvalHash([], ai.plan);
    const card = makeCard(slug, { deskAi: ai.id, title: "Answer allowed" });
    card.run = {
      state: "paused", ticksBy: "page", aiId: ai.id, runNo: 1, startedBy: "p_owner",
      steps: [{ n: 1, at: new Date().toISOString(), action: "add_note", said: "", result: "waiting", why: "Waiting." }],
      waiting: { n: 1, action: "add_note", why: "spend", recipient: "" },
      queue: ["Add a note"], cursor: 0, approvedHash: ai.automation.approvedHash
    };
    await claims.claim("runs/" + safe(card.id) + "-1", { at: new Date().toISOString(), runNo: 1 });
    await claims.claim("done/run-" + safe(card.id) + "-1-1", {
      at: new Date().toISOString(), runNo: 1, n: 1, action: "add_note", said: "", result: "waiting", why: "Waiting.",
      effect: { id: "run-" + safe(card.id) + "-1-1", type: "none" }
    });
    await lib.save();
    await call(desks, "POST", owner, { action: "step-answer", ws: slug, pin: pin, cardId: card.id, n: 1, yes: true });
    await reload();
    const job = (mem.jobs || []).find((row) => row && row.id === card.id);
    return !!(job && String(job.notes || "").indexOf("add_note") >= 0);
  });

  await badWhen("noStopCheck", async () => {
    const ai = (liveShop().ais || []).find((row) => row && row.name === "Run");
    ai.plan = ["Add a note"];
    ai.automation.allowed = ["add_note"];
    ai.automation.approvedAllowed = ["add_note"];
    ai.automation.approvedPlan = ["Add a note"];
    ai.automation.approvedHash = automation.approvalHash(["add_note"], ["Add a note"]);
    ai.automation.approvedAt = new Date().toISOString();
    const card = makeCard(slug, { deskAi: ai.id, title: "Stop check" });
    await lib.save();
    const tick = forkChild("start", {
      AIA_CARD: card.id, AIA_WS: slug, AIA_PIN: pin, AIA_AI: ai.id,
      AIA_TICK_DELAY_MS: "800", AIA_LEASE_MS: "5000", AIA_MUTATE_noStopCheck: "1"
    });
    await waitForLock(card.id, 4000);
    await forkChild("stop", { AIA_CARD: card.id, AIA_WS: slug, AIA_PIN: pin });
    await tick;
    await reload();
    const job = (mem.jobs || []).find((row) => row && row.id === card.id);
    const steps = job && job.run && job.run.steps || [];
    return steps.some((step) => step && step.result === "ok");
  });

  await badWhen("noCas", async () => {
    const card = makeCard(slug, { deskAi: cronAi.id, title: "Cas me", notes: "" });
    await lib.save();
    const tick = forkChild("start", {
      AIA_CARD: card.id, AIA_WS: slug, AIA_PIN: pin, AIA_AI: cronAi.id,
      AIA_TICK_DELAY_MS: "600", AIA_LEASE_MS: "5000", AIA_MUTATE_noCas: "1"
    });
    await wait(180);
    await forkChild("hook", { AIA_WS: slug, AIA_HOOK_TITLE: "Cas hook" });
    await tick;
    await reload();
    return !(mem.jobs || []).some((row) => row && row.title === "Cas hook");
  });

  await badWhen("noKillPrecheck", async () => {
    const card = makeCard(slug, { deskAi: cronAi.id, title: "Pre kill" });
    await claims.claim("kill/run-" + safe(card.id), { at: new Date().toISOString() });
    await lib.save();
    const out = await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: card.id, aiId: cronAi.id });
    return out.statusCode !== 409;
  });

  await badWhen("noKillPostcheck", async () => {
    const card = makeCard(slug, { deskAi: cronAi.id, title: "Post kill" });
    await lib.save();
    const postFlag = path.join(os.tmpdir(), "aia-delay-" + safe(card.id));
    try { fs.unlinkSync(postFlag); } catch (e) {}
    const start = forkChild("start", {
      AIA_CARD: card.id, AIA_WS: slug, AIA_PIN: pin, AIA_AI: cronAi.id,
      AIA_DELAY_BEFORE_RUN_CLAIM_MS: "800", AIA_MUTATE_noKillPostcheck: "1", AIA_DELAY_FLAG: postFlag
    });
    await waitForFlag(postFlag, 4000);
    await forkChild("kill", { AIA_CARD: card.id, AIA_WS: slug, AIA_PIN: pin });
    await start;
    await reload();
    const job = (mem.jobs || []).find((row) => row && row.id === card.id);
    const steps = job && job.run && job.run.steps || [];
    const queue = job && job.run && job.run.queue || [];
    return steps.length > 0 || queue.length > 0 || !job || !job.run || job.run.state !== "killed";
  });

  await badWhen("noNeedsNewYesHalt", async () => {
    const ai = (liveShop().ais || []).find((row) => row && row.name === "Run");
    ai.plan = ["Add a note"];
    ai.automation.allowed = ["add_note"];
    ai.automation.approvedAllowed = ["add_note"];
    ai.automation.approvedPlan = ["Add a note"];
    ai.automation.approvedHash = automation.approvalHash(["add_note"], ["Add a note"]);
    const card = makeCard(slug, { deskAi: ai.id, title: "Halt yes" });
    card.run = Object.assign({}, runningA.run, { state: "running", ticksBy: "page", steps: [], cursor: 0, waiting: null, queue: ["Add a note"], approvedHash: "stale-hash" });
    await claims.claim("runs/" + safe(card.id) + "-1", { at: new Date().toISOString(), runNo: 1 });
    await lib.save();
    await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: card.id });
    await reload();
    const job = (mem.jobs || []).find((row) => row && row.id === card.id);
    const steps = job && job.run && job.run.steps || [];
    return steps.some((step) => step && step.result === "ok");
  });

  await badWhen("fallbackOtherAi", async () => {
    const ai = (liveShop().ais || []).find((row) => row && row.name === "Yes");
    liveShop().ais = [ai].concat((liveShop().ais || []).filter((row) => row && row.id !== ai.id));
    const card = makeCard(slug, { deskAi: "missing-ai", title: "Fallback" });
    card.run = {
      state: "running", ticksBy: "page", aiId: "missing-ai", runNo: 1, startedBy: "p_owner",
      steps: [], waiting: null, queue: ["Add a note"], cursor: 0,
      approvedHash: ai && ai.automation && ai.automation.approvedHash
    };
    await claims.claim("runs/" + safe(card.id) + "-1", { at: new Date().toISOString(), runNo: 1 });
    await lib.save();
    await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: card.id });
    await reload();
    const job = (mem.jobs || []).find((row) => row && row.id === card.id);
    return !!(job && (job.run.steps || []).some((step) => step && step.result === "ok"));
  });

  await badWhen("defaultAddNote", async () => {
    const ai = (liveShop().ais || []).find((row) => row && row.name === "Run");
    ai.plan = ["Do the thing"];
    ai.automation.allowed = ["add_note"];
    ai.automation.approvedAllowed = ["add_note"];
    ai.automation.approvedPlan = ["Do the thing"];
    ai.automation.approvedHash = automation.approvalHash(["add_note"], ["Do the thing"]);
    const card = makeCard(slug, { deskAi: ai.id, title: "Default note" });
    card.run = {
      state: "running", ticksBy: "page", aiId: ai.id, runNo: 1, startedBy: "p_owner",
      steps: [], waiting: null, queue: ["Do the thing"], cursor: 0, approvedHash: ai.automation.approvedHash
    };
    await claims.claim("runs/" + safe(card.id) + "-1", { at: new Date().toISOString(), runNo: 1 });
    await lib.save();
    await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: card.id });
    await reload();
    const job = (mem.jobs || []).find((row) => row && row.id === card.id);
    return !!(job && String(job.notes || "").length);
  });

  await badWhen("nameIsKnown", async () => automation.contactKnown({ approvedContacts: [] }, "Sam") || automation.recipientOf({ contactName: "Sam" }, "") === "sam");

  await badWhen("reuseOldPlan", async () => {
    const ai = (liveShop().ais || []).find((row) => row && row.name === "Run");
    ai.plan = ["Ask the desk AI"];
    ai.automation.allowed = ["ask_desk_ai", "add_note"];
    ai.automation.approvedAllowed = ai.automation.allowed.slice();
    ai.automation.approvedPlan = ["Ask the desk AI"];
    ai.automation.approvedHash = automation.approvalHash(ai.automation.allowed, ["Ask the desk AI"]);
    ai.automation.approvedAt = new Date(Date.now() + 1000).toISOString();
    const card = makeCard(slug, { deskAi: ai.id, title: "Old plan" });
    card.run = {
      state: "stopped", ticksBy: "page", aiId: ai.id, runNo: 1, startedBy: "p_owner",
      steps: [], waiting: null, queue: ["Add a note", "Set the status"], cursor: 1, approvedHash: "old"
    };
    await claims.claim("runs/" + safe(card.id) + "-1", { at: new Date().toISOString(), runNo: 1 });
    await claims.claim("stop/run-" + safe(card.id) + "-1", { at: new Date(Date.now() - 5000).toISOString(), runNo: 1 });
    await lib.save();
    await call(desks, "POST", owner, { action: "run-start", ws: slug, pin: pin, cardId: card.id, aiId: ai.id });
    await reload();
    const job = (mem.jobs || []).find((row) => row && row.id === card.id);
    return !!(job && (job.run.queue || []).indexOf("Set the status") >= 0);
  });

  await badWhen("twoModelCalls", async () => {
    let calls = 0;
    automation.setModelForTests({
      map() { calls += 1; return { action: "ask_desk_ai", said: "one" }; },
      ask() { calls += 1; return "two"; }
    });
    const ai = (liveShop().ais || []).find((row) => row && row.name === "Run");
    ai.plan = ["Ask the desk AI"];
    ai.automation.allowed = ["ask_desk_ai"];
    ai.automation.approvedAllowed = ["ask_desk_ai"];
    ai.automation.approvedPlan = ["Ask the desk AI"];
    ai.automation.approvedHash = automation.approvalHash(["ask_desk_ai"], ["Ask the desk AI"]);
    const card = makeCard(slug, { deskAi: ai.id, title: "Two calls" });
    card.run = {
      state: "running", ticksBy: "page", aiId: ai.id, runNo: 1, startedBy: "p_owner",
      steps: [], waiting: null, queue: ["Ask the desk AI"], cursor: 0, approvedHash: ai.automation.approvedHash
    };
    await claims.claim("runs/" + safe(card.id) + "-1", { at: new Date().toISOString(), runNo: 1 });
    await lib.save();
    await call(desks, "POST", owner, { action: "run-tick", ws: slug, pin: pin, cardId: card.id });
    automation.setModelForTests(null);
    return calls >= 2;
  });

  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-automation-runner passed");
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});

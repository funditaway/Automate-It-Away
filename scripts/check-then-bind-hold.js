#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const vm = require("vm");

const store = path.join(os.tmpdir(), "aia-then-bind-hold-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

delete global.__aia;
delete global.__aiaHydrate;

const root = path.join(__dirname, "..");
const ais = require("../api/_ais");
const lib = require("../api/_lib");
const { qualifyJob } = require("../api/_engine");
const { applyDeskAiDraft } = require("../api/_handoff");
const jobsHandler = require("../api/jobs");
const hookHandler = require("../api/hook");
const workerHandler = require("../api/worker");
const { mem, hashPin, ensurePeople, ready } = lib;

let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

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
  await handler({ method: method, headers: headers || {}, body: body || {}, query: query || {} }, res);
  return res;
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

["api/_engine.js", "api/_handoff.js", "api/_ais.js", "api/jobs.js", "api/hook.js", "api/worker.js", "desk-needs.js", "desk-card.js"].forEach(function (name) {
  const syntax = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
  if (syntax.status !== 0) fail(name + " must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
  else pass(name + " parses");
});

const engineSrc = read("api/_engine.js");
const handSrc = read("api/_handoff.js");
const aisSrc = read("api/_ais.js");
const jobsSrc = read("api/jobs.js");
const hookSrc = read("api/hook.js");
const workerSrc = read("api/worker.js");
const needs = read("desk-needs.js");
const cardSrc = read("desk-card.js");
const help = read("help.html");
const yesNo = read("ACCOUNT-YES-NO.md");

["thenAiGone", "markThenAiGone", "is not on this desk"].forEach(function (bit) {
  if (engineSrc.indexOf(bit) < 0) fail("_engine missing " + bit);
  else pass("_engine " + bit);
});
if (handSrc.indexOf("job.thenAiGone") < 0) fail("_handoff applyDeskAiDraft must honor thenAiGone");
else pass("_handoff honors thenAiGone");
if (aisSrc.indexOf("aiHintPresent") < 0 || !/if \(aiHintPresent\(hint\)\) return null/.test(aisSrc)) {
  fail("pickDeskAi must not first-eligible when a named hint is gone");
} else pass("pickDeskAi does not first-eligible a gone hint");
if (workerSrc.indexOf("job.thenAiGone") < 0) fail("worker must skip first-eligible when Then AI is gone");
else pass("worker honors thenAiGone");
if (jobsSrc.indexOf("applyDeskAiDraft") < 0 || hookSrc.indexOf("applyDeskAiDraft") < 0) {
  fail("capture / hook must still Then-draft through applyDeskAiDraft");
} else pass("capture / hook still Then-draft");
if (needs.indexOf("function thenGone") < 0 || needs.indexOf("not on this desk") < 0 || needs.indexOf("q-ai-gone") < 0) {
  fail("queue card must paint gone Then AI");
} else pass("queue card paints gone Then AI");
if (cardSrc.indexOf("function thenGoneOf") < 0 || cardSrc.indexOf("not on this desk") < 0) {
  fail("Open-job must paint gone Then AI");
} else pass("Open-job paints gone Then AI");
if (help.indexOf("does not pretend another desk AI wrote Then") < 0) {
  fail("help#desk-cards must name gone-AI honesty");
} else pass("help names gone-AI honesty");
if (yesNo.indexOf("check-then-bind-hold.js") < 0) fail("ACCOUNT-YES-NO must record Then-bind HOLD");
else pass("ACCOUNT-YES-NO records Then-bind HOLD");
if (/oauth|spacex|login\.x\.ai|custodial wallet|Collect charge/i.test(handSrc + needs + cardSrc)) {
  fail("Then-bind HOLD invented Grok OAuth / wallet / Collect charge");
} else pass("no OAuth / wallet / Collect charge");

function jamesAi() {
  return {
    name: "James’s AI",
    role: "Doer",
    does: "Draft the lead packet",
    prompt: "Ask who it is for and when. Do not send.",
    steps: ["qualify", "do"]
  };
}
function shopBot() {
  return {
    name: "Shop Bot",
    role: "Worker",
    does: "Qualify the click",
    prompt: "Name the shop and the click. Do not send.",
    steps: ["qualify", "do"]
  };
}

function goneHintNull() {
  const shop = { slug: "pick-gone", ais: [], people: [] };
  ais.attachAisToDesk(shop, [jamesAi()]);
  const picked = ais.pickDeskAi(shop, "qualify", { id: "shop-bot", name: "Shop Bot" });
  if (picked) fail("pickDeskAi must return null for a gone named hint, got " + JSON.stringify(picked));
  else pass("pickDeskAi returns null for a gone named hint");
  const any = ais.pickDeskAi(shop, "qualify", null);
  if (!any || !/James/.test(any.name || "")) fail("unbound pickDeskAi must still pick James");
  else pass("unbound pickDeskAi still picks James");
}

function paintGoneCard(job) {
  const ctx = {
    window: {},
    document: {
      readyState: "complete",
      addEventListener: function () {},
      getElementById: function () { return null; },
      createElement: function () { return { id: "", textContent: "" }; },
      head: { appendChild: function () {} }
    },
    setTimeout: function () {},
    localStorage: { getItem: function () { return ""; }, setItem: function () {} }
  };
  ctx.window = ctx;
  vm.runInNewContext(needs, ctx);
  if (typeof ctx.card !== "function") fail("desk-needs.js must set window.card");
  return ctx.card(job, false);
}

function pretendJames(card) {
  return !!(card && card.deskAi && /James/.test(card.deskAi.name || "") && /Ask who it is for and when/i.test(card.draft || ""));
}

async function main() {
  goneHintNull();
  await ready();

  const slug = "then-hold-desk";
  const pin = "4821";
  const shop = {
    slug: slug,
    name: "Then Hold",
    biz: slug,
    pin: hashPin(pin),
    createdAt: new Date().toISOString(),
    people: [],
    rules: [{
      text: "Click → Shop Bot drafts HOLD.",
      when: "drop",
      contains: "click",
      then: "draft",
      aiId: "shop-bot",
      aiName: "Shop Bot"
    }]
  };
  ensurePeople(shop);
  shop.people[0].name = "Pat";
  ais.attachAisToDesk(shop, [jamesAi()]);
  mem.workspaces.unshift(shop);
  const owner = { "x-workspace": slug, "x-pin": pin };

  const cap = await call(jobsHandler, "POST", owner, {
    action: "capture",
    title: "They clicked",
    notes: "click from the lane",
    from: "drop"
  });
  const card = cap.body && cap.body.job;
  if (cap.statusCode !== 201 || !card) fail("capture " + cap.statusCode + " " + JSON.stringify(cap.body));
  else pass("capture 201");
  if (pretendJames(card)) fail("capture must not pretend James wrote Then: " + JSON.stringify({ deskAi: card.deskAi, draft: card.draft }));
  else pass("capture does not stamp James");
  if (!card.thenAiGone || card.thenAiGone.name !== "Shop Bot") {
    fail("capture must keep thenAiGone Shop Bot, got " + JSON.stringify(card.thenAiGone));
  } else pass("capture keeps thenAiGone");
  if (!/HOLD/i.test(card.draft || "") && !/HOLD/i.test(card.next || "")) fail("capture gone bind must HOLD");
  else pass("capture gone bind HOLDs");
  if (/Ask who it is for and when/i.test(card.draft || "")) fail("capture must not use James prompt");
  else pass("capture draft is not James");
  if (card.status === "shipped" || card.charged) fail("capture must not ship or charge");
  else pass("capture nothing left the desk");

  const rec = await call(jobsHandler, "POST", owner, { action: "recommend", id: card.id, whoTapped: "Pat" });
  const recJob = rec.body && rec.body.job;
  if (rec.statusCode !== 200 || !recJob) fail("recommend " + rec.statusCode);
  else if (pretendJames(recJob)) fail("recommend must not overwrite gone bind with James");
  else if (!recJob.thenAiGone || recJob.thenAiGone.name !== "Shop Bot") fail("recommend must keep thenAiGone");
  else pass("recommend keeps gone-AI HOLD");

  const hookDesk = {
    slug: "then-hold-hook",
    name: "Then Hook",
    biz: "then-hold-hook",
    pin: hashPin(pin),
    createdAt: new Date().toISOString(),
    people: [],
    rules: [{
      text: "Click → Shop Bot drafts HOLD.",
      when: "drop",
      contains: "click",
      then: "draft",
      aiId: "shop-bot",
      aiName: "Shop Bot"
    }]
  };
  ensurePeople(hookDesk);
  ais.attachAisToDesk(hookDesk, [jamesAi()]);
  mem.workspaces.unshift(hookDesk);
  const hooked = await call(hookHandler, "POST", { "x-workspace": "then-hold-hook" }, {
    event: "capture",
    title: "They clicked",
    notes: "click from the lane",
    from: "pipe"
  });
  const hookJob = hooked.body && hooked.body.job;
  if (hooked.statusCode !== 201 || !hookJob) fail("hook capture " + hooked.statusCode + " " + JSON.stringify(hooked.body));
  else if (pretendJames(hookJob)) fail("hook must not pretend James wrote Then");
  else if (!hookJob.thenAiGone || hookJob.thenAiGone.name !== "Shop Bot") fail("hook must keep thenAiGone");
  else if (hookJob.status === "shipped" || hookJob.charged) fail("hook must not ship");
  else pass("hook capture keeps gone-AI HOLD");

  const workerDesk = {
    slug: "then-hold-worker",
    name: "Then Worker",
    biz: "then-hold-worker",
    pin: hashPin(pin),
    createdAt: new Date().toISOString(),
    people: [],
    rules: [{
      text: "Click → Shop Bot drafts HOLD.",
      when: "drop",
      contains: "click",
      then: "draft",
      aiId: "shop-bot",
      aiName: "Shop Bot"
    }]
  };
  ensurePeople(workerDesk);
  ais.attachAisToDesk(workerDesk, [jamesAi()]);
  mem.workspaces.unshift(workerDesk);
  const waiting = qualifyJob({
    id: "job_then_hold_w",
    title: "They clicked",
    notes: "click from the lane",
    from: "drop",
    workspace: "then-hold-worker",
    status: "waiting"
  }, workerDesk);
  mem.jobs.unshift(waiting);
  applyDeskAiDraft(waiting, workerDesk, "qualify");
  if (pretendJames(waiting)) fail("applyDeskAiDraft after qualify must not stamp James");
  else pass("applyDeskAiDraft honors thenAiGone");
  const tick = await call(workerHandler, "POST", { "x-workspace": "then-hold-worker" }, {});
  const afterTick = mem.jobs.find(function (j) { return j && j.id === waiting.id; });
  if (tick.statusCode !== 200) fail("worker " + tick.statusCode);
  else if (pretendJames(afterTick)) fail("worker must not first-eligible James onto a gone bind");
  else if (!afterTick.thenAiGone || afterTick.thenAiGone.name !== "Shop Bot") fail("worker must keep thenAiGone");
  else pass("worker keeps gone-AI HOLD");

  const notifyShop = {
    slug: "then-hold-notify",
    ais: [],
    people: [],
    rules: [{
      text: "Done → Shop Bot notify HOLD.",
      when: "drop",
      contains: "done",
      then: "notify",
      aiId: "shop-bot",
      aiName: "Shop Bot"
    }]
  };
  ais.attachAisToDesk(notifyShop, [jamesAi(), shopBot()]);
  const notified = qualifyJob({
    title: "Task done",
    notes: "status done",
    from: "desk",
    workspace: "then-hold-notify",
    status: "waiting"
  }, notifyShop);
  applyDeskAiDraft(notified, notifyShop, "qualify");
  if (!notified.deskAi || notified.deskAi.name !== "Shop Bot") {
    fail("notify Then must stamp Shop Bot, got " + JSON.stringify(notified.deskAi));
  } else if (/James/.test((notified.deskAi && notified.deskAi.name) || "") && notified.deskAi.name !== "Shop Bot") {
    fail("notify Then must not stamp James");
  } else if (!/Shop Bot/.test(notified.next || "") && !/Shop Bot/.test(notified.draft || "")) {
    fail("notify Then must name Shop Bot, got " + JSON.stringify({ draft: notified.draft, next: notified.next }));
  } else if (notified.charged || notified.status === "shipped") {
    fail("notify Then must not ship");
  } else pass("notify Then stamps bound Shop Bot");

  const notifyGone = {
    slug: "then-hold-notify-gone",
    ais: [],
    people: [],
    rules: [{
      text: "Done → missing notify HOLD.",
      when: "drop",
      contains: "done",
      then: "notify",
      aiId: "shop-bot",
      aiName: "Shop Bot"
    }]
  };
  ais.attachAisToDesk(notifyGone, [jamesAi()]);
  const notifiedGone = qualifyJob({
    title: "Task done",
    notes: "status done",
    from: "desk",
    workspace: "then-hold-notify-gone",
    status: "waiting"
  }, notifyGone);
  applyDeskAiDraft(notifiedGone, notifyGone, "qualify");
  if (pretendJames(notifiedGone) || (notifiedGone.deskAi && /James/.test(notifiedGone.deskAi.name || ""))) {
    fail("gone notify must not stamp James: " + JSON.stringify(notifiedGone.deskAi));
  } else if (!notifiedGone.thenAiGone || notifiedGone.thenAiGone.name !== "Shop Bot") {
    fail("gone notify must mark thenAiGone");
  } else if (!/Shop Bot is not on this desk/i.test(notifiedGone.draft || "") && !/Shop Bot is not on this desk/i.test(notifiedGone.next || "")) {
    fail("gone notify must name Shop Bot, got " + JSON.stringify({ draft: notifiedGone.draft, next: notifiedGone.next }));
  } else pass("gone notify stays HOLD without James");

  const anyShop = {
    slug: "then-hold-any",
    ais: [],
    people: [],
    rules: [{ text: "Click → any drafts HOLD.", when: "drop", contains: "click", then: "draft" }]
  };
  ais.attachAisToDesk(anyShop, [jamesAi()]);
  const any = qualifyJob({
    title: "They clicked",
    notes: "click from the lane",
    from: "drop",
    workspace: "then-hold-any"
  }, anyShop);
  if (!any.deskAi || !/James/.test(any.deskAi.name || "")) fail("unbound Then must still pick James");
  else pass("unbound Then still picks James");

  ais.attachAisToDesk(shop, [jamesAi(), shopBot()]);
  const bind = await call(jobsHandler, "POST", owner, { action: "bind-ai", id: card.id, ai: "Shop Bot", whoTapped: "Pat" });
  if (bind.statusCode !== 200 || !bind.body || !bind.body.job) fail("bind-ai " + bind.statusCode + " " + JSON.stringify(bind.body));
  else if (!bind.body.job.deskAi || bind.body.job.deskAi.name !== "Shop Bot") {
    fail("bind-ai must stamp live Shop Bot, got " + JSON.stringify(bind.body.job.deskAi));
  } else if (bind.body.job.thenAiGone) {
    fail("bind-ai must clear thenAiGone");
  } else if (bind.body.job.charged || bind.body.job.status === "shipped") {
    fail("bind-ai must not ship");
  } else pass("owner bind-ai clears gone HOLD");

  const painted = paintGoneCard({
    id: "j-gone",
    status: "waiting",
    title: "Need 2 < 3",
    draft: "Don't use <b>html</b>. Human send HOLD.",
    thenAiGone: { id: "shop-bot", name: "Shop Bot <gone>" },
    next: "Shop Bot <gone> is not on this desk. Draft HOLD.",
    waitingOn: "person"
  });
  if (painted.indexOf("James") >= 0) fail("gone card must not name James");
  else pass("gone card does not name James");
  if (painted.indexOf("not on this desk") < 0) fail("gone card must say not on this desk");
  else pass("gone card says not on this desk");
  if (painted.indexOf("Shop Bot <gone>") >= 0) fail("raw < in gone AI name must not become markup");
  else if (painted.indexOf("Shop Bot &lt;gone&gt;") < 0) fail("gone AI name must stay text");
  else pass("gone AI name stays text");
  if (painted.indexOf("Don't use <b>html</b>") >= 0) fail("raw draft markup must not land");
  else pass("gone draft stays text");
  if (painted.indexOf("Nothing sent alone") < 0 && painted.indexOf("HOLD") < 0) fail("gone card must stay HOLD");
  else pass("gone card stays HOLD");
  if (painted.indexOf(">Yes<") < 0 || painted.indexOf(">Kill<") < 0) fail("Yes / Stop / Kill must stay");
  else pass("Yes / Stop / Kill stay");

  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-then-bind-hold: ok");
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});

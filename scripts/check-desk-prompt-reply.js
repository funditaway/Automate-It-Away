#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const vm = require("vm");

const root = path.join(__dirname, "..");

function fail(msg) {
  console.error("check-desk-prompt-reply: " + msg);
  process.exit(1);
}

const needs = fs.readFileSync(path.join(root, "desk-needs.js"), "utf8");
const jobsSrc = fs.readFileSync(path.join(root, "api/jobs.js"), "utf8");
const engineSrc = fs.readFileSync(path.join(root, "api/_engine.js"), "utf8");
const yesNo = fs.readFileSync(path.join(root, "ACCOUNT-YES-NO.md"), "utf8");
const help = fs.readFileSync(path.join(root, "help.html"), "utf8");
const desk = fs.readFileSync(path.join(root, "desk.html"), "utf8");
const drop = fs.readFileSync(path.join(root, "drop.html"), "utf8");
const dropAgent = fs.readFileSync(path.join(root, "drop-agent.js"), "utf8");

const syntax = spawnSync(process.execPath, ["--check", path.join(root, "desk-needs.js")], { encoding: "utf8" });
if (syntax.status !== 0) fail("desk-needs.js must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));

["function isPromptReply", "function promptHtml", "function replyOnCard", "function setCardBusy", "q-prompt", "q-reply-box", "Nothing sent alone", "action: \"reply\"", "Working. Nothing sent yet."].forEach(function (bit) {
  if (needs.indexOf(bit) < 0) fail("desk-needs.js missing " + bit);
});
if (!/function thenAfterYes/.test(engineSrc)) fail("_engine.js must export thenAfterYes");
if (!/action === \"reply\"/.test(jobsSrc)) fail("jobs.js must handle reply");
if (!/thenAfterYes/.test(jobsSrc)) fail("jobs.js must call thenAfterYes after Yes");
if (/oauth|spacex|login\.x\.ai|custodial wallet|Collect charge/i.test(needs)) {
  fail("prompt reply invented Grok OAuth / wallet / Collect charge");
}
if (desk.indexOf("Needs you") >= 0) fail("desk.html must not hardcode Needs you");
if (help.indexOf("prompt reply") < 0 && help.indexOf("Reply on the card") < 0) {
  fail("help#desk-cards must name prompt reply");
}
if (help.indexOf("When=do Then") < 0) fail("help must name When=do Then after Yes");
if (yesNo.indexOf("check-desk-prompt-reply.js") < 0) fail("ACCOUNT-YES-NO must record prompt reply");
if (drop.indexOf("Public drop never sees money, Stop, or People") < 0) {
  fail("public Drop copy drifted");
}
if (dropAgent.indexOf("deskIsOpen") < 0 || dropAgent.indexOf("!deskIsOpen()") < 0) {
  fail("Drop People honesty must stay behind deskIsOpen()");
}

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
  localStorage: { getItem: function () { return ""; }, setToken: function () {}, setItem: function () {} }
};
ctx.window = ctx;
vm.runInNewContext(needs, ctx);
if (typeof ctx.card !== "function") fail("desk-needs.js must set window.card");
if (typeof ctx.replyOnCard !== "function") fail("desk-needs.js must set window.replyOnCard");

const askCard = ctx.card({
  id: "j-ask",
  status: "waiting",
  title: "Missed call",
  kind: "call",
  outcome: "call",
  waitingOn: "info",
  why: "Need a number before this can go."
}, false);
if (askCard.indexOf("q-prompt") < 0) fail("ask card missing q-prompt");
if (askCard.indexOf("Need a number") < 0) fail("ask card must show the question");
if (askCard.indexOf("q-reply-box") < 0) fail("ask card missing reply field");
if (askCard.indexOf(">Reply<") < 0) fail("ask card missing Reply tap");
if (askCard.indexOf("Nothing sent alone") < 0) fail("ask card must say nothing sent alone");
if (askCard.indexOf("replyOnCard('j-ask')") < 0) fail("Reply tap must call replyOnCard");
if (/>Yes</.test(askCard)) fail("ask card must not show Yes");

const aiCard = ctx.card({
  id: "j-ai",
  status: "waiting",
  title: "They clicked",
  draft: "Ask who it is for and when. Do not send.",
  deskAi: { name: "James’s AI", role: "Doer" },
  waitingOn: "person"
}, false);
if (aiCard.indexOf("q-prompt") < 0) fail("desk AI question card must show prompt reply");
if (aiCard.indexOf("James") < 0) fail("desk AI prompt must name the AI");
if (aiCard.indexOf(">Yes<") < 0) fail("decide card still needs Yes");
if (aiCard.indexOf(">Kill<") < 0) fail("owner still gets Kill");

const helperCard = ctx.card({
  id: "j-help",
  status: "waiting",
  title: "Missed call",
  kind: "call",
  outcome: "call",
  waitingOn: "info",
  why: "Need a number before this can go."
}, true);
if (helperCard.indexOf(">Reply<") < 0) fail("seated helper must see Reply");
if (/>Kill</.test(helperCard) || />Stop</.test(helperCard)) fail("helper must not get Stop / Kill");

const xss = ctx.card({
  id: "j-xss",
  status: "waiting",
  title: "Need 2 < 3",
  waitingOn: "info",
  why: "Need <phone> before this can go."
}, false);
if (/<p class="q-prompt-q">Need <phone>/.test(xss)) fail("raw < in the question must not become markup");
if (xss.indexOf("Need &lt;phone&gt; before this can go.") < 0) fail("prompt question must stay text");

async function apiPath() {
  const store = path.join(os.tmpdir(), "aia-prompt-reply-" + Date.now() + ".json");
  process.env.AIA_STORE_PATH = store;
  delete global.__aia;
  delete global.__aiaHydrate;
  const lib = require("../api/_lib");
  const ais = require("../api/_ais");
  const jobsHandler = require("../api/jobs");
  const { mem, hashPin, ensurePeople, ready } = lib;

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
  async function call(handler, method, headers, body) {
    const res = mockRes();
    await handler({ method: method, headers: headers || {}, body: body || {}, query: {} }, res);
    return res;
  }

  await ready();
  const slug = "reply-desk";
  const ownerPin = "4821";
  const helpPin = "7733";
  const desk = {
    slug: slug,
    name: "Reply desk",
    biz: slug,
    pin: hashPin(ownerPin),
    createdAt: new Date().toISOString(),
    people: [],
    rules: [
      { text: "Click → draft HOLD.", when: "drop", contains: "click", then: "draft" },
      { text: "After Yes → next Then draft HOLD.", when: "do", then: "draft" }
    ]
  };
  ensurePeople(desk);
  desk.people[0].name = "Pat";
  desk.people[0].pin = hashPin(ownerPin);
  desk.people.push({
    id: "human_helper",
    name: "Sam",
    role: "employee",
    kind: "helper",
    status: "approved",
    pin: hashPin(helpPin)
  });
  desk.people.push({
    id: "ai_bot",
    name: "James’s AI",
    role: "agent",
    kind: "agent",
    deskAi: true,
    status: "approved",
    pin: hashPin("9999")
  });
  ais.attachAisToDesk(desk, [{
    name: "James’s AI",
    role: "Doer",
    does: "Ask who it is for",
    prompt: "Ask who it is for and when. Do not send.",
    steps: ["qualify", "do"]
  }]);
  mem.workspaces.unshift(desk);

  const owner = { "x-workspace": slug, "x-pin": ownerPin };
  const helper = { "x-workspace": slug, "x-pin": helpPin };
  const bot = { "x-workspace": slug, "x-pin": "9999" };

  const cap = await call(jobsHandler, "POST", owner, {
    action: "capture",
    title: "Missed call",
    notes: "Need a number before this can go.",
    kind: "call",
    outcome: "call",
    from: "desk"
  });
  if (cap.statusCode !== 201 || !cap.body.job) fail("capture should 201, got " + cap.statusCode);
  const id = cap.body.job.id;
  await call(jobsHandler, "POST", owner, {
    action: "ask",
    id: id,
    text: "Need a number before this can go.",
    whoTapped: "Pat"
  });

  const empty = await call(jobsHandler, "POST", owner, { action: "reply", id: id, text: "   ", whoTapped: "Pat" });
  if (empty.statusCode !== 400) fail("empty reply must 400, got " + empty.statusCode);

  const aiReply = await call(jobsHandler, "POST", bot, { action: "reply", id: id, text: "I approve this.", whoTapped: "James’s AI" });
  if (aiReply.statusCode !== 403) fail("desk AI reply must 403, got " + aiReply.statusCode + " " + JSON.stringify(aiReply.body));

  const helpOut = await call(jobsHandler, "POST", helper, { action: "reply", id: id, text: "Call 555-123-4567 Friday", whoTapped: "Sam" });
  if (helpOut.statusCode !== 200 || !helpOut.body.ok) {
    fail("seated helper reply should 200, got " + helpOut.statusCode + " " + JSON.stringify(helpOut.body));
  }
  const job = helpOut.body.job;
  if (!job) fail("reply returned no job");
  if (job.status === "shipped" || job.charged === true || helpOut.body.sent === true || helpOut.body.shipped === true) {
    fail("reply must not Yes / ship / send");
  }
  const thread = (job.thread || []).map(function (t) { return (t.kind || "") + ":" + (t.text || ""); }).join("|");
  if (thread.indexOf("reply:Call 555-123-4567") < 0 && !(job.replies || []).some(function (r) { return /555-123-4567/.test(r.text || ""); })) {
    fail("reply must land on the card history");
  }
  if (!job.phone || String(job.phone).indexOf("555") < 0) fail("reply should fill the missing number, got " + job.phone);

  const click = await call(jobsHandler, "POST", owner, {
    action: "capture",
    title: "They clicked",
    notes: "click from the lane",
    from: "drop"
  });
  if (click.statusCode !== 201 || !click.body.job) fail("click capture " + click.statusCode);
  const ship = await call(jobsHandler, "POST", owner, {
    action: "ship",
    id: click.body.job.id,
    confirm: true,
    whoTapped: "Pat"
  });
  if (ship.statusCode >= 400) fail("Yes should work, got " + ship.statusCode + " " + JSON.stringify(ship.body));
  if (!ship.body.nextJob) fail("Yes must continue When=do Then with a next card");
  if (ship.body.nextJob.status === "shipped" || ship.body.nextJob.charged === true) {
    fail("next Then must not ship or charge");
  }

  const aiYes = await call(jobsHandler, "POST", bot, {
    action: "ship",
    id: id,
    confirm: true,
    whoTapped: "James’s AI"
  });
  if (aiYes.statusCode !== 403) fail("desk AI still cannot Yes, got " + aiYes.statusCode);

  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
}

apiPath().then(function () {
  console.log("check-desk-prompt-reply: ok");
}).catch(function (e) {
  console.error(e);
  process.exit(1);
});

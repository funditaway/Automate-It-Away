#!/usr/bin/env node
"use strict";
require("./_env-guard");

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

["q-prompt", "q-reply-box", "Nothing sent alone", "Working. Nothing sent yet."].forEach(function (bit) {
  if (needs.indexOf(bit) < 0) fail("desk-needs.js missing " + bit);
});
// a2ad8c4 minified isPromptReply / promptHtml / replyOnCard / setCardBusy.
// window.promptHtml, window.replyOnCard, and window.setCardBusy still paint
// the reply box; the client still posts action:"reply".
function promptReplyFnsFaults(src) {
  const bad = [];
  if (src.indexOf("window.promptHtml") < 0) bad.push("missing window.promptHtml");
  if (src.indexOf("window.replyOnCard") < 0) bad.push("missing window.replyOnCard");
  if (src.indexOf("window.setCardBusy") < 0) bad.push("missing window.setCardBusy");
  if (src.indexOf('action:"reply"') < 0) bad.push("missing action:reply");
  return bad;
}
(function () {
  const bad = promptReplyFnsFaults(needs);
  if (bad.length) fail("desk-needs.js prompt reply drifted: " + bad.join("; "));
})();
["desk-card.js", "desk-queue.js", "desk-home.js"].forEach(function (name) {
  const src = fs.readFileSync(path.join(root, name), "utf8");
  if (src.indexOf("Working. Nothing sent yet.") < 0) fail(name + " missing Working busy-face");
  if (src.indexOf("function setCardBusy") < 0) fail(name + " missing setCardBusy");
  if (src.indexOf("q-pending") < 0 || src.indexOf("q-busy") < 0) fail(name + " missing q-busy / q-pending paint");
});
if (!/function thenAfterYes/.test(engineSrc)) fail("_engine.js must export thenAfterYes");
if (!/action === \"reply\"/.test(jobsSrc)) fail("jobs.js must handle reply");
if (!/thenAfterYes/.test(jobsSrc)) fail("jobs.js must call thenAfterYes after Yes");
// 6af0633 / #406: a stranger's reply (desk name + card id, no seat) gets the
// same missing-desk 404 as a missing desk, before the card is looked up.
function unauthReplyFaults(src) {
  const bad = [];
  if (src.indexOf("function refuseJobRead") < 0) bad.push("missing refuseJobRead");
  if (src.indexOf("if (!shop || !person) return refuseJobRead") < 0) bad.push("missing seat gate");
  if (src.indexOf("No desk with that name.") < 0) bad.push("missing missing-desk reply");
  return bad;
}
(function () {
  const bad = unauthReplyFaults(jobsSrc);
  if (bad.length) fail("jobs.js unauth reply must look like a missing desk: " + bad.join("; "));
})();
if (/oauth|spacex|login\.x\.ai|custodial wallet|Collect charge/i.test(needs)) {
  fail("prompt reply invented Grok OAuth / wallet / Collect charge");
}
if (desk.indexOf("Needs you") >= 0) fail("desk.html must not hardcode Needs you");
if (help.indexOf("prompt reply") < 0 && help.indexOf("Reply on the card") < 0) {
  fail("help#desk-cards must name prompt reply");
}
if (help.indexOf("When=do Then") < 0) fail("help must name When=do Then after Yes");
if (yesNo.indexOf("check-desk-prompt-reply.js") < 0) fail("ACCOUNT-YES-NO must record prompt reply");
// fff3b47 ("Drop: simpler desk page") rewrote public Drop copy. The honesty
// is the same: they never see money, Stop, or People.
function publicDropFaults(src) {
  const bad = [];
  if (src.indexOf("They never see money, Stop, or People") < 0) {
    bad.push("missing They never see money, Stop, or People");
  }
  return bad;
}
(function () {
  const bad = publicDropFaults(drop);
  if (bad.length) fail("public Drop copy drifted: " + bad.join("; "));
})();
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
if (typeof ctx.setCardBusy !== "function") fail("desk-needs.js must set window.setCardBusy");
if (typeof ctx.promptHtml !== "function") fail("desk-needs.js must set window.promptHtml");

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
if (askCard.indexOf("replyOnCard('j-ask','queue')") < 0) fail("Reply tap must call replyOnCard with the queue surface");
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

  const readyCap = await call(jobsHandler, "POST", owner, {
    action: "capture",
    title: "Ready lead",
    notes: "facts already on the card",
    from: "desk"
  });
  if (readyCap.statusCode !== 201 || !readyCap.body.job) fail("ready capture " + readyCap.statusCode);
  const readyReply = await call(jobsHandler, "POST", owner, {
    action: "reply",
    id: readyCap.body.job.id,
    text: "Just a note on the card",
    whoTapped: "Pat"
  });
  if (readyReply.statusCode !== 200 || !readyReply.body.ok) {
    fail("Yes-ready reply should 200, got " + readyReply.statusCode + " " + JSON.stringify(readyReply.body));
  }
  if (readyReply.body.nextJob) fail("reply on a Yes-ready card must not spawn Then-after-Yes");
  if (readyReply.body.job && (readyReply.body.job.status === "shipped" || readyReply.body.job.charged === true || readyReply.body.sent === true)) {
    fail("Yes-ready reply must not Yes / ship / send");
  }

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

  const leftover = lib.issueSession(desk.people[0], desk, null, { headers: { "x-workspace": slug } });
  if (!leftover || !leftover.token) fail("must issue leftover email-session token");
  const closed = await call(jobsHandler, "POST", { "x-workspace": slug }, {
    action: "reply",
    id: id,
    text: "Token-only note",
    whoTapped: "Pat"
  });
  if (closed.statusCode !== 404) {
    fail("reply without pin or session must 404 as a missing desk, got " + closed.statusCode);
  }
  if (!closed.body || closed.body.error !== "No desk with that name.") {
    fail("unauth reply must look like a missing desk, got " + JSON.stringify(closed.body));
  }
  if (closed.body && (closed.body.ok === true || closed.body.sent === true || closed.body.shipped === true || closed.body.job)) {
    fail("unauth reply must not return the card");
  }
  const leftoverOut = await call(jobsHandler, "POST", { "x-workspace": slug, "x-session": leftover.token }, {
    action: "reply",
    id: id,
    text: "Token-only note",
    whoTapped: "Pat"
  });
  if (leftoverOut.statusCode !== 200 || !leftoverOut.body.ok) {
    fail("leftover email-session reply should 200, got " + leftoverOut.statusCode + " " + JSON.stringify(leftoverOut.body));
  }
  if (leftoverOut.body.sent === true || leftoverOut.body.shipped === true || leftoverOut.body.job.charged === true) {
    fail("leftover email-session reply must not Yes / ship / send");
  }

  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
}

// Mutants for the replaced assertions. In-memory only.
function swap(s, from, to) { return s.indexOf(from) < 0 ? null : s.split(from).join(to); }
const MUTANTS = [
  ["isPromptReply / promptHtml loses window.promptHtml", function () { const n = swap(needs, "window.promptHtml", "window.promptOff"); return n && promptReplyFnsFaults(n); }],
  ["replyOnCard loses window.replyOnCard", function () { const n = swap(needs, "window.replyOnCard", "window.replyOff"); return n && promptReplyFnsFaults(n); }],
  ["setCardBusy loses window.setCardBusy", function () { const n = swap(needs, "window.setCardBusy", "window.busyOff"); return n && promptReplyFnsFaults(n); }],
  ["client reply action dropped", function () { const n = swap(needs, 'action:"reply"', 'action:"note"'); return n && promptReplyFnsFaults(n); }],
  ["public Drop honesty dropped", function () { const d = swap(drop, "They never see money, Stop, or People", "They can see money, Stop, or People"); return d && publicDropFaults(d); }],
  ["unauth reply loses refuseJobRead", function () { const j = swap(jobsSrc, "function refuseJobRead", "function refuseJobOff"); return j && unauthReplyFaults(j); }],
  ["unauth reply loses the seat gate", function () { const j = swap(jobsSrc, "if (!shop || !person) return refuseJobRead", "if (false) return refuseJobRead"); return j && unauthReplyFaults(j); }],
  ["unauth reply loses missing-desk copy", function () { const j = swap(jobsSrc, "No desk with that name.", "Open this desk to reply."); return j && unauthReplyFaults(j); }]
];
let mutCaught = 0;
MUTANTS.forEach(function (m) {
  let out;
  try { out = m[1](); } catch (e) { out = ["threw " + e.message]; }
  if (out === null || out === false || out === undefined) fail("mutant does not apply: " + m[0]);
  else if (out.length) { mutCaught += 1; console.log("ok  mutant caught: " + m[0] + " (" + out[0] + ")"); }
  else fail("mutant survived: " + m[0]);
});
console.log("check-desk-prompt-reply mutants: " + mutCaught + "/" + MUTANTS.length + " caught");

apiPath().then(function () {
  console.log("check-desk-prompt-reply: ok");
}).catch(function (e) {
  console.error(e);
  process.exit(1);
});

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
  console.error("check-desk-ai-edit: " + msg);
  process.exit(1);
}

const needs = fs.readFileSync(path.join(root, "desk-needs.js"), "utf8");
const deskAis = fs.readFileSync(path.join(root, "desk-ais.js"), "utf8");
const jobsSrc = fs.readFileSync(path.join(root, "api/jobs.js"), "utf8");
const aisSrc = fs.readFileSync(path.join(root, "api/_ais.js"), "utf8");
const peopleJs = fs.readFileSync(path.join(root, "people.js"), "utf8");
const peopleHtml = fs.readFileSync(path.join(root, "people.html"), "utf8");
const yesNo = fs.readFileSync(path.join(root, "ACCOUNT-YES-NO.md"), "utf8");
const help = fs.readFileSync(path.join(root, "help.html"), "utf8");
const drop = fs.readFileSync(path.join(root, "drop.html"), "utf8");
const dropAgent = fs.readFileSync(path.join(root, "drop-agent.js"), "utf8");

["desk-needs.js", "desk-ais.js", "people.js"].forEach(function (name) {
  const syntax = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
  if (syntax.status !== 0) fail(name + " must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
});

// a2ad8c4 (#265) minified desk-needs.js. Names like talkTurns / talkHtml /
// bindAiHtml / bindAiOnCard were shortened; window.card still paints the
// thread, and window.bindAiHtml / window.bindAiOnCard stay exported.
["q-thread", "q-talk", "q-ai-pick", "Nothing sent alone"].forEach(function (bit) {
  if (needs.indexOf(bit) < 0) fail("desk-needs.js missing " + bit);
});
function talkThreadFaults(src) {
  const bad = [];
  if (src.indexOf("q-thread") < 0) bad.push("missing q-thread");
  if (src.indexOf("q-talk") < 0) bad.push("missing q-talk");
  if (src.indexOf("q-turn-you") < 0) bad.push("missing q-turn-you");
  if (src.indexOf("q-turn-ai") < 0) bad.push("missing q-turn-ai");
  return bad;
}
(function () {
  const bad = talkThreadFaults(needs);
  if (bad.length) fail("desk AI card must still paint the AI / human thread: " + bad.join("; "));
})();
function bindAiFaults(src) {
  const bad = [];
  if (src.indexOf("window.bindAiHtml") < 0) bad.push("missing window.bindAiHtml");
  if (src.indexOf("window.bindAiOnCard") < 0) bad.push("missing window.bindAiOnCard");
  if (src.indexOf('action:"bind-ai"') < 0 && src.indexOf('action: "bind-ai"') < 0) bad.push("missing bind-ai action");
  if (src.indexOf("q-ai-pick") < 0) bad.push("missing q-ai-pick");
  return bad;
}
(function () {
  const bad = bindAiFaults(needs);
  if (bad.length) fail("desk AI bind must stay on the card: " + bad.join("; "));
})();
// 9b6ba98 (#495): next-line suffix is ". Nothing sent alone.", not bare HOLD.
function honestNextFaults(src) {
  const bad = [];
  if (src.indexOf(". Nothing sent alone.") < 0) bad.push("missing . Nothing sent alone.");
  if (src.indexOf(". HOLD. Nothing sent alone.") >= 0) bad.push("bare HOLD suffix came back");
  return bad;
}
(function () {
  const bad = honestNextFaults(needs);
  if (bad.length) fail("next-line must stay Nothing sent alone, no bare HOLD: " + bad.join("; "));
})();
if (/oauth|spacex|login\.x\.ai|custodial wallet|Collect charge/i.test(needs + deskAis)) {
  fail("desk AI edit invented Grok OAuth / wallet / Collect charge");
}

["function editOf", "function saveAi", "ai-edit", "save-ai", "Save on this desk"].forEach(function (bit) {
  if (deskAis.indexOf(bit) < 0) fail("desk-ais.js missing " + bit);
});
if (!/function findDeskAi/.test(aisSrc) || !/pickDeskAi\(shop, step, hint\)/.test(aisSrc)) {
  fail("_ais.js must find / pick a bound desk AI");
}
if (!/action === \"bind-ai\"/.test(jobsSrc)) fail("jobs.js must handle bind-ai");
if (!/Only the owner can pick which desk AI/.test(jobsSrc)) fail("bind-ai must stay owner-only");
if (!/Desk AIs never assign themselves/.test(jobsSrc)) fail("desk AI must not bind a card");
if (peopleJs.indexOf("save-ai") < 0 || peopleJs.indexOf("ai-edit") < 0) fail("People bot cards must edit via save-ai");
if (peopleJs.indexOf("if (p.aiId && !row.aiId)") < 0) fail("groupPeople must keep aiId");
if (peopleHtml.indexOf("ai-edit") < 0) fail("people.html must style bot edit");
if (help.indexOf("edit name / does / prompt") < 0) fail("help#desk-cards must name bot-card edit");
if (help.indexOf("which desk AI owns Then") < 0) fail("help#desk-cards must name assign on the card");
if (help.indexOf("AI") < 0 || help.indexOf("human thread") < 0) fail("help#desk-cards must name the stacked thread");
if (help.indexOf("Grok") >= 0) fail("help.html must not lecture Grok");
if (yesNo.indexOf("check-desk-ai-edit.js") < 0) fail("ACCOUNT-YES-NO must record desk AI edit / bind");
// fff3b47 simplified Drop copy; public share still hides money / Stop / People.
function publicDropFaults(src) {
  const bad = [];
  if (src.indexOf("They never see money, Stop, or People") < 0) bad.push("missing they never see money / Stop / People");
  return bad;
}
(function () {
  const bad = publicDropFaults(drop);
  if (bad.length) fail("public Drop copy must still hide money, Stop, and People: " + bad.join("; "));
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
  localStorage: { getItem: function () { return ""; }, setItem: function () {} }
};
ctx.window = ctx;
vm.runInNewContext(needs, ctx);
if (typeof ctx.card !== "function") fail("desk-needs.js must set window.card");
if (typeof ctx.bindAiOnCard !== "function") fail("bind-ai must stay on window.bindAiOnCard");

ctx.AIADeskAis = {
  owner: true,
  rows: [
    { id: "james-s-ai", name: "James’s AI", does: "Draft the lead packet", prompt: "Ask who it is for." },
    { id: "shop-bot", name: "Shop Bot", does: "Qualify cards", prompt: "Who is it for?" }
  ],
  primary: function () { return this.rows[0]; }
};

const stacked = ctx.card({
  id: "j-stack",
  status: "waiting",
  title: "They clicked",
  draft: "Ask who it is for and when. Do not send.",
  deskAi: { id: "james-s-ai", name: "James’s AI", does: "Draft the lead packet", prompt: "Ask who it is for." },
  thread: [
    { kind: "ask", from: "James’s AI", text: "Who is this for?", at: "2026-09-06T12:00:00Z" },
    { kind: "reply", from: "Pat", text: "Sam at the shop", at: "2026-09-06T12:01:00Z" }
  ],
  replies: [{ from: "Pat", text: "Sam at the shop" }],
  next: "James’s AI drafted on the card. Human send HOLD."
}, false);
if (stacked.indexOf("q-thread") < 0) fail("stacked replies + Then must wrap in q-thread");
if (stacked.indexOf("q-talk") < 0) fail("stacked card must show the AI ↔ human thread");
if (stacked.indexOf("Then draft") < 0) fail("stacked card must still say Then draft");
if (stacked.indexOf("Sam at the shop") < 0) fail("stacked card must show the human reply");
if (stacked.indexOf("Who is this for?") < 0) fail("stacked card must show the AI ask");
if (stacked.indexOf("q-turn-you") < 0 || stacked.indexOf("q-turn-ai") < 0) fail("thread must mark AI and human turns");
if (stacked.indexOf("q-ai-pick") < 0) fail("owner must see the desk AI picker");
if (stacked.indexOf("Shop Bot") < 0) fail("picker must list the other desk AI");
if (stacked.indexOf(">Yes<") < 0 || stacked.indexOf(">Kill<") < 0) fail("Yes / Stop / Kill must stay");
if (stacked.indexOf("Nothing sent alone") < 0) fail("stacked card must stay HOLD / nothing sent");
if (stacked.indexOf("James’s AI · Then draft") < 0) fail("stacked card must name who drafted as Then draft");
if (stacked.indexOf("James’s AI · asks") < 0) fail("stacked thread must mark the AI ask");
if (stacked.indexOf("Pat · you") < 0) fail("stacked thread must mark the human reply");

const xss = ctx.card({
  id: "j-xss",
  status: "waiting",
  title: "Need 2 < 3",
  draft: "Don't use <b>html</b>",
  deskAi: { name: "AI <bot>", does: "Draft <leads>", prompt: "Never use <script>" },
  thread: [
    { kind: "ask", from: "AI <bot>", text: "Need <phone>?" },
    { kind: "reply", from: "Sam <helper>", text: "Use <script> no" }
  ]
}, false);
if (xss.indexOf("AI <bot>") >= 0) fail("raw < in the AI name must not become markup");
if (xss.indexOf("Need <phone>?") >= 0) fail("raw < in the ask must not become markup");
if (xss.indexOf("Need &lt;phone&gt;?") < 0) fail("ask must stay text");
if (xss.indexOf("Sam &lt;helper&gt;") < 0) fail("reply from must stay text");
if (xss.indexOf("Use &lt;script&gt; no") < 0) fail("reply text must stay text");

ctx.AIADeskAis.owner = false;
const helperCard = ctx.card({
  id: "j-help",
  status: "waiting",
  title: "Oak dresser",
  draft: "Ask who it is for.",
  deskAi: { name: "James’s AI" }
}, true);
if (helperCard.indexOf("q-ai-pick") >= 0) fail("helper must not see the desk AI picker");
if (helperCard.indexOf(">Kill<") >= 0) fail("helper must not get Kill");

ctx.AIADeskAis.owner = true;
const goneTalk = ctx.card({
  id: "j-gone-talk",
  status: "waiting",
  title: "Oak dresser",
  draft: "List it. Do not send.",
  thenAiGone: { id: "shop-bot", name: "Shop Bot" },
  thread: [
    { kind: "ask", from: "Shop Bot", text: "Who is it for?" },
    { kind: "reply", from: "Pat", text: "A neighbor" }
  ]
}, false);
if (goneTalk.indexOf("q-talk") < 0) fail("gone thread must still show the AI / human talk");
if (goneTalk.indexOf("Shop Bot · not on this desk") < 0) fail("gone thread must say Shop Bot · not on this desk");
if (goneTalk.indexOf("Who is it for?") < 0) fail("gone thread must still show the AI ask");
if (goneTalk.indexOf("A neighbor") < 0) fail("gone thread must still show the human reply");
if (goneTalk.indexOf("q-turn-ai") < 0 || goneTalk.indexOf("q-turn-you") < 0) fail("gone thread must mark AI and human turns");
if (goneTalk.indexOf("q-ai-pick") < 0) fail("owner must still see the picker when the Then bind is gone");

const aisCtx = {
  window: {},
  document: {
    readyState: "complete",
    addEventListener: function () {},
    getElementById: function () { return null; },
    createElement: function () { return { id: "", textContent: "", style: {} }; },
    head: { appendChild: function () {} }
  },
  setTimeout: function () {},
  localStorage: { getItem: function () { return ""; }, setItem: function () {} }
};
aisCtx.window = aisCtx;
vm.runInNewContext(deskAis, aisCtx);
if (!aisCtx.AIADeskAis || typeof aisCtx.AIADeskAis.saveAi !== "function") fail("desk-ais.js must set AIADeskAis.saveAi");
const host = { hidden: true, className: "item", innerHTML: "", addEventListener: function () {} };
aisCtx.document.getElementById = function (id) { return id === "desk-ais" ? host : (id === "aia-desk-ais-css" ? { id: id } : null); };
aisCtx.AIADeskAis.paint({
  role: "owner",
  you: { role: "owner", name: "Pat" },
  ais: [{
    id: "james-s-ai",
    name: "James’s AI",
    aia: "james.aia",
    role: "Doer",
    does: "Draft the lead packet",
    prompt: "Ask who it is for and when. Do not send."
  }]
});
if (host.innerHTML.indexOf("ai-edit") < 0) fail("owner bot card must show the edit form");
if (host.innerHTML.indexOf("Save on this desk") < 0) fail("owner bot card must have Save on this desk");
if (host.innerHTML.indexOf("James") < 0) fail("edit form must keep the AI name");
if (host.innerHTML.indexOf("Ask who it is for") < 0) fail("edit form must keep the prompt");

aisCtx.AIADeskAis.paint({
  role: "employee",
  you: { role: "employee", name: "Sam" },
  ais: [{ name: "James’s AI", does: "Draft the lead packet", prompt: "Ask who" }]
});
if (host.innerHTML.indexOf("ai-edit") >= 0) fail("helper must not edit bot cards on the desk strip");

aisCtx.AIADeskAis.paint({
  role: "owner",
  you: { role: "owner" },
  ais: [{ name: "AI <bot>", does: "Draft <leads>", prompt: "Never <script>" }]
});
if (host.innerHTML.indexOf("AI <bot>") >= 0) fail("edit form raw < in name");
if (host.innerHTML.indexOf("value=\"AI &lt;bot&gt;\"") < 0) fail("edit name must stay text");
if (host.innerHTML.indexOf("Draft &lt;leads&gt;") < 0) fail("edit does must stay text");
if (host.innerHTML.indexOf("Never &lt;script&gt;") < 0) fail("edit prompt must stay text");

async function apiPath() {
  const store = path.join(os.tmpdir(), "aia-desk-ai-edit-" + Date.now() + ".json");
  process.env.AIA_STORE_PATH = store;
  delete global.__aia;
  delete global.__aiaHydrate;
  const lib = require("../api/_lib");
  const ais = require("../api/_ais");
  const jobsHandler = require("../api/jobs");
  const desksHandler = require("../api/_desks-http");
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
  const slug = "ai-edit-desk";
  const pin = "4821";
  const desk = {
    slug: slug,
    name: "AI edit",
    biz: slug,
    pin: hashPin(pin),
    createdAt: new Date().toISOString(),
    people: [],
    rules: []
  };
  ensurePeople(desk);
  desk.people[0].name = "Pat";
  desk.people[0].pin = hashPin(pin);
  desk.people.push({
    id: "human_helper",
    name: "Sam",
    role: "employee",
    kind: "helper",
    status: "approved",
    pin: hashPin("7733")
  });
  ais.attachAisToDesk(desk, [{
    name: "James’s AI",
    role: "Doer",
    does: "Draft the lead packet",
    prompt: "Ask who it is for and when. Do not send.",
    steps: ["qualify", "do"]
  }, {
    name: "Shop Bot",
    role: "Doer",
    does: "Qualify cards",
    prompt: "Who is it for?",
    steps: ["qualify", "do"]
  }]);
  mem.workspaces.unshift(desk);
  const owner = { "x-workspace": slug, "x-pin": pin };
  const helper = { "x-workspace": slug, "x-pin": "7733" };

  const james = ais.findDeskAi(desk, "James’s AI");
  if (!james || !/James/.test(james.name || "")) fail("findDeskAi must find James’s AI");

  const save = await call(desksHandler, "POST", owner, {
    action: "save-ai",
    id: james.id,
    name: "James’s AI",
    does: "Packet for the lane",
    prompt: "Ask who and when. Still HOLD."
  });
  if (save.statusCode !== 200 || !save.body.ok) fail("owner save-ai should 200, got " + save.statusCode + " " + JSON.stringify(save.body));
  const after = ais.findDeskAi(desk, james.id);
  if (!after || after.does.indexOf("Packet for the lane") < 0) fail("save-ai must update does on the live desk AI");
  if (!after.prompt || after.prompt.indexOf("Ask who and when") < 0) fail("save-ai must update prompt");

  const helperSave = await call(desksHandler, "POST", helper, {
    action: "save-ai",
    id: james.id,
    name: "James’s AI",
    does: "Nope",
    prompt: "Nope"
  });
  if (helperSave.statusCode !== 403) fail("helper save-ai must 403, got " + helperSave.statusCode);

  const cap = await call(jobsHandler, "POST", owner, {
    action: "capture",
    title: "Oak dresser",
    notes: "list it",
    from: "desk"
  });
  if (cap.statusCode !== 201 || !cap.body.job) fail("capture should 201, got " + cap.statusCode);
  const id = cap.body.job.id;
  const rec = await call(jobsHandler, "POST", owner, { action: "recommend", id: id, whoTapped: "Pat" });
  if (rec.statusCode !== 200 || !rec.body.ok) fail("recommend should 200, got " + rec.statusCode);
  if (!rec.body.job.deskAi || !/James/.test(rec.body.job.deskAi.name || "")) fail("recommend should stamp James first");

  const bind = await call(jobsHandler, "POST", owner, { action: "bind-ai", id: id, ai: "Shop Bot", whoTapped: "Pat" });
  if (bind.statusCode !== 200 || !bind.body.ok) fail("owner bind-ai should 200, got " + bind.statusCode + " " + JSON.stringify(bind.body));
  if (!bind.body.job.deskAi || bind.body.job.deskAi.name !== "Shop Bot") {
    fail("bind-ai must stamp Shop Bot, got " + JSON.stringify(bind.body.job.deskAi));
  }
  if (!bind.body.job.deskAi.does || bind.body.job.deskAi.does.indexOf("Qualify") < 0) {
    fail("bind-ai must restamp does, got " + JSON.stringify(bind.body.job.deskAi));
  }
  if (bind.body.job.status === "shipped" || bind.body.job.charged === true) fail("bind-ai must not ship or charge");

  const rec2 = await call(jobsHandler, "POST", owner, { action: "recommend", id: id, whoTapped: "Pat" });
  if (!rec2.body.job.deskAi || rec2.body.job.deskAi.name !== "Shop Bot") {
    fail("Ask Grok after bind must keep Shop Bot, got " + JSON.stringify(rec2.body.job.deskAi));
  }

  const helperBind = await call(jobsHandler, "POST", helper, { action: "bind-ai", id: id, ai: "James’s AI", whoTapped: "Sam" });
  if (helperBind.statusCode !== 403) fail("helper bind-ai must 403, got " + helperBind.statusCode);

  const bot = {
    id: "ai_login",
    name: "Shop Bot",
    role: "agent",
    kind: "agent",
    deskAi: true,
    status: "approved",
    pin: hashPin("9999")
  };
  desk.people.push(bot);
  const aiBind = await call(jobsHandler, "POST", { "x-workspace": slug, "x-pin": "9999" }, {
    action: "bind-ai",
    id: id,
    ai: "James’s AI",
    whoTapped: "Shop Bot"
  });
  if (aiBind.statusCode !== 403) fail("desk AI still cannot bind-ai, got " + aiBind.statusCode);

  const aiYes = await call(jobsHandler, "POST", { "x-workspace": slug, "x-pin": "9999" }, {
    action: "ship",
    id: id,
    confirm: true,
    whoTapped: "Shop Bot"
  });
  if (aiYes.statusCode !== 403) fail("desk AI still cannot Yes, got " + aiYes.statusCode);

  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
}

// Mutants for the replaced assertions. In-memory only.
function swap(s, from, to) { return s.indexOf(from) < 0 ? null : s.split(from).join(to); }
const MUTANTS = [
  ["talkTurns / talkHtml loses q-thread", function () { const n = swap(needs, "q-thread", "q-trail"); return n && talkThreadFaults(n); }],
  ["talkTurns / talkHtml loses q-talk", function () { const n = swap(needs, "q-talk", "q-chat"); return n && talkThreadFaults(n); }],
  ["talkTurns / talkHtml loses q-turn-you", function () { const n = swap(needs, "q-turn-you", "q-turn-me"); return n && talkThreadFaults(n); }],
  ["talkTurns / talkHtml loses q-turn-ai", function () { const n = swap(needs, "q-turn-ai", "q-turn-bot"); return n && talkThreadFaults(n); }],
  ["bindAiHtml loses window.bindAiHtml", function () { const n = swap(needs, "window.bindAiHtml", "window.bindAiOff"); return n && bindAiFaults(n); }],
  ["bindAiOnCard loses window.bindAiOnCard", function () { const n = swap(needs, "window.bindAiOnCard", "window.bindOnOff"); return n && bindAiFaults(n); }],
  ["bind-ai action dropped", function () { const n = swap(needs, 'action:"bind-ai"', 'action:"bind-off"'); return n && bindAiFaults(n); }],
  ["bind picker loses q-ai-pick", function () { const n = swap(needs, "q-ai-pick", "q-ai-sel"); return n && bindAiFaults(n); }],
  ["honestNext loses Nothing sent alone suffix", function () { const n = swap(needs, ". Nothing sent alone.", ". Do the next thing."); return n && honestNextFaults(n); }],
  ["honestNext brings back bare HOLD suffix", function () {
    const n = swap(needs, ". Nothing sent alone.", ". HOLD. Nothing sent alone.");
    return n && honestNextFaults(n);
  }],
  ["public Drop honesty dropped", function () { const d = swap(drop, "They never see money, Stop, or People", "They can see money, Stop, or People"); return d && publicDropFaults(d); }]
];
let mutCaught = 0;
MUTANTS.forEach(function (m) {
  let out;
  try { out = m[1](); } catch (e) { out = ["threw " + e.message]; }
  if (out === null || out === false || out === undefined) fail("mutant does not apply: " + m[0]);
  else if (out.length) { mutCaught += 1; console.log("ok  mutant caught: " + m[0] + " (" + out[0] + ")"); }
  else fail("mutant survived: " + m[0]);
});
console.log("check-desk-ai-edit mutants: " + mutCaught + "/" + MUTANTS.length + " caught");

apiPath().then(function () {
  console.log("check-desk-ai-edit: ok");
}).catch(function (e) {
  console.error(e);
  process.exit(1);
});


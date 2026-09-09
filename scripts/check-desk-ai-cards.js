#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const vm = require("vm");

const root = path.join(__dirname, "..");

function fail(msg) {
  console.error("check-desk-ai-cards: " + msg);
  process.exit(1);
}

const needs = fs.readFileSync(path.join(root, "desk-needs.js"), "utf8");
const deskAis = fs.readFileSync(path.join(root, "desk-ais.js"), "utf8");
const jobsSrc = fs.readFileSync(path.join(root, "api/jobs.js"), "utf8");
const handSrc = fs.readFileSync(path.join(root, "api/_handoff.js"), "utf8");
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

["function thenWho", "function thenDoes", "function thenPrompt", "function askGrokLabel", "function namedAskWho", "q-ai", "q-then-face", "Nothing sent alone", "function isPromptReply", "function promptHtml", "function replyOnCard"].forEach(function (bit) {
  if (needs.indexOf(bit) < 0) fail("desk-needs.js missing " + bit);
});
if (!/HOLD\. Nothing sent alone/.test(needs)) fail("next-line must stay HOLD. Nothing sent alone.");
if (/oauth|spacex|login\.x\.ai|custodial wallet|Collect charge/i.test(needs + deskAis)) {
  fail("named AI cards invented Grok OAuth / wallet / Collect charge");
}

["function cardOf", "ai-card", "On queue cards", "prompt", "function primary", "AIADeskAis"].forEach(function (bit) {
  if (deskAis.indexOf(bit) < 0) fail("desk-ais.js missing " + bit);
});
if (!/function stampDeskAi/.test(handSrc)) fail("_handoff.js must stamp does / prompt on deskAi");
if (handSrc.includes("Yes or No")) fail("_handoff still paints Yes or No as the rail");
if (!handSrc.includes("Owner taps Yes or Stop.") || !handSrc.includes("You tap Yes or Stop.")) {
  fail("_handoff Rail/Doer must keep Yes or Stop");
}
if (!/stampDeskAi/.test(jobsSrc) || !/applyDeskAiDraft/.test(jobsSrc)) fail("recommend must stamp the named desk AI");
if (!/promptSummary/.test(aisSrc) || !/prompt: prompt/.test(aisSrc)) fail("publicAi must expose prompt");
if (peopleJs.indexOf("On queue cards") < 0 || peopleJs.indexOf("desk AI") < 0) fail("People agent cards must show desk AI face");
if (!/deskAi: !!p\.deskAi/.test(peopleJs) || peopleJs.indexOf("if (p.does && !row.does)") < 0) {
  fail("groupPeople must keep deskAi / does / prompt on agent cards");
}
const adminSrc = fs.readFileSync(path.join(root, "api/admin.js"), "utf8");
if (!/jobCounts/.test(adminSrc) || /jobCounts, readBody/.test(adminSrc)) {
  fail("admin.js must import jobCounts from _desk, not missing _lib export");
}
const libSrc = fs.readFileSync(path.join(root, "api/_lib.js"), "utf8");
if (!/deskAi: !!p\.deskAi/.test(libSrc) || !/does: p\.does/.test(libSrc)) {
  fail("_lib.publicPerson must expose deskAi / does / prompt for People cards");
}
if (peopleHtml.indexOf("named desk AIs") < 0) fail("people.html must name desk AIs");
if (help.indexOf("does / prompt chip") < 0 && help.indexOf("does / prompt") < 0) fail("help#desk-cards must name the does / prompt chip");
if (yesNo.indexOf("check-desk-ai-cards.js") < 0) fail("ACCOUNT-YES-NO must record named AI cards");
if (drop.indexOf("Public drop never sees money, Stop, or People") < 0) fail("public Drop copy drifted");
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
if (typeof ctx.replyOnCard !== "function") fail("prompt reply must stay on window.replyOnCard");

const thenCard = ctx.card({
  id: "j-then",
  status: "waiting",
  title: "They clicked",
  why: "Lead from the lane",
  draft: "Ask who it is for and when. Do not send.",
  deskAi: { name: "James’s AI", role: "Doer", does: "Draft the lead packet", prompt: "Ask who it is for and when. Do not send." },
  next: "James’s AI drafted on the card. Human send HOLD.",
  assignee: "Pat"
}, false);
if (thenCard.indexOf("q-ai") < 0) fail("Then card must chip the named desk AI");
if (thenCard.indexOf("James") < 0) fail("Then card must name the desk AI");
if (thenCard.indexOf("Then draft") < 0) fail("Then card must still say Then draft");
if (thenCard.indexOf("Draft the lead packet") < 0) fail("Then card must show the short does chip");
if (thenCard.indexOf("Needs you") < 0) fail("decide card must still show Needs you");
if (thenCard.indexOf(">Yes<") < 0 || thenCard.indexOf(">Stop<") < 0 || thenCard.indexOf(">Kill<") < 0) {
  fail("Yes / Stop / Kill must stay");
}
const apiNeeds = ctx.card({
  id: "j-api-needs",
  status: "waiting",
  title: "They clicked",
  draft: "Ask who it is for.",
  decide: true,
  deskAi: { name: "James’s AI", does: "Draft the lead packet" },
  needs: [{ id: "yes", label: "Yes" }, { id: "stop", label: "Stop" }, { id: "cap", label: "Cap" }]
}, false);
if (apiNeeds.indexOf(">Kill<") < 0) fail("API needs rows must still show Kill for the owner");
if (thenCard.indexOf("q-prompt") < 0) fail("named AI decide card must keep prompt reply");
if (/On the Home desk/i.test(thenCard)) fail("Then card showed pack boilerplate");

const askNamed = ctx.card({
  id: "j-ask-ai",
  status: "waiting",
  title: "Missed call",
  kind: "call",
  outcome: "call",
  waitingOn: "info",
  why: "Need a number before this can go.",
  deskAi: { name: "James’s AI", does: "Ask who it is for" }
}, false);
if (askNamed.indexOf("Ask Grok · James") < 0 && askNamed.indexOf("Ask Grok") < 0) {
  fail("Ask Grok must stay, and name the AI when one is set");
}
if (askNamed.indexOf("James") < 0) fail("Needs you / Ask Grok card must name the desk AI");
if (/>Yes</.test(askNamed)) fail("missing-info card must not show Yes");

ctx.AIADeskAis = {
  rows: [{ name: "Shop Bot", does: "Qualify cards", prompt: "Who is it for?" }],
  primary: function () { return this.rows[0]; }
};
const grokNamed = ctx.card({
  id: "j-grok",
  status: "waiting",
  title: "Oak dresser"
}, false);
if (grokNamed.indexOf("Ask Grok") < 0) fail("Ask Grok must stay on a waiting card with no draft");
if (grokNamed.indexOf("Shop Bot") < 0) fail("Ask Grok must name the bound desk AI when one is set");

const xss = ctx.card({
  id: "j-xss",
  status: "waiting",
  title: "Need 2 < 3",
  draft: "Don't use <b>html</b>",
  deskAi: { name: "AI <bot>", does: "Draft <leads>", prompt: "Never use <script>" }
}, false);
if (xss.indexOf("AI <bot>") >= 0) fail("raw < in the AI name must not become markup");
if (xss.indexOf("AI &lt;bot&gt;") < 0) fail("AI name must stay text");
if (xss.indexOf("Draft &lt;leads&gt;") < 0) fail("does chip must stay text");
if (xss.indexOf("Never use &lt;script&gt;") < 0) fail("prompt chip must stay text");

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
if (!aisCtx.AIADeskAis || typeof aisCtx.AIADeskAis.paint !== "function") fail("desk-ais.js must set AIADeskAis.paint");
const host = { hidden: true, className: "item", innerHTML: "" };
aisCtx.document.getElementById = function (id) { return id === "desk-ais" ? host : (id === "aia-desk-ais-css" ? { id: id } : null); };
aisCtx.AIADeskAis.paint({
  ais: [{
    name: "James’s AI",
    aia: "james.aia",
    role: "Doer",
    does: "Draft the lead packet",
    prompt: "Ask who it is for and when. Do not send.",
    steps: ["qualify", "do"],
    never: ["send", "stop", "money", "mail", "yes", "kill"]
  }]
});
if (host.innerHTML.indexOf("ai-card") < 0) fail("desk-ais paint must emit ai-card");
if (host.innerHTML.indexOf("James") < 0) fail("bot card must name the AI");
if (host.innerHTML.indexOf("Draft the lead packet") < 0) fail("bot card must show does");
if (host.innerHTML.indexOf("Ask who it is for") < 0) fail("bot card must show prompt summary");
if (host.innerHTML.indexOf("On queue cards") < 0) fail("bot card must say how it shows on queue cards");
if (host.innerHTML.indexOf("Then draft") < 0) fail("bot card must name the queue Then face");

aisCtx.AIADeskAis.paint({
  ais: [{ name: "AI <bot>", does: "Draft <leads>", prompt: "Never <script>" }]
});
if (host.innerHTML.indexOf("AI <bot>") >= 0) fail("bot card raw < in name");
if (host.innerHTML.indexOf("AI &lt;bot&gt;") < 0) fail("bot card name must stay text");
if (host.innerHTML.indexOf("Draft &lt;leads&gt;") < 0) fail("bot card does must stay text");

async function apiPath() {
  const store = path.join(os.tmpdir(), "aia-desk-ai-cards-" + Date.now() + ".json");
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
  const slug = "ai-cards-desk";
  const pin = "4821";
  const desk = {
    slug: slug,
    name: "AI cards",
    biz: slug,
    pin: hashPin(pin),
    createdAt: new Date().toISOString(),
    people: [],
    rules: []
  };
  ensurePeople(desk);
  desk.people[0].name = "Pat";
  desk.people[0].pin = hashPin(pin);
  ais.attachAisToDesk(desk, [{
    name: "James’s AI",
    role: "Doer",
    does: "Draft the lead packet",
    prompt: "Ask who it is for and when. Do not send.",
    steps: ["qualify", "do"]
  }]);
  mem.workspaces.unshift(desk);
  const owner = { "x-workspace": slug, "x-pin": pin };

  const pub = ais.publicAi(desk.ais[0]);
  if (!pub || !pub.prompt || pub.prompt.indexOf("Ask who") < 0) fail("publicAi must expose prompt");
  if (!pub.promptSummary) fail("publicAi must expose promptSummary");
  if (!pub.face || pub.face.indexOf("Then draft") < 0) fail("publicAi must expose queue face");

  const cap = await call(jobsHandler, "POST", owner, {
    action: "capture",
    title: "Oak dresser",
    notes: "list it",
    from: "desk"
  });
  if (cap.statusCode !== 201 || !cap.body.job) fail("capture should 201, got " + cap.statusCode);
  const id = cap.body.job.id;
  const rec = await call(jobsHandler, "POST", owner, { action: "recommend", id: id, whoTapped: "Pat" });
  if (rec.statusCode !== 200 || !rec.body.ok) fail("recommend should 200, got " + rec.statusCode + " " + JSON.stringify(rec.body));
  const job = rec.body.job;
  if (!job.deskAi || !/James/.test(job.deskAi.name || "")) fail("Ask Grok recommend must stamp the named desk AI");
  if (!job.deskAi.does || job.deskAi.does.indexOf("lead packet") < 0) fail("stamped deskAi must carry does");
  if (job.status === "shipped" || job.charged === true) fail("recommend must not ship or charge");
  if (!(job.draft || (job.recs && job.recs.length))) fail("recommend must still leave a draft or recs");

  const bot = {
    id: "ai_login",
    name: "James’s AI",
    role: "agent",
    kind: "agent",
    deskAi: true,
    status: "approved",
    pin: hashPin("9999")
  };
  desk.people.push(bot);
  const aiYes = await call(jobsHandler, "POST", { "x-workspace": slug, "x-pin": "9999" }, {
    action: "ship",
    id: id,
    confirm: true,
    whoTapped: "James’s AI"
  });
  if (aiYes.statusCode !== 403) fail("desk AI still cannot Yes, got " + aiYes.statusCode);

  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
}

apiPath().then(function () {
  console.log("check-desk-ai-cards: ok");
}).catch(function (e) {
  console.error(e);
  process.exit(1);
});

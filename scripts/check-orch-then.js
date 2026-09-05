#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-orch-then-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

delete global.__aia;
delete global.__aiaHydrate;

const ais = require("../api/_ais");
const lib = require("../api/_lib");
const { qualifyJob } = require("../api/_engine");
const jobsHandler = require("../api/jobs");
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
async function call(handler, method, headers, body) {
  const res = mockRes();
  await handler({ method: method, headers: headers || {}, body: body || {}, query: {} }, res);
  return res;
}

const shop = {
  slug: "orch-desk",
  rules: [{
    text: "Click → James drafts HOLD.",
    when: "drop",
    contains: "click",
    then: "draft"
  }],
  ais: [],
  people: []
};
ais.attachAisToDesk(shop, [{
  name: "James’s AI",
  role: "Doer",
  does: "Draft the lead packet",
  prompt: "Ask who it is for and when. Do not send.",
  steps: ["qualify", "do"]
}]);

const job = qualifyJob({
  title: "They clicked",
  notes: "click from the lane",
  from: "drop",
  workspace: "orch-desk"
}, shop);

if (!job) fail("qualifyJob returned nothing");
else pass("qualifyJob ran");

if (!job.deskAi || !/James/.test(job.deskAi.name || "")) fail("Then draft must name the desk AI, got " + JSON.stringify(job.deskAi));
else pass("named desk AI on the card");

if (!/Ask who it is for and when/i.test(job.draft || "")) {
  fail("Then draft must use the named AI prompt, got " + JSON.stringify(job.draft));
} else pass("card draft is the named AI");

if (/On the Home desk/i.test(job.draft || "")) fail("generic pack brain must not win over Then draft");
else pass("generic pack brain did not replace Then");

if (!/HOLD/i.test(job.draft || "") && !/HOLD/i.test(job.next || "")) fail("Then draft must stay HOLD");
else pass("draft stays HOLD");

if (job.status === "shipped" || job.charged) fail("Then draft must not ship or charge");
else pass("nothing left the desk");

if (job.waitingOn !== "person" && job.waitingOn !== "owner") fail("Then draft must wait on a person, got " + job.waitingOn);
else pass("waiting on a person");

if (!/James/.test(job.next || "")) fail("next line should name the desk AI");
else pass("next names the desk AI");

const empty = {
  slug: "empty-orch",
  rules: [{ text: "Click → draft HOLD.", when: "drop", contains: "click", then: "draft" }],
  ais: [],
  people: []
};
const noAi = qualifyJob({ title: "They clicked", notes: "click from the lane", from: "drop", workspace: "empty-orch" }, empty);
if (!/HOLD/i.test(noAi.draft || "") && !/HOLD/i.test(noAi.next || "")) fail("Then draft without an AI must still HOLD");
else if (/On the Home desk/i.test(noAi.draft || "") && !/Desk AI draft/i.test(noAi.draft || "")) {
  fail("Then draft without an AI still showed only pack brain: " + noAi.draft);
} else pass("no named AI still Then-drafts HOLD");

const keep = qualifyJob({
  title: "They clicked",
  notes: "click from the lane",
  from: "drop",
  draft: "Owner already wrote this. Do not wipe.",
  workspace: "orch-desk"
}, shop);
if (!/Owner already wrote this/i.test(keep.draft || "")) fail("incoming Drop draft must stay");
else if (!/HOLD/i.test(keep.draft || "")) fail("incoming draft must get HOLD");
else pass("incoming draft kept + HOLD");

async function capturePath() {
  await ready();
  const slug = "drop-orch";
  const pin = "4821";
  const desk = {
    slug: slug,
    name: "Drop orch",
    biz: slug,
    pin: hashPin(pin),
    createdAt: new Date().toISOString(),
    people: [],
    rules: [{
      text: "Click → James drafts HOLD.",
      when: "drop",
      contains: "click",
      then: "draft"
    }]
  };
  ensurePeople(desk);
  ais.attachAisToDesk(desk, [{
    name: "James’s AI",
    role: "Doer",
    does: "Draft the lead packet",
    prompt: "Ask who it is for and when. Do not send.",
    steps: ["qualify", "do"]
  }]);
  mem.workspaces.unshift(desk);
  const cap = await call(jobsHandler, "POST", { "x-workspace": slug, "x-pin": pin }, {
    action: "capture",
    title: "They clicked",
    notes: "click from the lane",
    from: "drop"
  });
  const card = cap.body && cap.body.job;
  if (cap.statusCode !== 201 || !card) fail("Drop capture " + cap.statusCode + " " + JSON.stringify(cap.body));
  else pass("Drop capture 201");
  if (!card.deskAi || !/James/.test(card.deskAi.name || "")) fail("Drop Then draft missing named AI");
  else pass("Drop Then names the desk AI");
  if (!/Ask who it is for and when/i.test(card.draft || "")) fail("Drop Then draft is not the named AI: " + JSON.stringify(card.draft));
  else pass("Drop Then card is the named AI");
  if (/On the Home desk/i.test(card.draft || "")) fail("Drop Then still showed pack brain");
  else pass("Drop Then did not keep pack brain");
  if (card.status === "shipped" || card.charged) fail("Drop Then must not ship");
  else pass("Drop Then stays on the queue");
}

capturePath().then(function () {
  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-orch-then ok");
}).catch(function (e) {
  console.error(e);
  process.exit(1);
});

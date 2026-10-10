#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-ai-steps-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

delete global.__aia;
delete global.__aiaHydrate;

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

const aisSrc = fs.readFileSync(path.join(root, "api/_ais.js"), "utf8");
const grokSrc = fs.readFileSync(path.join(root, "api/_grok.js"), "utf8");
const packsSrc = fs.readFileSync(path.join(root, "api/_packs.js"), "utf8");

if (!/prompt:\s*clip\(raw\.prompt,\s*400\)/.test(aisSrc)) fail("normalizeAi prompt cap must stay 400");
else pass("normalizeAi prompt cap stays 400");
if (!/clip\(ai\.prompt,\s*400\)/.test(aisSrc)) fail("publicAi prompt cap must stay 400");
else pass("publicAi prompt cap stays 400");
if (aisSrc.indexOf("Collect stays HOLD") < 0) fail("_ais.js Collect HOLD wording changed");
else pass("_ais.js Collect HOLD wording stays");
if (grokSrc.indexOf("Collect stays HOLD") < 0) fail("_grok.js Collect HOLD wording changed");
else pass("_grok.js Collect HOLD wording stays");
if (packsSrc.indexOf("Steps must be a list of plain text.") < 0) fail("save-ai must refuse a bad steps list");
else pass("save-ai names the steps error");
if (packsSrc.indexOf("stepsCut:") < 0) fail("save-ai must report stepsCut");
else pass("save-ai reports stepsCut");

const ais = require("../api/_ais");
const grok = require("../api/_grok");
const lib = require("../api/_lib");
const packHandler = require("../api/_packs");
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

function reqOf(method, headers, body, query) {
  return { method: method, headers: headers || {}, body: body || {}, query: query || {} };
}

async function call(handler, method, headers, body, query) {
  const res = mockRes();
  await handler(reqOf(method, headers, body, query), res);
  return res;
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const KEYS = ["XAI_API_KEY", "GROK_API_KEY", "AIA_GROK_KEY"];

function stashKeys() {
  const prev = {};
  KEYS.forEach(function (k) { prev[k] = process.env[k]; delete process.env[k]; });
  return prev;
}

function restoreKeys(prev) {
  KEYS.forEach(function (k) {
    if (prev[k] == null) delete process.env[k];
    else process.env[k] = prev[k];
  });
}

async function main() {
  const sentence = ["Open the desk", "Draft the note", "Wait for Yes"];
  const round = ais.normalizeAi({ name: "Ada", steps: sentence }, "steps-desk");
  if (!round || !same(round.steps, sentence)) fail("steps must round-trip through normalizeAi, got " + JSON.stringify(round && round.steps));
  else pass("steps round-trip through normalizeAi");
  const pub = ais.publicAi(round);
  if (!pub || !same(pub.steps, sentence)) fail("publicAi must return the same steps, got " + JSON.stringify(pub && pub.steps));
  else pass("publicAi returns the same steps");

  const padded = ais.normalizeAi({ name: "Pad", steps: ["  hello  ", "next"] });
  if (!padded || !same(padded.steps, ["hello", "next"])) fail("steps must trim whitespace, got " + JSON.stringify(padded && padded.steps));
  else pass("steps trim whitespace");

  const bare = ais.normalizeAi({ name: "Bare" });
  if (!bare || !same(bare.steps, [])) fail("missing steps must be [], got " + JSON.stringify(bare && bare.steps));
  else pass("missing steps are []");

  const oldBad = [
    ["string", "qualify, follow"],
    ["object", { note: "old" }],
    ["number", 12],
    ["boolean", false],
    ["null", null]
  ];
  oldBad.forEach(function (pair) {
    const ai = ais.normalizeAi({ name: "Old " + pair[0], steps: pair[1] }, "steps-desk");
    const shown = ais.publicAi(ai);
    if (!ai || !same(ai.steps, [])) fail("normalizeAi " + pair[0] + " steps must be [], got " + JSON.stringify(ai && ai.steps));
    else if (!shown || !same(shown.steps, [])) fail("publicAi " + pair[0] + " steps must be [], got " + JSON.stringify(shown && shown.steps));
    else pass("normalizeAi " + pair[0] + " steps become []");
  });

  const mixed = ais.normalizeAi({ name: "Mixed", steps: ["keep", 1, null, { a: 1 }, false, "  also  "] });
  if (!mixed || !same(mixed.steps, ["keep", "also"])) fail("non-string steps must be dropped, got " + JSON.stringify(mixed && mixed.steps));
  else pass("non-string steps are dropped");

  const prose = ais.normalizeAi({ name: "Prose", steps: ["Draft the note for the lane", "Queue it for Yes"] });
  if (!prose || !ais.aiMayDraft(prose, "qualify") || ais.aiMayDraft(prose, "collect")) {
    fail("text steps must not become the draft allow list");
  } else pass("text steps are not the draft allow list");

  const exact = [];
  for (let i = 0; i < 50; i++) exact.push("e" + i);
  const exactAi = ais.normalizeAi({ name: "Exact", steps: exact });
  if (!exactAi || !same(exactAi.steps, exact)) fail("50 steps must stay whole");
  else pass("50 steps stay whole");
  const chars = "C".repeat(300);
  const charsAi = ais.normalizeAi({ name: "Chars", steps: [chars] });
  if (!charsAi || charsAi.steps[0] !== chars) fail("300-character step must stay whole");
  else pass("300-character step stays whole");

  await ready();
  const slug = "steps-desk";
  const pin = "4821";
  const shop = {
    slug: slug,
    name: "Ada",
    biz: slug,
    pin: hashPin(pin),
    createdAt: new Date().toISOString(),
    people: [],
    rules: []
  };
  ensurePeople(shop);
  if (!Array.isArray(mem.workspaces)) mem.workspaces = [];
  mem.workspaces.unshift(shop);
  const owner = { "x-workspace": slug, "x-pin": pin };

  const clean = await call(packHandler, "POST", owner, {
    action: "save-ai",
    name: "Steps AI",
    role: "Doer",
    does: "Draft on this desk",
    prompt: "P".repeat(600),
    steps: sentence
  });
  const saved = clean.body && clean.body.ai;
  const stored = (shop.ais || []).find(function (a) { return a && a.name === "Steps AI"; });
  if (clean.statusCode !== 200 || !clean.body || !clean.body.ok || !saved || !stored) {
    fail("save-ai " + clean.statusCode + " " + JSON.stringify(clean.body && clean.body.error));
  } else pass("save-ai binds Steps AI");
  if (!saved || !same(saved.steps, sentence) || !same(stored.steps, sentence)) {
    fail("save-ai must keep the steps, got " + JSON.stringify(saved && saved.steps));
  } else pass("save-ai keeps the steps");
  if (!clean.body || clean.body.stepsCut !== null) fail("uncut steps must report stepsCut null, got " + JSON.stringify(clean.body && clean.body.stepsCut));
  else pass("uncut steps report stepsCut null");
  if (!saved || saved.prompt !== "P".repeat(400) || saved.prompt.length !== 400) {
    fail("save-ai prompt must stay capped at 400, got " + (saved && saved.prompt && saved.prompt.length));
  } else pass("save-ai prompt stays capped at 400");
  if (clean.body && clean.body.charged !== false) fail("save-ai must not charge");
  else pass("save-ai does not charge");

  const many = [];
  for (let n = 0; n < 55; n++) many.push("step " + n);
  const capped = await call(packHandler, "POST", owner, {
    action: "save-ai",
    name: "Capped AI",
    role: "Doer",
    does: "Draft on this desk",
    steps: many
  });
  const cappedAi = capped.body && capped.body.ai;
  const cappedCut = capped.body && capped.body.stepsCut;
  const wantKept = many.slice(0, 50);
  if (capped.statusCode !== 200 || !cappedAi || !same(cappedAi.steps, wantKept)) {
    fail("save-ai must keep the first 50 steps, got " + (cappedAi && cappedAi.steps && cappedAi.steps.length));
  } else pass("save-ai keeps the first 50 steps");
  if (!cappedCut || cappedCut.kept !== 50 || cappedCut.dropped !== 5 || cappedCut.trimmed !== 0) {
    fail("50-step cap must report stepsCut, got " + JSON.stringify(cappedCut));
  } else pass("50-step cap reports stepsCut");

  const long = "L".repeat(300) + "TAIL";
  const trimmed = await call(packHandler, "POST", owner, {
    action: "save-ai",
    name: "Trim AI",
    role: "Doer",
    does: "Draft on this desk",
    steps: [long, "short"]
  });
  const trimAi = trimmed.body && trimmed.body.ai;
  const trimCut = trimmed.body && trimmed.body.stepsCut;
  if (!trimAi || trimAi.steps.length !== 2 || trimAi.steps[0] !== long.slice(0, 300) || trimAi.steps[0].indexOf("TAIL") >= 0 || trimAi.steps[1] !== "short") {
    fail("save-ai must cut a step to 300, got " + JSON.stringify(trimAi && trimAi.steps && trimAi.steps[0] && trimAi.steps[0].length));
  } else pass("save-ai cuts a step to 300");
  if (!trimCut || trimCut.kept !== 2 || trimCut.dropped !== 0 || trimCut.trimmed !== 1) {
    fail("300-character cap must report stepsCut, got " + JSON.stringify(trimCut));
  } else pass("300-character cap reports stepsCut");

  const emptied = await call(packHandler, "POST", owner, {
    action: "save-ai",
    name: "Empty AI",
    role: "Doer",
    does: "Draft on this desk",
    steps: ["keep", "   ", "", "  next  "]
  });
  const emptyAi = emptied.body && emptied.body.ai;
  const emptyCut = emptied.body && emptied.body.stepsCut;
  if (!emptyAi || !same(emptyAi.steps, ["keep", "next"])) {
    fail("save-ai must drop empty steps, got " + JSON.stringify(emptyAi && emptyAi.steps));
  } else pass("save-ai drops empty steps");
  if (!emptyCut || emptyCut.kept !== 2 || emptyCut.dropped !== 2 || emptyCut.trimmed !== 0) {
    fail("empty steps must count as dropped, got " + JSON.stringify(emptyCut));
  } else pass("empty steps count as dropped");

  const beforeAis = JSON.stringify(shop.ais || []);
  const requestBad = [
    ["object", { keep: "off the desk" }],
    ["string", "qualify, follow"],
    ["number", 0],
    ["mixed", ["keep", 1]]
  ];
  for (let i = 0; i < requestBad.length; i++) {
    const kind = requestBad[i][0];
    const rejected = await call(packHandler, "POST", owner, {
      action: "save-ai",
      name: "Bad " + kind,
      role: "Doer",
      does: "Draft on this desk",
      steps: requestBad[i][1]
    });
    const err = rejected.body && rejected.body.error;
    const names = (shop.ais || []).map(function (a) { return a && a.name; });
    if (rejected.statusCode !== 400) fail("save-ai " + kind + " steps must 400, got " + rejected.statusCode);
    else if (err !== "Steps must be a list of plain text.") fail("save-ai " + kind + " steps message, got " + JSON.stringify(rejected.body));
    else if (names.indexOf("Bad " + kind) >= 0) fail("save-ai " + kind + " steps must not store an AI");
    else pass("save-ai rejects " + kind + " steps");
  }
  if (JSON.stringify(shop.ais || []) !== beforeAis) fail("save-ai bad steps must save nothing");
  else pass("save-ai bad steps save nothing");
  const still = (shop.ais || []).find(function (a) { return a && a.name === "Steps AI"; });
  if (!still || !same(still.steps, sentence)) fail("rejected save-ai must leave stored steps alone");
  else pass("rejected save-ai leaves stored steps alone");

  const keys = stashKeys();
  mem.connections = [];
  try {
    const token = ["STEPS-KEEP-9f3a draft the note", "Queue it"];
    const draft = await grok.studioDraft("Name a lane pack", slug, { kind: "pack", steps: token });
    if (!draft || !same(draft.steps, token)) fail("studioDraft must pass steps through, got " + JSON.stringify(draft && draft.steps));
    else pass("studioDraft passes steps through");

    const longSteps = [];
    for (let s = 0; s < 60; s++) longSteps.push(s === 0 ? "S".repeat(340) : "s" + s);
    const cappedDraft = await grok.studioDraft("Name a lane pack", slug, { steps: longSteps });
    if (!cappedDraft || !cappedDraft.steps || cappedDraft.steps.length !== 50 || cappedDraft.steps[0] !== "S".repeat(300)) {
      fail("studioDraft must cap steps at 50 and 300");
    } else pass("studioDraft caps steps at 50 and 300");

    const missing = await grok.studioDraft("Name a lane pack", slug, { kind: "pack" });
    if (!missing || !same(missing.steps, [])) fail("studioDraft missing steps must be [], got " + JSON.stringify(missing && missing.steps));
    else pass("studioDraft missing steps are []");

    const notArray = await grok.studioDraft("Name a lane pack", slug, { steps: "not a list" });
    if (!notArray || !same(notArray.steps, [])) fail("studioDraft non-array steps must be []");
    else pass("studioDraft non-array steps are []");

    process.env.XAI_API_KEY = "steps-check-not-a-real-key";
    const prevFetch = global.fetch;
    let sent = "";
    global.fetch = async function (_url, init) {
      sent = (init && init.body) || "";
      return {
        ok: true,
        status: 200,
        json: async function () {
          return { choices: [{ message: { content: "{\"name\":\"Lane\",\"does\":\"Draft notes\",\"ask\":0}" } }] };
        }
      };
    };
    try {
      const live = await grok.studioDraft("Name a lane pack", slug, { kind: "pack", steps: token });
      if (!live || !live.ok) fail("stubbed studioDraft should return the draft, got " + JSON.stringify(live && { ok: live.ok, reason: live.reason }));
      else if (!same(live.steps, token)) fail("studioDraft success return must pass steps through");
      else pass("studioDraft success return passes steps through");
      if (String(sent).indexOf("STEPS-KEEP-9f3a") >= 0) fail("studioDraft must not send steps to the model");
      else pass("studioDraft does not send steps to the model");
    } finally {
      global.fetch = prevFetch;
      delete process.env.XAI_API_KEY;
    }
  } finally {
    restoreKeys(keys);
  }

  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-ai-steps ok");
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});

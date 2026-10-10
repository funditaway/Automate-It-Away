#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-ai-plan-check-" + Date.now() + ".json");
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
if (!/let steps = parseSteps\(raw\.steps \|\| raw\.allow\)/.test(aisSrc)) fail("steps must stay the draft allow-list");
else pass("steps stay the draft allow-list");
if (!/steps: steps,\n\s*allow: steps\.slice\(\)/.test(aisSrc)) fail("allow must stay a copy of steps");
else pass("allow stays a copy of steps");
if (aisSrc.indexOf("Collect stays HOLD") < 0) fail("_ais.js Collect HOLD wording changed");
else pass("_ais.js Collect HOLD wording stays");
if (grokSrc.indexOf("Collect stays HOLD") < 0) fail("_grok.js Collect HOLD wording changed");
else pass("_grok.js Collect HOLD wording stays");
if (packsSrc.indexOf("Steps must be a list of plain text.") < 0) fail("save-ai must refuse a bad plan");
else pass("save-ai names the plan error");
if (packsSrc.indexOf("planCut:") < 0) fail("save-ai must report planCut");
else pass("save-ai reports planCut");

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
  const round = ais.normalizeAi({ name: "Ada", plan: sentence, steps: "qualify, do, follow" }, "plan-desk");
  if (!round || !same(round.plan, sentence)) fail("plan must round-trip through normalizeAi, got " + JSON.stringify(round && round.plan));
  else pass("plan round-trips through normalizeAi");
  const pub = ais.publicAi(round);
  if (!pub || !same(pub.plan, sentence)) fail("publicAi must return the same plan, got " + JSON.stringify(pub && pub.plan));
  else pass("publicAi returns the same plan");
  const allowWant = ["qualify", "do", "follow"];
  if (!round || !same(round.steps, allowWant) || !same(round.allow, allowWant)) {
    fail("a plan must not change the steps allow-list, got " + JSON.stringify(round && { steps: round.steps, allow: round.allow }));
  } else pass("plan does not change the steps allow-list");

  const padded = ais.normalizeAi({ name: "Pad", plan: ["  hello  ", "next"] });
  if (!padded || !same(padded.plan, ["hello", "next"])) fail("plan must trim whitespace, got " + JSON.stringify(padded && padded.plan));
  else pass("plan trims whitespace");

  const bare = ais.normalizeAi({ name: "Bare" });
  if (!bare || !same(bare.plan, [])) fail("missing plan must be [], got " + JSON.stringify(bare && bare.plan));
  else pass("missing plan is []");

  const oldBad = [
    ["string", "qualify, follow"],
    ["object", { note: "old" }],
    ["number", 12],
    ["boolean", false],
    ["null", null]
  ];
  oldBad.forEach(function (pair) {
    const ai = ais.normalizeAi({ name: "Old " + pair[0], plan: pair[1] }, "plan-desk");
    const shown = ais.publicAi(ai);
    if (!ai || !same(ai.plan, [])) fail("normalizeAi " + pair[0] + " plan must be [], got " + JSON.stringify(ai && ai.plan));
    else if (!shown || !same(shown.plan, [])) fail("publicAi " + pair[0] + " plan must be [], got " + JSON.stringify(shown && shown.plan));
    else pass("normalizeAi " + pair[0] + " plan becomes []");
  });

  const mixed = ais.normalizeAi({ name: "Mixed", plan: ["keep", 1, null, { a: 1 }, false, "  also  "] });
  if (!mixed || !same(mixed.plan, ["keep", "also"])) fail("non-string plan items must be dropped, got " + JSON.stringify(mixed && mixed.plan));
  else pass("non-string plan items are dropped");

  const prose = ais.normalizeAi({ name: "Prose", plan: ["Draft the note for the lane", "Queue it for Yes"], steps: ["qualify", "do", "follow", "collect"] });
  if (!prose || prose.steps.indexOf("collect") >= 0 || prose.allow.indexOf("collect") >= 0) fail("collect must stay off the allow-list");
  else if (!ais.aiMayDraft(prose, "qualify") || ais.aiMayDraft(prose, "collect")) fail("plan must not become the draft allow-list");
  else pass("plan is not the draft allow-list");

  const exact = [];
  for (let i = 0; i < 50; i++) exact.push("e" + i);
  const exactAi = ais.normalizeAi({ name: "Exact", plan: exact });
  if (!exactAi || !same(exactAi.plan, exact)) fail("50 plan lines must stay whole");
  else pass("50 plan lines stay whole");
  const chars = "C".repeat(300);
  const charsAi = ais.normalizeAi({ name: "Chars", plan: [chars] });
  if (!charsAi || charsAi.plan[0] !== chars) fail("300-character plan line must stay whole");
  else pass("300-character plan line stays whole");

  await ready();
  const slug = "plan-desk";
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
    name: "Plan AI",
    role: "Doer",
    does: "Draft on this desk",
    prompt: "P".repeat(600),
    steps: "qualify, do, follow",
    plan: sentence
  });
  const saved = clean.body && clean.body.ai;
  const stored = (shop.ais || []).find(function (a) { return a && a.name === "Plan AI"; });
  if (clean.statusCode !== 200 || !clean.body || !clean.body.ok || !saved || !stored) {
    fail("save-ai " + clean.statusCode + " " + JSON.stringify(clean.body && clean.body.error));
  } else pass("save-ai binds Plan AI");
  if (!saved || !same(saved.plan, sentence) || !same(stored.plan, sentence)) {
    fail("save-ai must keep the plan, got " + JSON.stringify(saved && saved.plan));
  } else pass("save-ai keeps the plan");
  if (!clean.body || clean.body.planCut !== null) fail("uncut plan must report planCut null, got " + JSON.stringify(clean.body && clean.body.planCut));
  else pass("uncut plan reports planCut null");
  if (!saved || !same(saved.steps, allowWant) || !same(saved.allow, allowWant) || !same(stored.steps, allowWant) || !same(stored.allow, allowWant)) {
    fail("string steps must keep the allow-list, got " + JSON.stringify(saved && { steps: saved.steps, allow: saved.allow }));
  } else pass("string steps keep the allow-list");
  if (!saved || saved.prompt !== "P".repeat(400) || saved.prompt.length !== 400) {
    fail("save-ai prompt must stay capped at 400, got " + (saved && saved.prompt && saved.prompt.length));
  } else pass("save-ai prompt stays capped at 400");
  if (clean.body && clean.body.charged !== false) fail("save-ai must not charge");
  else pass("save-ai does not charge");

  const legacy = await call(packHandler, "POST", owner, {
    action: "save-ai",
    name: "Legacy Steps",
    role: "Doer",
    does: "Draft on this desk",
    steps: "qualify, do, follow"
  });
  const legacyAi = legacy.body && legacy.body.ai;
  const legacyStored = (shop.ais || []).find(function (a) { return a && a.name === "Legacy Steps"; });
  if (legacy.statusCode !== 200 || !legacy.body || !legacy.body.ok || !legacyAi) {
    fail("old-style steps string must still save, got " + legacy.statusCode + " " + JSON.stringify(legacy.body && legacy.body.error));
  } else if (!same(legacyAi.steps, allowWant) || !same(legacyAi.allow, allowWant) || !legacyStored || !same(legacyStored.steps, allowWant) || !same(legacyStored.allow, allowWant)) {
    fail("old-style steps string allow-list changed, got " + JSON.stringify(legacyAi && { steps: legacyAi.steps, allow: legacyAi.allow }));
  } else if (!same(legacyAi.plan, []) || legacy.body.planCut !== null) {
    fail("old-style steps string must leave plan empty, got " + JSON.stringify(legacyAi && legacyAi.plan));
  } else pass("old-style steps string still saves the same allow-list");

  const many = [];
  for (let n = 0; n < 55; n++) many.push("step " + n);
  const capped = await call(packHandler, "POST", owner, {
    action: "save-ai",
    name: "Capped AI",
    role: "Doer",
    does: "Draft on this desk",
    steps: "qualify, do, follow",
    plan: many
  });
  const cappedAi = capped.body && capped.body.ai;
  const cappedCut = capped.body && capped.body.planCut;
  const wantKept = many.slice(0, 50);
  if (capped.statusCode !== 200 || !cappedAi || !same(cappedAi.plan, wantKept)) {
    fail("save-ai must keep the first 50 plan lines, got " + (cappedAi && cappedAi.plan && cappedAi.plan.length));
  } else pass("save-ai keeps the first 50 plan lines");
  if (!cappedCut || cappedCut.kept !== 50 || cappedCut.dropped !== 5 || cappedCut.trimmed !== 0) {
    fail("50-line cap must report planCut, got " + JSON.stringify(cappedCut));
  } else pass("50-line cap reports planCut");

  const long = "L".repeat(300) + "TAIL";
  const trimmed = await call(packHandler, "POST", owner, {
    action: "save-ai",
    name: "Trim AI",
    role: "Doer",
    does: "Draft on this desk",
    plan: [long, "short"]
  });
  const trimAi = trimmed.body && trimmed.body.ai;
  const trimCut = trimmed.body && trimmed.body.planCut;
  if (!trimAi || trimAi.plan.length !== 2 || trimAi.plan[0] !== long.slice(0, 300) || trimAi.plan[0].indexOf("TAIL") >= 0 || trimAi.plan[1] !== "short") {
    fail("save-ai must cut a plan line to 300, got " + JSON.stringify(trimAi && trimAi.plan && trimAi.plan[0] && trimAi.plan[0].length));
  } else pass("save-ai cuts a plan line to 300");
  if (!trimCut || trimCut.kept !== 2 || trimCut.dropped !== 0 || trimCut.trimmed !== 1) {
    fail("300-character cap must report planCut, got " + JSON.stringify(trimCut));
  } else pass("300-character cap reports planCut");

  const emptied = await call(packHandler, "POST", owner, {
    action: "save-ai",
    name: "Empty AI",
    role: "Doer",
    does: "Draft on this desk",
    plan: ["keep", "   ", "", "  next  "]
  });
  const emptyAi = emptied.body && emptied.body.ai;
  const emptyCut = emptied.body && emptied.body.planCut;
  if (!emptyAi || !same(emptyAi.plan, ["keep", "next"])) {
    fail("save-ai must drop empty plan lines, got " + JSON.stringify(emptyAi && emptyAi.plan));
  } else pass("save-ai drops empty plan lines");
  if (!emptyCut || emptyCut.kept !== 2 || emptyCut.dropped !== 2 || emptyCut.trimmed !== 0) {
    fail("empty plan lines must count as dropped, got " + JSON.stringify(emptyCut));
  } else pass("empty plan lines count as dropped");

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
      steps: "qualify, do, follow",
      plan: requestBad[i][1]
    });
    const err = rejected.body && rejected.body.error;
    const names = (shop.ais || []).map(function (a) { return a && a.name; });
    if (rejected.statusCode !== 400) fail("save-ai " + kind + " plan must 400, got " + rejected.statusCode);
    else if (err !== "Steps must be a list of plain text.") fail("save-ai " + kind + " plan message, got " + JSON.stringify(rejected.body));
    else if (names.indexOf("Bad " + kind) >= 0) fail("save-ai " + kind + " plan must not store an AI");
    else pass("save-ai rejects " + kind + " plan");
  }
  if (JSON.stringify(shop.ais || []) !== beforeAis) fail("save-ai bad plan must save nothing");
  else pass("save-ai bad plan saves nothing");
  const still = (shop.ais || []).find(function (a) { return a && a.name === "Plan AI"; });
  if (!still || !same(still.plan, sentence) || !same(still.steps, allowWant)) fail("rejected save-ai must leave stored plan and steps alone");
  else pass("rejected save-ai leaves stored plan and steps alone");

  const keys = stashKeys();
  mem.connections = [];
  try {
    const token = ["PLAN-KEEP-9f3a draft the note", "Queue it"];
    const draft = await grok.studioDraft("Name a lane pack", slug, { kind: "pack", plan: token });
    if (!draft || !same(draft.plan, token)) fail("studioDraft must pass plan through, got " + JSON.stringify(draft && draft.plan));
    else pass("studioDraft passes plan through");

    const longPlan = [];
    for (let s = 0; s < 60; s++) longPlan.push(s === 0 ? "S".repeat(340) : "s" + s);
    const cappedDraft = await grok.studioDraft("Name a lane pack", slug, { plan: longPlan });
    if (!cappedDraft || !cappedDraft.plan || cappedDraft.plan.length !== 50 || cappedDraft.plan[0] !== "S".repeat(300)) {
      fail("studioDraft must cap plan at 50 and 300");
    } else pass("studioDraft caps plan at 50 and 300");

    const missing = await grok.studioDraft("Name a lane pack", slug, { kind: "pack" });
    if (!missing || !same(missing.plan, [])) fail("studioDraft missing plan must be [], got " + JSON.stringify(missing && missing.plan));
    else pass("studioDraft missing plan is []");

    const notArray = await grok.studioDraft("Name a lane pack", slug, { plan: "not a list" });
    if (!notArray || !same(notArray.plan, [])) fail("studioDraft non-array plan must be []");
    else pass("studioDraft non-array plan is []");

    process.env.XAI_API_KEY = "plan-check-not-a-real-key";
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
      const live = await grok.studioDraft("Name a lane pack", slug, { kind: "pack", plan: token });
      if (!live || !live.ok) fail("stubbed studioDraft should return the draft, got " + JSON.stringify(live && { ok: live.ok, reason: live.reason }));
      else if (!same(live.plan, token)) fail("studioDraft success return must pass plan through");
      else pass("studioDraft success return passes plan through");
      if (String(sent).indexOf("PLAN-KEEP-9f3a") >= 0) fail("studioDraft must not send plan to the model");
      else pass("studioDraft does not send plan to the model");
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
  console.log("check-ai-plan ok");
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});

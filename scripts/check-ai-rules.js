#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-ai-rules-check-" + Date.now() + ".json");
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
if (!/rules:\s*rulesText\(raw\.rules\)/.test(aisSrc)) fail("normalizeAi must store rules");
else pass("normalizeAi stores rules");
if (!/rules:\s*rulesText\(ai\.rules\)/.test(aisSrc)) fail("publicAi must return rules");
else pass("publicAi returns rules");
if (/rules:\s*clip\(/.test(aisSrc)) fail("rules must not use the prompt clip");
else pass("rules are not clipped like the prompt");
if (aisSrc.indexOf("Collect stays HOLD") < 0) fail("_ais.js Collect HOLD wording changed");
else pass("_ais.js Collect HOLD wording stays");
if (grokSrc.indexOf("Collect stays HOLD") < 0) fail("_grok.js Collect HOLD wording changed");
else pass("_grok.js Collect HOLD wording stays");
if (packsSrc.indexOf('action === "save-ai"') < 0) fail("save-ai action missing");
else pass("save-ai action stays");

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
  const sentence = "Stay on this desk. Draft only. Humans decide.";
  const round = ais.normalizeAi({ name: "Ada", rules: sentence }, "rules-desk");
  if (!round || round.rules !== sentence) fail("rules must round-trip through normalizeAi");
  else pass("rules round-trip through normalizeAi");
  const pub = ais.publicAi(round);
  if (!pub || pub.rules !== sentence) fail("publicAi must return the same rules text");
  else pass("publicAi returns the same rules text");

  const spaced = " " + "k".repeat(20) + " ";
  const spaceAi = ais.normalizeAi({ name: "Spaced", rules: spaced });
  if (!spaceAi || spaceAi.rules !== spaced) fail("rules under 1000 must pass through unchanged");
  else pass("rules under 1000 pass through unchanged");

  const exact = "E".repeat(1000);
  const exactAi = ais.normalizeAi({ name: "Exact", rules: exact });
  if (!exactAi || exactAi.rules !== exact || exactAi.rules.length !== 1000) fail("1000-char rules must stay whole");
  else pass("1000-char rules stay whole");

  const long = "L".repeat(1000) + "TAIL";
  let threw = false;
  let capped = null;
  try { capped = ais.normalizeAi({ name: "Long", rules: long }); }
  catch (e) { threw = true; }
  if (threw || !capped) fail("over-long rules must not error");
  else if (capped.rules !== long.slice(0, 1000) || capped.rules.length !== 1000 || capped.rules.indexOf("TAIL") >= 0) {
    fail("rules must cap at 1000, got " + (capped && capped.rules && capped.rules.length));
  } else pass("rules cap at 1000 with no error");

  const bare = ais.normalizeAi({ name: "Bare" });
  if (!bare || bare.rules !== "") fail("missing rules must return empty string");
  else pass("missing rules return empty string");
  const nil = ais.normalizeAi({ name: "Nil", rules: null });
  if (!nil || nil.rules !== "") fail("null rules must return empty string");
  else pass("null rules return empty string");
  const missingField = ais.normalizeAi({ name: "Undef", rules: undefined });
  if (!missingField || missingField.rules !== "") fail("undefined rules must return empty string");
  else pass("undefined rules return empty string");

  const storedBad = [
    ["object", { note: "old" }],
    ["array", ["stay", "local"]],
    ["number", 12],
    ["boolean", false]
  ];
  storedBad.forEach(function (pair) {
    const kind = pair[0];
    const ai = ais.normalizeAi({ name: "Old " + kind, rules: pair[1] }, "rules-desk");
    const shown = ais.publicAi(ai);
    const dumped = JSON.stringify(ai && ai.rules);
    if (!ai || ai.rules !== "" || dumped.indexOf("[object Object]") >= 0) {
      fail("normalizeAi " + kind + " rules must be empty string, got " + dumped);
    } else if (!shown || shown.rules !== "") {
      fail("publicAi " + kind + " rules must be empty string, got " + JSON.stringify(shown && shown.rules));
    } else pass("normalizeAi " + kind + " rules become empty string");
  });

  await ready();
  const slug = "rules-desk";
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

  const rules900 = "R".repeat(900);
  const promptIn = "P".repeat(600);
  const save = await call(packHandler, "POST", { "x-workspace": slug, "x-pin": pin }, {
    action: "save-ai",
    name: "Rules AI",
    role: "Doer",
    does: "Draft on this desk",
    prompt: promptIn,
    rules: rules900,
    steps: ["qualify", "follow"]
  });
  const saved = save.body && save.body.ai;
  const listed = ((save.body && save.body.ais) || []).find(function (a) { return a && a.name === "Rules AI"; });
  const stored = (shop.ais || []).find(function (a) { return a && a.name === "Rules AI"; });
  if (save.statusCode !== 200 || !save.body || !save.body.ok || !saved || !listed || !stored) {
    fail("save-ai " + save.statusCode + " " + JSON.stringify(save.body && save.body.error));
  } else pass("save-ai binds Rules AI");
  if (!saved || saved.rules !== rules900 || saved.rules.length !== 900) {
    fail("save-ai response must keep 900-char rules whole, got " + (saved && saved.rules && saved.rules.length));
  } else pass("save-ai response keeps 900-char rules whole");
  if (!listed || listed.rules !== rules900) fail("save-ai ais list must keep 900-char rules whole");
  else pass("save-ai ais list keeps 900-char rules whole");
  if (!stored || stored.rules !== rules900) fail("stored desk AI must keep 900-char rules whole");
  else pass("stored desk AI keeps 900-char rules whole");
  if (saved && saved.rules === rules900.slice(0, 400)) fail("save-ai cut rules at 400 like the prompt");
  else pass("save-ai does not cut rules at 400");
  if (!saved || saved.prompt !== promptIn.slice(0, 400) || saved.prompt.length !== 400) {
    fail("save-ai prompt must stay capped at 400, got " + (saved && saved.prompt && saved.prompt.length));
  } else pass("save-ai prompt stays capped at 400");
  if (save.body && save.body.charged !== false) fail("save-ai must not charge");
  else pass("save-ai does not charge");

  const beforeAis = JSON.stringify(shop.ais || []);
  const requestBad = [
    ["object", { keep: "off the desk" }],
    ["array", ["no", "list"]],
    ["number", 0],
    ["boolean", true]
  ];
  for (let i = 0; i < requestBad.length; i++) {
    const kind = requestBad[i][0];
    const rejected = await call(packHandler, "POST", { "x-workspace": slug, "x-pin": pin }, {
      action: "save-ai",
      name: "Bad " + kind,
      role: "Doer",
      does: "Draft on this desk",
      rules: requestBad[i][1],
      steps: ["qualify"]
    });
    const err = rejected.body && rejected.body.error;
    const names = (shop.ais || []).map(function (a) { return a && a.name; });
    if (rejected.statusCode !== 400) fail("save-ai " + kind + " rules must 400, got " + rejected.statusCode);
    else if (err !== "Rules must be plain text.") fail("save-ai " + kind + " rules message, got " + JSON.stringify(rejected.body));
    else if (names.indexOf("Bad " + kind) >= 0) fail("save-ai " + kind + " rules must not store an AI");
    else pass("save-ai rejects " + kind + " rules");
  }
  const nested = await call(packHandler, "POST", { "x-workspace": slug, "x-pin": pin }, {
    action: "save-ai",
    ai: { name: "Nested Bad", role: "Doer", does: "Draft on this desk", rules: { nested: true }, steps: ["qualify"] }
  });
  if (nested.statusCode !== 400 || !nested.body || nested.body.error !== "Rules must be plain text.") {
    fail("save-ai nested object rules must 400, got " + nested.statusCode + " " + JSON.stringify(nested.body));
  } else if ((shop.ais || []).some(function (a) { return a && a.name === "Nested Bad"; })) {
    fail("save-ai nested object rules must not store an AI");
  } else pass("save-ai rejects nested object rules");
  if (JSON.stringify(shop.ais || []) !== beforeAis) fail("save-ai non-string rules must save nothing");
  else pass("save-ai non-string rules save nothing");
  const still = (shop.ais || []).find(function (a) { return a && a.name === "Rules AI"; });
  if (!still || still.rules !== rules900) fail("rejected save-ai must leave stored rules alone");
  else pass("rejected save-ai leaves stored rules alone");

  const nullSave = await call(packHandler, "POST", { "x-workspace": slug, "x-pin": pin }, {
    action: "save-ai",
    name: "Null Rules",
    role: "Doer",
    does: "Draft on this desk",
    rules: null,
    steps: ["qualify"]
  });
  const nullAi = nullSave.body && nullSave.body.ai;
  const nullStored = (shop.ais || []).find(function (a) { return a && a.name === "Null Rules"; });
  if (nullSave.statusCode !== 200 || !nullSave.body || !nullSave.body.ok) {
    fail("save-ai null rules must be allowed, got " + nullSave.statusCode + " " + JSON.stringify(nullSave.body && nullSave.body.error));
  } else if (!nullAi || nullAi.rules !== "" || !nullStored || nullStored.rules !== "") {
    fail("save-ai null rules must store empty string, got " + JSON.stringify(nullAi && nullAi.rules));
  } else pass("save-ai null rules store empty string");

  const keys = stashKeys();
  mem.connections = [];
  try {
    const token = " stay local. RULES-KEEP-9f3a ";
    const draft = await grok.studioDraft("Name a lane pack", slug, { kind: "pack", rules: token });
    if (!draft || draft.rules !== token) fail("studioDraft must pass rules through unchanged");
    else pass("studioDraft passes rules through unchanged");

    const longRules = "S".repeat(1400);
    const cappedDraft = await grok.studioDraft("Name a lane pack", slug, { rules: longRules });
    if (!cappedDraft || cappedDraft.rules !== longRules.slice(0, 1000) || cappedDraft.rules.length !== 1000) {
      fail("studioDraft must cap rules at 1000");
    } else pass("studioDraft caps rules at 1000");

    const missing = await grok.studioDraft("Name a lane pack", slug, { kind: "pack" });
    if (!missing || missing.rules !== "") fail("studioDraft missing rules must return empty string");
    else pass("studioDraft missing rules return empty string");

    const draftBad = [
      ["object", { note: "skip" }],
      ["array", ["skip"]],
      ["number", 3],
      ["boolean", false]
    ];
    for (let d = 0; d < draftBad.length; d++) {
      const kind = draftBad[d][0];
      const drafted = await grok.studioDraft("Name a lane pack", slug, { kind: "pack", rules: draftBad[d][1] });
      if (!drafted || drafted.rules !== "" || String(drafted.rules).indexOf("[object Object]") >= 0) {
        fail("studioDraft " + kind + " rules must be empty string, got " + JSON.stringify(drafted && drafted.rules));
      } else pass("studioDraft " + kind + " rules become empty string");
    }

    process.env.XAI_API_KEY = "rules-check-not-a-real-key";
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
      const live = await grok.studioDraft("Name a lane pack", slug, { kind: "pack", rules: token });
      if (!live || !live.ok) fail("stubbed studioDraft should return the draft, got " + JSON.stringify(live && { ok: live.ok, reason: live.reason }));
      else if (live.rules !== token) fail("studioDraft success return must pass rules through");
      else pass("studioDraft success return passes rules through");
      if (String(sent).indexOf("RULES-KEEP-9f3a") >= 0) fail("studioDraft must not send rules to the model");
      else pass("studioDraft does not send rules to the model");
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
  console.log("check-ai-rules ok");
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});

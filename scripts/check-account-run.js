#!/usr/bin/env node
require("./_env-guard");
// Proves run-on-its-own on /api/account (no network). Own seat only.
// Without AIA_ACCOUNT_SECRETS_KEY a write is refused and nothing is saved.
// With that key set, a proved seat can turn it on or off for a desk or one
// automation. Strangers get the same missing reply. Collect stays HOLD.
// Nothing is charged, sent, or deleted. Create Desk AIs stay drafts.
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const followPath = path.join(root, "api/_account-follow.js");
const followSrc = fs.existsSync(followPath) ? fs.readFileSync(followPath, "utf8") : "";
if (followSrc.indexOf("function stageRun") < 0 || followSrc.indexOf("function runReady") < 0) {
  console.error("FAIL check-account-run: run on its own is not on this tree");
  process.exit(1);
}

const store = path.join(os.tmpdir(), "aia-account-run-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
process.env.AIA_TLD_PROBE = "0";
delete process.env.VERCEL_ENV;
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.AIA_ACCOUNT_SECRETS_KEY;
delete global.__aia;
delete global.__aiaHydrate;

const KEY = "test-only-run-key-0123456789abcdef0123456789abcdef";
const NO_ONE = "Nothing like that for this sign-in.";
const LOCK = /An AI or SI account can't change this itself\. The human owner can\./;
const replies = [];
const lines = [];
let failed = false;

function fail(msg) { console.error("FAIL " + msg); failed = true; process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }

function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}

let handler;
async function call(method, headers, body, query) {
  const res = mockRes();
  const q = Object.assign({ via: "account" }, query || {});
  const qs = Object.keys(q).map((k) => k + "=" + encodeURIComponent(q[k])).join("&");
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  ["log", "error", "warn", "info"].forEach((k) => {
    console[k] = function () { lines.push(Array.prototype.join.call(arguments, " ")); };
  });
  try {
    await handler({ method, headers: headers || {}, body: body || {}, query: q, url: "/api/auth?" + qs }, res);
  } finally {
    Object.assign(console, orig);
  }
  replies.push(JSON.stringify({ s: res.statusCode, b: res.body }));
  return res;
}

function seat(slug, pin) { return { "x-workspace": slug, "x-pin": pin }; }
function miss(res) {
  return res.statusCode === 404 && JSON.stringify(res.body) === JSON.stringify({ ok: false, error: NO_ONE });
}
function heldFlags(res) {
  const b = res.body || {};
  return b.charged === false && b.collect === "hold" && b.runOnItsOwn === false && b.deleted !== true;
}
function savedRun(acc, key) {
  const row = acc && acc.settings && acc.settings.automations && acc.settings.automations[key];
  return !!(row && row.runOnItsOwn === true);
}
function deskRun(acc, slug) {
  const row = acc && acc.settings && acc.settings.runs && acc.settings.runs[slug];
  return !!(row && row.runOnItsOwn === true);
}

async function main() {
  const aisSrc = fs.readFileSync(path.join(root, "api/_ais.js"), "utf8");
  const normAt = aisSrc.indexOf("function normalizeAi");
  const norm = normAt >= 0 ? aisSrc.slice(normAt, aisSrc.indexOf("function normalizeAis", normAt)) : "";
  const settingsSrc = fs.readFileSync(path.join(root, "api/_account-settings.js"), "utf8");
  const simple = fs.readFileSync(path.join(root, "create-simple.js"), "utf8");
  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  if (!/draftOnly:\s*true/.test(norm)) fail("Create must keep new Desk AIs draft-only");
  if (simple.indexOf("Draft only. The person presses Yes, Stop, or Kill.") < 0) fail("simple Create must stay draft-only");
  if (/require\(["']\.\/(_packs|_wallets|_connect-wallet|_engine|_aia-register|_aia-mail)["']\)/.test(followSrc)) fail("run on its own must not load money, Collect, or mail");
  if (/charged:\s*true|draftOnly\s*=\s*false/.test(followSrc)) fail("follow must not charge or clear a draft");
  if (fs.existsSync(path.join(root, "api/account-run.js")) || fs.existsSync(path.join(root, "api/run.js"))) fail("run on its own must stay on /api/account");
  if (pkg.indexOf("scripts/check-account-run.js") < 0) fail("package.json test must run this check");
  if (settingsSrc.indexOf('require("./_account-follow")') < 0) fail("settings must hand run on its own to the account route");
  if (!failed) pass("source: one account route, Create stays draft-only, no money or mail path");

  const lib = require(path.join(root, "api/_lib"));
  handler = require(path.join(root, "api/auth"));
  await lib.ready();
  const now = new Date().toISOString();
  const H = (p) => lib.hashPin(p);
  const aiSnap = JSON.stringify([{ id: "ai_doer", name: "Doer", draftOnly: true, steps: ["qualify", "do", "send"], never: ["send", "mail", "money", "yes", "kill"] }]);
  lib.mem.accounts = [
    { id: "acct_A", name: "Own Shop", ownerName: "Ann", email: "ann@example.test", desks: ["own-desk"], memberDesks: [], createdAt: now, kind: "human" },
    { id: "acct_B", name: "Bo", ownerName: "Bo", email: "bo@example.test", desks: ["bo-desk"], memberDesks: ["own-desk"], createdAt: now, kind: "human" },
    { id: "acct_C", name: "Other Shop", ownerName: "Cy", email: "cy@example.test", desks: ["other-desk"], memberDesks: [], createdAt: now, kind: "human" },
    { id: "acct_X", name: "Xa", ownerName: "Xa", email: "xa@example.test", desks: [], memberDesks: ["own-desk"], createdAt: now, kind: "ai" },
    { id: "acct_AI", name: "Miner Shop", ownerName: "Miner", email: "miner@example.test", desks: ["ai-desk"], memberDesks: [], createdAt: now, kind: "ai" }
  ];
  lib.mem.workspaces = [
    {
      slug: "own-desk", biz: "Own Shop", name: "Ann", accountId: "acct_A", pin: H("4821"), createdAt: now,
      rules: [{ id: "r1", text: "Draft a reply when a lead drops", when: "drop", then: "draft" }],
      ais: JSON.parse(aiSnap),
      people: [
        { id: "p_owner", name: "Ann", role: "owner", kind: "owner", status: "approved", pin: H("4821"), accountId: "acct_A" },
        { id: "p_helper", name: "Hal", role: "employee", kind: "helper", status: "approved", pin: H("5555"), accountId: "" },
        { id: "p_bo", name: "Bo", role: "employee", kind: "member", status: "approved", pin: H("9999"), accountId: "acct_B" },
        { id: "p_x", name: "Xa", role: "employee", kind: "helper", status: "approved", pin: H("7171"), accountId: "acct_X" },
        { id: "p_ai", name: "Bot", role: "employee", kind: "agent", status: "approved", pin: H("8888"), accountId: "acct_B", deskAi: true }
      ]
    },
    {
      slug: "other-desk", biz: "Other Shop", name: "Cy", accountId: "acct_C", pin: H("1234"), createdAt: now,
      rules: [{ id: "r7", text: "Wait for Cy", when: "drop", then: "wait" }],
      ais: [{ id: "ai_other", name: "Other", draftOnly: true }],
      people: [{ id: "p_cy", name: "Cy", role: "owner", kind: "owner", status: "approved", pin: H("1234"), accountId: "acct_C" }]
    },
    {
      slug: "bo-desk", biz: "Bo Shop", name: "Bo", accountId: "acct_B", pin: H("9191"), createdAt: now,
      rules: [], people: [{ id: "p_bo_home", name: "Bo", role: "owner", kind: "owner", status: "approved", pin: H("9191"), accountId: "acct_B" }]
    },
    {
      slug: "ai-desk", biz: "Miner Shop", name: "Miner", accountId: "acct_AI", pin: H("4242"), createdAt: now,
      rules: [{ id: "r9", text: "Draft the next step for Miner", when: "drop", then: "draft" }],
      ais: [{ id: "ai_mine", name: "Miner", draftOnly: true, steps: ["qualify", "do"] }],
      people: [{ id: "p_miner", name: "Miner", role: "owner", kind: "owner", status: "approved", pin: H("4242"), accountId: "acct_AI" }]
    }
  ];
  lib.mem.jobs = [
    { id: "job_mine", workspace: "own-desk", title: "Need a quote", status: "open", createdAt: now, updatedAt: now }
  ];
  lib.mem.money = [{ id: "m1", amount: 5, status: "hold" }];
  const moneyBefore = JSON.stringify(lib.mem.money);
  const jobsBefore = JSON.stringify(lib.mem.jobs);
  const A = () => lib.mem.accounts.find((a) => a.id === "acct_A");
  const X = () => lib.mem.accounts.find((a) => a.id === "acct_X");
  const AI = () => lib.mem.accounts.find((a) => a.id === "acct_AI");
  const hist = (acc) => ((acc || A()).history || []).length;
  const aisOf = (slug) => JSON.stringify((lib.mem.workspaces.find((w) => w.slug === slug) || {}).ais || null);
  const OWN = seat("own-desk", "4821");
  const auto = { action: "run", target: "automation", desk: "own-desk", kind: "rule", id: "r1" };
  const aiAuto = { action: "run", target: "automation", desk: "own-desk", kind: "ai", id: "ai_doer" };

  const held = await call("GET", OWN, null, { run: "1" });
  const heldRun = held.body && held.body.run;
  if (held.statusCode !== 200 || !heldRun || heldRun.available !== false || heldRun.held !== true || held.body.runOnItsOwn !== false || !heldFlags(held)) fail("GET without the key must say run on its own is held: " + held.statusCode);
  else if (!heldRun.items || !heldRun.items.length || heldRun.items.some((i) => i.runOnItsOwn !== false)) fail("held list must keep every switch off");
  else if (heldRun.note && /AIA_ACCOUNT_SECRETS_KEY/.test(heldRun.note)) fail("the held note must not name the server key");
  else pass("GET says run on its own is held when the key is missing");

  const before = JSON.stringify(A().settings || null);
  const h0 = hist();
  const refuseOn = await call("POST", OWN, Object.assign({ on: true }, auto));
  if (refuseOn.statusCode !== 409 || !/Run on its own is not here yet/.test((refuseOn.body && refuseOn.body.error) || "") || !heldFlags(refuseOn) || hist() !== h0 || JSON.stringify(A().settings || null) !== before) fail("missing key must refuse the turn-on and save nothing: " + refuseOn.statusCode);
  else pass("missing key refuses the turn-on with nothing saved");
  const refuseSettings = await call("POST", OWN, { action: "settings", section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", runOnItsOwn: true } });
  if (refuseSettings.statusCode !== 409 || !/not here yet/.test((refuseSettings.body && refuseSettings.body.error) || "") || hist() !== h0 || savedRun(A(), "own-desk:rule:r1")) fail("settings turn-on without the key must be the same hold");
  else pass("settings turn-on without the key is the same hold");
  const refuseSmuggle = await call("POST", OWN, { action: "pause", target: "desk", desk: "own-desk", runOnItsOwn: true });
  if (refuseSmuggle.statusCode !== 409 || hist() !== h0 || (A().settings && A().settings.runs && A().settings.runs["own-desk"])) fail("a pause must not smuggle the switch on while the key is missing");
  else pass("pause cannot smuggle the switch on while the key is missing");
  process.env.AIA_ACCOUNT_SECRETS_KEY = "short";
  const shortKey = await call("POST", OWN, Object.assign({ on: true }, auto));
  if (shortKey.statusCode !== 409 || savedRun(A(), "own-desk:rule:r1") || hist() !== h0) fail("a short key must stay held");
  else pass("a key that cannot seal secrets stays held");
  delete process.env.AIA_ACCOUNT_SECRETS_KEY;

  const strangers = [
    ["no seat", "POST", {}, Object.assign({ on: true }, auto)],
    ["bad pin", "POST", seat("own-desk", "0000"), Object.assign({ on: true }, auto)],
    ["helper", "POST", seat("own-desk", "5555"), Object.assign({ on: true }, auto)],
    ["Desk AI seat", "GET", seat("own-desk", "8888"), null, { run: "1" }],
    ["other account id", "POST", OWN, Object.assign({ on: true, accountId: "acct_C" }, auto)],
    ["other desk", "POST", OWN, { action: "run", target: "desk", desk: "other-desk", on: true }]
  ];
  let missBody = "";
  for (let i = 0; i < strangers.length; i++) {
    const row = strangers[i];
    const res = await call(row[1], row[2], row[3], row[4]);
    if (!miss(res)) fail(row[0] + " must be the same missing reply, got " + res.statusCode + " " + JSON.stringify(res.body && res.body.error));
    if (!missBody) missBody = JSON.stringify(res.body);
    else if (JSON.stringify(res.body) !== missBody) fail(row[0] + " body drifted");
  }
  const member = await call("POST", seat("own-desk", "9999"), { action: "run", target: "desk", desk: "own-desk", on: true });
  if (!miss(member) || JSON.stringify(member.body) !== missBody) fail("a member on someone else's desk must be the same missing reply");
  else if (hist() !== h0) fail("strangers must not write history");
  else pass("strangers and a member on someone else's desk get one missing reply");

  process.env.AIA_ACCOUNT_SECRETS_KEY = KEY;
  const open = await call("GET", OWN, null, { run: "1" });
  const openRun = open.body && open.body.run;
  if (open.statusCode !== 200 || !openRun || openRun.available !== true || openRun.held !== false || open.body.charged !== false || open.body.collect !== "hold") fail("GET with the key must say it is available: " + open.statusCode);
  else if (!openRun.items || openRun.items.some((i) => i.runOnItsOwn !== false)) fail("available does not turn any switch on by itself");
  else pass("GET says run on its own is available when the key is set, and every switch starts off");

  let h = hist();
  const on = await call("POST", OWN, Object.assign({ on: true }, auto));
  if (on.statusCode !== 200 || on.body.changed !== true || on.body.runOnItsOwn !== true || on.body.charged !== false || on.body.collect !== "hold" || on.body.deleted === true) fail("turn on " + JSON.stringify(on.body));
  else if (!savedRun(A(), "own-desk:rule:r1") || hist() !== h + 1) fail("turn on must save on this automation and log one line");
  else if (!/Collect stays HOLD/.test(on.body.hint || "") || !/Nothing is charged/.test(on.body.hint || "") || /sent a message|charged you/i.test(on.body.hint || "")) fail("turn-on hint " + on.body.hint);
  else if (!on.body.stops || on.body.stops.money !== true || on.body.stops.deletes !== true || on.body.stops.messageNew !== true) fail("stops stay on: " + JSON.stringify(on.body.stops));
  else if (!on.body.mayRun || on.body.mayRun.indexOf("draft") < 0 || on.body.mayRun.indexOf("send") >= 0 || on.body.mayRun.indexOf("mail") >= 0) fail("may run only the safe step: " + JSON.stringify(on.body.mayRun));
  else pass("a proved seat can turn run on its own on for one automation");

  const again = await call("POST", OWN, { action: "run", target: "automation", desk: "own-desk", kind: "rule", id: "r1", runOnItsOwn: true });
  if (again.statusCode !== 200 || again.body.changed !== false || hist() !== h + 1) fail("turning it on again must change nothing");
  else pass("turning it on again changes nothing");

  const smuggle = await call("POST", OWN, { action: "pause", target: "automation", desk: "own-desk", kind: "ai", id: "ai_doer", auto: true });
  if (smuggle.statusCode !== 400 || savedRun(A(), "own-desk:ai:ai_doer") || aisOf("own-desk") !== aiSnap) fail("pause must not flip the switch when the key is set: " + smuggle.statusCode);
  else pass("pause still cannot smuggle the switch");

  h = hist();
  const deskOn = await call("POST", OWN, { action: "run", target: "desk", desk: "own-desk", on: true });
  if (deskOn.statusCode !== 200 || deskOn.body.runOnItsOwn !== true || deskOn.body.draftOnly !== true || !deskRun(A(), "own-desk") || aisOf("own-desk") !== aiSnap) fail("desk turn-on " + JSON.stringify(deskOn.body));
  else pass("the desk switch turns on, and the Desk AI stays a draft");

  const aiOn = await call("POST", OWN, Object.assign({ on: false }, aiAuto));
  const aiView = await call("GET", OWN, null, { run: "1", desk: "own-desk", kind: "ai", id: "ai_doer" });
  const aiItem = aiView.body && aiView.body.run && aiView.body.run.item;
  if (aiOn.statusCode !== 200 || aiOn.body.runOnItsOwn !== false || !aiItem || aiItem.runOnItsOwn !== false || aiItem.draftOnly !== true) fail("an automation set off stays off while the desk is on: " + JSON.stringify(aiItem));
  else if (deskRun(A(), "own-desk") !== true) fail("turning one automation off must leave the desk switch on");
  else if ((aiItem.mayRun || []).indexOf("send") >= 0) fail("may run must not include send");
  else pass("one automation can stay off while the desk is on");

  const aiLive = await call("POST", OWN, Object.assign({ auto: true }, aiAuto));
  const aiMay = aiLive.body && aiLive.body.mayRun || [];
  if (aiLive.statusCode !== 200 || aiLive.body.runOnItsOwn !== true || aiLive.body.draftOnly !== true || aisOf("own-desk") !== aiSnap) fail("Desk AI turn-on must stay a draft: " + JSON.stringify(aiLive.body));
  else if (aiMay.indexOf("qualify") < 0 || aiMay.indexOf("do") < 0 || aiMay.indexOf("send") >= 0) fail("Desk AI may run only its safe steps: " + JSON.stringify(aiMay));
  else pass("a Desk AI may run its safe steps and stays a draft");

  const spend = await call("POST", OWN, { action: "automation-step", desk: "own-desk", kind: "rule", id: "r1", step: "spend" });
  if (spend.statusCode !== 409 || spend.body.held !== true || spend.body.charged !== false || spend.body.done !== false || !/Collect stays HOLD/.test(spend.body.error || "")) fail("spend stays Collect HOLD: " + JSON.stringify(spend.body));
  else if (JSON.stringify(lib.mem.money) !== moneyBefore) fail("spend must not touch money");
  else pass("with the switch on, spend is still Collect HOLD and nothing is charged");

  const msg = await call("POST", OWN, { action: "automation-step", desk: "own-desk", kind: "ai", id: "ai_doer", step: "message-new" });
  if (msg.statusCode !== 409 || msg.body.charged !== false || msg.body.done !== false || msg.body.sent === true) fail("message-new must still stop: " + JSON.stringify(msg.body));
  else if (JSON.stringify(lib.mem.jobs) !== jobsBefore) fail("message-new must not touch cards");
  else pass("messaging someone new still stops");

  const stop = await call("POST", OWN, { action: "automation-step", desk: "own-desk", kind: "rule", id: "r1", step: "stop" });
  const kill = await call("POST", OWN, { action: "automation-step", desk: "own-desk", kind: "ai", id: "ai_doer", step: "kill" });
  if (stop.statusCode !== 200 || kill.statusCode !== 200 || !/always work/.test(stop.body.reply || "")) fail("Stop and Kill must still work");
  else pass("Stop and Kill still work");

  await call("POST", OWN, { action: "settings", section: "automations", set: { desk: "own-desk", kind: "ai", id: "ai_doer", deletes: false } });
  if (!savedRun(A(), "own-desk:ai:ai_doer")) fail("a stop-before change must keep the run switch");
  const del = await call("POST", OWN, { action: "automation-step", desk: "own-desk", kind: "ai", id: "ai_doer", step: "delete" });
  if (del.statusCode !== 200 || del.body.done !== false || del.body.charged !== false || del.body.runOnItsOwn !== true) fail("delete with the stop off still does not delete: " + JSON.stringify(del.body));
  else if (/sent|deleted the|charged/.test(del.body.reply || "") && !/Nothing was sent, deleted, or charged/.test(del.body.reply || "")) fail("delete reply must not claim it deleted: " + del.body.reply);
  else if (JSON.stringify(lib.mem.jobs) !== jobsBefore || aisOf("own-desk") !== aiSnap) fail("delete must not remove cards or the Desk AI");
  else pass("turning off the delete stop does not delete anything");

  const settingsOn = await call("POST", OWN, { action: "settings", section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", autoRun: false } });
  const listed = (((settingsOn.body || {}).settings || {}).automations || {});
  const ruleItem = (listed.items || []).find((i) => i.id === "r1");
  if (settingsOn.statusCode !== 200 || !ruleItem || ruleItem.runOnItsOwn !== false || listed.runOnItsOwn.available !== true || listed.runOnItsOwn.held !== false) fail("settings can turn the switch off: " + settingsOn.statusCode);
  else if (savedRun(A(), "own-desk:rule:r1")) fail("settings off must clear the automation switch");
  else pass("settings can turn the switch off, and says it is available");

  h = hist();
  const backOn = await call("POST", OWN, Object.assign({ on: true }, auto));
  const undid = await call("POST", OWN, { action: "undo" });
  if (backOn.statusCode !== 200 || undid.statusCode !== 200 || undid.body.undid !== true || savedRun(A(), "own-desk:rule:r1") || undid.body.charged !== false) fail("undo must put the switch back: " + JSON.stringify(undid.body));
  else if (JSON.stringify(lib.mem.jobs) !== jobsBefore) fail("undo must not delete cards");
  else pass("undo puts the switch back and does not delete");

  const aiSeat = seat("ai-desk", "4242");
  const aiTry = await call("POST", aiSeat, { action: "run", target: "automation", desk: "ai-desk", kind: "ai", id: "ai_mine", on: true });
  const aiSaved = AI().settings && AI().settings.automations && AI().settings.automations["ai-desk:ai:ai_mine"];
  if (aiTry.statusCode !== 403 || !LOCK.test((aiTry.body && aiTry.body.error) || "") || (aiSaved && aiSaved.runOnItsOwn === true)) fail("an AI account must not turn run on its own on: " + aiTry.statusCode);
  else if (!/tried to turn on run on its own/.test((AI().history[0] || {}).what || "")) fail("the refusal must be recorded");
  else pass("an AI account cannot turn run on its own on itself");
  const forOn = await call("POST", OWN, { action: "run", target: "automation", desk: "own-desk", kind: "rule", id: "r1", on: true, forSeat: "p_x" });
  const xSaved = X().settings && X().settings.automations && X().settings.automations["own-desk:rule:r1"];
  if (forOn.statusCode !== 200 || !xSaved || xSaved.runOnItsOwn !== true || savedRun(A(), "own-desk:rule:r1")) fail("the human owner turns it on for the AI seat, not on their own switch: " + forOn.statusCode);
  else pass("the human owner can turn it on for an AI seat on their desk");

  delete process.env.AIA_ACCOUNT_SECRETS_KEY;
  const dropped = await call("GET", OWN, null, { run: "1", desk: "own-desk", kind: "ai", id: "ai_doer" });
  if (dropped.statusCode !== 200 || !dropped.body.run || dropped.body.run.available !== false || dropped.body.run.held !== true || dropped.body.runOnItsOwn !== false) fail("taking the key away must hold the switch again: " + JSON.stringify(dropped.body && dropped.body.run));
  const droppedWrite = await call("POST", OWN, Object.assign({ on: false }, aiAuto));
  if (droppedWrite.statusCode !== 409 || !savedRun(A(), "own-desk:ai:ai_doer")) fail("a held write must not clear a saved switch");
  process.env.AIA_ACCOUNT_SECRETS_KEY = KEY;
  const still = await call("GET", OWN, null, { run: "1", desk: "own-desk", kind: "ai", id: "ai_doer" });
  if (!still.body || still.body.runOnItsOwn !== true || !still.body.run || still.body.run.held !== false) fail("the saved switch comes back when the key is set again");
  else pass("without the key the switch reads off and a write changes nothing; with the key it is still on");

  const origSave = lib.save;
  lib.save = async () => false;
  const beforeFail = JSON.stringify(A().settings || null);
  let saveFail;
  try {
    saveFail = await call("POST", OWN, { action: "run", target: "desk", desk: "own-desk", on: false });
  } finally {
    lib.save = origSave;
  }
  if (saveFail.statusCode !== 503 || JSON.stringify(A().settings || null) !== beforeFail || !deskRun(A(), "own-desk")) fail("a failed save must leave the switch as it was: " + saveFail.statusCode);
  else pass("when the save fails, the switch is unchanged");

  if (JSON.stringify(lib.mem.money) !== moneyBefore) fail("money rows changed");
  if (JSON.stringify(lib.mem.jobs) !== jobsBefore) fail("cards changed");
  const hay = replies.join("\n") + "\n" + lines.join("\n");
  if (hay.indexOf(KEY) >= 0) fail("the server key was echoed");
  else pass("the server key stays off replies and logs; money and cards stayed");

  if (!failed) console.log("PASS check-account-run");
}

main().catch((e) => {
  console.error("FAIL " + (e && e.stack || e));
  process.exit(1);
});

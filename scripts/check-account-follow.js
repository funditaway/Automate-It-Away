#!/usr/bin/env node
require("./_env-guard");
// Proves Pause, What this can do, Activity, Undo, and Export + Close on
// /api/account (no network). Own seat only. Strangers get one missing reply.
// Create stays draft-only. Run on its own stays off. Collect stays HOLD.
// A paused automation still takes Stop and Kill. Undo does not delete.
// Export leaves out the desk code, the password, and secrets.
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const followPath = path.join(root, "api/_account-follow.js");
const followSrc = fs.existsSync(followPath) ? fs.readFileSync(followPath, "utf8") : "";
if (followSrc.indexOf("export-close") < 0) {
  console.error("FAIL check-account-follow: export-close is not on this tree");
  process.exit(1);
}

const store = path.join(os.tmpdir(), "aia-account-follow-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
process.env.AIA_TLD_PROBE = "0";
delete process.env.VERCEL_ENV;
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.AIA_ACCOUNT_SECRETS_KEY;
delete global.__aia;
delete global.__aiaHydrate;

const SECRET = "sk-live-FOLLOW-secret-value";
const HOOK = "https://hooks.example.test/follow-secret-hook";
const PASSWORD = "pw-hash-FOLLOW-not-for-export";
const NO_ONE = "Nothing like that for this sign-in.";
const LOCK = /An AI or SI account can't change this itself\. The human owner can\./;
const replies = [];
const lines = [];
const pinHashes = [];
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
let pinHash = "";
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
  replies.push(JSON.stringify({ s: res.statusCode, b: res.body, h: res.headers }));
  return res;
}

function seat(slug, pin) { return { "x-workspace": slug, "x-pin": pin }; }
function miss(res) {
  return res.statusCode === 404 && JSON.stringify(res.body) === JSON.stringify({ ok: false, error: NO_ONE });
}
function flags(res) {
  const b = res.body || {};
  return b.charged === false && b.collect === "hold" && b.runOnItsOwn === false && b.deleted === false;
}
function leaked(text) {
  const raw = String(text || "");
  if (raw.indexOf(SECRET) >= 0) return "secret";
  if (raw.indexOf(HOOK) >= 0) return "hook";
  if (raw.indexOf(PASSWORD) >= 0) return "password";
  if (pinHashes.some((h) => h && raw.indexOf(h) >= 0)) return "desk code";
  return "";
}

async function main() {
  const settingsSrc = fs.readFileSync(path.join(root, "api/_account-settings.js"), "utf8");
  const http = fs.readFileSync(path.join(root, "api/_account-http.js"), "utf8");
  const stepAt = settingsSrc.indexOf("function automationStep");
  const stepFn = stepAt >= 0 ? settingsSrc.slice(stepAt, stepAt + 1800) : "";
  const alwaysAt = stepFn.indexOf("ALWAYS_STEPS");
  const heldAt = stepFn.indexOf("heldByPerson");
  if (http.indexOf('require("./_account-settings").handle(req, res)') < 0) fail("account http must call settings");
  if (settingsSrc.indexOf('require("./_account-follow")') < 0) fail("settings must hand pause, can-do, activity, undo, and export-close to _account-follow");
  if (fs.existsSync(path.join(root, "api/account.js"))) fail("api/account.js must not exist");
  if (fs.existsSync(path.join(root, "api/account-follow.js"))) fail("api/account-follow.js must not exist");
  if (/require\(["']\.\/(_packs|_wallets|_connect-wallet|_engine|_aia-register)["']\)/.test(followSrc)) fail("follow must not load money or Collect modules");
  if (/wipeDesk|mem\.money|charged:\s*true|draftOnly\s*=\s*false/.test(followSrc)) fail("follow must not wipe, touch money, charge, or clear draft-only");
  if ((followSrc.match(/lib\.save\(/g) || []).length !== 1) fail("follow must save in one place");
  if (alwaysAt < 0 || heldAt < 0 || heldAt < alwaysAt) fail("a person pause must be checked after Stop and Kill");
  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  if (pkg.indexOf("scripts/check-account-follow.js") < 0) fail("package.json test must run this check");
  if (!failed) pass("source: one helper on /api/account, Stop and Kill stay first, no money path");

  const lib = require(path.join(root, "api/_lib"));
  handler = require(path.join(root, "api/auth"));
  await lib.ready();
  const now = new Date().toISOString();
  const H = (p) => lib.hashPin(p);
  pinHash = H("4821");
  ["4821", "9999", "9191", "4242", "1234", "7171", "5555", "6666", "7777", "8888", "3333"].forEach((p) => pinHashes.push(H(p)));
  const aiSnap = JSON.stringify([{ id: "ai_doer", name: "Doer", draftOnly: true }]);
  const aiDeskSnap = JSON.stringify([{ id: "ai_mine", name: "Miner", draftOnly: true }]);
  lib.mem.accounts = [
    { id: "acct_A", name: "Own Shop", ownerName: "Ann", email: "ann@example.test", password: PASSWORD, desks: ["own-desk"], memberDesks: [], createdAt: now, kind: "human" },
    { id: "acct_B", name: "Bo", ownerName: "Bo", email: "bo@example.test", desks: ["bo-desk"], memberDesks: ["own-desk"], createdAt: now, kind: "human" },
    { id: "acct_C", name: "Other Shop", ownerName: "Cy", email: "cy@example.test", password: PASSWORD, desks: ["other-desk"], memberDesks: [], createdAt: now, kind: "human" },
    { id: "acct_X", name: "Xa", ownerName: "Xa", email: "xa@example.test", desks: [], memberDesks: ["own-desk"], createdAt: now, kind: "ai" },
    { id: "acct_AI", name: "Miner Shop", ownerName: "Miner", email: "miner@example.test", desks: ["ai-desk"], memberDesks: [], createdAt: now, kind: "ai" }
  ];
  lib.mem.workspaces = [
    {
      slug: "own-desk", biz: "Own Shop", name: "Ann", accountId: "acct_A", pin: pinHash, createdAt: now,
      rules: [{ id: "r1", text: "Draft a reply when a lead drops", when: "drop", then: "draft" }],
      ais: JSON.parse(aiSnap),
      people: [
        { id: "p_owner", name: "Ann", role: "owner", kind: "owner", status: "approved", pin: pinHash, accountId: "acct_A", email: "ann@example.test" },
        { id: "p_helper", name: "Hal", role: "employee", kind: "helper", status: "approved", pin: H("5555"), accountId: "" },
        { id: "p_swap", name: "Sly", role: "employee", kind: "helper", status: "approved", pin: H("6666"), accountId: "acct_A" },
        { id: "p_wait", name: "Wes", role: "employee", kind: "helper", status: "pending", pin: H("7777"), accountId: "acct_B" },
        { id: "p_ai", name: "Bot", role: "employee", kind: "agent", status: "approved", pin: H("8888"), accountId: "acct_B", deskAi: true },
        { id: "p_bo", name: "Bo", role: "employee", kind: "member", status: "approved", pin: H("9999"), accountId: "acct_B" },
        { id: "p_x", name: "Xa", role: "employee", kind: "helper", status: "approved", pin: H("7171"), accountId: "acct_X" },
        { id: "p_ghost", name: "Gus", role: "employee", kind: "helper", status: "approved", pin: H("3333"), accountId: "acct_madeup" }
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
      rules: [],
      people: [{ id: "p_bo_home", name: "Bo", role: "owner", kind: "owner", status: "approved", pin: H("9191"), accountId: "acct_B" }]
    },
    {
      slug: "ai-desk", biz: "Miner Shop", name: "Miner", accountId: "acct_AI", pin: H("4242"), createdAt: now,
      rules: [{ id: "r9", text: "Draft the next step for Miner", when: "drop", then: "draft" }],
      ais: JSON.parse(aiDeskSnap),
      people: [{ id: "p_miner", name: "Miner", role: "owner", kind: "owner", status: "approved", pin: H("4242"), accountId: "acct_AI" }]
    }
  ];
  lib.mem.jobs = [
    { id: "job_mine", workspace: "own-desk", title: "Need a quote", status: "open", createdAt: now, updatedAt: now, deskAi: { id: "ai_doer", name: "Doer" } },
    { id: "job_other", workspace: "other-desk", title: "Cy private card", status: "open", createdAt: now, updatedAt: now }
  ];
  lib.mem.money = [{ id: "m1", amount: 5, status: "hold" }];
  const A = () => lib.mem.accounts.find((a) => a.id === "acct_A");
  const X = () => lib.mem.accounts.find((a) => a.id === "acct_X");
  const AI = () => lib.mem.accounts.find((a) => a.id === "acct_AI");
  const C = () => lib.mem.accounts.find((a) => a.id === "acct_C");
  const B = () => lib.mem.accounts.find((a) => a.id === "acct_B");
  const own = () => lib.mem.workspaces.find((w) => w.slug === "own-desk");
  const hist = (acc) => ((acc || A()).history || []).length;
  const moneyBefore = JSON.stringify(lib.mem.money);
  const jobsBefore = JSON.stringify(lib.mem.jobs.map((j) => j.id));
  A().connections = [{
    id: "conn_1", service: "Shop hook", serviceId: "shop", label: "Front desk", status: "saved", createdAt: now,
    secrets: [{ name: "SHOP_KEY", sealed: { data: SECRET } }],
    hook: { sealed: { data: HOOK } }
  }];
  A().setupCards = [{
    id: "card_1", status: "open", statusText: "Saved",
    source: { type: "connection", id: "conn_1", name: "Shop hook" },
    groups: [{ connectionId: "conn_1" }],
    steps: [{ kind: "approve", state: "done", allowed: { money: true, deletes: false, messageNew: false } }],
    history: [{ at: "2020-01-01T00:00:00.000Z", who: "Ann", whoKind: "human", what: "Approved the setup card.", kind: "approve", from: "", to: "" }]
  }];
  const OWN = seat("own-desk", "4821");
  const aisOf = (slug) => JSON.stringify((lib.mem.workspaces.find((w) => w.slug === slug) || {}).ais || null);

  const strangers = [
    ["no seat", "POST", {}, { action: "pause", target: "desk", desk: "own-desk" }],
    ["bad pin", "POST", seat("own-desk", "0000"), { action: "pause", target: "desk", desk: "own-desk" }],
    ["made-up desk", "POST", seat("missing-desk", "4821"), { action: "pause", target: "desk", desk: "own-desk" }],
    ["helper with no account", "POST", seat("own-desk", "5555"), { action: "unpause", target: "automation", desk: "own-desk", kind: "rule", id: "r1" }],
    ["swapped helper", "POST", seat("own-desk", "6666"), { action: "can-do", desk: "own-desk", kind: "rule", id: "r1" }],
    ["waiting seat", "GET", seat("own-desk", "7777"), null, { activity: "1" }],
    ["Desk AI seat", "GET", seat("own-desk", "8888"), null, { can: "1", desk: "own-desk", kind: "ai", id: "ai_doer" }],
    ["made-up account on the seat", "POST", seat("own-desk", "3333"), { action: "undo" }],
    ["made-up session", "POST", { "x-session": "not-a-real-token" }, { action: "export-close", do: "export" }],
    ["other account id", "POST", OWN, { action: "pause", target: "desk", desk: "own-desk", accountId: "acct_C" }],
    ["other account id on a read", "GET", OWN, null, { pause: "1", accountId: "acct_C" }]
  ];
  let missBody = "";
  for (let i = 0; i < strangers.length; i++) {
    const row = strangers[i];
    const res = await call(row[1], row[2], row[3], row[4]);
    if (!miss(res)) fail(row[0] + " must be the same missing reply, got " + res.statusCode + " " + JSON.stringify(res.body));
    if (!missBody) missBody = JSON.stringify(res.body);
    else if (JSON.stringify(res.body) !== missBody) fail(row[0] + " body drifted");
  }
  const boDesk = await call("POST", seat("own-desk", "9999"), { action: "pause", target: "desk", desk: "own-desk" });
  if (!miss(boDesk) || JSON.stringify(boDesk.body) !== missBody) fail("a member desk they do not own must be the same missing reply");
  const otherJob = await call("POST", OWN, { action: "activity", jobId: "job_other" });
  const goneJob = await call("POST", OWN, { action: "activity", jobId: "job_missing" });
  if (!miss(otherJob) || JSON.stringify(otherJob.body) !== JSON.stringify(goneJob.body)) fail("a card on another desk must read the same as a missing card");
  if (hist() !== 0 || (C().history || []).length || JSON.stringify(C().settings || null) !== "null") fail("stranger calls must change nothing");
  else pass("strangers, a member on someone else's desk, and another desk's card get one missing reply");

  const can = await call("POST", OWN, { action: "can-do", desk: "own-desk", kind: "ai", id: "ai_doer" });
  const aiCan = can.body && can.body.can;
  if (can.statusCode !== 200 || !flags(can) || can.body.wrote !== false) fail("can-do " + can.statusCode + " " + JSON.stringify(can.body));
  else if (!aiCan || aiCan.allowed.spend !== false || aiCan.allowed.deletes !== false || aiCan.allowed.messageNew !== false || aiCan.draftOnly !== true || aiCan.runOnItsOwn !== false) fail("Desk AI powers must stay closed: " + JSON.stringify(aiCan && aiCan.allowed));
  else if (!aiCan.lines.some((l) => /cannot send/.test(l)) || !aiCan.lines.some((l) => /stays a draft/.test(l)) || !aiCan.lines.some((l) => /does not run on its own/.test(l)) || !aiCan.lines.some((l) => /Collect stays HOLD/.test(l))) fail("can-do lines must say the limits in plain words: " + JSON.stringify(aiCan.lines));
  else if (hist() !== 0 || aisOf("own-desk") !== aiSnap) fail("can-do must not write or widen the Desk AI");
  else pass("what this Desk AI can do is a read, and it cannot spend, delete, or message someone new");

  const ruleCan = await call("GET", OWN, null, { can: "1", desk: "own-desk", kind: "rule", id: "r1" });
  if (ruleCan.statusCode !== 200 || !ruleCan.body.can || ruleCan.body.can.allowed.spend !== false || !ruleCan.body.can.lines.some((l) => /cannot send, pay, or delete/.test(l))) fail("rule can-do " + JSON.stringify(ruleCan.body && ruleCan.body.can));
  else pass("a rule says what it can do and still cannot send, pay, or delete");

  const conn = await call("POST", OWN, { action: "can-do", connectionId: "conn_1" });
  const cc = conn.body && conn.body.can;
  if (conn.statusCode !== 200 || !cc || cc.allowed.spend !== false || cc.allowed.deletes !== false || cc.allowed.messageNew !== false) fail("connection powers " + JSON.stringify(cc && cc.allowed));
  else if (!cc.cards || !cc.cards[0] || cc.cards[0].allowed.money !== true) fail("a setup-card approval must stay on that card");
  else if (!cc.lines.some((l) => /value is not shown/.test(l)) || !cc.lines.some((l) => /hook address is saved/.test(l))) fail("connection lines " + JSON.stringify(cc.lines));
  else if (leaked(JSON.stringify(conn.body))) fail("connection can-do leaked " + leaked(JSON.stringify(conn.body)));
  else if (hist() !== 0) fail("can-do must not write history");
  else pass("a connection lists a card approval without granting spend, and hides the secret and the hook");

  const noConn = await call("POST", OWN, { action: "can-do", connectionId: "conn_missing" });
  if (noConn.statusCode !== 404 || !/No connection like that/.test((noConn.body && noConn.body.error) || "")) fail("missing connection " + noConn.statusCode);
  const noCard = await call("POST", OWN, { action: "activity", cardId: "card_missing" });
  if (noCard.statusCode !== 404 || !/No setup card like that/.test((noCard.body && noCard.body.error) || "")) fail("missing setup card " + noCard.statusCode);
  const noAuto = await call("POST", OWN, { action: "can-do", desk: "own-desk", kind: "rule", id: "r-missing" });
  if (noAuto.statusCode !== 404 || !/No automation like that/.test((noAuto.body && noAuto.body.error) || "")) fail("missing automation " + noAuto.statusCode);
  const otherDesk = await call("GET", OWN, null, { can: "1", desk: "other-desk", kind: "rule", id: "r7" });
  if (!miss(otherDesk)) fail("another person's desk must be the missing reply");
  else pass("missing things stay missing, and another desk is not named");

  const empty = await call("GET", OWN, null, { activity: "1" });
  if (empty.statusCode !== 200 || !flags(empty) || empty.body.wrote !== false || (empty.body.activity || []).length !== 0 || empty.body.note !== "Nothing recorded on this yet.") fail("empty activity " + JSON.stringify(empty.body));
  else if (hist() !== 0) fail("activity must not write");
  else pass("activity is empty until something is recorded");

  const both = await call("GET", OWN, null, { pause: "1", can: "1" });
  if (both.statusCode !== 400 || !/Ask for one thing/.test((both.body && both.body.error) || "")) fail("two reads must be refused");
  const runHold = await call("POST", OWN, { action: "pause", target: "desk", desk: "own-desk", runOnItsOwn: true });
  if (runHold.statusCode !== 409 || !/Run on its own is not here yet/.test((runHold.body && runHold.body.error) || "") || hist() !== 0) fail("run on its own must be refused with no write: " + runHold.statusCode);
  else pass("run on its own is refused and nothing is saved");

  const proto = Object.create({ action: "pause", target: "desk", desk: "own-desk" });
  const protoRes = await call("POST", OWN, proto);
  if (protoRes.statusCode !== 400 || !/plain object/.test((protoRes.body && protoRes.body.error) || "") || hist() !== 0) fail("a prototype body must be refused");
  const num = await call("POST", OWN, { action: "pause", target: "desk", desk: 12 });
  if (num.statusCode !== 400 || !/plain text/.test((num.body && num.body.error) || "")) fail("a desk sent as a number must be refused: " + JSON.stringify(num.body));
  const extra = await call("POST", OWN, { action: "pause", target: "desk", desk: "own-desk", stop: "off" });
  if (extra.statusCode !== 400 || hist() !== 0) fail("Stop must not be a pause field: " + extra.statusCode);
  else pass("a prototype body, a desk sent as a number, and a Stop field are refused");

  const pausedBefore = aisOf("own-desk");
  let h = hist();
  const pauseAi = await call("POST", OWN, { action: "pause", target: "automation", desk: "own-desk", kind: "ai", id: "ai_doer" });
  if (pauseAi.statusCode !== 200 || !flags(pauseAi) || pauseAi.body.changed !== true || pauseAi.body.paused !== true || pauseAi.body.draftOnly !== true || pauseAi.body.runOnItsOwn !== false) fail("pause Desk AI " + JSON.stringify(pauseAi.body));
  else if (!/stays a draft/.test(pauseAi.body.hint || "") || !/Yes, Stop, or Kill/.test(pauseAi.body.hint || "")) fail("pause hint " + pauseAi.body.hint);
  else if (hist() !== h + 1 || aisOf("own-desk") !== pausedBefore) fail("pause must log one line and leave the Desk AI record alone");
  else pass("pausing a Desk AI leaves it a draft");

  const again = await call("POST", OWN, { action: "pause", target: "automation", desk: "own-desk", kind: "ai", id: "ai_doer" });
  if (again.statusCode !== 200 || again.body.changed !== false || hist() !== h + 1) fail("pausing again must change nothing");
  else pass("pausing something already paused changes nothing");

  h = hist();
  const stepPaused = await call("POST", OWN, { action: "automation-step", desk: "own-desk", kind: "ai", id: "ai_doer", step: "spend" });
  if (stepPaused.statusCode !== 409 || stepPaused.body.paused !== true || stepPaused.body.charged !== false || !/is paused/.test(stepPaused.body.error || "") || /Paused before spending/.test(stepPaused.body.error || "")) fail("paused spend " + JSON.stringify(stepPaused.body));
  else pass("a paused automation does not spend, and the words say it is paused");
  const stepStop = await call("POST", OWN, { action: "automation-step", desk: "own-desk", kind: "ai", id: "ai_doer", step: "stop" });
  const stepKill = await call("POST", OWN, { action: "automation-step", desk: "own-desk", kind: "ai", id: "ai_doer", step: "kill" });
  if (stepStop.statusCode !== 200 || stepKill.statusCode !== 200 || !/always work/.test(stepStop.body.reply || "")) fail("Stop and Kill must still work while paused: " + stepStop.statusCode + " " + stepKill.statusCode);
  else pass("Stop and Kill still work while an automation is paused");

  const unpauseAi = await call("POST", OWN, { action: "unpause", target: "automation", desk: "own-desk", kind: "ai", id: "ai_doer" });
  if (unpauseAi.statusCode !== 200 || unpauseAi.body.changed !== true || unpauseAi.body.itemPaused !== false || unpauseAi.body.runOnItsOwn !== false) fail("unpause " + JSON.stringify(unpauseAi.body));
  else if (A().settings && A().settings.runOnItsOwn) fail("unpause must not turn on run on its own");
  else if (aisOf("own-desk") !== aiSnap) fail("unpause must not rewrite the Desk AI");
  else pass("the owner can unpause, and run on its own stays off");

  const undoPreview = await call("GET", OWN, null, { undo: "1" });
  const preview = undoPreview.body && undoPreview.body.undo;
  if (undoPreview.statusCode !== 200 || !preview || preview.available !== true || preview.kind !== "pause" || preview.person || preview.before || /pin/.test(JSON.stringify(preview))) fail("undo preview " + JSON.stringify(preview));
  else pass("undo preview names the last step and nothing else");
  const undid = await call("POST", OWN, { action: "undo" });
  if (undid.statusCode !== 200 || undid.body.undid !== true || !flags(undid) || /pin/.test(JSON.stringify(undid.body))) fail("undo " + JSON.stringify(undid.body));
  const still = A().settings && A().settings.automations && A().settings.automations["own-desk:ai:ai_doer"];
  if (!still || still.paused !== true) fail("undo of unpause must pause the Desk AI again");
  else pass("undo puts the pause back and does not delete");
  const undid2 = await call("POST", OWN, { action: "undo" });
  const cleared = A().settings && A().settings.automations && A().settings.automations["own-desk:ai:ai_doer"];
  if (undid2.statusCode !== 200 || (cleared && cleared.paused === true)) fail("undo of the pause must clear it");
  else if ((lib.mem.jobs || []).length !== 2 || aisOf("own-desk") !== aiSnap) fail("undo must not delete cards or Desk AIs");
  else pass("undo of the pause clears it, and cards stay");

  h = hist();
  const off = await call("POST", OWN, { action: "settings", section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", money: false } });
  const sb = () => (A().settings && A().settings.automations && A().settings.automations["own-desk:rule:r1"] || {}).stopBefore || {};
  if (off.statusCode !== 200 || sb().money !== false) fail("stop-before off " + off.statusCode + " " + JSON.stringify(sb()));
  const back = await call("POST", OWN, { action: "undo" });
  if (back.statusCode !== 200 || sb().money !== true) fail("undo must turn stop-before money back on: " + JSON.stringify(sb()));
  else pass("undo puts a stop-before choice back");

  const humanSpend = await call("POST", OWN, { action: "automation-step", desk: "own-desk", kind: "rule", id: "r1", step: "spend" });
  if (humanSpend.statusCode !== 409 || humanSpend.body.paused !== false || humanSpend.body.held !== true || humanSpend.body.charged !== false || !/Collect stays HOLD/.test(humanSpend.body.error || "")) fail("human spend must stay Collect HOLD: " + JSON.stringify(humanSpend.body));
  else pass("with nothing paused, spend is still Collect HOLD");

  const deskPause = await call("POST", OWN, { action: "pause", target: "desk", desk: "own-desk" });
  if (deskPause.statusCode !== 200 || deskPause.body.paused !== true || deskPause.body.draftOnly !== true) fail("desk pause " + JSON.stringify(deskPause.body));
  const deskStep = await call("POST", OWN, { action: "automation-step", desk: "own-desk", kind: "rule", id: "r1", step: "delete" });
  if (deskStep.statusCode !== 409 || !/is paused/.test(deskStep.body.error || "")) fail("a paused desk must hold the step: " + JSON.stringify(deskStep.body));
  const deskStop = await call("POST", OWN, { action: "automation-step", desk: "own-desk", kind: "rule", id: "r1", step: "stop" });
  if (deskStop.statusCode !== 200) fail("Stop must work while the desk is paused");
  await call("POST", OWN, { action: "unpause", target: "desk", desk: "own-desk" });
  if (A().settings && A().settings.runs && A().settings.runs["own-desk"]) fail("unpause must clear the desk pause");
  else pass("pausing the desk holds new steps, and Stop still works");
  await call("POST", OWN, { action: "undo" });
  await call("POST", OWN, { action: "undo" });
  if (A().settings && A().settings.runs && A().settings.runs["own-desk"]) fail("undo must finish with the desk not paused");

  const act = await call("POST", OWN, { action: "activity", desk: "own-desk", kind: "ai", id: "ai_doer" });
  const actText = JSON.stringify(act.body && act.body.activity);
  if (act.statusCode !== 200 || act.body.note !== "Only what was recorded." || actText.indexOf("Paused") < 0 || actText.indexOf("ran on its own") >= 0) fail("activity " + actText);
  else pass("activity shows the pause that was recorded");
  const cardAct = await call("GET", OWN, null, { activity: "1", cardId: "card_1" });
  if (cardAct.statusCode !== 200 || JSON.stringify(cardAct.body.activity).indexOf("Approved the setup card.") < 0) fail("setup card activity must show its own history");
  else pass("setup card activity shows what was recorded on the card");
  const jobAct = await call("POST", OWN, { action: "activity", jobId: "job_mine" });
  if (jobAct.statusCode !== 200 || JSON.stringify(jobAct.body.activity).indexOf("Need a quote") < 0) fail("card activity " + JSON.stringify(jobAct.body && jobAct.body.activity));
  else pass("card activity shows that card");

  const settingsView = await call("GET", OWN, null, { settings: "1" });
  const items = (((settingsView.body || {}).settings || {}).automations || {}).items || [];
  const ruleItem = items.find((i) => i.id === "r1");
  if (settingsView.statusCode !== 200 || !ruleItem || ruleItem.paused !== false || ruleItem.stopBefore.money !== true || ruleItem.deskPaused !== false) fail("settings must still list stop-before and pause: " + JSON.stringify(ruleItem));
  else if (settingsView.body.settings.automations.runOnItsOwn.available !== false) fail("run on its own must stay unavailable");
  else pass("settings still lists stop-before, and pause reads off");

  const AISEAT = seat("ai-desk", "4242");
  const aiPause = await call("POST", AISEAT, { action: "pause", target: "automation", desk: "ai-desk", kind: "ai", id: "ai_mine" });
  if (aiPause.statusCode !== 200 || aiPause.body.paused !== true || aisOf("ai-desk") !== aiDeskSnap) fail("AI pause " + JSON.stringify(aiPause.body));
  const aiOff = await call("POST", AISEAT, { action: "unpause", target: "automation", desk: "ai-desk", kind: "ai", id: "ai_mine" });
  const aiSaved = AI().settings && AI().settings.automations && AI().settings.automations["ai-desk:ai:ai_mine"];
  if (aiOff.statusCode !== 403 || !LOCK.test((aiOff.body && aiOff.body.error) || "") || !aiSaved || aiSaved.paused !== true) fail("AI unpause must stay locked: " + aiOff.statusCode + " " + JSON.stringify(aiOff.body));
  else if (!/tried to unpause/.test((AI().history[0] || {}).what || "")) fail("AI unpause refusal must be recorded");
  else pass("an AI account can pause and cannot unpause itself");
  const aiUndo = await call("POST", AISEAT, { action: "undo" });
  if (aiUndo.statusCode !== 403 || !LOCK.test((aiUndo.body && aiUndo.body.error) || "") || !aiSaved.paused) fail("an AI account cannot undo its own pause: " + JSON.stringify(aiUndo.body));
  const aiStep = await call("POST", AISEAT, { action: "automation-step", desk: "ai-desk", kind: "ai", id: "ai_mine", step: "spend" });
  if (aiStep.statusCode !== 409 || !/is paused/.test(aiStep.body.error || "") || /Paused before spending/.test(aiStep.body.error || "")) fail("paused AI spend must say paused, not the kind pause: " + JSON.stringify(aiStep.body));
  else pass("a paused AI step says it is paused");

  const forPause = await call("POST", OWN, { action: "pause", target: "automation", desk: "own-desk", kind: "rule", id: "r1", forSeat: "p_x" });
  const xKey = X().settings && X().settings.automations && X().settings.automations["own-desk:rule:r1"];
  const aKey = A().settings && A().settings.automations && A().settings.automations["own-desk:rule:r1"];
  if (forPause.statusCode !== 200 || !xKey || xKey.paused !== true || (aKey && aKey.paused === true)) fail("forSeat pause must land on the AI account only: " + forPause.statusCode);
  const xTry = await call("POST", seat("own-desk", "7171"), { action: "unpause", target: "automation", desk: "own-desk", kind: "rule", id: "r1" });
  if (!miss(xTry) || !xKey.paused) fail("the AI seat cannot unpause a desk it does not own");
  const forClear = await call("POST", OWN, { action: "unpause", target: "automation", desk: "own-desk", kind: "rule", id: "r1", forSeat: "p_x" });
  const xNow = X().settings && X().settings.automations && X().settings.automations["own-desk:rule:r1"];
  if (forClear.statusCode !== 200 || (xNow && xNow.paused === true)) fail("the human owner must be able to unpause for the seat: " + JSON.stringify(forClear.body));
  else pass("the human owner can pause and unpause for an AI seat on their desk");
  const forExport = await call("POST", OWN, { action: "export-close", do: "export", forSeat: "p_x" });
  if (forExport.statusCode !== 400 || !/your own account/.test((forExport.body && forExport.body.error) || "")) fail("export for a seat must be refused");
  const memberFor = await call("POST", seat("own-desk", "9999"), { action: "pause", target: "desk", desk: "own-desk", forSeat: "p_x" });
  if (memberFor.statusCode === 200 || (memberFor.body && memberFor.body.pause)) fail("a member must not pause for a seat");
  else pass("export and close stay on your own account");

  const origSave = lib.save;
  lib.save = async () => false;
  let saveFail;
  const beforeFail = JSON.stringify(A().settings || null);
  try {
    saveFail = await call("POST", OWN, { action: "pause", target: "desk", desk: "own-desk" });
  } finally {
    lib.save = origSave;
  }
  if (saveFail.statusCode !== 503 || JSON.stringify(A().settings || null) !== beforeFail) fail("a failed save must leave the account as it was: " + saveFail.statusCode);
  else pass("when the save fails, nothing is left changed");

  const menu = await call("GET", OWN, null, { exportClose: "1" });
  const menuBody = menu.body && menu.body.exportClose;
  if (menu.statusCode !== 200 || !menuBody || menuBody.closeAccount.available !== false || menuBody.closeAccount.hold !== true || menuBody.collect !== "hold" || menuBody.runOnItsOwn !== false) fail("export menu " + JSON.stringify(menuBody));
  else pass("export and close lists the choices, and closing the account stays on hold");

  const tok = lib.issueSession(own().people[0], own(), A(), { headers: {} }).token;
  const exported = await call("POST", OWN, { action: "export-close", do: "export" });
  const packText = JSON.stringify(exported.body || {});
  if (exported.statusCode !== 200 || !flags(exported) || !exported.body.pack || exported.body.pack.format !== "aia.account.v1") fail("export " + exported.statusCode);
  else if (leaked(packText) || packText.indexOf(tok) >= 0) fail("export leaked a secret, a desk code, a password, or a session");
  else if (!exported.body.pack.desks || !exported.body.pack.desks.length) fail("export must include the desk you own");
  else pass("export leaves out the desk code, the password, secrets, and the session");

  const jobsNow = (lib.mem.jobs || []).length;
  const closeAcct = await call("POST", OWN, { action: "export-close", do: "close-account" });
  if (closeAcct.statusCode !== 409 || closeAcct.body.deleted !== false || closeAcct.body.charged !== false || closeAcct.body.hold !== true || !/stays on hold/.test(closeAcct.body.error || "")) fail("close account " + JSON.stringify(closeAcct.body));
  else if (!A() || A().id !== "acct_A" || (lib.mem.jobs || []).length !== jobsNow || !own()) fail("close account must delete nothing");
  else pass("closing the account stays on hold and deletes nothing");

  const alreadyOpen = await call("POST", OWN, { action: "export-close", do: "open-desk", desk: "own-desk" });
  if (alreadyOpen.statusCode !== 200 || alreadyOpen.body.changed !== false) fail("open on an open desk " + JSON.stringify(alreadyOpen.body));
  const closed = await call("POST", OWN, { action: "export-close", do: "close-desk", desk: "own-desk" });
  if (closed.statusCode !== 200 || own().closed !== true || (lib.mem.jobs || []).length !== jobsNow || !/Nothing was deleted/.test(closed.body.hint || "")) fail("close desk " + JSON.stringify(closed.body));
  else pass("closing the desk stops new work and keeps the cards");
  const reopen = await call("POST", OWN, { action: "undo" });
  if (reopen.statusCode !== 200 || own().closed === true || (lib.mem.jobs || []).length !== jobsNow || aisOf("own-desk") !== aiSnap) fail("undo must open the desk again without deleting");
  else pass("undo opens the desk again and keeps the cards");

  const last = await call("POST", OWN, { action: "export-close", do: "leave-desk" });
  if (last.statusCode !== 409 || !/Last owner keeps the seat/.test((last.body && last.body.error) || "")) fail("last owner leave " + JSON.stringify(last.body));
  else if (!own().people.some((p) => p && p.id === "p_owner")) fail("last owner must stay");
  else pass("the last owner keeps the seat");

  const boLeave = await call("POST", seat("own-desk", "9999"), { action: "export-close", do: "leave-desk" });
  if (boLeave.statusCode !== 200 || own().people.some((p) => p && p.id === "p_bo") || leaked(JSON.stringify(boLeave.body))) fail("member leave " + boLeave.statusCode + " " + JSON.stringify(boLeave.body));
  const boBack = await call("POST", seat("bo-desk", "9191"), { action: "undo" });
  if (boBack.statusCode !== 200 || !own().people.some((p) => p && p.id === "p_bo") || leaked(JSON.stringify(boBack.body))) fail("undo leave " + JSON.stringify(boBack.body));
  else if ((B().memberDesks || []).indexOf("own-desk") < 0) fail("undo leave must put the desk back on the account");
  else pass("leaving a desk can be undone, and the desk code stays off the reply");

  const sessionId = (lib.mem.sessions || [])[0] && lib.mem.sessions[0].id;
  const leavePhone = await call("POST", { "x-session": tok }, { action: "export-close", do: "leave-phone" });
  const undoKinds = (A().undo || []).concat(B().undo || []).map((u) => u && u.kind);
  if (!sessionId) fail("expected a session to leave");
  else if (leavePhone.statusCode !== 200 || leavePhone.body.loggedOut !== true || undoKinds.indexOf("leave-phone") >= 0) fail("leave phone " + JSON.stringify(leavePhone.body));
  else if ((lib.mem.sessions || []).some((s) => s && s.id === sessionId)) fail("leave phone must drop this session");
  else pass("leaving this phone drops the session and is not an undo");

  const aiClose = await call("POST", AISEAT, { action: "export-close", do: "close-desk", desk: "ai-desk" });
  const aiRow = lib.mem.workspaces.find((w) => w.slug === "ai-desk");
  if (aiClose.statusCode !== 200 || !aiRow.closed) fail("AI close desk " + JSON.stringify(aiClose.body));
  const aiReopen = await call("POST", AISEAT, { action: "undo" });
  if (aiReopen.statusCode !== 403 || aiRow.closed !== true) fail("an AI account cannot undo a desk open: " + JSON.stringify(aiReopen.body));
  else pass("an AI account cannot undo opening its desk");

  if (JSON.stringify(lib.mem.money) !== moneyBefore) fail("money rows changed");
  if (JSON.stringify((lib.mem.jobs || []).map((j) => j.id)) !== jobsBefore) fail("job list changed");
  const hay = replies.join("\n") + "\n" + lines.join("\n");
  const leak = leaked(hay);
  if (leak) fail(leak + " showed up in a reply or a log");
  else pass("no secret, hook, password, or desk code in replies or logs; money and cards stayed");

  if (!failed) console.log("PASS check-account-follow");
}

main().catch((e) => {
  const text = e && e.stack ? e.stack : String(e);
  console.error("FAIL " + text.split(SECRET).join("[secret]").split(HOOK).join("[hook]").split(PASSWORD).join("[password]"));
  process.exit(1);
});

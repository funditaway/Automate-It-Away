#!/usr/bin/env node
// Proves account kinds (human, ai, si) on /api/account (no network):
// a kind is set at sign-up with accountKind (default human, anything else
// 400; the old seat field kind:"owner" on sign-up is left alone); a missing kind
// reads as human; only the account's own seat changes it, and the change is in
// history with who and whoKind; account and desk history entries carry who
// and whoKind; AI and SI accounts pause before spend, delete, and message-new unless
// that one automation's stop-before is off; spend is still held by Collect HOLD
// for every kind and nothing is charged; Stop and Kill cannot be turned off for
// any kind; humans never pause. Safer default pending James: an AI or SI
// account cannot change its own kind or turn off its own pauses; only the
// human owner of the desk its seat sits on can (forSeat). Turning a pause on stays allowed.
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const settingsPath = path.join(root, "api/_account-settings.js");
const pre = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, "utf8") : "";
if (pre.indexOf("function accountKindFrom") < 0 || pre.indexOf("function needsPause") < 0) {
  console.error("FAIL check-account-kind: no account kind on this tree (api/_account-settings.js has no accountKindFrom / needsPause)");
  process.exit(1);
}

const store = path.join(os.tmpdir(), "aia-account-kind-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
process.env.AIA_TLD_PROBE = "0";
delete process.env.VERCEL_ENV;
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.AIA_ACCOUNT_SECRETS_KEY;
delete global.__aia;
delete global.__aiaHydrate;

let failed = false;
function fail(msg) { if (!failed) console.error("FAIL check-account-kind: " + msg); else console.error("FAIL " + msg); failed = true; process.exitCode = 1; }
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
  const q = Object.assign({}, query || {});
  const qs = Object.keys(q).map((k) => k + "=" + encodeURIComponent(q[k])).join("&");
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  ["log", "error", "warn", "info"].forEach((k) => { console[k] = function () {}; });
  try {
    await handler({ method, headers: headers || {}, body: body || {}, query: q, url: "/api/auth" + (qs ? "?" + qs : "") }, res);
  } finally {
    Object.assign(console, orig);
  }
  return res;
}
const acct = (method, headers, body, query) => call(method, headers, body, Object.assign({ via: "account" }, query || {}));
function seat(slug, pin) { return { "x-workspace": slug, "x-pin": pin }; }

async function main() {
  const lib = require(path.join(root, "api/_lib"));
  const ks = require(settingsPath);
  handler = require(path.join(root, "api/auth"));
  await lib.ready();
  const now = new Date().toISOString();
  const H = (p) => lib.hashPin(p);
  const oldEntry = { at: "2026-10-01T00:00:00.000Z", who: "Ann", section: "look", what: "Look set to dark." };
  lib.mem.accounts = [
    { id: "acct_A", name: "Own Shop", ownerName: "Ann", email: "ann@example.test", desks: ["own-desk"], memberDesks: [], createdAt: now, history: [Object.assign({}, oldEntry)] },
    { id: "acct_B", name: "Bo", ownerName: "Bo", email: "bo@example.test", desks: [], memberDesks: ["own-desk"], createdAt: now },
    { id: "acct_C", name: "Other Shop", ownerName: "Cy", email: "cy@example.test", desks: ["other-desk"], memberDesks: [], createdAt: now, kind: "si" },
    { id: "acct_H", name: "Human Shop", ownerName: "Hana", email: "hana@example.test", desks: ["human-desk"], memberDesks: [], createdAt: now, kind: "human" },
    { id: "acct_X", name: "Xa", ownerName: "Xa", desks: [], memberDesks: ["human-desk"], createdAt: now, kind: "ai" },
    { id: "acct_S", name: "Si", ownerName: "Si", desks: [], memberDesks: ["human-desk"], createdAt: now, kind: "si" },
    { id: "acct_HH", name: "Hu", ownerName: "Hu", desks: [], memberDesks: ["human-desk"], createdAt: now }
  ];
  lib.mem.workspaces = [
    {
      slug: "own-desk", biz: "Own Shop", name: "Ann", accountId: "acct_A", pin: H("4821"), createdAt: now,
      rules: [{ id: "r1", text: "Pay the supplier when a bill drops", when: "drop", then: "draft" }],
      ais: [{ id: "ai_doer", name: "Doer" }],
      people: [
        { id: "p_owner", name: "Ann", role: "owner", kind: "owner", status: "approved", pin: H("4821"), accountId: "acct_A", email: "ann@example.test" },
        { id: "p_helper", name: "Hal", role: "employee", kind: "helper", status: "approved", pin: H("5555"), accountId: "" },
        { id: "p_ai", name: "Bot", role: "employee", kind: "agent", status: "approved", pin: H("8888"), accountId: "acct_B" },
        { id: "p_bo", name: "Bo", role: "employee", kind: "member", status: "approved", pin: H("9999"), accountId: "acct_B" }
      ]
    },
    {
      slug: "other-desk", biz: "Other Shop", name: "Cy", accountId: "acct_C", pin: H("1234"), createdAt: now,
      people: [{ id: "p_owner", name: "Cy", role: "owner", kind: "owner", status: "approved", pin: H("1234"), accountId: "acct_C" }]
    },
    {
      slug: "human-desk", biz: "Human Shop", name: "Hana", accountId: "acct_H", pin: H("2222"), createdAt: now,
      rules: [{ id: "r9", text: "Order stock when it runs low", when: "drop", then: "draft" }],
      ais: [{ id: "ai_h", name: "Helper AI" }],
      people: [
        { id: "p_owner", name: "Hana", role: "owner", kind: "owner", status: "approved", pin: H("2222"), accountId: "acct_H" },
        { id: "p_x", name: "Xa", role: "employee", kind: "helper", status: "approved", pin: H("7171"), accountId: "acct_X" },
        { id: "p_s", name: "Si", role: "employee", kind: "helper", status: "approved", pin: H("7272"), accountId: "acct_S" },
        { id: "p_hh", name: "Hu", role: "employee", kind: "member", status: "approved", pin: H("7373"), accountId: "acct_HH" }
      ]
    }
  ];
  lib.mem.money = [{ id: "m1", amount: 5, status: "hold" }];
  const moneyBefore = JSON.stringify(lib.mem.money);
  const auditMoney = () => JSON.stringify(lib.mem.money) === moneyBefore;
  const A = () => lib.mem.accounts.find((a) => a.id === "acct_A");
  const hist = () => (A().history || []).length;
  const OWN = seat("own-desk", "4821");

  // 1. Sign-up with each kind; missing kind is human; anything else is 400.
  const kinds = ["human", "ai", "si"];
  for (let i = 0; i < kinds.length; i++) {
    const slug = "kind-" + kinds[i];
    const r = await call("POST", { "x-workspace": slug }, { action: "open", slug, biz: "Kind " + kinds[i], name: "K" + i, pin: "40" + i + "9", accountKind: kinds[i] });
    const made = lib.mem.accounts.find((a) => (a.desks || []).indexOf(slug) >= 0);
    if (r.statusCode !== 201 || !made || made.kind !== kinds[i] || !r.body.account || r.body.account.kind !== kinds[i]) fail("create with kind " + kinds[i] + " got " + r.statusCode + " " + JSON.stringify(r.body && r.body.account));
  }
  const upper = await call("POST", { "x-workspace": "kind-upper" }, { action: "open", slug: "kind-upper", biz: "Kind Upper", name: "U", pin: "4119", accountKind: "AI" });
  if (upper.statusCode !== 201 || upper.body.account.kind !== "ai") fail("kind AI must store as ai");
  const plainOne = await call("POST", { "x-workspace": "kind-none" }, { action: "open", slug: "kind-none", biz: "Kind None", name: "N", pin: "4229", kind: "owner" });
  const none = lib.mem.accounts.find((a) => (a.desks || []).indexOf("kind-none") >= 0);
  if (plainOne.statusCode !== 201 || !none || none.kind !== "human") fail("create with no kind must be human, got " + JSON.stringify(none && none.kind));
  if (!failed) pass("sign-up stores human, ai, si; no kind is human");
  const nAcc = lib.mem.accounts.length, nDesk = lib.mem.workspaces.length;
  for (const bad of ["robot", "owner", "Human ", 7, "agent", "ai;si"]) {
    const r = await call("POST", { "x-workspace": "kind-bad" }, { action: "open", slug: "kind-bad", biz: "Kind Bad", name: "B", pin: "4339", accountKind: bad });
    if (bad === "Human ") { if (r.statusCode !== 201) fail("trimmed Human must pass"); lib.mem.workspaces = lib.mem.workspaces.filter((w) => w.slug !== "kind-bad"); lib.mem.accounts = lib.mem.accounts.filter((a) => (a.desks || []).indexOf("kind-bad") < 0); continue; }
    if (r.statusCode !== 400 || !/human, ai, or si/.test((r.body && r.body.error) || "")) fail("invalid kind " + JSON.stringify(bad) + " must be a plain 400, got " + r.statusCode + " " + JSON.stringify(r.body));
  }
  if (lib.mem.accounts.length !== nAcc || lib.mem.workspaces.length !== nDesk) fail("invalid kind must create no account and no desk");
  const mintBad = await acct("POST", OWN, { action: "mint", accountKind: "robot" });
  if (mintBad.statusCode !== 400) fail("mint with invalid kind must be 400, got " + mintBad.statusCode);
  if (!failed) pass("invalid kind gets a plain 400 and creates nothing");

  // 2. Missing kind reads as human; own seat sees all three choices.
  const read = await acct("GET", OWN, null, { settings: "1" });
  const prof = read.body && read.body.settings && read.body.settings.profile;
  if (read.statusCode !== 200 || !prof || prof.kind !== "human") fail("missing kind must read as settings.profile.kind human: " + JSON.stringify(prof));
  else if (A().kind !== undefined) fail("reading must not write a kind");
  else if (!Array.isArray(prof.kindChoices) || prof.kindChoices.join(",") !== "human,ai,si") fail("settings.profile.kindChoices for the own seat must be human, ai, si");
  else pass("missing kind reads as human; own seat kindChoices human, ai, si");

  // 3. Own seat changes the kind through section profile, set.kind; history has who and whoKind.
  let h = hist();
  const ch = await acct("POST", OWN, { action: "settings", section: "profile", set: { kind: "ai" } });
  const e1 = A().history[0];
  if (ch.statusCode !== 200 || A().kind !== "ai" || ch.body.settings.profile.kind !== "ai") fail("own seat must change kind to ai: " + ch.statusCode + " " + JSON.stringify(ch.body));
  else if (hist() !== h + 1 || e1.section !== "profile" || !/kind from human to ai/.test(e1.what)) fail("kind change must be one history entry: " + JSON.stringify(e1));
  else if (e1.who !== "Ann" || e1.whoKind !== "human") fail("kind change entry needs who Ann and whoKind human (kind at the time): " + JSON.stringify(e1));
  else pass("own seat changes the kind; history entry has who and whoKind");
  const nameBefore = A().ownerName;
  for (const badK of ["robot", "", 3, "owner"]) {
    h = hist();
    const badSet = await acct("POST", OWN, { action: "settings", section: "profile", set: { name: "Changed Name", kind: badK } });
    if (badSet.statusCode !== 400 || badSet.body.ok !== false || !/human, ai, or si/.test(badSet.body.error || "") || A().kind !== "ai" || A().ownerName !== nameBefore || hist() !== h) fail("own seat setting kind " + JSON.stringify(badK) + " must be a plain 400 with no change: " + badSet.statusCode);
  }
  const both = await acct("POST", OWN, { action: "settings", section: "profile", set: { kind: "ai", city: "Springfield" } });
  if (both.statusCode !== 200 || A().city !== "Springfield" || A().kind !== "ai") fail("profile save with the same kind keeps it");

  // 4. Other seats and strangers are refused with no change.
  h = hist();
  const tries = [
    ["helper seat on the same desk", seat("own-desk", "5555"), {}],
    ["desk AI seat", seat("own-desk", "8888"), {}],
    ["stranger", {}, {}],
    ["wrong code", seat("own-desk", "0000"), {}],
    ["other desk owner naming acct_A", seat("other-desk", "1234"), { accountId: "acct_A" }],
    ["member naming acct_A", seat("own-desk", "9999"), { accountId: "acct_A" }]
  ];
  for (const [label, hd, extra] of tries) {
    const r = await acct("POST", hd, Object.assign({ action: "settings", section: "profile", set: { kind: "human" } }, extra));
    if (r.statusCode !== 401 && r.statusCode !== 403) fail(label + " must be refused, got " + r.statusCode);
    if (r.body && (r.body.settings || r.body.ok !== false)) fail(label + " must carry no data");
  }
  if (A().kind !== "ai" || hist() !== h) fail("refused seats must change nothing and write no history");
  const cy = await acct("POST", seat("other-desk", "1234"), { action: "settings", section: "profile", set: { kind: "human" } });
  const Cacc = lib.mem.accounts.find((a) => a.id === "acct_C");
  if (cy.statusCode !== 403 || Cacc.kind !== "si" || A().kind !== "ai") fail("an si owner seat cannot change its own kind (safer default), and touches no other account: " + cy.statusCode);
  else if (Cacc.history[0].whoKind !== "si" || Cacc.history[0].who !== "Cy" || !/tried to change its own kind/.test(Cacc.history[0].what)) fail("si refusal entry whoKind si: " + JSON.stringify(Cacc.history[0]));
  const cyLook = await acct("POST", seat("other-desk", "1234"), { action: "settings", section: "look", set: { theme: "dark" } });
  if (cyLook.statusCode !== 200 || Cacc.history[0].whoKind !== "si" || Cacc.history[0].who !== "Cy") fail("si owner other settings still work, entry whoKind si");
  if (!failed) pass("other seats, Desk AI seats, strangers, and swapped ids are refused with no change");

  // 5. History entries carry who and whoKind; old entries stay as they were.
  await acct("POST", OWN, { action: "settings", section: "look", set: { theme: "light" } });
  const look = A().history[0];
  if (look.who !== "Ann" || look.whoKind !== "ai") fail("settings entry must carry who and whoKind ai: " + JSON.stringify(look));
  const old = A().history[A().history.length - 1];
  if (JSON.stringify(old) !== JSON.stringify(oldEntry)) fail("old entry must stay as it was: " + JSON.stringify(old));
  const shown = (await acct("GET", OWN, null, { settings: "1" })).body.settings.history;
  if (shown[0].whoKind !== "ai" || shown[0].who !== "Ann") fail("settings.history[] must show who and whoKind");
  if ("whoKind" in shown[shown.length - 1]) fail("old entry must not grow a whoKind in the reply");
  const desk = require(path.join(root, "api/_desk"));
  const row = lib.mem.workspaces.find((w) => w.slug === "own-desk");
  const dOwner = desk.logDesk("edit", row, row.people[0]);
  const dHelper = desk.logDesk("edit", row, row.people[1]);
  const dAi = desk.logDesk("edit", row, row.people[2]);
  const dNone = desk.logDesk("edit", row, null);
  if (dOwner.by !== "Ann" || dOwner.whoKind !== "ai") fail("desk entry by owner of an ai account needs whoKind ai: " + JSON.stringify(dOwner));
  if (dHelper.by !== "Hal" || dHelper.whoKind !== "human") fail("desk entry by a helper with no account reads human: " + JSON.stringify(dHelper));
  if (dAi.whoKind !== "ai") fail("desk entry by a Desk AI seat needs whoKind ai");
  if (dNone.by !== "desk" || dNone.whoKind !== "ai") fail("desk entry with no seat uses the desk's account kind: " + JSON.stringify(dNone));
  const src = fs.readFileSync(settingsPath, "utf8");
  if ((src.match(/history\)?\.unshift|list\.unshift/g) || []).length !== 1) fail("account history must have one writer");
  if (!failed) pass("account and desk history entries carry who and whoKind; old entries untouched");

  // 6. AI account pauses before spend; nothing charged; recorded.
  const step = (body) => acct("POST", OWN, Object.assign({ action: "automation-step", desk: "own-desk" }, body));
  h = hist();
  let s = await step({ kind: "rule", id: "r1", step: "spend" });
  if (s.statusCode !== 409 || !s.body.paused || s.body.charged !== false || s.body.done !== false || !/Paused before spending money/.test(s.body.error || "")) fail("ai spend must pause: " + s.statusCode + " " + JSON.stringify(s.body));
  else if (hist() !== h + 1 || !/Paused before spending money/.test(A().history[0].what) || A().history[0].whoKind !== "ai") fail("pause must be in history with whoKind: " + JSON.stringify(A().history[0]));
  else if (!auditMoney()) fail("pause must charge nothing");
  else pass("ai account pauses before spend, recorded, nothing charged");

  // 7. Safer default: an AI or SI account cannot change its own kind or turn off its own pauses.
  //    Turning a pause back on stays allowed. Only the human owner of the desk it sits on can.
  const LOCK = /An AI or SI account can't change this itself\. The human owner can\./;
  const sb = (acc, key) => JSON.stringify(((acc.settings || {}).automations || {})[key] || null);
  h = hist();
  let before = sb(A(), "own-desk:rule:r1");
  let r = await acct("POST", OWN, { action: "settings", section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", money: false } });
  if (r.statusCode !== 403 || r.body.ok !== false || !LOCK.test(r.body.error || "") || sb(A(), "own-desk:rule:r1") !== before) fail("ai own seat turning off its money pause must be 403 with no change: " + r.statusCode + " " + JSON.stringify(r.body));
  else if (hist() !== h + 1 || !/tried to turn off its own stop before money/.test(A().history[0].what) || A().history[0].whoKind !== "ai") fail("refused pause-off must be in history: " + JSON.stringify(A().history[0]));
  r = await acct("POST", OWN, { action: "settings", section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", money: true } });
  if (r.statusCode !== 200) fail("ai own seat turning a pause back on must stay allowed: " + r.statusCode);
  h = hist();
  r = await acct("POST", OWN, { action: "settings", section: "profile", set: { kind: "human" } });
  if (r.statusCode !== 403 || !LOCK.test(r.body.error || "") || A().kind !== "ai" || hist() !== h + 1 || !/tried to change its own kind to human/.test(A().history[0].what)) fail("ai owner seat changing own kind to human must be 403, no change, recorded: " + r.statusCode);
  r = await acct("POST", OWN, { action: "settings", section: "profile", set: { kind: "ai", city: "Joplin" } });
  if (r.statusCode !== 200 || A().city !== "Joplin") fail("ai own seat saving its profile with the same kind stays allowed");
  // An AI desk owner has no human owner: no forSeat path either.
  r = await acct("POST", OWN, { action: "settings", section: "profile", set: { kind: "human" }, forSeat: "p_helper" });
  if (r.statusCode !== 403 || A().kind !== "ai") fail("an ai owner seat is not a human owner");

  const X = () => lib.mem.accounts.find((a) => a.id === "acct_X");
  const S = () => lib.mem.accounts.find((a) => a.id === "acct_S");
  const XS = seat("human-desk", "7171"), SS = seat("human-desk", "7272"), HO = seat("human-desk", "2222");
  // (a) an AI's own seat sets its kind to human.
  r = await acct("POST", XS, { action: "settings", section: "profile", set: { kind: "human" } });
  if (r.statusCode !== 403 || r.body.ok !== false || !LOCK.test(r.body.error || "") || X().kind !== "ai") fail("(a) ai own seat setting kind human must be 403 with no change: " + r.statusCode + " " + JSON.stringify(r.body));
  else if (!X().history || !/tried to change its own kind to human/.test(X().history[0].what) || X().history[0].who !== "Xa" || X().history[0].whoKind !== "ai") fail("(a) refusal must be in the ai account's history");
  r = await acct("POST", XS, { action: "settings", section: "profile", set: { kind: "si" } });
  if (r.statusCode !== 403 || X().kind !== "ai") fail("(a) ai own seat setting kind si must be 403");
  // (b) an SI turns off its own money pause.
  const sKey = "human-desk:rule:r9";
  before = sb(S(), sKey);
  r = await acct("POST", SS, { action: "settings", section: "automations", set: { desk: "human-desk", kind: "rule", id: "r9", money: false } });
  if (r.statusCode !== 403 || !LOCK.test(r.body.error || "") || sb(S(), sKey) !== before) fail("(b) si turning off its own money pause must be 403 with no change: " + r.statusCode + " " + JSON.stringify(r.body));
  else if (!/tried to turn off its own stop before money/.test(S().history[0].what) || S().history[0].whoKind !== "si") fail("(b) refusal must be in the si account's history");
  r = await acct("POST", SS, { action: "settings", section: "automations", set: { desk: "human-desk", kind: "rule", id: "r9", stopBefore: { deletes: true } } });
  if (r.statusCode !== 200) fail("(b) si turning a pause on stays allowed: " + r.statusCode);
  r = await acct("POST", SS, { action: "settings", section: "automations", set: { desk: "human-desk", kind: "rule", id: "r9", stopBefore: { messageNew: false } } });
  if (r.statusCode !== 403) fail("(b) nested stopBefore false from the si seat must be 403 too");
  if (!failed) pass("(a)(b) ai/si own seat cannot change its kind or turn off its pauses: 403, no change, recorded; turning on is allowed");

  // (c) the human owner of the desk can do both, and history shows who and whoKind.
  r = await acct("POST", HO, { action: "settings", section: "profile", set: { kind: "si" }, forSeat: "p_x" });
  if (r.statusCode !== 200 || X().kind !== "si" || r.body.seat.kind !== "si") fail("(c) human owner must change the ai seat's kind: " + r.statusCode + " " + JSON.stringify(r.body));
  else if (X().history[0].who !== "Hana" || X().history[0].whoKind !== "human" || !/kind from ai to si/.test(X().history[0].what)) fail("(c) kind change by owner needs who Hana whoKind human: " + JSON.stringify(X().history[0]));
  r = await acct("POST", HO, { action: "settings", section: "profile", set: { kind: "ai" }, forSeat: "p_x" });
  if (r.statusCode !== 200 || X().kind !== "ai") fail("(c) owner sets it back to ai");
  r = await acct("POST", HO, { action: "settings", section: "automations", set: { desk: "human-desk", kind: "rule", id: "r9", money: false }, forSeat: "p_s" });
  if (r.statusCode !== 200 || JSON.parse(sb(S(), sKey)).stopBefore.money !== false) fail("(c) human owner must turn off the si money pause: " + r.statusCode + " " + JSON.stringify(r.body));
  else if (S().history[0].who !== "Hana" || S().history[0].whoKind !== "human" || !/Turned off stop before money/.test(S().history[0].what)) fail("(c) pause-off by owner needs who Hana whoKind human: " + JSON.stringify(S().history[0]));
  if (r.body && (r.body.settings || r.body.secrets)) fail("(c) owner reply must not carry the si account's settings");
  if (!failed) pass("(c) the human owner changes kind and turns off a pause; history shows who and whoKind");
  // Who is not the human owner.
  const notOwner = [
    ["the ai seat itself", XS, { forSeat: "p_s" }],
    ["a helper seat", seat("own-desk", "5555"), { forSeat: "p_x" }],
    ["another desk's owner", seat("other-desk", "1234"), { forSeat: "p_s" }],
    ["the human owner naming a human seat", HO, { forSeat: "p_hh" }],
    ["the human owner naming nobody", HO, { forSeat: "p_none" }]
  ];
  for (const [label, hd, extra] of notOwner) {
    const k0 = S().kind, x0 = X().kind;
    const rr = await acct("POST", hd, Object.assign({ action: "settings", section: "profile", set: { kind: "human" } }, extra));
    if (rr.statusCode !== 403 && rr.statusCode !== 404 && rr.statusCode !== 401) fail(label + " must be refused, got " + rr.statusCode);
    if (S().kind !== k0 || X().kind !== x0) fail(label + " must change nothing");
  }
  r = await acct("POST", HO, { action: "settings", section: "look", set: { theme: "dark" }, forSeat: "p_s" });
  if (r.statusCode !== 400) fail("owner may only set kind or automations for an ai/si seat");
  r = await acct("POST", HO, { action: "settings", section: "profile", set: { kind: "si", name: "Renamed" }, forSeat: "p_s" });
  if (r.statusCode !== 400 || S().ownerName === "Renamed") fail("owner may not change other profile fields of an ai/si seat");
  r = await acct("POST", HO, { action: "settings", section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", money: false }, forSeat: "p_s" });
  if (r.statusCode !== 403 && r.statusCode !== 404) fail("owner may only switch automations on their own desk");
  r = await acct("POST", HO, { action: "settings", section: "automations", set: { desk: "human-desk", kind: "rule", id: "r9", stop: false }, forSeat: "p_s" });
  if (r.statusCode !== 400) fail("the human owner cannot turn off Stop either");
  if (!failed) pass("only the human owner of the desk the seat sits on can act for it");

  // Past the pause (owner turned it off) spend is still held by Collect HOLD; nothing charged.
  const sstep = (body) => acct("POST", SS, Object.assign({ action: "automation-step", desk: "human-desk" }, body));
  h = (S().history || []).length;
  s = await sstep({ kind: "rule", id: "r9", step: "spend" });
  if (s.statusCode !== 409 || s.body.paused !== false || s.body.held !== true || s.body.charged !== false || !/Collect stays HOLD/.test(s.body.error || "")) fail("pause off by owner: spend must still be held by Collect HOLD: " + s.statusCode + " " + JSON.stringify(s.body));
  else if (S().history.length !== h + 1 || !/Collect stays HOLD/.test(S().history[0].what)) fail("HOLD must be in history");
  else if (!auditMoney()) fail("HOLD must charge nothing");
  else pass("pause off for one automation passes the pause, Collect HOLD still holds, nothing charged");
  s = await sstep({ kind: "ai", id: "ai_h", step: "spend" });
  if (s.statusCode !== 409 || !s.body.paused) fail("money off on r9 must not turn it off for ai_h");
  await acct("POST", HO, { action: "settings", section: "automations", set: { desk: "human-desk", kind: "ai", id: "ai_h", stopBefore: { deletes: false } }, forSeat: "p_s" });
  s = await sstep({ kind: "ai", id: "ai_h", step: "delete" });
  if (s.statusCode !== 200 || s.body.paused !== false || s.body.done !== false) fail("deletes off on ai_h must go past the pause without doing it: " + JSON.stringify(s.body));
  s = await sstep({ kind: "ai", id: "ai_h", step: "message-new" });
  if (s.statusCode !== 409 || !s.body.paused) fail("message-new must still pause on ai_h");

  // 8. Delete and message-new pause the same way.
  for (const st of ["delete", "message-new"]) {
    h = hist();
    s = await step({ kind: "ai", id: "ai_doer", step: st });
    if (s.statusCode !== 409 || !s.body.paused || s.body.done !== false || hist() !== h + 1) fail("ai " + st + " must pause and be recorded: " + s.statusCode + " " + JSON.stringify(s.body));
  }
  s = await step({ kind: "rule", id: "nope", step: "delete" });
  if (s.statusCode !== 404) fail("unknown automation must be 404");
  s = await step({ kind: "rule", id: "r1", step: "launch" });
  if (s.statusCode !== 400) fail("unknown step must be 400");
  const strangerStep = await acct("POST", seat("own-desk", "5555"), { action: "automation-step", desk: "own-desk", kind: "rule", id: "r1", step: "spend" });
  if (strangerStep.statusCode !== 403) fail("helper seat must not run steps on the account");
  if (!failed) pass("delete and message-new pause the same way; off for one automation only");

  // 9. SI pauses too.
  A().kind = "si";
  s = await step({ kind: "ai", id: "ai_doer", step: "message-new" });
  if (s.statusCode !== 409 || !s.body.paused) fail("si message-new must pause: " + JSON.stringify(s.body));
  s = await step({ kind: "ai", id: "ai_doer", step: "spend" });
  if (s.statusCode !== 409 || !s.body.paused) fail("si spend must pause");
  if (!ks.needsPause("si", {}, "delete") || !ks.needsPause("ai", undefined, "spend") || !ks.needsPause("si", { stopBefore: { money: false } }, "delete")) fail("needsPause ai/si");
  if (ks.needsPause("ai", { stopBefore: { money: false } }, "spend") || ks.needsPause("human", {}, "spend") || ks.needsPause(undefined, {}, "delete") || ks.needsPause("si", {}, "stop") || ks.needsPause("ai", {}, "kill")) fail("needsPause off cases");
  if (!failed) pass("si pauses like ai; needsPause truth table");

  // 10. Stop and Kill cannot be turned off for any kind.
  for (const k of ["human", "ai", "si"]) {
    A().kind = k;
    const before = JSON.stringify(A().settings);
    h = hist();
    const offs = [
      { section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", stop: false } },
      { section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", kill: false } },
      { section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", stopBefore: { stop: false } } },
      { section: "automations", set: { desk: "own-desk", kind: "ai", id: "ai_doer", killSwitch: false } },
      { section: "profile", set: { kind: k, stopOff: true } },
      { section: "look", set: { theme: "dark", killOff: true } }
    ];
    for (const o of offs) {
      const r = await acct("POST", OWN, Object.assign({ action: "settings" }, o));
      if (r.statusCode !== 400 || !/Stop and Kill always work/.test((r.body && r.body.error) || "")) fail(k + ": disabling Stop/Kill must be rejected: " + JSON.stringify(o) + " -> " + r.statusCode);
    }
    if (JSON.stringify(A().settings) !== before || hist() !== h || A().kind !== k) fail(k + ": rejected Stop/Kill writes must change nothing");
    for (const st of ["stop", "kill"]) {
      const r = await step({ kind: "rule", id: "r1", step: st });
      if (r.statusCode !== 200 || r.body.paused !== false) fail(k + ": " + st + " must always go through");
    }
  }
  const auto = (await acct("GET", OWN, null, { settings: "1" })).body.settings.automations.stopAndKill;
  if (!auto.always || auto.canTurnOff !== false) fail("stopAndKill must read always, canTurnOff false");
  if (!failed) pass("Stop and Kill cannot be turned off for human, ai, or si");

  // 11. Humans unchanged: never paused; spend still Collect HOLD; nothing charged.
  A().kind = "human";
  await acct("POST", OWN, { action: "settings", section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", money: true } });
  h = hist();
  s = await step({ kind: "rule", id: "r1", step: "delete" });
  if (s.statusCode !== 200 || s.body.paused !== false || s.body.done !== false || hist() !== h) fail("human delete must not pause and must write nothing: " + JSON.stringify(s.body));
  s = await step({ kind: "ai", id: "ai_doer", step: "message-new" });
  if (s.statusCode !== 200 || s.body.paused !== false) fail("human message-new must not pause");
  s = await step({ kind: "rule", id: "r1", step: "spend" });
  if (s.statusCode !== 409 || s.body.paused !== false || s.body.held !== true || s.body.charged !== false) fail("human spend must not pause but Collect HOLD still holds: " + JSON.stringify(s.body));
  delete A().kind;
  s = await step({ kind: "ai", id: "ai_doer", step: "delete" });
  if (s.statusCode !== 200 || s.body.paused !== false) fail("missing kind behaves as human");
  if (!auditMoney()) fail("money rows changed");
  const spawn = require("child_process").spawnSync(process.execPath, [path.join(root, "scripts/check-collect-hold.js")], { encoding: "utf8" });
  if (spawn.status !== 0) fail("check-collect-hold failed: " + (spawn.stderr || spawn.stdout).slice(0, 400));
  if (/mem\.money/.test(src)) fail("account settings must not touch money");
  if (fs.existsSync(path.join(root, "api/account.js"))) fail("api/account.js must not exist (function count)");
  if (!failed) pass("humans never pause; spend is Collect HOLD for all kinds; money rows untouched");

  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  if (pkg.indexOf("node scripts/check-account-kind.js") < 0) fail("package.json test must run this check");

  try { fs.unlinkSync(store); } catch (e) {}
  if (!failed) console.log("check-account-kind: ok");
}

main().catch((e) => { console.error("FAIL check-account-kind: " + (e && e.stack ? e.stack : e)); process.exit(1); });

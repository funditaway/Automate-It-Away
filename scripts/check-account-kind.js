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
// human owner of the desk its seat sits on can (forSeat, resolved on the owner's
// own desk). Turning a pause on stays allowed. An AI or SI seat gets exactly the
// scope a human on the same seat gets: its own desks only.
// Probe 336 fixes: forSeat only on an accepted seat of the caller's own desk;
// forSeat never changes kind (account-wide; 403 + history); forSeat pauses
// touch that one desk only; request objects never crash ({toString}, junk
// history); an unknown stored kind reads as ai; Stop/Kill work on the actor's
// own desk only (off-desk 403, nothing written); under the store guard every
// automation-step, Stop/Kill included, is 503 store_not_ready and does nothing.
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
let SEEDED = [];
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
      rules: [{ id: "r7", text: "Refund a buyer when asked", when: "drop", then: "draft" }],
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
  SEEDED = lib.mem.accounts.map((a) => a.id);
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
  // M6: the lock holds for every spelling the profile accepts, not only the exact lower-case words.
  for (const spell of ["Human", " human ", "HUMAN", "hUmAn\t", "SI", " Si"]) {
    const hx = (X().history || []).length;
    r = await acct("POST", XS, { action: "settings", section: "profile", set: { kind: spell } });
    if (r.statusCode !== 403 || !LOCK.test((r.body && r.body.error) || "") || X().kind !== "ai" || X().history.length !== hx + 1) fail("(a) ai own seat setting kind " + JSON.stringify(spell) + " must be the self-lock 403 with no change, recorded: " + r.statusCode + " kind " + X().kind);
  }
  // (b) an SI turns off its own money pause (an SI desk owner, on its own desk).
  const CY = seat("other-desk", "1234");
  const Cy = () => lib.mem.accounts.find((a) => a.id === "acct_C");
  const cKey = "other-desk:rule:r7";
  before = sb(Cy(), cKey);
  r = await acct("POST", CY, { action: "settings", section: "automations", set: { desk: "other-desk", kind: "rule", id: "r7", money: false } });
  if (r.statusCode !== 403 || r.body.ok !== false || !LOCK.test(r.body.error || "") || sb(Cy(), cKey) !== before || Cy().kind !== "si") fail("(b) si turning off its own money pause must be 403 with no change: " + r.statusCode + " " + JSON.stringify(r.body));
  else if (!/tried to turn off its own stop before money/.test(Cy().history[0].what) || Cy().history[0].whoKind !== "si" || Cy().history[0].who !== "Cy") fail("(b) refusal must be in the si account's history");
  r = await acct("POST", CY, { action: "settings", section: "automations", set: { desk: "other-desk", kind: "rule", id: "r7", stopBefore: { deletes: true } } });
  if (r.statusCode !== 200) fail("(b) si turning a pause on stays allowed: " + r.statusCode);
  r = await acct("POST", CY, { action: "settings", section: "automations", set: { desk: "other-desk", kind: "rule", id: "r7", stopBefore: { messageNew: false } } });
  if (r.statusCode !== 403) fail("(b) nested stopBefore false from the si seat must be 403 too");
  if (!failed) pass("(a)(b) ai/si own seat cannot change its kind or turn off its pauses: 403, no change, recorded; turning on is allowed");

  // Same seat, same scope: an AI helper seat and a human helper seat on human-desk see the same thing.
  const HH = () => lib.mem.accounts.find((a) => a.id === "acct_HH");
  const VALUE = "helper-secret-value-never-shown-77";
  [X(), HH()].forEach((a) => { a.secrets = [{ name: "SHOP_KEY", createdAt: now, updatedAt: now, sealed: { aia: "aia-acct-secret-1", iv: "x", tag: "y", data: Buffer.from(VALUE).toString("base64") } }]; });
  const HHS = seat("human-desk", "7373");
  const viewOf = async (hd) => {
    const g = await acct("GET", hd, null, { settings: "1" });
    const v = JSON.parse(JSON.stringify(g.body.settings || {}));
    delete v.account; delete v.history;
    ["name", "email", "phone", "city", "state", "timezone", "hours", "note", "kind"].forEach((k) => { delete v.profile[k]; });
    return { status: g.statusCode, raw: JSON.stringify(g.body), view: JSON.stringify(v) };
  };
  const vX = await viewOf(XS), vH = await viewOf(HHS);
  if (vX.status !== 200 || vH.status !== 200) fail("both helper seats read their own settings: " + vX.status + " " + vH.status);
  else if (vX.view !== vH.view) fail("ai helper and human helper on the same desk must get the same settings view:\n ai    " + vX.view + "\n human " + vH.view);
  const autosX = JSON.parse(vX.raw).settings.automations.items, secX = JSON.parse(vX.raw).settings.secrets.items;
  if (autosX.length !== 0) fail("an ai helper sees no automations on a desk it only sits on: " + JSON.stringify(autosX));
  if (secX.length !== 1 || Object.keys(secX[0]).sort().join(",") !== "name,set,updatedAt" || secX[0].name !== "SHOP_KEY") fail("secrets view is names only: " + JSON.stringify(secX));
  [vX.raw, vH.raw].forEach((raw) => { if (raw.indexOf(VALUE) >= 0 || raw.indexOf(Buffer.from(VALUE).toString("base64")) >= 0) fail("secret value must never show"); });
  for (const body of [
    { action: "automation-step", desk: "human-desk", kind: "rule", id: "r9", step: "spend" },
    { action: "automation-step", desk: "human-desk", kind: "ai", id: "ai_h", step: "delete" },
    { action: "automation-step", desk: "human-desk", kind: "rule", id: "r9", step: "stop" },
    { action: "settings", section: "automations", set: { desk: "human-desk", kind: "rule", id: "r9", money: true } }
  ]) {
    const ha = (X().history || []).length, hh = (HH().history || []).length;
    const a1 = await acct("POST", XS, body), a2 = await acct("POST", HHS, body);
    if (a1.statusCode !== a2.statusCode || JSON.stringify(a1.body) !== JSON.stringify(a2.body)) fail("ai and human helper must get the same reply for " + JSON.stringify(body) + ": " + a1.statusCode + " " + JSON.stringify(a1.body) + " vs " + a2.statusCode + " " + JSON.stringify(a2.body));
    if (body.step !== "stop" && a1.statusCode !== 404) fail("a desk the helper only sits on is not one of its desks: " + a1.statusCode);
    if ((X().history || []).length !== ha || (HH().history || []).length !== hh) fail("out-of-scope tries write nothing");
  }
  if (!auditMoney()) fail("money rows changed");
  if (!failed) pass("ai helper and human helper on the same desk: same settings, automations (none), secrets (names only) and automation-step replies");

  // (c) the human owner of the desk turns off a pause; kind is account-wide, so
  // forSeat never changes it (403, plain words, one history line, nothing else).
  const FKIND = /^Kind is account-wide, so it can't be changed for a seat from one desk\. Nothing changed\.$/;
  for (const want of ["si", "human", "ai"]) {
    const hx = (X().history || []).length, setX = JSON.stringify(X().settings || null);
    r = await acct("POST", HO, { action: "settings", section: "profile", set: { kind: want }, forSeat: "p_x" });
    if (r.statusCode !== 403 || r.body.ok !== false || !FKIND.test(r.body.error || "") || X().kind !== "ai") fail("(c) forSeat kind " + want + " must be 403 with no change: " + r.statusCode + " " + JSON.stringify(r.body) + " kind " + X().kind);
    else if (X().history.length !== hx + 1 || X().history[0].who !== "Hana" || X().history[0].whoKind !== "human" || !/tried to change this account's kind/.test(X().history[0].what) || !/Nothing changed/.test(X().history[0].what)) fail("(c) forSeat kind refusal must be one history line on the seat's account, who Hana whoKind human: " + JSON.stringify(X().history[0]));
    if (JSON.stringify(X().settings || null) !== setX) fail("(c) forSeat kind refusal must not touch settings");
  }
  const sKey = "human-desk:rule:r9";
  r = await acct("POST", HO, { action: "settings", section: "automations", set: { desk: "human-desk", kind: "rule", id: "r9", money: false }, forSeat: "p_s" });
  if (r.statusCode !== 200 || JSON.parse(sb(S(), sKey)).stopBefore.money !== false) fail("(c) human owner must turn off the si money pause on the owner's desk: " + r.statusCode + " " + JSON.stringify(r.body));
  else if (S().history[0].who !== "Hana" || S().history[0].whoKind !== "human" || !/Turned off stop before money/.test(S().history[0].what)) fail("(c) pause-off by owner needs who Hana whoKind human: " + JSON.stringify(S().history[0]));
  if (r.body && (r.body.settings || r.body.secrets)) fail("(c) owner reply must not carry the si account's settings");
  const sView = (await acct("GET", SS, null, { settings: "1" })).body.settings.automations.items;
  if (sView.length !== 0) fail("the owner's switch must not widen the si seat's automation list: " + JSON.stringify(sView));
  const sStep = await acct("POST", SS, { action: "automation-step", desk: "human-desk", kind: "rule", id: "r9", step: "spend" });
  if (sStep.statusCode !== 404) fail("automation-step from the si helper on the owner's desk stays out of scope: " + sStep.statusCode);
  if (!failed) pass("(c) the human owner turns off a pause on their own desk (kind via forSeat is 403 + history); history shows who and whoKind; the seat's scope stays the same");
  // Who is not the human owner.
  const ONLY_OWNER = /^Only the human owner of this desk can change this for an AI or SI seat\.$/;
  const notOwner = [
    ["a human helper seat with its own account", seat("human-desk", "7373"), { forSeat: "p_x" }, ONLY_OWNER],
    ["the ai seat itself", XS, { forSeat: "p_s" }, ONLY_OWNER],
    ["a helper seat", seat("own-desk", "5555"), { forSeat: "p_x" }],
    ["another desk's owner", seat("other-desk", "1234"), { forSeat: "p_s" }],
    ["the human owner naming a human seat", HO, { forSeat: "p_hh" }],
    ["the human owner naming nobody", HO, { forSeat: "p_none" }]
  ];
  for (const [label, hd, extra, words] of notOwner) {
    const snap = JSON.stringify(lib.mem.accounts);
    for (const body of [
      { action: "settings", section: "profile", set: { kind: "human" } },
      { action: "settings", section: "automations", set: { desk: "human-desk", kind: "rule", id: "r9", money: false } }
    ]) {
      const rr = await acct("POST", hd, Object.assign(body, extra));
      if (rr.statusCode !== 403 && rr.statusCode !== 404 && rr.statusCode !== 401) fail(label + " must be refused, got " + rr.statusCode);
      if (words && !words.test((rr.body && rr.body.error) || "")) fail(label + " must get the owner-only refusal: " + JSON.stringify(rr.body));
    }
    if (JSON.stringify(lib.mem.accounts) !== snap) fail(label + " must change nothing and write no history on any account");
  }
  r = await acct("POST", HO, { action: "settings", section: "look", set: { theme: "dark" }, forSeat: "p_s" });
  if (r.statusCode !== 400) fail("owner may only set kind or automations for an ai/si seat");
  r = await acct("POST", HO, { action: "settings", section: "profile", set: { kind: "si", name: "Renamed" }, forSeat: "p_s" });
  if (r.statusCode !== 400 || S().ownerName === "Renamed") fail("owner may not change other profile fields of an ai/si seat");
  r = await acct("POST", HO, { action: "settings", section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", money: false }, forSeat: "p_s" });
  if (r.statusCode !== 403 && r.statusCode !== 404) fail("owner may only switch automations on their own desk");
  r = await acct("POST", HO, { action: "settings", section: "automations", set: { desk: "human-desk", kind: "rule", id: "nope", money: false }, forSeat: "p_s" });
  if (r.statusCode !== 404) fail("owner path resolves automations on the owner's desk only");
  r = await acct("POST", HO, { action: "settings", section: "automations", set: { desk: "human-desk", kind: "rule", id: "r9", stop: false }, forSeat: "p_s" });
  if (r.statusCode !== 400) fail("the human owner cannot turn off Stop either");
  if (!failed) pass("only the human owner of the desk the seat sits on can act for it");

  // Past the pause (a saved stop-before off on this ai account's own desk) spend is still
  // Collect HOLD; nothing charged. Seeded: no seat can turn it off from here under the safer default.
  const keep = JSON.stringify(A().settings.automations);
  A().settings.automations["own-desk:rule:r1"] = { stopBefore: { money: false, deletes: true, messageNew: true } };
  A().settings.automations["own-desk:ai:ai_doer"] = { stopBefore: { money: true, deletes: false, messageNew: true } };
  h = hist();
  s = await step({ kind: "rule", id: "r1", step: "spend" });
  if (s.statusCode !== 409 || s.body.paused !== false || s.body.held !== true || s.body.charged !== false || !/Collect stays HOLD/.test(s.body.error || "")) fail("pause off: spend must still be held by Collect HOLD: " + s.statusCode + " " + JSON.stringify(s.body));
  else if (hist() !== h + 1 || !/Collect stays HOLD/.test(A().history[0].what)) fail("HOLD must be in history");
  else if (!auditMoney()) fail("HOLD must charge nothing");
  else pass("pause off for one automation passes the pause, Collect HOLD still holds, nothing charged");
  s = await step({ kind: "ai", id: "ai_doer", step: "spend" });
  if (s.statusCode !== 409 || !s.body.paused) fail("money off on r1 must not turn it off for ai_doer");
  s = await step({ kind: "ai", id: "ai_doer", step: "delete" });
  if (s.statusCode !== 200 || s.body.paused !== false || s.body.done !== false) fail("deletes off on ai_doer must go past the pause without doing it: " + JSON.stringify(s.body));
  s = await step({ kind: "ai", id: "ai_doer", step: "message-new" });
  if (s.statusCode !== 409 || !s.body.paused) fail("message-new must still pause on ai_doer");
  A().settings.automations = JSON.parse(keep);

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

  await probeFixes(lib, ks, { X, S, HH, XS, SS, HO, HHS, OWN, CY, A, sb, LOCK, FKIND, auditMoney, now, H });

  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  if (pkg.indexOf("node scripts/check-account-kind.js") < 0) fail("package.json test must run this check");

  try { fs.unlinkSync(store); } catch (e) {}
  if (!failed) console.log("check-account-kind: ok");
}

// 12. Probe 336 fixes (finding 1, 5, 8 and mutants M2, M6, M8, M11, M16).
async function probeFixes(lib, ks, c) {
  const { X, S, HH, XS, SS, HO, HHS, OWN, CY, A, sb, LOCK, FKIND, auditMoney, now, H } = c;
  const was = failed;
  const accById = (id) => lib.mem.accounts.find((a) => a.id === id);
  const deskOf = (slug) => lib.mem.workspaces.find((w) => w.slug === slug);
  const snapAll = () => JSON.stringify({ a: lib.mem.accounts, w: lib.mem.workspaces, m: lib.mem.money });
  // Count saves, desk log lines, and any outside call while a block runs.
  const counts = { save: 0, log: 0, fetch: 0 };
  const realSave = lib.save, realLog = lib.log, realFetch = global.fetch;
  lib.save = function () { counts.save++; return realSave.apply(this, arguments); };
  lib.log = function () { counts.log++; return realLog.apply(this, arguments); };
  global.fetch = function () { counts.fetch++; return Promise.reject(new Error("no network in check-account-kind")); };
  const zero = () => { counts.save = 0; counts.log = 0; counts.fetch = 0; };
  const quiet = () => counts.save === 0 && counts.log === 0 && counts.fetch === 0;

  // Fixture: Zed, a human owner of an unrelated desk; waiting and denied seats on human-desk.
  lib.mem.accounts.push(
    { id: "acct_Z", name: "Zed Shop", ownerName: "Zed", email: "zed@example.test", desks: ["zed-desk"], memberDesks: [], createdAt: now, kind: "human" },
    { id: "acct_P", name: "Pend", ownerName: "Pend", desks: [], memberDesks: [], createdAt: now, kind: "ai" },
    { id: "acct_D", name: "Den", ownerName: "Den", desks: [], memberDesks: [], createdAt: now, kind: "si" }
  );
  lib.mem.workspaces.push({
    slug: "zed-desk", biz: "Zed Shop", name: "Zed", accountId: "acct_Z", pin: H("3131"), createdAt: now,
    rules: [{ id: "rz", text: "Ship the order when paid", when: "drop", then: "draft" }],
    people: [
      { id: "p_owner", name: "Zed", role: "owner", kind: "owner", status: "approved", pin: H("3131"), accountId: "acct_Z" },
      { id: "p_zs", name: "Si", role: "employee", kind: "helper", status: "approved", pin: H("3232"), accountId: "acct_S" }
    ]
  });
  const hd = deskOf("human-desk");
  hd.people.push(
    { id: "p_pend", name: "Pend", role: "employee", kind: "helper", status: "pending", pin: H("7474"), accountId: "acct_P" },
    { id: "p_den", name: "Den", role: "employee", kind: "helper", status: "denied", pin: H("7575"), accountId: "acct_D" },
    { id: "p_xpend", name: "Xa", role: "employee", kind: "helper", status: "pending", pin: H("7676"), accountId: "acct_X" }
  );
  const ZO = seat("zed-desk", "3131");
  const NOT_OPEN = /^That seat is not accepted on your desk\. Nothing changed\.$/;
  const pauseOff = (deskSlug, rule, extra) => Object.assign({ action: "settings", section: "automations", set: { desk: deskSlug, kind: "rule", id: rule, money: false } }, extra);
  const kindTo = (k, extra) => Object.assign({ action: "settings", section: "profile", set: { kind: k } }, extra);

  // (d) forSeat: only an accepted seat. Waiting and denied seats are 403, nothing written.
  for (const [label, sid] of [["waiting seat", "p_pend"], ["denied seat", "p_den"], ["waiting seat of an ai already accepted elsewhere on the desk", "p_xpend"]]) {
    for (const body of [kindTo("human", { forSeat: sid }), pauseOff("human-desk", "r9", { forSeat: sid })]) {
      const snap = snapAll();
      zero();
      const r = await acct("POST", HO, body);
      if (r.statusCode !== 403 || r.body.ok !== false || !NOT_OPEN.test(r.body.error || "")) fail("(d) forSeat on a " + label + " must be 403 'not accepted': " + r.statusCode + " " + JSON.stringify(r.body));
      if (snapAll() !== snap || !quiet()) fail("(d) forSeat on a " + label + " must write nothing");
    }
  }
  if (accById("acct_P").kind !== "ai" || accById("acct_D").kind !== "si") fail("(d) waiting/denied seat kinds must not change");
  // The real attack: Zed invites an AI by handle (a waiting seat it never accepted), then forSeat.
  accById("acct_X").handle = "xa-bot";
  let inv = null;
  try {
    const admin = require(path.join(root, "api/admin"));
    const res = mockRes();
    const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
    ["log", "error", "warn", "info"].forEach((k) => { console[k] = function () {}; });
    try { await admin({ method: "POST", headers: ZO, body: { action: "invite-world", handle: "xa-bot", kind: "helper" }, query: { workspace: "zed-desk" }, url: "/api/admin?workspace=zed-desk" }, res); } finally { Object.assign(console, orig); }
    inv = (deskOf("zed-desk").people || []).find((p) => p.accountId === "acct_X");
  } catch (e) { inv = null; }
  if (inv && inv.status === "approved") fail("(d) invite-world must make a waiting seat, not an accepted one");
  if (inv && inv.status !== "approved") {
    const snap = snapAll();
    for (const body of [kindTo("human", { forSeat: inv.id }), pauseOff("zed-desk", "rz", { forSeat: inv.id })]) {
      const r = await acct("POST", ZO, body);
      if (r.statusCode !== 403 || !NOT_OPEN.test((r.body && r.body.error) || "")) fail("(d) invite-world waiting seat: forSeat must be 403, got " + r.statusCode + " " + JSON.stringify(r.body));
    }
    if (snapAll() !== snap || X().kind !== "ai") fail("(d) invite-world waiting seat: Zed must change nothing on acct_X");
  } else if (!inv) console.log("note (d): invite-world seat not made on this tree; fixture waiting seats cover the rule");
  // Another owner's desk: Zed names Hana's seat, Hana names Zed's seat, Zed aims at human-desk.
  for (const [label, hdr, body] of [
    ["Zed naming a seat on human-desk", ZO, pauseOff("human-desk", "r9", { forSeat: "p_x" })],
    ["Zed naming a seat on human-desk (kind)", ZO, kindTo("human", { forSeat: "p_x" })],
    ["Hana naming Zed's seat", HO, pauseOff("zed-desk", "rz", { forSeat: "p_zs" })],
    ["Zed's real seat, Hana's desk", ZO, pauseOff("human-desk", "r9", { forSeat: "p_zs" })]
  ]) {
    const snap = snapAll();
    const r = await acct("POST", hdr, body);
    if (r.statusCode !== 403 && r.statusCode !== 404) fail("(d) other-owner desk: " + label + " must be refused, got " + r.statusCode + " " + JSON.stringify(r.body));
    if (snapAll() !== snap) fail("(d) other-owner desk: " + label + " must write nothing");
  }
  // M16: the seat id is exact. No case folding, no trimming.
  for (const sid of ["P_S", " p_s", "p_s ", "p_S", "p_s\t"]) {
    const snap = snapAll();
    const r = await acct("POST", HO, pauseOff("human-desk", "r9", { forSeat: sid }));
    if (r.statusCode !== 404) fail("(d) forSeat id " + JSON.stringify(sid) + " must not match p_s: " + r.statusCode);
    if (snapAll() !== snap) fail("(d) forSeat id " + JSON.stringify(sid) + " must write nothing");
  }
  if (!failed) pass("(d) forSeat works only on an accepted seat of the caller's own desk; waiting, denied, other-owner and near-miss ids are refused with no write");

  // (e) forSeat never changes kind, for any target kind or spelling, and records the refusal.
  for (const [sid, acc] of [["p_x", X], ["p_s", S]]) {
    for (const want of ["human", "Human", " HUMAN ", "ai", "si"]) {
      const k0 = acc().kind, h0 = (acc().history || []).length;
      const r = await acct("POST", HO, kindTo(want, { forSeat: sid }));
      if (r.statusCode !== 403 || !FKIND.test((r.body && r.body.error) || "") || acc().kind !== k0) fail("(e) forSeat kind " + JSON.stringify(want) + " on " + sid + " must be 403 with no change: " + r.statusCode + " kind " + acc().kind);
      if ((acc().history || []).length !== h0 + 1 || acc().history[0].whoKind !== "human" || acc().history[0].who !== "Hana") fail("(e) forSeat kind refusal must add one history line: " + JSON.stringify(acc().history[0]));
    }
  }
  if (!failed) pass("(e) forSeat never changes kind (account-wide): 403 in plain words, one history line");

  // (f) forSeat pause changes touch that one desk only. M11: the reply is {ok, hint, seat:{id, kind}} only.
  {
    const sAcc = S();
    sAcc.email = "si-private@example.test";
    settingsBox(sAcc)["zed-desk:rule:rz"] = { stopBefore: { money: true, deletes: true, messageNew: true }, updatedAt: "2026-10-01T00:00:00.000Z" };
    settingsBox(sAcc)["other-desk:rule:r7"] = { stopBefore: { money: true, deletes: true, messageNew: true }, updatedAt: "2026-10-01T00:00:00.000Z" };
    const autosBefore = JSON.parse(JSON.stringify(sAcc.settings.automations));
    const othersBefore = JSON.stringify(lib.mem.accounts.filter((a) => a.id !== "acct_S"));
    const restBefore = JSON.stringify(Object.assign({}, sAcc, { settings: Object.assign({}, sAcc.settings, { automations: null }), history: null }));
    const r = await acct("POST", HO, Object.assign(pauseOff("human-desk", "r9", { forSeat: "p_s" }), { set: { desk: "human-desk", kind: "rule", id: "r9", money: false, deletes: false } }));
    if (r.statusCode !== 200) fail("(f) owner turning off the si seat's pauses on the owner's desk must be 200: " + r.statusCode + " " + JSON.stringify(r.body));
    const autosAfter = sAcc.settings.automations;
    const changed = Object.keys(Object.assign({}, autosBefore, autosAfter)).filter((k) => JSON.stringify(autosBefore[k]) !== JSON.stringify(autosAfter[k]));
    if (changed.join(",") !== "human-desk:rule:r9") fail("(f) forSeat pause change must touch only human-desk:rule:r9, touched " + JSON.stringify(changed));
    if (JSON.stringify(lib.mem.accounts.filter((a) => a.id !== "acct_S")) !== othersBefore) fail("(f) forSeat pause change must not touch any other account");
    if (JSON.stringify(Object.assign({}, sAcc, { settings: Object.assign({}, sAcc.settings, { automations: null }), history: null })) !== restBefore || sAcc.kind !== "si") fail("(f) forSeat pause change must touch nothing else on the account (kind, profile, look, secrets)");
    const zStep = await acct("POST", seat("zed-desk", "3232"), { action: "automation-step", desk: "zed-desk", kind: "rule", id: "rz", step: "delete" });
    if (zStep.statusCode === 200) fail("(f) a pause turned off on human-desk must not lift it on zed-desk");
    const raw = JSON.stringify(r.body || {});
    if (Object.keys(r.body || {}).sort().join(",") !== "hint,ok,seat" || Object.keys((r.body && r.body.seat) || {}).sort().join(",") !== "id,kind") fail("(f) forSeat reply must be exactly {ok, hint, seat:{id, kind}}: " + raw);
    if (raw.indexOf("si-private@example.test") >= 0 || /stopBefore|settings|secrets|email|pin/.test(raw)) fail("(f) forSeat reply must not leak the seat's account: " + raw);
    const bad = await acct("POST", HO, pauseOff("zed-desk", "rz", { forSeat: "p_s" }));
    if (bad.statusCode !== 403 || JSON.stringify(sAcc.settings.automations["zed-desk:rule:rz"]) !== JSON.stringify(autosBefore["zed-desk:rule:rz"])) fail("(f) owner may not reach the seat's pauses on another desk: " + bad.statusCode);
  }
  if (!failed) pass("(f) forSeat pause change lands on that one desk only; reply carries only ok, hint, seat id and kind");

  // (g) Crash inputs: objects posing as strings, junk history. Clean 400 or ignore, never a throw.
  {
    const hh = HH(), x = X();
    const hh0 = hh.kind, x0 = x.kind;
    const crashBodies = [
      [HHS, kindTo({ toString: "ai" })], [XS, kindTo({ toString: "human" })], [XS, kindTo({ toString() { return "human"; } })],
      [XS, kindTo(["human"])], [XS, kindTo(7)], [XS, kindTo(true)],
      [HHS, { action: "settings", section: "profile", set: { email: { toString: "a@b.c" } } }],
      [HHS, { action: "settings", section: "talk", set: { reach: { toString: "call" } } }],
      [HHS, { action: "settings", section: "look", set: { theme: { toString: "dark" } } }],
      [HHS, { action: "settings", section: { toString: "look" }, set: { theme: "dark" } }],
      [HO, kindTo("human", { forSeat: { toString: "p_x" } })], [HO, kindTo("human", { forSeat: ["p_x"] })],
      [HO, { action: "settings", section: "automations", set: { desk: { toString: "human-desk" }, kind: "rule", id: "r9", money: false }, forSeat: "p_s" }],
      [XS, { action: "automation-step", desk: { toString: "human-desk" }, kind: "rule", id: "r9", step: "stop" }],
      [XS, { action: "automation-step", desk: "human-desk", kind: { toString: "rule" }, id: { toString: "r9" }, step: { toString: "spend" } }],
      [XS, { action: "settings", section: "profile", set: { name: "x" }, accountId: { toString: "acct_X" } }],
      [HHS, { action: "secret-set", name: { toString: "K" }, value: "v" }]
    ];
    for (const [hdr, body] of crashBodies) {
      let r = null, threw = null;
      try { r = await acct("POST", hdr, body); } catch (e) { threw = e; }
      if (threw) fail("(g) " + JSON.stringify(body) + " must not throw: " + (threw && threw.message));
      else if (r.statusCode >= 500 || (r.statusCode >= 200 && r.statusCode < 300 && body.set && (body.set.kind != null || body.set.email != null))) fail("(g) " + JSON.stringify(body) + " must be a clean refusal, got " + r.statusCode);
    }
    if (hh.kind !== hh0 || x.kind !== x0 || (hh.email != null && typeof hh.email !== "string") || (x.email != null && typeof x.email !== "string")) fail("(g) object kinds/emails must change nothing");
    for (const junk of [[null], [null, 7, "x", ["a"], { at: "2026-10-02T00:00:00.000Z", who: "Hu", section: "look", what: "ok" }], "junk", 7, { at: 1 }, [undefined, false]]) {
      hh.history = junk;
      let r = null, threw = null;
      try { r = await acct("GET", HHS, null, { settings: "1" }); } catch (e) { threw = e; }
      if (threw || !r || r.statusCode !== 200 || !Array.isArray(r.body.settings.history)) { fail("(g) GET with history=" + JSON.stringify(junk) + " must be 200, not a throw: " + (threw ? threw.message : r && r.statusCode)); continue; }
      if (r.body.settings.history.some((h) => !h || typeof h !== "object")) fail("(g) junk history entries must be skipped in the reply");
      if (JSON.stringify(hh.history) !== JSON.stringify(junk)) fail("(g) GET must not rewrite stored history");
      try { r = await acct("POST", HHS, { action: "settings", section: "look", set: { theme: "dark" } }); } catch (e) { threw = e; }
      if (threw || r.statusCode !== 200 || !Array.isArray(hh.history) || !hh.history.every((h) => h && typeof h === "object")) fail("(g) a save after junk history must work and leave only real entries");
    }
    hh.history = [];
    for (const q of [{ settings: "1", history: "[null]" }, { settings: "1", history: "x", accountId: "" }]) {
      let r = null, threw = null;
      try { r = await acct("GET", HHS, null, q); } catch (e) { threw = e; }
      if (threw || r.statusCode !== 200) fail("(g) GET with junk query must be 200: " + JSON.stringify(q));
    }
  }
  if (!failed) pass("(g) {toString} kinds and fields, array/number kinds, junk history: clean 400 or ignored, never a throw");

  // (h) Unknown stored kind reads as ai (locked side); a legacy account with no kind field reads human.
  {
    const a = A();
    const keep = { kind: a.kind, had: "kind" in a, automations: JSON.stringify(a.settings.automations) };
    for (const junk of ["agent", "robot", "", null, 7, { k: "human" }, ["human"], "humanoid"]) {
      a.kind = junk;
      a.settings.automations = JSON.parse(keep.automations);
      const g = await acct("GET", OWN, null, { settings: "1" });
      if (g.statusCode !== 200 || g.body.settings.profile.kind !== "ai") fail("(h) stored kind " + JSON.stringify(junk) + " must read as ai, got " + JSON.stringify(g.body.settings && g.body.settings.profile.kind));
      if (ks.kindOf(a) !== "ai") fail("(h) kindOf(" + JSON.stringify(junk) + ") must be ai");
      const before = sb(a, "own-desk:rule:r1");
      const off = await acct("POST", OWN, { action: "settings", section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", money: false } });
      if (off.statusCode !== 403 || !LOCK.test((off.body && off.body.error) || "") || sb(a, "own-desk:rule:r1") !== before) fail("(h) stored kind " + JSON.stringify(junk) + ": own pause-off must be the self-lock 403: " + off.statusCode);
      const toH = await acct("POST", OWN, kindTo("human"));
      if (toH.statusCode !== 403 || JSON.stringify(a.kind) !== JSON.stringify(junk)) fail("(h) stored kind " + JSON.stringify(junk) + ": changing to human must be the self-lock 403");
      const sp = await acct("POST", OWN, { action: "automation-step", desk: "own-desk", kind: "rule", id: "r1", step: "spend" });
      if (sp.statusCode !== 409 || !sp.body.paused) fail("(h) stored kind " + JSON.stringify(junk) + ": spend must pause");
    }
    delete a.kind;
    if (ks.kindOf(a) !== "human" || ks.kindOf(null) !== "human") fail("(h) a legacy account with no kind field, or no account, reads human");
    if (keep.had) a.kind = keep.kind;
    a.settings.automations = JSON.parse(keep.automations);
    // The owner path also refuses for an owner whose stored kind is junk.
    const z = accById("acct_Z");
    z.kind = "robot";
    const zr = await acct("POST", ZO, pauseOff("zed-desk", "rz", { forSeat: "p_zs" }));
    if (zr.statusCode !== 403) fail("(h) an owner with an unknown stored kind is not a human owner: " + zr.statusCode);
    z.kind = "human";
  }
  if (!failed) pass("(h) unknown stored kind (agent, robot, empty, null, number, object) reads as ai: locked and paused");

  // (i) Stop and Kill: every legit actor on its own desk, in every state; off-desk is 403; nothing is ever written.
  {
    const mid = await call("POST", { "x-workspace": "mid-setup" }, { action: "open", slug: "mid-setup", biz: "Mid Setup", name: "Mo", pin: "4559", accountKind: "ai" });
    if (mid.statusCode !== 201) fail("(i) mid-setup desk must open: " + mid.statusCode);
    const MID = seat("mid-setup", "4559");
    A().kind = "ai";
    A().settings.automations = {};
    const legit = [
      ["ai desk owner, paused", OWN, "own-desk"],
      ["human desk owner", HO, "human-desk"],
      ["human helper on its own seat", HHS, "human-desk"],
      ["ai helper on its own seat", XS, "human-desk"],
      ["si helper on its own seat, paused", SS, "human-desk"],
      ["si desk owner, paused", CY, "other-desk"],
      ["ai owner of a desk mid-setup (no rules, no settings yet)", MID, "mid-setup"]
    ];
    for (const [label, hdr, slug] of legit) {
      for (const st of ["stop", "kill"]) {
        for (const desk of [slug, undefined]) {
          const snap = snapAll();
          zero();
          const body = { action: "automation-step", kind: "rule", id: "r1", step: st };
          if (desk) body.desk = desk;
          const r = await acct("POST", hdr, body);
          if (r.statusCode !== 200 || r.body.ok !== true || r.body.paused !== false) fail("(i) " + label + ": " + st + (desk ? " on " + desk : " (no desk named)") + " must go through: " + r.statusCode + " " + JSON.stringify(r.body));
          if (snapAll() !== snap || !quiet()) fail("(i) " + label + ": " + st + " must write nothing");
        }
      }
    }
    const offDesk = [
      ["ai helper on a desk it does not sit on", XS, "own-desk"],
      ["human helper on another desk", HHS, "other-desk"],
      ["si owner on a desk it does not own", CY, "human-desk"],
      ["human owner on another owner's desk", HO, "zed-desk"],
      ["ai owner on a ghost desk", OWN, "ghost-desk"],
      ["ai owner with a junk desk", OWN, { toString: "own-desk" }]
    ];
    for (const [label, hdr, desk] of offDesk) {
      for (const st of ["stop", "kill"]) {
        const snap = snapAll();
        zero();
        const r = await acct("POST", hdr, { action: "automation-step", desk, kind: "rule", id: "r1", step: st });
        if (r.statusCode !== 403 || r.body.ok !== false || !/own desk only/.test(r.body.error || "")) fail("(i) " + label + ": " + st + " must be 403 own desk only: " + r.statusCode + " " + JSON.stringify(r.body));
        if (snapAll() !== snap || !quiet()) fail("(i) " + label + ": refused " + st + " must write nothing");
      }
    }
    // Strangers and waiting seats still never reach Stop/Kill.
    for (const hdr of [{}, seat("human-desk", "0000"), seat("human-desk", "7474")]) {
      const r = await acct("POST", hdr, { action: "automation-step", desk: "human-desk", kind: "rule", id: "r9", step: "kill" });
      if (r.statusCode !== 401 && r.statusCode !== 403) fail("(i) stranger / waiting seat kill must be refused: " + r.statusCode);
    }
  }
  if (!failed) pass("(i) Stop and Kill: owner, human/ai/si helper and mid-setup owner on their own desk always go through (paused or not); off-desk and ghost desks are 403; nothing is written");

  // (j) Store guard up (store not ready, #350): automation-step does nothing. Simulated by the
  //     guard's own hook, lib.storeNotReady, which _account-settings asks before any work.
  {
    const realGuard = lib.storeNotReady;
    const CODE = lib.STORE_NOT_READY_CODE || "store_not_ready";
    const WORDS = lib.STORE_NOT_READY || "The desk can't save right now. Try again in a moment.";
    lib.storeNotReady = function (res) { res.setHeader("Retry-After", "5"); res.status(503).json({ ok: false, error: WORDS, code: CODE }); return true; };
    const stepTries = [
      [OWN, { action: "automation-step", desk: "own-desk", kind: "rule", id: "r1", step: "spend" }],
      [OWN, { action: "automation-step", desk: "own-desk", kind: "ai", id: "ai_doer", step: "delete" }],
      [OWN, { action: "automation-step", desk: "own-desk", kind: "ai", id: "ai_doer", step: "message-new" }],
      [OWN, { action: "settings", section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", money: true } }]
    ];
    try {
      for (const [hdr, body] of stepTries) {
        const snap = snapAll();
        zero();
        const r = await acct("POST", hdr, body);
        if (r.statusCode !== 503 || r.body.code !== CODE || r.body.ok !== false) fail("(j) store guard up: " + JSON.stringify(body) + " must be 503 " + CODE + ", got " + r.statusCode + " " + JSON.stringify(r.body));
        if (snapAll() !== snap || !quiet()) fail("(j) store guard up: " + JSON.stringify(body) + " must run nothing, write nothing, call nothing");
      }
      // STORE-GUARD STOP/KILL OPTION (a), AIA 2026-10-19: own-desk Stop/Kill under the store guard is
      // the same 503 store_not_ready as everything else (never a 2xx, never a 403). If AIA picks
      // option (b) (in-memory stop), change only this block.
      for (const [hdr, desk] of [[OWN, "own-desk"], [HO, "human-desk"], [HHS, "human-desk"], [XS, "human-desk"], [SS, "human-desk"]]) {
        for (const st of ["stop", "kill"]) {
          const snap = snapAll();
          zero();
          const r = await acct("POST", hdr, { action: "automation-step", desk, kind: "rule", id: "r1", step: st });
          if (r.statusCode !== 503 || r.body.code !== CODE) fail("(j) STORE-GUARD STOP/KILL OPTION (a): own-desk " + st + " on " + desk + " must be 503 " + CODE + ", got " + r.statusCode + " " + JSON.stringify(r.body));
          if (snapAll() !== snap || !quiet()) fail("(j) STORE-GUARD STOP/KILL OPTION (a): " + st + " must write nothing");
        }
      }
      const g = await acct("GET", OWN, null, { settings: "1" });
      if (g.statusCode !== 200) fail("(j) store guard up: reading settings stays open: " + g.statusCode);
    } finally {
      if (realGuard) lib.storeNotReady = realGuard; else delete lib.storeNotReady;
    }
    const back = await acct("POST", OWN, { action: "automation-step", desk: "own-desk", kind: "rule", id: "r1", step: "stop" });
    if (back.statusCode !== 200) fail("(j) store ready again: stop goes through: " + back.statusCode);
  }
  if (!failed) pass("(j) store guard up: every automation-step, own-desk Stop/Kill included, is 503 store_not_ready and runs, writes and calls nothing");

  // (k) Sign-up and every account-creation path store an explicit kind. Missing or blank
  //     accountKind is "human"; null, unknown, or non-string is a plain 400 and nothing is saved.
  {
    const has = (a) => !!a && Object.prototype.hasOwnProperty.call(a, "kind") && ks.ACCOUNT_KINDS.indexOf(a.kind) >= 0;
    let n = 0;
    const doors = [["open (no action)", null], ["account", "account"], ["register", "register"]];
    for (const [door, action] of doors) {
      for (const [val, want] of [[undefined, "human"], ["", "human"], ["   ", "human"], ["\t", "human"], ["si", "si"], [" AI ", "ai"]]) {
        const slug = "made-" + (++n);
        const body = { slug, biz: "Made " + n, name: "M" + n, pin: "48" + String(10 + n) };
        if (action) body.action = action;
        if (val !== undefined) body.accountKind = val;
        const r = await call("POST", { "x-workspace": slug }, body);
        const made = lib.mem.accounts.find((a) => (a.desks || []).indexOf(slug) >= 0);
        if (r.statusCode !== 201 || !has(made) || made.kind !== want) fail("(k) sign-up via " + door + " with accountKind " + JSON.stringify(val) + " must store explicit kind " + want + ": " + r.statusCode + " " + JSON.stringify(made && made.kind));
      }
      for (const val of [null, "robot", "owner", 7, 0, true, {}, ["ai"], { toString: "ai" }, "ai;si"]) {
        const slug = "bad-" + (++n);
        const body = { slug, biz: "Bad " + n, name: "B" + n, pin: "49" + String(10 + n), accountKind: val };
        if (action) body.action = action;
        const nA = lib.mem.accounts.length, nW = lib.mem.workspaces.length;
        zero();
        let r = null, threw = null;
        try { r = await call("POST", { "x-workspace": slug }, body); } catch (e) { threw = e; }
        if (threw || r.statusCode !== 400 || !/human, ai, or si/.test((r.body && r.body.error) || "")) fail("(k) sign-up via " + door + " with accountKind " + JSON.stringify(val) + " must be a plain 400: " + (threw ? threw.message : r.statusCode + " " + JSON.stringify(r.body)));
        if (lib.mem.accounts.length !== nA || lib.mem.workspaces.length !== nW || counts.save !== 0) fail("(k) sign-up via " + door + " with accountKind " + JSON.stringify(val) + " must save nothing");
      }
    }
    // Owner "mint" on a desk with no account yet. Signing in makes the desk's account on
    // first use (explicit human); mint then returns it and never re-kinds it.
    lib.mem.workspaces.push({ slug: "mint-desk", biz: "Mint Shop", name: "Mi", pin: H("5151"), createdAt: now, people: [{ id: "p_owner", name: "Mi", role: "owner", kind: "owner", status: "approved", pin: H("5151") }] });
    const MI = seat("mint-desk", "5151");
    for (const val of [null, "robot", {}, 7]) {
      zero();
      const r = await acct("POST", MI, { action: "mint", accountKind: val });
      const on = lib.mem.accounts.filter((a) => (a.desks || []).indexOf("mint-desk") >= 0);
      if (r.statusCode !== 400 || counts.save !== 0) fail("(k) mint with accountKind " + JSON.stringify(val) + " must be 400 and save nothing: " + r.statusCode + " saves " + counts.save);
      if (on.length > 1 || on.some((a) => !has(a) || a.kind !== "human")) fail("(k) mint with a bad kind must make no account beyond the desk's explicit-human one: " + JSON.stringify(on.map((a) => a.kind)));
    }
    let r = await acct("POST", MI, { action: "mint", accountKind: "si" });
    const minted = lib.mem.accounts.filter((a) => (a.desks || []).indexOf("mint-desk") >= 0);
    if (r.statusCode !== 200 || minted.length !== 1 || !has(minted[0]) || minted[0].kind !== "human") fail("(k) mint returns the desk's one account, explicit kind, not re-kinded: " + r.statusCode + " " + JSON.stringify(minted.map((a) => a.kind)));
    // A desk with no account gets one on first use (accountForDesk): explicit human.
    lib.mem.workspaces.push({ slug: "auto-desk", biz: "Auto Shop", name: "Au", pin: H("5252"), createdAt: now, people: [{ id: "p_owner", name: "Au", role: "owner", kind: "owner", status: "approved", pin: H("5252") }] });
    r = await acct("GET", seat("auto-desk", "5252"), null, { settings: "1" });
    const auto = lib.mem.accounts.find((a) => (a.desks || []).indexOf("auto-desk") >= 0);
    if (r.statusCode !== 200 || !has(auto) || auto.kind !== "human") fail("(k) an account made on first use of a desk must store explicit kind human: " + r.statusCode + " " + JSON.stringify(auto));
    // Signing in through open on a desk that has no account yet.
    lib.mem.workspaces.push({ slug: "login-desk", biz: "Login Shop", name: "Lo", pin: H("5353"), createdAt: now, people: [{ id: "p_owner", name: "Lo", role: "owner", kind: "owner", status: "approved", pin: H("5353") }] });
    r = await call("POST", { "x-workspace": "login-desk" }, { slug: "login-desk", pin: "5353", name: "Lo" });
    const login = lib.mem.accounts.find((a) => (a.desks || []).indexOf("login-desk") >= 0);
    if (r.statusCode !== 201 || !has(login) || login.kind !== "human") fail("(k) an account made at sign-in on an open desk must store explicit kind human: " + r.statusCode + " " + JSON.stringify(login && login.kind));
    // Every account this check did not seed has an explicit kind.
    const noKind = lib.mem.accounts.filter((a) => SEEDED.indexOf(a.id) < 0 && !has(a)).map((a) => a.id);
    if (noKind.length) fail("(k) every new account must store an explicit kind; missing on " + JSON.stringify(noKind));
  }
  if (!failed) pass("(k) sign-up (open, account, register), mint, first-use and sign-in accounts store an explicit kind; missing/blank is human; null, unknown, non-string is a 400 that saves nothing");

  // (l) No update path can remove or blank a stored kind.
  {
    const KCLEAR = /^A kind can't be cleared\. Pick human, ai, or si\. Nothing changed\.$/;
    const Hn = () => accById("acct_H");
    const shape = (a) => JSON.stringify({ has: Object.prototype.hasOwnProperty.call(a, "kind"), kind: a.kind, n: a.ownerName, c: a.city || "", e: a.email || "" });
    const clears = [null, "", "   ", undefined];
    for (const [label, hdr, accF] of [["ai self", XS, X], ["si self", SS, S], ["human self", HO, Hn], ["si desk owner self", CY, () => accById("acct_C")]]) {
      const a = accF();
      if (!Object.prototype.hasOwnProperty.call(a, "kind")) fail("(l) fixture " + label + " needs a stored kind");
      for (const v of clears) {
        for (const set of [{ kind: v }, { kind: v, name: "Changed Name", city: "Elsewhere" }]) {
          const before = shape(a);
          zero();
          const r = await acct("POST", hdr, { action: "settings", section: "profile", set });
          if ((r.statusCode !== 400 && r.statusCode !== 403) || r.body.ok !== false || !KCLEAR.test(r.body.error || "")) fail("(l) " + label + ": set.kind " + JSON.stringify(v === undefined ? "undefined" : v) + " must be refused as a clear: " + r.statusCode + " " + JSON.stringify(r.body));
          if (shape(a) !== before || counts.save !== 0) fail("(l) " + label + ": clearing kind must change nothing: " + before + " -> " + shape(a));
        }
      }
      // Whole profile replace (the GET shape with kind blanked), and other sections or top-level keys.
      const g = await acct("GET", hdr, null, { settings: "1" });
      const whole = Object.assign({}, g.body.settings.profile, { kind: null });
      const flat = {}; ["name", "phone", "city", "state", "timezone", "hours", "note"].forEach((k) => { flat[k] = whole[k]; }); flat.kind = "";
      for (const body of [
        { action: "settings", section: "profile", set: whole },
        { action: "settings", section: "profile", set: flat },
        { action: "settings", section: "settings", set: { profile: { kind: null } } },
        { action: "settings", section: "account", set: { kind: null } },
        { action: "settings", section: "profile", set: { kind: null }, kind: null },
        { action: "settings", section: "profile", set: {}, kind: null, accountKind: null },
        { action: "settings", section: "look", set: { theme: "dark", kind: null } }
      ]) {
        const before = shape(a);
        const r = await acct("POST", hdr, body);
        if (r.statusCode !== 400 && r.statusCode !== 403) fail("(l) " + label + ": " + JSON.stringify(body).slice(0, 120) + " must be refused: " + r.statusCode);
        if (shape(a) !== before) fail("(l) " + label + ": " + JSON.stringify(body).slice(0, 120) + " must not touch kind");
      }
      // Older account doors ignore kind entirely.
      for (const body of [{ action: "details", kind: null, accountKind: null }, { action: "profile", kind: "", accountKind: "" }, { action: "mint", accountKind: "" }]) {
        const k0 = JSON.stringify([Object.prototype.hasOwnProperty.call(a, "kind"), a.kind]);
        await acct("POST", hdr, body);
        if (JSON.stringify([Object.prototype.hasOwnProperty.call(a, "kind"), a.kind]) !== k0) fail("(l) " + label + ": account " + body.action + " must not touch kind");
      }
    }
    // Delete, then re-add: the clear is refused, so the stored kind is still there and the lock still holds.
    let r = await acct("POST", XS, { action: "settings", section: "profile", set: { kind: null } });
    r = await acct("POST", XS, { action: "settings", section: "profile", set: { kind: "human" } });
    if (r.statusCode !== 403 || X().kind !== "ai") fail("(l) ai: clear then re-add human must still be the self-lock 403: " + r.statusCode + " " + X().kind);
    r = await acct("POST", HO, { action: "settings", section: "profile", set: { kind: "" } });
    r = await acct("POST", HO, { action: "settings", section: "profile", set: { kind: "human" } });
    if (r.statusCode !== 200 || Hn().kind !== "human" || !Object.prototype.hasOwnProperty.call(Hn(), "kind")) fail("(l) human: clear then re-add keeps an explicit human kind");
    // forSeat: blank kinds are refused too, nothing changes on the seat's account.
    for (const v of clears) {
      const before = shape(X());
      r = await acct("POST", HO, { action: "settings", section: "profile", set: { kind: v }, forSeat: "p_x" });
      if (r.statusCode !== 400 && r.statusCode !== 403) fail("(l) forSeat kind " + JSON.stringify(v === undefined ? "undefined" : v) + " must be refused: " + r.statusCode);
      if (shape(X()) !== before) fail("(l) forSeat kind " + JSON.stringify(v === undefined ? "undefined" : v) + " must change nothing");
    }
    // Re-signup on an existing desk with a blank or missing kind keeps the stored kind.
    const C0 = JSON.stringify(accById("acct_C").kind);
    for (const val of [undefined, "", "   "]) {
      const body = { slug: "other-desk", pin: "1234", name: "Cy" };
      if (val !== undefined) body.accountKind = val;
      await call("POST", { "x-workspace": "other-desk" }, body);
      if (JSON.stringify(accById("acct_C").kind) !== C0) fail("(l) re-signup with accountKind " + JSON.stringify(val) + " must keep the stored kind");
    }
  }
  if (!failed) pass("(l) no update path clears a kind: null, blank, undefined, whole-profile replace, other sections, top-level keys, old doors, clear-then-re-add, forSeat, re-signup");

  lib.save = realSave; lib.log = realLog; global.fetch = realFetch;
  if (!auditMoney()) fail("money rows changed");
  if (!failed && !was) pass("probe 336 fixes hold");
}

function settingsBox(acc) {
  if (!acc.settings || typeof acc.settings !== "object") acc.settings = {};
  if (!acc.settings.automations || typeof acc.settings.automations !== "object") acc.settings.automations = {};
  return acc.settings.automations;
}

main().catch((e) => { console.error("FAIL check-account-kind: " + (e && e.stack ? e.stack : e)); process.exit(1); });

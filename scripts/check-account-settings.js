#!/usr/bin/env node
require("./_env-guard");
// Proves My account settings on /api/account (no network):
// own seat reads and writes; other seats, helper seats on the same desk,
// waiting seats, Desk AI seats, made-up and swapped account ids, and no seat
// get nothing; a secret value never shows up in any reply, error, log line,
// history, audit, or the saved store; secrets are refused with no key;
// Stop and Kill cannot be turned off; every write adds one history line;
// unknown fields are refused; stranger text is stored plain and capped;
// money rows are untouched.
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const store = path.join(os.tmpdir(), "aia-account-settings-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
process.env.AIA_TLD_PROBE = "0";
delete process.env.VERCEL_ENV;
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.AIA_ACCOUNT_SECRETS_KEY;
delete global.__aia;
delete global.__aiaHydrate;

const SECRET = "sk-live-QA-7f3a9c1e5b2d4f6a8c0e";
const SECRET2 = "second-QA-secret-9d8c7b6a5f4e3d2c";
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
  replies.push(JSON.stringify({ s: res.statusCode, b: res.body, h: res.headers }));
  return res;
}

function noData(res, label) {
  const b = res.body || {};
  if (res.statusCode !== 401 && res.statusCode !== 403) fail(label + " must be 401/403, got " + res.statusCode);
  if (b.settings || b.account || b.secrets || b.history || b.ok !== false) fail(label + " must carry no data: " + JSON.stringify(b));
  const keys = Object.keys(b).filter((k) => ["ok", "error", "pending"].indexOf(k) < 0);
  if (keys.length) fail(label + " leaked keys " + keys.join(","));
}

function seat(slug, pin) { return { "x-workspace": slug, "x-pin": pin }; }

async function main() {
  const lib = require(path.join(root, "api/_lib"));
  handler = require(path.join(root, "api/auth"));
  await lib.ready();
  const now = new Date().toISOString();
  const H = (p) => lib.hashPin(p);
  lib.mem.accounts = [
    { id: "acct_A", name: "Own Shop", ownerName: "Ann", email: "ann@example.test", desks: ["own-desk"], memberDesks: [], createdAt: now },
    { id: "acct_B", name: "Bo", ownerName: "Bo", email: "bo@example.test", desks: [], memberDesks: ["own-desk"], createdAt: now },
    { id: "acct_C", name: "Other Shop", ownerName: "Cy", email: "cy@example.test", desks: ["other-desk"], memberDesks: [], createdAt: now }
  ];
  const longName = "<img src=x onerror=alert(1)>" + "Z".repeat(300);
  lib.mem.workspaces = [
    {
      slug: "own-desk", biz: longName, name: "Ann", accountId: "acct_A", pin: H("4821"), createdAt: now,
      rules: [{ id: "r1", text: "Draft a reply <b>when</b> a lead drops", when: "drop", then: "draft" }],
      ais: [{ id: "ai_doer", name: "Doer" }],
      people: [
        { id: "p_owner", name: "Ann", role: "owner", kind: "owner", status: "approved", pin: H("4821"), accountId: "acct_A", email: "ann@example.test" },
        { id: "p_helper", name: "Hal", role: "employee", kind: "helper", status: "approved", pin: H("5555"), accountId: "" },
        { id: "p_swap", name: "Sly", role: "employee", kind: "helper", status: "approved", pin: H("6666"), accountId: "acct_A" },
        { id: "p_wait", name: "Wes", role: "employee", kind: "helper", status: "pending", pin: H("7777"), accountId: "acct_B" },
        { id: "p_ai", name: "Bot", role: "employee", kind: "agent", status: "approved", pin: H("8888"), accountId: "acct_B" },
        { id: "p_bo", name: "Bo", role: "employee", kind: "member", status: "approved", pin: H("9999"), accountId: "acct_B" },
        { id: "p_ghost", name: "Gus", role: "employee", kind: "helper", status: "approved", pin: H("3333"), accountId: "acct_madeup" }
      ]
    },
    {
      slug: "other-desk", biz: "Other Shop", name: "Cy", accountId: "acct_C", pin: H("1234"), createdAt: now,
      people: [{ id: "p_owner", name: "Cy", role: "owner", kind: "owner", status: "approved", pin: H("1234"), accountId: "acct_C" }]
    }
  ];
  lib.mem.money = [{ id: "m1", amount: 5, status: "hold" }];
  const moneyBefore = JSON.stringify(lib.mem.money);
  const A = () => lib.mem.accounts.find((a) => a.id === "acct_A");
  const C = () => lib.mem.accounts.find((a) => a.id === "acct_C");
  const hist = () => (A().history || []).length;

  // Source: one call site in the account handler, no own Lambda, no money modules.
  const src = fs.readFileSync(path.join(root, "api/_account-settings.js"), "utf8");
  const http = fs.readFileSync(path.join(root, "api/_account-http.js"), "utf8");
  if (http.indexOf('require("./_account-settings").handle(req, res)') < 0) fail("_account-http must call _account-settings");
  if (fs.existsSync(path.join(root, "api/account.js"))) fail("api/account.js must not exist (function count)");
  if (/require\(["']\.\/(_packs|_wallets|_connect-wallet|_engine|_aia-register)["']\)/.test(src)) fail("settings must not load money or Collect modules");
  if ((/mem\.money|blobSeal\(/.test(src) || src.indexOf("money" + "PipeLive") >= 0)) fail("settings must not touch money or reuse the plaintext-fallback blobSeal");
  if (/console\.(log|error|warn|info)/.test(src)) fail("settings must not print to the console");
  pass("source: wired once on /api/account, no money modules, no console lines");

  // 1. Own seat reads.
  const own = await call("GET", seat("own-desk", "4821"), null, { settings: "1" });
  if (own.statusCode !== 200 || !own.body.settings || own.body.settings.account.id !== "acct_A") fail("owner read " + own.statusCode + " " + JSON.stringify(own.body));
  else pass("owner reads own settings");
  const s0 = own.body.settings || {};
  ["profile", "talk", "desks", "automations", "look", "secrets", "history"].forEach((k) => { if (!s0[k]) fail("missing section " + k); });
  if (!s0.talk || !s0.talk.notify || s0.talk.notify.available !== false) fail("notify must be available:false");
  if (!s0.automations || !s0.automations.runOnItsOwn || s0.automations.runOnItsOwn.available !== false) fail("runOnItsOwn must be available:false");
  if (!s0.automations || !s0.automations.stopAndKill || s0.automations.stopAndKill.always !== true || s0.automations.stopAndKill.canTurnOff !== false) fail("Stop/Kill must read always on");
  if (!s0.secrets || s0.secrets.available !== false) fail("secrets must read unavailable without key");
  const items = (s0.automations && s0.automations.items) || [];
  if (items.length !== 2 || items.some((i) => !i.stopBefore.money || !i.stopBefore.deletes || !i.stopBefore.messageNew)) fail("stop-before must default on: " + JSON.stringify(items));
  else pass("sections present; unbacked parts say available:false; stop-before defaults on");
  const deskName = (s0.desks && s0.desks.items && s0.desks.items[0] && s0.desks.items[0].name) || "";
  if (/[<>]/.test(deskName) || deskName.length > 80) fail("desk label must be plain and capped: " + deskName);
  else pass("stranger desk label stored plain and capped at 80");

  const tok = lib.issueSession(lib.mem.workspaces[0].people[0], lib.mem.workspaces[0], A(), { headers: {} }).token;
  const viaSession = await call("GET", { "x-session": tok }, null, { settings: "1" });
  if (viaSession.statusCode !== 200 || viaSession.body.settings.account.id !== "acct_A") fail("owner session read " + viaSession.statusCode);
  else pass("owner reads via session");
  const viaCookie = await call("GET", { cookie: "aia_session=" + tok }, null, { settings: "1" });
  if (viaCookie.statusCode !== 200) fail("owner cookie read " + viaCookie.statusCode); else pass("owner reads via aia_session cookie");

  // 2. Refusals with no data.
  noData(await call("GET", {}, null, { settings: "1" }), "no seat");
  noData(await call("GET", seat("own-desk", "0000"), null, { settings: "1" }), "wrong code");
  noData(await call("GET", seat("made-up-desk", "4821"), null, { settings: "1" }), "made-up desk");
  noData(await call("GET", seat("own-desk", "5555"), null, { settings: "1" }), "helper seat with no account");
  noData(await call("GET", seat("own-desk", "6666"), null, { settings: "1" }), "helper seat pointing at owner account");
  noData(await call("GET", seat("own-desk", "7777"), null, { settings: "1" }), "waiting seat");
  noData(await call("GET", seat("own-desk", "8888"), null, { settings: "1" }), "Desk AI seat");
  noData(await call("GET", seat("own-desk", "3333"), null, { settings: "1" }), "seat with made-up account id");
  noData(await call("GET", { "x-session": "not-a-real-token" }, null, { settings: "1" }), "made-up session");
  noData(await call("GET", { "x-session": tok, "x-workspace": "other-desk" }, null, { settings: "1" }), "owner session pointed at another desk");
  const helperWrite = await call("POST", seat("own-desk", "5555"), { action: "settings", section: "profile", set: { name: "Hacked" } });
  noData(helperWrite, "helper write");
  const swapWrite = await call("POST", seat("own-desk", "6666"), { action: "settings", section: "look", set: { theme: "dark" } });
  noData(swapWrite, "swapped helper write");
  noData(await call("POST", seat("own-desk", "7777"), { action: "secret-set", name: "X", value: SECRET }), "waiting seat secret");
  noData(await call("POST", {}, { action: "settings", section: "look", set: { theme: "dark" } }), "no seat write");
  if (A().ownerName !== "Ann" || hist() !== 0) fail("refused writes must not change the account");
  else pass("no seat, wrong code, made-up desk/session/account, helper, swapped, waiting, and Desk AI seats are refused with no data");

  // Member with their own account sees only that account.
  const bo = await call("GET", seat("own-desk", "9999"), null, { settings: "1" });
  if (bo.statusCode !== 200 || bo.body.settings.account.id !== "acct_B") fail("member own account read " + bo.statusCode);
  else if (JSON.stringify(bo.body).indexOf("ann@example.test") >= 0) fail("member read leaked owner email");
  else if ((bo.body.settings.automations.items || []).length) fail("member must not get the owner's automation settings");
  else pass("member seat with its own account reads only that account");
  const boAuto = await call("POST", seat("own-desk", "9999"), { action: "settings", section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", money: false } });
  if (boAuto.statusCode !== 404) fail("member must not change automations on a desk they do not own: " + boAuto.statusCode);
  else pass("member cannot change stop-before on someone else's desk");

  // 3. Swapped / made-up account ids in body or query.
  const swaps = [
    { action: "settings", section: "profile", set: { name: "Swap" }, accountId: "acct_C" },
    { action: "settings", section: "profile", set: { name: "Swap" }, account: "acct_madeup" },
    { action: "settings", section: "profile", set: { name: "Swap", accountId: "acct_C" } },
    { action: "secret-set", name: "SWAP", value: SECRET, accountId: "acct_C" }
  ];
  for (const b of swaps) {
    const r = await call("POST", seat("own-desk", "4821"), b);
    if (r.statusCode !== 403 || r.body.settings) fail("swapped account id must be refused: " + JSON.stringify(b) + " -> " + r.statusCode);
  }
  const qSwap = await call("GET", seat("own-desk", "4821"), null, { settings: "1", accountId: "acct_C" });
  if (qSwap.statusCode !== 403 || qSwap.body.settings) fail("query account id must be refused");
  const same = await call("POST", seat("own-desk", "4821"), { action: "settings", section: "look", set: { theme: "light" }, accountId: "acct_A" });
  if (same.statusCode !== 200) fail("own account id in body is fine: " + same.statusCode);
  if (C().ownerName !== "Cy" || C().history || C().secrets || A().ownerName !== "Ann") fail("swap changed an account");
  else pass("swapped and made-up account ids in body or query are refused; the seat decides the account");

  // 4. Writes add one history line each; stranger text stored plain.
  let h = hist();
  const prof = await call("POST", seat("own-desk", "4821"), { action: "settings", section: "profile", set: { name: "<script>x</script>Ann " + "Q".repeat(200), city: "Springfield" } });
  if (prof.statusCode !== 200) fail("profile write " + prof.statusCode + " " + JSON.stringify(prof.body));
  if (/[<>]/.test(A().ownerName) || A().ownerName.length > 80) fail("name must be plain and capped: " + A().ownerName);
  if (hist() !== h + 1) fail("profile write must add one history line"); else pass("profile write saved plain, capped, and logged");
  h = hist();
  const talk = await call("POST", seat("own-desk", "4821"), { action: "settings", section: "talk", set: { reach: "text" } });
  if (talk.statusCode !== 200 || A().reach !== "text" || hist() !== h + 1) fail("talk write"); else pass("talk write logged");
  h = hist();
  const look = await call("POST", { "x-session": tok }, { action: "settings", section: "look", set: { theme: "dark" } });
  if (look.statusCode !== 200 || A().settings.look.theme !== "dark" || hist() !== h + 1) fail("look write"); else pass("look write logged");
  h = hist();
  const off = await call("POST", seat("own-desk", "4821"), { action: "settings", section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", money: false } });
  const row = off.body && off.body.settings && off.body.settings.automations.items.find((i) => i.id === "r1");
  if (off.statusCode !== 200 || !row || row.stopBefore.money !== false || row.stopBefore.deletes !== true) fail("stop-before money off " + off.statusCode + " " + JSON.stringify(off.body));
  else if (hist() !== h + 1 || !/Turned off stop before money/.test(A().history[0].what)) fail("turning a stop off must be in history: " + JSON.stringify(A().history[0]));
  else pass("turning off stop-before money on one automation is allowed and written to history");
  h = hist();
  const nested = await call("POST", seat("own-desk", "4821"), { action: "settings", section: "automations", set: { desk: "own-desk", kind: "ai", id: "ai_doer", stopBefore: { messageNew: false } } });
  if (nested.statusCode !== 200 || hist() !== h + 1) fail("nested stopBefore write " + nested.statusCode); else pass("nested stopBefore write logged");
  const entry = A().history[0];
  if (!entry.who || !entry.section || !entry.at || !entry.what) fail("history needs who, section, when, what");

  // 5. Whitelist.
  h = hist();
  const bads = [
    { action: "settings", section: "profile", set: { pin: "1111" } },
    { action: "settings", section: "profile", set: { password: "hunter22" } },
    { action: "settings", section: "profile", set: { name: "x" }, extra: 1 },
    { action: "settings", section: "talk", set: { reach: "pigeon" } },
    { action: "settings", section: "look", set: { theme: "neon" } },
    { action: "settings", section: "look", set: { theme: "dark", css: "body{}" } },
    { action: "settings", section: "billing", set: { plan: "crew" } },
    { action: "settings", section: "desks", set: { allow: ["x"] } },
    { action: "settings", section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", money: "no" } },
    { action: "settings", section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", charge: false } },
    { action: "settings", section: "automations", set: { desk: "other-desk", kind: "rule", id: "r1", money: false } },
    { action: "settings", section: "automations", set: { desk: "own-desk", kind: "rule", id: "nope", money: false } },
    { action: "settings", section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", runOnItsOwn: true } },
    { action: "secret-set", name: "OK_NAME", value: "v", note: "x" }
  ];
  for (const b of bads) {
    const r = await call("POST", seat("own-desk", "4821"), b);
    if (r.statusCode < 400 || r.body.ok !== false) fail("whitelist must refuse " + JSON.stringify(b) + " -> " + r.statusCode);
  }
  if (hist() !== h) fail("refused writes must not add history"); else pass("whitelist refuses unknown fields, sections, and values; no history for refusals");

  // 6. Stop and Kill cannot be disabled by any path.
  h = hist();
  const stopKill = [
    { section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", stop: false } },
    { section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", kill: false } },
    { section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", stopAndKill: false } },
    { section: "automations", set: { desk: "own-desk", kind: "rule", id: "r1", stopBefore: { stop: false } } },
    { section: "automations", set: { stopAndKill: { always: false } } },
    { section: "profile", set: { killSwitch: false } },
    { section: "look", set: { stopButton: "hidden" } },
    { section: "talk", set: { canKill: false } },
    { section: "stop", set: { on: false } },
    { section: "kill", set: { on: false } }
  ];
  for (const sk of stopKill) {
    const r = await call("POST", seat("own-desk", "4821"), Object.assign({ action: "settings" }, sk));
    if (r.statusCode < 400) fail("Stop/Kill change must be refused: " + JSON.stringify(sk));
  }
  const after = await call("GET", seat("own-desk", "4821"), null, { settings: "1" });
  const sk2 = after.body.settings.automations.stopAndKill;
  if (sk2.always !== true || sk2.canTurnOff !== false || hist() !== h) fail("Stop/Kill must stay always on");
  if (/stopAndKill\s*\.\s*always\s*=|canTurnOff\s*:\s*true/.test(src)) fail("source must have no path that turns Stop/Kill off");
  else pass("no API path turns Stop or Kill off");

  // 7. Secrets: refused without a key, sealed with one, never echoed.
  h = hist();
  const nokey = await call("POST", seat("own-desk", "4821"), { action: "secret-set", name: "SHOP_KEY", value: SECRET });
  if (nokey.statusCode !== 409 || (A().secrets || []).length || hist() !== h) fail("no key must refuse and store nothing: " + nokey.statusCode);
  else pass("secrets refused with a plain error when the key is not set");
  process.env.AIA_ACCOUNT_SECRETS_KEY = "short";
  const weak = await call("POST", seat("own-desk", "4821"), { action: "secret-set", name: "SHOP_KEY", value: SECRET });
  if (weak.statusCode !== 409) fail("short key must refuse");
  process.env.AIA_ACCOUNT_SECRETS_KEY = "test-only-key-0123456789abcdef0123456789abcdef";
  const put = await call("POST", seat("own-desk", "4821"), { action: "secret-set", name: "SHOP_KEY", value: SECRET });
  if (put.statusCode !== 200 || !put.body.secret || put.body.secret.set !== true || hist() !== h + 1) fail("secret save " + put.statusCode + " " + JSON.stringify(put.body));
  else pass("secret saved; reply has name, set, updatedAt only");
  const again = await call("POST", { "x-session": tok }, { action: "secret-set", name: "SHOP_KEY", value: SECRET2 });
  if (again.statusCode !== 200 || A().secrets.length !== 1 || hist() !== h + 2) fail("secret replace");
  await call("POST", seat("own-desk", "4821"), { action: "secret-set", name: "SHOP_KEY", value: "x".repeat(5000) + SECRET });
  await call("POST", seat("own-desk", "4821"), { action: "secret-set", name: "bad name " + SECRET, value: SECRET });
  await call("POST", seat("own-desk", "4821"), { action: "secret-set", name: "OK2", value: "OK2" });
  const sealed = A().secrets[0].sealed;
  const sealedText = JSON.stringify(sealed);
  if (!sealed || sealed.aia !== "aia-acct-secret-1" || !sealed.iv || !sealed.tag || !sealed.data) fail("secret must be sealed");
  [SECRET, SECRET2, Buffer.from(SECRET2).toString("base64")].forEach((v) => { if (sealedText.indexOf(v) >= 0) fail("sealed blob holds plaintext"); });
  const settingsMod = require(path.join(root, "api/_account-settings"));
  if (settingsMod.openSecret(A(), "SHOP_KEY") !== SECRET2) fail("sealed secret must open server-side with the key");
  if (settingsMod.openSecret(C(), "SHOP_KEY") !== null) fail("another account cannot open it");
  const moved = Object.assign({}, A(), { id: "acct_C" });
  if (settingsMod.openSecret(moved, "SHOP_KEY") !== null) fail("sealed secret is bound to its account");
  pass("secret sealed with AES-256-GCM, bound to account and name");
  const list = await call("GET", seat("own-desk", "4821"), null, { settings: "1" });
  const sec = list.body.settings.secrets;
  if (!sec.available || sec.items.length !== 1 || Object.keys(sec.items[0]).sort().join(",") !== "name,set,updatedAt") fail("secret list shape " + JSON.stringify(sec));
  else pass("GET lists secrets as name, set, updatedAt");
  h = hist();
  const del = await call("DELETE", seat("own-desk", "4821"), null, { secret: "SHOP_KEY" });
  if (del.statusCode !== 200 || A().secrets.length || hist() !== h + 1) fail("DELETE secret " + del.statusCode);
  const del2 = await call("POST", seat("own-desk", "4821"), { action: "secret-remove", name: "SHOP_KEY" });
  if (del2.statusCode !== 404) fail("second remove must 404");
  noData(await call("DELETE", seat("own-desk", "5555"), null, { secret: "SHOP_KEY" }), "helper DELETE");
  pass("secret removed by name and logged; helper DELETE refused");
  await call("POST", seat("own-desk", "4821"), { action: "secret-set", name: "LATER", value: SECRET });

  // 8. The secret value appears nowhere: replies, errors, logs, history, audit, store.
  await lib.save();
  const disk = fs.existsSync(store) ? fs.readFileSync(store, "utf8") : "";
  if (!disk) fail("store file must be written");
  const sealedAll = (A().secrets || []).map((s) => JSON.stringify(s.sealed)).join("");
  const diskNoSealed = disk.split(sealedAll).join("");
  const hay = {
    replies: replies.join("\n"),
    logs: lines.join("\n"),
    history: JSON.stringify(lib.mem.accounts.map((a) => a.history || [])),
    audit: JSON.stringify(lib.mem.audit || []),
    store: diskNoSealed,
    storeFull: disk
  };
  Object.keys(hay).forEach((k) => {
    [SECRET, SECRET2].forEach((v) => { if (hay[k].indexOf(v) >= 0) fail("secret value found in " + k); });
  });
  pass("secret value is in no reply, error, log line, history, audit, or saved store");

  // 9. Money rows unchanged; Collect HOLD check still passes.
  if (JSON.stringify(lib.mem.money) !== moneyBefore) fail("money rows changed");
  const spawn = require("child_process").spawnSync(process.execPath, [path.join(root, "scripts/check-collect-hold.js")], { encoding: "utf8" });
  if (spawn.status !== 0) fail("check-collect-hold failed: " + (spawn.stderr || spawn.stdout).slice(0, 400));
  else pass("money rows untouched; Collect HOLD check passes");

  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  if (pkg.indexOf("scripts/check-account-settings.js") < 0) fail("package.json test must run this check");

  try { fs.unlinkSync(store); } catch (e) {}
  if (!failed) console.log("check-account-settings: ok");
}

main().catch((e) => { console.error("FAIL " + (e && e.stack ? e.stack.split(SECRET).join("[x]") : e)); process.exit(1); });

#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const store = path.join(os.tmpdir(), "aia-account-page-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

["api/_account-http.js", "scripts/check-account-page.js"].forEach(function (name) {
  const syntax = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
  if (syntax.status !== 0) fail(name + " must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
  else pass(name + " parses");
});
(function () {
  const m = read("account.html").match(/<script>\s*const slugEl[\s\S]*?<\/script>/);
  if (!m) {
    fail("account.html script must parse: missing paint script");
    return;
  }
  const tmp = path.join(os.tmpdir(), "aia-account-page-" + Date.now() + ".js");
  fs.writeFileSync(tmp, m[0].replace(/^<script>/, "").replace(/<\/script>$/, ""));
  const check = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  try { fs.unlinkSync(tmp); } catch (e) {}
  if (check.status !== 0) fail("account.html script must parse: " + (check.stderr || check.stdout || "syntax error"));
  else pass("account.html script parses");
})();

const account = read("account.html");
const http = read("api/_account-http.js");
const help = read("help.html");
const more = read("more.html");
const yesNo = read("ACCOUNT-YES-NO.md");
const pkg = read("package.json");

[
  "id=\"phones\"",
  "id=\"phone-list\"",
  "id=\"leave-all\"",
  "id=\"export-book\"",
  "id=\"mfa-on\"",
  "Phones on this account",
  "Leave every phone",
  "Export the book",
  "Export account book",
  "Authenticator",
  "action:\"sessions\"",
  "action:\"export\"",
  "logout-all",
  "action:\"mfa\"",
  "function paintPhones",
  "function leavePhone",
  "No pin. No password hash",
  "Authenticator stays HOLD"
].forEach(function (bit) {
  if (account.indexOf(bit) < 0) fail("account.html missing " + bit);
  else pass("account.html " + bit);
});

if (account.indexOf("leavePhone(false)") < 0) fail("Leave this phone must call logout");
else pass("Leave this phone calls logout");

if (/localStorage\.removeItem\(k\);\}\);[\s]*location\.href="\/login"/.test(account) && account.indexOf("action:all?\"logout-all\":\"logout\"") < 0) {
  fail("Leave this phone must not only wipe localStorage");
} else pass("Leave this phone hits the session API");

if (account.indexOf("d.pack.account.password") >= 0) fail("export paint must not read a password field");
else pass("export does not paint password");

if (http.indexOf("home.sessions") < 0 || http.indexOf("listSessions") < 0) {
  fail("GET /api/account must include the existing session trail");
} else pass("GET account includes sessions");

if (help.indexOf("Account lists phones on this account") < 0 || help.indexOf("leave this phone or every phone") < 0) {
  fail("help Login must name phones / export / leave every phone");
} else pass("help Login names the account trail");
if (help.indexOf("Authenticator stays HOLD") < 0) fail("help Login must keep authenticator HOLD");
else pass("help Login keeps authenticator HOLD");

if (more.indexOf("phones on this account") < 0 || more.indexOf("export the book") < 0 || more.indexOf("leave this phone or every phone") < 0) {
  fail("more.html Account must name phones / export / leave every phone");
} else pass("more.html names the account trail");
if (more.indexOf("authenticator HOLD") < 0) fail("more.html Account must keep authenticator HOLD");
else pass("more.html keeps authenticator HOLD");

if (yesNo.indexOf("check-account-page.js") < 0) fail("ACCOUNT-YES-NO must record the Account phones leftover");
else pass("ACCOUNT-YES-NO records the leftover");
if (pkg.indexOf("check-account-page.js") < 0) fail("package.json must run check-account-page");
else pass("package.json runs check-account-page");

["Collect charge", "silent send", "Wallet.AIA as live", "AIA coin"].forEach(function (bit) {
  if (new RegExp(bit, "i").test(account)) fail("account.html invented fiction: " + bit);
});
if (/mint|ETH|Bridge Register/.test(account) && !/HOLD/.test(account)) {
  fail("account.html must not invent live mint");
}

delete global.__aia;
delete global.__aiaHydrate;
["../api/_lib", "../api/_account", "../api/_plans", "../api/_account-http", "../api/auth"].forEach(function (mod) {
  try { delete require.cache[require.resolve(mod)]; } catch (e) {}
});

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

async function call(handler, method, headers, body, query) {
  const res = mockRes();
  await handler({ method, headers: headers || {}, body: body || {}, query: query || {} }, res);
  return res;
}

(async function () {
  const lib = require("../api/_lib");
  const accountHandler = require("../api/_account-http");
  const auth = require("../api/auth");
  await lib.ready();

  const pin = "4821";
  const opened = await call(auth, "POST", { "x-workspace": "trail-desk" }, {
    action: "open",
    slug: "trail-desk",
    biz: "Trail Desk",
    name: "Pat",
    email: "pat@example.com",
    pin
  });
  if (opened.statusCode !== 201 || !opened.body || !opened.body.account) {
    fail("open should mint the trail desk");
  } else pass("open mints the trail desk");

  const login = await call(accountHandler, "POST", {}, {
    action: "login", slug: "trail-desk", pin, name: "trail-desk"
  });
  const token = login.body && login.body.session && login.body.session.token;
  if (login.statusCode !== 200 || !token || !Array.isArray(login.body.sessions)) {
    fail("login home should include the session trail");
  } else pass("login home includes sessions");
  if (!login.body.sessions.some(function (row) { return row && row.current; })) {
    fail("login home must mark this phone current");
  } else pass("login home marks this phone current");
  if (login.body.sessions.some(function (row) { return row && row.token; })) {
    fail("listed phones must not include the raw session token");
  } else pass("listed phones omit the raw token");

  const got = await call(accountHandler, "GET", { "x-workspace": "trail-desk", "x-session": token });
  if (got.statusCode !== 200 || !Array.isArray(got.body.sessions) || !got.body.sessions.some(function (row) { return row && row.current; })) {
    fail("GET home should paint current phone");
  } else pass("GET home paints current phone");

  const exported = await call(accountHandler, "POST", { "x-workspace": "trail-desk", "x-session": token }, { action: "export" });
  const pack = exported.body && exported.body.pack;
  const deskJson = JSON.stringify(pack || {});
  if (exported.statusCode !== 200 || !pack || (pack.account && pack.account.password) || /"pin"\s*:/.test(deskJson) || /"password"\s*:/.test(deskJson)) {
    fail("export book must omit pin and password hash");
  } else pass("export book omits pin and password hash");

  const mfa = await call(accountHandler, "POST", { "x-workspace": "trail-desk", "x-session": token }, { action: "mfa", on: true });
  if (mfa.statusCode !== 409 || !mfa.body.hold) fail("authenticator on must stay HOLD");
  else pass("authenticator stays HOLD");

  if (failed) {
    console.error("check-account-page failed");
    process.exit(1);
  }
  console.log("check-account-page passed");
})().catch(function (err) {
  fail(err && err.stack || String(err));
  console.error("check-account-page failed");
  process.exit(1);
});

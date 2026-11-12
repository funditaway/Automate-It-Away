#!/usr/bin/env node
"use strict";
require("./_env-guard");

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

function tellsNoCodeAndNoHash(s) {
  return (/no desk code/i.test(s) || /no pin/i.test(s)) && /no password hash/i.test(s);
}
function exportCard(accountSrc) {
  const start = accountSrc.indexOf('id="export-card"');
  if (start < 0) return "";
  const end = accountSrc.indexOf('id="mfa-card"', start);
  return accountSrc.slice(start, end > start ? end : start + 900);
}
function exportSuccessLine(accountSrc) {
  const m = accountSrc.match(/hint\.textContent\s*=\s*"(Exported\.[^"]+)"/);
  return m ? m[1] : "";
}
function mfaCard(accountSrc) {
  const start = accountSrc.indexOf('id="mfa-card"');
  if (start < 0) return "";
  const end = accountSrc.indexOf("</div>", accountSrc.indexOf("mfa-hint", start));
  return accountSrc.slice(start, end > start ? end + 6 : start + 700);
}
function actFn(accountSrc) {
  const start = accountSrc.indexOf("async function act(");
  if (start < 0) return "";
  const end = accountSrc.indexOf('document.getElementById("gate").onsubmit', start);
  return accountSrc.slice(start, end > start ? end : start + 1500);
}
function mfaClickFn(accountSrc) {
  const start = accountSrc.indexOf('getElementById("mfa-on").onclick');
  if (start < 0) return "";
  const end = accountSrc.indexOf("async function act(", start);
  return accountSrc.slice(start, end > start ? end : start + 900);
}
function mfaHttpFn(httpSrc) {
  const start = httpSrc.indexOf('if (action === "mfa")');
  if (start < 0) return "";
  const end = httpSrc.indexOf('if (action === "', start + 10);
  return httpSrc.slice(start, end > start ? end : start + 900);
}
function moreAccountBody(tipsSrc) {
  const start = tipsSrc.indexOf('"more-account"');
  if (start < 0) return "";
  const bodyAt = tipsSrc.indexOf("body:", start);
  const m = tipsSrc.slice(bodyAt, bodyAt + 800).match(/body:\s*"([^"]+)"/);
  return m ? m[1] : "";
}
function tipImpliesAuthOn(body) {
  return /authenticator is on|authenticator is live|two-step is on|two-step sign-in is on|authenticator is ready/i.test(body || "");
}

function accountPageFaults(accountSrc, tipsSrc, httpSrc) {
  const bad = [];
  if (!tellsNoCodeAndNoHash(exportCard(accountSrc)) || !tellsNoCodeAndNoHash(exportSuccessLine(accountSrc))) {
    bad.push("no-pin line removed");
  }
  const mfaFn = mfaHttpFn(httpSrc);
  const turnsOn = !mfaFn
    || /account\.mfaOn\s*=\s*true/.test(mfaFn)
    || !/status\(\s*409\s*\)/.test(mfaFn)
    || !/hold:\s*true/.test(mfaFn);
  if (turnsOn) bad.push("authenticator turns on without Yes");
  const act = actFn(accountSrc);
  const okAt = act.indexOf("if(!r.ok)");
  const pinAt = act.indexOf('localStorage.setItem("aia_pin"');
  if (pinAt >= 0 && (okAt < 0 || pinAt < okAt)) bad.push("pin stored in localStorage");
  const sessionAt = act.indexOf('localStorage.setItem("aia_session"');
  const paintAt = act.indexOf("paint(d)");
  if (!act || okAt < 0 || (sessionAt >= 0 && sessionAt < okAt) || (paintAt >= 0 && paintAt < okAt)) {
    bad.push("wrong pin accepted");
  }
  return bad;
}

function applyMutant(accountSrc, tipsSrc, httpSrc, kind) {
  let account = accountSrc, tips = tipsSrc, http = httpSrc;
  if (kind === "no-pin line removed") {
    account = account.replace(/No desk code\. No password hash\. /g, "").replace(/No pin\. No password hash\. /g, "");
  } else if (kind === "authenticator turns on without Yes") {
    http = http.replace(
      "    if (on) {\n      return res.status(409).json({ ok: false, hold: true, error: \"Two-step sign-in is off for now.\" });\n    }",
      "    if (on) {\n      account.mfaOn = true;\n      return res.status(200).json({ ok: true, mfaOn: true });\n    }"
    );
  } else if (kind === "pin stored in localStorage") {
    account = account.replace(
      "      if(!r.ok){err.style.display=\"block\";err.textContent=d.error||\"Could not open.\";return;}\n      if(d.session&&d.session.token) localStorage.setItem(\"aia_session\",d.session.token);\n      if(slug) localStorage.setItem(\"aia_ws\",slug);\n      if(pinEl.value) localStorage.setItem(\"aia_pin\",pinEl.value);",
      "      if(pinEl.value) localStorage.setItem(\"aia_pin\",pinEl.value);\n      if(!r.ok){err.style.display=\"block\";err.textContent=d.error||\"Could not open.\";return;}\n      if(d.session&&d.session.token) localStorage.setItem(\"aia_session\",d.session.token);\n      if(slug) localStorage.setItem(\"aia_ws\",slug);"
    );
  } else if (kind === "wrong pin accepted") {
    account = account.replace(
      "      if(!r.ok){err.style.display=\"block\";err.textContent=d.error||\"Could not open.\";return;}\n",
      ""
    );
  }
  return { account: account, tips: tips, http: http };
}

const account = read("account.html");
const http = read("api/_account-http.js");
const help = read("help.html");
const more = read("more.html");
const moreTips = more + "\n" + read("aia-tip.js");
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
  "Authenticator stays HOLD"
].forEach(function (bit) {
  if (account.indexOf(bit) < 0) fail("account.html missing " + bit);
  else pass("account.html " + bit);
});

if (!tellsNoCodeAndNoHash(exportCard(account))) fail("account.html export card must still say AIA keeps no desk code (or pin) and no password hash");
else pass("account.html export card keeps no desk code and no password hash");
if (!tellsNoCodeAndNoHash(exportSuccessLine(account))) fail("account.html export success must still say AIA keeps no desk code (or pin) and no password hash");
else pass("account.html export success keeps no desk code and no password hash");

const mfaPaint = mfaCard(account);
if (!/off for now/i.test(mfaPaint) || !/Authenticator is off for now/i.test(account)) {
  fail("account.html authenticator card must stay off for now");
} else pass("account.html authenticator card stays off for now");
const mfaClick = mfaClickFn(account);
if (!mfaClick || !/on:\s*true/.test(mfaClick) || !/Authenticator stays HOLD|stays HOLD/.test(mfaClick)) {
  fail("account.html authenticator click must stay HOLD when the desk holds it");
} else pass("account.html authenticator click paints HOLD");

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

if (moreTips.indexOf("phones on this account") < 0 || moreTips.indexOf("export the book") < 0 || moreTips.indexOf("leave this phone or every phone") < 0) {
  fail("more Account tip must name phones / export / leave every phone");
} else pass("more Account tip names the account trail");
if (tipImpliesAuthOn(moreAccountBody(moreTips))) fail("more Account tip must not say the authenticator is on");
else pass("more Account tip does not say the authenticator is on");
if (more.indexOf('data-aia-tip="more-account"') < 0) fail("more.html must wire more-account tip");
else pass("more.html wires more-account tip");

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

const liveFaults = accountPageFaults(account, moreTips, http);
if (liveFaults.length) fail("account page behaviour drifted: " + liveFaults.join("; "));
else pass("export honesty, authenticator hold, and pin gate still hold");

const mutants = [
  "no-pin line removed",
  "authenticator turns on without Yes",
  "pin stored in localStorage",
  "wrong pin accepted"
];
let caught = 0;
mutants.forEach(function (kind) {
  const next = applyMutant(account, moreTips, http, kind);
  const faults = accountPageFaults(next.account, next.tips, next.http);
  if (faults.indexOf(kind) < 0) {
    fail("mutant missed: " + kind + " (got " + JSON.stringify(faults) + ")");
  } else {
    caught += 1;
    pass("mutant caught: " + kind);
  }
});
if (caught !== mutants.length) fail("mutants: " + caught + "/" + mutants.length + " caught");
else pass("mutants: " + caught + "/" + mutants.length + " caught");

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

  function trailAcc() {
    const w = (lib.mem.workspaces || []).find(function (row) { return row && row.slug === "trail-desk"; });
    return (lib.mem.accounts || []).find(function (a) { return a && w && a.id === w.accountId; }) || null;
  }

  const pin = "4821";
  const opened = await call(auth, "POST", { "x-workspace": "trail-desk" }, {
    action: "open",
    slug: "trail-desk",
    biz: "Trail Desk",
    name: "Pat",
    email: "pat@example.com",
    pin,
    password: "pat-pass-1234"
  });
  if (opened.statusCode !== 201 || !opened.body || !opened.body.account) {
    fail("open should mint the trail desk");
  } else pass("open mints the trail desk");

  const empty = await call(accountHandler, "POST", {}, {
    action: "login", slug: "trail-desk", pin: "", name: "trail-desk"
  });
  if (empty.statusCode === 200 || (empty.body && empty.body.session && empty.body.session.token)) {
    fail("empty pin must not be accepted");
  } else pass("empty pin is not accepted");

  const wrong = await call(accountHandler, "POST", {}, {
    action: "login", slug: "trail-desk", pin: "0000", name: "trail-desk"
  });
  if (wrong.statusCode === 200 || (wrong.body && wrong.body.session && wrong.body.session.token)) {
    fail("wrong pin must not be accepted");
  } else pass("wrong pin is not accepted");

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
  if (login.body.account && login.body.account.mfaOn) {
    fail("login home must not paint authenticator on");
  } else pass("login home keeps authenticator off");

  const got = await call(accountHandler, "GET", { "x-workspace": "trail-desk", "x-session": token });
  if (got.statusCode !== 200 || !Array.isArray(got.body.sessions) || !got.body.sessions.some(function (row) { return row && row.current; })) {
    fail("GET home should paint current phone");
  } else pass("GET home paints current phone");
  if (got.body.account && got.body.account.mfaOn) fail("GET home must keep authenticator off");
  else pass("GET home keeps authenticator off");

  const exported = await call(accountHandler, "POST", { "x-workspace": "trail-desk", "x-session": token }, { action: "export" });
  const pack = exported.body && exported.body.pack;
  const deskJson = JSON.stringify(pack || {});
  if (exported.statusCode !== 200 || !pack || (pack.account && pack.account.password) || /"pin"\s*:/.test(deskJson) || /"password"\s*:/.test(deskJson)) {
    fail("export book must omit pin and password hash");
  } else pass("export book omits pin and password hash");

  const beforePin = trailAcc() && trailAcc().mfaOn;
  const mfaPin = await call(accountHandler, "POST", { "x-workspace": "trail-desk", "x-session": token }, { action: "mfa", on: true });
  const afterPin = trailAcc() && trailAcc().mfaOn;
  if (mfaPin.statusCode === 200 && mfaPin.body && (mfaPin.body.ok || mfaPin.body.mfaOn) || afterPin) {
    fail("desk-code session must not turn the authenticator on");
  } else pass("desk-code session cannot turn the authenticator on");
  if (beforePin) fail("authenticator was already on before the desk-code tap");

  const emailLogin = await call(accountHandler, "POST", {}, {
    action: "login", email: "pat@example.com", password: "pat-pass-1234"
  });
  const etok = emailLogin.body && emailLogin.body.session && emailLogin.body.session.token;
  if (emailLogin.statusCode !== 200 || !etok) fail("email + password should open the account");
  else pass("email + password opens the account");

  const before = trailAcc() && trailAcc().mfaOn;
  const mfa = await call(accountHandler, "POST", { "x-workspace": "trail-desk", "x-session": etok }, { action: "mfa", on: true });
  const after = trailAcc() && trailAcc().mfaOn;
  if (mfa.statusCode !== 409 || !mfa.body || !mfa.body.hold || after) {
    fail("authenticator on must stay HOLD");
  } else pass("authenticator stays HOLD");
  if (before) fail("authenticator was already on before the proven tap");

  const mfaOff = await call(accountHandler, "POST", { "x-workspace": "trail-desk", "x-session": etok }, { action: "mfa", on: false });
  if (!mfaOff.body || mfaOff.body.mfaOn || !mfaOff.body.hold || (trailAcc() && trailAcc().mfaOn)) {
    fail("authenticator off must stay held off");
  } else pass("authenticator off stays held off");

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

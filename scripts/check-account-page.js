#!/usr/bin/env node
"use strict";
require("./_env-guard");

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const vm = require("vm");

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

function pinFieldIsPassword(accountSrc) {
  const m = accountSrc.match(/<input\b[^>]*id="pin"[^>]*>/i);
  if (!m) return false;
  return /\btype="password"/.test(m[0]);
}
function storedPinInWrite(accountSrc) {
  if (accountSrc.indexOf('localStorage.getItem("aia_pin")') >= 0) return true;
  if (accountSrc.indexOf('pinEl.value=localStorage.getItem("aia_pin")') >= 0) return true;
  return false;
}
function pinInUrlOrWriteBody(accountSrc) {
  if (/[?&]pin=/.test(accountSrc)) return true;
  if (/action:"details"[^;]*\bpin:localStorage/.test(accountSrc)) return true;
  if (/action:"export"[^;]*\bpin:localStorage/.test(accountSrc)) return true;
  if (/action:"sessions"[^;]*\bpin:localStorage/.test(accountSrc)) return true;
  if (/action:"mfa"[^;]*\bpin:localStorage/.test(accountSrc)) return true;
  if (/action:"handle"[^;]*\bpin:localStorage/.test(accountSrc)) return true;
  if (/action:"password"[^;]*\bpin:localStorage/.test(accountSrc)) return true;
  return false;
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
  if (accountSrc.indexOf('localStorage.setItem("aia_pin"') >= 0) bad.push("pin stored in localStorage");
  const sessionAt = act.indexOf('localStorage.setItem("aia_session"');
  const paintAt = act.indexOf("paint(d)");
  if (!act || okAt < 0 || (sessionAt >= 0 && sessionAt < okAt) || (paintAt >= 0 && paintAt < okAt)) {
    bad.push("wrong pin accepted");
  }
  if (!pinFieldIsPassword(accountSrc)) bad.push("pin field type=text");
  if (storedPinInWrite(accountSrc)) bad.push("stored pin read for writes");
  if (pinInUrlOrWriteBody(accountSrc)) bad.push("pin in the URL or body");
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
      "      if(d.session&&d.session.token) localStorage.setItem(\"aia_session\",d.session.token);",
      "      if(d.session&&d.session.token) localStorage.setItem(\"aia_session\",d.session.token);\n      if(pinEl.value) localStorage.setItem(\"aia_pin\",pinEl.value);"
    );
  } else if (kind === "pin field type=text") {
    account = account.replace('id="pin" type="password"', 'id="pin" type="text"');
  } else if (kind === "stored pin read for writes") {
    account = account.replace(
      'const r=await fetch("/api/account",{method:"POST",headers:hdr(slug),body:JSON.stringify({action:"details"',
      'const pin=localStorage.getItem("aia_pin")||"";const r=await fetch("/api/account",{method:"POST",headers:hdr(slug,pin),body:JSON.stringify({action:"details"'
    );
  } else if (kind === "pin in the URL or body") {
    account = account.replace(
      'fetch("/api/account",{method:"GET",headers:hdr(localStorage.getItem("aia_ws")||"")})',
      'fetch("/api/account?pin="+encodeURIComponent(localStorage.getItem("aia_pin")||""),{method:"GET",headers:hdr(localStorage.getItem("aia_ws")||"")})'
    );
  } else if (kind === "wrong pin accepted") {
    account = account.replace(
      "      if(!r.ok){err.style.display=\"block\";err.textContent=d.error||\"Could not open.\";return;}\n",
      ""
    );
  }
  return { account: account, tips: tips, http: http };
}


function memStore(seed) {
  const m = Object.assign({}, seed || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? String(m[k]) : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    _raw: m
  };
}

function makeEl(id, extra) {
  const el = Object.assign({
    id: id || "",
    tagName: "DIV",
    hidden: false,
    textContent: "",
    innerHTML: "",
    value: "",
    className: "",
    style: { display: "" },
    children: [],
    attributes: {},
    classList: {
      add: function () {},
      remove: function () {},
      contains: function () { return false; },
      toggle: function () {}
    },
    setAttribute: function (k, v) { this.attributes[k] = String(v); if (k === "hidden") this.hidden = true; },
    getAttribute: function (k) { return this.attributes[k] == null ? null : this.attributes[k]; },
    addEventListener: function (ev, fn) {
      this._l = this._l || {};
      (this._l[ev] = this._l[ev] || []).push(fn);
    },
    appendChild: function (c) { this.children.push(c); return c; },
    replaceChildren: function () { this.children = []; }
  }, extra || {});
  return el;
}

function extractScript(html, needle) {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (/\bsrc\s*=/.test(m[1] || "")) continue;
    if (!needle || m[2].indexOf(needle) >= 0) return m[2];
  }
  return "";
}

function idsFrom(html) {
  const ids = {};
  const re = /<([a-zA-Z0-9]+)([^>]*?)\bid="([^"]+)"([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1];
    const attrs = (m[2] || "") + " " + (m[4] || "");
    const el = makeEl(m[3], { tagName: String(tag).toUpperCase(), hidden: /\bhidden\b/.test(attrs) });
    const typ = attrs.match(/\btype="([^"]*)"/);
    if (typ) el.type = typ[1];
    const auto = attrs.match(/\bautocomplete="([^"]*)"/);
    if (auto) el.autocomplete = auto[1];
    ids[m[3]] = el;
  }
  return ids;
}

function loginPayload() {
  return {
    ok: true,
    account: {
      name: "Alex Rivera",
      email: "",
      phone: "",
      city: "Springfield",
      hasPassword: false,
      createdAt: "2026-11-11T00:00:00Z",
      slug: "oddo-house",
      id: "acct-1"
    },
    workspace: { slug: "oddo-house", biz: "Oddo house", name: "Oddo house" },
    you: { role: "owner", name: "Alex Rivera" },
    session: { token: "sess-account-1" },
    plan: { name: "free", plan: "free", catalog: [] },
    sessions: []
  };
}

function runSwitch(switchSrc, store) {
  const window = { localStorage: store };
  const ctx = {
    window: window,
    localStorage: store,
    console: console,
    JSON: JSON,
    String: String,
    Array: Array,
    Object: Object,
    Error: Error
  };
  ctx.globalThis = window;
  ctx.window.window = window;
  vm.runInNewContext(switchSrc, ctx);
  ctx.AIADesks = window.AIADesks;
  return { window: window, ctx: ctx, store: store };
}

function keepSessionWritesPin(switchSrc) {
  const store = memStore();
  const pinWrites = [];
  const rawSet = store.setItem;
  store.setItem = function (k, v) {
    if (k === "aia_pin") pinWrites.push(String(v));
    return rawSet.call(store, k, v);
  };
  const ran = runSwitch(switchSrc, store);
  ran.window.AIADesks.keepSession(loginPayload(), "6612");
  let rows = [];
  try { rows = JSON.parse(store.getItem("aia_desks") || "[]"); } catch (e) { rows = []; }
  const rowPin = rows.some(function (d) { return d && d.slug === "oddo-house" && d.pin; });
  return pinWrites.length > 0 || !!store.getItem("aia_pin") || rowPin;
}

async function bootAccountSignIn(accountSrc, switchSrc) {
  const store = memStore();
  const ids = idsFrom(accountSrc);
  const calls = [];
  const fetchImpl = async function (url, opts) {
    const headers = (opts && opts.headers) || {};
    let body = {};
    try { body = JSON.parse((opts && opts.body) || "{}"); } catch (e) { body = {}; }
    calls.push({ url: String(url), method: (opts && opts.method) || "GET", headers: headers, body: body });
    const action = body && body.action;
    if (action === "login" || String(url).indexOf("/api/account") >= 0) {
      return { ok: true, status: 200, json: async function () { return loginPayload(); } };
    }
    return { ok: true, status: 200, json: async function () { return { ok: true }; } };
  };
  const document = {
    getElementById: function (id) { return ids[id] || null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
    readyState: "complete",
    createElement: function (tag) { return makeEl("", { tagName: String(tag).toUpperCase() }); },
    documentElement: makeEl("html"),
    body: makeEl("body")
  };
  const location = { href: "http://127.0.0.1/account.html" };
  const window = { localStorage: store, document: document, location: location, fetch: fetchImpl };
  document.defaultView = window;
  const ctx = {
    window: window,
    document: document,
    localStorage: store,
    location: location,
    fetch: fetchImpl,
    console: console,
    JSON: JSON,
    String: String,
    Array: Array,
    Object: Object,
    Number: Number,
    Boolean: Boolean,
    Error: Error,
    setTimeout: function (fn) { fn(); },
    clearTimeout: function () {},
    URL: URL,
    URLSearchParams: URLSearchParams,
    matchMedia: function () { return { matches: false, addListener: function () {}, addEventListener: function () {} }; }
  };
  ctx.globalThis = window;
  ctx.window.window = window;
  ctx.window.matchMedia = ctx.matchMedia;
  vm.runInNewContext(switchSrc, ctx);
  ctx.AIADesks = window.AIADesks;
  window.AIADesks = window.AIADesks;
  const script = extractScript(accountSrc, "async function act(");
  if (!script) throw new Error("account.html missing act()");
  vm.runInNewContext(script, ctx);
  ids.slug.value = "Oddo house";
  ids.pin.value = "6612";
  const ev = { preventDefault: function () {}, target: ids.gate };
  let threw = null;
  try {
    await ids.gate.onsubmit(ev);
  } catch (e) {
    threw = e;
  }
  return {
    store: store,
    ids: ids,
    threw: threw,
    painted: !!(ids.facts && /Account book/.test(ids.facts.innerHTML || ids.facts.textContent || "")),
    gateHidden: !!(ids.gate && ids.gate.hidden),
    pinValue: ids.pin ? ids.pin.value : "",
    calls: calls,
    window: window
  };
}

function signInFaults(result) {
  const bad = [];
  if (result.threw) bad.push("sign-in must paint without throwing");
  if (!result.painted || !result.gateHidden) bad.push("sign-in must paint without throwing");
  if (result.pinValue) bad.push("field not cleared after sign-in");
  if (result.store.getItem("aia_pin")) bad.push("pin stored in localStorage");
  return bad;
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
  "wrong pin accepted",
  "pin field type=text",
  "stored pin read for writes",
  "pin in the URL or body"
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


  const switchSrc = read("desk-switch.js");
  if (keepSessionWritesPin(switchSrc)) fail("keepSession must not write a desk code");
  else pass("keepSession does not write a desk code");

  const liveSignIn = await bootAccountSignIn(account, switchSrc);
  const liveFaults = signInFaults(liveSignIn);
  if (liveFaults.length) fail("account sign-in did not paint safely: " + liveFaults.join("; ") + (liveSignIn.threw ? " threw " + liveSignIn.threw : ""));
  else pass("account sign-in paints, clears the field, and stores no desk code");
  if (liveSignIn.store.getItem("aia_session") !== "sess-account-1") fail("account sign-in must keep the returned session");
  else pass("account sign-in keeps the returned session");

  const behavior = [
    {
      kind: "keepSession writing the pin",
      switchSrc: switchSrc.replace("      pin: \"\",", "      pin: pin || \"\",").replace(/if \(store\) \{\n      try \{ store\.removeItem\("aia_pin"\); \} catch \(e\) \{\}\n    \}\n    if \(slug\) \{[\s\S]*?if \(dirty\) write\(rows\);\n    \}/, "")
    },
    {
      kind: "field not cleared after sign-in",
      account: account.replace("      pinEl.value=\"\";\n", "")
    },
    {
      kind: "sign-in must paint without throwing",
      switchSrc: switchSrc.replace("      var rows = list();\n      var dirty = false;", "      var rows = load();\n      var dirty = false;")
    }
  ];
  let behaviorCaught = 0;
  for (let i = 0; i < behavior.length; i++) {
    const kind = behavior[i].kind;
    const nextAccount = behavior[i].account || account;
    const nextSwitch = behavior[i].switchSrc || switchSrc;
    let caught = false;
    if (kind === "keepSession writing the pin") {
      caught = keepSessionWritesPin(nextSwitch);
    } else {
      const result = await bootAccountSignIn(nextAccount, nextSwitch);
      caught = signInFaults(result).indexOf(kind) >= 0;
    }
    if (!caught) fail("mutant missed: " + kind);
    else { behaviorCaught += 1; pass("mutant caught: " + kind); }
  }
  if (behaviorCaught !== behavior.length) fail("behavioural mutants: " + behaviorCaught + "/" + behavior.length + " caught");
  else pass("behavioural mutants: " + behaviorCaught + "/" + behavior.length + " caught");

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

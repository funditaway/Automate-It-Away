#!/usr/bin/env node
require("./_env-guard");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");
const root = path.join(__dirname, "..");

const DESK_PIN_SIZE = 35485;
const DESK_PIN_SHA = "d84ad086270c2abf2e20e101488976b1db7abf82db0bef5d14747c83a749f8db";

let failed = 0;
function fail(msg) { failed += 1; console.error("FAIL " + msg); }
function pass(msg) { console.log("ok  " + msg); }

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function must(hay, needle, label) {
  if (!hay.includes(needle)) fail("missing " + label + ": " + needle);
  else pass(label);
}

function pinFieldTag(html) {
  const m = html.match(/<input\b[^>]*name="pin"[^>]*>/i);
  return m ? m[0] : "";
}
function pinFieldIsPassword(html) {
  return /\btype="password"/.test(pinFieldTag(html));
}

function onboardFaults(html) {
  const bad = [];
  const start = html.indexOf("form.onsubmit");
  const end = html.indexOf("</script>", start);
  const src = start >= 0 && end > start ? html.slice(start, end) : html;
  if (src.indexOf('localStorage.setItem("aia_pin"') >= 0) bad.push("pin stored");
  if (!pinFieldIsPassword(html)) bad.push("field type=text");
  return bad;
}

function applyMutant(html, kind) {
  if (kind === "pin stored") {
    return html.replace(
      'localStorage.setItem("aia_ws", slug);',
      'localStorage.setItem("aia_ws", slug);\n        localStorage.setItem("aia_pin", pin);'
    );
  }
  if (kind === "field type=text") {
    return html.replace('name="pin" type="password"', 'name="pin" type="text"');
  }
  return html;
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

function extractInline(html, needle) {
  const parts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (/\bsrc\s*=/.test(m[1] || "")) continue;
    if (needle && m[2].indexOf(needle) < 0) continue;
    parts.push(m[2]);
  }
  return parts.join("\n");
}

function el(id, extra) {
  return Object.assign({
    id: id,
    tagName: "DIV",
    hidden: false,
    textContent: "",
    value: "",
    style: { display: "" },
    classList: { contains: function () { return false; }, add: function () {}, remove: function () {}, toggle: function () {} },
    children: [],
    attributes: {},
    setAttribute: function (k, v) { this.attributes[k] = String(v); },
    getAttribute: function (k) { return this.attributes[k] == null ? null : this.attributes[k]; },
    addEventListener: function (ev, fn) {
      this._l = this._l || {};
      (this._l[ev] = this._l[ev] || []).push(fn);
    },
    appendChild: function (c) { this.children.push(c); return c; },
    replaceChildren: function () { this.children = []; },
    querySelectorAll: function () { return []; },
    querySelector: function () { return null; }
  }, extra || {});
}

async function runOnboard(onboardHtml, switchSrc, opts) {
  opts = opts || {};
  const store = memStore(opts.store || {});
  const location = { href: "http://127.0.0.1/onboard.html" };
  const els = {
    form: el("form"),
    role: el("role", { value: opts.role || "owner" }),
    "member-box": el("member-box", { hidden: true }),
    go: el("go", { textContent: "Open my Queue" }),
    hint: el("hint", { textContent: "" }),
    err: el("err", { style: { display: "none" } })
  };
  const values = Object.assign({
    name: "Alex Rivera",
    biz: "Oddo house",
    city: "Springfield",
    model: "Home & family",
    email: "",
    role: opts.role || "owner",
    pin: opts.pin || "6612",
    kind: ""
  }, opts.values || {});
  function FormData() {
    this.get = function (k) { return values[k] == null ? "" : values[k]; };
  }
  const fetchImpl = opts.fetch || async function () {
    return {
      ok: true,
      status: 200,
      json: async function () {
        return {
          ok: true,
          workspace: { slug: "oddo-house", biz: "Oddo house", name: "Oddo house" },
          you: { role: "owner", name: "Alex Rivera" },
          session: { token: "sess-onboard-1" },
          account: { id: "acct-1", slug: "oddo-house" }
        };
      }
    };
  };
  const document = {
    getElementById: function (id) { return els[id] || null; },
    addEventListener: function () {},
    readyState: "complete",
    createElement: function (tag) { return el("", { tagName: String(tag).toUpperCase() }); },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    body: el("body")
  };
  const window = {
    localStorage: store,
    location: location,
    document: document,
    fetch: fetchImpl
  };
  document.defaultView = window;
  const ctx = {
    window: window,
    document: document,
    localStorage: store,
    location: location,
    fetch: fetchImpl,
    FormData: FormData,
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
  document.documentElement = el("html");
  window.matchMedia = ctx.matchMedia;
  ctx.globalThis = ctx;
  ctx.window.window = window;
  vm.runInNewContext(switchSrc, ctx);
  ctx.AIADesks = window.AIADesks;
  ctx.window.AIADesks = window.AIADesks;
  vm.runInNewContext(extractInline(onboardHtml, "form.onsubmit"), ctx);
  const ev = { preventDefault: function () {}, target: els.form };
  await els.form.onsubmit(ev);
  return { store: store, location: location, els: els, window: window };
}

function paintDeskGate(store, switchSrc, deskHtml) {
  const location = { href: "http://127.0.0.1/desk.html", pathname: "/desk.html", search: "", hash: "" };
  const els = {
    ws: el("ws", { value: "" }),
    pin: el("pin", { value: "" }),
    gate: el("gate", { hidden: false }),
    session: el("session", { hidden: true }),
    "who-line": el("who-line"),
    "desk-switch": el("desk-switch", { hidden: true }),
    "desk-list": el("desk-list"),
    banner: el("banner", { textContent: "This desk’s work." }),
    queue: el("queue"),
    "nav-consign": el("nav-consign", { hidden: true }),
    "queue-filters": el("queue-filters", { hidden: true }),
    "pack-filters": el("pack-filters", { hidden: true }),
    "recent-label": el("recent-label", { hidden: true }),
    recent: el("recent"),
    "rules-line": el("rules-line"),
    "cap-band": el("cap-band", { hidden: true }),
    "cap-list": el("cap-list"),
    "step-words": el("step-words"),
    "widget-count": el("widget-count"),
    "rule-widgets": el("rule-widgets"),
    "desk-ais": el("desk-ais", { hidden: true }),
    "aia-wallet": el("aia-wallet"),
    "drop-go": el("drop-go", { tagName: "A" }),
    sheet: el("sheet"),
    "sheet-card": el("sheet-card")
  };
  const document = {
    getElementById: function (id) { return els[id] || null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
    readyState: "complete",
    createElement: function (tag) { return el("", { tagName: String(tag).toUpperCase() }); },
    body: el("body")
  };
  const fetchImpl = async function (url) {
    return {
      status: 200,
      json: async function () {
        if (String(url).indexOf("/api/jobs") >= 0) return { ok: true, jobs: [] };
        if (String(url).indexOf("/api/health") >= 0) return { ok: true, store: {} };
        return { ok: true };
      }
    };
  };
  const window = {
    localStorage: store,
    location: location,
    document: document,
    fetch: fetchImpl
  };
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
    parseInt: parseInt,
    isFinite: Number.isFinite,
    URL: URL,
    URLSearchParams: URLSearchParams,
    setTimeout: function () {},
    clearTimeout: function () {},
    setInterval: function () { return 0; },
    clearInterval: function () {},
    escapeHtml: function (s) { return String(s || ""); },
    safeId: function (s) { return String(s || ""); },
    safeUrl: function () { return ""; },
    visitorLine: function (s) { return s || ""; },
    matchMedia: function () { return { matches: false, addListener: function () {}, addEventListener: function () {} }; }
  };
  document.documentElement = el("html");
  window.matchMedia = ctx.matchMedia;
  ctx.globalThis = ctx;
  ctx.window.window = window;
  vm.runInNewContext(switchSrc, ctx);
  ctx.AIADesks = window.AIADesks;
  ctx.window.AIADesks = window.AIADesks;
  try {
    vm.runInNewContext(extractInline(deskHtml, "function paintGate"), ctx);
  } catch (e) {
    // paintGate may still have run before a later helper threw
    ctx._bootError = e;
  }
  return { els: els, window: window, store: store, error: ctx._bootError };
}

const onboard = read("onboard.html");
const login = read("login.html");
const switchSrc = read("desk-switch.js");
const deskHtml = read("desk.html");
const start = onboard.indexOf("form.onsubmit");
const end = onboard.indexOf("</script>", start);
const src = onboard.slice(start, end);
const fetchAt = src.indexOf('fetch("/api/auth"');
const wsAt = src.indexOf('localStorage.setItem("aia_ws"');
const openAt = src.indexOf("AIADesks.open");
const pendingAt = src.indexOf("data.pending");

if (fetchAt < 0) fail("onboard must POST /api/auth");
else pass("onboard POSTs /api/auth");
if (wsAt < 0) fail("onboard must still write aia_ws after success");
else pass("onboard still writes aia_ws after success");
if (openAt < 0) fail("onboard must still AIADesks.open after success");
else pass("onboard still AIADesks.open after success");
if (pendingAt < 0) fail("onboard must honor pending join");
else pass("onboard honors pending join");
if (wsAt < fetchAt) fail("onboard must not write aia_ws before /api/auth");
else pass("onboard does not write aia_ws before /api/auth");
if (openAt < fetchAt) fail("onboard must not AIADesks.open before /api/auth");
else pass("onboard does not AIADesks.open before /api/auth");
if (wsAt < pendingAt) fail("onboard must not write aia_ws before pending check");
else pass("onboard does not write aia_ws before pending check");
if (openAt < pendingAt) fail("onboard must not AIADesks.open before pending check");
else pass("onboard does not AIADesks.open before pending check");

must(src, "if (!r.ok)", "onboard fail-closed on !r.ok");
must(src, "AIADesks.open", "onboard adds the desk after success");
must(login, "if (!r.ok)", "login fail-closed");
if (login.indexOf("AIADesks.keepSession") < login.indexOf("if (!r.ok)")) {
  fail("login session write drifted before ok check");
} else pass("login session write stays after ok check");

if (onboard.indexOf('location.href = "desk.html"') < 0) fail("onboard must still land on desk.html");
else pass("onboard still lands on desk.html");
if (!pinFieldIsPassword(onboard)) fail("onboard desk-code field must be type=password");
else pass("onboard desk-code field is type=password");
if (!/autocomplete="new-password"/.test(pinFieldTag(onboard))) {
  fail("onboard desk-code field must keep autocomplete=new-password");
} else pass("onboard desk-code field keeps autocomplete=new-password");
if (src.indexOf('localStorage.setItem("aia_pin"') >= 0) fail("onboard must not write aia_pin");
else pass("onboard does not write aia_pin");
if (/keepSession\([^)]*,\s*pin/.test(src)) fail("onboard must not pass the pin to keepSession");
else pass("onboard does not pass the pin to keepSession");
if (/AIADesks\.open\(\{[\s\S]*?\bpin\s*:/.test(src)) fail("onboard must not pass a pin to AIADesks.open");
else pass("onboard does not pass a pin to AIADesks.open");

const deskBuf = fs.readFileSync(path.join(root, "desk.html"));
const deskSha = crypto.createHash("sha256").update(deskBuf).digest("hex");
if (deskBuf.length !== DESK_PIN_SIZE || deskSha !== DESK_PIN_SHA) {
  fail("desk.html pin moved: size " + deskBuf.length + " sha256 " + deskSha);
} else pass("desk.html pin is unchanged");

const liveFaults = onboardFaults(onboard);
if (liveFaults.length) fail("onboard drifted: " + liveFaults.join("; "));
else pass("onboard live pin gate holds");

const mutants = ["pin stored", "field type=text"];
let caught = 0;
mutants.forEach(function (kind) {
  const faults = onboardFaults(applyMutant(onboard, kind));
  if (faults.indexOf(kind) < 0) fail("mutant missed: " + kind + " (got " + JSON.stringify(faults) + ")");
  else { caught += 1; pass("mutant caught: " + kind); }
});
if (caught !== mutants.length) fail("mutants: " + caught + "/" + mutants.length + " caught");
else pass("mutants: " + caught + "/" + mutants.length + " caught");

(async function () {
  const ok = await runOnboard(onboard, switchSrc, {});
  if (ok.store.getItem("aia_pin")) fail("onboard success must not store aia_pin, got " + ok.store.getItem("aia_pin"));
  else pass("onboard success does not store aia_pin");
  if (ok.store.getItem("aia_session") !== "sess-onboard-1") fail("onboard must keep the returned session");
  else pass("onboard keeps the returned session");
  if (ok.store.getItem("aia_ws") !== "oddo-house") fail("onboard must write aia_ws from the desk name");
  else pass("onboard writes aia_ws");
  if (ok.location.href !== "desk.html") fail("onboard must go to desk.html, got " + ok.location.href);
  else pass("onboard goes to desk.html");
  let desks = [];
  try { desks = JSON.parse(ok.store.getItem("aia_desks") || "[]"); } catch (e) { desks = []; }
  if (desks.some(function (d) { return d && Object.prototype.hasOwnProperty.call(d, "pin"); })) fail("onboard must not persist aia_desks[].pin");
  else pass("onboard does not persist aia_desks[].pin");
  const hasToken = desks.some(function (d) { return d && d.slug === "oddo-house" && d.token === "sess-onboard-1"; });
  if (!hasToken) fail("onboard must save the desk with the session token");
  else pass("onboard saves the desk with the session token");

  if (!ok.window.AIADesks || !ok.window.AIADesks.shopOpen()) fail("shopOpen must be true after onboard session");
  else pass("shopOpen is true after onboard session");

  const deskPage = paintDeskGate(ok.store, switchSrc, deskHtml);
  if (!deskPage.els.gate.hidden) fail("desk.html gate must hide after onboard session");
  else pass("desk.html gate hides after onboard session");
  if (deskPage.els.session.hidden) fail("desk.html session line must show after onboard session");
  else pass("desk.html session line shows after onboard session");
  if (deskPage.els.pin.value) fail("desk.html must not prefill a stored desk code after onboard");
  else pass("desk.html does not prefill a stored desk code after onboard");
  if (deskPage.els.ws.value !== "oddo-house") fail("desk.html must open the onboarded desk name");
  else pass("desk.html opens the onboarded desk name");
  if (deskPage.store.getItem("aia_pin")) fail("opening desk.html after onboard must not write aia_pin");
  else pass("opening desk.html after onboard does not write aia_pin");

  const leftover = await runOnboard(onboard, switchSrc, {
    store: { aia_desks: JSON.stringify([{ slug: "oddo-house", name: "Oddo house", pin: "9999" }]) }
  });
  if (leftover.store.getItem("aia_pin")) fail("onboard must drop a leftover aia_pin after a leftover desks pin");
  else pass("onboard drops a leftover aia_pin");
  let leftRows = [];
  try { leftRows = JSON.parse(leftover.store.getItem("aia_desks") || "[]"); } catch (e) { leftRows = []; }
  if (leftRows.some(function (d) { return d && d.slug === "oddo-house" && d.pin; })) {
    fail("onboard must strip a leftover aia_desks[].pin on this path");
  } else pass("onboard strips a leftover aia_desks[].pin on this path");

  const pending = await runOnboard(onboard, switchSrc, {
    role: "member",
    values: { role: "member", kind: "member" },
    fetch: async function () {
      return {
        ok: true,
        status: 200,
        json: async function () { return { ok: true, pending: true, hint: "On the book." }; }
      };
    }
  });
  if (pending.store.getItem("aia_pin") || pending.store.getItem("aia_session")) {
    fail("pending join must not keep a session or store a pin");
  } else pass("pending join does not keep a session or store a pin");
  if (pending.location.href !== "http://127.0.0.1/onboard.html") fail("pending join must stay on onboard");
  else pass("pending join stays on onboard");

  const denied = await runOnboard(onboard, switchSrc, {
    fetch: async function () {
      return {
        ok: false,
        status: 401,
        json: async function () { return { ok: false, error: "Could not open your Queue." }; }
      };
    }
  });
  if (denied.store.getItem("aia_pin") || denied.store.getItem("aia_session") || denied.store.getItem("aia_ws")) {
    fail("failed onboard must not write session, pin, or desk name");
  } else pass("failed onboard writes nothing");
  if (denied.location.href !== "http://127.0.0.1/onboard.html") fail("failed onboard must stay on the form");
  else pass("failed onboard stays on the form");

  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-onboard-session: ok");
  process.exit(0);
})().catch(function (e) {
  console.error("FAIL threw " + (e && e.stack || e));
  process.exit(1);
});

#!/usr/bin/env node
"use strict";
require("./_env-guard");

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function fail(msg) {
  console.error("check-drop-session: " + msg);
  process.exit(1);
}
function pass(msg) { console.log("ok  " + msg); }

const pick = fs.readFileSync(path.join(ROOT, "drop-pick.js"), "utf8");
if (!/function pick\s*\(\s*(row|slug)\s*\)/.test(pick)) fail("drop-pick.js pick() missing.");
if (!/AIADesks\.hasAuth\s*\(\s*row\s*\)/.test(pick)) {
  fail("pick() must treat AIADesks.hasAuth(row) as enough to open a saved desk (token-only email session).");
}
if (/if\s*\(\s*!row\.pin\s*\)/.test(pick)) {
  fail("pick() still treats a missing row.pin as a code prompt. Email-session desks have a token, not a leftover pin.");
}

// 1ec1382 moved deskOpen from drop.html / widget.html into drop-app.js.
// A session desk still follows AIADesks.shopOpen() (with a pin/session
// fallback), paints body.desk-open, and names the dest desk. A closed
// or missing desk does not. A public-link dest that is not the session
// desk stays closed (ws !== authWs). Capture still targets `ws`.
const drop = fs.readFileSync(path.join(ROOT, "drop.html"), "utf8");
const widget = fs.readFileSync(path.join(ROOT, "widget.html"), "utf8");
const app = fs.readFileSync(path.join(ROOT, "drop-app.js"), "utf8");

if (drop.indexOf("drop-app.js") < 0) fail("drop.html must load drop-app.js");
else pass("drop.html loads drop-app.js");
if (widget.indexOf("drop-app.js") < 0) fail("widget.html must load drop-app.js");
else pass("widget.html loads drop-app.js");

function bootFn(src) {
  const at = src.indexOf("let deskOpen");
  if (at < 0) return "";
  const stop = src.indexOf("function headers", at);
  return src.slice(at, stop > at ? stop : at + 800);
}
function headersFn(src) {
  const at = src.indexOf("function headers()");
  if (at < 0) return "";
  const stop = src.indexOf("function showMode", at);
  return src.slice(at, stop > at ? stop : at + 400);
}
function paintOnFn(src) {
  const at = src.indexOf("function paintDeskOn");
  if (at < 0) return "";
  const stop = src.indexOf("function paintFiles", at);
  return src.slice(at, stop > at ? stop : at + 700);
}

function dropSessionFaults(appSrc) {
  const bad = [];
  const boot = bootFn(appSrc);
  const headers = headersFn(appSrc);
  const paint = paintOnFn(appSrc);
  if (!boot) { bad.push("missing deskOpen"); return bad; }

  const assign = boot.match(/let deskOpen\s*=\s*([^;]+);/);
  const rhs = assign ? assign[1].trim() : "";
  if (rhs === "true") bad.push("always open");
  else if (rhs === "false") bad.push("always closed");
  else if (!/AIADesks\.shopOpen\s*\(\s*\)/.test(rhs)) bad.push("ignore shopOpen");

  const classAdd = /document\.body\.classList\.add\(\s*["']desk-open["']\s*\)/.test(boot);
  const classIf = /if\s*\(\s*deskOpen\s*\)\s*document\.body\.classList\.add\(\s*["']desk-open["']\s*\)/.test(boot);
  if (classAdd && !classIf) {
    if (bad.indexOf("always open") < 0) bad.push("always open");
  } else if (!classAdd) {
    if (bad.indexOf("always closed") < 0) bad.push("always closed");
  }

  if (!/if\s*\(\s*ws\s*\)\s*h\["X-Workspace"\]\s*=\s*ws/.test(headers)) {
    bad.push("wrong desk target");
  }

  if (!paint || paint.indexOf("This drop goes to ") < 0 || paint.indexOf("No desk yet") < 0) {
    bad.push("session desk not painted as the drop dest");
  }
  return bad;
}

const live = dropSessionFaults(app);
if (live.length) fail("drop-app.js deskOpen must follow AIADesks.shopOpen() so a session desk paints as open: " + live.join("; "));
pass("deskOpen follows shopOpen(), paints a session desk open and a closed desk closed, and captures to that desk");

function applyMutant(src, kind) {
  let next = src;
  if (kind === "ignore shopOpen") {
    next = next.replace(
      "let deskOpen = (window.AIADesks && AIADesks.shopOpen) ? !!AIADesks.shopOpen() : !!(ws && (pin || localStorage.getItem(\"aia_session\")));",
      "let deskOpen = !!(ws && pin);"
    );
  } else if (kind === "always open") {
    next = next.replace(
      "let deskOpen = (window.AIADesks && AIADesks.shopOpen) ? !!AIADesks.shopOpen() : !!(ws && (pin || localStorage.getItem(\"aia_session\")));",
      "let deskOpen = true;"
    );
  } else if (kind === "always closed") {
    next = next.replace(
      "let deskOpen = (window.AIADesks && AIADesks.shopOpen) ? !!AIADesks.shopOpen() : !!(ws && (pin || localStorage.getItem(\"aia_session\")));",
      "let deskOpen = false;"
    );
  } else if (kind === "wrong desk target") {
    next = next.replace(
      "if (ws) h[\"X-Workspace\"] = ws;",
      "if (authWs) h[\"X-Workspace\"] = authWs;"
    );
  }
  return next;
}

const mutants = ["ignore shopOpen", "always open", "always closed", "wrong desk target"];
let caught = 0;
mutants.forEach(function (kind) {
  const faults = dropSessionFaults(applyMutant(app, kind));
  if (faults.indexOf(kind) < 0) {
    console.error("mutant missed: " + kind + " (got " + JSON.stringify(faults) + ")");
    process.exitCode = 1;
  } else {
    caught++;
    pass("mutant caught: " + kind + " (" + kind + ")");
  }
});
if (caught !== mutants.length) fail("mutants: " + caught + "/" + mutants.length + " caught");
console.log("ok  mutants: " + caught + "/" + mutants.length + " caught");
console.log("check-drop-session mutants: " + caught + "/" + mutants.length + " caught");

const agent = fs.readFileSync(path.join(ROOT, "drop-agent.js"), "utf8");
if (!/function deskIsOpen/.test(agent)) fail("drop-agent.js deskIsOpen missing.");
if (!/AIADesks\.shopOpen\s*\(\s*\)/.test(agent) && !/aia_session/.test(agent)) {
  fail("drop-agent.js deskIsOpen must treat aia_session the same as a leftover pin.");
}

const desk = fs.readFileSync(path.join(ROOT, "desk.html"), "utf8");
if (/if \(tok\) h\["X-Session"\] = tok;\s*else if \(pin\)/.test(desk)) {
  fail("desk.html headers must still send the open-desk pin when a session token is present");
}
if (desk.indexOf('if (tok) h["X-Session"] = tok') < 0) {
  fail("desk.html headers must send leftover X-Session so email-session Yes / Stop / Kill still open");
}
if (desk.indexOf('if (pin) h["X-Pin"] = pin') < 0) fail("desk.html headers must send X-Pin");

const rules = fs.readFileSync(path.join(ROOT, "rules.html"), "utf8");
if (/if \(tok\) h\["X-Session"\] = tok;\s*else if \(pin\)/.test(rules)) {
  fail("rules.html headers must still send the open-desk pin when a session token is present");
}
if (rules.indexOf('if (tok) h["X-Session"] = tok') < 0) {
  fail("rules.html headers must send leftover X-Session so email-session owners can save rules");
}
if (rules.indexOf('if (pin) h["X-Pin"] = pin') < 0) fail("rules.html headers must send X-Pin");

const yesNo = fs.readFileSync(path.join(ROOT, "ACCOUNT-YES-NO.md"), "utf8");
const packMd = fs.readFileSync(path.join(ROOT, "PACK.md"), "utf8");
if (yesNo.indexOf("Desk session leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must record the Desk session leftover");
}
if (packMd.indexOf("Desk session leftover:") < 0) {
  fail("PACK.md must record the Desk session leftover");
}

const vm = require("vm");
const crypto = require("crypto");

function addPinType(html) {
  const m = html.match(/<input id="add-pin"[^>]*>/);
  return m ? m[0] : "";
}
if (!/\stype="password"/.test(addPinType(drop))) fail("drop.html #add-pin must be type=password");
else pass("drop.html #add-pin is type=password");
if (!/\stype="password"/.test(addPinType(widget))) fail("widget.html #add-pin must be type=password");
else pass("widget.html #add-pin is type=password");
if (pick.indexOf('setItem("aia_pin"') >= 0) fail("drop-pick.js must not store aia_pin");
else pass("drop-pick.js does not setItem aia_pin");
if (/AIADesks\.open\(\s*\{[^}]*pin:\s*code/.test(pick)) fail("drop-pick.js addSaved must not pass the typed code into AIADesks.open");
else pass("drop-pick.js addSaved does not pass the typed code into open");
if (!/action:\s*"login"/.test(pick) || !/keepSession/.test(pick) || !/removeItem\("aia_pin"\)/.test(pick)) {
  fail("drop-pick.js addSaved must login, keep the session, and drop aia_pin");
} else pass("drop-pick.js addSaved keeps the session and drops aia_pin");

function makeStore(init) {
  const data = Object.assign({}, init || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
    _data: data
  };
}
function el(init) {
  const o = Object.assign({ tagName: "INPUT", value: "", hidden: true, style: { display: "none", width: "" }, textContent: "", className: "", id: "", innerHTML: "", children: [] }, init || {});
  o.getAttribute = function () { return null; };
  o.setAttribute = function () {};
  o.addEventListener = function () {};
  o.appendChild = function (c) { o.children.push(c); return c; };
  o.querySelector = function () { return null; };
  o.focus = function () {};
  return o;
}
function bootDropPick(src, opts) {
  opts = opts || {};
  const store = makeStore(opts.store);
  const sess = makeStore();
  const els = {
    "add-ws": el({ value: opts.name || "Rivera resale" }),
    "add-pin": el({ value: opts.code != null ? opts.code : "2468" }),
    "desk-err": el({ tagName: "P", style: { display: "none" } }),
    "desk-chips": el({ tagName: "DIV", innerHTML: "" }),
    "desk-pick": el({ tagName: "DIV" }),
    "desk-pick-sub": el({ tagName: "P", textContent: "" }),
    "add-toggle": el({ tagName: "BUTTON" }),
    "add-open": el({ tagName: "BUTTON" }),
    "desk-add": el({ tagName: "DIV", hidden: true }),
    "list-public-btn": el({ tagName: "BUTTON", id: "list-public-btn" })
  };
  const loc = { href: "http://localhost/drop", pathname: "/drop", search: "", hash: "" };
  const calls = [];
  const fetchImpl = opts.fetchImpl || (async function (url, init) {
    calls.push({ url: String(url), init: init || {} });
    if (String(url).indexOf("/api/auth") >= 0) {
      if (opts.authStatus && opts.authStatus >= 400) {
        return { ok: false, status: opts.authStatus, json: async function () { return { error: opts.authError || "Desk name or code does not match." }; } };
      }
      return {
        ok: true, status: 200,
        json: async function () {
          return {
            workspace: { slug: "rivera-resale", biz: "Rivera resale" },
            session: { token: "sess-drop-1" },
            you: { role: "owner", name: "Sam" }
          };
        }
      };
    }
    return { ok: true, status: 200, json: async function () { return {}; } };
  });
  const document = {
    readyState: "complete",
    documentElement: { classList: { contains: function () { return false; } } },
    body: { classList: { contains: function () { return false; } } },
    getElementById: function (id) { return els[id] || null; },
    querySelector: function (sel) { return sel === "main.wrap" ? { insertBefore: function () {} } : null; },
    querySelectorAll: function () { return []; },
    createElement: function (tag) { return el({ tagName: String(tag).toUpperCase() }); },
    addEventListener: function () {}
  };
  const ctx = {
    window: null,
    document: document,
    localStorage: store,
    sessionStorage: sess,
    location: loc,
    fetch: fetchImpl,
    console: console
  };
  ctx.window = ctx;
  ctx.window.parent = {}; // skip injectSearch public fetch
  ctx.window.window = ctx.window;
  const deskSwitch = fs.readFileSync(path.join(ROOT, "desk-switch.js"), "utf8");
  vm.runInNewContext(deskSwitch, ctx, { filename: "desk-switch.js" });
  vm.runInNewContext(src, ctx, { filename: "drop-pick.js" });
  return { ctx: ctx, store: store, els: els, calls: calls, loc: loc };
}

function leftoverFaults(kind, src, html) {
  const faults = [];
  const page = html || drop;
  const pinTag = addPinType(page);
  if (!/\stype="password"/.test(pinTag)) faults.push("field type=text");
  if (src.indexOf('setItem("aia_pin"') >= 0) faults.push("pin stored");
  if (/AIADesks\.open\(\s*\{[^}]*pin:\s*code/.test(src)) faults.push("pin stored");
  if (src.indexOf('data.error || "Desk name or code does not match."; } return;') < 0) faults.push("wrong-code 401");
  return faults;
}

(function staticLeftover() {
  const live = leftoverFaults("", pick, drop);
  if (live.length) fail("drop-pick leftover desk code faults: " + live.join("; "));
  else pass("drop-pick keeps a leftover desk code out of storage after Save and open");
  [
    ["field type=text", pick, drop.replace(addPinType(drop), addPinType(drop).replace(/\s*type="password"/, ""))],
    ["pin stored", pick.replace(
      "token: data.session && data.session.token,",
      "pin: code, token: data.session && data.session.token,"
    ).replace('try { localStorage.removeItem("aia_pin"); } catch (e) {}', ""), drop],
    ["wrong-code 401", pick.replace("if (!r.ok) { if (err) { err.style.display = \"block\"; err.textContent = data.error || \"Desk name or code does not match.\"; } return; }", ""), drop]
  ].forEach(function (row) {
    const kind = row[0], src = row[1], html = row[2];
    const faults = leftoverFaults(kind, src, html);
    if (kind === "field type=text" && /\stype="password"/.test(addPinType(html))) faults.length = 0, faults.push("did not apply");
    if (faults.indexOf(kind) < 0) fail("drop leftover-pin mutant survived: " + kind);
    else pass("drop leftover-pin mutant caught: " + kind);
  });
})();

(async function liveLeftover() {
  const leftoverInit = {
    store: {
      aia_desks: JSON.stringify([{ slug: "rivera-resale", name: "Rivera resale", pin: "9999" }])
    }
  };
  const ok = bootDropPick(pick, leftoverInit);
  await ok.ctx.AIADropDesks.addSaved();
  const login = ok.calls.filter(function (c) { return String(c.url).indexOf("/api/auth") >= 0; })[0];
  if (!login) fail("drop addSaved must POST /api/auth");
  else pass("drop addSaved POSTs /api/auth");
  let body = {};
  try { body = JSON.parse(login.init.body || "{}"); } catch (e) { body = {}; }
  const headers = login.init.headers || {};
  if (body.action !== "login" || body.slug !== "rivera-resale" || body.pin !== "2468" || headers["X-Workspace"] !== "rivera-resale") {
    fail("drop addSaved login must send slug, pin, and X-Workspace");
  } else pass("drop addSaved login sends slug, pin, and X-Workspace");
  if (ok.store.getItem("aia_pin")) fail("drop addSaved must not store aia_pin");
  else pass("drop addSaved does not store aia_pin");
  if (ok.store.getItem("aia_session") !== "sess-drop-1") fail("drop addSaved must keep the returned session");
  else pass("drop addSaved keeps the returned session");
  if (!(ok.ctx.AIADesks && ok.ctx.AIADesks.shopOpen && ok.ctx.AIADesks.shopOpen())) fail("shopOpen must be true after drop addSaved");
  else pass("shopOpen is true after drop addSaved");
  if (ok.els["add-pin"].value !== "") fail("drop addSaved must clear the desk code field");
  else pass("drop addSaved clears the desk code field");
  if (String(ok.loc.href).indexOf("/drop?ws=rivera-resale") < 0) fail("drop addSaved must go to the dest desk after login");
  else pass("drop addSaved goes to the dest desk after login");
  let desks = [];
  try { desks = JSON.parse(ok.store.getItem("aia_desks") || "[]"); } catch (e) { desks = []; }
  if (desks.some(function (d) { return d && d.slug === "rivera-resale" && "pin" in d && d.pin; })) {
    fail("drop addSaved must strip a leftover aia_desks pin");
  } else pass("drop addSaved strips a leftover aia_desks pin");

  const denied = bootDropPick(pick, { authStatus: 401, authError: "Desk name or code does not match.", store: leftoverInit.store });
  denied.els["add-pin"].value = "2468";
  await denied.ctx.AIADropDesks.addSaved();
  if (denied.store.getItem("aia_session") || denied.store.getItem("aia_pin") || denied.store.getItem("aia_ws") || denied.store.getItem("aia_desk_name")) {
    fail("wrong-code drop addSaved must not write a session or pin");
  } else pass("wrong-code drop addSaved does not write a session or pin");
  if (!(denied.ctx.AIADesks && denied.ctx.AIADesks.shopOpen) || denied.ctx.AIADesks.shopOpen()) {
    fail("shopOpen must stay false after a wrong desk code");
  } else pass("shopOpen stays false after a wrong desk code");
  if (String(denied.els["desk-err"].textContent || "").indexOf("does not match") < 0) {
    fail("wrong-code drop addSaved must show the 401 error, got " + (denied.els["desk-err"].textContent || ""));
  } else pass("wrong-code drop addSaved shows the 401 error");
  if (String(denied.loc.href).indexOf("ws=") >= 0) fail("wrong-code drop addSaved must not continue to the dest desk");
  else pass("wrong-code drop addSaved does not continue to the dest desk");
  if (denied.els["add-pin"].value !== "2468") fail("wrong-code drop addSaved must leave the typed code in the field");
  else pass("wrong-code drop addSaved leaves the typed code in the field");

  const pinSrc = pick.replace(
    "token: data.session && data.session.token,",
    "pin: code, token: data.session && data.session.token,"
  ).replace('try { localStorage.removeItem("aia_pin"); } catch (e) {}', "");
  const pinMut = bootDropPick(pinSrc, leftoverInit);
  await pinMut.ctx.AIADropDesks.addSaved();
  if (!pinMut.store.getItem("aia_pin")) fail("pin stored mutant must still write aia_pin");
  else pass("pin stored mutant still caught on addSaved");

  const badSrc = pick.replace("if (!r.ok) { if (err) { err.style.display = \"block\"; err.textContent = data.error || \"Desk name or code does not match.\"; } return; }", "");
  const badMut = bootDropPick(badSrc, { authStatus: 401, authError: "Desk name or code does not match." });
  await badMut.ctx.AIADropDesks.addSaved();
  if (!badMut.store.getItem("aia_session") && !badMut.store.getItem("aia_ws")) fail("wrong-code 401 mutant must still proceed after a 401");
  else pass("wrong-code 401 mutant still caught on addSaved");

  console.log("check-drop-session: ok");
})().catch(function (err) {
  fail((err && err.stack) || String(err));
});

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

console.log("check-drop-session: ok");

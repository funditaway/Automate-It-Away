#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function fail(msg) {
  console.error("check-drop-session: " + msg);
  process.exit(1);
}

const pick = fs.readFileSync(path.join(ROOT, "drop-pick.js"), "utf8");
if (!/function pick\s*\(\s*(row|slug)\s*\)/.test(pick)) fail("drop-pick.js pick() missing.");
if (!/AIADesks\.hasAuth\s*\(\s*row\s*\)/.test(pick)) {
  fail("pick() must treat AIADesks.hasAuth(row) as enough to open a saved desk (token-only email session).");
}
if (/if\s*\(\s*!row\.pin\s*\)/.test(pick)) {
  fail("pick() still treats a missing row.pin as a code prompt. Email-session desks have a token, not a leftover pin.");
}

const html = fs.readFileSync(path.join(ROOT, "drop.html"), "utf8");
if (!/AIADesks\.shopOpen\s*\(\s*\)/.test(html)) {
  fail("drop.html deskOpen must follow AIADesks.shopOpen() so a session desk paints as open.");
}

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

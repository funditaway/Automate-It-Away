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

console.log("check-drop-session: ok");

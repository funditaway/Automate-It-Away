#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

function fail(msg) {
  console.error("check-custom-drops: " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

const custom = read("drop-custom.js");
const nav = read("desk-nav.js");
const drop = read("drop.html");
const app = read("drop-app.js");
const tip = read("aia-tip.js");
const more = read("drop-more.js");
const pack = read("pack-card.js");

const syn = spawnSync(process.execPath, ["--check", path.join(ROOT, "drop-custom.js")], { encoding: "utf8" });
if (syn.status !== 0) fail("drop-custom.js must parse: " + (syn.stderr || syn.stdout || "").trim());
else pass("drop-custom.js parses");

if (custom.indexOf("CARD_TYPES") < 0) fail("drop-custom.js must declare CARD_TYPES");
else pass("CARD_TYPES declared");
if (custom.indexOf("Ask Desk AI to draft") < 0) fail("Custom Drop must show Ask Desk AI to draft");
else pass("Ask Desk AI to draft visible");
if (custom.indexOf('action: "suggest"') < 0 && custom.indexOf("action: \"suggest\"") < 0) {
  fail("Desk AI draft must POST action suggest");
} else pass("Desk AI draft uses suggest");
if (custom.indexOf("customDrop") < 0) fail("must stamp custom.customDrop");
else pass("stamps custom.customDrop");
if (custom.indexOf("card-type-chips") < 0) fail("must paint card-type chips");
else pass("card-type chips");
if (custom.indexOf("card-type-badge") < 0) fail("must paint card-type badge on face");
else pass("card-type badge on face");
if (custom.indexOf("silent bind") < 0 && custom.indexOf("not a silent bind") < 0) {
  fail("must say Desk AI path is not a silent bind");
} else pass("honest Desk AI path copy");
if (custom.indexOf("Yes, then Start") < 0) fail("must keep Yes, then Start");
else pass("Yes, then Start kept");
if (/\bPLACEHOLDER\b|demo data|Whatnot|ebay\.com|mail send/.test(custom)) fail("no demo/mail/eBay/Whatnot stubs");
else pass("no blocked product stubs");

if (nav.indexOf('loadDrop("drop-custom.js"') < 0 && nav.indexOf("drop-custom.js") < 0) {
  fail("desk-nav.js must load drop-custom.js");
} else pass("desk-nav loads drop-custom.js");

["Queue", "Drop", "Create", "History", "More"].forEach(function (t) {
  if (drop.indexOf(">" + t + "<") < 0 && drop.indexOf(">" + t + "</") < 0) {
    if (drop.indexOf(t) < 0) fail("drop.html missing tab " + t);
  }
});
if (/data-tab="rules"|data-tab="pipes"/.test(drop) && drop.indexOf('data-tab="create"') < 0) {
  fail("live bar must stay Queue·Drop·Create·History·More");
}
if (drop.indexOf('data-tab="create"') < 0 || drop.indexOf('data-tab="history"') < 0) {
  fail("live bar must keep Create and History");
} else pass("live bar Queue·Drop·Create·History·More");

if (drop.indexOf('data-way="custom"') < 0) fail("drop ways must keep Custom drop chip");
else pass("Drop ways keep Custom drop");
if (drop.indexOf("Custom drop") < 0) fail("drop.html must name Custom drop");
else pass("Custom drop named");

if (app.indexOf("Yes, then Start") < 0) fail("drop-app must keep Yes, then Start");
else pass("drop-app Yes, then Start");
if (app.indexOf('mode === "custom"') < 0) fail("drop-app must handle custom mode");
else pass("drop-app custom mode");

if (more.indexOf("pane-custom") < 0) fail("drop-more must still inject pane-custom");
else pass("drop-more pane-custom");

if (tip.indexOf("custom-drop") < 0) fail("aia-tip must include custom-drop");
else pass("aia-tip custom-drop");
if (tip.indexOf("card-type") < 0) fail("aia-tip must include card-type");
else pass("aia-tip card-type");

if (pack.indexOf("faceOf") < 0) fail("pack-card faceOf still present");
else pass("pack-card intact");

const bytes = Buffer.byteLength(custom, "utf8");
if (bytes < 2000) fail("drop-custom.js too small (" + bytes + ")");
if (bytes > 40000) fail("drop-custom.js too large for MCP (" + bytes + ")");
else pass("drop-custom.js size " + bytes);

if (process.exitCode) {
  console.error("check-custom-drops failed");
  process.exit(1);
}
console.log("check-custom-drops: ok");

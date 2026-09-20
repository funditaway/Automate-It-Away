#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const history = read("history.html");
const histSrc = read("api/_history.js");
const more = read("more.html");
const help = read("help.html");
const yesNo = read("ACCOUNT-YES-NO.md");
const pkg = read("package.json");

(function () {
  const m = history.match(/<script>\s*var lane[\s\S]*?<\/script>/);
  if (!m) {
    fail("history.html script must parse: missing History paint script");
    return;
  }
  const tmp = path.join(require("os").tmpdir(), "aia-history-ux-" + Date.now() + ".js");
  fs.writeFileSync(tmp, m[0].replace(/^<script>/, "").replace(/<\/script>$/, ""));
  const syntax = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  try { fs.unlinkSync(tmp); } catch (e) {}
  if (syntax.status !== 0) fail("history.html script must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
  else pass("history.html script parses");
})();

[
  "What this desk did. Real cards only",
  "id=\"how-history\"",
  "What you see here",
  "More filters",
  "Already done",
  "On the desk",
  "Coming up",
  "Off desk",
  "Cap priority",
  "function threadFace",
  "function paintCards",
  "function toast",
  "function filterCount",
  "Show talk",
  "id=\"refresh\"",
  "id=\"toast\"",
  "Nothing sends from here"
].forEach(function (bit) {
  if (history.indexOf(bit) < 0) fail("history.html missing " + bit);
  else pass("history.html " + bit);
});

if (history.indexOf("gone HOLD when that named AI is not on this desk") < 0) {
  fail("History must keep gone HOLD honesty copy");
} else pass("History keeps gone HOLD honesty copy");
if (history.indexOf("Needs you / prompt ask-who") < 0) {
  fail("History must keep Needs you / prompt ask-who");
} else pass("History keeps Needs you / prompt ask-who");
if (history.indexOf("Give is the file") < 0 || history.indexOf("Collect HOLD") < 0) {
  fail("History must keep Give / Collect HOLD");
} else pass("History keeps Give / Collect HOLD");
if (history.indexOf("Create / Drop drafted cards label Yes / Stop / Kill") < 0) {
  fail("History must label Create / Drop drafted Yes / Stop cards");
} else pass("History labels Create / Drop drafted Yes / Stop cards");
if (history.indexOf("function viaLabel") < 0 || history.indexOf("it.decide") < 0) {
  fail("History must paint via + decide tags");
} else pass("History paints via + decide tags");
if (history.indexOf("Nothing on this trail yet") < 0) {
  fail("empty History with no filters must say the trail is empty");
} else pass("empty History with no filters is honest");
if (history.indexOf("Nothing matches these filters") < 0) {
  fail("empty History with filters must say nothing matches");
} else pass("filtered empty History is honest");
if (history.indexOf("Clear filters only when a filter hid the trail") < 0) {
  fail("History must not offer Clear filters on a truly empty trail");
} else pass("Clear filters only when a filter hid the trail");
if (history.indexOf("History does not invent Yes / Stop cards") < 0) {
  fail("empty History must not invent Yes / Stop cards");
} else pass("empty History does not invent Yes / Stop cards");
if (histSrc.indexOf("function viaOf") < 0 || histSrc.indexOf("function whoOf") < 0) {
  fail("_history must expose viaOf / whoOf");
} else pass("_history exposes viaOf / whoOf");
if (yesNo.indexOf("History drafted-card trail leftover") < 0) {
  fail("ACCOUNT-YES-NO must name History drafted-card trail leftover");
} else pass("ACCOUNT-YES-NO names History drafted-card trail leftover");

if (histSrc.indexOf('ext: "Off desk"') < 0) fail("laneLabel must say Off desk");
else pass("laneLabel says Off desk");

if (more.indexOf("real cards only") < 0) fail("more.html History must lead with simple words");
else pass("more.html History leads with simple words");
if (more.indexOf("This account’s past / now / next") < 0 || more.indexOf("Give is the file") < 0) {
  fail("more.html must keep account roadmap honesty");
} else pass("more.html keeps account roadmap honesty");

if (help.indexOf("What this desk did") < 0) fail("help.html History FAQ must use simple words");
else pass("help.html History FAQ uses simple words");
if (help.indexOf("this account’s roadmap") < 0 || help.indexOf("Give is the file") < 0) {
  fail("help.html must keep History roadmap honesty");
} else pass("help.html keeps History roadmap honesty");

if (yesNo.indexOf("check-history-ux.js") < 0) fail("ACCOUNT-YES-NO must record History UX");
else pass("ACCOUNT-YES-NO records History UX");
if (pkg.indexOf("check-history-ux.js") < 0) fail("package.json must run check-history-ux");
else pass("package.json runs check-history-ux");

if (failed) {
  console.error("\n" + failed + " History UX check(s) failed");
  process.exit(1);
}
console.log("\nHistory UX checks passed");

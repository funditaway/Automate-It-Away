#!/usr/bin/env node
"use strict";
require("./_env-guard");

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
// fff3b47 shortened the Custom Drop honesty from "Desk AI draft path —
// not a silent bind. Yes, then Start." to "A Desk AI drafts. You still
// tap Yes, then Start." Do not require the parked "not a silent bind"
// phrase. Assert the painted meaning and that the path cannot bind
// without a human Yes (ba5613e / #255 removed onchange=bindAiOnCard).
const needs = read("desk-needs.js");
function customDropHonestyFaults(src) {
  const bad = [];
  if (src.indexOf("A Desk AI drafts") < 0) bad.push("missing A Desk AI drafts");
  if (src.indexOf("Yes, then Start") < 0) bad.push("missing Yes, then Start");
  return bad;
}
function customDropSilentBindFaults(customSrc, needsSrc) {
  const bad = [];
  const hay = String(customSrc || "") + "\n" + String(needsSrc || "");
  if (/onchange\s*=\s*(?:\\["\']|["\'])?bindAiOnCard/.test(hay)) bad.push("onchange=bindAiOnCard silent bind is back");
  const askAt = customSrc.indexOf("async function askDesk");
  const askEnd = customSrc.indexOf("function stamp", askAt);
  const ask = askAt >= 0 && askEnd > askAt ? customSrc.slice(askAt, askEnd) : customSrc;
  if (ask.indexOf('action: "suggest"') < 0) bad.push("Ask Desk AI does not POST action suggest");
  if (/action:\s*"capture"|action:\s*"bind-ai"|action:\s*"set-ai"|action:\s*"assign-ai"/.test(ask)) {
    bad.push("Ask Desk AI posts a bind/capture without a human Yes");
  }
  if (/\buseDraft\s*\(/.test(ask)) bad.push("Ask Desk AI auto-applies the draft (skips Use draft)");
  const useAt = customSrc.indexOf("function useDraft");
  const useEnd = customSrc.indexOf("async function askDesk", useAt);
  const use = useAt >= 0 ? customSrc.slice(useAt, useEnd > useAt ? useEnd : customSrc.length) : "";
  if (/\bfetch\s*\(/.test(use)) bad.push("Use draft fetches / binds without staying on the form");
  if (!/custom-yes(?:\\")?"?\s+hidden/.test(customSrc)) bad.push("Use draft is not hidden until a draft lands");
  return bad;
}
(function () {
  const bad = customDropHonestyFaults(custom);
  if (bad.length) fail("Custom Drop must still say a Desk AI drafts and you still tap Yes, then Start: " + bad.join("; "));
  else pass("Custom Drop paints A Desk AI drafts / You still tap Yes, then Start");
})();
(function () {
  const bad = customDropSilentBindFaults(custom, needs);
  if (bad.length) fail("Desk AI / Custom Drop path must stay pending until a human Yes: " + bad.join("; "));
  else pass("Desk AI path does not bind without a human Yes");
})();
if (custom.indexOf("Yes, then Start") < 0) fail("must keep Yes, then Start");
else pass("Yes, then Start kept");
if (/\\bPLACEHOLDER\\b|demo data|Whatnot|ebay\\.com|mail send/.test(custom)) fail("no demo/mail/eBay/Whatnot stubs");
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

const tipCustom = fs.existsSync(path.join(ROOT, "aia-tip-custom.js")) ? read("aia-tip-custom.js") : "";
const tipAll = tip + "\n" + tipCustom;
if (tipAll.indexOf("custom-drop") < 0) fail("aia-tip or aia-tip-custom must include custom-drop");
else pass("aia-tip custom-drop");
if (tipAll.indexOf("card-type") < 0) fail("aia-tip or aia-tip-custom must include card-type");
else pass("aia-tip card-type");

if (pack.indexOf("faceOf") < 0) fail("pack-card faceOf still present");
else pass("pack-card intact");

const bytes = Buffer.byteLength(custom, "utf8");
if (bytes < 2000) fail("drop-custom.js too small (" + bytes + ")");
if (bytes > 40000) fail("drop-custom.js too large for MCP (" + bytes + ")");
else pass("drop-custom.js size " + bytes);

function swap(str, from, to) { return str.indexOf(from) < 0 ? null : str.split(from).join(to); }

const MUTANTS = [
  ["removes the not-silent / Yes-then-Start line", function () {
    const n = swap(custom, "A Desk AI drafts. You still tap Yes, then Start.", "A Desk AI handles it from here.");
    return n ? customDropHonestyFaults(n).concat(n.indexOf("Yes, then Start") < 0 ? [] : []) : null;
  }],
  ["restores a silent onchange auto bind", function () {
    const askTok = "id=" + "\\\"" + "custom-ask" + "\\\"";
    const n = swap(custom, askTok, askTok + " onchange=" + "\\\"" + "bindAiOnCard" + "\\\"");
    return n ? customDropSilentBindFaults(n, needs) : null;
  }],
  ["Ask Desk AI posts capture instead of suggest", function () {
    const n = swap(custom, 'action: "suggest"', 'action: "capture"');
    return n ? customDropSilentBindFaults(n, needs) : null;
  }],
  ["Ask Desk AI auto-applies the draft", function () {
    const n = swap(custom, "if (s) s.hidden = false;", "if (s) s.hidden = false; useDraft();");
    return n ? customDropSilentBindFaults(n, needs) : null;
  }],
  ["Use draft is visible before a draft lands", function () {
    const yesTok = "id=" + "\\\"" + "custom-yes" + "\\\"" + " hidden";
    const n = swap(custom, yesTok, "id=" + "\\\"" + "custom-yes" + "\\\"");
    return n ? customDropSilentBindFaults(n, needs) : null;
  }],
  ["Use draft fetches a bind", function () {
    const n = swap(custom, "if (draftBlob.cardType) setType(draftBlob.cardType);", "if (draftBlob.cardType) setType(draftBlob.cardType); fetch(\"/api/jobs\", { method: \"POST\", body: JSON.stringify({ action: \"bind-ai\" }) });");
    return n ? customDropSilentBindFaults(n, needs) : null;
  }],
  ["desk-needs restores onchange=bindAiOnCard", function () {
    const n = swap(needs, "class=\"q-ai-pick\"", "class=\"q-ai-pick\" onchange=\"bindAiOnCard\"");
    return n ? customDropSilentBindFaults(custom, n) : null;
  }]
];
let mutCaught = 0;
MUTANTS.forEach(function (m) {
  let out;
  try { out = m[1](); } catch (e) { out = ["threw " + e.message]; }
  if (out === null || out === false || out === undefined) fail("mutant does not apply: " + m[0]);
  else if (out.length) { mutCaught += 1; pass("mutant caught: " + m[0] + " (" + out[0] + ")"); }
  else fail("mutant survived: " + m[0]);
});
pass("mutants: " + mutCaught + "/" + MUTANTS.length + " caught");
if (mutCaught !== MUTANTS.length) fail("not every mutant was caught");

if (process.exitCode) {
  console.error("check-custom-drops failed");
  process.exit(1);
}
console.log("check-custom-drops mutants: " + mutCaught + "/" + MUTANTS.length + " caught");
console.log("check-custom-drops: ok");

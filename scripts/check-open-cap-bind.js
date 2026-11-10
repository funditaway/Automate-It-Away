#!/usr/bin/env node
"use strict";
require("./_env-guard");

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const vm = require("vm");

const root = path.join(__dirname, "..");

let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

["desk-needs.js", "desk-card.js"].forEach(function (name) {
  const syntax = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
  if (syntax.status !== 0) fail(name + " must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
  else pass(name + " parses");
});

const needs = read("desk-needs.js");
const card = read("desk-card.js");
const help = read("help.html");
const more = read("more.html");
const moreTips = more + "\n" + read("aia-tip.js");
const yesNo = read("ACCOUNT-YES-NO.md");
const pkg = read("package.json");
const drop = read("drop.html");
const dropAgent = read("drop-agent.js");

// a2ad8c4 (#265) minified desk-needs.js. Names like bindAiHtml and the pretty
// bindAiHtml(j, "cap") / bindAiHtml(j, "queue") call sites were shortened.
// window.bindAiHtml / window.capCardHtml still paint "Desk AI on this card"
// with a unique q-ai-cap- picker. ba5613e (#255) removed silent
// onchange=bindAiOnCard; a2ad8c4 kept that and also stopped Yes from binding
// as a side effect (check-approve-start). The pick stays pending until Yes.
// Do not require the "Gone bind HOLDs." jargon or a doubled "not on this desk"
// line — those are parked for a later copy pass.
function capBindSourceFaults(src) {
  const bad = [];
  if (src.indexOf("window.bindAiHtml") < 0) bad.push("missing window.bindAiHtml");
  if (src.indexOf("window.capCardHtml") < 0) bad.push("missing window.capCardHtml");
  if (src.indexOf("window.bindAiOnCard") < 0) bad.push("missing window.bindAiOnCard");
  if (src.indexOf("Desk AI on this card") < 0) bad.push("missing Desk AI on this card");
  if (src.indexOf("q-ai-pick") < 0) bad.push("missing q-ai-pick");
  if (src.indexOf("Pick stays pending until Yes") < 0) bad.push("missing Pick stays pending until Yes");
  if (/onchange\s*=\s*["']bindAiOnCard|onchange=\\"bindAiOnCard/.test(src)) {
    bad.push("silent onchange bindAiOnCard (pick skips Yes)");
  }
  return bad;
}
(function () {
  const bad = capBindSourceFaults(needs);
  if (bad.length) fail("Cap / Open bind must stay in desk-needs.js: " + bad.join("; "));
  else pass("Cap / Open bind still lives in desk-needs.js");
})();
if (card.indexOf("bindAiHtml(j, \"sheet\")") < 0) fail("openJob must call bindAiHtml(j, \"sheet\")");
else pass("openJob calls bindAiHtml(j, \"sheet\")");
if (card.indexOf("staff || typeof bindAiHtml") < 0) fail("Open-job bind must stay owner-only");
else pass("Open-job bind stays owner-only");
if (/oauth|spacex|login\.x\.ai|custodial wallet|Collect charge/i.test(needs + card)) {
  fail("Open / Cap bind invented Grok OAuth / wallet / Collect charge");
} else pass("no OAuth / wallet / Collect charge");
if (help.indexOf("Open and from this-desk Cap") < 0 && help.indexOf("Open and this-desk Cap") < 0) {
  fail("help#desk-cards must name Open / Cap desk AI pick");
} else pass("help names Open / Cap desk AI pick");
if (help.indexOf("Grok") >= 0) fail("help.html must not lecture Grok");
else pass("help.html does not lecture Grok");
// a66b146 shortened more-queue. Gone-AI honesty stays as:
// "If a named desk AI is not on this desk, the card says so."
function moreQueueBindFaults(src) {
  const bad = [];
  if (src.indexOf("If a named desk AI is not on this desk, the card says so.") < 0) {
    bad.push("missing gone-AI honesty");
  }
  return bad;
}
(function () {
  const bad = moreQueueBindFaults(moreTips);
  if (bad.length) fail("more Queue tip must stay honest about the named desk AI: " + bad.join("; "));
  else pass("more Queue tip names gone-AI honesty");
})();
if (more.indexOf('data-aia-tip="more-queue"') < 0) fail("more.html must wire more-queue tip");
else pass("more.html wires more-queue tip");
if (yesNo.indexOf("check-open-cap-bind.js") < 0) fail("ACCOUNT-YES-NO must record Open / Cap bind");
else pass("ACCOUNT-YES-NO records Open / Cap bind");
if (pkg.indexOf("check-open-cap-bind.js") < 0) fail("package.json must run check-open-cap-bind");
else pass("package.json runs check-open-cap-bind");
// fff3b47 shortened public Drop copy.
function dropCopyFaults(src) {
  const bad = [];
  if (src.indexOf("They never see money, Stop, or People") < 0) {
    bad.push("missing public Drop honesty");
  }
  return bad;
}
(function () {
  const bad = dropCopyFaults(drop);
  if (bad.length) fail("public Drop copy must stay honest: " + bad.join("; "));
  else pass("public Drop copy stays honest");
})();
if (dropAgent.indexOf("deskIsOpen") < 0 || dropAgent.indexOf("!deskIsOpen()") < 0) {
  fail("Drop People honesty must stay behind deskIsOpen()");
} else pass("Drop People honesty stays behind deskIsOpen()");

function baseCtx() {
  const ctx = {
    window: {},
    document: {
      readyState: "complete",
      addEventListener: function () {},
      getElementById: function () { return null; },
      createElement: function () { return { id: "", textContent: "" }; },
      head: { appendChild: function () {} }
    },
    setTimeout: function () {},
    localStorage: { getItem: function () { return "owner"; }, setItem: function () {} },
    JOBS: [],
    FIELDS: [],
    PEOPLE: [],
    role: "owner",
    esc: function (s) {
      return String(s || "").replace(/[&<>"']/g, function (c) {
        return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
      });
    },
    visitorLine: function (s) { return s || ""; },
    labelStatus: function (s) { return s || ""; }
  };
  ctx.window = ctx;
  return ctx;
}

function paintCtx(src) {
  const ctx = baseCtx();
  vm.runInNewContext(src || needs, ctx);
  try { vm.runInNewContext(card, ctx); } catch (e) {}
  ctx.AIADeskAis = {
    owner: true,
    rows: [
      { id: "james-s-ai", name: "James’s AI", does: "Draft the lead packet", prompt: "Ask who it is for." },
      { id: "shop-bot", name: "Shop Bot", does: "Qualify cards", prompt: "Who is it for?" }
    ],
    primary: function () { return this.rows[0]; }
  };
  return ctx;
}

const ctx = paintCtx();
if (typeof ctx.bindAiHtml !== "function") fail("desk-needs.js must set window.bindAiHtml");
else pass("bindAiHtml() is on window");
if (typeof ctx.capCardHtml !== "function") fail("desk-needs.js must set window.capCardHtml");
else pass("capCardHtml() is on window");
if (typeof ctx.card !== "function") fail("desk-needs.js must set window.card");
else pass("card() is on window");
if (typeof ctx.bindAiOnCard !== "function") fail("desk-needs.js must set window.bindAiOnCard");
else pass("bindAiOnCard() is on window");
if (typeof ctx.approveCard !== "function") fail("desk-needs.js must set window.approveCard");
else pass("approveCard() is on window");

function selectedLabel(html) {
  const m = String(html || "").match(/<option[^>]*\sselected[^>]*>([^<]*)<\/option>/i)
    || String(html || "").match(/<option[^>]*>([^<]*)<\/option>/i);
  return m ? m[1] : "";
}
function unesc(s) {
  return String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// Behaviour: this-desk Cap paints the desk-AI picker (cap variant), does not
// silently bind on change, and the pick stays pending until Yes. Do not require
// "Gone bind HOLDs." or a doubled "not on this desk" compound.
function capBindPaintFaults(html, jobId) {
  const bad = [];
  if (!html) { bad.push("no card html"); return bad; }
  if (html.indexOf("Desk AI on this card") < 0) bad.push("missing Desk AI on this card");
  if (html.indexOf("q-ai-pick") < 0) bad.push("missing q-ai-pick");
  if (jobId && html.indexOf("q-ai-cap-" + jobId) < 0) bad.push("missing q-ai-cap-" + jobId);
  if (html.indexOf("Pick stays pending until Yes") < 0) bad.push("missing Pick stays pending until Yes");
  if (/onchange\s*=\s*["']bindAiOnCard/.test(html)) bad.push("pick skips Yes (onchange bindAiOnCard)");
  return bad;
}

const live = {
  id: "j-live",
  status: "waiting",
  title: "They clicked",
  draft: "Ask who it is for and when. Do not send.",
  deskAi: { id: "james-s-ai", name: "James’s AI", does: "Draft the lead packet" },
  next: "James’s AI drafted on the card. Human send HOLD."
};
const queue = ctx.card(live, false);
const cap = ctx.capCardHtml(live, "shop");
const open = ctx.bindAiHtml(live, "sheet");
if (queue.indexOf("q-ai-pick") < 0) fail("queue owner card must keep the desk AI picker");
else pass("queue owner card keeps the desk AI picker");
if (queue.indexOf("q-ai-queue-j-live") < 0) fail("queue picker id must be unique (q-ai-queue-)");
else pass("queue picker id is unique (q-ai-queue-)");
(function () {
  const bad = capBindPaintFaults(cap, "j-live");
  if (bad.length) fail("this-desk Cap must paint the desk AI picker: " + bad.join("; "));
  else pass("this-desk Cap paints the desk AI picker (q-ai-cap-)");
})();
if (open.indexOf("q-ai-pick") < 0) fail("Open-job bindAiHtml(sheet) must show the picker");
else pass("Open-job bindAiHtml(sheet) shows the picker");
if (open.indexOf("q-ai-sheet-j-live") < 0) fail("Open picker id must be unique (q-ai-sheet-)");
else pass("Open picker id is unique (q-ai-sheet-)");
if (open.indexOf("Pick stays pending until Yes") < 0) fail("Open bind must stay pending until Yes");
else pass("Open bind stays pending until Yes");
if (cap.indexOf("Shop Bot") < 0) fail("Cap picker must list the other desk AI");
else pass("Cap picker lists the other desk AI");
if (open.indexOf("Shop Bot") < 0) fail("Open picker must list the other desk AI");
else pass("Open picker lists the other desk AI");
if (queue.indexOf(">Yes<") < 0 || queue.indexOf(">Kill<") < 0) fail("Yes / Stop / Kill must stay on the queue card");
else pass("Yes / Stop / Kill stay on the queue card");
if (cap.indexOf("Nothing sent alone") < 0) fail("Cap bind must stay HOLD / nothing sent");
else pass("Cap bind stays nothing sent");
if (open.indexOf("Nothing sent alone") < 0) fail("Open bind must stay HOLD / nothing sent");
else pass("Open bind stays nothing sent");
if (/>Yes</.test(cap)) fail("this-desk Cap must not show a Yes tap");
else pass("this-desk Cap has no Yes tap");

const other = ctx.capCardHtml(Object.assign({}, live, { slug: "other-desk", desk: "Other" }), "shop");
if (other.indexOf("q-ai-pick") >= 0 || other.indexOf("Desk AI on this card") >= 0) {
  fail("other-desk Cap must not show the desk AI picker");
} else pass("other-desk Cap does not show the desk AI picker");
if (other.indexOf("Open on Other") < 0 && other.indexOf("Open on other") < 0) {
  if (other.indexOf("Open on") < 0) fail("other-desk Cap must still Open on that desk");
  else pass("other-desk Cap still Opens on that desk");
} else pass("other-desk Cap still Opens on that desk");

ctx.AIADeskAis.owner = false;
const helperCap = ctx.capCardHtml(live, "shop");
if (helperCap.indexOf("q-ai-pick") >= 0) fail("helper must not see the Cap desk AI picker");
else pass("helper does not see the Cap desk AI picker");
const helperOpen = ctx.bindAiHtml(live, "sheet");
if (helperOpen) fail("helper must not see the Open desk AI picker");
else pass("helper does not see the Open desk AI picker");

ctx.AIADeskAis.owner = true;
const gone = ctx.capCardHtml({
  id: "j-gone",
  status: "waiting",
  title: "Oak dresser",
  thenAiGone: { id: "shop-bot", name: "Shop Bot" }
}, "shop");
(function () {
  const bad = capBindPaintFaults(gone, "j-gone");
  const sel = unesc(selectedLabel(gone));
  if (bad.length) fail("gone this-desk Cap must still show the picker: " + bad.join("; "));
  else if (sel.indexOf("Shop Bot") < 0 || sel.indexOf("not on this desk") < 0) {
    fail("gone Cap picker must name Shop Bot and mark not on this desk, got " + sel);
  } else if (/<option[^>]*selected[^>]*>[^<]*James/.test(gone)) {
    fail("gone Cap picker must not first-select James");
  } else pass("gone this-desk Cap picker holds Shop Bot and does not first-select James");
})();

const xss = ctx.bindAiHtml({
  id: "j-xss",
  status: "waiting",
  title: "Need 2 < 3",
  thenAiGone: { id: "shop-bot", name: "Shop Bot <gone>" }
}, "sheet");
if (xss.indexOf("Shop Bot <gone>") >= 0) fail("raw < in Open bind must not become markup");
else if (xss.indexOf("Shop Bot &lt;gone&gt;") < 0) fail("Open gone bind name must stay text");
else pass("Open gone bind name stays text");
if (xss.indexOf("Pick stays pending until Yes") < 0) fail("Open xss bind must stay pending until Yes");
else pass("Open xss bind stays pending until Yes");

const xssCap = ctx.capCardHtml({
  id: "j-xss",
  status: "waiting",
  title: "Need 2 < 3",
  thenAiGone: { id: "shop-bot", name: "Shop Bot <gone>" }
}, "shop");
if (xssCap.indexOf("Shop Bot <gone>") >= 0) fail("raw < in Cap bind must not become markup");
else if (xssCap.indexOf("Shop Bot &lt;gone&gt;") < 0) fail("Cap gone bind name must stay text");
else pass("Cap gone bind name stays text");

if (card.indexOf(">Stop<") < 0) fail("Open sheet decide must name Stop, not No");
else pass("Open sheet decide names Stop");
if (card.indexOf(">No<") >= 0 || card.indexOf("No?") >= 0) fail("Open sheet still paints No as the rail");
else pass("Open sheet does not paint No as the rail");

function paintCapFrom(src, job) {
  if (!src) return null;
  const run = paintCtx(src);
  if (typeof run.capCardHtml !== "function") return "no window.capCardHtml";
  return run.capCardHtml(job || live, "shop");
}

function swap(str, from, to) { return str.indexOf(from) < 0 ? null : str.split(from).join(to); }

const MUTANTS = [
  ["cap source loses window.bindAiHtml", function () {
    const n = swap(needs, "window.bindAiHtml", "window.bindAiOff");
    return n && capBindSourceFaults(n);
  }],
  ["cap source loses Desk AI on this card", function () {
    const n = swap(needs, "Desk AI on this card", "Helper on this card");
    return n && capBindSourceFaults(n);
  }],
  ["cap source loses q-ai-pick", function () {
    const n = swap(needs, "q-ai-pick", "q-ai-miss");
    return n && capBindSourceFaults(n);
  }],
  ["more-queue tip drops gone-AI honesty", function () {
    const n = swap(moreTips, "If a named desk AI is not on this desk, the card says so.", "The queue just runs.");
    return n && moreQueueBindFaults(n);
  }],
  ["public Drop copy drifts", function () {
    const n = swap(drop, "They never see money, Stop, or People", "They can see the desk.");
    return n && dropCopyFaults(n);
  }],
  ["cap card drops the cap bind", function () {
    const n = swap(needs, 'v(t,"cap")', '""');
    const html = paintCapFrom(n);
    if (html == null) return null;
    if (typeof html !== "string") return [String(html)];
    return capBindPaintFaults(html, "j-live");
  }],
  ["pick skips Yes (silent onchange bind)", function () {
    const n = swap(needs, 'class="q-ai-pick">', 'class="q-ai-pick" onchange="bindAiOnCard(id, this.value)">');
    if (!n) return null;
    const srcBad = capBindSourceFaults(n);
    if (srcBad && srcBad.length) return srcBad;
    const html = paintCapFrom(n);
    if (typeof html !== "string") return [String(html)];
    return capBindPaintFaults(html, "j-live");
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

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("check-open-cap-bind mutants: " + mutCaught + "/" + MUTANTS.length + " caught");
console.log("check-open-cap-bind: ok");

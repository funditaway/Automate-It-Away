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
const jobsSrc = read("api/jobs.js");
const help = read("help.html");
const more = read("more.html");
const moreTips = more + "\n" + read("aia-tip.js");
const yesNo = read("ACCOUNT-YES-NO.md");
const pkg = read("package.json");

// a2ad8c4 minified promptSurface / promptHtml / capCardHtml. Surfaces still
// allow queue / cap / sheet / read; ids are still q-reply-{surface}-{id};
// this-desk Cap uses cap, other-desk Cap uses read.
function promptSurfaceFaults(src) {
  const bad = [];
  if (src.indexOf('return"cap"===t||"sheet"===t||"read"===t||"queue"===t?t:"queue"') < 0) {
    bad.push("missing prompt surface allowlist");
  }
  return bad;
}
function promptFnsFaults(src) {
  const bad = [];
  if (src.indexOf("window.promptHtml") < 0) bad.push("missing window.promptHtml");
  if (src.indexOf("window.capCardHtml") < 0) bad.push("missing window.capCardHtml");
  return bad;
}
function promptIdFaults(src) {
  const bad = [];
  if (src.indexOf('"q-reply-"+') < 0) bad.push("missing q-reply-{surface}-{id}");
  return bad;
}
function capReadFaults(src) {
  const bad = [];
  if (src.indexOf('?"read":"cap"') < 0) bad.push("missing this-desk cap / other-desk read");
  return bad;
}
(function () {
  const bad = promptSurfaceFaults(needs);
  if (bad.length) fail("prompt surfaces drifted: " + bad.join("; "));
  else pass("prompt surfaces allow queue / cap / sheet / read");
})();
(function () {
  const bad = promptFnsFaults(needs);
  if (bad.length) fail("desk-needs.js prompt reply drifted: " + bad.join("; "));
  else pass("window.promptHtml and window.capCardHtml stay exported");
})();
(function () {
  const bad = promptIdFaults(needs);
  if (bad.length) fail("reply field id drifted: " + bad.join("; "));
  else pass("reply ids are q-reply-{surface}-{id}");
})();
(function () {
  const bad = capReadFaults(needs);
  if (bad.length) fail("capCardHtml must send on this desk and stay read-only on another desk: " + bad.join("; "));
  else pass("Cap send vs read-only follows this desk");
})();
if (card.indexOf("promptHtml(j, sheetNeedOf(j), \"sheet\")") < 0) {
  fail("Open sheet must use the sheet reply surface");
} else pass("Open sheet uses sheet reply surface");
if (jobsSrc.indexOf("wasWaiting === \"info\" || wasWaiting === \"helper\"") < 0) {
  fail("reply must only apply When=do Then after a missing-info / helper wait");
} else pass("reply does not fire Then on a Yes-ready card");
if (/oauth|spacex|login\.x\.ai|custodial wallet|Collect charge|silent send/i.test(needs + card)) {
  fail("Cap prompt reply invented Grok OAuth / wallet / Collect charge");
} else pass("no OAuth / wallet / Collect charge");
if (help.indexOf("Cap on this desk") < 0) fail("help must name Cap on this desk reply");
else pass("help names Cap on this desk reply");
if (help.indexOf("Other-desk Cap") < 0) fail("help must name other-desk Cap read-only");
else pass("help names other-desk Cap read-only");
// a66b146 shortened more-queue. This-desk Reply and gone-AI honesty stay;
// other-desk Cap read-only stays in help and in capCardHtml runtime.
function moreQueueCapFaults(src) {
  const start = src.indexOf('"more-queue":');
  const end = src.indexOf('"more-drop":');
  const slice = src.slice(start, end < 0 ? src.length : end);
  const bad = [];
  if (slice.indexOf("You can Reply on this desk") < 0) bad.push("missing You can Reply on this desk");
  if (slice.indexOf("If a named desk AI is not on this desk, the card says so.") < 0) {
    bad.push("missing gone-AI honesty");
  }
  return bad;
}
(function () {
  const bad = moreQueueCapFaults(moreTips);
  if (bad.length) fail("more Queue tip must stay honest about Reply and gone AI: " + bad.join("; "));
  else pass("more Queue tip names Reply on this desk and gone AI");
})();
if (more.indexOf('data-aia-tip="more-queue"') < 0) fail("more.html must wire more-queue tip");
else pass("more.html wires more-queue tip");
if (yesNo.indexOf("check-cap-prompt-reply.js") < 0) fail("ACCOUNT-YES-NO must record Cap prompt reply leftover");
else pass("ACCOUNT-YES-NO records Cap prompt reply leftover");
if (pkg.indexOf("check-cap-prompt-reply.js") < 0) fail("package.json must run check-cap-prompt-reply");
else pass("package.json runs check-cap-prompt-reply");

function paintCtx() {
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
    localStorage: { getItem: function () { return ""; }, setItem: function () {} },
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
  vm.runInNewContext(needs, ctx);
  vm.runInNewContext(card, ctx);
  return ctx;
}

const ctx = paintCtx();
if (typeof ctx.card !== "function") fail("desk-needs.js must set window.card");
else pass("card() is on window");
if (typeof ctx.capCardHtml !== "function") fail("desk-needs.js must set window.capCardHtml");
else pass("capCardHtml() is on window");
if (typeof ctx.threadSheetHtml !== "function") fail("desk-card.js must set threadSheetHtml");
else pass("threadSheetHtml() is on window");

const askJob = {
  id: "j-cap-reply",
  status: "waiting",
  title: "Missed call",
  waitingOn: "info",
  why: "Need a number before this can go."
};

const queueHtml = ctx.card(askJob, false);
const capHere = ctx.capCardHtml(askJob, "shop");
const capOther = ctx.capCardHtml(Object.assign({}, askJob, { slug: "other-desk", desk: "Other desk" }), "shop");
const openHtml = ctx.threadSheetHtml(askJob);

if (queueHtml.indexOf("q-reply-queue-j-cap-reply") < 0) fail("Queue reply field must be q-reply-queue-{id}");
else pass("Queue reply field is unique");
if (queueHtml.indexOf("replyOnCard('j-cap-reply','queue')") < 0) fail("Queue Reply must name the queue surface");
else pass("Queue Reply names the queue surface");
if (capHere.indexOf("q-reply-cap-j-cap-reply") < 0) fail("Cap on this desk must have q-reply-cap-{id}");
else pass("Cap on this desk has its own reply field");
if (capHere.indexOf("replyOnCard('j-cap-reply','cap')") < 0) fail("Cap on this desk must Reply on the cap surface");
else pass("Cap on this desk Replies on the cap surface");
if (capHere.indexOf("q-reply-queue-") >= 0) fail("Cap must not reuse the queue reply id");
else pass("Cap does not reuse the queue reply id");
if (openHtml.indexOf("q-reply-sheet-j-cap-reply") < 0) fail("Open sheet must have q-reply-sheet-{id}");
else pass("Open sheet has its own reply field");
if (openHtml.indexOf("replyOnCard('j-cap-reply','sheet')") < 0) fail("Open sheet prompt must Reply on the sheet surface");
else pass("Open sheet Replies on the sheet surface");

if (/q-reply-box|replyOnCard/.test(capOther)) fail("other-desk Cap must stay read-only");
else pass("other-desk Cap stays read-only");
if (capOther.indexOf("q-prompt") < 0) fail("other-desk Cap must still paint the question");
else pass("other-desk Cap still paints the question");
if (capOther.indexOf("Open on Other desk") < 0 && capOther.indexOf("Open on other-desk") < 0) {
  fail("other-desk Cap must offer Open on that desk, got " + capOther.slice(0, 280));
} else pass("other-desk Cap offers Open on that desk");
if (capHere.indexOf("Nothing sent alone") < 0 || capOther.indexOf("Nothing sent alone") < 0) {
  fail("Cap prompt must say nothing sent alone");
} else pass("Cap prompt says nothing sent alone");

const ids = [
  (queueHtml.match(/id="q-reply-[^"]+"/) || [])[0],
  (capHere.match(/id="q-reply-[^"]+"/) || [])[0],
  (openHtml.match(/id="q-reply-[^"]+"/) || [])[0]
];
if (ids[0] && ids[1] && ids[2] && (ids[0] === ids[1] || ids[0] === ids[2] || ids[1] === ids[2])) {
  fail("Queue / Cap / Open reply ids must differ, got " + ids.join(" | "));
} else pass("Queue / Cap / Open reply ids differ");

const goneJob = {
  id: "j-gone",
  status: "waiting",
  title: "Who is this for",
  waitingOn: "person",
  why: "Need a name before this can go.",
  thenAiGone: { name: "Shop Bot <gone>", id: "ai_gone" },
  draft: "Ask who it is for."
};
const goneHere = ctx.capCardHtml(goneJob, "shop");
const goneOther = ctx.capCardHtml(Object.assign({}, goneJob, { slug: "other-desk", desk: "Other desk" }), "shop");
if (goneHere.indexOf("not on this desk") < 0 || goneHere.indexOf("Shop Bot") < 0) {
  fail("Cap on this desk must name a gone desk AI");
} else pass("Cap on this desk names a gone desk AI");
if (goneHere.indexOf("q-reply-cap-j-gone") < 0 || goneHere.indexOf("replyOnCard('j-gone','cap')") < 0) {
  fail("Cap on this desk must still let a person Reply when the Then bind is gone");
} else pass("Cap on this desk still Replies when the Then bind is gone");
if (/>Yes</.test(goneHere)) fail("gone-AI Cap reply must not show Yes");
else pass("gone-AI Cap reply does not show Yes");
if (goneHere.indexOf("Nothing sent alone") < 0) fail("gone-AI Cap must say nothing sent alone");
else pass("gone-AI Cap says nothing sent alone");
if (/q-reply-box|replyOnCard/.test(goneOther)) fail("other-desk gone-AI Cap must stay read-only");
else pass("other-desk gone-AI Cap stays read-only");
if (goneOther.indexOf("not on this desk") < 0 || goneOther.indexOf("Shop Bot") < 0) {
  fail("other-desk Cap must still name a gone desk AI");
} else pass("other-desk Cap names a gone desk AI");

// Mutants for the replaced assertions. In-memory only.
function swap(s, from, to) { return s.indexOf(from) < 0 ? null : s.split(from).join(to); }
const MUTANTS = [
  ["promptSurface allowlist dropped", function () {
    const n = swap(needs, 'return"cap"===t||"sheet"===t||"read"===t||"queue"===t?t:"queue"', 'return t||"queue"');
    return n && promptSurfaceFaults(n);
  }],
  ["promptHtml loses window.promptHtml", function () {
    const n = swap(needs, "window.promptHtml", "window.promptOff");
    return n && promptFnsFaults(n);
  }],
  ["capCardHtml loses window.capCardHtml", function () {
    const n = swap(needs, "window.capCardHtml", "window.capOff");
    return n && promptFnsFaults(n);
  }],
  ["q-reply surface id dropped", function () {
    const n = swap(needs, '"q-reply-"+', '"q-box-"+');
    return n && promptIdFaults(n);
  }],
  ["this-desk cap / other-desk read flipped", function () {
    const n = swap(needs, '?"read":"cap"', '?"cap":"read"');
    return n && capReadFaults(n);
  }],
  ["more-queue tip drops Reply on this desk", function () {
    const t = swap(moreTips, "You can Reply on this desk", "You can send from this desk");
    return t && moreQueueCapFaults(t);
  }],
  ["more-queue tip drops gone-AI honesty", function () {
    const t = swap(moreTips, "If a named desk AI is not on this desk, the card says so.", "A named desk AI always drafts here.");
    return t && moreQueueCapFaults(t);
  }]
];
let mutCaught = 0;
MUTANTS.forEach(function (m) {
  let out;
  try { out = m[1](); } catch (e) { out = ["threw " + e.message]; }
  if (out === null || out === false || out === undefined) fail("mutant does not apply: " + m[0]);
  else if (out.length) { mutCaught += 1; console.log("ok   mutant caught: " + m[0] + " (" + out[0] + ")"); }
  else fail("mutant survived: " + m[0]);
});
if (!failed) console.log("check-cap-prompt-reply mutants: " + mutCaught + "/" + MUTANTS.length + " caught");

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("check-cap-prompt-reply: ok");

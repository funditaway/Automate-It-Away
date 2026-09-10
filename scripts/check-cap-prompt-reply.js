#!/usr/bin/env node
"use strict";

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
const yesNo = read("ACCOUNT-YES-NO.md");
const pkg = read("package.json");

["function promptSurface", "function promptHtml", "function capCardHtml", "q-reply-\" + surface"].forEach(function (bit) {
  if (needs.indexOf(bit) < 0 && card.indexOf(bit) < 0) fail("missing " + bit);
  else pass("has " + bit);
});
if (needs.indexOf("other ? \"read\" : \"cap\"") < 0 && needs.indexOf("other ? 'read' : 'cap'") < 0) {
  fail("capCardHtml must send on this desk and stay read-only on another desk");
} else pass("Cap send vs read-only follows this desk");
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
if (more.indexOf("Cap on this desk can Reply") < 0) fail("more.html Queue must name Cap this-desk Reply");
else pass("more.html names Cap this-desk Reply");
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

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("check-cap-prompt-reply: ok");

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
const help = read("help.html");
const more = read("more.html");
const yesNo = read("ACCOUNT-YES-NO.md");
const pkg = read("package.json");

["function capCardHtml", "function promptHtml", "function namedNeedsWho", "function chipsHtml", "function goneHoldLabel", "not on this desk"].forEach(function (bit) {
  if (needs.indexOf(bit) < 0) fail("desk-needs.js missing " + bit);
  else pass("desk-needs.js " + bit);
});
["function sheetPromptHtml", "function sheetChipsHtml", "function namedNeedsWhoOf", "function threadSheetHtml", "not on this desk"].forEach(function (bit) {
  if (card.indexOf(bit) < 0) fail("desk-card.js missing " + bit);
  else pass("desk-card.js " + bit);
});

const capSrc = needs.slice(needs.indexOf("function capCardHtml"), needs.indexOf("async function loadCap"));
if (capSrc.indexOf("promptHtml(j, need)") < 0) fail("capCardHtml must call promptHtml");
else pass("capCardHtml calls promptHtml");
if (capSrc.indexOf("chipsHtml(j, need") < 0) fail("capCardHtml must call chipsHtml with cardNeeds");
else pass("capCardHtml uses chipsHtml + cardNeeds");
if (capSrc.indexOf("primaryAi(") >= 0) fail("capCardHtml must not first-eligible primaryAi");
else pass("capCardHtml does not first-eligible primaryAi");

const sheetSrc = card.slice(card.indexOf("function sheetPromptHtml"), card.indexOf("function talkLabelOf"));
if (sheetSrc.indexOf("namedNeedsWhoOf") < 0 && sheetSrc.indexOf("promptHtml") < 0) {
  fail("sheetPromptHtml must share namedNeedsWho / promptHtml");
} else pass("sheetPromptHtml shares gone ask-who helpers");
if (sheetSrc.indexOf("esc(label)") < 0 && sheetSrc.indexOf("esc(q)") < 0 && card.indexOf("esc(label)") < 0) {
  fail("Open-job prompt must escape ask-who");
} else pass("Open-job prompt escapes ask-who");

const threadSrc = card.slice(card.indexOf("function threadSheetHtml"), card.indexOf("function jobBy"));
if (threadSrc.indexOf("sheetPromptHtml") < 0) fail("threadSheetHtml must insert sheetPromptHtml");
else pass("threadSheetHtml inserts sheetPromptHtml");
if (threadSrc.indexOf("sheetChipsHtml") < 0) fail("threadSheetHtml must insert sheetChipsHtml");
else pass("threadSheetHtml inserts sheetChipsHtml");

if (/oauth|spacex|login\.x\.ai|custodial wallet|Collect charge|silent send/i.test(needs + card)) {
  fail("Cap / Open prompt invented Grok OAuth / wallet / Collect charge");
} else pass("no OAuth / wallet / Collect charge");
if (help.indexOf("Cap cards and Open") < 0 || help.indexOf("prompt ask-who") < 0) {
  fail("help#desk-cards must name Cap / Open prompt ask-who HOLD");
} else pass("help names Cap / Open prompt ask-who HOLD");
if (more.indexOf("Cap and Open") < 0 || more.indexOf("not anonymous desk AI") < 0) {
  fail("more.html Queue must name Cap / Open gone Needs you / prompt HOLD");
} else pass("more.html names Cap / Open gone HOLD");
if (yesNo.indexOf("check-cap-prompt-gone.js") < 0) fail("ACCOUNT-YES-NO must record Cap / Open prompt gone HOLD");
else pass("ACCOUNT-YES-NO records Cap / Open prompt gone HOLD");
if (pkg.indexOf("check-cap-prompt-gone.js") < 0) fail("package.json must run check-cap-prompt-gone");
else pass("package.json runs check-cap-prompt-gone");

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
  ctx.AIADeskAis = {
    rows: [{ name: "James’s AI", does: "Draft the lead packet", prompt: "Ask who it is for and when. Do not send." }],
    primary: function () { return this.rows[0]; }
  };
  return ctx;
}

const ctx = paintCtx();
if (typeof ctx.card !== "function") fail("desk-needs.js must set window.card");
else pass("card() is on window");
if (typeof ctx.capCardHtml !== "function") fail("desk-needs.js must set window.capCardHtml");
else pass("capCardHtml() is on window");
if (typeof ctx.promptHtml !== "function") fail("desk-needs.js must set window.promptHtml");
else pass("promptHtml() is on window");
if (typeof ctx.threadSheetHtml !== "function") fail("desk-card.js must set threadSheetHtml");
else pass("threadSheetHtml() is on window");

function promptWho(html) {
  const m = String(html || "").match(/<div class="q-prompt-who">([\s\S]*?)<\/div>/);
  return m ? m[1] : "";
}
function promptQ(html) {
  const m = String(html || "").match(/<p class="q-prompt-q">([\s\S]*?)<\/p>/);
  return m ? m[1] : "";
}
function needChip(html) {
  const m = String(html || "").match(/<span class="q-chip q-need">([\s\S]*?)<\/span>/);
  return m ? m[1] : "";
}

const goneJob = {
  id: "j-gone-prompt",
  status: "waiting",
  title: "Oak dresser",
  waitingOn: "person",
  thenAiGone: { id: "shop-bot", name: "Shop Bot" }
};

const goneQueue = ctx.card(goneJob, false);
const goneCap = ctx.capCardHtml(goneJob, "shop");
const goneOpen = ctx.threadSheetHtml(goneJob);

[goneQueue, goneCap, goneOpen].forEach(function (html, i) {
  const where = ["Queue", "Cap", "Open"][i];
  if (html.indexOf("q-prompt") < 0) fail(where + " gone card must show prompt ask-who");
  else pass(where + " gone card shows prompt ask-who");
  if (promptWho(html).indexOf("Shop Bot · not on this desk") < 0) {
    fail(where + " gone prompt ask-who must hold Shop Bot · not on this desk, got " + promptWho(html));
  } else pass(where + " gone prompt ask-who holds Shop Bot");
  if (promptWho(html) === "Needs you") fail(where + " gone prompt ask-who must not stay Needs you");
  else pass(where + " gone prompt ask-who is not anonymous Needs you");
  if (promptQ(html).indexOf("The desk AI asked") >= 0) fail(where + " gone prompt must not say The desk AI asked");
  else pass(where + " gone prompt does not say The desk AI asked");
  if (promptQ(html).indexOf("Shop Bot · not on this desk") < 0) {
    fail(where + " gone prompt question must name Shop Bot · not on this desk, got " + promptQ(html));
  } else pass(where + " gone prompt question holds Shop Bot");
  if (needChip(html).indexOf("Shop Bot · not on this desk") < 0) {
    fail(where + " gone Needs you chip must hold Shop Bot · not on this desk, got " + needChip(html));
  } else pass(where + " gone Needs you chip holds Shop Bot");
  if (/James/.test(html) && (promptWho(html).indexOf("James") >= 0 || needChip(html).indexOf("James") >= 0)) {
    fail(where + " gone prompt / Needs you must not first-eligible to James");
  } else pass(where + " gone prompt / Needs you do not name James");
});

if (promptWho(goneQueue) !== promptWho(goneCap) || promptWho(goneQueue) !== promptWho(goneOpen)) {
  fail("Cap / Open prompt-who must match Queue, got " + [promptWho(goneQueue), promptWho(goneCap), promptWho(goneOpen)].join(" | "));
} else pass("Cap / Open prompt-who match Queue");
if (needChip(goneQueue) !== needChip(goneCap) || needChip(goneQueue) !== needChip(goneOpen)) {
  fail("Cap / Open Needs you must match Queue, got " + [needChip(goneQueue), needChip(goneCap), needChip(goneOpen)].join(" | "));
} else pass("Cap / Open Needs you match Queue");

const xssJob = {
  id: "j-gone-xss",
  status: "waiting",
  title: "Need 2 < 3",
  waitingOn: "person",
  thenAiGone: { id: "shop-bot", name: "Shop Bot <gone>" }
};
const xssCap = ctx.capCardHtml(xssJob, "shop");
const xssOpen = ctx.threadSheetHtml(xssJob);
[xssCap, xssOpen].forEach(function (html, i) {
  const where = ["Cap", "Open"][i];
  if (html.indexOf("Shop Bot <gone>") >= 0) fail(where + " raw < in gone prompt name must not become markup");
  else if (html.indexOf("Shop Bot &lt;gone&gt; · not on this desk") < 0) fail(where + " gone prompt name must stay text");
  else pass(where + " gone prompt name stays text");
  if (promptWho(html).indexOf("Shop Bot &lt;gone&gt; · not on this desk") < 0) {
    fail(where + " gone prompt-who must escape the bind, got " + promptWho(html));
  } else pass(where + " gone prompt-who stays text");
  if (needChip(html).indexOf("Shop Bot &lt;gone&gt; · not on this desk") < 0) {
    fail(where + " gone Needs you chip must escape the bind, got " + needChip(html));
  } else pass(where + " gone Needs you chip stays text");
});
if (xssCap.indexOf("Need 2 &lt; 3") < 0) fail("Cap gone title must stay text");
else pass("Cap gone title stays text");

const liveJob = {
  id: "j-live",
  status: "waiting",
  title: "Oak dresser",
  waitingOn: "person",
  deskAi: { name: "Shop Bot", does: "Qualify the click" }
};
const liveCap = ctx.capCardHtml(liveJob, "shop");
const liveOpen = ctx.threadSheetHtml(liveJob);
[liveCap, liveOpen].forEach(function (html, i) {
  const where = ["Cap", "Open"][i];
  if (promptWho(html).indexOf("Shop Bot asks") < 0) fail(where + " live prompt must still say Shop Bot asks, got " + promptWho(html));
  else pass(where + " live prompt still names Shop Bot");
  if (needChip(html).indexOf("Shop Bot · Needs you") < 0) fail(where + " live Needs you chip must still name Shop Bot, got " + needChip(html));
  else pass(where + " live Needs you chip still names Shop Bot");
  if (html.indexOf("not on this desk") >= 0) fail(where + " live bind must not paint gone HOLD");
  else pass(where + " live bind has no gone HOLD");
  if (/James/.test(promptWho(html) + needChip(html))) fail(where + " live Shop Bot must not first-eligible James");
  else pass(where + " live prompt / Needs you do not name James");
});

const unbound = {
  id: "j-any",
  status: "waiting",
  title: "Oak dresser",
  waitingOn: "info",
  why: "Need a number before this can go."
};
const unboundCap = ctx.capCardHtml(unbound, "shop");
const unboundOpen = ctx.threadSheetHtml(unbound);
[unboundCap, unboundOpen].forEach(function (html, i) {
  const where = ["Cap", "Open"][i];
  if (needChip(html) !== "Needs you") fail(where + " unbound Needs you chip must stay Needs you, got " + needChip(html));
  else pass(where + " unbound Needs you chip stays Needs you");
  if (html.indexOf("Ask the human") < 0) fail(where + " unbound missing-info must still say Ask the human");
  else pass(where + " unbound missing-info still says Ask the human");
  if (html.indexOf("not on this desk") >= 0) fail(where + " unbound card must not paint gone HOLD");
  else pass(where + " unbound card has no gone HOLD");
});

const goneQueueYes = ctx.card(goneJob, false);
if (goneQueueYes.indexOf(">Yes<") < 0 || goneQueueYes.indexOf(">Kill<") < 0) fail("Yes / Stop / Kill must stay on Queue");
else pass("Yes / Stop / Kill stay on Queue");

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("check-cap-prompt-gone: ok");

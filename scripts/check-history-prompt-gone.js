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

["people.js"].forEach(function (name) {
  const syntax = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
  if (syntax.status !== 0) fail(name + " must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
  else pass(name + " parses");
});
(function () {
  const m = read("history.html").match(/<script>\s*var lane[\s\S]*?<\/script>/);
  if (!m) {
    fail("history.html script must parse: missing History paint script");
    return;
  }
  const tmp = path.join(require("os").tmpdir(), "aia-history-prompt-" + Date.now() + ".js");
  fs.writeFileSync(tmp, m[0].replace(/^<script>/, "").replace(/<\/script>$/, ""));
  const syntax = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  try { fs.unlinkSync(tmp); } catch (e) {}
  if (syntax.status !== 0) fail("history.html script must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
  else pass("history.html script parses");
})();

const history = read("history.html");
const people = read("people.js");
const peopleHtml = read("people.html");
const help = read("help.html");
const more = read("more.html");
const yesNo = read("ACCOUNT-YES-NO.md");
const pkg = read("package.json");

["function promptHtml", "function namedNeedsWho", "function goneHoldLabel", "function chipsHtml", "function isPromptReply", "not on this desk"].forEach(function (bit) {
  if (history.indexOf(bit) < 0) fail("history.html missing " + bit);
  else pass("history.html " + bit);
  if (people.indexOf(bit) < 0) fail("people.js missing " + bit);
  else pass("people.js " + bit);
});

const histNamed = history.slice(history.indexOf("function namedNeedsWho"), history.indexOf("function whyOf"));
if (/primaryAi\(/.test(histNamed)) fail("History namedNeedsWho must not first-eligible to primaryAi()");
else pass("History namedNeedsWho does not first-eligible to primaryAi");
if (!/goneHoldLabel/.test(histNamed)) fail("History namedNeedsWho must name the gone bind");
else pass("History namedNeedsWho names the gone bind");

const peopleNamed = people.slice(people.indexOf("function namedNeedsWho"), people.indexOf("function whyOf"));
if (/primaryAi\(/.test(peopleNamed)) fail("People namedNeedsWho must not first-eligible to primaryAi()");
else pass("People namedNeedsWho does not first-eligible to primaryAi");
if (!/goneHoldLabel/.test(peopleNamed)) fail("People namedNeedsWho must name the gone bind");
else pass("People namedNeedsWho names the gone bind");

const histPrompt = history.slice(history.indexOf("function promptHtml"), history.indexOf("function chipsHtml"));
if (histPrompt.indexOf("namedNeedsWho") < 0) fail("History promptHtml must use namedNeedsWho");
else pass("History promptHtml uses namedNeedsWho");
if (histPrompt.indexOf("esc(label)") < 0) fail("History promptHtml must escape ask-who");
else pass("History promptHtml escapes ask-who");
if (/q-reply-box|replyOnCard/.test(histPrompt)) fail("History promptHtml must stay read-only");
else pass("History promptHtml is read-only");

const peoplePrompt = people.slice(people.indexOf("function promptHtml"), people.indexOf("function chipsHtml"));
if (peoplePrompt.indexOf("namedNeedsWho") < 0) fail("People promptHtml must use namedNeedsWho");
else pass("People promptHtml uses namedNeedsWho");
if (peoplePrompt.indexOf("esc(label)") < 0) fail("People promptHtml must escape ask-who");
else pass("People promptHtml escapes ask-who");
if (/q-reply-box|replyOnCard/.test(peoplePrompt)) fail("People promptHtml must stay read-only");
else pass("People promptHtml is read-only");

if (history.indexOf("promptHtml(it)") < 0) fail("History threadHtml must insert promptHtml");
else pass("History threadHtml inserts promptHtml");
if (people.indexOf("promptHtml(item)") < 0) fail("People trailThreadHtml must insert promptHtml");
else pass("People trailThreadHtml inserts promptHtml");

if (/oauth|spacex|login\.x\.ai|custodial wallet|Collect charge|silent send/i.test(history + people)) {
  fail("History / People prompt invented Grok OAuth / wallet / Collect charge");
} else pass("no OAuth / wallet / Collect charge");

if (help.indexOf("History, Explore, and People open cards") < 0 || help.indexOf("prompt ask-who") < 0) {
  fail("help#desk-cards must name History / Explore / People prompt ask-who HOLD");
} else pass("help names History / Explore / People prompt ask-who HOLD");
if (more.indexOf("History, Explore, and People") < 0 || more.indexOf("not anonymous desk AI") < 0) {
  fail("more.html Queue must name History / Explore / People gone Needs you / prompt HOLD");
} else pass("more.html names History / Explore / People gone HOLD");
if (yesNo.indexOf("check-history-prompt-gone.js") < 0) fail("ACCOUNT-YES-NO must record History / People prompt gone HOLD");
else pass("ACCOUNT-YES-NO records History / People prompt gone HOLD");
if (pkg.indexOf("check-history-prompt-gone.js") < 0) fail("package.json must run check-history-prompt-gone");
else pass("package.json runs check-history-prompt-gone");
if (peopleHtml.indexOf("Needs you / prompt ask-who") < 0) fail("people.html must name Needs you / prompt ask-who");
else pass("people.html names Needs you / prompt ask-who");
if (history.indexOf("Needs you / prompt ask-who") < 0) fail("History intro must name Needs you / prompt ask-who");
else pass("History intro names Needs you / prompt ask-who");

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, function (c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
  });
}

function histCtx() {
  const paintSrc = history.match(/function thenWho\(it\)[\s\S]*?function story\(\)\{[\s\S]*?\n\}/);
  if (!paintSrc) {
    fail("could not extract History prompt paint");
    return null;
  }
  const ctx = {
    last: [],
    window: {},
    document: { getElementById: function () { return null; } },
    esc: esc
  };
  vm.runInNewContext(paintSrc[0], ctx);
  return ctx;
}

function peopleCtx() {
  const paintSrc = people.match(/function thenWhoOf\(item\)[\s\S]*?function historyHtml\(item\)[\s\S]*?\n\}/);
  if (!paintSrc) {
    fail("could not extract People prompt paint");
    return null;
  }
  const ctx = {
    esc: esc,
    fmtTime: function () { return "just now"; }
  };
  vm.runInNewContext(paintSrc[0], ctx);
  return ctx;
}

const hCtx = histCtx();
const pCtx = peopleCtx();
if (hCtx && typeof hCtx.threadHtml === "function") pass("History threadHtml runs");
else fail("History threadHtml must run");
if (pCtx && typeof pCtx.cardHtml === "function") pass("People cardHtml runs");
else fail("People cardHtml must run");

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

function paintPair(job) {
  return {
    history: hCtx ? hCtx.threadHtml(job) : "",
    explore: hCtx && typeof hCtx.explore === "function" ? "" : (hCtx ? hCtx.threadHtml(job) : ""),
    people: pCtx ? pCtx.cardHtml(Object.assign({ desk: "Shop", side: "yours" }, job)) : ""
  };
}

const gone = paintPair(goneJob);
[["History", gone.history], ["Explore", gone.explore || gone.history], ["People", gone.people]].forEach(function (pair) {
  const where = pair[0];
  const html = pair[1];
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
  if (/q-reply-box|replyOnCard/.test(html)) fail(where + " prompt must not send a reply from this view");
  else pass(where + " prompt stays read-only");
});

if (promptWho(gone.history) !== promptWho(gone.people)) {
  fail("People prompt-who must match History, got " + [promptWho(gone.history), promptWho(gone.people)].join(" | "));
} else pass("People prompt-who matches History");
if (needChip(gone.history) !== needChip(gone.people)) {
  fail("People Needs you must match History, got " + [needChip(gone.history), needChip(gone.people)].join(" | "));
} else pass("People Needs you matches History");

if (hCtx && typeof hCtx.deskAiLine === "function") {
  const line = hCtx.deskAiLine(goneJob);
  if (line.indexOf("Shop Bot · not on this desk") < 0) fail("Explore Desk AI must name gone HOLD");
  else pass("Explore Desk AI names gone HOLD");
}

const xssJob = {
  id: "j-gone-xss",
  status: "waiting",
  title: "Need 2 < 3",
  waitingOn: "person",
  thenAiGone: { id: "shop-bot", name: "Shop Bot <gone>" }
};
const xss = paintPair(xssJob);
[["History", xss.history], ["People", xss.people]].forEach(function (pair) {
  const where = pair[0];
  const html = pair[1];
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

const liveJob = {
  id: "j-live",
  status: "waiting",
  title: "Oak dresser",
  waitingOn: "person",
  deskAi: { name: "Shop Bot", does: "Qualify the click" }
};
const live = paintPair(liveJob);
[["History", live.history], ["People", live.people]].forEach(function (pair) {
  const where = pair[0];
  const html = pair[1];
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
const unboundPaint = paintPair(unbound);
[["History", unboundPaint.history], ["People", unboundPaint.people]].forEach(function (pair) {
  const where = pair[0];
  const html = pair[1];
  if (needChip(html) !== "Needs you") fail(where + " unbound Needs you chip must stay Needs you, got " + needChip(html));
  else pass(where + " unbound Needs you chip stays Needs you");
  if (html.indexOf("Ask the human") < 0) fail(where + " unbound missing-info must still say Ask the human");
  else pass(where + " unbound missing-info still says Ask the human");
  if (html.indexOf("not on this desk") >= 0) fail(where + " unbound card must not paint gone HOLD");
  else pass(where + " unbound card has no gone HOLD");
});

if (pCtx) {
  const emptyPaint = pCtx.cardHtml({ title: "Bare card", desk: "Shop", status: "waiting" });
  if (emptyPaint.indexOf("q-prompt") >= 0 || emptyPaint.indexOf("q-need") >= 0) {
    fail("bare open card must not invent Needs you / prompt");
  } else pass("bare open card stays bare");
}

if (hCtx) {
  const emptyHist = hCtx.threadHtml({ title: "Bare card", status: "waiting" });
  if (emptyHist.indexOf("q-prompt") >= 0 || emptyHist.indexOf("q-need") >= 0) {
    fail("bare History card must not invent Needs you / prompt");
  } else pass("bare History card stays bare");
}

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("check-history-prompt-gone: ok");

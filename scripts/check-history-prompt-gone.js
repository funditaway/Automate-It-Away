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
const moreTips = more + "\n" + read("aia-tip.js");
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
// a66b146 shortened the More Queue / History tips. The longer
// "History, Explore, and People" / "not anonymous desk AI" / "Copy story
// copies that same trail" sentences are parked for a later copy pass —
// do not require them here. Honest gone wording still lives in help.html
// (and currently in the shorter more-queue / more-history tips: "If a
// named desk AI is not on this desk, the card says so."). Assert the
// painted History / Explore / People behaviour, and help.html, not tip copy.
if (yesNo.indexOf("check-history-prompt-gone.js") < 0) fail("ACCOUNT-YES-NO must record History / People prompt gone HOLD");
else pass("ACCOUNT-YES-NO records History / People prompt gone HOLD");
if (pkg.indexOf("check-history-prompt-gone.js") < 0) fail("package.json must run check-history-prompt-gone");
else pass("package.json runs check-history-prompt-gone");
if (peopleHtml.indexOf("Needs you / prompt ask-who") < 0) fail("people.html must name Needs you / prompt ask-who");
else pass("people.html names Needs you / prompt ask-who");
if (history.indexOf("Needs you") < 0) fail("History must keep Needs you");
else pass("History keeps Needs you");
if (help.indexOf("Copy story") < 0) fail("help must name History Copy story honesty");
else pass("help names History Copy story honesty");
if (more.indexOf('data-aia-tip="more-history"') < 0) fail("more.html must wire more-history tip");
else pass("more.html wires more-history tip");
if (history.indexOf("storyOf(row)") < 0) fail("History Copy story must copy storyOf");
else pass("History Copy story copies storyOf");
if (history.indexOf("last.map(storyOf)") < 0) fail("History Copy this view must reuse storyOf");
else pass("History Copy this view reuses storyOf");

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
function goneChip(html) {
  const m = String(html || "").match(/<span class="q-chip q-ai-gone">([\s\S]*?)<\/span>/);
  return m ? m[1] : "";
}
function unesc(s) {
  return String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// Behaviour only: the gone AI is named and marked not on this desk on a
// face surface (gone chip, Needs you chip, or prompt-who). Do not require
// the exact "Name · not on this desk" compound, do not require that line
// to be duplicated on the question, and do not require "Gone bind HOLDs."
function historyPromptGonePaintFaults(html, name) {
  name = name || "Shop Bot";
  const bad = [];
  if (!html) { bad.push("no card html"); return bad; }
  if (html.indexOf("q-prompt") < 0) bad.push("missing prompt ask-who");
  if (html.indexOf("q-ai-gone") < 0) bad.push("missing q-ai-gone");
  const who = unesc(promptWho(html));
  const chip = unesc(needChip(html));
  const gone = unesc(goneChip(html));
  const faces = [who, chip, gone];
  if (!faces.some(function (s) { return s.indexOf(name) >= 0; })) bad.push("gone AI not named on the face");
  if (!faces.some(function (s) { return s.indexOf("not on this desk") >= 0; })) bad.push("missing not on this desk mark");
  if (who === "Needs you") bad.push("prompt-who stayed anonymous");
  if (chip === "Needs you") bad.push("Needs you chip stayed anonymous");
  if (/James/.test(who) || /James/.test(chip)) bad.push("stamped James");
  if (/q-reply-box|replyOnCard/.test(html)) bad.push("reply is not read-only");
  if (promptQ(html).indexOf("The desk AI asked") >= 0) bad.push("said The desk AI asked");
  return bad;
}

function historyPromptGoneSourceFaults(histSrc, peopleSrc) {
  const bad = [];
  ["function promptHtml", "function namedNeedsWho", "function goneHoldLabel", "function chipsHtml", "function isPromptReply", "not on this desk"].forEach(function (bit) {
    if (histSrc.indexOf(bit) < 0) bad.push("history.html missing " + bit);
    if (peopleSrc.indexOf(bit) < 0) bad.push("people.js missing " + bit);
  });
  return bad;
}

const goneJob = {
  id: "j-gone-prompt",
  status: "waiting",
  title: "Oak dresser",
  waitingOn: "person",
  thenAiGone: { id: "shop-bot", name: "Shop Bot" }
};

function paintPair(job, histContext, peopleContext) {
  histContext = histContext || hCtx;
  peopleContext = peopleContext || pCtx;
  const thread = histContext && typeof histContext.threadHtml === "function" ? histContext.threadHtml(job) : "";
  return {
    history: thread,
    explore: thread,
    people: peopleContext && typeof peopleContext.cardHtml === "function" ? peopleContext.cardHtml(Object.assign({ desk: "Shop", side: "yours" }, job)) : ""
  };
}

const gone = paintPair(goneJob);
[["History", gone.history], ["Explore", gone.explore], ["People", gone.people]].forEach(function (pair) {
  const where = pair[0];
  const html = pair[1];
  const bad = historyPromptGonePaintFaults(html, "Shop Bot");
  if (bad.length) fail(where + " gone card must name the gone AI and mark not on this desk: " + bad.join("; "));
  else pass(where + " gone card names Shop Bot and marks not on this desk");
});

if (promptWho(gone.history) !== promptWho(gone.people)) {
  fail("People prompt-who must match History, got " + [promptWho(gone.history), promptWho(gone.people)].join(" | "));
} else pass("People prompt-who matches History");
if (needChip(gone.history) !== needChip(gone.people)) {
  fail("People Needs you must match History, got " + [needChip(gone.history), needChip(gone.people)].join(" | "));
} else pass("People Needs you matches History");

if (hCtx && typeof hCtx.deskAiLine === "function") {
  const line = hCtx.deskAiLine(goneJob);
  if (line.indexOf("Shop Bot") < 0 || line.indexOf("not on this desk") < 0) fail("Explore Desk AI must name the gone AI and mark not on this desk, got " + line);
  else pass("Explore Desk AI names Shop Bot and marks not on this desk");
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
  if (typeof hCtx.storyOf !== "function") fail("History storyOf must run");
  else pass("History storyOf runs");
  const goneCopy = hCtx.storyOf(goneJob);
  if (goneCopy.indexOf("Shop Bot") < 0 || goneCopy.indexOf("not on this desk") < 0) fail("Copy story gone card must name the gone AI and mark not on this desk, got " + goneCopy);
  else pass("Copy story gone card names Shop Bot and marks not on this desk");
  if (/James/.test(goneCopy)) fail("Copy story gone card must not name James");
  else pass("Copy story gone card does not name James");
  if (goneCopy.indexOf("Then draft") >= 0) fail("Copy story gone card must not look like a live Then draft");
  else pass("Copy story gone card does not look live");
  const liveCopy = hCtx.storyOf(liveJob);
  if (liveCopy.indexOf("Shop Bot") < 0) fail("Copy story live card must still name Shop Bot, got " + liveCopy);
  else pass("Copy story live card still names Shop Bot");
  if (liveCopy.indexOf("not on this desk") >= 0) fail("Copy story live card must not paint gone HOLD");
  else pass("Copy story live card has no gone HOLD");
  const unboundCopy = hCtx.storyOf(unbound);
  if (unboundCopy.indexOf("Needs you") < 0 && unboundCopy.indexOf("Ask the human") < 0) {
    fail("Copy story unbound card must keep Needs you / Ask the human, got " + unboundCopy);
  } else pass("Copy story unbound card keeps Needs you / Ask the human");
  if (unboundCopy.indexOf("not on this desk") >= 0) fail("Copy story unbound card must not paint gone HOLD");
  else pass("Copy story unbound card has no gone HOLD");
  const bareCopy = hCtx.storyOf({ title: "Bare card", status: "waiting" });
  if (bareCopy.indexOf("Needs you") >= 0 || bareCopy.indexOf("not on this desk") >= 0) {
    fail("Copy story bare card must not invent Needs you / gone HOLD, got " + bareCopy);
  } else pass("Copy story bare card stays bare");
}

function ctxFromHistory(src) {
  const paintSrc = String(src || "").match(/function thenWho\(it\)[\s\S]*?function story\(\)\{[\s\S]*?\n\}/);
  if (!paintSrc) return null;
  const ctx = {
    last: [],
    window: {},
    document: { getElementById: function () { return null; } },
    esc: esc
  };
  try { vm.runInNewContext(paintSrc[0], ctx); } catch (e) { return { __err: String(e && e.message || e) }; }
  return ctx;
}
function ctxFromPeople(src) {
  const paintSrc = String(src || "").match(/function thenWhoOf\(item\)[\s\S]*?function historyHtml\(item\)[\s\S]*?\n\}/);
  if (!paintSrc) return null;
  const ctx = { esc: esc, fmtTime: function () { return "just now"; } };
  try { vm.runInNewContext(paintSrc[0], ctx); } catch (e) { return { __err: String(e && e.message || e) }; }
  return ctx;
}
function swap(str, from, to) { return str.indexOf(from) < 0 ? null : str.split(from).join(to); }

const MUTANTS = [
  ["History / Explore / People drop the gone label", function () {
    const h = swap(history, " · not on this desk", " · left this desk");
    const p = swap(people, " · not on this desk", " · left this desk");
    if (!h || !p) return null;
    const hc = ctxFromHistory(h);
    const pc = ctxFromPeople(p);
    if (!hc || hc.__err || !pc || pc.__err) return ["could not re-paint: " + ((hc && hc.__err) || (pc && pc.__err) || "extract failed")];
    const faces = paintPair(goneJob, hc, pc);
    const bad = [];
    [["History", faces.history], ["Explore", faces.explore], ["People", faces.people]].forEach(function (pair) {
      historyPromptGonePaintFaults(pair[1], "Shop Bot").forEach(function (f) { bad.push(pair[0] + ": " + f); });
    });
    return bad;
  }],
  ["History / Explore drop the gone label", function () {
    const h = swap(history, " · not on this desk", " · left this desk");
    if (!h) return null;
    const hc = ctxFromHistory(h);
    if (!hc || hc.__err) return ["could not re-paint: " + ((hc && hc.__err) || "extract failed")];
    const faces = paintPair(goneJob, hc, pCtx);
    const bad = [];
    historyPromptGonePaintFaults(faces.history, "Shop Bot").forEach(function (f) { bad.push("History: " + f); });
    historyPromptGonePaintFaults(faces.explore, "Shop Bot").forEach(function (f) { bad.push("Explore: " + f); });
    return bad;
  }],
  ["People drop the gone label", function () {
    const p = swap(people, " · not on this desk", " · left this desk");
    if (!p) return null;
    const pc = ctxFromPeople(p);
    if (!pc || pc.__err) return ["could not re-paint: " + ((pc && pc.__err) || "extract failed")];
    const faces = paintPair(goneJob, hCtx, pc);
    return historyPromptGonePaintFaults(faces.people, "Shop Bot").map(function (f) { return "People: " + f; });
  }],
  ["History / People source loses goneHoldLabel", function () {
    const h = swap(history, "goneHoldLabel", "goneHoldOff");
    const p = swap(people, "goneHoldLabel", "goneHoldOff");
    return (h && p) ? historyPromptGoneSourceFaults(h, p) : null;
  }],
  ["History / People drop q-ai-gone", function () {
    const h = swap(history, "q-ai-gone", "q-ai-miss");
    const p = swap(people, "q-ai-gone", "q-ai-miss");
    if (!h || !p) return null;
    const hc = ctxFromHistory(h);
    const pc = ctxFromPeople(p);
    if (!hc || hc.__err || !pc || pc.__err) return ["could not re-paint: " + ((hc && hc.__err) || (pc && pc.__err) || "extract failed")];
    const faces = paintPair(goneJob, hc, pc);
    const bad = [];
    [["History", faces.history], ["Explore", faces.explore], ["People", faces.people]].forEach(function (pair) {
      historyPromptGonePaintFaults(pair[1], "Shop Bot").forEach(function (f) { bad.push(pair[0] + ": " + f); });
    });
    return bad;
  }],
  ["History promptHtml loses esc(label)", function () {
    const h = swap(history, "esc(label)", "label");
    if (!h) return null;
    const hc = ctxFromHistory(h);
    if (!hc || hc.__err || typeof hc.threadHtml !== "function") return ["could not re-paint: " + ((hc && hc.__err) || "extract failed")];
    const html = hc.threadHtml(xssJob);
    const bad = [];
    if (html.indexOf("Shop Bot <gone>") >= 0) bad.push("raw < in gone prompt name became markup");
    if (promptWho(html).indexOf("Shop Bot &lt;gone&gt;") < 0 && String(html).indexOf("Shop Bot <gone>") >= 0) {
      bad.push("gone prompt-who did not escape the bind");
    }
    return bad.length ? bad : (html.indexOf("Shop Bot <gone>") >= 0 ? bad : null);
  }],
  ["help.html drops History / Explore / People prompt ask-who honesty", function () {
    const n = swap(help, "History, Explore, and People open cards", "Those views open cards");
    if (!n) return null;
    const bad = [];
    if (n.indexOf("History, Explore, and People open cards") < 0 || n.indexOf("prompt ask-who") < 0) {
      bad.push("help#desk-cards no longer names History / Explore / People prompt ask-who HOLD");
    }
    return bad;
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
console.log("check-history-prompt-gone mutants: " + mutCaught + "/" + MUTANTS.length + " caught");
console.log("check-history-prompt-gone: ok");

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

["desk-needs.js"].forEach(function (name) {
  const syntax = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
  if (syntax.status !== 0) fail(name + " must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
  else pass(name + " parses");
});

const needs = read("desk-needs.js");
const help = read("help.html");
const more = read("more.html");
const moreTips = more + "\n" + read("aia-tip.js");
const yesNo = read("ACCOUNT-YES-NO.md");
const pkg = read("package.json");

// a2ad8c4 (#265) minified desk-needs.js. Names like goneHoldLabel / namedNeedsWho /
// namedAskWho / promptHtml / promptQuestion were shortened. window.card and
// window.promptHtml still paint a gone prompt face that names the bind and
// marks it not on this desk. Do not require the doubled "not on this desk"
// line or the "Gone bind HOLDs." picker jargon — those are parked for a later
// copy pass. Guard behaviour and exports, not minified names.
["not on this desk", "thenAiGone", "window.promptHtml", "q-prompt-who", "q-prompt-q", "q-need", "q-ai-gone"].forEach(function (bit) {
  if (needs.indexOf(bit) < 0) fail("desk-needs.js missing " + bit);
  else pass("desk-needs.js " + bit);
});
function promptGoneSourceFaults(src) {
  const bad = [];
  if (src.indexOf("not on this desk") < 0) bad.push("missing not on this desk");
  if (src.indexOf("thenAiGone") < 0) bad.push("missing thenAiGone");
  if (src.indexOf("window.promptHtml") < 0) bad.push("missing window.promptHtml");
  if (src.indexOf("q-prompt-who") < 0) bad.push("missing q-prompt-who");
  if (src.indexOf("q-prompt-q") < 0) bad.push("missing q-prompt-q");
  if (src.indexOf("q-need") < 0) bad.push("missing q-need");
  if (src.indexOf("q-ai-gone") < 0) bad.push("missing q-ai-gone");
  return bad;
}
(function () {
  const bad = promptGoneSourceFaults(needs);
  if (bad.length) fail("gone prompt HOLD must stay in desk-needs.js: " + bad.join("; "));
  else pass("gone prompt HOLD still lives in desk-needs.js");
})();
if (/oauth|spacex|login\.x\.ai|custodial wallet|Collect charge|silent send/i.test(needs)) {
  fail("prompt gone HOLD invented Grok OAuth / wallet / Collect charge");
} else pass("no OAuth / wallet / Collect charge");
if (help.indexOf("Needs you and the prompt reply") < 0 || help.indexOf("The desk AI asked") < 0) {
  fail("help#desk-cards must name gone Needs you / prompt HOLD");
} else pass("help names gone Needs you / prompt HOLD");
// a66b146 shortened more-queue. Gone-AI honesty stays as:
// "If a named desk AI is not on this desk, the card says so."
function moreQueuePromptFaults(src) {
  const bad = [];
  if (src.indexOf("If a named desk AI is not on this desk, the card says so.") < 0) {
    bad.push("missing gone-AI honesty");
  }
  return bad;
}
(function () {
  const bad = moreQueuePromptFaults(moreTips);
  if (bad.length) fail("more Queue tip must stay honest about gone Needs you / prompt: " + bad.join("; "));
  else pass("more Queue tip names gone-AI honesty");
})();
if (more.indexOf('data-aia-tip="more-queue"') < 0) fail("more.html must wire more-queue tip");
else pass("more.html wires more-queue tip");
if (yesNo.indexOf("check-prompt-gone.js") < 0) fail("ACCOUNT-YES-NO must record prompt gone HOLD");
else pass("ACCOUNT-YES-NO records prompt gone HOLD");
if (pkg.indexOf("check-prompt-gone.js") < 0) fail("package.json must run check-prompt-gone");
else pass("package.json runs check-prompt-gone");

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
    localStorage: { getItem: function () { return ""; }, setItem: function () {} }
  };
  ctx.window = ctx;
  vm.runInNewContext(needs, ctx);
  ctx.AIADeskAis = {
    rows: [{ name: "James’s AI", does: "Draft the lead packet", prompt: "Ask who it is for and when. Do not send." }],
    primary: function () { return this.rows[0]; }
  };
  return ctx;
}

const ctx = paintCtx();
if (typeof ctx.card !== "function") fail("desk-needs.js must set window.card");
else pass("card() is on window");
if (typeof ctx.promptHtml !== "function") fail("desk-needs.js must set window.promptHtml");
else pass("promptHtml is on window");
if (typeof ctx.capCardHtml !== "function") fail("desk-needs.js must set window.capCardHtml");
else pass("capCardHtml is on window");

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

// Behaviour only: the gone AI is named and marked not on this desk on a face
// surface (gone chip, Needs you chip, or prompt-who). Do not require the
// exact "Name · not on this desk" compound, do not require that line to be
// duplicated on the question, and do not require "Gone bind HOLDs."
function promptGonePaintFaults(html, name) {
  name = name || "Shop Bot";
  const bad = [];
  if (!html) { bad.push("no card html"); return bad; }
  if (html.indexOf("q-prompt") < 0) bad.push("missing prompt reply");
  if (html.indexOf("q-ai-gone") < 0) bad.push("missing q-ai-gone");
  const who = unesc(promptWho(html));
  const chip = unesc(needChip(html));
  const gone = unesc(goneChip(html));
  const faces = [who, chip, gone];
  const named = faces.some(function (t) { return t.indexOf(name) >= 0; });
  const marked = faces.some(function (t) { return t.indexOf("not on this desk") >= 0; });
  if (!named) bad.push("gone AI not named on the face");
  if (!marked) bad.push("missing not on this desk mark");
  if (who === "Needs you") bad.push("prompt-who stayed anonymous");
  if (chip === "Needs you") bad.push("Needs you chip stayed anonymous");
  if (/James/.test(who) || /James/.test(chip)) bad.push("stamped James");
  return bad;
}

const goneCard = ctx.card({
  id: "j-gone-prompt",
  status: "waiting",
  title: "Oak dresser",
  waitingOn: "person",
  thenAiGone: { id: "shop-bot", name: "Shop Bot" }
}, false);
(function () {
  const bad = promptGonePaintFaults(goneCard, "Shop Bot");
  if (bad.length) fail("gone prompt card must name the gone AI and mark not on this desk: " + bad.join("; "));
  else pass("gone prompt card names Shop Bot and marks not on this desk");
})();
if (promptQ(goneCard).indexOf("The desk AI asked") >= 0) fail("gone prompt must not say The desk AI asked");
else pass("gone prompt does not say The desk AI asked");
if (goneCard.indexOf(">Yes<") < 0 || goneCard.indexOf(">Kill<") < 0) fail("Yes / Stop / Kill must stay");
else pass("Yes / Stop / Kill stay");
if (goneCard.indexOf("q-reply") < 0 && goneCard.indexOf("Reply on this card") < 0) fail("gone prompt must keep a draft Reply");
else pass("gone prompt keeps draft Reply");
if (goneCard.indexOf("Nothing sent alone") < 0) fail("gone prompt must stay draft-only");
else pass("gone prompt stays draft-only");

const goneAsk = ctx.card({
  id: "j-gone-ask-thread",
  status: "waiting",
  title: "Oak dresser",
  waitingOn: "person",
  thenAiGone: { id: "shop-bot", name: "Shop Bot" },
  thread: [{ kind: "ask", text: "Who is the dresser for?" }]
}, false);
(function () {
  const bad = promptGonePaintFaults(goneAsk, "Shop Bot");
  if (bad.length) fail("gone ask thread must name the gone AI and mark not on this desk: " + bad.join("; "));
  else pass("gone ask thread names Shop Bot and marks not on this desk");
})();
if (goneAsk.indexOf("Desk AI") >= 0) fail("gone ask thread must not fall back to Desk AI");
else pass("gone ask thread does not say Desk AI");
if (promptQ(goneAsk).indexOf("Who is the dresser for?") < 0) fail("gone ask-thread question must keep the ask, got " + promptQ(goneAsk));
else pass("gone ask-thread question holds the ask");

const xss = ctx.card({
  id: "j-gone-xss",
  status: "waiting",
  title: "Need 2 < 3",
  waitingOn: "person",
  thenAiGone: { id: "shop-bot", name: "Shop Bot <gone>" }
}, false);
if (xss.indexOf("Shop Bot <gone>") >= 0) fail("raw < in gone prompt name must not become markup");
else if (xss.indexOf("Shop Bot &lt;gone&gt;") < 0) fail("gone prompt name must stay text");
else pass("gone prompt name stays text");
(function () {
  const bad = promptGonePaintFaults(xss, "Shop Bot <gone>");
  if (bad.length) fail("gone xss prompt must name the escaped bind and mark not on this desk: " + bad.join("; "));
  else pass("gone xss prompt names the escaped bind and marks not on this desk");
})();
if (xss.indexOf("Need 2 &lt; 3") < 0) fail("gone title must stay text");
else pass("gone title stays text");

const live = ctx.card({
  id: "j-live",
  status: "waiting",
  title: "Oak dresser",
  waitingOn: "person",
  deskAi: { name: "Shop Bot", does: "Qualify the click" }
}, false);
if (promptWho(live).indexOf("Shop Bot asks") < 0) fail("live prompt must still say Shop Bot asks, got " + promptWho(live));
else pass("live prompt still names Shop Bot");
if (promptQ(live).indexOf("Shop Bot asked on this card") < 0) fail("live prompt question must still name Shop Bot, got " + promptQ(live));
else pass("live prompt question still names Shop Bot");
if (needChip(live).indexOf("Shop Bot · Needs you") < 0) fail("live Needs you chip must still name Shop Bot, got " + needChip(live));
else pass("live Needs you chip still names Shop Bot");
if (live.indexOf("not on this desk") >= 0) fail("live bind must not paint gone HOLD");
else pass("live bind has no gone HOLD");
if (/James/.test(promptWho(live) + needChip(live) + promptQ(live))) fail("live Shop Bot must not first-eligible James");
else pass("live prompt / Needs you do not name James");

const unbound = ctx.card({
  id: "j-any",
  status: "waiting",
  title: "Oak dresser",
  waitingOn: "info",
  why: "Need a number before this can go."
}, false);
if (needChip(unbound) !== "Needs you") fail("unbound Needs you chip must stay Needs you, got " + needChip(unbound));
else pass("unbound Needs you chip stays Needs you");
if (unbound.indexOf("Ask the human") < 0) fail("unbound missing-info must still say Ask the human");
else pass("unbound missing-info still says Ask the human");
if (unbound.indexOf("not on this desk") >= 0) fail("unbound card must not paint gone HOLD");
else pass("unbound card has no gone HOLD");

const goneHuman = ctx.card({
  id: "j-gone-human",
  status: "waiting",
  title: "Missed call",
  kind: "call",
  outcome: "call",
  waitingOn: "info",
  why: "Need a number before this can go.",
  thenAiGone: { id: "shop-bot", name: "Shop Bot" }
}, false);
if (goneHuman.indexOf("Ask the human") < 0) fail("gone missing-info must still say Ask the human");
else pass("gone missing-info still says Ask the human");
(function () {
  const who = unesc(needChip(goneHuman));
  const gone = unesc(goneChip(goneHuman));
  const named = who.indexOf("Shop Bot") >= 0 || gone.indexOf("Shop Bot") >= 0;
  const marked = who.indexOf("not on this desk") >= 0 || gone.indexOf("not on this desk") >= 0;
  if (!named || !marked) fail("gone missing-info must name Shop Bot and mark not on this desk, got chip=" + needChip(goneHuman));
  else pass("gone missing-info names Shop Bot and marks not on this desk");
})();

const capHtml = ctx.capCardHtml({
  id: "j-gone-cap",
  status: "waiting",
  title: "Need 2 < 3",
  waitingOn: "person",
  thenAiGone: { id: "shop-bot", name: "Shop Bot <gone>" }
}, "shop");
(function () {
  const bad = promptGonePaintFaults(capHtml, "Shop Bot <gone>");
  if (bad.length) fail("Cap must name the gone AI and mark not on this desk: " + bad.join("; "));
  else if (capHtml.indexOf("Shop Bot <gone>") >= 0) fail("Cap must escape the gone name");
  else if (capHtml.indexOf("Shop Bot &lt;gone&gt;") < 0) fail("Cap must keep the gone name as text");
  else if (/>Yes</.test(capHtml)) fail("Cap gone-prompt card must not show Yes");
  else if (capHtml.indexOf("q-reply") < 0 && capHtml.indexOf(">Reply<") < 0) fail("Cap must keep Reply");
  else pass("Cap paints gone prompt, keeps Reply, and does not Yes");
})();
const capOther = ctx.capCardHtml({
  id: "j-gone-cap-other",
  status: "waiting",
  title: "Need 2 < 3",
  waitingOn: "person",
  slug: "other-desk",
  desk: "Other desk",
  thenAiGone: { id: "shop-bot", name: "Shop Bot <gone>" }
}, "shop");
(function () {
  const bad = promptGonePaintFaults(capOther, "Shop Bot <gone>");
  if (bad.length) fail("other-desk Cap must still name the gone AI: " + bad.join("; "));
  else if (capOther.indexOf("q-reply-box") >= 0) fail("other-desk Cap must stay read-only");
  else if (/>Yes</.test(capOther)) fail("other-desk Cap must not show Yes");
  else pass("other-desk Cap still names the gone AI and stays read-only");
})();

function paintFrom(src, job) {
  if (!src) return null;
  const run = {
    window: {},
    document: {
      readyState: "complete",
      addEventListener: function () {},
      getElementById: function () { return null; },
      createElement: function () { return { id: "", textContent: "" }; },
      head: { appendChild: function () {} }
    },
    setTimeout: function () {},
    localStorage: { getItem: function () { return ""; }, setItem: function () {} }
  };
  run.window = run;
  try { vm.runInNewContext(src, run); } catch (e) { return "threw " + e.message; }
  if (typeof run.card !== "function") return "no window.card";
  run.AIADeskAis = {
    owner: true,
    rows: [
      { id: "james-s-ai", name: "James’s AI", does: "Draft the lead packet" },
      { id: "lane-bot", name: "Lane Bot", does: "Watch the lane" }
    ],
    primary: function () { return this.rows[0]; }
  };
  return run.card(job || {
    id: "j-mut",
    status: "waiting",
    title: "Oak dresser",
    waitingOn: "person",
    thenAiGone: { id: "shop-bot", name: "Shop Bot" }
  }, false);
}

function swap(str, from, to) { return str.indexOf(from) < 0 ? null : str.split(from).join(to); }

const MUTANTS = [
  ["prompt source loses not on this desk", function () {
    const n = swap(needs, "not on this desk", "left this desk");
    return n && promptGoneSourceFaults(n);
  }],
  ["prompt source loses thenAiGone", function () {
    const n = swap(needs, "thenAiGone", "thenAiLeft");
    return n && promptGoneSourceFaults(n);
  }],
  ["prompt source loses window.promptHtml", function () {
    const n = swap(needs, "window.promptHtml", "window.promptOff");
    return n && promptGoneSourceFaults(n);
  }],
  ["prompt source loses q-prompt-who", function () {
    const n = swap(needs, "q-prompt-who", "q-prompt-off");
    return n && promptGoneSourceFaults(n);
  }],
  ["more-queue tip drops gone-AI honesty", function () {
    const n = swap(moreTips, "If a named desk AI is not on this desk, the card says so.", "The queue just runs.");
    return n && moreQueuePromptFaults(n);
  }],
  ["queue card drops the gone label", function () {
    const n = swap(needs, " · not on this desk", " · left this desk");
    const html = paintFrom(n);
    if (html == null) return null;
    if (typeof html !== "string") return [String(html)];
    return promptGonePaintFaults(html, "Shop Bot");
  }],
  ["queue card drops q-ai-gone", function () {
    const n = swap(needs, "q-ai-gone", "q-ai-miss");
    const html = paintFrom(n);
    if (html == null) return null;
    if (typeof html !== "string") return [String(html)];
    return promptGonePaintFaults(html, "Shop Bot");
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
console.log("check-prompt-gone mutants: " + mutCaught + "/" + MUTANTS.length + " caught");
console.log("check-prompt-gone: ok");

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

["desk-needs.js"].forEach(function (name) {
  const syntax = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
  if (syntax.status !== 0) fail(name + " must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
  else pass(name + " parses");
});

const needs = read("desk-needs.js");
const help = read("help.html");
const more = read("more.html");
const yesNo = read("ACCOUNT-YES-NO.md");
const pkg = read("package.json");

["function goneHoldLabel", "function namedNeedsWho", "function namedAskWho", "function promptHtml", "function promptQuestion", "not on this desk"].forEach(function (bit) {
  if (needs.indexOf(bit) < 0) fail("desk-needs.js missing " + bit);
  else pass("desk-needs.js " + bit);
});
const namedSrc = needs.slice(needs.indexOf("function namedNeedsWho"), needs.indexOf("function thenDoes"));
if (/primaryAi\(/.test(namedSrc)) fail("namedNeedsWho must not first-eligible to primaryAi()");
else pass("namedNeedsWho does not first-eligible to primaryAi");
if (!/thenGone|goneHoldLabel/.test(namedSrc)) fail("namedNeedsWho must name the gone bind");
else pass("namedNeedsWho names the gone bind");
const promptSrc = needs.slice(needs.indexOf("function promptHtml"), needs.indexOf("function honestNext"));
if (promptSrc.indexOf("namedNeedsWho") < 0) fail("promptHtml must use namedNeedsWho");
else pass("promptHtml uses namedNeedsWho");
if (promptSrc.indexOf("esc(label)") < 0) fail("promptHtml must escape ask-who");
else pass("promptHtml escapes ask-who");
const qSrc = needs.slice(needs.indexOf("function promptQuestion"), needs.indexOf("function lastReply"));
if (!/thenGone|goneHoldLabel/.test(qSrc)) fail("promptQuestion must name the gone bind");
else pass("promptQuestion names the gone bind");
const chipSrc = needs.slice(needs.indexOf("function chipsHtml"), needs.indexOf("function smsOf"));
if (chipSrc.indexOf("namedNeedsWho") < 0) fail("chipsHtml Needs you must use namedNeedsWho");
else pass("chipsHtml Needs you uses namedNeedsWho");
if (chipSrc.indexOf("esc(needWho)") < 0) fail("Needs you chip must escape the gone bind");
else pass("Needs you chip escapes");
const talkSrc = needs.slice(needs.indexOf("function talkLabel"), needs.indexOf("function talkHtml"));
if (talkSrc.indexOf("goneHoldLabel") < 0) fail("talkLabel must share goneHoldLabel");
else pass("talkLabel shares goneHoldLabel");
if (/oauth|spacex|login\.x\.ai|custodial wallet|Collect charge|silent send/i.test(needs)) {
  fail("prompt gone HOLD invented Grok OAuth / wallet / Collect charge");
} else pass("no OAuth / wallet / Collect charge");
if (help.indexOf("Needs you and the prompt reply") < 0 || help.indexOf("The desk AI asked") < 0) {
  fail("help#desk-cards must name gone Needs you / prompt HOLD");
} else pass("help names gone Needs you / prompt HOLD");
if (more.indexOf("Needs you / prompt ask-who") < 0 || more.indexOf("not anonymous desk AI") < 0) {
  fail("more.html Queue must name gone Needs you / prompt HOLD");
} else pass("more.html names gone Needs you / prompt HOLD");
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

const goneCard = ctx.card({
  id: "j-gone-prompt",
  status: "waiting",
  title: "Oak dresser",
  waitingOn: "person",
  thenAiGone: { id: "shop-bot", name: "Shop Bot" }
}, false);
if (goneCard.indexOf("q-prompt") < 0) fail("gone Needs you card must still show prompt reply");
else pass("gone card shows prompt reply");
if (promptWho(goneCard).indexOf("Shop Bot · not on this desk") < 0) {
  fail("gone prompt ask-who must hold Shop Bot · not on this desk, got " + promptWho(goneCard));
} else pass("gone prompt ask-who holds Shop Bot");
if (promptWho(goneCard) === "Needs you") fail("gone prompt ask-who must not stay Needs you");
else pass("gone prompt ask-who is not anonymous Needs you");
if (promptQ(goneCard).indexOf("The desk AI asked") >= 0) fail("gone prompt must not say The desk AI asked");
else pass("gone prompt does not say The desk AI asked");
if (promptQ(goneCard).indexOf("Shop Bot · not on this desk") < 0) {
  fail("gone prompt question must name Shop Bot · not on this desk, got " + promptQ(goneCard));
} else pass("gone prompt question holds Shop Bot");
if (needChip(goneCard).indexOf("Shop Bot · not on this desk") < 0) {
  fail("gone Needs you chip must hold Shop Bot · not on this desk, got " + needChip(goneCard));
} else pass("gone Needs you chip holds Shop Bot");
if (needChip(goneCard) === "Needs you") fail("gone Needs you chip must not stay anonymous");
else pass("gone Needs you chip is not anonymous");
if (/James/.test(goneCard) && (promptWho(goneCard).indexOf("James") >= 0 || needChip(goneCard).indexOf("James") >= 0)) {
  fail("gone prompt / Needs you must not first-eligible to James");
} else pass("gone prompt / Needs you do not name James");
if (goneCard.indexOf(">Yes<") < 0 || goneCard.indexOf(">Kill<") < 0) fail("Yes / Stop / Kill must stay");
else pass("Yes / Stop / Kill stay");

const goneAsk = ctx.card({
  id: "j-gone-ask-thread",
  status: "waiting",
  title: "Oak dresser",
  waitingOn: "person",
  thenAiGone: { id: "shop-bot", name: "Shop Bot" },
  thread: [{ kind: "ask", text: "Who is the dresser for?" }]
}, false);
if (goneAsk.indexOf("Shop Bot · not on this desk") < 0) fail("gone ask thread must still hold Shop Bot");
else pass("gone ask thread holds Shop Bot");
if (goneAsk.indexOf("Desk AI") >= 0) fail("gone ask thread must not fall back to Desk AI");
else pass("gone ask thread does not say Desk AI");
if (promptWho(goneAsk) === "Needs you") fail("gone ask-thread prompt-who must not stay Needs you");
else pass("gone ask-thread prompt-who holds the bind");

const xss = ctx.card({
  id: "j-gone-xss",
  status: "waiting",
  title: "Need 2 < 3",
  waitingOn: "person",
  thenAiGone: { id: "shop-bot", name: "Shop Bot <gone>" }
}, false);
if (xss.indexOf("Shop Bot <gone>") >= 0) fail("raw < in gone prompt name must not become markup");
else if (xss.indexOf("Shop Bot &lt;gone&gt; · not on this desk") < 0) fail("gone prompt name must stay text");
else pass("gone prompt name stays text");
if (promptWho(xss).indexOf("Shop Bot &lt;gone&gt; · not on this desk") < 0) {
  fail("gone prompt-who must escape the bind, got " + promptWho(xss));
} else pass("gone prompt-who stays text");
if (needChip(xss).indexOf("Shop Bot &lt;gone&gt; · not on this desk") < 0) {
  fail("gone Needs you chip must escape the bind, got " + needChip(xss));
} else pass("gone Needs you chip stays text");
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
if (needChip(goneHuman).indexOf("Shop Bot · not on this desk") < 0) {
  fail("gone missing-info Needs you chip must hold Shop Bot, got " + needChip(goneHuman));
} else pass("gone missing-info Needs you chip holds Shop Bot");

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("check-prompt-gone: ok");

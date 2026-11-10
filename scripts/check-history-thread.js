#!/usr/bin/env node
"use strict";
require("./_env-guard");

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const vm = require("vm");

const root = path.join(__dirname, "..");

function fail(msg) {
  console.error("check-history-thread: " + msg);
  process.exit(1);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

["desk-needs.js", "desk-card.js", "people.js"].forEach(function (name) {
  const syntax = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
  if (syntax.status !== 0) fail(name + " must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
});

const history = read("history.html");
const needs = read("desk-needs.js");
const card = read("desk-card.js");
const people = read("people.js");
const help = read("help.html");
const more = read("more.html");
const moreTips = more + "\n" + read("aia-tip.js");
const yesNo = read("ACCOUNT-YES-NO.md");
const histSrc = read("api/_history.js");

["function thenHtml", "function thenGone", "function thenLabel", "function thenTagHtml", "function deskAiLine", "function wipTalkLabel", "function talkLabel", "function talkHtml", "function threadHtml", "function promptHtml", "function namedNeedsWho", "function goneHoldLabel", "function chipsHtml", "h-thread", "h-talk", "h-turn-ai", "h-turn-you", "Then draft", "pipe WIP", "not on this desk", "Nothing sent alone", "sheet-thread"].forEach(function (bit) {
  if (history.indexOf(bit) < 0) fail("history.html missing " + bit);
});
if (!/HOLD|Nothing sent alone/.test(history)) fail("History must stay HOLD / nothing sent");
if (/oauth|spacex|login\.x\.ai|custodial wallet|Collect charge|silent send/i.test(history + needs + card)) {
  fail("History thread invented Grok OAuth / wallet / Collect charge");
}
if (history.indexOf("esc(row.text)") < 0 || history.indexOf("esc(text)") < 0 || history.indexOf("esc(talkLabel(row,it))") < 0) {
  fail("History Then draft / thread must stay escaped");
}
if (/who\|\|row\.from\|\|"Desk AI"/.test(history.replace(/\s+/g, ""))) {
  fail("History talkHtml must not fall back to Desk AI when the Then AI is gone");
}

// a2ad8c4 (#265) minified desk-needs.js. Cap still paints talk into q-thread via
// window.capCardHtml / window.card; names like talkHtml(j) were shortened.
function capTalkSourceFaults(src) {
  const bad = [];
  if (src.indexOf("q-thread") < 0) bad.push("missing q-thread");
  if (src.indexOf("q-talk") < 0 || src.indexOf("q-turn-ai") < 0 || src.indexOf("q-turn-you") < 0) {
    bad.push("missing talk turns");
  }
  if (src.indexOf("window.capCardHtml") < 0 || src.indexOf("window.card=") < 0) {
    bad.push("missing capCardHtml / card");
  }
  return bad;
}
(function () {
  const bad = capTalkSourceFaults(needs);
  if (bad.length) fail("Cap cards must paint talkHtml / q-thread: " + bad.join("; "));
})();
function capPromptSourceFaults(src) {
  const bad = [];
  if (src.indexOf("window.capCardHtml") < 0) bad.push("missing capCardHtml");
  if (src.indexOf("window.promptHtml") < 0) bad.push("missing promptHtml");
  if (src.indexOf("q-prompt") < 0) bad.push("missing q-prompt");
  return bad;
}
(function () {
  const bad = capPromptSourceFaults(needs);
  if (bad.length) fail("Cap cards must paint promptHtml via capCardHtml: " + bad.join("; "));
})();
if (card.indexOf("function sheetPromptHtml") < 0 || card.indexOf("sheetPromptHtml(j)") < 0) {
  fail("Open-job must paint sheetPromptHtml");
}
// Minified talkLabel still returns gone HOLD ("not on this desk") before any
// from||"Desk AI" fallback. The old who || row.from || "Desk AI" form stays forbidden.
function capGoneTalkFaults(src) {
  const bad = [];
  if (/who \|\| row\.from \|\| "Desk AI"/.test(src)) bad.push("old who||from||Desk AI fallback");
  if (src.indexOf("not on this desk") < 0) bad.push("missing gone HOLD");
  // talkLabel calls goneHoldLabel, returns that name, then may fall back to from||"Desk AI".
  const behind = /if\(\w+\)return \w+;\s*const \w+=\w+\.from\s*\|\|\s*"Desk AI"/.test(src);
  const fallback = /from\s*\|\|\s*"Desk AI"/.test(src);
  if (fallback && !behind) bad.push("Desk AI fallback is not behind gone HOLD");
  return bad;
}
(function () {
  const bad = capGoneTalkFaults(needs);
  if (bad.length) fail("Cap talkHtml must not fall back to Desk AI when the Then AI is gone: " + bad.join("; "));
})();
["function threadSheetHtml", "function talkTurnsOf", "function talkLabelOf", "Then draft", "q-thread", "Nothing sent alone"].forEach(function (bit) {
  if (card.indexOf(bit) < 0) fail("desk-card.js missing " + bit);
});
if (/who \|\| row\.from \|\| "Desk AI"/.test(card)) {
  fail("Open talkHtml must not fall back to Desk AI when the Then AI is gone");
}
if (people.indexOf("Then draft") < 0 || people.indexOf("item.thread") < 0) {
  fail("People shared history must show Then draft / thread");
}
if (people.indexOf("function talkLabelOf") < 0 || /who \|\| row\.from \|\| "Desk AI"/.test(people)) {
  fail("People talkHtml must not fall back to Desk AI when the Then AI is gone");
}
if (help.indexOf("History, Explore, Cap, and Open") < 0) fail("help#desk-cards must name History / Explore / Cap / Open thread");
if (help.indexOf("not on this desk") < 0) fail("help#desk-cards must name gone HOLD on History");
if (help.indexOf("History shows the Then draft") < 0) fail("help#ideas-queue must name History Then draft");
// a66b146 "More: simpler and still useful" replaced "AI ↔ human thread" with
// plain "back-and-forth on the card". The tip still names the talk thread.
function historyTipThreadFaults(tips) {
  const bad = [];
  if (tips.indexOf('"more-history"') < 0) bad.push("missing more-history tip");
  if (tips.indexOf("back-and-forth on the card") < 0) bad.push("tip no longer names the back-and-forth on the card");
  return bad;
}
(function () {
  const bad = historyTipThreadFaults(moreTips);
  if (bad.length) fail("more History tip must name the thread: " + bad.join("; "));
})();
if (moreTips.indexOf("not on this desk") < 0) fail("more History tip must name gone HOLD");
if (more.indexOf('data-aia-tip="more-history"') < 0) fail("more.html must wire more-history tip");
if (history.indexOf("not on this desk") < 0) {
  fail("History must say when a named desk AI is not on this desk");
}
if (history.indexOf("Needs you") < 0) fail("History must keep Needs you");
if (history.indexOf("promptHtml(it)") < 0 || history.indexOf("chipsHtml(it)") < 0) {
  fail("History threadHtml must insert promptHtml / chipsHtml");
}
if (history.indexOf("function storyOf") < 0 || history.indexOf("storyOf(row)") < 0) {
  fail("History Copy story must copy storyOf");
}
if (yesNo.indexOf("check-history-thread.js") < 0) fail("ACCOUNT-YES-NO must record History thread");
if (yesNo.indexOf("not on this desk") < 0) fail("ACCOUNT-YES-NO must record History gone HOLD");

["function talkTurns", "function deskAiOf", "thread: thread", "thenWho", "k !== \"note\" && k !== \"follow\""].forEach(function (bit) {
  if (histSrc.indexOf(bit) < 0) fail("api/_history.js missing " + bit);
});
if (history.indexOf('k==="tell"') < 0) fail("History talkRows must keep tell");
function capWipLabelFaults(src) {
  const bad = [];
  if (src.indexOf("pipe WIP") < 0) bad.push("missing pipe WIP");
  if (src.indexOf(" · follow") < 0) bad.push("missing follow label");
  if (src.indexOf(" · note") < 0) bad.push("missing note label");
  if (src.indexOf(" · tell") < 0) bad.push("missing tell label");
  return bad;
}
(function () {
  const bad = capWipLabelFaults(needs);
  if (bad.length) fail("Cap talkHtml must label pipe WIP / note / follow: " + bad.join("; "));
})();
if (card.indexOf("function wipTalkLabelOf") < 0 || card.indexOf("pipe WIP") < 0) {
  fail("Open talkHtml must label pipe WIP / note / follow");
}

const hist = require(path.join(root, "api/_history"));
if (typeof hist.historyItem !== "function" || typeof hist.talkTurns !== "function" || typeof hist.capCard !== "function") {
  fail("_history must export historyItem / talkTurns / capCard");
}

const job = {
  id: "j-hist",
  status: "waiting",
  title: "They clicked",
  workspace: "shop",
  draft: "Ask who it is for and when. Do not send.",
  deskAi: { id: "james-s-ai", name: "James’s AI", does: "Draft the lead packet", prompt: "Ask who it is for." },
  thread: [
    { kind: "ask", from: "James’s AI", text: "Who is this for?", at: "2026-09-06T12:00:00Z" },
    { kind: "reply", from: "Pat", text: "Sam at the shop", at: "2026-09-06T12:01:00Z" },
    { kind: "note", from: "desk", text: "Dropped by neighbor.", at: "2026-09-06T11:59:00Z" },
    { kind: "note", from: "pipe", text: "Pipe update.", at: "2026-09-06T12:03:00Z" },
    { kind: "follow", from: "webhook", text: "Pipe confirmed done.", at: "2026-09-06T12:04:00Z" },
    { kind: "tell", from: "drop", text: "Not shipped. Qualify first.", at: "2026-09-06T11:58:00Z" }
  ],
  replies: [{ from: "Pat", text: "Sam at the shop" }],
  why: "James’s AI drafted on the card. Human send HOLD.",
  next: "Reply is on the card. Nothing sent alone.",
  waitingOn: "person",
  createdAt: "2026-09-06T12:02:00Z"
};

const item = hist.historyItem(job, { slug: "shop", biz: "Shop" });
if (!item || !item.draft || item.draft.indexOf("Ask who it is for") < 0) fail("historyItem must keep Then draft");
if (!item.decide) fail("waiting drafted card must expose decide");
if (item.via !== "drop") fail("tell from drop must label via drop");
if (item.who === "desk" || item.who === "drop" || item.who === "create") fail("historyItem who must not be Create/Drop jargon");
if (!item.deskAi || item.deskAi.name !== "James’s AI") fail("historyItem must name the desk AI");
if (!item.thenWho || item.thenWho !== "James’s AI") fail("historyItem must expose thenWho");
if (!item.thread || item.thread.length < 2) fail("historyItem must expose the AI ↔ human thread");
if (!item.thread.some(function (t) { return t.kind === "ask" && t.text.indexOf("Who is this for") >= 0; })) {
  fail("historyItem thread must keep the AI ask");
}
if (!item.thread.some(function (t) { return t.kind === "reply" && t.text.indexOf("Sam at the shop") >= 0; })) {
  fail("historyItem thread must keep the human reply");
}
if (!item.thread.some(function (t) { return t.kind === "note" && t.text.indexOf("Dropped by neighbor") >= 0; })) {
  fail("historyItem thread must keep desk notes");
}
if (!item.thread.some(function (t) { return t.kind === "note" && t.from === "pipe" && t.text.indexOf("Pipe update") >= 0; })) {
  fail("historyItem thread must keep pipe WIP notes");
}
if (!item.thread.some(function (t) { return t.kind === "follow" && t.text.indexOf("Pipe confirmed done") >= 0; })) {
  fail("historyItem thread must keep follow rows");
}
if (!item.thread.some(function (t) { return t.kind === "tell" && t.text.indexOf("Qualify first") >= 0; })) {
  fail("historyItem thread must keep Tell AIA rows");
}
if (!item.replies || !item.replies.some(function (r) { return /Sam at the shop/.test(r.text || ""); })) {
  fail("historyItem must keep replies");
}

const cap = hist.capCard(Object.assign({ priority: true, cap: true }, job), { slug: "shop", biz: "Shop" });
if (!cap || !cap.draft || !cap.deskAi || !cap.thread || cap.thread.length < 2) {
  fail("capCard must carry Then draft + named AI + thread");
}

const found = hist.filterHistory([item], { q: "Sam at the shop" });
if (!found.length) fail("History search must find a human reply");
const foundAi = hist.filterHistory([item], { q: "James’s AI" });
if (!foundAi.length) fail("History search must find the named desk AI");
const foundWip = hist.filterHistory([item], { q: "Pipe update" });
if (!foundWip.length) fail("History search must find pipe WIP");
const foundFollow = hist.filterHistory([item], { q: "Pipe confirmed done" });
if (!foundFollow.length) fail("History search must find follow");
const foundTell = hist.filterHistory([item], { q: "Qualify first" });
if (!foundTell.length) fail("History search must find Tell AIA");
const miss = hist.filterHistory([item], { q: "not-on-this-card" });
if (miss.length) fail("History search must not invent a miss");

const xssJob = {
  id: "j-xss",
  status: "waiting",
  title: "Need 2 < 3",
  draft: "Don't use <b>html</b>",
  deskAi: { name: "AI <bot>", does: "Draft <leads>", prompt: "Never use <script>" },
  thread: [
    { kind: "ask", from: "AI <bot>", text: "Need <phone>?" },
    { kind: "reply", from: "Sam <helper>", text: "Use <script> no" },
    { kind: "note", from: "pipe", text: "WIP <script>x" },
    { kind: "tell", from: "drop", text: "Tell <script>no" }
  ],
  replies: [{ from: "Sam <helper>", text: "Use <script> no" }]
};
const xssItem = hist.historyItem(xssJob, { slug: "shop", biz: "Shop" });
if (!xssItem || xssItem.deskAi.name !== "AI <bot>") fail("historyItem must keep raw names as data");
if (xssItem.thread.some(function (t) { return /<script>/.test(t.text) === false && t.kind === "reply"; })) {
  /* data stays raw; UI must esc */
}

const paintSrc = history.match(/function thenWho\(it\)[\s\S]*?function story\(\)\{[\s\S]*?\n\}/);
if (!paintSrc) fail("could not extract History thread paint");
const ctx = {
  last: [],
  window: {},
  document: { getElementById: function () { return null; } },
  esc: function (s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
    });
  }
};
vm.runInNewContext(paintSrc[0], ctx);
if (typeof ctx.threadHtml !== "function") fail("History threadHtml must run");
const painted = ctx.threadHtml(xssItem);
if (painted.indexOf("h-thread") < 0) fail("History must wrap Then + thread in h-thread");
if (painted.indexOf("Then draft") < 0) fail("History must label Then draft");
if (painted.indexOf("Need <phone>?") >= 0) fail("raw < in the ask must not become markup");
if (painted.indexOf("Need &lt;phone&gt;?") < 0) fail("ask must stay text");
if (painted.indexOf("Sam &lt;helper&gt;") < 0) fail("reply from must stay text");
if (painted.indexOf("Use &lt;script&gt; no") < 0) fail("reply text must stay text");
if (painted.indexOf("WIP <script>x") >= 0) fail("raw < in pipe WIP must not become markup");
if (painted.indexOf("WIP &lt;script&gt;x") < 0) fail("pipe WIP must stay text");
if (painted.indexOf("Tell <script>no") >= 0) fail("raw < in Tell AIA must not become markup");
if (painted.indexOf("Tell &lt;script&gt;no") < 0) fail("Tell AIA must stay text");
if (painted.indexOf("AI <bot>") >= 0) fail("raw < in the AI name must not become markup");
if (painted.indexOf("Don't use <b>html</b>") >= 0) fail("raw draft markup must not land");
if (painted.indexOf("Don&#39;t use &lt;b&gt;html&lt;/b&gt;") < 0 && painted.indexOf("Don&#39;t use") < 0) {
  fail("Then draft must stay text");
}
if (painted.indexOf("Nothing sent alone") < 0) fail("History thread must stay nothing sent alone");

const stacked = ctx.threadHtml(item);
if (stacked.indexOf("Who is this for?") < 0) fail("History must show the AI ask");
if (stacked.indexOf("Sam at the shop") < 0) fail("History must show the human reply");
if (stacked.indexOf("Dropped by neighbor") < 0) fail("History must show the desk note");
if (stacked.indexOf("desk · note") < 0) fail("History must label a desk note as note");
if (stacked.indexOf("Pipe update.") < 0) fail("History must show pipe WIP");
if (stacked.indexOf("pipe · pipe WIP") < 0) fail("History must label pipe notes as pipe WIP");
if (stacked.indexOf("Pipe confirmed done.") < 0) fail("History must show follow");
if (stacked.indexOf("webhook · follow") < 0) fail("History must label follow");
if (stacked.indexOf("Not shipped. Qualify first.") < 0) fail("History must show Tell AIA");
if (stacked.indexOf("drop · tell") < 0) fail("History must label Tell AIA as tell");
if (stacked.indexOf("h-turn-you") < 0 || stacked.indexOf("h-turn-ai") < 0) fail("History must mark AI and human turns");
if (stacked.indexOf("James’s AI · Then draft") < 0 && stacked.indexOf("James") < 0) {
  fail("History must name the Then draft");
}
if (typeof ctx.story !== "function") fail("History must expose story");
ctx.last = [item];
if (ctx.story().indexOf("Qualify first") < 0) fail("History Copy story must copy Tell AIA");
ctx.last = [];

const goneJob = {
  id: "j-gone",
  status: "waiting",
  title: "Need 2 < 3",
  draft: "Don't use <b>html</b>",
  thenAiGone: { id: "shop-bot", name: "Shop Bot <gone>" },
  thread: [
    { kind: "ask", from: "Shop Bot <gone>", text: "Need <phone>?" },
    { kind: "reply", from: "Pat", text: "Use <script> no" }
  ],
  replies: [{ from: "Pat", text: "Use <script> no" }],
  next: "Shop Bot <gone> is not on this desk. Draft HOLD.",
  why: "Shop Bot is not on this desk. Nothing sent alone."
};
const goneItem = hist.historyItem(goneJob, { slug: "shop", biz: "Shop" });
if (!goneItem || !goneItem.thenAiGone || goneItem.thenAiGone.name !== "Shop Bot <gone>") {
  fail("historyItem must keep thenAiGone as data");
}
if (goneItem.deskAi) fail("gone historyItem must not invent a live desk AI");
if (goneItem.thenWho) fail("gone historyItem must not invent thenWho");

const gonePaint = ctx.threadHtml(goneItem);
if (gonePaint.indexOf("James") >= 0) fail("gone History must not name James");
if (gonePaint.indexOf("not on this desk") < 0) fail("gone History thenHtml must say not on this desk");
if (gonePaint.indexOf("Shop Bot <gone>") >= 0) fail("raw < in gone AI name must not become markup");
if (gonePaint.indexOf("Shop Bot &lt;gone&gt;") < 0) fail("gone AI name must stay text");
if (gonePaint.indexOf("Don't use <b>html</b>") >= 0) fail("raw gone draft markup must not land");
if (gonePaint.indexOf("Don&#39;t use &lt;b&gt;html&lt;/b&gt;") < 0 && gonePaint.indexOf("&lt;b&gt;html&lt;/b&gt;") < 0) {
  fail("gone Then draft must stay text");
}
if (gonePaint.indexOf("Need <phone>?") >= 0) fail("raw < in the gone ask must not become markup");
if (gonePaint.indexOf("Need &lt;phone&gt;?") < 0) fail("gone ask must stay text");
if (gonePaint.indexOf("Nothing sent alone") < 0) fail("gone History thread must stay nothing sent alone");
if (gonePaint.indexOf("Desk AI") >= 0) fail("gone History talk must not fall back to Desk AI");
if (gonePaint.indexOf("Then draft") >= 0) fail("gone History talk must not look like a live Then draft");
if (gonePaint.indexOf(" · asks") >= 0) fail("gone History ask must use gone HOLD, not a live asks label");
if (/\bDraft\b/.test(gonePaint.replace(/Then draft/g, "")) && gonePaint.indexOf("Shop Bot") < 0) {
  fail("gone History must not look like a live Then draft");
}

if (typeof ctx.thenTagHtml !== "function" || typeof ctx.deskAiLine !== "function" || typeof ctx.thenLabel !== "function") {
  fail("History must expose thenTagHtml / deskAiLine / thenLabel");
}
const goneTag = ctx.thenTagHtml(goneItem);
if (goneTag.indexOf("not on this desk") < 0) fail("History list tag must say not on this desk");
if (goneTag.indexOf("Then draft") >= 0) fail("gone History list tag must not look live");
if (goneTag.indexOf("Shop Bot <gone>") >= 0) fail("raw < in gone list tag must not become markup");
if (goneTag.indexOf("Shop Bot &lt;gone&gt;") < 0) fail("gone list tag name must stay text");
if (ctx.deskAiLine(goneItem).indexOf("not on this desk") < 0) fail("Explore Desk AI must say not on this desk");
if (ctx.deskAiLine(goneItem).indexOf("Shop Bot") < 0) fail("Explore Desk AI must name the gone bot");
if (ctx.thenLabel(item).indexOf("Then draft") < 0) fail("live Then label must stay Then draft");
if (ctx.thenLabel(goneItem).indexOf("not on this desk") < 0) fail("gone Then label must say not on this desk");

ctx.last = [goneItem];
const goneStory = ctx.story();
if (goneStory.indexOf("not on this desk") < 0) fail("History story must name gone HOLD");
if (goneStory.indexOf("Then draft") >= 0) fail("gone History story must not look like a live Then draft");
ctx.last = [];

const goneOnly = hist.historyItem({
  id: "j-gone-empty",
  status: "waiting",
  title: "Bare gone",
  thenAiGone: { id: "shop-bot", name: "Shop Bot" }
}, { slug: "shop", biz: "Shop" });
const goneOnlyPaint = ctx.thenHtml(goneOnly);
if (!goneOnlyPaint || goneOnlyPaint.indexOf("not on this desk") < 0) fail("gone HOLD must paint even without a draft blob");
if (goneOnlyPaint.indexOf("Then draft") >= 0) fail("gone-only paint must not look live");

const foundGone = hist.filterHistory([goneItem], { q: "Shop Bot" });
if (!foundGone.length) fail("History search must find a gone Then AI name");

const goneAnonJob = {
  id: "j-gone-anon",
  status: "waiting",
  title: "Bare gone talk",
  draft: "Hold the <draft>.",
  thenAiGone: { id: "shop-bot", name: "Shop Bot <gone>" },
  thread: [
    { kind: "ask", text: "Need <phone>?" },
    { kind: "rec", text: "A later <rec>." }
  ]
};
const goneAnonItem = hist.historyItem(goneAnonJob, { slug: "shop", biz: "Shop" });
if (!goneAnonItem || !goneAnonItem.thenAiGone) fail("anonymous gone historyItem must keep thenAiGone");
if (goneAnonItem.thread.some(function (t) { return t.from; })) {
  fail("anonymous gone talk must keep empty from");
}
const goneAnonPaint = ctx.threadHtml(goneAnonItem);
if (!goneAnonPaint) fail("anonymous gone History must still paint the thread");
if (goneAnonPaint.indexOf("Desk AI") >= 0) fail("anonymous gone talk must not fall back to Desk AI");
if (goneAnonPaint.indexOf("Then draft") >= 0) fail("anonymous gone talk must not look like a live Then draft");
if (goneAnonPaint.indexOf("not on this desk") < 0) fail("anonymous gone talk must say not on this desk");
if (goneAnonPaint.indexOf("Shop Bot <gone>") >= 0) fail("raw < in anonymous gone talk must not become markup");
if (goneAnonPaint.indexOf("Shop Bot &lt;gone&gt;") < 0) fail("anonymous gone talk name must stay text");
if (goneAnonPaint.indexOf("Need <phone>?") >= 0) fail("raw < in anonymous gone ask must not become markup");
if (goneAnonPaint.indexOf("Need &lt;phone&gt;?") < 0) fail("anonymous gone ask must stay text");
if (typeof ctx.talkLabel !== "function") fail("History must expose talkLabel");
if (ctx.talkLabel({ kind: "ask" }, goneAnonItem).indexOf("not on this desk") < 0) {
  fail("gone ask with no from must use gone HOLD");
}
if (ctx.talkLabel({ kind: "rec" }, goneAnonItem).indexOf("Desk AI") >= 0) {
  fail("gone rec with no from must not say Desk AI");
}
if (ctx.talkLabel({ kind: "ask", from: "James’s AI" }, item).indexOf("James") < 0) {
  fail("live ask must still name the desk AI");
}
if (ctx.talkLabel({ kind: "ask" }, { draft: "hi" }).indexOf("Desk AI") < 0) {
  fail("live anonymous ask may still say Desk AI");
}
if (typeof ctx.wipTalkLabel !== "function") fail("History must expose wipTalkLabel");
if (ctx.talkLabel({ kind: "note", from: "pipe" }, item).indexOf("pipe WIP") < 0) {
  fail("pipe note must label pipe WIP");
}
if (ctx.talkLabel({ kind: "note", from: "desk" }, item).indexOf("desk · note") < 0) {
  fail("desk note must label note");
}
if (ctx.talkLabel({ kind: "follow", from: "webhook" }, item).indexOf("follow") < 0) {
  fail("follow must label follow");
}
if (ctx.talkLabel({ kind: "tell", from: "drop" }, item).indexOf("drop · tell") < 0) {
  fail("Tell AIA must label drop · tell");
}
if (ctx.talkLabel({ kind: "tell", from: "drop" }, item).indexOf("Then draft") >= 0) {
  fail("Tell AIA must not look like a Then draft");
}
if (ctx.talkLabel({ kind: "tell" }, goneAnonItem).indexOf("Desk AI") >= 0) {
  fail("gone tell must not fall back to Desk AI");
}
if (ctx.talkLabel({ kind: "note", from: "pipe" }, item).indexOf("Then draft") >= 0) {
  fail("pipe WIP must not look like a Then draft");
}
if (ctx.talkLabel({ kind: "note" }, goneAnonItem).indexOf("Desk AI") >= 0) {
  fail("gone note must not fall back to Desk AI");
}
if (ctx.talkLabel({ kind: "note" }, goneAnonItem).indexOf("Then draft") >= 0) {
  fail("gone note must not look like a live Then draft");
}
if (ctx.talkLabel({ kind: "follow" }, goneAnonItem).indexOf("not on this desk") >= 0) {
  fail("gone follow must not use gone HOLD");
}
if (/Agent|Bot MVP|crew agent/i.test(ctx.talkLabel({ kind: "note", from: "pipe" }, item))) {
  fail("pipe WIP must stay Desk-AI-safe");
}

const capCtx = {
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
capCtx.window = capCtx;
vm.runInNewContext(needs, capCtx);
if (typeof capCtx.card !== "function") fail("desk-needs.js must set window.card");
const qPaint = capCtx.card(job, false);
if (qPaint.indexOf("q-thread") < 0) fail("queue card must still wrap Then + thread");
if (qPaint.indexOf("Sam at the shop") < 0) fail("queue card must still show the human reply");
if (qPaint.indexOf("Dropped by neighbor") < 0) fail("queue card must show the desk note");
if (qPaint.indexOf("desk · note") < 0) fail("queue card must label a desk note as note");
if (qPaint.indexOf("Pipe update.") < 0) fail("queue card must show pipe WIP");
if (qPaint.indexOf("pipe · pipe WIP") < 0) fail("queue card must label pipe notes as pipe WIP");
if (qPaint.indexOf("Pipe confirmed done.") < 0) fail("queue card must show follow");
if (qPaint.indexOf("webhook · follow") < 0) fail("queue card must label follow");
if (qPaint.indexOf("Not shipped. Qualify first.") < 0) fail("queue card must show Tell AIA");
if (qPaint.indexOf("drop · tell") < 0) fail("queue card must label Tell AIA as tell");
if (qPaint.indexOf("q-turn-you") < 0) fail("queue card must mark Tell AIA as a human turn");
if (qPaint.indexOf(">Yes<") < 0 && qPaint.indexOf("Yes") < 0) fail("queue card must keep Yes human");
// loadCap still maps each cap item through capCardHtml, which wraps Then + talk
// + prompt in q-thread (minified names: window.loadCap / window.capCardHtml).
function capLoadThreadFaults(src) {
  const bad = [];
  if (src.indexOf("window.loadCap") < 0) bad.push("missing loadCap");
  if (src.indexOf("window.capCardHtml") < 0) bad.push("missing capCardHtml");
  if (src.indexOf("q-card cap-card") < 0) bad.push("missing cap-card markup");
  const art = src.indexOf("q-card cap-card");
  const around = art < 0 ? "" : src.slice(Math.max(0, art - 500), art + 400);
  if (around.indexOf("q-thread") < 0) bad.push("cap-card markup missing q-thread");
  return bad;
}
(function () {
  const bad = capLoadThreadFaults(needs);
  if (bad.length) fail("Cap loadCap must insert the thread, not only Then draft: " + bad.join("; "));
})();
const qGone = capCtx.card(goneJob, false);
if (qGone.indexOf("James") >= 0) fail("Cap gone card must not name James");
if (qGone.indexOf("not on this desk") < 0) fail("Cap must paint gone HOLD");
if (qGone.indexOf("Shop Bot <gone>") >= 0) fail("raw < in Cap gone AI name must not become markup");
if (qGone.indexOf("Shop Bot &lt;gone&gt;") < 0) fail("Cap gone AI name must stay text");
if (qGone.indexOf("Nothing sent alone") < 0 && qGone.indexOf("HOLD") < 0) fail("Cap gone card must stay HOLD");
if (qGone.indexOf("Desk AI") >= 0) fail("Cap gone talk must not fall back to Desk AI");
if (qGone.indexOf("Then draft") >= 0) fail("Cap gone talk must not look like a live Then draft");
const qGoneAnon = capCtx.card(goneAnonJob, false);
if (qGoneAnon.indexOf("Desk AI") >= 0) fail("Cap anonymous gone talk must not fall back to Desk AI");
if (qGoneAnon.indexOf("Then draft") >= 0) fail("Cap anonymous gone talk must not look like a live Then draft");
if (qGoneAnon.indexOf("not on this desk") < 0) fail("Cap anonymous gone talk must say not on this desk");
if (qGoneAnon.indexOf("Shop Bot <gone>") >= 0) fail("raw < in Cap anonymous gone talk must not become markup");
if (qGoneAnon.indexOf("Shop Bot &lt;gone&gt;") < 0) fail("Cap anonymous gone talk name must stay text");

const cardCtx = {
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
const cardFns = card.match(/function thenWhoOf\(j\)[\s\S]*?function jobBy\(id\)/);
if (!cardFns) fail("could not extract open-job thread paint");
vm.runInNewContext(cardFns[0] + " {}", cardCtx);
if (typeof cardCtx.threadSheetHtml !== "function") fail("openJob must expose threadSheetHtml");
const openPaint = cardCtx.threadSheetHtml(xssJob);
if (openPaint.indexOf("q-thread") < 0 && openPaint.indexOf("Then draft") < 0) fail("open-job must show Then draft / thread");
if (openPaint.indexOf("Need <phone>?") >= 0) fail("open-job ask must stay escaped");
if (openPaint.indexOf("Need &lt;phone&gt;?") < 0) fail("open-job ask must stay text");
if (openPaint.indexOf("WIP <script>x") >= 0) fail("open-job pipe WIP must stay escaped");
if (openPaint.indexOf("WIP &lt;script&gt;x") < 0) fail("open-job pipe WIP must stay text");
if (openPaint.indexOf("Nothing sent alone") < 0) fail("open-job thread must stay nothing sent");
const openWip = cardCtx.threadSheetHtml(job);
if (openWip.indexOf("Dropped by neighbor") < 0) fail("open-job must show the desk note");
if (openWip.indexOf("desk · note") < 0) fail("open-job must label a desk note as note");
if (openWip.indexOf("pipe · pipe WIP") < 0) fail("open-job must label pipe notes as pipe WIP");
if (openWip.indexOf("webhook · follow") < 0) fail("open-job must label follow");
if (openWip.indexOf("Not shipped. Qualify first.") < 0) fail("open-job must show Tell AIA");
if (openWip.indexOf("drop · tell") < 0) fail("open-job must label Tell AIA as tell");
if (cardCtx.talkLabelOf({ kind: "tell", from: "drop" }, "James’s AI", "").indexOf("Then draft") >= 0) {
  fail("open-job Tell AIA must not look like a Then draft");
}
if (typeof cardCtx.wipTalkLabelOf !== "function") fail("open-job must expose wipTalkLabelOf");
if (cardCtx.talkLabelOf({ kind: "note", from: "pipe" }, "James’s AI", "").indexOf("pipe WIP") < 0) {
  fail("open-job pipe note must label pipe WIP, not Then draft");
}
if (cardCtx.talkLabelOf({ kind: "note", from: "pipe" }, "James’s AI", "").indexOf("Then draft") >= 0) {
  fail("open-job pipe WIP must not look like a Then draft");
}
if (typeof cardCtx.talkLabelOf !== "function") fail("open-job must expose talkLabelOf");
const openGone = cardCtx.threadSheetHtml(goneJob);
if (openGone.indexOf("Desk AI") >= 0) fail("open-job gone talk must not fall back to Desk AI");
if (openGone.indexOf("Then draft") >= 0) fail("open-job gone talk must not look like a live Then draft");
if (openGone.indexOf("not on this desk") < 0) fail("open-job gone talk must say not on this desk");
const openGoneAnon = cardCtx.threadSheetHtml(goneAnonJob);
if (openGoneAnon.indexOf("Desk AI") >= 0) fail("open-job anonymous gone talk must not fall back to Desk AI");
if (openGoneAnon.indexOf("Then draft") >= 0) fail("open-job anonymous gone talk must not look like a live Then draft");
if (openGoneAnon.indexOf("not on this desk") < 0) fail("open-job anonymous gone talk must say not on this desk");
if (openGoneAnon.indexOf("Shop Bot <gone>") >= 0) fail("raw < in open-job gone talk must not become markup");
if (openGoneAnon.indexOf("Shop Bot &lt;gone&gt;") < 0) fail("open-job gone talk name must stay text");
if (cardCtx.talkLabelOf({ kind: "ask" }, "", "Shop Bot <gone>").indexOf("not on this desk") < 0) {
  fail("open-job gone ask with no from must use gone HOLD");
}
if (cardCtx.talkLabelOf({ kind: "rec" }, "", "Shop Bot") === "Desk AI · Then draft") {
  fail("open-job gone rec with no from must not say Desk AI");
}

const fieldsApi = require(path.join(root, "api/_fields"));
const putTell = fieldsApi.makeCapturedJob("shop", { fields: [], people: [] }, {
  title: "Name: Sam",
  notes: "Name: Sam\nNeed a pickup Friday 3pm",
  tell: "Not shipped. Qualify first.",
  implement: "Name: Sam\nNeed a pickup Friday 3pm",
  mode: "agent",
  from: "widget",
  contactName: "PROBE",
  droppedByKind: "helper"
});
if (!(putTell.thread || []).some(function (t) { return t.kind === "tell" && /Qualify first/.test(t.text || ""); })) {
  fail("Drop Put + Tell AIA must store kind tell");
}
if ((putTell.thread || []).some(function (t) { return t.kind === "note" && /Qualify first/.test(t.text || ""); })) {
  fail("Drop Put + Tell AIA must not store the tell as note");
}
const putItem = hist.historyItem(putTell, { slug: "shop", biz: "Shop" });
if (!putItem.thread.some(function (t) { return t.kind === "tell"; })) fail("History must keep captured Tell AIA as tell");
if (putItem.via !== "drop") fail("widget / Drop capture must label via drop");
if (putItem.who === "widget" || putItem.who === "drop") fail("Drop capture who must not be widget jargon");
const createItem = hist.historyItem({
  id: "j-create",
  status: "waiting",
  title: "Grocery list for Friday",
  from: "create",
  whoTapped: "desk",
  waitingOn: "person",
  draft: "Buy milk. Do not send."
}, { slug: "shop", biz: "Shop" });
if (!createItem || createItem.via !== "create") fail("Create capture must label via create");
if (!createItem.decide) fail("Create Yes/Stop card must expose decide");
if (createItem.who) fail("Create whoTapped desk must not paint as who");
if (typeof hist.viaOf !== "function" || hist.viaOf({ from: "create" }) !== "create") fail("viaOf must map create");
if (hist.viaOf({ from: "widget" }) !== "drop") fail("viaOf must map widget to drop");
if (ctx.talkLabel({ kind: "tell", from: "PROBE" }, putItem).indexOf("PROBE · tell") < 0) {
  fail("History must label dropper · tell");
}
if (ctx.talkLabel({ kind: "tell", from: "PROBE" }, putItem).indexOf("NOTE") >= 0 || ctx.talkLabel({ kind: "tell", from: "PROBE" }, putItem).indexOf("note") >= 0) {
  fail("History Tell AIA must not paint NOTE");
}
const putOpen = cardCtx.threadSheetHtml(putTell);
if (putOpen.indexOf("Qualify first") < 0) fail("open-job must show captured Tell AIA");
if (putOpen.indexOf("PROBE · tell") < 0 && putOpen.indexOf("drop · tell") < 0) {
  fail("open-job must paint drop · tell or dropper · tell, not NOTE");
}
if (putOpen.indexOf("PROBE · note") >= 0 && putOpen.indexOf("Qualify first") >= 0 && putOpen.indexOf("PROBE · tell") < 0) {
  fail("open-job captured Tell AIA painted as NOTE");
}

// Mutants for the six updated assertions. They change source text in memory only.
function swap(src, from, to) { return src.indexOf(from) < 0 ? null : src.split(from).join(to); }
const MUTANTS = [
  ["Cap talk loses q-thread", function () { const n = swap(needs, "q-thread", "q-no-thread"); return n && capTalkSourceFaults(n); }],
  ["Cap talk loses q-talk turns", function () { const n = swap(needs, "q-talk", "q-mute"); return n && capTalkSourceFaults(n); }],
  ["Cap talk loses capCardHtml", function () { const n = swap(needs, "window.capCardHtml", "window.capOffHtml"); return n && capTalkSourceFaults(n); }],
  ["Cap prompt loses promptHtml", function () { const n = swap(needs, "window.promptHtml", "window.promptOff"); return n && capPromptSourceFaults(n); }],
  ["Cap prompt loses q-prompt", function () { const n = swap(needs, "q-prompt", "q-quiet"); return n && capPromptSourceFaults(n); }],
  ["Cap gone talk drops HOLD before Desk AI", function () {
    const n = swap(needs, "not on this desk", "gone from desk");
    return n && capGoneTalkFaults(n);
  }],
  ["Cap gone talk restores who||from||Desk AI", function () {
    const n = needs + '\nconst name = who || row.from || "Desk AI";\n';
    return capGoneTalkFaults(n);
  }],
  ["more History tip drops the back-and-forth", function () {
    const t = swap(moreTips, "back-and-forth on the card", "the list of finished work");
    return t && historyTipThreadFaults(t);
  }],
  ["more History tip id gone", function () {
    const t = swap(moreTips, '"more-history"', '"more-past"');
    return t && historyTipThreadFaults(t);
  }],
  ["Cap WIP loses pipe WIP label", function () { const n = swap(needs, "pipe WIP", "pipe note"); return n && capWipLabelFaults(n); }],
  ["Cap WIP loses follow label", function () { const n = swap(needs, " · follow", " · after"); return n && capWipLabelFaults(n); }],
  ["Cap loadCap missing", function () { const n = swap(needs, "window.loadCap", "window.loadOff"); return n && capLoadThreadFaults(n); }],
  ["Cap card markup drops q-thread", function () {
    const art = needs.indexOf("q-card cap-card");
    if (art < 0) return null;
    const lo = Math.max(0, art - 500), hi = art + 400;
    const n = needs.slice(0, lo) + needs.slice(lo, hi).split("q-thread").join("q-then-only") + needs.slice(hi);
    return n !== needs && capLoadThreadFaults(n);
  }]
];
let mutCaught = 0;
MUTANTS.forEach(function (m) {
  let out;
  try { out = m[1](); } catch (e) { out = ["threw " + e.message]; }
  if (out === null || out === false || out === undefined) fail("mutant does not apply: " + m[0]);
  else if (out.length) { mutCaught++; console.log("ok  mutant caught: " + m[0] + " (" + out[0] + ")"); }
  else fail("mutant survived: " + m[0]);
});
console.log("check-history-thread mutants: " + mutCaught + "/" + MUTANTS.length + " caught");

console.log("check-history-thread: ok");

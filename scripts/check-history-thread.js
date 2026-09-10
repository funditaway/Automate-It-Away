#!/usr/bin/env node
"use strict";

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
const yesNo = read("ACCOUNT-YES-NO.md");
const histSrc = read("api/_history.js");

["function thenHtml", "function thenGone", "function thenLabel", "function thenTagHtml", "function deskAiLine", "function talkLabel", "function talkHtml", "function threadHtml", "function promptHtml", "function namedNeedsWho", "function goneHoldLabel", "function chipsHtml", "h-thread", "h-talk", "h-turn-ai", "h-turn-you", "Then draft", "not on this desk", "Nothing sent alone", "sheet-thread"].forEach(function (bit) {
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

if (needs.indexOf("const talks = talkHtml(j)") < 0 || needs.indexOf("q-thread") < 0) {
  fail("Cap cards must paint talkHtml / q-thread");
}
if (needs.indexOf("function capCardHtml") < 0 || needs.indexOf("promptHtml(j, need)") < 0) {
  fail("Cap cards must paint promptHtml via capCardHtml");
}
if (card.indexOf("function sheetPromptHtml") < 0 || card.indexOf("sheetPromptHtml(j)") < 0) {
  fail("Open-job must paint sheetPromptHtml");
}
if (needs.indexOf("function talkLabel") < 0 || /who \|\| row\.from \|\| "Desk AI"/.test(needs)) {
  fail("Cap talkHtml must not fall back to Desk AI when the Then AI is gone");
}
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
if (more.indexOf("AI ↔ human thread") < 0) fail("more.html History must name the thread");
if (more.indexOf("not on this desk") < 0) fail("more.html History must name gone HOLD");
if (history.indexOf("gone HOLD when that named AI is not on this desk") < 0) {
  fail("History intro / health must name gone HOLD");
}
if (history.indexOf("Needs you / prompt ask-who") < 0) fail("History intro must name Needs you / prompt ask-who");
if (history.indexOf("promptHtml(it)") < 0 || history.indexOf("chipsHtml(it)") < 0) {
  fail("History threadHtml must insert promptHtml / chipsHtml");
}
if (history.indexOf("function storyOf") < 0 || history.indexOf("storyOf(row)") < 0) {
  fail("History Copy story must copy storyOf");
}
if (yesNo.indexOf("check-history-thread.js") < 0) fail("ACCOUNT-YES-NO must record History thread");
if (yesNo.indexOf("not on this desk") < 0) fail("ACCOUNT-YES-NO must record History gone HOLD");

["function talkTurns", "function deskAiOf", "thread: thread", "thenWho"].forEach(function (bit) {
  if (histSrc.indexOf(bit) < 0) fail("api/_history.js missing " + bit);
});

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
    { kind: "note", from: "desk", text: "Dropped by neighbor.", at: "2026-09-06T11:59:00Z" }
  ],
  replies: [{ from: "Pat", text: "Sam at the shop" }],
  why: "James’s AI drafted on the card. Human send HOLD.",
  next: "Reply is on the card. Nothing sent alone.",
  waitingOn: "person",
  createdAt: "2026-09-06T12:02:00Z"
};

const item = hist.historyItem(job, { slug: "shop", biz: "Shop" });
if (!item || !item.draft || item.draft.indexOf("Ask who it is for") < 0) fail("historyItem must keep Then draft");
if (!item.deskAi || item.deskAi.name !== "James’s AI") fail("historyItem must name the desk AI");
if (!item.thenWho || item.thenWho !== "James’s AI") fail("historyItem must expose thenWho");
if (!item.thread || item.thread.length < 2) fail("historyItem must expose the AI ↔ human thread");
if (!item.thread.some(function (t) { return t.kind === "ask" && t.text.indexOf("Who is this for") >= 0; })) {
  fail("historyItem thread must keep the AI ask");
}
if (!item.thread.some(function (t) { return t.kind === "reply" && t.text.indexOf("Sam at the shop") >= 0; })) {
  fail("historyItem thread must keep the human reply");
}
if (item.thread.some(function (t) { return t.kind === "note"; })) fail("historyItem thread is ask / reply / rec only");
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
    { kind: "reply", from: "Sam <helper>", text: "Use <script> no" }
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
if (painted.indexOf("AI <bot>") >= 0) fail("raw < in the AI name must not become markup");
if (painted.indexOf("Don't use <b>html</b>") >= 0) fail("raw draft markup must not land");
if (painted.indexOf("Don&#39;t use &lt;b&gt;html&lt;/b&gt;") < 0 && painted.indexOf("Don&#39;t use") < 0) {
  fail("Then draft must stay text");
}
if (painted.indexOf("Nothing sent alone") < 0) fail("History thread must stay nothing sent alone");

const stacked = ctx.threadHtml(item);
if (stacked.indexOf("Who is this for?") < 0) fail("History must show the AI ask");
if (stacked.indexOf("Sam at the shop") < 0) fail("History must show the human reply");
if (stacked.indexOf("h-turn-you") < 0 || stacked.indexOf("h-turn-ai") < 0) fail("History must mark AI and human turns");
if (stacked.indexOf("James’s AI · Then draft") < 0 && stacked.indexOf("James") < 0) {
  fail("History must name the Then draft");
}

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
if (needs.indexOf("filesHtml(j) + thread") < 0) fail("Cap loadCap must insert the thread, not only Then draft");
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
if (openPaint.indexOf("Nothing sent alone") < 0) fail("open-job thread must stay nothing sent");
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

console.log("check-history-thread: ok");

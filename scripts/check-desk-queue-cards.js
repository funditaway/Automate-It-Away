#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const vm = require("vm");

const root = path.join(__dirname, "..");

function fail(msg) {
  console.error("check-desk-queue-cards: " + msg);
  process.exit(1);
}

const needs = fs.readFileSync(path.join(root, "desk-needs.js"), "utf8");
const desk = fs.readFileSync(path.join(root, "desk.html"), "utf8");
const yesNo = fs.readFileSync(path.join(root, "ACCOUNT-YES-NO.md"), "utf8");
const help = fs.readFileSync(path.join(root, "help.html"), "utf8");
const drop = fs.readFileSync(path.join(root, "drop.html"), "utf8");
const dropAgent = fs.readFileSync(path.join(root, "drop-agent.js"), "utf8");

const syntax = spawnSync(process.execPath, ["--check", path.join(root, "desk-needs.js")], { encoding: "utf8" });
if (syntax.status !== 0) fail("desk-needs.js must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));

["function thenWho", "function filesOf", "function isNeedsYou", "function isAskHuman", "function isPromptReply", "function promptHtml", "function honestNext", "function thenDraftHtml", "q-card", "q-then", "q-hitl", "Then draft", "q-prompt", "Nothing sent alone"].forEach(function (bit) {
  if (needs.indexOf(bit) < 0) fail("desk-needs.js missing " + bit);
});
if (!/HOLD\. Nothing sent alone/.test(needs)) fail("next-line must say HOLD. Nothing sent alone.");
if (needs.indexOf("On the Home desk") >= 0) fail("queue card must not paint pack boilerplate");
if (/oauth|spacex|login\.x\.ai|custodial wallet|Collect charge/i.test(needs)) {
  fail("queue card invented Grok OAuth / wallet / Collect charge");
}
if (desk.indexOf("Taps match what the card needs") < 0) fail("desk.html missing taps line");
if (desk.indexOf("id=\"cap-band\"") < 0) fail("desk.html missing cap-band");
if (help.indexOf("named Then draft") < 0) fail("help#desk-cards must name the Then draft on /desk");
if (help.indexOf("Grok") >= 0) fail("help.html must not lecture Grok");
if (yesNo.indexOf("check-desk-queue-cards.js") < 0) fail("ACCOUNT-YES-NO must record the queue card face");

if (drop.indexOf("Public drop never sees money, Stop, or People") < 0) {
  fail("public Drop copy drifted");
}
if (dropAgent.indexOf("deskIsOpen") < 0 || dropAgent.indexOf("!deskIsOpen()") < 0) {
  fail("Drop People honesty must stay behind deskIsOpen()");
}

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
if (typeof ctx.card !== "function") fail("desk-needs.js must set window.card");

const thenCard = ctx.card({
  id: "j-then",
  status: "waiting",
  title: "They clicked",
  why: "Lead from the lane",
  draft: "Ask who it is for and when. Do not send.",
  deskAi: { name: "James’s AI", role: "Doer" },
  next: "James’s AI drafted on the card. Human send HOLD.",
  assignee: "Pat"
}, false);
if (thenCard.indexOf("q-card") < 0) fail("Then card missing q-card");
if (thenCard.indexOf("James’s AI") < 0 && thenCard.indexOf("James&#39;s AI") < 0 && thenCard.indexOf("James&rsquo;s AI") < 0) {
  if (thenCard.indexOf("James") < 0) fail("Then card must name the desk AI, got " + thenCard.slice(0, 240));
}
if (thenCard.indexOf("Then draft") < 0) fail("Then card must label Then draft");
if (thenCard.indexOf("Ask who it is for and when") < 0) fail("Then card must show the named draft");
if (/On the Home desk/i.test(thenCard)) fail("Then card showed pack boilerplate");
if (thenCard.indexOf("Needs you") < 0) fail("decide card must show Needs you");
if (thenCard.indexOf(">Yes<") < 0 || thenCard.indexOf(">Stop<") < 0 || thenCard.indexOf(">Kill<") < 0) {
  fail("decide card must show Yes / Stop / Kill");
}
if (!/HOLD/i.test(thenCard) || thenCard.indexOf("Nothing sent alone") < 0) {
  fail("Then card next-line must stay HOLD / nothing sent");
}
if (thenCard.indexOf("Pat") < 0) fail("assignee must stay on the card");
if (/Ask Grok/.test(thenCard)) fail("a card that already has a draft must not show Ask Grok");

const askCard = ctx.card({
  id: "j-ask",
  status: "waiting",
  title: "Missed call",
  kind: "call",
  outcome: "call",
  waitingOn: "info",
  why: "Need a number before this can go."
}, false);
if (askCard.indexOf("Ask the human") < 0) fail("missing-info card must show Ask the human");
if (askCard.indexOf("Needs you") < 0) fail("missing-info card must show Needs you");
if (askCard.indexOf("Ask Grok") < 0) fail("a waiting card with no draft must show Ask Grok");
if (askCard.indexOf("q-prompt") < 0) fail("missing-info card must show the prompt reply");
if (askCard.indexOf("q-reply-box") < 0) fail("missing-info card must have a reply field");
if (askCard.indexOf(">Reply<") < 0) fail("missing-info card must have a Reply tap");
if (askCard.indexOf("Nothing sent alone") < 0) fail("prompt must say nothing sent alone");
if (/>Yes</.test(askCard)) fail("missing-info card must not show Yes");

const fileCard = ctx.card({
  id: "j-file",
  status: "waiting",
  title: "School form",
  photoUrl: "https://x.test/slip.jpg",
  files: [{ url: "https://x.test/form.pdf", name: "Permission slip.pdf", kind: "file", type: "application/pdf" }],
  draft: "Text the school. HOLD."
}, false);
if (fileCard.indexOf("https://x.test/slip.jpg") < 0) fail("photo must stay on the card");
if (fileCard.indexOf("Permission slip.pdf") < 0) fail("file name must stay on the card");
if (fileCard.indexOf("q-files") < 0) fail("files must use the card file row");

const xss = ctx.card({
  id: "j-xss",
  status: "waiting",
  title: "Need 2 < 3 & \"go\"",
  why: "Buy <5 gallons",
  draft: "Don't use <b>html</b>",
  assignee: "Sam <helper>",
  deskAi: { name: "AI <bot>" },
  photoUrl: "https://x.test/a.jpg\">",
  files: [{ url: "https://x.test/b.pdf", name: "Form <x>.pdf" }]
}, false);
if (/<h3>Need 2 < 3/.test(xss)) fail("raw < in a title must not become markup");
if (xss.indexOf("Need 2 &lt; 3 &amp; &quot;go&quot;") < 0) fail("title must stay text");
if (xss.indexOf("Buy &lt;5 gallons") < 0) fail("why must stay text");
if (/<p class="q-prompt-q">Buy <5/.test(xss)) fail("prompt question must stay text");
if (xss.indexOf("Don&#39;t use &lt;b&gt;html&lt;/b&gt;") < 0) fail("draft must stay text");
if (xss.indexOf("Sam &lt;helper&gt;") < 0) fail("assignee must stay text");
if (xss.indexOf("AI &lt;bot&gt;") < 0) fail("Then name must stay text");
if (xss.indexOf("Form &lt;x&gt;.pdf") < 0) fail("file name must stay text");
if (xss.indexOf("src=\"https://x.test/a.jpg&quot;&gt;\"") < 0) fail("photoUrl quotes must not break the thumb");

const staff = ctx.card({
  id: "j-staff",
  status: "waiting",
  title: "Oak dresser",
  draft: "List the oak dresser."
}, true);
if (/>Stop</.test(staff) || />Kill</.test(staff)) fail("helper must not get Stop / Kill");
  if (staff.indexOf(">Yes<") < 0) fail("helper may still Yes when the rule allows");

const fanCard = ctx.card({
  id: "j-fan",
  status: "waiting",
  title: "eggs",
  notes: "eggs",
  draft: "Draft ready. I cannot send, pay, or bind anything. You stay in control.",
  waitingOn: "person",
  custom: { dropId: "drop_1", dropIndex: 2, dropTotal: 3 }
}, false);
if (fanCard.indexOf("2 of 3 from this Drop") < 0) fail("fanned card must show Drop index");
if (fanCard.indexOf("Needs you") < 0) fail("fanned card must show Needs you");
if (fanCard.indexOf(">Yes<") < 0 || fanCard.indexOf(">Stop<") < 0) fail("fanned card must keep Yes / Stop human");
if (!/HOLD/i.test(fanCard) || fanCard.indexOf("Nothing sent alone") < 0) fail("fanned card must stay HOLD");

const capNeed = ctx.cardNeeds({
  id: "j-cap",
  status: "held",
  title: "Owner call",
  priority: true,
  cap: true
}, false);
if (!capNeed.priority) fail("cap card must stay priority");

console.log("check-desk-queue-cards: ok");

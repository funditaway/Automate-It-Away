#!/usr/bin/env node
"use strict";
require("./_env-guard");

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

// a2ad8c4 (#265) minified desk-needs.js. Names like thenWho / filesOf /
// isNeedsYou were shortened; window.card still paints the same face.
["q-card", "q-then", "q-then-who", "q-hitl", "Then draft", "q-prompt", "q-files", "q-need", "q-ask", "Needs you", "Ask the human", "Nothing sent alone"].forEach(function (bit) {
  if (needs.indexOf(bit) < 0) fail("desk-needs.js missing " + bit);
});
function thenWhoFaults(src) {
  const bad = [];
  if (src.indexOf("function thenDraftName") < 0) bad.push("missing thenDraftName");
  if (src.indexOf("q-then-who") < 0) bad.push("missing q-then-who");
  if (src.indexOf(" · Then draft") < 0) bad.push("missing Then draft label");
  return bad;
}
(function () {
  const bad = thenWhoFaults(needs);
  if (bad.length) fail("queue card must name who the Then draft is for: " + bad.join("; "));
})();
function filesOfFaults(src) {
  const bad = [];
  if (src.indexOf("q-files") < 0) bad.push("missing q-files");
  if (src.indexOf("function fileNameHtml") < 0) bad.push("missing fileNameHtml");
  return bad;
}
(function () {
  const bad = filesOfFaults(needs);
  if (bad.length) fail("queue card must still paint files: " + bad.join("; "));
})();
function needsYouFaults(src) {
  const bad = [];
  if (src.indexOf("Needs you") < 0) bad.push("missing Needs you");
  if (src.indexOf("q-need") < 0) bad.push("missing q-need");
  return bad;
}
(function () {
  const bad = needsYouFaults(needs);
  if (bad.length) fail("queue card must still mark Needs you: " + bad.join("; "));
})();
function askHumanFaults(src) {
  const bad = [];
  if (src.indexOf("Ask the human") < 0) bad.push("missing Ask the human");
  if (src.indexOf("q-ask") < 0) bad.push("missing q-ask");
  return bad;
}
(function () {
  const bad = askHumanFaults(needs);
  if (bad.length) fail("queue card must still mark Ask the human: " + bad.join("; "));
})();
function promptReplyFaults(src) {
  const bad = [];
  if (src.indexOf("window.promptHtml") < 0) bad.push("missing window.promptHtml");
  if (src.indexOf("q-prompt") < 0) bad.push("missing q-prompt");
  return bad;
}
(function () {
  const bad = promptReplyFaults(needs);
  if (bad.length) fail("queue card must still paint promptHtml: " + bad.join("; "));
})();
// 9b6ba98 (#495): next-line suffix is ". Nothing sent alone.", not bare HOLD.
function honestNextFaults(src) {
  const bad = [];
  if (src.indexOf(". Nothing sent alone.") < 0) bad.push("missing . Nothing sent alone.");
  if (src.indexOf(". HOLD. Nothing sent alone.") >= 0) bad.push("bare HOLD suffix came back");
  return bad;
}
(function () {
  const bad = honestNextFaults(needs);
  if (bad.length) fail("next-line must stay Nothing sent alone, no bare HOLD: " + bad.join("; "));
})();
function thenDraftHtmlFaults(src) {
  const bad = [];
  if (src.indexOf("q-then") < 0) bad.push("missing q-then");
  if (src.indexOf("q-then-who") < 0) bad.push("missing q-then-who");
  if (src.indexOf("thenDraftName") < 0) bad.push("missing thenDraftName");
  return bad;
}
(function () {
  const bad = thenDraftHtmlFaults(needs);
  if (bad.length) fail("queue card must still paint then draft HTML: " + bad.join("; "));
})();
if (needs.indexOf("On the Home desk") >= 0) fail("queue card must not paint pack boilerplate");
if (/oauth|spacex|login\.x\.ai|custodial wallet|Collect charge/i.test(needs)) {
  fail("queue card invented Grok OAuth / wallet / Collect charge");
}
// d234a7e simplified the Queue page; the taps line is now "You still tap Yes or Stop."
function deskTapsFaults(src) {
  const bad = [];
  if (src.indexOf("You still tap Yes or Stop") < 0) bad.push("missing You still tap Yes or Stop");
  return bad;
}
(function () {
  const bad = deskTapsFaults(desk);
  if (bad.length) fail("desk.html must still say you tap Yes or Stop: " + bad.join("; "));
})();
if (desk.indexOf("id=\"cap-band\"") < 0) fail("desk.html missing cap-band");
if (help.indexOf("named Then draft") < 0) fail("help#desk-cards must name the Then draft on /desk");
if (help.indexOf("Grok") >= 0) fail("help.html must not lecture Grok");
if (yesNo.indexOf("check-desk-queue-cards.js") < 0) fail("ACCOUNT-YES-NO must record the queue card face");

// fff3b47 simplified Drop copy; public share still hides money / Stop / People.
function publicDropFaults(src) {
  const bad = [];
  if (src.indexOf("They never see money, Stop, or People") < 0) bad.push("missing they never see money / Stop / People");
  return bad;
}
(function () {
  const bad = publicDropFaults(drop);
  if (bad.length) fail("public Drop copy must still hide money, Stop, and People: " + bad.join("; "));
})();
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
if (/Ask the desk/.test(thenCard)) fail("a card that already has a draft must not show Ask the desk");

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
if (askCard.indexOf("Ask the desk") < 0) fail("a waiting card with no draft must show Ask the desk");
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
if (/<p class=\"q-prompt-q\">Buy <5/.test(xss)) fail("prompt question must stay text");
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
// #495 dropped bare HOLD from the next-line; the fanned card still stays nothing sent alone.
if (fanCard.indexOf("Nothing sent alone") < 0) fail("fanned card must stay nothing sent alone");

const capNeed = ctx.cardNeeds({
  id: "j-cap",
  status: "held",
  title: "Owner call",
  priority: true,
  cap: true
}, false);
if (!capNeed.priority) fail("cap card must stay priority");

// Mutants for the replaced assertions. In-memory only.
function swap(s, from, to) { return s.indexOf(from) < 0 ? null : s.split(from).join(to); }
const MUTANTS = [
  ["thenWho loses thenDraftName", function () { const n = swap(needs, "function thenDraftName", "function thenDraftOff"); return n && thenWhoFaults(n); }],
  ["thenWho loses q-then-who", function () { const n = swap(needs, "q-then-who", "q-then-off"); return n && thenWhoFaults(n); }],
  ["filesOf loses q-files", function () { const n = swap(needs, "q-files", "q-atts"); return n && filesOfFaults(n); }],
  ["filesOf loses fileNameHtml", function () { const n = swap(needs, "function fileNameHtml", "function fileNameOff"); return n && filesOfFaults(n); }],
  ["isNeedsYou loses Needs you", function () { const n = swap(needs, "Needs you", "Needs a look"); return n && needsYouFaults(n); }],
  ["isNeedsYou loses q-need", function () { const n = swap(needs, "q-need", "q-wait"); return n && needsYouFaults(n); }],
  ["isAskHuman loses Ask the human", function () { const n = swap(needs, "Ask the human", "Ask someone"); return n && askHumanFaults(n); }],
  ["isAskHuman loses q-ask", function () { const n = swap(needs, "q-ask", "q-query"); return n && askHumanFaults(n); }],
  ["isPromptReply / promptHtml loses window.promptHtml", function () { const n = swap(needs, "window.promptHtml", "window.promptOff"); return n && promptReplyFaults(n); }],
  ["isPromptReply / promptHtml loses q-prompt", function () { const n = swap(needs, "q-prompt", "q-box"); return n && promptReplyFaults(n); }],
  ["honestNext loses Nothing sent alone suffix", function () { const n = swap(needs, ". Nothing sent alone.", ". Do the next thing."); return n && honestNextFaults(n); }],
  ["honestNext brings back bare HOLD suffix", function () {
    const n = swap(needs, ". Nothing sent alone.", ". HOLD. Nothing sent alone.");
    return n && honestNextFaults(n);
  }],
  ["thenDraftHtml loses q-then", function () { const n = swap(needs, "q-then", "q-draft"); return n && thenDraftHtmlFaults(n); }],
  ["desk taps line dropped", function () { const d = swap(desk, "You still tap Yes or Stop", "The queue runs itself"); return d && deskTapsFaults(d); }],
  ["public Drop honesty dropped", function () { const d = swap(drop, "They never see money, Stop, or People", "They can see money, Stop, or People"); return d && publicDropFaults(d); }]
];
let mutCaught = 0;
MUTANTS.forEach(function (m) {
  let out;
  try { out = m[1](); } catch (e) { out = ["threw " + e.message]; }
  if (out === null || out === false || out === undefined) fail("mutant does not apply: " + m[0]);
  else if (out.length) { mutCaught += 1; console.log("ok  mutant caught: " + m[0] + " (" + out[0] + ")"); }
  else fail("mutant survived: " + m[0]);
});
console.log("check-desk-queue-cards mutants: " + mutCaught + "/" + MUTANTS.length + " caught");
console.log("check-desk-queue-cards: ok");

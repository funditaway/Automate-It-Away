#!/usr/bin/env node
"use strict";
require("./_env-guard");

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const vm = require("vm");

const root = path.join(__dirname, "..");

function fail(msg) {
  console.error("check-queue-ux: " + msg);
  process.exit(1);
}
function pass(msg) {
  console.log("ok  " + msg);
}

const needs = fs.readFileSync(path.join(root, "desk-needs.js"), "utf8");
const ux = fs.readFileSync(path.join(root, "desk-queue-ux.js"), "utf8");
const nav = fs.readFileSync(path.join(root, "desk-nav.js"), "utf8");
const desk = fs.readFileSync(path.join(root, "desk.html"), "utf8");
const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
const yesNo = fs.readFileSync(path.join(root, "ACCOUNT-YES-NO.md"), "utf8");

["--check", path.join(root, "desk-queue-ux.js")].forEach(function () {});
const syntax = spawnSync(process.execPath, ["--check", path.join(root, "desk-queue-ux.js")], { encoding: "utf8" });
if (syntax.status !== 0) fail("desk-queue-ux.js must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
pass("desk-queue-ux parses");

const needCheck = spawnSync(process.execPath, ["--check", path.join(root, "desk-needs.js")], { encoding: "utf8" });
if (needCheck.status !== 0) fail("desk-needs.js must parse");
pass("desk-needs parses");

["q-state-", "q-drawer", "q-face", "q-drag", "More on this card", "q-state-mark"].forEach(function (bit) {
  if (needs.indexOf(bit) < 0) fail("desk-needs.js missing " + bit);
});
// a2ad8c4 minified cardState / stateMark. The map still paints Waiting /
// Working / Needs you / Cap / Done on q-state-mark, with q-state- classes.
function cardStateFaults(src) {
  const bad = [];
  if (src.indexOf("q-state-") < 0) bad.push("missing q-state-");
  if (src.indexOf("q-state-mark") < 0) bad.push("missing q-state-mark");
  if (src.indexOf('pending:"Waiting"') < 0) bad.push("missing Waiting");
  if (src.indexOf('running:"Working"') < 0) bad.push("missing Working");
  if (src.indexOf('flagged:"Needs you"') < 0) bad.push("missing Needs you");
  if (src.indexOf('cap:"Cap"') < 0) bad.push("missing Cap");
  if (src.indexOf('done:"Done"') < 0) bad.push("missing Done");
  return bad;
}
(function () {
  const bad = cardStateFaults(needs);
  if (bad.length) fail("desk-needs.js card state labels drifted: " + bad.join("; "));
})();
pass("desk-needs paints calm card face + drawer");

["cap-drop", "pinCap", "q-state-pending", "q-state-flagged", "desk-tools", "queue-desk-rail", "Tap or drag to Cap", "closest(\"#queue .q-drag\")"].forEach(function (bit) {
  if (ux.indexOf(bit) < 0) fail("desk-queue-ux.js missing " + bit);
});
pass("desk-queue-ux has Cap drag + chrome fold");

if (!nav.includes("desk-queue-ux.js")) fail("desk-nav.js must load desk-queue-ux.js");
pass("nav loads queue ux");

// d234a7e dropped "Taps match what the card needs"; the desk still says
// you tap Yes or Stop, and id="queue" stays the host.
function deskContractFaults(src) {
  const bad = [];
  if (src.indexOf('id="queue"') < 0) bad.push("missing id=queue");
  if (src.indexOf("You still tap Yes or Stop") < 0) bad.push("missing You still tap Yes or Stop");
  return bad;
}
(function () {
  const bad = deskContractFaults(desk);
  if (bad.length) fail("desk.html queue contract drifted: " + bad.join("; "));
})();
pass("desk.html queue host intact");
if (desk.includes("<h3>No?</h3>") || desk.includes(">No</button>") || desk.includes("return \"No\"")) {
  fail("desk.html Stop / Kill confirm still paints No");
}
if (!desk.includes("<h3>Stop?</h3>") || !desk.includes(">Stop</button>") || !desk.includes("return \"Stopped\"")) {
  fail("desk.html Stop confirm must name Stop / Stopped");
}
pass("desk.html Stop confirm is Stop, not No");
const queueJs = fs.readFileSync(path.join(root, "desk-queue.js"), "utf8");
if (queueJs.includes(">No</button>") || queueJs.includes(" · Yes/No")) fail("desk-queue.js leftover still paints No as the rail");
else pass("desk-queue leftover Stop is Stop, not No");
if (queueJs.indexOf("Orange until a real pipe answers") < 0) fail("desk-queue Pipes sheet must say Orange until a real pipe answers");
else pass("desk-queue Pipes sheet orange until real pipe");
["keys sit on the box", "keys on the box"].forEach(function (bad) {
  if (queueJs.indexOf(bad) >= 0) fail("desk-queue Pipes sheet still paints " + JSON.stringify(bad));
});
pass("desk-queue Pipes sheet no keys-on-box");


if (needs.indexOf("openPipesSheet") < 0) fail("desk-needs must own openPipesSheet (live Queue never loads desk-queue.js)");
if (needs.indexOf("Orange until a real pipe answers") < 0) fail("desk-needs Pipes sheet must say Orange until a real pipe answers");
else pass("desk-needs Pipes sheet orange until real pipe");
["keys sit on the box", "keys on the box"].forEach(function (bad) {
  if (needs.indexOf(bad) >= 0) fail("desk-needs Pipes sheet still paints " + JSON.stringify(bad));
});
pass("desk-needs Pipes sheet no keys-on-box");
if (needs.indexOf("queue-pipes-tap") < 0) fail("desk-needs must paint a Queue Pipes tap for empty / stranger Queue");
else pass("desk-needs Queue Pipes tap reaches sheet without a card");
if (nav.includes("desk-queue.js")) fail("desk-nav must not load desk-queue.js");
else pass("nav does not load desk-queue.js");

const histSrc = fs.readFileSync(path.join(root, "api/_history.js"), "utf8");
if (/Yes sends it off|Yes\/No card yet/.test(histSrc)) fail("_history needLine still paints Send / Yes-No");
if (histSrc.indexOf("Yes / Stop / Kill stay human") < 0) fail("_history needLine must name Yes / Stop / Kill");
else pass("_history needLine is Yes / Stop / Kill, not Yes sends");
if (!desk.includes("id=\"aia-wallet\"") || !desk.includes("id=\"desk-ais\"")) {
  fail("desk.html must keep wallet + desk-ais hosts");
}
pass("desk.html keeps tool hosts");

if (!/"\/queue"/.test(vercel) || !/destination": "\/desk\.html"/.test(vercel)) {
  fail("vercel.json must rewrite /queue to desk");
}
pass("/queue rewrites to desk");
let vercelJson;
try { vercelJson = JSON.parse(vercel); } catch (e) { fail("vercel.json must parse"); }
const queueRedirect = (vercelJson.redirects || []).find(function (r) { return r && r.source === "/queue"; });
if (!queueRedirect || queueRedirect.destination !== "/desk") {
  fail("vercel.json must redirect /queue to /desk so queue/index.html cannot win the filesystem");
}
pass("/queue redirects to /desk (beats queue/index.html)");
const queueHtml = fs.readFileSync(path.join(root, "queue/index.html"), "utf8");
if (queueHtml.indexOf("Sovereign Desk Queue Cockpit") < 0) fail("queue/index.html cockpit stub missing — leftover was that stub winning /queue");
else pass("local queue cockpit stub stays; public /queue is the desk");

if (yesNo.indexOf("check-queue-ux.js") < 0) fail("ACCOUNT-YES-NO must record queue UX");
pass("ACCOUNT-YES-NO records queue UX");
if (yesNo.indexOf("Queue Open / Stop leftover") < 0) fail("ACCOUNT-YES-NO must record the Queue Open / Stop leftover");
pass("ACCOUNT-YES-NO records Queue Open / Stop leftover");
if (yesNo.indexOf("Queue `/queue` leftover after that pass") < 0) fail("ACCOUNT-YES-NO must record the /queue alias leftover");
pass("ACCOUNT-YES-NO records /queue alias leftover");
if (yesNo.indexOf("Open Stop leftover after that pass") < 0) fail("ACCOUNT-YES-NO must record the Open Stop leftover");
pass("ACCOUNT-YES-NO records Open Stop leftover");
if (yesNo.indexOf("Queue empty / Status orange leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must record the Queue empty / Status orange leftover");
}
pass("ACCOUNT-YES-NO records Queue empty / Status orange leftover");
const packMd = fs.readFileSync(path.join(root, "PACK.md"), "utf8");
if (packMd.indexOf("Queue Open / Stop leftover") < 0) fail("PACK.md must record the Queue Open / Stop leftover");
pass("PACK.md records Queue Open / Stop leftover");
if (packMd.indexOf("Queue `/queue` leftover:") < 0) fail("PACK.md must record the /queue alias leftover");
pass("PACK.md records /queue alias leftover");
if (packMd.indexOf("Open Stop leftover:") < 0) fail("PACK.md must record the Open Stop leftover");
pass("PACK.md records Open Stop leftover");
if (packMd.indexOf("Queue empty / Status orange leftover:") < 0) fail("PACK.md must record the Queue empty / Status orange leftover");
pass("PACK.md records Queue empty / Status orange leftover");

if (desk.indexOf("function queueEmptyHtml") < 0) fail("desk.html must own queueEmptyHtml");
// d234a7e / 642a5fd / 2c6c719 / bc1d7fe (#334) tightened empty-queue copy.
// No-desk stays empty until you open a desk; an open desk still says
// Drop or Create a card. help.html keeps "Queue does not invent Yes / Stop cards."
function deskEmptyFaults(src) {
  const bad = [];
  if (src.indexOf("Open a desk. The queue stays empty until you do.") < 0) {
    bad.push("no-desk empty drifted");
  }
  if (src.indexOf("Nothing here yet. Drop or Create a card.") < 0) {
    bad.push("open-empty drifted");
  }
  return bad;
}
(function () {
  const bad = deskEmptyFaults(desk);
  if (bad.length) fail("desk.html empty must stay honest: " + bad.join("; "));
})();
if (desk.indexOf("Nothing here yet. Drop anything") >= 0) {
  fail("desk.html must not lump stranger + empty as Drop anything / Add a rule");
}
if (desk.indexOf("filters.hidden = true") < 0) fail("desk.html must hide Cap · orange on no desk");
if (desk.indexOf("#queue-filters[hidden]") < 0) fail("desk.html must force-hide Cap · orange when hidden (display:flex beats the attribute)");
if (!/id="queue-filters" hidden/.test(desk)) fail("desk.html Cap · orange must start hidden until a desk is open");
pass("desk.html Queue empty is honest");

if (queueJs.indexOf("queueEmptyHtml") < 0) fail("desk-queue leftover must reuse queueEmptyHtml");
if (queueJs.indexOf("Nothing here yet.") >= 0) fail("desk-queue leftover must not clobber empty with Nothing here yet");
pass("desk-queue leftover empty stays honest");

const packs = fs.readFileSync(path.join(root, "desk-queue-packs.js"), "utf8");
if (packs.indexOf("queueEmptyHtml") < 0) fail("desk-queue-packs must reuse queueEmptyHtml on all / no-desk");
if (packs.indexOf("bar.hidden = !here") < 0) fail("desk-queue-packs must hide pack chips on no desk");
if (packs.indexOf("box.hidden = !here") < 0) fail("desk-queue-packs must start pack chips hidden on no desk");
if (packs.indexOf("Nothing on this queue yet. Drop anything. Find a pack.") >= 0) {
  fail("desk-queue-packs must not clobber no-desk empty with Find a pack / Add a rule");
}
pass("desk-queue-packs empty stays honest");

if (needs.indexOf("Nothing on the Cap. Orange means do this first") < 0) {
  fail("desk-needs Cap empty must name orange do-this-first, not Collect");
}
if (needs.indexOf("Open a desk first. Queue does not invent a Cap.") < 0) {
  fail("desk-needs Cap tap on no desk must stay honest");
}
pass("desk-needs Cap · orange empty is honest");

if (ux.indexOf("if (!here)") < 0) fail("desk-queue-ux must hide metrics on no desk");
pass("desk-queue-ux hides metrics on no desk");

const more = fs.readFileSync(path.join(root, "more.html"), "utf8");
if (more.indexOf("Empty stays empty") < 0) fail("more.html Queue must say empty stays empty");
else pass("more.html Queue empty stays empty");
const help = fs.readFileSync(path.join(root, "help.html"), "utf8");
if (help.indexOf("Queue does not invent Yes / Stop cards") < 0) {
  fail("help.html First day Queue must keep empty honesty");
}
pass("help.html First day Queue empty is honest");
const tips = fs.readFileSync(path.join(root, "aia-tip.js"), "utf8");
// a66b146 shortened more-queue. Cap orange honesty stays on the Cap empty
// face in desk-needs. The tip still names empty stays empty, Talk / Yes / Stop,
// and that nothing sends from here.
function moreQueueTipFaults(src) {
  const slice = src.slice(src.indexOf('"more-queue"'), src.indexOf('"more-drop"') < 0 ? src.length : src.indexOf('"more-drop"'));
  const bad = [];
  if (slice.indexOf("Empty stays empty") < 0) bad.push("missing Empty stays empty");
  if (slice.indexOf("Talk, Yes, or Stop") < 0) bad.push("missing Talk, Yes, or Stop");
  if (slice.indexOf("Nothing sends from here.") < 0) bad.push("missing Nothing sends from here");
  return bad;
}
(function () {
  const bad = moreQueueTipFaults(tips);
  if (bad.length) fail("more-queue tip must stay honest: " + bad.join("; "));
})();
pass("more-queue tip names empty honesty and nothing sends");

const card = fs.readFileSync(path.join(root, "desk-card.js"), "utf8");
if (card.indexOf("function wantJobId") < 0 || card.indexOf("function openWantedJob") < 0 || card.indexOf("get(\"job\")") < 0) {
  fail("desk-card.js must honor /desk?job= from Create / Drop");
}
if (card.indexOf("That card is not on this queue") < 0) fail("desk-card.js missing-card ?job= must stay honest");
if (card.indexOf("__aiaOpenedJob") < 0) fail("desk-card.js must open ?job= once, not every 20s refresh");
pass("desk-card.js honors /desk?job= once");
if (needs.indexOf("openWantedJob") < 0) fail("desk-needs wrapLoad must open the wanted card after paint");
if (needs.indexOf("q-wanted") < 0) fail("desk-needs must teal-mark the wanted card");
pass("desk-needs opens and marks the wanted card");
if (more.indexOf("Open this card") < 0) fail("more.html Create must name Open this card");
else pass("more.html Create names Open this card");
if (help.indexOf("Yes puts a card on the queue. Open this card.") < 0) {
  fail("help.html First day Create must name Open this card");
}
pass("help.html First day Create names Open this card");
if (tips.indexOf("Yes puts a card on the queue. Open this card.") < 0) {
  fail("more-create tip names Open this card");
}
pass("more-create tip names Open this card");
if (yesNo.indexOf("Create → Queue handoff leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must record the Create → Queue handoff leftover");
}
pass("ACCOUNT-YES-NO records Create → Queue handoff leftover");
if (packMd.indexOf("Create → Queue handoff leftover:") < 0) {
  fail("PACK.md must record the Create → Queue handoff leftover");
}
pass("PACK.md records Create → Queue handoff leftover");
if (more.indexOf("not P1") >= 0 || more.indexOf("draft key") >= 0 || more.indexOf("XAI_API_KEY") >= 0) {
  fail("more.html must not name P1 / draft key / XAI_API_KEY");
}
if (more.indexOf("A Desk AI can't draft on this phone yet.") < 0) {
  fail("more.html drafts-off must use Desk AI voice");
}
pass("more.html drafts-off uses Desk AI voice");
if (tips.indexOf("not P1") >= 0) fail("more-status tip must not name P1");
// a66b146 dropped HOLD / Collect jargon from more-status; orange still means wait.
function moreStatusTipFaults(src) {
  const bad = [];
  if (src.indexOf("Orange means wait.") < 0) bad.push("missing Orange means wait");
  return bad;
}
(function () {
  const bad = moreStatusTipFaults(tips);
  if (bad.length) fail("more-status tip must say Orange means wait: " + bad.join("; "));
})();
pass("more-status tip drops P1");
if (needs.indexOf("Grok drafted on the card") >= 0 || queueJs.indexOf("Grok drafted on the card") >= 0) {
  fail("Queue Ask must not say Grok drafted on the card");
}
if (needs.indexOf("A Desk AI drafted on the card") < 0 && needs.indexOf("A Desk AI can't draft on this phone yet.") < 0) {
  fail("Queue Ask must use Desk AI voice");
} else pass("Queue Ask uses Desk AI voice");
if (yesNo.indexOf("Counter Desk AI voice leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must record Counter Desk AI voice leftover");
} else pass("ACCOUNT-YES-NO records Counter Desk AI voice leftover");

const ctx = {
  window: {},
  document: {
    readyState: "complete",
    addEventListener: function () {},
    getElementById: function () { return null; },
    createElement: function () { return { id: "", textContent: "", style: {}, classList: { add: function () {}, remove: function () {}, toggle: function () {} } }; },
    head: { appendChild: function () {} },
    querySelectorAll: function () { return []; },
    documentElement: {}
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
if (thenCard.indexOf("q-face") < 0) fail("card missing q-face");
if (thenCard.indexOf("q-drawer") < 0) fail("card missing q-drawer");
if (thenCard.indexOf("q-state-") < 0) fail("card missing state class");
if (thenCard.indexOf("q-drag") < 0) fail("card missing drag handle");
if (thenCard.indexOf(">Yes<") < 0 || thenCard.indexOf(">Stop<") < 0) fail("HITL must stay on the card");
if (thenCard.indexOf("Then draft") < 0) fail("Then draft must stay on the card");
if (thenCard.indexOf("More on this card") < 0) fail("drawer summary missing");
pass("card face keeps HITL + Then; drawer holds more");

const flagCard = ctx.card({
  id: "j-ask",
  status: "waiting",
  title: "Missed call",
  kind: "call",
  outcome: "call",
  waitingOn: "info",
  why: "Need a number before this can go."
}, false);
if (flagCard.indexOf("q-state-flagged") < 0) fail("missing-info card must be flagged state");
if (flagCard.indexOf("q-prompt") < 0 || flagCard.indexOf(">Reply<") < 0) fail("prompt reply must stay on face");
pass("flagged state + prompt on face");

function stateClass(html) {
  const m = String(html || "").match(/q-state-(pending|running|flagged|cap|done)/);
  return m ? m[1] : "";
}
function stateLabel(html) {
  const m = String(html || "").match(/q-state-mark[\s\S]*?<span>([^<]+)<\/span>/);
  return m ? m[1].trim() : "";
}
if (stateClass(thenCard) !== "flagged" || stateLabel(thenCard) !== "Needs you" || thenCard.indexOf("Needs you") < 0) {
  fail("waiting Then card must paint Needs you");
}
if (stateClass(flagCard) !== "flagged" || stateLabel(flagCard) !== "Needs you") {
  fail("missing-info card must paint Needs you");
}
const doneCard = ctx.card({ id: "j-done", status: "shipped", title: "Sent it" }, false);
if (stateClass(doneCard) !== "done" || stateLabel(doneCard) !== "Done") {
  fail("shipped card must paint Done");
}
const workCard = ctx.card({ id: "j-out", status: "out", title: "Off desk" }, false);
if (stateClass(workCard) !== "running" || stateLabel(workCard) !== "Working") {
  fail("off-desk card must paint Working");
}
const capCard = ctx.card({ id: "j-cap", status: "waiting", title: "Owner call", priority: true, cap: true, draft: "Hold this." }, false);
if (stateClass(capCard) !== "cap" || stateLabel(capCard) !== "Cap") {
  fail("cap card must paint Cap");
}
const waitCard = ctx.card({ id: "j-pend", status: "new", title: "Queued" }, false);
if (stateClass(waitCard) !== "pending" || stateLabel(waitCard) !== "Waiting") {
  fail("plain card must paint Waiting");
}
pass("card state labels still paint Waiting / Working / Needs you / Cap / Done");

// Mutants for the replaced assertions. In-memory only.
function swap(s, from, to) { return s.indexOf(from) < 0 ? null : s.split(from).join(to); }
const MUTANTS = [
  ["cardState loses q-state- prefix", function () { const n = swap(needs, "q-state-", "q-st-"); return n && cardStateFaults(n); }],
  ["stateMark loses q-state-mark", function () { const n = swap(needs, "q-state-mark", "q-st-mark"); return n && cardStateFaults(n); }],
  ["cardState loses Waiting", function () { const n = swap(needs, 'pending:"Waiting"', 'pending:"Idle"'); return n && cardStateFaults(n); }],
  ["cardState loses Working", function () { const n = swap(needs, 'running:"Working"', 'running:"Busy"'); return n && cardStateFaults(n); }],
  ["cardState loses Needs you", function () { const n = swap(needs, 'flagged:"Needs you"', 'flagged:"Needs a look"'); return n && cardStateFaults(n); }],
  ["cardState loses Cap label", function () { const n = swap(needs, 'cap:"Cap"', 'cap:"Pin"'); return n && cardStateFaults(n); }],
  ["cardState loses Done", function () { const n = swap(needs, 'done:"Done"', 'done:"Finished"'); return n && cardStateFaults(n); }],
  ["desk taps line dropped", function () { const d = swap(desk, "You still tap Yes or Stop", "The queue runs itself"); return d && deskContractFaults(d); }],
  ["no-desk empty dropped", function () { const d = swap(desk, "Open a desk. The queue stays empty until you do.", "Open a desk to invent cards."); return d && deskEmptyFaults(d); }],
  ["open-empty dropped", function () { const d = swap(desk, "Nothing here yet. Drop or Create a card.", "Nothing here yet. Drop anything."); return d && deskEmptyFaults(d); }],
  ["more-queue tip drops Empty stays empty", function () { const t = swap(tips, "Empty stays empty", "Empty can fill itself"); return t && moreQueueTipFaults(t); }],
  ["more-queue tip drops Talk / Yes / Stop", function () { const t = swap(tips, "Talk, Yes, or Stop", "Talk, or send"); return t && moreQueueTipFaults(t); }],
  ["more-queue tip drops nothing sends", function () { const t = swap(tips, "Nothing sends from here.", "The queue may send from here."); return t && moreQueueTipFaults(t); }],
  ["more-status tip drops Orange means wait", function () { const t = swap(tips, "Orange means wait.", "Orange means go."); return t && moreStatusTipFaults(t); }]
];
let mutCaught = 0;
MUTANTS.forEach(function (m) {
  let out;
  try { out = m[1](); } catch (e) { out = ["threw " + e.message]; }
  if (out === null || out === false || out === undefined) fail("mutant does not apply: " + m[0]);
  else if (out.length) { mutCaught += 1; console.log("ok  mutant caught: " + m[0] + " (" + out[0] + ")"); }
  else fail("mutant survived: " + m[0]);
});
console.log("check-queue-ux mutants: " + mutCaught + "/" + MUTANTS.length + " caught");

console.log("check-queue-ux: ok");

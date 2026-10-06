#!/usr/bin/env node
// Card timeline: read-only, oldest first, only fields the card already stores.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const rel = "card-timeline.js";
if (!fs.existsSync(path.join(root, rel))) { fail("card-timeline.js missing"); process.exit(1); }
const src = read(rel);
const deskHtml = read("desk.html");
const deskCard = read("desk-card.js");
const historyHtml = read("history.html");

if (src.indexOf("window.AIACardTimeline") < 0) fail("card-timeline must expose window.AIACardTimeline");
else pass("exposes AIACardTimeline");
if (src.indexOf("What happened on this card") < 0) fail("timeline heading missing");
else pass("timeline heading");
if (src.indexOf("Nothing yet.") < 0) fail("empty card must say Nothing yet.");
else pass("Nothing yet.");
if (src.indexOf("textContent") < 0 || /innerHTML|insertAdjacentHTML|outerHTML/.test(src)) fail("timeline must write with textContent only");
else pass("textContent only");
if (/&[a-zA-Z#0-9]+;/.test(src)) fail("timeline must not carry HTML entities");
else pass("no HTML entities");

// Read-only: no store, no server call, no new buttons or human-control calls.
[/\bfetch\s*\(/, /\bapi\s*\(/, /XMLHttpRequest/, /localStorage/, /sessionStorage/, /setItem/, /\/api\//].forEach(function (re) {
  if (re.test(src)) fail("timeline must not read or write a store: " + re);
});
pass("no store / no server call");
if (/createElement\(\s*["']button["']\)|<button/.test(src)) fail("timeline must not add a button");
else pass("no new button");
if (/approveCard|startCard|confirmKill|\bkill\s*\(|\bship\s*\(|markCardApproved/.test(src)) fail("timeline must not call Yes / Start / Stop / Kill");
else pass("Yes / Stop / Kill stay human");
if (/\b(mesh|shared brain|charge|payout|Market)\b/i.test(src.replace(/Marked/g, ""))) fail("timeline must not name mesh, charges, payouts or Market");
else pass("no mesh / charge / Market words");

// Only fields the card already stores.
const allowed = ["createdAt", "from", "thread", "replies", "flow", "agentDraft", "grokAt", "doneAt", "doneHow", "priorityAt", "deskAi"];
const used = {};
(src.match(/\bcard\.([A-Za-z_]+)/g) || []).forEach(function (m) { used[m.slice(5)] = true; });
const extra = Object.keys(used).filter(function (k) { return allowed.indexOf(k) < 0; });
if (extra.length) fail("timeline reads fields outside the card: " + extra.join(", "));
else pass("card fields: " + Object.keys(used).sort().join(", "));
const api = ["api/jobs.js", "api/_fields.js", "api/_engine.js", "api/_handoff.js", "api/_grok.js", "api/_history.js"].map(read).join("\n");
const writes = {
  createdAt: /createdAt:/, thread: /job\.thread\.push\(\{ at:/, replies: /job\.replies = /, flow: /job\.flow = .*at:/,
  agentDraft: /job\.agentDraft = \{[^}]*at:/, grokAt: /job\.grokAt = /, doneAt: /job\.doneAt = /, doneHow: /job\.doneHow = /,
  priorityAt: /job\.priorityAt = /, deskAi: /job\.deskAi = /
};
Object.keys(used).forEach(function (k) {
  if (k === "from") return;
  if (!writes[k] || !writes[k].test(api)) fail("server does not already store " + k);
});
pass("every field read is already stored by the server");

// Mounted in the existing card views.
const tlAt = deskHtml.indexOf('src="card-timeline.js"');
const cardAt = deskHtml.indexOf('src="desk-card.js"');
if (tlAt < 0 || cardAt < 0 || tlAt > cardAt) fail("desk.html must load card-timeline.js before desk-card.js");
else pass("desk.html loads card-timeline.js");
if (deskCard.indexOf('id=\\"card-timeline-sheet\\"') < 0 || deskCard.indexOf('AIACardTimeline.mount("card-timeline-sheet", j)') < 0) fail("desk card sheet must mount the timeline");
else pass("desk card sheet mounts timeline");
if (historyHtml.indexOf('<div id="sheet-timeline"></div>') < 0 || historyHtml.indexOf('AIACardTimeline.mount("sheet-timeline",it)') < 0 || historyHtml.indexOf('src="card-timeline.js"') < 0) fail("history sheet must mount the timeline");
else pass("history sheet mounts timeline");

// Behaviour on fake cards.
const sandbox = { window: {}, document: {}, Date: Date, Math: Math, String: String, Array: Array, isNaN: isNaN };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const T = sandbox.window.AIACardTimeline;
if (!T || typeof T.events !== "function") { fail("events() missing"); }
else {
  if (T.events({}).length !== 0 || T.events(null).length !== 0) fail("empty card must have no events");
  else pass("empty card has no events");
  const card = {
    from: "drop",
    createdAt: "2026-10-01T10:00:00.000Z",
    thread: [
      { at: "2026-10-01T10:05:00.000Z", from: "grok", kind: "rec", text: "Draft text" },
      { at: "2026-10-01T10:02:00.000Z", from: "Sam", kind: "reply", text: "Friday works" },
      { from: "Sam", kind: "note", text: "No time on this one" },
      { at: "not a date", from: "Sam", kind: "note", text: "Bad time" }
    ],
    replies: [{ at: "2026-10-01T10:02:00.000Z", from: "Sam", text: "Friday works" }],
    flow: [{ step: "kill", at: "2026-10-01T11:00:00.000Z" }, { step: "qualify", at: "2026-10-01T10:30:00.000Z" }]
  };
  const ev = T.events(card);
  const labels = ev.map(function (e) { return e.label; });
  const want = ["You dropped this", "Sam replied", "Desk AI drafted a reply", "Stopped by a person (Kill). Nothing went out."];
  if (JSON.stringify(labels) !== JSON.stringify(want)) fail("events order / labels: " + JSON.stringify(labels));
  else pass("oldest first, plain labels, no made-up or untimed events");
  for (let i = 1; i < ev.length; i++) if (ev[i].at < ev[i - 1].at) fail("events not sorted oldest first");
}

if (failed) { console.error(failed + " failed"); process.exit(1); }
console.log("check-card-timeline ok");

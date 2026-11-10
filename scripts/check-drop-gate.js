#!/usr/bin/env node
"use strict";
require("./_env-guard");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

function fail(msg) {
  console.error("check-drop-gate: " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

// e939e95 fixed drop-preview gateSend so it no longer blocks Drop it on
// preview missing() fields (a due date) once a desk and title are set.
// send() itself is not title-field-only: the title falls back to the note
// (and custom-name / tell / implement). Empty and whitespace-only drops
// are blocked with "Say what you need." A photo or file alone is not
// enough — that is the source intent, not a regression. 1ec1382 moved
// send() from drop.html / widget.html into drop-app.js.

const src = read("drop-preview.js");
const app = read("drop-app.js");
const drop = read("drop.html");
const widget = read("widget.html");

const start = src.indexOf("function gateSend");
if (start < 0) fail("drop-preview.js missing gateSend");
else pass("drop-preview.js has gateSend");
const end = src.indexOf("function wrapFetch", start);
const fn = src.slice(start, end > start ? end : start + 800);

if (fn.indexOf("stopImmediatePropagation") < 0) {
  fail("gateSend must still stop a click that cannot send");
} else pass("gateSend stops a click that cannot send");
if (!/if\s*\(\s*card\.desk\s*&&\s*card\.title\s*\)\s*return/.test(fn)) {
  fail("gateSend must let Drop it run when desk and title are set");
} else pass("gateSend lets Drop it run when desk and title are set");
if (/if\s*\(\s*!miss\s*&&\s*card\.desk/.test(fn)) {
  fail("gateSend must not block Drop it on preview missing() fields");
} else pass("gateSend does not block on preview missing() fields");
if (fn.indexOf("Say what you need") < 0 || fn.indexOf("Pick a desk above") < 0) {
  fail("gateSend must show the same form error send() uses when it blocks");
} else pass("gateSend shows the same form error send() uses");

function sendFn(src) {
  const at = src.indexOf("async function send()");
  if (at < 0) return "";
  const stop = src.indexOf("function copyDropShare", at);
  return src.slice(at, stop > at ? stop : at + 2800);
}
function readCardFn(src) {
  const at = src.indexOf("function readCard");
  if (at < 0) return "";
  const stop = src.indexOf("function holdWhy", at);
  const alt = src.indexOf("\n  function ", at + 20);
  const end = [stop, alt].filter(function (n) { return n > at; }).sort(function (a, b) { return a - b; })[0];
  return src.slice(at, end || at + 1500);
}

function dropSendGateFaults(appSrc) {
  const bad = [];
  const send = sendFn(appSrc);
  if (!send) { bad.push("missing send()"); return bad; }
  // Title may be empty if a note (or custom-name / tell / implement) is present.
  if (!/\|\|\s*note\s*\|\|/.test(send) && send.indexOf("|| note ||") < 0) {
    bad.push("note-only drop blocked by the gate (title no longer falls back to note)");
  }
  if (/if\s*\(\s*!String\(\s*tell\s*\|\|\s*implement\)/.test(send) && !/if\s*\(\s*!String\(title\s*\|\|\s*tell\s*\|\|\s*implement\)/.test(send)) {
    bad.push("real title blocked");
  }
  const gate = send.match(/if\s*\(\s*!String\(title\s*\|\|\s*tell\s*\|\|\s*implement\)(\.trim\(\))?\s*\)/);
  if (!gate) {
    if (!bad.length) {
      bad.push("empty drop allowed through");
    }
    return bad;
  }
  if (!gate[1]) bad.push("whitespace title allowed through");
  if (send.indexOf("Say what you need") < 0) bad.push("send() must block an empty drop with Say what you need");
  // A fully empty / whitespace drop must still be blocked (the if (...) return must remain).
  const blocked = /if\s*\(\s*!String\(title\s*\|\|\s*tell\s*\|\|\s*implement\)\.trim\(\)\s*\)\s*\{[^}]*return;/.test(send);
  if (!blocked) bad.push("empty drop allowed through");
  if (/action:\s*["']ship["']|action:\s*["']start["']|action:\s*["']charge["']|action:\s*["']bind-ai["']/.test(send)) {
    bad.push("send() ships, starts, charges or binds before Yes");
  }
  return bad;
}

function dropReadCardFaults(previewSrc) {
  const bad = [];
  const card = readCardFn(previewSrc);
  if (!card) { bad.push("missing readCard"); return bad; }
  // card.title falls back to the note so a note-only drop is real content.
  if (!/val\("note"\)/.test(card) && card.indexOf('val("note")') < 0) {
    bad.push("readCard title no longer falls back to the note");
  }
  return bad;
}

["drop.html", "widget.html"].forEach(function (file) {
  const html = file === "drop.html" ? drop : widget;
  if (html.indexOf("drop-app.js") < 0) fail(file + " must load drop-app.js");
  else pass(file + " loads drop-app.js");
});

if (!sendFn(app)) fail("drop-app.js missing send()");
else pass("drop-app.js has send()");

(function () {
  const bad = dropSendGateFaults(app).concat(dropReadCardFaults(src));
  if (bad.length) fail("Drop gate must allow a title or note, and block empty/whitespace: " + bad.join("; "));
  else pass("send() allows a title or a note, blocks empty and whitespace with Say what you need");
})();

// Photo/file alone is not sufficient in either gate (source intent).
(function () {
  const send = sendFn(app);
  // The content gate keys off title|tell|implement (title may be the note). A photo alone is not enough.
  if (!/title\s*\|\|\s*tell\s*\|\|\s*implement/.test(send)) {
    fail("send() content gate must stay title || tell || implement (a photo alone is not enough)");
  } else pass("a photo-only drop stays blocked; title or note is required");
})();

function swap(str, from, to) { return str.indexOf(from) < 0 ? null : str.split(from).join(to); }

const GATE = 'if (!String(title || tell || implement).trim()) { showNote(err, agentOn ? "Paste the data to put on the desk." : "Say what you need."); return; }';
const TITLE = 'const title = document.getElementById("title").value || mapped.title || note || ((document.getElementById("custom-name") && document.getElementById("custom-name").value) || "");';

const MUTANTS = [
  ["empty drop allowed through", function () {
    const n = swap(app, GATE, "");
    return n ? dropSendGateFaults(n) : null;
  }],
  ["whitespace title allowed through", function () {
    const n = swap(app, "if (!String(title || tell || implement).trim())", "if (!String(title || tell || implement))");
    return n ? dropSendGateFaults(n) : null;
  }],
  ["note-only drop blocked by the gate", function () {
    const n = swap(app, TITLE, 'const title = document.getElementById("title").value || mapped.title || ((document.getElementById("custom-name") && document.getElementById("custom-name").value) || "");');
    return n ? dropSendGateFaults(n) : null;
  }],
  ["real title blocked", function () {
    const n = swap(app, "if (!String(title || tell || implement).trim())", "if (!String(tell || implement).trim())");
    return n ? dropSendGateFaults(n) : null;
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

if (process.exitCode) {
  console.error("check-drop-gate failed");
  process.exit(1);
}
console.log("check-drop-gate mutants: " + mutCaught + "/" + MUTANTS.length + " caught");
console.log("check-drop-gate: ok");

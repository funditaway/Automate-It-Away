#!/usr/bin/env node
"use strict";

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

["q-state-", "q-drawer", "q-face", "q-drag", "More on this card", "cardState", "stateMark"].forEach(function (bit) {
  if (needs.indexOf(bit) < 0) fail("desk-needs.js missing " + bit);
});
pass("desk-needs paints calm card face + drawer");

["cap-drop", "pinCap", "q-state-pending", "q-state-flagged", "desk-tools", "queue-desk-rail", "Tap or drag to Cap", "closest(\"#queue .q-drag\")"].forEach(function (bit) {
  if (ux.indexOf(bit) < 0) fail("desk-queue-ux.js missing " + bit);
});
pass("desk-queue-ux has Cap drag + chrome fold");

if (!nav.includes("desk-queue-ux.js")) fail("desk-nav.js must load desk-queue-ux.js");
pass("nav loads queue ux");

if (!desk.includes("id=\"queue\"") || !desk.includes("Taps match what the card needs")) {
  fail("desk.html queue contract drifted");
}
pass("desk.html queue host intact");
if (!desk.includes("id=\"aia-wallet\"") || !desk.includes("id=\"desk-ais\"")) {
  fail("desk.html must keep wallet + desk-ais hosts");
}
pass("desk.html keeps tool hosts");

if (!/"\/queue"/.test(vercel) || !/destination": "\/desk\.html"/.test(vercel)) {
  fail("vercel.json must rewrite /queue to desk");
}
pass("/queue rewrites to desk");

if (yesNo.indexOf("check-queue-ux.js") < 0) fail("ACCOUNT-YES-NO must record queue UX");
pass("ACCOUNT-YES-NO records queue UX");

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

console.log("check-queue-ux: ok");

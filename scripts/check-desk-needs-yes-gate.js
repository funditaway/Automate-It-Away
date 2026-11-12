#!/usr/bin/env node
"use strict";
require("./_env-guard");

// Early path on desk-needs.js must respect needs: no Yes until every needed
// field is there (missing is empty). decide:true still adds Yes when missing
// is empty. Painted cards must name what is missing with existing wording.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const vm = require("vm");

const root = path.join(__dirname, "..");
const DESK_PIN_SIZE = 35485;
const DESK_PIN_SHA = "d84ad086270c2abf2e20e101488976b1db7abf82db0bef5d14747c83a749f8db";

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const needsSrc = read("desk-needs.js");
const deskSrc = read("desk.html");
const pkg = read("package.json");

const syntax = spawnSync(process.execPath, ["--check", path.join(root, "desk-needs.js")], { encoding: "utf8" });
if (syntax.status !== 0) fail("desk-needs.js must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
else pass("desk-needs.js parses");

const deskBuf = fs.readFileSync(path.join(root, "desk.html"));
const deskSha = crypto.createHash("sha256").update(deskBuf).digest("hex");
if (deskBuf.length !== DESK_PIN_SIZE || deskSha !== DESK_PIN_SHA) {
  fail("desk.html pin moved: size " + deskBuf.length + " sha256 " + deskSha);
} else pass("desk.html pin is unchanged");

if (pkg.indexOf("node scripts/check-desk-needs-yes-gate.js") < 0) {
  fail("npm test must run check-desk-needs-yes-gate");
} else pass("npm test runs check-desk-needs-yes-gate");

function loadNeeds(src) {
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
    localStorage: { getItem: function () { return ""; }, setItem: function () {} },
    sessionStorage: { getItem: function () { return ""; }, setItem: function () {} }
  };
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  if (typeof ctx.cardNeeds !== "function" || typeof ctx.card !== "function") {
    throw new Error("desk-needs.js must export cardNeeds and card");
  }
  return ctx;
}

function hasYes(actions) {
  return (actions || []).some(function (a) { return a && a.id === "yes"; });
}

function hasStart(actions) {
  return (actions || []).some(function (a) { return a && a.id === "start"; });
}

function paintsYes(html) {
  return />Yes</.test(html) || /class="go q-yes"/.test(html);
}

function paintsStart(html) {
  return />Start</.test(html) || /class="go q-start"/.test(html) || /startCard\(/.test(html);
}

function startOnMissed(actions, html) {
  return hasStart(actions) || paintsStart(html || "");
}

function presentMissed(extra) {
  const base = {
    id: "j-miss",
    status: "waiting",
    title: "Missed call",
    kind: "call",
    outcome: "call",
    needs: [
      { id: "open", label: "Open" },
      { id: "start", label: "Start" },
      { id: "fill", label: "Add phone" },
      { id: "ask", label: "Ask for number" },
      { id: "cap", label: "Cap" }
    ],
    needLine: "Need a number before this can go.",
    missing: ["phone"],
    decide: true,
    priority: false
  };
  return Object.assign(base, extra || {});
}

function presentReady() {
  return {
    id: "j-ready",
    status: "waiting",
    title: "Oak dresser",
    kind: "list",
    draft: "List the oak dresser.",
    photoUrl: "/x.jpg",
    needs: [
      { id: "open", label: "Open" },
      { id: "yes", label: "Yes" },
      { id: "stop", label: "Stop" },
      { id: "kill", label: "Kill" },
      { id: "cap", label: "Cap" }
    ],
    needLine: "Ready. Yes / Stop / Kill stay human.",
    missing: [],
    decide: true,
    priority: false
  };
}

function presentDecideNoYesAction() {
  return {
    id: "j-decide",
    status: "waiting",
    title: "Ready to send",
    kind: "list",
    draft: "Send the note.",
    photoUrl: "/y.jpg",
    needs: [
      { id: "open", label: "Open" },
      { id: "cap", label: "Cap" }
    ],
    needLine: "Ready. Yes / Stop / Kill stay human.",
    missing: [],
    decide: true,
    priority: false
  };
}

function presentNeedsHasYesAndMissing() {
  return presentMissed({
    id: "j-stale-yes",
    decide: false,
    needs: [
      { id: "open", label: "Open" },
      { id: "yes", label: "Yes" },
      { id: "start", label: "Start" },
      { id: "fill", label: "Add phone" },
      { id: "cap", label: "Cap" }
    ]
  });
}

function presentNeedsHasStartAndMissing() {
  return presentMissed({
    id: "j-stale-start",
    decide: false,
    needs: [
      { id: "open", label: "Open" },
      { id: "start", label: "Start" },
      { id: "fill", label: "Add phone" },
      { id: "cap", label: "Cap" }
    ]
  });
}

function presentMissingNoLine() {
  return presentMissed({
    id: "j-noline",
    needLine: "",
    next: "",
    decide: false
  });
}

function gateFaults(src) {
  const bad = [];
  let ctx;
  try { ctx = loadNeeds(src); }
  catch (e) { return ["desk-needs.js failed to load: " + (e && e.message || e)]; }

  const missed = presentMissed();
  const missedNeeds = ctx.cardNeeds(missed, false);
  const missedPaint = ctx.card(missed, false);
  if (hasYes(missedNeeds.actions) || paintsYes(missedPaint)) {
    bad.push("early Yes is shown while a number is missing");
  }
  if (startOnMissed(missedNeeds.actions, missedPaint)) {
    bad.push("Start remains while a number is missing");
    bad.push("Start is injected while a number is missing");
  }
  if (!/Need a number before this can go/.test(missedNeeds.line || "") && !/Need a number before this can go/.test(missedPaint)) {
    bad.push("missing-number card must name the number");
  }
  if (!missedNeeds.missing || missedNeeds.missing.indexOf("phone") < 0) {
    bad.push("missing is ignored");
  }

  const stale = presentNeedsHasYesAndMissing();
  const staleNeeds = ctx.cardNeeds(stale, false);
  const stalePaint = ctx.card(stale, false);
  if (hasYes(staleNeeds.actions) || paintsYes(stalePaint)) {
    if (bad.indexOf("missing is ignored") < 0) bad.push("missing is ignored");
  }
  if (startOnMissed(staleNeeds.actions, stalePaint)) {
    bad.push("Start remains while a number is missing");
    bad.push("Start is injected while a number is missing");
  }

  const staleStart = presentNeedsHasStartAndMissing();
  const staleStartNeeds = ctx.cardNeeds(staleStart, false);
  const staleStartPaint = ctx.card(staleStart, false);
  if (startOnMissed(staleStartNeeds.actions, staleStartPaint)) {
    bad.push("Start remains while a number is missing");
    bad.push("Start is injected while a number is missing");
  }
  if (hasYes(staleStartNeeds.actions) || paintsYes(staleStartPaint)) {
    bad.push("early Yes is shown while a number is missing");
  }

  const decideMiss = presentMissed({ id: "j-decide-miss", decide: true });
  const decideMissNeeds = ctx.cardNeeds(decideMiss, false);
  const decideMissPaint = ctx.card(decideMiss, false);
  if (hasYes(decideMissNeeds.actions) || paintsYes(decideMissPaint)) {
    bad.push("gate is bypassed via decide");
  }
  if (startOnMissed(decideMissNeeds.actions, decideMissPaint)) {
    bad.push("Start remains while a number is missing");
    bad.push("Start is injected while a number is missing");
  }

  const ready = presentReady();
  const readyNeeds = ctx.cardNeeds(ready, false);
  const readyPaint = ctx.card(ready, false);
  if (!hasYes(readyNeeds.actions) || !/>Yes</.test(readyPaint)) {
    bad.push("ready card lost Yes");
  }

  const inject = presentDecideNoYesAction();
  const injectNeeds = ctx.cardNeeds(inject, false);
  const injectPaint = ctx.card(inject, false);
  if (!hasYes(injectNeeds.actions) || !/>Yes</.test(injectPaint)) {
    bad.push("decide:true no longer adds Yes when missing is empty");
  }

  const noLine = presentMissingNoLine();
  const noLineNeeds = ctx.cardNeeds(noLine, false);
  const noLinePaint = ctx.card(noLine, false);
  if (hasYes(noLineNeeds.actions) || paintsYes(noLinePaint)) bad.push("early Yes is shown while a number is missing");
  if (startOnMissed(noLineNeeds.actions, noLinePaint)) {
    bad.push("Start remains while a number is missing");
    bad.push("Start is injected while a number is missing");
  }
  if (!/Need a number before this can go/.test(noLineNeeds.line || "")) {
    bad.push("missing fields must reuse Need … before this can go");
  }

  // Local path (no needs array) must still withhold Yes on a missed call.
  const localMiss = ctx.cardNeeds({
    id: "j-local",
    status: "waiting",
    title: "Missed call",
    kind: "call",
    outcome: "call"
  }, false);
  if (hasYes(localMiss.actions)) bad.push("local path shows Yes while a number is missing");
  if (hasStart(localMiss.actions)) bad.push("local path shows Start while a number is missing");
  if (!localMiss.missing || localMiss.missing.indexOf("phone") < 0) {
    bad.push("local path ignored missing");
  }

  return bad;
}

const live = gateFaults(needsSrc);
if (live.length) fail("yes gate failed: " + live.join("; "));
else pass("early path withholds Yes until missing is empty");

const liveCtx = loadNeeds(needsSrc);
const missedPaint = liveCtx.card(presentMissed(), false);
if (paintsYes(missedPaint)) {
  fail("painted missed-call card still has a Yes button");
} else pass("painted missed-call card has no Yes button");
if (!/Need a number before this can go/.test(missedPaint) || missedPaint.indexOf("Nothing sent alone") < 0) {
  fail("painted missed-call card must keep Need a number before this can go / Nothing sent alone");
} else pass("painted missed-call card names the missing number");
if (paintsStart(missedPaint)) {
  fail("painted missed-call card still has a Start button");
} else pass("painted missed-call card has no Start button");

const staleStartLive = liveCtx.card(presentNeedsHasStartAndMissing(), false);
const staleStartLiveNeeds = liveCtx.cardNeeds(presentNeedsHasStartAndMissing(), false);
if (startOnMissed(staleStartLiveNeeds.actions, staleStartLive) || paintsYes(staleStartLive)) {
  fail("stale Start on a missed-call card must be stripped; no Yes or Start without a human Yes");
} else pass("stale Start on a missed-call card is stripped");

const readyPaint = liveCtx.card(presentReady(), false);
if (!/>Yes</.test(readyPaint) || !/>Stop</.test(readyPaint) || !/>Kill</.test(readyPaint)) {
  fail("ready decide card must still paint Yes / Stop / Kill");
} else pass("decide:true still paints Yes when missing is empty");

function applyMutant(src, kind) {
  if (kind === "early Yes is shown while a number is missing") {
    // Revert the gate: no strip, decide:true always injects Yes.
    return src
      .replace("if(o.length){for(let e=n.length-1;e>=0;e--)n[e]&&(\"yes\"===n[e].id||\"start\"===n[e].id)&&n.splice(e,1)}", "")
      .replace("if(i&&!o.length){", "if(i){");
  }
  if (kind === "missing is ignored") {
    return src.replace(
      "o=Array.isArray(e.missing)?e.missing.slice():[]",
      "o=[]"
    );
  }
  if (kind === "gate is bypassed via decide") {
    // After the gate, decide:true still unshifts Yes even when missing is set.
    return src.replace(
      "if(i&&!o.length){",
      "if(i){if(o.length){n.some((function(e){return e&&\"yes\"===e.id}))||n.unshift({id:\"yes\",label:\"Yes\"})}if(!o.length){"
    ).replace(
      "t||n.some((function(e){return e&&\"yes\"===e.id}))||n.some((function(e){return e&&\"start\"===e.id}))||n.unshift({id:\"yes\",label:\"Yes\"})}",
      "t||n.some((function(e){return e&&\"yes\"===e.id}))||n.some((function(e){return e&&\"start\"===e.id}))||n.unshift({id:\"yes\",label:\"Yes\"})}}"
    );
  }
  if (kind === "Start remains while a number is missing") {
    // Drop Yes but keep Start — the mutant Probe found surviving.
    return src.replace(
      "n[e]&&(\"yes\"===n[e].id||\"start\"===n[e].id)&&n.splice(e,1)",
      "n[e]&&(\"yes\"===n[e].id)&&n.splice(e,1)"
    );
  }
  if (kind === "Start is injected while a number is missing") {
    return src.replace(
      "if(o.length){for(let e=n.length-1;e>=0;e--)n[e]&&(\"yes\"===n[e].id||\"start\"===n[e].id)&&n.splice(e,1)}",
      "if(o.length){for(let e=n.length-1;e>=0;e--)n[e]&&(\"yes\"===n[e].id||\"start\"===n[e].id)&&n.splice(e,1);n.unshift({id:\"start\",label:\"Start\"})}"
    );
  }
  if (kind === "local path shows Start while a number is missing") {
    return src.replace(
      "o.length?(q(\"fill\",\"Add \"+o[0]),q(\"ask\",\"Ask for more\")):f&&(m(e.id)?q(\"start\",\"Start\"):q(\"yes\",\"Yes\")",
      "o.length?(q(\"fill\",\"Add \"+o[0]),q(\"ask\",\"Ask for more\"),q(\"start\",\"Start\")):f&&(m(e.id)?q(\"start\",\"Start\"):q(\"yes\",\"Yes\")"
    );
  }
  return src;
}

const mutants = [
  "early Yes is shown while a number is missing",
  "missing is ignored",
  "gate is bypassed via decide",
  "Start remains while a number is missing",
  "Start is injected while a number is missing",
  "local path shows Start while a number is missing"
];
let caught = 0;
mutants.forEach(function (kind) {
  const next = applyMutant(needsSrc, kind);
  if (next === needsSrc) {
    fail("mutant does not apply: " + kind);
    return;
  }
  const faults = gateFaults(next);
  if (faults.indexOf(kind) < 0) {
    fail("mutant missed: " + kind + " (got " + JSON.stringify(faults) + ")");
  } else {
    caught += 1;
    pass("mutant caught: " + kind);
  }
});
if (caught !== mutants.length) fail("mutants: " + caught + "/" + mutants.length + " caught");
else pass("mutants: " + caught + "/" + mutants.length + " caught");

if (process.exitCode) {
  console.error("check-desk-needs-yes-gate failed");
  process.exit(1);
}
console.log("check-desk-needs-yes-gate passed");

#!/usr/bin/env node
"use strict";
require("./_env-guard");
// Card-face next-line tail in desk-needs.js must match the engine:
// ". Nothing sent alone." with no bare "HOLD." in the append.
// A line that already has "nothing sent" must not get the tail again.
// Collect stays HOLD.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const ENGINE_TAIL = ". Nothing sent alone.";
const OLD_TAIL = ". HOLD. Nothing sent alone.";

function fail(msg) {
  console.error("check-desk-needs-tail: " + msg);
  process.exit(1);
}

function nextHelper(src) {
  const start = String(src || "").indexOf("function I(e,t){");
  if (start < 0) return "";
  const end = src.indexOf("}function C(", start);
  return end > start ? src.slice(start, end + 1) : src.slice(start, start + 900);
}

function appendTails(helper) {
  const out = [];
  const re = /\.replace\(\/\\\.\\s\*\$\/,""\)\+"([^"]*)"/g;
  let m;
  while ((m = re.exec(String(helper || "")))) out.push(m[1]);
  return out;
}

function engineTails(engineSrc) {
  const out = [];
  const re = /\.replace\(\/\\\.\\s\*\$\/,\s*""\) \+ "([^"]*)"/g;
  let m;
  while ((m = re.exec(String(engineSrc || "")))) out.push(m[1]);
  return out;
}

function decode(html) {
  return String(html || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#96;/g, "`");
}

function nextLineOf(html) {
  const m = String(html || "").match(/<p class="next-line">([\s\S]*?)<\/p>/);
  return m ? decode(m[1]) : "";
}

function loadCard(src) {
  const ctx = {
    window: {},
    document: {
      readyState: "complete",
      addEventListener: function () {},
      getElementById: function () { return null; },
      createElement: function () { return { id: "", textContent: "", setAttribute: function () {} }; },
      head: { appendChild: function () {} },
      querySelector: function () { return null; }
    },
    setTimeout: function () {},
    localStorage: { getItem: function () { return ""; }, setItem: function () {} },
    sessionStorage: { getItem: function () { return ""; }, setItem: function () {} }
  };
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  if (typeof ctx.card !== "function") throw new Error("desk-needs.js must set window.card");
  return function (job) { return ctx.card(job, false); };
}

function countNothingSentAlone(text) {
  const matches = String(text || "").match(/nothing sent alone/gi);
  return matches ? matches.length : 0;
}

function faults(needsSrc, engineSrc) {
  const bad = [];
  const helper = nextHelper(needsSrc);
  if (!helper) bad.push("next-line helper I(e,t) is missing");

  const tails = appendTails(helper);
  if (!tails.length) bad.push("next-line helper has no append tail");
  tails.forEach(function (t) {
    if (t !== ENGINE_TAIL) bad.push("next-line tail differs from the engine: " + JSON.stringify(t));
    if (/\bHOLD\./.test(t) || t.indexOf("HOLD.") >= 0) bad.push("appended tail has HOLD.");
  });

  const fromEngine = engineTails(engineSrc);
  if (!fromEngine.length) bad.push("engine next-step tail is missing");
  fromEngine.forEach(function (t) {
    if (t !== ENGINE_TAIL) bad.push("engine tail is not " + JSON.stringify(ENGINE_TAIL) + ": " + JSON.stringify(t));
  });
  if (helper && helper.indexOf(OLD_TAIL) >= 0) bad.push("appended tail has HOLD.");
  if (helper && /\+"\. HOLD\./.test(helper)) bad.push("appended tail has HOLD.");

  let card;
  try { card = loadCard(needsSrc); }
  catch (e) { bad.push((e && e.message) || String(e)); return bad; }

  const plain = nextLineOf(card({
    id: "j-plain",
    status: "waiting",
    title: "They clicked"
  }));
  if (!plain) bad.push("plain card has no next-line");
  else {
    if (!plain.endsWith("Nothing sent alone.")) {
      bad.push('plain next-line must end with "Nothing sent alone." (got ' + JSON.stringify(plain) + ")");
    }
    if (/\bHOLD\./i.test(plain) || /(^|[^A-Za-z])HOLD([^A-Za-z]|$)/i.test(plain)) {
      bad.push("plain next-line has bare HOLD from the append path: " + JSON.stringify(plain));
    }
    if (countNothingSentAlone(plain) !== 1) {
      bad.push("plain next-line must say Nothing sent alone once: " + JSON.stringify(plain));
    }
  }

  const already = "Ready. Nothing sent alone.";
  const kept = nextLineOf(card({
    id: "j-kept",
    status: "waiting",
    title: "They clicked",
    next: already
  }));
  if (kept !== already) {
    bad.push("line that already ends with Nothing sent alone. must not get a doubled tail: " + JSON.stringify(kept));
  }
  if (countNothingSentAlone(kept) !== 1) {
    bad.push("already-tailed line was doubled: " + JSON.stringify(kept));
  }

  const holdIn = "Human send HOLD.";
  const holdOut = nextLineOf(card({
    id: "j-hold",
    status: "waiting",
    title: "They clicked",
    next: holdIn
  }));
  if (holdOut !== "Human send HOLD. Nothing sent alone.") {
    bad.push("line that already says HOLD must only gain the engine tail: " + JSON.stringify(holdOut));
  }
  if ((holdOut.match(/HOLD\./g) || []).length !== 1) {
    bad.push("append path must not add another HOLD. : " + JSON.stringify(holdOut));
  }

  const lower = nextLineOf(card({
    id: "j-lower",
    status: "waiting",
    title: "They clicked",
    next: "Ready. nothing sent alone."
  }));
  if (countNothingSentAlone(lower) !== 1 || /nothing sent alone\.\s*Nothing sent alone/i.test(lower)) {
    bad.push("case-insensitive existing tail must not be doubled: " + JSON.stringify(lower));
  }

  return bad;
}

function mutantHold(src) {
  const helper = nextHelper(src);
  if (!helper) return null;
  if (helper.indexOf(ENGINE_TAIL) < 0) return null;
  const next = helper.replace(
    'n=n.replace(/\\.\\s*$/,"")+"' + ENGINE_TAIL + '"',
    'n=n.replace(/\\.\\s*$/,"")+"' + OLD_TAIL + '"'
  );
  if (next === helper || next.indexOf(OLD_TAIL) < 0) return null;
  return src.split(helper).join(next);
}

function mutantDouble(src) {
  const helper = nextHelper(src);
  if (!helper) return null;
  const needle = "/nothing sent/i.test(n)||(n=n.replace(/\\.\\s*$/,\"\")+\"" + ENGINE_TAIL + "\")";
  const next = helper.split(needle).join("n=n.replace(/\\.\\s*$/,\"\")+\"" + ENGINE_TAIL + "\"");
  if (next === helper) return null;
  return src.split(helper).join(next);
}

const needsPath = path.join(root, "desk-needs.js");
const enginePath = path.join(root, "api", "_engine.js");
const src = fs.readFileSync(needsPath, "utf8");
const engineSrc = fs.readFileSync(enginePath, "utf8");

const live = faults(src, engineSrc);
if (live.length) {
  live.forEach(function (m) { console.error("FAIL " + m); });
  process.exit(1);
}
console.log('ok  card-face next-line tail is ". Nothing sent alone."');
console.log("ok  appended tail has no HOLD.");
console.log("ok  existing Nothing sent alone. is not doubled");

const holdMut = mutantHold(src);
if (!holdMut) fail("HOLD. mutant does not apply");
const holdBad = faults(holdMut, engineSrc);
if (!holdBad.length) fail("HOLD. mutant survived");
if (!holdBad.some(function (m) { return /HOLD/.test(m); })) {
  fail("HOLD. mutant was not caught for the append tail: " + holdBad.join("; "));
}
console.log("ok  mutant caught: bare HOLD. put back (" + holdBad[0] + ")");

const dblMut = mutantDouble(src);
if (!dblMut) fail("doubled-tail mutant does not apply");
const dblBad = faults(dblMut, engineSrc);
if (!dblBad.length) fail("doubled-tail mutant survived");
if (!dblBad.some(function (m) { return /doubl/i.test(m); })) {
  fail("doubled-tail mutant was not caught: " + dblBad.join("; "));
}
console.log("ok  mutant caught: doubled tail (" + dblBad[0] + ")");
console.log("check-desk-needs-tail: ok (2 mutants caught)");

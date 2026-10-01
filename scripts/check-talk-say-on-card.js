#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");

function fail(msg) {
  console.error("check-talk-say-on-card: " + msg);
  process.exit(1);
}

const needsPath = path.join(root, "desk-needs.js");
const cardPath = path.join(root, "desk-card.js");
if (!fs.existsSync(needsPath)) fail("desk-needs.js missing");
if (!fs.existsSync(cardPath)) fail("desk-card.js missing");

const needs = fs.readFileSync(needsPath, "utf8");
const card = fs.readFileSync(cardPath, "utf8");

["desk-needs.js", "desk-card.js"].forEach(function (name) {
  const syntax = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
  if (syntax.status !== 0) fail(name + " must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
});

["function promptHtml", "function replyOnCard", "function talkOnCard", "function sayOnCard", "q-prompt", "q-reply-box", "q-talk-say", "Talk · Say · Reply", "Nothing sent alone", "action: \"reply\""].forEach(function (bit) {
  if (needs.indexOf(bit) < 0) fail("desk-needs missing " + bit);
});

if (needs.indexOf(">Reply<") < 0 && needs.indexOf(">Reply</button>") < 0) {
  fail("prompt must keep Reply tap");
}
if (needs.indexOf(">Talk<") < 0 && needs.indexOf('">Talk</button>') < 0) {
  fail("prompt must paint Talk tap");
}
if (needs.indexOf(">Say<") < 0 && needs.indexOf('">Say</button>') < 0) {
  fail("prompt must paint Say tap");
}
if (!/Talk \/ Say \/ Reply stays on the card|Reply stays on the card/.test(needs)) {
  fail("prompt HOLD must say stays on the card");
}
if (/onchange\s*=\s*["']bindAiOnCard|onchange=\\"bindAiOnCard/.test(needs)) {
  fail("desk-needs must not silent-bind onchange=bindAiOnCard");
}
if (needs.indexOf("function approveCard") < 0 && needs.indexOf("async function approveCard") < 0) {
  fail("must keep approveCard from #255");
}
if (needs.indexOf("function startCard") < 0) fail("must keep startCard from #255");
if (needs.indexOf("q-start") < 0) fail("must keep q-start from #255");
if (needs.indexOf("isCardApproved") < 0) fail("must keep isCardApproved");
if (card.indexOf("approveCard") < 0 || card.indexOf("startCard") < 0) {
  fail("desk-card sheet must keep Approve/Start");
}
if (needs.indexOf("PLACEHOLDER") >= 0 || card.indexOf("PLACEHOLDER") >= 0) {
  fail("files must not contain PLACEHOLDER");
}
if (/exact local file/i.test(needs + card)) {
  fail("files must not contain exact local file");
}
if (!/function talkOnCard/.test(needs)) fail("talkOnCard missing");
const talkFn = needs.slice(needs.indexOf("function talkOnCard"), needs.indexOf("async function sayOnCard"));
if (/action:\s*["']reply["']|action:\s*["']say["']|action:\s*["']bind-ai["']/.test(talkFn)) {
  fail("talkOnCard must not POST alone (Talk fills the box only)");
}
const sayFn = needs.slice(needs.indexOf("async function sayOnCard"), needs.indexOf("async function replyOnCard"));
if (!/action:\s*["']reply["']/.test(sayFn)) {
  fail("sayOnCard must reuse reply POST for HR confirm");
}
if (/action:\s*["']bind-ai["']/.test(sayFn)) {
  fail("sayOnCard must not bind-ai");
}

console.log("check-talk-say-on-card: ok");

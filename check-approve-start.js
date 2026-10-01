#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");

function fail(msg) {
  console.error("check-approve-start: " + msg);
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

if (/onchange\s*=\s*["']bindAiOnCard|onchange=\\"bindAiOnCard/.test(needs)) {
  fail("desk-needs bindAiHtml must not POST onchange=bindAiOnCard (silent bind)");
}
if (needs.indexOf("function approveCard") < 0 && needs.indexOf("async function approveCard") < 0) {
  fail("desk-needs must define approveCard");
}
if (needs.indexOf("function startCard") < 0) fail("desk-needs must define startCard");
if (needs.indexOf("q-start") < 0) fail("desk-needs must paint q-start");
if (needs.indexOf("approveCard") < 0) fail("desk-needs missing approveCard");
if (!/Yes\s*[·.]\s*Start|Approve|approveCard/.test(needs)) {
  fail("desk-needs must word Approve/Start somewhere");
}
if (needs.indexOf("isCardApproved") < 0) fail("desk-needs must gate with isCardApproved");
if (needs.indexOf("markCardApproved") < 0) fail("desk-needs must markCardApproved");
if (needs.indexOf("aia_ok_") < 0) fail("desk-needs must persist approve via sessionStorage aia_ok_");
if (needs.indexOf("__aiaApproved") < 0) fail("desk-needs must keep window.__aiaApproved map");
if (needs.indexOf("Tap Yes to approve first") < 0) fail("startCard must banner when not approved");
if (needs.indexOf("Approved. Tap Start when ready") < 0) fail("approveCard must banner Approved. Tap Start");
if (card.indexOf("approveCard") < 0 && card.indexOf("startCard") < 0) {
  fail("desk-card sheet must use approveCard or startCard path");
}
if (card.indexOf("q-start") < 0 && card.indexOf("startCard") < 0) {
  fail("desk-card sheet must paint Start / startCard");
}
if (card.indexOf("isCardApproved") < 0) fail("desk-card sheet must gate with isCardApproved");
if (needs.indexOf("PLACEHOLDER") >= 0 || card.indexOf("PLACEHOLDER") >= 0) {
  fail("files must not contain PLACEHOLDER");
}
if (/exact local file/i.test(needs + card)) {
  fail("files must not contain exact local file");
}

console.log("check-approve-start: ok");

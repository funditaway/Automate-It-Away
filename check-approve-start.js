#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = fs.existsSync(path.join(__dirname, "desk-needs.js"))
  ? __dirname
  : path.join(__dirname, "..");

function fail(msg) {
  console.error("check-approve-start: " + msg);
  process.exit(1);
}

const needsPath = path.join(root, "desk-needs.js");
const cardPath = path.join(root, "desk-card.js");
const deskHtmlPath = path.join(root, "desk.html");
if (!fs.existsSync(needsPath)) fail("desk-needs.js missing");
if (!fs.existsSync(cardPath)) fail("desk-card.js missing");
if (!fs.existsSync(deskHtmlPath)) fail("desk.html missing");

const needs = fs.readFileSync(needsPath, "utf8");
const card = fs.readFileSync(cardPath, "utf8");
const deskHtml = fs.readFileSync(deskHtmlPath, "utf8");

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
if (needs.indexOf("Approved. Tap Start when you are ready") < 0) fail("approveCard must banner Approved. Tap Start");
if (card.indexOf("approveCard") < 0 && card.indexOf("startCard") < 0) {
  fail("desk-card sheet must use approveCard or startCard path");
}
if (card.indexOf("q-start") < 0 && card.indexOf("startCard") < 0) {
  fail("desk-card sheet must paint Start / startCard");
}
if (card.indexOf("isCardApproved") < 0) fail("desk-card sheet must gate with isCardApproved");

const approveAt = needs.search(/async function approveCard|function approveCard/);
const startAt = needs.indexOf("function startCard", approveAt);
if (approveAt < 0 || startAt < 0 || startAt <= approveAt) fail("approveCard/startCard order missing");
const approveBody = needs.slice(approveAt, startAt);
if (approveBody.indexOf("bindAiOnCard") >= 0) {
  fail("approveCard must not call bindAiOnCard (Yes = Approve only, no silent bind)");
}
if (approveBody.indexOf("ship(") >= 0 || approveBody.indexOf("ship (") >= 0) {
  fail("approveCard must not call ship (Yes never ships)");
}
if (approveBody.indexOf("paintCardStartReady") < 0 && approveBody.indexOf("q-approved") < 0) {
  fail("approveCard must paint local Start / q-approved before reload");
}
if (approveBody.indexOf("Approved. Tap Start when you are ready") < 0) {
  fail("approveCard must banner Approved. Tap Start when you are ready");
}
if (approveBody.indexOf("Nothing goes out alone") < 0) {
  fail("approveCard banner must say Nothing goes out alone (plain English)");
}
if (/HOLD/.test(approveBody)) {
  fail("approveCard user-visible strings must not say HOLD");
}
if (needs.indexOf("function paintCardStartReady") < 0) {
  fail("desk-needs must define paintCardStartReady for local Start-ready");
}
if (needs.indexOf("ensureApprovedCardVisible") < 0) {
  fail("desk-needs must keep Start visible after bad reload (ensureApprovedCardVisible)");
}

const cardFnAt = deskHtml.indexOf("function card(j, staff)");
const loadAt = deskHtml.indexOf("async function load()", cardFnAt);
if (cardFnAt < 0 || loadAt < 0) fail("desk.html must define fallback card() before load()");
const cardFn = deskHtml.slice(cardFnAt, loadAt);
if (/onclick\s*=\s*["']ship\(/.test(cardFn) || /onclick\s*=\s*["']ship\s*\(/.test(cardFn)) {
  fail("desk.html card() Yes must not call ship");
}
if (cardFn.indexOf("approveCard") < 0 && cardFn.indexOf("startCard") < 0) {
  fail("desk.html card() must use approveCard/startCard path (not ship on Yes)");
}

if (needs.indexOf("PLACEHOLDER") >= 0 || card.indexOf("PLACEHOLDER") >= 0 || deskHtml.indexOf("PLACEHOLDER") >= 0) {
  fail("files must not contain PLACEHOLDER");
}
if (/exact local file/i.test(needs + card + deskHtml)) {
  fail("files must not contain exact local file");
}

console.log("check-approve-start: ok");

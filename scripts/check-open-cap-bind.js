#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const vm = require("vm");

const root = path.join(__dirname, "..");

function fail(msg) {
  console.error("check-open-cap-bind: " + msg);
  process.exit(1);
}

const needs = fs.readFileSync(path.join(root, "desk-needs.js"), "utf8");
const card = fs.readFileSync(path.join(root, "desk-card.js"), "utf8");
const help = fs.readFileSync(path.join(root, "help.html"), "utf8");
const more = fs.readFileSync(path.join(root, "more.html"), "utf8");
const yesNo = fs.readFileSync(path.join(root, "ACCOUNT-YES-NO.md"), "utf8");
const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
const drop = fs.readFileSync(path.join(root, "drop.html"), "utf8");
const dropAgent = fs.readFileSync(path.join(root, "drop-agent.js"), "utf8");

["desk-needs.js", "desk-card.js"].forEach(function (name) {
  const syntax = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
  if (syntax.status !== 0) fail(name + " must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
});

if (needs.indexOf("function bindAiHtml") < 0 || needs.indexOf("bindAiHtml(j, \"cap\")") < 0) {
  fail("capCardHtml must call bindAiHtml(j, \"cap\")");
}
if (needs.indexOf("bindAiHtml(j, \"queue\")") < 0) fail("queue card must call bindAiHtml(j, \"queue\")");
if (needs.indexOf("other ? \"\" : bindAiHtml") < 0 && needs.indexOf("other ? \"\" : bindAiHtml(j, \"cap\")") < 0) {
  fail("other-desk Cap must not bind");
}
if (card.indexOf("bindAiHtml(j, \"sheet\")") < 0) fail("openJob must call bindAiHtml(j, \"sheet\")");
if (card.indexOf("staff || typeof bindAiHtml") < 0) fail("Open-job bind must stay owner-only");
if (/oauth|spacex|login\.x\.ai|custodial wallet|Collect charge/i.test(needs + card)) {
  fail("Open / Cap bind invented Grok OAuth / wallet / Collect charge");
}
if (help.indexOf("Open and from this-desk Cap") < 0 && help.indexOf("Open and this-desk Cap") < 0) {
  fail("help#desk-cards must name Open / Cap desk AI pick");
}
if (help.indexOf("Grok") >= 0) fail("help.html must not lecture Grok");
if (more.indexOf("Open and this-desk Cap") < 0 && more.indexOf("Cap and Open") < 0) {
  fail("more.html Queue must name Cap / Open bind");
}
if (yesNo.indexOf("check-open-cap-bind.js") < 0) fail("ACCOUNT-YES-NO must record Open / Cap bind");
if (pkg.indexOf("check-open-cap-bind.js") < 0) fail("package.json must run check-open-cap-bind");
if (drop.indexOf("Public drop never sees money, Stop, or People") < 0) fail("public Drop copy drifted");
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
  localStorage: { getItem: function () { return "owner"; }, setItem: function () {} },
  JOBS: [],
  FIELDS: [],
  PEOPLE: [],
  role: "owner",
  esc: function (s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
    });
  },
  visitorLine: function (s) { return s || ""; },
  labelStatus: function (s) { return s || ""; }
};
ctx.window = ctx;
vm.runInNewContext(needs, ctx);
if (typeof ctx.bindAiHtml !== "function") fail("desk-needs.js must set window.bindAiHtml");
if (typeof ctx.capCardHtml !== "function") fail("desk-needs.js must set window.capCardHtml");
if (typeof ctx.card !== "function") fail("desk-needs.js must set window.card");

ctx.AIADeskAis = {
  owner: true,
  rows: [
    { id: "james-s-ai", name: "James’s AI", does: "Draft the lead packet", prompt: "Ask who it is for." },
    { id: "shop-bot", name: "Shop Bot", does: "Qualify cards", prompt: "Who is it for?" }
  ],
  primary: function () { return this.rows[0]; }
};

const live = {
  id: "j-live",
  status: "waiting",
  title: "They clicked",
  draft: "Ask who it is for and when. Do not send.",
  deskAi: { id: "james-s-ai", name: "James’s AI", does: "Draft the lead packet" },
  next: "James’s AI drafted on the card. Human send HOLD."
};
const queue = ctx.card(live, false);
const cap = ctx.capCardHtml(live, "shop");
const open = ctx.bindAiHtml(live, "sheet");
if (queue.indexOf("q-ai-pick") < 0) fail("queue owner card must keep the desk AI picker");
if (queue.indexOf("q-ai-queue-j-live") < 0) fail("queue picker id must be unique (q-ai-queue-)");
if (cap.indexOf("q-ai-pick") < 0) fail("this-desk Cap must show the desk AI picker");
if (cap.indexOf("q-ai-cap-j-live") < 0) fail("Cap picker id must be unique (q-ai-cap-)");
if (open.indexOf("q-ai-pick") < 0) fail("Open-job bindAiHtml(sheet) must show the picker");
if (open.indexOf("q-ai-sheet-j-live") < 0) fail("Open picker id must be unique (q-ai-sheet-)");
if (cap.indexOf("Shop Bot") < 0) fail("Cap picker must list the other desk AI");
if (open.indexOf("Shop Bot") < 0) fail("Open picker must list the other desk AI");
if (queue.indexOf(">Yes<") < 0 || queue.indexOf(">Kill<") < 0) fail("Yes / Stop / Kill must stay on the queue card");
if (cap.indexOf("Nothing sent alone") < 0) fail("Cap bind must stay HOLD / nothing sent");
if (open.indexOf("Nothing sent alone") < 0) fail("Open bind must stay HOLD / nothing sent");

const other = ctx.capCardHtml(Object.assign({}, live, { slug: "other-desk", desk: "Other" }), "shop");
if (other.indexOf("q-ai-pick") >= 0) fail("other-desk Cap must not show the desk AI picker");
if (other.indexOf("Open on Other") < 0 && other.indexOf("Open on other") < 0) {
  if (other.indexOf("Open on") < 0) fail("other-desk Cap must still Open on that desk");
}

ctx.AIADeskAis.owner = false;
const helperCap = ctx.capCardHtml(live, "shop");
if (helperCap.indexOf("q-ai-pick") >= 0) fail("helper must not see the Cap desk AI picker");
const helperOpen = ctx.bindAiHtml(live, "sheet");
if (helperOpen) fail("helper must not see the Open desk AI picker");

ctx.AIADeskAis.owner = true;
const gone = ctx.capCardHtml({
  id: "j-gone",
  status: "waiting",
  title: "Oak dresser",
  thenAiGone: { id: "shop-bot", name: "Shop Bot" }
}, "shop");
if (gone.indexOf("q-ai-pick") < 0) fail("gone this-desk Cap must still show the picker");
if (gone.indexOf("not on this desk") < 0) fail("gone Cap picker must hold Shop Bot · not on this desk");
if (/<option[^>]*selected[^>]*>[^<]*James/.test(gone)) fail("gone Cap picker must not first-select James");

const xss = ctx.bindAiHtml({
  id: "j-xss",
  status: "waiting",
  title: "Need 2 < 3",
  thenAiGone: { id: "shop-bot", name: "Shop Bot <gone>" }
}, "sheet");
if (xss.indexOf("Shop Bot <gone>") >= 0) fail("raw < in Open bind must not become markup");
if (xss.indexOf("Shop Bot &lt;gone&gt;") < 0) fail("Open gone bind name must stay text");

const cardSrc = fs.readFileSync(path.join(root, "desk-card.js"), "utf8");
if (/>Kill</.test(cardSrc) === false && cardSrc.indexOf(">No<") >= 0) {
  /* sheet Kill label leftover is HOLD — do not invent Stop/Kill rename here */
}

console.log("check-open-cap-bind: ok");

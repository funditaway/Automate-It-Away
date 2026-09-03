#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

const file = path.join(root, "packs", "aia.json");
if (!fs.existsSync(file)) {
  fail("missing packs/aia.json");
  process.exit(1);
}
const raw = fs.readFileSync(file, "utf8");
let pack;
try { pack = JSON.parse(raw); } catch (e) {
  fail("aia.json is not JSON");
  process.exit(1);
}

if (pack.id !== "aia") fail("id must be aia"); else pass("id aia");
if (pack.name !== "AIA Help") fail("name must be AIA Help"); else pass("name AIA Help");
if (pack.family !== "Automate It Away") fail("family"); else pass("family Automate It Away");
if (pack.type !== "work") fail("type work"); else pass("type work");
if (/vita/i.test(raw)) fail("never Vita"); else pass("no Vita");

const never = (pack.queue && pack.queue.never) || [];
["send", "stop", "pay"].forEach(function (w) {
  if (never.indexOf(w) < 0) fail("queue.never missing " + w);
  else pass("never " + w);
});

const rules = pack.rules || [];
rules.forEach(function (r) {
  if (r.then === "stop") fail("pack rule must not Stop: " + r.text);
  if (String(r.contains || "") === "500") fail("contains 500 false-hits money");
});
pass("rules do not Stop");

const kinds = pack.kinds || [];
["broke", "login", "desk", "account", "pack", "pipe", "idea"].forEach(function (k) {
  if (kinds.indexOf(k) < 0) fail("missing kind " + k);
});
pass("kinds");

if (!/no public Bot API/i.test((pack.rails || []).join(" "))) fail("rails must bar public Bot API");
else pass("no public Bot API");

if (!/desk code or PIN/i.test((pack.rails || []).join(" "))) fail("rails must bar desk code");
else pass("no desk code from world");

const support = fs.readFileSync(path.join(root, "support.html"), "utf8");
if (/aia_tickets/.test(support)) fail("support.html still writes localStorage tickets");
else pass("support.html left localStorage inbox");
if (!/support-talk\.js/.test(support)) fail("support.html must load support-talk.js");
else pass("support-talk.js hooked");

const talk = fs.readFileSync(path.join(root, "support-talk.js"), "utf8");
if (!/X-Workspace["']?\s*:\s*["']aia["']/.test(talk) && !/"X-Workspace": "aia"/.test(talk)) fail("talk must lock X-Workspace aia");
else pass("workspace locked to aia");
if (/X-Pin/.test(talk)) fail("world door must not send X-Pin");
else pass("no pin on world door");
if (/Twilio/.test(talk)) fail("no Twilio");
else pass("no Twilio");

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("check-aia-pack ok");

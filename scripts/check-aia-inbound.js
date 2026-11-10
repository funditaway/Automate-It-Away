#!/usr/bin/env node
require("./_env-guard");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function must(hay, needle, label) {
  if (!hay.includes(needle)) throw new Error("missing " + label + ": " + needle);
}

const help = read("help.html");
const studio = read("developer.html");
const studioJs = read("developer.js");
const more = read("more.html");
const yesNo = read("ACCOUNT-YES-NO.md");
const theme = read("theme.js");
const history = read("history.html");

must(help, 'id="desk-cards"', "help.html keeps desk-cards");
must(help, 'id="aia-inbound"', "help.html aia-inbound card");
must(help, ".aia inbound", "help.html inbound title");

const cardStart = help.indexOf('id="aia-inbound"');
const card = help.slice(cardStart, help.indexOf("Something broke?"));
must(card, "name@account.aia", "inbound pattern");
must(card, "When for packs and rules", "inbound When");
must(card, "www.automateitaway.com/api/hook", "inbound live hook");
must(card, "can write a card", "inbound hook writes card");
must(card, "unknown", "inbound unknown .aia");
must(card, "400", "inbound unknown 400");
must(card, "MX and DNS", "inbound MX/DNS");
must(card, "*.aia", "inbound wildcard");
must(card, "still HOLD", "inbound MX HOLD");
must(card, "ai.aia", "inbound ai.aia");
must(card, "orange until DNS", "inbound ai.aia orange");
must(card, "No live Gmail forward wizard", "inbound no Gmail wizard");
must(card, "No email vault", "inbound no email vault");
must(card, "No voice or SMS receptionist", "inbound no receptionist");

must(studio, ".aia inbound.", "studio inbound one-liner");
must(studio, "/help#aia-inbound", "studio inbound link");
const zlib = require("zlib");
function decodeStudio(raw) {
  try { return zlib.gunzipSync(Buffer.from(String(raw).replace(/\s+/g, ""), "base64")).toString("utf8"); }
  catch (e) { return ""; }
}
const studioPack = decodeStudio(read("developer.z64.txt"));
if (studioJs.indexOf('fetch("/developer.z64.txt"') < 0 || studioJs.indexOf('DecompressionStream("gzip")') < 0) {
  throw new Error("Studio loader must unpack developer.z64.txt");
}
if (!studioPack || studioPack.indexOf("Creators Studio") < 0) throw new Error("developer.z64.txt must decode as Creators Studio");
must(studioPack, ".aia inbound.", "studio pack inbound one-liner");
must(studioPack, "/help#aia-inbound", "studio pack inbound link");
must(studioPack, "name@account.aia", "studio pack inbound pattern");
must(studioPack, "can write a card", "studio pack hook writes a card");
must(more, "/help#aia-inbound", "more.html inbound link");
must(more, "Mail in can write a card.", "more.html inbound tile");
must(yesNo, "/help#aia-inbound", "ACCOUNT-YES-NO inbound");

must(theme, 'chip.tagName !== "A"', "theme.js ignores foreign #who-chip");
must(theme, "function accountChip", "theme.js accountChip helper");
must(history, 'id="who-chip"', "history keeps person filter");
must(history, 'id="who-label"', "history who-label");
must(history, 'id="who-people"', "history who-people");

[help, studio, studioJs, studioPack, more].forEach(function (hay) {
  if (hay.includes("BUYER_ENVIRONMENT_BINDINGS")) {
    throw new Error("public page named BUYER_ENVIRONMENT_BINDINGS");
  }
});

if (/Grok|\$47|\$197|MoR|Router Node|Connected Accounts/i.test(card)) {
  throw new Error("aia-inbound invented blocked fiction");
}


function unique(rows) {
  const out = [];
  rows.forEach(function (row) { if (out.indexOf(row) < 0) out.push(row); });
  return out;
}
function inboundCard(html) {
  const start = html.indexOf('id="aia-inbound"');
  if (start < 0) return "";
  const end = html.indexOf("Something broke?", start);
  return html.slice(start, end > start ? end : start + 1200);
}
function buildFaults(files) {
  const bad = [];
  const card = inboundCard(files.help);
  if (!card || card.indexOf("name@account.aia") < 0 || card.indexOf("www.automateitaway.com/api/hook") < 0 || card.indexOf("can write a card") < 0 || card.indexOf("still HOLD") < 0 || card.indexOf("No live Gmail forward wizard") < 0) {
    bad.push("Help inbound honesty gone");
  }
  const hasLoader = files.loader.indexOf('fetch("/developer.z64.txt"') >= 0 && files.loader.indexOf('DecompressionStream("gzip")') >= 0;
  if (!hasLoader || !files.pack || files.pack.indexOf(".aia inbound.") < 0 || files.pack.indexOf("/help#aia-inbound") < 0 || files.more.indexOf("/help#aia-inbound") < 0) {
    bad.push("Studio inbound copy gone");
  }
  const hay = card + "\n" + (files.pack || "") + "\n" + (files.more || "");
  if (/auto-?reply/i.test(hay) || /sends without Yes/i.test(hay) || /charged:\s*true/.test(files.pack || "") || /action:\s*"payout"|action:\s*"withdraw"|action:\s*"send-mail"/.test(files.pack || "")) {
    bad.push("inbound auto-reply or charge without Yes");
  }
  return unique(bad);
}
function applyMutant(kind, files) {
  const next = { help: files.help, more: files.more, loader: files.loader, pack: files.pack };
  if (kind === "Help inbound honesty gone") {
    next.help = next.help
      .replace(/id="aia-inbound"/g, 'id="gone-inbound"')
      .replace(/name@account\.aia/g, "skip@gone")
      .replace(/www\.automateitaway\.com\/api\/hook/g, "gone")
      .replace(/can write a card/g, "sends a reply")
      .replace(/still HOLD/g, "is live")
      .replace(/No live Gmail forward wizard/g, "Gmail wizard is live");
  } else if (kind === "Studio inbound copy gone") {
    next.pack = next.pack
      .replace(/\.aia inbound\./g, "Skip inbound.")
      .replace(/\/help#aia-inbound/g, "/help#gone");
    next.more = next.more.replace(/\/help#aia-inbound/g, "/help#gone");
  } else if (kind === "inbound auto-reply or charge without Yes") {
    next.pack = next.pack
      .replace(/can write a card/g, "auto-replies and sends without Yes")
      + "\ncharged: true\n{ action: \"send-mail\" }\n{ action: \"payout\" }";
    next.help = next.help.replace(/can write a card/g, "auto-replies and sends without Yes");
  }
  return next;
}

let failed = 0;
function fail(msg) { failed += 1; console.error("FAIL " + msg); }
function pass(msg) { console.log("ok  " + msg); }

const files = { help: help, more: more, loader: studioJs, pack: studioPack };
const live = buildFaults(files);
if (live.length) fail("inbound behaviour drifted: " + live.join("; "));
else pass("Help inbound honesty, Studio pack copy, and no silent inbound send/charge still hold");

const mutants = [
  "Help inbound honesty gone",
  "Studio inbound copy gone",
  "inbound auto-reply or charge without Yes"
];
let caught = 0;
mutants.forEach(function (kind) {
  const faults = buildFaults(applyMutant(kind, files));
  if (faults.indexOf(kind) < 0) fail("mutant missed: " + kind + " (got " + JSON.stringify(faults) + ")");
  else { caught += 1; pass("mutant caught: " + kind); }
});
if (caught !== mutants.length) fail("mutants: " + caught + "/" + mutants.length + " caught");
else pass("mutants: " + caught + "/" + mutants.length + " caught");
if (failed) {
  console.error("check-aia-inbound failed");
  process.exit(1);
}

console.log("check-aia-inbound: ok");

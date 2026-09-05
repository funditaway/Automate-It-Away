#!/usr/bin/env node
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
must(studioJs, ".aia inbound.", "studio js inbound one-liner");
must(studioJs, "/help#aia-inbound", "studio js inbound link");
must(more, "/help#aia-inbound", "more.html inbound link");
must(yesNo, "/help#aia-inbound", "ACCOUNT-YES-NO inbound");

must(theme, 'chip.tagName !== "A"', "theme.js ignores foreign #who-chip");
must(theme, "function accountChip", "theme.js accountChip helper");
must(history, 'id="who-chip"', "history keeps person filter");
must(history, 'id="who-label"', "history who-label");
must(history, 'id="who-people"', "history who-people");

[help, studio, studioJs, more].forEach(function (hay) {
  if (hay.includes("BUYER_ENVIRONMENT_BINDINGS")) {
    throw new Error("public page named BUYER_ENVIRONMENT_BINDINGS");
  }
});

if (/Grok|\$47|\$197|MoR|Router Node|Connected Accounts/i.test(card)) {
  throw new Error("aia-inbound invented blocked fiction");
}

console.log("check-aia-inbound: ok");

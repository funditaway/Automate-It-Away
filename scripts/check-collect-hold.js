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
function mustNot(hay, needle, label) {
  if (hay.includes(needle)) throw new Error("invented " + label + ": " + needle);
}
function sliceBetween(hay, startNeedle, endNeedle, label) {
  const start = hay.indexOf(startNeedle);
  const end = hay.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(label + " missing");
  return hay.slice(start, end);
}

const index = read("index.html");
const help = read("help.html");
const consign = read("consign.html");
const yesNo = read("ACCOUNT-YES-NO.md");
const packMd = read("PACK.md");
const pkg = read("package.json");
const nav = read("desk-nav.js");

const follow = sliceBetween(index, "<b>Keep the follow-up</b>", "</div>", "index.html follow-up");
must(follow, "One nudge. Then it stops.", "follow-up one nudge");
must(follow, "Collect stays HOLD until Yes + a real money pipe.", "follow-up Collect HOLD");
mustNot(follow, "Money waits only if you wrote that rule", "follow-up rule-gated live money");

const bills = sliceBetween(index, "<b>Bills</b>", "</div>", "index.html Bills");
must(bills, "Bill due on the card. Collect HOLD until Yes + a real money pipe.", "Bills Collect HOLD");
mustNot(bills, "lets the money move", "Bills owner lets money move");
mustNot(bills, "money-wait rule", "Bills money-wait as live pipe");

const collectDd = sliceBetween(help, "<dt>Collect</dt>", "<dt>Open</dt>", "help.html Collect dd");
must(collectDd, "Collect stays HOLD until a person taps Yes and a real money pipe is live.", "Collect dd HOLD");
must(collectDd, "Helper can prep the draft", "Collect dd helper preps");
must(collectDd, "Yes is not a collect charge", "Collect dd Yes is not a collect charge");
mustNot(collectDd, "Owner lets the money move", "Collect dd owner lets money move");
mustNot(collectDd, "Only if the owner wrote that rule", "Collect dd rule-gated live money");

const paidStep = sliceBetween(consign, "<b>4 Collect HOLD</b>", "</div>", "consign.html 4 Collect HOLD");
must(paidStep, "Square stays HOLD until Yes + a real money pipe", "consign Square HOLD");
mustNot(consign, "4 Paid", "consign live Paid step");
mustNot(consign, "Square payout", "consign live Square payout");
mustNot(consign, "Seller gets paid", "consign live seller paid");
must(consign, "Collect HOLD until Yes + a real money pipe", "consign lead Collect HOLD");

[follow, bills, collectDd, paidStep, consign].forEach(function (hay, i) {
  const name = ["follow-up", "Bills", "Collect dd", "consign 4", "consign.html"][i];
  mustNot(hay, "AIA coin", name + " AIA coin");
  mustNot(hay, "compute credits", name + " compute credits");
});
["index.html", "help.html", "consign.html"].forEach(function (name) {
  mustNot(read(name), "drop-pack.js", name + " loads drop-pack.js");
});
mustNot(nav, "drop-pack.js", "desk-nav loads drop-pack.js");

if (/\$\d/.test(follow) || /\$\d/.test(bills) || /\$\d/.test(collectDd) || /\$\d/.test(paidStep)) {
  throw new Error("leftover Collect copy invented a price");
}

must(yesNo, "check-collect-hold.js", "ACCOUNT-YES-NO records leftover Collect honesty");
must(yesNo, "index.html follow-up", "ACCOUNT-YES-NO names index follow-up");
must(yesNo, "help.html Collect", "ACCOUNT-YES-NO names help Collect dd");
must(yesNo, "consign.html", "ACCOUNT-YES-NO names consign.html");
must(packMd, "index.html follow-up", "PACK.md names index follow-up");
must(packMd, "help.html Collect", "PACK.md names help Collect");
must(packMd, "consign.html", "PACK.md names consign.html");
must(pkg, "check-collect-hold.js", "package.json runs check-collect-hold");

console.log("check-collect-hold: ok");

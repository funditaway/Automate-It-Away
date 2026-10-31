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
function mustNot(hay, needle, label) {
  if (hay.includes(needle)) throw new Error("invented " + label + ": " + needle);
}

const how = read("how.html");
const yesNo = read("ACCOUNT-YES-NO.md");
const packMd = read("PACK.md");
const pkg = read("package.json");

const paidStart = how.indexOf('n:4, id:"paid"');
const paidEnd = how.indexOf('n:5, id:"follow"');
if (paidStart < 0 || paidEnd < 0 || paidEnd <= paidStart) throw new Error("how.html Paid step missing");
const paid = how.slice(paidStart, paidEnd);

must(how, "Payments are off for now. When they turn on, a person still taps Yes first.", "Paid film payments-off line");
must(paid, "Payments are off for now. When they turn on, a person still taps Yes first.", "Paid what payments off");
must(paid, "Yes never charges anyone.", "Paid Yes is not a charge");
must(paid, "Helper can prep the draft", "Paid helper preps draft");
mustNot(paid, "Collect HOLD", "Paid Collect jargon");
must(paid, "name:\"Get paid (off for now)\"", "Paid step name payments off");
must(paid, "Bill due on the card. Payments are off for now.", "Paid life mean payments off");
must(how, 'name: "4 Get paid (off for now)"', "film reel payments off");
mustNot(how, 'name: "4 Paid"', "film reel live Paid");

mustNot(how, "Collect when due", "live Collect when due");
mustNot(how, "Money waits only if you wrote that rule", "rule-gated live money");
mustNot(how, "lets money move", "owner lets money move");
mustNot(how, "Pay the bill if it is due", "life live pay");
mustNot(how, "AIA coin", "AIA coin");
mustNot(how, "compute credits", "compute credits");

mustNot(how, "Send or Stop", "Send as the HITL rail");
mustNot(how, "until Send", "Send as outbound gate");
mustNot(how, "You send the draft. Stop", "Send as the Yes tap");
must(how, "Yes / Stop / Kill", "How names Yes / Stop / Kill");
must(how, "Nothing leaves until Yes", "Do until Yes");
must(how, "You tap Yes. You send the draft yourself.", "film Yes then send yourself");

if (/\$\d/.test(how) && !/illustrative/.test(how)) {
  throw new Error("how.html invented a price");
}

must(yesNo, "check-how-paid.js", "ACCOUNT-YES-NO records How Paid honesty");
must(yesNo, "how.html Paid", "ACCOUNT-YES-NO names how.html Paid");
must(packMd, "how.html Paid", "PACK.md names how.html Paid");
must(pkg, "check-how-paid.js", "package.json runs check-how-paid");

console.log("check-how-paid: ok");

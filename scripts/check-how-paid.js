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

const how = read("how.html");
const yesNo = read("ACCOUNT-YES-NO.md");
const packMd = read("PACK.md");
const pkg = read("package.json");

const paidStart = how.indexOf('n:4, id:"paid"');
const paidEnd = how.indexOf('n:5, id:"follow"');
if (paidStart < 0 || paidEnd < 0 || paidEnd <= paidStart) throw new Error("how.html Paid step missing");
const paid = how.slice(paidStart, paidEnd);

must(how, "Collect stays HOLD until a person taps Yes and a real money pipe is live.", "Paid film HOLD line");
must(paid, "Collect stays HOLD until a person taps Yes and a real Collect money pipe is live.", "Paid what HOLD");
must(paid, "Yes is not a collect charge", "Paid Yes is not a collect charge");
must(paid, "Helper can prep the draft", "Paid helper preps draft");
must(paid, "real money pipe", "Paid real money pipe");
must(paid, "name:\"Collect HOLD\"", "Paid step name Collect HOLD");
must(paid, "Bill due on the card. Collect HOLD until Yes + a real money pipe.", "Paid life mean HOLD");
must(how, 'name: "4 Collect HOLD"', "film reel Collect HOLD");
mustNot(how, 'name: "4 Paid"', "film reel live Paid");

mustNot(how, "Collect when due", "live Collect when due");
mustNot(how, "Money waits only if you wrote that rule", "rule-gated live money");
mustNot(how, "lets money move", "owner lets money move");
mustNot(how, "Pay the bill if it is due", "life live pay");
mustNot(how, "AIA coin", "AIA coin");
mustNot(how, "compute credits", "compute credits");

if (/\$\d/.test(how) && !/illustrative/.test(how)) {
  throw new Error("how.html invented a price");
}

must(yesNo, "check-how-paid.js", "ACCOUNT-YES-NO records How Paid honesty");
must(yesNo, "how.html Paid", "ACCOUNT-YES-NO names how.html Paid");
must(packMd, "how.html Paid", "PACK.md names how.html Paid");
must(pkg, "check-how-paid.js", "package.json runs check-how-paid");

console.log("check-how-paid: ok");

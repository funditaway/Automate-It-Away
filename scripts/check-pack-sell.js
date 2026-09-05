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
const account = read("account.html");
const walletUi = read("aia-wallet.js");
const packMd = read("PACK.md");
const yesNo = read("ACCOUNT-YES-NO.md");

must(help, 'id="sell-packs"', "help.html sell-packs card");
must(help, "Selling packs — risk honesty", "help.html sell-packs title");
must(help, "Not legal advice", "help.html not legal advice");
must(help, "thin JSON", "help.html thin JSON");
must(help, "buyer", "help.html buyer desk");
must(help, "Yes / Stop / Kill", "help.html Yes/Stop/Kill");
must(help, "Collect stays HOLD", "help.html Collect HOLD");
must(help, "Never hardcode yours", "help.html never hardcode");
must(help, "100% safe", "help.html no 100% safe");
must(help, "never banned", "help.html never banned");
must(help, "stands behind the pack", "help.html creator stands behind");
must(help, "Help is not legal advice", "help.html help not counsel");
must(help, "Talk to AIA", "help.html Talk to AIA");
must(help, "Marketplace can unlist", "help.html unlist");
must(help, "AS IS", "help.html AS IS");
must(help, "does not attach legal terms", "help.html no AIA attach flow");
must(help, "does not run chargeback holds", "help.html no chargeback hold");
must(help, "payout freezes", "help.html no payout freeze");
must(help, "sandbox throttle ladder", "help.html no throttle ladder");

must(help, 'id="pack-worth"', "help.html pack-worth card");
must(help, "When a pack is worth it", "help.html pack-worth title");
must(help, "process already works", "help.html worth it works");
must(help, "qualify → draft", "help.html qualify draft");
must(help, "fallbacks", "help.html fallbacks");
must(help, "Abandoned when APIs change", "help.html abandoned APIs");
must(help, "webhook", "help.html trivial webhook");
must(help, "Drop yourself", "help.html drop yourself");

must(help, 'id="creator-takeaways"', "help.html creator takeaways");
must(help, "Creator takeaways", "help.html takeaways title");
must(help, "buyer keys", "help.html takeaways buyer keys");
must(help, "@handle", "help.html takeaways handle");
must(help, "Owner vs Helper", "help.html takeaways owner helper");
must(help, "No email Team seats", "help.html takeaways no email seats");
must(help, "No merchant-of-record money desk", "help.html takeaways no MoR");
must(help, "No social OAuth auto-post", "help.html takeaways no social OAuth");

must(help, "Wallet Connect is a browser wallet", "help.html wallet one-liner");
must(help, "not compute credits", "help.html not compute credits");
must(help, "creator payout ledger", "help.html not payout ledger");
must(help, "Collect and payouts HOLD", "help.html collect payouts HOLD");

must(studio, "Selling packs.", "studio sell-packs one-liner");
must(studio, "/help#sell-packs", "studio sell-packs link");
must(studio, "Help is not legal advice", "studio not legal advice");
must(studioJs, "Selling packs.", "studio js sell-packs one-liner");
must(studioJs, "/help#sell-packs", "studio js sell-packs link");
must(more, "/help#sell-packs", "more.html sell-packs link");
must(more, "/help#pack-worth", "more.html pack-worth link");

must(account, "Wallet Connect is a browser wallet", "account.html wallet one-liner");
must(account, "not compute credits", "account.html not compute credits");
must(account, "creator payout ledger", "account.html not payout ledger");
must(walletUi, "not compute credits", "aia-wallet.js not compute credits");
must(walletUi, "creator payout ledger", "aia-wallet.js not payout ledger");
must(walletUi, "Collect stays HOLD", "aia-wallet.js Collect HOLD");
must(walletUi, "Mint and Bridge stay external", "aia-wallet.js mint/Bridge");

must(packMd, "Selling packs — risk honesty", "PACK.md risk honesty");
must(packMd, "When a pack is worth it", "PACK.md pack worth");
must(yesNo, "Selling packs — risk honesty", "ACCOUNT-YES-NO risk honesty");
must(yesNo, "When a pack is worth it", "ACCOUNT-YES-NO pack worth");

const sell = help.slice(help.indexOf('id="sell-packs"'), help.indexOf('id="pack-worth"'));
const worth = help.slice(help.indexOf('id="pack-worth"'), help.indexOf('id="creator-takeaways"'));
[sell, worth].forEach(function (chunk, i) {
  const name = i === 0 ? "sell-packs" : "pack-worth";
  if (/\$47|\$197|\$50|300 hours|10\s*[–-]\s*15\s*minutes/i.test(chunk)) {
    throw new Error(name + " invented $ or hours table");
  }
});

["Lemon Squeezy", "Paddle"].forEach(function (bit) {
  if (sell.includes(bit)) throw new Error("sell-packs must not invent " + bit + " as an AIA pipe");
});

["Login Kit", "auto-schedule", "aiastudios.app", "compute credits wallet"].forEach(function (bit) {
  if (help.includes(bit) || studio.includes(bit) || studioJs.includes(bit)) {
    throw new Error("invented fiction: " + bit);
  }
});

console.log("check-pack-sell: ok");

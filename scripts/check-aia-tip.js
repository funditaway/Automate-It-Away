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

const tip = read("aia-tip.js");
const supportTalk = read("support-talk.js");
const support = read("support.html");
const help = read("help.html");
const theme = read("theme.css");
const yesNo = read("ACCOUNT-YES-NO.md");
const packMd = read("PACK.md");
const pkg = read("package.json");

must(tip, "Ask AIA", "shared Ask AIA");
must(tip, "support.html?ask=", "Ask AIA opens Help chat");
must(tip, "window.AIATip", "AIATip export");
must(tip, '"desk-name"', "desk-name tip");
must(tip, '"desk-code"', "desk-code tip");
must(tip, '"give-pack"', "give-pack tip");
must(tip, '"connect-wallet"', "connect-wallet tip");
must(tip, "Not Wallet.AIA", "tip wallet honesty");
must(tip, "Collect stays HOLD", "tip Collect HOLD");
mustNot(tip, "Zendesk", "tip Zendesk");
mustNot(tip, "drop-pack.js", "tip loads drop-pack.js");
mustNot(tip, "AIA coin", "tip AIA coin");
mustNot(tip, "collecting ETH", "tip ETH collect");
mustNot(tip, "future Pack", "tip future Pack SKU");
mustNot(tip, "Pack partners", "tip pack partners market");

must(theme, ".aia-tip-pop", "theme paints tip popover");
must(theme, "button.aia-tip", "theme paints tip button");

["index.html", "how.html", "setup.html", "onboard.html"].forEach(function (name) {
  const html = read(name);
  must(html, "aia-tip.js", name + " loads aia-tip.js");
  must(html, "data-aia-tip", name + " has a field tip");
  mustNot(html, "drop-pack.js", name + " loads drop-pack.js");
  mustNot(html, "Zendesk", name + " Zendesk");
  mustNot(html, "AIA coin", name + " AIA coin");
});

const onboard = read("onboard.html");
must(onboard, 'data-aia-tip="desk-name"', "onboard Desk name tip");
must(onboard, 'data-aia-tip="desk-code"', "onboard Desk code tip");
must(onboard, "not a mint lesson", "onboard does not teach mint");

must(read("how.html"), 'data-aia-tip="week-shop"', "how week field tip");
must(read("index.html"), 'data-aia-tip="card-taps"', "home card-taps tip");
must(read("setup.html"), 'data-aia-tip="practice-card"', "setup practice tip");

must(supportTalk, "paintAsk", "Help chat reads Ask AIA");
must(supportTalk, 'q.get("field")', "Help chat field");
must(supportTalk, 'q.get("ask")', "Help chat ask");
must(supportTalk, "AIATip", "Help chat uses shared tips");
must(supportTalk, "HOME = line", "Ask AIA becomes Quiet home");
must(supportTalk, "thread(HOME)", "Quiet restores Ask AIA or stock prompt");
must(support, "aia-tip.js", "support loads shared tips");
must(support, "move as cards between your desk and the AIA Admin desk", "support card bridge");
must(support, "Not a ticket portal", "support not Zendesk");
must(help, "move as cards between your desk and the AIA Admin desk", "help card bridge");
mustNot(support, "Zendesk", "support Zendesk");
mustNot(help, "Zendesk", "help Zendesk");

must(yesNo, "check-aia-tip.js", "ACCOUNT-YES-NO records tip honesty");
must(packMd, "Ask AIA", "PACK.md names Ask AIA");
must(pkg, "check-aia-tip.js", "package.json runs check-aia-tip");

console.log("check-aia-tip: ok");

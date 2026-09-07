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
must(tip, "&tip=", "Ask AIA sends plain tip text");
must(tip, "&field=", "Ask AIA sends field id");
must(tip, "&from=", "Ask AIA sends page");
must(tip, "function context", "Ask AIA context payload");
must(tip, "window.AIATip", "AIATip export");
must(tip, '"desk-name"', "desk-name tip");
must(tip, '"desk-code"', "desk-code tip");
must(tip, '"give-pack"', "give-pack tip");
must(tip, '"update-pack"', "update-pack tip");
must(tip, '"connect-wallet"', "connect-wallet tip");
must(tip, "Not Wallet.AIA", "tip wallet honesty");
must(tip, "Collect stays HOLD", "tip Collect HOLD");
mustNot(tip, "Zendesk", "tip Zendesk");
mustNot(tip, "drop-pack.js", "tip loads drop-pack.js");
mustNot(tip, "AIA coin", "tip AIA coin");
mustNot(tip, "collecting ETH", "tip ETH collect");
mustNot(tip, "future Pack", "tip future Pack SKU");
mustNot(tip, "Pack partners", "tip pack partners market");
mustNot(tip, "escrow", "tip ETH escrow");
mustNot(tip, "micro-wei", "tip micro-wei billing");
mustNot(tip, "NFT", "tip pack NFT license");

must(theme, ".aia-tip-pop", "theme paints tip popover");
must(theme, "button.aia-tip", "theme paints tip button");

["index.html", "how.html", "setup.html", "onboard.html", "drop.html", "login.html"].forEach(function (name) {
  const html = read(name);
  must(html, "aia-tip.js", name + " loads aia-tip.js");
  must(html, "data-aia-tip", name + " has a field tip");
  mustNot(html, "drop-pack.js", name + " loads drop-pack.js");
  mustNot(html, "Zendesk", name + " Zendesk");
  mustNot(html, "AIA coin", name + " AIA coin");
  mustNot(html, "escrow", name + " ETH escrow");
  mustNot(html, "micro-wei", name + " micro-wei billing");
  mustNot(html, "trustless", name + " trustless escrow");
});

const onboard = read("onboard.html");
must(onboard, 'data-aia-tip="desk-name"', "onboard Desk name tip");
must(onboard, 'data-aia-tip="desk-code"', "onboard Desk code tip");
must(onboard, "not a mint lesson", "onboard does not teach mint");

must(read("how.html"), 'data-aia-tip="week-shop"', "how week field tip");
must(read("how.html"), 'data-aia-tip="update-pack"', "how Update pack tip");
must(read("index.html"), 'data-aia-tip="card-taps"', "home card-taps tip");
must(read("index.html"), 'data-aia-tip="update-pack"', "home Update pack tip");
must(read("setup.html"), 'data-aia-tip="practice-card"', "setup practice tip");
must(read("setup.html"), 'data-aia-tip="update-pack"', "setup Update pack tip");
must(read("drop.html"), 'data-aia-tip="desk-name"', "drop Desk name tip");
must(read("drop.html"), 'data-aia-tip="desk-code"', "drop Desk code tip");

must(supportTalk, "paintAsk", "Help chat reads Ask AIA");
must(supportTalk, 'q.get("field")', "Help chat field");
must(supportTalk, 'q.get("ask")', "Help chat ask");
must(supportTalk, 'q.get("tip")', "Help chat plain tip text");
must(supportTalk, "askCtx", "Help chat keeps Ask AIA context");
must(supportTalk, "field: p.field", "Admin card keeps field id");
must(supportTalk, "tip: p.tip", "Admin card keeps tip text");
must(supportTalk, "This chat stays draft / help", "Help chat stays draft first");
must(supportTalk, "Need a person? Drop a card on the AIA Admin desk", "Help chat human card");
must(supportTalk, "Yes / Stop stay human", "Help chat Yes / Stop human");
must(supportTalk, "AIATip", "Help chat uses shared tips");
must(support, "aia-tip.js", "support loads shared tips");
must(support, "Ask AIA answers here first", "support Ask AIA draft first");
must(support, "Drop a card on the AIA Admin desk", "support Admin card");
must(support, "Yes / Stop stay human", "support Yes / Stop human");
must(support, "Not a ticket portal", "support not Zendesk");
must(help, "move as cards between your desk and the AIA Admin desk", "help card bridge");
mustNot(support, "Zendesk", "support Zendesk");
mustNot(help, "Zendesk", "help Zendesk");
mustNot(supportTalk, "escrow", "Help chat ETH escrow");
mustNot(support, "escrow", "support ETH escrow");

must(yesNo, "check-aia-tip.js", "ACCOUNT-YES-NO records tip honesty");
must(packMd, "Ask AIA", "PACK.md names Ask AIA");
must(pkg, "check-aia-tip.js", "package.json runs check-aia-tip");

console.log("check-aia-tip: ok");

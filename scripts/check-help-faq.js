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

const help = read("help.html");
const studio = read("developer.html");
const studioJs = read("developer.js");
const more = read("more.html");
const yesNo = read("ACCOUNT-YES-NO.md");
const packMd = read("PACK.md");
const pkg = read("package.json");

const faqStart = help.indexOf('id="faq"');
const faqEnd = help.indexOf('id="queue-runs"');
if (faqStart < 0 || faqEnd < 0 || faqEnd <= faqStart) throw new Error("help.html FAQ card missing");
const faq = help.slice(faqStart, faqEnd);

must(faq, "What does Needs you mean?", "FAQ Needs you question");
must(faq, "Needs you / prompt ask-who", "FAQ Needs you / prompt ask-who");
must(faq, "Shop Bot · not on this desk", "FAQ gone HOLD");
must(faq, "not anonymous Needs you", "FAQ not anonymous Needs you");
must(faq, "The desk AI asked", "FAQ denies The desk AI asked");
must(faq, "Reply does not Yes", "FAQ reply does not Yes");
must(faq, "Queue, Cap, Open, History, Explore, and People", "FAQ same ask-who trail");
must(faq, "How do I install, give, or update a pack?", "FAQ give-update question");
must(faq, "Install / give / update a .aia with Yes", "FAQ install / give / update");
must(faq, "Give is the file", "FAQ Give is the file");
must(faq, "Update is install again", "FAQ Update is install again");
must(faq, "Recurring update HOLD", "FAQ recurring HOLD");
must(faq, "You do not pick a pack on every Drop", "FAQ no pack pick");
must(faq, "No silent charge", "FAQ no silent charge");
must(faq, "How do I Connect a wallet?", "FAQ Connect question");
must(faq, "Connect existing wallet", "FAQ Connect existing wallet");
must(faq, "Connect MetaMask or WalletConnect", "FAQ MetaMask / WalletConnect");
must(faq, "Your wallet. AIA does not hold keys", "FAQ wallet honesty");
must(faq, "Not Wallet.AIA", "FAQ not Wallet.AIA");
must(faq, "Collect and pack pay stay HOLD", "FAQ Collect / pack pay HOLD");
must(faq, "not compute credits", "FAQ not compute credits");
must(faq, "creator payout ledger", "FAQ not payout ledger");
must(faq, "Create or Drop a goal → a draft card → you tap Yes", "FAQ goal path");
must(faq, "Needs you / prompt ask-who when a Desk AI asks", "FAQ Create/Drop names Needs you");
mustNot(faq, "when the desk asks", "FAQ Create/Drop still says when the desk asks");
must(faq, "Collect stays HOLD", "FAQ Collect HOLD");

const peopleStart = help.indexOf("<dt>People</dt>");
const peopleEnd = help.indexOf("<dt>Send</dt>");
if (peopleStart < 0 || peopleEnd < 0 || peopleEnd <= peopleStart) throw new Error("help.html First day People dd missing");
const peopleDd = help.slice(peopleStart, peopleEnd);
must(peopleDd, "Needs you / prompt ask-who", "First day People dd Needs you / prompt ask-who");
must(peopleDd, "Then draft", "First day People dd Then draft");
must(peopleDd, "gone HOLD", "First day People dd gone HOLD");

must(help, "People lives under More", "people-desk card");
const peopleDesk = help.slice(help.indexOf('id="people-desk"'), help.indexOf('id="onboard-desk"'));
must(peopleDesk, "Needs you / prompt ask-who", "people-desk open cards name Needs you");

must(help, "Names the desk AI when one is set", "Words on the buttons Needs you names the AI");
must(help, "not anonymous Needs you", "Words on the buttons not anonymous");

must(studio, "Needs you / prompt ask-who when a Desk AI asks", "Studio FAQ Needs you");
mustNot(studio, "when the desk asks", "Studio still says when the desk asks");
must(studio, "Install / give / update a .aia with Yes", "Studio FAQ give-update");
must(studio, "Connect existing wallet", "Studio FAQ Connect");
must(studio, "not Wallet.AIA", "Studio FAQ not Wallet.AIA");
must(studio, "/help#faq", "Studio FAQ link");

must(studioJs, "Needs you / prompt ask-who when a Desk AI asks", "Studio js FAQ Needs you");
mustNot(studioJs, "when the desk asks", "Studio js still says when the desk asks");
must(studioJs, "Install / give / update a .aia with Yes", "Studio js FAQ give-update");
must(studioJs, "Connect existing wallet", "Studio js FAQ Connect");
must(studioJs, "not Wallet.AIA", "Studio js FAQ not Wallet.AIA");

must(more, "/help#faq", "more.html FAQ link");
must(more, "Needs you / prompt ask-who", "more.html FAQ Needs you");
must(more, "Install / give / update a .aia with Yes", "more.html FAQ give-update");
must(more, "Connect existing wallet", "more.html FAQ Connect");
must(more, "not Wallet.AIA", "more.html FAQ not Wallet.AIA");
must(more, "You tap Yes or Stop. You send the draft yourself.", "more.html grok-line Yes rail");
must(more, "You tap Yes or Stop. Never Send.", "more.html grok-on Yes rail");
if (more.includes("You send them. Or you Stop.")) throw new Error("more.html grok-line painted Send as the HITL rail");

must(help, "A person still taps Yes or Stop.", "Help We type it in Yes or Stop");
must(help, "you still tap Yes or Stop. You send the draft yourself.", "Help Talk tap Yes or Stop");
must(help, "A Desk AI drafts the card", "Help Desk AI drafts");
mustNot(help, "The desk asks what’s missing", "Help First day Drop still says The desk asks");
mustNot(help, "AIA writes the card", "Help We type it in still says AIA writes");
mustNot(help, "We write the card on your queue", "Help Talk still says We write the card");
mustNot(help, "the desk writes the card", "Help Drop anything still says the desk writes");
must(yesNo, "Help Desk AI leftover after that pass", "ACCOUNT-YES-NO names Help Desk AI leftover");
must(packMd, "Help Desk AI leftover:", "PACK.md names Help Desk AI leftover");
must(yesNo, "Help FAQ Desk AI leftover after that pass", "ACCOUNT-YES-NO names Help FAQ Desk AI leftover");
must(packMd, "Help FAQ Desk AI leftover:", "PACK.md names Help FAQ Desk AI leftover");
must(yesNo, "Needs you / prompt ask-who when a Desk AI asks", "ACCOUNT-YES-NO FAQ Desk AI asks");
must(help, "Owner still taps Yes and Stop.", "Help Log in Yes and Stop");
must(help, "Yes when the rule allows", "Help Helper Yes not Send");
must(help, "A person taps Yes — or Stops it — before it goes out.", "Help lead Yes rail");
must(help, "You send the draft yourself.", "Help lead send-it-yourself");
must(help, "Yes is the human tap. You send the draft yourself.", "Help Yes button is the tap");
["taps Send or Stop", "taps Send and Stop", "Send when the rule allows", "you still send the draft, or Stop", "sends the draft — or Stops", "post it, text it"].forEach(function (bit) {
  if (help.includes(bit)) throw new Error("Help painted Send as the HITL rail: " + bit);
});

must(yesNo, "check-help-faq.js", "ACCOUNT-YES-NO records Help FAQ honesty");
must(pkg, "check-help-faq.js", "package.json runs check-help-faq");

if (/Wallet\.AIA/.test(faq) && !/Not Wallet\.AIA/.test(faq)) {
  throw new Error("FAQ must not ship custodial Wallet.AIA");
}
["custodial Wallet.AIA", "silent send", "AIA coin", "gas currency", "OAuth", "careers portal live"].forEach(function (bit) {
  if (new RegExp(bit, "i").test(faq)) throw new Error("FAQ invented fiction: " + bit);
});
if (/\$47|\$197|\$50|credit pricing live|Free \/ Pro live/i.test(faq)) {
  throw new Error("FAQ invented price / plan SKU");
}

console.log("check-help-faq: ok");

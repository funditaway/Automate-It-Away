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
must(studioPack, "Needs you / prompt ask-who when a Desk AI asks", "Studio pack FAQ Needs you");
mustNot(studioPack, "when the desk asks", "Studio pack still says when the desk asks");
must(studioPack, "Install / give / update a .aia with Yes", "Studio pack FAQ give-update");
must(studioPack, "Connect existing wallet", "Studio pack FAQ Connect");
must(studioPack, "not Wallet.AIA", "Studio pack FAQ not Wallet.AIA");
must(studioPack, "No silent charge", "Studio pack no silent charge");
must(studioPack, "Collect stays HOLD", "Studio pack Collect HOLD");

must(more, "/help#faq", "more.html FAQ link");
must(more, "Short answers. Install pack or Give pack with Yes.", "more.html FAQ tile points people to Help");
must(more, "You tap Yes or Stop.", "more.html grok-line Yes rail");
must(more, "A Desk AI can draft. You tap Yes or Stop.", "more.html grok-line when a Desk AI can draft");
must(more, "A Desk AI can't draft on this phone yet. You tap Yes or Stop.", "more.html grok-line when a Desk AI cannot draft");
must(more, "You still tap Yes or Stop.", "more.html still taps Yes or Stop");
must(more, "Give is the file", "more.html History Give is the file");
if (more.includes("You send them. Or you Stop.")) throw new Error("more.html grok-line painted Send as the HITL rail");
const tips = read("aia-tip.js");
must(tips, '"more-faq"', "aia-tip more-faq entry");
must(tips, "Install pack or Give pack with Yes. You still tap Yes or Stop.", "aia-tip more-faq keeps Yes or Stop");

must(help, "A person still taps Yes or Stop.", "Help We type it in Yes or Stop");
must(help, "you still tap Yes or Stop. You send the draft yourself.", "Help Talk tap Yes or Stop");
must(help, "Yes puts a card on the queue. Open this card.", "First day Create Open this card");
must(help, "A Desk AI drafts the card", "Help Desk AI drafts");
must(help, 'id="together"', "Help together section");
must(help, "Humans, AIs, and SIs on one card", "Help together title");
must(help, "AI prepares the work. The human verifies", "Help AI prepares human verifies");
must(help, "SI · si.aia", "Help SI · si.aia");
must(help, "how.html#together", "Help links How together");
must(help, 'href="#si-aia"', "Help links si-aia");
must(yesNo, "Together on one card leftover", "ACCOUNT-YES-NO names Together leftover");
must(packMd, "Together on one card leftover", "PACK.md names Together leftover");
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


function unique(rows) {
  const out = [];
  rows.forEach(function (row) { if (out.indexOf(row) < 0) out.push(row); });
  return out;
}
function buildFaults(files) {
  const bad = [];
  const faqStart = files.help.indexOf('id="faq"');
  const faqEnd = files.help.indexOf('id="queue-runs"');
  const faq = faqStart >= 0 && faqEnd > faqStart ? files.help.slice(faqStart, faqEnd) : "";
  if (!faq || faq.indexOf("What does Needs you mean?") < 0 || faq.indexOf("How do I install, give, or update a pack?") < 0 || faq.indexOf("How do I Connect a wallet?") < 0 || faq.indexOf("Install / give / update a .aia with Yes") < 0 || faq.indexOf("No silent charge") < 0 || faq.indexOf("Connect existing wallet") < 0 || faq.indexOf("Not Wallet.AIA") < 0 || faq.indexOf("Collect stays HOLD") < 0) {
    bad.push("Help FAQ answers gone");
  }
  if (files.help.indexOf('id="faq"') < 0 || files.more.indexOf("/help#faq") < 0 || files.studio.indexOf("/help#faq") < 0) {
    bad.push("FAQ anchor broken");
  }
  if (files.help.indexOf("Yes / Stop / Kill") < 0 || files.help.indexOf("Collect stays HOLD") < 0 || files.help.indexOf("A person taps Yes — or Stops it — before it goes out.") < 0 || files.help.indexOf("Owner still taps Yes and Stop.") < 0) {
    bad.push("Help Yes/Stop or Collect HOLD copy gone");
  }
  const hasLoader = files.loader.indexOf('fetch("/developer.z64.txt"') >= 0 && files.loader.indexOf('DecompressionStream("gzip")') >= 0;
  if (!hasLoader || !files.pack || files.pack.indexOf("Needs you / prompt ask-who when a Desk AI asks") < 0 || files.pack.indexOf("Install / give / update a .aia with Yes") < 0 || files.pack.indexOf("Connect existing wallet") < 0 || files.pack.indexOf("not Wallet.AIA") < 0) {
    bad.push("Studio FAQ copy gone");
  }
  if (files.more.indexOf("/help#faq") < 0 || files.more.indexOf("Short answers. Install pack or Give pack with Yes.") < 0 || files.more.indexOf("You tap Yes or Stop.") < 0) {
    bad.push("More FAQ link or Yes rail gone");
  }
  if (faq.indexOf("No silent charge") < 0 || faq.indexOf("Install / give / update a .aia with Yes") < 0 || /charged:\s*true/.test(files.pack || "") || /action:\s*"payout"|action:\s*"withdraw"/.test(files.pack || "")) {
    bad.push("install or charge without Yes");
  }
  return unique(bad);
}
function applyMutant(kind, files) {
  const next = { help: files.help, more: files.more, studio: files.studio, loader: files.loader, pack: files.pack };
  if (kind === "Help FAQ answers gone") {
    next.help = next.help
      .replace(/What does Needs you mean\?/g, "What changed?")
      .replace(/How do I install, give, or update a pack\?/g, "How do I skip a pack?")
      .replace(/How do I Connect a wallet\?/g, "How do I skip a wallet?")
      .replace(/Install \/ give \/ update a \.aia with Yes/g, "Install on its own")
      .replace(/No silent charge/g, "Silent charge is fine")
      .replace(/Connect existing wallet/g, "Skip the wallet")
      .replace(/Not Wallet\.AIA/g, "Wallet.AIA is fine")
      .replace(/Collect stays HOLD/g, "Collect is live");
  } else if (kind === "FAQ anchor broken") {
    next.help = next.help.replace(/id="faq"/g, 'id="gone-faq"');
    next.more = next.more.replace(/\/help#faq/g, "/help#gone");
    next.studio = next.studio.replace(/\/help#faq/g, "/help#gone");
  } else if (kind === "Help Yes/Stop or Collect HOLD copy gone") {
    next.help = next.help
      .replace(/Yes \/ Stop \/ Kill/g, "It goes out on its own")
      .replace(/Collect stays HOLD/g, "Collect is live")
      .replace(/A person taps Yes — or Stops it — before it goes out\./g, "It goes out on its own.")
      .replace(/Owner still taps Yes and Stop\./g, "Owner does not tap.");
  } else if (kind === "Studio FAQ copy gone") {
    next.pack = next.pack
      .replace(/Needs you \/ prompt ask-who when a Desk AI asks/g, "when the desk asks")
      .replace(/Install \/ give \/ update a \.aia with Yes/g, "Install on its own")
      .replace(/Connect existing wallet/g, "Skip the wallet")
      .replace(/not Wallet\.AIA/g, "Wallet.AIA is fine");
  } else if (kind === "More FAQ link or Yes rail gone") {
    next.more = next.more
      .replace(/\/help#faq/g, "/help#gone")
      .replace(/Short answers\. Install pack or Give pack with Yes\./g, "Skip the FAQ.")
      .replace(/You tap Yes or Stop\./g, "It goes out on its own.");
  } else if (kind === "install or charge without Yes") {
    next.help = next.help
      .replace(/No silent charge/g, "Silent charge is fine")
      .replace(/Install \/ give \/ update a \.aia with Yes/g, "Install on its own");
    next.pack = next.pack + "\ncharged: true\n{ action: \"payout\" }";
  }
  return next;
}

let failed = 0;
function fail(msg) { failed += 1; console.error("FAIL " + msg); }
function pass(msg) { console.log("ok  " + msg); }

const files = { help: help, more: more, studio: studio, loader: studioJs, pack: studioPack };
const live = buildFaults(files);
if (live.length) fail("help FAQ behaviour drifted: " + live.join("; "));
else pass("Help FAQ answers, anchors, Yes/Stop and Collect HOLD, and Studio pack FAQ still hold");

const mutants = [
  "Help FAQ answers gone",
  "FAQ anchor broken",
  "Help Yes/Stop or Collect HOLD copy gone",
  "Studio FAQ copy gone",
  "More FAQ link or Yes rail gone",
  "install or charge without Yes"
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
  console.error("check-help-faq failed");
  process.exit(1);
}

console.log("check-help-faq: ok");

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
function headerOf(html, name) {
  const m = html.match(/<header\b[\s\S]*?<\/header>/i);
  if (!m) throw new Error(name + " missing header");
  return m[0];
}

const index = read("index.html");
const how = read("how.html");
const setup = read("setup.html");
const help = read("help.html");
const examples = read("examples.html");
const playbook = read("desk-playbook.js");
const yesNo = read("ACCOUNT-YES-NO.md");
const packMd = read("PACK.md");
const pkg = read("package.json");
const nav = read("desk-nav.js");
const themeJs = read("theme.js");

const pages = [
  ["index.html", index],
  ["how.html", how],
  ["setup.html", setup]
];

pages.forEach(function (row) {
  const name = row[0];
  const html = row[1];
  const hdr = headerOf(html, name);
  ["How", "Setup", "Help", "Desk"].forEach(function (label) {
    if (!new RegExp(">" + label + "<").test(hdr)) {
      throw new Error(name + " header missing " + label);
    }
  });
  mustNot(hdr, "grandma", name + " header grandma");
  must(html, ">Open desk<", name + " Open desk CTA");
  must(html, ">Talk<", name + " Talk CTA");
  must(html, ">Give pack<", name + " Give pack CTA");
  must(html, ">Update pack<", name + " Update pack CTA");
  must(html, "drop.html#talk", name + " Talk href");
  must(html, "history.html", name + " Give/Update pack rail");
  must(html, "One AIA account", name + " one-account line");
  must(html, "Give is the file", name + " Give is the file");
  must(html, "Update is install again", name + " Update is install again");
  must(html, "Connect existing wallet", name + " Connect existing wallet");
  must(html, "Not Wallet.AIA", name + " not Wallet.AIA");
  must(html, "Creators Studio", name + " Creators Studio");
  mustNot(html, "grandma", name + " grandma brand");
  mustNot(html, "Decentraweb", name + " Decentraweb mint lesson");
  mustNot(html, "approve-registration", name + " register-approve lesson");
  mustNot(html, "Register .aia", name + " Register .aia lesson");
  mustNot(html, "Bridge locked", name + " Bridge mint lesson");
  mustNot(html, "How to mint", name + " mint how-to");
  mustNot(html, "AIA coin", name + " AIA coin");
  mustNot(html, "compute credits", name + " compute credits");
  mustNot(html, "drop-pack.js", name + " loads drop-pack.js");
  mustNot(html, "X-Session", name + " admin X-Session jargon");
  mustNot(html, "Hashed session", name + " hashed-session jargon");
  mustNot(html, "implementation path", name + " implementation-path jargon");
});

must(index, "On one AIA account", "index one-account section");
must(index, "More desks", "index more desks");
must(index, "Collect stays HOLD until Yes + a real money pipe.", "index follow-up Collect HOLD");
must(index, "Bill due on the card. Collect HOLD until Yes + a real money pipe.", "index Bills Collect HOLD");
must(index, "Name your desk", "index doer copy");

must(how, "Drop the work. You tap Yes or Stop.", "how doer copy");
mustNot(how, "You tap yes or no.", "how Yes or No as rail");
must(how, "Yes / Stop / Kill", "how Yes / Stop / Kill");
must(yesNo, "How lead / Talk / public Drop leftover", "ACCOUNT-YES-NO names How Yes-or-No leftover");
must(packMd, "How lead / Talk / public Drop leftover", "PACK.md names How Yes-or-No leftover");
must(yesNo, "Create / market / engine / grok leftover", "ACCOUNT-YES-NO names Create Yes-or-No leftover");
must(packMd, "Create / market / engine / grok leftover", "PACK.md names Create Yes-or-No leftover");
must(how, "ai.aia", "how names ai.aia door");
must(how, "not a mint lesson", "how does not teach mint");
mustNot(how, "Send or Stop", "how Send as rail");
mustNot(how, "until Send", "how until Send");

must(setup, "Add a rule if you need one", "setup doer copy");
must(setup, "Collect HOLD until Yes + a real money pipe.", "setup Consign HOLD");
must(setup, "Your MetaMask or WalletConnect", "setup wallet honesty");

mustNot(nav, "drop-pack.js", "desk-nav loads drop-pack.js");
must(themeJs, 'id: "help", href: "/help", label: "Help"', "theme.js shared nav Help");
must(themeJs, 'id: "how", href: "/how", label: "How"', "theme.js shared nav How");
must(themeJs, 'id: "setup", href: "/setup", label: "Setup"', "theme.js shared nav Setup");
must(themeJs, 'id: "desk", href: "/desk", label: "Desk"', "theme.js shared nav Desk");
["index.html", "how.html", "setup.html"].forEach(function (name) {
  must(read(name), "aia-tip.js", name + " loads field tips");
  must(read(name), "data-aia-tip", name + " has a field tip");
});

const helpPlay = help.slice(help.indexOf('id="playbook-card"'), help.indexOf('id="world"'));
if (!helpPlay) throw new Error("help.html playbook card missing");
must(helpPlay, "One AIA account", "help playbook one account");
must(helpPlay, "not a mint lesson", "help playbook does not teach mint");
mustNot(helpPlay, "implementation path", "help playbook implementation-path jargon");
mustNot(helpPlay, "orange until DNS", "help playbook DNS mint how-to");
mustNot(helpPlay, "www.ai.aia", "help playbook www.ai.aia mint door");
mustNot(helpPlay, "Hashed session", "help playbook hashed-session jargon");
mustNot(help, "Hashed session", "help hashed-session jargon");
mustNot(help, "X-Session", "help X-Session jargon");
must(help, "A person taps Yes — or Stops it — before it goes out.", "help lead Yes rail");
must(help, ">Give pack<", "help Give pack CTA");
must(help, ">Update pack<", "help Update pack CTA");
mustNot(help, "sends the draft — or Stops", "help lead Send as rail");
mustNot(help, "post it, text it", "help Yes as outbound post");
mustNot(help, "streaming ETH", "help streaming ETH");
mustNot(help, "state channel", "help L2 state channel");
mustNot(help, "DID login", "help DID login");

const helpFirst = help.slice(help.indexOf("<h2>First day</h2>"), help.indexOf("<h2>Pages that exist</h2>"));
if (!helpFirst) throw new Error("help.html First day card missing");
must(helpFirst, "not a mint lesson", "help First day Desk AI does not teach mint");
mustNot(helpFirst, "orange until DNS", "help First day DNS mint how-to");
mustNot(helpFirst, "www.ai.aia", "help First day www.ai.aia mint door");

mustNot(examples, "Hashed session", "examples hashed-session jargon");
mustNot(examples, "X-Session", "examples X-Session jargon");
must(examples, "This phone remembers you", "examples stay-on-phone");
must(examples, "Up to 8 phones", "examples eight phones");

must(playbook, "compact || embed", "playbook hides DNS hold on world embed");
must(playbook, "not a mint lesson", "playbook world embed does not teach mint");
must(playbook, "orange until DNS", "playbook Studio still names ai.aia orange HOLD");
must(playbook, "www.ai.aia", "playbook Studio still names www.ai.aia");

must(yesNo, "check-world-home.js", "ACCOUNT-YES-NO records world-home honesty");
must(yesNo, "index.html`, `how.html`, `setup.html", "ACCOUNT-YES-NO names world-home pages");
must(yesNo, "help.html` `#playbook-card", "ACCOUNT-YES-NO names world Help playbook");
must(yesNo, "`examples.html` Stay on this phone", "ACCOUNT-YES-NO names examples session honesty");
must(yesNo, "help.html` lead", "ACCOUNT-YES-NO names world Help lead Yes rail");
must(packMd, "Open desk", "PACK.md names Open desk CTA");
must(packMd, "Give pack", "PACK.md names Give pack");
must(packMd, "not a mint lesson", "PACK.md names world Help playbook");
must(pkg, "check-world-home.js", "package.json runs check-world-home");

console.log("check-world-home: ok");

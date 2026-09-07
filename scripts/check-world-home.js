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

must(how, "Drop the work. You tap yes or no.", "how doer copy");
must(how, "Yes / Stop / Kill", "how Yes / Stop / Kill");
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

must(yesNo, "check-world-home.js", "ACCOUNT-YES-NO records world-home honesty");
must(yesNo, "index.html`, `how.html`, `setup.html", "ACCOUNT-YES-NO names world-home pages");
must(packMd, "Open desk", "PACK.md names Open desk CTA");
must(packMd, "Give pack", "PACK.md names Give pack");
must(pkg, "check-world-home.js", "package.json runs check-world-home");

console.log("check-world-home: ok");

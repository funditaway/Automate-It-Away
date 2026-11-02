#!/usr/bin/env node
require("./_env-guard");
// Si.aia component: Human · Desk AI · SI triad on world home, Help, Account tip, and kind rails.
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
const acct = read("account-settings.js");
const index = read("index.html");
const how = read("how.html");
const help = read("help.html");
const yesNo = read("ACCOUNT-YES-NO.md");
const packMd = read("PACK.md");
const pkg = read("package.json");
const api = read("api/_account-settings.js");

must(tip, '"si-aia"', "si-aia tip id");
must(tip, "SI · si.aia", "si-aia tip title");
must(tip, "si.aia is the SI seat on AIA", "si-aia tip body names the seat");
must(tip, "hooks pipes and automations", "si-aia tip hooks pipes");
must(tip, "pauses before money, deletes, or messaging someone new", "si-aia tip pauses");
must(tip, "human owner must", "si-aia tip human owner unlocks");
must(tip, "Desk AIs draft", "si-aia tip Desk AIs draft");
must(tip, "Humans Yes / Stop / Kill", "si-aia tip human rail");
must(tip, "Collect stays HOLD", "si-aia tip Collect HOLD");
mustNot(tip, "System Integrator", "si-aia tip expands SI jargon");
mustNot(tip, "Wallet.AIA", "si-aia tip Wallet.AIA product");

must(acct, 'data-aia-tip", "si-aia"', "account settings wires si-aia tip");
must(acct, "KIND_HINT", "account settings kind hint");
must(acct, "SI · si.aia hooks pipes and automations", "account settings SI hint copy");
must(acct, 'KINDS = { human: "Human", ai: "AI", si: "SI" }', "account settings keeps SI label");
mustNot(acct.replace(/^\s*\/\/.*$/gm, ""), "Collect", "account settings page must not say Collect");

must(index, "SI · si.aia", "index SI card");
must(index, 'data-aia-tip="si-aia"', "index si-aia tip");
must(index, "An SI account hooks pipes and automations", "index SI copy");
must(index, "Payments are off for now", "index SI payments off");
mustNot(index, "Collect stays HOLD", "index SI Collect jargon");

must(how, "SI · si.aia", "how SI part");
must(how, 'data-aia-tip="si-aia"', "how si-aia tip");
must(how, "An SI account hooks pipes and automations", "how SI copy");
must(how, "Payments are off for now", "how SI payments off");
mustNot(how, "Collect stays HOLD", "how SI Collect jargon");
mustNot(how, "ai.aia is the door", "how still no ai.aia door lesson");

must(help, 'id="si-aia"', "help #si-aia card");
must(help, "SI · si.aia", "help SI title");
must(help, "One place for how humans, Desk AIs, and SIs share a desk", "help SI triad lead");
must(help, "One card, one idea", "help SI one card");
must(help, "AI prepares the work. The human verifies", "help SI prepares/verifies");
must(help, "Account kind <code>si</code>", "help SI account kind");
must(help, 'href="#si-aia"', "help pages TOC links #si-aia");

must(api, 'ACCOUNT_KINDS = ["human", "ai", "si"]', "api keeps si kind");
must(api, 'k !== "ai" && k !== "si"', "api SI pauses like AI");
must(api, "An AI or SI account can't change this itself", "api SI self-lock");

must(yesNo, "Si.aia component", "ACCOUNT-YES-NO names Si.aia component");
must(packMd, "Si.aia component:", "PACK.md names Si.aia component");
must(pkg, "node scripts/check-si-aia.js", "package.json test runs check-si-aia");

console.log("check-si-aia: ok");

#!/usr/bin/env node
// Together on one card: How / Help / More name Human · Desk AI · SI;
// AI prepares, human verifies; one card holds talk / drafts / decisions / actions
// in order; card timeline is the ordered face on Queue and History.
// SI seat canon is tip si-aia (Si.aia component). Tip together owns the card face.
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
const help = read("help.html");
const more = read("more.html");
const tip = read("aia-tip.js");
const acct = read("account-settings.js");
const yesNo = read("ACCOUNT-YES-NO.md");
const packMd = read("PACK.md");
const pkg = read("package.json");
const rules = read("card-rules.js");

must(how, 'id="together"', "how together anchor");
must(how, "Together on one card", "how together heading");
must(how, "One place for how humans, Desk AIs, and SIs work together", "how one place");
must(how, "One card, one idea", "how one card one idea");
must(how, "Talk, drafts, decisions, and actions stay on the card, in order", "how ordered on card");
must(how, "AI prepares the work. The human verifies", "how AI prepares human verifies");
must(how, 'data-aia-tip="together"', "how together tip");
must(how, 'data-aia-tip="si-aia"', "how SI tip uses si-aia");
must(how, "SI · si.aia", "how SI · si.aia label");
must(how, "Yes / Stop / Kill stay human", "how Yes Stop Kill human");
mustNot(how, "sub-agent mesh", "how mesh");
mustNot(how, "system integrator", "how expanded SI jargon");
mustNot(how, "account-si", "how retired account-si tip");
mustNot(how, "account-kind", "how retired account-kind tip");

must(help, 'id="together"', "help together anchor");
must(help, "Humans, AIs, and SIs on one card", "help together title");
must(help, "AI prepares the work. The human verifies", "help AI prepares");
must(help, "One card, one idea", "help one card");
must(help, "Talk, drafts, decisions, and actions stay on the card, in order", "help ordered");
must(help, "how.html#together", "help links How together");
must(help, 'href="#together"', "help toc together");
must(help, 'href="#si-aia"', "help links si-aia");
must(help, "SI · si.aia", "help SI · si.aia");
mustNot(help, "sub-agent mesh", "help mesh");

must(more, 'href="/how#together"', "more Together link");
must(more, "Together on one card", "more Together title");
must(more, 'data-aia-tip="together"', "more together tip");

must(tip, '"together"', "together tip");
must(tip, '"si-aia"', "si-aia tip");
must(tip, "AI prepares the work. The human verifies", "together tip AI prepares");
must(tip, "si.aia is the SI seat on AIA", "si-aia tip body");
mustNot(tip, '"account-si"', "retired account-si tip");
mustNot(tip, '"account-kind"', "retired account-kind tip");

must(acct, 'data-aia-tip", "si-aia"', "account settings wires si-aia tip");
must(acct, "KIND_HINT", "account settings KIND_HINT");

must(rules, "One card, one idea. Stay inside this card's topic. Keep its talk, drafts, decisions, and actions here, in order.", "card-rules rule 1");

must(yesNo, "Together on one card leftover", "ACCOUNT-YES-NO names Together leftover");
must(packMd, "Together on one card leftover", "PACK.md names Together leftover");
must(pkg, "check-together.js", "package.json runs check-together");
must(pkg, "check-card-timeline.js", "package.json runs check-card-timeline");

console.log("check-together: ok");

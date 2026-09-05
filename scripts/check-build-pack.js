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
const packMd = read("PACK.md");
const yesNo = read("ACCOUNT-YES-NO.md");

must(help, 'id="build-pack"', "help.html build-pack card");
must(help, "Build a pack / desk AI", "help.html build-pack title");
must(help, "Not legal advice", "help.html not legal advice");
must(help, "name@account.aia", "help.html inbound name");
must(help, "optional wait", "help.html optional wait");
must(help, "desk AI drafts the card", "help.html desk AI drafts");
must(help, "Yes / Stop / Kill", "help.html Yes/Stop/Kill");
must(help, "Needs you", "help.html Needs you fallback");
must(help, "Talk to AIA", "help.html Talk to AIA fallback");
must(help, "/dev", "help.html /dev");
must(help, "pipes and keys", "help.html buyer pipes/keys");
must(help, "illustrative only", "help.html sample JSON illustrative");
must(help, "not a bindings product", "help.html no bindings product");
must(help, '"when": "pipe"', "help.html sample when");
must(help, "Yes is not a collect charge", "help.html Yes ≠ collect");
must(help, "Collect stays HOLD", "help.html Collect HOLD");

must(help, 'id="desk-orch"', "help.html desk-orch card");
must(help, "Desk orchestration is When · If · Then", "help.html orchestration");
must(help, "Sequential is one rule after another", "help.html sequential");
must(help, "Conditional is If", "help.html conditional");
must(help, "Human in the loop is Yes / Stop / Kill", "help.html HITL");
must(help, "Not a Router Node", "help.html no Router Node");
must(help, "Not a sub-agent mesh", "help.html no sub-agent mesh");
must(help, "Not a node canvas", "help.html no node canvas");

must(help, 'id="ideas-queue"', "help.html ideas-queue card");
must(help, "Drop → Qualify → card → Yes / Stop", "help.html ideas path");
must(help, "past / now / next", "help.html history tense");
must(help, "No effort or token estimate", "help.html no token estimate");

must(help, "How do I work with or for AIA?", "help.html work-with FAQ");
must(help, "careers portal", "help.html no careers portal");
must(help, "certified partner program", "help.html no partner program");
must(help, "No separate license SKU", "help.html no license SKU");
must(help, "desk account and you install a pack", "help.html desk + install");
must(help, "Collect and payouts HOLD", "help.html collect payouts HOLD");
must(help, "No Free / Pro / Agency license tiers", "help.html no license tiers");
must(help, "No merchant-of-record", "help.html no MoR");
must(help, "No auto EULA", "help.html no auto EULA");

must(studio, "Build a pack / desk AI.", "studio build-pack one-liner");
must(studio, "/help#build-pack", "studio build-pack link");
must(studio, "Yes is not a collect charge", "studio Yes ≠ collect");
must(studio, "No separate license SKU", "studio no license SKU");
must(studio, "careers portal", "studio no careers portal");
must(studioJs, "Build a pack / desk AI.", "studio js build-pack one-liner");
must(studioJs, "/help#build-pack", "studio js build-pack link");
must(studioJs, "No separate license SKU", "studio js no license SKU");
must(more, "/help#build-pack", "more.html build-pack link");

must(packMd, "Build a pack / desk AI", "PACK.md build-pack");
must(packMd, "Desk orchestration", "PACK.md orchestration");
must(yesNo, "Build a pack / desk AI", "ACCOUNT-YES-NO build-pack");
must(yesNo, "Desk orchestration", "ACCOUNT-YES-NO orchestration");

const build = help.slice(help.indexOf('id="build-pack"'), help.indexOf('id="ideas-queue"'));
if (/\$47|\$197|\$50|300 hours|10\s*[–-]\s*15\s*minutes/i.test(build)) {
  throw new Error("build-pack invented $ / token / hour table");
}

["BUYER_ENVIRONMENT_BINDINGS", "aiastudios.app", "Login Kit"].forEach(function (bit) {
  if (help.includes(bit) || studio.includes(bit) || studioJs.includes(bit)) {
    throw new Error("invented fiction on public Help/Studio: " + bit);
  }
});

console.log("check-build-pack: ok");

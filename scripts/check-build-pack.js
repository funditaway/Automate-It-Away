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
const examples = read("examples.html");
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
must(help, "Thin App / webhook pack", "help.html app/webhook pack example");
must(help, '"pipes": ["webhook"]', "help.html webhook pipes");
must(help, "Yes before outbound", "help.html Yes before outbound");
must(help, "Buyer binds their own keys on Pipes", "help.html buyer keys on Pipes");
must(help, "Not a listed SKU", "help.html not listed SKU");

must(help, 'id="desk-orch"', "help.html desk-orch card");
must(help, "Desk orchestration is When · If · Then", "help.html orchestration");
must(help, "Sequential is one rule after another", "help.html sequential");
must(help, "Conditional is If", "help.html conditional");
must(help, "Human in the loop is Yes / Stop / Kill", "help.html HITL");
must(help, "Not a Router Node", "help.html no Router Node");
must(help, "Not a mesh of Desk AIs", "help.html no mesh of Desk AIs");
must(help, "Not a node canvas", "help.html no node canvas");
if (help.includes("Workflow &amp; Agent Pack Creator") || help.includes("Workflow & Agent Pack Creator")) {
  throw new Error("help.html still titles Workflow & Agent Pack Creator");
}
must(help, "<dt>On-desk Pack Creator</dt>", "help.html On-desk Pack Creator");
if (help.includes("sub-agent mesh")) throw new Error("help.html still says sub-agent mesh");
if (packMd.includes("**Workflow & Agent Pack Creator")) throw new Error("PACK.md still titles Workflow & Agent Pack Creator");
must(packMd, "**On-desk Pack Creator:**", "PACK.md On-desk Pack Creator");
must(packMd, "Not a mesh of Desk AIs", "PACK.md no mesh of Desk AIs");
must(yesNo, "Help Pack Creator leftover", "ACCOUNT-YES-NO leftover bullet");

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
must(studio, "App / webhook", "studio app/webhook example");
must(studio, "Yes before outbound", "studio Yes before outbound");
must(studioJs, "Build a pack / desk AI.", "studio js build-pack one-liner");
must(studioJs, "/help#build-pack", "studio js build-pack link");
must(studioJs, "No separate license SKU", "studio js no license SKU");
must(studioJs, "App / webhook", "studio js app/webhook example");
must(studioJs, "Yes before outbound", "studio js Yes before outbound");
must(more, "/help#build-pack", "more.html build-pack link");
must(more, "/dev#first-pack", "more.html first-pack link");
must(more, "First .aia pack", "more.html first-pack title");

must(studio, 'id="first-pack"', "studio first-pack card");
must(studio, "First .aia pack", "studio first-pack title");
must(studio, "Webhook is the live pipe", "studio first-pack webhook");
must(studio, "Buyer binds their own keys on Pipes", "studio first-pack buyer keys");
must(studio, "Not a bindings product", "studio first-pack no bindings product");
must(studio, "Yes / Stop / Kill before anything leaves", "studio first-pack Yes before outbound");
must(studio, "Download .aia", "studio first-pack Download .aia");
must(studio, "Install .aia", "studio first-pack Install .aia");
must(studio, "Not a CLI", "studio first-pack not a CLI");
must(studio, "Not a signed DID", "studio first-pack not signed DID");
must(studio, "Not a stake publish", "studio first-pack not stake publish");
must(studio, "No AAM mainnet", "studio first-pack no AAM");
must(studio, "No paymasters", "studio first-pack no paymasters");
must(studio, "No AIA token", "studio first-pack no AIA token");
must(studio, "No DAO slash", "studio first-pack no DAO slash");
must(studio, "No DePIN", "studio first-pack no DePIN");
must(studio, "No Grandma brand", "studio first-pack no Grandma");
must(studioJs, "First .aia pack.", "studio js first-pack one-liner");
must(studioJs, "#first-pack", "studio js first-pack link");
must(help, "/dev#first-pack", "help.html first-pack link");

must(examples, "App / webhook", "examples App/webhook pack");
must(examples, "Buyer binds their own keys", "examples buyer keys");
must(examples, "Yes / Stop / Kill before anything leaves", "examples Yes before outbound");
must(examples, "Not a listed SKU", "examples not listed SKU");
must(examples, "Not a bindings product", "examples no bindings product");
must(examples, "help.html#build-pack", "examples links build-pack");

must(packMd, "Build a pack / desk AI", "PACK.md build-pack");
must(packMd, "Desk orchestration", "PACK.md orchestration");
must(packMd, "Thin App / webhook pack example", "PACK.md app/webhook example");
must(packMd, "/dev#first-pack", "PACK.md first-pack docs");
must(yesNo, "Build a pack / desk AI", "ACCOUNT-YES-NO build-pack");
must(yesNo, "Desk orchestration", "ACCOUNT-YES-NO orchestration");
must(yesNo, "Thin App / webhook pack example", "ACCOUNT-YES-NO app/webhook example");
must(yesNo, "/dev#first-pack", "ACCOUNT-YES-NO first-pack docs");

const build = help.slice(help.indexOf('id="build-pack"'), help.indexOf('id="ideas-queue"'));
if (/\$47|\$197|\$50|300 hours|10\s*[–-]\s*15\s*minutes/i.test(build)) {
  throw new Error("build-pack invented $ / token / hour table");
}

["BUYER_ENVIRONMENT_BINDINGS", "aiastudios.app", "Login Kit", "aia-studio", "streaming USDC", "IPFS"].forEach(function (bit) {
  if (help.includes(bit) || studio.includes(bit) || studioJs.includes(bit) || examples.includes(bit)) {
    throw new Error("invented fiction on public Help/Studio/Examples: " + bit);
  }
});

["cryptographically signed", "streaming USDC", "aia-studio CLI", "DID manifest"].forEach(function (bit) {
  if (studio.includes(bit) || studioJs.includes(bit)) {
    throw new Error("fake first-pack docs on Studio: " + bit);
  }
});

console.log("check-build-pack: ok");

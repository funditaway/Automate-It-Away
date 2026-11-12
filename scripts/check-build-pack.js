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
must(help, "Buyer binds their own keys and devices on Pipes", "help.html buyer keys on Pipes");
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
must(yesNo, "Legal / Studio Desk AI leftover", "ACCOUNT-YES-NO Legal / Studio leftover");
if (help.includes("lead qualify bot")) throw new Error("help.html still says lead qualify bot");
must(help, "lead qualify in 48h", "help.html DFY lead qualify");

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
must(studioPack, "Build a pack / desk AI.", "studio pack build-pack one-liner");
must(studioPack, "/help#build-pack", "studio pack build-pack link");
must(studioPack, "No separate license SKU", "studio pack no license SKU");
must(studioPack, "App / webhook", "studio pack app/webhook example");
must(studioPack, "Yes before outbound", "studio pack Yes before outbound");
must(studioPack, "Yes is not a collect charge", "studio pack Yes ≠ collect");
must(studioPack, "Collect stays HOLD", "studio pack Collect HOLD");
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
must(studioPack, "First .aia pack.", "studio pack first-pack one-liner");
must(studioPack, "#first-pack", "studio pack first-pack link");
must(help, "/dev#first-pack", "help.html first-pack link");

must(examples, "App / webhook", "examples App/webhook pack");
must(examples, "Buyer binds their own keys", "examples buyer keys");
must(examples, "Yes / Stop / Kill before outbound or hardware", "examples Yes before outbound");
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
  if (help.includes(bit) || studio.includes(bit) || studioJs.includes(bit) || studioPack.includes(bit) || examples.includes(bit)) {
    throw new Error("invented fiction on public Help/Studio/Examples: " + bit);
  }
});

["cryptographically signed", "streaming USDC", "aia-studio CLI", "DID manifest"].forEach(function (bit) {
  if (studio.includes(bit) || studioJs.includes(bit) || studioPack.includes(bit)) {
    throw new Error("fake first-pack docs on Studio: " + bit);
  }
});


function sliceFn(src, name) {
  const start = src.indexOf("async function " + name) >= 0 ? src.indexOf("async function " + name) : src.indexOf("function " + name);
  if (start < 0) return "";
  const next = src.slice(start + 10).search(/\n  (async )?function /);
  return src.slice(start, next >= 0 ? start + 10 + next : start + 1400);
}
const bootFn = sliceFn(studioPack, "boot");
const installFn = sliceFn(studioPack, "installAia");
const bindFn = sliceFn(studioPack, "bindLab");
const submitFn = sliceFn(studioPack, "submitPack");
const saveFn = sliceFn(studioPack, "saveDraft");
if (!installFn) throw new Error("Studio missing installAia");
if (!bindFn || bindFn.indexOf("install-aia") < 0 || bindFn.indexOf("installAia") < 0) {
  throw new Error("Install .aia must be a human tap on #install-aia");
}
if (bootFn && (bootFn.indexOf("installAia") >= 0 || bootFn.indexOf("install-aia") >= 0 || bootFn.indexOf("submitPack") >= 0 || bootFn.indexOf("submit-pack") >= 0)) {
  throw new Error("Studio boot must not install or publish a pack");
}
if (installFn.indexOf("aia-file") < 0 || installFn.indexOf("Pick a .aia pack file first") < 0) {
  throw new Error("Install .aia must wait for a file and a human tap");
}
if (saveFn.indexOf("list-pack") >= 0 && /status:\s*"listed"|submit:\s*true/.test(saveFn)) {
  throw new Error("Save draft must not list the pack on Market");
}
if (/charged:\s*true/.test(studioPack)) throw new Error("Studio pack must not send charged:true");
if (/action:\s*"payout"|action:\s*"withdraw"|action:\s*"pay-out"/.test(studioPack)) {
  throw new Error("Studio pack must not pay out");
}
if (studio.indexOf("Yes / Stop / Kill before anything leaves") < 0) {
  throw new Error("Studio first-pack must keep Yes before anything leaves");
}

function unique(rows) {
  const out = [];
  rows.forEach(function (row) { if (out.indexOf(row) < 0) out.push(row); });
  return out;
}
function buildFaults(loader, pack, html) {
  const bad = [];
  const hasLoader = loader.indexOf('fetch("/developer.z64.txt"') >= 0 && loader.indexOf('DecompressionStream("gzip")') >= 0;
  if (!hasLoader || !pack || pack.indexOf("Build a pack / desk AI.") < 0 || pack.indexOf("/help#build-pack") < 0 || pack.indexOf("First .aia pack.") < 0 || pack.indexOf("#first-pack") < 0) {
    bad.push("Studio build-pack copy gone");
  }
  if (pack.indexOf("Yes before outbound") < 0 || html.indexOf("Yes / Stop / Kill before anything leaves") < 0) {
    bad.push("Yes before outbound gone");
  }
  const boot = sliceFn(pack, "boot");
  const install = sliceFn(pack, "installAia");
  const bind = sliceFn(pack, "bindLab");
  const save = sliceFn(pack, "saveDraft");
  if (!install || !bind || bind.indexOf("install-aia") < 0 || bind.indexOf("installAia") < 0 || (boot && (boot.indexOf("installAia") >= 0 || boot.indexOf("install-aia") >= 0)) || (install && (install.indexOf("aia-file") < 0 || install.indexOf("Pick a .aia pack file first") < 0))) {
    bad.push("install without Yes");
  }
  if (/charged:\s*true/.test(pack) || pack.indexOf("Yes is not a collect charge") < 0) {
    bad.push("charge without Yes");
  }
  if ((boot && (boot.indexOf("submitPack") >= 0 || boot.indexOf("submit-pack") >= 0)) || (save && /status:\s*"listed"|submit:\s*true/.test(save)) || /action:\s*"payout"|action:\s*"withdraw"|action:\s*"pay-out"/.test(pack)) {
    bad.push("list or payout without Yes");
  }
  return unique(bad);
}
function applyMutant(kind, files) {
  const next = { loader: files.loader, pack: files.pack, html: files.html };
  if (kind === "Studio build-pack copy gone") {
    next.pack = next.pack
      .replace(/Build a pack \/ desk AI\./g, "Skip the lab.")
      .replace(/\/help#build-pack/g, "/help#skip")
      .replace(/First \.aia pack\./g, "Skip the pack.")
      .replace(/#first-pack/g, "#skip");
  } else if (kind === "Yes before outbound gone") {
    next.pack = next.pack.replace(/Yes before outbound/g, "Sends outbound now");
    next.html = next.html.replace(/Yes \/ Stop \/ Kill before anything leaves/g, "It leaves on its own");
  } else if (kind === "install without Yes") {
    next.pack = next.pack.replace("async function boot()", "async function boot(){ installAia(); }\nasync function bootOld")
      .replace("Pick a .aia pack file first", "Installing anyway")
      .replace(/aia-file/g, "gone-file");
  } else if (kind === "charge without Yes") {
    next.pack = next.pack.replace(/Yes is not a collect charge/g, "Yes is the collect charge") + "\ncharged: true";
  } else if (kind === "list or payout without Yes") {
    next.pack = next.pack.replace("async function boot()", "async function boot(){ submitPack(); }\nasync function bootOld") + '\n{ action: "payout" }';
  }
  return next;
}

let failed = 0;
function fail(msg) { failed += 1; console.error("FAIL " + msg); }
function pass(msg) { console.log("ok  " + msg); }

const files = { loader: studioJs, pack: studioPack, html: studio };
const live = buildFaults(files.loader, files.pack, files.html);
if (live.length) fail("build pack behaviour drifted: " + live.join("; "));
else pass("build-pack honesty, Yes before outbound, and no silent install/charge/payout still hold");

const mutants = [
  "Studio build-pack copy gone",
  "Yes before outbound gone",
  "install without Yes",
  "charge without Yes",
  "list or payout without Yes"
];
let caught = 0;
mutants.forEach(function (kind) {
  const next = applyMutant(kind, files);
  const faults = buildFaults(next.loader, next.pack, next.html);
  if (faults.indexOf(kind) < 0) fail("mutant missed: " + kind + " (got " + JSON.stringify(faults) + ")");
  else { caught += 1; pass("mutant caught: " + kind); }
});
if (caught !== mutants.length) fail("mutants: " + caught + "/" + mutants.length + " caught");
else pass("mutants: " + caught + "/" + mutants.length + " caught");
if (failed) {
  console.error("check-build-pack failed");
  process.exit(1);
}

console.log("check-build-pack: ok");

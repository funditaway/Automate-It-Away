#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-implement-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const file = path.join(root, "packs", "aia-implement.json");
if (!fs.existsSync(file)) {
  fail("missing packs/aia-implement.json");
  process.exit(1);
}
const raw = fs.readFileSync(file, "utf8");
let pack;
try { pack = JSON.parse(raw); } catch (e) {
  fail("aia-implement.json is not JSON");
  process.exit(1);
}

if (pack.id !== "aia-implement") fail("id must be aia-implement"); else pass("id aia-implement");
if (pack.name !== "Four steps on this desk") fail("name Four steps on this desk"); else pass("name");
if (pack.family !== "Automate It Away") fail("family Automate It Away"); else pass("family");

["capture", "qualify", "do", "collect", "follow", "taps", "kill", "pipes", "artifacts"].forEach(function (k) {
  if (!Array.isArray(pack[k]) || !pack[k].length) fail("missing Packer key " + k);
  else pass("packer " + k);
});

["Find the leaks", "Hook the pipes", "Name a desk AI", "You still tap"].forEach(function (bit) {
  if (!JSON.stringify(pack).includes(bit)) fail("pack missing " + bit);
  else pass("pack " + bit);
});

if (!Array.isArray(pack.rules) || pack.rules.length) fail("rules stay empty — path lives in rails/help");
else pass("empty rules");

if (/\$250|over \$250|placeholder=.?250/i.test(raw)) fail("no fake $250");
else pass("no $250");
if (/seed money|demo seed|Labeled DEMO/i.test(raw)) fail("no demo seed money");
else pass("no demo seed");
if (/White House|Action Plan|executive order/i.test(raw)) fail("must not reprint policy");
else pass("desk language, not a reprint");
if (/on-chain|blockchain|nft|wallet owned|minted/i.test(raw) && !/No fake on-chain/.test(raw)) fail("no fake on-chain");
else pass("no fake on-chain claim");

const pipes = (pack.pipes || []).map(function (p) { return String(p).toLowerCase(); });
if (pipes.indexOf("ebay") >= 0 || pipes.indexOf("mail") >= 0 || pipes.indexOf("gmail") >= 0) fail("no live eBay/mail pipes");
else pass("pipes webhook-only");
if (pipes.indexOf("webhook") < 0) fail("webhook pipe required");
else pass("webhook pipe");
if (!/Collect stays HOLD/.test(raw)) fail("Collect HOLD");
else pass("Collect HOLD");

const never = (pack.queue && pack.queue.never) || [];
["send", "stop", "pay"].forEach(function (w) {
  if (never.indexOf(w) < 0) fail("queue.never missing " + w);
  else pass("never " + w);
});

["leak", "pipe", "agent", "guard"].forEach(function (k) {
  if ((pack.kinds || []).indexOf(k) < 0) fail("kind " + k);
  else pass("kind " + k);
});

const playbook = read("desk-playbook.js");
["Find the leaks", "Hook the pipes", "Name a desk AI", "You still tap"].forEach(function (bit) {
  if (!playbook.includes(bit)) fail("desk-playbook.js missing " + bit);
  else pass("playbook " + bit);
});
if (!playbook.includes('href: "/drop"') || !playbook.includes('href: "/pipes"')) fail("playbook missing Drop/Pipes links");
else pass("playbook Drop + Pipes");
if (!playbook.includes("/create?kind=ai") || !playbook.includes("/studio")) fail("playbook missing Create/Studio AI links");
else pass("playbook Create + Studio");
if (!playbook.includes('href: "/rules"')) fail("playbook missing Rules");
else pass("playbook Rules");
if (!playbook.includes("/desk")) fail("playbook missing Qualify/Queue");
else pass("playbook Qualify on Queue");
if (playbook.includes("$250")) fail("playbook invented $250");
else pass("playbook no $250");
if (!playbook.includes("ai.aia") || !/orange until DNS|DNS stays orange/i.test(playbook)) fail("playbook must name ai.aia as orange HOLD");
else pass("playbook ai.aia is orange HOLD");
if (/ai\.aia is live|DNS is live|www\.ai\.aia is live/i.test(playbook)) fail("must not claim ai.aia is live");
else pass("playbook does not claim ai.aia live");

const pages = {
  "help.html": read("help.html"),
  "how.html": read("how.html"),
  "onboard.html": read("onboard.html"),
  "developer.html": read("developer.html"),
  "developer.js": read("developer.js")
};
["help.html", "how.html", "onboard.html", "developer.html"].forEach(function (name) {
  if (!pages[name].includes("desk-playbook.js")) fail(name + " must load desk-playbook.js");
  else pass(name + " loads playbook");
  if (!/data-aia-playbook|AIAPlaybook/.test(pages[name]) && name !== "developer.html") fail(name + " must mount the playbook");
  else if (name !== "developer.html") pass(name + " mounts playbook");
});
if (!pages["developer.js"].includes("AIAPlaybook") || !pages["developer.js"].includes("Four steps on this desk")) {
  fail("Studio must paint the four steps");
} else pass("Studio paints four steps");
if (!pages["developer.js"].includes("aia-implement")) fail("Studio missing aia-implement");
else pass("Studio links aia-implement");

["help.html", "how.html", "onboard.html"].forEach(function (name) {
  ["Find the leaks", "Hook the pipes", "Name a desk AI", "You still tap"].forEach(function (bit) {
    if (!pages[name].includes(bit) && !pages[name].includes("desk-playbook.js")) fail(name + " missing " + bit);
  });
  if (/White House|Action Plan/i.test(pages[name])) fail(name + " reprinted policy");
  else pass(name + " is desk language");
  if (!pages[name].includes("ai.aia")) fail(name + " missing ai.aia door");
  else pass(name + " names ai.aia");
});
if (!pages["developer.html"].includes("ai.aia")) fail("Studio missing ai.aia door");
else pass("Studio names ai.aia");

const catalog = read("api/_packs.js");
if (!catalog.includes("aia-implement")) fail("_packs.js catalog missing aia-implement");
else pass("catalog lists aia-implement");

const engineSrc = read("api/_engine.js");
if (!engineSrc.includes('"aia-implement":') && !engineSrc.includes('FACES["aia-implement"]')) fail("engine missing aia-implement face");
else pass("engine face source");
if (!engineSrc.includes('pack === "aia-implement"') && !engineSrc.includes('face.id === "aia-implement"')) fail("engine missing aia-implement brain/recs");
else pass("engine brain/recs");
if (/PACKS\s*=\s*\[[^\]]*aia-implement/.test(engineSrc.replace(/\s+/g, " "))) fail("PACKS must stay five engines");
else pass("PACKS stays five engines");

["create-desk.js", "pack-card.js", "drop-packs.js", "drop-pack.js", "drop-agent.js", "desk-queue-packs.js"].forEach(function (name) {
  const src = read(name);
  if (!src.includes("aia-implement")) fail(name + " missing aia-implement");
  else pass(name + " lists aia-implement");
});

const more = read("more.html");
if (!more.includes("Four steps") && !more.includes("desk-playbook.js")) fail("more.html missing four steps");
else pass("More shows the path");

const adoption = read("packs/aia-adoption.json");
if (!/Four steps|find the leaks/i.test(adoption)) fail("aia-adoption should point at the four steps");
else pass("adoption points at the path");

const engine = require("../api/_engine");
const face = engine.packFace("aia-implement");
if (!face || face.id !== "aia-implement" || face.family !== "Automate It Away") fail("engine face aia-implement");
else pass("engine face");
if (engine.PACKS.indexOf("aia-implement") >= 0) fail("aia-implement must not join PACKS engines");
else pass("not an engine");
if (engine.detectPack({ pack: "aia-implement", title: "Friday leak" }) !== "aia-implement") fail("stamped aia-implement must stay");
else pass("stamped pack stays");
const q = engine.qualifyJob({ pack: "aia-implement", title: "Oil-change lane", notes: "high volume low complexity" }, { slug: "path-desk", rules: [] });
if (q.pack !== "aia-implement") fail("qualify pack " + q.pack);
else if (/vita/i.test(JSON.stringify(q))) fail("Vita leaked");
else if (/\$250/.test(JSON.stringify(q))) fail("$250 leaked onto implement card");
else if (q.waitingOn === "owner" && /kid or school/i.test(q.next || q.why || "")) fail("empty desk inherited a pack example rule");
else pass("qualify implement card");
if (!/HOLD|tap|draft/i.test([q.draft, q.next].join(" "))) fail("implement draft should stay human-tap");
else pass("implement draft is human-tap");

try {
  if (fs.existsSync(store)) fs.unlinkSync(store);
} catch (e) {}

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("check-aia-implement ok");

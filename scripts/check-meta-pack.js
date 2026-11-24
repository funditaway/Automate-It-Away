#!/usr/bin/env node
require("./_env-guard");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const store = path.join(os.tmpdir(), "aia-meta-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

const file = path.join(root, "packs", "meta.json");
if (!fs.existsSync(file)) {
  fail("missing packs/meta.json");
  process.exit(1);
}
const raw = fs.readFileSync(file, "utf8");
let pack;
try { pack = JSON.parse(raw); } catch (e) {
  fail("meta.json is not JSON");
  process.exit(1);
}

if (pack.id !== "meta") fail("id must be meta"); else pass("id meta");
if (!/Meta\.aia/i.test(pack.name || "")) fail("name Meta.aia"); else pass("name");
if (pack.family !== "Meta.aia") fail("family Meta.aia"); else pass("family Meta.aia");
if (!pack.claude_included) fail("claude_included"); else pass("claude included");
if (!pack.meta_ready) fail("meta_ready"); else pass("meta ready");

["capture", "qualify", "do", "collect", "follow", "taps", "kill", "pipes", "artifacts", "kinds"].forEach(function (k) {
  if (!Array.isArray(pack[k]) || !pack[k].length) fail("missing Packer key " + k);
  else pass("packer " + k);
});

["lead", "house", "shop", "office", "front-desk", "setup", "support", "content"].forEach(function (k) {
  if ((pack.kinds || []).indexOf(k) < 0) fail("kinds missing " + k);
  else pass("kind " + k);
});

if (!Array.isArray(pack.includes) || pack.includes.length < 8) fail("need 8+ included .aia packs");
else pass("includes " + pack.includes.length);

if (!Array.isArray(pack.ais) || pack.ais.length < 10) fail("need Meta + Claude desk AIs");
else pass("desk AIs " + pack.ais.length);
const claudeAis = (pack.ais || []).filter(function (a) { return a && (a.type === "claude" || /claude/i.test(a.name || "")); });
if (claudeAis.length < 5) fail("need 5 Claude desk AIs");
else pass("claude AIs " + claudeAis.length);

if (!Array.isArray(pack.rules) || !pack.rules.length) fail("meta pack needs rules");
else pass("rules present");
if (pack.rules.length > 8) fail("rules must fit RULE_MAX 8, got " + pack.rules.length);
else pass("rules fit RULE_MAX");
const { flattenWorkflows } = require("../api/_lib");
const installRules = [].concat(pack.rules || [], flattenWorkflows(pack));
if (installRules.length > 8) fail("install would drop rules: " + installRules.length);
else pass("install keeps all " + installRules.length + " rules");

if (!/Collect stays HOLD/i.test(raw)) fail("Collect stays HOLD");
else pass("Collect HOLD");
if (!/AIA does not hold keys/i.test(raw)) fail("AIA does not hold keys");
else pass("no custodial keys");
if (!/Nothing silent|Update is install again/i.test(raw)) fail("nothing silent / update is install again");
else pass("nothing silent");
if (/\$250|over \$250|placeholder=.?250/i.test(raw)) fail("no fake $250");
else pass("no $250");
if (/70\s*%|20\s*%\s*AIA|creator economy 70/i.test(raw)) fail("must not invent 70/20/10 split");
else pass("no invented creator split");
if (/auto-?execute|silent send|auto-?charge/i.test(raw)) fail("must not claim auto-execute");
else pass("no auto-execute claims");

const pipes = (pack.pipes || []).map(function (p) { return String(p).toLowerCase(); });
if (pipes.indexOf("webhook") < 0) fail("webhook pipe required");
else pass("webhook pipe");

const never = (pack.queue && pack.queue.never) || [];
["send", "stop", "pay"].forEach(function (w) {
  if (never.indexOf(w) < 0) fail("queue.never missing " + w);
  else pass("never " + w);
});

const satellites = [
  "meta-world-desk.json",
  "meta-house.json",
  "meta-shop.json",
  "meta-front-desk.json",
  "meta-office.json",
  "meta-automations-account.json",
  "meta-creator-studio.json",
  "meta-setup.json",
  "meta-claude.json"
];
satellites.forEach(function (name) {
  const p = path.join(root, "packs", name);
  if (!fs.existsSync(p)) fail("missing packs/" + name);
  else {
    try {
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      if (!j.id) fail(name + " missing id");
      else if (!/Collect stays HOLD|HOLD until Yes|wait on Yes|Draft only|never/i.test(JSON.stringify(j))) fail(name + " missing rails voice");
      else pass("satellite " + name);
    } catch (e) { fail(name + " bad JSON"); }
  }
});

const worker = path.join(root, "workers", "aia-meta-worker.js");
if (!fs.existsSync(worker)) fail("missing workers/aia-meta-worker.js");
else pass("meta worker");
const workerSrc = fs.readFileSync(worker, "utf8");
if (!workerSrc.includes("/aia/card.created")) fail("worker missing card.created");
else pass("worker card.created");
if (!/draft only|DRAFT_READY|never send/i.test(workerSrc)) fail("worker missing draft-only rails");
else pass("worker draft-only");
if (/auto-?execute|broadcast|sendMail|charge\(/i.test(workerSrc)) fail("worker must not send/charge");
else pass("worker no send/charge");

const landing = path.join(root, "meta.html");
if (!fs.existsSync(landing)) fail("missing meta.html landing");
else pass("meta.html landing");
const landingSrc = fs.readFileSync(landing, "utf8");
if (!/Collect stays HOLD/i.test(landingSrc)) fail("landing missing Collect HOLD");
else pass("landing Collect HOLD");
if (!/AIA does not hold keys/i.test(landingSrc)) fail("landing missing no-keys rail");
else pass("landing no-keys");
if (/70\s*%\s*Creator|usage fees apply|per automation run|\$0\.02/i.test(landingSrc)) fail("landing must not invent fee table / 70-20-10");
else pass("no invented usage fees");
if (!landingSrc.includes("market.html?pack=meta") || !landingSrc.includes("packs/meta.json")) fail("landing missing market / pack JSON links");
else pass("landing links market + pack JSON");
if (!/Yes|Stop/i.test(landingSrc)) fail("landing missing Yes/Stop voice");
else pass("landing Yes/Stop voice");
if (!/Claude included/i.test(landingSrc)) fail("landing missing Claude included");
else pass("landing Claude included");

const catalog = fs.readFileSync(path.join(root, "api", "_packs.js"), "utf8");
if (!catalog.includes('id: "meta"') || !catalog.includes("packs/meta.json")) fail("_packs.js catalog missing meta");
else pass("catalog lists meta");

const engineSrc = fs.readFileSync(path.join(root, "api", "_engine.js"), "utf8");
if (!engineSrc.includes("meta:")) fail("engine missing meta face");
else pass("engine face source");
if (!engineSrc.includes('face.id === "meta"') && !engineSrc.includes('pack === "meta"')) fail("engine missing meta brain");
else pass("engine brain");
if (/PACKS\s*=\s*\[[^\]]*meta/.test(engineSrc.replace(/\s+/g, " "))) fail("PACKS must stay five engines");
else pass("PACKS stays five engines");

[
  ["create-desk.js", "meta"],
  ["pack-card.js", "meta"],
  ["drop-packs.js", "meta"],
  ["drop-pack.js", "meta"],
  ["drop-agent.js", "meta"],
  ["desk-queue-packs.js", "meta"],
  ["market-shop.js", "pack=meta"],
  ["market-shop.js", "/meta"],
  ["examples.html", "meta.html"],
  ["vercel.json", "/meta.html"]
].forEach(function (row) {
  const src = fs.readFileSync(path.join(root, row[0]), "utf8");
  if (!src.includes(row[1])) fail(row[0] + " missing " + row[1]);
  else pass(row[0] + " · " + row[1]);
});

function decodeStudio(blob) {
  try { return zlib.gunzipSync(Buffer.from(String(blob).replace(/\s+/g, ""), "base64")).toString("utf8"); }
  catch (e) {
    try { return zlib.inflateSync(Buffer.from(String(blob).replace(/\s+/g, ""), "base64")).toString("utf8"); }
    catch (e2) { return ""; }
  }
}
const studioPack = decodeStudio(fs.readFileSync(path.join(root, "developer.z64.txt"), "utf8"));
if (!studioPack.includes("pack=meta") || !studioPack.includes("Meta.aia")) fail("Studio pack missing Meta.aia");
else pass("Studio links Meta.aia");

const engine = require("../api/_engine");
const face = engine.packFace("meta");
if (!face || face.id !== "meta" || face.family !== "Meta.aia") fail("engine face meta");
else pass("engine face meta");
if (engine.PACKS.indexOf("meta") >= 0) fail("meta must not join PACKS engines");
else pass("meta outside PACKS");
if (engine.detectPack({ pack: "meta", title: "Missed call + photo" }) !== "meta") fail("stamped meta must stay");
else pass("stamped meta");
if (engine.detectPack({ pack: "meta-world-desk", title: "Name your desk" }) !== "meta") fail("meta-world-desk alias");
else pass("meta-world-desk alias");
if (engine.detectPack({ title: "Need a life quote in Missouri", notes: "missed call" }) !== "vita") fail("insurance words still vita");
else pass("insurance words still vita");

const q = engine.qualifyJob({
  pack: "meta",
  title: "Missed call — Springfield shop",
  notes: "photo attached · part in stock?",
  contactName: "James",
  kind: "shop"
}, { slug: "meta-desk", pack: "meta", packName: "Meta.aia Official World Pack", packFace: pack.face, packQueue: pack.queue, rules: pack.rules });
if (q.pack !== "meta") fail("qualify pack " + q.pack);
else pass("qualify stamps meta");
if (!/Meta|Claude|Collect stays HOLD|DRAFT READY|Nothing sends/i.test(q.draft || "")) fail("draft missing Meta rails voice");
else pass("draft rails voice");

if (failed) {
  console.error(failed + " failure(s)");
  process.exit(1);
}
console.log("check-meta-pack: ok");

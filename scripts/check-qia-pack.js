#!/usr/bin/env node
require("./_env-guard");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const store = path.join(os.tmpdir(), "aia-qia-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

const file = path.join(root, "packs", "qia.json");
if (!fs.existsSync(file)) {
  fail("missing packs/qia.json");
  process.exit(1);
}
const raw = fs.readFileSync(file, "utf8");
let pack;
try { pack = JSON.parse(raw); } catch (e) {
  fail("qia.json is not JSON");
  process.exit(1);
}

if (pack.id !== "qia") fail("id must be qia"); else pass("id qia");
if (pack.name !== "Quote ops") fail("name Quote ops"); else pass("name");
if (pack.family !== "Quote It Away") fail("family Quote It Away"); else pass("family Quote It Away");

["capture", "qualify", "do", "collect", "follow", "taps", "kill", "pipes", "artifacts", "kinds"].forEach(function (k) {
  if (!Array.isArray(pack[k]) || !pack[k].length) fail("missing Packer key " + k);
  else pass("packer " + k);
});

["intake", "match", "vetting", "nudge", "billing", "admin"].forEach(function (k) {
  if ((pack.kinds || []).indexOf(k) < 0) fail("kinds missing " + k);
  else pass("kind " + k);
});

if (!Array.isArray(pack.workflows) || pack.workflows.length < 3) fail("need Playbooks A/B/C workflows");
else pass("three playbook workflows");
["quote-match", "agent-vetting", "admin-oversight"].forEach(function (id) {
  if (!(pack.workflows || []).some(function (w) { return w && w.id === id; })) fail("missing workflow " + id);
  else pass("workflow " + id);
});

if (!Array.isArray(pack.ais) || pack.ais.length < 3) fail("need Intake / Match / Vetting desk AIs");
else pass("desk AIs");
if (!Array.isArray(pack.rules) || !pack.rules.length) fail("ops pack needs rules");
else pass("rules present");
if (pack.rules.length > 8) fail("rules must fit RULE_MAX 8, got " + pack.rules.length);
else pass("rules fit RULE_MAX");
const { flattenWorkflows } = require("../api/_lib");
const installRules = [].concat(pack.rules || [], flattenWorkflows(pack));
if (installRules.length > 8) fail("install would drop rules: " + installRules.length);
else pass("install keeps all " + installRules.length + " rules");

if (!/7.?business.?day|7-day/i.test(raw)) fail("7-day vetting SLA");
else pass("7-day SLA");
if (!/Collect stays HOLD/i.test(raw)) fail("Collect stays HOLD");
else pass("Collect HOLD");
if (!/Bind stays off/i.test(raw)) fail("Bind stays off");
else pass("Bind off");
if (/\$250|over \$250|placeholder=.?250/i.test(raw)) fail("no fake $250");
else pass("no $250");
if (/auto-?execute|silent send|auto-?charge/i.test(raw)) fail("must not claim auto-execute");
else pass("no auto-execute claims");

const pipes = (pack.pipes || []).map(function (p) { return String(p).toLowerCase(); });
if (pipes.indexOf("webhook") < 0) fail("webhook pipe required");
else pass("webhook pipe");

const never = (pack.queue && pack.queue.never) || [];
["send", "stop", "pay", "bind"].forEach(function (w) {
  if (never.indexOf(w) < 0) fail("queue.never missing " + w);
  else pass("never " + w);
});

const landing = path.join(root, "qia.html");
if (!fs.existsSync(landing)) fail("missing qia.html landing");
else pass("qia.html landing");
const landingSrc = fs.readFileSync(landing, "utf8");
if (!/Collect stays HOLD/i.test(landingSrc) || !/Bind stays off/i.test(landingSrc)) fail("landing missing Collect HOLD / Bind off");
else pass("landing rails");
if (/usage fees apply|per automation run/i.test(landingSrc)) fail("landing must not invent usage fees");
else pass("no invented usage fees");
if (!landingSrc.includes("market.html?pack=qia") || !landingSrc.includes("packs/qia.json")) fail("landing missing market / pack JSON links");
else pass("landing links market + pack JSON");
if (!/Yes|Stop/i.test(landingSrc)) fail("landing missing Yes/Stop voice");
else pass("landing Yes/Stop voice");

const catalog = fs.readFileSync(path.join(root, "api", "_packs.js"), "utf8");
if (!catalog.includes('id: "qia"') || !catalog.includes("packs/qia.json")) fail("_packs.js catalog missing qia");
else pass("catalog lists qia");

const engineSrc = fs.readFileSync(path.join(root, "api", "_engine.js"), "utf8");
if (!engineSrc.includes("qia:")) fail("engine missing qia face");
else pass("engine face source");
if (!engineSrc.includes('face.id === "qia"') && !engineSrc.includes('pack === "qia"')) fail("engine missing qia brain");
else pass("engine brain");
if (/PACKS\s*=\s*\[[^\]]*qia/.test(engineSrc.replace(/\s+/g, " "))) fail("PACKS must stay five engines");
else pass("PACKS stays five engines");

[
  ["create-desk.js", "qia"],
  ["pack-card.js", "qia"],
  ["drop-packs.js", "qia"],
  ["drop-pack.js", "qia"],
  ["drop-agent.js", "qia"],
  ["desk-queue-packs.js", "qia"],
  ["market-shop.js", "pack=qia"],
  ["market-shop.js", "/qia"],
  ["examples.html", "qia.html"],
  ["vercel.json", "/qia.html"]
].forEach(function (row) {
  const src = fs.readFileSync(path.join(root, row[0]), "utf8");
  if (!src.includes(row[1])) fail(row[0] + " missing " + row[1]);
  else pass(row[0]);
});

function decodeStudio(blob) {
  try { return zlib.gunzipSync(Buffer.from(String(blob).replace(/\s+/g, ""), "base64")).toString("utf8"); }
  catch (e) { return ""; }
}
const studioPack = decodeStudio(fs.readFileSync(path.join(root, "developer.z64.txt"), "utf8"));
if (!studioPack.includes("pack=qia") || !studioPack.includes("Quote ops")) fail("Studio pack missing Quote ops");
else pass("Studio links Quote ops");

const engine = require("../api/_engine");
const face = engine.packFace("qia");
if (!face || face.id !== "qia" || face.family !== "Quote It Away") fail("engine face qia");
else pass("engine face qia");
if (engine.PACKS.indexOf("qia") >= 0) fail("qia must not join PACKS engines");
else pass("qia outside PACKS");
if (engine.detectPack({ pack: "qia", title: "Agent application" }) !== "qia") fail("stamped qia must stay");
else pass("stamped qia");
if (engine.detectPack({ title: "Need a life quote in Missouri", notes: "missed call" }) !== "vita") fail("insurance words still vita");
else pass("insurance words still vita");

const q = engine.qualifyJob({
  pack: "qia",
  title: "Agent application — Springfield",
  notes: "vetting license check",
  contactName: "Alex",
  kind: "vetting"
}, { slug: "qia-ops", pack: "qia", packName: "Quote ops", packFace: pack.face, packQueue: pack.queue, rules: pack.rules });
if (q.pack !== "qia") fail("qualify pack " + q.pack);
else pass("qualify stamps qia");
if (q.packName && /vita/i.test(q.packName)) fail("Vita leaked as packName");
else pass("no Vita packName leak");
if (!/Quote ops|Bind stays off|Collect stays HOLD/i.test(q.draft || "")) fail("draft missing Quote ops rails voice");
else pass("draft rails voice");

if (failed) {
  console.error(failed + " failure(s)");
  process.exit(1);
}
console.log("check-qia-pack: ok");

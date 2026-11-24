#!/usr/bin/env node
require("./_env-guard");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

const file = path.join(root, "packs", "meta-gemini.json");
if (!fs.existsSync(file)) {
  fail("missing packs/meta-gemini.json");
  process.exit(1);
}
const raw = fs.readFileSync(file, "utf8");
let pack;
try { pack = JSON.parse(raw); } catch (e) {
  fail("meta-gemini.json is not JSON");
  process.exit(1);
}

if (pack.id !== "meta-gemini") fail("id must be meta-gemini"); else pass("id meta-gemini");
if (!/Gemini/i.test(pack.name || "")) fail("name Gemini"); else pass("name");
if (pack.family !== "Meta.aia") fail("family Meta.aia"); else pass("family Meta.aia");
if (!pack.gemini_included) fail("gemini_included"); else pass("gemini included");

["capture", "qualify", "do", "collect", "follow", "taps", "kill", "pipes", "artifacts", "kinds"].forEach(function (k) {
  if (!Array.isArray(pack[k]) || !pack[k].length) fail("missing Packer key " + k);
  else pass("packer " + k);
});

if (!Array.isArray(pack.ais) || pack.ais.length < 3) fail("need Gemini desk AIs");
else pass("desk AIs " + pack.ais.length);
const geminiAis = (pack.ais || []).filter(function (a) {
  return a && (a.type === "gemini" || /gemini/i.test(a.name || ""));
});
if (geminiAis.length < 3) fail("need 3 Gemini desk AIs");
else pass("gemini AIs " + geminiAis.length);

if (!Array.isArray(pack.rules) || !pack.rules.length) fail("meta-gemini needs rules");
else pass("rules present");
if (pack.rules.length > 8) fail("rules must fit RULE_MAX 8, got " + pack.rules.length);
else pass("rules fit RULE_MAX");

if (!/Collect stays HOLD/i.test(raw)) fail("Collect stays HOLD");
else pass("Collect HOLD");
if (!/Never Yes|never Yes|Draft only|drafts only/i.test(raw)) fail("draft-only rails");
else pass("draft-only rails");
if (/auto-?execute|silent send|auto-?charge/i.test(raw)) fail("must not claim auto-execute");
else pass("no auto-execute claims");
if (/\$250|over \$250/i.test(raw)) fail("no fake $250");
else pass("no $250");

const never = (pack.queue && pack.queue.never) || [];
["send", "stop", "pay"].forEach(function (w) {
  if (never.indexOf(w) < 0) fail("queue.never missing " + w);
  else pass("never " + w);
});

const catalog = fs.readFileSync(path.join(root, "api", "_packs.js"), "utf8");
if (!catalog.includes('"meta-gemini"') && !catalog.includes("meta-gemini")) fail("_packs.js missing meta-gemini");
else pass("catalog / PACK_FILES lists meta-gemini");
if (!catalog.includes('id: "meta-gemini"')) fail("_packs.js OFFICIAL missing meta-gemini");
else pass("OFFICIAL lists meta-gemini");

const engineSrc = fs.readFileSync(path.join(root, "api", "_engine.js"), "utf8");
if (!engineSrc.includes("meta-gemini")) fail("engine missing meta-gemini face");
else pass("engine face meta-gemini");

const grok = fs.readFileSync(path.join(root, "api", "_grok.js"), "utf8");
if (!grok.includes("gemini") || !/callGemini|generativelanguage\.googleapis\.com/.test(grok)) {
  fail("_grok.js missing Gemini draft provider");
} else pass("Gemini draft provider");

const connections = fs.readFileSync(path.join(root, "api", "connections.js"), "utf8");
if (!connections.includes("gemini:") && !connections.includes("gemini ")) fail("connections.js missing gemini AI provider");
else pass("connections gemini provider");
if (!/aistudio\.google\.com|ai\.google\.dev/.test(connections)) fail("connections missing Google AI login URL");
else pass("Google AI login URL");

const ship = path.join(root, "ship", "meta", "Meta.aia.v1.1.gemini-included.json");
if (!fs.existsSync(ship)) fail("missing ship/meta/Meta.aia.v1.1.gemini-included.json");
else {
  try {
    const j = JSON.parse(fs.readFileSync(ship, "utf8"));
    if (!j.pack || !j.pack.gemini_included) fail("ship manifest missing gemini_included");
    else pass("ship gemini-included manifest");
  } catch (e) { fail("ship manifest bad JSON"); }
}

const landing = fs.readFileSync(path.join(root, "meta.html"), "utf8");
if (!/meta-gemini|Gemini/i.test(landing)) fail("meta.html missing Gemini satellite");
else pass("meta.html mentions Gemini");

const engine = require("../api/_engine");
const face = engine.packFace("meta-gemini");
if (!face || face.id !== "meta-gemini" || face.family !== "Meta.aia") fail("engine face meta-gemini");
else pass("engine face meta-gemini");
if (engine.PACKS.indexOf("meta-gemini") >= 0) fail("meta-gemini must not join PACKS engines");
else pass("meta-gemini outside PACKS");
if (engine.detectPack({ pack: "meta-gemini", title: "Lead from shop" }) !== "meta-gemini") fail("stamped meta-gemini must stay");
else pass("stamped meta-gemini");
if (engine.detectPack({ pack: "gemini", title: "Support reply" }) !== "meta-gemini") fail("gemini alias");
else pass("gemini alias");

const q = engine.qualifyJob({
  pack: "meta-gemini",
  title: "Lead — Gemini desk draft",
  notes: "need a clear reply draft",
  contactName: "James",
  kind: "lead"
}, {
  slug: "gemini-desk",
  pack: "meta-gemini",
  packName: "Meta.aia + Gemini",
  packFace: pack.face,
  packQueue: pack.queue,
  rules: pack.rules
});
if (q.pack !== "meta-gemini") fail("qualify pack " + q.pack);
else pass("qualify stamps meta-gemini");
if (!/Gemini|Collect stays HOLD|DRAFT READY|Nothing sends|draft/i.test(q.draft || "")) fail("draft missing Gemini rails voice");
else pass("draft rails voice");

if (failed) {
  console.error(failed + " failure(s)");
  process.exit(1);
}
console.log("check-meta-gemini: ok");

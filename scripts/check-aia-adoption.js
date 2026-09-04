#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-adoption-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

const file = path.join(root, "packs", "aia-adoption.json");
if (!fs.existsSync(file)) {
  fail("missing packs/aia-adoption.json");
  process.exit(1);
}
const raw = fs.readFileSync(file, "utf8");
let pack;
try { pack = JSON.parse(raw); } catch (e) {
  fail("aia-adoption.json is not JSON");
  process.exit(1);
}

if (pack.id !== "aia-adoption") fail("id must be aia-adoption"); else pass("id aia-adoption");
if (pack.name !== "Try it on this desk") fail("name Try it on this desk"); else pass("name");
if (pack.family !== "Automate It Away") fail("family Automate It Away"); else pass("family Automate It Away");

["capture", "qualify", "do", "collect", "follow", "taps", "kill", "pipes", "artifacts"].forEach(function (k) {
  if (!Array.isArray(pack[k]) || !pack[k].length) fail("missing Packer key " + k);
  else pass("packer " + k);
});

if (!JSON.stringify(pack).includes("Queue cards count")) fail("Queue cards count");
else pass("Queue cards count");
["Worker-first", "Open packs", "Secure-by-design"].forEach(function (bit) {
  if (!JSON.stringify(pack).includes(bit)) fail("missing " + bit);
  else pass(bit);
});
if (!/try first/i.test(raw)) fail("try first");
else pass("try first");

if (/\$250|over \$250|placeholder=.?250/i.test(raw)) fail("no fake $250");
else pass("no $250");
if (/seed money|demo seed|Labeled DEMO/i.test(raw)) fail("no demo seed money");
else pass("no demo seed");
if (/White House|Action Plan|executive order/i.test(raw)) fail("must not reprint policy");
else pass("desk language, not a reprint");
["Audit", "Stack Connect", "Agent Deploy", "Guardrails"].forEach(function (bit) {
  if (!raw.includes(bit)) fail("aia-adoption missing phase " + bit);
  else pass("adoption phase " + bit);
});

const pipes = (pack.pipes || []).map(function (p) { return String(p).toLowerCase(); });
if (pipes.indexOf("ebay") >= 0 || pipes.indexOf("mail") >= 0 || pipes.indexOf("gmail") >= 0) fail("no live eBay/mail pipes");
else pass("pipes webhook-only");
if (pipes.indexOf("webhook") < 0) fail("webhook pipe required");
else pass("webhook pipe");
if (/ebay|mail/i.test(JSON.stringify(pack.capture || []) + JSON.stringify(pack.do || []))) fail("no live eBay/mail jobs");
else pass("capture/do have no live eBay/mail");

if (!Array.isArray(pack.rules) || pack.rules.length) fail("rules stay empty — themes live in rails/help");
else pass("empty rules");

const never = (pack.queue && pack.queue.never) || [];
["send", "stop", "pay"].forEach(function (w) {
  if (never.indexOf(w) < 0) fail("queue.never missing " + w);
  else pass("never " + w);
});

const catalog = fs.readFileSync(path.join(root, "api", "_packs.js"), "utf8");
if (!catalog.includes("aia-adoption")) fail("_packs.js catalog missing aia-adoption");
else pass("catalog lists aia-adoption");

const engineSrc = fs.readFileSync(path.join(root, "api", "_engine.js"), "utf8");
if (!engineSrc.includes('"aia-adoption":') && !engineSrc.includes("FACES[\"aia-adoption\"]")) fail("engine missing aia-adoption face");
else pass("engine face source");
if (!engineSrc.includes('pack === "aia-adoption"') && !engineSrc.includes('face.id === "aia-adoption"')) fail("engine missing aia-adoption brain/recs");
else pass("engine brain/recs");
if (/PACKS\s*=\s*\[[^\]]*aia-adoption/.test(engineSrc.replace(/\s+/g, " "))) fail("PACKS must stay five engines");
else pass("PACKS stays five engines");

const create = fs.readFileSync(path.join(root, "create-desk.js"), "utf8");
if (!create.includes("aia-adoption") || !create.includes("AIA")) fail("create-desk.js missing aia-adoption / AIA chip");
else pass("Create lists aia-adoption");

const packCard = fs.readFileSync(path.join(root, "pack-card.js"), "utf8");
if (!packCard.includes("aia-adoption")) fail("pack-card.js missing aia-adoption face");
else pass("pack-card face");

const dropPacks = fs.readFileSync(path.join(root, "drop-packs.js"), "utf8");
if (!dropPacks.includes("aia-adoption")) fail("drop-packs.js missing aia-adoption");
else pass("drop-packs meta");

const dropPack = fs.readFileSync(path.join(root, "drop-pack.js"), "utf8");
if (!dropPack.includes("aia-adoption") || !dropPack.includes("AIA")) fail("drop-pack.js missing aia-adoption / AIA");
else pass("drop-pack chip");

const dropAgent = fs.readFileSync(path.join(root, "drop-agent.js"), "utf8");
if (!dropAgent.includes("aia-adoption") || !dropAgent.includes("AIA")) fail("drop-agent.js missing aia-adoption / AIA");
else pass("drop-agent chip");

const deskQueue = fs.readFileSync(path.join(root, "desk-queue-packs.js"), "utf8");
if (!deskQueue.includes("aia-adoption") || !deskQueue.includes("AIA")) fail("desk-queue-packs.js missing aia-adoption / AIA");
else pass("desk-queue badge");

const dev = fs.readFileSync(path.join(root, "developer.js"), "utf8");
if (!dev.includes("aia-adoption")) fail("developer.js missing aia-adoption");
else pass("Studio links aia-adoption");
if (!dev.includes("official-list") || !dev.includes("Use on this desk")) fail("creator lab missing official pack list");
else pass("Studio Use on this desk");
if (!dev.includes("Grok · AIA Studio")) fail("must keep Grok Studio home");
else pass("Grok Studio home kept");

const more = fs.readFileSync(path.join(root, "more.html"), "utf8");
if (!more.includes("Try it on this desk")) fail("more.html packs line missing Try it on this desk");
else pass("more packs line");

const creators = fs.readFileSync(path.join(root, "creators.html"), "utf8");
if (!/Creators Studio/.test(creators) || !/\/developer/.test(creators)) fail("creators.html stub must title Creators Studio");
else pass("creators stub");

const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
if (!/"\/creators"/.test(vercel) || !vercel.includes("/developer")) fail("vercel /creators must send people to Creators Studio");
else pass("/creators → Creators Studio");

const help = fs.readFileSync(path.join(root, "help.html"), "utf8");
["Try first", "Workers decide", "Open packs", "Secure from the start"].forEach(function (bit) {
  if (!help.includes(bit)) fail("help.html missing " + bit);
  else pass("help " + bit);
});
["Audit", "Stack Connect", "Agent Deploy", "Guardrails"].forEach(function (bit) {
  if (!help.includes(bit)) fail("help.html missing phase " + bit);
  else pass("help phase " + bit);
});
const studioHtml = fs.readFileSync(path.join(root, "developer.html"), "utf8");
["Audit", "Stack Connect", "Agent Deploy", "Guardrails", "How AIA lands"].forEach(function (bit) {
  if (!studioHtml.includes(bit)) fail("Studio landing missing " + bit);
  else pass("Studio landing " + bit);
});
if (!dev.includes("Audit") || !dev.includes("Stack Connect") || !dev.includes("Agent Deploy") || !dev.includes("Guardrails")) {
  fail("Studio home missing adoption phases");
} else pass("Studio home has adoption phases");
const shop = fs.readFileSync(path.join(root, "market-shop.js"), "utf8");
if (!shop.includes("How AIA lands") || !shop.includes("Stack Connect") || !shop.includes("Guardrails")) fail("market missing How AIA lands");
else pass("market How AIA lands");
if (/White House|Action Plan/i.test(help)) fail("help must not reprint policy");
else pass("help is desk language");

const engine = require("../api/_engine");
const face = engine.packFace("aia-adoption");
if (!face || face.id !== "aia-adoption" || face.family !== "Automate It Away") fail("engine face aia-adoption");
else pass("engine face");
if (engine.PACKS.indexOf("aia-adoption") >= 0) fail("aia-adoption must not join PACKS engines");
else pass("not an engine");
if (engine.detectPack({ pack: "aia-adoption", title: "Porch idea" }) !== "aia-adoption") fail("stamped aia-adoption must stay");
else pass("stamped pack stays");
const q = engine.qualifyJob({ pack: "aia-adoption", title: "Friday ride", notes: "errand for Sam" }, { slug: "try-desk", rules: [] });
if (q.pack !== "aia-adoption") fail("qualify pack " + q.pack);
else if (/vita/i.test(JSON.stringify(q))) fail("Vita leaked");
else if (/\$250/.test(JSON.stringify(q))) fail("$250 leaked onto adoption card");
else if (q.waitingOn === "owner" && /kid or school/i.test(q.next || q.why || "")) fail("empty desk inherited a pack example rule");
else pass("qualify adoption card");

try {
  if (fs.existsSync(store)) fs.unlinkSync(store);
} catch (e) {}

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("check-aia-adoption ok");

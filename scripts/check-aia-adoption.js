#!/usr/bin/env node
require("./_env-guard");
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
if (!/Four steps|find the leaks/i.test(raw)) fail("aia-adoption should point at the four steps");
else pass("adoption points at the four steps");

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

const zlib = require("zlib");
function decodeStudio(raw) {
  try { return zlib.gunzipSync(Buffer.from(String(raw).replace(/\s+/g, ""), "base64")).toString("utf8"); }
  catch (e) { return ""; }
}
const dev = fs.readFileSync(path.join(root, "developer.js"), "utf8");
const studioPack = decodeStudio(fs.readFileSync(path.join(root, "developer.z64.txt"), "utf8"));
if (dev.indexOf('fetch("/developer.z64.txt"') < 0 || dev.indexOf('DecompressionStream("gzip")') < 0) fail("Studio loader must unpack developer.z64.txt");
else pass("Studio loader unpacks the pack");
if (!studioPack || studioPack.indexOf("Creators Studio") < 0) fail("developer.z64.txt must decode as Creators Studio");
else pass("Studio pack decodes");
if (!studioPack.includes("aia-adoption")) fail("Studio pack missing aia-adoption");
else pass("Studio pack links aia-adoption");
if (!studioPack.includes("official-list") || !studioPack.includes("Use on this desk")) fail("Studio pack missing official pack list");
else pass("Studio Use on this desk");
if (!studioPack.includes("Grok · AIA Studio")) fail("must keep Grok Studio home");
else pass("Grok Studio home kept");

const more = fs.readFileSync(path.join(root, "more.html"), "utf8");
if (!more.includes("Try it on this desk")) fail("more.html packs line missing Try it on this desk");
else pass("more packs line");

const creators = fs.readFileSync(path.join(root, "creators.html"), "utf8");
const creatorsJs = fs.readFileSync(path.join(root, "creators.js"), "utf8");
if (!creators.includes("Your pack listings") || !creators.includes('href="/dev">Creators Studio<')) fail("creators.html must be pack listings and still link Creators Studio");
else pass("creators listings link Studio");
if (!creators.includes("Nothing is saved or removed until you tap Yes") || !creators.includes("Stop cancels the draft") || !creators.includes("Nothing is charged") || !creators.includes("Yes is required")) fail("creators.html missing Yes / Stop / nothing-charged honesty");
else pass("creators Yes / Stop honesty");
if (creatorsJs.indexOf("function stageSave") < 0 || creatorsJs.indexOf("showDecide") < 0 || creatorsJs.indexOf('kind: "save"') < 0) fail("Save listing must stage a Yes/Stop draft");
else pass("Save listing stages a draft");
if (!/async function yes\(/.test(creatorsJs) || creatorsJs.indexOf("pending.body") < 0) fail("Yes must be the tap that saves or lists");
else pass("Yes commits the listing");
if (creatorsJs.indexOf("function stop") < 0 || creatorsJs.indexOf("Stopped. Nothing was saved or removed.") < 0) fail("Stop must cancel without saving");
else pass("Stop cancels without saving");
if (creatorsJs.indexOf('action: "studio-draft"') < 0) fail("Ask the desk must draft only");
else pass("Ask the desk drafts only");
function sliceFn(src, name) {
  const start = src.indexOf("async function " + name) >= 0 ? src.indexOf("async function " + name) : src.indexOf("function " + name);
  if (start < 0) return "";
  const next = src.slice(start + 10).search(/\n  (async )?function /);
  return src.slice(start, next >= 0 ? start + 10 + next : start + 1600);
}
const stageFn = sliceFn(creatorsJs, "stageSave");
const yesFn = sliceFn(creatorsJs, "yes");
const stopFn = sliceFn(creatorsJs, "stop");
const askFn = sliceFn(creatorsJs, "askDesk");
const loadFn = sliceFn(creatorsJs, "load");
if (stageFn.indexOf("fetch(") >= 0 || /list-pack|private-pack|unlist-pack/.test(stageFn) && stageFn.indexOf("showDecide") < 0) fail("Save listing must not list or save before Yes");
else pass("Save listing does not post before Yes");
if (yesFn.indexOf("pending.body") < 0 || yesFn.indexOf("fetch(") < 0) fail("Yes must post the staged listing");
else pass("Yes posts the staged listing");
if (stopFn.indexOf("fetch(") >= 0) fail("Stop must not post a listing");
else pass("Stop does not post");
if (loadFn.indexOf("list-pack") >= 0 || loadFn.indexOf("private-pack") >= 0 || /method:\s*"POST"/.test(loadFn)) fail("Listings boot must not list or save a pack");
else pass("Listings boot does not list");
if (/charged:\s*true/.test(creatorsJs) || /action:\s*"payout"/.test(creatorsJs)) fail("creators.js must not charge or pay out");
else pass("creators.js does not charge");

const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
if (!/"\/creators"/.test(vercel) || !vercel.includes("/creators.html")) fail("vercel /creators must open Your pack listings");
else pass("/creators → pack listings");
if (!/"\/studio"/.test(vercel) || !vercel.includes("/developer.html")) fail("vercel /studio must open Creators Studio");
else pass("/studio → Creators Studio");

const help = fs.readFileSync(path.join(root, "help.html"), "utf8");
["Try first", "Workers decide", "Open packs", "Secure from the start", "When · If · Then"].forEach(function (bit) {
  if (!help.includes(bit)) fail("help.html missing " + bit);
  else pass("help " + bit);
});
["Find the leaks", "Hook the pipes", "Name a desk AI", "You still tap"].forEach(function (bit) {
  if (!help.includes(bit) && !help.includes("desk-playbook.js")) fail("help.html missing " + bit);
  else pass("help path " + bit);
});
if (!help.includes("ai.aia") || !help.includes("automateitaway.com")) fail("help.html missing ai.aia / desk host");
else pass("help names ai.aia");
if (help.includes("www.aia.aia")) fail("help branded www.aia.aia");
else pass("help does not use www.aia.aia");
if (help.includes("Approved crew seat")) fail("help must not list Approved crew seat");
else pass("help has no crew-seat note");
const studioHtml = fs.readFileSync(path.join(root, "developer.html"), "utf8");
if (!studioHtml.includes("ai.aia") || !studioHtml.includes("automateitaway.com") || !studioHtml.includes(".aia")) fail("Studio landing missing ai.aia + desk host + .aia");
else pass("Studio landing names ai.aia");
if (!studioHtml.includes("desk-playbook.js") || !studioHtml.includes("data-aia-playbook")) fail("Studio landing missing four-steps playbook");
else pass("Studio landing mounts playbook");
if (studioHtml.includes("www.aia.aia")) fail("Studio branded www.aia.aia");
else pass("Studio does not use www.aia.aia");
if (!studioPack.includes("Four steps on this desk") || !studioPack.includes("aia-implement")) fail("Studio pack missing four steps / aia-implement");
else pass("Studio home has four steps");
const shop = fs.readFileSync(path.join(root, "market-shop.js"), "utf8");
if (!shop.includes("ai.aia") || !shop.includes("Find the leaks") || !shop.includes("aia-implement")) fail("market missing ai.aia / four steps");
else pass("market names ai.aia and four steps");
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

function unique(rows) {
  const out = [];
  rows.forEach(function (row) { if (out.indexOf(row) < 0) out.push(row); });
  return out;
}
function buildFaults(files) {
  const bad = [];
  const hasLoader = files.loader.indexOf('fetch("/developer.z64.txt"') >= 0 && files.loader.indexOf('DecompressionStream("gzip")') >= 0;
  if (!hasLoader || !files.pack || files.pack.indexOf("aia-adoption") < 0 || files.pack.indexOf("official-list") < 0 || files.pack.indexOf("Use on this desk") < 0 || files.pack.indexOf("Grok · AIA Studio") < 0 || files.pack.indexOf("Four steps on this desk") < 0 || files.pack.indexOf("aia-implement") < 0) {
    bad.push("Studio adoption copy gone");
  }
  const stage = sliceFn(files.creatorsJs, "stageSave");
  const yes = sliceFn(files.creatorsJs, "yes");
  const stop = sliceFn(files.creatorsJs, "stop");
  const load = sliceFn(files.creatorsJs, "load");
  if (files.creatorsHtml.indexOf("Nothing is saved or removed until you tap Yes") < 0 || files.creatorsHtml.indexOf("Yes is required") < 0 || stage.indexOf("showDecide") < 0 || yes.indexOf("pending.body") < 0 || stop.indexOf("fetch(") >= 0 || load.indexOf("list-pack") >= 0) {
    bad.push("list or save without Yes");
  }
  if (files.creatorsHtml.indexOf("Nothing is charged") < 0 || /charged:\s*true/.test(files.creatorsJs) || /action:\s*"payout"/.test(files.creatorsJs)) {
    bad.push("charge without Yes");
  }
  return unique(bad);
}
function applyMutant(kind, files) {
  const next = { loader: files.loader, pack: files.pack, creatorsHtml: files.creatorsHtml, creatorsJs: files.creatorsJs };
  if (kind === "Studio adoption copy gone") {
    next.pack = next.pack
      .replace(/aia-adoption/g, "gone-adoption")
      .replace(/official-list/g, "gone-list")
      .replace(/Use on this desk/g, "Skip this desk")
      .replace(/Grok · AIA Studio/g, "Skip Studio")
      .replace(/Four steps on this desk/g, "Skip the steps")
      .replace(/aia-implement/g, "gone-implement");
  } else if (kind === "list or save without Yes") {
    next.creatorsHtml = next.creatorsHtml
      .replace(/Nothing is saved or removed until you tap Yes/g, "It saves on its own")
      .replace(/Yes is required/g, "Yes is optional");
    next.creatorsJs = next.creatorsJs
      .replace("function stageSave()", "function stageSave(){ fetch('/gone-desk', { method: 'POST', body: JSON.stringify({ action: 'list-pack' }) }); }\nfunction stageSaveOld")
      .replace("function stop()", "async function stop(){ fetch('/gone-desk', { method: 'POST', body: JSON.stringify(pending && pending.body) }); }\nfunction stopOld")
      .replace("async function load()", "async function load(){ fetch('/gone-desk', { method: 'POST', body: JSON.stringify({ action: 'list-pack' }) }); }\nasync function loadOld");
  } else if (kind === "charge without Yes") {
    next.creatorsHtml = next.creatorsHtml.replace(/Nothing is charged/g, "It is charged now");
    next.creatorsJs = next.creatorsJs + "\ncharged: true\n{ action: \"payout\" }";
  }
  return next;
}

const files = { loader: dev, pack: studioPack, creatorsHtml: creators, creatorsJs: creatorsJs };
const live = buildFaults(files);
if (live.length) fail("adoption behaviour drifted: " + live.join("; "));
else pass("Studio adoption copy and listings Yes / no-charge still hold");

const mutants = [
  "Studio adoption copy gone",
  "list or save without Yes",
  "charge without Yes"
];
let caught = 0;
mutants.forEach(function (kind) {
  const faults = buildFaults(applyMutant(kind, files));
  if (faults.indexOf(kind) < 0) fail("mutant missed: " + kind + " (got " + JSON.stringify(faults) + ")");
  else { caught += 1; pass("mutant caught: " + kind); }
});
if (caught !== mutants.length) fail("mutants: " + caught + "/" + mutants.length + " caught");
else pass("mutants: " + caught + "/" + mutants.length + " caught");

try {
  if (fs.existsSync(store)) fs.unlinkSync(store);
} catch (e) {}

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("check-aia-adoption ok");

require("./_env-guard");
const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

const root = path.join(__dirname, "..");
const q = fs.readFileSync(path.join(root, "desk-queue-packs.js"), "utf8");
const nav = fs.readFileSync(path.join(root, "desk-nav.js"), "utf8");
const card = fs.readFileSync(path.join(root, "pack-card.js"), "utf8");
const dev = fs.readFileSync(path.join(root, "developer.js"), "utf8");

["All", "Work", "Wanted", "Creator", "AIA", "Color", "Ask", "aia_queue_pack", "Insurance", "Make this pack", "Find a pack"].forEach(function (bit) {
  if (!q.includes(bit)) fail("desk-queue-packs.js missing " + bit);
  else pass("queue " + bit);
});
if (/chip.*=.*Vita|badge.*>Vita|return \"Vita\"/i.test(q)) fail("queue pack bar prints Vita");
else pass("queue bar never prints Vita");
if (!q.includes("never") && !q.includes("Nobody sends money")) fail("queue missing never-send line");
else pass("queue never-send line");
if (!q.includes("FILTER === \"color\")") && !q.includes('FILTER === "color"')) fail("color must not hide work");
else pass("color does not hide work");
if (!q.includes("FILTER === \"ask\")") && !q.includes('FILTER === "ask"')) fail("ask filter missing");
else pass("ask is a tag filter");

if (/if \(tok\) h\["X-Session"\] = tok;\s*else if \(pin\)/.test(q)) {
  fail("queue pack catalog must still send the open-desk pin when a session token is present");
} else pass("queue pack catalog keeps X-Pin with X-Session");
if (q.indexOf('if (pin) h["X-Pin"] = pin') < 0) fail("queue pack catalog must send X-Pin");
else pass("queue pack catalog sends X-Pin");

if (!nav.includes("desk-queue-packs.js")) fail("desk-nav.js must load desk-queue-packs.js");
else pass("nav loads queue packs");
if (!nav.includes("desk-ais.js")) fail("desk-nav.js must load desk-ais.js");
else pass("nav loads desk ais");
if (!nav.includes("desk-needs.js")) fail("desk-nav.js must load desk-needs.js");
else pass("nav loads needs");
if (!nav.includes("desk-inbox.js")) fail("desk-nav.js must load desk-inbox.js");
else pass("nav loads inbox");
if (!nav.includes("pack-card.js")) fail("desk-nav.js must load pack-card.js");
else pass("nav loads pack-card");

if (!card.includes("year2") || !card.includes("missed-call")) fail("pack-card.js must map year2/missed-call to Insurance");
else pass("pack-card maps year2 and missed-call");
if (!card.includes('name: "Insurance"')) fail("pack-card missing Insurance face");
else pass("pack-card Insurance face");

["home", "consign", "fund", "land", "vita", "aia-adoption", "aia-implement"].forEach(function (id) {
  const file = JSON.parse(fs.readFileSync(path.join(root, "packs", id + ".json"), "utf8"));
  if (!file.queue) fail(id + " missing queue{}");
  else pass(id + " has queue{}");
  const never = (file.queue.never || []).join(" ");
  if (!/send/.test(never) || !/stop/.test(never) || !/pay/.test(never)) fail(id + " queue.never missing send/stop/pay");
  else pass(id + " never send/stop/pay");
  if (id === "vita") {
    if (file.queue.badge !== "Insurance") fail("vita queue badge must be Insurance");
    else pass("vita queue badge Insurance");
    if (file.queue.family !== "Quote It Away") fail("vita queue family must be Quote It Away");
    else pass("vita queue family Quote It Away");
    if (/Vita/.test(JSON.stringify(file.queue))) fail("vita queue{} prints Vita");
    else pass("vita queue{} never Vita");
    if ((file.queue.never || []).indexOf("bind") < 0) fail("vita queue.never missing bind");
    else pass("vita queue never bind");
  }
});

const wanted = JSON.parse(fs.readFileSync(path.join(root, "packs", "wanted.json"), "utf8"));
["year2", "missed-call"].forEach(function (id) {
  const row = (wanted.packs || []).find(function (p) { return p.id === id; });
  if (!row || row.face !== "Insurance") fail(id + " must face Insurance");
  else pass(id + " faces Insurance");
});

const zlib = require("zlib");
function decodeStudio(raw) {
  try { return zlib.gunzipSync(Buffer.from(String(raw).replace(/\s+/g, ""), "base64")).toString("utf8"); }
  catch (e) { return ""; }
}
const studioPack = decodeStudio(fs.readFileSync(path.join(root, "developer.z64.txt"), "utf8"));
if (dev.indexOf('fetch("/developer.z64.txt"') < 0 || dev.indexOf('DecompressionStream("gzip")') < 0) {
  fail("Studio loader must unpack developer.z64.txt");
} else pass("Studio loader unpacks Creators Studio pack");
if (!studioPack || studioPack.indexOf("Creators Studio") < 0) fail("developer.z64.txt must decode as Creators Studio");
else pass("Studio pack decodes");
function hasId(src, id) { return new RegExp("id=\\\\?\"" + id + "\\\\?\"").test(src); }
if (studioPack.indexOf('["queue", "Queue"]') < 0 || !hasId(studioPack, "q-badge")) fail("Studio must paint a Queue tab");
else pass("Studio Queue tab");
if (studioPack.indexOf("pack.queue") < 0 && studioPack.indexOf("queue:") < 0) fail("Studio must save pack.queue");
else pass("Studio saves pack.queue");
if (studioPack.indexOf("Ask Grok") < 0 || studioPack.indexOf("studio-draft") < 0) fail("Creators Studio missing Grok drafter");
else pass("Studio Ask Grok");
if (!hasId(studioPack, "grok-yes") || !hasId(studioPack, "grok-stop")) fail("Studio Grok must wait on Yes/Stop");
else pass("Studio Grok Yes/Stop");
if (studioPack.indexOf("Grok · AIA Studio") < 0) fail("Studio missing Grok AIA Studio identity");
else pass("Studio Grok identity");

const adoption = JSON.parse(fs.readFileSync(path.join(root, "packs", "aia-adoption.json"), "utf8"));
if (!Array.isArray(adoption.rules) || adoption.rules.length) fail("aia-adoption must have empty rules");
else pass("aia-adoption empty rules");
if (/\$250/.test(JSON.stringify(adoption))) fail("aia-adoption must not mention $250");
else pass("aia-adoption has no $250");
if (!/try first/i.test(JSON.stringify(adoption))) fail("aia-adoption missing try-first copy");
else pass("aia-adoption try-first");
["Worker-first", "Open packs", "Secure-by-design", "Queue cards count"].forEach(function (bit) {
  if (!JSON.stringify(adoption).includes(bit)) fail("aia-adoption missing " + bit);
  else pass("aia-adoption " + bit);
});
if (/White House|Action Plan|executive order/i.test(JSON.stringify(adoption))) fail("aia-adoption must not reprint policy");
else pass("aia-adoption is desk language, not a reprint");

const helpPage = fs.readFileSync(path.join(root, "help.html"), "utf8");
["Try first", "Workers decide", "Open packs", "Secure from the start", "When · If · Then", "Workflow / Sequence"].forEach(function (bit) {
  if (!helpPage.includes(bit)) fail("help.html missing " + bit);
  else pass("help " + bit);
});
if (!/Four steps|find the leaks/i.test(JSON.stringify(adoption))) fail("aia-adoption should point at the four steps");
else pass("aia-adoption points at the four steps");
if (/White House|Action Plan/i.test(helpPage)) fail("help.html must not reprint policy");
else pass("help is desk language");
if (helpPage.includes("Grok")) fail("help.html must not leak Grok");
else pass("help has no Grok leak");

if (studioPack.indexOf("Queue cards are the measure") < 0) fail("Studio missing queue-as-measure copy");
else pass("Studio measures Queue cards");


if (q.indexOf('getElementById("pack-filters")') < 0 || q.indexOf('box.id = "pack-filters"') < 0 || q.indexOf("Packs on this queue") < 0) fail("queue pack bar must paint #pack-filters");
else pass("queue pack bar paints");
if (q.indexOf("Nobody sends money from here") < 0) fail("queue pack bar must paint nobody-sends-money");
else pass("queue pack bar paints nobody-sends-money");
if (q.indexOf("You still tap Copy, Text, Email, Hand, Cap, or Stop") < 0) fail("queue pack bar must keep human taps");
else pass("queue pack bar keeps human taps");
if (q.indexOf('data-pack-filter') < 0) fail("queue pack bar must paint filter chips");
else pass("queue pack bar paints filter chips");
if (q.indexOf('FILTER === "color") rows = openJobs()') < 0 && q.indexOf("FILTER === 'color') rows = openJobs()") < 0) {
  fail("color filter must keep work cards on the queue");
} else pass("color filter keeps work cards");
if (!hasId(studioPack, "save-queue") || !hasId(studioPack, "q-empty")) fail("Studio Queue tab must author pack.queue fields");
else pass("Studio Queue tab authors pack.queue fields");
if (studioPack.indexOf("function yesGrok") < 0 || studioPack.indexOf("function stopGrok") < 0) fail("Studio Grok must keep Yes/Stop handlers");
else pass("Studio Grok Yes/Stop handlers");
if (studioPack.indexOf("applyPackDraft") < 0) fail("Studio Grok Yes must put the draft on Pack");
else pass("Studio Grok Yes puts the draft on Pack");
if (/charged:\s*true/.test(q) || /charged:\s*true/.test(studioPack)) fail("queue or Studio must not send charged:true");
else pass("queue and Studio do not send charged:true");
if (/\baction:\s*"install-pack"|\baction:\s*"buy-pack"|\baction:\s*"use-pack"/.test(q)) fail("queue pack bar must not install, buy, or use-pack on a chip tap");
else pass("queue pack bar does not install or use-pack on a chip tap");

function unique(rows) {
  const out = [];
  rows.forEach(function (row) { if (out.indexOf(row) < 0) out.push(row); });
  return out;
}

function queuePackFaults(loader, pack, queueSrc) {
  const bad = [];
  const hasLoader = loader.indexOf('fetch("/developer.z64.txt"') >= 0 && loader.indexOf('DecompressionStream("gzip")') >= 0;
  if (!hasLoader || !pack || pack.indexOf("Creators Studio") < 0 || pack.indexOf('["queue", "Queue"]') < 0 || !hasId(pack, "q-badge") || !hasId(pack, "save-queue")) {
    bad.push("Studio Queue tab gone");
  }
  if (pack.indexOf("pack.queue") < 0 && pack.indexOf("queue:") < 0) bad.push("Studio Queue tab gone");
  if (!hasId(pack, "grok-yes") || !hasId(pack, "grok-stop") || pack.indexOf("function yesGrok") < 0 || pack.indexOf("Ask Grok") < 0 || pack.indexOf("studio-draft") < 0) {
    bad.push("Studio Grok without Yes/Stop");
  }
  if (pack.indexOf("applyPackDraft") >= 0 && pack.indexOf("function yesGrok") < 0) {
    bad.push("Studio Grok without Yes/Stop");
  }
  if (queueSrc.indexOf('getElementById("pack-filters")') < 0 || queueSrc.indexOf("All") < 0 || queueSrc.indexOf("Nobody sends money from here") < 0 || queueSrc.indexOf("data-pack-filter") < 0) {
    bad.push("queue pack bar gone");
  }
  if (queueSrc.indexOf('FILTER === "color") rows = openJobs()') < 0 && queueSrc.indexOf("FILTER === 'color') rows = openJobs()") < 0) {
    bad.push("color hides work");
  }
  if (queueSrc.indexOf('if (FILTER === "all" || FILTER === "color") return true') < 0) {
    bad.push("color hides work");
  }
  if (queueSrc.indexOf('if (c === "insurance") return "Insurance"') < 0) bad.push("Vita printed on Insurance");
  if (/chip.*=.*Vita|badge.*>Vita|return "Vita"/i.test(queueSrc)) bad.push("Vita printed on Insurance");
  if (/charged:\s*true/.test(queueSrc) || /charged:\s*true/.test(pack) || /\baction:\s*"install-pack"|\baction:\s*"buy-pack"|\baction:\s*"use-pack"/.test(queueSrc)) {
    bad.push("install or charge without Yes");
  }
  if (pack.indexOf("function yesGrok") >= 0 && pack.indexOf("applyPackDraft") >= 0) {
    const yesAt = pack.indexOf("function yesGrok");
    const yesFn = pack.slice(yesAt, yesAt + 500);
    if (yesFn.indexOf("applyPackDraft") < 0) bad.push("install or charge without Yes");
  }
  return unique(bad);
}

function applyMutant(kind, files) {
  const next = { loader: files.loader, pack: files.pack, queueSrc: files.queueSrc };
  if (kind === "Studio Queue tab gone") {
    next.pack = next.pack
      .replace('["queue", "Queue"]', '["notes", "Notes"]')
      .replace(/id=\\?"q-badge\\?"/g, 'id="q-label"')
      .replace(/id=\\?"save-queue\\?"/g, 'id="save-notes"')
      .replace(/pack\.queue/g, "pack.notes")
      .replace(/queue:/g, "notes:");
  } else if (kind === "Studio Grok without Yes/Stop") {
    next.pack = next.pack
      .replace(/id=\\?"grok-yes\\?"/g, 'id="grok-go"')
      .replace(/id=\\?"grok-stop\\?"/g, 'id="grok-dismiss"')
      .replace(/function yesGrok/g, "function autoGrok")
      .replace(/function stopGrok/g, "function skipGrok");
  } else if (kind === "queue pack bar gone") {
    next.queueSrc = next.queueSrc
      .replace(/getElementById\("pack-filters"\)/g, 'getElementById("pack-hidden")')
      .replace(/box.id = "pack-filters"/g, 'box.id = "pack-hidden"')
      .replace(/Nobody sends money from here/g, "Payments go out from here.")
      .replace(/data-pack-filter/g, "data-pack-ignore");
  } else if (kind === "color hides work") {
    next.queueSrc = next.queueSrc
      .replace('if (FILTER === "all" || FILTER === "color") return true', 'if (FILTER === "all") return true')
      .replace('if (FILTER === "color") rows = openJobs();', 'if (FILTER === "color") rows = [];');
  } else if (kind === "Vita printed on Insurance") {
    next.queueSrc = next.queueSrc.replace('if (c === "insurance") return "Insurance"', 'if (c === "insurance") return "Vita"');
  } else if (kind === "install or charge without Yes") {
    next.queueSrc = next.queueSrc + '\nfetch("/api/desks",{method:"POST",body:JSON.stringify({action:"use-pack",charged:true})});';
    next.pack = next.pack + "\ncharged: true";
  }
  return next;
}

const packFiles = { loader: dev, pack: studioPack, queueSrc: q };
const liveFaults = queuePackFaults(packFiles.loader, packFiles.pack, packFiles.queueSrc);
if (liveFaults.length) fail("queue pack behaviour drifted: " + liveFaults.join("; "));
else pass("Studio Queue, Grok Yes/Stop, and queue pack bar still hold");

const mutants = [
  "Studio Queue tab gone",
  "Studio Grok without Yes/Stop",
  "queue pack bar gone",
  "color hides work",
  "Vita printed on Insurance",
  "install or charge without Yes"
];
let caught = 0;
mutants.forEach(function (kind) {
  const next = applyMutant(kind, packFiles);
  const faults = queuePackFaults(next.loader, next.pack, next.queueSrc);
  if (faults.indexOf(kind) < 0) fail("mutant missed: " + kind + " (got " + JSON.stringify(faults) + ")");
  else { caught += 1; pass("mutant caught: " + kind); }
});
if (caught !== mutants.length) fail("mutants: " + caught + "/" + mutants.length + " caught");
else pass("mutants: " + caught + "/" + mutants.length + " caught");

if (process.exitCode) {
  console.error("check-queue-packs failed");
  process.exit(1);
}
console.log("check-queue-packs passed");

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

if (!nav.includes("desk-queue-packs.js")) fail("desk-nav.js must load desk-queue-packs.js");
else pass("nav loads queue packs");
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

["home", "consign", "fund", "land", "vita", "aia-adoption"].forEach(function (id) {
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

if (!dev.includes("Queue") || !dev.includes("q-badge")) fail("developer.js missing Queue tab");
else pass("developer Queue tab");
if (!dev.includes("pack.queue") && !dev.includes("queue:")) fail("developer.js must save pack.queue");
else pass("developer saves pack.queue");
if (!dev.includes("Ask Grok") || !dev.includes("studio-draft")) fail("Creators Studio missing Grok drafter");
else pass("Studio Ask Grok");
if (!dev.includes("grok-yes") || !dev.includes("grok-stop")) fail("Studio Grok must wait on Yes/Stop");
else pass("Studio Grok Yes/Stop");
if (!dev.includes("Grok · AIA Studio")) fail("developer.js missing Grok AIA Studio identity");
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
["Try first", "Workers decide", "Open packs", "Secure from the start"].forEach(function (bit) {
  if (!helpPage.includes(bit)) fail("help.html missing " + bit);
  else pass("help " + bit);
});
if (/White House|Action Plan/i.test(helpPage)) fail("help.html must not reprint policy");
else pass("help is desk language");
if (helpPage.includes("Grok")) fail("help.html must not leak Grok");
else pass("help has no Grok leak");

if (!dev.includes("Queue cards are the measure")) fail("Studio missing queue-as-measure copy");
else pass("Studio measures Queue cards");

if (process.exitCode) {
  console.error("check-queue-packs failed");
  process.exit(1);
}
console.log("check-queue-packs passed");

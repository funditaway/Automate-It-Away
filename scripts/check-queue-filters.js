const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

const root = path.join(__dirname, "..");
const q = fs.readFileSync(path.join(root, "desk-queue-filters.js"), "utf8");
const packs = fs.readFileSync(path.join(root, "desk-queue-packs.js"), "utf8");
const nav = fs.readFileSync(path.join(root, "desk-nav.js"), "utf8");
const help = fs.readFileSync(path.join(root, "help.html"), "utf8");

["Find work", "Find a card", "Needs you", "Mine", "Drop", "Talk", "Pipes", "Cap", "aia_queue_filter", "AIAQueueFilters", "Nobody sends money", "Show all"].forEach(function (bit) {
  if (!q.includes(bit)) fail("desk-queue-filters.js missing " + bit);
  else pass("filter " + bit);
});

if (/return \"Vita\"|>Vita</.test(q)) fail("queue filters print Vita");
else pass("filters never print Vita");

if (!q.includes("min-height:44px")) fail("chips must be 44px taps");
else pass("44px taps");

if (!packs.includes("AIAQueueFilters")) fail("desk-queue-packs.js must consult AIAQueueFilters");
else pass("packs consult filters");

if (!nav.includes("desk-queue-filters.js")) fail("desk-nav.js must load desk-queue-filters.js");
else pass("nav loads filters");

["Needs you", "Mine", "Talk", "Drop", "Pipes", "Cap"].forEach(function (bit) {
  if (!help.includes(bit)) fail("help.html missing queue filter " + bit);
  else pass("help " + bit);
});

if (process.exitCode) {
  console.error("check-queue-filters failed");
  process.exit(1);
}
console.log("check-queue-filters passed");

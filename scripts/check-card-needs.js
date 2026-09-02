const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

const hist = require(path.join(root, "api/_history"));
["needsOf", "isPriorityJob", "isDecideJob", "capCard", "missingOf"].forEach((k) => {
  if (typeof hist[k] !== "function") fail("_history missing " + k);
});
if (!process.exitCode) pass("_history exports needs + cap");

const ready = hist.needsOf({
  id: "j1",
  status: "waiting",
  title: "Oak dresser",
  draft: "List the oak dresser.",
  kind: "list",
  photoUrl: "/x.jpg"
}, { staff: false });
if (!ready.decide) fail("list card with draft+photo should be decide-ready");
if (!ready.actions.some((a) => a.id === "yes")) fail("ready card needs Yes");
if (!ready.actions.some((a) => a.id === "stop")) fail("ready card needs Stop for owner");
if (!ready.actions.some((a) => a.id === "cap")) fail("open card can go on the cap");
else pass("ready card gets Yes / Stop / Cap, not a blank row");

const miss = hist.needsOf({
  id: "j2",
  status: "waiting",
  title: "Missed call",
  kind: "call",
  outcome: "call"
});
if (miss.missing.indexOf("phone") < 0) fail("missed call without a number should need phone");
if (miss.actions.some((a) => a.id === "yes")) fail("missing-info card must not show Yes");
if (!/number|phone/i.test(miss.line)) fail("need line should name the missing number");
else pass("missed call asks for a number instead of Yes");

const out = hist.needsOf({
  id: "j3",
  status: "out",
  offDesk: true,
  awaiting: "writeback",
  title: "Sent listing"
});
if (!out.actions.some((a) => a.id === "done") || !out.actions.some((a) => a.id === "handback")) {
  fail("out card needs Done off desk + Needs a hand");
} else pass("out card asks for write-back, not Yes");

const cap = hist.capCard({
  id: "j4",
  status: "held",
  title: "Owner call",
  priority: true,
  cap: true,
  workspace: "shop"
}, { slug: "shop", biz: "Shop" });
if (!cap || cap.label !== "Cap" || cap.slug !== "shop") fail("capCard should paint an account cap row");
else pass("capCard is a pyramid row");

if (hist.isPriorityJob({ status: "shipped", priority: true })) fail("done cards leave the cap");
if (!hist.isPriorityJob({ status: "waiting", cap: true })) fail("cap flag should count");
else pass("done cards leave the cap");

const desk = fs.readFileSync(path.join(root, "desk.html"), "utf8");
["data-filter=\"cap\"", "cap-band", "Cap · orange", "cardNeeds", "Taps match what the card needs"].forEach((bit) => {
  if (!desk.includes(bit)) fail("desk.html missing " + bit);
});
if (!process.exitCode) pass("desk.html has Cap band + need taps");

const card = fs.readFileSync(path.join(root, "desk-card.js"), "utf8");
["function cardNeeds", "function pinCap", "action: \"priority\"", "cardActionHtml"].forEach((bit) => {
  if (!card.includes(bit)) fail("desk-card.js missing " + bit);
});
if (!process.exitCode) pass("desk-card.js paints need taps + Cap");

const jobs = fs.readFileSync(path.join(root, "api/jobs.js"), "utf8");
if (!jobs.includes("action === \"priority\"") || !jobs.includes("needsOf")) fail("jobs.js missing priority / needs");
else pass("jobs API pins cap cards");

const desks = fs.readFileSync(path.join(root, "api/desks.js"), "utf8");
if (!desks.includes("action === \"priority\"") || !desks.includes("capCard")) fail("desks.js missing account cap list");
else pass("desks API lists cap cards across desks");

if (process.exitCode) {
  console.error("check-card-needs failed");
  process.exit(1);
}
console.log("check-card-needs passed");

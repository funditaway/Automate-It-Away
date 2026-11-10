require("./_env-guard");
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
if (!ready.actions.some((a) => a.id === "kill")) fail("ready card needs Kill for owner");
if (!ready.actions.some((a) => a.id === "cap")) fail("open card can go on the cap");
else pass("ready card gets Yes / Stop / Cap, not a blank row");
if (/Yes sends it off|Yes\/No card|taps No/.test(ready.line || "")) fail("decide needLine still paints Send / Yes-No");
if (!/Yes \/ Stop \/ Kill stay human|Yes · Start \/ Stop stay human/.test(ready.line || "")) {
  fail("decide needLine must keep Yes / Stop human");
} else pass("decide needLine is Yes / Stop / Kill, not Yes sends");

const idle = hist.needsOf({
  id: "j-idle",
  status: "exception",
  title: "A note on the desk"
});
if (/Yes\/No card|Yes sends it off|taps No/.test(idle.line || "")) fail("idle needLine still paints Yes-No / Send");
if ((idle.line || "").indexOf("Do the next thing this card needs") < 0) fail("idle needLine must stay Do the next thing");
else pass("idle needLine does not say Yes/No card");

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

function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

function cardNeedsFaults(deskSrc, needsSrc) {
  const bad = [];
  if (deskSrc.indexOf('data-filter="cap"') < 0 || deskSrc.indexOf("cap-band") < 0 || deskSrc.indexOf("Cap · orange") < 0) {
    bad.push("cap band removed");
  }
  if (deskSrc.indexOf("cardNeeds") < 0 && needsSrc.indexOf("window.cardNeeds") < 0) {
    bad.push("cardNeeds export gone");
  }
  if (needsSrc.indexOf("window.pinCap") < 0 || (needsSrc.indexOf('action:"priority"') < 0 && needsSrc.indexOf('action: "priority"') < 0)) {
    bad.push("pinCap / priority gone");
  }
  if (needsSrc.indexOf("cardActionHtml") < 0) bad.push("cardNeeds export gone");
  if (needsSrc.indexOf("Ready. Yes · Start / Stop stay human.") < 0 && needsSrc.indexOf("Ready. Yes / Stop / Kill stay human.") < 0) {
    bad.push("needLine drops stay-human");
  }
  const startAt = needsSrc.indexOf("window.startCard=");
  const startFn = needsSrc.indexOf("function T(e,t)");
  const startSrc = startFn >= 0 ? needsSrc.slice(startFn, startFn + 280) : (startAt >= 0 ? needsSrc.slice(startAt, startAt + 400) : "");
  if (!startSrc || startSrc.indexOf("Tap Yes to approve first") < 0 || !/m\(\s*i\s*\)/.test(startSrc) && startSrc.indexOf("isCardApproved") < 0 && startSrc.indexOf("m(i)") < 0) {
    bad.push("start without Yes");
  }
  if (startSrc && /ship\(/.test(startSrc) && startSrc.indexOf("Tap Yes to approve first") < 0) {
    if (bad.indexOf("start without Yes") < 0) bad.push("start without Yes");
  }
  return bad;
}

function applyMutant(deskSrc, needsSrc, kind) {
  let desk = deskSrc, needs = needsSrc;
  if (kind === "cap band removed") {
    desk = desk.replace('data-filter="cap"', 'data-filter="all"').replace(/cap-band/g, "other-band").replace(/Cap · orange/g, "Other");
  } else if (kind === "cardNeeds export gone") {
    needs = needs.replace("window.cardNeeds=i", "window.needsFn=i").replace(/window\.cardActionHtml=B/g, "window.actionHtml=B");
  } else if (kind === "pinCap / priority gone") {
    needs = needs.replace(/action:"priority"/g, 'action:"pin"').replace("window.pinCap=async function", "window.pinOff=async function");
  } else if (kind === "needLine drops stay-human") {
    needs = needs.replace(/Yes \/ Stop \/ Kill stay human/g, "Yes sends it off").replace(/Yes · Start \/ Stop stay human/g, "Yes sends it off");
  } else if (kind === "start without Yes") {
    needs = needs.replace(
      'function T(e,t){const n=document.getElementById("banner"),i=String(e||"").replace(/[^a-zA-Z0-9_-]/g,"");m(i)?"function"==typeof ship&&ship(i,t):n&&(n.textContent="Tap Yes to approve first.")}',
      'function T(e,t){const n=document.getElementById("banner"),i=String(e||"").replace(/[^a-zA-Z0-9_-]/g,"");if("function"==typeof ship)ship(i,t)}'
    );
  } else if (kind === "missing-info shows Yes") {
    // applied on hist snapshot in the mutant runner, not these files
  }
  return { desk: desk, needs: needs };
}

const desk = read("desk.html");
const needs = read("desk-needs.js");

["data-filter=\"cap\"", "cap-band", "Cap · orange", "cardNeeds"].forEach((bit) => {
  if (!desk.includes(bit)) fail("desk.html missing " + bit);
});
if (!process.exitCode) pass("desk.html has Cap band + need taps");

if (needs.indexOf("window.cardNeeds") < 0) fail("desk-needs.js must export cardNeeds");
else pass("desk-needs.js exports cardNeeds");
if (needs.indexOf("window.pinCap") < 0) fail("desk-needs.js must export pinCap");
else pass("desk-needs.js exports pinCap");
if (needs.indexOf('action:"priority"') < 0 && needs.indexOf('action: "priority"') < 0) {
  fail("desk-needs.js must pin the cap with action priority");
} else pass("desk-needs.js pins the cap with action priority");
if (needs.indexOf("cardActionHtml") < 0) fail("desk-needs.js missing cardActionHtml");
else pass("desk-needs.js paints need taps + Cap");

const liveFaults = cardNeedsFaults(desk, needs);
if (liveFaults.length) fail("card needs behaviour drifted: " + liveFaults.join("; "));
else pass("card needs, cap pin, and Yes-then-Start still hold");

const mutants = [
  "cap band removed",
  "cardNeeds export gone",
  "pinCap / priority gone",
  "needLine drops stay-human",
  "start without Yes"
];
let caught = 0;
mutants.forEach(function (kind) {
  const next = applyMutant(desk, needs, kind);
  const faults = cardNeedsFaults(next.desk, next.needs);
  if (faults.indexOf(kind) < 0) {
    fail("mutant missed: " + kind + " (got " + JSON.stringify(faults) + ")");
  } else {
    caught += 1;
    pass("mutant caught: " + kind);
  }
});
if (caught !== mutants.length) fail("mutants: " + caught + "/" + mutants.length + " caught");
else pass("mutants: " + caught + "/" + mutants.length + " caught");

const card = read("desk-card.js");
["function openJob", ">Yes<", ">Stop<"].forEach((bit) => {
  if (!card.includes(bit)) fail("desk-card.js missing " + bit);
});
if (card.includes(">No<") || card.includes("No?")) fail("desk-card.js Open sheet still paints No as the rail");
if (!process.exitCode) pass("desk-card.js Open sheet is Yes / Stop");
const yesNo = read("ACCOUNT-YES-NO.md");
if (yesNo.indexOf("Queue Open / Stop leftover") < 0) fail("ACCOUNT-YES-NO must record the Queue Open / Stop leftover");
else pass("ACCOUNT-YES-NO records Queue Open / Stop leftover");
if (yesNo.indexOf("Open Stop leftover after that pass") < 0) fail("ACCOUNT-YES-NO must record the Open Stop needLine leftover");
else pass("ACCOUNT-YES-NO records Open Stop leftover");
const packMd = read("PACK.md");
if (packMd.indexOf("Open Stop leftover:") < 0) fail("PACK.md must record the Open Stop leftover");
else pass("PACK.md records Open Stop leftover");

const queueJs = read("desk-queue.js");
if (queueJs.includes("Yes or No.") || queueJs.includes("yes or no")) fail("desk-queue.js still paints Yes or No as the rail");
else pass("desk-queue decide fallback does not paint Yes or No");
if (queueJs.includes(">No</button>") || queueJs.includes(" · Yes/No")) fail("desk-queue.js leftover still paints No as the rail");
else pass("desk-queue leftover Stop is Stop, not No");
if (!queueJs.includes("Yes or Stop.")) fail("desk-queue.js decide fallback must keep Yes or Stop");
else pass("desk-queue decide fallback is Yes or Stop");
if (!queueJs.includes("Working. Nothing sent yet.") || !queueJs.includes("function setCardBusy") || !queueJs.includes("data-job=")) {
  fail("desk-queue.js missing Working busy-face");
} else pass("desk-queue leftover paints Working busy-face");

const jobs = read("api/jobs.js");
if (!jobs.includes("action === \"priority\"") || !jobs.includes("needsOf")) fail("jobs.js missing priority / needs");
else pass("jobs API pins cap cards");

const desks = read("api/_desks-http.js");
if (!desks.includes("action === \"priority\"") || !desks.includes("capCard")) fail("desks handler missing account cap list");
else pass("desks API lists cap cards across desks");

if (process.exitCode) {
  console.error("check-card-needs failed");
  process.exit(1);
}
console.log("check-card-needs passed");

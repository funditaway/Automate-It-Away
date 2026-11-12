require("./_env-guard");
const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const widget = read("widget.html");
const dropPage = read("drop.html");
const agent = read("drop-agent.js");
const fields = read("api/_fields.js");
const preview = read("drop-preview.js");
const app = read("drop-app.js");

if (!/get\(["']ws["']\)/.test(preview)) fail("drop-preview.js deskSlug must read ?ws=");
else pass("drop-preview honors /drop?ws=");

["widget.html", "drop.html"].forEach(function (file) {
  const src = file === "widget.html" ? widget : dropPage;
  if (src.indexOf("drop-app.js") < 0) fail(file + " must load drop-app.js");
  else pass(file + " loads drop-app.js");
});

[
  "Quick drop",
  "Put data on",
  "who-chips",
  "pane-agent",
  "implement",
  "drop-agent.js"
].forEach(function (bit) {
  if (!widget.includes(bit)) fail("widget.html missing " + bit);
  else pass("widget has " + bit);
  if (!dropPage.includes(bit)) fail("drop.html missing " + bit);
  else pass("drop.html has " + bit);
});

["family", "friend", "helper", "staff", "implementFromText"].forEach(function (bit) {
  if (!agent.includes(bit)) fail("drop-agent.js missing " + bit);
  else pass("agent has " + bit);
});

if (!/var WHO\s*=\s*\[\s*"family"\s*,\s*"friend"\s*,\s*"helper"\s*,\s*"staff"\s*\]/.test(agent)) {
  fail("drop-agent.js must still offer family, friend, helper, and staff who-chips");
} else pass("agent who-chips are family, friend, helper, staff");
const whoAt = agent.indexOf("function paintWho");
if (whoAt < 0) fail("drop-agent.js missing paintWho");
const whoEnd = agent.indexOf("function paintPreview", whoAt);
const whoFn = agent.slice(whoAt, whoEnd > whoAt ? whoEnd : whoAt + 800);
if (whoFn.indexOf("WHO") < 0) fail("paintWho must paint from the family/friend/helper/staff list");
if (whoFn.indexOf("data-who") < 0) fail("paintWho must mark each chip with data-who");
if (whoFn.indexOf("who-chips") < 0) fail("paintWho must paint #who-chips");
else pass("agent paints who-chips");

["DROP_WHO", "implementFromText", "applyImplement", "request"].forEach(function (bit) {
  if (!fields.includes(bit)) fail("api/_fields.js missing " + bit);
  else pass("fields has " + bit);
});

function sendFn(src) {
  const start = src.indexOf("async function send()");
  if (start < 0) fail("drop-app.js missing send()");
  const end = src.indexOf("function copyDropShare", start);
  return src.slice(start, end > start ? end : start + 4000);
}

function jobsFetches(sendSrc) {
  const out = [];
  let from = 0;
  const needle = 'fetch("/api/jobs"';
  while (from < sendSrc.length) {
    const at = sendSrc.indexOf(needle, from);
    if (at < 0) break;
    out.push(sendSrc.slice(at, at + 220));
    from = at + needle.length;
  }
  return out;
}

function quickFaults(appSrc) {
  const bad = [];
  const s = sendFn(appSrc);
  const fetches = jobsFetches(s);
  if (!fetches.length) bad.push("no confirmation");
  if (fetches.length > 1) {
    if (/action:\s*"start"|action:\s*"ship"|action:\s*"charge"|action:\s*"bind-ai"|action:\s*"assign"/.test(fetches.slice(1).join("\n") + "\n" + s)) {
      bad.push("ship/start on drop");
    } else {
      bad.push("double capture");
    }
  }
  if (/action:\s*"start"|action:\s*"ship"|action:\s*"charge"|action:\s*"bind-ai"|action:\s*"assign"/.test(s)) {
    if (bad.indexOf("ship/start on drop") < 0) bad.push("ship/start on drop");
  }
  if (s.indexOf('showNote(ok, "On the queue"') < 0 || s.indexOf("You still tap Yes, then Start") < 0) {
    bad.push("no confirmation");
  }
  if (!/droppedByKind:\s*whoKind/.test(s) || !/whoKind:\s*whoKind/.test(s)) {
    bad.push("wrong kind label");
  }
  if (!fetches.length && bad.indexOf("no confirmation") < 0) bad.push("no confirmation");
  return bad;
}

const live = quickFaults(app);
if (live.length) fail("drop-app.js send() lost quick-drop behaviour: " + live.join("; "));
else pass("drop-app.js send() shares droppedByKind and paints the live confirmation");

const send = sendFn(app);
if (send.indexOf("Say what you need.") < 0) fail("empty Quick drop must be blocked with Say what you need");
else pass("empty Quick drop is blocked");
if (send.indexOf("Paste the data to put on the desk.") < 0) fail("empty Put data on must be blocked");
else pass("empty Put data on is blocked");
const httpErr = /else\s*\{\s*showNote\(\s*err\s*,\s*out\.error\s*\|\|\s*"Could not send\."\s*\)/.test(send);
const netErr = /catch\s*\(\s*\w+\s*\)\s*\{\s*showNote\(\s*err\s*,\s*"Could not reach the desk\."\s*\)/.test(send);
if (!httpErr || !netErr) fail("capture errors must still paint plainly");
else pass("capture errors paint plainly");
if (send.indexOf("agent-tell") < 0 || !/tell:\s*tell/.test(send)) fail("Put data on must still send Tell AIA as tell");
else pass("Put data on can send Tell AIA");
if (!/implement:\s*agentOn\s*\?\s*implement/.test(send)) fail("implement must ride only on Put data on");
else pass("implement rides only on Put data on");

function applyMutant(src, kind) {
  let next = src;
  const oneFetch = "const r = await fetch(\"/api/jobs\", { method: \"POST\", headers: headers(), body: JSON.stringify(item) });";
  if (kind === "wrong kind label") {
    next = next.replace("droppedByKind: whoKind, whoKind: whoKind", "droppedByKind: \"staff\", whoKind: \"staff\"");
  } else if (kind === "no confirmation") {
    next = next.replace("showNote(ok, \"On the queue\"", "showNote(err, \"On the queue\"");
  } else if (kind === "double capture") {
    next = next.replace(
      oneFetch,
      oneFetch + " await fetch(\"/api/jobs\", { method: \"POST\", headers: headers(), body: JSON.stringify(item) });"
    );
  } else if (kind === "ship/start on drop") {
    next = next.replace(
      oneFetch,
      oneFetch + " await fetch(\"/api/jobs\", { method: \"POST\", headers: headers(), body: JSON.stringify({ action: \"start\" }) });"
    );
  }
  return next;
}

const mutants = [
  "wrong kind label",
  "no confirmation",
  "double capture",
  "ship/start on drop"
];
let caught = 0;
mutants.forEach(function (kind) {
  const faults = quickFaults(applyMutant(app, kind));
  if (faults.indexOf(kind) < 0) {
    console.error("mutant missed: " + kind + " (got " + JSON.stringify(faults) + ")");
    process.exitCode = 1;
  } else {
    caught++;
    pass("mutant caught: " + kind + " (" + kind + ")");
  }
});
if (caught !== mutants.length) fail("mutants: " + caught + "/" + mutants.length + " caught");
console.log("ok  mutants: " + caught + "/" + mutants.length + " caught");
console.log("check-drop-quick mutants: " + caught + "/" + mutants.length + " caught");

try {
  const api = require(path.join(root, "api/_fields"));
  const mapped = api.implementFromText(null, "Name: Sam\nPhone: 417-555-0100\nNeed a pickup Friday 3pm\nAsk: $85");
  if (!mapped.phone || mapped.phone.indexOf("417") < 0) fail("implementFromText missed phone");
  else pass("implementFromText reads a phone");
  if (mapped.amount !== 85) fail("implementFromText missed $85, got " + mapped.amount);
  else pass("implementFromText reads a dollar amount");
  const job = api.makeCapturedJob("test-desk", { fields: [], people: [] }, {
    title: "",
    notes: "Pickup Friday",
    implement: "Name: Sam\nNeed a pickup Friday 3pm\n$40",
    mode: "agent",
    droppedByKind: "family"
  });
  if (job.droppedByKind !== "family") fail("capture missed droppedByKind");
  else pass("capture stores family/friend/helper/staff");
  if (!job.custom || !job.custom.implemented) fail("agent capture did not implement");
  else pass("agent capture implements onto the card");
  if ((job.thread || []).some(function (t) { return t && t.kind === "tell"; })) {
    fail("Put data on without Tell AIA must not store kind tell");
  } else pass("Put data on without Tell AIA stays note");
  const told = api.makeCapturedJob("test-desk", { fields: [], people: [] }, {
    title: "Name: Sam",
    notes: "Name: Sam\nNeed a pickup Friday 3pm\n$40",
    tell: "Not shipped. Qualify first.",
    implement: "Name: Sam\nNeed a pickup Friday 3pm\n$40",
    mode: "agent",
    contactName: "PROBE",
    droppedByKind: "helper"
  });
  const tellRow = (told.thread || []).find(function (t) { return t && t.kind === "tell"; });
  if (!tellRow || String(tellRow.text || "").indexOf("Qualify first") < 0) {
    fail("Tell AIA must store kind tell, got " + JSON.stringify(told.thread));
  } else pass("Tell AIA stores kind tell");
  if (tellRow.from !== "PROBE") fail("Tell AIA from must be the dropper");
  else pass("Tell AIA from is the dropper");
  if ((told.thread || []).some(function (t) { return t && t.kind === "tell" && /Need a pickup/.test(t.text || ""); })) {
    fail("pasted Put data must not become kind tell");
  } else pass("pasted Put data stays off tell");
  const hist = require(path.join(root, "api/_history"));
  const item = hist.historyItem(told, { slug: "test-desk", biz: "Test" });
  if (!item || !item.thread.some(function (t) { return t.kind === "tell" && /Qualify first/.test(t.text || ""); })) {
    fail("historyItem must keep Tell AIA as tell");
  } else pass("historyItem keeps Tell AIA as tell");
} catch (e) {
  fail("fields load/test: " + e.message);
}

if (process.exitCode) {
  console.error("check-drop-quick failed");
  process.exit(1);
}
console.log("check-drop-quick passed");

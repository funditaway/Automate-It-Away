const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

const root = path.join(__dirname, "..");
const widget = fs.readFileSync(path.join(root, "widget.html"), "utf8");
const agent = fs.readFileSync(path.join(root, "drop-agent.js"), "utf8");
const fields = fs.readFileSync(path.join(root, "api/_fields.js"), "utf8");
const preview = fs.readFileSync(path.join(root, "drop-preview.js"), "utf8");
if (!/get\(["']ws["']\)/.test(preview)) fail("drop-preview.js deskSlug must read ?ws=");
else pass("drop-preview honors /drop?ws=");

[
  "Quick drop",
  "Put data on",
  "who-chips",
  "pane-agent",
  "implement",
  "droppedByKind",
  "drop-agent.js"
].forEach(function (bit) {
  if (!widget.includes(bit)) fail("widget.html missing " + bit);
  else pass("widget has " + bit);
});

["family", "friend", "helper", "staff", "implementFromText"].forEach(function (bit) {
  if (!agent.includes(bit)) fail("drop-agent.js missing " + bit);
  else pass("agent has " + bit);
});

["DROP_WHO", "implementFromText", "applyImplement", "request"].forEach(function (bit) {
  if (!fields.includes(bit)) fail("api/_fields.js missing " + bit);
  else pass("fields has " + bit);
});

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

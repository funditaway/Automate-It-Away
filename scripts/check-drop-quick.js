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

[
  "Quick request",
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
} catch (e) {
  fail("fields load/test: " + e.message);
}

if (process.exitCode) {
  console.error("check-drop-quick failed");
  process.exit(1);
}
console.log("check-drop-quick passed");

const roles = require("../api/_roles");
const { PLATFORM_HOLD, moneyHold } = require("../api/_hold");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

const owner = { role: "owner", kind: "owner", name: "James", status: "approved" };
const helper = { role: "employee", kind: "helper", name: "Lee", status: "approved" };
const grok = { role: "agent", kind: "agent", name: "Doer", crew: "Doer", status: "approved" };

if (!roles.canOverride(owner)) fail("owner must override");
else pass("owner can override");

if (roles.canOverride(helper) || roles.canDo(helper, "override") || roles.canDo(helper, "stop") || roles.canDo(helper, "money")) {
  fail("helper leaked hard taps");
} else pass("helper cannot override / stop / money");

if (roles.canOverride(grok) || roles.canDo(grok, "send") || roles.canDo(grok, "stop") || roles.canDo(grok, "money")) {
  fail("Grok leaked send/stop/money/override");
} else pass("Grok include is draft only");

const grokCan = roles.seatCanOf(grok);
if (!grokCan.include || !grokCan.draft) fail("Grok should be includable to draft");
else pass("Grok include + draft on");

if (PLATFORM_HOLD != null) fail("platform hold must not default a dollar amount, got " + PLATFORM_HOLD);
else pass("no canned platform hold amount");

if (moneyHold(null, []) != null) fail("empty rules must not invent a money wait");
else pass("empty rules do not money-wait");

const fs = require("fs");
const path = require("path");
const jobs = fs.readFileSync(path.join(__dirname, "..", "api", "jobs.js"), "utf8");
["action === \"preview\"", "action === \"override\"", "ownerCanOverride", "previewDispatch"].forEach((bit) => {
  if (!jobs.includes(bit)) fail("jobs.js missing " + bit);
});
if (!process.exitCode) pass("jobs.js has preview + owner override");

const desk = fs.readFileSync(path.join(__dirname, "..", "desk.html"), "utf8");
["Override and send", "Override and stop", "action: \"preview\"", "action: \"override\""].forEach((bit) => {
  if (!desk.includes(bit)) fail("desk.html missing " + bit);
});
if (!process.exitCode) pass("desk.html previews before owner override");

if (process.exitCode) {
  console.error("check-override failed");
  process.exit(1);
}
console.log("check-override passed");

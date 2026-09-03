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

if (PLATFORM_HOLD !== 250) fail("platform hold should be 250, got " + PLATFORM_HOLD);
else pass("platform hold is 250");

if (moneyHold(null, []) !== 250) fail("empty rules should floor at 250");
else pass("empty rules floor at platform hold");

if (process.exitCode) {
  console.error("check-override failed");
  process.exit(1);
}
console.log("check-override passed");

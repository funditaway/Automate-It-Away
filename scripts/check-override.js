const perms = require("../api/_permissions");
const roles = require("../api/_roles");

function fail(msg) { console.error("FAIL " + msg); process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }

const owner = { id: "p_own", name: "James", role: "owner", kind: "owner", status: "approved" };
const helper = { id: "p_help", name: "Lee", role: "employee", kind: "helper", status: "approved" };
const agent = { id: "p_agent", name: "Doer", role: "agent", kind: "agent", crew: "Doer", status: "approved" };

if (!roles.CAN_KEYS.includes("override") || !roles.CAN_KEYS.includes("include")) fail("keys");
else pass("keys override + include");

if (!roles.HARD_OWNER.includes("override")) fail("hard owner missing override");
else pass("override is hard-owner");

if (!roles.canOverride(owner)) fail("owner canOverride");
else pass("owner canOverride");

if (roles.canOverride(helper) || roles.canOverride(agent)) fail("helper/agent canOverride");
else pass("helper and Grok cannot override");

if (!roles.canInclude(agent) || !roles.canInclude(owner)) fail("include");
else pass("Grok include is draft");

const noTap = perms.gateOverride(owner, true, { confirm: false, reason: "Already paid cash." });
if (noTap.ok || noTap.status !== 409) fail("preview second tap");
else pass("override without second tap is 409 preview");

const ok = perms.gateOverride(owner, true, { confirm: true, reason: "Already paid cash." });
if (!ok.ok || ok.rail !== "owner-override") fail("owner pass");
else pass("owner second tap + reason is owner-override");

const grok = perms.gateOverride(agent, true, { confirm: true, reason: "Already paid cash." });
if (grok.ok) fail("grok override");
else pass("Grok never override");

if (process.exitCode) { console.error("check-override failed"); process.exit(1); }
console.log("check-override passed");
